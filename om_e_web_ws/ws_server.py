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
from urllib.parse import urlparse

# Global state for managing WebSocket connections and command routing
CLIENTS = set()                    # All connected WebSocket clients
PENDING = {}                       # Command ID → Future mapping for response routing
EXTENSION_WS = None               # Reference to the Chrome extension client
COMMAND_CLIENTS = {}              # Command ID → Client mapping for response routing

# 📊 Tab information storage for external access
CURRENT_TABS_INFO = None           # Latest tabs_info from extension
LAST_TABS_UPDATE = None            # Timestamp of last update
CURRENT_ACTIVE_TAB = None          # Current active tab information

# 📁 Site map storage configuration
SITE_STRUCTURES_DIR = "@site_structures"

# 🆕 NEW: Central page.jsonl file for current page state
CURRENT_PAGE_JSONL = "page.jsonl"
CURRENT_PAGE_DATA = None
LAST_PAGE_UPDATE = None

async def save_intelligence_to_page_jsonl(intelligence_data):
    """
    🧠 Save intelligence data to central page.jsonl file
    
    This function maintains a single, up-to-date file representing the current
    page state and actionable elements for LLM consumption.
    
    @param intelligence_data: Intelligence update data from extension
    """
    global CURRENT_PAGE_DATA, LAST_PAGE_UPDATE
    
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
        
        # Prepare page data for JSONL format with browser state
        page_data = {
            "timestamp": time.time(),
            "browser_state": browser_state,
            "current_page": {
                "url": intelligence_data.get("pageState", {}).get("url", "unknown"),
                "title": intelligence_data.get("pageState", {}).get("title", "unknown"),
                "is_active_tab": True if CURRENT_ACTIVE_TAB and CURRENT_ACTIVE_TAB.get("url") == intelligence_data.get("pageState", {}).get("url") else False
            },
            "actionable_elements": intelligence_data.get("actionableElements", []),
            "page_state": intelligence_data.get("pageState", {}),
            "recent_insights": intelligence_data.get("recentInsights", []),
            "total_elements": len(intelligence_data.get("actionableElements", [])),
            "intelligence_version": "2.0"
        }
        
        # Update global state
        CURRENT_PAGE_DATA = page_data
        LAST_PAGE_UPDATE = time.time()
        
        # Save to central page.jsonl file
        filepath = os.path.join(SITE_STRUCTURES_DIR, CURRENT_PAGE_JSONL)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(json.dumps(page_data, ensure_ascii=False, indent=2) + '\n')
        
        print(f"🧠 Intelligence saved to central file: {filepath}")
        print(f"📊 Elements: {page_data['total_elements']}, Insights: {len(page_data['recent_insights'])}")
        print(f"🌐 Browser State: {browser_state['total_tabs']} tabs, Active: {browser_state['active_tab'].get('url', 'unknown') if browser_state['active_tab'] else 'none'}")
        
        return filepath
        
    except Exception as e:
        print(f"❌ Error saving intelligence to page.jsonl: {e}")
        return None

async def process_actionable_elements_for_llm(actionable_elements):
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
            with open(filepath, 'w', encoding='utf-8') as f:
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
        with open(filepath, 'w', encoding='utf-8') as f:
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

async def clear_llm_actions():
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
        with open(filepath, 'w', encoding='utf-8') as f:
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
        
        # Append to change history file
        filepath = os.path.join(SITE_STRUCTURES_DIR, "dom_change_history.jsonl")
        with open(filepath, 'a', encoding='utf-8') as f:
            f.write(json.dumps(change_context, ensure_ascii=False) + '\n')
        
        print(f"🔄 DOM change context stored: {change_context['change_summary']}")
        
        return filepath
        
    except Exception as e:
        print(f"❌ Error storing DOM change context: {e}")
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
        with open(filepath, 'w', encoding='utf-8') as f:
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
        with open(cleaned_filepath, 'w', encoding='utf-8') as f:
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
        
        search_indicators = {
            'search', 'magnify', 'glass', 'lookup', 'find', 'query',
            'search-icon', 'search-btn', 'search-button', 'searchbox',
            'search-input', 'search-field', 'search-form'
        }
        
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
            if attr_name.startswith('data-') and any(indicator in attr_value.lower() for indicator in search_indicators):
                search_relevance = max(search_relevance, 0.7)
                search_reasons.append(f"Search indicator in data attribute: {indicator}")
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
                    
                    # 🆕 NEW: Save to central page.jsonl file
                    await save_intelligence_to_page_jsonl(intelligence_data)
                    
                    # 🆕 NEW: Process actionable elements for LLM consumption
                    # This ensures llm_actions.json is always aligned with current page
                    await process_actionable_elements_for_llm(actionable_elements)
                    
                    print("✅ Intelligence update processed and saved")
                    
                except Exception as e:
                    print(f"❌ Error processing intelligence update: {e}")
                    import traceback
                    traceback.print_exc()
            
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
                                    with open(processed_filename, 'w', encoding='utf-8') as f:
                                        json.dump(processed_data, f, ensure_ascii=False, indent=2)
                                    
                                    # COMMENTED OUT: Save mapping data
                                    # mapping_filename = saved_file.replace("_clean.jsonl", "_mapping.json")
                                    # with open(mapping_filename, 'w', encoding='utf-8') as f:
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
                                
                                with open(filepath, 'w', encoding='utf-8') as f:
                                    json.dump(processed_data, f, ensure_ascii=False, indent=2)
                                
                                print(f"✅ Processed data saved to: {processed_filename}")
                                print(f"📊 Elements: {len(processed_data.get('elements', []))}")
                                
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

async def main():
    """
    🚀 Main server function - starts WebSocket server on port 17892
    
    The server listens for connections from:
    - Chrome extension (becomes EXTENSION_WS)
    - Test clients (can send commands and receive responses)
    
    📡 SERVER ENDPOINT: ws://127.0.0.1:17892
    """
    async with websockets.serve(handler, "127.0.0.1", 17892):
        print("WS listening on ws://127.0.0.1:17892")
        await asyncio.Future()  # Keep server running indefinitely

if __name__ == "__main__":
    asyncio.run(main())
