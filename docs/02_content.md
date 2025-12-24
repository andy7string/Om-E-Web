# Content Script Documentation (content.js)

## Overview

The content script is the **core intelligence engine** of Om_E_Web, running in the context of web pages. It implements a comprehensive system for DOM intelligence, automation, and UI overlay management. The script is approximately **11,045 lines** and operates with strict event-driven architecture.

**Primary Responsibilities:**
1. **DOM scanning and element discovery** - Identifies interactive elements and semantic content
2. **Action registration** - Creates selector-based element resolution system
3. **Intelligence extraction** - Generates structured JSONL artifacts for LLM consumption
4. **Command execution** - Handles clicks, input, scrolling, and navigation via multiple strategies
5. **Capability pipeline** - Dynamic element discovery for lazy-loaded content (bypasses action-ID registry)
6. **Real-time monitoring** - Tracks DOM changes and network activity using observers
7. **HUD/Orb UI system** - Shadow DOM-based floating orb interface with chat, prompt input, and theme customization
8. **Chat integration** - Real-time chat with LLM via WebSocket pipeline
9. **Iframe coordination** - Scans and reports cross-origin iframe elements to service worker

**Key Architectural Principle**: **Event-driven only. No timers** except for debouncing. Uses MutationObserver, IntersectionObserver, and requestIdleCallback for all DOM monitoring.

---

## Initialization

### Entry Point and Guard Mechanisms

**Duplicate Injection Prevention**:
```javascript
if (window.omEWebContentScriptLoaded) {
    return; // Prevent duplicate script injection
}
window.omEWebContentScriptLoaded = true;
```

**Frame Detection**:
```javascript
const isInIframe = window.top !== window.self;

if (isInIframe) {
    setupIframeHandlers();
    runIframeScan();
    return; // Don't run main frame logic
}
```

**Main Frame Execution**:
- Script ONLY runs full intelligence system in main frame
- Iframes get separate lightweight scan + report to service worker
- All message handlers verify `window.top === window.self` before executing

### Initialization Sequence

1. **Keep-Alive Port** - Establishes persistent connection to prevent service worker suspension
   ```javascript
   ensureKeepAlivePortConnection();
   ```

2. **Site Config Loading** - Synchronous XHR loads framework configuration
   ```javascript
   siteConfig = getSiteConfigDirect();
   ```

3. **Intelligence Engine Creation** - Creates IntelligenceEngine instance
   ```javascript
   intelligenceEngine = recreateIntelligenceEngine();
   ```

4. **Dynamic Iframe Observer** - Watches for iframes added after initial load
   ```javascript
   dynamicIframeObserver.observe(document.documentElement, {childList: true, subtree: true});
   ```

5. **Initial Scan Scheduling** - Waits for document_idle, then triggers scan
   ```javascript
   scheduleInitialScan('immediate');
   ```

6. **HUD Initialization** - Creates Shadow DOM floating orb UI (if enabled)
   ```javascript
   initHUD(); // Creates orb, HUD overlay, chat panel
   ```

---

## State Management

### Global Variables

**Scan Control**:
- `scanInProgress` - Boolean lock preventing concurrent scans
- `currentPageVersion` - Page version (deprecated, always null)
- `initialScanScheduled` - Guard for duplicate scan scheduling
- `initialScanReason` - Why scan was triggered

**Change Detection**:
- `significantChangeDetector` - MutationObserver for post-scan DOM watching
- `lastSignificantChangeTime` - Rate limit for mutation-triggered scans
- `domChangeObserver` - MutationObserver for real-time change monitoring
- `changeDetectionEnabled` - Flag to enable/disable change detection
- `changeCount` - Counter for total DOM changes detected
- `lastChangeTime` - Timestamp of last DOM change

**Site Configuration**:
- `siteConfig` - Local site configuration object (loaded synchronously)
- `window.currentSiteConfig` - Global fallback config reference
- `window.currentFramework` - Framework identifier (e.g., 'youtube', 'generic')
- `currentDomain` - Current page domain

**Intelligence System**:
- `intelligenceEngine` - Main IntelligenceEngine instance
- `changeAggregator` - Aggregates DOM changes into events
- `pageContext` - Current page metadata
- `changeHistory` - History of DOM changes
- `lastIntelligenceUpdate` - Timestamp of last update

**Focus Management**:
- `initialFocusApplied` - Tracks whether initial focus was applied
- `focusRetryTimer` - Pending retry timer for focus attempts

**Navigation**:
- `navigationHistory` - Array of visited pages
- `currentHistoryIndex` - Current position in history

**HUD/Orb State**:
- `hudState` - Single source of truth for HUD/Orb UI state (see HUD section)
- `chatState` - Shared chat messages between HUD and orb panel

**Scan Trace**:
- `scanTrace` - Performance timing tracker with events array
- Exposed globally as `window.scanTrace` for debugging

---

## Architecture Patterns

### Config Access Pattern (CRITICAL)

**Correct Pattern** (used throughout):
```javascript
const activeConfig = siteConfig || window.currentSiteConfig;
```

**Rationale**: `siteConfig` is loaded synchronously at script start. `window.currentSiteConfig` may not be set yet in some contexts.

### Scan Lock Pattern

```javascript
if (scanInProgress) {
    console.log('[Content] Scan already in progress, ignoring request');
    return;
}
scanInProgress = true;
try {
    // ... scan logic ...
} finally {
    scanInProgress = false;
}
```

**Purpose**: Prevents concurrent scans that would cause duplicate IDs and mixed data.

### Duplicate Prevention Pattern

Uses WeakSet for memory-safe duplicate tracking:
```javascript
const seenElements = new WeakSet();

if (seenElements.has(element)) {
    return; // Skip duplicate element
}
seenElements.add(element);
```

**Rationale**: WeakSet allows garbage collection when element is removed from DOM.

