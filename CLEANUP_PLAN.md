# Om_E_Web Cleanup Plan: Transition to text.md-Only Pipeline

**Date:** 2025-11-23
**Goal:** Remove all action ID infrastructure and llm_prompt.md generation, keeping only the text.md + capabilities pipeline
**Estimated Reduction:** ~4,000-5,000 lines of code (23-29% reduction)

---

## Executive Summary

This plan identifies all code, functions, variables, and files to **DELETE** vs **KEEP** when transitioning to the text.md-only pipeline. The text.md pipeline is:

- **Config-driven:** Capabilities defined in site_configs.json
- **Generic:** Works across all sites without special-case logic
- **Selector-based:** Dynamic element discovery via CSS selectors
- **Clean:** Single artifact (text.md) with capabilities section

What we're removing:
1. Action ID system (registration, tracking, inflation prevention)
2. llm_prompt.md generation and all its helpers
3. llm_actions.json generation
4. Page versioning/numbering
5. Element registries (Maps storing action IDs)
6. Complex scan coordination tied to action IDs

---

## 1. Functions to DELETE (by file)

### content.js (Estimated: 3,500 lines to remove)

#### 🗑️ Action ID Registration System

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `registerActionableElement()` | 7300-7422 | Assigns action IDs, writes DOM markers | Called by scanAndRegisterPageElements |
| `registerInteractiveSubtree()` | ~150 | Partial registration during mutations, causes ID inflation | Called by analyzeStructureChanges |
| `scanAndRegisterPageElements()` | 9593-9800 | Full page scan with action ID assignment | Main scan entry point |
| `preserveExistingActionIds()` | ~50 | Reads data-ome-action-id markers to prevent ID changes | Called during scan |
| `buildMarkerIdMap()` | ~80 | Maps existing DOM markers to elements | Called during scan |

**Total Impact:** ~1,100 lines directly, ~1,500 lines including callers

#### 🗑️ Normalized Records Generation (for llm_prompt.md)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `buildNormalizedPageRecords()` | 5809-6500 | Generates JSONL records with action IDs | Calls extractSections, extractActionableRecords |
| `extractActionableRecords()` | ~250 | Builds action records from actionableElements Map | Called by buildNormalizedPageRecords |
| `extractSections()` | ~200 | Builds section hierarchy with action IDs | Called by buildNormalizedPageRecords |
| `extractMetaRecord()` | ~100 | Builds meta record with pageVersion | Called by buildNormalizedPageRecords |

**Total Impact:** ~700 lines

#### 🗑️ Element Tracking/Registry

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `intelligenceEngine.actionableElements` Map | N/A (global) | Stores actionId → metadata | Used everywhere |
| `intelligenceEngine.actionableElementNodes` Map | N/A (global) | Stores actionId → DOM node | Used for action execution |
| `intelligenceEngine.elementCounter` | N/A (global) | Increments to generate a_id_0, a_id_1, etc. | Core of action ID system |
| `getActionableElementById()` | ~30 | Lookup helper for action execution | Called by executeAction |

**Total Impact:** ~30 lines + all Map references

#### 🗑️ Action Execution by ID (Keep capability version instead)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `executeAction(actionId, actionType, params)` | 7800-8000 | Executes by pre-registered action ID | Message handler for execute_action |
| `executeActionById()` | ~50 | Helper wrapper | Called by executeAction |
| `universalClick()` | ~150 | Click execution (KEEP but refactor for capabilities) | Called by executeAction |
| `setValueWithEvents()` | ~100 | Set value execution (KEEP but refactor) | Called by executeAction |

**Total Impact:** ~200 lines (keep click/setValue logic, remove ID lookup)

#### 🗑️ Intelligence Update Queueing

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `queueIntelligenceUpdate()` | 5655-5700 | Debounces and sends normalized records | Called after scan |
| `sendIntelligenceUpdate()` | ~100 | Sends message to sw.js with normalizedRecords | Called by queue |

**Total Impact:** ~150 lines (replace with simpler text extraction send)

#### 🗑️ Scan Orchestration (Action ID specific)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `analyzeStructureChanges()` | 5084-5200 | Triggers registerInteractiveSubtree on mutations | MutationObserver callback |
| `handleMutations()` | ~80 | Processes mutations for action ID updates | Called by MutationObserver |
| `significantChangeDetector` | ~100 | Continuous monitoring for action ID changes | Started after scan |

