# Om-E RAG & vStore Implementation Plan

**Last Updated:** 2025-12-24
**Status:** Phases 1-6 Complete, Phase 7 Next

---

## Table of Contents

1. [CLAUDE CODE: How to Test Om-E via Chrome MCP](#claude-code-how-to-test-om-e-via-chrome-mcp)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Status](#implementation-status)
4. [Phase 6: Complete Rolling Summarization](#phase-6-complete-rolling-summarization)
5. [Phase 7: vStore Foundation](#phase-7-vstore-foundation)
6. [Phase 8: vStore UI Integration](#phase-8-vstore-ui-integration)
7. [Phase 9: vStore RAG Integration](#phase-9-vstore-rag-integration)
8. [Phase 10: Project Structure Migration](#phase-10-project-structure-migration)
9. [Phase 11: vStore File Upload](#phase-11-vstore-file-upload)
10. [Phase 12: Global Session Context](#phase-12-global-session-context)
11. [Appendices](#appendices)

---

## CLAUDE CODE: How to Test Om-E via Chrome MCP

**READ THIS FIRST when you need to test the chat/message pipeline.**

### Quick Reference

**Step 1:** Get tab context
```
mcp__claude-in-chrome__tabs_context_mcp
```
Returns `tabId` for the Om-E Web tab (usually `http://127.0.0.1:8080/`)

**Step 2:** Send a message using `omeSendChat`
```javascript
// mcp__claude-in-chrome__javascript_tool
// action: "javascript_exec"
// tabId: {the tabId from step 1}
// text:
window.omeSendChat('Your test message here').then(r => console.log('Done:', r));
'Message sent'
```

**Step 3:** Verify via console
```
mcp__claude-in-chrome__read_console_messages with tabId and pattern "Result"
```

**Step 4:** Check debug output
```bash
cat om_e_web_ws/llm_unified.md
```

### Testing Large Payloads (>500 chars)

```javascript
// action: "javascript_exec", tabId: {tabId}
const largeContent = `Sharks are a group of elasmobranch fish characterized by a cartilaginous skeleton, five to seven gill slits on the sides of the head, and pectoral fins that are not fused to the head. They have been around for more than 400 million years, predating dinosaurs. There are over 500 species of sharks, ranging from the small dwarf lanternshark at just 17 centimeters to the massive whale shark reaching up to 12 meters. Sharks play a crucial role as apex predators in maintaining healthy ocean ecosystems.`;
window.omeSendChat(largeContent).then(r => console.log('Done:', r));
'Large payload sent'
```

Then check:
- `data/chats/*.json` - should have stub `[Large content: ...; ref=hash]`
- `data/large_payloads/` - should have full content file

### DO NOT USE

- `window.postMessage({type: 'ome_send_chat_test', ...})` - may not work on dashboard page
- `window.omeLLMChat()` - doesn't save user message to chat file

### Key Files to Monitor

| File | What to Check |
|------|---------------|
| `data/chats/*.json` | Message saved with correct content |
| `data/large_payloads/` | Full content for large payloads |
| `llm_unified.md` | LLM prompt debug output |
| Server terminal | `[SessionContent] Added:` logs for vector indexing |

### MCP Testing Loop

```
1. GET CONTEXT
   mcp__claude-in-chrome__tabs_context_mcp
   → Returns: tabId for Om-E Web tab

2. SCREENSHOT (verify state)
   mcp__claude-in-chrome__computer action=screenshot tabId=XXX

3. SEND MESSAGE
   mcp__claude-in-chrome__javascript_tool
   → window.omeSendChat('test message')

4. WAIT
   mcp__claude-in-chrome__computer action=wait duration=3 tabId=XXX

5. READ FEEDBACK
   Read /Users/andy7string/Projects/Om_E_Web/om_e_web_ws/llm_unified.md
   → Contains: User Message, Tokens, Capabilities, Full prompt, Response

6. VERIFY & ITERATE
```

### Debug Output File Structure (`llm_unified.md`)

```markdown
# Unified LLM Call Debug

**Generated:** 2025-12-23 00:20:37
**User Message:** <what user typed or processed version>
**Messages:** <count of messages in history>
**Capabilities:** <count injected>
**Tokens:** ~XXX (system: XXX, messages: XXX)
**LLM Time:** XXXms

## System Prompt
<full system prompt with personality, rules, output format>

## Conversation
**USER:** <message content>
**SYSTEM:** [Session Context:]...

## Response
```json
{"type":"reply","text":"Om-E's response"}
```
```

### Server Restart Required

Code changes require server restart:
```bash
pkill -f ws_server.py
python om_e_web_ws/ws_server.py
```

Config changes in `llm_config.json` also need restart (server caches on load).

---

## Architecture Overview

### Current RAG Pipeline

```
User types message
        ↓
Ingestion: Large payload detection, persistence intent, dedup
        ↓
RAG queries capabilities (semantic search on user message)
        ↓
Build prompt with browser context + session context + retrieved items
        ↓
Single LLM call (unified orchestrator)
        ↓
Response (chat or action JSON)
```

### Memory Tiers (Current + Planned)

| Tier | Scope | Storage | Trigger | Status |
|------|-------|---------|---------|--------|
| **Session** | Current browser session | In-memory + ephemeral vector | Automatic | ✅ Implemented |
| **Facts** | Permanent user knowledge | `vectors/system/facts/` | "remember X" patterns | ✅ Implemented |
| **Chat vStore** | Per-chat curated | `projects/{id}/chats/{chat}/vectors/` | User opt-in | 🔲 Planned |
| **Project vStore** | Cross-chat curated | `projects/{id}/vectors/content/` | User opt-in | 🔲 Planned |

### Directory Structure (Target)

```
om_e_web_ws/
├── retrieval/
│   ├── vector_store.py         # Base FAISS wrapper ✅
│   ├── capabilities_store.py   # Indexes capabilities ✅
│   ├── elements_store.py       # Indexes text.json ✅
│   ├── chat_memory_store.py    # Chat history summaries ✅
│   ├── session_content_store.py # Session content ✅
│   ├── memory_cycle.py         # Large payloads, persistence ✅
│   ├── chat_context.py         # Action/content classification ✅
│   ├── vstore.py               # NEW: User-curated vStore 🔲
│   └── query.py                # Combined query interface ✅
├── llm/
│   ├── orchestrator.py         # Unified single-call pipeline ✅
│   ├── ingestion.py            # Message preprocessing ✅
│   └── ...
└── data/
    ├── vectors/
    │   └── system/
    │       ├── capabilities/   # Capability embeddings ✅
    │       ├── chat_memory/    # Chat summaries ✅
    │       └── facts/          # Permanent facts ✅
    ├── chats/                  # Current chat storage ✅
    ├── large_payloads/         # Full large content ✅
    └── projects/               # NEW: Project-scoped data 🔲
        └── {project_id}/
            ├── project.json
            ├── vectors/
            │   └── content/    # Project vStore
            └── chats/
                └── {chat_id}/
                    ├── chat.json
                    └── vectors/
                        └── content/  # Chat vStore
```

---

## Implementation Status

### Completed Phases

| Phase | Description | Key Files |
|-------|-------------|-----------|
| 1 | Base VectorStore | `retrieval/vector_store.py` |
| 2 | ElementsStore | `retrieval/elements_store.py` |
| 3 | CapabilitiesStore | `retrieval/capabilities_store.py` |
| 4 | Query Integration | `retrieval/query.py`, `llm/orchestrator.py` |
| 5 | Large Payload Handling | `retrieval/memory_cycle.py` |

### Current Configuration

From `data/llm_config.json`:

```json
{
  "settings": {
    "cap_score_threshold": 0.55,
    "session_actions_limit": 10
  },
  "context": {
    "payload_context_lines": 5,
    "large_payload_threshold": 550,
    "payload_summary_budget": 50,
    "message_count_threshold": 8,
    "max_facts_in_prompt": 3,
    "fact_token_budget": 50
  }
}
```

---

## Phase 6: Complete Rolling Summarization

**Status:** ✅ Complete (2025-12-24)

### What's Done
- [x] Persistence intent detection patterns
- [x] Fact extraction when intent detected
- [x] Permanent fact storage in vector
- [x] Integration with prompt retrieval
- [x] Config: `message_count_threshold: 8`
- [x] **Flag-based action filtering** - `action_executed` flag from OrchestratorResult (authoritative)
- [x] **Rolling intent summarization** - LLM-generated summaries every 5 interactions
- [x] **Interaction tracking** - `interaction_count` in chat `context_state`
- [x] **Rolling summaries in chat JSON** - stored in `summaries.rolling` array
- [x] **Rolling summaries in prompt** - injected as `[Chat summary: ...]` in conversation

### What Remains (Future Phases)
- [ ] **Hybrid Search (BM25 + Vector)** - combine keyword and semantic search (deferred to Phase 7+)

### Implementation

**File:** `retrieval/memory_cycle.py`

```python
async def check_rolling_summary_needed(chat_dict: Dict) -> bool:
    """Check if content messages exceed threshold."""
    state = chat_dict.get("context_state", {})
    content_count = state.get("content_message_count", 0)
    threshold = get_config().get("context", {}).get("message_count_threshold", 8)
    return content_count > threshold

async def create_rolling_summary(chat_dict: Dict) -> str:
    """Summarize oldest content messages, store in chat JSON."""
    # Get messages since last summary
    # LLM summarization call
    # Update chat_dict["summaries"]["rolling"]
    # Reset content_message_count
```

**Hook:** `ws_server.py` in `append_user_message()` / `append_assistant_message()`

### Checklist
- [ ] `check_rolling_summary_needed()` function
- [ ] `create_rolling_summary()` LLM call
- [ ] Prompt template: `data/prompts/rolling_summary.md`
- [ ] Hook into message append flow
- [ ] Track `content_message_count` in chat context_state
- [ ] Test: After 9+ content messages, summary appears

### Hybrid Search (BM25 + Vector)

**Why:** Exact keyword matches (BM25) + semantic similarity (vectors) = better accuracy

| Query Type | BM25 Strength | Vector Strength |
|------------|---------------|-----------------|
| "GB10 specs" | ✅ Exact "GB10" | ✅ "specs" meaning |
| "guitar pricing" | ❌ No exact match | ✅ Semantic |
| "what was that RAG thing" | ✅ Exact "RAG" | ✅ Context |

**Implementation:**

**File:** `retrieval/vector_store.py`

```python
from rank_bm25 import BM25Okapi

class VectorStore:
    def __init__(self, store_name: str, ...):
        ...
        self.bm25 = None  # BM25 index (rebuilt on add)
        self.tokenized_texts = []  # For BM25

    def add(self, texts: List[str], metadata_list: List[dict]):
        # ... existing vector add ...

        # Rebuild BM25 index
        self.tokenized_texts = [t.lower().split() for t in self.texts]
        self.bm25 = BM25Okapi(self.tokenized_texts)

    def search(self, query: str, k: int = 5, threshold: float = 0.3,
               hybrid: bool = True, bm25_weight: float = 0.3) -> List[SearchResult]:
        """
        Search with optional hybrid BM25 + vector ranking.

        @param hybrid: Use hybrid search (default True)
        @param bm25_weight: Weight for BM25 scores (0-1, default 0.3)
        """
        if not hybrid or self.bm25 is None:
            return self._vector_search(query, k, threshold)

        # Get both result sets
        vector_results = self._vector_search(query, k * 2, threshold=0.0)
        bm25_scores = self.bm25.get_scores(query.lower().split())

        # Reciprocal Rank Fusion
        combined = self._rrf_combine(vector_results, bm25_scores, bm25_weight)
        return combined[:k]

    def _rrf_combine(self, vector_results, bm25_scores, bm25_weight):
        """Combine rankings using Reciprocal Rank Fusion."""
        # RRF: score = 1/(k+rank) for each system, then sum
        k = 60  # RRF constant
        scores = {}

        # Vector scores (already sorted by score)
        for rank, r in enumerate(vector_results):
            idx = self.texts.index(r.text)
            scores[idx] = scores.get(idx, 0) + (1 - bm25_weight) / (k + rank)

        # BM25 scores
        bm25_ranked = sorted(enumerate(bm25_scores), key=lambda x: -x[1])
        for rank, (idx, score) in enumerate(bm25_ranked):
            if score > 0:
                scores[idx] = scores.get(idx, 0) + bm25_weight / (k + rank)

        # Sort by combined score
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        return [SearchResult(self.texts[idx], self.metadata[idx], score)
                for idx, score in ranked]
```

**Dependency:** `pip install rank-bm25`

### Action Filtering (Flag-Based, Not Heuristic)

**Problem:** Action requests and confirmations pollute session vector index, degrading RAG quality.

**Current State:** `is_action_message()` in `session_content_store.py` uses text pattern matching (heuristics) which misses cases and creates false positives.

**Solution:** Use the authoritative `action_executed` flag from `OrchestratorResult` instead of guessing from text patterns.

#### Architecture: Two-Layer Action History

| Layer | Storage | Purpose | Retention |
|-------|---------|---------|-----------|
| **Quick Access** | `session_actions.json` | Cross-chat action history for prompt injection | Rolling (session_actions_limit) |
| **Deep Lookup** | `turns.jsonl` | Full metrics for analysis and lookup | Append-only (permanent) |

#### Implementation Steps

**Step 1: Pass `action_executed` through message save flow**

**File:** `ws_server.py` - Update message append functions

```python
# Current signature:
def append_assistant_message(chat: dict, content: str) -> dict:

# New signature - add action_executed flag:
def append_assistant_message(chat: dict, content: str, action_executed: bool = False) -> dict:
    """
    @param action_executed: True if this was an action turn (from OrchestratorResult)
    """
    message = {...}
    # Pass flag to memory cycle
    on_message_saved(chat, message, action_executed=action_executed)
```

**Step 2: Update `on_message_saved()` to use flag**

**File:** `retrieval/memory_cycle.py`

```python
def on_message_saved(chat_dict: Dict, message: Dict, action_executed: bool = False) -> Dict:
    """
    @param action_executed: True if this turn executed an action (skip session vector)
    """
    # ... existing code ...

    if action_executed:
        # ACTION TURN: Log to session_actions.json only, skip vector
        condensed = condense_action(message, prev_user_content)
        if condensed:
            add_session_action(condensed, chat_title, chat_id)
        print(f"[MemoryCycle] Action turn - skipping session vector")
    else:
        # CONTENT TURN: Index to session vector
        if not content.startswith('[Large content:'):
            store = get_session_content_store()
            store.add(content, chat_id, chat_title, role, timestamp)

        # Track interaction count for rolling summary
        state['interaction_count'] = state.get('interaction_count', 0) + 1
```

**Step 3: Remove heuristic filtering from session_content_store.py**

The `is_action_message()` function becomes a fallback only - primary filtering happens via flag.

```python
def add(self, content: str, chat_id: str, ..., action_turn: bool = False):
    """
    @param action_turn: If True, skip indexing (authoritative flag from orchestrator)
    """
    # Primary filter: flag-based
    if action_turn:
        return

    # Fallback filter: heuristic (for edge cases)
    if not is_substantive(content):
        return

    # ... rest of indexing logic
```

### Rolling Intent Summarization

**Trigger:** Every 5 total interactions (chat + action turns)

**Storage:** `chat.json` → `summaries.rolling`

**File:** `retrieval/memory_cycle.py`

```python
SUMMARY_INTERACTION_THRESHOLD = 5  # Configurable

async def check_and_create_rolling_summary(chat_dict: Dict) -> Optional[str]:
    """
    Check if we've hit 5 interactions and need to summarize.
    Returns summary text if created, None otherwise.
    """
    state = chat_dict.get('context_state', {})
    count = state.get('interaction_count', 0)

    if count < SUMMARY_INTERACTION_THRESHOLD:
        return None

    # Get messages since last summary
    last_summarized = state.get('last_summarized_idx', 0)
    messages = chat_dict.get('messages', [])
    to_summarize = messages[last_summarized:last_summarized + SUMMARY_INTERACTION_THRESHOLD * 2]

    if not to_summarize:
        return None

    # LLM call to extract intent
    summary = await extract_intent_summary(to_summarize)

    # Store in chat JSON
    if 'summaries' not in chat_dict:
        chat_dict['summaries'] = {}

    # Append to rolling summary (keep last 3 summaries)
    rolling = chat_dict['summaries'].get('rolling', [])
    rolling.append({
        'text': summary,
        'from_idx': last_summarized,
        'to_idx': last_summarized + len(to_summarize),
        'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ')
    })
    chat_dict['summaries']['rolling'] = rolling[-3:]  # Keep last 3

    # Update state
    state['last_summarized_idx'] = last_summarized + len(to_summarize)
    state['interaction_count'] = 0  # Reset counter

    return summary

async def extract_intent_summary(messages: List[Dict]) -> str:
    """LLM call to extract intent/topic from messages."""
    # Use rolling_summary.md prompt template
    # Return condensed intent (50-100 tokens)
```

**Prompt Template:** `data/prompts/rolling_summary.md`

```markdown
Summarize the following conversation exchange into a brief intent statement.
Focus on: what the user wanted, what actions were taken, key topics discussed.
Output 1-2 sentences max.

Messages:
{messages}

Intent summary:
```

### Hybrid Action Lookup

**Quick Access (session_actions.json):**
- Used in prompt: `format_session_actions_for_prompt()`
- Rolling window: last N actions (session_actions_limit)
- Format: `[{"text": "GoogleIt: cats", "chat_id": "...", "ts": "..."}]`

**Deep Lookup (turns.jsonl):**
- Append-only metrics log
- Rich data: `turn_state`, `decision_type`, `execution_success`, `total_ms`
- Query by chat_id for action history analysis

```python
def get_action_history_for_chat(chat_id: str, limit: int = 20) -> List[Dict]:
    """Query turns.jsonl for action history."""
    turns_path = Path("data/metrics/turns.jsonl")
    actions = []

    with open(turns_path) as f:
        for line in f:
            turn = json.loads(line)
            if turn.get('chat_id') == chat_id and turn.get('handoff'):
                actions.append({
                    'decision_type': turn.get('decision_type'),
                    'timestamp': turn.get('timestamp'),
                    'execution_success': turn.get('execution_success'),
                    'top_score': turn.get('top_score')
                })

    return actions[-limit:]
```

### Updated Checklist

- [x] Pass `action_executed` flag from `OrchestratorResult` to `append_assistant_message()`
- [x] Update `on_message_saved()` to use flag instead of heuristics
- [x] Skip session vector indexing when `action_executed=True`
- [x] Track `interaction_count` in chat `context_state`
- [x] Implement `check_and_create_rolling_summary()` (trigger every 5 interactions)
- [x] Create `data/prompts/rolling_summary.md` template
- [x] Store rolling summaries in `chat.json` → `summaries.rolling`
- [x] Include rolling summary in prompt building
- [x] Add `get_action_history_for_chat()` for deep lookup from turns.jsonl
- [x] Test: Action turns skip session vector ✅ Verified 2025-12-24
- [x] Test: Content turns indexed to session vector ✅ Verified 2025-12-24
- [x] Test: After 5 interactions, rolling summary created ✅ Verified 2025-12-24
- [x] Test: Rolling summary appears in prompt context ✅ Verified 2025-12-24

### Configuration

Add to `llm_config.json`:

```json
{
  "context": {
    "summary_interaction_threshold": 5,
    "max_rolling_summaries": 3,
    "rolling_summary_token_budget": 100
  }
}
```

---

## Phase 7: vStore Foundation

**Status:** 🔲 Not Started

### Goal

Introduce user-curated vector storage with two tiers:
- **Chat vStore** - content scoped to a single chat
- **Project vStore** - content shared across all chats in a project

### Key Distinction: vStore vs Memory

| Concept | vStore | Memory |
|---------|--------|--------|
| **Purpose** | Curated reference content | Behavioural/conversational context |
| **Storage** | Exact, verbatim, never summarised | Lossy, summarised, compressed |
| **Persistence** | Permanent until deleted | Session or rolling window |
| **Control** | User-curated (opt-in) | Automatic |

**Rule:** vStore content is never summarised for storage, only chunked for embedding.

### Data Schema

**Metadata Schema** (`vectors/content/metadata.json`):
```json
{
  "items": [
    {
      "id": "vs_abc123",
      "label": "Shark Article",
      "source": "pasted",
      "source_chat_id": "chat_xyz",
      "content_hash": "sha256...",
      "chunk_ids": [0, 1, 2, 3],
      "char_count": 2450,
      "file_path": "files/abc123_shark-article.md",
      "created_at": "2025-12-24T10:00:00Z",
      "tags": ["research", "animals"]
    }
  ]
}
```

### Implementation

**File:** `retrieval/vstore.py`

```python
class VStoreItem:
    """Single item in a vStore."""
    id: str
    label: str
    source: Literal["pasted", "uploaded", "promoted"]
    content_hash: str
    chunk_ids: List[int]
    char_count: int
    file_path: Optional[str]
    created_at: str
    tags: List[str]

class ChatVStore(VectorStore):
    """Per-chat user-curated content."""

    def __init__(self, project_id: str, chat_id: str):
        path = f"projects/{project_id}/chats/{chat_id}/vectors/content"
        super().__init__(path)

    def add_content(self, content: str, label: str, tags: List[str] = None) -> VStoreItem:
        """Add user-curated content to chat vStore."""
        # 1. Hash content for dedup
        # 2. Chunk content for embedding
        # 3. Add chunks to FAISS
        # 4. Store original in files/
        # 5. Update metadata.json

    def remove_item(self, item_id: str) -> bool:
        """Remove item and its chunks."""

    def search(self, query: str, k: int = 5) -> List[VStoreResult]:
        """Semantic search over stored content."""

class ProjectVStore(VectorStore):
    """Cross-chat user-curated content."""

    def __init__(self, project_id: str):
        path = f"projects/{project_id}/vectors/content"
        super().__init__(path)

    def promote_from_chat(self, chat_vstore: ChatVStore, item_id: str, keep_in_chat: bool = False):
        """Promote chat item to project level."""
```

### Capabilities

| Capability | Description | Params |
|------------|-------------|--------|
| `AddToChatVStore` | Save content to current chat's vStore | `content`, `label?`, `tags?` |
| `AddToProjectVStore` | Save content to project vStore | `content`, `label?`, `tags?` |
| `PromoteToProject` | Move chat item to project | `item_id`, `keep_in_chat?` |
| `RemoveFromVStore` | Delete item | `item_id`, `scope` (chat/project) |
| `ListVStore` | List items | `scope`, `search?` |
| `SearchVStore` | Semantic search | `query`, `scope`, `limit` |

### Chunking Rules (from §3.5)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `chunk_size` | 512 chars | Balances context vs embedding precision |
| `chunk_overlap` | 64 chars | Prevents hard boundary loss |
| `split_preference` | sentence > paragraph > fixed | Avoid mid-sentence breaks |
| `min_chunk_size` | 128 chars | Reject fragments below this |

**Split priority:**
1. Sentence boundary (`. ` or `.\n`)
2. Paragraph boundary (`\n\n`)
3. Fixed offset (only if no natural break within 2× chunk_size)

### Chunk Metadata (required on ingest)

Each chunk must have:
```json
{
  "item_id": "vs_abc123",
  "chunk_index": 0,
  "char_start": 0,
  "char_end": 512
}
```
**Rule:** Reject chunks without complete position metadata.

### Embedding Validation

On index load, validate embedding compatibility:
```python
def validate_index(metadata: dict, config: dict) -> None:
    """Fail fast if index/config mismatch."""
    expected_dims = config["vstore"]["embedding"]["dimensions"]  # 768
    actual_dims = metadata.get("embedding_dimensions")
    if actual_dims != expected_dims:
        raise ValueError(f"Index/embedding mismatch (expected {expected_dims}, found {actual_dims}). Reindex required.")
```

### Checklist
- [ ] Create `retrieval/vstore.py` with VStoreItem, ChatVStore, ProjectVStore
- [ ] Content hashing for deduplication
- [ ] Chunking with overlap (512 chars, 64 overlap)
- [ ] Sentence-aware splitting (prefer natural breaks)
- [ ] Reject chunks < 128 chars
- [ ] Chunk position metadata (`char_start`, `char_end`)
- [ ] Embedding dimension validation on index load
- [ ] Store embedding metadata in `metadata.json` header
- [ ] Metadata persistence (`metadata.json`)
- [ ] Original file storage (`files/`)
- [ ] Add capabilities to `internal_capabilities.json`
- [ ] Handlers in `ws_server.py`
- [ ] Test: Add content, list, search, remove
- [ ] Test: Embedding mismatch fails fast

---

## Phase 8: vStore UI Integration

**Status:** 🔲 Not Started

### Goal

Integrate vStore into the HUD interface:
1. Prompt area toggle for saving content
2. Sidebar vStore section
3. Item detail view

### Prompt Area Toggle

When content exceeds threshold (e.g., 200+ chars), show save options:

```
┌─────────────────────────────────────────────────────────────┐
│  [Ask me anything...]                                        │
│                                                              │
│  ┌─────────────────────────────────────┐                    │
│  │ Large content detected (2.4kb)      │                    │
│  │                                     │                    │
│  │  ☐ Save to Chat vStore              │                    │
│  │  ☐ Save to Project vStore           │                    │
│  │                                     │                    │
│  │  Label: [Auto-generated...]     [✎] │                    │
│  └─────────────────────────────────────┘                    │
│                                              [Send →]        │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar vStore Section

```
┌─────────────────────────────────────┐
│  📁 Project: Om-E Web               │
│                                     │
│  ▼ 📦 Project vStore (3)            │
│    ├── 📄 Shark Biology    [↗][🗑]  │
│    ├── 📄 Guitar Specs     [↗][🗑]  │
│    └── [+ Upload file]              │
│                                     │
│  ▼ 💬 Chats                         │
│    ▼ jazz guitar research           │
│      ▼ 📦 vStore (2)                │
│        ├── 📄 Ibanez vs Gibson [↑]  │
│        ├── 📄 Price List       [↑]  │
│        └── [+ Add]                  │
└─────────────────────────────────────┘
```

### Checklist
- [ ] Content length detection in HUD prompt area
- [ ] Toggle UI component
- [ ] Label input field
- [ ] Wire to AddToChatVStore / AddToProjectVStore capabilities
- [ ] Sidebar vStore section
- [ ] Item list with actions (view, delete, promote)
- [ ] Item detail modal/panel
- [ ] Test: Paste large content, toggle save, verify stored

---

## Phase 9: vStore RAG Integration

**Status:** 🔲 Not Started

### Goal

Integrate vStore into the RAG query flow with proper priority and attribution.

### Query Priority Order

```
1. Chat vStore (current chat)
   └── Most specific, user-curated for this conversation

2. Project vStore
   └── Cross-chat curated knowledge

3. Session Memory (ephemeral)
   └── Recent conversation context

4. Capabilities
   └── What actions can be taken
```

**Do not change this order.** It matches how humans expect answers to feel.

### Retrieval Contract

| Rule | Description |
|------|-------------|
| **Excerpts, not documents** | Retrieval returns excerpts, never full documents |
| **Full content on request** | Full content shown only on explicit user request |
| **Excerpt size cap** | Max 512 chars per excerpt (configurable) |
| **Explainability** | User can always ask "what did you use to answer that" |

### Multi-Hit Handling

| Matches | Behaviour |
|---------|-----------|
| **0** | Acknowledge clearly: "I don't have any saved content about X" |
| **1-2** | Summarise inline with source attribution |
| **3+** | List items, ask user which to use |

### Source Attribution

Every RAG hit must carry:

| Field | Description |
|-------|-------------|
| `source` | `chat_vstore` / `project_vstore` / `session_memory` |
| `label` | User-assigned label or auto-generated |
| `date_added` | When content was saved |
| `item_id` | For vStore items, enables "tell me more about this" |

### Implementation

**File:** `retrieval/query.py` - Update existing query function:

```python
async def query_with_vstore(
    user_message: str,
    chat_id: str,
    project_id: str = "default",
    k_vstore: int = 3,
    k_session: int = 3,
    k_caps: int = 7
) -> RetrievalResult:
    """Query all stores with vStore priority."""

    results = []

    # 1. Chat vStore (highest priority)
    chat_vstore = ChatVStore(project_id, chat_id)
    chat_results = chat_vstore.search(user_message, k=k_vstore)
    for r in chat_results:
        r.source = "chat_vstore"
    results.extend(chat_results)

    # 2. Project vStore
    project_vstore = ProjectVStore(project_id)
    project_results = project_vstore.search(user_message, k=k_vstore)
    for r in project_results:
        r.source = "project_vstore"
    results.extend(project_results)

    # 3. Session memory (existing)
    session_results = get_session_context(user_message, chat_id)

    # 4. Capabilities (existing)
    cap_results = cap_store.search(user_message, k=k_caps)

    return RetrievalResult(
        vstore=results,
        session=session_results,
        capabilities=cap_results
    )
```

### "What Do I Have Saved?" Query

This is a **first-class query type**, not a side effect of search:

```
User: "What do I have saved about sharks?"

Om-E: "You have 2 items about sharks:
       1. Shark Biology (2.4kb) - saved Dec 24 in project vStore
       2. Ocean Facts (1.1kb) - saved Dec 20 in 'research' chat

       Want me to summarise either one?"
```

### When NOT to Use RAG (from §6.11)

RAG is for **reference retrieval**, not for everything. Skip RAG for:

| Scenario | Why | Alternative |
|----------|-----|-------------|
| **Creative generation** | User wants original, not recalled | LLM generation without RAG |
| **Real-time/volatile data** | vStore may be stale | Direct page scan |
| **Behavioural instructions** | "Always do X" rules | System prompt or capabilities |
| **Sensitive data** | Credentials, keys | Never store in vStore |
| **Action parameters** | Dynamic values | LLM extraction from conversation |

**Detection patterns (skip RAG):**
- User asks for "something new" or "original"
- Query is about current page state
- Query matches a capability exactly
- Message is a command, not a question

```python
def should_skip_rag(message: str, capabilities: List) -> bool:
    """Determine if RAG should be skipped for this message."""
    # Creative request
    if any(w in message.lower() for w in ["original", "new idea", "create", "imagine"]):
        return True
    # Direct capability match
    if exact_capability_match(message, capabilities):
        return True
    # Command, not question
    if is_imperative_command(message):
        return True
    return False
```

**Rule:** When in doubt, prefer no RAG injection over irrelevant injection.

### Checklist
- [ ] Update `query.py` with vStore priority
- [ ] Source attribution on all results
- [ ] Excerpt extraction (max 512 chars)
- [ ] Multi-hit handling logic
- [ ] "What do I have saved" detection
- [ ] `should_skip_rag()` detection function
- [ ] Skip RAG for creative/command patterns
- [ ] Integration with orchestrator prompt building
- [ ] Test: Save content, query, verify attribution
- [ ] Test: Creative request skips RAG

---

## Phase 10: Project Structure Migration

**Status:** 🔲 Not Started

### Goal

Migrate from flat `data/chats/` to project-scoped structure.

### Migration Steps

1. Create default project structure:
   ```
   data/projects/default/
   ├── project.json
   ├── vectors/
   │   └── content/     # Project vStore (empty initially)
   └── chats/           # Migrated chats
   ```

2. Move existing chats:
   ```
   data/chats/{id}.json → data/projects/default/chats/{id}/chat.json
   ```

3. Update all file path references in:
   - `ws_server.py`
   - `llm/orchestrator.py`
   - `retrieval/*.py`

### Project JSON Schema

```json
{
  "project_id": "default",
  "name": "Default Project",
  "owner_id": "default",
  "created_at": "2025-12-24T00:00:00Z",
  "updated_at": "2025-12-24T00:00:00Z",
  "settings": {
    "auto_summarise": true
  }
}
```

### Backward Compatibility

- Existing chats continue working without vStore
- Session memory functions as before
- vStore is additive, not replacing existing functionality

### Checklist
- [ ] Create `data/projects/default/` structure
- [ ] Migration script for existing chats
- [ ] Update `CHATS_DIR` references in ws_server.py
- [ ] Update orchestrator path references
- [ ] Update retrieval store paths
- [ ] Test: Verify existing chats work after migration
- [ ] Test: New chats created in project structure

---

## Phase 11: vStore File Upload

**Status:** 🔲 Not Started

### Goal

Allow users to upload files (.md, .txt, .pdf, .json) to their vStore.

### Supported Formats

| Format | Processing |
|--------|------------|
| `.md` | Direct text extraction |
| `.txt` | Direct text extraction |
| `.pdf` | PDF text extraction (PyPDF2 or pdfplumber) |
| `.json` | JSON stringify or key extraction |

### Upload Flow

```
User clicks [+ Upload] in sidebar
        ↓
File picker (browser native)
        ↓
File sent to server via WebSocket (base64 encoded)
        ↓
Server: Validate format, size < 1MB
        ↓
Server: Extract text content
        ↓
Server: Chunk and index to vStore
        ↓
Server: Store original in files/
        ↓
UI: Item appears in vStore list
```

### Capability

```json
{
  "UploadToVStore": {
    "group": "vstore",
    "label": "Upload file to vStore",
    "description": "Upload a document to your knowledge base",
    "params": {
      "file_data": "base64 encoded file content",
      "filename": "original filename",
      "scope": "chat or project"
    }
  }
}
```

### Checklist
- [ ] File upload UI in HUD sidebar
- [ ] Base64 encoding in extension
- [ ] Upload message type in WebSocket protocol
- [ ] Server-side file validation
- [ ] Text extraction for each format
- [ ] PDF extraction (add pdfplumber dependency)
- [ ] Chunking and indexing
- [ ] Original file storage
- [ ] Test: Upload .md, .txt, .pdf files

---

## Phase 12: Global Session Context

**Status:** 🔲 Not Started (Lower Priority)

### Goal

Persist action history and chat flow across chat switches within a session.

### Session State

```python
class SessionState:
    session_id: str
    started_at: str
    actions: List[Dict]      # Last 10 global actions
    chat_flow: List[Dict]    # Trail of chats visited
    current_chat_id: str
    previous_chat_id: str
```

### Benefits

- "go back to what we were doing" → knows previous chat
- "what did I just search" → knows last action even if in different chat
- Context carries across chat switches

### Note

This phase is **lower priority** than vStore. The vStore provides more user value and the session context is a nice-to-have for conversational flow.

### Checklist
- [ ] Create `retrieval/session_state.py`
- [ ] `add_action()` - record actions globally (max 10)
- [ ] `switch_chat()` - track chat flow
- [ ] `format_for_prompt()` - format for injection
- [ ] Hook into ws_server.py for action recording
- [ ] Hook into SetCurrentChat for chat switch tracking
- [ ] Test: Actions persist across chat switches

---

## Appendices

### A. Configuration Reference

Add to `llm_config.json`:

```json
{
  "vstore": {
    "enabled": true,
    "content_threshold": 200,

    "embedding": {
      "model": "BAAI/bge-base-en-v1.5",
      "dimensions": 768,
      "version": "1.0",
      "fail_on_mismatch": true
    },

    "chunking": {
      "chunk_size": 512,
      "chunk_overlap": 64,
      "min_chunk_size": 128
    },

    "excerpt_max_chars": 512,
    "max_chunks_per_item": 20,
    "default_search_limit": 5,
    "supported_formats": [".md", ".txt", ".pdf", ".json"],
    "quotas": {
      "max_items_per_chat": 100,
      "max_items_per_project": 500,
      "max_total_size_mb": 50,
      "max_file_size_mb": 1
    }
  }
}
```

### B. Natural Language Mappings

| User Says | Capability |
|-----------|------------|
| "save this to my knowledge" | AddToChatVStore |
| "add to project" | AddToProjectVStore |
| "what do I have about sharks" | SearchVStore |
| "remove the guitar article" | RemoveFromVStore |
| "show my saved content" | ListVStore |
| "promote this to project" | PromoteToProject |

### C. Test Cases

| Query | Expected |
|-------|----------|
| "What do I have saved about X?" | List matching vStore items |
| Large paste + toggle save | Content stored in vStore |
| "Remove the shark article" | Item deleted from vStore |
| Upload .pdf | Content extracted and indexed |
| Query after save | vStore content in RAG results |

### D. Migration from Large Payloads

Existing `data/large_payloads/` can optionally be imported to vStore:

```python
# Future: Optional import script
def import_large_payloads_to_vstore(project_id: str):
    """Import existing large payloads to project vStore."""
    for file in glob.glob("data/large_payloads/*.txt"):
        content = Path(file).read_text()
        # Auto-label from content
        # Add to project vStore
```

---

## Next Steps

1. ~~**Complete Phase 6**~~ ✅ Done - Action filtering + rolling summaries working
2. **Start Phase 7** - vStore Foundation (biggest value add)
3. **Then Phase 8** - vStore UI (makes it usable)

The vStore is the highest-value addition and should be prioritised over project structure migration and session context.

---

## Phase 6 Implementation Summary (2025-12-24)

**Key Changes:**

| File | Changes |
|------|---------|
| `ws_server.py` | Added `action_executed` param to `append_assistant_message()`, calls `check_and_create_rolling_summary()` |
| `retrieval/memory_cycle.py` | Flag-based filtering in `on_message_saved()`, `check_and_create_rolling_summary()`, config helpers |
| `data/llm_config.json` | Added `summary_interaction_threshold`, `max_rolling_summaries`, `rolling_summary_token_budget` |

**Test Results:**
- 36 messages sent (18 turns) with mix of chat and action commands
- Actions (scroll, navigate, tabs) properly filtered from RAG session vector
- 3 rolling summaries created covering interactions 18-24, 24-30, 30-36
- Summaries appear in prompt as `[Chat summary: [...]]`
- Content turns (ML discussions) properly indexed to session vector