### Async Response Pattern

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            const result = await someAsyncOperation();
            sendResponse({ok: true, result});
        } catch (error) {
            sendResponse({ok: false, error: error.message});
        }
    })();
    return true; // Keep channel open for async
});
```

**Required**: `return true` keeps response channel open for async operations.

---

## Core Components

### 1. Scan Orchestration

#### `executeScanWithSettle(pageVersion, url, trigger)`

**Purpose**: Main scan coordinator with DOM-settle detection

**Parameters**:
- `pageVersion`: Deprecated (set to null, kept for backwards compatibility)
- `url`: Current page URL
- `trigger`: What triggered the scan (e.g., "page_load", "url_change", "service_worker")

**Workflow**:
1. Checks scan lock (prevents concurrent scans)
2. Sets scan lock
3. **INSTANT SCAN** - No DOM settle wait (page already at document_idle)
4. Counts cross-origin iframes for coordinated scanning
5. Calls `intelligenceEngine.prepareIntelligenceData()` to generate artifacts
6. Sends `scan_complete` message to service worker with intelligence data + expectedIframeCount
7. Releases scan lock
8. Starts `startSignificantChangeDetector()` to watch for future changes

**Called by**: Message handler when receiving `start_scan` message from service worker

**Sends to service worker**:
```javascript
{
    type: 'scan_complete',
    pageVersion: currentPageVersion || 1,
    url: window.location.href,
    trigger: trigger,
    intelligenceData: intelligenceData,
    expectedIframeCount: crossOriginIframeCount
}
```

---

#### `waitForDOMSettle({maxWait, quietWindow})`

**Purpose**: Waits for DOM to stop mutating before scanning (currently NOT used - instant scan enabled)

**Parameters**:
- `maxWait`: Maximum wait time (default: 5000ms)
- `quietWindow`: Duration of no mutations needed (default: 200ms)

**Returns**: Promise that resolves when DOM is settled

**How it works**:
1. Creates MutationObserver watching document.body
2. Resets quiet timer on each mutation
3. Resolves when no mutations for `quietWindow` ms
4. Max wait failsafe prevents infinite waiting

**Called by**: `executeScanWithSettle()` (DISABLED - instant scan used instead)

---

#### `startSignificantChangeDetector()`

**Purpose**: Continuous DOM monitoring **after** scan completes

**Monitors**: Major DOM changes (childList mutations)

**Workflow**:
1. Creates MutationObserver watching document.body
2. Counts mutations in 200ms quiet window
3. If >15 mutations AND 2s since last trigger → sends `request_scan` to service worker
4. Service worker decides whether to rescan

**Called by**: `executeScanWithSettle()` (after scan completes)

**Sends**: `{type: 'request_scan', url, trigger: 'significant_dom_change'}` to service worker

---

#### `scheduleInitialScan(reason, options)`

**Purpose**: Schedules first scan after page loads

**Parameters**:
- `reason`: Why scan is scheduled (e.g., 'service_worker', 'fallback_timeout')
- `options.maxWait`: Max wait for idle (default: 12000ms)

**Workflow**:
1. Guards against duplicate scheduling (checks `initialScanScheduled`)
2. Uses requestIdleCallback or setTimeout(0) for immediate execution
3. Triggers `runScanAfterPageLoad()`

**Called by**:
- Automatic trigger: `scheduleInitialScan('immediate')` at script load
- Message handler (when receiving `start_intelligence_scan` from service worker)

---

### 2. Page Idle Monitoring

#### `pageIdleMonitor` (IIFE singleton)

**Purpose**: Tracks network requests and DOM changes to determine page "idle" state

**Wrapped functions**:
- `window.fetch` → Tracks fetch requests
- `XMLHttpRequest.prototype.send` → Tracks XHR requests

**Key methods**:
- `waitForIdle({maxWait, quietWindow})` → Returns promise that resolves when page is idle
- `markChange()` → Records a change (resets idle timer)

**How it works**:
1. Increments `inflightRequests` on fetch/XHR start
2. Decrements on completion
3. MutationObserver tracks DOM changes
4. PerformanceObserver tracks resource loading
5. Idle = no inflight requests + no changes for `quietWindow` ms

**Called by**:
- `scheduleInitialScan()`
- `scanWhenPageSettles()`

**Notifies**: Calls `notifyNetworkActivity()` to send events to service worker

**Network Event Types**:
- `fetch_start` - Fetch request initiated
- `fetch_end` - Fetch completed (success/error)
- `xhr_start` - XHR request initiated
- `xhr_end` - XHR completed (success/error/abort)

---

### 3. Site Configuration

#### `getSiteConfigDirect()`

**Purpose**: Synchronously loads site-specific configuration from extension files

**Returns**: Site config object or null

**Workflow**:
1. Loads `site_configs.json` (domain → config file mapping) via synchronous XHR
2. Matches current domain:
   - **Exact match** (e.g., `youtube.com`)
   - **Partial match** (e.g., `youtube` in `www.youtube.com`)
   - **Default** (fallback if no match)
3. Loads specific config file (e.g., `site_configs/youtube.json`) via synchronous XHR
4. Sets globals: `siteConfig`, `window.currentSiteConfig`, `window.currentFramework`

**Called by**:
- Script initialization (immediately on load)
- `capabilityPipelineExecutor()` (as fallback if config not found)

**Sets globals**:
- `siteConfig` (local variable)
- `window.currentSiteConfig`
- `window.currentFramework`

---

#### `scanWithFrameworkSelectors()`

**Purpose**: Scans DOM using site-specific selectors from config

**Returns**: Array of `{element, type, selector, framework}` objects

**Workflow**:
1. Gets selectors from `window.currentSiteConfig.selectors`
2. Scans categories in priority order:
   - `text_inputs` (highest priority)
   - `navigation`
   - `url_elements`
   - `buttons`
   - `menus`
   - `content_elements`
   - `hidden_content`
3. Uses WeakSet to prevent duplicate scanning
4. Also scans `forceIncludeSelectors` (mission-critical controls like main search input)
5. Logs concise summary per category (no individual element logging for performance)

**Called by**: `IntelligenceEngine.extractSemanticTextWithIds()` during element registration

**Prevents duplicates**: Uses WeakSet to track seen DOM elements

**Example Output**:
```
Framework: youtube - text_inputs: 3, navigation: 45, url_elements: 12, buttons: 8 - Total: 68
```

---

### 4. IntelligenceEngine (Core)

#### Constructor: `IntelligenceEngine()`

**Purpose**: Main intelligence processing engine

**State tracking**:
- `pageState` - Current view, interactive elements, content elements, URL, title
  - `currentView` - 'unknown'
  - `interactiveElements[]` - Array of interactive element data
  - `contentElements[]` - Array of content element data
  - `navigationState` - 'unknown'
  - `contentSections[]` - Sections
  - `lastUpdate` - Timestamp
  - `url` - Page URL
  - `title` - Page title
- `eventHistory[]` - History of DOM events
- `llmInsights[]` - Generated insights for LLM
- `contentElements` - Map of contentId → descriptor
- `elementCounter` - Counter for generating unique IDs (reset on each scan)
- `initialScanCompleted` - Boolean tracking scan state
- `youtubeRegisteredUrls` - Set of YouTube URLs already registered
- `lastTranscriptSignature` - Last harvested transcript snapshot

**Removed/Deprecated**:
- `actionableElements` Map - REMOVED, replaced by selector-based resolution
- `actionableElementNodes` WeakMap - REMOVED
- `registeredElements` WeakSet - REMOVED
- `elementToActionId` WeakMap - REMOVED

**Scan lock**:
- `_scanInProgress` - Boolean flag to prevent concurrent scans

**Called by**: Script initialization via `recreateIntelligenceEngine()`

---

#### `IntelligenceEngine.prototype.prepareIntelligenceData()`

**Purpose**: Generates structured JSONL artifacts for LLM consumption

**Returns**: Object with intelligence data containing:
- `page` - Page metadata
- `sections` - Logical page sections
- `text` - Semantic content with IDs
- `actions` - Interactive elements with action IDs

**Workflow**:
1. Calls `extractSemanticTextWithIds()` to get text content with inline action hints
2. Builds JSONL records:
   - **Meta record** - Page metadata (URL, title, framework, totals)
   - **Section records** - Logical page sections (main, nav, aside, etc.)
   - **Text records** - Semantic content (headings, paragraphs) with IDs
   - **Action records** - Interactive elements with action IDs
3. Orders records by DOM position (depth-first traversal)
4. Filters out duplicates and low-quality elements
5. Returns structured data for server to write to disk

**Called by**: `executeScanWithSettle()`

**Generates data for**:
- `page.jsonl`
- `content.jsonl`
- `text.md`
- `llm_actions.json`

---

#### `IntelligenceEngine.prototype.extractSemanticTextWithIds()`

**Purpose**: Extracts meaningful text content with inline action IDs (like innerText but with action hints)

**Returns**: Object with:
- `text` - String with inline action hints
- `actionables[]` - Array of actionable element descriptors

**Text ID format**: Element IDs written to DOM as `data-ome-action-id="a_id_<counter>"`

**Example Output**:
```
Button: Skip navigation → {"act": "a_id_0"}
Input: Search → {"act": "a_id_1", "value": "...", "submit": true}
Link: Guthrie Govan acoustic solo → {"act": "a_id_2"}
Regular text here
```

**Workflow**:
1. Cleans old `data-ome-action-id` attributes from previous scan
2. Resets `elementCounter` to 0
3. Walks DOM tree (only visible elements like innerText)
4. For each interactive element:
   - Generates unique action ID: `a_id_<counter>`
   - Writes ID to DOM element as `data-ome-action-id` attribute
   - Appends action hint to text output
   - Adds descriptor to `actionables[]` array
5. Returns combined text + actionables array

**Element Types Detected**:
- Buttons
- Links
- Inputs (text, search, email, etc.)
- Textareas
- Contenteditable elements (ProseMirror, Lexical, etc.)
- Selects
- Checkboxes/radios

**Called by**: `prepareIntelligenceData()`

**Visibility Rules**:
- Skips `display:none`, `visibility:hidden`, `opacity:0`
- **Exception**: Elements with `aria-labelledby` pointing to visible label text are kept (accessible form controls)

---

#### `IntelligenceEngine.prototype.isInteractiveElement(element)`

**Purpose**: Determines if element is interactive

**Returns**: Boolean

**Checks**:
1. **Priority 1**: Elements with URLs (hasUrl check)
2. **Priority 2**: Framework-specific selectors from site config
3. **Priority 3**: Framework include filters
4. **Priority 4**: Framework exclude filters (REJECT if matched)
5. **Fallback**: Generic logic - standard tags (A, BUTTON, INPUT, etc.) and roles

**Interactive Tags**: `A`, `BUTTON`, `INPUT`, `SELECT`, `TEXTAREA`

**Interactive Roles**: `button`, `link`, `menuitem`, `tab`, `checkbox`, `radio`, `textbox`

**Called by**: `registerInteractiveSubtree()`, `passesBasicQualityFilter()`

---

#### `IntelligenceEngine.prototype.passesBasicQualityFilter(element)`

**Purpose**: Filters out low-quality elements

**Returns**: Boolean

**Rejects**:
- Hidden elements (hidden attribute or `aria-hidden="true"`)
- Elements with no meaningful content (no text, aria-label, title, or placeholder > 2 chars)
- Placeholder links (href="#" or javascript:)

**Always accepts**:
- Elements classified as interactive by `isInteractiveElement()`
- Form inputs (INPUT, SELECT, TEXTAREA)

**Called by**: `registerInteractiveSubtree()`

---

#### `IntelligenceEngine.prototype.queueFullRescan(reason)`

**Purpose**: Requests full page rescan via service worker

**Parameters**:
- `reason` - Why rescan is needed (e.g., 'dom_mutation', 'url_change')

**Workflow**:
1. Sends `request_scan` message to service worker
2. Service worker decides whether to rescan (rate limiting, duplicate prevention)
3. If approved → service worker sends `start_scan` message back to content script

**Called by**:
- `analyzeStructureChanges()` (on major DOM changes) - **DISABLED**
- URL change observer
- Hash change listener
- Popstate listener

**Note**: DOM mutation rescans are **DISABLED**. Only explicit navigation events trigger rescans.

---

### 5. Element Discovery

#### `discoverLoginControls(options)`

**Purpose**: Heuristic-based login form detection

**Returns**:
```javascript
{
    timestamp: number,
    total: number,
    matches: {
        login_email: [...],
        login_password: [...],
        login_submit: [...]
    }
}
```

**Scoring System**:
1. **Exact selectors** (priority 100):
   - `input[name="email"]`, `input[type="email"]`, etc.
   - `input[type="password"]`
   - `button[type="submit"]`
2. **Attribute matching** (priority 80):
   - `type="email"`, `type="password"`, `autocomplete` values
3. **Keyword matching** (priority 60):
   - Searches placeholder, aria-label, name for keywords like "email", "password", "login"

**Workflow**:
1. Tries exact selectors first (highest score)
2. Scans all inputs/buttons for attribute patterns
3. Scans for keyword matches in text/labels
4. Sorts results by score (highest first)
5. Returns top matches per role

**Called by**: Message handler when receiving `discoverLoginControls` command

**Used for**: Automatic login form filling

---

#### `buildElementDescriptor(element, role)`

**Purpose**: Builds complete descriptor object for element

**Parameters**:
- `element` - DOM element
- `role` - Semantic role (e.g., 'login_email', 'search_button')

**Returns**: Descriptor object with:
- `role`, `tagName`, `primarySelector`, `selectors[]`
- `attributes` (id, name, type, placeholder, ariaLabel, etc.)
- `text` (textContent or value)
- `visible` (computed visibility)
- `rect` (bounding box: width, height, top, left)

**Called by**:
- `discoverLoginControls()`
- Element registration functions

---

#### `buildSelectorCandidates(element)`

**Purpose**: Generates multiple selector options for element

**Returns**: Array of CSS selectors (best to worst)

**Priority**:
1. `#id` (if has ID)
2. `[data-testid="..."]` (if has data-testid)
3. `tag[name="..."]` (if has name attribute)
4. `tag[aria-label="..."]` (if has aria-label)
5. `tag[placeholder="..."]` (if has placeholder)
6. `tag[type="..."]` (if has type)
7. CSS path (nth-of-type selectors up to 6 levels deep via `computeCssPath()`)

