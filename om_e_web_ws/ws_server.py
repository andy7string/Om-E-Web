#!/usr/bin/env python3
"""
🚀 WebSocket Server for Chrome Extension Communication

This server acts as a bridge between test clients and the Chrome extension,
enabling full round-trip communication for browser automation commands.

🔗 FULL ROUND-TRIP COMMUNICATION PATTERN:
1. Test Client → Server: Sends command with unique ID
2. Server → Extension: Forwards command to Chrome extension
3. Extension → Server: Executes command and sends response
4. Server → Test Client: Routes response back to original client

📡 MESSAGE FLOW:
Test Client (WebSocket) → Server (Port 17892) → Chrome Extension (WebSocket)
Chrome Extension → Server → Test Client

🎯 KEY COMPONENTS:
- CLIENTS: Set of all connected WebSocket clients
- EXTENSION_WS: Reference to the Chrome extension client
- PENDING: Dictionary mapping command IDs to futures for response routing
"""

import asyncio
import json
import websockets
import uuid
import os
from urllib.parse import urlparse

# Global state for managing WebSocket connections and command routing
CLIENTS = set()                    # All connected WebSocket clients
PENDING = {}                       # Command ID → Future mapping for response routing
EXTENSION_WS = None               # Reference to the Chrome extension client

# 📊 Tab information storage for external access
CURRENT_TABS_INFO = None           # Latest tabs_info from extension
LAST_TABS_UPDATE = None            # Timestamp of last update

# 📁 Site map storage configuration
SITE_STRUCTURES_DIR = "@site_structures"

def get_current_tabs_info():
    """
    📊 Get the latest tab information that was received from the extension
    
    This function provides external access to the tab information that's
    being printed to the terminal, allowing clients to programmatically
    retrieve current tab status.
    
    @returns {Object} - Current tabs information with metadata
    """
    if CURRENT_TABS_INFO is None:
        return {
            "error": "No tab information available yet",
            "status": "waiting_for_extension"
        }
    
    return {
        "tabs": CURRENT_TABS_INFO,
        "last_update": LAST_TABS_UPDATE,
        "extension_connected": EXTENSION_WS is not None,
        "total_clients": len(CLIENTS)
    }

def save_site_map_to_jsonl(site_map_data, suffix=""):
    """
    💾 Save site map data to a JSONL file in the @site_structures folder
    
    This function takes the site map data that's already flowing through the server
    and saves it to a JSONL file named after the website's hostname.
    
    @param site_map_data: Raw site map data from extension
    @param suffix: Optional suffix to add to filename (e.g., "_clean")
    @return: File path if successful, None if failed
    """
    try:
        # Ensure the site structures directory exists
        if not os.path.exists(SITE_STRUCTURES_DIR):
            os.makedirs(SITE_STRUCTURES_DIR)
            print(f"📁 Created directory: {SITE_STRUCTURES_DIR}")
        
        # Extract URL and generate filename
        url = site_map_data.get('metadata', {}).get('url', 'unknown')
        parsed_url = urlparse(url)
        hostname = parsed_url.hostname or 'unknown'
        filename = f"{hostname}{suffix}.jsonl"
        filepath = os.path.join(SITE_STRUCTURES_DIR, filename)
        
        # Write the entire site map data to JSONL file with proper formatting
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(json.dumps(site_map_data, ensure_ascii=False, indent=2) + '\n')
        
        print(f"💾 Site map saved to: {filepath}")
        print(f"📊 Elements: {site_map_data.get('statistics', {}).get('totalElements', 0)}")
        
        return filepath
        
    except Exception as e:
        print(f"❌ Error saving site map: {e}")
        return None

def process_clean_site_map(raw_file_path):
    """
    🧠 Process raw site map data into LLM-friendly format
    
    This function takes the raw _clean.jsonl file and processes it to:
    1. Extract the interactive elements
    2. Add unique FindMe_id to each element
    3. Create LLM-optimized structure
    4. Generate mapping between processed and raw data
    
    @param raw_file_path: Path to the _clean.jsonl file
    @return: Tuple of (processed_data, mapping_data, success_status)
    """
    try:
        print(f"🧠 Processing raw site map: {raw_file_path}")
        
        # Read the raw JSONL file
        with open(raw_file_path, 'r', encoding='utf-8') as f:
            raw_data = json.loads(f.read())
        
        # Extract key components
        metadata = raw_data.get('metadata', {})
        interactive_elements = raw_data.get('interactiveElements', [])
        page_structure = raw_data.get('pageStructure', {})
        
        print(f"📊 Raw data contains {len(interactive_elements)} interactive elements")
        
        # Create processed elements with FindMe_id
        processed_elements = []
        element_mapping = {}
        
        for index, element in enumerate(interactive_elements):
            # Create unique FindMe_id
            findme_id = f"FindMe_{index + 1:03d}"
            
            # Create processed element
            processed_element = {
                "FindMe_id": findme_id,
                "type": element.get("type", "unknown"),
                "text": element.get("text", "")[:100],  # Truncate long text
                "href": element.get("href"),
                "selector": element.get("selector"),
                "coordinates": element.get("coordinates", {}),
                "accessibility": element.get("accessibility", {}),
                "position": element.get("position", {})
            }
            
            processed_elements.append(processed_element)
            
            # Create mapping entry
            element_mapping[findme_id] = {
                "original_index": index,
                "original_element": element,
                "processed_element": processed_element
            }
        
        # Create processed data structure
        processed_data = {
            "metadata": metadata,
            "statistics": {
                "totalElements": len(processed_elements),
                "originalElements": len(interactive_elements),
                "processingRatio": len(processed_elements) / len(interactive_elements) if interactive_elements else 0
            },
            "elements": processed_elements,
            "pageStructure": page_structure
        }
        
        # Create mapping data
        mapping_data = {
            "metadata": metadata,
            "elementMapping": element_mapping,
            "processingInfo": {
                "timestamp": asyncio.get_event_loop().time(),
                "totalMapped": len(element_mapping),
                "processingStatus": "success"
            }
        }
        
        print(f"✅ Processing complete: {len(interactive_elements)} → {len(processed_elements)} elements")
        print(f"🔗 Element mapping created for {len(element_mapping)} elements")
        
        return processed_data, mapping_data, True
        
    except Exception as e:
        print(f"❌ Error processing site map: {e}")
        return None, None, False

