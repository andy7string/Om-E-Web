"""
Two-call LLM orchestrator for accurate vector retrieval.

Flow:
1. LLM interprets user intent → generates vector queries
2. FAISS retrieves relevant context
3. LLM executes with minimal, precise context

This beats single-call with 10k tokens:
- 2 calls × ~300 tokens = ~600 tokens total
- Better accuracy (LLM interprets intent for vector query)
- Faster overall (~1s vs ~3s)
"""

import os
import json
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass

from .query import get_elements_store, get_capabilities_store

# Path for intent prompt debug file
INTENT_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "Ome_intent_prompt.md")


# ============================================================================
# PROMPT 1: INTENT INTERPRETER (INI PROMPT)
# ============================================================================

INTENT_PROMPT = """You are Om-E, a web navigation intent interpreter.

You sit at the front of a continuous web-browsing loop in Google Chrome. Users ask for things to be done on the web; you interpret their intent, request the right knowledge from vector stores, and prepare actions for execution in the next phase.

You can also simply chat. Not every message requires an action.

You do not execute actions, guess element IDs, or return page data directly.

## Current awareness

{browser_context}

## Vector stores available

**Elements** — Interactive items on the current page (links, buttons, input fields, selects). Page-specific, change as the user navigates.

**Capabilities** — Reusable browser or system behaviours not tied to a specific element (scroll, navigate, back/forward, refresh, tab control, submit, React input handling).

**Memory** — Recent actions and conversation context. Useful for follow-ups and continuity.

## Retrieval guidance

- Request **elements** when user refers to something visible/interactive (click, open, type into, that link, the search box)
- Request **capabilities** when user refers to browser behaviour (scroll, go back, refresh, new tab, submit)
- Request **memory** when intent depends on prior actions or references ("that", "again", "previous", "the one I just...")
- When requesting multiple stores, assume elements identify the target and capabilities define how to act on it
- If the user omits an obvious step (e.g., submitting after typing), assume the standard behaviour
- Request **nothing** when user just wants to chat (no action implied)

## Rules

- ALWAYS query vector stores first — retrieval before clarification
- If user says "the", "that", "it", "again", "previous" → query memory AND elements
- Only ask clarification if retrieval returns nothing useful (handled in Phase 2)
- Clear intent → request minimum information needed
- If a store is not needed, set its query value to null
- Query fields are semantic search phrases, not verbatim user text
- Output JSON only. No commentary.

## Output format

{{"response": "<chat response, clarifying question, or null>", "elements": "<semantic search phrase or null>", "capabilities": "<semantic search phrase or null>", "memory": "<semantic search phrase or null>", "needs_history": true|false}}

User: {user_input}
JSON:"""


# ============================================================================
# PROMPT 2: EXECUTOR
# ============================================================================

EXECUTOR_PROMPT = """# Om-E Web Assistant

You are Om-E, a web navigation assistant. Direct, helpful, concise.
- Keep responses short and clear
- No fluff or filler

## How to Act

**Element types** (from Page Elements below):
- `Link:` / `Button:` → Just click: `{{"act": ID}}`
- `Input:` / `Select:` → Fill with value: `{{"act": ID, "value": "your text", "submit": true}}`

**Browser capabilities** (from Capabilities below):
- `{{"cap": "Name"}}` or `{{"cap": "Name", "params": {{"key": "value"}}}}`

## OUTPUT FORMAT - CRITICAL

Put JSON on its **OWN LINE** at the **END** of your message.

**Good:**
```
Sure mate, clicking that now.
{{"act": 5}}
```

**Bad (don't do these):**
- Don't wrap in backticks: `{{"act": 5}}` ❌
- Don't put JSON mid-sentence ❌
- Don't use code blocks ❌

## Rules
1. If multiple similar elements, ask: "Did you mean A, B, or C?"
2. Chat normally for questions (no JSON needed)
3. Keep responses short unless detail is requested

---

{browser_context}

{context}

---

**User:** {user_input}

**Ome:**"""


# ============================================================================
# ORCHESTRATOR
# ============================================================================

@dataclass
class IntentResult:
    """Result from intent interpretation."""
    response: Optional[str]          # Optional chat message from INI
    element_query: Optional[str]
    capability_query: Optional[str]
    memory_query: Optional[str]
    needs_history: bool
    raw_response: str

    @property
    def has_queries(self) -> bool:
        """True if any vector queries were requested."""
        return bool(self.element_query or self.capability_query or self.memory_query)

    @property
    def chat_only(self) -> bool:
        """True if just chatting, no vectors to query."""
        return bool(self.response) and not self.has_queries


@dataclass
class RetrievalContext:
    """Context retrieved from vector stores."""
    elements: list
    capabilities: list
    formatted: str


@dataclass
class OrchestratorResult:
    """Final result from orchestration."""
    intent: IntentResult
    context: RetrievalContext
    executor_prompt: str
    total_tokens_estimate: int


def parse_intent_response(raw: str) -> IntentResult:
    """Parse LLM response from intent call."""
    try:
        text = raw.strip()
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]

        data = json.loads(text)
        return IntentResult(
            response=data.get('response'),
            element_query=data.get('elements'),
            capability_query=data.get('capabilities'),
            memory_query=data.get('memory'),
            needs_history=data.get('needs_history', False),
            raw_response=raw
        )
    except (json.JSONDecodeError, KeyError):
        # Fallback: treat raw as chat response
        return IntentResult(
            response=raw if raw else None,
            element_query=None,
            capability_query=None,
            memory_query=None,
            needs_history=True,
            raw_response=raw
        )


