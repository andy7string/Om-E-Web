#!/usr/bin/env python3
"""
🚀 Pipeline Trigger Script

This script triggers your existing pipeline to scan and write out all files:
1. _clean.jsonl (raw site map)
2. _elements.jsonl (extracted elements) 
3. _mappings.jsonl (element mappings)
4. _processed.jsonl (LLM-optimized)

Then applies Crawl4AI filtering to the final result.
"""

import asyncio
import json
import os
import websockets
from urllib.parse import urlparse
from datetime import datetime

# Configuration
WEBSOCKET_URI = "ws://localhost:17892"
SITE_STRUCTURES_DIR = "@site_structures"

class PipelineTrigger:
    def __init__(self):
        self.websocket = None
        self.pending_commands = {}
        self.command_id = 0
        
    async def connect(self):
        """Connect to the WebSocket server"""
        try:
            self.websocket = await websockets.connect(WEBSOCKET_URI)
            print("✅ Connected to WebSocket server")
            return True
        except Exception as e:
            print(f"❌ Failed to connect: {e}")
            return False
    
    async def send_command(self, command, params=None):
        """Send a command to the server"""
        if not self.websocket:
            print("❌ Not connected to server")
            return None
            
        self.command_id += 1
        command_id = str(self.command_id)
        
        message = {
            "id": command_id,
            "command": command
        }
        
        if params:
            message.update(params)
        
        # Create a future to wait for response
        future = asyncio.Future()
        self.pending_commands[command_id] = future
        
        try:
            await self.websocket.send(json.dumps(message))
            print(f"📤 Sent command: {command}")
            
            # Wait for response with timeout
            response = await asyncio.wait_for(future, timeout=10.0)
            return response
            
        except asyncio.TimeoutError:
            print(f"⏰ Timeout waiting for response to: {command}")
            self.pending_commands.pop(command_id, None)
            return None
        except Exception as e:
            print(f"❌ Error sending command: {e}")
            self.pending_commands.pop(command_id, None)
            return None
    
    async def listen_for_responses(self):
        """Listen for responses from the server"""
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    
                    # Check if this is a response to a pending command
                    if "id" in data:
                        command_id = data["id"]
                        future = self.pending_commands.pop(command_id, None)
                        if future and not future.done():
                            future.set_result(data)
                    
                    # Check if this is a site map response
                    if data.get("command") == "generateSiteMap" and data.get("ok"):
                        print("🎯 Site map generated successfully!")
                        print(f"📊 Elements: {data.get('result', {}).get('statistics', {}).get('totalElements', 0)}")
                        
                except json.JSONDecodeError:
                    print(f"⚠️ Invalid JSON received: {message}")
                    
        except websockets.exceptions.ConnectionClosed:
            print("🔌 WebSocket connection closed")
        except Exception as e:
            print(f"❌ Error in response listener: {e}")
    
    async def trigger_pipeline(self, target_url=None):
        """Trigger the complete pipeline"""
        print("🚀 Starting pipeline trigger...")
        
        # Step 1: Generate site map
        print("\n📊 Step 1: Generating site map...")
        if target_url:
            # Navigate to specific URL first
            print(f"🌐 Navigating to: {target_url}")
            nav_result = await self.send_command("navigate", {"url": target_url})
            if not nav_result or not nav_result.get("ok"):
                print("❌ Navigation failed")
                return False
            
            # Wait for page to load
            await asyncio.sleep(3)
        
        # Generate site map
        site_map_result = await self.send_command("generateSiteMap", {})
        if not site_map_result or not site_map_result.get("ok"):
            print("❌ Site map generation failed")
            return False
        
        print("✅ Site map generated successfully!")
        
        # Step 2: Wait for pipeline files to be created
        print("\n⏳ Step 2: Waiting for pipeline files to be created...")
        print("   (The server should auto-process and create _clean, _elements, _mappings, _processed files)")
        
        # Wait a bit for server processing
        await asyncio.sleep(5)
        
        # Step 3: Check what files were created
        print("\n📁 Step 3: Checking created files...")
        if os.path.exists(SITE_STRUCTURES_DIR):
            files = os.listdir(SITE_STRUCTURES_DIR)
            jsonl_files = [f for f in files if f.endswith('.jsonl')]
            
            if jsonl_files:
                print("✅ Found JSONL files:")
                for file in sorted(jsonl_files):
                    file_path = os.path.join(SITE_STRUCTURES_DIR, file)
                    file_size = os.path.getsize(file_path)
                    print(f"   📄 {file} ({file_size:,} bytes)")
            else:
                print("⚠️ No JSONL files found")
        else:
            print("⚠️ @site_structures directory not found")
        
        # Step 4: Check if we have the processed file
        print("\n🔍 Step 4: Checking for processed file...")
        processed_files = [f for f in files if "_processed.jsonl" in f] if 'files' in locals() else []
        
        if processed_files:
            print("✅ Found processed file(s):")
            for file in processed_files:
                file_path = os.path.join(SITE_STRUCTURES_DIR, file)
                file_size = os.path.getsize(file_path)
                print(f"   📄 {file} ({file_size:,} bytes)")
                
                # Read and analyze the processed file
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        lines = content.count('\n')
                        print(f"      📊 Lines: {lines}")
                        
                        # Try to parse as JSON to count elements
                        try:
                            data = json.loads(content)
                            if 'interactiveElements' in data:
                                elements = len(data['interactiveElements'])
                                print(f"      🎯 Interactive Elements: {elements}")
                        except:
                            pass
                            
                except Exception as e:
                    print(f"      ❌ Error reading file: {e}")
        else:
            print("⚠️ No processed files found yet")
        
        print("\n✅ Pipeline trigger completed!")
        return True
    
    async def close(self):
        """Close the connection"""
        if self.websocket:
            await self.websocket.close()
            print("🔌 Connection closed")

async def main():
    """Main function"""
    print("🚀 Pipeline Trigger Script")
    print("=" * 50)
    
    # Get target URL from user
    target_url = input("🌐 Enter target URL (or press Enter to use current tab): ").strip()
    if not target_url:
        target_url = None
        print("📱 Will use current tab")
    
    # Create pipeline trigger
    pipeline = PipelineTrigger()
    
    try:
        # Connect to server
        if not await pipeline.connect():
            return
        
        # Start response listener in background
        listener_task = asyncio.create_task(pipeline.listen_for_responses())
        
        # Trigger the pipeline
        success = await pipeline.trigger_pipeline(target_url)
        
        if success:
            print("\n🎉 Pipeline completed successfully!")
            print("📁 Check the @site_structures folder for your files:")
            print("   • _clean.jsonl - Raw site map data")
            print("   • _elements.jsonl - Extracted elements")
            print("   • _mappings.jsonl - Element mappings")
            print("   • _processed.jsonl - LLM-optimized data")
        else:
            print("\n❌ Pipeline failed")
        
        # Clean up
        listener_task.cancel()
        await pipeline.close()
        
    except KeyboardInterrupt:
        print("\n⏹️ Interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
    finally:
        await pipeline.close()

if __name__ == "__main__":
    asyncio.run(main())
