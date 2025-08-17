#!/usr/bin/env python3
"""
Test script for dynamic tab detection
"""
import asyncio
import websockets
import json

async def test_dynamic_tabs():
    """Test that generateSiteMap command goes to the correct active tab"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            
            # Test generateSiteMap command
            print("\n🧪 Testing generateSiteMap command routing...")
            site_map_command = {
                'id': 'test_dynamic_tabs',
                'command': 'generateSiteMap'
            }
            
            print(f"📤 Sending command: {site_map_command['command']}")
            print("🎯 This should be sent to the currently ACTIVE tab (Gmail)")
            await websocket.send(json.dumps(site_map_command))
            
            # Wait for response
            print("⏳ Waiting for response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            print("📥 Response received!")
            print(f"✅ Success: {result.get('ok', False)}")
            
            if result.get('ok') and result.get('result'):
                metadata = result['result'].get('metadata', {})
                url = metadata.get('url', 'Unknown')
                print(f"🌐 Scanned URL: {url}")
                print(f"📊 Elements found: {result['result'].get('statistics', {}).get('totalElements', 0)}")
                print(f"⏱️ Processing time: {metadata.get('processingTime', 0):.2f}ms")
                
                # Check if this was scanned from Gmail
                if 'gmail.com' in url:
                    print("✅ SUCCESS: Command was sent to Gmail tab!")
                else:
                    print(f"⚠️ Command was sent to: {url}")
            else:
                print(f"❌ Error: {result.get('error', 'Unknown error')}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    print("🧪 Testing Dynamic Tab Detection")
    print("=" * 50)
    asyncio.run(test_dynamic_tabs())
