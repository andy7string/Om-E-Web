#!/usr/bin/env python3
"""
Test script for executing capabilities and sending chat messages via WebSocket.

Usage:
    # Execute capability directly
    python3 om_e_web_ws/tests/test_capability.py --capability ListTabs
    python3 om_e_web_ws/tests/test_capability.py --capability OpenTab --params '{"url": "google.com"}'

    # Send chat message (goes through LLM orchestrator)
    python3 om_e_web_ws/tests/test_capability.py --message "what tabs do I have open?"
    python3 om_e_web_ws/tests/test_capability.py -m "hello there"
"""

import asyncio
import websockets
import json
import argparse
import sys
import time

WS_URL = "ws://localhost:17892"
TIMEOUT = 15  # seconds (LLM calls can take a few seconds)


async def execute_capability(capability: str, params: dict | None = None) -> dict | None:
    """Send capability execution request to ws_server."""
    params = params or {}

    try:
        async with websockets.connect(WS_URL) as ws:
            request = {
                "type": "execute_capability",
                "action": capability,
                "params": params,
                "request_id": f"test_{capability}_{int(time.time()*1000)}"
            }

            print(f"📤 Sending: {json.dumps(request, indent=2)}")
            await ws.send(json.dumps(request))

            try:
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                print(f"\n📥 Response:")
                print(json.dumps(data, indent=2))
                return data
            except asyncio.TimeoutError:
                print(f"❌ Timeout after {TIMEOUT}s waiting for response")
                return None

    except ConnectionRefusedError:
        print(f"❌ Cannot connect to {WS_URL} - is the server running?")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


async def send_chat_message(message: str, chat_id: str | None = None) -> dict | None:
    """Send chat message through LLM orchestrator (full flow test)."""
    try:
        async with websockets.connect(WS_URL) as ws:
            # Use LLMChat capability to send through orchestrator
            request = {
                "type": "execute_capability",
                "action": "LLMChat",
                "params": {
                    "message": message,
                    "chat_id": chat_id
                },
                "request_id": f"test_chat_{int(time.time()*1000)}"
            }

            print(f"💬 Sending message: \"{message}\"")
            print(f"📤 Request: {json.dumps(request, indent=2)}")
            start = time.time()
            await ws.send(json.dumps(request))

            try:
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                elapsed = (time.time() - start) * 1000
                data = json.loads(response)
                print(f"\n📥 Response ({elapsed:.0f}ms):")
                print(json.dumps(data, indent=2))
                return data
            except asyncio.TimeoutError:
                print(f"❌ Timeout after {TIMEOUT}s waiting for response")
                return None

    except ConnectionRefusedError:
        print(f"❌ Cannot connect to {WS_URL} - is the server running?")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Test capabilities and chat messages")
    parser.add_argument("--capability", "-c", help="Capability name (e.g., ListTabs)")
    parser.add_argument("--params", "-p", default="{}", help="JSON params for capability")
    parser.add_argument("--message", "-m", help="Chat message to send through LLM")
    parser.add_argument("--chat-id", help="Optional chat ID for message")
    args = parser.parse_args()

    # Must specify either capability or message
    if not args.capability and not args.message:
        print("❌ Must specify --capability (-c) or --message (-m)")
        parser.print_help()
        sys.exit(1)

    print(f"🧪 Test Script")
    print(f"   Server: {WS_URL}\n")

    if args.message:
        # Send chat message through LLM
        print(f"📝 Mode: Chat Message (LLM flow)")
        result = asyncio.run(send_chat_message(args.message, args.chat_id))
    else:
        # Execute capability directly
        print(f"⚡ Mode: Direct Capability Execution")
        try:
            params = json.loads(args.params)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON params: {e}")
            sys.exit(1)

        print(f"   Capability: {args.capability}")
        if params:
            print(f"   Params: {params}")
        print()

        result = asyncio.run(execute_capability(args.capability, params))

    if result:
        print("\n✅ Success")
    else:
        print("\n❌ Failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
