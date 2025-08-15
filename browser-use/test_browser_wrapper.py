#!/usr/bin/env python3
"""Test script for the Browser wrapper class."""

import asyncio
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_browser_wrapper():
    """Test the Browser wrapper class."""
    try:
        from browser_use.browser.browser import Browser
        from browser_use.browser.profile import BrowserProfile
        
        logger.info("✅ Successfully imported Browser class")
        
        # Test creating a browser instance
        config = BrowserProfile(
            headless=False,  # Show visual browser
            cdp_url=None,   # Use local browser
            browser_binary_path=None  # Use built-in
        )
        
        logger.info("✅ Successfully created BrowserProfile")
        
        browser = Browser(config=config)
        logger.info("✅ Successfully created Browser instance")
        
        # Test getting playwright browser
        playwright_browser = await browser.get_playwright_browser()
        logger.info(f"✅ Successfully got Playwright browser: {type(playwright_browser)}")
        
        # Test creating a context
        context = await browser.new_context()
        logger.info(f"✅ Successfully created context: {type(context)}")
        
        # Keep browser open for a few seconds so you can see it
        logger.info("🌐 Browser is now visible - keeping open for 5 seconds...")
        await asyncio.sleep(5)
        
        # Test closing
        await browser.close()
        logger.info("✅ Successfully closed browser")
        
        logger.info("🎉 All tests passed! Browser wrapper is working correctly.")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_browser_wrapper())
