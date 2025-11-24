# Content.js Complete Documentation

**File**: `/Users/andy7string/Projects/Om_E_Web/web_extension/content.js`
**Size**: 11,069 lines
**Purpose**: Chrome Extension MV3 content script that transforms web pages into LLM-actionable intelligence

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Systems](#core-systems)
3. [Function Reference](#function-reference)
4. [Data Flows](#data-flows)
5. [Message Handling](#message-handling)
6. [Intelligence Engine](#intelligence-engine)
7. [Redundancy Analysis](#redundancy-analysis)

---

## Architecture Overview

### Script Initialization Flow

```
Load content.js
  ├─> Check for duplicate injection (window.omEWebContentScriptLoaded)
  ├─> Verify main frame only (window.top === window.self)
  ├─> Establish keep-alive port (ensureKeepAlivePortConnection)
  ├─> Load site config (getSiteConfigDirect)
  ├─> Initialize Intelligence Engine
  ├─> Setup scan orchestration
  └─> Setup message listeners
```

### Key Global Variables

```javascript
// Scan Control
scanInProgress = false                    // Scan lock
currentPageVersion = null                 // Page version tracking
initialScanScheduled = false              // Initial scan flag
initialFocusApplied = false              // Focus tracking

// Intelligence System
intelligenceEngine = null                 // Main processing engine
changeAggregator = null                  // DOM change aggregator
pageContext = null                       // Page metadata
siteConfig = null                        // Current site configuration

// DOM Monitoring
domChangeObserver = null                 // Mutation observer
significantChangeDetector = null         // Significant change observer
changeDetectionEnabled = false           // Detection flag

// Timing/Throttling
lastSignificantChangeTime = 0            // Rate limiting
lastIntelligenceUpdate = 0               // Update throttling
```

---

## Core Systems

### 1. Scan Orchestration System

#### `executeScanWithSettle(pageVersion, url, trigger)`
**Purpose**: Main scan coordinator with DOM settle detection
**Inputs**:
- `pageVersion` (number): Page state version
- `url` (string): Current URL
- `trigger` (string): What triggered scan (e.g., 'DOMContentLoaded', 'navigation')

**Process**:
1. Check scan lock (`scanInProgress`)
2. Read/write pageVersion from/to DOM (`document.body.dataset.omePageVersion`)
3. Reset element counter (`intelligenceEngine.elementCounter = 0`)
4. Wait for DOM to settle (`waitForDOMSettle`)
5. Execute scan (`intelligenceEngine.scanAndRegisterPageElements()`)
6. Prepare intelligence data (`intelligenceEngine.prepareIntelligenceData()`)
7. Send to service worker (`chrome.runtime.sendMessage` with type 'scan_complete')
8. Release lock and start change detector (`startSignificantChangeDetector()`)

**Calls**:
- `waitForDOMSettle()`
- `intelligenceEngine.scanAndRegisterPageElements()`
- `intelligenceEngine.prepareIntelligenceData()`
- `chrome.runtime.sendMessage()`
- `startSignificantChangeDetector()`

**Called by**:
- Message listener (type: 'execute_scan')
- `runScanAfterPageLoad()`

---

#### `waitForDOMSettle({ maxWait, quietWindow })`
**Purpose**: Wait for DOM to stop mutating before scanning
**Inputs**:
- `maxWait` (number, default 5000): Maximum wait time in ms
- `quietWindow` (number, default 200): Time with no mutations = settled

**Returns**: Promise that resolves when DOM is quiet

**Process**:
1. Create MutationObserver watching body
2. On mutation: reset quiet timer
3. If no mutations for `quietWindow` ms: resolve
4. Failsafe: resolve after `maxWait` ms regardless

**Calls**: None (creates MutationObserver internally)

**Called by**:
- `executeScanWithSettle()`

---

#### `startSignificantChangeDetector()`
**Purpose**: Continuous DOM monitoring for major changes
**Process**:
1. Start MutationObserver on document.body
2. Count mutations
3. On quiet (200ms no changes):
   - If >20 mutations AND >2s since last: trigger scan
4. Rate limit to prevent spam

**Calls**:
- `chrome.runtime.sendMessage()` with type 'request_scan'

**Called by**:
- `executeScanWithSettle()` (after scan completes)

---

### 2. Page Idle Monitoring System

#### `pageIdleMonitor` (IIFE singleton)
**Purpose**: Detect when page is truly idle (no network, no DOM changes)
**Exports**:
- `waitForIdle({ maxWait, quietWindow })` - Wait for idle state
- `markChange()` - Mark a change occurred

**Internal State**:
- `inflightRequests` - Count of active network requests
- `idleResolvers` - Set of promise resolvers
- `lastChangeTime` - Timestamp of last activity

**Wraps**:
- `window.fetch` - Intercepts to track network activity
- `XMLHttpRequest.prototype.send` - Intercepts XHR requests
- `MutationObserver` - Tracks DOM changes
- `PerformanceObserver` - Tracks resource loading

**Network Activity Notifications**:
- Calls `notifyNetworkActivity('fetch_start', url)`
- Calls `notifyNetworkActivity('fetch_end', url, status)`
- Calls `notifyNetworkActivity('xhr_start', url)`
- Calls `notifyNetworkActivity('xhr_end', url, status)`

**Called by**:
- `scheduleInitialScan()`
- `scanWhenPageSettles()`

---

### 3. Site Configuration System

#### `getSiteConfigDirect()`
**Purpose**: Synchronously load site config from extension
**Returns**: Site config object or null

**Process**:
1. XHR GET to `chrome.runtime.getURL('site_configs.json')` (synchronous)
2. Parse JSON
3. Match domain:
   - Exact match: `allConfigs[currentDomain]`
   - Partial match: domain contains configDomain
   - Fallback: `allConfigs['default']`
4. Set globals:
   - `siteConfig`
   - `window.currentSiteConfig`
   - `window.currentFramework`

**Called by**:
- Script initialization (line 1111)

---

#### `scanWithFrameworkSelectors()`
**Purpose**: Scan DOM using framework-specific selectors
**Returns**: Array of framework elements

**Process**:
1. Get selectors from `window.currentSiteConfig.selectors`
2. Scan categories in priority order:
   - text_inputs, navigation, url_elements, buttons, menus, content_elements, hidden_content
3. Use WeakSet to prevent duplicate elements
4. Force-include critical selectors (e.g., search inputs)
5. Return array of `{ element, type, selector, framework }`

**Calls**:
- `inferForcedElementCategory(element)`
- `testSelectorsAfterScan()`

**Called by**:
- `IntelligenceEngine.prototype.scanAndRegisterPageElements()`

---

### 4. Action Execution System

#### `IntelligenceEngine.prototype.executeAction(actionId, action, params)`
**Purpose**: Execute action on element by action ID
**Inputs**:
- `actionId` (string): Action ID (e.g., 'a_id_42')
- `action` (string|null): Action type override
- `params` (object): Action parameters

**Returns**: `{ ok, result?, error? }`

**Process**:
1. Resolve DOM node: `resolveActionableDomNode(actionId, descriptor)`
2. Determine action type from descriptor or element
3. Execute action based on type:
   - **click**: `element.click()`
   - **setValue**: Set input value + optional submit
   - **navigate**: `window.location.href = url`
   - **select**: Set select option
   - **toggle**: Toggle checkbox
   - **hover**: Dispatch mouseover event
   - **focus**: `element.focus()`
   - **submit**: Submit form
4. Schedule post-action intelligence refresh
5. Return result

**Calls**:
- `resolveActionableDomNode(actionId, descriptor)`
- `determineActionType(element)`
- `schedulePostActionIntelligenceRefresh(actionId, actionType)`

**Called by**:
- Message listener (type: 'execute_action')
- Capability pipeline executor

---

#### `IntelligenceEngine.prototype.resolveActionableDomNode(actionId, descriptor)`
**Purpose**: Find DOM node for action ID
**Inputs**:
- `actionId` (string): Action ID to resolve
- `descriptor` (object): Element descriptor with selectors

**Returns**: DOM element or null

**Process**:
1. Check stored node cache: `getStoredActionableNode(actionId)`
2. Try dataset selector: `[data-ome-action-id="${actionId}"]`
3. Try descriptor selectors in order
4. Try descriptor label text search
5. Validate node still matches descriptor
6. Store found node in cache

**Calls**:
- `getStoredActionableNode(actionId)`
- `_matchesActionDescriptor(node, actionId, descriptor)`
- `storeActionableNode(actionId, node)`

**Called by**:
- `executeAction()`
- `getActionableElement(actionId)`

---

### 5. Intelligence Engine Core

#### `IntelligenceEngine` Constructor
**Purpose**: Initialize intelligence processing engine

**Properties**:
```javascript
elementCounter = 0                    // Current element ID counter
actionableElements = new Map()       // actionId -> descriptor
contentElements = new Map()          // contentId -> descriptor
updateQueue = []                     // Queued intelligence updates
isProcessingQueue = false            // Queue processing lock
lastUpdateTime = 0                   // Last update timestamp
```

---

#### `IntelligenceEngine.prototype.scanAndRegisterPageElements()`
**Purpose**: Main scan function - discovers and registers all page elements
**Process**:

1. **Framework Scanning**:
   - Call `scanWithFrameworkSelectors()` to get framework elements
   - Register each element based on category type

2. **Generic Scanning** (if no framework elements):
   - Scan by CSS selectors for common element types
   - Buttons: `button, [role="button"], input[type="submit"]`
   - Links: `a[href], [role="link"]`
   - Text inputs: `input[type="text"], textarea, [contenteditable]`
   - Select: `select`

3. **Element Registration**:
   - For each element: call `registerActionableElement(element, actionType)`
   - For content: call `registerContentElement(element, contentType)`

4. **YouTube-Specific Processing**:
   - Extract transcript: `extractYoutubeTranscriptData()`
   - Collect video cards: `collectYoutubeCardDescriptors()`
   - Register links: `registerYoutubeLinksFromNode()`

5. **Intelligence Update**:
   - Queue update: `queueIntelligenceUpdate('normal')`

**Calls**:
- `scanWithFrameworkSelectors()`
- `registerActionableElement(element, actionType)`
- `registerContentElement(element, contentType)`
- `extractYoutubeTranscriptData()`
- `collectYoutubeCardDescriptors()`
- `queueIntelligenceUpdate()`

**Called by**:
- `executeScanWithSettle()`

---

#### `IntelligenceEngine.prototype.registerActionableElement(element, actionType)`
**Purpose**: Register an interactive element with action ID
**Inputs**:
- `element` (HTMLElement): DOM element to register
- `actionType` (string): Type of action (click, setValue, navigate, etc.)

**Returns**: Action ID (e.g., 'a_id_42') or null

**Process**:
1. Generate or reuse action ID: `generateActionableId(element, actionType, reuseId)`
2. Set dataset attribute: `element.dataset.omeActionId = actionId`
3. Generate selectors: `generateElementSelectors(element)`
4. Extract semantic role: `inferSemanticRole(element, actionType, attributes)`
5. Store in map: `actionableElements.set(actionId, descriptor)`
6. Store node reference: `storeActionableNode(actionId, element)`

**Descriptor Structure**:
```javascript
{
  actionId: "a_id_42",
  element: element,
  actionType: "click",
  selectors: ["#btn", ".primary-button"],
  attributes: { id, name, type, placeholder, ariaLabel, ... },
  text: "Click me",
  label: "Submit Button",
  semanticRole: "submit_button",
  url: "https://...", // if navigate action
  visible: true,
  rect: { top, left, width, height },
  timestamp: 1234567890
}
```

**Calls**:
- `generateActionableId(element, actionType, reuseId)`
- `generateElementSelectors(element)`
- `extractKeyAttributes(element)`
- `inferSemanticRole(element, actionType, attributes)`
- `getCleanTextContent(element)`
- `extractElementUrl(element)`
- `isElementVisible(element)`
- `storeActionableNode(actionId, element)`

**Called by**:
- `scanAndRegisterPageElements()`

---

#### `IntelligenceEngine.prototype.generateActionableId(element, actionType, reuseId)`
**Purpose**: Generate unique action ID for element
**Inputs**:
- `element` (HTMLElement): Target element
- `actionType` (string): Action type
- `reuseId` (string|null): Existing ID to reuse

**Returns**: Action ID string (e.g., 'a_id_42')

**Process**:
1. Check for existing ID in dataset: `element.dataset.omeActionId`
2. If reusing: return `reuseId`
3. Generate new: `a_id_${this.elementCounter++}`
4. Set dataset: `element.dataset.omeActionId = actionId`

**Called by**:
- `registerActionableElement()`

---

#### `IntelligenceEngine.prototype.generateElementSelectors(element)`
**Purpose**: Generate CSS selectors for element
**Returns**: Array of selector strings

**Process**:
1. ID selector: `#${element.id}`
2. Name attribute: `[name="${name}"]`
3. Data-testid: `[data-testid="${testId}"]`
4. Aria-label: `[aria-label="${label}"]`
5. Class-based: `tag.className`
6. Position-based: `generatePositionSelector(element)`

**Calls**:
- `generatePositionSelector(element)`

**Called by**:
- `registerActionableElement()`

---

### 6. Semantic Text Extraction

#### `IntelligenceEngine.prototype.extractSemanticTextWithIds()`
**Purpose**: Extract page text with positional IDs for LLM consumption
**Returns**: Array of text blocks with semantic metadata

**Structure**:
```javascript
[
  {
    text_id: "t_id_0",
    type: "heading",
    level: 1,
    text: "Welcome to Page",
    selector: "h1.title",
    parent: "section.hero",
    position: 0
  },
  {
    text_id: "t_id_1",
    type: "paragraph",
    text: "This is content...",
    selector: "p.intro",
    parent: "section.hero",
    position: 1
  },
  {
    text_id: "t_id_2",
    type: "list",
    items: ["Item 1", "Item 2"],
    selector: "ul.menu",
    parent: "nav",
    position: 2
  }
]
```

**Process**:
1. Extract headings: `extractHeadings()`
2. Extract paragraphs: `extractParagraphs()`
3. Extract lists: `extractLists()`
4. Assign sequential text IDs: `t_id_${counter}`
5. Calculate positions in document flow
6. Generate selectors for each text block

**Calls**:
- `extractHeadings()`
- `extractParagraphs()`
- `extractLists()`
- `generateSimpleSelector(element)`
- `isElementVisible(element)`

**Called by**:
- `prepareIntelligenceData()`
- `buildNormalizedPageRecords()`

---

#### `IntelligenceEngine.prototype.extractHeadings()`
**Purpose**: Extract all visible headings (h1-h6)
**Returns**: Array of heading objects

**Process**:
1. Query: `document.querySelectorAll('h1, h2, h3, h4, h5, h6')`
2. Filter: visible only (`isElementVisible()`)
3. Extract: text content, level, selector
4. Assign text_id: `t_id_${counter}`

**Called by**:
- `extractSemanticTextWithIds()`

---

#### `IntelligenceEngine.prototype.extractParagraphs()`
**Purpose**: Extract all visible paragraph elements
**Returns**: Array of paragraph objects

**Process**:
1. Query: `document.querySelectorAll('p')`
2. Filter: visible AND has text content
3. Extract: text, selector
4. Assign text_id: `t_id_${counter}`

**Called by**:
- `extractSemanticTextWithIds()`

---

#### `IntelligenceEngine.prototype.extractLists()`
**Purpose**: Extract all lists (ul, ol) and items
**Returns**: Array of list objects

**Process**:
1. Query: `document.querySelectorAll('ul, ol')`
2. Filter: visible lists
3. For each list:
   - Extract list items (`li` elements)
   - Store as `items` array
4. Assign text_id: `t_id_${counter}`

**Called by**:
- `extractSemanticTextWithIds()`

---

### 7. Intelligence Data Preparation

#### `IntelligenceEngine.prototype.prepareIntelligenceData()`
**Purpose**: Prepare complete intelligence payload for server
**Returns**: Intelligence data object

**Structure**:
```javascript
{
  url: "https://example.com/page",
  title: "Page Title",
  domain: "example.com",
  framework: "generic",
  timestamp: 1234567890,

  actionableElements: [
    {
      actionId: "a_id_0",
      actionType: "click",
      selectors: ["#btn"],
      label: "Submit",
      semanticRole: "submit_button",
      visible: true,
      ...
    }
  ],

  contentElements: [
    {
      contentId: "c_id_0",
      type: "heading",
      text: "Title",
      selector: "h1",
      ...
    }
  ],

  semanticText: [
    {
      text_id: "t_id_0",
      type: "heading",
      text: "Title",
      ...
    }
  ],

  capabilities: [
    {
      action: "RetrieveTranscript",
      label: "Get video transcript",
      available: true
    }
  ],

  // YouTube-specific
  transcript: {
    videoId: "abc123",
    title: "Video Title",
    segments: [...]
  }
}
```

**Calls**:
- `extractSemanticTextWithIds()`
- `extractCapabilities()`
- `extractYoutubeTranscriptData()`
- `extractYoutubeVideoTitle()`

**Called by**:
- `executeScanWithSettle()`
- `queueIntelligenceUpdate()`

---

#### `IntelligenceEngine.prototype.extractCapabilities()`
**Purpose**: Extract available site capabilities from config
**Returns**: Array of capability descriptors

**Process**:
1. Get capabilities from `siteConfig.capabilities` or `window.currentSiteConfig.capabilities`
2. For each capability:
   - Check URL pattern match (if specified)
   - Check if elements exist for selectors
3. Return available capabilities

**Capability Structure**:
```javascript
{
  action: "RetrieveTranscript",
  label: "Get video transcript",
  description: "Retrieves full transcript for YouTube video",
  available: true,
  url_pattern: "/watch?v=",
  selectors: ["button[aria-label='Show transcript']"]
}
```

**Called by**:
- `prepareIntelligenceData()`

---

### 8. Normalized Page Records (JSONL Format)

#### `IntelligenceEngine.prototype.buildNormalizedPageRecords(options)`
**Purpose**: Build page.jsonl format for server artifacts
**Returns**: Array of record objects (one per line in JSONL)

**Record Types**:

1. **Meta Record** (first line):
```javascript
{
  record_type: "meta",
  url: "https://example.com",
  title: "Page Title",
  domain: "example.com",
  timestamp: 1234567890,
  framework: "generic",
  total_actions: 42,
  total_content: 100
}
```

2. **Section Records** (content groupings):
```javascript
{
  record_type: "section",
  section_id: "section_0",
  title: "Main Content",
  selector: "main.content",
  element_count: 15
}
```

3. **Text Records** (semantic text):
```javascript
{
  record_type: "text",
  text_id: "t_id_5",
  type: "heading",
  level: 2,
  text: "Section Title",
  parent_section: "section_0",
  selector: "h2.title"
}
```

4. **Action Records** (actionable elements):
```javascript
{
  record_type: "action",
  action_id: "a_id_12",
  action_type: "click",
  label: "Submit Button",
  semantic_role: "submit_button",
  selectors: ["#submit", "button.primary"],
  parent_section: "section_0",
  visible: true
}
```

**Process**:
1. Build meta record
2. Identify sections (main, article, section elements)
3. For each section:
   - Extract text blocks
   - Extract actions
   - Assign to parent section
4. Generate sequential record stream

**Calls**:
- `extractSemanticTextWithIds()`
- `computeDomPath(node)`
- `compareDomPaths(a, b)`

**Called by**:
- `prepareIntelligenceData()` (when building JSONL)

---

### 9. Capability Pipeline Execution

#### `capabilityPipelineExecutor(capabilityAction, params)`
**Purpose**: Execute capability using selector-based discovery
**Inputs**:
- `capabilityAction` (string): Capability action name (e.g., "RetrieveTranscript")
- `params` (object): Optional parameters

**Returns**: `{ success, message, elementFound?, matchedBy? }`

**Process**:
1. Get site config: `siteConfig || window.currentSiteConfig`
2. Find capability definition in config
3. Check URL pattern match (if specified)
4. Try selectors in priority order:
   - Most specific first
   - Generic fallbacks last
5. Wait up to 5s for element to appear
6. Click matched element
7. Trigger intelligence update
8. Return result

**Calls**:
- `waitForSelector(selector, timeout)`
- `chrome.runtime.sendMessage()` with type 'request_scan'

**Called by**:
- Message listener (type: 'execute_capability')

**Example Flow**:
```
Execute capability "RetrieveTranscript"
  ├─> Load config for youtube.com
  ├─> Check URL contains "/watch?v="
  ├─> Try selector: "button.ytp-subtitles-button"
  ├─> Element found: click
  ├─> Wait for transcript panel
  ├─> Request scan to capture transcript
  └─> Return success
```

---

### 10. YouTube-Specific Functions

#### `IntelligenceEngine.prototype.extractYoutubeTranscriptData()`
**Purpose**: Extract YouTube video transcript
**Returns**: Transcript object or null

**Structure**:
```javascript
{
  videoId: "abc123",
  title: "Video Title",
  url: "https://youtube.com/watch?v=abc123",
  segments: [
    {
      timestamp: "0:00",
      seconds: 0,
      text: "Welcome to this video"
    },
    {
      timestamp: "0:05",
      seconds: 5,
      text: "Today we'll discuss..."
    }
  ],
  signature: "sha256hash...",
  capturedAt: 1234567890
}
```

**Process**:
1. Get video ID: `getYoutubeVideoId()`
2. Get title: `extractYoutubeVideoTitle()`
3. Find transcript segments: `ytInitialPlayerResponse.captions`
4. Parse segment data (timestamp + text)
5. Generate signature: `buildTranscriptSignature(segments)`
6. Return complete transcript

**Calls**:
- `getYoutubeVideoId()`
- `extractYoutubeVideoTitle()`
- `buildTranscriptSignature(segments)`

**Called by**:
- `scanAndRegisterPageElements()`
- `prepareIntelligenceData()`

---

#### `IntelligenceEngine.prototype.collectYoutubeCardDescriptors(existingDescriptors, roots)`
**Purpose**: Collect YouTube video card elements
**Returns**: Array of video card descriptors

**Process**:
1. Find card containers: `ytd-rich-item-renderer`, `ytd-video-renderer`
2. For each card:
   - Extract thumbnail
   - Extract title link
   - Extract metadata (duration, views, channel)
   - Extract video URL
3. Deduplicate by URL
4. Return descriptors

**Called by**:
- `scanAndRegisterPageElements()`

---

#### `IntelligenceEngine.prototype.registerYoutubeLinksFromNode(rootNode)`
**Purpose**: Register YouTube video links as navigate actions
**Process**:
1. Find all links in node
2. Filter for video URLs (`/watch?v=`)
3. Register each as navigate action
4. Track registered URLs to prevent duplicates

**Calls**:
- `registerActionableElement(element, 'navigate')`

**Called by**:
- `scanAndRegisterPageElements()`

---

### 11. Message Handling

#### Chrome Runtime Message Listener
**Purpose**: Handle messages from service worker
**Location**: `chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {})`

**Message Types**:

1. **execute_scan**
```javascript
{
  type: 'execute_scan',
  pageVersion: 1,
  url: "https://...",
  trigger: "navigation"
}
```
**Action**: Call `executeScanWithSettle(pageVersion, url, trigger)`

---

2. **execute_action**
```javascript
{
  type: 'execute_action',
  data: {
    actionId: "a_id_42",
    actionType: "click",
    params: { value: "text", submit: true }
  }
}
```
**Action**: Call `intelligenceEngine.executeAction(actionId, actionType, params)`

---

3. **execute_capability**
```javascript
{
  type: 'execute_capability',
  action: "RetrieveTranscript",
  params: {}
}
```
**Action**: Call `capabilityPipelineExecutor(action, params)`

---

4. **get_page_text**
```javascript
{
  type: 'get_page_text'
}
```
**Action**: Call `intelligenceEngine.extractSemanticTextWithIds()`

---

5. **get_intelligence_data**
```javascript
{
  type: 'get_intelligence_data'
}
```
**Action**: Call `intelligenceEngine.prepareIntelligenceData()`

---

6. **discover_login_controls**
```javascript
{
  type: 'discover_login_controls',
  requireVisible: true
}
```
**Action**: Call `discoverLoginControls(options)`

---

7. **site_config_updated**
```javascript
{
  type: 'site_config_updated',
  config: { framework: "youtube", selectors: {...} }
}
```
**Action**: Update `window.currentSiteConfig` and `siteConfig`

---

### 12. DOM Change Detection

#### `initializeDOMChangeDetection()`
**Purpose**: Setup continuous DOM mutation monitoring
**Process**:
1. Create MutationObserver
2. Watch body for: childList, attributes, characterData
3. On mutation:
   - Increment `changeCount`
   - Update `lastChangeTime`
   - Check if significant: `isSignificantChange(mutations)`
   - Notify service worker: `notifyServiceWorkerOfChanges()`

**Note**: Does NOT trigger rescans (disabled to prevent SPA navigation chaos)

**Calls**:
- `isSignificantChange(mutations)`
- `notifyServiceWorkerOfChanges(changeInfo)`

**Called by**:
- Script initialization

---

#### `isSignificantChange(mutations)`
**Purpose**: Filter out noise from mutation stream
**Returns**: Boolean

**Criteria**:
- At least 3 mutations
- At least 2 seconds since last significant change
- Not just mouseover/focus events

**Called by**:
- `initializeDOMChangeDetection()` mutation callback

---

### 13. Utility Functions

#### `generateSelector(element)`
**Purpose**: Generate CSS selector for element
**Returns**: Selector string

**Priority**:
1. ID: `#element-id`
2. First class: `.class-name`
3. Nth-child path: `div > p:nth-child(2)`
4. Tag name: `div`

**Called by**: Many functions throughout codebase

---

#### `visible(element)`
**Purpose**: Check if element is visible
**Returns**: Boolean

**Checks**:
- rect.width > 0 && rect.height > 0
- visibility !== 'hidden'
- display !== 'none'

**Called by**: Many functions throughout codebase

---

#### `waitForSelector(selector, timeoutMs)`
**Purpose**: Poll for element to appear
**Returns**: Promise<Element>

**Process**:
1. Poll every 60ms
2. Check if element exists and is visible
3. Resolve when found
4. Reject after timeout

**Called by**:
- `capabilityPipelineExecutor()`
- Command functions (cmd_click, cmd_getText, etc.)

---

#### `sleep(ms)`
**Purpose**: Async delay
**Returns**: Promise that resolves after ms

**Called by**: Various async functions

---

## Data Flows

### 1. Initial Page Load Flow

```
Page loads
  ↓
Content script injected
  ↓
getSiteConfigDirect() - Load config
  ↓
scheduleInitialScan('load')
  ↓
pageIdleMonitor.waitForIdle() - Wait for network/DOM quiet
  ↓
executeScanWithSettle(null, url, 'initial_load')
  ↓
waitForDOMSettle() - Wait 200ms no mutations
  ↓
intelligenceEngine.scanAndRegisterPageElements()
  ├─> scanWithFrameworkSelectors() - Framework-specific
  ├─> registerActionableElement() - Each interactive element
  ├─> extractYoutubeTranscriptData() - YouTube-specific
  └─> queueIntelligenceUpdate()
  ↓
prepareIntelligenceData()
  ├─> extractSemanticTextWithIds() - Text extraction
  ├─> extractCapabilities() - Available capabilities
  └─> buildNormalizedPageRecords() - JSONL format
  ↓
chrome.runtime.sendMessage({type: 'scan_complete', ...})
  ↓
Service Worker receives
  ↓
Server receives via WebSocket
  ↓
Artifacts written:
  - page.jsonl
  - content.jsonl
  - llm_actions.json
  - llm_prompt.md
  - text.md
```

---

### 2. Action Execution Flow

```
LLM/Client sends command
  ↓
Server (ws_server.py)
  ↓
Service Worker (sw.js)
  ↓
Content Script: onMessage listener
  ↓
Type: 'execute_action'
  ↓
intelligenceEngine.executeAction(actionId, actionType, params)
  ↓
resolveActionableDomNode(actionId, descriptor)
  ├─> Try stored node cache
  ├─> Try dataset selector [data-ome-action-id="a_id_42"]
  ├─> Try descriptor selectors
  └─> Validate match
  ↓
Execute action based on type:
  - click: element.click()
  - setValue: element.value = params.value + optional submit
  - navigate: window.location.href = url
  - toggle: checkbox.checked = !checkbox.checked
  - select: select.value = params.value
  ↓
schedulePostActionIntelligenceRefresh(actionId, actionType)
  ↓
Return { ok: true, result: {...} }
  ↓
Response sent back through message chain
  ↓
Client receives result
```

---

### 3. Capability Execution Flow

```
LLM/Client: "Get YouTube transcript"
  ↓
Server: execute_capability message
  ↓
Service Worker: handleExecuteCapability()
  ↓
Content Script: execute_capability message
  ↓
capabilityPipelineExecutor("RetrieveTranscript", {})
  ↓
Load site config for youtube.com
  ↓
Check URL pattern: "/watch?v=" ✓
  ↓
Try selectors in order:
  1. "button[aria-label='Show transcript']"
  2. "button.ytp-subtitles-button"
  3. "button[aria-label*='transcript' i]"
  ↓
waitForSelector(selector, 5000)
  ↓
Element found: click
  ↓
Transcript panel opens
  ↓
Request scan: chrome.runtime.sendMessage({type: 'request_scan'})
  ↓
executeScanWithSettle() runs
  ↓
extractYoutubeTranscriptData() captures transcript
  ↓
Server writes transcript to @site_structures/transcripts/
  ↓
Return { success: true, elementFound: selector }
```

---

### 4. Intelligence Update Flow

```
DOM change detected OR action executed
  ↓
queueIntelligenceUpdate('normal')
  ↓
Queue update with priority
  ↓
processUpdateQueue() (debounced 500ms)
  ↓
prepareIntelligenceData()
  ├─> Extract actionable elements
  ├─> Extract semantic text
  ├─> Extract capabilities
  └─> Build normalized records
  ↓
sendIntelligenceUpdateToServiceWorker(data)
  ↓
chrome.runtime.sendMessage({type: 'intelligence_update', ...})
  ↓
Service Worker receives
  ↓
Forward to WebSocket server
  ↓
Server: save_intelligence_to_page_jsonl()
  ↓
Write artifacts:
  - page.jsonl (buildNormalizedPageRecords output)
  - content.jsonl (semantic text)
  - llm_actions.json (action map)
  - llm_prompt.md (LLM instructions)
  - text.md (markdown transcript)
```

---

### 5. Semantic Text Extraction Flow

```
extractSemanticTextWithIds() called
  ↓
Extract headings
  ├─> Query: h1, h2, h3, h4, h5, h6
  ├─> Filter visible
  └─> Assign text_id: t_id_0, t_id_1, ...
  ↓
Extract paragraphs
  ├─> Query: p
  ├─> Filter visible + has text
  └─> Assign text_id: t_id_N, ...
  ↓
Extract lists
  ├─> Query: ul, ol
  ├─> Extract li items
  └─> Assign text_id: t_id_M, ...
  ↓
Combine and sort by document order
  ↓
Generate selectors for each block
  ↓
Calculate positions
  ↓
Return array of text blocks:
[
  { text_id, type, text, selector, position, ... },
  ...
]
  ↓
Used in:
  - prepareIntelligenceData() -> contentElements
  - buildNormalizedPageRecords() -> text records
  - Server artifacts: content.jsonl, text.md
```

---

## Function Call Graph

### Top-Level Functions (Entry Points)

```
executeScanWithSettle(pageVersion, url, trigger)
  ├─> waitForDOMSettle({ maxWait, quietWindow })
  ├─> intelligenceEngine.scanAndRegisterPageElements()
  │   ├─> scanWithFrameworkSelectors()
  │   │   ├─> inferForcedElementCategory(element)
  │   │   └─> testSelectorsAfterScan()
  │   ├─> registerActionableElement(element, actionType)
  │   │   ├─> generateActionableId(element, actionType, reuseId)
  │   │   ├─> generateElementSelectors(element)
  │   │   │   └─> generatePositionSelector(element)
  │   │   ├─> extractKeyAttributes(element)
  │   │   ├─> inferSemanticRole(element, actionType, attributes)
  │   │   ├─> getCleanTextContent(element)
  │   │   ├─> extractElementUrl(element)
  │   │   ├─> isElementVisible(element)
  │   │   └─> storeActionableNode(actionId, element)
  │   ├─> registerContentElement(element, contentType)
  │   │   └─> generateContentId(element, contentType)
  │   ├─> extractYoutubeTranscriptData()
  │   │   ├─> getYoutubeVideoId()
  │   │   ├─> extractYoutubeVideoTitle()
  │   │   └─> buildTranscriptSignature(segments)
  │   ├─> collectYoutubeCardDescriptors(existingDescriptors, roots)
  │   └─> queueIntelligenceUpdate('normal')
  │       └─> processUpdateQueue()
  │           └─> prepareIntelligenceData()
  ├─> intelligenceEngine.prepareIntelligenceData()
  │   ├─> extractSemanticTextWithIds()
  │   │   ├─> extractHeadings()
  │   │   │   ├─> isElementVisible(element)
  │   │   │   └─> generateSimpleSelector(element)
  │   │   ├─> extractParagraphs()
  │   │   │   ├─> isElementVisible(element)
  │   │   │   └─> generateSimpleSelector(element)
  │   │   └─> extractLists()
  │   │       ├─> isElementVisible(element)
  │   │       └─> generateSimpleSelector(element)
  │   ├─> extractCapabilities()
  │   ├─> buildNormalizedPageRecords(options)
  │   │   ├─> extractSemanticTextWithIds()
  │   │   ├─> computeDomPath(node)
  │   │   └─> compareDomPaths(a, b)
  │   └─> extractYoutubeTranscriptData() [if YouTube]
  └─> startSignificantChangeDetector()
```

---

### Action Execution Tree

```
intelligenceEngine.executeAction(actionId, action, params)
  ├─> resolveActionableDomNode(actionId, descriptor)
  │   ├─> getStoredActionableNode(actionId)
  │   ├─> _matchesActionDescriptor(node, actionId, descriptor)
  │   │   ├─> _extractDescriptorLabel(descriptor)
  │   │   └─> _extractNodeLabel(node)
  │   └─> storeActionableNode(actionId, node)
  ├─> determineActionType(element)
  ├─> [Execute action based on type]
  └─> schedulePostActionIntelligenceRefresh(actionId, actionType)
      └─> [Triggers scan after delay]
```

---

### Capability Execution Tree

```
capabilityPipelineExecutor(capabilityAction, params)
  ├─> [Load site config]
  ├─> [Check URL pattern]
  ├─> waitForSelector(selector, timeout)
  │   ├─> visible(element)
  │   └─> sleep(60)
  ├─> element.click()
  └─> chrome.runtime.sendMessage({type: 'request_scan'})
```

---

### YouTube-Specific Tree

```
extractYoutubeTranscriptData()
  ├─> getYoutubeVideoId()
  ├─> extractYoutubeVideoTitle()
  ├─> [Parse ytInitialPlayerResponse]
  └─> buildTranscriptSignature(segments)

collectYoutubeCardDescriptors(existingDescriptors, roots)
  └─> [Query and parse video cards]

registerYoutubeLinksFromNode(rootNode)
  └─> registerActionableElement(element, 'navigate')
```

---

## Redundancy Analysis

### Potential Redundancies

#### 1. **Multiple Selector Generation Functions**
**Functions**:
- `generateSelector(element)` - Lines 1737-1776
- `IntelligenceEngine.prototype.generateSelector(element)` - Lines 5857-5875
- `IntelligenceEngine.prototype.generateSimpleSelector(element)` - Lines 5732-5758
- `IntelligenceEngine.prototype.generateElementSelectors(element)` - Lines 7583-7629
- `IntelligenceEngine.prototype.generatePositionSelector(element)` - Lines 7630-7649
- `buildSelectorCandidates(element)` - Lines 822-857

**Analysis**:
- **generateSelector()**: Simple utility (ID → class → nth-child)
- **generateSimpleSelector()**: Similar to generateSelector but within IntelligenceEngine
- **generateElementSelectors()**: Comprehensive array of selectors (ID, name, testid, aria-label, class, position)
- **generatePositionSelector()**: Nth-child path only
- **buildSelectorCandidates()**: Uses engine's generateElementSelectors if available

**Recommendation**: Consolidate into single comprehensive selector generator:
```javascript
// Keep: generateElementSelectors() - most comprehensive
// Remove: generateSelector(), generateSimpleSelector(), buildSelectorCandidates()
// Keep: generatePositionSelector() as helper for generateElementSelectors()
```

---

#### 2. **Multiple Visibility Check Functions**
**Functions**:
- `visible(element)` - Lines 1711-1721
- `IntelligenceEngine.prototype.isElementVisible(element)` - Lines 5822-5856

**Analysis**:
- `visible()`: Simple check (rect size + style display/visibility)
- `isElementVisible()`: Comprehensive check (rect, style, opacity, parent visibility)

**Recommendation**: Use `isElementVisible()` everywhere, remove `visible()`

---

#### 3. **Duplicate Text Extraction Functions**
**Functions**:
- `IntelligenceEngine.prototype.getCleanTextContent(element)` - Lines 7472-7522
- `IntelligenceEngine.prototype._extractNodeLabel(node)` - Lines 7834-7855
- `IntelligenceEngine.prototype._extractDescriptorLabel(descriptor)` - Lines 7808-7833
- Manual text extraction in multiple places

**Analysis**:
- `getCleanTextContent()`: Handles inputs, buttons, textareas with fallbacks
- `_extractNodeLabel()`: Extracts label for element matching
- `_extractDescriptorLabel()`: Extracts label from descriptor object
- Various inline: `element.innerText || element.textContent`

**Recommendation**: Standardize on `getCleanTextContent()` with explicit fallback chain

---

#### 4. **Multiple Scan Trigger Mechanisms**
**Functions**:
- `executeScanWithSettle()` - Main scan function
- `runScanAfterPageLoad()` - Triggers scan via SW
- `scheduleInitialScan()` - Schedules initial scan
- `intelligenceEngine.queueFullRescan(reason)` - Lines 5234-5243
- `startSignificantChangeDetector()` - Monitors and triggers scans
- `chrome.runtime.sendMessage({type: 'request_scan'})` - Direct SW request

**Analysis**:
All scan requests should flow through single entry point: Service Worker → `executeScanWithSettle()`

**Recommendation**: Consolidate all scan triggers to use `chrome.runtime.sendMessage({type: 'request_scan'})`

---

#### 5. **YouTube-Specific Duplication**
**Functions**:
- `extractYoutubeTranscriptData()` - Main extraction
- `collectTranscriptPayloads()` - Lines 9520-9531
- `collectYoutubeCardDescriptors()` - Video cards
- `collectAdditionalAnchorDescriptors()` - Lines 9823-9959
- `registerYoutubeLinksFromNode()` - Register links

**Analysis**:
- `collectTranscriptPayloads()`: Wrapper around `extractYoutubeTranscriptData()` - redundant
- `collectAdditionalAnchorDescriptors()`: Generic anchor collection (not YouTube-specific)

**Recommendation**: Remove `collectTranscriptPayloads()` wrapper

---

#### 6. **Multiple Action Type Determination Functions**
**Functions**:
- `determineActionType(element)` - Lines 1258-1320 (global)
- `IntelligenceEngine.prototype.determineActionType(element)` - Lines 5876-5921

**Analysis**: Duplicate implementations with same logic

**Recommendation**: Keep IntelligenceEngine version, remove global function

---

#### 7. **Multiple Intelligence Update Mechanisms**
**Functions**:
- `queueIntelligenceUpdate(priority)` - Lines 6061-6086
- `processUpdateQueue()` - Lines 6087-6132
- `sendIntelligenceUpdate()` - Lines 7182-7189 (simple wrapper)
- `sendIntelligenceUpdateToServiceWorker(data)` - Lines 7057-7084

**Analysis**:
- Queue system: Good for debouncing
- `sendIntelligenceUpdate()`: Redundant wrapper (7 lines, no logic)

**Recommendation**: Remove `sendIntelligenceUpdate()` wrapper

---

#### 8. **Login Discovery System (Unused?)**
**Functions**:
- `discoverLoginControls(options)` - Lines 905-1060
- `buildElementDescriptor(element, role)` - Lines 859-904
- `buildSelectorCandidates(element)` - Lines 822-857

**Analysis**: Comprehensive login form discovery, but appears unused in current flow

**Recommendation**: Verify usage before removing (may be called via message handler)

---

#### 9. **Page Idle Monitoring (Complex IIFE)**
**Function**: `pageIdleMonitor` - Lines 298-525

**Analysis**:
- Wraps fetch and XHR
- Tracks network activity
- Waits for idle state
- **Issue**: Complex, hard to debug
- **Alternative**: Modern approaches (PerformanceObserver, await fetch, load events)

**Recommendation**: Consider simplification if causing issues

---

#### 10. **Markdown Generation (Unused?)**
**Function**: `cmd_getPageMarkdown()` - Lines 1882+

**Analysis**: Crawl4AI-inspired markdown generation, but seems unused (no message handler calls it)

**Recommendation**: Verify usage, remove if orphaned

---

### Summary of Redundancies

| Category | Redundant Functions | Recommendation |
|----------|---------------------|----------------|
| Selector Generation | 6 functions | Consolidate to 2 (generateElementSelectors + generatePositionSelector) |
| Visibility Checks | 2 functions | Use isElementVisible() only |
| Text Extraction | 3+ functions | Standardize on getCleanTextContent() |
| Scan Triggers | 6 mechanisms | Route all through SW request_scan |
| YouTube | 2 wrappers | Remove collectTranscriptPayloads() |
| Action Types | 2 functions | Use IntelligenceEngine version |
| Intelligence Updates | 2 wrappers | Remove sendIntelligenceUpdate() |
| Login Discovery | Unused? | Verify usage |
| Page Idle Monitor | Complex IIFE | Consider simplification |
| Markdown Generation | Unused? | Verify usage |

---

## Key Insights for Old System Identification

### What This File Does Well
1. **Comprehensive element discovery** - Framework-specific + generic fallback
2. **Semantic text extraction** - Structured, tagged, positioned
3. **Capability system** - Declarative, config-driven
4. **Action execution** - Robust resolution with fallbacks
5. **YouTube integration** - Transcript extraction, video cards

### What Could Be Improved
1. **Too many duplicate functions** - Consolidate selector/visibility/text utilities
2. **Complex scan orchestration** - Multiple trigger paths create confusion
3. **Large monolithic file** - 11K lines, should be split into modules
4. **Unclear boundaries** - Global functions vs IntelligenceEngine methods
5. **Potential dead code** - Login discovery, markdown generation may be unused

### Questions for Old System Comparison
1. Does old system have similar selector generation redundancy?
2. How does old system handle scan triggers?
3. Is old system's semantic text extraction similar?
4. Does old system have capability pipeline?
5. What YouTube-specific features exist in old system?

---

## Function Reference Quick Index

### Scan & Orchestration
- `executeScanWithSettle(pageVersion, url, trigger)` - Main scan coordinator
- `waitForDOMSettle({ maxWait, quietWindow })` - DOM settle detection
- `startSignificantChangeDetector()` - Continuous DOM monitoring
- `scheduleInitialScan(reason, options)` - Initial scan scheduler
- `runScanAfterPageLoad()` - Page load scan trigger

### Site Configuration
- `getSiteConfigDirect()` - Load site config synchronously
- `scanWithFrameworkSelectors()` - Framework-specific element scanning
- `inferForcedElementCategory(element)` - Categorize forced elements
- `testSelectorsAfterScan()` - Verify selectors work

### Intelligence Engine - Core
- `IntelligenceEngine` - Constructor
- `scanAndRegisterPageElements()` - Main scan function
- `registerActionableElement(element, actionType)` - Register interactive element
- `registerContentElement(element, contentType)` - Register content element
- `prepareIntelligenceData()` - Build intelligence payload
- `queueIntelligenceUpdate(priority)` - Queue update
- `processUpdateQueue()` - Process update queue

### Intelligence Engine - Element Management
- `generateActionableId(element, actionType, reuseId)` - Generate action ID
- `generateElementSelectors(element)` - Generate selector array
- `generatePositionSelector(element)` - Nth-child path
- `generateSimpleSelector(element)` - Simple selector
- `extractKeyAttributes(element)` - Extract attributes
- `inferSemanticRole(element, actionType, attributes)` - Determine semantic role
- `getCleanTextContent(element)` - Extract text
- `extractElementUrl(element)` - Extract URL
- `isElementVisible(element)` - Comprehensive visibility check

### Intelligence Engine - Action Execution
- `executeAction(actionId, action, params)` - Execute action
- `resolveActionableDomNode(actionId, descriptor)` - Find DOM node
- `getActionableElement(actionId)` - Get element by ID
- `getContentElement(contentId)` - Get content by ID
- `searchActionableElements(criteria)` - Search elements
- `schedulePostActionIntelligenceRefresh(actionId, actionType)` - Post-action scan

### Intelligence Engine - Text Extraction
- `extractSemanticTextWithIds()` - Extract structured text
- `extractHeadings()` - Extract h1-h6
- `extractParagraphs()` - Extract paragraphs
- `extractLists()` - Extract lists
- `extractPageTextToMarkdown()` - Markdown format
- `extractCleanPageText()` - Plain text

### Intelligence Engine - Normalized Records
- `buildNormalizedPageRecords(options)` - Build JSONL records
- `computeDomPath(node)` - Calculate DOM path
- `compareDomPaths(a, b)` - Compare paths

### Intelligence Engine - Capabilities
- `extractCapabilities()` - Get available capabilities

### Intelligence Engine - YouTube
- `extractYoutubeTranscriptData()` - Extract transcript
- `extractYoutubeVideoTitle()` - Extract video title
- `getYoutubeVideoId()` - Get video ID
- `buildTranscriptSignature(segments)` - Generate signature
- `collectYoutubeCardDescriptors(existingDescriptors, roots)` - Video cards
- `registerYoutubeLinksFromNode(rootNode)` - Register links
- `getYoutubeLinkSelectors()` - Get selectors
- `registerYoutubeLockupLinks(registeredUrls)` - Register lockup links

### Capability Pipeline
- `capabilityPipelineExecutor(capabilityAction, params)` - Execute capability

### Utility Functions
- `generateSelector(element)` - Simple selector generation
- `visible(element)` - Simple visibility check
- `waitForSelector(selector, timeoutMs)` - Wait for element
- `sleep(ms)` - Async delay
- `hasUrl(element)` - Check if element has URL
- `determineActionType(element)` - Determine action type

### DOM Change Detection
- `initializeDOMChangeDetection()` - Setup mutation observer
- `isSignificantChange(mutations)` - Filter mutations
- `notifyServiceWorkerOfChanges(changeInfo)` - Send to SW
- `getDOMChangeStatus()` - Get current status
- `disableDOMChangeDetection()` - Stop observer
- `enableDOMChangeDetection()` - Start observer
- `notifyNetworkActivity(eventType, url, status)` - Network tracking

### Page Idle Monitoring
- `pageIdleMonitor.waitForIdle({ maxWait, quietWindow })` - Wait for idle
- `pageIdleMonitor.markChange()` - Mark activity

### Login Discovery
- `discoverLoginControls(options)` - Find login forms
- `buildElementDescriptor(element, role)` - Build descriptor
- `buildSelectorCandidates(element)` - Build selectors

### Command Functions (Unused?)
- `cmd_waitFor({ selector, timeoutMs })` - Wait command
- `cmd_getText({ selector })` - Get text command
- `cmd_click({ selector })` - Click command
- `cmd_getPageMarkdown()` - Markdown command

### Focus Management
- `applyConfiguredFocus(reason)` - Apply focus to input

### Keep-Alive
- `ensureKeepAlivePortConnection()` - Maintain SW connection

---

**End of Documentation**

This documentation provides a complete reference for analyzing redundancies between the old and new systems. Use the function reference and call graphs to identify duplicate functionality and consolidation opportunities.
