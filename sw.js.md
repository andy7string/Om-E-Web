# sw.js Deep Analysis

**File:** `/Users/andy7string/Projects/Om_E_Web/web_extension/sw.js`
**Total Lines:** 2081
**Analysis Date:** 2025-11-18
**Purpose:** Identify DOM scanning bugs causing action ID inflation, duplicate elements, and overlapping scans

---

## EXECUTIVE SUMMARY - CRITICAL FINDINGS

### 🚨 CRITICAL BUGS IDENTIFIED

1. **UNDEFINED FUNCTIONS CALLED** (Lines 417, 886, 1859)
   - `proactivelySendSiteConfig()` - Called but NEVER defined
   - `getCurrentActiveTabId()` - Called but NEVER defined
   - **Impact:** Runtime errors, potential scan failures

2. **MULTIPLE OVERLAPPING SCAN TRIGGERS**
   - 13+ different entry points that trigger `triggerIntelligenceScan()`
   - No coordination between triggers
   - No debouncing mechanism
   - **Impact:** Multiple simultaneous scans → action ID inflation

3. **CONTENT SCRIPT RE-INJECTION WITHOUT CLEANUP**
   - Content scripts re-injected on every tab activation (line 1684)
   - Content scripts re-injected on every URL change (line 1744)
   - Old content script state NOT cleared before re-injection
   - **Impact:** Multiple intelligence engines running simultaneously

4. **RACE CONDITIONS IN ACTION EXECUTION**
   - `actionInProgress` flag (line 41) prevents content refresh during actions
   - BUT: Scan triggers fire before flag is set
   - BUT: DOM mutation observer scans still fire during actions (partial prevention at line 1174)
   - **Impact:** Action IDs invalidated mid-execution

5. **NO SCAN DEDUPLICATION**
   - `tabScanState` map (line 38) only tracks URL changes
   - Does NOT prevent multiple scans for same URL from different triggers
   - Does NOT track in-flight scans
   - **Impact:** Overlapping scans for same page

---

## CHUNK 1: GLOBAL STATE & INITIALIZATION (Lines 1-360)

### Components

**WebSocket Management:**
- `ws` (line 29) - WebSocket connection to server
- `isConnected` (line 32) - Connection status flag
- `pendingMessages` (line 35) - Queue for messages when WS not ready

**Tab State Tracking:**
- `tabScanState` (line 38) - Map of `tabId → { lastUrl, lastScanAt, reason }`
- `actionInProgress` (line 41) - Flag to prevent content refresh during actions
- `internalTabState` (line 44) - Enhanced tab info map
- `lastActiveTabId` (line 45) - Track last active tab
- `tabCache` (line 46) - Cached data per tab

**Site Config Management:**
- `siteConfigs` (line 49) - Local storage of site configs

**Keep-Alive System:**
- `KEEP_ALIVE_PORT_NAME` (line 52) - Port name constant
- `keepAlivePorts` (line 56) - Set of active keep-alive ports
- `lastHeartbeatSent` (line 57) - Timestamp of last heartbeat

### DOM Scanning & Registration

**NONE DIRECTLY** - Service worker does NOT perform DOM scanning itself, but orchestrates it via:
- `triggerIntelligenceScan()` (line 320) - Sends message to content script to start scan

### SCAN TRIGGERS (CRITICAL)

#### TRIGGER 1: `triggerIntelligenceScan()` (Line 320-359)
**What it does:**
- Checks if URL is chrome:// (skips if true)
- Checks `tabScanState` map - skips if same URL already scanned
- Injects `content.js` via `chrome.scripting.executeScript()`
- Sends `start_intelligence_scan` message to content script
- Updates `tabScanState` with new URL and timestamp

**Called by:**
- `chrome.webNavigation.onCompleted` (line 1721)
- `chrome.webNavigation.onHistoryStateUpdated` (line 1728)
- `chrome.tabs.onUpdated` (line 1756)
- `handleDOMChanged` (line 1177) - conditional, if significant DOM changes
- `handleNetworkActivity` (line 1249) - conditional, if network idle

**PROBLEM:** Updates `tabScanState` with `lastUrl`, but does NOT check if scan is already in-flight. Multiple triggers can fire before first scan completes.

#### TRIGGER 2: Content Script Injection on Tab Activation (Line 1684-1688)
**What causes it:**
- `chrome.tabs.onActivated` listener (line 1670)

**What it does:**
```javascript
await chrome.scripting.executeScript({
    target: { tabId: activeInfo.tabId },
    files: ['content.js']
});
```

**PROBLEM:** Re-injects content.js WITHOUT clearing previous instance. If content.js has already run, this creates a SECOND intelligence engine in the same page.

**Impact:** Double scanning, double action ID registration

#### TRIGGER 3: Content Script Injection on URL Change (Line 1744)
**What causes it:**
- `chrome.tabs.onUpdated` listener (line 1736)
- Condition: `changeInfo.url || changeInfo.title`

**What it does:**
```javascript
clearTabCache(tabId);
await ensureContentScriptFresh(tabId);
```

**PROBLEM:** `ensureContentScriptFresh()` re-injects content.js (line 405-408), but does NOT coordinate with other injection triggers.

#### TRIGGER 4: Content Script Injection in `handleDOMCommand()` (Line 878-882)
**What causes it:**
- Any DOM command from server (click, getText, waitFor, etc.)

**What it does:**
```javascript
await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['content.js']
});
```

**PROBLEM:** Injects content.js EVERY TIME a command is received, even if already injected.

#### TRIGGER 5: `ensureContentScriptFresh()` (Line 394-440)
**What causes it:**
- Called from 8+ different locations
- `updateInternalTabState()` on new active tab (line 584)
- `updateInternalTabState()` on URL change (line 591)
- `handleNavigateCommand()` (line 831)
- `handleDOMCommand()` (line 873)
- `handleForceRefresh()` (line 978)
- `handleForceContentScriptReinjection()` (line 1867)

**What it does:**
- Re-injects content.js via `chrome.scripting.executeScript()` (line 405)
- **🚨 CRITICAL BUG:** Calls `proactivelySendSiteConfig()` (line 417) which is UNDEFINED
- Marks tab as having fresh content script

**PROBLEM:** No check if content script already exists and is fresh. Re-injects on every call.

### Action ID Assignment

**NONE** - Service worker does not assign action IDs. It only routes action execution commands.

### Mutation Observers & Event Listeners

