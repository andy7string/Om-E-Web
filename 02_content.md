# Content Script Documentation (content.js)

## Overview

The content script is the core intelligence engine of Om_E_Web. It runs in the context of web pages and implements:

1. **DOM scanning and element discovery** - Identifies interactive elements and semantic content
2. **Action registration** - Assigns unique IDs to clickable/fillable elements
3. **Intelligence extraction** - Generates structured JSONL artifacts for LLM consumption
4. **Command execution** - Handles clicks, input, scrolling, and navigation
5. **Capability pipeline** - Dynamic element discovery for lazy-loaded content
6. **Real-time monitoring** - Tracks DOM changes and network activity
7. **HUD/Orb UI system** - Floating orb interface with chat, prompt input, and theme customization
8. **Chat integration** - Real-time chat with LLM via WebSocket pipeline

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
4. **`toggle_hud`** → Toggle HUD overlay via `toggleHUD()`
5. **`set_orb_theme`** → Set orb theme via `setOrbTheme()`
6. **`apply_orb_theme`** → Apply theme from popup via `applyOrbTheme()`
7. **`get_orb_themes`** → Return available themes
8. **`get_orb_screen_position`** → Return orb position before zoom
9. **`set_orb_screen_position`** → Restore orb position after zoom via `restoreOrbScreenPosition()`
10. **`ui_chat_append_ack`** → Handle chat acknowledgement via `handleChatAck()`
11. **`ui_chat_error`** → Handle chat error via `handleChatError()`
12. **`ui_chat_history`** → Load chat history via `handleChatHistory()`
13. **Commands**:
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

- **Total lines**: ~14,125
- **Main components**: 7 (Scan, IntelligenceEngine, Capability Pipeline, Message Handlers, Element Discovery, HUD/Orb UI, Chat System)
- **Message handlers**: 6 (main, execute_action, execute_capability, HUD control, chat messages, orb state)
- **Supported actions**: 8 (click, setValue, toggle, select, scroll, focus, submit, navigate)
- **Element types**: 8 (input, button, link, checkbox, dropdown, slider, textarea, contenteditable)
- **Event listeners**: 6 (load, hashchange, popstate, visibilitychange, focus, URL observer)
- **UI Components**: 3 (Floating Orb, HUD Overlay, Chat Panel)
- **Orb Themes**: 3 (kawaii, robot, atom)
- **Chat message types**: 9 (ui_chat_user_message, ui_chat_append_ack, ui_chat_error, ui_chat_history, and 5 orb state messages)

---

## 19. HUD/Orb UI System

### Overview

The Om-E HUD system is a **Shadow DOM-based floating interface** that provides visual control and chat interaction directly in the browser. It consists of:

1. **Floating Orb** - Draggable interface anchor with theme-based avatars (kawaii, robot, atom)
2. **HUD Overlay** - Full-screen prompt interface with message history
3. **Chat Panel** - Resizable chat interface anchored to orb
4. **Theme System** - Three visual themes with distinct orb designs and colors
5. **Control Buttons** - Scroll, zoom, and HUD toggle controls

**Architecture**: Shadow DOM isolation prevents CSS conflicts with host page. All UI components render inside closed shadow root.

---

### HUD State Management

#### `hudState` Object
**Purpose**: Single source of truth for HUD/Orb UI state

**Properties**:
- `host` - Shadow DOM host element
- `shadow` - ShadowRoot instance
- `orb` - Floating orb element
- `hud` - Full-screen HUD overlay
- `chatPanel` - Chat panel element (anchored to orb)
- `visible` - HUD overlay visibility (boolean)
- `chatVisible` - Chat panel visibility (boolean)
- `dragging` - Orb drag state (boolean)
- `theme` - Current theme key ('kawaii', 'robot', 'atom')

**Persistence**: Theme, position, chat visibility, and chat input are persisted to service worker storage.

---

### Orb Themes (ORB_THEMES)

**Purpose**: Registry of visual themes for the floating orb

**Structure**:
```javascript
{
  themeName: {
    name: string,           // Display name
    color: string,          // Theme accent color (hex)
    earSelector: string,    // CSS selector for clickable ears/goggles
    svg: string,            // SVG markup for orb
    paws: string            // SVG markup for paws (shown when dragging)
  }
}
```

**Available Themes**:

