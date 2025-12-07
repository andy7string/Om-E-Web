"""
Quick test for LLM client
"""

import asyncio
from client import LLMClient, quick_chat


async def test_client():
    """Test the LLM client with current config"""
    print("=" * 50)
    print("Testing LLM Client")
    print("=" * 50)

    client = LLMClient()

    # Show active config
    provider = client.get_active_provider()
    settings = client.get_settings()

    print(f"\nActive Provider: {provider.get('name', 'Unknown')}")
    print(f"Endpoint: {provider.get('endpoint')}")
    print(f"Model: {provider.get('model')}")
    print(f"Temperature: {settings.get('temperature')}")
    print(f"Max Tokens: {settings.get('max_tokens')}")
    print()

    # Test a simple chat
    print("Sending test message: 'Say hello in exactly 5 words'")
    print("-" * 50)

    try:
        response = await client.chat(
            system_prompt="You are Om-E, a helpful assistant. Be brief.",
            messages=[{"role": "user", "content": "Say hello in exactly 5 words"}]
        )
        print(f"Response: {response}")
        print("-" * 50)
        print("SUCCESS!")
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(test_client())