**Extension Event Listeners:**
- `chrome.alarms.onAlarm` (line 228) - Heartbeat alarm, triggers `sendHeartbeat()` and `ensureKeepAlivePort()`
- `chrome.runtime.onMessage` (line 725) - Internal messages from content scripts and popup
- `chrome.runtime.onConnect` (line 791) - Keep-alive port connections
- `chrome.tabs.onActivated` (line 1670) - Tab becomes active → content script re-injection
- `chrome.tabs.onUpdated` (line 1736) - Tab URL/title change → content script re-injection + scan trigger
- `chrome.tabs.onCreated` (line 1767) - New tab → send tab info
- `chrome.tabs.onRemoved` (line 1779) - Tab closed → clear scan state
- `chrome.webNavigation.onBeforeNavigate` (line 1710) - Navigation starts → clear scan state
- `chrome.webNavigation.onCompleted` (line 1717) - Navigation completes → **SCAN TRIGGER**
- `chrome.webNavigation.onHistoryStateUpdated` (line 1724) - SPA navigation → **SCAN TRIGGER**
- `chrome.runtime.onStartup` (line 1795) - Extension starts → connect WebSocket
- `chrome.runtime.onInstalled` (line 1808) - Extension installed/updated → connect WebSocket

### Timers, Intervals, Async Loops

**TIMER 1:** WebSocket connection delay (line 84)
- `setTimeout(() => { ... }, 100)` - Wait for WebSocket to be ready before sending initial messages
- Triggers: `sendTabsInfo()`, `sendActiveTabInfo()`, `flushPendingMessages()`, `sendHeartbeat()`

**TIMER 2:** WebSocket reconnection (lines 107, 126, 136)
- `setTimeout(connectWebSocket, 500)` or `setTimeout(connectWebSocket, 1000)`
- Retries WebSocket connection on failure

**TIMER 3:** Content script initialization delay (line 893)
- `await new Promise(resolve => setTimeout(resolve, 100))`
- Waits for content script to initialize before sending command
- **PROBLEM:** Hardcoded 100ms may not be enough for slow pages

**TIMER 4:** WebSocket reconnection delay (line 947)
- `setTimeout(() => { connectWebSocket(); }, 100)`
- Reconnects after URL update from popup

**TIMER 5:** DOM mutation rescan delay (line 1176)
- `setTimeout(() => { triggerIntelligenceScan(...); }, 500)`
- Waits for DOM to settle before rescanning
- **PROBLEM:** Multiple DOM changes within 500ms → multiple overlapping scans

**TIMER 6:** Network idle rescan delay (line 1246)
- `setTimeout(() => { triggerIntelligenceScan(...); }, 1000)`
- Waits for network to be idle before rescanning
- **PROBLEM:** Multiple network completions → multiple overlapping scans

**TIMER 7:** Post-action content script refresh delay (line 1405)
- `setTimeout(() => { ensureContentScriptFresh(...); }, 2000)`
- Waits 2 seconds after action execution before refreshing
- **PROBLEM:** Action may still be in progress (DOM changes, network requests)

**TIMER 8:** Tab reload + content script injection delay (line 1937)
- `setTimeout(async () => { chrome.scripting.executeScript(...); }, 2000)`
- Waits 2 seconds after hard refresh before re-injecting content script

**INTERVAL 1:** Keep-alive port check (line 1833)
- `setInterval(() => { ensureKeepAlivePort(); }, KEEP_ALIVE_CHECK_INTERVAL_MS)`
- Checks every 30 seconds if keep-alive port exists
- **Not a scan trigger**

### Dead/Legacy/Duplicated Code

**LIKELY DEAD:**
- `tabCache` map (line 46) - Created and cleared, but never actually used to cache data
- `clearTabCache()` logs "cached data" but always returns empty object

**DUPLICATED LOGIC:**
- Content script injection appears in 5+ different functions with identical code
- Tab info sending (`sendTabsInfo()` + `sendActiveTabInfo()`) called from 10+ locations

**UNCLEAR:**
- `actionInProgress` flag (line 41) - Set/cleared in `handleExecuteLLMAction()` but NOT checked in all scan trigger paths
- DOM change tracking in `internalTabState` (lines 566-571) - Tracked but not used for deduplication

### Cross-File Interactions

**Messages TO content.js:**
- `start_intelligence_scan` (line 342) - Triggers DOM scan
- `site_configs_update` (line 644) - Broadcasts site config updates
- `execute_action` (line 1382) - Executes LLM action (click, setValue, etc.)
- `execute_capability` (line 1456) - Executes capability (e.g., RetrieveTranscript)
- DOM commands (line 896) - click, getText, waitFor, getPageMarkdown, etc.

**Messages FROM content.js:**
- `intelligence_update` (line 748) - Scan results with actionable elements
- `dom_changed` (line 742) - DOM mutation notifications
- `network_activity` (line 745) - Network request tracking
- `immediate_scan_results` (line 772) - Tear-away scan results

**Messages TO ws_server.py:**
- `bridge_status` (line 89) - Extension connected
- `tabs_info` (line 467) - All tabs information
- `active_tab_info` (line 501) - Current active tab
- `ping` (line 247) - Heartbeat
- `dom_content_changed` (line 1159) - Significant DOM changes
- `network_activity` (line 1231) - Network request tracking
- `intelligence_update` (line 1326) - Forwarded from content script
- `immediate_scan_results_after_tear_away` (line 2001) - Tear-away results

**Messages FROM ws_server.py:**
- `site_configs_update` (line 627) - New site configs
- `execute_llm_action` (line 656) - Execute action by action ID
- `execute_capability` (line 665) - Execute capability
- `server_ping` (line 671) - Heartbeat from server
- DOM commands (lines 686-707) - navigate, click, getText, etc.

### Chunk 1 Summary

**Key Findings:**
- Service worker orchestrates scans but does not perform them
- 13+ different scan triggers, many overlapping
- `tabScanState` only prevents same-URL rescans, NOT in-flight scan deduplication
- Content script re-injected on tab activation, URL change, and every DOM command
- No cleanup of previous content script instances before re-injection
- `actionInProgress` flag exists but not checked in all scan paths
- Multiple timers with hardcoded delays (100ms, 500ms, 1s, 2s) can cause race conditions
- **CRITICAL:** `proactivelySendSiteConfig()` called but never defined

**Suspected Risks:**
- Multiple intelligence engines running simultaneously in same tab
- Overlapping scans from different triggers (webNavigation + tabs.onUpdated + DOM changes)
- Action IDs invalidated before actions complete (scan triggered during action)
- Content script state persists across re-injections (no cleanup)

---

## CHUNK 2: MESSAGE HANDLING & COMMAND ROUTING (Lines 360-1260)

### Components

