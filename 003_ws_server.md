# ws_server.py - Comprehensive Documentation

**File:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/ws_server.py`
**Purpose:** WebSocket server that bridges Chrome Extension and test clients, manages artifact generation, and processes intelligence updates.

---

## Table of Contents

1. [Overview](#overview)
2. [Global State](#global-state)
3. [Core Functions](#core-functions)
4. [Artifact Generation](#artifact-generation)
5. [Message Handling](#message-handling)
6. [Capabilities System](#capabilities-system)
7. [Data Flow](#data-flow)
8. [Status Indicators](#status-indicators)

---

## Overview

The WebSocket server acts as the central hub for the Om_E_Web system, handling:
- **Bidirectional WebSocket communication** between Chrome Extension and test clients
- **Artifact generation** (page.jsonl, content.jsonl, text.md, llm_prompt.md, transcripts)
- **Intelligence processing** from extension DOM scans
- **Capability resolution** for site-specific automation
- **Message routing** with command ID tracking

**Server Endpoint:** `ws://127.0.0.1:17892`

---

## Global State

### Connection Management
```python
CLIENTS = set()                    # All connected WebSocket clients
EXTENSION_WS = None               # Reference to Chrome extension client
PENDING = {}                       # Command ID → Future mapping for responses
COMMAND_CLIENTS = {}              # Command ID → Client mapping for routing
```

### Tab Information
```python
CURRENT_TABS_INFO = None          # Latest tabs_info from extension
LAST_TABS_UPDATE = None           # Timestamp of last update
CURRENT_ACTIVE_TAB = None         # Current active tab information
```

### Page Intelligence
```python
CURRENT_PAGE_DATA = None          # Latest page intelligence data
LAST_PAGE_UPDATE = None           # Timestamp of last page update
CURRENT_PAGE_JSONL = "page.jsonl" # Central page.jsonl file path
```

### Content Data
```python
CURRENT_CONTENT_DATA = None       # Latest page content data
LAST_CONTENT_UPDATE = None        # Timestamp of last content update
CURRENT_CONTENT_JSONL = "content.jsonl" # Central content.jsonl file path
```

### Transcripts
```python
TRANSCRIPTS_DIR = "@site_structures/transcripts"
CURRENT_TRANSCRIPTS_INFO = []     # List of saved transcript references
VIDEO_HISTORY_JSONL = "transcripts/video_history.jsonl"
```

### Site Configurations
```python
SITE_CONFIGS = {}                 # Loaded from web_extension/site_configs.json
```

### Configuration
```python
SITE_STRUCTURES_DIR = "@site_structures"
SERVER_HEARTBEAT_INTERVAL = 20    # seconds
MAX_ACTIONS = (from config.py)
MAX_FOOTER_LINKS = (from config.py)
```

---

## Core Functions

### 1. **get_all_site_configs()**
**Purpose:** Load site_configs.json from extension directory
**Input:** None
**Output:** `dict` - Site configurations with capabilities, empty dict on failure
**File I/O:** Reads `../web_extension/site_configs.json`
**Calls:** None

**Details:**
- Caches loaded configs in `SITE_CONFIGS` global
- Returns cached version if already loaded
- Logs success/failure with emoji indicators

---

### 2. **slugify(value: str) → str**
**Purpose:** Create filesystem-friendly slugs for transcript filenames
**Input:** `value` (str) - Raw string to slugify
**Output:** `str` - Slugified string (lowercase, hyphens, no special chars)
**Calls:** None

**Transformation:**
- Converts to lowercase
- Replaces non-alphanumeric with hyphens
- Collapses multiple hyphens
- Strips leading/trailing hyphens

---

### 3. **consolidate_actionable_elements_to_menus(actionable_elements)**
**Purpose:** Organize raw actionable elements into clean menu structure
**Input:** `actionable_elements` (list) - Raw elements from extension
**Output:** `dict` - Menu structure with consolidated menus
**Calls:** None

**Categories:**
- Navigation elements (menu items)
- Toggle elements (buttons with toggle behavior)
- Action elements (clickable items)
- Content elements (other)

**Output Structure:**
```json
{
  "menus": [
    {
      "id": "main_navigation",
      "type": "main_navigation",
      "name": "Main Navigation",
      "items": [...],
      "toggles": [...]
    }
  ],
  "summary": {
    "total_menus": 1,
    "total_items": 10,
    "navigation_links": 8,
    "toggle_buttons": 2
  }
}
```

---

