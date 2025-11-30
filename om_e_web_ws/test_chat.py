#!/usr/bin/env python3
"""
🧪 Chat Storage Test Script

Tests the chat_user_message handler in ws_server.py.
Run this AFTER starting the WebSocket server.

Usage:
    python test_chat.py
"""

import asyncio
import websockets
import json


async def test_chat():
    uri = "ws://localhost:17892"

    print("🔌 Connecting to WebSocket server...")
    async with websockets.connect(uri) as ws:
        print("✅ Connected\n")

        # ============================================================
        # TEST 1: Create new chat (chat_id = null)
        # ============================================================
        print("=" * 60)
        print("TEST 1: Create new chat")
        print("=" * 60)

        payload1 = {
            "type": "chat_user_message",
            "chat_id": None,
            "data": {
                "prompt": "Hello this is my first message",
                "page_url": "https://example.com/test",
                "page_title": "Test Page"
            }
        }

        print(f"📤 Sending: {json.dumps(payload1, indent=2)}")
        await ws.send(json.dumps(payload1))

        response1 = await ws.recv()
        response1_data = json.loads(response1)
        print(f"📥 Received: {json.dumps(response1_data, indent=2)}")

        # Extract chat_id for next test
        chat_id = response1_data.get("chat_id")
        print(f"\n🆔 Chat ID: {chat_id}\n")

        # ============================================================
        # TEST 2: Append to existing chat
        # ============================================================
        print("=" * 60)
        print("TEST 2: Append to existing chat")
        print("=" * 60)

        payload2 = {
            "type": "chat_user_message",
            "chat_id": chat_id,
            "data": {
                "prompt": "This is my second message in the same chat"
            }
        }

        print(f"📤 Sending: {json.dumps(payload2, indent=2)}")
        await ws.send(json.dumps(payload2))

        response2 = await ws.recv()
        response2_data = json.loads(response2)
        print(f"📥 Received: {json.dumps(response2_data, indent=2)}")

        # ============================================================
        # TEST 3: Error case - missing prompt
        # ============================================================
        print("\n" + "=" * 60)
        print("TEST 3: Error case - missing prompt")
        print("=" * 60)

        payload3 = {
            "type": "chat_user_message",
            "chat_id": None,
            "data": {}
        }

        print(f"📤 Sending: {json.dumps(payload3, indent=2)}")
        await ws.send(json.dumps(payload3))

        response3 = await ws.recv()
        response3_data = json.loads(response3)
        print(f"📥 Received: {json.dumps(response3_data, indent=2)}")

        # ============================================================
        # SUMMARY
        # ============================================================
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"✅ Chat created: {chat_id}")
        print(f"📁 Check file: om_e_web_ws/chats/{chat_id}.json")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_chat())