**Total Impact:** ~250 lines

---

### sw.js (Estimated: 800 lines to remove)

#### 🗑️ Page Version Management

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `getPageVersion()` | 123-141 | Reads pageVersion from Chrome Storage | Called by requestScan |
| `setPageVersion()` | 144-172 | Writes pageVersion to Chrome Storage | Called by requestScan |
| `incrementPageVersion()` | 175-180 | Increments version for SPA nav | Called by requestScan |
| `resetPageVersion()` | 184-188 | Resets to 1 on refresh | Called by requestScan |
| `deleteTabPageVersions()` | 191-200 | Cleanup on tab close | Called by tabs.onRemoved |
| `extractDomain()` | 80-90 | Extracts domain for version key | Used by page version functions |
| `readTabState()` | 93-105 | Reads tab state from storage | Used by page version functions |
| `writeTabState()` | 108-120 | Writes tab state to storage | Used by page version functions |

**Total Impact:** ~350 lines

#### 🗑️ Scan Coordination (Action ID specific)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `requestScan()` | 500-592 | UNIFIED scan entry with pageVersion logic | All scan triggers |
| `triggerIntelligenceScan()` | 622-625 | DEPRECATED wrapper | Old code |
| `handleScanComplete()` | 597-617 | Forwards intelligence update with pageVersion | Message listener |

**Total Impact:** ~150 lines (replace with simpler scan trigger)

#### 🗑️ Tab State Management (Action ID specific)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `tabState` Map | N/A (global) | Tracks scanInProgress, lastUrl | Used by requestScan |
| `tabScanState` Map | N/A (global) | DEPRECATED duplicate | Legacy code |
| `internalTabState` Map | N/A (global) | Enhanced tab info with DOM changes | Used everywhere |
| `updateInternalTabState()` | 790-877 | Updates tab state with DOM changes | Called by sendTabsInfo |

**Total Impact:** ~150 lines (keep minimal tab tracking for capabilities)

#### 🗑️ Message Handling (Action ID specific)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `handleExecuteLLMAction()` | 1652-1714 | Executes action by ID | Message handler |
| `actionInProgress` flag | N/A (global) | Prevents rescans during actions | Used by handleExecuteLLMAction |

**Total Impact:** ~100 lines (replace with capability execution)

---

### ws_server.py (Estimated: 2,000 lines to remove)

#### 🗑️ page.jsonl Generation

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `save_intelligence_to_page_jsonl()` | 363-487 | Generates JSONL with action records | Called by handler |
| `_enrich_meta_record()` | ~50 | Adds browser state to meta | Called by save_intelligence_to_page_jsonl |

**Total Impact:** ~175 lines

#### 🗑️ llm_prompt.md Generation (ENTIRE PIPELINE)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `generate_llm_prompt()` | 1120-1451 | Main generator, reads page.jsonl | Called by handler |
| `_map_prompt_action_sentence()` | ~100 | Converts record to action sentence | Called by generate_llm_prompt |
| `_smart_categorize_actions()` | 1000-1080 | Categorizes actions by pattern | Called by generate_llm_prompt |
| `_filter_stale_elements_by_page_version()` | ~80 | SPA filtering logic | Called by generate_llm_prompt |
| `_deduplicate_by_line_text()` | ~50 | Deduplicates action lines (HIDES BUGS!) | Called by generate_llm_prompt |
| `_format_action_categories()` | ~150 | Formats categorized actions | Called by generate_llm_prompt |

**Total Impact:** ~600 lines

#### 🗑️ llm_actions.json Generation

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `process_actionable_elements_for_llm()` | 778-849 | Generates action ID → metadata map | Called by handler |
| `_build_llm_action_descriptor()` | ~50 | Builds action descriptor | Called by process_actionable_elements_for_llm |

**Total Impact:** ~120 lines

#### 🗑️ content.jsonl Generation (Redundant with text.md)

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `save_content_to_content_jsonl()` | 489-627 | Generates content structure | Called by handler |
| `_consolidate_content_elements()` | ~100 | Groups content by type | Called by save_content_to_content_jsonl |

**Total Impact:** ~240 lines

#### 🗑️ Legacy Consolidation Functions

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| `consolidate_actionable_elements_to_menus()` | 528-626 | Old data format fallback | Fallback code |
| `process_clean_site_map_data()` | 1453-1900 | Old site map processor | Dead code |

