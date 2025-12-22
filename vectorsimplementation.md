# Single-Phase RAG Implementation Plan

**Goal:** User message → RAG retrieval → Single LLM call → Response

**Model:** `BAAI/bge-base-en-v1.5` (768 dims)

---

## Architecture

```
User types message
        ↓
RAG queries elements + capabilities (semantic search on user message)
        ↓
Build prompt with browser context + retrieved items
        ↓
Single LLM call
        ↓
Response (chat or action JSON)
```

**No two-phase. No intent parsing. Just retrieval and execution.**

---

## Data Sources

| Store | Source | Why |
|-------|--------|-----|
| **elements** | `text.json` | Has full structured data with labels, types, selectors |
| **capabilities** | `data/capabilities/*.json` | Browser actions (scroll, tabs, nav, etc.) |

### Critical: Use text.json NOT text.md

`text.json` has proper structure:
```json
"18": {
  "label": "Bondi gunman was follower of notorious antisemitic Sydney cleric\nNaveed Akram...",
  "type": "Link",
  "tag": "a",
  "selectors": ["a[href*='/news/...']"],
  "href": "https://..."
}
```

`text.md` has broken structure where headlines and IDs are on different lines. Don't parse it.

---

## Directory Structure

```
om_e_web_ws/
├── retrieval/
│   ├── __init__.py
│   ├── vector_store.py       # Base FAISS wrapper
│   ├── elements_store.py     # Indexes text.json elements
│   ├── capabilities_store.py # Indexes capabilities
│   └── query.py              # query() function
├── llm/
│   ├── agent.py              # OmEAgent with RAG
│   └── client.py             # LLM API client
└── @site_structures/
    ├── text.json             # Source for elements (structured)
    └── text.md               # Human-readable (don't parse)
```

---

## Implementation Steps

### Step 1: Base VectorStore

**File:** `retrieval/vector_store.py`

- Singleton model loader (load once, share)
- `add(texts, metadata)` - embed and index
- `search(query, k, threshold)` - return SearchResults
- `clear()` - reset index
- `save()/load()` - disk persistence

### Step 2: ElementsStore

**File:** `retrieval/elements_store.py`

```python
class ElementsStore(VectorStore):
    def build(self):
        """Build from text.json"""
        with open(TEXT_JSON_PATH) as f:
            data = json.load(f)

        for element_id, el in data['elements'].items():
            label = el.get('label', '')
            el_type = el.get('type', 'Link')

            texts.append(label)  # Full label for semantic search
            metadata.append({
                'id': int(element_id),
                'type': el_type,
                'label': label
            })

        self.add(texts, metadata)
```

**Key:** Index the FULL label (headlines, descriptions, etc.) so "Bondi article" matches.

### Step 3: CapabilitiesStore

**File:** `retrieval/capabilities_store.py`

- Load from `data/capabilities/*.json`
- Index `{name}: {label}` for each capability
- Save to disk (capabilities rarely change)

### Step 4: Query Function

**File:** `retrieval/query.py`

```python
def query(user_message: str, k_elements=7, k_caps=5) -> RetrievalResult:
    """Direct semantic search on user message."""
    elements = elements_store.search(user_message, k=k_elements)
    capabilities = caps_store.search(user_message, k=k_caps)

    return RetrievalResult(
        elements=[...],
        capabilities=[...],
        is_ambiguous=(top scores too close)
    )
```

### Step 5: Single-Phase Agent

**File:** `llm/agent.py`

```python
class OmEAgent:
    async def chat(self, message: str, browser_context: str) -> str:
        # 1. RAG retrieval
        result = query(message)

        # 2. Build prompt
        prompt = SYSTEM_PROMPT + browser_context + format_retrieved(result)

        # 3. Single LLM call
        response = await self._client.chat(system_prompt=prompt, messages=history)

        return response
```

### Step 6: Integration

**ws_server.py:**
- On text.json write → `rebuild_elements_store()`
- On chat message → `agent.chat(message, browser_context)`

---

## System Prompt (Minimal)

```
# Om-E Web Assistant

You are Om-E, a web navigation assistant. Direct, helpful, concise.

## How to Act

**Page elements** (from Retrieved Elements below):
- Link/Button → Click: {"act": ID}
- Input/Select → Fill: {"act": ID, "value": "text", "submit": true}

**Browser capabilities** (from Retrieved Capabilities below):
- {"cap": "Name"} or {"cap": "Name", "params": {...}}

## Output Format

Put JSON on its OWN LINE at the END of your message.

## Rules
1. If multiple similar elements, ask: "Did you mean A, B, or C?"
2. Chat normally for questions (no JSON needed)
3. Keep responses short

---

{browser_context}

**Retrieved Capabilities:**
{capabilities}

**Retrieved Elements:**
{elements}
```

