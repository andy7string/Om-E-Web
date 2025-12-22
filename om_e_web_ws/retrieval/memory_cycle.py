"""
Memory Cycle - Rolling memory with 400 token context budget.

Tracks actions and content separately, triggers summarization at threshold,
stores summaries in vector store for semantic retrieval.

Architecture:
┌─────────────────────────────────────────────────────────────┐
│  ACTIONS (last 5)                              ~75 tok     │
│  - Searched YouTube: cats                                   │
│  - Changed theme to Atom                                    │
├─────────────────────────────────────────────────────────────┤
│  RECENT CONTENT (token budget)                 ~150 tok    │
│  User: how did you figure that out                         │
│  Om-E: I use context and capabilities...                   │
├─────────────────────────────────────────────────────────────┤
│  MEMORY (vector retrieved)                     ~150 tok    │
│  - User interested in cats, discussed URLs                 │
└─────────────────────────────────────────────────────────────┘

Usage:
    from retrieval.memory_cycle import on_message_saved, init_context_state

    # On chat load/create
    init_context_state(chat_dict)

    # After each message append
    on_message_saved(chat_dict, message)
"""

import json
import time
from pathlib import Path
from typing import Dict, List, Optional

from .chat_context import classify_message, estimate_tokens

# Config path
CONFIG_PATH = Path(__file__).parent.parent / "data" / "llm_config.json"


def _get_context_config() -> Dict:
    """Load context settings from config."""
    try:
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH) as f:
                config = json.load(f)
            return config.get("context", {})
    except Exception:
        pass
    return {}


# ============================================================================
# CONSTANTS
# ============================================================================

# Token budgets (TIGHT 400 token budget)
CONTEXT_BUDGET = {
    'actions': 75,        # Last 5, condensed
    'recent': 150,        # Token-budgeted exchanges
    'memory': 150,        # Vector retrieved summaries
    'total': 400          # Hard cap for context
}

BATCH_THRESHOLD = 500     # Summarize every 500 tokens of content
MAX_ACTIONS = 5           # Rolling action count

# Large payload handling (defaults - overridden by config)
def _get_payload_threshold() -> int:
    return _get_context_config().get("large_payload_threshold", 500)

def _get_summary_budget() -> int:
    return _get_context_config().get("payload_summary_budget", 50)

def _get_payload_context_lines() -> int:
    return _get_context_config().get("payload_context_lines", 5)


# ============================================================================
# CONTEXT STATE MANAGEMENT
# ============================================================================

def init_context_state(chat_dict: Dict) -> Dict:
    """
    Initialize context tracking for a chat.
    Called on chat create or load.

    Adds context_state if not present:
    {
        "token_counter": 0,           # Tokens since last summary
        "last_summarized_idx": 0,     # Message index of last summary
        "recent_actions": []          # Rolling list of condensed actions
    }

    @param chat_dict: The chat dictionary to modify
    @return: The context_state dict (for convenience)
    """
    if 'context_state' not in chat_dict:
        chat_dict['context_state'] = {
            'token_counter': 0,
            'last_summarized_idx': 0,
            'recent_actions': []
        }
        print(f"[MemoryCycle] Initialized context_state")

    return chat_dict['context_state']


def get_default_context_state() -> Dict:
    """
    Get a fresh context_state dict for new chats.
    Used by create_new_chat() to include in chat schema.
    """
    return {
        'token_counter': 0,
        'last_summarized_idx': 0,
        'recent_actions': []
    }


# ============================================================================
# ACTION CONDENSING
# ============================================================================

