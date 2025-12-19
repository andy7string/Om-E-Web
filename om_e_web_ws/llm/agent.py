"""
Om-E Agent
==========
Conversational agent with RAG-based prompt building.

Usage:
    agent = OmEAgent()
    response = await agent.chat("scroll down", active_tab={...}, tabs=[...])
    agent.clear_history()
"""

import sys
import os
import json
from pathlib import Path
from typing import List, Dict, Optional

# Add parent dir to path for sibling package imports
_parent_dir = os.path.dirname(os.path.dirname(__file__))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from llm.client import LLMClient
from retrieval.query import build_system_prompt

# 🧪 TWO-ROLE MODE: Enable to test Role A (Chat Persona) before full orchestrator
TWO_ROLE_MODE = True  # Set False to revert to original behavior

# Path to chat prompt
CHAT_PROMPT_PATH = Path(__file__).parent.parent / "data" / "prompts" / "chat_prompt.md"


def _load_chat_prompt() -> str:
    """Load chat_prompt.md content."""
    with open(CHAT_PROMPT_PATH, 'r', encoding='utf-8') as f:
        return f.read()


def _build_environment_context(active_tab: Optional[Dict], tabs: Optional[List[Dict]]) -> str:
    """Build environment context for Role A prompt."""
    lines = []
    if active_tab:
        lines.append(f"**URL:** {active_tab.get('url', 'Unknown')}")
        lines.append(f"**Title:** {active_tab.get('title', 'Unknown')}")
    if tabs:
        lines.append("")
        lines.append("**Tabs:**")
        for tab in tabs[:5]:  # Max 5 tabs
            marker = " -- ACTIVE TAB" if tab.get('active') else ""
            title = tab.get('title', 'Untitled')[:40]
            lines.append(f"- Tab {tab.get('number', '?')}: \"{title}\"{marker}")
    return "\n".join(lines) if lines else "No tab info"