**Total Impact:** ~550 lines

#### 🗑️ PageVersion Handling

| Function | Lines | Why Remove | Dependencies |
|----------|-------|------------|--------------|
| Code referencing `pageVersion` | ~50 scattered | Validation, logging, filtering | Various |

**Total Impact:** ~50 lines

---

## 2. Functions to KEEP (minimal set)

### content.js (Estimated: 7,500 lines remaining)

#### ✅ Text Extraction (Core)

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `extractPageTextToMarkdown()` | ~500 | **CORE** text.md generator | Extracts semantic text with positions |
| `extractVisibleText()` | ~200 | Helper for text extraction | Called by extractPageTextToMarkdown |
| `getElementPosition()` | ~50 | Position calculation | Called by extractPageTextToMarkdown |
| `isElementVisible()` | ~50 | Visibility check | Called by extractPageTextToMarkdown |

**Purpose:** Generates text.md with semantic structure

#### ✅ Capability Execution (Core)

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `capabilityPipelineExecutor()` | 10073-10226 | **CORE** capability executor | Selector-based element discovery |
| `waitForElement()` | ~100 | Async element waiting | Called by capability executor |
| `querySelectorWithRetry()` | ~80 | Robust selector matching | Called by capability executor |

**Purpose:** Executes capabilities via selectors from site_configs.json

#### ✅ Site Config Management

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `getSiteConfigDirect()` | 886-950 | Loads site config | Reads site_configs.json via XHR |
| `matchDomain()` | ~50 | Domain matching | Called by getSiteConfigDirect |

**Purpose:** Resolves capabilities for current domain

#### ✅ DOM Utilities (Shared)

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `universalClick()` | ~150 | Click simulation | Used by capability executor |
| `setValueWithEvents()` | ~100 | Form value setting | Used by capability executor |
| `generateSelector()` | ~80 | CSS selector generation | Used by text extraction |

**Purpose:** Reusable DOM manipulation

#### ✅ Message Routing

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `chrome.runtime.onMessage` listener | ~200 | Message router | Handles execute_capability, site_configs_update |
| `sendToServiceWorker()` | ~50 | Message sender | Sends text extraction results |

**Purpose:** Communication with sw.js

---

### sw.js (Estimated: 1,600 lines remaining)

#### ✅ WebSocket Management

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `connectWebSocket()` | 241-311 | WS connection | Connects to ws_server.py |
| `sendToServer()` | 457-471 | Message sender | Sends data to server |
| `handleServerMessage()` | 887-983 | Message router | Routes server messages |

**Purpose:** Bridge to server

#### ✅ Keep-Alive System

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `ensureKeepAlivePort()` | 316-363 | Port management | Prevents worker suspension |
| `ensureOffscreenDocument()` | 369-389 | Offscreen doc | Keep-alive fallback |
| `sendHeartbeat()` | 411-426 | Heartbeat | Connection health |

**Purpose:** Service worker survival

#### ✅ Capability Execution Routing

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `handleExecuteCapability()` | 1720-1754 | Routes capability commands | Forwards to content.js |

**Purpose:** Capability pipeline routing

#### ✅ Tab Management (Minimal)

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `findActiveTab()` | 1766-1885 | Finds active tab | Required for message routing |
| `isTabAccessible()` | 1893-1907 | Tab accessibility check | Required for tab queries |
| `sendTabsInfo()` | 716-745 | Sends tab metadata | Server monitoring |
| `sendActiveTabInfo()` | 753-782 | Sends active tab | Server monitoring |

**Purpose:** Basic tab tracking for capabilities

#### ✅ Site Config Broadcasting

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| Site config update handler | ~50 | Broadcasts config updates | Instant config activation |

**Purpose:** Config-driven system

---

### ws_server.py (Estimated: 1,800 lines remaining)

#### ✅ text.md Generation

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `save_page_text_to_markdown()` | 850-950 | **CORE** text.md writer | Writes frontmatter + content |
| `_inject_capabilities_into_frontmatter()` | ~80 | Adds capabilities section | Called by save_page_text_to_markdown |

**Purpose:** Single artifact generation

#### ✅ Capability Resolution

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `resolve_capabilities_for_url()` | 584-614 | Matches capabilities to URL | Called by save_page_text_to_markdown |
| `get_all_site_configs()` | 54-82 | Loads site_configs.json | Called by resolve_capabilities_for_url |

