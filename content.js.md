# content.js Deep Analysis - DOM Scanning & Action ID Inflation Investigation

**Analysis Date:** 2025-11-18
**File:** `/Users/andy7string/Projects/Om_E_Web/web_extension/content.js`
**Total Lines:** 11,785
**Mission:** Identify causes of action ID inflation (+200 per navigation), duplicate elements in llm_prompt.md, and overlapping scan triggers

---

## CHUNK 1: Lines 1-1700 - Initialization, Page Idle Monitor, and Initial Scan Logic

### 1. Components in this chunk

**Globals & State (Lines 20-878):**
- `window.omEWebContentScriptLoaded` (line 21) - Duplicate injection guard
- `initialScanScheduled` (line 70) - Boolean flag for initial scan
- `initialScanReason` (line 71) - Tracks reason for initial scan
- `pageIdleMonitor` (lines 73-300) - Singleton pattern for idle detection
- `domChangeObserver` (line 853) - MutationObserver for DOM changes
- `changeDetectionEnabled` (line 854) - Boolean flag
- `changeCount` (line 855) - Counter for DOM changes
- `lastChangeTime` (line 856) - Timestamp tracking
- `lastSignificantChange` (line 859) - Timestamp for significant changes
- `changeAggregator` (line 865) - Aggregates DOM changes
- `intelligenceEngine` (line 866) - Main intelligence processing engine
- `pageContext` (line 867) - Current page context
- `changeHistory` (line 868) - Array of DOM changes
- `lastIntelligenceUpdate` (line 869) - Timestamp of last update
- `initialFocusApplied` (line 871) - Boolean flag for focus tracking
- `focusRetryTimer` (line 872) - Timer for focus retries
- `siteConfig` (line 882) - Loaded from site_configs.json
- `window.currentSiteConfig` (line 877) - Global site config reference
- `window.currentFramework` (line 878) - Framework identifier

**pageIdleMonitor (Lines 73-300):**
- Singleton pattern (`window.omEWebPageIdleMonitor`)
- Tracks `inflightRequests` (fetch/XHR)
- Wraps `window.fetch` and `XMLHttpRequest` to track network activity
- Uses MutationObserver and PerformanceObserver to detect DOM/network changes
- `waitForIdle()` - Returns promise when page is quiet for `quietWindow` ms (default 200ms)
- Calls `notifyNetworkActivity()` on fetch/XHR start/end (lines 150, 162, 203, 215)

**scheduleInitialScan() (Lines 302-330):**
- Sets `initialScanScheduled = true`
- Uses `pageIdleMonitor.waitForIdle({ maxWait: 12000, quietWindow: 200 })`
- Calls `runScanAfterPageLoad()` after idle detected
- Waits for `document.readyState === 'complete'` or `load` event

**Fallback Timer (Lines 332-337):**
- 4-second timeout if service worker doesn't trigger initial scan
- Calls `scheduleInitialScan('fallback_timeout')`

**scanWhenPageSettles() (Lines 339-353):**
- Wrapper around `pageIdleMonitor.waitForIdle()`
- Accepts scan function as callback
- Default maxWait: 12000ms, quietWindow: 200ms

**Site Config Loading (Lines 876-948):**
- `getSiteConfigDirect()` (line 894) - Synchronous XHR to load `site_configs.json`
- Exact domain match → partial match → default fallback logic
- Sets `siteConfig`, `window.currentSiteConfig`, `window.currentFramework`

**scanWithFrameworkSelectors() (Lines 1098-1206):**
- Uses `window.currentSiteConfig.selectors` to query DOM
- Priority order: `text_inputs`, `navigation`, `url_elements`, `buttons`, `menus`, `content_elements`, `hidden_content`
- Uses `WeakSet` (`seenElements`) to prevent duplicate element scanning **within single scan**
- Returns array of `{ element, type, selector, framework }` objects
- Calls `testSelectorsAfterScan()` (line 1201)

**runScanAfterPageLoad() (Lines 1266-1285):**
- Calls `performAutomaticDisconnectCycle()` (line 1272)
- Calls `intelligenceEngine.scanAndRegisterPageElements()` (line 1278)
- **CRITICAL:** Comment on line 1280 says "Intelligence update triggered here - moved to AFTER filtering is complete"

**initializeDOMChangeDetection() (Lines 1296-1377):**
- Creates `domChangeObserver = new MutationObserver(...)`
- Watches `childList`, `subtree`, `attributes`, `characterData`
- Calls `isSignificantChange(mutations)` to filter noise (line 1314)
- On significant change:
  - Calls `changeAggregator.addChange(changeInfo)` (line 1333)
  - Calls `intelligenceEngine.queueIntelligenceUpdate('high')` (line 1340)
  - Calls `notifyServiceWorkerOfChanges()` (line 1349)
- Observes `document.body` (line 1366)
- Sets `window.domChangeDetectionInitialized = true` (line 1370)

### 2. DOM scanning & registration

**scanWithFrameworkSelectors():**
- Queries DOM using config selectors
- Returns elements but does NOT assign action IDs
- Uses `WeakSet` to prevent duplicate scanning **within this call**
- **KEY ISSUE:** WeakSet is local to each scan call, does NOT persist across scans

**runScanAfterPageLoad():**
- Calls `intelligenceEngine.scanAndRegisterPageElements()` (line 1278)
- This is where action ID assignment should happen
- **Need to analyze intelligenceEngine to see ID assignment logic**

### 3. SCAN TRIGGERS (CRITICAL)

#### TRIGGER 1: Initial Page Load (Lines 302-337)
- **Function:** `scheduleInitialScan(reason, options)`
- **Fired by:**
  - Service worker message (reason tracked but message listener not in this chunk)
  - Fallback timer after 4s (line 332-337)
- **Calls:** `runScanAfterPageLoad()` → `intelligenceEngine.scanAndRegisterPageElements()`
- **Idle wait:** Up to 12s for page to settle

#### TRIGGER 2: MutationObserver on Significant Changes (Lines 1296-1377)
- **Function:** `initializeDOMChangeDetection()` → MutationObserver callback (line 1307)
- **Fired by:** DOM mutations (childList, attributes, characterData)
- **Calls:** `intelligenceEngine.queueIntelligenceUpdate('high')` (line 1340)
- **Filter:** Only if `isSignificantChange(mutations)` returns true
- **Observes:** `document.body` with `subtree: true`

#### TRIGGER 3: Network Activity Monitoring (Lines 138-231)
- **Function:** `wrapFetch()` and `wrapXmlHttpRequest()`
- **Fired by:** Wrapped fetch/XHR calls
- **Calls:** `notifyNetworkActivity()` → service worker notification
- **Marks change:** `markChange()` → triggers idle check → may trigger scan
- **Does NOT directly trigger scan**, but affects idle detection

### 4. Action ID assignment

**Not visible in this chunk.** Action IDs assigned in `intelligenceEngine.scanAndRegisterPageElements()` which is not yet analyzed.

**Observations:**
- `scanWithFrameworkSelectors()` returns raw elements, no IDs assigned
- `runScanAfterPageLoad()` calls `intelligenceEngine.scanAndRegisterPageElements()`
- Need to analyze `intelligenceEngine` class to see ID assignment

### 5. Mutation observers & event listeners