---

## Debug File

Write `Ome_prompt_debug.md` after each call showing:
- User message
- Browser context
- RAG results (elements + capabilities with scores)
- Full prompt sent
- LLM response
- Timing (RAG ms, LLM ms, total ms)

---

## Test Cases

| Query | Expected Element |
|-------|------------------|
| "Bondi article" | ID 18: Bondi gunman was follower... |
| "search box" | ID 7: Search |
| "Gmail" | ID 2: Gmail |
| "scroll down" | Capability: ScrollDown |
| "go back" | Capability: GoBack |
| "new tab google" | Capability: OpenTab |

---

## What NOT To Do

1. **Don't parse text.md** - Use text.json
2. **Don't do two-phase** - No intent parsing, just retrieval
3. **Don't over-engineer** - Simple query → prompt → LLM
4. **Don't ask clarification before retrieval** - Retrieve first, clarify in response if needed
5. **Don't touch the rest of the system** - content.js, ws_server.py core, action execution all stay the same

---

## Scope: What Changes, What Doesn't

### DO Change
- `retrieval/` folder (new)
- `llm/agent.py` - Add RAG query before LLM call
- `ws_server.py` - Hook to rebuild elements store on text.json write

### DON'T Change
- `content.js` - DOM scanning, element extraction, text.json generation
- `sw.js` - Service worker, WebSocket bridge
- `ws_server.py` core - Action execution, capability dispatch
- `llm/client.py` - LLM API calls
- `site_configs.json` - Site-specific configs
- Action ID system - Works as-is, RAG just helps find the right ID

---

## Rollback

Set `RAG_AVAILABLE = False` in agent.py to fall back to full context prompt.

---

## Token Targets

| Metric | Before | After |
|--------|--------|-------|
| Prompt tokens | ~10,000 | ~1,000-1,500 |
| LLM latency | ~3s | ~1s |
| RAG latency | N/A | <100ms |

---

## Memory Store (Chat History Summarisation)

### Goal

Reduce context window usage by storing **summarised intent/topics** instead of raw chat messages. Vector search retrieves relevant past conversations without bloating the prompt.

### Architecture

```
Messages saved to chat
        ↓
Buffer in ChatMemoryStore (batch of 10)
        ↓
LLM summarises batch → intent/topic statements
        ↓
Summaries embedded and indexed in FAISS
        ↓
Search returns relevant summaries (not raw messages)
```

### What Gets Stored

**Store (content/intent):**
- "User searching for cat videos on YouTube"
- "Discussed HUD theming options"
- "User prefers blue theme over dark"
- "Troubleshooting React input handling on LinkedIn"

**Don't Store (nav/actions):**
- "Opening tab for you" ❌
- `{"act": 5}` / `{"cap": "ScrollDown"}` ❌
- "Clicked the button" ❌
- "Scrolled to section" ❌

### Files

| File | Purpose |
|------|---------|
| `data/prompts/memory_summarisation.md` | Prompt for LLM to summarise conversations |
| `retrieval/chat_memory_store.py` | Vector store with LLM summarisation |
| `retrieval/query.py` | Integrates memory into system prompt |

### Key Functions

**chat_memory_store.py:**
- `summarise_conversation(messages)` - LLM call to summarise batch
- `add_messages_for_summarisation(chat_id, title, messages)` - Buffer and summarise
- `search_memory(query, k)` - Semantic search over summaries
- `build()` - Full rebuild with LLM summarisation

**ws_server.py:**
- `_queue_message_for_memory(chat_dict, message)` - Called after each message append

### Flow

1. **Message Appended** → `append_user_message()` or `append_assistant_message()`
2. **Queued** → `_queue_message_for_memory()` adds to buffer
3. **Batch Full (10)** → `_flush_pending()` calls LLM to summarise
4. **Indexed** → Summaries added to FAISS with chat metadata
5. **Search** → `search_memory()` returns relevant summaries for prompt

### Prompt Format

The summarisation prompt (`memory_summarisation.md`) instructs the LLM to:
- Extract user intent and topics discussed
- Ignore navigation actions and JSON commands
- Return 1-3 concise statements (<100 chars each)
- Return `SKIP` if nothing substantive

### Memory in System Prompt

```
**Memory (past conversations):**
- [Dec 17] "HUD Chat": User prefers blue theme over dark
- [Dec 15] "YouTube Session": User searching for cat videos
```

