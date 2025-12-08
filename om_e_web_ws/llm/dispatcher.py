"""
LLM Action Dispatcher
=====================
Routes LLM JSON responses to the existing execution pipeline.
This is the bridge between LLM output and ws_server.py handlers.

Action Types:
    act → Element actions (click, setValue, navigate)
    cap → Capabilities (scroll, zoom, tabs, site-specific)
    msg → Message only (no action needed)

Usage:
    from llm.dispatcher import dispatch, parse_llm_response

    # Parse LLM response
    action = parse_llm_response('{"act": "a_id_5", "msg": "Clicking..."}')

    # Dispatch through existing pipeline
    result = await dispatch(action, send_to_extension, execute_internal)
"""

import json
import os
from typing import Any, Callable, Awaitable, Optional

# -----------------------------------------------------------------------------
# Element Registry Resolver (set by ws_server.py to avoid circular imports)
# -----------------------------------------------------------------------------

_element_resolver: Optional[Callable[[str], Optional[dict]]] = None


def set_element_resolver(resolver: Callable[[str], Optional[dict]]):
    """Set the element resolver function (called by ws_server.py at startup)."""
    global _element_resolver
    _element_resolver = resolver


def resolve_action_type(action_id: str, has_value: bool = False) -> str:
    """
    Auto-resolve action type from element registry.

    Resolution rules (from content.js getElementType):
        Link     → navigate
        Button   → click
        Input    → setValue (covers textarea, contenteditable, text inputs)
        Select   → select
        Option   → click (selecting an option)
        Checkbox → toggle
        Radio    → toggle
        Switch   → toggle
        Slider   → setValue

    Falls back to: setValue if value provided, else click
    """
    if _element_resolver:
        el_info = _element_resolver(action_id)
        if el_info:
            el_type = el_info.get("type", "").lower()
            if el_type == "link":
                return "navigate"
            elif el_type == "button":
                return "click"
            elif el_type == "input":
                return "setValue" if has_value else "click"
            elif el_type == "select":
                return "setValue" if has_value else "select"
            elif el_type == "option":
                return "click"
            elif el_type in ("checkbox", "radio", "switch"):
                return "toggle"
            elif el_type == "slider":
                return "setValue"

    # Fallback: value means setValue, no value means click
    return "setValue" if has_value else "click"


# -----------------------------------------------------------------------------
# Capability Loading
# -----------------------------------------------------------------------------

CAPABILITIES_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "capabilities")


def load_capabilities() -> dict:
    """
    Load all capabilities from data/capabilities/*.json files.

    Returns:
        dict mapping capability names to their definitions
    """
    all_caps = {}

    if not os.path.exists(CAPABILITIES_DIR):
        print(f"⚠️ Capabilities directory not found: {CAPABILITIES_DIR}")
        return all_caps

    # Load index to find files
    index_path = os.path.join(CAPABILITIES_DIR, "_index.json")
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            index = json.load(f)
            files = index.get("files", [])
    else:
        # Fallback: load all .json files
        files = [f for f in os.listdir(CAPABILITIES_DIR) if f.endswith('.json') and f != '_index.json']

    for filename in files:
        filepath = os.path.join(CAPABILITIES_DIR, filename)
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    caps = data.get("capabilities", {})
                    for name, definition in caps.items():
                        definition["_group"] = data.get("group", "unknown")
                        all_caps[name] = definition
            except (json.JSONDecodeError, IOError) as e:
                print(f"⚠️ Error loading {filename}: {e}")

    print(f"📋 Loaded {len(all_caps)} capabilities from {len(files)} files")
    return all_caps


# Cache capabilities on first load
_CAPABILITIES_CACHE: Optional[dict] = None


def get_capabilities() -> dict:
    """Get cached capabilities (loads once)."""
    global _CAPABILITIES_CACHE
    if _CAPABILITIES_CACHE is None:
        _CAPABILITIES_CACHE = load_capabilities()
    return _CAPABILITIES_CACHE


def get_capability_info(name: str) -> Optional[dict]:
    """Get info about a specific capability."""
    return get_capabilities().get(name)


def is_internal_capability(name: str) -> bool:
    """Check if a capability is handled server-side."""
    cap = get_capability_info(name)
    if cap:
        return cap.get("handler") == "server"
    return False


# -----------------------------------------------------------------------------
# Response Parsing
# -----------------------------------------------------------------------------

def parse_llm_response(response_text: str) -> dict:
    """
    Parse LLM response text into structured action dict.

    Args:
        response_text: Raw text from LLM (should be JSON)

    Returns:
        Parsed action dict with keys: act, cap, msg, params, etc.
        On parse error, returns {"msg": <error message>, "error": True}
    """
    # Clean up response - remove markdown code blocks if present
    text = response_text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    # Try to parse as JSON
    try:
        action = json.loads(text)
        if not isinstance(action, dict):
            return {"msg": f"Expected JSON object, got: {type(action).__name__}", "error": True}
        return action
    except json.JSONDecodeError as e:
        # If it's not JSON, treat the whole thing as a message
        # This handles cases where LLM just responds with text
        return {"msg": response_text.strip(), "error": True, "parse_error": str(e)}


