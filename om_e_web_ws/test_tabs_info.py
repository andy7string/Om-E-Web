#!/usr/bin/env python3
"""
Test script to verify tab information retrieval from ws_server.py
"""
import asyncio
import websockets
import json

async def test_tabs_info():
    """Test that we can retrieve tab information from the server"""
    try:
        async with websockets.connect('ws://127.0.0.1:17892') as websocket:
            print("🔌 Connected to WebSocket server")
            print("🧪 Testing Tab Information Retrieval...")
            
            # Send getTabsInfo command
            await websocket.send(json.dumps({
                'id': 'test_tabs_info',
                'command': 'getTabsInfo'
            }))
            
            print("⏳ Waiting for tabs info response...")
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok') and result.get('result'):
                tabs_data = result['result']
                
                if 'error' in tabs_data:
                    print(f"⚠️ {tabs_data['error']}")
                    print(f"Status: {tabs_data['status']}")
                else:
                    print("✅ Tab information retrieved successfully!")
                    print(f"📊 Total tabs: {len(tabs_data['tabs'])}")
                    print(f"🕒 Last update: {tabs_data['last_update']}")
                    print(f"🔌 Extension connected: {tabs_data['extension_connected']}")
                    print(f"👥 Total clients: {tabs_data['total_clients']}")
                    
                    # Show tab details
                    for i, tab in enumerate(tabs_data['tabs']):
                        active_status = "🟢 ACTIVE" if tab.get('active') else "⚪ Inactive"
                        print(f"   Tab {i+1}: {active_status} - {tab.get('title', 'No title')}")
                        print(f"      URL: {tab.get('url', 'No URL')}")
                        print(f"      ID: {tab.get('id', 'No ID')}")
            else:
                print(f"❌ Failed to get tabs info: {result.get('error', 'Unknown error')}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    print("🧪 Testing Tab Information Retrieval")
    print("=" * 50)
    asyncio.run(test_tabs_info())
