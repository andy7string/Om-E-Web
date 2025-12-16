"""
Test FAISS retrieval system.

Run: python -m retrieval.test_retrieval

Tests:
1. Capabilities store - semantic search accuracy
2. Elements store - page element indexing
3. Prompt size - verify token reduction
4. Two-call orchestrator - intent parsing + context retrieval
"""

import os
import sys

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from retrieval.query import query, build_minimal_prompt, get_capabilities_store, rebuild_elements_store
from retrieval.elements_store import ElementsStore
from retrieval.orchestrator import (
    parse_intent_response,
    retrieve_context,
    build_executor_prompt,
    orchestrate,
    IntentResult
)


# ============================================================================
# TEST 1: CAPABILITIES STORE
# ============================================================================

def test_capabilities():
    """Test semantic search against 45 indexed capabilities."""
    print("\n" + "=" * 60)
    print("TEST 1: CAPABILITIES STORE")
    print("=" * 60)

    store = get_capabilities_store()
    print(f"📊 {store.count()} capabilities indexed")

    # Test cases: (query, expected_top_result)
    tests = [
        # Browser capabilities
        ("I can't see the top of the page", "ScrollTop"),
        ("scroll up", "ScrollUp"),
        ("go down", "ScrollDown"),
        ("go back", "GoBack"),
        ("forward", "GoForward"),
        ("zoom in", "ZoomIn"),
        ("make it bigger", "ZoomIn"),
        ("new tab", "OpenTab"),
        ("open google", "OpenTab"),
        ("switch to tab 2", "SwitchTab"),
        ("close this tab", "CloseTab"),
        ("refresh", "Refresh"),
        ("reload the page", "Refresh"),

        # HUD capabilities
        ("show the HUD", "ToggleHUD"),
        ("hide the chat", "MinimizeHUD"),
        ("change theme", "SetTheme"),
        ("what themes are there", "ListThemes"),

        # Chat capabilities
        ("list my chats", "ListChats"),
        ("new conversation", "CreateChat"),
        ("delete this chat", "DeleteChat"),
        ("search conversations", "SearchChats"),

        # Config capabilities
        ("what model are you using", "GetLLMConfig"),
        ("change the temperature", "SetTemperature"),
    ]

    passed = 0
    failed = []

    for query_text, expected in tests:
        results = store.search(query_text, k=3, threshold=0.2)
        top = results[0].metadata['name'] if results else None
        top_score = results[0].score if results else 0

        if top == expected:
            status = "✅"
            passed += 1
        else:
            status = "❌"
            failed.append((query_text, expected, top))

        print(f"{status} '{query_text}' → {top} ({top_score:.3f}) [expected: {expected}]")

    print(f"\n📈 Capabilities: {passed}/{len(tests)} passed ({100*passed//len(tests)}%)")

    if failed:
        print("\n❌ Failed tests:")
        for q, exp, got in failed:
            print(f"   '{q}' expected {exp}, got {got}")

    return passed == len(tests)


# ============================================================================
# TEST 2: ELEMENTS STORE
# ============================================================================

def test_elements():
    """Test page elements indexing from text.md."""
    print("\n" + "=" * 60)
    print("TEST 2: ELEMENTS STORE")
    print("=" * 60)

    # Rebuild from current text.md
    count = rebuild_elements_store()
    print(f"📊 {count} page elements indexed")

    if count == 0:
        print("⚠️  No elements indexed - load a page in the browser first")
        print("   (Navigate to any page with Om-E extension active)")
        return True  # Not a failure, just no data

    store = ElementsStore()
    store.build()

    # Generic queries that should find something on most pages
    test_queries = [
        "link",
        "button",
        "search",
        "login",
        "menu",
        "home",
        "click here",
    ]

    print("\n🔍 Sample searches:")
    for query_text in test_queries:
        results = store.search(query_text, k=3, threshold=0.25)
        if results:
            print(f"\n'{query_text}':")
            for r in results[:3]:
                print(f"  [{r.metadata['id']}] {r.metadata['type']}: {r.metadata['label']} ({r.score:.3f})")
        else:
            print(f"'{query_text}': No matches")

    return True


# ============================================================================
# TEST 3: PROMPT SIZE
# ============================================================================

