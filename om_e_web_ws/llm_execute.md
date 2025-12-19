# Decision Engine Debug (Role B)

**Generated:** 2025-12-19 15:09:35
**Intent:** show my chats
**Estimated Tokens:** 542 (system: 445, user: 97)

**Retrieved:**
- Capabilities: 3
- Score range: 0.66 - 0.77
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
Intent: show my chats

- ShowChats [hud] (0.77): Opens the chats sidebar to display saved conver...
  example: {"cap": "ShowChats"}
- ShowPrompt [hud] (0.73): Shows the text input area for typing messages
  example: {"cap": "ShowPrompt"}
- HideChats [hud] (0.66): Closes the chats sidebar UI panel. Does NOT del...
  example: {"cap": "HideChats"}

Active: Google (https://www.google.com/)
```

---

## LLM Response

**Response Tokens:** 15

```json
```json
{"decision":"cap","target":"ShowChats","params":{}}
```
```