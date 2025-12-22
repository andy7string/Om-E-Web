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
- [x] `get_context_for_prompt()` - combines all sources
- [x] Replace `_get_rolling_history()` in orchestrator
- [x] Test end-to-end cycle

**Phase 5: Large Payload Handling** ✅
- [x] Detect large payloads (>500 chars)
- [x] Summarize with entity extraction (not meta-description)
- [x] Store full content in vector for RAG retrieval
- [x] Config-driven thresholds in `llm_config.json`

**🚨 PRIORITY FIX: Recent Chat History Missing**

**The Problem:**
Om-E has NO memory of what was just said in the current conversation. Each message arrives in isolation.

Example from `llm_unified.md`:
```
Chat: "Im only human after all on youtube" (64 msgs)
User just discussed the song, feelings, lyrics...

User: "how do i feel about ma boy"
Om-E: "Could you tell me a bit more about 'ma boy'?"  ← HAS NO IDEA

The 64 messages of context? Not in the prompt. Om-E is blind to the conversation.
```

**What's in prompt now:**
- ✅ User facts ("Andy", "likes optimism")
- ✅ Payload context (large stored content)
- ✅ Capabilities
- ❌ **Recent chat messages** ← MISSING

**The Fix:**
- [ ] Load last 8-10 messages from current chat file
- [ ] If message is large (>500 chars), use its summary instead of full content
- [ ] Include in prompt (~150-200 tokens budget)
- [ ] Format: `[Recent conversation:] User: ... Om-E: ...`
- [ ] Hook into orchestrator's `_call_unified()`
- [ ] Config: `recent_messages_count: 10` in llm_config.json

**Phase 6: Persistence Intent & Rolling Summarization**
- [ ] Message count threshold (7-8 messages) for rolling summary
- [x] Persistence intent detection patterns
- [x] Fact extraction when intent detected
- [x] Permanent fact storage in vector
- [x] Integration with prompt retrieval

**Phase 7: Project Structure**
- [ ] Migrate to `projects/{id}/` structure
- [ ] Vector stores per project

**Phase 8: Global Session Context & Project-Wide Memory**
- [ ] Global session state (persists across chat switches)
- [ ] Session action history (last 10 actions GLOBALLY)
- [ ] Chat flow tracking (trail of chats visited)
- [ ] Project-wide memory index (all chats searchable)
- [ ] On-load chat context injection
- [ ] Cross-chat RAG queries ("what was the song about")

---

## Phase 6: Persistence Intent & Rolling Summarization

**Problem:** Normal conversation facts ("my name is Andy", "I like dark mode") don't get stored. Only large payloads (>500 chars) trigger memory storage. User's important preferences and facts vanish when chat history rolls.

**Solution:** Two-part system:
1. Rolling summarization after 7-8 messages (compress old, keep recent full)
2. Persistence intent detection → extract fact → store permanently

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MESSAGE PROCESSING                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User message arrives                                                        │
│         ↓                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ PERSISTENCE INTENT CHECK                                              │   │
│  │                                                                       │   │
│  │ Patterns: "remember", "don't forget", "my name is", "I like/prefer", │   │
│  │           "important", "always", "never", "call me"                  │   │
│  │                                                                       │   │
│  │ Match? → Extract fact → Store in FACTS vector (permanent)            │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│         ↓                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ ROLLING SUMMARIZATION                                                 │   │
│  │                                                                       │   │
│  │ Message count > 8?                                                    │   │
│  │   ├── NO → Keep all messages                                          │   │
│  │   └── YES → Summarize oldest 4 → Keep summary + recent 4              │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROMPT BUILDING                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Building prompt for LLM:                                                    │
│                                                                              │
│  1. FACTS (from vector)           ~50 tok                                   │
│     - "User's name is Andy"                                                 │
│     - "User prefers dark mode"                                              │
│     - "User calls Om-E 'ome'"                                               │
│                                                                              │
│  2. ROLLING SUMMARY               ~50 tok                                   │
│     - Compressed older conversation                                         │
│                                                                              │
│  3. RECENT MESSAGES (7-8)         ~200 tok                                  │
│     - Full fidelity recent exchange                                         │
│                                                                              │
│  4. ACTIONS (last 5)              ~75 tok                                   │
│     - "SetTheme: atom"                                                      │
│     - "YouTubeIt: teddy swims"                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Persistence Intent Detection

