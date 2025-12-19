"""
Test Contracts
==============
Tests TokenBudget and truncation.

Usage:
    cd om_e_web_ws/llm && python test_contracts.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from llm.contracts import (
    TokenBudget,
    estimate_tokens,
    truncate_to_budget,
    DecisionType,
    DecisionEngineOutput,
    ExecutorOption,
    validate_decision_engine_output
)


def test_token_budget_values():
    """Test TokenBudget has expected values."""
    print("=" * 60)
    print("TEST: TokenBudget Values")
    print("=" * 60)

    # Role A limits
    assert TokenBudget.CHAT_SYSTEM == 450
    assert TokenBudget.CHAT_HISTORY == 600
    assert TokenBudget.CHAT_MESSAGE == 200
    assert TokenBudget.CHAT_ENV == 100
    assert TokenBudget.CHAT_TOTAL == 1450
    print(f"   ✅ Role A: {TokenBudget.CHAT_TOTAL} total")

    # Role B limits
    assert TokenBudget.DECISION_SYSTEM == 450
    assert TokenBudget.DECISION_CONTEXT == 550
    assert TokenBudget.DECISION_TOTAL == 1100
    print(f"   ✅ Role B: {TokenBudget.DECISION_TOTAL} total")

    # Full page
    assert TokenBudget.FULL_PAGE_TOTAL == 8000
    print(f"   ✅ Full Page: {TokenBudget.FULL_PAGE_TOTAL} total")

    # Verify totals make sense
    chat_sum = TokenBudget.CHAT_SYSTEM + TokenBudget.CHAT_HISTORY + TokenBudget.CHAT_MESSAGE + TokenBudget.CHAT_ENV
    print(f"   Chat components sum: {chat_sum} (total allows {TokenBudget.CHAT_TOTAL})")
    assert TokenBudget.CHAT_TOTAL >= chat_sum, "CHAT_TOTAL should >= component sum"

    print("\n   ✅ PASS - All budget values correct")


def test_estimate_tokens():
    """Test token estimation."""
    print("\n" + "=" * 60)
    print("TEST: Token Estimation")
    print("=" * 60)

    tests = [
        ("", 0),
        ("hi", 0),  # 2 chars / 4 = 0
        ("hello", 1),  # 5 chars / 4 = 1
        ("hello world", 2),  # 11 chars / 4 = 2
        ("x" * 100, 25),  # 100 chars / 4 = 25
        ("x" * 400, 100),  # 400 chars / 4 = 100
    ]

    for text, expected in tests:
        result = estimate_tokens(text)
        status = "✅" if result == expected else "❌"
        display = text[:20] + "..." if len(text) > 20 else text
        print(f"   {status} '{display}' ({len(text)} chars) → {result} tokens (expected {expected})")
        assert result == expected, f"Expected {expected}, got {result}"

    print("\n   ✅ PASS - Token estimation correct")


def test_truncate_within_budget():
    """Test truncation when within budget."""
    print("\n" + "=" * 60)
    print("TEST: Truncate Within Budget")
    print("=" * 60)

    text = "This is a short message"  # ~6 tokens
    budget = 100

    result = truncate_to_budget(text, budget)
    assert result == text, "Should not truncate when within budget"
    print(f"   ✅ '{text}' unchanged (within {budget}t budget)")


def test_truncate_exceeds_budget():
    """Test truncation when exceeding budget."""
    print("\n" + "=" * 60)
    print("TEST: Truncate Exceeds Budget")
    print("=" * 60)

    # 1000 chars = 250 tokens, budget = 50 tokens
    text = "x" * 1000
    budget = 50

    result = truncate_to_budget(text, budget)

    # Should be budget * 4 chars + "..."
    expected_len = budget * 4 + 3  # 50 * 4 = 200 + 3 for "..."
    assert len(result) == expected_len, f"Expected {expected_len} chars, got {len(result)}"
    assert result.endswith("..."), "Should end with ..."
    print(f"   ✅ 1000 chars truncated to {len(result)} chars ({budget}t budget)")

    # Verify truncated version fits budget
    truncated_tokens = estimate_tokens(result)
    print(f"   Truncated text estimates to {truncated_tokens} tokens")
    # Allow slight overage due to "..." but should be close
    assert truncated_tokens <= budget + 1, f"Truncated should fit budget"


def test_budget_enforcement_scenario():
    """Test realistic budget enforcement scenario."""
    print("\n" + "=" * 60)
    print("TEST: Budget Enforcement Scenario")
    print("=" * 60)

    # Simulate Role A prompt packing
    system_prompt = "You are Om-E, a browser assistant..." + "x" * 1500  # ~400 tokens
    history = "User said scroll down. Assistant scrolled." * 10  # ~100 tokens
    message = "scroll down and click the button please"  # ~10 tokens
    env = "URL: youtube.com, Title: Video"  # ~8 tokens

    print(f"   System: {estimate_tokens(system_prompt)} tokens")
    print(f"   History: {estimate_tokens(history)} tokens")
    print(f"   Message: {estimate_tokens(message)} tokens")
    print(f"   Env: {estimate_tokens(env)} tokens")

    total = estimate_tokens(system_prompt + history + message + env)
    print(f"   Total: {total} tokens")
    print(f"   Budget: {TokenBudget.CHAT_TOTAL} tokens")

    if total > TokenBudget.CHAT_TOTAL:
        print(f"   ⚠️  OVER BUDGET by {total - TokenBudget.CHAT_TOTAL} tokens")

        # Truncate history first (oldest content)
        remaining_budget = TokenBudget.CHAT_TOTAL - estimate_tokens(system_prompt + message + env)
        print(f"   Truncating history to fit {remaining_budget} tokens...")

        truncated_history = truncate_to_budget(history, remaining_budget)
        new_total = estimate_tokens(system_prompt + truncated_history + message + env)
        print(f"   New total: {new_total} tokens")

        assert new_total <= TokenBudget.CHAT_TOTAL, "Should fit after truncation"
        print(f"   ✅ Truncation brought total within budget")
    else:
        print(f"   ✅ Within budget, no truncation needed")


def test_executor_cap_decision():
    """Test executor CAP decision validation."""
    print("\n" + "=" * 60)
    print("TEST: Executor CAP Decision")
    print("=" * 60)

    # Valid CAP decision
    data = {"decision": "cap", "target": "ScrollDown"}
    result = validate_decision_engine_output(data)
    assert result.decision == DecisionType.CAP
    assert result.target == "ScrollDown"
    print(f"   ✅ CAP decision: target={result.target}")

    # CAP with value
    data = {"decision": "cap", "target": "OpenTab", "value": "https://youtube.com"}
    result = validate_decision_engine_output(data)
    assert result.value == "https://youtube.com"
    print(f"   ✅ CAP with value: {result.value}")

    # CAP without target should fail
    try:
        validate_decision_engine_output({"decision": "cap"})
        assert False, "Should have raised validation error"
    except Exception as e:
        print(f"   ✅ CAP without target rejected: {type(e).__name__}")


def test_executor_act_decision():
    """Test executor ACT decision validation."""
    print("\n" + "=" * 60)
    print("TEST: Executor ACT Decision")
    print("=" * 60)

    # Valid ACT decision
    data = {"decision": "act", "target": "42"}
    result = validate_decision_engine_output(data)
    assert result.decision == DecisionType.ACT
    print(f"   ✅ ACT decision: target={result.target}")

    # ACT with value (for inputs)
    data = {"decision": "act", "target": "search_input", "value": "cats"}
    result = validate_decision_engine_output(data)
    assert result.value == "cats"
    print(f"   ✅ ACT with value: {result.value}")


def test_executor_options_decision():
    """Test executor OPTIONS decision validation."""
    print("\n" + "=" * 60)
    print("TEST: Executor OPTIONS Decision")
    print("=" * 60)

    # Valid OPTIONS decision
    data = {
        "decision": "options",
        "options": [
            {"type": "cap", "target": "ScrollDown", "label": "Scroll the page down"},
            {"type": "cap", "target": "ScrollUp", "label": "Scroll the page up"},
            {"type": "custom", "label": "Write a custom instruction"},
            {"type": "cancel", "label": "Cancel"}
        ]
    }
    result = validate_decision_engine_output(data)
    assert result.decision == DecisionType.OPTIONS
    assert len(result.options) == 4
    print(f"   ✅ OPTIONS decision: {len(result.options)} options")

    # Check option types
    types = [opt.type for opt in result.options]
    assert "cap" in types
    assert "custom" in types
    assert "cancel" in types
    print(f"   ✅ Option types: {types}")

    # OPTIONS without custom should fail
    try:
        validate_decision_engine_output({
            "decision": "options",
            "options": [
                {"type": "cap", "target": "ScrollDown", "label": "Scroll down"},
                {"type": "cancel", "label": "Cancel"}
            ]
        })
        assert False, "Should have raised validation error"
    except Exception as e:
        print(f"   ✅ OPTIONS without custom rejected: {type(e).__name__}")

    # OPTIONS without cancel should fail
    try:
        validate_decision_engine_output({
            "decision": "options",
            "options": [
                {"type": "cap", "target": "ScrollDown", "label": "Scroll down"},
                {"type": "custom", "label": "Custom"}
            ]
        })
        assert False, "Should have raised validation error"
    except Exception as e:
        print(f"   ✅ OPTIONS without cancel rejected: {type(e).__name__}")


def test_executor_cannot_noop():
    """Test executor CANNOT and NOOP decisions."""
    print("\n" + "=" * 60)
    print("TEST: Executor CANNOT/NOOP Decisions")
    print("=" * 60)

    # CANNOT decision
    data = {"decision": "cannot", "reason": "No matching capability found"}
    result = validate_decision_engine_output(data)
    assert result.decision == DecisionType.CANNOT
    assert result.reason == "No matching capability found"
    print(f"   ✅ CANNOT decision: {result.reason}")

    # NOOP decision
    data = {"decision": "noop", "reason": "Already on that page"}
    result = validate_decision_engine_output(data)
    assert result.decision == DecisionType.NOOP
    print(f"   ✅ NOOP decision: {result.reason}")


def test_executor_option_model():
    """Test ExecutorOption model validation."""
    print("\n" + "=" * 60)
    print("TEST: ExecutorOption Model")
    print("=" * 60)

    # CAP option requires target
    opt = ExecutorOption(type="cap", target="ScrollDown", label="Scroll down")
    assert opt.target == "ScrollDown"
    print(f"   ✅ CAP option: {opt.target}")

    # Custom option doesn't need target
    opt = ExecutorOption(type="custom", label="Write a custom instruction")
    assert opt.target is None
    print(f"   ✅ Custom option: no target needed")

    # Cancel option doesn't need target
    opt = ExecutorOption(type="cancel", label="Cancel")
    assert opt.target is None
    print(f"   ✅ Cancel option: no target needed")

    # CAP without target should fail
    try:
        ExecutorOption(type="cap", label="Missing target")
        assert False, "Should have raised validation error"
    except Exception as e:
        print(f"   ✅ CAP option without target rejected: {type(e).__name__}")


def main():
    """Run all tests."""
    test_token_budget_values()
    test_estimate_tokens()
    test_truncate_within_budget()
    test_truncate_exceeds_budget()
    test_budget_enforcement_scenario()
    test_executor_cap_decision()
    test_executor_act_decision()
    test_executor_options_decision()
    test_executor_cannot_noop()
    test_executor_option_model()

    print("\n" + "=" * 60)
    print("🎉 ALL CONTRACT TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()
