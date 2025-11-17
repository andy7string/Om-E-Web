# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Om_E_Web** is a Chrome Extension (MV3) + Python WebSocket server that transforms web pages into LLM-actionable intelligence. The system scans DOM elements, generates structured artifacts (`page.jsonl`, `llm_actions.json`, `llm_prompt.md`), and executes LLM instructions via a bidirectional WebSocket pipeline.

**Key differentiator:** Site-config-driven architecture allows adding new automation capabilities without modifying runtime code—just update `web_extension/site_configs.json`.

## Architecture: Two Execution Pipelines

### 1. Standard Action-ID Pipeline (95% of cases)
Extension scans page → registers elements with `a_id_XXX` → generates artifacts → LLM reads artifacts → sends `execute_llm_action` with actionId

**Flow:**
```
test_navigation.py → ws_server.py → sw.js → content.js
Message: {"type": "llm_instruction", "data": {"actionId": "a_id_123", "actionType": "click"}}
```

### 2. Capability Pipeline (edge cases, dynamic content)
Bypasses action-ID registry, uses pure selector-based DOM scanning for lazy-loaded/modal elements

**Flow:**
```
test_navigation.py → ws_server.py → sw.js → content.js → capabilityPipelineExecutor()
Message: {"type": "execute_capability", "action": "RetrieveTranscript", "params": {}}
```

**Key functions:**
- `ws_server.py` line 3105-3129: Routes `execute_capability` to extension
- `sw.js` line 1442-1476: `handleExecuteCapability()` forwards to content script
- `content.js` line 10073-10226: `capabilityPipelineExecutor()` performs selector-based search

## Development Commands

### Running the System
```bash
# Start WebSocket server (required for all operations)
python om_e_web_ws/ws_server.py

# Test standard action execution
python3 om_e_web_ws/test_navigation.py --action-id a_id_123 --action-type click

# Test capability pipeline (dynamic element discovery)
python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript

# Set value and submit form
python3 om_e_web_ws/test_navigation.py --action-id a_id_0 --action-type setValue --value "search query" --submit
```

### Artifact Generation
```bash
# One-time generation of LLM-optimized snapshot
node om_e_web_ws/tools/create_llm_structure.js \
  om_e_web_ws/@site_structures/page.jsonl \
  om_e_web_ws/@site_structures/text.md \
  om_e_web_ws/@site_structures/llm_optimized.json

# Watch mode (auto-regenerate on file changes)
node om_e_web_ws/tools/watch_llm_structure.js
```

### Extension Development
```bash
# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select web_extension/ folder

# After code changes: click extension reload button in chrome://extensions/
# No restart needed for site_configs.json changes (service worker broadcasts instantly)
```

## Critical Architecture Concepts

### Site Config Contract
**File:** `web_extension/site_configs.json`

Each domain defines scanning behavior and capabilities without touching runtime code:

```json
{
  "youtube.com": {
    "framework": "youtube",
    "selectors": { /* DOM scan priorities */ },
    "focus_targets": [ /* auto-focus elements */ ],
    "capabilities": {
      "transcript": {
        "action": "RetrieveTranscript",
        "selectors": [ /* ordered priority: specific → generic */ ]
      }
    }
  }
}
```

**Adding new capabilities:** Edit site_configs.json only. Service worker broadcasts updates to all tabs instantly.

### Config Access Pattern (CRITICAL)
When accessing site config in `content.js`, always use the same pattern as the intelligence engine:

```javascript
// ✅ CORRECT: Use local siteConfig first, fallback to window
const activeConfig = siteConfig || window.currentSiteConfig;

// ❌ WRONG: Only check window (may be undefined)
const config = window.currentSiteConfig;
```

See `content.js` lines 5168-5170 (intelligence engine) and 10083-10084 (capability executor) for reference.

### Message Routing
All external commands flow through the same WebSocket pipeline:

```
Client → ws_server.py (port 17892) → sw.js (handleServerMessage) → content.js
```

**Key message types:**
- `llm_instruction` → standard action execution
- `execute_capability` → capability pipeline
- `intelligence_update` → artifact regeneration trigger
- `dom_content_changed` → real-time DOM change notifications

### Artifact Files (generated under `om_e_web_ws/@site_structures/`)

**Core artifacts (auto-generated on page updates):**
- `page.jsonl` — Ordered JSONL with meta, sections, text, actions
- `content.jsonl` — Cleaned headings, paragraphs, lists, images
- `text.md` — Human-readable transcript with frontmatter
- `llm_actions.json` — ActionId → metadata lookup (selectors, type, description)
- `llm_prompt.md` — Compact prompt with `return (a_id_X)` instructions
- `transcripts/*.md` — Long-form transcripts (e.g., YouTube) with signature-based deduplication

**LLM-optimized (manually generated):**
- `llm_optimized.json` — Compressed snapshot with markdown + packed action table

## Common Patterns

### Adding a New Capability
1. Edit `web_extension/site_configs.json`:
```json
"capabilities": {
  "myFeature": {
    "action": "ExecuteMyFeature",
    "label": "Human description",
    "url_pattern": "/specific/path",  // optional
    "selectors": [
      "button.specific-class[aria-label='Target']",
      "button[aria-label='Target']",  // fallback
      "button[aria-label*='target' i]"  // case-insensitive contains
    ]
  }
}
```

2. Test immediately (no extension reload needed):
```bash
python3 om_e_web_ws/test_navigation.py --command capability --capability ExecuteMyFeature
```