**Trigger patterns (case-insensitive):**

```python
PERSISTENCE_PATTERNS = [
    # Explicit memory requests
    r'\bremember\b',           # "remember my name"
    r"\bdon'?t forget\b",      # "don't forget I like..."
    r'\bkeep in mind\b',       # "keep in mind that..."

    # Identity statements
    r'\bmy name is\b',         # "my name is Andy"
    r'\bcall me\b',            # "call me Andy"
    r'\bi am\b',               # "i am a developer"
    r'\bi\'?m\b',              # "i'm from Australia"

    # Preferences
    r'\bi like\b',             # "i like dark mode"
    r'\bi prefer\b',           # "i prefer minimal responses"
    r'\bi hate\b',             # "i hate verbose answers"
    r'\bi always\b',           # "i always use vim"
    r'\bi never\b',            # "i never use tabs"

    # Importance markers
    r'\bimportant\b',          # "this is important"
    r'\balways\b',             # "always use this format"
    r'\bnever\b',              # "never suggest that"
]
```

### Fact Extraction

When persistence intent detected, LLM extracts the fact:

```python
FACT_EXTRACTION_PROMPT = """
Extract the KEY FACT the user wants remembered. Return ONLY the fact, no explanation.

Examples:
- "hey remember my name is Andy ok" → "User's name is Andy"
- "i prefer dark mode always" → "User prefers dark mode"
- "call me ome sometimes" → "User calls the assistant 'ome'"
- "don't forget i hate verbose answers" → "User dislikes verbose answers"

User message:
{message}

Fact:"""
```

### Rolling Summarization

**When:** Message count exceeds 8 (content messages, not actions)

**How:**
1. Take oldest 4 content messages
2. Summarize to ~50 tokens
3. Replace those 4 with summary
4. Keep recent 4 full fidelity

```python
ROLLING_SUMMARY_PROMPT = """
Summarize this conversation segment in 1-2 sentences. Focus on topics discussed, not actions taken.

Messages:
{messages}

Summary:"""
```

### Data Structures

**Facts Vector Store** (`data/vectors/system/facts/`):
```json
{
    "text": "User's name is Andy",
    "metadata": {
        "type": "fact",
        "category": "identity",      // identity, preference, instruction
        "source_message": "remember my name is Andy ok",
        "chat_id": "abc123",
        "created_at": "2025-12-23T10:00:00Z"
    }
}
```

**Chat State** (enhanced):
```json
{
    "context_state": {
        "token_counter": 0,
        "last_summarized_idx": 0,
        "recent_actions": [...],
        "rolling_summary": "Discussed theme changes and YouTube searches",
        "content_message_count": 6
    }
}
```

### Implementation

**File:** `retrieval/memory_cycle.py` (extend existing)

```python
# New constants
PERSISTENCE_PATTERNS = [...]  # As above
MESSAGE_COUNT_THRESHOLD = 8   # Summarize after this many content messages
FACT_BUDGET = 50              # Tokens for facts in prompt

# New functions
def detect_persistence_intent(content: str) -> bool:
    """Check if message has persistence intent."""

async def extract_fact(content: str) -> str:
    """LLM call to extract the fact to store."""

async def process_persistence_intent(content: str, chat_id: str) -> Optional[str]:
    """Full pipeline: detect → extract → store → return confirmation."""

def check_rolling_summary_needed(chat_dict: Dict) -> bool:
    """Check if we need to summarize older messages."""

async def create_rolling_summary(chat_dict: Dict) -> str:
    """Summarize oldest content messages."""

def get_facts_for_prompt(query: str, max_facts: int = 3) -> str:
    """Retrieve relevant facts from vector store."""
```