### 4. **consolidate_content_elements_to_structure(content_elements)**
**Purpose:** Organize raw content elements into clean content structure
**Input:** `content_elements` (list) - Raw content elements from extension
**Output:** `dict` - Content structure with categorized elements
**Calls:** None

**Categories:**
- Headings (h1-h6)
- Paragraphs (p)
- Lists (ul, ol, li)
- Images (img)
- Tables (table, tr, td, th)

**Output Structure:**
```json
{
  "content_structure": {
    "headings": [...],
    "paragraphs": [...],
    "lists": [...],
    "images": [...],
    "tables": [...]
  },
  "summary": {
    "total_content_elements": 150,
    "headings": 10,
    "paragraphs": 80,
    "lists": 30,
    "images": 20,
    "tables": 10
  }
}
```

---

## Artifact Generation

### ✅ NEW: Active Artifact Generation

#### 5. **save_intelligence_to_page_jsonl(intelligence_data, transcript_refs=None)**
**Purpose:** Save intelligence data to central page.jsonl file
**Input:**
- `intelligence_data` (dict) - Intelligence update from extension
- `transcript_refs` (list, optional) - Transcript reference objects

**Output:** `str` - File path if successful, `None` if failed
**File I/O:** Writes `@site_structures/page.jsonl`
**Calls:**
- `consolidate_actionable_elements_to_menus()` (legacy fallback)

**Process:**
1. Ensures `@site_structures` directory exists
2. Gets current browser state (tabs, active tab)
3. **Preferred:** Uses `normalizedRecords` from intelligence_data (JSONL format)
4. **Fallback:** Consolidates actionable elements (legacy JSON format)
5. Enriches meta record with browser_state, current_page, pageVersion, transcripts
6. Writes enriched records to page.jsonl (one JSON object per line)

**Normalized Records Format (JSONL):**
```jsonl
{"type":"meta","id":"meta-page","url":"...","title":"...","pageVersion":2,"browser_state":{...},"transcripts":[...]}
{"type":"section","id":"section-0","heading":"...","level":1,"items":[...]}
{"type":"action","id":"a_id_2_0","tag":"button","label":"...","actionTypes":["click"],...}
{"type":"text","id":"text-0","content":"..."}
```

**Legacy Format (JSON):**
```json
{
  "timestamp": 1234567890.123,
  "browser_state": {...},
  "current_page": {...},
  "menu_structure": {...},
  "page_state": {...},
  "recent_insights": [...],
  "summary": {...},
  "intelligence_version": "2.0",
  "transcripts": [...]
}
```

---

#### 6. **save_content_to_content_jsonl(intelligence_data, transcript_refs=None)**
**Purpose:** Save content data to central content.jsonl file
**Input:**
- `intelligence_data` (dict) - Intelligence update from extension
- `transcript_refs` (list, optional) - Transcript references

**Output:** `str` - File path if successful, `None` if failed
**File I/O:** Writes `@site_structures/content.jsonl`
**Calls:**
- `consolidate_content_elements_to_structure()`

**Process:**
1. Extracts `contentElements` from intelligence_data
2. Consolidates into structured format (headings, paragraphs, lists, images, tables)
3. Enriches with browser_state, current_page, transcripts
4. Writes to content.jsonl

**Output Format:**
```json
{
  "timestamp": 1234567890.123,
  "browser_state": {...},
  "current_page": {...},
  "content_structure": {
    "headings": [...],
    "paragraphs": [...],
    "lists": [...],
    "images": [...],
    "tables": [...]
  },
  "page_state": {...},
  "summary": {...},
  "intelligence_version": "2.0",
  "transcripts": [...]
}
```

---

#### 7. **save_transcripts(transcripts, page_state=None)**
**Purpose:** Persist transcript payloads (YouTube, etc.) to disk with deduplication
**Input:**
- `transcripts` (list) - Transcript objects with segments
- `page_state` (dict, optional) - Current page state

**Output:** `list` - Transcript references (title, video_id, video_url, file path, signature)
**File I/O:**
- Writes `@site_structures/transcripts/{date}__{slug}.md`
- Appends to `@site_structures/transcripts/video_history.jsonl`

**Calls:**
- `_build_transcript_signature()` - Generate content-based signature
- `_collect_existing_transcript_signatures()` - Load known signatures
- `_ensure_video_history_file()` - Ensure history file exists
- `_append_video_history_entry()` - Append history entry
- `slugify()` - Generate filename slug

