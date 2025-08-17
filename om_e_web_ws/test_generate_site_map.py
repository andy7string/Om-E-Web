#!/usr/bin/env python3
"""
Simple test to generate site map and trigger auto-save
"""
import asyncio
import websockets
import json

async def generate_site_map():
    """Generate site map to test auto-save functionality"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            print("🧪 Generating site map...")
            
            # Send generateSiteMap command
            await websocket.send(json.dumps({
                'id': 'generate_site_map_test',
                'command': 'generateSiteMap'
            }))
            
            print("⏳ Waiting for site map response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok') and result.get('result'):
                print("✅ Site map generated successfully!")
                print("📊 Check server logs for auto-save confirmation")
                
                # Show basic info from response
                metadata = result['result'].get('metadata', {})
                url = metadata.get('url', 'Unknown')
                total_elements = result['result'].get('statistics', {}).get('totalElements', 0)
                
                print(f"🌐 URL: {url}")
                print(f"📊 Total Elements: {total_elements}")
                
            else:
                print(f"❌ Site map generation failed: {result.get('error', 'Unknown error')}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    print("🧪 Testing Site Map Generation")
    print("=" * 50)
    asyncio.run(generate_site_map())
