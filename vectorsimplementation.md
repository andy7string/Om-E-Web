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
