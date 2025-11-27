# Enable --params Argument Support and Smart Capability Dispatcher

## Objective

Enhance the capability execution pipeline to accept `--params` JSON arguments from `test_navigation.py`, route them through the WebSocket server and service worker, and implement a smart dispatcher that:
1. Routes tab manipulation capabilities (SwitchTab, OpenTab, CloseTab, UpdateTabURL) directly to service worker handlers (browser-level operations)
2. Routes DOM-based capabilities (RetrieveTranscript, TogglePlayPause, etc.) to content.js (page-level operations)
3. Preserves all existing capability functionality

## Current Execution Path Analysis

### Existing Flow (DOM-based capabilities like RetrieveTranscript):
```
test_navigation.py → ws_server.py → sw.js → content.js → capabilityPipelineExecutor()
```

**Current message format:**
```json
{
  "type": "execute_capability",
  "action": "RetrieveTranscript",
  "params": {"value": "...", "submit": true}  // Only supports value/submit currently
}
```

### Existing Tab Command Handlers (in sw.js):
- `handleSwitchTabCommand(message)` - Line 1159
- `handleOpenTabCommand(message)` - Line 1202
- `handleCloseTabCommand(message)` - Line 1242
- These are currently accessed via old command format: `{command: "switchTab", params: {tabId: ...}}`

## Required Changes

### Step 1: Add --params Support to test_navigation.py

**File:** `om_e_web_ws/test_navigation.py`

**Current state:** Only supports `--value` and `--submit` flags, which get merged into `params` dict.