**Process:**
1. Ensures transcripts directory exists
2. Loads existing signatures to detect duplicates
3. For each transcript:
   - Builds signature from video_id + segment count + sample segments
   - Skips if signature matches existing transcript
   - Generates filename: `{YYYY-MM-DD}__{slug}.md`
   - Writes markdown file with embedded signature comment
   - Appends entry to video_history.jsonl
4. Returns list of transcript references for page.jsonl

**Transcript File Format:**
```markdown
<!-- signature: video_id:42:abc123... -->
# Video Title

**Video URL:** https://youtube.com/watch?v=...
**Video ID:** abc123
**Language:** en
**Collected At:** 2025-01-23T10:30:00Z
**Segments:** 42

---

- [00:00] First segment text
- [00:05] Second segment text
- [00:10] Third segment text — _aria label if different_
```

**Deduplication Strategy:**
- Content-based signature: `video_id:segment_count:sha256(samples)`
- Checks signature against:
  1. `video_history.jsonl` entries
  2. Embedded signatures in existing `.md` files
  3. Fallback signature from file content (legacy files)
- Skips writing if signature already exists

---

#### 8. **Text.md Generation (Inline in handler())**
**Purpose:** ✅ NEW - Generate single text.md file with page content and capabilities
**Location:** Lines 3111-3167 in `handler()` function
**Trigger:** `intelligence_update` message from extension

**Input:**
- `intelligence_data.semanticPageData.text` (preferred) or `intelligence_data.pageText` (fallback)
- `page_state.url` - Current page URL
- `page_state.title` - Current page title

**Output:** Writes `@site_structures/text.md`
**Calls:**
- `resolve_capabilities_for_url()` - Get site-specific capabilities

**Process:**
1. Extracts semantic text or plain text from intelligence_data
2. Resolves capabilities for current URL
3. Writes markdown file with:
   - Frontmatter (title, URL, timestamp)
   - **Capabilities section** (if any match current URL)
   - Page content text

**Output Format:**
```markdown
# Page Title

**URL:** https://example.com/page
**Timestamp:** 2025-01-23 10:30:00

## Available Actions

The following pre-configured actions are available for this page:

**RetrieveTranscript** - Get video transcript
  - Retrieves the full transcript for this YouTube video
  - Usage: `python3 test_navigation.py --command capability --capability RetrieveTranscript`

---

---

[Full page text content here...]
```

**Status:** ✅ **ACTIVE** - This is the NEW approach for text content + capabilities

---

#### 9. **generate_llm_prompt(text_md_path, page_jsonl_path, out_path, max_actions=MAX_ACTIONS)**
**Purpose:** ⚠️ REDUNDANT - Generate compact llm_prompt.md (OLD approach)
**Input:**
- `text_md_path` (str) - Path to text.md file
- `page_jsonl_path` (str) - Path to page.jsonl file
- `out_path` (str) - Output path for llm_prompt.md
- `max_actions` (int) - Maximum actions to include

**Output:** `str` - Output path if successful, `None` if failed
**File I/O:**
- Reads `text.md`
- Reads `page.jsonl`
- Writes `llm_prompt.md`

**Calls:**
- `_map_prompt_action_sentence()` - Convert action records to prompt sentences
- `_format_table_row_label()` - Format Gmail-style row labels
- `resolve_capabilities_for_url()` - Get site-specific capabilities
- `get_site_config()` - Get persistent selectors for SPA filtering

**Process:**
1. Reads title from text.md frontmatter
2. Reads action records from page.jsonl (JSONL format)
3. Maps action records to prompt sentences using `_map_prompt_action_sentence()`
4. **Deduplicates** actions (removes exact duplicates)
5. **SPA Filtering:** Prunes stale elements based on pageVersion
   - Parses action IDs: `a_id_{version}_{counter}`
   - Keeps elements where `action_version >= pageVersion`
   - Keeps persistent elements (from site_config.persistent_selectors)
6. **Smart Categorization:** Groups actions by pattern-based detection
   - Search inputs (search in label/placeholder/aria-label)
   - Transcript actions (transcript in label)
   - Email actions (table rows with role="row")
   - Video links (/watch?v= in href)
   - Channel links (/@ or /channel/ in href)
   - Footer links (common footer keywords)
   - Regular actions (everything else)
7. **Capabilities Injection:** Resolves and adds capabilities for current URL
8. Writes llm_prompt.md with categorized sections