def condense_action(msg: Dict, prev_user_content: Optional[str] = None) -> Optional[str]:
    """
    Convert an action message to a condensed one-liner for context.
    Returns None for useless messages (skip them).

    Self-describing caps (no context needed): ScrollDown, SwitchView, HideChats, etc.
    Context-needed caps: GoogleIt (query), CloseTab (url), SetTheme (theme), etc.

    @param msg: Message dict with 'role' and 'content'
    @param prev_user_content: Previous user message content (for context)
    @return: Condensed action string, or None to skip
    """
    content = msg.get('content', '').strip()
    role = msg.get('role', '')

    if not content:
        return None

    # Self-describing capabilities - no context needed
    SELF_DESCRIBING = {
        'ScrollDown', 'ScrollUp', 'ScrollBottom', 'ScrollTop',
        'SwitchView', 'HidePrompt', 'ShowPrompt', 'HideChats', 'ShowChats',
        'GoBack', 'GoForward', 'Refresh', 'NewChat', 'ClearChat',
        'ToggleSidebar', 'MinimizeWindow', 'MaximizeWindow'
    }

    # JSON action messages - extract params for useful context
    if content.startswith('{'):
        try:
            data = json.loads(content)
            if 'cap' in data:
                cap = data['cap']
                params = data.get('params', {})
                return _format_cap_with_params(cap, params, SELF_DESCRIBING)
            if 'act' in data:
                return f"Clicked element {data['act']}"
        except json.JSONDecodeError:
            pass

    # Messages ending with JSON - extract action from last line
    lines = content.split('\n')
    if len(lines) > 1:
        last_line = lines[-1].strip()
        if last_line.startswith('{'):
            try:
                data = json.loads(last_line)
                if 'cap' in data:
                    cap = data['cap']
                    params = data.get('params', {})
                    return _format_cap_with_params(cap, params, SELF_DESCRIBING)
                if 'act' in data:
                    return f"Clicked element {data['act']}"
            except json.JSONDecodeError:
                pass

    # Assistant "Executing X..." - combine with previous user intent if needed
    if role == 'assistant':
        content_lower = content.lower()
        if content_lower.startswith('executing'):
            # Extract capability name: "Executing GoogleIt..." → "GoogleIt"
            cap_match = None
            if 'Executing ' in content:
                cap_match = content.split('Executing ')[1].split('...')[0].split('.')[0].strip()

            if cap_match:
                # Self-describing - just return the cap name
                if cap_match in SELF_DESCRIBING:
                    return cap_match
                # Needs context - combine with user intent
                if prev_user_content:
                    user_intent = prev_user_content[:50]
                    return f"{cap_match}: {user_intent}"
                return cap_match
            return None
        # Skip other useless confirmations
        if any(phrase in content_lower for phrase in [
            'scrolling', 'scrolled', 'done', 'here you go', 'for you',
            'loading', 'switching', 'navigating', 'clicking', 'opening'
        ]):
            return None

    # User commands - skip, they're used as context for assistant actions
    if role == 'user':
        return None

    return None


def _format_cap_with_params(cap: str, params: Dict, self_describing: set) -> str:
    """Format capability with params, or just cap name if self-describing."""
    # Self-describing - no params needed
    if cap in self_describing:
        return cap

    # Extract useful params in priority order
    if 'query' in params:
        return f"{cap}: {params['query']}"
    if 'url' in params:
        url = params['url']
        # Strip protocol, keep domain + path hint
        if '://' in url:
            url = url.split('://')[1]
        return f"{cap}: {url[:40]}"
    if 'title' in params:
        return f"{cap}: {params['title']}"
    if 'name' in params:
        return f"{cap}: {params['name']}"
    if 'theme' in params:
        return f"{cap}: {params['theme']}"
    if 'chat' in params:
        return f"{cap}: {params['chat']}"
    if 'tab' in params:
        return f"{cap}: tab {params['tab']}"
    if 'message' in params:
        # LLMChat - truncate message
        return f"{cap}: {params['message'][:40]}..."

    # No useful params
    return cap


# ============================================================================
# MESSAGE HOOKS
# ============================================================================

def on_message_saved(chat_dict: Dict, message: Dict) -> bool:
    """
    Called after each message is saved to update context state.

    - Classifies message as ACTION or CONTENT
    - ACTION: Condenses with previous user context and adds to rolling list
    - CONTENT: Adds tokens to counter, checks threshold

    @param chat_dict: The chat dictionary (will be modified)
    @param message: The message that was just saved
    @return: True if summarization threshold was reached
    """
    # Ensure context_state exists
    state = init_context_state(chat_dict)

    # Classify the message
    msg_type = classify_message(message)

    if msg_type == 'action':
        # Find previous user message for context
        prev_user_content = None
        messages = chat_dict.get('messages', [])
        # Look backwards from end (skip current message which is last)
        for i in range(len(messages) - 2, -1, -1):
            if messages[i].get('role') == 'user':
                prev_user_content = messages[i].get('content', '')
                break

        # Condense with user context
        condensed = condense_action(message, prev_user_content)
        if condensed:
            timestamp = message.get('timestamp', time.strftime('%Y-%m-%dT%H:%M:%SZ'))
            state['recent_actions'].append({
                'text': condensed,
                'ts': timestamp
            })
            # Keep only last MAX_ACTIONS
            state['recent_actions'] = state['recent_actions'][-MAX_ACTIONS:]
            print(f"[MemoryCycle] Action: {condensed}")
    else:
        # Content message - count tokens
        content = message.get('content', '')
        tokens = estimate_tokens(content)
        state['token_counter'] += tokens
        print(f"[MemoryCycle] Content +{tokens} tok (total: {state['token_counter']})")

        # Check threshold for summarization
        if state['token_counter'] >= BATCH_THRESHOLD:
            print(f"[MemoryCycle] Threshold reached ({state['token_counter']} >= {BATCH_THRESHOLD})")
            # TODO Phase 2: trigger_summarization(chat_dict)
            return True

    return False


