"""
Om-E Capability Executor
========================
Parses LLM responses for capability calls and executes them.
Smart parsing handles multiple formats LLMs might return.
"""

import re
import json
from typing import Optional, Dict, List, Tuple


def parse_capability_calls(response: str) -> List[Dict]:
    """
    Parse LLM response for actions - RESILIENT PARSING.

    Handles multiple formats LLMs might return:
    1. JSON on its own line (preferred): {"cap": "...", "params": {...}}
    2. Single backticks: `{"cap": "..."}`
    3. Code blocks: ```json {"cap": "..."} ```
    4. Inline JSON: some text {"cap": "..."} more text
    5. Element actions: {"act": "a_id_X", "value": "...", "submit": true}

    Returns list of parsed calls with normalized structure.
    """
    calls = []
    print(f"🔍 PARSE: Input response: {response[:200]}...")

    # Strategy 1: Try entire response as JSON (pure JSON response)
    call = _try_parse_json(response.strip())
    if call:
        print(f"🔍 PARSE: Parsed as full JSON: {call}")
        normalized = _normalize_call(call)
        if normalized:
            calls.append(normalized)
            return calls

    # Strategy 2: Look for JSON on its own line (preferred format)
    for line in response.split('\n'):
        line = line.strip()
        if line.startswith('{') and line.endswith('}'):
            call = _try_parse_json(line)
            if call:
                normalized = _normalize_call(call)
                if normalized:
                    print(f"🔍 PARSE: Found JSON on own line: {normalized}")
                    calls.append(normalized)

    if calls:
        return calls

    # Strategy 3: JSON in code blocks (```json or ```)
    block_pattern = r'```(?:json|capability)?\s*\n?(.*?)\n?```'
    for match in re.findall(block_pattern, response, re.DOTALL):
        call = _try_parse_json(match.strip())
        if call:
            normalized = _normalize_call(call)
            if normalized:
                print(f"🔍 PARSE: Found JSON in code block: {normalized}")
                calls.append(normalized)

    if calls:
        return calls

    # Strategy 4: JSON wrapped in single backticks: `{...}`
    backtick_pattern = r'`(\{[^`]+\})`'
    for match in re.findall(backtick_pattern, response):
        call = _try_parse_json(match)
        if call:
            normalized = _normalize_call(call)
            if normalized:
                print(f"🔍 PARSE: Found JSON in backticks: {normalized}")
                calls.append(normalized)

    if calls:
        return calls

    # Strategy 5: Extract balanced JSON anywhere in response (handles nested objects)
    for match in re.finditer(r'\{', response):
        json_str = _extract_balanced_json(response, match.start())
        if json_str:
            call = _try_parse_json(json_str)
            if call:
                normalized = _normalize_call(call)
                if normalized:
                    print(f"🔍 PARSE: Found balanced JSON: {normalized}")
                    calls.append(normalized)
                    break  # Only take first valid match

    print(f"🔍 PARSE: Final calls count: {len(calls)}")
    return calls


def _extract_balanced_json(text: str, start: int) -> Optional[str]:
    """Extract a balanced JSON object starting from given position."""
    if start >= len(text) or text[start] != '{':
        return None

    depth = 0
    in_string = False
    escape_next = False

    for i in range(start, len(text)):
        char = text[i]

        if escape_next:
            escape_next = False
            continue

        if char == '\\' and in_string:
            escape_next = True
            continue

        if char == '"' and not escape_next:
            in_string = not in_string
            continue

        if in_string:
            continue

        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]

    return None


def _normalize_call(call: dict) -> Optional[Dict]:
    """Normalize different call formats to standard structure."""
    if not call:
        return None

    # New format: element action {"act": "a_id_X", ...}
    if "act" in call:
        return {
            "type": "element",
            "action_id": call["act"],
            "value": call.get("value"),
            "submit": call.get("submit", False),
            "raw": call
        }

    # New format: capability {"cap": "CapName", "params": {...}}
    if "cap" in call:
        return {
            "type": "capability",
            "action": call["cap"],
            "params": call.get("params", {}),
            "raw": call
        }

    # Legacy format: {"action": "CapName", "params": {...}}
    if "action" in call:
        return {
            "type": "capability",
            "action": call["action"],
            "params": call.get("params", {}),
            "raw": call
        }

    return None


def _try_parse_json(text: str) -> Optional[Dict]:
    """Safely try to parse JSON, return None on failure"""
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def has_capability_calls(response: str) -> bool:
    """
    Check if response contains actionable calls - SMART DETECTION.

    Returns True if response contains:
    - ```capability blocks
    - JSON with "act" key (element action)
    - JSON with "cap" key (capability)
    - JSON with "action" key (legacy)
    """
    # Quick check for explicit capability block
    if "```capability" in response:
        print(f"🔍 HAS_CALLS: Found ```capability block")
        return True

    # Check for new format keys in JSON-like content
    has_json = '{' in response
    has_action_key = '"act"' in response or '"cap"' in response or '"action"' in response
    print(f"🔍 HAS_CALLS: has_json={has_json}, has_action_key={has_action_key}")

    if has_json and has_action_key:
        # Verify it's actually parseable
        calls = parse_capability_calls(response)
        print(f"🔍 HAS_CALLS: Parsed {len(calls)} calls")
        return len(calls) > 0

    print(f"🔍 HAS_CALLS: No actionable calls found")
    return False


def extract_text_response(response: str) -> str:
    """Extract non-capability text from response"""
    # Remove capability blocks but keep other content
    pattern = r'```capability\s*\n.*?\n```'
    text = re.sub(pattern, '', response, flags=re.DOTALL)
    return text.strip()


def format_capability_for_display(call: Dict) -> str:
    """Format a capability call for chat display"""
    if call.get("error"):
        return f"⚠️ Parse Error: {call['error']}\nRaw: {call['raw']}"

    action = call.get("action", "Unknown")
    params = call.get("params", {})

    if params:
        params_str = json.dumps(params, indent=2)
        return f"🔧 Action: {action}\nParams: {params_str}"
    else:
        return f"🔧 Action: {action}"


def format_execution_result(action: str, result: Dict) -> str:
    """Format execution result for chat display"""
    if result.get("ok"):
        return f"✅ {action}: Success"
    else:
        error = result.get("error", "Unknown error")
        return f"❌ {action}: {error}"
