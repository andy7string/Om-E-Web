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
import asyncio
import time
from datetime import datetime
import httpx
from typing import Optional, List, Dict, Any
import tiktoken


# Path to config file
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "llm_config.json")

# Path to debug log file
DEBUG_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "llm_debug.md")

# Global request counter (persists across client instances)
_request_count = 0

# Global token counter (cumulative for session)
_total_tokens = 0


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


def count_tokens(messages: List[Dict], model: str = "gpt-4") -> dict:
    """Count tokens in messages using tiktoken"""
    try:
        # Use cl100k_base for GPT-4 and GPT-3.5-turbo models
        encoding = tiktoken.get_encoding("cl100k_base")

        system_tokens = 0
        user_tokens = 0
        assistant_tokens = 0

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            tokens = len(encoding.encode(content))

            if role == "system":
                system_tokens += tokens
            elif role == "user":
                user_tokens += tokens
            elif role == "assistant":
                assistant_tokens += tokens

        # Add overhead for message formatting (~4 tokens per message)
        overhead = len(messages) * 4
        total = system_tokens + user_tokens + assistant_tokens + overhead

        return {
            "system": system_tokens,
            "user": user_tokens,
            "assistant": assistant_tokens,
            "overhead": overhead,
            "total": total
        }
    except Exception as e:
        return {"error": str(e), "total": 0}


def log_request(endpoint: str, model: str, payload: dict, provider: str):
    """Log API request to debug markdown file - formatted for readability"""
    global _request_count, _total_tokens
    _request_count += 1

    # Count tokens
    messages = payload.get("messages", [])
    tokens = count_tokens(messages, model)
    _total_tokens += tokens.get("total", 0)

    # Context window sizes by model (in k) - ordered longest match first
    context_windows = [
        ("gpt-4.1-mini", 1047),
        ("gpt-4.1", 1047),
        ("gpt-4o-mini", 128),
        ("gpt-4o", 128),
        ("gpt-4-turbo", 128),
        ("gpt-4-32k", 32),
        ("gpt-4", 8),
        ("gpt-3.5-turbo", 16),
        ("claude-sonnet", 200),
        ("claude-opus", 200),
        ("claude-3", 200),
    ]

    # Get context window for this model
    model_name = payload.get('model', '').lower()
    context_k = 128  # Default assumption
    for key, val in context_windows:
        if key in model_name:
            context_k = val
            break

    total_tokens = tokens.get('total', 0)
    context_used_k = total_tokens / 1000
    context_pct = (total_tokens / (context_k * 1000)) * 100

    # Build readable format
    max_tokens_value = payload.get("max_tokens")
    if max_tokens_value is None:
        max_tokens_value = payload.get("max_completion_tokens")
    if max_tokens_value is None:
        max_tokens_value = payload.get("max_output_tokens")

    lines = [
        f"# LLM Request #{_request_count}",
        f"",
        f"**Model:** {payload.get('model')}",
        f"**Temperature:** {payload.get('temperature')}",
        f"**Max Tokens:** {max_tokens_value}",
        f"**Request Tokens:** {tokens.get('total', 0):,}",
        f"**Context:** {context_used_k:.1f}k / {context_k}k ({context_pct:.1f}%)",
        f"**Session Tokens:** {_total_tokens:,}",
        f"",
        f"---",
        f"",
    ]

    # Format each message
    for i, msg in enumerate(messages):
        role = msg.get("role", "unknown").upper()
        content = msg.get("content", "")
        token_count = len(tiktoken.get_encoding("cl100k_base").encode(content))

        lines.append(f"## {role} ({token_count:,} tokens)")
        lines.append("")
        lines.append(content)  # Actual content with real newlines
        lines.append("")
        lines.append("---")
        lines.append("")

    # Write formatted output
    try:
        with open(DEBUG_LOG_PATH, 'w', encoding='utf-8') as f:
            f.write("\n".join(lines))

        print(f"[LLM Client] Request #{_request_count} | {tokens.get('total', 0):,} tokens | Session: {_total_tokens:,}")
    except Exception as e:
        print(f"[LLM Client] Failed to log request: {e}")


