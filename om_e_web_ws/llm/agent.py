"""
Om-E Agent
==========
Conversational agent with history management and page context.

Usage:
    agent = OmEAgent()
    response = await agent.chat("Hello!")
    response = await agent.chat("What's on this page?")  # Has page context
    agent.clear_history()
"""

from typing import List, Dict, Optional
try:
    from .client import LLMClient
    from .prompt import build_system_prompt, clear_action_history
except ImportError:
    from client import LLMClient
    from prompt import build_system_prompt, clear_action_history


class OmEAgent:
    """
    Conversational agent with message history and page context.

    Builds dynamic system prompt with current page context on each call.
    """

    def __init__(self, include_page_context: bool = True):
        """
        Initialize agent.

        Args:
            include_page_context: Include text.md page context in prompt
        """
        self.include_page_context = include_page_context
        self.history: List[Dict[str, str]] = []
        self._client = LLMClient()

    async def chat(self, message: str) -> str:
        """
        Send a message and get a response.

        Builds fresh system prompt with current page context.
        Maintains conversation history for context.

        Args:
            message: User's message

        Returns:
            Assistant's response
        """
        # Add user message to history
        self.history.append({"role": "user", "content": message})

        try:
            # Build dynamic system prompt with current page context
            system_prompt = build_system_prompt(
                include_page_context=self.include_page_context
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
        """Clear conversation history and action history"""
        self.history = []
        clear_action_history()

    def set_page_context(self, enabled: bool):
        """Enable/disable page context in prompts"""
        self.include_page_context = enabled

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
async def quick_agent_chat(message: str, include_page_context: bool = True) -> str:
    """Quick one-off chat without managing agent lifecycle"""
    agent = OmEAgent(include_page_context=include_page_context)
    try:
        return await agent.chat(message)
    finally:
        await agent.close()
