#!/usr/bin/env python3
"""
🧪 Test script for active tab update functionality

This script monitors the WebSocket server to verify that active tab
information is sent immediately when tabs change (focus, URL, etc.).
"""

import asyncio
import websockets
import json
import time

async def monitor_active_tab_updates():
    """Monitor active tab updates in real-time"""
    
    print("🧪 Monitoring active tab updates...")
    print("📋 Instructions:")
    print("   1. Make sure the WebSocket server is running")
    print("   2. Make sure the Chrome extension is loaded and connected")
    print("   3. Switch between tabs or change URLs to see updates")
    print("   4. Watch for '🎯 ACTIVE TAB:' messages in the server terminal")
    print()
    
    # Connect to WebSocket server
    uri = "ws://127.0.0.1:17892"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to WebSocket server")
            print("📡 Monitoring for active tab updates...")
            print("   (Switch tabs or change URLs to see updates)")
            print()
            
            # Monitor for 60 seconds
            start_time = time.time()
            update_count = 0
            
            while time.time() - start_time < 60:
                try:
                    # Wait for messages with timeout
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    
                    # Check for active tab info messages
                    if data.get("type") == "active_tab_info":
                        update_count += 1
                        active_tab = data.get("activeTab", {})
                        
                        print(f"🎯 UPDATE #{update_count}: Active Tab Changed!")
                        print(f"   ID: {active_tab.get('id')}")
                        print(f"   URL: {active_tab.get('url')}")
                        print(f"   Title: {active_tab.get('title', 'No title')[:60]}...")
                        print(f"   Status: {active_tab.get('status')}")
                        print(f"   Timestamp: {data.get('timestamp')}")
                        print()
                    
                    # Also show tabs_info updates
                    elif data.get("type") == "tabs_info":
                        tabs = data.get("tabs", [])
                        active_tabs = [tab for tab in tabs if tab.get("active", False)]
                        
                        if active_tabs:
                            active_tab = active_tabs[0]
                            print(f"📊 Tabs Info Update: {len(tabs)} total tabs, {len(active_tabs)} active")
                            print(f"   Active: {active_tab.get('title', 'No title')[:50]}...")
                            print()
                
                except asyncio.TimeoutError:
                    # No message received, continue monitoring
                    continue
                except Exception as e:
                    print(f"❌ Error processing message: {e}")
                    continue
            
            print(f"⏰ Monitoring completed after 60 seconds")
            print(f"📊 Total active tab updates received: {update_count}")
            
            if update_count > 0:
                print("✅ SUCCESS: Active tab updates are working correctly!")
            else:
                print("⚠️ No active tab updates received. Try switching tabs or changing URLs.")
            
    except Exception as e:
        print(f"❌ Error during monitoring: {e}")

async def test_get_active_tab_command():
    """Test the getActiveTab command"""
    
    print("\n🎯 Testing getActiveTab command...")
    
    try:
        async with websockets.connect("ws://127.0.0.1:17892") as websocket:
            # Send getActiveTab command
            await websocket.send(json.dumps({
                'id': 'test_get_active_tab',
                'command': 'getActiveTab'
            }))
            
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                active_tab_data = result.get('result', {})
                if 'active_tab' in active_tab_data:
                    active_tab = active_tab_data['active_tab']
                    source = active_tab_data.get('source', 'unknown')
                    
                    print(f"✅ getActiveTab command successful!")
                    print(f"   ID: {active_tab.get('id')}")
                    print(f"   URL: {active_tab.get('url')}")
                    print(f"   Title: {active_tab.get('title', 'No title')}")
                    print(f"   Source: {source}")
                else:
                    print(f"⚠️ No active tab data: {active_tab_data}")
            else:
                print(f"❌ Error: {result.get('error')}")
                
    except Exception as e:
        print(f"❌ Error testing getActiveTab: {e}")

async def main():
    """Main test function"""
    print("🚀 Starting active tab update monitoring test...")
    print("=" * 60)
    
    # Test 1: Monitor active tab updates
    await monitor_active_tab_updates()
    
    # Test 2: Test getActiveTab command
    await test_get_active_tab_command()
    
    print("\n🎉 Test completed!")

if __name__ == "__main__":
    asyncio.run(main())
