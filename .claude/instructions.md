# Claude Configuration
# CLAUDE PROJECT RULES — OME STYLE
# Loose, creative, simple, commented, best-practice aware, and step-by-step.

## 1. PROJECT IDENTITY
This repository contains the Om_E_Web automation framework.

It includes:
- A Chrome MV3 extension (content.js, sw.js, site_configs.json)
- A Python async WebSocket server (ws_server.py)
- A complete artifact output pipeline (page.jsonl, content.jsonl, text.md, llm_actions.json, llm_prompt.md, llm_optimized.json)
- A natural-language execution loop driven by llm_instruction messages and actionable DOM IDs
- A browser scanning → artifact generation → LLM reasoning → action execution cycle

Claude must maintain simplicity, clarity, accuracy, readability, and an Om-E coding culture.
Claude must *not* force external dogma, coding religion, corporate standards, or moral commentary.

---

## 2. CODING PHILOSOPHY (CORE OF THIS PROJECT)
This project follows Om-E’s coding culture:

### • Simple > Clever
Prefer clear, short code over abstract or complex solutions.

### • Comments everywhere
- At the top of the file: explain purpose + data flow.
- Before each function: explain purpose + example call.
- Inside logic: explain anything non-trivial.

### • Globals are acceptable
We use globals for:
- shared state
- config
- environment toggles
- caching
Claude must document globals clearly and give example usage.

### • Configuration is encouraged
Use config objects / JSON when it simplifies behaviour.
Explain config keys, expected shapes, and examples.

### • Hardcoding is allowed but not preferred 
If something stabilises the system (timers, selectors, fallbacks), hardcode it.
Just explain why it exists. 

If we can avoid timers in favor of events that are triggered or monitored its a preference always over set timers we hate timers

### • Fewer lines of code is good
Short, readable, functional patterns preferred.

### • Functional testing mindset
After writing code, Claude must provide:
- how to test the function  
- simple input/output examples  
- edge cases to verify  
- optional automated tests if helpful  

### • Use async everywhere needed
- JS: async/await only
- Python: asyncio & websockets
Avoid mixed patterns.

---

## 2.1 BEST PRACTICE CODING STANDARDS (OME STYLE)

### • Global variables OK and documented  
### • Config-driven logic OK  
### • Simple functions preferred  
### • Avoid unnecessary abstractions  
### • Heavy comments mandatory  
### • Practical testing guidance required  
### • Pure functions where appropriate  
### • Hardcoding permitted with explanation  
### • Async patterns consistent  

Claude must follow this style automatically.

---

## 2.2 OME PLANNING & ARCHITECTURE WORKFLOW

### • Always start with design discussion
Claude must:
- ask about the design  
- verify architecture  
- summarise high-level flow  
- wait for approval  

### • Create a simple testable plan  
Plans must:
- be short (3–6 steps)  
- be testable  
- be validated with the user before coding  

### • Step-by-step execution  
Claude must:
- finish one step  
- show results  
- provide simple test instructions  
- wait for confirmation  

### • Architecture comes first  
Never implement before validating structure.

### • Always verify decisions
Claude must ask:
“Is this the architecture you want before I proceed?”

### • Testing at every step  
After each task Claude shows:
- test method  
- expected behaviour  
- next step (only after user confirmation)  

---

## 3. CLAUDE BEHAVIOUR RULES (LOOSE MODE)
- Claude may edit ANY file in the repo.  
- Claude must ask only when performing large structural changes.  
- Claude should be creative with solutions.  
- Claude must keep edits tightly scoped unless told otherwise.  
- Claude must show diffs when modifying code.  
- Claude must not inject moral commentary or limit user creativity.  
- Claude must flag assumptions.  
- Claude must keep explanations in Australian English.  
- Tone = calm, direct, practical, supportive.

---

## 4. JAVASCRIPT / CHROME EXTENSION GUIDELINES
Loose, not restrictive.

### Good behaviours
- Keep content.js stable, readable, predictable.
- Add comments around scanning, mutation observers, idle logic.
- Use pure functions where helpful.
- Avoid giant classes unless genuinely needed.
- Make logic retry-friendly and SPA-friendly.

### Allowed
- Hardcoded timing, selectors, fallbacks.
- Global config objects.
- Helper utilities for scanning and mapping DOM nodes.

### Avoid
- Over-engineering  
- Deep abstraction chains  
- Callback hell  

---

## 5. PYTHON SERVER GUIDELINES
Simple, stable, annotated.

### Good behaviours
- Use async/await for all networking.
- Keep ws_server.py functions short and predictable.
- Comment data flows, file writes, and message formats.
- Implement clear helper functions for repeated patterns.

### Allowed but not preferred
- Hardcoded paths (with explanation)  


