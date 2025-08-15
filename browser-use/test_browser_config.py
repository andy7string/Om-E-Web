#!/usr/bin/env python3
"""
Test script for BrowserConfig class.
Tests all attributes and methods to ensure compatibility with web-ui.
"""

import asyncio
import logging
from browser_use.browser.browser import BrowserConfig

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_browser_config():
    """Test the BrowserConfig class systematically."""
    
    logger.info("🧪 Testing BrowserConfig class...")
    
    # Test 1: Basic instantiation with defaults
    logger.info("✅ Test 1: Basic instantiation with defaults")
    try:
        config = BrowserConfig()
        logger.info(f"✅ Successfully created BrowserConfig with defaults")
        logger.info(f"   headless: {config.headless}")
        logger.info(f"   browser_class: {config.browser_class}")
        logger.info(f"   cdp_url: {config.cdp_url}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserConfig with defaults: {e}")
        return False
    
    # Test 2: Custom configuration
    logger.info("✅ Test 2: Custom configuration")
    try:
        custom_config = BrowserConfig(
            headless=False,
            browser_binary_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            chrome_remote_debugging_port=9223,
            disable_security=False,
            deterministic_rendering=False,
            keep_alive=False
        )
        logger.info(f"✅ Successfully created BrowserConfig with custom values")
        logger.info(f"   headless: {custom_config.headless}")
        logger.info(f"   browser_binary_path: {custom_config.browser_binary_path}")
        logger.info(f"   chrome_remote_debugging_port: {custom_config.chrome_remote_debugging_port}")
        logger.info(f"   disable_security: {custom_config.disable_security}")
        logger.info(f"   deterministic_rendering: {custom_config.deterministic_rendering}")
        logger.info(f"   keep_alive: {custom_config.keep_alive}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserConfig with custom values: {e}")
        return False
    
    # Test 3: CDP URL configuration
    logger.info("✅ Test 3: CDP URL configuration")
    try:
        cdp_config = BrowserConfig(
            cdp_url="http://localhost:9222",
            browser_class="chromium"
        )
        logger.info(f"✅ Successfully created BrowserConfig with CDP URL")
        logger.info(f"   cdp_url: {cdp_config.cdp_url}")
        logger.info(f"   browser_class: {cdp_config.browser_class}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserConfig with CDP URL: {e}")
        return False
    
    # Test 4: WSS URL configuration
    logger.info("✅ Test 4: WSS URL configuration")
    try:
        wss_config = BrowserConfig(
            wss_url="ws://localhost:9222",
            browser_class="chromium"
        )
        logger.info(f"✅ Successfully created BrowserConfig with WSS URL")
        logger.info(f"   wss_url: {wss_config.wss_url}")
        logger.info(f"   browser_class: {wss_config.browser_class}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserConfig with WSS URL: {e}")
        return False
    
    # Test 5: Extra browser arguments
    logger.info("✅ Test 5: Extra browser arguments")
    try:
        args_config = BrowserConfig(
            extra_browser_args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        logger.info(f"✅ Successfully created BrowserConfig with extra args")
        logger.info(f"   extra_browser_args: {args_config.extra_browser_args}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserConfig with extra args: {e}")
        return False
    
    # Test 6: Model serialization
    logger.info("✅ Test 6: Model serialization")
    try:
        config_dict = custom_config.model_dump()
        logger.info(f"✅ Successfully serialized BrowserConfig to dict")
        logger.info(f"   dict keys: {list(config_dict.keys())}")
        
        # Test deserialization
        restored_config = BrowserConfig(**config_dict)
        logger.info(f"✅ Successfully deserialized BrowserConfig from dict")
        logger.info(f"   restored headless: {restored_config.headless}")
    except Exception as e:
        logger.error(f"❌ Failed to serialize/deserialize BrowserConfig: {e}")
        return False
    
    # Test 7: Validation
    logger.info("✅ Test 7: Validation")
    try:
        # Test invalid browser class
        try:
            invalid_config = BrowserConfig(browser_class="invalid_browser")
            logger.error(f"❌ Should have failed with invalid browser class")
            return False
        except Exception:
            logger.info(f"✅ Correctly rejected invalid browser class")
        
        # Test invalid port
        try:
            invalid_port_config = BrowserConfig(chrome_remote_debugging_port=99999)
            logger.error(f"❌ Should have failed with invalid port")
            return False
        except Exception:
            logger.info(f"✅ Correctly rejected invalid port")
            
    except Exception as e:
        logger.error(f"❌ Validation test failed: {e}")
        return False
    
    logger.info("🎉 All BrowserConfig tests passed!")
    return True

if __name__ == "__main__":
    success = asyncio.run(test_browser_config())
    if success:
        logger.info("🎯 BrowserConfig class is working correctly!")
    else:
        logger.error("💥 BrowserConfig class has issues!")
        exit(1)
