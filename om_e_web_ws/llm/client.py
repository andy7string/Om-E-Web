"""
Om-E LLM Client
===============
Thin async HTTP client for multi-provider LLM calls.

Supports:
    - OpenAI (gpt-4o, gpt-4o-mini, etc.)
    - Anthropic (claude-sonnet, etc.)
    - OpenAI-compatible (LM Studio, Ollama)

Usage:
    client = LLMClient()
    response = await client.chat("You are helpful.", [{"role": "user", "content": "Hello"}])
"""

import os
import json
import httpx
from typing import Optional, List, Dict, Any


# Path to config file
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "llm_config.json")


def load_config() -> dict:
    """Load LLM config from data/llm_config.json"""
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[LLM Client] Error loading config: {e}")
        return {}


def resolve_api_key(key: Optional[str]) -> Optional[str]:
    """Resolve API key - supports $ENV_VAR syntax"""
    if not key:
        return None
    if key.startswith("$"):
        env_var = key[1:]
        return os.environ.get(env_var)
    return key


class LLMClient:
    """
    Async LLM client with multi-provider support.

    Reads config from data/llm_config.json and routes to appropriate provider.
    """

    def __init__(self):
        self.config = load_config()
        self._client = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client"""
        if self._client is None:
            timeout = self.config.get("settings", {}).get("timeout_seconds", 30)
            self._client = httpx.AsyncClient(timeout=timeout)
        return self._client

    async def close(self):
        """Close the HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None

    def get_active_provider(self) -> dict:
        """Get the active provider config"""
        active = self.config.get("active_provider", "openai")
        return self.config.get("providers", {}).get(active, {})

    def get_settings(self) -> dict:
        """Get global settings (temperature, max_tokens, etc.)"""
        return self.config.get("settings", {})

    def reload_config(self):
        """Reload config from disk"""
        self.config = load_config()

    async def chat(
        self,
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        """
        Send a chat completion request to the active LLM provider.

        Args:
            system_prompt: System message for the LLM
            messages: List of {"role": "user"|"assistant", "content": "..."}
            temperature: Override temperature (default from config)
            max_tokens: Override max tokens (default from config)

        Returns:
            Assistant's response text
        """
        provider = self.get_active_provider()
        settings = self.get_settings()

        provider_type = provider.get("type", "openai")
        endpoint = provider.get("endpoint")
        model = provider.get("model")
        api_key = resolve_api_key(provider.get("api_key"))

        temp = temperature if temperature is not None else settings.get("temperature", 0.7)
        tokens = max_tokens if max_tokens is not None else settings.get("max_tokens", 2048)

        if not endpoint:
            raise ValueError("No endpoint configured for provider")

        # Route to appropriate handler
        if provider_type == "anthropic":
            return await self._call_anthropic(endpoint, model, api_key, system_prompt, messages, temp, tokens)
        else:
            # OpenAI and OpenAI-compatible (LM Studio, Ollama)
            return await self._call_openai(endpoint, model, api_key, system_prompt, messages, temp, tokens)

    async def _call_openai(
        self,
        endpoint: str,
        model: str,
        api_key: Optional[str],
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int
    ) -> str:
        """Call OpenAI or OpenAI-compatible endpoint"""
        client = self._get_client()

        # Build messages array with system prompt
        all_messages = [{"role": "system", "content": system_prompt}]
        all_messages.extend(messages)

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        payload = {
            "model": model,
            "messages": all_messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        print(f"[LLM Client] Calling {endpoint} with model {model}")

        response = await client.post(endpoint, headers=headers, json=payload)
        response.raise_for_status()

        data = response.json()
        return data["choices"][0]["message"]["content"]

    async def _call_anthropic(
        self,
        endpoint: str,
        model: str,
        api_key: Optional[str],
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int
    ) -> str:
        """Call Anthropic API"""
        client = self._get_client()

        headers = {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }
        if api_key:
            headers["x-api-key"] = api_key

        payload = {
            "model": model,
            "system": system_prompt,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        print(f"[LLM Client] Calling Anthropic with model {model}")

        response = await client.post(endpoint, headers=headers, json=payload)
        response.raise_for_status()

        data = response.json()
        return data["content"][0]["text"]


# Convenience function for quick one-off calls
async def quick_chat(prompt: str, system: str = "You are a helpful assistant.") -> str:
    """Quick one-off chat without managing client lifecycle"""
    client = LLMClient()
    try:
        return await client.chat(system, [{"role": "user", "content": prompt}])
    finally:
        await client.close()