**MutationObserver #1: pageIdleMonitor (Lines 234-246):**
- **Watches:** `document` (entire tree)
- **Options:** `childList: true, subtree: true, attributes: true, characterData: true`
- **Callback:** `markChange()` → updates `lastChangeTime` → triggers idle check
- **Scan trigger:** Indirect - affects `waitForIdle()` resolution
- **Purpose:** Detect when page is quiet for idle detection

**MutationObserver #2: domChangeObserver (Lines 1296-1377):**
- **Watches:** `document.body`
- **Options:** `childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-*', 'aria-*'], characterData: true`
- **Callback:** On significant change → `intelligenceEngine.queueIntelligenceUpdate('high')`
- **Scan trigger:** DIRECT - queues intelligence update on significant DOM changes
- **Purpose:** Detect post-scan DOM changes and trigger rescan

**Load Event Listener (Line 326):**
- **Event:** `window.addEventListener('load', ...)`
- **Callback:** Calls `startScan()` → `runScanAfterPageLoad()`
- **Trigger:** Page load complete
- **Purpose:** Initial page scan

### 6. Timers, intervals, async loops

**Timer #1: Fallback Initial Scan (Lines 332-337):**
- **Type:** `setTimeout(..., 4000)`
- **Fires:** If `!initialScanScheduled` after 4 seconds
- **Calls:** `scheduleInitialScan('fallback_timeout')`
- **Scan trigger:** YES - calls `runScanAfterPageLoad()`
- **Overlap potential:** If service worker also triggers scan, could have 2 scans

**Timer #2: Focus Retry (Lines 465-474):**
- **Type:** `setTimeout(..., 600)`
- **Fires:** If initial focus failed
- **Calls:** `applyConfiguredFocus(reason)`
- **Scan trigger:** NO - only focuses element
- **Overlap potential:** None

**Timer #3: Keep-Alive Reconnect (Line 58, 64):**
- **Type:** `setTimeout(ensureKeepAlivePortConnection, 500/1000)`
- **Fires:** If keep-alive port disconnects
- **Calls:** `ensureKeepAlivePortConnection()`
- **Scan trigger:** NO
- **Overlap potential:** None

**Timer #4: Context Invalidation Retry (Line 1423):**
- **Type:** `setTimeout(..., 1000)`
- **Fires:** If extension context invalidated
- **Calls:** `initializeIntelligenceSystem()`
- **Scan trigger:** MAYBE - if initialization triggers scan
- **Overlap potential:** HIGH - could reinitialize during active scan

**Idle Detection Loop (Lines 98-131):**
- **Type:** `requestIdleCallback` or `requestAnimationFrame`
- **Purpose:** Poll for idle state
- **Scan trigger:** Indirect - resolves `waitForIdle()` which triggers scan
- **Overlap potential:** None - only resolves promises

### 7. Dead/legacy/duplicated code

**Likely Dead:**
- `performAutomaticDisconnectCycle()` (lines 951-1006) - CSP bypass logic that disconnects runtime, clears storage, requests reinjection. Comment says "Note: We can't use setTimeout here as the context is invalidated" but doesn't complete. **Unclear if functional.**
- `testSelectorsAfterScan()` (lines 1228-1263) - Queries selectors but has no effect, no return value, logs removed
- `cmd_waitFor()`, `cmd_getText()`, `cmd_click()`, `cmd_getPageMarkdown()` (lines 1592-1699+) - Command pattern functions, unclear if used

**Duplicated:**
- `visible()` (line 1485) vs `isElementVisible()` (line 489) - Two visibility check functions, likely similar

**Unclear:**
- `discoverLoginControls()` (lines 680-835) - Returns login form discovery results, but no call site visible in this chunk

### 8. Cross-file interactions

**Messages TO service worker:**
- `chrome.runtime.sendMessage({ type: "network_activity", ... })` (line 1389)
- `chrome.runtime.sendMessage({ type: "dom_changed", ... })` (line 1411)
- `chrome.runtime.sendMessage({ command: 'forceContentScriptReinjection', ... })` (line 979)
- `chrome.runtime.connect({ name: "ome_keep_alive" })` (line 52)

**Messages FROM service worker:**
- Not visible in this chunk - need to find `chrome.runtime.onMessage.addListener()`

**To ws_server.py:**
- Via service worker - no direct WebSocket connection from content script

### 9. Chunk Summary

**Key Findings:**
1. **TWO MutationObservers running in parallel** - one for idle detection, one for change detection
2. **Initial scan triggered by multiple sources:** service worker message, 4s fallback timer, `load` event
3. **Overlapping scan potential:** Fallback timer + service worker message could trigger 2 scans
4. **DOM change observer directly triggers intelligence update** via `queueIntelligenceUpdate('high')` on significant changes
5. **WeakSet for duplicate prevention is local to each scan** - does NOT persist across scans
6. **Context invalidation retry** (line 1423) calls `initializeIntelligenceSystem()` which may trigger scan during active scan
7. **Action ID assignment not visible yet** - happens in `intelligenceEngine.scanAndRegisterPageElements()`
8. **Network activity wrapped** - fetch/XHR calls trigger idle detection changes

**Suspected Risks:**
- **Race condition:** Fallback timer + service worker message could trigger simultaneous scans
- **Overlapping scans:** MutationObserver fires during active scan → queues another intelligence update
- **No persistent element tracking:** WeakSet resets on each scan, elements rescanned get new IDs
- **Context invalidation during scan:** Could reinitialize while scan in progress

**Critical Questions for Next Chunks:**
1. Where is `intelligenceEngine.scanAndRegisterPageElements()` defined?
2. Where is `intelligenceEngine.queueIntelligenceUpdate()` defined?
3. How are action IDs assigned and incremented?
4. Is there logic to skip duplicate elements across scans?
5. Where is `isSignificantChange()` defined?
6. Where is `chrome.runtime.onMessage.addListener()` registered?

---

## CHUNK 2: Lines 1919-2500 - Message Handlers & Command Execution

### 1. Components in this chunk

**Main Message Listener (Lines 1919-2284):**
- `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {...})`
- Main frame safety check (line 1922)
- Routes `start_intelligence_scan` to `scheduleInitialScan('service_worker')` (line 1931)
- Routes `execute_action` to second listener (line 1945)
- Command router for: waitFor, getText, click, getPageMarkdown, extractPageText, getCurrentTabInfo, getNavigationContext, searchActions, discoverLoginControls, generateSiteMap, getDOMChangeStatus, enableDOMChangeDetection, getElementCoordinatesByActionId, disableDOMChangeDetection, resetDOMChangeCount, navigation commands, intelligence commands

**Helper Functions:**
- `getCurrentTabInfo()` (lines 2299-2330) - Returns page metadata
- `getNavigationContext()` (lines 2340-2349) - Returns navigation state
- `removeOverlays()` (lines 2360-2462) - Removes cookie banners, modals, popups
- `generateSiteMap()` (lines 2484+) - Creates LLM-friendly site structure

### 2. DOM scanning & registration

No direct scanning in this chunk - only command routing.

### 3. SCAN TRIGGERS (CRITICAL)

#### TRIGGER 4: Service Worker Message (Line 1930)
- **Function:** Message listener → `scheduleInitialScan('service_worker')`
- **Fired by:** Service worker sends `{ type: "start_intelligence_scan" }`
- **Calls:** `scheduleInitialScan('service_worker', { quietPeriod: 200, maxWait: 12000 })`
- **Scan trigger:** YES - triggers initial scan
- **Overlap potential:** HIGH - if fallback timer (4s) fires before service worker message, two scans

