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
import json
import logging
import time
from typing import Optional, Dict, List
from dataclasses import dataclass
from pathlib import Path

from .client import LLMClient
from .contracts import (
    validate_chat_persona_output,
    validate_decision_engine_output,
    ChatPersonaOutput,
    ChatPersonaReply,
    ChatPersonaHandoff,
    DecisionEngineOutput,
    DecisionType,
    TurnState,
    RiskLevel,
    get_capability_risk,
    estimate_tokens,
)
from .shaping import shape_options
from .metrics import TurnMetrics, log_turn_metrics

logger = logging.getLogger(__name__)

# Debug output directory
DEBUG_DIR = Path(__file__).parent.parent

def _write_debug_file(filename: str, content: str):
    """Write debug content to file."""
    try:
        path = DEBUG_DIR / filename
        path.write_text(content, encoding="utf-8")
        logger.info(f"[DEBUG] Wrote {filename}")
    except Exception as e:
        logger.warning(f"[DEBUG] Failed to write {filename}: {e}")

# ============================================================
# Configuration Constants
# ============================================================

# Prompt size limits (with 10% buffer built into totals)
MAX_HISTORY_TOKENS = 600  # Rolling chat history budget for Chat Persona
MAX_TAB_TITLES = 5  # Tab titles in environment hint
MAX_CAPABILITY_OPTIONS = 10

# Confidence thresholds (tune after metrics analysis)
HIGH_CONFIDENCE_THRESHOLD = 0.85  # Act immediately
MEDIUM_CONFIDENCE_THRESHOLD = 0.60  # May need clarification
LOW_CONFIDENCE_THRESHOLD = 0.40  # Offer full page fallback

# Prompt file paths
PROMPTS_DIR = Path(__file__).parent.parent / "data" / "prompts"
CHATS_DIR = Path(__file__).parent.parent / "data" / "chats"
ORB_PROFILES_PATH = Path(__file__).parent.parent / "data" / "orb_profiles.json"

# ============================================================
# Data Classes
# ============================================================

@dataclass
class OrchestratorState:
    """
    Tracks conversation FLOW state (not history - that's in JSON files).
    Use transition_to() for state changes.
    """
    current_chat_id: Optional[str] = None
    current_turn_state: TurnState = TurnState.TURN_CHAT_ONLY
    last_intent: Optional[str] = None
    pending_intent: Optional[str] = None  # For escalation flow
    pending_original_text: Optional[str] = None  # Original user text for param extraction
    pending_critical_action: Optional[DecisionEngineOutput] = None
    pending_critical_context: Optional[Dict] = None
    pending_options: Optional[List[Dict]] = None  # Options presented to user

    def transition_to(self, new_state: TurnState) -> None:
        """Explicit state transition with logging."""
        logger.debug(f"Turn state: {self.current_turn_state.value} → {new_state.value}")
        self.current_turn_state = new_state

    def is_awaiting_deep_scan_consent(self) -> bool:
        """Check if waiting for user to consent to full page scan."""
        return self.current_turn_state == TurnState.TURN_ESCALATION_OFFERED

    def is_awaiting_critical_confirmation(self) -> bool:
        """Check if waiting for user to confirm critical action."""
        return self.current_turn_state == TurnState.TURN_AWAITING_CONFIRM

    def is_awaiting_option_selection(self) -> bool:
        """Check if waiting for user to select from options."""
        return self.pending_options is not None and len(self.pending_options) > 0

    def reset_turn(self) -> None:
        """Reset state for a new turn."""
        self.current_turn_state = TurnState.TURN_CHAT_ONLY
        self.pending_intent = None
        self.pending_original_text = None
        self.pending_critical_action = None
        self.pending_critical_context = None
        self.pending_options = None


