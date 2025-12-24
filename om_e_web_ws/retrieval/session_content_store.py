"""
Session Content Store - In-memory vector store for cross-chat semantic search.

Indexes substantive content from ALL chats in the current session.
Enables queries like "what was that song about" to find content from other chats.

Architecture:
- In-memory only (clears on server restart = new session)
- Singleton instance shared across all chats
- ALL content chunked before indexing (semantic chunks ~256 tokens)
- Filters out "noise" messages (ok, yes, scroll down, etc.)
- Query results exclude current chat to avoid circular context
- Cross-chat HISTORICAL context comes from Project Vector (Layer 2)
"""

import re
import time
from typing import List, Optional, Dict
from dataclasses import dataclass
from numpy import ndarray

from .vector_store import get_model


# ============================================================================
# SEMANTIC CHUNKING (used for ALL content)
# ============================================================================

def semantic_chunk(content: str, max_chunk_chars: int = 512) -> List[str]:
    """
    Split content into semantic chunks for embedding.
    Respects sentence boundaries where possible.

    @param content: Text to chunk
    @param max_chunk_chars: Max chars per chunk (~128 tokens at 4 chars/token)
    @return: List of chunk strings
    """
    # Short content - return as single chunk
    if len(content) <= max_chunk_chars:
        return [content.strip()] if content.strip() else []

    chunks = []

    # Split by paragraphs first
    paragraphs = re.split(r'\n\s*\n', content)

    current_chunk = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # If paragraph fits in current chunk, add it
        if len(current_chunk) + len(para) + 2 <= max_chunk_chars:
            current_chunk += ("\n\n" if current_chunk else "") + para
        else:
            # Save current chunk if not empty
            if current_chunk:
                chunks.append(current_chunk)

            # If paragraph itself is too long, split by sentences
            if len(para) > max_chunk_chars:
                sentences = re.split(r'(?<=[.!?])\s+', para)
                current_chunk = ""
                for sent in sentences:
                    if len(current_chunk) + len(sent) + 1 <= max_chunk_chars:
                        current_chunk += (" " if current_chunk else "") + sent
                    else:
                        if current_chunk:
                            chunks.append(current_chunk)
                        # If single sentence too long, force split
                        if len(sent) > max_chunk_chars:
                            for i in range(0, len(sent), max_chunk_chars):
                                chunks.append(sent[i:i + max_chunk_chars])
                            current_chunk = ""
                        else:
                            current_chunk = sent
            else:
                current_chunk = para

    # Don't forget last chunk
    if current_chunk:
        chunks.append(current_chunk)

    return chunks


# Singleton instance
_session_store = None


def get_session_content_store() -> 'SessionContentStore':
    """Get or create the singleton session content store."""
    global _session_store
    if _session_store is None:
        _session_store = SessionContentStore()
    return _session_store


def clear_session_content_store():
    """Clear the session content store (called on new session)."""
    global _session_store
    if _session_store:
        _session_store.clear()
    _session_store = None
    print("[SessionContent] Store cleared")


# Noise patterns - messages to skip (not substantive)
NOISE_PATTERNS = {
    'ok', 'okay', 'yes', 'no', 'sure', 'thanks', 'thank you', 'cool', 'nice',
    'got it', 'alright', 'right', 'yep', 'nope', 'done', 'good', 'great',
    'wow', 'hm', 'hmm', 'ah', 'oh', 'um', 'uh', 'yea', 'yeah', 'nah'
}

# LLM action confirmations - assistant starting to do something
LLM_ACTION_STARTS = [
    'executing', 'scrolling', 'scrolled', 'opening', 'opened', 'closing',
    'closed', 'switching', 'switched', 'navigating', 'loading', 'zooming',
    'zoomed', 'clicking', 'clicked', 'playing', 'pausing', 'paused',
    "i'll ", "i will ", "let me ", "i'm going to ", "going to ",
    "i'm opening", "i'm scrolling", "i'm clicking", "i'm navigating"
]

