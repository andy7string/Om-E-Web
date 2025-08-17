#!/usr/bin/env python3
"""
🧪 Test Site Mapping Functionality

This script tests ONLY the site mapping feature:
- generateSiteMap - LLM-friendly site mapping with click coordinates

🔗 FULL ROUND-TRIP COMMUNICATION PATTERN:
Test Client → WebSocket Server → Service Worker → Content Script → DOM → Response → Service Worker → Server → Test Client
"""

import asyncio
import json
import websockets
import uuid

class WebSocketTestClient:
    """WebSocket Test Client for Chrome Extension Communication"""
    
    def __init__(self, uri="ws://127.0.0.1:17892"):
        self.uri = uri
        self.ws = None
        self.pending_commands = {}
        
    async def connect(self):
        """Establish WebSocket connection to the server"""
        print(f"🔌 Connecting to {self.uri}...")
        self.ws = await websockets.connect(self.uri)
        print("✅ Connected to WebSocket server")
        
    async def send_command(self, command, params=None, timeout=15.0):
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

async def test_site_mapping():
    """
    🧪 Test Site Mapping Functionality
    
    This function tests ONLY:
    1. generateSiteMap - Comprehensive site mapping with coordinates
    2. Detailed analysis of the generated map
    """
    print("🧪 Testing Site Mapping Functionality...")
    
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
            await client.send_command("navigate", {"url": "https://example.com"})
            print("   ✅ Navigation command successful!")
            
            # Wait for page to load
            await asyncio.sleep(3)
            
        except Exception as e:
            print(f"   ❌ Navigation failed: {e}")
            return
        
        # 🧪 STEP 5: Test generateSiteMap
        print("\n2. Testing generateSiteMap...")
        try:
            site_map = await client.send_command("generateSiteMap", {})
            if site_map.get('ok'):
                data = site_map.get('result', {})
                
                print("   ✅ Site Map Generated Successfully!")
                
                # 📊 Basic Statistics
                stats = data.get('statistics', {})
                print("\n   📊 BASIC STATISTICS:")
                print(f"      Total Elements: {stats.get('totalElements', 0)}")
                print(f"      Clickable Elements: {stats.get('clickableElements', 0)}")
                print(f"      Form Elements: {stats.get('formElements', 0)}")
                print(f"      Navigation Elements: {stats.get('navigationElements', 0)}")
                print(f"      Processing Time: {stats.get('processingTime', 0):.1f}ms")
                
                # 📍 Interactive Elements Analysis
                interactive = data.get('interactiveElements', [])
                if interactive:
                    print("\n   📍 INTERACTIVE ELEMENTS ANALYSIS:")
                    print(f"      Total Interactive Elements: {len(interactive)}")
                    
                    # Group by type
                    type_counts = {}
                    for elem in interactive:
                        elem_type = elem.get('type', 'unknown')
                        type_counts[elem_type] = type_counts.get(elem_type, 0) + 1
                    
                    print("      Element Types:")
                    for elem_type, count in type_counts.items():
                        print(f"         {elem_type}: {count}")
                    
                    # Show sample elements with coordinates
                    print("\n   🎯 SAMPLE INTERACTIVE ELEMENTS WITH COORDINATES:")
                    for i, elem in enumerate(interactive[:5]):
                        coords = elem.get('coordinates', {})
                        print(f"      {i+1}. {elem.get('text', 'No text')[:30]}... ({elem.get('type')})")
                        print(f"         📍 Center: ({coords.get('x')}, {coords.get('y')})")
                        print(f"         📐 Bounds: ({coords.get('left')}, {coords.get('top')}) to ({coords.get('right')}, {coords.get('bottom')})")
                        print(f"         📏 Size: {coords.get('width')} x {coords.get('height')}")
                        print(f"         🎯 Selector: {elem.get('selector')}")
                        print(f"         🔗 Href: {elem.get('href', 'N/A')}")
                        
                        # Show accessibility info
                        accessibility = elem.get('accessibility', {})
                        print(f"         ♿ Accessibility: Clickable={accessibility.get('isClickable')}, Focusable={accessibility.get('isFocusable')}")
                        
                        # Show position info
                        position = elem.get('position', {})
                        print(f"         📍 Position: InViewport={position.get('inViewport')}, AboveFold={position.get('aboveFold')}")
                        print()
                
                # 📚 Page Structure Analysis
                page_structure = data.get('pageStructure', {})
                if page_structure:
                    print("\n   📚 PAGE STRUCTURE ANALYSIS:")
                    
                    # Headings
                    headings = page_structure.get('headings', [])
                    print(f"      Headings: {len(headings)}")
                    for i, heading in enumerate(headings[:3]):
                        coords = heading.get('coordinates', {})
                        print(f"         {i+1}. {heading.get('text', 'No text')[:40]}... (H{heading.get('level')})")
                        print(f"            📍 Coordinates: ({coords.get('x')}, {coords.get('y')})")
                        print(f"            🎯 Selector: {heading.get('selector')}")
                    
                    # Sections
                    sections = page_structure.get('sections', [])
                    print(f"      Sections: {len(sections)}")
                    for i, section in enumerate(sections[:3]):
                        coords = section.get('coordinates', {})
                        print(f"         {i+1}. {section.get('tag')} - {section.get('text', 'No text')[:50]}...")
                        print(f"            📍 Coordinates: ({coords.get('x')}, {coords.get('y')})")
                        print(f"            🎯 Selector: {section.get('selector')}")
                        print(f"            👶 Children: {section.get('children')}")
                    
                    # Forms
                    forms = page_structure.get('forms', [])
                    print(f"      Forms: {len(forms)}")
                    for i, form in enumerate(forms):
                        coords = form.get('coordinates', {})
                        print(f"         {i+1}. Form - Action: {form.get('action', 'N/A')}, Method: {form.get('method')}")
                        print(f"            📍 Coordinates: ({coords.get('x')}, {coords.get('y')})")
                        print(f"            🎯 Selector: {form.get('selector')}")
                        print(f"            📝 Inputs: {len(form.get('inputs', []))}")
                
                # 🔗 Navigation Map Analysis
                navigation_map = data.get('navigationMap', {})
                if navigation_map:
                    print("\n   🔗 NAVIGATION MAP ANALYSIS:")
                    
                    # Breadcrumbs
                    breadcrumbs = navigation_map.get('breadcrumbs', [])
                    print(f"      Breadcrumbs: {len(breadcrumbs)}")
                    for i, breadcrumb in enumerate(breadcrumbs):
                        print(f"         {i+1}. Breadcrumb with {len(breadcrumb.get('items', []))} items")
                        for j, item in enumerate(breadcrumb.get('items', [])[:3]):
                            print(f"            {j+1}. {item.get('text', 'No text')} - {item.get('href', 'N/A')} (Current: {item.get('isCurrent')})")
                    
                    # Navigation
                    navigation = navigation_map.get('navigation', [])
                    print(f"      Navigation: {len(navigation)}")
                    for i, nav in enumerate(navigation):
                        print(f"         {i+1}. Navigation with {len(nav.get('links', []))} links")
                        for j, link in enumerate(nav.get('links', [])[:3]):
                            print(f"            {j+1}. {link.get('text', 'No text')} - {link.get('href', 'N/A')} (Active: {link.get('isActive')})")
                
                # 🤖 LLM Summary Analysis
                llm_summary = data.get('llmSummary', {})
                if llm_summary:
                    print("\n   🤖 LLM SUMMARY ANALYSIS:")
                    print(f"      Page Purpose: {llm_summary.get('pagePurpose')}")
                    
                    # Content Summary
                    content_summary = llm_summary.get('contentSummary', {})
                    print("      Content Summary:")
                    print(f"         Headings: {content_summary.get('headings', 0)}")
                    print(f"         Sections: {content_summary.get('sections', 0)}")
                    print(f"         Forms: {content_summary.get('forms', 0)}")
                    print(f"         Interactive Elements: {content_summary.get('interactiveElements', 0)}")
                    
                    # Primary Actions
                    primary_actions = llm_summary.get('primaryActions', [])
                    print(f"      Primary Actions: {len(primary_actions)}")
                    for i, action in enumerate(primary_actions[:3]):
                        coords = action.get('coordinates', {})
                        print(f"         {i+1}. {action.get('action', 'No text')}")
                        print(f"            📍 Coordinates: ({coords.get('x')}, {coords.get('y')})")
                        print(f"            🎯 Selector: {action.get('selector')}")
                    
                    # Navigation Paths
                    navigation_paths = llm_summary.get('navigationPaths', [])
                    print(f"      Navigation Paths: {len(navigation_paths)}")
                    for i, path in enumerate(navigation_paths):
                        print(f"         {i+1}. {path.get('type')}: {path.get('path', 'No path')}")
                
                # 📊 Metadata Analysis
                metadata = data.get('metadata', {})
                if metadata:
                    print("\n   📊 METADATA ANALYSIS:")
                    print(f"      URL: {metadata.get('url')}")
                    print(f"      Title: {metadata.get('title')}")
                    print(f"      Timestamp: {metadata.get('timestamp')}")
                    print(f"      Processing Time: {metadata.get('processingTime', 0):.1f}ms")
                    print(f"      Output Size: {metadata.get('size', 0)} bytes")
                    
            else:
                print(f"   ❌ generateSiteMap failed: {site_map.get('error')}")
                
        except Exception as e:
            print(f"   ❌ generateSiteMap test failed: {e}")
        
        print("\n✅ Site Mapping Test Completed!")
        
        # 🧹 Clean up
        listener_task.cancel()
        await client.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        await client.close()

if __name__ == "__main__":
    asyncio.run(test_site_mapping())
