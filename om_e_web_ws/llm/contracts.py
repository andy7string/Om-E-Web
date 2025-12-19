"""
JSON contract validators for LLM role outputs.
Uses Pydantic for strict validation.

Three output contracts:
- ChatPersonaOutput: Role A (intent classifier)
- DecisionEngineOutput: Role B (action picker)
- DeepScanOutput: Fallback (full page scan)
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal, List, Union, Dict
from enum import Enum


# ============================================================
# Chat Persona Output (Role A)
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


class ChatPersonaHandoff(BaseModel):
    """Handoff to Decision Engine. Simple intent extraction only."""
    handoff: Literal[True]
    intent: str = Field(..., min_length=3, max_length=200)
    original_text: str = Field(..., min_length=1, max_length=1000)


# Union type for Chat Persona output
ChatPersonaOutput = Union[ChatPersonaReply, ChatPersonaHandoff]


def validate_chat_persona_output(data: dict) -> ChatPersonaOutput:
    """Validate and parse Chat Persona output."""
    if data.get("handoff") is True:
        return ChatPersonaHandoff(**data)
    return ChatPersonaReply(**data)


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
# Decision Engine Output (Role B) - Executor
# ============================================================

class DecisionType(str, Enum):
    """Decision types for Executor output."""
    CAP = "cap"           # Execute a capability
    ACT = "act"           # Execute an element action
    OPTIONS = "options"   # Multiple valid options - present to user
    CANNOT = "cannot"     # Can't do it (triggers escalation offer)
    NOOP = "noop"         # Already done / no action needed


class ExecutorOption(BaseModel):
    """
    A single option in an OPTIONS response.

    Types:
    - cap: Execute a capability (target = capability name)
    - act: Execute element action (target = element ID)
    - custom: User writes custom instruction (no target)
    - cancel: Cancel the operation (no target)
    """
    type: Literal["cap", "act", "custom", "cancel"]
    target: Optional[str] = None  # Required for cap/act, None for custom/cancel
    label: str = Field(..., min_length=1, max_length=100)  # Human-readable description

    @field_validator('target')
    @classmethod
    def target_required_for_actions(cls, v, info):
        option_type = info.data.get('type')
        if option_type in ["cap", "act"] and v is None:
            raise ValueError('target required for cap/act options')
        return v


class DecisionEngineOutput(BaseModel):
    """
    Executor response - deterministic action selection.

    Decision types:
    - cap/act: Single clear decision with target
    - options: Multiple valid options for user to choose
    - cannot: No matching option found
    - noop: Action already completed
    """
    decision: DecisionType
    target: Optional[Union[str, int]] = None  # cap name or element ID (for cap/act)
    value: Optional[str] = None  # for setValue actions
    options: Optional[List[ExecutorOption]] = None  # for OPTIONS decision
    reason: Optional[str] = None  # for cannot/noop explanations

    @field_validator('target')
    @classmethod
    def target_required_for_cap_act(cls, v, info):
        decision = info.data.get('decision')
        if decision in [DecisionType.CAP, DecisionType.ACT]:
            if v is None:
                raise ValueError('target required for cap/act decisions')
        return v

    @field_validator('options')
    @classmethod
    def options_required_for_options_decision(cls, v, info):
        if info.data.get('decision') == DecisionType.OPTIONS:
            if not v or len(v) < 2:
                raise ValueError('options decision requires at least 2 options')
            # Verify custom and cancel are present
            types = [opt.type for opt in v]
            if 'custom' not in types:
                raise ValueError('options must include a custom option')
            if 'cancel' not in types:
                raise ValueError('options must include a cancel option')
        return v


def validate_decision_engine_output(data: dict) -> DecisionEngineOutput:
    """Validate and parse Executor output."""
    # Convert options dicts to ExecutorOption objects if present
    if data.get('options'):
        data['options'] = [
            ExecutorOption(**opt) if isinstance(opt, dict) else opt
            for opt in data['options']
        ]
    return DecisionEngineOutput(**data)


# ============================================================
# Deep Scan Output (Fallback)
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
# Risk Levels and Capability Registry
# ============================================================

class RiskLevel(str, Enum):
    """Risk classification for capabilities."""
    SAFE = "safe"          # ScrollDown, GetPageInfo - no confirmation needed
    SENSITIVE = "sensitive" # OpenTab, Navigate - may leave current page
    CRITICAL = "critical"   # DeleteChat, ClearHistory - destructive actions


# Server-owned capability risk registry (single source of truth)
CAPABILITY_RISK_MAP: Dict[str, RiskLevel] = {
    # SAFE - No confirmation needed
    "ScrollDown": RiskLevel.SAFE,
    "ScrollUp": RiskLevel.SAFE,
    "GetPageInfo": RiskLevel.SAFE,
    "RetrieveTranscript": RiskLevel.SAFE,
    "GetCurrentUrl": RiskLevel.SAFE,
    "CopyToClipboard": RiskLevel.SAFE,
    "ZoomIn": RiskLevel.SAFE,
    "ZoomOut": RiskLevel.SAFE,
    "ZoomReset": RiskLevel.SAFE,

    # SENSITIVE - Warn user, may change page
    "OpenTab": RiskLevel.SENSITIVE,
    "Navigate": RiskLevel.SENSITIVE,
    "CloseTab": RiskLevel.SENSITIVE,
    "SwitchTab": RiskLevel.SENSITIVE,
    "SubmitForm": RiskLevel.SENSITIVE,
    "SetTheme": RiskLevel.SENSITIVE,
    "SetCurrentChat": RiskLevel.SENSITIVE,

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


# ============================================================
# Decision Context (Server-assembled for Role B)
# ============================================================

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
    """
    Context assembled by server for Decision Engine.
    STRICT: Only these fields allowed. Extra fields raise validation error.
    """
    intent: str
    original_text: str
    mode: DecisionMode = DecisionMode.CAP_ONLY  # Tells LLM what's available
    active_tab: dict  # {url, title}
    page_summary: Optional[str] = None  # Short summary if available
    capabilities: List[CapabilityOption] = Field(default_factory=list, max_length=10)
    elements: List[ElementOption] = Field(default_factory=list, max_length=10)

    class Config:
        extra = "forbid"  # Reject unknown fields


# ============================================================
# Token Budget (Hard Limits)
# ============================================================

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
    """
    Rough token estimate (4 chars per token).

    Good enough for budget enforcement. Real tokenization
    would add latency with no meaningful accuracy gain.
    """
    return len(text) // 4


def truncate_to_budget(content: str, budget: int) -> str:
    """
    Truncate content to fit token budget.

    Args:
        content: Text to truncate
        budget: Max tokens allowed

    Returns:
        Truncated text with "..." if truncated
    """
    current = estimate_tokens(content)
    if current <= budget:
        return content
    # Truncate to ~budget tokens (budget * 4 chars)
    return content[:budget * 4] + "..."
