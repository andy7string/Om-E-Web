import asyncio
import logging
import os
import subprocess
import time
from typing import Any, Dict, List, Optional, cast
from uuid import uuid4

from pydantic import BaseModel, Field, PrivateAttr

from browser_use.browser.views import BrowserStateSummary, PageInfo, TabInfo
from browser_use.browser.types import BrowserProfile
from browser_use.browser.events import EventBus, BrowserStateRequestEvent
from browser_use.dom.views import SerializedDOMState
from browser_use.dom.views import EnhancedDOMTreeNode
from browser_use.chrome_bridge.views import ChromeBridgeElement

logger = logging.getLogger(__name__)

class ChromeBridgeSession:
    """Chrome-native replacement for Playwright BrowserSession"""
    
    def __init__(self, profile: Optional[BrowserProfile] = None):
        self.profile = profile
        self._cdp_client = None
        self._browser_process = None
        self._debug_port = None
        self._session_id = str(uuid4())
        
    async def start(self) -> None:
        """Start Chrome with remote debugging enabled"""
        try:
            # Start Chrome with remote debugging
            chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            user_data_dir = f"/tmp/chrome_bridge_{self._session_id}"
            
            # Create user data directory
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
            
            # Start Chrome process
            self._browser_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait for Chrome to start and get debug port
            await self._wait_for_chrome_start()
            
            logger.info(f"✅ Chrome started successfully on debug port {self._debug_port}")
            
        except Exception as e:
            logger.error(f"❌ Failed to start Chrome: {e}")
            raise
    
    async def _wait_for_chrome_start(self) -> None:
        """Wait for Chrome to start and get debug port"""
        max_wait = 30  # seconds
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            try:
                # Check if Chrome is running and get debug port
                result = subprocess.run(
                    ["lsof", "-i", "-P", "-n", "-l"],
                    capture_output=True,
                    text=True
                )
                
                # Look for Chrome debug port
                for line in result.stdout.split('\n'):
                    if 'Chrome' in line and 'LISTEN' in line:
                        # Extract port number
                        parts = line.split()
                        for part in parts:
                            if ':' in part and part.split(':')[1].isdigit():
                                self._debug_port = int(part.split(':')[1])
                                return
                
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.debug(f"Waiting for Chrome to start: {e}")
                await asyncio.sleep(0.5)
        
        raise TimeoutError("Chrome failed to start within 30 seconds")
    
    async def get_browser_state_summary(self) -> BrowserStateSummary:
        """FAST REPLACEMENT: Get browser state using Chrome-native ProbeJS instead of slow DOM scanning"""
        start_time = time.time()
        
        try:
            # 🚀 NEW: Use fast Chrome-native element discovery instead of slow DOM scanning
            fast_elements = await self._get_elements_fast()
            
            # Convert to the same structure the existing system expects
            dom_state = await self._convert_to_dom_state(fast_elements)
            
            # Create the same BrowserStateSummary structure
            summary = BrowserStateSummary(
                dom_state=dom_state,
                url="",  # Will be filled by caller
                title="",  # Will be filled by caller
                tabs=[],  # Will be filled by caller
                screenshot=None,  # Will be filled by caller
                page_info=None,  # Will be filled by caller
                pixels_above=0,
                pixels_below=0,
                browser_errors=[],
                is_pdf_viewer=False,
                recent_events=None
            )
            
            elapsed = time.time() - start_time
            logger.info(f"🚀 Chrome-native get_browser_state_summary completed in {elapsed:.3f}s (vs 2-3s DOM scan)")
            
            return summary
            
        except Exception as e:
            logger.error(f"❌ Chrome-native get_browser_state_summary failed: {e}")
            # Fallback to original method if needed
            raise
    
    async def _get_elements_fast(self) -> List[ChromeBridgeElement]:
        """Use fast Chrome-native selectors instead of slow DOM walking"""
        try:
            # Fast selectors that find interactive elements quickly
            fast_selectors = [
                "button, input, select, textarea, a[href], [role='button'], [role='link']",
                "[onclick], [onchange], [onsubmit]",
                "[tabindex]:not([tabindex='-1'])",
                "[contenteditable='true']"
            ]
            
            elements = []
            
            for selector in fast_selectors:
                # Use Chrome CDP to execute fast queries
                result = await self._execute_chrome_script(f"""
                    (() => {{
                        const elements = document.querySelectorAll('{selector}');
                        return Array.from(elements).map(el => {{
                            return {{
                                tag_name: el.tagName.toLowerCase(),
                                text_content: el.textContent?.trim() || '',
                                attributes: Object.fromEntries(
                                    Array.from(el.attributes).map(attr => [attr.name, attr.value])
                                ),
                                selector: el.tagName.toLowerCase() + 
                                    (el.id ? '#' + el.id : '') +
                                    (el.className ? '.' + el.className.split(' ').join('.') : ''),
                                is_clickable: el.tagName === 'BUTTON' || 
                                            el.tagName === 'A' || 
                                            el.onclick || 
                                            el.getAttribute('role') === 'button',
                                is_input: el.tagName === 'INPUT' || 
                                         el.tagName === 'TEXTAREA' || 
                                         el.tagName === 'SELECT',
                                is_visible: el.offsetWidth > 0 && el.offsetHeight > 0
                            }};
                        }});
                    }})();
                """)
                
                if result and isinstance(result, list):
                    elements.extend(result)
            
            # Remove duplicates and limit to reasonable number
            unique_elements = []
            seen_selectors = set()
            
            for element in elements:
                if element.get('selector') not in seen_selectors:
                    seen_selectors.add(element.get('selector'))
                    unique_elements.append(ChromeBridgeElement(**element))
            
            logger.info(f"🚀 Fast Chrome-native discovery found {len(unique_elements)} elements")
            return unique_elements[:100]  # Limit to 100 elements for performance
            
        except Exception as e:
            logger.error(f"❌ Fast element discovery failed: {e}")
            return []
    
    async def _execute_chrome_script(self, script: str) -> Any:
        """Execute JavaScript in Chrome via CDP"""
        # TODO: Implement actual CDP connection
        # For now, return mock data to test the flow
        logger.debug(f"Executing Chrome script: {script[:100]}...")
        return []
    
    async def _convert_to_dom_state(self, elements: List[ChromeBridgeElement]) -> SerializedDOMState:
        """Convert Chrome elements to the DOM state structure the existing system expects"""
        try:
            # For now, return a minimal SerializedDOMState to test the flow
            # We'll need to create the proper structure later
            from browser_use.dom.views import SimplifiedNode
            
            # Create a minimal root node
            root_node = SimplifiedNode(
                original_node=None,  # We'll need to create this properly
                children=[],
                should_display=True,
                interactive_index=None,
                is_new=False,
                excluded_by_parent=False
            )
            
            # Create empty selector map for now
            selector_map = {}
            
            # Create the SerializedDOMState with the structure it expects
            dom_state = SerializedDOMState(
                _root=root_node,
                selector_map=selector_map
            )
            
            return dom_state
            
        except Exception as e:
            logger.error(f"❌ Failed to convert to DOM state: {e}")
            # Return empty state as fallback
            return SerializedDOMState(
                nodes=[],
                root_node_id=0,
                total_nodes=0,
                clickable_elements=[],
                input_elements=[]
            )
    
    async def stop(self) -> None:
        """Stop Chrome and cleanup"""
        try:
            if self._browser_process:
                self._browser_process.terminate()
                self._browser_process.wait(timeout=5)
                logger.info("✅ Chrome stopped successfully")
        except Exception as e:
            logger.error(f"❌ Error stopping Chrome: {e}")
