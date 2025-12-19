#!/usr/bin/env python3
"""
Quick LLMChat Test
==================
Tests the orchestrator via ws_server.py LLMChat endpoint.

Usage:
    python test_llmchat.py "hello"
    python test_llmchat.py "scroll down"
"""
import asyncio
import json
import sys
import websockets


async def test_llmchat(message: str):
    """Send LLMChat message and print response."""
    uri = "ws://localhost:17892"

    try:
        print(f"Connecting to {uri}...")
        async with websockets.connect(uri) as ws:
            print("Connected!")

            # Send LLMChat message
            request = {
                "type": "execute_capability",
                "action": "LLMChat",
                "params": {
                    "message": message
                },
                "id": "test_123"
            }

            print(f"Sending: {message}")
            print("-" * 40)

            await ws.send(json.dumps(request))
            print("Message sent, waiting for response...")

            # Wait for responses (may receive multiple if test client is EXTENSION_WS)
            capability_result = None
            other_messages = []

            for _ in range(5):  # Max 5 messages
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(response)
                    print(f"Received: {response[:200]}...")

                    if data.get("type") == "capability_result":
                        capability_result = data
                        break
                    else:
                        other_messages.append(data)
                except asyncio.TimeoutError:
                    break

            if other_messages:
                print(f"Other messages received: {len(other_messages)}")
                for msg in other_messages:
                    print(f"  - {msg.get('command') or msg.get('type')}: {json.dumps(msg)[:100]}")

            if capability_result:
                print(f"Response OK: {capability_result.get('ok', False)}")
                if capability_result.get("ok"):
                    result = capability_result.get("result", {})
                    print(f"Text: {result.get('response', '')}")
                    print(f"Action type: {result.get('action_type')}")
                    print(f"Action target: {result.get('action_target')}")
                    print(f"Turn state: {result.get('turn_state')}")
                else:
                    print(f"Error: {capability_result.get('error')}")
            else:
                print("No capability_result received!")

    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_llmchat.py \"message\"")
        sys.exit(1)

    message = " ".join(sys.argv[1:])
    asyncio.run(test_llmchat(message))
