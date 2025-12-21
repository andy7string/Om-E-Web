# Om_E_Web - Complete System Architecture

**Version:** 1.1
**Last Updated:** 2025-12-21
**System:** Chrome Extension (MV3) + Python WebSocket Server + LLM Intelligence Pipeline

---

## Executive Summary

**Om_E_Web** is a sophisticated browser automation and LLM intelligence system that transforms web pages into actionable data for AI agents. The system operates through a Chrome extension that scans DOM elements in real-time, generates structured artifacts (JSONL, Markdown), and executes LLM-driven instructions via WebSocket communication.

### What It Does

1. **Intelligent DOM scanning** - Identifies interactive elements and semantic content without manual selector definitions
2. **Real-time artifact generation** - Creates LLM-consumable page.jsonl, text.md, and action registries
3. **Bidirectional command execution** - External clients send commands via WebSocket → Extension executes on DOM → Results return
4. **Site-config-driven behavior** - Add new site-specific automation by editing JSON configs, no code changes needed
5. **Cross-origin iframe support** - Scans and reports elements from embedded iframes (e.g., payment forms)
6. **Floating HUD interface** - Draggable orb with ChatGPT-style overlay for direct LLM conversation

### Key Differentiators

- **Config-driven architecture** - Add YouTube transcript retrieval, ChatGPT automation by editing site_configs.json
- **Selector-based action resolution** - Actions survive DOM re-renders via CSS selector hints
- **Progressive iframe output** - Main frame sent immediately, iframes separately (no blocking)
- **Event-driven design** - No timers (except debouncing), uses MutationObserver and IntersectionObserver
- **Shadow DOM UI isolation** - HUD interface has zero CSS conflicts with host pages

---

## System Overview Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           Om_E_Web System Architecture                         │
└───────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  Test Client    │         │  Web Dashboard  │         │  Orb Page       │
│  (Python CLI)   │         │  (Browser UI)   │         │  (http://8080)  │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                                     ▼
                         ┌────────────────────────┐
                         │   ws_server.py         │
                         │   (port 17892)         │
                         │   ─────────────        │
                         │   - Message routing    │
                         │   - Artifact generation│
                         │   - LLM agent          │
                         │   - Chat persistence   │
                         │   - Capability routing │
                         └────────┬───────────────┘
                                  │ WebSocket
                                  │
                         ┌────────▼───────────────┐
                         │   Service Worker       │
                         │   (sw.js)              │
                         │   ─────────────        │
                         │   - Message broker     │
                         │   - Tab management     │
                         │   - Keep-alive         │
                         │   - Iframe merging     │
                         │   - State persistence  │
                         └────────┬───────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
            ┌───────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
            │ Content      │ │ HUD    │ │ Popup      │
            │ Script       │ │ (UI)   │ │ (Settings) │
            │ (content.js) │ │(hud.js)│ │            │
            │ ────────     │ │────────│ │            │
            │ - DOM scan   │ │- Orb   │ │            │
            │ - Intelligence│ │- Chat  │ │            │
            │ - Actions    │ │- Themes│ │            │
            │ - Capability │ │        │ │            │
            └───────┬──────┘ └────────┘ └────────────┘
                    │
                    ▼
            ┌───────────────┐
            │   DOM / Page  │
            │   (Web Site)  │
            └───────────────┘
```

---

## Component Summary

| Component | File | Lines | Primary Responsibilities | Key Functions |
|-----------|------|-------|-------------------------|---------------|
| **Service Worker** | `/web_extension/sw.js` | ~2,540 | WebSocket bridge, tab management, scan orchestration, keep-alive, iframe merging, state persistence | `handler()`, `connectWebSocket()`, `requestScan()`, `mergeIframeIntelligence()` + 50+ handlers |
| **Content Script** | `/web_extension/content.js` | ~11,045 | DOM scanning, action registration, intelligence extraction, command execution, capability pipeline, HUD coordination | `executeScanWithSettle()`, `prepareIntelligenceData()`, `capabilityPipelineExecutor()`, `universalClick()` + 100+ functions |
| **WebSocket Server** | `/om_e_web_ws/ws_server.py` | ~2,124 | Messaging hub, artifact generation, chat persistence, LLM integration, transcript deduplication, capability routing | `handler()`, `save_intelligence_to_page_jsonl()`, `save_transcripts()`, `write_text_md()` + 80+ functions |
| **HUD Interface** | `/web_extension/hud.js` | ~7,023 | Floating orb UI, full-screen overlay, chat with LLM, Shadow DOM isolation, theme system, state persistence | `initHUD()`, `createOrb()`, `createHUD()`, `toggleHUD()`, `sendLLMChat()` + 120+ functions |

**Total:** ~22,732 lines of code

---

## Cross-Component Flows

See `/Users/andy7string/Projects/Om_E_Web/SYSTEM_ARCHITECTURE_COMPLETE.md` for detailed end-to-end flows covering:

1. **User Chat Flow** - User types → HUD → SW → WS Server → LLM → Response displayed
2. **Action Execution Flow** - Test client → WS Server → SW → Content → DOM → Response back  
3. **Capability Execution Flow** - Command → routing decision → execution → response
4. **Intelligence Gathering Flow** - Page load → scan → artifacts generated
5. **Iframe Intelligence Flow** - Progressive reporting → merging → final IDs
6. **Tab/Navigation Flow** - User navigates → Chrome events → scan orchestration
7. **Theme Synchronization** - Theme change → broadcast to all tabs + server + dashboards

---

## Message Protocol (60+ types)

**Categories:**
- Heartbeat & Connection (ping, pong, bridge_status, identify)
- Intelligence & Data (intelligence_update, iframe_elements_update, tabs_info)
- Action Execution (llm_instruction, execute_action, execute_action_with_hints, execute_react_submit)
- Capability Execution (execute_capability, capability_result)
- Scan Control (start_scan, request_scan, scan_complete)
- DOM & Network (dom_changed, network_activity)
- HUD & Orb UI (toggle_hud, set_orb_theme, get_orb_state, set_orb_state)
- State Sync (sync_orb_position, sync_orb_theme, sync_chat_visible)
- HUD Actions (hud_action with 15+ subtypes)
- Command Forwarding (command with routing)
- Iframe Management (iframe_intelligence, update_iframe_ids)
- LLM & Config (get_llm_config, set_llm_config)

See individual component docs (01_sw.md, 02_content.md, 03_ws_server.md, 04_hud.md) for complete message tables.

---

## Data/Artifact Flow

**Artifacts Generated:**
- `@site_structures/page.jsonl` - Normalized records (meta, sections, text, actions)
- `@site_structures/content.jsonl` - Content structure (headings, paragraphs, lists, images, tables)
- `@site_structures/text.md` - Human+LLM readable with frontmatter, tabs, capabilities, action hints
- `@site_structures/text.json` - Action hints (label, type, selectors) for resolution
- `@site_structures/transcripts/*.md` - Video transcripts with deduplication
- `@site_structures/transcripts/video_history.jsonl` - Append-only transcript history
- `data/chats/*.json` - Chat conversation files
- `data/llm_config.json` - LLM configuration

---

## State Management

**Service Worker State:**
- Connection (ws, isConnected)
- Tab tracking (tabState, internalTabState, lastActiveTabId)
- Scan coordination (scanInProgress, iframeIntelligenceCache)
- Orb state (theme, position, chatVisible, chatInput, chatPanelSize, sidebarOpen, activeChatId)

**Content Script State:**
- Scan control (scanInProgress, initialScanScheduled)
- Intelligence (intelligenceEngine, pageContext)
- Site config (siteConfig, window.currentSiteConfig)

**WebSocket Server State:**
- Page intelligence (CURRENT_PAGE_DATA, CURRENT_CONTENT_DATA, LAST_TEXT_MD_DATA)
- Element registry (ELEMENT_REGISTRY: actionId → {type, tag, label, selectors})
- Chat (CURRENT_CHAT_ID, CHAT_INDEX_CACHE, LLM_AGENT)

**HUD State:**
- UI (host, shadow, orb, hud, chatPanel, sidebar, visible, chatVisible, sidebarOpen)
- Interaction (dragging, theme, panelManuallyResized, hudTextZoom)
- Chat (currentChatId, messages, hasMoreMessages, totalMessages)

**Persistence:**
- chrome.storage.local: omeOrbStyle, chatPanelSize, activeChatId, siteConfigs
- Service worker memory: orbState, tabState, iframeIntelligenceCache
- Filesystem: All artifacts, chats, configs
- Ephemeral: Action IDs (data-ome-action-id), element registry

---

## Key Architectural Patterns

### 1. Config-Driven Behavior
Site-specific automation in JSON (site_configs.json). Add new capabilities without code changes.

### 2. Event-Driven (No Timers)
Uses MutationObserver, IntersectionObserver, requestIdleCallback. Timers only for debouncing and timeouts.

### 3. Progressive Output (Iframes)
Main frame sent immediately (<500ms), iframes separately (100-500ms later), timeout (5s) ensures partial results.

### 4. Selector-Based Action Resolution
Stores CSS selectors instead of element references. Re-queries DOM on execution. Survives SPA re-renders.

### 5. Shadow DOM Isolation (HUD)
All UI in closed Shadow DOM. Zero CSS conflicts with host pages.

### 6. React Input Submit via chrome.scripting.executeScript

**Problem:** React apps (LinkedIn, Facebook) ignore synthetic keyboard events from content scripts. The content script runs in an isolated JavaScript world and cannot access React's internal props (`__reactProps$xxx`) to call handlers directly. Additionally, CSP (Content Security Policy) blocks inline script injection.

**Solution:** Use `chrome.scripting.executeScript` with `world: 'MAIN'` from the service worker. This privileged extension API:
1. Bypasses CSP restrictions
2. Executes code in the page's main JavaScript world (not isolated)
3. Can access React's internal props and call handlers directly

**Config-Driven:** Site configs use `injectReactEnter: true` flag in `inputPatterns`:
```json
"inputPatterns": {
  "jobSearch": {
    "container": "[componentkey='jobSearchBox']",
    "injectReactEnter": true,
    "_comment": "React ignores synthetic Enter - uses SW chrome.scripting"
  }
}
```

**Message Flow:**
```
Content Script (detects injectReactEnter)
    ↓
chrome.runtime.sendMessage({type: 'execute_react_submit', selector, value})
    ↓
Service Worker (handleExecuteReactSubmit)
    ↓
chrome.scripting.executeScript({world: 'MAIN', func: (sel, val) => {
    const el = document.querySelector(sel);
    const props = el[Object.keys(el).find(k => k.startsWith('__reactProps'))];
    props.onChange({target: {value: val}, ...});  // Set value
    props.onKeyDown(mockEnterEvent);              // Submit
}})
    ↓
Page MAIN World (has access to React internals)
    ↓
React handlers execute → Form submits
```

**Key Files:**
- `site_configs/linkedin.json` - Config with `injectReactEnter: true`
- `content.js:8601-8627` - Detects flag, sends message to SW
- `sw.js:2566-2648` - `handleExecuteReactSubmit()` function

**Use Cases:**
- LinkedIn job search input
- LinkedIn global search (feed page)
- Any React app where synthetic events don't work

### 7. Accessibility Tree (AT) Execution via CDP

**Overview:** Alternative to DOM-based scanning that uses Chrome's Accessibility Tree for element identification and CDP (Chrome DevTools Protocol) for execution. Same pattern as Claude's browser extension.

**Scan Modes:**
- `dom` - Traditional DOM TreeWalker scanning with CSS selectors (default for legacy)
- `at` - Accessibility Tree scanning with role+name identification

**Config Persistence:**

The scan mode is persisted in `data/llm_config.json`:
```json
{
  "extension": {
    "scan_mode": "at"
  }
}
```

**State Locations:**
- Server: `CURRENT_SCAN_MODE` global variable (loaded from config on startup)
- Extension: `orbState.scanMode` (synced via `chrome.storage.local.omeScanMode`)

**AT Scan Output Format (`@site_structures/AT_text.md`):**
```markdown
# YouTube

**URL:** https://www.youtube.com/...
**Scan Type:** Accessibility Tree

---

RootWebArea: "YouTube" (focused)
  banner
    search
      [0] button: "Search" → {"act":0}
      [1] combobox: "Search" → {"act":1,"value":"...","submit":true}
  main
    [6] link: "Video Title 10 minutes" → {"act":6}
```

Elements are identified by `[N] role: "name"` format with action metadata.

**Execution Flow:**

```
1. LLM reads AT output: [6] link: "Video Title"
2. LLM sends command with role+name:
   {
     type: "llm_instruction",
     data: {
       actionId: "6",
       actionType: "click",
       params: { role: "link", name: "Video Title" }
     }
   }

3. ws_server.py receives message:
   - Checks CURRENT_SCAN_MODE == 'at'
   - Skips hint resolution (DOM-only)
   - Forwards as execute_llm_action with params

4. sw.js handleExecuteLLMAction():
   - Checks orbState.scanMode === 'at'
   - Extracts role+name from params
   - Calls findATElementByDefinition(tabId, role, name)
     → Queries LIVE AT tree via CDP Accessibility.getFullAXTree
     → Finds node matching role+name
     → Returns fresh backendNodeId

5. executeATClick(tabId, backendNodeId):
   - chrome.debugger.attach(tabId)
   - DOM.getBoxModel(backendNodeId) → get x,y coordinates
   - Input.dispatchMouseEvent(mousePressed, x, y)
   - Input.dispatchMouseEvent(mouseReleased, x, y)
   - chrome.debugger.detach()
```

**Key Principle:** No cached element references. Fresh AT tree query at execution time using role+name. Elements are identified by their accessibility properties, not DOM attributes.

**Key Files & Functions:**

| File | Function | Purpose |
|------|----------|---------|
| `ws_server.py:140` | `CURRENT_SCAN_MODE` | Global scan mode state |
| `ws_server.py:8567-8593` | `main()` | Loads scan_mode from config on startup |
| `ws_server.py:6188-6199` | `llm_instruction` handler | Routes to AT path when mode='at' |
| `sw.js:65` | `orbState.scanMode` | Extension scan mode state |
| `sw.js:471-513` | `findATElementByDefinition()` | Queries AT tree by role+name |
| `sw.js:517-564` | `executeATClick()` | CDP click via coordinates |
| `sw.js:573-670` | `executeATSetValue()` | CDP focus + type text |
| `sw.js:3159-3260` | `handleExecuteLLMAction()` | Routes click/setValue based on scan mode |
| `at_scanner.js` | `scanAccessibilityTree()` | Scans AT and generates output |

**Changing Scan Mode:**

```bash
# Via WebSocket message
python3 -c "
import asyncio, websockets, json
async def set_mode():
    async with websockets.connect('ws://localhost:17892') as ws:
        await ws.send(json.dumps({'type': 'set_scan_mode', 'mode': 'at'}))
        print(await ws.recv())
asyncio.run(set_mode())
"

# Or via extension popup toggle
```

Mode changes:
1. Persist to `llm_config.json`
2. Update `CURRENT_SCAN_MODE` on server
3. Send to extension → updates `orbState.scanMode`
4. Save to `chrome.storage.local.omeScanMode`

**Testing AT Execution:**

```bash
# Click element by role+name
python3 om_e_web_ws/test_navigation.py \
  --action-id 6 \
  --action-type click \
  --params '{"role": "link", "name": "Video Title"}'

# Set value with submit
python3 om_e_web_ws/test_navigation.py \
  --action-id 1 \
  --action-type setValue \
  --value "search query" \
  --submit \
  --params '{"role": "combobox", "name": "Search"}'
```

**AT vs DOM Comparison:**

| Aspect | DOM Mode | AT Mode |
|--------|----------|---------|
| Scan method | TreeWalker + CSS selectors | CDP Accessibility.getFullAXTree |
| Element ID | CSS selector hints | role + name |
| Execution | querySelector → element.click() | CDP backendNodeId → Input events |
| Stale elements | Re-query via selectors | Re-query AT tree by role+name |
| Output file | `text.md` with selectors | `AT_text.md` with role+name |
| Best for | Complex DOM, SPAs | Screen reader compatible sites |

**Same Pattern as Claude Extension:** This implementation mirrors how Claude's browser extension works - scan AT tree, identify by role+name, fresh lookup at execution time, CDP events for interaction.

### 8. AT Capability Pipeline (Hybrid AT + Selector Execution)

**Problem:** Some web elements (ProseMirror, Lexical contenteditables like ChatGPT, Facebook Messenger) don't work reliably with pure CDP setValue. The AT tree identifies them correctly, but CDP text input fails because these frameworks intercept and manage text input internally.

**Solution:** AT mode checks for domain-specific capabilities defined in `site_configs/*.json`. When a capability exists for the domain, it's:
1. Included in the AT scan output (`AT_text.md`) with full usage documentation
2. Routed through the content.js selector pipeline for execution (same as DOM mode)

**How It Works:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AT Capability Pipeline Flow                               │
└─────────────────────────────────────────────────────────────────────────────┘

1. SCAN PHASE (sw.js executeATScan):
   - Load site configs from JSON files (loadSiteConfigsFromFiles)
   - Lookup domain config: siteConfigs['chatgpt.com']
   - Pass capabilities to AT formatter

2. OUTPUT PHASE (at_scanner.js formatTreeAsMarkdown):
   - Include **Available Capabilities:** section in AT_text.md
   - Show action name, description, params, and usage example

3. EXECUTION PHASE:
   LLM reads AT_text.md:
   ┌──────────────────────────────────────────────────────────┐
   │ **Available Capabilities:**                              │
   │                                                          │
   │ ### `SetInputValue`                                      │
   │ Type into the ChatGPT prompt input (ProseMirror)...      │
   │ **Params:**                                              │
   │ - `value`: string (the text to type)                     │
   │ - `submit`: boolean (optional)                           │
   │ **Usage:**                                               │
   │ ```json                                                  │
   │ {"type": "execute_capability", "action": "SetInputValue",│
   │  "params": {"value": "Hello", "submit": true}}           │
   │ ```                                                      │
   └──────────────────────────────────────────────────────────┘

   LLM sends execute_capability command
        ↓
   ws_server.py forwards to extension
        ↓
   sw.js routes to content.js (execute_action_with_hints)
        ↓
   content.js finds element via CSS selectors from capability config
        ↓
   content.js executes setValue using DOM methods (works on ProseMirror!)
```

**Site Config Capability Format:**

```json
// site_configs/chatgpt.json
{
  "framework": "chatgpt",
  "capabilities": {
    "setInput": {
      "action": "SetInputValue",
      "label": "Set ChatGPT prompt text",
      "description": "Type into the ChatGPT prompt input (ProseMirror contenteditable). Use this capability instead of direct AT textbox setValue.",
      "url_pattern": "chatgpt.com",
      "params": {
        "value": "string (the text to type)",
        "submit": "boolean (optional, send message after typing)"
      },
      "usage": "{\"type\": \"execute_capability\", \"action\": \"SetInputValue\", \"params\": {\"value\": \"Hello\", \"submit\": true}}",
      "selectors": [
        "#prompt-textarea",
        "div.ProseMirror[contenteditable='true']",
        "div[contenteditable='true'][data-placeholder]"
      ],
      "submitMethod": "enter",
      "autoSubmit": true
    }
  }
}
```

**Key Fields:**
- `action`: Capability action name (used in execute_capability command)
- `description`: LLM-readable explanation of what it does
- `params`: Parameter documentation for the LLM
- `usage`: JSON example the LLM can copy/modify
- `selectors`: CSS selectors used by content.js to find the element
- `submitMethod`: How to submit ("enter", "click", "enter_then_click")

**Testing AT Capabilities:**

```bash
# Execute capability (routes through selector pipeline)
python3 om_e_web_ws/test_navigation.py \
  --command capability \
  --capability SetInputValue \
  --params '{"value": "Hello from capability", "submit": true}'

# Response shows selector-based execution:
# {"ok": true, "result": {"elementFound": "#prompt-textarea", "matchedBy": "selector"}}
```

**When to Use:**
- ChatGPT (ProseMirror contenteditable)
- Facebook Messenger (Lexical contenteditable)
- Any site where CDP setValue fails but DOM methods work
- Sites with complex input frameworks that ignore synthetic events

**Key Files:**

| File | Function | Purpose |
|------|----------|---------|
| `sw.js:311-358` | `loadSiteConfigsFromFiles()` | Load site configs from JSON files |
| `sw.js:775-778` | AT scan capability check | Ensure configs loaded before scan |
| `sw.js:790-796` | `configWithViewport` | Pass capabilities to AT formatter |
| `at_scanner.js:667-690` | Capability output | Format capabilities in markdown |
| `site_configs/*.json` | Capability definitions | Per-domain capability configs |
| `content.js` | Selector execution | Execute via hints pipeline |

**AT Mode Decision Tree:**

```
AT Scan Complete
      ↓
Does domain have capabilities in site config?
      ├── YES → Include in AT_text.md with usage docs
      │         LLM can use execute_capability for complex inputs
      │
      └── NO → Standard AT elements only
               LLM uses llm_instruction with role+name

Execution Request
      ↓
Is it execute_capability?
      ├── YES → Route through content.js selector pipeline
      │         (Works for ProseMirror, Lexical, etc.)
      │
      └── NO → Standard AT execution via CDP
               (Works for native inputs, buttons, links)
```

---

## Known Issues & Technical Debt

**Service Worker Bugs:**
- Undeclared variable: actionInProgress
- Undefined functions: proactivelySendSiteConfig(), getCurrentActiveTabId()
- Missing initialization: loadSiteConfigsFromStorage()

**Content Script Issues:**
- Disabled code (DOM mutation rescans, network idle rescans)
- Unused typing preview element
- Deprecated functions (stopSignificantChangeDetector, removeOverlays)

**WebSocket Server:**
- No critical bugs (extensive error handling)

**HUD:**
- Focus stealing (userBlurRequested flag)

**Deprecated Code:**
- triggerIntelligenceScan() (SW)
- pageVersion parameter (content)
- process_actionable_elements_for_llm() (server)
- Site map processing functions (server)
- Sweep/scan mode functions (HUD)

---

## Quick Reference

### Add New Message Type

1. Define structure: `{type: "new_type", params: {...}}`
2. Add handler in destination (content, SW, or server)
3. Document in message table

### Add New Capability

1. **Internal (server):** Add to execute_internal_capability()
2. **DOM (site):** Add to site_configs.json capabilities section
3. **Extension (browser):** Add handler to handleExecuteCapability()
4. Test: `python3 test_navigation.py --command capability --capability MyCapability`

### Debug Each Component

**Service Worker:** chrome://extensions/ → service worker link → Console  
**Content Script:** F12 → Console (on target page)  
**WebSocket Server:** Terminal running ws_server.py  
**HUD:** F12 → Console, check Shadow DOM

### Common Gotchas

1. Service worker suspension → Open regular page (not chrome://)
2. Capability not finding element → Check selectors, url_pattern, element exists
3. Config changes not applying → Reload tab
4. Action ID not found → IDs ephemeral, trigger new scan
5. React input not updating → Use `injectReactEnter: true` config (Pattern #6)
6. Click not working → Use universalClick() with multiple strategies
7. Concurrent scans → Scan lock prevents, check scanInProgress
8. Iframe execution → Check window.top === window.self
9. HUD not appearing → Check Shadow DOM host exists
10. Chat not persisting → Check data/chats/ directory writable
11. CSP blocking script injection → Use chrome.scripting.executeScript with world: 'MAIN' (Pattern #6)

---

## Related Documentation

- `/Users/andy7string/Projects/Om_E_Web/CLAUDE.md` - Project overview, coding philosophy
- `/Users/andy7string/Projects/Om_E_Web/01_sw.md` - Service Worker deep-dive
- `/Users/andy7string/Projects/Om_E_Web/02_content.md` - Content Script deep-dive
- `/Users/andy7string/Projects/Om_E_Web/03_ws_server.md` - WebSocket Server deep-dive
- `/Users/andy7string/Projects/Om_E_Web/04_hud.md` - HUD Interface deep-dive

---

**Total System:** 4 components, ~22,732 lines, 60+ message types, 100+ functions per component, 3 themes, 50+ capabilities, unlimited site configs

The architecture enables rapid iteration via configuration. Progressive output ensures low latency. Selector-based resolution enables robust automation that survives DOM re-renders.
