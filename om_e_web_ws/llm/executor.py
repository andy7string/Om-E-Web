"""
Om-E Capability Executor
========================
Parses LLM responses for capability calls and executes them.
"""

import re
import json
from typing import Optional, Dict, List, Tuple


def parse_capability_calls(response: str) -> List[Dict]:
    """
    Parse LLM response for capability call blocks.

    Looks for:
    ```capability
    {"action": "CapabilityName", "params": {...}}
    ```

    Returns list of parsed capability calls.
    """
    calls = []

    # Pattern to match capability blocks
    pattern = r'```capability\s*\n(.*?)\n```'
    matches = re.findall(pattern, response, re.DOTALL)

    for match in matches:
        try:
            call = json.loads(match.strip())
            if "action" in call:
                calls.append({
                    "action": call.get("action"),
                    "params": call.get("params", {}),
                    "raw": match.strip()
                })
        except json.JSONDecodeError as e:
            # Include parse error for debugging
            calls.append({
                "action": None,
                "params": {},
                "raw": match.strip(),
                "error": f"JSON parse error: {e}"
            })

    return calls


def has_capability_calls(response: str) -> bool:
    """Check if response contains capability calls"""
    return "```capability" in response


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