#### TRIGGER 5: Command Execution - scanAndRegisterElements (Line 2235)
- **Function:** Message listener → `intelligenceEngine.scanAndRegisterPageElements()`
- **Fired by:** External command `{ command: "scanAndRegisterElements" }`
- **Calls:** `intelligenceEngine.scanAndRegisterPageElements()` directly
- **Scan trigger:** YES - direct scan call
- **Overlap potential:** HIGH - no scan lock check before calling

### 4. Action ID assignment

Not visible in this chunk.

### 5. Mutation observers & event listeners

No new mutation observers or event listeners in this chunk - only message listeners.

### 6. Timers, intervals, async loops

No new timers in this chunk.

### 7. Dead/legacy/duplicated code

**Command functions:** `cmd_waitFor()`, `cmd_getText()`, `cmd_click()`, `cmd_getPageMarkdown()`, `cmd_extractPageText()` are called from message listener, so they are active, not dead code.

### 8. Cross-file interactions

**Messages FROM service worker:**
- `{ type: "start_intelligence_scan" }` → triggers initial scan (line 1930)
- `{ type: "execute_action", data: { actionId, actionType, params } }` → routed to second listener (line 1945)
- Various command messages (waitFor, getText, click, etc.)

### 9. Chunk Summary

**Key Findings:**
1. **Service worker message triggers initial scan** via `scheduleInitialScan('service_worker')` (line 1931)
2. **NO guard against duplicate scan calls** - service worker message AND fallback timer (4s) could both fire
3. **Command `scanAndRegisterElements` directly calls scan** with no lock check (line 2239)
4. **Main frame safety check** at start of message listener (line 1922) prevents iframe execution
5. **Two separate message listeners** - main listener (line 1919) and second listener for LLM actions (not in this chunk yet)

**Suspected Risks:**
- **Race condition:** Service worker message + 4s fallback timer → two simultaneous initial scans
- **No scan deduplication:** Multiple scan triggers have no coordination mechanism
- **Command-triggered scans bypass checks:** `scanAndRegisterElements` command calls scan directly

---

## CHUNK 3: Lines 4900-5600 - IntelligenceEngine Core & Change Processing

### 1. Components in this chunk

**ChangeAggregator Class (Lines 4900-4995):**
- `ChangeAggregator.prototype.processChanges()` - Processes pending DOM changes
- Groups changes by type and target
- Generates intelligence events for `intelligenceEngine.processEvent(event)`

**IntelligenceEngine Constructor (Lines 5000-5027):**
- `this.pageState` - Tracks current view, interactive elements, content elements, navigation state
- `this.eventHistory = []` - Array of processed events
- `this.llmInsights = []` - LLM-generated insights
- `this.actionableElements = new Map()` - **MAP OF ACTIONABLE ELEMENTS WITH IDs**
- `this.actionableElementNodes = new Map()` - **MAP OF LIVE DOM NODES KEYED BY actionId**
- `this.contentElements = new Map()` - Map of content elements
- **`this.elementCounter = 0`** - **CRITICAL: COUNTER FOR GENERATING UNIQUE IDs**
- `this.initialScanCompleted = false` - Boolean flag
- `this.youtubeRegisteredUrls = new Set()` - YouTube video URL tracking
- `this.lastTranscriptSignature = null` - Transcript deduplication

**IntelligenceEngine.prototype.processEvent()** (Line 5032)
- Processes intelligence events from ChangeAggregator
- Calls `updatePageState(event)`, `generateLLMInsights(event)`
- **NOTE:** Intelligence update sending is disabled (line 5042-5043)

**IntelligenceEngine.prototype.updatePageState()** (Line 5049)
- Routes events to `analyzeStructureChanges()`, `analyzeStateChanges()`, `analyzeContentChanges()`, `analyzeElementTransformation()`

**IntelligenceEngine.prototype.analyzeStructureChanges()** (Lines 5071-5112)
- Filters `childList` mutations for new elements
- Calls `registerInteractiveSubtree(element)` for each new element (line 5084)
- Calls `registerYoutubeLinksFromNode(element)` for YouTube (line 5087)
- **CRITICAL:** Calls `this.queueIntelligenceUpdate('high', 'dom_subtree')` when elements registered (line 5109)

**IntelligenceEngine.prototype.registerInteractiveSubtree()** (Lines 5114-5153)
- **CRITICAL FUNCTION:** Walks DOM tree and registers interactive elements
- Checks `isInteractiveElement(current)` and `passesBasicQualityFilter(current)` (line 5136)
- Calls `registerActionableElement(current, actionType)` (line 5138)
- **INCREMENTS REGISTERED COUNT** (line 5140)
- Returns number of newly registered elements

**IntelligenceEngine.prototype.isInteractiveElement()** (Lines 5158-5252)
- **CRITICAL FUNCTION:** Determines if element should be scanned
- Uses `siteConfig.selectors` to match elements against framework patterns (line 5180)
- **Returns true for ANY element matching framework selectors** (line 5186)
- **FALLBACK:** Generic logic for common interactive tags (buttons, inputs, links)

**IntelligenceEngine.prototype.passesBasicQualityFilter()** (Lines 5257-5300)
- Filters out hidden elements, elements with no content
- **Always returns true for interactive elements** (line 5263)
- Filters out placeholder links (`href="#"`, `href="javascript:"`)

### 2. DOM scanning & registration

**registerInteractiveSubtree():**
- Walks DOM tree starting from `rootNode`
- Uses stack-based traversal (no recursion)
- Checks each element with `isInteractiveElement()` and `passesBasicQualityFilter()`
- Calls `registerActionableElement()` to assign action IDs
- **KEY ISSUE:** Called from `analyzeStructureChanges()` on EVERY significant DOM mutation
- **INCREMENTS `elementCounter`** for each registered element

### 3. SCAN TRIGGERS (CRITICAL)

#### TRIGGER 6: DOM Mutation → analyzeStructureChanges (Line 5109)
- **Function:** `analyzeStructureChanges()` → `registerInteractiveSubtree()` → `queueIntelligenceUpdate('high')`
- **Fired by:** MutationObserver detects new `childList` elements
- **Calls:** `registerInteractiveSubtree(element)` for EACH new element
- **Scan trigger:** PARTIAL - registers subtree and queues intelligence update
- **Overlap potential:** VERY HIGH - fires continuously as DOM changes
- **CRITICAL ISSUE:** **Every significant DOM change registers new elements and increments `elementCounter`**

### 4. Action ID assignment

**elementCounter (Line 5017):**
- Initialized to 0 in `IntelligenceEngine` constructor
- **INCREMENTED in `generateActionableId()`** (not visible yet, but called by `registerActionableElement()`)
- **NEVER RESET** except when `scanAndRegisterPageElements()` clears and rescans

**ID Assignment Flow:**
1. `registerInteractiveSubtree(element)` walks DOM tree
2. For each interactive element → `registerActionableElement(element, actionType)`
3. `registerActionableElement()` → `generateActionableId(element, actionType, reuseId)`
4. `generateActionableId()` → `a_id_${this.elementCounter++}`

### 5. Mutation observers & event listeners

