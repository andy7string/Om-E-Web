# Selector-Based Lookup System Implementation Plan

## Executive Summary

**THE BUG:** Content script clears the actionableElements Map at the START of each scan but never
repopulates it after extraction completes. When execute_action arrives, the Map is empty, causing
"Actionable element not found" errors.

**ROOT CAUSE:** `extractSemanticTextWithIds()` (content.js:6233) clears the Map (line 6255),
generates action IDs, writes DOM attributes, builds an actionables array, and returns it to the
server. But the Map is NEVER repopulated after this function returns. The execute_action listener
(line 11329) tries to look up elements in the empty Map and fails.

**IMMEDIATE FIX:** After `extractSemanticTextWithIds()` returns, loop through the actionables
array and repopulate the Map by querying DOM via data-ome-action-id attributes. This is a ~10 line
fix that unblocks LLM actions immediately.

**LONG-TERM SOLUTION:** Replace the volatile in-memory element registry with a persistent
selector+text based lookup system. This unifies action resolution with the existing capability
pipeline pattern, eliminating state management issues caused by page re-renders and content script
reinjection.

---

## Part 1: Current Architecture Analysis

### 1.1 Current ID System Location

**Content Script (`web_extension/content.js`):**
```
Line 6233: IntelligenceEngine.prototype.extractSemanticTextWithIds() - MAIN TEXT GENERATION
Lines 6237-6258: DOM cleanup + actionableElements Map clearing
Lines 6569-6583: Action ID assignment + DOM attribute writing (data-ome-action-id)
Lines 6664-6668: Return {text, actionables} structure
Line 7094: semanticPageData sent in intelligence update
Lines 11329-11390: execute_action message listener
Lines 11362-11373: intelligenceEngine.executeAction() call
```

**CRITICAL FINDING:**
The IntelligenceEngine does NOT maintain a persistent actionableElements Map for execution.
The Map is **cleared on every scan** (line 6255) before extraction. The Map is only populated
**temporarily during text generation**, NOT for later execution lookups.

**Service Worker (`web_extension/sw.js`):**
```
Lines 2620-2632: execute_action message forwarding to content script
Lines 2638-2641: Post-action scan trigger after 1s delay
```

**Server (`om_e_web_ws/ws_server.py`):**
```
Lines 4076-4096: semanticPageData extraction + ELEMENT_REGISTRY population
Lines 4084-4095: ELEMENT_REGISTRY populated from semanticPageData.actionables
Line 119-126: get_element_info() - Returns element metadata for action type resolution
Lines 2423-2502: write_text_md() - Writes text.md from semanticPageData.text
Line 6060: set_element_resolver(get_element_info) - Wires up dispatcher
```

**Dispatcher (`om_e_web_ws/llm/dispatcher.py`):**
```
Lines 30-36: _element_resolver - callback to resolve action IDs from ELEMENT_REGISTRY
Lines 39-76: resolve_action_type() - auto-resolves action type from registry
```

### 1.2 ACTUAL Flow (Current System)

**Scan Phase:**
```
1. executeScanWithSettle() triggered (content.js:224)
2. extractSemanticTextWithIds() called (content.js:6233)
   - Clears actionableElements Map (line 6255)
   - Walks DOM, assigns a_id_X to interactive elements (line 6569)
   - Writes data-ome-action-id attributes to DOM (line 6572)
   - Builds actionables array: [{id, type, label, tag, href, selector}, ...]
   - Returns {text: "...", actionables: [...]}
3. Intelligence update sent to server via chrome.runtime.sendMessage
   - Contains: semanticPageData: {text, actionables}
4. Server receives intelligence_update (ws_server.py:4042)
5. Server populates ELEMENT_REGISTRY from actionables (ws_server.py:4084-4095)
6. Server calls write_text_md() (ws_server.py:4126)
   - Writes text.md with inline action IDs
```

