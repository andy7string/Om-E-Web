# WebSocket Server Documentation (ws_server.py)

## Overview

The WebSocket server (`ws_server.py`) is the central orchestration hub of the Om_E_Web system. Running on port **17892**, it acts as the message broker between the Chrome extension, web dashboards, test clients, and the LLM agent. The server manages page intelligence, chat history, capability execution, and artifact generation.

**Core Responsibilities:**
- Full duplex communication between extension and external clients
- Intelligence artifact generation (page.jsonl, content.jsonl, text.md)
- Chat persistence and LLM conversation management
- Transcript deduplication and storage
- Capability routing (internal vs extension vs DOM-based)
- Element registry for selector-based action resolution
- Tab management and state synchronization

---

## Architecture

### Communication Topology

```
Chrome Extension ⟷ ws_server.py (port 17892) ⟷ Test Clients
                        ↕
                   Web Dashboard
                        ↕
                   LLM Agent
                        ↓
                 Artifact Files (@site_structures/)
                 Chat Files (data/chats/)
```

### Client Types

| Client Type | Identification | Role |
|-------------|---------------|------|
| **Extension** | First to connect OR sends `bridge_status` | Primary data source, DOM executor |
| **Web Dashboard** | Sends `identify` with `client: "web_dashboard"` | Visual control interface |
| **Test Client** | Default for all other connections | Automation scripts, debugging |

---

## Global State Variables

### Connection Management

| Variable | Type | Purpose |
|----------|------|---------|
| `CLIENTS` | `set` | All connected WebSocket clients |
| `EXTENSION_WS` | WebSocket | Reference to Chrome extension client |
| `WEB_DASHBOARD_CLIENTS` | `set` | Web dashboard clients for broadcast sync |

### Response Routing

| Variable | Type | Purpose |
|----------|------|---------|
| `PENDING` | `dict[str, Future]` | Command ID → Future mapping for internal server commands |
| `COMMAND_CLIENTS` | `dict[str, WebSocket]` | Command ID → Client mapping for external client commands |

### Page Intelligence State

| Variable | Type | Purpose |
|----------|------|---------|
| `CURRENT_PAGE_DATA` | `dict` | Latest page.jsonl data with normalized records |
| `LAST_PAGE_UPDATE` | `float` | Timestamp of last page update |
| `CURRENT_CONTENT_DATA` | `dict` | Latest content.jsonl data |
| `LAST_CONTENT_UPDATE` | `float` | Timestamp of last content update |
| `CURRENT_TRANSCRIPTS_INFO` | `list` | Current transcript references |
| `LAST_TEXT_MD_DATA` | `dict` | Cached text.md generation data for tab switches |
| `CURRENT_TEXT_JSON` | `dict` | Action ID → element hints lookup (label, type, selectors) |

### Browser State

| Variable | Type | Purpose |
|----------|------|---------|
| `CURRENT_TABS_INFO` | `list` | Latest tabs_info from extension |
| `LAST_TABS_UPDATE` | `float` | Timestamp of last tabs update |
| `CURRENT_ACTIVE_TAB` | `dict` | Current active tab information |
| `TAB_NUMBER_MAP` | `dict[int, int]` | Display tab numbers (1-8) → real Chrome tab IDs |

### Element Registry

| Variable | Type | Purpose |
|----------|------|---------|
| `ELEMENT_REGISTRY` | `dict` | Action ID → element metadata (`type`, `tag`, `label`, `href`, `selectors`, `iframe`) |

**Purpose:** Enables selector-based action resolution that survives DOM re-renders. Populated from `semanticPageData.actionables` on each intelligence update.

**Example Entry:**
```python
ELEMENT_REGISTRY["a_id_0"] = {
    "type": "Link",
    "tag": "a",
    "label": "Sign In",
    "href": "/login",
    "selectors": ["[aria-label='Sign In']", "a.nav-link:nth-of-type(2)"],
    "iframe": False
}
```

### Chat & LLM State

| Variable | Type | Purpose |
|----------|------|---------|
| `CURRENT_CHAT_ID` | `str` | Active chat ID (auto-created on first message) |
| `CHAT_INDEX_CACHE` | `dict` | Chat ID → metadata (title, date, message count, project) |
| `CHAT_INDEX_LOADED` | `bool` | Flag for initial cache load |
| `LLM_AGENT` | `OmEAgent` | LLM conversation agent instance |

### Configuration State

| Variable | Type | Purpose |
|----------|------|---------|
| `SITE_CONFIGS` | `dict` | Domain → site config (capabilities, selectors) |
| `INTERNAL_CAPABILITIES` | `dict` | Server-side capability action → config |
| `CURRENT_ORB_THEME` | `str` | Current orb theme (synced across clients) |

---

## Message Types Reference

### Incoming Messages (Client/Extension → Server)

#### Heartbeat & Connection

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `ping` | Any | `{source: "client"}` | `pong` | Keep-alive, latency check |
| `pong` | Any | `{source: "client"}` | None | Heartbeat response |
| `bridge_status` | Extension | `{}` | None | Mark client as extension |
| `identify` | Web Dashboard | `{client: "web_dashboard"}` | None | Mark as web dashboard client |

#### Intelligence & Page Data

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `intelligence_update` | Extension | `{data: {...}, normalizedRecords: [...], semanticPageData: {...}, transcripts: [...]}` | None | **PRIMARY DATA PIPELINE** - triggers artifact generation |
| `iframe_elements_update` | Extension | `{iframeElements: [...], iframeCount: N}` | None | Append iframe elements to text.md |
| `tabs_info` | Extension | `{tabs: [...]}` | None | Store tab list, update text.md tabs section |
| `active_tab_info` | Extension | `{activeTab: {...}}` | None | Store active tab details |

#### Capability Execution

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `execute_capability` | Test Client | `{action: "CapName", params: {...}, id: "req_123"}` | `capability_result` | Execute capability (routes to internal/extension/DOM) |
| `execute_scroll` | Test Client | `{direction: "down/up/..."}` | `{ok: true}` | Scroll viewport |

#### DOM & Network Monitoring

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `dom_content_changed` | Extension | `{tabId, totalMutations, changeTypes}` | None | Track DOM mutations (logged only) |
| `network_activity` | Extension | `{eventType, url, status, inflightRequests}` | None | Network monitoring, idle detection |

#### Action Execution

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `llm_instruction` | Test Client | `{data: {actionId, actionType, params}}` | `{ok: true}` | Execute element action via action ID |
| `extractPageText` | Test Client | `{}` | `{ok: true, result: {...}}` | Extract page text, save to markdown |

#### Shortcut Normalization (Client Sugar)

| Type | Source | Normalized To | Purpose |
|------|--------|---------------|---------|
| `exec_action` | Test Client | `llm_instruction` | Execute action by ID |
| `set_value` | Test Client | `llm_instruction` with setValue | Set input value |
| `click` | Test Client | `llm_instruction` with click | Click element |
| `navigate_link` | Test Client | `llm_instruction` with navigate | Navigate link |
| `navigate_url` | Test Client | `command: navigate` | Navigate to URL |

