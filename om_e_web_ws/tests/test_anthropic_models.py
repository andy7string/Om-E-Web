#!/usr/bin/env python3
"""
Test Anthropic Models Connectivity
==================================
Quick test to verify each Anthropic model works with the API key.
"""

import asyncio
import httpx
import json
import os
import sys

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from llm.client import load_config, resolve_api_key

# All Anthropic models to test
ANTHROPIC_MODELS = [
    ("claude-opus-4-20250514", "Claude Opus 4 (Flagship)"),
    ("claude-sonnet-4-20250514", "Claude Sonnet 4"),
    ("claude-sonnet-4-5-20250929", "Claude 4.5 Sonnet"),
    ("claude-3-7-sonnet-20250219", "Claude 3.7 Sonnet"),
    ("claude-3-5-sonnet-latest", "Claude 3.5 Sonnet"),
    ("claude-3-5-haiku-20241022", "Claude 3.5 Haiku"),
    ("claude-3-opus-20240229", "Claude 3 Opus"),
    ("claude-3-haiku-20240307", "Claude 3 Haiku"),
]

async def test_model(model_id: str, model_name: str, endpoint: str, api_key: str) -> dict:
    """Test a single model with a simple request"""

    headers = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": api_key
    }

    payload = {
        "model": model_id,
        "system": "You are a helpful assistant. Reply with exactly one word.",
        "messages": [{"role": "user", "content": "Say 'working' if you can hear me."}],
        "temperature": 0.0,
        "max_tokens": 10
    }

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(endpoint, headers=headers, json=payload)

            if response.status_code == 200:
                data = response.json()
                text = data.get("content", [{}])[0].get("text", "")
                return {"status": "OK", "response": text.strip(), "model": model_name}
            else:
                error = response.json() if response.text else {}
                error_msg = error.get("error", {}).get("message", response.text[:100])
                return {"status": "FAIL", "error": error_msg, "code": response.status_code, "model": model_name}

        except Exception as e:
            return {"status": "ERROR", "error": str(e), "model": model_name}


async def main():
    """Test all Anthropic models"""

    print("=" * 60)
    print("Anthropic Models Connectivity Test")
    print("=" * 60)

    # Load config
    config = load_config()
    anthropic_config = config.get("providers", {}).get("anthropic", {})

    endpoint = anthropic_config.get("endpoint", "https://api.anthropic.com/v1/messages")
    api_key = resolve_api_key(anthropic_config.get("api_key"))

    if not api_key:
        print("ERROR: No Anthropic API key configured")
        return

    print(f"Endpoint: {endpoint}")
    print(f"API Key: {api_key[:10]}...{api_key[-4:]}")
    print("-" * 60)

    results = []

    for model_id, model_name in ANTHROPIC_MODELS:
        print(f"\nTesting: {model_name} ({model_id})...")
        result = await test_model(model_id, model_name, endpoint, api_key)
        results.append(result)

        if result["status"] == "OK":
            print(f"  OK - Response: '{result['response']}'")
        elif result["status"] == "FAIL":
            print(f"  FAIL ({result.get('code')}) - {result['error']}")
        else:
            print(f"  ERROR - {result['error']}")

        # Small delay between requests
        await asyncio.sleep(0.5)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    ok_count = sum(1 for r in results if r["status"] == "OK")
    fail_count = sum(1 for r in results if r["status"] == "FAIL")
    error_count = sum(1 for r in results if r["status"] == "ERROR")

    print(f"OK: {ok_count} | FAIL: {fail_count} | ERROR: {error_count}")
    print()

    for result in results:
        status_icon = {"OK": "OK", "FAIL": "FAIL", "ERROR": "ERR"}[result["status"]]
        print(f"  [{status_icon}] {result['model']}")


if __name__ == "__main__":
    asyncio.run(main())
