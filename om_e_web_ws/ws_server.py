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
from site_config_manager import get_site_config, start_site_config_polling, get_all_site_configs



# Global state for managing WebSocket connections and command routing
CLIENTS = set()                    # All connected WebSocket clients
PENDING = {}                       # Command ID → Future mapping for response routing
EXTENSION_WS = None               # Reference to the Chrome extension client
COMMAND_CLIENTS = {}              # Command ID → Client mapping for response routing

# 📊 Tab information storage for external access
CURRENT_TABS_INFO = None           # Latest tabs_info from extension
LAST_TABS_UPDATE = None            # Timestamp of last update
CURRENT_ACTIVE_TAB = None          # Current active tab information

# 🎯 PREMIUM: Site configs loaded from extension's site_configs.json
SITE_CONFIGS = {}                  # Loaded site configurations with capabilities

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
        config_path = os.path.join("..", "web_extension", "internal_capabilities.json")

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


def execute_internal_capability(action: str, params: dict) -> dict:
    """
    Execute an internal (server-side) capability.

    @param action: The capability action name (e.g., 'GetChatList')
    @param params: Parameters for the capability
    @return: Result dictionary
    """
    print(f"🔧 Executing internal capability: {action} with params: {params}")

    if action == "GetChatList":
        # Pass project_id filter if provided (use "default" for sidebar unassigned chats)
        project_id = params.get("project_id")
        chats = list_chats(project_id=project_id)
        return {"chats": chats}

    elif action == "LoadChat":
        # Load full chat content by ID
        chat_id = params.get("chat_id")
        if not chat_id:
            return {"error": "Missing chat_id parameter"}
        chat = load_chat(chat_id)
        if chat is None:
            return {"error": f"Chat not found: {chat_id}"}
        return {"chat": chat}

    elif action == "CreateChat":
        # Create a new chat file
        title = params.get("title", "New Chat")
        page_url = params.get("page_url", "")
        page_title = params.get("page_title", "")

        # Generate chat_id from title
        now = datetime.utcnow()
        chat_id = generate_chat_id_from_prompt(title, now)

        # Create chat dict
        meta = {"page_url": page_url, "page_title": page_title}
        chat_dict = create_new_chat(chat_id, title, meta)

        # Save to disk
        if save_chat(chat_dict):
            return {"chat_id": chat_id, "chat": chat_dict}
        else:
            return {"error": "Failed to save chat"}

    elif action == "AppendMessage":
        # Append message to chat (creates chat if needed)
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
                "message_count": len(chat_dict.get("messages", []))
            }
        else:
            return {"error": "Failed to save chat"}

    elif action == "RenameChat":
        # Rename an existing chat
        chat_id = params.get("chat_id")
        new_title = params.get("title")
        print(f"📝 RenameChat: chat_id={chat_id}, new_title={new_title}")

        if not chat_id:
            print("❌ RenameChat: Missing chat_id")
            return {"error": "Missing chat_id parameter"}
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
            print(f"✅ RenameChat: Success")
            return {"chat_id": chat_id, "title": new_title}
        else:
            print(f"❌ RenameChat: Failed to save")
            return {"error": "Failed to save chat"}

    elif action == "DeleteChat":
        # Delete a chat file
        chat_id = params.get("chat_id")

        if not chat_id:
            return {"error": "Missing chat_id parameter"}

        filepath = get_chat_filepath(chat_id)
        if not os.path.exists(filepath):
            return {"error": f"Chat not found: {chat_id}"}

        try:
            os.remove(filepath)
            print(f"🗑️ Deleted chat: {chat_id}")
            return {"chat_id": chat_id, "deleted": True}
        except Exception as e:
            return {"error": f"Failed to delete chat: {str(e)}"}

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
        lines = [l.strip() for l in content.split("\n") if l.strip().startswith("- [")]
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
            except:
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