**MutationObserver #2 (domChangeObserver) triggers this flow:**
- Mutation → `isSignificantChange()` → `changeAggregator.addChange()` → `intelligenceEngine.processEvent()` → `analyzeStructureChanges()` → `registerInteractiveSubtree()`

### 6. Timers, intervals, async loops

No new timers in this chunk.

### 7. Dead/legacy/duplicated code

None in this chunk.

### 8. Cross-file interactions

None in this chunk - only internal IntelligenceEngine methods.

### 9. Chunk Summary

**Key Findings:**
1. **`elementCounter` starts at 0** and is incremented for each registered element (line 5017)
2. **`analyzeStructureChanges()` registers new DOM subtrees** on every significant mutation (line 5084)
3. **`registerInteractiveSubtree()` walks entire subtree** and registers all interactive descendants (lines 5114-5153)
4. **Every registration increments `elementCounter`** → causes ID inflation
5. **`queueIntelligenceUpdate('high')` triggered** after registering new elements (line 5109)
6. **NO deduplication across scans** - `actionableElements` Map can contain duplicates with different IDs

**CRITICAL BUG IDENTIFIED:**
**DOM mutations trigger `registerInteractiveSubtree()` which assigns NEW action IDs to elements that may already be registered. This causes ID inflation as elements get re-registered with new IDs on every significant DOM change.**

**Suspected Risks:**
- **ID inflation:** Every DOM mutation registers elements again with new IDs
- **Duplicate elements:** Same element appears multiple times in `actionableElements` with different IDs
- **Overlapping intelligence updates:** MutationObserver fires during scan → queues another update

---

## CHUNK 4: Lines 5655-6700 - Intelligence Update Queue & Page Normalization

### 1. Components in this chunk

**IntelligenceEngine.prototype.queueIntelligenceUpdate()** (Lines 5655-5680)
- **CRITICAL FUNCTION:** Queues intelligence updates instead of sending immediately
- Priority levels: 'high', 'normal'
- Adds `{ priority, timestamp, trigger }` to `this.updateQueue`
- Calls `processUpdateQueue()` to process queued updates (line 5677)

**IntelligenceEngine.prototype.processUpdateQueue()** (Lines 5681-5726)
- Processes queued intelligence updates with debouncing
- **MIN_UPDATE_INTERVAL = 500ms** between updates (line 5650)
- Sorts queue by priority (high first) and timestamp
- Calls `prepareIntelligenceData()` and `sendIntelligenceUpdateToServiceWorker()`
- Sets `this.isProcessingQueue = true` during processing (line 5649)

**IntelligenceEngine.prototype.prepareIntelligenceData()** (Lines 5727-5756)
- Builds intelligence data object for server
- Calls `buildNormalizedPageRecords()` to generate page structure

**IntelligenceEngine.prototype.extractCapabilities()** (Lines 5757-5808)
- Extracts capabilities from site config based on current URL
- Returns array of capability actions available on current page

**IntelligenceEngine.prototype.buildNormalizedPageRecords()** (Lines 5809-6649)
- **CRITICAL FUNCTION:** Generates JSONL records for artifacts
- **LONG FUNCTION** - processes all actionable elements and content elements
- Creates records for: meta, sections, headings, paragraphs, lists, images, actionables
- **NO DEDUPLICATION LOGIC** - processes all elements in `actionableElements` Map

### 2. DOM scanning & registration

**buildNormalizedPageRecords():**
- Iterates over `this.actionableElements` (line numbers not in excerpt, but this is the main loop)
- Creates record for EACH element in the Map
- **KEY ISSUE:** If Map contains duplicates with different IDs, all are written to artifacts

### 3. SCAN TRIGGERS (CRITICAL)

**queueIntelligenceUpdate() is called from:**
- `analyzeStructureChanges()` (line 5109) - on DOM mutations
- `initializeDOMChangeDetection()` (line 1340) - on significant changes
- `scanAndRegisterPageElements()` (line 9806) - after scan complete
- Multiple event listeners (lines 9984, 9991, 10010, 10029, 10039, 10053, 10063) - URL change, hash change, popstate, visibility, focus

**processUpdateQueue():**
- Debounces updates to 500ms (line 5650)
- **CRITICAL:** If queue builds up faster than 500ms, updates are batched

### 4. Action ID assignment

Not directly in this chunk - handled by `registerActionableElement()` which calls `generateActionableId()`.

### 5. Mutation observers & event listeners

Not in this chunk.

### 6. Timers, intervals, async loops

**Debounce timer in processUpdateQueue():**
- Waits 500ms between intelligence updates
- If updates queue faster than 500ms, they are batched

### 7. Dead/legacy/duplicated code

None in this chunk.

### 8. Cross-file interactions

**sendIntelligenceUpdateToServiceWorker():**
- Sends intelligence data to service worker (line 6650)
- Service worker forwards to ws_server.py
- ws_server.py writes artifacts (page.jsonl, llm_actions.json, etc.)

### 9. Chunk Summary

**Key Findings:**
1. **Intelligence updates are queued** and debounced to 500ms (lines 5655, 5681)
2. **`buildNormalizedPageRecords()` processes ALL elements** in `actionableElements` Map (line 5809)
3. **NO deduplication in artifact generation** - if Map has duplicates, all are written
4. **Multiple triggers queue updates:** DOM mutations, scan complete, URL changes, visibility changes (lines 5109, 9806, etc.)
5. **Queue can build up** if triggers fire faster than 500ms debounce

**CRITICAL BUG CONFIRMED:**
**`buildNormalizedPageRecords()` writes ALL elements in `actionableElements` Map to artifacts. If the Map contains duplicates (same element with different IDs), all duplicates are written to page.jsonl and llm_actions.json.**

**Suspected Risks:**
- **Duplicate artifacts:** Same element appears multiple times in page.jsonl with different action IDs
- **Queue overflow:** If triggers fire continuously, queue builds up indefinitely
- **Stale data:** Elements removed from DOM still in `actionableElements` Map

---

## CHUNK 5: Lines 7116-7900 & 9593-9835 - ID Generation & Full Page Scan

### 1. Components in this chunk

**IntelligenceEngine.prototype.generateActionableId()** (Lines 7116-7174)
- **CRITICAL FUNCTION:** Assigns action IDs to elements
- **Line 7123:** `uniqueId = \`a_id_${this.elementCounter++}\`` - **INCREMENTS elementCounter**
- **Line 7121:** If `reuseId` provided, uses existing ID
- **Line 7127-7131:** If reusing ID, updates `elementCounter` to `max(elementCounter, reusedIndex + 1)`
- Returns descriptor object with: id, tagName, actionType, selectors, textContent, attributes, urlContext, semanticRole, timestamp

**IntelligenceEngine.prototype.registerActionableElement()** (Lines 7300-7422)
- **CRITICAL FUNCTION:** Registers element in `actionableElements` Map
- **Line 7320:** Checks for existing `data-ome-action-id` marker
- **Line 7324-7339:** Computes element key (placeholder, aria-label, id, url, selector)
- **Line 7346-7350:** Checks `_preservedMarkerIds` Map for reusable IDs
- **Line 7353-7376:** Searches existing `actionableElements` for matching element key
- **Line 7383:** Calls `generateActionableId(element, actionType, idToUse)`
- **Line 7386-7396:** Updates existing descriptor if ID already in Map
- **Line 7398-7400:** Otherwise, adds new entry to Map
- **Line 7403:** Sets `data-ome-action-id` marker on DOM element
- **Line 7406:** Stores node in `actionableElementNodes` Map

