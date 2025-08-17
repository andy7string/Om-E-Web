#!/usr/bin/env python3
"""
Simple test client for internal server test methods
"""
import asyncio
import websockets
import json

async def test_internal_methods():
    """Test the internal test methods in ws_server.py"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            
            # Test 1: Internal test_dynamic_tabs
            print("\n🧪 TEST 1: Internal test_dynamic_tabs")
            await websocket.send(json.dumps({
                'id': 'test_internal_1',
                'command': 'test_dynamic_tabs'
            }))
            
            response = await websocket.recv()
            result = json.loads(response)
            print(f"📥 Response: {result}")
            
            # Wait a moment
            await asyncio.sleep(2)
            
            # Test 2: Internal test_all_tabs
            print("\n🧪 TEST 2: Internal test_all_tabs")
            await websocket.send(json.dumps({
                'id': 'test_internal_2',
                'command': 'test_all_tabs'
            }))
            
            response = await websocket.recv()
            result = json.loads(response)
            print(f"📥 Response: {result}")
            
            print("\n✅ Internal tests completed! Check server console for results.")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    print("🧪 Testing Internal Server Methods")
    print("=" * 50)
    asyncio.run(test_internal_methods())