**Output Format:**
```markdown
# (2) Page Title

**URL:** https://example.com/page

## Actions
### Search
- return (a_id_2_0,{yourValue}) to set value for 'Search'. Add submit:true to submit.

### Capabilities
- return (RetrieveTranscript) to get video transcript

### Transcript
- return (a_id_2_5) to click 'Show transcript'

### Videos
- return (a_id_2_10) to navigate to 'Video Title'

### Other Actions
- return (a_id_2_15) to click 'Subscribe'

### Footer
- return (a_id_2_20) to navigate to 'About'

## Transcript Files
- Video Title (42 segments): @site_structures/transcripts/2025-01-23__video-title.md
```

**Status:** ⚠️ **REDUNDANT** - Being replaced by text.md (which includes capabilities). Currently DISABLED in handler() (lines 3173-3185).

**Key Differences from text.md:**
- text.md: Content-focused, includes full page text + capabilities
- llm_prompt.md: Action-focused, lists available actions with categories + capabilities

**Recommendation:** Keep llm_prompt.md for action reference, but text.md is primary for LLM consumption.

---

#### 10. **process_actionable_elements_for_llm(actionable_elements)**
**Purpose:** 🚫 DISABLED - Process actionable elements for LLM (generates llm_actions.json)
**Status:** 🚫 **DISABLED** - Commented out in handler() line 3168-3171
**Reason:** Conflicts with semantic extraction approach

**Original Purpose:**
- Convert actionable elements to LLM-friendly format
- Save to `llm_actions.json` with action ID lookup table

**Output:** `dict` - LLM action mapping (or None if disabled)
**File I/O:** Writes `@site_structures/llm_actions.json`

**Note:** This function is currently disabled because semantic extraction provides a better approach for LLM consumption.

---

### Supporting Functions for Artifact Generation

#### 11. **_format_table_row_label(record) → dict**
**Purpose:** Derive human-friendly labels for table/list rows (Gmail emails, etc.)
**Input:** `record` (dict) - Action record with textContent
**Output:** `dict` - Parsed components (display, sender, subject, time, preview, raw)

**Parsing Logic:**
- Splits textContent by commas
- Identifies sender, subject, time, preview components
- Formats display label: `{sender} — {subject} ({time}) — {preview}`
- Handles Gmail-specific patterns (unread, starred, attachments)

---

#### 12. **_map_prompt_action_sentence(record) → str | None**
**Purpose:** Convert action record to LLM prompt sentence
**Input:** `record` (dict) - Action record from page.jsonl
**Output:** `str` - Prompt sentence like `return (a_id_0) to click 'Button'`, or `None` if filtered

**Filtering Rules:**
1. Only processes `type == "action"` records
2. **Hidden element filtering:**
   - ✅ ALLOWS: Interactive table rows (tr with role="row", li/div with interactive roles)
   - ✅ ALLOWS: Input/textarea elements (hidden but critical for automation)
   - ✅ ALLOWS: Accessibility links with meaningful labels
   - ✅ ALLOWS: Video links (YouTube /watch?v= pattern)
   - 🚫 BLOCKS: Other hidden elements

**Sentence Formats:**
- Input: `return (a_id_0,{yourValue}) to set value for 'Search'. Add submit:true to submit.`
- Link: `return (a_id_0) to navigate to 'Home'`
- Button: `return (a_id_0) to click 'Subscribe'`
- Table row: `return (a_id_0) to click 'Email: Sender — Subject (12:30 PM)'`
- Generic: `return (a_id_0) to interact with 'Label'`

---

#### 13. **_ensure_video_history_file()**
**Purpose:** Ensure video_history.jsonl file exists
**Calls:** None
**File I/O:** Creates `transcripts/video_history.jsonl` if missing

---

#### 14. **_load_video_history_entries() → list**
**Purpose:** Load historical transcript metadata from video_history.jsonl
**Output:** `list` - History entries (dicts)
**Calls:** None
**File I/O:** Reads `transcripts/video_history.jsonl`

---

#### 15. **_append_video_history_entry(entry)**
**Purpose:** Append JSON line entry to video_history.jsonl
**Input:** `entry` (dict) - History entry
**Calls:** `_ensure_video_history_file()`
**File I/O:** Appends to `transcripts/video_history.jsonl`

---

#### 16. **_collect_existing_transcript_signatures() → dict**
**Purpose:** Gather known transcript signatures from history + markdown files
**Output:** `dict` - Signature → video_id mapping
**Calls:**
- `_load_video_history_entries()`

**File I/O:**
- Reads `transcripts/video_history.jsonl`
- Reads all `.md` files in `transcripts/` directory

**Process:**
1. Loads signatures from video_history.jsonl
2. Scans markdown files for embedded `<!-- signature: ... -->` comments
3. Falls back to content-based signature for legacy files
4. Returns signature → video_id mapping