### Startup Behaviour

On server startup:
1. Try to load cached memory index from disk
2. If not found, rebuild by summarising all chat files
3. Rebuilding makes LLM calls - can be slow with many chats

### Incremental Updates

Messages are indexed incrementally during runtime:
- Each append queues the message
- When batch reaches 10, LLM summarises and indexes
- Flush on chat switch to avoid losing buffered messages

### Token Savings

| Before | After |
|--------|-------|
| Raw message: 50-500 tokens | Summary: 10-30 tokens |
| 10 messages: ~1000 tokens | 1-3 summaries: ~50 tokens |

### Implementation Status

- [x] Summarisation prompt created
- [x] ChatMemoryStore with LLM summarisation
- [x] Incremental indexing wired to message save
- [x] Memory integrated into system prompt
- [ ] Elements store (doing last)

---

## Multi-User Project Architecture

Four-tier system: Users → Projects → Chats → Memory

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM                                          │
│  data/                                                                       │
│  ├── users/                        # Multi-user support                      │
│  │   └── {user_id}/                                                          │
│  │       ├── profile.json          # Preferences, timezone, theme            │
│  │       └── vectors/                                                        │
│  │           └── memory/           # User-level permanent memory             │
│  │               ├── index.faiss                                             │
│  │               └── metadata.json                                           │
│  │                                                                           │
│  └── projects/                                                               │
│      └── {project_id}/             # Each project is self-contained          │
│          ├── project.json          # Metadata: owner, name, created          │
│          │                                                                   │
│          ├── chats/                # Raw conversation JSONs                  │
│          │   └── {chat_id}.json                                              │
│          │                                                                   │
│          ├── memory/               # Processed memory per chat               │
│          │   └── {chat_id}.json    # Actions, content, summary               │
│          │                                                                   │
│          ├── prompts/              # Custom prompts for this project         │
│          │   ├── system.md         # Custom system prompt                    │
│          │   ├── moderation.md     # Moderation rules                        │
│          │   └── {custom}.md       # User-created prompts                    │
│          │                                                                   │
│          └── vectors/                                                        │
│              ├── memory/           # Chat summaries searchable               │
│              │   ├── index.faiss                                             │
│              │   └── metadata.json                                           │
│              │                                                               │
│              └── rag/              # Harvested content (user-curated)        │
│                  ├── index.faiss   # Docs, code, research                    │
│                  └── metadata.json                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hierarchy

```
User (andy)
  ├── profile.json                    # "I prefer dark mode", "AEST timezone"
  ├── vectors/memory/                 # Permanent cross-project memory
  │
  └── owns projects:
      │
      ├── om_e_web/                   # This project
      │   ├── chats/                  # HUD work, vector impl, etc.
      │   ├── memory/                 # Processed chat context
      │   ├── prompts/                # Custom prompts
      │   └── vectors/
      │       ├── memory/             # "What did we discuss about HUD?"
      │       └── rag/                # Codebase docs, architecture notes
      │
      ├── client_site/                # Another project
      │   └── ...
      │
      └── general/                    # Default/catch-all project
          └── ...
```

### Memory Levels

| Level | Scope | Storage | Trigger |
|-------|-------|---------|---------|
| **User** | Cross-project | `users/{id}/vectors/memory/` | "Remember permanently" |
| **Project** | Within project | `projects/{id}/vectors/memory/` | "Remember for this project" |
| **Chat** | Single conversation | `projects/{id}/memory/{chat}.json` | Automatic (rolling) |

### Search Priority

```
User asks: "What theme do I prefer?"

1. Chat memory     → Recent discussion context
2. Project memory  → Project-specific knowledge
3. User memory     → Preferences, permanent facts
```

### Project JSON Schema

```json
// projects/{project_id}/project.json
{
  "project_id": "om_e_web",
  "name": "Om-E Web",
  "owner_id": "andy",
  "created_at": "2025-12-01T00:00:00Z",
  "updated_at": "2025-12-22T19:00:00Z",
  "settings": {
    "default_prompt": "system.md",
    "auto_summarise": true
  }
}
```

### Chat Memory JSON Schema

```json
// projects/{project_id}/memory/{chat_id}.json
{
  "chat_id": "20251222050550_8ccffe",
  "chat_title": "Vector Implementation",
  "last_processed": "2025-12-22T19:30:00Z",
  "message_count": 79,
  "tokens": 497,

  "summary": "Discussed chat context window, action/content separation",

  "recent_actions": [
    {"type": "cap", "target": "SetTheme", "text": "Changed theme to atom"},
    {"type": "cap", "target": "YouTubeIt", "text": "Searched bamboo labs"}
  ],

  "recent_content": [
    {"role": "user", "content": "how did you figure that out"},
    {"role": "assistant", "content": "I use context and capabilities..."}
  ]
}
```

