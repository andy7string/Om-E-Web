#!/usr/bin/env python3
"""
🧪 Test script for active tab functionality

This script tests the new getActiveTab command and verifies that
the unnecessary polling has been removed from the system.
"""

import asyncio
import websockets
import json
import time

async def test_active_tab():
    """Test the getActiveTab command functionality"""
    
    print("🧪 Testing getActiveTab functionality...")
    
    # Connect to WebSocket server
    uri = "ws://127.0.0.1:17892"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to WebSocket server")
            
            # Test 1: Get current active tab
            print("\n🎯 Test 1: Getting current active tab...")
            await websocket.send(json.dumps({
                'id': 'test_active_tab_1',
                'command': 'getActiveTab'
            }))
            
            response = await websocket.recv()
            result = json.loads(response)
            
            print(f"📊 Active tab result: {json.dumps(result, indent=2)}")
            
            if result.get('ok'):
                active_tab_data = result.get('result', {})
                if 'active_tab' in active_tab_data:
                    active_tab = active_tab_data['active_tab']
                    print(f"✅ Active tab found:")
                    print(f"   ID: {active_tab.get('id')}")
                    print(f"   URL: {active_tab.get('url')}")
                    print(f"   Title: {active_tab.get('title')}")
                    print(f"   Status: {active_tab.get('status')}")
                else:
                    print(f"⚠️ No active tab data: {active_tab_data}")
            else:
                print(f"❌ Error getting active tab: {result.get('error')}")
            
            # Test 2: Get all tabs info (for comparison)
            print("\n📊 Test 2: Getting all tabs info...")
            await websocket.send(json.dumps({
                'id': 'test_tabs_info_1',
                'command': 'getTabsInfo'
            }))
            
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                tabs_data = result.get('result', {})
                tabs = tabs_data.get('tabs', [])
                print(f"📊 Total tabs: {len(tabs)}")
                
                for i, tab in enumerate(tabs):
                    status = "🟢 ACTIVE" if tab.get('active') else "⚪"
                    print(f"   {status} Tab {i+1}: {tab.get('title', 'No title')} ({tab.get('url', 'No URL')})")
            else:
                print(f"❌ Error getting tabs info: {result.get('error')}")
            
            # Test 3: Monitor for any polling (should be none)
            print("\n⏰ Test 3: Monitoring for polling (should be none)...")
            print("   Waiting 10 seconds to see if any tabs_info messages are sent...")
            
            start_time = time.time()
            polling_detected = False
            
            try:
                # Set a timeout for this test
                await asyncio.wait_for(websocket.recv(), timeout=10.0)
                polling_detected = True
                print("❌ POLLING DETECTED! Tabs info was sent automatically")
            except asyncio.TimeoutError:
                print("✅ NO POLLING DETECTED! No automatic tabs_info messages sent")
            
            elapsed = time.time() - start_time
            print(f"   Monitoring completed in {elapsed:.1f} seconds")
            
            if not polling_detected:
                print("✅ SUCCESS: Polling has been successfully removed!")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")

async def main():
    """Main test function"""
    print("🚀 Starting active tab functionality test...")
    print("📋 This test verifies:")
    print("   1. getActiveTab command works correctly")
    print("   2. getTabsInfo command still works")
    print("   3. No unnecessary polling is happening")
    print()
    
    await test_active_tab()
    
    print("\n🎉 Test completed!")

if __name__ == "__main__":
    asyncio.run(main())
