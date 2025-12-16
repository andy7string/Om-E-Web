# Single-Phase RAG Implementation Plan

## The Problem

Current system prompt: **4,485 tokens** (from llm_debug.md)

| Component | Tokens | After RAG |
|-----------|--------|-----------|
| All capabilities (~40) | ~1,500 | ~100 (top 3-5) |
| All page elements (~64) | ~2,000 | ~200 (top 5-7) |
| Personality + rules | ~500 | ~500 (keep) |
| Output format | ~400 | ~200 (trim) |
| **Total** | **~4,500** | **~1,000** |

## The Solution

```
User: "open youtube"
        ↓
RAG query against capabilities → returns only OpenTab
RAG query against elements → returns nothing relevant
        ↓
Slim prompt (~1,000 tokens) + single LLM call
        ↓
Response: {"cap": "OpenTab", "params": {"url": "..."}}
```

**No two-phase. No intent parsing. Just semantic search → slim prompt → LLM.**

---

## What Gets RAG'd vs What Stays Dynamic

| Data | Treatment | Why |
|------|-----------|-----|
| **Capabilities** | Vector store (built once) | Rarely change, ~40 items |
| **Page elements** | Vector store (rebuilt on scan) | Changes per page, ~60 items |
| **Tabs** | Injected fresh each request | Changes during session |
| **Recent actions** | Injected fresh each request | Changes during session |
| **Personality/rules** | Static in prompt | Core behavior |

---

## Data Sources

| Store | Source | Index Text |
|-------|--------|------------|
| **capabilities** | `data/capabilities/*.json` | `"{name}: {label}"` |
| **elements** | `@site_structures/text.json` | Full label text |

### Critical: Use text.json NOT text.md

`text.json` structure (good for indexing):
```json
"18": {
  "label": "Bondi gunman was follower of notorious antisemitic Sydney cleric\nNaveed Akram...",
  "type": "Link",
  "tag": "a",
  "selectors": ["a[href*='/news/...']"]
}
```

`text.md` has headlines and IDs on separate lines - can't be parsed reliably.

---

## Directory Structure

```
om_e_web_ws/
├── retrieval/
│   ├── __init__.py
│   ├── vector_store.py       # Base FAISS wrapper + singleton model
│   ├── elements_store.py     # Indexes text.json elements
│   ├── capabilities_store.py # Indexes capabilities (built once)
│   └── query.py              # query(user_message) → RetrievalResult
├── llm/
│   ├── agent.py              # Modified: RAG before LLM call
│   ├── client.py             # Unchanged
│   └── prompt.py             # Modified: slim prompt builder
└── @site_structures/
    ├── text.json             # Source for elements
    └── text.md               # Human-readable (don't parse)
```

---

## Implementation Steps

### Step 1: Base VectorStore

**File:** `retrieval/vector_store.py`

```python
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

# Singleton - load model once
_model = None
def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer('BAAI/bge-base-en-v1.5')
    return _model

class VectorStore:
    def __init__(self):
        self.index = None
        self.metadata = []

    def add(self, texts: list[str], metadata: list[dict]):
        """Embed texts and add to FAISS index"""
        model = get_model()
        embeddings = model.encode(texts, normalize_embeddings=True)

        dim = embeddings.shape[1]  # 768 for bge-base
        self.index = faiss.IndexFlatIP(dim)  # Inner product (cosine on normalized)
        self.index.add(embeddings.astype('float32'))
        self.metadata = metadata

    def search(self, query: str, k: int = 5, threshold: float = 0.3) -> list[dict]:
        """Search and return metadata with scores"""
        if self.index is None or self.index.ntotal == 0:
            return []

        model = get_model()
        q_emb = model.encode([query], normalize_embeddings=True)

        scores, indices = self.index.search(q_emb.astype('float32'), min(k, self.index.ntotal))

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx >= 0 and score >= threshold:
                result = self.metadata[idx].copy()
                result['score'] = float(score)
                results.append(result)
        return results

    def clear(self):
        self.index = None
        self.metadata = []
```