3. Capability executor will:
   - Look up action in site config
   - Try selectors in order (specific → generic)
   - Wait up to 5s for lazy-loaded elements
   - Click matched element
   - Trigger intelligence update

### Debugging Action Execution
```javascript
// In Chrome console on target page:

// Check config loaded
console.log("Config:", siteConfig || window.currentSiteConfig);

// Check actionable elements registered
console.log("Actions:", intelligenceEngine?.actionableElements);

// Manual capability test
document.querySelector('button[aria-label="Show transcript"]')?.click();
```

### Extending ws_server.py Message Handlers
Add new message type in `handler()` function around line 3105:
```python
if msg.get("type") == "my_new_command":
    # Handle command
    if EXTENSION_WS:
        await EXTENSION_WS.send(json.dumps({
            "type": "my_extension_message",
            "data": msg.get("data")
        }))
```

Then add corresponding handler in `sw.js` `handleServerMessage()` (line 621-669) and `content.js` onMessage listener (line 10229+).

## File Organization

**Extension (web_extension/):**
- `manifest.json` — MV3 config, permissions, web_accessible_resources
- `sw.js` — Service worker (WebSocket bridge, tab management, keep-alive)
- `content.js` — Content script (DOM operations, intelligence engine, action execution)
- `site_configs.json` — Per-domain scanning/capability config (THE configuration file)
- `popup.html/js` — Extension UI for status monitoring

**Server (om_e_web_ws/):**
- `ws_server.py` — Main WebSocket server (port 17892)
- `test_navigation.py` — CLI test harness for action execution
- `@site_structures/` — Auto-generated artifacts directory
- `tools/` — Artifact transformation utilities

**Documentation:**
- `THIS_IS_HOW_IT_ALL_WORKS.md` — Complete system architecture (READ THIS FIRST)
- `web_extension/README.md` — Extension-specific documentation
- `om_e_web_ws/HowThisWorks.md` — Data flow and artifact generation

## Important Constraints

### Never Modify These Runtime Files (use site_configs.json instead):
- `web_extension/content.js` (unless fixing bugs or adding generic features)
- `web_extension/sw.js` (unless fixing bugs)
- `om_e_web_ws/ws_server.py` (unless adding new message types)

### Config Loading Timing
- Site config loads synchronously via `getSiteConfigDirect()` on content script injection (line 886)
- Uses XHR to read `chrome.runtime.getURL('site_configs.json')`
- Domain matching: exact match → partial match → default fallback
- Always check `siteConfig || window.currentSiteConfig` (see Config Access Pattern above)

### Message Format Consistency
When adding new test_navigation.py commands, update `send_command()` (line 65-101) to format message correctly:
```python
elif command == "my_new_command":
    message = {
        "type": "my_new_command",
        # Flatten data structure appropriately
        "field1": data.get("field1"),
        "field2": data.get("field2")
    }
```

## Testing Workflow

1. Start server: `python om_e_web_ws/ws_server.py`
2. Load extension in Chrome
3. Navigate to target page, verify console shows "scan complete"
4. Check artifacts written: `ls -lh om_e_web_ws/@site_structures/`
5. Test action: `python3 om_e_web_ws/test_navigation.py --action-id <id> --action-type click`
6. For capability: `python3 om_e_web_ws/test_navigation.py --command capability --capability <action>`

## Reference: Key Function Signatures

**content.js:**
```javascript
async function capabilityPipelineExecutor(capabilityAction, params)
// Returns: {success: bool, message: str, elementFound: str, matchedBy: str}

function getSiteConfigDirect()
// Returns: siteConfig object or null

IntelligenceEngine.prototype.executeAction(actionId, actionType, params)
// Executes standard action-ID pipeline
```

**ws_server.py:**
```python
async def handler(websocket, path)
# Main WebSocket handler

async def handle_llm_instruction(data, client)
# Routes llm_instruction messages to extension

async def save_intelligence_to_page_jsonl(intelligence_data)
# Persists artifacts to @site_structures/
```

**test_navigation.py:**
```python
async def send_command(self, command, data=None)
# Formats and sends WebSocket messages
# command: "llm", "capability", "navigate", "click"
# data: {"action": str, "params": dict} or {"actionId": str, ...}
```

## Common Gotchas

1. **Service worker suspension:** MV3 service workers are event-driven and will suspend. The extension uses a keep-alive port (`ome_keep_alive`) to maintain WebSocket connection. If all tabs are `chrome://` pages, the port cannot be created—open a regular web page.

2. **Capability not finding element:** Check Console logs show "Element not found after trying all selectors". Verify:
   - Page is on correct URL (check `url_pattern` in site config)
   - Element exists in DOM (not just visually hidden)
   - Selectors match actual element structure (inspect in DevTools)

3. **Action ID collision:** Elements preserve their IDs across rescans, but if DOM structure changes significantly, IDs may shift. Regenerate `llm_optimized.json` after major page changes.

4. **Message timeout:** Default timeout is 10s. For slow operations, increase timeout in test_navigation.py line 108 or handle async responses differently.

5. **Config changes not taking effect:** Site configs broadcast instantly to tabs, but content.js only loads config on injection. If config seems stale, reload the tab to reinject content script.

## For More Details

- Complete architecture: `THIS_IS_HOW_IT_ALL_WORKS.md`
- Capability pipeline deep dive: Section 6 of `THIS_IS_HOW_IT_ALL_WORKS.md`
- Artifact formats: `om_e_web_ws/HowThisWorks.md`
- Extension internals: `web_extension/README.md`
