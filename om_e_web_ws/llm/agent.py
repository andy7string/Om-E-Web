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
from typing import List, Dict, Optional

# Add parent dir to path for sibling package imports
_parent_dir = os.path.dirname(os.path.dirname(__file__))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

from llm.client import LLMClient
from retrieval.query import build_system_prompt


class OmEAgent:
    """
    Conversational agent with RAG-based prompt building.

    Uses semantic search to retrieve relevant capabilities and elements.
    """

    def __init__(self):
        """Initialize agent."""
        self.history: List[Dict[str, str]] = []
        self._client = LLMClient()

    async def chat(
        self,
        message: str,
        active_tab: Optional[Dict] = None,
        tabs: Optional[List[Dict]] = None,
        hud_state: Optional[Dict] = None,
        rag_context: Optional[Dict] = None
    ) -> str:
        """
        Send a message and get a response.

        Uses RAG to build prompt with relevant capabilities and elements.

        Args:
            message: User's message
            active_tab: Current tab info {url, title}
            tabs: List of open tabs [{id, title, url, active}]
            hud_state: HUD state {sidebar_open, visible_chats} for context
            rag_context: Pre-retrieved RAG results (skips RAG query if provided)
                         {capabilities: [...], elements: [...]}

        Returns:
            Assistant's response
        """
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
                system_prompt = build_system_prompt(
                    user_message=message,
                    active_tab=None,  # Don't include in system prompt
                    tabs=None,        # Don't include in system prompt
                    hud_state=hud_state,
                    write_debug=True
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
