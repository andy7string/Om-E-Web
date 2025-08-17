#!/usr/bin/env python3
"""
Test script for all open tabs
"""
import asyncio
import websockets
import json

async def test_all_tabs():
    """Test generateSiteMap on all open tabs"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            
            # Test 1: Google
            print("\n🧪 TEST 1: Google Tab")
            print("📤 Sending generateSiteMap to Google tab...")
            await websocket.send(json.dumps({
                'id': 'test_google',
                'command': 'generateSiteMap'
            }))
            
            print("⏳ Waiting for Google response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok') and result.get('result'):
                url = result['result'].get('metadata', {}).get('url', 'Unknown')
                elements = result['result'].get('statistics', {}).get('totalElements', 0)
                print(f"✅ Google: {url}")
                print(f"📊 Elements: {elements}")
            else:
                print(f"❌ Google failed: {result.get('error', 'Unknown error')}")
            
            # Wait a moment between tests
            await asyncio.sleep(2)
            
            # Test 2: YouTube
            print("\n🧪 TEST 2: YouTube Tab")
            print("📤 Sending generateSiteMap to YouTube tab...")
            await websocket.send(json.dumps({
                'id': 'test_youtube',
                'command': 'generateSiteMap'
            }))
            
            print("⏳ Waiting for YouTube response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok') and result.get('result'):
                url = result['result'].get('metadata', {}).get('url', 'Unknown')
                elements = result['result'].get('statistics', {}).get('totalElements', 0)
                print(f"✅ YouTube: {url}")
                print(f"📊 Elements: {elements}")
            else:
                print(f"❌ YouTube failed: {result.get('error', 'Unknown error')}")
            
            # Wait a moment between tests
            await asyncio.sleep(2)
            
            # Test 3: Gmail
            print("\n🧪 TEST 3: Gmail Tab")
            print("📤 Sending generateSiteMap to Gmail tab...")
            await websocket.send(json.dumps({
                'id': 'test_gmail',
                'command': 'generateSiteMap'
            }))
            
            print("⏳ Waiting for Gmail response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok') and result.get('result'):
                url = result['result'].get('metadata', {}).get('url', 'Unknown')
                elements = result['result'].get('statistics', {}).get('totalElements', 0)
                print(f"✅ Gmail: {url}")
                print(f"📊 Elements: {elements}")
            else:
                print(f"❌ Gmail failed: {result.get('error', 'Unknown error')}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    print("🧪 Testing All Open Tabs")
    print("=" * 50)
    asyncio.run(test_all_tabs())