**Message Handlers:**
- `clearTabCache()` (line 366) - Clears cached data for tab
- `ensureContentScriptFresh()` (line 394) - Re-injects content script
- `sendTabsInfo()` (line 450) - Sends all tabs to server
- `sendActiveTabInfo()` (line 487) - Sends active tab to server
- `updateInternalTabState()` (line 524) - Updates internal tab tracking
- `handleServerMessage()` (line 621) - Routes messages from WebSocket server
- `chrome.runtime.onMessage` (line 725) - Routes internal extension messages

**Command Handlers:**
- `handleNavigateCommand()` (line 814) - Navigates tab to URL
- `handleDOMCommand()` (line 850) - Forwards DOM commands to content script
- `handleSetWsUrl()` (line 932) - Updates WebSocket URL
- `handleForceRefresh()` (line 965) - Force refreshes all tabs
- `handleClearAllCache()` (line 1004) - Clears all tab cache
- `handleGetStatus()` (line 1041) - Returns status metrics
- `handleDOMChanged()` (line 1105) - Processes DOM change notifications
- `handleNetworkActivity()` (line 1190) - Processes network activity
- `handleIntelligenceUpdate()` (line 1270) - Forwards intelligence to server

### DOM Scanning & Registration

**NONE DIRECTLY** - All commands forwarded to content script

### SCAN TRIGGERS (CRITICAL)

#### TRIGGER 6: `handleDOMChanged()` Conditional Rescan (Line 1174-1181)
**What causes it:**
- `dom_changed` message from content script (line 742)
- Mutation observer in content.js detects DOM changes

**Trigger logic:**
```javascript
if (targetTabId && message.isSignificant && !actionInProgress) {
    setTimeout(() => {
        triggerIntelligenceScan(targetTabId, message.url, "dom_mutation", true);
    }, 500);
} else if (actionInProgress) {
    console.log("[SW] ⏸️ Skipping DOM mutation rescan - action in progress");
}
```

**PROBLEM:**
- `isSignificant` flag from content script determines whether to rescan
- 500ms delay allows multiple DOM changes to queue up multiple scans
- If action completes during 500ms delay, scan will fire AFTER action
- No deduplication of multiple DOM change events

#### TRIGGER 7: `handleNetworkActivity()` Conditional Rescan (Line 1244-1254)
**What causes it:**
- `network_activity` message from content script (line 745)
- WebRequest monitoring in content.js

**Trigger logic:**
```javascript
if (message.eventType.includes('_end') && message.inflightRequests === 0 && !actionInProgress) {
    setTimeout(() => {
        const tab = internalTabState.get(tabId);
        if (tab && tab.url) {
            triggerIntelligenceScan(tabId, tab.url, "network_idle", true);
        }
    }, 1000);
} else if (actionInProgress) {
    console.log("[SW] ⏸️ Skipping network idle rescan - action in progress");
}
```

**PROBLEM:**
- 1 second delay allows action to complete, BUT multiple network requests can trigger multiple scans
- If 5 network requests complete within 1 second, 5 overlapping scans will be queued
- No deduplication

#### TRIGGER 8: `updateInternalTabState()` Auto-Injection (Line 582-593)
**What causes it:**
- Called from `sendTabsInfo()` (line 463)
- Called on tab activation, URL change, title change, status change

**Trigger logic:**
```javascript
// If this is a new active tab, ensure content script is fresh
if (tabInfo.active && tabInfo.id !== lastActiveTabId) {
    console.log("[SW] New active tab detected, ensuring fresh content script");
    ensureContentScriptFresh(tabInfo.id);
    lastActiveTabId = tabInfo.id;
}

// If URL changed, this definitely needs fresh scan
if (oldInfo && oldInfo.url !== tabInfo.url) {
    console.log("[SW] URL change detected, forcing content script refresh");
    ensureContentScriptFresh(tabInfo.id);
}
```

**PROBLEM:**
- `ensureContentScriptFresh()` re-injects content.js WITHOUT clearing previous instance
- Both conditions can be true simultaneously (new active tab + URL change) → double injection
- `sendTabsInfo()` called from 10+ locations → can trigger multiple times

#### TRIGGER 9: `handleNavigateCommand()` Cache Clear (Line 831)
**What causes it:**
- `navigate` command from server

**What it does:**
```javascript
clearTabCache(activeTab.id);
```

**Does NOT trigger scan directly**, but marks tab as needing fresh scan. Scan will be triggered by `chrome.tabs.onUpdated` when navigation completes.

#### TRIGGER 10: `handleDOMCommand()` Content Script Injection (Line 878-886)
**What causes it:**
- Any DOM command (click, getText, waitFor, getPageMarkdown, scanAndRegisterElements, etc.)

**What it does:**
```javascript
await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    files: ['content.js']
});

await proactivelySendSiteConfig(activeTab.id, activeTab.url); // 🚨 UNDEFINED FUNCTION
```

**PROBLEM:**
- Re-injects content.js on EVERY command, even if already injected
- Calls undefined function `proactivelySendSiteConfig()`
- If `scanAndRegisterElements` command is sent, this will trigger a scan

#### TRIGGER 11: `handleForceRefresh()` Batch Refresh (Line 965-996)
**What causes it:**
- `forceRefresh` internal message (from popup or other extension component)

**What it does:**
```javascript
await sendTabsInfo(true); // Force refresh all internal state

const tabs = await chrome.tabs.query({});
for (const tab of tabs) {
    await ensureContentScriptFresh(tab.id); // Re-inject content.js in ALL tabs
}
```

**PROBLEM:**
- Re-injects content.js in ALL tabs simultaneously
- Can cause 10-20+ simultaneous content script injections
- Each injection can trigger a scan
- No rate limiting or queuing

### Action ID Assignment

**NONE** - Service worker routes action execution but does not assign IDs

### Mutation Observers & Event Listeners

**Internal Message Listener** (`chrome.runtime.onMessage`, line 725):
- Handles messages from content scripts, popup, and other extension components
- Routes to specific handlers based on `message.type`

**Message Types Handled:**
- `setWsUrl` → `handleSetWsUrl()`
- `forceRefresh` → `handleForceRefresh()` → **SCAN TRIGGER**
- `clearAllCache` → `handleClearAllCache()`
- `getStatus` → `handleGetStatus()`
- `dom_changed` → `handleDOMChanged()` → **CONDITIONAL SCAN TRIGGER**
- `network_activity` → `handleNetworkActivity()` → **CONDITIONAL SCAN TRIGGER**
- `intelligence_update` → `handleIntelligenceUpdate()` → Forwards to server
- `get_site_config_for_domain` → `handleGetSiteConfigForDomain()`
- `execute_llm_action` → `handleExecuteLLMAction()`
- `ping` → Responds with pong
- `force_content_script_reinjection` → `handleForceContentScriptReinjection()` → **SCAN TRIGGER**
- `force_extension_reload` → `handleForceExtensionReload()`
- `immediate_scan_results` → `handleImmediateScanResults()`

