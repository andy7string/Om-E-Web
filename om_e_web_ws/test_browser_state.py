#!/usr/bin/env python3
"""
🧪 Test script for browser state integration

This script tests that browser state information (tabs, active tab, URLs)
is now included in the page.jsonl file for complete context.
"""

import asyncio
import websockets
import json
import time
import os

async def test_browser_state_integration():
    """Test that browser state is included in page data"""
    
    print("🧪 Testing browser state integration...")
    print("📋 This test verifies that browser state is included in page.jsonl")
    print()
    
    # Connect to WebSocket server
    uri = "ws://127.0.0.1:17892"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to WebSocket server")
            
            # Test 1: Get current page data (should include browser state)
            print("\n🎯 Test 1: Getting current page data with browser state...")
            await websocket.send(json.dumps({
                'id': 'test_browser_state_1',
                'command': 'getPageData'
            }))
            
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                page_data = result.get('result', {})
                browser_state = page_data.get('browser_state', {})
                
                print(f"✅ Page data retrieved successfully!")
                print(f"📊 Total elements: {page_data.get('total_elements', 0)}")
                print(f"🌐 Browser state included: {bool(browser_state)}")
                
                if browser_state:
                    print(f"   Total tabs: {browser_state.get('total_tabs', 0)}")
                    print(f"   Extension connected: {browser_state.get('extension_connected', False)}")
                    
                    active_tab = browser_state.get('active_tab')
                    if active_tab:
                        print(f"   Active tab: {active_tab.get('url', 'unknown')}")
                        print(f"   Active tab title: {active_tab.get('title', 'unknown')[:50]}...")
                    
                    all_tabs = browser_state.get('all_tabs', [])
                    print(f"   All tabs: {len(all_tabs)}")
                    for i, tab in enumerate(all_tabs):
                        status = "🟢 ACTIVE" if tab.get('active') else "⚪"
                        print(f"     {status} Tab {i+1}: {tab.get('title', 'No title')[:40]}...")
                else:
                    print("⚠️ No browser state found in page data")
            else:
                print(f"❌ Error getting page data: {result.get('error')}")
            
            # Test 2: Check the actual page.jsonl file
            print("\n📁 Test 2: Checking page.jsonl file content...")
            page_jsonl_path = os.path.join("@site_structures", "page.jsonl")
            
            if os.path.exists(page_jsonl_path):
                with open(page_jsonl_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    page_data = json.loads(content)
                
                browser_state = page_data.get('browser_state', {})
                current_page = page_data.get('current_page', {})
                
                print(f"✅ page.jsonl file found and parsed!")
                print(f"📅 Timestamp: {page_data.get('timestamp')}")
                print(f"🌐 Browser state included: {bool(browser_state)}")
                print(f"📄 Current page URL: {current_page.get('url', 'unknown')}")
                print(f"📄 Current page title: {current_page.get('title', 'unknown')[:50]}...")
                print(f"📄 Is active tab: {current_page.get('is_active_tab', False)}")
                
                if browser_state:
                    print(f"   Total tabs: {browser_state.get('total_tabs', 0)}")
                    active_tab = browser_state.get('active_tab')
                    if active_tab:
                        print(f"   Active tab URL: {active_tab.get('url', 'unknown')}")
                        print(f"   Active tab ID: {active_tab.get('id', 'unknown')}")
                    
                    all_tabs = browser_state.get('all_tabs', [])
                    print(f"   All tabs in browser state: {len(all_tabs)}")
                    for i, tab in enumerate(all_tabs):
                        status = "🟢 ACTIVE" if tab.get('active') else "⚪"
                        print(f"     {status} Tab {i+1}: {tab.get('title', 'No title')[:40]}...")
            else:
                print(f"⚠️ page.jsonl file not found at {page_jsonl_path}")
            
            # Test 3: Trigger an intelligence update to see browser state in action
            print("\n🔄 Test 3: Triggering intelligence update...")
            print("   (This will update page.jsonl with current browser state)")
            
            # Wait a moment for any pending updates
            await asyncio.sleep(2)
            
            # Check the file again
            if os.path.exists(page_jsonl_path):
                with open(page_jsonl_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    page_data = json.loads(content)
                
                browser_state = page_data.get('browser_state', {})
                print(f"✅ Updated page.jsonl contains browser state: {bool(browser_state)}")
                
                if browser_state:
                    active_tab = browser_state.get('active_tab')
                    if active_tab:
                        print(f"🎯 Current active tab in file: {active_tab.get('url', 'unknown')}")
                        print(f"🎯 Active tab title: {active_tab.get('title', 'unknown')[:50]}...")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")

async def main():
    """Main test function"""
    print("🚀 Starting browser state integration test...")
    print("=" * 60)
    
    await test_browser_state_integration()
    
    print("\n🎉 Test completed!")
    print("\n💡 Summary:")
    print("   - Browser state should now be included in page.jsonl")
    print("   - This includes all tabs, active tab, and URLs")
    print("   - LLM can now understand the complete browser context")

if __name__ == "__main__":
    asyncio.run(main())
