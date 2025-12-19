# Build Plan: Two-Role LLM Architecture

**Version:** 2.4
**Date:** 2025-12-19
**Status:** FINAL (reviewed by Claude, incorporates Om-e feedback + TURN_ prefix naming + streaming feature flag + "Wrap Don't Replace" principle)

---

## Executive Summary

This plan refactors the existing LLM subsystem from a single-agent model into a strict two-role architecture (Chat Persona + Decision Engine) with an optional fallback (Deep Scan). The server becomes the orchestrator and source of truth, keeping LLM prompts small by default.

**Key principles:**
1. **100% LLM evaluation** - ALL user messages go through Chat Persona for intent extraction. No regex shortcuts - this is a generic browser automation tool for ANY site.
2. **Two prompts, one pipeline** - `chat_prompt.md` and `executor_prompt.md` in `data/prompts/`. Same `call_role()` method, different prompts.
3. **LLM roles never invent** - They only choose from server-prepared options or respond conversationally.
4. **Progressive escalation** - Deep Scan only runs with user consent when quick resolution fails.

---

## Current State Analysis

### Existing LLM Flow (Single Agent)

```
HUD → ws_server.py → LLM_AGENT.chat() → parse_capability_calls() → dispatch
```

**Current files involved:**
- `om_e_web_ws/ws_server.py:1450-1650` - LLMChat handler
- `om_e_web_ws/llm/agent.py` - OmEAgent class
- `om_e_web_ws/llm/client.py` - LLMClient (multi-provider HTTP)
- `om_e_web_ws/llm/executor.py` - Response parser (parse_capability_calls, extract JSON)
- `om_e_web_ws/llm/dispatcher.py` - Action routing
- `om_e_web_ws/retrieval/query.py` - RAG system (build_system_prompt)
- `om_e_web_ws/retrieval/capabilities_store.py` - Capability vector store ✅ MATURE
- `om_e_web_ws/retrieval/elements_store.py` - ❌ DOES NOT EXIST YET
- `om_e_web_ws/retrieval/chat_memory_store.py` - ⚠️ NEEDS CLEANUP (duplicate chat data)

### Current Reality

| Component | Status | Notes |
|-----------|--------|-------|
| Capabilities store | ✅ Mature | Use for testing pipeline |
| Element store | ❌ Not built | Defer - test with caps first |
| Chat memory store | ⚠️ Messy | Has chat shit duplicating JSON files |
| Chat JSON files | ✅ Working | `data/chats/*.json` - source of truth |
| System prompt | ⚠️ Huge | Needs splitting into two roles |

### Guiding Principle: Wrap, Don't Replace

**The orchestrator wraps existing code - it does NOT replace execution pipelines.**

When implementing this plan:
- **DO NOT** create new `execute_element_action()` or `execute_capability_internal()` functions
- **DO** use existing routing logic in `ws_server.py handler()`
- **DO** call existing message types (`execute_action_with_hints`, `execute_capability`)
- **DO** preserve `ELEMENT_REGISTRY` → selector lookup → extension execution flow

The PersonaOrchestrator returns an `OrchestratorResult` with `action_type` and `action_target`. The existing `handler()` code then routes this through established pipelines:

```
OrchestratorResult(action_type="act", target=5)
    → resolve_hints_for_act(5)        # Existing function
    → ELEMENT_REGISTRY[5].selectors   # Existing registry
    → execute_action_with_hints msg   # Existing message type
    → content.js executeAction()      # Existing handler
```

This ensures we get the benefits of intelligent routing without touching battle-tested execution code.

---

### What We're Preserving

1. **Execution pipelines** (unchanged):
   - Element actions: `execute_action_with_hints` → SW → content.js → DOM
   - Capabilities: `execute_capability` → SW → content.js or server internal

2. **UI flow** (unchanged):
   - HUD sends `ui_chat_user_message` → ws_server
   - Server responds via `hud_action` (append_message, etc.)

3. **SW/content.js division** (unchanged):
   - content.js: DOM scan, action execution, capability execution
   - SW: Message routing, tab state, iframe merging

4. **Existing stores** (enhanced usage):
   - capabilities_store.py - Now queried for Decision Engine options
   - elements_store.py - Now queried for Decision Engine options
   - chat_memory_store.py - Now queried for Chat Persona (small snippets only)

5. **Element resolution** (unchanged):
   - ELEMENT_REGISTRY populated from `semanticPageData.actionables`
   - Selectors stored per element for DOM re-query
   - `resolve_hints_for_act()` looks up selectors by action ID
   - Extension re-queries DOM using selectors (survives SPA re-renders)

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ws_server.py                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     PersonaOrchestrator (NEW)                         │  │
│  │  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐   │  │
│  │  │  Chat Persona   │──▶│ Decision Engine  │──▶│   Executor       │   │  │
│  │  │  (Role A)       │   │ (Role B)         │   │   (existing)     │   │  │
│  │  └────────┬────────┘   └────────┬─────────┘   └──────────────────┘   │  │
│  │           │                     │                                     │  │
│  │           ▼                     ▼                                     │  │
│  │  ┌─────────────────┐   ┌──────────────────┐                          │  │
│  │  │ Server Memory   │   │  RAG Retrieval   │                          │  │
│  │  │ (trimmed hist)  │   │  (top N options) │                          │  │
│  │  └─────────────────┘   └──────────────────┘                          │  │
│  │                                 │                                     │  │
│  │                     ┌───────────┴───────────┐                        │  │
│  │                     ▼                       ▼                        │  │
│  │           ┌──────────────────┐   ┌──────────────────┐                │  │
│  │           │ Capabilities     │   │ Elements         │                │  │
│  │           │ Store (existing) │   │ Store (existing) │                │  │
│  │           └──────────────────┘   └──────────────────┘                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Prompt Templates and JSON Contracts

**Goal:** Define the exact prompts and output schemas for each role without changing any runtime code.

### Files to Create

| File | Purpose |
|------|---------|
| `om_e_web_ws/data/prompts/chat_prompt.md` | Chat Persona system prompt |
| `om_e_web_ws/data/prompts/executor_prompt.md` | Decision Engine system prompt |
| `om_e_web_ws/data/prompts/deep_scan_prompt.md` | Deep Scan system prompt (fallback) |
| `om_e_web_ws/llm/contracts.py` | Pydantic models for JSON validation |

### Files Unchanged
- All existing files remain untouched
- `data/prompts/system.md` - existing prompt stays, new prompts added alongside

### Why `data/prompts/` instead of `llm/prompts/`

Prompts live in `data/` because:
1. **Consistency** - existing `system.md` prompt is already there
2. **Non-code assets** - prompts are content, not code
3. **Hot-reloadable** - future: edit prompts without code changes

### Prompt Assembly at Runtime

Prompts are **static templates**. Environment context is **injected at runtime**.

**Chat Persona (Role A) assembly:**
```
┌─────────────────────────────────────────────────┐
│ SYSTEM MESSAGE                                  │
│ ← chat_prompt.md (static)                       │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ ROLLING HISTORY                                 │
│ ← From chat JSON file (token-budgeted)          │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ USER MESSAGE                                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ ENVIRONMENT (injected)                      │ │
│ │ **URL:** https://youtube.com/               │ │
│ │ **Title:** YouTube                          │ │
│ │ **Tabs:**                                   │ │
│ │ - Tab 1: "YouTube" -- ACTIVE TAB            │ │
│ │ - Tab 2: "Google"                           │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ USER MESSAGE                                │ │
│ │ scroll down                                 │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Decision Engine (Role B) assembly:**
```
┌─────────────────────────────────────────────────┐
│ SYSTEM MESSAGE                                  │
│ ← executor_prompt.md (static)                   │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ USER MESSAGE                                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ CONTEXT (injected)                          │ │
│ │ Intent: "scroll down the page"              │ │
│ │ Active tab: YouTube (youtube.com)           │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ OPTIONS (from RAG)                          │ │
│ │ Capabilities:                               │ │
│ │ - ScrollDown: Scroll page down (0.95)       │ │
│ │ - ScrollUp: Scroll page up (0.12)           │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

Environment format mirrors `@site_structures/text.md` for consistency.

### Chat Persona System Prompt (`chat_prompt.md`)

```markdown
You are Om-E, a friendly assistant that helps users browse the web.

Your ONLY job is to have a natural conversation. You NEVER execute actions directly.

When responding, return JSON with this exact structure:
{
  "handoff": false,
  "reply": "Your conversational response to the user"
}

OR, if the user wants you to DO something on the page (click, type, navigate, scroll, etc.):
{
  "handoff": true,
  "intent": "short normalized description of what user wants",
  "original_text": "the user's exact message"
}

## Rules
1. NEVER include action IDs, element references, or capability names
2. NEVER try to execute anything - just classify the intent
3. If user is just chatting (greeting, question, clarification) → handoff=false
4. If user wants action (click, scroll, navigate, search, etc.) → handoff=true
5. Keep replies concise and helpful
6. If unsure whether user wants action → ask clarifying question (handoff=false)

## Intent Examples
- "click the login button" → intent: "click login button"
- "search for cats" → intent: "search for cats"
- "scroll down" → intent: "scroll page down"
- "go to youtube" → intent: "navigate to youtube"
- "what's on this page?" → handoff=false (just a question)
```

**Size constraint:** Prompt ~300 tokens

### Decision Engine System Prompt (`executor_prompt.md`)

```markdown
You are a decision engine. Given a user intent and a list of options, choose EXACTLY ONE action.

You MUST respond with JSON in this exact structure:
{
  "decision": "cap" | "act" | "ask_user" | "cannot" | "noop",
  "target": "capability name or element ID",
  "value": "optional value for input actions",
  "question": "only if decision=ask_user",
  "reason": "explanation for noop/cannot"
}

## Rules
1. ONLY choose from the provided options list
2. NEVER invent new actions, IDs, or capabilities
3. If multiple options seem valid, pick the BEST match
4. If no option matches well → decision="ask_user" with clarifying question
5. If truly impossible → decision="cannot" with reason
6. If already done (user is on the page, checkbox already checked, etc.) → decision="noop"

## Decision Types
- "cap": Execute a capability (e.g., ScrollDown, RetrieveTranscript)
- "act": Execute an element action (click, setValue, navigate)
- "ask_user": Need clarification (provide 2-3 suggested choices)
- "cannot": Cannot fulfill request (explain why)
- "noop": Already done / no action needed (explain what's already true)

## Option Format
Capabilities: {name, description, score}
Elements: {id, label, type, score}

## Examples
Intent: "scroll down"
Options: [{name: "ScrollDown", description: "Scroll page down", score: 0.95}]
→ {"decision": "cap", "target": "ScrollDown"}

Intent: "click sign in"
Options: [{id: 5, label: "Sign In", type: "Link", score: 0.92}]
→ {"decision": "act", "target": 5}

Intent: "open youtube"
Active tab: {url: "https://youtube.com", title: "YouTube"}
→ {"decision": "noop", "reason": "You're already on YouTube"}

Intent: "scroll down"
Active tab shows: "Already at bottom of page"
→ {"decision": "noop", "reason": "Already at the bottom of the page"}
```

**Size constraint:** Prompt ~400 tokens

### Deep Scan System Prompt (`deep_scan_prompt.md`)

```markdown
You are a deep scanner. The user's intent could not be resolved from the quick options.
You now have access to the FULL page content. Find the best action.

Respond with JSON:
{
  "decision": "cap" | "act" | "ask_user" | "cannot" | "noop",
  "target": "capability name or element ID",
  "value": "optional value",
  "selector_hints": ["CSS selector", "aria-label hint"],
  "reason": "explanation"
}

## Rules
1. Search the page content carefully for matching elements
2. If you find a match, provide selector hints (CSS selectors, aria-labels)
3. Use the element's data-ome-action-id if visible
4. If no match → decision="cannot" with helpful explanation
5. If already done → decision="noop" (e.g., "You're already on that page")
6. NEVER hallucinate elements that don't exist in the page content
```

**Size constraint:** Prompt ~250 tokens (context will be larger due to page content)

### JSON Contracts (`contracts.py`)

