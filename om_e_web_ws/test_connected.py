#!/usr/bin/env python3
"""
Test script that connects to the running WebSocket server.
"""

import asyncio
import websockets
import json
import uuid

async def test_connected_server():
    print("🧪 Testing Connection to Running Server...")
    
    try:
        # Connect to the running server
        async with websockets.connect("ws://127.0.0.1:17892") as websocket:
            print("✅ Connected to server!")
            
            # Test 1: Navigate to example.com
            print("\n1. Navigating to example.com...")
            navigate_msg = {
                "id": f"nav-{uuid.uuid4().hex[:8]}",
                "command": "navigate",
                "params": {"url": "https://example.com"}
            }
            
            print(f"   📤 Sending to server: {json.dumps(navigate_msg)}")
            await websocket.send(json.dumps(navigate_msg))
            print("   Command sent, waiting for response...")
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                result = json.loads(response)
                print(f"   Response: {result}")
            except asyncio.TimeoutError:
                print("   ⏰ No response received (timeout)")
            
            # Wait a moment for page to load
            await asyncio.sleep(2)
            
            # Test 2: Wait for h1 element
            print("\n2. Waiting for h1 element...")
            wait_msg = {
                "id": f"wait-{uuid.uuid4().hex[:8]}",
                "command": "waitFor",
                "params": {"selector": "h1"}
            }
            
            print(f"   📤 Sending to server: {json.dumps(wait_msg)}")
            await websocket.send(json.dumps(wait_msg))
            print("   Command sent, waiting for response...")
            
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                result = json.loads(response)
                print(f"   Response: {result}")
            except asyncio.TimeoutError:
                print("   ⏰ No response received (timeout)")
            
            print("\n✅ Test completed!")
            
    except ConnectionRefusedError:
        print("❌ Could not connect to server")
        print("Make sure the server is running: python ws_server.py")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_connected_server())