### Custom Prompts

```markdown
// projects/{project_id}/prompts/system.md
You are Om-E, helping with the {{project_name}} project.

Project context:
{{project_summary}}

// projects/{project_id}/prompts/moderation.md
Rules for this project:
- No external API calls without confirmation
- Always explain code changes before making them
```

### Implementation Order

1. ✅ Chat memory filtering (action/content separation)
2. ✅ Chat context processing (memory/{chat}.json)
3. ⏳ Project structure migration
   - Create `projects/general/` as default
   - Move `data/chats/` → `projects/general/chats/`
   - Update paths in ws_server.py
4. ⏳ User structure
   - Create `users/{user_id}/`
   - Migrate preferences
5. ⏳ Project vectors (memory + rag)
6. ⏳ User vectors (permanent memory)
7. ⏳ Custom prompts per project
8. ⏳ Multi-user auth (future)

---

## Memory Cycle & Context Window

**Problem:** Current implementation dumps ALL chat messages into the prompt. No summarization, no cycling, just raw dump = blown context.

**Solution:** Rolling memory cycle with vector storage + tight context budget.

### Token Budget (TIGHT)

```
TOTAL CONTEXT: ~400 tokens
│
├── ACTIONS (last 5)           75 tok
│   - Condensed one-liners
│   - "Searched cats on YouTube"
│
├── RECENT EXCHANGES          150 tok
│   - Token-budgeted (not count)
│   - Maybe 2-3 exchanges
│
└── MEMORY (vector retrieved) 150 tok
    - Semantic search on user message
    - 1-2 relevant summaries from history
```

```python
CONTEXT_BUDGET = {
    'actions': 75,        # Last 5, condensed
    'recent': 150,        # Token-budgeted exchanges
    'memory': 150,        # Vector retrieved summaries
    'total': 400          # Hard cap for context
}

BATCH_THRESHOLD = 500     # Summarize every 500 tokens of content
MAX_ACTIONS = 5           # Rolling action count
```

### The Memory Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     ACCUMULATION PHASE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Message saved to chat                                          │
│         ↓                                                        │
│  Classify: ACTION or CONTENT                                    │
│         ↓                                                        │
│  ACTION → Add to rolling actions list (max 5)                   │
│  CONTENT → Add to token counter                                 │
│         ↓                                                        │
│  Token counter > 500?                                           │
│         ├── NO → Continue                                        │
│         └── YES ↓                                                │
│                 LLM summarizes batch                            │
│                 "User interested in cats, discussed URLs"       │
│                        ↓                                         │
│                 Store in PROJECT MEMORY VECTOR                  │
│                        ↓                                         │
│                 Reset counter, continue                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     QUERY PHASE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User sends message                                             │
│         ↓                                                        │
│  PARALLEL RETRIEVAL:                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Last 5      │ │ Recent      │ │ Memory Vec  │ │ RAG Caps  │ │
│  │ Actions     │ │ Content     │ │ Query       │ │ + Elements│ │
│  │ (75 tok)    │ │ (150 tok)   │ │ (150 tok)   │ │           │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬─────┘ │
│         └───────────────┴───────────────┴───────────────┘       │
│                                  ↓                               │
│                    BUILD INFORMED PROMPT (~400 tok context)     │
│                                  ↓                               │
│                             LLM DECIDES                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Structures

**Chat JSON** (existing, enhanced):
```json
{
  "chat_id": "abc123",
  "title": "YouTube Research",
  "messages": [...],

  "context_state": {
    "token_counter": 342,
    "last_summarized_idx": 45,
    "recent_actions": [
      {"text": "Searched cats on YouTube", "ts": "..."},
      {"text": "Changed theme to Atom", "ts": "..."}
    ]
  }
}
```

**Memory Vector Entry** (per summary):
```json
{
  "chat_id": "abc123",
  "chat_title": "YouTube Research",
  "summary": "User interested in cats and 3D printing. Discussed URL construction.",
  "message_range": [0, 45],
  "created_at": "2025-12-22T20:00:00Z"
}
```

### Integration Strategy (Existing Codebase)

**Files to modify:**

