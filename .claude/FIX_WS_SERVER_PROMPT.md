# Fix ws_server.py: Remove Duplicate Tab Handling and Fix Response Routing

## Problem Statement

The `ws_server.py` file currently has **duplicate handling** for tab capabilities that conflicts with the smart dispatcher implemented in `sw.js`. Additionally, response routing doesn't properly wait for extension responses.

## Current Issues

### Issue 1: Duplicate Tab Capability Handling
**Location:** `om_e_web_ws/ws_server.py` lines 3332-3365

The server currently has special handling that converts tab capabilities (`SwitchTab`, `OpenTab`, `CloseTab`, `UpdateTabURL`) to the old command format:

```python
# 🗂️ TAB CONTROL CAPABILITIES: Route tab actions to tab handlers
tab_actions = ['SwitchTab', 'OpenTab', 'CloseTab', 'UpdateTabURL']

if action in tab_actions:
    # Converts to old command format and sends immediately
    tab_command = {
        "command": command_name,  # e.g., "switchTab"
        "id": f"tab_{int(time.time() * 1000)}",
        "params": params
    }
    await EXTENSION_WS.send(json.dumps(tab_command))
    # Sends immediate response without waiting
    await ws.send(json.dumps({"ok": True, "message": f"Tab action {action} initiated"}))
```

**Problem:** This bypasses the smart dispatcher in `sw.js` that expects `execute_capability` format. The service worker's `handleExecuteCapability()` function routes tab capabilities to `handleTabCapability()`, but if the server sends the old command format, it goes through a different path.

### Issue 2: Immediate Response Without Waiting
**Location:** `om_e_web_ws/ws_server.py` lines 3356-3359, 3381-3386

The server sends immediate "initiated" responses without waiting for the actual result from the extension:

```python
await ws.send(json.dumps({
    "ok": True,
    "message": f"Tab action {action} initiated"  # ❌ Not the actual result
}))
```

**Problem:** The test client receives a generic "initiated" message instead of the actual tab operation result (tab ID, URL, title, etc.). The extension sends proper responses via `sendSuccessResponse()`/`sendErrorResponse()`, but the server doesn't wait for them.

## Required Changes

### Step 1: Remove Duplicate Tab Handling

**Action:** Delete lines 3332-3365 (the entire `if action in tab_actions:` block)

**Why:** The smart dispatcher in `sw.js` handles tab capabilities correctly. All capabilities should go through the unified `execute_capability` path (lines 3372-3379), which sends:

```python
capability_command = {
    "type": "execute_capability",
    "action": action,
    "params": params
}
```

This format is what the service worker's `handleExecuteCapability()` expects and routes correctly.

### Step 2: Implement Proper Response Waiting

**Current code (lines 3372-3386):**
```python
if EXTENSION_WS:
    capability_command = {
        "type": "execute_capability",
        "action": action,
        "params": params
    }
    await EXTENSION_WS.send(json.dumps(capability_command))
    print(f"📤 Sent capability execution to extension: {action}")

    # For now, send immediate response
    # TODO: Wait for extension response in future
    await ws.send(json.dumps({
        "ok": True,
        "message": f"Capability {action} execution initiated"
    }))
```

**Required change:** Implement proper response waiting mechanism.

**Options:**

#### Option A: Simple Timeout-Based Wait (Recommended for now)
Wait for extension response with a timeout, then send result or timeout error:

```python
if EXTENSION_WS:
    capability_command = {
        "type": "execute_capability",
        "action": action,
        "params": params
    }
    
    # Generate unique request ID to match response
    request_id = f"cap_{action}_{int(time.time() * 1000)}"
    capability_command["id"] = request_id  # Add ID to request
    
    await EXTENSION_WS.send(json.dumps(capability_command))
    print(f"📤 Sent capability execution to extension: {action} (id: {request_id})")
    
    # Wait for response from extension (with timeout)
    try:
        # Wait for response message from extension WebSocket
        # Extension sends responses via sendToServer() which comes back through EXTENSION_WS
        response = await asyncio.wait_for(
            wait_for_extension_response(request_id),
            timeout=10.0
        )
        
        # Forward the actual response to client
        await ws.send(json.dumps(response))
        
    except asyncio.TimeoutError:
        await ws.send(json.dumps({
            "ok": False,
            "error": f"Timeout waiting for {action} response"
        }))
```

#### Option B: Use Existing Response Queue Pattern
If there's already a response queue/matching system in the codebase, use that pattern instead.

### Step 3: Handle Extension Response Messages

**Location:** Wherever `EXTENSION_WS` messages are received (likely in the `handler()` function or a message handler)

**Required:** Ensure that when the extension sends responses via `sendToServer()`, they are:
1. Matched to the original request by ID
2. Forwarded to the waiting client WebSocket

**Extension response format (from sw.js `sendSuccessResponse()`):**
```javascript
{
    id: "cap_SwitchTab_1234567890",
    ok: true,
    result: { tabId: 123, url: "...", title: "...", active: true },
    error: null
}
```

**Extension error format (from sw.js `sendErrorResponse()`):**
```javascript
{
    id: "cap_SwitchTab_1234567890",
    ok: false,
    result: null,
    error: { code: "MISSING_PARAM", msg: "tabId is required" }
}
```

**Implementation pattern:**
```python
# Store pending requests
pending_capability_requests = {}

# When sending capability request:
request_id = f"cap_{action}_{int(time.time() * 1000)}"
pending_capability_requests[request_id] = {
    "client_ws": ws,
    "action": action,
    "timestamp": time.time()
}

# When receiving message from extension:
if msg.get("id") and msg.get("id") in pending_capability_requests:
    request = pending_capability_requests.pop(msg.get("id"))
    await request["client_ws"].send(json.dumps(msg))
```

## Implementation Checklist

- [ ] **Remove duplicate tab handling** (lines 3332-3365)
- [ ] **Add request ID to capability_command** before sending to extension
- [ ] **Implement response waiting mechanism** (timeout-based or queue-based)
- [ ] **Handle extension response messages** and match to pending requests
- [ ] **Forward actual responses** to client instead of "initiated" messages
- [ ] **Handle timeout cases** gracefully
- [ ] **Test with tab capabilities** to verify responses contain actual tab data
- [ ] **Test with DOM capabilities** to ensure they still work

## Testing

After implementation, test:

```bash
# Should return actual tab info, not "initiated"
python3 test_navigation.py --command capability --capability SwitchTab --params '{"tabId": 1138024218}'

# Should return actual new tab info
python3 test_navigation.py --command capability --capability OpenTab --params '{"url": "https://google.com"}'

# Should still work (DOM capability)
python3 test_navigation.py --command capability --capability RetrieveTranscript
```

**Expected response format:**
```json
{
  "ok": true,
  "result": {
    "tabId": 1138024218,
    "url": "https://www.google.com",
    "title": "Google",
    "active": true
  },
  "error": null
}
```

## Key Principles

1. **Single Path:** All capabilities (tabs and DOM) should use the same `execute_capability` message format
2. **Smart Routing:** Let the service worker's smart dispatcher handle routing decisions
3. **Proper Responses:** Wait for and forward actual results, not just acknowledgements
4. **Backward Compatible:** DOM capabilities should continue working exactly as before

## Files to Modify

- `om_e_web_ws/ws_server.py` - Remove duplicate handling, implement response waiting

## Files NOT to Modify

- `web_extension/sw.js` - Smart dispatcher is correct, no changes needed
- `web_extension/content.js` - No changes needed
- `om_e_web_ws/test_navigation.py` - No changes needed