**Execution Phase (BROKEN):**
```
1. LLM reads text.md, returns {"act": "a_id_X"}
2. Server looks up a_id_X in ELEMENT_REGISTRY → gets {type, tag, label, href}
3. Dispatcher auto-resolves action type via resolve_action_type() (dispatcher.py:39)
4. Server sends execute_action to sw.js (via WebSocket)
5. sw.js forwards to content.js via chrome.tabs.sendMessage (sw.js:2622)
6. content.js execute_action listener receives message (content.js:11329)
7. content.js calls intelligenceEngine.getActionableElement(actionId) (line 11362)
8. ❌ FAILURE: actionableElements Map is EMPTY
   - Map was cleared at start of last scan (line 6255)
   - Map is never repopulated for execution
   - DOM attributes exist but are NOT used for lookup
9. Returns error: "Actionable element not found"
```

### 1.3 ROOT CAUSE ANALYSIS

**The Bug:** Content script does NOT persist the actionableElements Map after scan.

**Why it fails:**
1. `extractSemanticTextWithIds()` clears the Map at the START (line 6255)
2. Map is temporarily populated during tree walk (implicit, not explicitly shown)
3. Function returns `{text, actionables}` array (line 6664-6668)
4. The actionables **array** is sent to server, but the Map is NOT repopulated
5. When execute_action arrives, `intelligenceEngine.getActionableElement()` returns null

**What SHOULD happen:**
- After extractSemanticTextWithIds(), the Map should be repopulated from the actionables array
- OR: executeAction should use DOM attributes (data-ome-action-id) for lookup
- OR: Server should send selector hints with each action (NEW APPROACH)

**Additional Failure Points:**
- Gmail re-renders → DOM attributes lost (even if they exist)
- Content script reinjection → intelligenceEngine instance wiped
- Page navigation → All state cleared
- Multiple scans → actionableElements cleared each time

### 1.4 Current Capability Pipeline (Working Model)

**Location:** `web_extension/content.js` lines 10947-11207

```javascript
async function capabilityPipelineExecutor(capabilityAction, params) {
    // 1. Get capability config from site config
    const capability = finalConfig.capabilities[capabilityKey];

    // 2. Get selectors
    const capabilitySelectors = capability.selectors || [];

    // 3. Try each selector until match
    for (const selector of capabilitySelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            targetElement = elements[0];
            break;
        }
    }

    // 4. Execute based on element type
    if (isInput && params.value !== undefined) {
        // setValue logic
    } else {
        targetElement.click();
    }
}
```

**Why It Works:**
- No state dependency - finds element fresh each time
- Selectors defined in config - persistent
- Element type inferred from DOM at execution time

---

## Part 1B: IMMEDIATE FIX vs LONG-TERM SOLUTION

### Option A: Quick Fix (Repopulate Map After Scan)

**Change:** content.js - After extractSemanticTextWithIds() returns, repopulate actionableElements Map

**Location:** content.js after line 7094 (where semanticPageData is set)

```javascript
// After getting semantic data
const semanticData = intelligenceEngine.extractSemanticTextWithIds();

// 🔧 FIX: Repopulate actionableElements Map from actionables array
intelligenceEngine.actionableElements.clear();
for (const actionable of semanticData.actionables) {
    // Store DOM element reference by querying via data-ome-action-id
    const element = document.querySelector(`[data-ome-action-id="${actionable.id}"]`);
    if (element) {
        intelligenceEngine.actionableElements.set(actionable.id, {
            element: element,
            ...actionable  // {type, label, tag, href, selector}
        });
    }
}
console.log(`[Content] ✅ Repopulated actionableElements Map: ${intelligenceEngine.actionableElements.size} elements`);
```

**Pros:**
- Minimal code change (~10 lines)
- Fixes immediate issue
- Uses existing data structures
- No server changes needed

**Cons:**
- Still vulnerable to DOM re-renders (data-ome-action-id attributes lost)
- Still vulnerable to content script reinjection
- Doesn't solve fundamental state management issue

### Option B: Long-Term Solution (Selector-Based Lookup)

This is the full implementation described in Part 2 below.