1. **Kawaii** - Fluffy white kitty with cherry and sparkly blue eyes
   - Color: `#7ec8e3` (sparkly blue)
   - Ear selector: `.ome-ear`
   - Features: Pink inner ears, rosy blush, strawberry on top

2. **Robot (Om-E)** - Cute bot with goggles and glowing cyan eyes
   - Color: `#00e5ff` (cyan)
   - Ear selector: `.ome-goggle`
   - Features: Purple goggles, dome helmet, face plate with glowing eyes

3. **Atom** - Glowing orbital rings with purple nucleus
   - Color: `#ba93ff` (purple glow)
   - Ear selector: `.ome-atom-click`
   - Features: Three rotating orbital rings, spinning nucleus, pulsing glow

**CSS Animations**:
- Floating animation (ome-bunny-float) - 2s ease-in-out when idle
- Wiggle animation (ome-bunny-wiggle) - 0.3s when dragging
- Orbit pulse (ome-orbit-pulse) - 2.5s for atom theme
- Nucleus spin (ome-nucleus-spin) - 6s for atom theme

---

### Core Functions

#### `initHUD()`
**Purpose**: Initialize HUD system with Shadow DOM isolation

**Workflow**:
1. Creates host element (`#ome-hud-host`) with `data-ome-ignore` attribute
2. Attaches closed shadow root
3. Injects HUD styles via `injectHUDStyles()`
4. Creates orb via `createOrb()`
5. Creates HUD overlay via `createHUD()`
6. Requests saved state from service worker:
   - Theme (`response.theme`)
   - Position (`response.position`)
   - Zoom scale (`response.zoom`)
   - Chat visibility (`response.chatVisible`)
   - Chat input text (`response.chatInput`)
7. Attaches resize listener to clamp orb position

**Called by**:
- Auto-initialization on DOM load
- Message handler for `toggle_hud`, `set_orb_theme`, `apply_orb_theme`

**Sets up**: Complete HUD/Orb UI with all event handlers

---

#### `createOrb(shadow)`
**Purpose**: Create floating orb with drag, controls, and chat panel

**Returns**: HTMLElement (orb)

**Components created**:
1. **Orb body** - SVG from current theme
2. **Paws** - SVG shown when dragging (theme-specific)
3. **Scroll controls** - Up/down/left/right arrows + HUD toggle button
4. **Prompt button** - Opens chat panel
5. **Zoom controls** - +/Z/− buttons for zoom in/reset/out
6. **Chat panel** - Resizable chat interface with:
   - 8 resize handles (n, s, e, w, nw, ne, sw, se)
   - Message area (`.ome-chat-messages`)
   - Input field (`.ome-chat-input`)
   - Send button (`.ome-chat-send`)

**Event handlers**:
- **Orb click** - Toggle drag mode (follow cursor) / release
- **Ears/goggles click** - Same as orb click (theme-specific selectors)
- **Scroll buttons** - Call `scrollWithFeedback()` with boundary detection
- **HUD button** - Toggle HUD overlay via `toggleHUD()`
- **Zoom buttons** - Send capability messages to service worker
- **Prompt button** - Toggle chat panel via `toggleChatPanel()`
- **Chat send** - Add message to shared state, send via `sendChatMessage()`
- **Chat input** - Auto-save via `saveChatInput()`, restore on load
- **Enter key** - Send message (without shift)
- **Escape key** - Close chat panel

**Drag behavior**:
- Click orb → Start following cursor (use left/top during drag)
- Click again → Release and save position (convert to right/bottom percentages)
- Position persisted to service worker via `saveOrbPosition()`

**Called by**: `initHUD()`, theme switching

---

#### `createHUD(shadow)`
**Purpose**: Create full-screen HUD overlay with prompt interface

**Returns**: HTMLElement (hud)

**Components created**:
1. **Close button** - X button (top-right)
2. **Main container** (`.ome-hud-main`) - Centered layout with:
   - **Prompt box** (`.ome-hud-prompt`) - Message area + input + send button
   - **Orb display** (`.ome-hud-orb`) - Current theme SVG (clickable to exit)
   - **Exit button** - Text button to close HUD
   - **Scroll controls** - Up/down for scrolling message area

**Event handlers**:
- **Close button** - Toggle HUD via `toggleHUD()`
- **Escape key** - Close HUD
- **Orb click** - Exit HUD
- **Exit button** - Close HUD
- **Send button** - Add message to shared state, send via `sendChatMessage()`
- **Prompt input Enter** - Send message (without shift)
- **Scroll buttons** - Scroll message area (not page)
- **Event blocking** - Stops propagation of all pointer events to prevent page interaction

