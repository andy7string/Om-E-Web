# Implementation Plan: Persistent Stable Tab Numbering

## Problem Summary

Tab numbers (Tab 1, Tab 2, Tab 3) currently shift when tabs are opened/closed because they're derived from sorting by Chrome's internal tab ID. This causes LLM confusion when issuing tab commands.

## Solution: Persistent Tab Registry

A server-side registry that:
1. Assigns stable numbers at tab creation
2. Maintains numbers until tab closure
3. Survives tab open/close cycles
4. Provides consistent mapping for LLM tab commands

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ws_server.py                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  STABLE_TAB_REGISTRY (NEW)                                      │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  tab_id_to_number: {1001: 1, 1002: 2, 1005: 3}                  │    │
│  │  number_to_tab_id: {1: 1001, 2: 1002, 3: 1005}                  │    │
│  │  next_number: 4                                                  │    │
│  │  freed_numbers: []  (optional recycling)                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  text.md output:                                                         │
│  - Tab 1: "YouTube" (youtube.com) -- ACTIVE TAB                         │
│  - Tab 2: "Google" (google.com)                                         │
│  - Tab 3: "GitHub" (github.com)   ← Number stays 3 even if Tab 2 closes │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Changes Required

### 1. ws_server.py - New Registry Data Structures

**Location**: Near line 66 (after existing globals)

```python
# 🔢 STABLE TAB NUMBERING: Persistent registry for consistent tab numbers
STABLE_TAB_REGISTRY = {
    "tab_id_to_number": {},    # Chrome tab ID → stable display number
    "number_to_tab_id": {},    # Stable display number → Chrome tab ID
    "next_number": 1,          # Next number to assign
    "freed_numbers": [],       # Recycled numbers (LIFO - reuse highest first)
}
```

### 2. ws_server.py - New Helper Functions

**Location**: After `translate_tab_params()` (around line 175)

```python
def register_tab(tab_id: int) -> int:
    """
    🔢 Register a new tab and assign it a stable number.
    Returns the assigned number.
    """
    global STABLE_TAB_REGISTRY

    # Already registered?
    if tab_id in STABLE_TAB_REGISTRY["tab_id_to_number"]:
        return STABLE_TAB_REGISTRY["tab_id_to_number"][tab_id]

    # Assign number (reuse freed numbers or increment)
    if STABLE_TAB_REGISTRY["freed_numbers"]:
        # Reuse highest freed number (LIFO to minimize confusion)
        number = STABLE_TAB_REGISTRY["freed_numbers"].pop()
    else:
        number = STABLE_TAB_REGISTRY["next_number"]
        STABLE_TAB_REGISTRY["next_number"] += 1

    # Store mappings
    STABLE_TAB_REGISTRY["tab_id_to_number"][tab_id] = number
    STABLE_TAB_REGISTRY["number_to_tab_id"][number] = tab_id

    print(f"🔢 Registered tab {tab_id} as Tab {number}")
    return number


def unregister_tab(tab_id: int) -> int | None:
    """
    🔢 Unregister a closed tab and free its number for reuse.
    Returns the freed number, or None if tab wasn't registered.
    """
    global STABLE_TAB_REGISTRY

    number = STABLE_TAB_REGISTRY["tab_id_to_number"].pop(tab_id, None)
    if number is not None:
        STABLE_TAB_REGISTRY["number_to_tab_id"].pop(number, None)
        # Add to freed numbers for later reuse
        STABLE_TAB_REGISTRY["freed_numbers"].append(number)
        # Sort descending so we reuse highest numbers first
        STABLE_TAB_REGISTRY["freed_numbers"].sort(reverse=True)
        print(f"🔢 Unregistered Tab {number} (tab_id {tab_id})")
    return number


def get_stable_tab_number(tab_id: int) -> int | None:
    """
    🔢 Get the stable display number for a Chrome tab ID.
    """
    return STABLE_TAB_REGISTRY["tab_id_to_number"].get(tab_id)


def get_tab_id_from_number(number: int) -> int | None:
    """
    🔢 Get Chrome tab ID from stable display number.
    """
    return STABLE_TAB_REGISTRY["number_to_tab_id"].get(number)


def sync_tab_registry(tabs_info: list) -> None:
    """
    🔢 Sync registry with current tabs.
    - Register any new tabs
    - Unregister any closed tabs
    """
    current_tab_ids = {tab.get('id') for tab in tabs_info if tab.get('id')}
    registered_tab_ids = set(STABLE_TAB_REGISTRY["tab_id_to_number"].keys())

    # Register new tabs
    for tab in tabs_info:
        tab_id = tab.get('id')
        if tab_id and tab_id not in registered_tab_ids:
            register_tab(tab_id)

    # Unregister closed tabs
    for tab_id in registered_tab_ids - current_tab_ids:
        unregister_tab(tab_id)
```

