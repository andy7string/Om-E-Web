"""
Om-E Prompt Builder
===================
Builds dynamic system prompts from page context + action history.
"""

import os
import json
from typing import List, Dict, Optional
from datetime import datetime

# Path to text.md
TEXT_MD_PATH = os.path.join(os.path.dirname(__file__), "..", "@site_structures", "text.md")

# Path to capabilities
CAPABILITIES_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "capabilities")

# Action history (in-memory, last N actions)
ACTION_HISTORY: List[Dict] = []
MAX_HISTORY = 10


def load_capabilities() -> Dict[str, dict]:
    """Load all capabilities from data/capabilities/*.json"""
    all_caps = {}

    try:
        # Load index to get file list
        index_path = os.path.join(CAPABILITIES_DIR, "_index.json")
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                index = json.load(f)
                files = index.get("files", [])
        else:
            # Fallback: load all json files
            files = [f for f in os.listdir(CAPABILITIES_DIR) if f.endswith('.json') and f != '_index.json']

        # Load each capability file
        for filename in files:
            filepath = os.path.join(CAPABILITIES_DIR, filename)
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    group = data.get("group", filename.replace(".json", ""))
                    caps = data.get("capabilities", {})
                    all_caps[group] = {
                        "description": data.get("description", ""),
                        "capabilities": caps
                    }
    except Exception as e:
        print(f"[Prompt] Error loading capabilities: {e}")

    return all_caps


def format_capabilities_for_prompt() -> str:
    """Format capabilities as readable text for the system prompt"""
    caps = load_capabilities()
    if not caps:
        return "[No capabilities loaded]"

    lines = []

    for group, data in caps.items():
        desc = data.get("description", "")
        capabilities = data.get("capabilities", {})

        if not capabilities:
            continue

        lines.append(f"### {group.title()} {f'- {desc}' if desc else ''}")
        lines.append("")

        for cap_name, cap_info in capabilities.items():
            label = cap_info.get("label", cap_name)
            params = cap_info.get("params", {})

            # Build example JSON
            if params:
                param_examples = {}
                for pname, pinfo in params.items():
                    if isinstance(pinfo, dict):
                        ptype = pinfo.get("type", "string")
                        if ptype == "number":
                            param_examples[pname] = 1
                        elif ptype == "boolean":
                            param_examples[pname] = True
                        else:
                            param_examples[pname] = "..."
                    else:
                        param_examples[pname] = "..."
                example = f'{{"cap": "{cap_name}", "params": {json.dumps(param_examples)}}}'
            else:
                example = f'{{"cap": "{cap_name}"}}'

            lines.append(f"- **{cap_name}** - {label}")
            lines.append(f"  `{example}`")

        lines.append("")

    return "\n".join(lines)


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

**Element Types** - IMPORTANT: Match the right element type for your action:
- `Link:` - Clickable links, just click them: `{"act": "Link:Some link"}`
- `Button:` - Clickable buttons, just click them: `{"act": "Button:Some button"}`
- `Input:` - Text fields, FILL with value: `{"act": "Input:Some input", "value": "your text", "submit": true}`
- `Select:` - Search boxes/dropdowns, FILL with value: `{"act": "Select:Some select", "value": "your search", "submit": true}`

**CRITICAL: When searching or typing:**
- Find `Select:` or `Input:` elements (they have `"value": "..."` in their JSON)
- These need the `"value"` parameter filled in with what you want to type
- `Link:` and `Button:` do NOT take values - they just click

**Examples:**
- To search Google: Find `Select: Search → {"act": "Select:Search", "value": "..."}` → Use: `{"act": "Select:Search", "value": "home loans", "submit": true}`
- To click a link: Find `Link: Gmail → {"act": "Link:Gmail"}` → Use: `{"act": "Link:Gmail"}`

## Available Capabilities

"""

    # Add dynamic capabilities
    prompt += format_capabilities_for_prompt()

    prompt += """
## OUTPUT FORMAT - CRITICAL

When you want to perform an action, put the JSON on its OWN LINE at the END of your message.

**Good examples:**
```
Sure mate, opening Google now.
{"cap": "OpenTab", "params": {"url": "https://www.google.com"}}
```

```
Let me click that for you.
{"act": "Button:Login"}
```

```
Searching for cats...
{"act": "Input:Search", "value": "cats", "submit": true}
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
4. **VERIFY IDs BEFORE ACTING** - This is critical:
   - Find the EXACT element you want by its label text
   - Copy the `Type:Label` directly from THAT line - don't guess labels
   - If searching: find `Select:` or `Input:` with the search box label
   - If clicking: find `Link:` or `Button:` with the exact text you want
   - When in doubt, quote the label back: "Clicking **Gmail** (Link:Gmail)"
5. **Tabs** - ALWAYS use tab numbers from "Current Page Context" below, NOT from earlier in conversation. Tabs can change during a session. Example: `{"cap": "SwitchTab", "params": {"tab": 2}}`

## Formatting (Markdown)
You can use markdown to make your responses look nice:
- **Bold** with `**text**`
- *Italic* with `*text*`
- `inline code` with backticks
- Code blocks with triple backticks
- Lists with `- item` or `1. item`
- Links with `[text](url)`
- Headers with `# H1`, `## H2`, `### H3`
- Blockquotes with `> quote`

Use formatting when it helps clarity - don't overdo it for simple responses.

"""

    # Recent actions
    history = get_action_history_text()
    prompt += f"""## Recent Actions
{history}

"""

    # Page context
    if include_page_context:
        page_context = load_page_context()
        prompt += f"""## Current Page Context (LIVE - USE THESE TAB NUMBERS)
**IMPORTANT: Tab numbers below are CURRENT. Ignore any tab numbers from earlier in this conversation.**

{page_context}
"""

    return prompt


def build_context_message() -> str:
    """Build a context update message (lighter than full system prompt)"""
    page_context = load_page_context()
    return f"[Page context updated]\n{page_context}"
