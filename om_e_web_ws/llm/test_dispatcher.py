#!/usr/bin/env python3
"""
Dispatcher Tests
================
Run from om_e_web_ws directory:
    python -m llm.test_dispatcher

Phase 1: Unit tests (no server needed)
Phase 2: Integration tests (requires server + extension)
"""

import asyncio
import json
import sys
import os

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm.dispatcher import (
    parse_llm_response,
    validate_action,
    load_capabilities,
    get_capabilities,
    get_capability_info,
    is_internal_capability,
    dispatch,
    format_result_for_llm,
    get_capabilities_for_prompt,
)


# -----------------------------------------------------------------------------
# Phase 1: Unit Tests (No Server Required)
# -----------------------------------------------------------------------------

def test_parse_llm_response():
    """Test JSON parsing from LLM responses."""
    print("\n📋 Testing parse_llm_response()...")

    # Valid JSON - element action
    result = parse_llm_response('{"act": "a_id_5"}')
    assert result == {"act": "a_id_5"}, f"Failed: {result}"
    print("  ✅ Simple act parsed")

    # Valid JSON - capability
    result = parse_llm_response('{"cap": "ScrollDown"}')
    assert result == {"cap": "ScrollDown"}, f"Failed: {result}"
    print("  ✅ Simple cap parsed")

    # Valid JSON - message only
    result = parse_llm_response('{"msg": "Hello there"}')
    assert result == {"msg": "Hello there"}, f"Failed: {result}"
    print("  ✅ Simple msg parsed")

    # Valid JSON - combined
    result = parse_llm_response('{"act": "a_id_0", "value": "cats", "submit": true, "msg": "Searching..."}')
    assert result["act"] == "a_id_0"
    assert result["value"] == "cats"
    assert result["submit"] == True
    assert result["msg"] == "Searching..."
    print("  ✅ Combined action parsed")

    # JSON with markdown code block
    result = parse_llm_response('```json\n{"cap": "ScrollDown"}\n```')
    assert result == {"cap": "ScrollDown"}, f"Failed: {result}"
    print("  ✅ Markdown code block stripped")

    # Invalid JSON - returns error
    result = parse_llm_response('not valid json')
    assert result.get("error") == True
    assert "msg" in result
    print("  ✅ Invalid JSON returns error")

    # Whitespace handling
    result = parse_llm_response('  {"cap": "ZoomIn"}  ')
    assert result == {"cap": "ZoomIn"}, f"Failed: {result}"
    print("  ✅ Whitespace handled")

    print("✅ All parse tests passed!")


def test_validate_action():
    """Test action validation."""
    print("\n📋 Testing validate_action()...")

    # Valid actions
    valid, _ = validate_action({"act": "a_id_5"})
    assert valid, "act should be valid"
    print("  ✅ Valid act")

    valid, _ = validate_action({"cap": "ScrollDown"})
    assert valid, "cap should be valid"
    print("  ✅ Valid cap")

    valid, _ = validate_action({"msg": "Hello"})
    assert valid, "msg should be valid"
    print("  ✅ Valid msg")

    valid, _ = validate_action({"act": "a_id_0", "msg": "Clicking..."})
    assert valid, "combined should be valid"
    print("  ✅ Valid combined")

    # Invalid - empty
    valid, error = validate_action({})
    assert not valid
    assert "empty" in error.lower() or "at least one" in error.lower()
    print("  ✅ Empty rejected")

    # Invalid - wrong act format
    valid, error = validate_action({"act": "wrong_format"})
    assert not valid
    assert "a_id_" in error
    print("  ✅ Wrong act format rejected")

    # Invalid - act not string
    valid, error = validate_action({"act": 123})
    assert not valid
    print("  ✅ Non-string act rejected")

    print("✅ All validation tests passed!")


def test_load_capabilities():
    """Test capability loading from JSON files."""
    print("\n📋 Testing load_capabilities()...")

    caps = load_capabilities()

    # Should have loaded some capabilities
    assert len(caps) > 0, "No capabilities loaded"
    print(f"  ✅ Loaded {len(caps)} capabilities")

    # Check expected capabilities exist
    expected = ["ScrollDown", "ScrollUp", "ZoomIn", "OpenTab", "ListChats", "SetTheme"]
    for cap_name in expected:
        if cap_name in caps:
            print(f"  ✅ Found: {cap_name}")
        else:
            print(f"  ⚠️ Missing: {cap_name}")

    # Check structure
    if "ScrollDown" in caps:
        scroll = caps["ScrollDown"]
        assert "label" in scroll, "Missing label"
        assert "handler" in scroll, "Missing handler"
        print("  ✅ Capability structure valid")

    print("✅ Capability loading works!")