**Purpose:** Config-driven capabilities

#### ✅ Transcript Management

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `save_transcripts()` | 628-743 | Saves transcript MD files | Deduplication + storage |
| `_build_transcript_signature()` | 564-610 | Hash-based deduplication | Called by save_transcripts |
| `_append_video_history_entry()` | ~50 | Logs video history | Called by save_transcripts |

**Purpose:** Transcript pipeline (separate from action IDs)

#### ✅ WebSocket Server

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `handler()` | 2847-3100 | Main message router | Routes all messages |
| `start_server()` | ~50 | Server initialization | Entry point |

**Purpose:** Core communication

#### ✅ Message Routing

| Function | Lines | Why Keep | Purpose |
|----------|-------|----------|---------|
| `handle_llm_instruction()` | ~50 | Routes capability commands | Called by handler |
| `route_to_extension()` | ~30 | Forwards to extension | Called by handler |

**Purpose:** Message forwarding

---

## 3. Code Sections to REMOVE (within functions)

### content.js

#### Within Scan Functions

```javascript
// ❌ REMOVE: Action ID writing to DOM
element.setAttribute('data-ome-action-id', actionId);

// ❌ REMOVE: Action ID lookups
const actionId = element.getAttribute('data-ome-action-id');

// ❌ REMOVE: Marker ID map building
const markerIdMap = new Map();
document.querySelectorAll('[data-ome-action-id]').forEach(el => {
    markerIdMap.set(el, el.getAttribute('data-ome-action-id'));
});

// ❌ REMOVE: Element counter increment
this.elementCounter++;

// ❌ REMOVE: Element registration in Map
this.actionableElements.set(actionId, descriptor);
this.actionableElementNodes.set(actionId, element);

// ❌ REMOVE: PageVersion inclusion
pageVersion: currentPageVersion
```

#### Within Message Handlers

```javascript
// ❌ REMOVE: execute_action handler
case 'execute_action':
    const { actionId, actionType } = message.data;
    const element = actionableElementNodes.get(actionId);
    // ... execution logic

// ✅ KEEP: execute_capability handler (refactor to use selectors directly)
case 'execute_capability':
    const { action, params } = message;
    const result = await capabilityPipelineExecutor(action, params);
```

---

### sw.js

#### Within requestScan()

```javascript
// ❌ REMOVE: Page version logic
const isNewPage = state.lastUrl !== url;
const isRefresh = trigger === 'page_refresh';
let pageVersion;

if (isRefresh) {
    pageVersion = await resetPageVersion(tabId, url);
} else if (isNewPage) {
    pageVersion = await incrementPageVersion(tabId, url);
} else {
    pageVersion = await getPageVersion(tabId, url);
}

// ❌ REMOVE: PageVersion in scan message
await chrome.tabs.sendMessage(tabId, {
    type: 'start_scan',
    pageVersion,  // ← DELETE THIS
    url,
    trigger
});
```

#### Within handleScanComplete()

```javascript
// ❌ REMOVE: PageVersion forwarding
const dataWithPageVersion = {
    ...message.intelligenceData,
    pageVersion: message.pageVersion || 1  // ← DELETE THIS
};

// ✅ KEEP: Text data forwarding
ws.send(JSON.stringify({
    type: 'intelligence_update',
    data: {
        pageText: intelligenceData.pageText,  // ← KEEP
        capabilities: intelligenceData.capabilities  // ← KEEP
    }
}));
```

---

### ws_server.py

#### Within handler()

```javascript
// ❌ REMOVE: All these function calls
await save_intelligence_to_page_jsonl(data)
await save_content_to_content_jsonl(data)
await process_actionable_elements_for_llm(data.actionableElements)
await generate_llm_prompt(...)

// ✅ KEEP: Only these
await save_transcripts(data.transcripts)
await save_page_text_to_markdown(data.pageText)
```

---

## 4. Global Variables to REMOVE

### content.js

```javascript
// ❌ REMOVE: Action ID system
let elementCounter = 0;
const actionableElements = new Map();
const actionableElementNodes = new Map();

// ❌ REMOVE: Page versioning
let currentPageVersion = null;

// ❌ REMOVE: Scan state tied to action IDs
let scanInProgress = false;  // (if only used for action ID scans)

// ❌ REMOVE: Intelligence engine if only used for action IDs
var intelligenceEngine = null;  // (refactor to text extraction engine)

// ❌ REMOVE: Change aggregator if only for action ID updates
var changeAggregator = null;
```