### 3. ws_server.py - Modify translate_tab_params()

**Location**: Line 129-174

**Change**: Use `get_tab_id_from_number()` instead of `TAB_NUMBER_MAP.get()`

```python
def translate_tab_params(params: dict) -> tuple[dict, str | None]:
    """
    🔢 Translate display tab numbers (1-8) to real Chrome tab IDs.
    Uses STABLE_TAB_REGISTRY for consistent mapping.
    """
    if not params:
        return {}, None

    translated = params.copy()

    # Check "tab" param
    if "tab" in translated:
        tab_num = translated.pop("tab")
        try:
            tab_num = int(tab_num)
            real_tab_id = get_tab_id_from_number(tab_num)
            if real_tab_id:
                translated["tabId"] = real_tab_id
                print(f"🔢 Translated Tab {tab_num} → tabId {real_tab_id}")
            else:
                return translated, f"Tab {tab_num} not found in registry"
        except (ValueError, TypeError):
            return translated, f"Invalid tab number: {tab_num}"

    # Check "tabId" param (LLM typically uses this)
    elif "tabId" in translated:
        tab_num = translated.get("tabId")
        # Only translate if it looks like a display number (1-20 range)
        if isinstance(tab_num, int) and 1 <= tab_num <= 20:
            real_tab_id = get_tab_id_from_number(tab_num)
            if real_tab_id:
                translated["tabId"] = real_tab_id
                print(f"🔢 Translated tabId {tab_num} → real tabId {real_tab_id}")
            else:
                return translated, f"Tab {tab_num} not found in registry"

    return translated, None
```

### 4. ws_server.py - Modify update_tabs_in_text_md()

**Location**: Line 2387-2444

**Change**: Use stable numbers from registry instead of sorted index

```python
def update_tabs_in_text_md():
    """
    🗂️ Update ONLY the tabs section in text.md using stable tab numbers.
    """
    global STABLE_TAB_REGISTRY

    text_file_path = os.path.join("@site_structures", "text.md")

    if not os.path.exists(text_file_path) or not CURRENT_TABS_INFO:
        return False

    try:
        # Sync registry first
        sync_tab_registry(CURRENT_TABS_INFO)

        # Read existing file
        with open(text_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # Build tabs section using stable numbers
        tabs_lines = ["**Tabs:**\n"]

        # Sort tabs by their stable number for display
        tabs_with_numbers = []
        for tab in CURRENT_TABS_INFO:
            tab_id = tab.get('id')
            stable_num = get_stable_tab_number(tab_id)
            if stable_num:
                tabs_with_numbers.append((stable_num, tab))

        # Sort by stable number
        tabs_with_numbers.sort(key=lambda x: x[0])

        for stable_num, tab in tabs_with_numbers[:8]:
            tab_title = tab.get('title', 'Unknown')[:40]
            tab_url = tab.get('url', '')
            is_active = tab.get('active', False)
            try:
                tab_domain = urlparse(tab_url).hostname or 'unknown'
            except Exception:
                tab_domain = 'unknown'
            active_marker = " -- ACTIVE TAB" if is_active else ""
            tabs_lines.append(f"- Tab {stable_num}: \"{tab_title}\" ({tab_domain}){active_marker}\n")

        if len(tabs_with_numbers) > 8:
            tabs_lines.append(f"- (+{len(tabs_with_numbers) - 8} more tabs)\n")

        new_tabs_section = "".join(tabs_lines)

        # Find and replace tabs section
        import re
        tabs_pattern = r'\*\*Tabs:\*\*\n(?:- Tab[^\n]*\n|[^\n]*more tabs[^\n]*\n)*'
        if re.search(tabs_pattern, content):
            content = re.sub(tabs_pattern, new_tabs_section, content)
        else:
            timestamp_pattern = r'(\*\*Timestamp:\*\*[^\n]*\n)\n'
            content = re.sub(timestamp_pattern, f'\\1\n{new_tabs_section}\n', content)

        # Write back
        with open(text_file_path, 'w', encoding='utf-8', errors='ignore') as f:
            f.write(content)

        print(f"🗂️ Tabs updated in text.md ({len(tabs_with_numbers)} tabs)")
        return True
    except Exception as e:
        print(f"⚠️ Failed to update tabs in text.md: {e}")
        return False
```

