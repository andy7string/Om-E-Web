"""
Quick test for Om-E Agent
"""

import asyncio
from agent import OmEAgent


async def test_agent():
    """Test agent with multi-turn conversation"""
    print("=" * 50)
    print("Testing Om-E Agent")
    print("=" * 50)

    agent = OmEAgent()

    try:
        # First message
        print("\n[User]: My name is Andy")
        response1 = await agent.chat("My name is Andy")
        print(f"[Om-E]: {response1}")
        print(f"(History: {agent.get_history_length()} messages)")

        # Second message - tests context retention
        print("\n[User]: What's my name?")
        response2 = await agent.chat("What's my name?")
        print(f"[Om-E]: {response2}")
        print(f"(History: {agent.get_history_length()} messages)")

        print("\n" + "-" * 50)
        print("SUCCESS - Agent maintains conversation context!")

    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        await agent.close()


if __name__ == "__main__":
    asyncio.run(test_agent())