def validate_action(action: dict) -> tuple[bool, str]:
    """
    Validate that an action has required fields.

    Returns:
        (is_valid, error_message)
    """
    if not action:
        return False, "Empty action"

    # Must have at least one of: act, cap, msg
    has_act = "act" in action
    has_cap = "cap" in action
    has_msg = "msg" in action

    if not (has_act or has_cap or has_msg):
        return False, "Action must have at least one of: act, cap, msg"

    # Validate act format
    if has_act:
        act_id = action["act"]
        if not isinstance(act_id, str):
            return False, f"act must be string, got: {type(act_id).__name__}"
        if not act_id.startswith("a_id_"):
            return False, f"act must start with 'a_id_', got: {act_id}"

    # Validate cap format
    if has_cap:
        cap_name = action["cap"]
        if not isinstance(cap_name, str):
            return False, f"cap must be string, got: {type(cap_name).__name__}"

    return True, ""


# -----------------------------------------------------------------------------
# Action Dispatch
# -----------------------------------------------------------------------------

async def dispatch(
    action: dict,
    send_instruction: Callable[[str, str, dict], Awaitable[dict]],
    send_capability: Callable[[str, dict], Awaitable[dict]],
    execute_internal: Optional[Callable[[str, dict], dict]] = None
) -> dict:
    """
    Dispatch a parsed LLM action through the appropriate pipeline.

    Args:
        action: Parsed action dict from parse_llm_response()
        send_instruction: Callback for element actions → extension
                         async def(action_id, action_type, params) -> result
        send_capability: Callback for capability actions → extension
                        async def(action_name, params) -> result
        execute_internal: Optional callback for internal capabilities
                         def(action_name, params) -> result

    Returns:
        Result dict with ok, result/error, and optional msg
    """
    # Check for parse error
    if action.get("error"):
        return {
            "ok": False,
            "error": action.get("parse_error", "Parse error"),
            "msg": action.get("msg", "Failed to parse LLM response")
        }

    # Validate action
    is_valid, error = validate_action(action)
    if not is_valid:
        return {"ok": False, "error": error}

    # Extract optional message
    user_msg = action.get("msg")
    result = {"ok": True}

    # Route based on action type
    try:
        # Element action
        if "act" in action:
            action_id = action["act"]
            value = action.get("value")
            submit = action.get("submit", False)

            # Build params
            params = {}
            if value is not None:
                params["value"] = value
            if submit:
                params["submit"] = True

            # 🎯 Auto-resolve action type from element registry
            action_type = resolve_action_type(action_id, has_value=(value is not None))

            print(f"🎯 Dispatching act: {action_id} ({action_type})")
            result = await send_instruction(action_id, action_type, params)

        # Capability action
        elif "cap" in action:
            cap_name = action["cap"]
            cap_params = action.get("params", {})

            print(f"🎯 Dispatching cap: {cap_name}")

            # Check if internal capability
            if execute_internal and is_internal_capability(cap_name):
                result = execute_internal(cap_name, cap_params)
                result = {"ok": True, "result": result}
            else:
                result = await send_capability(cap_name, cap_params)

        # Message only - route through AppendAssistantMessage capability
        elif "msg" in action:
            msg_content = action["msg"]
            print(f"🎯 Dispatching msg as AppendAssistantMessage")

            # Route through capability system (creates chat + displays in HUD)
            if execute_internal and is_internal_capability("AppendAssistantMessage"):
                result = execute_internal("AppendAssistantMessage", {"content": msg_content})
                result = {"ok": True, "result": result}
            else:
                # Fallback: send as capability to extension
                result = await send_capability("AppendAssistantMessage", {"content": msg_content})

            # Mark as message type for caller
            result["type"] = "message"

    except Exception as e:
        print(f"❌ Dispatch error: {e}")
        result = {"ok": False, "error": str(e)}

    # Attach user message if present
    if user_msg:
        result["msg"] = user_msg

    return result


# -----------------------------------------------------------------------------
# Convenience Functions
# -----------------------------------------------------------------------------

def format_result_for_llm(result: dict) -> str:
    """
    Format a dispatch result for feeding back to LLM context.

    Args:
        result: Result dict from dispatch()

    Returns:
        Human-readable string for LLM context
    """
    if result.get("ok"):
        if result.get("type") == "message_only":
            return "Message sent to user."
        elif result.get("result"):
            return f"Action succeeded: {json.dumps(result['result'])}"
        else:
            return "Action succeeded."
    else:
        return f"Action failed: {result.get('error', 'Unknown error')}"


def get_capabilities_for_prompt() -> str:
    """
    Get formatted capabilities list for injection into system prompt.

    Returns:
        Markdown-formatted list of available capabilities
    """
    caps = get_capabilities()
    if not caps:
        return "No capabilities loaded."

    lines = ["## Available Capabilities\n"]

    # Group by category
    by_group: dict[str, list] = {}
    for name, info in caps.items():
        group = info.get("_group", "other")
        if group not in by_group:
            by_group[group] = []
        by_group[group].append((name, info))

    for group, items in sorted(by_group.items()):
        lines.append(f"\n### {group.title()}\n")
        for name, info in sorted(items):
            label = info.get("label", name)
            params = info.get("params", {})
            if params:
                param_names = ", ".join(params.keys())
                lines.append(f"- `{name}` ({param_names}) - {label}")
            else:
                lines.append(f"- `{name}` - {label}")

    return "\n".join(lines)
