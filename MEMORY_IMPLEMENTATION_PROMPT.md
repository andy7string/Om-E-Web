# Memory Cycle Implementation Prompt

You are implementing a memory cycle system for Om_E_Web. Read `vectorsimplementation.md` for the full architecture, specifically the "Memory Cycle & Context Window" section.

---

## Context

Om_E_Web is a Chrome Extension + Python WebSocket server that helps users browse the web via LLM. Currently, ALL chat messages are dumped into the LLM prompt, causing context blowout. You need to implement a rolling memory system.

## Goal

Implement a 400-token context budget with:
- **Actions**: Last 5, condensed (~75 tok)
- **Recent**: Last 2-3 exchanges (~150 tok)
- **Memory**: Vector-retrieved summaries (~150 tok)

## The Cycle

```
MESSAGE SAVED → Classify (action/content) → Track
                    ↓
        ACTION: Add to rolling list (max 5)
        CONTENT: Add to token counter
                    ↓
        Counter > 500? → Summarize batch → Store in vector → Reset
                    ↓
USER QUERY → Retrieve: actions + recent + memory vector + RAG caps
                    ↓
        Build prompt (~400 tok context) → LLM decides
```

---

## Implementation Order

### Phase 1: Chat State & Actions

**Files:** `ws_server.py`, `retrieval/chat_context.py`

1. Add `context_state` to chat JSON schema:
```json
{
  "context_state": {
    "token_counter": 0,
    "last_summarized_idx": 0,
    "recent_actions": []
  }
}
```

2. Create `init_context_state(chat_dict)` - initialize state on chat create/load

3. Create `on_message_saved(chat_dict, message)`:
   - Use existing `classify_message()` from `chat_context.py`
   - If ACTION: condense to one-liner, add to `recent_actions` (max 5)
   - If CONTENT: add tokens to `token_counter`

4. Create `condense_action(message)` - convert action message to short text:
   - `"Executing YouTubeSearch..."` → `"Searched YouTube"`
   - `{"cap": "ScrollDown"}` → `"Scrolled down"`

5. Hook `on_message_saved()` into:
   - `append_user_message()` in ws_server.py
   - `append_assistant_message()` in ws_server.py

**Test:** Send messages, verify `context_state` updates in chat JSON.

---

### Phase 2: Token Counting & Summarization

**Files:** `retrieval/chat_context.py`, `data/prompts/batch_summary.md`

1. Use existing `estimate_tokens()` from `llm/contracts.py`

2. In `on_message_saved()`, check threshold:
```python
if state['token_counter'] >= 500:
    await trigger_summarization(chat_dict)
```

3. Create `trigger_summarization(chat_dict)`:
   - Get content messages since `last_summarized_idx`
   - Call LLM to summarize batch
   - Store summary (Phase 3)
   - Reset `token_counter`, update `last_summarized_idx`

4. Create `data/prompts/batch_summary.md`:
```markdown
Summarize this conversation batch in 1-2 sentences.
Focus on user INTENT and TOPICS, not actions taken.

Examples:
- "User interested in cats, searched YouTube and Google"
- "Discussed URL construction and how Om-E handles navigation"

Batch:
{messages}

Summary (max 50 words):
```

**Test:** Send enough messages to hit 500 tokens, verify summarization triggers.

---

### Phase 3: Vector Storage

**Files:** `retrieval/chat_context.py`, use existing `retrieval/vector_store.py`

1. Create project memory vector store:
```python
# For now, single project. Later: projects/{id}/vectors/memory/
MEMORY_VECTOR_PATH = "data/vectors/memory"
```

2. Create `store_memory_summary(chat_id, summary, message_range)`:
   - Embed summary text
   - Store with metadata: chat_id, chat_title, range, timestamp

3. Create `query_project_memory(query, k=2, max_tokens=150)`:
   - Semantic search on query
   - Return top k summaries within token budget

**Test:** Store summary, query it back, verify relevance.

---

### Phase 4: Query Integration

**Files:** `retrieval/chat_context.py`, `llm/orchestrator.py`

1. Create `get_context_for_prompt(chat_id, user_message)`:
```python
def get_context_for_prompt(chat_id: str, user_message: str) -> dict:
    chat_dict = load_chat(chat_id)
    state = chat_dict.get('context_state', {})

    # 1. Actions (75 tok)
    actions = format_actions(state.get('recent_actions', [])[-5:])

    # 2. Recent content (150 tok budget)
    recent = get_recent_content(chat_dict, budget=150)

    # 3. Memory vector (150 tok)
    memories = query_project_memory(user_message, k=2, max_tokens=150)

    return {'actions': actions, 'recent': recent, 'memory': memories}
```

2. Replace `_get_rolling_history()` in `orchestrator.py`:
   - Import `get_context_for_prompt`
   - Build history from structured context instead of raw messages

**Test:** Full cycle - send message, verify prompt uses structured context.

---

### Phase 5: Project Structure (Later)

Migrate to:
```
data/projects/{project_id}/
├── chats/
├── memory/
├── prompts/
└── vectors/memory/
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `ws_server.py` | Has `append_user_message()`, `append_assistant_message()`, `load_chat()`, `save_chat()` |
| `retrieval/chat_context.py` | Has `classify_message()`, `estimate_tokens()` |
| `retrieval/vector_store.py` | Base FAISS wrapper |
| `llm/orchestrator.py` | Has `_get_rolling_history()` to replace |
| `llm/contracts.py` | Has `estimate_tokens()` |

## Existing Functions You Can Use

- `classify_message(msg)` → 'action' or 'content'
- `estimate_tokens(text)` → int
- `load_chat(chat_id)` → dict
- `save_chat(chat_dict)` → bool
- `VectorStore.add()`, `VectorStore.search()`

## Constants

```python
CONTEXT_BUDGET = {
    'actions': 75,
    'recent': 150,
    'memory': 150,
    'total': 400
}
BATCH_THRESHOLD = 500
MAX_ACTIONS = 5
```

---

## Workflow

1. Read the plan in `vectorsimplementation.md`
2. Start with Phase 1
3. Test each phase before moving on
4. Commit after each phase
5. Update checklist in `vectorsimplementation.md` as you go
