# LLM Agent Implementation

**Location:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/llm/`

**Purpose:** Provides a conversational AI agent that controls the browser and manages chat interactions through Om-E's WebSocket server. The agent integrates Retrieval-Augmented Generation (RAG), multi-provider LLM support, and intelligent action parsing to create a natural language interface for web automation.

---

## Architecture Overview

The LLM subsystem consists of 5 core modules that work together:

```
┌─────────────────────────────────────────────────────────────┐
│                      ws_server.py                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              LLMChat Handler                           │ │
│  │  - Receives user message via WebSocket                 │ │
│  │  - Manages OmEAgent instance lifecycle                 │ │
│  │  - Executes parsed capabilities                        │ │
│  └───────────────────┬────────────────────────────────────┘ │
└────────────────────────┼───────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │         llm/agent.py                   │
        │  - OmEAgent: Conversation manager      │
        │  - Maintains history                   │
        │  - Calls RAG for prompt building       │
        │  - Appends live state to messages      │
        └───────┬────────────────────────────────┘
                │
       ┌────────┴───────────┐
       │                    │
       ▼                    ▼
┌──────────────┐    ┌──────────────────────┐
│ llm/client.py│    │ retrieval/query.py   │
│ - LLMClient  │    │ - RAG system         │
│ - Multi-     │    │ - Semantic search    │
│   provider   │    │ - Element + Cap      │
│   HTTP calls │    │   vector stores      │
└──────┬───────┘    └──────────────────────┘
       │
       │ Response (JSON)
       ▼
┌──────────────────────┐
│ llm/executor.py      │
│ - Parse LLM response │
│ - Extract actions    │
│ - Resilient parsing  │
└──────┬───────────────┘
       │
       │ Parsed actions
       ▼
┌──────────────────────┐
│ llm/dispatcher.py    │
│ - Route to pipelines │
│ - Element actions    │
│ - Capabilities       │
└──────────────────────┘
```

---

## Component Breakdown

### 1. agent.py - Conversational Agent

**File:** `om_e_web_ws/llm/agent.py`

**Core Class:** `OmEAgent`

#### Responsibilities
- Maintains conversation history (list of `{role, content}` messages)
- Integrates with RAG system to build context-aware prompts
- Appends live browser state (active tab, open tabs) to messages
- Calls LLM via `LLMClient` and returns response
- Handles history management (add, clear, get)

#### Key Methods

```python
async def chat(
    message: str,
    active_tab: Optional[Dict] = None,
    tabs: Optional[List[Dict]] = None,
    hud_state: Optional[Dict] = None,
    rag_context: Optional[Dict] = None
) -> str
```

**Flow:**
1. Adds user message to history
2. If `rag_context` provided (pre-retrieved), builds minimal prompt
3. Otherwise, calls `build_system_prompt()` from `retrieval/query.py`
4. Appends **live state** (active tab, tabs) to the **last user message** (ensures recency)
5. Calls `LLMClient.chat()` with system prompt + messages
6. Adds assistant response to history
7. Returns response text

**Why append live state to last message?**
- Ensures LLM sees current tab/browser state at the **end** of context
- Prevents stale state from earlier in conversation
- Critical for multi-turn conversations where tabs change

---

### 2. client.py - Multi-Provider LLM Client

**File:** `om_e_web_ws/llm/client.py`

**Core Class:** `LLMClient`

#### Responsibilities
- Thin async HTTP client for LLM API calls
- Supports **3 provider types**:
  - **OpenAI** (ChatGPT, GPT-4, GPT-4o, o-series, GPT-5)
  - **Anthropic** (Claude Sonnet, Opus)
  - **OpenAI-compatible** (LM Studio, Ollama, local models)
- Reads config from `data/llm_config.json`
- Handles API key resolution (supports `$ENV_VAR` syntax)
- Logs all requests to `llm_debug.md` with token counts
- Throttles requests (1 req/sec minimum interval)

#### Configuration Format

**File:** `data/llm_config.json`

```json
{
  "active_provider": "openai",
  "providers": {
    "openai": {
      "name": "OpenAI",
      "type": "openai",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-4.1-mini",
      "api_key": "sk-..."
    },
    "anthropic": {
      "name": "Anthropic",
      "type": "anthropic",
      "endpoint": "https://api.anthropic.com/v1/messages",
      "model": "claude-sonnet-4-20250514",
      "api_key": "$ANTHROPIC_API_KEY"
    }
  },
  "settings": {
    "temperature": 0.7,
    "max_tokens": 2048,
    "timeout_seconds": 30
  }
}
```

#### Special Handling for GPT-5/o-series

Models with reasoning capabilities use the **Responses API**:
- Endpoint: `/v1/responses` (not `/v1/chat/completions`)
- **No `temperature`** parameter (GPT-5 rejects it)

---

### 3. dispatcher.py - Action Router

**File:** `om_e_web_ws/llm/dispatcher.py`

#### Responsibilities
- Parses LLM JSON responses into structured actions
- Validates action format
- Routes actions to appropriate execution pipeline:
  - **Element actions** (`act`) → Standard action-ID pipeline (extension)
  - **Capabilities** (`cap`) → Capability pipeline (extension or server)
  - **Messages only** (`msg`) → AppendAssistantMessage
- Auto-resolves action type from element registry

#### Action Type Resolution

| Element Type | Action Type |
|-------------|-------------|
| Link        | navigate    |
| Button      | click       |
| Input       | setValue (if value) or click |
| Select      | setValue (if value) or select |
| Checkbox/Radio/Switch | toggle |
| Slider      | setValue    |
| **Fallback** | setValue (if value) else click |

---

### 4. executor.py - Response Parser

**File:** `om_e_web_ws/llm/executor.py`

#### Responsibilities
- **Resilient parsing** of LLM responses
- Handles multiple JSON formats LLMs might return
- Extracts capability calls from text + JSON mix
- Detects special request patterns (`findCommand`, `findMemory`)

#### Parsing Strategies (applied in order)

1. **Pure JSON** - Entire response is JSON object
2. **JSON on own line** - `{"cap": "..."} ` on its own line
3. **Code blocks** - ` ```json {"cap": "..."} ``` `
4. **Backticks** - ` `{"cap": "..."}` `
5. **Balanced extraction** - Find `{...}` anywhere, extract balanced braces

---

### 5. prompt.py - Prompt Builder (Legacy)

**File:** `om_e_web_ws/llm/prompt.py`

**Status:** Mostly replaced by `retrieval/query.py` for RAG-based prompt building.

Still provides:
- Action history tracking (last 10 actions)
- Search context persistence (from SearchChats)
- Capability loading from `internal_capabilities.json`

---

## Two Execution Pipelines

### Element Actions (via extension)
```
User: "click login"
  ↓
