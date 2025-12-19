"""
Test Ingestion Pipeline
========================
Tests dedup and large payload detection (no LLM calls).

Usage:
    cd om_e_web_ws/llm && python test_ingestion.py
"""
import hashlib
import time
import sys
import os

# Add parent for imports when running directly
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from llm.ingestion import (
    recent_hashes,
    is_noise,
    semantic_chunk,
    detect_content_category,
    LARGE_MSG_CHARS,
    LARGE_MSG_LINES,
    CODE_BLOCK_PATTERN,
    DEDUP_WINDOW_MS
)


def test_dedup_logic():
    """Test dedup hash logic directly."""
    print("=" * 60)
    print("TEST: Deduplication Logic")
    print("=" * 60)

    chat_id = "test_chat_1"
    message = "scroll down"
    h = hashlib.sha256(message.encode()).hexdigest()[:16]

    # Clear state
    recent_hashes.clear()

    # Test 1: First message - no hash exists
    print("\n1. First message (no hash exists)...")
    chat_hashes = recent_hashes.setdefault(chat_id, {})
    is_dup = h in chat_hashes and (time.time() - chat_hashes.get(h, 0)) < DEDUP_WINDOW_MS / 1000
    assert not is_dup, "First message should not be duplicate"
    chat_hashes[h] = time.time()
    print(f"   ✅ PASS - Not duplicate")

    # Test 2: Same message immediately - within window
    print("\n2. Same message immediately (within 2s window)...")
    is_dup = h in chat_hashes and (time.time() - chat_hashes.get(h, 0)) < DEDUP_WINDOW_MS / 1000
    assert is_dup, "Same message within window should be duplicate"
    print(f"   ✅ PASS - Detected as duplicate")

    # Test 3: Different message
    print("\n3. Different message...")
    diff_msg = "click the button"
    diff_h = hashlib.sha256(diff_msg.encode()).hexdigest()[:16]
    is_dup = diff_h in chat_hashes and (time.time() - chat_hashes.get(diff_h, 0)) < DEDUP_WINDOW_MS / 1000
    assert not is_dup, "Different message should not be duplicate"
    print(f"   ✅ PASS - Not duplicate")

    # Test 4: Same message different chat
    print("\n4. Same message to different chat...")
    other_chat_hashes = recent_hashes.setdefault("other_chat", {})
    is_dup = h in other_chat_hashes and (time.time() - other_chat_hashes.get(h, 0)) < DEDUP_WINDOW_MS / 1000
    assert not is_dup, "Different chat should not share dedup"
    print(f"   ✅ PASS - Not duplicate (different chat)")

    # Test 5: Wait for window to expire
    print("\n5. Waiting 2.1 seconds for window to expire...")
    time.sleep(2.1)
    is_dup = h in chat_hashes and (time.time() - chat_hashes.get(h, 0)) < DEDUP_WINDOW_MS / 1000
    assert not is_dup, "After window should not be duplicate"
    print(f"   ✅ PASS - Not duplicate after window expired")

    print("\n" + "=" * 60)
    print("DEDUP TESTS: ALL PASSED ✅")
    print("=" * 60)


def test_large_detection():
    """Test large payload detection criteria."""
    print("\n" + "=" * 60)
    print("TEST: Large Payload Detection")
    print("=" * 60)

    # Test 1: Short message - not large
    print("\n1. Short message...")
    content = "hello world"
    is_large = (
        len(content) > LARGE_MSG_CHARS or
        content.count('\n') > LARGE_MSG_LINES or
        bool(CODE_BLOCK_PATTERN.search(content))
    )
    assert not is_large, "Short message should not be large"
    print(f"   ✅ PASS - Not large ({len(content)} chars)")

    # Test 2: Long content
    print("\n2. Long content (3000 chars)...")
    content = "x" * 3000
    is_large = len(content) > LARGE_MSG_CHARS
    assert is_large, "Long content should be large"
    print(f"   ✅ PASS - Detected as large ({len(content)} chars > {LARGE_MSG_CHARS})")

    # Test 3: Many lines
    print("\n3. Many lines (60 lines)...")
    content = "\n".join([f"Line {i}" for i in range(60)])
    is_large = content.count('\n') > LARGE_MSG_LINES
    assert is_large, "Many lines should be large"
    print(f"   ✅ PASS - Detected as large ({content.count(chr(10))} lines > {LARGE_MSG_LINES})")

    # Test 4: Code block
    print("\n4. Code block...")
    content = """Here's some code:
```python
def hello():
    print("Hello, world!")
```
"""
    is_large = bool(CODE_BLOCK_PATTERN.search(content))
    assert is_large, "Code block should trigger large detection"
    print(f"   ✅ PASS - Code block detected")

    print("\n" + "=" * 60)
    print("LARGE DETECTION TESTS: ALL PASSED ✅")
    print("=" * 60)