### Timers, Intervals, Async Loops

*(Already documented in Chunk 1)*

### Dead/Legacy/Duplicated Code

**DUPLICATED:**
- `clearTabCache()` called from 8+ locations
- `ensureContentScriptFresh()` called from 8+ locations
- `sendTabsInfo()` called from 10+ locations
- `sendActiveTabInfo()` called from 8+ locations

**INCONSISTENT:**
- Some handlers check `actionInProgress` flag (lines 1174, 1244)
- Other handlers do NOT check flag (line 1684, 1744, 878)
- No consistent pattern for when to prevent scans during actions

### Cross-File Interactions

*(Already documented in Chunk 1)*

**Additional Interactions:**

**Intelligence Update Flow:**
```
content.js → intelligence_update message → handleIntelligenceUpdate() → ws_server.py
```

**Validation in `handleIntelligenceUpdate()`:**
- Checks if update is from active tab (line 1293)
- Ignores updates from inactive tabs
- **PROBLEM:** If tab becomes inactive during scan, results are discarded

**DOM Changed Flow:**
```
content.js → dom_changed message → handleDOMChanged() → [conditional] → triggerIntelligenceScan()
```

**Network Activity Flow:**
```
content.js → network_activity message → handleNetworkActivity() → [conditional] → triggerIntelligenceScan()
```

### Chunk 2 Summary

**Key Findings:**
- Message routing layer with 15+ different message types
- Internal message handler routes to specific command handlers
- `handleDOMChanged()` and `handleNetworkActivity()` conditionally trigger rescans
- Both use `actionInProgress` flag BUT flag not set until AFTER action message is sent to content script
- Race condition: DOM change or network completion can trigger scan BEFORE action flag is set
- `handleForceRefresh()` can inject content scripts into 20+ tabs simultaneously
- `handleIntelligenceUpdate()` only accepts updates from active tab (discards inactive tab scans)
- **CRITICAL:** `proactivelySendSiteConfig()` called in `handleDOMCommand()` but never defined

**Suspected Risks:**
- Race condition: Action message sent → DOM changes → scan triggered → action flag set (too late)
- Batch content script injection (force refresh) can overwhelm extension
- Inactive tab scans discarded, but scan was already triggered and performed
- No deduplication for multiple DOM changes or network completions within delay window

---

## CHUNK 3: ACTION EXECUTION & CAPABILITY HANDLING (Lines 1260-1665)

### Components

**Action Execution:**
- `handleExecuteLLMAction()` (line 1363) - Executes LLM actions via content script
- `handleExecuteCapability()` (line 1442) - Executes capabilities via content script

**Tab Management:**
- `findActiveTab()` (line 1488) - Complex multi-strategy tab finding
- `isTabAccessible()` (line 1615) - Checks if tab is accessible for content scripts

**Response Helpers:**
- `sendSuccessResponse()` (line 1637) - Sends success to server
- `sendErrorResponse()` (line 1653) - Sends error to server

### DOM Scanning & Registration

**NONE** - Service worker does not scan DOM

### SCAN TRIGGERS (CRITICAL)

#### TRIGGER 12: `handleExecuteLLMAction()` Post-Action Refresh (Line 1405-1414)
**What causes it:**
- LLM action execution completes successfully

**Trigger logic:**
```javascript
actionInProgress = false; // Clear flag immediately

setTimeout(() => {
    if (activeTab && internalTabState.has(activeTab.id)) {
        const tabState = internalTabState.get(activeTab.id);
        if (tabState && tabState.needsFreshScan) {
            console.log("[SW] 🔄 Now refreshing content script after action execution delay");
            ensureContentScriptFresh(activeTab.id); // Re-injects content.js
        }
    }
}, 2000); // 2 second delay
```

**PROBLEM:**
- Waits 2 seconds after action completes before refreshing content script
- BUT: DOM changes from action may trigger DOM mutation scan within 500ms
- BUT: Network requests from action may trigger network idle scan within 1000ms
- Race condition: Multiple scans can be triggered before 2 second delay expires
- Re-injects content.js, which will trigger ANOTHER scan when it initializes

**Timeline Example:**
```
t=0ms:     Action executed (click button)
t=100ms:   DOM changes detected → 500ms delay starts
t=200ms:   Network request completes → 1000ms delay starts
t=600ms:   DOM mutation scan triggered (from t=100ms + 500ms delay)
t=1200ms:  Network idle scan triggered (from t=200ms + 1000ms delay)
t=2000ms:  Post-action content script refresh → re-injection → ANOTHER scan
```

**Result:** 3 overlapping scans for a single action

### Action ID Assignment

**NONE** - Service worker routes actions by ID but does not assign them

### Mutation Observers & Event Listeners

**NONE** - Covered in Chunk 1

### Timers, Intervals, Async Loops

*(Already documented in Chunk 1)*

### Dead/Legacy/Duplicated Code

**POTENTIALLY DEAD:**
- `findActiveTab()` has 3 fallback strategies (current window, last focused, any visible)
- Strategy 3 (line 1534-1568) may never be reached if Strategy 1 or 2 always succeed
- Complex sorting logic may be unnecessary

**UNCLEAR:**
- Why does `findActiveTab()` call `chrome.tabs.get(tab.id)` to "refresh" tab data?
- Does Chrome cache tab data? Is refresh necessary?

### Cross-File Interactions

**Action Execution Flow:**
```
ws_server.py → execute_llm_action message → handleExecuteLLMAction() → content.js (execute_action)
                                                                      ↓
                                                                   2s delay
                                                                      ↓
                                                            ensureContentScriptFresh()
                                                                      ↓
                                                              content.js re-injected
                                                                      ↓
                                                               NEW SCAN TRIGGERED
```

**Capability Execution Flow:**
```
ws_server.py → execute_capability message → handleExecuteCapability() → content.js (execute_capability)
```

**NO post-capability refresh** - Capabilities do not trigger content script re-injection

### Chunk 3 Summary

**Key Findings:**
- Action execution sets `actionInProgress` flag to prevent content script refresh
- Flag cleared immediately after action completes (line 1400)
- BUT: 2 second delay before content script refresh (line 1405)
- DOM mutation and network idle scans can fire during this 2 second window
- Content script re-injection after action will trigger another scan
- Capabilities do NOT trigger post-execution refresh (different behavior than actions)
- `findActiveTab()` has complex fallback logic with 3 strategies
- `isTabAccessible()` filters out chrome://, about:, and extension URLs

**Suspected Risks:**
- Post-action scans overlap with DOM mutation and network idle scans
- 2 second delay may not be enough for slow actions (e.g., form submission with redirect)
- Content script re-injection adds another scan on top of existing scans
- No coordination between action completion and scan triggers