class OmEAgent:
    """
    Conversational agent with RAG-based prompt building.

    Uses semantic search to retrieve relevant capabilities and elements.
    """

    def __init__(self):
        """Initialize agent."""
        self.history: List[Dict[str, str]] = []
        self._client = LLMClient()
        self._chat_prompt_cache: Optional[str] = None

    async def chat(
        self,
        message: str,
        active_tab: Optional[Dict] = None,
        tabs: Optional[List[Dict]] = None,
        hud_state: Optional[Dict] = None,
        rag_context: Optional[Dict] = None,
        current_chat_id: Optional[str] = None
    ) -> str:
        """
        Send a message and get a response.

        Uses RAG to build prompt with relevant capabilities, elements, and memory.

        Args:
            message: User's message
            active_tab: Current tab info {url, title}
            tabs: List of open tabs [{id, title, url, active}]
            hud_state: HUD state {sidebar_open, visible_chats} for context
            rag_context: Pre-retrieved RAG results (skips RAG query if provided)
                         {capabilities: [...], elements: [...]}
            current_chat_id: Current chat ID (to exclude from memory search)

        Returns:
            Assistant's response
        """
        # 🧪 TWO-ROLE MODE: Test Role A (Chat Persona) classification
        if TWO_ROLE_MODE and not rag_context:
            return await self._chat_two_role(
                message, active_tab, tabs, hud_state, current_chat_id
            )

        # Original single-role behavior
        return await self._chat_single_role(
            message, active_tab, tabs, hud_state, rag_context, current_chat_id
        )

    async def _chat_two_role(
        self,
        message: str,
        active_tab: Optional[Dict],
        tabs: Optional[List[Dict]],
        hud_state: Optional[Dict],
        current_chat_id: Optional[str]
    ) -> str:
        """
        🧪 Two-role mode: Role A classifies, then falls back to existing system if handoff.
        """
        # Load chat prompt (cached)
        if not self._chat_prompt_cache:
            self._chat_prompt_cache = _load_chat_prompt()

        # Build environment context
        env_context = _build_environment_context(active_tab, tabs)

        # Inject environment into prompt
        system_prompt = self._chat_prompt_cache.replace(
            "ENVIRONMENT (injected at runtime)\nYou will be given the current URL, page title, and open tabs.\nUse this only to interpret references like \"here\", \"this page\", or \"that tab\".",
            f"ENVIRONMENT\n{env_context}"
        )

        # Add user message to history
        self.history.append({"role": "user", "content": message})

        try:
            # Build messages with recent history (last 6 messages for context)
            # This lets Role A understand follow-ups like "list them"
            recent_history = self.history[-6:].copy()  # Last 6 messages including current

            # Append JSON reminder to current message to prevent format drift
            # (History may contain plain text replies which can confuse the model)
            if recent_history and recent_history[-1].get("role") == "user":
                recent_history[-1] = {
                    "role": "user",
                    "content": recent_history[-1]["content"] + "\n\n(Respond with JSON only)"
                }

            print(f"🧪 TWO-ROLE: Calling Role A with {len(recent_history)} messages (latest: {message[:50]}...)")

            # Call Role A (Chat Persona)
            response = await self._client.chat(
                system_prompt=system_prompt,
                messages=recent_history,
                temperature=0.1,
                max_tokens=500
            )

            # Parse JSON response
            try:
                data = json.loads(response.strip())
            except json.JSONDecodeError as e:
                print(f"🧪 TWO-ROLE: Role A returned invalid JSON: {e}")
                print(f"🧪 TWO-ROLE: Raw response: {response[:200]}")
                # Fall back to returning raw response
                self.history.append({"role": "assistant", "content": response})
                return response

            # Handle handoff=false (conversational reply)
            if not data.get("handoff"):
                reply = data.get("reply", "I'm not sure how to respond.")
                print(f"🧪 TWO-ROLE: Role A replied (no handoff): {reply[:50]}...")
                self.history.append({"role": "assistant", "content": reply})
                return reply

            # Handle handoff=true (action request)
            intent = data.get("intent", message)
            original_text = data.get("original_text", message)
            print(f"🧪 TWO-ROLE: Role A handed off intent: {intent}")

            # Remove the user message we added (will be re-added by single-role)
            self.history.pop()

            # Call existing system with normalized intent
            # This gives us full RAG + capability execution
            return await self._chat_single_role(
                intent,  # Use normalized intent instead of original message
                active_tab, tabs, hud_state, None, current_chat_id
            )

        except Exception as e:
            # Remove failed user message from history
            if self.history and self.history[-1].get("content") == message:
                self.history.pop()
            raise e

    async def _chat_single_role(
        self,
        message: str,
        active_tab: Optional[Dict],
        tabs: Optional[List[Dict]],
        hud_state: Optional[Dict],
        rag_context: Optional[Dict],
        current_chat_id: Optional[str]
    ) -> str:
        """Original single-role chat behavior."""
        # Add user message to history
        self.history.append({"role": "user", "content": message})

        try:
            # If rag_context provided, build minimal prompt (skip RAG query)
            if rag_context:
                system_prompt = "You are Om-E. Execute the requested action using ONLY the capabilities below.\n\n"
                if rag_context.get("capabilities"):
                    system_prompt += "**Available Capabilities:**\n"
                    for cap in rag_context["capabilities"]:
                        system_prompt += f"- {cap['label']}: `{cap['example']}`\n"
                system_prompt += "\nOutput the JSON command on its own line. Use ONLY capabilities listed above."
                print(f"🔍 FINDCMD: Using pre-retrieved RAG context ({len(rag_context.get('capabilities', []))} caps)")
            else:
                # Build RAG-based system prompt (without live state - that goes at the end)
                # Includes proactive memory retrieval for context from past conversations
                system_prompt = build_system_prompt(
                    user_message=message,
                    active_tab=None,  # Don't include in system prompt
                    tabs=None,        # Don't include in system prompt
                    hud_state=hud_state,
                    write_debug=True,
                    current_chat_id=current_chat_id
                )

            # Build live state suffix (appended to last user message for recency)
            live_state = "\n\n---\n**LIVE STATE (USE THIS, NOT EARLIER CONVERSATION):**\n"
            if active_tab:
                live_state += f"Active Tab: {active_tab.get('title', 'Unknown')}\n"
                live_state += f"URL: {active_tab.get('url', 'Unknown')}\n"
            if tabs:
                live_state += "Open Tabs:\n"
                for tab in tabs:
                    marker = " ← active" if tab.get('active') else ""
                    live_state += f"- Tab {tab.get('number', '?')}: {tab.get('title', 'Unknown')}{marker}\n"

            # Create messages with live state appended to last user message
            messages_with_context = self.history.copy()
            if messages_with_context:
                last_msg = messages_with_context[-1]
                if last_msg.get("role") == "user":
                    messages_with_context[-1] = {
                        "role": "user",
                        "content": last_msg["content"] + live_state
                    }

            # Get response from LLM
            response = await self._client.chat(
                system_prompt=system_prompt,
                messages=messages_with_context
            )

            # Add assistant response to history
            self.history.append({"role": "assistant", "content": response})

            return response

        except Exception as e:
            # Remove failed user message from history
            self.history.pop()
            raise e

    def clear_history(self):
        """Clear conversation history"""
        self.history = []

    def get_history(self) -> List[Dict[str, str]]:
        """Get copy of conversation history"""
        return self.history.copy()

    def get_history_length(self) -> int:
        """Get number of messages in history"""
        return len(self.history)

    async def close(self):
        """Close underlying HTTP client"""
        await self._client.close()

    def reload_config(self):
        """Reload LLM config from disk"""
        self._client.reload_config()


# Convenience function for one-off agent sessions
async def quick_agent_chat(
    message: str,
    active_tab: Optional[Dict] = None,
    tabs: Optional[List[Dict]] = None
) -> str:
    """Quick one-off chat without managing agent lifecycle"""
    agent = OmEAgent()
    try:
        return await agent.chat(message, active_tab=active_tab, tabs=tabs)
    finally:
        await agent.close()