### 5. ws_server.py - Modify write_text_md()

**Location**: Line 2535-2554 (tabs section in write_text_md)

**Change**: Use same stable numbering logic

```python
# 🗂️ TABS: Using stable registry numbers
if CURRENT_TABS_INFO:
    sync_tab_registry(CURRENT_TABS_INFO)

    tabs_with_numbers = []
    for tab in CURRENT_TABS_INFO:
        tab_id = tab.get('id')
        stable_num = get_stable_tab_number(tab_id)
        if stable_num:
            tabs_with_numbers.append((stable_num, tab))

    tabs_with_numbers.sort(key=lambda x: x[0])

    f.write("**Tabs:**\n")
    for stable_num, tab in tabs_with_numbers[:8]:
        tab_title = tab.get('title', 'Unknown')[:40]
        tab_url = tab.get('url', '')
        is_active = tab.get('active', False)
        try:
            tab_domain = urlparse(tab_url).hostname or 'unknown'
        except Exception:
            tab_domain = 'unknown'
        active_marker = " -- ACTIVE TAB" if is_active else ""
        f.write(f"- Tab {stable_num}: \"{tab_title}\" ({tab_domain}){active_marker}\n")

    if len(tabs_with_numbers) > 8:
        f.write(f"- (+{len(tabs_with_numbers) - 8} more tabs)\n")
    f.write("\n")
```

### 6. ws_server.py - Remove TAB_NUMBER_MAP References

**Locations**: Lines 66, 2393, 2407, 2418, 2458, 2538, 2549

**Change**: Remove all references to `TAB_NUMBER_MAP` - it's replaced by `STABLE_TAB_REGISTRY`

### 7. sw.js - Add Explicit Tab Events (Optional Enhancement)

**Location**: `chrome.tabs.onCreated` and `chrome.tabs.onRemoved` listeners

**Enhancement**: Send dedicated messages for tab lifecycle events for immediate registration

```javascript
// In chrome.tabs.onCreated listener (line 3577)
chrome.tabs.onCreated.addListener(async (tab) => {
    console.log("[SW] Tab created:", tab.id);

    // Send explicit tab_created event for immediate registration
    sendToServer({
        type: "tab_created",
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        timestamp: Date.now()
    });

    await sendActiveTabInfo();
    await sendTabsInfo();
    await ensureKeepAlivePort();
});

// In chrome.tabs.onRemoved listener (line 3589)
chrome.tabs.onRemoved.addListener(async (tabId) => {
    console.log("[SW] Tab removed:", tabId);

    // Send explicit tab_closed event for immediate unregistration
    sendToServer({
        type: "tab_closed",
        tabId: tabId,
        timestamp: Date.now()
    });

    // ... rest of cleanup code
});
```

### 8. ws_server.py - Handle New Tab Events

**Location**: In message handler (around line 4350)

```python
# 🔢 EXPLICIT TAB LIFECYCLE: Immediate registration/unregistration
if msg.get("type") == "tab_created":
    tab_id = msg.get("tabId")
    if tab_id:
        number = register_tab(tab_id)
        print(f"🔢 Tab {tab_id} registered as Tab {number}")

if msg.get("type") == "tab_closed":
    tab_id = msg.get("tabId")
    if tab_id:
        number = unregister_tab(tab_id)
        if number:
            print(f"🔢 Tab {number} (id {tab_id}) unregistered")
```

---

## Testing Plan

### Test Setup

```bash
# Terminal 1: Start server
python om_e_web_ws/ws_server.py

# Terminal 2: Run test commands
python3 om_e_web_ws/test_navigation.py --command <command>
```

### Test Cases

#### Test 1: Basic Tab Number Stability

**Steps:**
1. Open browser with 3 tabs (Tab 1, Tab 2, Tab 3)
2. Verify text.md shows Tab 1, Tab 2, Tab 3
3. Close Tab 2 (middle tab)
4. Verify text.md shows Tab 1, Tab 3 (NOT Tab 1, Tab 2)
5. Open new tab
6. Verify text.md shows Tab 1, Tab 3, Tab 4 (new tab gets next number)

**Command to verify:**
```bash
# Check current tabs
cat om_e_web_ws/@site_structures/text.md | grep "Tab"
```

#### Test 2: Switch to Stable Tab Number

