#!/usr/bin/env python3
"""Test the Chrome Bridge get_browser_state_summary function"""

import asyncio
import sys
import os

# Add the browser_use directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'browser_use'))

from chrome_bridge.session import ChromeBridgeSession

async def test_chrome_bridge():
    """Test the Chrome Bridge session"""
    print("🚀 Testing Chrome Bridge get_browser_state_summary...")
    
    try:
        # Create Chrome Bridge session
        session = ChromeBridgeSession()
        
        # Test the function we're replacing
        print("📋 Calling get_browser_state_summary...")
        start_time = asyncio.get_event_loop().time()
        
        result = await session.get_browser_state_summary()
        
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
    print("🧪 Chrome Bridge Test")
    print("=" * 50)
    
    success = asyncio.run(test_chrome_bridge())
    
    if success:
        print("\n🎉 Test completed successfully!")
    else:
        print("\n💥 Test failed!")
        sys.exit(1)