---

## 6. ARTIFACT & PIPELINE UNDERSTANDING
Claude must treat artifacts as part of the pipeline:

Content script → Service worker → WebSocket server → @site_structures/ → llm_optimized.json → LLM reasoning → back to extension.

Claude must preserve compatibility unless the user explicitly asks for redesign.

---

## 7. FILE ACCESS RULES
Claude may modify any file but must:
- explain the intention  
- ask when changing cross-component protocols  
- avoid refactoring multiple subsystems at once unless approved  
- not restructure directories without permission  

---

## 8. WORKFLOW RULES — REQUIRED
Claude must follow these steps:

1. Discuss design  
2. Validate architecture  
3. Create a short plan  
4. Execute step 1  
5. Wait for confirmation  
6. Execute step 2  
7. Repeat until done  

Never skip steps unless instructed.

---

## 9. TONE / STYLE
- Direct  
- Calm  
- Practical  
- No fluff  
- Helpful  
- Support Andrew’s clarity and self-mastery  
- Use Australian English  

---

## 10. NEVER DO
- Don't remove Om-E style comments
- Don't refactor across languages without confirming
- Don't merge unrelated changes
- Don't invent limitations
- Don't produce verbose over-engineered code

---

## 11. SYSTEM ARCHITECTURE & KEY COMPONENTS

### High-Level Flow
```
Browser Extension → WebSocket Server → Artifacts → LLM/Client → Commands → Extension → DOM
```

The system operates in a continuous loop:
1. Extension scans page for actionable elements
2. Server writes artifacts (page.jsonl, llm_actions.json, etc.)
3. LLM reads artifacts and generates instructions
4. Server routes commands back to extension
5. Extension executes actions on the page
6. Cycle repeats

### Core Components

#### Chrome Extension (`web_extension/`)
- **`content.js`**: Main-frame DOM scanner, element registration, action executor
  - Runs idle detection before scanning
  - Assigns `data-ome-action-id` to actionable elements
  - Handles click, input, navigation commands
  - Exits early if in iframe (`window.top !== window.self`)

- **`sw.js`**: Service worker managing WebSocket bridge
  - Maintains persistent connection to ws://127.0.0.1:17892
  - Routes commands between server and tabs
  - Tracks internal tab state
  - Broadcasts site-config updates
  - Implements keep-alive to prevent worker suspension

- **`site_configs.json`**: Domain-specific element selectors
  - `focus_targets`: Auto-focus selectors after scan
  - `selectors`: Grouped by type (text_inputs, navigation, buttons, menus)
  - `forceIncludeSelectors`: Elements that must always be registered
  - `filters.include/exclude`: Additional markup rules

#### Python Server (`om_e_web_ws/`)
- **`ws_server.py`**: Main WebSocket server (port 17892)
  - Manages extension + client connections
  - Routes messages bidirectionally
  - Writes artifacts to `@site_structures/`
  - Normalizes shortcut commands (`set_value`, `click`, `navigate_link`)

- **`test_navigation.py`**: Example test client
- **`site_config_manager.py`**: Manages site config updates

#### Artifacts (`om_e_web_ws/@site_structures/`)
- **`page.jsonl`**: Ordered JSONL feed (meta, sections, text, actions)
- **`content.jsonl`**: Cleaned content (headings, paragraphs, lists, tables)
- **`text.md`**: Human-readable transcript with frontmatter
- **`llm_actions.json`**: ActionId → metadata mapping with `_page_context`
- **`llm_prompt.md`**: Compact prompt with `return (a_id_X)` instructions
- **`llm_optimized.json`**: Manually/watcher-generated compressed snapshot
- **`transcripts/`**: Long-form transcripts (YouTube, etc.)

---

## 12. COMMON COMMANDS & WORKFLOWS

### Starting the System
```bash
# 1. Start WebSocket server
python om_e_web_ws/ws_server.py

# 2. Load extension in Chrome
# - Navigate to chrome://extensions/
# - Enable "Developer mode"
# - Click "Load unpacked" → select web_extension/ folder

# 3. Test automation
cd om_e_web_ws
python test_navigation.py
```

### Testing Workflow
1. Start ws_server.py
2. Load extension
3. Navigate to target page (Google, Gmail, YouTube)
4. Verify "scan complete" in console or extension popup
5. Send commands via test_navigation.py or WebSocket client
6. Check artifacts updated in @site_structures/

### Modifying Site Configs
1. Edit `web_extension/site_configs.json`
2. Reload extension OR just refresh the page
3. Service worker auto-broadcasts updates to all tabs

---

## 13. KEY IMPLEMENTATION CONSTRAINTS

