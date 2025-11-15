"""
Configuration settings for Om_E_Web WebSocket server
"""

# LLM Prompt Generation Settings
MAX_ACTIONS = 120  # Maximum actions to include in llm_prompt.md
MAX_FOOTER_LINKS = 5  # Maximum footer links to include (About, Terms, etc.)

# Video/Content Limits (no limit = 0 or None)
MAX_VIDEOS = None  # No limit on video links for YouTube
MAX_SHORTS = None  # No limit on Shorts
MAX_CHANNELS = None  # No limit on channel links

# Filtering Settings
EXCLUDE_HIDDEN_ELEMENTS = True  # Filter out hidden elements from llm_prompt.md
EXCLUDE_GENERIC_LABELS = True  # Filter out generic labels like 'style-scope'

# Domain-Specific Settings
ENABLE_DOMAIN_CATEGORIZATION = True  # Enable domain-specific categorization (YouTube, etc.)
