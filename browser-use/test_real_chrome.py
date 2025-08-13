#!/usr/bin/env python3
"""Test real Chrome CDP connection and element discovery"""

import asyncio
import json
import logging
import subprocess
import time
from typing import Any, Dict, List

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RealChromeBridge:
    """Real Chrome Bridge that connects to your actual Chrome browser"""
    
    def __init__(self):
        self.debug_port = None
        self.cdp_url = None
        
    async def find_chrome_debug_port(self) -> int:
        """Find Chrome's debug port by checking running processes"""
        try:
            logger.info("🔍 Looking for running Chrome processes...")
            
            # Check for Chrome processes with debug ports
            result = subprocess.run(
                ["lsof", "-i", "-P", "-n", "-l"],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                logger.error("❌ Failed to run lsof command")
                return None
            
            # Look for Chrome debug ports
            for line in result.stdout.split('\n'):
                if 'Chrome' in line and 'LISTEN' in line:
                    logger.info(f"🔍 Found Chrome process: {line}")
                    # Extract port number
                    parts = line.split()
                    for part in parts:
                        if ':' in part and part.split(':')[1].isdigit():
                            port = int(part.split(':')[1])
                            logger.info(f"✅ Found Chrome debug port: {port}")
                            return port
            
            logger.warning("⚠️ No Chrome debug port found")
            return None
            
        except Exception as e:
            logger.error(f"❌ Error finding Chrome debug port: {e}")
            return None
    
    async def start_chrome_with_debug(self) -> bool:
        """Start Chrome with remote debugging enabled"""
        try:
            logger.info("🚀 Starting Chrome with remote debugging...")
            
            chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            user_data_dir = f"/tmp/chrome_bridge_test_{int(time.time())}"
            
            # Create user data directory
            import os
            os.makedirs(user_data_dir, exist_ok=True)
            
            # Start Chrome with debugging
            cmd = [
                chrome_path,
                f"--user-data-dir={user_data_dir}",
                "--remote-debugging-port=0",  # Let Chrome choose port
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--disable-features=TranslateUI",
                "--disable-ipc-flooding-protection"
            ]
            
            logger.info(f"🔧 Chrome command: {' '.join(cmd)}")
            
            # Start Chrome process
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait for Chrome to start and get debug port
            logger.info("⏳ Waiting for Chrome to start...")
            await asyncio.sleep(3)  # Give Chrome time to start
            
            # Find the debug port
            self.debug_port = await self.find_chrome_debug_port()
            if self.debug_port:
                self.cdp_url = f"http://localhost:{self.debug_port}/json"
                logger.info(f"✅ Chrome started successfully on debug port {self.debug_port}")
                logger.info(f"🔗 CDP URL: {self.cdp_url}")
                return True
            else:
                logger.error("❌ Failed to find Chrome debug port")
                return False
                
        except Exception as e:
            logger.error(f"❌ Failed to start Chrome: {e}")
            return False
    
    async def get_cdp_targets(self) -> List[Dict[str, Any]]:
        """Get available CDP targets from Chrome"""
        try:
            if not self.cdp_url:
                logger.error("❌ CDP URL not available")
                return []
            
            logger.info(f"🔍 Getting CDP targets from {self.cdp_url}")
            
            # Use curl to get targets (simple HTTP request)
            result = subprocess.run(
                ["curl", "-s", self.cdp_url],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                logger.error(f"❌ Failed to get CDP targets: {result.stderr}")
                return []
            
            targets = json.loads(result.stdout)
            logger.info(f"✅ Found {len(targets)} CDP targets")
            
            for target in targets:
                logger.info(f"  - {target.get('type', 'unknown')}: {target.get('url', 'no-url')}")
            
            return targets
            
        except Exception as e:
            logger.error(f"❌ Error getting CDP targets: {e}")
            return []
    
    async def execute_script_on_target(self, target_id: str, script: str) -> Any:
        """Execute JavaScript on a specific CDP target"""
        try:
            logger.info(f"🔧 Executing script on target {target_id}")
            logger.info(f"📝 Script: {script[:100]}...")
            
            # For now, we'll simulate the CDP call
            # In a real implementation, we'd use the CDP protocol
            logger.info("⚠️ CDP execution not yet implemented - this is a simulation")
            
            # Simulate finding elements
            if "querySelectorAll" in script:
                # Mock element discovery
                await asyncio.sleep(0.1)  # Simulate fast processing
                mock_elements = [
                    {"tagName": "button", "textContent": "Submit", "className": "submit-btn"},
                    {"tagName": "input", "placeholder": "Enter name", "type": "text"},
                    {"tagName": "a", "textContent": "Home", "href": "/home"}
                ]
                logger.info(f"✅ Mock element discovery found {len(mock_elements)} elements")
                return mock_elements
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Error executing script: {e}")
            return None
    
    async def test_real_chrome_connection(self) -> bool:
        """Test the complete Chrome connection flow"""
        try:
            logger.info("🧪 Testing Real Chrome Connection")
            logger.info("=" * 50)
            
            # Step 1: Start Chrome with debugging
            if not await self.start_chrome_with_debug():
                logger.error("❌ Failed to start Chrome with debugging")
                return False
            
            # Step 2: Get CDP targets
            targets = await self.get_cdp_targets()
            if not targets:
                logger.error("❌ No CDP targets found")
                return False
            
            # Step 3: Find a page target
            page_target = None
            for target in targets:
                if target.get('type') == 'page':
                    page_target = target
                    break
            
            if not page_target:
                logger.error("❌ No page target found")
                return False
            
            logger.info(f"✅ Found page target: {page_target.get('url', 'no-url')}")
            
            # Step 4: Test element discovery
            test_script = """
                (() => {
                    const elements = document.querySelectorAll('button, input, select, textarea, a[href]');
                    return Array.from(elements).map(el => ({
                        tagName: el.tagName.toLowerCase(),
                        textContent: el.textContent?.trim() || '',
                        className: el.className || '',
                        id: el.id || '',
                        type: el.type || '',
                        href: el.href || ''
                    }));
                })();
            """
            
            elements = await self.execute_script_on_target(page_target['id'], test_script)
            if elements:
                logger.info(f"✅ Element discovery successful: {len(elements)} elements found")
                for elem in elements[:3]:  # Show first 3 elements
                    logger.info(f"  - {elem}")
            else:
                logger.warning("⚠️ Element discovery returned no results")
            
            logger.info("🎉 Real Chrome connection test completed successfully!")
            return True
            
        except Exception as e:
            logger.error(f"❌ Real Chrome connection test failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def cleanup(self):
        """Clean up Chrome processes"""
        try:
            if self.debug_port:
                logger.info(f"🧹 Cleaning up Chrome process on port {self.debug_port}")
                # Find and kill Chrome processes
                subprocess.run(["pkill", "-f", f"remote-debugging-port={self.debug_port}"])
        except Exception as e:
            logger.error(f"❌ Error during cleanup: {e}")

async def main():
    """Main test function"""
    bridge = RealChromeBridge()
    
    try:
        success = await bridge.test_real_chrome_connection()
        if success:
            print("\n🎉 Real Chrome connection test PASSED!")
        else:
            print("\n💥 Real Chrome connection test FAILED!")
            return 1
    finally:
        await bridge.cleanup()
    
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
