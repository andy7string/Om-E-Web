# ListTabs & Capability Error Handling Plan

**Created:** 2025-12-28
**Status:** Ready for implementation
**Priority:** High - Core functionality broken

---

## Current Situation

### What Happened
During capability testing, we sent "what tabs do I have open?" to Om-E. The system took **13,001ms** and failed to respond properly.

### The Root Cause
Looking at `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/llm_unified.md`:

1. **LLM responded in 1393ms** (fast, no issue there)
2. **LLM output:** `{"action": "ListTabs"}`
3. **Problem:** `ListTabs` capability DOES NOT EXIST
4. **Result:** System tried to execute non-existent capability, timed out at 13 seconds

### Evidence from llm_unified.md
```
Capabilities:
- OpenTab: Opens a URL or switches to existing tab...
- SetNewTabURL: Sets the default URL for new tabs...

[No ListTabs capability available]

## Response
{"action": "ListTabs"}   <-- LLM hallucinated this
```

### The Irony
The tab info was ALREADY in the prompt context:
```
ENVIRONMENT (current state - use these for actions)
  Tabs (currently open):
    4. OM-E Web (127.0.0.1:8080) <- ACTIVE
```

The LLM should have just replied: `{"reply": "You've got one tab open - OM-E Web on localhost."}`

---

## Three Fixes Required

### Fix 1: Add ListTabs Capability
**Why:** Give the LLM a valid action to list tabs if it wants to
**Files:**
- `om_e_web_ws/data/vectors/system/capabilities/` (add to vector store)
- `om_e_web_ws/llm/orchestrator.py` (may need internal handler)
- `web_extension/sw.js` (if needs extension-side handler)

**Implementation:**
```python
# New capability definition
{
    "name": "ListTabs",
    "description": "Lists all currently open browser tabs. Returns tab names and URLs.",
    "example": '{"action": "ListTabs"}',
    "params": {},
    "internal": True  # Can be handled server-side from cached tab state
}
```

**Handler in ws_server.py or orchestrator.py:**
```python
if action == "ListTabs":
    # Return tabs from CURRENT_TABS or active_tab context
    tabs_info = get_tabs_with_stable_numbers()
    response = format_tabs_for_user(tabs_info)
    return OrchestratorResult(response_text=response, ...)
```

---

### Fix 2: Update System Prompt
**Why:** LLM should read ENVIRONMENT context for state questions instead of calling actions
**File:** `om_e_web_ws/data/prompts/chat_prompt.md` or wherever system prompt is built

**Add to system prompt:**
```
## Reading Current State
The ENVIRONMENT section contains LIVE state - tabs, chats, page info.
For questions like "what tabs are open?" or "which chat am I in?":
- READ the ENVIRONMENT section
- Reply with the info directly using {"reply": "..."}
- Do NOT call actions to fetch info that's already provided

Example:
User: "what tabs do I have open?"
ENVIRONMENT shows: Tabs: 1. YouTube, 2. Google
Response: {"reply": "You've got 2 tabs: YouTube and Google."}
```

**Location to add this:**
In `om_e_web_ws/llm/orchestrator.py` around line 200-300 where system prompt is built, or in the prompt template file.

---

### Fix 3: Unknown Action Error Handling
**Why:** When LLM returns an action that doesn't exist, system should gracefully handle it instead of timing out for 13 seconds
**Files:**
- `om_e_web_ws/ws_server.py` (main handler ~line 5940-6100)
- `om_e_web_ws/llm/orchestrator.py` (action routing)

**Current Flow (broken):**
```
LLM returns {"action": "ListTabs"}
  -> ws_server tries to route to capability
  -> No handler found
  -> Sends to extension?
  -> Extension doesn't know ListTabs
  -> Timeout after 10-13 seconds
  -> No response to user
```

**Fixed Flow:**
```
LLM returns {"action": "ListTabs"}
  -> Check if action exists in known capabilities
  -> If NOT found:
     -> Log warning: "Unknown action: ListTabs"
     -> Return friendly error to user: "I tried to do something I can't actually do. Let me try again..."
     -> Optionally: Re-prompt LLM with "That action doesn't exist, please reply conversationally"
```

