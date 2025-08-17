#!/usr/bin/env python3
"""
🧪 Comprehensive Feature Test for Chrome Extension

This script demonstrates all the new features we've implemented:
1. Tab Information & Navigation Context
2. LLM-Friendly Site Mapping with Click Coordinates
3. Browser History Navigation (Back/Forward/Jump)

🔗 FULL ROUND-TRIP COMMUNICATION PATTERN:
Test Client → WebSocket Server → Service Worker → Content Script → DOM → Response → Service Worker → Server → Test Client
"""

import asyncio
import json
import websockets
import uuid

class WebSocketTestClient:
    """
    🔌 WebSocket Test Client for Chrome Extension Communication
    
    This class implements a complete WebSocket client that can:
    - Connect to the WebSocket server
    - Send commands with unique IDs
    - Listen for responses asynchronously
    - Match responses to pending commands
    - Handle connection lifecycle
    """
    
    def __init__(self, uri="ws://127.0.0.1:17892"):
        self.uri = uri
        self.ws = None
        self.pending_commands = {}
        
    async def connect(self):
        """Establish WebSocket connection to the server"""
        print(f"🔌 Connecting to {self.uri}...")
        self.ws = await websockets.connect(uri)
        print("✅ Connected to WebSocket server")
        
    async def send_command(self, command, params=None, timeout=8.0):
        """Send a command and wait for response"""
        if not self.ws:
            raise RuntimeError("Not connected to server")
            
        cid = f"cmd-{uuid.uuid4().hex[:8]}"
        payload = {"id": cid, "command": command, "params": params or {}}
        
        print(f"📤 Sending command: {command} with id: {cid}")
        
        fut = asyncio.get_event_loop().create_future()
        self.pending_commands[cid] = fut
        
        await self.ws.send(json.dumps(payload))
        
        try:
            result = await asyncio.wait_for(fut, timeout=timeout)
            print(f"✅ Response received for {cid}: {result}")
            return result
        except asyncio.TimeoutError:
            print(f"⏰ Timeout waiting for response to {cid}")
            self.pending_commands.pop(cid, None)
            raise RuntimeError(f"Command {command} timed out")
        except Exception as e:
            print(f"❌ Error waiting for response to {cid}: {e}")
            self.pending_commands.pop(cid, None)
            raise
            
    async def listen_for_responses(self):
        """Background task that listens for responses from the server"""
        try:
            async for message in self.ws:
                try:
                    msg = json.loads(message)
                    print(f"📥 Received: {msg}")
                    
                    if "id" in msg and ("ok" in msg or "error" in msg):
                        cid = msg["id"]
                        fut = self.pending_commands.pop(cid, None)
                        if fut and not fut.done():
                            print(f"✅ Setting future result for {cid}")
                            fut.set_result(msg)
                        else:
                            print(f"⚠️ No pending future found for {cid}")
                            
                except json.JSONDecodeError as e:
                    print(f"❌ Failed to parse message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            print("🔌 WebSocket connection closed")
        except Exception as e:
            print(f"❌ Error in response listener: {e}")
            
    async def close(self):
        """Close the WebSocket connection"""
        if self.ws:
            await self.ws.close()
            print("🔌 WebSocket connection closed")

async def test_comprehensive_features():
    """
    🧪 Main test function for comprehensive feature testing
    
    This function demonstrates all the new capabilities:
    1. Tab Information & Navigation Context
    2. LLM-Friendly Site Mapping with Click Coordinates
    3. Browser History Navigation (Back/Forward/Jump)
    """
    print("🧪 Testing Comprehensive Chrome Extension Features...")
    
    client = WebSocketTestClient()
    
    try:
        # 🔌 STEP 1: Connect to the WebSocket server
        await client.connect()
        
        # 🎧 STEP 2: Start listening for responses in background
        print("   🔌 Starting response listener...")
        listener_task = asyncio.create_task(client.listen_for_responses())
        
        # ⏳ STEP 3: Wait for listener to be ready
        print("   ⏳ Waiting for response listener to be ready...")
        await asyncio.sleep(2)
        
        # 🧪 STEP 4: Test basic connectivity with navigation
        print("\n1. Testing Basic Connectivity...")
        try:
            result = await client.send_command("navigate", {"url": "https://example.com"})
            print("   ✅ Navigation command successful!")
            
            # Wait for page to load
            await asyncio.sleep(3)
            
        except Exception as e:
            print(f"   ❌ Navigation failed: {e}")
            return
        
        # 🧪 STEP 5: Test Tab Information & Navigation Context
        print("\n2. Testing Tab Information & Navigation Context...")
        try:
            # Get current tab info
            tab_info = await client.send_command("getCurrentTabInfo", {})
            if tab_info.get('ok'):
                data = tab_info.get('result', {})
                print(f"   ✅ Current Tab Info:")
                print(f"      URL: {data.get('url')}")
                print(f"      Title: {data.get('title')}")
                print(f"      Hostname: {data.get('hostname')}")
                print(f"      Ready State: {data.get('readyState')}")
            else:
                print(f"   ❌ Tab info failed: {tab_info.get('error')}")
            
            # Get navigation context
            nav_context = await client.send_command("getNavigationContext", {})
            if nav_context.get('ok'):
                data = nav_context.get('result', {})
                print(f"   ✅ Navigation Context:")
                print(f"      Current URL: {data.get('currentUrl')}")
                print(f"      Referrer: {data.get('referrer')}")
                print(f"      History Length: {data.get('historyLength')}")
                print(f"      Can Go Back: {data.get('canGoBack')}")
            else:
                print(f"   ❌ Navigation context failed: {nav_context.get('error')}")
                
        except Exception as e:
            print(f"   ❌ Tab info test failed: {e}")
        
        # 🧪 STEP 6: Test LLM-Friendly Site Mapping
        print("\n3. Testing LLM-Friendly Site Mapping...")
        try:
            site_map = await client.send_command("generateSiteMap", {})
            if site_map.get('ok'):
                data = site_map.get('result', {})
                stats = data.get('statistics', {})
                print(f"   ✅ Site Map Generated:")
                print(f"      Total Elements: {stats.get('totalElements', 0)}")
                print(f"      Clickable Elements: {stats.get('clickableElements', 0)}")
                print(f"      Form Elements: {stats.get('formElements', 0)}")
                print(f"      Navigation Elements: {stats.get('navigationElements', 0)}")
                
                # Show some interactive elements with coordinates
                interactive = data.get('interactiveElements', [])
                if interactive:
                    print(f"   📍 Sample Interactive Elements:")
                    for i, elem in enumerate(interactive[:3]):
                        coords = elem.get('coordinates', {})
                        print(f"      {i+1}. {elem.get('text', 'No text')} ({elem.get('type')})")
                        print(f"         Coordinates: ({coords.get('x')}, {coords.get('y')})")
                        print(f"         Selector: {elem.get('selector')}")
                
                # Show LLM summary
                llm_summary = data.get('llmSummary', {})
                if llm_summary:
                    print(f"   🤖 LLM Summary:")
                    print(f"      Page Purpose: {llm_summary.get('pagePurpose')}")
                    print(f"      Primary Actions: {len(llm_summary.get('primaryActions', []))}")
                    print(f"      Navigation Paths: {len(llm_summary.get('navigationPaths', []))}")
                    
            else:
                print(f"   ❌ Site mapping failed: {site_map.get('error')}")
                
        except Exception as e:
            print(f"   ❌ Site mapping test failed: {e}")
        
        # 🧪 STEP 7: Test Browser History Navigation
        print("\n4. Testing Browser History Navigation...")
        try:
            # Get current history state
            history_state = await client.send_command("getHistoryState", {})
            if history_state.get('ok'):
                data = history_state.get('result', {})
                print(f"   ✅ Current History State:")
                print(f"      Current Index: {data.get('currentIndex')}")
                print(f"      Total Entries: {data.get('totalEntries')}")
                print(f"      Can Go Back: {data.get('canGoBack')}")
                print(f"      Can Go Forward: {data.get('canGoForward')}")
                
                # Show history entries
                history = data.get('history', [])
                if history:
                    print(f"   📚 History Entries:")
                    for i, entry in enumerate(history):
                        marker = " → " if entry.get('isCurrent') else "   "
                        print(f"      {marker}{i}: {entry.get('title', 'No title')}")
                        print(f"         {entry.get('url')}")
                
                # Test navigation if possible
                if data.get('canGoBack'):
                    print(f"   ⬅️ Testing Back Navigation...")
                    back_result = await client.send_command("navigateBack", {"steps": 1})
                    if back_result.get('ok'):
                        result_data = back_result.get('result', {})
                        print(f"      ✅ Back navigation successful!")
                        print(f"         From: {result_data.get('fromIndex')}")
                        print(f"         To: {result_data.get('toIndex')}")
                        print(f"         Target: {result_data.get('targetTitle')}")
                        
                        # Wait and go forward
                        await asyncio.sleep(2)
                        print(f"   ➡️ Testing Forward Navigation...")
                        forward_result = await client.send_command("navigateForward", {"steps": 1})
                        if forward_result.get('ok'):
                            result_data = forward_result.get('result', {})
                            print(f"      ✅ Forward navigation successful!")
                            print(f"         From: {result_data.get('fromIndex')}")
                            print(f"         To: {result_data.get('toIndex')}")
                            print(f"         Target: {result_data.get('targetTitle')}")
                        else:
                            print(f"      ❌ Forward navigation failed: {forward_result.get('error')}")
                    else:
                        print(f"      ❌ Back navigation failed: {back_result.get('error')}")
                else:
                    print(f"   ⚠️ Cannot test back navigation - no history")
                    
            else:
                print(f"   ❌ History state failed: {history_state.get('error')}")
                
        except Exception as e:
            print(f"   ❌ History navigation test failed: {e}")
        
        # 🧪 STEP 8: Test History Search
        print("\n5. Testing History Search...")
        try:
            # Search for current domain
            search_result = await client.send_command("searchHistory", {"domain": "example.com"})
            if search_result.get('ok'):
                results = search_result.get('result', [])
                print(f"   ✅ History Search Results:")
                print(f"      Found {len(results)} entries for example.com")
                for i, entry in enumerate(results[:3]):
                    print(f"         {i+1}. {entry.get('title', 'No title')}")
                    print(f"            {entry.get('url')}")
            else:
                print(f"   ❌ History search failed: {search_result.get('error')}")
                
        except Exception as e:
            print(f"   ❌ History search test failed: {e}")
        
        print("\n✅ Comprehensive Feature Test Completed!")
        
        # 🧹 Clean up
        listener_task.cancel()
        await client.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        await client.close()

if __name__ == "__main__":
    asyncio.run(test_comprehensive_features())
