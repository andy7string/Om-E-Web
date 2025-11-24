# Dead Code Removal Report - Om_E_Web

**Date:** 2025-11-24
**Purpose:** Identify and remove dead code while protecting text.md pipeline
**Current File Size:** ws_server.py = 3,803 lines

---

## Executive Summary

**Safe to Remove:** ~639+ lines of dead code (16.8% of ws_server.py)
**Status:** text.md pipeline is SAFE - uses inline generation, not affected by removals
**Risk Level:** LOW - Dead code is clearly separated from active paths

---

## text.md Pipeline Verification

### ✅ ACTIVE PATH (Lines 3111-3167)

**text.md is generated INLINE in handler() function:**

```python
# Line 3127-3158: ACTIVE text.md generation
if semantic_text:
    text_file_path = os.path.join("@site_structures", "text.md")
    current_url = page_state.get('url', '')
    capabilities = resolve_capabilities_for_url(current_url)

    with open(text_file_path, 'w', encoding='utf-8') as f:
        # Write frontmatter, capabilities, content
        f.write(f"# {page_state.get('title')}\n\n")
        f.write(f"**URL:** {page_state.get('url')}\n")
        # ... capabilities section ...
        f.write(page_text)
```

**Dependencies:**
- ✅ `resolve_capabilities_for_url()` - ACTIVE (line 584)
- ✅ `intelligence_data.get('semanticPageData')` - ACTIVE
- ✅ Direct file write - No function dependencies

**Conclusion:** text.md does NOT depend on ANY of the dead code functions below.

---

## Dead Code Inventory

### Category 1: SAFE TO DELETE - Old LLM Prompt Generation

#### 1. `generate_llm_prompt()` (428 lines) 🔴 HIGH PRIORITY

**Location:** ws_server.py lines 1120-1548
**Size:** 428 lines (11.3% of file)
**Status:** COMMENTED OUT at line 3179
**Last Used:** Never (replaced by inline text.md generation)

**Function Purpose:**
- OLD approach: Generate llm_prompt.md with categorized actions
- NEW approach: text.md with inline generation

**Evidence it's dead:**
```python
# Line 3173-3185: DISABLED
# 🚫 DISABLED: Old llm_prompt.md generation (replaced by semantic text.md)
# try:
#     generated = generate_llm_prompt(text_path, page_path, prompt_out)
#     ...
# except Exception as gen_err:
#     print(f"⚠️ Error generating llm_prompt.md: {gen_err}")
```

**What it does:**
- Reads page.jsonl
- Categorizes actions (email, navigation, regular)
- Generates llm_prompt.md file
- ~~Uses pageVersion for SPA filtering~~ (already removed)

**Safe to delete because:**
- Function is never called
- text.md replaces its functionality
- All its sub-functions are only used by it

---

#### 2. `save_page_text_to_markdown()` (46 lines) 🟡 MEDIUM PRIORITY

**Location:** ws_server.py lines 850-896
**Size:** 46 lines (1.2% of file)
**Status:** Called from OLD text extraction path (line 3487)
**Last Used:** Old text extraction responses (no longer sent)

**Function Purpose:**
- OLD approach: Save text extraction responses to hostname_page_text.md
- NEW approach: Inline text.md generation from intelligence_update

**Evidence it's dead:**
```python
# Line 3470-3497: OLD text extraction handler
is_text_extraction = (
    msg.get("id", "").startswith("text-") or  # Old message format
    msg.get("command") == "extractPageText" or  # Old command
    ...
)
if is_text_extraction:
    saved_file = await save_page_text_to_markdown(text_data)  # DEAD PATH
```

**What it does:**
- Takes text_data with frontmatter/markdown fields
- Generates filename: `{hostname}_page_text.md`
- Writes to @site_structures/

**Safe to delete because:**
- Extension no longer sends "extractPageText" commands
- Intelligence updates now carry semantic text directly
- text.md generation happens inline

**Verification needed:**
- Confirm no "extractPageText" messages are sent
- Check if any code calls this explicitly

---

