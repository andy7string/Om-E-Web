#!/usr/bin/env python3
"""
Simple test script to verify WebSocket server functionality.
This tests the server startup without requiring the extension.
"""

import asyncio
import websockets
import json
import uuid

async def test_server():
    """Test basic WebSocket server functionality."""
    
    # Test 1: Server startup
    print("Testing WebSocket server...")
    
    try:
        # Try to connect to the server
        async with websockets.connect("ws://127.0.0.1:17892") as websocket:
            print("✓ Successfully connected to WebSocket server")
            
            # Test 2: Send a test message
            test_id = f"test-{uuid.uuid4().hex[:8]}"
            test_message = {
                "id": test_id,
                "command": "ping",
                "params": {}
            }
            
            await websocket.send(json.dumps(test_message))
            print("✓ Sent test message")
            
            # Test 3: Wait for response (should timeout since no extension is handling it)
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                print(f"✓ Received response: {response}")
            except asyncio.TimeoutError:
                print("✓ No response (expected - no extension connected)")
                
    except ConnectionRefusedError:
        print("✗ Connection refused - server not running")
        print("  Start the server with: python ws_server.py")
        return False
    except Exception as e:
        print(f"✗ Connection error: {e}")
        return False
    
    return True

async def main():
    """Main test function."""
    print("OM_E_WEB WebSocket Server Test")
    print("=" * 40)
    
    success = await test_server()
    
    print("=" * 40)
    if success:
        print("✓ All tests passed! Server is working correctly.")
        print("\nNext steps:")
        print("1. Load the extension in Chrome")
        print("2. Run: python quick_demo.py")
    else:
        print("✗ Tests failed. Check server status.")
    
    return success

if __name__ == "__main__":
    asyncio.run(main())