class LLMClient:
    """
    Async LLM client with multi-provider support.

    Reads config from data/llm_config.json and routes to appropriate provider.
    """

    def __init__(self):
        self.config = load_config()
        self._client = None
        self._last_request_time = 0.0  # Track last request for throttling
        self._min_interval = 1.0       # Minimum 1 second between requests

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client"""
        if self._client is None:
            timeout = self.config.get("settings", {}).get("timeout_seconds", 30)
            self._client = httpx.AsyncClient(timeout=timeout)
        return self._client

    async def _throttle(self):
        """Ensure minimum interval between requests (1 req/sec)"""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            wait_time = self._min_interval - elapsed
            print(f"[LLM Client] Throttling: waiting {wait_time:.2f}s")
            await asyncio.sleep(wait_time)
        self._last_request_time = time.time()

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
        if not model:
            raise ValueError("No model configured for provider")

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

        # GPT-5 series and o-series reasoning models use max_completion_tokens.
        # Keep compatibility with OpenAI/OpenAI-compatible endpoints that reject max_tokens for these models.
        uses_completion_tokens = any(x in model.lower() for x in ['gpt-5', 'o3', 'o1'])

        # OpenAI GPT-5/o-series often require the Responses API schema.
        # Keep this scoped to api.openai.com so OpenAI-compatible servers (LM Studio/Ollama) are unaffected.
        endpoint_lower = (endpoint or "").lower()
        is_official_openai = "api.openai.com" in endpoint_lower
        is_responses_endpoint = endpoint_lower.rstrip("/").endswith("/v1/responses")
        is_chat_completions_endpoint = endpoint_lower.rstrip("/").endswith("/v1/chat/completions")
        use_responses_api = is_official_openai and (is_responses_endpoint or (uses_completion_tokens and is_chat_completions_endpoint))

        if use_responses_api:
            # If the user configured chat/completions, transparently switch to /v1/responses for GPT-5/o-series.
            responses_endpoint = endpoint
            if is_chat_completions_endpoint:
                responses_endpoint = endpoint.rsplit("/v1/chat/completions", 1)[0] + "/v1/responses"
            return await self._call_openai_responses(
                endpoint=responses_endpoint,
                model=model,
                api_key=api_key,
                system_prompt=system_prompt,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )

        payload = {
            "model": model,
            "messages": all_messages,
            "temperature": temperature,
        }

        if uses_completion_tokens:
            payload["max_completion_tokens"] = max_tokens
        else:
            payload["max_tokens"] = max_tokens

        print(f"[LLM Client] Calling {endpoint} with model {model}")

        # Log request to debug file
        log_request(endpoint, model, payload, "OpenAI")

        # Throttle to 1 request per second
        await self._throttle()

        response = await client.post(endpoint, headers=headers, json=payload)
        try:
            response.raise_for_status()
        except Exception as e:
            # Print OpenAI error body for faster debugging (no secrets in body)
            try:
                print(f"[LLM Client] OpenAI error response: {response.text}")
            except Exception:
                pass
            raise e

        data = response.json()
        return data["choices"][0]["message"]["content"]

    async def _call_openai_responses(
        self,
        endpoint: str,
        model: str,
        api_key: Optional[str],
        system_prompt: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int
    ) -> str:
        """
        Call OpenAI Responses API (/v1/responses).

        Uses:
        - instructions: system prompt
        - input: message list (user/assistant history)
        - max_output_tokens: output token cap
        """
        client = self._get_client()

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        # Some models (notably GPT-5) reject temperature on the Responses API.
        model_lower = (model or "").lower()
        supports_temperature = not any(x in model_lower for x in ["gpt-5", "o3", "o1"])

        payload = {
            "model": model,
            "instructions": system_prompt,
            "input": messages,
            "max_output_tokens": max_tokens,
        }

        if supports_temperature:
            payload["temperature"] = temperature

        print(f"[LLM Client] Calling {endpoint} with model {model} (responses API)")
        log_request(endpoint, model, payload, "OpenAI")

        await self._throttle()

        response = await client.post(endpoint, headers=headers, json=payload)
        try:
            response.raise_for_status()
        except Exception as e:
            try:
                print(f"[LLM Client] OpenAI error response: {response.text}")
            except Exception:
                pass
            raise e

        data = response.json()

        # Prefer convenience field when present
        if isinstance(data, dict) and isinstance(data.get("output_text"), str):
            return data["output_text"]

        # Fallback: try to extract text from output array
        try:
            output = data.get("output") or []
            for item in output:
                if isinstance(item, dict) and item.get("type") == "message":
                    content = item.get("content") or []
                    for c in content:
                        if isinstance(c, dict) and c.get("type") in ("output_text", "text"):
                            t = c.get("text")
                            if isinstance(t, str) and t.strip():
                                return t
        except Exception:
            pass

        raise ValueError("Responses API: Could not extract output text")

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

        # Log request to debug file
        log_request(endpoint, model, payload, "Anthropic")

        # Throttle to 1 request per second
        await self._throttle()

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
