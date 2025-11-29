# Iframe Element Scanning - Technical Documentation

## Goal

Extract interactive elements (inputs, buttons, selects) from **cross-origin iframes** (e.g., CyberSource payment forms) and include them in `text.md` with sequential action IDs that match the DOM attributes, enabling LLM-driven automation of secure payment forms.

## The Problem

Cross-origin iframes (like CyberSource payment forms) are security-sandboxed:
- Main frame JavaScript **cannot access** iframe DOM directly
- `document.querySelector` from main frame **cannot reach** into iframe
- Payment form inputs (Card Number, CVN, Expiry) are **invisible** to main frame scanning

## Solution Architecture

Use Chrome Extension's `all_frames: true` manifest option to inject content script into BOTH main frame AND iframes. Each frame runs independently and communicates via Service Worker.

### Manifest Configuration
```json
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": ["content.js"],
  "all_frames": true,  // KEY: Inject into iframes too
  "run_at": "document_idle"
}]
```

## Current Implementation Flow

### Step 1: Main Frame Scans
**File:** `content.js` (lines 160-290)

1. Main frame detects it's NOT in iframe: `window.top === window.self`
2. Scans DOM, assigns IDs `a_id_0` through `a_id_N`
3. Sets `data-ome-action-id` attribute on each element
4. Counts cross-origin iframes: `document.querySelectorAll('iframe')`
5. Sends `scan_complete` to SW with:
   - `intelligenceData` (elements, text, etc.)
   - `expectedIframeCount` (how many iframes SW should wait for)

### Step 2: Iframes Auto-Scan
**File:** `content.js` (lines 27-149)

1. Iframe detects it IS in iframe: `window.top !== window.self`
2. Sets up message listener for ID updates
3. Auto-scans DOM when ready
4. Assigns LOCAL IDs: `iframe_0`, `iframe_1`, etc.
5. Sets `data-ome-action-id` with local ID
6. Sends `iframe_intelligence` to SW with elements

### Step 3: SW Coordinates
**File:** `sw.js` (lines 631-714, 1932-2063)

1. Receives `scan_complete` from main frame
2. If `expectedIframeCount > 0`, stores pending data and waits
3. Receives `iframe_intelligence` from each iframe
4. Caches iframe elements with `frameId`
5. When all iframes reported:
   - Calls `mergeIframeIntelligence()` which assigns FINAL IDs (`a_id_12`, `a_id_13`, etc.)
   - Sends `update_iframe_ids` message back to each iframe with mapping
   - Sends final data to Python server

### Step 4: Iframe Updates DOM
**File:** `content.js` (lines 49-66)

1. Receives `update_iframe_ids` message with mapping: `{ "iframe_0": "a_id_12", ... }`
2. Finds elements by local ID: `[data-ome-action-id="iframe_0"]`
3. Updates to final ID: `data-ome-action-id="a_id_12"`

## Where It's Failing

### Failure Point 1: Iframe Count = 0 at Scan Time
**Location:** `content.js` lines 231-266

**Problem:** CyberSource iframes are created DYNAMICALLY by JavaScript AFTER page load. When main frame scans:
```javascript
const allIframes = document.querySelectorAll('iframe');
```
It finds 0 iframes because CyberSource hasn't created them yet.

**Result:** `expectedIframeCount: 0` → SW doesn't wait → sends data immediately without iframe elements.

**Log Evidence:**
```
[SW] 🖼️ Expecting 0 iframe reports for tab 1138026890
[SW] 📤 Intelligence sent to server (10 elements)
```
Later, iframes report but data already sent.

### Failure Point 2: Timing Race Condition
**Problem:** Even when iframes ARE detected:
1. Main frame scan completes fast
2. SW starts waiting for iframes
3. Iframe content scripts may not be injected/ready yet
4. SW tries to send `update_iframe_ids` but frame doesn't exist

**Log Evidence:**
```
[SW] 🖼️ Frame 298 skipped: Could not establish connection. Receiving end does not exist.
```

### Failure Point 3: Multiple Rescans Overwrite Data
**Problem:** Page does multiple rescans (url_change, content_rescan_url_change):
```
[SW] 🔍 SCAN REQUEST #2 @ ... trigger="page_refresh"
[SW] 🖼️ Expecting 0 iframe reports
[SW] 📤 Intelligence sent to server (10 elements)
```
Each rescan clears iframe cache and sends without waiting.

### Failure Point 4: ID Mapping Never Sent
**Problem:** When `frameId` is undefined or iframe already disconnected, the ID mapping message fails silently:
```javascript
if (frameId && Object.keys(idMapping).length > 0) {
    // Only sends if frameId exists
}
```

**Result:** Iframe DOM still has `iframe_0` but text.md shows `a_id_12`. Mismatch.

## What text.md Shows vs What DOM Has

### text.md (what LLM sees):
```
<Input id="a_id_12">Card number</Input>
<Input id="a_id_13">CVN</Input>
```

### Iframe DOM (actual):
```html
<input data-ome-action-id="iframe_0" aria-label="Card number">
<input data-ome-action-id="iframe_1" aria-label="CVN">
```

**Or even worse - no attribute at all if iframe script never ran.**

### Action Execution Fails:
```
[Content] ❌ Actionable element not found: a_id_12
[Content] 🔍 Available elements: ['a_id_null_28', 'a_id_null_29', ...]
```

## Root Causes Summary

| Issue | Cause | Location |
|-------|-------|----------|
| Iframes not counted | Dynamic iframe creation after scan | content.js:231-266 |
| ID mismatch | Final IDs assigned by SW, DOM has local IDs | sw.js:2025-2029 |
| Update message fails | frameId undefined or iframe disconnected | sw.js:691-703 |
| Multiple scans | Each scan clears cache and restarts | sw.js:648-649 |
| Content script not ready | Timing between injection and message | Chrome limitation |

## Potential Solutions

### Solution A: MutationObserver for Dynamic Iframes
Watch for iframe creation and trigger rescan when new iframes appear:
```javascript
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.tagName === 'IFRAME') {
                // New iframe added - request rescan with iframe wait
            }
        }
    }
});
```

### Solution B: Iframe Announces Itself
Instead of main frame counting iframes, have each iframe announce when ready:
```javascript
// In iframe
chrome.runtime.sendMessage({ type: 'iframe_ready', url: location.href });
```
SW tracks ready iframes and processes when stable.

### Solution C: Debounced Final Send
Don't send immediately. Collect data, wait for "quiet period" with no new iframe reports, then finalize.

### Solution D: Single Source of Truth
Have SW assign ALL IDs (main frame + iframe) centrally, then broadcast back to ALL frames to update their DOM.

## Files Involved

| File | Purpose |
|------|---------|
| `web_extension/manifest.json` | `all_frames: true` enables iframe injection |
| `web_extension/content.js` | Iframe detection (line 27-149), main scan (160-290), iframe counting (231-266) |
| `web_extension/sw.js` | handleScanComplete (631-666), handleIframeIntelligence (1932-1989), mergeIframeIntelligence (1999-2063), sendFinalIntelligence (668-714) |
| `om_e_web_ws/ws_server.py` | Writes "Secure Iframe Elements" section to text.md |

## Test Page

**URL:** https://account.ezyreg.sa.gov.au/account/payment-method.htm?payment-type=CREDIT&trolleySource=true

**Expected iframe elements:**
- Card number input
- Expiry month
- Expiry year
- CVN (Card security code)

**CyberSource iframe origin:** `https://flex.cybersource.com`
