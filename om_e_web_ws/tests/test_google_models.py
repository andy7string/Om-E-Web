#!/usr/bin/env python3
"""
Test Google Gemini Models Connectivity
=======================================
Quick test to verify each Gemini model works with the API key.
"""

import asyncio
import httpx

# Your Gemini API key from the screenshot
GEMINI_API_KEY = "AIzaSyAeWdwp9hoRfgD9CtfCe6JxIkn2YePo5KQ"

# Gemini models to test
GEMINI_MODELS = [
    ("gemini-2.0-flash-exp", "Gemini 2.0 Flash (Experimental)"),
    ("gemini-2.0-flash", "Gemini 2.0 Flash"),
    ("gemini-1.5-pro", "Gemini 1.5 Pro"),
    ("gemini-1.5-pro-latest", "Gemini 1.5 Pro (Latest)"),
    ("gemini-1.5-flash", "Gemini 1.5 Flash"),
    ("gemini-1.5-flash-latest", "Gemini 1.5 Flash (Latest)"),
    ("gemini-1.0-pro", "Gemini 1.0 Pro"),
    ("gemini-pro", "Gemini Pro (Alias)"),
]

async def test_model(model_id: str, model_name: str, api_key: str) -> dict:
    """Test a single Gemini model"""

    # Google Gemini API endpoint format
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent"

    # Gemini uses a different payload format
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": "Say exactly one word: 'working'"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 10
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(
                f"{endpoint}?key={api_key}",
                headers={"Content-Type": "application/json"},
                json=payload
            )

            if response.status_code == 200:
                data = response.json()
                # Extract text from Gemini response format
                try:
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                    return {"status": "OK", "response": text.strip(), "model": model_name}
                except (KeyError, IndexError):
                    return {"status": "OK", "response": "(parsed ok)", "model": model_name}
            else:
                error = response.json() if response.text else {}
                error_msg = error.get("error", {}).get("message", response.text[:100])
                return {"status": "FAIL", "error": error_msg, "code": response.status_code, "model": model_name}

        except Exception as e:
            return {"status": "ERROR", "error": str(e), "model": model_name}


async def main():
    """Test all Gemini models"""

    print("=" * 60)
    print("Google Gemini Models Connectivity Test")
    print("=" * 60)
    print(f"API Key: {GEMINI_API_KEY[:10]}...{GEMINI_API_KEY[-4:]}")
    print("-" * 60)

    results = []

    for model_id, model_name in GEMINI_MODELS:
        print(f"\nTesting: {model_name} ({model_id})...")
        result = await test_model(model_id, model_name, GEMINI_API_KEY)
        results.append(result)

        if result["status"] == "OK":
            print(f"  OK - Response: '{result['response'][:50]}'")
        elif result["status"] == "FAIL":
            print(f"  FAIL ({result.get('code')}) - {result['error'][:80]}")
        else:
            print(f"  ERROR - {result['error']}")

        # Small delay between requests
        await asyncio.sleep(0.3)

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