async def handler(ws):
    """
    🔌 WebSocket connection handler for each client
    
    This function manages the lifecycle of each WebSocket connection and
    implements the core message routing logic between clients.
    
    🎯 CLIENT IDENTIFICATION:
    - First client to connect becomes the extension
    - Clients sending 'bridge_status' messages are marked as extensions
    - Other clients are treated as test clients
    
    📨 MESSAGE ROUTING:
    - Commands from test clients → Forwarded to extension
    - Responses from extension → Routed back to test clients
    - Tab updates from extension → Logged for debugging
    """
    global EXTENSION_WS
    print(f"🔌 Client connected! Total clients: {len(CLIENTS) + 1}")
    CLIENTS.add(ws)
    
    # First client to connect becomes the extension (Chrome extension)
    if EXTENSION_WS is None:
        EXTENSION_WS = ws
        print("🎯 Marked as extension client")
    
    try:
        # Listen for incoming messages from this client
        async for raw in ws:
            # Show full message for tab info, truncated for others
            if raw.startswith('{"type":"tabs_info"'):
                print(f"📨 Received: {raw}")
            else:
                print(f"📨 Received: {raw[:100]}...")
            msg = json.loads(raw)
            
            # 🎯 EXTENSION IDENTIFICATION: Mark clients sending bridge_status as extensions
            if msg.get("type") == "bridge_status":
                EXTENSION_WS = ws
                print("🎯 Marked as extension client (bridge_status)")
            
            # 📊 TAB INFORMATION STORAGE: Store latest tabs_info for external access
            if msg.get("type") == "tabs_info":
                global CURRENT_TABS_INFO, LAST_TABS_UPDATE
                CURRENT_TABS_INFO = msg.get("tabs", [])
                LAST_TABS_UPDATE = asyncio.get_event_loop().time()
                print(f"📊 Tab info updated and stored - {len(CURRENT_TABS_INFO)} tabs available")
            
            # 🔄 COMMAND FORWARDING: Route commands from test clients to extension
            if "command" in msg and "id" in msg:
                command = msg.get("command")
                
                # 🎯 INTERNAL SERVER COMMANDS: Handle commands that don't go to extension
                if command == "getTabsInfo":
                    print(f"📊 Internal command: {command} - returning stored tab info")
                    response = {
                        "id": msg["id"],
                        "ok": True,
                        "result": get_current_tabs_info(),
                        "error": None
                    }
                    await ws.send(json.dumps(response))
                    continue
                
                # 🔄 EXTENSION COMMANDS: Forward other commands to extension
                print(f"🔄 Forwarding command to extension: {command}")
                if EXTENSION_WS and EXTENSION_WS != ws:
                    await EXTENSION_WS.send(json.dumps(msg))
                    print("✅ Command forwarded to extension")
                else:
                    print("❌ No extension to forward to")
            
            # 📥 RESPONSE HANDLING: Process responses from extension and route to test clients
            if "id" in msg and ("ok" in msg or "error" in msg):
                print(f"📥 Response received for id: {msg['id']}")
                
                # 💾 AUTO-SAVE SITE MAP: If this is a successful generateSiteMap response, save to file
                if msg.get("ok") and msg.get("result") and "statistics" in msg.get("result", {}):
                    print("🔍 SITE MAP DETECTED - Auto-saving to JSONL file...")
                    
                    # Check if this has overlay removal (clean version)
                    if "overlayRemoval" in msg.get("result", {}):
                        print("🧹 CLEAN SITE MAP detected - saving as [hostname]_clean.jsonl")
                        saved_file = save_site_map_to_jsonl(msg["result"], suffix="_clean")
                    else:
                        print("📊 ORIGINAL SITE MAP detected - saving as [hostname].jsonl")
                        saved_file = save_site_map_to_jsonl(msg["result"])
                    
                    if saved_file:
                        print(f"🎯 Site map automatically saved to: {saved_file}")
                        
                        # 🧠 AUTO-PROCESS: If this is a clean file, process it for LLM consumption
                        if "_clean.jsonl" in saved_file:
                            print("🧠 Auto-processing clean site map for LLM consumption...")
                            try:
                                processed_data, mapping_data, success = process_clean_site_map(saved_file)
                                if success:
                                    # Save processed data
                                    processed_filename = saved_file.replace("_clean.jsonl", "_processed.jsonl")
                                    with open(processed_filename, 'w', encoding='utf-8') as f:
                                        json.dump(processed_data, f, ensure_ascii=False, indent=2)
                                    
                                    # Save mapping data
                                    mapping_filename = saved_file.replace("_clean.jsonl", "_mapping.json")
                                    with open(mapping_filename, 'w', encoding='utf-8') as f:
                                        json.dump(mapping_data, f, ensure_ascii=False, indent=2)
                                    
                                    print(f"✅ Processed data saved to: {processed_filename}")
                                    print(f"🔗 Element mapping saved to: {mapping_filename}")
                                else:
                                    print("❌ Failed to process site map for LLM consumption")
                            except Exception as e:
                                print(f"❌ Error during auto-processing: {e}")
                
                # First, try to find the pending future in our PENDING dict
                # This handles responses for commands sent via send_command() function
                fut = PENDING.pop(msg["id"], None)
                if fut and not fut.done():
                    print(f"✅ Setting future result for {msg['id']}")
                    fut.set_result(msg)
                else:
                    print(f"⚠️ No pending future found for {msg['id']}")
                    
                    # 🎯 RESPONSE ROUTING: If no pending future, route response to test client
                    # This handles responses for commands sent by external test clients
                    for client in CLIENTS:
                        if client != EXTENSION_WS and client != ws:
                            print(f"📤 Forwarding response to test client: {msg['id']}")
                            try:
                                await client.send(json.dumps(msg))
                                print("✅ Response forwarded to test client")
                                break
                            except Exception as e:
                                print(f"❌ Failed to forward response to test client: {e}")
                                continue
    finally:
        # Clean up when client disconnects
        CLIENTS.discard(ws)
        if ws == EXTENSION_WS:
            EXTENSION_WS = None
            print("🎯 Extension client disconnected")
        print(f"🔌 Client disconnected! Total clients: {len(CLIENTS)}")

