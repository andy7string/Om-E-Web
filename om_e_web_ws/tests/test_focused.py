#!/usr/bin/env python3
"""
🧪 Test Focused Site Map Function

Quick test for the new generateFocusedSiteMap function
"""

import asyncio
import json
import websockets

async def test_focused_site_map():
    """Test the focused site map function"""
    uri = 'ws://127.0.0.1:17892'
    
    try:
        async with websockets.connect(uri) as ws:
            print("🔌 Connected to WebSocket server")
            
            # Send the focused site map command
            await ws.send(json.dumps({
                'id': 'test', 
                'command': 'generateFocusedSiteMap'
            }))
            
            # Get response
            response = await ws.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                data = result.get('result', {})
                print("\n✅ Focused Site Map Generated Successfully!")
                print(f"📊 Total Elements: {data.get('statistics', {}).get('totalElements', 0)}")
                
                categories = data.get('statistics', {}).get('categories', {})
                print(f"🏆 Headings: {categories.get('headings', 0)}")
                print(f"🎯 Primary Actions: {categories.get('primary_actions', 0)}")
                print(f"🔗 Content Links: {categories.get('content_links', 0)}")
                print(f"📝 Forms: {categories.get('forms', 0)}")
                print(f"📚 Main Content: {categories.get('main_content', 0)}")
                
                # Show what was filtered out
                filtered = data.get('statistics', {}).get('filteredOut', {})
                print(f"\n🚫 Filtered Out:")
                for key, value in filtered.items():
                    print(f"   {key}: {value}")
                    
            else:
                print(f"❌ Error: {result.get('error')}")
                
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(test_focused_site_map())