---

#### 17. **_build_transcript_signature(video_id, segments) → str | None**
**Purpose:** Create stable signature for transcript payload
**Input:**
- `video_id` (str) - Video ID
- `segments` (list) - Transcript segments

**Output:** `str` - Signature format: `{video_id}:{segment_count}:{sha256_hash}`

**Algorithm:**
- Samples first 3 and last 3 segments
- Concatenates timeText + text[:120] for each
- Hashes: `video_id|segment_count|sample_str`
- Returns: `video_id:segment_count:sha256`

---

#### 18. **save_page_text_to_markdown(text_data)**
**Purpose:** 🚫 OLD - Save page text to markdown file (hostname-based naming)
**Status:** ⚠️ Replaced by inline text.md generation in handler()

**Input:** `text_data` (dict) - Text extraction data from extension
**Output:** `str` - File path if successful, `None` if failed
**File I/O:** Writes `@site_structures/{hostname}_page_text.md`

**Note:** This function writes to hostname-based files (e.g., `youtube.com_page_text.md`), while the NEW approach writes to a single `text.md` file.

---

#### 19. **clear_llm_actions() → str | None**
**Purpose:** Clear LLM actions when no actionable elements are available
**Output:** `str` - File path if successful, `None` if failed
**File I/O:** Writes empty `@site_structures/llm_actions.json`

**Process:**
- Creates empty actions file with `_page_context` metadata
- Indicates no actions available with `status: "no_actionable_elements"`

---

#### 20. **store_dom_change_context(dom_change_data)**
**Purpose:** 🚫 DISABLED - Store DOM change context for LLM consumption
**Status:** 🚫 File writing disabled (line 959), only logs significant changes (>5 mutations)

**Input:** `dom_change_data` (dict) - DOM change notification
**Original File I/O:** Would write to `@site_structures/dom_change_history.jsonl` (DISABLED)

**Note:** DOM change logging was too noisy, so file writing is disabled. Only terminal logging remains.

---

### 🚫 OLD/DISABLED: Legacy Artifact Functions

#### 21. **save_site_map_to_jsonl(site_map_data, suffix="") → str | None**
**Purpose:** 🚫 OLD - Save site map data to JSONL file
**Status:** 🚫 No longer used (replaced by normalized records)

---

#### 22. **process_clean_site_map(raw_file_path) → tuple**
**Purpose:** 🚫 OLD - Process raw site map into LLM-friendly format
**Status:** 🚫 No longer used

---

#### 23. **process_clean_site_map_data(raw_data) → tuple**
**Purpose:** 🚫 OLD - Process raw site map data with enhanced classification
**Status:** 🚫 No longer used
**Note:** This function had advanced filtering/classification but was superseded by the normalized records approach.

---

## Message Handling

### 24. **handler(ws) - Main WebSocket Handler**
**Purpose:** Handle WebSocket connection lifecycle and message routing
**Input:** `ws` (WebSocket) - Client WebSocket connection
**Output:** None (async event handler)

**Client Identification:**
1. First client to connect becomes `EXTENSION_WS`
2. Clients sending `bridge_status` are marked as extension
3. Other clients treated as test clients

**Message Types Handled:**

#### A. **Shortcut Normalization (Lines 2979-3034)**
Converts client sugar shortcuts to existing message flows:
- `exec_action` → `llm_instruction`
- `set_value` → `llm_instruction` with actionType="setValue"
- `click` → `llm_instruction` with actionType="click"
- `navigate_link` → `llm_instruction` with actionType="navigate"
- `navigate_url` → command="navigate"

#### B. **Heartbeat Messages (Lines 3036-3052)**
- `ping` → Responds with `pong`
- `pong` → Logged

#### C. **Extension Identification (Lines 3054-3057)**
- `bridge_status` → Marks sender as `EXTENSION_WS`

#### D. **Tab Information (Lines 3059-3081)**
- `tabs_info` → Stores in `CURRENT_TABS_INFO` global
- `active_tab_info` → Stores in `CURRENT_ACTIVE_TAB` global, logs to terminal

#### E. **Intelligence Update (Lines 3083-3213)** ✅ **CRITICAL FLOW**
**Message:** `{"type": "intelligence_update", "data": {...}}`

