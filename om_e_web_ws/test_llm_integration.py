#!/usr/bin/env python3
"""
🧠 Test Script for LLM Integration - Phase 4

This script demonstrates the new LLM integration capabilities:
1. Get current page intelligence data
2. Send LLM instructions for action execution
3. Test the bidirectional communication pipeline

🚀 USAGE:
python test_llm_integration.py

📡 REQUIRES:
- WebSocket server running on ws://127.0.0.1:17892
- Chrome extension loaded and connected
- Active web page with intelligence system running
"""

import asyncio
import websockets
import json
import uuid
import time

async def test_llm_integration():
    """🧠 Test the complete LLM integration pipeline"""
    
    uri = "ws://127.0.0.1:17892"
    
    try:
        print("🚀 Connecting to WebSocket server...")
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to server")
            
            # Test 1: Get current page intelligence data
            print("\n🧠 Test 1: Getting current page intelligence data...")
            await test_get_page_data(websocket)
            
            # Test 2: Send LLM instruction
            print("\n🤖 Test 2: Sending LLM instruction...")
            await test_llm_instruction(websocket)
            
            # Test 3: Monitor intelligence updates
            print("\n📡 Test 3: Monitoring intelligence updates...")
            await test_intelligence_monitoring(websocket)
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        print("💡 Make sure the WebSocket server is running and the extension is connected")

async def test_get_page_data(websocket):
    """🧠 Test getting current page intelligence data"""
    
    try:
        # Send getPageData command
        message = {
            "id": f"test-{uuid.uuid4().hex[:8]}",
            "command": "getPageData"
        }
        
        await websocket.send(json.dumps(message))
        print(f"📤 Sent: {message['command']}")
        
        # Wait for response
        response = await websocket.recv()
        response_data = json.loads(response)
        
        if response_data.get("ok"):
            page_data = response_data.get("result", {})
            if "error" in page_data:
                print(f"⚠️ {page_data['error']}")
                print("💡 Make sure the extension is on a page with intelligence system active")
            else:
                print("✅ Page data retrieved successfully!")
                print(f"📊 Total elements: {page_data.get('total_elements', 0)}")
                print(f"🧠 Intelligence version: {page_data.get('intelligence_version', 'unknown')}")
                print(f"🕒 Last update: {page_data.get('last_update', 'unknown')}")
        else:
            print(f"❌ Failed to get page data: {response_data.get('error', 'Unknown error')}")
            
    except Exception as e:
        print(f"❌ Error testing page data: {e}")

async def test_llm_instruction(websocket):
    """🤖 Test sending LLM instruction for action execution"""
    
    try:
        # Send LLM instruction
        message = {
            "id": f"llm-{uuid.uuid4().hex[:8]}",
            "type": "llm_instruction",
            "data": {
                "actionId": "action_navigate_a_0",  # Example action ID
                "actionType": "click",
                "params": {
                    "description": "Click the first actionable link on the page"
                }
            }
        }
        
        await websocket.send(json.dumps(message))
        print(f"📤 Sent LLM instruction: {message['data']['actionType']} on {message['data']['actionId']}")
        
        # Wait for response
        response = await websocket.recv()
        response_data = json.loads(response)
        
        if response_data.get("ok"):
            print("✅ LLM instruction sent successfully!")
            print(f"📋 Result: {response_data.get('result', 'No result')}")
        else:
            print(f"❌ Failed to send LLM instruction: {response_data.get('error', 'Unknown error')}")
            
    except Exception as e:
        print(f"❌ Error testing LLM instruction: {e}")

async def test_intelligence_monitoring(websocket):
    """📡 Test monitoring intelligence updates"""
    
    try:
        print("📡 Monitoring for intelligence updates (10 seconds)...")
        
        # Set up a timeout for monitoring
        start_time = time.time()
        timeout = 10  # seconds
        
        while time.time() - start_time < timeout:
            try:
                # Wait for messages with a short timeout
                response = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                response_data = json.loads(response)
                
                if response_data.get("type") == "intelligence_update":
                    print("🧠 Intelligence update received!")
                    data = response_data.get("data", {})
                    print(f"📊 Elements: {len(data.get('actionableElements', []))}")
                    print(f"💡 Insights: {len(data.get('recentInsights', []))}")
                    print(f"📈 Total events: {data.get('totalEvents', 0)}")
                    break
                    
            except asyncio.TimeoutError:
                # No message received, continue monitoring
                continue
            except Exception as e:
                print(f"❌ Error during monitoring: {e}")
                break
        
        if time.time() - start_time >= timeout:
            print("⏰ Monitoring timeout - no intelligence updates received")
            print("💡 Make sure the extension is actively sending intelligence updates")
            
    except Exception as e:
        print(f"❌ Error testing intelligence monitoring: {e}")

async def main():
    """🚀 Main test function"""
    
    print("🧠 LLM Integration Test - Phase 4")
    print("=" * 50)
    print("This test demonstrates the new LLM integration capabilities")
    print("Make sure:")
    print("1. WebSocket server is running (ws://127.0.0.1:17892)")
    print("2. Chrome extension is loaded and connected")
    print("3. Extension is on a page with intelligence system active")
    print("=" * 50)
    
    await test_llm_integration()
    
    print("\n🎯 Test completed!")
    print("💡 Check the server console for detailed logs")

if __name__ == "__main__":
    asyncio.run(main())