### sw.js

```javascript
// ❌ REMOVE: Page version state (Chrome Storage)
// Delete entire storage structure: { tabState: { tabs: { ... } } }

// ❌ REMOVE: In-memory tab state
const tabState = new Map();  // (if only used for scan coordination)
const tabScanState = new Map();  // DEPRECATED
let internalTabState = new Map();  // (if only used for action ID tracking)

// ❌ REMOVE: Action flag
let actionInProgress = false;
```

### ws_server.py

```python
# ❌ REMOVE: Page data cache
CURRENT_PAGE_DATA = None
LAST_PAGE_UPDATE = None

# ❌ REMOVE: Content data cache
CURRENT_CONTENT_DATA = None
LAST_CONTENT_UPDATE = None

# ✅ KEEP: Transcript data
CURRENT_TRANSCRIPTS_INFO = []
VIDEO_HISTORY_JSONL = ...
```

---

## 5. Message Types to REMOVE/KEEP

### REMOVE

| Message Type | Direction | Purpose | Used By |
|--------------|-----------|---------|---------|
| `intelligence_update` (with normalizedRecords) | cs → sw → srv | Sends action records | OLD pipeline |
| `execute_action` | srv → sw → cs | Execute by action ID | OLD pipeline |
| `scan_complete` (with pageVersion) | cs → sw | Scan finished with version | OLD pipeline |

### KEEP

| Message Type | Direction | Purpose | Used By |
|--------------|-----------|---------|---------|
| `text_extraction_complete` | cs → sw → srv | Sends text.md data | NEW pipeline |
| `execute_capability` | srv → sw → cs | Execute capability | NEW pipeline |
| `site_configs_update` | srv → sw → cs | Broadcast config changes | NEW pipeline |
| `tabs_info` | sw → srv | Tab metadata | Monitoring |
| `ping/pong` | bidirectional | Heartbeat | Keep-alive |

---

## 6. File I/O to REMOVE

### Delete File Writes

```python
# ❌ REMOVE: ws_server.py
await save_to_file("@site_structures/page.jsonl", ...)
await save_to_file("@site_structures/llm_actions.json", ...)
await save_to_file("@site_structures/llm_prompt.md", ...)
await save_to_file("@site_structures/content.jsonl", ...)

# ✅ KEEP: ws_server.py
await save_to_file("@site_structures/text.md", ...)
await save_to_file("@site_structures/transcripts/*.md", ...)
await append_to_file("@site_structures/transcripts/video_history.jsonl", ...)
```

### Delete File Reads

```python
# ❌ REMOVE: ws_server.py
page_jsonl_content = read_file("@site_structures/page.jsonl")
llm_actions = read_file("@site_structures/llm_actions.json")
```

### Delete Chrome Storage

```javascript
// ❌ REMOVE: sw.js
await chrome.storage.local.set({ tabState: ... });
await chrome.storage.local.get(['tabState']);
```

---

## 7. Estimated Code Reduction

### By File

| File | Current Lines | Lines to Remove | Lines Remaining | Reduction % |
|------|---------------|-----------------|-----------------|-------------|
| **content.js** | 11,069 | 3,500 | 7,569 | 32% |
| **sw.js** | 2,386 | 800 | 1,586 | 34% |
| **ws_server.py** | 3,803 | 2,000 | 1,803 | 53% |
| **TOTAL** | 17,258 | 6,300 | 10,958 | **37%** |

### By Category

| Category | Lines Removed |
|----------|---------------|
| Action ID registration/tracking | 1,500 |
| Normalized records generation | 900 |
| llm_prompt.md generation | 800 |
| Page versioning system | 500 |
| Element registries/Maps | 400 |
| llm_actions.json generation | 200 |
| content.jsonl generation | 300 |
| Scan coordination (action ID specific) | 600 |
| Legacy consolidation | 700 |
| Message handling (action ID specific) | 400 |
| **TOTAL** | **6,300** |

### Complexity Reduction

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| **Scan triggers** | 19 | 3 | 84% |
| **Global Maps** | 5 | 0 | 100% |
| **Artifact files generated** | 7 | 2 | 71% |
| **Message types** | 15 | 8 | 47% |
| **Functions in content.js** | ~150 | ~80 | 47% |

