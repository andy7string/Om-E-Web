"""
Message Ingestion Pipeline
==========================
Preprocess incoming messages: dedup, detect large payloads, chunk/summarize.

Phase 0 foundation - handles all input before LLM processing.
"""
import hashlib
import json
import logging
import re
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# ============================================================
# Configuration
# ============================================================

LARGE_MSG_CHARS = 2000      # Chars threshold for "large" content
LARGE_MSG_LINES = 50        # Line count threshold
DEDUP_WINDOW_MS = 2000      # Ignore duplicate within this window
CODE_BLOCK_PATTERN = re.compile(r'```[\s\S]*?```')

# In-memory dedup cache: chat_id → {hash: timestamp}
recent_hashes: Dict[str, Dict[str, float]] = {}

# Data directories
DATA_DIR = Path(__file__).parent.parent / "data"
LARGE_PAYLOADS_DIR = DATA_DIR / "large_payloads"


# ============================================================
# Main Entry Point
# ============================================================

async def preprocess_message(chat_id: str, content: str) -> Dict[str, Any]:
    """
    Preprocess incoming message: dedup, detect large payloads, chunk/summarize.

    Args:
        chat_id: Current chat ID
        content: Raw message content

    Returns:
        Dict with processing results:
        - is_dup: True if duplicate (should ignore)
        - is_large: True if large payload detected
        - content: Original or summarized content
        - prompt_ref: Reference string for prompts (if large)
        - summary: Summary text (if large)
        - facts: Extracted facts (if large)
        - raw_path: Path to raw content (if large)
    """
    h = hashlib.sha256(content.encode()).hexdigest()[:16]
    now = time.time()

    # 1. Deduplication - ignore rapid duplicates
    chat_hashes = recent_hashes.setdefault(chat_id, {})
    if h in chat_hashes and (now - chat_hashes[h]) < DEDUP_WINDOW_MS / 1000:
        logger.debug(f"[Ingestion] Duplicate detected, ignoring: {h}")
        return {"is_dup": True, "action": "ignore"}
    chat_hashes[h] = now

    # Clean old hashes (older than 10 seconds)
    chat_hashes = {k: v for k, v in chat_hashes.items() if now - v < 10}
    recent_hashes[chat_id] = chat_hashes

    # 2. Large payload detection
    is_large = (
        len(content) > LARGE_MSG_CHARS or
        content.count('\n') > LARGE_MSG_LINES or
        bool(CODE_BLOCK_PATTERN.search(content))
    )

    if not is_large:
        return {"is_dup": False, "is_large": False, "content": content}

    # 3. Store raw payload
    LARGE_PAYLOADS_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = LARGE_PAYLOADS_DIR / f"{chat_id}_{h}.txt"
    raw_path.write_text(content, encoding='utf-8')
    logger.info(f"[Ingestion] Large payload stored: {raw_path}")

    # 4. Chunk into semantic units
    chunks = semantic_chunk(content, max_chunk_tokens=256)

    # 5. Summarize (lightweight LLM call)
    summary = await llm_summarize_large(chunks, max_output_tokens=150)

    # 6. Embed chunks (skip noise) - TODO: integrate with FAISS
    embedded_count = 0
    for chunk in chunks:
        if not is_noise(chunk):
            # TODO: await faiss_add(embed(chunk), {"type": "large_chunk", "hash": h})
            embedded_count += 1

    prompt_ref = f"[Large content: {summary['sentence'][:100]}; ref={h}]"

    return {
        "is_dup": False,
        "is_large": True,
        "summary": summary["sentence"],
        "facts": summary.get("facts", []),
        "chunks_embedded": embedded_count,
        "raw_path": str(raw_path),
        "prompt_ref": prompt_ref,
        "content": prompt_ref  # Use reference in prompts, not raw
    }


# ============================================================
# Noise Detection
# ============================================================

NOISE_PATTERNS = [
    re.compile(r"^\s*at\s+[\w\.]+\("),      # Stack traces
    re.compile(r"^[\s\d\-:\.]+$"),           # Timestamps only
    re.compile(r"(.{20,})\1{3,}"),           # Repeated content (3+ times)
    re.compile(r"^[\s\W]*$"),                # Whitespace/punctuation only
]


def is_noise(text: str) -> bool:
    """Detect low-value content that shouldn't be embedded."""
    if len(text.strip()) < 10:
        return True
    return any(p.search(text) for p in NOISE_PATTERNS)


# ============================================================
# Semantic Chunking
# ============================================================

