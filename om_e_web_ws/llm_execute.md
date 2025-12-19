# Decision Engine Debug (Role B)

**Generated:** 2025-12-20 01:31:46
**Intent:** search chats for 'show'
**Estimated Tokens:** 853 (system: 605, user: 248)

**Retrieved:**
- Capabilities: 2
- Score range: 0.87 - 1.00
- Active tab: (2) Facebook

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
- For tab operations: use the Tab NUMBER from the Tabs list (e.g. "close google tab" → find Google in tabs → use that tab's number)

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

**Multiple valid options** - MUST include params for each option so it can execute:
```json
{"decision":"options","options":[
  {"type":"cap","target":"SetTheme","params":{"theme":"robot"},"label":"Change to robot"},
  {"type":"cap","target":"SetTheme","params":{"theme":"kawaii"},"label":"Change to kawaii"},
  {"type":"cancel","label":"Cancel"}
]}
```

**Unclear/ambiguous request** - present options with params filled:
```json
{"decision":"options","options":[
  {"type":"cap","target":"CloseTab","params":{"tabId":1},"label":"Close Extensions tab"},
  {"type":"cap","target":"CloseTab","params":{"tabId":2},"label":"Close Google tab"},
  {"type":"cancel","label":"Cancel"}
]}
```

**Missing required param** - capability matches but required value not provided:
```json
{"decision":"clarify","missing":"title","prompt":"What would you like to rename it to?"}
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
Intent: search chats for 'show'

- SearchChats [chat] (1.00): Searches all chats for a keyword or phrase. Ext...
  example: {"cap": "SearchChats", "params": {"query": "dude"}}
  params: {query: "Required - search query string (extract from user request)"}
- ShowChats [hud] (0.87): Opens the chats sidebar to display saved conver...
  example: {"cap": "ShowChats"}

Active: (2) Facebook (https://www.facebook.com/)

Tabs:
- Tab 2: "OM-E Web" (127.0.0.1:8080)
- Tab 3: "(3) YouTube" (www.youtube.com)
- Tab 4: "(2) Facebook" (www.facebook.com) -- ACTIVE

Chats:
- Chat 1: "24_59_14_19_12_2025_thats"
- Chat 2: "27_44_14_19_12_2025_please" -- CURRENT
- Chat 3: "29_36_14_19_12_2025_go"
- Chat 4: "35_29_14_19_12_2025_so"
- Chat 5: "35_16_14_19_12_2025_what"
- Chat 6: "12_04_14_19_12_2025_wanna"
- Chat 7: "15_18_13_19_12_2025_im"
- Chat 8: "02_33_12_19_12_2025_hey"
- Chat 9: "26_22_12_19_12_2025_show"
- Chat 10: "53 messages"
(Use chat NUMBER for params: {"chat": 3} or name: {"name": "show"})
```

---

## LLM Response

**Response Tokens:** 19

```json
```json
{"decision":"cap","target":"SearchChats","params":{"query":"show"}}
```
```