```python
"""
JSON contract validators for LLM role outputs.
Uses Pydantic for strict validation.
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, Literal, List, Union
from enum import Enum

# ============================================================
# Chat Persona Output
# ============================================================

class ChatPersonaReply(BaseModel):
    """Chat-only response (no action needed)."""
    handoff: Literal[False]
    reply: str = Field(..., min_length=1, max_length=2000)

    # Optional: Request server to retrieve memory before responding
    # Example: {"handoff": false, "reply": "Let me check...", "findMemory": "dark mode preference"}
    findMemory: Optional[str] = Field(None, max_length=200)

    # Optional: Request server to retrieve capability info
    # Example: {"handoff": false, "reply": "I can help with that...", "findCommand": "screenshot"}
    findCommand: Optional[str] = Field(None, max_length=100)

# NOTE: Removed IntentConstraints - these were unenforceable advisory fields
# that could drift from server rules. Server handles all constraint logic.

class ChatPersonaHandoff(BaseModel):
    """Handoff to Decision Engine. Simple intent extraction only."""
    handoff: Literal[True]
    intent: str = Field(..., min_length=3, max_length=200)
    original_text: str = Field(..., min_length=1, max_length=1000)
    # No constraints field - server owns all execution rules

ChatPersonaOutput = Union[ChatPersonaReply, ChatPersonaHandoff]

def validate_chat_persona_output(data: dict) -> ChatPersonaOutput:
    """Validate and parse Chat Persona output."""
    if data.get("handoff") is True:
        return ChatPersonaHandoff(**data)
    return ChatPersonaReply(**data)

async def handle_find_memory(query: str, chat_id: str) -> Optional[str]:
    """
    Server-side memory retrieval for findMemory requests.

    When Role A outputs findMemory, server:
    1. Queries chat memory FAISS for relevant context
    2. Re-calls Role A with retrieved context injected
    3. Returns final response to user
    """
    from llm.memory import faiss_query

    results = await faiss_query(
        query=query,
        filter={"chat_id": chat_id, "type": "topic_summary"},
        top_k=3
    )

    if results:
        return "\n".join([
            f"[Memory: {r.get('text', '')}]"
            for r in results
        ])
    return None

async def handle_find_command(query: str) -> Optional[str]:
    """
    Server-side capability retrieval for findCommand requests.

    When Role A outputs findCommand, server:
    1. Queries capabilities store for matching commands
    2. Returns capability info for Role A to incorporate
    """
    from llm.memory import capabilities_store

    results = await capabilities_store.query(
        query=query,
        top_k=3
    )

    if results:
        return "\n".join([
            f"[Capability: {r.get('action', '')} - {r.get('description', '')}]"
            for r in results
        ])
    return None

# ============================================================
# Turn State (Explicit State Machine)
# ============================================================

class TurnState(str, Enum):
    """
    Explicit conversation turn state for debugging and auditing.
    Makes state transitions visible and prevents impossible combinations.

    Naming: TURN_ prefix for grepability (grep -r "TURN_" finds all states).
    """
    TURN_CHAT_ONLY = "turn_chat_only"                     # Role A responded, no handoff
    TURN_HANDOFF_PENDING = "turn_handoff_pending"         # Role A handed off, awaiting RAG
    TURN_EXECUTING = "turn_executing"                     # Decision made, action dispatching
    TURN_AWAITING_CONFIRM = "turn_awaiting_confirm"       # Critical action blocked
    TURN_ESCALATION_OFFERED = "turn_escalation_offered"   # Full page scan offered
    TURN_COMPLETED = "turn_completed"                     # Turn finished successfully
    TURN_FAILED = "turn_failed"                           # Turn failed (LLM error, etc.)

# ============================================================
# Decision Engine Output
# ============================================================

class DecisionType(str, Enum):
    CAP = "cap"           # Execute a capability
    ACT = "act"           # Execute an element action
    ASK_USER = "ask_user" # Need clarification
    CANNOT = "cannot"     # Can't do it (triggers escalation offer)
    NOOP = "noop"         # Already done / no action needed

class DecisionEngineOutput(BaseModel):
    """Decision Engine response."""
    decision: DecisionType
    target: Optional[Union[str, int]] = None  # cap name or element ID
    value: Optional[str] = None  # for setValue actions
    question: Optional[str] = None  # for ask_user
    choices: Optional[List[str]] = None  # suggested choices for ask_user
    reason: Optional[str] = None  # Optional - server can inject explanations

    @validator('target')
    def target_required_for_cap_act(cls, v, values):
        if values.get('decision') in [DecisionType.CAP, DecisionType.ACT]:
            if v is None:
                raise ValueError('target required for cap/act decisions')
        return v

    @validator('question')
    def question_required_for_ask_user(cls, v, values):
        if values.get('decision') == DecisionType.ASK_USER:
            if not v:
                raise ValueError('question required for ask_user decision')
        return v

def validate_decision_engine_output(data: dict) -> DecisionEngineOutput:
    """Validate and parse Decision Engine output."""
    return DecisionEngineOutput(**data)

# ============================================================
# Deep Scan Output
# ============================================================

class DeepScanOutput(BaseModel):
    """
    Deep Scan fallback response.

    Can return either action ID OR selector hints for elements
    not in the quick registry. Selector pipeline handles resolution.
    """
    decision: DecisionType
    target: Optional[Union[str, int]] = None  # Action ID or capability name
    value: Optional[str] = None
    selector_hints: Optional[List[str]] = None  # CSS selectors for dynamic elements
    reason: str = Field(..., min_length=1, max_length=500)

def validate_deep_scan_output(data: dict) -> DeepScanOutput:
    """Validate and parse Deep Scan output."""
    return DeepScanOutput(**data)

# ============================================================
# Decision Context (Server-assembled)
# ============================================================

class RiskLevel(str, Enum):
    """Risk classification for capabilities."""
    SAFE = "safe"          # ScrollDown, GetPageInfo - no confirmation needed
    SENSITIVE = "sensitive" # OpenTab, Navigate - may leave current page
    CRITICAL = "critical"   # DeleteChat, ClearHistory - destructive actions

# ============================================================
# Capability Risk Registry (Server-owned, single source of truth)
# ============================================================

CAPABILITY_RISK_MAP: Dict[str, RiskLevel] = {
    # SAFE - No confirmation needed
    "ScrollDown": RiskLevel.SAFE,
    "ScrollUp": RiskLevel.SAFE,
    "GetPageInfo": RiskLevel.SAFE,
    "RetrieveTranscript": RiskLevel.SAFE,
    "GetCurrentUrl": RiskLevel.SAFE,
    "CopyToClipboard": RiskLevel.SAFE,

    # SENSITIVE - Warn user, may change page
    "OpenTab": RiskLevel.SENSITIVE,
    "Navigate": RiskLevel.SENSITIVE,
    "CloseTab": RiskLevel.SENSITIVE,
    "SwitchTab": RiskLevel.SENSITIVE,
    "SubmitForm": RiskLevel.SENSITIVE,
    "SetTheme": RiskLevel.SENSITIVE,

    # CRITICAL - BLOCK until explicit "yes"
    "DeleteChat": RiskLevel.CRITICAL,
    "ClearHistory": RiskLevel.CRITICAL,
    "ClearAllData": RiskLevel.CRITICAL,
    "LogOut": RiskLevel.CRITICAL,
}

def get_capability_risk(capability_name: str) -> RiskLevel:
    """
    Get risk level for a capability. Defaults to SAFE if not in registry.

    NOTE: Add new capabilities to CAPABILITY_RISK_MAP above.
    Unknown capabilities default SAFE to avoid blocking legitimate actions.
    """
    return CAPABILITY_RISK_MAP.get(capability_name, RiskLevel.SAFE)

class DecisionMode(str, Enum):
    """What kind of choice the Decision Engine is making."""
    CAP_ONLY = "cap_only"       # Only capabilities available (Phase 1)
    ELEMENTS_ONLY = "elements_only"  # Only page elements available
    MIXED = "mixed"             # Both caps and elements available

class CapabilityOption(BaseModel):
    """A capability option for Decision Engine."""
    name: str
    description: str
    score: float = Field(..., ge=0.0, le=1.0)
    risk: RiskLevel = RiskLevel.SAFE  # Server enforces confirmation rules

class ElementOption(BaseModel):
    """An element option for Decision Engine."""
    id: int  # Numeric ID
    label: str
    type: str  # Link, Button, Input, Select, etc.
    tag: str  # HTML tag
    score: float = Field(..., ge=0.0, le=1.0)

class DecisionContext(BaseModel):
    """Context assembled by server for Decision Engine."""
    intent: str
    original_text: str
    mode: DecisionMode = DecisionMode.CAP_ONLY  # Tells LLM what's available
    active_tab: dict  # {url, title}
    page_summary: Optional[str] = None  # Short summary if available
    capabilities: List[CapabilityOption] = Field(default_factory=list, max_items=10)
    elements: List[ElementOption] = Field(default_factory=list, max_items=10)
```

### Testing Stage 1

```bash
# Validate prompt files exist and are valid markdown
ls -la om_e_web_ws/data/prompts/

# Test contract validation
python3 -c "
from om_e_web_ws.llm.contracts import *

# Test Chat Persona outputs
reply = validate_chat_persona_output({'handoff': False, 'reply': 'Hello!'})
print(f'Reply validated: {reply}')

handoff = validate_chat_persona_output({
    'handoff': True,
    'intent': 'click login button',
    'original_text': 'click login'
})
print(f'Handoff validated: {handoff}')

# Test Decision Engine output
decision = validate_decision_engine_output({
    'decision': 'cap',
    'target': 'ScrollDown',
    'reason': 'User wants to scroll'
})
print(f'Decision validated: {decision}')
"
```

---

## Stage 2: PersonaOrchestrator Class

**Goal:** Create the orchestrator that coordinates Role A → RAG → Role B → execution.

### Files to Create

| File | Purpose |
|------|---------|
| `om_e_web_ws/llm/orchestrator.py` | PersonaOrchestrator class |

### Files Modified

| File | Changes |
|------|---------|
| `om_e_web_ws/llm/agent.py` | Add `call_role()` method for role-specific prompts |

### Files Unchanged
- `llm/client.py` - HTTP client unchanged
- `llm/executor.py` - Resilient parsing unchanged (reused)
- `llm/dispatcher.py` - Action routing unchanged
- All retrieval stores unchanged

### PersonaOrchestrator (`orchestrator.py`)