**Theme integration**:
- HUD overlay uses `data-theme` attribute to apply theme colors
- CSS custom property `--theme-color` used for borders/glows/buttons
- Orb display syncs with floating orb theme

**Called by**: `initHUD()`

---

#### `applyOrbTheme(themeName)`
**Purpose**: Swap orb SVG and update theme colors

**Parameters**: `themeName` - Key from ORB_THEMES ('kawaii', 'robot', 'atom')

**Workflow**:
1. Gets theme object from `ORB_THEMES[themeName]`
2. Rebuilds orb HTML with new SVG + controls
3. Updates HUD orb display via `updateHUDOrb()`
4. Re-attaches all event handlers (scroll, zoom, prompt, chat)
5. Restores chat panel state (visibility, input value, size)
6. Updates theme selector active state in HUD

**Called by**:
- `setOrbTheme()` (user-initiated theme change)
- `initHUD()` (restore saved theme on load)

**Re-attaches handlers for**:
- Scroll buttons (4 directions with boundary feedback)
- Zoom buttons (in/out/reset)
- Menu button (HUD toggle)
- Prompt button (chat panel toggle)
- Chat input/send (same pipeline as HUD)
- Resize handles (chat panel resizing)

---

#### `toggleHUD()`
**Purpose**: Show/hide full-screen HUD overlay

**Workflow**:
1. Toggle `hudState.visible` boolean
2. Add/remove `.visible` class from HUD element
3. If opening → call `renderChatMessages()` to sync from shared state
4. Log visibility change

**Called by**:
- Orb menu button click
- HUD close button click
- HUD orb click
- HUD exit button click
- Escape key (when HUD visible)
- Message handler for `toggle_hud` command

**No persistence**: HUD visibility resets on navigation (by design)

---

#### `toggleChatPanel()`
**Purpose**: Show/hide chat panel (anchored to orb)

**Workflow**:
1. Toggle `hudState.chatVisible` boolean
2. Add/remove `.visible` class from chat panel element
3. Toggle `.active` class on prompt button
4. If opening → focus input, call `renderChatMessages()`
5. Persist visibility to service worker via `set_orb_state` message
6. Log visibility change

**Called by**:
- Prompt button click (on orb)
- Escape key (when chat visible)

**Persisted**: Chat panel visibility survives page navigation

---

### Chat System

#### Chat State (`chatState`)
**Purpose**: Single source of truth for chat messages (shared between HUD and orb)

**Properties**:
- `currentChatId` - Active chat ID (from server)
- `lastAck` - Last acknowledgement from server
- `messages[]` - Array of message objects:
  ```javascript
  {
    id: string,           // Message ID or local_<timestamp>
    role: string,         // 'user' | 'assistant' | 'error'
    content: string,      // Message text
    timestamp: string     // ISO timestamp
  }
  ```

**Shared rendering**: Both HUD prompt box and orb chat panel render from this array

---

#### `renderChatMessages()`
**Purpose**: Render all messages to both UIs from shared state

**Workflow**:
1. Clears `.ome-chat-messages` (orb chat panel)
2. Clears `.ome-hud-prompt-messages` (HUD prompt box)
3. Creates message bubbles for each message in `chatState.messages[]`
4. Appends to both containers
5. Auto-scrolls both to bottom
6. Logs render count

**Called by**:
- `toggleHUD()` - When opening HUD
- `toggleChatPanel()` - When opening chat panel
- `addChatMessage()` - After adding new message
- `handleChatHistory()` - After loading from server

**Message classes**:
- `.ome-chat-bubble.user` (orb) / `.ome-hud-message.user` (HUD) - User messages
- `.ome-chat-bubble.assistant` (orb) / `.ome-hud-message.assistant` (HUD) - LLM responses
- `.ome-chat-bubble.error` (orb) / `.ome-hud-message.error` (HUD) - Error messages

---

#### `addChatMessage(role, content, id)`
**Purpose**: Add message to shared state and render to both UIs

**Parameters**:
- `role` - 'user', 'assistant', or 'error'
- `content` - Message text
- `id` - Optional server message ID (defaults to `local_<timestamp>`)

