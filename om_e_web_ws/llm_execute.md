# Decision Engine Debug (Role B)

**Generated:** 2025-12-19 15:38:39
**Intent:** search chats for 'close current tab'
**Estimated Tokens:** 788 (system: 542, user: 246)

**Retrieved:**
- Capabilities: 6
- Score range: 0.68 - 1.00
- Active tab: Google

---

## System Prompt

# Decision Engine (Role B)

You execute user requests by selecting from provided options.

## Your Job
1. Read the user's intent
2. Pick the best matching option from the list provided
3. Fill in required params by extracting values from the intent
4. Return your selection following the format examples below

## Param Extraction
- Look at each option's params and example format
- "Required" params MUST be filled from the intent
- Extract values naturally (e.g. "open google" → url: "https://google.com")
- Match references to available IDs (tabs, chats, elements)

## Intent Parsing
- The PRIMARY ACTION is at the START of the intent
- Text AFTER "for" or in quotes is usually a parameter value, not a separate action
- Example: "search chats for close current tab" → SearchChats with query="close current tab"
- Example: "rename chat to 'my project'" → RenameChat with title="my project"
- Don't confuse embedded parameter values with the main action

## Response Formats (use these as templates)

**Clear match** - return the selected option with params filled:
```json
{"decision":"cap","target":"OpenTab","params":{"url":"https://google.com"}}
```

**Multiple valid options** - use options FROM THE PROVIDED LIST, always include custom/cancel:
```json
{"decision":"options","options":[
  {"type":"cap","target":"ScrollDown","label":"Scroll down one page"},
  {"type":"cap","target":"ScrollBottom","label":"Scroll to bottom"},
  {"type":"custom","label":"Describe what you want"},
  {"type":"cancel","label":"Cancel"}
]}
```

**Unclear/ambiguous request** - present relevant options FROM THE PROVIDED LIST for clarification:
```json
{"decision":"options","options":[
  {"type":"cap","target":"CloseTab","label":"Close current tab"},
  {"type":"cap","target":"SwitchTab","label":"Switch to different tab"},
  {"type":"custom","label":"Tell me which tab"},
  {"type":"cancel","label":"Cancel"}
]}
```

**No match** - nothing in the provided list fits:
```json
{"decision":"cannot","reason":"No capability matches this request"}
```

**Already done** - no action needed:
```json
{"decision":"noop","reason":"Already at top of page"}
```

JSON only. No explanation.


---

## Input (sent to LLM)

```
Intent: search chats for 'close current tab'

- SearchChats [chat] (1.00): Searches all chats for a keyword or phrase. Ext...
  example: {"cap": "SearchChats", "params": {"query": "dude"}}
  params: {query: "Required - search query string (extract from user request)"}
- CloseTab [browser] (0.91): Closes a browser tab by its tab ID
  example: {"cap": "CloseTab", "params": {"tabId": 123}}
  params: {tabId: "Required - the tab ID to close"}
- SwitchTab [browser] (0.83): Switches to a different browser tab by its tab ID
  example: {"cap": "SwitchTab", "params": {"tabId": 123}}
  params: {tabId: "Required - the tab ID to switch to"}
- ToggleChats [hud] (0.70): Opens or closes the chats panel
  example: {"cap": "ToggleChats"}
- HideChats [hud] (0.70): Closes the chats sidebar UI panel. Does NOT del...
  example: {"cap": "HideChats"}
- HidePrompt [hud] (0.68): Hides the text input area for typing messages
  example: {"cap": "HidePrompt"}

Active: Google (https://www.google.com/)
```

---

## LLM Response

**Response Tokens:** 23

```json
```json
{"decision":"cap","target":"SearchChats","params":{"query":"close current tab"}}
```
```