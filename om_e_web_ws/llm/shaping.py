"""
Option Shaping
==============
Shapes RAG-retrieved options before passing to Role B (Decision Engine).

Why shaping matters:
- Raw RAG might return 10+ options with 5 scroll variants
- After shaping: max 7 options, max 2 per action type
- Role B sees cleaner, more diverse options → better decisions
- Reduces prompt tokens from ~250 to ~120

Usage:
    shaped = shape_options("scroll down", raw_options, max_options=7)
"""
import logging
import re
from dataclasses import dataclass
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


# ============================================================
# Data Structures
# ============================================================

@dataclass
class CapabilityOption:
    """
    A capability option for Role B to consider.

    Matches the format from RAG retrieval.
    """
    name: str           # e.g., "ScrollDown"
    description: str    # e.g., "Scroll the page down"
    example: str        # e.g., '{"cap": "ScrollDown", "params": {...}}'
    score: float        # Similarity score from RAG (0.0-1.0)
    group: str = ""     # e.g., "browser", "hud", "chat"
    params: Optional[Dict] = None  # e.g., {"url": "Required - the URL to open"}
    action_type: str = ""  # Categorized type (scroll, navigate, click, etc.)


# ============================================================
# Main Shaping Function
# ============================================================

def shape_options(
    intent: str,
    raw_options: List[Dict],
    max_options: int = 7
) -> List[Dict]:
    """
    Shape options to keep Role B prompt small and deterministic.

    Steps:
    1. Convert to CapabilityOption objects
    2. De-dup similar options (keep highest score)
    3. Boost keyword matches
    4. Cap descriptions to 50 chars
    5. Sort by score, take top N
    6. Enforce diversity (max 2 per action type)

    Args:
        intent: Normalized intent from Role A
        raw_options: Raw options from RAG retrieval
        max_options: Maximum options to return

    Returns:
        Shaped list of option dicts
    """
    if not raw_options:
        return []

    # 1. Convert to CapabilityOption objects
    options = []
    for opt in raw_options:
        cap = CapabilityOption(
            name=opt.get("label", opt.get("name", "")),
            description=opt.get("description", "")[:100],
            example=opt.get("example", ""),
            score=opt.get("score", 0.5),
            group=opt.get("group", ""),
            params=opt.get("params", {}),
            action_type=categorize_action(opt.get("label", opt.get("name", "")))
        )
        options.append(cap)

    # 2. De-dup similar options
    deduped = dedupe_by_similarity(options, threshold=0.85)
    logger.debug(f"[Shaping] Deduped: {len(raw_options)} → {len(deduped)}")

    # 3. Boost keyword matches
    keywords = extract_keywords(intent)
    for opt in deduped:
        if any(kw in opt.name.lower() for kw in keywords):
            opt.score = min(1.0, opt.score + 0.2)  # Boost obvious matches

    # 3b. Strong boost for explicit action prefixes (prevents RAG noise from embedded terms)
    intent_lower = intent.lower()
    EXPLICIT_PREFIXES = {
        "search chats": "SearchChats",
        "search for": "SearchChats",  # When context is chats
        "find chat": "SearchChats",
        "rename chat": "RenameChat",
        "delete chat": "DeleteChat",
        "switch to chat": "SetCurrentChat",
        "open chat": "SetCurrentChat",
        "show chats": "ShowChats",
        "hide chats": "HideChats",
        "close chats": "HideChats",
    }
    for prefix, cap_name in EXPLICIT_PREFIXES.items():
        if intent_lower.startswith(prefix):
            for opt in deduped:
                if opt.name == cap_name:
                    opt.score = min(1.0, opt.score + 0.3)  # Strong boost for explicit match
                    break
            break

    # 4. Cap descriptions to 50 chars
    for opt in deduped:
        if len(opt.description) > 50:
            opt.description = opt.description[:47] + "..."

    # 5. Sort by score, take top N
    sorted_opts = sorted(deduped, key=lambda x: x.score, reverse=True)[:max_options]

    # 6. Enforce diversity (max 2 per action type)
    diverse = enforce_diversity(sorted_opts, max_per_type=2)
    logger.debug(f"[Shaping] Final: {len(diverse)} options")

    # Convert back to dicts
    return [
        {
            "label": opt.name,
            "description": opt.description,
            "example": opt.example,
            "score": opt.score,
            "group": opt.group,
            "params": opt.params or {}
        }
        for opt in diverse
    ]