**Workflow**:
1. Pushes message object to `chatState.messages[]`
2. Calls `renderChatMessages()` to update both UIs
3. Auto-scrolls to show new message

**Called by**:
- Send button handlers (both HUD and orb)
- Error handlers (on send failure)
- `handleChatHistory()` (not used - replaces array directly)

---

#### `sendChatMessage(prompt, chatId, meta)`
**Purpose**: Send user message through WebSocket pipeline

**Parameters**:
- `prompt` - User's message text
- `chatId` - Existing chat ID or null for new chat (uses `chatState.currentChatId` if null)
- `meta` - Optional metadata:
  - `page_url` (defaults to `window.location.href`)
  - `page_title` (defaults to `document.title`)
  - `front_end_context` (defaults to `{}`)

**Returns**: Promise resolving to server response

**Message structure sent to service worker**:
```javascript
{
  type: 'ui_chat_user_message',
  chat_id: string | null,
  data: {
    prompt: string,
    page_url: string,
    page_title: string,
    front_end_context: {}
  }
}
```

**Workflow**:
1. Builds message with type `ui_chat_user_message`
2. Includes chat_id (or null for new chat)
3. Includes page context (URL, title)
4. Sends via `chrome.runtime.sendMessage()`
5. Returns promise (resolves with response, rejects on error)

**Called by**:
- HUD send button handler
- Orb chat send button handler
- Console testing via `window.omeSendChat()`

**Service worker forwards to**: `ws_server.py` via WebSocket

---

#### Message Handlers

##### `handleChatAck(data)`
**Purpose**: Process successful message append acknowledgement from server

**Parameters**: `data` - Object with:
- `chat_id` - Chat ID from server
- `message` - Message object that was appended:
  - `id` - Server-assigned message ID
  - `role` - 'user' or 'assistant'
  - `content` - Message text
  - `timestamp` - ISO timestamp

**Workflow**:
1. Stores `data.chat_id` in `chatState.currentChatId`
2. Stores full ack in `chatState.lastAck`
3. Logs message append confirmation

**Called by**: Message listener for `ui_chat_append_ack` (from service worker)

**Future**: Will update UI with acknowledgement status

---

##### `handleChatError(data)`
**Purpose**: Handle chat error from server

**Parameters**: `data` - Error object from server

**Workflow**:
1. Logs error to console

**Called by**: Message listener for `ui_chat_error` (from service worker)

**Future**: Will display error in UI

---

##### `handleChatHistory(data)`
**Purpose**: Load chat history from server and populate UIs

**Parameters**: `data` - Object with:
- `chat_id` - Chat ID
- `messages[]` - Array of message objects

**Workflow**:
1. Updates `chatState.currentChatId`
2. Replaces `chatState.messages[]` with server data
3. Calls `renderChatMessages()` to update both UIs
4. Logs loaded message count

**Called by**: Message listener for `ui_chat_history` (from service worker)

**Triggered by**: Page load (service worker requests history on navigation)

---

#### `loadChatHistory(chatId)`
**Purpose**: Request chat history from server

**Parameters**: `chatId` - Chat ID to load (or null for empty state, uses `chatState.currentChatId` if null)

**Workflow**:
1. Sends `ui_get_chat_history` message to service worker
2. Service worker forwards to ws_server.py
3. Server responds with `ui_chat_history` message (handled by `handleChatHistory()`)

**Called by**: Manual calls only (not currently auto-invoked)

**Note**: Service worker automatically requests history on tab navigation

---

### Persistence & State Management

#### Orb State Persistence
**Persisted via service worker**:
- `theme` - Current theme key
- `position` - `{rightPct, bottomPct}` percentages
- `chatVisible` - Chat panel visibility boolean
- `chatInput` - Current input text (auto-saved on input)
- `chatPanelSize` - `{width, height}` in pixels
- `zoom` - Current zoom level (for inverse scaling)

**Messages**:
- `set_orb_state` - Save state to service worker
- `get_orb_state` - Retrieve saved state (on init)

#### Position Management

**Format**: Percentage-based positioning from **right** and **bottom** edges

**Why percentages?**:
- Viewport-independent (survives window resize)
- Consistent across zoom levels
- Matches CSS positioning (orb uses `right` and `bottom` properties)

**Coordinate systems**:
1. **During drag** - Uses `left`/`top` pixels for smooth cursor tracking
2. **After release** - Converts to `right`/`bottom` percentages for persistence
3. **On restore** - Applies percentages directly