### Integration Points

**1. `on_message_saved()` - Add persistence check:**
```python
def on_message_saved(chat_dict: Dict, message: Dict) -> bool:
    # Existing action/content classification...

    # NEW: Check persistence intent for user messages
    if message.get('role') == 'user':
        content = message.get('content', '')
        if detect_persistence_intent(content):
            asyncio.create_task(process_persistence_intent(content, chat_dict['chat_id']))

    # NEW: Check rolling summary threshold
    if check_rolling_summary_needed(chat_dict):
        asyncio.create_task(create_rolling_summary(chat_dict))
```

**2. `orchestrator.py` - Add facts to prompt:**
```python
# In _call_unified() user content building
facts_ctx = get_facts_for_prompt(user_message)
if facts_ctx:
    user_content_parts.append(facts_ctx)
```

### Test Cases

| User Says | Should Store |
|-----------|--------------|
| "remember my name is Andy" | "User's name is Andy" |
| "hey ome whats up" | Nothing (no intent) |
| "i prefer dark mode" | "User prefers dark mode" |
| "search for cats" | Nothing (no intent) |
| "don't forget i like concise answers" | "User likes concise answers" |
| "call me bro" | "User wants to be called 'bro'" |

### Config

```json
// llm_config.json - context section
{
    "context": {
        "payload_context_lines": 5,
        "large_payload_threshold": 500,
        "payload_summary_budget": 50,
        "message_count_threshold": 8,
        "max_facts_in_prompt": 3,
        "fact_token_budget": 50
    }
}
```

---

## Phase 8: Global Session Context & Project-Wide Memory

**Problem:** When user switches chats, ALL context is lost. The action history, conversation flow, and cross-chat knowledge vanish. User asks "what was the song about" but Om-E has no idea because the 64 messages in that chat aren't accessible.

**Solution:** Two-layer context system:
1. **Global Session State** - persists across ALL chat switches within a session
2. **Project-Wide Memory** - all chats indexed and searchable as a unified knowledge base