```python
"""
PersonaOrchestrator - Server-owned coordination of LLM roles.

Flow:
1. Receive user message
2. Call Chat Persona (Role A)
3. If handoff=true, run RAG retrieval
4. Call Decision Engine (Role B) with options
5. Apply confidence gating
6. Execute or escalate to Deep Scan

Server is the source of truth. LLM roles never see full dumps.
"""
import asyncio
import json
import logging
from typing import Optional, Dict, List, Tuple, Any
from dataclasses import dataclass, field
from pathlib import Path

from .agent import OmEAgent
from .contracts import (
    validate_chat_persona_output,
    validate_decision_engine_output,
    validate_deep_scan_output,
    ChatPersonaOutput,
    DecisionEngineOutput,
    DeepScanOutput,
    DecisionContext,
    CapabilityOption,
    ElementOption,
    DecisionType,
)
from .executor import extract_json_from_response

# Lazy imports to avoid circular
def get_retrieval_modules():
    from ..retrieval.capabilities_store import CapabilitiesStore
    from ..retrieval.elements_store import ElementsStore
    from ..retrieval.chat_memory_store import ChatMemoryStore
    return CapabilitiesStore, ElementsStore, ChatMemoryStore

logger = logging.getLogger(__name__)

# ============================================================
# Configuration Constants
# ============================================================

# Prompt size limits (with 10% buffer built into totals)
MAX_HISTORY_TOKENS = 600  # Rolling chat history budget for Chat Persona
MAX_TAB_TITLES = 5  # Tab titles in environment hint
MAX_CAPABILITY_OPTIONS = 10
MAX_ELEMENT_OPTIONS = 10  # For future element store

# Summarization trigger
SUMMARIZE_THRESHOLD_TOKENS = 2000  # Compress older messages above this

# Confidence thresholds (tune after 2 weeks of metrics)
HIGH_CONFIDENCE_THRESHOLD = 0.85  # Act immediately
MEDIUM_CONFIDENCE_THRESHOLD = 0.60  # May need clarification
LOW_CONFIDENCE_THRESHOLD = 0.40  # Offer full page fallback

# Retry configuration
MAX_LLM_RETRIES = 3
RETRY_BACKOFF_BASE_MS = 500  # Exponential: 500, 1000, 2000

# Prompt file paths - in data/prompts/ alongside existing system.md
PROMPTS_DIR = Path(__file__).parent.parent / "data" / "prompts"

# ============================================================
# Data Classes
# ============================================================

@dataclass
class OrchestratorState:
    """
    Tracks conversation FLOW state (not history - that's in JSON files).

    NOTE: Use transition_to() for state changes. Check state via current_turn_state directly.
    Do NOT use boolean flags - they conflict with the state machine.
    """
    current_chat_id: Optional[str] = None  # Active chat (from ws_server)
    current_turn_state: TurnState = TurnState.TURN_CHAT_ONLY  # Explicit state machine
    last_decision_context: Optional[DecisionContext] = None
    # Pending data for multi-turn flows
    pending_intent: Optional[str] = None  # For escalation flow
    pending_critical_action: Optional[DecisionEngineOutput] = None  # For confirmation flow
    pending_critical_context: Optional[DecisionContext] = None

    def transition_to(self, new_state: TurnState) -> None:
        """
        Explicit state transition with logging.
        Helps debug weird UX flows.
        """
        logger.debug(f"Turn state: {self.current_turn_state.value} → {new_state.value}")
        self.current_turn_state = new_state

    def is_awaiting_deep_scan_consent(self) -> bool:
        """Check if waiting for user to consent to full page scan."""
        return self.current_turn_state == TurnState.TURN_ESCALATION_OFFERED

    def is_awaiting_critical_confirmation(self) -> bool:
        """Check if waiting for user to confirm critical action."""
        return self.current_turn_state == TurnState.TURN_AWAITING_CONFIRM

    def reset_turn(self) -> None:
        """Reset state for a new turn."""
        self.current_turn_state = TurnState.TURN_CHAT_ONLY
        self.pending_intent = None
        self.pending_critical_action = None
        self.pending_critical_context = None

@dataclass
class OrchestratorResult:
    """Result from orchestrator processing."""
    response_text: str
    turn_state: TurnState = TurnState.TURN_CHAT_ONLY  # Final state of this turn
    action_executed: bool = False
    action_type: Optional[str] = None  # 'cap', 'act', 'ask_user', 'cannot', 'noop', 'awaiting_confirmation'
    action_target: Optional[str] = None
    requires_deep_scan_consent: bool = False
    requires_confirmation: bool = False  # True if waiting for critical action confirmation
    noop_reason: Optional[str] = None  # Explanation when decision is noop

# ============================================================
# PersonaOrchestrator
# ============================================================

class PersonaOrchestrator:
    """
    Coordinates Chat Persona → RAG → Decision Engine → Execution.

    Server-owned, keeps prompts small, LLM roles only choose from options.
    """

    def __init__(self, llm_agent: OmEAgent):
        """
        Initialize orchestrator with existing LLM agent.

        Args:
            llm_agent: Existing OmEAgent instance (for HTTP calls)
        """
        self.agent = llm_agent
        self.state = OrchestratorState()
        self._prompt_cache: Dict[str, str] = {}

        # Load prompt templates
        self._load_prompts()

    def _load_prompts(self):
        """Load prompt templates from files."""
        # Map role names to file names in data/prompts/
        role_to_file = {
            "chat_persona": "chat_prompt.md",
            "decision_engine": "executor_prompt.md",
            "deep_scan": "deep_scan_prompt.md"
        }
        for role, filename in role_to_file.items():
            path = PROMPTS_DIR / filename
            if path.exists():
                self._prompt_cache[role] = path.read_text()
            else:
                logger.warning(f"Prompt file not found: {path}")
                self._prompt_cache[role] = ""

    # --------------------------------------------------------
    # Main Entry Point
    # --------------------------------------------------------

    async def process_message(
        self,
        user_message: str,
        chat_id: Optional[str] = None,
        active_tab: Optional[Dict] = None,
        tabs: Optional[List[Dict]] = None,
        element_registry: Optional[Dict] = None,
    ) -> OrchestratorResult:
        """
        Process user message through the two-role architecture.

        Args:
            user_message: User's input text
            chat_id: Current chat ID (for loading history from JSON)
            active_tab: Current active tab {url, title}
            tabs: List of open tabs [{id, url, title}, ...]
            element_registry: ELEMENT_REGISTRY from ws_server

        Returns:
            OrchestratorResult with response and action details
        """
        # Track current chat
        self.state.current_chat_id = chat_id

        # Check if user is responding to CRITICAL action confirmation
        if self.state.is_awaiting_critical_confirmation():
            return await self._handle_critical_confirmation(user_message)

        # Check if user is responding to full page fallback consent
        if self.state.is_awaiting_deep_scan_consent():
            return await self._handle_escalation_consent(user_message)

        # STEP 1: Call Chat Persona (with rolling history from JSON)
        persona_output = await self._call_chat_persona(
            user_message, active_tab, tabs, chat_id
        )

        # If chat-only, return reply directly
        # NOTE: ws_server handles persisting messages to JSON - we just return
        if not persona_output.handoff:
            return OrchestratorResult(
                response_text=persona_output.reply,
                action_executed=False
            )

        # STEP 2: Run RAG retrieval
        intent = persona_output.intent
        decision_context = await self._build_decision_context(
            intent=intent,
            original_text=persona_output.original_text,
            active_tab=active_tab,
            element_registry=element_registry
        )

        # STEP 3: Call Decision Engine
        decision_output = await self._call_decision_engine(decision_context)

        # STEP 4: Apply confidence gating
        result = await self._apply_confidence_gating(
            decision_output, decision_context, user_message
        )

        return result

    # --------------------------------------------------------
    # Role A: Chat Persona
    # --------------------------------------------------------

    async def _call_chat_persona(
        self,
        user_message: str,
        active_tab: Optional[Dict],
        tabs: Optional[List[Dict]],
        chat_id: Optional[str] = None,
    ) -> ChatPersonaOutput:
        """
        Call Chat Persona role with rolling history.

        Inputs:
        - User message
        - Rolling history within 600 token budget from JSON chat file (source of truth)
        - Minimal environment hint (active tab + top 5 tab titles)

        If history exceeds token budget, summarize older messages (Phase 2).
        """
        # Build environment hint (minimal)
        env_hint = self._build_environment_hint(active_tab, tabs)

        # Get rolling history from JSON file (token-budgeted)
        chat_history = await self._get_rolling_history(chat_id, MAX_HISTORY_TOKENS)

        # Build messages for LLM
        system_prompt = self._prompt_cache.get("chat_persona", "")

        messages = [{"role": "system", "content": system_prompt}]

        # Add rolling history from JSON (source of truth)
        for msg in chat_history:
            messages.append(msg)

        # Add current message with environment context prepended
        # Format matches @site_structures/text.md for consistency
        user_content = f"""────────────────────────
ENVIRONMENT
────────────────────────
{env_hint}

────────────────────────
USER MESSAGE
────────────────────────
{user_message}"""
        messages.append({"role": "user", "content": user_content})

        # Call LLM
        response_text = await self.agent.call_role(
            messages=messages,
            temperature=0.7,
            max_tokens=500
        )

        # Parse response
        try:
            json_data = extract_json_from_response(response_text)
            if json_data:
                return validate_chat_persona_output(json_data)
        except Exception as e:
            logger.warning(f"Chat Persona parse error: {e}")

        # Fallback: treat as chat-only reply
        # NOTE: ChatPersonaOutput is a Union type, can't instantiate directly
        return ChatPersonaReply(handoff=False, reply=response_text)

    def _build_environment_hint(
        self,
        active_tab: Optional[Dict],
        tabs: Optional[List[Dict]]
    ) -> str:
        """
        Build environment context for Chat Persona.

        Mirrors the format from @site_structures/text.md:
        **URL:** https://www.youtube.com/
        **Tabs:**
        - Tab 1: "YouTube" (www.youtube.com) -- ACTIVE TAB
        - Tab 2: "Google" (www.google.com)
        """
        lines = []

        # URL and title
        if active_tab:
            url = active_tab.get("url", "")
            title = active_tab.get("title", "Unknown")
            lines.append(f"**URL:** {url}")
            lines.append(f"**Title:** {title}")

        # Tabs list
        if tabs:
            lines.append("")
            lines.append("**Tabs:**")
            active_id = active_tab.get("id") if active_tab else None
            for i, tab in enumerate(tabs[:MAX_TAB_TITLES], 1):
                tab_title = tab.get("title", "Untitled")[:40]
                tab_domain = self._extract_domain(tab.get("url", ""))
                marker = " -- ACTIVE TAB" if tab.get("id") == active_id else ""
                lines.append(f"- Tab {i}: \"{tab_title}\" ({tab_domain}){marker}")

        return "\n".join(lines) if lines else "No tab info"

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL for display."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.netloc or "unknown"
        except:
            return "unknown"

    async def _get_rolling_history(
        self,
        chat_id: Optional[str],
        max_tokens: int = 600
    ) -> List[Dict]:
        """
        Get rolling chat history from JSON file within token budget.

        Strategy: Rolling summary + last few turns, fitting within max_tokens.
        - Prefer: rolling summary (if exists) + last 3-5 raw messages
        - Fallback: last N messages that fit budget
        - If over budget: truncate oldest messages first

        Source of truth is data/chats/{chat_id}.json
        """
        if not chat_id:
            return []

        # Load from JSON chat file (existing system)
        chat_path = Path(f"data/chats/{chat_id}.json")
        if not chat_path.exists():
            return []

        try:
            with open(chat_path) as f:
                chat_data = json.load(f)

            messages = chat_data.get("messages", [])
            summaries = chat_data.get("summaries", {})

            # Build history within token budget
            history = []
            used_tokens = 0

            # 1. Include rolling summary if available (~200t)
            rolling_summary = summaries.get("rolling")
            if rolling_summary:
                summary_tokens = self._estimate_tokens(rolling_summary)
                if summary_tokens < max_tokens * 0.4:  # Max 40% for summary
                    history.append({
                        "role": "system",
                        "content": f"[Previous context: {rolling_summary}]"
                    })
                    used_tokens += summary_tokens

            # 2. Add recent messages (newest first, then reverse)
            remaining_budget = max_tokens - used_tokens
            recent_messages = []

            for msg in reversed(messages):
                msg_tokens = self._estimate_tokens(msg.get("content", ""))
                if used_tokens + msg_tokens > max_tokens:
                    break
                recent_messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
                used_tokens += msg_tokens

            # Reverse to chronological order
            recent_messages.reverse()
            history.extend(recent_messages)

            return history

        except Exception as e:
            logger.warning(f"Failed to load chat history: {e}")
            return []

    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimate (4 chars per token)."""
        return len(text) // 4

    # --------------------------------------------------------
    # RAG Retrieval
    # --------------------------------------------------------

    async def _build_decision_context(
        self,
        intent: str,
        original_text: str,
        active_tab: Optional[Dict],
        element_registry: Optional[Dict],
    ) -> DecisionContext:
        """
        Query RAG stores and build Decision Context.

        Phase 1: Capabilities store only (mature)
        Phase 2: Add element store when built
        """
        CapabilitiesStore, _, _ = get_retrieval_modules()

        # Query capabilities store (MATURE - use for testing)
        cap_options = []
        try:
            cap_store = CapabilitiesStore()
            cap_results = await cap_store.query(intent, top_k=MAX_CAPABILITY_OPTIONS)
            for r in cap_results:
                cap_options.append(CapabilityOption(
                    name=r["name"],
                    description=r.get("description", "")[:100],
                    score=r.get("score", 0.5)
                ))
        except Exception as e:
            logger.warning(f"Capabilities query error: {e}")

        # Element store - PHASE 2 (not built yet)
        # For now, element actions go through existing action-ID pipeline
        # Decision Engine can return "act" but we validate against ELEMENT_REGISTRY
        elem_options = []
        # TODO: Implement when element store is built
        # if element_registry:
        #     elem_store = ElementsStore()
        #     elem_results = await elem_store.query(intent, top_k=MAX_ELEMENT_OPTIONS)
        #     ...

        # Determine mode based on what options are available
        if cap_options and elem_options:
            mode = DecisionMode.MIXED
        elif cap_options:
            mode = DecisionMode.CAP_ONLY
        elif elem_options:
            mode = DecisionMode.ELEMENTS_ONLY
        else:
            mode = DecisionMode.CAP_ONLY  # Default even if empty

        return DecisionContext(
            intent=intent,
            original_text=original_text,
            mode=mode,  # Tells LLM what kind of choice it's making
            active_tab=active_tab or {"url": "", "title": ""},
            capabilities=cap_options,
            elements=elem_options  # Empty for Phase 1
        )

    # --------------------------------------------------------
    # Role B: Decision Engine
    # --------------------------------------------------------

    async def _call_decision_engine(
        self,
        context: DecisionContext
    ) -> DecisionEngineOutput:
        """
        Call Decision Engine with server-prepared options.

        LLM ONLY chooses from provided options. Cannot invent.
        """
        system_prompt = self._prompt_cache.get("decision_engine", "")

        # Build options text
        options_text = self._format_options_for_prompt(context)

        # Build user message with context
        user_content = f"""
Intent: {context.intent}
Original request: "{context.original_text}"
Active tab: {context.active_tab.get('title', 'Unknown')} - {context.active_tab.get('url', '')[:60]}

## Available Options
{options_text}

Choose the BEST option from above. Return JSON only.
"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        # Call LLM with low temperature for determinism
        response_text = await self.agent.call_role(
            messages=messages,
            temperature=0.2,
            max_tokens=300
        )

        # Parse response
        try:
            json_data = extract_json_from_response(response_text)
            if json_data:
                return validate_decision_engine_output(json_data)
        except Exception as e:
            logger.warning(f"Decision Engine parse error: {e}")

        # Fallback: cannot
        return DecisionEngineOutput(
            decision=DecisionType.CANNOT,
            reason="Failed to parse decision"
        )

    def _format_options_for_prompt(self, context: DecisionContext) -> str:
        """Format options list for Decision Engine prompt."""
        lines = []

        if context.capabilities:
            lines.append("### Capabilities")
            for cap in context.capabilities:
                lines.append(f"- {cap.name}: {cap.description} (score: {cap.score:.2f})")

        if context.elements:
            lines.append("\n### Page Elements")
            for elem in context.elements:
                lines.append(f"- ID {elem.id}: [{elem.type}] {elem.label} (score: {elem.score:.2f})")

        if not lines:
            lines.append("No options available.")

        return "\n".join(lines)

    # --------------------------------------------------------
    # Confidence Gating
    # --------------------------------------------------------

    async def _apply_confidence_gating(
        self,
        decision: DecisionEngineOutput,
        context: DecisionContext,
        user_message: str
    ) -> OrchestratorResult:
        """
        Apply server-owned confidence gating.

        Rules:
        - CRITICAL risk → BLOCK until explicit "yes" confirmation (NEVER auto-execute)
        - SENSITIVE risk → Execute with warning note
        - SAFE + high confidence (>0.85) → Execute immediately
        - SAFE + medium confidence (0.60-0.85) → Execute with note
        - Low confidence (<0.60) or ambiguous → Ask clarification
        - Cannot + low confidence → Offer full page fallback
        """
        # Get top score and risk level from options
        top_score = self._get_top_score(context, decision)
        risk_level = self._get_risk_level(context, decision)

        # Handle different decisions
        if decision.decision == DecisionType.CAP:
            # CRITICAL: BLOCK until explicit confirmation (server-enforced)
            if risk_level == RiskLevel.CRITICAL:
                self.state.transition_to(TurnState.TURN_AWAITING_CONFIRM)
                self.state.pending_critical_action = decision
                self.state.pending_critical_context = context
                return OrchestratorResult(
                    response_text=f"⚠️ This will {decision.target}. This is a destructive action. Say 'yes' to confirm.",
                    turn_state=TurnState.TURN_AWAITING_CONFIRM,
                    action_executed=False,  # NOT executed - blocked until confirmation
                    action_type="awaiting_confirmation",
                    requires_confirmation=True
                )
            # SENSITIVE: Execute with warning
            elif risk_level == RiskLevel.SENSITIVE:
                return OrchestratorResult(
                    response_text=f"⚠️ {decision.target} (this may change your current page)",
                    action_executed=True,
                    action_type="cap",
                    action_target=decision.target
                )
            elif top_score >= HIGH_CONFIDENCE_THRESHOLD:
                # Safe + high confidence → execute silently
                return OrchestratorResult(
                    response_text=f"Executing {decision.target}...",
                    action_executed=True,
                    action_type="cap",
                    action_target=decision.target
                )
            else:
                # Execute with explanation
                return OrchestratorResult(
                    response_text=f"I'll try {decision.target}.",
                    action_executed=True,
                    action_type="cap",
                    action_target=decision.target
                )

        elif decision.decision == DecisionType.ACT:
            if top_score >= HIGH_CONFIDENCE_THRESHOLD:
                return OrchestratorResult(
                    response_text=f"Clicking element {decision.target}...",
                    action_executed=True,
                    action_type="act",
                    action_target=str(decision.target)
                )
            else:
                return OrchestratorResult(
                    response_text=f"I'll click {decision.target}. {decision.reason}",
                    action_executed=True,
                    action_type="act",
                    action_target=str(decision.target)
                )

        elif decision.decision == DecisionType.ASK_USER:
            return OrchestratorResult(
                response_text=decision.question or "Could you clarify?",
                action_executed=False,
                action_type="ask_user"
            )

        elif decision.decision == DecisionType.NOOP:
            # Already done / no action needed - respond without escalation
            # Examples: "you're already on that page", "that's already checked"
            self.state.transition_to(TurnState.TURN_COMPLETED)
            reason = decision.reason or "Already done"
            return OrchestratorResult(
                response_text=reason,
                turn_state=TurnState.TURN_COMPLETED,
                action_executed=False,  # Nothing was executed
                action_type="noop",
                noop_reason=reason
            )

        elif decision.decision == DecisionType.CANNOT:
            if top_score < LOW_CONFIDENCE_THRESHOLD:
                # Offer resolution escalation (deep scan)
                self.state.transition_to(TurnState.TURN_ESCALATION_OFFERED)
                self.state.pending_intent = context.intent
                return OrchestratorResult(
                    response_text=(
                        f"I couldn't find a clear match for '{context.intent}'. "
                        "Would you like me to do a deeper analysis of the page? (yes/no)"
                    ),
                    turn_state=TurnState.TURN_ESCALATION_OFFERED,
                    action_executed=False,
                    requires_deep_scan_consent=True
                )
            else:
                reason = decision.reason or "No matching option found"
                self.state.transition_to(TurnState.TURN_COMPLETED)
                return OrchestratorResult(
                    response_text=f"I can't do that: {reason}",
                    turn_state=TurnState.TURN_COMPLETED,
                    action_executed=False,
                    action_type="cannot"
                )

        # Fallback
        return OrchestratorResult(
            response_text="I'm not sure how to help with that.",
            action_executed=False
        )

    def _get_top_score(
        self,
        context: DecisionContext,
        decision: DecisionEngineOutput
    ) -> float:
        """Get the score of the chosen option."""
        if decision.decision == DecisionType.CAP:
            for cap in context.capabilities:
                if cap.name == decision.target:
                    return cap.score
        elif decision.decision == DecisionType.ACT:
            for elem in context.elements:
                if elem.id == decision.target:
                    return elem.score
        return 0.5  # Default medium

    def _get_risk_level(
        self,
        context: DecisionContext,
        decision: DecisionEngineOutput
    ) -> RiskLevel:
        """
        Get the risk level of the chosen capability.

        Uses CAPABILITY_RISK_MAP as the single source of truth.
        Falls back to cap.risk field if present (for backwards compat).
        """
        if decision.decision == DecisionType.CAP:
            # Primary: Use server-owned risk registry
            risk = get_capability_risk(decision.target)
            if risk != RiskLevel.SAFE:
                return risk

            # Fallback: Check the option's risk field (if populated)
            for cap in context.capabilities:
                if cap.name == decision.target:
                    return cap.risk

        return RiskLevel.SAFE  # Default safe for elements/unknown

    # --------------------------------------------------------
    # Execution Verification
    # --------------------------------------------------------

    async def _verify_execution(
        self,
        result: OrchestratorResult,
        pre_state: Dict
    ) -> Dict:
        """
        Verify that an action actually worked after execution.

        Checks:
        - Click: Did DOM change? Did URL change? Did aria-expanded toggle?
        - SetValue: Did element value update?
        - Navigate: Did URL change to expected destination?

        Returns: {"success": bool, "reason": str}
        """
        if not result.action_executed:
            return {"success": True, "reason": "No action to verify"}

        # Get current state
        post_state = await self._get_page_state()

        # Check for URL change (navigation)
        if pre_state.get("url") != post_state.get("url"):
            return {"success": True, "reason": "URL changed"}

        # Check for DOM changes
        if pre_state.get("dom_hash") != post_state.get("dom_hash"):
            return {"success": True, "reason": "DOM changed"}

        # Check for element value changes (setValue)
        if result.action_type == "act" and result.action_target:
            element_value = await self._get_element_value(result.action_target)
            if element_value != pre_state.get("element_value"):
                return {"success": True, "reason": "Element value changed"}

        # No observable change detected
        return {"success": False, "reason": "No observable change detected"}

    async def _get_page_state(self) -> Dict:
        """
        Capture current page state for verification comparison.
        Lightweight snapshot: URL, DOM element count, key element values.
        """
        # This would call content.js to get state
        # Simplified stub for now
        return {
            "url": CURRENT_ACTIVE_TAB.get("url") if CURRENT_ACTIVE_TAB else None,
            "dom_hash": None,  # Would be computed by content.js
            "timestamp": time.time()
        }

    async def _get_element_value(self, action_id: str) -> Optional[str]:
        """Get current value of an element by action ID."""
        # Would call content.js to get element value
        return None

    # --------------------------------------------------------
    # Critical Action Confirmation
    # --------------------------------------------------------

    async def _handle_critical_confirmation(
        self,
        user_response: str
    ) -> OrchestratorResult:
        """
        Handle user response to critical action confirmation.

        CRITICAL actions (DeleteChat, ClearHistory, etc.) are BLOCKED
        until user explicitly says "yes". This is server-enforced.
        """
        response_lower = user_response.lower().strip()

        # Only accept explicit "yes" - not "sure", "ok", etc.
        if response_lower in ["yes", "y"]:
            # User confirmed - execute the critical action
            action = self.state.pending_critical_action
            context = self.state.pending_critical_context

            # Clear state and mark executing
            self.state.transition_to(TurnState.TURN_EXECUTING)
            self.state.pending_critical_action = None
            self.state.pending_critical_context = None

            return OrchestratorResult(
                response_text=f"Confirmed. Executing {action.target}...",
                turn_state=TurnState.TURN_EXECUTING,
                action_executed=True,
                action_type="cap",
                action_target=action.target
            )
        else:
            # User did not confirm - cancel the action
            action_name = self.state.pending_critical_action.target if self.state.pending_critical_action else "action"

            # Clear state
            self.state.reset_turn()

            return OrchestratorResult(
                response_text=f"Cancelled {action_name}. No changes made.",
                turn_state=TurnState.TURN_COMPLETED,
                action_executed=False,
                action_type="cancelled"
            )

    # --------------------------------------------------------
    # Resolution Escalation (Full Page Fallback)
    # --------------------------------------------------------
    # Conceptually: Deep Scan is an ESCALATION mode, not just a fallback.
    # It represents moving to a higher level of analysis when quick
    # resolution fails. This framing allows future extension to:
    # - Vision/OCR analysis
    # - Iframe traversal
    # - Shadow DOM inspection
    # - Dynamic content waiting

    async def _handle_escalation_consent(
        self,
        user_response: str
    ) -> OrchestratorResult:
        """Handle user response to resolution escalation prompt."""
        response_lower = user_response.lower().strip()

        if response_lower in ["yes", "y", "sure", "ok", "okay", "do it"]:
            # User consented - run escalated resolution
            self.state.transition_to(TurnState.TURN_EXECUTING)
            return await self._run_escalated_resolution()
        else:
            # User declined
            self.state.reset_turn()
            return OrchestratorResult(
                response_text="Okay, let me know if you'd like to try something else.",
                turn_state=TurnState.TURN_COMPLETED,
                action_executed=False
            )

    async def _run_escalated_resolution(self) -> OrchestratorResult:
        """
        Run escalated resolution with full page analysis.

        Only called after explicit user consent.

        Phase 1: Full text scan (Deep Scan)
        Future: Vision, OCR, iframe traversal, shadow DOM
        """
        # TODO: Implement in Stage 4
        # This requires access to full page text from content script
        self.state.pending_intent = None
        return OrchestratorResult(
            response_text="Escalated resolution is not yet implemented.",
            action_executed=False
        )

    # --------------------------------------------------------
    # History Management
    # --------------------------------------------------------

    # NOTE: Chat history is managed via JSON files (data/chats/*.json)
    # The orchestrator reads from JSON but does NOT write - ws_server handles persistence
    # This keeps the orchestrator stateless except for conversation flow state

    def clear_state(self):
        """Clear orchestrator flow state (not chat history - that's in JSON)."""
        self.state.last_decision_context = None
        self.state.reset_turn()
```

