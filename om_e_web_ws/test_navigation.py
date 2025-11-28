#!/usr/bin/env python3
"""
Non-interactive Action Test Script

Run from om_e_web_ws/ directory:
    cd om_e_web_ws && python test_navigation.py [options]

Usage examples:

  🎯 CAPABILITY: Site-specific actions (YouTube, etc.)
      python test_navigation.py --command capability --capability RetrieveTranscript
      python test_navigation.py --command capability --capability SearchYouTube --value "Tesla" --no-submit
      python test_navigation.py --command capability --capability SearchYouTube --value "claude" --submit

  🗂️ TAB CONTROL: Browser tab management (use tab IDs from text.md Tabs line)
      python test_navigation.py --command capability --capability SwitchTab --params '{"tabId": 1138024345}'
      python test_navigation.py --command capability --capability OpenTab --params '{"url": "https://chatgpt.com"}'
      python test_navigation.py --command capability --capability CloseTab --params '{"tabId": 1138024288}'
      python test_navigation.py --command capability --capability UpdateTabURL --params '{"tabId": 1138024288, "url": "https://example.com"}'

  🔍 ZOOM CONTROL: Browser zoom (15% increments)
      python test_navigation.py --command capability --capability ZoomIn
      python test_navigation.py --command capability --capability ZoomOut
      python test_navigation.py --command capability --capability ZoomReset

  🔗 NAVIGATE: Click links
      python test_navigation.py --command navigate --action-id a_id_0

  👆 CLICK: Click buttons
      python test_navigation.py --command click --action-id a_id_3

  ✅ TOGGLE: Checkbox / Switch (set state directly via DOM API)
      python test_navigation.py --command llm --action-id a_id_2 --action-type toggle --value true
      python test_navigation.py --command llm --action-id a_id_2 --action-type toggle --value false
      #   ↳ Sets checkbox to true/false directly (no click guessing)
      #   ↳ Check text.md for: <Checkbox id="a_id_X" checked="false" use="(a_id_X, toggle, true|false)">

  🔘 RADIO: Select radio button (set state directly)
      python test_navigation.py --command llm --action-id a_id_5 --action-type toggle --value true
      #   ↳ Sets radio to selected
      #   ↳ Check text.md for: <Radio id="a_id_X" selected="false" use="(a_id_X, toggle, true)">

  🎚️ SLIDER: Set range value
      python test_navigation.py --command llm --action-id a_id_49 --action-type setValue --value "this is homie ome extension brother"
      #   ↳ Sets slider to value (check min/max in text.md)
      #   ↳ Check text.md for: <Slider id="a_id_X" value="0" min="0" max="100" use="(a_id_X, setValue, number)">

  📝 INPUT: Type into text fields
      python test_navigation.py --command llm --action-id a_id_6 --action-type setValue --value "claude"

k for us" --submit
      python test_navigation.py --command llm --action-id a_id_6 --action-type setValue --value "claude" --submit
      #   ↳ Check text.md for: <Input id="a_id_X" use="(a_id_X, 'your text', submit:true)">

  📋 SELECT: Dropdown selection
      python test_navigation.py --command llm --action-id a_id_5 --action-type setValue --value "Option Name"
      #   ↳ Check text.md for: <Select id="a_id_X" value="current" use="(a_id_X, select, 'option')">

  🤖 LLM AUTO: Let extension auto-detect action type
      python test_navigation.py --command llm --action-id a_id_133

  📜 SCROLL: Page-by-page viewport scrolling (two methods)
      # Method 1: Using --command scroll
      python test_navigation.py --command scroll                    # scroll down (default)
      python test_navigation.py --command scroll --direction down   # scroll down one page
      python test_navigation.py --command scroll --direction up     # scroll up one page
      python test_navigation.py --command scroll --direction top    # scroll to top
      python test_navigation.py --command scroll --direction bottom # scroll to bottom

      # Method 2: Using capability (same as other capabilities)
      python test_navigation.py --command capability --capability ScrollDown
      python test_navigation.py --command capability --capability ScrollUp
      python test_navigation.py --command capability --capability ScrollLeft
      python test_navigation.py --command capability --capability ScrollRight
      python test_navigation.py --command capability --capability ScrollTop
      python test_navigation.py --command capability --capability ScrollBottom

  🎛️ HUD: Toggle the overlay HUD interface
      python test_navigation.py --command hud                     # toggle HUD open/closed

  🎨 ORB THEME: Change the floating orb appearance
      python test_navigation.py --command theme --theme kawaii    # cute white bunny with blue eyes (default)
      python test_navigation.py --command theme --theme minimal   # simple ghost-like orb
      python test_navigation.py --command theme --theme bliss     # happy blue orb with clickable halo
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
        elif command == "execute_scroll":
            # 📜 SCROLL: Page-by-page viewport scrolling
            scroll_data = data or {}
            message = {
                "type": "execute_scroll",
                "direction": scroll_data.get("direction", "down")
            }
        elif command == "toggle_hud":
            # 🎛️ HUD: Toggle overlay interface
            message = {
                "type": "toggle_hud"
            }
        elif command == "set_orb_theme":
            # 🎨 ORB THEME: Set orb theme
            theme_data = data or {}
            message = {
                "type": "set_orb_theme",
                "theme": theme_data.get("theme", "classic")
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
    parser.add_argument("--command", dest="command", choices=["llm", "navigate", "click", "capability", "scroll", "hud", "theme"], default="llm",
                        help="Execution mode: llm (default), navigate, click, capability, scroll, hud, theme")
    parser.add_argument("--capability", dest="capability", required=False, help="Capability action name (e.g., RetrieveTranscript)")
    parser.add_argument("--direction", dest="direction", choices=["down", "up", "top", "bottom"], default="down",
                        help="Scroll direction: down (default), up, top, bottom")
    parser.add_argument("--theme", dest="theme", choices=["kawaii", "minimal", "bliss"], default="kawaii",
                        help="Orb theme: kawaii (default), minimal, bliss")
    parser.add_argument("--params", dest="params_json", required=False,
                        help="JSON string of parameters (e.g., '{\"tabId\": 123, \"url\": \"https://example.com\"}')")

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
    elif command_mode == "scroll":
        # Scroll mode doesn't require --action-id (uses --direction instead)
        pass
    elif command_mode == "hud":
        # HUD mode doesn't require --action-id
        pass
    elif command_mode == "theme":
        # Theme mode doesn't require --action-id
        pass
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

    # 🆕 NEW: Parse --params JSON if provided
    if args.params_json:
        try:
            parsed_params = json.loads(args.params_json)
            if isinstance(parsed_params, dict):
                params.update(parsed_params)
                print(f"📋 Parsed --params: {parsed_params}")
            else:
                print(f"❌ Error: --params must be a JSON object, got: {type(parsed_params).__name__}")
                return
        except json.JSONDecodeError as e:
            print(f"❌ Error: Invalid JSON in --params: {e}")
            print(f"   Received: {args.params_json}")
            return

    # Merge --value and --submit flags (these override --params if both provided)
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
    elif command_mode == "scroll":
        # 📜 SCROLL: Page-by-page viewport scrolling
        payload = {
            "direction": args.direction
        }
        print("""📜 SCROLL PAYLOAD
    - direction: down, up, top, bottom
    - Scrolls one viewport height at a time (end becomes beginning)
    """)
        print(f"📜 Executing scroll: direction={args.direction}")
        response = await tester.send_command("execute_scroll", payload)
    elif command_mode == "hud":
        # 🎛️ HUD: Toggle overlay interface
        print("""🎛️ HUD TOGGLE
    - Toggles the OM-E HUD overlay open/closed
    - HUD provides visual feedback and controls
    """)
        print("🎛️ Toggling HUD...")
        response = await tester.send_command("toggle_hud", {})
    elif command_mode == "theme":
        # 🎨 ORB THEME: Change orb appearance
        print("""🎨 ORB THEME
    - Changes the floating orb appearance
    - Available themes: kawaii, vader, minimal
    - Theme persists across sessions
    """)
        print(f"🎨 Setting orb theme to: {args.theme}")
        response = await tester.send_command("set_orb_theme", {"theme": args.theme})
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