**Process:**
1. Extracts intelligence_data (actionableElements, normalizedRecords, semanticPageData, transcripts)
2. **Save transcripts** → `save_transcripts()` → Returns transcript_refs
3. **Save page.jsonl** → `save_intelligence_to_page_jsonl()` with transcript_refs
4. **Save content.jsonl** → `save_content_to_content_jsonl()` with transcript_refs
5. ✅ **NEW: Generate text.md** (inline, lines 3111-3167):
   - Extracts semantic text or plain text
   - Resolves capabilities for current URL
   - Writes frontmatter + capabilities + content
6. 🚫 **DISABLED: Process actionable elements** (line 3168-3171)
7. 🚫 **DISABLED: Generate llm_prompt.md** (line 3173-3185)
8. **YouTube-specific:** Triggers transcript button hunt if `/watch?v=` detected

**Status Updates:**
- ✅ text.md generation: **ACTIVE**
- 🚫 llm_actions.json generation: **DISABLED**
- 🚫 llm_prompt.md generation: **DISABLED** (but function still exists)

#### F. **Capability Execution (Lines 3215-3256)**
**Message:** `{"type": "execute_capability", "action": "...", "params": {...}}`

**Process:**
1. Validates action parameter
2. Forwards to extension as `execute_capability` message
3. Returns immediate response (TODO: Wait for extension response)

#### G. **DOM Change Notifications (Lines 3258-3273)**
**Message:** `{"type": "dom_content_changed", "data": {...}}`

**Process:**
1. Logs mutation count and change types
2. Calls `store_dom_change_context()` (file writing disabled)

#### H. **Network Activity (Lines 3275-3298)**
**Message:** `{"type": "network_activity", "data": {...}}`

**Process:**
1. Logs network events (request_end, response_end)
2. Detects network idle (inflightRequests == 0)
3. No file I/O (terminal logging only)

#### I. **Text Extraction (Lines 3300-3341)**
**Message:** `{"type": "extractPageText", "data": {}}`

**Process:**
1. Forwards to extension as `extractPageText` message
2. Waits for response with markdown content
3. Calls `save_page_text_to_markdown()` on response

#### J. **LLM Instruction (Lines 3343-3395)**
**Message:** `{"type": "llm_instruction", "data": {"actionId": "...", "actionType": "...", "params": {...}}}`

**Process:**
1. Extracts actionId, actionType, params
2. Forwards to extension as `execute_llm_action` message
3. Returns immediate confirmation to client

#### K. **Command Forwarding (Lines 3397-3459)**
**Messages with:** `{"id": "...", "command": "...", "params": {...}}`

**Internal Server Commands (no extension forwarding):**
- `getTabsInfo` → Returns `CURRENT_TABS_INFO`
- `getPageData` → Returns `CURRENT_PAGE_DATA`
- `getContentData` → Returns `CURRENT_CONTENT_DATA`
- `getActiveTab` → Returns `CURRENT_ACTIVE_TAB`

**Extension Commands (forwarded):**
- All other commands forwarded to `EXTENSION_WS`
- Tracks command ID in `COMMAND_CLIENTS` for response routing

#### L. **Response Handling (Lines 3461-3553)**
**Messages with:** `{"id": "...", "ok": true/false, "result": {...}, "error": "..."}`

**Special Response Types:**
1. **Text Extraction Response** (lines 3464-3497):
   - Detects by `id.startswith("text-")` or `statistics.totalHeadings` presence
   - Calls `save_page_text_to_markdown()`

2. **LLM Instruction Response** (lines 3499-3531):
   - Detects by `id.startswith("llm-")` or `type == "execute_llm_action"`
   - Logs execution result

3. **Generic Response Routing** (lines 3532-3553):
   - Looks up original client in `COMMAND_CLIENTS`
   - Routes response back to original sender
   - Cleans up tracking dictionaries

---

### 25. **send_command(command, params=None, timeout=8.0)**
**Purpose:** Send command to extension and wait for response (helper for external clients)
**Input:**
- `command` (str) - Command name
- `params` (dict, optional) - Command parameters
- `timeout` (float) - Response timeout in seconds

**Output:** Response data or raises RuntimeError on timeout
**Calls:** None

**Process:**
1. Generates unique command ID
2. Creates Future for response tracking
3. Stores Future in `PENDING[command_id]`
4. Sends command to `EXTENSION_WS`
5. Waits for response with timeout
6. Returns result or raises TimeoutError

---

### 26. **extension_heartbeat_loop()**
**Purpose:** Periodically ping extension to detect disconnection
**Calls:** None

**Process:**
- Sends `server_ping` every 20 seconds to `EXTENSION_WS`
- Logs success/failure
- Runs continuously in background

---

## Capabilities System

