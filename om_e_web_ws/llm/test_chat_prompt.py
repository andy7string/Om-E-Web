"""
Test Chat Prompt (Role A)
=========================
Tests the chat_prompt.md with real LLM calls.
Validates output against contracts.py models.

Usage:
    python -m om_e_web_ws.llm.test_chat_prompt
"""
import asyncio
import json
import os
from pathlib import Path

from om_e_web_ws.llm.client import LLMClient
from om_e_web_ws.llm.contracts import validate_chat_persona_output, ChatPersonaReply, ChatPersonaHandoff


# Path to chat prompt
PROMPT_PATH = Path(__file__).parent.parent / "data" / "prompts" / "chat_prompt.md"


def load_chat_prompt() -> str:
    """Load chat_prompt.md content."""
    with open(PROMPT_PATH, 'r', encoding='utf-8') as f:
        return f.read()


def build_environment_hint(url: str, title: str, tabs: list) -> str:
    """
    Build environment context for Chat Persona.
    Mirrors the format from @site_structures/text.md
    """
    lines = []
    lines.append(f"**URL:** {url}")
    lines.append(f"**Title:** {title}")

    if tabs:
        lines.append("")
        lines.append("**Tabs:**")
        for i, tab in enumerate(tabs[:5], 1):
            tab_title = tab.get("title", "Untitled")[:40]
            marker = " -- ACTIVE TAB" if tab.get("active") else ""
            lines.append(f"- Tab {i}: \"{tab_title}\"{marker}")

    return "\n".join(lines)


def build_full_prompt(base_prompt: str, environment: str) -> str:
    """Assemble full prompt with environment injected."""
    # Insert environment after the ENVIRONMENT section header
    return base_prompt.replace(
        "ENVIRONMENT (injected at runtime)\nYou will be given the current URL, page title, and open tabs.\nUse this only to interpret references like \"here\", \"this page\", or \"that tab\".",
        f"ENVIRONMENT\n{environment}"
    )


async def test_chat_prompt():
    """Run test cases against chat prompt."""
    client = LLMClient()
    base_prompt = load_chat_prompt()

    # Mock environment context
    environment = build_environment_hint(
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title="Rick Astley - Never Gonna Give You Up - YouTube",
        tabs=[
            {"title": "YouTube", "active": True},
            {"title": "Google Search"},
            {"title": "GitHub - Om_E_Web"},
        ]
    )

    full_prompt = build_full_prompt(base_prompt, environment)

    # Test cases: (user_message, expected_handoff)
    test_cases = [
        # Conversational (expect handoff=false)
        ("What page am I on?", False),
        ("How are you?", False),
        ("What can you help me with?", False),

        # Action requests (expect handoff=true)
        ("scroll down", True),
        ("click the like button", True),
        ("go to google.com", True),
        ("open a new tab", True),
        ("search for cats", True),
    ]

    print("=" * 60)
    print("CHAT PROMPT TEST")
    print("=" * 60)
    print(f"\nEnvironment:\n{environment}\n")
    print("-" * 60)

    passed = 0
    failed = 0

    for user_msg, expect_handoff in test_cases:
        print(f"\nUser: \"{user_msg}\"")
        print(f"Expected handoff: {expect_handoff}")

        try:
            # Call LLM
            response = await client.chat(
                system_prompt=full_prompt,
                messages=[{"role": "user", "content": user_msg}],
                temperature=0.1,  # Low temp for consistent results
                max_tokens=500
            )

            # Parse JSON response
            try:
                data = json.loads(response.strip())
            except json.JSONDecodeError as e:
                print(f"FAIL: Invalid JSON - {e}")
                print(f"Raw response: {response[:200]}")
                failed += 1
                continue

            # Validate against contract
            try:
                result = validate_chat_persona_output(data)
            except Exception as e:
                print(f"FAIL: Contract validation failed - {e}")
                print(f"Data: {data}")
                failed += 1
                continue

            # Check expectation
            actual_handoff = isinstance(result, ChatPersonaHandoff)

            if actual_handoff == expect_handoff:
                print(f"PASS")
                if actual_handoff:
                    print(f"  Intent: {result.intent}")
                else:
                    print(f"  Reply: {result.reply[:80]}...")
                passed += 1
            else:
                print(f"FAIL: Expected handoff={expect_handoff}, got {actual_handoff}")
                print(f"  Response: {data}")
                failed += 1

        except Exception as e:
            print(f"ERROR: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed}/{passed + failed} passed")
    print("=" * 60)

    return passed, failed


if __name__ == "__main__":
    asyncio.run(test_chat_prompt())
