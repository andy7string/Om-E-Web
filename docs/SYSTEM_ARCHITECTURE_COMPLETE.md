# Om_E_Web - Complete System Architecture

**Version:** 1.5
**Last Updated:** 2025-12-24
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
2. LLM sends command:
   {
     type: "llm_instruction",
     data: {
       actionId: "6",
       actionType: "click"
     }
   }

3. ws_server.py receives message:
   - Checks CURRENT_SCAN_MODE == 'at'
   - Forwards as execute_llm_action

4. sw.js handleExecuteLLMAction():
   - Looks up actionId in atRegistry → gets { ref, backendNodeId, role, name }
   - Calls findATElementByDefinition(tabId, role, name)
     → Queries LIVE AT tree via CDP Accessibility.getFullAXTree
     → Returns fresh backendNodeId

5. executeATAction(tabId, backendNodeId, actionType, params):
   - chrome.debugger.attach(tabId)
   - DOM.resolveNode(backendNodeId) → objectId (exact element reference)
   - Runtime.callFunctionOn(objectId, INJECTABLE_ACTION_DISPATCHER)
     → Injects full content.js executeAction logic into page context
     → Runs ON the exact element with all execution strategies
   - chrome.debugger.detach()
```

**INJECTABLE_ACTION_DISPATCHER - The Power Behind AT Execution:**

The dispatcher is a complete action pipeline injected via CDP `Runtime.callFunctionOn`. It runs in the page's JavaScript context on the exact element resolved from `backendNodeId`. This gives AT mode the same execution power as DOM mode.

**Dispatcher Actions:**

| Action | Logic |
|--------|-------|
| `click` | Detects toggle elements (checkbox/radio/switch) → simple click. Otherwise → universalClick with 6 strategies |
| `toggle` | Sets `element.checked` directly + dispatches change/input events |
| `navigate` | Uses `element.href` or finds parent `<a>`, falls back to click |
| `setValue` | React-compatible native setter, contenteditable (ProseMirror/Lexical), keyboard events |
| `getValue/getText/getHref` | Direct property access |

**universalClick - 6 Strategies for Maximum Compatibility:**

```javascript
// Strategy 1: Pointer events (React/Facebook)
el.dispatchEvent(new PointerEvent('pointerdown', {...}));
el.dispatchEvent(new PointerEvent('pointerup', {...}));
el.dispatchEvent(new MouseEvent('click', {...}));

// Strategy 2: Native click()
el.click();

// Strategy 3: MouseEvent simulation
el.dispatchEvent(new MouseEvent('click', {...}));

// Strategy 4: Focus + Enter key
el.focus();
el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', ...}));

// Strategy 5: mousedown + mouseup
el.dispatchEvent(new MouseEvent('mousedown', {...}));
el.dispatchEvent(new MouseEvent('mouseup', {...}));

// Strategy 6: Touch events (mobile)
el.dispatchEvent(new TouchEvent('touchstart', {...}));
el.dispatchEvent(new TouchEvent('touchend', {...}));
```

For React-like elements (detected by `role="button"` on non-button tags with complex classes), ALL strategies run. For normal elements, stops at first success.

**setValue - Framework Agnostic:**

```javascript
// Input/Textarea: React-compatible native setter
const proto = isTextarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
const desc = Object.getOwnPropertyDescriptor(proto, 'value');
desc.set.call(element, value);
element.dispatchEvent(new Event('input', { bubbles: true }));
element.dispatchEvent(new Event('change', { bubbles: true }));

// Contenteditable (ProseMirror, Lexical):
// Method 1: Clipboard paste
const dt = new DataTransfer();
dt.setData('text/plain', value);
element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, ... }));

// Method 2: execCommand fallback
document.execCommand('selectAll'); document.execCommand('insertText', false, value);