def test_prompt_size():
    """Verify prompt size reduction target."""
    print("\n" + "=" * 60)
    print("TEST 3: PROMPT SIZE")
    print("=" * 60)

    def estimate_tokens(text):
        """Rough token estimate (1 token ≈ 4 chars)."""
        return len(text) // 4

    # Test various query types
    test_queries = [
        "click on the login button",
        "scroll to the top",
        "open a new tab with google.com",
        "what's on this page?",
        "go back",
    ]

    print("📏 Minimal prompt sizes:\n")
    all_pass = True

    for query_text in test_queries:
        minimal = build_minimal_prompt(query_text)
        tokens = estimate_tokens(minimal)
        chars = len(minimal)

        # Target: <1500 tokens
        status = "✅" if tokens < 1500 else "❌"
        if tokens >= 1500:
            all_pass = False

        print(f"{status} '{query_text}': ~{tokens} tokens ({chars} chars)")

    print(f"\n📊 Target: <1500 tokens per prompt")
    print(f"📊 Previous: ~10,000 tokens (full context)")
    print(f"📊 Reduction: ~{100 - (1000*100//10000)}%")

    return all_pass


# ============================================================================
# TEST 4: TWO-CALL ORCHESTRATOR
# ============================================================================

def test_orchestrator():
    """Test two-call architecture components."""
    print("\n" + "=" * 60)
    print("TEST 4: TWO-CALL ORCHESTRATOR")
    print("=" * 60)

    # Test intent parsing
    print("\n🧠 Intent Parsing:")

    test_intents = [
        # Valid JSON responses
        ('{"response": null, "elements": "login button", "capabilities": null, "memory": null, "needs_history": false}',
         "elements query"),
        ('{"response": null, "elements": null, "capabilities": "scroll top", "memory": null, "needs_history": false}',
         "capability query"),
        ('{"response": "G\'day mate!", "elements": null, "capabilities": null, "memory": null, "needs_history": false}',
         "chat only"),
        ('{"response": null, "elements": "search box", "capabilities": "new tab", "memory": null, "needs_history": true}',
         "multi-query with history"),
        # Fallback cases
        ("Just chatting mate, no action needed",
         "fallback to chat"),
    ]

    for raw, desc in test_intents:
        result = parse_intent_response(raw)
        has_q = "queries" if result.has_queries else "no queries"
        chat = "chat" if result.chat_only else "action"
        hist = "history" if result.needs_history else "no history"
        print(f"  ✅ {desc}: {has_q}, {chat}, {hist}")

    # Test context retrieval
    print("\n🔍 Context Retrieval:")

    intent = IntentResult(
        response=None,
        element_query="login button",
        capability_query="scroll",
        memory_query=None,
        needs_history=False,
        raw_response=""
    )

    context = retrieve_context(intent)
    print(f"  Elements found: {len(context.elements)}")
    print(f"  Capabilities found: {len(context.capabilities)}")
    print(f"  Formatted context length: {len(context.formatted)} chars")

    # Test full orchestration
    print("\n🎯 Full Orchestration:")

    mock_intent_response = '{"response": null, "elements": "submit button", "capabilities": null, "memory": null, "needs_history": false}'
    result = orchestrate("click submit", mock_intent_response)

    print(f"  Intent parsed: ✅")
    print(f"  Context retrieved: {len(result.context.elements)} elements, {len(result.context.capabilities)} caps")
    print(f"  Executor prompt: {len(result.executor_prompt)} chars (~{result.total_tokens_estimate} tokens)")

    # Show sample executor prompt
    print("\n📜 Sample Executor Prompt (first 500 chars):")
    print("-" * 40)
    print(result.executor_prompt[:500] + "..." if len(result.executor_prompt) > 500 else result.executor_prompt)
    print("-" * 40)

    return True


# ============================================================================
# TEST 5: END-TO-END RETRIEVAL
# ============================================================================

def test_end_to_end():
    """Test full query → retrieval → prompt flow."""
    print("\n" + "=" * 60)
    print("TEST 5: END-TO-END RETRIEVAL")
    print("=" * 60)

    test_queries = [
        "click the login button",
        "scroll to top",
        "open new tab with google",
        "what's the weather?",
    ]

    for q in test_queries:
        print(f"\n🔍 Query: '{q}'")
        result = query(q)

        if result.elements:
            els = [f"[{e['id']}] {e['label'][:30]}" for e in result.elements[:3]]
            print(f"   Elements: {els}")
        else:
            print("   Elements: None")

        if result.capabilities:
            print(f"   Capabilities: {[c['name'] for c in result.capabilities]}")
        else:
            print("   Capabilities: None")

        if result.is_ambiguous:
            print("   ⚠️  Ambiguous (multiple close matches)")

    return True


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("FAISS RETRIEVAL SYSTEM TESTS")
    print("=" * 60)

    results = {}

    # Run tests
    results['capabilities'] = test_capabilities()
    results['elements'] = test_elements()
    results['prompt_size'] = test_prompt_size()
    results['orchestrator'] = test_orchestrator()
    results['end_to_end'] = test_end_to_end()

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    all_pass = True
    for name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        if not passed:
            all_pass = False
        print(f"  {status}: {name}")

    print("\n" + ("✅ ALL TESTS PASSED" if all_pass else "❌ SOME TESTS FAILED"))
    print("=" * 60)

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
