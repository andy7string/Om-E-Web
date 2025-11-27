# Content Script Documentation (content.js)

## Overview

The content script is the core intelligence engine of Om_E_Web. It runs in the context of web pages and implements:

1. **DOM scanning and element discovery** - Identifies interactive elements and semantic content
2. **Action registration** - Assigns unique IDs to clickable/fillable elements
3. **Intelligence extraction** - Generates structured JSONL artifacts for LLM consumption
4. **Command execution** - Handles clicks, input, scrolling, and navigation
5. **Capability pipeline** - Dynamic element discovery for lazy-loaded content
6. **Real-time monitoring** - Tracks DOM changes and network activity

**Key architectural principle**: Event-driven only. No timers except for debouncing. Uses MutationObserver, IntersectionObserver, and requestIdleCallback for all DOM monitoring.

---

## Architecture Overview

### Execution Pipelines

**1. Standard Action-ID Pipeline (95% of cases)**
```
Python → WebSocket → sw.js → content.js → executeAction()
Message: {type: "execute_action", data: {actionId: "a_id_123", actionType: "click"}}
```

**2. Capability Pipeline (dynamic content)**
```
Python → WebSocket → sw.js → content.js → capabilityPipelineExecutor()
Message: {type: "execute_capability", action: "RetrieveTranscript", params: {}}
```
Bypasses action-ID registry, uses selector-based DOM scanning for lazy-loaded elements.

**3. Scan Pipeline**
```
sw.js → content.js → executeScanWithSettle() → prepareIntelligenceData() → sw.js → ws_server.py
Message: {type: "start_scan", pageVersion: 1, trigger: "page_load"}
```

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
3. Calls `waitForDOMSettle()` to wait for page to stabilize
4. Calls `intelligenceEngine.prepareIntelligenceData()` to generate artifacts
5. Sends `scan_complete` message to service worker with intelligence data
6. Releases scan lock
7. Starts `startSignificantChangeDetector()` to watch for future changes

**Called by**: Message handler when receiving `start_scan` message from service worker

**Calls**:
- `waitForDOMSettle()`
- `intelligenceEngine.prepareIntelligenceData()`
- `chrome.runtime.sendMessage()` (to service worker)
- `startSignificantChangeDetector()`

---

#### `waitForDOMSettle({maxWait, quietWindow})`
**Purpose**: Waits for DOM to stop mutating before scanning
**Parameters**:
- `maxWait`: Maximum wait time (default: 5000ms)
- `quietWindow`: Duration of no mutations needed (default: 200ms)

**Returns**: Promise that resolves when DOM is settled

**How it works**:
1. Creates MutationObserver watching document.body
2. Resets quiet timer on each mutation
3. Resolves when no mutations for `quietWindow` ms
4. Max wait failsafe prevents infinite waiting

**Called by**: `executeScanWithSettle()`

---

#### `startSignificantChangeDetector()`
**Purpose**: Continuous DOM monitoring after scan completes
**Monitors**: Major DOM changes (childList mutations)

**Workflow**:
1. Creates MutationObserver watching document.body
2. Counts mutations in 200ms quiet window
3. If >15 mutations AND 2s since last trigger → sends `request_scan` to service worker
4. Service worker decides whether to rescan

**Called by**: `executeScanWithSettle()` (after scan completes)

**Sends**: `{type: 'request_scan', url, trigger: 'significant_dom_change'}` to service worker

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

---

#### `scheduleInitialScan(reason, options)`
**Purpose**: Schedules first scan after page loads

**Parameters**:
- `reason`: Why scan is scheduled (e.g., 'service_worker', 'fallback_timeout')
- `options.maxWait`: Max wait for idle (default: 12000ms)

**Workflow**:
1. Guards against duplicate scheduling
2. Waits for `document.readyState === 'complete'`
3. Calls `pageIdleMonitor.waitForIdle()`
4. Triggers `runScanAfterPageLoad()`

**Called by**:
- Message handler (when receiving `start_intelligence_scan` from service worker)
- Fallback timeout (4s after script load)

---

### 3. Site Configuration

#### `getSiteConfigDirect()`
**Purpose**: Synchronously loads site-specific configuration from extension files

**Returns**: Site config object or null