**IntelligenceEngine.prototype.scanAndRegisterPageElements()** (Lines 9593-9835)
- **CRITICAL FUNCTION:** Main page scanning entry point
- **Line 9595-9602:** **SCAN LOCK** - checks `this._scanInProgress` flag
- **Line 9604:** Sets `this._scanInProgress = true`
- **Line 9612-9642:** **PRESERVES EXISTING MARKER IDs** - builds `markerIdMap` from `data-ome-action-id` attributes
- **Line 9644-9648:** **CLEARS ALL REGISTRIES:**
  - `this.actionableElements.clear()`
  - `this.actionableElementNodes.clear()`
  - `this.contentElements.clear()`
  - **`this.elementCounter = 0`** - **RESETS COUNTER TO ZERO**
- **Line 9651:** Stores `markerIdMap` in `this._preservedMarkerIds`
- **Line 9653-9667:** Removes existing `data-ome-action-id` markers from DOM
- **Line 9678-9680:** Calls `scanWithFrameworkSelectors()` to get elements
- **Line 9692-9741:** **SORTS ELEMENTS BY DOM POSITION** before registering (line 9738)
- **Line 9743-9751:** Registers elements in DOM order by calling `registerActionableElement()`
- **Line 9794-9797:** Clears `_preservedMarkerIds` after scan
- **Line 9804-9809:** **Queues intelligence update** after scan complete (line 9806)
- **Line 9823:** **RELEASES SCAN LOCK** - sets `this._scanInProgress = false`

### 2. DOM scanning & registration

**scanAndRegisterPageElements():**
1. **Acquires scan lock** (line 9604)
2. **Preserves existing IDs** by building element key → ID map (lines 9612-9642)
3. **Clears all registries** including `elementCounter = 0` (lines 9644-9648)
4. **Removes DOM markers** (lines 9653-9667)
5. **Scans DOM** via `scanWithFrameworkSelectors()` (line 9679)
6. **Sorts by DOM position** (line 9738-9740)
7. **Registers in order** via `registerActionableElement()` (line 9744)
8. **Releases scan lock** (line 9823)

**registerActionableElement():**
1. Checks for existing marker (line 7320)
2. Computes element key (lines 7324-7339)
3. Checks for preserved ID (lines 7346-7350)
4. Checks for existing ID in current scan (lines 7353-7376)
5. Calls `generateActionableId(element, actionType, idToUse)` (line 7383)
6. Updates or adds to `actionableElements` Map (lines 7386-7400)
7. Sets DOM marker `data-ome-action-id` (line 7403)

**generateActionableId():**
1. If `reuseId` provided, uses it (line 7121)
2. Otherwise, generates `a_id_${this.elementCounter++}` (line 7123)
3. If reusing ID, updates `elementCounter` to avoid collisions (lines 7127-7131)

### 3. SCAN TRIGGERS (CRITICAL)

**scanAndRegisterPageElements() is called from:**
1. `runScanAfterPageLoad()` (line 1278) - initial page load
2. Message listener command `scanAndRegisterElements` (line 2239)
3. **analyzeStructureChanges()** does NOT call full scan - only `registerInteractiveSubtree()`

**SCAN LOCK BEHAVIOR:**
- Prevents concurrent scans (line 9595-9602)
- Returns early if scan already in progress
- **CRITICAL:** Does NOT prevent partial registrations via `registerInteractiveSubtree()`

### 4. Action ID assignment

**ID Assignment Logic:**
1. **Full scan:** Resets `elementCounter = 0` (line 9648)
2. **Preserves IDs:** Builds map of element keys → existing IDs (lines 9612-9642)
3. **Reuse priority:** Existing marker > preserved ID > existing in current scan > new ID (line 7379)
4. **New IDs:** `a_id_${elementCounter++}` (line 7123)
5. **Counter update:** When reusing ID, updates counter to `max(counter, reusedIndex + 1)` (lines 7127-7131)

**CRITICAL BUG IDENTIFIED:**
**Partial registrations via `registerInteractiveSubtree()` do NOT reset `elementCounter` or check for existing IDs. This causes:**
1. **ID inflation:** New mutations assign IDs like `a_id_200`, `a_id_201`, etc. while full scan resets to `a_id_0`
2. **Duplicate elements:** Same element gets multiple IDs across different scans/mutations
3. **Stale elements:** Old IDs remain in `actionableElements` Map even after element removed from DOM

### 5. Mutation observers & event listeners

Not in this chunk.

### 6. Timers, intervals, async loops

Not in this chunk.

### 7. Dead/legacy/duplicated code

None in this chunk.

### 8. Cross-file interactions

Not in this chunk.

### 9. Chunk Summary

**Key Findings:**
1. **scanAndRegisterPageElements() has scan lock** (lines 9595-9602) but lock does NOT prevent partial registrations
2. **Full scan resets elementCounter = 0** (line 9648) but partial registrations do NOT
3. **ID preservation logic** tries to reuse existing IDs (lines 9612-9642, 7346-7350)
4. **Elements sorted by DOM position** before registration (lines 9738-9740) ensures stable IDs
5. **registerInteractiveSubtree() bypasses scan lock** and assigns IDs incrementally

**ROOT CAUSE IDENTIFIED:**

### **BUG #1: Partial Registration ID Inflation**
**`registerInteractiveSubtree()` (called from `analyzeStructureChanges()`) assigns new IDs to elements without:**
- Checking if element already registered
- Resetting `elementCounter`
- Preserving existing IDs
- Using scan lock

**Result:** Every significant DOM mutation increments `elementCounter` and creates duplicate entries in `actionableElements` Map.

**Example:**
1. Initial scan: registers 100 elements (`a_id_0` to `a_id_99`)
2. DOM mutation: adds 5 elements
3. `analyzeStructureChanges()` → `registerInteractiveSubtree()` assigns `a_id_100` to `a_id_104`
4. Next navigation/scan: resets counter to 0
5. **Same elements now have TWO IDs:** old (`a_id_100-104`) AND new (`a_id_0-4`)

### **BUG #2: No Cleanup of Stale Elements**
**`actionableElements` Map never removes old entries. When element gets new ID, old ID remains in Map.**

**Result:** Map grows indefinitely with duplicate/stale entries.

---

## CHUNK 6: Lines 9838-10070 & 10415-10514 - System Initialization & Significant Change Filter

### 1. Components in this chunk

**DOMContentLoaded Initialization (Lines 9838-9856):**
- **Line 9840:** Calls `initializeHistoryTracking()`
- **Line 9843:** Calls `initializeDOMChangeDetection()`
- **Line 9846:** Calls `initializeIntelligenceSystem()`

**initializeIntelligenceSystem()** (Lines 9861-9926)
- **Line 9865:** Guards against multiple initializations
- **Line 9882:** Creates `changeAggregator = new ChangeAggregator()`
- **Line 9884:** Creates `intelligenceEngine = new IntelligenceEngine()`
- **Line 9885:** Sets `window.intelligenceEngine = intelligenceEngine`
- **Line 9901-9905:** Stores components in `window.intelligenceComponents` to prevent recreation
- **Line 9918:** Calls `setupIntelligenceUpdates()`

