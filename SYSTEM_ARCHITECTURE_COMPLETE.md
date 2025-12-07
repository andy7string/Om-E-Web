# 🏗️ Om-E-Web Complete System Architecture

**Version:** 2.1
**Last Updated:** 2025-12-07
**Status:** Complete End-to-End Analysis (Updated with HUD Action Pipeline)
**Based On:** contentdiscover.md, swdiscover.md, wsdiscover.md, test_navigationdiscover.md, 01_sw.md, 02_content.md, 03_ws_server.md

---

## Executive Summary

The **Om-E-Web Browser Intelligence Extension** is a sophisticated web automation system that bridges LLMs to browser actions through a three-tier architecture:

```
Test Client / LLM System (Python)
         ↕ WebSocket
    WebSocket Server
         ↕ WebSocket
    Service Worker
         ↕ Runtime Messages
    Content Script
         ↕ DOM APIs
    Web Page (DOM)
         ↕ HUD/Orb UI
    User Interaction (Chat)
```

**Key Pipelines:**
1. **Standard Action-ID Pipeline** - Pre-registered element actions via action IDs
2. **Capability Pipeline** - Dynamic selector-based execution for lazy-loaded content
3. **Iframe Pipeline** - Cross-origin iframe element interaction
4. **HUD/Orb Pipeline** - Floating UI with orb themes, chat panel, and user interaction
5. **Chat Pipeline** - Bidirectional messaging between HUD and LLM via WebSocket
6. **HUD Action Pipeline** - LLM-driven UI control via `_hud_action` capability responses

**Current Status:** Functionally complete with full HUD/Chat integration. Known coordination issues:
- **Duplicate element ID assignment** (8 overlapping scan triggers)
- **Server responsiveness degradation** (5-30 second blocking I/O)
- **Multi-tab workflow breakage** (global action lock)
- **Code maintainability crisis** (800-line functions, 120+ functions)

---

## 1. System Components Overview

### Component 1: Test Navigation Client (`test_navigation.py`)

**Role:** Test interface and LLM integration point  
**Language:** Python 3.8+  
**Responsibilities:**
- Send automation commands to WebSocket server
- Support multiple command modes (click, navigate, setValue)
- Provide both CLI and programmatic interfaces
- Non-interactive by default (suitable for LLM integration)

**Key Features:**
- Convenience shortcuts (exec_action, set_value, click, navigate_link, navigate_url)
- Connection resilience (auto-reconnect)
- Async/await for non-blocking operations
- Optional interactive REPL mode