async def handler(ws):
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
    global EXTENSION_WS
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
            
            # 🎯 EXTENSION IDENTIFICATION: Mark clients sending bridge_status as extensions
            if msg.get("type") == "bridge_status":
                EXTENSION_WS = ws
                print("🎯 Marked as extension client (bridge_status)")
            
            # 📊 TAB INFORMATION STORAGE: Store latest tabs_info for external access
            if msg.get("type") == "tabs_info":
                global CURRENT_TABS_INFO, LAST_TABS_UPDATE
                CURRENT_TABS_INFO = msg.get("tabs", [])
                LAST_TABS_UPDATE = asyncio.get_event_loop().time()
                print(f"📊 Tab info updated and stored - {len(CURRENT_TABS_INFO)} tabs available")
            
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
                        else:
                            page_text = intelligence_data.get("pageText", "")
                            print("⚠️ Semantic data not available, using plain text")

                        if page_text:
                            # 🎯 NEW: Save to single text.md file (overwrites previous content)
                            try:
                                # Create the text.md file path in the same directory as other files
                                text_file_path = os.path.join("@site_structures", "text.md")

                                # Resolve capabilities for this URL
                                capabilities = resolve_capabilities_for_url(page_url) if page_url else []

                                # Write the markdown content directly
                                with open(text_file_path, 'w', encoding='utf-8', errors='ignore') as f:
                                    # Frontmatter
                                    f.write(f"# {page_title}\n\n")
                                    f.write(f"**URL:** {page_url}\n")
                                    f.write(f"**Timestamp:** {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())}\n\n")

                                    # 🗂️ BROWSER TABS: Compact tab info for LLM context
                                    if CURRENT_TABS_INFO:
                                        total_tabs = len(CURRENT_TABS_INFO)
                                        active_tab = CURRENT_ACTIVE_TAB or {}

                                        # Format active tab info
                                        active_id = active_tab.get('id', '?')
                                        active_title = active_tab.get('title', 'Unknown')[:30]
                                        active_url = active_tab.get('url', '')
                                        active_status = active_tab.get('status', 'unknown')

                                        # Extract domain from URL
                                        try:
                                            active_domain = urlparse(active_url).hostname or 'unknown'
                                        except:
                                            active_domain = 'unknown'

                                        # Build compact tab line
                                        tab_parts = [f"**Tabs ({total_tabs}):** Active: #{active_id} \"{active_title}\" {active_domain} [{active_status}]"]

                                        # Add other tabs (non-active)
                                        other_tabs = [t for t in CURRENT_TABS_INFO if not t.get('active', False)]
                                        if other_tabs:
                                            other_strs = []
                                            for t in other_tabs[:3]:  # Limit to 3 other tabs
                                                t_id = t.get('id', '?')
                                                t_title = t.get('title', 'Unknown')[:20]
                                                t_url = t.get('url', '')
                                                try:
                                                    t_domain = urlparse(t_url).hostname or '?'
                                                except:
                                                    t_domain = '?'
                                                other_strs.append(f"#{t_id} \"{t_title}\" {t_domain}")
                                            if other_strs:
                                                tab_parts.append(" | Other: " + ", ".join(other_strs))
                                            if len(other_tabs) > 3:
                                                tab_parts.append(f" (+{len(other_tabs) - 3} more)")

                                        f.write("".join(tab_parts) + "\n\n")

                                    # 🎯 CAPABILITIES SECTION: Show domain-specific + universal actions
                                    # Universal scroll capabilities are automatically included via resolve_capabilities_for_url()
                                    if capabilities:
                                        f.write("## Available Actions\n\n")
                                        f.write("The following pre-configured actions are available for this page:\n\n")
                                        for cap in capabilities:
                                            f.write(f"**{cap['action']}** - {cap['label']}\n")
                                            f.write(f"  - {cap['description']}\n")
                                            # Use usage_example if provided, otherwise basic command
                                            base_cmd = f"python3 test_navigation.py --command capability --capability {cap['action']}"
                                            if cap.get('usage_example'):
                                                f.write(f"  - Usage: `{base_cmd} {cap['usage_example']}`\n\n")
                                            else:
                                                f.write(f"  - Usage: `{base_cmd}`\n\n")
                                        f.write("---\n\n")

                                    f.write("---\n\n")
                                    f.write(page_text)

                                    # 🖼️ IFRAME ELEMENTS: Append elements from cross-origin iframes
                                    iframe_elements = [el for el in actionable_elements if el.get('isIframeElement')]
                                    pending_iframe_count = intelligence_data.get('pendingIframeCount', 0)
                                    iframe_status = intelligence_data.get('iframeStatus', 'none')

                                    if iframe_elements:
                                        # We have iframe elements - write them
                                        f.write("\n\n---\n\n")
                                        f.write("## Secure Iframe Elements\n\n")
                                        f.write("*These elements are inside secure cross-origin iframes (e.g., payment forms):*\n\n")
                                        for el in iframe_elements:
                                            action_id = el.get('actionId', 'unknown')
                                            tag = el.get('tag', 'input')
                                            text = el.get('text') or el.get('label') or el.get('placeholder') or el.get('name') or 'Unnamed'
                                            el_type = el.get('type', '')

                                            # Format based on tag type - include iframe="true" for routing
                                            if tag == 'button':
                                                f.write(f"<Button id=\"{action_id}\" iframe=\"true\">{text}</Button>\n")
                                            elif tag == 'select':
                                                f.write(f"<Select id=\"{action_id}\" iframe=\"true\">{text}</Select>\n")
                                            else:
                                                # Input elements
                                                type_hint = f" type=\"{el_type}\"" if el_type else ""
                                                f.write(f"<Input id=\"{action_id}\"{type_hint} iframe=\"true\" use=\"({action_id}, 'your text', submit:true, iframe:true)\">{text}</Input>\n")

                                        print(f"🖼️ Added {len(iframe_elements)} iframe elements to text.md")

                                    elif pending_iframe_count > 0 and iframe_status == 'loading':
                                        # 🚀 PROGRESSIVE: Iframes still loading - add placeholder
                                        f.write("\n\n---\n\n")
                                        f.write("## Secure Iframe Elements\n\n")
                                        f.write(f"*⏳ Loading {pending_iframe_count} iframe(s)... (payment forms, embedded content)*\n\n")
                                        f.write("*Iframe elements will appear here when loaded. Check back shortly.*\n")
                                        print(f"🖼️ Added placeholder for {pending_iframe_count} pending iframes")

                                print(f"✅ Text content saved to: {text_file_path}")

                            except Exception as write_error:
                                print(f"⚠️ Error writing to text.md: {write_error}")
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
                        el_type = el.get('type', '')

                        if tag == 'button':
                            iframe_section += f"<Button id=\"{action_id}\" iframe=\"true\">{text}</Button>\n"
                        elif tag == 'select':
                            iframe_section += f"<Select id=\"{action_id}\" iframe=\"true\">{text}</Select>\n"
                        else:
                            type_hint = f" type=\"{el_type}\"" if el_type else ""
                            iframe_section += f"<Input id=\"{action_id}\"{type_hint} iframe=\"true\" use=\"({action_id}, 'your text', submit:true, iframe:true)\">{text}</Input>\n"

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

                    # 🔧 INTERNAL CAPABILITIES: Handle server-side capabilities directly
                    internal_caps = load_internal_capabilities()
                    if action in internal_caps:
                        print(f"🔧 Routing internal capability: {action}")
                        result = execute_internal_capability(action, params)
                        # Check if result contains an error
                        has_error = isinstance(result, dict) and "error" in result
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

                        capability_command = {
                            "type": "execute_capability",
                            "id": request_id,
                            "action": action,
                            "params": params
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

                        await ws.send(json.dumps({
                            "ok": True,
                            "message": "HUD toggle initiated"
                        }))
                    else:
                        await ws.send(json.dumps({
                            "ok": False,
                            "error": "Extension not connected"
                        }))

                except Exception as e:
                    print(f"❌ Error toggling HUD: {e}")
                    await ws.send(json.dumps({"ok": False, "error": str(e)}))

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

                        await ws.send(json.dumps({
                            "ok": True,
                            "message": f"Orb theme set to: {theme_name}"
                        }))
                    else:
                        await ws.send(json.dumps({
                            "ok": False,
                            "error": "Extension not connected"
                        }))

                except Exception as e:
                    print(f"❌ Error setting orb theme: {e}")
                    await ws.send(json.dumps({"ok": False, "error": str(e)}))

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
                    
                    print(f"🤖 LLM Instruction: {action_type} on {action_id}")
                    
                    # Forward LLM instruction to extension for execution
                    if EXTENSION_WS and EXTENSION_WS != ws:
                        instruction_msg = {
                            "id": f"llm-{uuid.uuid4().hex[:8]}",
                            "type": "execute_llm_action",
                            "data": {
                                "actionId": action_id,
                                "actionType": action_type,
                                "params": action_params
                            }
                        }
                        
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
                        'domain': matching_domain
                    })

        if matching_capabilities:
            print(f"🎯 Resolved {len(matching_capabilities)} capabilities for URL: {url}")
            for cap in matching_capabilities:
                print(f"  - {cap['action']}: {cap['label']}")

        # 📜 UNIVERSAL CAPABILITIES: Always available on all domains
        universal_capabilities = [
            {
                'id': 'scroll_down',
                'action': 'ScrollDown',
                'label': 'Scroll down one page',
                'description': 'Scrolls the viewport down by one screen height',
                'command': 'scroll',
                'params': {'direction': 'down'},
                'domain': 'universal'
            },
            {
                'id': 'scroll_up',
                'action': 'ScrollUp',
                'label': 'Scroll up one page',
                'description': 'Scrolls the viewport up by one screen height',
                'command': 'scroll',
                'params': {'direction': 'up'},
                'domain': 'universal'
            },
            {
                'id': 'scroll_left',
                'action': 'ScrollLeft',
                'label': 'Scroll left one page',
                'description': 'Scrolls the viewport left by one screen width',
                'command': 'scroll',
                'params': {'direction': 'left'},
                'domain': 'universal'
            },
            {
                'id': 'scroll_right',
                'action': 'ScrollRight',
                'label': 'Scroll right one page',
                'description': 'Scrolls the viewport right by one screen width',
                'command': 'scroll',
                'params': {'direction': 'right'},
                'domain': 'universal'
            },
            {
                'id': 'scroll_top',
                'action': 'ScrollTop',
                'label': 'Scroll to top of page',
                'description': 'Scrolls to the very top of the page',
                'command': 'scroll',
                'params': {'direction': 'top'},
                'domain': 'universal'
            },
            {
                'id': 'scroll_bottom',
                'action': 'ScrollBottom',
                'label': 'Scroll to bottom of page',
                'description': 'Scrolls to the very bottom of the page',
                'command': 'scroll',
                'params': {'direction': 'bottom'},
                'domain': 'universal'
            },
            # 🗂️ TAB CONTROL CAPABILITIES: Browser tab management
            {
                'id': 'switch_tab',
                'action': 'SwitchTab',
                'label': 'Switch to a tab by ID',
                'description': 'Switches to a specific browser tab',
                'command': 'switchTab',
                'params': {},
                'domain': 'universal',
                'usage_example': "--params '{\"tabId\": TAB_ID}'"
            },
            {
                'id': 'open_tab',
                'action': 'OpenTab',
                'label': 'Open a new tab',
                'description': 'Opens a new browser tab with optional URL',
                'command': 'openTab',
                'params': {},
                'domain': 'universal',
                'usage_example': "--params '{\"url\": \"https://example.com\"}'"
            },
            {
                'id': 'close_tab',
                'action': 'CloseTab',
                'label': 'Close a tab by ID',
                'description': 'Closes a specific browser tab',
                'command': 'closeTab',
                'params': {},
                'domain': 'universal',
                'usage_example': "--params '{\"tabId\": TAB_ID}'"
            },
            {
                'id': 'update_tab_url',
                'action': 'UpdateTabURL',
                'label': 'Navigate a tab to a URL',
                'description': 'Updates a tab to navigate to a new URL',
                'command': 'updateTabUrl',
                'params': {},
                'domain': 'universal',
                'usage_example': "--params '{\"tabId\": TAB_ID, \"url\": \"https://example.com\"}'"
            },
            # 🔍 ZOOM CAPABILITIES: Browser zoom control (15% increments)
            {
                'id': 'zoom_in',
                'action': 'ZoomIn',
                'label': 'Zoom in 15%',
                'description': 'Increases page zoom by 15%',
                'command': 'zoomIn',
                'params': {},
                'domain': 'universal'
            },
            {
                'id': 'zoom_out',
                'action': 'ZoomOut',
                'label': 'Zoom out 15%',
                'description': 'Decreases page zoom by 15%',
                'command': 'zoomOut',
                'params': {},
                'domain': 'universal'
            },
            {
                'id': 'zoom_reset',
                'action': 'ZoomReset',
                'label': 'Reset zoom to 100%',
                'description': 'Resets page zoom to default (100%)',
                'command': 'zoomReset',
                'params': {},
                'domain': 'universal'
            }
        ]

        # Append universal capabilities
        matching_capabilities.extend(universal_capabilities)
        print(f"📜 Added {len(universal_capabilities)} universal capabilities (scroll + tab + zoom)")

        # 🔧 INTERNAL CAPABILITIES: Add server-side capabilities (chat, etc.)
        internal_caps = load_internal_capabilities()
        for action_name, cap in internal_caps.items():
            matching_capabilities.append({
                'id': action_name.lower(),
                'action': cap.get('action', action_name),
                'label': cap.get('label', ''),
                'description': cap.get('description', ''),
                'domain': 'internal'
            })
        if internal_caps:
            print(f"🔧 Added {len(internal_caps)} internal capabilities")

        return matching_capabilities

    except Exception as e:
        print(f"❌ Error resolving capabilities for URL: {e}")
        return []


