# Om-E LLM Integration Plan

**Version:** 5.1
**Created:** 2025-12-06
**Updated:** 2025-12-07
**Status:** Ready for Implementation (Phase 8: Multi-LLM Routing added)

---

## Executive Summary

Integrate LLM capabilities into Om-E via a local stateful agent. User drops in API key, selects provider, and Om-E becomes an intelligent browser agent that can execute actions, see results, and retry when things fail.

**Key Decisions:**
- **No LiteLLM** - Direct HTTP calls via thin adapter layer (~50 lines)
- **No native tool calling** - JSON command format only (simpler, faster)
- **Local stateful agent** - ws_server.py holds context, LLM is stateless brain
- **All capabilities in system prompt** - Loaded once, sent with every call (invisible)
- **Feedback loop** - LLM sees action results, can retry or adjust
- **Multi-provider support** - OpenAI, Anthropic, LM Studio, Ollama (drop-in API key)
- **Start with OpenAI** - Build generic plumbing as we go

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           HUD (hud.js)                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Chat Panel     │  │  Settings Panel │  │  Orb + Navigation   │  │
│  │  - User input   │  │  - Provider     │  │  - Theme            │  │
│  │  - Messages     │  │  - API Key      │  │  - Controls         │  │
│  │  - Actions      │  │  - Model        │  │  - Status           │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ chrome.runtime.sendMessage
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Service Worker (sw.js)                         │
│  - Route messages between HUD and server                            │
│  - Handle browser-level capabilities (tabs, zoom)                   │
│  - Maintain WebSocket connection                                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ WebSocket (port 17892)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      WebSocket Server (ws_server.py)                │
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  LLM Client     │    │  Orchestrator   │    │  Dispatcher     │  │
│  │  - Provider API │◄──►│  - Prompt build │◄──►│  - Route action │  │
│  │  - Retries      │    │  - Parse JSON   │    │  - Internal     │  │
│  │  - Normalize    │    │  - Validate     │    │  - Extension    │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                     │
│  Config: data/llm_config.json                                       │
│  Capabilities: data/capabilities.json                               │
│  Prompts: data/prompts/system.md                                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
     │ Internal Caps  │  │ Extension Caps │  │ Content Script │
     │ - Chat CRUD    │  │ - Scroll/Zoom  │  │ - Element act  │
     │ - Config       │  │ - Tabs         │  │ - Site caps    │
     │ - Projects     │  │ - HUD controls │  │ - DOM actions  │
     └────────────────┘  └────────────────┘  └────────────────┘
```

---

## 2. Directory Structure

```
om_e_web_ws/
├── data/                              # Runtime data (gitignored except templates)
│   ├── llm_config.json               # User's LLM configuration
│   ├── capabilities/                 # Capability definitions (grouped)
│   │   ├── _index.json               # Master index, loads all groups
│   │   ├── browser.json              # Scroll, zoom, tabs, navigation
│   │   ├── hud.json                  # HUD visibility, theme, panels
│   │   ├── chat.json                 # Chat CRUD, messages, search
│   │   ├── config.json               # LLM config management
│   │   └── project.json              # Future: project management
│   ├── prompts/                      # System prompts and templates
│   │   ├── system.md                 # Main system prompt
│   │   └── personas/                 # Future: custom personas
│   ├── chats/                        # Chat history (existing)
│   └── projects/                     # Future: project hierarchy
│       └── default/                  # Default project
│           ├── project.json
│           ├── chats/
│           └── vectors/              # Future: FAISS indexes
│
├── llm/                              # LLM integration code
│   ├── __init__.py                   # Module exports
│   ├── client.py                     # LLM provider adapter (HTTP calls)
│   ├── orchestrator.py               # Prompt building, response parsing
│   └── dispatcher.py                 # Action routing to handlers
│
├── ws_server.py                      # Main server (existing)
├── test_navigation.py                # CLI test harness (existing)
└── requirements.txt                  # Dependencies
```

---

## 3. Execution Pipeline (CRITICAL)

This section documents exactly how actions flow through the system.

### 3.1 Unified Execution Pattern

**ALL callers use the SAME pipeline.** This is the core architectural decision.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CALLERS                                     │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│      LLM        │      HUD UI     │         CLI Test                │
│ {"cap":"..."}   │  Button click   │  --capability ScrollDown        │
│                 │  Search input   │                                 │
└────────┬────────┴────────┬────────┴────────────────┬────────────────┘
         │                 │                         │
         └─────────────────┼─────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   SINGLE EXECUTION PIPE                             │
│                                                                     │
│   ws_server.py:execute_capability(action, params)                   │
│                                                                     │
│   1. Load capability definition from registry                       │
│   2. Validate params against schema                                 │
│   3. Route to handler (server internal OR extension)                │
│   4. Return result                                                  │
└─────────────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Server Internal │ │ Extension (sw)  │ │ Content Script  │
│ - Chat CRUD     │ │ - Scroll/Zoom   │ │ - Site caps     │
│ - Config        │ │ - Tabs          │ │ - DOM actions   │
│ - Projects      │ │ - HUD controls  │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

**Why This Matters:**
- HUD "Search Chats" button calls `SearchChats` capability
- LLM "search my chats for X" calls same `SearchChats` capability
- Same handler, same result format, same error handling
- UI features and LLM features stay in sync automatically
- Add capability once → available to both LLM and UI

### 3.2 Action Types and Routing

There are THREE types of actions, each with different execution paths:

#### Type 1: BROWSER Actions (Extension - Service Worker)

Actions that control the browser itself. Executed in `sw.js`.

| Action | Handler | What It Does |
|--------|---------|--------------|
| ScrollDown | sw.js | Scrolls active tab down |
| ScrollUp | sw.js | Scrolls active tab up |
| ScrollTop | sw.js | Scrolls to page top |
| ScrollBottom | sw.js | Scrolls to page bottom |
| ZoomIn | sw.js | Zooms in 15% |
| ZoomOut | sw.js | Zooms out 15% |
| ZoomReset | sw.js | Resets zoom to 100% |
| OpenTab | sw.js | Opens new tab |
| CloseTab | sw.js | Closes tab by ID |
| SwitchTab | sw.js | Switches to tab by ID |
| GoBack | sw.js | Browser back button |
| GoForward | sw.js | Browser forward button |
| Refresh | sw.js | Refreshes page |

**Execution Flow:**
```
ws_server.py                    sw.js
     │                            │
     │  {type: "execute_capability", action: "ScrollDown"}
     │ ─────────────────────────► │
     │                            │ chrome.tabs.sendMessage(tabId, {scroll: "down"})
     │                            │ OR chrome.scripting.executeScript(...)
     │  {ok: true}                │
     │ ◄───────────────────────── │