| File | Changes |
|------|---------|
| `retrieval/chat_context.py` | Already has `classify_message()`, add cycle logic |
| `ws_server.py` | Hook into `append_user_message()` / `append_assistant_message()` |
| `llm/orchestrator.py` | Replace `_get_rolling_history()` with new retrieval |
| `retrieval/vector_store.py` | Use for project memory vector |

**Step-by-step implementation:**

### Step 1: Chat State Tracking
```python
# In ws_server.py or chat_context.py

def init_context_state(chat_dict):
    """Initialize context tracking for a chat."""
    if 'context_state' not in chat_dict:
        chat_dict['context_state'] = {
            'token_counter': 0,
            'last_summarized_idx': 0,
            'recent_actions': []
        }

def on_message_saved(chat_dict, message):
    """Called after each message save."""
    state = chat_dict['context_state']

    if classify_message(message) == 'action':
        # Add to rolling actions (max 5)
        action_text = condense_action(message)
        state['recent_actions'].append({'text': action_text, 'ts': message['timestamp']})
        state['recent_actions'] = state['recent_actions'][-5:]
    else:
        # Add to token counter
        state['token_counter'] += estimate_tokens(message['content'])

        # Check threshold
        if state['token_counter'] >= 500:
            trigger_summarization(chat_dict)
```

### Step 2: Batch Summarization
```python
async def trigger_summarization(chat_dict):
    """Summarize content batch and store in vector."""
    state = chat_dict['context_state']
    messages = chat_dict['messages']

    # Get messages since last summary
    start_idx = state['last_summarized_idx']
    content_msgs = [m for m in messages[start_idx:] if classify_message(m) == 'content']

    if not content_msgs:
        return

    # LLM summarization call
    summary = await summarize_batch(content_msgs)

    # Store in project memory vector
    store_memory_summary(
        project_id=get_current_project(),
        chat_id=chat_dict['chat_id'],
        summary=summary,
        message_range=[start_idx, len(messages)]
    )

    # Reset counter
    state['token_counter'] = 0
    state['last_summarized_idx'] = len(messages)
```

### Step 3: Query-Time Retrieval
```python
def get_context_for_prompt(chat_id: str, user_message: str) -> dict:
    """Build context for LLM prompt."""
    chat_dict = load_chat(chat_id)
    state = chat_dict.get('context_state', {})

    # 1. Last 5 actions (from chat state)
    actions = state.get('recent_actions', [])[-5:]
    actions_text = format_actions(actions)  # ~75 tok

    # 2. Recent content (token-budgeted)
    recent = get_recent_content(chat_dict, budget=150)
    recent_text = format_content(recent)

    # 3. Memory vector search
    memories = query_project_memory(
        project_id=get_current_project(),
        query=user_message,
        k=2,
        max_tokens=150
    )
    memory_text = format_memories(memories)

    return {
        'actions': actions_text,
        'recent': recent_text,
        'memory': memory_text,
        'total_tokens': estimate_tokens(actions_text + recent_text + memory_text)
    }
```

### Step 4: Orchestrator Integration
```python
# In llm/orchestrator.py

def _get_rolling_history(self, chat_id, max_tokens=400):
    """REPLACE with new context retrieval."""

    context = get_context_for_prompt(chat_id, self.current_user_message)

    history = []

    # Add as system context
    if context['memory']:
        history.append({
            'role': 'system',
            'content': f"[Relevant memory: {context['memory']}]"
        })

    if context['actions']:
        history.append({
            'role': 'system',
            'content': f"[Recent actions: {context['actions']}]"
        })

    # Add recent exchanges as actual messages
    history.extend(context['recent'])

    return history
```

### Implementation Checklist

**Phase 1: Chat State & Actions**
- [ ] Add `context_state` to chat JSON schema
- [ ] `init_context_state()` on chat create/load
- [ ] `on_message_saved()` hook in ws_server.py
- [ ] `condense_action()` - convert action to one-liner
- [ ] Rolling actions list (max 5)

**Phase 2: Token Counting & Summarization**
- [ ] Token counter per chat
- [ ] Threshold check (500 tokens)
- [ ] `summarize_batch()` - LLM call
- [ ] `data/prompts/batch_summary.md` - summarization prompt

**Phase 3: Vector Storage**
- [ ] Project memory vector store setup
- [ ] `store_memory_summary()` - add to vector
- [ ] `query_project_memory()` - semantic search

**Phase 4: Query Integration**
- [ ] `get_context_for_prompt()` - combines all sources
- [ ] Replace `_get_rolling_history()` in orchestrator
- [ ] Test end-to-end cycle

**Phase 5: Project Structure**
- [ ] Migrate to `projects/{id}/` structure
- [ ] Vector stores per project