#### Command Forwarding

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `command` with `id` | Test Client | `{id, command, params}` | `{id, ok, result}` | Generic command (internal or forwarded to extension) |

**Internal commands** (handled server-side):
- `getTabsInfo` → Returns `CURRENT_TABS_INFO`
- `getPageData` → Returns `CURRENT_PAGE_DATA`
- `getContentData` → Returns `CURRENT_CONTENT_DATA`
- `getActiveTab` → Returns `CURRENT_ACTIVE_TAB`

**Extension commands** (forwarded with tracking):
- All others → Forwarded to extension, response routed back via `COMMAND_CLIENTS`

#### LLM & Configuration

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `get_llm_config` | Web Dashboard | `{}` | `{type: "llm_config", config: {...}}` | Get LLM settings (API keys masked) |
| `set_llm_config` | Web Dashboard | `{config: {...}}` | None | Update LLM settings |

#### Web Dashboard Specific

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `getStatus` | Web Dashboard | `{_requestId: "..."}` | `{ok, result: {isConnected, totalTabs, ...}}` | Get extension status |
| `get_orb_state` | Web Dashboard | `{_requestId: "..."}` | `{ok, theme: "..."}` | Get current orb theme |
| `toggle_hud` | Web Dashboard | `{_requestId: "..."}` | `{ok, message: "..."}` | Toggle HUD overlay |
| `set_orb_theme` | Web Dashboard | `{theme: "classic/robot/...", _requestId: "..."}` | `{ok, message: "..."}` | Set orb theme, broadcast to clients |
| `get_orb_themes` | Web Dashboard | `{}` | Forwarded to extension | Get available themes |

#### Test & Debug

| Type | Source | Payload | Response | Purpose |
|------|--------|---------|----------|---------|
| `test_dispatch` | Test Client | `{action: {...}}` | Dispatch result | Test LLM dispatcher routing |

#### Response Messages

| Pattern | Source | Payload | Purpose |
|---------|--------|---------|---------|
| Message with `id`, `ok`, `error` | Extension | `{id, ok, result?, error?}` | Response routing (resolves `PENDING` future or routes via `COMMAND_CLIENTS`) |

---

### Outgoing Messages (Server → Client/Extension)

| Type | Destination | Payload | Purpose |
|------|-------------|---------|---------|
| `pong` | Sender | `{type: "pong", source: "server", timestamp: ...}` | Heartbeat response |
| `server_ping` | Extension | `{type: "ping", source: "server", timestamp: ...}` | Server heartbeat |
| `llm_config` | Web Dashboard | `{type: "llm_config", config: {...}}` | LLM config response |
| `youtube_find_transcript_button` | Extension | `{type: "youtube_find_transcript_button", url: "..."}` | Trigger transcript button hunt |
| `execute_llm_action` | Extension | `{type: "execute_llm_action", id: "llm-...", data: {actionId, actionType, params}}` | Forward LLM instruction (legacy) |
| `execute_action_with_hints` | Extension | `{type: "execute_action_with_hints", id: "llm-...", data: {actionId, actionType, params, hints}}` | Forward LLM instruction (selector-based) |
| `execute_capability` | Extension | `{type: "execute_capability", id: "cap_...", action: "...", params: {...}}` | Forward capability request |
| `scroll` command | Extension | `{command: "scroll", id: "scroll_...", params: {direction: "..."}}` | Scroll instruction |
| `toggle_hud` | Extension | `{type: "toggle_hud", id: "hud_..."}` | Toggle HUD overlay |
| `set_orb_theme` | Extension | `{type: "set_orb_theme", theme: "...", id: "theme_..."}` | Set orb theme |
| `get_orb_themes` | Extension | `{type: "get_orb_themes", id: "themes_..."}` | Get available themes |
| `hud_action` | Extension | `{type: "hud_action", action: {...}}` | Drive HUD UI (append message, load chat, etc.) |
| `capability_result` | Test Client | `{type: "capability_result", action: "...", ok: bool, result?: {...}, error?: "...", id?: "..."}` | Capability execution result |
| `hud_toggled` | Web Dashboard (broadcast) | `{type: "hud_toggled", visible: bool}` | Notify other dashboards of HUD toggle |
| `orb_theme_changed` | Web Dashboard (broadcast) | `{type: "orb_theme_changed", theme: "..."}` | Notify other dashboards of theme change |
| Response with `id`, `ok` | Test Client | `{id, ok, result?, error?}` | Command result (routed to original sender) |

---

## Core Functions

### Server Lifecycle

#### `async def main()`
**Purpose:** Entry point - starts WebSocket server and background tasks

**Actions:**
1. Loads site configs via `start_site_config_polling()`
2. Initializes LLM dispatcher via `init_llm_dispatcher()`
3. Builds chat index cache via `_build_chat_index()`
4. Starts HTTP server for orb page (port 8080) in background thread
5. Starts WebSocket server on `127.0.0.1:17892`
6. Launches `extension_heartbeat_loop()` to monitor extension health
7. Configures WebSocket with 64 MiB max frame size

**Called by:** `__main__`

**Configuration:**
- Port: 17892
- Max message size: 64 MiB
- Max queue: 128
- Ping interval: 20s
- Ping timeout: 20s

---

#### `async def handler(ws)`
**Purpose:** Main WebSocket connection handler for each client - implements core message routing logic

**Lifecycle:**
1. Add client to `CLIENTS` set
2. Identify extension clients (first to connect or sending `bridge_status`)
3. Listen for messages in async loop
4. Route messages based on type
5. Clean up on disconnect (remove from `CLIENTS`, clear `EXTENSION_WS` if extension, clean up `COMMAND_CLIENTS`)

**Message Processing Flow:**
```
Receive raw message
    ↓
Parse JSON
    ↓
Shortcut normalization (exec_action → llm_instruction, etc.)
    ↓
Type-based routing:
    - Heartbeat → respond with pong
    - Extension identification → mark as EXTENSION_WS
    - Intelligence update → artifact generation pipeline
    - Capability execution → route to internal/extension/DOM handler
    - Command forwarding → internal handling or extension forwarding
    - Response routing → resolve PENDING future or route via COMMAND_CLIENTS
    ↓
Send response (if required)
```

**Error Handling:**
- Per-message try-except blocks (logs errors, continues processing)
- Disconnect cleanup in `finally` block
- Never crashes on individual message failures

**Called by:** websockets.serve() for each connection

---

### Heartbeat

#### `async def extension_heartbeat_loop()`
**Purpose:** Periodically ping extension to detect silent disconnections

**Actions:**
1. Sleep for `SERVER_HEARTBEAT_INTERVAL` (20 seconds)
2. Send `server_ping` to extension if connected
3. Log failures
4. Repeat forever

**Called by:** `main()` as background task

---

### Intelligence Processing

#### `async def save_intelligence_to_page_jsonl(intelligence_data, transcript_refs=None)`
**Purpose:** Generate central `page.jsonl` file with normalized records

