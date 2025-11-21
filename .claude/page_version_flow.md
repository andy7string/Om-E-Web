# Page Version & Scan Routing Flow

## Overview
All scan requests route through the service worker (sw.js) which manages pageVersion. The pageVersion only increments on actual URL changes, not on rescans of the same page.

## Action ID Format
```
a_id_{pageVersion}_{counter}
```
Example: `a_id_3_0`, `a_id_3_1`, `a_id_3_42`

## llm_prompt.md Header Format
```markdown
# ({pageVersion}) {Page Title}

**URL:** {url}
```
Example: `# (3) cursor - YouTube`

---

## Data Flow

### 1. Scan Trigger Sources (all route to SW)

**content.js** sends `request_scan` messages to SW for:
- `content_page_load_fallback` (line 1486)
- `content_manual_command` (line 2458)
- `content_rescan_url_change` (line 10139 via queueFullRescan)
- `content_rescan_hash_change` (line 10158 via queueFullRescan)
- `content_rescan_popstate` (line 10168 via queueFullRescan)

**sw.js** triggers scans directly for:
- `url_change` (webNavigation.onCompleted, line 1825)
- `spa_navigation` (webNavigation.onHistoryStateUpdated, line 1835)
- `post_action` (after action execution, line 1518)

### 2. SW requestScan() - Central Orchestrator (sw.js line 320+)

```javascript
async function requestScan(tabId, url, trigger) {
    // 1. Log with request counter for debugging
    const requestNum = ++scanRequestCounter;
    console.log(`[SW] 🔍 SCAN REQUEST #${requestNum} | trigger="${trigger}"`);

    // 2. Skip chrome:// URLs
    if (url.startsWith("chrome://")) return;

    // 3. Get/create tab state
    const state = tabState.get(tabId) || { pageVersion: 0, scanInProgress: false };

    // 4. DEDUPE: Skip if scan in progress
    if (state.scanInProgress) return;

    // 5. DEDUPE: Skip if same URL already scanned (unless forced)
    const forcedTriggers = ['post_action', 'significant_dom_change'];
    if (state.lastUrl === url && !forcedTriggers.includes(trigger)) return;

    // 6. PAGE VERSION LOGIC ⭐
    const isNewPage = state.lastUrl !== url;
    const pageVersion = isNewPage ? state.pageVersion + 1 : (state.pageVersion || 1);
    // Only increments on URL change, stays same for rescans

    // 7. Update state
    tabState.set(tabId, { pageVersion, scanInProgress: true, lastUrl: url });

    // 8. Send to content script
    chrome.tabs.sendMessage(tabId, {
        type: 'execute_scan',
        pageVersion,
        url,
        trigger
    });
}
```

### 3. Content Script Execution (content.js line 86+)

```javascript
async function executeScanWithSettle(pageVersion, url, trigger) {
    // 1. Set scan lock
    scanInProgress = true;
    currentPageVersion = pageVersion;  // ⭐ Stored for action ID generation

    // 2. Wait for DOM to settle (200ms quiet window)
    await waitForDOMSettle({ maxWait: 5000, quietWindow: 200 });

    // 3. Run scan
    await intelligenceEngine.scanAndRegisterPageElements();

    // 4. Send results to SW
    chrome.runtime.sendMessage({
        type: 'scan_complete',
        pageVersion: currentPageVersion,  // ⭐ Passed back
        intelligenceData: intelligenceEngine.prepareIntelligenceData()
    });
}
```

### 4. Action ID Generation (content.js lines 6224, 7266)

```javascript
// When registering elements:
const idCandidate = `a_id_${currentPageVersion}_${this.elementCounter++}`;
```

### 5. SW Forwards to Server (sw.js line 415+)

```javascript
function handleScanComplete(message, sender) {
    // Include pageVersion in data sent to server
    const dataWithPageVersion = {
        ...message.intelligenceData,
        pageVersion: message.pageVersion  // ⭐ Added to payload
    };
    ws.send(JSON.stringify({
        type: 'intelligence_update',
        data: dataWithPageVersion
    }));
}
```

### 6. Server Stores pageVersion (ws_server.py lines 376, 391)

```python
# In save_intelligence_to_page_jsonl():
rec["pageVersion"] = intelligence_data.get("pageVersion")

# Meta record includes pageVersion
{
    "type": "meta",
    "pageVersion": 3,
    ...
}
```

### 7. llm_prompt.md Generation (ws_server.py lines 1093, 1131, 1365)

```python
# Extract pageVersion from meta record
if page_version is None and rec.get("pageVersion") is not None:
    page_version = rec.get("pageVersion")

# Display in header
parts.append(f"# ({page_version}) {title or 'Page'}")
```

---

## Key Files & Line Numbers

| File | Lines | Purpose |
|------|-------|---------|
| `sw.js` | 320-400 | `requestScan()` - central scan orchestrator |
| `sw.js` | 357-366 | pageVersion logic (only increment on URL change) |
| `sw.js` | 415-425 | `handleScanComplete()` - forwards to server with pageVersion |
| `content.js` | 86-145 | `executeScanWithSettle()` - executes scan |
| `content.js` | 97 | `currentPageVersion` storage |
| `content.js` | 6224, 7266 | Action ID generation with pageVersion |
| `content.js` | 5213-5220 | `queueFullRescan()` - routes to SW |
| `ws_server.py` | 376, 391 | Stores pageVersion in meta record |
| `ws_server.py` | 1131-1132 | Extracts pageVersion for prompt |
| `ws_server.py` | 1365 | Displays pageVersion in header |

---

## pageVersion Behaviour

| Event | pageVersion | Why |
|-------|-------------|-----|
| First page load | 1 | New URL |
| Navigate to new page | +1 | URL changed |
| SPA navigation (URL change) | +1 | URL changed |
| Refresh same page | Same | URL unchanged |
| DOM mutation rescan | Same | URL unchanged |
| Post-action rescan | Same | URL unchanged |
| Tab visibility change | Same | URL unchanged |

---

## Debugging

SW console shows numbered scan requests:
```
[SW] 🔍 SCAN REQUEST #1 | trigger="url_change" | tab=123 | url=...
[SW] 📄 NEW PAGE: pageVersion=1
[SW] 🚀 Starting scan: pageVersion=1, trigger=url_change

[SW] 🔍 SCAN REQUEST #2 | trigger="content_rescan_url_change" | tab=123 | url=...
[SW] 🔄 RESCAN: pageVersion=1 (unchanged)
```
