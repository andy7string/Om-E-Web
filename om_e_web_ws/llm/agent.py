"""
Om-E Agent
==========
Conversational agent with RAG-based prompt building.

Usage:
    agent = OmEAgent()
    response = await agent.chat("scroll down", active_tab={...}, tabs=[...])
    agent.clear_history()
"""

from typing import List, Dict, Optional

try:
    from .client import LLMClient
except ImportError:
    from client import LLMClient

# Import RAG prompt builder
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
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
        tabs: Optional[List[Dict]] = None
    ) -> str:
        """
        Send a message and get a response.

        Uses RAG to build prompt with relevant capabilities and elements.

        Args:
            message: User's message
            active_tab: Current tab info {url, title}
            tabs: List of open tabs [{id, title, url, active}]

        Returns:
            Assistant's response
        """
        # Add user message to history
        self.history.append({"role": "user", "content": message})

        try:
            # Build RAG-based system prompt
            system_prompt = build_system_prompt(
                user_message=message,
                active_tab=active_tab,
                tabs=tabs,
                write_debug=True
            )

            # Get response from LLM
            response = await self._client.chat(
                system_prompt=system_prompt,
                messages=self.history
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