**Pros:**
- Stateless - no registry dependency
- Survives page re-renders
- Survives content script reinjection
- Matches capability pipeline pattern
- Future-proof architecture

**Cons:**
- Requires server changes (text.json generation)
- Requires message format changes (hints injection)
- More complex rollout (5 phases)
- ~500 lines of code changes across 3 files

### Recommendation: Implement BOTH

1. **NOW:** Deploy Option A (quick fix) to unblock LLM actions immediately
2. **NEXT:** Implement Option B incrementally with feature flag
3. **THEN:** Remove Option A code once Option B is proven stable

---

## Part 2: Proposed Architecture (Long-Term)

### 2.1 New File Structure

```
om_e_web_ws/@site_structures/
├── text.md          # LLM-facing document (unchanged format)
├── text.json        # NEW: Selector resolution data
├── content.jsonl    # Existing content data
└── page.jsonl       # Existing page structure
```

### 2.2 text.json Schema

**DATA ALREADY AVAILABLE:** The actionables array sent from content.js contains:
```javascript
{
  id: "a_id_X",
  type: "Link|Button|Input|Select|Checkbox|Radio|Switch|Slider",
  label: "Display text from aria-label or innerText",
  tag: "a|button|input|textarea|select|div",
  href: "http://..." or null,
  selector: "CSS selector" // From generateSimpleSelector()
}
```

**IMPORTANT:** The current actionables array already contains a `selector` field generated by
`IntelligenceEngine.prototype.generateSimpleSelector()` (content.js:6673-6725). This function
generates selectors in this priority order:
1. `#element-id` (if element has ID)
2. `[data-ome-action-id="a_id_X"]` (the ID we just assigned)
3. Tag + class combination
4. Tag + aria-label
5. Tag + href (for links)

So text.json does NOT need to generate NEW selectors - it can use the existing selector field
from the actionables array. However, we should enhance it with multiple fallback selectors.

```json
{
  "metadata": {
    "url": "https://mail.google.com/mail/u/0/#inbox",
    "timestamp": "2025-12-10T16:37:14Z",
    "element_count": 152
  },
  "elements": {
    "a_id_0": {
      "type": "link",
      "label": "Skip to content",
      "text": "Skip to content",
      "tag": "a",
      "href": "#",
      "selectors": [
        "[data-ome-action-id='a_id_0']",
        "a[href='#']",
        "a:contains('Skip to content')"
      ]
    },
    "a_id_3": {
      "type": "link",
      "label": "Gmail",
      "text": "Gmail",
      "tag": "a",
      "href": "https://mail.google.com/...",
      "selectors": [
        "[data-ome-action-id='a_id_3']",
        "a[data-tab-id][aria-selected]",
        "a[href*='mail.google.com']"
      ]
    },
    "a_id_4": {
      "type": "input",
      "label": "Search mail",
      "text": "Search mail",
      "tag": "input",
      "href": null,
      "selectors": [
        "[data-ome-action-id='a_id_4']",
        "input[name='q']",
        "input[aria-label='Search mail']",
        "input[placeholder*='Search']"
      ]
    },
    "a_id_15": {
      "type": "button",
      "label": "Compose",
      "text": "Compose",
      "tag": "button",
      "href": null,
      "selectors": [
        "[data-ome-action-id='a_id_15']",
        "button[aria-label='Compose']",
        "div[role='button']:contains('Compose')"
      ]
    }
  }
}
```

### 2.3 New Resolution Flow

```
1. Scan runs → Elements analyzed
2. text.md generated (unchanged format, IDs remain)
3. text.json generated (selector + text for each ID)
4. LLM returns {"act": "a_id_X", "value": "...", "submit": true}
5. Server looks up a_id_X in text.json → gets {selectors, text, type}
6. Server sends to extension: {actionId, hints: {selectors, text, type}, params}
7. Content script resolves via unified pipeline:
   - Try selectors in order
   - Filter by text match if multiple results
   - Execute based on type + params
```

### 2.4 Unified Resolution Function

