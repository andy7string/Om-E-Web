"""
Chat Memory Store - LLM-summarised conversation memory.

Indexes summarised intent/topic statements, not raw messages.
Uses memory_summarisation.md prompt to extract what's worth remembering.
"""

import os
import glob
import json
import asyncio
from datetime import datetime
from typing import List, Dict, Optional
from .vector_store import VectorStore

CHATS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'chats')
PROMPT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'prompts', 'memory_summarisation.md')

# Batch size for summarisation (messages per LLM call)
BATCH_SIZE = 10

# Pre-filter patterns - skip these BEFORE sending to LLM (saves calls)
# Om-E action confirmations that add no memory value
ACTION_CONFIRMATIONS = [
    'opening', 'opened', 'closing', 'closed',
    'switching to', 'switched to',
    'navigating to', 'navigated to',
    'searching', 'searched',
    'scrolling', 'scrolled',
    'clicking', 'clicked',
    'loading', 'loaded',
    'refreshing', 'refreshed',
    'going back', 'went back',
    'going forward', 'went forward',
    'creating', 'created',
    'deleting', 'deleted',
    'renaming', 'renamed',
    'executing',  # "Executing YouTubeIt...", "Executing HidePrompt..."
    'for you', 'done', 'here you go',
    'hiding', 'showing',
]

# Pure navigation requests with NO topic/intent (user side)
# These have no subject matter worth remembering
PURE_NAV_REQUESTS = [
    # Site navigation
    'open youtube', 'open google', 'open facebook', 'open twitter',
    'go to youtube', 'go to google', 'go to facebook',
    'close youtube', 'close google', 'close amazon', 'close tab',
    # Scroll/nav
    'scroll down', 'scroll up', 'scroll to top', 'scroll to bottom',
    'go back', 'go forward', 'refresh', 'reload',
    'back again',
    # Tabs
    'new tab', 'switch tab', 'next tab', 'previous tab',
    'click on the', 'click the button', 'click that',
    # UI controls
    'hide prompt', 'show prompt', 'hide chat', 'show chat',
    'hide my chats', 'open chats', 'show chats', 'close chats',
    'take me to chats', 'open the side', 'close the side',
    'open side nav', 'close side nav', 'open the side nav',
    'toggle', 'minimize', 'maximize',
    'hide that', 'close the search', 'clear the search',
    # View switching
    'switch to hud', 'hud view', 'browser mode', 'to hud',
    'switch back', 'switch view',
    # Open site (no topic)
    'open linked in', 'open linkedin', 'open twitter', 'open reddit',
    'take me to', 'go to my',
    # Theme/UI changes
    'change to atom', 'change theme', 'set theme',
    'make brand new', 'make it active',
]

# Search requests - these HAVE intent, extract the topic
# "search google for cats" → keep, has topic "cats"
# "lookup bamboo labs on youtube" → keep, has topic "bamboo labs"
# We keep these and let the LLM summarise the intent
SEARCH_PATTERNS = [
    'search google for',
    'search youtube for',
    'search for',
    'look up',
    'lookup',  # "lookup bamboo labs on youtube"
    'find me',
    'find some',
    'show me',
    'tell me about',
    'what is',
    'what are',
    'how to',
    'how do',
]


def is_worth_remembering(content: str, role: str) -> bool:
    """
    Pre-filter: should this message be sent for summarisation?

    Returns False for pure nav/action messages - saves LLM calls.
    Returns True for substantive content worth summarising.
    """
    content_lower = content.lower().strip()

    # Skip empty or very short
    if len(content) < 10:
        return False

    # Skip JSON-only messages (actions)
    if content.strip().startswith('{') and content.strip().endswith('}'):
        if '"act"' in content or '"cap"' in content:
            return False

    # Skip messages ending with JSON action
    lines = content.strip().split('\n')
    if len(lines) >= 1:
        last_line = lines[-1].strip()
        if last_line.startswith('{') and ('"act"' in last_line or '"cap"' in last_line):
            # Check if the rest is just a confirmation
            rest = '\n'.join(lines[:-1]).lower()
            if len(rest) < 50 and any(p in rest for p in ACTION_CONFIRMATIONS):
                return False

    # Skip Om-E action confirmations
    if role == 'assistant':
        # Short confirmations with no real content
        if len(content) < 80:
            if any(p in content_lower for p in ACTION_CONFIRMATIONS):
                return False

    # User messages: check for intent vs pure nav
    if role == 'user':
        # Search requests HAVE intent - keep them
        # "search google for cats" → has topic "cats"
        if any(p in content_lower for p in SEARCH_PATTERNS):
            return True  # Keep - LLM will extract the topic

        # Pure nav requests with no topic - drop
        if len(content) < 60:
            if any(p in content_lower for p in PURE_NAV_REQUESTS):
                return False

    return True