# ============================================================================
# 💬 CHAT STORAGE SYSTEM
# ============================================================================
# Append-only chat storage mirroring ChatGPT-style conversation files.
# Each chat is a single JSON file in ./chats/ directory.
# Messages are always appended to the end — never inserted or reordered.
# ============================================================================

CHATS_DIR = "chats"


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
    Generate a unique chat_id from the first three words of the prompt.

    Format: <three-word-slug>__<timestamp>
    Example: check-youtube-comments__20251130T211523

    @param prompt: User's initial message
    @param now: Current datetime (UTC)
    @return: Unique chat_id string
    """
    # Extract first three words
    words = prompt.strip().split()[:3]
    slug_text = " ".join(words) if words else "chat"

    # Lowercase and replace non-alphanumeric with hyphens
    slug = slug_text.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)  # Collapse multiple hyphens
    slug = slug.strip("-")  # Trim leading/trailing hyphens

    if not slug:
        slug = "chat"

    # Generate timestamp: YYYYMMDDTHHMMSS
    timestamp = now.strftime("%Y%m%dT%H%M%S")

    return f"{slug}__{timestamp}"


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


def list_chats(project_id: str = None) -> List[Dict[str, Any]]:
    """
    List chats from the chats directory with summary info.

    @param project_id: Optional filter - only return chats with this project_id.
                       Use "default" to get unassigned chats for sidebar.

    Returns a list of chat summaries sorted by created_at (newest first).
    Each summary contains: chat_id, title, date_short, message_count
    """
    from datetime import datetime

    chats_path = ensure_chats_dir_exists()
    chat_summaries = []

    try:
        for filename in os.listdir(chats_path):
            if not filename.endswith(".json"):
                continue

            chat_id = filename[:-5]  # Remove .json extension
            filepath = os.path.join(chats_path, filename)

            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    chat_dict = json.load(f)

                # Filter by project_id if specified
                chat_project = chat_dict.get("project_id", "default")
                if project_id is not None and chat_project != project_id:
                    continue

                # Format date as dd/mmm (e.g., "05/Dec")
                created_at = chat_dict.get("created_at", "")
                date_short = ""
                if created_at:
                    try:
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        date_short = dt.strftime("%d/%b")  # e.g., "05/Dec"
                    except:
                        date_short = ""

                # Extract lightweight summary info
                summary = {
                    "chat_id": chat_id,
                    "title": chat_dict.get("title", "Untitled"),
                    "date_short": date_short,
                    "message_count": len(chat_dict.get("messages", []))
                }
                chat_summaries.append(summary)

            except Exception as e:
                print(f"⚠️ Error reading chat {filename}: {e}")
                continue

        # Sort by created_at descending (newest first)
        chat_summaries.sort(key=lambda x: x.get("date_short", ""), reverse=True)
        print(f"📋 Listed {len(chat_summaries)} chats (project_id={project_id})")

    except Exception as e:
        print(f"❌ Error listing chats: {e}")

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
        return True
    except Exception as e:
        print(f"❌ Error saving chat {chat_id}: {e}")
        import traceback
        traceback.print_exc()
        return False


def create_new_chat(chat_id: str, prompt: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a new chat dictionary with initial metadata.

    @param chat_id: The unique chat identifier
    @param prompt: The initial user prompt
    @param meta: Additional metadata (page_url, page_title, etc.)
    @return: New chat dictionary
    """
    now_iso = datetime.utcnow().isoformat() + "Z"

    # Default title from first three words
    words = prompt.strip().split()[:3]
    default_title = " ".join(words) if words else "New Chat"

    return {
        "chat_id": chat_id,
        "project_id": "default",  # "default" = unassigned, otherwise user project ID
        "created_at": now_iso,
        "updated_at": now_iso,
        "title": default_title,
        "default_title": default_title.lower(),
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


async def main():
    """
    🚀 Main server function - starts WebSocket server on port 17892

    The server listens for connections from:
    - Chrome extension (becomes EXTENSION_WS)
    - Test clients (can send commands and receive responses)

    📡 SERVER ENDPOINT: ws://127.0.0.1:17892
    """
    # 🎯 PREMIUM: Load site configs on startup (Polling Mode)
    await start_site_config_polling()

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