**Functions**:
- `saveOrbPosition(rightPct, bottomPct)` - Persist to service worker
- `applyOrbPosition(position)` - Restore from saved state (handles legacy formats)
- `clampOrbToViewport()` - Keep orb visible on resize (1%-90% range)
- `restoreOrbScreenPosition(rightPct, bottomPct)` - Restore after zoom

**Legacy format handling**:
- Old format: `{left, top}` or `{right, bottom}` in pixels
- Auto-converts to percentage format on load

---

#### Zoom Management

**Purpose**: Keep orb same visual size when page zoom changes

**Approach**: Apply inverse CSS scale transform

**Functions**:
- `applyOrbZoomScale(zoomLevel)` - Sets CSS custom property `--ome-zoom-scale`
- `restoreOrbScreenPosition()` - Repositions after zoom

**CSS custom property**:
```css
.ome-orb {
  --ome-zoom-scale: 1;
  transform: translateX(-50%) scale(var(--ome-zoom-scale, 1));
}
```

**Scale calculation**:
- At 100% zoom → scale = 1.0
- At 150% zoom → scale = 0.667 (1 / 1.5)
- At 50% zoom → scale = 2.0 (1 / 0.5)
- Clamped to 0.5x - 2.0x range

**Triggered by**:
- Zoom capability execution (ZoomIn, ZoomOut, ZoomReset)
- Service worker sends `set_orb_screen_position` message after zoom

---

#### Chat Panel Resizing

**Resize handles**: 8 directional handles (n, s, e, w, nw, ne, sw, se)

**Setup**: `setupChatPanelResize(chatPanel)`

**Workflow**:
1. Attach mousedown listeners to resize handles
2. On drag → Calculate new width/height based on handle direction
3. Apply constraints:
   - Min: 200px width, 150px height
   - Max: 800px width, 80vh height
4. Update panel dimensions via inline styles
5. On release → Save dimensions via `saveChatPanelSize(width, height)`

**Restore**: `restoreChatPanelSize(chatPanel)`
- Retrieves saved size from service worker on init
- Applies as inline styles

**Edge behavior**:
- Panel anchored at **bottom-right** (relative to orb)
- East (e) handle: drag right = narrower
- North (n) handle: drag up = taller
- South (s) handle: drag down = shorter

---

### Control Buttons

#### Scroll Controls (Orb)
**Position**: Right side of orb, vertical stack

**Buttons**:
- **HUD** - Toggle HUD overlay
- **↑** - Scroll page up (80% viewport height)
- **↓** - Scroll page down (80% viewport height)

**Function**: `scrollWithFeedback(direction, button)`
- Scrolls smoothly with `window.scrollBy()`
- If at boundary → flashes button with `.ome-boundary` animation
- Directions: 'up', 'down', 'left', 'right'

---

#### Zoom Controls (Orb)
**Position**: Bottom of orb, horizontal row

**Buttons**:
- **+** - Zoom in (send `ZoomIn` capability)
- **Z** - Reset zoom (send `ZoomReset` capability)
- **−** - Zoom out (send `ZoomOut` capability)

**Handler**: Sends capability message to service worker:
```javascript
chrome.runtime.sendMessage({
  type: 'execute_capability',
  action: 'ZoomIn',
  params: {}
});
```

---

#### Prompt Button (Orb)
**Position**: Between orb and zoom controls

**Label**: "Prompt"

**Behavior**: Toggles chat panel via `toggleChatPanel()`

**Active state**: Purple glow when chat panel open (`.active` class)

---

### Styling & Shadow DOM

#### Shadow DOM Isolation
**Purpose**: Prevent CSS conflicts with host page

**Implementation**:
- Closed shadow root (cannot be accessed from outside)
- All styles scoped to shadow DOM
- No global CSS leakage

**Host element**:
```javascript
const host = document.createElement('div');
host.id = 'ome-hud-host';
host.setAttribute('data-ome-ignore', 'true');  // Ignored by DOM scanner
document.body.appendChild(host);
const shadow = host.attachShadow({ mode: 'closed' });
```

---

#### Theme Color System
**CSS Custom Properties**:
```css
.ome-hud {
  --theme-color: 147,112,219;  /* RGB values for rgba() */
  --theme-accent: #ba93ff;      /* Hex for direct use */
}
```

