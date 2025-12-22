#!/usr/bin/env python3
"""
🚀 WebSocket Server for Chrome Extension Communication

This server acts as a bridge between test clients and the Chrome extension,
enabling full round-trip communication for browser automation commands.

🔗 FULL ROUND-TRIP COMMUNICATION PATTERN:
1. Test Client → Server: Sends command with unique ID
2. Server → Extension: Forwards command to Chrome extension
3. Extension → Server: Executes command and sends response
4. Server → Test Client: Routes response back to original client

📡 MESSAGE FLOW:
Test Client (WebSocket) → Server (Port 17892) → Chrome Extension (WebSocket)
Chrome Extension → Server → Test Client

🎯 KEY COMPONENTS:
- CLIENTS: Set of all connected WebSocket clients
- EXTENSION_WS: Reference to the Chrome extension client
- PENDING: Dictionary mapping command IDs to futures for response routing
"""

import asyncio
import json
import websockets
import uuid
import os
import re
import time
from config import MAX_ACTIONS, MAX_FOOTER_LINKS
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
from site_config_manager import get_site_config, start_site_config_polling

# LLM Dispatcher - routes LLM actions through existing pipelines
from llm.dispatcher import (
    dispatch as llm_dispatch,
    load_capabilities as llm_load_capabilities,
    set_element_resolver,
    resolve_action_type,
)

# LLM Orchestrator - two-role LLM architecture (Role A + Role B)
from llm.prompt import add_action_to_history, set_search_context, clear_search_context
from llm.ingestion import preprocess_message
from llm.orchestrator import PersonaOrchestrator

# RAG - eager load model and capabilities at startup
from retrieval.vector_store import get_model
from retrieval.query import rebuild_capabilities_store, rebuild_chat_memory_store



# Global state for managing WebSocket connections and command routing
CLIENTS = set()                    # All connected WebSocket clients
PENDING = {}                       # Command ID → Future mapping for response routing
EXTENSION_WS = None               # Reference to the Chrome extension client
COMMAND_CLIENTS = {}              # Command ID → Client mapping for response routing
WEB_DASHBOARD_CLIENTS = set()      # Web dashboard clients (for broadcast sync)

# 📊 Tab information storage for external access
CURRENT_TABS_INFO = None           # Latest tabs_info from extension
LAST_TABS_UPDATE = None            # Timestamp of last update
CURRENT_ACTIVE_TAB = None          # Current active tab information
TAB_NUMBER_MAP = {}                # DEPRECATED - use STABLE_TAB_REGISTRY instead

# 🔢 STABLE TAB NUMBERING: Persistent registry for consistent tab numbers
# Tabs keep their assigned number until closed - no more shifting!
STABLE_TAB_REGISTRY = {
    "tab_id_to_number": {},    # Chrome tab ID → stable display number
    "number_to_tab_id": {},    # Stable display number → Chrome tab ID
    "next_number": 1,          # Next number to assign to new tabs
}

# 🎯 PREMIUM: Site configs loaded from extension's site_configs.json
SITE_CONFIGS = {}                  # Loaded site configurations with capabilities

# 💬 Current chat state for LLM conversations
CURRENT_CHAT_ID = None             # Active chat ID (auto-created on first message)

# 📋 Chat index cache - avoids reading all chat files for list operations
# Structure: { "chat_id": {"title": "...", "date_short": "...", "message_count": N, "project_id": "..."} }
CHAT_INDEX_CACHE = {}              # Populated on startup, updated on save/delete
CHAT_INDEX_LOADED = False          # Flag to track initial load

# 🎭 Persona Orchestrator - Two-role LLM architecture (Role A + Role B)
# Role A: Chat Persona (intent extraction, conversational responses)
# Role B: Decision Engine (capability selection, action execution)
USE_ORCHESTRATOR = True            # Always use orchestrator (legacy agent removed)
USE_UNIFIED_PROMPT = True          # Single LLM call (Role A + B merged) - faster!
PERSONA_ORCHESTRATOR = None        # PersonaOrchestrator instance (created on first chat)

# 📚 Visible chats context - for resolving chat numbers to chat_ids
# Set by LLMChat when hud_state includes visible_chats
VISIBLE_CHATS = []                 # [{chat_id, title, message_count}, ...]

# 🏠 Default landing page for OpenTab when no URL provided
# TODO: Make this configurable via settings
DEFAULT_LANDING_PAGE = "http://127.0.0.1:8080/"


def resolve_chat_number(chat_num: int) -> str | None:
    """
    📚 Resolve chat number (1-indexed) to actual chat_id.

    When LLM outputs {"cap": "DeleteChat", "params": {"chat": 3}},
    this looks up VISIBLE_CHATS[2] to get the actual chat_id.

    Returns None if number is out of range.
    """
    if not VISIBLE_CHATS:
        return None
    # Convert 1-indexed to 0-indexed
    idx = chat_num - 1
    if 0 <= idx < len(VISIBLE_CHATS):
        return VISIBLE_CHATS[idx].get("chat_id")
    return None


# 🎯 Element Registry - maps action IDs to element metadata for auto-resolution
# Populated from semanticPageData.actionables on each intelligence update
# Structure: { "a_id_0": {"type": "Link", "tag": "a", "href": "...", "label": "..."}, ... }
ELEMENT_REGISTRY = {}

# 🌳 AT Element Registry - maps action IDs to AT element data for CDP interaction
# Populated from at_intelligence_update registry (same pattern as ELEMENT_REGISTRY)
# Structure: { 0: {"ref": "12345", "role": "button", "name": "Search", ...}, ... }
AT_ELEMENT_REGISTRY = {}

# 🎨 Current orb theme (synced across all clients)
CURRENT_ORB_THEME = 'robot'

# 🌳 Current scan mode: 'dom' (TreeWalker) or 'at' (Accessibility Tree)
# Default to 'at' - overridden from llm_config.json on startup
CURRENT_SCAN_MODE = 'at'


async def broadcast_to_web_dashboards(message: dict, exclude_ws=None):
    """
    📡 Broadcast message to all connected web dashboard clients.

    Used to sync state changes (theme, HUD, status) across all web UIs.

    @param message: Message dict to broadcast
    @param exclude_ws: Optional WebSocket to exclude (the sender)
    """
    if not WEB_DASHBOARD_CLIENTS:
        return

    msg_str = json.dumps(message)
    disconnected = []

    for client in WEB_DASHBOARD_CLIENTS:
        if client == exclude_ws:
            continue
        try:
            await client.send(msg_str)
        except Exception:
            disconnected.append(client)

    # Clean up disconnected clients
    for client in disconnected:
        WEB_DASHBOARD_CLIENTS.discard(client)


def get_element_info(action_id: int | str) -> Optional[dict]:
    """
    Get element metadata from registry for action type resolution.

    🧪 NUMERIC ID SYSTEM: Accepts int or str, converts to str for lookup.

    Returns: {"type": "Link|Button|Input|Select", "tag": "a|button|...", "label": "...", "href": "...", "iframe": bool}
    Or None if not found.
    """
    return ELEMENT_REGISTRY.get(str(action_id))


def translate_tab_params(params: dict) -> tuple[dict, str | None]:
    """
    🔢 Translate display tab numbers to real Chrome tab IDs.

    LLM sees tabs as "Tab 1", "Tab 2", etc. but Chrome uses internal IDs.
    Uses STABLE_TAB_REGISTRY for consistent mapping that survives tab closures.

    Checks both "tab" and "tabId" params. Only translates if value is in
    small number range (1-50). Larger values assumed to be real Chrome tab IDs.

    @param params: Original params dict (may contain tab or tabId)
    @return: (translated_params, error_message) - error is None on success
    """
    if not params:
        return {}, None

    translated = params.copy()

    # Check "tab" param (some older code uses this)
    if "tab" in translated:
        tab_num = translated.pop("tab")
        try:
            tab_num = int(tab_num)
            real_tab_id = get_tab_id_from_number(tab_num)
            if real_tab_id:
                translated["tabId"] = real_tab_id
                print(f"🔢 Translated Tab {tab_num} → tabId {real_tab_id}")
            else:
                return translated, f"Tab {tab_num} not found in registry"
        except (ValueError, TypeError):
            return translated, f"Invalid tab number: {tab_num}"

    # Check "tabId" param (LLM typically uses this)
    elif "tabId" in translated:
        tab_num = translated.get("tabId")
        # Only translate if it looks like a display number (1-50 range)
        # Real Chrome tab IDs are much larger (e.g., 1138048888)
        if isinstance(tab_num, int) and 1 <= tab_num <= 50:
            real_tab_id = get_tab_id_from_number(tab_num)
            if real_tab_id:
                translated["tabId"] = real_tab_id
                print(f"🔢 Translated tabId {tab_num} → real tabId {real_tab_id}")
            else:
                return translated, f"Tab {tab_num} not found in registry"
        # Else: assume it's already a real Chrome tab ID, pass through

    return translated, None


# ============================================================================
# 🔢 STABLE TAB REGISTRY FUNCTIONS
# ============================================================================

def register_tab(tab_id: int) -> int:
    """
    🔢 Register a new tab and assign it a stable number.
    If already registered, returns existing number.

    @param tab_id: Chrome's internal tab ID
    @return: Stable display number (1, 2, 3, etc.)
    """
    global STABLE_TAB_REGISTRY

    # Already registered? Return existing number
    if tab_id in STABLE_TAB_REGISTRY["tab_id_to_number"]:
        return STABLE_TAB_REGISTRY["tab_id_to_number"][tab_id]

    # Assign next number
    number = STABLE_TAB_REGISTRY["next_number"]
    STABLE_TAB_REGISTRY["next_number"] += 1

    # Store both directions
    STABLE_TAB_REGISTRY["tab_id_to_number"][tab_id] = number
    STABLE_TAB_REGISTRY["number_to_tab_id"][number] = tab_id

    print(f"🔢 [REGISTRY] Registered tab {tab_id} as Tab {number}")
    return number


def unregister_tab(tab_id: int) -> int | None:
    """
    🔢 Unregister a closed tab.
    The number is NOT immediately reused - prevents confusion.

    @param tab_id: Chrome's internal tab ID
    @return: The freed number, or None if tab wasn't registered
    """
    global STABLE_TAB_REGISTRY

    number = STABLE_TAB_REGISTRY["tab_id_to_number"].pop(tab_id, None)
    if number is not None:
        STABLE_TAB_REGISTRY["number_to_tab_id"].pop(number, None)
        print(f"🔢 [REGISTRY] Unregistered Tab {number} (tab_id {tab_id})")
    return number


def get_stable_tab_number(tab_id: int) -> int | None:
    """
    🔢 Get the stable display number for a Chrome tab ID.

    @param tab_id: Chrome's internal tab ID
    @return: Stable number (1, 2, 3, etc.) or None if not registered
    """
    return STABLE_TAB_REGISTRY["tab_id_to_number"].get(tab_id)


def get_tab_id_from_number(number: int) -> int | None:
    """
    🔢 Get Chrome tab ID from stable display number.
    Used by translate_tab_params() to resolve LLM tab references.

    @param number: Stable display number (1, 2, 3, etc.)
    @return: Chrome tab ID or None if not found
    """
    return STABLE_TAB_REGISTRY["number_to_tab_id"].get(number)


def sync_tab_registry(tabs_info: list) -> dict:
    """
    🔢 Sync registry with current tabs from extension.
    - Registers any new tabs (assigns next number)
    - Unregisters any closed tabs

    @param tabs_info: List of tab objects from extension
    @return: Dict with sync stats {registered: N, unregistered: N}
    """
    if not tabs_info:
        return {"registered": 0, "unregistered": 0}

    current_tab_ids = {tab.get('id') for tab in tabs_info if tab.get('id')}
    registered_tab_ids = set(STABLE_TAB_REGISTRY["tab_id_to_number"].keys())

    stats = {"registered": 0, "unregistered": 0}

    # Register new tabs
    for tab in tabs_info:
        tab_id = tab.get('id')
        if tab_id and tab_id not in registered_tab_ids:
            register_tab(tab_id)
            stats["registered"] += 1

    # Unregister closed tabs
    for tab_id in registered_tab_ids - current_tab_ids:
        unregister_tab(tab_id)
        stats["unregistered"] += 1

    return stats


def get_tab_registry_state() -> dict:
    """
    🔢 Get current state of the tab registry for debugging.

    @return: Dict with registry state
    """
    return {
        "tab_count": len(STABLE_TAB_REGISTRY["tab_id_to_number"]),
        "next_number": STABLE_TAB_REGISTRY["next_number"],
        "mappings": {
            num: tab_id
            for num, tab_id in sorted(STABLE_TAB_REGISTRY["number_to_tab_id"].items())
        }
    }


def get_tabs_with_stable_numbers() -> list:
    """
    🗂️ Get CURRENT_TABS_INFO enriched with stable numbers.
    Follows same pattern as update_tabs_in_text_md() for consistency.

    @return: List of (stable_num, tab) tuples sorted by stable number
    """
    if not CURRENT_TABS_INFO:
        return []

    tabs_with_numbers = []
    for tab in CURRENT_TABS_INFO:
        tab_id = tab.get('id')
        stable_num = get_stable_tab_number(tab_id)
        if stable_num:
            # Create enriched copy with stable_num
            tab_copy = dict(tab)
            tab_copy["stable_num"] = stable_num
            tabs_with_numbers.append(tab_copy)

    # Sort by stable number for consistent display
    tabs_with_numbers.sort(key=lambda x: x["stable_num"])
    return tabs_with_numbers


def update_tabs_from_response(tabs: list) -> None:
    """
    🚀 IMMEDIATE: Update CURRENT_TABS_INFO and text.md from capability response.
    Called when a tab capability (OpenTab, CloseTab, etc.) returns with tabs data.

    @param tabs: List of tab objects from capability response
    """
    global CURRENT_TABS_INFO
    CURRENT_TABS_INFO = tabs
    print(f"🚀 [IMMEDIATE] Updated tabs from capability response: {len(CURRENT_TABS_INFO)} tabs")
    update_tabs_in_text_md()
    print(f"🚀 [IMMEDIATE] text.md updated from capability response")


def find_matching_tab(url_or_name: str) -> Optional[dict]:
    """
    🔍 Smart tab matching - finds an existing tab by URL or name.

    Checks:
    1. URL HOSTNAME contains the search term (e.g. "youtube.com" matches YouTube tab,
       NOT a Google search with "youtube.com" in the query string)
    2. Title contains the search term (case-insensitive)

    @param url_or_name: URL fragment or tab name to search for
    @return: Matching tab dict with stable_num, or None if no match
    """
    if not CURRENT_TABS_INFO or not url_or_name:
        return None

    search = url_or_name.lower().strip()

    # Strip protocol and www for URL matching
    if search.startswith("http://"):
        search = search[7:]
    elif search.startswith("https://"):
        search = search[8:]
    if search.startswith("www."):
        search = search[4:]

    # Extract just the domain part (before any path/query)
    search = search.split("/")[0].rstrip("/")

    for tab in CURRENT_TABS_INFO:
        tab_url = tab.get("url") or ""
        tab_title = (tab.get("title") or "").lower()

        # Extract hostname from tab URL using urlparse (avoids matching query strings)
        try:
            parsed = urlparse(tab_url)
            tab_hostname = parsed.netloc.lower()
            if tab_hostname.startswith("www."):
                tab_hostname = tab_hostname[4:]
        except Exception:
            tab_hostname = ""

        # Check for hostname match (search must be in hostname, NOT full URL)
        hostname_match = search in tab_hostname

        # Also check title (keep existing behavior)
        title_match = search in tab_title

        if hostname_match or title_match:
            # Get stable number
            tab_id = tab.get('id')
            stable_num = get_stable_tab_number(tab_id)
            if stable_num:
                tab_copy = dict(tab)
                tab_copy["stable_num"] = stable_num
                match_type = "hostname" if hostname_match else "title"
                print(f"🔍 [SMART-TAB] Found {match_type} match for '{url_or_name}': Tab {stable_num} - {tab.get('title')}")
                return tab_copy

    return None


def get_all_site_configs():
    """
    Load site_configs.json index and individual domain config files

    Returns:
        dict: Site configurations with capabilities, or empty dict if load fails
    """
    global SITE_CONFIGS

    if SITE_CONFIGS:
        return SITE_CONFIGS

    try:
        # Step 1: Load the index file (domain → config file path mapping)
        index_path = os.path.join("..", "web_extension", "site_configs.json")

        if not os.path.exists(index_path):
            print(f"⚠️ Site config index not found at: {index_path}")
            return {}

        with open(index_path, 'r', encoding='utf-8') as f:
            domain_index = json.load(f)

        print(f"✅ Loaded site config index: {len(domain_index)} domain mappings")

        # Step 2: Load each individual config file
        extension_dir = os.path.join("..", "web_extension")
        loaded_configs = {}

        for domain, config_file_path in domain_index.items():
            try:
                # Construct full path to config file
                full_config_path = os.path.join(extension_dir, config_file_path)

                if not os.path.exists(full_config_path):
                    print(f"⚠️ Config file not found for {domain}: {full_config_path}")
                    continue

                # Load the config file
                with open(full_config_path, 'r', encoding='utf-8') as cf:
                    config = json.load(cf)
                    loaded_configs[domain] = config
                    print(f"  ✅ Loaded config for {domain}: {config.get('framework', 'unknown')}")

            except Exception as e:
                print(f"  ❌ Error loading config for {domain}: {e}")
                continue

        SITE_CONFIGS = loaded_configs
        print(f"✅ Total configs loaded: {len(SITE_CONFIGS)} domains")
        return SITE_CONFIGS

    except Exception as e:
        print(f"❌ Error loading site configs: {e}")
        return {}


# 🔧 INTERNAL: Internal capabilities (server-side operations like chat management)
INTERNAL_CAPABILITIES = {}


def load_internal_capabilities() -> dict:
    """
    Load internal_capabilities.json for server-side capabilities.

    Returns:
        dict: Internal capabilities keyed by action name, or empty dict if load fails
    """
    global INTERNAL_CAPABILITIES

    if INTERNAL_CAPABILITIES:
        return INTERNAL_CAPABILITIES

    try:
        config_path = os.path.join(os.path.dirname(__file__), "data", "capabilities", "internal_capabilities.json")

        if not os.path.exists(config_path):
            print(f"⚠️ Internal capabilities not found at: {config_path}")
            return {}

        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        # Index by action name for fast lookup
        capabilities = config.get("capabilities", {})
        INTERNAL_CAPABILITIES = {
            cap.get("action"): cap
            for cap in capabilities.values()
            if cap.get("action")
        }

        print(f"✅ Loaded internal capabilities: {list(INTERNAL_CAPABILITIES.keys())}")
        return INTERNAL_CAPABILITIES

    except Exception as e:
        print(f"❌ Error loading internal capabilities: {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════════════════
# 🤖 LLM CONFIG HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

LLM_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "data", "llm_config.json")