LLM: {"act": 5}
  ↓
dispatcher: resolve_action_type(5) → "click"
  ↓
ws_server: send_instruction_to_extension(5, "click", {})
  ↓
Extension: content.js:executeAction()
```

### Capabilities (extension or server)
```
User: "scroll down"
  ↓
LLM: {"cap": "ScrollDown"}
  ↓
dispatcher: is_internal_capability("ScrollDown") → False
  ↓
ws_server: send to extension
  ↓
Extension: content.js:capabilityPipelineExecutor()
```

---

## RAG Integration

### Vector Stores

| Store | File | Purpose |
|-------|------|---------|
| Capabilities | `retrieval/capabilities_store.py` | Semantic search over 60+ capabilities |
| Elements | `retrieval/elements_store.py` | Search page elements (ephemeral, rebuilt each scan) |
| Chat Memory | `retrieval/chat_memory_store.py` | Search past conversations with temporal filtering |

### findCommand Pattern

When LLM doesn't have the right capability, it can request a RAG search:

```json
{
  "message": "I understand you want to scroll. Let me find the right command.",
  "findCommand": "scroll the page down"
}
```

Server performs RAG query and re-calls agent with expanded context.

---

## Chat Memory System

### Storage Format

**Location:** `data/chats/`
**File naming:** `{title_slug}__{timestamp}.json`

```json
{
  "chat_id": "chat-abc123",
  "title": "My Conversation",
  "created_at": "2025-12-18T10:30:00",
  "messages": [
    {
      "id": "msg-001",
      "role": "user",
      "content": "scroll down",
      "timestamp": "2025-12-18T10:30:15"
    }
  ]
}
```

### Time Filters
- `"today"` - Last 24 hours
- `"this_week"` - Last 7 days
- `"this_month"` - Last 30 days

---

## Key Design Decisions

### 1. Numeric ID System
- **Old:** `"a_id_5"` (3 tokens)
- **New:** `5` (1 token)
- **Savings:** ~67% per action reference

### 2. Live State at End of Context
- Append current tab state to **last user message**
- Ensures LLM sees current state regardless of history length

### 3. Two-Stage RAG
- Initial prompt with RAG-retrieved subset (top 10)
- If LLM can't find capability → `findCommand` → expanded context

### 4. Singleton Agent Instance
- Single `OmEAgent` per server session
- History preserved across requests
- Clear on explicit request only

---

## Debugging

### llm_debug.md

Written on **every request** with:
- Model, temperature, max tokens
- Request tokens by role
- Context window usage percentage
- Full messages with token counts

### Console Logging

```python
print(f"🤖 LLMChat: Sending message to agent")
print(f"🔍 PARSE: Found JSON on own line")
print(f"🎯 Dispatching cap: {cap_name}")
print(f"[RAG] ⚡ Creating capabilities store")
print(f"[LLM] ← Response in {elapsed}ms")
```

---

## Performance

### RAG Query Timing
- **Typical:** 5-15ms total
- FAISS vector search: 2-5ms per store

### Token Usage (typical turn)
- System prompt (RAG-enhanced): 800-1200 tokens
- User message + live state: 50-150 tokens
- **Without RAG:** 2500-3500 tokens
- **Savings:** 60-70%

---

## Configuration Files

### data/llm_config.json
Provider settings, model selection, API keys

### data/capabilities/internal_capabilities.json
Capability definitions with:
- `handler`: "server" or "extension"
- `synonyms`: For RAG matching
- `internal`: Hide from LLM if true

### data/prompts/system.md
Base system prompt loaded by RAG system
