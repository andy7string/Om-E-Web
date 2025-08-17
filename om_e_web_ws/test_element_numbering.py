#!/usr/bin/env python3
"""
Test script to verify element numbering system
"""
import asyncio
import websockets
import json

async def test_element_numbering():
    """Test that elements now have unique IDs"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            print("🧪 Testing Element Numbering System...")
            
            # Send generateSiteMap command
            await websocket.send(json.dumps({
                'id': 'test_element_numbering',
                'command': 'generateSiteMap'
            }))
            
            print("⏳ Waiting for response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok') and result.get('result'):
                metadata = result['result'].get('metadata', {})
                url = metadata.get('url', 'Unknown')
                elements = result['result'].get('interactiveElements', [])
                
                print(f"✅ Scan completed for: {url}")
                print(f"📊 Total elements: {len(elements)}")
                
                # Check if elements have IDs
                if elements:
                    first_element = elements[0]
                    if 'elementId' in first_element:
                        print(f"🎯 Element numbering: ✅ WORKING!")
                        print(f"   First element ID: {first_element['elementId']}")
                        print(f"   First element text: {first_element.get('text', 'N/A')[:50]}...")
                        
                        # Check a few more elements
                        for i in range(min(5, len(elements))):
                            elem = elements[i]
                            print(f"   Element {elem['elementId']}: {elem.get('text', 'N/A')[:30]}...")
                    else:
                        print("❌ Element numbering: NOT WORKING - no elementId found")
                else:
                    print("⚠️ No interactive elements found")
                    
            else:
                print(f"❌ Scan failed: {result.get('error', 'Unknown error')}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    print("🧪 Testing Element Numbering System")
    print("=" * 50)
    asyncio.run(test_element_numbering())
