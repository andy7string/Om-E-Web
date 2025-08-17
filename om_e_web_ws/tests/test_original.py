#!/usr/bin/env python3
"""
🧪 Test Original Site Map

Testing if the original generateSiteMap still works
"""

import asyncio
import json
import websockets

async def test_original():
    """Test the original generateSiteMap function"""
    uri = 'ws://127.0.0.1:17892'
    
    try:
        async with websockets.connect(uri) as ws:
            print("🔌 Connected to WebSocket server")
            
            # Test the original site map function
            print("\n🧪 Testing generateSiteMap (original)...")
            await ws.send(json.dumps({
                'id': 'test', 
                'command': 'generateSiteMap'
            }))
            
            response = await ws.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                data = result.get('result', {})
                print(f"\n✅ Original Site Map Generated Successfully!")
                print(f"📊 Total Elements: {data.get('statistics', {}).get('totalElements', 0)}")
                print(f"🔍 Interactive Elements: {len(data.get('interactiveElements', []))}")
            else:
                print(f"❌ Error: {result.get('error')}")
                
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(test_original())
