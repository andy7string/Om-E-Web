#!/usr/bin/env python3
"""
Simple test that works with existing server and extension.
"""

import asyncio
from ws_server import send_command

async def test_extension():
    print("🧪 Testing Extension Commands...")
    print("Make sure you have an active tab open to a regular web page!")
    
    try:
        # Test 1: Navigate to example.com
        print("\n1. Navigating to example.com...")
        result = await send_command("navigate", {"url": "https://example.com"})
        print(f"   Result: {result.get('ok', False)}")
        
        # Wait a moment for page to load
        await asyncio.sleep(2)
        
        # Test 2: Wait for h1 element
        print("\n2. Waiting for h1 element...")
        result = await send_command("waitFor", {"selector": "h1"})
        print(f"   Result: {result.get('ok', False)}")
        
        # Test 3: Get text from h1
        print("\n3. Getting text from h1...")
        result = await send_command("getText", {"selector": "h1"})
        if result.get('ok'):
            text = result.get('result', {}).get('text', '')
            print(f"   Text: '{text}'")
        else:
            print(f"   Failed: {result}")
        
        # Test 4: Click first link
        print("\n4. Clicking first link...")
        result = await send_command("click", {"selector": "a"})
        print(f"   Result: {result.get('ok', False)}")
        
        print("\n✅ Test completed!")
        
    except RuntimeError as e:
        print(f"\n❌ Extension not connected: {e}")
        print("Make sure:")
        print("1. Extension is loaded and connected")
        print("2. You have an active tab open")
        print("3. Server is running")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_extension())