### OmEAgent Extension (`agent.py` modification)

Add this method to existing `OmEAgent` class:

```python
import asyncio
from typing import Optional

async def call_role(
    self,
    messages: List[Dict],
    temperature: float = 0.7,
    max_tokens: int = 500,
    max_retries: int = MAX_LLM_RETRIES
) -> str:
    """
    Call LLM with specific messages (for role-based prompts).

    Unlike chat(), this doesn't manage history - caller is responsible.
    Includes retry logic with exponential backoff for transient failures.
    """
    last_error: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            return await self.client.complete(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
        except Exception as e:
            last_error = e
            error_type = type(e).__name__

            # Don't retry on validation errors (bad input, not transient)
            if "validation" in str(e).lower() or "invalid" in str(e).lower():
                raise

            # Exponential backoff: 500ms, 1000ms, 2000ms
            if attempt < max_retries - 1:
                delay_ms = RETRY_BACKOFF_BASE_MS * (2 ** attempt)
                logger.warning(f"LLM call failed ({error_type}), retry {attempt + 1}/{max_retries} in {delay_ms}ms")
                await asyncio.sleep(delay_ms / 1000)

    # All retries exhausted
    logger.error(f"LLM call failed after {max_retries} retries: {last_error}")
    raise last_error
```

### Testing Stage 2

```python
# Test orchestrator in isolation
import asyncio
from om_e_web_ws.llm.orchestrator import PersonaOrchestrator
from om_e_web_ws.llm.agent import OmEAgent

async def test():
    agent = OmEAgent()
    orch = PersonaOrchestrator(agent)

    # Test chat-only
    result = await orch.process_message(
        "Hello, how are you?",
        active_tab={"url": "https://google.com", "title": "Google"}
    )
    print(f"Chat result: {result}")

    # Test action intent
    result = await orch.process_message(
        "scroll down",
        active_tab={"url": "https://google.com", "title": "Google"}
    )
    print(f"Action result: {result}")

asyncio.run(test())
```

---

## Stage 3: Integration with ws_server.py

**Goal:** Wire the PersonaOrchestrator into the existing LLMChat handler.

### Files Modified

| File | Changes |
|------|---------|
| `om_e_web_ws/ws_server.py` | Replace direct LLM_AGENT.chat() with PersonaOrchestrator |

### Changes to ws_server.py

The key change is in the LLMChat capability handler (~line 1450-1650). Replace:

```python
# OLD (single agent)
response_text = await LLM_AGENT.chat(
    message=message,
    active_tab=CURRENT_ACTIVE_TAB,
    tabs=CURRENT_TABS_INFO,
    rag_context=rag_context
)
```

With:

```python
# NEW (orchestrated)
from llm.orchestrator import PersonaOrchestrator

# Global orchestrator instance (alongside existing LLM_AGENT)
PERSONA_ORCHESTRATOR: Optional[PersonaOrchestrator] = None

def ensure_orchestrator():
    global PERSONA_ORCHESTRATOR, LLM_AGENT
    if PERSONA_ORCHESTRATOR is None:
        if LLM_AGENT is None:
            LLM_AGENT = OmEAgent()
        PERSONA_ORCHESTRATOR = PersonaOrchestrator(LLM_AGENT)
    return PERSONA_ORCHESTRATOR

# In LLMChat handler:
orchestrator = ensure_orchestrator()
result = await orchestrator.process_message(
    user_message=message,
    active_tab=CURRENT_ACTIVE_TAB,
    tabs=CURRENT_TABS_INFO,
    element_registry=ELEMENT_REGISTRY
)

# Handle result - USE EXISTING ROUTING, NOT NEW FUNCTIONS
# See "Guiding Principle: Wrap, Don't Replace" above
if result.action_executed:
    if result.action_type == "cap":
        # Route through EXISTING capability handling in handler()
        # This is the same code path as current execute_capability messages
        # Internal caps → execute_internal_capability()
        # Extension caps → forward execute_capability to extension
        await route_capability(result.action_target, params)
    elif result.action_type == "act":
        # Route through EXISTING element action handling in handler()
        # 1. resolve_hints_for_act(action_id) → get selectors from ELEMENT_REGISTRY
        # 2. Send execute_action_with_hints message to extension
        # 3. Extension re-queries DOM via selectors, executes action
        hints = resolve_hints_for_act(result.action_target)
        await send_execute_action_with_hints(result.action_target, hints, params)

# Send response to HUD
await send_hud_action("append_message", {
    "role": "assistant",
    "content": result.response_text
})
```

**IMPORTANT:** The `route_capability()` and `send_execute_action_with_hints()` calls above are pseudocode representing EXISTING code paths in `handler()`. Do NOT create new functions - refactor existing handler code into reusable helpers if needed.

### Preserving Existing Execution Pipelines

The orchestrator's `action_type` and `action_target` map directly to existing code:

| Result Type | Existing Code Path | What Happens |
|-------------|-------------------|--------------|
| `cap` + `target` | Line ~1580: capability routing | Internal → `execute_internal_capability()`, Extension → forward `execute_capability` msg |
| `act` + `target` | Line ~1520: element action | `resolve_hints_for_act()` → `ELEMENT_REGISTRY` → `execute_action_with_hints` msg |
| `ask_user` | No execution | Just display response |
| `cannot` | No execution | Just display response |
| `noop` | No execution | Display reason ("already on that page") |

### Testing Stage 3

```bash
# Start server with new code
python om_e_web_ws/ws_server.py

# Test via HUD (manual)
# 1. Open browser with extension
# 2. Click orb → type "scroll down"
# 3. Should see: Chat Persona → Decision Engine → ScrollDown execution

# Test via CLI
python3 om_e_web_ws/test_navigation.py \
  --command capability \
  --capability LLMChat \
  --params '{"message": "scroll down"}'
```

---

## Stage 4: Deep Scan Fallback (Optional Role C)

**Goal:** Implement the deep scan fallback for low-confidence scenarios.

### Files Modified

| File | Changes |
|------|---------|
| `om_e_web_ws/llm/orchestrator.py` | Implement `_run_deep_scan()` |
| `om_e_web_ws/ws_server.py` | Add `GetCleanPageText` capability |
| `web_extension/content.js` | Add `getCleanPageText` command handler |

### Deep Scan Implementation

In `orchestrator.py`, implement `_run_deep_scan()`:

```python
async def _run_deep_scan(self) -> OrchestratorResult:
    """
    Run deep scan with full page text.

    Only called after explicit user consent.
    """
    if not self.state.pending_intent:
        return OrchestratorResult(
            response_text="No pending intent for deep scan.",
            action_executed=False
        )

    intent = self.state.pending_intent

    # Request full page text from extension
    # This requires a new message type to content script
    page_text = await self._request_page_text()

    if not page_text:
        return OrchestratorResult(
            response_text="Could not retrieve page content.",
            action_executed=False
        )

    # Call Deep Scan role
    decision = await self._call_deep_scan(intent, page_text)

    # Execute if valid
    if decision.decision in [DecisionType.CAP, DecisionType.ACT]:
        self.state.pending_intent = None
        return OrchestratorResult(
            response_text=f"Found it! {decision.reason}",
            action_executed=True,
            action_type=decision.decision.value,
            action_target=str(decision.target)
        )

    self.state.pending_intent = None
    return OrchestratorResult(
        response_text=f"Even with full scan, I couldn't find it: {decision.reason}",
        action_executed=False
    )

async def _call_deep_scan(
    self,
    intent: str,
    page_text: str
) -> DeepScanOutput:
    """Call Deep Scan role with full page text."""
    system_prompt = self._prompt_cache.get("deep_scan", "")

    # Truncate page text to reasonable size
    max_chars = 15000  # ~4k tokens
    if len(page_text) > max_chars:
        page_text = page_text[:max_chars] + "\n... [truncated]"

    user_content = f"""
User intent: {intent}

## Full Page Content
{page_text}

Find the element or capability that matches this intent. Return JSON only.
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]

    response_text = await self.agent.call_role(
        messages=messages,
        temperature=0.2,
        max_tokens=400
    )

    try:
        json_data = extract_json_from_response(response_text)
        if json_data:
            return validate_deep_scan_output(json_data)
    except Exception as e:
        logger.warning(f"Deep Scan parse error: {e}")

    return DeepScanOutput(
        decision=DecisionType.CANNOT,
        reason="Failed to parse deep scan result"
    )
```

