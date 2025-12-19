"""
Test Executor Prompt (Role B)
=============================
Tests the executor_prompt.md with real LLM calls and capabilities.

Usage:
    cd om_e_web_ws/llm && python test_executor_prompt.py
"""
import asyncio
import json
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from llm.client import LLMClient
from llm.contracts import validate_decision_engine_output, DecisionType


# Load executor prompt
PROMPT_PATH = Path(__file__).parent.parent / "data" / "prompts" / "executor_prompt.md"


def load_executor_prompt() -> str:
    """Load executor prompt."""
    with open(PROMPT_PATH, 'r', encoding='utf-8') as f:
        return f.read()


def build_executor_input(intent: str, capabilities: list, elements: list = None) -> str:
    """Build the input message for the executor."""
    lines = [f"Intent: {intent}", "", "## Capabilities"]

    for cap in capabilities:
        lines.append(f"- {cap['name']}: {cap['description']} (score: {cap['score']:.2f})")

    if elements:
        lines.append("")
        lines.append("## Elements")
        for elem in elements:
            lines.append(f"- ID {elem['id']}: [{elem['type']}] {elem['label']} (score: {elem['score']:.2f})")

    return "\n".join(lines)


# Test cases: (intent, capabilities, elements, expected_decision, expected_target)
TEST_CASES = [
    # Clear matches - should return cap with target
    (
        "scroll down",
        [
            {"name": "ScrollDown", "description": "Scroll page down", "score": 0.95},
            {"name": "ScrollUp", "description": "Scroll page up", "score": 0.30},
        ],
        None,
        DecisionType.CAP,
        "ScrollDown"
    ),
    (
        "go back",
        [
            {"name": "GoBack", "description": "Go back in history", "score": 0.92},
            {"name": "GoForward", "description": "Go forward in history", "score": 0.25},
        ],
        None,
        DecisionType.CAP,
        "GoBack"
    ),
    (
        "refresh the page",
        [
            {"name": "Refresh", "description": "Reload the page", "score": 0.90},
            {"name": "ScrollTop", "description": "Go to top", "score": 0.20},
        ],
        None,
        DecisionType.CAP,
        "Refresh"
    ),

    # Ambiguous - scores within 0.10, should return options
    (
        "scroll",
        [
            {"name": "ScrollDown", "description": "Scroll page down", "score": 0.85},
            {"name": "ScrollUp", "description": "Scroll page up", "score": 0.82},
            {"name": "ScrollTop", "description": "Go to top", "score": 0.60},
        ],
        None,
        DecisionType.OPTIONS,
        None  # Multiple options expected
    ),

    # No match - should return cannot
    (
        "delete the entire internet",
        [
            {"name": "ScrollDown", "description": "Scroll page down", "score": 0.10},
            {"name": "Refresh", "description": "Reload the page", "score": 0.08},
        ],
        None,
        DecisionType.CANNOT,
        None
    ),

    # Element action
    (
        "click sign in",
        [
            {"name": "ScrollDown", "description": "Scroll page down", "score": 0.20},
        ],
        [
            {"id": "42", "type": "Button", "label": "Sign In", "score": 0.92},
            {"id": "43", "type": "Link", "label": "Register", "score": 0.30},
        ],
        DecisionType.ACT,
        "42"
    ),

    # With value - text input (high score, clear match)
    (
        "type cats in search box",
        [
            {"name": "ScrollDown", "description": "Scroll page down", "score": 0.10},
        ],
        [
            {"id": "search_box", "type": "Input", "label": "Search Box", "score": 0.95},
        ],
        DecisionType.ACT,
        "search_box"
    ),
]


async def test_executor():
    """Run executor tests."""
    client = LLMClient()
    system_prompt = load_executor_prompt()

    print("=" * 60)
    print("EXECUTOR PROMPT TEST")
    print("=" * 60)
    print(f"Prompt: {len(system_prompt)} chars")
    print("-" * 60)

    passed = 0
    failed = 0

    for intent, caps, elems, expected_decision, expected_target in TEST_CASES:
        print(f"\nIntent: \"{intent}\"")
        print(f"Expected: {expected_decision.value}" + (f" → {expected_target}" if expected_target else ""))

        # Build input
        user_input = build_executor_input(intent, caps, elems)

        try:
            # Call LLM
            response = await client.chat(
                system_prompt=system_prompt,
                messages=[{"role": "user", "content": user_input}],
                temperature=0.1,
                max_tokens=500
            )

            # Parse JSON
            try:
                # Try to extract JSON from response
                response_clean = response.strip()
                if response_clean.startswith("```"):
                    # Remove markdown code blocks
                    lines = response_clean.split("\n")
                    response_clean = "\n".join(lines[1:-1])

                data = json.loads(response_clean)
            except json.JSONDecodeError as e:
                print(f"   ❌ FAIL: Invalid JSON - {e}")
                print(f"   Raw: {response[:200]}")
                failed += 1
                continue

            # Validate against contract
            try:
                result = validate_decision_engine_output(data)
            except Exception as e:
                print(f"   ❌ FAIL: Contract validation failed - {e}")
                print(f"   Data: {data}")
                failed += 1
                continue

            # Check decision type
            if result.decision != expected_decision:
                print(f"   ❌ FAIL: Expected {expected_decision.value}, got {result.decision.value}")
                print(f"   Response: {data}")
                failed += 1
                continue

            # Check target if expected
            if expected_target and result.target != expected_target:
                print(f"   ❌ FAIL: Expected target '{expected_target}', got '{result.target}'")
                failed += 1
                continue

            # Check options structure if OPTIONS
            if result.decision == DecisionType.OPTIONS:
                if not result.options:
                    print(f"   ❌ FAIL: OPTIONS but no options array")
                    failed += 1
                    continue

                types = [opt.type for opt in result.options]
                if "custom" not in types or "cancel" not in types:
                    print(f"   ❌ FAIL: OPTIONS missing custom/cancel")
                    failed += 1
                    continue

                print(f"   ✅ PASS: OPTIONS with {len(result.options)} choices")
                for opt in result.options:
                    print(f"      - [{opt.type}] {opt.label}")
            else:
                print(f"   ✅ PASS: {result.decision.value}" +
                      (f" → {result.target}" if result.target else "") +
                      (f" (value: {result.value})" if result.value else "") +
                      (f" (reason: {result.reason})" if result.reason else ""))

            passed += 1

        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed}/{passed + failed} passed")
    print("=" * 60)

    await client.close()
    return passed, failed


if __name__ == "__main__":
    asyncio.run(test_executor())
