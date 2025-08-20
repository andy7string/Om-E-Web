#!/usr/bin/env python3
"""
🧠 Test Script: Execute ABOUT Menu Action
Mimics an LLM sending a command to the extension to click the ABOUT menu item
"""

import asyncio
import json
import uuid
import websockets

async def test_about_action():
    """🎯 Test executing the ABOUT menu action"""
    
    websocket_url = "ws://127.0.0.1:17892"
    
    try:
        print("🎯 Testing ABOUT Menu Action Execution")
        print("=" * 50)
        print("Target: action_navigate_a_2 (ABOUT menu item)")
        print("Action: Click navigation")
        print("=" * 50)
        
        async with websockets.connect(websocket_url) as websocket:
            print(f"🔌 Connected to WebSocket server: {websocket_url}")
            
            # Send LLM instruction to click on ABOUT menu
            message = {
                "id": f"llm-{uuid.uuid4().hex[:8]}",
                "type": "llm_instruction",
                "data": {
                    "actionId": "action_navigate_a_2",  # ABOUT menu item from page.jsonl
                    "actionType": "click",
                    "params": {
                        "description": "Click on the ABOUT menu item to navigate to About page"
                    }
                }
            }
            
            print(f"📤 Sending LLM instruction...")
            print(f"   Action: {message['data']['actionType']}")
            print(f"   Target: {message['data']['actionId']}")
            print(f"   Description: {message['data']['params']['description']}")
            
            await websocket.send(json.dumps(message))
            print("✅ LLM instruction sent to server!")
            
            # Wait for response
            print("⏳ Waiting for server response...")
            response = await websocket.recv()
            response_data = json.loads(response)
            
            print("\n📋 Server Response:")
            print(f"   Status: {'✅ OK' if response_data.get('ok') else '❌ Failed'}")
            print(f"   Result: {response_data.get('result', 'No result')}")
            
            if response_data.get('error'):
                print(f"   Error: {response_data.get('error')}")
            
            if response_data.get('ok'):
                print("\n🎉 SUCCESS! Action execution initiated!")
                print("💡 Check the browser to see if the ABOUT menu was clicked")
                print("💡 The extension should have received and processed the command")
            else:
                print("\n❌ FAILED! Action execution failed!")
                print("💡 Check server logs for more details")
                
    except websockets.exceptions.ConnectionRefused:
        print("❌ Connection refused! Make sure the WebSocket server is running on port 17892")
        print("💡 Start the server with: python ws_server.py")
    except Exception as e:
        print(f"❌ Error during test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 Starting ABOUT Action Test...")
    asyncio.run(test_about_action())
    print("\n�� Test completed!")