def load_llm_config() -> dict:
    """Load LLM configuration from data/llm_config.json"""
    try:
        if os.path.exists(LLM_CONFIG_PATH):
            with open(LLM_CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            # Return default config if file doesn't exist
            return {
                "active_provider": "lm_studio",
                "providers": {
                    "lm_studio": {
                        "name": "LM Studio",
                        "type": "openai_compatible",
                        "endpoint": "http://localhost:1234/v1/chat/completions",
                        "model": "local-model",
                        "api_key": None
                    }
                },
                "settings": {
                    "temperature": 0.7,
                    "max_tokens": 1024,
                    "timeout_seconds": 30
                }
            }
    except Exception as e:
        print(f"❌ Error loading LLM config: {e}")
        return {}


def save_llm_config(config: dict) -> bool:
    """Save LLM configuration to data/llm_config.json"""
    try:
        # Ensure data directory exists
        os.makedirs(os.path.dirname(LLM_CONFIG_PATH), exist_ok=True)
        with open(LLM_CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        print("💾 Saved LLM config")
        return True
    except Exception as e:
        print(f"❌ Error saving LLM config: {e}")
        return False


def validate_capability(action: str, params: dict, offered_caps: list[dict] | None = None) -> tuple[dict | None, dict]:
    """
    Validate capability exists, has required params, and param values are valid.
    Also resolves aliases to canonical values.

    @param action: The capability action name
    @param params: Parameters provided
    @param offered_caps: Optional list of capabilities that were offered to the LLM
                        (includes site capabilities). If provided, these are also valid.
    @return: (error_dict or None, resolved_params)
             - error_dict: None if valid, or error dict with clarification needed
             - resolved_params: params with aliases resolved to canonical values
    """
    internal_caps = load_internal_capabilities()
    resolved_params = dict(params)  # Copy to avoid mutation

    # Build set of valid capability names (internal + offered site caps)
    valid_cap_names = set(internal_caps.keys())
    offered_cap_defs = {}  # Store offered cap definitions for param validation
    if offered_caps:
        for cap in offered_caps:
            cap_name = cap.get("label") or cap.get("name") or cap.get("action")
            if cap_name:
                valid_cap_names.add(cap_name)
                offered_cap_defs[cap_name] = cap

    # Check if capability exists (in internal OR offered list)
    if action not in valid_cap_names:
        return {
            "error": "unknown_capability",
            "action": action,
            "message": f"I don't have a capability called '{action}'. What would you like me to do?"
        }, resolved_params

    # Get capability definition - prefer internal, fallback to offered
    if action in internal_caps:
        cap_def = internal_caps[action]
    else:
        cap_def = offered_cap_defs.get(action, {})

    # Get params definition - empty dict means no params required
    cap_params = cap_def.get("params", {})

    # If no params defined, skip param validation entirely
    if not cap_params:
        return None, resolved_params

    # Process each param definition
    for param_name, param_def in cap_params.items():
        # Handle structured param definition (dict with valid_values, aliases, etc.)
        if isinstance(param_def, dict):
            is_required = param_def.get("required", False)
            valid_values = param_def.get("valid_values", [])
            aliases = param_def.get("aliases", {})
            value_labels = param_def.get("value_labels", {})
            param_desc = param_def.get("description", param_name)

            # Check if required param is missing
            if is_required and (param_name not in params or not params[param_name]):
                return {
                    "error": "missing_required_params",
                    "action": action,
                    "missing_params": [{"name": param_name, "description": param_desc}],
                    "message": f"I need the {param_name} for {action}"
                }, resolved_params

            # Validate param value if provided and valid_values defined
            if param_name in params and params[param_name] and valid_values:
                value = str(params[param_name]).lower().strip()

                # Check if it's a valid canonical value
                if value in valid_values:
                    resolved_params[param_name] = value
                    continue

                # Check if it's an alias - resolve to canonical value
                resolved = None
                for canonical, alias_list in aliases.items():
                    if value in [a.lower() for a in alias_list]:
                        resolved = canonical
                        break

                if resolved:
                    resolved_params[param_name] = resolved
                    continue

                # Invalid value - return error with options
                valid_options = []
                for v in valid_values:
                    label = value_labels.get(v, v)
                    valid_options.append({"value": v, "label": label})

                return {
                    "error": "invalid_param",
                    "action": action,
                    "param": param_name,
                    "invalid_value": params[param_name],
                    "valid_options": valid_options,
                    "message": f"'{params[param_name]}' isn't a valid {param_name}. Which would you like?"
                }, resolved_params

        # Handle simple string param definition (legacy format)
        else:
            param_desc = str(param_def)
            if "required" in param_desc.lower():
                if param_name not in params or not params[param_name]:
                    return {
                        "error": "missing_required_params",
                        "action": action,
                        "missing_params": [{"name": param_name, "description": param_desc}],
                        "message": f"I need more info for {action}: {param_name}"
                    }, resolved_params

    return None, resolved_params  # Valid


def execute_internal_capability(action: str, params: dict, offered_caps: list[dict] | None = None) -> dict:
    """
    Execute an internal (server-side) capability.

    @param action: The capability action name (e.g., 'GetChatList')
    @param params: Parameters for the capability
    @param offered_caps: Optional list of capabilities that were offered to the LLM
                        (includes site capabilities). Used for validation.
    @return: Result dictionary
    """
    global CURRENT_CHAT_ID
    print(f"🔧 Executing internal capability: {action} with params: {params}")

    # 🛡️ Validate capability and resolve aliases to canonical values
    validation_error, resolved_params = validate_capability(action, params, offered_caps)
    if validation_error:
        print(f"⚠️ Capability validation failed: {validation_error.get('error')}")
        return validation_error

    # Use resolved params (aliases mapped to canonical values)
    params = resolved_params

    if action == "GetChatList":
        # Pass project_id filter if provided (use "default" for sidebar unassigned chats)
        project_id = params.get("project_id")
        chats = list_chats(project_id=project_id)
        return {"chats": chats}

    elif action == "LoadChat":
        # Load chat content by ID or number
        # Optional params:
        #   chat: int - chat number from visible list (1-indexed)
        #   chat_id: str - direct chat ID (fallback)
        #   tail: int - only return last N messages (default: all)
        #   offset: int - skip last N messages before tail (for pagination)
        chat_num = params.get("chat")
        chat_id = params.get("chat_id")
        tail = params.get("tail")  # None = all messages
        offset = params.get("offset", 0)  # For "load more" pagination

        # 📚 Resolve chat number to chat_id if provided
        if chat_num is not None:
            chat_id = resolve_chat_number(chat_num)
            if not chat_id:
                return {"error": f"Invalid chat number: {chat_num}"}

        if not chat_id:
            return {"error": "Missing chat or chat_id parameter"}
        chat = load_chat(chat_id)
        if chat is None:
            return {"error": f"Chat not found: {chat_id}"}

        # Build response with optional message truncation
        total_messages = len(chat.get("messages", []))

        if tail is not None:
            # Return only last N messages (after offset)
            messages = chat.get("messages", [])
            if offset > 0:
                messages = messages[:-offset] if offset < len(messages) else []
            if tail > 0 and len(messages) > tail:
                messages = messages[-tail:]
                has_more = True
            else:
                has_more = offset > 0 or len(chat.get("messages", [])) > len(messages)

            # Create truncated chat response
            chat_response = {
                **chat,
                "messages": messages,
                "_truncated": True,
                "_total_messages": total_messages,
                "_showing": len(messages),
                "_has_more": has_more
            }
        else:
            chat_response = chat
            chat_response["_truncated"] = False
            chat_response["_total_messages"] = total_messages

        # Clear search context - user has selected a chat from search results
        clear_search_context()

        return {
            "chat": chat_response,
            "_hud_action": {"type": "load_chat", "chat_id": chat_id, "chat": chat_response}
        }

    elif action == "CreateChat":
        # Create a new chat file
        title = params.get("title", "")
        page_url = params.get("page_url", "")
        page_title = params.get("page_title", "")

        # If no title provided, show HUD naming UI instead of creating immediately
        if not title or title.strip() in ("", "New Chat"):
            return {
                "_hud_action": {"type": "start_new_chat"},
                "message": "Opening new chat dialog..."
            }

        # Title provided - create the chat
        now = datetime.utcnow()
        chat_id = generate_chat_id_from_prompt(title, now)

        # Create chat dict
        meta = {"page_url": page_url, "page_title": page_title}
        chat_dict = create_new_chat(chat_id, title, meta)

        # Save to disk
        if save_chat(chat_dict):
            return {
                "chat_id": chat_id,
                "chat": chat_dict,
                "_hud_action": {"type": "create_chat", "chat_id": chat_id, "chat": chat_dict}
            }
        else:
            return {"error": "Failed to save chat"}

    elif action == "AppendMessage":
        # Append message to chat (creates chat if needed)
        # Also updates CURRENT_CHAT_ID so LLM responses go to same chat
        chat_id = params.get("chat_id")
        role = params.get("role", "user")
        content = params.get("content", "")

        if not content:
            return {"error": "Missing content parameter"}

        now = datetime.utcnow()

        # Load or create chat
        if chat_id:
            chat_dict = load_chat(chat_id)
            if chat_dict is None:
                return {"error": f"Chat not found: {chat_id}"}
        else:
            # Create new chat - use first words of content as title
            title = params.get("title") or content
            page_url = params.get("page_url", "")
            page_title = params.get("page_title", "")
            chat_id = generate_chat_id_from_prompt(title, now)
            meta = {"page_url": page_url, "page_title": page_title}
            chat_dict = create_new_chat(chat_id, title, meta)

        # Update CURRENT_CHAT_ID so dispatcher routes LLM responses here
        CURRENT_CHAT_ID = chat_id
        print(f"💬 CURRENT_CHAT_ID set to: {chat_id}")

        # Append message
        if role == "user":
            new_message = append_user_message(chat_dict, content)
        else:
            new_message = append_assistant_message(chat_dict, content)

        # Save
        if save_chat(chat_dict):
            return {
                "chat_id": chat_id,
                "message": new_message,
                "message_count": len(chat_dict.get("messages", [])),
                "_hud_action": {"type": "append_message", "chat_id": chat_id, "message": new_message}
            }
        else:
            return {"error": "Failed to save chat"}

    elif action == "RenameChat":
        # Rename an existing chat by ID, number, or name (fuzzy)
        # Support LLM param name variations (chatId, newName, newTitle, etc.)
        # Note: LLM often sends chatId/chat as number (position) or string (name)
        llm_chat = params.get("chat")
        llm_chat_id = params.get("chatId")
        chat_num = params.get("chatNum")
        chat_id = params.get("chat_id")
        chat_name = params.get("name") or params.get("chatName")

        # Handle "chat" param: if numeric treat as number, if string treat as name
        if llm_chat is not None:
            if isinstance(llm_chat, int) or (isinstance(llm_chat, str) and llm_chat.isdigit()):
                chat_num = int(llm_chat) if chat_num is None else chat_num
            else:
                chat_name = llm_chat if chat_name is None else chat_name

        # Handle "chatId" param: if numeric treat as number, if string treat as chat_id
        if llm_chat_id is not None:
            if isinstance(llm_chat_id, int) or (isinstance(llm_chat_id, str) and llm_chat_id.isdigit()):
                chat_num = int(llm_chat_id) if chat_num is None else chat_num
            else:
                chat_id = llm_chat_id if chat_id is None else chat_id

        new_title = params.get("title") or params.get("newTitle") or params.get("newName")
        original_text = params.get("original_text", "")

        # 🔍 Parse source chat name from original text if not provided
        # Pattern: "rename (the)? (chat)? SOURCE_NAME to NEW_TITLE"
        if not chat_name and not chat_num and new_title and original_text:
            import re
            # Match: "rename the chat X to Y" or "rename X to Y"
            pattern = r'rename\s+(?:the\s+)?(?:chat\s+)?(.+?)\s+to\s+(.+?)$'
            match = re.search(pattern, original_text.lower().strip(), re.IGNORECASE)
            if match:
                source_part = match.group(1).strip()
                # Don't use if source looks like just "it" or "this" (means current chat)
                if source_part not in ("it", "this", "this chat"):
                    chat_name = source_part
                    print(f"📝 RenameChat: Parsed source name '{chat_name}' from original text")

        # 📚 Resolve chat number to chat_id if provided
        if chat_num is not None:
            chat_id = resolve_chat_number(chat_num)
            if not chat_id:
                return {"error": f"Invalid chat number: {chat_num}"}

        # Use name for fuzzy lookup if no chat_id yet
        if not chat_id and chat_name:
            search_term = chat_name.lower().strip()
            all_chats = list_chats()
            matches = []
            for chat_info in all_chats:
                title = chat_info.get("title", "").lower().strip()
                if title == search_term:
                    matches = [chat_info]
                    break
                if search_term in title or title in search_term:
                    matches.append(chat_info)

            if len(matches) == 1:
                chat_id = matches[0]["chat_id"]
                print(f"📝 RenameChat: Found by name '{search_term}' -> {chat_id}")
            elif len(matches) > 1:
                choices = [f"{i+1}. {m['title']}" for i, m in enumerate(matches[:5])]
                return {
                    "multiple_matches": True,
                    "message": f"Found {len(matches)} chats matching '{chat_name}'. Which one to rename?",
                    "choices": choices,
                    "matches": [{"number": i+1, "chat_id": m["chat_id"], "title": m["title"]} for i, m in enumerate(matches[:5])]
                }

        # Default to current chat if no chat specified
        if not chat_id and CURRENT_CHAT_ID:
            chat_id = CURRENT_CHAT_ID
            print(f"📝 RenameChat: Using current chat {chat_id}")

        print(f"📝 RenameChat: chat_id={chat_id}, new_title={new_title}")

        if not chat_id:
            print("❌ RenameChat: Missing chat_id")
            return {"error": "Missing chat or chat_id parameter"}
        if not new_title:
            print("❌ RenameChat: Missing title")
            return {"error": "Missing title parameter"}

        chat_dict = load_chat(chat_id)
        if chat_dict is None:
            print(f"❌ RenameChat: Chat not found: {chat_id}")
            return {"error": f"Chat not found: {chat_id}"}

        # Update title
        print(f"📝 RenameChat: Updating title from '{chat_dict.get('title')}' to '{new_title}'")
        chat_dict["title"] = new_title
        chat_dict["updated_at"] = datetime.utcnow().isoformat() + "Z"

        if save_chat(chat_dict):
            print("✅ RenameChat: Success")
            return {
                "chat_id": chat_id,
                "title": new_title,
                "_hud_action": {"type": "rename_chat", "chat_id": chat_id, "title": new_title}
            }
        else:
            print("❌ RenameChat: Failed to save")
            return {"error": "Failed to save chat"}

    elif action == "DeleteChat":
        # Delete a chat file by ID, number, or name (fuzzy)
        # Support LLM param name variations (chatId, chatNum, etc.)
        llm_chat = params.get("chat")
        llm_chat_id = params.get("chatId")
        chat_num = params.get("chatNum")
        chat_id = params.get("chat_id")
        chat_name = params.get("name") or params.get("chatName")

        # Handle "chat" param: if numeric treat as number, if string treat as name
        if llm_chat is not None:
            if isinstance(llm_chat, int) or (isinstance(llm_chat, str) and llm_chat.isdigit()):
                chat_num = int(llm_chat) if chat_num is None else chat_num
            else:
                chat_name = llm_chat if chat_name is None else chat_name

        # Handle "chatId" param: if numeric treat as number, if string treat as chat_id
        if llm_chat_id is not None:
            if isinstance(llm_chat_id, int) or (isinstance(llm_chat_id, str) and llm_chat_id.isdigit()):
                chat_num = int(llm_chat_id) if chat_num is None else chat_num
            else:
                chat_id = llm_chat_id if chat_id is None else chat_id

        original_text = params.get("original_text", "")

        # 🔍 Parse chat name from original text if not provided
        # Pattern: "delete (the)? (chat)? CHAT_NAME (chat)?"
        if not chat_name and not chat_num and original_text:
            import re
            # Match: "delete the my project chat" or "delete chat called X"
            pattern = r'delete\s+(?:the\s+)?(?:chat\s+)?(.+?)(?:\s+chat)?$'
            match = re.search(pattern, original_text.lower().strip(), re.IGNORECASE)
            if match:
                name_part = match.group(1).strip()
                # Don't use if it looks like "it" or "this" (means current chat)
                if name_part not in ("it", "this", "this chat", "current", "current chat"):
                    chat_name = name_part
                    print(f"🗑️ DeleteChat: Parsed name '{chat_name}' from original text")

        # 📚 Resolve chat number to chat_id if provided
        if chat_num is not None:
            chat_id = resolve_chat_number(chat_num)
            if not chat_id:
                return {"error": f"Invalid chat number: {chat_num}"}

        # Use name for fuzzy lookup if no chat_id yet
        if not chat_id and chat_name:
            search_term = chat_name.lower().strip()
            all_chats = list_chats()
            matches = []
            for chat_info in all_chats:
                title = chat_info.get("title", "").lower().strip()
                if title == search_term:
                    matches = [chat_info]
                    break
                if search_term in title or title in search_term:
                    matches.append(chat_info)

            if len(matches) == 1:
                chat_id = matches[0]["chat_id"]
                print(f"🗑️ DeleteChat: Found by name '{search_term}' -> {chat_id}")
            elif len(matches) > 1:
                choices = [f"{i+1}. {m['title']}" for i, m in enumerate(matches[:5])]
                return {
                    "multiple_matches": True,
                    "message": f"Found {len(matches)} chats matching '{chat_name}':",
                    "choices": choices,
                    "matches": [{"number": i+1, "chat_id": m["chat_id"], "title": m["title"]} for i, m in enumerate(matches[:5])]
                }

        # Default to current chat if no chat specified
        if not chat_id and CURRENT_CHAT_ID:
            chat_id = CURRENT_CHAT_ID
            print(f"🗑️ DeleteChat: Using current chat {chat_id}")

        if not chat_id:
            return {"error": "Missing chat, chat_id, or name parameter"}

        filepath = get_chat_filepath(chat_id)
        if not os.path.exists(filepath):
            return {"error": f"Chat not found: {chat_id}"}

        try:
            os.remove(filepath)
            # Remove from in-memory index
            _remove_from_chat_index(chat_id)
            print(f"🗑️ Deleted chat: {chat_id}")
            return {
                "chat_id": chat_id,
                "deleted": True,
                "_hud_action": {"type": "delete_chat", "chat_id": chat_id}
            }
        except Exception as e:
            return {"error": f"Failed to delete chat: {str(e)}"}

    elif action == "AppendUserMessage":
        # Append a user message (convenience wrapper for AppendMessage)
        content = params.get("content", "")
        if not content:
            return {"error": "Missing content parameter"}

        # Use current chat or create new one
        now = datetime.utcnow()
        chat_dict = None

        # Try to load existing chat
        if CURRENT_CHAT_ID:
            chat_dict = load_chat(CURRENT_CHAT_ID)
            if chat_dict is None:
                # Current chat was deleted
                CURRENT_CHAT_ID = None

        # Create new chat if needed
        if chat_dict is None:
            chat_id = generate_chat_id_from_prompt(content, now)
            page_url = params.get("page_url", "")
            page_title = params.get("page_title", "")
            meta = {"page_url": page_url, "page_title": page_title}
            chat_dict = create_new_chat(chat_id, content, meta)
            CURRENT_CHAT_ID = chat_id
            print(f"💬 Created new chat: {chat_id}")

        # Append user message
        new_message = append_user_message(chat_dict, content)

        if save_chat(chat_dict):
            return {
                "chat_id": CURRENT_CHAT_ID,
                "message": new_message,
                "message_count": len(chat_dict.get("messages", [])),
                "_hud_action": {"type": "append_message", "chat_id": CURRENT_CHAT_ID, "message": new_message}
            }
        else:
            return {"error": "Failed to save chat"}

    elif action == "AppendAssistantMessage":
        # Append an assistant message (convenience wrapper for AppendMessage)
        content = params.get("content", "")
        if not content:
            return {"error": "Missing content parameter"}

        # Must have an existing chat - assistant can't start a conversation
        chat_dict = None

        # Try to load existing chat
        if CURRENT_CHAT_ID:
            chat_dict = load_chat(CURRENT_CHAT_ID)
            if chat_dict is None:
                # Current chat was deleted
                CURRENT_CHAT_ID = None

        # No chat? Don't create one for assistant message
        if chat_dict is None:
            print("⚠️ AppendAssistantMessage: No active chat, skipping")
            return {"error": "No active chat for assistant message"}

        # Append assistant message
        new_message = append_assistant_message(chat_dict, content)

        if save_chat(chat_dict):
            return {
                "chat_id": CURRENT_CHAT_ID,
                "message": new_message,
                "message_count": len(chat_dict.get("messages", [])),
                "_hud_action": {"type": "append_message", "chat_id": CURRENT_CHAT_ID, "message": new_message}
            }
        else:
            return {"error": "Failed to save chat"}

    elif action == "GetCurrentChat":
        # Get current active chat info
        if not CURRENT_CHAT_ID:
            return {"chat_id": None, "chat": None}

        chat_dict = load_chat(CURRENT_CHAT_ID)
        if chat_dict is None:
            CURRENT_CHAT_ID = None
            return {"chat_id": None, "chat": None}

        return {"chat_id": CURRENT_CHAT_ID, "chat": chat_dict}

    elif action == "GetFullHistory":
        # Get full chat history (all messages) - used when LLM needs more context
        chat_id = params.get("chat_id") or CURRENT_CHAT_ID
        if not chat_id:
            return {"error": "No chat specified and no current chat active"}

        chat_dict = load_chat(chat_id)
        if chat_dict is None:
            return {"error": f"Chat not found: {chat_id}"}

        messages = chat_dict.get("messages", [])
        print(f"📜 GetFullHistory: Returning {len(messages)} messages from {chat_id}")

        return {
            "chat_id": chat_id,
            "messages": messages,
            "total_messages": len(messages),
            "title": chat_dict.get("title", "Untitled")
        }

    elif action == "SetCurrentChat":
        # Set the active chat - supports chat number, chat_id, name, or fuzzy title lookup
        chat_num = params.get("chat")  # Number from visible list (1-indexed)
        chat_id = params.get("chat_id")
        chat_name = params.get("name")  # Fuzzy title lookup
        original_text = params.get("original_text", "")

        # 🔍 Parse chat name from original text if not provided
        # Patterns: "open the X chat", "switch to X chat", "go to the X chat", "switch chat to X"
        if not chat_name and not chat_num and original_text:
            import re
            text_lower = original_text.lower().strip()
            name_part = None

            # Pattern 1: "open/switch to/go to the X chat"
            pattern1 = r'(?:open|switch to|go to|load)\s+(?:the\s+)?(.+?)\s+chat$'
            match = re.search(pattern1, text_lower, re.IGNORECASE)
            if match:
                name_part = match.group(1).strip()

            # Pattern 2: "switch chat to X" / "change chat to X"
            if not name_part:
                pattern2 = r'(?:switch|change|go to)\s+chat\s+to\s+(.+)$'
                match = re.search(pattern2, text_lower, re.IGNORECASE)
                if match:
                    name_part = match.group(1).strip()

            if name_part and name_part not in ("this", "current", "a", "that"):
                chat_name = name_part
                print(f"💬 SetCurrentChat: Parsed name '{chat_name}' from original text")

        # Resolve chat number to chat_id if provided
        if chat_num is not None:
            chat_id = resolve_chat_number(chat_num)
            if not chat_id:
                return {"error": f"Invalid chat number: {chat_num}"}

        # Use name for fuzzy lookup if no chat_id yet
        if not chat_id and chat_name:
            chat_id = chat_name  # Will trigger fuzzy matching below

        if not chat_id:
            return {"error": "Missing chat, chat_id, or name parameter"}

        # Try exact chat_id match first
        chat_dict = load_chat(chat_id)

        # If not found, try title lookup (fuzzy matching)
        if chat_dict is None:
            search_term = chat_id.lower().strip()
            all_chats = list_chats()
            matches = []

            for chat_info in all_chats:
                title = chat_info.get("title", "").lower().strip()
                # Exact match takes priority
                if title == search_term:
                    matches = [chat_info]
                    break
                # Fuzzy: title contains search term or search term contains title
                if search_term in title or title in search_term:
                    matches.append(chat_info)

            if len(matches) == 1:
                # Single match - load it
                chat_id = matches[0]["chat_id"]
                chat_dict = load_chat(chat_id)
                print(f"💬 Found chat by title: '{search_term}' -> {chat_id}")
            elif len(matches) > 1:
                # Multiple matches - return list for user to choose
                print(f"💬 Multiple matches for '{search_term}': {len(matches)}")
                choices = []
                for i, m in enumerate(matches[:5], 1):  # Limit to 5
                    choices.append(f"{i}. {m['title']}")
                return {
                    "multiple_matches": True,
                    "message": f"Found {len(matches)} chats matching '{chat_id}':",
                    "choices": choices,
                    "matches": [{"number": i+1, "chat_id": m["chat_id"], "title": m["title"]} for i, m in enumerate(matches[:5])]
                }

        if chat_dict is None:
            return {"error": f"Chat not found: {chat_id}"}

        CURRENT_CHAT_ID = chat_id
        print(f"💬 Set current chat: {chat_id}")
        return {
            "chat_id": chat_id,
            "_hud_action": {"type": "load_chat", "chat_id": chat_id, "chat": chat_dict}
        }

    elif action == "SearchChats":
        # Search chats by title or message content
        query = params.get("query", "").lower().strip()
        limit = params.get("limit", 20)

        if not query:
            # Return needs_input to prompt user for search term
            return {
                "needs_input": True,
                "capability": "SearchChats",
                "param": "query",
                "prompt": "What would you like to search for?"
            }

        # Get all chats
        all_chats = list_chats()
        results = []

        for chat_meta in all_chats:
            # Check title match
            title_match = query in chat_meta.get("title", "").lower()

            # Check message content match
            content_match = False
            chat_data = load_chat(chat_meta["chat_id"])
            if chat_data:
                for msg in chat_data.get("messages", []):
                    if query in msg.get("content", "").lower():
                        content_match = True
                        break

            if title_match or content_match:
                results.append({
                    "chat_id": chat_meta["chat_id"],
                    "title": chat_meta.get("title", "Untitled"),
                    "date_short": chat_meta.get("date_short", ""),
                    "message_count": chat_meta.get("message_count", 0),
                    "match_type": "title" if title_match else "content"
                })

            if len(results) >= limit:
                break

        print(f"🔍 SearchChats: '{query}' found {len(results)} results")

        # Set search context so LLM can reference results in follow-up
        set_search_context(query, results)

        return {
            "query": query,
            "results": results,
            "count": len(results),
            "_hud_action": {"type": "search_results", "query": query, "results": results}
        }

    elif action == "CloseSearch":
        # Close/clear the chat search and show all chats
        clear_search_context()
        return {
            "message": "Search closed",
            "_hud_action": {"type": "close_search"}
        }

    # 🎛️ UI CONTROL CAPABILITIES
    elif action == "SwitchView" or action == "ToggleHUD":
        # Clear search context on view switch
        clear_search_context()
        return {"_hud_action": {"type": "toggle_hud"}}

    elif action == "ShowChats":
        return {"_hud_action": {"type": "show_sidebar"}}

    elif action == "HideChats":
        # Clear search context when hiding chats panel
        clear_search_context()
        return {"_hud_action": {"type": "hide_sidebar"}}

    elif action == "ToggleChats":
        return {"_hud_action": {"type": "toggle_sidebar"}}

    elif action == "ShowPrompt":
        return {"_hud_action": {"type": "show_prompt"}}

    elif action == "HidePrompt":
        return {"_hud_action": {"type": "hide_prompt"}}

    elif action == "SetTheme":
        # Aliases already resolved by validate_capability() - just use the canonical value
        theme = params.get("theme", "robot")
        return {"_hud_action": {"type": "set_theme", "theme": theme}}

    # ═══════════════════════════════════════════════════════════════════════════
    # 🤖 LLM CONFIG CAPABILITIES
    # ═══════════════════════════════════════════════════════════════════════════

    elif action == "GetLLMConfig":
        # Return full LLM configuration
        config = load_llm_config()
        # Mask API keys for security (show only last 4 chars)
        safe_config = json.loads(json.dumps(config))  # Deep copy
        for provider_key, provider in safe_config.get("providers", {}).items():
            api_key = provider.get("api_key")
            if api_key and not api_key.startswith("$") and len(api_key) > 8:
                provider["api_key"] = f"***{api_key[-4:]}"
        return {"config": safe_config}

    elif action == "SetLLMProvider":
        # Switch active provider
        provider = params.get("provider")
        if not provider:
            return {"error": "Missing provider parameter"}

        config = load_llm_config()
        if provider not in config.get("providers", {}):
            return {"error": f"Unknown provider: {provider}. Available: {list(config.get('providers', {}).keys())}"}

        config["active_provider"] = provider
        if save_llm_config(config):
            return {"active_provider": provider, "provider_name": config["providers"][provider].get("name")}
        return {"error": "Failed to save config"}

    elif action == "SetLLMEndpoint":
        # Set endpoint URL for a provider
        provider = params.get("provider")
        endpoint = params.get("endpoint")
        if not provider or not endpoint:
            return {"error": "Missing provider or endpoint parameter"}

        config = load_llm_config()
        if provider not in config.get("providers", {}):
            return {"error": f"Unknown provider: {provider}"}

        config["providers"][provider]["endpoint"] = endpoint
        if save_llm_config(config):
            return {"provider": provider, "endpoint": endpoint}
        return {"error": "Failed to save config"}

    elif action == "SetLLMModel":
        # Set model for a provider (or active provider if not specified)
        provider = params.get("provider")
        model = params.get("model")
        if not model:
            return {"error": "Missing model parameter"}

        config = load_llm_config()
        provider = provider or config.get("active_provider")
        if provider not in config.get("providers", {}):
            return {"error": f"Unknown provider: {provider}"}

        config["providers"][provider]["model"] = model
        if save_llm_config(config):
            return {"provider": provider, "model": model}
        return {"error": "Failed to save config"}

    elif action == "SetLLMAPIKey":
        # Set API key for a provider
        provider = params.get("provider")
        api_key = params.get("api_key")
        if not provider or not api_key:
            return {"error": "Missing provider or api_key parameter"}

        config = load_llm_config()
        if provider not in config.get("providers", {}):
            return {"error": f"Unknown provider: {provider}"}

        config["providers"][provider]["api_key"] = api_key
        if save_llm_config(config):
            # Return masked key for confirmation
            masked = f"***{api_key[-4:]}" if len(api_key) > 8 and not api_key.startswith("$") else api_key
            return {"provider": provider, "api_key": masked}
        return {"error": "Failed to save config"}

    elif action == "SetTemperature":
        # Set temperature setting
        temperature = params.get("temperature")
        if temperature is None:
            return {"error": "Missing temperature parameter"}

        try:
            temp_val = float(temperature)
            if temp_val < 0.0 or temp_val > 2.0:
                return {"error": "Temperature must be between 0.0 and 2.0"}
        except ValueError:
            return {"error": "Temperature must be a number"}

        config = load_llm_config()
        if "settings" not in config:
            config["settings"] = {}
        config["settings"]["temperature"] = temp_val
        if save_llm_config(config):
            return {"temperature": temp_val}
        return {"error": "Failed to save config"}

    elif action == "SetMaxTokens":
        # Set max tokens setting
        max_tokens = params.get("max_tokens")
        if max_tokens is None:
            return {"error": "Missing max_tokens parameter"}

        try:
            tokens_val = int(max_tokens)
            if tokens_val < 1 or tokens_val > 128000:
                return {"error": "max_tokens must be between 1 and 128000"}
        except ValueError:
            return {"error": "max_tokens must be an integer"}

        config = load_llm_config()
        if "settings" not in config:
            config["settings"] = {}
        config["settings"]["max_tokens"] = tokens_val
        if save_llm_config(config):
            return {"max_tokens": tokens_val}
        return {"error": "Failed to save config"}

    elif action == "GetScanMode":
        # Get current scan mode from config
        config = load_llm_config()
        if "extension" not in config:
            config["extension"] = {"scan_mode": "at"}
        scan_mode = config.get("extension", {}).get("scan_mode", "at")
        return {"scan_mode": scan_mode}

    elif action == "SetScanMode":
        # Set scan mode (at or dom)
        mode = params.get("mode")
        if not mode:
            return {"error": "Missing mode parameter"}
        if mode not in ["at", "dom"]:
            return {"error": f"Invalid scan mode: {mode}. Must be 'at' or 'dom'"}

        config = load_llm_config()
        if "extension" not in config:
            config["extension"] = {}
        config["extension"]["scan_mode"] = mode
        if save_llm_config(config):
            return {"scan_mode": mode}
        return {"error": "Failed to save config"}

    elif action == "AddLLMProvider":
        # Add a new provider
        key = params.get("key")
        name = params.get("name")
        ptype = params.get("type")
        endpoint = params.get("endpoint")
        model = params.get("model")
        api_key = params.get("api_key")

        if not all([key, name, ptype, endpoint, model]):
            return {"error": "Missing required parameters: key, name, type, endpoint, model"}

        if ptype not in ["openai", "anthropic", "openai_compatible"]:
            return {"error": f"Invalid type: {ptype}. Must be openai, anthropic, or openai_compatible"}

        config = load_llm_config()
        if key in config.get("providers", {}):
            return {"error": f"Provider already exists: {key}"}

        config["providers"][key] = {
            "name": name,
            "type": ptype,
            "endpoint": endpoint,
            "model": model,
            "api_key": api_key
        }
        if save_llm_config(config):
            return {"added": key, "provider": config["providers"][key]}
        return {"error": "Failed to save config"}

    elif action == "RemoveLLMProvider":
        # Remove a provider
        provider = params.get("provider")
        if not provider:
            return {"error": "Missing provider parameter"}

        config = load_llm_config()
        if provider not in config.get("providers", {}):
            return {"error": f"Unknown provider: {provider}"}

        if config.get("active_provider") == provider:
            return {"error": "Cannot remove active provider. Switch to another provider first."}

        del config["providers"][provider]
        if save_llm_config(config):
            return {"removed": provider}
        return {"error": "Failed to save config"}

    elif action == "ReloadLLMConfig":
        # Reload LLM config - the orchestrator will use fresh config on next request
        global PERSONA_ORCHESTRATOR
        if PERSONA_ORCHESTRATOR:
            # Close current orchestrator so next request creates fresh instance
            PERSONA_ORCHESTRATOR = None
            print("🎭 Orchestrator reset - next request will use new config")
            return {"reloaded": True, "message": "Orchestrator will reload on next request"}
        return {"reloaded": True, "message": "No active orchestrator to reload"}

    elif action == "ReloadSiteConfigs":
        # Reload cached site configs (used by is_site_config_capability / prompt capabilities)
        global SITE_CONFIGS
        SITE_CONFIGS = {}
        try:
            configs = get_all_site_configs()
            return {"reloaded": True, "domains": len(configs)}
        except Exception as e:
            return {"reloaded": False, "error": str(e)}

    else:
        return {"error": f"Unknown internal capability: {action}"}


# 📁 Site map storage configuration
SITE_STRUCTURES_DIR = "@site_structures"

# 🆕 NEW: Central page.jsonl file for current page state
CURRENT_PAGE_JSONL = "page.jsonl"
CURRENT_PAGE_DATA = None
LAST_PAGE_UPDATE = None

# 🆕 NEW: Central content.jsonl file for current page content
CURRENT_CONTENT_JSONL = "content.jsonl"
CURRENT_CONTENT_DATA = None
LAST_CONTENT_UPDATE = None
TRANSCRIPTS_DIR = os.path.join(SITE_STRUCTURES_DIR, "transcripts")
CURRENT_TRANSCRIPTS_INFO = []
VIDEO_HISTORY_JSONL = os.path.join(TRANSCRIPTS_DIR, "video_history.jsonl")

# 🔄 Stored data for quick text.md regeneration on tab changes
LAST_TEXT_MD_DATA = None  # Stores {title, url, page_text, capabilities, elements, iframes}

# 🆕 In-memory storage for text.json resolution data
# Used to look up element hints (label, type, tag, selectors) by action ID
CURRENT_TEXT_JSON = {}

SERVER_HEARTBEAT_INTERVAL = 20  # seconds


def slugify(value: str) -> str:
    """
    Create filesystem-friendly slugs for transcript filenames.
    """
    if not value:
        return "transcript"
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "transcript"

async def consolidate_actionable_elements_to_menus(actionable_elements):
    """
    🎯 Consolidate raw actionable elements into clean menu structure
    
    This function takes the raw elements from the extension and organizes them
    into meaningful menu structures for LLM consumption.
    
    @param actionable_elements: List of raw actionable elements from extension
    @return: Clean menu structure with consolidated menus
    """
    try:
        if not actionable_elements:
            print("⚠️ No actionable elements to consolidate")
            return {
                "menus": [],
                "summary": {
                    "total_menus": 0,
                    "total_items": 0,
                    "navigation_links": 0
                }
            }
        
        print(f"🎯 Consolidating {len(actionable_elements)} actionable elements into menus...")
        
        # 🎯 Step 1: Categorize elements by type and context
        navigation_elements = []
        toggle_elements = []
        action_elements = []
        content_elements = []
        
        for element in actionable_elements:
            action_type = element.get("actionType", "unknown")
            text_content = element.get("textContent", "").strip()
            selectors = element.get("selectors", [])
            
            # 🎯 Categorize by action type and selectors
            if action_type == "navigate" and any("menu" in selector.lower() for selector in selectors):
                navigation_elements.append(element)
            elif action_type == "click" and any("toggle" in selector.lower() or "menu" in selector.lower() for selector in selectors):
                toggle_elements.append(element)
            elif action_type == "navigate" and text_content:
                action_elements.append(element)
            else:
                content_elements.append(element)
        
        print(f"🎯 Categorized: {len(navigation_elements)} navigation, {len(toggle_elements)} toggles, {len(action_elements)} actions, {len(content_elements)} content")
        
        # 🎯 Step 2: Build main navigation menu
        main_navigation = {
            "id": "main_navigation",
            "type": "main_navigation",
            "name": "Main Navigation",
            "items": [],
            "toggles": []
        }
        
        # Add navigation items
        for element in navigation_elements:
            if element.get("textContent", "").strip():
                main_navigation["items"].append({
                    "id": element.get("actionId"),
                    "text": element.get("textContent", "").strip(),
                    "href": element.get("attributes", {}).get("href", ""),
                    "selectors": element.get("selectors", []),
                    "action_type": element.get("actionType", "navigate")
                })
        
        # Add toggle buttons
        for element in toggle_elements:
            if element.get("textContent", "").strip():
                main_navigation["toggles"].append({
                    "id": element.get("actionId"),
                    "text": element.get("textContent", "").strip(),
                    "aria_label": element.get("attributes", {}).get("aria-label", ""),
                    "selectors": element.get("selectors", []),
                    "action_type": element.get("actionType", "click")
                })
        
        # 🎯 Step 3: Create consolidated structure
        consolidated_structure = {
            "menus": [main_navigation] if main_navigation["items"] or main_navigation["toggles"] else [],
            "summary": {
                "total_menus": 1 if main_navigation["items"] or main_navigation["toggles"] else 0,
                "total_items": len(main_navigation["items"]),
                "navigation_links": len(main_navigation["items"]),
                "toggle_buttons": len(main_navigation["toggles"])
            }
        }
        
        print(f"✅ Menu consolidation complete: {consolidated_structure['summary']['total_menus']} menus, {consolidated_structure['summary']['total_items']} items, {consolidated_structure['summary']['toggle_buttons']} toggles")
        
        return consolidated_structure
        
    except Exception as e:
        print(f"❌ Error consolidating actionable elements: {e}")
        import traceback
        traceback.print_exc()
        return {
            "menus": [],
            "summary": {
                "total_menus": 0,
                "total_items": 0,
                "navigation_links": 0
            }
        }

async def consolidate_content_elements_to_structure(content_elements):
    """
    🎯 Consolidate raw content elements into clean content structure
    
    This function takes the raw content elements from the extension and organizes them
    into meaningful content structures for LLM consumption.
    
    @param content_elements: List of raw content elements from extension
    @return: Clean content structure with consolidated content
    """
    try:
        if not content_elements:
            print("⚠️ No content elements to consolidate")
            return {
                "content_structure": {},
                "summary": {
                    "total_content_elements": 0,
                    "headings": 0,
                    "paragraphs": 0,
                    "lists": 0,
                    "images": 0,
                    "tables": 0
                }
            }
        
        print(f"🎯 Consolidating {len(content_elements)} content elements into structure...")
        
        # 🎯 Step 1: Categorize content elements by type
        content_categories = {
            "headings": [],
            "paragraphs": [],
            "lists": [],
            "images": [],
            "tables": [],
            "other": []
        }
        
        for element in content_elements:
            content_type = element.get("contentType", "unknown")
            tag_name = element.get("tagName", "").lower()
            
            # 🎯 Categorize by content type and tag name
            if content_type == "heading" or tag_name.startswith("h"):
                content_categories["headings"].append(element)
            elif content_type == "paragraph" or tag_name == "p":
                content_categories["paragraphs"].append(element)
            elif content_type == "list" or tag_name in ["ul", "ol", "li"]:
                content_categories["lists"].append(element)
            elif content_type == "image" or tag_name == "img":
                content_categories["images"].append(element)
            elif content_type == "table" or tag_name in ["table", "tr", "td", "th"]:
                content_categories["tables"].append(element)
            else:
                content_categories["other"].append(element)
        
        print(f"🎯 Categorized: {len(content_categories['headings'])} headings, {len(content_categories['paragraphs'])} paragraphs, {len(content_categories['lists'])} lists, {len(content_categories['images'])} images, {len(content_categories['tables'])} tables, {len(content_categories['other'])} other")
        
        # 🎯 Step 2: Build content structure
        content_structure = {}
        
        # Process headings
        if content_categories["headings"]:
            content_structure["headings"] = [{
                "id": el.get("contentId"),
                "text": el.get("textContent", ""),
                "tagName": el.get("tagName", ""),
                "selectors": el.get("selectors", []),
                "level": int(el.get("tagName", "h1")[1]) if el.get("tagName", "").startswith("h") else 1
            } for el in content_categories["headings"]]
        
        # Process paragraphs
        if content_categories["paragraphs"]:
            content_structure["paragraphs"] = [{
                "id": el.get("contentId"),
                "text": el.get("textContent", ""),
                "selectors": el.get("selectors", []),
                "attributes": el.get("attributes", {})
            } for el in content_categories["paragraphs"]]
        
        # Process lists
        if content_categories["lists"]:
            content_structure["lists"] = [{
                "id": el.get("contentId"),
                "text": el.get("textContent", ""),
                "tagName": el.get("tagName", ""),
                "selectors": el.get("selectors", []),
                "listType": "ordered" if el.get("tagName") == "ol" else "unordered"
            } for el in content_categories["lists"]]
        
        # Process images
        if content_categories["images"]:
            content_structure["images"] = [{
                "id": el.get("contentId"),
                "alt": el.get("attributes", {}).get("alt", ""),
                "src": el.get("attributes", {}).get("src", ""),
                "selectors": el.get("selectors", []),
                "attributes": el.get("attributes", {})
            } for el in content_categories["images"]]
        
        # Process tables
        if content_categories["tables"]:
            content_structure["tables"] = [{
                "id": el.get("contentId"),
                "text": el.get("textContent", ""),
                "tagName": el.get("tagName", ""),
                "selectors": el.get("selectors", []),
                "attributes": el.get("attributes", {})
            } for el in content_categories["tables"]]
        
        # 🎯 Step 3: Create consolidated structure
        consolidated_structure = {
            "content_structure": content_structure,
            "summary": {
                "total_content_elements": len(content_elements),
                "headings": len(content_categories["headings"]),
                "paragraphs": len(content_categories["paragraphs"]),
                "lists": len(content_categories["lists"]),
                "images": len(content_categories["images"]),
                "tables": len(content_categories["tables"]),
                "other": len(content_categories["other"])
            }
        }
        
        print(f"✅ Content consolidation complete: {consolidated_structure['summary']['total_content_elements']} elements, {len(content_structure)} categories")
        
        return consolidated_structure
        
    except Exception as e:
        print(f"❌ Error consolidating content elements: {e}")
        import traceback
        traceback.print_exc()
        return {
            "content_structure": {},
            "summary": {
                "total_content_elements": 0,
                "headings": 0,
                "paragraphs": 0,
                "lists": 0,
                "images": 0,
                "tables": 0
            }
        }

async def save_intelligence_to_page_jsonl(intelligence_data, transcript_refs=None):
    """
    🧠 Save intelligence data to central page.jsonl file
    
    This function maintains a single, up-to-date file representing the current
    page state and actionable elements for LLM consumption.
    
    @param intelligence_data: Intelligence update data from extension
    """
    global CURRENT_PAGE_DATA, LAST_PAGE_UPDATE
    transcript_refs = list(transcript_refs or [])
    
    try:
        # Ensure the site structures directory exists
        if not os.path.exists(SITE_STRUCTURES_DIR):
            os.makedirs(SITE_STRUCTURES_DIR)
            print(f"📁 Created directory: {SITE_STRUCTURES_DIR}")
        
        # 🆕 NEW: Get current browser state information
        browser_state = {
            "total_tabs": len(CURRENT_TABS_INFO) if CURRENT_TABS_INFO else 0,
            "active_tab": CURRENT_ACTIVE_TAB,
            "all_tabs": CURRENT_TABS_INFO if CURRENT_TABS_INFO else [],
            "last_tabs_update": LAST_TABS_UPDATE,
            "extension_connected": EXTENSION_WS is not None
        }
        
        normalized_records = intelligence_data.get("normalizedRecords") or []

        if normalized_records:
            enriched_records = []
            meta_enriched = False
            current_page = {
                "url": browser_state.get("active_tab", {}).get("url", "unknown"),
                "title": browser_state.get("active_tab", {}).get("title", "unknown"),
                "is_active_tab": True
            }

            for record in normalized_records:
                # Work with a copy to avoid mutating the original payload
                rec = dict(record)
                if not meta_enriched and rec.get("type") == "meta":
                    rec["browser_state"] = browser_state
                    rec["current_page"] = current_page
                    rec["pageVersion"] = intelligence_data.get("pageVersion")
                    if transcript_refs:
                        rec["transcripts"] = transcript_refs
                    meta_enriched = True
                enriched_records.append(rec)

            if not meta_enriched:
                enriched_records.insert(0, {
                    "type": "meta",
                    "id": "meta-page",
                    "url": current_page["url"],
                    "title": current_page["title"],
                    "timestamp": time.time(),
                    "browser_state": browser_state,
                    "current_page": current_page,
                    "transcripts": transcript_refs,
                    "pageVersion": intelligence_data.get("pageVersion")
                })

            meta_record = next((r for r in enriched_records if r.get("type") == "meta"), {})
            totals = meta_record.get("totals", {})

            CURRENT_PAGE_DATA = {
                "normalized": True,
                "timestamp": time.time(),
                "browser_state": browser_state,
                "current_page": current_page,
                "summary": totals,
                "record_count": len(enriched_records),
                "transcripts": transcript_refs
            }
            LAST_PAGE_UPDATE = time.time()

            filepath = os.path.join(SITE_STRUCTURES_DIR, CURRENT_PAGE_JSONL)
            with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
                for record in enriched_records:
                    f.write(json.dumps(record, ensure_ascii=False) + '\n')

            print(f"🧠 Normalized records saved to {filepath} ({len(enriched_records)} lines)")
            if totals:
                print(f"📊 Summary → Sections: {totals.get('sections', 0)}, Elements: {totals.get('elements', 0)}, Actions: {totals.get('actions', 0)}")
            print(f"🌐 Browser State: {browser_state['total_tabs']} tabs, Active: {current_page['url']}")

            return filepath

        # Fallback: legacy path when normalized records not available
        actionable_elements = intelligence_data.get("actionableElements", [])
        consolidated_menus = await consolidate_actionable_elements_to_menus(actionable_elements)

        page_data = {
            "timestamp": time.time(),
            "browser_state": browser_state,
            "current_page": {
                "url": browser_state.get("active_tab", {}).get("url", "unknown"),
                "title": browser_state.get("active_tab", {}).get("title", "unknown"),
                "is_active_tab": True
            },
            "menu_structure": consolidated_menus,
            "page_state": intelligence_data.get("pageState", {}),
            "recent_insights": intelligence_data.get("recentInsights", []),
            "summary": consolidated_menus.get("summary", {}),
            "intelligence_version": "2.0",
            "transcripts": transcript_refs
        }

        CURRENT_PAGE_DATA = page_data
        LAST_PAGE_UPDATE = time.time()

        filepath = os.path.join(SITE_STRUCTURES_DIR, CURRENT_PAGE_JSONL)
        with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
            f.write(json.dumps(page_data, ensure_ascii=False, indent=2) + '\n')

        print(f"🧠 Intelligence saved to central file (legacy format): {filepath}")
        print(f"📊 Menus: {page_data['summary'].get('total_menus', 0)}, Items: {page_data['summary'].get('total_items', 0)}, Toggles: {page_data['summary'].get('toggle_buttons', 0)}")
        print(f"🌐 Browser State: {browser_state['total_tabs']} tabs, Active: {browser_state['active_tab'].get('url', 'unknown') if browser_state['active_tab'] else 'none'}")

        return filepath
        
    except Exception as e:
        print(f"❌ Error saving intelligence to page.jsonl: {e}")
        return None

async def save_content_to_content_jsonl(intelligence_data, transcript_refs=None):
    """
    📄 Save content data to central content.jsonl file
    
    This function maintains a single, up-to-date file representing the current
    page content structure for LLM consumption.
    
    @param intelligence_data: Intelligence update data from extension
    """
    global CURRENT_CONTENT_DATA, LAST_CONTENT_UPDATE
    transcript_refs = list(transcript_refs or [])
    
    try:
        # Ensure the site structures directory exists
        if not os.path.exists(SITE_STRUCTURES_DIR):
            os.makedirs(SITE_STRUCTURES_DIR)
            print(f"📁 Created directory: {SITE_STRUCTURES_DIR}")
        
        # 🆕 NEW: Get current browser state information
        browser_state = {
            "total_tabs": len(CURRENT_TABS_INFO) if CURRENT_TABS_INFO else 0,
            "active_tab": CURRENT_ACTIVE_TAB,
            "all_tabs": CURRENT_TABS_INFO if CURRENT_TABS_INFO else [],
            "last_tabs_update": LAST_TABS_UPDATE,
            "extension_connected": EXTENSION_WS is not None
        }
        
        # 🆕 NEW: Apply content consolidation before saving
        content_elements = intelligence_data.get("contentElements", [])
        consolidated_content = await consolidate_content_elements_to_structure(content_elements)
        
        # Prepare content data for JSONL format with browser state
        content_data = {
            "timestamp": time.time(),
            "browser_state": browser_state,
            "current_page": {
                "url": browser_state.get("active_tab", {}).get("url", "unknown"),
                "title": browser_state.get("active_tab", {}).get("title", "unknown"),
                "is_active_tab": True
            },
            # 🆕 NEW: Clean content structure instead of raw elements
            "content_structure": consolidated_content.get("content_structure", {}),
            "page_state": intelligence_data.get("pageState", {}),
            "summary": consolidated_content.get("summary", {}),
            "intelligence_version": "2.0",
            "transcripts": transcript_refs
        }
        
        # Update global state
        CURRENT_CONTENT_DATA = content_data
        LAST_CONTENT_UPDATE = time.time()
        
        # Save to central content.jsonl file
        filepath = os.path.join(SITE_STRUCTURES_DIR, CURRENT_CONTENT_JSONL)
        with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
            f.write(json.dumps(content_data, ensure_ascii=False, indent=2) + '\n')
        
        print(f"📄 Content saved to central file: {filepath}")
        print(f"📊 Content Summary: {content_data['summary'].get('total_content_elements', 0)} elements")
        print(f"   📝 Headings: {content_data['summary'].get('headings', 0)}")
        print(f"   📄 Paragraphs: {content_data['summary'].get('paragraphs', 0)}")
        print(f"   📋 Lists: {content_data['summary'].get('lists', 0)}")
        print(f"   🖼️ Images: {content_data['summary'].get('images', 0)}")
        print(f"   📊 Tables: {content_data['summary'].get('tables', 0)}")
        print(f"🌐 Browser State: {browser_state['total_tabs']} tabs, Active: {browser_state['active_tab'].get('url', 'unknown') if browser_state['active_tab'] else 'none'}")
        
        return filepath
        
    except Exception as e:
        print(f"❌ Error saving content to content.jsonl: {e}")
        return None


def _ensure_video_history_file():
    """Ensure the video history JSONL file exists."""
    if os.path.exists(VIDEO_HISTORY_JSONL):
        return
    os.makedirs(os.path.dirname(VIDEO_HISTORY_JSONL), exist_ok=True)
    # Create empty file
    open(VIDEO_HISTORY_JSONL, 'a').close()


def _load_video_history_entries():
    """Return historical transcript metadata stored in video_history.jsonl."""
    entries = []
    if not os.path.exists(VIDEO_HISTORY_JSONL):
        return entries
    try:
        with open(VIDEO_HISTORY_JSONL, "r", encoding="utf-8", errors="ignore") as history_file:
            for raw_line in history_file:
                line = raw_line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except Exception:
        pass
    return entries


def _append_video_history_entry(entry: Dict[str, Any]):
    """Append a JSON line entry to the video history JSONL file."""
    _ensure_video_history_file()
    with open(VIDEO_HISTORY_JSONL, "a", encoding="utf-8", errors="ignore") as history_file:
        history_file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _collect_existing_transcript_signatures() -> Dict[str, Optional[str]]:
    """
    Gather known transcript signatures keyed by signature value -> video_id
    by reading history plus existing markdown files.
    """
    signatures: Dict[str, Optional[str]] = {}
    history_entries = _load_video_history_entries()
    for entry in history_entries:
        sig = entry.get("signature")
        vid = entry.get("video_id")
        if sig:
            signatures[sig] = vid

    if not os.path.exists(TRANSCRIPTS_DIR):
        return signatures

    for filename in os.listdir(TRANSCRIPTS_DIR):
        if not filename.endswith(".md") or filename == "video_history.jsonl":
            continue
        filepath = os.path.join(TRANSCRIPTS_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            continue

        signature_match = re.search(r"<!--\s*signature:\s*(?P<sig>.+?)\s*-->", content)
        if signature_match:
            sig_value = signature_match.group("sig").strip()
            video_id_match = re.search(r"\*\*Video ID:\*\* (.+)", content)
            if sig_value and sig_value not in signatures:
                signatures[sig_value] = video_id_match.group(1).strip() if video_id_match else None
            continue

        # Fallback for legacy files without embedded signature
        video_id_match = re.search(r"\*\*Video ID:\*\* (.+)", content)
        segments_match = re.search(r"\*\*Segments:\*\* (\d+)", content)
        lines = [line.strip() for line in content.split("\n") if line.strip().startswith("- [")]
        head_sample = "|".join(lines[:3])
        tail_sample = "|".join(lines[-3:])
        video_id = video_id_match.group(1).strip() if video_id_match else "unknown"
        segment_count = int(segments_match.group(1)) if segments_match else len(lines)
        raw = f"{video_id}|{segment_count}|{head_sample}|{tail_sample}"
        fallback_sig = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        signatures.setdefault(fallback_sig, video_id)

    return signatures


def _build_transcript_signature(video_id: Optional[str], segments: List[Dict[str, Any]]) -> Optional[str]:
    """Create a stable signature for a transcript payload."""
    if not segments:
        return None
    sample = segments[:3] + segments[-3:]
    sample_str = "|".join(
        f"{seg.get('timeText', '')}|{(seg.get('text') or '')[:120]}"
        for seg in sample
        if seg
    )
    raw = f"{video_id or 'unknown'}|{len(segments)}|{sample_str}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{video_id or 'unknown'}:{len(segments)}:{digest}"


async def save_transcripts(transcripts, page_state=None):
    """
    💾 Persist transcript payloads (e.g., YouTube text) to disk for LLM consumption.
    🎯 Uses stable signatures + history tracking to avoid duplicates
    """
    global CURRENT_TRANSCRIPTS_INFO

    if not transcripts:
        CURRENT_TRANSCRIPTS_INFO = []
        return []

    try:
        if not os.path.exists(TRANSCRIPTS_DIR):
            os.makedirs(TRANSCRIPTS_DIR)
            print(f"📁 Created transcript directory: {TRANSCRIPTS_DIR}")

        saved_refs = []
        default_title = (page_state or {}).get("title") or "Transcript"
        existing_signatures = set(_collect_existing_transcript_signatures().keys())

        def format_seconds(seconds):
            if seconds is None:
                return None
            seconds = int(seconds)
            mins, secs = divmod(seconds, 60)
            hours, mins = divmod(mins, 60)
            if hours:
                return f"{hours:02d}:{mins:02d}:{secs:02d}"
            return f"{mins:02d}:{secs:02d}"

        for transcript in transcripts:
            segments = transcript.get("segments") or []
            if not segments:
                continue

            video_id = transcript.get("videoId") or transcript.get("video_id") or "unknown"
            video_url = transcript.get("videoUrl") or transcript.get("video_url") or "unknown"
            signature = _build_transcript_signature(video_id, segments)
            if signature and signature in existing_signatures:
                print(f"⏭️ Skipping duplicate transcript for video ID: {video_id} (signature match)")
                continue

            raw_title = (
                transcript.get("title")
                or transcript.get("videoTitle")
                or transcript.get("videoName")
                or transcript.get("trackName")
                or transcript.get("heading")
                or video_url
                or video_id
                or default_title
            )
            title = raw_title.strip() if isinstance(raw_title, str) else default_title
            slug_source = title or video_id or "transcript"
            slug = slugify(slug_source)
            date_stamp = datetime.utcnow().strftime("%Y-%m-%d")  # Changed: Only date, no time
            filename = f"{date_stamp}__{slug}.md"
            rel_path = os.path.join("transcripts", filename)
            full_path = os.path.join(SITE_STRUCTURES_DIR, rel_path)

            with open(full_path, 'w', encoding='utf-8', errors='ignore') as f:
                if signature:
                    f.write(f"<!-- signature: {signature} -->\n")
                f.write(f"# {title}\n\n")
                f.write(f"**Video URL:** {video_url}\n")
                f.write(f"**Video ID:** {video_id}\n")
                f.write(f"**Language:** {transcript.get('language', 'unknown')}\n")
                collected_at = transcript.get("collectedAt") or datetime.utcnow().isoformat() + "Z"
                f.write(f"**Collected At:** {collected_at}\n")
                f.write(f"**Segments:** {len(segments)}\n\n---\n\n")

                for seg in segments:
                    timestamp_text = seg.get("timeText") or format_seconds(seg.get("offsetSeconds")) or "00:00"
                    text_line = seg.get("text", "").strip()
                    aria_label = seg.get("ariaLabel")
                    if aria_label and aria_label != text_line:
                        f.write(f"- [{timestamp_text}] {text_line} — _{aria_label}_\n")
                    else:
                        f.write(f"- [{timestamp_text}] {text_line}\n")

            ref = {
                "title": title,
                "video_id": video_id,
                "video_url": video_url,
                "language": transcript.get("language"),
                "segment_count": len(segments),
                "file": f"@site_structures/{rel_path.replace(os.sep, '/')}",
                "collected_at": collected_at,
                "signature": signature
            }
            saved_refs.append(ref)
            print(f"📝 Transcript saved: {ref['file']} ({len(segments)} segments)")

            history_entry = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "video_id": video_id,
                "video_url": video_url,
                "title": title,
                "segments": len(segments),
                "file": ref["file"],
                "signature": signature,
            }
            _append_video_history_entry(history_entry)
            if signature:
                existing_signatures.add(signature)

        if saved_refs:
            CURRENT_TRANSCRIPTS_INFO = saved_refs

        return saved_refs

    except Exception as e:
        print(f"⚠️ Error saving transcripts: {e}")
        import traceback
        traceback.print_exc()
        return []

async def process_actionable_elements_for_llm(actionable_elements: List[Dict[str, Any]]) -> Optional[Dict[str, Dict[str, Any]]]:
    """
    🎯 Process actionable elements for LLM consumption
    
    This function transforms actionable elements into LLM-friendly format
    with clear action mappings and execution instructions.
    
    🆕 NEW: Includes page context to ensure actions align with current page
    
    @param actionable_elements: List of actionable elements from extension
    """
    try:
        if not actionable_elements:
            print("⚠️ No actionable elements to process")
            # 🆕 NEW: Clear LLM actions when no elements are available
            await clear_llm_actions()
            return
        
        print(f"🎯 Processing {len(actionable_elements)} actionable elements for LLM")
        
        # 🆕 NEW: Get current page context
        current_page_url = "unknown"
        current_page_title = "unknown"
        if CURRENT_ACTIVE_TAB:
            current_page_url = CURRENT_ACTIVE_TAB.get("url", "unknown")
            current_page_title = CURRENT_ACTIVE_TAB.get("title", "unknown")
        
        # Create LLM-friendly action mapping with page context
        llm_actions = {
            # 🆕 NEW: Page context metadata
            "_page_context": {
                "url": current_page_url,
                "title": current_page_title,
                "timestamp": time.time(),
                "total_actions": len(actionable_elements),
                "active_tab_id": CURRENT_ACTIVE_TAB.get("id") if CURRENT_ACTIVE_TAB else None
            }
        }
        
        # Process actionable elements
        for element in actionable_elements:
            action_id = element.get("actionId")
            if action_id:
                llm_actions[action_id] = {
                    "action_type": element.get("actionType", "unknown"),
                    "description": element.get("textContent", "")[:100],
                    "tag_name": element.get("tagName", "unknown"),
                    "selectors": element.get("selectors", []),
                    "coordinates": element.get("coordinates", {}),
                    "llm_instruction": f"Use actionId '{action_id}' to {element.get('actionType', 'interact')} with this element",
                    # 🆕 NEW: Page context for each action
                    "page_url": current_page_url,
                    "page_title": current_page_title
                }
        
        # Save LLM action mapping
        if llm_actions:
            filepath = os.path.join(SITE_STRUCTURES_DIR, "llm_actions.json")
            with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
                json.dump(llm_actions, f, ensure_ascii=False, indent=2)
            
            print(f"🎯 LLM action mapping saved: {filepath}")
            print(f"📋 Available actions: {len(actionable_elements)}")
            print(f"🌐 Page context: {current_page_url}")
            print(f"📄 Page title: {current_page_title[:50]}...")
        
        return llm_actions
        
    except Exception as e:
        print(f"❌ Error processing actionable elements for LLM: {e}")
        return None

async def save_page_text_to_markdown(text_data):
    """
    📄 Save page text to markdown file
    
    This function saves extracted page text to a markdown file named
    after the website's hostname in the @site_structures folder.
    
    @param text_data: Text extraction data from extension
    @return: File path if successful, None if failed
    """
    try:
        # Ensure the site structures directory exists
        if not os.path.exists(SITE_STRUCTURES_DIR):
            os.makedirs(SITE_STRUCTURES_DIR)
            print(f"📁 Created directory: {SITE_STRUCTURES_DIR}")
        
        # Extract URL and generate filename
        url = text_data.get('frontmatter', {}).get('url', 'unknown')
        parsed_url = urlparse(url)
        hostname = parsed_url.hostname or 'unknown'
        filename = f"{hostname}_page_text.md"
        filepath = os.path.join(SITE_STRUCTURES_DIR, filename)
        
        # Get the markdown content
        markdown_content = text_data.get('markdown', '')
        
        # Write the markdown content to file
        with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
            f.write(markdown_content)
        
        # Get statistics
        statistics = text_data.get('statistics', {})
        total_headings = statistics.get('totalHeadings', 0)
        total_paragraphs = statistics.get('totalParagraphs', 0)
        total_lists = statistics.get('totalLists', 0)
        total_list_items = statistics.get('totalListItems', 0)
        
        print(f"📄 Page text saved to: {filepath}")
        print(f"📊 Content: {total_headings} headings, {total_paragraphs} paragraphs, {total_lists} lists ({total_list_items} items)")
        print(f"📏 File size: {len(markdown_content):,} bytes")
        
        return filepath
        
    except Exception as e:
        print(f"❌ Error saving page text to markdown: {e}")
        return None

async def clear_llm_actions() -> Optional[str]:
    """
    🗑️ Clear LLM actions when no actionable elements are available
    
    This function creates an empty llm_actions.json file with page context
    to indicate that no actions are available on the current page.
    """
    try:
        # Get current page context
        current_page_url = "unknown"
        current_page_title = "unknown"
        if CURRENT_ACTIVE_TAB:
            current_page_url = CURRENT_ACTIVE_TAB.get("url", "unknown")
            current_page_title = CURRENT_ACTIVE_TAB.get("title", "unknown")
        
        # Create empty actions file with page context
        empty_actions = {
            "_page_context": {
                "url": current_page_url,
                "title": current_page_title,
                "timestamp": time.time(),
                "total_actions": 0,
                "active_tab_id": CURRENT_ACTIVE_TAB.get("id") if CURRENT_ACTIVE_TAB else None,
                "status": "no_actionable_elements"
            }
        }
        
        # Save empty actions file
        filepath = os.path.join(SITE_STRUCTURES_DIR, "llm_actions.json")
        with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
            json.dump(empty_actions, f, ensure_ascii=False, indent=2)
        
        print(f"🗑️ LLM actions cleared for page: {current_page_url}")
        print(f"📄 Page title: {current_page_title[:50]}...")
        
        return filepath
        
    except Exception as e:
        print(f"❌ Error clearing LLM actions: {e}")
        return None

async def store_dom_change_context(dom_change_data):
    """
    🔄 Store DOM change context for LLM consumption
    
    This function maintains a history of DOM changes to provide
    context for LLM understanding of page evolution.
    
    @param dom_change_data: DOM change notification data
    """
    try:
        # Create change context entry
        change_context = {
            "timestamp": time.time(),
            "tab_id": dom_change_data.get("tabId"),
            "total_mutations": dom_change_data.get("totalMutations", 0),
            "change_types": dom_change_data.get("changeTypes", []),
            "url": dom_change_data.get("url", "unknown"),
            "change_summary": f"Tab {dom_change_data.get('tabId')}: {dom_change_data.get('totalMutations', 0)} mutations"
        }
        
        # 🚫 DISABLED: DOM change history file writing (too noisy)
        # filepath = os.path.join(SITE_STRUCTURES_DIR, "dom_change_history.jsonl")
        # with open(filepath, 'a', encoding='utf-8') as f:
        #     f.write(json.dumps(change_context, ensure_ascii=False) + '\n')
        
        # 🚫 REDUCED LOGGING: Only log significant changes
        if dom_change_data.get("totalMutations", 0) > 5:
            print(f"🔄 DOM change context stored: {change_context['change_summary']}")
        
        return None
    except Exception as e:
        print(f"❌ Error storing DOM change context: {e}")
        return None

# ------------------ LLM PROMPT GENERATOR (compact) ------------------

def _format_table_row_label(record: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Derive a human-friendly label for table/list rows (e.g., Gmail emails)."""
    text = (record.get("textContent") or "").replace('\xa0', ' ').strip()
    cleaned = re.sub(r"\s+", " ", text)

    parts = [p.strip() for p in cleaned.split(',') if p.strip()]
    skip_tokens = {"unread", "read", "starred", "not starred"}

    sender: Optional[str] = None
    subject: Optional[str] = None
    time_part: Optional[str] = None
    preview: Optional[str] = None

    for part in parts:
        lower = part.lower()
        if "has attachment" in lower:
            continue
        if sender is None and lower not in skip_tokens and not re.search(r"\d{1,2}:\d{2}", part):
            sender = part
            continue
        if subject is None and not re.search(r"\d{1,2}:\d{2}", part):
            subject = part
            continue
        if time_part is None and re.search(r"\d{1,2}:\d{2}", part):
            time_part = part
            continue
        if preview is None and lower not in skip_tokens:
            preview = part

    if sender is None and parts:
        sender = parts[0]
    if subject is None and len(parts) > 1:
        subject = parts[1]

    display = ""
    if sender and subject:
        display = f"{sender} — {subject}"
    elif sender:
        display = sender
    elif subject:
        display = subject
    else:
        display = cleaned[:120]

    if time_part:
        display = f"{display} ({time_part})"
    if preview:
        display = f"{display} — {preview[:80]}"

    return {
        "display": display.strip()[:200],
        "sender": sender,
        "subject": subject,
        "time": time_part,
        "preview": preview,
        "raw": cleaned
    }

def _map_prompt_action_sentence(record: Dict[str, Any]) -> Optional[str]:
    try:
        if record.get("type") != "action":
            return None
        
        # 🎯 ALLOW IMPORTANT HIDDEN ELEMENTS: Navigation links, video links, interactive table rows, and form inputs
        visibility = record.get("visibility")
        if visibility == "hidden":
            # Check if this is an important element that should be included despite being hidden
            tag = (record.get("tag") or "").lower()
            action_types = record.get("actionTypes") or []
            href = record.get("href") or ""
            label = (record.get("label") or record.get("ariaLabel") or "").strip()
            attributes = record.get("attributes", {})
            css_classes = attributes.get("cssClasses", [])
            role = attributes.get("role", "").lower()
            control_type = record.get("controlType") or ""

            # 🎯 GENERIC: Allow interactive table/list rows (works for any site with table-based UIs)
            # These are often marked hidden but are critical for interaction
            # Pattern: table rows, list items, or divs with row/listitem/option roles that have click actions
            is_interactive_row = (tag == "tr" and role == "row") or \
                                (tag in ("tr", "li", "div", "article", "section") and
                                 role in ("row", "listitem", "option", "article") and
                                 any(t in ("click", "button", "navigate", "link") for t in action_types))

            # 🎯 NEW: Allow hidden input/textarea elements (ChatGPT, Perplexity, Claude, etc.)
            # These are often visually hidden but critical for text input via automation
            is_input_element = (tag in ("input", "textarea") or
                               control_type == "input" or
                               any(t in ("input", "setValue", "focus", "textarea") for t in action_types))

            # Allow navigation links with meaningful labels
            is_navigation_link = tag == "a" or any(t in ("navigate", "link") for t in action_types)
            is_video_link = "/watch?v=" in href or "yt-lockup-metadata-view-model__title" in str(css_classes)
            has_meaningful_label = bool(label and len(label) > 3)
            has_href = bool(href and len(href) > 0)

            # 🎯 NEW: Allow accessibility links (skip to content, etc.) with meaningful labels
            is_accessibility_link = is_navigation_link and has_meaningful_label and has_href

            # Allow hidden elements if they meet any of these criteria:
            # - Interactive table/list rows (generic pattern)
            # - OR input/textarea elements (NEW: ChatGPT, Perplexity, Claude hidden inputs)
            # - OR accessibility navigation links with meaningful labels (NEW: skip links, etc.)
            # - OR video links (YouTube specific)
            if not (is_interactive_row or is_input_element or is_accessibility_link or (is_navigation_link and is_video_link)):
                return None
        
        action_id = record.get("id")
        if not action_id:
            return None
        label = (record.get("label") or record.get("ariaLabel") or "").strip()
        tag = (record.get("tag") or "").lower()
        action_types = record.get("actionTypes") or []
        control_type = record.get("controlType") or ""
        attributes = record.get("attributes", {})
        role = attributes.get("role", "").lower()
        
        # 🎯 GENERIC: Handle table rows and list items (works for any site with table/list-based UIs)
        # Extract meaningful label from aria-labelledby or text content if label is empty
        if tag == "tr" and role == "row":
            row_info = _format_table_row_label(record)
            display_label = row_info.get("display") or label or record.get("description") or "Table row"
            display_label = display_label.replace("'", "\u2019").strip()
            if row_info.get("sender"):
                display_label = f"Email: {display_label}" if not display_label.lower().startswith("email") else display_label
            label = display_label
            return f"return ({action_id}) to click '{label[:200]}'"

        if not label and (tag in ("tr", "li") and role in ("row", "listitem")):
            label = "Row"
        
        if tag in {"input", "textarea"} or control_type == "input" or any(t in ("input", "setValue") for t in action_types):
            return f"return ({action_id},{{yourValue}}) to set value for '{label}'. Add submit:true to submit."
        if tag == "a" or any(t in ("navigate", "link") for t in action_types):
            return f"return ({action_id}) to navigate to '{label}'"
        if tag == "button" or "click" in action_types:
            return f"return ({action_id}) to click '{label}'"
        # 🎯 GENERIC: Table rows and list items are typically clickable (works for any site)
        # Pattern: tr with role="row", or tr/li with click/button actions
        if (tag in ("tr", "li", "article", "section") and role in ("row", "listitem", "article") and 
            any(t in ("click", "button", "navigate") for t in action_types)):
            return f"return ({action_id}) to click '{label}'"
        return f"return ({action_id}) to interact with '{label}'"
    except Exception:
        return None

def generate_llm_prompt(text_md_path: str, page_jsonl_path: str, out_path: str, max_actions: int = MAX_ACTIONS) -> Optional[str]:
    try:
        title: Optional[str] = None
        page_url: Optional[str] = None
        page_version: Optional[int] = None
        # 🚫 REMOVED: transcript variable (no longer needed since we removed the duplicate section)
        # transcript = ""
        transcript_refs: List[Dict[str, Any]] = []
        if os.path.exists(text_md_path):
            with open(text_md_path, 'r', encoding='utf-8', errors='ignore') as f:
                raw = f.read()
            lines = raw.splitlines()
            if lines and lines[0].startswith('#'):
                title = lines[0].lstrip('#').strip() or None
            # 🚫 REMOVED: transcript extraction (no longer needed)
            # filtered = [ln for ln in lines if not ln.strip().startswith('URL:') and not ln.strip().startswith('**URL:**')]
            # transcript = "\n".join(filtered)[:1500]

        action_lines: List[str] = []
        action_records_with_index: List[Dict[str, Any]] = []
        line_index = 0
        
        if os.path.exists(page_jsonl_path):
            with open(page_jsonl_path, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except Exception:
                        continue
                    if rec.get('type') == 'meta':
                        if not title:
                            title = rec.get('title') or title
                        if not page_url:
                            page_url = (
                                rec.get('current_page', {}).get('url')
                                or rec.get('url')
                                or rec.get('browser_state', {}).get('active_tab', {}).get('url')
                                or page_url
                            )
                        if page_version is None and rec.get("pageVersion") is not None:
                            page_version = rec.get("pageVersion")
                        if not transcript_refs and rec.get("transcripts"):
                            transcript_refs = rec.get("transcripts", [])
                    mapped = _map_prompt_action_sentence(rec)
                    if mapped:
                        action_lines.append(mapped)
                        # Extract metadata for menu detection and ordering
                        action_id_match = re.search(r'\(([^)]+)\)', mapped)
                        label_match = re.search(r"to (?:click|navigate|interact|set value for) '([^']+)'", mapped)
                        action_id = action_id_match.group(1) if action_id_match else None
                        label = label_match.group(1) if label_match else ""
                        
                        action_records_with_index.append({
                            'line': mapped,
                            'index': line_index,
                            'action_id': action_id,
                            'label': label,
                            'record': rec
                        })
                        line_index += 1

        # 🎯 DEDUPLICATE: Remove duplicates while preserving order
        seen: set[str] = set()
        deduped_records: List[Dict[str, Any]] = []
        
        for rec in action_records_with_index:
            if rec['line'] in seen:
                continue
            seen.add(rec['line'])
            deduped_records.append(rec)
        
        # 🎯 SPA FILTERING: Prune stale elements BEFORE categorization
        # This ensures pruned elements don't count against MAX_ACTIONS limit
        if page_version is not None:
            filtered_records: List[Dict[str, Any]] = []
            for rec in deduped_records:
                action_id = rec.get('action_id')
                if not action_id:
                    filtered_records.append(rec)
                    continue
                
                # Parse action ID: a_id_{version}_{counter}
                parts = action_id.split('_')
                if len(parts) >= 3 and parts[0] == 'a' and parts[1] == 'id':
                    try:
                        action_ver = int(parts[2])
                        if action_ver < page_version:
                            # This is an old element. Check if it's persistent.
                            record = rec.get('record', {})
                            tag = (record.get('tag') or '').lower()
                            attributes = record.get('attributes', {})

                            # Get site config (only if we have a URL)
                            persistent_selectors = []
                            if page_url:
                                site_config = get_site_config(page_url)
                                persistent_selectors = site_config.get('selectors', {}).get('persistent_selectors', [])
                            
                            is_persistent = False
                            for selector in persistent_selectors:
                                # Simple selector matching
                                # 1. Tag match
                                if selector == tag:
                                    is_persistent = True
                                    break
                                # 2. ID match
                                if selector.startswith('#'):
                                    elem_id = attributes.get('id')
                                    if elem_id and selector[1:] == elem_id:
                                        is_persistent = True
                                        break
                                # 3. Class match (simple .class)
                                if selector.startswith('.'):
                                    classes = attributes.get('cssClasses', [])
                                    if selector[1:] in classes:
                                        is_persistent = True
                                        break
                            
                            if not is_persistent:
                                # Stale element - SKIP
                                print(f"🗑️ Pruning stale element: {action_id} (v{action_ver} < v{page_version})")
                                continue
                            else:
                                print(f"🛡️ Keeping persistent element: {action_id} (v{action_ver})")
                    except ValueError:
                        pass # ID format mismatch, ignore
                
                filtered_records.append(rec)
            
            deduped_records = filtered_records
            print(f"✅ SPA Filtering: {len(filtered_records)} elements after pruning")
        
        # 🎯 DOMAIN-SPECIFIC CATEGORIZATION: Apply smart categorization based on domain
        def _extract_domain(url: str) -> str:
            """Extract domain from URL"""
            if not url:
                return ""
            try:
                parsed = urlparse(url)
                return parsed.netloc.lower()
            except Exception:
                return ""

        def _smart_categorize_actions(records: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
            """
            Generic smart categorization based on hrefs and labels.
            Works for ANY site - detects patterns, not hardcoded domains.
            """
            categories = {
                'search_inputs': [],
                'transcript_actions': [],  # CRITICAL: Transcript-related actions (show, segments, etc.)
                'video_links': [],         # Links with /watch?v= (YouTube videos, etc.)
                'channel_links': [],       # Links with /@ or /channel/ (user profiles)
                'footer_links': [],        # Footer/legal links (About, Terms, etc.)
                'regular_actions': [],
                'email_actions': []
            }

            for rec in records:
                record = rec.get('record', {})
                label = (rec.get('label') or '').lower()
                href = record.get('href', '')
                tag = (record.get('tag') or '').lower()
                action_types = record.get('actionTypes', [])
                attributes = record.get('attributes', {})
                role = (attributes.get('role') or '').lower()

                # 🎯 CRITICAL PRIORITY: Transcript actions (MUST be captured!)
                # Detect: "Show transcript", "Hide transcript", transcript segments, etc.
                is_transcript = ('transcript' in label or 
                               'transcript' in (attributes.get('aria-label') or '').lower())
                
                if is_transcript:
                    categories['transcript_actions'].append(rec)
                    continue

                # Email/message rows (works for Gmail, etc.)
                if tag == 'tr' and role == 'row':
                    categories['email_actions'].append(rec)
                    continue

                # Search inputs (generic - works everywhere)
                placeholder = (record.get('placeholder') or '').lower()
                aria_label = (record.get('ariaLabel') or '').lower()
                is_search = ('search' in label or 'search' in placeholder or 'search' in aria_label)
                if is_search and ('setValue' in action_types or 'input' in action_types):
                    categories['search_inputs'].append(rec)
                    continue

                # Video links - detect by href pattern (works for YouTube, Vimeo, etc.)
                if '/watch?v=' in href or '/watch/' in href or '/video/' in href:
                    categories['video_links'].append(rec)
                    continue

                # Channel/profile links - detect by href pattern
                if '/@' in href or '/channel/' in href or '/user/' in href:
                    categories['channel_links'].append(rec)
                    continue

                # Footer links - generic keywords that work across sites
                # Check if label matches common footer patterns (exact match or contains)
                footer_keywords = ['about', 'press', 'copyright', 'terms', 'privacy', 'policy',
                                 'contact', 'advertise', 'developers', 'help', 'legal', 'creators',
                                 'safety', 'test new', 'how', 'works']
                is_footer = any(keyword == label or keyword in label for keyword in footer_keywords)
                if is_footer:
                    categories['footer_links'].append(rec)
                    continue

                # Everything else
                categories['regular_actions'].append(rec)

            return categories

        # 🎯 SMART CATEGORIZATION: Pattern-based, works for all sites
        smart_categories = _smart_categorize_actions(deduped_records)

        # Extract categories
        transcript_actions = smart_categories.get('transcript_actions', [])
        search_inputs = smart_categories.get('search_inputs', [])
        email_actions = smart_categories.get('email_actions', [])
        video_links = smart_categories.get('video_links', [])
        channel_links = smart_categories.get('channel_links', [])
        footer_links = smart_categories.get('footer_links', [])
        regular_actions = smart_categories.get('regular_actions', [])

        # Sort all by DOM index
        transcript_actions.sort(key=lambda r: r['index'])
        search_inputs.sort(key=lambda r: r['index'])
        email_actions.sort(key=lambda r: r['index'])
        video_links.sort(key=lambda r: r['index'])
        channel_links.sort(key=lambda r: r['index'])
        footer_links.sort(key=lambda r: r['index'])
        regular_actions.sort(key=lambda r: r['index'])

        # Limit footer links
        footer_links = footer_links[:MAX_FOOTER_LINKS]

        # Also run generic menu detection for backwards compatibility
        menu_groups: Dict[str, List[Dict[str, Any]]] = {}

        if False:  # Disabled - keeping for reference but using smart categorization instead
            # Fall back to generic categorization
            deduped_records = deduped_records[:max_actions]

            # 🎯 MENU DETECTION: Identify menu items based on common patterns
            def _is_menu_item(label: str, action_id: str):
                """Detect if an action is a menu item and return menu group name"""
                if not label:
                    return False, None

                label_lower = label.lower()

                # Footer/Site menu items
                footer_keywords = ['about', 'terms', 'privacy', 'policy', 'safety', 'copyright',
                                 'contact', 'creators', 'advertise', 'developers', 'press',
                                 'how youtube works', 'test new features', 'help', 'send feedback',
                                 'report history', 'settings']
                if any(keyword in label_lower for keyword in footer_keywords):
                    return True, "Footer Menu"

                # Navigation menu items
                nav_keywords = ['home', 'shorts', 'subscriptions', 'you', 'history', 'playlists',
                              'watch later', 'liked videos', 'downloads', 'explore', 'music',
                              'movies', 'gaming', 'news', 'sports', 'learning', 'fashion', 'beauty',
                              'podcasts', 'playables', 'studio', 'kids']
                if any(keyword in label_lower for keyword in nav_keywords):
                    return True, "Navigation Menu"

                # Account menu items
                account_keywords = ['account', 'profile', 'sign in', 'sign out', 'settings', 'preferences']
                if any(keyword in label_lower for keyword in account_keywords):
                    return True, "Account Menu"

                return False, None

            # 🎯 GROUP ACTIONS: Separate menu items from regular actions, preserving DOM order
            menu_groups: Dict[str, List[Dict[str, Any]]] = {}
            regular_actions: List[Dict[str, Any]] = []
            search_inputs: List[Dict[str, Any]] = []  # 🎯 NEW: Prioritize search inputs
            email_actions: List[Dict[str, Any]] = []  # 🎯 NEW: Group email/message rows

            for rec in deduped_records:
                record = rec.get('record', {})
                tag = (record.get('tag') or '').lower()
                attributes = record.get('attributes', {})
                role = (attributes.get('role') or '').lower()

                # 🎯 PRIORITIZE: Capture email/message rows before other grouping
                if tag == 'tr' and role == 'row':
                    email_actions.append(rec)
                    continue

                is_menu, menu_group = _is_menu_item(rec['label'], rec['action_id'])

                # 🎯 PRIORITIZE: Extract search inputs (especially Wikipedia search)
                label_lower = (rec.get('label') or '').lower()
                action_types = record.get('actionTypes', [])
                placeholder = (record.get('placeholder') or '').lower()
                aria_label = (record.get('ariaLabel') or '').lower()
                element_id = record.get('id', '')
                element_name = record.get('name', '')

                # Check if it's a search input by various indicators
                is_search_input = (
                    'search' in label_lower or
                    'search' in placeholder or
                    'search' in aria_label or
                    element_id == 'searchInput' or
                    element_name == 'search' or
                    (tag == 'input' and ('setValue' in action_types or 'input' in action_types) and ('search' in label_lower or 'search' in placeholder or 'search' in aria_label))
                )

                if is_search_input:
                    search_inputs.append(rec)
                elif is_menu and menu_group:
                    if menu_group not in menu_groups:
                        menu_groups[menu_group] = []
                    menu_groups[menu_group].append(rec)
                else:
                    regular_actions.append(rec)

            # Sort menu groups by their first item's DOM index to preserve order
            for menu_group_name in menu_groups:
                menu_groups[menu_group_name].sort(key=lambda r: r['index'])

            # Sort search inputs by DOM index (they'll appear first)
            search_inputs.sort(key=lambda r: r['index'])

            # Sort regular actions by DOM index
            regular_actions.sort(key=lambda r: r['index'])
            email_actions.sort(key=lambda r: r['index'])

        parts: List[str] = []
        parts.append(f"# ({page_version}) {title or 'Page'}")
        parts.append("")
        parts.append(f"**URL:** {page_url or 'unknown'}")
        parts.append("")

        # 🚫 REMOVED: Transcript section (duplicate of text.md)
        # Text content is available in text.md file - no need to duplicate here
        # This keeps llm_prompt.md focused on actions only

        # 🎯 ACTIONS SECTION: Smart categorization based on patterns
        if deduped_records:
            parts.append("## Actions")

            # Search inputs (always first priority)
            if search_inputs:
                parts.append("### Search")
                parts.extend([f"- {item['line']}" for item in search_inputs])
                parts.append("")

            # 🎯 PREMIUM: Capabilities (resolved dynamically from URL + site_configs.json)
            # (llm_prompt.md is legacy; keep URL-based resolution here)
            capabilities = resolve_capabilities_for_url(page_url) if page_url else []
            if capabilities:
                parts.append("### Capabilities")
                for capability in capabilities:
                    action = capability.get('action', 'Unknown')
                    label = capability.get('label', 'No description')
                    parts.append(f"- return ({action}) to {label.lower()}")
                parts.append("")
                print(f"🎯 Added {len(capabilities)} capabilities to llm_prompt.md")

            # 🎯 CRITICAL: Transcript actions (show transcript, segments, etc.)
            if transcript_actions:
                parts.append("### Transcript")
                parts.extend([f"- {item['line']}" for item in transcript_actions])
                parts.append("")

            # Email rows (Gmail, etc.)
            if email_actions:
                parts.append("### Emails")
                parts.extend([f"- {item['line']}" for item in email_actions])
                parts.append("")

            # Videos (YouTube, Vimeo, etc. - detected by /watch?v= pattern)
            if video_links:
                parts.append("### Videos")
                parts.extend([f"- {item['line']}" for item in video_links])
                parts.append("")

            # Channels/Profiles (detected by /@ or /channel/ pattern)
            if channel_links:
                parts.append("### Channels")
                parts.extend([f"- {item['line']}" for item in channel_links])
                parts.append("")

            # Menu groups (backwards compatibility with existing logic)
            for menu_group_name in sorted(menu_groups.keys()):
                menu_items = menu_groups[menu_group_name]
                if menu_items:
                    parts.append(f"### {menu_group_name}")
                    parts.extend([f"- {item['line']}" for item in menu_items])
                    parts.append("")

            # Regular actions
            if regular_actions:
                if search_inputs or email_actions or video_links or channel_links or menu_groups:
                    parts.append("### Other Actions")
                parts.extend([f"- {item['line']}" for item in regular_actions])
                parts.append("")

            # Footer (last, limited to MAX_FOOTER_LINKS)
            if footer_links:
                parts.append("### Footer")
                parts.extend([f"- {item['line']}" for item in footer_links])
                parts.append("")

        if transcript_refs:
            parts.append("## Transcript Files")
            for ref in transcript_refs:
                label = ref.get("title") or ref.get("file") or "Transcript"
                file_path = ref.get("file")
                segment_count = ref.get("segment_count")
                extra = f" ({segment_count} segments)" if segment_count else ""
                parts.append(f"- {label}{extra}: {file_path}")
            parts.append("")

        with open(out_path, 'w', encoding='utf-8', errors='ignore') as f:
            f.write("\n".join(parts).rstrip() + "\n")
        return out_path
    except Exception as e:
        print(f"⚠️ Error generating llm_prompt.md: {e}")
        return None


def update_tabs_in_text_md():
    """
    🗂️ Update ONLY the tabs section in text.md using STABLE tab numbers.
    Called when tabs change (SwitchTab, CloseTab, OpenTab, tabs_info).
    Tab numbers persist across open/close - Tab 3 stays Tab 3 even if Tab 2 closes.
    """
    import time as _time
    import re

    text_file_path = os.path.join("@site_structures", "text.md")

    _start = _time.time()
    print(f"🔍 [TAB-UPDATE] Entry: {len(CURRENT_TABS_INFO) if CURRENT_TABS_INFO else 0} tabs, file_exists={os.path.exists(text_file_path)}")

    if not os.path.exists(text_file_path) or not CURRENT_TABS_INFO:
        print(f"🔍 [TAB-UPDATE] Early exit: file_exists={os.path.exists(text_file_path)}, tabs={bool(CURRENT_TABS_INFO)}")
        return False

    try:
        # 🔢 SYNC REGISTRY: Register new tabs, unregister closed tabs
        sync_stats = sync_tab_registry(CURRENT_TABS_INFO)
        if sync_stats["registered"] > 0 or sync_stats["unregistered"] > 0:
            print(f"🔢 [REGISTRY] Synced: +{sync_stats['registered']} new, -{sync_stats['unregistered']} closed")

        # Read existing file
        with open(text_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # 🔢 Build tabs section using STABLE numbers from registry
        tabs_with_numbers = []
        for tab in CURRENT_TABS_INFO:
            tab_id = tab.get('id')
            stable_num = get_stable_tab_number(tab_id)
            if stable_num:
                tabs_with_numbers.append((stable_num, tab))

        # Sort by stable number for display
        tabs_with_numbers.sort(key=lambda x: x[0])

        tabs_lines = ["**Tabs:**\n"]
        for stable_num, tab in tabs_with_numbers[:8]:
            tab_title = tab.get('title', 'Unknown')[:40]
            tab_url = tab.get('url', '')
            is_active = tab.get('active', False)
            try:
                tab_domain = urlparse(tab_url).hostname or 'unknown'
            except Exception:
                tab_domain = 'unknown'
            active_marker = " -- ACTIVE TAB" if is_active else ""
            tabs_lines.append(f"- Tab {stable_num}: \"{tab_title}\" ({tab_domain}){active_marker}\n")

        if len(tabs_with_numbers) > 8:
            tabs_lines.append(f"- (+{len(tabs_with_numbers) - 8} more tabs)\n")
        new_tabs_section = "".join(tabs_lines)

        # Find and replace tabs section
        tabs_pattern = r'\*\*Tabs:\*\*\n(?:- Tab[^\n]*\n|[^\n]*more tabs[^\n]*\n)*'

        regex_matched = bool(re.search(tabs_pattern, content))
        print(f"🔍 [TAB-UPDATE] Regex match: {regex_matched}")

        if regex_matched:
            content = re.sub(tabs_pattern, new_tabs_section, content)
        else:
            # No tabs section found, insert after timestamp line
            timestamp_pattern = r'(\*\*Timestamp:\*\*[^\n]*\n)\n'
            content = re.sub(timestamp_pattern, f'\\1\n{new_tabs_section}\n', content)

        # Write back
        with open(text_file_path, 'w', encoding='utf-8', errors='ignore') as f:
            f.write(content)

        _elapsed = (_time.time() - _start) * 1000
        print(f"🗂️ Tabs updated in text.md ({len(tabs_with_numbers)} tabs) in {_elapsed:.1f}ms")

        # 🔍 DEBUG: Show tab summary with stable numbers
        for stable_num, tab in tabs_with_numbers[:4]:
            print(f"   Tab {stable_num}: {tab.get('title', 'Unknown')[:30]}... (id:{tab.get('id')})")

        return True
    except Exception as e:
        print(f"⚠️ Failed to update tabs in text.md: {e}")
        import traceback
        traceback.print_exc()
        return False


def write_text_md():
    """
    🔄 Write/regenerate text.md AND text.json using stored page data + current tabs.
    Called on intelligence_update ONLY (not on tab changes).

    🧪 EXPERIMENT: Numeric ID system
    - text.json keyed by "0", "1", "2"... for simple LLM output
    - text.md shows [0] Type: Label format
    - LLM outputs {"act": 0} or {"act": "0", "value": "..."}
    """
    global LAST_TEXT_MD_DATA, CURRENT_TEXT_JSON

    if not LAST_TEXT_MD_DATA:
        return False

    try:
        data = LAST_TEXT_MD_DATA
        text_file_path = os.path.join("@site_structures", "text.md")
        text_json_path = os.path.join("@site_structures", "text.json")
        timestamp = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

        # 🧪 NUMERIC ID SYSTEM: Build text.json with "0", "1", "2"... keys
        text_json = {
            "metadata": {
                "url": data.get('url', ''),
                "title": data.get('title', ''),
                "timestamp": timestamp,
                "element_count": len(ELEMENT_REGISTRY)
            },
            "elements": {}
        }

        # Map a_id_* to numeric index (0, 1, 2...)
        action_id_to_index: dict[str, int] = {}
        index = 0

        # Populate elements keyed by numeric index
        for action_id, el_data in ELEMENT_REGISTRY.items():
            action_id_to_index[action_id] = index
            text_json["elements"][str(index)] = {
                "label": el_data.get("label", ""),
                "type": el_data.get("type", ""),
                "tag": el_data.get("tag", ""),
                "selectors": el_data.get("selectors", []),
                "href": el_data.get("href")
            }
            index += 1

        # Write text.json
        with open(text_json_path, 'w', encoding='utf-8') as f:
            json.dump(text_json, f, indent=2, ensure_ascii=False)

        # Store in memory for fast lookup during action execution
        CURRENT_TEXT_JSON = text_json

        def _rewrite_page_text_to_numeric_ids(page_text: str) -> str:
            """
            🧪 Convert page_text to show exact JSON format for each element type:
              Link/Button: [0] Link: Gmail → {"act": 0}
              Input/Select: [3] Input: Search → {"act": 3, "value": "...", "submit": true}
            """
            try:
                lines = page_text.split('\n')
                result_lines = []

                for line in lines:
                    # Match lines with → {"act": "a_id_XXX"...}
                    match = re.search(r'^(.+?)\s*→\s*\{"act":\s*"(a_id_\d+)"', line)
                    if match:
                        label_part = match.group(1).strip()
                        action_id = match.group(2)
                        idx = action_id_to_index.get(action_id)
                        if idx is not None:
                            # Determine element type from label prefix
                            el_type = label_part.split(':')[0].strip() if ':' in label_part else ''

                            # Show exact JSON format based on element type
                            if el_type in ('Input', 'Select'):
                                # Input/Select needs value parameter
                                result_lines.append(f'[{idx}] {label_part} → {{"act": {idx}, "value": "...", "submit": true}}')
                            else:
                                # Link/Button just needs the ID
                                result_lines.append(f'[{idx}] {label_part} → {{"act": {idx}}}')
                        else:
                            # Keep original if no mapping
                            result_lines.append(line)
                    else:
                        # Non-action lines pass through unchanged
                        result_lines.append(line)

                return '\n'.join(result_lines)
            except Exception:
                return page_text

        # Write text.md (existing logic)
        with open(text_file_path, 'w', encoding='utf-8', errors='ignore') as f:
            # Frontmatter
            f.write(f"# {data['title']}\n\n")
            f.write(f"**URL:** {data['url']}\n")
            f.write(f"**Timestamp:** {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}\n\n")

            # 🗂️ TABS: Stable numbering via registry (numbers persist across tab open/close)
            if CURRENT_TABS_INFO:
                # Sync registry with current tabs (registers new, unregisters closed)
                sync_tab_registry(CURRENT_TABS_INFO)

                # Build tab list with stable numbers
                tabs_with_numbers = []
                for tab in CURRENT_TABS_INFO:
                    tab_id = tab.get('id')
                    stable_num = get_stable_tab_number(tab_id)
                    if stable_num is not None:
                        tabs_with_numbers.append((stable_num, tab))

                # Sort by stable number for consistent display order
                tabs_with_numbers.sort(key=lambda x: x[0])

                f.write("**Tabs:**\n")
                displayed = 0
                for stable_num, tab in tabs_with_numbers:
                    if displayed >= 8:
                        break
                    tab_title = tab.get('title', 'Unknown')[:40]
                    tab_url = tab.get('url', '')
                    is_active = tab.get('active', False)
                    try:
                        tab_domain = urlparse(tab_url).hostname or 'unknown'
                    except Exception:
                        tab_domain = 'unknown'
                    active_marker = " -- ACTIVE TAB" if is_active else ""
                    f.write(f"- Tab {stable_num}: \"{tab_title}\" ({tab_domain}){active_marker}\n")
                    displayed += 1

                if len(tabs_with_numbers) > 8:
                    f.write(f"- (+{len(tabs_with_numbers) - 8} more tabs)\n")
                f.write("\n")

            # Capabilities
            if data.get('capabilities'):
                f.write("## Capabilities\n\n")
                for cap in data['capabilities']:
                    cap_name = cap['action']
                    params = cap.get('params', {})
                    if params:
                        def _param_placeholder(v):
                            # If config provides type hints (string/boolean/number), render a concrete example
                            if isinstance(v, str):
                                t = v.strip().lower()
                                if t == "string":
                                    return '"..."'
                                if t == "boolean":
                                    return "true"
                                if t == "number":
                                    return "1"
                            return "..."

                        param_example = ", ".join([f'"{k}": {_param_placeholder(v)}' for k, v in params.items()])
                        f.write(f"- **{cap_name}** - {cap['label']} → `{{\"cap\": \"{cap_name}\", \"params\": {{{param_example}}}}}`\n")
                    else:
                        f.write(f"- **{cap_name}** - {cap['label']} → `{{\"cap\": \"{cap_name}\"}}`\n")
                f.write("\n---\n\n")

            f.write("---\n\n")
            f.write(_rewrite_page_text_to_numeric_ids(data.get('page_text', '')))

            # Iframe elements - 🧪 use numeric IDs continuing from main frame
            if data.get('iframe_elements'):
                f.write("\n\n---\n\n## Secure Iframe Elements\n\n")
                f.write("*These elements are inside secure cross-origin iframes:*\n\n")
                iframe_index = index  # Continue from where main frame left off
                for el in data['iframe_elements']:
                    tag = el.get('tag', 'input')
                    text = el.get('text') or el.get('label') or el.get('placeholder') or 'Unnamed'
                    el_type = 'Button' if tag == 'button' else ('Select' if tag == 'select' else 'Input')

                    # Add to text.json
                    text_json["elements"][str(iframe_index)] = {
                        "label": text,
                        "type": el_type,
                        "tag": tag,
                        "selectors": el.get('selectors', []),
                        "iframe": True
                    }

                    # Write to text.md with numeric ID and exact JSON format
                    if el_type in ('Input', 'Select'):
                        f.write(f'[{iframe_index}] {el_type}: {text} [iframe] → {{"act": {iframe_index}, "value": "...", "submit": true}}\n')
                    else:
                        f.write(f'[{iframe_index}] {el_type}: {text} [iframe] → {{"act": {iframe_index}}}\n')
                    iframe_index += 1

                # Re-write text.json with iframe elements included
                with open(text_json_path, 'w', encoding='utf-8') as jf:
                    json.dump(text_json, jf, indent=2, ensure_ascii=False)
                CURRENT_TEXT_JSON = text_json

            elif data.get('pending_iframes', 0) > 0:
                f.write("\n\n---\n\n## Secure Iframe Elements\n\n")
                f.write(f"*⏳ Loading {data['pending_iframes']} iframe(s)...*\n")

        print(f"🔄 text.md + text.json regenerated ({len(text_json['elements'])} elements)")
        return True
    except Exception as e:
        print(f"⚠️ Error writing text.md/text.json: {e}")
        import traceback
        traceback.print_exc()
        return False


def resolve_action_hints(action_id):
    """
    🧪 NUMERIC ID SYSTEM: Look up resolution hints from text.json (in memory).

    text.json is now keyed by numeric strings ("0", "1", "2"...).
    Accepts: int (7), str ("7"), or legacy formats.

    @param action_id: numeric ID (int or str) or legacy a_id_*/Type:Label
    @returns: {label, type, tag, selectors, href} or None
    """
    global CURRENT_TEXT_JSON

    # Normalize to string for lookup (text.json uses string keys)
    lookup_key = str(action_id) if action_id is not None else None

    # Try in-memory first
    if CURRENT_TEXT_JSON and CURRENT_TEXT_JSON.get("elements"):
        # 1) Direct numeric lookup (primary path)
        if lookup_key:
            hints = CURRENT_TEXT_JSON["elements"].get(lookup_key)
            if hints:
                print(f"   ✅ Resolved numeric ID {lookup_key}: {hints.get('label')} ({hints.get('type')})")
                return hints

        # 2) Legacy lookup: a_id_* (fallback, shouldn't happen with new system)
        if isinstance(action_id, str) and action_id.startswith("a_id_"):
            try:
                el = ELEMENT_REGISTRY.get(action_id) or {}
                base = f"{(el.get('type') or 'Element').strip()}:{' '.join((el.get('label') or 'Unnamed').split())}"
                elems = CURRENT_TEXT_JSON.get("elements", {})
                if base in elems:
                    return elems.get(base)
                for k, v in elems.items():
                    if isinstance(k, str) and k.startswith(base + "#"):
                        return v
            except Exception:
                pass

    # Fallback: load from file
    try:
        text_json_path = os.path.join(SITE_STRUCTURES_DIR, "text.json")
        print(f"   📂 Loading text.json from: {text_json_path}")
        with open(text_json_path, 'r', encoding='utf-8') as f:
            CURRENT_TEXT_JSON = json.load(f)
        hints = CURRENT_TEXT_JSON.get("elements", {}).get(lookup_key)
        if hints:
            print(f"   ✅ Found hints for {lookup_key}: {hints.get('label')}")
        else:
            print(f"   ⚠️ {lookup_key} not in text.json")
        return hints
    except Exception as e:
        print(f"   ❌ Failed to load text.json: {e}")
        return None


def _parse_action_descriptor(act: str) -> tuple[str | None, str | None]:
    """
    Parse a stable element reference in the form "Type:Label".

    @returns: (kind, label) or (None, None) if not parseable.
    """
    if not act or not isinstance(act, str):
        return None, None
    if act.startswith("a_id_"):
        return None, None
    if ":" not in act:
        return None, None
    kind, label = act.split(":", 1)
    kind = kind.strip() or None
    label = label.strip() or None
    return kind, label


def infer_action_type_from_act(act, has_value: bool) -> str:
    """
    🧪 NUMERIC ID SYSTEM: Infer the action type from numeric ID or Type:Label.

    For numeric IDs, looks up the type in text.json.
    """
    if has_value:
        return "setValue"

    # Try to get type from text.json (numeric ID path)
    hints = resolve_action_hints(act)
    if hints:
        kind = hints.get("type", "").strip()
        if kind in ("Input", "Select"):
            return "click"
        if kind in ("Link", "Button"):
            return "click"
        return "click"

    # Legacy: parse Type:Label format
    kind, _label = _parse_action_descriptor(str(act) if act else "")
    if kind in ("Input", "Select"):
        return "click"
    if kind in ("Link", "Button"):
        return "click"
    return "click"


def resolve_action_by_kind_and_label(kind: str, label: str, action_type: str | None = None) -> dict | None:
    """
    Resolve a stable "Type:Label" reference into the best hints from CURRENT_TEXT_JSON.

    @param kind: e.g. "Input", "Button", "Link"
    @param label: e.g. "Message"
    @param action_type: optional hint (e.g. setValue) to improve tie-breaking
    """
    global CURRENT_TEXT_JSON
    try:
        if not CURRENT_TEXT_JSON or not CURRENT_TEXT_JSON.get("elements"):
            # Load from disk as a fallback
            text_json_path = os.path.join(SITE_STRUCTURES_DIR, "text.json")
            with open(text_json_path, "r", encoding="utf-8") as f:
                CURRENT_TEXT_JSON = json.load(f)

        elements = CURRENT_TEXT_JSON.get("elements", {}) if CURRENT_TEXT_JSON else {}
        if not elements:
            return None

        kind_norm = (kind or "").strip().lower()
        # 🔧 Normalize whitespace: replace newlines/tabs/multiple spaces with single space
        label_norm = re.sub(r'\s+', ' ', (label or "").strip().lower())

        candidates: list[tuple[str, dict]] = []
        for aid, hints in elements.items():
            try:
                if not isinstance(hints, dict):
                    continue
                if (hints.get("type", "") or "").strip().lower() != kind_norm:
                    continue
                # 🔧 Normalize whitespace in hints label too (handles newlines in text.json)
                hints_label_norm = re.sub(r'\s+', ' ', (hints.get("label", "") or "").strip().lower())
                if hints_label_norm != label_norm:
                    continue
                candidates.append((aid, hints))
            except Exception:
                continue

        if not candidates:
            return None

        # Tie-break: for setValue prefer inputs/textboxes/contenteditable-like tags
        def score(aid: str, h: dict) -> int:
            s = 0
            tag = (h.get("tag") or "").strip().lower()
            selectors = h.get("selectors") or []
            if isinstance(selectors, list):
                s += min(len(selectors), 10)
            if action_type == "setValue":
                if h.get("type") in ("Input", "Select"):
                    s += 50
                if tag in ("input", "textarea", "div", "span"):
                    s += 10
            return s

        best_aid, best = max(candidates, key=lambda t: score(t[0], t[1]))
        # Include resolved a_id for debugging (not used by content script)
        return {**best, "_resolved_action_id": best_aid}
    except Exception as e:
        print(f"   ❌ Failed to resolve by Type:Label: {e}")
        return None


def resolve_hints_for_act(act: int | str, action_type: str | None = None) -> dict | None:
    """
    Resolve hints for:
    - 🧪 Numeric IDs: 7, "7" (direct lookup in text.json)
    - a_id_X (direct lookup)
    - Type:Label (search text.json for matching element)
    """
    if act is None:
        return None

    # 🧪 NUMERIC ID SYSTEM: route numeric IDs through resolve_action_hints
    if isinstance(act, int) or (isinstance(act, str) and act.isdigit()):
        return resolve_action_hints(act)

    if isinstance(act, str) and act.startswith("a_id_"):
        return resolve_action_hints(act)

    kind, label = _parse_action_descriptor(act)  # stable reference
    if kind and label:
        return resolve_action_by_kind_and_label(kind, label, action_type=action_type)

    return None

def get_current_tabs_info():
    """
    📊 Get the latest tab information that was received from the extension
    
    This function provides external access to the tab information that's
    being printed to the terminal, allowing clients to programmatically
    retrieve current tab status.
    
    @returns {Object} - Current tabs information with metadata
    """
    if CURRENT_TABS_INFO is None:
        return {
            "error": "No tab information available yet",
            "status": "waiting_for_extension"
        }
    
    return {
        "tabs": CURRENT_TABS_INFO,
        "last_update": LAST_TABS_UPDATE,
        "extension_connected": EXTENSION_WS is not None,
        "total_clients": len(CLIENTS)
    }

def get_current_page_data():
    """
    🧠 Get the latest page intelligence data that was received from the extension
    
    This function provides external access to the current page intelligence
    including actionable elements and page state for LLM consumption.
    
    @returns {Object} - Current page intelligence data with metadata
    """
    if CURRENT_PAGE_DATA is None:
        return {
            "error": "No page intelligence data available yet",
            "status": "waiting_for_intelligence_update"
        }
    
    return {
        "page_data": CURRENT_PAGE_DATA,
        "last_update": LAST_PAGE_UPDATE,
        "extension_connected": EXTENSION_WS is not None,
        "total_elements": CURRENT_PAGE_DATA.get("total_elements", 0),
        "intelligence_version": CURRENT_PAGE_DATA.get("intelligence_version", "unknown"),
        "browser_state": CURRENT_PAGE_DATA.get("browser_state", {}) if CURRENT_PAGE_DATA else {}
    }

def get_current_content_data():
    """
    📄 Get the latest page content data that was received from the extension
    
    This function provides external access to the current page content
    including content structure and elements for LLM consumption.
    
    @returns {Object} - Current page content data with metadata
    """
    if CURRENT_CONTENT_DATA is None:
        return {
            "error": "No page content data available yet",
            "status": "waiting_for_content_update"
        }
    
    return {
        "content_data": CURRENT_CONTENT_DATA,
        "last_update": LAST_CONTENT_UPDATE,
        "extension_connected": EXTENSION_WS is not None,
        "total_content_elements": CURRENT_CONTENT_DATA.get("summary", {}).get("total_content_elements", 0),
        "intelligence_version": CURRENT_CONTENT_DATA.get("intelligence_version", "unknown"),
        "browser_state": CURRENT_CONTENT_DATA.get("browser_state", {}) if CURRENT_CONTENT_DATA else {}
    }

def get_current_active_tab():
    """
    🎯 Get the current active tab information
    
    This function provides quick access to the currently active tab,
    which is most useful for LLM interactions and automation.
    
    @returns {Object} - Current active tab information with metadata
    """
    # 🆕 NEW: Use stored active tab info if available (more accurate)
    if CURRENT_ACTIVE_TAB is not None:
        return {
            "active_tab": {
                "id": CURRENT_ACTIVE_TAB.get("id"),
                "url": CURRENT_ACTIVE_TAB.get("url"),
                "title": CURRENT_ACTIVE_TAB.get("title"),
                "status": CURRENT_ACTIVE_TAB.get("status"),
                "pending_url": CURRENT_ACTIVE_TAB.get("pendingUrl")
            },
            "last_update": LAST_TABS_UPDATE,
            "extension_connected": EXTENSION_WS is not None,
            "total_tabs": len(CURRENT_TABS_INFO) if CURRENT_TABS_INFO else 0,
            "source": "active_tab_info_message"
        }
    
    # Fallback to searching in tabs_info
    if CURRENT_TABS_INFO is None:
        return {
            "error": "No tab information available yet",
            "status": "waiting_for_extension"
        }
    
    # Find the active tab
    active_tab = None
    for tab in CURRENT_TABS_INFO:
        if tab.get("active", False):
            active_tab = tab
            break
    
    if not active_tab:
        return {
            "error": "No active tab found",
            "status": "no_active_tab",
            "available_tabs": len(CURRENT_TABS_INFO)
        }
    
    return {
        "active_tab": {
            "id": active_tab.get("id"),
            "url": active_tab.get("url"),
            "title": active_tab.get("title"),
            "status": active_tab.get("status"),
            "pending_url": active_tab.get("pendingUrl")
        },
        "last_update": LAST_TABS_UPDATE,
        "extension_connected": EXTENSION_WS is not None,
        "total_tabs": len(CURRENT_TABS_INFO),
        "source": "tabs_info_fallback"
    }

def save_site_map_to_jsonl(site_map_data, suffix=""):
    """
    💾 Save site map data to a JSONL file in the @site_structures folder
    
    This function takes the site map data that's already flowing through the server
    and saves it to a JSONL file named after the website's hostname.
    
    @param site_map_data: Raw site map data from extension
    @param suffix: Optional suffix to add to filename (e.g., "_clean")
    @return: File path if successful, None if failed
    """
    try:
        # Ensure the site structures directory exists
        if not os.path.exists(SITE_STRUCTURES_DIR):
            os.makedirs(SITE_STRUCTURES_DIR)
            print(f"📁 Created directory: {SITE_STRUCTURES_DIR}")
        
        # Extract URL and generate filename
        url = site_map_data.get('metadata', {}).get('url', 'unknown')
        parsed_url = urlparse(url)
        hostname = parsed_url.hostname or 'unknown'
        filename = f"{hostname}{suffix}.jsonl"
        filepath = os.path.join(SITE_STRUCTURES_DIR, filename)
        
        # Write the entire site map data to JSONL file with proper formatting
        with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
            f.write(json.dumps(site_map_data, ensure_ascii=False, indent=2) + '\n')
        
        print(f"💾 Site map saved to: {filepath}")
        print(f"📊 Elements: {site_map_data.get('statistics', {}).get('totalElements', 0)}")
        
        return filepath
        
    except Exception as e:
        print(f"❌ Error saving site map: {e}")
        return None

def process_clean_site_map(raw_file_path):
    """
    🧠 Process raw site map data into LLM-friendly format
    
    This function takes the raw _clean.jsonl file and processes it to:
    1. Extract the interactive elements
    2. Add unique FindMe_id to each element
    3. Create LLM-optimized structure
    4. Generate mapping between processed and raw data
    
    @param raw_file_path: Path to the _clean.jsonl file
    @return: Tuple of (processed_data, mapping_data, success_status)
    """
    try:
        print(f"🧠 Processing raw site map: {raw_file_path}")
        
        # Read the raw JSONL file
        with open(raw_file_path, 'r', encoding='utf-8') as f:
            raw_data = json.loads(f.read())
        
        # Extract key components
        metadata = raw_data.get('metadata', {})
        interactive_elements = raw_data.get('interactiveElements', [])
        page_structure = raw_data.get('pageStructure', {})
        
        print(f"📊 Raw data contains {len(interactive_elements)} interactive elements")
        
        # Create processed elements with FindMe_id
        processed_elements = []
        element_mapping = {}
        
        for index, element in enumerate(interactive_elements):
            # Create unique FindMe_id
            findme_id = f"FindMe_{index + 1:03d}"
            
            # Create processed element
            processed_element = {
                "FindMe_id": findme_id,
                "type": element.get("type", "unknown"),
                "text": element.get("text", "")[:100],  # Truncate long text
                "href": element.get("href"),
                "selector": element.get("selector"),
                "coordinates": element.get("coordinates", {}),
                "accessibility": element.get("accessibility", {}),
                "position": element.get("position", {})
            }
            
            processed_elements.append(processed_element)
            
            # Create mapping entry
            element_mapping[findme_id] = {
                "original_index": index,
                "original_element": element,
                "processed_element": processed_element
            }
        
        # Create processed data structure
        processed_data = {
            "metadata": metadata,
            "statistics": {
                "totalElements": len(processed_elements),
                "originalElements": len(interactive_elements),
                "processingRatio": len(processed_elements) / len(interactive_elements) if interactive_elements else 0
            },
            "elements": processed_elements,
            "pageStructure": page_structure
        }
        
        # Create mapping data
        mapping_data = {
            "metadata": metadata,
            "elementMapping": element_mapping,
            "processingInfo": {
                "timestamp": asyncio.get_event_loop().time(),
                "totalMapped": len(element_mapping),
                "processingStatus": "success"
            }
        }
        
        print(f"✅ Processing complete: {len(interactive_elements)} → {len(processed_elements)} elements")
        print(f"🔗 Element mapping created for {len(element_mapping)} elements")
        
        return processed_data, mapping_data, True
        
    except Exception as e:
        print(f"❌ Error processing site map: {e}")
        return None, None, False

def process_clean_site_map_data(raw_data):
    """
    🧠 Process raw site map data directly into LLM-friendly format
    
    This function takes the raw site map data and processes it to:
    1. Extract the interactive elements
    2. Add unique FindMe_id to each element
    3. Create LLM-optimized structure
    4. 🆕 NEW: Apply enhanced element classification using browser-use techniques
    5. 🆕 NEW: Apply deduplication and non-interactive filtering
    
    @param raw_data: Raw site map data from extension
    @return: Tuple of (processed_data, mapping_data, success_status)
    """
    try:
        print("🧠 Processing raw site map data with enhanced classification and filtering...")
        
        
        # Extract key components
        metadata = raw_data.get('metadata', {})
        interactive_elements = raw_data.get('interactiveElements', [])
        page_structure = raw_data.get('pageStructure', {})
        
        print(f"📊 Raw data contains {len(interactive_elements)} interactive elements")
        
        # 🆕 ENHANCED FILTERING: Apply deduplication and non-interactive filtering
        print("🧹 Applying element filtering and deduplication...")
        
        # Step 1: Remove duplicates
        deduplicated_elements = deduplicate_elements(interactive_elements)
        
        # Step 2: Filter out non-interactive elements
        filtered_elements = filter_non_interactive_elements(deduplicated_elements)
        
        # 🆕 ENHANCED CLASSIFICATION: Apply browser-use-inspired classification
        print("🎯 Applying enhanced element classification...")
        
        processed_elements = []
        element_mapping = {}
        classification_stats = {
            'total_processed': 0,
            'interactive_elements': 0,
            'search_elements': 0,
            'navigation_elements': 0,
            'form_elements': 0,
            'content_elements': 0,
            'high_confidence': 0,
            'medium_confidence': 0,
            'low_confidence': 0
        }
        
        for index, element in enumerate(filtered_elements):
            # Create unique FindMe_id
            findme_id = f"FindMe_{index + 1:03d}"
            
            # 🆕 ENHANCED CLASSIFICATION: Apply sophisticated classification
            classification = classify_element_enhanced(element)
            
            # Create processed element with enhanced classification data
            processed_element = {
                "FindMe_id": findme_id,
                "type": element.get("type", "unknown"),
                "text": element.get("text", "")[:100],  # Truncate long text
                "href": element.get("href"),
                "selector": element.get("selector"),
                "coordinates": element.get("coordinates", {}),
                "accessibility": element.get("accessibility", {}),
                "position": element.get("position", {}),
                
                # 🆕 ENHANCED CLASSIFICATION DATA
                "enhanced_classification": {
                    "is_interactive": classification['is_interactive'],
                    "element_category": classification['element_category'],
                    "overall_confidence": classification['overall_confidence'],
                    "interactivity_confidence": classification['interactivity_confidence'],
                    "search_relevance": classification['search_relevance'],
                    "content_quality": classification['content_quality'],
                    "functional_importance": classification['functional_importance'],
                    "visibility_score": classification['visibility_score'],
                    "accessibility_score": classification['accessibility_score'],
                    "classification_reasons": classification['classification_reasons'][:5]  # Limit to top 5 reasons
                }
            }
            
            processed_elements.append(processed_element)
            
            # Create mapping entry
            element_mapping[findme_id] = {
                "original_index": index,
                "original_element": element,
                "processed_element": processed_element,
                "classification": classification
            }
            
            # 🆕 UPDATE CLASSIFICATION STATISTICS
            classification_stats['total_processed'] += 1
            
            if classification['is_interactive']:
                classification_stats['interactive_elements'] += 1
            
            category = classification['element_category']
            if category == 'search_element':
                classification_stats['search_elements'] += 1
            elif category == 'navigation_element':
                classification_stats['navigation_elements'] += 1
            elif category == 'form_element':
                classification_stats['form_elements'] += 1
            elif category == 'content_element':
                classification_stats['content_elements'] += 1
            
            confidence = classification['overall_confidence']
            if confidence >= 0.7:
                classification_stats['high_confidence'] += 1
            elif confidence >= 0.4:
                classification_stats['medium_confidence'] += 1
            else:
                classification_stats['low_confidence'] += 1
        
        # Create processed data structure with enhanced statistics
        processed_data = {
            "metadata": metadata,
            "statistics": {
                "totalElements": len(processed_elements),
                "originalElements": len(interactive_elements),
                "processingRatio": len(processed_elements) / len(interactive_elements) if interactive_elements else 0,
                
                # 🆕 FILTERING STATISTICS
                "filteringStats": {
                    "duplicatesRemoved": len(interactive_elements) - len(deduplicated_elements),
                    "nonInteractiveRemoved": len(deduplicated_elements) - len(filtered_elements),
                    "totalFiltered": len(interactive_elements) - len(filtered_elements),
                    "filteringRatio": (len(interactive_elements) - len(filtered_elements)) / len(interactive_elements) if interactive_elements else 0
                },
                
                # 🆕 ENHANCED CLASSIFICATION STATISTICS
                "enhancedClassification": classification_stats,
                "elementCategories": {
                    "interactive": classification_stats['interactive_elements'],
                    "search": classification_stats['search_elements'],
                    "navigation": classification_stats['navigation_elements'],
                    "form": classification_stats['form_elements'],
                    "content": classification_stats['content_elements']
                },
                "confidenceDistribution": {
                    "high": classification_stats['high_confidence'],
                    "medium": classification_stats['medium_confidence'],
                    "low": classification_stats['low_confidence']
                }
            },
            "elements": processed_elements,
            "pageStructure": page_structure
        }
        
        # Create mapping data (but we won't save it)
        mapping_data = {
            "metadata": metadata,
            "elementMapping": element_mapping,
            "processingInfo": {
                "timestamp": int(time.time() * 1000),
                "totalMapped": len(element_mapping),
                "processingStatus": "success",
                "enhancedClassificationApplied": True
            }
        }
        
        # 🆕 ENHANCED LOGGING: Show classification results
        print(f"✅ Enhanced processing complete: {len(interactive_elements)} → {len(processed_elements)} elements")
        print("📊 Processing Breakdown:")
        print(f"   📥 Original elements: {len(interactive_elements)}")
        print(f"   🧹 After deduplication: {len(deduplicated_elements)} (removed {len(interactive_elements) - len(deduplicated_elements)} duplicates)")
        print(f"   🚫 After filtering: {len(filtered_elements)} (removed {len(deduplicated_elements) - len(filtered_elements)} non-interactive)")
        print(f"   🎯 Final processed: {len(processed_elements)} elements")
        print()
        print("📊 Enhanced Classification Results:")
        print(f"   🎯 Interactive Elements: {classification_stats['interactive_elements']}")
        print(f"   🔍 Search Elements: {classification_stats['search_elements']}")
        print(f"   🧭 Navigation Elements: {classification_stats['navigation_elements']}")
        print(f"   📝 Form Elements: {classification_stats['form_elements']}")
        print(f"   📄 Content Elements: {classification_stats['content_elements']}")
        print(f"   🏆 High Confidence: {classification_stats['high_confidence']}")
        print(f"   ⚖️ Medium Confidence: {classification_stats['medium_confidence']}")
        print(f"   ⚠️ Low Confidence: {classification_stats['low_confidence']}")
        
        # Calculate overall improvement
        total_filtered = len(interactive_elements) - len(processed_elements)
        improvement_ratio = total_filtered / len(interactive_elements) if interactive_elements else 0
        print(f"📈 Overall improvement: {total_filtered} elements filtered ({improvement_ratio:.1%} reduction)")
        
        return processed_data, mapping_data, True
        
    except Exception as e:
        print(f"❌ Error processing site map data: {e}")
        import traceback
        traceback.print_exc()
        return None, None, False

def siteStructuredLLMmethodinsidethefile(filepath):
    """
    🧠 Post-process the written file to remove unnecessary fields and create a much smaller file
    
    This method removes specific fields as specified in remove.md:
    1. Remove verbose metadata fields (pathname, search, hash, protocol, timestamp, etc.)
    2. Remove statistics section entirely
    3. Remove type attribute from elements
    4. Remove detailed coordinates (keep only x, y, width, height)
    5. Remove accessibility and position fields from elements
    
    🆕 NEW: Enhanced consolidation by merging pageStructure with elements:
    6. Merge headings and forms data into the elements array
    7. Create comprehensive element objects with full context
    8. Remove redundant pageStructure section
    9. Provide consolidated view of each element's role and context
    
    🆕 NEW: Enhanced element filtering and scoring:
    10. Score elements based on interactivity, content quality, and importance
    11. Filter out low-value elements to reduce bloat
    12. Keep only high-scoring elements that LLMs actually need
    
    @param filepath: Path to the processed file that was just written
    @return: True if successful, False if failed
    """
    try:
        print(f"🧠 Running siteStructuredLLMmethodinsidethefile on: {filepath}")
        
        # Read the current file
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Store original stats for comparison
        original_elements = len(data.get('elements', []))
        original_size = os.path.getsize(filepath)
        
        print(f"📊 Original file: {original_elements} elements, {original_size:,} bytes")
        
        # 🔧 REMOVAL 1: Clean up metadata - keep only essential fields
        if 'metadata' in data:
            metadata = data['metadata']
            # Keep only url and title, remove everything else
            essential_metadata = {
                'url': metadata.get('url'),
                'title': metadata.get('title')
            }
            data['metadata'] = {k: v for k, v in essential_metadata.items() if v is not None}
        
        # 🔧 REMOVAL 2: Remove statistics section entirely
        if 'statistics' in data:
            del data['statistics']
        
        # 🆕 ENHANCEMENT: Consolidate pageStructure with elements
        consolidated_elements = []
        
        # Start with existing elements
        if 'elements' in data:
            for element in data['elements']:
                # Clean up the element
                text = element.get('text', '').strip()
                href = element.get('href')
                selector = element.get('selector', '')
                
                # Skip elements that are essentially junk (no meaningful content)
                if not text and not href and not selector:
                    continue
                
                # Skip elements that are just empty buttons or placeholders
                if not text and selector in ['#button', '.yt-spec-button-shape-next', '.yt-spec-avatar-shape']:
                    continue
                
                # Create consolidated element
                consolidated_element = {
                    'FindMe_id': element.get('FindMe_id'),
                    'text': text,
                    'href': href,
                    'selector': selector,
                    'element_type': 'interactive',  # Default type
                    'context': 'main_content'  # Default context
                }
                
                # Only add if it has meaningful content
                if text or href:
                    consolidated_elements.append(consolidated_element)
        
        # 🎯 MERGE HEADINGS: Add headings as consolidated elements
        if 'pageStructure' in data and 'headings' in data['pageStructure']:
            for i, heading in enumerate(data['pageStructure']['headings']):
                heading_text = heading.get('text', '').strip()
                heading_selector = heading.get('selector', '')
                heading_level = heading.get('level', 1)
                
                if heading_text:  # Only add headings with actual text
                    consolidated_elements.append({
                        'FindMe_id': f"heading_{i+1:03d}",
                        'text': heading_text,
                        'href': None,  # Headings don't have hrefs
                        'selector': heading_selector,
                        'element_type': 'heading',
                        'heading_level': heading_level,
                        'context': 'content_structure'
                    })
        
        # 🎯 MERGE FORMS: Add forms as consolidated elements
        if 'pageStructure' in data and 'forms' in data['pageStructure']:
            for i, form in enumerate(data['pageStructure']['forms']):
                form_action = form.get('action', '')
                form_method = form.get('method', 'get')
                form_selector = form.get('selector', '')
                
                # Add the form itself
                consolidated_elements.append({
                    'FindMe_id': f"form_{i+1:03d}",
                    'text': f"Form ({form_method.upper()})",
                    'href': form_action,
                    'selector': form_selector,
                    'element_type': 'form',
                    'form_method': form_method,
                    'context': 'interaction'
                })
                
                # Add form inputs
                if 'inputs' in form:
                    for j, input_field in enumerate(form['inputs']):
                        input_type = input_field.get('type', 'text')
                        input_name = input_field.get('name', '')
                        input_placeholder = input_field.get('placeholder', '')
                        input_selector = input_field.get('selector', '')
                        
                        input_text = f"{input_type.title()} input"
                        if input_placeholder:
                            input_text += f": {input_placeholder}"
                        elif input_name:
                            input_text += f": {input_name}"
                        
                        consolidated_elements.append({
                            'FindMe_id': f"form_{i+1:03d}_input_{j+1:03d}",
                            'text': input_text,
                            'href': None,
                            'selector': input_selector,
                            'element_type': 'form_input',
                            'input_type': input_type,
                            'input_name': input_name,
                            'context': 'interaction'
                        })
        
        # 🔧 REMOVAL 3: Remove the now-redundant pageStructure section
        if 'pageStructure' in data:
            del data['pageStructure']
        
        # 🆕 NEW: Enhanced Element Filtering and Scoring
        print("🧠 Applying enhanced element filtering and scoring...")
        
        scored_elements = []
        for element in consolidated_elements:
            # 🆕 ENHANCED SCORING: Use enhanced classification data if available
            enhanced_classification = element.get('enhanced_classification', {})
            
            if enhanced_classification:
                # Use enhanced classification for scoring
                overall_confidence = enhanced_classification.get('overall_confidence', 0.0)
                element_category = enhanced_classification.get('element_category', 'unknown')
                is_interactive = enhanced_classification.get('is_interactive', False)
                
                # 🎯 ENHANCED FILTERING: More sophisticated filtering based on classification
                should_keep = False
                
                # Keep high-confidence elements
                if overall_confidence >= 0.7:
                    should_keep = True
                
                # Keep search elements (high priority)
                elif element_category == 'search_element':
                    should_keep = True
                
                # Keep interactive elements with medium confidence
                elif is_interactive and overall_confidence >= 0.5:
                    should_keep = True
                
                # Keep navigation elements with medium confidence
                elif element_category == 'navigation_element' and overall_confidence >= 0.5:
                    should_keep = True
                
                # Keep form elements (important for interaction)
                elif element_category == 'form_element':
                    should_keep = True
                
                # Keep content elements with good quality
                elif element_category == 'content_element' and enhanced_classification.get('content_quality', 0) >= 0.4:
                    should_keep = True
                
                # Keep elements with high accessibility scores
                elif enhanced_classification.get('accessibility_score', 0) >= 0.6:
                    should_keep = True
                
                if should_keep:
                    # Add enhanced scoring data to element
                    element['enhanced_importance_score'] = overall_confidence
                    element['element_category'] = element_category
                    element['is_interactive'] = is_interactive
                    element['classification_reasons'] = enhanced_classification.get('classification_reasons', [])
                    scored_elements.append(element)
                
            else:
                # 🆕 FALLBACK: Use original scoring method for backward compatibility
                score = calculate_element_importance_score(element)
                element['importance_score'] = score
                
                # Only keep elements with score >= 0.6 (high importance)
                if score >= 0.6:
                    scored_elements.append(element)
        
        print(f"📊 Enhanced element scoring complete: {len(consolidated_elements)} → {len(scored_elements)} elements kept")
        
        # 🆕 ENHANCED STATISTICS: Show detailed breakdown
        if scored_elements:
            enhanced_count = sum(1 for el in scored_elements if 'enhanced_importance_score' in el)
            fallback_count = sum(1 for el in scored_elements if 'importance_score' in el)
            
            print("📈 Scoring method breakdown:")
            print(f"   🆕 Enhanced classification: {enhanced_count} elements")
            print(f"   🔄 Fallback scoring: {fallback_count} elements")
            
            # Show category breakdown for enhanced elements
            category_counts = {}
            for element in scored_elements:
                if 'element_category' in element:
                    category = element['element_category']
                    category_counts[category] = category_counts.get(category, 0) + 1
            
            if category_counts:
                print("📊 Element category breakdown:")
                for category, count in category_counts.items():
                    print(f"   {category}: {count} elements")
        
        # Replace elements with scored and filtered version
        data['elements'] = scored_elements
        
        # Write the cleaned file to a new file (don't overwrite original)
        cleaned_filepath = filepath.replace('.jsonl', '_cleaned.jsonl')
        with open(cleaned_filepath, 'w', encoding='utf-8', errors='ignore') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # Calculate new stats
        new_elements = len(scored_elements)
        new_size = os.path.getsize(cleaned_filepath)
        
        print("✅ File cleaning and consolidation complete:")
        print(f"   📊 Elements: {original_elements} → {new_elements}")
        print(f"   📏 File size: {original_size:,} → {new_size:,} bytes")
        print(f"   📉 Size reduction: {((original_size - new_size) / original_size * 100):.1f}%")
        print(f"   📁 New consolidated file: {os.path.basename(cleaned_filepath)}")
        
        # Show consolidation breakdown
        element_types = {}
        for element in scored_elements:
            element_type = element.get('element_type', 'unknown')
            element_types[element_type] = element_types.get(element_type, 0) + 1
        
        print("🧩 Consolidated element breakdown:")
        for element_type, count in element_types.items():
            print(f"   {element_type}: {count} elements")
        
        # Show scoring distribution
        score_ranges = {'0.6-0.7': 0, '0.7-0.8': 0, '0.8-0.9': 0, '0.9-1.0': 0}
        for element in scored_elements:
            score = element.get('importance_score', 0)
            if 0.6 <= score < 0.7:
                score_ranges['0.6-0.7'] += 1
            elif 0.7 <= score < 0.8:
                score_ranges['0.7-0.8'] += 1
            elif 0.8 <= score < 0.9:
                score_ranges['0.8-0.9'] += 1
            elif 0.9 <= score <= 1.0:
                score_ranges['0.9-1.0'] += 1
        
        print("📊 Importance score distribution:")
        for range_name, count in score_ranges.items():
            if count > 0:
                print(f"   {range_name}: {count} elements")
        
        return True
        
    except Exception as e:
        print(f"❌ Error in siteStructuredLLMmethodinsidethefile: {e}")
        import traceback
        traceback.print_exc()
        return False


def classify_element_enhanced(element_data):
    """
    🧠 Enhanced element classification using browser-use techniques
    
    This function implements sophisticated element detection and classification
    inspired by browser-use's advanced filtering techniques.
    
    🎯 CLASSIFICATION FACTORS:
    1. Interactive Element Detection (strict selectors)
    2. Accessibility Property Analysis
    3. Search Element Detection
    4. Visibility and Viewport Validation
    5. Content Quality Assessment
    6. Functional Importance Analysis
    
    @param element_data: Raw element data from extension
    @return: Enhanced classification with confidence scores
    """
    try:
        # Extract basic element information
        element_type = element_data.get('type', '').lower()
        text = element_data.get('text', '').strip()
        href = element_data.get('href')
        selector = element_data.get('selector', '')
        attributes = element_data.get('attributes', {})
        coordinates = element_data.get('coordinates', {})
        
        # Initialize classification result
        classification = {
            'is_interactive': False,
            'interactivity_confidence': 0.0,
            'element_category': 'unknown',
            'accessibility_score': 0.0,
            'search_relevance': 0.0,
            'content_quality': 0.0,
            'functional_importance': 0.0,
            'visibility_score': 0.0,
            'overall_confidence': 0.0,
            'classification_reasons': []
        }
        
        # 🎯 1. INTERACTIVE ELEMENT DETECTION (browser-use strict selectors)
        interactive_score = 0.0
        interactive_reasons = []
        
        # Check for strict interactive selectors
        strict_interactive_patterns = [
            # Buttons
            {'tag': 'button', 'score': 0.9},
            {'attr': 'type', 'value': 'button', 'score': 0.8},
            {'attr': 'type', 'value': 'submit', 'score': 0.8},
            {'attr': 'type', 'value': 'reset', 'score': 0.7},
            
            # Form inputs
            {'tag': 'input', 'attr': 'type', 'value': 'text', 'score': 0.8},
            {'tag': 'input', 'attr': 'type', 'value': 'email', 'score': 0.8},
            {'tag': 'input', 'attr': 'type', 'value': 'password', 'score': 0.8},
            {'tag': 'input', 'attr': 'type', 'value': 'search', 'score': 0.9},
            {'tag': 'input', 'attr': 'type', 'value': 'checkbox', 'score': 0.7},
            {'tag': 'input', 'attr': 'type', 'value': 'radio', 'score': 0.7},
            
            # Other form elements
            {'tag': 'select', 'score': 0.8},
            {'tag': 'textarea', 'score': 0.8},
            
            # Links (only real ones)
            {'tag': 'a', 'has_href': True, 'not_placeholder': True, 'score': 0.8},
        ]
        
        # Check each pattern
        for pattern in strict_interactive_patterns:
            if _matches_interactive_pattern(element_data, pattern):
                interactive_score = max(interactive_score, pattern['score'])
                interactive_reasons.append(f"Matches {pattern.get('tag', pattern.get('attr', 'pattern'))}")
        
        # Check for ARIA roles (accessibility-based interactivity)
        aria_roles = {
            'button': 0.9, 'link': 0.8, 'menuitem': 0.7,
            'textbox': 0.8, 'combobox': 0.8, 'listbox': 0.7,
            'checkbox': 0.7, 'radio': 0.7, 'tab': 0.7,
            'menubar': 0.6, 'toolbar': 0.6, 'grid': 0.6
        }
        
        role = attributes.get('role', '').lower()
        if role in aria_roles:
            interactive_score = max(interactive_score, aria_roles[role])
            interactive_reasons.append(f"ARIA role: {role}")
        
        # Check for onclick handlers
        if 'onclick' in attributes or any(attr.startswith('on') for attr in attributes.keys()):
            interactive_score = max(interactive_score, 0.8)
            interactive_reasons.append("Has event handlers")
        
        # 🎯 2. ACCESSIBILITY PROPERTY ANALYSIS
        accessibility_score = 0.0
        accessibility_reasons = []
        
        # Check for accessibility attributes
        if attributes.get('aria-label'):
            accessibility_score += 0.3
            accessibility_reasons.append("Has aria-label")
        
        if attributes.get('aria-describedby'):
            accessibility_score += 0.2
            accessibility_reasons.append("Has aria-describedby")
        
        if attributes.get('title'):
            accessibility_score += 0.2
            accessibility_reasons.append("Has title attribute")
        
        if attributes.get('alt'):
            accessibility_score += 0.2
            accessibility_reasons.append("Has alt text")
        
        # Check for proper labeling
        if attributes.get('for') or attributes.get('aria-labelledby'):
            accessibility_score += 0.3
            accessibility_reasons.append("Properly labeled")
        
        # 🎯 3. SEARCH ELEMENT DETECTION
        search_relevance = 0.0
        search_reasons = []
        
        search_indicators = [
            'search', 'magnify', 'glass', 'lookup', 'find', 'query',
            'search-icon', 'search-btn', 'search-button', 'searchbox',
            'search-input', 'search-field', 'search-form'
        ]
        
        # Check class names
        class_list = attributes.get('class', '').lower().split()
        for indicator in search_indicators:
            if any(indicator in cls for cls in class_list):
                search_relevance = max(search_relevance, 0.8)
                search_reasons.append(f"Search indicator in class: {indicator}")
                break
        
        # Check ID
        element_id = attributes.get('id', '').lower()
        for indicator in search_indicators:
            if indicator in element_id:
                search_relevance = max(search_relevance, 0.9)
                search_reasons.append(f"Search indicator in ID: {indicator}")
                break
        
        # Check data attributes
        for attr_name, attr_value in attributes.items():
            if attr_name.startswith('data-'):
                for indicator in search_indicators:
                    if indicator in attr_value.lower():
                        search_relevance = max(search_relevance, 0.7)
                        search_reasons.append(f"Search indicator in data attribute: {indicator}")
                        break
                if search_relevance >= 0.7:
                    break
        
        # Check text content for search-related terms
        search_text_indicators = ['search', 'find', 'lookup', 'query', 'go']
        if any(indicator in text.lower() for indicator in search_text_indicators):
            search_relevance = max(search_relevance, 0.6)
            search_reasons.append("Search-related text content")
        
        # 🎯 4. CONTENT QUALITY ASSESSMENT
        content_quality = 0.0
        content_reasons = []
        
        # Text length analysis
        text_length = len(text)
        if text_length > 100:
            content_quality += 0.4
            content_reasons.append("Long descriptive text")
        elif text_length > 50:
            content_quality += 0.3
            content_reasons.append("Medium descriptive text")
        elif text_length > 20:
            content_quality += 0.2
            content_reasons.append("Short meaningful text")
        elif text_length > 5:
            content_quality += 0.1
            content_reasons.append("Minimal text")
        
        # Check for meaningful content patterns
        meaningful_patterns = [
            r'\b[a-z]{3,}\b',  # Words with 3+ characters
            r'\d+',           # Numbers
            r'[A-Z][a-z]+',   # Proper nouns
        ]
        
        meaningful_count = 0
        for pattern in meaningful_patterns:
            if re.search(pattern, text):
                meaningful_count += 1
        
        if meaningful_count >= 2:
            content_quality += 0.2
            content_reasons.append("Rich content patterns")
        
        # 🎯 5. FUNCTIONAL IMPORTANCE ANALYSIS
        functional_importance = 0.0
        functional_reasons = []
        
        # Navigation importance
        nav_indicators = ['nav', 'menu', 'navigation', 'breadcrumb', 'pagination']
        if any(indicator in selector.lower() for indicator in nav_indicators):
            functional_importance += 0.4
            functional_reasons.append("Navigation element")
        
        # Form importance
        form_indicators = ['form', 'input', 'select', 'textarea', 'button']
        if any(indicator in element_type for indicator in form_indicators):
            functional_importance += 0.3
            functional_reasons.append("Form element")
        
        # Link importance (real links vs placeholders)
        if href and href != '#' and not href.startswith('javascript:'):
            functional_importance += 0.3
            functional_reasons.append("Real link")
        elif href == '#':
            functional_importance += 0.1
            functional_reasons.append("Placeholder link")
        
        # 🎯 6. VISIBILITY SCORE
        visibility_score = 0.0
        visibility_reasons = []
        
        # Check if element has valid coordinates
        if coordinates and coordinates.get('width', 0) > 0 and coordinates.get('height', 0) > 0:
            visibility_score += 0.5
            visibility_reasons.append("Has valid dimensions")
            
            # Check if element is reasonably sized
            width = coordinates.get('width', 0)
            height = coordinates.get('height', 0)
            if width > 30 and height > 10:
                visibility_score += 0.3
                visibility_reasons.append("Adequate size")
            elif width > 10 and height > 10:
                visibility_score += 0.2
                visibility_reasons.append("Minimum size")
        
        # Check for visibility-related attributes
        if attributes.get('hidden') is None and attributes.get('aria-hidden') != 'true':
            visibility_score += 0.2
            visibility_reasons.append("Not hidden")
        
        # 🎯 7. DETERMINE ELEMENT CATEGORY
        element_category = 'unknown'
        
        if interactive_score >= 0.7:
            if search_relevance >= 0.6:
                element_category = 'search_element'
            elif functional_importance >= 0.4:
                element_category = 'navigation_element'
            elif 'form' in element_type or 'input' in element_type:
                element_category = 'form_element'
            else:
                element_category = 'interactive_element'
        elif 'heading' in element_type or element_type in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
            element_category = 'heading_element'
        elif content_quality >= 0.4:
            element_category = 'content_element'
        elif functional_importance >= 0.3:
            element_category = 'functional_element'
        
        # 🎯 8. CALCULATE OVERALL CONFIDENCE
        # Weighted combination of all scores
        overall_confidence = (
            interactive_score * 0.3 +
            accessibility_score * 0.15 +
            search_relevance * 0.2 +
            content_quality * 0.15 +
            functional_importance * 0.1 +
            visibility_score * 0.1
        )
        
        # 🎯 9. BUILD FINAL CLASSIFICATION
        classification.update({
            'is_interactive': interactive_score >= 0.6,
            'interactivity_confidence': interactive_score,
            'element_category': element_category,
            'accessibility_score': accessibility_score,
            'search_relevance': search_relevance,
            'content_quality': content_quality,
            'functional_importance': functional_importance,
            'visibility_score': visibility_score,
            'overall_confidence': overall_confidence,
            'classification_reasons': (
                interactive_reasons + accessibility_reasons + 
                search_reasons + content_reasons + 
                functional_reasons + visibility_reasons
            )
        })
        
        return classification
        
    except Exception as e:
        print(f"❌ Error in enhanced element classification: {e}")
        # Return safe fallback
        return {
            'is_interactive': False,
            'interactivity_confidence': 0.0,
            'element_category': 'unknown',
            'accessibility_score': 0.0,
            'search_relevance': 0.0,
            'content_quality': 0.0,
            'functional_importance': 0.0,
            'visibility_score': 0.0,
            'overall_confidence': 0.0,
            'classification_reasons': [f"Classification error: {str(e)}"]
        }


def _matches_interactive_pattern(element_data, pattern):
    """
    🔍 Helper function to check if element matches interactive pattern
    
    @param element_data: Element data dictionary
    @param pattern: Pattern dictionary with matching criteria
    @return: Boolean indicating if element matches pattern
    """
    try:
        element_type = element_data.get('type', '').lower()
        attributes = element_data.get('attributes', {})
        href = element_data.get('href')
        
        # Check tag match
        if 'tag' in pattern and element_type != pattern['tag']:
            return False
        
        # Check attribute match
        if 'attr' in pattern:
            attr_name = pattern['attr']
            attr_value = pattern.get('value', '')
            
            if attr_name == 'type':
                if attributes.get('type', '').lower() != attr_value:
                    return False
            elif attr_name == 'has_href':
                if not href:
                    return False
            elif attr_name == 'not_placeholder':
                if href == '#' or href.startswith('javascript:'):
                    return False
        
        return True
        
    except Exception:
        return False


def deduplicate_elements(elements):
    """
    🧹 Remove duplicate elements based on content and position
    
    This function identifies and removes duplicate elements that have:
    - Same text content
    - Similar selectors
    - Similar positions
    - Same functionality
    
    @param elements: List of element dictionaries
    @return: Deduplicated list of elements
    """
    print("🧹 Starting element deduplication...")
    
    # Track seen elements to avoid duplicates
    seen_elements = {}
    deduplicated = []
    duplicates_removed = 0
    
    for element in elements:
        # Create a unique key for deduplication
        text = element.get('text', '').strip()
        href = element.get('href')
        selector = element.get('selector', '')
        element_type = element.get('type', '').lower()
        
        # Skip elements with no meaningful content
        if not text and not href:
            continue
        
        # Create deduplication key based on content and functionality
        if href and href != '#':
            # For real links, use href as primary key
            dedup_key = f"link:{href}"
        elif text:
            # For text elements, use text + selector pattern
            # Normalize selector to handle similar patterns
            normalized_selector = _normalize_selector(selector)
            dedup_key = f"text:{text}:{normalized_selector}"
        else:
            # For other elements, use type + selector
            dedup_key = f"type:{element_type}:{selector}"
        
        # Check if we've seen this element before
        if dedup_key in seen_elements:
            existing_element = seen_elements[dedup_key]
            
            # Compare elements to decide which to keep
            keep_existing = _should_keep_existing_element(existing_element, element)
            
            if keep_existing:
                # Keep existing, skip this one
                duplicates_removed += 1
                continue
            else:
                # Replace existing with this one
                deduplicated.remove(existing_element)
                duplicates_removed += 1
        
        # Add this element to our tracking
        seen_elements[dedup_key] = element
        deduplicated.append(element)
    
    print(f"✅ Deduplication complete: {len(elements)} → {len(deduplicated)} elements ({duplicates_removed} duplicates removed)")
    
    return deduplicated


def _normalize_selector(selector):
    """
    🔧 Normalize CSS selector for better deduplication
    
    @param selector: CSS selector string
    @return: Normalized selector string
    """
    if not selector:
        return ""
    
    # Remove specific IDs and numbers that might differ between duplicates
    # Remove nth-child selectors
    normalized = re.sub(r':nth-child\(\d+\)', '', selector)
    
    # Remove specific IDs (keep class patterns)
    normalized = re.sub(r'#[\w-]+', '', normalized)
    
    # Normalize common class patterns
    normalized = normalized.replace('.uael-grid-img', '.grid-img')
    normalized = normalized.replace('.uael-grid-item', '.grid-item')
    
    return normalized


def _should_keep_existing_element(existing, new_element):
    """
    🎯 Determine which element to keep when duplicates are found
    
    Priority order:
    1. Elements with real hrefs over placeholder hrefs
    2. Elements with more specific selectors
    3. Elements with better accessibility attributes
    4. Elements with more content
    
    @param existing: Existing element
    @param new_element: New element to compare
    @return: True if existing should be kept, False if new should replace it
    """
    existing_href = existing.get('href')
    new_href = new_element.get('href')
    
    # Priority 1: Real links over placeholders
    if existing_href and existing_href != '#' and (not new_href or new_href == '#'):
        return True
    if new_href and new_href != '#' and (not existing_href or existing_href == '#'):
        return False
    
    # Priority 2: More specific selectors (shorter = more specific)
    existing_selector = existing.get('selector', '')
    new_selector = new_element.get('selector', '')
    
    if len(existing_selector) < len(new_selector):
        return True
    if len(new_selector) < len(existing_selector):
        return False
    
    # Priority 3: More content
    existing_text = existing.get('text', '')
    new_text = new_element.get('text', '')
    
    if len(existing_text) > len(new_text):
        return True
    if len(new_text) > len(existing_text):
        return False
    
    # Default: keep existing
    return True


def filter_non_interactive_elements(elements):
    """
    🚫 Filter out elements that are not actually interactive
    
    This function removes elements that are marked as interactive but don't
    actually have interactive properties or functionality.
    
    @param elements: List of element dictionaries
    @return: Filtered list with only truly interactive elements
    """
    print("🚫 Filtering non-interactive elements...")
    
    filtered_elements = []
    non_interactive_removed = 0
    
    for element in elements:
        # Check if element is actually interactive
        if _is_truly_interactive(element):
            filtered_elements.append(element)
        else:
            non_interactive_removed += 1
    
    print(f"✅ Non-interactive filtering complete: {len(elements)} → {len(filtered_elements)} elements ({non_interactive_removed} non-interactive removed)")
    
    return filtered_elements


def _is_truly_interactive(element):
    """
    🎯 Check if an element is truly interactive
    
    An element is considered truly interactive if it has:
    1. Real href (not null, not '#', not javascript:)
    2. Interactive tag (button, input, select, textarea)
    3. Interactive ARIA role
    4. Event handlers (onclick, etc.)
    5. Interactive attributes (type="button", etc.)
    
    @param element: Element dictionary
    @return: True if element is truly interactive
    """
    element_type = element.get('type', '')
    if element_type and isinstance(element_type, str):
        element_type = element_type.lower()
    else:
        element_type = ''
    href = element.get('href')
    attributes = element.get('attributes', {})
    
    # Check for real href
    if href and href != '#' and not href.startswith('javascript:'):
        return True
    
    # Check for interactive tags
    interactive_tags = {'button', 'input', 'select', 'textarea', 'a'}
    if element_type in interactive_tags:
        # Additional check for input types
        if element_type == 'input':
            input_type = attributes.get('type', 'text')
            if input_type and isinstance(input_type, str):
                input_type = input_type.lower()
                if input_type in {'button', 'submit', 'reset', 'text', 'email', 'password', 'search', 'checkbox', 'radio'}:
                    return True
        else:
            return True
    
    # Check for interactive ARIA roles
    role = attributes.get('role')
    if role and isinstance(role, str):
        role = role.lower()
        interactive_roles = {'button', 'link', 'menuitem', 'textbox', 'combobox', 'listbox', 'checkbox', 'radio', 'tab'}
        if role in interactive_roles:
            return True
    
    # Check for event handlers
    for attr_name in attributes.keys():
        if attr_name.startswith('on'):
            return True
    
    # Check for interactive attributes
    if attributes.get('type') in {'button', 'submit', 'reset'}:
        return True
    
    # Check for clickable indicators in class names
    class_name = attributes.get('class')
    if class_name and isinstance(class_name, str):
        class_name = class_name.lower()
        clickable_indicators = {'button', 'click', 'clickable', 'btn', 'link', 'nav'}
        if any(indicator in class_name for indicator in clickable_indicators):
            return True
    
    return False


def calculate_element_importance_score(element):
    """
    🧠 Calculate importance score for an element (0.0 to 1.0)
    
    Scoring factors:
    - Element type (interactive > heading > form > text)
    - Content quality (text length, meaningful content)
    - Functionality (href, form actions, etc.)
    - Context relevance (navigation, main content, etc.)
    
    @param element: Element dictionary
    @return: Float score from 0.0 to 1.0
    """
    score = 0.0
    
    # 🎯 ELEMENT TYPE SCORING (highest impact)
    element_type = element.get('element_type', 'unknown')
    if element_type == 'interactive':
        score += 0.4  # Interactive elements are most important
    elif element_type == 'heading':
        score += 0.35  # Headings provide structure
    elif element_type == 'form':
        score += 0.3   # Forms enable user input
    elif element_type == 'form_input':
        score += 0.25  # Form inputs are actionable
    else:
        score += 0.1   # Other elements get base score
    
    # 📝 CONTENT QUALITY SCORING
    text = element.get('text', '')
    if text:
        text_length = len(text.strip())
        if text_length > 50:
            score += 0.2  # Long, descriptive text
        elif text_length > 20:
            score += 0.15  # Medium text
        elif text_length > 5:
            score += 0.1   # Short but meaningful text
        else:
            score += 0.05  # Very short text
    
    # 🔗 FUNCTIONALITY SCORING
    href = element.get('href')
    if href and href != '#':
        score += 0.15  # Real links are valuable
    elif href == '#':
        score += 0.05  # Placeholder links get minimal score
    
    # 🎯 CONTEXT RELEVANCE SCORING
    context = element.get('context', '')
    if context == 'navigation':
        score += 0.1   # Navigation elements are important
    elif context == 'main_content':
        score += 0.1   # Main content gets boost
    elif context == 'interaction':
        score += 0.1   # Interactive context is valuable
    
    # 🏷️ SELECTOR QUALITY SCORING
    selector = element.get('selector', '')
    if selector:
        # YouTube-specific selectors get boost
        if 'yt-' in selector or 'youtube' in selector:
            score += 0.05
        # Generic but meaningful selectors
        elif any(keyword in selector.lower() for keyword in ['button', 'link', 'nav', 'menu']):
            score += 0.05
    
    # Cap score at 1.0
    return min(score, 1.0)

async def handler(ws):  # pyright: ignore[reportGeneralTypeIssues]
    """
    🔌 WebSocket connection handler for each client
    
    This function manages the lifecycle of each WebSocket connection and
    implements the core message routing logic between clients.
    
    🎯 CLIENT IDENTIFICATION:
    - First client to connect becomes the extension
    - Clients sending 'bridge_status' messages are marked as extensions
    - Other clients are treated as test clients
    
    📨 MESSAGE ROUTING:
    - Commands from test clients → Forwarded to extension
    - Responses from extension → Routed back to test clients
    - Tab updates from extension → Logged for debugging
    """
    global EXTENSION_WS, CURRENT_ORB_THEME, CURRENT_SCAN_MODE
    print(f"🔌 Client connected! Total clients: {len(CLIENTS) + 1}")
    CLIENTS.add(ws)
    
    # First client to connect becomes the extension (Chrome extension)
    if EXTENSION_WS is None:
        EXTENSION_WS = ws
        print("🎯 Marked as extension client")
    
    try:
        # Listen for incoming messages from this client
        async for raw in ws:
            # Show full message for tab info, truncated for others
            if raw.startswith('{"type":"tabs_info"'):
                print(f"📨 Received: {raw}")
            else:
                print(f"📨 Received: {raw[:100]}...")
            msg = json.loads(raw)
            
            # 🆕 SHORTCUT NORMALIZATION (client sugar → existing flows)
            try:
                if isinstance(msg, dict) and msg.get("type") in {"exec_action","set_value","click","navigate_link","navigate_url"}:
                    shortcut_type = msg.get("type")
                    print(f"🧭 Shortcut received: {shortcut_type}")
                    if shortcut_type == "exec_action":
                        # Expect: actionId, optional actionType, optional params
                        action_id = msg.get("actionId")
                        action_type = msg.get("actionType")
                        params = msg.get("params", {})
                        if not action_id:
                            await ws.send(json.dumps({"ok": False, "error": "Missing actionId for exec_action"}))
                            continue
                        msg = {"type":"llm_instruction","data":{"actionId": action_id, **({"actionType": action_type} if action_type else {}), "params": params}}
                    elif shortcut_type == "set_value":
                        # Expect: actionId, value, optional submit
                        action_id = msg.get("actionId")
                        value = msg.get("value")
                        submit = msg.get("submit")
                        if not action_id or value is None:
                            await ws.send(json.dumps({"ok": False, "error": "Missing actionId or value for set_value"}))
                            continue
                        params = {"value": value}
                        if submit is not None:
                            params["submit"] = bool(submit)
                        msg = {"type":"llm_instruction","data":{"actionId": action_id, "actionType": "setValue", "params": params}}
                    elif shortcut_type == "click":
                        # Expect: actionId
                        action_id = msg.get("actionId")
                        if not action_id:
                            await ws.send(json.dumps({"ok": False, "error": "Missing actionId for click"}))
                            continue
                        msg = {"type":"llm_instruction","data":{"actionId": action_id, "actionType": "click", "params": {}}}
                    elif shortcut_type == "navigate_link":
                        # Expect: actionId (anchor)
                        action_id = msg.get("actionId")
                        if not action_id:
                            await ws.send(json.dumps({"ok": False, "error": "Missing actionId for navigate_link"}))
                            continue
                        msg = {"type":"llm_instruction","data":{"actionId": action_id, "actionType": "navigate", "params": {}}}
                    elif shortcut_type == "navigate_url":
                        # Expect: url, optional openInNewTab/replaceHistory
                        url = msg.get("url")
                        if not url:
                            await ws.send(json.dumps({"ok": False, "error": "Missing url for navigate_url"}))
                            continue
                        params = {"url": url}
                        if "openInNewTab" in msg:
                            params["openInNewTab"] = bool(msg.get("openInNewTab"))
                        if "replaceHistory" in msg:
                            params["replaceHistory"] = bool(msg.get("replaceHistory"))
                        # Convert to existing command form
                        msg = {"id": f"nav-{uuid.uuid4().hex[:8]}", "command": "navigate", "params": params}
                    print("🧭 Shortcut normalized →", msg.get("type") or msg.get("command"))
            except Exception as e:
                print(f"⚠️ Shortcut normalization error: {e}")
            
            # 💓 Heartbeat handling
            if msg.get("type") == "ping":
                source = msg.get("source", "client")
                print(f"💓 Ping received from {source}")
                try:
                    await ws.send(json.dumps({
                        "type": "pong",
                        "source": "server",
                        "timestamp": time.time()
                    }))
                except Exception as e:
                    print(f"❌ Failed to reply to ping: {e}")
                continue
            
            if msg.get("type") == "pong":
                print(f"💓 Pong received from {msg.get('source', 'client')}")
                continue

            # ⚙️ GET LLM CONFIG - Return FULL LLM settings (all providers)
            if msg.get("type") == "get_llm_config":
                print("⚙️ Get LLM config request")
                try:
                    config = load_llm_config()
                    # Mask API keys for security (show only last 4 chars)
                    safe_config = json.loads(json.dumps(config))  # Deep copy
                    for provider_key, provider in safe_config.get("providers", {}).items():
                        api_key = provider.get("api_key")
                        if api_key and not api_key.startswith("$") and len(api_key) > 8:
                            provider["api_key"] = f"***{api_key[-4:]}"

                    await ws.send(json.dumps({
                        "type": "llm_config",
                        "config": safe_config
                    }))
                except Exception as e:
                    print(f"❌ Error getting LLM config: {e}")
                continue

            # ⚙️ SET LLM CONFIG - Update LLM settings
            if msg.get("type") == "set_llm_config":
                print("⚙️ Set LLM config request")
                try:
                    new_config = msg.get("config", {})

                    # Load existing config and update
                    config = load_llm_config()
                    provider = new_config.get("provider", "lm_studio")

                    # Ensure providers dict exists
                    if "providers" not in config:
                        config["providers"] = {}
                    if provider not in config["providers"]:
                        config["providers"][provider] = {}

                    # Update provider config
                    config["active_provider"] = provider
                    config["providers"][provider]["endpoint"] = new_config.get("endpoint", "")
                    config["providers"][provider]["default_model"] = new_config.get("model", "")
                    if new_config.get("api_key"):
                        config["providers"][provider]["api_key"] = new_config.get("api_key")

                    # Update defaults
                    if "defaults" not in config:
                        config["defaults"] = {}
                    config["defaults"]["temperature"] = new_config.get("temperature", 0.7)
                    config["defaults"]["max_tokens"] = new_config.get("max_tokens", 2048)

                    # Save config (LLM client reloads config on each request)
                    if save_llm_config(config):
                        print("✅ LLM config updated")

                except Exception as e:
                    print(f"❌ Error setting LLM config: {e}")
                continue

            # 🎯 EXTENSION IDENTIFICATION: Mark clients sending bridge_status as extensions
            if msg.get("type") == "bridge_status":
                EXTENSION_WS = ws
                print("🎯 Marked as extension client (bridge_status)")
            
            # 📊 TAB INFORMATION STORAGE: Store latest tabs_info for external access
            if msg.get("type") == "tabs_info":
                import time as _t
                _recv_time = _t.time()
                global CURRENT_TABS_INFO, LAST_TABS_UPDATE
                CURRENT_TABS_INFO = msg.get("tabs", [])
                LAST_TABS_UPDATE = asyncio.get_event_loop().time()
                print(f"📊 [{_recv_time:.3f}] Tab info RECEIVED - {len(CURRENT_TABS_INFO)} tabs")
                # 🗂️ Update tabs section only (preserve action IDs)
                update_tabs_in_text_md()
                print(f"📊 [{_t.time():.3f}] Tab info WRITTEN to file (took {(_t.time()-_recv_time)*1000:.1f}ms)")
            
            # 🎯 ACTIVE TAB INFORMATION: Display active tab info in terminal
            if msg.get("type") == "active_tab_info":
                active_tab = msg.get("activeTab", {})
                tab_id = active_tab.get("id", "unknown")
                url = active_tab.get("url", "unknown")
                title = active_tab.get("title", "unknown")
                status = active_tab.get("status", "unknown")
                
                # Truncate long titles for better terminal display
                display_title = title[:80] + "..." if len(title) > 80 else title
                
                print(f"🎯 ACTIVE TAB: ID={tab_id} | URL={url} | Title={display_title} | Status={status}")
                
                # Also store this as the current active tab for getActiveTab command
                global CURRENT_ACTIVE_TAB
                CURRENT_ACTIVE_TAB = active_tab
            
            # 🧠 INTELLIGENCE MESSAGE HANDLING: Process intelligence updates from extension
            if msg.get("type") == "intelligence_update":
                print("🧠 Intelligence update received from extension")
                try:
                    # Extract intelligence data
                    intelligence_data = msg.get("data", {})
                    actionable_elements = intelligence_data.get("actionableElements", [])
                    recent_insights = intelligence_data.get("recentInsights", [])

                    print(f"🧠 Intelligence data: {len(actionable_elements)} actionable elements, {len(recent_insights)} insights")
                    print(f"🧠 DEBUG: intelligence_data keys: {list(intelligence_data.keys())}")
                    print(f"🧠 DEBUG: pageVersion in intelligence_data: {intelligence_data.get('pageVersion')}")

                    page_state = intelligence_data.get("pageState", {})
                    transcripts_payload = intelligence_data.get("transcripts") or []

                    # 🎯 PREMIUM: Capabilities are now resolved server-side from URL
                    # No need to store from extension - we resolve dynamically in generate_llm_prompt()
                    
                    # 🆕 NEW: Persist transcripts (YouTube etc.) before writing page artifacts
                    transcript_refs = await save_transcripts(transcripts_payload, page_state)
                    
                    # 🆕 NEW: Save to central page.jsonl file
                    await save_intelligence_to_page_jsonl(intelligence_data, transcript_refs)
                    
                    # 🆕 NEW: Save to central content.jsonl file
                    await save_content_to_content_jsonl(intelligence_data, transcript_refs)
                    
                    # 🆕 NEW: Auto-generate markdown file from semantic page text
                    try:
                        # 🔧 FIX: Get URL and title from root of intelligence_data (not pageState)
                        # We removed pageState to simplify, so metadata is at root level
                        page_url = intelligence_data.get('url', 'unknown')
                        page_title = intelligence_data.get('title', 'Unknown Page')

                        semantic_data = intelligence_data.get("semanticPageData", {})

                        # Fallback to plain text if semantic data not available
                        if semantic_data and semantic_data.get("text"):
                            page_text = semantic_data.get("text", "")
                            actionables = semantic_data.get("actionables", [])
                            print(f"✅ Using semantic text with {len(actionables)} tagged elements")

                            # 🎯 Populate ELEMENT_REGISTRY for action type resolution
                            global ELEMENT_REGISTRY
                            ELEMENT_REGISTRY = {}  # Clear on new page/update

                            # Track selector quality stats
                            selector_stats = {"with_selectors": 0, "total_selectors": 0, "by_type": {}}

                            for el in actionables:
                                el_id = el.get("id")
                                if el_id:
                                    selectors = el.get("selectors", [])
                                    ELEMENT_REGISTRY[el_id] = {
                                        "type": el.get("type"),      # Link, Button, Input, Select
                                        "tag": el.get("tag"),        # a, button, input, select
                                        "label": el.get("label"),    # Display text
                                        "href": el.get("href"),      # For links
                                        "selectors": selectors,      # 🆕 Robust selector array
                                    }

                                    # Stats tracking
                                    if selectors and len(selectors) > 0:
                                        selector_stats["with_selectors"] += 1
                                        selector_stats["total_selectors"] += len(selectors)
                                        # Count by first selector type
                                        first_sel = selectors[0] if selectors else ""
                                        if "aria-label" in first_sel:
                                            selector_stats["by_type"]["aria-label"] = selector_stats["by_type"].get("aria-label", 0) + 1
                                        elif first_sel.startswith("#"):
                                            selector_stats["by_type"]["id"] = selector_stats["by_type"].get("id", 0) + 1
                                        elif "[name=" in first_sel:
                                            selector_stats["by_type"]["name"] = selector_stats["by_type"].get("name", 0) + 1
                                        elif "[placeholder=" in first_sel:
                                            selector_stats["by_type"]["placeholder"] = selector_stats["by_type"].get("placeholder", 0) + 1
                                        else:
                                            selector_stats["by_type"]["other"] = selector_stats["by_type"].get("other", 0) + 1

                            print(f"🎯 Element registry updated: {len(ELEMENT_REGISTRY)} elements")
                            print(f"📊 Selector quality: {selector_stats['with_selectors']}/{len(ELEMENT_REGISTRY)} have selectors, avg {selector_stats['total_selectors']/max(1,len(ELEMENT_REGISTRY)):.1f} per element")
                            print(f"📊 Selector types: {selector_stats['by_type']}")

                            # No more a_id_* in logs (stable-only)
                            print("🔍 Sample selectors (first 5):")
                            for _i, (_el_id, el_data) in enumerate(list(ELEMENT_REGISTRY.items())[:5]):
                                sels = el_data.get("selectors", [])
                                kind = (el_data.get("type") or "Element")
                                label = (el_data.get("label") or "")[:30]
                                print(f"   {kind}:{label} → {sels[:3]}")
                        else:
                            page_text = intelligence_data.get("pageText", "")
                            print("⚠️ Semantic data not available, using plain text")

                        if page_text:
                            # 🔄 Store data for text.md regeneration (used when tabs change)
                            global LAST_TEXT_MD_DATA
                            # Prefer capabilities computed by the extension (can be DOM-aware via requires_selectors)
                            capabilities = intelligence_data.get('capabilities') or (resolve_capabilities_for_url(page_url) if page_url else [])
                            iframe_elements = [el for el in actionable_elements if el.get('isIframeElement')]
                            pending_iframe_count = intelligence_data.get('pendingIframeCount', 0)

                            # Register iframe elements
                            for el in iframe_elements:
                                action_id = el.get('actionId', 'unknown')
                                tag = el.get('tag', 'input')
                                text = el.get('text') or el.get('label') or el.get('placeholder') or 'Unnamed'
                                reg_type = "Button" if tag == 'button' else ("Select" if tag == 'select' else "Input")
                                ELEMENT_REGISTRY[action_id] = {"type": reg_type, "tag": tag, "label": text, "href": None, "iframe": True}

                            LAST_TEXT_MD_DATA = {
                                'title': page_title,
                                'url': page_url,
                                'page_text': page_text,
                                'capabilities': capabilities,
                                'iframe_elements': iframe_elements,
                                'pending_iframes': pending_iframe_count
                            }

                            # Write text.md using the helper function
                            if write_text_md():
                                print("✅ Text content saved to text.md")
                            else:
                                print("⚠️ Failed to write text.md")
                        else:
                            print("⚠️ No page text available for markdown generation")

                    except Exception as e:
                        print(f"⚠️ Error during automatic markdown generation: {e}")
                    
                    # 🚫 DISABLED: Old actionable elements processing (conflicts with semantic extraction)
                    # # 🆕 NEW: Process actionable elements for LLM consumption
                    # # This ensures llm_actions.json is always aligned with current page
                    # await process_actionable_elements_for_llm(actionable_elements)

                    # 🚫 DISABLED: Old llm_prompt.md generation (replaced by semantic text.md)
                    # # 🆕 NEW: Generate compact llm_prompt.md (omit URLs in action lines)
                    # try:
                    #     page_path = os.path.join(SITE_STRUCTURES_DIR, CURRENT_PAGE_JSONL)
                    #     text_path = os.path.join(SITE_STRUCTURES_DIR, "text.md")
                    #     prompt_out = os.path.join(SITE_STRUCTURES_DIR, "llm_prompt.md")
                    #     generated = generate_llm_prompt(text_path, page_path, prompt_out)
                    #     if generated:
                    #         print(f"✅ LLM prompt generated at: {generated}")
                    #     else:
                    #         print("⚠️ LLM prompt generation returned no output")
                    # except Exception as gen_err:
                    #     print(f"⚠️ Error generating llm_prompt.md: {gen_err}")

                    print("✅ Intelligence update processed and saved (page + content + markdown)")

                    # 🎯 PHASE B: Nuclear option - Hunt for transcript button on YouTube video pages
                    try:
                        current_url = page_state.get("url", "")
                        if "/watch?v=" in current_url and "youtube.com" in current_url:
                            print("🎯 YouTube video page detected - triggering transcript button hunter...")

                            # Send command to extension to find and register transcript button
                            hunt_command = {
                                "type": "youtube_find_transcript_button",
                                "url": current_url
                            }

                            if EXTENSION_WS:
                                await EXTENSION_WS.send(json.dumps(hunt_command))
                                print("📤 Sent transcript button hunt command to extension")
                            else:
                                print("⚠️ No extension WebSocket available to send hunt command")

                    except Exception as hunt_err:
                        print(f"⚠️ Error triggering transcript button hunt: {hunt_err}")

                except Exception as e:
                    print(f"❌ Error processing intelligence update: {e}")
                    import traceback
                    traceback.print_exc()

            # 🌳 AT INTELLIGENCE UPDATE: Accessibility Tree scan results
            if msg.get("type") == "at_intelligence_update":
                print("🌳 AT Intelligence update received")
                try:
                    at_data = msg.get("data", {})

                    title = at_data.get("title", "Unknown")
                    url = at_data.get("url", "")
                    node_count = at_data.get("nodeCount", 0)
                    scan_time = at_data.get("scanTimeMs", 0)
                    trigger = at_data.get("trigger", "unknown")
                    markdown = at_data.get("markdown", "")
                    registry = at_data.get("registry", [])

                    print(f"🌳 AT: {node_count} nodes in {scan_time}ms (trigger: {trigger})")
                    print(f"🌳 AT: Title='{title}', URL='{url}'")

                    # Write AT_text.md
                    at_text_path = os.path.join("@site_structures", "AT_text.md")

                    if markdown:
                        with open(at_text_path, 'w', encoding='utf-8') as f:
                            f.write(markdown)
                        print(f"✅ AT_text.md written ({len(markdown)} chars)")
                    else:
                        print("⚠️ No markdown in AT update")

                    # 🎯 Populate AT_ELEMENT_REGISTRY (same pattern as ELEMENT_REGISTRY)
                    global AT_ELEMENT_REGISTRY
                    AT_ELEMENT_REGISTRY = {}
                    for el in registry:
                        el_id = el.get("id")
                        if el_id is not None:
                            AT_ELEMENT_REGISTRY[el_id] = {
                                "ref": el.get("ref"),       # CDP backendNodeId
                                "role": el.get("role"),     # button, link, textbox, etc.
                                "name": el.get("name"),     # Accessible name
                                "value": el.get("value"),   # Current value (for inputs)
                                "states": el.get("states", {})
                            }
                    print(f"🎯 AT Element registry updated: {len(AT_ELEMENT_REGISTRY)} elements")

                except Exception as e:
                    print(f"❌ Error processing AT intelligence update: {e}")
                    import traceback
                    traceback.print_exc()

            # 🚀 PROGRESSIVE: IFRAME ELEMENTS UPDATE - Append iframe elements to text.md
            if msg.get("type") == "iframe_elements_update":
                print("🖼️ Iframe elements update received")
                try:
                    iframe_elements = msg.get("iframeElements", [])
                    iframe_count = msg.get("iframeCount", 0)

                    if not iframe_elements:
                        print("🖼️ No iframe elements in update")
                        continue

                    print(f"🖼️ Received {iframe_count} iframe elements, updating text.md...")

                    # Read existing text.md
                    text_file_path = os.path.join("@site_structures", "text.md")

                    if not os.path.exists(text_file_path):
                        print("⚠️ text.md doesn't exist yet, skipping iframe update")
                        continue

                    with open(text_file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()

                    # Build iframe section
                    iframe_section = "\n\n---\n\n## Secure Iframe Elements\n\n"
                    iframe_section += "*These elements are inside secure cross-origin iframes (e.g., payment forms):*\n\n"

                    for el in iframe_elements:
                        action_id = el.get('actionId', 'unknown')
                        tag = el.get('tag', 'input')
                        text = el.get('text') or el.get('label') or el.get('placeholder') or el.get('name') or 'Unnamed'

                        # Format using Option B style with JSON hints (iframe elements)
                        if tag == 'button':
                            iframe_section += f"Button: {text} [iframe] → {{\"act\": \"{action_id}\"}}\n"
                            reg_type = "Button"
                        elif tag == 'select':
                            iframe_section += f"Select: {text} [iframe] → {{\"act\": \"{action_id}\", \"value\": \"option\"}}\n"
                            reg_type = "Select"
                        else:
                            iframe_section += f"Input: {text} [iframe] → {{\"act\": \"{action_id}\", \"value\": \"...\", \"submit\": true}}\n"
                            reg_type = "Input"

                        # 🎯 Add iframe element to registry
                        ELEMENT_REGISTRY[action_id] = {
                            "type": reg_type,
                            "tag": tag,
                            "label": text,
                            "href": None,
                            "iframe": True,
                        }

                    print(f"🎯 Added {len(iframe_elements)} iframe elements to registry")

                    # Check if there's a placeholder to replace
                    placeholder_marker = "## Secure Iframe Elements"
                    if placeholder_marker in content:
                        # Find and replace the entire section (from marker to end or next major section)
                        import re
                        # Match from "## Secure Iframe Elements" to next "---" or "##" or end
                        pattern = r'\n\n---\n\n## Secure Iframe Elements\n\n.*?(?=\n\n---\n\n## |\n\n---\n\n#|\Z)'
                        content = re.sub(pattern, iframe_section, content, flags=re.DOTALL)
                        print("🖼️ Replaced placeholder with actual iframe elements")
                    else:
                        # No placeholder - append to end
                        content += iframe_section
                        print("🖼️ Appended iframe elements to text.md")

                    # Write updated content
                    with open(text_file_path, 'w', encoding='utf-8', errors='ignore') as f:
                        f.write(content)

                    print(f"✅ Updated text.md with {iframe_count} iframe elements")

                except Exception as e:
                    print(f"❌ Error processing iframe elements update: {e}")
                    import traceback
                    traceback.print_exc()

            # 🎯 PREMIUM: CAPABILITY EXECUTION - Route to handlers
            if msg.get("type") == "execute_capability":
                print("🎯 Capability execution request received")
                try:
                    action = msg.get("action")
                    params = msg.get("params", {})
                    request_id = msg.get("id")  # 🔧 Capture request ID for response matching

                    if not action:
                        await ws.send(json.dumps({"ok": False, "error": "Missing capability action"}))
                        continue

                    print(f"🎯 Executing capability: {action}")

                    # 📜 SCROLL CAPABILITIES: Route scroll actions to scroll handler
                    scroll_actions = {
                        'ScrollDown': 'down',
                        'ScrollUp': 'up',
                        'ScrollLeft': 'left',
                        'ScrollRight': 'right',
                        'ScrollTop': 'top',
                        'ScrollBottom': 'bottom'
                    }

                    if action in scroll_actions:
                        direction = scroll_actions[action]
                        print(f"📜 Routing scroll capability: {action} -> direction={direction}")

                        if EXTENSION_WS:
                            scroll_command = {
                                "command": "scroll",
                                "id": f"scroll_{int(time.time() * 1000)}",
                                "params": {"direction": direction}
                            }
                            await EXTENSION_WS.send(json.dumps(scroll_command))
                            print(f"📤 Sent scroll command to extension: direction={direction}")

                            await ws.send(json.dumps({
                                "ok": True,
                                "message": f"Scroll {direction} initiated"
                            }))
                        else:
                            await ws.send(json.dumps({
                                "ok": False,
                                "error": "Extension not connected"
                            }))
                        continue

                    # 🧭 NAV CAPABILITIES: Route to service worker (uses chrome.tabs API)
                    nav_actions = ['GoBack', 'GoForward', 'Refresh']

                    if action in nav_actions:
                        print(f"🧭 Routing nav capability: {action}")

                        if EXTENSION_WS:
                            await EXTENSION_WS.send(json.dumps({
                                "type": "execute_capability",
                                "id": f"nav_{int(time.time() * 1000)}",
                                "action": action,
                                "params": params or {}
                            }))
                            print(f"📤 Sent nav capability to extension: {action}")

                            await ws.send(json.dumps({
                                "ok": True,
                                "message": f"Navigation {action} initiated"
                            }))
                        else:
                            await ws.send(json.dumps({
                                "ok": False,
                                "error": "Extension not connected"
                            }))
                        continue

                    # 🤖 LLM CHAT: Special async handler for LLM conversations
                    if action == "LLMChat":
                        global LLM_AGENT, CURRENT_CHAT_ID, VISIBLE_CHATS
                        message = params.get("message", "")
                        # chat_id from params is reserved for future use
                        _ = params.get("chat_id")
                        clear_history = params.get("clear_history", False)
                        hud_state = params.get("hud_state")  # 📚 {sidebar_open, visible_chats}

                        # 📚 Store visible chats for number → chat_id resolution
                        if hud_state and hud_state.get("visible_chats"):
                            VISIBLE_CHATS = hud_state["visible_chats"]
                            print(f"📚 Stored {len(VISIBLE_CHATS)} visible chats for reference")
                        else:
                            VISIBLE_CHATS = []

                        if not message:
                            await ws.send(json.dumps({
                                "type": "capability_result",
                                "action": action,
                                "ok": False,
                                "error": "Missing message parameter",
                                "id": request_id
                            }))
                            continue

                        # 🧹 INGESTION: Dedup and handle large payloads
                        ingestion_result = await preprocess_message(
                            chat_id=CURRENT_CHAT_ID or "default",
                            content=message
                        )

                        if ingestion_result.get("is_dup"):
                            print(f"🧹 Ingestion: Duplicate message ignored")
                            await ws.send(json.dumps({
                                "type": "capability_result",
                                "action": action,
                                "ok": True,
                                "result": {"ignored": True, "reason": "duplicate"},
                                "id": request_id
                            }))
                            continue

                        if ingestion_result.get("is_large"):
                            print(f"🧹 Ingestion: Large payload detected, using summary")
                            print(f"   Summary: {ingestion_result.get('summary', '')[:100]}...")
                            # Use summary reference instead of raw content
                            message = ingestion_result.get("content", message)

                        # 🎭 ORCHESTRATOR: Two-role LLM architecture (Role A + Role B)
                        if USE_ORCHESTRATOR:
                            global PERSONA_ORCHESTRATOR

                            # Create orchestrator if needed
                            if PERSONA_ORCHESTRATOR is None:
                                PERSONA_ORCHESTRATOR = PersonaOrchestrator()
                                print("🎭 Created new PersonaOrchestrator")

                            try:
                                # 🚀 Single-call unified or two-call legacy
                                if USE_UNIFIED_PROMPT:
                                    print("🚀 Unified: Processing message (single call)...")
                                    orch_result = await PERSONA_ORCHESTRATOR.process_message_unified(
                                        user_message=message,
                                        chat_id=CURRENT_CHAT_ID,
                                        active_tab=CURRENT_ACTIVE_TAB,
                                        tabs=get_tabs_with_stable_numbers(),
                                        orb_theme=CURRENT_ORB_THEME,
                                        visible_chats=VISIBLE_CHATS if VISIBLE_CHATS else None
                                    )
                                else:
                                    print("🎭 Orchestrator: Processing message (two calls)...")
                                    orch_result = await PERSONA_ORCHESTRATOR.process_message(
                                        user_message=message,
                                        chat_id=CURRENT_CHAT_ID,
                                        active_tab=CURRENT_ACTIVE_TAB,
                                        tabs=get_tabs_with_stable_numbers(),
                                        orb_theme=CURRENT_ORB_THEME,
                                        visible_chats=VISIBLE_CHATS if VISIBLE_CHATS else None
                                    )

                                response_text = orch_result.response_text
                                capability_results = []

                                # Save response to chat history
                                new_message = None
                                if CURRENT_CHAT_ID:
                                    chat_dict = load_chat(CURRENT_CHAT_ID)
                                    if chat_dict:
                                        new_message = append_assistant_message(chat_dict, response_text)
                                        save_chat(chat_dict)
                                        print(f"🎭 Orchestrator: Saved to chat {CURRENT_CHAT_ID}")

                                # Push response to HUD
                                if new_message and EXTENSION_WS:
                                    await EXTENSION_WS.send(json.dumps({
                                        "type": "hud_action",
                                        "action": {
                                            "type": "append_message",
                                            "chat_id": CURRENT_CHAT_ID,
                                            "message": new_message
                                        }
                                    }))
                                    print("🎭 Orchestrator: Pushed response to HUD")

                                # Execute action if orchestrator says so
                                if orch_result.action_executed and orch_result.action_type == "cap":
                                    cap_action = orch_result.action_target
                                    # Use params from orchestrator (LLM-extracted), fallback to value
                                    cap_params = orch_result.action_params or {}
                                    if not cap_params and orch_result.action_value:
                                        cap_params["value"] = orch_result.action_value

                                    print(f"🎭 Orchestrator: Executing capability {cap_action}")

                                    # Use existing capability routing
                                    scroll_actions = {
                                        'ScrollDown': 'down', 'ScrollUp': 'up',
                                        'ScrollLeft': 'left', 'ScrollRight': 'right',
                                        'ScrollTop': 'top', 'ScrollBottom': 'bottom'
                                    }
                                    zoom_actions = ['ZoomIn', 'ZoomOut', 'ZoomReset', 'ResetZoom']
                                    tab_actions = ['SwitchTab', 'OpenTab', 'CloseTab', 'UpdateTabURL']
                                    nav_actions = ['GoBack', 'GoForward', 'Refresh']

                                    cap_result = {"ok": False, "error": "Unknown capability"}

                                    if cap_action in scroll_actions and EXTENSION_WS:
                                        direction = scroll_actions[cap_action]
                                        await EXTENSION_WS.send(json.dumps({
                                            "command": "scroll",
                                            "id": f"scroll_{int(time.time() * 1000)}",
                                            "params": {"direction": direction}
                                        }))
                                        cap_result = {"ok": True}
                                        print(f"🎭 Sent scroll {direction}")

                                    elif cap_action in zoom_actions and EXTENSION_WS:
                                        await EXTENSION_WS.send(json.dumps({
                                            "type": "execute_capability",
                                            "action": cap_action,
                                            "params": cap_params
                                        }))
                                        cap_result = {"ok": True}
                                        print(f"🎭 Sent {cap_action}")

                                    elif cap_action in tab_actions and EXTENSION_WS:
                                        # 🧠 SMART TAB LOGIC: OpenTab auto-switches if tab exists
                                        final_action = cap_action
                                        final_params = cap_params

                                        if cap_action == "OpenTab":
                                            # Check if we have a URL - if not, use default landing page
                                            url_or_name = cap_params.get("url") or cap_params.get("name", "")
                                            if not url_or_name:
                                                # No URL - use default landing page (never open blank tabs)
                                                url_or_name = DEFAULT_LANDING_PAGE
                                                final_params["url"] = DEFAULT_LANDING_PAGE
                                                print(f"🏠 OpenTab: No URL provided, using default: {DEFAULT_LANDING_PAGE}")

                                            # 🔗 Normalize URL: ensure protocol prefix
                                            # Without protocol, Chrome treats it as relative to extension
                                            if url_or_name and not url_or_name.startswith(("http://", "https://", "chrome://", "chrome-extension://")):
                                                url_or_name = f"https://{url_or_name}"
                                                final_params["url"] = url_or_name
                                                print(f"🔗 OpenTab: Added https:// to URL: {url_or_name}")

                                            # Check if we should switch instead of open
                                            existing_tab = find_matching_tab(url_or_name)
                                            if existing_tab:
                                                # Tab exists - switch to it instead
                                                print(f"🧠 [SMART-TAB] OpenTab→SwitchTab: Found existing tab {existing_tab['stable_num']}")
                                                final_action = "SwitchTab"
                                                final_params = {"tabId": existing_tab["id"]}

                                        translated_params, tab_error = translate_tab_params(final_params)
                                        if tab_error:
                                            cap_result = {"ok": False, "error": tab_error}
                                        else:
                                            await EXTENSION_WS.send(json.dumps({
                                                "type": "execute_capability",
                                                "id": f"cap_{final_action}_{int(time.time() * 1000)}",
                                                "action": final_action,
                                                "params": translated_params
                                            }))
                                            cap_result = {"ok": True}
                                            print(f"🎭 Sent {final_action}")

                                    elif cap_action == "GoogleIt" and EXTENSION_WS:
                                        # 🔍 GoogleIt: construct URL and open in new tab
                                        import urllib.parse
                                        query = cap_params.get("query", "")
                                        if query:
                                            search_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(query)}"
                                            print(f"🔍 GoogleIt: '{query}' → {search_url}")

                                            # Check if Google search tab already exists - switch to it
                                            existing_tab = find_matching_tab("google.com/search")
                                            if existing_tab:
                                                # Update existing Google tab with new search
                                                await EXTENSION_WS.send(json.dumps({
                                                    "type": "execute_capability",
                                                    "id": f"cap_UpdateTabURL_{int(time.time() * 1000)}",
                                                    "action": "UpdateTabURL",
                                                    "params": {"tabId": existing_tab["id"], "url": search_url}
                                                }))
                                                print(f"🔍 GoogleIt: Updated existing tab {existing_tab['stable_num']}")
                                            else:
                                                # Open new tab with search
                                                await EXTENSION_WS.send(json.dumps({
                                                    "type": "execute_capability",
                                                    "id": f"cap_OpenTab_{int(time.time() * 1000)}",
                                                    "action": "OpenTab",
                                                    "params": {"url": search_url}
                                                }))
                                                print(f"🔍 GoogleIt: Opened new tab")
                                            cap_result = {"ok": True, "url": search_url}
                                        else:
                                            cap_result = {"ok": False, "error": "No query provided"}

                                    elif cap_action == "YouTubeIt" and EXTENSION_WS:
                                        # 🎬 YouTubeIt: construct URL and open in new tab
                                        import urllib.parse
                                        query = cap_params.get("query", "")
                                        if query:
                                            search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote_plus(query)}"
                                            print(f"🎬 YouTubeIt: '{query}' → {search_url}")

                                            # Check if YouTube search tab already exists - switch to it
                                            existing_tab = find_matching_tab("youtube.com/results")
                                            if existing_tab:
                                                # Update existing YouTube tab with new search
                                                await EXTENSION_WS.send(json.dumps({
                                                    "type": "execute_capability",
                                                    "id": f"cap_UpdateTabURL_{int(time.time() * 1000)}",
                                                    "action": "UpdateTabURL",
                                                    "params": {"tabId": existing_tab["id"], "url": search_url}
                                                }))
                                                print(f"🎬 YouTubeIt: Updated existing tab {existing_tab['stable_num']}")
                                            else:
                                                # Open new tab with search
                                                await EXTENSION_WS.send(json.dumps({
                                                    "type": "execute_capability",
                                                    "id": f"cap_OpenTab_{int(time.time() * 1000)}",
                                                    "action": "OpenTab",
                                                    "params": {"url": search_url}
                                                }))
                                                print(f"🎬 YouTubeIt: Opened new tab")
                                            cap_result = {"ok": True, "url": search_url}
                                        else:
                                            cap_result = {"ok": False, "error": "No query provided"}

                                    elif cap_action in nav_actions and EXTENSION_WS:
                                        await EXTENSION_WS.send(json.dumps({
                                            "type": "execute_capability",
                                            "id": f"nav_{int(time.time() * 1000)}",
                                            "action": cap_action,
                                            "params": cap_params
                                        }))
                                        cap_result = {"ok": True}
                                        print(f"🎭 Sent nav {cap_action}")

                                    elif is_site_config_capability(cap_action) and EXTENSION_WS:
                                        await EXTENSION_WS.send(json.dumps({
                                            "type": "execute_capability",
                                            "id": f"cap_{cap_action}_{int(time.time() * 1000)}",
                                            "action": cap_action,
                                            "params": cap_params
                                        }))
                                        cap_result = {"ok": True}
                                        print(f"🎭 Sent site capability {cap_action}")

                                    else:
                                        # Internal capability
                                        cap_result = execute_internal_capability(cap_action, cap_params)

                                        # 🔄 Handle needs_input: capability asking for missing param
                                        if isinstance(cap_result, dict) and cap_result.get("needs_input"):
                                            # Store pending state in orchestrator
                                            PERSONA_ORCHESTRATOR.state.pending_param_input = {
                                                "capability": cap_result.get("capability", cap_action),
                                                "param": cap_result.get("param", ""),
                                                "prompt": cap_result.get("prompt", "Please provide the required input.")
                                            }
                                            # Override response with prompt
                                            prompt_msg = cap_result.get("prompt", "What would you like to provide?")
                                            # Send prompt to user
                                            if CURRENT_CHAT_ID:
                                                chat_dict = load_chat(CURRENT_CHAT_ID)
                                                if chat_dict:
                                                    append_assistant_message(chat_dict, prompt_msg)
                                                    save_chat(chat_dict)
                                            if EXTENSION_WS:
                                                await EXTENSION_WS.send(json.dumps({
                                                    "type": "hud_action",
                                                    "action": {
                                                        "type": "append_message",
                                                        "chat_id": CURRENT_CHAT_ID,
                                                        "message": {"role": "assistant", "content": prompt_msg}
                                                    }
                                                }))
                                            print(f"🔄 needs_input: waiting for {cap_result.get('param')}")
                                            # Skip normal result handling
                                            continue

                                        # 🎯 Handle invalid_param: present options to user
                                        if isinstance(cap_result, dict) and cap_result.get("error") == "invalid_param":
                                            valid_options = cap_result.get("valid_options", [])
                                            invalid_value = cap_result.get("invalid_value", "")
                                            message = cap_result.get("message", "Please choose an option:")

                                            # Build options response
                                            options_msg = f"{message}\n"
                                            for i, opt in enumerate(valid_options, 1):
                                                options_msg += f"\n{i}. {opt.get('label', opt.get('value'))}"

                                            # Store pending options for next user input
                                            PERSONA_ORCHESTRATOR.state.pending_options = {
                                                "capability": cap_action,
                                                "param": cap_result.get("param"),
                                                "options": valid_options
                                            }

                                            # Send options to user
                                            if CURRENT_CHAT_ID:
                                                chat_dict = load_chat(CURRENT_CHAT_ID)
                                                if chat_dict:
                                                    append_assistant_message(chat_dict, options_msg)
                                                    save_chat(chat_dict)
                                            if EXTENSION_WS:
                                                await EXTENSION_WS.send(json.dumps({
                                                    "type": "hud_action",
                                                    "action": {
                                                        "type": "append_message",
                                                        "chat_id": CURRENT_CHAT_ID,
                                                        "message": {"role": "assistant", "content": options_msg}
                                                    }
                                                }))
                                            print(f"🎯 invalid_param: presenting {len(valid_options)} options for {cap_result.get('param')}")
                                            continue

                                        # 🛡️ Handle validation errors: unknown capability or missing params
                                        if isinstance(cap_result, dict) and cap_result.get("error") in ("unknown_capability", "missing_required_params"):
                                            error_type = cap_result.get("error")
                                            clarify_msg = cap_result.get("message", "I need more information to help you.")

                                            # For missing params, include what's needed
                                            if error_type == "missing_required_params":
                                                missing = cap_result.get("missing_params", [])
                                                if missing:
                                                    param_hints = ", ".join([f"{p['name']} ({p['description'][:40]}...)" if len(p.get('description', '')) > 40 else f"{p['name']} ({p.get('description', '')})" for p in missing])
                                                    clarify_msg = f"I need: {param_hints}"

                                            # Send clarification to user
                                            if CURRENT_CHAT_ID:
                                                chat_dict = load_chat(CURRENT_CHAT_ID)
                                                if chat_dict:
                                                    append_assistant_message(chat_dict, clarify_msg)
                                                    save_chat(chat_dict)
                                            if EXTENSION_WS:
                                                await EXTENSION_WS.send(json.dumps({
                                                    "type": "hud_action",
                                                    "action": {
                                                        "type": "append_message",
                                                        "chat_id": CURRENT_CHAT_ID,
                                                        "message": {"role": "assistant", "content": clarify_msg}
                                                    }
                                                }))
                                            print(f"🛡️ validation error ({error_type}): {clarify_msg}")
                                            continue

                                        # Push HUD action to extension if capability wants to drive UI
                                        hud_action = cap_result.get("_hud_action") if isinstance(cap_result, dict) else None
                                        if hud_action and EXTENSION_WS:
                                            hud_msg = {
                                                "type": "hud_action",
                                                "action": hud_action
                                            }
                                            await EXTENSION_WS.send(json.dumps(hud_msg))
                                            print(f"🎛️ Pushed hud_action: {hud_action.get('type')}")

                                    add_action_to_history(cap_action, cap_params, cap_result)
                                    capability_results.append({
                                        "action": cap_action,
                                        "params": cap_params,
                                        "result": cap_result
                                    })

                                # Handle element actions
                                elif orch_result.action_executed and orch_result.action_type == "act":
                                    act_ref = orch_result.action_target
                                    value = orch_result.action_value
                                    print(f"🎭 Orchestrator: Element action on {act_ref}")

                                    if EXTENSION_WS and act_ref:
                                        has_value = value is not None
                                        action_type = resolve_action_type(act_ref, has_value=has_value)
                                        hints = resolve_hints_for_act(str(act_ref), action_type=action_type)

                                        if hints:
                                            instruction = {
                                                "type": "execute_action_with_hints",
                                                "data": {
                                                    "actionId": act_ref,
                                                    "actionType": action_type,
                                                    "params": {"value": value},
                                                    "hints": hints
                                                }
                                            }
                                        else:
                                            instruction = {
                                                "type": "execute_llm_action",
                                                "data": {
                                                    "actionId": act_ref,
                                                    "actionType": action_type,
                                                    "params": {"value": value}
                                                }
                                            }
                                        await EXTENSION_WS.send(json.dumps(instruction))
                                        add_action_to_history(f"Element:{action_type}", {"action_id": act_ref, "value": value}, {"ok": True})

                                result = {
                                    "response": response_text,
                                    "chat_id": CURRENT_CHAT_ID,
                                    "message": new_message,
                                    "capability_results": capability_results,
                                    "action_type": orch_result.action_type,
                                    "action_target": orch_result.action_target,
                                    "turn_state": orch_result.turn_state.value
                                }

                                await ws.send(json.dumps({
                                    "type": "capability_result",
                                    "action": action,
                                    "ok": True,
                                    "result": result,
                                    "id": request_id
                                }))
                                continue  # Done with orchestrator path

                            except Exception as e:
                                print(f"🎭 Orchestrator error: {e}")
                                import traceback
                                traceback.print_exc()
                                await ws.send(json.dumps({
                                    "type": "capability_result",
                                    "action": action,
                                    "ok": False,
                                    "error": f"Orchestrator error: {str(e)}",
                                    "id": request_id
                                }))
                                continue

                    # 🔧 INTERNAL CAPABILITIES: Handle server-side capabilities directly
                    internal_caps = load_internal_capabilities()
                    if action in internal_caps:
                        print(f"🔧 Routing internal capability: {action}")
                        result = execute_internal_capability(action, params)
                        # Check if result contains an error
                        has_error = isinstance(result, dict) and "error" in result

                        # 🎛️ Push HUD action to extension if capability wants to drive UI
                        hud_action = result.get("_hud_action") if isinstance(result, dict) else None
                        if hud_action and EXTENSION_WS:
                            hud_msg = {
                                "type": "hud_action",
                                "action": hud_action
                            }
                            await EXTENSION_WS.send(json.dumps(hud_msg))
                            print(f"🎛️ Pushed hud_action: {hud_action.get('type')}")
                            # Remove internal flag from result
                            if "_hud_action" in result:
                                del result["_hud_action"]

                        response = {
                            "type": "capability_result",
                            "action": action,
                            "ok": not has_error,
                            "result": result if not has_error else None,
                            "error": result.get("error") if has_error else None
                        }
                        # 🔧 Echo back request ID for callback matching (HUD frontend needs this)
                        if request_id:
                            response["id"] = request_id
                        await ws.send(json.dumps(response))
                        continue

                    # 🎯 UNIFIED CAPABILITY ROUTING: All capabilities go through execute_capability
                    # Smart dispatcher in sw.js handles routing:
                    # - Tab capabilities (SwitchTab, OpenTab, etc.) → service worker handlers
                    # - DOM capabilities (RetrieveTranscript, etc.) → content script

                    if EXTENSION_WS:
                        # Generate unique request ID for response matching
                        request_id = f"cap_{action}_{int(time.time() * 1000)}"

                        # 🔢 Translate tab numbers for tab capabilities
                        tab_actions = ['SwitchTab', 'OpenTab', 'CloseTab', 'UpdateTabURL']
                        final_action = action
                        final_params = params

                        # 🧠 SMART TAB LOGIC: OpenTab auto-switches if tab exists
                        if action == "OpenTab":
                            url_or_name = params.get("url") or params.get("name", "")
                            if url_or_name:
                                existing_tab = find_matching_tab(url_or_name)
                                if existing_tab:
                                    print(f"🧠 [SMART-TAB] OpenTab→SwitchTab: Found existing tab {existing_tab['stable_num']}")
                                    final_action = "SwitchTab"
                                    final_params = {"tabId": existing_tab["id"]}

                        translated_params = final_params
                        if final_action in tab_actions:
                            translated_params, tab_error = translate_tab_params(final_params)
                            if tab_error:
                                await ws.send(json.dumps({"ok": False, "error": tab_error}))
                                continue

                        capability_command = {
                            "type": "execute_capability",
                            "id": request_id,
                            "action": final_action,
                            "params": translated_params
                        }

                        # Store client for response routing
                        COMMAND_CLIENTS[request_id] = ws
                        print(f"📋 Stored client for response routing: {request_id}")

                        await EXTENSION_WS.send(json.dumps(capability_command))
                        print(f"📤 Sent capability execution to extension: {action} (id: {request_id})")

                        # Response will be routed back via COMMAND_CLIENTS when extension responds
                        # No immediate response - wait for actual result from extension

                    else:
                        await ws.send(json.dumps({
                            "ok": False,
                            "error": "Extension not connected"
                        }))

                except Exception as e:
                    print(f"❌ Error executing capability: {e}")
                    await ws.send(json.dumps({"ok": False, "error": str(e)}))

            # 📜 SCROLL: Page-by-page viewport scrolling
            if msg.get("type") == "execute_scroll":
                print("📜 Scroll request received")
                try:
                    direction = msg.get("direction", "down")
                    print(f"📜 Scrolling: direction={direction}")

                    if EXTENSION_WS:
                        scroll_command = {
                            "command": "scroll",
                            "id": f"scroll_{int(time.time() * 1000)}",
                            "params": {"direction": direction}
                        }
                        await EXTENSION_WS.send(json.dumps(scroll_command))
                        print(f"📤 Sent scroll command to extension: direction={direction}")

                        # Send immediate acknowledgement
                        await ws.send(json.dumps({
                            "ok": True,
                            "message": f"Scroll {direction} initiated"
                        }))
                    else:
                        await ws.send(json.dumps({
                            "ok": False,
                            "error": "Extension not connected"
                        }))

                except Exception as e:
                    print(f"❌ Error executing scroll: {e}")
                    await ws.send(json.dumps({"ok": False, "error": str(e)}))

            # 🌐 WEB DASHBOARD: Identify as web dashboard client
            if msg.get("type") == "identify" and msg.get("client") == "web_dashboard":
                print("🌐 Web dashboard client connected")
                WEB_DASHBOARD_CLIENTS.add(ws)
                continue

            # 🌐 WEB DASHBOARD: Get extension status
            if msg.get("type") == "getStatus":
                print("📊 Status request from web dashboard")
                try:
                    # Build status from server state
                    # Note: CURRENT_TABS_INFO is a list (not a dict with "tabs" key)
                    tabs = CURRENT_TABS_INFO if CURRENT_TABS_INFO else []
                    status = {
                        "isConnected": EXTENSION_WS is not None,
                        "totalTabs": len(tabs),
                        "tabsWithFreshScripts": 0,
                        "tabsNeedingFreshScan": 0,
                        "totalDomChanges": 0,
                        "recentDomChanges": 0,
                        "recentChanges": "Status via server"
                    }

                    # Try to get more detailed info from extension
                    if tabs:
                        status["totalTabs"] = len(tabs)
                        # Count tabs with content scripts
                        status["tabsWithFreshScripts"] = len([t for t in tabs if t.get("hasContentScript")])

                    response = {
                        "ok": True,
                        "result": status
                    }
                    if msg.get("_requestId"):
                        response["_requestId"] = msg["_requestId"]
                    await ws.send(json.dumps(response))
                except Exception as e:
                    print(f"❌ Error getting status: {e}")
                    response = {"ok": False, "error": str(e)}
                    if msg.get("_requestId"):
                        response["_requestId"] = msg["_requestId"]
                    await ws.send(json.dumps(response))

            # 🌐 WEB DASHBOARD: Get current orb state
            if msg.get("type") == "get_orb_state":
                print("🎨 Get orb state request")
                response = {
                    "ok": True,
                    "theme": CURRENT_ORB_THEME
                }
                if msg.get("_requestId"):
                    response["_requestId"] = msg["_requestId"]
                await ws.send(json.dumps(response))

            # 🎛️ HUD: Toggle overlay interface
            if msg.get("type") == "toggle_hud":
                print("🎛️ HUD toggle request received")
                try:
                    if EXTENSION_WS:
                        hud_command = {
                            "type": "toggle_hud",
                            "id": f"hud_{int(time.time() * 1000)}"
                        }
                        await EXTENSION_WS.send(json.dumps(hud_command))
                        print("📤 Sent HUD toggle command to extension")

                        response = {
                            "ok": True,
                            "message": "HUD toggle initiated"
                        }
                        if msg.get("_requestId"):
                            response["_requestId"] = msg["_requestId"]
                        await ws.send(json.dumps(response))

                        # Broadcast HUD toggle to other web dashboard clients
                        await broadcast_to_web_dashboards({
                            "type": "hud_toggled",
                            "visible": True  # We don't know actual state, just that it toggled
                        }, exclude_ws=ws)
                    else:
                        response = {
                            "ok": False,
                            "error": "Extension not connected"
                        }
                        if msg.get("_requestId"):
                            response["_requestId"] = msg["_requestId"]
                        await ws.send(json.dumps(response))

                except Exception as e:
                    print(f"❌ Error toggling HUD: {e}")
                    response = {"ok": False, "error": str(e)}
                    if msg.get("_requestId"):
                        response["_requestId"] = msg["_requestId"]
                    await ws.send(json.dumps(response))

            # 🎨 ORB THEME: Set orb theme
            if msg.get("type") == "set_orb_theme":
                theme_name = msg.get("theme", "classic")
                print(f"🎨 Set orb theme request: {theme_name}")
                try:
                    if EXTENSION_WS:
                        theme_command = {
                            "type": "set_orb_theme",
                            "theme": theme_name,
                            "id": f"theme_{int(time.time() * 1000)}"
                        }
                        await EXTENSION_WS.send(json.dumps(theme_command))
                        print(f"📤 Sent set_orb_theme command to extension: {theme_name}")

                        # Update global state
                        CURRENT_ORB_THEME = theme_name

                        # Respond with request ID if provided
                        response = {
                            "ok": True,
                            "message": f"Orb theme set to: {theme_name}"
                        }
                        if msg.get("_requestId"):
                            response["_requestId"] = msg["_requestId"]
                        await ws.send(json.dumps(response))

                        # Broadcast to other web dashboard clients
                        await broadcast_to_web_dashboards({
                            "type": "orb_theme_changed",
                            "theme": theme_name
                        }, exclude_ws=ws)
                    else:
                        response = {
                            "ok": False,
                            "error": "Extension not connected"
                        }
                        if msg.get("_requestId"):
                            response["_requestId"] = msg["_requestId"]
                        await ws.send(json.dumps(response))

                except Exception as e:
                    print(f"❌ Error setting orb theme: {e}")
                    response = {"ok": False, "error": str(e)}
                    if msg.get("_requestId"):
                        response["_requestId"] = msg["_requestId"]
                    await ws.send(json.dumps(response))

            # 🎨 ORB THEME: Get available themes
            if msg.get("type") == "get_orb_themes":
                print("🎨 Get orb themes request")
                try:
                    if EXTENSION_WS:
                        themes_command = {
                            "type": "get_orb_themes",
                            "id": f"themes_{int(time.time() * 1000)}"
                        }
                        await EXTENSION_WS.send(json.dumps(themes_command))
                        print("📤 Sent get_orb_themes command to extension")

                        await ws.send(json.dumps({
                            "ok": True,
                            "message": "Getting available themes..."
                        }))
                    else:
                        await ws.send(json.dumps({
                            "ok": False,
                            "error": "Extension not connected"
                        }))

                except Exception as e:
                    print(f"❌ Error getting orb themes: {e}")
                    await ws.send(json.dumps({"ok": False, "error": str(e)}))

            # 🌳 SCAN MODE: Get current scan mode
            if msg.get("type") == "get_scan_mode":
                print("🌳 Get scan mode request")
                response = {
                    "ok": True,
                    "scanMode": CURRENT_SCAN_MODE
                }
                if msg.get("_requestId"):
                    response["_requestId"] = msg["_requestId"]
                await ws.send(json.dumps(response))

            # 🌳 SCAN MODE: Set scan mode (dom or at)
            if msg.get("type") == "set_scan_mode":
                mode = msg.get("mode", "dom")
                print(f"🌳 Set scan mode request: {mode}")
                try:
                    if mode not in ["dom", "at"]:
                        response = {
                            "ok": False,
                            "error": f"Invalid scan mode: {mode}. Use 'dom' or 'at'"
                        }
                        if msg.get("_requestId"):
                            response["_requestId"] = msg["_requestId"]
                        await ws.send(json.dumps(response))
                    elif EXTENSION_WS:
                        scan_mode_command = {
                            "type": "set_scan_mode",
                            "mode": mode,
                            "id": f"scanmode_{int(time.time() * 1000)}"
                        }
                        await EXTENSION_WS.send(json.dumps(scan_mode_command))
                        print(f"📤 Sent set_scan_mode command to extension: {mode}")

                        # Update global state
                        CURRENT_SCAN_MODE = mode

                        # 💾 Persist to llm_config.json
                        config = load_llm_config()
                        if "extension" not in config:
                            config["extension"] = {}
                        config["extension"]["scan_mode"] = mode
                        save_llm_config(config)
                        print(f"💾 Scan mode persisted to config: {mode}")

                        # Respond with success
                        response = {
                            "ok": True,
                            "scanMode": mode,
                            "message": f"Scan mode set to: {mode}"
                        }
                        if msg.get("_requestId"):
                            response["_requestId"] = msg["_requestId"]
                        await ws.send(json.dumps(response))

                        # Broadcast to other web dashboard clients
                        await broadcast_to_web_dashboards({
                            "type": "scan_mode_changed",
                            "mode": mode
                        }, exclude_ws=ws)
                    else:
                        response = {
                            "ok": False,
                            "error": "Extension not connected"
                        }
                        if msg.get("_requestId"):
                            response["_requestId"] = msg["_requestId"]
                        await ws.send(json.dumps(response))

                except Exception as e:
                    print(f"❌ Error setting scan mode: {e}")
                    response = {"ok": False, "error": str(e)}
                    if msg.get("_requestId"):
                        response["_requestId"] = msg["_requestId"]
                    await ws.send(json.dumps(response))

            # 🌳 SCAN MODE CHANGED: Broadcast from extension to web dashboards
            if msg.get("type") == "scan_mode_changed":
                mode = msg.get("mode", "dom")
                print(f"🌳 Scan mode changed by extension: {mode}")
                CURRENT_SCAN_MODE = mode

                # 💾 Persist to llm_config.json
                config = load_llm_config()
                if "extension" not in config:
                    config["extension"] = {}
                config["extension"]["scan_mode"] = mode
                save_llm_config(config)
                print(f"💾 Scan mode persisted to config: {mode}")

                # Broadcast to all web dashboard clients
                await broadcast_to_web_dashboards({
                    "type": "scan_mode_changed",
                    "mode": mode
                })

            # 🆕 NEW: DOM CHANGE NOTIFICATIONS: Handle real-time DOM change updates
            if msg.get("type") == "dom_content_changed":
                print("🔄 DOM content changed notification received")
                try:
                    dom_change_data = msg.get("data", {})
                    tab_id = dom_change_data.get("tabId")
                    total_mutations = dom_change_data.get("totalMutations", 0)
                    change_types = dom_change_data.get("changeTypes", [])
                    
                    print(f"🔄 Tab {tab_id}: {total_mutations} mutations, types: {change_types}")
                    
                    # Store DOM change data for LLM context
                    await store_dom_change_context(dom_change_data)
                    
                except Exception as e:
                    print(f"❌ Error processing DOM change notification: {e}")
            
            # 🆕 NEW: NETWORK ACTIVITY MONITORING: Track network requests and activity
            if msg.get("type") == "network_activity":
                print("🌐 Network activity notification received")
                try:
                    network_data = msg.get("data", {})
                    event_type = network_data.get("eventType", "unknown")
                    url = network_data.get("url", "unknown")
                    status = network_data.get("status")
                    inflight_requests = network_data.get("inflightRequests", 0)
                    tab_id = network_data.get("tabId")
                    
                    # Log network activity (but not every single request to avoid spam)
                    if event_type.endswith("_end") or inflight_requests == 0:
                        print(f"🌐 Network activity: {event_type} | URL: {url[:80]}... | Status: {status} | Inflight: {inflight_requests} | Tab: {tab_id}")
                    
                    # 🎯 MONITORING: Track network activity patterns
                    # This can be used to detect when page is fully loaded
                    if event_type.endswith("_end") and inflight_requests == 0:
                        print(f"🌐 ✅ Network idle detected - all requests completed for tab {tab_id}")
                        # Network is idle, page should be ready for scanning
                        # The service worker will handle triggering rescans
                        
                except Exception as e:
                    print(f"❌ Error processing network activity notification: {e}")
            
            # 🆕 NEW: TEXT EXTRACTION HANDLING: Process text extraction requests
            if msg.get("type") == "extractPageText":
                print("📄 Text extraction request received")
                try:
                    # Forward text extraction request to extension
                    if EXTENSION_WS and EXTENSION_WS != ws:
                        extraction_msg = {
                            "id": f"text-{uuid.uuid4().hex[:8]}",
                            "type": "extractPageText",
                            "data": {}
                        }
                        
                        await EXTENSION_WS.send(json.dumps(extraction_msg))
                        print("✅ Text extraction request forwarded to extension")
                        
                        # Send confirmation back to client
                        response = {
                            "id": msg.get("id", "unknown"),
                            "ok": True,
                            "result": "Text extraction request sent to extension",
                            "error": None
                        }
                        await ws.send(json.dumps(response))
                    else:
                        print("❌ No extension available for text extraction")
                        response = {
                            "id": msg.get("id", "unknown"),
                            "ok": False,
                            "result": None,
                            "error": "No extension available for text extraction"
                        }
                        await ws.send(json.dumps(response))
                        
                except Exception as e:
                    print(f"❌ Error processing text extraction request: {e}")
                    response = {
                        "id": msg.get("id", "unknown"),
                        "ok": False,
                        "result": None,
                        "error": f"Error processing text extraction: {str(e)}"
                    }
                    await ws.send(json.dumps(response))
            
            # 🆕 NEW: LLM INSTRUCTION HANDLING: Process LLM action requests
            if msg.get("type") == "llm_instruction":
                print("🤖 LLM instruction received")
                try:
                    instruction_data = msg.get("data", {})
                    action_id = instruction_data.get("actionId")
                    action_type = instruction_data.get("actionType")
                    action_params = instruction_data.get("params", {})

                    # 🎯 AUTO-RESOLVE action type from ELEMENT_REGISTRY if not provided
                    if action_type is None and action_id:
                        has_value = "value" in action_params
                        action_type = resolve_action_type(action_id, has_value=has_value)
                        print(f"🎯 Auto-resolved action type: {action_type} (has_value={has_value})")

                    print(f"🤖 LLM Instruction: {action_type} on {action_id}")
                    
                    # Forward LLM instruction to extension for execution
                    if EXTENSION_WS and EXTENSION_WS != ws:
                        # 🌳 AT MODE: Skip hints, send directly with role+name
                        if CURRENT_SCAN_MODE == 'at':
                            instruction_msg = {
                                "id": f"llm-{uuid.uuid4().hex[:8]}",
                                "type": "execute_llm_action",
                                "data": {
                                    "actionId": action_id,
                                    "actionType": action_type,
                                    "params": action_params
                                }
                            }
                            print(f"🌳 AT mode - direct execution: {action_id} with role={action_params.get('role')}, name={action_params.get('name', '')[:30]}")
                        # 🆕 DOM MODE: Look up hints from text.json for selector-based resolution
                        elif (hints := resolve_action_hints(action_id)):
                            # Use hint-based execution (robust, survives re-renders)
                            instruction_msg = {
                                "id": f"llm-{uuid.uuid4().hex[:8]}",
                                "type": "execute_action_with_hints",
                                "data": {
                                    "actionId": action_id,
                                    "actionType": action_type,
                                    "params": action_params,
                                    "hints": hints
                                }
                            }
                            print(f"🎯 Using hint-based execution: {hints.get('label')} ({len(hints.get('selectors', []))} selectors)")
                        else:
                            # Fallback to old method (DOM attribute lookup)
                            instruction_msg = {
                                "id": f"llm-{uuid.uuid4().hex[:8]}",
                                "type": "execute_llm_action",
                                "data": {
                                    "actionId": action_id,
                                    "actionType": action_type,
                                    "params": action_params
                                }
                            }
                            print(f"⚠️ No hints found, using legacy execution")

                        await EXTENSION_WS.send(json.dumps(instruction_msg))
                        print("✅ LLM instruction forwarded to extension")
                        
                        # Send confirmation back to LLM client
                        response = {
                            "id": msg.get("id", "unknown"),
                            "ok": True,
                            "result": f"LLM instruction forwarded: {action_type} on {action_id}",
                            "error": None
                        }
                        await ws.send(json.dumps(response))
                    else:
                        print("❌ No extension available for LLM instruction execution")
                        response = {
                            "id": msg.get("id", "unknown"),
                            "ok": False,
                            "result": None,
                            "error": "No extension available for instruction execution"
                        }
                        await ws.send(json.dumps(response))
                        
                except Exception as e:
                    print(f"❌ Error processing LLM instruction: {e}")
                    response = {
                        "id": msg.get("id", "unknown"),
                        "ok": False,
                        "result": None,
                        "error": f"Error processing instruction: {str(e)}"
                    }
                    await ws.send(json.dumps(response))

            # 🧪 TEST DISPATCH: Test LLM dispatcher routing
            if msg.get("type") == "test_dispatch":
                print("🧪 Test dispatch request received")
                try:
                    action = msg.get("action", {})
                    print(f"🧪 Dispatching action: {json.dumps(action)}")

                    # Route through the dispatcher
                    result = await dispatch_llm_action(action)

                    print(f"🧪 Dispatch result: {json.dumps(result)}")
                    await ws.send(json.dumps(result))

                except Exception as e:
                    print(f"❌ Error in test dispatch: {e}")
                    import traceback
                    traceback.print_exc()
                    await ws.send(json.dumps({
                        "ok": False,
                        "error": str(e)
                    }))

            # 🔄 COMMAND FORWARDING: Route commands from test clients to extension
            if "command" in msg and "id" in msg:
                command = msg.get("command")
                
                # 🎯 INTERNAL SERVER COMMANDS: Handle commands that don't go to extension
                if command == "getTabsInfo":
                    print(f"📊 Internal command: {command} - returning stored tab info")
                    response = {
                        "id": msg["id"],
                        "ok": True,
                        "result": get_current_tabs_info(),
                        "error": None
                    }
                    await ws.send(json.dumps(response))
                    continue
                
                # 🆕 NEW: Get current page intelligence data
                if command == "getPageData":
                    print(f"🧠 Internal command: {command} - returning stored page intelligence data")
                    response = {
                        "id": msg["id"],
                        "ok": True,
                        "result": get_current_page_data(),
                        "error": None
                    }
                    await ws.send(json.dumps(response))
                    continue
                
                # 🆕 NEW: Get current page content data
                if command == "getContentData":
                    print(f"📄 Internal command: {command} - returning stored page content data")
                    response = {
                        "id": msg["id"],
                        "ok": True,
                        "result": get_current_content_data(),
                        "error": None
                    }
                    await ws.send(json.dumps(response))
                    continue
                
                # 🎯 NEW: Get current active tab (most useful for LLM interactions)
                if command == "getActiveTab":
                    print(f"🎯 Internal command: {command} - returning current active tab")
                    response = {
                        "id": msg["id"],
                        "ok": True,
                        "result": get_current_active_tab(),
                        "error": None
                    }
                    await ws.send(json.dumps(response))
                    continue
                
                # 🔄 EXTENSION COMMANDS: Forward other commands to extension
                print(f"�� Forwarding command to extension: {command}")
                if EXTENSION_WS and EXTENSION_WS != ws:
                    # Track which client sent this command for response routing
                    COMMAND_CLIENTS[msg["id"]] = ws
                    print(f"📋 Tracked command {msg['id']} from client {id(ws)}")
                    
                    await EXTENSION_WS.send(json.dumps(msg))
                    print("✅ Command forwarded to extension")
                else:
                    print("❌ No extension to forward to")
            
            # 📥 RESPONSE HANDLING: Process responses from extension and route to test clients
            if "id" in msg and ("ok" in msg or "error" in msg):
                
                # 🆕 NEW: Handle text extraction responses
                print(f"🔍 Checking response: id='{msg.get('id')}', command='{msg.get('command')}', ok={msg.get('ok')}")
                print(f"🔍 Response result keys: {list(msg.get('result', {}).keys()) if msg.get('result') else 'None'}")
                
                # Check if this is a text extraction response by looking for the specific result structure
                result = msg.get("result", {})
                is_text_extraction = (
                    msg.get("id", "").startswith("text-") or 
                    msg.get("command") == "extractPageText" or
                    (msg.get("ok") and 
                     result.get("statistics") and 
                     "totalHeadings" in result.get("statistics", {}) and
                     "totalParagraphs" in result.get("statistics", {}) and
                     "totalLists" in result.get("statistics", {}) and
                     result.get("markdown"))  # Text extraction always has markdown field
                )
                
                if is_text_extraction:
                    print("📄 Text extraction response received")
                    try:
                        if msg.get("ok") and msg.get("result"):
                            # Save the extracted text to markdown file
                            text_data = msg.get("result")
                            saved_file = await save_page_text_to_markdown(text_data)
                            
                            if saved_file:
                                print(f"✅ Text extraction completed and saved to: {saved_file}")
                            else:
                                print("❌ Failed to save text extraction to file")
                        else:
                            print(f"❌ Text extraction failed: {msg.get('error', 'Unknown error')}")
                            
                    except Exception as e:
                        print(f"❌ Error processing text extraction response: {e}")
                
                # 🆕 NEW: Handle LLM instruction responses
                elif msg.get("id", "").startswith("llm-"):
                    print("🤖 LLM instruction response received")
                    # LLM instruction responses are handled by the routing system below
                print(f"📥 Response received for id: {msg['id']}")
                
                # 💾 AUTO-SAVE SITE MAP: If this is a successful generateSiteMap response, save to file
                if msg.get("ok") and msg.get("result") and "statistics" in msg.get("result", {}):
                    print("🔍 SITE MAP DETECTED - Auto-saving to JSONL file...")
                    
                    # Check if this has overlay removal (clean version)
                    if "overlayRemoval" in msg.get("result", {}):
                        print("🧹 CLEAN SITE MAP detected - saving as [hostname]_clean.jsonl")
                        # COMMENTED OUT: save_site_map_to_jsonl(msg["result"], suffix="_clean")
                        saved_file = None  # Don't save clean file
                    else:
                        print("📊 ORIGINAL SITE MAP detected - saving as [hostname].jsonl")
                        # COMMENTED OUT: save_site_map_to_jsonl(msg["result"])
                        saved_file = None  # Don't save original file
                    
                    if saved_file:
                        print(f"🎯 Site map automatically saved to: {saved_file}")
                        
                        # 🧠 AUTO-PROCESS: If this is a clean file, process it for LLM consumption
                        if "_clean.jsonl" in saved_file:
                            print("🧠 Auto-processing clean site map for LLM consumption...")
                            try:
                                processed_data, mapping_data, success = process_clean_site_map(saved_file)
                                if success:
                                    # Save processed data
                                    processed_filename = saved_file.replace("_clean.jsonl", "_processed.jsonl")
                                    with open(processed_filename, 'w', encoding='utf-8', errors='ignore') as f:
                                        json.dump(processed_data, f, ensure_ascii=False, indent=2)
                                    
                                    # COMMENTED OUT: Save mapping data
                                    # mapping_filename = saved_file.replace("_clean.jsonl", "_mapping.json")
                                    # with open(mapping_filename, 'w', encoding='utf-8', errors='ignore') as f:
                                    #     json.dump(mapping_data, f, ensure_ascii=False, indent=2)
                                    
                                    print(f"✅ Processed data saved to: {processed_filename}")
                                    # print(f"🔗 Element mapping saved to: {mapping_filename}")
                                else:
                                    print("❌ Failed to process site map for LLM consumption")
                            except Exception as e:
                                print(f"❌ Error during auto-processing: {e}")
                    else:
                        # 🧠 DIRECT PROCESSING: Process the data directly without saving intermediate files
                        print("🧠 Processing site map data directly for LLM consumption...")
                        try:
                            # Get the raw data directly from the message
                            raw_data = msg["result"]
                            
                            # Process it using the existing function
                            processed_data, mapping_data, success = process_clean_site_map_data(raw_data)
                            
                            if success:
                                # Save only the processed data
                                url = raw_data.get('metadata', {}).get('url', 'unknown')
                                parsed_url = urlparse(url)
                                hostname = parsed_url.hostname or 'unknown'
                                processed_filename = f"{hostname}_processed.jsonl"
                                filepath = os.path.join(SITE_STRUCTURES_DIR, processed_filename)
                                
                                with open(filepath, 'w', encoding='utf-8', errors='ignore') as f:
                                    json.dump(processed_data, f, ensure_ascii=False, indent=2)
                                
                                print(f"✅ Processed data saved to: {processed_filename}")
                                if processed_data:
                                    print(f"📊 Elements: {len(processed_data.get('elements', []))}")
                                else:
                                    print("📊 Elements: 0 (no data processed)")
                                
                                # 🧠 Run post-processing optimization
                                print("🧠 Running post-processing optimization...")
                                optimization_success = siteStructuredLLMmethodinsidethefile(filepath)
                                if optimization_success:
                                    print("✅ File optimization completed successfully")
                                else:
                                    print("⚠️ File optimization had issues, but file was saved")
                            else:
                                print("❌ Failed to process site map for LLM consumption")
                        except Exception as e:
                            print(f"❌ Error during direct processing: {e}")
                            import traceback
                            traceback.print_exc()
                
                # First, try to find the pending future in our PENDING dict
                # This handles responses for commands sent via send_command() function
                fut = PENDING.pop(msg["id"], None)
                if fut and not fut.done():
                    print(f"✅ Setting future result for {msg['id']}")
                    fut.set_result(msg)
                else:
                    print(f"⚠️ No pending future found for {msg['id']}")
                    
                    # 🎯 RESPONSE ROUTING: Route response back to the client that sent the command
                    if msg["id"] in COMMAND_CLIENTS:
                        target_client = COMMAND_CLIENTS.pop(msg["id"])
                        print(f"📤 Routing response {msg['id']} back to original client {id(target_client)}")

                        # 🚀 IMMEDIATE TAB UPDATE: If this is a tab capability response, update text.md NOW
                        if msg.get("ok") and msg["id"].startswith("cap_"):
                            result_data = msg.get("result", {})
                            if result_data and "tabs" in result_data:
                                update_tabs_from_response(result_data["tabs"])

                        try:
                            await target_client.send(json.dumps(msg))
                            print("✅ Response routed back to original client")
                        except Exception as e:
                            print(f"❌ Failed to route response to original client: {e}")
                    else:
                        print(f"⚠️ No client found for command {msg['id']}")
                        
                        # 🎯 FALLBACK ROUTING: If no tracked client, try to route to any test client
                        # This handles responses for commands sent by external test clients
                        for client in CLIENTS:
                            if client != EXTENSION_WS and client != ws:
                                print(f"📤 Fallback: Forwarding response to test client: {msg['id']}")
                                try:
                                    await client.send(json.dumps(msg))
                                    print("✅ Response forwarded to test client")
                                    break
                                except Exception as e:
                                    print(f"❌ Failed to forward response to test client: {e}")
                                    continue
    finally:
        # Clean up when client disconnects
        CLIENTS.discard(ws)
        WEB_DASHBOARD_CLIENTS.discard(ws)  # Also remove from web dashboard clients
        if ws == EXTENSION_WS:
            EXTENSION_WS = None
            print("🎯 Extension client disconnected")

        # Clean up any tracked commands from this client
        commands_to_remove = [cmd_id for cmd_id, client in COMMAND_CLIENTS.items() if client == ws]
        for cmd_id in commands_to_remove:
            COMMAND_CLIENTS.pop(cmd_id, None)
            print(f"🧹 Cleaned up tracked command {cmd_id} from disconnected client")

        print(f"🔌 Client disconnected! Total clients: {len(CLIENTS)}")

async def send_command(command, params=None, timeout=8.0):
    """
    🚀 Internal command sender for server-to-extension communication
    
    This function is used by the server itself to send commands to the extension
    and wait for responses using the PENDING futures system.
    
    🔄 INTERNAL COMMAND FLOW:
    1. Generate unique command ID
    2. Create future and store in PENDING dict
    3. Send command to extension
    4. Wait for response via future
    5. Clean up PENDING entry
    
    ⚠️ NOTE: This is for INTERNAL server use, not for external test clients
    """
    print(f"🔍 send_command called with {len(CLIENTS)} clients")
    
    # Wait a moment for extension to be identified
    for _ in range(10):  # Try for 1 second
        if EXTENSION_WS:
            break
        await asyncio.sleep(0.1)
    
    if not EXTENSION_WS:
        print("❌ No extension client connected")
        raise RuntimeError("No extension connected")
    
    # Generate unique command ID for this request
    cid = f"cmd-{uuid.uuid4().hex[:8]}"
    payload = {"id": cid, "command": command, "params": params or {}}
    print(f"📤 Sending command: {command} with id: {cid} to extension")
    
    # Create future and store it in PENDING for response routing
    fut = asyncio.get_event_loop().create_future()
    PENDING[cid] = fut
    print(f"📋 Future created and stored for {cid}")
    
    # Send command to extension via WebSocket
    await EXTENSION_WS.send(json.dumps(payload))
    
    # Wait for response via the future
    try:
        result = await asyncio.wait_for(fut, timeout=timeout)
        print(f"✅ Response received for {cid}: {result}")
        return result
    except asyncio.TimeoutError:
        print(f"⏰ Timeout waiting for response to {cid}")
        PENDING.pop(cid, None)  # Clean up
        raise RuntimeError(f"Command {command} timed out")
    except Exception as e:
        print(f"❌ Error waiting for response to {cid}: {e}")
        PENDING.pop(cid, None)  # Clean up
        raise


async def extension_heartbeat_loop():
    """
    💓 Periodically ping the extension so we know when it silently disappears.
    """
    while True:
        await asyncio.sleep(SERVER_HEARTBEAT_INTERVAL)
        if EXTENSION_WS:
            try:
                await EXTENSION_WS.send(json.dumps({
                    "type": "server_ping",
                    "timestamp": time.time()
                }))
                print("💓 Server heartbeat sent to extension")
            except Exception as e:
                print(f"⚠️ Failed to send heartbeat to extension: {e}")

def resolve_capabilities_for_url(url: str) -> list:
    """
    🎯 PREMIUM: Resolve capabilities for a given URL from site_configs.json

    This function:
    1. Determines which site config matches the URL
    2. Extracts capabilities from that config
    3. Filters by url_pattern to return only matching capabilities

    Returns: List of capability dicts with action, label, description, handler
    """
    try:
        SITE_CONFIGS = get_all_site_configs()
        if not url or not SITE_CONFIGS:
            return []

        # Find matching site config by domain
        matching_config = None
        matching_domain = None

        # Extract hostname from URL
        from urllib.parse import urlparse
        parsed = urlparse(url)
        hostname = parsed.netloc.lower().replace('www.', '')

        # Sort domains by specificity (longer = more specific = higher priority)
        sorted_domains = sorted(
            [d for d in SITE_CONFIGS.keys() if d != 'default'],
            key=lambda x: len(x),
            reverse=True
        )

        for domain in sorted_domains:
            config = SITE_CONFIGS[domain]

            # Check URL patterns if they exist
            if 'url_patterns' in config:
                for pattern in config['url_patterns']:
                    if pattern in url:
                        matching_config = config
                        matching_domain = domain
                        break

            # Check exact hostname match
            if not matching_config and hostname == domain:
                matching_config = config
                matching_domain = domain

            # Check wildcard patterns (*.google.com)
            if not matching_config and domain.startswith('*.'):
                base_domain = domain[2:]  # Remove "*."
                if hostname == base_domain or hostname.endswith('.' + base_domain):
                    matching_config = config
                    matching_domain = domain

            if matching_config:
                break

        # Extract capabilities and filter by url_pattern (if config exists)
        matching_capabilities = []

        if matching_config and 'capabilities' in matching_config:
            capabilities = matching_config['capabilities']
            for cap_id, capability in capabilities.items():
                # Check if this capability's url_pattern matches current URL
                if 'url_pattern' in capability and capability['url_pattern'] in url:
                    matching_capabilities.append({
                        'id': cap_id,
                        'action': capability.get('action'),
                        'label': capability.get('label'),
                        'description': capability.get('description'),
                        'handler': capability.get('handler'),
                        'params': capability.get('params', {}),
                        'domain': matching_domain
                    })

        if matching_capabilities:
            print(f"🎯 Resolved {len(matching_capabilities)} capabilities for URL: {url}")
            for cap in matching_capabilities:
                print(f"  - {cap['action']}: {cap['label']}")

        return matching_capabilities

    except Exception as e:
        print(f"❌ Error resolving capabilities for URL {url}: {e}")
        return []


def is_site_config_capability(action: str, url: str | None = None) -> bool:
    """
    🎯 Check if an action is a site config capability (needs DOM execution).

    If no URL provided, uses CURRENT_ACTIVE_TAB.
    Returns True if the action is defined in site configs for the current page.
    """
    if not url:
        if CURRENT_ACTIVE_TAB:
            url = CURRENT_ACTIVE_TAB.get("url", "")
        else:
            return False

    if not url:
        return False

    # Get capabilities for this URL
    capabilities = resolve_capabilities_for_url(url)

    # Check if action matches any site config capability
    for cap in capabilities:
        if cap.get("action") == action:
            print(f"🎯 {action} is a site config capability for {url}")
            return True

    return False


def get_capabilities_for_prompt_with_universal(url: str) -> list:
    """
    🎯 Get all capabilities for a URL including universal ones.
    Used by prompt building. Combines site config + universal + internal caps.
    """
    try:
        matching_capabilities = resolve_capabilities_for_url(url) if url else []

        # 📜 UNIVERSAL CAPABILITIES: Always available on all domains
        universal_capabilities = [
            {'id': 'scroll_down', 'action': 'ScrollDown', 'label': 'Scroll down one page', 'domain': 'universal'},
            {'id': 'scroll_up', 'action': 'ScrollUp', 'label': 'Scroll up one page', 'domain': 'universal'},
            {'id': 'scroll_left', 'action': 'ScrollLeft', 'label': 'Scroll left one page', 'domain': 'universal'},
            {'id': 'scroll_right', 'action': 'ScrollRight', 'label': 'Scroll right one page', 'domain': 'universal'},
            {'id': 'scroll_top', 'action': 'ScrollTop', 'label': 'Scroll to top of page', 'domain': 'universal'},
            {'id': 'scroll_bottom', 'action': 'ScrollBottom', 'label': 'Scroll to bottom of page', 'domain': 'universal'},
            {'id': 'switch_tab', 'action': 'SwitchTab', 'label': 'Switch to tab', 'params': {'tabId': 'number'}, 'domain': 'universal'},
            {'id': 'open_tab', 'action': 'OpenTab', 'label': 'Open new tab', 'params': {'url': 'string'}, 'domain': 'universal'},
            {'id': 'close_tab', 'action': 'CloseTab', 'label': 'Close tab', 'params': {'tabId': 'number'}, 'domain': 'universal'},
            {'id': 'update_tab_url', 'action': 'UpdateTabURL', 'label': 'Navigate tab to URL', 'params': {'tabId': 'number', 'url': 'string'}, 'domain': 'universal'},
            {'id': 'zoom_in', 'action': 'ZoomIn', 'label': 'Zoom in 15%', 'domain': 'universal'},
            {'id': 'zoom_out', 'action': 'ZoomOut', 'label': 'Zoom out 15%', 'domain': 'universal'},
            {'id': 'zoom_reset', 'action': 'ZoomReset', 'label': 'Reset zoom to 100%', 'domain': 'universal'}
        ]
        matching_capabilities.extend(universal_capabilities)

        # 🔧 INTERNAL CAPABILITIES: Add server-side capabilities (chat, etc.)
        internal_caps = load_internal_capabilities()
        for action_name, cap in internal_caps.items():
            cap_params = cap.get('params', {})
            params_with_values = {k: v for k, v in cap_params.items() if v}
            matching_capabilities.append({
                'id': action_name.lower(),
                'action': cap.get('action', action_name),
                'label': cap.get('label', ''),
                'params': params_with_values if params_with_values else None,
                'domain': 'internal'
            })

        return matching_capabilities

    except Exception as e:
        print(f"❌ Error getting capabilities for prompt: {e}")
        return []


# ============================================================================
# 💬 CHAT STORAGE SYSTEM
# ============================================================================
# Append-only chat storage mirroring ChatGPT-style conversation files.
# Each chat is a single JSON file in ./data/chats/ directory.
# Messages are always appended to the end — never inserted or reordered.
# ============================================================================

CHATS_DIR = "data/chats"


def ensure_chats_dir_exists() -> str:
    """
    Create chats directory if it doesn't exist.
    Returns the absolute path to the chats directory.
    """
    chats_path = os.path.join(os.path.dirname(__file__) or ".", CHATS_DIR)
    if not os.path.exists(chats_path):
        os.makedirs(chats_path)
        print(f"📁 Created chats directory: {chats_path}")
    return chats_path


def generate_chat_id_from_prompt(prompt: str, now: datetime) -> str:
    """
    Generate a unique chat_id with timestamp and short hash.

    Format: <yyyymmddhhmmss>_<hash>
    Example: 20251222143025_a7f3c2

    @param prompt: User's initial message (used for hash seed)
    @param now: Current datetime (UTC)
    @return: Unique chat_id string
    """
    import hashlib
    import random

    # Generate timestamp: yyyymmddhhmmss
    timestamp = now.strftime("%Y%m%d%H%M%S")

    # Generate short hash from prompt + random salt for uniqueness
    seed = f"{prompt}{random.random()}{now.isoformat()}"
    hash_hex = hashlib.md5(seed.encode()).hexdigest()[:6]

    return f"{timestamp}_{hash_hex}"


def get_chat_filepath(chat_id: str) -> str:
    """
    Get the full file path for a chat JSON file.

    @param chat_id: The chat identifier
    @return: Absolute path to the chat file
    """
    chats_path = ensure_chats_dir_exists()
    return os.path.join(chats_path, f"{chat_id}.json")


def load_chat(chat_id: str) -> Optional[Dict[str, Any]]:
    """
    Load an existing chat from disk.

    @param chat_id: The chat identifier
    @return: Chat dictionary or None if not found
    """
    filepath = get_chat_filepath(chat_id)

    if not os.path.exists(filepath):
        print(f"⚠️ Chat file not found: {filepath}")
        return None

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            chat_dict = json.load(f)
        print(f"📂 Loaded chat: {chat_id} ({len(chat_dict.get('messages', []))} messages)")
        return chat_dict
    except Exception as e:
        print(f"❌ Error loading chat {chat_id}: {e}")
        return None


def _build_chat_index():
    """
    Build the in-memory chat index from disk (called once on startup).
    Reads all chat files to populate CHAT_INDEX_CACHE.
    """
    global CHAT_INDEX_CACHE, CHAT_INDEX_LOADED
    from datetime import datetime

    chats_path = ensure_chats_dir_exists()
    CHAT_INDEX_CACHE = {}

    try:
        for filename in os.listdir(chats_path):
            if not filename.endswith(".json"):
                continue

            chat_id = filename[:-5]  # Remove .json extension
            filepath = os.path.join(chats_path, filename)

            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    chat_dict = json.load(f)

                # Format date as dd/mmm (e.g., "05/Dec")
                created_at = chat_dict.get("created_at", "")
                date_short = ""
                if created_at:
                    try:
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        date_short = dt.strftime("%d/%b")  # e.g., "05/Dec"
                    except ValueError:
                        date_short = ""

                CHAT_INDEX_CACHE[chat_id] = {
                    "title": chat_dict.get("title", "Untitled"),
                    "date_short": date_short,
                    "message_count": len(chat_dict.get("messages", [])),
                    "project_id": chat_dict.get("project_id", "default"),
                    "created_at": created_at
                }

            except Exception as e:
                print(f"⚠️ Error indexing chat {filename}: {e}")
                continue

        CHAT_INDEX_LOADED = True
        print(f"📋 Chat index built: {len(CHAT_INDEX_CACHE)} chats")

    except Exception as e:
        print(f"❌ Error building chat index: {e}")


def _update_chat_index(chat_id: str, chat_dict: Dict[str, Any]):
    """
    Update the in-memory index for a single chat after save.

    @param chat_id: The chat ID to update
    @param chat_dict: The full chat dictionary
    """
    global CHAT_INDEX_CACHE
    from datetime import datetime

    created_at = chat_dict.get("created_at", "")
    date_short = ""
    if created_at:
        try:
            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            date_short = dt.strftime("%d/%b")
        except ValueError:
            date_short = ""

    CHAT_INDEX_CACHE[chat_id] = {
        "title": chat_dict.get("title", "Untitled"),
        "date_short": date_short,
        "message_count": len(chat_dict.get("messages", [])),
        "project_id": chat_dict.get("project_id", "default"),
        "created_at": created_at
    }


def _remove_from_chat_index(chat_id: str):
    """Remove a chat from the in-memory index after deletion."""
    global CHAT_INDEX_CACHE
    CHAT_INDEX_CACHE.pop(chat_id, None)


def list_chats(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    List chats using the in-memory index (fast).

    @param project_id: Optional filter - only return chats with this project_id.
                       Use "default" to get unassigned chats for sidebar.

    Returns a list of chat summaries sorted by created_at (newest first).
    Each summary contains: chat_id, title, date_short, message_count
    """
    global CHAT_INDEX_LOADED

    # Build index on first call (lazy initialization)
    if not CHAT_INDEX_LOADED:
        _build_chat_index()

    chat_summaries = []

    for chat_id, info in CHAT_INDEX_CACHE.items():
        # Filter by project_id if specified
        if project_id is not None and info.get("project_id", "default") != project_id:
            continue

        chat_summaries.append({
            "chat_id": chat_id,
            "title": info.get("title", "Untitled"),
            "date_short": info.get("date_short", ""),
            "message_count": info.get("message_count", 0)
        })

    # Sort by created_at descending (newest first)
    chat_summaries.sort(key=lambda x: CHAT_INDEX_CACHE.get(x["chat_id"], {}).get("created_at", ""), reverse=True)
    print(f"📋 Listed {len(chat_summaries)} chats (project_id={project_id}) [cached]")

    return chat_summaries


def save_chat(chat_dict: Dict[str, Any]) -> bool:
    """
    Save chat dictionary to disk.

    @param chat_dict: The chat data to save
    @return: True if successful, False otherwise
    """
    chat_id = chat_dict.get("chat_id")
    if not chat_id:
        print("❌ Cannot save chat: missing chat_id")
        print(f"❌ chat_dict keys: {list(chat_dict.keys())}")
        return False

    filepath = get_chat_filepath(chat_id)
    print(f"📁 Attempting to save chat to: {filepath}")

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(chat_dict, f, ensure_ascii=False, indent=2)
        print(f"💾 Saved chat: {chat_id}")
        # Update in-memory index for fast list operations
        _update_chat_index(chat_id, chat_dict)
        return True
    except Exception as e:
        print(f"❌ Error saving chat {chat_id}: {e}")
        import traceback
        traceback.print_exc()
        return False


def create_new_chat(chat_id: str, title: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a new chat dictionary with initial metadata.

    @param chat_id: The unique chat identifier
    @param title: The chat title (user-provided or from first message)
    @param meta: Additional metadata (page_url, page_title, etc.)
    @return: New chat dictionary
    """
    now = datetime.utcnow()
    now_iso = now.isoformat() + "Z"

    # Use provided title, or fallback to timestamp format
    if title and title.strip() and title != "New Chat":
        display_title = title.strip()
    else:
        # Default title: timestamp_firstword (e.g. "45_30_14_19_12_2025_chat")
        first_word = title.strip().split()[0].lower() if title and title.strip() else "chat"
        display_title = now.strftime(f"%S_%M_%H_%d_%m_%Y_{first_word}")

    # Default title for reset purposes
    default_title = now.strftime(f"%S_%M_%H_%d_%m_%Y_{title.strip().split()[0].lower() if title and title.strip() else 'chat'}")

    return {
        "chat_id": chat_id,
        "project_id": "default",  # "default" = unassigned, otherwise user project ID
        "created_at": now_iso,
        "updated_at": now_iso,
        "title": display_title,
        "default_title": default_title,
        "meta": {
            "source": "ome-web",
            "page_url": meta.get("page_url"),
            "page_title": meta.get("page_title")
        },
        "messages": []
    }


def append_user_message(chat_dict: Dict[str, Any], prompt: str) -> Dict[str, Any]:
    """
    Append a user message to the chat. Always appends to end (never inserts).

    @param chat_dict: The chat dictionary to modify
    @param prompt: The user's message content
    @return: The newly created message object
    """
    messages = chat_dict.get("messages", [])

    # Generate sequential message ID: m_0001, m_0002, etc.
    next_num = len(messages) + 1
    message_id = f"m_{next_num:04d}"

    now_iso = datetime.utcnow().isoformat() + "Z"

    new_message = {
        "id": message_id,
        "role": "user",
        "content": prompt,
        "timestamp": now_iso
    }

    # Append to end (never insert)
    messages.append(new_message)
    chat_dict["messages"] = messages
    chat_dict["updated_at"] = now_iso

    print(f"💬 Appended message {message_id} to chat {chat_dict.get('chat_id')}")

    return new_message


def append_assistant_message(chat_dict: Dict[str, Any], content: str) -> Dict[str, Any]:
    """
    Append an assistant (LLM) message to the chat. Always appends to end (never inserts).

    @param chat_dict: The chat dictionary to modify
    @param content: The assistant's response content
    @return: The newly created message object
    """
    messages = chat_dict.get("messages", [])

    # Generate sequential message ID: m_0001, m_0002, etc.
    next_num = len(messages) + 1
    message_id = f"m_{next_num:04d}"

    now_iso = datetime.utcnow().isoformat() + "Z"

    new_message = {
        "id": message_id,
        "role": "assistant",
        "content": content,
        "timestamp": now_iso
    }

    # Append to end (never insert)
    messages.append(new_message)
    chat_dict["messages"] = messages
    chat_dict["updated_at"] = now_iso

    print(f"🤖 Appended assistant message {message_id} to chat {chat_dict.get('chat_id')}")

    return new_message


# ============================================================================
# 🤖 LLM DISPATCHER INTEGRATION
# ============================================================================
# These functions bridge the LLM dispatcher to the existing execution pipeline.
# The dispatcher parses LLM JSON responses and routes them here.
# ============================================================================

async def send_element_action(action_id: str, action_type: str, params: dict, timeout: float = 10.0) -> dict:
    """
    Send element action to extension and wait for result.

    Used by LLM dispatcher for click, setValue, navigate actions.
    Routes through the existing llm_instruction pipeline.

    Args:
        action_id: Element action ID (e.g., "a_id_0")
        action_type: Action type (click, setValue, navigate)
        params: Action parameters (e.g., {"value": "hello", "submit": True})
        timeout: Max seconds to wait for response

    Returns:
        dict with ok=True/False and result data or error
    """
    if not EXTENSION_WS:
        return {"ok": False, "error": "Extension not connected"}

    request_id = f"llm-{uuid.uuid4().hex[:8]}"
    msg = {
        "type": "execute_llm_action",
        "id": request_id,
        "data": {
            "actionId": action_id,
            "actionType": action_type,
            "params": params
        }
    }

    print(f"🤖 send_element_action: {action_type} on {action_id}")

    # Create future for response
    fut = asyncio.get_event_loop().create_future()
    PENDING[request_id] = fut

    try:
        await EXTENSION_WS.send(json.dumps(msg))
        result = await asyncio.wait_for(fut, timeout=timeout)
        print(f"✅ element_action result: {result.get('ok', False)}")
        return result
    except asyncio.TimeoutError:
        PENDING.pop(request_id, None)
        print(f"⏰ element_action timeout: {action_id}")
        return {"ok": False, "error": f"Timeout waiting for {action_type} on {action_id}"}
    except Exception as e:
        PENDING.pop(request_id, None)
        print(f"❌ element_action error: {e}")
        return {"ok": False, "error": str(e)}


async def send_capability_action(action: str, params: dict, timeout: float = 10.0) -> dict:
    """
    Send capability action to extension and wait for result.

    Used by LLM dispatcher for scroll, zoom, tab operations.
    Routes through the existing execute_capability pipeline.

    Args:
        action: Capability name (e.g., "ScrollDown", "ZoomIn", "SwitchTab")
        params: Capability parameters (e.g., {"tabId": 123})
        timeout: Max seconds to wait for response

    Returns:
        dict with ok=True/False and result data or error
    """
    # 🔧 INTERNAL CAPABILITIES: Handle server-side capabilities directly
    internal_caps = load_internal_capabilities()
    if action in internal_caps:
        print(f"🔧 send_capability_action: routing internal cap {action}")
        result = execute_internal_capability(action, params)
        has_error = isinstance(result, dict) and "error" in result

        # 🎛️ Push HUD action to extension if capability wants to drive UI
        hud_action = result.get("_hud_action") if isinstance(result, dict) else None
        if hud_action and EXTENSION_WS:
            hud_msg = {
                "type": "hud_action",
                "action": hud_action
            }
            await EXTENSION_WS.send(json.dumps(hud_msg))
            print(f"🎛️ Pushed hud_action: {hud_action.get('type')}")
            # Remove internal flag from result
            if "_hud_action" in result:
                del result["_hud_action"]

        return {
            "ok": not has_error,
            "result": result if not has_error else None,
            "error": result.get("error") if has_error else None
        }

    if not EXTENSION_WS:
        return {"ok": False, "error": "Extension not connected"}

    # Handle scroll capabilities specially (they use scroll command)
    scroll_actions = {
        'ScrollDown': 'down',
        'ScrollUp': 'up',
        'ScrollLeft': 'left',
        'ScrollRight': 'right',
        'ScrollTop': 'top',
        'ScrollBottom': 'bottom'
    }

    if action in scroll_actions:
        direction = scroll_actions[action]
        scroll_command = {
            "command": "scroll",
            "id": f"scroll_{int(time.time() * 1000)}",
            "params": {"direction": direction}
        }
        try:
            await EXTENSION_WS.send(json.dumps(scroll_command))
            print(f"📜 Scroll {direction} sent")
            return {"ok": True, "action": action, "direction": direction}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # Other capabilities go through execute_capability
    request_id = f"cap_{action}_{int(time.time() * 1000)}"
    capability_command = {
        "type": "execute_capability",
        "id": request_id,
        "action": action,
        "params": params
    }

    print(f"🎯 send_capability_action: {action}")

    # Create future for response
    fut = asyncio.get_event_loop().create_future()
    PENDING[request_id] = fut

    try:
        await EXTENSION_WS.send(json.dumps(capability_command))
        result = await asyncio.wait_for(fut, timeout=timeout)
        print(f"✅ capability_action result: {result.get('ok', False)}")
        return result
    except asyncio.TimeoutError:
        PENDING.pop(request_id, None)
        print(f"⏰ capability_action timeout: {action}")
        return {"ok": False, "error": f"Timeout waiting for {action}"}
    except Exception as e:
        PENDING.pop(request_id, None)
        print(f"❌ capability_action error: {e}")
        return {"ok": False, "error": str(e)}


async def dispatch_llm_action(action: dict) -> dict:
    """
    Main entry point for LLM action dispatch.

    Takes a parsed LLM action dict and routes it through the appropriate pipeline.
    This is the function that the orchestrator will call.

    Args:
        action: Parsed action dict with act/cap/msg keys

    Returns:
        Result dict with ok, result/error, and optional msg
    """
    return await llm_dispatch(
        action=action,
        send_instruction=send_element_action,
        send_capability=send_capability_action,
        execute_internal=execute_internal_capability
    )


def init_llm_dispatcher():
    """
    Initialize LLM dispatcher on server startup.
    Pre-loads capabilities and validates configuration.
    """
    print("🤖 Initializing LLM Dispatcher...")

    # Pre-load capabilities
    caps = llm_load_capabilities()
    print(f"📋 Loaded {len(caps)} capabilities for LLM")

    # Log available capability groups
    groups = set()
    for cap_info in caps.values():
        groups.add(cap_info.get("_group", "unknown"))
    print(f"📦 Capability groups: {', '.join(sorted(groups))}")

    # 🎯 Wire up element resolver for action type auto-resolution
    set_element_resolver(get_element_info)
    print("🎯 Element resolver connected to dispatcher")

    print("✅ LLM Dispatcher ready")


# ═══════════════════════════════════════════════════════════════════════════════
# 🌐 HTTP SERVER - Local Web Page with Floating Orb (Port 8080)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_orb_page_html() -> str:
    """
    🎨 Generate the HTML page with floating orb and theme selector.

    Features:
    - Black background matching HUD (#212121)
    - Giant floating orb in centre
    - Theme selector (Kawaii, Om-E, Atom)
    - Smooth animations and transitions
    """
    return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Om-E Web - Orb Playground</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #212121;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: system-ui, -apple-system, sans-serif;
            color: #e5e5e5;
            overflow: hidden;
        }

        /* 🎛️ Theme Selector */
        .theme-selector {
            position: fixed;
            top: 24px;
            display: flex;
            gap: 16px;
            z-index: 100;
        }

        .theme-btn {
            padding: 12px 24px;
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 12px;
            background: rgba(255,255,255,0.05);
            color: #e5e5e5;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .theme-btn:hover {
            background: rgba(255,255,255,0.1);
            border-color: rgba(255,255,255,0.4);
            transform: scale(1.05);
        }

        .theme-btn.active {
            border-color: var(--theme-color);
            background: rgba(var(--theme-rgb), 0.2);
            color: var(--theme-color);
        }

        .theme-btn[data-theme="kawaii"] {
            --theme-color: #7ec8e3;
            --theme-rgb: 126,200,227;
        }
        .theme-btn[data-theme="robot"] {
            --theme-color: #00e5ff;
            --theme-rgb: 0,229,255;
        }
        .theme-btn[data-theme="atom"] {
            --theme-color: #3CB371;
            --theme-rgb: 60,179,113;
        }

        /* 🔮 Orb Container */
        .orb-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 400px;
            height: 500px;
            position: relative;
        }

        .orb {
            width: 300px;
            height: 400px;
            cursor: pointer;
            transition: transform 0.3s ease;
            animation: orb-float 3s ease-in-out infinite;
        }

        .orb:hover {
            transform: scale(1.1);
        }

        .orb svg {
            width: 100%;
            height: 100%;
        }

        @keyframes orb-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
        }

        /* ⚛️ Atom animations */
        @keyframes nucleus-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        @keyframes orbit-pulse {
            0%, 100% { opacity: 0.5; stroke-width: 2; }
            50% { opacity: 1; stroke-width: 4; }
        }

        .ome-nucleus {
            transform-origin: 30px 30px;
            animation: nucleus-spin 6s linear infinite;
        }

        .ome-orbit {
            animation: orbit-pulse 2.5s ease-in-out infinite;
        }

        .ome-orbit-2 { animation-delay: 0.8s; }
        .ome-orbit-3 { animation-delay: 1.6s; }

        /* 📝 Title */
        .title {
            position: fixed;
            bottom: 40px;
            font-size: 24px;
            font-weight: 300;
            color: rgba(255,255,255,0.6);
            letter-spacing: 0.1em;
        }

        .title span {
            color: var(--active-theme-color, #7ec8e3);
            font-weight: 600;
        }

        /* ⚙️ Settings Button */
        .settings-btn {
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 48px;
            height: 48px;
            border: none;
            border-radius: 50%;
            background: rgba(255,255,255,0.08);
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
        }

        .settings-btn:hover {
            background: rgba(255,255,255,0.15);
            transform: scale(1.1);
        }

        .settings-btn svg {
            width: 28px;
            height: 28px;
            fill: none;
            stroke: rgba(255,255,255,0.6);
            stroke-width: 2;
            transition: stroke 0.3s ease;
        }

        .settings-btn:hover svg {
            stroke: var(--active-theme-color, #7ec8e3);
        }

        .settings-btn.active {
            background: rgba(255,255,255,0.2);
        }

        /* ⚙️ Settings Panel */
        .settings-panel {
            position: fixed;
            bottom: 80px;
            left: 24px;
            width: 320px;
            background: rgba(40,40,50,0.98);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 16px;
            padding: 20px;
            z-index: 200;
            display: none;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }

        .settings-panel.visible {
            display: block;
            animation: settings-fade-in 0.2s ease;
        }

        @keyframes settings-fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .settings-panel h3 {
            margin: 0 0 16px 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--active-theme-color, #7ec8e3);
        }

        .settings-group {
            margin-bottom: 14px;
        }

        .settings-group label {
            display: block;
            font-size: 12px;
            color: rgba(255,255,255,0.6);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .settings-group input,
        .settings-group select {
            width: 100%;
            padding: 10px 12px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 8px;
            color: #e5e5e5;
            font-size: 14px;
            transition: border-color 0.2s;
        }

        .settings-group input:focus,
        .settings-group select:focus {
            outline: none;
            border-color: var(--active-theme-color, #7ec8e3);
        }

        .settings-row {
            display: flex;
            gap: 12px;
        }

        .settings-row .settings-group {
            flex: 1;
        }

        .settings-save {
            width: 100%;
            padding: 12px;
            background: var(--active-theme-color, #7ec8e3);
            border: none;
            border-radius: 8px;
            color: #212121;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 8px;
        }

        .settings-save:hover {
            filter: brightness(1.1);
            transform: scale(1.02);
        }

        .settings-status {
            margin-top: 10px;
            font-size: 12px;
            text-align: center;
            color: rgba(255,255,255,0.6);
            min-height: 18px;
        }

        /* 🌟 Background glow effect */
        .glow {
            position: fixed;
            width: 600px;
            height: 600px;
            border-radius: 50%;
            background: radial-gradient(circle, var(--glow-color, rgba(126,200,227,0.15)) 0%, transparent 70%);
            pointer-events: none;
            transition: background 0.5s ease;
        }
    </style>
</head>
<body>
    <!-- Theme Selector -->
    <div class="theme-selector">
        <button class="theme-btn active" data-theme="kawaii">🐱 Kawaii</button>
        <button class="theme-btn" data-theme="robot">🤖 Om-E</button>
        <button class="theme-btn" data-theme="atom">⚛️ Atom</button>
    </div>

    <!-- Background Glow -->
    <div class="glow"></div>

    <!-- Orb Container -->
    <div class="orb-container">
        <div class="orb" id="orb"></div>
    </div>

    <!-- Title -->
    <div class="title">Om-E Web — <span id="theme-name">Kawaii</span></div>

    <!-- Settings Button (bottom left) -->
    <button class="settings-btn" id="settings-btn" title="Settings">
        <svg viewBox="0 0 60 72" fill="none">
            <!-- Simplified orb icon for settings -->
            <defs>
                <radialGradient id="settingsOrbGrad" cx="50%" cy="40%" r="60%">
                    <stop offset="0%" stop-color="rgba(126,200,227,0.9)"/>
                    <stop offset="100%" stop-color="rgba(74,158,202,0.7)"/>
                </radialGradient>
            </defs>
            <ellipse cx="30" cy="36" rx="18" ry="16" fill="url(#settingsOrbGrad)"/>
            <circle cx="30" cy="36" r="6" fill="rgba(255,255,255,0.3)"/>
            <ellipse cx="26" cy="32" rx="3" ry="2" fill="rgba(255,255,255,0.5)"/>
        </svg>
    </button>

    <!-- Settings Panel -->
    <div class="settings-panel" id="settings-panel">
        <h3>LLM Settings</h3>
        <div class="settings-group">
            <label>Provider</label>
            <select id="settings-provider">
                <option value="lm_studio">LM Studio (Local)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
            </select>
        </div>
        <div class="settings-group">
            <label>Endpoint</label>
            <input type="text" id="settings-endpoint" placeholder="http://localhost:1234/v1/chat/completions">
        </div>
        <div class="settings-group">
            <label>Model</label>
            <input type="text" id="settings-model" placeholder="Model ID">
        </div>
        <div class="settings-group">
            <label>API Key</label>
            <input type="password" id="settings-apikey" placeholder="sk-... or $ENV_VAR">
        </div>
        <div class="settings-row">
            <div class="settings-group">
                <label>Temperature</label>
                <input type="number" id="settings-temperature" min="0" max="2" step="0.1" value="0.7">
            </div>
            <div class="settings-group">
                <label>Max Tokens</label>
                <input type="number" id="settings-max-tokens" min="1" max="128000" value="2048">
            </div>
        </div>
        <button class="settings-save" id="settings-save">Save Settings</button>
        <div class="settings-status" id="settings-status"></div>
    </div>

    <script>
        // 🎨 Orb Theme SVGs
        const ORB_THEMES = {
            kawaii: {
                name: 'Kawaii',
                color: '#7ec8e3',
                glow: 'rgba(126,200,227,0.15)',
                svg: `<svg viewBox="0 0 60 72" fill="none">
                    <defs>
                        <radialGradient id="kawaiiFluffyGrad" cx="50%" cy="40%" r="60%">
                            <stop offset="0%" stop-color="rgba(255,255,255,0.95)"/>
                            <stop offset="70%" stop-color="rgba(248,244,255,0.9)"/>
                            <stop offset="100%" stop-color="rgba(232,224,240,0.85)"/>
                        </radialGradient>
                        <linearGradient id="kawaiiPinkEarGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                            <stop offset="0%" stop-color="rgba(255,182,193,0.8)"/>
                            <stop offset="100%" stop-color="rgba(255,145,164,0.7)"/>
                        </linearGradient>
                        <radialGradient id="kawaiiEyeBlueGrad" cx="50%" cy="30%" r="50%">
                            <stop offset="0%" stop-color="#7ec8e3"/>
                            <stop offset="50%" stop-color="#4a9eca"/>
                            <stop offset="100%" stop-color="#2d7eb0"/>
                        </radialGradient>
                        <radialGradient id="kawaiiCherryGrad" cx="30%" cy="30%" r="60%">
                            <stop offset="0%" stop-color="#ff8a9b"/>
                            <stop offset="100%" stop-color="#e05670"/>
                        </radialGradient>
                    </defs>
                    <path d="M12 28 L8 8 L22 22 Z" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.8)" stroke-width="1.5"/>
                    <path d="M13 24 L11 12 L19 21 Z" fill="url(#kawaiiPinkEarGrad)"/>
                    <path d="M48 28 L52 8 L38 22 Z" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.8)" stroke-width="1.5"/>
                    <path d="M47 24 L49 12 L41 21 Z" fill="url(#kawaiiPinkEarGrad)"/>
                    <g>
                        <path d="M30 2 Q28 -2 26 0 M30 2 Q32 -2 34 0 M30 2 Q30 -3 30 -1" stroke="#50a060" stroke-width="1.5" fill="none"/>
                        <ellipse cx="30" cy="10" rx="9" ry="8" fill="url(#kawaiiCherryGrad)"/>
                        <ellipse cx="27" cy="7" rx="2.5" ry="1.5" fill="rgba(255,255,255,0.5)"/>
                        <ellipse cx="26" cy="12" rx="1" ry="0.7" fill="rgba(255,220,180,0.7)"/>
                        <ellipse cx="34" cy="11" rx="1" ry="0.7" fill="rgba(255,220,180,0.7)"/>
                        <ellipse cx="30" cy="14" rx="1" ry="0.7" fill="rgba(255,220,180,0.7)"/>
                    </g>
                    <ellipse cx="30" cy="38" rx="24" ry="22" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.7)" stroke-width="1.5"/>
                    <ellipse cx="8" cy="40" rx="6" ry="8" fill="url(#kawaiiFluffyGrad)"/>
                    <ellipse cx="52" cy="40" rx="6" ry="8" fill="url(#kawaiiFluffyGrad)"/>
                    <ellipse cx="20" cy="38" rx="7" ry="8" fill="url(#kawaiiEyeBlueGrad)" stroke="rgba(45,96,144,0.5)" stroke-width="0.5"/>
                    <ellipse cx="40" cy="38" rx="7" ry="8" fill="url(#kawaiiEyeBlueGrad)" stroke="rgba(45,96,144,0.5)" stroke-width="0.5"/>
                    <circle cx="17" cy="35" r="2.5" fill="rgba(255,255,255,0.95)"/>
                    <circle cx="22" cy="33" r="1.2" fill="rgba(255,255,255,0.9)"/>
                    <circle cx="37" cy="35" r="2.5" fill="rgba(255,255,255,0.95)"/>
                    <circle cx="42" cy="33" r="1.2" fill="rgba(255,255,255,0.9)"/>
                    <ellipse cx="21" cy="40" rx="2" ry="2.5" fill="rgba(26,48,80,0.9)"/>
                    <ellipse cx="41" cy="40" rx="2" ry="2.5" fill="rgba(26,48,80,0.9)"/>
                    <ellipse cx="10" cy="44" rx="4" ry="2.5" fill="rgba(255,150,170,0.5)"/>
                    <ellipse cx="50" cy="44" rx="4" ry="2.5" fill="rgba(255,150,170,0.5)"/>
                    <ellipse cx="30" cy="46" rx="2.5" ry="2" fill="rgba(255,176,192,0.8)"/>
                    <path d="M26 50 Q30 54 34 50" stroke="rgba(192,144,160,0.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <ellipse cx="30" cy="64" rx="14" ry="8" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.6)" stroke-width="1"/>
                </svg>`
            },
            robot: {
                name: 'Om-E',
                color: '#00e5ff',
                glow: 'rgba(0,229,255,0.15)',
                svg: `<svg viewBox="0 14 60 72" fill="none">
                    <defs>
                        <linearGradient id="robotBodyGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                            <stop offset="0%" stop-color="rgba(147,112,219,0.5)"/>
                            <stop offset="50%" stop-color="rgba(80,100,200,0.4)"/>
                            <stop offset="100%" stop-color="rgba(66,133,244,0.35)"/>
                        </linearGradient>
                        <linearGradient id="goggleGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                            <stop offset="0%" stop-color="rgba(186,147,255,0.6)"/>
                            <stop offset="100%" stop-color="rgba(147,112,219,0.5)"/>
                        </linearGradient>
                        <radialGradient id="glowEyeGrad" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#00ffff"/>
                            <stop offset="100%" stop-color="#00e5ff"/>
                        </radialGradient>
                    </defs>
                    <ellipse cx="6" cy="54" rx="5" ry="7" fill="rgba(66,133,244,0.35)" stroke="rgba(66,133,244,0.6)" stroke-width="1.5"/>
                    <ellipse cx="54" cy="54" rx="5" ry="7" fill="rgba(66,133,244,0.35)" stroke="rgba(66,133,244,0.6)" stroke-width="1.5"/>
                    <path d="M8 58 Q8 32 30 28 Q52 32 52 58 Q52 64 30 66 Q8 64 8 58 Z" fill="url(#robotBodyGrad)" stroke="rgba(66,133,244,0.6)" stroke-width="1.5"/>
                    <ellipse cx="20" cy="34" rx="9" ry="7" fill="url(#goggleGrad)" stroke="rgba(147,112,219,0.8)" stroke-width="1.5"/>
                    <ellipse cx="40" cy="34" rx="9" ry="7" fill="url(#goggleGrad)" stroke="rgba(147,112,219,0.8)" stroke-width="1.5"/>
                    <ellipse cx="20" cy="34" rx="6" ry="5" fill="rgba(40,40,80,0.7)"/>
                    <ellipse cx="40" cy="34" rx="6" ry="5" fill="rgba(40,40,80,0.7)"/>
                    <rect x="28" y="32" width="4" height="4" rx="1" fill="rgba(147,112,219,0.6)"/>
                    <rect x="14" y="46" rx="6" ry="6" width="32" height="16" fill="rgba(30,50,90,0.5)" stroke="rgba(66,133,244,0.5)" stroke-width="1"/>
                    <ellipse cx="23" cy="54" rx="3" ry="5" fill="url(#glowEyeGrad)"/>
                    <ellipse cx="37" cy="54" rx="3" ry="5" fill="url(#glowEyeGrad)"/>
                    <ellipse cx="23" cy="54" rx="4" ry="6" fill="none" stroke="rgba(0,229,255,0.3)" stroke-width="2"/>
                    <ellipse cx="37" cy="54" rx="4" ry="6" fill="none" stroke="rgba(0,229,255,0.3)" stroke-width="2"/>
                </svg>`
            },
            atom: {
                name: 'Atom',
                color: '#3CB371',
                glow: 'rgba(60,179,113,0.15)',
                svg: `<svg viewBox="0 0 60 60" fill="none">
                    <defs>
                        <radialGradient id="atomNucleusGrad" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="rgba(120,100,180,0.95)"/>
                            <stop offset="50%" stop-color="rgba(80,70,150,0.9)"/>
                            <stop offset="100%" stop-color="rgba(50,45,100,0.85)"/>
                        </radialGradient>
                        <radialGradient id="atomNucleusGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="rgba(147,112,219,0.6)"/>
                            <stop offset="100%" stop-color="rgba(80,70,150,0)"/>
                        </radialGradient>
                        <linearGradient id="atomOrbitGrad1" x1="0%" y1="50%" x2="100%" y2="50%">
                            <stop offset="0%" stop-color="rgba(57,255,20,0.95)"/>
                            <stop offset="35%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="50%" stop-color="rgba(40,120,30,0.5)"/>
                            <stop offset="65%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="100%" stop-color="rgba(57,255,20,0.95)"/>
                        </linearGradient>
                        <linearGradient id="atomOrbitGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="rgba(57,255,20,0.95)"/>
                            <stop offset="35%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="50%" stop-color="rgba(40,120,30,0.5)"/>
                            <stop offset="65%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="100%" stop-color="rgba(57,255,20,0.95)"/>
                        </linearGradient>
                        <linearGradient id="atomOrbitGrad3" x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="rgba(57,255,20,0.95)"/>
                            <stop offset="35%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="50%" stop-color="rgba(40,120,30,0.5)"/>
                            <stop offset="65%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="100%" stop-color="rgba(57,255,20,0.95)"/>
                        </linearGradient>
                    </defs>
                    <ellipse class="ome-orbit ome-orbit-1" cx="30" cy="30" rx="26" ry="10" fill="none" stroke="url(#atomOrbitGrad1)" stroke-width="3"/>
                    <ellipse class="ome-orbit ome-orbit-2" cx="30" cy="30" rx="26" ry="10" fill="none" stroke="url(#atomOrbitGrad2)" stroke-width="3" transform="rotate(-60 30 30)"/>
                    <ellipse class="ome-orbit ome-orbit-3" cx="30" cy="30" rx="26" ry="10" fill="none" stroke="url(#atomOrbitGrad3)" stroke-width="3" transform="rotate(60 30 30)"/>
                    <circle cx="30" cy="30" r="12" fill="url(#atomNucleusGlow)"/>
                    <g class="ome-nucleus">
                        <circle cx="30" cy="30" r="7" fill="url(#atomNucleusGrad)"/>
                        <circle cx="30" cy="30" r="8" fill="none" stroke="rgba(186,147,255,0.4)" stroke-width="1"/>
                        <circle cx="27" cy="28" r="1.5" fill="rgba(186,147,255,0.6)"/>
                        <circle cx="33" cy="32" r="1.2" fill="rgba(147,112,219,0.5)"/>
                        <circle cx="29" cy="33" r="1" fill="rgba(186,147,255,0.4)"/>
                    </g>
                </svg>`
            }
        };

        // 🎯 DOM Elements
        const orbEl = document.getElementById('orb');
        const themeNameEl = document.getElementById('theme-name');
        const glowEl = document.querySelector('.glow');
        const themeBtns = document.querySelectorAll('.theme-btn');

        // 🎨 Apply theme
        function applyTheme(themeName) {
            const theme = ORB_THEMES[themeName];
            if (!theme) return;

            // Update orb SVG
            orbEl.innerHTML = theme.svg;

            // Update theme name
            themeNameEl.textContent = theme.name;
            themeNameEl.style.color = theme.color;

            // Update glow
            glowEl.style.background = `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`;

            // Update active button
            themeBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === themeName);
            });

            // Store preference
            localStorage.setItem('ome-orb-theme', themeName);
        }

        // 🎛️ Theme button click handlers
        themeBtns.forEach(btn => {
            btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
        });

        // 🚀 Initialize with saved or default theme
        const savedTheme = localStorage.getItem('ome-orb-theme') || 'kawaii';
        applyTheme(savedTheme);

        // 🔮 Orb click - cycle themes
        orbEl.addEventListener('click', () => {
            const themes = Object.keys(ORB_THEMES);
            const currentBtn = document.querySelector('.theme-btn.active');
            const currentIndex = themes.indexOf(currentBtn?.dataset.theme || 'kawaii');
            const nextIndex = (currentIndex + 1) % themes.length;
            applyTheme(themes[nextIndex]);
        });

        // ⚙️ Settings Panel Logic
        const settingsBtn = document.getElementById('settings-btn');
        const settingsPanel = document.getElementById('settings-panel');
        const settingsStatus = document.getElementById('settings-status');

        // Toggle settings panel
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = settingsPanel.classList.toggle('visible');
            settingsBtn.classList.toggle('active', isVisible);
            if (isVisible) loadSettings();
        });

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
                settingsPanel.classList.remove('visible');
                settingsBtn.classList.remove('active');
            }
        });

        // Prevent panel clicks from closing it
        settingsPanel.addEventListener('click', (e) => e.stopPropagation());

        // WebSocket connection for settings
        let ws = null;
        function connectWS() {
            ws = new WebSocket('ws://127.0.0.1:17892');
            ws.onopen = () => console.log('⚙️ Settings WS connected');
            ws.onclose = () => setTimeout(connectWS, 2000);
            ws.onerror = () => ws.close();
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'llm_config') {
                        applySettings(msg.config);
                    }
                } catch (err) {
                    console.warn('WS parse error:', err);
                }
            };
        }
        connectWS();

        // Load settings from server
        function loadSettings() {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'get_llm_config' }));
            }
        }

        // Apply settings to form
        function applySettings(config) {
            if (!config) return;
            document.getElementById('settings-provider').value = config.provider || 'lm_studio';
            document.getElementById('settings-endpoint').value = config.endpoint || '';
            document.getElementById('settings-model').value = config.model || '';
            document.getElementById('settings-apikey').value = config.api_key || '';
            document.getElementById('settings-temperature').value = config.temperature ?? 0.7;
            document.getElementById('settings-max-tokens').value = config.max_tokens ?? 2048;
        }

        // Save settings
        document.getElementById('settings-save').addEventListener('click', async () => {
            const config = {
                provider: document.getElementById('settings-provider').value,
                endpoint: document.getElementById('settings-endpoint').value,
                model: document.getElementById('settings-model').value,
                api_key: document.getElementById('settings-apikey').value,
                temperature: parseFloat(document.getElementById('settings-temperature').value),
                max_tokens: parseInt(document.getElementById('settings-max-tokens').value)
            };

            settingsStatus.textContent = 'Saving...';

            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'set_llm_config', config }));
                settingsStatus.textContent = '✓ Settings saved!';
                setTimeout(() => { settingsStatus.textContent = ''; }, 2000);
            } else {
                settingsStatus.textContent = '✗ Not connected';
            }
        });
    </script>
</body>
</html>'''


class OrbPageHandler(SimpleHTTPRequestHandler):
    """
    🌐 HTTP request handler for OM-E Web dashboard and orb playground.

    Routes:
    - / or /dashboard: Popup dashboard (extension control panel)
    - /orb: Orb playground page
    - /popup_web.js: Web-compatible popup JavaScript
    """

    # Path to web_extension directory (relative to om_e_web_ws)
    WEB_EXT_DIR = os.path.join(os.path.dirname(__file__), '..', 'web_extension')

    def do_GET(self):
        """Route requests to appropriate handlers."""
        path = self.path.split('?')[0]  # Strip query params

        if path == '/' or path == '/dashboard':
            self._serve_dashboard()
        elif path == '/orb':
            self._serve_orb_page()
        elif path == '/popup_web.js':
            self._serve_file('popup_web.js', 'application/javascript')
        else:
            # Fallback to dashboard
            self._serve_dashboard()

    def _serve_dashboard(self):
        """Serve the popup dashboard HTML with web-compatible JS."""
        try:
            # Read popup.html
            html_path = os.path.join(self.WEB_EXT_DIR, 'popup.html')
            with open(html_path, 'r', encoding='utf-8') as f:
                html = f.read()

            # Replace popup.js with popup_web.js for web context
            html = html.replace('popup.js', 'popup_web.js')

            # ⚙️ Inject LLM Settings Panel - EXACT COPY from hud.js
            settings_injection = '''
<style>
    /* 🎛️ Settings Orb - spinning Chrome-style, same size as main orbs */
    .ome-settings-orb-container {
        position: fixed;
        bottom: 24px;
        left: 24px;
        width: 42px;
        height: 42px;
        cursor: pointer;
        transition: transform 0.3s ease;
        z-index: 1000;
    }
    .ome-settings-orb-container:hover {
        transform: scale(1.15);
    }
    .ome-settings-orb {
        width: 42px;
        height: 42px;
        position: relative;
        animation: ome-settings-spin 24s linear infinite;
    }
    .ome-settings-orb-container:hover .ome-settings-orb {
        animation-duration: 6s;
    }
    .ome-settings-orb svg {
        width: 100%;
        height: 100%;
    }
    /* Chrome-style segments */
    .ome-settings-orb .segment {
        fill: none;
        stroke-width: 5;
        stroke-linecap: round;
    }
    .ome-settings-orb .seg1 { stroke: rgba(126,200,227, 0.9); }
    .ome-settings-orb .seg2 { stroke: rgba(126,200,227, 0.6); }
    .ome-settings-orb .seg3 { stroke: rgba(126,200,227, 0.3); }
    .ome-settings-orb .center-dot {
        fill: rgba(126,200,227, 1);
    }
    @keyframes ome-settings-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    /* Settings panel styles - matches new chat input styling */
    .ome-settings-panel {
        display: none;
        position: fixed;
        bottom: 74px;
        left: 24px;
        width: 280px;
        background: rgb(32, 33, 36);
        border: 1px solid rgba(126,200,227, 0.2);
        border-radius: 10px;
        padding: 14px;
        z-index: 1001;
        max-height: 400px;
        overflow-y: auto;
    }
    .ome-settings-panel.open {
        display: block;
    }
    /* Title - faded like "Unsaved" label */
    .ome-settings-panel h3 {
        margin: 0 0 14px 0;
        font-size: 12px;
        font-weight: 400;
        color: rgba(255,255,255,0.35);
        letter-spacing: 0.3px;
    }
    .ome-settings-group {
        margin-bottom: 14px;
    }
    /* Labels - faded gray, uppercase */
    .ome-settings-group label {
        display: block;
        font-size: 10px;
        color: rgba(255,255,255,0.35);
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.8px;
    }
    /* Throb animation for focused inputs */
    @keyframes ome-settings-throb {
        0%, 100% { border-color: rgba(126,200,227, 0.35); }
        50% { border-color: rgba(126,200,227, 0.6); }
    }
    /* Inputs - match New Chat input style with theme border + theme text */
    .ome-settings-group select,
    .ome-settings-group input {
        width: 100%;
        padding: 10px 12px;
        background: transparent;
        border: 1px solid rgba(126,200,227, 0.3);
        border-radius: 6px;
        color: rgba(126,200,227, 0.9);
        font-size: 13px;
        box-sizing: border-box;
        transition: all 0.2s ease;
    }
    .ome-settings-group select {
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(126,200,227,0.5)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        background-size: 14px;
        padding-right: 34px;
        cursor: pointer;
    }
    .ome-settings-group select option {
        background: rgba(30, 30, 35, 0.98);
        color: rgba(255,255,255,0.85);
        padding: 8px;
    }
    .ome-settings-group select:hover,
    .ome-settings-group input:hover {
        border-color: rgba(126,200,227, 0.45);
    }
    .ome-settings-group select:focus,
    .ome-settings-group input:focus {
        outline: none;
        border-color: rgba(126,200,227, 0.5);
        animation: ome-settings-throb 1.5s ease-in-out infinite;
    }
    .ome-settings-group input::placeholder {
        color: rgba(255,255,255,0.25);
        font-style: italic;
    }
    /* Model wrapper - stack select and custom input */
    .ome-settings-model-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .ome-settings-row {
        display: flex;
        gap: 10px;
    }
    .ome-settings-row .ome-settings-group {
        flex: 1;
    }
    /* Save button - theme colored border like inputs */
    .ome-settings-save {
        width: 100%;
        padding: 10px;
        margin-top: 4px;
        background: transparent;
        border: 1px solid rgba(126,200,227, 0.3);
        border-radius: 6px;
        color: rgba(126,200,227, 0.7);
        font-size: 13px;
        font-weight: 400;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .ome-settings-save:hover {
        border-color: rgba(126,200,227, 0.5);
        color: rgba(126,200,227, 0.9);
    }
    .ome-settings-status {
        margin-top: 10px;
        font-size: 11px;
        text-align: center;
        color: rgba(100, 200, 100, 0.6);
    }
</style>

<!-- Settings Orb (bottom left) - Chrome-style spinning -->
<div class="ome-settings-orb-container" id="ome-settings-orb">
    <div class="ome-settings-orb">
        <svg viewBox="0 0 32 32">
            <!-- Chrome-style spinning segments -->
            <circle class="segment seg1" cx="16" cy="16" r="12" stroke-dasharray="19 57" stroke-dashoffset="0"/>
            <circle class="segment seg2" cx="16" cy="16" r="12" stroke-dasharray="19 57" stroke-dashoffset="-25"/>
            <circle class="segment seg3" cx="16" cy="16" r="12" stroke-dasharray="19 57" stroke-dashoffset="-50"/>
            <!-- Center dot -->
            <circle class="center-dot" cx="16" cy="16" r="4"/>
        </svg>
    </div>
</div>

<!-- Settings Panel -->
<div class="ome-settings-panel" id="ome-settings-panel">
    <h3>LLM Settings</h3>
    <div class="ome-settings-group">
        <label>Provider</label>
        <select class="ome-settings-provider">
            <option value="lm_studio">LM Studio (Local)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
        </select>
    </div>
    <div class="ome-settings-group">
        <label>Endpoint</label>
        <input type="text" class="ome-settings-endpoint" placeholder="http://localhost:1234/v1/chat/completions">
    </div>
    <div class="ome-settings-group">
        <label>Model</label>
        <div class="ome-settings-model-wrapper">
            <select class="ome-settings-model-select">
                <option value="">Select a model...</option>
            </select>
            <input type="text" class="ome-settings-model-custom" placeholder="Custom model ID..." style="display: none;">
        </div>
    </div>
    <div class="ome-settings-group">
        <label>API Key</label>
        <input type="password" class="ome-settings-apikey" placeholder="sk-... or $ENV_VAR">
    </div>
    <div class="ome-settings-row">
        <div class="ome-settings-group">
            <label>Temperature</label>
            <input type="number" class="ome-settings-temperature" min="0" max="2" step="0.1" value="0.7">
        </div>
        <div class="ome-settings-group">
            <label>Max Tokens</label>
            <input type="number" class="ome-settings-max-tokens" min="1" max="128000" value="2048">
        </div>
    </div>
    <button class="ome-settings-save">Save Settings</button>
    <div class="ome-settings-status"></div>
</div>

<script>
(function() {
    // ⚙️ LLM Settings Panel - Uses SAME execute_capability actions as HUD
    const settingsOrb = document.getElementById('ome-settings-orb');
    const settingsPanel = document.getElementById('ome-settings-panel');
    const settingsStatus = settingsPanel.querySelector('.ome-settings-status');

    // 🎛️ Model config data (from llm_models.json)
    const LLM_MODELS = {
        "openai": {
            "endpoint": "https://api.openai.com/v1/chat/completions",
            "models": [
                { "id": "gpt-5.2", "name": "GPT-5.2 (Flagship)", "default": true },
                { "id": "gpt-5.1", "name": "GPT-5.1" },
                { "id": "gpt-5", "name": "GPT-5" },
                { "id": "gpt-5-mini", "name": "GPT-5 Mini" },
                { "id": "gpt-5-nano", "name": "GPT-5 Nano" },
                { "id": "gpt-4.1", "name": "GPT-4.1" },
                { "id": "gpt-4.1-mini", "name": "GPT-4.1 Mini" },
                { "id": "gpt-4.1-nano", "name": "GPT-4.1 Nano (Fastest)" },
                { "id": "gpt-4o", "name": "GPT-4o" },
                { "id": "o3", "name": "O3 (Reasoning)" }
            ]
        },
        "anthropic": {
            "endpoint": "https://api.anthropic.com/v1/messages",
            "models": []
        },
        "lm_studio": {
            "endpoint": "http://localhost:1234/v1/chat/completions",
            "models": []
        }
    };

    // Current full config from server
    let currentConfig = null;

    // Toggle settings panel
    settingsOrb.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = settingsPanel.classList.toggle('open');
        if (isOpen) loadSettingsIntoPanel();
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsOrb.contains(e.target)) {
            settingsPanel.classList.remove('open');
        }
    });

    // Prevent panel clicks from closing it
    settingsPanel.addEventListener('click', (e) => e.stopPropagation());

    // WebSocket connection
    let ws = null;
    let pendingCallbacks = {};

    function connectWS() {
        ws = new WebSocket('ws://127.0.0.1:17892');
        ws.onopen = () => console.log('⚙️ Settings WS connected');
        ws.onclose = () => setTimeout(connectWS, 2000);
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                // Handle capability responses
                if (msg.id && pendingCallbacks[msg.id]) {
                    pendingCallbacks[msg.id](msg);
                    delete pendingCallbacks[msg.id];
                }
            } catch (err) {
                console.warn('WS parse error:', err);
            }
        };
    }
    connectWS();

    // Send capability and wait for response (same pattern as HUD)
    function sendCapability(action, params = {}) {
        return new Promise((resolve) => {
            if (ws?.readyState !== WebSocket.OPEN) {
                resolve({ error: 'Not connected' });
                return;
            }
            const id = `cap_${action}_${Date.now()}`;
            pendingCallbacks[id] = resolve;
            ws.send(JSON.stringify({
                type: 'execute_capability',
                id: id,
                action: action,
                params: params
            }));
            // Timeout after 5s
            setTimeout(() => {
                if (pendingCallbacks[id]) {
                    delete pendingCallbacks[id];
                    resolve({ error: 'Timeout' });
                }
            }, 5000);
        });
    }

    // Get default endpoint for provider
    function getDefaultEndpoint(provider) {
        return LLM_MODELS[provider]?.endpoint || '';
    }

    // Get models for provider
    function getModelsForProvider(provider) {
        return LLM_MODELS[provider]?.models || [];
    }

    // Populate model dropdown for provider
    function populateModelList(provider, currentModel = '') {
        const modelSelect = settingsPanel.querySelector('.ome-settings-model-select');
        const customInput = settingsPanel.querySelector('.ome-settings-model-custom');
        if (!modelSelect) return;

        modelSelect.innerHTML = '';
        const models = getModelsForProvider(provider);

        for (const model of models) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name ? `${model.name} (${model.id})` : model.id;
            modelSelect.appendChild(option);
        }

        const customOption = document.createElement('option');
        customOption.value = '__custom__';
        customOption.textContent = '— Other (Custom) —';
        modelSelect.appendChild(customOption);

        if (currentModel) {
            const existsInList = models.some(m => m.id === currentModel);
            if (existsInList) {
                modelSelect.value = currentModel;
                if (customInput) customInput.style.display = 'none';
            } else {
                modelSelect.value = '__custom__';
                if (customInput) {
                    customInput.value = currentModel;
                    customInput.style.display = 'block';
                }
            }
        } else {
            const defaultModel = models.find(m => m.default);
            if (defaultModel) modelSelect.value = defaultModel.id;
            if (customInput) customInput.style.display = 'none';
        }

        syncTemperatureAvailability();
    }

    function getSelectedModel() {
        const modelSelect = settingsPanel.querySelector('.ome-settings-model-select');
        const customInput = settingsPanel.querySelector('.ome-settings-model-custom');
        if (modelSelect?.value === '__custom__') return customInput?.value || '';
        return modelSelect?.value || '';
    }

    function modelSupportsTemperature(modelId) {
        const id = (modelId || '').toLowerCase().trim();
        if (!id) return true;
        return !(id.includes('gpt-5') || id.includes('o3') || id.includes('o1'));
    }

    function syncTemperatureAvailability() {
        const tempInput = settingsPanel.querySelector('.ome-settings-temperature');
        if (!tempInput) return;
        const modelId = getSelectedModel();
        const supported = modelSupportsTemperature(modelId);
        tempInput.disabled = !supported;
        tempInput.title = supported ? '' : 'This model does not support temperature.';
    }

    // 🎛️ Load config using GetLLMConfig capability (SAME as HUD)
    async function loadSettingsIntoPanel() {
        const response = await sendCapability('GetLLMConfig', {});

        if (response?.result?.config) {
            const config = response.result.config;
            currentConfig = config;
            const activeProvider = config.active_provider;
            const provider = config.providers?.[activeProvider] || {};
            const settings = config.settings || {};

            // Populate provider dropdown with all available providers
            const providerSelect = settingsPanel.querySelector('.ome-settings-provider');
            if (providerSelect) {
                providerSelect.innerHTML = '';
                for (const [key, prov] of Object.entries(config.providers || {})) {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = prov.name || key;
                    if (key === activeProvider) option.selected = true;
                    providerSelect.appendChild(option);
                }
            }

            const endpointInput = settingsPanel.querySelector('.ome-settings-endpoint');
            const apikeyInput = settingsPanel.querySelector('.ome-settings-apikey');
            const tempInput = settingsPanel.querySelector('.ome-settings-temperature');
            const tokensInput = settingsPanel.querySelector('.ome-settings-max-tokens');

            if (endpointInput) endpointInput.value = provider.endpoint || getDefaultEndpoint(activeProvider) || '';
            if (apikeyInput) apikeyInput.value = provider.api_key || '';
            if (tempInput) tempInput.value = settings.temperature ?? 0.7;
            if (tokensInput) tokensInput.value = settings.max_tokens ?? 2048;

            populateModelList(activeProvider, provider.model || '');
            console.log('⚙️ Settings loaded:', activeProvider);
        }
    }

    // Provider dropdown change
    settingsPanel.querySelector('.ome-settings-provider')?.addEventListener('change', async (e) => {
        const provider = e.target.value;
        if (!currentConfig) return;

        const providerConfig = currentConfig.providers?.[provider] || {};
        const endpointInput = settingsPanel.querySelector('.ome-settings-endpoint');
        const apikeyInput = settingsPanel.querySelector('.ome-settings-apikey');

        if (endpointInput) endpointInput.value = providerConfig.endpoint || getDefaultEndpoint(provider) || '';
        if (apikeyInput) apikeyInput.value = providerConfig.api_key || '';

        populateModelList(provider, providerConfig.model || '');
    });

    // Model select change
    settingsPanel.querySelector('.ome-settings-model-select')?.addEventListener('change', (e) => {
        const customInput = settingsPanel.querySelector('.ome-settings-model-custom');
        if (!customInput) return;
        const show = e.target.value === '__custom__';
        customInput.style.display = show ? 'block' : 'none';
        if (show) { customInput.focus(); customInput.select?.(); }
        syncTemperatureAvailability();
    });

    settingsPanel.querySelector('.ome-settings-model-custom')?.addEventListener('input', () => {
        syncTemperatureAvailability();
    });

    // 🎛️ Save using SAME capability calls as HUD
    settingsPanel.querySelector('.ome-settings-save').addEventListener('click', async () => {
        const provider = settingsPanel.querySelector('.ome-settings-provider')?.value;
        const endpoint = settingsPanel.querySelector('.ome-settings-endpoint')?.value;
        const model = getSelectedModel();
        const apikey = settingsPanel.querySelector('.ome-settings-apikey')?.value;
        const temperature = parseFloat(settingsPanel.querySelector('.ome-settings-temperature')?.value || '0.7');
        const maxTokens = parseInt(settingsPanel.querySelector('.ome-settings-max-tokens')?.value || '2048');

        settingsStatus.textContent = 'Saving...';

        try {
            // Set active provider
            await sendCapability('SetLLMProvider', { provider });

            // Set endpoint
            if (endpoint) {
                await sendCapability('SetLLMEndpoint', { provider, endpoint });
            }

            // Set model
            if (model) {
                await sendCapability('SetLLMModel', { provider, model });
            }

            // Set API key (only if not masked)
            if (apikey && !apikey.startsWith('***')) {
                await sendCapability('SetLLMAPIKey', { provider, api_key: apikey });
            }

            // Set temperature
            await sendCapability('SetTemperature', { temperature });

            // Set max tokens
            await sendCapability('SetMaxTokens', { max_tokens: maxTokens });

            // Reload config
            await sendCapability('ReloadLLMConfig', {});

            settingsStatus.textContent = '✓ Settings saved!';
            setTimeout(() => { settingsStatus.textContent = ''; }, 2000);
            console.log('⚙️ Settings saved and LLM config reloaded');

        } catch (err) {
            console.error('⚙️ Error saving settings:', err);
            settingsStatus.textContent = '✗ Error saving';
        }
    });
})();
</script>
'''
            # Inject before </body>
            html = html.replace('</body>', settings_injection + '</body>')

            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
        except Exception as e:
            print(f"❌ Error serving dashboard: {e}")
            self._serve_error(500, f"Error loading dashboard: {e}")

    def _serve_orb_page(self):
        """Serve the orb playground page."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(generate_orb_page_html().encode('utf-8'))

    def _serve_file(self, filename: str, content_type: str):
        """Serve a file from web_extension directory."""
        try:
            file_path = os.path.join(self.WEB_EXT_DIR, filename)
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', f'{content_type}; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
        except FileNotFoundError:
            self._serve_error(404, f"File not found: {filename}")
        except Exception as e:
            self._serve_error(500, f"Error serving {filename}: {e}")

    def _serve_error(self, code: int, message: str):
        """Serve an error response."""
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.end_headers()
        self.wfile.write(message.encode('utf-8'))

    def log_message(self, format, *args):
        """Custom logging to match our style."""
        print(f"🌐 HTTP: {args[0]}")


def start_http_server(port: int = 8080):
    """
    🚀 Start HTTP server on specified port in a background thread.

    @param port: Port number (default 8080)
    """
    try:
        server = HTTPServer(('127.0.0.1', port), OrbPageHandler)
        print(f"🌐 HTTP server listening on http://127.0.0.1:{port}")
        print(f"📊 Dashboard: http://localhost:{port}/ (extension control panel)")
        print(f"🔮 Orb Playground: http://localhost:{port}/orb")
        server.serve_forever()
    except Exception as e:
        print(f"❌ HTTP server error: {e}")


async def main():
    """
    🚀 Main server function - starts WebSocket server on port 17892

    The server listens for connections from:
    - Chrome extension (becomes EXTENSION_WS)
    - Test clients (can send commands and receive responses)

    📡 SERVER ENDPOINT: ws://127.0.0.1:17892
    """
    global CURRENT_SCAN_MODE

    # 🌳 Load scan mode from llm_config.json (persisted setting)
    config = load_llm_config()
    saved_mode = config.get("extension", {}).get("scan_mode", "at")
    if saved_mode in ["dom", "at"]:
        CURRENT_SCAN_MODE = saved_mode
        print(f"🌳 Scan mode loaded from config: {CURRENT_SCAN_MODE}")
    else:
        CURRENT_SCAN_MODE = "at"
        print("🌳 Scan mode defaulted to: at")

    # 🎯 PREMIUM: Load site configs on startup (Polling Mode)
    await start_site_config_polling()

    # 🤖 Initialize LLM Dispatcher
    init_llm_dispatcher()

    # 🧠 RAG: Eager load embedding model and rebuild capabilities at startup
    print("🧠 Pre-loading RAG model and rebuilding stores...")
    get_model()  # Load bge-base-en-v1.5 embedding model (~6s)
    rebuild_capabilities_store()  # Always rebuild from internal_capabilities.json
    rebuild_chat_memory_store()  # Index all chat messages for memory queries
    print("🧠 RAG ready")

    # 🌐 Start HTTP server in background thread (port 8080)
    http_thread = threading.Thread(target=start_http_server, args=(8080,), daemon=True)
    http_thread.start()

    async with websockets.serve(
        handler,
        "127.0.0.1",
        17892,
        max_size=64 * 1024 * 1024,  # increase frame limit to 64 MiB
        max_queue=128,
        ping_interval=20,
        ping_timeout=20,
    ):
        print("WS listening on ws://127.0.0.1:17892")
        await asyncio.gather(
            extension_heartbeat_loop(),
            asyncio.Future()  # Keep server running indefinitely
        )

if __name__ == "__main__":
    asyncio.run(main())
