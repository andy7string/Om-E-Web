# Selector-Based Lookup System Implementation Plan

## Executive Summary

**THE PROBLEM:** Content script assigns action IDs, writes DOM attributes, and maintains multiple in-memory registries during scan. These attributes get cleared on page re-render, and the registries get overwritten constantly. When LLM requests `a_id_7`, we can't find it.

**THE SOLUTION:**
1. Remove DOM attribute writing entirely ✅ DONE
2. Generate `text.md` + `text.json` together on the server (same IDs, always in sync) ✅ DONE
3. Store resolution hints (label + type + selectors) in `text.json` ✅ DONE
4. Resolve elements using selectors from text.json, NOT ephemeral DOM attributes or in-memory registries
5. **Clean up technical debt** - remove redundant registry systems

**KEY INSIGHT:** The TEXT (label) we extract IS the primary identifier. It's always on the page. IDs are just lookup keys to get resolution hints (selectors).

---

## Current State (What's Working)

### Clean Path (Already Implemented)

```
content.js: extractSemanticTextWithIds()
    ↓
TreeWalker finds elements → Gets label + type + selectors via generateSimpleSelector()
    ↓
NO DOM ATTRIBUTES WRITTEN (disabled at line 6572)
    ↓
IDs assigned during walk (a_id_0, a_id_1, ...)
    ↓
Sends to server: {text: "...", actionables: [{id, label, type, tag, href, selectors[]}, ...]}
    ↓
ws_server.py: intelligence_update handler
    ↓
Populates ELEMENT_REGISTRY from actionables[]
    ↓
write_text_md() generates BOTH files:
    ├── text.md   (LLM reads this - has inline IDs)
    └── text.json (Server uses for resolution - has label + type + selectors)
    ↓
CURRENT_TEXT_JSON = text.json in memory
    ↓
resolve_action_hints(action_id) looks up from CURRENT_TEXT_JSON
```

### What's Already Working

| Component | Status | Location |
|-----------|--------|----------|
| `generateSimpleSelector()` | ✅ Robust | content.js:6676-6770 |
| DOM attribute writing | ✅ Disabled | content.js:6572 (commented out) |
| `text.json` generation | ✅ Working | ws_server.py:2449-2475 |
| `CURRENT_TEXT_JSON` storage | ✅ Working | ws_server.py:915 |
| `resolve_action_hints()` | ✅ Working | ws_server.py:2548-2577 |
| `execute_action_with_hints` routing | ✅ Working | ws_server.py:4527, 5126 |

---

## The Problem: Technical Debt

We have **THREE parallel systems** doing similar things:

### 1. Old In-Browser Registry System (REMOVE)
```
IntelligenceEngine:
  - actionableElements Map (id → descriptor)
  - actionableElementNodes Map (id → live DOM node)
  - registeredElements WeakSet
  - elementToActionId WeakMap
  - registerActionableElement()
  - generateActionableId()
  - generateElementSelectors()
  - resolveActionableDomNode()
  - getActionableElement()
  - storeActionableNode()
  - getStoredActionableNode()
```
**Problem:** Cleared on every rescan, tied to ephemeral DOM nodes

### 2. Server ELEMENT_REGISTRY (REMOVE)
```
ws_server.py:
  - ELEMENT_REGISTRY global
  - Populated from actionables[] on intelligence_update
  - Used for action type resolution
```
**Problem:** Redundant - same data is now in CURRENT_TEXT_JSON

### 3. New Selector System (KEEP)
```
ws_server.py:
  - CURRENT_TEXT_JSON (text.json in memory)
  - resolve_action_hints() for lookup

content.js:
  - generateSimpleSelector() for selector generation
  - executeWithHints() for action execution
```
**This is the clean path we want**

---

## Site Configs Capability Pipeline (DO NOT BREAK)

The capability pipeline for `site_configs.json` is **separate and must be preserved**:

```
site_configs.json defines capabilities:
    ↓
LLM sends: {"cap": "RetrieveTranscript"}
    ↓
ws_server.py routes to: execute_capability
    ↓
sw.js forwards to content.js
    ↓
content.js: capabilityPipelineExecutor(action, params)
    ↓
Uses selectors from site_configs.json (NOT text.json)
```

**Key differences:**
- Capabilities use **static selectors** from site_configs.json
- Action IDs use **dynamic selectors** from text.json
- Both use selector-based resolution, but from different sources
- `capabilityPipelineExecutor()` must remain untouched

---

## Implementation Plan

### Phase 1: Enhance executeWithHints() (Current Focus)

**Goal:** Make `executeWithHints()` a robust action executor that reuses existing action logic.

**File:** `web_extension/content.js`

The current `executeWithHints()` (lines 11365-11474) is **too simple**. It needs:

1. **Better element resolution** - already has selector cascade, but needs:
   - Wait for lazy-loaded elements (already has)
   - Label-based fallback filtering (already has)

2. **Robust action execution** - currently missing:
   - Smart click resolution (dimension checks, visibility)
   - Toggle action support (checkbox/radio/switch)
   - Rich setValue (inputPatterns, contentEditable, clipboard paste)
   - Navigate with stored href from hints

**Approach:** Extract action execution logic from old `executeAction()` into reusable functions, then call them from `executeWithHints()`.

### Phase 2: Clean Up Technical Debt

**Remove from content.js:**

