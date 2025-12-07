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

    # Base identity
    prompt = """# Om-E Browser Assistant

You are Om-E, an AI assistant integrated into a web browser extension. You help users navigate, interact with, and understand web pages.

## Your Capabilities

You can execute browser actions by responding with a capability call in this exact format:
```capability
{"action": "CapabilityName", "params": {"key": "value"}}
```

For example, to scroll down:
```capability
{"action": "ScrollDown", "params": {}}
```

To click a button with action ID:
```capability
{"action": "click", "params": {"actionId": "a_id_5"}}
```

To type in an input field:
```capability
{"action": "setValue", "params": {"actionId": "a_id_49", "value": "search text", "submit": true}}
```

## Guidelines
- Be helpful and concise
- When asked to perform actions, use capability calls
- Reference elements by their action IDs (a_id_X) shown in the page context
- If you need more information, ask the user
- Use Australian English spelling

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