# User action request patterns - user asking to do something
USER_ACTION_VERBS = [
    'scroll', 'click', 'open', 'close', 'go to', 'navigate', 'switch',
    'zoom', 'play', 'pause', 'stop', 'find', 'search', 'show', 'hide',
    'refresh', 'reload', 'back', 'forward', 'minimize', 'maximize'
]


def is_action_message(content: str) -> bool:
    """
    Detect if content is an action request/confirmation (not worth vectorizing).
    Actions are transient - "scroll down" or "I scrolled" are not semantic content.

    @param content: Message content to check
    @return: True if action message, False if content worth indexing
    """
    normalized = content.lower().strip()

    # LLM action confirmation - starts with action phrase
    for pattern in LLM_ACTION_STARTS:
        if normalized.startswith(pattern):
            return True

    # Short user commands (< 50 chars) starting with action verb
    if len(normalized) < 50:
        for verb in USER_ACTION_VERBS:
            if normalized.startswith(verb):
                return True

    # JSON action payloads (capability executions)
    if normalized.startswith('{') and ('"cap"' in normalized or '"action"' in normalized):
        return True

    return False


def is_substantive(content: str) -> bool:
    """
    Check if content is substantive (worth indexing).
    Filters out noise, action requests, and action confirmations.

    @param content: Message content to check
    @return: True if substantive, False if noise/action
    """
    if not content:
        return False

    # Normalize for checking
    normalized = content.lower().strip()

    # Too short
    if len(normalized) < 15:
        return False

    # Exact noise match
    if normalized in NOISE_PATTERNS:
        return False

    # Action message (request or confirmation)
    if is_action_message(content):
        return False

    return True


@dataclass
class SessionContent:
    """Content entry in the session store."""
    text: str
    chat_id: str
    chat_title: str
    role: str  # 'user' or 'assistant'
    timestamp: str


class SessionContentStore:
    """
    In-memory vector store for session-wide content.

    Does NOT persist - clears on server restart (new session).
    """

    def __init__(self):
        """Initialize empty store."""
        self.index = None
        self.entries: List[SessionContent] = []
        print("[SessionContent] Store initialized (in-memory)")

    def add(self, content: str, chat_id: str, chat_title: str, role: str, timestamp: str):
        """
        Add content to the session store. Content is chunked before indexing.

        @param content: Message content (any size - will be chunked)
        @param chat_id: ID of the chat
        @param chat_title: Title of the chat
        @param role: 'user' or 'assistant'
        @param timestamp: ISO timestamp
        """
        # Skip non-substantive content
        if not is_substantive(content):
            return

        # Chunk content (handles any size)
        chunks = semantic_chunk(content)
        if not chunks:
            return

        t0 = time.time()
        model = get_model()
        added_count = 0

        for chunk in chunks:
            # Skip noise chunks and duplicates
            if not is_substantive(chunk):
                continue

            # Check for duplicates (same chunk + chat_id)
            is_dup = False
            for entry in self.entries:
                if entry.text == chunk and entry.chat_id == chat_id:
                    is_dup = True
                    break
            if is_dup:
                continue

            # Create embedding
            embedding: ndarray = model.encode([chunk], normalize_embeddings=True)  # type: ignore[assignment]

            # Build index if needed
            if self.index is None:
                import faiss
                dim = int(embedding.shape[1])
                self.index = faiss.IndexFlatIP(dim)

            # Add to index
            self.index.add(embedding.astype('float32'))  # type: ignore[union-attr]

            # Store entry
            self.entries.append(SessionContent(
                text=chunk,
                chat_id=chat_id,
                chat_title=chat_title,
                role=role,
                timestamp=timestamp
            ))
            added_count += 1

        elapsed = (time.time() - t0) * 1000
        if added_count > 0:
            preview = chunks[0][:50] if chunks else content[:50]
            print(f"[SessionContent] Added {added_count} chunk(s): {preview}... [chat:{chat_title}] ({elapsed:.0f}ms)")

    def search(
        self,
        query: str,
        exclude_chat_id: Optional[str] = None,
        k: int = 5,
        threshold: float = 0.4
    ) -> List[Dict]:
        """
        Search for similar content across the session.

        @param query: Search query
        @param exclude_chat_id: Chat ID to exclude from results (current chat)
        @param k: Max results
        @param threshold: Min similarity score
        @return: List of result dicts with text, chat_title, chat_id, role, score
        """
        if self.index is None or self.index.ntotal == 0:
            return []

        t0 = time.time()
        model = get_model()

        # Encode query
        query_embedding: ndarray = model.encode([query], normalize_embeddings=True)  # type: ignore[assignment]

        # Search (get more than k to allow for filtering)
        search_k = min(k * 2, self.index.ntotal)
        scores, indices = self.index.search(query_embedding.astype('float32'), search_k)  # type: ignore[union-attr]

        results = []
        seen_texts = set()  # For deduplication
        query_normalized = query.lower().strip()

        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or score < threshold:
                continue

            entry = self.entries[idx]

            # Skip current chat if specified
            if exclude_chat_id and entry.chat_id == exclude_chat_id:
                continue

            # Skip exact/near-exact matches to query (the query matching itself)
            entry_normalized = entry.text.lower().strip()
            if score >= 0.98 and (entry_normalized == query_normalized or
                                   query_normalized in entry_normalized and len(query_normalized) > 20):
                continue

            # Skip duplicates (same text already in results)
            text_key = entry_normalized[:100]  # Use first 100 chars as key
            if text_key in seen_texts:
                continue
            seen_texts.add(text_key)

            results.append({
                'text': entry.text,
                'chat_id': entry.chat_id,
                'chat_title': entry.chat_title,
                'role': entry.role,
                'score': float(score)
            })

            if len(results) >= k:
                break

        elapsed = (time.time() - t0) * 1000
        print(f"[SessionContent] Search: '{query[:30]}...' -> {len(results)} results ({elapsed:.0f}ms)")
        return results

    def clear(self):
        """Clear all content from the store."""
        self.index = None
        self.entries = []
        print("[SessionContent] Cleared")

    def count(self) -> int:
        """Return number of entries in store."""
        return len(self.entries)

    def __repr__(self):
        return f"SessionContentStore(count={self.count()})"