| Code | Lines (approx) | Reason |
|------|----------------|--------|
| `actionableElements` Map | 5851 | No longer needed |
| `actionableElementNodes` Map | 5852 | No longer needed |
| `registeredElements` WeakSet | 5863 | No longer needed |
| `elementToActionId` WeakMap | 5864 | No longer needed |
| `registerActionableElement()` | 7919-7996 | No longer needed |
| `generateActionableId()` | 7738-7793 | Replaced by simpler ID assignment |
| `generateElementSelectors()` | 7798-7840 | Replaced by generateSimpleSelector() |
| `resolveActionableDomNode()` | 8106-8255 | Replaced by selector resolution |
| `getActionableElement()` | 8261-8320 | No longer needed |
| `storeActionableNode()` | 7998-8009 | No longer needed |
| `getStoredActionableNode()` | 8010-8022 | No longer needed |
| `execute_action` handler | 11586-11647 | Replaced by execute_action_with_hints |
| Map repopulation in getIntelligenceData | 7183-7210 | No longer needed |

**Remove from ws_server.py:**

| Code | Lines (approx) | Reason |
|------|----------------|--------|
| `ELEMENT_REGISTRY` global | 85 | Replaced by CURRENT_TEXT_JSON |
| `get_element_info()` | 124-126 | Use resolve_action_hints() instead |
| `resolve_action_type()` using ELEMENT_REGISTRY | Various | Use hints.type instead |
| ELEMENT_REGISTRY population code | 4160-4195 | No longer needed |

### Phase 3: Simplify Message Flow

**Before (complex):**
```
llm_instruction → check ELEMENT_REGISTRY → resolve_action_type() →
  → resolve_action_hints() → send execute_action_with_hints
```

**After (simple):**
```
llm_instruction → resolve_action_hints() → send execute_action_with_hints
  (hints already contains type, tag, selectors, href)
```

### Phase 4: Update sw.js Handler Names

Ensure sw.js correctly routes:
- `execute_action_with_hints` → content.js (action ID pipeline)
- `execute_capability` → content.js (site config pipeline)

Remove old handler:
- `execute_action` → no longer used

---

## File Changes Summary

### content.js

**Keep:**
- `extractSemanticTextWithIds()` - the DOM walker that generates text + actionables
- `generateSimpleSelector()` - robust selector generation
- `executeWithHints()` - enhance this to be the main executor
- `execute_action_with_hints` handler
- `execute_capability` handler (for site configs)
- `capabilityPipelineExecutor()` (for site configs)
- `universalClick()`, `findVisibleElement()`, etc. - reusable utilities

**Remove:**
- All Map/WeakMap/WeakSet registries
- `registerActionableElement()` and related functions
- `resolveActionableDomNode()` with its 5 fallback strategies
- `execute_action` handler
- Map repopulation code in `getIntelligenceData()`

**Enhance:**
- `executeWithHints()` - add robust action logic from old executeAction()

### ws_server.py

**Keep:**
- `CURRENT_TEXT_JSON` global
- `resolve_action_hints()` function
- `write_text_md()` that generates both files

**Remove:**
- `ELEMENT_REGISTRY` global
- `get_element_info()` function
- `resolve_action_type()` that uses ELEMENT_REGISTRY
- ELEMENT_REGISTRY population code in intelligence_update handler

**Simplify:**
- Action execution path to just use hints

### sw.js

**Keep:**
- `handleExecuteActionWithHints()`
- `handleExecuteCapability()`

**Remove:**
- `handleExecuteLLMAction()` (old path)

---

## Testing Checklist

### Selector Resolution Test
```bash
# Execute action via test_navigation.py
python3 om_e_web_ws/test_navigation.py --action-id a_id_0 --action-type click
# Should find element via selectors and click
```

### Site Config Capability Test (MUST NOT BREAK)
```bash
# Test capability pipeline still works
python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript
# Should work exactly as before
```

### Re-render Survival Test
1. Scan a page
2. Scroll/interact to trigger re-render
3. Execute action
4. **Should succeed** (selectors still valid)

### Page Refresh Test
1. Scan page
2. Refresh (F5)
3. Wait for new scan
4. Execute action with NEW IDs
5. **Should succeed** (new text.json generated)

---

## Estimated Code Reduction

| File | Current Lines | After Cleanup | Reduction |
|------|---------------|---------------|-----------|
| content.js | ~12,000 | ~11,000 | ~1,000 lines |
| ws_server.py | ~5,500 | ~5,300 | ~200 lines |

**Total: ~1,200 lines of technical debt removed**

---

## Rollback Plan

If cleanup breaks things:

1. **Git stash** the cleanup changes
2. Keep both systems running in parallel temporarily
3. Add feature flag to switch between old/new resolution

```python
# Fallback during transition
USE_NEW_RESOLUTION = True

if USE_NEW_RESOLUTION:
    hints = resolve_action_hints(action_id)
else:
    hints = ELEMENT_REGISTRY.get(action_id)
```

---

## Summary

| Before | After |
|--------|-------|
| 3 parallel systems | 1 clean system |
| DOM attributes (ephemeral) | Selectors (persistent) |
| In-memory Maps (cleared on rescan) | text.json (regenerated per scan) |
| Complex resolution with 5 fallbacks | Simple selector cascade |
| ~1,200 lines of registry code | Removed |
| Two action handlers | One handler (execute_action_with_hints) |

**The key insight:** We don't need to track live DOM nodes. We just need selectors that can find them again.