**Called by**: `buildElementDescriptor()`

---

### 6. Capability Pipeline

#### `capabilityPipelineExecutor(capabilityAction, params)`

**Purpose**: Dynamic element finder for lazy-loaded content (bypasses action-ID registry)

**Parameters**:
- `capabilityAction` - Capability name (e.g., "RetrieveTranscript")
- `params` - Action parameters (e.g., `{value: "query", submit: true}`)

**Returns**: `{success: boolean, message, elementFound, matchedBy}`

**Workflow**:
1. Loads site config (uses `siteConfig` or `window.currentSiteConfig`)
2. Finds capability config by action name
3. Gets selectors from `capability.selectors[]`
4. Tries each selector with `document.querySelectorAll()`
5. If not found immediately → waits up to 5s with `waitForElement()`
6. Executes appropriate action based on element type:
   - **Input/textarea/contenteditable** → Sets value + optional submit
   - **Button** → Clicks via `universalClick()`
7. Waits for action to complete (2s)
8. Triggers intelligence update (rescan)

**Submit methods** (configurable via `capability.submitMethod`):
- `'enter'` (default) - Dispatches Enter keydown event
- `'click'` - Clicks submit button (uses `capability.submitSelector`)
- `'form'` - Calls `form.submit()` on parent form

**Contenteditable Handling**:
- **Generic mode**: Uses `document.execCommand('insertText')` for simple contenteditable
- **Lexical mode** (Facebook Messenger): Special sequencing with paste-to-replace + per-char beforeinput fallback
  - Triggered by `capability.forceLexicalInput: true` in config
  - Uses `waitFrames()`, `getEditorText()`, `ensureCaretEnd()`, `clickLikeUser()` helpers
  - Handles Lexical's `[data-lexical-text]` nodes

**Called by**: Message handler when receiving `execute_capability` from service worker

**Example capabilities**: YouTube transcript retrieval, ChatGPT prompt submission, Facebook Messenger input

---

#### `waitForElement(selector, timeout)`

**Purpose**: Waits for element to appear in DOM (lazy loading)

**Parameters**:
- `selector` - CSS selector
- `timeout` - Max wait time (default: 5000ms)

