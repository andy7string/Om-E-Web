#!/usr/bin/env python3
"""
🧪 Simple Navigation Test Script
Allows you to input an actionId and execute it through the extension
"""

import asyncio
import websockets
import json
import time
import argparse

class NavigationTester:
    def __init__(self):
        self.websocket = None
        self.server_url = "ws://localhost:17892"
        
    async def connect(self):
        """Connect to the WebSocket server"""
        try:
            print(f"🔌 Connecting to {self.server_url}...")
            self.websocket = await websockets.connect(self.server_url)
            print("✅ Connected to WebSocket server")
            return True
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
    
    async def send_command(self, command, data=None):
        """Send a command to the extension"""
        if not self.websocket:
            print("❌ Not connected to server")
            return None
            
        # Check if connection is still alive
        if hasattr(self.websocket, 'state') and self.websocket.state.name == 'CLOSED':
            print("🔌 Connection closed, attempting to reconnect...")
            if not await self.connect():
                return None
            
        # The server expects different message types
        if command == "intelligence_update":
            message = {
                "type": "intelligence_update",
                "data": data or {}
            }
        elif command == "execute_llm_action":
            message = {
                "type": "llm_instruction",
                "data": data or {}
            }
        else:
            message = {
                "type": "command",
                "command": command,
                "data": data or {},
                "timestamp": time.time()
            }
        
        print(f"📤 Sending: {command}")
        try:
            await self.websocket.send(json.dumps(message))
        except websockets.exceptions.ConnectionClosedError:
            print("🔌 Connection lost during send, attempting to reconnect...")
            if await self.connect():
                await self.websocket.send(json.dumps(message))
            else:
                return None
        
        # Wait for response
        try:
            response = await asyncio.wait_for(self.websocket.recv(), timeout=10.0)
            return json.loads(response)
        except asyncio.TimeoutError:
            print("⏰ Timeout waiting for response")
            return None
        except websockets.exceptions.ConnectionClosedError:
            print("🔌 Connection closed during receive")
            return None
        except Exception as e:
            print(f"❌ Error receiving response: {e}")
            return None
    
    async def execute_action(self, action_id, action="click", params=None):
        """Execute an action on a specific element"""
        print(f"🎯 Executing action on {action_id}")
        
        # 🆕 NEW: Send ONLY actionId - let extension auto-detect action type
        response = await self.send_command("execute_llm_action", {
            "actionId": action_id,
            # No actionType - extension should look it up from registry
            "params": params or {}
        })
        
        if response:
            print(f"📨 Response: {response}")
        else:
            print("❌ No response received")
        
        return response
    
    async def get_actionable_elements(self):
        """Get list of actionable elements"""
        print("🔍 Getting actionable elements...")
        
        # Trigger intelligence update to get current elements
        response = await self.send_command("intelligence_update", {})
        
        if response:
            print(f"📨 Intelligence response: {response}")
        else:
            print("❌ No intelligence response")
        
        return response
    
    async def interactive_test(self):
        """Interactive test loop"""
        print("\n🧪 Navigation Test Script")
        print("=" * 50)
        
        if not await self.connect():
            return
        
        try:
            while True:
                print("\n📋 Available commands:")
                print("1. Execute action (enter actionId)")
                print("2. Get actionable elements")
                print("3. Quit")
                
                choice = input("\n🎯 Enter your choice (1-3): ").strip()
                
                if choice == "1":
                    action_id = input("🔑 Enter actionId (e.g., action_navigate_a_2): ").strip()
                    if action_id:
                        # 🆕 NEW: Extension auto-detects action type from registry
                        print(f"🔍 Extension will auto-detect action type for {action_id}")
                        await self.execute_action(action_id)
                    else:
                        print("❌ No actionId provided")
                
                elif choice == "2":
                    await self.get_actionable_elements()
                
                elif choice == "3":
                    print("👋 Goodbye!")
                    break
                
                else:
                    print("❌ Invalid choice, please try again")
                
                # 🆕 NEW: Send heartbeat to keep connection alive
                if self.websocket and hasattr(self.websocket, 'state') and self.websocket.state.name != 'CLOSED':
                    try:
                        await self.websocket.ping()
                        print("💓 Heartbeat sent to keep connection alive")
                    except:
                        print("⚠️ Heartbeat failed, connection may be unstable")
                    
        except KeyboardInterrupt:
            print("\n👋 Interrupted by user")
        finally:
            if self.websocket:
                await self.websocket.close()
                print("🔌 Connection closed")

async def main():
    parser = argparse.ArgumentParser(description="Execute LLM action via WS or run interactive tester")
    parser.add_argument("--action-id", dest="action_id", help="Action ID to execute (e.g., a_id_0)")
    parser.add_argument("--value", dest="value", help="Value to set (for setValue actions)")
    parser.add_argument("--submit", dest="submit", action="store_true", help="Submit after setting the value")
    parser.add_argument("--no-submit", dest="no_submit", action="store_true", help="Do not submit after setting the value")
    args = parser.parse_args()

    tester = NavigationTester()

    # Non-interactive execution path when action-id is provided
    if args.action_id:
        connected = await tester.connect()
        if not connected:
            return
        params = {}
        if args.value is not None:
            params["value"] = args.value
        # Determine submit flag precedence
        if args.no_submit:
            params["submit"] = False
        elif args.submit:
            params["submit"] = True
        # Execute without forcing actionType; extension will resolve
        await tester.execute_action(args.action_id, params=params)
        # Small delay to allow any navigation
        await asyncio.sleep(0.5)
        return

    # Fallback: interactive loop
    await tester.interactive_test()

if __name__ == "__main__":
    asyncio.run(main())