### New Command: GetCleanPageText

In `content.js`, add handler (~line 2820):

```javascript
case 'getCleanPageText':
    (async () => {
        try {
            // Get semantic text (existing function)
            const result = intelligenceEngine.extractSemanticTextWithIds();
            sendResponse({
                ok: true,
                result: {
                    text: result.text,  // Text with action hints
                    url: window.location.href,
                    title: document.title
                }
            });
        } catch (error) {
            sendResponse({ok: false, error: error.message});
        }
    })();
    return true;
```

### Testing Stage 4

```bash
# Test deep scan consent flow
# 1. Start server
# 2. Open page with obscure element
# 3. Type intent that won't match RAG results
# 4. Should get: "Would you like me to do a full page scan?"
# 5. Type "yes"
# 6. Should see deep scan execute
```

---

## Stage 5: Prompt Size Controls and Tuning

**Goal:** Enforce hard limits on all prompt sizes and tune thresholds.

### Configuration File

Create `om_e_web_ws/llm/config/prompt_limits.json`:

```json
{
  "chat_persona": {
    "max_history_messages": 8,
    "max_tab_titles": 5,
    "max_env_hint_chars": 200,
    "max_response_tokens": 500
  },
  "decision_engine": {
    "max_capability_options": 10,
    "max_element_options": 10,
    "max_option_description_chars": 100,
    "max_response_tokens": 300
  },
  "deep_scan": {
    "max_page_text_chars": 15000,
    "max_response_tokens": 400
  },
  "confidence": {
    "high_threshold": 0.85,
    "medium_threshold": 0.60,
    "low_threshold": 0.40
  }
}
```

### Token Counting Helper

Add to `orchestrator.py`:

```python
def _estimate_tokens(self, text: str) -> int:
    """Rough token estimate (4 chars per token)."""
    return len(text) // 4

def _enforce_prompt_limits(self, messages: List[Dict], max_tokens: int) -> List[Dict]:
    """Truncate messages if total tokens exceed limit."""
    total = sum(self._estimate_tokens(m["content"]) for m in messages)

    if total <= max_tokens:
        return messages

    # Truncate oldest non-system messages
    result = []
    for msg in messages:
        if msg["role"] == "system":
            result.append(msg)
        else:
            remaining = max_tokens - sum(self._estimate_tokens(m["content"]) for m in result)
            if self._estimate_tokens(msg["content"]) <= remaining:
                result.append(msg)

    return result
```

---

## Stage 6: Acceptance Tests

### Test Suite

Create `om_e_web_ws/tests/test_two_role_architecture.py`:

```python
"""
Acceptance tests for two-role LLM architecture.

Run: pytest om_e_web_ws/tests/test_two_role_architecture.py -v
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch

from llm.orchestrator import PersonaOrchestrator, OrchestratorResult
from llm.contracts import (
    validate_chat_persona_output,
    validate_decision_engine_output,
    DecisionType
)

# ============================================================
# Test 1: Chat-only query returns reply without handoff
# ============================================================

@pytest.mark.asyncio
async def test_chat_only_no_handoff():
    """User asks a question - should get chat reply, no action."""
    # Mock LLM to return chat-only response
    mock_agent = Mock()
    mock_agent.call_role = AsyncMock(return_value='{"handoff": false, "reply": "Hello! I can help you browse."}')

    orch = PersonaOrchestrator(mock_agent)
    result = await orch.process_message(
        "Hello, what can you do?",
        active_tab={"url": "https://google.com", "title": "Google"}
    )

    assert result.action_executed == False
    assert "Hello" in result.response_text
    assert result.action_type is None

# ============================================================
# Test 2: High-confidence action triggers direct execution
# ============================================================

@pytest.mark.asyncio
async def test_high_confidence_direct_execution():
    """'open youtube' should execute directly (high confidence)."""
    mock_agent = Mock()

    # First call: Chat Persona returns handoff
    # Second call: Decision Engine returns cap with high score
    mock_agent.call_role = AsyncMock(side_effect=[
        '{"handoff": true, "intent": "navigate to youtube", "original_text": "open youtube"}',
        '{"decision": "cap", "target": "OpenTab", "reason": "Navigate to youtube"}'
    ])

    orch = PersonaOrchestrator(mock_agent)

    # Mock RAG to return high-score capability
    with patch.object(orch, '_build_decision_context') as mock_context:
        from llm.contracts import DecisionContext, CapabilityOption
        mock_context.return_value = DecisionContext(
            intent="navigate to youtube",
            original_text="open youtube",
            active_tab={"url": "", "title": ""},
            capabilities=[CapabilityOption(name="OpenTab", description="Open new tab", score=0.95)]
        )

        result = await orch.process_message("open youtube")

    assert result.action_executed == True
    assert result.action_type == "cap"
    assert result.action_target == "OpenTab"

# ============================================================
# Test 3: Ambiguous click triggers ask_user clarification
# ============================================================

@pytest.mark.asyncio
async def test_ambiguous_triggers_clarification():
    """Ambiguous request should ask for clarification."""
    mock_agent = Mock()
    mock_agent.call_role = AsyncMock(side_effect=[
        '{"handoff": true, "intent": "click button", "original_text": "click the button"}',
        '{"decision": "ask_user", "question": "Which button? I see Submit, Cancel, and Save.", "reason": "Multiple buttons found"}'
    ])

    orch = PersonaOrchestrator(mock_agent)

    with patch.object(orch, '_build_decision_context') as mock_context:
        from llm.contracts import DecisionContext, ElementOption
        mock_context.return_value = DecisionContext(
            intent="click button",
            original_text="click the button",
            active_tab={"url": "", "title": ""},
            elements=[
                ElementOption(id=1, label="Submit", type="Button", tag="button", score=0.6),
                ElementOption(id=2, label="Cancel", type="Button", tag="button", score=0.55),
                ElementOption(id=3, label="Save", type="Button", tag="button", score=0.52),
            ]
        )

        result = await orch.process_message("click the button")

    assert result.action_executed == False
    assert result.action_type == "ask_user"
    assert "Which button" in result.response_text

# ============================================================
# Test 4: Resolution escalation offered only when confidence is low
# ============================================================

@pytest.mark.asyncio
async def test_escalation_offered_on_low_confidence():
    """Low confidence + cannot should offer resolution escalation opt-in."""
    mock_agent = Mock()
    mock_agent.call_role = AsyncMock(side_effect=[
        '{"handoff": true, "intent": "click obscure element", "original_text": "click the hidden thing"}',
        '{"decision": "cannot", "reason": "No matching elements found"}'
    ])

    orch = PersonaOrchestrator(mock_agent)

    with patch.object(orch, '_build_decision_context') as mock_context:
        from llm.contracts import DecisionContext
        mock_context.return_value = DecisionContext(
            intent="click obscure element",
            original_text="click the hidden thing",
            active_tab={"url": "", "title": ""},
            capabilities=[],  # No matches
            elements=[]  # No matches
        )

        result = await orch.process_message("click the hidden thing")

    assert result.action_executed == False
    assert result.requires_deep_scan_consent == True
    assert "deeper analysis" in result.response_text.lower()

# ============================================================
# Test 5: All outputs validate as JSON before execution
# ============================================================

@pytest.mark.asyncio
async def test_json_validation_before_execution():
    """Malformed JSON should not cause execution."""
    mock_agent = Mock()
    mock_agent.call_role = AsyncMock(return_value="This is not valid JSON at all")

    orch = PersonaOrchestrator(mock_agent)
    result = await orch.process_message("scroll down")

    # Should fall back to chat-only mode
    assert result.action_executed == False
    # Response should be the raw text (treated as chat reply)
    assert "not valid JSON" in result.response_text

# ============================================================
# Test 6: Decision Engine cannot invent actions not in options
# ============================================================

def test_decision_engine_validation_requires_target():
    """Decision with cap/act must have target from options."""
    from llm.contracts import validate_decision_engine_output

    # Missing target should raise
    with pytest.raises(ValueError):
        validate_decision_engine_output({
            "decision": "cap",
            "target": None,  # Invalid
            "reason": "test"
        })

    # Valid target should pass
    result = validate_decision_engine_output({
        "decision": "cap",
        "target": "ScrollDown",
        "reason": "test"
    })
    assert result.target == "ScrollDown"

# ============================================================
# Test 7: Rolling history from JSON works
# ============================================================

@pytest.mark.asyncio
async def test_rolling_history_within_budget():
    """Chat history should fit within token budget."""
    import tempfile
    import json

    mock_agent = Mock()
    orch = PersonaOrchestrator(mock_agent)

    # Create test chat file with many messages
    chat_data = {
        "chat_id": "test-123",
        "messages": [{"role": "user", "content": f"This is message number {i} with some content"} for i in range(200)]
    }

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(chat_data, f)
        # Mock the path
        with patch.object(Path, '__new__', return_value=Path(f.name)):
            history = await orch._get_rolling_history("test-123", max_tokens=600)

    # Should fit within token budget
    total_tokens = sum(estimate_tokens(m["content"]) for m in history)
    assert total_tokens <= 600
```

### Running Tests

```bash
# Install pytest if needed
pip install pytest pytest-asyncio

# Run tests
cd om_e_web_ws
pytest tests/test_two_role_architecture.py -v

# Expected output:
# test_chat_only_no_handoff PASSED
# test_high_confidence_direct_execution PASSED
# test_ambiguous_triggers_clarification PASSED
# test_deep_scan_offered_on_low_confidence PASSED
# test_json_validation_before_execution PASSED
# test_decision_engine_validation_requires_target PASSED
# test_history_trimming PASSED
```

---

## Summary: What Changes vs What Stays

### Files Created (New)

**Phase 0 (Foundation):**
| File | Purpose |
|------|---------|
| `llm/ingestion.py` | Preprocess, dedup, large payload handling |
| `llm/memory.py` | Rolling history, RAG retrieve, hygiene cron |
| `llm/metrics.py` | TurnMetrics dataclass, logging |
| `data/large_payloads/` | Raw large content by hash |
| `data/metrics/turns.jsonl` | Per-turn metrics |
| `tests/test_phase0_foundation.py` | Phase 0 acceptance tests |

**Phase 1+ (LLM Pipeline):**
| File | Purpose |
|------|---------|
| `data/prompts/chat_prompt.md` | Chat Persona system prompt |
| `data/prompts/executor_prompt.md` | Decision Engine system prompt (normal + fallback) |
| `llm/contracts.py` | Pydantic models + TokenBudget |
| `llm/orchestrator.py` | PersonaOrchestrator class |
| `tests/test_two_role_architecture.py` | LLM pipeline tests |

**Note:** Full page fallback uses the same `executor_prompt.md` but with larger context (full element list instead of top-10 RAG results).

### Files Modified (Small Changes)

| File | Changes |
|------|---------|
| `llm/agent.py` | Add `call_role()` method (~20 lines) |
| `ws_server.py` | Replace LLMChat handler to use orchestrator (~50 lines) |
| `content.js` | Add `getCleanPageText` command handler (~15 lines) |

### Files Unchanged

| File | Reason |
|------|--------|
| `llm/client.py` | HTTP client works as-is |
| `llm/executor.py` | JSON parsing reused |
| `llm/dispatcher.py` | Action routing reused |
| `retrieval/*.py` | All stores reused |
| `sw.js` | Message routing unchanged |
| `hud.js` | UI unchanged |
| `content.js` (most) | Scan/execution pipelines unchanged |

---

## Rollout Plan

### Architecture Flow (All Phases)

```
User Message (WS)
     │
     ▼
┌─────────────────────┐
│   Ingestion Layer   │  ← Dedup, large payload detect, preprocess
│   (Phase 0 plumbing)│     Writes: JSON (truth) + FAISS (summaries)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Prompt Packer     │  ← Enforces hard token budgets
│   (TokenBudget)     │     Assembles: history + memories + env
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Chat Persona     │  ← LLM call 1 (≤1300 tokens HARD CAP)
│   (chat_prompt.md)  │     Uses: rolling summary, env hint, RAG memories
└──────────┬──────────┘
           │
      ┌────┴────┐
      │         │
   Handoff    Chat Only
      │         │
      ▼         ▼
┌──────────┐   Reply
│   RAG    │   (done)
│ (5-15ms) │
└────┬─────┘
     │
     ▼
┌─────────────────────┐
│  Decision Engine    │  ← LLM call 2 (≤1000 tokens HARD CAP)
│ (executor_prompt.md)│     Uses: intent + options ONLY (no history)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Execution Verify   │  ← Post-action state check
│   + Metrics Log     │     Writes: metrics/turns.jsonl
└──────────┬──────────┘
           │
           ▼
        Dispatch
   (existing pipelines)
```

**Key invariants:**
1. Server owns budgets, dedup, risk, verification, hygiene
2. Role B sees ONLY: intent + original_text + active_tab + options (explicit NEVER list)
3. JSON files = source of truth; FAISS indexes summaries/facts only
4. All turns log metrics for threshold tuning

---

### Phase 0: Foundation Plumbing (IMPLEMENT FIRST)

**Goal:** Build the deterministic server plumbing that prevents degradation under real usage. Testable without LLM.

**Why first:** Two small LLM calls are reliable ONLY if the server handles all the hard parts deterministically. This phase makes everything testable without touching existing dispatch/execution.

---

#### 0.1 Memory Architecture (Per-Chat)

| Type | Storage | Embedded? | Use Case | Update Trigger | Max Size |
|------|---------|-----------|----------|----------------|----------|
| Raw messages | `data/chats/<chat_id>.json` | ❌ No | Audit, replay, source of truth | Every message | Unlimited |
| Rolling summary | Chat JSON `summaries.rolling` | ❌ No | Role A short context | Every 8 msgs OR 800t recent | 300t |
| Topic summary | Chat JSON `summaries.topics[]` | ✅ Yes (FAISS) | "What were we doing?" | Every 20 msgs + topic shift | 250t |
| Facts | Chat JSON `summaries.facts[]` + FAISS | ✅ Yes | "User prefers dark mode" | Explicit "remember" or preference signal | 10 facts, 50t each |

**What gets embedded:** Summaries + facts only.
**What NEVER gets embedded:** Raw chat text, action logs, system messages, high-risk content.

**Chat JSON structure:**
```json
{
  "chat_id": "abc123",
  "messages": [...],
  "summaries": {
    "rolling": "User asked about YouTube videos, navigated to channel page...",
    "topics": [
      {"id": "t1", "summary": "Browsing YouTube music videos", "updated_at": "..."}
    ],
    "facts": [
      {"content": "Prefers dark mode", "importance": 0.8, "created_at": "..."}
    ]
  }
}
```

