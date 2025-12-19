"""
Test Orchestrator
=================
Tests the PersonaOrchestrator with real LLM calls.

Usage:
    cd om_e_web_ws/llm && python test_orchestrator.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from llm.orchestrator import PersonaOrchestrator, OrchestratorResult
from llm.contracts import TurnState


# Mock tab data for testing
MOCK_ACTIVE_TAB = {
    "id": 1,
    "url": "https://www.youtube.com/",
    "title": "YouTube"
}

MOCK_TABS = [
    {"id": 1, "url": "https://www.youtube.com/", "title": "YouTube"},
    {"id": 2, "url": "https://www.google.com/", "title": "Google"},
]


# Test cases: (user_message, expected_action_type, expected_target_contains)
TEST_CASES = [
    # Chat-only (no handoff expected)
    ("hello", None, None),
    ("how are you", None, None),

    # Capability commands
    ("scroll down", "cap", "Scroll"),
    ("go back", "cap", "GoBack"),
    ("refresh the page", "cap", "Refresh"),

    # Ambiguous (might return options)
    ("scroll", "cap", "Scroll"),  # Could be options or cap

    # Impossible request - Role A should refuse to handoff (chat-only)
    ("delete the entire internet", None, None),
]


async def test_orchestrator():
    """Run orchestrator tests."""
    orch = PersonaOrchestrator()

    print("=" * 60)
    print("ORCHESTRATOR TEST")
    print("=" * 60)
    print()

    passed = 0
    failed = 0

    for user_message, expected_action_type, expected_target_contains in TEST_CASES:
        print(f"Message: \"{user_message}\"")
        print(f"Expected: action_type={expected_action_type}, target contains='{expected_target_contains}'")

        try:
            result = await orch.process_message(
                user_message=user_message,
                chat_id="test_chat",
                active_tab=MOCK_ACTIVE_TAB,
                tabs=MOCK_TABS
            )

            print(f"   Response: {result.response_text[:80]}...")
            print(f"   Action: type={result.action_type}, target={result.action_target}")
            print(f"   Turn state: {result.turn_state.value}")

            # Check results
            success = True

            # For chat-only, action_type should be None
            if expected_action_type is None:
                if result.action_type is not None:
                    print(f"   ❌ FAIL: Expected no action, got {result.action_type}")
                    success = False
            else:
                # Check action type
                if result.action_type != expected_action_type:
                    # OPTIONS is acceptable for ambiguous cases
                    if result.action_type == "options" and expected_action_type == "cap":
                        print(f"   ℹ️  INFO: Got options instead of cap (ambiguous)")
                    else:
                        print(f"   ❌ FAIL: Expected action_type={expected_action_type}, got {result.action_type}")
                        success = False

                # Check target contains (if specified)
                if expected_target_contains and result.action_target:
                    if expected_target_contains.lower() not in result.action_target.lower():
                        print(f"   ❌ FAIL: Expected target containing '{expected_target_contains}', got '{result.action_target}'")
                        success = False

            if success:
                print(f"   ✅ PASS")
                passed += 1
            else:
                failed += 1

        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

        print()

    print("=" * 60)
    print(f"RESULTS: {passed}/{passed + failed} passed")
    print("=" * 60)

    await orch.close()
    return passed, failed


async def test_single_message(message: str):
    """Test a single message interactively."""
    orch = PersonaOrchestrator()

    print(f"\nMessage: \"{message}\"")
    print("-" * 40)

    try:
        result = await orch.process_message(
            user_message=message,
            chat_id="test_chat",
            active_tab=MOCK_ACTIVE_TAB,
            tabs=MOCK_TABS
        )

        print(f"Response: {result.response_text}")
        print(f"Action type: {result.action_type}")
        print(f"Action target: {result.action_target}")
        print(f"Action value: {result.action_value}")
        print(f"Turn state: {result.turn_state.value}")
        print(f"Action executed: {result.action_executed}")

        if result.options:
            print("Options:")
            for opt in result.options:
                print(f"  - [{opt['type']}] {opt['label']} (target: {opt.get('target')})")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

    await orch.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Test single message from command line
        message = " ".join(sys.argv[1:])
        asyncio.run(test_single_message(message))
    else:
        # Run all tests
        asyncio.run(test_orchestrator())