**New function in content.js:**

```javascript
/**
 * Unified element resolver - used by both actions and capabilities
 *
 * @param {Object} hints - Resolution hints
 * @param {string[]} hints.selectors - CSS selectors to try
 * @param {string} hints.text - Text content to match
 * @param {string} hints.type - Element type (link, button, input)
 * @returns {HTMLElement|null} - Resolved element or null
 */
function resolveElement(hints) {
    const { selectors = [], text = '', type = '' } = hints;

    // Try each selector
    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);

            if (elements.length === 0) continue;

            // Single match - use it
            if (elements.length === 1) {
                return elements[0];
            }

            // Multiple matches - filter by text
            if (text) {
                const match = Array.from(elements).find(el =>
                    el.innerText?.trim().includes(text) ||
                    el.textContent?.trim().includes(text) ||
                    el.getAttribute('aria-label')?.includes(text)
                );
                if (match) return match;
            }

            // Fallback to first match
            return elements[0];

        } catch (e) {
            console.warn(`[Content] Selector failed: ${selector}`, e);
        }
    }

    // Last resort: text-only search
    if (text) {
        const allInteractive = document.querySelectorAll(
            'a, button, input, textarea, [role="button"], [role="link"], [contenteditable="true"]'
        );
        return Array.from(allInteractive).find(el =>
            el.innerText?.trim() === text ||
            el.getAttribute('aria-label') === text
        );
    }

    return null;
}
```

### 2.5 Site Config Separation