---

#### 0.2 Large Message Pipeline

**Detection threshold:** >2000 characters OR >50 newlines OR code block detection

```python
# llm/ingestion.py
LARGE_MSG_CHARS = 2000
DEDUP_WINDOW_MS = 2000
recent_hashes: Dict[str, Dict[str, float]] = {}  # chat_id → {hash: timestamp}

async def preprocess_message(chat_id: str, content: str) -> Dict:
    """
    Preprocess incoming message: dedup, detect large payloads, chunk/summarize.
    Returns dict with processing results.
    """
    h = hashlib.sha256(content.encode()).hexdigest()[:16]
    now = time.time()

    # 1. Deduplication
    chat_hashes = recent_hashes.setdefault(chat_id, {})
    if h in chat_hashes and (now - chat_hashes[h]) < DEDUP_WINDOW_MS / 1000:
        return {"is_dup": True, "action": "ignore"}
    chat_hashes[h] = now

    # 2. Large payload detection
    is_large = len(content) > LARGE_MSG_CHARS or content.count('\n') > 50
    if not is_large:
        return {"is_large": False, "content": content}

    # 3. Store raw payload
    payload_dir = Path("data/large_payloads")
    payload_dir.mkdir(exist_ok=True)
    raw_path = payload_dir / f"{chat_id}_{h}.txt"
    raw_path.write_text(content)

    # 4. Chunk into semantic units
    chunks = semantic_chunk(content, max_chunk_tokens=256, overlap=50)

    # 5. Summarize (lightweight LLM call, 150t budget)
    summary = await llm_summarize_large(chunks, max_output_tokens=150)
    # Returns: {"sentence": "...", "facts": ["...", "..."]}

    # 6. Embed chunks + summary (skip noise)
    embedded_count = 0
    for chunk in chunks:
        if not is_noise(chunk):  # skip: stacktraces, repeated patterns
            await faiss_add(embed(chunk), {"type": "large_chunk", "hash": h})
            embedded_count += 1

    return {
        "is_large": True,
        "summary": summary["sentence"],
        "facts": summary.get("facts", []),
        "chunks_embedded": embedded_count,
        "raw_path": str(raw_path),
        "prompt_ref": f"[Large content: {summary['sentence'][:100]}; ref={h}]"
    }

def is_noise(text: str) -> bool:
    """Detect low-value content that shouldn't be embedded."""
    noise_patterns = [
        r"^\s*at\s+[\w\.]+\(",  # Stack traces
        r"^[\s\d\-:\.]+$",      # Timestamps only
        r"(.{20,})\1{3,}",      # Repeated content
    ]
    return any(re.search(p, text) for p in noise_patterns)

def semantic_chunk(content: str, max_chunk_tokens: int = 256, overlap: int = 50) -> List[str]:
    """
    Split content into semantic chunks for embedding.
    Respects paragraph and sentence boundaries where possible.
    """
    chunks = []
    paragraphs = content.split('\n\n')

    current_chunk = ""
    current_tokens = 0

    for para in paragraphs:
        para_tokens = len(para) // 4

        if current_tokens + para_tokens <= max_chunk_tokens:
            current_chunk += para + "\n\n"
            current_tokens += para_tokens
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para + "\n\n"
            current_tokens = para_tokens

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks

async def llm_summarize_large(
    chunks: List[str],
    max_output_tokens: int = 150,
    category: Optional[str] = None
) -> Dict[str, Any]:
    """
    Summarize large content using lightweight LLM.
    Uses gpt-4.1-mini for cost efficiency.

    Returns: {"sentence": "...", "facts": ["...", "..."]}
    """
    from llm.client import LLMClient
    client = LLMClient()

    # Detect category if not provided
    if not category:
        sample = chunks[0] if chunks else ""
        category = _detect_content_category(sample)

    # Build sample from first chunks
    sample_text = "\n\n".join(chunks[:3])[:2000]

    prompt = f"""Summarize this {category} content in exactly:
1. ONE sentence (max 50 words)
2. 3-5 key facts (bullet points)

Content sample:
{sample_text}

{"[Content continues in " + str(len(chunks) - 3) + " more chunks...]" if len(chunks) > 3 else ""}

Format response as JSON: {{"sentence": "...", "facts": ["...", "..."]}}"""

    try:
        response = await client.complete(
            messages=[{"role": "user", "content": prompt}],
            model="gpt-4.1-mini",
            temperature=0.3,
            max_tokens=max_output_tokens
        )

        result = json.loads(response)
        return {
            "sentence": result.get("sentence", f"Large {category} content"),
            "facts": result.get("facts", [])[:5]
        }
    except Exception as e:
        logger.warning(f"Failed to summarize large content: {e}")
        return {
            "sentence": f"Large {category} content ({sum(len(c) for c in chunks)} chars)",
            "facts": []
        }

def _detect_content_category(content: str) -> str:
    """Classify content type for better summarization."""
    content_lower = content.lower()

    if any(p in content for p in ['def ', 'function ', 'class ', 'import ', '```']):
        return 'code'
    if any(p in content_lower for p in ['error', 'warning', 'traceback', 'exception']):
        return 'log'
    if any(p in content_lower for p in ['whereas', 'hereinafter', 'clause', 'agreement']):
        return 'contract'
    if content.startswith('$') or content.startswith('>'):
        return 'command'

    return 'paste'

async def retrieve_from_large_payload(
    payload_hash: str,
    query: str,
    top_k: int = 3
) -> List[str]:
    """
    Retrieve relevant chunks from a stored large payload.

    Used when user says "find clause X in that contract"
    → RAG query on embedded chunks → Return top-k (not entire raw)
    """
    from llm.memory import faiss_query

    results = await faiss_query(
        query=query,
        filter={"type": "large_chunk", "hash": payload_hash},
        top_k=top_k
    )

    return [r.get("text", "") for r in results]
```

**Prompt inclusion:** Only `prompt_ref` (50t) goes in prompt. Raw content NEVER unless user explicitly asks "show full [hash]".

---

#### 0.3 Token Budget Enforcement

```python
# llm/contracts.py - ADD TO EXISTING

class TokenBudget:
    """
    Hard token limits per role. NEVER exceed.

    NOTE: Totals include 10% buffer for safety margin.
    Realistic Role B is ~550-700t, not 150t as initially estimated.
    """

    # Role A: Chat Persona
    CHAT_SYSTEM = 450       # System prompt with examples
    CHAT_HISTORY = 600      # Rolling summary + last N messages
    CHAT_MESSAGE = 200      # Current user message
    CHAT_ENV = 100          # Tab info, minimal context
    CHAT_TOTAL = 1450       # HARD CAP (includes 10% buffer)

    # Role B: Decision Engine
    DECISION_SYSTEM = 450   # System prompt with examples
    DECISION_CONTEXT = 550  # Intent + active_tab + options ONLY
    DECISION_TOTAL = 1100   # HARD CAP (includes 10% buffer)

    # Full Page Fallback (consent-gated)
    FULL_PAGE_TOTAL = 8000  # Some pages are dense

def estimate_tokens(text: str) -> int:
    """Rough token estimate (4 chars per token)."""
    return len(text) // 4

def truncate_to_budget(content: str, budget: int) -> str:
    """Truncate content to fit token budget."""
    current = estimate_tokens(content)
    if current <= budget:
        return content
    # Truncate to ~budget tokens (budget * 4 chars)
    return content[:budget * 4] + "..."
```

```python
# llm/orchestrator.py - ADD TO PersonaOrchestrator

def _pack_chat_prompt(
    self,
    user_msg: str,
    chat_id: str,
    env_hint: str,
    preprocessed: Dict
) -> List[Dict]:
    """
    Pack Chat Persona prompt within hard budget.
    Truncates oldest content first.
    """
    budget = TokenBudget.CHAT_TOTAL
    system_prompt = self._prompt_cache["chat_persona"]

    messages = [{"role": "system", "content": system_prompt}]

    # Calculate remaining budget after system + message
    system_tokens = estimate_tokens(system_prompt)
    msg_tokens = estimate_tokens(user_msg)
    env_tokens = estimate_tokens(env_hint)
    remaining = budget - system_tokens - msg_tokens - env_tokens - 50  # buffer

    # Get rolling history (already summarized if needed)
    history = await self._get_rolling_history(chat_id, max_tokens=remaining)

    # Add history
    for msg in history:
        messages.append(msg)

    # Handle large payload reference
    if preprocessed.get("is_large"):
        user_content = f"{preprocessed['prompt_ref']}\n\nUser: {user_msg}\n\n[Env: {env_hint}]"
    else:
        user_content = f"{user_msg}\n\n[Env: {env_hint}]"

    messages.append({"role": "user", "content": user_content})

    # ENFORCE budget (graceful degradation, NOT assert)
    total = sum(estimate_tokens(m["content"]) for m in messages)
    if total > budget:
        logger.warning(f"Chat Persona budget exceeded: {total} > {budget}, truncating history")
        # Truncate history (keep system + user message, trim middle)
        messages = self._truncate_to_fit(messages, budget)

    return messages