**Parameters:**
- `intelligence_data`: Intelligence update from extension
- `transcript_refs`: List of transcript file references (optional)

**Processing Flow:**

**Normalized Records Path (preferred):**
1. Extract `normalizedRecords` from `intelligence_data`
2. Enrich meta record with:
   - Browser state (tabs, active tab, extension status)
   - Current page info (URL, title, is_active_tab)
   - Transcript references
   - Page version
3. Write JSONL file with one record per line (types: meta, section, text, action)
4. Update `CURRENT_PAGE_DATA` and `LAST_PAGE_UPDATE`

**Legacy Path (fallback):**
1. Extract `actionableElements` from `intelligence_data`
2. Consolidate via `consolidate_actionable_elements_to_menus()`
3. Build page data with menu structure
4. Write as single JSON object
5. Update `CURRENT_PAGE_DATA` and `LAST_PAGE_UPDATE`

**Writes to:** `@site_structures/page.jsonl`

**Called by:** `handler()` on intelligence_update

**Returns:** Filepath string or None

---

#### `async def save_content_to_content_jsonl(intelligence_data, transcript_refs=None)`
**Purpose:** Generate central `content.jsonl` file with content structure

**Parameters:**
- `intelligence_data`: Intelligence update from extension
- `transcript_refs`: List of transcript file references (optional)

**Processing Flow:**
1. Extract `contentElements` from `intelligence_data`
2. Consolidate via `consolidate_content_elements_to_structure()`
3. Build content data with structure (headings, paragraphs, lists, images, tables)
4. Enrich with browser state
5. Write as single JSON object
6. Update `CURRENT_CONTENT_DATA` and `LAST_CONTENT_UPDATE`

**Writes to:** `@site_structures/content.jsonl`

**Called by:** `handler()` on intelligence_update

**Returns:** Filepath string or None

---

#### `async def consolidate_actionable_elements_to_menus(actionable_elements)`
**Purpose:** Organize raw actionable elements into menu structures (LEGACY)

**Parameters:**
- `actionable_elements`: List of raw actionable elements from extension

**Processing:**
1. Categorize by type (navigation, toggle, action, content)
2. Build main navigation structure
3. Add navigation items and toggle buttons

**Returns:** Dict with `menus` and `summary`

**Called by:** `save_intelligence_to_page_jsonl()` (legacy fallback)

---

#### `async def consolidate_content_elements_to_structure(content_elements)`
**Purpose:** Organize raw content elements by type

**Parameters:**
- `content_elements`: List of raw content elements from extension

**Processing:**
1. Categorize by type (heading, paragraph, list, image, table, other)
2. Process each category with metadata
3. Build content structure with typed arrays

**Returns:** Dict with `content_structure` and `summary`

**Called by:** `save_content_to_content_jsonl()`

---

### Transcript Management

#### `async def save_transcripts(transcripts, page_state=None)`
**Purpose:** Persist transcript payloads (e.g., YouTube) to disk with deduplication

**Parameters:**
- `transcripts`: List of transcript objects from extension
- `page_state`: Optional page state for metadata

**Deduplication Strategy:**
1. Load existing signatures via `_collect_existing_transcript_signatures()`
2. For each transcript:
   - Generate signature via `_build_transcript_signature()`
   - Check if signature exists → skip if duplicate
   - Generate slug from title via `slugify()`
   - Create filename: `{date}__{slug}.md`
   - Write markdown with HTML signature comment, frontmatter, timestamped segments
   - Append entry to `video_history.jsonl`
   - Add signature to known set
3. Update `CURRENT_TRANSCRIPTS_INFO`

**Writes to:**
- `@site_structures/transcripts/{date}__{slug}.md`
- `@site_structures/transcripts/video_history.jsonl`

**Called by:** `handler()` on intelligence_update

**Returns:** List of transcript reference objects

---

#### `def _build_transcript_signature(video_id, segments)`
**Purpose:** Create stable signature for transcript deduplication

**Algorithm:**
1. Sample first 3 and last 3 segments
2. Combine video_id, segment count, and sample text
3. Generate SHA256 hash
4. Format: `"{video_id}:{count}:{hash}"`

**Returns:** Signature string or None

---

#### `def _collect_existing_transcript_signatures()`
**Purpose:** Build lookup of known transcript signatures

**Sources:**
1. Read `video_history.jsonl` for signature entries
2. Scan existing markdown files for embedded signatures (HTML comment)
3. Fallback: generate signatures from file content (legacy files)

**Returns:** Dict mapping signature → video_id

---

#### `def _ensure_video_history_file()`
**Purpose:** Ensure history file exists

**Actions:** Create empty file if missing

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

**Actions:** Append JSON line to `video_history.jsonl`

---

### Text.md Generation

#### `def write_text_md()`
**Purpose:** Write text.md from cached `LAST_TEXT_MD_DATA`

**Data Source:** `LAST_TEXT_MD_DATA` (populated during intelligence_update)

**Structure:**
- Frontmatter (title, URL, timestamp)
- Browser tabs info (formatted with display numbers)
- Capabilities section (if any)
- Semantic page text (or plain text fallback)
- Secure iframe elements (placeholder or actual)

**Writes to:** `@site_structures/text.md`

**Called by:** `handler()` on intelligence_update, `update_tabs_in_text_md()`

**Returns:** Boolean success status

---

#### `def update_tabs_in_text_md()`
**Purpose:** Update tabs section only (preserve action IDs)

**Uses:** `CURRENT_TABS_INFO`, `LAST_TEXT_MD_DATA`

**Actions:**
1. Read existing text.md
2. Rebuild tabs section with current tab info
3. Replace tabs section only (keep rest intact)
4. Write updated file

**Called by:** `handler()` on tabs_info, after tab actions (SwitchTab, CloseTab)

**Returns:** None (logs success/failure)

---

#### `async def save_page_text_to_markdown(text_data)`
**Purpose:** Save extracted page text to markdown file (LEGACY)

**Parameters:**
- `text_data`: Text extraction result with markdown and statistics

**Actions:**
1. Extract URL and generate filename from hostname
2. Write markdown content to file
3. Log content statistics

**Writes to:** `@site_structures/{hostname}_page_text.md`

**Called by:** `handler()` when processing text extraction response

**Returns:** File path or None

---

### LLM Prompt Generator (LEGACY, mostly disabled)

#### `def generate_llm_prompt(text_md_path, page_jsonl_path, out_path, max_actions=MAX_ACTIONS)`
**Purpose:** Generate LLM-friendly prompt from page data (LEGACY - mostly disabled)

**Parameters:**
- `text_md_path`: Path to text.md file
- `page_jsonl_path`: Path to page.jsonl file
- `out_path`: Output path for llm_prompt.md
- `max_actions`: Maximum actions to include

**Processing:**
1. Read text.md for title and page text
2. Read page.jsonl for action records
3. Apply SPA filtering (prune stale elements based on pageVersion)
4. Smart categorize actions:
   - Search inputs (detect "search" in label/placeholder)
   - Transcript actions (CRITICAL priority)
   - Video links (/watch?v=)
   - Channel links (/@, /channel/)
   - Email rows (table rows with role="row")
   - Footer links (about, terms, privacy)