async def send_command(command, params=None, timeout=8.0):
    """
    🚀 Internal command sender for server-to-extension communication
    
    This function is used by the server itself to send commands to the extension
    and wait for responses using the PENDING futures system.
    
    🔄 INTERNAL COMMAND FLOW:
    1. Generate unique command ID
    2. Create future and store in PENDING dict
    3. Send command to extension
    4. Wait for response via future
    5. Clean up PENDING entry
    
    ⚠️ NOTE: This is for INTERNAL server use, not for external test clients
    """
    print(f"🔍 send_command called with {len(CLIENTS)} clients")
    
    # Wait a moment for extension to be identified
    for _ in range(10):  # Try for 1 second
        if EXTENSION_WS:
            break
        await asyncio.sleep(0.1)
    
    if not EXTENSION_WS:
        print("❌ No extension client connected")
        raise RuntimeError("No extension connected")
    
    # Generate unique command ID for this request
    cid = f"cmd-{uuid.uuid4().hex[:8]}"
    payload = {"id": cid, "command": command, "params": params or {}}
    print(f"📤 Sending command: {command} with id: {cid} to extension")
    
    # Create future and store it in PENDING for response routing
    fut = asyncio.get_event_loop().create_future()
    PENDING[cid] = fut
    print(f"📋 Future created and stored for {cid}")
    
    # Send command to extension via WebSocket
    await EXTENSION_WS.send(json.dumps(payload))
    
    # Wait for response via the future
    try:
        result = await asyncio.wait_for(fut, timeout=timeout)
        print(f"✅ Response received for {cid}: {result}")
        return result
    except asyncio.TimeoutError:
        print(f"⏰ Timeout waiting for response to {cid}")
        PENDING.pop(cid, None)  # Clean up
        raise RuntimeError(f"Command {command} timed out")
    except Exception as e:
        print(f"❌ Error waiting for response to {cid}: {e}")
        PENDING.pop(cid, None)  # Clean up
        raise

async def main():
    """
    🚀 Main server function - starts WebSocket server on port 17892
    
    The server listens for connections from:
    - Chrome extension (becomes EXTENSION_WS)
    - Test clients (can send commands and receive responses)
    
    📡 SERVER ENDPOINT: ws://127.0.0.1:17892
    """
    async with websockets.serve(handler, "127.0.0.1", 17892):
        print("WS listening on ws://127.0.0.1:17892")
        await asyncio.Future()  # Keep server running indefinitely

if __name__ == "__main__":
    asyncio.run(main())