// Method 3: Direct textContent (last resort)
element.textContent = value;
```

**Key Principle:** Element is resolved ONCE via `backendNodeId` → `objectId`. The full execution pipeline runs on that exact element in page context. No re-searching, no selector guessing.

**Key Files & Functions:**

| File | Function | Purpose |
|------|----------|---------|
| `ws_server.py:140` | `CURRENT_SCAN_MODE` | Global scan mode state |
| `ws_server.py` | `llm_instruction` handler | Routes to AT path when mode='at' |
| `sw.js:580-878` | `INJECTABLE_ACTION_DISPATCHER` | Full executeAction pipeline as injectable string |
| `sw.js:888-943` | `executeATAction()` | Resolves backendNodeId → injects dispatcher via CDP |
| `sw.js:946-948` | `executeATClick()` | Legacy wrapper → calls executeATAction('click') |
| `sw.js:951-953` | `executeATSetValue()` | Legacy wrapper → calls executeATAction('setValue') |
| `sw.js` | `findATElementByDefinition()` | Queries AT tree by role+name |
| `sw.js` | `handleExecuteLLMAction()` | Routes actions, looks up atRegistry |
| `at_scanner.js` | `scanAccessibilityTree()` | Scans AT, builds registry with backendNodeId |

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
| Element ID | CSS selector hints | role + name + backendNodeId |
| Execution | content.js executeAction() | INJECTABLE_ACTION_DISPATCHER via CDP |
| Click strategies | universalClick (6 strategies) | universalClick (6 strategies) ✅ SAME |
| setValue | React-compatible + contenteditable | React-compatible + contenteditable ✅ SAME |
| Toggle handling | Detects checkbox/radio/switch | Detects checkbox/radio/switch ✅ SAME |
| Output file | `text.md` with selectors | `AT_text.md` with role+name |
| Best for | Complex DOM, SPAs | Screen reader compatible sites |

**Key Achievement:** AT mode now has **identical execution power** to DOM mode. The `INJECTABLE_ACTION_DISPATCHER` contains the same logic as content.js `executeAction()` - including universalClick's 6 strategies, toggle detection, React-compatible setValue, and contenteditable support (ProseMirror, Lexical).

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

### 9. AT Site Configs (at_site_configs/)

**Overview:** AT mode has its own config system separate from DOM mode. These configs control AT-specific filtering, output formatting, and capabilities.

**Directory Structure:**
```
web_extension/
├── at_site_configs.json          # Index: domain → config file path
├── at_site_configs/
│   ├── default.json              # Default config (all sites)
│   ├── youtube.json              # YouTube-specific
│   ├── chatgpt.json              # ChatGPT-specific
│   └── ...
```

**Config Loading Flow:**
```
1. at_scanner.js getATConfig(url)
   ↓
2. Load at_site_configs.json index
   ↓
3. Match domain → config file path
   ↓
4. Load domain config, merge with default if "extends": "default"
   ↓
5. Return merged config for scanning + output
```

**Config Options:**

| Option | Type | Purpose |
|--------|------|---------|
| `exclude_roles` | Array | Roles to filter out (e.g., "image", "generic") |
| `exclude_names` | Array | Element names to filter out |
| `exclude_name_patterns` | Array | Regex patterns to filter names |
| `label_overrides` | Object | Friendly labels for elements (e.g., `"combobox:Search": "YouTube Video Search"`) |
| `capabilities` | Object | Domain capabilities with url_pattern filtering |
| `output.show_empty_names` | Boolean | Hide elements with no accessible name |
| `max_depth` | Number | Max tree traversal depth |
| `max_nodes` | Number | Max nodes to process |

**Example: YouTube AT Config (at_site_configs/youtube.json):**

```json
{
  "extends": "default",

  "exclude_roles": ["image", "generic", "StaticText"],

  "exclude_names": ["More actions", "Skip navigation"],

  "label_overrides": {
    "combobox:Search": "YouTube Video Search"
  },

  "capabilities": {
    "transcript": {
      "action": "RetrieveTranscript",
      "label": "Get video transcript",
      "description": "Retrieves the full transcript for this YouTube video",
      "url_pattern": "/watch?v=",
      "params": {},
      "usage": "{\"type\": \"execute_capability\", \"action\": \"RetrieveTranscript\"}"
    },
    "playPause": {
      "action": "TogglePlayPause",
      "label": "Toggle video playback",
      "url_pattern": "/watch?v=",
      "usage": "{\"type\": \"execute_capability\", \"action\": \"TogglePlayPause\"}"
    }
  },

  "output": {
    "show_empty_names": false
  }
}
```

**Capabilities with url_pattern:**

Capabilities are only shown in AT output when the current URL matches the `url_pattern`:

```
YouTube Home (youtube.com/)
  → No capabilities shown (no url_pattern match)

