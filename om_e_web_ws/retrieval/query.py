"""
Query orchestrator - searches both stores and builds system prompt.
"""

import os
import time
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass
from .capabilities_store import CapabilitiesStore
from .elements_store import ElementsStore

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
SYSTEM_PROMPT_PATH = os.path.join(BASE_DIR, 'data', 'prompts', 'system.md')
LLM_DEBUG_PATH = os.path.join(BASE_DIR, 'llm_debug.md')


@dataclass
class RetrievalResult:
    """Result from querying both stores."""
    elements: List[dict]      # Top matching page elements
    capabilities: List[dict]  # Top matching capabilities
    is_ambiguous: bool        # Multiple close matches?


# Singleton stores (initialized once, reused)
_capabilities_store: Optional[CapabilitiesStore] = None
_elements_store: Optional[ElementsStore] = None


def get_capabilities_store() -> CapabilitiesStore:
    """Get or create the capabilities store singleton."""
    global _capabilities_store
    if _capabilities_store is None:
        t0 = time.time()
        print(f"[RAG] ⚡ Creating capabilities store singleton (first call)")
        _capabilities_store = CapabilitiesStore()
        # Try to load from disk first
        if not _capabilities_store.load():
            # Not on disk, build fresh
            _capabilities_store.build()
        print(f"[RAG] Capabilities store init: {(time.time()-t0)*1000:.0f}ms")
    else:
        print(f"[RAG] ✓ Reusing capabilities store singleton ({_capabilities_store.count()} items)")
    return _capabilities_store


def get_elements_store() -> ElementsStore:
    """Get or create the elements store singleton."""
    global _elements_store
    if _elements_store is None:
        t0 = time.time()
        print(f"[RAG] ⚡ Creating elements store singleton (first call)")
        _elements_store = ElementsStore()
        # Elements are ephemeral, always build fresh
        _elements_store.build()
        print(f"[RAG] Elements store init: {(time.time()-t0)*1000:.0f}ms")
    else:
        print(f"[RAG] ✓ Reusing elements store singleton ({_elements_store.count()} items)")
    return _elements_store


def rebuild_elements_store():
    """
    Rebuild the elements store from text.md.
    Called when text.md is updated (after each scan).
    """
    global _elements_store
    if _elements_store is None:
        _elements_store = ElementsStore()
    _elements_store.build()
    return _elements_store.count()


def rebuild_capabilities_store():
    """
    Rebuild the capabilities store.
    Called on server startup or when capabilities change.
    """
    global _capabilities_store
    if _capabilities_store is None:
        _capabilities_store = CapabilitiesStore()
    _capabilities_store.build()
    return _capabilities_store.count()


def query(user_prompt: str, k_elements: int = 7, k_caps: int = 3) -> RetrievalResult:
    """
    Query both stores and return relevant context.

    Args:
        user_prompt: User's input text
        k_elements: Max page elements to return
        k_caps: Max capabilities to return

    Returns:
        RetrievalResult with matched elements and capabilities
    """
    t0 = time.time()
    elements_store = get_elements_store()
    t1 = time.time()
    caps_store = get_capabilities_store()
    t2 = time.time()

    # Search both stores
    element_results = elements_store.search(user_prompt, k=k_elements, threshold=0.25)
    t3 = time.time()
    cap_results = caps_store.search(user_prompt, k=k_caps, threshold=0.25)
    t4 = time.time()
    print(f"[RAG] query(): get_elem={t1-t0:.0f}ms get_caps={t2-t1:.0f}ms search_elem={t3-t2:.0f}ms search_caps={t4-t3:.0f}ms total={t4-t0:.0f}ms")

    # Convert to dicts with scores
    elements = [
        {
            'id': r.metadata['id'],
            'type': r.metadata['type'],
            'label': r.metadata['label'],
            'score': r.score
        }
        for r in element_results
    ]

    capabilities = [
        {
            'name': r.metadata['name'],
            'label': r.metadata['label'],
            'example': r.metadata.get('example', f'{{"cap": "{r.metadata["name"]}"}}'),
            'score': r.score
        }
        for r in cap_results
    ]

    # Check for ambiguity: top 2 elements have very similar scores
    is_ambiguous = False
    if len(elements) >= 2:
        score_diff = elements[0]['score'] - elements[1]['score']
        if score_diff < 0.05:  # Within 5% similarity = ambiguous
            is_ambiguous = True

    return RetrievalResult(
        elements=elements,
        capabilities=capabilities,
        is_ambiguous=is_ambiguous
    )


