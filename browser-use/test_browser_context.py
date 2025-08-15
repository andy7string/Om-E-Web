#!/usr/bin/env python3
"""Test script for the BrowserContext class."""

import asyncio
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_browser_context():
    """Test the BrowserContext class."""
    try:
        from browser_use.browser.browser import Browser
        from browser_use.browser.profile import BrowserProfile
        
        logger.info("✅ Successfully imported Browser and BrowserProfile")
        
        # Test creating a browser instance
        config = BrowserProfile(
            headless=False,  # Show visual browser
            browser_binary_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # Use actual Google Chrome
        )
        
        logger.info("✅ Successfully created BrowserProfile")
        
        browser = Browser(config=config)
        logger.info("✅ Successfully created Browser instance")
        
        # Test creating a context
        context = await browser.new_context()
        logger.info(f"✅ Successfully created context: {type(context)}")
        
        # Test the new_page method
        logger.info("🌐 Testing new_page method...")
        await context.new_page("https://example.com")
        logger.info("✅ Successfully created new page with example.com")
        
        # Test navigation
        logger.info("🧭 Testing navigation...")
        await context.navigate_to("https://httpbin.org")
        logger.info("✅ Successfully navigated to httpbin.org")
        
        # Test getting page HTML
        logger.info("📄 Testing get_page_html...")
        html = await context.get_page_html()
        logger.info(f"✅ Successfully got page HTML (length: {len(html)})")
        
        # Test taking screenshot
        logger.info("📸 Testing screenshot...")
        screenshot = await context.take_screenshot()
        logger.info(f"✅ Successfully took screenshot (length: {len(screenshot)})")
        
        # Keep browser open for a few seconds so you can see it
        logger.info("🌐 Browser is now visible - keeping open for 5 seconds...")
        await asyncio.sleep(5)
        
        # Test closing
        await browser.close()
        logger.info("✅ Successfully closed browser")
        
        logger.info("🎉 All tests passed! BrowserContext is working correctly.")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_browser_context())