**Returns**: Promise<Element> or rejects with timeout error

**How it works**:
1. Checks if element already exists
2. If not → creates MutationObserver watching document.body
3. Resolves when element appears
4. Rejects after timeout

**Called by**: `capabilityPipelineExecutor()`

---

### 7. Action Execution

#### `universalClick(element, clickType)`

**Purpose**: Multi-strategy click implementation for React/SPA compatibility

**Parameters**:
- `element` - Element to click
- `clickType` - `'aggressive'` (default) or `'simple'`

**Simple Mode** (`clickType === 'simple'`):
- Single native `element.click()` call
- Ideal for checkboxes/radios/switches
- No verification or fallback

**Aggressive Mode** (default):

**Strategies** (tries all in sequence for React elements, stops at first success otherwise):
1. **Pointer events** (Facebook/React compatibility) - FIRST for React elements
   - Dispatches pointerdown + pointerup + click
   - Uses element center coordinates
2. **Direct click** - `element.click()`
3. **Mouse events** - Dispatches mousedown + mouseup + click
4. **Touch events** - Dispatches touchstart + touchend + click
5. **Focus + Space** - Focuses element + dispatches Space keydown
6. **Focus + Enter** - Focuses element + dispatches Enter keydown

**React Element Detection**:
```javascript
const isReactLikeElement = element.getAttribute('role') === 'button' &&
    element.tagName !== 'BUTTON' &&
    (element.className.length > 50 || element.className.includes(' x'));
```

**Verification** (checks if click worked):
- DOM changes (new elements added/removed)
- URL changes
- Attribute changes (aria-expanded, etc.)

**Returns**: `{success: boolean, method: string, verified: boolean}`

**Called by**:
- `IntelligenceEngine.executeAction()` (for 'click' actions)
- `capabilityPipelineExecutor()` (for button clicks)

---

#### `cmd_scroll({direction})`

**Purpose**: Page-by-page viewport scrolling

**Parameters**:
- `direction` - 'down', 'up', 'top', 'bottom' (default: 'down')

**Returns**: `{ok: true, direction, startY, endY, scrolled, atTop, atBottom}`

**Workflow**:
1. Finds scrollable container (main page or specific element with overflow)
2. Calculates target scroll position (viewport-sized pages, 80% of viewport height)
3. Executes smooth scroll via `window.scrollTo()` or element.scrollTop
4. Waits for scroll to complete with `waitForScrollEnd()`
5. Returns new position + boundary flags

**Called by**: Message handler when receiving `scroll` command

**Scrollable Container Detection**:
- Uses `findScrollableContainer()` to find element with `overflow-y: scroll/auto`
- Prioritizes larger containers (viewport size)
- Falls back to window if no scrollable container found

---

#### `waitForScrollEnd(targetY, maxWait)`

**Purpose**: Detects when smooth scroll animation completes

**Parameters**:
- `targetY` - Target scroll position
- `maxWait` - Max wait time (default: 1000ms)

**Returns**: Promise that resolves when scroll stable

**How it works**:
1. Polls `window.scrollY` every 50ms
2. Resolves when position stable for 3 checks (150ms)
3. Failsafe timeout after maxWait

**Called by**: `cmd_scroll()`

---

### 8. Message Handlers

The content script has **THREE** separate message listeners for different message types:

#### Main Message Listener #1 (General Commands)

**Location**: Lines ~2741

**Handles**:
- `start_intelligence_scan` → `scheduleInitialScan()`
- `start_scan` → `executeScanWithSettle()`
- `toggle_hud` → `toggleHUD()`
- `set_orb_theme` → `setOrbTheme()`
- `apply_orb_theme` → `applyOrbTheme()`
- `get_orb_themes` → Return available themes
- `get_orb_screen_position` → Return orb position before zoom
- `set_orb_screen_position` → `restoreOrbScreenPosition()` after zoom
- `ui_chat_append_ack` → `handleChatAck()`
- `ui_chat_error` → `handleChatError()`
- `ui_chat_history` → `handleChatHistory()`
- **Commands** (via `message.command`):
  - `waitFor` → `cmd_waitFor()`
  - `getText` → `cmd_getText()`
  - `click` → `cmd_click()`
  - `getPageMarkdown` → `cmd_getPageMarkdown()`
  - `extractPageText` → `cmd_extractPageText()`
  - `scroll` → `cmd_scroll()`
  - `getCurrentTabInfo` → `getCurrentTabInfo()`
  - `getNavigationContext` → `getNavigationContext()`
  - `searchActions` → `intelligenceEngine.searchActionableElements()`
  - `discoverLoginControls` → `discoverLoginControls()`
  - `generateSiteMap` → `generateSiteMap()`
  - `getDOMChangeStatus` → `getDOMChangeStatus()`
  - `enableDOMChangeDetection` → `enableDOMChangeDetection()`
  - `disableDOMChangeDetection` → `disableDOMChangeDetection()`
  - `getElementCoordinatesByActionId` → Resolves element and returns coordinates
  - `navigateBack` → `navigateBack()`
  - `navigateForward` → `navigateForward()`
  - `jumpToHistoryEntry` → `jumpToHistoryEntry()`
  - `getHistoryState` → `getHistoryState()`
  - `searchHistory` → `searchHistory()`
  - `clearHistory` → `clearHistory()`
  - `getIntelligenceStatus` → Returns intelligence engine status
  - `getCurrentPageIntelligence` → Returns current page intelligence
  - `getActionableElements` → Returns actionable elements summary
  - `executeAction` → `intelligenceEngine.executeAction()`
  - `scanAndRegisterElements` → Routes to SW (requests scan)
  - `testIntelligenceSystem` → Returns system health status

**Main frame safety check**: All handlers verify `window.top === window.self`

---

#### Message Listener #2 (Execute Action)

**Location**: Lines ~10777

**Handles**: `execute_action` messages

**Message structure**:
```javascript
{
    type: "execute_action",
    data: {
        actionId: "a_id_42",
        actionType: "click",
        params: {value: "search query", submit: true}
    }
}
```

**Workflow**:
1. Normalizes action ID (`a_i_` → `a_id_`)
2. Validates intelligence engine is available
3. Resolves element via `document.querySelector('[data-ome-action-id="' + actionId + '"]')`
4. Executes action based on `actionType`:
   - `click` → `universalClick(element)`
   - `setValue` → Sets value + dispatches events + optional submit
   - `toggle` → Toggles checkbox state
   - `select` → Sets select option
   - `scroll` → Scrolls element into view
   - `focus` → Focuses element
   - `submit` → Submits form after setValue
5. Returns result to service worker

**Called by**: Service worker forwarding WebSocket messages from Python server

---

#### Message Listener #3 (Execute Capability)

**Location**: After execute_action listener

**Handles**: `execute_capability` messages

**Message structure**:
```javascript
{
    type: "execute_capability",
    action: "RetrieveTranscript",
    params: {value: "query", submit: true}
}
```

**Workflow**:
1. Routes to `capabilityPipelineExecutor(action, params)`
2. Returns result to service worker

**Called by**: Service worker forwarding capability commands from Python server

---

### 9. DOM Change Detection

#### `initializeDOMChangeDetection()`

**Purpose**: Sets up MutationObserver for real-time change monitoring

**Observes**:
- `childList` - Element additions/removals
- `subtree` - All descendants
- `attributes` - Attribute changes (filtered: class, style, data-*, aria-*)
- `characterData` - Text content changes

