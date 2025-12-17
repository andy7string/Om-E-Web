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

# Path to capabilities (single source of truth)
CAPABILITIES_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "capabilities", "internal_capabilities.json")

# Action history (in-memory, last N actions)
ACTION_HISTORY: List[Dict] = []
MAX_HISTORY = 10

# Search context - persists until explicitly cleared
SEARCH_CONTEXT: Optional[Dict] = None  # {query, results, timestamp}


def load_capabilities() -> Dict[str, dict]:
    """Load all capabilities from internal_capabilities.json (single source of truth)"""
    try:
        if not os.path.exists(CAPABILITIES_FILE):
            print(f"[Prompt] Capabilities file not found: {CAPABILITIES_FILE}")
            return {}

        with open(CAPABILITIES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return data.get("capabilities", {})
    except Exception as e:
        print(f"[Prompt] Error loading capabilities: {e}")
        return {}


def format_capabilities_for_prompt() -> str:
    """Format capabilities as readable text for the system prompt"""
    caps = load_capabilities()
    if not caps:
        return "[No capabilities loaded]"

    lines = []

    for cap_name, cap_info in caps.items():
        label = cap_info.get("label", cap_name)
        params = cap_info.get("params", {})

        # Build example JSON
        if params:
            param_examples = {k: "..." for k in params.keys()}
            example = f'{{"cap": "{cap_name}", "params": {json.dumps(param_examples)}}}'
        else:
            example = f'{{"cap": "{cap_name}"}}'

        lines.append(f"- **{cap_name}** - {label}")
        lines.append(f"  `{example}`")

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

    # SearchChats - include results so LLM can reference chat_ids
    if "results" in result and "query" in result:
        search_results = result.get("results", [])
        if not search_results:
            return f"No chats found for '{result['query']}'"
        summaries = []
        for r in search_results[:5]:  # Limit to 5
            summaries.append(f"{r.get('title', 'Untitled')} (id: {r.get('chat_id', '?')})")
        return f"Found {len(search_results)}: " + ", ".join(summaries)

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


def set_search_context(query: str, results: List[Dict]):
    """Set search results context - persists until cleared"""
    global SEARCH_CONTEXT
    SEARCH_CONTEXT = {
        "query": query,
        "results": results,
        "timestamp": datetime.now().isoformat()
    }
    print(f"[Prompt] 🔍 Search context set: '{query}' with {len(results)} results")


def clear_search_context():
    """Clear search context"""
    global SEARCH_CONTEXT
    if SEARCH_CONTEXT:
        print(f"[Prompt] 🔍 Search context cleared")
    SEARCH_CONTEXT = None


def get_search_context_text() -> Optional[str]:
    """Format search context for prompt - returns None if no active search"""
    if not SEARCH_CONTEXT or not SEARCH_CONTEXT.get("results"):
        return None

    query = SEARCH_CONTEXT["query"]
    results = SEARCH_CONTEXT["results"]

    lines = [f"**Active Search:** \"{query}\" - {len(results)} result(s)"]
    for i, r in enumerate(results[:10], 1):  # Limit to 10
        chat_id = r.get("chat_id", "?")
        title = r.get("title", "Untitled")
        msg_count = r.get("message_count", 0)
        lines.append(f"  {i}. \"{title}\" (chat_id: `{chat_id}`, {msg_count} msgs)")

    lines.append("")
    lines.append("Use LoadChat with the chat_id to open one, or DeleteChat to delete.")
    return "\n".join(lines)


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

**🧪 NUMERIC ID SYSTEM** - Elements are shown as `[ID] Type: Label`
- Find the element you want by its label
- Use the ID number in your action JSON

**Element Types:**
- `Link:` - Clickable links, just click: `{"act": 5}`
- `Button:` - Clickable buttons, just click: `{"act": 12}`
- `Input:` - Text fields, FILL with value: `{"act": 3, "value": "your text", "submit": true}`
- `Select:` - Search boxes, FILL with value: `{"act": 7, "value": "search term", "submit": true}`

**CRITICAL: When searching or typing:**
- Find `Input:` or `Select:` elements - these need a `"value"` parameter
- `Link:` and `Button:` do NOT take values - just the ID

**Examples:**
- Page shows: `[7] Select: Search` → Use: `{"act": 7, "value": "home loans", "submit": true}`
- Page shows: `[12] Link: Gmail` → Use: `{"act": 12}`
- Page shows: `[3] Button: Login` → Use: `{"act": 3}`

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
{"act": 12}
```

```
Searching for cats...
{"act": 7, "value": "cats", "submit": true}
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
4. **USE NUMERIC IDs** - This is critical:
   - Find the element by reading its label in the page context
   - Use the `[ID]` number shown at the start of that line
   - Example: `[7] Select: Search` → use `{"act": 7, "value": "...", "submit": true}`
   - When in doubt, quote the label: "Clicking **Gmail** [12]"
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

    # Search context (if active)
    search_context = get_search_context_text()
    if search_context:
        prompt += f"""## Search Results
{search_context}

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