```

#### Type 2: PAGE Actions (Extension - Content Script)

Actions that interact with page elements or site-specific features. Executed in `content.js`.

| Action | Handler | What It Does |
|--------|---------|--------------|
| Element click | content.js | Clicks element by action ID |
| Element setValue | content.js | Types into input by action ID |
| Element toggle | content.js | Toggles checkbox by action ID |
| RetrieveTranscript | content.js | YouTube: gets video transcript |
| TogglePlayPause | content.js | YouTube: play/pause video |
| Site-specific | content.js | Any capability from site_configs.json |

**Execution Flow (Element Action):**
```
ws_server.py                    sw.js                     content.js
     │                            │                            │
     │  {type: "llm_instruction", │                            │
     │   actionId: "a_id_5",      │                            │
     │   actionType: "click"}     │                            │
     │ ─────────────────────────► │                            │
     │                            │  chrome.tabs.sendMessage   │
     │                            │ ─────────────────────────► │
     │                            │                            │ element.click()
     │                            │  {ok: true}                │
     │                            │ ◄───────────────────────── │
     │  {ok: true}                │                            │
     │ ◄───────────────────────── │                            │
```

**Execution Flow (Site Capability):**
```
ws_server.py                    sw.js                     content.js
     │                            │                            │
     │  {type: "execute_capability",                           │
     │   action: "RetrieveTranscript"}                         │
     │ ─────────────────────────► │                            │
     │                            │  chrome.tabs.sendMessage   │
     │                            │ ─────────────────────────► │
     │                            │                            │ capabilityPipelineExecutor()
     │                            │  {ok: true, transcript: ...}│
     │                            │ ◄───────────────────────── │
     │  {ok: true, transcript}    │                            │
     │ ◄───────────────────────── │                            │
```

#### Type 3: HUD Actions (Extension - Content Script/HUD)

Actions that control the HUD interface. Executed in `content.js` or `hud.js`.

| Action | Handler | What It Does |
|--------|---------|--------------|
| ToggleHUD | content.js | Shows/hides HUD panel |
| MinimizeHUD | content.js | Minimizes HUD to orb |
| MaximizeHUD | content.js | Expands HUD to full panel |
| SetTheme | content.js | Changes HUD theme |
| ShowChatPanel | hud.js | Opens chat panel in HUD |
| ShowSettings | hud.js | Opens settings panel in HUD |
| SetOrbPosition | content.js | Moves orb to corner |

**Execution Flow:**
```
ws_server.py                    sw.js                     content.js
     │                            │                            │
     │  {type: "execute_capability",                           │
     │   action: "SetTheme",                                   │
     │   params: {theme: "kawaii"}}                            │
     │ ─────────────────────────► │                            │
     │                            │  chrome.tabs.sendMessage   │
     │                            │ ─────────────────────────► │
     │                            │                            │ hud.setTheme("kawaii")
     │                            │  {ok: true}                │
     │                            │ ◄───────────────────────── │
     │  {ok: true}                │                            │
     │ ◄───────────────────────── │                            │