**setupIntelligenceUpdates()** (Lines 9976-10070)
- **Sets up event-triggered intelligence updates** instead of timer-based
- **Line 9983-9985:** Queues update on page ready
- **Line 9987-9994:** Queues update on DOMContentLoaded
- **Line 9998-10014:** **MUTATIONOBSERVER #3** - watches for URL changes
- **Line 10025-10032:** Queues update on hash change (500ms delay)
- **Line 10035-10042:** Queues update on popstate (500ms delay)
- **Line 10045-10056:** Queues update on visibility change (500ms delay)
- **Line 10059-10066:** Queues update on window focus (500ms delay)

**isSignificantChange()** (Lines 10415-10514+)
- **CRITICAL FUNCTION:** Filters DOM mutations to determine if scan/update should trigger
- **Line 10417:** Checks if site is YouTube
- **Line 10420-10472:** **SPECIAL CASE:** YouTube transcript elements always trigger (panels AND buttons)
- **Line 10474-10497:** **SPECIAL CASE:** YouTube playlist mutations always trigger
- **Line 10500-10503:** **RATE LIMITING:** Minimum 1-2 seconds between significant changes
- **Line 10506-10509:** **MUTATION COUNT:** Minimum 1-3 mutations required (YouTube vs. other sites)
- **Line 10512-10514:** **TYPE FILTERING:** Ignores mouse events and focus changes

### 2. DOM scanning & registration

Not in this chunk.

### 3. SCAN TRIGGERS (CRITICAL)

#### TRIGGER 7: MutationObserver #3 - URL Change Detection (Lines 9998-10014)
- **Function:** `urlObserver` MutationObserver
- **Watches:** `document` with `subtree: true, childList: true, attributes: true, attributeFilter: ['href']`
- **Fired by:** URL changes in SPA navigation
- **Calls:** `intelligenceEngine.queueIntelligenceUpdate('normal')` after 1s delay (line 10010)
- **Scan trigger:** YES - queues intelligence update
- **Overlap potential:** HIGH - can fire during active scan