**Scenario:** After closing Tab 2, Tab 3 should still be addressable as Tab 3

```bash
# Switch to Tab 3 (should work even after Tab 2 closed)
python3 om_e_web_ws/test_navigation.py --command capability --capability SwitchTab --params '{"tabId": 3}'
```

**Expected:** Switches to the tab that was originally Tab 3

#### Test 3: Open New Tab

```bash
# Open a new tab
python3 om_e_web_ws/test_navigation.py --command capability --capability OpenTab --params '{"url": "https://github.com"}'
```

**Expected:**
- New tab opens with next available number
- text.md updates immediately with new tab listed

#### Test 4: Close Tab by Stable Number

```bash
# Close Tab 3 specifically
python3 om_e_web_ws/test_navigation.py --command capability --capability CloseTab --params '{"tabId": 3}'
```

**Expected:**
- Correct tab closes (the one that was assigned number 3)
- text.md updates immediately

#### Test 5: Update Tab URL

```bash
# Navigate Tab 1 to a new URL
python3 om_e_web_ws/test_navigation.py --command capability --capability UpdateTabUrl --params '{"tabId": 1, "url": "https://youtube.com"}'
```

**Expected:**
- Tab 1's URL changes
- Tab 1 retains its number

#### Test 6: Rapid Open/Close Cycle

**Steps:**
1. Open 3 new tabs quickly
2. Close 2 tabs quickly
3. Verify numbering remains consistent

```bash
# Open tabs
python3 om_e_web_ws/test_navigation.py --command capability --capability OpenTab --params '{"url": "https://google.com"}'
python3 om_e_web_ws/test_navigation.py --command capability --capability OpenTab --params '{"url": "https://github.com"}'
python3 om_e_web_ws/test_navigation.py --command capability --capability OpenTab --params '{"url": "https://youtube.com"}'

# Check text.md for assigned numbers
cat om_e_web_ws/@site_structures/text.md | grep "Tab"

# Close middle tab
python3 om_e_web_ws/test_navigation.py --command capability --capability CloseTab --params '{"tabId": 2}'

# Verify remaining tabs kept their numbers
cat om_e_web_ws/@site_structures/text.md | grep "Tab"
```

#### Test 7: Number Recycling

**Steps:**
1. Start with Tab 1, Tab 2, Tab 3
2. Close Tab 2 → Tab 2 number freed
3. Open new tab → Should get Tab 4 (not Tab 2 immediately)
4. Close Tab 3 → Tab 3 number freed
5. Open new tab → Should get Tab 5
6. Verify freed numbers (2, 3) are available for future reuse

**Note:** The recycling uses LIFO (last freed = first reused) to minimize confusion

#### Test 8: Server Restart Recovery

**Steps:**
1. Note current tab numbers
2. Restart ws_server.py
3. Tabs should get re-registered on next tabs_info
4. Numbers may differ (this is expected - registry is in-memory)

**Enhancement (optional):** Persist registry to file for server restart recovery

---

## Verification Checklist

- [ ] Tab numbers stay consistent when closing middle tabs
- [ ] New tabs get next available number (not reusing recently freed)
- [ ] `SwitchTab` capability works with stable numbers
- [ ] `CloseTab` capability works with stable numbers
- [ ] `OpenTab` capability assigns correct new number
- [ ] `UpdateTabUrl` capability preserves tab number
- [ ] text.md updates immediately on tab changes
- [ ] Server logs show registration/unregistration events
- [ ] LLM can reference tabs by stable number

---

## Files to Modify

| File | Changes |
|------|---------|
| `om_e_web_ws/ws_server.py` | Add registry, modify 4 functions, handle 2 new events |
| `web_extension/sw.js` | Add 2 new message types for tab lifecycle |

---

## Rollback Plan

If issues arise:
1. Revert to using `sorted(tabs, key=lambda t: t.get('id', 0))`
2. Restore `TAB_NUMBER_MAP` usage
3. Remove new registry code

---

## Implementation Order

1. **Phase 1**: Add registry data structures and helper functions
2. **Phase 2**: Modify `update_tabs_in_text_md()` to use registry
3. **Phase 3**: Modify `translate_tab_params()` to use registry
4. **Phase 4**: Modify `write_text_md()` tabs section
5. **Phase 5**: Add explicit tab lifecycle events in sw.js
6. **Phase 6**: Handle new events in ws_server.py
7. **Phase 7**: Test all capabilities
8. **Phase 8**: Remove deprecated `TAB_NUMBER_MAP`