**Critical Issues:**
- ⚠️ Three command modes are redundant
- ⚠️ No response validation (can't tell if action succeeded)
- ⚠️ Hard-coded server URL (not configurable)

---

### Component 2: WebSocket Server (`ws_server.py`)

**Role:** Central message broker and intelligence processor  
**Language:** Python 3.8+  
**Port:** 17892  
**Responsibilities:**
- Route commands from test clients to extension
- Collect and process intelligence from content script
- Generate LLM-friendly data structures
- Manage file-based persistence of page state

**Key Features:**
- Multiple client support (test clients + extension)
- Client tracking (COMMAND_CLIENTS dict)
- Shortcut normalization (converts convenience syntax to standard messages)
- Automatic site map processing pipeline
- Real-time file persistence (@site_structures directory)

**Output Files Generated:**
- `page.jsonl` - Current page intelligence (actionable elements)
- `content.jsonl` - Page content structure (headings, paragraphs, lists)
- `llm_actions.json` - LLM-friendly action mappings
- `llm_prompt.md` - Compact prompt for LLM consumption
- `text.md` - Extracted page text as markdown
- `[hostname]_processed.jsonl` - Processed site map with classifications
- `[hostname]_processed_cleaned.jsonl` - Optimized site map for LLM

**Critical Issues:**
- 🔴 **CRITICAL:** Synchronous file I/O blocks entire async handler
- 🔴 **CRITICAL:** O(n²) element deduplication (6,000 elements = 10s)
- 🔴 **CRITICAL:** Massive 800-line handler function (unmaintainable)
- 🟠 **HIGH:** No input validation (malformed messages crash server)
- 🟠 **HIGH:** Inefficient element classification (184-line nested function)

**Performance:**
- Intelligence update processing: 100-500ms per update
- Site map processing: 5-30 seconds (blocks server)
- Memory usage: O(n) where n = elements on page

---

### Component 3: Service Worker (`sw.js`)

**Role:** Message router and tab lifecycle manager  
**Language:** JavaScript (Chrome Extension MV3)  
**Responsibilities:**
- Maintain WebSocket connection to server
- Route commands between server and content scripts
- Manage tab state and lifecycle
- Track scan state (prevent duplicate scans of same URL)
- Handle keep-alive port to prevent suspension

**Key Features:**
- Multiple tab support (tabs.query, tabs.sendMessage)
- Tab state tracking (tabScanState, internalTabState)
- Smart tab finding (multi-strategy fallback chain)
- Action execution safety (prevent refresh during action)
- Proactive site config distribution

**State Storage:**
- `tabScanState` - Map<tabId, {lastUrl, lastScanAt, reason}>
- `internalTabState` - Map<tabId, enhanced metadata with DOM tracking>
- `siteConfigs` - Object of framework configs (cached locally)
- `actionInProgress` - Boolean flag (GLOBAL - PROBLEMATIC)
- `lastActiveTabId` - Current active tab ID
- `tabCache` - Map<tabId, cached data>

**Critical Issues:**
- 🔴 **CRITICAL:** Global `actionInProgress` flag breaks multi-tab workflows
- 🔴 **CRITICAL:** Unconditional content script reinjection on tab activation
- 🔴 **CRITICAL:** Three scan triggers (onCompleted, onHistoryStateUpdated, onUpdated)
- 🟠 **HIGH:** Redundant state tracking (tabScanState vs internalTabState)
- 🟠 **HIGH:** No coordination with content.js scan state

**Scan Triggers:**
1. `chrome.webNavigation.onCompleted` - After page load completes
2. `chrome.webNavigation.onHistoryStateUpdated` - After SPA route change
3. `chrome.tabs.onUpdated` (status='complete') - When tab fully loaded

---

### Component 4: Content Script (`content.js`)

**Role:** DOM executor and intelligence gatherer  
**Language:** JavaScript (Chrome Extension MV3)  
**Responsibilities:**
- Execute commands on DOM (click, getText, navigate, setValue)
- Scan DOM for interactive and content elements
- Detect DOM changes in real-time
- Generate intelligence about page state
- Register element IDs and maintain action mapping
- Communicate page state back to service worker

**Key Features:**
- Page idle monitor (detects when page settles)
- MutationObserver for change detection
- Fetch/XHR wrapping for inflight request tracking
- ChangeAggregator for batching mutations (500ms window)
- IntelligenceEngine for element registration and analysis
- Smart resolution chain for element interaction
- Multi-strategy fallback for element finding

**State Storage:**
- `window.intelligenceEngine` - Singleton managing all actionable elements
- `changeAggregator` - Batches DOM mutations before processing
- `window.currentSiteConfig` - Framework-specific config from server
- `pageIdleMonitor` - Detects page idle state
- `window.omEWebContentScriptLoaded` - Guard flag (prevents duplicate injection)
- `elementCounter` - Atomic counter for ID generation (RESETS ON SCAN)

**Critical Issues:**
- 🔴 **CRITICAL:** 8 overlapping scan triggers (7 in content.js + 3 in sw.js = duplication)
- 🔴 **CRITICAL:** elementCounter resets on each scan (causes ID collision)
- 🔴 **CRITICAL:** Scan can be triggered from 7 different places
- 🟠 **HIGH:** Element markers deleted before re-registration
- 🟠 **HIGH:** No awareness of service worker's scan state
- 🟠 **HIGH:** Multiple focus/retry timers (300+ lines of timer logic)

**Scan Triggers (In This File):**
1. Fallback timer (4 seconds) - Line 244
2. Page load event (DOMContentLoaded) - Line 1634
3. Idle monitor completion - Line 170
4. Event-driven updates (visibility, focus, nav) - Line 7145
5. DOM structure changes auto-registration - Line 3878

**Output:**
- Intelligence updates sent to service worker
- DOM change notifications sent to service worker
- Action execution confirmations sent to service worker

---

## 2. Complete Message Flow: End-to-End

### Flow 1: Test Client → Server → Extension → DOM (Click Action)

```
┌─ TEST CLIENT (test_navigation.py)
│
├─ User runs:
│  python3 test_navigation.py --action-id a_id_133
│
├─ Builds payload:
│  {
│    "type": "llm_instruction",
│    "data": {"actionId": "a_id_133"}
│  }
│
└─ Sends via WebSocket to ws://localhost:17892
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ handler() receives message in: async for raw in ws:
│
├─ Parses: msg = json.loads(raw)
│
├─ Routes based on msg.get("type") == "llm_instruction"
│
├─ Checks EXTENSION_WS (connection to sw.js)
│
├─ Calls: await EXTENSION_WS.send(json.dumps(msg))
│
├─ Tracks: COMMAND_CLIENTS[message_id] = test_client_ws
│
└─ Waits for response from extension
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ ws.onmessage event fires
│
├─ handleServerMessage(messageData) parses message
│
├─ Checks: if msg.get("type") == "llm_instruction"
│
├─ Calls: handleExecuteLLMAction(message, sendResponse)
│
├─ Sets: actionInProgress = true [GLOBAL FLAG - PROBLEMATIC]
│
├─ Finds: activeTab = await findActiveTab()
│
├─ Injects: chrome.scripting.executeScript({ files: ['content.js'] })
│
├─ Sends: chrome.tabs.sendMessage(activeTab.id, {
│    type: "execute_action",
│    data: { actionId: "a_id_133" }
│  })
│
├─ Waits: const response = await chrome.tabs.sendMessage(...)
│
└─ Sets: actionInProgress = false [UNLOCKS]
                    ↓
┌─ CONTENT SCRIPT (content.js)
│
├─ chrome.runtime.onMessage listener fires
│
├─ Message handler: if (message.type === "execute_action")
│
├─ Extracts: actionId = "a_id_133"
│
├─ Looks up: element = intelligenceEngine.getActionableElement("a_id_133")
│
├─ Calls: executeAction(actionId)
│  ├─ Smart resolution chain:
│  │  1. findVisibleElement() - Find element in DOM
│  │  2. hasValidDimensions() - Check if clickable
│  │  3. fixViewportPositioning() - Adjust CSS if needed
│  │  4. forceElementVisibility() - Override display:none
│  │  5. universalClick() - Try 5 click strategies
│  │  6. verifyClickWorked() - Check if state changed
│
├─ Returns: { ok: true, clicked: true }
│
└─ sendResponse({ ok: true, result: { clicked: true } })
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ Receives response in chrome.tabs.sendMessage callback
│
├─ Sends: sendSuccessResponse(message.id, response)
│  └─ Calls: sendToServer({
│       id: message.id,
│       ok: true,
│       result: response,
│       error: null
│     })
│
└─ ws.send(JSON.stringify({...}))
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ handler() receives response message
│
├─ Checks: if "id" in msg and ("ok" in msg or "error" in msg)
│
├─ Finds: target_client = COMMAND_CLIENTS.pop(msg["id"])
│
├─ Routes: await target_client.send(json.dumps(msg))
│
└─ Test client receives response!
                    ↓
┌─ TEST CLIENT (test_navigation.py)
│
├─ response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
│
├─ Parses: response = json.loads(response)
│
├─ Prints: "✅ Response: {'ok': True, 'result': {'clicked': True}}"
│
└─ Closes: await websocket.close()
```

**Total Time:** 200-500ms  
**Blocking Points:**
- Content script waits for DOM to settle (50-100ms)
- Element visibility checks and retry logic (50-200ms)
- Message serialization/deserialization (10-20ms)

---

### Flow 2: Content Script → Server → File System (Intelligence Update)

```
┌─ CONTENT SCRIPT (content.js)
│
├─ MutationObserver fires
│
├─ Detects: childList changes, attribute changes, text changes
│
├─ Calls: changeAggregator.addChange(change)
│
├─ Groups changes over 500ms window
│
├─ Calls: intelligenceEngine.processEvent(changeGroup)
│
├─ Analyzes:
│  ├─ analyzeStructureChanges() → registerInteractiveSubtree() (SCAN TRIGGER #4)
│  ├─ analyzeStateChanges()
│  ├─ analyzeContentChanges()
│  └─ analyzeElementTransformation()
│
├─ Generates intelligence:
│  ├─ pageState { currentView, interactiveElements, contentElements, ... }
│  ├─ actionableElements [] (with IDs, selectors, text, etc.)
│  ├─ contentElements [] (headings, paragraphs, lists, etc.)
│  ├─ recentInsights [] (what changed and why)
│  └─ actionMapping {} (actionId → action descriptor)
│
├─ Queues: intelligenceEngine.queueIntelligenceUpdate('normal')
│
├─ Sends: chrome.runtime.sendMessage({
│    type: "intelligence_update",
│    data: { pageState, actionableElements, contentElements, ... }
│  })
│
└─ Message goes to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ chrome.runtime.onMessage listener fires
│
├─ Validates:
│  ├─ sender.tab exists (has tab context)
│  ├─ sender.tab.id === activeTab.id (only active tab!)
│  └─ intelligenceData.actionableElements is array
│
├─ Enriches with metadata:
│  ├─ tabId: sourceTabId
│  ├─ tabUrl: activeTab.url
│  ├─ tabTitle: activeTab.title
│
├─ Sends: ws.send(JSON.stringify({
│    type: "intelligence_update",
│    tabId, tabUrl, tabTitle,
│    data: intelligenceData
│  }))
│
└─ Message goes to Server
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ handler() receives: async for raw in ws:
│
├─ Checks: if msg.get("type") == "intelligence_update"
│
├─ [🔴 CRITICAL: Blocks here with sync I/O!]
│
├─ Calls: await save_intelligence_to_page_jsonl(data) [SYNC I/O - BLOCKING!]
│  ├─ Ensures: @site_structures directory exists
│  ├─ Extracts: normalized records from intelligence data
│  ├─ Writes: @site_structures/page.jsonl
│  └─ Returns: filepath
│
├─ Calls: await save_content_to_content_jsonl(data) [SYNC I/O - BLOCKING!]
│  ├─ Categorizes: headings, paragraphs, lists, images, tables
│  ├─ Consolidates: content_structure from elements
│  └─ Writes: @site_structures/content.jsonl
│
├─ Calls: await process_actionable_elements_for_llm(actionable_elements)
│  ├─ Maps: Each element to LLM-friendly action description
│  └─ Writes: @site_structures/llm_actions.json
│
├─ Calls: await generate_llm_prompt() [SYNC I/O - BLOCKING!]
│  ├─ Reads: text.md, page.jsonl
│  ├─ Extracts: Page title, URL, action descriptions
│  └─ Writes: @site_structures/llm_prompt.md
│
├─ Calls: await save_page_text_to_markdown(text_data)
│  └─ Writes: @site_structures/text.md
│
└─ [Total time: 100-500ms - BLOCKS OTHER MESSAGES!]

Result: Files written to @site_structures/ directory
        LLM can read these files for context
```

**Total Time:** 100-500ms (blocks entire server)  
**Files Created:** 5-7 JSONL/MD files  
**Critical Issue:** Server completely unresponsive during this time

---

### Flow 3: Server → Extension → Content Script (Site Config Update)

```
┌─ EXTERNAL SOURCE (e.g., LLM system)
│
├─ Sends to server:
│  {
│    "type": "site_configs_update",
│    "data": {
│      "github.com": { "framework": "react", "selectors": {...} },
│      "amazon.com": { "framework": "react", "selectors": {...} },
│      "default": { "framework": "generic", "selectors": {...} }
│    }
│  }
│
└─ WebSocket message arrives at server
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ handler() receives message
│
├─ Checks: if msg.get("type") == "site_configs_update"
│
├─ Stores: siteConfigs = message.data (in-memory cache)
│
├─ Persists: chrome.storage.local.set({ siteConfigs: message.data })
│
├─ Broadcasts to ALL tabs:
│  for tab in await chrome.tabs.query({}):
│    await chrome.tabs.sendMessage(tab.id, {
│      type: "site_configs_update",
│      data: message.data
│    })
│
└─ Message sent to all content scripts
                    ↓
┌─ CONTENT SCRIPT (content.js) [in each tab]
│
├─ chrome.runtime.onMessage listener fires
│
├─ Checks: if (message.type === "site_configs_update")
│
├─ Sets: window.currentSiteConfig = message.data[currentDomain]
│
├─ Now uses framework-specific selectors:
│  ├─ scanWithFrameworkSelectors() - Use framework-aware scanning
│  ├─ Framework-specific CSS selectors
│  └─ Better element detection accuracy
│
└─ All tabs updated synchronously
```

**Total Time:** <50ms  
**Coverage:** All open tabs get config  
**Pattern:** Event-driven broadcast (good)

---

## 3. Capability Pipeline Architecture

### Overview

The **Capability Pipeline** is a parallel execution system that complements the standard action-ID pipeline. While the standard pipeline relies on pre-registered element IDs (`a_id_XXX`), the capability pipeline performs **dynamic, on-demand element discovery** using selector-based searches. This enables interaction with lazy-loaded content, modal dialogs, and site-specific features that may not be present during initial page scan.

**Key Differentiator:** Site-specific capabilities are defined entirely in configuration files (`site_configs/*.json`) without modifying runtime code, enabling rapid addition of new automation capabilities.

### Architecture Comparison

```
┌─ STANDARD ACTION-ID PIPELINE (95% of use cases) ────────────────────────┐
│                                                                          │
│  1. Page loads → content.js scans DOM                                   │
│  2. Elements registered with a_id_0, a_id_1, a_id_2, etc.              │
│  3. Artifacts generated (page.jsonl, llm_actions.json)                  │
│  4. LLM reads artifacts → sends execute_llm_action with actionId        │
│  5. Content script looks up element by ID → executes action             │
│                                                                          │
│  ✅ Fast (no DOM search needed)                                         │
│  ✅ Reliable (element already registered)                               │
│  ❌ Can't handle lazy-loaded/modal content not present at scan time     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─ CAPABILITY PIPELINE (edge cases, dynamic content) ──────────────────────┐
│                                                                          │
│  1. LLM/Client sends execute_capability with action name                │
│  2. Content script loads site config for current domain                 │
│  3. Looks up capability by action name → gets selector array           │
│  4. Tries selectors in order (specific → generic)                       │
│  5. Waits up to 5s for lazy-loaded elements                            │
│  6. Executes action (click, setValue, etc.)                             │
│  7. Triggers intelligence update                                        │
│                                                                          │
│  ✅ Handles lazy-loaded/modal content                                   │
│  ✅ Site-specific (custom selectors per domain)                         │
│  ✅ Config-driven (no code changes needed)                              │
│  ❌ Slower (requires DOM search)                                        │
│  ❌ Less reliable (selectors may change)                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Complete Message Flow: Capability Execution

```
┌─ TEST CLIENT / LLM (test_navigation.py)
│
├─ User runs:
│  python3 test_navigation.py --command capability \
│    --capability SendPrompt --value "Hello" --submit
│
├─ Builds payload:
│  {
│    "type": "execute_capability",
│    "action": "SendPrompt",
│    "params": {
│      "value": "Hello",
│      "submit": true
│    }
│  }
│
└─ Sends via WebSocket to ws://localhost:17892
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ handler() receives message (Line 3242)
│
├─ Checks: if msg.get("type") == "execute_capability"
│
├─ Extracts:
│  action = msg.get("action")  # "SendPrompt"
│  params = msg.get("params", {})  # {"value": "Hello", "submit": true}
│
├─ Forwards to extension (Line 3260-3265):
│  capability_command = {
│    "type": "execute_capability",
│    "action": "SendPrompt",
│    "params": {"value": "Hello", "submit": true}
│  }
│  await EXTENSION_WS.send(json.dumps(capability_command))
│
└─ No processing in server - pure message routing
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ ws.onmessage event fires
│
├─ handleServerMessage() parses message (Line 944)
│
├─ Checks: if message.type === "execute_capability"
│
├─ Calls: handleExecuteCapability(message) (Line 1733-1767)
│  ├─ Extracts: action, params from message
│  ├─ Finds: activeTab = await findActiveTab()
│  ├─ Builds: capabilityMessage = {
│  │    type: "execute_capability",
│  │    action: "SendPrompt",
│  │    params: {"value": "Hello", "submit": true}
│  │  }
│  └─ Forwards: chrome.tabs.sendMessage(activeTab.id, capabilityMessage)
│
└─ Message sent to content script
                    ↓
┌─ CONTENT SCRIPT (content.js)
│
├─ chrome.runtime.onMessage listener fires
│
├─ Message handler: if (message.type === "execute_capability")
│
├─ Calls: capabilityPipelineExecutor(action, params) (Line 10595-10828)
│
├─ STEP 1: Load Site Config (Lines 10605-10625)
│  ├─ Tries: siteConfig || window.currentSiteConfig
│  ├─ Fallback: getSiteConfigDirect() if not available
│  ├─ Config example for chatgpt.com:
│  │  {
│  │    "framework": "chatgpt",
│  │    "capabilities": {
│  │      "sendPrompt": {
│  │        "action": "SendPrompt",
│  │        "label": "Send text to ChatGPT prompt",
│  │        "selectors": [
│  │          "#prompt-textarea",
│  │          "div.ProseMirror[contenteditable='true']",
│  │          "div[contenteditable='true']"
│  │        ],
│  │        "submitSelector": "button[data-testid='send-button']"
│  │      }
│  │    }
│  │  }
│
├─ STEP 2: Lookup Capability (Lines 10627-10643)
│  ├─ Searches: Object.keys(config.capabilities)
│  ├─ Finds: capability where cap.action === "SendPrompt"
│  ├─ Returns: capability config object
│  └─ Error if not found: "No capability config found for action: SendPrompt"
│
├─ STEP 3: Dynamic Element Discovery (Lines 10644-10698)
│  ├─ Gets: selectors array from capability config
│  ├─ Tries each selector in order:
│  │  1. "#prompt-textarea"
│  │  2. "div.ProseMirror[contenteditable='true']"
│  │  3. "div[contenteditable='true']"
│  │
│  ├─ For each selector:
│  │  ├─ Try: document.querySelectorAll(selector)
│  │  ├─ If found: Break loop, use first element
│  │  ├─ If not found: Continue to next selector
│  │
│  ├─ If still not found after all selectors:
│  │  ├─ Wait: Use waitForElement(selector, 5000) for each selector
│  │  ├─ Uses: MutationObserver to watch for element appearing
│  │  ├─ Timeout: 5 seconds per selector
│  │
│  └─ If STILL not found:
│     └─ Throw: "Element not found using any configured selectors"
│
├─ STEP 4: Execute Action (Lines 10719-10802)
│  │
│  ├─ Determine element type:
│  │  ├─ isInput: tagName === 'input' || tagName === 'textarea'
│  │  ├─ isContentEditable: element.isContentEditable || contenteditable='true'
│  │
│  ├─ IF input/textarea and params.value provided:
│  │  │
│  │  ├─ Handle contenteditable (ProseMirror/Lexical):
│  │  │  ├─ targetElement.focus()
│  │  │  ├─ targetElement.innerHTML = '<p><br></p>' (clear)
│  │  │  ├─ document.execCommand('insertText', false, params.value)
│  │  │  └─ Dispatch: input event
│  │  │
│  │  ├─ Handle regular input/textarea:
│  │  │  ├─ targetElement.value = params.value
│  │  │  ├─ Dispatch: input event
│  │  │  └─ Dispatch: change event
│  │  │
│  │  └─ IF params.submit === true:
│  │     ├─ Wait: 300ms (let React enable submit button)
│  │     │
│  │     ├─ Try submitSelector from config:
│  │     │  └─ submitBtn = document.querySelector(capability.submitSelector)
│  │     │
│  │     ├─ Fallback selectors if not found:
│  │     │  ├─ 'button[data-testid="send-button"]'
│  │     │  ├─ '#composer-submit-button'
│  │     │  ├─ 'button[type="submit"]'
│  │     │  ├─ 'button[aria-label*="Send" i]'
│  │     │  ├─ 'button[aria-label*="Submit" i]'
│  │     │  └─ 'button[aria-label*="Search" i]'
│  │     │
│  │     ├─ If submit button found:
│  │     │  └─ submitBtn.click()
│  │     │
│  │     └─ Last resort (no button found):
│  │        └─ Dispatch Enter key event to target element
│  │
│  └─ ELSE (clickable element):
│     └─ targetElement.click()
│
├─ STEP 5: Wait for Result (Line 2804-2805)
│  └─ Wait: 2000ms (let action complete)
│
├─ STEP 6: Trigger Intelligence Update (Lines 10807-10814)
│  └─ Call: intelligenceEngine.queueIntelligenceUpdate('high', 'capability_SendPrompt')
│  └─ Wait: 1000ms (let scan complete)
│
├─ STEP 7: Return Success (Lines 10816-10821)
│  └─ Return: {
│       success: true,
│       message: "Capability SendPrompt executed successfully",
│       elementFound: "div.ProseMirror[contenteditable='true']",
│       matchedBy: "selector"
│     }
│
└─ Response sent back through Service Worker → Server → Client
```

**Total Time:** 2-8 seconds (includes waiting periods)
**Blocking Points:**
- Element discovery with waits (0-5 seconds if lazy-loaded)
- Action completion wait (2 seconds)
- Intelligence update (1 second)

### Site Config Structure

**Location:** `web_extension/site_configs/*.json`

**Capability Definition Schema:**
```json
{
  "framework": "site_name",
  "url_patterns": ["example.com", "*.example.com"],
  "capabilities": {
    "capabilityName": {
      "action": "ActionName",
      "label": "Human-readable description",
      "description": "Detailed usage instructions with examples",
      "url_pattern": "optional_url_substring_for_activation",
      "inputType": "text | click",
      "paramName": "text | value",
      "selectors": [
        "specific.selector#with-id",
        "less.specific[aria-label='label']",
        "generic[contenteditable='true']"
      ],
      "submitMethod": "enter | click | form",
      "submitSelector": "button[data-testid='submit-btn']"
    }
  }
}
```

**Field Descriptions:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `action` | ✅ Yes | String | Unique identifier for capability (e.g., "SendPrompt") |
| `label` | ✅ Yes | String | Short human-readable name for UI display |
| `description` | ⚠️ Recommended | String | Usage instructions with CLI examples |
| `url_pattern` | ❌ No | String | URL substring to match (capability only active on matching URLs) |
| `inputType` | ❌ No | String | "text" (input field) or "click" (button/link) |
| `paramName` | ❌ No | String | Parameter name for input value |
| `selectors` | ✅ Yes | Array<String> | CSS selectors tried in order (specific → generic) |
| `submitMethod` | ❌ No | String | How to submit: "enter" (default), "click", or "form" |
| `submitSelector` | ❌ No | String | CSS selector for submit button (only used when submitMethod="click") |

**Submit Method Options:**

| Method | When to Use | Behaviour |
|--------|-------------|-----------|
| `enter` | Search inputs (YouTube, Google) | Dispatches Enter keydown event on input element. **Default if not specified.** |
| `click` | Chat apps (ChatGPT, Claude) | Clicks button found via `submitSelector` or fallback selectors |
| `form` | Traditional forms | Calls `form.submit()` on parent form element |

**Decision Guide:**
- Use `enter` for search boxes that submit on Enter key (most search inputs)
- Use `click` for chat/messaging apps where a send button must be clicked
- Use `form` for traditional HTML forms with submit buttons

### Example Configurations

#### ChatGPT Send Prompt
```json
{
  "framework": "chatgpt",
  "capabilities": {
    "sendPrompt": {
      "action": "SendPrompt",
      "label": "Send text to ChatGPT prompt",
      "description": "Type a prompt into ChatGPT. Usage:\n# Type without submitting\npython3 test_navigation.py --command capability --capability SendPrompt --value \"Explain quantum computing\" --no-submit\n# Type and submit\npython3 test_navigation.py --command capability --capability SendPrompt --value \"Write a Python function\" --submit",
      "url_pattern": "chatgpt.com",
      "inputType": "text",
      "paramName": "text",
      "selectors": [
        "#prompt-textarea",
        "div.ProseMirror[contenteditable='true']",
        "div[contenteditable='true'][id='prompt-textarea']",
        "div[contenteditable='true']"
      ],
      "submitMethod": "click",
      "submitSelector": "button[data-testid='send-button']"
    }
  }
}
```

**Note:** ChatGPT uses `submitMethod: "click"` because:
1. The input is a `contenteditable` div (ProseMirror editor), not a form input
2. Enter key creates a new line, doesn't submit
3. The send button must be explicitly clicked

**Selector Priority Explanation:**
1. `#prompt-textarea` - Most specific (ID selector) - try first
2. `div.ProseMirror[contenteditable='true']` - Framework-specific (ProseMirror editor)
3. `div[contenteditable='true'][id='prompt-textarea']` - Compound fallback
4. `div[contenteditable='true']` - Generic fallback - last resort

#### Google Search
```json
{
  "framework": "google",
  "capabilities": {
    "search": {
      "action": "SearchGoogle",
      "label": "Search Google",
      "description": "Enter a search query. Usage:\n# Type without submitting\npython3 test_navigation.py --command capability --capability SearchGoogle --value \"anthropic claude\" --no-submit\n# Type and submit\npython3 test_navigation.py --command capability --capability SearchGoogle --value \"python tutorial\" --submit",
      "url_pattern": "google",
      "inputType": "text",
      "paramName": "text",
      "selectors": [
        "textarea[name='q']",
        "input[name='q']",
        "textarea.gLFyf",
        "input.gLFyf",
        "#APjFqb",
        "input[type='search'][role='combobox']",
        "[role='search'] textarea",
        "[role='search'] input[type='search']"
      ]
    }
  }
}
```

**Note:** Google uses the default `submitMethod: "enter"` (not specified = defaults to Enter key).
This works because search inputs naturally submit on Enter press.

### Content Editable Handling

The capability pipeline has special handling for **contenteditable** elements (used by rich text editors like ProseMirror, Lexical, Draft.js):

**Problem:** Standard `.value` property doesn't work on contenteditable elements.

**Solution:** Use `document.execCommand('insertText', ...)` (Lines 10728-10734)

```javascript
if (isContentEditable) {
    // ProseMirror/Lexical handling
    targetElement.focus();
    targetElement.innerHTML = '<p><br></p>'; // Clear existing content
    document.execCommand('insertText', false, params.value);
    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
}
```

**Why this works:**
- `execCommand('insertText')` triggers proper editor events
- Editor frameworks intercept and process the text correctly
- `innerHTML = '<p><br></p>'` resets to clean state
- Dispatching `input` event ensures React/Vue reactivity

### Submit Button Discovery

When `params.submit === true`, the pipeline uses a 3-tier fallback strategy:

```javascript
// Tier 1: Config-defined submitSelector
const submitSelector = capability.submitSelector;
let submitBtn = document.querySelector(submitSelector);

// Tier 2: Common submit button patterns
if (!submitBtn) {
    const fallbackSelectors = [
        'button[data-testid="send-button"]',
        '#composer-submit-button',
        'button[type="submit"]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="Submit" i]',
        'button[aria-label*="Search" i]'
    ];
    // Try each...
}

// Tier 3: Enter key (last resort)
if (!submitBtn) {
    const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13
    });
    targetElement.dispatchEvent(enterEvent);
}
```

### Test Commands

**Basic capability execution:**
```bash
python3 test_navigation.py --command capability \
  --capability SendPrompt \
  --value "Hello Claude"
```

**With submit:**
```bash
python3 test_navigation.py --command capability \
  --capability SendPrompt \
  --value "Write a function" \
  --submit
```

**Without submit (fill only):**
```bash
python3 test_navigation.py --command capability \
  --capability SearchGoogle \
  --value "python asyncio" \
  --no-submit
```

### Adding New Capabilities

**To add a new capability for a site:**

1. **Edit site config** (`web_extension/site_configs/{domain}.json`)
2. **Add capability definition** to `capabilities` object
3. **Test immediately** - no extension reload needed

**Example: Add YouTube search capability**

```json
{
  "framework": "youtube",
  "capabilities": {
    "searchYoutube": {
      "action": "SearchYouTube",
      "label": "Search YouTube",
      "description": "Search for videos on YouTube",
      "url_pattern": "youtube.com",
      "selectors": [
        "input#search",
        "input[name='search_query']",
        "input[aria-label*='Search' i]"
      ],
      "submitSelector": "button#search-icon-legacy"
    }
  }
}
```

**Test:**
```bash
python3 test_navigation.py --command capability \
  --capability SearchYouTube \
  --value "anthropic claude" \
  --submit
```

### Performance Characteristics

| Metric | Typical | Worst Case | Notes |
|--------|---------|------------|-------|
| **Element discovery** | 10-50ms | 5000ms | If lazy-loaded, waits up to 5s |
| **Action execution** | 50-100ms | 500ms | Click or setValue |
| **Action completion wait** | 2000ms | 2000ms | Fixed wait for result |
| **Intelligence update** | 1000ms | 1000ms | Fixed wait for scan |
| **Total latency** | 3-4s | 8-9s | Includes all waiting periods |

**Optimization opportunities:**
- Reduce fixed waits (2s action completion, 1s intelligence update)
- Use event-driven detection instead of timeouts
- Add response validation (don't wait if not needed)

### Error Handling

**Common failure modes:**

| Error | Cause | Resolution |
|-------|-------|------------|
| `No capability config found for action: X` | Capability not defined in site config | Add capability to site_configs/{domain}.json |
| `Element not found using any configured selectors` | Selectors don't match DOM | Inspect page, update selectors in config |
| `Site config not available and reload failed` | Config didn't load on page | Reload tab to reinject content script |
| `No active tab found for capability execution` | No accessible tab open | Open a regular web page (not chrome://) |

**Error response format:**
```javascript
{
  success: false,
  message: "Error message",
  error: "Detailed error description"
}
```

### Integration Points

**Capability Pipeline touches these components:**

```
test_navigation.py (Line 65-101)
  └─ send_command() - Builds execute_capability message
       ↓
ws_server.py (Line 3242-3266)
  └─ handler() - Routes capability to extension
       ↓
sw.js (Line 1733-1767)
  └─ handleExecuteCapability() - Forwards to content script
       ↓
content.js (Line 10595-10828)
  └─ capabilityPipelineExecutor() - Executes capability
       ↓
site_configs/{domain}.json
  └─ Capability definitions (selectors, submitSelector)
```

### Design Principles

1. **Config-driven** - All site-specific logic in JSON, not code
2. **Graceful degradation** - Multiple selector fallbacks
3. **Event-driven where possible** - But uses timeouts when needed
4. **Framework-agnostic** - Works with React, Vue, vanilla JS, contenteditable
5. **No hardcoded selectors** - Everything configurable per domain
6. **Zero-downtime updates** - Edit config, test immediately

### Future Enhancements

**Potential improvements:**

1. **Multi-step workflows** - Chain multiple capabilities
   ```json
   "workflow": ["SearchGoogle", "ClickFirstResult", "ExtractContent"]
   ```

2. **Conditional logic** - Execute based on page state
   ```json
   "conditions": {"selector": ".logged-in", "present": true}
   ```

3. **Response extraction** - Return specific data after action
   ```json
   "extract": {"selector": ".result", "attribute": "textContent"}
   ```

4. **Retry strategies** - Configurable retry with backoff
   ```json
   "retry": {"maxAttempts": 3, "backoff": "exponential"}
   ```

5. **Event-driven completion** - Wait for specific element/event instead of timeout
   ```json
   "waitFor": {"selector": ".response", "timeout": 10000}
   ```

---

## 3.5 Iframe Element Pipeline Architecture

### Overview

The **Iframe Element Pipeline** enables scanning and action execution on elements inside **cross-origin iframes** (e.g., CyberSource payment forms, embedded Stripe checkout). Cross-origin iframes are security-sandboxed—main frame JavaScript cannot access their DOM directly. This pipeline uses Chrome Extension's `all_frames: true` capability to inject content scripts into both main frame AND iframes, coordinating ID assignment through the Service Worker.

**Key Differentiator:** Iframe elements appear in `text.md` with an `iframe="true"` attribute, and action execution uses the `--iframe` flag to route through iframe-aware execution.

### The Cross-Origin Iframe Problem

```
┌─ MAIN FRAME (example.com) ──────────────────────────────────────────────────┐
│                                                                              │
│  document.querySelector('input#card')  // ❌ FAILS - can't reach into iframe │
│                                                                              │
│  ┌─ CROSS-ORIGIN IFRAME (flex.cybersource.com) ─────────────────────────┐   │
│  │                                                                       │   │
│  │   <input name="number" aria-label="Card Number">                     │   │
│  │   <input name="cvn" aria-label="Security Code">                      │   │
│  │                                                                       │   │
│  │   // Main frame JavaScript CANNOT access these elements              │   │
│  │   // Content script in main frame CANNOT query these                 │   │
│  │                                                                       │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Security constraint:** Browser Same-Origin Policy prevents main frame scripts from accessing cross-origin iframe DOM.

### Solution: Dual Content Script Injection

**Manifest configuration:**
```json
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": ["content.js"],
  "all_frames": true,   // ← KEY: Inject into iframes too
  "run_at": "document_idle"
}]
```

With `all_frames: true`, Chrome injects `content.js` into BOTH:
1. Main frame (example.com)
2. All iframes (flex.cybersource.com)

Each runs independently and communicates via Service Worker.

### Architecture Comparison

```
┌─ STANDARD ACTION-ID PIPELINE (main frame only) ─────────────────────────────┐
│                                                                              │
│  1. Main frame loads → content.js scans DOM                                 │
│  2. Elements registered with a_id_0, a_id_1, a_id_2, etc.                  │
│  3. Artifacts generated (page.jsonl, text.md)                               │
│  4. LLM reads text.md → sends execute_llm_action with actionId              │
│  5. SW forwards via chrome.tabs.sendMessage → content.js executes           │
│                                                                              │
│  ✅ Fast (single frame)                                                      │
│  ✅ Simple (direct messaging)                                                │
│  ❌ Cannot access cross-origin iframe elements                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ IFRAME ELEMENT PIPELINE ────────────────────────────────────────────────────┐
│                                                                              │
│  1. Main frame scans → assigns a_id_0 through a_id_N                        │
│  2. Each iframe auto-scans → assigns LOCAL IDs (iframe_0, iframe_1)         │
│  3. Iframes send intelligence to SW with local IDs                          │
│  4. SW merges → assigns FINAL IDs (a_id_12, a_id_13, etc.)                  │
│  5. SW broadcasts back to ALL frames → iframes update DOM with final IDs    │
│  6. text.md shows elements with iframe="true" attribute                     │
│  7. Action with --iframe flag → SW uses scripting.executeScript(allFrames)  │
│                                                                              │
│  ✅ Accesses cross-origin iframe elements                                    │
│  ✅ Sequential IDs across all frames                                         │
│  ✅ Config-driven (uses --iframe flag for routing)                           │
│  ❌ More complex (requires coordination)                                     │
│  ❌ Timing-sensitive (iframes may load dynamically)                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Complete Message Flow: Iframe Element Scanning

```
┌─ PAGE LOAD (example.com with CyberSource iframe)
│
├─ MAIN FRAME (content.js) ────────────────────────────────────────────────────
│
│  1. Detects: window.top === window.self (I am main frame)
│
│  2. Scans DOM, assigns IDs: a_id_0 through a_id_N
│     - Sets data-ome-action-id attribute on each element
│
│  3. Counts iframes: document.querySelectorAll('iframe')
│     ⚠️ MAY BE 0 if CyberSource creates iframes dynamically via JS!
│
│  4. Sends to SW:
│     {
│       type: "scan_complete",
│       intelligenceData: {...},
│       expectedIframeCount: 0|N
│     }
│
└─ Message goes to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js)
│
│  If expectedIframeCount > 0:
│    - Store pending data
│    - Wait for iframe reports
│
│  If expectedIframeCount === 0:
│    - Send immediately (may miss dynamic iframes)
│
└─ May need to wait for iframes
                    ↓
┌─ IFRAME (flex.cybersource.com content.js) ───────────────────────────────────
│
│  1. Detects: window.top !== window.self (I am in iframe)
│
│  2. Auto-scans when ready (document_idle)
│
│  3. Assigns LOCAL IDs: iframe_0, iframe_1, etc.
│     - Sets data-ome-action-id="iframe_0" on each element
│
│  4. Sends to SW:
│     {
│       type: "iframe_intelligence",
│       elements: [
│         { localId: "iframe_0", tag: "input", text: "Card number", ... },
│         { localId: "iframe_1", tag: "input", text: "CVN", ... }
│       ],
│       iframeUrl: "https://flex.cybersource.com/..."
│     }
│
└─ Message goes to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js) - MERGE PHASE
│
│  1. Caches iframe elements with frameId
│
│  2. Calls mergeIframeIntelligence():
│     - Gets next available ID from main frame count (e.g., a_id_12)
│     - Creates mapping: { "iframe_0": "a_id_12", "iframe_1": "a_id_13" }
│     - Appends iframe elements to main intelligence
│
│  3. Broadcasts ID updates to ALL frames via scripting.executeScript:
│     chrome.scripting.executeScript({
│       target: { tabId, allFrames: true },
│       func: (mappings) => {
│         const currentUrl = window.location.href;
│         const mapping = mappings[currentUrl];
│         if (!mapping) return 0;
│         for (const [localId, finalId] of Object.entries(mapping)) {
│           const el = document.querySelector(`[data-ome-action-id="${localId}"]`);
│           if (el) el.setAttribute('data-ome-action-id', finalId);
│         }
│       },
│       args: [{ "https://flex.cybersource.com/...": idMapping }]
│     });
│
│  4. Sends merged intelligence to Python server
│
└─ Broadcast completes
                    ↓
┌─ IFRAME DOM UPDATED
│
│  Before: <input data-ome-action-id="iframe_0" name="number">
│  After:  <input data-ome-action-id="a_id_12" name="number">
│
└─ IDs now match what's in text.md
                    ↓
┌─ PYTHON SERVER (ws_server.py)
│
│  Writes to text.md with iframe="true" marker:
│
│  === Secure Iframe Elements ===
│  <Input id="a_id_12" type="text" iframe="true" use="(a_id_12, 'your text', submit:true, iframe:true)">Card number</Input>
│  <Input id="a_id_13" type="text" iframe="true" use="(a_id_13, 'your text', submit:true, iframe:true)">CVN</Input>
│
└─ LLM can now see and reference iframe elements
```

### Complete Message Flow: Iframe Action Execution

```
┌─ TEST CLIENT (test_navigation.py)
│
├─ User runs:
│  python test_navigation.py --command llm --action-id a_id_12 \
│    --action-type setValue --value "4111111111111111" --iframe
│
├─ Line 333-334: Parses --iframe flag
│  parser.add_argument("--iframe", action="store_true",
│    help="Target element is inside an iframe")
│
├─ Line 394-396: Adds isIframeElement to params
│  if args.iframe:
│    params["isIframeElement"] = True
│
├─ Builds payload:
│  {
│    "type": "llm_instruction",
│    "data": {
│      "actionId": "a_id_12",
│      "actionType": "setValue",
│      "params": {
│        "value": "4111111111111111",
│        "isIframeElement": true    ← KEY: Routes to iframe execution
│      }
│    }
│  }
│
└─ Sends via WebSocket to ws://localhost:17892
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
│  Forwards to extension (no special handling needed)
│
└─ Message goes to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js) - handleExecuteLLMAction
│
│  1. Extracts: actionId, actionType, params
│
│  2. Checks: params.isIframeElement === true?
│
│  3. IF isIframeElement === true:
│     │
│     │  // Use chrome.scripting.executeScript with allFrames
│     │  // This executes in ALL frames (main + iframes)
│     │
│     └─ await chrome.scripting.executeScript({
│          target: { tabId: activeTab.id, allFrames: true },
│          func: (aId, aType, aParams) => {
│            const el = document.querySelector(`[data-ome-action-id="${aId}"]`);
│            if (!el) return { found: false };
│
│            // Element found in this frame!
│            if (aType === 'setValue') {
│              el.focus();
│              el.value = aParams.value;
│              el.dispatchEvent(new Event('input', { bubbles: true }));
│              el.dispatchEvent(new Event('change', { bubbles: true }));
│
│              if (aParams.submit) {
│                el.dispatchEvent(new KeyboardEvent('keydown', {
│                  key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
│                }));
│              }
│              return { found: true, executed: 'setValue' };
│            }
│
│            if (aType === 'click') {
│              el.click();
│              return { found: true, executed: 'click' };
│            }
│
│            // Default: focus
│            el.focus();
│            return { found: true, executed: 'focus' };
│          },
│          args: [actionId, actionType, params]
│        });
│
│  4. ELSE (not iframe element):
│     │
│     │  // Use standard chrome.tabs.sendMessage (main frame only)
│     │
│     └─ await chrome.tabs.sendMessage(activeTab.id, {
│          type: "execute_action",
│          data: { actionId, actionType, params }
│        });
│
│  5. Return response to server
│
└─ Action executed in correct frame
```

### Text.md Output Format

Iframe elements appear in a dedicated section with the `iframe="true"` marker:

```markdown
================================================================================
Secure Iframe Elements (Cross-Origin)
================================================================================

<Input id="a_id_12" type="text" iframe="true" use="(a_id_12, 'your text', submit:true, iframe:true)">Card number</Input>
<Input id="a_id_13" type="text" iframe="true" use="(a_id_13, 'your text', submit:true, iframe:true)">Expiry month</Input>
<Input id="a_id_14" type="text" iframe="true" use="(a_id_14, 'your text', submit:true, iframe:true)">Expiry year</Input>
<Input id="a_id_15" type="text" iframe="true" use="(a_id_15, 'your text', submit:true, iframe:true)">CVN</Input>
<Button id="a_id_16" iframe="true">Submit Payment</Button>
```

**The `use=` hint** shows the LLM exactly how to call this element with the iframe flag.

### Test Commands

**Type into iframe input:**
```bash
python test_navigation.py --command llm --action-id a_id_12 \
  --action-type setValue --value "4111111111111111" --iframe
```

**Type and submit (press Enter):**
```bash
python test_navigation.py --command llm --action-id a_id_12 \
  --action-type setValue --value "4111111111111111" --iframe --submit
```

**Click button in iframe:**
```bash
python test_navigation.py --command click --action-id a_id_16 --iframe
```

### Key Code Locations

| File | Lines | Purpose |
|------|-------|---------|
| `manifest.json` | `all_frames: true` | Enable iframe content script injection |
| `content.js` | 27-149 | Iframe detection (`window.top !== window.self`), local ID assignment |
| `content.js` | 160-290 | Main frame scan, iframe counting |
| `sw.js` | 631-714 | `handleScanComplete()` - waits for iframe reports |
| `sw.js` | 1932-2063 | `handleIframeIntelligence()`, `mergeIframeIntelligence()` |
| `sw.js` | ~2176-2213 | Broadcast ID updates to ALL frames via `scripting.executeScript` |
| `sw.js` | ~2254-2369 | `handleExecuteLLMAction()` - routes based on `isIframeElement` |
| `ws_server.py` | ~3242-3250 | Writes iframe section to text.md with `iframe="true"` |
| `test_navigation.py` | 333-334 | `--iframe` flag argument |
| `test_navigation.py` | 394-396 | Adds `isIframeElement: true` to params |

### Known Limitations

| Issue | Cause | Workaround |
|-------|-------|------------|
| **Dynamic iframes missed** | CyberSource creates iframes via JS AFTER main scan | Wait for page to settle, trigger rescan |
| **ID mismatch** | Broadcast fails if iframe disconnected | Reload tab to reinject content script |
| **Timing race** | Iframe content script not ready when SW tries to send | Auto-retry in mergeIframeIntelligence |
| **Multiple rescans** | Each scan clears iframe cache | SW caches iframe data between scans |

### Error Handling

**Common errors and their meaning:**

| Error | Cause | Resolution |
|-------|-------|------------|
| `Actionable element not found: a_id_12` | ID in text.md but not in iframe DOM | Iframe DOM wasn't updated with final IDs - check broadcast log |
| `Expecting 0 iframe reports` | Iframes created after main scan | Trigger rescan after iframes load |
| `Frame X skipped: Receiving end does not exist` | Iframe disconnected | Reload tab |
| `isIframeElement but no results` | Element not in any frame | Verify element exists, check action-id in DOM |

### Design Principles

1. **Sequential IDs** - Iframe elements get IDs that continue from main frame count
2. **Explicit routing** - `--iframe` flag required for iframe elements (no guessing)
3. **Broadcast pattern** - SW sends to ALL frames, each checks its own URL
4. **Graceful fallback** - If iframe broadcast fails, main frame still works
5. **DOM-first truth** - Final IDs must be in DOM before action execution

---

## 4. Scan Trigger Coordination Problem

### The 8 Overlapping Scan Triggers

| # | Component | Location | Event | Function | Frequency | Deduped? |
|---|-----------|----------|-------|----------|-----------|----------|
| **1** | sw.js | Line 1255 | onCompleted | triggerIntelligenceScan() | Page load finish | ✅ By URL |
| **2** | sw.js | Line 1264 | onHistoryStateUpdated | triggerIntelligenceScan() | SPA route change | ✅ By URL |
| **3** | sw.js | Line 1282 | onUpdated (complete) | triggerIntelligenceScan() | Load complete (dupe!) | ✅ By URL |
| **4** | content.js | Line 244 | Timer | scheduleInitialScan() | 4s timeout | ❌ None |
| **5** | content.js | Line 1634 | DOMContentLoaded | initializeIntelligenceSystem() | Page load | ❌ None |
| **6** | content.js | Line 170 | waitForIdle() | runScanAfterPageLoad() | Page idle | ❌ None |
| **7** | content.js | Line 7145 | setupEventDrivenUpdates() | queueIntelligenceUpdate() | Visibility/focus | ❌ None |
| **8** | content.js | Line 3878 | analyzeStructureChanges() | registerInteractiveSubtree() | DOM changes | ❌ None |

### The Problem: Cascade Effect

```
Timeline of a typical page load:

Time 0.0s:    User navigates to example.com
              ↓
Time 0.5s:    sw.js: onCompleted fires (TRIGGER #1)
              ├─ Checks: tabScanState.get(tabId).lastUrl?
              ├─ Not seen before, so proceed
              ├─ Sends: start_intelligence_scan message
              ├─ Sets: tabScanState[tabId] = {lastUrl, lastScanAt}
              ↓
Time 0.6s:    content.js: Message received
              ├─ Starts: scheduleInitialScan('service_worker')
              ├─ Sets: initialScanScheduled = true
              ├─ Waits for: pageIdleMonitor.waitForIdle()
              ↓
Time 1.0s:    content.js: DOMContentLoaded fires (TRIGGER #5)
              ├─ Calls: initializeIntelligenceSystem()
              ├─ Starts: page idle monitoring
              ├─ Sets up: MutationObserver (TRIGGER #8 ready)
              ↓
Time 1.5s:    sw.js: onUpdated fires with status='complete' (TRIGGER #3)
              ├─ Checks: tabScanState - URL same as TRIGGER #1!
              ├─ Deduped! Doesn't send duplicate message
              ↓
Time 2.0s:    content.js: Event-driven setup (TRIGGER #7)
              ├─ Calls: setupEventDrivenUpdates()
              ├─ Queues: intelligenceEngine.queueIntelligenceUpdate()
              ↓
Time 2.5s:    content.js: MutationObserver fires (TRIGGER #8)
              ├─ Detects: Page layout changes, images loading
              ├─ Calls: analyzeStructureChanges()
              ├─ Calls: registerInteractiveSubtree(newElement)
              ├─ ⚠️ PROBLEM: May assign IDs while main scan running!
              ↓
Time 3.0s:    content.js: pageIdleMonitor resolves (TRIGGER #6)
              ├─ Page is now "idle" (no changes for 200ms)
              ├─ Calls: runScanAfterPageLoad()
              ├─ Calls: intelligenceEngine.scanAndRegisterPageElements()
              ├─ 🔴 CRITICAL: Resets elementCounter = 0!
              ├─ 🔴 CRITICAL: Deletes all data-ome-action-id markers!
              ├─ Re-scans entire DOM, assigns new IDs
              ├─ Result: Elements get NEW IDs (a_id_0, a_id_1, ...)
              ↓
Time 3.5s:    content.js: Element change detected (lazy image loaded)
              ├─ MutationObserver fires again (TRIGGER #8)
              ├─ Calls: registerInteractiveSubtree()
              ├─ Tries to register element
              ├─ ⚠️ PROBLEM: Elements already have IDs from Time 3.0s
              ├─ But if scan not complete, may assign DIFFERENT ID
              ↓
Time 4.0s:    content.js: Fallback timer (TRIGGER #4)
              ├─ Checks: if (!initialScanScheduled)
              ├─ Already true from Time 0.6s!
              ├─ So returns early - no duplicate
              ↓
RESULT:       Element has been assigned 2-3 different IDs:
              - First ID from main scan (a_id_5)
              - Second ID from lazy element registration (a_id_201)
              - Possibly third ID from structure change (a_id_312)
```

### Why This Causes Duplicate IDs

**Root Cause #1: Element Counter Resets**
```javascript
// Line 4914 in content.js
IntelligenceEngine.prototype.scanAndRegisterPageElements = function() {
    this.elementCounter = 0;  // ⚠️ RESET!
    // ... scan DOM ...
    // Assigns: a_id_0, a_id_1, a_id_2, ..., a_id_200
};
```

When scan runs AGAIN (or runs partially during DOM changes):
```javascript
this.elementCounter = 0;  // Reset AGAIN
// Now assigns: a_id_0, a_id_1, a_id_2, ...
// SAME IDs as before! Collision!
```

**Root Cause #2: Markers Deleted Before Re-registration**
```javascript
// Lines 4916-4925 in content.js
// Clear all previous markers
document.querySelectorAll('[data-ome-action-id]').forEach(el => {
    delete el.dataset.omeActionId;  // Delete old marker
});

// Now scan and re-register
// But if new elements added meanwhile, they get IDs
// And old elements get NEW IDs (because counter reset)
```

**Root Cause #3: No State Coordination**
- Service worker tracks `tabScanState` (URL-based dedup)
- Content script has 5 separate scan triggers
- Service worker doesn't know which trigger fires
- Content script doesn't know about service worker's `tabScanState`
- Result: Multiple scans happen independently

---

## 4. State Management Across Components

### Service Worker State (`sw.js`)

```javascript
// Scan state tracking
tabScanState = Map<tabId, {
  lastUrl: string,
  lastScanAt: number,
  reason: string
}>
// Purpose: Prevent duplicate scan messages to same URL
// Scope: Service worker only
// Content.js: Can't access this!

// Tab metadata
internalTabState = Map<tabId, {
  id, url, title, active, status,
  lastUpdate: number,
  needsFreshScan: boolean,
  contentScriptFresh: boolean,
  cacheCleared: boolean,
  domChanges: {
    totalChanges: number,
    lastChangeTime: number,
    changeTypes: Set,
    lastMutationCount: number
  },
  siteConfigSent: boolean,
  lastConfigSent: number,
  currentDomain: string,
  currentFramework: string,
  siteConfigError: string,
  lastConfigError: number
}>
// Purpose: Track enhanced tab info
// Scope: Service worker only
// Content.js: Can't access this!

// Cached configs
siteConfigs = Object<domain, {
  framework: string,
  selectors: {...},
  patterns: {...}
}>
// Purpose: Fast lookup of framework configs
// Scope: In-memory cache + chrome.storage.local
// Content.js: Receives via message

// Action lock (GLOBAL - PROBLEMATIC)
actionInProgress = boolean
// Purpose: Prevent content script refresh during action
// Problem: ⚠️ GLOBAL means if Tab1 executes, Tab2 can't refresh!
// Should be: Map<tabId, boolean>
```

### Content Script State (`content.js`)

```javascript
// Main intelligence state
window.intelligenceEngine = {
  pageState: {
    currentView: string,
    interactiveElements: Array,
    contentElements: Array,
    navigationState: string,
    contentSections: Array,
    lastUpdate: number,
    url: string,
    title: string
  },
  actionableElements: Map<actionId, {
    actionId: string,
    element: DOMElement (WeakRef),
    tagName: string,
    textContent: string,
    selectors: Array<string>,
    actionType: string,
    coordinates: {x, y, width, height},
    ...
  }>,
  elementCounter: number  // ⚠️ RESETS ON EACH SCAN!
}
// Purpose: Manage all scannable elements
// Scope: Window-level global
// Service worker: Can't access this!

// Change batching
changeAggregator = {
  pendingChanges: Array,
  changeGroups: Map,
  groupingTimeout: 500  // ms
}
// Purpose: Batch mutations before processing
// Scope: Window-level global
// Pattern: Event-driven + timer (500ms window)

// Framework config
window.currentSiteConfig = {
  framework: string,
  selectors: {...},
  patterns: {...}
}
// Purpose: Use framework-specific scanning
// Scope: Window-level global
// Received: Via message from service worker

// Idle monitoring
pageIdleMonitor = {
  inflightRequests: number,
  lastChangeTime: number,
  quietWindowMs: 200,
  waitForIdle(): Promise<void>
}
// Purpose: Detect when page settles
// Scope: IIFE singleton
// Pattern: Monitor fetch/XHR + DOM mutations
```

### WebSocket Server State (`ws_server.py`)

```python
# Connected clients
CLIENTS = set()  # All connected WebSocket connections
EXTENSION_WS = None  # Reference to the extension (sw.js)
COMMAND_CLIENTS = {}  # command_id → client_ws mapping

# Cached page state
CURRENT_TABS_INFO = None  # Latest tabs list from extension
LAST_TABS_UPDATE = None  # Timestamp
CURRENT_ACTIVE_TAB = None  # Current active tab info
CURRENT_PAGE_DATA = None  # Latest page intelligence
LAST_PAGE_UPDATE = None  # Timestamp
CURRENT_CONTENT_DATA = None  # Latest content structure
LAST_CONTENT_UPDATE = None  # Timestamp

# Cached configs
siteConfigs = {}  # domain → config mapping (in-memory)
```

### State Desynchronization Problem

```
Service Worker                 Content Script
────────────────             ─────────────────

tabScanState = {             (Can't access
  example.com: {               tabScanState!)
    lastUrl: "example.com",
    lastScanAt: 1234567890  (Doesn't know
  }                           about URL
}                             deduplication)

internalTabState = {         (Can't access
  123: {                       internalTabState!)
    url: "example.com",
    needsFreshScan: false    (Doesn't know
  }                           scan is needed!)
}
                             
                             initialScanScheduled = true
                             (Service worker
                              doesn't know this!)
                             
                             elementCounter = 0
                             (Service worker
                              has no idea!)
```

**Result:** Multiple scans occur independently because there's no shared state

---

## 5. Critical Issues Map

### Issue #1: Duplicate Element ID Assignment (🔴 CRITICAL)

**Symptoms:**
- Element starts with a_id_5
- Then becomes a_id_201
- Then becomes a_id_312
- Test client uses wrong ID for action

**Root Causes:**
1. 8 overlapping scan triggers (3 in sw.js, 5 in content.js)
2. Element counter resets on each scan (Line 4914)
3. No state coordination between sw.js and content.js
4. Structure changes auto-register during main scan

**Affects:** 100% of page scans  
**Impact:** All test client actions fail (wrong IDs)  
**Fix Priority:** 1 (URGENT)  
**Files:** content.js, sw.js  
**Solution:** ScanManager class with queue + deduplication

---

### Issue #2: Server Blocking I/O (🔴 CRITICAL)

**Symptoms:**
- Intelligence update takes 100-500ms
- Site map processing takes 5-30 seconds
- Server completely unresponsive during processing
- Multiple clients get timeouts

**Root Causes:**
1. Synchronous file I/O in async handler (blocking)
2. Calls: save_intelligence_to_page_jsonl() [SYNC]
3. Calls: save_content_to_content_jsonl() [SYNC]
4. Calls: generate_llm_prompt() [SYNC]

**Affects:** All intelligence updates  
**Impact:** Server latency 100-500ms per update  
**Fix Priority:** 1 (URGENT)  
**Files:** ws_server.py  
**Solution:** Use asyncio.create_task() for background processing

---

### Issue #3: O(n²) Element Deduplication (🔴 CRITICAL)

**Symptoms:**
- Site map with 6,000 elements takes 10+ seconds
- Server CPU 100% during processing
- Other clients blocked

**Root Causes:**
1. `deduplicate_elements()` uses nested loops
2. For each element, searches all previous elements
3. O(n²) complexity: 6,000² = 36M operations

**Affects:** All site map processing  
**Impact:** 5-30 second processing time  
**Fix Priority:** 1 (URGENT)  
**Files:** ws_server.py  
**Solution:** Hash-based deduplication O(n)

---

### Issue #4: Global Action Lock (🔴 CRITICAL)

**Symptoms:**
- User on Tab 1 executes click action
- User switches to Tab 2
- Tab 2's content script won't refresh (flag is global!)
- Tab 2 stuck with stale element list

**Root Causes:**
1. `actionInProgress = boolean` is GLOBAL (Line 121 in sw.js)
2. If Tab 1 executing, Tab 2 can't refresh (flag blocks both)
3. Should be `Map<tabId, boolean>`

**Affects:** Multi-tab workflows  
**Impact:** Tab 2 non-functional while Tab 1 executes  
**Fix Priority:** 1 (URGENT)  
**Files:** sw.js  
**Solution:** Per-tab action lock: `actionInProgress = Map<tabId, boolean>`

---

### Issue #5: Massive Monolithic Functions (🔴 CRITICAL)

**Affected Functions:**

| File | Function | Lines | Issue |
|------|----------|-------|-------|
| content.js | buildNormalizedPageRecords() | 429 | Unmaintainable |
| content.js | executeAction() | 320 | Too complex |
| sw.js | updateInternalTabState() | 83 | Hard to test |
| sw.js | findActiveTab() | 85 | Too long |
| ws_server.py | handler() | 800+ | Unreadable |
| ws_server.py | process_clean_site_map_data() | 299 | Nested complexity |
| ws_server.py | siteStructuredLLMmethodinsidethefile() | 266 | Bad name, large |
| ws_server.py | classify_element_enhanced() | 184 | Complex logic |

**Impact:**
- Hard to understand
- Hard to test
- Bug-prone
- Can't reuse logic

**Fix Priority:** 2 (HIGH)  
**Solution:** Break into smaller, testable functions

---

## 6. Integration Points Summary

### ↔️ Test Client ↔ Server

**Connection:** WebSocket (ws://localhost:17892)  
**Protocol:** JSON messages  
**Commands Sent:**
- `execute_llm_action` (click, setValue, navigate)
- `intelligence_update` (request current state)

**Responses Received:**
- Action results (ok, error, result fields)
- Element data, tab info, page state

**Issues:**
- ⚠️ No retry logic
- ⚠️ No response validation
- ⚠️ Hard-coded server URL

---

### ↔️ Server ↔ Service Worker

**Connection:** WebSocket (maintained by extension)  
**Protocol:** JSON messages  
**Messages From Server:**
- Commands (navigate, click, getText, etc.)
- LLM instructions (execute_action)
- Config updates (site_configs_update)

**Messages To Server:**
- `bridge_status` (I'm here)
- `tabs_info` (list of tabs)
- `active_tab_info` (current tab)
- Intelligence updates (element data)
- DOM changes (mutation notifications)

**Issues:**
- ⚠️ No message ordering guarantee
- ⚠️ Responses not directly correlated to requests
- ⚠️ Broadcast of configs to all tabs (redundant)

---

### ↔️ Service Worker ↔ Content Script

**Connection:** chrome.runtime.sendMessage()  
**Protocol:** JSON messages  
**Messages From Service Worker:**
- `start_intelligence_scan` (trigger scan)
- `site_configs_update` (framework config)
- `execute_action` (LLM action)

**Messages To Service Worker:**
- `intelligence_update` (element data)
- `dom_changed` (mutation notification)
- `ping` (context validation)

**Issues:**
- 🔴 **CRITICAL:** Service worker doesn't know about scan state
- ⚠️ No state sharing for deduplication
- ⚠️ Content script can't access `tabScanState`

---

### ↔️ Content Script ↔ DOM

**Connection:** DOM APIs (querySelector, addEventListener, etc.)  
**Protocol:** Direct manipulation  
**Operations:**
- Query elements (querySelector, querySelectorAll)
- Register IDs (dataset.omeActionId)
- Execute actions (click, value assignment, navigation)
- Observe changes (MutationObserver)

**Issues:**
- ✅ Good: Event-driven observation
- ⚠️ Fallback timers for retry logic
- ⚠️ Complex resolution chain for element finding

---

## 7. Visual System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Om-E-Web System Overview                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ EXTERNAL SYSTEMS
│
├─ LLM / Test Client (Python)
│  └─ test_navigation.py
│     ├─ Function: Execute automation commands
│     ├─ Commands: click, setValue, navigate
│     └─ Protocol: WebSocket (JSON)
│
└─ Browser Automation Targets
   └─ Web Pages (DOM)


         ↕ WebSocket (ws://localhost:17892)


┌─ OM-E-WEB SYSTEM ──────────────────────────────────────────────────────────┐
│                                                                              │
│ ┌─ PYTHON BACKEND ───────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │  WebSocket Server (ws_server.py)                                      │  │
│ │  ├─ Port: 17892                                                       │  │
│ │  ├─ Function: Message routing & intelligence processing               │  │
│ │  ├─ State: CLIENTS, EXTENSION_WS, CURRENT_PAGE_DATA, etc.            │  │
│ │  ├─ 🔴 CRITICAL: Sync I/O blocks handler                              │  │
│ │  ├─ 🔴 CRITICAL: O(n²) deduplication                                  │  │
│ │  ├─ 🔴 CRITICAL: 800-line handler function                           │  │
│ │  └─ Output Files: @site_structures/ directory                         │  │
│ │     ├─ page.jsonl (intelligence)                                      │  │
│ │     ├─ content.jsonl (content structure)                              │  │
│ │     ├─ llm_actions.json (action mappings)                             │  │
│ │     ├─ llm_prompt.md (compact prompt)                                 │  │
│ │     ├─ text.md (extracted text)                                       │  │
│ │     └─ [hostname]_processed*.jsonl (site map)                         │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                            ↕ WebSocket                                      │
│ ┌─ CHROME EXTENSION ─────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │  ┌─ Service Worker (sw.js) ────────────────────────────────────────┐  │  │
│ │  │                                                                 │  │  │
│ │  │ Function: Message router, tab manager                          │  │  │
│ │  │ State: tabScanState, internalTabState, siteConfigs             │  │  │
│ │  │ Features: Keep-alive, smart tab finding, state tracking        │  │  │
│ │  │                                                                 │  │  │
│ │  │ 🔴 CRITICAL: Global actionInProgress flag (breaks multi-tab)   │  │  │
│ │  │ 🔴 CRITICAL: Unconditional content script reinjection          │  │  │
│ │  │ 🔴 CRITICAL: 3 scan triggers (onCompleted, onUpdated, etc.)    │  │  │
│ │  │ ⚠️ HIGH: No coordination with content.js scan state            │  │  │
│ │  │ ⚠️ HIGH: Redundant state tracking                              │  │  │
│ │  │                                                                 │  │  │
│ │  └─ chrome.runtime.sendMessage ↕ chrome.tabs.sendMessage ─────────┘  │  │
│ │                                                                        │  │
│ │  ┌─ Content Script (content.js) ───────────────────────────────────┐  │  │
│ │  │                                                                 │  │  │
│ │  │ Function: DOM executor, intelligence gatherer                  │  │  │
│ │  │ Main Class: IntelligenceEngine (element registry)              │  │  │
│ │  │ Features: Smart resolution, change detection, multi-fallback   │  │  │
│ │  │                                                                 │  │  │
│ │  │ 🔴 CRITICAL: 8 overlapping scan triggers (4+3+multiple)        │  │  │
│ │  │ 🔴 CRITICAL: Element counter resets (causes ID collisions)     │  │  │
│ │  │ 🔴 CRITICAL: Scan can happen from 7 different places           │  │  │
│ │  │ ⚠️ HIGH: No awareness of service worker's tabScanState         │  │  │
│ │  │ ⚠️ HIGH: Markers deleted before re-registration                │  │  │
│ │  │ ⚠️ HIGH: 300+ lines of timer-based retry logic                │  │  │
│ │  │                                                                 │  │  │
│ │  │ State:                                                          │  │  │
│ │  │ ├─ intelligenceEngine (element registry)                        │  │  │
│ │  │ ├─ changeAggregator (batches mutations 500ms)                  │  │  │
│ │  │ ├─ pageIdleMonitor (detects page idle)                         │  │  │
│ │  │ └─ currentSiteConfig (framework-specific)                      │  │  │
│ │  │                                                                 │  │  │
│ │  └─ DOM APIs (querySelector, click, etc.) ──────────────────────┘  │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘


┌─ DATA FLOW SUMMARY ───────────────────────────────────────────────────────┐
│                                                                            │
│ Test Client → Server → Service Worker → Content Script → DOM              │
│  (execute)   (route)    (forward)       (execute)        (act)           │
│                                                                            │
│ DOM → Content Script → Service Worker → Server → File System             │
│ (change) (gather)       (enrich)       (process) (persist)               │
│                                                                            │
│ File System → LLM / Test Client (read @site_structures/)                 │
│                                                                            │
│ ═══════════════════════════════════════════════════════════════════════  │
│ NEW: HUD/CHAT PIPELINE                                                    │
│ ═══════════════════════════════════════════════════════════════════════  │
│                                                                            │
│ User → HUD/Orb UI → Content Script → SW → Server → chats/*.json          │
│ (type)  (input)       (send)        (route) (store)  (persist)           │
│                                                                            │
│ Server → SW → Content Script → HUD/Orb UI → User                         │
│ (ack/response) (route)  (render)  (display) (see)                        │
│                                                                            │
│ SW orbState ←→ Content Script hudState (state sync on navigation)        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

CRITICAL ISSUES BY COMPONENT:

content.js (~14,000+ lines):
  🔴 8 scan triggers → duplicate IDs (element: a_id_5 → a_id_201 → a_id_312)
  🔴 elementCounter resets → ID collisions
  🔴 Scan from 7 different places with no coordination
  ✅ NEW: HUD/Orb UI system (Shadow DOM isolated)
  ✅ NEW: Chat panel with bidirectional messaging
  ✅ NEW: 3 orb themes (kawaii, robot, atom)

sw.js (~1,800 lines):
  🔴 Global actionInProgress flag → breaks multi-tab
  🔴 Unconditional content.js reinjection → interrupts scans
  🔴 3 separate scan triggers (onCompleted, onUpdated, onHistoryStateUpdated)
  ✅ NEW: orbState persistence across navigations
  ✅ NEW: Chat message routing (9 message types)
  ✅ NEW: Theme management with toolbar icon sync

ws_server.py (~3,000+ lines):
  🔴 Sync file I/O blocks async handler → 100-500ms per update
  🔴 O(n²) deduplication → 6,000 elements = 10s processing
  🔴 800-line monolithic handler → unmaintainable
  🟠 No input validation → crashes on malformed messages
  ✅ NEW: Chat storage system (chats/*.json)
  ✅ NEW: chat_user_message/get_chat_history handlers

test_navigation.py (~250 lines):
  🟡 3 redundant command modes → confusing API
  🟡 No response validation → can't tell if action succeeded
  🟡 Hard-coded server URL → not configurable
```

---

## 8. Performance Metrics

### Current System Performance

| Operation | Time | Blocking? | Scalability |
|-----------|------|-----------|-------------|
| Simple click action | 200-500ms | No | O(1) |
| Intelligence update (small page) | 100-200ms | YES | O(n) |
| Intelligence update (large page, 6k elements) | 500ms - 1s | YES | O(n) |
| Site map processing (6k elements) | 5-30 seconds | YES | O(n²) |
| Server responsiveness during processing | N/A | BLOCKED | 0% |
| Element deduplication (1k elements) | 500ms | YES | O(n²) |
| Element deduplication (6k elements) | 10+ seconds | YES | O(n²) |
| Content script injection | 50-100ms | No | O(1) |
| Scan completion (after idle) | 500-2000ms | No | O(n) |

### Expected Performance After Fixes

| Operation | Time | Blocking? | Scalability |
|-----------|------|-----------|-------------|
| Simple click action | 200-500ms | No | O(1) |
| Intelligence update | 50-100ms | No | O(n) |
| Site map processing | 500-1000ms | No | O(n log n) |
| Server responsiveness | Responsive | No | 100% |
| Element deduplication | 50-100ms | No | O(n) |
| Scan completion | 1-2 seconds | No | O(n) |

---

## 8.5 HUD Pipeline Architecture

### Overview

The **HUD (Heads-Up Display) Pipeline** provides a visual overlay interface for the Om-E-Web extension. It consists of a floating "bunny orb" that appears on every page and an expandable HUD panel for status information. The HUD uses Shadow DOM for style isolation.

**Key Features:**
- Floating bunny orb with interactive ears
- Shadow DOM isolation (closed mode - no page style interference)
- Multiple trigger methods (ears click, double-click, keyboard, CLI)
- Draggable orb with hold-to-follow behaviour
- Auto-initializes on page load

### Complete Message Flow: HUD Toggle

```
┌─ TEST CLIENT (test_navigation.py)
│
├─ User runs:
│  python test_navigation.py --command hud
│
├─ Line 268: Argument parsing recognizes "hud" command mode
│
├─ Line 399-406: HUD mode handler
│  if command_mode == "hud":
│      response = await tester.send_command("toggle_hud", {})
│
├─ Line 140-144: send_command() builds message
│  message = {
│    "type": "toggle_hud"
│  }
│
└─ Sends via WebSocket to ws://localhost:17892
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ Line 3399: handler() receives message
│  if msg.get("type") == "toggle_hud":
│
├─ Line 3401: Logs request
│  print("🎛️ HUD toggle request received")
│
├─ Line 3404-3407: Builds HUD command with unique ID
│  hud_command = {
│    "type": "toggle_hud",
│    "id": f"hud_{int(time.time() * 1000)}"
│  }
│
├─ Line 3408: Forwards to extension
│  await EXTENSION_WS.send(json.dumps(hud_command))
│
├─ Line 3411-3414: Sends acknowledgement to client
│  await ws.send(json.dumps({
│    "ok": True,
│    "message": "HUD toggle initiated"
│  }))
│
└─ Message forwarded to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ Line 961-965: handleServerMessage() routes HUD messages
│  if (message.type === "toggle_hud") {
│    console.log("[SW] 🎛️ Processing HUD toggle");
│    handleToggleHUD(message);
│    return;
│  }
│
├─ Line 1983-2019: handleToggleHUD(message)
│  async function handleToggleHUD(message) {
│    const requestId = message.id || `hud_${Date.now()}`;
│
├─ Line 1988: Find active tab
│    const activeTab = await findActiveTab();
│
├─ Line 2001-2003: Forward to content script
│    const response = await chrome.tabs.sendMessage(activeTab.id, {
│      type: "toggle_hud"
│    });
│
├─ Line 2006-2011: Send response back to server
│    sendToServer({
│      type: "hud_response",
│      id: requestId,
│      ok: response?.ok ?? true,
│      result: response
│    });
│
└─ Message sent to Content Script
                    ↓
┌─ CONTENT SCRIPT (content.js)
│
├─ Line 11957-11965: HUD message listener
│  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
│    if (message.type === 'toggle_hud') {
│      console.log('[Content] 🎛️ toggle_hud received');
│      if (!hudState.host) initHUD();
│      toggleHUD();
│      sendResponse({ ok: true, visible: hudState.visible });
│      return true;
│    }
│  });
│
├─ Line 11949-11954: toggleHUD() function
│  function toggleHUD() {
│    if (!hudState.hud) initHUD();
│    hudState.visible = !hudState.visible;
│    hudState.hud.classList.toggle('visible', hudState.visible);
│  }
│
├─ Response: { ok: true, visible: boolean }
│
└─ HUD visibility toggled in Shadow DOM
                    ↓
┌─ RESPONSE FLOW (reverse path)
│
├─ Content Script → Service Worker
│  sendResponse({ ok: true, visible: hudState.visible })
│
├─ Service Worker → WebSocket Server
│  sendToServer({ type: "hud_response", id, ok, result })
│
└─ WebSocket Server → Test Client
   Response displayed to user
```

**Total Time:** 50-200ms
**Blocking:** None (event-driven throughout)

### HUD System Components (content.js Lines 11709-11974)

#### State Object
```javascript
// Line 11713-11720
const hudState = {
  host: HTMLElement|null,    // Shadow DOM host element
  shadow: ShadowRoot|null,   // Closed Shadow DOM root
  orb: HTMLElement|null,     // Floating bunny orb element
  hud: HTMLElement|null,     // HUD overlay panel element
  visible: boolean,          // Current HUD visibility state
  dragging: boolean          // Orb drag state
};
```

#### Key Functions

| Function | Line | Purpose |
|----------|------|---------|
| `injectHUDStyles(shadow)` | 11726 | Inject CSS into Shadow DOM |
| `createOrb(shadow)` | 11810 | Create floating bunny orb with ears |
| `createHUD(shadow)` | 11913 | Create HUD overlay panel |
| `initHUD()` | 11932 | Initialize entire HUD system |
| `toggleHUD()` | 11949 | Toggle HUD panel visibility |

#### Shadow DOM Structure
```
<div id="ome-hud-host" data-ome-ignore="true">
  #shadow-root (closed)
    ├─ <style>...</style>           <!-- Injected styles -->
    ├─ <div class="ome-orb">        <!-- Floating bunny -->
    │   └─ <svg class="ome-bunny">  <!-- Bunny SVG with ears -->
    │       ├─ <path class="ome-ear"><!-- Left ear (clickable) -->
    │       ├─ <path class="ome-ear"><!-- Right ear (clickable) -->
    │       └─ ...                   <!-- Body, face, etc. -->
    └─ <div class="ome-hud">        <!-- HUD overlay panel -->
        ├─ <div class="ome-hud-title">OM-E</div>
        ├─ <button class="ome-hud-close">&times;</button>
        └─ <div class="ome-hud-content">
            ├─ <div class="ome-hud-status">Extension Active</div>
            └─ <div class="ome-hud-hint">Click orb or use...</div>
```

### User Interaction Methods

The HUD can be toggled via multiple methods:

| Method | Trigger | Code Location |
|--------|---------|---------------|
| **Ear Click** | Click bunny's ears | Line 11862-11866 |
| **Double Click** | Double-click orb | Line 11894-11902 |
| **Escape Key** | Press Escape when HUD visible | Line 11926 |
| **Close Button** | Click × on HUD | Line 11924 |
| **Overlay Click** | Click outside HUD content | Line 11925 |
| **CLI Command** | `python test_navigation.py --command hud` | Line 399-406 |

### Orb Drag Behaviour

The orb supports drag-to-position via mouse hold:

```javascript
// Lines 11869-11902: Hold-to-follow behaviour
let isHolding = false;
let holdTimer = null;
const HOLD_DURATION = 400;  // ms to trigger follow mode

orb.addEventListener('mousedown', (e) => {
    holdTimer = setTimeout(() => {
        isHolding = true;
        orb.classList.add('holding');
        document.addEventListener('mousemove', followHandler);
    }, HOLD_DURATION);
});

orb.addEventListener('mouseup', () => {
    clearTimeout(holdTimer);
    if (isHolding) {
        isHolding = false;
        orb.classList.remove('holding');
        document.removeEventListener('mousemove', followHandler);
    }
});
```

### Auto-Initialization

The HUD automatically initializes on page load:

```javascript
// Lines 11967-11972: Auto-init orb
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHUD);
} else {
    initHUD();
}
```

**Note:** The orb always appears; the HUD panel is hidden by default and toggles on interaction.

### CLI Test Commands

```bash
# Toggle HUD visibility
python test_navigation.py --command hud

# The HUD responds with current visibility state
# Response: {"ok": true, "message": "HUD toggle initiated"}
# Service Worker receives: {"ok": true, "visible": true|false}
```

### Integration Points

```
test_navigation.py (Lines 76-78, 268-269, 399-406)
  └─ send_command("toggle_hud", {})
       ↓
ws_server.py (Lines 3399-3423)
  └─ handler() routes toggle_hud to extension
       ↓
sw.js (Lines 961-966, 1983-2019)
  └─ handleToggleHUD() forwards to content script
       ↓
content.js (Lines 11709-11974)
  └─ HUD System (Shadow DOM isolated)
```

### Design Principles

1. **Shadow DOM isolation** - Closed shadow root prevents page CSS conflicts
2. **Event-driven** - No polling or timers for toggle state
3. **Multiple entry points** - CLI, ears, double-click, keyboard all work
4. **Non-intrusive** - `data-ome-ignore="true"` prevents self-scanning
5. **Instant feedback** - Response includes current visibility state

### Keyboard Event Handling in Shadow DOM

The HUD blocks all keyboard events from reaching the underlying page when visible, but must still handle Enter/Escape for contentEditable elements (e.g., chat name editing). This requires a multi-layer approach:

**Problem:** Closed shadow DOM prevents `composedPath()` from exposing internal elements at the document level. Document-level keyboard blockers intercept events before they reach shadow DOM elements.

**Solution:** Three-layer event handling:

```
┌─ LAYER 1: Document-Level Keyboard Blocker (capture phase) ──────────────────┐
│                                                                              │
│  document.addEventListener('keydown', (e) => {                              │
│    if (!hudState.visible) return;                                           │
│                                                                              │
│    // Check if focused element in shadow DOM is editing                     │
│    const editingEl = hudState.shadow?.activeElement;                        │
│    if (editingEl?.classList?.contains('editing')) {                         │
│      if (e.key === 'Enter') {                                               │
│        e.preventDefault();                                                  │
│        editingEl.blur();  // Triggers onblur save handler                   │
│      } else if (e.key === 'Escape') {                                       │
│        e.preventDefault();                                                  │
│        editingEl.textContent = editingEl.dataset.originalTitle;            │
│        editingEl.blur();                                                    │
│      }                                                                       │
│    }                                                                         │
│                                                                              │
│    e.stopPropagation();           // Block from underlying page             │
│    e.stopImmediatePropagation();                                            │
│  }, true);                                                                   │
│                                                                              │
│  KEY INSIGHT: hudState.shadow.activeElement gives focused element           │
│  inside closed shadow DOM (composedPath() doesn't work for closed shadow)   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ LAYER 2: Shadow Root beforeinput Handler (capture phase) ──────────────────┐
│                                                                              │
│  shadow.addEventListener('beforeinput', (e) => {                            │
│    if (e.inputType === 'insertLineBreak' ||                                 │
│        e.inputType === 'insertParagraph') {                                 │
│      if (e.target?.classList?.contains('editing')) {                        │
│        e.preventDefault();  // Block line breaks in contentEditable        │
│      }                                                                       │
│    }                                                                         │
│  }, true);                                                                   │
│                                                                              │
│  KEY INSIGHT: beforeinput fires AFTER keydown but BEFORE text insertion.    │
│  This catches Enter key's default line break behaviour in contentEditable.  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ LAYER 3: Data Attribute for Original Value ────────────────────────────────┐
│                                                                              │
│  When editing starts:                                                        │
│    titleEl.dataset.originalTitle = currentTitle;                            │
│    titleEl.contentEditable = 'true';                                        │
│    titleEl.classList.add('editing');                                        │
│                                                                              │
│  This enables Escape to restore original value without accessing            │
│  closure variables from the rename function.                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Event Flow for Enter Key:**
```
1. User presses Enter in contentEditable .editing element
2. Document keydown handler (capture) fires FIRST
3. Handler checks hudState.shadow.activeElement for .editing class
4. Calls editingEl.blur() → triggers existing onblur save handler
5. Shadow root beforeinput handler catches insertLineBreak → preventDefault()
6. stopPropagation() blocks event from reaching underlying page
7. Result: Title saved, no line break inserted, page protected
```

**Event Flow for Escape Key:**
```
1. User presses Escape in contentEditable .editing element
2. Document keydown handler (capture) fires
3. Handler checks hudState.shadow.activeElement for .editing class
4. Restores original title from dataset.originalTitle
5. Calls editingEl.blur() → triggers onblur (saves restored value)
6. stopPropagation() blocks event from reaching underlying page
7. Result: Original title restored, page protected
```

**Why This Approach:**
- `composedPath()` doesn't expose closed shadow DOM internals at document level
- `hudState.shadow.activeElement` gives direct access to focused element
- `beforeinput` on shadow root catches line breaks that `keydown.preventDefault()` misses
- Data attribute stores original value for Escape without closure access
- All keyboard events still blocked from underlying page

### Orb Themes System (NEW)

The orb supports multiple visual themes stored in `orbThemes` registry:

```javascript
const orbThemes = {
  kawaii: {
    name: 'Kawaii',
    description: 'Cute bunny orb',
    colors: { primary: '#FFB7C5', secondary: '#FF69B4', accent: '#FFF0F5' },
    svg: '...'  // Kawaii bunny SVG
  },
  robot: {
    name: 'Robot',
    description: 'Mechanical robot orb',
    colors: { primary: '#4A90D9', secondary: '#2E5A8C', accent: '#87CEEB' },
    svg: '...'  // Robot SVG
  },
  atom: {
    name: 'Atom',
    description: 'Atomic orb',
    colors: { primary: '#9B59B6', secondary: '#8E44AD', accent: '#D8BFD8' },
    svg: '...'  // Atom SVG
  }
};
```

**Theme Switching Flow:**
```
User/CLI → set_orb_theme message → sw.js → content.js → applyOrbTheme()
                                     ↓
                              Updates orbState.theme
                              Updates toolbar icon
                              Persists to chrome.storage.local
```

### Orb State Persistence

The orb state persists across page navigations via Service Worker:

```javascript
// Service Worker orbState (persisted)
let orbState = {
  theme: 'kawaii',           // Current theme name
  position: { x: 0.9, y: 0.9 }, // Percentage-based position
  chatVisible: false,        // Chat panel open/closed
  chatInput: '',             // Text in input box
  chatPanelSize: { width: 320, height: 400 },
  zoom: 1.0                  // Current zoom level
};
```

**Persistence Flow:**
```
1. User changes state (drags orb, types in chat)
2. Content script sends set_orb_state to SW
3. SW updates orbState, persists chatPanelSize to storage
4. User navigates to new page
5. New page's content script sends get_orb_state
6. SW returns stored orbState
7. Content script restores UI state
```

---

## 8.6 Chat Pipeline Architecture (NEW)

### Overview

The **Chat Pipeline** enables bidirectional text communication between the user (via HUD/orb) and external systems (LLM, WebSocket clients). Messages flow through the full stack, with chat history persisted to disk.

**Key Features:**
- User input from HUD chat panel
- Message routing through WebSocket server
- Chat history persistence to `chats/{chat_id}.json`
- Server acknowledgments displayed in HUD
- Error handling with visual feedback

### Complete Message Flow: User → Server

```
┌─ USER (HUD Chat Panel)
│
├─ User types message in chat input
├─ Clicks Send or presses Enter
│
└─ Content Script (content.js)
                    ↓
┌─ CONTENT SCRIPT (content.js)
│
├─ sendChatMessage(text) triggered
│
├─ Creates message object:
│  {
│    id: `msg_${Date.now()}`,
│    role: 'user',
│    content: text,
│    timestamp: Date.now()
│  }
│
├─ Adds to chatState.messages[]
├─ Renders message in HUD immediately (optimistic update)
│
├─ Sends to Service Worker:
│  chrome.runtime.sendMessage({
│    type: 'ui_chat_user_message',
│    message: text,
│    pageUrl: window.location.href,
│    pageTitle: document.title
│  })
│
└─ Message goes to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ Message listener catches ui_chat_user_message
│
├─ Forwards to WebSocket server:
│  sendToServer({
│    type: 'chat_user_message',
│    message: text,
│    pageUrl: pageUrl,
│    pageTitle: pageTitle,
│    tabId: sender.tab.id
│  })
│
└─ Message goes to WebSocket Server
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ handler() receives chat_user_message
│
├─ Calls: append_user_message(chat_id, message, page_url, page_title)
│  ├─ Creates/loads chat file: chats/{chat_id}.json
│  ├─ Appends message to messages array
│  ├─ Saves chat file
│
├─ Sends acknowledgment:
│  {
│    type: 'chat_append_ack',
│    chatId: chat_id,
│    messageId: message_id,
│    status: 'appended'
│  }
│
├─ [FUTURE: LLM Response Generation]
│  response = await anthropic.messages.create(...)
│  append_assistant_message(chat_id, response)
│  send: { type: 'chat_assistant_message', ... }
│
└─ Acknowledgment flows back through stack
```

### Complete Message Flow: Server → User (Acknowledgment)

```
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ Sends: { type: 'chat_append_ack', ... }
│
└─ Message goes to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ handleServerMessage() catches chat_append_ack
│
├─ Forwards to content script:
│  chrome.tabs.sendMessage(tabId, {
│    type: 'ui_chat_append_ack',
│    chatId: chatId,
│    messageId: messageId,
│    status: 'appended'
│  })
│
└─ Message goes to Content Script
                    ↓
┌─ CONTENT SCRIPT (content.js)
│
├─ Message listener catches ui_chat_append_ack
│
├─ Calls: handleChatAck(data)
│  ├─ Updates message status in chatState
│  ├─ Re-renders chat messages
│  └─ [Optional: shows delivery confirmation]
│
└─ User sees message delivered
```

### Chat History Request Flow

```
┌─ USER (Opens Chat Panel)
│
├─ Chat panel opens
├─ Content script checks if history loaded
│
└─ loadChatHistory() triggered
                    ↓
┌─ CONTENT SCRIPT (content.js)
│
├─ Sends to Service Worker:
│  chrome.runtime.sendMessage({
│    type: 'ui_get_chat_history'
│  })
│
└─ Request goes to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ Forwards to server:
│  sendToServer({ type: 'get_chat_history' })
│
└─ Request goes to WebSocket Server
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ Loads chat file: chats/{chat_id}.json
│
├─ Sends history:
│  {
│    type: 'chat_history',
│    chatId: chat_id,
│    messages: [...all messages...]
│  }
│
└─ History flows back through stack
                    ↓
┌─ CONTENT SCRIPT (content.js)
│
├─ handleChatHistory(data)
│  ├─ chatState.messages = data.messages
│  ├─ renderChatMessages()
│
└─ User sees full chat history
```

### Chat Storage System (ws_server.py)

**Directory Structure:**
```
om_e_web_ws/
└─ chats/
   ├─ a__20251130T134842.json   # Chat file (date-based ID)
   └─ b__20251201T092315.json   # Another chat
```

**Chat File Format:**
```json
{
  "id": "a__20251130T134842",
  "created_at": "2025-11-30T13:48:42.123456",
  "updated_at": "2025-11-30T14:02:15.789012",
  "title": "Chat about YouTube",
  "page_context": {
    "initial_url": "https://www.youtube.com/watch?v=...",
    "initial_title": "Video Title"
  },
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "What is this video about?",
      "timestamp": "2025-11-30T13:48:42.123456",
      "page_url": "https://www.youtube.com/...",
      "page_title": "Video Title"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "This video discusses...",
      "timestamp": "2025-11-30T13:48:45.456789"
    }
  ]
}
```

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `ensure_chats_dir_exists()` | Create chats/ directory if missing |
| `generate_chat_id_from_prompt(prompt)` | Generate unique chat ID from first user message |
| `get_chat_filepath(chat_id)` | Construct path to chat JSON file |
| `load_chat(chat_id)` | Load existing chat or return None |
| `save_chat(chat)` | Persist chat to disk |
| `create_new_chat(initial_prompt, page_url, page_title)` | Initialize new chat with first message |
| `append_user_message(chat_id, message, page_url, page_title)` | Add user message to chat |
| `append_assistant_message(chat_id, message)` | Add LLM response to chat (future) |

### Message Types Reference

**Content Script → Service Worker:**
| Message Type | Purpose |
|--------------|---------|
| `ui_chat_user_message` | User submitted chat message |
| `ui_get_chat_history` | Request chat history |

**Service Worker → WebSocket Server:**
| Message Type | Purpose |
|--------------|---------|
| `chat_user_message` | Forward user message with page context |
| `get_chat_history` | Request chat history |

**WebSocket Server → Service Worker:**
| Message Type | Purpose |
|--------------|---------|
| `chat_append_ack` | Message appended successfully |
| `chat_history` | Full chat conversation |
| `chat_error` | Chat operation error |

**Service Worker → Content Script:**
| Message Type | Purpose |
|--------------|---------|
| `ui_chat_append_ack` | Forward acknowledgment to HUD |
| `ui_chat_history` | Forward history to HUD |
| `ui_chat_error` | Forward error to HUD |

### Integration Points

```
content.js (Chat UI)
├─ sendChatMessage() → ui_chat_user_message
├─ loadChatHistory() → ui_get_chat_history
├─ handleChatAck() ← ui_chat_append_ack
├─ handleChatHistory() ← ui_chat_history
└─ handleChatError() ← ui_chat_error
       ↓
sw.js (Message Router)
├─ ui_chat_user_message → chat_user_message
├─ ui_get_chat_history → get_chat_history
├─ chat_append_ack → ui_chat_append_ack
├─ chat_history → ui_chat_history
└─ chat_error → ui_chat_error
       ↓
ws_server.py (Chat Storage)
├─ chat_user_message → append_user_message()
├─ get_chat_history → load_chat()
└─ [Future: LLM integration]
```

### Console Testing

The chat system exposes a global function for testing:

```javascript
// In browser console
window.omeSendChat("Hello, what can you help me with?")
// → Sends message through full pipeline
// → Server acknowledges
// → HUD updates
```

### Future Enhancements

**LLM Integration (Priority 1):**
```python
# In ws_server.py after append_user_message():
async def generate_llm_response(chat_id, user_message, page_context):
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        messages=chat.get("messages", []),
        system=f"You are helping with: {page_context}"
    )
    assistant_message = response.content[0].text
    append_assistant_message(chat_id, assistant_message)
    return assistant_message
```

**Streaming Responses (Priority 2):**
```python
# Stream tokens as they arrive
with client.messages.stream(...) as stream:
    for text in stream.text_stream:
        await ws.send(json.dumps({
            "type": "chat_stream_token",
            "token": text
        }))
```

---

## 8.7 HUD Action Pipeline Architecture (NEW)

### Overview

The **HUD Action Pipeline** enables the LLM to fully drive the HUD interface through capabilities. When a capability executes, it can return a `_hud_action` object that triggers UI changes across all browser tabs.

**Key Features:**
- Server-driven UI control via capability responses
- Unified pattern for all HUD-affecting capabilities
- Broadcast to all tabs via WebSocket → Service Worker → Content Scripts
- Decoupled architecture: capabilities define *what* to do, HUD handles *how*

### The `_hud_action` Pattern

Every capability that affects the HUD includes a `_hud_action` field in its response:

```python
# In ws_server.py capability handler
elif action == "ShowHUD":
    return {"_hud_action": {"type": "show_hud"}}

elif action == "LoadChat":
    chat = load_chat(chat_id)
    return {
        "chat": chat,
        "_hud_action": {
            "type": "load_chat",
            "chat_id": chat_id,
            "chat": chat
        }
    }
```

The server extracts `_hud_action` and pushes it to the extension before returning the capability result:

```python
# After capability execution in ws_server.py
hud_action = result.get("_hud_action") if isinstance(result, dict) else None
if hud_action and EXTENSION_WS:
    await EXTENSION_WS.send(json.dumps({
        "type": "hud_action",
        "action": hud_action
    }))
    del result["_hud_action"]  # Don't include in response
```

### Complete Message Flow

```
┌─ CAPABILITY TRIGGER (test_navigation.py or LLM)
│
├─ Sends: execute_capability { action: "ShowHUD" }
│
└─ Message goes to WebSocket Server
                    ↓
┌─ WEBSOCKET SERVER (ws_server.py)
│
├─ Executes capability handler
├─ Handler returns: { "_hud_action": { "type": "show_hud" } }
│
├─ Extracts _hud_action, sends to extension:
│  {
│    "type": "hud_action",
│    "action": { "type": "show_hud" }
│  }
│
├─ Returns capability result (without _hud_action)
│
└─ HUD action flows to Service Worker
                    ↓
┌─ SERVICE WORKER (sw.js)
│
├─ handleServerMessage() catches hud_action
│
├─ Broadcasts to ALL tabs:
│  for (const tab of await chrome.tabs.query({})) {
│    chrome.tabs.sendMessage(tab.id, {
│      type: 'hud_action',
│      action: message.action
│    })
│  }
│
└─ Message goes to all Content Scripts
                    ↓
┌─ CONTENT SCRIPT (hud.js)
│
├─ Message listener catches hud_action
│
├─ Switch on action.type:
│  case 'show_hud': toggleHUD() if not visible
│  case 'hide_hud': toggleHUD() if visible
│  case 'toggle_sidebar': toggleSidebar()
│  case 'load_chat': loadAndDisplayChat(chat_id)
│  case 'search_results': filterSidebar(results)
│  ... etc
│
└─ UI updates in all tabs simultaneously
```

### Available HUD Action Capabilities

#### UI View Control

| Capability | Action Type | Effect |
|------------|-------------|--------|
| `ShowHUD` | `show_hud` | Opens HUD overlay if closed |
| `HideHUD` | `hide_hud` | Closes HUD overlay if open |
| `ToggleHUD` | `toggle_hud` | Toggles HUD visibility |
| `ShowSidebar` | `show_sidebar` | Opens chat sidebar |
| `HideSidebar` | `hide_sidebar` | Closes chat sidebar |
| `ToggleSidebar` | `toggle_sidebar` | Toggles sidebar visibility |
| `ExpandOrb` | `expand_orb` | Opens orb chat panel |
| `CollapseOrb` | `collapse_orb` | Closes orb chat panel |

#### Chat Management

| Capability | Action Type | Payload | Effect |
|------------|-------------|---------|--------|
| `LoadChat` | `load_chat` | `{chat_id, chat}` | Loads chat in HUD, updates sidebar |
| `CreateChat` | `create_chat` | `{chat_id, chat}` | Creates new chat, updates sidebar |
| `AppendMessage` | `append_message` | `{chat_id, message}` | Adds message to active chat |
| `RenameChat` | `rename_chat` | `{chat_id, title}` | Updates title in sidebar |
| `DeleteChat` | `delete_chat` | `{chat_id}` | Removes from sidebar, clears if active |
| `SearchChats` | `search_results` | `{query, results}` | Filters sidebar, opens search UI |

### HUD Action Handler (hud.js)

```javascript
// In chrome.runtime.onMessage listener
if (message.type === 'hud_action') {
    const action = message.action;
    switch (action?.type) {
        // View control
        case 'show_hud':
            if (!hudState.visible) toggleHUD();
            break;
        case 'hide_hud':
            if (hudState.visible) toggleHUD();
            break;
        case 'toggle_hud':
            toggleHUD();
            break;
        case 'show_sidebar':
            if (!hudState.sidebarVisible) toggleSidebar(true);
            break;
        case 'hide_sidebar':
            if (hudState.sidebarVisible) toggleSidebar(false);
            break;
        case 'toggle_sidebar':
            toggleSidebar();
            break;
        case 'expand_orb':
            if (!orbState.chatExpanded) toggleOrbChat();
            break;
        case 'collapse_orb':
            if (orbState.chatExpanded) toggleOrbChat();
            break;

        // Chat management
        case 'load_chat':
            CURRENT_CHAT_ID = action.chat_id;
            displayChatInHUD(action.chat);
            highlightActiveChatInSidebar(action.chat_id);
            break;
        case 'create_chat':
            CURRENT_CHAT_ID = action.chat_id;
            refreshSidebarChatList();
            break;
        case 'search_results':
            filterSidebarByResults(action.results);
            openSearchUI();
            break;
        // ... etc
    }
}
```

### Testing HUD Actions

```bash
# Show HUD
python3 test_navigation.py --command capability --capability ShowHUD

# Toggle sidebar
python3 test_navigation.py --command capability --capability ToggleSidebar

# Search chats (triggers search_results action)
python3 test_navigation.py --command capability --capability SearchChats \
    --params '{"query": "youtube"}'

# Load specific chat
python3 test_navigation.py --command capability --capability LoadChat \
    --params '{"chat_id": "my-chat-id__20251207T120000"}'

# Create new chat
python3 test_navigation.py --command capability --capability CreateChat \
    --params '{"title": "New Conversation"}'
```

### Integration Points

```
test_navigation.py / LLM
       ↓ execute_capability
ws_server.py
├─ Capability handlers return _hud_action
├─ Server pushes hud_action to EXTENSION_WS
└─ Returns capability result to caller
       ↓ hud_action message
sw.js
├─ Catches hud_action from server
└─ Broadcasts to all tabs
       ↓ hud_action message
hud.js (all tabs)
├─ Switch on action.type
└─ Execute UI changes
```

### Architecture Benefits

1. **Decoupled** - Capabilities don't know about UI implementation
2. **Consistent** - Same pattern for all HUD-affecting operations
3. **Multi-tab** - All tabs update simultaneously
4. **Testable** - CLI can trigger any UI state
5. **Extensible** - Add new action types without changing pipeline

---

## 9. Conclusion: Where We Are

### ✅ What Works Well

1. **Three-tier architecture** - Clean separation of concerns
2. **Event-driven messaging** - Good async patterns
3. **Multiple client support** - Server handles many test clients
4. **File-based persistence** - Easy to inspect @site_structures/
5. **Smart resolution chain** - Multiple fallback strategies for clicks
6. **Change detection** - Good MutationObserver integration
7. **HUD/Orb UI System** - Shadow DOM isolated UI with themes
8. **Chat Pipeline** - Bidirectional messaging with history persistence
9. **Orb State Persistence** - UI state survives page navigation
10. **Multiple Orb Themes** - Kawaii, Robot, Atom with easy extensibility
11. **HUD Action Pipeline** - LLM can fully drive UI via capabilities (NEW)
12. **Multi-tab Sync** - Chat state and UI sync across all browser tabs (NEW)

### 🔴 What's Broken

1. **Scan coordination** - 8 independent triggers causing duplicates
2. **Server blocking** - Sync I/O freezes the system
3. **Element deduplication** - O(n²) algorithm kills performance
4. **Code complexity** - Multiple 800+ line functions
5. **State desynchronization** - sw.js and content.js don't share state
6. **Global locks** - Multi-tab workflows broken

### 📊 By The Numbers

- **150+ functions** across 4 files (increased with HUD/Chat)
- **14,000+ lines** of code (content.js alone, up from 10,000+)
- **8 scan triggers** (3 in sw.js, 5 in content.js)
- **7+ duplicate functions** (generateSelector, isElementVisible, etc.)
- **800-line functions** (handler in ws_server.py, buildNormalizedPageRecords in content.js)
- **O(n²) algorithms** (element deduplication)
- **5-30 second** processing time for site maps
- **100% blocking** of server during intelligence updates
- **3 orb themes** (kawaii, robot, atom)
- **9 chat message types** (bidirectional pipeline)
- **6 persisted orb state properties** (theme, position, chat visibility, input, panel size, zoom)
- **14 HUD action capabilities** (UI control + chat management)
- **13 hud_action types** (show_hud, hide_hud, toggle_hud, show_sidebar, hide_sidebar, toggle_sidebar, expand_orb, collapse_orb, load_chat, create_chat, append_message, rename_chat, delete_chat, search_results)

---

## Next Steps: Master Refactoring Roadmap

See: **MASTER_REFACTORING_ROADMAP.md** for complete refactoring plan with:
- Week-by-week implementation schedule
- Priority 1-5 issues with effort estimates
- Testing strategy
- Rollback plan
- Success metrics