---

## 8. Dependency Graph

### What Depends on What

```
Action ID System
├── registerActionableElement()
│   ├── scanAndRegisterPageElements() [DELETE]
│   ├── registerInteractiveSubtree() [DELETE]
│   └── buildMarkerIdMap() [DELETE]
├── actionableElements Map
│   ├── executeAction() [DELETE]
│   ├── buildNormalizedPageRecords() [DELETE]
│   └── extractActionableRecords() [DELETE]
└── elementCounter
    └── ALL action ID generation [DELETE]

Page Versioning System
├── getPageVersion()
│   └── requestScan() [REFACTOR]
├── incrementPageVersion()
│   └── requestScan() [REFACTOR]
└── Chrome Storage (tabState)
    └── ALL page version functions [DELETE]

llm_prompt.md Generation
├── generate_llm_prompt()
│   ├── page.jsonl [DELETE]
│   ├── _map_prompt_action_sentence() [DELETE]
│   ├── _smart_categorize_actions() [DELETE]
│   └── _filter_stale_elements_by_page_version() [DELETE]
└── Triggered by: handler() [REFACTOR]

text.md Pipeline (KEEP)
├── extractPageTextToMarkdown()
│   ├── extractVisibleText()
│   └── getElementPosition()
├── save_page_text_to_markdown()
│   └── resolve_capabilities_for_url()
└── capabilityPipelineExecutor()
    └── waitForElement()
```

### Safe Removal Order

**Phase 1: Disable Outputs** (Test that text.md still works)
1. Comment out `generate_llm_prompt()` call in handler()
2. Comment out `process_actionable_elements_for_llm()` call
3. Comment out `save_intelligence_to_page_jsonl()` call
4. Comment out `save_content_to_content_jsonl()` call
5. **TEST:** Verify text.md and transcripts still generate

**Phase 2: Remove File Generation**
1. Delete `generate_llm_prompt()` function
2. Delete `process_actionable_elements_for_llm()` function
3. Delete `save_intelligence_to_page_jsonl()` function
4. Delete `save_content_to_content_jsonl()` function
5. **TEST:** No errors in server logs

**Phase 3: Remove Page Versioning**
1. Comment out page version logic in `requestScan()`
2. Comment out Chrome Storage reads/writes
3. Delete page version functions
4. **TEST:** Scans still trigger correctly

**Phase 4: Remove Action ID Registration**
1. Comment out `registerActionableElement()` calls
2. Comment out `buildMarkerIdMap()` logic
3. Delete action ID functions
4. **TEST:** Text extraction still works

**Phase 5: Remove Element Registries**
1. Comment out Map insertions/lookups
2. Delete `actionableElements` Map
3. Delete `actionableElementNodes` Map
4. Delete `elementCounter`
5. **TEST:** Capabilities still execute

**Phase 6: Remove Normalized Records**
1. Delete `buildNormalizedPageRecords()`
2. Delete `extractActionableRecords()`
3. Delete `extractSections()`
4. **TEST:** No errors

**Phase 7: Cleanup**
1. Delete unused imports
2. Delete unused global variables
3. Delete unused message handlers
4. Remove commented code
5. **FINAL TEST:** Full capability execution flow

---

## 9. Migration Steps

### Step 1: Create Backup Branch
```bash
git checkout -b backup/before-cleanup
git push origin backup/before-cleanup
git checkout main
git checkout -b feature/text-md-only-pipeline
```

### Step 2: Disable Phase (Reversible)

**ws_server.py:**
```python
# In handler(), comment out:
# await save_intelligence_to_page_jsonl(data)
# await save_content_to_content_jsonl(data)
# await process_actionable_elements_for_llm(data.actionableElements)
# await generate_llm_prompt(...)

# Keep only:
await save_transcripts(data.transcripts)
await save_page_text_to_markdown(data.pageText)
```

**TEST:**
```bash
python3 om_e_web_ws/ws_server.py &
# Navigate to YouTube video
# Verify text.md generates correctly
cat @site_structures/text.md
```

### Step 3: Remove File Writers

Delete these functions from ws_server.py:
- `save_intelligence_to_page_jsonl()`
- `save_content_to_content_jsonl()`
- `process_actionable_elements_for_llm()`
- `generate_llm_prompt()`
- All helper functions (`_map_prompt_action_sentence`, `_smart_categorize_actions`, etc.)