**Workflow**:
1. Creates MutationObserver on document.body
2. On each mutation batch → calls `isSignificantChange()`
3. If significant → sends `dom_changed` notification to service worker
4. Service worker logs changes (rescans are controlled via navigation events)

**Called by**: Script initialization (after initial scan)

**Note**: DOM mutation rescans are **DISABLED**. Observer only logs changes for debugging.

**Observer Config**:
```javascript
{
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'data-*', 'aria-*'],
    characterData: true,
    characterDataOldValue: false
}
```

---

#### `isSignificantChange(mutations)`

**Purpose**: Filters out noise (mouse events, focus changes, etc.)

**Returns**: Boolean

**Criteria**:
- More than 3 mutations
- Not just attribute changes
- At least 2 seconds since last significant change
- Not in ignored change types (mouseover, mouseout, focus, blur)

**Called by**: MutationObserver callback in `initializeDOMChangeDetection()`

**Constants**:
- `MIN_MUTATIONS_FOR_SIGNIFICANT` - 3
- `MIN_CHANGE_INTERVAL` - 2000ms
- `IGNORED_CHANGE_TYPES` - Set(['mouseover', 'mouseout', 'focus', 'blur'])

---

#### `notifyServiceWorkerOfChanges(changeInfo)`

**Purpose**: Sends DOM change notification to service worker

**Parameters**:
- `changeInfo` - `{url, changeNumber, totalMutations, types, timestamp, isSignificant}`

**Sends**: `{type: "dom_changed", ...changeInfo}` via `chrome.runtime.sendMessage()`

**Called by**: MutationObserver callback (when significant change detected)

---

### 10. Network Activity Monitoring

#### `notifyNetworkActivity(eventType, url, status)`

**Purpose**: Notifies service worker of fetch/XHR requests

**Parameters**:
- `eventType` - 'fetch_start', 'fetch_end', 'xhr_start', 'xhr_end'
- `url` - Request URL
- `status` - 'success', 'error', 'abort', 'complete' (optional)

**Sends**:
```javascript
{
    type: "network_activity",
    eventType,
    url,
    status,
    timestamp: Date.now(),
    inflightRequests: window.inflightRequests || 0
}
```

**Called by**:
- `wrapFetch()` in pageIdleMonitor
- `wrapXmlHttpRequest()` in pageIdleMonitor

**Use case**: Helps service worker understand when page is truly idle

---

### 11. Element Types & Handling

#### Input Fields

**Tags**: `input`, `textarea`, `[contenteditable]`

**Actions**:
- `setValue` - Sets value + dispatches input/change events
- `focus` - Focuses element
- `submit` - Sets value + submits form (Enter key or button click)

**Special handling**:
- **Contenteditable** (ProseMirror/Lexical) → Uses `document.execCommand('insertText')`
- **React inputs** → Dispatches synthetic events for state sync
- **Autofocus** → Applies focus on page load (configurable via `site_configs.json`)

---

#### Buttons

**Tags**: `button`, `input[type="submit"]`, `input[type="button"]`, `[role="button"]`

**Actions**:
- `click` - Clicks via `universalClick()` (multi-strategy)
- `submit` - Clicks + waits for navigation

**Special handling**:
- **React buttons** → Multiple click strategies (direct, mouse events, pointer events)
- **Submit buttons** → Triggers form submission
- **Lazy-loaded buttons** → Capability pipeline waits for appearance

---

#### Links

**Tags**: `a[href]`, `[role="link"]`

**Actions**:
- `navigate` - Clicks link (triggers navigation)
- `click` - Same as navigate

**Extracts**:
- `href` - URL
- `target` - _blank, _self, etc.
- `rel` - nofollow, noreferrer, etc.

---

#### Checkboxes/Toggles

**Tags**: `input[type="checkbox"]`, `[role="checkbox"]`, `[role="switch"]`

**Actions**:
- `toggle` - Toggles checked state + dispatches change event
- `click` - Same as toggle

**State tracking**: Reads `checked` or `aria-checked` attribute

---

#### Dropdowns

**Tags**: `select`, `[role="listbox"]`

**Actions**:
- `select` - Sets selected option by value/text
- `click` - Opens dropdown

**State tracking**: Reads `selectedIndex` and `options[]`

---

### 12. Focus Management

#### `applyConfiguredFocus(reason)`

**Purpose**: Auto-focuses primary input on page load

**Workflow**:
1. Gets focus targets from `window.currentSiteConfig.focus_targets[]`
2. Tries each selector in order
3. Falls back to generic selectors:
   - `input[type='search']`
   - `input[type='text']`
   - `textarea`
   - `[contenteditable='true']`
   - `input:not([type='hidden'])`
   - `select`
4. Validates element is focusable (not disabled, visible, has tabIndex)
5. Focuses element via `focusElement()`
6. Dispatches mousemove event (simulates cursor presence)
7. Dispatches input/change events (warms up React state)

**Called by**:
- After scan completes (in some code paths)
- `scheduleFocusRetry()` (if initial attempt fails)

**Prevents multiple attempts**: Sets `initialFocusApplied` flag

---

#### `focusElement(element, reason)`

**Purpose**: Focuses element with preventScroll option

**Parameters**:
- `element` - Element to focus
- `reason` - Why focusing (e.g., 'post_scan', 'user_request')

**Returns**: Boolean (success/failure)

**Workflow**:
1. Tries `element.focus({preventScroll: true})`
2. Falls back to `element.focus()` if unsupported
3. Verifies focus worked (`document.activeElement === element`)
4. Simulates mousemove over element (warms up hover states)
5. Dispatches input/change events via `simulateUserInput()`
6. Sets `initialFocusApplied` flag
7. Clears retry timer

**Called by**: `applyConfiguredFocus()`

---

#### `isElementFocusable(element)`

**Purpose**: Validates element can receive focus

**Returns**: Boolean

**Checks**:
- Not disabled (`element.disabled === false`)
- Not aria-disabled (`aria-disabled !== 'true'`)
- Visible (`isElementVisible()`)
- Has tabIndex >= 0 OR is focusable tag (input, textarea, select, button) OR is contenteditable

**Called by**: `applyConfiguredFocus()`

---

### 13. Visibility & Positioning

#### `isElementVisible(element)`

**Purpose**: Determines if element is visible to user

**Returns**: Boolean

**Checks**:
- `offsetParent !== null` (not display:none)
- `getBoundingClientRect()` width/height > 0
- `getComputedStyle()` visibility !== 'hidden', display !== 'none'
- Opacity > 0

**Special case**: YouTube guide drawer items are considered visible even when drawer is collapsed (uses `closest()` to detect guide items with meaningful labels)

**Called by**:
- `passesBasicQualityFilter()`
- Element registration functions
- Visibility computation in `prepareIntelligenceData()`

---

#### `getElementCoordinates(element)`

**Purpose**: Gets element position for cursor automation

**Returns**: `{x, y, width, height, inViewport, visibilityScore}`

**Workflow**:
1. Gets `getBoundingClientRect()`
2. Calculates viewport intersection
3. Computes visibility score (0-1)
4. Returns center point (x, y)

**Called by**: Message handler for `getElementCoordinatesByActionId` command

---

#### `analyzeViewportPosition(element)`

**Purpose**: Analyzes if element is in viewport

**Returns**: `{inViewport: boolean, position: string, scrollNeeded: boolean}`

**Position values**: 'above', 'below', 'left', 'right', 'visible', 'partial'

**Called by**: Click handlers (to decide if scroll needed)

---

#### `fixViewportPositioning(element)`

