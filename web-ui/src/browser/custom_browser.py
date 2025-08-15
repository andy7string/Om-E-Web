import asyncio
import pdb

from playwright.async_api import Browser as PlaywrightBrowser
from playwright.async_api import (
    BrowserContext as PlaywrightBrowserContext,
)
from playwright.async_api import (
    Playwright,
    async_playwright,
)
from browser_use.browser.session import BrowserSession
from browser_use.browser.profile import BrowserProfile
from playwright.async_api import BrowserContext as PlaywrightBrowserContext
import logging

# These imports need to be checked - they may not exist in current browser_use
# from browser_use.browser.chrome import (
#     CHROME_ARGS,
#     CHROME_DETERMINISTIC_RENDERING_ARGS,
#     CHROME_DISABLE_SECURITY_ARGS,
#     CHROME_DOCKER_ARGS,
#     CHROME_HEADLESS_ARGS,
# )
# from browser_use.browser.context import BrowserContext, BrowserContextConfig
# from browser_use.browser.utils.screen_resolution import get_screen_resolution, get_window_adjustments
from browser_use.utils import time_execution_async
import socket

from .custom_context import CustomBrowserContext

logger = logging.getLogger(__name__)


class CustomBrowser(BrowserSession):

    async def new_context(self, config: BrowserProfile | None = None) -> CustomBrowserContext:
        """Create a browser context"""
        browser_config = self.browser_profile.model_dump() if self.browser_profile else {}
        context_config = config.model_dump() if config else {}
        merged_config = {**browser_config, **context_config}
        return CustomBrowserContext(config=BrowserProfile(**merged_config), browser=self)

    async def _setup_builtin_browser(self, playwright: Playwright) -> PlaywrightBrowser:
        """Sets up and returns a Playwright Browser instance with anti-detection measures."""
        assert self.browser_profile.browser_binary_path is None, 'browser_binary_path should be None if trying to use the builtin browsers'

        # Use the configured window size from new_context_config if available
        if (
                not self.browser_profile.headless
                and hasattr(self.browser_profile, 'new_context_config')
                and hasattr(self.browser_profile.new_context_config, 'window_width')
                and hasattr(self.browser_profile.new_context_config, 'window_height')
        ):
            screen_size = {
                'width': self.browser_profile.new_context_config.window_width,
                'height': self.browser_profile.new_context_config.window_height,
            }
            offset_x, offset_y = 0, 0  # get_window_adjustments() not available
        elif self.browser_profile.headless:
            screen_size = {'width': 1920, 'height': 1080}
            offset_x, offset_y = 0, 0
        else:
            screen_size = {'width': 1920, 'height': 1080}  # get_screen_resolution() not available
            offset_x, offset_y = 0, 0

        # Chrome args not available in current browser_use - using defaults
        chrome_args = {
            f'--remote-debugging-port={self.browser_profile.chrome_remote_debugging_port}',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            f'--window-position={offset_x},{offset_y}',
            f'--window-size={screen_size["width"]},{screen_size["height"]}',
            *self.browser_profile.extra_browser_args,
        }

        # check if chrome remote debugging port is already taken,
        # if so remove the remote-debugging-port arg to prevent conflicts
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', self.browser_profile.chrome_remote_debugging_port)) == 0:
                chrome_args.remove(f'--remote-debugging-port={self.browser_profile.chrome_remote_debugging_port}')

        browser_class = getattr(playwright, self.browser_profile.browser_class)
        args = {
            'chromium': list(chrome_args),
            'firefox': [
                *{
                    '-no-remote',
                    *self.browser_profile.extra_browser_args,
                }
            ],
            'webkit': [
                *{
                    '--no-startup-window',
                    *self.browser_profile.extra_browser_args,
                }
            ],
        }
