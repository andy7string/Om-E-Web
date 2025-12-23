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
import re
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
    DecisionEngineOutput,
    DecisionType,
    TurnState,
    RiskLevel,
    get_capability_risk,
    estimate_tokens,
)
from .shaping import shape_options
from .metrics import TurnMetrics, log_turn_metrics
from retrieval.chat_context import classify_message, process_and_write_memory
from retrieval.memory_cycle import (
    check_large_payload,
    process_large_payload,
    get_payload_context,
    detect_persistence_intent,
    process_persistence_intent,
    get_facts_for_prompt,
)

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
MAX_CAPABILITY_OPTIONS = 7  # Lean set - LLM can request more if needed

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
    pending_param_input: Optional[Dict] = None  # Awaiting param input (e.g. search query)

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

    def is_awaiting_param_input(self) -> bool:
        """Check if waiting for user to provide a missing parameter."""
        return self.pending_param_input is not None

    def reset_turn(self) -> None:
        """Reset state for a new turn."""
        self.current_turn_state = TurnState.TURN_CHAT_ONLY
        self.pending_intent = None
        self.pending_original_text = None
        self.pending_critical_action = None
        self.pending_critical_context = None
        self.pending_options = None
        self.pending_param_input = None


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
            "chat_persona": "chat_prompt.md",      # Role A - main prompt
            "decision_engine": "executor_prompt.md",  # Role B - callback for edge cases
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
            self._cap_store.load_or_build()  # Auto-rebuilds if source newer than index
        return self._cap_store

    def _get_cap_score_threshold(self) -> float:
        """Get RAG confidence threshold from config. Below this = no caps shown."""
        try:
            config_path = CHATS_DIR.parent / "llm_config.json"
            if config_path.exists():
                with open(config_path) as f:
                    config = json.load(f)
                return config.get("settings", {}).get("cap_score_threshold", 0.45)
        except Exception:
            pass
        return 0.45  # Default

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
        visible_chats: Optional[List[Dict]] = None,
    ) -> OrchestratorResult:
        """
        Process user message through the two-role architecture.

        Args:
            user_message: User's input text
            chat_id: Current chat ID (for loading history from JSON)
            active_tab: Current active tab {url, title}
            tabs: List of open tabs [{id, url, title}, ...]
            orb_theme: Current orb theme for personality injection
            visible_chats: List of visible chats when sidebar is open [{chat_id, title, ...}]

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

        # Check if user is providing a missing parameter
        if self.state.is_awaiting_param_input():
            result = await self._handle_param_input(user_message)
            if result is not None:
                metrics.total_ms = (time.time() - turn_start) * 1000
                await log_turn_metrics(metrics)
                return result

        # 🎨 THEME SHORTCUT: Catch short theme phrases that Role A might miss
        theme_intent = self._detect_theme_shortcut(user_message)
        if theme_intent:
            # Skip Role A, go directly to RAG + Role B with the theme intent
            logger.debug(f"[Orchestrator] Theme shortcut detected: {theme_intent}")
            self.state.transition_to(TurnState.TURN_HANDOFF_PENDING)
            self.state.last_intent = theme_intent
            self.state.pending_original_text = user_message

            t0 = time.time()
            raw_options = await self._query_capabilities(theme_intent)
            metrics.rag_ms = (time.time() - t0) * 1000
            if raw_options:
                metrics.top_score = raw_options[0].get("score", 0)

            shaped_options = shape_options(theme_intent, raw_options, max_options=MAX_CAPABILITY_OPTIONS)

            # Perfect match bypass for theme shortcuts too
            perfect_match = self._check_perfect_match(shaped_options)
            if perfect_match:
                logger.info(f"[Orchestrator] Perfect match bypass (theme): {perfect_match.target}")
                metrics.decision_engine_ms = 0
                metrics.decision_type = perfect_match.decision.value
                metrics.handoff = True
                result = await self._apply_confidence_gating(perfect_match, theme_intent, shaped_options)
                metrics.total_ms = (time.time() - turn_start) * 1000
                await log_turn_metrics(metrics)
                return result

            t0 = time.time()
            decision_output = await self._call_decision_engine(theme_intent, shaped_options, active_tab, tabs, visible_chats)
            metrics.decision_engine_ms = (time.time() - t0) * 1000
            metrics.decision_type = decision_output.decision.value
            metrics.handoff = True

            result = await self._apply_confidence_gating(decision_output, theme_intent, shaped_options)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return result

        # 🔄 VIEW SHORTCUT: Catch view switching phrases that Role A might misinterpret
        view_intent = self._detect_view_shortcut(user_message)
        if view_intent:
            # Skip Role A, go directly to RAG + Role B with the view intent
            logger.info(f"[Orchestrator] View shortcut detected: {view_intent}")
            self.state.transition_to(TurnState.TURN_HANDOFF_PENDING)
            self.state.last_intent = view_intent
            self.state.pending_original_text = user_message

            t0 = time.time()
            raw_options = await self._query_capabilities(view_intent)
            metrics.rag_ms = (time.time() - t0) * 1000
            if raw_options:
                metrics.top_score = raw_options[0].get("score", 0)

            shaped_options = shape_options(view_intent, raw_options, max_options=MAX_CAPABILITY_OPTIONS)

            # Perfect match bypass for view shortcuts too
            perfect_match = self._check_perfect_match(shaped_options)
            if perfect_match:
                logger.info(f"[Orchestrator] Perfect match bypass (view): {perfect_match.target}")
                metrics.decision_engine_ms = 0
                metrics.decision_type = perfect_match.decision.value
                metrics.handoff = True
                result = await self._apply_confidence_gating(perfect_match, view_intent, shaped_options)
                metrics.total_ms = (time.time() - turn_start) * 1000
                await log_turn_metrics(metrics)
                return result

            t0 = time.time()
            decision_output = await self._call_decision_engine(view_intent, shaped_options, active_tab, tabs, visible_chats)
            metrics.decision_engine_ms = (time.time() - t0) * 1000
            metrics.decision_type = decision_output.decision.value
            metrics.handoff = True

            result = await self._apply_confidence_gating(decision_output, view_intent, shaped_options)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return result

        # STEP 1: Call Chat Persona (Role A)
        t0 = time.time()
        persona_output = await self._call_chat_persona(
            user_message, active_tab, tabs, chat_id, orb_theme, visible_chats
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

        # STEP 3.5: Perfect match bypass - skip Role B if top score is 1.00
        perfect_match = self._check_perfect_match(shaped_options)
        if perfect_match:
            logger.info(f"[Orchestrator] Perfect match bypass: {perfect_match.target}")
            metrics.decision_engine_ms = 0
            metrics.decision_type = perfect_match.decision.value
            result = await self._apply_confidence_gating(perfect_match, intent, shaped_options)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return result

        # STEP 4: Call Decision Engine (Role B)
        t0 = time.time()
        decision_output = await self._call_decision_engine(intent, shaped_options, active_tab, tabs, visible_chats)
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
        visible_chats: Optional[List[Dict]] = None,
    ) -> ChatPersonaOutput:
        """
        Call Chat Persona role with rolling history.

        Returns:
            ChatPersonaOutput (either ChatPersonaReply or ChatPersonaHandoff)
        """
        # Build environment hint (includes visible chats when sidebar open)
        env_hint = self._build_environment_hint(active_tab, tabs, visible_chats, chat_id)

        # Get rolling history from JSON file (also triggers summarize-on-rollout)
        chat_history = await self._get_rolling_history(chat_id)

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
        tabs: Optional[List[Dict]],
        visible_chats: Optional[List[Dict]] = None,
        current_chat_id: Optional[str] = None
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
            # Formatting hint for tabs
            lines.append("Format tabs as clickable: [Tab Name](tab://NUMBER)")

        # 📚 Visible chats (when sidebar is open in HUD mode)
        if visible_chats:
            lines.append("")
            lines.append(f"Chats ({len(visible_chats)} visible):")
            for i, chat in enumerate(visible_chats, 1):
                chat_title = chat.get("title", "Untitled")[:40]
                msg_count = chat.get("message_count", 0)
                # Mark current chat
                if current_chat_id and chat.get("chat_id") == current_chat_id:
                    lines.append(f"- {i}. \"{chat_title}\" ({msg_count} msgs) ← CURRENT")
                else:
                    lines.append(f"- {i}. \"{chat_title}\" ({msg_count} msgs)")
            # Formatting hint for chats
            lines.append("Format chats as clickable: [Chat Title](chat://NUMBER)")

        return "\n".join(lines) if lines else "No tab info"

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL for display."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.netloc or "unknown"
        except:
            return "unknown"

    def _detect_theme_shortcut(self, message: str) -> Optional[str]:
        """
        🎨 Detect short theme phrases that Role A might miss.
        Returns normalized intent string if detected, None otherwise.
        """
        msg_lower = message.lower().strip()

        # Theme name mapping (user phrase → theme param)
        THEME_MAP = {
            "ome": "robot",
            "om-e": "robot",
            "robot": "robot",
            "kawaii": "kawaii",
            "atom": "atom",
            "minimal": "minimal",
            "ghost": "ghost",
            "bunny": "bunny",
        }

        # Patterns: "be X", "become X", "change to X", "switch to X"
        patterns = [
            r"^be\s+(\w+)$",           # "be ome", "be kawaii"
            r"^become\s+(\w+)$",       # "become atom"
            r"^change\s+to\s+(\w+)$",  # "change to kawaii"
            r"^switch\s+to\s+(\w+)$",  # "switch to atom"
        ]

        for pattern in patterns:
            match = re.match(pattern, msg_lower)
            if match:
                theme_word = match.group(1)
                if theme_word in THEME_MAP:
                    theme_param = THEME_MAP[theme_word]
                    return f"change theme to '{theme_param}'"

        return None

    def _detect_view_shortcut(self, message: str) -> Optional[str]:
        """
        🔄 Detect view switching phrases that Role A might misinterpret.
        Returns normalized intent string if detected, None otherwise.

        These exact phrases bypass Role A to prevent context confusion
        (e.g. user talking about a chat named "view" then saying "switch view").
        """
        msg_lower = message.lower().strip()

        # Exact phrases that mean "switch view"
        VIEW_PHRASES = {
            # Direct commands
            "switch view", "toggle view", "swap view", "change view",
            # Mode names - browser/orb = floating view, hud/chat = fullscreen
            "orb mode", "hud mode", "chat mode", "nav mode",
            "orb view", "hud view", "chat view",
            "browser mode", "browser view",  # browser = orb/floating view
            "full chat", "full chat view", "fullscreen mode",
            "floating mode", "mini mode", "compact mode",
            # Actions
            "go to orb", "go to hud", "go to browser",
            "switch to orb", "switch to hud", "switch to browser",
            "exit hud", "close hud", "show hud", "hide hud",
            "toggle hud", "hud on", "hud off",
        }

        if msg_lower in VIEW_PHRASES:
            logger.debug(f"[Orchestrator] View shortcut detected: {msg_lower}")
            return "switch between HUD and orb view"

        return None

    async def _get_rolling_history(
        self,
        chat_id: Optional[str],
        max_messages: int = 0
    ) -> List[Dict]:
        """
        Get rolling chat history from JSON file within message limit.

        Uses action/content separation:
        - Summary: rolling summary of older content (if available)
        - Actions: from session JSON (cross-chat)
        - Content: last N messages (configurable via rolling_messages_limit)
        - Rollout: Messages outside limit are indexed in session vector

        Source of truth is data/chats/{chat_id}.json
        """
        if not chat_id:
            return []

        # Get message limit from config - uses session_actions_limit for both actions AND messages
        if max_messages <= 0:
            try:
                config_path = CHATS_DIR.parent / "llm_config.json"
                if config_path.exists():
                    with open(config_path) as f:
                        config = json.load(f)
                    max_messages = config.get("settings", {}).get("session_actions_limit", 10)
                else:
                    max_messages = 10
            except Exception:
                max_messages = 10

        chat_path = CHATS_DIR / f"{chat_id}.json"
        if not chat_path.exists():
            return []

        try:
            with open(chat_path) as f:
                chat_data = json.load(f)

            messages = chat_data.get("messages", [])
            summaries = chat_data.get("summaries", {})

            # Filter to content messages only (actions come from session JSON now)
            content = [msg for msg in messages if classify_message(msg) != 'action']

            # Build history
            history = []

            # 1. Include rolling summary if available
            rolling_summary = summaries.get("rolling")
            if rolling_summary:
                history.append({
                    "role": "system",
                    "content": f"[Chat summary: {rolling_summary}]"
                })

            # 2. Add recent SESSION actions - spans ALL chats in session
            # This is the cross-chat bridge - actions from any chat visible in prompt
            # Uses session_actions_limit from config (default 20)
            from retrieval.memory_cycle import format_session_actions_for_prompt
            actions_text = format_session_actions_for_prompt()  # Uses config limit
            if actions_text:
                actions_text = f"[{actions_text}]"
                print(f"[Session] Actions for prompt")
                history.append({
                    "role": "system",
                    "content": actions_text
                })

            # 3. Add recent content (last N messages from config)
            recent_content = content[-max_messages:] if len(content) > max_messages else content
            for msg in recent_content:
                history.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })

            # Messages included in rolling window
            included_count = len(recent_content)

            # 4. SUMMARIZE-ON-ROLLOUT: Index old messages that didn't make the budget
            # These messages are outside the rolling window - summarize and index them
            included_count = len(recent_content)
            total_content = len(content)
            if total_content > included_count:
                old_messages = content[:total_content - included_count]
                await self._summarize_and_index_old_messages(
                    chat_id, chat_data, old_messages
                )

            return history

        except Exception as e:
            logger.warning(f"Failed to load chat history: {e}")
            return []

    async def _summarize_and_index_old_messages(
        self,
        chat_id: str,
        chat_data: Dict,
        old_messages: List[Dict]
    ) -> None:
        """
        Summarize messages that rolled out of the context window and index them.

        @param chat_id: Current chat ID
        @param chat_data: Full chat data dict
        @param old_messages: Messages outside the rolling window
        """
        from retrieval.session_content_store import get_session_content_store

        # Get tracking state - which messages have we already summarized?
        context_state = chat_data.get("context_state", {})
        summarized_up_to = context_state.get("summarized_up_to_index", 0)

        # Find messages that haven't been summarized yet
        all_messages = chat_data.get("messages", [])
        unsummarized = []

        for i, msg in enumerate(old_messages):
            # Find this message's index in the full message list
            try:
                msg_index = all_messages.index(msg)
                if msg_index >= summarized_up_to:
                    unsummarized.append((msg_index, msg))
            except ValueError:
                continue

        if not unsummarized:
            return

        # Index each unsummarized message in session vector
        store = get_session_content_store()
        chat_title = chat_data.get("title", "Untitled")
        indexed_count = 0

        for msg_index, msg in unsummarized:
            content = msg.get("content", "")
            role = msg.get("role", "user")
            timestamp = msg.get("timestamp", "")

            # Skip short/noise content
            if len(content) < 20:
                continue

            # Index in session vector (will be chunked automatically)
            store.add(content, chat_id, chat_title, role, timestamp)
            indexed_count += 1

        # Update tracking - mark these as summarized
        if unsummarized:
            max_summarized_index = max(idx for idx, _ in unsummarized) + 1
            context_state["summarized_up_to_index"] = max_summarized_index
            chat_data["context_state"] = context_state

            # Save updated chat data
            chat_path = CHATS_DIR / f"{chat_id}.json"
            with open(chat_path, 'w') as f:
                json.dump(chat_data, f, indent=2)

            logger.info(f"[RAG Rollout] Indexed {indexed_count} old messages from chat {chat_id}")

    # --------------------------------------------------------
    # RAG Retrieval
    # --------------------------------------------------------

    async def _query_capabilities(self, intent: str) -> List[Dict]:
        """
        Query capabilities store for matching options.
        Always includes capabilities marked with always_include: true.

        Returns list of dicts with: label, description, params, example, score
        """
        try:
            cap_store = self._get_cap_store()
            results = cap_store.search(intent, k=MAX_CAPABILITY_OPTIONS, threshold=0.3)

            options = []
            seen_labels = set()

            # First add always_include capabilities (they come first)
            always_caps = cap_store.get_always_include_capabilities()
            for cap in always_caps:
                options.append(cap)
                seen_labels.add(cap['label'])

            # Then add search results (skip duplicates)
            for r in results:
                label = r.metadata.get("name", "Unknown")
                if label in seen_labels:
                    continue  # Skip if already added as always_include

                cap_data = {
                    "label": label,
                    "description": r.metadata.get("description", ""),
                    "group": r.metadata.get("group", ""),
                    "example": r.metadata.get("example", ""),
                    "params": r.metadata.get("params", {}),
                    "score": r.score
                }
                options.append(cap_data)
                seen_labels.add(label)

            return options

        except Exception as e:
            logger.warning(f"Capabilities query error: {e}")
            return []

    def _check_perfect_match(self, options: List[Dict]) -> Optional[DecisionEngineOutput]:
        """
        Check if top option is a perfect match (score >= 0.99).
        If so, bypass Role B and return decision directly.

        Only bypasses for paramless capabilities - if the capability needs
        params (like OpenTab needing url), we must call Role B to extract them.

        Returns DecisionEngineOutput if perfect match, None otherwise.
        """
        if not options:
            return None

        top = options[0]
        top_score = top.get("score", 0)

        # Must be essentially 1.00 (accounts for float precision)
        if top_score < 0.99:
            return None

        # Check if capability has params - if so, need Role B to extract them
        top_params = top.get("params", {})
        if top_params:
            # Has params - can't bypass, need Role B to extract values
            return None

        # Perfect match with no params - safe to bypass Role B
        target = top.get("label", "")

        logger.info(f"[PerfectMatch] Bypassing Role B: {target} (score={top_score:.2f}, no params)")

        return DecisionEngineOutput(
            decision=DecisionType.CAP,
            target=target,
            params={}
        )

    # --------------------------------------------------------
    # Role B: Decision Engine
    # --------------------------------------------------------

    async def _call_decision_engine(
        self,
        intent: str,
        capabilities: List[Dict],
        active_tab: Optional[Dict],
        tabs: Optional[List[Dict]] = None,
        visible_chats: Optional[List[Dict]] = None
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

        # 🗂️ Include tabs context for tab operations (CloseTab, SwitchTab)
        if tabs:
            lines.append("")
            lines.append("Tabs:")
            active_id = active_tab.get("id") if active_tab else None
            for tab in tabs[:8]:  # Limit to 8 tabs
                tab_num = tab.get("stable_num", "?")
                tab_title = tab.get("title", "Untitled")[:40]
                tab_domain = self._extract_domain(tab.get("url", ""))
                marker = " -- ACTIVE" if tab.get("id") == active_id else ""
                lines.append(f"- Tab {tab_num}: \"{tab_title}\" ({tab_domain}){marker}")

        # 📚 Include visible chats for chat operations (SetCurrentChat, DeleteChat, etc.)
        if visible_chats:
            lines.append("")
            lines.append("Chats:")
            current_chat_id = self.state.current_chat_id
            for i, chat in enumerate(visible_chats, 1):
                chat_title = chat.get("title", "Untitled")[:40]
                marker = " -- CURRENT" if current_chat_id and chat.get("chat_id") == current_chat_id else ""
                lines.append(f"- Chat {i}: \"{chat_title}\"{marker}")
            lines.append("(Use chat NUMBER for params: {\"chat\": 3} or name: {\"name\": \"show\"})")

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
    # Unified Single-Call (Role A + B merged)
    # --------------------------------------------------------

    async def _call_unified(
        self,
        user_message: str,
        capabilities: List[Dict],
        active_tab: Optional[Dict],
        tabs: Optional[List[Dict]],
        chat_id: Optional[str] = None,
        orb_theme: Optional[str] = None,
        visible_chats: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Single LLM call - builds prompt from chat_prompt.md + injected context.

        Returns dict with type: reply | action | clarify | options | cannot | noop
        """
        # Build from Role A base (chat_prompt.md), not a separate unified template
        system_prompt = self._prompt_cache.get("chat_persona", "")

        # Inject orb personality if available
        if orb_theme and orb_theme in self._orb_profiles:
            profile = self._orb_profiles[orb_theme]
            personality_inject = f"""
YOUR PERSONALITY
You are {profile.get('name', 'Orb')}. {profile.get('personality', '')}
Tone: {profile.get('tone', 'helpful')}
Example phrases: {', '.join(profile.get('example_phrases', []))}
"""
            system_prompt = system_prompt + "\n" + personality_inject

        # Build environment section
        env_lines = []
        if active_tab:
            env_lines.append(f"Page: {active_tab.get('title', 'Unknown')} ({active_tab.get('url', '')})")

        if tabs:
            env_lines.append("")
            env_lines.append("Tabs (currently open):")
            active_id = active_tab.get("id") if active_tab else None
            for tab in tabs[:8]:
                tab_num = tab.get("stable_num", "?")
                tab_title = tab.get("title", "Untitled")[:40]
                tab_domain = self._extract_domain(tab.get("url", ""))
                marker = " ← ACTIVE" if tab.get("id") == active_id else ""
                env_lines.append(f"  {tab_num}. {tab_title} ({tab_domain}){marker}")

        if visible_chats:
            env_lines.append("")
            env_lines.append(f"Chats (current names - use these, not history):")
            current_chat_id = self.state.current_chat_id
            for i, chat in enumerate(visible_chats, 1):
                chat_title = chat.get("title", "Untitled")[:40]
                msg_count = chat.get("message_count", 0)
                date_short = chat.get("date_short", "")
                marker = " ← CURRENT" if current_chat_id and chat.get("chat_id") == current_chat_id else ""
                date_part = f" [{date_short}]" if date_short else ""
                env_lines.append(f"  {i}. {chat_title} ({msg_count} msgs){date_part}{marker}")

        # Build capabilities section - include full description for param constraints
        cap_lines = []
        if capabilities:
            cap_lines.append("Capabilities:")
            for cap in capabilities:
                label = cap['label']
                desc = cap.get('description', '')
                params = cap.get('params', {})
                example = cap.get('example', '')

                cap_lines.append(f"- {label}: {desc}")
                if example:
                    cap_lines.append(f"  ex: {example}")
                if params:
                    # Include full param info with valid values
                    param_parts = [f"{k}: {v}" for k, v in params.items()]
                    cap_lines.append(f"  params: {', '.join(param_parts)}")

        # Get rolling history (also triggers summarize-on-rollout)
        chat_history = await self._get_rolling_history(chat_id)

        # Build messages
        messages = []
        for msg in chat_history:
            messages.append(msg)

        # Build user content
        user_content_parts = []
        if env_lines:
            user_content_parts.append("ENVIRONMENT (current state - use these for actions)\n" + "\n".join(env_lines))
        if cap_lines:
            user_content_parts.append("\n".join(cap_lines))

        # Add relevant payload context (stored large content)
        payload_ctx = get_payload_context(user_message, chat_id)
        if payload_ctx:
            user_content_parts.append(payload_ctx)

        # Add relevant user facts (persistent memory)
        facts_ctx = get_facts_for_prompt(user_message)
        if facts_ctx:
            user_content_parts.append(facts_ctx)

        # Add session context (cross-chat content from this session)
        from retrieval.session_content_store import get_session_context
        session_ctx = get_session_context(user_message, current_chat_id=chat_id)
        if session_ctx:
            user_content_parts.append(session_ctx)

        user_content_parts.append(f"USER: {user_message}")

        user_content = "\n\n".join(user_content_parts)
        messages.append({"role": "user", "content": user_content})

        try:
            # Capture timing around LLM call
            llm_start = time.time()
            response_text = await self._client.chat(
                system_prompt=system_prompt,
                messages=messages,
                temperature=0.1,
                max_tokens=500
            )
            llm_elapsed_ms = (time.time() - llm_start) * 1000

            # Write debug file
            debug_content = self._build_unified_debug(
                user_message=user_message,
                system_prompt=system_prompt,
                messages=messages,
                capabilities=capabilities,
                response_text=response_text,
                llm_elapsed_ms=llm_elapsed_ms
            )
            _write_debug_file("llm_unified.md", debug_content)

            # Parse JSON response
            json_data = self._extract_json(response_text)
            if json_data:
                return json_data

        except Exception as e:
            logger.warning(f"Unified call error: {e}")

        # Fallback
        return {"type": "cannot", "text": "I couldn't understand that."}

    def _build_unified_debug(
        self,
        user_message: str,
        system_prompt: str,
        messages: List[Dict],
        capabilities: List[Dict],
        response_text: str,
        llm_elapsed_ms: float = 0
    ) -> str:
        """Build debug markdown for unified call showing full message list."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        system_tokens = estimate_tokens(system_prompt)
        messages_tokens = sum(estimate_tokens(m.get("content", "")) for m in messages)

        lines = [
            "# Unified LLM Call Debug",
            "",
            f"**Generated:** {timestamp}",
            f"**User Message:** {user_message}",
            f"**Messages:** {len(messages)}",
            f"**Capabilities:** {len(capabilities)}",
            f"**Tokens:** ~{system_tokens + messages_tokens} (system: {system_tokens}, messages: {messages_tokens})",
            f"**LLM Time:** {llm_elapsed_ms:.0f}ms",
            "",
            "## System Prompt",
            "```",
            system_prompt,
            "```",
            "",
            "## Messages (sent to LLM)",
            "",
        ]

        # Show all messages sent to LLM
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
            "## Response",
            "```json",
            response_text,
            "```",
        ])
        return "\n".join(lines)

    async def process_message_unified(
        self,
        user_message: str,
        chat_id: Optional[str] = None,
        active_tab: Optional[Dict] = None,
        tabs: Optional[List[Dict]] = None,
        orb_theme: Optional[str] = None,
        visible_chats: Optional[List[Dict]] = None,
    ) -> OrchestratorResult:
        """
        UNIFIED: Single LLM call for chat + action.
        """
        metrics = TurnMetrics(
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            chat_id=chat_id or "unknown"
        )
        turn_start = time.time()
        self.state.current_chat_id = chat_id

        # Check special states (critical confirmation, escalation, options, params)
        if self.state.is_awaiting_critical_confirmation():
            result = await self._handle_critical_confirmation(user_message)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return result

        if self.state.is_awaiting_deep_scan_consent():
            result = await self._handle_escalation_consent(user_message)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return result

        if self.state.is_awaiting_option_selection():
            result = await self._handle_option_selection(user_message)
            if result is not None:
                metrics.total_ms = (time.time() - turn_start) * 1000
                await log_turn_metrics(metrics)
                return result

        if self.state.is_awaiting_param_input():
            result = await self._handle_param_input(user_message)
            if result is not None:
                metrics.total_ms = (time.time() - turn_start) * 1000
                await log_turn_metrics(metrics)
                return result

        # STEP 0: Handle large payloads - summarize and store in vector
        prompt_message = user_message
        if check_large_payload(user_message):
            prompt_message = await process_large_payload(user_message, chat_id)
            logger.info(f"[Orchestrator] Large payload processed: {len(user_message)} -> {len(prompt_message)} chars")

        # STEP 0.5: Check for persistence intent - store facts for long-term memory
        if detect_persistence_intent(user_message):
            stored_fact = await process_persistence_intent(user_message, chat_id)
            if stored_fact:
                logger.info(f"[Orchestrator] Stored fact: {stored_fact}")

        # STEP 1: RAG retrieval (always)
        t0 = time.time()
        raw_options = await self._query_capabilities(user_message)
        metrics.rag_ms = (time.time() - t0) * 1000

        # Only inject capabilities if RAG found confident matches
        # This saves ~200 tokens on chat-only turns
        # Threshold is tunable via settings UI
        cap_threshold = self._get_cap_score_threshold()
        top_score = raw_options[0].get("score", 0) if raw_options else 0
        metrics.top_score = top_score

        if top_score >= cap_threshold:
            shaped_options = shape_options(user_message, raw_options, max_options=MAX_CAPABILITY_OPTIONS)
        else:
            shaped_options = []  # Chat-only - no caps needed

        # STEP 2: Single unified LLM call (use prompt_message for large payload handling)
        t0 = time.time()
        output = await self._call_unified(
            prompt_message, shaped_options, active_tab, tabs, chat_id, orb_theme, visible_chats
        )
        metrics.chat_persona_ms = (time.time() - t0) * 1000  # Reuse field for unified call

        # STEP 3: Handle output type
        output_type = output.get("type", "reply")
        metrics.decision_type = output_type

        if output_type == "reply":
            self.state.transition_to(TurnState.TURN_CHAT_ONLY)
            metrics.handoff = False
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return OrchestratorResult(
                response_text=output.get("text", ""),
                turn_state=TurnState.TURN_CHAT_ONLY,
                action_executed=False
            )

        elif output_type == "action":
            metrics.handoff = True
            cap_name = output.get("cap", "")
            params = output.get("params", {})

            # Check if LLM made up a capability not in retrieved options
            known_caps = {opt.get("action") for opt in shaped_options}
            if cap_name and cap_name not in known_caps:
                # RAG resolve: query the made-up name to find the real capability
                logger.info(f"Unknown cap '{cap_name}' - RAG resolving...")
                resolved = await self._query_capabilities(cap_name)
                if resolved and resolved[0].get("score", 0) > 0.5:
                    real_cap = resolved[0].get("action", cap_name)
                    logger.info(f"Resolved '{cap_name}' → '{real_cap}'")
                    cap_name = real_cap

            self.state.transition_to(TurnState.TURN_EXECUTING)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return OrchestratorResult(
                response_text=f"Executing {cap_name}...",
                turn_state=TurnState.TURN_EXECUTING,
                action_type="cap",
                action_target=cap_name,
                action_params=params,
                action_executed=True
            )

        elif output_type == "clarify":
            self.state.transition_to(TurnState.TURN_COMPLETED)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return OrchestratorResult(
                response_text=output.get("text", "Could you clarify?"),
                turn_state=TurnState.TURN_COMPLETED,
                action_type="clarify"
            )

        elif output_type == "options":
            options_list = output.get("options", [])
            self.state.pending_options = options_list
            self.state.transition_to(TurnState.TURN_COMPLETED)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)

            # Format options for display
            option_text = output.get("text", "Which one?")
            for i, opt in enumerate(options_list, 1):
                option_text += f"\n{i}. {opt.get('label', opt.get('cap', 'Option'))}"

            return OrchestratorResult(
                response_text=option_text,
                turn_state=TurnState.TURN_COMPLETED
            )

        elif output_type == "search":
            # LLM wants more capabilities - query RAG with its suggested term
            search_query = output.get("query", user_message)
            logger.info(f"LLM requested more caps with query: {search_query}")

            # Query RAG with LLM's search term
            more_options = await self._query_capabilities(search_query)
            if more_options:
                # Merge with existing, dedup by action name
                existing_actions = {opt.get("action") for opt in shaped_options}
                for opt in more_options:
                    if opt.get("action") not in existing_actions:
                        shaped_options.append(opt)

                # Cap at 12 total for expanded search
                shaped_options = shaped_options[:12]

                # Retry with expanded caps
                output = await self._call_unified(
                    prompt_message, shaped_options, active_tab, tabs, chat_id, orb_theme, visible_chats
                )
                output_type = output.get("type", "reply")

                # Handle the new output (recursive-ish but only one level)
                if output_type == "reply":
                    self.state.transition_to(TurnState.TURN_CHAT_ONLY)
                    metrics.total_ms = (time.time() - turn_start) * 1000
                    await log_turn_metrics(metrics)
                    return OrchestratorResult(
                        response_text=output.get("text", ""),
                        turn_state=TurnState.TURN_CHAT_ONLY,
                        action_executed=False
                    )
                elif output_type == "action":
                    cap_name = output.get("cap", "")
                    params = output.get("params", {})
                    self.state.transition_to(TurnState.TURN_EXECUTING)
                    metrics.total_ms = (time.time() - turn_start) * 1000
                    await log_turn_metrics(metrics)
                    return OrchestratorResult(
                        response_text=f"Executing {cap_name}...",
                        turn_state=TurnState.TURN_EXECUTING,
                        action_type="cap",
                        action_target=cap_name,
                        action_params=params,
                        action_executed=True
                    )

            # Fallback if search didn't help
            self.state.transition_to(TurnState.TURN_COMPLETED)
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return OrchestratorResult(
                response_text="I couldn't find a matching capability. Could you rephrase?",
                turn_state=TurnState.TURN_COMPLETED,
                action_type="clarify"
            )

        elif output_type == "noop":
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return OrchestratorResult(
                response_text=output.get("text", "Already done."),
                turn_state=TurnState.TURN_COMPLETED,
                action_type="noop"
            )

        else:  # cannot or unknown
            metrics.total_ms = (time.time() - turn_start) * 1000
            await log_turn_metrics(metrics)
            return OrchestratorResult(
                response_text=output.get("text", "I can't do that."),
                turn_state=TurnState.TURN_COMPLETED
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

        elif decision.decision == DecisionType.CLARIFY:
            # Missing required param - ask user for it
            prompt_text = decision.prompt or f"What {decision.missing} would you like?"
            return OrchestratorResult(
                response_text=prompt_text,
                turn_state=TurnState.TURN_COMPLETED,
                action_type="clarify"
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
                "label": opt.label,
                "params": opt.params or {}  # Store params for execution
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

    async def _handle_param_input(
        self,
        user_message: str
    ) -> Optional[OrchestratorResult]:
        """
        Handle user providing a missing parameter value.
        Called when a capability returned needs_input asking for a required param.
        """
        pending = self.state.pending_param_input
        if not pending:
            return None

        capability = pending.get("capability", "")
        param_name = pending.get("param", "")

        # User's message IS the param value
        param_value = user_message.strip()

        # Clear pending state
        self.state.pending_param_input = None

        if not param_value:
            self.state.reset_turn()
            return OrchestratorResult(
                response_text="Cancelled.",
                turn_state=TurnState.TURN_COMPLETED,
                action_executed=False
            )

        # Execute capability with the filled-in param
        params = {param_name: param_value}
        decision = DecisionEngineOutput(
            decision=DecisionType.CAP,
            target=capability,
            params=params
        )
        return await self._handle_cap_decision(decision, f"{capability} with {param_name}={param_value}")

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
                    # Execute the selected capability with stored params
                    params = dict(selected.get("params", {}))

                    # For chat operations without params, use current chat
                    if opt_target in ["DeleteChat", "RenameChat"] and not params and self.state.current_chat_id:
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

        # Remove markdown code blocks (handles nested blocks like ```json\n```json\n{...}\n```\n```)
        # Remove ALL ``` lines and language tags like "json"
        lines = text.split("\n")
        cleaned_lines = []
        for line in lines:
            stripped = line.strip()
            # Skip markdown fence lines (```, ```json, etc.)
            if stripped.startswith("```"):
                continue
            # Skip standalone language tags that might appear after nested ```
            if stripped in ("json", "javascript", "python", ""):
                continue
            cleaned_lines.append(line)

        if cleaned_lines:
            cleaned_text = "\n".join(cleaned_lines).strip()
            try:
                return json.loads(cleaned_text)
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