# ============================================================================
# CONTEXT RETRIEVAL
# ============================================================================

def get_recent_actions(chat_dict: Dict, max_actions: int = MAX_ACTIONS) -> List[Dict]:
    """
    Get recent actions from context state.

    @param chat_dict: Chat with context_state
    @param max_actions: Max actions to return
    @return: List of action dicts [{text, ts}, ...]
    """
    state = chat_dict.get('context_state', {})
    return state.get('recent_actions', [])[-max_actions:]


def format_actions_for_prompt(chat_dict: Dict, max_actions: int = MAX_ACTIONS) -> str:
    """
    Format recent actions for prompt inclusion (~75 tok budget).

    @param chat_dict: Chat with context_state
    @param max_actions: Max actions to include
    @return: Formatted actions string
    """
    actions = get_recent_actions(chat_dict, max_actions)

    if not actions:
        return ""

    lines = ["**Recent actions:**"]
    for action in actions:
        lines.append(f"- {action['text']}")

    return '\n'.join(lines)


def get_context_state(chat_dict: Dict) -> Dict:
    """
    Get the current context state for a chat.
    Returns empty dict if not initialized.
    """
    return chat_dict.get('context_state', {})


# ============================================================================
# LARGE PAYLOAD HANDLING
# ============================================================================

async def summarize_large_payload(content: str) -> str:
    """
    Summarize a large user message to fit within token budget.
    Returns condensed version preserving intent.

    @param content: The large content to summarize
    @return: Summarized version (~50 tokens)
    """
    from llm.client import LLMClient

    client = LLMClient()
    try:
        prompt = f"""Extract the KEY CONTENT from this message in 1-2 sentences.
Focus on specific details, names, terms, and entities - NOT meta-description of what the user is doing.

BAD: "User is testing the system by pasting text"
GOOD: "Contains 'quick brown fox jumps over lazy dog' and lorem ipsum text about code infrastructure"

User message:
{content[:2000]}

Key content:"""

        response = await client.chat(
            system_prompt="You are a summarizer. Be concise.",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=100
        )
        return response.strip()
    except Exception as e:
        print(f"[MemoryCycle] Summarization error: {e}")
        # Fallback: truncate with indicator
        return content[:200] + f"... [{len(content)} chars total]"
    finally:
        await client.close()


def check_large_payload(content: str) -> bool:
    """Check if content exceeds the large payload threshold."""
    return len(content) > _get_payload_threshold()


async def process_large_payload(content: str, chat_id: Optional[str] = None) -> str:
    """
    Process a large payload - summarize for prompt, store full in vector.

    @param content: The large content
    @param chat_id: Optional chat ID for storage linking
    @return: Summarized content to use in prompt
    """
    if not check_large_payload(content):
        return content

    char_count = len(content)
    print(f"[MemoryCycle] Large payload detected: {char_count} chars, summarizing...")

    # Summarize for prompt
    summary = await summarize_large_payload(content)

    # Store full content in vector for RAG retrieval
    payload_id = f"{chat_id or 'anon'}_{int(time.time())}"
    try:
        from .vector_store import VectorStore

        # Use dedicated payload vector store
        payload_store = VectorStore('payloads')
        payload_store.load()  # Load existing or start fresh

        # Add full content with metadata
        payload_store.add(
            texts=[content],
            metadata_list=[{
                'payload_id': payload_id,
                'chat_id': chat_id,
                'summary': summary,
                'char_count': char_count,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'type': 'large_payload'
            }]
        )
        payload_store.save()
        print(f"[MemoryCycle] Stored in vector: {payload_id}")
    except Exception as e:
        print(f"[MemoryCycle] Vector store error: {e}")

    return f"[User sent {char_count} chars, stored as vector:{payload_id}] {summary}"


def get_payload_context(query: str, chat_id: Optional[str] = None) -> str:
    """
    Retrieve relevant payload context for the prompt.
    Returns formatted string with up to N lines of context (from config).

    @param query: The user's current message to match against
    @param chat_id: Optional chat ID to filter results
    @return: Formatted context string or empty string
    """
    max_lines = _get_payload_context_lines()
    if max_lines <= 0:
        return ""

    try:
        from .vector_store import VectorStore

        store = VectorStore('payloads')
        if not store.load():
            return ""

        results = store.search(query, k=max_lines, threshold=0.4)
        if not results:
            return ""

        # Format results as context lines
        lines = ["[Relevant stored content:]"]
        for r in results:
            summary = r.metadata.get('summary', r.text[:100])
            lines.append(f"- {summary}")

        return '\n'.join(lines)

    except Exception as e:
        print(f"[MemoryCycle] Payload context error: {e}")
        return ""