**Workflow**:
1. Loads `site_configs.json` (domain → config file mapping)
2. Matches current domain (exact match, then partial match, then default)
3. Loads specific config file (e.g., `site_configs/youtube.json`)
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
2. Scans categories in priority order: `['text_inputs', 'navigation', 'url_elements', 'buttons', 'menus', 'content_elements', 'hidden_content']`
3. Uses WeakSet to prevent duplicate scanning
4. Also scans `forceIncludeSelectors` (mission-critical controls)
5. Logs concise summary per category

**Called by**: `IntelligenceEngine` during element registration

**Prevents duplicates**: Uses WeakSet to track seen DOM elements

---

### 4. IntelligenceEngine (Core)

#### Constructor: `IntelligenceEngine()`
**Purpose**: Main intelligence processing engine

**State tracking**:
- `pageState` - Current view, interactive elements, content elements, URL, title
- `eventHistory` - History of DOM events
- `llmInsights` - Generated insights for LLM
- `actionableElements` - Map of actionId → descriptor object
- `actionableElementNodes` - Map of actionId → live DOM node (WeakMap for memory safety)
- `contentElements` - Map of contentId → descriptor
- `elementCounter` - Counter for generating unique IDs
- `registeredElements` - WeakSet to prevent duplicate IDs
- `elementToActionId` - WeakMap for reverse lookup (element → actionId)

**Scan lock**:
- `_scanInProgress` - Boolean flag to prevent concurrent scans

**Called by**: Script initialization

---

#### `IntelligenceEngine.prototype.prepareIntelligenceData()`
**Purpose**: Generates structured JSONL artifacts for LLM consumption

**Returns**: Object with intelligence data (page, sections, text, actions)

**Workflow**:
1. Calls `extractSemanticTextWithIds()` to get text content
2. Builds JSONL records:
   - **Meta record** - Page metadata (URL, title, framework, totals)
   - **Section records** - Logical page sections (main, nav, aside, etc.)
   - **Text records** - Semantic content (headings, paragraphs) with IDs
   - **Action records** - Interactive elements with action IDs
3. Orders records by DOM position (depth-first traversal)
4. Filters out duplicates and low-quality elements
5. Returns structured data for server to write to disk

**Called by**: `executeScanWithSettle()`

**Generates**: Data for `page.jsonl`, `content.jsonl`, `text.md`, `llm_actions.json`

---

#### `IntelligenceEngine.prototype.extractSemanticTextWithIds()`
**Purpose**: Extracts meaningful text content with unique IDs

**Returns**: Array of text records with `{id, type, content, element}`

**Workflow**:
1. Scans document for semantic elements:
   - Headings (h1-h6)
   - Paragraphs (p)
   - Lists (ul, ol)
   - Labels
2. Assigns sequential IDs: `t_id_0`, `t_id_1`, etc.
3. Filters out empty/whitespace-only content
4. Attaches live DOM element reference for later use

**Called by**: `prepareIntelligenceData()`

**Text ID format**: `t_id_<counter>` (simple sequential, no page versioning)

---

#### `IntelligenceEngine.prototype.registerActionableElement(element, actionType)`
**Purpose**: Assigns unique action ID to interactive element

**Parameters**:
- `element` - DOM element to register
- `actionType` - Type of action (click, setValue, toggle, etc.)

**Returns**: Action ID string (e.g., `a_id_42`)

**Workflow**:
1. Checks if element already registered (uses WeakSet for duplicate prevention)
2. Increments `elementCounter`
3. Generates action ID: `a_id_<counter>`
4. Builds descriptor object with:
   - tagName, attributes, selectors, textContent
   - actionType, urlContext (for links)
5. Stores in `actionableElements` Map (actionId → descriptor)
6. Stores in `actionableElementNodes` Map (actionId → live DOM node)
7. Marks element as registered in WeakSet

**Called by**:
- `registerInteractiveSubtree()` (during full scans)
- Direct calls for force-registration (e.g., transcript button)

**Action ID format**: `a_id_<counter>` (ephemeral, regenerated on each scan)

---

#### `IntelligenceEngine.prototype.executeAction(actionId, actionType, params)`
**Purpose**: Executes action on registered element

**Parameters**:
- `actionId` - Action ID (e.g., `a_id_42`)
- `actionType` - Action to perform (click, setValue, toggle, scroll, etc.)
- `params` - Action parameters (e.g., `{value: "search query"}`)