**Purpose**: Scrolls element into view smoothly

**Workflow**:
1. Calls `element.scrollIntoView({behavior: 'smooth', block: 'center'})`
2. Waits for scroll animation (200ms)
3. Verifies element is now visible

**Called by**: `universalClick()` (before clicking)

---

### 14. Selector Generation

#### `generateSelector(element)`

**Purpose**: Generates CSS selector for element (inspired by Crawl4AI)

**Returns**: String CSS selector

**Priority**:
1. `#id` (if has ID)
2. `.class` (first class)
3. nth-child path (traverses up to parent with ID)

**Called by**:
- `cmd_getPageMarkdown()` (for headings)
- Element registration functions

**Note**: Two implementations exist - one at top-level, one in IntelligenceEngine.prototype

---

#### `computeCssPath(element, maxDepth)`

**Purpose**: Generates nth-of-type selector path

**Parameters**:
- `element` - Element to generate selector for
- `maxDepth` - Max levels to traverse (default: 5)

**Returns**: String like `div.container > section:nth-of-type(2) > button:nth-of-type(1)`

**Workflow**:
1. Traverses up parent chain
2. For each element → generates `tag:nth-of-type(n)`
3. Stops at element with ID or after maxDepth levels
4. Joins with ` > `

**Called by**: `buildSelectorCandidates()`

---

### 15. Navigation & History

#### `initializeHistoryTracking()`

**Purpose**: Tracks navigation history for back/forward navigation

**Workflow**:
1. Adds current page to `navigationHistory[]`
2. Listens for popstate events (back/forward buttons)
3. Listens for URL changes (SPA navigation)
4. Maintains `currentHistoryIndex` pointer

**Called by**: Script initialization

---

#### `addToHistory(url, title, metadata)`

**Purpose**: Adds entry to navigation history

**Parameters**:
- `url` - Page URL
- `title` - Page title
- `metadata` - Optional metadata (timestamp, etc.)

**Workflow**:
1. Checks for duplicate (same URL as current entry)
2. Appends to `navigationHistory[]`
3. Increments `currentHistoryIndex`
4. Limits history size (keeps last 50 entries)

**Called by**:
- `initializeHistoryTracking()` (initial page)
- URL change observer
- Popstate listener

---

#### `navigateBack(steps)` / `navigateForward(steps)`

**Purpose**: Programmatic back/forward navigation

**Parameters**:
- `steps` - Number of steps to go back/forward (default: 1)

**Returns**: `{success: boolean, fromIndex, toIndex, targetUrl, targetTitle}`

**Workflow**:
1. Validates steps within history bounds
2. Calls `window.history.go(steps)` or `window.history.go(-steps)`
3. Updates `currentHistoryIndex`

**Called by**: Message handler (if navigation commands are implemented)

---

### 16. Content Extraction

#### `cmd_getPageMarkdown()`

**Purpose**: Generates Crawl4AI-inspired markdown from page

**Returns**: `{frontmatter, markdown, headings, paragraphs, links, processingTime, size}`

**Workflow**:
1. Extracts basic info (URL, title, timestamp)
2. Clones document (non-destructive)
3. Finds main content area (main, article, role=main)
4. Extracts headings (h1-h6) with selectors
5. Extracts paragraphs (filtered by length/relevance)
6. Extracts links (filtered by href validity)
7. Generates markdown with frontmatter
8. Returns structured object

**Filters out**:
- Cookie notices
- Subscription prompts
- Short paragraphs (<20 chars)
- javascript: links

**Called by**: Message handler when receiving `getPageMarkdown` command

---

#### `cmd_extractPageText()`

**Purpose**: Extracts structured text using IntelligenceEngine

**Returns**: `{frontmatter, markdown, headings, paragraphs, lists, processingTime, statistics}`

**Workflow**:
1. Calls `intelligenceEngine.extractPageTextToMarkdown()`
2. Calls `intelligenceEngine.extractHeadings()`
3. Calls `intelligenceEngine.extractParagraphs()`
4. Calls `intelligenceEngine.extractLists()`
5. Compiles statistics (counts)
6. Returns structured object

**Called by**: Message handler when receiving `extractPageText` command

---

### 17. Autocomplete Dropdown Handler

#### `watchForAutocompleteDropdown(inputElement, searchValue, config)`

**Purpose**: Watch for autocomplete dropdown to appear and click first option

**Parameters**:
- `inputElement` - The input that triggered the dropdown
- `searchValue` - The typed value (for logging)
- `config` - Optional config from site_configs

**Returns**: Promise that resolves when option clicked or timeout

**How it works**:
1. Uses MutationObserver - truly event-driven, no polling/timers
2. Searches for dropdown container (selectors from config or defaults):
   - `[role="listbox"]`
   - `ul[role="listbox"]`
   - `[role="menu"]`
3. Finds options inside:
   - `[role="option"]`
   - `li[role="option"]`
   - `[role="menuitem"]`
4. Clicks first visible option (or link/clickable div inside option)
5. Max wait: 5000ms (configurable)

**Called by**: `capabilityPipelineExecutor()` (when submitting input values)

**Exposed globally**: `window.watchForAutocompleteDropdown` for debugging

---

### 18. Utilities

#### `cssEscape(value)`

**Purpose**: Escapes special characters for CSS selectors

**Parameters**: `value` - String to escape

**Returns**: Escaped string

**Uses**: `window.CSS.escape()` if available, otherwise manual escaping

**Called by**: Selector generation functions

---

#### `sleep(ms)`

**Purpose**: Async delay utility

**Parameters**: `ms` - Milliseconds to wait

**Returns**: Promise that resolves after delay

**Called by**: Various async functions needing delays

---

#### `visible(element)` (top-level function)

**Purpose**: Quick visibility check

**Returns**: Boolean

**Checks**:
- `getBoundingClientRect()` width/height > 0
- `getComputedStyle()` visibility !== 'hidden', display !== 'none'

**Called by**: `waitForSelector()`, automation commands

---

#### `coordsForNode(node)`

**Purpose**: Gets element center coordinates

**Returns**: `{x, y}`

**Workflow**:
1. Gets `getBoundingClientRect()`
2. Calculates center point
3. Returns coordinates

**Called by**: Message handler for coordinate queries

---

### 19. Event-Triggered Updates

#### URL change observer (MutationObserver)

**Purpose**: Detects SPA navigation (URL changes without page reload)

**Observes**: `document` (subtree, childList, attributes, attributeFilter: ['href'])

**Workflow**:
1. Compares `window.location.href` to `currentUrl`
2. If changed → queues full rescan via `intelligenceEngine.queueFullRescan('url_change')`

**Called by**: Script initialization (after setting up observer)

---

#### Hash change listener

