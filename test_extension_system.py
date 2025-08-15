#!/usr/bin/env python3
"""
Comprehensive test of the OM_E_WEB Chrome Extension system.

This script tests:
1. WebSocket server startup
2. Extension connection (if available)
3. Basic command execution
4. Error handling

Prerequisites:
1. Chrome extension loaded in browser
2. WebSocket server running
3. Active tab with web content
"""

import asyncio
import json
import time
from contextlib import suppress

# Import our WebSocket server functions
try:
    from om_e_web_ws.ws_server import send_command
    print("✓ Imported WebSocket server functions")
except ImportError:
    print("✗ Failed to import WebSocket server functions")
    print("  Make sure you're in the project root directory")
    exit(1)

async def test_extension_connection():
    """Test if the extension is connected and responding."""
    print("\n🔌 Testing Extension Connection...")
    
    try:
        # Test 1: Basic connection
        result = await send_command("navigate", {"url": "https://example.com"})
        print(f"✓ Navigate command: {result.get('ok', False)}")
        
        # Test 2: Wait for page element
        result = await send_command("waitFor", {"selector": "h1"})
        print(f"✓ Wait for h1: {result.get('ok', False)}")
        
        # Test 3: Get text content
        result = await send_command("getText", {"selector": "h1"})
        if result.get('ok'):
            text = result.get('result', {}).get('text', '')
            print(f"✓ Get text from h1: '{text}'")
        else:
            print(f"✗ Get text failed: {result}")
        
        # Test 4: Click operation
        result = await send_command("click", {"selector": "a"})
        print(f"✓ Click first link: {result.get('ok', False)}")
        
        return True
        
    except RuntimeError as e:
        print(f"✗ Extension not connected: {e}")
        print("  Make sure:")
        print("  1. Chrome extension is loaded")
        print("  2. You're on a regular web page (not chrome://)")
        print("  3. Extension has necessary permissions")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False

async def test_error_handling():
    """Test error handling for invalid commands."""
    print("\n⚠️  Testing Error Handling...")
    
    try:
        # Test 1: Invalid selector
        result = await send_command("waitFor", {"selector": "#nonexistent-element"})
        if result.get('ok'):
            print("✗ Should have failed for non-existent element")
        else:
            print(f"✓ Properly handled invalid selector: {result.get('error', {}).get('code')}")
        
        # Test 2: Invalid command
        result = await send_command("invalidCommand", {})
        if result.get('ok'):
            print("✗ Should have failed for invalid command")
        else:
            print(f"✓ Properly handled invalid command: {result.get('error', {}).get('code')}")
            
        return True
        
    except Exception as e:
        print(f"✗ Error handling test failed: {e}")
        return False

async def run_performance_test():
    """Test performance of basic operations."""
    print("\n⚡ Performance Test...")
    
    try:
        # Test multiple rapid commands
        start_time = time.time()
        
        commands = [
            ("waitFor", {"selector": "body"}),
            ("getText", {"selector": "body"}),
            ("waitFor", {"selector": "h1"}),
            ("getText", {"selector": "h1"}),
        ]
        
        for command, params in commands:
            cmd_start = time.time()
            result = await send_command(command, params)
            cmd_time = (time.time() - cmd_start) * 1000
            
            status = "✓" if result.get('ok') else "✗"
            print(f"  {status} {command}: {cmd_time:.1f}ms")
        
        total_time = (time.time() - start_time) * 1000
        print(f"  Total time: {total_time:.1f}ms")
        
        return True
        
    except Exception as e:
        print(f"✗ Performance test failed: {e}")
        return False

async def main():
    """Main test function."""
    print("🚀 OM_E_WEB Chrome Extension System Test")
    print("=" * 60)
    
    # Test 1: Extension connection and basic functionality
    connection_ok = await test_extension_connection()
    
    if connection_ok:
        # Test 2: Error handling
        error_ok = await test_error_handling()
        
        # Test 3: Performance
        perf_ok = await run_performance_test()
        
        print("\n" + "=" * 60)
        print("📊 Test Results Summary:")
        print(f"  Extension Connection: {'✓ PASS' if connection_ok else '✗ FAIL'}")
        print(f"  Error Handling: {'✓ PASS' if error_ok else '✗ FAIL'}")
        print(f"  Performance: {'✓ PASS' if perf_ok else '✗ PASS'}")
        
        if all([connection_ok, error_ok, perf_ok]):
            print("\n🎉 All tests passed! Your extension system is working correctly.")
            print("\nNext steps:")
            print("  1. Integrate with browser-use handler")
            print("  2. Add ROI screenshot support")
            print("  3. Implement advanced element detection")
        else:
            print("\n⚠️  Some tests failed. Check the output above for details.")
    else:
        print("\n" + "=" * 60)
        print("❌ Extension connection failed!")
        print("\nTroubleshooting:")
        print("  1. Ensure WebSocket server is running: python om_e_web_ws/ws_server.py")
        print("  2. Load extension in Chrome: chrome://extensions/ → Load unpacked")
        print("  3. Navigate to a regular web page (not chrome://)")
        print("  4. Check browser console for extension errors")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⏹️  Test interrupted by user")
    except Exception as e:
        print(f"\n💥 Test failed with error: {e}")
        print("Check that the WebSocket server is running and accessible")
