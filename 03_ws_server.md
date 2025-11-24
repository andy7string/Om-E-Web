# WebSocket Server (ws_server.py) - Function Documentation

## Overview

The WebSocket server (`ws_server.py`) is the central communication hub for the Om_E_Web system. It acts as a bridge between the Chrome extension (content script + service worker) and external clients (test scripts, LLMs, or automation tools). The server handles:

- Real-time bidirectional WebSocket communication
- Message routing between extension and clients
- Artifact generation (JSONL files, markdown files)
- Intelligence data processing and storage
- Transcript management with deduplication
- Site configuration management
- Element classification and filtering

**Port:** 17892
**Protocol:** WebSocket (ws://127.0.0.1:17892)
**Max Message Size:** 64 MiB
**Heartbeat:** 20 seconds

## Architecture

### Global State Management
- **CLIENTS**: Set of all connected WebSocket clients
- **EXTENSION_WS**: Reference to the Chrome extension WebSocket connection
- **PENDING**: Dict mapping command IDs to futures for async response handling
- **COMMAND_CLIENTS**: Dict mapping command IDs to originating clients for response routing
- **CURRENT_TABS_INFO**: Latest tab information from extension
- **CURRENT_ACTIVE_TAB**: Current active tab metadata
- **CURRENT_PAGE_DATA**: Latest page intelligence data (actionable elements, page state)
- **CURRENT_CONTENT_DATA**: Latest page content structure
- **SITE_CONFIGS**: Loaded site configurations with capabilities
- **CURRENT_TRANSCRIPTS_INFO**: List of saved transcript references

### Message Flow
```
External Client → Server → Extension (forward commands)
Extension → Server → External Client (route responses)
Extension → Server → File System (persist artifacts)
```

### File Organization
```
@site_structures/
├── page.jsonl              # Current page state with actions (JSONL records)
├── content.jsonl           # Current page content structure
├── text.md                 # Human-readable page text with frontmatter
├── llm_actions.json        # Action ID → metadata mapping for LLM
├── llm_prompt.md           # Compact prompt with actions (legacy)
└── transcripts/
    ├── video_history.jsonl # Historical transcript metadata
    └── *.md                # Individual transcript files
```

---

## Function Catalog

### get_all_site_configs (Line 54)
**Type:** sync
**Purpose:** Load site configuration index and individual domain config files
**Parameters:** None
**Returns:** `dict` - Site configurations with capabilities, or empty dict if load fails
**Called by:** resolve_capabilities_for_url, main (on startup)
**Calls:** None
**Description:** Loads `web_extension/site_configs.json` index file, then loads each individual domain config file referenced in the index. Caches loaded configs in `SITE_CONFIGS` global. Returns mapping of domain → config with framework, selectors, and capabilities.

---

### slugify (Line 129)
**Type:** sync
**Purpose:** Create filesystem-friendly slugs for transcript filenames
**Parameters:**
- `value` (str): Input string to slugify
**Returns:** `str` - Slugified string
**Called by:** save_transcripts
**Calls:** None
**Description:** Converts strings to lowercase, removes special characters, replaces spaces with hyphens, and collapses multiple hyphens. Used for generating safe transcript filenames.

---

### consolidate_actionable_elements_to_menus (Line 140)
**Type:** async
**Purpose:** Consolidate raw actionable elements into clean menu structure
**Parameters:**
- `actionable_elements` (list): Raw actionable elements from extension
**Returns:** `dict` - Clean menu structure with consolidated menus and summary
**Called by:** save_intelligence_to_page_jsonl (legacy fallback path)
**Calls:** None
**Description:** Categorizes elements by type (navigation, toggle, action, content), builds main navigation menu with items and toggles. Returns structured menu data with summary statistics. **NOTE:** This is legacy code used only when normalized records are not available.

---

### consolidate_content_elements_to_structure (Line 246)
**Type:** async
**Purpose:** Consolidate raw content elements into clean content structure
**Parameters:**
- `content_elements` (list): Raw content elements from extension
**Returns:** `dict` - Clean content structure with categorized content and summary
**Called by:** save_content_to_content_jsonl
**Calls:** None
**Description:** Categorizes content elements by type (headings, paragraphs, lists, images, tables), creates structured representation with IDs, text, selectors, and attributes. Returns consolidated structure with summary statistics.

---

### save_intelligence_to_page_jsonl (Line 389)
**Type:** async
**Purpose:** Save intelligence data to central page.jsonl file
**Parameters:**
- `intelligence_data` (dict): Intelligence update data from extension
- `transcript_refs` (list, optional): List of transcript references to include
**Returns:** `str` - File path if successful, None if failed
**Called by:** handler (intelligence_update message)
**Calls:** consolidate_actionable_elements_to_menus (fallback)
**Description:** Maintains single up-to-date file representing current page state. Handles two paths: (1) **Normalized path** - writes enriched normalized records with browser state, page context, transcripts; (2) **Legacy path** - consolidates menus for older format. Enriches meta record with browser state, active tab info, and page version. Writes JSONL with one record per line.

---

### save_content_to_content_jsonl (Line 515)
**Type:** async
**Purpose:** Save content data to central content.jsonl file
**Parameters:**
- `intelligence_data` (dict): Intelligence update data from extension
- `transcript_refs` (list, optional): List of transcript references to include
**Returns:** `str` - File path if successful, None if failed
**Called by:** handler (intelligence_update message)
**Calls:** consolidate_content_elements_to_structure
**Description:** Maintains single up-to-date file representing current page content structure. Applies content consolidation before saving, adds browser state and page context. Saves to content.jsonl with timestamp, browser state, content structure, page state, and summary statistics.

---

### _ensure_video_history_file (Line 588)
**Type:** sync
**Purpose:** Ensure video history JSONL file exists
**Parameters:** None
**Returns:** None
**Called by:** _append_video_history_entry
**Calls:** None
**Description:** Creates `@site_structures/transcripts/video_history.jsonl` if it doesn't exist, including parent directories.

---

### _load_video_history_entries (Line 597)
**Type:** sync
**Purpose:** Return historical transcript metadata stored in video_history.jsonl
**Parameters:** None
**Returns:** `list[dict]` - List of historical transcript entries
**Called by:** _collect_existing_transcript_signatures
**Calls:** None
**Description:** Reads video_history.jsonl line by line, parses each JSON entry, silently skips malformed lines. Returns empty list if file doesn't exist.

---

### _append_video_history_entry (Line 616)
**Type:** sync
**Purpose:** Append a JSON line entry to the video history JSONL file
**Parameters:**
- `entry` (Dict[str, Any]): History entry to append
**Returns:** None
**Called by:** save_transcripts
**Calls:** _ensure_video_history_file
**Description:** Ensures history file exists, then appends entry as JSON line. Used for tracking all transcript saves.

---

### _collect_existing_transcript_signatures (Line 623)
**Type:** sync
**Purpose:** Gather known transcript signatures keyed by signature value → video_id
**Parameters:** None
**Returns:** `Dict[str, Optional[str]]` - Dict mapping signature → video_id
**Called by:** save_transcripts
**Calls:** _load_video_history_entries
**Description:** Reads history file and existing transcript markdown files, extracts signatures from embedded comments or generates fallback signatures for legacy files. Returns mapping used for deduplication.

---

### _build_transcript_signature (Line 672)
**Type:** sync
**Purpose:** Create a stable signature for a transcript payload
**Parameters:**
- `video_id` (Optional[str]): Video identifier
- `segments` (List[Dict[str, Any]]): Transcript segments
**Returns:** `Optional[str]` - Signature string or None if no segments
**Called by:** save_transcripts
**Calls:** None
**Description:** Creates signature from video_id, segment count, and sample of first/last 3 segments. Format: `{video_id}:{segment_count}:{sha256_hash}`. Used for deduplication.

---

### save_transcripts (Line 687)
**Type:** async
**Purpose:** Persist transcript payloads (e.g., YouTube text) to disk with deduplication
**Parameters:**
- `transcripts` (list): List of transcript payloads from extension
- `page_state` (dict, optional): Page state for default title
**Returns:** `list[dict]` - List of saved transcript references
**Called by:** handler (intelligence_update message)
**Calls:** _collect_existing_transcript_signatures, _build_transcript_signature, _append_video_history_entry, slugify
**Description:** For each transcript: (1) builds signature, (2) checks for duplicates, (3) skips if duplicate found, (4) generates slug from title, (5) writes markdown file with frontmatter and timestamped segments, (6) appends to history. Returns list of saved transcript refs with file paths.

---

### process_actionable_elements_for_llm (Line 804)
**Type:** async
**Purpose:** Process actionable elements for LLM consumption
**Parameters:**
- `actionable_elements` (List[Dict[str, Any]]): List of actionable elements from extension
**Returns:** `Optional[Dict[str, Dict[str, Any]]]` - LLM action mapping or None
**Called by:** handler (intelligence_update message - currently disabled)
**Calls:** clear_llm_actions
**Description:** Transforms actionable elements into LLM-friendly format with action mappings and execution instructions. Creates `llm_actions.json` with page context metadata and action details (action_type, description, selectors, coordinates). **NOTE:** Currently disabled in favor of semantic text extraction.

---

### save_page_text_to_markdown (Line 876)
**Type:** async
**Purpose:** Save page text to markdown file
**Parameters:**
- `text_data` (dict): Text extraction data from extension
**Returns:** `str` - File path if successful, None if failed
**Called by:** handler (text extraction response)
**Calls:** None
**Description:** Extracts URL, generates hostname-based filename, writes markdown content to `@site_structures/{hostname}_page_text.md`. Prints statistics (headings, paragraphs, lists, file size).

---

### clear_llm_actions (Line 923)
**Type:** async
**Purpose:** Clear LLM actions when no actionable elements are available
**Parameters:** None
**Returns:** `Optional[str]` - File path if successful, None if failed
**Called by:** process_actionable_elements_for_llm
**Calls:** None
**Description:** Creates empty `llm_actions.json` file with page context metadata to indicate no actions available on current page.

---

### store_dom_change_context (Line 964)
**Type:** async
**Purpose:** Store DOM change context for LLM consumption
**Parameters:**
- `dom_change_data` (dict): DOM change notification data
**Returns:** None
**Called by:** handler (dom_content_changed message)
**Calls:** None
**Description:** Creates change context entry with timestamp, tab_id, total mutations, change types. **NOTE:** File writing is disabled to reduce noise - only logs significant changes (>5 mutations).

---

### _format_table_row_label (Line 1000)
**Type:** sync
**Purpose:** Derive a human-friendly label for table/list rows (e.g., Gmail emails)
**Parameters:**
- `record` (Dict[str, Any]): Record with textContent
**Returns:** `Dict[str, Optional[str]]` - Dict with display, sender, subject, time, preview, raw
**Called by:** _map_prompt_action_sentence
**Calls:** None
**Description:** Parses comma-separated text content to extract structured parts (sender, subject, time, preview). Handles email-specific patterns like "unread", "has attachment", timestamps. Returns formatted display string and individual parts.

---

### _map_prompt_action_sentence (Line 1058)
**Type:** sync
**Purpose:** Map a record to LLM prompt action sentence
**Parameters:**
- `record` (Dict[str, Any]): Normalized record from page.jsonl
**Returns:** `Optional[str]` - Action sentence or None if filtered out
**Called by:** generate_llm_prompt
**Calls:** _format_table_row_label
**Description:** Converts normalized records into LLM-friendly action sentences. Filters out hidden elements unless they're important (interactive rows, input elements, accessibility links, video links). Generates sentences like `return (a_id_X) to click 'Label'` or `return (a_id_X,{yourValue}) to set value for 'Label'. Add submit:true to submit.` Handles table rows, inputs, links, buttons, and generic interactions.

---

### generate_llm_prompt (Line 1146)
**Type:** sync
**Purpose:** Generate compact LLM prompt file with actions organized by category
**Parameters:**
- `text_md_path` (str): Path to text.md file
- `page_jsonl_path` (str): Path to page.jsonl file
- `out_path` (str): Output path for llm_prompt.md
- `max_actions` (int): Maximum actions to include (default from config.py)
**Returns:** `Optional[str]` - Output path if successful, None if failed
**Called by:** handler (intelligence_update message - currently disabled)
**Calls:** _map_prompt_action_sentence, resolve_capabilities_for_url
**Description:** Reads text.md and page.jsonl, extracts title/URL/page version, maps records to action sentences, deduplicates, applies SPA filtering (prunes stale elements based on page version), smart categorizes actions (search, transcript, emails, videos, channels, footer, regular), resolves capabilities from site config, generates organized markdown with sections. **NOTE:** Currently disabled in favor of semantic text.md generation.

---

### get_current_tabs_info (Line 1575)
**Type:** sync
**Purpose:** Get the latest tab information received from extension
**Parameters:** None
**Returns:** `dict` - Tabs info with metadata or error status
**Called by:** handler (getTabsInfo command)
**Calls:** None
**Description:** Returns stored tab information including tabs array, last update timestamp, extension connection status, and total clients. Used for external programmatic access to tab state.

---

### get_current_page_data (Line 1598)
**Type:** sync
**Purpose:** Get the latest page intelligence data received from extension
**Parameters:** None
**Returns:** `dict` - Page intelligence data with metadata or error status
**Called by:** handler (getPageData command)
**Calls:** None
**Description:** Returns stored page intelligence including actionable elements, page state, browser state, and metadata. Provides external access to current page intelligence for LLM consumption.

---

### get_current_content_data (Line 1622)
**Type:** sync
**Purpose:** Get the latest page content data received from extension
**Parameters:** None
**Returns:** `dict` - Page content data with metadata or error status
**Called by:** handler (getContentData command)
**Calls:** None
**Description:** Returns stored page content including content structure, summary statistics, browser state, and metadata. Provides external access to current page content for LLM consumption.

---

### get_current_active_tab (Line 1646)
**Type:** sync
**Purpose:** Get the current active tab information
**Parameters:** None
**Returns:** `dict` - Active tab info with metadata or error status
**Called by:** handler (getActiveTab command)
**Calls:** None
**Description:** Returns stored active tab info (preferred source) or searches CURRENT_TABS_INFO for active tab (fallback). Provides quick access to active tab for LLM interactions and automation. Includes source indicator (active_tab_info_message or tabs_info_fallback).

---

### save_site_map_to_jsonl (Line 1706)
**Type:** sync
**Purpose:** Save site map data to a JSONL file in @site_structures folder
**Parameters:**
- `site_map_data` (dict): Raw site map data from extension
- `suffix` (str): Optional suffix for filename (e.g., "_clean")
**Returns:** `str` - File path if successful, None if failed
**Called by:** handler (auto-save on generateSiteMap response - currently disabled)
**Calls:** None
**Description:** Extracts URL, generates hostname-based filename, writes site map to `@site_structures/{hostname}{suffix}.jsonl`. **NOTE:** Currently disabled in favor of direct processing.

---

### process_clean_site_map (Line 1743)
**Type:** sync
**Purpose:** Process raw site map file into LLM-friendly format
**Parameters:**
- `raw_file_path` (str): Path to _clean.jsonl file
**Returns:** `Tuple[dict, dict, bool]` - (processed_data, mapping_data, success_status)
**Called by:** handler (auto-processing after save - currently disabled)
**Calls:** None
**Description:** Reads raw JSONL, extracts interactive elements, adds FindMe_id to each element, creates LLM-optimized structure, generates element mapping. **NOTE:** Currently disabled in favor of process_clean_site_map_data.

---

### process_clean_site_map_data (Line 1831)
**Type:** sync
**Purpose:** Process raw site map data directly into LLM-friendly format with enhanced classification
**Parameters:**
- `raw_data` (dict): Raw site map data from extension
**Returns:** `Tuple[dict, dict, bool]` - (processed_data, mapping_data, success_status)
**Called by:** handler (direct processing on generateSiteMap response)
**Calls:** deduplicate_elements, filter_non_interactive_elements, classify_element_enhanced
**Description:** Extracts interactive elements, applies deduplication and filtering, applies enhanced classification using browser-use techniques, creates FindMe_id for each element, builds processed data with classification statistics, returns processed data and mapping. Provides detailed logging of filtering and classification results.

---

### siteStructuredLLMmethodinsidethefile (Line 2027)
**Type:** sync
**Purpose:** Post-process written file to remove unnecessary fields and create smaller optimized file
**Parameters:**
- `filepath` (str): Path to processed file
**Returns:** `bool` - True if successful, False if failed
**Called by:** handler (after process_clean_site_map_data)
**Calls:** calculate_element_importance_score
**Description:** Cleans metadata (keep only url/title), removes statistics section, consolidates pageStructure with elements, merges headings/forms into elements array, applies enhanced element filtering based on classification scores or importance scores, creates consolidated elements with context, writes cleaned file as `{filename}_cleaned.jsonl`. Provides detailed breakdown of element types and score distribution.

---

### classify_element_enhanced (Line 2317)
**Type:** sync
**Purpose:** Enhanced element classification using browser-use techniques
**Parameters:**
- `element_data` (dict): Raw element data from extension
**Returns:** `dict` - Enhanced classification with confidence scores
**Called by:** process_clean_site_map_data
**Calls:** _matches_interactive_pattern
**Description:** Implements sophisticated element detection and classification with 7 factors: (1) Interactive element detection (strict selectors for buttons, inputs, links), (2) Accessibility property analysis (ARIA attributes), (3) Search element detection (class names, IDs, data attributes), (4) Content quality assessment (text length, patterns), (5) Functional importance (navigation, forms, links), (6) Visibility score (coordinates, dimensions), (7) Element categorization (search, navigation, form, content, heading). Returns comprehensive classification with confidence scores (0.0-1.0) and reasons.

---

### _matches_interactive_pattern (Line 2629)
**Type:** sync
**Purpose:** Helper function to check if element matches interactive pattern
**Parameters:**
- `element_data` (dict): Element data dictionary
- `pattern` (dict): Pattern dictionary with matching criteria
**Returns:** `bool` - True if element matches pattern
**Called by:** classify_element_enhanced
**Calls:** None
**Description:** Checks if element matches pattern criteria: tag match, attribute match (type, has_href, not_placeholder). Used for strict interactive element detection in enhanced classification.

---

### deduplicate_elements (Line 2667)
**Type:** sync
**Purpose:** Remove duplicate elements based on content and position
**Parameters:**
- `elements` (list): List of element dictionaries
**Returns:** `list` - Deduplicated list of elements
**Called by:** process_clean_site_map_data
**Calls:** _normalize_selector, _should_keep_existing_element
**Description:** Creates unique keys based on href (for real links), text+selector (for text elements), or type+selector (for others). Compares elements with same key and keeps better one based on priority (real links > better selectors > more content). Returns deduplicated list.

---

### _normalize_selector (Line 2736)
**Type:** sync
**Purpose:** Normalize CSS selector for better deduplication
**Parameters:**
- `selector` (str): CSS selector string
**Returns:** `str` - Normalized selector
**Called by:** deduplicate_elements
**Calls:** None
**Description:** Removes nth-child selectors, specific IDs, normalizes common class patterns. Used for comparing selectors that are functionally equivalent but syntactically different.

---

### _should_keep_existing_element (Line 2760)
**Type:** sync
**Purpose:** Determine which element to keep when duplicates are found
**Parameters:**
- `existing` (dict): Existing element
- `new_element` (dict): New element to compare
**Returns:** `bool` - True if existing should be kept, False if new should replace
**Called by:** deduplicate_elements
**Calls:** None
**Description:** Priority order: (1) Real links over placeholders, (2) More specific selectors (shorter), (3) More content (longer text). Used during deduplication.

---

### filter_non_interactive_elements (Line 2805)
**Type:** sync
**Purpose:** Filter out elements that are not actually interactive
**Parameters:**
- `elements` (list): List of element dictionaries
**Returns:** `list` - Filtered list with only truly interactive elements
**Called by:** process_clean_site_map_data
**Calls:** _is_truly_interactive
**Description:** Removes elements marked as interactive but lacking actual interactive properties. Returns filtered list.

---

### _is_truly_interactive (Line 2832)
**Type:** sync
**Purpose:** Check if an element is truly interactive
**Parameters:**
- `element` (dict): Element dictionary
**Returns:** `bool` - True if element is truly interactive
**Called by:** filter_non_interactive_elements
**Calls:** None
**Description:** Checks for: (1) Real href (not #, not javascript:), (2) Interactive tags (button, input, select, textarea, a), (3) Interactive ARIA roles, (4) Event handlers (onclick, etc.), (5) Interactive attributes (type="button"), (6) Clickable class indicators. Returns True if any condition met.

---

### calculate_element_importance_score (Line 2899)
**Type:** sync
**Purpose:** Calculate importance score for an element (0.0 to 1.0)
**Parameters:**
- `element` (dict): Element dictionary
**Returns:** `float` - Score from 0.0 to 1.0
**Called by:** siteStructuredLLMmethodinsidethefile (fallback scoring)
**Calls:** None
**Description:** Scoring factors: (1) Element type (interactive=0.4, heading=0.35, form=0.3, form_input=0.25, other=0.1), (2) Content quality (text length: >50=0.2, >20=0.15, >5=0.1, else=0.05), (3) Functionality (real link=0.15, placeholder=0.05), (4) Context relevance (navigation/main_content/interaction=0.1), (5) Selector quality (YouTube-specific or generic meaningful=0.05). Capped at 1.0.

---

### handler (Line 2969)
**Type:** async
**Purpose:** WebSocket connection handler for each client
**Parameters:**
- `ws` (WebSocket): WebSocket connection object
**Returns:** None
**Called by:** websockets.serve (main)
**Calls:** consolidate_actionable_elements_to_menus, consolidate_content_elements_to_structure, save_intelligence_to_page_jsonl, save_content_to_content_jsonl, save_transcripts, process_actionable_elements_for_llm, save_page_text_to_markdown, clear_llm_actions, store_dom_change_context, process_clean_site_map_data, siteStructuredLLMmethodinsidethefile, get_current_tabs_info, get_current_page_data, get_current_content_data, get_current_active_tab, resolve_capabilities_for_url
**Description:** Main WebSocket message handler. Manages client lifecycle, identifies extension vs test clients, routes messages bidirectionally. Handles message types: ping/pong (heartbeat), bridge_status (extension identification), tabs_info (tab updates), active_tab_info (active tab updates), intelligence_update (page intelligence + artifact generation), execute_capability (capability execution), dom_content_changed (DOM change notifications), network_activity (network monitoring), extractPageText (text extraction), llm_instruction (LLM action execution), getTabsInfo/getPageData/getContentData/getActiveTab (internal commands), command forwarding (extension commands), response routing (route responses to clients). Implements shortcut normalization (exec_action, set_value, click, navigate_link, navigate_url). Cleans up on disconnect.

**Key Message Handlers:**
- **intelligence_update**: Saves transcripts, generates page.jsonl, content.jsonl, text.md, triggers transcript button hunt on YouTube
- **execute_capability**: Routes capability execution to extension
- **llm_instruction**: Forwards LLM instructions to extension as execute_llm_action
- **extractPageText**: Forwards text extraction to extension, saves result to markdown
- **generateSiteMap response**: Auto-processes site map with enhanced classification and filtering

---

### send_command (Line 3659)
**Type:** async
**Purpose:** Internal command sender for server-to-extension communication
**Parameters:**
- `command` (str): Command name
- `params` (dict, optional): Command parameters
- `timeout` (float): Timeout in seconds (default 8.0)
**Returns:** `dict` - Response from extension
**Called by:** None (internal utility, not currently used)
**Calls:** None
**Description:** Generates unique command ID, creates future in PENDING dict, sends command to extension via WebSocket, waits for response with timeout. Used for internal server commands that need responses. Cleans up PENDING entry after response or timeout.

---

### extension_heartbeat_loop (Line 3715)
**Type:** async
**Purpose:** Periodically ping the extension to detect silent disconnections
**Parameters:** None
**Returns:** None (runs indefinitely)
**Called by:** main
**Calls:** None
**Description:** Sends server_ping message to extension every SERVER_HEARTBEAT_INTERVAL seconds (20s). Helps detect when extension silently disappears. Logs success/failure of each heartbeat.

---

### resolve_capabilities_for_url (Line 3731)
**Type:** sync
**Purpose:** Resolve capabilities for a given URL from site_configs.json
**Parameters:**
- `url` (str): URL to resolve capabilities for
**Returns:** `list[dict]` - List of capability dicts with action, label, description, handler
**Called by:** generate_llm_prompt, handler (text.md generation)
**Calls:** get_all_site_configs
**Description:** (1) Finds matching site config by domain or url_patterns, (2) Extracts capabilities from config, (3) Filters capabilities by url_pattern to return only matching ones. Returns list of capabilities with id, action, label, description, handler, domain. Logs resolved capabilities.

---

### main (Line 3800)
**Type:** async
**Purpose:** Main server function - starts WebSocket server on port 17892
**Parameters:** None
**Returns:** None (runs indefinitely)
**Called by:** __main__
**Calls:** start_site_config_polling, extension_heartbeat_loop
**Description:** (1) Loads site configs with polling, (2) Starts WebSocket server on ws://127.0.0.1:17892 with max_size=64 MiB, max_queue=128, ping_interval=20s, (3) Runs extension heartbeat loop concurrently with server. Listens for connections from Chrome extension and test clients.

---

## Function Interactions

### Message Processing Flow

**Intelligence Update Flow:**
```
Extension → handler (intelligence_update)
  → save_transcripts (if transcripts present)
    → _collect_existing_transcript_signatures
      → _load_video_history_entries
    → _build_transcript_signature
    → slugify
    → _append_video_history_entry
      → _ensure_video_history_file
  → save_intelligence_to_page_jsonl
    → consolidate_actionable_elements_to_menus (fallback)
  → save_content_to_content_jsonl
    → consolidate_content_elements_to_structure
  → Write text.md with capabilities
    → resolve_capabilities_for_url
      → get_all_site_configs
```

**Site Map Processing Flow:**
```
Extension → handler (generateSiteMap response)
  → process_clean_site_map_data
    → deduplicate_elements
      → _normalize_selector
      → _should_keep_existing_element
    → filter_non_interactive_elements
      → _is_truly_interactive
    → classify_element_enhanced
      → _matches_interactive_pattern
  → siteStructuredLLMmethodinsidethefile
    → calculate_element_importance_score (fallback)
```

**LLM Prompt Generation Flow (Legacy):**
```
handler (intelligence_update)
  → generate_llm_prompt
    → _map_prompt_action_sentence
      → _format_table_row_label
    → resolve_capabilities_for_url
      → get_all_site_configs
```

### Command Routing Flow

**Test Client → Extension:**
```
Test Client → handler (command message)
  → Store command_id → client in COMMAND_CLIENTS
  → Forward to EXTENSION_WS
Extension → handler (response message)
  → Look up client in COMMAND_CLIENTS
  → Route response to original client
```

**Internal Command Flow:**
```
Test Client → handler (getTabsInfo/getPageData/getContentData/getActiveTab)
  → get_current_tabs_info / get_current_page_data / etc.
  → Send response directly to client (no extension involved)
```

---

## Integration Points

### Extension Integration (via WebSocket)

**Messages Sent to Extension:**
- `server_ping` - Heartbeat ping
- `youtube_find_transcript_button` - Trigger transcript button hunt on YouTube
- `execute_capability` - Execute capability action
- `execute_llm_action` - Execute LLM instruction
- `extractPageText` - Request text extraction
- Command forwarding (navigate, click, etc.)

**Messages Received from Extension:**
- `ping/pong` - Heartbeat responses
- `bridge_status` - Extension identification
- `tabs_info` - Tab information update
- `active_tab_info` - Active tab update
- `intelligence_update` - Page intelligence data (triggers artifact generation)
- `dom_content_changed` - DOM change notifications
- `network_activity` - Network activity notifications
- Command responses (ok/error/result)

### File System Integration

**Files Written:**
- `@site_structures/page.jsonl` - Current page state with normalized records
- `@site_structures/content.jsonl` - Current page content structure
- `@site_structures/text.md` - Human-readable page text with frontmatter
- `@site_structures/llm_actions.json` - Action ID → metadata mapping
- `@site_structures/llm_prompt.md` - Compact prompt (legacy)
- `@site_structures/transcripts/*.md` - Individual transcript files
- `@site_structures/transcripts/video_history.jsonl` - Transcript history
- `@site_structures/{hostname}_page_text.md` - Extracted page text
- `@site_structures/{hostname}_processed.jsonl` - Processed site map
- `@site_structures/{hostname}_processed_cleaned.jsonl` - Optimized site map

**Files Read:**
- `web_extension/site_configs.json` - Site config index
- `web_extension/configs/*.json` - Individual domain configs
- `@site_structures/transcripts/video_history.jsonl` - Historical transcripts
- `@site_structures/transcripts/*.md` - Existing transcript files
- `@site_structures/page.jsonl` - For LLM prompt generation
- `@site_structures/text.md` - For LLM prompt generation

### Site Config Integration

**Config Loading:**
- `get_all_site_configs()` - Loads on startup, caches in SITE_CONFIGS global
- `start_site_config_polling()` - Watches for config changes (polling mode)

**Capability Resolution:**
- `resolve_capabilities_for_url(url)` - Matches URL to domain, filters capabilities by url_pattern
- Used in: LLM prompt generation, text.md generation

**Persistent Selectors:**
- Used in SPA filtering to keep persistent elements across page versions
- Prevents stale element pruning for important navigation elements

---

## Orphaned Functions

**None identified.** All functions are either:
1. Called by `handler` (main message handler)
2. Called by other functions in the processing pipeline
3. Called by `main` (startup)
4. Helper functions with clear call paths

**Note:** `send_command` (Line 3659) is defined but not currently used. It was designed for internal server-to-extension commands but the current architecture uses direct WebSocket sending instead. This is intentional for simplicity and is kept for potential future use.

---

## Key Design Patterns

### 1. Event-Driven Architecture
The server is entirely event-driven, reacting to WebSocket messages. No polling or timers except for heartbeat.

### 2. Artifact Generation on Intelligence Update
Every time the extension sends `intelligence_update`, the server:
1. Saves transcripts (with deduplication)
2. Writes page.jsonl (normalized records)
3. Writes content.jsonl (content structure)
4. Writes text.md (human-readable with capabilities)

This ensures artifacts are always in sync with current page state.

### 3. Signature-Based Transcript Deduplication
Transcripts use stable signatures (video_id + segment_count + sample hash) to avoid duplicates. Signatures are embedded in markdown files and tracked in video_history.jsonl.

### 4. Enhanced Element Classification
Site map processing uses browser-use-inspired techniques:
- **7-factor scoring** (interactivity, accessibility, search, content, functionality, visibility)
- **Strict interactive patterns** (buttons, inputs, real links only)
- **Confidence-based filtering** (keeps high-confidence elements)

### 5. SPA Support with Page Versioning
Action IDs include page version (`a_id_{version}_{counter}`). LLM prompt generation prunes stale elements unless they match `persistent_selectors` in site config.

### 6. Capability-Driven Automation
Capabilities are resolved server-side from URL + site_configs.json. No capability data is stored from extension - always resolved dynamically. This ensures capabilities are always up-to-date with config file.

### 7. Command Response Routing
Uses `COMMAND_CLIENTS` dict to track which client sent each command, enabling accurate response routing in multi-client scenarios.

---

## Performance Considerations

### Message Size Limits
- Max WebSocket frame: 64 MiB
- Max queue: 128 messages
- Handles large intelligence updates with normalized records

### File I/O Patterns
- **Append-only**: video_history.jsonl (efficient)
- **Overwrite**: page.jsonl, content.jsonl, text.md (ensures current state)
- **Create-once**: Transcript markdown files (deduplication prevents rewrites)

### Memory Management
- `SITE_CONFIGS` cached in memory after first load
- `CURRENT_TABS_INFO`, `CURRENT_PAGE_DATA`, `CURRENT_CONTENT_DATA` updated on each message
- `PENDING` dict cleaned up after command completion or timeout
- `COMMAND_CLIENTS` dict cleaned up when clients disconnect

### Logging Strategy
- **Verbose**: Intelligence updates, artifact generation, capability resolution
- **Reduced**: DOM changes (>5 mutations only), network activity (idle detection only)
- **Disabled**: DOM change history file (too noisy)

---

## Future Enhancements

### Potential Improvements
1. **WebSocket reconnection**: Auto-reconnect extension on disconnect
2. **Streaming artifacts**: Stream large intelligence updates instead of single message
3. **Incremental updates**: Update artifacts incrementally instead of full rewrites
4. **Response correlation**: Better tracking for async command/response pairs
5. **Rate limiting**: Throttle intelligence updates during rapid page changes
6. **Compression**: Compress large WebSocket messages
7. **Authentication**: Add token-based auth for external clients

### Disabled Features (Candidates for Removal)
1. **generate_llm_prompt()** - Replaced by semantic text.md generation
2. **process_actionable_elements_for_llm()** - Conflicts with semantic extraction
3. **save_site_map_to_jsonl()** - Replaced by direct processing
4. **DOM change history file** - Too noisy, disabled logging

---

## Error Handling Patterns

### Try-Catch Blocks
Almost all functions have try-catch blocks with:
- Error logging with descriptive messages
- Traceback printing for debugging
- Graceful fallbacks (return None, empty dict, or False)

### Safe Defaults
- Empty lists/dicts when data unavailable
- Status messages in response objects
- Fallback paths for legacy data formats

### Cleanup on Disconnect
- Remove client from CLIENTS set
- Clear EXTENSION_WS if extension disconnects
- Clean up COMMAND_CLIENTS entries for disconnected client
- Log disconnect events

---

## Dependencies

### Python Libraries
- `asyncio` - Async event loop
- `websockets` - WebSocket server
- `json` - JSON parsing
- `uuid` - Unique ID generation
- `os` - File system operations
- `re` - Regex for text processing
- `time` - Timestamps
- `hashlib` - SHA256 for transcript signatures
- `datetime` - Timestamps for transcripts
- `typing` - Type hints
- `urllib.parse` - URL parsing

### Internal Modules
- `config` - MAX_ACTIONS, MAX_FOOTER_LINKS constants
- `site_config_manager` - get_site_config, start_site_config_polling, get_all_site_configs

---

## Testing Strategy

### Manual Testing
1. Start server: `python om_e_web_ws/ws_server.py`
2. Load extension in Chrome
3. Navigate to page, verify artifacts generated
4. Send test commands via `test_navigation.py`
5. Check terminal logs for message flow

### Test Files
- `test_navigation.py` - CLI test harness for action execution

### Verification Points
1. **Artifact generation**: Check @site_structures/ files created
2. **Transcript deduplication**: Reload same video, verify no duplicate
3. **Element classification**: Check processed.jsonl for scores
4. **Capability resolution**: Verify capabilities in text.md
5. **SPA filtering**: Check llm_prompt.md for stale element pruning

---

## Configuration

### Global Constants
- `MAX_ACTIONS` - From config.py
- `MAX_FOOTER_LINKS` - From config.py
- `SERVER_HEARTBEAT_INTERVAL` - 20 seconds
- `SITE_STRUCTURES_DIR` - "@site_structures"
- `CURRENT_PAGE_JSONL` - "page.jsonl"
- `CURRENT_CONTENT_JSONL` - "content.jsonl"
- `TRANSCRIPTS_DIR` - "@site_structures/transcripts"
- `VIDEO_HISTORY_JSONL` - "@site_structures/transcripts/video_history.jsonl"

### WebSocket Config
- **Host**: 127.0.0.1
- **Port**: 17892
- **Max frame size**: 64 MiB
- **Max queue**: 128
- **Ping interval**: 20s
- **Ping timeout**: 20s

---

## Conclusion

The WebSocket server is the backbone of the Om_E_Web system, handling:
- Real-time bidirectional communication
- Artifact generation and persistence
- Transcript management with deduplication
- Enhanced element classification
- Capability resolution
- Command routing
- Error handling and logging

It's designed for reliability, extensibility, and clear separation of concerns. The event-driven architecture ensures responsiveness, while the artifact generation pipeline ensures LLMs always have up-to-date page intelligence.