def test_noise_detection():
    """Test noise pattern detection."""
    print("\n" + "=" * 60)
    print("TEST: Noise Detection")
    print("=" * 60)

    # Test 1: Normal text - not noise
    print("\n1. Normal text...")
    assert not is_noise("This is a normal sentence."), "Normal text should not be noise"
    print(f"   ✅ PASS - Not noise")

    # Test 2: Very short text
    print("\n2. Very short text (< 10 chars)...")
    assert is_noise("hi"), "Very short text should be noise"
    print(f"   ✅ PASS - Detected as noise")

    # Test 3: Stack trace line
    print("\n3. Stack trace...")
    assert is_noise("  at com.example.MyClass(MyClass.java:42)"), "Stack trace should be noise"
    print(f"   ✅ PASS - Detected as noise")

    # Test 4: Timestamp only
    print("\n4. Timestamp only...")
    assert is_noise("2024-01-15 10:30:45.123"), "Timestamp should be noise"
    print(f"   ✅ PASS - Detected as noise")

    # Test 5: Whitespace only
    print("\n5. Whitespace only...")
    assert is_noise("     \n\n   "), "Whitespace should be noise"
    print(f"   ✅ PASS - Detected as noise")

    print("\n" + "=" * 60)
    print("NOISE DETECTION TESTS: ALL PASSED ✅")
    print("=" * 60)


def test_semantic_chunking():
    """Test semantic chunking."""
    print("\n" + "=" * 60)
    print("TEST: Semantic Chunking")
    print("=" * 60)

    # Build test content with multiple paragraphs
    paragraphs = [f"This is paragraph {i}. " * 20 for i in range(10)]
    content = "\n\n".join(paragraphs)

    print(f"\n1. Chunking {len(content)} chars into chunks...")
    chunks = semantic_chunk(content, max_chunk_tokens=256)
    print(f"   Got {len(chunks)} chunks")
    assert len(chunks) > 1, "Should produce multiple chunks"
    print(f"   ✅ PASS - Produced {len(chunks)} chunks")

    # Check chunks aren't too long
    print("\n2. Checking chunk sizes...")
    max_expected = 256 * 4 * 2  # tokens * chars/token * buffer
    for i, chunk in enumerate(chunks):
        assert len(chunk) < max_expected, f"Chunk {i} too long: {len(chunk)}"
    print(f"   ✅ PASS - All chunks within size limits")

    print("\n" + "=" * 60)
    print("CHUNKING TESTS: ALL PASSED ✅")
    print("=" * 60)


def test_category_detection():
    """Test content category detection."""
    print("\n" + "=" * 60)
    print("TEST: Category Detection")
    print("=" * 60)

    tests = [
        ("def hello():\n    pass", "code"),
        ("class MyClass:\n    pass", "code"),
        ("```python\ncode\n```", "code"),
        ("Error: Something went wrong\nTraceback", "log"),
        ("WARNING: disk space low", "log"),
        ("$ npm install", "command"),
        ("> git status", "command"),
        ("WHEREAS the parties agree hereinafter...", "contract"),
        ("Just some random text here", "paste"),
    ]

    for content, expected in tests:
        result = detect_content_category(content)
        status = "✅" if result == expected else "❌"
        print(f"   {status} '{content[:30]}...' → {result} (expected {expected})")
        assert result == expected, f"Expected {expected}, got {result}"

    print("\n" + "=" * 60)
    print("CATEGORY DETECTION TESTS: ALL PASSED ✅")
    print("=" * 60)


def main():
    """Run all tests."""
    test_dedup_logic()
    test_large_detection()
    test_noise_detection()
    test_semantic_chunking()
    test_category_detection()

    print("\n" + "=" * 60)
    print("🎉 ALL INGESTION TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()
