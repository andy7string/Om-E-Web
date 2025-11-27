# WebSocket Server Documentation (ws_server.py)

## Overview

The WebSocket server (`ws_server.py`) is the central hub of the Om_E_Web system, acting as a bridge between test clients, the Chrome extension, and the file system. It runs on port **17892** and manages:

- Full round-trip communication between test clients and the Chrome extension
- Intelligence data processing and artifact generation
- Real-time page state tracking
- Capability execution routing
- Transcript persistence and deduplication

## Architecture

### Communication Pattern

```
Test Client → ws_server.py (port 17892) → Chrome Extension
                    ↓
            Artifact Files (@site_structures/)
                    ↓
Chrome Extension → ws_server.py → Test Client
```

### Global State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `CLIENTS` | `set` | All connected WebSocket clients |
| `EXTENSION_WS` | WebSocket | Reference to Chrome extension client |
| `PENDING` | `dict` | Command ID → Future mapping for async response routing |
| `COMMAND_CLIENTS` | `dict` | Command ID → Client mapping for response routing |
| `CURRENT_TABS_INFO` | `list` | Latest tabs information from extension |
| `LAST_TABS_UPDATE` | `float` | Timestamp of last tabs update |
| `CURRENT_ACTIVE_TAB` | `dict` | Current active tab information |
| `CURRENT_PAGE_DATA` | `dict` | Latest page intelligence data |
| `LAST_PAGE_UPDATE` | `float` | Timestamp of last page update |
| `CURRENT_CONTENT_DATA` | `dict` | Latest page content data |
| `LAST_CONTENT_UPDATE` | `float` | Timestamp of last content update |
| `CURRENT_TRANSCRIPTS_INFO` | `list` | Current transcript references |
| `SITE_CONFIGS` | `dict` | Loaded site configurations with capabilities |

---

## Core Functions

### Server Lifecycle

#### `async def main()`
**Purpose:** Entry point - starts WebSocket server and background tasks

**What it does:**
- Loads site configs via `start_site_config_polling()`
- Starts WebSocket server on `127.0.0.1:17892`
- Launches `extension_heartbeat_loop()` to monitor extension health
- Configures WebSocket with 64 MiB max frame size

**Called by:** `__main__`

---

#### `async def handler(ws)`
**Purpose:** Main WebSocket connection handler for each client

**What it does:**
- Adds client to `CLIENTS` set
- Identifies extension clients (first to connect or sending `bridge_status`)
- Routes messages between clients based on type
- Cleans up on disconnect

**Message routing logic:**
1. Test client sends command → Routes to extension
2. Extension sends response → Routes back to original test client
3. Extension sends intelligence_update → Processes and saves artifacts
4. Extension sends tabs_info → Stores in global state

**Called by:** websockets.serve() for each connection

---

### Message Handling (Inside handler)

The handler processes these message types:

#### 1. **Shortcut Normalization** (Client Sugar)
Converts shorthand commands to standard message format:
- `exec_action` → `llm_instruction`
- `set_value` → `llm_instruction` with setValue
- `click` → `llm_instruction` with click
- `navigate_link` → `llm_instruction` with navigate
- `navigate_url` → `command: navigate`

#### 2. **Heartbeat Messages** (`ping`/`pong`)
Keeps connections alive and monitors health

#### 3. **Extension Identification** (`bridge_status`)
Marks client as the extension (stores in `EXTENSION_WS`)

#### 4. **Tab Information** (`tabs_info`)
Stores tab data in `CURRENT_TABS_INFO` for external access

#### 5. **Active Tab Information** (`active_tab_info`)
Stores active tab details in `CURRENT_ACTIVE_TAB` and logs to terminal

#### 6. **Intelligence Update** (`intelligence_update`)
**Most important message type** - processes page intelligence:
- Extracts actionable elements and page state
- Saves transcripts via `save_transcripts()`
- Generates `page.jsonl` via `save_intelligence_to_page_jsonl()`
- Generates `content.jsonl` via `save_content_to_content_jsonl()`
- Creates `text.md` from semantic page data
- Triggers YouTube transcript button hunt if on video page