#### 3. `clear_llm_actions()` (40 lines) 🟢 LOW PRIORITY (Maybe keep)

**Location:** ws_server.py lines 897-937
**Size:** 40 lines (1.1% of file)
**Status:** CALLED at line 793
**Used by:** `process_actionable_elements_for_llm()`

**Function Purpose:**
- Creates empty llm_actions.json when no actions available
- Indicates "no actions" state

**Evidence it might be active:**
```python
# Line 790-793
if not actionable_elements:
    print("⚠️ No actionable elements to process")
    await clear_llm_actions()  # ACTIVE?
    return
```

**Need to verify:**
- Is `process_actionable_elements_for_llm()` called?
- Is llm_actions.json still used?

**Recommendation:** INVESTIGATE BEFORE DELETING

---

### Category 2: ACTIVE BUT COULD BE SIMPLIFIED

#### 4. `save_intelligence_to_page_jsonl()` (125 lines) ⚠️ ACTIVE - DON'T DELETE

**Location:** ws_server.py lines 363-488
**Size:** 125 lines (3.3% of file)
**Status:** ACTIVE - called at line 3106
**Purpose:** Generates page.jsonl (used for artifact generation)

**Why it's active:**
```python
# Line 3106: ACTIVE
await save_intelligence_to_page_jsonl(intelligence_data, transcript_refs)
```