### Architecture

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     GLOBAL SESSION STATE                                      ║
║                (In-memory, persists across chat switches)                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  session_state = {                                                            ║
║      "session_id": "sess_20251223_001",                                       ║
║      "started_at": "2025-12-23T01:00:00Z",                                    ║
║                                                                               ║
║      # GLOBAL ACTION HISTORY (last 10, spans ALL chats)                       ║
║      "actions": [                                                             ║
║          {"action": "YouTubeIt", "query": "teddy swims", "chat": "song_chat"},║
║          {"action": "SwitchChat", "from": "song_chat", "to": "facts_chat"},   ║
║          {"action": "SetTheme", "theme": "atom", "chat": "facts_chat"},       ║
║          {"action": "SwitchChat", "from": "facts_chat", "to": "song_chat"},   ║
║          ...                                                                  ║
║      ],                                                                       ║
║                                                                               ║
║      # CHAT FLOW (trail of chats visited this session)                        ║
║      "chat_flow": [                                                           ║
║          {"chat_id": "abc123", "title": "Song Chat", "entered": "01:05:00"},  ║
║          {"chat_id": "def456", "title": "Facts Chat", "entered": "01:10:00"}, ║
║          {"chat_id": "abc123", "title": "Song Chat", "entered": "01:15:00"},  ║
║      ],                                                                       ║
║                                                                               ║
║      # CURRENT CONTEXT                                                        ║
║      "current_chat_id": "abc123",                                             ║
║      "previous_chat_id": "def456",                                            ║
║  }                                                                            ║
║                                                                               ║
║  Benefits:                                                                    ║
║  - "go back to what we were doing" → knows previous chat                      ║
║  - "what did I just search" → knows last YouTubeIt even if in different chat  ║
║  - Context carries across switches                                            ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║                     PROJECT-WIDE MEMORY                                       ║
║              (All chats indexed, searchable as one knowledge base)            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  PROJECT: Om-E Web                                                            ║
║  ├── Chat 1: "remember my name"      → indexed ────┐                          ║
║  ├── Chat 2: "random facts"          → indexed ────┤                          ║
║  ├── Chat 3: "I'm only human song"   → indexed ────┼──→ PROJECT MEMORY VECTOR ║
║  ├── Chat 4: "testing payloads"      → indexed ────┤    (FAISS index)         ║
║  └── Chat 5: "vector implementation" → indexed ────┘                          ║
║                                                                               ║
║  Index contains:                                                              ║
║  - Actual message content (not just summaries)                                ║
║  - Song lyrics, topics discussed, facts shared                                ║
║  - User questions and Om-E responses                                          ║
║  - Metadata: chat_id, chat_title, timestamp, role                             ║
║                                                                               ║
║  Query flow:                                                                  ║
║  User: "what was the song about"                                              ║
║      ↓                                                                        ║
║  RAG search across ALL chats in project                                       ║
║      ↓                                                                        ║
║  Finds: "I'm Only Human After All - lyrics about vulnerability..."            ║
║      ↓                                                                        ║
║  Injects into prompt as context                                               ║
║      ↓                                                                        ║
║  Om-E can answer even though user is in different chat                        ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════════════╗
║                     CURRENT CHAT CONTEXT                                      ║
║                  (Loaded when chat becomes active)                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  On chat switch/load:                                                         ║
║  1. Load recent messages from chat file (last 8-10)                           ║
║  2. Add to prompt as immediate context                                        ║
║  3. RAG query project memory for relevant cross-chat info                     ║
║                                                                               ║
║  Result: Om-E knows both:                                                     ║
║  - What's in THIS chat (recent messages)                                      ║
║  - What's relevant from OTHER chats (project memory)                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Data Structures

**Global Session State** (in-memory singleton):
```python
# retrieval/session_state.py

class SessionState:
    """Global session state that persists across chat switches."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_state()
        return cls._instance

    def _init_state(self):
        self.session_id = f"sess_{int(time.time())}"
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.actions = []           # Last 10 global actions
        self.chat_flow = []         # Trail of chats visited
        self.current_chat_id = None
        self.previous_chat_id = None

    def add_action(self, action: str, params: dict, chat_id: str):
        """Add action to global history (max 10)."""
        self.actions.append({
            "action": action,
            "params": params,
            "chat_id": chat_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        self.actions = self.actions[-10:]  # Keep last 10

    def switch_chat(self, new_chat_id: str, chat_title: str):
        """Record chat switch in flow and actions."""
        old_chat_id = self.current_chat_id

        # Record in chat flow
        self.chat_flow.append({
            "chat_id": new_chat_id,
            "title": chat_title,
            "entered": datetime.now(timezone.utc).isoformat()
        })

        # Record as action
        if old_chat_id and old_chat_id != new_chat_id:
            self.add_action("SwitchChat", {
                "from": old_chat_id,
                "to": new_chat_id
            }, new_chat_id)

        self.previous_chat_id = old_chat_id
        self.current_chat_id = new_chat_id

    def get_recent_actions(self, count: int = 10) -> List[dict]:
        """Get last N global actions."""
        return self.actions[-count:]

    def get_previous_chat(self) -> Optional[str]:
        """Get the chat we were in before current."""
        return self.previous_chat_id

    def format_for_prompt(self) -> str:
        """Format session state for prompt injection."""
        lines = ["[Session Context:]"]

        # Recent actions
        if self.actions:
            lines.append("Recent actions:")
            for a in self.actions[-5:]:
                lines.append(f"  - {a['action']}: {a.get('params', {})}")

        # Chat flow
        if len(self.chat_flow) > 1:
            lines.append(f"Chat flow: {' → '.join(c['title'] for c in self.chat_flow[-3:])}")

        return '\n'.join(lines)


# Singleton accessor
def get_session_state() -> SessionState:
    return SessionState()
```

