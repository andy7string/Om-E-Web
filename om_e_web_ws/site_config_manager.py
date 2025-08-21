#!/usr/bin/env python3
"""
🎯 Site Configuration Manager

This module manages site-specific scanning configurations by:
1. Reading site_configs.jsonl every 0.2 seconds
2. Detecting changes and updating memory
3. Providing configs to the extension
4. Handling framework-specific scanning strategies
"""

import json
import os
import asyncio
import time
from typing import Dict, Any, Optional
import hashlib

# Configuration
SITE_CONFIGS_FILE = "site_configs.jsonl"
POLL_INTERVAL = 0.2  # 200ms polling
SITE_STRUCTURES_DIR = "@site_configs"

class SiteConfigManager:
    def __init__(self):
        self.site_configs = {}
        self.last_config_hash = None
        self.last_modified = 0
        self.is_running = False
        self.poll_task = None
        
    async def start_polling(self):
        """Start polling the site configs file for changes"""
        if self.is_running:
            print("⚠️ Site config polling already running")
            return
            
        print("🎯 Starting site config polling (every 0.2s)...")
        self.is_running = True
        self.poll_task = asyncio.create_task(self._poll_loop())
        
    async def stop_polling(self):
        """Stop polling the site configs file"""
        if not self.is_running:
            return
            
        print("🛑 Stopping site config polling...")
        self.is_running = False
        if self.poll_task:
            self.poll_task.cancel()
            try:
                await self.poll_task
            except asyncio.CancelledError:
                pass
                
    async def _poll_loop(self):
        """Main polling loop - checks for changes every 0.2 seconds"""
        while self.is_running:
            try:
                await self._check_for_changes()
                await asyncio.sleep(POLL_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ Error in site config polling: {e}")
                await asyncio.sleep(POLL_INTERVAL)
                
    async def _check_for_changes(self):
        """Check if the config file has changed and reload if needed"""
        try:
            file_path = os.path.join(SITE_STRUCTURES_DIR, SITE_CONFIGS_FILE)
            
            if not os.path.exists(file_path):
                print(f"⚠️ Site configs file not found: {file_path}")
                return
                
            # Check file modification time
            current_mtime = os.path.getmtime(file_path)
            
            if current_mtime > self.last_modified:
                # File has been modified, check content
                await self._reload_configs(file_path)
                self.last_modified = current_mtime
                
        except Exception as e:
            print(f"❌ Error checking for config changes: {e}")
            
    async def _reload_configs(self, file_path: str):
        """Reload site configurations from file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Calculate content hash
            content_hash = hashlib.md5(content.encode()).hexdigest()
            
            # Check if content actually changed
            if content_hash == self.last_config_hash:
                return
                
            # Parse new configs
            new_configs = json.loads(content)
            
            # Update memory
            old_count = len(self.site_configs)
            self.site_configs = new_configs
            self.last_config_hash = content_hash
            
            print(f"🔄 Site configs updated: {old_count} → {len(self.site_configs)} configs")
            print(f"📋 Available sites: {list(self.site_configs.keys())}")
            
        except Exception as e:
            print(f"❌ Error reloading site configs: {e}")
            
    def get_site_config(self, url: str) -> Dict[str, Any]:
        """Get site configuration for a specific URL"""
        try:
            # Extract domain from URL
            domain = self._extract_domain(url)
            
            # Check for exact domain match
            if domain in self.site_configs:
                return self.site_configs[domain]
                
            # Check for partial domain match
            for site_domain, config in self.site_configs.items():
                if site_domain in domain or domain in site_domain:
                    return config
                    
            # Return default config
            return self.site_configs.get("default", {})
            
        except Exception as e:
            print(f"❌ Error getting site config for {url}: {e}")
            return self.site_configs.get("default", {})
            
    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL"""
        try:
            # Remove protocol
            if "://" in url:
                url = url.split("://")[1]
                
            # Remove path and query
            domain = url.split("/")[0]
            
            # Remove port if present
            if ":" in domain:
                domain = domain.split(":")[0]
                
            return domain.lower()
            
        except Exception:
            return url.lower()
            
    def get_all_configs(self) -> Dict[str, Any]:
        """Get all site configurations"""
        return self.site_configs.copy()
        
    def get_framework_config(self, framework: str) -> Dict[str, Any]:
        """Get configuration for a specific framework"""
        for config in self.site_configs.values():
            if config.get("framework") == framework:
                return config
        return {}
        
    def is_config_loaded(self) -> bool:
        """Check if configurations are loaded"""
        return len(self.site_configs) > 0
        
    async def force_reload(self):
        """Force reload of configurations"""
        file_path = os.path.join(SITE_STRUCTURES_DIR, SITE_CONFIGS_FILE)
        if os.path.exists(file_path):
            await self._reload_configs(file_path)
        else:
            print(f"❌ Site configs file not found: {file_path}")

# Global instance
site_config_manager = SiteConfigManager()

# Async functions for external use
async def start_site_config_polling():
    """Start the site config polling system"""
    await site_config_manager.start_polling()
    
async def stop_site_config_polling():
    """Stop the site config polling system"""
    await site_config_manager.stop_polling()
    
def get_site_config(url: str) -> Dict[str, Any]:
    """Get site configuration for a URL"""
    return site_config_manager.get_site_config(url)
    
def get_all_site_configs() -> Dict[str, Any]:
    """Get all site configurations"""
    return site_config_manager.get_all_configs()