**Capabilities** (site_configs/*.json) remain unchanged:
- Pre-defined selectors for known site features
- Used for: RetrieveTranscript, TogglePlayPause, Subscribe, etc.
- Resolution via `capabilityPipelineExecutor()`

**Actions** (text.json) are dynamic:
- Generated per-scan from actual page content
- Used for: clicking links, buttons, filling inputs
- Resolution via new `resolveElement()` function

**Both share:**
- Selector-based lookup pattern
- Element type inference from DOM
- Same execution logic (click, setValue, etc.)

```
┌─────────────────────────────────────────────────────────────┐
│                    Execution Request                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   Is it a Capability Action?  │
              │   (RetrieveTranscript, etc.)  │
              └───────────────────────────────┘
                     │              │
                    YES             NO
                     │              │
                     ▼              ▼
         ┌──────────────────┐  ┌──────────────────┐
         │ site_configs/    │  │ text.json        │
         │ *.json           │  │ (dynamic)        │
         │                  │  │                  │
         │ Get selectors    │  │ Get selectors    │
         │ from capability  │  │ from action ID   │
         └──────────────────┘  └──────────────────┘
                     │              │
                     └──────┬───────┘
                            ▼
              ┌───────────────────────────────┐
              │    resolveElement(hints)      │
              │    - Try selectors            │
              │    - Filter by text           │
              │    - Return element           │
              └───────────────────────────────┘
                            │
                            ▼
              ┌───────────────────────────────┐
              │    executeOnElement(el,       │
              │      type, params)            │
              │    - click / setValue /       │
              │      navigate / toggle        │
              └───────────────────────────────┘
```

---

## Part 3: Code Removal Plan

### 3.1 Content Script Removals (`content.js`)

**Remove entirely:**
```javascript
// DOM attribute writing (lines ~6237-6250)
const oldMarkers = document.querySelectorAll('[data-ome-action-id]');
el.setAttribute('data-ome-action-id', ...);
el.removeAttribute('data-ome-action-id');

// Registry-based execution (lines ~3095-3114)
if (command === "executeAction") {
    const result = intelligenceEngine?.executeAction(actionId, action, params);
}

// IntelligenceEngine.actionableElements management
// IntelligenceEngine.executeAction method
// ELEMENT_REGISTRY global
```

**Keep but modify:**
```javascript
// IntelligenceEngine - keep for scanning, remove execution logic
// capabilityPipelineExecutor - refactor to use shared resolveElement()
```

### 3.2 Server Removals (`ws_server.py`)

**Remove:**
```python
# _element_resolver callback system
# ELEMENT_REGISTRY global references
# resolve_action_type() that depends on registry
```

**Add:**
```python
# text.json generation alongside text.md
# text.json lookup for action hints
# Hint injection into action commands
```

### 3.3 Dispatcher Removals (`dispatcher.py`)

**Remove:**
```python
# _element_resolver (lines 30-36)
# set_element_resolver() (lines 33-36)
# resolve_action_type() registry dependency (lines 39-76)
```

**Modify:**
```python
# resolve_action_type() - use hints from text.json instead
```

---

## Part 4: Implementation Plan (Incremental)

### Phase 1: Foundation (Non-Breaking)

**Step 1.1: Add text.json generation**
- Location: `ws_server.py` after line 4095 (after ELEMENT_REGISTRY population)
- Add function `generate_text_json(actionables, page_url)`
- Input: actionables array from semanticPageData (already has id, type, label, tag, href, selector)
- Process: Transform array into text.json format with enhanced selectors
- Call after ELEMENT_REGISTRY update (line 4096)
- Output: `@site_structures/text.json`
- Test: Verify text.json created with correct schema after scan

```python
def generate_text_json(actionables, page_url):
    """Generate text.json from actionables array."""
    text_json = {
        "metadata": {
            "url": page_url,
            "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "element_count": len(actionables)
        },
        "elements": {}
    }

    for actionable in actionables:
        action_id = actionable.get("id")
        if not action_id:
            continue

        # Build selector array (primary selector + fallbacks)
        selectors = []

        # Always include data-ome-action-id as first fallback
        selectors.append(f"[data-ome-action-id='{action_id}']")

        # Add the selector from content.js if available
        if actionable.get("selector"):
            selectors.append(actionable["selector"])

        # Add text-based selector as last resort
        label = actionable.get("label", "")
        if label:
            tag = actionable.get("tag", "")
            if tag == "a":
                selectors.append(f"a:contains('{label}')")
            elif tag == "button":
                selectors.append(f"button:contains('{label}')")

        text_json["elements"][action_id] = {
            "type": actionable.get("type"),
            "label": label,
            "text": label,  # Duplicate for compatibility
            "tag": actionable.get("tag"),
            "href": actionable.get("href"),
            "selectors": selectors
        }

    # Write to file
    output_path = os.path.join("@site_structures", "text.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(text_json, f, indent=2)

    print(f"✅ text.json generated: {len(text_json['elements'])} elements")
    return output_path
```

**Step 1.2: Add resolveElement() function**
- Location: `content.js`
- Add new function (doesn't replace anything yet)
- Test: Console test with manual hints

**Step 1.3: Add text.json loader in server**
- Location: `ws_server.py`
- Add function `load_text_json() -> dict`
- Test: Verify JSON loads correctly

### Phase 2: Parallel Path (Feature Flag)

**Step 2.1: Add hint-based action handler**
- Location: `content.js`
- Add new message handler: `execute_action_with_hints`
- Uses `resolveElement()` for resolution
- Test: Manual test via console message

**Step 2.2: Add server hint injection**
- Location: `ws_server.py`
- When executing action, lookup in text.json
- Inject hints into command: `{actionId, hints: {...}, params}`
- Add feature flag: `USE_SELECTOR_RESOLUTION = True`
- Test: Verify hints appear in command

**Step 2.3: Wire up new path**
- Modify server to use new handler when flag enabled
- Test: End-to-end action execution via new path

### Phase 3: Capability Unification

**Step 3.1: Refactor capabilityPipelineExecutor**
- Extract selector resolution to use `resolveElement()`
- Keep capability config loading unchanged
- Test: All existing capabilities still work

**Step 3.2: Create unified executeOnElement()**
- Extract execution logic from capability pipeline
- Shared by both capabilities and actions
- Test: Both paths use same execution

### Phase 4: Cleanup (Breaking)

**Step 4.1: Remove DOM attribute writing**
- Remove `data-ome-action-id` setAttribute calls
- Remove cleanup code for old attributes
- Test: Scan still works, no attributes written

**Step 4.2: Remove ELEMENT_REGISTRY**
- Remove registry population
- Remove registry lookup
- Remove `_element_resolver` system
- Test: Actions still work via new path

**Step 4.3: Remove old executeAction handler**
- Remove `intelligenceEngine.executeAction()`
- Remove old message handler
- Test: All actions via new unified path

**Step 4.4: Clean up IntelligenceEngine**
- Remove `actionableElements` map
- Remove execution methods
- Keep scanning/analysis methods
- Test: Scanning still works

### Phase 5: Hardening

**Step 5.1: Add fallback chain**
```javascript
function resolveElement(hints) {
    // 1. Try data-ome-action-id (if still present from old scans)
    // 2. Try selectors
    // 3. Try text match
    // 4. Return null
}
```

**Step 5.2: Add resolution logging**
- Log which method succeeded
- Log selector attempts
- Useful for debugging site configs

**Step 5.3: Add selector quality scoring**
- Track which selectors work best per site
- Inform future site config improvements

---

## Part 5: Testing Plan

### 5.1 Unit Tests

**text.json Generation:**
```python
def test_text_json_generation():
    elements = [
        {"id": "a_id_0", "type": "link", "text": "Gmail", "selector": "a[href*='mail']"},
        {"id": "a_id_1", "type": "button", "text": "Compose", "selector": "button"}
    ]
    result = generate_text_json(elements)
    assert "a_id_0" in result["elements"]
    assert result["elements"]["a_id_0"]["type"] == "link"
```

**Selector Resolution:**
```javascript
// Console test
const hints = {selectors: ["a[href*='inbox']"], text: "Inbox"};
const el = resolveElement(hints);
console.assert(el !== null, "Should find inbox link");
console.assert(el.tagName === "A", "Should be anchor element");
```

### 5.2 Integration Tests

**Test 1: Gmail Link Click**
```bash
# After scan completes
python3 om_e_web_ws/test_navigation.py --action-id a_id_41 --action-type navigate

# Expected: Email opens (resolved via selector + text)
```

**Test 2: Gmail Search Input**
```bash
python3 om_e_web_ws/test_navigation.py --action-id a_id_4 --action-type setValue --value "test query" --submit

# Expected: Search executes
```

**Test 3: YouTube Capability (unchanged)**
```bash
python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript

# Expected: Transcript retrieves (capability path unchanged)
```

### 5.3 Regression Tests

**Test: Page Re-render Survival**
1. Scan Gmail
2. Scroll to trigger re-render
3. Execute action
4. Should succeed (selector resolution, not DOM attribute)

**Test: Content Script Reinjection**
1. Scan page
2. Force content script reload
3. Execute action
4. Should succeed (no registry dependency)

**Test: Multiple Tabs**
1. Open Gmail in Tab 1, YouTube in Tab 2
2. Scan both
3. Switch tabs, execute actions
4. Should work (text.json per-tab or URL-keyed)

### 5.4 Site-Specific Tests

**Gmail:**
- [ ] Click email link
- [ ] Search input + submit
- [ ] Compose button
- [ ] Navigation links

**YouTube:**
- [ ] Search input
- [ ] Video link click
- [ ] Play/Pause button
- [ ] Subscribe button
- [ ] RetrieveTranscript capability

**Google Search:**
- [ ] Search input + submit
- [ ] Result link click

---

## Part 6: Rollback Plan

### Feature Flag Rollback
```python
# ws_server.py
USE_SELECTOR_RESOLUTION = False  # Revert to registry-based

# Will use old path until fixed
```

### Full Rollback
If Phase 4 cleanup causes issues:
1. Git revert Phase 4 commits
2. Keep Phase 1-3 code (parallel paths)
3. Debug in isolation

### Data Recovery
- text.json is additive (doesn't modify text.md)
- Old scans still have text.md
- No data loss from migration

---

## Part 7: Success Metrics

### Reliability
- [ ] Action success rate > 95% (currently ~60% due to registry issues)
- [ ] Zero "Element not found" errors when element visible on page
- [ ] Survives page re-renders without re-scan

### Performance
- [ ] Resolution time < 50ms (selector lookup fast)
- [ ] No increase in scan time
- [ ] text.json size < 100KB for typical page

### Code Quality
- [ ] Remove > 500 lines of registry management code
- [ ] Single resolution path for actions and capabilities
- [ ] Clear separation: scan → generate → resolve → execute

---

## Part 8: Future Enhancements

### 8.1 Smart Selector Generation
- Analyze element for unique attributes
- Generate multiple fallback selectors
- Rank by specificity and stability

### 8.2 Selector Learning
- Track which selectors succeed/fail per site
- Auto-improve selectors over time
- Feed back into site configs

### 8.3 Visual Matching (Future)
- Screenshot element during scan
- Use visual similarity for resolution
- Handles cases where text/selector change but appearance same

---

## Appendix A: File Change Summary

| File | Changes |
|------|---------|
| `ws_server.py` | +generate_text_json(), +load_text_json(), +hint injection, -registry refs |
| `content.js` | +resolveElement(), +executeOnElement(), +new handler, -DOM attrs, -registry |
| `dispatcher.py` | -_element_resolver, modify resolve_action_type() |
| `@site_structures/text.json` | NEW FILE |

## Appendix B: Message Format Changes

**Current:**
```json
{
  "type": "llm_instruction",
  "data": {
    "actionId": "a_id_41",
    "actionType": "navigate",
    "params": {}
  }
}
```

**New:**
```json
{
  "type": "execute_action_with_hints",
  "data": {
    "actionId": "a_id_41",
    "actionType": "navigate",
    "params": {},
    "hints": {
      "selectors": ["a[href*='inbox/FMfcg']", "a.zA"],
      "text": "5B Bundey Street, Magill - NBN Connection",
      "type": "link"
    }
  }
}
```

## Appendix C: Testing the Current Broken State

**To verify the bug exists:**

1. Start server: `python om_e_web_ws/ws_server.py`
2. Load extension in Chrome
3. Navigate to Gmail inbox
4. Wait for scan complete (check console: "Scan complete")
5. Check server logs: Should see "Element registry updated: N elements"
6. In content.js console, run:
```javascript
console.log("IntelligenceEngine exists:", !!window.intelligenceEngine);
console.log("actionableElements size:", window.intelligenceEngine?.actionableElements.size);
console.log("First 5 IDs:", Array.from(window.intelligenceEngine?.actionableElements.keys() || []).slice(0, 5));
```

**Expected output (BROKEN):**
```
IntelligenceEngine exists: true
actionableElements size: 0  // ❌ EMPTY!
First 5 IDs: []
```

7. Check DOM for data-ome-action-id attributes:
```javascript
console.log("DOM attributes found:", document.querySelectorAll('[data-ome-action-id]').length);
```

**Expected output:**
```
DOM attributes found: 150+  // ✓ Attributes exist in DOM
```

**Conclusion:** The bug is confirmed - actionableElements Map is empty even though:
- DOM attributes were written during scan
- Server has the ELEMENT_REGISTRY populated
- text.md contains action IDs

8. Try to execute an action:
```bash
python3 om_e_web_ws/test_navigation.py --action-id a_id_5 --action-type click
```

**Expected error:**
```
❌ Actionable element not found: a_id_5
```

---

## Appendix D: Selector Generation Strategy

**Priority order for selector generation:**

1. **Unique ID**: `#element-id` (most stable if present)
2. **Unique aria-label**: `[aria-label='Compose']`
3. **Unique name**: `[name='q']`
4. **Unique data attribute**: `[data-thread-id='xxx']`
5. **Tag + class**: `button.T-I-KE`
6. **Tag + role**: `div[role='button']`
7. **Tag + text content**: Handled via text hint, not selector

**Generate 2-3 selectors per element** for fallback chain.