def semantic_chunk(
    content: str,
    max_chunk_tokens: int = 256,
    overlap: int = 50
) -> List[str]:
    """
    Split content into semantic chunks for embedding.
    Respects paragraph and sentence boundaries where possible.

    Args:
        content: Text to chunk
        max_chunk_tokens: Max tokens per chunk (rough estimate: 4 chars/token)
        overlap: Not implemented yet - reserved for future use

    Returns:
        List of chunk strings
    """
    chunks = []
    paragraphs = content.split('\n\n')

    current_chunk = ""
    current_tokens = 0

    for para in paragraphs:
        # Rough token estimate: 4 chars per token
        para_tokens = len(para) // 4

        if current_tokens + para_tokens <= max_chunk_tokens:
            current_chunk += para + "\n\n"
            current_tokens += para_tokens
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para + "\n\n"
            current_tokens = para_tokens

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


# ============================================================
# Content Category Detection
# ============================================================

def detect_content_category(content: str) -> str:
    """Classify content type for better summarization."""
    content_lower = content.lower()

    if any(p in content for p in ['def ', 'function ', 'class ', 'import ', '```']):
        return 'code'
    if any(p in content_lower for p in ['error', 'warning', 'traceback', 'exception']):
        return 'log'
    if any(p in content_lower for p in ['whereas', 'hereinafter', 'clause', 'agreement']):
        return 'contract'
    if content.startswith('$') or content.startswith('>'):
        return 'command'

    return 'paste'


# ============================================================
# Large Content Summarization
# ============================================================

async def llm_summarize_large(
    chunks: List[str],
    max_output_tokens: int = 150,
    category: Optional[str] = None
) -> Dict[str, Any]:
    """
    Summarize large content using lightweight LLM.

    Args:
        chunks: Content chunks to summarize
        max_output_tokens: Max tokens for summary output
        category: Content category (auto-detected if None)

    Returns:
        {"sentence": "...", "facts": ["...", "..."]}
    """
    from .client import LLMClient

    # Detect category if not provided
    if not category:
        sample = chunks[0] if chunks else ""
        category = detect_content_category(sample)

    # Build sample from first chunks (limit to 2000 chars)
    sample_text = "\n\n".join(chunks[:3])[:2000]

    continuation = ""
    if len(chunks) > 3:
        continuation = f"\n\n[Content continues in {len(chunks) - 3} more chunks...]"

    prompt = f"""Summarize this {category} content in exactly:
1. ONE sentence (max 50 words)
2. 3-5 key facts (bullet points)

Content sample:
{sample_text}{continuation}

Format response as JSON: {{"sentence": "...", "facts": ["...", "..."]}}"""

    try:
        client = LLMClient()
        response = await client.chat(
            system_prompt="You summarize content concisely. Always respond with valid JSON.",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=max_output_tokens
        )

        # Parse JSON from response
        result = json.loads(response.strip())
        return {
            "sentence": result.get("sentence", f"Large {category} content"),
            "facts": result.get("facts", [])[:5]
        }
    except json.JSONDecodeError as e:
        logger.warning(f"[Ingestion] Failed to parse summary JSON: {e}")
        return {
            "sentence": f"Large {category} content ({sum(len(c) for c in chunks)} chars)",
            "facts": []
        }
    except Exception as e:
        logger.warning(f"[Ingestion] Failed to summarize large content: {e}")
        return {
            "sentence": f"Large {category} content ({sum(len(c) for c in chunks)} chars)",
            "facts": []
        }


# ============================================================
# Large Payload Retrieval
# ============================================================

async def retrieve_from_large_payload(
    payload_hash: str,
    query: str,
    top_k: int = 3
) -> List[str]:
    """
    Retrieve relevant chunks from a stored large payload.

    Used when user says "find clause X in that contract"
    → RAG query on embedded chunks → Return top-k (not entire raw)

    Args:
        payload_hash: Hash of the stored payload
        query: Search query
        top_k: Number of chunks to return

    Returns:
        List of relevant chunk strings
    """
    # TODO: Implement when FAISS integration is ready
    # from llm.memory import faiss_query
    # results = await faiss_query(
    #     query=query,
    #     filter={"type": "large_chunk", "hash": payload_hash},
    #     top_k=top_k
    # )
    # return [r.get("text", "") for r in results]

    logger.warning(f"[Ingestion] retrieve_from_large_payload not yet implemented")
    return []


def get_raw_payload(payload_hash: str, chat_id: Optional[str] = None) -> Optional[str]:
    """
    Get raw content of a stored large payload.

    Only called when user explicitly requests "show full [hash]".
    """
    # Try with chat_id prefix first
    if chat_id:
        path = LARGE_PAYLOADS_DIR / f"{chat_id}_{payload_hash}.txt"
        if path.exists():
            return path.read_text(encoding='utf-8')

    # Search for any file ending with hash
    for path in LARGE_PAYLOADS_DIR.glob(f"*_{payload_hash}.txt"):
        return path.read_text(encoding='utf-8')

    return None
