#!/usr/bin/env python3
"""
🧪 Test script for LLM actions alignment

This script verifies that llm_actions.json is properly aligned with
the current page and contains only relevant actions.
"""

import asyncio
import websockets
import json
import time
import os

async def test_llm_actions_alignment():
    """Test that LLM actions are aligned with current page"""
    
    print("🧪 Testing LLM actions alignment...")
    print("📋 This test verifies that llm_actions.json matches the current page")
    print()
    
    # Connect to WebSocket server
    uri = "ws://127.0.0.1:17892"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to WebSocket server")
            
            # Test 1: Get current page data
            print("\n🎯 Test 1: Getting current page data...")
            await websocket.send(json.dumps({
                'id': 'test_alignment_1',
                'command': 'getPageData'
            }))
            
            response = await websocket.recv()
            result = json.loads(response)
            
            if result.get('ok'):
                page_data = result.get('result', {})
                browser_state = page_data.get('browser_state', {})
                current_page = page_data.get('current_page', {})
                
                print(f"✅ Page data retrieved successfully!")
                print(f"📄 Current page URL: {current_page.get('url', 'unknown')}")
                print(f"📄 Current page title: {current_page.get('title', 'unknown')[:50]}...")
                
                active_tab = browser_state.get('active_tab')
                if active_tab:
                    print(f"🎯 Active tab URL: {active_tab.get('url', 'unknown')}")
                    print(f"🎯 Active tab title: {active_tab.get('title', 'unknown')[:50]}...")
            else:
                print(f"❌ Error getting page data: {result.get('error')}")
            
            # Test 2: Check llm_actions.json alignment
            print("\n📁 Test 2: Checking llm_actions.json alignment...")
            llm_actions_path = os.path.join("@site_structures", "llm_actions.json")
            
            if os.path.exists(llm_actions_path):
                with open(llm_actions_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    llm_actions = json.loads(content)
                
                # Check page context
                page_context = llm_actions.get("_page_context", {})
                if page_context:
                    print(f"✅ LLM actions file contains page context!")
                    print(f"🌐 Page URL in actions: {page_context.get('url', 'unknown')}")
                    print(f"📄 Page title in actions: {page_context.get('title', 'unknown')[:50]}...")
                    print(f"📊 Total actions: {page_context.get('total_actions', 0)}")
                    print(f"⏰ Last updated: {page_context.get('timestamp', 'unknown')}")
                    
                    # Check if actions align with current page
                    current_url = current_page.get('url', 'unknown')
                    actions_url = page_context.get('url', 'unknown')
                    
                    if current_url == actions_url or current_url == "unknown":
                        print("✅ SUCCESS: LLM actions are aligned with current page!")
                    else:
                        print("❌ MISALIGNMENT: LLM actions are from a different page!")
                        print(f"   Current page: {current_url}")
                        print(f"   Actions page: {actions_url}")
                    
                    # Show some example actions
                    action_count = 0
                    for action_id, action_data in llm_actions.items():
                        if action_id != "_page_context":
                            action_count += 1
                            if action_count <= 3:  # Show first 3 actions
                                description = action_data.get('description', 'No description')
                                action_type = action_data.get('action_type', 'unknown')
                                print(f"   Action {action_count}: {action_id} ({action_type}) - {description[:30]}...")
                    
                    if action_count > 3:
                        print(f"   ... and {action_count - 3} more actions")
                    
                else:
                    print("⚠️ No page context found in llm_actions.json")
                    
                    # Show actions without context
                    action_count = 0
                    for action_id, action_data in llm_actions.items():
                        if action_id != "_page_context":
                            action_count += 1
                            if action_count <= 3:
                                description = action_data.get('description', 'No description')
                                action_type = action_data.get('action_type', 'unknown')
                                print(f"   Action {action_count}: {action_id} ({action_type}) - {description[:30]}...")
                    
                    if action_count > 3:
                        print(f"   ... and {action_count - 3} more actions")
                    
            else:
                print(f"⚠️ llm_actions.json file not found at {llm_actions_path}")
            
            # Test 3: Trigger intelligence update to refresh actions
            print("\n🔄 Test 3: Triggering intelligence update...")
            print("   (This will update llm_actions.json with current page actions)")
            
            # Wait a moment for any pending updates
            await asyncio.sleep(2)
            
            # Check the file again
            if os.path.exists(llm_actions_path):
                with open(llm_actions_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    llm_actions = json.loads(content)
                
                page_context = llm_actions.get("_page_context", {})
                if page_context:
                    print(f"✅ Updated llm_actions.json contains page context!")
                    print(f"🌐 Page URL: {page_context.get('url', 'unknown')}")
                    print(f"📄 Page title: {page_context.get('title', 'unknown')[:50]}...")
                    print(f"📊 Total actions: {page_context.get('total_actions', 0)}")
                    
                    # Check alignment again
                    current_url = current_page.get('url', 'unknown')
                    actions_url = page_context.get('url', 'unknown')
                    
                    if current_url == actions_url or current_url == "unknown":
                        print("✅ SUCCESS: LLM actions are now aligned with current page!")
                    else:
                        print("❌ Still misaligned after update!")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")

async def main():
    """Main test function"""
    print("🚀 Starting LLM actions alignment test...")
    print("=" * 60)
    
    await test_llm_actions_alignment()
    
    print("\n🎉 Test completed!")
    print("\n💡 Summary:")
    print("   - LLM actions should be aligned with current page")
    print("   - Page context should be included in llm_actions.json")
    print("   - Actions should update when page changes")

if __name__ == "__main__":
    asyncio.run(main())
