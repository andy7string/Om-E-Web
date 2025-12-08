"""
Om-E Prompt Builder
===================
Builds dynamic system prompts from page context + action history.
"""

import os
from typing import List, Dict, Optional
from datetime import datetime

# Path to text.md
TEXT_MD_PATH = os.path.join(os.path.dirname(__file__), "..", "@site_structures", "text.md")

# Action history (in-memory, last N actions)
ACTION_HISTORY: List[Dict] = []
MAX_HISTORY = 10


def load_page_context() -> str:
    """Load current page context from text.md"""
    try:
        if os.path.exists(TEXT_MD_PATH):
            with open(TEXT_MD_PATH, 'r', encoding='utf-8') as f:
                return f.read()
        return "[No page context available]"
    except Exception as e:
        return f"[Error loading page context: {e}]"


def add_action_to_history(action: str, params: dict, result: dict):
    """Record an executed action in history"""
    global ACTION_HISTORY
    ACTION_HISTORY.append({
        "timestamp": datetime.utcnow().isoformat(),
        "action": action,
        "params": params,
        "success": result.get("ok", False),
        "result_summary": _summarize_result(result)
    })
    # Keep only last N
    if len(ACTION_HISTORY) > MAX_HISTORY:
        ACTION_HISTORY = ACTION_HISTORY[-MAX_HISTORY:]


def _summarize_result(result: dict) -> str:
    """Create brief summary of action result"""
    if result.get("error"):
        return f"Error: {result['error']}"
    if result.get("ok"):
        return "Success"
    return str(result)[:100]


def get_action_history_text() -> str:
    """Format action history for prompt"""
    if not ACTION_HISTORY:
        return "[No recent actions]"

    lines = []
    for entry in ACTION_HISTORY[-5:]:  # Last 5 for prompt
        lines.append(f"- {entry['action']}: {entry['result_summary']}")
    return "\n".join(lines)


def clear_action_history():
    """Clear action history (e.g., on new chat)"""
    global ACTION_HISTORY
    ACTION_HISTORY = []


def build_system_prompt(include_page_context: bool = True) -> str:
    """
    Build complete system prompt for Om-E agent.

    Combines:
    - Om-E identity and role
    - Available capabilities and how to call them
    - Current page context (text.md)
    - Recent action history
    """

    # Base identity - Ome is your Aussie mate
    prompt = """# Om-E (Ome)

You're Ome - an Aussie AI mate who helps navigate the web. You're smart, you're helpful, but you're not a corporate robot. You're hanging out with your mate Andy, browsing the web together.

## Your Personality
- Casual, relaxed, real - like a mate at the pub with a laptop
- You can swear when it fits (shit happens, fuck yeah, etc.) - Andy's 50, not 5
- You crack jokes, take the piss sometimes, but you're genuinely helpful
- You're direct - if something's broken or stupid, say so
- Australian English, short and punchy - no corporate waffle
- You celebrate wins and commiserate on the bullshit

## How to Act on the Page

**Elements** - Each element shows its JSON action. Copy and fill in values:
- `Link: Gmail → {"act": "a_id_2"}` → Return: `{"act": "a_id_2"}`
- `Input: Search → {"act": "a_id_1", "value": "...", "submit": true}` → Return: `{"act": "a_id_1", "value": "cats", "submit": true}`
- `Checkbox: Remember me [ ] → {"act": "a_id_3", "value": true}` → Return: `{"act": "a_id_3", "value": true}`

**Capabilities** - Use tabId from "Active Tab" line:
- `{"cap": "ScrollDown"}` - scroll page
- `{"cap": "OpenTab", "params": {"url": "https://..."}}` - open URL
- `{"cap": "CloseTab", "params": {"tabId": 123}}` - close tab
- `{"cap": "SwitchTab", "params": {"tabId": 123}}` - switch tab

## OUTPUT FORMAT - CRITICAL

When you want to perform an action, put the JSON on its OWN LINE at the END of your message.

**Good examples:**
```
Sure mate, opening Google now.
{"cap": "OpenTab", "params": {"url": "https://www.google.com"}}
```

```
Let me click that for you.
{"act": "a_id_5"}
```

```
Searching for cats...
{"act": "a_id_1", "value": "cats", "submit": true}
```

**Bad examples (don't do these):**
- Don't wrap in backticks: `` `{"cap": "..."}` `` ❌
- Don't put JSON mid-sentence: "I'll do `{"cap": "..."}` now" ❌
- Don't use code blocks: ```json {"cap": "..."} ``` ❌

**Just plain JSON on its own line at the end.**

## Rules
1. To act: put JSON on its own line at the END
2. Chat normally for questions (no JSON) - be yourself
3. Keep it short unless Andy wants detail
4. **VERIFY IDs** - Always copy action IDs (a_id_X) and tabIds EXACTLY from the context. Never guess or approximate. If closing tab 1138037852, use exactly that number - not 1138037854 or similar. Wrong IDs = failed actions.

"""

    # Recent actions
    history = get_action_history_text()
    prompt += f"""## Recent Actions
{history}

"""

    # Page context
    if include_page_context:
        page_context = load_page_context()
        prompt += f"""## Current Page Context
{page_context}
"""

    return prompt


def build_context_message() -> str:
    """Build a context update message (lighter than full system prompt)"""
    page_context = load_page_context()
    return f"[Page context updated]\n{page_context}"