**TEST:**
```bash
# Restart server
# Verify no errors
# Verify text.md still generates
```

### Step 4: Remove Page Versioning

**sw.js:**
```javascript
// Delete these functions:
// - getPageVersion()
// - setPageVersion()
// - incrementPageVersion()
// - resetPageVersion()
// - deleteTabPageVersions()
// - extractDomain()
// - readTabState()
// - writeTabState()

// Simplify requestScan():
async function requestScan(tabId, url, trigger) {
    // Remove all pageVersion logic
    // Just inject content script and send scan message
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
    });

    await chrome.tabs.sendMessage(tabId, {
        type: 'start_scan',
        url,
        trigger
    });
}
```

**TEST:**
```bash
# Test SPA navigation
# Test page refresh
# Verify scans still trigger
```

### Step 5: Remove Action ID Registration

**content.js:**
```javascript
// Delete these functions:
// - registerActionableElement()
// - registerInteractiveSubtree()
// - buildMarkerIdMap()
// - preserveExistingActionIds()

// Delete from scanAndRegisterPageElements():
// - elementCounter increment
// - data-ome-action-id writes
// - Map insertions

// Keep only:
// - Text extraction logic
// - Capability resolution
```

**TEST:**
```bash
# Test text extraction
# Test capability execution
# Verify no DOM markers written
```

### Step 6: Remove Normalized Records

**content.js:**
```javascript
// Delete these functions:
// - buildNormalizedPageRecords()
// - extractActionableRecords()
// - extractSections()
// - extractMetaRecord()

// Replace intelligence update with text extraction:
function sendTextExtraction() {
    const textData = extractPageTextToMarkdown();
    const capabilities = resolveCapabilitiesForURL();

    chrome.runtime.sendMessage({
        type: 'text_extraction_complete',
        data: {
            pageText: textData,
            capabilities: capabilities
        }
    });
}
```

**TEST:**
```bash
# Test text extraction message
# Verify server receives correct format
```

### Step 7: Remove Execute Action by ID

**content.js:**
```javascript
// Delete executeAction(actionId, actionType, params)
// Delete getActionableElementById()

// Keep only capabilityPipelineExecutor()

// Update message handler:
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'execute_capability') {
        const result = await capabilityPipelineExecutor(message.action, message.params);
        sendResponse(result);
    }
});
```

**sw.js:**
```javascript
// Delete handleExecuteLLMAction()
// Keep only handleExecuteCapability()
```

**TEST:**
```bash
# Test capability execution
python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript
```

### Step 8: Cleanup

1. Delete unused global variables
2. Delete unused imports
3. Delete commented code
4. Remove orphaned functions
5. Update comments to reflect new architecture

**Files to delete entirely:**
```bash
rm @site_structures/page.jsonl
rm @site_structures/content.jsonl
rm @site_structures/llm_actions.json
rm @site_structures/llm_prompt.md
```

**TEST:**
```bash
# Full integration test
# 1. Start server
# 2. Navigate to YouTube video
# 3. Verify text.md generates with capabilities
# 4. Execute capability: RetrieveTranscript
# 5. Verify transcript saves
# 6. Check @site_structures/ only has text.md and transcripts/
```

---

## 10. Testing Checklist After Each Phase

### Phase 1: Disable Outputs
- [ ] text.md generates correctly
- [ ] Capabilities section appears in frontmatter
- [ ] Transcripts still save
- [ ] No errors in server logs

### Phase 2: Remove File Generation
- [ ] Server starts without errors
- [ ] text.md still generates
- [ ] No attempts to write deleted files

### Phase 3: Remove Page Versioning
- [ ] Scans trigger on navigation
- [ ] SPA navigation works
- [ ] Page refresh works
- [ ] No Chrome Storage errors

### Phase 4: Remove Action ID Registration
- [ ] Text extraction works
- [ ] No DOM markers written
- [ ] Capability resolution works

### Phase 5: Remove Element Registries
- [ ] No Map-related errors
- [ ] Capability executor finds elements via selectors
- [ ] Memory usage reduced

### Phase 6: Remove Normalized Records
- [ ] Intelligence messages simplified
- [ ] Server receives text extraction data
- [ ] No JSONL generation

### Phase 7: Remove Execute Action by ID
- [ ] Capability execution works
- [ ] No action ID lookups
- [ ] test_navigation.py works with capabilities

