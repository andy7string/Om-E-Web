# Facebook Action ID Sync Problem

## The Issue

DOM action IDs (`data-ome-action-id`) get out of sync with `text.md` on Facebook.

**Example:**
- DOM shows: Message input has `a_id_106`
- text.md shows: `a_id_106` = "New message" button (wrong element)

## Root Cause Analysis

### What's Happening

1. **Initial scan** runs when page loads → IDs assigned → `text.md` written correctly
2. **DOM changes** (chat window opens, new elements appear)
3. **Rescan triggers** → `extractSemanticTextWithIds()` runs → DOM gets NEW IDs (starting from `a_id_0` again)
4. **BUT** the new intelligence data never reaches the server → `text.md` not updated

### Why Server Doesn't Receive Updates

Two paths exist for sending intelligence to server:

| Path | Message Type | Handler | Inactive Tab Filter? |
|------|-------------|---------|---------------------|
| `executeScanWithSettle` | `scan_complete` | `handleScanComplete` | NO |
| `queueIntelligenceUpdate` | `intelligence_update` | `handleIntelligenceUpdate` | YES (line 2423-2441) |

The `intelligence_update` path has an **inactive tab filter** that drops updates if the tab isn't considered "active":

```javascript
// sw.js:2423-2441
const activeTab = await findActiveTab();
if (!activeTab || activeTab.id !== sourceTabId) {
    console.log('[SW] ⏸️ Skipping intelligence update from inactive tab');
    sendResponse({ ok: true, skipped: true, reason: 'inactive_tab' });
    return;  // UPDATE DROPPED!
}
```

### The Problem Chain

1. User clicks something on Facebook
2. `schedulePostActionIntelligenceRefresh()` calls `request_scan`
3. SW receives `request_scan` and sends `start_scan` to content script
4. Content script runs `executeScanWithSettle()` → sends `scan_complete` → **this works**
5. BUT also various triggers call `queueIntelligenceUpdate()` which:
   - Calls `prepareIntelligenceData()`
   - Which calls `extractSemanticTextWithIds()` → **reassigns ALL DOM IDs**
   - Sends `intelligence_update` message
   - **Gets filtered out** by inactive tab check (possibly due to devtools focus)
6. DOM now has new IDs but `text.md` has old IDs

### Why Filter Might Be Failing

`findActiveTab()` uses `chrome.tabs.query({ active: true, currentWindow: true })`. This can fail when:
- DevTools is focused (might change what Chrome considers "active")
- Multiple windows open
- Race conditions during tab switching

## Evidence

### SW Console Shows
- Lots of `active_tab_info` messages
- NO `🔍 ACTIVE TAB CHECK` logs (added for debugging)
- This means `handleIntelligenceUpdate` is NEVER being called

### This Means
The content script isn't even sending `intelligence_update` messages, OR they're being lost before reaching the handler.

## Files Involved

- `web_extension/content.js`:
  - `extractSemanticTextWithIds()` - clears and reassigns ALL DOM IDs
  - `prepareIntelligenceData()` - calls extractSemanticTextWithIds on EVERY call
  - `queueIntelligenceUpdate()` - queues updates using prepareIntelligenceData
  - `schedulePostActionIntelligenceRefresh()` - triggers post-action scans

- `web_extension/sw.js`:
  - `handleIntelligenceUpdate()` - has inactive tab filter (line 2423-2441)
  - `handleScanComplete()` - NO filter, forwards to server
  - `findActiveTab()` - determines which tab is "active"

- `om_e_web_ws/ws_server.py`:
  - Receives `intelligence_update` and writes `text.md`
  - `ELEMENT_REGISTRY = {}` gets cleared on each update

## Potential Fixes

### Option 1: Remove Inactive Tab Filter
Remove or disable the filter in `handleIntelligenceUpdate`. Risk: wrong tab could overwrite text.md.

### Option 2: Make Filter URL-Based
Instead of tab ID matching, compare URLs. If same URL, allow the update.

### Option 3: Ensure scan_complete Path Always Used
Make sure post-action scans always go through `scan_complete` path which has no filter.

### Option 4: Debug Why intelligence_update Not Sent
Add logging to content script to see if `queueIntelligenceUpdate` is even being called and if messages are being sent.

## Debugging Steps

1. Add logging to content script `queueIntelligenceUpdate` and `sendIntelligenceUpdateToServiceWorker`
2. Check if messages are being sent from content script
3. Check if SW is receiving them (add logging at message listener entry point)
4. Check if filter is dropping them

## Test Commands

Find message inputs in page console:
```javascript
document.querySelectorAll('[aria-label*="Message"], [aria-label*="message"]').forEach(el => {
    console.log('Message input:', {
        actionId: el.getAttribute('data-ome-action-id'),
        ariaLabel: el.getAttribute('aria-label'),
        element: el
    });
});
```

Force a manual scan:
```javascript
chrome.runtime.sendMessage({ type: 'request_scan', url: window.location.href, trigger: 'manual_test' });
```

Check all action IDs:
```javascript
document.querySelectorAll('[data-ome-action-id]').forEach(el => {
    const id = el.getAttribute('data-ome-action-id');
    const text = (el.textContent || el.placeholder || el.getAttribute('aria-label') || '').substring(0, 40);
    console.log(`${id}: ${el.tagName} - "${text}"`);
});
```