def _pack_decision_prompt(
    self,
    context: DecisionContext
) -> List[Dict]:
    """
    Pack Decision Engine prompt. MINIMAL context only.
    """
    system_prompt = self._prompt_cache["decision_engine"]

    options_text = self._format_options_for_prompt(context)

    user_content = f"""Intent: {context.intent}
Original: "{context.original_text}"
Tab: {context.active_tab.get('title', 'Unknown')[:50]}

## Options
{options_text}

Choose ONE. Return JSON only."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]

    # ENFORCE budget (graceful degradation, NOT assert)
    total = sum(estimate_tokens(m["content"]) for m in messages)
    if total > TokenBudget.DECISION_TOTAL:
        logger.warning(f"Decision Engine budget exceeded: {total} > {TokenBudget.DECISION_TOTAL}, truncating options")
        # Reduce options until we fit (already shaped, so just take fewer)
        while total > TokenBudget.DECISION_TOTAL and len(context.capabilities) > 3:
            context.capabilities.pop()  # Remove lowest-scored option
            user_content = self._rebuild_decision_user_content(context)
            messages[1]["content"] = user_content
            total = sum(estimate_tokens(m["content"]) for m in messages)

    return messages
```

---

#### 0.4 Concurrency + Per-Chat Locking

```python
# ws_server.py - ADD near top

import asyncio
from typing import Dict

# Per-chat locks prevent race conditions
chat_locks: Dict[str, asyncio.Lock] = {}

def get_chat_lock(chat_id: str) -> asyncio.Lock:
    """Get or create lock for chat."""
    if chat_id not in chat_locks:
        chat_locks[chat_id] = asyncio.Lock()
    return chat_locks[chat_id]

# In LLMChat handler:
async def handle_llm_chat(chat_id: str, message: str, ...):
    lock = get_chat_lock(chat_id)
    async with lock:
        # Preprocess (dedup, large payload)
        preprocessed = await preprocess_message(chat_id, message)

        if preprocessed.get("is_dup"):
            await send_hud_action("append_message", {
                "role": "system",
                "content": "(Duplicate message ignored)"
            })
            return

        # Single-threaded per chat from here
        # ... rest of orchestration
```

---

#### 0.5 Metrics Logging (From Turn 1)

```python
# llm/metrics.py (NEW FILE)
import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path

@dataclass
class TurnMetrics:
    """Metrics for a single turn. Logged to JSONL."""
    timestamp: str
    chat_id: str
    turn_state: str  # Final TurnState value

    # Server-side latencies (ms) - what we spent processing
    preprocess_ms: float
    chat_persona_ms: float
    rag_ms: float
    decision_engine_ms: float
    total_ms: float

    # Perceived latencies (ms) - what the USER actually felt
    first_token_ms: Optional[float] = None       # Time to first streamed token (Role A)
    first_ui_update_ms: Optional[float] = None   # Time to first HUD update ("thinking...")
    execution_dispatch_ms: Optional[float] = None  # Time to action dispatch to content.js

    # Decisions
    handoff: bool
    decision_type: str  # cap, act, ask_user, cannot, noop, chat_only

    # Confidence
    top_score: float
    options_count: int

    # Payloads
    is_large_msg: bool
    prompt_tokens_role_a: int
    prompt_tokens_role_b: int

    # Outcomes
    execution_success: Optional[bool] = None
    execution_verified: Optional[bool] = None  # Did verification pass?
    retry_count: int = 0
    noop_reason: Optional[str] = None  # If decision was noop

METRICS_PATH = Path("data/metrics/turns.jsonl")

async def log_turn_metrics(metrics: TurnMetrics):
    """Append metrics to JSONL file."""
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_PATH, "a") as f:
        f.write(json.dumps(asdict(metrics)) + "\n")

# Usage in orchestrator:
async def process_message(self, ...):
    start = time.time()
    metrics = TurnMetrics(
        timestamp=datetime.utcnow().isoformat(),
        chat_id=chat_id,
        ...
    )

    # Track each phase
    t0 = time.time()
    preprocessed = await preprocess_message(...)
    metrics.preprocess_ms = (time.time() - t0) * 1000

    t0 = time.time()
    persona_output = await self._call_chat_persona(...)
    metrics.chat_persona_ms = (time.time() - t0) * 1000

    # ... rest of processing

    metrics.total_ms = (time.time() - start) * 1000
    await log_turn_metrics(metrics)
```

**Tuning workflow:**
1. Run for 2 weeks
2. Analyze `turns.jsonl`: `cat turns.jsonl | jq -s 'group_by(.decision_type) | map({type: .[0].decision_type, avg_score: (map(.top_score) | add / length)})'`
3. Set thresholds based on actual score distribution

**Metrics Dashboard CLI: `llm/metrics_cli.py`**

```python
#!/usr/bin/env python3
"""
Simple CLI for analyzing turn metrics.
Usage: python -m om_e_web_ws.llm.metrics_cli --last 100 --by decision_type
"""
import argparse
import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timedelta

METRICS_PATH = Path("data/metrics/turns.jsonl")

def load_metrics(last_n: int = None, since_hours: int = None) -> list:
    """Load metrics from JSONL file."""
    if not METRICS_PATH.exists():
        print("No metrics file found. Run some chats first.")
        return []

    metrics = []
    with open(METRICS_PATH) as f:
        for line in f:
            try:
                metrics.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    # Filter by time if specified
    if since_hours:
        cutoff = datetime.utcnow() - timedelta(hours=since_hours)
        metrics = [m for m in metrics if datetime.fromisoformat(m['timestamp']) > cutoff]

    # Take last N if specified
    if last_n:
        metrics = metrics[-last_n:]

    return metrics

def summarize_by_field(metrics: list, field: str):
    """Group and summarize metrics by a field."""
    groups = defaultdict(list)
    for m in metrics:
        groups[m.get(field, 'unknown')].append(m)

    print(f"\n{'=' * 60}")
    print(f"Summary by {field} ({len(metrics)} total turns)")
    print('=' * 60)

    for key, items in sorted(groups.items()):
        avg_total = sum(m.get('total_ms', 0) for m in items) / len(items)
        avg_persona = sum(m.get('chat_persona_ms', 0) for m in items) / len(items)
        avg_decision = sum(m.get('decision_engine_ms', 0) for m in items) / len(items)
        avg_score = sum(m.get('top_score', 0) for m in items) / len(items)

        print(f"\n{key}: {len(items)} turns")
        print(f"  Avg total:     {avg_total:.0f}ms")
        print(f"  Avg persona:   {avg_persona:.0f}ms")
        print(f"  Avg decision:  {avg_decision:.0f}ms")
        print(f"  Avg top_score: {avg_score:.2f}")

def show_slow_turns(metrics: list, threshold_ms: int = 2000):
    """Show turns that exceeded latency threshold."""
    slow = [m for m in metrics if m.get('total_ms', 0) > threshold_ms]
    print(f"\n{'=' * 60}")
    print(f"Slow turns (>{threshold_ms}ms): {len(slow)} of {len(metrics)}")
    print('=' * 60)

    for m in slow[:10]:  # Show max 10
        print(f"\n  {m['timestamp']}")
        print(f"    Total: {m.get('total_ms', 0):.0f}ms")
        print(f"    Type: {m.get('decision_type', 'unknown')}")
        print(f"    Options: {m.get('options_count', 0)}")

def show_score_distribution(metrics: list):
    """Show distribution of top_score values."""
    scores = [m.get('top_score', 0) for m in metrics if m.get('top_score') is not None]
    if not scores:
        print("No scores to analyze")
        return

    print(f"\n{'=' * 60}")
    print(f"Score distribution ({len(scores)} turns with scores)")
    print('=' * 60)

    buckets = defaultdict(int)
    for s in scores:
        bucket = int(s * 10) / 10  # Round to 0.1
        buckets[bucket] += 1

    for b in sorted(buckets.keys()):
        count = buckets[b]
        bar = '█' * int(count * 50 / len(scores))
        print(f"  {b:.1f}-{b+0.1:.1f}: {bar} ({count})")

def main():
    parser = argparse.ArgumentParser(description="Analyze turn metrics")
    parser.add_argument('--last', type=int, help="Last N turns to analyze")
    parser.add_argument('--since', type=int, help="Hours to look back")
    parser.add_argument('--by', type=str, default="decision_type",
                       help="Field to group by (decision_type, action_type, etc.)")
    parser.add_argument('--slow', type=int, help="Show turns slower than N ms")
    parser.add_argument('--scores', action='store_true', help="Show score distribution")
    args = parser.parse_args()

    metrics = load_metrics(last_n=args.last, since_hours=args.since)
    if not metrics:
        return

    summarize_by_field(metrics, args.by)

    if args.slow:
        show_slow_turns(metrics, args.slow)

    if args.scores:
        show_score_distribution(metrics)

if __name__ == "__main__":
    main()
```

**Usage examples:**
```bash
# Summary by decision type (last 100 turns)
python -m om_e_web_ws.llm.metrics_cli --last 100

# Show slow turns (>2s)
python -m om_e_web_ws.llm.metrics_cli --last 500 --slow 2000

# Score distribution for threshold tuning
python -m om_e_web_ws.llm.metrics_cli --since 24 --scores

# Group by action type
python -m om_e_web_ws.llm.metrics_cli --last 100 --by action_type
```

---

#### Token Budget Reference (Final)

| Component | Budget | Rationale |
|-----------|--------|-----------|
| **Role A: Chat Persona** | | |
| System prompt | 450t | Room for examples, personality |
| Rolling history | 600t | Summary (~200t) + last 3-5 messages |
| Current message | 200t | User input |
| Environment hint | 100t | Tab title/URL |
| **Role A Total** | **1450t** | 10% buffer included |
| **Role B: Decision Engine** | | |
| System prompt | 450t | Examples, decision format |
| Decision context | 550t | Intent + active_tab + options |
| **Role B Total** | **1100t** | 10% buffer included |
| **Full Page Fallback** | **8000t** | Dense pages need room |
| **Large Payload Summary** | 150t max | Output from summarization |

**Metrics to Watch:**

| Metric | Good | Investigate |
|--------|------|-------------|
| **Server-side (processing)** | | |
| `chat_persona_ms` | <500ms | >1000ms |
| `decision_engine_ms` | <300ms | >600ms |
| `rag_ms` | <50ms | >200ms |
| `total_ms` | <1500ms | >3000ms |
| **Perceived (user feels)** | | |
| `first_token_ms` | <200ms | >500ms |
| `first_ui_update_ms` | <100ms | >300ms |
| `execution_dispatch_ms` | <1000ms | >2000ms |
| **Decision quality** | | |
| `handoff` rate | 40-60% | <20% or >80% |
| `top_score` distribution | Bimodal (high/low) | Flat middle |
| `ask_user` rate | <15% | >30% |
| `noop` rate | <10% | >25% (may indicate stale state) |
| `retry_count > 0` | <5% | >15% |
| `execution_verified` | >95% | <80% |

---

#### 0.6 Role B NEVER List (Enforced)

**Role B (Decision Engine) receives ONLY:**
```
✅ intent (str) - normalized intent from Role A
✅ original_text (str) - user's exact words
✅ active_tab (dict) - {url, title} only
✅ capabilities (List[CapabilityOption]) - from RAG
✅ elements (List[ElementOption]) - from RAG
```

**Role B MUST NEVER receive:**
```
❌ Chat history or rolling summary
❌ User preferences or facts
❌ Global memory
❌ Previous actions or outcomes
❌ RAG-retrieved chat memories
❌ Large payload raw text
❌ Deep Scan page content
❌ Other users' data
❌ System internals
```

**Enforcement:** `DecisionContext` pydantic model has EXACT fields only. Attempting to add more raises validation error.

```python
# In contracts.py - DecisionContext is STRICT
class DecisionContext(BaseModel):
    """Context for Decision Engine. ONLY these fields allowed."""
    intent: str
    original_text: str
    active_tab: dict  # {url, title} only
    mode: DecisionMode
    capabilities: List[CapabilityOption] = Field(default_factory=list, max_items=10)
    elements: List[ElementOption] = Field(default_factory=list, max_items=10)

    class Config:
        extra = "forbid"  # Reject any extra fields
```

---

#### 0.7 Streaming UX Strategy

**Feature Flag:** Keep streaming behind a flag for v1 (`ENABLE_STREAMING = False`). HUD status updates alone ("thinking...", "executing...") already provide perceived speed. Enable streaming in v2 after core flow is stable.

```python
# llm_config.json or orchestrator settings
ENABLE_STREAMING = False  # v1: off, v2: on after metrics confirm stability
```

```
Message arrives:
1. HUD shows: "→" (typing indicator)

Role A streams:
2. HUD shows incremental text as tokens arrive
3. If chat-only → done, hide indicator

Role A hands off:
4. HUD shows: "🤔 thinking..." (RAG + Role B running)

Role B decides:
5. HUD shows: "Executing [action]..."

Dispatch:
6. HUD shows: "✓ Done" or "⚠️ Failed, retrying..."
```

**Implementation: `llm/streaming.py`**

```python
"""
Streaming wrapper for LLM responses.
Uses chunked WebSocket messages for perceived latency reduction.
"""
import asyncio
from typing import AsyncGenerator, Callable, Optional
from dataclasses import dataclass

@dataclass
class StreamChunk:
    """A chunk of streamed response."""
    text: str
    is_final: bool = False
    error: Optional[str] = None

async def stream_role_a_response(
    client: 'LLMClient',
    messages: List[Dict],
    on_chunk: Callable[[StreamChunk], None],
    temperature: float = 0.7,
    max_tokens: int = 500
) -> str:
    """
    Stream Role A response with per-token callbacks.

    Returns full response text when complete.
    Calls on_chunk for each token received.
    """
    full_response = ""

    # OpenAI/Anthropic streaming
    if client.provider_type == "openai":
        async for chunk in client.stream_complete(messages, temperature, max_tokens):
            if chunk.get("choices"):
                delta = chunk["choices"][0].get("delta", {})
                text = delta.get("content", "")
                if text:
                    full_response += text
                    on_chunk(StreamChunk(text=text))

    elif client.provider_type == "anthropic":
        async for event in client.stream_complete(messages, temperature, max_tokens):
            if event.type == "content_block_delta":
                text = event.delta.text
                full_response += text
                on_chunk(StreamChunk(text=text))

    else:
        # Non-streaming fallback
        full_response = await client.complete(messages, temperature, max_tokens)
        on_chunk(StreamChunk(text=full_response, is_final=True))

    on_chunk(StreamChunk(text="", is_final=True))
    return full_response


async def send_streaming_to_hud(
    websocket,
    response_generator: AsyncGenerator[StreamChunk, None]
):
    """
    Forward streaming chunks to HUD via WebSocket.
    HUD receives: {type: "stream_chunk", text: "...", is_final: bool}
    """
    async for chunk in response_generator:
        await websocket.send(json.dumps({
            "type": "stream_chunk",
            "text": chunk.text,
            "is_final": chunk.is_final
        }))
        # Small delay to prevent overwhelming HUD
        await asyncio.sleep(0.01)
```

**HUD Integration (hud.js additions):**

```javascript
// Handle streaming chunks
case 'stream_chunk':
    if (message.is_final) {
        hideTypingIndicator();
    } else {
        appendToCurrentMessage(message.text);
    }
    break;
```

---

#### 0.8 Option Shaping (Pre-Role B)

Before sending options to Decision Engine, server shapes the list to keep prompts small and deterministic.

```python
# llm/shaping.py (NEW FILE)

def shape_options(
    intent: str,
    raw_options: List[CapabilityOption],
    max_options: int = 7
) -> List[CapabilityOption]:
    """
    Shape options to keep Role B prompt small and deterministic.
    Reduces ~250 tokens (10 options) to ~120 tokens (5-7 shaped options).
    """
    # 1. De-dup similar options (keep highest score)
    deduped = dedupe_by_similarity(raw_options, threshold=0.9)

    # 2. Boost keyword matches
    keywords = extract_keywords(intent)  # ["scroll", "open", "close", etc.]
    for opt in deduped:
        if any(kw in opt.name.lower() for kw in keywords):
            opt.score = min(1.0, opt.score + 0.2)  # Boost obvious matches

    # 3. Cap descriptions to 50 chars
    for opt in deduped:
        opt.description = opt.description[:50]

    # 4. Sort by score, take top N
    shaped = sorted(deduped, key=lambda x: x.score, reverse=True)[:max_options]

    # 5. Enforce diversity (max 2 per action type)
    return enforce_diversity(shaped, max_per_type=2)


def extract_keywords(intent: str) -> List[str]:
    """Extract action keywords from intent."""
    keywords = []
    intent_lower = intent.lower()

    keyword_map = {
        "scroll": ["scroll", "down", "up", "page"],
        "open": ["open", "go to", "navigate", "visit"],
        "close": ["close", "dismiss", "exit"],
        "click": ["click", "press", "tap", "select"],
        "type": ["type", "enter", "input", "write"],
        "tab": ["tab", "switch"],
    }

    for action, triggers in keyword_map.items():
        if any(t in intent_lower for t in triggers):
            keywords.append(action)

    return keywords


def dedupe_by_similarity(
    options: List[CapabilityOption],
    threshold: float = 0.9
) -> List[CapabilityOption]:
    """Remove near-duplicate options, keeping highest score."""
    seen_embeddings = []
    deduped = []

    for opt in sorted(options, key=lambda x: x.score, reverse=True):
        # Simple text similarity (could use embeddings for better accuracy)
        is_dup = any(
            text_similarity(opt.name, seen.name) > threshold
            for seen in deduped
        )
        if not is_dup:
            deduped.append(opt)

    return deduped


def enforce_diversity(
    options: List[CapabilityOption],
    max_per_type: int = 2
) -> List[CapabilityOption]:
    """Limit options per action type to ensure diversity."""
    type_counts = {}
    diverse = []

    for opt in options:
        action_type = categorize_action(opt.name)  # "scroll", "navigate", "click", etc.
        if type_counts.get(action_type, 0) < max_per_type:
            diverse.append(opt)
            type_counts[action_type] = type_counts.get(action_type, 0) + 1

    return diverse
```

**Why this matters:**
- Raw RAG might return: ScrollDown, ScrollUp, ScrollToTop, ScrollToBottom, PageDown (5 scroll variants)
- After shaping: ScrollDown, ScrollUp (2 max), plus other action types
- Role B sees cleaner, more diverse options → better decisions

---

#### 0.9 Vector Store Hygiene (Cron)

```python
# llm/memory.py - ADD hygiene functions

async def run_memory_hygiene(chat_id: str):
    """
    Run periodically (every 100 messages or daily).
    Prunes, merges, and caps vectors.
    """
    # 1. Prune: age >30d AND retrievals <3
    cutoff = datetime.utcnow() - timedelta(days=30)
    vectors = await get_vectors_for_chat(chat_id)

    for v in vectors:
        if v.created_at < cutoff and v.retrieval_count < 3:
            await delete_vector(v.id)
            logger.info(f"Pruned stale vector: {v.id}")

    # 2. Merge: cosine similarity >0.95, same type
    remaining = await get_vectors_for_chat(chat_id)
    for i, v1 in enumerate(remaining):
        for v2 in remaining[i+1:]:
            if v1.type == v2.type and cosine_sim(v1.embedding, v2.embedding) > 0.95:
                # Keep newer/higher importance
                keep = v1 if v1.importance > v2.importance else v2
                delete = v2 if keep == v1 else v1
                await delete_vector(delete.id)
                logger.info(f"Merged duplicate vectors: {delete.id} → {keep.id}")

    # 3. Cap: max 1000 vectors per chat
    final = await get_vectors_for_chat(chat_id)
    if len(final) > 1000:
        # Score: age × retrievals (lower = evict)
        scored = [(v, v.retrieval_count / max(1, (datetime.utcnow() - v.created_at).days)) for v in final]
        scored.sort(key=lambda x: x[1])

        to_evict = scored[:len(final) - 1000]
        for v, _ in to_evict:
            await delete_vector(v.id)
        logger.info(f"Capped vectors for {chat_id}: evicted {len(to_evict)}")
```

---

#### 0.10 Phase 0 Acceptance Tests

| Test | Input | Expected | Validates |
|------|-------|----------|-----------|
| Large contract paste | 10k char contract | Summary in Role A (200t), raw stored, chunks embedded | Large payload pipeline |
| Rapid scroll spam | "scroll down" ×3 in 1s | Only 1st processes | Deduplication |
| Budget violation | Force 2k token history | Auto-truncates to ≤600t, total ≤1300t | TokenBudget |
| Option shaping | 10 raw options including 5 scroll variants | Returns ≤7 options, max 2 scroll | Option shaping |
| Memory hygiene | Insert 100 noisy vectors | Cron prunes to <1000 | Hygiene cron |
| Role B isolation | Inject history into context | Pydantic validation fails | NEVER list |
| Concurrent messages | 5 messages same chat simultaneously | Processed sequentially | Locking |

```bash
# Run Phase 0 tests
pytest om_e_web_ws/tests/test_phase0_foundation.py -v
```

---

#### 0.11 Files Created (Phase 0)

| File | Purpose |
|------|---------|
| `llm/ingestion.py` | Preprocess, dedup, large payload handling |
| `llm/memory.py` | Rolling history, RAG retrieve, hygiene cron |
| `llm/metrics.py` | TurnMetrics dataclass, logging |
| `llm/shaping.py` | Option shaping before Role B (dedup, boost, diversity) |
| `data/large_payloads/` | Raw large content by hash |
| `data/metrics/turns.jsonl` | Per-turn metrics |
| `tests/test_phase0_foundation.py` | Acceptance tests |

**Modified:**
| File | Changes |
|------|---------|
| `llm/contracts.py` | +TokenBudget class, +Config extra="forbid" |
| `ws_server.py` | +chat_locks, +preprocess call in handler |
| `llm/orchestrator.py` | +shape_options() call before Decision Engine |

---

### Phase 1: Core Two-Role Pipeline

**Goal:** Get Chat Persona + Decision Engine working with capabilities store.

| Stage | Goal | Test With |
|-------|------|-----------|
| 1.1 | Create `chat_prompt.md` | Manual chat conversations |
| 1.2 | Create `executor_prompt.md` | Capability commands ("scroll down", "open youtube") |
| 1.3 | Create `llm/contracts.py` | Unit tests for JSON validation |
| 1.4 | Create `llm/orchestrator.py` | Isolated orchestrator tests |
| 1.5 | Integrate with ws_server.py | End-to-end cap execution |

**Test with capabilities only** - mature store, known working commands.

**Exit criteria:**
- "scroll down" → ScrollDown capability executes
- "open youtube" → OpenTab with URL executes
- "hello" → Chat reply, no execution
- "what tabs do I have" → ListTabs executes

---

### Phase 2: Elements Store + Full Page Fallback

**Goal:** Add page elements to Decision Engine options via RAG, with full page fallback when needed.

**Important clarification:** The DOM scan ALWAYS happens (existing content.js). "Deep Scan" or "Full Page Fallback" refers to the **payload size sent to Decision Engine**:

```
Normal flow:    DOM Scan → Elements Vector → RAG → Top-10 results → Decision Engine (small, ~300t)
Fallback flow:  DOM Scan → Elements Vector → RAG fails → FULL PAGE → Decision Engine (large, ~4-6k t)
```

The fallback is for edge cases like "close that fucking popup" where the popup element might not rank in top-10 RAG results.

| Stage | Goal | Notes |
|-------|------|-------|
| 2.1 | Build `retrieval/elements_store.py` | Similar to capabilities_store |
| 2.2 | Embed page elements on scan | Action ID + label + type + metadata |
| 2.3 | Add elements to Decision Context | Top 10 elements from RAG query |
| 2.4 | Implement full page fallback | Send full element list when top RAG score < threshold |
| 2.5 | User consent for fallback | "I couldn't find it in quick scan. Want me to check the full page?" |

**Phase 1 Elements Store Stub (allows Phase 1 tests to run):**

```python
# retrieval/elements_store.py - STUB for Phase 1
"""
Elements Store stub - returns empty results until Phase 2 implementation.
Allows Phase 1 tests to run without element RAG.
"""
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class ElementsStore:
    """
    Stub element store - returns empty results.
    Full implementation in Phase 2.
    """

    def __init__(self):
        logger.info("ElementsStore initialized (stub mode - Phase 2 implementation pending)")

    async def query(
        self,
        intent: str,
        top_k: int = 10,
        filter: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Query elements store - returns empty until Phase 2.

        Returns: List of element dictionaries with keys:
            - id: Action ID (e.g., "a_id_42")
            - label: Element text/label
            - type: Element type (button, input, link, etc.)
            - score: Relevance score (0-1)
        """
        logger.debug(f"ElementsStore.query called (stub): intent='{intent}', top_k={top_k}")
        return []  # Phase 2: Return actual RAG results

    async def add_elements(
        self,
        elements: List[Dict],
        page_url: str
    ) -> int:
        """
        Add page elements to store - no-op until Phase 2.

        Returns: Count of elements added
        """
        logger.debug(f"ElementsStore.add_elements called (stub): {len(elements)} elements")
        return 0  # Phase 2: Actually embed and store

    async def clear_page(self, page_url: str) -> int:
        """
        Clear elements for a page - no-op until Phase 2.

        Returns: Count of elements removed
        """
        return 0