```

#### Type 4: INTERNAL Actions (Server Only)

Actions handled entirely in the Python server. No extension involved.

| Action | Handler | What It Does |
|--------|---------|--------------|
| ListChats | ws_server.py | Returns list of saved chats |
| CreateChat | ws_server.py | Creates new chat file |
| LoadChat | ws_server.py | Loads chat by ID |
| DeleteChat | ws_server.py | Deletes chat file |
| RenameChat | ws_server.py | Renames chat |
| SearchChats | ws_server.py | Searches chat content |
| GetLLMConfig | ws_server.py | Returns current LLM config |
| SetLLMModel | ws_server.py | Changes model |
| SetTemperature | ws_server.py | Changes temperature |
| ListCapabilities | ws_server.py | Lists all capabilities |
| AddCapability | ws_server.py | Adds new capability |

**Execution Flow:**
```
ws_server.py
     │
     │  execute_internal_capability("ListChats", {})
     │
     │  → Read from data/chats/*.json
     │  → Return [{id, title, date}, ...]
     │
     │  {ok: true, chats: [...]}
```

### 3.3 Dispatcher Logic

The dispatcher determines WHERE to send each action:

```python
# In ws_server.py or llm/dispatcher.py

async def dispatch(action: dict) -> dict:
    """
    Route action to correct handler based on capability definition.
    """

    # 1. Message only - return directly, no action needed
    if "msg" in action and "cap" not in action and "act" not in action:
        return {"ok": True, "type": "message", "message": action["msg"]}

    # 2. Element action - route to content script via sw.js
    if "act" in action:
        return await send_to_extension({
            "type": "llm_instruction",
            "data": {
                "actionId": action["act"],
                "actionType": "auto",  # content.js determines type from registry
                "params": {
                    "value": action.get("value"),
                    "submit": action.get("submit", False)
                }
            }
        })

    # 3. Capability action - check handler type
    if "cap" in action:
        cap_name = action["cap"]
        cap_def = CAPABILITIES.get(cap_name)

        if not cap_def:
            return {"ok": False, "error": f"Unknown capability: {cap_name}"}

        params = action.get("params", {})

        # Route based on handler
        if cap_def["handler"] == "server":
            # Internal - execute in Python
            return execute_internal_capability(cap_name, params)

        elif cap_def["handler"] == "extension":
            # Extension - send to sw.js
            return await send_to_extension({
                "type": "execute_capability",
                "action": cap_name,
                "params": params
            })

        else:
            return {"ok": False, "error": f"Unknown handler: {cap_def['handler']}"}
```

### 3.4 How sw.js Routes to Handlers

```javascript
// In sw.js

async function handleCapability(action, params) {
    // Browser-level capabilities
    if (action.startsWith("Scroll") || action.startsWith("Zoom")) {
        return await executeScrollZoom(action, params);
    }

    if (action.includes("Tab")) {
        return await executeTabAction(action, params);
    }

    if (action === "GoBack" || action === "GoForward" || action === "Refresh") {
        return await executeNavigation(action);
    }

    // Everything else goes to content script
    return await sendToContentScript({
        type: "execute_capability",
        action: action,
        params: params
    });
}
```

---

## 4. How to Add Capabilities

### 4.1 Adding a Browser Capability

**Example: Add "DuplicateTab" capability**

**Step 1:** Add to `data/capabilities/browser.json`:
```json
{
  "DuplicateTab": {
    "category": "browser.tabs",
    "label": "Duplicate current tab",
    "handler": "extension",
    "route": "sw.tabs",
    "params": {
      "tabId": {"type": "number", "required": false, "description": "Tab to duplicate (default: active)"}
    }
  }
}
```

**Step 2:** Add handler in `sw.js`:
```javascript
// In executeTabAction()
case "DuplicateTab":
    const tabId = params.tabId || (await getActiveTabId());
    const newTab = await chrome.tabs.duplicate(tabId);
    return {ok: true, newTabId: newTab.id};
```

**Step 3:** Test via CLI:
```bash
python3 test_navigation.py --capability DuplicateTab
```

**Step 4:** Test via LLM:
```
User: "duplicate this tab"
LLM: {"cap": "DuplicateTab"}
```

### 4.2 Adding a HUD Capability

**Example: Add "ToggleDarkMode" capability**

**Step 1:** Add to `data/capabilities/hud.json`:
```json
{
  "ToggleDarkMode": {
    "category": "hud.theme",
    "label": "Toggle dark mode",
    "handler": "extension",
    "route": "content.hud"
  }
}
```

**Step 2:** Add handler in `content.js` or `hud.js`:
```javascript
// In content.js capability handler
case "ToggleDarkMode":
    const hud = document.getElementById("ome-hud");
    hud.classList.toggle("dark-mode");
    return {ok: true, darkMode: hud.classList.contains("dark-mode")};
```

**Step 3:** Test via CLI:
```bash
python3 test_navigation.py --capability ToggleDarkMode
```

### 4.3 Adding a Page/Site Capability

**Example: Add "GetVideoTitle" for YouTube**

**Step 1:** Add to `web_extension/site_configs.json`:
```json
{
  "youtube.com": {
    "capabilities": {
      "GetVideoTitle": {
        "action": "GetVideoTitle",
        "label": "Get video title",
        "url_pattern": "/watch",
        "selectors": ["h1.ytd-video-primary-info-renderer"]
      }
    }
  }
}
```

**Step 2:** Handler already exists - `capabilityPipelineExecutor()` in content.js reads selector and extracts text.

**Step 3:** Test on YouTube:
```bash
python3 test_navigation.py --capability GetVideoTitle
```

### 4.4 Adding an Internal (Server) Capability

**Example: Add "ExportChat" capability**

**Step 1:** Add to `data/capabilities/chat.json`:
```json
{
  "ExportChat": {
    "category": "chat",
    "label": "Export chat to file",
    "handler": "server",
    "route": "internal",
    "params": {
      "chat_id": {"type": "string", "required": true},
      "format": {"type": "string", "required": false, "default": "json", "enum": ["json", "md", "txt"]}
    }
  }
}
```

**Step 2:** Add handler in `ws_server.py`:
```python
# In execute_internal_capability()
elif action == "ExportChat":
    chat_id = params.get("chat_id")
    format = params.get("format", "json")

    chat = load_chat(chat_id)
    if not chat:
        return {"ok": False, "error": "Chat not found"}

    if format == "json":
        content = json.dumps(chat, indent=2)
    elif format == "md":
        content = format_chat_as_markdown(chat)
    else:
        content = format_chat_as_text(chat)

    return {"ok": True, "content": content, "format": format}
```

**Step 3:** Test via CLI:
```bash
python3 test_navigation.py --capability ExportChat --params '{"chat_id": "abc123", "format": "md"}'
```

### 4.5 Adding a HUD UI for a Capability

When adding a capability that should be accessible from the HUD UI:

**Step 1:** Add capability definition (as above)

**Step 2:** Add UI element in `hud.js`:
```javascript
// Add button to appropriate panel
const exportBtn = document.createElement("button");
exportBtn.textContent = "Export Chat";
exportBtn.onclick = () => {
    chrome.runtime.sendMessage({
        type: "execute_capability",
        action: "ExportChat",
        params: {chat_id: currentChatId, format: "md"}
    });
};
chatPanel.appendChild(exportBtn);
```

**Step 3:** Handle response in HUD:
```javascript
// In message listener
if (msg.type === "capability_result" && msg.action === "ExportChat") {
    downloadFile(msg.result.content, `chat_${msg.params.chat_id}.${msg.result.format}`);
}
```

---

## 5. Capability Definition Format

### 5.1 Full Schema

```json
{
  "CapabilityName": {
    "category": "group.subgroup",
    "label": "Human-readable description",
    "handler": "server | extension",
    "route": "internal | sw.scroll | sw.tabs | sw.nav | content.hud | content.site",
    "params": {
      "paramName": {
        "type": "string | number | boolean | object",
        "required": true | false,
        "default": "optional default value",
        "description": "What this param does",
        "enum": ["optional", "list", "of", "values"]
      }
    },
    "ui_hint": "Optional hint for HUD UI implementation"
  }
}
```

### 5.2 Handler Values

| Handler | Where It Executes | Used For |
|---------|-------------------|----------|
| `server` | ws_server.py | Chat CRUD, config, file operations |
| `extension` | sw.js or content.js | Browser control, HUD, page interaction |

### 5.3 Route Values

| Route | Handler Location | Examples |
|-------|------------------|----------|
| `internal` | ws_server.py | ListChats, GetLLMConfig |
| `sw.scroll` | sw.js | ScrollDown, ScrollUp |
| `sw.zoom` | sw.js | ZoomIn, ZoomOut |
| `sw.tabs` | sw.js | OpenTab, CloseTab |
| `sw.nav` | sw.js | GoBack, GoForward |
| `content.hud` | content.js/hud.js | ToggleHUD, SetTheme |
| `content.site` | content.js | Site-specific capabilities |

---

## 6. Capability Files

### 6.1 browser.json

```json
{
  "group": "browser",
  "description": "Chrome browser control capabilities",
  "capabilities": {
    "ScrollDown": {
      "category": "browser.scroll",
      "label": "Scroll down one viewport",
      "handler": "extension",
      "route": "sw.scroll"
    },
    "ScrollUp": {
      "category": "browser.scroll",
      "label": "Scroll up one viewport",
      "handler": "extension",
      "route": "sw.scroll"
    },
    "ScrollTop": {
      "category": "browser.scroll",
      "label": "Go to page top",
      "handler": "extension",
      "route": "sw.scroll"
    },
    "ScrollBottom": {
      "category": "browser.scroll",
      "label": "Go to page bottom",
      "handler": "extension",
      "route": "sw.scroll"
    },
    "ZoomIn": {
      "category": "browser.zoom",
      "label": "Zoom in 15%",
      "handler": "extension",
      "route": "sw.zoom"
    },
    "ZoomOut": {
      "category": "browser.zoom",
      "label": "Zoom out 15%",
      "handler": "extension",
      "route": "sw.zoom"
    },
    "ZoomReset": {
      "category": "browser.zoom",
      "label": "Reset zoom to 100%",
      "handler": "extension",
      "route": "sw.zoom"
    },
    "OpenTab": {
      "category": "browser.tabs",
      "label": "Open new browser tab",
      "handler": "extension",
      "route": "sw.tabs",
      "params": {
        "url": {"type": "string", "required": false, "description": "URL to open"}
      }
    },
    "CloseTab": {
      "category": "browser.tabs",
      "label": "Close a browser tab",
      "handler": "extension",
      "route": "sw.tabs",
      "params": {
        "tabId": {"type": "number", "required": true}
      }
    },
    "SwitchTab": {
      "category": "browser.tabs",
      "label": "Switch to a tab",
      "handler": "extension",
      "route": "sw.tabs",
      "params": {
        "tabId": {"type": "number", "required": true}
      }
    },
    "ListTabs": {
      "category": "browser.tabs",
      "label": "List all open tabs",
      "handler": "extension",
      "route": "sw.tabs"
    },
    "GoBack": {
      "category": "browser.nav",
      "label": "Go back in history",
      "handler": "extension",
      "route": "sw.nav"
    },
    "GoForward": {
      "category": "browser.nav",
      "label": "Go forward in history",
      "handler": "extension",
      "route": "sw.nav"
    },
    "Refresh": {
      "category": "browser.nav",
      "label": "Refresh the page",
      "handler": "extension",
      "route": "sw.nav"
    }
  }
}
```

### 6.2 hud.json

```json
{
  "group": "hud",
  "description": "HUD interface control capabilities",
  "capabilities": {
    "ToggleHUD": {
      "category": "hud.visibility",
      "label": "Show or hide the HUD",
      "handler": "extension",
      "route": "content.hud"
    },
    "MinimizeHUD": {
      "category": "hud.visibility",
      "label": "Minimize HUD to orb",
      "handler": "extension",
      "route": "content.hud"
    },
    "MaximizeHUD": {
      "category": "hud.visibility",
      "label": "Expand HUD to full panel",
      "handler": "extension",
      "route": "content.hud"
    },
    "SetTheme": {
      "category": "hud.theme",
      "label": "Change HUD theme",
      "handler": "extension",
      "route": "content.hud",
      "params": {
        "theme": {"type": "string", "required": true, "enum": ["robot", "kawaii", "atom"]}
      }
    },
    "ListThemes": {
      "category": "hud.theme",
      "label": "List available themes",
      "handler": "extension",
      "route": "content.hud"
    },
    "ShowChatPanel": {
      "category": "hud.panels",
      "label": "Open chat panel",
      "handler": "extension",
      "route": "content.hud"
    },
    "ShowSettings": {
      "category": "hud.panels",
      "label": "Open settings panel",
      "handler": "extension",
      "route": "content.hud"
    },
    "SetOrbPosition": {
      "category": "hud.position",
      "label": "Move orb to corner",
      "handler": "extension",
      "route": "content.hud",
      "params": {
        "position": {"type": "string", "required": true, "enum": ["top-left", "top-right", "bottom-left", "bottom-right"]}
      }
    }
  }
}
```

### 6.3 chat.json

```json
{
  "group": "chat",
  "description": "Chat management capabilities",
  "capabilities": {
    "ListChats": {
      "category": "chat",
      "label": "List all saved chats",
      "handler": "server",
      "route": "internal"
    },
    "CreateChat": {
      "category": "chat",
      "label": "Create new chat",
      "handler": "server",
      "route": "internal",
      "params": {
        "title": {"type": "string", "required": false}
      }
    },
    "LoadChat": {
      "category": "chat",
      "label": "Load a chat by ID",
      "handler": "server",
      "route": "internal",
      "params": {
        "chat_id": {"type": "string", "required": true}
      }
    },
    "RenameChat": {
      "category": "chat",
      "label": "Rename a chat",
      "handler": "server",
      "route": "internal",
      "params": {
        "chat_id": {"type": "string", "required": true},
        "title": {"type": "string", "required": true}
      }
    },
    "DeleteChat": {
      "category": "chat",
      "label": "Delete a chat",
      "handler": "server",
      "route": "internal",
      "params": {
        "chat_id": {"type": "string", "required": true}
      }
    },
    "SearchChats": {
      "category": "chat",
      "label": "Search chat history",
      "handler": "server",
      "route": "internal",
      "params": {
        "query": {"type": "string", "required": true},
        "limit": {"type": "number", "required": false, "default": 10}
      },
      "ui_hint": "Needs search input in HUD chat panel"
    }
  }
}
```

### 6.4 config.json

```json
{
  "group": "config",
  "description": "LLM and system configuration capabilities",
  "capabilities": {
    "GetLLMConfig": {
      "category": "config.llm",
      "label": "Get current LLM configuration",
      "handler": "server",
      "route": "internal"
    },
    "SetLLMProvider": {
      "category": "config.llm",
      "label": "Switch LLM provider",
      "handler": "server",
      "route": "internal",
      "params": {
        "provider": {"type": "string", "required": true, "enum": ["lm_studio", "openai", "anthropic"]}
      }
    },
    "SetLLMModel": {
      "category": "config.llm",
      "label": "Change LLM model",
      "handler": "server",
      "route": "internal",
      "params": {
        "model": {"type": "string", "required": true}
      }
    },
    "SetTemperature": {
      "category": "config.llm",
      "label": "Adjust temperature",
      "handler": "server",
      "route": "internal",
      "params": {
        "temperature": {"type": "number", "required": true, "description": "0.0 to 2.0"}
      }
    },
    "ListLLMProviders": {
      "category": "config.llm",
      "label": "List available providers",
      "handler": "server",
      "route": "internal"
    },
    "ListCapabilities": {
      "category": "config.capabilities",
      "label": "List all capabilities",
      "handler": "server",
      "route": "internal",
      "params": {
        "group": {"type": "string", "required": false, "description": "Filter by group"}
      }
    },
    "GetCapability": {
      "category": "config.capabilities",
      "label": "Get capability details",
      "handler": "server",
      "route": "internal",
      "params": {
        "name": {"type": "string", "required": true}
      }
    },
    "AddCapability": {
      "category": "config.capabilities",
      "label": "Add new capability",
      "handler": "server",
      "route": "internal",
      "params": {
        "group": {"type": "string", "required": true},
        "name": {"type": "string", "required": true},
        "definition": {"type": "object", "required": true}
      }
    },
    "UpdateCapability": {
      "category": "config.capabilities",
      "label": "Update capability definition",
      "handler": "server",
      "route": "internal",
      "params": {
        "name": {"type": "string", "required": true},
        "definition": {"type": "object", "required": true}
      }
    },
    "DeleteCapability": {
      "category": "config.capabilities",
      "label": "Delete capability",
      "handler": "server",
      "route": "internal",
      "params": {
        "name": {"type": "string", "required": true}
      }
    }
  }
}
```

### 6.5 _index.json

```json
{
  "version": "1.0",
  "description": "Master capability index - loads all capability files",
  "files": [
    "browser.json",
    "hud.json",
    "chat.json",
    "config.json"
  ],
  "site_configs_path": "../../../web_extension/site_configs"
}
```

---

## 7. LLM Configuration

### 7.1 Config Schema

**File:** `data/llm_config.json`

```json
{
  "active_provider": "lm_studio",
  "providers": {
    "lm_studio": {
      "name": "LM Studio",
      "type": "openai_compatible",
      "endpoint": "http://localhost:1234/v1/chat/completions",
      "model": "local-model",
      "api_key": null
    },
    "openai": {
      "name": "OpenAI",
      "type": "openai",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-4o",
      "api_key": "$OPENAI_API_KEY"
    },
    "anthropic": {
      "name": "Anthropic",
      "type": "anthropic",
      "endpoint": "https://api.anthropic.com/v1/messages",
      "model": "claude-sonnet-4-20250514",
      "api_key": "$ANTHROPIC_API_KEY"
    }
  },
  "settings": {
    "temperature": 0.7,
    "max_tokens": 2048,
    "timeout_seconds": 30,
    "retry_count": 2
  }
}
```

**Key Points:**
- `$ENV_VAR` syntax reads from environment variable (NEVER store raw keys)
- `active_provider` selects which provider to use
- `lm_studio` uses OpenAI-compatible API with local endpoint

---

## 8. Output Format Contract

**Single JSON format. No exceptions. No native tool calling.**

### 8.1 Action Types

| Action | Purpose | Example |
|--------|---------|---------|
| `cap` | Execute capability | `{"cap": "ScrollDown"}` |
| `act` | Element interaction | `{"act": "a_id_5", "value": "cats", "submit": true}` |
| `msg` | Message to user | `{"msg": "What should I search for?"}` |

### 8.2 Full Examples

```json
// Capability only
{"cap": "ScrollDown"}

// Capability with params
{"cap": "OpenTab", "params": {"url": "https://google.com"}}

// Capability with message
{"cap": "ScrollDown", "msg": "Scrolling down..."}

// Element click
{"act": "a_id_5"}

// Element input with submit
{"act": "a_id_0", "value": "cats", "submit": true}

// Element input with message
{"act": "a_id_0", "value": "cats", "submit": true, "msg": "Searching for cats"}

// Message only
{"msg": "I can see a search box. What would you like me to search for?"}
```

### 8.3 Validation Rules

1. Response MUST be valid JSON
2. MUST contain at least one of: `cap`, `act`, or `msg`
3. If `cap`: must be known capability name
4. If `act`: must match `a_id_X` pattern
5. `params` optional for `cap`
6. `value` and `submit` optional for `act`
7. `msg` always optional (feedback to user)

---

## 9. Local Stateful Agent

The LLM API is stateless - every call is independent. But YOUR agent is stateful.

### 9.1 Agent Architecture

```python
# In ws_server.py

class OmEAgent:
    """
    Local stateful agent. LLM is just the reasoning brain we query.
    """

    def __init__(self):
        # Loaded ONCE at startup, held in memory forever
        self.system_prompt = load_prompt("data/prompts/system.md")
        self.capabilities = load_capabilities("data/capabilities/")

        # Per-session state
        self.conversation_history = []
        self.page_context = None

        # LLM client (multi-provider)
        self.llm = LLMClient(load_config())

    def update_page_context(self, text_md):
        """Called on every intelligence_update from extension"""
        self.page_context = text_md

    async def handle_user_message(self, user_msg):
        """Main entry point - user sends message, agent responds"""

        # Build context for LLM
        context = f"## Current Page\n{self.page_context}\n\n## User Request\n{user_msg}"

        # Add to conversation
        self.conversation_history.append({"role": "user", "content": context})

        # Run feedback loop
        return await self._agent_loop()

    async def _agent_loop(self):
        """
        Core loop: LLM responds → execute action → feed result back → repeat
        Exits when LLM returns message-only (no action)
        """
        max_iterations = 10

        for _ in range(max_iterations):
            # Call LLM with system prompt + conversation history
            response = await self.llm.call(
                system=self.system_prompt,
                messages=self.conversation_history[-20:]  # Last 20 messages
            )

            # Parse JSON response
            try:
                action = json.loads(response)
            except json.JSONDecodeError:
                # LLM returned plain text - treat as message
                return response

            # Record assistant response
            self.conversation_history.append({"role": "assistant", "content": response})

            # Message only = done, return to user
            if "msg" in action and "cap" not in action and "act" not in action:
                return action["msg"]

            # Execute action
            result = await self.dispatcher.execute(action)

            # Feed result back to LLM
            result_msg = f"Action result: {json.dumps(result)}"
            self.conversation_history.append({"role": "user", "content": result_msg})

            # Loop continues - LLM sees result, can retry or respond

        return "Max iterations reached"
```

### 9.2 Feedback Loop Example

```
User: "click the submit button"

[LLM call 1]
LLM: {"act": "a_id_5", "msg": "Clicking submit..."}
Execute → {"ok": false, "error": "element not visible"}

[Result fed back to LLM]

[LLM call 2]
LLM: {"cap": "ScrollDown", "msg": "Can't see it, scrolling down..."}
Execute → {"ok": true}

[Result fed back to LLM]

[LLM call 3]
LLM: {"act": "a_id_5", "msg": "Trying again..."}
Execute → {"ok": true, "clicked": true}

[Result fed back to LLM]

[LLM call 4]
LLM: {"msg": "Done! Form submitted successfully."}
← No action, loop exits, user sees final message
```

### 9.3 Why This Beats Native Tool Calling

| Aspect | Your JSON + Feedback Loop | Native Tool Calling |
|--------|---------------------------|---------------------|
| Format | Simple JSON text | Structured tool_calls |
| Parsing | `json.loads(response)` | Parse tool_calls array |
| Feedback | Plain text result | Structured tool_result |
| Providers | All (same format) | Varies per provider |
| Debugging | Easy (read JSON) | Complex structures |
| Lock-in | None | Provider-specific |

Same capability. Same feedback. Simpler code.

---

## 10. Multi-Provider LLM Client

### 10.1 Provider Adapter (~50 lines)

```python
# llm/client.py

class LLMClient:
    """
    Thin adapter for multiple LLM providers.
    All return plain text - your agent loop doesn't change.
    """

    def __init__(self, config):
        self.config = config
        self.provider = config["active_provider"]
        self.provider_config = config["providers"][self.provider]

    async def call(self, system: str, messages: list) -> str:
        """Call LLM, return response text. Provider-agnostic."""

        if self.provider in ["openai", "lm_studio", "ollama"]:
            return await self._openai_compatible(system, messages)
        elif self.provider == "anthropic":
            return await self._anthropic(system, messages)
        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    async def _openai_compatible(self, system: str, messages: list) -> str:
        """OpenAI, LM Studio, Ollama - same API format"""

        all_messages = [{"role": "system", "content": system}] + messages

        response = await httpx.post(
            self.provider_config["endpoint"],
            headers={"Authorization": f"Bearer {self._get_api_key()}"},
            json={
                "model": self.provider_config["model"],
                "messages": all_messages,
                "max_tokens": self.config["settings"]["max_tokens"],
                "temperature": self.config["settings"]["temperature"]
            },
            timeout=self.config["settings"]["timeout_seconds"]
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    async def _anthropic(self, system: str, messages: list) -> str:
        """Anthropic Claude - slightly different format"""

        response = await httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self._get_api_key(),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": self.provider_config["model"],
                "system": system,
                "messages": messages,
                "max_tokens": self.config["settings"]["max_tokens"],
                "temperature": self.config["settings"]["temperature"]
            },
            timeout=self.config["settings"]["timeout_seconds"]
        )
        response.raise_for_status()
        return response.json()["content"][0]["text"]

    def _get_api_key(self) -> str:
        """Resolve API key - supports $ENV_VAR syntax"""
        key = self.provider_config.get("api_key")
        if key and key.startswith("$"):
            return os.environ.get(key[1:], "")
        return key or ""
```

### 10.2 Adding New Providers

To add a new provider (e.g., Google Gemini):

1. Add config to `data/llm_config.json`:
```json
"gemini": {
    "endpoint": "https://generativelanguage.googleapis.com/v1beta/models",
    "api_key": "$GOOGLE_API_KEY",
    "model": "gemini-pro"
}
```

2. Add method to `LLMClient`:
```python
async def _gemini(self, system: str, messages: list) -> str:
    # Gemini-specific formatting
    ...
```

3. Add to provider check:
```python
elif self.provider == "gemini":
    return await self._gemini(system, messages)
```

---

## 11. Dependencies

### 11.1 Required Packages

```
# requirements.txt

# Async HTTP client (for LLM API calls)
httpx>=0.25.0

# WebSocket server (existing)
websockets>=12.0

# Environment variables
python-dotenv>=1.0.0
```

### 11.2 No Additional Dependencies

- `litellm` - Not needed (direct HTTP calls)
- `openai` - Not needed (using httpx)
- `anthropic` - Not needed (using httpx)
- `faiss-cpu` - Deferred to future phase
- `sentence-transformers` - Deferred to future phase

---

## 12. Implementation Phases

**Philosophy:** Build foundation first. Prove each layer works before adding the next. RAG comes AFTER core pipeline is solid.

```
Phase 1-2: Can agent CHAT? (basic LLM round-trip)
Phase 3-4: Can agent SEE? (page context)
Phase 5-6: Can agent ACT? (dispatcher execution)
Phase 7:   Can agent LEARN? (RAG for capabilities)
Phase 8:   Can agent ROUTE? (multi-LLM: local vs API)
Phase 9:   Can agent INTEGRATE? (HUD settings panel)
Phase 10+: Can agent REMEMBER? (memory, projects)
```

---

### Phase 1: Basic Agent Chat

**Goal:** Agent can have a conversation. No actions, no page context, just chat.

**Steps:**
1. Create `data/llm_config.json` with OpenAI config
2. Create `llm/client.py` with basic `LLMClient`
3. Create `llm/agent.py` with `OmEAgent` class
4. Minimal system prompt: "You are Om-E. Respond helpfully."
5. Wire to ws_server.py with `llm_chat` message type

**Test:**
```python
# test_navigation.py
python test_navigation.py --command chat --message "hello"
# Response: "Hello! How can I help you today?"
```

**What works after this phase:**
- LLM API calls work
- Agent holds conversation history
- Messages flow: test client → ws_server → LLM → back

---

### Phase 2: Pass Page Context

**Goal:** Agent can see current page. Still no actions.

**Steps:**
1. Agent receives `text.md` content on each `intelligence_update`
2. Include page context in LLM prompt
3. Update system prompt: "You can see the current page below."

**Test:**
```
User: "what page am I on?"
LLM: "You're on the Google homepage. I can see a search box..."
```

**What works after this phase:**
- Agent sees page content
- Agent can describe what's on screen
- Agent can identify elements (but not act yet)

---

### Phase 3: Hardcoded Capability Test

**Goal:** Test ONE capability end-to-end. Hardcode it in prompt.

**Steps:**
1. Add to system prompt:
   ```
   You can scroll the page. To scroll down, respond:
   {"cap": "ScrollDown", "msg": "Scrolling down..."}
   ```
2. Add JSON response parsing to agent
3. Wire to dispatcher (but don't execute yet - just log)

**Test:**
```
User: "scroll down"
LLM: {"cap": "ScrollDown", "msg": "Scrolling down..."}
Agent: [Parsed: cap=ScrollDown] (logged, not executed)
```

**What works after this phase:**
- LLM returns valid JSON
- Agent parses JSON correctly
- Response format is validated

---

### Phase 4: Dispatcher Execution

**Goal:** Actions actually execute. Feedback loop works.

**Steps:**
1. Move dispatch logic from `test_navigation.py` to `ws_server.py`
2. Wire agent's parsed actions to dispatcher
3. Return execution results to agent
4. Implement feedback loop (result → back to LLM)

**Test:**
```
User: "scroll down"
LLM: {"cap": "ScrollDown", "msg": "Scrolling down..."}
Execute: → {"ok": true}
LLM: {"msg": "Done! Scrolled down."}
```

**What works after this phase:**
- Actions execute in browser
- Agent sees results
- Agent can retry on failure
- Full round-trip works

---

### Phase 5: Core Capabilities (Hardcoded)

**Goal:** Add more capabilities to prompt. Still hardcoded, no RAG.

**Steps:**
1. Add core capabilities to system prompt:
   - Scroll: ScrollDown, ScrollUp, ScrollTop, ScrollBottom
   - Zoom: ZoomIn, ZoomOut, ZoomReset
   - Element: {"act": "a_id_X"} format
2. Test each capability type

**Test:**
```
User: "zoom in"
LLM: {"cap": "ZoomIn", "msg": "Zooming in..."}

User: "click the search button"
LLM: {"act": "a_id_0", "msg": "Clicking search..."}
```

**What works after this phase:**
- Multiple capability types work
- Element actions work
- System is usable (but prompt is getting big)

---

### Phase 6: Capability Files + Loader

**Goal:** Move capabilities out of prompt into data files.

**Steps:**
1. Create `data/capabilities/browser.json`, `hud.json`, etc.
2. Create capability loader that reads all files
3. Generate capability reference dynamically
4. System prompt references capabilities but doesn't list all

**Directory:**
```
data/capabilities/
├── _index.json
├── browser.json    # scroll, zoom, tabs
├── hud.json        # theme, panels
├── element.json    # click, setValue, toggle
└── site/
    └── youtube.json
```

**What works after this phase:**
- Capabilities are data, not code
- Easy to add new capabilities
- Prompt size still growing though...

---

### Phase 7: RAG for Capabilities

**Goal:** Only include RELEVANT capabilities in prompt. Use vector search.

**Steps:**
1. Create `llm/rag/` module (reuse patterns from OM-E LM)
2. Build FAISS index from capability files (once at startup)
3. On user message, query RAG for relevant capabilities
4. Only include top-K capabilities in LLM context

**Architecture:**
```
User: "get the transcript"
         ↓
[RAG Query] → capabilities index
         ↓
Returns: RetrieveTranscript, GetVideoTitle (top 2)
         ↓
[LLM Context]:
- System prompt (format rules only)
- Page context (text.md)
- Relevant capabilities (2 items from RAG)
         ↓
[LLM] → {"cap": "RetrieveTranscript"}
```

**What works after this phase:**
- Prompt size is small (~2-3KB total)
- 300 capabilities but only send ~5-10 per call
- Fast, cheap, scalable

---

### Phase 8: Multi-LLM Routing

**Goal:** Intelligently route tasks between local and API LLMs for cost, speed, and quality optimization.

**Why This Matters:**
- Local LLMs are fast and free but less capable
- API LLMs are powerful but cost money and have latency
- Simple actions don't need GPT-4, complex reasoning does
- Privacy-sensitive tasks stay local

**Architecture:**

```
User Request
     ↓
[Task Classifier]
     ↓
┌────────────────────────────────────────┐
│            ROUTING DECISION             │
├────────────────┬───────────────────────┤
│   LOCAL LLM    │       API LLM         │
├────────────────┼───────────────────────┤
│ • Scroll/Click │ • Multi-step planning │
│ • Form filling │ • Content analysis    │
│ • Simple nav   │ • Summarization       │
│ • Quick Q&A    │ • Code generation     │
│ • HUD control  │ • Complex reasoning   │
└────────────────┴───────────────────────┘
```

**Config Structure:**

```json
{
  "providers": {
    "local": {
      "name": "LM Studio",
      "type": "openai_compatible",
      "endpoint": "http://localhost:1234/v1/chat/completions",
      "model": "llama-3.2-3b",
      "api_key": null
    },
    "api": {
      "name": "OpenAI",
      "type": "openai",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-4o-mini",
      "api_key": "$OPENAI_API_KEY"
    },
    "api_premium": {
      "name": "Anthropic",
      "type": "anthropic",
      "endpoint": "https://api.anthropic.com/v1/messages",
      "model": "claude-sonnet-4-20250514",
      "api_key": "$ANTHROPIC_API_KEY"
    }
  },
  "routing": {
    "mode": "smart",
    "default_provider": "local",
    "escalate_to": "api",
    "task_rules": {
      "browser.scroll": "local",
      "browser.zoom": "local",
      "browser.tabs": "local",
      "hud.*": "local",
      "chat.simple": "local",
      "chat.analysis": "api",
      "planning.multi_step": "api",
      "content.summarize": "api",
      "content.extract": "api"
    },
    "fallback": {
      "on_local_failure": "escalate",
      "on_api_failure": "local",
      "max_retries": 2
    }
  }
}
```

**Routing Modes:**

| Mode | Behavior |
|------|----------|
| `local_only` | Always use local LLM |
| `api_only` | Always use API LLM |
| `smart` | Route based on task_rules |
| `cascade` | Try local first, escalate if needed |
| `cost_optimized` | Minimize API calls |
| `quality_optimized` | Use API for anything complex |

**Steps:**
1. Update `llm_config.json` schema to support multiple providers
2. Add `TaskClassifier` to categorize user requests
3. Implement routing logic in `LLMClient.route()`
4. Add escalation detection (local confidence too low)
5. Add HUD settings for routing mode selection
6. Track usage stats per provider (calls, tokens, cost estimate)

**Task Classification Heuristics:**

```python
def classify_task(user_message: str, page_context: str) -> str:
    """Classify task complexity for routing."""

    # Simple action keywords → local
    simple_patterns = [
        r"scroll (up|down|top|bottom)",
        r"click (the|on|this)",
        r"zoom (in|out)",
        r"go (back|forward)",
        r"open tab",
        r"close (hud|sidebar|panel)"
    ]

    # Complex task keywords → api
    complex_patterns = [
        r"summarize",
        r"analyze",
        r"explain",
        r"compare",
        r"write (code|script)",
        r"plan",
        r"step.?by.?step",
        r"find all",
        r"extract"
    ]

    # Check patterns
    for pattern in simple_patterns:
        if re.search(pattern, user_message, re.I):
            return "simple"

    for pattern in complex_patterns:
        if re.search(pattern, user_message, re.I):
            return "complex"

    # Default based on message length
    return "complex" if len(user_message) > 100 else "simple"
```

**What works after this phase:**
- Simple actions use fast free local LLM
- Complex tasks automatically escalate to API
- User can override routing mode in settings
- Cost tracking shows API usage
- Fallback ensures resilience

---

### Phase 9: HUD Integration

**Goal:** Chat from browser, not just test script.

**Steps:**
1. Wire HUD chat panel to send `llm_chat` messages
2. Display responses in chat
3. Add "thinking" indicator
4. Add settings panel for provider selection

**What works after this phase:**
- Full end-to-end in browser
- User can chat with Om-E via HUD
- Settings configurable via UI

---

## 13. Future Phases (Post-MVP)

### Phase 10: Memory System (FAISS)

```
data/vectors/
├── capabilities.faiss     # Capability lookup (Phase 7)
├── memory.faiss           # Conversation history
└── knowledge.faiss        # Harvested content
```

- Embed conversations on save
- Search memory tool for LLM
- "What did we do yesterday?" works

### Phase 11: Projects + Prompts

```
data/projects/
├── default/              # Catches unassigned chats
│   ├── project.json
│   ├── vectors/
│   ├── prompts/
│   └── chats/
└── my_research/          # User project
    └── ...
```

- Project-first hierarchy
- Custom prompts per project
- Personas with linked knowledge bases

---

## 14. Example Interactions

### Simple Action
```
User: "scroll down"
LLM: {"cap": "ScrollDown", "msg": "Scrolling down..."}
→ Execute → {"ok": true}
LLM: {"msg": "Done!"}
```

### Form Fill
```
User: "search for cats"
LLM: {"act": "a_id_0", "value": "cats", "submit": true, "msg": "Searching..."}
→ Execute → {"ok": true}
[Page loads new content]
LLM: {"msg": "Found results for cats!"}
```

### Retry on Failure
```
User: "click the login button"
LLM: {"act": "a_id_5", "msg": "Clicking login..."}
→ Execute → {"ok": false, "error": "element not visible"}
LLM: {"cap": "ScrollDown", "msg": "Can't see it, scrolling..."}
→ Execute → {"ok": true}
LLM: {"act": "a_id_5", "msg": "Trying again..."}
→ Execute → {"ok": true}
LLM: {"msg": "Logged in!"}
```

### Multi-step
```
User: "fill in the form with john@email.com and password123"
LLM: [
    {"act": "a_id_0", "value": "john@email.com"},
    {"act": "a_id_1", "value": "password123"},
    {"act": "a_id_2", "msg": "Submitting form..."}
]
→ Execute all → {"ok": true}
LLM: {"msg": "Form submitted!"}
```

---

## 15. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM hallucinates action IDs | System prompt rules + validation before execution |
| API rate limits | Retry with backoff, queue requests |
| Slow responses | Loading indicator in HUD, timeout handling |
| Invalid JSON response | Re-ask LLM with "please respond with valid JSON" |
| Context too large | Trim page content, limit conversation history to last 20 |
| Action fails silently | Always return result to LLM, let it handle |
| Provider goes down | Easy switch to different provider in config |

---

## 16. Success Criteria

**MVP Complete When:**
1. ✅ User can configure OpenAI API key
2. ✅ User can chat in HUD and Om-E responds
3. ✅ Om-E can execute browser actions (scroll, click, type)
4. ✅ Om-E sees action results and can retry on failure
5. ✅ Om-E works on any website (not just test pages)
6. ✅ Anthropic provider also works
7. ✅ LM Studio/Ollama work (local models)

---

## 17. Files to Create (By Phase)

### Phase 1-2: Basic Chat
| File | Purpose |
|------|---------|
| `data/llm_config.json` | LLM provider configuration |
| `data/prompts/system.md` | Minimal system prompt |
| `llm/__init__.py` | Module exports |
| `llm/client.py` | Multi-provider LLM client |
| `llm/agent.py` | OmEAgent class |

### Phase 3-5: Execution
| File | Purpose |
|------|---------|
| `llm/dispatcher.py` | Action dispatcher (moved from test_navigation.py) |

### Phase 6: Capability Files
| File | Purpose |
|------|---------|
| `data/capabilities/_index.json` | Capability index |
| `data/capabilities/browser.json` | Scroll, zoom, tabs |
| `data/capabilities/hud.json` | Theme, panels |
| `data/capabilities/element.json` | Click, setValue, toggle |
| `data/capabilities/site/youtube.json` | YouTube-specific |

### Phase 7: RAG
| File | Purpose |
|------|---------|
| `llm/rag/__init__.py` | RAG module |
| `llm/rag/embeddings.py` | Sentence transformer wrapper |
| `llm/rag/vector_store.py` | FAISS index manager |
| `data/vectors/capabilities.faiss` | Capability vector index |

### Phase 8: Multi-LLM Routing
| File | Purpose |
|------|---------|
| `llm/router.py` | Task classifier and LLM routing logic |
| `llm/stats.py` | Usage tracking per provider (calls, tokens, cost) |
| Update `data/llm_config.json` | Multi-provider + routing config |
| Update `hud.js` | Settings panel for routing mode |

---

## 18. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                           OM-E WEB AGENT                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    OmEAgent (ws_server.py)                   │    │
│  │                                                              │    │
│  │  STATE:                                                      │    │
│  │  ├── system_prompt (loaded once)                            │    │
│  │  ├── conversation_history (per session)                     │    │
│  │  └── page_context (updated on page change)                  │    │
│  │                                                              │    │
│  │  METHODS:                                                    │    │
│  │  ├── handle_user_message() → entry point                    │    │
│  │  ├── _agent_loop() → call LLM, execute, feed back           │    │
│  │  └── dispatch() → route actions                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                           │                                         │
│            ┌──────────────┼──────────────┐                         │
│            ▼              ▼              ▼                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  LLMClient   │  │  RAG Query   │  │  Dispatcher  │              │
│  │  (httpx)     │  │  (FAISS)     │  │              │              │
│  │              │  │              │  │  ┌────────┐  │              │
│  │  - OpenAI    │  │  Query:      │  │  │Internal│  │              │
│  │  - Anthropic │  │  "transcript"│  │  │ Caps   │  │              │
│  │  - LM Studio │  │       ↓      │  │  └────────┘  │              │
│  │  - Ollama    │  │  Returns:    │  │  ┌────────┐  │              │
│  │              │  │  top-K caps  │  │  │Extensn │  │              │
│  └──────────────┘  └──────────────┘  │  │ Caps   │  │              │
│                                       │  └────────┘  │              │
│                                       └──────────────┘              │
│                                              │                      │
└──────────────────────────────────────────────│──────────────────────┘
                                               ▼
                                    ┌──────────────────┐
                                    │    sw.js         │
                                    │    content.js    │
                                    │    DOM           │
                                    └──────────────────┘
```

**Data Flow:**
```
User Message
     ↓
[RAG Query] → capabilities.faiss → top-K relevant capabilities
     ↓
[Build Context]:
  - System prompt (format rules, ~500 tokens)
  - Page context (text.md, raw)
  - Relevant capabilities (from RAG, ~5-10 items)
     ↓
[LLM Call] → OpenAI/Anthropic/LM Studio
     ↓
[Parse JSON Response]
     ↓
[Dispatch Action] → internal / extension
     ↓
[Feed Result Back to LLM]
     ↓
[Loop until message-only response]
     ↓
Return to User
```

---

*Document Version 5.0 - Local Agent + RAG Capabilities*
*Generated 2025-12-07*
