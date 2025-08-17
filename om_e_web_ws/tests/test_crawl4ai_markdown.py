#!/usr/bin/env python3
"""
🧪 Crawl4AI-Inspired Markdown Generation Test Client

This script demonstrates the full round-trip WebSocket communication pattern
between a test client, the WebSocket server, and the Chrome extension.

🔗 FULL ROUND-TRIP COMMUNICATION PATTERN:
1. Test Client → Server: Connects to WebSocket server on port 17892
2. Test Client → Server: Sends command with unique ID
3. Server → Extension: Forwards command to Chrome extension
4. Extension → Server: Executes command and sends response
5. Server → Test Client: Routes response back to test client
6. Test Client: Processes response and completes command

📡 ARCHITECTURE:
Test Client (WebSocket) ←→ Server (Port 17892) ←→ Chrome Extension (WebSocket)

🎯 KEY FEATURES:
- WebSocket client that connects to running server
- Background response listener for async communication
- Command ID tracking for response matching
- Comprehensive error handling and logging
- Tests Crawl4AI-inspired markdown generation
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
    
    🎯 USAGE PATTERN:
    1. Create client instance
    2. Connect to server
    3. Start response listener
    4. Send commands and wait for responses
    5. Close connection when done
    """
    
    def __init__(self, uri="ws://127.0.0.1:17892"):
        """
        Initialize the WebSocket test client
        
        Args:
            uri: WebSocket server URI (default: localhost:17892)
        """
        self.uri = uri
        self.ws = None
        self.pending_commands = {}  # Command ID → Future mapping
        
    async def connect(self):
        """
        🔌 Establish WebSocket connection to the server
        
        This creates the WebSocket connection that will be used for
        all communication with the server and extension.
        """
        print(f"🔌 Connecting to {self.uri}...")
        self.ws = await websockets.connect(self.uri)
        print("✅ Connected to WebSocket server")
        
    async def send_command(self, command, params=None, timeout=8.0):
        """
        🚀 Send a command to the extension via the server
        
        This method implements the command sending part of the round-trip:
        1. Generate unique command ID
        2. Create future for response tracking
        3. Send command to server
        4. Wait for response via future
        
        Args:
            command: Command name (e.g., 'navigate', 'getPageMarkdown')
            params: Command parameters (optional)
            timeout: Response timeout in seconds
            
        Returns:
            Response from extension
            
        Raises:
            RuntimeError: If not connected or command times out
        """
        if not self.ws:
            raise RuntimeError("Not connected to server")
            
        # Generate unique command ID for this request
        cid = f"cmd-{uuid.uuid4().hex[:8]}"
        payload = {"id": cid, "command": command, "params": params or {}}
        
        print(f"📤 Sending command: {command} with id: {cid}")
        
        # Create future for this command and store it
        fut = asyncio.get_event_loop().create_future()
        self.pending_commands[cid] = fut
        
        # Send command to server via WebSocket
        await self.ws.send(json.dumps(payload))
        
        # Wait for response via the future
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
        """
        🎧 Background task that listens for responses from the server
        
        This method runs continuously in the background and:
        1. Listens for incoming WebSocket messages
        2. Parses JSON responses
        3. Matches responses to pending commands
        4. Completes futures with response data
        
        🔄 RESPONSE MATCHING:
        - Each command gets a unique ID
        - Response contains the same ID
        - Future is completed with response data
        - Command waiting for response can proceed
        
        ⚠️ IMPORTANT: This must be started BEFORE sending commands
        """
        try:
            async for message in self.ws:
                try:
                    msg = json.loads(message)
                    print(f"📥 Received: {msg}")
                    
                    # Check if this is a response to a pending command
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
        """
        🔌 Close the WebSocket connection and clean up
        
        This method properly closes the WebSocket connection and
        should be called when the client is done.
        """
        if self.ws:
            await self.ws.close()
            print("🔌 WebSocket connection closed")

async def test_crawl4ai_markdown():
    """
    🧪 Main test function for Crawl4AI-inspired markdown generation
    
    This function demonstrates the complete round-trip communication:
    1. Connect to WebSocket server
    2. Start response listener
    3. Test basic connectivity (navigate command)
    4. Test markdown generation (getPageMarkdown command)
    5. Display results and statistics
    
    🎯 TEST SEQUENCE:
    1. Navigation test - Ensures extension can navigate to pages
    2. Markdown generation - Tests the new Crawl4AI functionality
    3. Result analysis - Shows processing time, content stats, etc.
    """
    print("🧪 Testing Crawl4AI-Inspired Markdown Generation...")
    
    client = WebSocketTestClient()
    
    try:
        # 🔌 STEP 1: Connect to the WebSocket server
        await client.connect()
        
        # 🎧 STEP 2: Start listening for responses in background
        print("   🔌 Starting response listener...")
        listener_task = asyncio.create_task(client.listen_for_responses())
        
        # ⏳ STEP 3: Wait for listener to be ready (CRITICAL!)
        print("   ⏳ Waiting for response listener to be ready...")
        await asyncio.sleep(2)  # Give listener time to start listening
        
        # 🧪 STEP 4: Test basic connectivity with navigation command
        print("\n2. Testing basic connectivity...")
        try:
            result = await client.send_command("navigate", {"url": "https://example.com"})
            print("   ✅ Navigation command successful!")
        except Exception as e:
            print(f"   ❌ Navigation failed: {e}")
            return
        
        # 🧪 STEP 5: Test the new Crawl4AI markdown generation command
        print("\n3. Testing getPageMarkdown command...")
        try:
            result = await client.send_command("getPageMarkdown", {})
            print("   ✅ Command executed successfully!")
            
            if result.get('ok'):
                data = result.get('result', {})
                print(f"   Processing time: {data.get('processingTime', 0):.1f}ms")
                print(f"   Output size: {data.get('size', 0)} bytes")
                print(f"   Headings found: {len(data.get('headings', []))}")
                print(f"   Paragraphs extracted: {len(data.get('paragraphs', []))}")
                print(f"   Links found: {len(data.get('links', []))}")
                
                # Show content filtering stats
                filtering = data.get('contentFiltering', {})
                print(f"   Content filtering: {filtering.get('filteredParagraphs', 0)} paragraphs kept")
                
                # Show first 300 chars of markdown
                markdown = data.get('markdown', '')
                if markdown:
                    print(f"   Preview: {markdown[:300]}...")
                else:
                    print("   ❌ No markdown generated")
                    
            else:
                print(f"   ❌ Error: {result.get('error')}")
                
        except Exception as e:
            print(f"   ❌ Command failed: {e}")
        
        print("\n✅ Test completed!")
        
        # 🧹 STEP 6: Clean up - cancel listener and close connection
        listener_task.cancel()
        await client.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        await client.close()

if __name__ == "__main__":
    # 🚀 Run the test with asyncio event loop
    asyncio.run(test_crawl4ai_markdown())
