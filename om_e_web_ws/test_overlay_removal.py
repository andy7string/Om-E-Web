#!/usr/bin/env python3
"""
Test script for overlay removal functionality
"""
import asyncio
import websockets
import json

async def test_overlay_removal():
    """Test the generateSiteMap command with overlay removal"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            
            # Test generateSiteMap with overlay removal (extension already active)
            print("\n🧪 Testing generateSiteMap with overlay removal...")
            site_map_command = {
                'id': 'test_overlay_removal',
                'command': 'generateSiteMap'
            }
            
            print(f"📤 Sending command: {site_map_command['command']}")
            await websocket.send(json.dumps(site_map_command))
            
            # Wait for response
            print("⏳ Waiting for response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            print("📥 Response received!")
            print(f"✅ Success: {result.get('ok', False)}")
            
            if result.get('ok') and result.get('result'):
                stats = result['result'].get('statistics', {})
                print(f"📊 Elements found: {stats.get('totalElements', 0)}")
                print(f"⏱️ Processing time: {result['result'].get('metadata', {}).get('processingTime', 0):.2f}ms")
                
                # Check if overlay removal worked
                if 'overlayRemoval' in result['result']:
                    print(f"🧹 Overlays removed: {result['result']['overlayRemoval']}")
                else:
                    print("🧹 Overlay removal info not found in response")
            else:
                print(f"❌ Error: {result.get('error', 'Unknown error')}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    print("🧪 Testing Overlay Removal Functionality")
    print("=" * 50)
    asyncio.run(test_overlay_removal())