### 27. **resolve_capabilities_for_url(url) → list**
**Purpose:** ✅ **CRITICAL** - Resolve site-specific capabilities for given URL
**Input:** `url` (str) - Current page URL
**Output:** `list` - Capability dicts with action, label, description, handler
**Calls:** `get_all_site_configs()`

**Process:**
1. Loads site configs from `site_configs.json`
2. Finds matching site config by domain or url_patterns
3. Extracts capabilities from matched config
4. Filters capabilities by `url_pattern` (only returns capabilities whose url_pattern matches current URL)
5. Returns list of matching capabilities

**Example Output:**
```python
[
  {
    'id': 'transcript',
    'action': 'RetrieveTranscript',
    'label': 'Get video transcript',
    'description': 'Retrieves the full transcript for this YouTube video',
    'handler': 'youtube_transcript_pipeline',
    'domain': 'youtube.com'
  }
]
```

**Usage in Artifact Generation:**
- ✅ Called in **text.md generation** (line 3136) to inject capabilities section
- ✅ Called in **llm_prompt.md generation** (line 1477) to add capabilities to Actions section

**Why This Matters:**
- Capabilities are **URL-dependent** (only show "Get transcript" on `/watch?v=` pages)
- Enables **context-aware automation** without hardcoding logic in runtime code
- Powers the **capability pipeline** (separate from action-ID pipeline)

---

## Data Flow

### Intelligence Update Flow (Most Common)

```
Extension (DOM scan)
  ↓
  intelligence_update message
  ↓
ws_server.py handler()
  ↓
  ├─→ save_transcripts()               [if transcripts present]
  │     └─→ transcripts/*.md           [WRITES]
  │     └─→ video_history.jsonl        [APPENDS]
  │
  ├─→ save_intelligence_to_page_jsonl()
  │     └─→ page.jsonl                 [WRITES - normalized records JSONL]
  │
  ├─→ save_content_to_content_jsonl()
  │     └─→ content.jsonl              [WRITES - content structure JSON]
  │
  └─→ text.md generation (inline)
        ├─→ resolve_capabilities_for_url()  [gets capabilities]
        └─→ text.md                    [WRITES - content + capabilities]
```

### LLM Instruction Flow

```
Test Client (test_navigation.py)
  ↓
  llm_instruction message
  ↓
ws_server.py handler()
  ↓
  Forwards as execute_llm_action
  ↓
Extension (EXTENSION_WS)
  ↓
  Executes action in content script
  ↓
  Response message
  ↓
ws_server.py handler()
  ↓
  Routes response back to original client
  ↓
Test Client receives result
```

### Capability Execution Flow

```
Test Client (test_navigation.py)
  ↓
  execute_capability message
  ↓
ws_server.py handler()
  ↓
  Forwards execute_capability
  ↓
Extension (sw.js)
  ↓
  Routes to content script
  ↓
Content script (capabilityPipelineExecutor)
  ↓
  Executes capability handler
  ↓
  Triggers intelligence update
  ↓
[Returns to Intelligence Update Flow above]
```

---

## Status Indicators

### ✅ ACTIVE (Current Production)

1. **text.md generation** - Single file with content + capabilities
2. **page.jsonl generation** - Normalized records (JSONL format)
3. **content.jsonl generation** - Content structure (JSON format)
4. **Transcript saving** - Markdown files with deduplication
5. **Capability resolution** - Dynamic URL-based filtering
6. **Intelligence update processing** - Full flow active

### ⚠️ REDUNDANT (Still exists but may be deprecated)

1. **llm_prompt.md generation** - Action-focused prompt file (function exists, currently disabled in handler)
2. **llm_actions.json generation** - Action ID lookup table (function exists, disabled in handler)

**Why redundant?**
- text.md now includes capabilities section (replaces llm_prompt.md)
- Semantic extraction provides better LLM consumption than raw action tables

**Recommendation:**
- Keep llm_prompt.md function for backwards compatibility
- Consider re-enabling if action-focused view is needed alongside content-focused text.md
- llm_actions.json may be useful for programmatic action lookup (currently replaced by semantic approach)

### 🚫 DISABLED (No longer used)

1. **DOM change history file writing** - Too noisy, only terminal logging remains
2. **Legacy site map functions** - Replaced by normalized records
3. **Hostname-based text files** - Replaced by single text.md

---

## Helper Functions (Data Access)

### 28. **get_current_tabs_info() → dict**
**Purpose:** Get latest tab information for external access
**Output:** `dict` - Tabs info with metadata or error status

