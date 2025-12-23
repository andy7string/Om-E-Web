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
| **ElementsStore** | ❌ Not hooked | Code exists, parses text.md (should use text.json), not wired to ws_server |
| **Facts Store** | ⚠️ Partial | Works but has chat_id, needs migration to User Profile |
| **Payload Store** | ✅ Done | Large message summarization |
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

---

## Files to Create/Modify

| File | Purpose | Status |
|------|---------|--------|
| `retrieval/user_context.py` | Manages current user/project/chat | New |
| `retrieval/user_profile_store.py` | User profile vector | New |
| `retrieval/session_intent_store.py` | Session intent vector | New |
| `retrieval/project_memory_store.py` | Project-wide memory | New |
| `retrieval/classifier.py` | User profile vs content classification | New |
| `retrieval/elements_store.py` | Fix to use text.json | Modify |
| `llm/orchestrator.py` | Wire all memory layers into prompt | Modify |
| `ws_server.py` | User context, element rebuild hook | Modify |

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