### Step 2: CapabilitiesStore

**File:** `retrieval/capabilities_store.py`

```python
from .vector_store import VectorStore
import json
import os

CAPS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "capabilities")

class CapabilitiesStore(VectorStore):
    def build(self):
        """Build from data/capabilities/*.json"""
        texts = []
        metadata = []

        for filename in os.listdir(CAPS_DIR):
            if not filename.endswith('.json') or filename.startswith('_'):
                continue

            with open(os.path.join(CAPS_DIR, filename)) as f:
                data = json.load(f)

            for cap_name, cap_info in data.get('capabilities', {}).items():
                label = cap_info.get('label', cap_name)
                params = cap_info.get('params', {})

                # Index text: "OpenTab: Open new browser tab"
                texts.append(f"{cap_name}: {label}")
                metadata.append({
                    'name': cap_name,
                    'label': label,
                    'params': params
                })

        self.add(texts, metadata)
        print(f"[CapabilitiesStore] Indexed {len(texts)} capabilities")

# Singleton instance
_caps_store = None
def get_capabilities_store():
    global _caps_store
    if _caps_store is None:
        _caps_store = CapabilitiesStore()
        _caps_store.build()
    return _caps_store
```

### Step 3: ElementsStore

**File:** `retrieval/elements_store.py`

```python
from .vector_store import VectorStore
import json
import os

TEXT_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "@site_structures", "text.json")

class ElementsStore(VectorStore):
    def build(self):
        """Build from text.json"""
        if not os.path.exists(TEXT_JSON_PATH):
            print("[ElementsStore] No text.json found")
            return

        with open(TEXT_JSON_PATH) as f:
            data = json.load(f)

        texts = []
        metadata = []

        for element_id, el in data.get('elements', {}).items():
            label = el.get('label', '')
            if not label:
                continue

            el_type = el.get('type', 'Link')

            # Index the FULL label for semantic search
            texts.append(label)
            metadata.append({
                'id': int(element_id),
                'type': el_type,
                'label': label[:100]  # Truncate for prompt display
            })

        if texts:
            self.add(texts, metadata)
        print(f"[ElementsStore] Indexed {len(texts)} elements")

# Singleton instance - rebuilt on page scan
_elements_store = None
def get_elements_store():
    global _elements_store
    if _elements_store is None:
        _elements_store = ElementsStore()
        _elements_store.build()
    return _elements_store

def rebuild_elements_store():
    """Call when text.json is updated"""
    global _elements_store
    _elements_store = ElementsStore()
    _elements_store.build()
```

### Step 4: Query Function

**File:** `retrieval/query.py`

```python
from dataclasses import dataclass
from .elements_store import get_elements_store
from .capabilities_store import get_capabilities_store

@dataclass
class RetrievalResult:
    elements: list[dict]
    capabilities: list[dict]
    is_ambiguous: bool

def query(user_message: str, k_elements: int = 7, k_caps: int = 5) -> RetrievalResult:
    """
    Query both stores with user message.
    Returns relevant elements and capabilities.
    """
    elements_store = get_elements_store()
    caps_store = get_capabilities_store()

    elements = elements_store.search(user_message, k=k_elements, threshold=0.3)
    capabilities = caps_store.search(user_message, k=k_caps, threshold=0.3)

    # Ambiguous if top 2 element scores are within 0.05
    is_ambiguous = False
    if len(elements) >= 2:
        if elements[0]['score'] - elements[1]['score'] < 0.05:
            is_ambiguous = True

    return RetrievalResult(
        elements=elements,
        capabilities=capabilities,
        is_ambiguous=is_ambiguous
    )
```

### Step 5: Modify agent.py

**File:** `llm/agent.py` - Add RAG before LLM call