**Purpose**: Detects anchor navigation (#hash changes)

**Event**: `window.addEventListener('hashchange')`

**Workflow**:
1. Waits 500ms (let page settle)
2. Queues full rescan via `intelligenceEngine.queueFullRescan('hash_change')`

**Called by**: Script initialization

---

#### Popstate listener

**Purpose**: Detects browser back/forward button

**Event**: `window.addEventListener('popstate')`

**Workflow**:
1. Waits 500ms (let page settle)
2. Queues full rescan via `intelligenceEngine.queueFullRescan('popstate')`

**Called by**: Script initialization

---

#### Visibility change listener

**Purpose**: Detects tab switching (tab becomes visible)

**Event**: `document.addEventListener('visibilitychange')`

**Workflow**:
1. If `document.visibilityState === 'visible'`
2. Waits 500ms
3. Queues intelligence update via `intelligenceEngine.queueIntelligenceUpdate('normal')`

**Called by**: Script initialization

---

#### Focus listener

**Purpose**: Detects window focus (user returns to tab)

**Event**: `window.addEventListener('focus')`

**Workflow**:
1. Waits 500ms
2. Queues intelligence update via `intelligenceEngine.queueIntelligenceUpdate('normal')`

**Called by**: Script initialization

---

## Iframe Support

### Iframe Detection and Handling

**Detection**:
```javascript
const isInIframe = window.top !== window.self;
```

**Iframe Mode**:
- Runs separate lightweight scan
- Does NOT initialize full intelligence system
- Reports elements to service worker with local IDs

### Iframe Scan Functions

#### `setupIframeHandlers()`

**Purpose**: Set up message handler for ID updates from SW

**Listens for**: `update_iframe_ids` message

**Workflow**:
1. Receives ID mapping from service worker (localId → finalId)
2. Updates DOM elements' `data-ome-action-id` attributes
3. Returns count of updated elements

---

#### `runIframeScan()`

**Purpose**: Auto-scan when DOM ready

**Workflow**:
1. Waits for DOMContentLoaded or executes immediately if loaded
2. Calls `performIframeScan()`

---

#### `performIframeScan()`

**Purpose**: Extracts interactive elements with LOCAL IDs, sends to SW

**Scans for**: `input:not([type="hidden"])`, `select`, `textarea`, `button`

**Workflow**:
1. Assigns local IDs: `iframe_0`, `iframe_1`, etc.
2. Writes local IDs to DOM as `data-ome-action-id`
3. Extracts element metadata (tag, type, label, placeholder, etc.)
4. Sends `iframe_intelligence` message to service worker
5. Service worker assigns final IDs and sends mapping back

**Message sent**:
```javascript
{
    type: 'iframe_intelligence',
    iframeUrl: window.location.href,
    iframeOrigin: window.location.origin,
    elements: [...],
    timestamp: Date.now()
}
```

---

### Dynamic Iframe Detection

**Purpose**: Catch iframes added after initial scan (CyberSource, Stripe, etc.)

**Observer**: MutationObserver watching document.documentElement

**Workflow**:
1. Detects new iframe nodes or nested iframes
2. Filters for cross-origin iframes
3. Sends `dynamic_iframe_detected` message to service worker
4. Listens for iframe's load event
5. Sends `dynamic_iframe_loaded` message when loaded

**Messages sent**:
- `dynamic_iframe_detected` - Iframe element added to DOM
- `dynamic_iframe_loaded` - Iframe finished loading

---

## HUD/Orb UI System

### Overview

The Om-E HUD system is a **Shadow DOM-based floating interface** that provides visual control and chat interaction directly in the browser. It consists of:

1. **Floating Orb** - Draggable interface anchor with theme-based avatars (kawaii, robot, atom)
2. **HUD Overlay** - Full-screen prompt interface with message history
3. **Chat Panel** - Resizable chat interface anchored to orb
4. **Theme System** - Three visual themes with distinct orb designs and colors
5. **Control Buttons** - Scroll, zoom, and HUD toggle controls

**Architecture**: Shadow DOM isolation prevents CSS conflicts with host page. All UI components render inside closed shadow root.

**Note**: HUD/Orb system is extensively documented in existing 02_content.md sections 19-20. See those sections for complete details on:
- HUD State Management
- Orb Themes
- Core Functions (initHUD, createOrb, createHUD, toggleHUD, toggleChatPanel)
- Chat System (renderChatMessages, sendChatMessage, message handlers)
- Persistence & State Management
- Control Buttons
- Styling & Shadow DOM
- Message Integration

---

## Data Flow Summary

### Page Load → Initial Scan
```
1. content.js loads
2. Establishes keep-alive port (prevents service worker suspension)
3. Loads site config via getSiteConfigDirect()
4. Creates IntelligenceEngine instance
5. Waits for document_idle (content script runs at this timing)
6. scheduleInitialScan('immediate') → requestIdleCallback → runScanAfterPageLoad()
7. Service worker sends start_scan message (or fallback timeout triggers scan)
8. executeScanWithSettle() → prepareIntelligenceData()
9. Sends scan_complete with intelligence data to service worker
10. Service worker forwards to ws_server.py
11. ws_server.py writes page.jsonl, content.jsonl, text.md, llm_actions.json
12. startSignificantChangeDetector() begins watching for future changes
```

### LLM Action Execution
```
1. test_navigation.py sends {type: "llm_instruction", actionId, actionType, params} to ws_server.py
2. ws_server.py forwards to service worker via WebSocket
3. Service worker sends {type: "execute_action", data: {actionId, actionType, params}} to content.js
4. Content.js resolves element via document.querySelector('[data-ome-action-id="' + actionId + '"]')
5. Executes action based on actionType (click, setValue, etc.)
6. Action execution (universalClick, setValue with events, etc.)
7. Optionally triggers rescan (if params.submit or major change)
8. Returns result to service worker → ws_server.py → test_navigation.py
```

### Capability Execution
```
1. test_navigation.py sends {type: "execute_capability", action, params} to ws_server.py
2. ws_server.py forwards to service worker
3. Service worker sends {type: "execute_capability", action, params} to content.js
4. Content.js routes to capabilityPipelineExecutor()
5. Loads site config, finds capability config
6. Tries selectors with querySelectorAll() or waitForElement()
7. Executes action (click or setValue)
8. Waits 2s for result
9. Triggers intelligence update
10. Returns result to service worker → ws_server.py → test_navigation.py
```

### DOM Change → Potential Rescan
```
1. MutationObserver detects DOM changes (startSignificantChangeDetector)
2. Counts mutations in 200ms quiet window
3. If >15 mutations AND 2s since last trigger → sends request_scan to service worker
4. Service worker decides whether to rescan (rate limiting, duplicate prevention)
5. Real rescans ONLY triggered by explicit navigation events:
   - webNavigation.onHistoryStateUpdated
   - webNavigation.onCompleted
   - tabs.onUpdated (complete status)
6. Service worker sends start_scan message
7. executeScanWithSettle() → ... (same as initial scan)

NOTE: DOM mutation rescans are DISABLED to prevent mixed data and race conditions
```

---

## Performance Considerations

1. **WeakSet/WeakMap usage** - Allows garbage collection, prevents memory leaks
2. **Scan lock** - Prevents redundant work, improves performance
3. **Idle detection** - Waits for page to settle before scanning, reduces wasted scans
4. **Mutation observer throttling** - 200ms quiet window prevents rapid rescans
5. **Selector caching** - Selectors generated once per element, reused for lookups
6. **DOM cloning** - Used in `cmd_getPageMarkdown()` to avoid modifying live page
7. **RequestIdleCallback** - Uses browser idle time for non-critical work
8. **Debouncing** - DOM changes debounced with 500ms grouping timeout
9. **Rate limiting** - Significant changes require 2s interval, prevents spam
10. **Lazy evaluation** - Capability pipeline only scans when needed, not on every page load
11. **Shadow DOM isolation** - HUD/Orb UI isolated in shadow root, no CSS conflicts
12. **Instant scan** - No DOM settle wait on initial scan (page already at document_idle)

---

## Redundant/Deprecated Code

### Removed Functions (Documented as REMOVED in comments)

1. **`stopSignificantChangeDetector()`** (Line ~433)
   - Removed 2025-11-21
   - Never called, orphaned function
   - Corresponding start function exists but stop was unused

2. **`removeOverlays()`** (Line ~3238)
   - Removed 2025-11-21
   - 103 lines of dead code
   - Legacy DOM cleanup function with comment "🚫 NO DOM MODIFICATION"
   - Designed to remove overlays/popups but caused navigation issues, abandoned

3. **Map-based action registration** (Lines ~5866-5867)
   - `actionableElements` Map - REMOVED, replaced by selector-based resolution
   - `actionableElementNodes` WeakMap - REMOVED
   - `registeredElements` WeakSet - REMOVED
   - `elementToActionId` WeakMap - REMOVED
   - Replaced with `data-ome-action-id` DOM attribute system

4. **`registerInteractiveSubtree()`** (Line ~5961)
   - REMOVED, replaced by `extractSemanticTextWithIds()`
   - Obsolete Map-based registration

5. **`generateElementSelectors()`** call in `buildSelectorCandidates()` (Line ~1202)
   - DEAD CODE block marked with `if (false)`
   - Function removed, selectors now generated during semantic extraction

### Deprecated Features

1. **`pageVersion` parameter**
   - Deprecated, always set to null
   - Kept for backwards compatibility
   - Used to track page version numbers but abandoned

2. **DOM settle wait** in `executeScanWithSettle()`
   - `waitForDOMSettle()` function exists but NOT called
   - Instant scan used instead (page already at document_idle)
   - Comment: "🚀 INSTANT SCAN - No more waiting for DOM settle"

3. **DOM mutation rescans**
   - Code exists but DISABLED with explicit comments
   - Lines ~1927-1941 in `initializeDOMChangeDetection()`
   - Only logs mutations, doesn't trigger rescans
   - Service worker controls all rescans via navigation events

4. **Old intelligence system**
   - `sendIntelligenceUpdate()` call disabled (Line ~5899)
   - Comment: "NOTE: Disabled old intelligence system - using new sendIntelligenceUpdateToServer instead"

---

## Observers

### MutationObserver Usage

1. **`waitForDOMSettle()`** - Detects when DOM stops changing
   - Config: `{childList: true, subtree: true, attributes: false, characterData: false}`
   - Currently NOT used (instant scan enabled)

2. **`startSignificantChangeDetector()`** - Continuous post-scan monitoring
   - Config: `{childList: true, subtree: true, attributes: false, characterData: false}`
   - Triggers scan when >15 mutations in 200ms + 2s since last

3. **`initializeDOMChangeDetection()`** - Real-time change monitoring
   - Config: `{childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-*', 'aria-*'], characterData: true}`
   - Notifies service worker of significant changes
   - Does NOT trigger rescans (service worker controls rescans)

4. **`pageIdleMonitor` MutationObserver** - Tracks DOM changes for idle detection
   - Config: `{childList: true, subtree: true, attributes: true, characterData: true}`
   - Calls `markChange()` to reset idle timer

5. **`watchForAutocompleteDropdown()` MutationObserver** - Detects dropdown appearance
   - Config: `{childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-hidden', 'hidden', 'class', 'style']}`
   - Observes document.body to catch portals
   - Max wait: 5000ms

6. **`waitForElement()` MutationObserver** - Waits for specific element
   - Config: Not specified (uses default)
   - Resolves when element appears

7. **URL change observer** - Detects SPA navigation
   - Observes: `document`
   - Config: `{subtree: true, childList: true, attributes: true, attributeFilter: ['href']}`

8. **Dynamic iframe observer** - Catches iframes added after initial scan
   - Observes: `document.documentElement`
   - Config: `{childList: true, subtree: true}`

### IntersectionObserver Usage

**NOT CURRENTLY USED** - File uses MutationObserver for all DOM monitoring instead of IntersectionObserver.

### PerformanceObserver Usage

**`pageIdleMonitor` PerformanceObserver** - Tracks resource loading
- Config: `{entryTypes: ['resource']}`
- Calls `markChange()` on resource load events

---

## Testing Workflow

1. Start WebSocket server: `python om_e_web_ws/ws_server.py`
2. Load extension in Chrome (chrome://extensions/)
3. Navigate to target page
4. Verify console shows "scan complete"
5. Check artifacts: `ls -lh om_e_web_ws/@site_structures/`
6. Test action execution: `python3 om_e_web_ws/test_navigation.py --action-id a_id_42 --action-type click`
7. Test capability: `python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript`
8. Verify result in console and artifacts

---

## Common Gotchas

1. **Service worker suspension** → Open a regular web page (not chrome://) to maintain keep-alive port
2. **Capability not finding element** → Check page URL matches `url_pattern`, element exists in DOM, selectors match actual structure
3. **Config changes not taking effect** → Reload the tab to reinject content script
4. **Action ID not found** → Action IDs are ephemeral (regenerated on each scan). Must use current scan's IDs.
5. **Duplicate elements** → Use WeakSet to track registered elements, prevents duplicate IDs
6. **React input not updating** → Must dispatch input/change events, not just set value
7. **Click not working** → Use `universalClick()` with multiple strategies for React/SPA compatibility
8. **Scan during scan** → Scan lock prevents concurrent scans, check `scanInProgress` flag
9. **Iframe execution** → All message handlers check `window.top === window.self` to prevent iframe issues
10. **CSP violations** → Disconnect cycle may be needed (currently only used for specific sites via `performAutomaticDisconnectCycle()`)
11. **HUD not appearing** → Check Shadow DOM host element exists, verify initHUD() was called
12. **Orb position reset** → Position saved as percentages from right/bottom edges, survives window resize

---

## File Statistics

- **Total lines**: 11,045
- **Main components**: 9 (Scan, IntelligenceEngine, Capability Pipeline, Message Handlers, Element Discovery, HUD/Orb UI, Chat System, Iframe Support, Network Monitoring)
- **Message handlers**: 3 (main, execute_action, execute_capability)
- **Supported actions**: 8 (click, setValue, toggle, select, scroll, focus, submit, navigate)
- **Element types**: 8+ (input, button, link, checkbox, dropdown, slider, textarea, contenteditable)
- **Event listeners**: 6+ (load, hashchange, popstate, visibilitychange, focus, URL observer)
- **MutationObservers**: 8 (settle, significant change, DOM change, idle, autocomplete, wait element, URL change, dynamic iframe)
- **UI Components**: 3 (Floating Orb, HUD Overlay, Chat Panel)
- **Orb Themes**: 3 (kawaii, robot, atom)
- **Chat message types**: 9+ (ui_chat_user_message, ui_chat_append_ack, ui_chat_error, ui_chat_history, and 5 orb state messages)

---

## Related Files

- `/Users/andy7string/Projects/Om_E_Web/web_extension/sw.js` - Service worker (WebSocket bridge)
- `/Users/andy7string/Projects/Om_E_Web/web_extension/site_configs.json` - Site configuration index
- `/Users/andy7string/Projects/Om_E_Web/web_extension/site_configs/*.json` - Individual site configs
- `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/ws_server.py` - WebSocket server
- `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/test_navigation.py` - CLI test harness
- `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/@site_structures/` - Generated artifacts directory

---

## Additional Resources

- `THIS_IS_HOW_IT_ALL_WORKS.md` - Complete system architecture
- `web_extension/README.md` - Extension details
- `om_e_web_ws/HowThisWorks.md` - Artifact generation
- Chrome Extension MV3 docs: https://developer.chrome.com/docs/extensions/mv3/
- MutationObserver API: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
- IntersectionObserver API: https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver
