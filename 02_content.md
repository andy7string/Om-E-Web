# Content Script (content.js) - Function Documentation

## Overview

The content script (content.js) is the core DOM manipulation and intelligence engine for the Om_E_Web Chrome Extension. This 11,164-line file runs in the context of web pages and provides:

1. **DOM Intelligence Scanning** - Identifies and registers interactive elements with unique action IDs
2. **LLM Action Execution** - Executes commands from LLM/Python server (click, setValue, navigate)
3. **Real-time Change Detection** - Monitors DOM mutations and network activity
4. **Capability Pipeline** - Selector-based element discovery for dynamic content
5. **Content Extraction** - Crawl4AI-inspired markdown/text generation
6. **Page Idle Detection** - Waits for DOM/network settle before scanning

**Key Architecture:**
- **IntelligenceEngine class** - Main scanning and element registration engine
- **Event-driven design** - No timers, uses MutationObserver, IntersectionObserver, idle callbacks
- **Site-config driven** - Behavior controlled by `site_configs.json`
- **Main frame only** - Exits early if running in iframe

---

## Architecture

### File Organization

```
Lines 1-530: Initialization & Idle Detection
Lines 530-1200: Focus Management & Site Config Loading
Lines 1200-1720: DOM Change Detection & Network Monitoring
Lines 1720-2600: Command Handlers & Message Routing
Lines 2600-4980: Navigation & Site Map Generation
Lines 4980-5200: IntelligenceEngine Class Definition
Lines 5200-7180: IntelligenceEngine Methods (Event Processing)
Lines 7180-8400: IntelligenceEngine Methods (Element Management)
Lines 8400-9680: IntelligenceEngine Methods (Action Execution)
Lines 9680-10370: IntelligenceEngine Methods (YouTube & Content)
Lines 10370-10800: Capability Pipeline & Engine Initialization
Lines 10800-11164: Utility Functions
```

### Main Components

1. **Intelligence Engine** - IntelligenceEngine class with 60+ prototype methods
2. **Scan Orchestration** - executeScanWithSettle, waitForDOMSettle, startSignificantChangeDetector
3. **Page Idle Monitor** - Module for detecting DOM/network quiet periods
4. **Message Handler** - chrome.runtime.onMessage listener routing 30+ commands
5. **Capability Pipeline** - capabilityPipelineExecutor for selector-based discovery
6. **Focus System** - Auto-focus on text inputs using site config

---

## Function Catalog

### Core Initialization Functions

#### ensureKeepAlivePortConnection (Line 46)
**Purpose:** Establishes persistent keep-alive port to prevent service worker suspension
**Parameters:** None
**Returns:** Void
**Called by:** Immediate execution (line 68)
**Calls:** chrome.runtime.connect()
**Description:** Creates a `ome_keep_alive` port connection to service worker. If disconnected, retries after 500ms. Critical for maintaining WebSocket connection.

#### executeScanWithSettle (Line 86)
**Purpose:** Main scan function - executes scan after DOM settles
**Parameters:**
- `pageVersion` (number|null) - Page version (deprecated, always null)
- `url` (string) - Current page URL
- `trigger` (string) - What triggered scan (e.g., 'navigation', 'mutation')
**Returns:** Promise<void>
**Called by:** Message handler (line 2199), runScanAfterPageLoad (indirectly via SW)
**Calls:** waitForDOMSettle(), intelligenceEngine.prepareIntelligenceData(), chrome.runtime.sendMessage()
**Description:**
1. Checks scan lock to prevent concurrent scans
2. Waits for DOM to settle (5s max, 200ms quiet window)
3. Prepares intelligence data via engine
4. Sends scan_complete message to service worker
5. Starts significant change detector after completion

#### waitForDOMSettle (Line 183)
**Purpose:** Waits for DOM mutations to stop before resolving
**Parameters:**
- `maxWait` (number) - Maximum wait time in ms (default 5000)
- `quietWindow` (number) - Quiet period required in ms (default 200)
**Returns:** Promise<void>
**Called by:** executeScanWithSettle (line 130)
**Calls:** MutationObserver.observe()
**Description:** Uses MutationObserver to detect when DOM stops changing for quietWindow ms. Has failsafe maxWait timeout.

#### startSignificantChangeDetector (Line 246)
**Purpose:** Continuous observer for major DOM changes post-scan
**Parameters:** None
**Returns:** Void
**Called by:** executeScanWithSettle (line 174)
**Calls:** MutationObserver.observe(), chrome.runtime.sendMessage()
**Description:** Watches DOM continuously. When >20 mutations occur and DOM is quiet for 200ms, triggers request_scan message to SW. Rate limited to 1 scan per 2 seconds.

---

### Page Idle Monitor Module (Lines 303-530)

Self-contained IIFE module that wraps fetch/XHR and monitors DOM/network activity.

#### pageIdleMonitor.waitForIdle (Line 488)
**Purpose:** Returns promise that resolves when page is idle
**Parameters:**
- `maxWait` (number) - Max wait time in ms (default 15000)
- `quietWindow` (number) - Quiet period in ms (default 200)
**Returns:** Promise<void>
**Called by:** scheduleInitialScan (line 545), scanWhenPageSettles (line 574)
**Calls:** MutationObserver, PerformanceObserver, wrapFetch(), wrapXmlHttpRequest()
**Description:** Wraps fetch/XHR to track in-flight requests. Monitors DOM mutations and resource loading. Resolves when no activity for quietWindow ms.

#### wrappedFetch (Line 374)
**Purpose:** Wrapper for window.fetch to track network activity
**Parameters:** ...args (original fetch arguments)
**Returns:** Promise (original fetch result)
**Called by:** Automatic replacement of window.fetch
**Calls:** notifyNetworkActivity(), originalFetch()
**Description:** Increments inflightRequests counter, notifies webserver of fetch_start/fetch_end events.

#### wrappedSend (Line 427)
**Purpose:** Wrapper for XMLHttpRequest.send to track XHR activity
**Parameters:** ...args (original send arguments)
**Returns:** Original send result
**Called by:** Automatic replacement of XMLHttpRequest.prototype.send
**Calls:** notifyNetworkActivity(), originalSend()
**Description:** Increments inflightRequests counter, notifies webserver of xhr_start/xhr_end events.

---

### Initial Scan Functions

#### scheduleInitialScan (Line 532)
**Purpose:** Schedules initial page scan with idle detection
**Parameters:**
- `reason` (string) - Why scan is being scheduled
- `options` (object) - { maxWait: 12000 }
**Returns:** Void
**Called by:** Message handler (line 2181), fallback timeout (line 565)
**Calls:** pageIdleMonitor.waitForIdle(), runScanAfterPageLoad()
**Description:** Guards against duplicate scheduling. Waits for page load + idle before running scan.

#### runScanAfterPageLoad (Line 1515)
**Purpose:** Executes scan after page fully loaded
**Parameters:** None
**Returns:** Void
**Called by:** scheduleInitialScan (line 549)
**Calls:** recreateIntelligenceEngine(), performAutomaticDisconnectCycle(), chrome.runtime.sendMessage()
**Description:** Recreates intelligence engine for fresh start, performs CSP bypass disconnect cycle, sends request_scan to SW.

#### scanWhenPageSettles (Line 570)
**Purpose:** Helper to wait for page settle before running callback
**Parameters:**
- `scanFn` (function) - Callback to run when idle
- `options` (object) - { maxWait, quietWindow }
**Returns:** Void
**Called by:** Not currently used (potential orphan)
**Calls:** pageIdleMonitor.waitForIdle()
**Description:** Waits for browser idle then executes scanFn callback.

---

### Focus Management Functions

#### applyConfiguredFocus (Line 588)
**Purpose:** Auto-focus on text inputs using site config selectors
**Parameters:**
- `reason` (string) - Why focus is being applied (default 'post_scan')
**Returns:** Boolean - True if focus applied successfully
**Called by:** IntelligenceEngine.scanAndRegisterPageElements (line 10368), scheduleFocusRetry (line 702)
**Calls:** isElementFocusable(), focusElement(), scheduleFocusRetry()
**Description:** Tries site config focus_targets first, falls back to generic input selectors. Guards against duplicate focus.

#### focusElement (Line 646)
**Purpose:** Attempts to focus element and simulate user input
**Parameters:**
- `element` (Element) - DOM element to focus
- `reason` (string) - Reason for focus
**Returns:** Boolean - True if focus succeeded
**Called by:** applyConfiguredFocus (line 631)
**Calls:** element.focus(), simulateUserInput()
**Description:** Tries preventScroll focus first, falls back to regular focus. Dispatches mousemove event to simulate cursor.

#### scheduleFocusRetry (Line 695)
**Purpose:** Schedules retry if initial focus fails
**Parameters:**
- `reason` (string) - Reason for retry
**Returns:** Void
**Called by:** applyConfiguredFocus (line 640)
**Calls:** setTimeout(), applyConfiguredFocus()
**Description:** Waits 600ms then retries focus. Only runs once.

#### isElementFocusable (Line 706)
**Purpose:** Checks if element can receive focus
**Parameters:**
- `element` (Element) - DOM element to check
**Returns:** Boolean
**Called by:** applyConfiguredFocus (line 627)
**Calls:** isElementVisible()
**Description:** Checks disabled state, aria-disabled, visibility, tabIndex, tag name, contenteditable.

#### simulateUserInput (Line 739)
**Purpose:** Dispatches input/change events to trigger React/frameworks
**Parameters:**
- `element` (Element) - Target element
**Returns:** Void
**Called by:** focusElement (line 690)
**Calls:** element.dispatchEvent()
**Description:** Fires InputEvent('input') and Event('change') to wake up form frameworks.

---

### Selector Generation Functions

#### cssEscape (Line 755)
**Purpose:** Escapes special characters in CSS selectors
**Parameters:**
- `value` (string) - Value to escape
**Returns:** String
**Called by:** computeCssPath (line 776), buildSelectorCandidates (lines 809-834)
**Calls:** window.CSS.escape() or manual escape
**Description:** Uses native CSS.escape if available, otherwise escapes quotes/backslashes.

#### computeCssPath (Line 763)
**Purpose:** Generates hierarchical CSS path for element
**Parameters:**
- `element` (Element) - DOM element
- `maxDepth` (number) - Max depth to traverse (default 5)
**Returns:** String|null - CSS selector path
**Called by:** buildSelectorCandidates (line 837)
**Calls:** cssEscape()
**Description:** Builds path from element to root using IDs or nth-of-type selectors. Stops at first ID found.

#### buildSelectorCandidates (Line 800)
**Purpose:** Builds prioritized list of selectors for element
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Array<string> - Deduplicated selectors
**Called by:** buildElementDescriptor (line 892)
**Calls:** cssEscape(), computeCssPath(), intelligenceEngine.generateElementSelectors()
**Description:** Priority: ID → data-testid → name → aria-label → placeholder → type → CSS path → engine selectors.

#### buildElementDescriptor (Line 864)
**Purpose:** Creates complete descriptor object for element
**Parameters:**
- `element` (Element) - DOM element
- `role` (string) - Semantic role (e.g., 'login_email')
**Returns:** Object - Element descriptor with selectors, attributes, visibility
**Called by:** discoverLoginControls (line 976)
**Calls:** buildSelectorCandidates(), isElementVisible()
**Description:** Extracts tag, selectors, attributes, text, visibility, bounding rect.

---

### Login Discovery Function

#### discoverLoginControls (Line 910)
**Purpose:** Discovers login form controls (email, password, submit)
**Parameters:**
- `options` (object) - { requireVisible: boolean }
**Returns:** Object - { timestamp, total, matches: { login_email: [], login_password: [], login_submit: [] } }
**Called by:** Message handler (line 2301)
**Calls:** buildElementDescriptor(), hasKeyword()
**Description:** Uses exact selectors, attributes, and keyword matching. Scores matches (selector: 100, attribute: 80, keyword: 60). Returns sorted results.

#### hasKeyword (Line 1003)
**Purpose:** Checks if text contains any keyword from list
**Parameters:**
- `text` (string) - Text to search
- `keywords` (array) - Array of keywords
**Returns:** Boolean
**Called by:** discoverLoginControls (lines 1024-1045)
**Calls:** Array.some()
**Description:** Case-insensitive substring matching.

---

### Site Config Loading

#### getSiteConfigDirect (Line 1124)
**Purpose:** Synchronously loads site config from extension files
**Parameters:** None
**Returns:** Object|null - Site config or null
**Called by:** Immediate execution (line 1116)
**Calls:** XMLHttpRequest (synchronous), chrome.runtime.getURL()
**Description:**
1. Loads site_configs.json index
2. Finds config file path for current domain (exact → partial → default)
3. Loads specific config file
4. Sets globals: siteConfig, window.currentSiteConfig, window.currentFramework

---

### CSP Bypass Function

#### performAutomaticDisconnectCycle (Line 1200)
**Purpose:** Attempts CSP bypass by disconnecting runtime
**Parameters:** None
**Returns:** Array (empty, YouTube exempted)
**Called by:** runScanAfterPageLoad (line 1525)
**Calls:** chrome.runtime.disconnect(), chrome.storage.local.clear(), chrome.runtime.sendMessage()
**Description:** Forces runtime disconnect, clears storage, requests content script reinjection. Skipped for YouTube.

---

### Action Type Detection

#### hasUrl (Line 1258)
**Purpose:** Checks if element has URL in any form
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** determineActionType (line 1285, 1290)
**Calls:** element.getAttribute()
**Description:** Checks href, data-url, data-href, data-link attributes, and onclick handlers.

#### determineActionType (Line 1282)
**Purpose:** Infers action type from element properties
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String - Action type (navigate, click, input, submit, etc.)
**Called by:** scanWithFrameworkSelectors (not called), IntelligenceEngine.determineActionType (line 5949)
**Calls:** hasUrl()
**Description:** Priority: URL-based → tag-based → role-based → event-based → default 'interact'.

---

### Framework Selector Scanning

#### scanWithFrameworkSelectors (Line 1347)
**Purpose:** Scans page using site config selectors
**Parameters:** None
**Returns:** Array - Framework elements with type, selector, framework
**Called by:** IntelligenceEngine.scanAndRegisterPageElements (line 10112)
**Calls:** document.querySelectorAll(), inferForcedElementCategory(), testSelectorsAfterScan()
**Description:**
1. Uses priority order: text_inputs → navigation → url_elements → buttons → menus → content → hidden
2. Deduplicates using WeakSet
3. Force-includes mission-critical selectors
4. Returns array of { element, type, selector, framework }

#### inferForcedElementCategory (Line 1457)
**Purpose:** Infers category for force-included element
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String - Category name
**Called by:** scanWithFrameworkSelectors (line 1431)
**Calls:** None
**Description:** Maps tags/roles to categories (text_inputs, buttons, url_elements, force_include).

#### testSelectorsAfterScan (Line 1478)
**Purpose:** Validates selectors are finding elements (debugging)
**Parameters:** None
**Returns:** Void
**Called by:** scanWithFrameworkSelectors (line 1450)
**Calls:** document.querySelectorAll()
**Description:** Tests text_inputs and buttons selectors, finds all password inputs. Silent operation (no logging visible in code).

---

### DOM Change Detection

#### initializeDOMChangeDetection (Line 1551)
**Purpose:** Sets up MutationObserver for real-time DOM changes
**Parameters:** None
**Returns:** Void
**Called by:** enableDOMChangeDetection (line 1719), initializeIntelligenceSystem (likely)
**Calls:** MutationObserver.observe(), isSignificantChange(), notifyServiceWorkerOfChanges()
**Description:** Observes childList, attributes (class, style, data-*, aria-*), characterData on document.body. Filters insignificant changes.

#### notifyNetworkActivity (Line 1636)
**Purpose:** Sends network event to service worker
**Parameters:**
- `eventType` (string) - fetch_start, fetch_end, xhr_start, xhr_end
- `url` (string) - Request URL
- `status` (string|null) - success, error, abort, complete
**Returns:** Void
**Called by:** wrappedFetch (lines 380, 392), wrappedSend (lines 433, 445)
**Calls:** chrome.runtime.sendMessage()
**Description:** Non-critical, silently fails if chrome.runtime unavailable.

#### notifyServiceWorkerOfChanges (Line 1658)
**Purpose:** Sends DOM change notification to SW
**Parameters:**
- `changeInfo` (object) - { url, changeNumber, totalMutations, types, timestamp, isSignificant }
**Returns:** Void
**Called by:** initializeDOMChangeDetection (line 1599)
**Calls:** chrome.runtime.sendMessage()
**Description:** Sends dom_changed message. Handles extension context invalidation by retrying initializeIntelligenceSystem.

#### getDOMChangeStatus (Line 1691)
**Purpose:** Returns current change detection state
**Parameters:** None
**Returns:** Object - { enabled, changeCount, lastChangeTime, observerActive, url, timestamp }
**Called by:** Message handler (line 2321)
**Calls:** None
**Description:** Simple getter function.

#### disableDOMChangeDetection (Line 1705)
**Purpose:** Stops DOM change monitoring
**Parameters:** None
**Returns:** Void
**Called by:** Message handler (line 2356)
**Calls:** MutationObserver.disconnect()
**Description:** Disconnects observer and sets flag.

#### enableDOMChangeDetection (Line 1717)
**Purpose:** Restarts DOM change monitoring
**Parameters:** None
**Returns:** Void
**Called by:** Message handler (line 2328)
**Calls:** initializeDOMChangeDetection()
**Description:** Reinitializes or re-enables observer.

---

### Content Extraction Commands

#### visible (Line 1735)
**Purpose:** Arrow function to check element visibility
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** waitForSelector (line 1818)
**Calls:** getBoundingClientRect(), getComputedStyle()
**Description:** Checks width/height > 0, display !== 'none', visibility !== 'hidden'.

#### generateSelector (Line 1761)
**Purpose:** Generates CSS selector for element (Crawl4AI-inspired)
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String - CSS selector
**Called by:** cmd_getPageMarkdown (line 1970)
**Calls:** None
**Description:** Priority: ID → first class → nth-child path. Duplicate of IntelligenceEngine.generateSelector.

#### waitForSelector (Line 1813)
**Purpose:** Polls DOM until selector matches visible element
**Parameters:**
- `selector` (string) - CSS selector
- `timeoutMs` (number) - Max wait time (default 5000)
**Returns:** Promise<Element>
**Called by:** cmd_waitFor (line 1844), cmd_getText (line 1861), cmd_click (line 1879)
**Calls:** document.querySelector(), visible(), sleep()
**Description:** Polls every 60ms. Throws SELECTOR_NOT_FOUND error on timeout.

#### cmd_waitFor (Line 1842)
**Purpose:** Command handler for waiting for element
**Parameters:**
- `params` (object) - { selector, timeoutMs }
**Returns:** Promise<{ ok: true }>
**Called by:** Message handler (line 2227)
**Calls:** waitForSelector()
**Description:** Simple wrapper around waitForSelector.

#### cmd_getText (Line 1859)
**Purpose:** Command handler for extracting text
**Parameters:**
- `params` (object) - { selector }
**Returns:** Promise<{ text: string }>
**Called by:** Message handler (line 2233)
**Calls:** waitForSelector()
**Description:** Returns innerText or value from element.

#### cmd_click (Line 1877)
**Purpose:** Command handler for clicking element
**Parameters:**
- `params` (object) - { selector }
**Returns:** Promise<{ clicked: true }>
**Called by:** Message handler (line 2239)
**Calls:** waitForSelector(), element.scrollIntoView(), element.click()
**Description:** Scrolls element to center before clicking.

#### cmd_getPageMarkdown (Line 1906)
**Purpose:** Generates Crawl4AI-inspired markdown from page
**Parameters:** None
**Returns:** Promise<Object> - { url, title, markdown, headings, paragraphs, lists, links, processingTime, size, statistics }
**Called by:** Message handler (line 2247)
**Calls:** generateSelector(), document.cloneNode(), querySelectorAll()
**Description:**
1. Clones document (non-destructive)
2. Analyzes navigation/ads (NO REMOVAL)
3. Extracts headings with selectors
4. Filters paragraphs (min 20 chars, excludes cookie/privacy/subscribe text)
5. Extracts links
6. Builds structured markdown

#### cmd_extractPageText (Line 2066)
**Purpose:** Extracts structured text content
**Parameters:** None
**Returns:** Promise<Object> - { url, title, markdown, headings, paragraphs, lists, processingTime, size, statistics }
**Called by:** Message handler (line 2261)
**Calls:** Similar to cmd_getPageMarkdown
**Description:** Extracts headings, paragraphs, lists with hierarchy. Returns markdown + structured data.

---

### Message Handler (Lines 2169-2548)

Main chrome.runtime.onMessage listener routing all commands.

**Supported Commands:**
- start_intelligence_scan (line 2180)
- start_scan (line 2195)
- waitFor, getText, click (lines 2225-2241)
- getPageMarkdown, extractPageText (lines 2244-2270)
- getCurrentTabInfo, getNavigationContext (lines 2273-2286)
- searchActions, discoverLoginControls (lines 2288-2304)
- generateSiteMap (line 2306)
- getDOMChangeStatus, enable/disableDOMChangeDetection (lines 2317-2359)
- getElementCoordinatesByActionId (line 2335)
- navigateBack, navigateForward, jumpToHistoryEntry (lines 2372-2400)
- getHistoryState, searchHistory, clearHistory (lines 2402-2428)
- getIntelligenceStatus, getCurrentPageIntelligence (lines 2433-2461)
- getActionableElements (line 2465)
- executeAction, scanAndRegisterElements (lines 2479-2510)
- testIntelligenceSystem (line 2514)

**Called by:** Service worker (sw.js) forwarding commands
**Calls:** 60+ functions based on command type

---

### Page Info Functions

#### getCurrentTabInfo (Line 2563)
**Purpose:** Returns current page metadata
**Parameters:** None
**Returns:** Object - { url, title, hostname, pathname, search, hash, protocol, timestamp, readyState, userAgent, isInIframe, frameContext }
**Called by:** Message handler (line 2276)
**Calls:** None
**Description:** Main frame safety check. Returns comprehensive page info.

#### getNavigationContext (Line 2604)
**Purpose:** Returns navigation history context
**Parameters:** None
**Returns:** Object - Navigation state
**Called by:** Message handler (line 2283)
**Calls:** None
**Description:** Placeholder function (not fully implemented in snippet).

---

### Site Map Generation

#### generateSiteMap (Line 2639)
**Purpose:** Creates structured page representation
**Parameters:** None
**Returns:** Promise<Object> - Site map with breadcrumbs, pagination, navigation, links, content areas
**Called by:** Message handler (line 2308)
**Calls:** extractBreadcrumbs(), extractPagination(), extractNavigation(), extractRelatedLinks(), findMainContent(), findSidebar(), findFooter(), findAdvertisements(), inferPagePurpose(), generateNavigationPaths(), generateRecommendedActions()
**Description:** NON-DESTRUCTIVE analysis of page structure. Returns comprehensive site map.

#### getElementCoordinates (Line 3028)
**Purpose:** Returns element position and size
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Object - { x, y, width, height, top, left, bottom, right, centerX, centerY }
**Called by:** generateSiteMap (likely), coordsForNode (line 4223)
**Calls:** getBoundingClientRect()
**Description:** Returns absolute coordinates and center point.

#### resolveNodeFromActionId (Line 3050)
**Purpose:** Finds DOM node by action ID
**Parameters:**
- `actionId` (string) - Action ID (e.g., 'a_id_42')
**Returns:** Element|null
**Called by:** Message handler (line 2342)
**Calls:** intelligenceEngine.getStoredActionableNode(), intelligenceEngine.resolveActionableDomNode(), intelligenceEngine.getActionableElement()
**Description:** Tries stored node first, then resolves from descriptor, then gets element.

#### findVisibleElement (Line 3082)
**Purpose:** Finds visible ancestor of hidden element
**Parameters:**
- `element` (Element) - Starting element
**Returns:** Element|null
**Called by:** IntelligenceEngine.executeAction (line 8400+)
**Calls:** isElementVisible(), hasValidDimensions()
**Description:** Walks up DOM tree to find first visible ancestor.

#### hasValidDimensions (Line 3163)
**Purpose:** Checks if element has non-zero size
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** findVisibleElement (line 3082+)
**Calls:** getBoundingClientRect()
**Description:** Returns true if width/height > 0.

#### analyzeViewportPosition (Line 3288)
**Purpose:** Checks if element is positioned outside viewport
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Object - { isOutsideViewport, position, rect, viewport, reasons }
**Called by:** IntelligenceEngine.executeAction (line 8400+)
**Calls:** getBoundingClientRect(), getComputedStyle()
**Description:** Detects off-screen positioning (negative coords, beyond viewport).

#### fixViewportPositioning (Line 3392)
**Purpose:** Attempts to fix off-screen element positioning
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Object - { fixed, changes, element }
**Called by:** IntelligenceEngine.executeAction (line 8400+)
**Calls:** analyzeViewportPosition(), element.style modifications
**Description:** Temporarily modifies CSS (position, top, left, transform) to bring element into viewport.

#### forceElementVisibility (Line 3500)
**Purpose:** Overrides CSS hiding properties
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Object - { madeVisible, changes, element }
**Called by:** IntelligenceEngine.executeAction (line 8400+)
**Calls:** getComputedStyle(), element.style modifications
**Description:** Sets display: block, visibility: visible, opacity: 1, removes transforms.

#### universalClick (Line 3579)
**Purpose:** Bulletproof click using multiple strategies
**Parameters:**
- `element` (Element) - DOM element to click
**Returns:** Object - { clicked, strategy, verified, error }
**Called by:** IntelligenceEngine.executeAction (line 8400+)
**Calls:** analyzeViewportPosition(), fixViewportPositioning(), forceElementVisibility(), verifyClickWorked(), checkForDOMChanges(), inspectSubmenuContent()
**Description:**
1. Try standard click
2. Try dispatching MouseEvent
3. Try scrollIntoView + click
4. Try fixing viewport position
5. Try forcing visibility
6. Verifies click worked and checks for submenus

#### verifyClickWorked (Line 3715)
**Purpose:** Checks if click had expected effect
**Parameters:**
- `element` (Element) - Clicked element
**Returns:** Object - { verified, confidence, evidence }
**Called by:** universalClick (line 3579+)
**Calls:** getComputedStyle(), checkForDOMChanges()
**Description:** Looks for URL change, DOM changes, class changes, focus changes, visibility changes.

#### checkForDOMChanges (Line 3820)
**Purpose:** Detects DOM mutations after click
**Parameters:**
- `element` (Element) - Clicked element
**Returns:** Promise<Boolean>
**Called by:** universalClick (line 3579+), verifyClickWorked (line 3715+)
**Calls:** MutationObserver, setTimeout (150ms wait)
**Description:** Waits 150ms for mutations. Returns true if significant changes detected.

#### inspectSubmenuContent (Line 3850)
**Purpose:** Searches for submenu items after click
**Parameters:**
- `element` (Element) - Clicked element
**Returns:** Object - { hasSubmenu, submenuItems, submenuElement }
**Called by:** universalClick (line 3579+)
**Calls:** searchDocumentForMenuItems()
**Description:** Looks for role="menu", .menu, .dropdown, etc. near clicked element.

#### searchDocumentForMenuItems (Line 4070)
**Purpose:** Finds all menu-like items in document
**Parameters:**
- `element` (Element) - Reference element (unused in implementation)
**Returns:** Array<Element>
**Called by:** inspectSubmenuContent (line 3850+)
**Calls:** document.querySelectorAll()
**Description:** Queries for role="menuitem", role="option", [aria-label*="menu" i], .menu-item, etc.

#### isElementVisible (Line 4159)
**Purpose:** Comprehensive visibility check
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** Multiple functions (findVisibleElement, isElementFocusable, etc.)
**Calls:** getBoundingClientRect(), getComputedStyle()
**Description:** Checks display, visibility, opacity, dimensions, clip-path, pointer-events.

#### generateSelector (Line 4200)
**Purpose:** Generates CSS selector (duplicate implementation)
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String
**Called by:** Various functions
**Calls:** None
**Description:** Same logic as line 1761 version.

#### coordsForNode (Line 4223)
**Purpose:** Gets coordinates for action node
**Parameters:**
- `node` (Element) - DOM node
**Returns:** Object - { x, y, width, height, top, left, bottom, right, centerX, centerY }
**Called by:** Message handler (line 2347)
**Calls:** getElementCoordinates()
**Description:** Wrapper around getElementCoordinates.

---

### Site Map Helper Functions (Lines 4249-4644)

#### extractBreadcrumbs (Line 4249)
**Purpose:** Extracts breadcrumb navigation
**Parameters:**
- `document` (Document) - Document object
**Returns:** Array - Breadcrumb items
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelectorAll()
**Description:** Looks for nav[aria-label*="breadcrumb"], .breadcrumb, [role="navigation"].

#### extractPagination (Line 4292)
**Purpose:** Extracts pagination controls
**Parameters:**
- `document` (Document) - Document object
**Returns:** Object - { currentPage, totalPages, hasPrevious, hasNext, links }
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelectorAll()
**Description:** Finds .pagination, [role="navigation"] pagination, prev/next buttons.

#### extractNavigation (Line 4341)
**Purpose:** Extracts main navigation structure
**Parameters:**
- `document` (Document) - Document object
**Returns:** Array - Navigation sections
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelectorAll()
**Description:** Finds nav elements, role="navigation", .menu, .navbar.

#### extractRelatedLinks (Line 4384)
**Purpose:** Extracts contextual links
**Parameters:**
- `document` (Document) - Document object
**Returns:** Array - Related links
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelectorAll()
**Description:** Finds aside links, .related, .recommended sections.

#### findMainContent (Line 4425)
**Purpose:** Identifies main content area
**Parameters:**
- `document` (Document) - Document object
**Returns:** Object - Main content descriptor
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelector()
**Description:** Looks for main, [role="main"], article, #content.

#### findSidebar (Line 4455)
**Purpose:** Identifies sidebar area
**Parameters:**
- `document` (Document) - Document object
**Returns:** Object - Sidebar descriptor
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelector()
**Description:** Looks for aside, .sidebar, [role="complementary"].

#### findFooter (Line 4483)
**Purpose:** Identifies footer area
**Parameters:**
- `document` (Document) - Document object
**Returns:** Object - Footer descriptor
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelector()
**Description:** Looks for footer, [role="contentinfo"].

#### findAdvertisements (Line 4501)
**Purpose:** Identifies ad elements
**Parameters:**
- `document` (Document) - Document object
**Returns:** Array - Ad elements
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelectorAll()
**Description:** Finds .ad, .advertisement, [id*="ad"], [class*="ad"].

#### inferPagePurpose (Line 4533)
**Purpose:** Infers page type from content
**Parameters:**
- `document` (Document) - Document object
**Returns:** String - Page purpose (article, product, form, search, etc.)
**Called by:** generateSiteMap (line 2639+)
**Calls:** querySelector()
**Description:** Checks for article, form, product, search, login, profile, dashboard indicators.

#### generateNavigationPaths (Line 4558)
**Purpose:** Creates navigation path recommendations
**Parameters:**
- `navigationMap` (object) - Navigation structure
**Returns:** Array - Path recommendations
**Called by:** generateSiteMap (line 2639+)
**Calls:** None
**Description:** Analyzes navigation to suggest common paths.

#### generateRecommendedActions (Line 4588)
**Purpose:** Suggests next actions based on page
**Parameters:**
- `actionMap` (object) - Available actions
**Returns:** Array - Action recommendations
**Called by:** generateSiteMap (line 2639+)
**Calls:** None
**Description:** Recommends filling forms, clicking CTAs, searching, etc.

---

### History Management Functions (Lines 4645-4979)

#### initializeHistoryTracking (Line 4645)
**Purpose:** Sets up history tracking system
**Parameters:** None
**Returns:** Void
**Called by:** Initialization code
**Calls:** window.addEventListener(), handlePopState(), handleProgrammaticNavigation()
**Description:** Listens for popstate, wraps history.pushState/replaceState.

#### addToHistory (Line 4690)
**Purpose:** Adds entry to history log
**Parameters:**
- `url` (string) - Page URL
- `title` (string) - Page title
- `metadata` (object) - Additional data
**Returns:** Void
**Called by:** initializeHistoryTracking wrappers
**Calls:** None
**Description:** Pushes to window.omEWebHistory array, limits to 100 entries.

#### handlePopState (Line 4727)
**Purpose:** Handles browser back/forward
**Parameters:**
- `event` (Event) - Popstate event
**Returns:** Void
**Called by:** popstate event listener
**Calls:** addToHistory()
**Description:** Logs navigation from browser buttons.

#### handleProgrammaticNavigation (Line 4746)
**Purpose:** Logs pushState/replaceState calls
**Parameters:** None
**Returns:** Void
**Called by:** Wrapped history methods
**Calls:** addToHistory()
**Description:** Wraps history.pushState/replaceState to track SPA navigation.

#### navigateBack (Line 4775)
**Purpose:** Navigates back in history
**Parameters:**
- `steps` (number) - Number of steps (default 1)
**Returns:** Object - { success, steps, previousUrl, currentUrl }
**Called by:** Message handler (line 2376)
**Calls:** history.go()
**Description:** Uses history.go(-steps).

#### navigateForward (Line 4822)
**Purpose:** Navigates forward in history
**Parameters:**
- `steps` (number) - Number of steps (default 1)
**Returns:** Object - { success, steps, nextUrl, currentUrl }
**Called by:** Message handler (line 2384)
**Calls:** history.go()
**Description:** Uses history.go(steps).

#### jumpToHistoryEntry (Line 4869)
**Purpose:** Jumps to specific history index
**Parameters:**
- `index` (number) - Target index
**Returns:** Object - { success, targetIndex, currentUrl }
**Called by:** Message handler (line 2397)
**Calls:** history.go()
**Description:** Calculates delta from current index.

#### getHistoryState (Line 4916)
**Purpose:** Returns current history state
**Parameters:** None
**Returns:** Object - { currentIndex, totalEntries, canGoBack, canGoForward, currentUrl, history }
**Called by:** Message handler (line 2404)
**Calls:** None
**Description:** Returns navigation state and history array.

#### searchHistory (Line 4938)
**Purpose:** Searches history by criteria
**Parameters:**
- `criteria` (object) - { url, title, timeRange, limit }
**Returns:** Array - Matching entries
**Called by:** Message handler (line 2416)
**Calls:** Array.filter()
**Description:** Filters history by URL substring, title, timestamp.

#### clearHistory (Line 4979)
**Purpose:** Clears history entries
**Parameters:**
- `options` (object) - { before, after, urlPattern }
**Returns:** Object - { cleared, remaining }
**Called by:** Message handler (line 2426)
**Calls:** Array.filter()
**Description:** Clears entire history or selective entries.

---

## IntelligenceEngine Methods

The IntelligenceEngine is a class defined around line 4980-5195. It has 60+ prototype methods.

### Event Processing Methods

#### IntelligenceEngine.prototype.processEvent (Line 5195)
**Purpose:** Main event processor for DOM changes
**Parameters:**
- `event` (object) - Change event data
**Returns:** Void
**Called by:** Change aggregator
**Calls:** updatePageState(), analyzeStructureChanges(), queueIntelligenceUpdate()
**Description:** Routes events to analysis methods, queues intelligence updates.

#### IntelligenceEngine.prototype.updatePageState (Line 5212)
**Purpose:** Updates internal page state
**Parameters:**
- `event` (object) - Change event
**Returns:** Void
**Called by:** processEvent (line 5195+)
**Calls:** None
**Description:** Tracks page state changes (loading, interactive, complete).

#### IntelligenceEngine.prototype.analyzeStructureChanges (Line 5236)
**Purpose:** Analyzes DOM structure mutations
**Parameters:**
- `event` (object) - Mutation event
**Returns:** Void
**Called by:** processEvent (line 5195+)
**Calls:** None
**Description:** Detects significant structural changes.

#### IntelligenceEngine.prototype.queueFullRescan (Line 5258)
**Purpose:** Schedules full page rescan
**Parameters:**
- `reason` (string) - Why rescan is needed
**Returns:** Void
**Called by:** Disabled in current code (line 1588 comment)
**Calls:** chrome.runtime.sendMessage()
**Description:** Sends request_scan to service worker.

#### IntelligenceEngine.prototype.registerInteractiveSubtree (Line 5268)
**Purpose:** Registers all interactive elements in subtree
**Parameters:**
- `rootNode` (Element) - Root of subtree
**Returns:** Void
**Called by:** scanAndRegisterPageElements (line 10084+)
**Calls:** querySelectorAll(), registerActionableElement()
**Description:** Finds buttons, links, inputs in subtree and registers them.

#### IntelligenceEngine.prototype.isInteractiveElement (Line 5343)
**Purpose:** Checks if element is interactive
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** registerInteractiveSubtree (line 5268+)
**Calls:** None
**Description:** Checks tag name, role, onclick, tabindex, contenteditable.

#### IntelligenceEngine.prototype.passesBasicQualityFilter (Line 5442)
**Purpose:** Filters out low-quality elements
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** registerActionableElement (line 7799+)
**Calls:** isElementVisible()
**Description:** Checks visibility, dimensions, disabled state, aria-hidden.

---

### Text Extraction Methods

#### IntelligenceEngine.prototype.extractPageTextToMarkdown (Line 5491)
**Purpose:** Converts page to markdown
**Parameters:** None
**Returns:** String - Markdown text
**Called by:** prepareIntelligenceData (line 6206+)
**Calls:** extractHeadings(), extractParagraphs(), extractLists()
**Description:** Builds markdown from headings, paragraphs, lists.

#### IntelligenceEngine.prototype.extractCleanPageText (Line 5516)
**Purpose:** Extracts clean text without markup
**Parameters:** None
**Returns:** String - Plain text
**Called by:** prepareIntelligenceData (line 6206+)
**Calls:** extractHeadings(), extractParagraphs()
**Description:** Concatenates headings and paragraphs.

#### IntelligenceEngine.prototype.extractSemanticTextWithIds (Line 5549)
**Purpose:** Extracts text with action IDs embedded
**Parameters:** None
**Returns:** String - Text with IDs
**Called by:** prepareIntelligenceData (line 6206+)
**Calls:** buildNormalizedPageRecords()
**Description:** Builds text.md format with [a_id_X] markers.

#### IntelligenceEngine.prototype.generateSimpleSelector (Line 5805)
**Purpose:** Generates basic CSS selector
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String
**Called by:** extractHeadings, extractParagraphs, extractLists
**Calls:** None
**Description:** Returns ID, first class, or tag name.

#### IntelligenceEngine.prototype.extractHeadings (Line 5832)
**Purpose:** Extracts all heading elements
**Parameters:** None
**Returns:** Array - Heading objects
**Called by:** extractPageTextToMarkdown (line 5491+), extractCleanPageText (line 5516+)
**Calls:** querySelectorAll(), generateSimpleSelector()
**Description:** Finds h1-h6, returns { level, text, selector }.

#### IntelligenceEngine.prototype.extractParagraphs (Line 5853)
**Purpose:** Extracts all paragraph elements
**Parameters:** None
**Returns:** Array - Paragraph texts
**Called by:** extractPageTextToMarkdown (line 5491+), extractCleanPageText (line 5516+)
**Calls:** querySelectorAll()
**Description:** Finds p elements, filters out empty.

#### IntelligenceEngine.prototype.extractLists (Line 5873)
**Purpose:** Extracts all list elements
**Parameters:** None
**Returns:** Array - List objects
**Called by:** extractPageTextToMarkdown (line 5491+)
**Calls:** querySelectorAll()
**Description:** Finds ul/ol, returns { type, items, itemCount }.

#### IntelligenceEngine.prototype.isElementVisible (Line 5895)
**Purpose:** Visibility check (duplicate)
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** passesBasicQualityFilter (line 5442+)
**Calls:** getBoundingClientRect(), getComputedStyle()
**Description:** Same logic as standalone isElementVisible.

#### IntelligenceEngine.prototype.generateSelector (Line 5930)
**Purpose:** Selector generator (duplicate)
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String
**Called by:** Various methods
**Calls:** None
**Description:** Same logic as standalone generateSelector.

#### IntelligenceEngine.prototype.determineActionType (Line 5949)
**Purpose:** Infers action type (duplicate)
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String
**Called by:** registerActionableElement (line 7799+)
**Calls:** None
**Description:** Same logic as standalone determineActionType.

---

### State Analysis Methods

#### IntelligenceEngine.prototype.analyzeStateChanges (Line 5995)
**Purpose:** Analyzes element state changes
**Parameters:**
- `event` (object) - Change event
**Returns:** Object - State analysis
**Called by:** processEvent (line 5195+)
**Calls:** analyzeClassChanges()
**Description:** Detects class, attribute, style changes.

#### IntelligenceEngine.prototype.analyzeClassChanges (Line 6012)
**Purpose:** Analyzes CSS class changes
**Parameters:**
- `element` (Element) - Changed element
- `change` (object) - Change data
**Returns:** Object - Class analysis
**Called by:** analyzeStateChanges (line 5995+)
**Calls:** None
**Description:** Detects added/removed classes.

#### IntelligenceEngine.prototype.analyzeContentChanges (Line 6033)
**Purpose:** Analyzes text content changes
**Parameters:**
- `event` (object) - Change event
**Returns:** Object - Content analysis
**Called by:** processEvent (line 5195+)
**Calls:** None
**Description:** Tracks text mutations.

#### IntelligenceEngine.prototype.analyzeElementTransformation (Line 6044)
**Purpose:** Analyzes element visual changes
**Parameters:**
- `event` (object) - Change event
**Returns:** Object - Transformation analysis
**Called by:** processEvent (line 5195+)
**Calls:** None
**Description:** Detects visibility, position changes.

#### IntelligenceEngine.prototype.generateLLMInsights (Line 6051)
**Purpose:** Generates LLM-friendly insights
**Parameters:**
- `event` (object) - Change event
**Returns:** Object - LLM insights
**Called by:** processEvent (line 5195+)
**Calls:** generateActionableInsights(), generateRecommendations()
**Description:** Creates structured insights for LLM consumption.

#### IntelligenceEngine.prototype.generateActionableInsights (Line 6067)
**Purpose:** Generates action suggestions
**Parameters:**
- `event` (object) - Change event
**Returns:** Array - Action suggestions
**Called by:** generateLLMInsights (line 6051+)
**Calls:** getPageContext()
**Description:** Suggests next actions based on context.

#### IntelligenceEngine.prototype.getPageContext (Line 6095)
**Purpose:** Returns current page context
**Parameters:** None
**Returns:** Object - Page context
**Called by:** generateActionableInsights (line 6067+)
**Calls:** None
**Description:** Returns page state, URL, title, navigation state.

#### IntelligenceEngine.prototype.generateRecommendations (Line 6109)
**Purpose:** Generates action recommendations
**Parameters:**
- `event` (object) - Change event
**Returns:** Array - Recommendations
**Called by:** generateLLMInsights (line 6051+)
**Calls:** None
**Description:** Context-aware action recommendations.

---

### Intelligence Update Queue Methods

#### IntelligenceEngine.prototype.queueIntelligenceUpdate (Line 6134)
**Purpose:** Queues intelligence update for processing
**Parameters:**
- `priority` (string) - 'normal' or 'high'
**Returns:** Void
**Called by:** processEvent (line 5195+), various methods
**Calls:** processUpdateQueue()
**Description:** Debounces updates, processes queue asynchronously.

#### IntelligenceEngine.prototype.processUpdateQueue (Line 6160)
**Purpose:** Processes queued intelligence updates
**Parameters:** None
**Returns:** Promise<void>
**Called by:** queueIntelligenceUpdate (line 6134+)
**Calls:** prepareIntelligenceData(), sendIntelligenceUpdateToServiceWorker()
**Description:** Batches updates, sends to service worker.

#### IntelligenceEngine.prototype.prepareIntelligenceData (Line 6206)
**Purpose:** Prepares complete intelligence package
**Parameters:** None
**Returns:** Object - Intelligence data
**Called by:** executeScanWithSettle (line 148), processUpdateQueue (line 6160+)
**Calls:** buildNormalizedPageRecords(), extractCapabilities(), getActionableElementsSummary(), getContentElementsSummary()
**Description:** Builds complete data package for server: page records, capabilities, actionable elements, content elements.

#### IntelligenceEngine.prototype.extractCapabilities (Line 6243)
**Purpose:** Extracts site config capabilities
**Parameters:** None
**Returns:** Array - Capability objects
**Called by:** prepareIntelligenceData (line 6206+)
**Calls:** None
**Description:** Reads capabilities from window.currentSiteConfig, filters by URL pattern.

---

### Page Record Building

#### IntelligenceEngine.prototype.buildNormalizedPageRecords (Line 6295)
**Purpose:** MASSIVE 374-LINE FUNCTION - Builds normalized JSONL page records
**Parameters:**
- `options` (object) - { includeHidden: false }
**Returns:** Array - Normalized records
**Called by:** prepareIntelligenceData (line 6206+), extractSemanticTextWithIds (line 5549+)
**Calls:**
- Internal helper functions (lines 6669-7148):
  - isSectionCandidate (line 6669)
  - pickSectionLabel (line 6686)
  - buildSelectorPath (line 6703)
  - prettifyLabel (line 6723)
  - extractLabelFromAction (line 6730)
  - deriveActionTypes (line 6801)
  - deriveConfidenceScore (line 6847)
  - ensureSectionBucket (line 6861)
  - computeVisibility (line 6873)
  - computeDomPath (line 6907)
  - compareDomPaths (line 6919)
  - sumBuckets (line 6929)
  - normalizeTextContent (line 6939)
  - filterInteractiveRecords (line 6943)
  - filterContentRecords (line 7029)
  - isMeaningfulInteractiveSelector (line 7048)
  - pickPrimarySelector (line 7096)
  - normalizeAnchorKey (line 7108)
  - inferControlType (line 7114)
**Description:**
This is the core record-building function that transforms raw DOM elements into structured JSONL records for text.md and page.jsonl.

**Process:**
1. Extracts meta record (URL, title, viewport)
2. Groups actionable elements by visual sections
3. Processes content elements (text nodes)
4. Deduplicates records
5. Assigns sequential IDs
6. Returns ordered array: [meta, ...sections, ...content]

**WARNING:** This function violates the 100-line limit (374 lines). Should be refactored into smaller functions per CLAUDE.md standards.

---

### Intelligence Communication

#### IntelligenceEngine.prototype.sendIntelligenceUpdateToServiceWorker (Line 7152)
**Purpose:** Sends intelligence data to service worker
**Parameters:**
- `intelligenceData` (object) - Complete intelligence package
**Returns:** Promise<void>
**Called by:** processUpdateQueue (line 6160+)
**Calls:** chrome.runtime.sendMessage()
**Description:** Sends intelligence_update message type to SW.

#### IntelligenceEngine.prototype.isEngineReady (Line 7180)
**Purpose:** Checks if engine is ready
**Parameters:** None
**Returns:** Boolean
**Called by:** Various methods
**Calls:** None
**Description:** Returns true (placeholder implementation).

#### IntelligenceEngine.prototype.sleep (Line 7270)
**Purpose:** Async delay utility
**Parameters:**
- `ms` (number) - Milliseconds to sleep
**Returns:** Promise<void>
**Called by:** Various methods
**Calls:** setTimeout()
**Description:** Promise wrapper around setTimeout.

#### IntelligenceEngine.prototype.sendIntelligenceUpdate (Line 7277)
**Purpose:** Triggers intelligence update
**Parameters:** None
**Returns:** Void
**Called by:** Various methods
**Calls:** queueIntelligenceUpdate()
**Description:** Queues normal priority update.

---

### Summary Methods

#### IntelligenceEngine.prototype.getActionableElementsSummary (Line 7285)
**Purpose:** Returns summary of actionable elements
**Parameters:** None
**Returns:** Array - Element summaries
**Called by:** prepareIntelligenceData (line 6206+), message handler (line 2468)
**Calls:** Array.from(), this.actionableElements.values()
**Description:** Maps actionableElements to array of { actionId, actionType, label, selector }.

#### IntelligenceEngine.prototype.getContentElementsSummary (Line 7302)
**Purpose:** Returns summary of content elements
**Parameters:** None
**Returns:** Array - Content summaries
**Called by:** prepareIntelligenceData (line 6206+)
**Calls:** Array.from(), this.contentElements.values()
**Description:** Maps contentElements to array of { contentId, contentType, text, selector }.

#### IntelligenceEngine.prototype.generateActionMapping (Line 7319)
**Purpose:** Creates action ID to descriptor mapping
**Parameters:** None
**Returns:** Object - { actionId: descriptor }
**Called by:** message handler (line 2469)
**Calls:** None
**Description:** Converts actionableElements Map to plain object.

#### IntelligenceEngine.prototype.getAvailableActions (Line 7338)
**Purpose:** Filters actions by type
**Parameters:**
- `actionType` (string) - Type filter
**Returns:** Array - Matching actions
**Called by:** Unused
**Calls:** Array.from(), Array.filter()
**Description:** Filters actionableElements by actionType.

#### IntelligenceEngine.prototype.getCurrentRecommendations (Line 7356)
**Purpose:** Returns current action recommendations
**Parameters:** None
**Returns:** Array - Recommendations
**Called by:** message handler (lines 2440, 2456)
**Calls:** None
**Description:** Returns this.recommendations array.

---

### Engine Management

#### IntelligenceEngine.prototype.refreshPageIntelligenceWithRetry (Line 7378)
**Purpose:** Refreshes intelligence with retry logic
**Parameters:**
- `trigger` (string) - What triggered refresh (default 'manual')
- `maxRetries` (number) - Max retry attempts (default 3)
**Returns:** Promise<void>
**Called by:** Unused
**Calls:** chrome.runtime.sendMessage()
**Description:** Sends request_scan to SW with retry on failure.

#### IntelligenceEngine.prototype.isExtensionContextValid (Line 7408)
**Purpose:** Checks if extension context is valid
**Parameters:** None
**Returns:** Boolean
**Called by:** Various methods
**Calls:** chrome.runtime?.id check
**Description:** Returns true if chrome.runtime.id exists.

---

### Semantic Analysis

#### IntelligenceEngine.prototype.inferSemanticRole (Line 7430)
**Purpose:** LARGE 137-LINE FUNCTION - Infers semantic role from element
**Parameters:**
- `element` (Element) - DOM element
- `actionType` (string) - Action type (default 'general')
- `attributes` (object) - Additional attributes
**Returns:** String - Semantic role
**Called by:** registerActionableElement (line 7799+)
**Calls:** getCleanTextContent()
**Description:**
Analyzes element to determine semantic role (search_button, login_button, menu_item, etc.).

**Role detection priority:**
1. Explicit ARIA role
2. Button/link text patterns (login, search, submit, etc.)
3. Input types (email, password, search)
4. Tag names
5. Attributes (autocomplete, name, placeholder)

**WARNING:** 137 lines - exceeds 100-line limit.

#### IntelligenceEngine.prototype.getCleanTextContent (Line 7567)
**Purpose:** Extracts clean text from element
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String - Cleaned text
**Called by:** inferSemanticRole (line 7430+), registerActionableElement (line 7799+)
**Calls:** None
**Description:** Returns innerText or textContent, trimmed and collapsed whitespace.

---

### ID Generation

#### IntelligenceEngine.prototype.generateActionableId (Line 7618)
**Purpose:** Generates unique action ID for element
**Parameters:**
- `element` (Element) - DOM element
- `actionType` (string) - Action type (default 'general')
- `reuseId` (string|null) - Optional existing ID to reuse
**Returns:** String - Action ID (e.g., 'a_id_42')
**Called by:** registerActionableElement (line 7799+)
**Calls:** None
**Description:**
1. Checks if element already has a_id_X in dataset
2. Reuses existing ID if provided
3. Generates new ID: a_id_{counter++}
4. Stores ID in element.dataset.omeActionId

#### IntelligenceEngine.prototype.generateElementSelectors (Line 7678)
**Purpose:** Generates multiple selector strategies
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Array - Selector strings
**Called by:** buildSelectorCandidates (line 845)
**Calls:** generatePositionSelector(), extractKeyAttributes()
**Description:**
Priority: ID → data-testid → name+type → aria-label → placeholder → value → class → position.

#### IntelligenceEngine.prototype.generatePositionSelector (Line 7725)
**Purpose:** Generates nth-child position selector
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String - Position selector
**Called by:** generateElementSelectors (line 7678+)
**Calls:** None
**Description:** Builds tag:nth-child(n) selector.

#### IntelligenceEngine.prototype.extractKeyAttributes (Line 7745)
**Purpose:** Extracts important attributes from element
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Object - { id, name, type, placeholder, ariaLabel, dataTestId, value, autocomplete, role }
**Called by:** generateElementSelectors (line 7678+), registerActionableElement (line 7799+)
**Calls:** element.getAttribute()
**Description:** Extracts all automation-relevant attributes.

---

### Element Registration

#### IntelligenceEngine.prototype.registerActionableElement (Line 7799)
**Purpose:** LARGE 79-LINE FUNCTION - Registers interactive element
**Parameters:**
- `element` (Element) - DOM element
- `actionType` (string) - Action type (default 'general')
**Returns:** String|null - Action ID or null if filtered
**Called by:** scanWithFrameworkSelectors (via scanAndRegisterPageElements), registerInteractiveSubtree (line 5268+)
**Calls:** passesBasicQualityFilter(), determineActionType(), generateElementSelectors(), inferSemanticRole(), extractKeyAttributes(), getCleanTextContent(), generateActionableId(), storeActionableNode()
**Description:**
1. Filters low-quality elements
2. Determines action type
3. Generates selectors
4. Infers semantic role
5. Builds descriptor object
6. Generates/reuses action ID
7. Stores in actionableElements Map
8. Stores DOM reference

**WARNING:** 79 lines - should be under 100 but close to limit.

#### IntelligenceEngine.prototype.storeActionableNode (Line 7878)
**Purpose:** Stores DOM node reference
**Parameters:**
- `actionId` (string) - Action ID
- `node` (Element) - DOM node
**Returns:** Void
**Called by:** registerActionableElement (line 7799+)
**Calls:** WeakMap.set()
**Description:** Stores node in weakActionableNodes WeakMap for memory safety.

#### IntelligenceEngine.prototype.getStoredActionableNode (Line 7890)
**Purpose:** Retrieves stored DOM node
**Parameters:**
- `actionId` (string) - Action ID
**Returns:** Element|undefined
**Called by:** resolveNodeFromActionId (line 3050+), resolveActionableDomNode (line 7986+)
**Calls:** WeakMap.get()
**Description:** Returns node from weakActionableNodes WeakMap.

---

### Label Extraction

#### IntelligenceEngine.prototype._extractDescriptorLabel (Line 7903)
**Purpose:** Extracts label from descriptor object
**Parameters:**
- `descriptor` (object) - Element descriptor
**Returns:** String - Label text
**Called by:** _matchesActionDescriptor (line 7951+)
**Calls:** None
**Description:** Returns descriptor.label or descriptor.text or ''.

#### IntelligenceEngine.prototype._extractNodeLabel (Line 7929)
**Purpose:** Extracts label from DOM node
**Parameters:**
- `node` (Element) - DOM node
**Returns:** String - Label text
**Called by:** _matchesActionDescriptor (line 7951+)
**Calls:** None
**Description:** Returns innerText, textContent, value, aria-label, or ''.

#### IntelligenceEngine.prototype._matchesActionDescriptor (Line 7951)
**Purpose:** Checks if node matches descriptor
**Parameters:**
- `node` (Element) - DOM node
- `actionId` (string) - Action ID
- `descriptor` (object) - Element descriptor
**Returns:** Boolean
**Called by:** resolveActionableDomNode (line 7986+)
**Calls:** _extractDescriptorLabel(), _extractNodeLabel()
**Description:**
Matches by:
1. ome-action-id dataset attribute
2. Label text similarity
3. Selector match
Returns true if any match found.

---

### DOM Node Resolution

#### IntelligenceEngine.prototype.resolveActionableDomNode (Line 7986)
**Purpose:** LARGE 155-LINE FUNCTION - Resolves action ID to DOM node
**Parameters:**
- `actionId` (string) - Action ID
- `descriptor` (object) - Element descriptor
**Returns:** Element|null
**Called by:** resolveNodeFromActionId (line 3050+), executeAction (line 8374+)
**Calls:** getStoredActionableNode(), _matchesActionDescriptor(), document.querySelectorAll()
**Description:**
Resolution strategies:
1. Check weakActionableNodes WeakMap
2. Query by [data-ome-action-id]
3. Try selectors from descriptor
4. Try generic selectors by tag/role
5. Try loose text matching

**WARNING:** 155 lines - severely exceeds 100-line limit. MUST refactor.

---

### Element Getters

#### IntelligenceEngine.prototype.getActionableElement (Line 8141)
**Purpose:** Gets actionable element descriptor
**Parameters:**
- `actionId` (string) - Action ID
**Returns:** Object|null - Element descriptor
**Called by:** resolveNodeFromActionId (line 3050+), executeAction (line 8374+)
**Calls:** this.actionableElements.get()
**Description:** Returns descriptor from actionableElements Map.

#### IntelligenceEngine.prototype.getContentElement (Line 8184)
**Purpose:** Gets content element descriptor
**Parameters:**
- `contentId` (string) - Content ID
**Returns:** Object|null - Content descriptor
**Called by:** Unused
**Calls:** this.contentElements.get()
**Description:** Returns descriptor from contentElements Map.

#### IntelligenceEngine.prototype.getAllActionableElements (Line 8191)
**Purpose:** Returns all actionable elements
**Parameters:** None
**Returns:** Array - All descriptors
**Called by:** Unused
**Calls:** Array.from()
**Description:** Converts actionableElements Map to array.

#### IntelligenceEngine.prototype.searchActionableElements (Line 8198)
**Purpose:** LARGE 140-LINE FUNCTION - Searches elements by criteria
**Parameters:**
- `criteria` (object) - { actionType, role, label, selector, text, visible, limit }
**Returns:** Array - Matching elements
**Called by:** message handler (line 2294)
**Calls:** Array.from(), Array.filter(), resolveActionableDomNode(), isElementVisible()
**Description:**
Filters actionableElements by multiple criteria:
- actionType (exact match)
- role (exact match)
- label (substring, case-insensitive)
- selector (querySelector test)
- text (substring)
- visible (visibility check)
- limit (max results)

**WARNING:** 140 lines - exceeds 100-line limit.

#### IntelligenceEngine.prototype.getAllContentElements (Line 8338)
**Purpose:** Returns all content elements
**Parameters:** None
**Returns:** Array - All content descriptors
**Called by:** Unused
**Calls:** Array.from()
**Description:** Converts contentElements Map to array.

---

### Selector Picker Helper

#### pickBestSelector (Line 8342)
**Purpose:** Standalone helper to pick best selector
**Parameters:**
- `selectorList` (array) - Array of selectors
- `actionableElement` (object) - Element descriptor
**Returns:** String - Best selector
**Called by:** executeAction (line 8374+)
**Calls:** document.querySelectorAll()
**Description:**
Tries each selector, returns first that:
1. Matches exactly 1 element, or
2. Matches element with matching action ID

---

### Action Execution

#### IntelligenceEngine.prototype.executeAction (Line 8374)
**Purpose:** MASSIVE 1029-LINE FUNCTION - Executes action on element
**Parameters:**
- `actionId` (string) - Action ID
- `action` (string|null) - Action type override
- `params` (object) - Action parameters
**Returns:** Object - { ok, result, error }
**Called by:** message handler (line 2488), second message listener
**Calls:** getActionableElement(), resolveActionableDomNode(), pickBestSelector(), findVisibleElement(), analyzeViewportPosition(), fixViewportPositioning(), forceElementVisibility(), universalClick(), schedulePostActionIntelligenceRefresh()
**Description:**
This is the MAIN ACTION EXECUTOR that handles all LLM commands.

**Supported actions:**
- **click** - Universal click with 5 fallback strategies
- **setValue** - Set input value with React event firing
- **clear** - Clear input value
- **submit** - Submit form
- **focus** - Focus element
- **select** - Select option from dropdown
- **check/uncheck** - Toggle checkbox
- **navigate** - Click link to navigate
- **hover** - Dispatch mouseover event
- **scroll** - Scroll element into view
- **getAttribute** - Get attribute value
- **getText** - Get text content
- **isVisible** - Check visibility
- **getCoordinates** - Get position
- **screenshot** - Mark for screenshot (no-op)

**Process:**
1. Validate actionId and get descriptor
2. Resolve DOM node (6 strategies)
3. Find visible element if hidden
4. Execute action with error handling
5. Schedule post-action intelligence refresh

**WARNING:** 1029 lines - CATASTROPHICALLY exceeds 100-line limit. URGENT refactoring required per CLAUDE.md.

---

### Post-Action Refresh

#### IntelligenceEngine.prototype.schedulePostActionIntelligenceRefresh (Line 9403)
**Purpose:** Schedules intelligence update after action
**Parameters:**
- `actionId` (string) - Executed action ID
- `actionType` (string) - Action type (default 'unknown')
**Returns:** Void
**Called by:** executeAction (line 8374+)
**Calls:** setTimeout(), chrome.runtime.sendMessage()
**Description:**
Waits 500ms for DOM to settle, then sends request_scan to SW.

**NOTE:** Uses setTimeout (timer) - violates CLAUDE.md NO TIMERS rule. Should use event-driven approach.

---

### Content Element Management

#### IntelligenceEngine.prototype.purifyElement (Line 9461)
**Purpose:** Placeholder for element purification
**Parameters:**
- `element` (Element) - DOM element
- `category` (string) - Element category
**Returns:** Element
**Called by:** registerContentElement (line 9477+)
**Calls:** None
**Description:** Currently just returns element unchanged.

#### IntelligenceEngine.prototype.registerContentElement (Line 9477)
**Purpose:** Registers content element
**Parameters:**
- `element` (Element) - DOM element
- `contentType` (string) - Content type (default 'content')
**Returns:** String - Content ID
**Called by:** buildNormalizedPageRecords (line 6295+)
**Calls:** generateContentId(), purifyElement()
**Description:** Stores content element in contentElements Map.

#### IntelligenceEngine.prototype.generateContentId (Line 9494)
**Purpose:** Generates unique content ID
**Parameters:**
- `element` (Element) - DOM element
- `contentType` (string) - Content type (default 'content')
**Returns:** String - Content ID (e.g., 'c_id_42')
**Called by:** registerContentElement (line 9477+)
**Calls:** None
**Description:** Returns c_id_{counter++}.

---

### YouTube-Specific Methods

#### IntelligenceEngine.prototype.extractElementUrl (Line 9513)
**Purpose:** Extracts URL from link element
**Parameters:**
- `element` (Element) - DOM element
**Returns:** String|null - URL or null
**Called by:** registerYoutubeLockupLinks (line 9563+), registerYoutubeLinksFromNode (line 9589+)
**Calls:** None
**Description:** Returns href attribute.

#### IntelligenceEngine.prototype.getYoutubeLinkSelectors (Line 9550)
**Purpose:** Returns YouTube-specific link selectors
**Parameters:** None
**Returns:** Array - Selectors
**Called by:** registerYoutubeLockupLinks (line 9563+)
**Calls:** None
**Description:** Returns selectors for ytd-video-renderer, ytd-playlist-renderer, ytd-channel-renderer.

#### IntelligenceEngine.prototype.registerYoutubeLockupLinks (Line 9563)
**Purpose:** Registers YouTube video/playlist links
**Parameters:**
- `registeredUrls` (Set) - URLs already registered
**Returns:** Set - Updated URL set
**Called by:** scanAndRegisterPageElements (line 10084+)
**Calls:** getYoutubeLinkSelectors(), querySelectorAll(), extractElementUrl(), registerActionableElement()
**Description:** Finds YouTube content cards and registers as navigate actions.

#### IntelligenceEngine.prototype.registerYoutubeLinksFromNode (Line 9589)
**Purpose:** Registers YouTube links from subtree
**Parameters:**
- `rootNode` (Element) - Root element
**Returns:** Number - Count registered
**Called by:** scanAndRegisterPageElements (line 10084+)
**Calls:** querySelectorAll(), extractElementUrl(), registerActionableElement()
**Description:** Finds all a[href] in rootNode and registers YouTube links.

#### IntelligenceEngine.prototype.collectTranscriptPayloads (Line 9615)
**Purpose:** Collects YouTube transcript data
**Parameters:** None
**Returns:** Object - { transcript, signature, videoId, title }
**Called by:** prepareIntelligenceData (line 6206+)
**Calls:** extractYoutubeTranscriptData(), buildTranscriptSignature(), getYoutubeVideoId(), extractYoutubeVideoTitle()
**Description:** Extracts transcript from ytInitialPlayerResponse.

#### IntelligenceEngine.prototype.extractYoutubeTranscriptData (Line 9627)
**Purpose:** Extracts transcript from YouTube data
**Parameters:** None
**Returns:** Array - Transcript segments
**Called by:** collectTranscriptPayloads (line 9615+)
**Calls:** None
**Description:** Parses ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.

#### IntelligenceEngine.prototype.extractYoutubeVideoTitle (Line 9690)
**Purpose:** Extracts YouTube video title
**Parameters:** None
**Returns:** String - Video title
**Called by:** collectTranscriptPayloads (line 9615+)
**Calls:** querySelector()
**Description:** Finds h1.ytd-watch-metadata or ytInitialPlayerResponse.title.

#### IntelligenceEngine.prototype.buildTranscriptSignature (Line 9711)
**Purpose:** Builds signature hash for transcript
**Parameters:**
- `segments` (array) - Transcript segments
**Returns:** String - Signature hash
**Called by:** collectTranscriptPayloads (line 9615+)
**Calls:** None
**Description:** Creates hash from first 3 segments for deduplication.

#### IntelligenceEngine.prototype.getYoutubeVideoId (Line 9720)
**Purpose:** Extracts YouTube video ID from URL
**Parameters:** None
**Returns:** String|null - Video ID
**Called by:** collectTranscriptPayloads (line 9615+)
**Calls:** URLSearchParams
**Description:** Parses ?v= parameter from URL.

#### parseYoutubeTimestamp (Line 9744)
**Purpose:** Standalone helper to parse timestamp
**Parameters:**
- `value` (string) - Timestamp string (e.g., "1:23")
**Returns:** Number - Seconds
**Called by:** extractYoutubeTranscriptData (line 9627+)
**Calls:** None
**Description:** Converts MM:SS or HH:MM:SS to seconds.

---

### YouTube Card Collection

#### IntelligenceEngine.prototype.collectYoutubeCardDescriptors (Line 9767)
**Purpose:** LARGE 151-LINE FUNCTION - Collects YouTube video cards
**Parameters:**
- `existingDescriptors` (array) - Already collected descriptors (default [])
- `roots` (array|null) - Root elements to search (default null)
**Returns:** Array - Card descriptors
**Called by:** buildNormalizedPageRecords (line 6295+)
**Calls:** querySelectorAll(), getCleanTextContent(), computeDomPath()
**Description:**
Extracts YouTube video cards (ytd-video-renderer, ytd-grid-video-renderer, etc.) with:
- Video ID
- Title
- Channel
- View count
- Duration
- Thumbnail URL
- Upload date
- Description

**WARNING:** 151 lines - exceeds 100-line limit.

#### IntelligenceEngine.prototype.collectAdditionalAnchorDescriptors (Line 9918)
**Purpose:** LARGE 137-LINE FUNCTION - Collects anchor (link) descriptors
**Parameters:**
- `existingDescriptors` (array) - Already collected (default [])
**Returns:** Array - Anchor descriptors
**Called by:** buildNormalizedPageRecords (line 6295+)
**Calls:** querySelectorAll(), getCleanTextContent(), computeDomPath(), compareDomPaths()
**Description:**
Extracts all meaningful links with:
- Href
- Text
- Title
- Aria-label
- Data attributes
Deduplicates by URL and text.

**WARNING:** 137 lines - exceeds 100-line limit.

---

### DOM Path Utilities

#### IntelligenceEngine.prototype.computeDomPath (Line 10055)
**Purpose:** Computes hierarchical DOM path
**Parameters:**
- `node` (Element) - DOM node
**Returns:** Array - DOM path
**Called by:** buildNormalizedPageRecords (line 6295+), collectYoutubeCardDescriptors (line 9767+), collectAdditionalAnchorDescriptors (line 9918+)
**Calls:** None
**Description:** Returns array of { tag, id, cls, idx } from node to root.

#### IntelligenceEngine.prototype.compareDomPaths (Line 10071)
**Purpose:** Compares two DOM paths
**Parameters:**
- `a` (array) - First path
- `b` (array) - Second path
**Returns:** Number - -1, 0, 1 for sorting
**Called by:** buildNormalizedPageRecords (line 6295+), collectAdditionalAnchorDescriptors (line 9918+)
**Calls:** None
**Description:** Compares paths depth-first for ordering.

---

### Main Scanning Method

#### IntelligenceEngine.prototype.scanAndRegisterPageElements (Line 10084)
**Purpose:** LARGE 285-LINE FUNCTION - Main scan orchestrator
**Parameters:** None
**Returns:** Void
**Called by:** Disabled in current code (commented out in executeScanWithSettle)
**Calls:** scanWithFrameworkSelectors(), registerActionableElement(), registerYoutubeLockupLinks(), registerYoutubeLinksFromNode(), applyConfiguredFocus()
**Description:**
**NOTE:** This function is currently DISABLED. Scanning now only uses buildNormalizedPageRecords() via prepareIntelligenceData().

Process (when enabled):
1. Reset counters
2. Clear actionableElements Map
3. Run scanWithFrameworkSelectors()
4. Register framework elements
5. Register YouTube links
6. Apply auto-focus
7. Queue intelligence update

**WARNING:** 285 lines - massively exceeds 100-line limit.

---

## Capability Pipeline & Initialization

### Engine Creation

#### recreateIntelligenceEngine (Line 10369)
**Purpose:** Destroys and recreates intelligence engine
**Parameters:** None
**Returns:** IntelligenceEngine - New instance
**Called by:** runScanAfterPageLoad (line 1521)
**Calls:** IntelligenceEngine constructor
**Description:**
1. Clears old engine
2. Creates new IntelligenceEngine()
3. Sets window.intelligenceEngine
4. Returns new instance

#### initializeIntelligenceSystem (Line 10423)
**Purpose:** Initializes intelligence system components
**Parameters:** None
**Returns:** Void
**Called by:** Bottom of file (line 10800+), notifyServiceWorkerOfChanges (line 1677)
**Calls:** recreateIntelligenceEngine(), initializeDOMChangeDetection(), initializeHistoryTracking()
**Description:**
1. Guards against duplicate initialization
2. Creates intelligence engine
3. Sets up DOM change detection
4. Sets up history tracking
5. Stores components in window.intelligenceComponents

---

### Orphaned Function

#### setupIntelligenceUpdates (Line 10498)
**Purpose:** ORPHANED - Sets up intelligence update listeners
**Parameters:** None
**Returns:** Void
**Called by:** NEVER CALLED - orphaned function
**Calls:** chrome.runtime.onMessage.addListener()
**Description:**
This function was created but never integrated. It sets up a message listener for refresh_intelligence commands.

**WARNING:** This is dead code and should be removed or integrated.

---

### Capability Pipeline Executor

#### capabilityPipelineExecutor (Line 10595)
**Purpose:** LARGE 191-LINE FUNCTION - Executes capability actions using selectors
**Parameters:**
- `capabilityAction` (string) - Capability name
- `params` (object) - Action parameters (default {})
**Returns:** Promise<Object> - { success, message, elementFound, matchedBy }
**Called by:** Second message listener (execute_capability message)
**Calls:** waitForElement(), intelligenceEngine.extractSemanticTextWithIds(), chrome.runtime.sendMessage()
**Description:**
This is the CAPABILITY PIPELINE that bypasses action IDs and uses pure selector matching.

**Process:**
1. Get site config (siteConfig || window.currentSiteConfig)
2. Look up capability by action name
3. Try selectors in priority order (specific → generic)
4. Wait up to 5s for lazy-loaded elements
5. Click matched element
6. Trigger intelligence update
7. Return result

**Use cases:** Dynamic content, modals, lazy-loaded elements not in initial scan.

**WARNING:** 191 lines - exceeds 100-line limit.

---

### Wait for Element Helper

#### waitForElement (Line 10787)
**Purpose:** Polls for element to appear
**Parameters:**
- `selector` (string) - CSS selector
- `timeout` (number) - Max wait in ms (default 5000)
**Returns:** Promise<Element>
**Called by:** capabilityPipelineExecutor (line 10595+)
**Calls:** document.querySelector(), setTimeout()
**Description:**
Polls every 100ms for element. Resolves when found, rejects on timeout.

**NOTE:** Uses setTimeout (timer) - violates CLAUDE.md NO TIMERS rule.

---

## Utility Functions

### Change Detection

#### isSignificantChange (Line 10974)
**Purpose:** LARGE 159-LINE FUNCTION - Filters insignificant DOM changes
**Parameters:**
- `mutations` (array) - MutationRecord array
**Returns:** Boolean
**Called by:** initializeDOMChangeDetection (lines 1569, 1598)
**Calls:** None
**Description:**
Filters out:
- Style/class tweaks (hover states, animations)
- Empty text nodes
- Script/style tag changes
- Single-character changes
- Common animation classes

**Significant change criteria:**
- Structural changes (added/removed elements)
- Form value changes
- Visibility changes
- Content changes >10 chars

**WARNING:** 159 lines - exceeds 100-line limit.

#### isElementVisible (Line 11133)
**Purpose:** Visibility check (third implementation)
**Parameters:**
- `element` (Element) - DOM element
**Returns:** Boolean
**Called by:** isSignificantChange (line 10974+), various functions
**Calls:** getBoundingClientRect(), getComputedStyle()
**Description:**
Checks:
- Display !== 'none'
- Visibility !== 'hidden'
- Opacity > 0
- Width/height > 0

**NOTE:** This is the THIRD implementation of isElementVisible in the file. Should consolidate.

---

## Second Message Listener (Lines ~10800-11000)

There is a SECOND chrome.runtime.onMessage listener that handles execute_action messages specifically. This is separate from the main message handler.

**Purpose:** Handles LLM action execution
**Message type:** execute_action
**Calls:** intelligenceEngine.executeAction()
**Returns:** Action execution result

---

## Function Interactions

### Scan Flow
```
Service Worker "start_scan" message
  → executeScanWithSettle()
    → waitForDOMSettle()
    → intelligenceEngine.prepareIntelligenceData()
      → buildNormalizedPageRecords()
        → scanWithFrameworkSelectors()
        → collectYoutubeCardDescriptors()
        → collectAdditionalAnchorDescriptors()
      → extractCapabilities()
      → getActionableElementsSummary()
    → chrome.runtime.sendMessage('scan_complete')
    → startSignificantChangeDetector()
```

### Action Execution Flow
```
LLM/Python → WebSocket Server → Service Worker → Content Script
  → Message Handler receives "execute_action"
    → intelligenceEngine.executeAction(actionId, action, params)
      → getActionableElement(actionId)
      → resolveActionableDomNode(actionId, descriptor)
        → getStoredActionableNode() [WeakMap lookup]
        → querySelector by data-ome-action-id
        → Try selectors from descriptor
        → Try generic selectors
      → findVisibleElement() [if hidden]
      → universalClick() [for click action]
        → Try standard click
        → Try MouseEvent dispatch
        → Try scrollIntoView + click
        → fixViewportPositioning()
        → forceElementVisibility()
        → verifyClickWorked()
      → setValue() [for input action]
      → schedulePostActionIntelligenceRefresh()
    → Send response back to Service Worker → WebSocket → Python
```

### Capability Pipeline Flow
```
Python test_navigation.py --command capability --capability RetrieveTranscript
  → WebSocket Server
    → Service Worker "execute_capability"
      → Content Script capabilityPipelineExecutor()
        → Get site config
        → Look up capability by action name
        → Try selectors in priority order
        → waitForElement(selector, 5000)
        → element.click()
        → Trigger intelligence update
        → Return result
```

### Focus Application Flow
```
Scan completion
  → applyConfiguredFocus('post_scan')
    → Try site config focus_targets
    → Try fallback selectors (input[type='search'], input[type='text'], etc.)
    → isElementFocusable(element)
    → focusElement(element)
      → element.focus()
      → simulateUserInput(element)
        → Dispatch InputEvent('input')
        → Dispatch Event('change')
    → If failed: scheduleFocusRetry()
```

---

## Integration Points

### Service Worker Integration
**Messages sent TO service worker:**
- `scan_complete` - Scan finished with intelligence data
- `scan_error` - Scan failed with error
- `request_scan` - Request new scan (trigger: significant_dom_change, content_page_load_fallback, content_manual_command)
- `intelligence_update` - Intelligence data update
- `dom_changed` - Significant DOM change notification
- `network_activity` - Network event (fetch/XHR start/end)

**Messages received FROM service worker:**
- `start_intelligence_scan` - Start initial scan
- `start_scan` - Start scan with page version
- `execute_action` - Execute LLM action
- `execute_capability` - Execute capability action
- `site_configs_update` - Framework config update (not shown in snippets)
- 30+ command messages (waitFor, click, getText, etc.)

### DOM Integration
**Read operations:**
- `document.querySelectorAll()` - Element discovery
- `getBoundingClientRect()` - Position/size
- `getComputedStyle()` - CSS properties
- `innerText`, `textContent`, `value` - Text extraction
- `getAttribute()` - Attribute reading

**Write operations:**
- `element.focus()` - Focus management
- `element.click()` - Click triggering
- `element.value = x` - Form input
- `element.style.X = Y` - Temporary CSS modifications
- `element.dataset.omeActionId` - Action ID storage
- `dispatchEvent()` - Event firing

**Observers:**
- `MutationObserver` - DOM change detection (4 instances)
- `PerformanceObserver` - Resource loading
- `IntersectionObserver` - Not used currently

### Site Config Integration
**Config accessed via:**
- `siteConfig` - Local variable loaded via getSiteConfigDirect()
- `window.currentSiteConfig` - Global fallback
- `window.currentFramework` - Framework name

**Config structure:**
```javascript
{
  framework: "youtube",
  selectors: {
    text_inputs: [...],
    buttons: [...],
    navigation: [...],
    url_elements: [...],
    // ... more categories
  },
  focus_targets: [...],
  forceIncludeSelectors: [...],
  capabilities: {
    transcript: {
      action: "RetrieveTranscript",
      label: "Get video transcript",
      url_pattern: "/watch?v=",
      selectors: [...]
    }
  }
}
```

**Config usage:**
- `scanWithFrameworkSelectors()` - Uses selectors object
- `applyConfiguredFocus()` - Uses focus_targets
- `capabilityPipelineExecutor()` - Uses capabilities
- `extractCapabilities()` - Filters by URL pattern

---

## Orphaned Functions

Functions defined but never called:

### 1. scanWhenPageSettles (Line 570)
**Status:** ORPHANED
**Reason:** Helper function for idle waiting, but not used anywhere
**Recommendation:** Remove or integrate into scan flow

### 2. setupIntelligenceUpdates (Line 10498)
**Status:** ORPHANED
**Reason:** Message listener for refresh_intelligence, never called
**Recommendation:** Remove dead code or integrate properly

### 3. IntelligenceEngine.prototype.getAvailableActions (Line 7338)
**Status:** ORPHANED
**Reason:** Filters actions by type, no callers found
**Recommendation:** Remove if truly unused, or document use case

### 4. IntelligenceEngine.prototype.getContentElement (Line 8184)
**Status:** ORPHANED
**Reason:** Gets content element by ID, no callers
**Recommendation:** Keep for API completeness

### 5. IntelligenceEngine.prototype.getAllActionableElements (Line 8191)
**Status:** ORPHANED
**Reason:** Returns all actionable elements, no callers (getActionableElementsSummary is used instead)
**Recommendation:** Keep for API completeness

### 6. IntelligenceEngine.prototype.getAllContentElements (Line 8338)
**Status:** ORPHANED
**Reason:** Returns all content elements, no callers
**Recommendation:** Keep for API completeness

### 7. IntelligenceEngine.prototype.refreshPageIntelligenceWithRetry (Line 7378)
**Status:** ORPHANED
**Reason:** Refresh with retry logic, not called
**Recommendation:** Remove or integrate into scan flow

### 8. IntelligenceEngine.prototype.scanAndRegisterPageElements (Line 10084)
**Status:** DISABLED/ORPHANED
**Reason:** Main scanning function, but commented out in executeScanWithSettle (line 141)
**Recommendation:** This is intentionally disabled. Scanning now uses buildNormalizedPageRecords() directly. Keep for reference or remove if permanently deprecated.

---

## Critical Issues & Refactoring Needs

### 🚨 URGENT: Functions Exceeding Line Limits

Per CLAUDE.md standards, functions must be ≤100 lines. These SEVERELY violate that rule:

1. **IntelligenceEngine.prototype.executeAction** (Line 8374)
   - **1029 LINES** - CATASTROPHIC
   - MUST refactor into 15-20 smaller functions:
     - executeClickAction()
     - executeSetValueAction()
     - executeSelectAction()
     - executeNavigateAction()
     - etc.

2. **IntelligenceEngine.prototype.buildNormalizedPageRecords** (Line 6295)
   - **374 LINES** - CRITICAL
   - MUST extract all helper functions:
     - Already has 17 internal helpers
     - Move helpers to module scope
     - Split main logic into phases

3. **IntelligenceEngine.prototype.scanAndRegisterPageElements** (Line 10084)
   - **285 LINES** - CRITICAL
   - Currently disabled, but if re-enabled, MUST refactor

4. **capabilityPipelineExecutor** (Line 10595)
   - **191 LINES** - URGENT
   - Extract selector matching logic
   - Extract click and update logic

5. **isSignificantChange** (Line 10974)
   - **159 LINES** - URGENT
   - Extract filter functions for each change type

6. **IntelligenceEngine.prototype.resolveActionableDomNode** (Line 7986)
   - **155 LINES** - URGENT
   - Extract resolution strategies into separate functions

7. **IntelligenceEngine.prototype.collectYoutubeCardDescriptors** (Line 9767)
   - **151 LINES**
   - Extract card parsing logic

8. **IntelligenceEngine.prototype.searchActionableElements** (Line 8198)
   - **140 LINES**
   - Extract filter logic

9. **IntelligenceEngine.prototype.collectAdditionalAnchorDescriptors** (Line 9918)
   - **137 LINES**
   - Extract anchor parsing logic

10. **IntelligenceEngine.prototype.inferSemanticRole** (Line 7430)
    - **137 LINES**
    - Extract role detection patterns

---

### ⚠️ Timer Usage Violations

Per CLAUDE.md, NO TIMERS allowed. Event-driven only.

**Violations found:**
1. **Line 58** - `setTimeout(ensureKeepAlivePortConnection, 500)` in keep-alive reconnect
2. **Line 64** - `setTimeout(ensureKeepAlivePortConnection, 1000)` in error handler
3. **Line 562** - `setTimeout(..., 4000)` - fallback scan trigger
4. **Line 700** - `setTimeout(applyConfiguredFocus, 600)` - focus retry
5. **Line 1543** - `sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))` - utility
6. **Line 1673** - `setTimeout(initializeIntelligenceSystem, 1000)` - context invalidation retry
7. **Line 1821** - `await sleep(60)` in waitForSelector polling
8. **Line 9451** - `setTimeout(request_scan, 500)` in schedulePostActionIntelligenceRefresh
9. **Line 10787+** - waitForElement uses setTimeout for polling

**Recommendations:**
- Keep-alive: Use port.onDisconnect event (already has it, but also retries with timer)
- Focus retry: Use MutationObserver or requestAnimationFrame
- Polling: Replace with MutationObserver or Promises.race with native events
- Post-action refresh: Use MutationObserver to detect DOM settle

---

### 🔄 Code Duplication Issues

**Multiple implementations of same function:**
1. **isElementVisible** - 3 implementations (lines 1735, 5895, 11133)
2. **generateSelector** - 3 implementations (lines 1761, 4200, 5930)
3. **determineActionType** - 2 implementations (lines 1282, 5949)

**Recommendation:** Create shared utility module, import everywhere.

---

### 📦 Missing Type Safety

Per CLAUDE.md, 100% JSDoc coverage required. Many functions lack proper JSDoc:
- IntelligenceEngine methods (most have no JSDoc)
- Helper functions in buildNormalizedPageRecords
- Message handler branches

**Recommendation:** Add comprehensive JSDoc with @param, @returns, @example.

---

### 🧪 Testing Gaps

Per CLAUDE.md, ≥80% test coverage required. NO TESTS found in this file.

**Critical functions needing tests:**
- executeAction (all action types)
- buildNormalizedPageRecords
- capabilityPipelineExecutor
- resolveActionableDomNode
- universalClick
- isSignificantChange

**Recommendation:** Create test suite with mocked DOM and chrome.runtime.

---

## Summary

**Total Lines:** 11,164
**Total Functions:** ~130+ (including IntelligenceEngine methods and helpers)
**Orphaned Functions:** 8
**Functions >100 lines:** 10 (URGENT refactoring needed)
**Timer violations:** 9 locations
**Duplicate implementations:** 3 functions

**Architecture Strengths:**
- Event-driven DOM scanning
- Site config-driven behavior
- Dual pipeline (action ID + capability)
- Comprehensive element registration
- YouTube-specific optimizations

**Architecture Weaknesses:**
- Massive functions violating SRP
- Timer usage throughout
- Code duplication
- Missing tests
- Incomplete JSDoc

**Recommended Next Steps:**
1. Refactor executeAction into 15-20 smaller functions
2. Refactor buildNormalizedPageRecords into modular functions
3. Replace all setTimeout with event-driven alternatives
4. Consolidate duplicate utility functions
5. Add comprehensive JSDoc
6. Create test suite
7. Remove orphaned functions
8. Extract IntelligenceEngine into separate file
