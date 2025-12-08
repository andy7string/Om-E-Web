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
    Parse LLM response for actions - SMART PARSING.

    Handles two formats:
    1. Element actions: {"act": "a_id_X", "value": "...", "submit": true}
    2. Capabilities: {"cap": "CapName", "params": {...}}

    Also handles legacy format with "action" key.

    Returns list of parsed calls with normalized structure.
    """
    calls = []
    print(f"🔍 PARSE: Input response: {response[:200]}...")

    # Try to find JSON objects in the response
    # First, try entire response as JSON
    call = _try_parse_json(response.strip())
    if call:
        print(f"🔍 PARSE: Parsed as full JSON: {call}")
        normalized = _normalize_call(call)
        if normalized:
            print(f"🔍 PARSE: Normalized call: {normalized}")
            calls.append(normalized)
            return calls

    # Look for JSON in code blocks
    block_pattern = r'```(?:json|capability)?\s*\n?(.*?)\n?```'
    matches = re.findall(block_pattern, response, re.DOTALL)
    for match in matches:
        call = _try_parse_json(match.strip())
        if call:
            normalized = _normalize_call(call)
            if normalized:
                calls.append(normalized)

    if calls:
        return calls

    # Find inline JSON objects with act, cap, or action keys
    json_obj_pattern = r'\{[^{}]*(?:"act"|"cap"|"action")\s*:\s*"[^"]+[^{}]*\}'
    obj_matches = re.findall(json_obj_pattern, response)
    print(f"🔍 PARSE: Found {len(obj_matches)} inline JSON matches: {obj_matches}")
    for match in obj_matches:
        call = _try_parse_json(match)
        if call:
            normalized = _normalize_call(call)
            if normalized:
                print(f"🔍 PARSE: Normalized inline call: {normalized}")
                calls.append(normalized)

    print(f"🔍 PARSE: Final calls count: {len(calls)}")
    return calls


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