---

## CHUNK 4: TAB EVENT HANDLERS (Lines 1665-1838)

### Components

**Tab Event Handlers:**
- `chrome.tabs.onActivated` (line 1670) - Tab becomes active
- `chrome.webNavigation.onBeforeNavigate` (line 1710) - Navigation starts
- `chrome.webNavigation.onCompleted` (line 1717) - Navigation completes
- `chrome.webNavigation.onHistoryStateUpdated` (line 1724) - SPA navigation
- `chrome.tabs.onUpdated` (line 1736) - Tab URL/title/status changes
- `chrome.tabs.onCreated` (line 1767) - New tab created
- `chrome.tabs.onRemoved` (line 1779) - Tab closed

**Startup Handlers:**
- `chrome.runtime.onStartup` (line 1795) - Extension starts
- `chrome.runtime.onInstalled` (line 1808) - Extension installed/updated

**Initialization:**
- Lines 1828-1837 - Service worker initialization on load

### DOM Scanning & Registration

**NONE** - Event handlers trigger scans but do not perform them

### SCAN TRIGGERS (CRITICAL)

#### TRIGGER 13: `chrome.tabs.onActivated` Content Script Injection (Line 1684-1688)
**What causes it:**
- User switches to a different tab

**Trigger logic:**
```javascript
await chrome.scripting.executeScript({
    target: { tabId: activeInfo.tabId },
    files: ['content.js']
});
```

**PROBLEM:**
- Re-injects content.js on EVERY tab activation
- Does not check if content script already exists
- Does not clear previous content script state
- **RESULT:** Multiple intelligence engines in same tab if user switches away and back

**Additional actions:**
- Clears cache for previously active tab (line 1676)
- Marks new tab as having fresh content script (line 1697)
- Sends active tab info to server (line 1706)
- Sends all tabs info to server (line 1707)

#### TRIGGER 14: `chrome.webNavigation.onBeforeNavigate` Clear State (Line 1710-1715)
**What causes it:**
- Navigation starts (before page loads)

**What it does:**
```javascript
if (details.frameId !== 0) return; // Main frame only
tabScanState.delete(details.tabId);
```

**Does NOT trigger scan**, but clears scan state so next navigation will trigger scan

#### TRIGGER 15: `chrome.webNavigation.onCompleted` Scan Trigger (Line 1717-1722)
**What causes it:**
- Navigation completes (page fully loaded)

**Trigger logic:**
```javascript
if (details.frameId !== 0) return; // Main frame only
triggerIntelligenceScan(details.tabId, details.url, "webNavigation.onCompleted");
```

**PROBLEM:**
- Fires on every page load
- Can overlap with `chrome.tabs.onUpdated` (line 1756) which fires on same event
- Can overlap with `chrome.tabs.onActivated` (line 1684) if tab becomes active during load

#### TRIGGER 16: `chrome.webNavigation.onHistoryStateUpdated` SPA Scan (Line 1724-1729)
**What causes it:**
- SPA (Single Page Application) navigation via `history.pushState()` or `history.replaceState()`
- Examples: YouTube video changes, Twitter post navigation

**Trigger logic:**
```javascript
if (details.frameId !== 0) return; // Main frame only
triggerIntelligenceScan(details.tabId, details.url, "webNavigation.onHistoryStateUpdated");
```

**PROBLEM:**
- SPA sites can trigger this 10-20 times per minute (e.g., YouTube autoplay)
- Each trigger starts a new scan
- `tabScanState` prevents duplicate scans for same URL, BUT many SPAs change URL on every navigation
- **RESULT:** Rapid-fire scans on SPA sites

#### TRIGGER 17: `chrome.tabs.onUpdated` Multiple Triggers (Line 1736-1760)
**What causes it:**
- Tab URL changes
- Tab title changes
- Tab status changes (loading → complete)

**Trigger logic:**
```javascript
if (changeInfo.url || changeInfo.title) {
    clearTabCache(tabId);
    await ensureContentScriptFresh(tabId); // Re-inject content.js
    if (tab.active) {
        await sendActiveTabInfo();
    }
    await sendTabsInfo(false);
}

if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    await triggerIntelligenceScan(tabId, tab.url, "tabs.onUpdated complete");
}

await ensureKeepAlivePort();
```

**PROBLEM:**
- Both conditions can be true simultaneously:
  - `changeInfo.url === true` → `ensureContentScriptFresh()` → content.js re-injected
  - `changeInfo.status === 'complete'` → `triggerIntelligenceScan()` → scan triggered
- Content.js re-injection will trigger its own scan when it initializes
- **RESULT:** Double scan on every page load

**Overlap with other triggers:**
- `chrome.webNavigation.onCompleted` fires at same time as `status === 'complete'`
- `chrome.tabs.onActivated` fires if tab becomes active during load
- **RESULT:** 3-4 simultaneous scans for a single page load on active tab

### Action ID Assignment

**NONE**

### Mutation Observers & Event Listeners

*(Already documented in Chunk 1)*

### Timers, Intervals, Async Loops

**INTERVAL 1:** Keep-alive port check (line 1833-1837)
```javascript
setInterval(() => {
    if (keepAlivePorts.size === 0) {
        ensureKeepAlivePort();
    }
}, KEEP_ALIVE_CHECK_INTERVAL_MS); // 30 seconds
```

**Not a scan trigger**

### Dead/Legacy/Duplicated Code

**DUPLICATED:**
- `sendTabsInfo()` called in 4 different event handlers
- `sendActiveTabInfo()` called in 4 different event handlers
- `ensureKeepAlivePort()` called in 5 different event handlers

**UNCLEAR:**
- Why does `chrome.tabs.onUpdated` check `changeInfo.url || changeInfo.title` separately from `changeInfo.status === 'complete'`?
- Could these be combined to prevent double scanning?

### Cross-File Interactions

**Tab activation flow:**
```
User switches tabs → chrome.tabs.onActivated → content.js re-injected → scan triggered
                                             → sendActiveTabInfo() → ws_server.py
                                             → sendTabsInfo() → ws_server.py
```

**Page load flow (active tab):**
```
Navigation starts → chrome.webNavigation.onBeforeNavigate → clear tabScanState
                 → chrome.tabs.onUpdated (status=loading) → no scan
                 → chrome.tabs.onUpdated (changeInfo.url) → ensureContentScriptFresh() → content.js re-injected
                 → chrome.webNavigation.onCompleted → triggerIntelligenceScan() → SCAN 1
                 → chrome.tabs.onUpdated (status=complete) → triggerIntelligenceScan() → SCAN 2 (prevented by tabScanState)
                 → content.js initializes → SCAN 3
```

