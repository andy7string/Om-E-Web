"""
Chat Memory Store - Semantic search over chat history.

Indexes all chat messages for "remember when..." type queries.
Recent messages (last 10) go direct in prompt for task flow.
"""

import os
import glob
import json
from datetime import datetime
from typing import List, Dict
from .vector_store import VectorStore

CHATS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'chats')

# Navigation/procedural patterns to filter out of semantic memory
NAV_PATTERNS = [
    'opening', 'closing', 'switching to', 'navigating to',
    'switched to', 'opened', 'closed', 'loading', 'loaded',
    'scrolling', 'scrolled', 'zooming', 'zoomed',
    'toggling', 'toggled', 'showing', 'hiding',
    'renaming', 'renamed', 'deleting', 'deleted',
    'tab for you', 'chat for you', 'panel for you',
]

# Om-E failure/limitation messages - outdated info that pollutes memory
FAILURE_PATTERNS = [
    "can't show", "can't open", "can't do", "can't perform",
    "isn't available", "not available", "isn't currently available",
    "capability isn't", "capability is not",
    "i can't", "i cannot", "unable to",
    "don't have access", "no capability",
]


def is_substantive_content(content: str) -> bool:
    """
    Check if message content is substantive (worth indexing for semantic search).

    Filters out:
    - Capability JSON responses
    - Navigation/procedural messages
    - Very short messages

    Returns True if content should be indexed.
    """
    content_lower = content.lower().strip()

    # Skip empty or very short
    if len(content) < 15:
        return False

    # Skip capability JSON (actions, not knowledge)
    if content.strip().startswith('{') and ('"cap"' in content or '"act"' in content):
        return False

    # Skip messages that are ONLY capability JSON (may have text before)
    lines = content.strip().split('\n')
    if len(lines) <= 2:
        last_line = lines[-1].strip()
        if last_line.startswith('{') and ('"cap"' in last_line or '"act"' in last_line):
            # Check if the non-JSON part is just procedural
            non_json = '\n'.join(lines[:-1]).lower()
            if any(p in non_json for p in NAV_PATTERNS):
                return False

    # Skip pure navigation messages
    if any(p in content_lower for p in NAV_PATTERNS):
        # But allow if there's substantial other content (>50 words)
        if len(content.split()) < 50:
            return False

    # Skip Om-E failure/limitation messages (outdated info)
    if any(p in content_lower for p in FAILURE_PATTERNS):
        return False

    return True


class ChatMemoryStore(VectorStore):
    """
    Vector store for chat message history.

    Enables semantic search across all conversations:
    - "What did we talk about yesterday?"
    - "Remember that chat about the HUD?"
    - "When did I ask about Facebook?"
    """

    def __init__(self):
        super().__init__('chat_memory')

    def build(self, max_messages_per_chat: int = 100):
        """
        Build index from all chat files.

        Args:
            max_messages_per_chat: Limit messages per chat to avoid bloat
        """
        self.clear()

        texts = []
        metadata = []

        chat_files = glob.glob(os.path.join(CHATS_DIR, '*.json'))
        print(f"[ChatMemoryStore] Found {len(chat_files)} chat files")

        for chat_file in chat_files:
            try:
                with open(chat_file, 'r', encoding='utf-8') as f:
                    chat = json.load(f)

                chat_id = chat.get('chat_id', os.path.basename(chat_file))
                chat_title = chat.get('title', 'Untitled')
                created_at = chat.get('created_at', '')
                messages = chat.get('messages', [])

                # Parse date for human-readable context
                date_str = ''
                if created_at:
                    try:
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        date_str = dt.strftime('%b %d')  # "Dec 17"
                    except:
                        pass

                # Index messages (limit per chat)
                for msg in messages[-max_messages_per_chat:]:
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '').strip()
                    msg_id = msg.get('id', '')
                    timestamp = msg.get('timestamp', '')

                    # Filter out nav/capability noise
                    if not is_substantive_content(content):
                        continue

                    # Build semantic text for embedding
                    # Format: "Role in 'title' (date): content"
                    role_label = 'User' if role == 'user' else 'Om-E'
                    text = f"{role_label} in '{chat_title}' ({date_str}): {content}"

                    texts.append(text)
                    metadata.append({
                        'chat_id': chat_id,
                        'chat_title': chat_title,
                        'message_id': msg_id,
                        'role': role,
                        'content': content,
                        'timestamp': timestamp,
                        'date_str': date_str
                    })

            except Exception as e:
                print(f"[ChatMemoryStore] Error reading {chat_file}: {e}")
                continue

        if texts:
            self.add(texts, metadata)
            self.save()
            print(f"[ChatMemoryStore] Indexed {len(texts)} messages from {len(chat_files)} chats")
        else:
            print("[ChatMemoryStore] Warning: No messages found to index")

    def add_message(self, chat_id: str, chat_title: str, message: Dict):
        """
        Add a single message to the index (incremental update).

        Args:
            chat_id: The chat this message belongs to
            chat_title: Title of the chat
            message: Message dict with role, content, timestamp, id
        """
        role = message.get('role', 'unknown')
        content = message.get('content', '').strip()
        msg_id = message.get('id', '')
        timestamp = message.get('timestamp', '')

        # Filter out nav/capability noise
        if not is_substantive_content(content):
            return

        # Get date from timestamp
        date_str = ''
        if timestamp:
            try:
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                date_str = dt.strftime('%b %d')
            except:
                pass

        role_label = 'User' if role == 'user' else 'Om-E'
        text = f"{role_label} in '{chat_title}' ({date_str}): {content}"

        self.add([text], [{
            'chat_id': chat_id,
            'chat_title': chat_title,
            'message_id': msg_id,
            'role': role,
            'content': content,
            'timestamp': timestamp,
            'date_str': date_str
        }])

    def search_memory(self, query: str, k: int = 5, threshold: float = 0.4) -> List[Dict]:
        """
        Search chat memory for relevant past conversations.

        Supports optional time phrases: "yesterday", "last week", "today", etc.
        If no time phrase, returns all semantic matches regardless of when.

        Args:
            query: What to search for ("that chat about HUD", "last week facebook")
            k: Number of results
            threshold: Minimum similarity (0-1)

        Returns:
            List of relevant messages with context
        """
        # Detect time phrases and get cutoff date (if any)
        cutoff = _detect_time_filter(query)
        if cutoff:
            print(f"[ChatMemory] Time filter detected: after {cutoff.isoformat()}")

        # Search more results if filtering by time (some may be filtered out)
        search_k = k * 3 if cutoff else k
        results = self.search(query, k=search_k, threshold=threshold)

        # Format and optionally filter by time
        formatted = []
        for r in results:
            # Time filter: skip if before cutoff
            if cutoff:
                ts = r.metadata.get('timestamp', '')
                if ts:
                    try:
                        msg_time = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                        if msg_time < cutoff:
                            continue
                    except:
                        pass

            formatted.append({
                'chat_title': r.metadata.get('chat_title', ''),
                'chat_id': r.metadata.get('chat_id', ''),
                'role': r.metadata.get('role', ''),
                'content': r.metadata.get('content', ''),
                'date': r.metadata.get('date_str', ''),
                'timestamp': r.metadata.get('timestamp', ''),
                'score': r.score
            })

            # Stop once we have enough
            if len(formatted) >= k:
                break

        return formatted


def _detect_time_filter(query: str):
    """
    Detect time phrases in query and return cutoff datetime.

    Returns None if no time phrase detected (no filtering).
    """
    from datetime import timedelta, timezone
    query_lower = query.lower()
    now = datetime.now(timezone.utc)

    # Time phrase mappings (phrase → days ago)
    time_phrases = {
        'today': 1,
        'yesterday': 2,
        'last night': 2,
        'this week': 7,
        'last week': 14,
        'this month': 30,
        'last month': 60,
        'recently': 7,
        'few days ago': 5,
        'couple days': 3,
    }

    for phrase, days in time_phrases.items():
        if phrase in query_lower:
            return now - timedelta(days=days)

    # Day names: "last monday", "on saturday", etc.
    days_of_week = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    for day in days_of_week:
        if day in query_lower:
            # Find the most recent occurrence of that day (within last 2 weeks)
            return now - timedelta(days=14)

    return None


def get_recent_messages(chat_id: str, limit: int = 10) -> List[Dict]:
    """
    Get the most recent messages from a chat (for direct prompt inclusion).

    Args:
        chat_id: The chat to get messages from
        limit: Number of recent messages (default 10)

    Returns:
        List of message dicts with role and content
    """
    chat_file = os.path.join(CHATS_DIR, f"{chat_id}.json")

    if not os.path.exists(chat_file):
        return []

    try:
        with open(chat_file, 'r', encoding='utf-8') as f:
            chat = json.load(f)

        messages = chat.get('messages', [])
        recent = messages[-limit:] if len(messages) > limit else messages

        return [{'role': m.get('role'), 'content': m.get('content')} for m in recent]

    except Exception as e:
        print(f"[ChatMemory] Error loading chat {chat_id}: {e}")
        return []


# Singleton instance
_chat_memory_store = None


def get_chat_memory_store() -> ChatMemoryStore:
    """Get or create the singleton chat memory store."""
    global _chat_memory_store
    if _chat_memory_store is None:
        _chat_memory_store = ChatMemoryStore()
        if not _chat_memory_store.load():
            _chat_memory_store.build()
    return _chat_memory_store