5. Resolve capabilities via `resolve_capabilities_for_url()`
6. Generate organized markdown with sections

**Called by:** Previously called on intelligence_update (now disabled)

**Returns:** Path to generated file or None

---

#### `def _map_prompt_action_sentence(record)`
**Purpose:** Convert action record to human-readable instruction

**Filtering:**
- Allows hidden elements if:
  - Interactive table/list rows (generic pattern)
  - Input/textarea elements (ChatGPT, Perplexity, Claude hidden inputs)
  - Accessibility links with meaningful labels
  - Video links (YouTube specific)

**Formatting:**
- Input/textarea: `return (a_id_123,{yourValue}) to set value for 'label'. Add submit:true to submit.`
- Links: `return (a_id_123) to navigate to 'label'`
- Buttons: `return (a_id_123) to click 'label'`
- Table rows: `return (a_id_123) to click 'Email: sender — subject'`

**Called by:** `generate_llm_prompt()`

**Returns:** Formatted instruction string or None

---

#### `def _format_table_row_label(record)`
**Purpose:** Extract meaningful labels from table rows (e.g., Gmail emails)

**Parsing:**
- Parses comma-separated text content
- Identifies sender, subject, time, preview
- Formats as readable label

**Called by:** `_map_prompt_action_sentence()`

**Returns:** Dict with display, sender, subject, time, preview, raw

---

### Element Action Resolution

#### `def resolve_action_hints(action_id)`
**Purpose:** Get element hints from `CURRENT_TEXT_JSON` for selector-based resolution

**Parameters:**
- `action_id`: The action ID to look up

**Returns:** Dict with `label`, `type`, `tag`, `selectors`, or None

**Called by:** `handler()` when executing LLM instructions

**Data Source:** `CURRENT_TEXT_JSON` (loaded from text.json)

---

#### `def resolve_hints_for_act(act, action_type=None)`
**Purpose:** Resolve hints for action descriptor (supports Type:Label format)

**Parameters:**
- `act`: Action descriptor (a_id_X or "Type:Label")
- `action_type`: Optional action type override

**Resolution:**
1. If starts with `a_id_`: Look up in `ELEMENT_REGISTRY`
2. Else: Parse as "Type:Label", resolve via `resolve_action_by_kind_and_label()`

**Returns:** Dict with `label`, `type`, `tag`, `selectors`, or None

**Called by:** `handler()` during LLMChat capability execution

---

#### `def resolve_action_by_kind_and_label(kind, label, action_type=None)`
**Purpose:** Find element in registry by type and label (fuzzy matching)

**Parameters:**
- `kind`: Element type (Link, Button, Input, Select)
- `label`: Element label (partial match)
- `action_type`: Optional action type override

**Matching:**
- Case-insensitive
- Partial label match (label in registry_label or vice versa)
- Type match (case-insensitive)

**Returns:** Dict with `label`, `type`, `tag`, `selectors`, or None

---

#### `def infer_action_type_from_act(act, has_value)`
**Purpose:** Infer action type from Type:Label descriptor

**Rules:**
- Link → "navigate"
- Button → "click"
- Input/Textarea → "setValue" if has_value else "focus"
- Select → "select" if has_value else "focus"

**Returns:** Action type string

---

#### `def _parse_action_descriptor(act)`
**Purpose:** Parse "Type:Label" descriptor into components

**Format:** `"Type:Label"` → `(Type, Label)`

**Returns:** Tuple of (type, label) or (None, None)

---

### State Access Functions

#### `def get_current_tabs_info()`
**Purpose:** External access to latest tab information

**Returns:** Dict with:
```python
{
    "tabs": CURRENT_TABS_INFO,
    "last_update": LAST_TABS_UPDATE,
    "extension_connected": bool,
    "total_clients": len(CLIENTS)
}
```

---

#### `def get_current_page_data()`
**Purpose:** External access to latest page intelligence

**Returns:** Dict with:
```python
{
    "page_data": CURRENT_PAGE_DATA,
    "last_update": LAST_PAGE_UPDATE,
    "extension_connected": bool,
    "totals": {...}  # From meta record
}
```

---

#### `def get_current_content_data()`
**Purpose:** External access to latest page content

**Returns:** Dict with:
```python
{
    "content_data": CURRENT_CONTENT_DATA,
    "last_update": LAST_CONTENT_UPDATE,
    "totals": {...}
}
```

---

#### `def get_current_active_tab()`
**Purpose:** Get current active tab information

**Fallback:** If `CURRENT_ACTIVE_TAB` not set, searches `CURRENT_TABS_INFO` for active tab

**Returns:** Dict with:
```python
{
    "active_tab": {...},
    "last_update": LAST_TABS_UPDATE,
    "extension_connected": bool,
    "total_tabs": N
}
```

---

### Command Sending

#### `async def send_command(command, params=None, timeout=8.0)`
**Purpose:** Internal function for server-to-extension commands

**Parameters:**
- `command`: Command name (e.g., "navigate", "click")
- `params`: Optional parameters dict
- `timeout`: Response timeout in seconds (default 8.0)

**Flow:**
1. Wait for extension to be identified
2. Generate unique command ID
3. Create future and store in `PENDING`
4. Send command to extension
5. Wait for response via future (with timeout)
6. Clean up `PENDING` entry

**Used by:** Internal server operations (not test clients)

**Returns:** Response message or raises RuntimeError on timeout

---

### Capabilities

#### `def resolve_capabilities_for_url(url)`
**Purpose:** Resolve available capabilities for given URL

**Parameters:**
- `url`: Current page URL

**Processing:**
1. Load site configs via `get_all_site_configs()`
2. Match URL hostname to site config domain
3. Extract capabilities that match URL pattern
4. Add universal scroll capabilities

**Returns:** List of capability dicts with action, label, description

**Called by:** `generate_llm_prompt()`, text.md generation in handler

---

#### `def get_capabilities_for_prompt_with_universal(url)`
**Purpose:** Get all capabilities (site-specific + universal) for prompt

**Parameters:**
- `url`: Current page URL

**Returns:** List of capability dicts

**Called by:** text.md generation

---

#### `def is_site_config_capability(action, url=None)`
**Purpose:** Check if action is a site config capability

**Parameters:**
- `action`: Capability action name
- `url`: Optional URL for filtering (uses active tab if not provided)

**Returns:** Boolean

**Called by:** `handler()` during capability routing

---

#### `def get_all_site_configs()`
**Purpose:** Load site configurations from disk

**Processing:**
1. Load `site_configs.json` (index mapping domain → config file)
2. Load individual config files for each domain
3. Cache in `SITE_CONFIGS` global

**Returns:** Dict mapping domain → config

**Called by:** `resolve_capabilities_for_url()`

---

#### `def load_internal_capabilities()`
**Purpose:** Load internal_capabilities.json for server-side capabilities

**Returns:** Dict mapping action name → capability config

