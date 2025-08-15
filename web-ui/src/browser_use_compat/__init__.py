"""
Browser-Use Compatibility Layer for Web-UI

This module provides compatibility classes that allow the web-ui to work
with the enhanced browser-use system while maintaining the expected interface.
"""

from .browser import Browser
from .context import BrowserContext
from .config import BrowserConfig, BrowserContextConfig

__all__ = [
    "Browser",
    "BrowserContext", 
    "BrowserConfig",
    "BrowserContextConfig"
]