**Implementation in ws_server.py:**
```python
# After parsing LLM response action
known_actions = get_all_capability_names()  # Get from capability registry
if orch_result.action_target and orch_result.action_target not in known_actions:
    print(f"⚠️ Unknown action attempted: {orch_result.action_target}")
    # Return error response instead of trying to execute
    response_text = f"Oops, I tried to use '{orch_result.action_target}' but that's not available. Let me help another way..."
    # Don't execute, just respond
```

---

## Files Summary

| File | Change |
|------|--------|
| `om_e_web_ws/data/vectors/system/capabilities/metadata.json` | Add ListTabs capability definition |
| `om_e_web_ws/llm/orchestrator.py` | Add ListTabs internal handler, update system prompt |
| `om_e_web_ws/ws_server.py` | Add unknown action error handling (~line 5940) |
| `om_e_web_ws/data/prompts/chat_prompt.md` | Add "Reading Current State" section (if separate file) |

---

## Implementation Order

1. **Fix 3 first** - Unknown action handling (prevents 13s timeouts, quick win)
2. **Fix 2 second** - System prompt update (teaches LLM to read context)
3. **Fix 1 last** - Add ListTabs capability (belt and suspenders)

---

## Testing After Implementation

```bash
# Start server
python om_e_web_ws/ws_server.py

# Watch for timing output:
# ⏱️ [TIMING] === TOTAL: Xms (llm_ms=Y, overhead=Zms) ===
```

**Test messages:**
1. "what tabs do I have open?" - Should reply from context, NOT call ListTabs
2. "hello" - Should reply conversationally, NOT call RenameChat
3. "open youtube" - Should call OpenTab correctly
4. "switch to chat 3" - Should call SetCurrentChat correctly
5. "foobar123xyz" (nonsense action test) - Should gracefully error, not timeout

---

## Related Issues Found During Testing

1. **RenameChat over-matching** - "hello test 1" triggered RenameChat incorrectly
   - RAG capability matching too aggressive
   - May need to increase `cap_score_threshold` in `llm_config.json` (currently 0.6)

2. **Input concatenation bug** - Text appended to existing input instead of replacing
   - Frontend issue in `hud.js` input handling

3. **Timer showing 13001ms** - This was the timeout, not actual processing time
   - The `llm_ms` was 1393ms (correct)
   - Overhead was the failed capability execution timeout

---

## Context for Tomorrow

### Where the code is:
- **Orchestrator:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/llm/orchestrator.py`
- **WS Server:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/ws_server.py`
- **Capabilities:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/data/vectors/system/capabilities/`
- **LLM Config:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/data/llm_config.json`
- **Debug output:** `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/llm_unified.md`

### Timing instrumentation added:
We added timing checkpoints in ws_server.py:
```
⏱️ [TIMING] preprocess_message: Xms
⏱️ [TIMING] AppendMessage: Xms
⏱️ [TIMING] Orchestrator total: Xms (llm_ms=Y)
⏱️ [TIMING] load+save chat: Xms
⏱️ [TIMING] rolling_summary: Xms
⏱️ [TIMING] === TOTAL: Xms (llm_ms=Y, overhead=Zms) ===
```

### What was working:
- LLM calls are fast (~1200-1500ms)
- Token counting works (1254 in / 12 out displayed)
- Timer display works
- Chat switching works
- Rename works (mostly)

### What's broken:
- Unknown actions cause 13s timeout
- LLM doesn't read ENVIRONMENT context for state questions
- No ListTabs capability exists
- Capability RAG matching sometimes picks wrong action

---

## Quick Start Tomorrow

```bash
# 1. Read this plan
cat listtabsplan.md

# 2. Start with Fix 3 (unknown action handling)
# Open ws_server.py around line 5940
# Add the unknown action check before capability execution

# 3. Test
python om_e_web_ws/ws_server.py
# Send "what tabs are open?" - should fail gracefully now instead of timeout

# 4. Then do Fix 2 (system prompt)
# 5. Then do Fix 1 (add ListTabs)
```

---

**End of Plan**
