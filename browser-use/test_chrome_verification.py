#!/usr/bin/env python3
"""
Simple test to verify your enhanced browser-use system is working with REAL Google Chrome
"""

import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_chrome_setup():
    """Test your enhanced Chrome setup"""
    
    print("🚀 Testing Enhanced Chrome Setup...")
    
    try:
        # Import your enhanced browser-use system
        from browser_use.browser import BrowserProfile, BrowserSession
        from browser_use.browser.cdp_actions import ChromeActions
        from browser_use.browser.events import NavigateToUrlEvent, ClickElementEvent, TypeTextEvent
        print("✅ Enhanced imports working")
        
        # Check if Chrome exists
        chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if not os.path.exists(chrome_path):
            print(f"❌ Chrome not found at: {chrome_path}")
            return False
        
        print(f"🎯 Chrome found at: {chrome_path}")
        
        # Create profile with REAL Chrome
        profile = BrowserProfile(
            headless=False,  # Show browser so you can see it working
            enable_default_extensions=False,
            executable_path=chrome_path
        )
        print("✅ BrowserProfile created")
        
        # Create and start session
        session = BrowserSession(browser_profile=profile)
        print("✅ BrowserSession created")
        
        await session.start()
        print("✅ Browser session started")
        
        # Navigate to our test page
        html_path = os.path.abspath("test_simple_chrome.html")
        file_url = f"file://{html_path}"
        
        print(f"🌐 Navigating to: {file_url}")
        evt = session.event_bus.dispatch(NavigateToUrlEvent(url=file_url))
        await evt
        await asyncio.sleep(1)  # Wait for page to load
        
        # Get CDP session for direct control
        cdp = await session.get_or_create_cdp_session()
        print("✅ CDP session established")
        
        # Test basic functionality
        print("🔍 Testing basic functionality...")
        
        # Get page title
        title_result = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.title", "returnByValue": True},
            session_id=cdp.session_id
        )
        title = title_result.get("result", {}).get("value", "Unknown")
        print(f"✅ Page title: {title}")
        
        # Test ChromeActions
        actions = ChromeActions(session)
        print("✅ ChromeActions created")
        
        # Wait for elements to be ready
        wait_result = await actions.wait_for_selector("#test-input", state="visible", timeout_ms=5000)
        if wait_result.get("status") == "success":
            print("✅ Input field is visible")
        else:
            print("❌ Input field not found")
            return False
        
        # Test typing using CDP directly
        print("⌨️ Testing text input...")
        try:
            # Find the input element
            doc = await cdp.cdp_client.send.DOM.getDocument(params={"depth": -1, "pierce": True}, session_id=cdp.session_id)
            input_node = await cdp.cdp_client.send.DOM.querySelector(
                params={"nodeId": doc["root"]["nodeId"], "selector": "#test-input"}, session_id=cdp.session_id
            )
            if input_node.get("nodeId"):
                # Focus and type into the input
                await cdp.cdp_client.send.Runtime.evaluate(
                    params={
                        "expression": f'document.querySelector("#test-input").value = "Hello from AI!"',
                        "returnByValue": True
                    },
                    session_id=cdp.session_id
                )
                print("✅ Text typed successfully")
            else:
                print("❌ Input field not found")
        except Exception as e:
            print(f"❌ Text typing failed: {e}")
        
        # Test clicking using CDP directly
        print("🖱️ Testing button click...")
        try:
            await cdp.cdp_client.send.Runtime.evaluate(
                params={
                    "expression": 'document.querySelector("#test-button").click()',
                    "returnByValue": True
                },
                session_id=cdp.session_id
            )
            print("✅ Button clicked successfully")
        except Exception as e:
            print(f"❌ Button click failed: {e}")
        
        # Wait a moment and check status
        await asyncio.sleep(0.5)
        status_result = await cdp.cdp_client.send.Runtime.evaluate(
            params={"expression": "document.getElementById('status').textContent", "returnByValue": True},
            session_id=cdp.session_id
        )
        status = status_result.get("result", {}).get("value", "Unknown")
        print(f"✅ Status after click: {status}")
        
        print("\n🎉 Chrome test completed successfully!")
        print("🔍 Check the browser window to see the automation in action!")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Clean up
        if 'session' in locals():
            print("🧹 Cleaning up...")
            await session.stop()
            print("✅ Cleanup completed")

if __name__ == "__main__":
    asyncio.run(test_chrome_setup())
