# Vector & Memory Implementation Plan

**Last Updated:** 2025-12-23

---

## Claude Code Integration Testing Workflow

This section documents how Claude Code can autonomously test Om-E capabilities while monitoring the memory system in real-time. This is the optimal workflow for collaborative development.

### Setup

1. **Start the server**: `python om_e_web_ws/ws_server.py`
2. **Load extension** in Chrome (Developer mode → Load unpacked)
3. **Navigate to a real URL** (not chrome:// pages - extension doesn't load there)
4. **Keep IDE open** with `llm_unified.md` visible for real-time prompt monitoring

### Testing Functions

Two JavaScript bridge functions are available on any page with the content script:

```javascript
// Save message to chat only (AppendMessage capability)
// Does NOT trigger LLM - just persists the message
window.omeSendChat("hello")

// Trigger full LLM pipeline (LLMChat capability)
// Goes through RAG, prompt assembly, LLM call
// Updates llm_unified.md with debug output
window.omeLLMChat("scroll down")
```

**Important:** Use `omeLLMChat` when testing capabilities - this triggers the orchestrator and writes the prompt to `llm_unified.md` for inspection.

### Monitoring Files

| File | Purpose | Watch For |
|------|---------|-----------|
| `llm_unified.md` | Full prompt sent to LLM | System prompt, capabilities, memory, user message, response |
| `data/logs/extension.log` | Extension event stream | WebSocket connection, capability execution, results |
| `data/vectors/system/facts/metadata.json` | Stored user facts | New facts being added with timestamps |
| `data/vectors/system/memory/metadata.json` | Stored content/summaries | Large payload summaries, content memories |
| `data/chats/*.json` | Chat history | Messages, context_state, actions |

### Example Test Session

```javascript
// Claude Code executes via mcp__claude-in-chrome__javascript_tool

// 1. Test a capability
window.omeLLMChat("scroll down")
// Check llm_unified.md → should show ScrollDown capability matched

// 2. Test param extraction
window.omeLLMChat("google best pizza in sydney")
// Check response → GoogleIt with query="best pizza in sydney"

// 3. Test fact storage
window.omeLLMChat("remember my favorite color is blue")
// Check facts/metadata.json → new fact added

// 4. Test memory retrieval
window.omeLLMChat("what's my favorite color?")
// Check llm_unified.md → [User facts:] section should include blue

// 5. Test chat operations
window.omeLLMChat("create a new chat called Test Chat")
window.omeLLMChat("rename chat 1 to My Test")
window.omeLLMChat("delete the test chat")
```

### Prompt Structure (from llm_unified.md)

```
ENVIRONMENT (current state)
Page: {title} ({url})

Tabs (currently open):
  1. Tab Name (domain) ← ACTIVE

Chats (current names):
  1. Chat Title (N msgs) [date] ← CURRENT

Capabilities:
- CapName: Description
  ex: {"cap": "CapName", "params": {...}}

[Relevant stored content:]
- Retrieved memory item 1
- Retrieved memory item 2

[User facts:]
- Fact 1
- Fact 2
- Fact 3

USER: {message}
```

### Extension Logs

Extension logs are streamed to `data/logs/extension.log` for Claude Code access.

**Log file location:** `om_e_web_ws/data/logs/extension.log`

**Log format:**
```
[2025-12-23T00:21:16.898Z] [INFO] [sw] WebSocket connected to server
[2025-12-23T00:21:54.923Z] [INFO] [sw] Capability result: LLMChat ok=true
```

**Currently logged events:**
- WebSocket connection established
- Capability execution requests
- Capability results

**To read logs:**
```python
# In Claude Code
Read("/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/data/logs/extension.log")
```

**To add more logs in extension code:**
```javascript
// In sw.js - use the extLog helper
extLog.info('sw', 'Your message here');
extLog.warn('sw', 'Warning message');
extLog.error('sw', 'Error message');
```

### Code Locations

| File | Purpose |
|------|---------|
| `web_extension/chat_test_helper.js` | Bridge functions (omeSendChat, omeLLMChat) |
| `web_extension/hud.js:7270-7300` | PostMessage handlers for test bridge |
| `web_extension/sw.js:390-408` | extLog helper for streaming logs to server |
| `om_e_web_ws/ws_server.py:5074-5094` | extension_log handler, writes to data/logs/ |
| `om_e_web_ws/llm/orchestrator.py:1065` | Writes llm_unified.md |
| `om_e_web_ws/retrieval/memory_cycle.py` | Fact storage and retrieval |
| `om_e_web_ws/data/logs/extension.log` | Extension log output file |

### Verified Capabilities (2025-12-23)

All internal capabilities tested and working via Claude Code:

**Browser** ✅
- ScrollDown, ScrollUp, ScrollTop, ScrollBottom
- ZoomIn, ZoomOut, ZoomReset
- GoogleIt, YouTubeIt (param extraction working)
- GoBack, GoForward, Refresh, OpenTab, CloseTab

**HUD** ✅
- SetTheme (robot/kawaii/atom + alias matching)
- ShowChats, HideChats, ToggleChats
- ShowPrompt, HidePrompt, SwitchView

**Chat** ✅
- CreateChat (title extraction)
- RenameChat (by number or fuzzy name match)
- DeleteChat (fuzzy match)
- SetCurrentChat (fuzzy match)
- LoadChat, GetCurrentChat
- SearchChats (content + title search)

**Config** ✅
- GetLLMConfig, SetTemperature, SetMaxTokens
- SetLLMProvider, SetLLMModel, SetLLMAPIKey
- ReloadLLMConfig

**Memory** ✅
- Fact storage: "remember X" → stored in facts vector
- Fact retrieval: Retrieved via semantic search in prompts
- Stored content: Large payloads summarized and indexed
- RAG matching: Capabilities change based on query intent

---

## Overview

Multi-layer RAG and memory system for Om-E. Reduces prompt tokens, enables cross-chat context, and builds user understanding over time.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VECTOR STORES                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SYSTEM (shared)           USER (per-user)           PROJECT (per-project)  │
│  ┌──────────────┐         ┌──────────────┐          ┌──────────────┐        │
│  │ Capabilities │         │ User Profile │          │Project Memory│        │
│  │   (RAG)      │         │   (RAG)      │          │   (RAG)      │        │
│  └──────────────┘         └──────────────┘          └──────────────┘        │
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐          ┌──────────────┐        │
│  │   Elements   │         │Session Intent│          │  Chat JSON   │        │
│  │   (RAG)      │         │   (RAG)      │          │ (not vector) │        │
│  └──────────────┘         └──────────────┘          └──────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Base VectorStore** | ✅ Done | FAISS wrapper with save/load |
| **CapabilitiesStore** | ✅ Done | Indexes internal capabilities |
| **Session Actions** | ✅ Done | Phase 8a - Global JSON log with config limit |
| **Session Content Store** | ✅ Done | Phase 8b - In-memory FAISS with chunking, RAG retrieval, summarize-on-rollout |
| **ElementsStore** | ❌ Not hooked | Code exists, parses text.md (should use text.json), not wired to ws_server |
| **Facts Store** | ⚠️ Partial | Works but has chat_id, needs migration to User Profile |
| **Payload Store** | ✅ Done | Large message summarization, indexed in session vector |
| **Chat Memory Store** | ⚠️ Exists | Has data, unclear if used in prompts |
| **User Profile Store** | ❌ Not started | New - permanent user facts |
| **Session Intent Store** | ❌ Not started | New - session-scoped intents |
| **Project Memory Store** | ❌ Not started | New - all chats indexed together |

---

## Directory Structure (Multi-User)

```
data/
├── users/
│   └── {user_id}/                              # Per-user namespace
│       ├── profile.json                        # User metadata (non-vector)
│       ├── vectors/
│       │   ├── profile/                        # User Profile vector
│       │   │   ├── index.faiss
│       │   │   └── metadata.json
│       │   └── session/                        # Session Intent vector (temp)
│       │       ├── index.faiss
│       │       └── metadata.json
│       │
│       └── projects/
│           └── {project_id}/
│               ├── project.json                # Project metadata
│               ├── chats/
│               │   └── {chat_id}.json          # Messages + context_state
│               └── vectors/
│                   └── memory/                 # Project Memory vector
│                       ├── index.faiss
│                       └── metadata.json
│
└── vectors/
    └── system/
        ├── capabilities/                       # Shared (not user-specific)
        └── elements/                           # Page elements (ephemeral)
```

### Migration Path

```
CURRENT                              → NEW
data/chats/*.json                    → data/users/{user}/projects/default/chats/
data/vectors/system/facts/           → data/users/{user}/vectors/profile/
data/vectors/system/chat_memory/     → data/users/{user}/projects/default/vectors/memory/
data/vectors/system/payloads/        → data/users/{user}/projects/default/vectors/memory/
data/vectors/system/capabilities/    → data/vectors/system/capabilities/ (unchanged)
```

---

## Memory Architecture (4 Layers)

### Layer 0: User Profile Vector

```
Location: data/users/{user_id}/vectors/profile/
Scope: Global - ALL projects, ALL chats
Persistence: Permanent
```

**Purpose:** Build rich understanding of the user over time

**Contains:**
- **Explicit:** "My name is Andy", "I prefer dark mode", "My birthday is Jan 21"
- **Learned:** "Has kids", "Has wife", "Has dog named Buster", "Works in tech", "Lives in Sydney"
- **Instructions:** "Always be concise", "Never use emojis"

**Categories:**
| Category | Examples |
|----------|----------|
| `identity` | Name, location, job, personal details |
| `preference` | UI prefs, tone prefs, behavior settings |
| `fact` | Birthday, timezone, family info |
| `instruction` | Standing instructions for LLM |

**Retrieval:** Semantic search on user message, top 3-5 facts injected

**Metadata Schema:**
```json
{
  "text": "User has a dog named Buster",
  "metadata": {
    "type": "fact",
    "category": "family",
    "source": "inferred",
    "source_message": "gotta walk Buster after this",
    "created_at": "2025-12-23T00:00:00Z"
  }
}
```

---

### Layer 1: Session Intent Vector

```
Location: data/users/{user_id}/vectors/session/ (or in-memory)
Scope: Current browser session
Persistence: Session-scoped (clears on server restart)
```

**Purpose:** Track what user is trying to do THIS session

**Contains:**
- Current tasks and goals
- Topics being researched
- Context that spans chat switches

**Examples:**
- "Researching cat breeds for potential pet"
- "Building memory system for Om-E project"
- "Looking for birthday gift ideas for wife"
- "Debugging websocket connection issue"

**NOT for:** Actions (scroll, click, theme change) - those stay in chat JSON

**Retrieval:** Semantic search, relevant intents for current context

**Note:** Session can be hours long (entire browsing experience), so vector search is needed

**Metadata Schema:**
```json
{
  "text": "Building memory system for Om-E project",
  "metadata": {
    "type": "intent",
    "chat_id": "abc123",
    "chat_title": "Vector Implementation",
    "created_at": "2025-12-23T10:00:00Z"
  }
}
```

---

### Layer 2: Project Memory Vector

```
Location: data/users/{user_id}/projects/{project_id}/vectors/memory/
Scope: Single project (ALL chats indexed together)
Persistence: Permanent (disk)
```

**Purpose:** Unified knowledge base for project, cross-chat RAG

**Contains:**
- Topic summaries from all chats
- Decisions made
- File dumps, transcripts, harvested content
- Anything user wants to remember for project

**Filtering by chat_id:**
```python
# Search with higher k, post-filter
results = project_store.search(query, k=20, threshold=0.3)
chat_specific = [r for r in results if r.metadata['chat_id'] == current_chat_id][:5]
cross_chat = [r for r in results if r.metadata['chat_id'] != current_chat_id][:3]
```

**Future:** User toggle to include/exclude project context, cherry-pick messages

**Metadata Schema:**
```json
{
  "text": "Decided on FAISS over Chroma for vector storage",
  "metadata": {
    "type": "decision",
    "chat_id": "abc123",
    "chat_title": "Vector Implementation",
    "message_range": [45, 60],
    "created_at": "2025-12-23T00:00:00Z"
  }
}
```

**Content Types:**
| Type | Description |
|------|-------------|
| `summary` | Summarized chat content |
| `topic` | Topic discussed |
| `decision` | Decision made |
| `dump` | File/transcript dump |
| `harvest` | Scraped web content |

---

### Layer 3: Chat Context (JSON, not vector)

```
Location: data/users/{user_id}/projects/{project_id}/chats/{chat_id}.json
Scope: Single chat
Persistence: Permanent (part of chat file)
```

**Purpose:** Immediate context for current chat

**Contains:**
- `messages`: Full message history
- `context_state.recent_actions`: Rolling actions (existing, leave as-is)
- `context_state.rolling_summary`: Compressed older content
- `context_state.token_counter`: For summarization trigger

**Retrieval:** Direct load, last 8-10 messages (not RAG)

**Schema:**
```json
{
  "chat_id": "abc123",
  "title": "Vector Implementation",
  "messages": [...],
  "context_state": {
    "token_counter": 342,
    "last_summarized_idx": 45,
    "recent_actions": [
      {"text": "YouTubeIt: cats", "ts": "2025-12-23T00:00:00Z"},
      {"text": "SetTheme: atom", "ts": "2025-12-23T00:01:00Z"}
    ],
    "rolling_summary": "Discussed memory architecture and vector stores"
  }
}
```

---

## System Vectors (Shared)

### Capabilities Store

```
Location: data/vectors/system/capabilities/
Status: ✅ DONE
```

Indexes internal capabilities for RAG. Rebuilt on server start.

### Elements Store

```
Location: data/vectors/system/elements/ (ephemeral, not saved)
Status: ❌ NOT HOOKED UP
```

Indexes page elements from `text.json`. Rebuilt on every page scan.

**Current Issue:** Code parses `text.md` but should use `text.json`. Not wired to ws_server.

**Fix Required:**
1. Update to parse `text.json` (has structured data)
2. Hook `rebuild_elements_store()` in ws_server after text.json write
3. Test element RAG works

---

## Prompt Assembly

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROMPT STRUCTURE (all layers combined)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SYSTEM PROMPT                                                               │
│  ├── Personality + rules                                                     │
│  └── Output format                                                           │
│                                                                              │
│  USER MESSAGE                                                                │
│  │                                                                           │
│  ├── ENVIRONMENT (dynamic)                                                   │
│  │   ├── Page: title + URL                                                   │
│  │   ├── Tabs: open tabs                                                     │
│  │   └── Chats: available chats                                              │
│  │                                                                           │
│  ├── CAPABILITIES (RAG matched)                                              │
│  │                                                                           │
│  ├── [User Profile:] ← Layer 0 (semantic match)                              │
│  │   - Name: Andy                                                            │
│  │   - Has dog named Buster                                                  │
│  │   - Prefers concise responses                                             │
│  │                                                                           │
│  ├── [Session Intent:] ← Layer 1 (semantic match)                            │
│  │   - Building memory system for Om-E                                       │
│  │   - Researching vector databases                                          │
│  │                                                                           │
│  ├── [Project Memory:] ← Layer 2 (RAG, filtered + cross-chat)                │
│  │   - [This chat] Discussed 4-layer architecture                            │
│  │   - [Other chat] Decided FAISS over Chroma                                │
│  │                                                                           │
│  ├── [Recent:] ← Layer 3 (last 8-10 messages)                                │
│  │   - User: what about filtering                                            │
│  │   - Om-E: We can post-filter by chat_id...                                │
│  │                                                                           │
│  └── USER: {current message}                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Token Budget

| Layer | Budget | Notes |
|-------|--------|-------|
| User Profile | ~50 tok | Top 3-5 relevant facts |
| Session Intent | ~50 tok | Top 3-5 relevant intents |
| Project Memory | ~100 tok | Top 3-5 (filtered + cross-chat) |
| Chat Context | ~150 tok | Last 8-10 messages + summary |
| Capabilities | ~100 tok | RAG matched |
| Environment | ~100 tok | Tabs, page, chats |
| **Total** | **~550 tok** | Within budget |

---

## Classification Logic

When summarizing or detecting persistence intent, classify content:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  User: "remember I love cats and we're working on vectors"                   │
│                              ↓                                               │
│  EXTRACT & CLASSIFY                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  USER PROFILE patterns:                                            │     │
│  │  - "my name is", "call me", "I am"           → identity            │     │
│  │  - "I prefer", "I like", "I love", "I hate"  → preference          │     │
│  │  - "my birthday", "my timezone", "my wife"   → fact                │     │
│  │  - "always", "never" (instructions)          → instruction         │     │
│  │                                                                    │     │
│  │  SESSION INTENT patterns:                                          │     │
│  │  - "working on", "trying to", "looking for"  → current task        │     │
│  │  - "researching", "building", "debugging"    → current task        │     │
│  │                                                                    │     │
│  │  PROJECT CONTENT patterns:                                         │     │
│  │  - Topic discussions, decisions, code        → project memory      │     │
│  │  - File dumps, transcripts                   → project memory      │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                              ↓                                               │
│  ROUTE TO STORES:                                                            │
│  - "User loves cats" → User Profile (permanent preference)                   │
│  - "Working on vectors" → Session Intent (current task)                      │
│  - "Working on vectors" → Project Memory (topic for cross-chat)              │
│                                                                              │
│  Note: Duplication is OK - same fact can live in multiple stores             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## User Context Management

### Auto-Login (Non-Disruptive)

```
Extension connects → Check chrome.storage for token
├── Token exists → Validate → Load user profile
└── No token → Create user_{uuid} → Store token → Fresh profile

User never sees login unless they want to switch accounts.
```

### Request Context

Every request includes user context:
```json
{
  "type": "llm_chat",
  "user_id": "andy",
  "project_id": "om_e_web",
  "chat_id": "abc123",
  "message": "search youtube for cats"
}
```

---

## Implementation Phases

### Phase 1: Foundation ← CURRENT
- [x] Base VectorStore class
- [x] CapabilitiesStore
- [x] Basic facts storage (needs migration)
- [x] Payload storage
- [ ] **Fix ElementsStore** (use text.json, wire to ws_server)

### Phase 2: Multi-User Structure
- [ ] Create directory structure for multi-user
- [ ] Create UserContext class (manages user/project/chat)
- [ ] Migrate existing data to new structure
- [ ] Auto-login flow (chrome.storage token)

### Phase 3: User Profile Store
- [ ] Create UserProfileStore class
- [ ] Migrate existing facts to user profile
- [ ] Classification logic (user profile vs content)
- [ ] Learning from conversations (inferred facts)
- [ ] Wire into prompt assembly

### Phase 4: Session Intent Store
- [ ] Create SessionIntentStore class
- [ ] Intent extraction during message processing
- [ ] Session lifecycle (create on connect, clear on restart)
- [ ] Wire into prompt assembly

### Phase 5: Project Memory Store
- [ ] Create ProjectMemoryStore class
- [ ] Index all chats into project memory
- [ ] Filtering by chat_id (chat-specific vs cross-chat)
- [ ] Wire into prompt assembly
- [ ] Test cross-chat RAG ("what was the song about")

### Phase 6: Chat Context
- [ ] Fix context_state loading on chat switch
- [ ] Recent messages injection (last 8-10)
- [ ] Rolling summary trigger at threshold

### Phase 7: Integration & Polish
- [ ] Full prompt assembly with all layers
- [ ] Token budget enforcement
- [ ] Cherry-pick flags for messages (future)
- [ ] Project context toggle (future)

### Phase 8: Global Session Context & Project-Wide Memory ✅ COMPLETE
**Problem:** When switching chats, Om-E loses context. No bridge between chats.

**Solution:** Session-level context that spans ALL chats in the current session.

**Completed 2025-12-23:**
- Phase 8a: Session Actions JSON - global action log with configurable limit
- Phase 8b: Session Content Vector - in-memory FAISS with semantic chunking and RAG retrieval
- Summarize-on-rollout: Messages outside rolling window indexed for later retrieval
- Config-driven limits: Uses `session_actions_limit` from settings (default 10) for both actions AND messages

#### 8a. Session Actions JSON (global action log)

**The Problem with Per-Chat Actions:**
Currently, each chat has its own `context_state.recent_actions` in its JSON file.
When you switch chats, you lose visibility of actions from other chats.
The prompt pulls from chat JSON's recent_actions - so it's chat-scoped, not session-scoped.

**The Solution - Session Actions JSON:**
A global JSON file that logs ALL actions across ALL chats in the session.
Same format as chat's recent_actions. Fed from the SAME `condense_action` output.
Prompt reads from session JSON INSTEAD OF chat JSON for the [Recent actions:] section.

**Location:** `data/session_actions.json`

**Architecture:**
```
ACTION HAPPENS (in any chat)
         ↓
   condense_action() (existing - adds intent)
         ↓
    ┌────┴────┐
    ↓         ↓
CHAT JSON   SESSION JSON
(per-chat)   (global)
    │              │
    │              ↓
    │      PROMPT ASSEMBLY
    │      (reads [Recent actions:] from session JSON)
    ↓
(kept for chat-specific history if needed later)
```

**No Additional Filtering:**
Use exactly what `condense_action` already returns. The existing filtering is smart enough.
If it's good enough for chat JSON, it's good enough for session JSON.

**Format:** Same as chat's `context_state.recent_actions` but with chat context
```json
{
  "session_id": "20251223_abc123",
  "started_at": "2025-12-23T10:00:00Z",
  "actions": [
    {"text": "GoogleIt: builder delays", "chat": "whats happening", "chat_id": "abc123", "ts": "2025-12-23T10:05:00Z"},
    {"text": "YouTubeIt: how to communicate with builders", "chat": "whats happening", "chat_id": "abc123", "ts": "2025-12-23T10:06:00Z"},
    {"text": "SetTheme: atom", "chat": "whats happening", "chat_id": "abc123", "ts": "2025-12-23T10:07:00Z"},
    {"text": "ShowChats", "chat": "whats happening", "chat_id": "abc123", "ts": "2025-12-23T10:08:00Z"},
    {"text": "SetCurrentChat: memory planning", "chat": null, "chat_id": null, "ts": "2025-12-23T10:09:00Z"},
    {"text": "CreateChat: test ideas", "chat": "memory planning", "chat_id": "def456", "ts": "2025-12-23T10:10:00Z"}
  ]
}
```

**Prompt Injection (replaces per-chat [Recent actions:]):**
```
[Recent actions (session-wide):]
- GoogleIt: builder delays (in "whats happening")
- YouTubeIt: how to communicate with builders
- SetTheme: atom
- ShowChats
- SetCurrentChat: memory planning
- CreateChat: test ideas (in "memory planning")
```

**Key Points:**
- Rolling limit: Configurable via HUD settings (default 20)
- Clears on server restart (new session)
- Includes `chat` field so we know WHERE action happened
- Prompt uses this INSTEAD of chat JSON's recent_actions
- Chat JSON still has its own recent_actions for chat-specific queries if needed later

**Configuration (HUD Settings Panel):**
Added as configurable parameter alongside Cap Score:
```
┌─────────────────────────────────────┐
│  CAP SCORE        SESSION ACTIONS   │
│  ┌─────────┐     ┌─────────┐        │
│  │  0.45   │     │   20    │        │
│  └─────────┘     └─────────┘        │
└─────────────────────────────────────┘
```

- **Field:** `session_actions_limit` in llm_config.json
- **Default:** 20
- **Range:** 5-50
- **Capability:** `SetSessionActionsLimit` with `limit` param
- **Pattern:** Same as Cap Score (hud.js → ws_server.py → llm_config.json)

**Result:**
- Bounce between 3 chats, do 4 actions each = session JSON has all 12
- Prompt always shows session-wide actions regardless of current chat
- Om-E knows what you've been doing across the whole session

#### 8b. Session Content Vector (semantic search) ✅ COMPLETE

Index substantive content from ALL chats in session. Enables cross-chat queries like "what was that song about".

**Location:** `retrieval/session_content_store.py` - In-memory FAISS vector store (clears on server restart)

**What to index:**
- Substantive user messages (not "ok", "yes", "scroll down")
- Assistant replies with content (not action confirmations)
- Large payloads (summarized and full content indexed as chunks)
- Messages that roll out of the context window (summarize-on-rollout)

**NOT to index:**
- Action messages ("Executing ScrollDown...")
- Short responses ("ok", "got it", "yes", < 15 chars)
- Duplicate content (same chunk + chat_id)
- JSON capability messages

**Chunking (Standard RAG Practice):**
- All content chunked at INDEX time (512 chars ≈ 128 tokens)
- Semantic chunking respects paragraph/sentence boundaries
- FULL chunks returned at retrieval time (no truncation)
- Token budget controlled by chunk size and k results (k=3 ≈ 384 tokens max)

**Metadata:**
```json
{
    "text": "Discussed builder delays and communication issues with contractors",
    "chat_id": "abc123",
    "chat_title": "whats happening",
    "role": "user",
    "timestamp": "2025-12-23T00:30:00Z"
}
```

**Retrieval:** Semantic search on user message, inject top 3 results with scores

**Prompt injection:**
```
[RAG Session Context - 3 matches:]
- [1] (score:0.78) Full chunk content here...
- [2] (score:0.65) Another relevant chunk...
- [3] (score:0.52) Third match...
```

**Summarize-on-Rollout:**
- Rolling message window uses `session_actions_limit` from config (default 10)
- When messages exit the window, they're indexed in the session vector
- Tracked via `context_state.summarized_up_to_index` in chat JSON
- Ensures old content remains searchable even when out of prompt

#### 8c. Implementation Steps (testable with Claude for Chrome)

**Step 1: Add config parameter to HUD settings** ✅ COMPLETE
- [x] Add `session_actions_limit` field to llm_config.json (default: 10)
- [x] Add input field in `hud.js` settings panel (after Cap Score row)
- [x] Add load handler to populate from `settings.session_actions_limit ?? 10`
- [x] Add save handler to call `SetSessionActionsLimit` capability
- [x] Add `SetSessionActionsLimit` capability in `ws_server.py`
- [x] Test: Open settings, change value, save, verify llm_config.json updates

**Step 2: Create Session Actions JSON infrastructure** ✅ COMPLETE
- [x] Create `data/session_actions.json` schema
- [x] Add helper functions in `retrieval/memory_cycle.py`:
  - `init_session()` - Create new session on server start
  - `add_session_action(text, chat_title, chat_id)` - Append to session JSON
  - `get_session_actions(limit)` - Read recent actions (uses config limit)
  - `format_session_actions_for_prompt()` - Format for prompt injection
- [x] Test: Call `add_session_action()` directly, verify JSON file updates

**Step 3: Hook into condense_action flow** ✅ COMPLETE
- [x] In `on_message_saved()`, after `state['recent_actions'].append(...)`:
  - Also call `add_session_action(condensed, chat_title, chat_id)`
- [x] Pass chat_title and chat_id to `on_message_saved()` (may need to thread through)
- [x] Test: `omeLLMChat("google cats")` → check `data/session_actions.json` has entry

**Step 4: Update prompt assembly to use session JSON** ✅ COMPLETE
- [x] In `orchestrator.py` `_get_rolling_history()`:
  - Replace chat JSON's recent_actions read with `get_session_actions()`
  - Format with `format_session_actions_for_prompt()`
- [x] Test: Execute actions in Chat A, switch to Chat B, send message
  - Check `llm_unified.md` shows actions from Chat A in [Recent actions:]

**Step 5: Add Session Content Vector** ✅ COMPLETE
- [x] Create `SessionContentStore` class (in-memory FAISS) - `retrieval/session_content_store.py`
- [x] Add semantic chunking (512 chars, respects sentence boundaries)
- [x] Hook into where vectors are pushed (facts, payloads, substantive content)
- [x] Add to session vector when content is indexed anywhere
- [x] Test: Store fact, verify session vector has entry

**Step 6: Query Session Content in prompts** ✅ COMPLETE
- [x] Add `get_session_context(query, current_chat_id)` function
- [x] Return FULL chunks with RAG scores (standard RAG practice)
- [x] Inject in `_call_unified()` as [RAG Session Context:]
- [x] Test: Switch chats, ask about previous chat topic, verify context appears

**Step 7: Session lifecycle** ✅ COMPLETE
- [x] Clear session JSON on server restart (new session_id)
- [x] Clear SessionContentStore on server restart (in-memory)
- [x] SessionContentStore is singleton, clears automatically on restart

**Step 8: Summarize-on-Rollout** ✅ COMPLETE
- [x] Rolling message window uses `session_actions_limit` from config (NOT tokens)
- [x] When messages exit window, index them in session vector
- [x] Track `summarized_up_to_index` in chat JSON to avoid re-indexing
- [x] `_summarize_and_index_old_messages()` in orchestrator.py

---

## Files to Create/Modify

| File | Purpose | Status |
|------|---------|--------|
| `web_extension/hud.js` | Add session_actions_limit input to settings panel | ✅ Done |
| `om_e_web_ws/data/llm_config.json` | Add session_actions_limit field (default: 10) | ✅ Done |
| `ws_server.py` | Add SetSessionActionsLimit capability, init session on startup | ✅ Done |
| `data/session_actions.json` | Global session actions log | ✅ Done |
| `retrieval/memory_cycle.py` | Add session action helpers (init, add, get, format) | ✅ Done |
| `llm/orchestrator.py` | Read from session JSON, summarize-on-rollout, config-driven limits | ✅ Done |
| `retrieval/session_content_store.py` | SessionContentStore (in-memory FAISS) with semantic chunking | ✅ Done |
| `retrieval/user_context.py` | Manages current user/project/chat | Not started |
| `retrieval/user_profile_store.py` | User profile vector | Not started |
| `retrieval/session_intent_store.py` | Session intent vector | Not started |
| `retrieval/project_memory_store.py` | Project-wide memory | Not started |
| `retrieval/classifier.py` | User profile vs content classification | Not started |
| `retrieval/elements_store.py` | Fix to use text.json | Not started |

---

## Test Cases

### Elements RAG (Phase 1)
| Query | Expected |
|-------|----------|
| "click gmail" | Element: Gmail link |
| "bondi article" | Element: Bondi gunman link |
| "search box" | Element: Search input |

### User Profile (Phase 3)
| Input | Stored As |
|-------|-----------|
| "my name is Andy" | identity: "User's name is Andy" |
| "I have a dog named Buster" | fact: "User has dog named Buster" |
| "always be concise" | instruction: "Be concise" |

### Session Intent (Phase 4)
| Input | Stored As |
|-------|-----------|
| "looking for cat videos" | intent: "Finding cat videos" |
| "working on memory system" | intent: "Building memory system" |

### Cross-Chat RAG (Phase 5)
| Scenario | Expected |
|----------|----------|
| In Chat B, ask "what was the song about" | Finds content from Chat A about the song |
| In Chat A, ask "what did we decide" | Finds decisions from Chat A (filtered) |

### Session Context (Phase 8) ← PRIORITY

**Session Actions Testing:**
```javascript
// 1. Execute meaningful action
window.omeLLMChat("google best pizza in sydney")
// Check ws_server console: SESSION_ACTIONS should have GoogleIt entry

// 2. Execute noise action (should NOT be tracked)
window.omeLLMChat("scroll down")
// Check: SESSION_ACTIONS should NOT have ScrollDown

// 3. Verify prompt injection
window.omeLLMChat("what did we just search for")
// Check llm_unified.md: Should show [Session Actions:] with GoogleIt entry
```

**Session Content Testing:**
```javascript
// 1. Have substantive conversation in Chat A
window.omeLLMChat("I'm stressed about builder delays and getting no answers")
// Check: SessionContentStore should index this

// 2. Switch to Chat B
window.omeLLMChat("create a new chat called test chat")
window.omeLLMChat("switch to test chat")

// 3. Ask about Chat A topic
window.omeLLMChat("what was I stressed about earlier")
// Check llm_unified.md: Should show [Session Context:] with builder stress content
```

**Cross-Chat Bridge Testing:**
| Scenario | Expected |
|----------|----------|
| Execute GoogleIt in Chat A, switch to Chat B, ask "what did we search" | Session Actions shows GoogleIt |
| Discuss topic in Chat A, switch to Chat B, ask about topic | Session Context retrieves from Chat A |
| Execute ScrollDown 10 times, check Session Actions | NOT in Session Actions (filtered) |
| Switch chats 3 times, Session Actions maintains history | All meaningful actions preserved |

---

## Config

```json
// llm_config.json
{
  "memory": {
    "user_profile_max_facts": 5,
    "session_intent_max": 5,
    "project_memory_results": 5,
    "chat_recent_messages": 10,
    "project_memory_threshold": 0.3,
    "user_profile_threshold": 0.3
  },
  "context": {
    "large_payload_threshold": 500,
    "payload_summary_budget": 50,
    "message_count_threshold": 8
  }
}
```

---

## What NOT To Change

- `content.js` - DOM scanning, text.json generation
- `sw.js` - Service worker, WebSocket bridge
- `ws_server.py` core - Action execution, capability dispatch
- `llm/client.py` - LLM API calls
- `context_state.recent_actions` - Working fine, leave as-is