#### TRIGGER 8: Hash Change Event (Lines 10025-10032)
- **Function:** `window.addEventListener('hashchange', ...)`
- **Fired by:** URL hash changes (#fragment navigation)
- **Calls:** `intelligenceEngine.queueIntelligenceUpdate('normal')` after 500ms (line 10029)
- **Scan trigger:** YES - queues intelligence update
- **Overlap potential:** MEDIUM

#### TRIGGER 9: Popstate Event (Lines 10035-10042)
- **Function:** `window.addEventListener('popstate', ...)`
- **Fired by:** Browser back/forward navigation
- **Calls:** `intelligenceEngine.queueIntelligenceUpdate('normal')` after 500ms (line 10039)
- **Scan trigger:** YES - queues intelligence update
- **Overlap potential:** MEDIUM

#### TRIGGER 10: Visibility Change Event (Lines 10045-10056)
- **Function:** `document.addEventListener('visibilitychange', ...)`
- **Fired by:** Tab becomes visible/hidden
- **Calls:** `intelligenceEngine.queueIntelligenceUpdate('normal')` after 500ms (line 10053)
- **Scan trigger:** YES - queues intelligence update when tab becomes visible
- **Overlap potential:** MEDIUM

#### TRIGGER 11: Window Focus Event (Lines 10059-10066)
- **Function:** `window.addEventListener('focus', ...)`
- **Fired by:** Window gains focus
- **Calls:** `intelligenceEngine.queueIntelligenceUpdate('normal')` after 500ms (line 10063)
- **Scan trigger:** YES - queues intelligence update
- **Overlap potential:** MEDIUM - can overlap with visibility change

### 4. Action ID assignment

Not in this chunk.

### 5. Mutation observers & event listeners

**MutationObserver #3: URL Change Detection (Lines 9998-10014):**
- **Watches:** `document`
- **Options:** `subtree: true, childList: true, attributes: true, attributeFilter: ['href']`
- **Callback:** Checks if URL changed, queues intelligence update after 1s
- **Scan trigger:** YES - indirect via `queueIntelligenceUpdate()`
- **Purpose:** Detect SPA navigation

**Event Listeners:**
- `hashchange` (line 10025) → queue update after 500ms
- `popstate` (line 10035) → queue update after 500ms
- `visibilitychange` (line 10045) → queue update after 500ms when visible
- `focus` (line 10059) → queue update after 500ms

**isSignificantChange() Filter Logic:**
- **YouTube transcript:** ALWAYS significant (lines 10420-10472)
- **YouTube playlist:** ALWAYS significant (lines 10474-10497)
- **Rate limiting:** 1-2s between changes (lines 10500-10503)
- **Mutation count:** 1-3 minimum mutations (lines 10506-10509)
- **Type filtering:** Ignore mouse/focus events (line 10512+)

### 6. Timers, intervals, async loops

**Delayed intelligence updates:**
- URL change: 1000ms delay (line 10008)
- Hash change: 500ms delay (line 10027)
- Popstate: 500ms delay (line 10037)
- Visibility change: 500ms delay (line 10050)
- Focus: 500ms delay (line 10061)

### 7. Dead/legacy/duplicated code

**MutationObserver #3 (URL change detection):**
- **Overlap with other triggers:** Hash change and popstate events also detect navigation
- **Potential duplicate:** URL observer + hash change + popstate may trigger multiple updates for same navigation

### 8. Cross-file interactions

Not in this chunk.

### 9. Chunk Summary

**Key Findings:**
1. **THREE MutationObservers running in parallel:**
   - MutationObserver #1: `pageIdleMonitor` for idle detection
   - MutationObserver #2: `domChangeObserver` for DOM change detection
   - MutationObserver #3: `urlObserver` for URL change detection
2. **FIVE event listeners queuing intelligence updates:** URL change, hash change, popstate, visibility change, focus
3. **`isSignificantChange()` has special YouTube logic** (lines 10420-10497)
4. **Rate limiting: 1-2s between significant changes** (lines 10500-10503)
5. **Multiple triggers for same navigation event:** URL observer + hash change + popstate

**Suspected Risks:**
- **Redundant triggers:** URL change, hash change, and popstate all fire for same navigation
- **Queue overflow:** 5+ event listeners + DOM mutations all queueing updates
- **Visibility + focus overlap:** Tab switch fires both visibility change and focus events → 2 updates
- **YouTube special cases:** Lower thresholds for YouTube may cause excessive updates

---

## FILE COMPLETE – Global Summary

### **ROOT CAUSES OF ACTION ID INFLATION & DUPLICATE ELEMENTS**

#### **BUG #1: Partial Registration Bypasses Scan Lock**
**Location:** `IntelligenceEngine.prototype.registerInteractiveSubtree()` (lines 5114-5153)

**Problem:**
- Called from `analyzeStructureChanges()` (line 5084) on EVERY significant DOM mutation
- Does NOT check scan lock (`_scanInProgress`)
- Does NOT check if element already registered
- Does NOT reset or coordinate with `elementCounter`
- Creates NEW action IDs for elements that may already exist

**Flow:**
1. DOM mutation occurs (e.g., lazy-loaded content, SPA navigation, modal open)
2. MutationObserver #2 detects mutation
3. `isSignificantChange()` returns true
4. `changeAggregator.addChange()` → `intelligenceEngine.processEvent()` → `analyzeStructureChanges()`
5. `registerInteractiveSubtree(rootNode)` walks entire subtree
6. For each interactive element → `registerActionableElement()` → `generateActionableId()`
7. `generateActionableId()` assigns `a_id_${this.elementCounter++}`
8. **Counter increments from 100 → 101 → 102... while full scan would reset to 0**

**Result:**
- After initial scan registers `a_id_0` to `a_id_99` (100 elements)
- DOM mutation adds 5 new elements
- Partial registration assigns `a_id_100` to `a_id_104`
- **BUT:** These 5 elements may already be registered with IDs in the 0-99 range
- Next full scan resets counter to 0 and reassigns SAME elements to `a_id_0` to `a_id_4`
- **Map now contains 10 entries for 5 elements** (duplicates with different IDs)

#### **BUG #2: No Duplicate Detection in actionableElements Map**
**Location:** `IntelligenceEngine.prototype.registerActionableElement()` (lines 7300-7422)

**Problem:**
- Uses action ID as Map key (line 7399)
- Does NOT check if element already registered with different ID
- ID preservation logic (lines 7346-7376) only works within single scan
- `_preservedMarkerIds` cleared after scan completes (line 9794-9797)

**Flow:**
1. Element gets registered with `a_id_50` during initial scan
2. DOM marker `data-ome-action-id="a_id_50"` added to element (line 7403)
3. Partial registration checks marker (line 7320) → finds `a_id_50`
4. **BUT:** If element was cloned or marker was removed, checks fail
5. New ID assigned: `a_id_150`
6. **Map now has TWO entries:** `a_id_50` → element, `a_id_150` → same element

**Result:**
- Same DOM element appears multiple times in `actionableElements` Map
- Each entry has different action ID
- All entries written to artifacts (page.jsonl, llm_actions.json)

#### **BUG #3: No Cleanup of Stale Entries**
**Location:** `actionableElements` Map never removes old entries

**Problem:**
- When element gets new ID, old ID remains in Map
- When element removed from DOM, Map entry persists
- `getStoredActionableNode()` checks if node is connected (line 7441) but doesn't remove Map entry
- Map grows indefinitely

**Result:**
- After multiple navigations/mutations, Map contains 200+ entries for ~50 actual elements
- Artifacts contain duplicate and stale elements
- LLM sees inflated action count and duplicate prompts

#### **BUG #4: Multiple Overlapping Scan Triggers**
**Location:** Throughout file - 11+ separate triggers

**All Scan/Update Triggers:**
1. **TRIGGER 1:** Initial page load (line 302) → `scheduleInitialScan()` → `runScanAfterPageLoad()` → `scanAndRegisterPageElements()`
2. **TRIGGER 2:** Fallback timer 4s (line 332) → `scheduleInitialScan('fallback_timeout')`
3. **TRIGGER 3:** Service worker message (line 1931) → `scheduleInitialScan('service_worker')`
4. **TRIGGER 4:** Command execution (line 2239) → `scanAndRegisterPageElements()`
5. **TRIGGER 5:** DOM mutation (line 5084) → `registerInteractiveSubtree()` (PARTIAL)
6. **TRIGGER 6:** DOM mutation intelligence update (line 5109) → `queueIntelligenceUpdate('high')`
7. **TRIGGER 7:** URL change MutationObserver (line 10010) → `queueIntelligenceUpdate('normal')`
8. **TRIGGER 8:** Hash change event (line 10029) → `queueIntelligenceUpdate('normal')`
9. **TRIGGER 9:** Popstate event (line 10039) → `queueIntelligenceUpdate('normal')`
10. **TRIGGER 10:** Visibility change event (line 10053) → `queueIntelligenceUpdate('normal')`
11. **TRIGGER 11:** Window focus event (line 10063) → `queueIntelligenceUpdate('normal')`

**Overlap Scenarios:**
- **Initial load:** Triggers 1-3 can all fire → 2-3 simultaneous scans
- **SPA navigation:** Triggers 7-9 all fire for same navigation → 3 queued updates
- **Tab switch:** Triggers 10-11 both fire → 2 queued updates
- **YouTube video change:** Triggers 5-7 fire → partial registration + 2 queued updates

**Result:**
- Multiple concurrent/overlapping scans
- `elementCounter` increments unpredictably
- Queue builds up faster than 500ms debounce can process

### **All Scan Triggers Mapped**

| Trigger | Type | Function | Calls | Resets Counter | Uses Scan Lock |
|---------|------|----------|-------|----------------|----------------|
| 1. Initial load | Timer/Event | `scheduleInitialScan()` | `scanAndRegisterPageElements()` | YES (line 9648) | YES (line 9604) |
| 2. Fallback 4s | Timer | `setTimeout()` | `scheduleInitialScan()` | YES | YES |
| 3. Service worker | Message | Message listener | `scheduleInitialScan()` | YES | YES |
| 4. Command | Message | Message listener | `scanAndRegisterPageElements()` | YES | YES |
| 5. DOM mutation | MutationObserver | `analyzeStructureChanges()` | `registerInteractiveSubtree()` | **NO** | **NO** |
| 6. Mutation update | MutationObserver | `analyzeStructureChanges()` | `queueIntelligenceUpdate()` | N/A | N/A |
| 7. URL change | MutationObserver | `urlObserver` | `queueIntelligenceUpdate()` | N/A | N/A |
| 8. Hash change | Event | `hashchange` | `queueIntelligenceUpdate()` | N/A | N/A |
| 9. Popstate | Event | `popstate` | `queueIntelligenceUpdate()` | N/A | N/A |
| 10. Visibility | Event | `visibilitychange` | `queueIntelligenceUpdate()` | N/A | N/A |
| 11. Focus | Event | `focus` | `queueIntelligenceUpdate()` | N/A | N/A |

**CRITICAL OBSERVATION:**
- **Only Trigger 5 (DOM mutation → registerInteractiveSubtree) bypasses scan lock and does NOT reset counter**
- **All other triggers use scan lock and reset counter**
- **This creates ID collision between partial registrations and full scans**

### **All Mutation Observers**

| Observer | Location | Watches | Purpose | Triggers Scan | Overlap Risk |
|----------|----------|---------|---------|---------------|--------------|
| MutationObserver #1 | Line 234 (pageIdleMonitor) | `document` (entire tree) | Idle detection | NO (indirect) | LOW |
| MutationObserver #2 | Line 1307 (domChangeObserver) | `document.body` | DOM change detection | YES (partial) | **VERY HIGH** |
| MutationObserver #3 | Line 9998 (urlObserver) | `document` | URL change detection | YES (queue) | MEDIUM |
| waitForElement observers | Line 10236+ (capabilityPipelineExecutor) | `document.body` | Element lazy-load wait | NO | LOW |

### **All Event Listeners Queuing Intelligence Updates**

| Event | Location | Delay | Purpose | Overlap Risk |
|-------|----------|-------|---------|--------------|
| `load` | Line 326 | 0ms (waits for idle) | Initial scan | LOW |
| `DOMContentLoaded` | Line 9839, 9987 | 0ms | System initialization | LOW |
| `hashchange` | Line 10025 | 500ms | SPA navigation | MEDIUM |
| `popstate` | Line 10035 | 500ms | Browser navigation | MEDIUM |
| `visibilitychange` | Line 10045 | 500ms | Tab switching | MEDIUM |
| `focus` | Line 10059 | 500ms | Window focus | MEDIUM |

### **All Timers**

| Timer | Location | Delay | Purpose | Scan Trigger |
|-------|----------|-------|---------|--------------|
| Fallback initial scan | Line 332 | 4000ms | Backup if service worker doesn't fire | YES |
| Focus retry | Line 470 | 600ms | Retry focus on element | NO |
| Keep-alive reconnect | Line 58, 64 | 500-1000ms | Reconnect keep-alive port | NO |
| Context invalidation | Line 1423 | 1000ms | Reinitialize after context lost | MAYBE |
| URL change update | Line 10008 | 1000ms | Queue update after URL change | YES |
| Hash change update | Line 10027 | 500ms | Queue update after hash change | YES |
| Popstate update | Line 10037 | 500ms | Queue update after popstate | YES |
| Visibility update | Line 10050 | 500ms | Queue update after tab visible | YES |
| Focus update | Line 10061 | 500ms | Queue update after focus | YES |
| Update queue debounce | Line 5650+ | 500ms | Debounce intelligence updates | N/A |

### **Action ID Lifecycle**

**Initialization:**
```javascript
// Line 5017 - IntelligenceEngine constructor
this.elementCounter = 0;
```

**Full Scan:**
```javascript
// Line 9648 - scanAndRegisterPageElements()
this.elementCounter = 0;  // RESET TO ZERO
```

**Partial Registration:**
```javascript
// Line 7123 - generateActionableId()
uniqueId = `a_id_${this.elementCounter++}`;  // INCREMENT WITHOUT RESET
```

**ID Reuse (within scan):**
```javascript
// Line 7121 - generateActionableId()
if (reuseId) {
    uniqueId = reuseId;  // Use existing ID
    // Line 7127-7131
    this.elementCounter = Math.max(this.elementCounter, reusedIndex + 1);
}
```

**CRITICAL ISSUE:**
- Full scans reset counter to 0 (line 9648)
- Partial registrations increment counter from current value (line 7123)
- If partial registration runs after full scan: counter = 0 + 5 = 5
- If full scan runs after partial registration: counter reset to 0, same elements reassigned `a_id_0` to `a_id_4`
- **Result:** Same elements have TWO IDs in Map

### **Element Registration Persistence**

**Data Structures:**
```javascript
// Line 5014-5016
this.actionableElements = new Map();        // actionId → descriptor
this.actionableElementNodes = new Map();    // actionId → DOM node
this.contentElements = new Map();            // contentId → descriptor
```

**Add Entry:**
```javascript
// Line 7399 - registerActionableElement()
this.actionableElements.set(actionableId.id, actionableId);
```

**Remove Entry:**
- **NEVER** - no code removes entries from Map
- `getStoredActionableNode()` checks if node connected (line 7441) but doesn't remove
- Full scan clears Map (line 9645) but only during scan

**Result:**
- Map accumulates entries across multiple partial registrations
- Stale elements (removed from DOM) remain in Map
- Duplicate elements (same DOM node, different IDs) both in Map

### **Artifact Generation**

**buildNormalizedPageRecords() (Line 5809+):**
```javascript
// Iterates over ALL elements in Map
this.actionableElements.forEach((descriptor, actionId) => {
    // Creates record for EACH entry
    // NO deduplication check
});
```

**Result:**
- If Map contains 200 entries (50 real elements × 4 duplicates each)
- All 200 entries written to page.jsonl
- All 200 entries written to llm_actions.json
- LLM sees 200 actionable elements instead of 50

### **Recommendations**

#### **IMMEDIATE FIX (High Priority):**
1. **Add deduplication check in registerActionableElement():**
   - Before assigning new ID, check if element already in Map by comparing DOM reference
   - If found, return existing ID instead of creating new one

2. **Add scan lock check to registerInteractiveSubtree():**
   - Check `this._scanInProgress` at start
   - Return early if scan in progress to prevent partial registration during full scan

3. **Add Map cleanup on full scan:**
   - Before clearing Map, remove stale entries (nodes not connected to DOM)
   - Add garbage collection after scan completes

#### **MEDIUM PRIORITY:**
4. **Consolidate navigation triggers:**
   - Remove redundant triggers (URL observer + hashchange + popstate)
   - Use single navigation detection mechanism

5. **Add element fingerprinting:**
   - Create stable hash of element attributes (id, aria-label, href, placeholder)
   - Use fingerprint to detect duplicates across scans
   - Reuse IDs for elements with same fingerprint

#### **LOW PRIORITY:**
6. **Optimize MutationObserver configuration:**
   - MutationObserver #2 watches entire `document.body` with `subtree: true`
   - Consider narrower scope or throttling

7. **Add telemetry:**
   - Log elementCounter value before/after each operation
   - Track Map size over time
   - Alert when duplicates detected

### **File Statistics**

- **Total Lines:** 11,785
- **Functions Analyzed:** 50+
- **Mutation Observers:** 3 main + multiple capability-specific
- **Event Listeners:** 6+ queuing intelligence updates
- **Timers:** 9 total (1 scan trigger, 5 update triggers, 3 maintenance)
- **Scan Triggers:** 11 identified
- **Classes:** 2 (ChangeAggregator, IntelligenceEngine)
- **Global State:** 15+ variables tracking scan state
- **Maps:** 3 (actionableElements, actionableElementNodes, contentElements)

### **Critical Code Paths**

**Path 1: Full Page Scan**
```
Initial load → scheduleInitialScan() → pageIdleMonitor.waitForIdle() →
runScanAfterPageLoad() → intelligenceEngine.scanAndRegisterPageElements() →
scanWithFrameworkSelectors() → registerActionableElement() → generateActionableId() →
queueIntelligenceUpdate() → processUpdateQueue() → buildNormalizedPageRecords() →
sendIntelligenceUpdateToServiceWorker() → ws_server.py → artifacts
```

**Path 2: Partial Registration (BUG)**
```
DOM mutation → MutationObserver #2 callback → isSignificantChange() →
changeAggregator.addChange() → intelligenceEngine.processEvent() →
analyzeStructureChanges() → registerInteractiveSubtree() →
registerActionableElement() → generateActionableId() (NO RESET) →
queueIntelligenceUpdate() → processUpdateQueue() → buildNormalizedPageRecords() →
sendIntelligenceUpdateToServiceWorker() → ws_server.py → artifacts (WITH DUPLICATES)
```

**Path 3: SPA Navigation (Multiple Triggers)**
```
URL change → THREE TRIGGERS FIRE SIMULTANEOUSLY:
1. MutationObserver #3 (urlObserver) → queueIntelligenceUpdate()
2. hashchange event → queueIntelligenceUpdate()
3. popstate event → queueIntelligenceUpdate()
ALL queue updates → processUpdateQueue() (batched) → artifacts
```

---

## ANALYSIS COMPLETE

**Mission accomplished.** All root causes of action ID inflation and duplicate elements identified and documented.

**Primary Culprit:** `registerInteractiveSubtree()` (line 5114) bypasses scan lock and increments counter without coordination, causing ID inflation and duplicate entries.

**Secondary Issues:** No Map cleanup, no deduplication, no element fingerprinting, redundant navigation triggers.

**Recommended Action:** Implement fixes in priority order listed in Recommendations section.