#### 7. **Capability Execution** (`execute_capability`)
Routes capability requests:
- Scroll capabilities → Converts to scroll commands
- Other capabilities → Forwards to extension with request ID
- Stores request ID in `COMMAND_CLIENTS` for response routing

#### 8. **Scroll Execution** (`execute_scroll`)
Handles scroll requests by forwarding to extension

#### 9. **DOM Change Notifications** (`dom_content_changed`)
Tracks DOM mutations (stores context but doesn't persist to reduce noise)

#### 10. **Network Activity** (`network_activity`)
Monitors network requests and detects idle state

#### 11. **Text Extraction** (`extractPageText`)
Forwards text extraction requests to extension

#### 12. **LLM Instructions** (`llm_instruction`)
Processes LLM action requests and forwards to extension as `execute_llm_action`

#### 13. **Command Forwarding** (`command` with `id`)
Routes commands from test clients to extension:
- **Internal commands** handled by server:
  - `getTabsInfo` → Returns `CURRENT_TABS_INFO`
  - `getPageData` → Returns `CURRENT_PAGE_DATA`
  - `getContentData` → Returns `CURRENT_CONTENT_DATA`
  - `getActiveTab` → Returns `CURRENT_ACTIVE_TAB`
- **Extension commands** forwarded with client tracking

#### 14. **Response Handling** (messages with `id` and `ok`/`error`)
Routes responses back to original client:
1. Checks for text extraction response → Saves to markdown
2. Checks for pending future in `PENDING` → Resolves future
3. Checks for tracked client in `COMMAND_CLIENTS` → Routes to client
4. Fallback: Broadcasts to any test client

---

### Intelligence Processing

#### `async def save_intelligence_to_page_jsonl(intelligence_data, transcript_refs=None)`
**Purpose:** Generate central `page.jsonl` file with normalized records

**Parameters:**
- `intelligence_data`: Intelligence update from extension
- `transcript_refs`: List of transcript file references

**What it does:**
- Checks for `normalizedRecords` (preferred format)
- Enriches meta record with browser state and transcript refs
- Falls back to legacy consolidation if normalized records unavailable
- Writes JSONL file with one record per line
- Updates `CURRENT_PAGE_DATA` and `LAST_PAGE_UPDATE`

**Writes to:** `@site_structures/page.jsonl`

**Called by:** `handler()` on intelligence_update

---

#### `async def save_content_to_content_jsonl(intelligence_data, transcript_refs=None)`
**Purpose:** Generate central `content.jsonl` file with content structure

**Parameters:**
- `intelligence_data`: Intelligence update from extension
- `transcript_refs`: List of transcript file references

**What it does:**
- Extracts `contentElements` from intelligence data
- Consolidates via `consolidate_content_elements_to_structure()`
- Enriches with browser state
- Updates `CURRENT_CONTENT_DATA` and `LAST_CONTENT_UPDATE`

**Writes to:** `@site_structures/content.jsonl`

**Called by:** `handler()` on intelligence_update

---

#### `async def consolidate_actionable_elements_to_menus(actionable_elements)`
**Purpose:** Legacy function - organizes actionable elements into menu structures

**What it does:**
- Categorizes elements by type (navigation, toggle, action, content)
- Builds main navigation structure
- Returns consolidated menu structure with summary

**Called by:** `save_intelligence_to_page_jsonl()` (legacy fallback)

**Returns:** Dict with menus and summary

---

#### `async def consolidate_content_elements_to_structure(content_elements)`
**Purpose:** Organize content elements by type (headings, paragraphs, lists, etc.)

**What it does:**
- Categorizes content by type (heading, paragraph, list, image, table)
- Processes each category with metadata
- Returns structured content with summary statistics

**Called by:** `save_content_to_content_jsonl()`

**Returns:** Dict with content_structure and summary

---

### Transcript Management

#### `async def save_transcripts(transcripts, page_state=None)`
**Purpose:** Persist transcript data to disk with deduplication

**Parameters:**
- `transcripts`: List of transcript payloads from extension
- `page_state`: Optional page state for metadata

**What it does:**
- Loads existing transcript signatures from history
- Generates signature for each transcript via `_build_transcript_signature()`
- Skips duplicates based on signature match
- Creates markdown file with frontmatter and timestamped segments
- Appends entry to `video_history.jsonl`
- Updates `CURRENT_TRANSCRIPTS_INFO`

**Writes to:**
- `@site_structures/transcripts/{date}__{slug}.md`
- `@site_structures/transcripts/video_history.jsonl`

**Called by:** `handler()` on intelligence_update

**Returns:** List of transcript reference objects

---

#### `def _build_transcript_signature(video_id, segments)`
**Purpose:** Create stable signature for transcript deduplication

**What it does:**
- Samples first 3 and last 3 segments
- Combines video_id, segment count, and sample text
- Generates SHA256 hash

**Returns:** String like `"{video_id}:{count}:{hash}"`

---

#### `def _collect_existing_transcript_signatures()`
**Purpose:** Build lookup of known transcript signatures

**What it does:**
- Reads `video_history.jsonl`
- Scans existing markdown files for embedded signatures
- Falls back to generating signatures from file content

**Returns:** Dict mapping signature → video_id

---

#### `def _ensure_video_history_file()`
**Purpose:** Ensure history file exists

**Called by:** `_append_video_history_entry()`

---

#### `def _load_video_history_entries()`
**Purpose:** Load historical transcript entries from JSONL

**Returns:** List of history entry dicts

---

#### `def _append_video_history_entry(entry)`
**Purpose:** Append new transcript entry to history file

**Parameters:**
- `entry`: Dict with timestamp, video_id, title, segments, file, signature

---

### Text and Markdown Generation

#### `async def save_page_text_to_markdown(text_data)`
**Purpose:** Save extracted page text to markdown file

**Parameters:**
- `text_data`: Text extraction result with markdown and statistics

**What it does:**
- Extracts URL and generates filename from hostname
- Writes markdown content to file
- Logs content statistics

**Writes to:** `@site_structures/{hostname}_page_text.md`

**Called by:** `handler()` when processing text extraction response

**Returns:** File path or None

---

#### `def generate_llm_prompt(text_md_path, page_jsonl_path, out_path, max_actions=MAX_ACTIONS)`
**Purpose:** Generate LLM-friendly prompt from page data (LEGACY - mostly disabled)

**Parameters:**
- `text_md_path`: Path to text.md file
- `page_jsonl_path`: Path to page.jsonl file
- `out_path`: Output path for llm_prompt.md
- `max_actions`: Maximum actions to include

**What it does:**
- Reads page.jsonl and extracts action records
- Applies SPA filtering (prunes stale elements based on pageVersion)
- Smart categorizes actions (search, transcripts, emails, videos, etc.)
- Resolves capabilities via `resolve_capabilities_for_url()`
- Generates organized markdown with sections

**Called by:** Previously called on intelligence_update (now disabled)

**Returns:** Path to generated file or None

---

#### `def _map_prompt_action_sentence(record)`
**Purpose:** Convert action record to human-readable instruction

**Parameters:**
- `record`: Action record from page.jsonl

**What it does:**
- Filters hidden elements (except important ones like inputs, table rows)
- Formats action instructions based on type:
  - Input/textarea: `return (a_id_123,{yourValue}) to set value for 'label'`
  - Links: `return (a_id_123) to navigate to 'label'`
  - Buttons: `return (a_id_123) to click 'label'`
  - Table rows: `return (a_id_123) to click 'Email: sender — subject'`

**Called by:** `generate_llm_prompt()`

**Returns:** Formatted instruction string or None

---

#### `def _format_table_row_label(record)`
**Purpose:** Extract meaningful labels from table rows (e.g., Gmail emails)

**What it does:**
- Parses comma-separated text content
- Identifies sender, subject, time, preview
- Formats as readable label

**Called by:** `_map_prompt_action_sentence()`

**Returns:** Dict with display, sender, subject, time, preview, raw

---

### State Access Functions

#### `def get_current_tabs_info()`
**Purpose:** External access to latest tab information

**Returns:** Dict with tabs, last_update, extension_connected, total_clients

---

#### `def get_current_page_data()`
**Purpose:** External access to latest page intelligence

**Returns:** Dict with page_data, last_update, extension_connected, totals

---

#### `def get_current_content_data()`
**Purpose:** External access to latest page content

**Returns:** Dict with content_data, last_update, totals

---

#### `def get_current_active_tab()`
**Purpose:** Get current active tab information

**What it does:**
- Returns `CURRENT_ACTIVE_TAB` if available (preferred)
- Falls back to searching `CURRENT_TABS_INFO` for active tab

**Returns:** Dict with active_tab details and metadata

---

### Command Sending

#### `async def send_command(command, params=None, timeout=8.0)`
**Purpose:** Internal function for server-to-extension commands

**Parameters:**
- `command`: Command name (e.g., "navigate", "click")
- `params`: Optional parameters dict
- `timeout`: Response timeout in seconds (default 8.0)

**What it does:**
- Waits for extension to be identified
- Generates unique command ID
- Creates future and stores in `PENDING`
- Sends command to extension
- Waits for response via future
- Cleans up `PENDING` entry

**Used by:** Internal server operations (not test clients)

**Returns:** Response message or raises RuntimeError on timeout

---

### Heartbeat

#### `async def extension_heartbeat_loop()`
**Purpose:** Periodically ping extension to detect silent disconnections

**What it does:**
- Sleeps for `SERVER_HEARTBEAT_INTERVAL` (20 seconds)
- Sends `server_ping` to extension if connected
- Logs failures

**Called by:** `main()` as background task

---

### Capabilities

#### `def resolve_capabilities_for_url(url)`
**Purpose:** Resolve available capabilities for given URL

**Parameters:**
- `url`: Current page URL

**What it does:**
- Loads site configs via `get_all_site_configs()`
- Matches URL hostname to site config domain
- Extracts capabilities that match URL pattern
- Adds universal scroll capabilities
- Returns list of capability dicts with action, label, description

**Called by:** `generate_llm_prompt()`, text.md generation in handler

**Returns:** List of capability dicts

---

#### `def get_all_site_configs()`
**Purpose:** Load site configurations from disk

**What it does:**
- Loads `site_configs.json` (index mapping domain → config file)
- Loads individual config files for each domain
- Caches in `SITE_CONFIGS` global

**Called by:** `resolve_capabilities_for_url()`

**Returns:** Dict mapping domain → config

---

### Utility Functions

#### `def slugify(value)`
**Purpose:** Create filesystem-friendly slug for filenames

**Parameters:**
- `value`: String to slugify

**Returns:** Lowercase string with hyphens instead of special characters

---

#### `async def process_actionable_elements_for_llm(actionable_elements)`
**Purpose:** Process actionable elements into LLM-friendly action mapping (DISABLED)

**What it does:**
- Creates mapping of action_id → metadata
- Enriches with page context
- Saves to `llm_actions.json`

**Called by:** Previously called on intelligence_update (now disabled)

**Returns:** Dict of LLM actions or None

---

#### `async def clear_llm_actions()`
**Purpose:** Clear LLM actions when no elements available

**What it does:**
- Creates empty `llm_actions.json` with page context
- Indicates no actions available

**Called by:** `process_actionable_elements_for_llm()`

**Returns:** File path or None

---

#### `async def store_dom_change_context(dom_change_data)`
**Purpose:** Store DOM change context for LLM (mostly disabled to reduce noise)

**Parameters:**
- `dom_change_data`: DOM change notification from extension

**What it does:**
- Logs significant changes (>5 mutations)
- Does NOT persist to file (too noisy)

**Called by:** `handler()` on dom_content_changed

---

### Site Map Processing (Legacy)

These functions handle the old site map generation flow (mostly disabled):

#### `def save_site_map_to_jsonl(site_map_data, suffix="")`
**Purpose:** Save site map to JSONL file (DISABLED)

#### `def process_clean_site_map(raw_file_path)`
**Purpose:** Process raw site map file into LLM format (DISABLED)

#### `def process_clean_site_map_data(raw_data)`
**Purpose:** Process raw site map data directly (DISABLED)

#### `def siteStructuredLLMmethodinsidethefile(filepath)`
**Purpose:** Post-processing optimization (DISABLED)

#### `def classify_element_enhanced(element_data)`
**Purpose:** Enhanced element classification (DISABLED)

#### `def deduplicate_elements(elements)`
**Purpose:** Remove duplicate elements (DISABLED)

#### `def filter_non_interactive_elements(elements)`
**Purpose:** Filter non-interactive elements (DISABLED)

#### `def calculate_element_importance_score(element)`
**Purpose:** Calculate element importance (DISABLED)

---

## Workflows

### 1. WebSocket Connection Flow

```
Client connects
    ↓
Added to CLIENTS set
    ↓
First client OR bridge_status message?
    ↓ Yes
Set as EXTENSION_WS
    ↓
Listen for messages
    ↓
On disconnect:
  - Remove from CLIENTS
  - Clear EXTENSION_WS if extension
  - Clean up COMMAND_CLIENTS entries
```

---

### 2. Standard Action Execution Flow

```
Test Client: {"type": "llm_instruction", "data": {"actionId": "a_id_123", "actionType": "click"}}
    ↓
ws_server handler() receives message
    ↓
Recognizes llm_instruction type
    ↓
Generates unique ID (llm-abc123)
    ↓
Forwards to EXTENSION_WS as execute_llm_action
    ↓
Extension executes action and sends response
    ↓
handler() receives response with id=llm-abc123
    ↓
Routes back to original client via COMMAND_CLIENTS
```

---

### 3. Capability Execution Flow

```
Test Client: {"type": "execute_capability", "action": "RetrieveTranscript"}
    ↓
ws_server handler() receives message
    ↓
Recognizes execute_capability type
    ↓
Is it a scroll capability?
    ↓ No
Generates unique request ID (cap_RetrieveTranscript_1234567890)
    ↓
Stores client in COMMAND_CLIENTS[request_id]
    ↓
Forwards to EXTENSION_WS with request ID
    ↓
Extension executes capability and sends response with same ID
    ↓
handler() receives response
    ↓
Looks up client in COMMAND_CLIENTS[request_id]
    ↓
Routes response back to client
```

---

### 4. Intelligence Update Flow (Main Data Pipeline)

```
Extension: {"type": "intelligence_update", "data": {...}}
    ↓
ws_server handler() receives message
    ↓
Extracts intelligence_data
    ↓
Parallel processing:
  1. save_transcripts() → @site_structures/transcripts/*.md
  2. save_intelligence_to_page_jsonl() → @site_structures/page.jsonl
  3. save_content_to_content_jsonl() → @site_structures/content.jsonl
  4. Generate text.md with:
     - Frontmatter (title, URL, timestamp)
     - Browser tabs info
     - Capabilities section
     - Semantic page text
    ↓
YouTube video page detected?
    ↓ Yes
Send youtube_find_transcript_button command to extension
```

---

### 5. Tab Information Flow

```
Extension: {"type": "tabs_info", "tabs": [...]}
    ↓
ws_server handler() receives message
    ↓
Stores in CURRENT_TABS_INFO global
    ↓
Updates LAST_TABS_UPDATE timestamp
    ↓
Logs to terminal
```

---

### 6. Active Tab Information Flow

```
Extension: {"type": "active_tab_info", "activeTab": {...}}
    ↓
ws_server handler() receives message
    ↓
Extracts activeTab details
    ↓
Stores in CURRENT_ACTIVE_TAB global
    ↓
Logs formatted info to terminal:
  "🎯 ACTIVE TAB: ID=X | URL=... | Title=... | Status=..."
```

---

### 7. Response Routing Flow

```
Extension sends response: {"id": "cmd-abc123", "ok": true, "result": {...}}
    ↓
ws_server handler() receives response
    ↓
Check for special response types:
  - Text extraction? → Save to markdown
  - Site map? → Process for LLM (disabled)
    ↓
Check PENDING dict for future
    ↓ Found
Resolve future with response
    ↓ Not found
Check COMMAND_CLIENTS dict
    ↓ Found
Route response to tracked client
    ↓ Not found
Fallback: Broadcast to any test client
```

---

### 8. Transcript Persistence Flow

```
save_transcripts() called with transcript payloads
    ↓
Load existing signatures via _collect_existing_transcript_signatures()
    ↓
For each transcript:
  1. Generate signature via _build_transcript_signature()
  2. Check if signature exists in known signatures
     ↓ Yes (duplicate)
     Skip
     ↓ No (new)
  3. Generate slug from title via slugify()
  4. Create filename: {date}__{slug}.md
  5. Write markdown with:
     - HTML signature comment
     - Frontmatter (title, URL, ID, language, timestamp)
     - Timestamped segments
  6. Append entry to video_history.jsonl
  7. Add signature to known signatures set
    ↓
Return list of transcript references
```

---

### 9. Internal Command Handling Flow

```
Test Client: {"id": "cmd-123", "command": "getTabsInfo"}
    ↓
ws_server handler() receives message
    ↓
Recognizes internal command type
    ↓
Executes locally:
  - getTabsInfo → get_current_tabs_info()
  - getPageData → get_current_page_data()
  - getContentData → get_current_content_data()
  - getActiveTab → get_current_active_tab()
    ↓
Sends response directly to client (no extension involved)
```

---

## Message Types Reference

### Incoming Messages (Client/Extension → Server)

| Type | Source | Purpose |
|------|--------|---------|
| `ping` | Any | Heartbeat check |
| `pong` | Any | Heartbeat response |
| `bridge_status` | Extension | Extension identification |
| `tabs_info` | Extension | Tab list update |
| `active_tab_info` | Extension | Active tab details |
| `intelligence_update` | Extension | **Main data payload** - page intelligence |
| `execute_capability` | Test Client | Request capability execution |
| `execute_scroll` | Test Client | Request scroll action |
| `dom_content_changed` | Extension | DOM mutation notification |
| `network_activity` | Extension | Network request monitoring |
| `extractPageText` | Test Client | Request text extraction |
| `llm_instruction` | Test Client | LLM action execution request |
| `command` with `id` | Test Client | Generic command (navigate, etc.) |
| Response with `id`, `ok` | Extension | Command/capability response |

### Outgoing Messages (Server → Client/Extension)

| Type | Destination | Purpose |
|------|-------------|---------|
| `pong` | Sender | Heartbeat response |
| `server_ping` | Extension | Server heartbeat |
| `youtube_find_transcript_button` | Extension | Trigger transcript button hunt |
| `execute_llm_action` | Extension | Forward LLM instruction |
| `execute_capability` | Extension | Forward capability request |
| `scroll` command | Extension | Scroll instruction |
| Response with `id`, `ok` | Test Client | Command result |

---

## File Output

### Files Written by ws_server.py

| File | Function | Purpose |
|------|----------|---------|
| `@site_structures/page.jsonl` | `save_intelligence_to_page_jsonl()` | Normalized page records (meta, sections, actions) |
| `@site_structures/content.jsonl` | `save_content_to_content_jsonl()` | Content structure (headings, paragraphs, lists, etc.) |
| `@site_structures/text.md` | `handler()` intelligence_update | Human-readable page text with frontmatter and capabilities |
| `@site_structures/transcripts/{date}__{slug}.md` | `save_transcripts()` | Individual transcript files with timestamped segments |
| `@site_structures/transcripts/video_history.jsonl` | `_append_video_history_entry()` | Append-only transcript history log |
| `@site_structures/llm_actions.json` | `process_actionable_elements_for_llm()` | LLM action mapping (DISABLED) |
| `@site_structures/{hostname}_page_text.md` | `save_page_text_to_markdown()` | Legacy text extraction (rarely used) |
| `@site_structures/llm_prompt.md` | `generate_llm_prompt()` | LLM-friendly prompt (DISABLED) |

---

## Key Configuration

| Config | Value | Purpose |
|--------|-------|---------|
| Port | `17892` | WebSocket server port |
| Max frame size | `64 MiB` | Maximum WebSocket message size |
| Max queue | `128` | Maximum queued messages |
| Ping interval | `20s` | WebSocket ping interval |
| Ping timeout | `20s` | WebSocket ping timeout |
| Heartbeat interval | `20s` | Server heartbeat to extension |
| Default command timeout | `8.0s` | Response timeout for send_command() |
| Max actions | `MAX_ACTIONS` | Max actions in llm_prompt.md |
| Max footer links | `MAX_FOOTER_LINKS` | Max footer links in llm_prompt.md |

---

## Important Implementation Details

### Client Identification

The server identifies the extension client by:
1. **First connection** - First client to connect becomes `EXTENSION_WS`
2. **Bridge status message** - Any client sending `{"type": "bridge_status"}` is marked as extension

This allows reconnection if the extension disconnects and reconnects.

---

### Response Routing System

The server uses TWO mechanisms for routing responses:

1. **PENDING dict** - For internal `send_command()` calls
   - Maps command ID → Future
   - Used by server's internal operations
   - Future resolves when response arrives

2. **COMMAND_CLIENTS dict** - For external test client commands
   - Maps command ID → WebSocket client
   - Used by test clients sending commands
   - Response routed back to tracked client

This dual system supports both internal server operations and external test client automation.

---

### Transcript Deduplication Strategy

Transcripts are deduplicated using stable signatures:
- **Signature components:** video_id + segment_count + sample_text_hash
- **Sample text:** First 3 and last 3 segments
- **Persistence:** Stored in `video_history.jsonl` and embedded in markdown files
- **Lookup:** Checks both history file and existing markdown files

This ensures the same transcript is never saved twice, even across restarts.

---

### SPA Filtering (Page Version Tracking)

The `generate_llm_prompt()` function implements SPA (Single Page Application) filtering:
- Each page scan increments `pageVersion`
- Each action ID embeds version: `a_id_{version}_{counter}`
- Old elements (version < current) are pruned unless they match persistent selectors
- Persistent selectors defined per-domain in site_configs.json

This prevents stale action IDs from cluttering the LLM prompt after page updates.

---

### Smart Action Categorization

The prompt generator uses pattern-based categorization (not domain-specific):
- **Search inputs:** Detects "search" in label/placeholder/aria-label
- **Transcript actions:** Detects "transcript" in label/aria-label (CRITICAL priority)
- **Video links:** Detects `/watch?v=` or `/watch/` in href
- **Channel links:** Detects `/@` or `/channel/` in href
- **Email rows:** Detects table rows with role="row"
- **Footer links:** Detects common footer keywords (about, terms, privacy, etc.)

This generic approach works across all websites without hardcoding domains.

---

### Error Handling Philosophy

The server uses try-except blocks extensively but never crashes:
- Intelligence processing errors are logged and continue
- Message handling errors are caught per-message
- File write errors are logged but don't stop the server
- WebSocket disconnections trigger cleanup but don't crash

This ensures the server stays running even when individual operations fail.

---

## Common Operations

### Starting the Server

```bash
python om_e_web_ws/ws_server.py
```

Expected output:
```
WS listening on ws://127.0.0.1:17892
🔌 Client connected! Total clients: 1
🎯 Marked as extension client
```

---

### Sending a Command (Test Client)

```python
import asyncio
import websockets
import json

async def send_command():
    async with websockets.connect("ws://127.0.0.1:17892") as ws:
        msg = {
            "id": "cmd-123",
            "command": "getActiveTab"
        }
        await ws.send(json.dumps(msg))
        response = await ws.recv()
        print(json.loads(response))

asyncio.run(send_command())
```

---

### Triggering Page Scan (Extension Sends Intelligence Update)

The extension automatically sends intelligence updates when pages load or change. The server processes them automatically.

---

## Debugging Tips

1. **Check extension connection:**
   ```
   Look for: "🎯 Marked as extension client"
   ```

2. **Verify tab information:**
   ```
   Look for: "📊 Tab info updated and stored - N tabs available"
   ```

3. **Monitor intelligence updates:**
   ```
   Look for: "🧠 Intelligence update received from extension"
   Followed by: "✅ Intelligence update processed and saved"
   ```

4. **Track response routing:**
   ```
   Look for: "📤 Routing response cmd-123 back to original client"
   ```

5. **Check file generation:**
   ```
   Look for: "🧠 Normalized records saved to @site_structures/page.jsonl"
   Look for: "✅ Text content saved to: @site_structures/text.md"
   ```

6. **Monitor transcript saves:**
   ```
   Look for: "📝 Transcript saved: @site_structures/transcripts/*.md"
   Or: "⏭️ Skipping duplicate transcript for video ID: ..."
   ```

---

## Architecture Decisions

### Why Two Response Routing Systems?

**PENDING (futures):**
- For internal server operations
- Supports async/await patterns
- Used by `send_command()` helper

**COMMAND_CLIENTS (dict):**
- For external test clients
- Supports multiple simultaneous clients
- Tracks which client sent which command

This separation allows the server to both:
1. Initiate its own commands to the extension (internal)
2. Act as a transparent bridge for test clients (external)

---

### Why Store Global State?

The server maintains global state (`CURRENT_TABS_INFO`, `CURRENT_ACTIVE_TAB`, etc.) to:
1. **Avoid repeated extension queries** - Data is pushed once and cached
2. **Enable internal commands** - Server can respond without extension roundtrip
3. **Enrich artifacts** - Browser state is embedded in page.jsonl and text.md
4. **Support external access** - Test clients can query state via `getTabsInfo`, etc.

---

### Why Disable Site Map Processing?

The site map generation (old approach) has been largely replaced by:
- **Normalized records** from extension's new scanning engine
- **Semantic page data** with tagged actionables
- **Direct JSONL output** instead of processing pipelines

The old functions remain in code for reference but are disabled/commented out.

---

## Future Enhancements

Potential improvements to the server:

1. **Session management** - Track multiple browser sessions
2. **Persistent history** - Store all intelligence updates to database
3. **Real-time LLM integration** - Direct LLM API calls from server
4. **REST API layer** - HTTP endpoints alongside WebSocket
5. **Authentication** - Secure access control for production use
6. **Metrics dashboard** - Web UI showing server stats
7. **Replay mode** - Replay historical intelligence updates for testing

---

## Related Documentation

- `/Users/andy7string/Projects/Om_E_Web/CLAUDE.md` - Project overview and coding philosophy
- `/Users/andy7string/Projects/Om_E_Web/SYSTEM_ARCHITECTURE_COMPLETE.md` - Complete system architecture
- `/Users/andy7string/Projects/Om_E_Web/web_extension/README.md` - Extension details
- `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/HowThisWorks.md` - Artifact generation details