def test_capability_helpers():
    """Test capability helper functions."""
    print("\n📋 Testing capability helpers...")

    # get_capability_info
    info = get_capability_info("ScrollDown")
    if info:
        print(f"  ✅ get_capability_info('ScrollDown'): {info.get('label')}")
    else:
        print("  ⚠️ ScrollDown not found")

    # is_internal_capability
    # Chat capabilities should be internal (handler: server)
    if get_capability_info("ListChats"):
        is_internal = is_internal_capability("ListChats")
        print(f"  ✅ is_internal_capability('ListChats'): {is_internal}")

    # Browser capabilities should NOT be internal
    is_internal = is_internal_capability("ScrollDown")
    print(f"  ✅ is_internal_capability('ScrollDown'): {is_internal}")

    # get_capabilities_for_prompt
    prompt_text = get_capabilities_for_prompt()
    assert len(prompt_text) > 50, "Prompt text too short"
    print(f"  ✅ get_capabilities_for_prompt(): {len(prompt_text)} chars")

    print("✅ Helper functions work!")


def test_format_result():
    """Test result formatting for LLM context."""
    print("\n📋 Testing format_result_for_llm()...")

    # Success
    result = format_result_for_llm({"ok": True})
    assert "succeeded" in result.lower()
    print(f"  ✅ Success: '{result}'")

    # Message only
    result = format_result_for_llm({"ok": True, "type": "message_only"})
    assert "message" in result.lower()
    print(f"  ✅ Message only: '{result}'")

    # Failure
    result = format_result_for_llm({"ok": False, "error": "Not found"})
    assert "failed" in result.lower()
    assert "not found" in result.lower()
    print(f"  ✅ Failure: '{result}'")

    print("✅ Result formatting works!")


# -----------------------------------------------------------------------------
# Phase 2: Integration Tests (Requires Server)
# -----------------------------------------------------------------------------

async def test_dispatch_mock():
    """Test dispatch with mock callbacks (no real server)."""
    print("\n📋 Testing dispatch() with mocks...")

    # Track what was called
    calls = []

    async def mock_send_instruction(action_id, action_type, params):
        calls.append(("instruction", action_id, action_type, params))
        return {"ok": True, "clicked": True}

    async def mock_send_capability(action_name, params):
        calls.append(("capability", action_name, params))
        return {"ok": True, "scrolled": True}

    def mock_execute_internal(action_name, params):
        calls.append(("internal", action_name, params))
        return {"chats": []}

    # Test element action dispatch
    calls.clear()
    result = await dispatch(
        {"act": "a_id_5"},
        mock_send_instruction,
        mock_send_capability,
        mock_execute_internal
    )
    assert result["ok"] == True
    assert calls[0][0] == "instruction"
    assert calls[0][1] == "a_id_5"
    print("  ✅ Element click dispatched")

    # Test element action with value
    calls.clear()
    result = await dispatch(
        {"act": "a_id_0", "value": "cats", "submit": True},
        mock_send_instruction,
        mock_send_capability,
        mock_execute_internal
    )
    assert result["ok"] == True
    assert calls[0][2] == "setValue"  # action_type
    assert calls[0][3]["value"] == "cats"
    assert calls[0][3]["submit"] == True
    print("  ✅ Element setValue dispatched")

    # Test capability dispatch
    calls.clear()
    result = await dispatch(
        {"cap": "ScrollDown"},
        mock_send_instruction,
        mock_send_capability,
        mock_execute_internal
    )
    assert result["ok"] == True
    assert calls[0][0] == "capability"
    assert calls[0][1] == "ScrollDown"
    print("  ✅ Capability dispatched")

    # Test message only (no callbacks called)
    calls.clear()
    result = await dispatch(
        {"msg": "Just a message"},
        mock_send_instruction,
        mock_send_capability,
        mock_execute_internal
    )
    assert result["ok"] == True
    assert result["type"] == "message_only"
    assert len(calls) == 0  # No actions taken
    print("  ✅ Message only - no dispatch")

    # Test combined action + message
    calls.clear()
    result = await dispatch(
        {"cap": "ScrollDown", "msg": "Scrolling..."},
        mock_send_instruction,
        mock_send_capability,
        mock_execute_internal
    )
    assert result["ok"] == True
    assert result["msg"] == "Scrolling..."
    assert len(calls) == 1
    print("  ✅ Combined action + message")

    print("✅ All dispatch tests passed!")


# -----------------------------------------------------------------------------
# Run Tests
# -----------------------------------------------------------------------------

def run_unit_tests():
    """Run all unit tests (no server required)."""
    print("=" * 60)
    print("🧪 PHASE 1: Unit Tests (No Server Required)")
    print("=" * 60)

    test_parse_llm_response()
    test_validate_action()
    test_load_capabilities()
    test_capability_helpers()
    test_format_result()

    print("\n" + "=" * 60)
    print("✅ All Phase 1 unit tests passed!")
    print("=" * 60)


def run_dispatch_tests():
    """Run dispatch tests with mocks."""
    print("\n" + "=" * 60)
    print("🧪 PHASE 2: Dispatch Tests (Mock Callbacks)")
    print("=" * 60)

    asyncio.run(test_dispatch_mock())

    print("\n" + "=" * 60)
    print("✅ All Phase 2 dispatch tests passed!")
    print("=" * 60)


if __name__ == "__main__":
    run_unit_tests()
    run_dispatch_tests()

    print("\n" + "=" * 60)
    print("🎉 ALL TESTS PASSED!")
    print("=" * 60)
    print("\nNext: Integrate dispatcher into ws_server.py")
