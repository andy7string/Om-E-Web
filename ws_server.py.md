# ws_server.py Deep Analysis

**Mission:** Analyze DOM scanning bugs causing action ID inflation, duplicate elements, and overlapping scans.

**Analysis Date:** 2025-11-18
**File:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/ws_server.py`
**Total Lines:** 3720

---

## Chunk 1: Lines 1-1599 (Globals, Intelligence Processing, Artifact Generation)

### 1. Components in This Chunk

#### Global State Variables
- **CLIENTS** (line 40): Set of all connected WebSocket clients
- **PENDING** (line 41): Dictionary mapping command IDs to futures for response routing
- **EXTENSION_WS** (line 42): Reference to the Chrome extension WebSocket connection
- **COMMAND_CLIENTS** (line 43): Command ID → Client mapping for response routing
- **CURRENT_TABS_INFO** (line 46): Latest tabs_info from extension
- **LAST_TABS_UPDATE** (line 47): Timestamp of last tab update
- **CURRENT_ACTIVE_TAB** (line 48): Current active tab information
- **SITE_CONFIGS** (line 51): Loaded site configurations with capabilities
- **SITE_STRUCTURES_DIR** (line 54): Output directory for artifacts (`@site_structures`)
- **CURRENT_PAGE_JSONL** (line 57): Filename for central page state (`page.jsonl`)
- **CURRENT_PAGE_DATA** (line 58): In-memory cache of current page data
- **LAST_PAGE_UPDATE** (line 59): Timestamp of last page update
- **CURRENT_CONTENT_JSONL** (line 62): Filename for content state (`content.jsonl`)
- **CURRENT_CONTENT_DATA** (line 63): In-memory cache of content data
- **LAST_CONTENT_UPDATE** (line 64): Timestamp of last content update
- **TRANSCRIPTS_DIR** (line 65): Directory for transcript files
- **CURRENT_TRANSCRIPTS_INFO** (line 66): List of current transcript references
- **VIDEO_HISTORY_JSONL** (line 67): File tracking video history
- **SERVER_HEARTBEAT_INTERVAL** (line 69): 20 seconds

#### Helper Functions (Lines 72-187)
- **`slugify(value: str)`** (line 72-81): Creates filesystem-friendly slugs
- **`consolidate_actionable_elements_to_menus(actionable_elements)`** (line 83-187):
  - Categorizes elements by type (navigation, toggles, actions, content)
  - Builds main_navigation menu structure
  - Returns consolidated menu structure with summary

#### Content Consolidation (Lines 189-330)
- **`consolidate_content_elements_to_structure(content_elements)`** (line 189-330):
  - Categorizes content by type (headings, paragraphs, lists, images, tables)
  - Returns consolidated content structure

### 2. DOM Scanning & Registration

#### Intelligence Update Processing
**`save_intelligence_to_page_jsonl(intelligence_data, transcript_refs=None)`** (line 332-454):
- **CRITICAL FUNCTION**: Main entry point for processing intelligence updates from extension
- Updates global state: `CURRENT_PAGE_DATA`, `LAST_PAGE_UPDATE`
- Processes `normalizedRecords` if available (modern path)
- Enriches meta record with browser_state, current_page, transcripts
- Writes to `@site_structures/page.jsonl`
- Fallback to legacy format if normalizedRecords not available

**`save_content_to_content_jsonl(intelligence_data, transcript_refs=None)`** (line 456-526):
- Processes content elements from intelligence data
- Applies content consolidation
- Updates global state: `CURRENT_CONTENT_DATA`, `LAST_CONTENT_UPDATE`
- Writes to `@site_structures/content.jsonl`

#### Transcript Processing (Lines 528-743)
- **`_ensure_video_history_file()`** (line 529): Creates video history file
- **`_load_video_history_entries()`** (line 538): Loads historical entries
- **`_append_video_history_entry(entry)`** (line 557): Appends to history
- **`_collect_existing_transcript_signatures()`** (line 564-610): Gathers signatures to avoid duplicates
- **`_build_transcript_signature(video_id, segments)`** (line 613-625): Creates stable signature
- **`save_transcripts(transcripts, page_state=None)`** (line 628-743):
  - Uses signature-based deduplication
  - Writes transcript markdown files to `@site_structures/transcripts/`
  - Updates global `CURRENT_TRANSCRIPTS_INFO`

### 3. SCAN TRIGGERS (CRITICAL)

**NO DIRECT SCAN TRIGGERS IN THIS CHUNK** - Server processes intelligence updates sent by extension, does not initiate scans.

#### Intelligence Update Receivers:
1. **`save_intelligence_to_page_jsonl()`** (line 332):
   - Called when extension sends intelligence update
   - Writes artifacts: `page.jsonl`
   - Does NOT trigger new scans - only processes received data

2. **`save_content_to_content_jsonl()`** (line 456):
   - Called when extension sends content update
   - Writes artifacts: `content.jsonl`
   - Does NOT trigger new scans

3. **`save_transcripts()`** (line 628):
   - Called when extension sends transcript data
   - Writes transcript files
   - Does NOT trigger new scans

### 4. Action ID Assignment

**`process_actionable_elements_for_llm(actionable_elements)`** (line 745-815):
- **PURPOSE**: Transform actionable elements into LLM-friendly format
- **DOES NOT ASSIGN ACTION IDs** - uses action IDs from extension
- Processes `actionable_elements` list, reads `actionId` from each element (line 786)
- Creates `llm_actions` dictionary mapping action_id → metadata
- Adds page context: URL, title, timestamp (lines 768-781)
- Writes to `@site_structures/llm_actions.json` (line 802)
- **RISK**: If extension sends duplicate action IDs across multiple intelligence updates, this will overwrite previous entries but won't detect duplication

**`clear_llm_actions()`** (line 864-903):
- Creates empty `llm_actions.json` when no elements available
- Only writes page context metadata

### 5. LLM Prompt Generation

**`generate_llm_prompt(text_md_path, page_jsonl_path, out_path, max_actions)`** (line 1087-1451):
- **CRITICAL FUNCTION**: Generates `llm_prompt.md` from page.jsonl and text.md
- Reads page.jsonl line-by-line (lines 1108-1146)
- Extracts action records via `_map_prompt_action_sentence()` (line 1130)
- **DEDUPLICATION LOGIC** (lines 1148-1156):
  ```python
  seen: set[str] = set()
  deduped_records: List[Dict[str, Any]] = []
  for rec in action_records_with_index:
      if rec['line'] in seen:
          continue  # Skip duplicates
      seen.add(rec['line'])
      deduped_records.append(rec)
  ```
  - Deduplicates by **full line text**, NOT by action ID
  - **RISK**: If two different action IDs have identical labels, only first is kept
  - **RISK**: Does not detect if same action ID appears multiple times with different labels

**`_map_prompt_action_sentence(record)`** (line 999-1085):
- Maps action records to prompt sentences
- Filters hidden elements (line 1006)
- Allows important hidden elements: interactive rows, inputs, accessibility links (lines 1020-1045)
- Returns formatted action sentence, e.g., `"return (a_id_123) to click 'Button'"` (line 1067)

**Smart Categorization** (lines 1169-1263):
- **`_smart_categorize_actions()`**: Categorizes actions by pattern
  - `transcript_actions`: Transcript-related (line 1193-1200)
  - `email_actions`: Table rows (line 1203-1205)
  - `search_inputs`: Search fields (line 1207-1213)
  - `video_links`: Video links by href pattern (line 1215-1218)
  - `channel_links`: Profile links (line 1220-1223)
  - `footer_links`: Footer links (lines 1225-1233)
  - `regular_actions`: Everything else
- Limits footer links to `MAX_FOOTER_LINKS` (line 1262)

### 6. Mutation Observers & Event Listeners

**N/A** - Server-side code, no DOM observers.

### 7. Timers, Intervals, Async Loops

**None in this chunk** - Will check in later chunks for WebSocket event loops and heartbeats.

### 8. Dead/Legacy/Duplicated Code

**Legacy Consolidation** (lines 419-450):
- Fallback path in `save_intelligence_to_page_jsonl()` when `normalizedRecords` not available
- Calls `consolidate_actionable_elements_to_menus()` - likely dead code if extension always sends normalized records

**Disabled Menu Detection** (lines 1267-1357):
- Large block of menu detection code wrapped in `if False:` (line 1267)
- Kept "for reference" but never executed
- **SHOULD BE REMOVED** to reduce confusion

**Disabled DOM Change History** (lines 925-928):
- Comment indicates file writing was too noisy
- Function `store_dom_change_context()` (line 905) still exists but does minimal work

### 9. Cross-File Interactions

**NO MESSAGES SENT TO EXTENSION IN THIS CHUNK** - Only processes incoming data.

**Artifact Files Written:**
- `@site_structures/page.jsonl` (line 407)
- `@site_structures/content.jsonl` (line 509)
- `@site_structures/transcripts/*.md` (line 686)
- `@site_structures/video_history.jsonl` (line 560)
- `@site_structures/llm_actions.json` (line 802)
- `@site_structures/llm_prompt.md` (line 1446)
- `@site_structures/*_page_text.md` (line 844)

### 10. Chunk Summary

**Key Findings:**
- Server **receives** intelligence updates but does NOT trigger scans
- Action IDs are **assigned by extension**, server only processes them
- `save_intelligence_to_page_jsonl()` is main entry point for intelligence data (line 332)
- `generate_llm_prompt()` deduplicates by **line text**, not action ID (lines 1148-1156)
- **RISK**: No validation that action IDs are unique across intelligence updates
- **RISK**: If extension sends same action ID multiple times, server will overwrite without detecting duplicates
- Legacy/dead code in fallback paths suggests modern extension uses `normalizedRecords`

**Suspected Risks:**
- Deduplication is **text-based**, could miss action ID collisions
- No cross-update deduplication - each intelligence update overwrites previous
- Global state (`CURRENT_PAGE_DATA`) is replaced wholesale on each update - no merging or comparison

---

## Chunk 2: Lines 2847-3720 (WebSocket Handler & Main Event Loop)

### 1. Components in This Chunk

#### Main WebSocket Handler
**`async def handler(ws)`** (line 2847-3520):
- **CRITICAL FUNCTION**: Main message routing hub for all WebSocket communication
- Manages client lifecycle: connect, message processing, disconnect
- Handles client identification (extension vs test clients)
- Routes messages between extension and test clients

#### Supporting Functions
- **`async def send_command(command, params, timeout)`** (line 3522-3575): Internal server-to-extension command sender
- **`async def extension_heartbeat_loop()`** (line 3578-3592): Periodic ping to extension (every 20s)
- **`resolve_capabilities_for_url(url)`** (line 3594-3658): Resolves capabilities from site_configs.json
- **`load_site_configs()`** (line 3660-3689): Loads site_configs.json on startup
- **`async def main()`** (line 3691-3717): Server startup and event loop

### 2. DOM Scanning & Registration

**NO DIRECT DOM SCANNING** - Server only receives and processes intelligence updates from extension.

### 3. SCAN TRIGGERS (CRITICAL)

#### MAIN INTELLIGENCE UPDATE HANDLER (Lines 2987-3102)
**Message type: `intelligence_update`** (line 2988)

**Flow:**
1. Extract intelligence data from message (line 2992)
2. Extract actionable elements, insights, page state, transcripts (lines 2993-2999)
3. **Save transcripts** → `save_transcripts()` (line 3005)
4. **Save to page.jsonl** → `save_intelligence_to_page_jsonl()` (line 3008)
5. **Save to content.jsonl** → `save_content_to_content_jsonl()` (line 3011)
6. **Generate text.md** from page text (lines 3013-3057)
7. **Process for LLM** → `process_actionable_elements_for_llm()` (line 3061)
8. **Generate llm_prompt.md** → `generate_llm_prompt()` (lines 3064-3074)
9. **BONUS**: YouTube transcript button hunter (lines 3078-3097)
   - If URL contains `/watch?v=` and `youtube.com`
   - Sends `youtube_find_transcript_button` command to extension
   - **POTENTIAL TRIGGER**: This could trigger additional DOM scanning in extension

**CRITICAL OBSERVATION:**
- Server does NOT trigger scans
- Server only PROCESSES intelligence updates sent by extension
- **Each intelligence update OVERWRITES all previous artifacts**
- No incremental updates, no merging, no diffing

#### OTHER MESSAGE HANDLERS (No Scan Triggers)
- **`execute_capability`** (lines 3105-3145): Forwards capability commands to extension
- **`dom_content_changed`** (lines 3148-3162): Logs DOM changes, calls `store_dom_change_context()` (minimal work)
- **`network_activity`** (lines 3165-3187): Logs network activity, no scan triggering
- **`extractPageText`** (lines 3190-3230): Forwards text extraction request to extension
- **`llm_instruction`** (lines 3233-3284): Forwards LLM action execution to extension
- **`tabs_info`** (lines 2964-2968): Stores tab information in global state
- **`active_tab_info`** (lines 2971-2985): Stores active tab in global state
- **`ping/pong`** (lines 2941-2956): Heartbeat handling

### 4. Action ID Assignment

**NO ACTION ID ASSIGNMENT** - Server only processes action IDs from extension.

Action IDs flow:
1. Extension assigns action IDs during DOM scan
2. Extension sends intelligence update with action IDs
3. Server processes action IDs in:
   - `save_intelligence_to_page_jsonl()` (writes to page.jsonl)
   - `process_actionable_elements_for_llm()` (writes to llm_actions.json)
   - `generate_llm_prompt()` (writes to llm_prompt.md)

### 5. Mutation Observers & Event Listeners

**N/A** - Server-side code, no DOM observers.

### 6. Timers, Intervals, Async Loops

**`extension_heartbeat_loop()`** (line 3578-3592):
- Runs continuously in background
- Sends `server_ping` to extension every 20 seconds (SERVER_HEARTBEAT_INTERVAL)
- **Does NOT trigger scans**, only checks connection health

**Main event loop** (line 3714-3716):
- Runs `extension_heartbeat_loop()` concurrently with WebSocket server
- No timers that trigger scans

### 7. Dead/Legacy/Duplicated Code

**Shortcut Normalization** (lines 2884-2938):
- Converts shortcut commands (`exec_action`, `set_value`, `click`, etc.) to standard format
- Normalizes messages before processing
- Active code, not dead

**Site Map Auto-Save** (lines 3394-3472):
- Commented out file saving (lines 3401-3406)
- Process site map data directly without saving intermediate files
- Complex processing logic for element classification and filtering
- Calls `process_clean_site_map_data()` and `siteStructuredLLMmethodinsidethefile()`
- **Likely related to different artifact generation pipeline** - not directly related to intelligence updates

**YouTube Transcript Button Hunter** (lines 3078-3097):
- Sends `youtube_find_transcript_button` command to extension on YouTube video pages
- **POTENTIAL ISSUE**: Could trigger additional DOM scanning in extension
- Executed AFTER intelligence update processing

### 8. Cross-File Interactions

#### Messages SENT to Extension:
1. **`execute_capability`** (line 3128): Capability execution commands
2. **`extractPageText`** (line 3201): Text extraction requests
3. **`execute_llm_action`** (line 3255): LLM instruction execution
4. **`youtube_find_transcript_button`** (line 3091): YouTube transcript button hunter
5. **`server_ping`** (line 3586): Heartbeat ping every 20s
6. **General commands** (line 3345): Forwarded from test clients

#### Messages RECEIVED from Extension:
1. **`intelligence_update`** (line 2988): Main intelligence data
2. **`tabs_info`** (line 2964): Tab information
3. **`active_tab_info`** (line 2971): Active tab information
4. **`bridge_status`** (line 2959): Extension identification
5. **`dom_content_changed`** (line 3148): DOM change notifications
6. **`network_activity`** (line 3165): Network activity
7. **`pong`** (line 2954): Heartbeat response
8. **Command responses**: Any message with `id` and `ok`/`error` fields (line 3351)

### 9. Chunk Summary

**Key Findings:**
- **Intelligence update handler (line 2988) is the ONLY entry point for DOM data**
- Server processes intelligence updates and writes artifacts **wholesale replacement, no merging**
- **Each intelligence update overwrites:**
  - `page.jsonl`
  - `content.jsonl`
  - `text.md`
  - `llm_actions.json`
  - `llm_prompt.md`
- **YouTube transcript hunter (line 3091) sends command to extension** - could trigger additional scanning
- Server-side heartbeat (20s interval) does NOT trigger scans
- No evidence of server-side scan triggering or action ID assignment

**Suspected Risks:**
- **Wholesale replacement of artifacts** means no tracking of previous state
- If extension sends multiple intelligence updates rapidly, artifacts thrash
- **YouTube transcript hunter** could cause unexpected scan after main intelligence update
- No validation that new intelligence update is different from previous

---

## FILE COMPLETE – Global Summary

### All Message Handlers That Process Intelligence

**Primary Intelligence Pipeline:**
```
Extension → intelligence_update → handler() (line 2988)
  ↓
  ├─→ save_transcripts() (line 3005)
  ├─→ save_intelligence_to_page_jsonl() (line 3008)
  ├─→ save_content_to_content_jsonl() (line 3011)
  ├─→ Generate text.md (line 3036-3050)
  ├─→ process_actionable_elements_for_llm() (line 3061)
  └─→ generate_llm_prompt() (line 3068)
```

**Secondary Triggers:**
```
Extension → intelligence_update → YouTube video detection (line 3081)
  └─→ youtube_find_transcript_button command → Extension
      └─→ Could trigger additional DOM scan in extension
```

### Artifact Generation Pipeline

**Artifacts Written on Each Intelligence Update:**
1. **`@site_structures/page.jsonl`** - Normalized records or legacy format
2. **`@site_structures/content.jsonl`** - Consolidated content structure
3. **`@site_structures/text.md`** - Page text with frontmatter
4. **`@site_structures/llm_actions.json`** - Action ID → metadata mapping
5. **`@site_structures/llm_prompt.md`** - Compact prompt with categorized actions
6. **`@site_structures/transcripts/*.md`** - Transcript files (if present)
7. **`@site_structures/transcripts/video_history.jsonl`** - Video history (append only)

**Write Mode:**
- All files use `'w'` mode = **overwrite**
- No incremental updates
- No diffing or comparison with previous state
- Each intelligence update is treated as **complete replacement**

### How Intelligence Updates Flow to Artifacts

**1. Intelligence Update Message (from extension):**
```json
{
  "type": "intelligence_update",
  "data": {
    "normalizedRecords": [...],     // Modern format
    "actionableElements": [...],     // Legacy format
    "contentElements": [...],
    "pageState": {...},
    "transcripts": [...],
    "pageText": "..."
  }
}
```

**2. Server Processing:**
- Extracts `normalizedRecords` (preferred) or `actionableElements` (fallback)
- Processes transcripts with signature-based deduplication
- Enriches with browser state (tabs, active tab)
- Writes all artifacts synchronously
- No caching, no comparison with previous data

**3. Artifact Files:**
- `page.jsonl`: Contains normalized records OR legacy consolidated menus
- `content.jsonl`: Contains consolidated content structure
- `text.md`: Contains page text with frontmatter
- `llm_actions.json`: Maps action IDs to metadata
- `llm_prompt.md`: Categorized action list with deduplication

### LLM Prompt Generation and Action Table Management

**`generate_llm_prompt()` (line 1087-1451):**

**Input:**
- `text_md_path`: Path to text.md
- `page_jsonl_path`: Path to page.jsonl
- `out_path`: Output path for llm_prompt.md
- `max_actions`: Maximum actions to include (from config.py)

**Processing:**
1. Read page.jsonl line-by-line
2. Extract action records via `_map_prompt_action_sentence()`
3. **Deduplicate by line text** (lines 1148-1156):
   ```python
   seen: set[str] = set()  # Tracks unique line text
   for rec in action_records_with_index:
       if rec['line'] in seen:
           continue  # Skip duplicate
       seen.add(rec['line'])
       deduped_records.append(rec)
   ```
4. Smart categorization by pattern:
   - Search inputs (priority 1)
   - Transcript actions (priority 2)
   - Email rows (Gmail, etc.)
   - Video links (YouTube, etc.)
   - Channel links
   - Footer links (limited to MAX_FOOTER_LINKS)
   - Regular actions
5. Resolve capabilities from URL (via `resolve_capabilities_for_url()`)
6. Write categorized sections to llm_prompt.md

**Output (llm_prompt.md):**
```markdown
# Page Title

**URL:** https://example.com

## Actions

### Search
- return (a_id_1,{yourValue}) to set value for 'Search'. Add submit:true to submit.

### Capabilities
- return (RetrieveTranscript) to retrieve the full transcript for this video

### Transcript
- return (a_id_5) to click 'Show transcript'

### Videos
- return (a_id_10) to navigate to 'Video Title 1'
- return (a_id_11) to navigate to 'Video Title 2'

### Other Actions
- return (a_id_20) to click 'Subscribe'

### Footer
- return (a_id_100) to navigate to 'About'
...
```

**Critical Deduplication Logic:**
- Deduplication is **text-based** (by full line text), NOT by action ID
- **RISK**: If two action IDs have identical labels, only first is kept
  ```
  return (a_id_1) to click 'Subscribe'  ← Kept
  return (a_id_2) to click 'Subscribe'  ← Discarded (duplicate text)
  ```
- **RISK**: Does not detect if same action ID appears with different labels
  ```
  return (a_id_1) to click 'Subscribe'   ← Both kept (different text)
  return (a_id_1) to click 'Unsubscribe' ← Different text, same ID
  ```

### Sources of Stale/Duplicate Data in Artifacts

**1. No Cross-Update Validation:**
- Server does not track previous intelligence updates
- No comparison of new vs old action IDs
- Each update is treated as complete replacement

**2. Text-Based Deduplication in llm_prompt.md:**
- Only deduplicates within single page.jsonl
- Does not detect action ID collisions
- Could hide action ID inflation if labels are identical

**3. No Timestamp Validation:**
- Server does not check if intelligence update is newer than current data
- Could theoretically overwrite newer data with older data if messages arrive out of order

**4. YouTube Transcript Hunter Side Effect:**
- Sends command to extension AFTER processing intelligence update (line 3091)
- Could trigger additional DOM scan in extension
- Could result in second intelligence update shortly after first
- **POTENTIAL SOURCE OF OVERLAPPING SCANS**

**5. Global State Replacement:**
- `CURRENT_PAGE_DATA`, `CURRENT_CONTENT_DATA` replaced wholesale (lines 396, 505)
- No merging or incremental updates
- If extension sends partial updates, previous data is lost

**6. No Detection of Rapid Updates:**
- Server happily processes multiple intelligence updates in quick succession
- No throttling, no queuing, no "update in progress" flag
- If extension sends 3 intelligence updates in 1 second, all 3 are processed, artifacts written 3 times

**CRITICAL FINDING:**
The server is a **passive processor** - it does not trigger scans or assign action IDs. All action ID inflation must originate from the extension. The server's only contribution to the problem is:
1. **Wholesale artifact replacement** (no incremental updates)
2. **Text-based deduplication** (hides action ID collisions in llm_prompt.md)
3. **YouTube transcript hunter** (could trigger additional scans)

**CONCLUSION:**
To find the root cause of action ID inflation, we must analyze:
1. **Extension's DOM scanning logic** (content.js)
2. **Extension's action ID assignment** (content.js)
3. **Extension's intelligence update triggering** (content.js, sw.js)
4. **When/how YouTube transcript hunter triggers scans** (extension)

---
