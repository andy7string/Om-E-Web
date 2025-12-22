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

## Chat Context Window (Prompt Management)

**Problem:** Current implementation dumps ALL chat messages into the prompt. A chat with 100 messages (including 8 YouTube transcripts) = 10k+ tokens = blown context.

**Solution:** Structured context window with separate handling for actions vs content.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CHAT PROMPT STRUCTURE                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ CHAT SUMMARY (rolling)                        ~100 tok │ │
│  │ "Searched: cats, cupra, bamboo labs.                   │ │
│  │  Discussed URL handling. Created chat 'future'."       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ RECENT ACTIONS (last 5-10)                    ~100 tok │ │
│  │ - Searched "bamboo labs" on YouTube                    │ │
│  │ - Changed theme to Atom                                │ │
│  │ - Opened LinkedIn                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ RECENT CONTENT (token budget: ~500 tok)                │ │
│  │ User: how did you figure that out                      │ │
│  │ Om-E: I use context and capabilities to understand...  │ │
│  │ [older content → summarised or dropped]                │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  TOTAL: ~700 tokens vs 5000+ raw                            │
└─────────────────────────────────────────────────────────────┘
```

### Message Classification

| Type | Detection | Examples |
|------|-----------|----------|
| **ACTION** | Contains `{"act":`, `{"cap":`, or "Executing..." | User: "open youtube" + Om-E: "Executing OpenTab..." |
| **CONTENT** | Everything else | Questions, explanations, transcripts, discussions |

**Why separate?**
- Actions are tiny (~10-20 tokens each)
- Content is variable (transcript = 2000+ tokens)
- 10 actions = ~150 tokens ✓
- 10 transcripts = 20,000 tokens ✗

### Token Budgeting

```python
CONTEXT_BUDGETS = {
    'summary': 150,      # Rolling chat summary
    'actions': 150,      # Last N actions (count-based, usually fits)
    'content': 500,      # Recent content (token-limited)
    'total': 800         # Max for chat context
}
```

**Content overflow handling:**
1. Count tokens in recent content messages
2. Include newest first until budget exhausted
3. Older content already in rolling summary (or dropped if trivial)

### Rolling Summary

Each chat maintains a `summary` field that updates as messages age out:

```json
{
  "chat_id": "abc123",
  "title": "YouTube Research",
  "summary": "Searched for: cat videos, bamboo labs, cupra. Discussed how Om-E constructs URLs. User interested in 3D printing.",
  "messages": [...]
}
```

**Update triggers:**
- When content exceeds token budget
- When chat is closed/switched
- Periodic (every N messages)

### Files

| File | Purpose |
|------|---------|
| `retrieval/chat_context.py` | Context window builder |
| `data/prompts/chat_summary.md` | Prompt for rolling summary generation |

### Key Functions

```python
# retrieval/chat_context.py

def classify_message(msg: dict) -> str:
    """Return 'action' or 'content'."""

def get_chat_context(chat_id: str, token_budget: int = 800) -> ChatContext:
    """
    Returns structured context for prompt:
    - summary: str (rolling summary of older content)
    - actions: List[dict] (last N action messages)
    - content: List[dict] (recent content within budget)
    - total_tokens: int
    """

def update_chat_summary(chat_id: str, new_content: List[dict]) -> str:
    """LLM call to update rolling summary with new content."""
```

### Prompt Integration

```python
# In agent.py or query.py

context = get_chat_context(current_chat_id)

prompt = f"""
{system_prompt}

**Chat Summary:** {context.summary}

**Recent Actions:**
{format_actions(context.actions)}

**Recent Messages:**
{format_content(context.content)}
"""
```

### Implementation Status

- [ ] Message classifier (action vs content)
- [ ] Token counting utility
- [ ] `get_chat_context()` function
- [ ] Rolling summary prompt
- [ ] Rolling summary generator
- [ ] Chat JSON schema update (add `summary` field)
- [ ] Prompt builder integration
