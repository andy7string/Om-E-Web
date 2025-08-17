#!/usr/bin/env python3
"""
🧪 Test Simple Focused Site Map

Testing our new generateSimpleFocusedSiteMap function
"""

import asyncio
import json
import websockets

async def test_simple_focused():
    """Test the new simple focused site map function"""
    uri = 'ws://127.0.0.1:17892'
    
    try:
        async with websockets.connect(uri) as ws:
            print("🔌 Connected to WebSocket server")
            
            # Test our new simple focused scanner
            print("\n🧪 Testing generateSimpleFocusedSiteMap...")
            await ws.send(json.dumps({
                'id': 'test', 
                'command': 'generateSimpleFocusedSiteMap'
            }))
            
            response = await ws.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                data = result.get('result', {})
                print(f"\n✅ Simple Focused Site Map Generated Successfully!")
                print(f"📊 Total Elements: {data.get('statistics', {}).get('totalElements', 0)}")
                
                categories = data.get('statistics', {}).get('categories', {})
                print(f"\n📋 Categories:")
                print(f"   🏠 Navigation: {categories.get('navigation', 0)}")
                print(f"   🎯 Actions: {categories.get('actions', 0)}")
                print(f"   🔗 Links: {categories.get('links', 0)}")
                print(f"   📝 Forms: {categories.get('forms', 0)}")
                print(f"   📚 Headings: {categories.get('headings', 0)}")
                
                # Show some sample elements
                elements = data.get('elements', {})
                if elements.get('navigation'):
                    print(f"\n🏠 Sample Navigation Elements:")
                    for i, nav in enumerate(elements['navigation'][:3]):
                        print(f"   {i+1}. {nav.get('text', 'No text')} ({nav.get('type')}) - {nav.get('selector')}")
                
                if elements.get('actions'):
                    print(f"\n🎯 Sample Action Elements:")
                    for i, action in enumerate(elements['actions'][:3]):
                        print(f"   {i+1}. {action.get('text', 'No text')} ({action.get('type')}) - {action.get('selector')}")
                
            else:
                print(f"❌ Error: {result.get('error')}")
                
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(test_simple_focused())