```

**When to trigger fallback:**
- Top RAG score < 0.5 (no confident match)
- User says "close popup", "dismiss modal", "click that thing" (vague references)
- After user consents (due to latency/cost)

**Exit criteria:**
- "click the login button" → Finds element by RAG match, executes click
- "close that popup" → RAG fails → offers fallback → finds overlay element
- "type hello in the search box" → Finds input, executes setValue

---

### Phase 3: Enhanced Chat Capabilities

**Goal:** Make Chat Persona a full chat experience with memory, state, and interactions.

| Stage | Goal | Notes |
|-------|------|-------|
| 3.1 | Clean up chat_memory_store | Remove duplicate chat data (JSON files = source of truth) |
| 3.2 | Token-based rolling history | Rolling summary + last N turns within 600t budget |
| 3.3 | Summarization for large histories | Compress older messages if >2000 tokens |
| 3.4 | Message classification | Classify: chat/command/paste/log/code/contract |
| 3.5 | Memory retrieval in prompts | Include relevant past context via RAG |
| 3.6 | Conversation continuity | "remember when we..." lookups work |
| 3.7 | Chat-specific capabilities | DeleteChat, RenameChat, SearchChats work seamlessly |

**Message Classification (3.4):**
```python
class MessageType(str, Enum):
    CHAT = "chat"           # Conversational: "hello", "thanks"
    COMMAND = "command"     # Action request: "scroll down", "open youtube"
    PASTE = "paste"         # Large content dump (>2000 chars)
    LOG = "log"             # Stack traces, error logs
    CODE = "code"           # Code snippets
    CONTRACT = "contract"   # Legal/formal documents

def classify_message(content: str) -> MessageType:
    """Classify message for better summarization and embedding strategies."""
    if len(content) > 2000:
        if re.search(r'^\s*at\s+[\w\.]+\(', content, re.MULTILINE):
            return MessageType.LOG
        if re.search(r'(def |function |class |import |const |let )', content):
            return MessageType.CODE
        if re.search(r'(whereas|hereby|pursuant|clause|agreement)', content, re.IGNORECASE):
            return MessageType.CONTRACT
        return MessageType.PASTE
    # Short messages
    if any(kw in content.lower() for kw in ["click", "scroll", "open", "close", "type", "go to"]):
        return MessageType.COMMAND
    return MessageType.CHAT
```

**Why it helps:**
- LOG → Don't embed, just store raw
- CODE → Embed with language tag
- CONTRACT → Summarize aggressively, embed key clauses
- COMMAND → Fast-track to Role A (no heavy processing)
- CHAT → Normal flow

**Exit criteria:**
- Long conversations don't exceed token limits
- "what did we talk about earlier" → Retrieves relevant context
- Chat history persists across sessions

---

### Phase 4: System Knowledge Store

**Goal:** Vector store of how Om-E works - capabilities, commands, architecture.

| Stage | Goal | Notes |
|-------|------|-------|
| 4.1 | Create `retrieval/knowledge_store.py` | New vector store |
| 4.2 | Embed system documentation | CLAUDE.md, capability descriptions, help text |
| 4.3 | Add to Chat Persona context | "what can you do" queries hit knowledge store |
| 4.4 | Add to Decision Engine fallback | If no cap/element match, check knowledge for guidance |

**Knowledge to embed:**
- `internal_capabilities.json` - all 40+ capabilities with synonyms
- System help text - "how do I..."
- Error recovery guidance - common issues and solutions

**Exit criteria:**
- "what can you do" → Lists capabilities intelligently
- "how do I take a screenshot" → Knows about Screenshot capability
- "help" → Relevant guidance from knowledge store

---

### Phase 5: Reliability (Risk, Verification, Retry)

**Goal:** Make execution reliable with risk awareness and verification.

| Stage | Goal | Notes |
|-------|------|-------|
| 5.1 | Risk classification | Safe/Sensitive/Critical buckets per capability |
| 5.2 | Confirmation for critical | "This will delete the chat. Proceed?" |
| 5.3 | Execution verification | Post-action state checks |
| 5.4 | Retry logic | Auto-retry on transient failures |
| 5.5 | Graceful degradation | Fall back to simpler actions on failure |

**Risk buckets:**

| Level | Examples | Behavior |
|-------|----------|----------|
| Safe | ScrollDown, GetPageInfo, ListTabs | Execute immediately |
| Sensitive | OpenTab, Navigate, CloseTab | Execute with note |
| Critical | DeleteChat, ClearHistory | Require explicit confirmation |

**Exit criteria:**
- Critical actions require confirmation
- Failed actions retry appropriately
- User always knows what's happening

---

### Phase 6: Tuning & Tests

| Stage | Goal |
|-------|------|
| 6.1 | Prompt size limits enforcement |
| 6.2 | Confidence threshold tuning |
| 6.3 | Full acceptance test suite |
| 6.4 | Performance benchmarks |

---

## Appendix: Prompt Token Estimates

### Role A: Chat Persona
| Component | Tokens |
|-----------|--------|
| System prompt | ~400 |
| Rolling summary | ~200-300 |
| Last 3-5 messages | ~200-400 |
| Current message + env | ~100-200 |
| **TOTAL** | **~900-1300** |
| **HARD CAP** | **1300** |

### Role B: Decision Engine (REALISTIC)
| Component | Tokens |
|-----------|--------|
| System prompt | ~400 |
| Intent + original_text | ~30-50 |
| Active tab (title only) | ~10-20 |
| Options (5-7 shaped × ~20t each) | ~100-140 |
| **TOTAL (normal)** | **~550-700** |
| **HARD CAP** | **1000** |

Note: The "~150 tokens" claim for Decision Engine was optimistic. Realistic is ~550-700 tokens after shaping. Still fast, still well under cap.

### Full Page Fallback
| Component | Tokens |
|-----------|--------|
| System prompt | ~400 |
| Intent + tab | ~50 |
| Full element list | ~3500-5500 |
| **TOTAL** | **~4000-6000** |

### Per-Turn Totals
- **Normal turn:** ~1500-2000 tokens (both calls combined)
- **Fallback turn:** ~5000-7000 tokens (rare, requires consent)

**Savings vs current approach:**
- Current: 2500-3500 tokens (full page + full history + full capabilities)
- New normal: ~1500-2000 tokens (40-50% reduction)
- Fallback only when needed (rare)

---

## Appendix: Key Architectural Decisions

### Why No Shortcuts (Regex Bypasses)?

Initially considered:
- Regex matching for common patterns ("open youtube", "scroll down")
- Intent classification to bypass Chat Persona LLM call
- Pattern-to-capability mapping for 60-70% of requests

**Why rejected:**
1. **Generic browser automation** - Users surf ALL sites dynamically, can't anticipate patterns
2. **URL construction** - "open youtube" needs LLM to construct `https://youtube.com`
3. **Conversational wrappers** - "hey lets go check out youtube" can't be regex-matched
4. **100% accuracy requirement** - Any shortcut miss = bad UX
5. **Speed parity** - Small LLM payloads (~200 tokens) are fast anyway

**Final decision:** ALL messages go through Chat Persona. The LLM is cheap enough when prompts are small.

### Why Two Prompts in Same Pipeline?

Considered:
- Separate `ChatAgent` and `ExecutorAgent` classes
- LangChain multi-agent framework
- Full orchestration with message passing

**Why rejected:**
1. **Same `call_role()` method** - Just swap the system prompt, reuse HTTP client
2. **No extra complexity** - One pipeline, two prompts, simple state machine
3. **LangChain overhead** - Too heavy for our needs, existing `LLMClient` works

**Final decision:** `call_role(messages)` with different prompts from `data/prompts/`.

### Why `data/prompts/` Instead of `llm/prompts/`?

1. **Consistency** - Existing `system.md` already in `data/prompts/`
2. **Non-code assets** - Prompts are content, not Python code
3. **Future hot-reloading** - Edit prompts without code changes

### What is "Deep Scan" / "Full Page Fallback"?

**Clarification:** The DOM scan ALWAYS runs (content.js scans on every user input). "Deep Scan" refers to **payload size to Decision Engine**, not a separate scan operation.

```
Normal:    Elements → Vector → RAG → Top-10 (~300t) → Decision Engine
Fallback:  Elements → Vector → RAG fails → FULL PAGE (~4-6k t) → Decision Engine
```

**Use cases for fallback:**
- "close that fucking popup" - popup might not be in top-10 RAG results
- "dismiss the modal" - overlay elements are often low-ranked
- "click the thing in the corner" - vague references need full context

### Why Progressive Escalation (Not Auto Fallback)?

Full page fallback sends ~4000+ tokens. Doing this automatically would:
1. Slow down every unmatched request (2-3x latency)
2. Cost more in API calls
3. Often be unnecessary (user can clarify instead)

**Final decision:** Offer fallback only when:
- Top RAG score < threshold (no confident match)
- User explicitly consents ("yes" / "check the full page")

### Why Server-Owned Risk Classification?

LLM shouldn't decide what's safe vs critical. Server owns:
- Risk levels per capability (Safe/Sensitive/Critical)
- Confirmation requirements
- Retry logic

LLM just picks from options - server enforces rules.