# ============================================================================
# SYSTEM PROMPT BUILDER
# ============================================================================

def load_base_prompt() -> str:
    """Load base system prompt from file."""
    try:
        with open(SYSTEM_PROMPT_PATH, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"[RAG] Error loading system prompt: {e}")
        return "You are Om-E, a web browser assistant."


def build_system_prompt(
    user_message: str,
    active_tab: Optional[Dict] = None,
    tabs: Optional[List[Dict]] = None,
    write_debug: bool = True
) -> str:
    """
    Build system prompt with RAG-retrieved context.

    Args:
        user_message: User's input text (for RAG query)
        active_tab: Current tab info {url, title}
        tabs: List of open tabs [{id, title, url, active}]
        write_debug: Write prompt to llm_debug.md

    Returns:
        Complete system prompt with retrieved context
    """
    t_start = time.time()

    # Load base prompt from file
    prompt = load_base_prompt()
    t_prompt = time.time()

    # RAG query
    result = query(user_message)
    t_rag = time.time()
    print(f"[RAG] build_system_prompt(): load_prompt={t_prompt-t_start:.0f}ms rag_query={t_rag-t_prompt:.0f}ms")

    # Build context section
    prompt += "\n────────────────────────\n"
    prompt += "CONTEXT\n"
    prompt += "────────────────────────\n\n"

    # Active tab
    if active_tab:
        prompt += f"**Active Tab:** {active_tab.get('title', 'Unknown')}\n"
        prompt += f"**URL:** {active_tab.get('url', 'Unknown')}\n\n"

    # Open tabs
    if tabs:
        prompt += "**Open Tabs:**\n"
        for tab in tabs:
            marker = " ← active" if tab.get('active') else ""
            prompt += f"- Tab {tab.get('id', '?')}: {tab.get('title', 'Unknown')}{marker}\n"
        prompt += "\n"

    # Retrieved capabilities
    if result.capabilities:
        prompt += "**Retrieved Capabilities:**\n"
        for cap in result.capabilities:
            prompt += f"- {cap['label']}: `{cap['example']}`\n"
        prompt += "\n"
    else:
        prompt += "**Retrieved Capabilities:** None matched\n\n"

    # Retrieved elements
    if result.elements:
        prompt += "**Retrieved Elements:**\n"
        for el in result.elements:
            prompt += f"- [{el['id']}] {el['type']}: {el['label']}\n"
        prompt += "\n"
    else:
        prompt += "**Retrieved Elements:** None matched\n\n"

    # Write to debug file
    if write_debug:
        _write_debug(prompt, user_message, result)

    return prompt


def _write_debug(prompt: str, user_message: str, result: RetrievalResult):
    """Write prompt to llm_debug.md for monitoring."""
    try:
        tokens = estimate_tokens(prompt)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        debug = f"""# RAG System Prompt Debug

**Generated:** {timestamp}
**User Message:** {user_message}
**Estimated Tokens:** {tokens}

**Retrieved:**
- Capabilities: {len(result.capabilities)}
- Elements: {len(result.elements)}
- Ambiguous: {result.is_ambiguous}

---

## Full System Prompt

{prompt}
"""
        with open(LLM_DEBUG_PATH, 'w', encoding='utf-8') as f:
            f.write(debug)

    except Exception as e:
        print(f"[RAG] Error writing debug: {e}")


def estimate_tokens(text: str) -> int:
    """Rough token estimate (1 token ~ 4 chars for English)."""
    return len(text) // 4