**RESULT:** 2-3 scans per page load (tabScanState prevents one duplicate)

### Chunk 4 Summary

**Key Findings:**
- 7 different tab event handlers, 4 of which trigger scans
- `chrome.tabs.onActivated` re-injects content.js on every tab switch
- `chrome.webNavigation.onCompleted` triggers scan
- `chrome.webNavigation.onHistoryStateUpdated` triggers scan on SPA navigation
- `chrome.tabs.onUpdated` triggers both content script re-injection AND scan
- Multiple event handlers fire simultaneously for same page load
- `tabScanState` prevents some duplicates but NOT overlapping scans
- SPA sites trigger rapid-fire scans (10-20 per minute)
- Keep-alive port check runs every 30 seconds

**Suspected Risks:**
- 3-4 overlapping scans per page load (webNavigation.onCompleted + tabs.onUpdated + content.js init)
- SPA navigation triggers scan on every URL change (YouTube, Twitter, etc.)
- Content script re-injection on every tab switch creates multiple intelligence engines
- No rate limiting or debouncing for rapid tab switches or SPA navigation

---

## CHUNK 5: TEAR-AWAY & ADVANCED HANDLERS (Lines 1838-2081)

### Components

**Tear-Away System Handlers:**
- `handleForceContentScriptReinjection()` (line 1852) - Forces content script re-injection
- `handleForceExtensionReload()` (line 1900) - Forces extension reload
- `handleImmediateScanResults()` (line 1982) - Processes immediate scan results

**Site Config Handler:**
- `handleGetSiteConfigForDomain()` (line 2036) - Looks up site config for domain

### DOM Scanning & Registration

**NONE**

### SCAN TRIGGERS (CRITICAL)

#### TRIGGER 18: `handleForceContentScriptReinjection()` (Line 1852-1892)
**What causes it:**
- `force_content_script_reinjection` internal message (from tear-away system or manual trigger)

**Trigger logic:**
```javascript
const targetTabId = tabId || await getCurrentActiveTabId(); // 🚨 UNDEFINED FUNCTION
await ensureContentScriptFresh(targetTabId);
clearTabCache(targetTabId);

const tabState = internalTabState.get(targetTabId);
if (tabState) {
    tabState.needsFreshScan = true;
    tabState.contentScriptFresh = false;
}
```

**PROBLEM:**
- Calls `getCurrentActiveTabId()` which is NEVER DEFINED
- **This function will throw a runtime error if tabId is not provided**
- Forces content script re-injection without checking if already fresh
- Marks tab as needing fresh scan (will trigger scan when content script initializes)

#### TRIGGER 19: `handleForceExtensionReload()` Hard Refresh (Line 1900-1974)
**What causes it:**
- `force_extension_reload` internal message (from tear-away system or manual trigger)

**Trigger logic (if `forceReload` flag is true):**
```javascript
const tabs = await chrome.tabs.query({ active: true });
for (const tab of tabs) {
    await chrome.tabs.reload(tab.id, { bypassCache: true }); // Hard refresh

    setTimeout(async () => {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        }); // Re-inject content.js after 2 seconds
    }, 2000);
}
```

**PROBLEM:**
- Hard refreshes ALL active tabs (can be 5-10 tabs in multi-window setup)
- Re-injects content.js in ALL active tabs after 2 seconds
- No coordination between tabs
- Each tab will trigger its own scan when content.js initializes
- **RESULT:** 5-10 simultaneous scans if user has multiple active tabs

### Action ID Assignment

**NONE**

### Mutation Observers & Event Listeners

**NONE** - All listeners documented in previous chunks

### Timers, Intervals, Async Loops

*(Already documented in previous chunks)*

### Dead/Legacy/Duplicated Code

**CRITICAL BUG:**
- `getCurrentActiveTabId()` called at line 1859 but NEVER DEFINED
- This will throw `ReferenceError: getCurrentActiveTabId is not defined` at runtime

**CRITICAL BUG:**
- `proactivelySendSiteConfig()` called at lines 417 and 886 but NEVER DEFINED
- This will throw `ReferenceError: proactivelySendSiteConfig is not defined` at runtime

**UNCLEAR:**
- `handleImmediateScanResults()` processes scan results but does not trigger a scan
- When is this called? What is the "tear-away" system?

### Cross-File Interactions

**Immediate scan results flow:**
```
content.js → immediate_scan_results message → handleImmediateScanResults() → ws_server.py
```

**Site config lookup flow:**
```
content.js → get_site_config_for_domain message → handleGetSiteConfigForDomain() → return config
```

**Force reload flow:**
```
Tear-away system → force_extension_reload message → handleForceExtensionReload() → hard refresh ALL active tabs
                                                                                   → re-inject content.js after 2s
                                                                                   → multiple scans
```

### Chunk 5 Summary

**Key Findings:**
- Tear-away system handlers for CSP bypass and forced re-injection
- `handleForceContentScriptReinjection()` calls undefined function `getCurrentActiveTabId()`
- `handleForceExtensionReload()` can hard refresh 5-10 tabs simultaneously
- Each hard refresh will trigger content.js re-injection after 2 seconds
- Multiple simultaneous scans if user has multiple active tabs
- `handleImmediateScanResults()` forwards scan results to server
- `handleGetSiteConfigForDomain()` looks up site config from local storage

**Suspected Risks:**
- Runtime errors from undefined functions will break tear-away system
- Hard refresh of multiple tabs can overwhelm extension
- No rate limiting or queuing for batch operations

---

## FILE COMPLETE - GLOBAL SUMMARY

### ALL SCAN TRIGGERS (19 TOTAL)

**Direct Scan Triggers (call `triggerIntelligenceScan()`):**
1. `chrome.webNavigation.onCompleted` (line 1721) - Page load complete
2. `chrome.webNavigation.onHistoryStateUpdated` (line 1728) - SPA navigation
3. `chrome.tabs.onUpdated` status=complete (line 1756) - Tab loading complete
4. `handleDOMChanged()` conditional (line 1177) - Significant DOM changes (500ms delay)
5. `handleNetworkActivity()` conditional (line 1249) - Network idle (1000ms delay)

