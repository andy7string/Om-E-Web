"""
Test Metrics
============
Tests TurnMetrics dataclass and logging.

Usage:
    cd om_e_web_ws/llm && python test_metrics.py
"""
import asyncio
import json
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from llm.metrics import (
    TurnMetrics,
    create_turn_metrics,
    log_turn_metrics,
    TimingContext,
    METRICS_PATH
)


async def test_create_metrics():
    """Test creating metrics."""
    print("=" * 60)
    print("TEST: Create TurnMetrics")
    print("=" * 60)

    metrics = create_turn_metrics(
        chat_id="test_chat_1",
        handoff=True,
        decision_type="cap",
        top_score=0.85
    )

    assert metrics.timestamp, "Should have timestamp"
    assert metrics.chat_id == "test_chat_1"
    assert metrics.handoff == True
    assert metrics.decision_type == "cap"
    assert metrics.top_score == 0.85
    print(f"   ✅ Created metrics with timestamp: {metrics.timestamp}")


async def test_timing_context():
    """Test timing context manager."""
    print("\n" + "=" * 60)
    print("TEST: TimingContext")
    print("=" * 60)

    with TimingContext() as t:
        await asyncio.sleep(0.1)  # 100ms

    assert t.elapsed_ms > 90, f"Should be ~100ms, got {t.elapsed_ms}"
    assert t.elapsed_ms < 150, f"Should be ~100ms, got {t.elapsed_ms}"
    print(f"   ✅ Timed 100ms sleep: {t.elapsed_ms:.1f}ms")


async def test_log_metrics():
    """Test logging metrics to JSONL."""
    print("\n" + "=" * 60)
    print("TEST: Log Metrics")
    print("=" * 60)

    # Create test metrics
    metrics = create_turn_metrics(
        chat_id="test_chat_log",
        handoff=True,
        decision_type="cap",
        top_score=0.92,
        total_ms=150.5,
        preprocess_ms=10.2,
        chat_persona_ms=80.3,
        rag_ms=30.0,
        decision_engine_ms=30.0
    )

    # Log it
    await log_turn_metrics(metrics)
    print(f"   Logged to: {METRICS_PATH}")

    # Verify file exists and has content
    assert METRICS_PATH.exists(), "Metrics file should exist"

    # Read last line
    with open(METRICS_PATH, "r") as f:
        lines = f.readlines()
        last_line = lines[-1]
        data = json.loads(last_line)

    assert data["chat_id"] == "test_chat_log"
    assert data["decision_type"] == "cap"
    assert data["top_score"] == 0.92
    print(f"   ✅ Logged and verified: decision_type={data['decision_type']}, score={data['top_score']}")


async def test_full_workflow():
    """Test full timing workflow."""
    print("\n" + "=" * 60)
    print("TEST: Full Workflow")
    print("=" * 60)

    metrics = create_turn_metrics(chat_id="workflow_test")

    # Simulate preprocessing
    with TimingContext() as t:
        await asyncio.sleep(0.01)
    metrics.preprocess_ms = t.elapsed_ms

    # Simulate chat persona call
    with TimingContext() as t:
        await asyncio.sleep(0.05)
    metrics.chat_persona_ms = t.elapsed_ms
    metrics.handoff = True

    # Simulate RAG
    with TimingContext() as t:
        await asyncio.sleep(0.02)
    metrics.rag_ms = t.elapsed_ms

    # Set decision
    metrics.decision_type = "cap"
    metrics.top_score = 0.88
    metrics.options_count = 5

    # Calculate total
    metrics.total_ms = metrics.preprocess_ms + metrics.chat_persona_ms + metrics.rag_ms

    await log_turn_metrics(metrics)

    print(f"   Preprocess: {metrics.preprocess_ms:.1f}ms")
    print(f"   Chat Persona: {metrics.chat_persona_ms:.1f}ms")
    print(f"   RAG: {metrics.rag_ms:.1f}ms")
    print(f"   Total: {metrics.total_ms:.1f}ms")
    print(f"   ✅ Full workflow completed")


async def main():
    """Run all tests."""
    await test_create_metrics()
    await test_timing_context()
    await test_log_metrics()
    await test_full_workflow()

    print("\n" + "=" * 60)
    print("🎉 ALL METRICS TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