### Content Script (`content.js`)
- **Main-frame only**: Exits if `window.top !== window.self`
- **Idle detection**: Waits for DOM/network quiet before scanning
- **Keep-alive port**: Prevents service worker suspension
- **Mutation observers**: Monitors post-scan changes
- **Action IDs are ephemeral**: Regenerated on every scan

### Service Worker (`sw.js`)
- **Persistent WebSocket**: Maintains connection to server
- **Tab state tracking**: Internal state map for all tabs
- **Content script reinjection**: Auto-reinjects on tab changes
- **Shortcut routing**: Normalizes commands to llm_instruction format

### WebSocket Server (`ws_server.py`)
- **Multi-client support**: Extension + multiple test/LLM clients
- **Artifact regeneration**: Writes artifacts on every intelligence update
- **Transcript deduplication**: Uses content hashes to avoid duplicates
- **Command normalization**: Converts shortcuts to standard format

---

## 14. SITE CONFIGS = UI-AGENT CONTRACT

**Critical Principle:** When adding automation for new pages/apps:
1. Assign stable selectors (IDs, classes, ARIA labels) in your UI
2. Update `site_configs.json` for the target domain
3. DO NOT modify core runtime files (content.js, sw.js, ws_server.py)
4. Let the existing pipeline handle scanning and artifact generation

This architecture scales without touching core code.

---

## 15. MESSAGE FLOW EXAMPLES

### LLM Instruction Flow
```
1. LLM/Client → Server: {"type": "llm_instruction", "data": {"actionId": "a_id_42", "actionType": "click"}}
2. Server → Extension: {"type": "execute_llm_action", "data": {...}}
3. Extension → Content: {"type": "execute_action", "data": {...}}
4. Content → DOM: Click element with actionId="a_id_42"
5. Response: DOM → Content → Extension → Server → LLM/Client
```

### Intelligence Update Flow
```
1. Content Script: Scans page, registers elements
2. Content → Service Worker: Sends intelligence update
3. Service Worker → Server: Forwards intelligence data
4. Server: Writes page.jsonl, content.jsonl, llm_actions.json, etc.
5. LLM: Reads artifacts for next instruction
```

---

## 16. FILE STRUCTURE REFERENCE

```
Om_E_Web/
├── web_extension/              # Chrome MV3 extension
│   ├── content.js             # Content script (DOM ops)
│   ├── sw.js                  # Service worker (WebSocket)
│   ├── site_configs.json      # Domain selectors
│   └── manifest.json          # Extension config
├── om_e_web_ws/               # Python server
│   ├── ws_server.py           # Main server
│   ├── test_navigation.py     # Test client
│   └── @site_structures/      # Generated artifacts
│       ├── page.jsonl
│       ├── content.jsonl
│       ├── text.md
│       ├── llm_actions.json
│       ├── llm_prompt.md
│       └── transcripts/
└── THIS_IS_HOW_IT_ALL_WORKS.md  # System documentation
```

---

## 17. PYTHON & ENVIRONMENT

- **Python version**: 3.11+
- **Virtual environment**: Uses .venv
- **WebSocket library**: `websockets` (async)
- **Platform**: Tested on macOS (Darwin)

---

## 18. INTEGRATION WITH LLMS

The system enables natural language web control:
1. LLM reads `llm_optimized.json` or `llm_prompt.md`
2. User requests action (e.g., "Click Gmail link")
3. LLM identifies action ID from artifacts
4. LLM sends `llm_instruction` via WebSocket
5. Extension executes and returns result
6. LLM reads updated artifacts to verify

**Action IDs** follow pattern: `action_<type>_<tagname>_<index>`
- Example: `action_navigate_a_2` (link), `action_click_button_5` (button)

---

## 19. DEBUGGING & TROUBLESHOOTING

### Extension not connecting
- Check ws_server.py is running on port 17892
- Verify extension loaded in chrome://extensions/
- Check browser console for WebSocket errors
- Try changing WebSocket URL in extension popup

### Intelligence not updating
- Check console for "scan complete" message
- Verify content script injected (check tab dev tools)
- Look for errors in extension service worker logs
- Confirm page is main frame (not iframe)

### Actions not executing
- Verify action ID exists in llm_actions.json
- Check element still exists on page (IDs are ephemeral)
- Look for selector issues in site_configs.json
- Test with simple commands first (getText, click)

---

## 20. WHEN BUILDING NEW FEATURES

Follow this sequence:
1. **Design discussion**: Claude asks about architecture
2. **Validate approach**: Confirm with user before coding
3. **Update site configs**: If targeting new domain/page
4. **Implement changes**: Keep edits scoped and tested
5. **Test artifacts**: Verify generation is correct
6. **Test LLM integration**: Use test_navigation.py or custom client

Always prefer extending site_configs.json over modifying core runtime files.  