**Returns**: `{success: boolean, message: string, ...details}`

**Supported actions**:
- `click` - Clicks element (uses `universalClick()`)
- `setValue` - Sets input value + triggers events
- `toggle` - Toggles checkbox/switch
- `select` - Selects option from dropdown
- `scroll` - Scrolls element into view
- `focus` - Focuses element
- `submit` - Submits form (after setValue)

**Workflow** (setValue example):
1. Resolves element from `actionableElementNodes` Map
2. Validates element exists and is visible
3. Focuses element
4. Sets value (handles input, textarea, contenteditable)
5. Dispatches synthetic events (input, change)
6. If `params.submit` → submits form (Enter key or click button)
7. Waits for page to update
8. Triggers intelligence update (rescan)

**Called by**: Message handler when receiving `execute_action` from service worker

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

**Note**: DOM mutation rescans are disabled. Only explicit navigation events trigger rescans.

---

#### `IntelligenceEngine.prototype.isInteractiveElement(element)`
**Purpose**: Determines if element is interactive

**Returns**: Boolean

**Checks**:
- Tag name (button, a, input, select, textarea)
- Role attribute (button, link, textbox, etc.)
- Has onclick handler
- Has href attribute
- Is contenteditable
- Has tabindex

**Called by**: `registerInteractiveSubtree()`

---

#### `IntelligenceEngine.prototype.passesBasicQualityFilter(element)`
**Purpose**: Filters out low-quality elements

**Returns**: Boolean

**Rejects**:
- Hidden elements (display:none, visibility:hidden)
- Zero-size elements (width=0 or height=0)
- Elements with no meaningful attributes (no id, class, aria-label, etc.)
- Script/style/meta tags

**Called by**: `registerInteractiveSubtree()`

---

### 5. Element Discovery

#### `discoverLoginControls(options)`
**Purpose**: Heuristic-based login form detection

**Returns**: `{timestamp, total, matches: {login_email: [], login_password: [], login_submit: []}}`

**Workflow**:
1. **Exact selectors** (priority 100):
   - `input[name="email"]`, `input[type="email"]`, etc.
   - `input[type="password"]`
   - `button[type="submit"]`
2. **Attribute matching** (priority 80):
   - `type="email"`, `type="password"`, `autocomplete` values
3. **Keyword matching** (priority 60):
   - Searches placeholder, aria-label, name for keywords like "email", "password", "login"
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
- `rect` (bounding box)

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
7. CSS path (nth-of-type selectors up to 6 levels deep)
8. Generated selectors from `intelligenceEngine.generateElementSelectors()`

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

**Called by**: Message handler when receiving `execute_capability` from service worker

**Example**: YouTube transcript retrieval, ChatGPT prompt submission

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
- `clickType` - `'aggressive'` (default) or `'gentle'`

**Strategies** (tries all in sequence):
1. **Direct click** - `element.click()`
2. **Mouse events** - Dispatches mousedown + mouseup + click
3. **Pointer events** - Dispatches pointerdown + pointerup + click
4. **Touch events** - Dispatches touchstart + touchend + click
5. **Focus + Space** - Focuses element + dispatches Space keydown
6. **Focus + Enter** - Focuses element + dispatches Enter keydown

**Verifies click worked** by checking:
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
1. Calculates target scroll position (viewport-sized pages)
2. Executes smooth scroll via `window.scrollTo()`
3. Waits for scroll to complete with `waitForScrollEnd()`
4. Returns new position + boundary flags

**Called by**: Message handler when receiving `scroll` command

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

#### Main message listener: `chrome.runtime.onMessage.addListener()`
**Purpose**: Central communication hub - routes all messages from service worker

**Handled message types**:

1. **`start_intelligence_scan`** → Schedules initial scan via `scheduleInitialScan()`
2. **`start_scan`** → Executes scan via `executeScanWithSettle()`
3. **`execute_action`** → Handled by separate listener (see below)
4. **Commands**:
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

**Main frame safety check**: All handlers verify `window.top === window.self` to prevent iframe execution

---

#### Second message listener (execute_action)
**Purpose**: Handles LLM action execution separately

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
3. Gets element via `intelligenceEngine.getActionableElement(actionId)`
4. Executes via `intelligenceEngine.executeAction(actionId, actionType, params)`
5. Returns result to service worker