def pre_filter_messages(messages: List[Dict]) -> List[Dict]:
    """Filter out messages that aren't worth summarising."""
    return [
        msg for msg in messages
        if is_worth_remembering(msg.get('content', ''), msg.get('role', ''))
    ]


def load_summarisation_prompt() -> str:
    """Load the memory summarisation prompt template."""
    try:
        with open(PROMPT_PATH, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"[ChatMemory] Error loading prompt: {e}")
        return ""


def format_conversation_for_summary(messages: List[Dict]) -> str:
    """Format a batch of messages for the summarisation prompt."""
    lines = []
    for msg in messages:
        role = msg.get('role', 'unknown')
        content = msg.get('content', '').strip()
        role_label = 'User' if role == 'user' else 'Om-E'
        lines.append(f"{role_label}: {content}")
    return '\n'.join(lines)


async def summarise_conversation(messages: List[Dict]) -> List[str]:
    """
    Call LLM to summarise a conversation batch into intent/topic statements.

    Returns list of summary statements, or empty list if SKIP.
    """
    from llm.client import LLMClient

    if not messages:
        return []

    # Load and format prompt
    prompt_template = load_summarisation_prompt()
    if not prompt_template:
        print("[ChatMemory] No summarisation prompt available, skipping")
        return []

    conversation_text = format_conversation_for_summary(messages)
    prompt = prompt_template.replace('{conversation}', conversation_text)

    # Call LLM
    client = LLMClient()
    try:
        response = await client.chat(
            system_prompt=prompt,
            messages=[{"role": "user", "content": "Summarise this conversation."}],
            temperature=0.3,  # Low temp for consistent summaries
            max_tokens=200
        )

        # Parse response
        response = response.strip()
        if response.upper() == 'SKIP':
            return []

        # Split into individual statements (one per line)
        summaries = [line.strip() for line in response.split('\n') if line.strip()]
        return summaries

    except Exception as e:
        print(f"[ChatMemory] Summarisation error: {e}")
        return []
    finally:
        await client.close()


def summarise_sync(messages: List[Dict]) -> List[str]:
    """Sync wrapper for async summarisation."""
    try:
        return asyncio.run(summarise_conversation(messages))
    except RuntimeError:
        # Already in async context - create new loop
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(summarise_conversation(messages))
        finally:
            loop.close()


class ChatMemoryStore(VectorStore):
    """
    Vector store for summarised chat memory.

    Stores LLM-generated intent/topic summaries, not raw messages.
    Enables semantic search for "remember when..." type queries.
    """

    def __init__(self):
        super().__init__('chat_memory')
        self._pending_messages: List[Dict] = []  # Buffer for incremental updates
        self._current_chat_id: Optional[str] = None
        self._current_chat_title: Optional[str] = None

    def build(self, max_messages_per_chat: int = 100):
        """
        Build index from all chat files using LLM summarisation.

        Batches messages and summarises each batch before indexing.
        """
        self.clear()

        texts = []
        metadata = []

        chat_files = glob.glob(os.path.join(CHATS_DIR, '*.json'))
        print(f"[ChatMemory] Found {len(chat_files)} chat files, summarising...")

        total_summaries = 0

        for chat_file in chat_files:
            try:
                with open(chat_file, 'r', encoding='utf-8') as f:
                    chat = json.load(f)

                chat_id = chat.get('chat_id', os.path.basename(chat_file))
                chat_title = chat.get('title', 'Untitled')
                created_at = chat.get('created_at', '')
                messages = chat.get('messages', [])

                # Parse date for context
                date_str = ''
                if created_at:
                    try:
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        date_str = dt.strftime('%b %d')
                    except:
                        pass

                # Limit messages per chat
                messages = messages[-max_messages_per_chat:]

                # Pre-filter: remove nav/action noise before sending to LLM
                filtered = pre_filter_messages(messages)
                if not filtered:
                    continue  # Nothing worth summarising in this chat

                # Batch and summarise
                for i in range(0, len(filtered), BATCH_SIZE):
                    batch = filtered[i:i + BATCH_SIZE]
                    if not batch:
                        continue
                    summaries = summarise_sync(batch)

                    for summary in summaries:
                        # Format: "Summary (ChatTitle, Date)"
                        text = f"{summary} ({chat_title}, {date_str})"

                        texts.append(text)
                        metadata.append({
                            'chat_id': chat_id,
                            'chat_title': chat_title,
                            'summary': summary,
                            'date_str': date_str,
                            'batch_start': i,
                            'batch_end': i + len(batch)
                        })
                        total_summaries += 1

            except Exception as e:
                print(f"[ChatMemory] Error processing {chat_file}: {e}")
                continue

        if texts:
            self.add(texts, metadata)
            self.save()
            print(f"[ChatMemory] Indexed {total_summaries} summaries from {len(chat_files)} chats")
        else:
            print("[ChatMemory] Warning: No summaries generated")

    def add_messages_for_summarisation(
        self,
        chat_id: str,
        chat_title: str,
        messages: List[Dict]
    ):
        """
        Add messages to buffer and summarise when batch is full.

        Pre-filters messages to skip nav/action noise.
        """
        # If chat changed, flush pending buffer first
        if self._current_chat_id and self._current_chat_id != chat_id:
            self._flush_pending()

        self._current_chat_id = chat_id
        self._current_chat_title = chat_title

        # Pre-filter: only buffer messages worth remembering
        filtered = pre_filter_messages(messages)
        if filtered:
            self._pending_messages.extend(filtered)

        # Summarise when we have enough substantive messages
        if len(self._pending_messages) >= BATCH_SIZE:
            self._flush_pending()

    def _flush_pending(self):
        """Summarise and index pending messages."""
        if not self._pending_messages:
            return

        chat_id = self._current_chat_id
        chat_title = self._current_chat_title or 'Untitled'
        date_str = datetime.now().strftime('%b %d')

        # Already pre-filtered, summarise the batch
        summaries = summarise_sync(self._pending_messages)

        for summary in summaries:
            text = f"{summary} ({chat_title}, {date_str})"

            self.add([text], [{
                'chat_id': chat_id,
                'chat_title': chat_title,
                'summary': summary,
                'date_str': date_str
            }])

        if summaries:
            print(f"[ChatMemory] Added {len(summaries)} summaries for '{chat_title}'")

        # Clear buffer
        self._pending_messages = []

    def flush(self):
        """Force flush any pending messages (call on chat switch or close)."""
        self._flush_pending()
        self.save()

    def search_memory(self, query: str, k: int = 5, threshold: float = 0.4) -> List[Dict]:
        """
        Search chat memory for relevant past conversations.

        Returns summarised memories, not raw messages.
        """
        # Detect time phrases and get cutoff date (if any)
        cutoff = _detect_time_filter(query)
        if cutoff:
            print(f"[ChatMemory] Time filter detected: after {cutoff.isoformat()}")

        # Search
        search_k = k * 2 if cutoff else k
        results = self.search(query, k=search_k, threshold=threshold)

        formatted = []
        for r in results:
            formatted.append({
                'chat_title': r.metadata.get('chat_title', ''),
                'chat_id': r.metadata.get('chat_id', ''),
                'summary': r.metadata.get('summary', ''),
                'date': r.metadata.get('date_str', ''),
                'score': r.score
            })

            if len(formatted) >= k:
                break

        return formatted


def _detect_time_filter(query: str):
    """
    Detect time phrases in query and return cutoff datetime.
    Returns None if no time phrase detected.
    """
    from datetime import timedelta, timezone
    query_lower = query.lower()
    now = datetime.now(timezone.utc)

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

    days_of_week = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    for day in days_of_week:
        if day in query_lower:
            return now - timedelta(days=14)

    return None


def get_recent_messages(chat_id: str, limit: int = 10) -> List[Dict]:
    """
    Get the most recent messages from a chat (for direct prompt inclusion).
    These are raw messages, not summaries - used for immediate context.
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