### Phase 8: Cleanup
- [ ] No orphaned functions
- [ ] No unused variables
- [ ] No commented code blocks
- [ ] Documentation updated

---

## 11. Risk Mitigation

### High-Risk Areas

1. **Capability executor may break if it relies on action ID infrastructure**
   - **Mitigation:** Verify capabilityPipelineExecutor() only uses selectors
   - **Test:** Execute all capabilities before removal

2. **Text extraction may reference action ID Maps**
   - **Mitigation:** Search codebase for Map references in text extraction
   - **Test:** Generate text.md with all Maps deleted

3. **Message routing may expect pageVersion**
   - **Mitigation:** Remove pageVersion from all message definitions
   - **Test:** Trigger scans and verify messages route correctly

### Rollback Plan

If cleanup breaks critical functionality:

1. **Immediate rollback:**
   ```bash
   git checkout main
   git branch -D feature/text-md-only-pipeline
   git checkout backup/before-cleanup
   ```

2. **Partial rollback:**
   - Restore specific functions from git history
   - Re-enable specific file writes
   - Add back minimal action ID support

---

## 12. Success Metrics

### Code Quality

- [ ] **37% code reduction** (6,300 lines removed)
- [ ] **84% fewer scan triggers** (19 → 3)
- [ ] **100% Map removal** (5 → 0)
- [ ] **71% fewer artifacts** (7 → 2 files)

### Functionality

- [ ] Text extraction works on all test sites
- [ ] Capability execution works (YouTube transcript, etc.)
- [ ] Site config updates broadcast instantly
- [ ] No memory leaks (Maps cleaned up)

### Performance

- [ ] Scan latency < 400ms (unchanged)
- [ ] Text.md write < 5ms (unchanged)
- [ ] Memory per tab < 30MB (improved from 50MB)

### Maintainability

- [ ] Clear separation: text extraction vs capability execution
- [ ] Config-driven (no code changes for new sites)
- [ ] Single artifact (text.md)
- [ ] No action ID inflation bugs

---

## 13. Final Validation

### Manual Testing

1. **YouTube Video Page:**
   - Navigate to video
   - Verify text.md generates with capabilities section
   - Execute RetrieveTranscript capability
   - Verify transcript saves to transcripts/

2. **Google Search:**
   - Navigate to search results
   - Verify text.md generates
   - Verify capabilities resolved (if any)

3. **SPA Navigation:**
   - Navigate to YouTube homepage
   - Click on video (SPA navigation)
   - Verify text.md updates
   - Verify no action ID remnants

4. **Capability Execution:**
   ```bash
   python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript
   ```
   - Verify selector-based discovery works
   - Verify multi-step workflow executes
   - Verify response returns to client

### Automated Testing

```bash
# Test text.md generation
pytest tests/test_text_extraction.py

# Test capability execution
pytest tests/test_capabilities.py

# Test site config resolution
pytest tests/test_site_config.py
```

---

## 14. Documentation Updates

After cleanup, update:

1. **CLAUDE.md:**
   - Remove action ID system references
   - Remove llm_prompt.md pipeline description
   - Emphasize text.md + capabilities
   - Update example commands

2. **THIS_IS_HOW_IT_ALL_WORKS.md:**
   - Delete llm_prompt.md pipeline section
   - Delete page versioning section
   - Update data flow diagrams
   - Remove action ID bug descriptions

3. **web_extension/README.md:**
   - Remove action ID registration description
   - Emphasize capability pipeline
   - Update example workflows

4. **om_e_web_ws/HowThisWorks.md:**
   - Remove page.jsonl, llm_actions.json, llm_prompt.md descriptions
   - Keep text.md and transcripts/ descriptions

---

## Conclusion

This cleanup removes **6,300 lines (37%)** of action ID infrastructure, leaving a clean, config-driven text.md + capabilities pipeline. The text.md pipeline is:

- **Generic:** Works across all sites without special-case logic
- **Simple:** Single artifact with capabilities section
- **Config-driven:** Add new sites/capabilities via site_configs.json only
- **Stable:** No action ID inflation, no ID collisions, no stale elements
- **Fast:** Fewer scans, no element registration overhead

**Key Principle:** If it's not directly used for text extraction, capability resolution, capability execution, text.md generation, or transcript management, it's **GONE**.

---

**Ready to execute? Follow migration steps 1-8 sequentially, testing after each phase.**