def retrieve_context(intent: IntentResult, k_elements: int = 5, k_caps: int = 3) -> RetrievalContext:
    """Retrieve relevant context from vector stores based on intent."""
    elements = []
    capabilities = []

    # Query elements store if needed
    if intent.element_query:
        store = get_elements_store()
        results = store.search(intent.element_query, k=k_elements, threshold=0.3)
        elements = [
            {'id': r.metadata['id'], 'type': r.metadata['type'], 'label': r.metadata['label'], 'score': r.score}
            for r in results
        ]

    # Query capabilities store if needed
    if intent.capability_query:
        store = get_capabilities_store()
        results = store.search(intent.capability_query, k=k_caps, threshold=0.3)
        capabilities = [
            {
                'name': r.metadata['name'],
                'label': r.metadata['label'],
                'params': r.metadata.get('params', {}),
                'score': r.score
            }
            for r in results
        ]

    # Format context for executor prompt
    formatted_parts = []

    if elements:
        formatted_parts.append("**Page Elements:**")
        for el in elements:
            formatted_parts.append(f"- [{el['id']}] {el['type']}: {el['label']}")

    if capabilities:
        formatted_parts.append("\n**Capabilities:**")
        for cap in capabilities:
            params = cap.get('params', {})
            if params:
                # Show example with params
                param_example = ', '.join([f'"{k}": ...' for k in params.keys()])
                formatted_parts.append(
                    f"- **{cap['name']}**: {cap['label']} → "
                    f"`{{\"cap\": \"{cap['name']}\", \"params\": {{{param_example}}}}}`"
                )
            else:
                formatted_parts.append(
                    f"- **{cap['name']}**: {cap['label']} → `{{\"cap\": \"{cap['name']}\"}}`"
                )

    if not elements and not capabilities:
        formatted_parts.append("No matching elements or capabilities found. Ask user to clarify.")

    return RetrievalContext(
        elements=elements,
        capabilities=capabilities,
        formatted='\n'.join(formatted_parts)
    )


def build_intent_prompt(user_input: str, browser_context: str = "No browser info available") -> str:
    """Build the intent interpretation prompt with browser context."""
    prompt = INTENT_PROMPT.format(user_input=user_input, browser_context=browser_context)

    # Write to debug file
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        tokens_est = len(prompt) // 4
        content = f"""# Om-E Intent Prompt (Phase 1)

**Generated:** {timestamp}
**Tokens (est):** {tokens_est}

---

{prompt}
"""
        with open(INTENT_PROMPT_PATH, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        print(f"[Orchestrator] Failed to write intent prompt: {e}")

    return prompt


def log_intent_response(response: str, parsed: 'IntentResult', context: 'RetrievalContext'):
    """Append intent response and retrieval results to debug file."""
    try:
        with open(INTENT_PROMPT_PATH, 'a', encoding='utf-8') as f:
            f.write(f"""

---

## LLM Response (raw)

```json
{response}
```

## Parsed Intent

- **response:** {parsed.response}
- **elements query:** {parsed.element_query}
- **capabilities query:** {parsed.capability_query}
- **memory query:** {parsed.memory_query}
- **needs_history:** {parsed.needs_history}
- **chat_only:** {parsed.chat_only}

## Retrieved Context

{context.formatted if context.formatted else "[No vectors retrieved]"}
""")
    except Exception as e:
        print(f"[Orchestrator] Failed to log intent response: {e}")


def build_executor_prompt(user_input: str, context: RetrievalContext, browser_context: str = "") -> str:
    """Build the execution prompt with retrieved context and browser info."""
    return EXECUTOR_PROMPT.format(
        user_input=user_input,
        context=context.formatted,
        browser_context=browser_context
    )


def estimate_tokens(text: str) -> int:
    """Rough token estimate."""
    return len(text) // 4


def orchestrate(user_input: str, intent_response: str, browser_context: str = "") -> OrchestratorResult:
    """
    Main orchestration function.

    Call this after getting the intent response from LLM call 1.
    Returns everything needed for LLM call 2.

    Args:
        user_input: Original user message
        intent_response: Raw response from LLM call 1 (intent interpretation)
        browser_context: Formatted browser state (current page + tabs)

    Returns:
        OrchestratorResult with context and executor prompt
    """
    # Parse intent
    intent = parse_intent_response(intent_response)

    # Retrieve context
    context = retrieve_context(intent)

    # Log response and retrieval for debugging
    log_intent_response(intent_response, intent, context)

    # Build executor prompt with browser context
    executor_prompt = build_executor_prompt(user_input, context, browser_context)

    # Estimate total tokens
    intent_tokens = estimate_tokens(build_intent_prompt(user_input, browser_context))
    executor_tokens = estimate_tokens(executor_prompt)

    return OrchestratorResult(
        intent=intent,
        context=context,
        executor_prompt=executor_prompt,
        total_tokens_estimate=intent_tokens + executor_tokens
    )


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def get_intent_prompt(user_input: str, browser_context: str = "") -> str:
    """Get the prompt for LLM call 1 (intent interpretation)."""
    return build_intent_prompt(user_input, browser_context)


def process_intent_and_get_executor_prompt(user_input: str, intent_response: str, browser_context: str = "") -> str:
    """
    Process intent response and return executor prompt for LLM call 2.

    This is the main function to use:
    1. Call LLM with get_intent_prompt(user_input, browser_context)
    2. Get response
    3. Call this function with user_input, response, and browser_context
    4. Call LLM with returned executor prompt
    """
    result = orchestrate(user_input, intent_response, browser_context)
    return result.executor_prompt