**Content Script Re-Injection Triggers (indirectly trigger scans):**
6. `chrome.tabs.onActivated` (line 1684) - Tab becomes active
7. `chrome.tabs.onUpdated` URL/title change (line 1744) → `ensureContentScriptFresh()`
8. `updateInternalTabState()` new active tab (line 584) → `ensureContentScriptFresh()`
9. `updateInternalTabState()` URL change (line 591) → `ensureContentScriptFresh()`
10. `handleNavigateCommand()` (line 831) → `clearTabCache()` → scan on next update
11. `handleDOMCommand()` (line 878) - Every DOM command re-injects content.js
12. `handleExecuteLLMAction()` post-action (line 1405) - 2s delay → `ensureContentScriptFresh()`
13. `handleForceRefresh()` (line 978) - Re-injects content.js in ALL tabs
14. `handleForceContentScriptReinjection()` (line 1867) → `ensureContentScriptFresh()`
15. `handleForceExtensionReload()` (line 1937) - Hard refresh ALL active tabs → re-inject after 2s

**Initialization Triggers:**
16. `connectWebSocket()` onopen (line 95) → `sendTabsInfo()` → `updateInternalTabState()`
17. `chrome.runtime.onStartup` (line 1797) → `connectWebSocket()`
18. `chrome.runtime.onInstalled` (line 1810) → `connectWebSocket()`
19. Service worker load (line 1828) → `connectWebSocket()`

### ALL MESSAGE ROUTING THAT CAUSES SCANS

**From WebSocket Server → Service Worker:**
- `execute_llm_action` → `handleExecuteLLMAction()` → post-action refresh (2s delay)
- `execute_capability` → `handleExecuteCapability()` → no post-action refresh
- DOM commands → `handleDOMCommand()` → content script re-injection
- `navigate` → `handleNavigateCommand()` → scan on navigation complete

**From Content Script → Service Worker:**
- `dom_changed` → `handleDOMChanged()` → conditional rescan (500ms delay)
- `network_activity` → `handleNetworkActivity()` → conditional rescan (1000ms delay)
- `intelligence_update` → `handleIntelligenceUpdate()` → forwarded to server (no scan)

**Internal Extension Messages:**
- `forceRefresh` → `handleForceRefresh()` → re-inject ALL tabs
- `force_content_script_reinjection` → `handleForceContentScriptReinjection()` → re-inject
- `force_extension_reload` → `handleForceExtensionReload()` → hard refresh ALL active tabs

### ALL TAB EVENT HANDLERS

**Chrome Tab Events:**
- `chrome.tabs.onActivated` → content script re-injection
- `chrome.tabs.onUpdated` → content script re-injection + scan trigger
- `chrome.tabs.onCreated` → send tab info (no scan)
- `chrome.tabs.onRemoved` → clear scan state (no scan)

**Chrome WebNavigation Events:**
- `chrome.webNavigation.onBeforeNavigate` → clear scan state
- `chrome.webNavigation.onCompleted` → **SCAN TRIGGER**
- `chrome.webNavigation.onHistoryStateUpdated` → **SCAN TRIGGER**

**Chrome Runtime Events:**
- `chrome.runtime.onStartup` → connect WebSocket
- `chrome.runtime.onInstalled` → connect WebSocket
- `chrome.runtime.onMessage` → route internal messages
- `chrome.runtime.onConnect` → keep-alive port tracking

**Chrome Alarms:**
- `chrome.alarms.onAlarm` → heartbeat + keep-alive check (no scan)

### ALL CONTENT SCRIPT INJECTION POINTS

**Direct Injection (chrome.scripting.executeScript):**
1. `triggerIntelligenceScan()` (line 334) - Before sending start_intelligence_scan message
2. `ensureContentScriptFresh()` (line 405) - Called from 8+ locations
3. `handleDOMCommand()` (line 878) - Before every DOM command
4. `chrome.tabs.onActivated` (line 1684) - Every tab activation
5. `handleForceExtensionReload()` (line 1939) - After hard refresh (2s delay)

**Indirect Injection (via ensureContentScriptFresh):**
- `updateInternalTabState()` new active tab (line 584)
- `updateInternalTabState()` URL change (line 591)
- `chrome.tabs.onUpdated` URL/title change (line 1744)
- `handleDOMCommand()` if tab needs fresh scan (line 873)
- `handleExecuteLLMAction()` post-action (line 1411) - conditional, 2s delay
- `handleForceRefresh()` ALL tabs (line 978)
- `handleForceContentScriptReinjection()` (line 1867)

**Total Injection Points:** 12+

### SOURCES OF OVERLAPPING SCANS

#### Problem 1: Multiple Event Handlers Fire Simultaneously
**Page Load on Active Tab:**
- `chrome.webNavigation.onCompleted` → `triggerIntelligenceScan()` → SCAN 1
- `chrome.tabs.onUpdated` status=complete → `triggerIntelligenceScan()` → SCAN 2 (prevented by tabScanState)
- `chrome.tabs.onUpdated` changeInfo.url → `ensureContentScriptFresh()` → content.js re-injected → SCAN 3
- Content.js initialization → intelligence engine starts → SCAN 4

**Result:** 3-4 scans per page load (tabScanState prevents one duplicate)

#### Problem 2: Content Script Re-Injection Without Cleanup
**Tab Activation:**
- User switches to tab → `chrome.tabs.onActivated` → content.js re-injected
- Old content.js instance NOT cleaned up
- New content.js instance initializes → intelligence engine starts
- **Result:** 2 intelligence engines running simultaneously

**Evidence:** No code to cleanup previous content script before re-injection

#### Problem 3: DOM Changes During Action Execution
**Action Execution Timeline:**
```
t=0ms:     handleExecuteLLMAction() → set actionInProgress=true → send execute_action message
t=50ms:    Content script receives message, starts action execution
t=100ms:   Action clicks button → DOM changes → content script detects mutation
t=150ms:   Content script sends dom_changed message to service worker
t=200ms:   handleDOMChanged() receives message
           BUT: message was sent BEFORE action completed
           Check: actionInProgress === true → skip rescan ✓ PREVENTED
t=300ms:   Action completes → content script sends response
t=350ms:   handleExecuteLLMAction() receives response → set actionInProgress=false
t=2350ms:  Post-action refresh timer fires → ensureContentScriptFresh() → content.js re-injected → SCAN
```

**Result:** Post-action refresh works correctly, BUT...

#### Problem 4: DOM Changes AFTER Action Completes
**Action Execution with Delayed DOM Changes:**
```
t=0ms:     handleExecuteLLMAction() → set actionInProgress=true
t=100ms:   Action clicks button
t=300ms:   Action completes → set actionInProgress=false
t=400ms:   DOM changes from action (e.g., AJAX response) → dom_changed message
t=900ms:   handleDOMChanged() → actionInProgress=false → schedule rescan after 500ms
t=1400ms:  Rescan triggered → SCAN 1
t=2300ms:  Post-action refresh → ensureContentScriptFresh() → SCAN 2
```

**Result:** 2 scans for single action (DOM mutation + post-action refresh)

