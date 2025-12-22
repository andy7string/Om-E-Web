"""
Chat Context Window - structured context for LLM prompts.

Separates ACTIONS (tiny, count-based) from CONTENT (variable, token-budgeted).
Maintains rolling summary of older messages.

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  CHAT SUMMARY (rolling)                        ~100-150 tok │
│  "Searched cats, cupra, bamboo labs. Discussed URL handling"│
├─────────────────────────────────────────────────────────────┤
│  RECENT ACTIONS (last 5-10)                    ~100-150 tok │
│  - Searched "bamboo labs" on YouTube                        │
│  - Changed theme to Atom                                    │
├─────────────────────────────────────────────────────────────┤
│  RECENT CONTENT (token budget: ~500 tok)                    │
│  User: how did you figure that out                          │
│  Om-E: I use context and capabilities to understand...      │
└─────────────────────────────────────────────────────────────┘
"""

import os
import json
import re
import time
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

CHATS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'chats')
SUMMARY_PROMPT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'prompts', 'chat_summary.md')

# Token budgets
CONTEXT_BUDGETS = {
    'summary': 150,      # Rolling chat summary
    'actions': 150,      # Last N actions (count-based, usually fits)
    'content': 500,      # Recent content (token-limited)
    'total': 800         # Max for chat context section
}

# Action limits
MAX_RECENT_ACTIONS = 10
MAX_RECENT_CONTENT = 20  # Max content messages to consider


# ============================================================================
# MESSAGE CLASSIFICATION
# ============================================================================

# Patterns that indicate ACTION messages (not content)
ACTION_PATTERNS = [
    # JSON actions in message
    r'\{"act":\s*\d+',           # {"act": 5}
    r'\{"cap":\s*"',             # {"cap": "ScrollDown"}

    # Om-E execution confirmations
    r'^executing\s',             # "Executing YouTubeIt..."
    r'^opening\s',               # "Opening YouTube for you"
    r'^closing\s',               # "Closing tab..."
    r'^switching\s',             # "Switching to tab..."
    r'^navigating\s',            # "Navigating to..."
    r'^scrolling\s',             # "Scrolling down..."
    r'^searching\s',             # "Searching for..."
    r'^clicking\s',              # "Clicking..."
    r'^loading\s',               # "Loading..."
    r'^refreshing\s',            # "Refreshing..."
    r'^going\s(back|forward)',   # "Going back..."
    r'^creating\s',              # "Creating new chat..."
    r'^deleting\s',              # "Deleting..."
    r'^renaming\s',              # "Renaming..."
    r'^hiding\s',                # "Hiding prompt..."
    r'^showing\s',               # "Showing..."
    r'^setting\s',               # "Setting theme..."
    r'^changing\s',              # "Changing to..."
]

# User nav commands (actions, not content)
USER_NAV_PATTERNS = [
    # Site navigation
    r'^open\s+(youtube|google|facebook|twitter|linkedin|reddit)',
    r'^go\s+to\s+',
    r'^close\s+(tab|youtube|google)',
    r'^take\s+me\s+to',
    # Scroll/nav
    r'^scroll\s+(down|up|to)',
    r'^go\s+(back|forward)',
    r'^refresh$',
    r'^reload$',
    r'^back\s+again',
    # Tabs
    r'^new\s+tab',
    r'^switch\s+tab',
    r'^next\s+tab',
    r'^previous\s+tab',
    # UI controls
    r'^hide\s+(prompt|chat|sidebar|that)',
    r'^show\s+(prompt|chat|sidebar)',
    r'^toggle\s+',
    r'^open\s+(chats|side)',
    r'^close\s+(chats|side)',
    # Short confirmations/commands
    r'^(yes|no|ok|done|cancel|nevermind)$',
    r'^do\s+it',
    r'^lets\s+do\s+it',
    # Theme/view
    r'^(be|become|change\s+to|switch\s+to)\s+\w+$',
    r'^make\s+(it\s+)?brand\s+new',
    r'^make\s+(it\s+)?active',
]

