"""Browser class that wraps our enhanced BrowserSession for web-ui compatibility."""

import asyncio
import logging
from typing import Any, Optional, Literal
from pydantic import BaseModel, Field, AliasChoices

from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession
from browser_use.browser.context import BrowserContextConfig

logger = logging.getLogger(__name__)


class ProxySettings(BaseModel):
	"""Proxy settings for browser configuration."""
	server: str
	bypass: str | None = None
	username: str | None = None
	password: str | None = None

	model_config = BaseModel.model_config.copy()
	model_config.update(populate_by_name=True, from_attributes=True)

	# Support dict-like behavior for compatibility
	def __getitem__(self, key):
		return getattr(self, key)

	def get(self, key, default=None):
		return getattr(self, key, default)


class BrowserConfig(BaseModel):
	"""Configuration for the Browser.
	
	This class provides the interface that web-ui expects while being compatible
	with our enhanced BrowserSession system.
	"""
	
	model_config = BaseModel.model_config.copy()
	model_config.update(
		arbitrary_types_allowed=True,
		extra='ignore',
		populate_by_name=True,
		from_attributes=True,
		validate_assignment=True,
		revalidate_instances='subclass-instances',
	)

	# Connection settings
	wss_url: str | None = None
	cdp_url: str | None = None
	
	# Browser type and binary
	browser_class: Literal['chromium', 'firefox', 'webkit'] = 'chromium'
	browser_binary_path: str | None = Field(
		default=None, 
		validation_alias=AliasChoices('browser_instance_path', 'chrome_instance_path')
	)
	chrome_remote_debugging_port: int | None = Field(
		default=9222,
		ge=1,
		le=65535,
		description="Chrome remote debugging port (1-65535)"
	)
	
	# Browser behavior
	headless: bool = False
	disable_security: bool = False
	deterministic_rendering: bool = False
	keep_alive: bool = Field(default=False, alias='_force_keep_browser_alive')
	
	# Additional settings
	extra_browser_args: list[str] = Field(default_factory=list)
	proxy: ProxySettings | None = None
	new_context_config: BrowserContextConfig = Field(default_factory=BrowserContextConfig)


class Browser:
	"""Thin wrapper around BrowserSession for web-ui compatibility.
	
	This class provides the interface that web-ui expects while delegating
	all the real work to our enhanced BrowserSession class.
	"""
	
	def __init__(
		self,
		config: Optional[BrowserProfile] = None,
		**kwargs
	):
		"""Initialize the browser wrapper.
		
		Args:
			config: BrowserProfile configuration
			**kwargs: Additional arguments to pass to BrowserProfile
		"""
		self.config = config or BrowserProfile(**kwargs)
		self._session: Optional[BrowserSession] = None
		
		# Store any additional kwargs for context creation
		self._context_kwargs = kwargs
	
	async def new_context(self, config: Optional[BrowserContextConfig] = None) -> 'BrowserContext':
		"""Create a new browser context.
		
		Args:
			config: Context configuration
			
		Returns:
			BrowserContext instance
		"""
		from .context import BrowserContext
		
		# Get browser config as dict, filtering out None values
		browser_config = {}
		if self.config:
			browser_dict = self.config.model_dump()
			browser_config = {k: v for k, v in browser_dict.items() if v is not None}
		
		# Get context config as dict, filtering out None values
		context_dict = {}
		if config:
			context_dict = {k: v for k, v in config.model_dump().items() if v is not None}
		
		# Merge configs, context config takes precedence
		merged_config = {**browser_config, **context_dict}
		
		# Ensure required boolean fields have defaults
		if 'no_viewport' not in merged_config:
			merged_config['no_viewport'] = True
		if 'keep_alive' not in merged_config:
			merged_config['keep_alive'] = False
		
		context_config = BrowserContextConfig(**merged_config)
		
		return BrowserContext(
			config=context_config,
			browser=self
		)
	
	async def get_playwright_browser(self):
		"""Get the underlying Playwright browser from our session.
		
		Returns:
			Playwright browser instance
		"""
		if not self._session:
			await self._init()
		
		# Get the Playwright page from our session
		page = await self._session.get_or_create_playwright_page()
		return page.context.browser
	
	async def _init(self):
		"""Initialize the browser session."""
		if not self._session:
			self._session = BrowserSession(browser_profile=self.config)
			await self._session.start()
		
		return self._session
	
	async def close(self):
		"""Close the browser session."""
		if self._session:
			await self._session.stop()
			self._session = None
	
	def __del__(self):
		"""Cleanup when object is destroyed."""
		try:
			if self._session:
				loop = asyncio.get_running_loop()
				if loop.is_running():
					loop.create_task(self.close())
				else:
					asyncio.run(self.close())
		except Exception as e:
			logger.debug(f'Failed to cleanup browser in destructor: {e}')
	
	async def cleanup_httpx_clients(self):
		"""No-op method - browser instances shouldn't close httpx clients they didn't create."""
		pass