# ============================================================
# Keyword Extraction
# ============================================================

# Action keyword mapping
KEYWORD_MAP = {
    "scroll": ["scroll", "down", "up", "page", "bottom", "top"],
    "open": ["open", "go to", "navigate", "visit", "url"],
    "close": ["close", "dismiss", "exit", "hide"],
    "click": ["click", "press", "tap", "select", "button"],
    "type": ["type", "enter", "input", "write", "fill"],
    "tab": ["tab", "switch", "window"],
    "search": ["search", "find", "lookup", "query"],
    "play": ["play", "pause", "video", "media"],
    "refresh": ["refresh", "reload"],
    "back": ["back", "previous"],
    "forward": ["forward", "next"],
}


def extract_keywords(intent: str) -> List[str]:
    """
    Extract action keywords from intent.

    Args:
        intent: User intent string

    Returns:
        List of matched action keywords
    """
    keywords = []
    intent_lower = intent.lower()

    for action, triggers in KEYWORD_MAP.items():
        if any(t in intent_lower for t in triggers):
            keywords.append(action)

    return keywords


# ============================================================
# Deduplication
# ============================================================

def dedupe_by_similarity(
    options: List[CapabilityOption],
    threshold: float = 0.85
) -> List[CapabilityOption]:
    """
    Remove near-duplicate options, keeping highest score.

    Uses simple text similarity on names.

    Args:
        options: List of options to dedupe
        threshold: Similarity threshold (0.0-1.0)

    Returns:
        Deduped list of options
    """
    # Sort by score descending first
    sorted_opts = sorted(options, key=lambda x: x.score, reverse=True)

    deduped = []
    for opt in sorted_opts:
        # Check if similar to any already kept option
        is_dup = any(
            text_similarity(opt.name, seen.name) > threshold
            for seen in deduped
        )
        if not is_dup:
            deduped.append(opt)

    return deduped


def text_similarity(a: str, b: str) -> float:
    """
    Simple text similarity using character overlap.

    Args:
        a: First string
        b: Second string

    Returns:
        Similarity score 0.0-1.0
    """
    if not a or not b:
        return 0.0

    a_lower = a.lower()
    b_lower = b.lower()

    # Exact match
    if a_lower == b_lower:
        return 1.0

    # One contains the other
    if a_lower in b_lower or b_lower in a_lower:
        return 0.9

    # Character overlap (Jaccard-ish)
    set_a = set(a_lower)
    set_b = set(b_lower)
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)

    return intersection / union if union > 0 else 0.0


# ============================================================
# Action Categorization
# ============================================================

# Action type patterns
ACTION_PATTERNS = {
    "scroll": re.compile(r"scroll|page.?(up|down)", re.I),
    "navigate": re.compile(r"open|goto|navigate|visit|url", re.I),
    "click": re.compile(r"click|press|tap|select|button", re.I),
    "type": re.compile(r"type|enter|input|setvalue|fill", re.I),
    "tab": re.compile(r"tab|switch|window", re.I),
    "media": re.compile(r"play|pause|video|mute|volume", re.I),
    "close": re.compile(r"close|dismiss|exit|hide", re.I),
}


def categorize_action(name: str) -> str:
    """
    Categorize action by name.

    Args:
        name: Action/capability name

    Returns:
        Category string (scroll, navigate, click, etc.)
    """
    for category, pattern in ACTION_PATTERNS.items():
        if pattern.search(name):
            return category

    return "other"


# ============================================================
# Diversity Enforcement
# ============================================================

def enforce_diversity(
    options: List[CapabilityOption],
    max_per_type: int = 2
) -> List[CapabilityOption]:
    """
    Limit options per action type to ensure diversity.

    Prevents Role B from seeing 5 scroll variants.

    Args:
        options: Sorted list of options
        max_per_type: Max options per action type

    Returns:
        Diverse list of options
    """
    type_counts: Dict[str, int] = {}
    diverse = []

    for opt in options:
        action_type = opt.action_type or categorize_action(opt.name)
        current_count = type_counts.get(action_type, 0)

        if current_count < max_per_type:
            diverse.append(opt)
            type_counts[action_type] = current_count + 1

    return diverse