**Recommendation:** KEEP (it's active)

---

### Category 3: OLD CODE BLOCKS

#### 5. Old Text Extraction Handler (28 lines) 🟡 MEDIUM PRIORITY

**Location:** ws_server.py lines 3470-3497
**Size:** 28 lines
**Status:** Dead code path

**What it does:**
- Handles OLD text extraction responses
- Checks for extractPageText commands
- Calls `save_page_text_to_markdown()`

**Safe to delete because:**
- Extension doesn't send these messages anymore
- Replaced by intelligence_update with semanticPageData

---

## Deletion Priority List

### Phase 1: Low-Hanging Fruit (428 lines) ✅ SAFE

**Delete:** `generate_llm_prompt()` function
**Lines:** 1120-1548 (428 lines)
**Risk:** ZERO - Already commented out, never called
**Impact:** 11.3% file size reduction
**Test:** Load page, verify text.md still generates

---

### Phase 2: Old Text Extraction (74 lines) ✅ PROBABLY SAFE

**Delete:**
1. `save_page_text_to_markdown()` (lines 850-896, 46 lines)
2. Old text extraction handler (lines 3470-3497, 28 lines)

**Risk:** LOW - Old code path no longer triggered
**Impact:** 2% file size reduction
**Test:** Navigate pages, verify text.md updates correctly

**Verification step:**
```bash
# Check if any "extractPageText" messages exist
grep -r "extractPageText" web_extension/
# Expected: No results
```

---

### Phase 3: Investigation Needed (40 lines) ⚠️ VERIFY FIRST

**Investigate:** `clear_llm_actions()` function
**Lines:** 897-937 (40 lines)
**Risk:** MEDIUM - May be used by active code
**Action:** Check if llm_actions.json is still needed

**Verification steps:**
1. Search for llm_actions.json references
2. Check if process_actionable_elements_for_llm() is called
3. If not used, delete

---

## Detailed Removal Plan

### PHASE 1: Delete generate_llm_prompt() - SAFEST

**Step 1:** Remove function definition (428 lines)
```python
# Delete lines 1120-1548
def generate_llm_prompt(...):
    # ... 428 lines ...
```

**Step 2:** Remove any helper functions ONLY used by generate_llm_prompt
- Check: `_map_prompt_action_sentence()`
- Check: `_smart_categorize_actions()`
- Check: `_extract_domain()` (already flagged as unused)

**Step 3:** Test
```bash
# Start server
python om_e_web_ws/ws_server.py

# Navigate to YouTube video
# Verify:
# 1. text.md generates correctly
# 2. Capabilities section appears
# 3. Content is present
# 4. No errors in server console
```

**Expected result:** No change in behavior

---

### PHASE 2: Delete Old Text Extraction Code

**Step 1:** Remove save_page_text_to_markdown() (46 lines)
```python
# Delete lines 850-896
async def save_page_text_to_markdown(text_data):
    # ... 46 lines ...
```

**Step 2:** Remove old text extraction handler (28 lines)
```python
# Delete lines 3470-3497
is_text_extraction = (...)
if is_text_extraction:
    # ... 28 lines ...
```

**Step 3:** Test same as Phase 1

**Expected result:** No change in behavior

---

### PHASE 3: Investigate clear_llm_actions()

**Step 1:** Check llm_actions.json usage
```bash
# Search for references
grep -r "llm_actions.json" om_e_web_ws/ web_extension/

# Check if file is being read
ls -lh @site_structures/llm_actions.json
```

**Step 2:** If unused, delete function and caller

**Step 3:** Test

---

## Safety Verification Checklist

Before each deletion:

### ✅ Pre-Deletion Checks
- [ ] Function is not called anywhere (verified with grep)
- [ ] text.md generation tested and working
- [ ] No references in extension code
- [ ] Committed to git (can rollback)

### ✅ Post-Deletion Tests
- [ ] Server starts without errors
- [ ] Navigate to YouTube video
- [ ] text.md generates with capabilities section
- [ ] Content is complete
- [ ] No console errors
- [ ] Navigation between pages works
- [ ] text.md updates on navigation

---

## Estimated Impact

### Total Lines to Remove (Conservative)

| Phase | Function | Lines | Risk |
|-------|----------|-------|------|
| 1 | `generate_llm_prompt()` | 428 | ZERO |
| 1 | Helper functions | ~50 | LOW |
| 2 | `save_page_text_to_markdown()` | 46 | LOW |
| 2 | Old text extraction handler | 28 | LOW |
| 3 | `clear_llm_actions()` (if unused) | 40 | MEDIUM |
| **TOTAL** | | **~592 lines** | |

**Conservative estimate:** 550+ lines safe to remove (14.5% of file)
**Aggressive estimate:** 640+ lines if all phases complete (16.8% of file)

---

## text.md Pipeline Protection

### What text.md DEPENDS ON (Don't Delete!)

✅ **KEEP:**
1. `resolve_capabilities_for_url()` (line 584)
2. Inline text.md generation (lines 3127-3158)
3. `intelligence_update` message handler (lines 3083-3213)
4. `get_all_site_configs()` function
5. `intelligence_data.semanticPageData` field processing

❌ **DON'T DELETE:**
- Anything in lines 3111-3167 (inline text.md generation)
- `resolve_capabilities_for_url()` and its dependencies
- site_configs.json loading functions

---

## Next Steps

1. **Phase 1 Execution:**
   ```bash
   # Delete generate_llm_prompt() function
   # Lines 1120-1548 (428 lines)
   # Test immediately
   ```

2. **Verify text.md works:**
   ```bash
   # Navigate between pages
   # Check @site_structures/text.md updates
   # Verify capabilities section present
   ```

3. **Phase 2 Execution (if Phase 1 succeeds):**
   ```bash
   # Delete save_page_text_to_markdown()
   # Delete old text extraction handler
   # Test again
   ```

4. **Phase 3 Investigation:**
   ```bash
   # Research llm_actions.json usage
   # Delete if unused
   ```

---

## Rollback Plan

**If anything breaks:**

```bash
# Revert last change
git diff HEAD -- om_e_web_ws/ws_server.py > /tmp/changes.patch
git checkout -- om_e_web_ws/ws_server.py

# Or restore specific function from git history
git log -p -- om_e_web_ws/ws_server.py | grep -A 50 "generate_llm_prompt"
```

---

## Summary

**Recommendation:** Execute Phase 1 NOW - it's 100% safe (428 lines removed)

The `generate_llm_prompt()` function is:
- Already commented out
- Never called
- Replaced by inline text.md generation
- Contains pageVersion logic we already removed
- 11.3% of the file

**Zero risk, significant cleanup.**

Would you like me to proceed with Phase 1 deletion?