**Called by**: Service worker forwarding WebSocket messages from Python server

---

#### Third message listener (execute_capability)
**Purpose**: Handles capability pipeline execution

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

**Note**: DOM mutation rescans are **disabled**. Observer only logs changes for debugging.

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

**Sends**: `{type: "network_activity", eventType, url, status, timestamp}` via `chrome.runtime.sendMessage()`

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
- **contenteditable** (ProseMirror/Lexical) → Uses `document.execCommand('insertText')`
- **React inputs** → Dispatches synthetic events for state sync
- **Autofocus** → Applies focus on page load (configurable via `site_configs.json`)

**Registration**: `registerActionableElement(element, 'input')`

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

**Registration**: `registerActionableElement(element, 'click')`

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

**Registration**: `registerActionableElement(element, 'navigate')`

---

#### Checkboxes/Toggles
**Tags**: `input[type="checkbox"]`, `[role="checkbox"]`, `[role="switch"]`

**Actions**:
- `toggle` - Toggles checked state + dispatches change event
- `click` - Same as toggle

**State tracking**: Reads `checked` or `aria-checked` attribute

**Registration**: `registerActionableElement(element, 'toggle')`

---

#### Dropdowns
**Tags**: `select`, `[role="listbox"]`

**Actions**:
- `select` - Sets selected option by value/text
- `click` - Opens dropdown

**State tracking**: Reads `selectedIndex` and `options[]`

**Registration**: `registerActionableElement(element, 'select')`

---

#### Sliders/Range Inputs
**Tags**: `input[type="range"]`, `[role="slider"]`

**Actions**:
- `setValue` - Sets value + dispatches input/change events

**State tracking**: Reads `value`, `min`, `max`, `step` attributes

**Registration**: `registerActionableElement(element, 'input')`

---

### 12. Focus Management

#### `applyConfiguredFocus(reason)`
**Purpose**: Auto-focuses primary input on page load

**Workflow**:
1. Gets focus targets from `window.currentSiteConfig.focus_targets[]`
2. Tries each selector in order
3. Falls back to generic selectors: `input[type='search']`, `input[type='text']`, `textarea`
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
5. Dispatches input/change events
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

**Called by**:
- `passesBasicQualityFilter()`
- Element registration functions
- Visibility computation in `prepareIntelligenceData()`

**Special case**: YouTube guide drawer items are considered visible even when drawer is collapsed (uses `closest()` to detect guide items with meaningful labels)

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

#### `generateSelector(element)` (multiple implementations)
**Purpose**: Generates CSS selector for element

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

#### `IntelligenceEngine.prototype.extractHeadings()`
**Purpose**: Extracts all headings (h1-h6)

**Returns**: Array of `{level, text, selector}` objects

**Workflow**:
1. Queries `h1, h2, h3, h4, h5, h6`
2. Extracts level (1-6) from tag name
3. Generates selector for each
4. Filters out empty headings

**Called by**: `cmd_extractPageText()`

---

#### `IntelligenceEngine.prototype.extractParagraphs()`
**Purpose**: Extracts all paragraphs

**Returns**: Array of `{text, selector}` objects

**Workflow**:
1. Queries `p`
2. Generates selector for each
3. Extracts text content
4. Filters out empty paragraphs

**Called by**: `cmd_extractPageText()`

---

#### `IntelligenceEngine.prototype.extractLists()`
**Purpose**: Extracts all lists (ul, ol)

**Returns**: Array of `{type, items, selector, itemCount}` objects

**Workflow**:
1. Queries `ul, ol`
2. Extracts list type ('unordered' or 'ordered')
3. Extracts all `li` items
4. Generates selector for list
5. Returns with item count

**Called by**: `cmd_extractPageText()`

---

### 17. Utilities

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

### 18. Event-Triggered Updates

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

## Data Flow Summary

### Page Load → Initial Scan
```
1. content.js loads
2. Establishes keep-alive port (prevents service worker suspension)
3. Loads site config via getSiteConfigDirect()
4. Waits for service worker scan trigger OR 4s fallback timeout
5. scheduleInitialScan() → pageIdleMonitor.waitForIdle() → runScanAfterPageLoad()
6. Service worker sends start_scan message
7. executeScanWithSettle() → waitForDOMSettle() → prepareIntelligenceData()
8. Sends scan_complete with intelligence data to service worker
9. Service worker forwards to ws_server.py
10. ws_server.py writes page.jsonl, content.jsonl, text.md, llm_actions.json
11. startSignificantChangeDetector() begins watching for future changes
```

