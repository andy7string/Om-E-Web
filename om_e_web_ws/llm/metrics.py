"""
Turn Metrics
============
Dataclass for per-turn timing and decision metrics.
Logs to JSONL for threshold tuning and performance analysis.

Usage:
    metrics = TurnMetrics(timestamp=..., chat_id=..., ...)
    await log_turn_metrics(metrics)

Analysis:
    python -m om_e_web_ws.llm.metrics_cli --last 100 --by decision_type
"""
import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ============================================================
# Configuration
# ============================================================

DATA_DIR = Path(__file__).parent.parent / "data"
METRICS_PATH = DATA_DIR / "metrics" / "turns.jsonl"


# ============================================================
# TurnMetrics Dataclass
# ============================================================

@dataclass
class TurnMetrics:
    """
    Metrics for a single turn. Logged to JSONL for analysis.

    Fields are grouped by category:
    - Identity: timestamp, chat_id, turn_state
    - Server latencies: preprocess_ms, chat_persona_ms, etc.
    - Perceived latencies: first_token_ms, first_ui_update_ms
    - Decisions: handoff, decision_type
    - Confidence: top_score, options_count
    - Payloads: is_large_msg, prompt tokens
    - Outcomes: execution_success, retry_count
    """
    # Identity
    timestamp: str
    chat_id: str
    turn_state: str = "unknown"  # Final TurnState value

    # Server-side latencies (ms) - what we spent processing
    preprocess_ms: float = 0.0
    chat_persona_ms: float = 0.0
    rag_ms: float = 0.0
    decision_engine_ms: float = 0.0
    total_ms: float = 0.0

    # Perceived latencies (ms) - what the USER actually felt
    first_token_ms: Optional[float] = None       # Time to first streamed token (Role A)
    first_ui_update_ms: Optional[float] = None   # Time to first HUD update ("thinking...")
    execution_dispatch_ms: Optional[float] = None  # Time to action dispatch to content.js

    # Decisions
    handoff: bool = False
    decision_type: str = "unknown"  # cap, act, ask_user, cannot, noop, clarify, chat_only

    # Confidence
    top_score: float = 0.0
    options_count: int = 0

    # Payloads
    is_large_msg: bool = False
    prompt_tokens_role_a: int = 0
    prompt_tokens_role_b: int = 0

    # Outcomes
    execution_success: Optional[bool] = None
    execution_verified: Optional[bool] = None  # Did verification pass?
    retry_count: int = 0
    noop_reason: Optional[str] = None  # If decision was noop

    # Error tracking
    error: Optional[str] = None


# ============================================================
# Logging Functions
# ============================================================

async def log_turn_metrics(metrics: TurnMetrics) -> None:
    """
    Append metrics to JSONL file.

    Args:
        metrics: TurnMetrics instance to log
    """
    try:
        METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(METRICS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(metrics)) + "\n")
        logger.debug(f"[Metrics] Logged turn: {metrics.decision_type}, {metrics.total_ms:.0f}ms")
    except Exception as e:
        logger.warning(f"[Metrics] Failed to log: {e}")


def log_turn_metrics_sync(metrics: TurnMetrics) -> None:
    """
    Sync version for non-async contexts.

    Args:
        metrics: TurnMetrics instance to log
    """
    try:
        METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(METRICS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(metrics)) + "\n")
    except Exception as e:
        logger.warning(f"[Metrics] Failed to log: {e}")


# ============================================================
# Helper: Create Metrics with Timestamp
# ============================================================

def create_turn_metrics(chat_id: str, **kwargs) -> TurnMetrics:
    """
    Create TurnMetrics with current timestamp.

    Args:
        chat_id: Current chat ID
        **kwargs: Additional fields to set

    Returns:
        TurnMetrics instance with timestamp set
    """
    return TurnMetrics(
        timestamp=datetime.utcnow().isoformat(),
        chat_id=chat_id,
        **kwargs
    )


# ============================================================
# Helper: Timing Context Manager
# ============================================================

class TimingContext:
    """
    Context manager for timing code blocks.

    Usage:
        with TimingContext() as t:
            await some_operation()
        metrics.preprocess_ms = t.elapsed_ms
    """

    def __init__(self):
        self.start_time: float = 0.0
        self.end_time: float = 0.0

    def __enter__(self):
        import time
        self.start_time = time.time()
        return self

    def __exit__(self, *args):
        import time
        self.end_time = time.time()

    @property
    def elapsed_ms(self) -> float:
        """Elapsed time in milliseconds."""
        return (self.end_time - self.start_time) * 1000
