"""
Test Option Shaping
===================
Tests dedup, boosting, and diversity enforcement.

Usage:
    cd om_e_web_ws/llm && python test_shaping.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from llm.shaping import (
    shape_options,
    extract_keywords,
    dedupe_by_similarity,
    enforce_diversity,
    categorize_action,
    text_similarity,
    CapabilityOption
)


def test_extract_keywords():
    """Test keyword extraction."""
    print("=" * 60)
    print("TEST: Extract Keywords")
    print("=" * 60)

    tests = [
        ("scroll down", ["scroll"]),
        ("go to youtube", ["open"]),
        ("click the button", ["click"]),
        ("type hello", ["type"]),
        ("switch to tab 2", ["tab"]),
        ("open new tab and scroll", ["open", "tab", "scroll"]),
    ]

    for intent, expected in tests:
        result = extract_keywords(intent)
        # Check all expected keywords are present
        missing = [k for k in expected if k not in result]
        status = "✅" if not missing else "❌"
        print(f"   {status} '{intent}' → {result}")
        assert not missing, f"Missing keywords: {missing}"

    print("\n   ✅ PASS - All keyword extractions correct")


def test_text_similarity():
    """Test text similarity."""
    print("\n" + "=" * 60)
    print("TEST: Text Similarity")
    print("=" * 60)

    tests = [
        ("ScrollDown", "ScrollDown", 1.0),
        ("ScrollDown", "scrolldown", 1.0),  # Case insensitive
        ("ScrollDown", "ScrollUp", 0.5),    # Partial match
        ("ScrollDown", "Click", 0.2),       # Low match
        ("OpenTab", "OpenNewTab", 0.85),    # Contains
    ]

    for a, b, expected_min in tests:
        result = text_similarity(a, b)
        status = "✅" if result >= expected_min else "❌"
        print(f"   {status} '{a}' vs '{b}' = {result:.2f} (expect >= {expected_min})")
        assert result >= expected_min, f"Expected >= {expected_min}, got {result}"

    print("\n   ✅ PASS - All similarity checks correct")


def test_categorize_action():
    """Test action categorization."""
    print("\n" + "=" * 60)
    print("TEST: Categorize Action")
    print("=" * 60)

    tests = [
        ("ScrollDown", "scroll"),
        ("ScrollUp", "scroll"),
        ("PageDown", "scroll"),
        ("OpenTab", "navigate"),
        ("GotoURL", "navigate"),
        ("ClickButton", "click"),
        ("TypeText", "type"),
        ("SetValue", "type"),
        ("SwitchTab", "tab"),
        ("PlayVideo", "media"),
        ("CloseTab", "tab"),  # Contains "Tab", matches tab pattern first
        ("DismissModal", "close"),
        ("DoSomething", "other"),
    ]

    for name, expected in tests:
        result = categorize_action(name)
        status = "✅" if result == expected else "❌"
        print(f"   {status} '{name}' → {result} (expected {expected})")
        assert result == expected, f"Expected {expected}, got {result}"

    print("\n   ✅ PASS - All categorizations correct")


def test_dedup():
    """Test deduplication."""
    print("\n" + "=" * 60)
    print("TEST: Deduplication")
    print("=" * 60)

    options = [
        CapabilityOption("ScrollDown", "Scroll page down", "scroll down", 0.9, "scroll"),
        CapabilityOption("ScrollDown", "Scroll the page down", "down", 0.8, "scroll"),  # Dup
        CapabilityOption("ScrollUp", "Scroll page up", "scroll up", 0.7, "scroll"),
        CapabilityOption("Click", "Click element", "click", 0.6, "click"),
    ]

    deduped = dedupe_by_similarity(options, threshold=0.85)
    print(f"   Input: {len(options)} options")
    print(f"   Output: {len(deduped)} options")
    for opt in deduped:
        print(f"      - {opt.name} (score={opt.score})")

    assert len(deduped) == 3, f"Expected 3 after dedup, got {len(deduped)}"
    assert deduped[0].score == 0.9, "Should keep highest score"

    print("\n   ✅ PASS - Dedup working correctly")


def test_diversity():
    """Test diversity enforcement."""
    print("\n" + "=" * 60)
    print("TEST: Diversity Enforcement")
    print("=" * 60)

    # 5 scroll options - should be reduced to 2
    options = [
        CapabilityOption("ScrollDown", "", "", 0.9, "scroll"),
        CapabilityOption("ScrollUp", "", "", 0.85, "scroll"),
        CapabilityOption("ScrollToTop", "", "", 0.8, "scroll"),
        CapabilityOption("ScrollToBottom", "", "", 0.75, "scroll"),
        CapabilityOption("PageDown", "", "", 0.7, "scroll"),
        CapabilityOption("Click", "", "", 0.6, "click"),
        CapabilityOption("OpenTab", "", "", 0.5, "navigate"),
    ]

    diverse = enforce_diversity(options, max_per_type=2)
    print(f"   Input: {len(options)} options (5 scroll)")
    print(f"   Output: {len(diverse)} options")
    for opt in diverse:
        print(f"      - {opt.name} ({opt.action_type})")

    scroll_count = sum(1 for o in diverse if o.action_type == "scroll")
    assert scroll_count <= 2, f"Expected max 2 scroll, got {scroll_count}"
    assert len(diverse) == 4, f"Expected 4 diverse options, got {len(diverse)}"

    print("\n   ✅ PASS - Diversity enforced correctly")


def test_full_shaping():
    """Test full shaping pipeline."""
    print("\n" + "=" * 60)
    print("TEST: Full Shaping Pipeline")
    print("=" * 60)

    raw_options = [
        {"label": "ScrollDown", "description": "Scroll the page down by one viewport", "example": "scroll down", "score": 0.7},
        {"label": "ScrollUp", "description": "Scroll the page up by one viewport", "example": "scroll up", "score": 0.65},
        {"label": "ScrollToTop", "description": "Scroll to the top of the page", "example": "go to top", "score": 0.6},
        {"label": "ScrollToBottom", "description": "Scroll to the bottom of the page", "example": "go to bottom", "score": 0.55},
        {"label": "PageDown", "description": "Page down", "example": "page down", "score": 0.5},
        {"label": "Click", "description": "Click an element", "example": "click", "score": 0.4},
        {"label": "OpenTab", "description": "Open a new tab", "example": "new tab", "score": 0.3},
    ]

    intent = "scroll down"
    shaped = shape_options(intent, raw_options, max_options=7)

    print(f"   Intent: '{intent}'")
    print(f"   Input: {len(raw_options)} raw options")
    print(f"   Output: {len(shaped)} shaped options")
    print()
    for opt in shaped:
        print(f"      - {opt['label']}: {opt['description'][:40]}... (score={opt['score']:.2f})")

    # ScrollDown should be boosted and first
    assert shaped[0]["label"] == "ScrollDown", "ScrollDown should be first (boosted)"
    assert shaped[0]["score"] > 0.7, "ScrollDown should be boosted"

    # Max 2 scroll variants
    scroll_count = sum(1 for o in shaped if "scroll" in o["label"].lower() or "page" in o["label"].lower())
    assert scroll_count <= 2, f"Expected max 2 scroll variants, got {scroll_count}"

    # Descriptions truncated
    for opt in shaped:
        assert len(opt["description"]) <= 50, f"Description too long: {opt['description']}"

    print("\n   ✅ PASS - Full shaping pipeline working")


def main():
    """Run all tests."""
    test_extract_keywords()
    test_text_similarity()
    test_categorize_action()
    test_dedup()
    test_diversity()
    test_full_shaping()

    print("\n" + "=" * 60)
    print("🎉 ALL SHAPING TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()