**Project Memory Vector** (enhanced):
```python
# retrieval/project_memory.py

class ProjectMemoryStore(VectorStore):
    """
    Project-wide memory - indexes ALL chat messages for cross-chat RAG.
    Unlike chat_memory (summaries only), this indexes actual content.
    """

    def __init__(self, project_id: str = "default"):
        super().__init__(f'project_{project_id}_memory')
        self.project_id = project_id

    def build_from_all_chats(self):
        """Index all chats in project."""
        self.clear()

        chat_files = glob.glob(os.path.join(CHATS_DIR, '*.json'))
        print(f"[ProjectMemory] Indexing {len(chat_files)} chats...")

        texts = []
        metadata = []

        for chat_file in chat_files:
            try:
                with open(chat_file) as f:
                    chat = json.load(f)

                chat_id = chat.get('chat_id', '')
                chat_title = chat.get('title', 'Untitled')

                for i, msg in enumerate(chat.get('messages', [])):
                    content = msg.get('content', '').strip()
                    role = msg.get('role', '')

                    # Skip short/action messages
                    if len(content) < 20:
                        continue
                    if content.startswith('{') and '"cap"' in content:
                        continue
                    if 'Executing ' in content and '...' in content:
                        continue

                    # Index the message
                    texts.append(content)
                    metadata.append({
                        'chat_id': chat_id,
                        'chat_title': chat_title,
                        'role': role,
                        'message_index': i,
                        'content_preview': content[:100]
                    })

            except Exception as e:
                print(f"[ProjectMemory] Error processing {chat_file}: {e}")
                continue

        if texts:
            self.add(texts, metadata)
            self.save()
            print(f"[ProjectMemory] Indexed {len(texts)} messages from {len(chat_files)} chats")

    def add_message(self, chat_id: str, chat_title: str, message: dict):
        """Add single message to index (incremental update)."""
        content = message.get('content', '').strip()
        role = message.get('role', '')

        # Skip unworthy content
        if len(content) < 20:
            return
        if content.startswith('{') and '"cap"' in content:
            return
        if 'Executing ' in content and '...' in content:
            return

        self.add([content], [{
            'chat_id': chat_id,
            'chat_title': chat_title,
            'role': role,
            'content_preview': content[:100]
        }])
        # Note: save() called periodically, not per-message

    def search_project(self, query: str, k: int = 5, threshold: float = 0.4) -> List[dict]:
        """Search across all project chats."""
        results = self.search(query, k=k, threshold=threshold)

        formatted = []
        for r in results:
            formatted.append({
                'content': r.text,
                'chat_id': r.metadata.get('chat_id'),
                'chat_title': r.metadata.get('chat_title'),
                'role': r.metadata.get('role'),
                'score': r.score
            })

        return formatted


# Singleton
_project_memory = None

def get_project_memory() -> ProjectMemoryStore:
    global _project_memory
    if _project_memory is None:
        _project_memory = ProjectMemoryStore()
        if not _project_memory.load():
            _project_memory.build_from_all_chats()
    return _project_memory
```

### Integration Points

**1. ws_server.py - Chat Switch Hook:**
```python
# When SetCurrentChat or chat load happens

from retrieval.session_state import get_session_state
from retrieval.project_memory import get_project_memory

async def on_chat_switched(chat_id: str, chat_title: str):
    """Called when user switches to a different chat."""
    session = get_session_state()
    session.switch_chat(chat_id, chat_title)

    # Log the switch
    print(f"[Session] Switched: {session.previous_chat_id} → {chat_id}")
```

**2. ws_server.py - Action Recording:**
```python
# After any capability execution

def record_action(cap_name: str, params: dict, chat_id: str):
    """Record action in global session state."""
    session = get_session_state()
    session.add_action(cap_name, params, chat_id)
```

