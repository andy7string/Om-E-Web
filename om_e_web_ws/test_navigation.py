#!/usr/bin/env python3
"""
Non-interactive Action Test Script

Usage examples:

  🎯 PREMIUM: Execute Capability (YouTube Transcript Retrieval)
      python3 test_navigation.py --command capability --capability RetrieveTranscript
      #   ↳ Navigate to a YouTube video page first
      #   ↳ Clicks "Show transcript" button
      #   ↳ Extracts and saves transcript to @site_structures/transcripts/
      # Search without submitting (just type in the box)
      python3 test_navigation.py --command capability --capability SearchYouTube --value "Tesla" --no-submit
      # Search for something else
      python3 test_navigation.py --command capability --capability SearchYouTube --value "claude" --submit

  - Direct navigation:
      python3 test_navigation.py --command navigate --action-id a_id_26

  - Click action:
      python3 test_navigation.py --command click --action-id a_id_52

  - Custom LLM action:
      python3 test_navigation.py --command llm --action-id a_id_14 --action-type setValue --value "Guitar Amps" --submit

  - Marketplace search (set value + submit):
      python3 test_navigation.py --command llm --action-id a_id_1 --action-type setValue --value "Gibson Guitar" --submit
      #   ↳ actionId: use the id from page.jsonl/llm_prompt.md (ex: a_id_1)
      #   ↳ --action-type setValue tells the extension to type into the field
      #   ↳ --value "Gibson Guitar" is the text to enter
      #   ↳ --submit sends Enter + tries common submit buttons

  - Generic LLM click without specifying actionType (auto-detect):
      python3 test_navigation.py --command llm --action-id a_id_133
      #   ↳ when --action-type is omitted, extension uses stored metadata

  - Explicit click:
      python3 test_navigation.py --command click --action-id a_id_133

  - Navigate link:
      python3 test_navigation.py --command navigate --action-id a_id_19

  - Set value without submit:
      python3 test_navigation.py --command llm --action-id a_id_1 --action-type setValue --value "just text" --no-submit
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
        elif command == "execute_capability":
            # 🎯 PREMIUM: Capability execution message
            capability_data = data or {}
            message = {
                "type": "execute_capability",
                "action": capability_data.get("action"),
                "params": capability_data.get("params", {})
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
                    except Exception:
                        print("⚠️ Heartbeat failed, connection may be unstable")
                    
        except KeyboardInterrupt:
            print("\n👋 Interrupted by user")
        finally:
            if self.websocket:
                await self.websocket.close()
                print("🔌 Connection closed")

async def main():
    parser = argparse.ArgumentParser(description="Execute LLM action via WS (non-interactive)")
    parser.add_argument("--action-id", dest="action_id", required=False, help="Action ID to execute (e.g., a_id_1)")
    parser.add_argument("--value", dest="value", required=False, help="Value to set (for setValue actions)")
    submit_group = parser.add_mutually_exclusive_group()
    submit_group.add_argument("--submit", dest="submit", action="store_true", help="Submit after setting the value")
    submit_group.add_argument("--no-submit", dest="no_submit", action="store_true", help="Do not submit after setting the value")
    parser.add_argument("--action-type", dest="action_type", required=False, help="Optional actionType when using the 'llm' command (e.g., setValue, click, navigate)")
    parser.add_argument("--command", dest="command", choices=["llm", "navigate", "click", "capability"], default="llm",
                        help="Execution mode: llm (default), navigate, click, capability")
    parser.add_argument("--capability", dest="capability", required=False, help="Capability action name (e.g., RetrieveTranscript)")

    # -------- cheat sheet ----------------------------------------------------
    # --command llm (default):
    #     • Use when you want the extension to auto-detect the action type
    #     • Combine with --action-type setValue when you want to type text
    #     • --value "your text" supplies the input text
    #     • --submit or --no-submit control Enter+submit behaviour for forms
    # Example: python3 test_navigation.py --command llm --action-id a_id_1 --action-type setValue --value "Gibson Guitar" --submit
    #          (Types "Gibson Guitar" into a_id_1 and tries to submit)
    #
    # --command navigate:
    #     • For links/tabs: requires --action-id (and optional --action-type if forcing) 
    #     • Example: python3 test_navigation.py --command navigate --action-id a_id_755
    #
    # --command click:
    #     • Forces a click without extra metadata
    #     • Example: python3 test_navigation.py --command click --action-id a_id_133
    # -------------------------------------------------------------------------

    args = parser.parse_args()

    # Validate arguments based on command mode
    command_mode = args.command

    if command_mode == "capability":
        # Capability mode requires --capability
        if not args.capability:
            print("❌ Error: --capability is required when using --command capability")
            parser.print_usage()
            return
    else:
        # Other modes require --action-id
        if not args.action_id:
            parser.print_usage()
            return

    tester = NavigationTester()
    connected = await tester.connect()
    if not connected:
        return

    params = {}
    if args.value is not None:
        params["value"] = args.value
        # Only include submit flag when value provided or explicitly requested
        if args.submit:
            params["submit"] = True
        elif args.no_submit:
            params["submit"] = False

    if command_mode == "capability":
        # 🎯 PREMIUM: Execute a capability action (e.g., RetrieveTranscript)
        capability_action = args.capability

        payload = {
            "action": capability_action,
            "params": params
        }
        print("""⚙️ CAPABILITY PAYLOAD
    - Executing capability action (e.g., RetrieveTranscript)
    - Server will route to handler based on site_configs.json
    - Handler executes multi-step workflow
    """)
        print(f"🎯 Executing capability: {capability_action}")
        response = await tester.send_command("execute_capability", payload)
    elif command_mode == "navigate":
        payload = {
            "actionId": args.action_id,
            "actionType": args.action_type or "navigate",
            "params": params
        }
        print("""⚙️ NAVIGATE PAYLOAD
    - actionId: element to click/link
    - actionType: explicit or default to "navigate"
    - params: usually empty (no value)
    """)
        print(f"🎯 Executing navigation action: {payload}")
        response = await tester.send_command("execute_llm_action", payload)
    elif command_mode == "click":
        payload = {
            "actionId": args.action_id,
            "actionType": "click",
            "params": params
        }
        print("""⚙️ CLICK PAYLOAD
    - actionType forced to "click"
    - params: (not used for clicks)
    """)
        print(f"🎯 Executing click action: {payload}")
        response = await tester.send_command("execute_llm_action", payload)
    else:
        payload = {
            "actionId": args.action_id,
            **({"actionType": args.action_type} if args.action_type else {}),
            "params": params
        }
        print("""⚙️ LLM PAYLOAD
    - command llm lets you specify actionType manually or rely on auto-detect
    - For setValue: include --value and --submit / --no-submit flags
    - params becomes {"value": ..., "submit": True/False}
    """)
        print(f"🎯 Executing action (LLM mode): {payload}")
    response = await tester.send_command("execute_llm_action", payload)

    if response is None:
        print("❌ No response received")
    else:
        print(f"📨 Response: {response}")
    
    if tester.websocket:
        await tester.websocket.close()

if __name__ == "__main__":
    asyncio.run(main())
