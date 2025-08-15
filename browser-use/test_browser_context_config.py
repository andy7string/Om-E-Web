#!/usr/bin/env python3
"""
Test script for BrowserContextConfig class.
Tests all attributes and methods to ensure compatibility with web-ui.
"""

import asyncio
import logging
from browser_use.browser.context import BrowserContextConfig

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_browser_context_config():
    """Test the BrowserContextConfig class systematically."""
    
    logger.info("🧪 Testing BrowserContextConfig class...")
    
    # Test 1: Basic instantiation with defaults
    logger.info("✅ Test 1: Basic instantiation with defaults")
    try:
        config = BrowserContextConfig()
        logger.info(f"✅ Successfully created BrowserContextConfig with defaults")
        logger.info(f"   window_width: {config.window_width}")
        logger.info(f"   window_height: {config.window_height}")
        logger.info(f"   no_viewport: {config.no_viewport}")
        logger.info(f"   permissions: {config.permissions}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with defaults: {e}")
        return False
    
    # Test 2: Window and viewport configuration
    logger.info("✅ Test 2: Window and viewport configuration")
    try:
        viewport_config = BrowserContextConfig(
            window_width=1920,
            window_height=1080,
            no_viewport=False,
            viewport_expansion=100
        )
        logger.info(f"✅ Successfully created BrowserContextConfig with viewport settings")
        logger.info(f"   window_width: {viewport_config.window_width}")
        logger.info(f"   window_height: {viewport_config.window_height}")
        logger.info(f"   no_viewport: {viewport_config.no_viewport}")
        logger.info(f"   viewport_expansion: {viewport_config.viewport_expansion}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with viewport settings: {e}")
        return False
    
    # Test 3: Timing configuration
    logger.info("✅ Test 3: Timing configuration")
    try:
        timing_config = BrowserContextConfig(
            minimum_wait_page_load_time=1.0,
            wait_for_network_idle_page_load_time=2.0,
            maximum_wait_page_load_time=10.0,
            wait_between_actions=2.0
        )
        logger.info(f"✅ Successfully created BrowserContextConfig with timing settings")
        logger.info(f"   minimum_wait_page_load_time: {timing_config.minimum_wait_page_load_time}")
        logger.info(f"   wait_for_network_idle_page_load_time: {timing_config.wait_for_network_idle_page_load_time}")
        logger.info(f"   maximum_wait_page_load_time: {timing_config.maximum_wait_page_load_time}")
        logger.info(f"   wait_between_actions: {timing_config.wait_between_actions}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with timing settings: {e}")
        return False
    
    # Test 4: Security and permissions configuration
    logger.info("✅ Test 4: Security and permissions configuration")
    try:
        security_config = BrowserContextConfig(
            disable_security=False,
            permissions=['clipboardReadWrite', 'notifications', 'geolocation'],
            allowed_domains=['example.com', 'api.example.com']
        )
        logger.info(f"✅ Successfully created BrowserContextConfig with security settings")
        logger.info(f"   disable_security: {security_config.disable_security}")
        logger.info(f"   permissions: {security_config.permissions}")
        logger.info(f"   allowed_domains: {security_config.allowed_domains}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with security settings: {e}")
        return False
    
    # Test 5: Media and recording configuration
    logger.info("✅ Test 5: Media and recording configuration")
    try:
        media_config = BrowserContextConfig(
            save_recording_path="/tmp/recordings",
            save_downloads_path="/tmp/downloads",
            save_har_path="/tmp/har",
            trace_path="/tmp/traces"
        )
        logger.info(f"✅ Successfully created BrowserContextConfig with media settings")
        logger.info(f"   save_recording_path: {media_config.save_recording_path}")
        logger.info(f"   save_downloads_path: {media_config.save_downloads_path}")
        logger.info(f"   save_har_path: {media_config.save_har_path}")
        logger.info(f"   trace_path: {media_config.trace_path}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with media settings: {e}")
        return False
    
    # Test 6: Localization and user agent configuration
    logger.info("✅ Test 6: Localization and user agent configuration")
    try:
        locale_config = BrowserContextConfig(
            locale="en-GB",
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            timezone_id="Europe/London"
        )
        logger.info(f"✅ Successfully created BrowserContextConfig with locale settings")
        logger.info(f"   locale: {locale_config.locale}")
        logger.info(f"   user_agent: {locale_config.user_agent}")
        logger.info(f"   timezone_id: {locale_config.timezone_id}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with locale settings: {e}")
        return False
    
    # Test 7: Mobile and touch configuration
    logger.info("✅ Test 7: Mobile and touch configuration")
    try:
        mobile_config = BrowserContextConfig(
            is_mobile=True,
            has_touch=True,
            geolocation={"latitude": 51.5074, "longitude": -0.1278}
        )
        logger.info(f"✅ Successfully created BrowserContextConfig with mobile settings")
        logger.info(f"   is_mobile: {mobile_config.is_mobile}")
        logger.info(f"   has_touch: {mobile_config.has_touch}")
        logger.info(f"   geolocation: {mobile_config.geolocation}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with mobile settings: {e}")
        return False
    
    # Test 8: HTTP credentials configuration
    logger.info("✅ Test 8: HTTP credentials configuration")
    try:
        credentials_config = BrowserContextConfig(
            http_credentials={"username": "testuser", "password": "testpass"}
        )
        logger.info(f"✅ Successfully created BrowserContextConfig with credentials")
        logger.info(f"   http_credentials: {credentials_config.http_credentials}")
    except Exception as e:
        logger.error(f"❌ Failed to create BrowserContextConfig with credentials: {e}")
        return False
    
    # Test 9: Model serialization
    logger.info("✅ Test 9: Model serialization")
    try:
        config_dict = viewport_config.model_dump()
        logger.info(f"✅ Successfully serialized BrowserContextConfig to dict")
        logger.info(f"   dict keys: {list(config_dict.keys())}")
        
        # Test deserialization
        restored_config = BrowserContextConfig(**config_dict)
        logger.info(f"✅ Successfully deserialized BrowserContextConfig from dict")
        logger.info(f"   restored window_width: {restored_config.window_width}")
    except Exception as e:
        logger.error(f"❌ Failed to serialize/deserialize BrowserContextConfig: {e}")
        return False
    
    # Test 10: Validation
    logger.info("✅ Test 10: Validation")
    try:
        # Test invalid window dimensions
        try:
            invalid_config = BrowserContextConfig(window_width=-100, window_height=-100)
            logger.error(f"❌ Should have failed with invalid window dimensions")
            return False
        except Exception:
            logger.info(f"✅ Correctly rejected invalid window dimensions")
        
        # Test invalid timing values
        try:
            invalid_timing_config = BrowserContextConfig(minimum_wait_page_load_time=-1.0)
            logger.error(f"❌ Should have failed with invalid timing values")
            return False
        except Exception:
            logger.info(f"✅ Correctly rejected invalid timing values")
            
    except Exception as e:
        logger.error(f"❌ Validation test failed: {e}")
        return False
    
    logger.info("🎉 All BrowserContextConfig tests passed!")
    return True

if __name__ == "__main__":
    success = asyncio.run(test_browser_context_config())
    if success:
        logger.info("🎯 BrowserContextConfig class is working correctly!")
    else:
        logger.error("💥 BrowserContextConfig class has issues!")
        exit(1)