**Required change:**
1. Add new argument parser option: `--params` that accepts a JSON string
2. Parse the JSON string and merge with existing params (don't overwrite, merge intelligently)
3. Preserve backward compatibility: `--value` and `--submit` should still work

**Example usage after implementation:**
```bash
# Tab manipulation with params
python3 test_navigation.py --command capability --capability SwitchTab --params '{"tabId": 1138024218}'
python3 test_navigation.py --command capability --capability OpenTab --params '{"url": "https://google.com"}'

# DOM capabilities still work with --value
python3 test_navigation.py --command capability --capability RetrieveTranscript
python3 test_navigation.py --command capability --capability SearchYouTube --value "Tesla" --submit
```

**Implementation notes:**
- Use `argparse` to add `--params` argument
- Parse JSON string with `json.loads()`
- Merge parsed params with existing `params` dict (from `--value`/`--submit`)
- Handle JSON parsing errors gracefully

### Step 2: Enhance Service Worker Smart Dispatcher

**File:** `web_extension/sw.js`

**Current state:** `handleExecuteCapability()` (Line 1931) always routes to content.js via `chrome.tabs.sendMessage()`.

**Required change:**
Create a smart dispatcher that analyzes the capability action and routes appropriately:

**Tab manipulation capabilities** (browser-level, handled in service worker):
- `SwitchTab` → Call existing `handleSwitchTabCommand()` (adapt message format)
- `OpenTab` → Call existing `handleOpenTabCommand()` (adapt message format)
- `CloseTab` → Call existing `handleCloseTabCommand()` (adapt message format)
- `UpdateTabURL` → Create new handler or route to existing tab navigation logic

**DOM-based capabilities** (page-level, handled in content.js):
- `RetrieveTranscript` → Route to content.js (existing behavior)
- `TogglePlayPause` → Route to content.js (existing behavior)
- `SearchYouTube` → Route to content.js (existing behavior)
- All other capabilities → Route to content.js (existing behavior)

**Implementation pattern:**
```javascript
async function handleExecuteCapability(message) {
    const { action, params } = message;
    
    // Smart dispatcher: Check if this is a tab manipulation capability
    const tabCapabilities = ['SwitchTab', 'OpenTab', 'CloseTab', 'UpdateTabURL'];
    
    if (tabCapabilities.includes(action)) {
        // Route to service worker handlers (browser-level)
        return await handleTabCapability(action, params);
    } else {
        // Route to content script (page-level DOM operations)
        return await handleDOMCapability(action, params);
    }
}
```

**Key requirements:**
1. Preserve existing `handleExecuteCapability()` signature and behavior for DOM capabilities
2. Create `handleTabCapability()` that adapts the capability message format to the existing tab command handlers
3. Create `handleDOMCapability()` that maintains current content.js routing
4. Ensure response handling works for both paths (send back to WebSocket server)

### Step 3: Adapt Tab Command Handlers

**File:** `web_extension/sw.js`

**Current handlers expect format:**
```javascript
{
  command: "switchTab",
  id: "message_id",
  params: { tabId: 123 }
}
```

**Capability format:**
```javascript
{
  type: "execute_capability",
  action: "SwitchTab",
  params: { tabId: 123 }
}
```

**Required change:**
Create adapter function `handleTabCapability(action, params)` that:
1. Maps capability action names to command names:
   - `SwitchTab` → `switchTab`
   - `OpenTab` → `openTab`
   - `CloseTab` → `closeTab`
   - `UpdateTabURL` → `updateTabURL` (may need new handler)
2. Calls existing handlers with adapted message format
3. Returns response in capability format (not command format)
4. Handles errors and sends responses back to WebSocket server

### Step 4: Preserve Content.js Capability Pipeline

**File:** `web_extension/content.js`

**Current state:** `capabilityPipelineExecutor()` (Line 11068) handles all DOM-based capabilities via site config selectors.

**Required change:** 
**NONE** - This should continue working exactly as-is. The smart dispatcher in sw.js will route DOM capabilities here, preserving all existing functionality.

**Verification:**
- Ensure `RetrieveTranscript` still works
- Ensure `TogglePlayPause` still works
- Ensure all existing capabilities continue to function

## Implementation Checklist

### test_navigation.py
- [ ] Add `--params` argument parser option
- [ ] Parse JSON string with error handling
- [ ] Merge parsed params with existing `params` dict (from `--value`/`--submit`)
- [ ] Preserve backward compatibility
- [ ] Update usage examples in docstring

### sw.js
- [ ] Create `handleTabCapability(action, params)` function
- [ ] Create `handleDOMCapability(action, params)` function (wrapper around existing logic)
- [ ] Modify `handleExecuteCapability()` to use smart dispatcher
- [ ] Create adapter to convert capability format to command format for tab handlers
- [ ] Ensure response routing back to WebSocket server works for both paths
- [ ] Add `UpdateTabURL` handler if it doesn't exist (or route to existing navigation)

### Testing
- [ ] Test tab manipulation: `SwitchTab`, `OpenTab`, `CloseTab`
- [ ] Test DOM capabilities: `RetrieveTranscript`, `TogglePlayPause` (ensure they still work)
- [ ] Test mixed usage: `--value` + `--params` together
- [ ] Test error handling: invalid JSON, missing params, invalid tabId

## Key Design Principles

1. **Backward Compatibility**: All existing capability calls must continue to work
2. **Smart Routing**: Browser-level operations stay in service worker, page-level operations go to content.js
3. **Preserve Existing**: Don't refactor working code, add dispatcher layer on top
4. **Error Handling**: Graceful failures with clear error messages
5. **Response Format**: Both paths should return consistent response format to WebSocket server

## Example Execution Flow After Implementation

### Tab Operation (SwitchTab):
```
test_navigation.py --command capability --capability SwitchTab --params '{"tabId": 1138024218}'
  ↓
ws_server.py (forwards message as-is)
  ↓
sw.js handleExecuteCapability() → Smart dispatcher detects "SwitchTab"
  ↓
sw.js handleTabCapability() → Adapts format → handleSwitchTabCommand()
  ↓
chrome.tabs.update() executed
  ↓
Response sent back through WebSocket
```

### DOM Operation (RetrieveTranscript):
```
test_navigation.py --command capability --capability RetrieveTranscript
  ↓
ws_server.py (forwards message as-is)
  ↓
sw.js handleExecuteCapability() → Smart dispatcher detects DOM capability
  ↓
sw.js handleDOMCapability() → chrome.tabs.sendMessage() to content.js
  ↓
content.js capabilityPipelineExecutor() → Executes via selectors
  ↓
Response sent back through WebSocket
```

## Files to Modify

1. `om_e_web_ws/test_navigation.py` - Add --params argument support
2. `web_extension/sw.js` - Add smart dispatcher and tab capability routing
3. No changes needed to `web_extension/content.js` (preserve existing functionality)
4. No changes needed to `om_e_web_ws/ws_server.py` (already forwards messages as-is)