@dataclass
class OrchestratorResult:
    """Result from orchestrator processing."""
    response_text: str
    turn_state: TurnState = TurnState.TURN_CHAT_ONLY
    action_executed: bool = False
    action_type: Optional[str] = None  # 'cap', 'act', 'options', 'cannot', 'noop'
    action_target: Optional[str] = None
    action_value: Optional[str] = None  # For setValue actions (legacy)
    action_params: Optional[Dict] = None  # Capability params (e.g. {"url": "..."})
    options: Optional[List[Dict]] = None  # For OPTIONS decision
    requires_deep_scan_consent: bool = False
    requires_confirmation: bool = False
    noop_reason: Optional[str] = None


# ============================================================
# PersonaOrchestrator
# ============================================================

class PersonaOrchestrator:
    """
    Coordinates Chat Persona → RAG → Decision Engine → Execution.

    Server-owned, keeps prompts small, LLM roles only choose from options.
    """

    def __init__(self):
        """Initialize orchestrator with LLM client."""
        self._client = LLMClient()
        self.state = OrchestratorState()
        self._prompt_cache: Dict[str, str] = {}
        self._cap_store = None  # Lazy loaded
        self._orb_profiles: Dict = {}  # Orb personality profiles

        # Load prompt templates
        self._load_prompts()
        self._load_orb_profiles()

    def _load_prompts(self):
        """Load prompt templates from files."""
        role_to_file = {
            "chat_persona": "chat_prompt.md",
            "decision_engine": "executor_prompt.md",
        }
        for role, filename in role_to_file.items():
            path = PROMPTS_DIR / filename
            if path.exists():
                self._prompt_cache[role] = path.read_text()
            else:
                logger.warning(f"Prompt file not found: {path}")
                self._prompt_cache[role] = ""

    def _load_orb_profiles(self):
        """Load orb personality profiles from JSON."""
        try:
            if ORB_PROFILES_PATH.exists():
                with open(ORB_PROFILES_PATH) as f:
                    data = json.load(f)
                    self._orb_profiles = data.get("profiles", {})
                    logger.info(f"Loaded {len(self._orb_profiles)} orb profiles")
            else:
                logger.warning(f"Orb profiles not found: {ORB_PROFILES_PATH}")
        except Exception as e:
            logger.warning(f"Failed to load orb profiles: {e}")

    def _get_cap_store(self):
        """Lazy load capabilities store."""
        if self._cap_store is None:
            from retrieval.capabilities_store import CapabilitiesStore
            self._cap_store = CapabilitiesStore()
            if not self._cap_store.load():
                self._cap_store.build()
        return self._cap_store

    # --------------------------------------------------------
    # Main Entry Point
    # --------------------------------------------------------

    async def process_message(
        self,
        user_message: str,
        chat_id: Optional[str] = None,
        active_tab: Optional[Dict] = None,
        tabs: Optional[List[Dict]] = None,
        orb_theme: Optional[str] = None,
    ) -> OrchestratorResult:
        """
        Process user message through the two-role architecture.

        Args:
            user_message: User's input text
            chat_id: Current chat ID (for loading history from JSON)
            active_tab: Current active tab {url, title}
            tabs: List of open tabs [{id, url, title}, ...]
            orb_theme: Current orb theme for personality injection

        Returns:
            OrchestratorResult with response and action details
        """
        # Start metrics
        metrics = TurnMetrics(
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            chat_id=chat_id or "unknown"
        )
        turn_start = time.time()

        # Track current chat
        self.state.current_chat_id = chat_id

        # Check if user is responding to CRITICAL action confirmation
        if self.state.is_awaiting_critical_confirmation():
            result = await self._handle_critical_confirmation(user_message)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return result

        # Check if user is responding to full page fallback consent
        if self.state.is_awaiting_deep_scan_consent():
            result = await self._handle_escalation_consent(user_message)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return result

        # Check if user is selecting from presented options
        if self.state.is_awaiting_option_selection():
            result = await self._handle_option_selection(user_message)
            if result is not None:  # None means not a selection, continue normal flow
                metrics.total_ms = (time.time() - turn_start) * 1000
                await log_turn_metrics(metrics)
                return result

        # STEP 1: Call Chat Persona (Role A)
        t0 = time.time()
        persona_output = await self._call_chat_persona(
            user_message, active_tab, tabs, chat_id, orb_theme
        )
        metrics.chat_persona_ms = (time.time() - t0) * 1000

        # If chat-only, return reply directly
        if isinstance(persona_output, ChatPersonaReply):
            self.state.transition_to(TurnState.TURN_CHAT_ONLY)
            metrics.handoff = False
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return OrchestratorResult(
                response_text=persona_output.reply,
                turn_state=TurnState.TURN_CHAT_ONLY,
                action_executed=False
            )

        # STEP 2: Run RAG retrieval
        metrics.handoff = True
        self.state.transition_to(TurnState.TURN_HANDOFF_PENDING)
        intent = persona_output.intent
        self.state.last_intent = intent
        self.state.pending_original_text = persona_output.original_text  # Store for param extraction

        t0 = time.time()
        raw_options = await self._query_capabilities(intent)
        metrics.rag_ms = (time.time() - t0) * 1000

        if raw_options:
            metrics.top_score = raw_options[0].get("score", 0)

        # STEP 3: Shape options (dedup, boost, diversity)
        shaped_options = shape_options(intent, raw_options, max_options=MAX_CAPABILITY_OPTIONS)

        # STEP 4: Call Decision Engine (Role B)
        t0 = time.time()
        decision_output = await self._call_decision_engine(intent, shaped_options, active_tab)
        metrics.decision_engine_ms = (time.time() - t0) * 1000
        metrics.decision_type = decision_output.decision.value

        # STEP 5: Apply confidence gating and return result
        result = await self._apply_confidence_gating(decision_output, intent, shaped_options)

        metrics.total_ms = (time.time() - turn_start) * 1000
        await log_turn_metrics(metrics)

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
        orb_theme: Optional[str] = None,
    ) -> ChatPersonaOutput:
        """
        Call Chat Persona role with rolling history.

        Returns:
            ChatPersonaOutput (either ChatPersonaReply or ChatPersonaHandoff)
        """
        # Build environment hint
        env_hint = self._build_environment_hint(active_tab, tabs)

        # Get rolling history from JSON file
        chat_history = self._get_rolling_history(chat_id, MAX_HISTORY_TOKENS)

        # Build messages
        system_prompt = self._prompt_cache.get("chat_persona", "")

        # Inject orb personality if available
        if orb_theme and orb_theme in self._orb_profiles:
            profile = self._orb_profiles[orb_theme]
            personality_inject = f"""
YOUR PERSONALITY
You are {profile.get('name', 'Orb')}. {profile.get('personality', '')}
Tone: {profile.get('tone', 'helpful')}
Example phrases: {', '.join(profile.get('example_phrases', []))}
Use this personality in your conversational replies, but stay concise.
"""
            system_prompt = system_prompt + "\n" + personality_inject

        messages = []
        # Add rolling history
        for msg in chat_history:
            messages.append(msg)

        # Add current message with environment context
        user_content = f"""ENVIRONMENT
{env_hint}

USER MESSAGE
{user_message}

(Respond with JSON only)"""
        messages.append({"role": "user", "content": user_content})

        # Call LLM
        try:
            response_text = await self._client.chat(
                system_prompt=system_prompt,
                messages=messages,
                temperature=0.1,
                max_tokens=500
            )

            # Write debug file for Chat Persona (Role A)
            debug_content = self._build_chat_debug(
                user_message=user_message,
                system_prompt=system_prompt,
                messages=messages,
                env_hint=env_hint,
                chat_history_count=len(chat_history),
                response_text=response_text
            )
            _write_debug_file("llm_chat.md", debug_content)

            # Parse JSON response
            json_data = self._extract_json(response_text)
            if json_data:
                return validate_chat_persona_output(json_data)

        except Exception as e:
            logger.warning(f"Chat Persona error: {e}")

        # Fallback: treat as chat-only reply
        return ChatPersonaReply(handoff=False, reply="I'm not sure how to help with that.", findMemory=None, findCommand=None)

    def _build_environment_hint(
        self,
        active_tab: Optional[Dict],
        tabs: Optional[List[Dict]]
    ) -> str:
        """Build environment context for Chat Persona."""
        lines = []

        if active_tab:
            url = active_tab.get("url", "")
            title = active_tab.get("title", "Unknown")
            lines.append(f"URL: {url}")
            lines.append(f"Title: {title}")

        if tabs:
            lines.append("")
            lines.append("Tabs:")
            active_id = active_tab.get("id") if active_tab else None
            for i, tab in enumerate(tabs[:MAX_TAB_TITLES], 1):
                tab_title = tab.get("title", "Untitled")[:40]
                tab_domain = self._extract_domain(tab.get("url", ""))
                marker = " (ACTIVE)" if tab.get("id") == active_id else ""
                lines.append(f"- {i}. {tab_title} ({tab_domain}){marker}")

        return "\n".join(lines) if lines else "No tab info"

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL for display."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.netloc or "unknown"
        except:
            return "unknown"

    def _get_rolling_history(
        self,
        chat_id: Optional[str],
        max_tokens: int = 600
    ) -> List[Dict]:
        """
        Get rolling chat history from JSON file within token budget.

        Source of truth is data/chats/{chat_id}.json
        """
        if not chat_id:
            return []

        chat_path = CHATS_DIR / f"{chat_id}.json"
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
                summary_tokens = estimate_tokens(rolling_summary)
                if summary_tokens < max_tokens * 0.4:  # Max 40% for summary
                    history.append({
                        "role": "system",
                        "content": f"[Previous context: {rolling_summary}]"
                    })
                    used_tokens += summary_tokens

            # 2. Add recent messages (newest first, then reverse)
            recent_messages = []

            for msg in reversed(messages):
                msg_content = msg.get("content", "")
                msg_tokens = estimate_tokens(msg_content)
                if used_tokens + msg_tokens > max_tokens:
                    break
                recent_messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg_content
                })
                used_tokens += msg_tokens

            # Reverse to chronological order
            recent_messages.reverse()
            history.extend(recent_messages)

            return history

        except Exception as e:
            logger.warning(f"Failed to load chat history: {e}")
            return []

    # --------------------------------------------------------
    # RAG Retrieval
    # --------------------------------------------------------

    async def _query_capabilities(self, intent: str) -> List[Dict]:
        """
        Query capabilities store for matching options.

        Returns list of dicts with: label, description, params, example, score
        """
        try:
            cap_store = self._get_cap_store()
            results = cap_store.search(intent, k=MAX_CAPABILITY_OPTIONS, threshold=0.3)

            options = []
            for r in results:
                cap_data = {
                    "label": r.metadata.get("name", "Unknown"),
                    "description": r.metadata.get("description", ""),
                    "group": r.metadata.get("group", ""),
                    "example": r.metadata.get("example", ""),
                    "params": r.metadata.get("params", {}),
                    "score": r.score
                }
                # Debug: log what we're getting
                print(f"[RAG] {cap_data['label']}: params={cap_data['params']}")
                options.append(cap_data)
            return options

        except Exception as e:
            logger.warning(f"Capabilities query error: {e}")
            return []

    # --------------------------------------------------------
    # Role B: Decision Engine
    # --------------------------------------------------------

    async def _call_decision_engine(
        self,
        intent: str,
        capabilities: List[Dict],
        active_tab: Optional[Dict]
    ) -> DecisionEngineOutput:
        """
        Call Decision Engine with server-prepared options.

        Returns:
            DecisionEngineOutput with decision, target, value, options, reason
        """
        system_prompt = self._prompt_cache.get("decision_engine", "")

        # Build compact input with full capability metadata
        lines = [f"Intent: {intent}", ""]
        for cap in capabilities:
            label = cap['label']
            desc = cap['description']
            group = cap.get('group', '')
            score = cap['score']
            params = cap.get('params', {})
            example = cap.get('example', '')

            # Format: Name [group] (score): description
            group_tag = f"[{group}]" if group else ""
            lines.append(f"- {label} {group_tag} ({score:.2f}): {desc}")

            # Always show example for format reference
            if example:
                lines.append(f"  example: {example}")

            # Show params if any
            if params:
                param_str = ", ".join(f'{k}: "{v}"' for k, v in params.items())
                lines.append(f"  params: {{{param_str}}}")

        if active_tab:
            lines.append("")
            lines.append(f"Active: {active_tab.get('title', 'Unknown')} ({active_tab.get('url', '')})")

        user_content = "\n".join(lines)

        messages = [{"role": "user", "content": user_content}]

        try:
            response_text = await self._client.chat(
                system_prompt=system_prompt,
                messages=messages,
                temperature=0.1,
                max_tokens=500
            )

            # Write debug file for Decision Engine (Role B)
            debug_content = self._build_execute_debug(
                intent=intent,
                system_prompt=system_prompt,
                user_content=user_content,
                capabilities=capabilities,
                active_tab=active_tab,
                response_text=response_text
            )
            _write_debug_file("llm_execute.md", debug_content)

            # Parse JSON response
            json_data = self._extract_json(response_text)
            if json_data:
                return validate_decision_engine_output(json_data)

        except Exception as e:
            logger.warning(f"Decision Engine error: {e}")

        # Fallback: cannot
        return DecisionEngineOutput(
            decision=DecisionType.CANNOT,
            reason="Failed to process request"
        )

    # --------------------------------------------------------
    # Confidence Gating
    # --------------------------------------------------------

    async def _apply_confidence_gating(
        self,
        decision: DecisionEngineOutput,
        intent: str,
        options: List[Dict]
    ) -> OrchestratorResult:
        """
        Apply confidence gating to Decision Engine output.

        Returns:
            OrchestratorResult with appropriate response
        """
        # Handle each decision type
        if decision.decision == DecisionType.CAP:
            return await self._handle_cap_decision(decision, intent)

        elif decision.decision == DecisionType.ACT:
            return await self._handle_act_decision(decision, intent)

        elif decision.decision == DecisionType.OPTIONS:
            return self._handle_options_decision(decision, intent)

        elif decision.decision == DecisionType.NOOP:
            return OrchestratorResult(
                response_text=decision.reason or "Already done.",
                turn_state=TurnState.TURN_COMPLETED,
                action_type="noop",
                noop_reason=decision.reason
            )

        elif decision.decision == DecisionType.CANNOT:
            return self._handle_cannot_decision(decision, intent, options)

        # Unknown decision type
        return OrchestratorResult(
            response_text="I couldn't understand how to help with that.",
            turn_state=TurnState.TURN_FAILED
        )

    async def _handle_cap_decision(
        self,
        decision: DecisionEngineOutput,
        _intent: str
    ) -> OrchestratorResult:
        """Handle CAP decision - execute capability."""
        target = str(decision.target) if decision.target else "Unknown"
        params = dict(decision.params) if decision.params else {}

        # Inject original_text for server-side param extraction (e.g. fuzzy chat name)
        if self.state.pending_original_text:
            params["original_text"] = self.state.pending_original_text

        # Check risk level
        risk = get_capability_risk(target)

        if risk == RiskLevel.CRITICAL:
            # Block until explicit confirmation
            self.state.pending_critical_action = decision
            self.state.transition_to(TurnState.TURN_AWAITING_CONFIRM)
            return OrchestratorResult(
                response_text=f"⚠️ This will {target}. Are you sure? (say 'yes' to confirm)",
                turn_state=TurnState.TURN_AWAITING_CONFIRM,
                action_type="cap",
                action_target=target,
                action_params=params,
                requires_confirmation=True
            )

        # Execute (ws_server handles actual dispatch)
        self.state.transition_to(TurnState.TURN_EXECUTING)
        return OrchestratorResult(
            response_text=f"Executing {target}...",
            turn_state=TurnState.TURN_EXECUTING,
            action_executed=True,
            action_type="cap",
            action_target=target,
            action_value=decision.value,
            action_params=params
        )

    async def _handle_act_decision(
        self,
        decision: DecisionEngineOutput,
        _intent: str
    ) -> OrchestratorResult:
        """Handle ACT decision - execute element action."""
        target = str(decision.target) if decision.target else "0"

        self.state.transition_to(TurnState.TURN_EXECUTING)
        return OrchestratorResult(
            response_text=f"Clicking element {target}...",
            turn_state=TurnState.TURN_EXECUTING,
            action_executed=True,
            action_type="act",
            action_target=target,
            action_value=decision.value
        )

    def _handle_options_decision(
        self,
        decision: DecisionEngineOutput,
        intent: str
    ) -> OrchestratorResult:
        """Handle OPTIONS decision - present choices to user."""
        # Format options for display
        option_lines = ["Which would you like?", ""]
        options_data = []

        for i, opt in enumerate(decision.options or [], 1):
            option_lines.append(f"{i}. {opt.label}")
            options_data.append({
                "type": opt.type,
                "target": opt.target,
                "label": opt.label
            })

        self.state.pending_intent = intent  # Save for follow-up handling
        self.state.pending_options = options_data  # Save for option selection
        return OrchestratorResult(
            response_text="\n".join(option_lines),
            turn_state=TurnState.TURN_CHAT_ONLY,  # Awaiting user selection
            action_type="options",
            options=options_data
        )

    def _handle_cannot_decision(
        self,
        decision: DecisionEngineOutput,
        intent: str,
        options: List[Dict]
    ) -> OrchestratorResult:
        """Handle CANNOT decision - offer deep scan if low scores."""
        # Check if we should offer full page scan
        top_score = options[0].get("score", 0) if options else 0

        if top_score < LOW_CONFIDENCE_THRESHOLD:
            # Offer deep scan
            self.state.pending_intent = intent
            self.state.transition_to(TurnState.TURN_ESCALATION_OFFERED)
            return OrchestratorResult(
                response_text=f"I'm not sure how to do that. Would you like me to scan the whole page for options? (say 'yes' to scan)",
                turn_state=TurnState.TURN_ESCALATION_OFFERED,
                action_type="cannot",
                requires_deep_scan_consent=True
            )

        # Just return the reason
        return OrchestratorResult(
            response_text=decision.reason or "I couldn't find a way to do that.",
            turn_state=TurnState.TURN_COMPLETED,
            action_type="cannot"
        )

    # --------------------------------------------------------
    # Confirmation Handlers
    # --------------------------------------------------------

    async def _handle_critical_confirmation(
        self,
        user_message: str
    ) -> OrchestratorResult:
        """Handle user response to critical action confirmation."""
        msg_lower = user_message.lower().strip()

        if msg_lower in ["yes", "y", "confirm", "ok", "do it"]:
            # Execute the pending action
            decision = self.state.pending_critical_action
            if decision is None:
                self.state.reset_turn()
                return OrchestratorResult(
                    response_text="No pending action to confirm.",
                    turn_state=TurnState.TURN_COMPLETED,
                    action_executed=False
                )

            target = str(decision.target) if decision.target else "Unknown"
            value = decision.value
            params = decision.params or {}
            self.state.reset_turn()
            self.state.transition_to(TurnState.TURN_EXECUTING)

            return OrchestratorResult(
                response_text=f"Executing {target}...",
                turn_state=TurnState.TURN_EXECUTING,
                action_executed=True,
                action_type="cap",
                action_target=target,
                action_value=value,
                action_params=params
            )
        else:
            # Cancel
            self.state.reset_turn()
            return OrchestratorResult(
                response_text="Cancelled.",
                turn_state=TurnState.TURN_COMPLETED,
                action_executed=False
            )

    async def _handle_escalation_consent(
        self,
        user_message: str
    ) -> OrchestratorResult:
        """Handle user response to deep scan consent."""
        msg_lower = user_message.lower().strip()

        if msg_lower in ["yes", "y", "scan", "ok"]:
            # TODO: Implement deep scan in Phase 2
            self.state.reset_turn()
            return OrchestratorResult(
                response_text="Deep scan not yet implemented. Try rephrasing your request.",
                turn_state=TurnState.TURN_COMPLETED
            )
        else:
            # Cancel
            self.state.reset_turn()
            return OrchestratorResult(
                response_text="OK, let me know if you'd like to try a different approach.",
                turn_state=TurnState.TURN_COMPLETED
            )

    async def _handle_option_selection(
        self,
        user_message: str
    ) -> Optional[OrchestratorResult]:
        """
        Handle user selecting from presented options.
        Returns None if message is not an option selection (continue normal flow).
        """
        msg = user_message.strip()
        options = self.state.pending_options or []

        # Check if message is a number (option selection)
        try:
            selection = int(msg)
            if 1 <= selection <= len(options):
                selected = options[selection - 1]
                opt_type = selected.get("type", "")
                opt_target = selected.get("target", "")

                # Clear pending options
                self.state.pending_options = None

                if opt_type == "cancel":
                    self.state.reset_turn()
                    return OrchestratorResult(
                        response_text="Cancelled.",
                        turn_state=TurnState.TURN_COMPLETED,
                        action_executed=False
                    )

                if opt_type == "custom":
                    self.state.reset_turn()
                    return OrchestratorResult(
                        response_text="What would you like to do instead?",
                        turn_state=TurnState.TURN_CHAT_ONLY,
                        action_executed=False
                    )

                if opt_type == "cap" and opt_target:
                    # Execute the selected capability
                    # Build params - for chat operations, use current chat
                    params = {}
                    if opt_target in ["DeleteChat", "RenameChat"] and self.state.current_chat_id:
                        params["chat_id"] = self.state.current_chat_id

                    decision = DecisionEngineOutput(
                        decision=DecisionType.CAP,
                        target=opt_target,
                        params=params
                    )
                    return await self._handle_cap_decision(decision, self.state.pending_intent or "")

                # Unknown type - clear and continue
                self.state.reset_turn()
                return None
        except ValueError:
            pass

        # Not a number - check if cancel words
        msg_lower = msg.lower()
        if msg_lower in ["cancel", "nevermind", "no", "stop"]:
            self.state.pending_options = None
            self.state.reset_turn()
            return OrchestratorResult(
                response_text="Cancelled.",
                turn_state=TurnState.TURN_COMPLETED,
                action_executed=False
            )

        # Not an option selection - clear options and continue normal flow
        self.state.pending_options = None
        return None

    # --------------------------------------------------------
    # Utilities
    # --------------------------------------------------------

    def _extract_json(self, text: str) -> Optional[Dict]:
        """Extract JSON from LLM response."""
        text = text.strip()

        # Try direct parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Remove markdown code blocks
        if text.startswith("```"):
            lines = text.split("\n")
            if len(lines) >= 2:
                # Remove first and last lines (``` markers)
                text = "\n".join(lines[1:-1]).strip()
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    pass

        # Look for JSON on its own line
        for line in text.split("\n"):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue

        return None

    def _build_chat_debug(
        self,
        user_message: str,
        system_prompt: str,
        messages: List[Dict],
        env_hint: str,
        chat_history_count: int,
        response_text: str
    ) -> str:
        """Build debug markdown for Chat Persona (Role A)."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        # Estimate tokens
        system_tokens = estimate_tokens(system_prompt)
        messages_tokens = sum(estimate_tokens(m.get("content", "")) for m in messages)
        total_tokens = system_tokens + messages_tokens
        response_tokens = estimate_tokens(response_text)

        lines = [
            "# Chat Persona Debug (Role A)",
            "",
            f"**Generated:** {timestamp}",
            f"**User Message:** {user_message}",
            f"**Estimated Tokens:** {total_tokens} (system: {system_tokens}, messages: {messages_tokens})",
            "",
            "**Context:**",
            f"- Chat history messages: {chat_history_count}",
            f"- Environment lines: {len(env_hint.split(chr(10)))}",
            "",
            "---",
            "",
            "## System Prompt",
            "",
            system_prompt,
            "",
            "---",
            "",
            "## Environment Hint",
            "",
            "```",
            env_hint,
            "```",
            "",
            "---",
            "",
            "## Messages (sent to LLM)",
            "",
        ]

        for i, msg in enumerate(messages):
            role = msg.get("role", "unknown").upper()
            content = msg.get("content", "")
            lines.append(f"### {i+1}. {role}")
            lines.append("")
            lines.append("```")
            lines.append(content)
            lines.append("```")
            lines.append("")

        lines.extend([
            "---",
            "",
            "## LLM Response",
            "",
            f"**Response Tokens:** {response_tokens}",
            "",
            "```json",
            response_text,
            "```",
        ])

        return "\n".join(lines)

    def _build_execute_debug(
        self,
        intent: str,
        system_prompt: str,
        user_content: str,
        capabilities: List[Dict],
        active_tab: Optional[Dict],
        response_text: str
    ) -> str:
        """Build debug markdown for Decision Engine (Role B)."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        # Estimate tokens
        system_tokens = estimate_tokens(system_prompt)
        user_tokens = estimate_tokens(user_content)
        total_tokens = system_tokens + user_tokens
        response_tokens = estimate_tokens(response_text)

        # Calculate capability stats
        cap_scores = [c.get("score", 0) for c in capabilities]
        high_score = max(cap_scores) if cap_scores else 0
        low_score = min(cap_scores) if cap_scores else 0

        lines = [
            "# Decision Engine Debug (Role B)",
            "",
            f"**Generated:** {timestamp}",
            f"**Intent:** {intent}",
            f"**Estimated Tokens:** {total_tokens} (system: {system_tokens}, user: {user_tokens})",
            "",
            "**Retrieved:**",
            f"- Capabilities: {len(capabilities)}",
            f"- Score range: {low_score:.2f} - {high_score:.2f}",
            f"- Active tab: {active_tab.get('title', 'None') if active_tab else 'None'}",
            "",
            "---",
            "",
            "## System Prompt",
            "",
            system_prompt,
            "",
            "---",
            "",
            "## Input (sent to LLM)",
            "",
            "```",
            user_content,
            "```",
            "",
            "---",
            "",
            "## LLM Response",
            "",
            f"**Response Tokens:** {response_tokens}",
            "",
            "```json",
            response_text,
            "```",
        ]

        return "\n".join(lines)

    def clear_state(self):
        """Clear orchestrator flow state."""
        self.state.reset_turn()
        self.state.last_intent = None

    async def close(self):
        """Close underlying HTTP client."""
        await self._client.close()


# ============================================================
# Convenience function for testing
# ============================================================

async def quick_orchestrator_test(
    message: str,
    active_tab: Optional[Dict] = None,
    tabs: Optional[List[Dict]] = None
) -> OrchestratorResult:
    """Quick one-off orchestrator test."""
    orch = PersonaOrchestrator()
    try:
        return await orch.process_message(
            user_message=message,
            active_tab=active_tab,
            tabs=tabs
        )
    finally:
        await orch.close()