### LLM Action Execution
```
1. test_navigation.py sends {type: "llm_instruction", actionId, actionType, params} to ws_server.py
2. ws_server.py forwards to service worker via WebSocket
3. Service worker sends {type: "execute_action", data: {actionId, actionType, params}} to content.js
4. Content.js resolves element via intelligenceEngine.getActionableElement(actionId)
5. Executes action via intelligenceEngine.executeAction()
6. Action execution (click, setValue, etc.)
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
1. MutationObserver detects DOM changes
2. initializeDOMChangeDetection() callback → isSignificantChange()
3. If significant → notifyServiceWorkerOfChanges()
4. Service worker logs change (NO automatic rescan)
5. Real rescans only triggered by explicit navigation events:
   - webNavigation.onHistoryStateUpdated
   - webNavigation.onCompleted
   - tabs.onUpdated (complete status)
6. Service worker sends start_scan message
7. executeScanWithSettle() → ... (same as initial scan)
```

---

## Key Patterns

### Config Access Pattern (CRITICAL)
```javascript
// ✅ CORRECT: Use local siteConfig first, fallback to window
const activeConfig = siteConfig || window.currentSiteConfig;

// ❌ WRONG: Only check window
const config = window.currentSiteConfig;
```

Rationale: `siteConfig` is loaded synchronously at script start. `window.currentSiteConfig` may not be set yet in some contexts.

---

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

Prevents concurrent scans that would cause duplicate IDs and mixed data.

---

### Duplicate Prevention Pattern
```javascript
// Check if already registered
if (this.registeredElements.has(element)) {
    return existingId; // Skip duplicate
}

// Register element
const actionId = `a_id_${this.elementCounter++}`;
this.registeredElements.add(element);
this.elementToActionId.set(element, actionId);
```

Uses WeakSet for memory-safe duplicate tracking. WeakSet allows garbage collection when element is removed from DOM.

---

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

Required for async message handlers. `return true` keeps response channel open.

---

### React/SPA Event Pattern
```javascript
// Set value
element.value = newValue;

// Dispatch events (React listens for these)
element.dispatchEvent(new Event('input', {bubbles: true}));
element.dispatchEvent(new Event('change', {bubbles: true}));

// Wait for React state to update
await new Promise(r => setTimeout(r, 300));
```

React doesn't detect direct value changes. Must dispatch synthetic events.

---

### Fallback Timeout Pattern
```javascript
// Try primary approach
try {
    await primaryOperation({timeout: 5000});
} catch (error) {
    console.log('Primary failed, trying fallback...');
    await fallbackOperation();
}
```

Used throughout for robustness. Always have a fallback.

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
10. **CSP violations** → Disconnect cycle may be needed (currently only used for specific sites)

---

## Performance Considerations

1. **WeakSet/WeakMap usage** → Allows garbage collection, prevents memory leaks
2. **Scan lock** → Prevents redundant work, improves performance
3. **Idle detection** → Waits for page to settle before scanning, reduces wasted scans
4. **Mutation observer throttling** → 200ms quiet window prevents rapid rescans
5. **Selector caching** → Selectors generated once per element, reused for lookups
6. **DOM cloning** → Used in `cmd_getPageMarkdown()` to avoid modifying live page
7. **RequestIdleCallback** → Uses browser idle time for non-critical work
8. **Debouncing** → DOM changes debounced with 500ms grouping timeout
9. **Rate limiting** → Significant changes require 2s interval, prevents spam
10. **Lazy evaluation** → Capability pipeline only scans when needed, not on every page load

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

## File Size & Complexity

- **Total lines**: ~11,708
- **Main components**: 5 (Scan, IntelligenceEngine, Capability Pipeline, Message Handlers, Element Discovery)
- **Message handlers**: 3 (main, execute_action, execute_capability)
- **Supported actions**: 8 (click, setValue, toggle, select, scroll, focus, submit, navigate)
- **Element types**: 8 (input, button, link, checkbox, dropdown, slider, textarea, contenteditable)
- **Event listeners**: 6 (load, hashchange, popstate, visibilitychange, focus, URL observer)

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