### 29. **get_current_page_data() → dict**
**Purpose:** Get latest page intelligence data for external access
**Output:** `dict` - Page data with metadata or error status

### 30. **get_current_content_data() → dict**
**Purpose:** Get latest page content data for external access
**Output:** `dict` - Content data with metadata or error status

### 31. **get_current_active_tab() → dict**
**Purpose:** Get current active tab information for external access
**Output:** `dict` - Active tab with metadata or error status

**Source Priority:**
1. `CURRENT_ACTIVE_TAB` global (from active_tab_info message) - preferred
2. Fallback: Search in `CURRENT_TABS_INFO` for `active: true` tab

---

## Main Entry Point

### 32. **main()**
**Purpose:** Start WebSocket server on port 17892
**Calls:**
- `start_site_config_polling()` - Start polling site_configs.json (from site_config_manager)
- `extension_heartbeat_loop()` - Background heartbeat task

**Server Configuration:**
- Host: `127.0.0.1`
- Port: `17892`
- Max message size: 64 MiB
- Max queue: 128
- Ping interval: 20 seconds
- Ping timeout: 20 seconds

---

## Summary

### Primary Artifact Files (ACTIVE)

1. **page.jsonl** - Normalized page structure (JSONL: meta, sections, actions, text)
2. **content.jsonl** - Content structure (JSON: headings, paragraphs, lists, images, tables)
3. **text.md** - ✅ NEW: Full page content + capabilities section
4. **transcripts/*.md** - Transcript files with deduplication
5. **transcripts/video_history.jsonl** - Transcript metadata history

### Secondary Artifact Files (REDUNDANT)

6. **llm_prompt.md** - ⚠️ Action-focused prompt (function exists, currently disabled)
7. **llm_actions.json** - ⚠️ Action ID lookup table (function exists, currently disabled)

### Deprecated Files (DISABLED)

8. **dom_change_history.jsonl** - 🚫 DOM change log (writing disabled)
9. **{hostname}_page_text.md** - 🚫 Hostname-based text files (replaced by text.md)

### Key Differentiators

**text.md vs llm_prompt.md:**
- **text.md:** Content-first, includes full page text + capabilities section at top
- **llm_prompt.md:** Action-first, categorized list of actions + capabilities as one category

**Current Approach (text.md):**
```markdown
# Page Title
**URL:** ...
**Timestamp:** ...

## Available Actions
**RetrieveTranscript** - Get video transcript
  - Usage: python3 test_navigation.py --command capability --capability RetrieveTranscript

---
[Full page content...]
```

**Old Approach (llm_prompt.md):**
```markdown
# (2) Page Title
**URL:** ...

## Actions
### Search
- return (a_id_0,{value}) to set value for 'Search'

### Capabilities
- return (RetrieveTranscript) to get video transcript

### Videos
- return (a_id_5) to navigate to 'Video 1'
```

**Recommendation:** Use **text.md** as primary LLM consumption file. Keep **llm_prompt.md** for action reference if needed.

---

## Function Call Diagram

### Intelligence Update Processing

```
handler()
  ├─→ save_transcripts()
  │     ├─→ _collect_existing_transcript_signatures()
  │     │     └─→ _load_video_history_entries()
  │     ├─→ _build_transcript_signature()
  │     ├─→ slugify()
  │     ├─→ _ensure_video_history_file()
  │     └─→ _append_video_history_entry()
  │
  ├─→ save_intelligence_to_page_jsonl()
  │     └─→ consolidate_actionable_elements_to_menus() [fallback only]
  │
  ├─→ save_content_to_content_jsonl()
  │     └─→ consolidate_content_elements_to_structure()
  │
  └─→ [inline text.md generation]
        └─→ resolve_capabilities_for_url()
              └─→ get_all_site_configs()
```

### LLM Prompt Generation (DISABLED)

```
generate_llm_prompt()
  ├─→ _map_prompt_action_sentence()
  │     └─→ _format_table_row_label()
  │
  ├─→ resolve_capabilities_for_url()
  │     └─→ get_all_site_configs()
  │
  └─→ get_site_config() [for SPA filtering]
```

---

## End of Documentation

**Generated:** 2025-01-23
**File Version:** ws_server.py (current)
**Key Changes:**
- ✅ text.md generation now active (replaces standalone text files)
- ✅ Capabilities injected into text.md frontmatter
- 🚫 llm_prompt.md generation disabled (function exists but not called)
- 🚫 llm_actions.json generation disabled
- ✅ Normalized records (JSONL) now primary format for page.jsonl