# Pattern to detect large content markers: [Large content: summary; ref=hash]
LARGE_CONTENT_PATTERN = re.compile(r'^\[Large content:\s*(.+?);\s*ref=([a-f0-9]+)\]$')


def get_session_context(query: str, current_chat_id: Optional[str] = None, max_results: int = 3) -> str:
    """
    Get formatted session context for prompt injection.
    Returns FULL chunks - standard RAG practice. Chunk size (512 chars) controls token usage.

    @param query: User's current message (to find relevant content)
    @param current_chat_id: ID of current chat (reserved for future use)
    @param max_results: Max context entries to return (k=3 → ~384 tokens max)
    @return: Formatted string for prompt, or empty string if no results
    """
    store = get_session_content_store()

    if store.count() == 0:
        return ""

    # Search ALL session content (don't exclude current chat)
    results = store.search(query, exclude_chat_id=None, k=max_results)

    if not results:
        return ""

    # Log RAG retrieval for debugging
    scores = [f"{r['score']:.2f}" for r in results]
    print(f"[RAG] Query: '{query[:50]}...' → {len(results)} results (scores: {', '.join(scores)})")

    lines = [f"[RAG Session Context - {len(results)} matches:]"]
    for i, r in enumerate(results):
        text = r['text']
        chat_title = r['chat_title']
        score = r['score']

        # Check if this is a large content reference marker
        large_match = LARGE_CONTENT_PATTERN.match(text)
        if large_match:
            # Already a summary reference - show it
            summary = large_match.group(1)
            lines.append(f"- [{i+1}] (score:{score:.2f}) {summary}")
        else:
            # Return FULL chunk - standard RAG practice
            # Chunk size (512 chars) already controls token usage
            lines.append(f"- [{i+1}] (score:{score:.2f}) {text}")

    return '\n'.join(lines)