**3. ws_server.py - Message Indexing:**
```python
# After append_user_message or append_assistant_message

def index_message_to_project(chat_id: str, chat_title: str, message: dict):
    """Add message to project-wide memory index."""
    memory = get_project_memory()
    memory.add_message(chat_id, chat_title, message)
```

**4. orchestrator.py - Prompt Building:**
```python
# In _call_unified() - add session context and project memory

from retrieval.session_state import get_session_state
from retrieval.project_memory import get_project_memory

# Get global session context
session = get_session_state()
session_ctx = session.format_for_prompt()
if session_ctx:
    user_content_parts.append(session_ctx)

# Search project-wide memory for relevant content
project_memory = get_project_memory()
project_results = project_memory.search_project(user_message, k=3, threshold=0.4)
if project_results:
    project_ctx = "[Relevant from other chats:]\n"
    for r in project_results:
        project_ctx += f"- [{r['chat_title']}] {r['content'][:150]}...\n"
    user_content_parts.append(project_ctx)
```

### Prompt Structure (with new context)

```
ENVIRONMENT (current state - use these for actions)
Page: OM-E Web (http://127.0.0.1:8080/)
Tabs: [...]

Capabilities:
- GoogleIt: ...
- YouTubeIt: ...

[Session Context:]
Recent actions:
  - YouTubeIt: {'query': 'teddy swims'}
  - SwitchChat: {'from': 'song_chat', 'to': 'facts_chat'}
  - SetTheme: {'theme': 'atom'}
Chat flow: Song Chat → Facts Chat → Song Chat

[Relevant from other chats:]
- [I'm Only Human Song] The song is about vulnerability and showing emotion...
- [I'm Only Human Song] Lyrics: "I'm only human after all, don't put your blame on me"

[User facts:]
- User's name is Andy
- User likes optimism

[Relevant stored content:]
- Gerald the fox jumped over Buster...

USER: whats the song about
```

### Implementation Checklist

**Phase 8a: Global Session State**
- [ ] Create `retrieval/session_state.py` with SessionState singleton
- [ ] `add_action()` - record actions globally (max 10)
- [ ] `switch_chat()` - track chat flow
- [ ] `format_for_prompt()` - format for injection
- [ ] Hook into ws_server.py for action recording
- [ ] Hook into SetCurrentChat for chat switch tracking

**Phase 8b: Project-Wide Memory**
- [ ] Create `retrieval/project_memory.py` with ProjectMemoryStore
- [ ] `build_from_all_chats()` - full index of all chat messages
- [ ] `add_message()` - incremental update on new messages
- [ ] `search_project()` - cross-chat RAG query
- [ ] Hook into message append for incremental indexing
- [ ] Periodic save (not per-message)

**Phase 8c: Orchestrator Integration**
- [ ] Add session context to prompt
- [ ] Add project memory search to prompt
- [ ] Test cross-chat queries ("what was the song about")
- [ ] Test session continuity ("go back to what we were doing")

### Test Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User in Chat A, asks about Chat B content | RAG finds content from Chat B, answers correctly |
| User switches Chat A → B → A | Session knows flow, "go back" knows previous was B |
| User does action in Chat A, switches to B | Action still in global history, visible in B |
| User asks "what did I just search" after switch | Knows last search even though in different chat |
| User asks "what was the song about" | Finds lyrics/discussion from song chat |
| Server restart | Session state resets (expected), project memory persists |

### Token Budget Impact

| Context Type | Tokens | Notes |
|--------------|--------|-------|
| Session Context | ~50-75 | Last 5 actions + chat flow |
| Project Memory | ~100-150 | Top 3 relevant cross-chat results |
| User Facts | ~50 | Existing |
| Payload Context | ~50-100 | Existing |
| Recent Messages | ~150-200 | Current chat context |
| **Total** | **~400-575** | Within budget |

### Config

```json
// llm_config.json - session section
{
    "session": {
        "max_global_actions": 10,
        "max_chat_flow_display": 3,
        "project_memory_results": 3,
        "project_memory_threshold": 0.4
    }
}
```