#### Problem 5: Rapid SPA Navigation
**YouTube Video Autoplay:**
```
t=0s:      User clicks video 1 → history.pushState()
t=0s:      chrome.webNavigation.onHistoryStateUpdated → SCAN 1
t=5s:      Video 1 ends → autoplay to video 2 → history.pushState()
t=5s:      chrome.webNavigation.onHistoryStateUpdated → SCAN 2
t=10s:     Video 2 ends → autoplay to video 3 → history.pushState()
t=10s:     chrome.webNavigation.onHistoryStateUpdated → SCAN 3
```

**Result:** 3 scans in 10 seconds, each registering 200+ action IDs

#### Problem 6: Network Idle False Positives
**Multiple Network Requests:**
```
t=0ms:     Request 1 starts
t=100ms:   Request 2 starts
t=200ms:   Request 1 completes → inflightRequests=1
           handleNetworkActivity() → inflightRequests !== 0 → no rescan ✓
t=300ms:   Request 2 completes → inflightRequests=0
           handleNetworkActivity() → schedule rescan after 1000ms
t=400ms:   Request 3 starts (lazy loading)
t=500ms:   Request 3 completes → inflightRequests=0
           handleNetworkActivity() → schedule rescan after 1000ms
t=1300ms:  First rescan fires → SCAN 1
t=1500ms:  Second rescan fires → SCAN 2
```

**Result:** 2 overlapping scans for same page state

#### Problem 7: Force Refresh All Tabs
**User clicks "Force Refresh" in popup:**
```
handleForceRefresh() → chrome.tabs.query({}) → 20 tabs
For each tab:
    ensureContentScriptFresh() → chrome.scripting.executeScript()
    → 20 simultaneous content.js injections
    → 20 intelligence engines initialize
    → 20 simultaneous scans
```

**Result:** 20 overlapping scans, each registering 100-300 action IDs → 2000-6000 total action IDs in llm_prompt.md

### ROOT CAUSES OF ACTION ID INFLATION

1. **No Scan Deduplication**
   - `tabScanState` only prevents same-URL rescans
   - Does NOT track in-flight scans
   - Multiple triggers can fire before first scan completes

2. **No Content Script Cleanup**
   - Content.js re-injected without cleaning up previous instance
   - Multiple intelligence engines run simultaneously
   - Each engine registers its own action IDs

3. **No Rate Limiting**
   - No debouncing for rapid triggers (SPA navigation, DOM changes, network activity)
   - No queuing for batch operations (force refresh all tabs)

4. **No Coordination Between Triggers**
   - 19 different scan triggers operate independently
   - No central scan scheduler or deduplication layer
   - Multiple timers with different delays (100ms, 500ms, 1s, 2s)

5. **Race Conditions**
   - Action execution flag not checked in all scan paths
   - DOM changes during action window can trigger scans
   - Post-action refresh overlaps with DOM mutation and network idle scans

### CRITICAL BUGS SUMMARY

**RUNTIME ERRORS (will break extension):**
1. `proactivelySendSiteConfig()` called at lines 417, 886 - **NEVER DEFINED**
2. `getCurrentActiveTabId()` called at line 1859 - **NEVER DEFINED**

**LOGIC ERRORS (cause action ID inflation):**
1. Content script re-injection without cleanup → multiple intelligence engines
2. No scan deduplication → overlapping scans
3. `tabScanState` only checks URL, not in-flight status
4. Multiple event handlers fire simultaneously for same event
5. Post-action refresh overlaps with DOM mutation and network idle scans
6. No rate limiting for rapid SPA navigation
7. Force refresh can trigger 20+ simultaneous scans

**CONFIGURATION ERRORS:**
1. Hardcoded timer delays (100ms, 500ms, 1s, 2s) not tuned for real-world page behavior
2. `actionInProgress` flag not checked in all scan trigger paths
3. No coordination between chrome.webNavigation and chrome.tabs event handlers

### RECOMMENDATIONS FOR FIXES

**Immediate Fixes (Critical):**
1. Define `proactivelySendSiteConfig()` or remove calls
2. Define `getCurrentActiveTabId()` or use `findActiveTab()`
3. Add scan deduplication layer:
   ```javascript
   const inFlightScans = new Map(); // tabId → Promise

   async function triggerIntelligenceScan(tabId, url, reason) {
       if (inFlightScans.has(tabId)) {
           console.log(`[SW] Scan already in progress for tab ${tabId}, skipping`);
           return;
       }

       const scanPromise = performScan(tabId, url, reason);
       inFlightScans.set(tabId, scanPromise);

       try {
           await scanPromise;
       } finally {
           inFlightScans.delete(tabId);
       }
   }
   ```

4. Add content script cleanup before re-injection:
   ```javascript
   async function ensureContentScriptFresh(tabId) {
       // Send cleanup message to old content script
       await chrome.tabs.sendMessage(tabId, { type: "cleanup_before_reload" }).catch(() => {});

       // Wait for cleanup
       await new Promise(resolve => setTimeout(resolve, 100));

       // Inject fresh content script
       await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
   }
   ```

**Medium Priority:**
1. Add debouncing for rapid triggers:
   ```javascript
   const scanDebounce = new Map(); // tabId → timeoutId

   function debouncedScan(tabId, url, reason, delay = 1000) {
       if (scanDebounce.has(tabId)) {
           clearTimeout(scanDebounce.get(tabId));
       }

       const timeoutId = setTimeout(() => {
           triggerIntelligenceScan(tabId, url, reason);
           scanDebounce.delete(tabId);
       }, delay);

       scanDebounce.set(tabId, timeoutId);
   }
   ```

2. Consolidate event handlers to prevent duplicate triggers:
   - Use ONLY `chrome.webNavigation.onCompleted` for page loads
   - Remove `chrome.tabs.onUpdated` status=complete scan trigger
   - Keep `chrome.tabs.onUpdated` URL/title change for content script refresh

3. Add `actionInProgress` check to ALL scan trigger paths:
   - `chrome.tabs.onActivated` content script re-injection
   - `chrome.tabs.onUpdated` content script re-injection
   - `handleDOMCommand()` content script re-injection

**Low Priority (Optimization):**
1. Add rate limiting for batch operations (force refresh)
2. Add configurable timer delays (replace hardcoded values)
3. Add telemetry to track scan frequency and overlaps
4. Consolidate duplicate code (clearTabCache, ensureContentScriptFresh, sendTabsInfo calls)

---

## END OF ANALYSIS

**Total Functions Analyzed:** 40+
**Total Event Listeners:** 11
**Total Scan Triggers:** 19
**Total Content Script Injection Points:** 12+
**Critical Bugs Found:** 2 undefined functions + 7 logic errors
**Estimated Action ID Inflation Factor:** 3-10x (multiple overlapping scans per user action)
