"""
Om-E Agent
==========
Conversational agent with history management.

Usage:
    agent = OmEAgent()
    response = await agent.chat("Hello!")
    response = await agent.chat("What did I just say?")  # Has context
    agent.clear_history()
"""

from typing import List, Dict, Optional
try:
    from .client import LLMClient
except ImportError:
    from client import LLMClient


# Default system prompt for Om-E
DEFAULT_SYSTEM_PROMPT = """You are Om-E, a helpful AI assistant integrated into a browser extension.

Your role:
- Help users navigate and interact with web pages
- Answer questions about page content
- Assist with tasks and provide clear, concise responses

Style:
- Be friendly but professional
- Keep responses brief unless detail is requested
- Use Australian English spelling when applicable
"""


class OmEAgent:
    """
    Conversational agent with message history.

    Maintains conversation context across multiple exchanges.
    """

    def __init__(self, system_prompt: Optional[str] = None):
        """
        Initialize agent.

        Args:
            system_prompt: Custom system prompt (uses default if None)
        """
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self.history: List[Dict[str, str]] = []
        self._client = LLMClient()

    async def chat(self, message: str) -> str:
        """
        Send a message and get a response.

        Maintains conversation history for context.

        Args:
            message: User's message

        Returns:
            Assistant's response
        """
        # Add user message to history
        self.history.append({"role": "user", "content": message})

        try:
            # Get response from LLM
            response = await self._client.chat(
                system_prompt=self.system_prompt,
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

    def set_system_prompt(self, prompt: str):
        """Update system prompt (doesn't clear history)"""
        self.system_prompt = prompt

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
async def quick_agent_chat(message: str, system_prompt: Optional[str] = None) -> str:
    """Quick one-off chat without managing agent lifecycle"""
    agent = OmEAgent(system_prompt)
    try:
        return await agent.chat(message)
    finally:
        await agent.close()
