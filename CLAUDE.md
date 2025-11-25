# CLAUDE.md

## Project Overview

**Om_E_Web** is a Chrome Extension (MV3) + Python WebSocket server that transforms web pages into LLM-actionable intelligence. The system scans DOM elements, generates structured artifacts (`page.jsonl`, `text.md`, `llm_actions.json`), and executes LLM instructions via WebSocket.

**Key differentiator:** Site-config-driven architecture—add new automation without modifying runtime code, just update `web_extension/site_configs.json`.

---

## Coding Philosophy

### Core Principles
- **Simple > Clever** — Clear, short code over abstract solutions
- **Comments everywhere** — File top, before functions, inside non-trivial logic
- **Config-driven** — Use JSON config when it simplifies behaviour
- **NO TIMERS** — Event-driven only. Use MutationObserver, IntersectionObserver, requestIdleCallback
- **Async everywhere** — JS: async/await; Python: asyncio & websockets
- **Australian English** — Tone: calm, direct, practical

### Workflow Rules
1. **Design first** — Discuss architecture, verify approach, wait for approval
2. **Create testable plan** — 3-6 steps, validated before coding
3. **Step-by-step** — Finish one step, show results, provide test instructions, wait for confirmation
4. **Scope tightly** — Don't refactor multiple subsystems without permission

### Hard Limits
| Standard | Limit |
|----------|-------|
| Function length | ≤100 lines |
| File length | ≤500 lines |
| Function params | ≤5 (use objects for more) |
| Nesting depth | ≤3 levels |
| Code duplication | 0 (extract to shared utility) |
| Type coverage | 100% (JSDoc for JS, type hints for Python) |

### What NOT to Do
- Don't remove OME-style comments
- Don't refactor across languages without confirming
- Don't produce verbose over-engineered code
- Don't use timers (setTimeout/setInterval) without explicit approval

---

## Architecture

### Two Execution Pipelines

**1. Standard Action-ID Pipeline (95% of cases)**
```
test_navigation.py → ws_server.py → sw.js → content.js
Message: {"type": "llm_instruction", "data": {"actionId": "a_id_123", "actionType": "click"}}
```

**2. Capability Pipeline (dynamic content)**
Bypasses action-ID registry, uses selector-based DOM scanning for lazy-loaded elements.
```
test_navigation.py → ws_server.py → sw.js → content.js → capabilityPipelineExecutor()
Message: {"type": "execute_capability", "action": "RetrieveTranscript", "params": {}}
```

### Message Flow
```
Client → ws_server.py (port 17892) → sw.js → content.js → DOM
```

**Key message types:**
- `llm_instruction` → standard action execution
- `execute_capability` → capability pipeline
- `intelligence_update` → artifact regeneration

---

## File Organization

**Extension (web_extension/):**
- `manifest.json` — MV3 config
- `sw.js` — Service worker (WebSocket bridge, tab management)
- `content.js` — Content script (DOM scan, action execution)
- `site_configs.json` — Per-domain scanning/capability config **(THE config file)**

**Server (om_e_web_ws/):**
- `ws_server.py` — Main WebSocket server (port 17892)
- `test_navigation.py` — CLI test harness
- `@site_structures/` — Auto-generated artifacts

**Artifacts (auto-generated):**
- `page.jsonl` — Ordered JSONL with meta, sections, text, actions
- `content.jsonl` — Cleaned content elements
- `text.md` — Human-readable transcript with frontmatter
- `llm_actions.json` — ActionId → metadata lookup

---

## Development Commands

```bash
# Start WebSocket server
python om_e_web_ws/ws_server.py

# Test action execution
python3 om_e_web_ws/test_navigation.py --action-id a_id_123 --action-type click

# Test capability pipeline
python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript

# Set value and submit
python3 om_e_web_ws/test_navigation.py --action-id a_id_0 --action-type setValue --value "query" --submit
```

**Extension:**
1. chrome://extensions/ → Enable Developer mode
2. Load unpacked → select `web_extension/` folder
3. After code changes: click reload button (no restart needed for site_configs.json changes)

---

## Site Config Pattern

**File:** `web_extension/site_configs.json`

```json
{
  "youtube.com": {
    "framework": "youtube",
    "selectors": { },
    "capabilities": {
      "transcript": {
        "action": "RetrieveTranscript",
        "label": "Get video transcript",
        "url_pattern": "/watch?v=",
        "selectors": [
          "button.specific-class[aria-label='Target']",
          "button[aria-label='Target']"
        ]
      }
    }
  }
}
```

**Adding new capabilities:** Edit site_configs.json only. Service worker broadcasts updates instantly.

### Config Access Pattern (CRITICAL)
```javascript
// ✅ CORRECT: Use local siteConfig first, fallback to window
const activeConfig = siteConfig || window.currentSiteConfig;

// ❌ WRONG: Only check window
const config = window.currentSiteConfig;
```

---

## Key Constraints

### Never Modify These (use site_configs.json instead):
- `content.js` (unless fixing bugs or adding generic features)
- `sw.js` (unless fixing bugs)
- `ws_server.py` (unless adding new message types)

### Content Script
- Main-frame only (exits if `window.top !== window.self`)
- Idle detection before scanning
- Action IDs are ephemeral (regenerated on every scan)

### Service Worker
- Persistent WebSocket to server (port 17892)
- Uses `ome_keep_alive` port to prevent suspension
- Auto-reinjects content script on tab changes

---

## Common Gotchas

1. **Service worker suspension** — Open a regular web page (not chrome://) to maintain keep-alive port

2. **Capability not finding element** — Check:
   - Page URL matches `url_pattern`
   - Element exists in DOM
   - Selectors match actual structure

3. **Config changes not taking effect** — Reload the tab to reinject content script

4. **Message timeout** — Default 10s; increase in test_navigation.py if needed

---

## Testing Workflow

1. `python om_e_web_ws/ws_server.py`
2. Load extension in Chrome
3. Navigate to target page, verify console shows "scan complete"
4. Check artifacts: `ls -lh om_e_web_ws/@site_structures/`
5. Test: `python3 om_e_web_ws/test_navigation.py --action-id <id> --action-type click`

---

## Key Functions

**content.js:**
- `capabilityPipelineExecutor(action, params)` — Selector-based execution
- `getSiteConfigDirect()` — Loads site config synchronously
- `IntelligenceEngine.executeAction(actionId, actionType, params)` — Standard pipeline

**ws_server.py:**
- `handler(websocket, path)` — Main WebSocket handler
- `save_intelligence_to_page_jsonl(data)` — Writes artifacts

---

## Additional Documentation

- `THIS_IS_HOW_IT_ALL_WORKS.md` — Complete system architecture
- `web_extension/README.md` — Extension details
- `om_e_web_ws/HowThisWorks.md` — Artifact generation