YouTube Video (youtube.com/watch?v=xyz)
  → Shows: RetrieveTranscript, TogglePlayPause, LikeVideo
  → url_pattern: "/watch?v=" matches current URL
```

**Label Overrides:**

Transform technical role names into LLM-friendly labels:

```
Before: [5] combobox: "Search" → {...}
After:  [5] YouTube Video Search: "Search" → {...}

Config: "label_overrides": { "combobox:Search": "YouTube Video Search" }
```

**AT vs DOM Config Sources:**

| Mode | Config Source | Capabilities From |
|------|--------------|-------------------|
| DOM | `site_configs/*.json` | Same file |
| AT | `at_site_configs/*.json` | Same file |

When `orbState.scanMode === 'at'`:
- Scan filtering uses `at_site_configs/`
- Capabilities come from `at_site_configs/`
- Output formatting uses AT config options

**Key Files:**

| File | Purpose |
|------|---------|
| `at_site_configs.json` | Domain → config path index |
| `at_site_configs/default.json` | Default filtering rules |
| `at_site_configs/youtube.json` | YouTube-specific config |
| `at_site_configs/chatgpt.json` | ChatGPT-specific config |
| `at_scanner.js:34-113` | Config loading + merging |
| `at_scanner.js:667-699` | Capability output with url_pattern |
| `at_scanner.js:743-748` | Label override application |

**Adding a New AT Site Config:**

1. Create `at_site_configs/mysite.json`:
```json
{
  "extends": "default",
  "exclude_names": ["Cookie banner", "Ad"],
  "capabilities": {
    "search": {
      "action": "SiteSearch",
      "url_pattern": "/search",
      "usage": "{\"type\": \"execute_capability\", \"action\": \"SiteSearch\"}"
    }
  }
}
```

2. Add to `at_site_configs.json`:
```json
{
  "mysite.com": "at_site_configs/mysite.json",
  "*.mysite.com": "at_site_configs/mysite.json"
}
```

3. Reload extension - config auto-loads on next AT scan.

### 10. Always-Include Capabilities (Config-Driven Prompt Injection)

**Problem:** Some capabilities should always be available to the LLM regardless of what the user says. For example, "search google for X" should work even if the user's message doesn't semantically match the capability in RAG search.

**Solution:** Capabilities in `internal_capabilities.json` can be flagged with `always_include: true`. These are injected into every LLM prompt automatically, before RAG results.

**How It Works:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Always-Include Capability Flow                            │
└─────────────────────────────────────────────────────────────────────────────┘

1. CONFIG (internal_capabilities.json):
   {
     "GoogleSearch": {
       "group": "browser",
       "label": "Search Google for something",
       "description": "Searches Google for the given query",
       "synonyms": ["search google", "google it", "look up", "web search"],
       "params": { "query": "Required - what to search for" },
       "always_include": true  ← THIS FLAG
     }
   }

2. INDEXING (capabilities_store.py build()):
   - Loads internal_capabilities.json
   - Stores always_include flag in capability cache
   - Creates embeddings for RAG search (separate concern)

3. RETRIEVAL (capabilities_store.py get_always_include_capabilities()):
   - Scans cache for capabilities where always_include: true
   - Returns list with score: 1.0 (max relevance)

4. PROMPT BUILDING (orchestrator.py _query_capabilities()):
   ┌────────────────────────────────────────────────┐
   │  # First: Add always_include capabilities      │
   │  always_caps = cap_store.get_always_include()  │
   │  for cap in always_caps:                       │
   │      options.append(cap)  # score 1.0          │
   │      seen_labels.add(cap['label'])             │
   │                                                │
   │  # Then: Add RAG search results (skip dupes)   │
   │  for r in rag_results:                         │
   │      if label not in seen_labels:              │
   │          options.append(cap_from_rag)          │
   └────────────────────────────────────────────────┘

5. LLM PROMPT:
   Available capabilities always include GoogleSearch,
   plus any RAG-matched capabilities for the user's query.
```

**Config Location:**

```
om_e_web_ws/data/capabilities/internal_capabilities.json
```

**Key Fields:**

| Field | Purpose |
|-------|---------|
| `always_include` | Boolean - if true, capability always appears in prompt |
| `group` | Category for organization (browser, chat, system) |
| `synonyms` | Still used for RAG matching, but not required when always_include |
| `params` | Parameter docs shown to LLM |

**Example: GoogleSearch Capability:**

```json
{
  "GoogleSearch": {
    "group": "browser",
    "action": "GoogleSearch",
    "label": "Search Google for something",
    "description": "Searches Google for the given query. Opens a new tab or updates existing Google tab.",
    "synonyms": ["search google", "google it", "look up", "find on internet", "search the web"],
    "params": {
      "query": "Required - what to search for"
    },
    "example": "{\"cap\": \"GoogleSearch\", \"params\": {\"query\": \"best pizza near me\"}}",
    "always_include": true
  }
}
```

**Execution (ws_server.py):**

```python
elif cap_action == "GoogleSearch" and EXTENSION_WS:
    query = cap_params.get("query", "")
    if query:
        search_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(query)}"

        # Smart tab: reuse existing Google tab or open new
        existing_tab = find_matching_tab("google.com/search")
        if existing_tab:
            await EXTENSION_WS.send(json.dumps({
                "type": "update_tab_url",
                "tabId": existing_tab["id"],
                "url": search_url
            }))
        else:
            await EXTENSION_WS.send(json.dumps({
                "type": "open_tab",
                "url": search_url
            }))
```

**Key Files:**

| File | Function | Purpose |
|------|----------|---------|
| `internal_capabilities.json` | Config | Define capability with `always_include: true` |
| `capabilities_store.py:208-227` | `get_always_include_capabilities()` | Query cache for flagged caps |
| `orchestrator.py:_query_capabilities()` | Prompt building | Inject always caps before RAG results |
| `ws_server.py` | Capability handlers | Execute the capability action |

**When to Use:**

- Core browser actions (search, navigation)
- Frequently used capabilities that might not match RAG
- Default behaviors the LLM should always know about

**Adding a New Always-Include Capability:**

1. Add to `internal_capabilities.json`:
```json
{
  "MyCapability": {
    "group": "browser",
    "label": "Do something important",
    "description": "What it does",
    "params": { "param1": "Description" },
    "always_include": true
  }
}
```

2. Add handler in `ws_server.py`:
```python
elif cap_action == "MyCapability":
    # Execute the capability
    cap_result = {"ok": True, "result": "done"}
```

3. Restart server - capability index rebuilds automatically.

---

## LLM Pipeline & RAG System

**Updated:** 2025-12-24

### Unified Orchestrator (Single LLM Call)

The system uses a **unified single-call architecture**. One LLM call handles both conversation and action selection.

**File:** `llm/orchestrator.py` → `process_message_unified()`

```
User Message
      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ INGESTION PHASE                                                              │
│                                                                              │
│ 1. Large Payload Check (>550 chars)                                         │
│    → Summarize with entity extraction                                        │
│    → Store full content in large_payloads/                                   │
│    → Index summary in session vector                                         │
│    → Replace message with stub: [Large content: ...; ref=hash]               │
│                                                                              │
│ 2. Persistence Intent Check ("remember X", "note that Y")                    │
│    → Extract fact via LLM                                                    │
│    → Store in vectors/system/facts/                                          │
└─────────────────────────────────────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ RAG RETRIEVAL                                                                │
│                                                                              │
│ 1. Query CapabilitiesStore (semantic search)                                 │
│    → Returns capabilities matching user intent                               │
│    → Filtered by cap_score_threshold (default 0.55)                          │
│                                                                              │
│ 2. Get Always-Include Capabilities                                           │
│    → Capabilities with always_include: true                                  │
│    → Prepended to results (score 1.0)                                        │
│                                                                              │
│ 3. Shape Options (dedup, diversity, max 7)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ PROMPT BUILDING                                                              │
│                                                                              │
│ Components injected:                                                         │
│   - System prompt (chat_prompt.md + orb personality)                         │
│   - Rolling chat history (last N messages from chat JSON)                    │
│   - Session actions (cross-chat, last 10)                                    │
│   - Environment (active tab, tabs list, visible chats)                       │
│   - Capabilities (from RAG)                                                  │
│   - Session context (RAG on session_content_store)                           │
│   - Payload context (if large content was stored)                            │
└─────────────────────────────────────────────────────────────────────────────┘
      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ SINGLE LLM CALL                                                              │
│                                                                              │
│ Output types:                                                                │
│   - reply: Chat response only                                                │
│   - action: Execute capability {cap, params}                                 │
│   - clarify: Missing param, ask user                                         │
│   - options: Multiple matches, present choices                               │
│   - search: Request more capabilities from RAG                               │
│   - noop: Already done / no action needed                                    │
│   - cannot: Unable to help                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
      ↓
Response to User + Action Execution (if applicable)
```

### Memory Tier Architecture

| Tier | Scope | Storage | Trigger | Persistence |
|------|-------|---------|---------|-------------|
| **Session Actions** | Cross-chat within session | In-memory + `session_actions.json` | Every action executed | Until server restart |
| **Session Content** | Cross-chat within session | `vectors/memory/` | Content messages (not actions) | Until server restart |
| **Rolling Summaries** | Per-chat intent history | `chats/{id}.json` → `summaries.rolling` | Every 5 interactions | Permanent |
| **Chat History** | Single chat | `chats/{id}.json` | Every message | Permanent |
| **Facts** | Global user knowledge | `vectors/system/facts/` | "remember X" intent | Permanent |
| **Large Payloads** | Referenced content | `large_payloads/` + vector | >550 char messages | Permanent |

### Action Filtering (Flag-Based)

**Problem:** Action requests/confirmations pollute session vector, degrading RAG quality.

**Solution:** Use `action_executed` flag from `OrchestratorResult` (authoritative) instead of text heuristics.

```
LLM returns: {"type": "action", "cap": "ScrollDown", ...}
                    ↓
OrchestratorResult.action_executed = True
                    ↓
append_assistant_message(chat_dict, response, action_executed=True)
                    ↓
on_message_saved() sees flag → SKIP session vector indexing
```

**Result:** Session vector contains only content (conversations), not action confirmations like "Scrolling down for you."

### Rolling Intent Summarization

**Trigger:** Every 5 total interactions (chat + action turns)

**Storage:** `chat.json` → `summaries.rolling` (keeps last 3)

**Format:**
```json
{
  "summaries": {
    "rolling": [
      {"text": "User discussed ML and transformers...", "from_idx": 0, "to_idx": 10, "ts": "..."},
      {"text": "User requested navigation actions...", "from_idx": 10, "to_idx": 20, "ts": "..."}
    ]
  }
}
```

**Prompt Injection:** Summaries appear as `[Chat summary: [...]]` in conversation context, providing historical intent without full message replay.

### RAG Components

**Directory:** `retrieval/`

| File | Class | Purpose | Index Path |
|------|-------|---------|------------|
| `vector_store.py` | `VectorStore` | Base FAISS wrapper | - |
| `capabilities_store.py` | `CapabilitiesStore` | Indexes internal_capabilities.json | `vectors/system/capabilities/` |
| `session_content_store.py` | `SessionContentStore` | Cross-chat session memory | `vectors/memory/` |
| `chat_memory_store.py` | `ChatMemoryStore` | Chat summaries (deprecated) | `vectors/system/chat_memory/` |
| `memory_cycle.py` | - | Large payload + persistence handlers | - |
| `chat_context.py` | - | Action/content classification | - |
| `query.py` | `get_session_context()` | Combined RAG query | - |

### Retrieval Flow

```python
# retrieval/capabilities_store.py
class CapabilitiesStore(VectorStore):
    def search(self, query: str, k: int = 7, threshold: float = 0.55):
        """Semantic search on capability descriptions."""
        # 1. Embed query
        # 2. FAISS similarity search
        # 3. Filter by threshold
        # 4. Return top-k with scores

    def get_always_include_capabilities(self):
        """Return caps with always_include: true."""
        # Score set to 1.0 (max relevance)
```

```python
# retrieval/session_content_store.py
def get_session_context(user_message: str, current_chat_id: str = None) -> str:
    """Query session vector for relevant content from other chats."""
    # 1. Embed user message
    # 2. Search session vectors
    # 3. Exclude current chat (avoid duplication)
    # 4. Format as "[Session Context:] ..."
```

### Large Payload Handling

**Threshold:** 550 characters (configurable in `llm_config.json`)

```python
# retrieval/memory_cycle.py

def check_large_payload(message: str) -> bool:
    """Check if message exceeds threshold."""
    threshold = config.get("context", {}).get("large_payload_threshold", 550)
    return len(message) > threshold

async def process_large_payload(message: str, chat_id: str) -> str:
    """Summarize and store large content."""
    # 1. Extract entities with LLM
    summary = await extract_summary(message)  # ~50 tokens

    # 2. Hash for deduplication
    content_hash = hashlib.sha256(message.encode()).hexdigest()[:12]

    # 3. Store full content
    save_to_large_payloads(content_hash, message)

    # 4. Index in session vector
    session_store.add(summary, metadata={"hash": content_hash, "chat_id": chat_id})

    # 5. Return stub for chat history
    return f"[Large content: {summary[:50]}...; ref={content_hash}]"
```

### Persistence Intent

**Patterns:** "remember X", "note that Y", "keep in mind", "don't forget"

```python
# retrieval/memory_cycle.py

def detect_persistence_intent(message: str) -> bool:
    """Check for explicit memory storage request."""
    patterns = [
        r"\bremember\b", r"\bnote that\b", r"\bkeep in mind\b",
        r"\bdon't forget\b", r"\bsave this\b"
    ]
    return any(re.search(p, message.lower()) for p in patterns)

async def process_persistence_intent(message: str, chat_id: str) -> str:
    """Extract and store fact."""
    # 1. Extract fact with LLM
    fact = await extract_fact(message)

    # 2. Store in facts vector
    facts_store.add(fact, metadata={"chat_id": chat_id, "original": message})

    return fact
```

### Configuration

**File:** `data/llm_config.json`

```json
{
  "settings": {
    "cap_score_threshold": 0.55,
    "session_actions_limit": 10
  },
  "context": {
    "payload_context_lines": 5,
    "large_payload_threshold": 550,
    "payload_summary_budget": 50,
    "message_count_threshold": 8,
    "max_facts_in_prompt": 3,
    "fact_token_budget": 50
  }
}
```

| Setting | Purpose |
|---------|---------|
| `cap_score_threshold` | Minimum similarity score for capability to be included |
| `session_actions_limit` | How many cross-chat actions to show in prompt |
| `large_payload_threshold` | Character count to trigger summarization |
| `payload_summary_budget` | Target tokens for payload summary |
| `message_count_threshold` | Trigger rolling summary after N messages |
| `max_facts_in_prompt` | How many stored facts to inject |

### Key Files

| File | Purpose |
|------|---------|
| `llm/orchestrator.py` | Main orchestrator with unified flow |
| `llm/ingestion.py` | Message preprocessing |
| `llm/shaping.py` | Capability option shaping |
| `llm/contracts.py` | Output types and validation |
| `retrieval/capabilities_store.py` | Capability RAG |
| `retrieval/session_content_store.py` | Session memory RAG |
| `retrieval/memory_cycle.py` | Large payload + facts |
| `data/prompts/chat_prompt.md` | System prompt template |

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

### Add New Internal Capability (Server-Side)

**CRITICAL:** Internal capabilities require BOTH a handler AND a definition. Missing either causes routing failures.

**Required Files:**

| File | What to Add | Purpose |
|------|-------------|---------|
| `internal_capabilities.json` | Capability definition | **Routing decision** - tells ws_server.py this is internal |
| `ws_server.py` | Handler in `execute_internal_capability()` | **Execution** - actual logic |
| `hud.js` (optional) | UI element if user-configurable | Settings panel integration |

**Routing Logic (`ws_server.py:6046`):**

```python
internal_caps = load_internal_capabilities()  # Cached at startup!
if action in internal_caps:
    # ✅ Route to local handler (execute_internal_capability)
else:
    # ❌ Route to extension → content.js → fails if no DOM config
```

**Example: Adding SetSessionActionsLimit**

1. **Add to `internal_capabilities.json`:**
```json
{
  "SetSessionActionsLimit": {
    "group": "config",
    "action": "SetSessionActionsLimit",
    "label": "Set session actions limit",
    "description": "Sets rolling limit for session-wide action history (5-50)",
    "synonyms": ["session history limit", "action history size"],
    "example": "{\"cap\": \"SetSessionActionsLimit\", \"params\": {\"limit\": 20}}",
    "params": {
      "limit": "Required - number of actions to keep (5-50)"
    }
  }
}
```

2. **Add handler to `ws_server.py` in `execute_internal_capability()`:**
```python
elif action == "SetSessionActionsLimit":
    limit = params.get("limit")
    if limit is None:
        return {"error": "Missing limit parameter"}
    # ... validation and save logic
    config["settings"]["session_actions_limit"] = limit_val
    save_llm_config(config)
    return {"session_actions_limit": limit_val}
```

3. **Add HUD settings input (optional):**
```javascript
// hud.js - in settings panel HTML
<input type="number" class="ome-settings-session-actions" min="5" max="50">

// Load handler
sessionActionsInput.value = settings.session_actions_limit ?? 20;

// Save handler
chrome.runtime.sendMessage({
    type: 'execute_capability',
    action: 'SetSessionActionsLimit',
    params: { limit: parseInt(input.value) }
});
```

**Caching & Hot Reload:**

The `INTERNAL_CAPABILITIES` cache is loaded once at server startup. Changes to `internal_capabilities.json` require:

1. **Server restart** - picks up new capability definitions
2. **ReloadLLMConfig capability** - clears cache for config values (NOT capability definitions)

**Config File Locations:**

```
om_e_web_ws/
├── data/
│   ├── capabilities/
│   │   └── internal_capabilities.json  ← Capability definitions (routing)
│   └── llm_config.json                 ← Runtime config values
```

**Common Gotchas:**

| Issue | Cause | Fix |
|-------|-------|-----|
| `📤 Sent capability execution to extension` | Capability not in `internal_capabilities.json` | Add definition to JSON, restart server |
| Handler never executes | Missing from `internal_caps` cache | Restart server to reload cache |
| `validate_capability` fails | Capability added after server started | Restart server |
| HUD setting doesn't save | Missing handler OR missing definition | Add both, restart server |

### Add New DOM Capability (Site-Specific)

1. Add to `site_configs.json` or `at_site_configs/*.json` capabilities section
2. Add handler in `content.js` if custom execution needed
3. Test: `python3 test_navigation.py --command capability --capability MyCapability`

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

## Claude Code Testing (Feedback Loop)

**Overview:** Claude Code (this AI assistant) can directly test Om_E_Web functionality. This creates a complete feedback loop where Claude can:
1. Send messages or execute capabilities
2. Wait for LLM processing
3. Read the debug output file (`llm_unified.md`)
4. Verify the system behavior
5. Iterate on fixes

### Preferred Method: test_capability.py

The **recommended way** to test Om-E is via the WebSocket test script. This is simpler and more reliable than Chrome MCP:

```bash
# Full LLM flow - message appears in HUD, goes through orchestrator
python3 om_e_web_ws/tests/test_capability.py -m "your message here"

# Direct capability execution (bypasses LLM)
python3 om_e_web_ws/tests/test_capability.py -c ListTabs
python3 om_e_web_ws/tests/test_capability.py -c OpenTab -p '{"url": "google.com"}'
```

**What happens:**
- `-m "message"` → Uses `LLMChat` capability → Saves user message → LLM processes → Response appears in HUD
- `-c CapName` → Directly executes capability → Useful for testing individual capabilities

**Example output:**
```
🧪 Test Script
   Server: ws://localhost:17892

📝 Mode: Chat Message (LLM flow)
💬 Sending message: "what tabs do I have open?"
📤 Request: {...}

📥 Response (892ms):
{
  "type": "capability_result",
  "result": {
    "reply": "You've got 3 tabs open: OM-E Web, Extensions, and YouTube.",
    "_hud_action": {...}
  }
}

✅ Success
```

### Quick Reference (test_capability.py)

| Test Type | Command |
|-----------|---------|
| Chat message (full LLM flow) | `python3 om_e_web_ws/tests/test_capability.py -m "hello"` |
| List tabs | `python3 om_e_web_ws/tests/test_capability.py -c ListTabs` |
| Open tab | `python3 om_e_web_ws/tests/test_capability.py -c OpenTab -p '{"url": "google.com"}'` |
| Close tab | `python3 om_e_web_ws/tests/test_capability.py -c CloseTab -p '{"name": "youtube"}'` |
| Unknown action (error test) | `python3 om_e_web_ws/tests/test_capability.py -c BogusAction` |
| Test with chat ID | `python3 om_e_web_ws/tests/test_capability.py -m "hello" --chat-id myChat` |

### Testing Large Payload Handling

```bash
python3 om_e_web_ws/tests/test_capability.py -m "Sharks are a group of elasmobranch fish characterized by a cartilaginous skeleton, five to seven gill slits on the sides of the head, and pectoral fins that are not fused to the head. They have been around for more than 400 million years, predating dinosaurs. There are over 500 species of sharks..."
```

Then check:
- `data/chats/*.json` - should have stub `[Large content: ...; ref=hash]`
- `data/large_payloads/` - should have full content file

### Debug Output File Structure (`llm_unified.md`)

After running a test, check `om_e_web_ws/llm_unified.md`:

```markdown
# Unified LLM Call Debug

**Generated:** 2025-12-23 00:20:37
**User Message:** <what user typed or processed version>
**Messages:** <count of messages in history>
**Capabilities:** <count injected>
**Tokens:** ~XXX (system: XXX, messages: XXX)
**LLM Time:** XXXms

## System Prompt
<full system prompt with personality, rules, output format>

## Conversation
**USER:** <message content>
ENVIRONMENT (current state)
  Page: <title> (<url>)
  Tabs: ...
  Capabilities: ...

## Response
```json
{"type":"reply","text":"Om-E's response"}
```
```

### Key Sections to Verify

| Section | What to Check |
|---------|---------------|
| **User Message** | Large payloads show `[User sent XXX chars, stored as vector:ID] summary` |
| **Tokens** | Compare before/after changes (e.g., payload handling saves ~500 tokens) |
| **Capabilities** | Correct caps injected based on cap_score_threshold |
| **[Relevant stored content:]** | Payload context retrieved via RAG |
| **Response** | LLM understood context and responded appropriately |

### Testing Config Changes

Config lives in `data/llm_config.json`:

```json
{
  "settings": {
    "cap_score_threshold": 0.45  // Tune RAG confidence
  },
  "context": {
    "payload_context_lines": 5,    // Max lines of payload context
    "large_payload_threshold": 500, // Chars to trigger summarization
    "payload_summary_budget": 50    // Target tokens for summary
  }
}
```

**Workflow:**
1. Edit config
2. Restart ws_server.py
3. Test via `test_capability.py`
4. Check llm_unified.md
5. Iterate

### Common Test Scenarios

| Scenario | Command | What to Verify |
|----------|---------|----------------|
| Chat only | `-m "how are you"` | No caps injected if score < threshold |
| Action | `-m "google cats"` | GoogleIt cap executed |
| Large payload | `-m "600+ char message"` | Summarized, stored in vector |
| Payload retrieval | `-m "what did I say about X"` | `[Relevant stored content:]` appears |
| List tabs | `-c ListTabs` | Returns current tabs |
| Unknown action | `-c BogusAction` | Returns error quickly (not timeout) |

### Server Restart Required

Code changes require server restart:
```bash
# Kill existing
pkill -f ws_server.py

# Restart
python om_e_web_ws/ws_server.py
```

Config changes in `llm_config.json` also need restart (server caches on load).

---

### Alternative: Chrome MCP (manual browser testing)

For testing UI interactions or when you need visual feedback, use Chrome MCP tools:

| Tool | Purpose |
|------|---------|
| `tabs_context_mcp` | Get current tab IDs and URLs |
| `read_page` | Read accessibility tree (find input refs) |
| `computer` | Click, type, screenshot, wait |
| `javascript_tool` | Run `window.omeSendChat('message')` |

**Workflow:**
1. `tabs_context_mcp` → Get tabId
2. `computer action=screenshot` → Verify state
3. `javascript_tool` → `window.omeSendChat('test message')`
4. `computer action=wait duration=3` → Wait for processing
5. Read `llm_unified.md` → Check debug output

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
