#!/usr/bin/env python3
"""Simple test of Chrome Bridge concepts without complex dependencies"""

import asyncio
import time

class MockChromeBridgeElement:
    """Mock element for testing"""
    def __init__(self, tag_name, text_content, attributes, selector, is_clickable, is_input, is_visible):
        self.tag_name = tag_name
        self.text_content = text_content
        self.attributes = attributes
        self.selector = selector
        self.is_clickable = is_clickable
        self.is_input = is_input
        self.is_visible = is_visible

class MockSerializedDOMState:
    """Mock DOM state for testing"""
    def __init__(self, elements):
        self.elements = elements
        self.total_nodes = len(elements)
        self.clickable_elements = [i for i, e in enumerate(elements) if e.is_clickable]
        self.input_elements = [i for i, e in enumerate(elements) if e.is_input]

class MockBrowserStateSummary:
    """Mock browser state summary for testing"""
    def __init__(self, dom_state):
        self.dom_state = dom_state
        self.timestamp = time.time()

class SimpleChromeBridge:
    """Simplified Chrome Bridge for testing"""
    
    async def get_browser_state_summary(self):
        """FAST REPLACEMENT: Get browser state using Chrome-native ProbeJS instead of slow DOM scanning"""
        start_time = time.time()
        
        try:
            # 🚀 NEW: Use fast Chrome-native element discovery instead of slow DOM scanning
            fast_elements = await self._get_elements_fast()
            
            # Convert to the same structure the existing system expects
            dom_state = await self._convert_to_dom_state(fast_elements)
            
            # Create the same BrowserStateSummary structure
            summary = MockBrowserStateSummary(dom_state)
            
            elapsed = time.time() - start_time
            print(f"🚀 Chrome-native get_browser_state_summary completed in {elapsed:.3f}s (vs 2-3s DOM scan)")
            
            return summary
            
        except Exception as e:
            print(f"❌ Chrome-native get_browser_state_summary failed: {e}")
            raise
    
    async def _get_elements_fast(self):
        """Use fast Chrome-native selectors instead of slow DOM walking"""
        try:
            # Simulate fast element discovery
            print("🔍 Fast Chrome-native element discovery...")
            await asyncio.sleep(0.1)  # Simulate fast processing
            
            # Mock elements for testing
            elements = [
                MockChromeBridgeElement("button", "Submit", {"type": "submit"}, "button.submit", True, False, True),
                MockChromeBridgeElement("input", "", {"type": "text", "placeholder": "Enter name"}, "input.text", False, True, True),
                MockChromeBridgeElement("a", "Home", {"href": "/home"}, "a.home", True, False, True),
            ]
            
            print(f"🚀 Fast Chrome-native discovery found {len(elements)} elements")
            return elements
            
        except Exception as e:
            print(f"❌ Fast element discovery failed: {e}")
            return []
    
    async def _convert_to_dom_state(self, elements):
        """Convert Chrome elements to the DOM state structure the existing system expects"""
        try:
            # Create the same structure as the original DOMTreeSerializer
            dom_state = MockSerializedDOMState(elements)
            return dom_state
            
        except Exception as e:
            print(f"❌ Failed to convert to DOM state: {e}")
            # Return empty state as fallback
            return MockSerializedDOMState([])

async def test_simple_chrome_bridge():
    """Test the simplified Chrome Bridge"""
    print("🚀 Testing Simple Chrome Bridge get_browser_state_summary...")
    
    try:
        # Create Chrome Bridge session
        bridge = SimpleChromeBridge()
        
        # Test the function we're replacing
        print("📋 Calling get_browser_state_summary...")
        start_time = asyncio.get_event_loop().time()
        
        result = await bridge.get_browser_state_summary()
        
        elapsed = asyncio.get_event_loop().time() - start_time
        
        print(f"✅ Function completed in {elapsed:.3f}s")
        print(f"📊 Result: {type(result)}")
        print(f"🔢 DOM nodes found: {result.dom_state.total_nodes}")
        print(f"🖱️ Clickable elements: {len(result.dom_state.clickable_elements)}")
        print(f"⌨️ Input elements: {len(result.dom_state.input_elements)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🧪 Simple Chrome Bridge Test")
    print("=" * 50)
    
    success = asyncio.run(test_simple_chrome_bridge())
    
    if success:
        print("\n🎉 Test completed successfully!")
    else:
        print("\n💥 Test failed!")
        exit(1)