# Compiled patterns for performance
_action_patterns = [re.compile(p, re.IGNORECASE) for p in ACTION_PATTERNS]
_nav_patterns = [re.compile(p, re.IGNORECASE) for p in USER_NAV_PATTERNS]


def classify_message(msg: Dict) -> str:
    """
    Classify a message as 'action' or 'content'.

    Actions: JSON commands, execution confirmations, pure nav requests
    Content: Questions, explanations, substantive discussion

    Args:
        msg: Message dict with 'role' and 'content'

    Returns:
        'action' or 'content'
    """
    content = msg.get('content', '').strip()
    role = msg.get('role', '')

    if not content:
        return 'action'  # Empty = skip

    content_lower = content.lower()

    # Check for JSON action patterns
    for pattern in _action_patterns:
        if pattern.search(content):
            return 'action'

    # Check for pure JSON messages
    if content.startswith('{') and content.endswith('}'):
        try:
            data = json.loads(content)
            if 'act' in data or 'cap' in data:
                return 'action'
        except json.JSONDecodeError:
            pass

    # Messages ending with JSON action (Om-E responses)
    lines = content.split('\n')
    if len(lines) > 0:
        last_line = lines[-1].strip()
        if last_line.startswith('{') and ('"act"' in last_line or '"cap"' in last_line):
            # Short confirmation + action = action message
            text_before = '\n'.join(lines[:-1]).strip()
            if len(text_before) < 100:
                return 'action'

    # User nav commands
    if role == 'user':
        for pattern in _nav_patterns:
            if pattern.match(content_lower):
                return 'action'

    # Short Om-E confirmations
    if role == 'assistant' and len(content) < 80:
        confirmation_words = ['done', 'here you go', 'for you', 'got it', 'sure']
        if any(w in content_lower for w in confirmation_words):
            return 'action'

    return 'content'


