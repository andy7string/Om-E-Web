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
import time

# Configuration
WEBSOCKET_URI = "ws://localhost:17892"
SITE_STRUCTURES_DIR = "@site_structures"

class PipelineTrigger:
    def __init__(self):
        self.websocket = None
        self.pending_commands = {}
        self.command_id = 0
        self.timings = {}
        
    async def connect(self):
        """Connect to the WebSocket server"""
        start_time = time.time()
        try:
            self.websocket = await websockets.connect(WEBSOCKET_URI)
            connect_time = time.time() - start_time
            print(f"✅ Connected to WebSocket server ({connect_time:.2f}s)")
            self.timings['connection'] = connect_time
            return True
        except Exception as e:
            connect_time = time.time() - start_time
            print(f"❌ Failed to connect ({connect_time:.2f}s): {e}")
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
        
        print(f"📤 Sending command: {command} with ID: {command_id}")
        print(f"📋 Pending commands after adding: {list(self.pending_commands.keys())}")
        
        start_time = time.time()
        try:
            await self.websocket.send(json.dumps(message))
            print(f"📤 Sent command: {command}")
            
            # Wait for response with timeout
            response = await asyncio.wait_for(future, timeout=30.0)
            command_time = time.time() - start_time
            print(f"⏱️ Command '{command}' completed in {command_time:.2f}s")
            
            # Store timing for this command
            if command not in self.timings:
                self.timings[command] = []
            self.timings[command].append(command_time)
            
            return response
            
        except asyncio.TimeoutError:
            command_time = time.time() - start_time
            print(f"⏰ Timeout waiting for response to: {command} ({command_time:.2f}s)")
            self.pending_commands.pop(command_id, None)
            return None
        except Exception as e:
            command_time = time.time() - start_time
            print(f"❌ Error sending command '{command}' ({command_time:.2f}s): {e}")
            self.pending_commands.pop(command_id, None)
            return None
    
    async def listen_for_responses(self):
        """Listen for responses from the server"""
        print("🎧 Response listener started and waiting for messages...")
        try:
            async for message in self.websocket:
                print(f"📨 Raw message received: {message}")
                try:
                    data = json.loads(message)
                    print(f"📨 Parsed response: {data}")
                    
                    # Check if this is a response to a pending command
                    if "id" in data:
                        command_id = data["id"]
                        print(f"🔍 Looking for pending command with ID: {command_id}")
                        print(f"📋 Pending commands: {list(self.pending_commands.keys())}")
                        
                        future = self.pending_commands.pop(command_id, None)
                        if future and not future.done():
                            print(f"✅ Found pending command, resolving future for ID: {command_id}")
                            future.set_result(data)
                        else:
                            print(f"⚠️ No pending command found for ID: {command_id}")
                    
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
            import traceback
            traceback.print_exc()
    
    async def wait_for_extension_ready(self, timeout=30):
        """Wait for the extension to be ready"""
        print("⏳ Waiting for extension to be ready...")
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                # Send a getCurrentTabInfo command to check if extension is responsive
                response = await self.send_command("getCurrentTabInfo", {})
                if response and response.get("ok"):
                    print("✅ Extension is ready!")
                    return True
            except Exception:
                pass
            
            print("⏳ Extension not ready yet, waiting...")
            await asyncio.sleep(2)
        
        print("❌ Extension not ready after timeout")
        return False

    async def trigger_pipeline(self, target_url=None):
        """Trigger the complete pipeline"""
        pipeline_start = time.time()
        print("🚀 Starting pipeline trigger...")
        
        # Step 1: Generate site map
        step1_start = time.time()
        print("\n📊 Step 1: Generating site map...")
        if target_url:
            # Navigate to specific URL first
            nav_start = time.time()
            print(f"🌐 Navigating to: {target_url}")
            nav_result = await self.send_command("navigate", {"url": target_url})
            if not nav_result or not nav_result.get("ok"):
                print("❌ Navigation failed")
                return False
            
            nav_time = time.time() - nav_start
            print(f"⏱️ Navigation completed in {nav_time:.2f}s")
            
            # Wait for page to load
            print("⏳ Waiting for page to load...")
            await asyncio.sleep(3)
        
        # Generate site map
        sitemap_start = time.time()
        site_map_result = await self.send_command("generateSiteMap", {})
        if not site_map_result or not site_map_result.get("ok"):
            print("❌ Site map generation failed")
            return False
        
        sitemap_time = time.time() - sitemap_start
        step1_time = time.time() - step1_start
        print(f"✅ Site map generated successfully! (Step 1: {step1_time:.2f}s)")
        
        # Step 2: Wait for pipeline files to be created
        step2_start = time.time()
        print("\n⏳ Step 2: Waiting for pipeline files to be created...")
        print("   (The server should auto-process and create _clean, _elements, _mappings, _processed files)")
        
        # Wait a bit for server processing
        await asyncio.sleep(5)
        step2_time = time.time() - step2_start
        print(f"⏱️ Step 2 completed in {step2_time:.2f}s")
        
        # Step 3: Check what files were created
        step3_start = time.time()
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
        
        step3_time = time.time() - step3_start
        print(f"⏱️ Step 3 completed in {step3_time:.2f}s")
        
        # Step 4: Check if we have the processed file
        step4_start = time.time()
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
                        except Exception:
                            pass
                            
                except Exception as e:
                    print(f"      ❌ Error reading file: {e}")
        else:
            print("⚠️ No processed files found yet")
        
        step4_time = time.time() - step4_start
        print(f"⏱️ Step 4 completed in {step4_time:.2f}s")
        
        # Calculate total pipeline time
        total_pipeline_time = time.time() - pipeline_start
        
        print("✅ Pipeline trigger completed!")
        print(f"⏱️ Total pipeline time: {total_pipeline_time:.2f}s")
        
        # Print timing summary
        self.print_timing_summary()
        
        return True
    
    def print_timing_summary(self):
        """Print a summary of all timings"""
        print("\n📊 TIMING SUMMARY:")
        print("=" * 50)
        
        if 'connection' in self.timings:
            print(f"🔌 Connection: {self.timings['connection']:.2f}s")
        
        if 'navigate' in self.timings:
            nav_times = self.timings['navigate']
            print(f"🌐 Navigation: {sum(nav_times):.2f}s (avg: {sum(nav_times)/len(nav_times):.2f}s)")
        
        if 'generateSiteMap' in self.timings:
            sitemap_times = self.timings['generateSiteMap']
            print(f"📊 Site Map Generation: {sum(sitemap_times):.2f}s (avg: {sum(sitemap_times)/len(sitemap_times):.2f}s)")
        
        # Calculate file processing time (if we have timing data)
        if 'generateSiteMap' in self.timings:
            sitemap_time = sum(self.timings['generateSiteMap'])
            print(f"📁 File Processing: ~{sitemap_time:.2f}s (estimated from site map generation)")
        
        print("=" * 50)
    
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
        
        # Give the listener a moment to start up
        await asyncio.sleep(0.1)
        
        # Wait for extension to be ready
        if not await pipeline.wait_for_extension_ready():
            print("❌ Extension not ready, cannot proceed")
            return
        
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
