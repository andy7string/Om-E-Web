import json
import logging
import os

from browser_use.browser.session import BrowserSession
from browser_use.browser.profile import BrowserProfile
from playwright.async_api import Browser as PlaywrightBrowser
from playwright.async_api import BrowserContext as PlaywrightBrowserContext
from typing import Optional
# from browser_use.browser.context import BrowserContextState  # This may not exist

logger = logging.getLogger(__name__)


class CustomBrowserContext:
    def __init__(
            self,
            browser: 'BrowserSession',
            config: BrowserProfile | None = None,
            state: Optional[dict] = None,  # Changed from BrowserContextState
    ):
        self.browser = browser
        self.config = config
        self.state = state or {}