def classify_messages(messages: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """
    Split messages into actions and content.

    Returns:
        (action_messages, content_messages)
    """
    actions = []
    content = []

    for msg in messages:
        if classify_message(msg) == 'action':
            actions.append(msg)
        else:
            content.append(msg)

    return actions, content


# ============================================================================
# TOKEN COUNTING
# ============================================================================

def estimate_tokens(text: str) -> int:
    """
    Rough token estimate (1 token ~ 4 chars for English).
    Good enough for budgeting.
    """
    return len(text) // 4


def estimate_message_tokens(msg: Dict) -> int:
    """Estimate tokens for a single message."""
    content = msg.get('content', '')
    role = msg.get('role', '')
    # Add overhead for role prefix
    return estimate_tokens(content) + estimate_tokens(role) + 5


# ============================================================================
# CONTEXT BUILDING
# ============================================================================

@dataclass
class ChatContext:
    """Structured chat context for LLM prompt."""
    summary: str                    # Rolling summary of older content
    actions: List[Dict]             # Recent action messages
    content: List[Dict]             # Recent content messages (token-budgeted)
    total_tokens: int               # Estimated total tokens
    chat_id: str
    chat_title: str

    @property
    def formatted(self) -> str:
        """Format context for prompt inclusion."""
        parts = []

        # Chat summary
        if self.summary:
            parts.append(f"**Chat Summary:** {self.summary}")

        # Recent actions (condensed format)
        if self.actions:
            parts.append("\n**Recent Actions:**")
            for msg in self.actions[-MAX_RECENT_ACTIONS:]:
                action_desc = _summarise_action(msg)
                if action_desc:
                    parts.append(f"- {action_desc}")

        # Recent content (full messages)
        if self.content:
            parts.append("\n**Recent Messages:**")
            for msg in self.content:
                role_label = "User" if msg.get('role') == 'user' else "Om-E"
                content = msg.get('content', '').strip()
                # Truncate very long content messages
                if len(content) > 500:
                    content = content[:500] + "..."
                parts.append(f"{role_label}: {content}")

        return '\n'.join(parts)


def _summarise_action(msg: Dict) -> Optional[str]:
    """
    Extract a short summary from an action message.

    "Executing YouTubeSearch..." → "YouTubeSearch"
    {"cap": "ScrollDown"} → "Scrolled down"
    """
    content = msg.get('content', '').strip()
    role = msg.get('role', '')

    # JSON action
    if content.startswith('{'):
        try:
            data = json.loads(content)
            if 'cap' in data:
                return f"Used {data['cap']}"
            if 'act' in data:
                return f"Clicked element {data['act']}"
        except:
            pass

    # Om-E execution
    if role == 'assistant':
        match = re.match(r'^(executing|opening|searching|scrolling|clicking)\s+(.+?)\.{0,3}$', content, re.IGNORECASE)
        if match:
            verb, target = match.groups()
            return f"{verb.capitalize()} {target}"

    # User nav command
    if role == 'user' and len(content) < 50:
        return f"User: {content}"

    return None


def get_chat_context(
    chat_id: str,
    token_budget: int = CONTEXT_BUDGETS['total']
) -> Optional[ChatContext]:
    """
    Build structured context for a chat, respecting token budget.

    Args:
        chat_id: Chat file ID
        token_budget: Max tokens for context section

    Returns:
        ChatContext with summary, actions, and content
    """
    chat_file = os.path.join(CHATS_DIR, f"{chat_id}.json")

    if not os.path.exists(chat_file):
        return None

    try:
        with open(chat_file, 'r', encoding='utf-8') as f:
            chat = json.load(f)
    except Exception as e:
        print(f"[ChatContext] Error loading chat {chat_id}: {e}")
        return None

    chat_title = chat.get('title', 'Untitled')
    summary = chat.get('summary', '')
    messages = chat.get('messages', [])

    if not messages:
        return ChatContext(
            summary=summary,
            actions=[],
            content=[],
            total_tokens=estimate_tokens(summary),
            chat_id=chat_id,
            chat_title=chat_title
        )

    # Split messages
    all_actions, all_content = classify_messages(messages)

    # Budget allocation
    summary_tokens = estimate_tokens(summary)
    remaining = token_budget - summary_tokens

    action_budget = min(CONTEXT_BUDGETS['actions'], remaining // 3)
    content_budget = remaining - action_budget

    # Select recent actions (count-based, usually small)
    recent_actions = all_actions[-MAX_RECENT_ACTIONS:]
    action_tokens = sum(estimate_message_tokens(m) for m in recent_actions)

    # If actions exceed budget, trim
    while recent_actions and action_tokens > action_budget:
        recent_actions.pop(0)
        action_tokens = sum(estimate_message_tokens(m) for m in recent_actions)

    # Select recent content (token-budgeted)
    recent_content = []
    content_tokens = 0

    # Work backwards from newest
    for msg in reversed(all_content[-MAX_RECENT_CONTENT:]):
        msg_tokens = estimate_message_tokens(msg)
        if content_tokens + msg_tokens <= content_budget:
            recent_content.insert(0, msg)  # Keep chronological order
            content_tokens += msg_tokens
        else:
            break  # Budget exhausted

    total_tokens = summary_tokens + action_tokens + content_tokens

    return ChatContext(
        summary=summary,
        actions=recent_actions,
        content=recent_content,
        total_tokens=total_tokens,
        chat_id=chat_id,
        chat_title=chat_title
    )


# ============================================================================
# ROLLING SUMMARY
# ============================================================================

def load_summary_prompt() -> str:
    """Load the chat summary prompt template."""
    try:
        with open(SUMMARY_PROMPT_PATH, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"[ChatContext] Error loading summary prompt: {e}")
        return ""


async def update_chat_summary(chat_id: str, new_content: List[Dict]) -> Optional[str]:
    """
    Update rolling summary with new content that's aging out.

    Called when content exceeds token budget and older messages
    need to be summarised before being dropped.

    Args:
        chat_id: Chat to update
        new_content: Messages being summarised (aging out of context)

    Returns:
        Updated summary string, or None on error
    """
    from llm.client import LLMClient

    if not new_content:
        return None

    # Load chat
    chat_file = os.path.join(CHATS_DIR, f"{chat_id}.json")
    if not os.path.exists(chat_file):
        return None

    try:
        with open(chat_file, 'r', encoding='utf-8') as f:
            chat = json.load(f)
    except Exception:
        return None

    current_summary = chat.get('summary', '')

    # Format content for summarisation
    content_text = '\n'.join([
        f"{'User' if m.get('role') == 'user' else 'Om-E'}: {m.get('content', '')}"
        for m in new_content
    ])

    # Build prompt
    prompt_template = load_summary_prompt()
    if not prompt_template:
        # Fallback prompt
        prompt_template = """Update this chat summary with new content.

Current summary: {current_summary}

New content to incorporate:
{content}

Return an updated summary (max 100 words) that captures the key topics and intents.
Focus on WHAT was discussed, not HOW (no action confirmations).
If nothing substantive, return the current summary unchanged."""

    prompt = prompt_template.format(
        current_summary=current_summary or "(none)",
        content=content_text
    )

    # Call LLM
    client = LLMClient()
    try:
        response = await client.chat(
            system_prompt=prompt,
            messages=[{"role": "user", "content": "Update the summary."}],
            temperature=0.3,
            max_tokens=200
        )

        new_summary = response.strip()

        # Save updated summary to chat
        chat['summary'] = new_summary
        with open(chat_file, 'w', encoding='utf-8') as f:
            json.dump(chat, f, indent=2)

        print(f"[ChatContext] Updated summary for '{chat.get('title', chat_id)}'")
        return new_summary

    except Exception as e:
        print(f"[ChatContext] Summary update error: {e}")
        return None
    finally:
        await client.close()


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def format_chat_context_for_prompt(chat_id: str) -> str:
    """
    Get formatted chat context ready for LLM prompt.

    Returns empty string if no context available.
    """
    context = get_chat_context(chat_id)
    if context:
        return context.formatted
    return ""


# ============================================================================
# FILE-BASED MEMORY BANK
# ============================================================================

MEMORY_FILE = os.path.join(os.path.dirname(__file__), '..', 'chat_memory.md')


def process_and_write_memory(chat_id: str) -> str:
    """
    Process chat into clean memory structure and write to file.

    Creates chat_memory.md with:
    - Chat summary (rolling)
    - Recent actions (condensed, last 10)
    - Recent content (substantive messages)

    This file is inspectable and can be included in prompts.

    Returns:
        Formatted memory content
    """
    context = get_chat_context(chat_id)
    if not context:
        return ""

    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')

    lines = [
        f"# Chat Memory Bank",
        f"",
        f"**Chat:** {context.chat_title}",
        f"**ID:** {context.chat_id}",
        f"**Generated:** {timestamp}",
        f"**Tokens:** ~{context.total_tokens}",
        f"",
        "---",
        "",
    ]

    # Summary section
    if context.summary:
        lines.extend([
            "## Summary",
            "",
            context.summary,
            "",
        ])

    # Actions section (condensed)
    if context.actions:
        lines.extend([
            "## Recent Actions (last 10)",
            "",
        ])
        for msg in context.actions[-10:]:
            action_summary = _summarise_action(msg)
            if action_summary:
                lines.append(f"- {action_summary}")
        lines.append("")

    # Content section (full messages)
    if context.content:
        lines.extend([
            "## Recent Discussion",
            "",
        ])
        for msg in context.content:
            role_label = "**User:**" if msg.get('role') == 'user' else "**Om-E:**"
            content = msg.get('content', '').strip()
            # Truncate very long messages
            if len(content) > 300:
                content = content[:297] + "..."
            lines.append(f"{role_label} {content}")
            lines.append("")

    memory_content = '\n'.join(lines)

    # Write to file
    try:
        with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
            f.write(memory_content)
        print(f"[ChatContext] Written memory bank to {MEMORY_FILE}")
    except Exception as e:
        print(f"[ChatContext] Error writing memory file: {e}")

    return memory_content


def get_memory_for_prompt(chat_id: str, write_file: bool = True) -> str:
    """
    Get processed memory content for LLM prompt.

    Args:
        chat_id: Chat to process
        write_file: Also write to chat_memory.md for inspection

    Returns:
        Clean memory content ready for prompt injection
    """
    if write_file:
        return process_and_write_memory(chat_id)

    context = get_chat_context(chat_id)
    if context:
        return context.formatted
    return ""
