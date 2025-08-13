#!/usr/bin/env python3
"""Test real Chrome CDP connection with fixed debug port"""

import asyncio
import json
import logging
import subprocess
import time
from typing import Any, Dict, List

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FixedChromeBridge:
    """Chrome Bridge with fixed debug port for reliable connection"""
    
    def __init__(self):
        self.debug_port = 9222  # Fixed port
        self.cdp_url = f"http://localhost:{self.debug_port}/json"
        
    async def start_chrome_with_debug(self) -> bool:
        """Start Chrome with a specific remote debugging port"""
        try:
            logger.info(f"🚀 Starting Chrome with fixed debug port {self.debug_port}...")
            
            chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            user_data_dir = f"/tmp/chrome_bridge_test_{int(time.time())}"
            
            # Create user data directory
            import os
            os.makedirs(user_data_dir, exist_ok=True)
            
            # Start Chrome with fixed debugging port
            cmd = [
                chrome_path,
                f"--user-data-dir={user_data_dir}",
                f"--remote-debugging-port={self.debug_port}",  # Fixed port
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
            
            # Wait for Chrome to start and check if port is available
            logger.info(f"⏳ Waiting for Chrome to start on port {self.debug_port}...")
            
            # Wait up to 10 seconds for Chrome to start
            for i in range(20):  # Check every 0.5 seconds
                await asyncio.sleep(0.5)
                
                # Check if port is listening
                try:
                    result = subprocess.run(
                        ["curl", "-s", "--connect-timeout", "1", self.cdp_url],
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode == 0:
                        logger.info(f"✅ Chrome started successfully on debug port {self.debug_port}")
                        logger.info(f"🔗 CDP URL: {self.cdp_url}")
                        return True
                        
                except Exception as e:
                    pass
                
                logger.debug(f"⏳ Waiting for Chrome to start... ({i+1}/20)")
            
            logger.error(f"❌ Chrome failed to start on port {self.debug_port} within 10 seconds")
            return False
                
        except Exception as e:
            logger.error(f"❌ Failed to start Chrome: {e}")
            return False
    
    async def get_cdp_targets(self) -> List[Dict[str, Any]]:
        """Get available CDP targets from Chrome"""
        try:
            logger.info(f"🔍 Getting CDP targets from {self.cdp_url}")
            
            # Use curl to get targets
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
    
    async def test_cdp_connection(self) -> bool:
        """Test basic CDP connectivity"""
        try:
            logger.info("🔍 Testing basic CDP connectivity...")
            
            # Try to get targets
            targets = await self.get_cdp_targets()
            if not targets:
                logger.error("❌ No CDP targets found")
                return False
            
            # Look for a page target
            page_targets = [t for t in targets if t.get('type') == 'page']
            if not page_targets:
                logger.warning("⚠️ No page targets found, but CDP is working")
                return True
            
            logger.info(f"✅ Found {len(page_targets)} page targets")
            return True
            
        except Exception as e:
            logger.error(f"❌ CDP connection test failed: {e}")
            return False
    
    async def test_real_chrome_connection(self) -> bool:
        """Test the complete Chrome connection flow"""
        try:
            logger.info("🧪 Testing Fixed Chrome Connection")
            logger.info("=" * 50)
            
            # Step 1: Start Chrome with debugging
            if not await self.start_chrome_with_debug():
                logger.error("❌ Failed to start Chrome with debugging")
                return False
            
            # Step 2: Test CDP connection
            if not await self.test_cdp_connection():
                logger.error("❌ CDP connection test failed")
                return False
            
            logger.info("🎉 Fixed Chrome connection test completed successfully!")
            return True
            
        except Exception as e:
            logger.error(f"❌ Fixed Chrome connection test failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def cleanup(self):
        """Clean up Chrome processes"""
        try:
            logger.info(f"🧹 Cleaning up Chrome process on port {self.debug_port}")
            # Kill Chrome processes using our test user data directory
            subprocess.run(["pkill", "-f", "chrome_bridge_test"])
            logger.info("✅ Cleanup completed")
        except Exception as e:
            logger.error(f"❌ Error during cleanup: {e}")

async def main():
    """Main test function"""
    bridge = FixedChromeBridge()
    
    try:
        success = await bridge.test_real_chrome_connection()
        if success:
            print("\n🎉 Fixed Chrome connection test PASSED!")
        else:
            print("\n💥 Fixed Chrome connection test FAILED!")
            return 1
    finally:
        await bridge.cleanup()
    
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