**Theme-specific values**:
- Kawaii: `--theme-color: 126,200,227` (sparkly blue)
- Robot: `--theme-color: 0,229,255` (cyan)
- Atom: `--theme-color: 147,112,219` (purple)

**Usage**:
```css
border: 1px solid rgba(var(--theme-color), 0.35);
background: rgba(var(--theme-color), 0.6);
color: var(--theme-accent);
```

---

#### Z-Index Layering
**Values**:
- HUD host: `2147483646` (second-highest possible)
- HUD overlay: `2147483645` (below host)
- Orb: Inherits from host (always on top)

**Rationale**: Ensures HUD/orb appear above all page content, including modals

---

### Message Integration

#### Messages Sent (Content → Service Worker)

1. **`set_orb_state`** - Persist orb state
   ```javascript
   {
     type: 'set_orb_state',
     theme?: string,
     position?: {rightPct, bottomPct},
     chatVisible?: boolean,
     chatInput?: string,
     chatPanelSize?: {width, height}
   }
   ```

2. **`get_orb_state`** - Retrieve saved state
   ```javascript
   { type: 'get_orb_state' }
   ```
   Response: `{ok: true, theme, position, chatVisible, chatInput, chatPanelSize, zoom}`

3. **`ui_chat_user_message`** - Send chat message
   ```javascript
   {
     type: 'ui_chat_user_message',
     chat_id: string | null,
     data: {
       prompt: string,
       page_url: string,
       page_title: string,
       front_end_context: {}
     }
   }
   ```

4. **`ui_get_chat_history`** - Request chat history
   ```javascript
   { type: 'ui_get_chat_history', chat_id: string | null }
   ```

5. **`execute_capability`** - Execute zoom capability
   ```javascript
   {
     type: 'execute_capability',
     action: 'ZoomIn' | 'ZoomOut' | 'ZoomReset',
     params: {}
   }
   ```

---

#### Messages Received (Service Worker → Content)

1. **`toggle_hud`** - Toggle HUD visibility
   ```javascript
   { type: 'toggle_hud' }
   ```
   Response: `{ok: true, visible: boolean}`

2. **`set_orb_theme`** - Set orb theme (from CLI/WebSocket)
   ```javascript
   { type: 'set_orb_theme', theme: string }
   ```
   Response: `{ok: true, theme: string, available: string[]}` or error

3. **`apply_orb_theme`** - Apply theme (from popup)
   ```javascript
   { type: 'apply_orb_theme', theme: string }
   ```
   Response: `{ok: true, theme: string}` or error

4. **`get_orb_themes`** - Get available themes
   ```javascript
   { type: 'get_orb_themes' }
   ```
   Response: `{ok: true, current: string, themes: Array<{key, name}>}`

5. **`ui_chat_append_ack`** - Chat message acknowledged
   ```javascript
   {
     type: 'ui_chat_append_ack',
     data: {chat_id, message: {id, role, content, timestamp}}
   }
   ```

6. **`ui_chat_error`** - Chat error
   ```javascript
   { type: 'ui_chat_error', data: {error details} }
   ```

7. **`ui_chat_history`** - Chat history response
   ```javascript
   {
     type: 'ui_chat_history',
     data: {chat_id, messages: Array<{id, role, content, timestamp}>}
   }
   ```

8. **`get_orb_screen_position`** - Get orb position before zoom
   ```javascript
   { type: 'get_orb_screen_position' }
   ```
   Response: `{ok: true, screenX: number, screenY: number}`

9. **`set_orb_screen_position`** - Restore orb position after zoom
   ```javascript
   {
     type: 'set_orb_screen_position',
     screenX: number,
     screenY: number,
     newZoom: number
   }
   ```

---

### Console Testing

#### Global Function
**Exposed**: `window.omeSendChat(prompt, chatId, meta)`

**Purpose**: Test chat pipeline from browser console

**Usage**:
```javascript
// Direct call in content script context (won't work - isolated world)
window.omeSendChat('Hello!');

// PostMessage bridge for page context testing
window.postMessage({
  type: 'ome_send_chat_test',
  prompt: 'Hello!',
  chatId: null,
  meta: {}
}, '*');

// Listen for result
window.addEventListener('message', (e) => {
  if (e.data?.type === 'ome_send_chat_result') {
    console.log('Result:', e.data.result || e.data.error);
  }
});
```

**Bridge**: Uses `postMessage` to cross isolated world boundary

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