```python
# At top of file
try:
    from retrieval.query import query as rag_query
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

# In OmEAgent.chat():
async def chat(self, message: str) -> str:
    self.history.append({"role": "user", "content": message})

    try:
        # RAG retrieval (if available)
        rag_result = None
        if RAG_AVAILABLE:
            rag_result = rag_query(message)

        # Build prompt with RAG results
        system_prompt = build_system_prompt(
            include_page_context=self.include_page_context,
            rag_result=rag_result  # Pass RAG results
        )

        response = await self._client.chat(
            system_prompt=system_prompt,
            messages=self.history
        )

        self.history.append({"role": "assistant", "content": response})
        return response
    except Exception as e:
        self.history.pop()
        raise e
```

### Step 6: Modify prompt.py

**File:** `llm/prompt.py` - Slim prompt with RAG results

```python
def build_system_prompt(include_page_context: bool = True, rag_result = None) -> str:
    prompt = """# Om-E (Ome)

You're Ome - an Aussie AI mate who helps navigate the web.

## How to Act

**Elements:** `{"act": ID}` or `{"act": ID, "value": "...", "submit": true}`
**Capabilities:** `{"cap": "Name"}` or `{"cap": "Name", "params": {...}}`

Put JSON on its OWN LINE at the END of your response.

## Rules
1. Multiple similar elements? Ask which one.
2. Chat normally for questions (no JSON).
3. Keep it short.
"""

    # Add RAG-retrieved capabilities (instead of ALL capabilities)
    if rag_result and rag_result.capabilities:
        prompt += "\n## Relevant Capabilities\n"
        for cap in rag_result.capabilities:
            params = cap.get('params', {})
            if params:
                param_str = ', '.join([f'"{k}": ...' for k in params.keys()])
                prompt += f"- **{cap['name']}**: {cap['label']} → `{{\"cap\": \"{cap['name']}\", \"params\": {{{param_str}}}}}`\n"
            else:
                prompt += f"- **{cap['name']}**: {cap['label']} → `{{\"cap\": \"{cap['name']}\"}}`\n"

    # Add RAG-retrieved elements (instead of ALL elements)
    if rag_result and rag_result.elements:
        prompt += "\n## Relevant Elements\n"
        for el in rag_result.elements:
            prompt += f"- [{el['id']}] {el['type']}: {el['label']}\n"

        if rag_result.is_ambiguous:
            prompt += "\n*Multiple similar elements - clarify if needed.*\n"

    # Dynamic content: tabs + recent actions (always fresh)
    if include_page_context:
        prompt += f"\n## Current Tabs\n{get_tabs_only()}\n"

    prompt += f"\n## Recent Actions\n{get_action_history_text()}\n"

    return prompt
```

### Step 7: Hook in ws_server.py

**File:** `ws_server.py` - Rebuild elements on text.json write

```python
# After writing text.json
try:
    from retrieval.elements_store import rebuild_elements_store
    rebuild_elements_store()
except ImportError:
    pass
```

---

## Test Cases

| User Message | Expected RAG Results |
|--------------|---------------------|
| "open youtube" | Cap: OpenTab |
| "scroll down" | Cap: ScrollDown |
| "click gmail" | Element: [2] Link: Gmail |
| "bondi article" | Element: [18] Link: Bondi gunman... |
| "search for cats" | Element: [7] Select: Search + Cap: OpenTab (maybe) |
| "what's the weather" | No elements, no caps (just chat) |

---

## What NOT To Change

- `content.js` - DOM scanning, text.json generation
- `sw.js` - Service worker, WebSocket bridge
- `ws_server.py` core - Action execution, capability dispatch
- `llm/client.py` - LLM API calls
- Action ID system - Works as-is

---

## Rollback

Set `RAG_AVAILABLE = False` in agent.py to fall back to full context prompt.

---

## Dependencies

```bash
pip install sentence-transformers faiss-cpu
```

Model downloads on first use (~400MB for bge-base-en-v1.5).