**Called by:** `handler()` during capability routing

---

#### `def execute_internal_capability(action, params)`
**Purpose:** Execute an internal (server-side) capability

**Supported Capabilities:**

**Chat Management:**
- `GetChatList` → `list_chats(project_id?)`
- `LoadChat` → `load_chat(chat_id)` with optional `tail` and `offset` for pagination
- `CreateChat` → `create_new_chat()` and save
- `AppendMessage` → `append_user_message()` or `append_assistant_message()` and save
- `RenameChat` → Update title and save
- `DeleteChat` → Remove file and index entry
- `AppendUserMessage` → Convenience wrapper for AppendMessage
- `AppendAssistantMessage` → Convenience wrapper for AppendMessage
- `GetCurrentChat` → Return active chat
- `GetFullHistory` → Return all messages (no truncation)
- `SetCurrentChat` → Set `CURRENT_CHAT_ID`
- `SearchChats` → Search by title or content

**UI Control:**
- `ShowHUD`, `HideHUD`, `ToggleHUD`
- `ShowSidebar`, `HideSidebar`, `ToggleSidebar`
- `ExpandOrb`, `CollapseOrb`

**LLM Configuration:**
- `GetLLMConfig` → Return config (mask API keys)
- `SetLLMProvider` → Switch active provider
- `SetLLMEndpoint` → Set endpoint URL
- `SetLLMModel` → Set model name
- `SetLLMAPIKey` → Set API key (masked in response)
- `SetTemperature` → Set temperature (0.0-2.0)
- `SetMaxTokens` → Set max tokens (1-128000)
- `AddLLMProvider` → Add new provider
- `RemoveLLMProvider` → Remove provider (can't remove active)
- `ReloadLLMConfig` → Reload config into active agent
- `ReloadSiteConfigs` → Reload cached site configs

**Returns:** Result dict (may contain `_hud_action` for UI updates)

**Called by:** `handler()` when capability is internal

---

### Chat Storage System

#### `def ensure_chats_dir_exists()`
**Purpose:** Create chats directory if it doesn't exist

**Directory:** `./data/chats/`

**Returns:** String path to chats directory

**Called by:** `get_chat_filepath()`

---

#### `def generate_chat_id_from_prompt(prompt, now)`
**Purpose:** Generate unique chat_id from user's first message

**Parameters:**
- `prompt`: User's initial message text
- `now`: Current datetime (UTC)

**Algorithm:**
1. Extract first three words from prompt
2. Convert to lowercase slug (replace non-alphanumeric with hyphens)
3. Collapse multiple hyphens, trim edges
4. Append timestamp: YYYYMMDDTHHMMSS
5. Format: `<three-word-slug>__<timestamp>`

**Examples:**
- "Check YouTube comments" → `check-youtube-comments__20251130T211523`
- "What's this page about?" → `what-s-this__20251130T211523`
- "" → `chat__20251130T211523`

**Returns:** String chat_id

**Called by:** `handler()` when creating new chat, internal capabilities

---

#### `def get_chat_filepath(chat_id)`
**Purpose:** Get full file path for a chat JSON file

**Parameters:**
- `chat_id`: The chat identifier

**Format:** `./data/chats/{chat_id}.json`

**Returns:** Absolute path string

**Called by:** `load_chat()`, `save_chat()`

---

#### `def load_chat(chat_id)`
**Purpose:** Load existing chat from disk

**Parameters:**
- `chat_id`: The chat identifier

**Error Handling:**
- Returns None if file doesn't exist
- Returns None if JSON parsing fails

**Returns:** Dict with chat data or None

**Called by:** `handler()`, internal capabilities

---

#### `def save_chat(chat_dict)`
**Purpose:** Save chat dictionary to disk

**Parameters:**
- `chat_dict`: Chat data including chat_id, messages, meta

**Format:** JSON with indent=2 for readability

**Side Effects:** Updates `CHAT_INDEX_CACHE` via `_update_chat_index()`

**Returns:** Boolean success status

**Called by:** `handler()`, internal capabilities

---

#### `def create_new_chat(chat_id, prompt, meta)`
**Purpose:** Create new chat dictionary with initial metadata

**Parameters:**
- `chat_id`: Unique chat identifier
- `prompt`: Initial user prompt (used for default title)
- `meta`: Dict with page_url, page_title

**Chat Structure:**
```json
{
  "chat_id": "check-youtube-comments__20251130T211523",
  "created_at": "2025-11-30T21:15:23Z",
  "updated_at": "2025-11-30T21:15:23Z",
  "title": "Check YouTube comments",
  "default_title": "check youtube comments",
  "meta": {
    "source": "ome-web",
    "page_url": "https://youtube.com/watch?v=...",
    "page_title": "Video Title"
  },
  "messages": []
}
```

**Returns:** Dict with new chat structure

**Called by:** `handler()`, internal capabilities

---

#### `def append_user_message(chat_dict, prompt)`
**Purpose:** Append user message to chat (always to end)

**Parameters:**
- `chat_dict`: Chat dictionary to modify (mutated in place)
- `prompt`: User's message content

**Message Structure:**
```json
{
  "id": "m_0001",
  "role": "user",
  "content": "Check YouTube comments",
  "timestamp": "2025-11-30T21:15:23Z"
}
```

**Side Effects:**
- Appends to `messages` array
- Updates `chat_dict["updated_at"]`
- Generates sequential message ID (m_0001, m_0002, ...)

**Returns:** The newly created message object

**Called by:** `handler()`, internal capabilities

---

#### `def append_assistant_message(chat_dict, content)`
**Purpose:** Append assistant (LLM) message to chat (always to end)

**Parameters:**
- `chat_dict`: Chat dictionary to modify (mutated in place)
- `content`: Assistant's response content

**Message Structure:**
```json
{
  "id": "m_0002",
  "role": "assistant",
  "content": "I found 127 comments on this video...",
  "timestamp": "2025-11-30T21:15:25Z"
}
```

**Side Effects:**
- Appends to `messages` array
- Updates `chat_dict["updated_at"]`
- Generates sequential message ID

**Returns:** The newly created message object

**Called by:** `handler()`, internal capabilities, LLMChat capability

---

#### `def list_chats(project_id=None)`
**Purpose:** List all chats with optional project filter

**Parameters:**
- `project_id`: Optional project filter (None returns all, "default" returns unassigned)

**Uses:** `CHAT_INDEX_CACHE` (in-memory cache)

**Returns:** List of chat metadata dicts sorted by date (newest first)

**Called by:** Internal capabilities

---

#### `def _build_chat_index()`
**Purpose:** Build in-memory chat index cache on startup

**Actions:**
1. Scan `data/chats/` directory
2. Load each .json file
3. Extract metadata (chat_id, title, date, message_count, project_id)
4. Build `CHAT_INDEX_CACHE` dict
5. Set `CHAT_INDEX_LOADED = True`

**Called by:** `main()` on startup

---

#### `def _update_chat_index(chat_id, chat_dict)`
**Purpose:** Update single entry in chat index cache

**Called by:** `save_chat()` after writing to disk

---

#### `def _remove_from_chat_index(chat_id)`
**Purpose:** Remove entry from chat index cache

**Called by:** Internal capability `DeleteChat`

---

### Tab Management

#### `def translate_tab_params(params)`
**Purpose:** Translate display tab numbers (1-8) to real Chrome tab IDs

**Background:** LLM sees tabs as "Tab 1", "Tab 2", etc. but Chrome uses internal IDs. `TAB_NUMBER_MAP` tracks the mapping.

**Parameters:**
- `params`: Original params dict (may contain `tab` or `tabId`)

**Logic:**
- Checks both `tab` and `tabId` params
- Only translates if value is 1-8 range (display numbers)
- Larger values assumed to be real Chrome tab IDs (passed through)

**Returns:** Tuple of `(translated_params, error_message)` - error is None on success

**Called by:** `handler()` during capability routing (SwitchTab, CloseTab, etc.)

---

### LLM Configuration

#### `def load_llm_config()`
**Purpose:** Load LLM configuration from data/llm_config.json

**Default Config:**
```json
{
  "active_provider": "lm_studio",
  "providers": {
    "lm_studio": {
      "name": "LM Studio",
      "type": "openai_compatible",
      "endpoint": "http://localhost:1234/v1/chat/completions",
      "model": "local-model",
      "api_key": null
    }
  },
  "settings": {
    "temperature": 0.7,
    "max_tokens": 1024,
    "timeout_seconds": 30
  }
}
```

**Returns:** Config dict

**Called by:** `handler()`, internal capabilities

---

#### `def save_llm_config(config)`
**Purpose:** Save LLM configuration to data/llm_config.json

**Parameters:**
- `config`: Config dict to save

**Returns:** Boolean success status

**Called by:** `handler()`, internal capabilities

---

### LLM Dispatcher

#### `async def dispatch_llm_action(action)`
**Purpose:** Route LLM actions through existing pipelines

**Parameters:**
- `action`: Action dict with type, parameters

**Actions:**
- Element actions → `send_element_action()`
- Capability actions → `send_capability_action()`

**Returns:** Result dict

**Called by:** `handler()` on test_dispatch

---

#### `async def send_element_action(action_id, action_type, params, timeout=10.0)`
**Purpose:** Send element action to extension with response tracking

**Flow:**
1. Generate unique request ID
2. Create future and store in `PENDING`
3. Send to extension
4. Wait for response (with timeout)
5. Clean up `PENDING` entry

**Returns:** Result dict

---

#### `async def send_capability_action(action, params, timeout=10.0)`
**Purpose:** Send capability action to extension with response tracking

**Flow:**
1. Generate unique request ID
2. Create future and store in `PENDING`
3. Send to extension
4. Wait for response (with timeout)
5. Clean up `PENDING` entry

**Returns:** Result dict

---

#### `def init_llm_dispatcher()`
**Purpose:** Initialize LLM dispatcher with element resolver

**Actions:**
- Set element resolver via `set_element_resolver(get_element_info)`
- Load capabilities via `llm_load_capabilities()`

**Called by:** `main()` on startup

---

### Utility Functions

#### `def slugify(value)`
**Purpose:** Create filesystem-friendly slug for filenames

**Rules:**
- Lowercase
- Replace non-alphanumeric with hyphens
- Collapse multiple hyphens
- Trim edges

**Returns:** Slug string

**Used by:** Transcript filename generation, chat ID generation

---

#### `async def process_actionable_elements_for_llm(actionable_elements)` (DISABLED)
**Purpose:** Process actionable elements into LLM-friendly action mapping

**Status:** Disabled (conflicts with semantic extraction)

**Would Write to:** `@site_structures/llm_actions.json`

---

#### `async def clear_llm_actions()` (DISABLED)
**Purpose:** Clear LLM actions when no elements available

**Status:** Disabled

**Would Write to:** `@site_structures/llm_actions.json`

---

#### `async def store_dom_change_context(dom_change_data)`
**Purpose:** Store DOM change context for LLM consumption

**Status:** Mostly disabled to reduce noise

**Actions:** Logs significant changes (>5 mutations only), does NOT persist to file

---

### Web Dashboard Broadcast

#### `async def broadcast_to_web_dashboards(message, exclude_ws=None)`
**Purpose:** Broadcast message to all connected web dashboard clients

**Parameters:**
- `message`: Message dict to broadcast
- `exclude_ws`: Optional WebSocket to exclude (the sender)

**Used For:** Sync state changes (theme, HUD, status) across all web UIs

**Called by:** `handler()` when HUD toggled, theme changed

---

### HTTP Server (Orb Page)

#### `def start_http_server(port=8080)`
**Purpose:** Start HTTP server for orb page in background thread

**Actions:**
- Generates orb HTML via `generate_orb_page_html()`
- Serves on port 8080
- Runs in daemon thread

**Called by:** `main()` on startup

---

#### `def generate_orb_page_html()`
**Purpose:** Generate full HTML page for orb control interface

**Features:**
- Theme selection (classic, robot, glass, glow, matrix, gradient, pulse)
- HUD toggle button
- WebSocket connection to ws_server.py
- Real-time theme sync
- Extension status display

**Returns:** HTML string

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
Test Client: {"type": "llm_instruction", "data": {"actionId": "a_id_0", "actionType": "click"}}
    ↓
ws_server handler() receives message
    ↓
Auto-resolve action type if not provided (using ELEMENT_REGISTRY)
    ↓
Look up hints via resolve_action_hints(action_id)
    ↓
Found hints (selectors)?
    ↓ Yes
Generate unique ID (llm-abc123)
    ↓
Forward to EXTENSION_WS as execute_action_with_hints
    ↓
Extension executes action using selectors (survives re-renders)
    ↓
Extension sends response with id=llm-abc123
    ↓
handler() receives response
    ↓
Routes back to original client via COMMAND_CLIENTS
```

---

### 3. Capability Execution Flow

```
Test Client: {"type": "execute_capability", "action": "RetrieveTranscript", "params": {}}
    ↓
ws_server handler() receives message
    ↓
Is it internal capability? (GetChatList, SetCurrentChat, etc.)
    ↓ Yes
execute_internal_capability()
    ↓
Check for _hud_action in result
    ↓ Yes
Send hud_action to extension
    ↓
Send capability_result to client
    ↓ No (extension/DOM capability)
Is it scroll capability? (ScrollDown, ScrollUp, etc.)
    ↓ Yes
Convert to scroll command, send to extension
    ↓ No
Is it site config capability? (RetrieveTranscript, etc.)
    ↓ Yes
Generate unique request ID (cap_RetrieveTranscript_1234567890)
    ↓
Store client in COMMAND_CLIENTS[request_id]
    ↓
Forward to EXTENSION_WS with request ID
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
Extract intelligence_data
    ↓
PARALLEL PROCESSING:
  ├─ save_transcripts() → @site_structures/transcripts/*.md, video_history.jsonl
  ├─ save_intelligence_to_page_jsonl() → @site_structures/page.jsonl
  ├─ save_content_to_content_jsonl() → @site_structures/content.jsonl
  └─ Generate text.md:
      - Extract semanticPageData
      - Populate ELEMENT_REGISTRY from semanticPageData.actionables
      - Resolve capabilities
      - Store LAST_TEXT_MD_DATA
      - Call write_text_md()
          - Frontmatter (title, URL, timestamp)
          - Browser tabs (formatted with display numbers)
          - Capabilities
          - Semantic page text
          - Iframe elements (placeholder)
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
Store in CURRENT_TABS_INFO global
    ↓
Update LAST_TABS_UPDATE timestamp
    ↓
Call update_tabs_in_text_md()
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
Extract activeTab details
    ↓
Store in CURRENT_ACTIVE_TAB global
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

### 10. LLMChat Capability Flow (Conversational AI)

```
Client: {"type": "execute_capability", "action": "LLMChat", "params": {"message": "...", "clear_history": false}}
    ↓
ws_server handler() receives message
    ↓
Create or reset LLM_AGENT if needed
    ↓
Call LLM_AGENT.chat(message)
    ↓
LLM generates response text
    ↓
Save to chat history:
  - Load chat via CURRENT_CHAT_ID
  - append_assistant_message(chat_dict, response_text)
  - save_chat(chat_dict)
    ↓
Push to HUD via extension:
  - Send hud_action with type: "append_message"
    ↓
Parse response for capability calls:
  - has_capability_calls(response_text)?
    ↓ Yes
  - parse_capability_calls(response_text)
    ↓
For each capability call:
  ├─ Element action? {"act": "a_id_0", "value": "...", "submit": true}
  │   ├─ Resolve action type (click, setValue, navigate)
  │   ├─ Resolve hints (selectors)
  │   ├─ Send execute_action_with_hints to extension
  │   └─ Track in history
  │
  ├─ Scroll capability? ScrollDown, ScrollUp, etc.
  │   ├─ Convert to scroll command
  │   └─ Send to extension
  │
  ├─ Zoom capability? ZoomIn, ZoomOut, ZoomReset
  │   ├─ Send to extension
  │   └─ Wait for response
  │
  ├─ Tab capability? SwitchTab, OpenTab, CloseTab
  │   ├─ Translate tab number to real tab ID
  │   ├─ Send to extension
  │   ├─ Wait for response
  │   ├─ Update CURRENT_TABS_INFO
  │   └─ Regenerate text.md with new tabs
  │
  ├─ Nav capability? GoBack, GoForward, Refresh
  │   └─ Send to extension
  │
  ├─ Site config capability? (RetrieveTranscript, etc.)
  │   ├─ Send to extension
  │   └─ Wait for response
  │
  └─ Internal capability? (GetChatList, LoadChat, etc.)
      ├─ execute_internal_capability()
      └─ Handle _hud_action if present
    ↓
Send capability_result to client with:
  - response: LLM text
  - history_length: conversation length
  - chat_id: active chat
  - message: saved message object
```

---

### 11. Iframe Elements Update Flow (Progressive Loading)

```
Extension: {"type": "iframe_elements_update", "iframeElements": [...], "iframeCount": N}
    ↓
ws_server handler() receives message
    ↓
Read existing text.md
    ↓
Build iframe section:
  - Formatted with JSON hints (iframe elements)
  - Button: {label} [iframe] → {"act": "a_id_X"}
  - Select: {label} [iframe] → {"act": "a_id_X", "value": "option"}
  - Input: {label} [iframe] → {"act": "a_id_X", "value": "...", "submit": true}
    ↓
Add to ELEMENT_REGISTRY:
  - ELEMENT_REGISTRY[action_id] = {type, tag, label, href: None, iframe: True}
    ↓
Replace placeholder or append to end
    ↓
Write updated text.md
```

---

### 12. Web Dashboard Sync Flow

```
Web Dashboard: {"type": "set_orb_theme", "theme": "robot", "_requestId": "..."}
    ↓
ws_server handler() receives message
    ↓
Send set_orb_theme to extension
    ↓
Update CURRENT_ORB_THEME global
    ↓
Send response to sender with _requestId
    ↓
Broadcast to other web dashboards:
  - Message: {"type": "orb_theme_changed", "theme": "robot"}
  - Exclude: original sender
```

---

## File Output

### Files Written by ws_server.py

| File | Function | Purpose |
|------|----------|---------|
| `@site_structures/page.jsonl` | `save_intelligence_to_page_jsonl()` | Normalized page records (meta, sections, actions) |
| `@site_structures/content.jsonl` | `save_content_to_content_jsonl()` | Content structure (headings, paragraphs, lists, etc.) |
| `@site_structures/text.md` | `write_text_md()` | Human-readable page text with frontmatter, tabs, capabilities |
| `@site_structures/transcripts/{date}__{slug}.md` | `save_transcripts()` | Individual transcript files with timestamped segments |
| `@site_structures/transcripts/video_history.jsonl` | `_append_video_history_entry()` | Append-only transcript history log |
| `data/chats/{chat_id}.json` | `save_chat()` | Chat conversation files |
| `data/llm_config.json` | `save_llm_config()` | LLM configuration (providers, settings) |
| `@site_structures/text.json` | Generated by extension, used by server | Action hints (label, type, selectors) for resolution |
| `@site_structures/{hostname}_page_text.md` | `save_page_text_to_markdown()` | Legacy text extraction (rarely used) |
| `@site_structures/llm_actions.json` | `process_actionable_elements_for_llm()` | LLM action mapping (DISABLED) |
| `@site_structures/llm_prompt.md` | `generate_llm_prompt()` | LLM-friendly prompt (DISABLED) |

---

### Chat File Format

**Path:** `./data/chats/{chat_id}.json`

**Structure:**
```json
{
  "chat_id": "check-youtube-comments__20251130T211523",
  "created_at": "2025-11-30T21:15:23Z",
  "updated_at": "2025-11-30T21:15:25Z",
  "title": "Check YouTube comments",
  "default_title": "check youtube comments",
  "meta": {
    "source": "ome-web",
    "page_url": "https://youtube.com/watch?v=abc123",
    "page_title": "Video Title",
    "project_id": "project-name"  // Optional
  },
  "messages": [
    {
      "id": "m_0001",
      "role": "user",
      "content": "Check YouTube comments",
      "timestamp": "2025-11-30T21:15:23Z"
    },
    {
      "id": "m_0002",
      "role": "assistant",
      "content": "I found 127 comments...",
      "timestamp": "2025-11-30T21:15:25Z"
    }
  ]
}
```

**Characteristics:**
- Append-only: Messages always added to end
- Sequential IDs: m_0001, m_0002, m_0003, etc.
- Two roles: "user" (from HUD/orb) and "assistant" (from LLM)
- Metadata: Captures page context where chat originated
- Timestamps: ISO 8601 format with Z suffix (UTC)

---

### text.md Format

**Path:** `@site_structures/text.md`

**Structure:**
```markdown
---
title: Page Title
url: https://example.com/page
last_updated: 2025-12-14T12:00:00.000Z
---

# Page Title

## Browser Tabs

Currently open tabs:
1. **Tab 1**: Example Page (active) - https://example.com/page
2. **Tab 2**: Another Page - https://example.com/other
3. **Tab 3**: Third Page - https://example.com/third

---

## Available Capabilities

- **RetrieveTranscript**: Get video transcript (on /watch?v= pages)
- **ScrollDown**: Scroll down one viewport
- **ScrollUp**: Scroll up one viewport
... (universal scroll capabilities)

---

## Page Content

[Semantic page text with tagged elements]

Link: Sign In → {"act": "a_id_0"}
Button: Subscribe → {"act": "a_id_1"}
Input: Search → {"act": "a_id_2", "value": "query", "submit": true}

---

## Secure Iframe Elements

*These elements are inside secure cross-origin iframes (e.g., payment forms):*

Input: Card Number [iframe] → {"act": "a_id_99", "value": "...", "submit": true}
```

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
| HTTP server port | `8080` | Orb control page |

---

## Important Implementation Details

### Client Identification

The server identifies the extension client by:
1. **First connection** - First client to connect becomes `EXTENSION_WS`
2. **Bridge status message** - Any client sending `{"type": "bridge_status"}` is marked as extension

This allows reconnection if the extension disconnects and reconnects.

---

### Response Routing System

The server uses **TWO mechanisms** for routing responses:

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

### Element Registry Pattern

**Purpose:** Enable selector-based action resolution that survives DOM re-renders

**Population:** From `semanticPageData.actionables` on each intelligence update

**Usage:**
1. LLM references element by action ID (e.g., `a_id_0`)
2. Server looks up in `ELEMENT_REGISTRY`
3. Server sends selectors to extension
4. Extension re-queries DOM using selectors (not stale references)

**Benefits:**
- Survives SPAs that re-render
- Works across page navigation (if selectors stable)
- Provides type information for action resolution

---

### SPA Filtering (Page Version Tracking) - DISABLED

The `generate_llm_prompt()` function implements SPA (Single Page Application) filtering (currently disabled):
- Each page scan increments `pageVersion`
- Each action ID embeds version: `a_id_{version}_{counter}`
- Old elements (version < current) are pruned unless they match persistent selectors
- Persistent selectors defined per-domain in site_configs.json

This prevents stale action IDs from cluttering the LLM prompt after page updates.

---

### Smart Action Categorization - DISABLED

The prompt generator uses pattern-based categorization (currently disabled):
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
🔌 Client connected! Total clients: 1
🎯 Marked as extension client
WS listening on ws://127.0.0.1:17892
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

### Executing Element Action (Shortcut)

```python
async def click_element():
    async with websockets.connect("ws://127.0.0.1:17892") as ws:
        msg = {
            "type": "click",
            "actionId": "a_id_0"
        }
        await ws.send(json.dumps(msg))
        response = await ws.recv()
        print(json.loads(response))
```

---

### Executing Capability

```python
async def execute_capability():
    async with websockets.connect("ws://127.0.0.1:17892") as ws:
        msg = {
            "type": "execute_capability",
            "action": "GetChatList",
            "params": {},
            "id": "cap-123"
        }
        await ws.send(json.dumps(msg))
        response = await ws.recv()
        print(json.loads(response))
```

---

## Debugging Tips

1. **Check extension connection:**
   ```
   Look for: "🎯 Marked as extension client"
   ```

2. **Verify tab information:**
   ```
   Look for: "📊 Tab info updated - N tabs"
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
   Look for: "✅ Text content saved to text.md"
   ```

6. **Monitor transcript saves:**
   ```
   Look for: "📝 Transcript saved: @site_structures/transcripts/*.md"
   Or: "⏭️ Skipping duplicate transcript for video ID: ..."
   ```

7. **Watch element registry:**
   ```
   Look for: "🎯 Element registry updated: N elements"
   Look for: "📊 Selector quality: X/Y have selectors"
   ```

8. **Check capability routing:**
   ```
   Look for: "🔧 Routing internal capability: ..."
   Look for: "🎯 Routing site config capability: ..."
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

### Why Element Registry?

**Problem:** Action IDs (a_id_X) become stale when SPAs re-render DOM

**Solution:** Store robust selectors in registry
1. Extension sends selectors with each action in semanticPageData
2. Server stores in `ELEMENT_REGISTRY`
3. When executing action, server sends selectors to extension
4. Extension re-queries DOM using selectors (fresh reference)

**Benefits:**
- Survives re-renders
- Works across page navigation (if selectors stable)
- Enables Type:Label format (resolve by type and label instead of ID)

---

### Why Disable Site Map Processing?

The site map generation (old approach) has been largely replaced by:
- **Normalized records** from extension's new scanning engine
- **Semantic page data** with tagged actionables
- **Direct JSONL output** instead of processing pipelines

The old functions remain in code for reference but are disabled/commented out.

---

## Redundant/Deprecated Functions

### Disabled Functions

| Function | Status | Reason |
|----------|--------|--------|
| `process_actionable_elements_for_llm()` | Disabled | Conflicts with semantic extraction |
| `clear_llm_actions()` | Disabled | No longer needed |
| `generate_llm_prompt()` | Mostly disabled | Replaced by text.md |
| `save_site_map_to_jsonl()` | Disabled | Old approach |
| `process_clean_site_map()` | Disabled | Old approach |
| `process_clean_site_map_data()` | Disabled | Old approach |
| `siteStructuredLLMmethodinsidethefile()` | Disabled | Old approach |
| `classify_element_enhanced()` | Disabled | Old approach |
| `deduplicate_elements()` | Disabled | Old approach |
| `filter_non_interactive_elements()` | Disabled | Old approach |
| `calculate_element_importance_score()` | Disabled | Old approach |
| `store_dom_change_context()` | Mostly disabled | Too noisy (logs only) |

---

## Async Patterns

### Concurrent Processing

**Intelligence Update:**
```python
# PARALLEL: All three run concurrently
transcript_refs = await save_transcripts(...)
await save_intelligence_to_page_jsonl(...)
await save_content_to_content_jsonl(...)
```

### Future-based Response Tracking

**Internal Commands:**
```python
fut = asyncio.get_event_loop().create_future()
PENDING[request_id] = fut
await EXTENSION_WS.send(...)
result = await asyncio.wait_for(fut, timeout=10.0)
```

### Background Tasks

**Heartbeat Loop:**
```python
# main()
asyncio.create_task(extension_heartbeat_loop())
```

---

## Related Documentation

- `/Users/andy7string/Projects/Om_E_Web/CLAUDE.md` - Project overview and coding philosophy
- `/Users/andy7string/Projects/Om_E_Web/SYSTEM_ARCHITECTURE_COMPLETE.md` - Complete system architecture
- `/Users/andy7string/Projects/Om_E_Web/web_extension/README.md` - Extension details
- `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/HowThisWorks.md` - Artifact generation details
