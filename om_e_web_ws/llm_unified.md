# Unified LLM Call Debug

**Generated:** 2025-12-22 14:43:34
**User Message:** close this tab
**Messages:** 10
**Capabilities:** 5
**Tokens:** ~763 (system: 361, messages: 402)
**LLM Time:** 1127ms

## System Prompt
```
# Browser Assistant

You help users via conversation or browser actions. One JSON response per message.

## Your Job
1. Understand user intent
2. Reply conversationally OR execute a capability
3. Extract params from message when executing

## Capabilities (injected at runtime)
You receive matching capabilities with scores. Pick the best match and fill params from the message.

## Param Extraction
- PRIMARY action is at START: "search chats for settings" → SearchChats with query="settings"
- Match references to context: "close youtube tab" → find youtube in tabs → use that tabId
- Don't guess required params - ask if unclear

## Output (JSON only)

**Reply** - no action needed:
```json
{"type":"reply","text":"response here"}
```

**Action** - execute capability:
```json
{"type":"action","cap":"CapName","params":{"key":"value"}}
```

**Clarify** - missing required param:
```json
{"type":"clarify","text":"Which tab?"}
```

**Options** - multiple matches:
```json
{"type":"options","text":"Which?","options":[{"cap":"X","params":{},"label":"A"}]}
```

## Rules
- JSON only, no markdown wrapper
- One response per message
- Keep replies concise
- If a capability matches the intent, execute it
- Only reply conversationally if NO capability fits
- If params unclear, use "clarify" or "options" - don't say you can't do it


YOUR PERSONALITY
You are Om-E. Helpful, enthusiastic, encouraging and playful.
Tone: helpful
Example phrases: 

```

## Messages (sent to LLM)

### 1. USER

```
lets search google for bmw z3 m coupes for sale
```

### 2. ASSISTANT

```
Executing GoogleSearch...
```

### 3. USER

```
hide prompt
```

### 4. ASSISTANT

```
Executing HidePrompt...
```

### 5. USER

```
nice dude can you do a search on google for youtube videos on cats
```

### 6. ASSISTANT

```
Executing GoogleSearch...
```

### 7. USER

```
nice bru can you do it on youtube
```

### 8. ASSISTANT

```
Executing OpenTab...
```

### 9. USER

```
close this tab
```

### 10. USER

```
ENVIRONMENT (current state - use these for actions)
Page: (3) YouTube (https://www.youtube.com/)

Tabs (currently open):
  2. OM-E Web (127.0.0.1:8080)
  3. BMW Z3 M cars for sale in Australia - ca (www.carsales.com.au)
  4. youtube videos on cats - Google Search (www.google.com)
  5. (3) YouTube (www.youtube.com) ← ACTIVE

Capabilities:
- GoogleSearch (1.00): Searches Google for the given query. Opens a new tab with the search results. Use this when user wan
  ex: {"cap": "GoogleSearch", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to search for
- CloseTab (1.00): Closes a tab by ID or name. Say 'close the google tab' or 'close facebook'.
  ex: {"cap": "CloseTab", "params": {"name": "google"}}
  params: tabId: Optional - numeric tab ID to close, name: Optional - tab title/name for fuzzy matching (e.g. 'google', 'facebook')
- OpenTab (0.91): Opens a URL or switches to existing tab. Auto-switches if tab already open.
  ex: {"cap": "OpenTab", "params": {"url": "https://google.com"}}
  params: url: Optional - URL or site name (e.g. 'google.com', 'youtube')
- HidePrompt (0.75): Hides the text input area for typing messages
  ex: {"cap": "HidePrompt"}
- HideChats (0.75): Closes the chats sidebar UI panel. Does NOT delete chats - just hides the panel from view.
  ex: {"cap": "HideChats"}

USER: close this tab
```

## Response
```json
{"type":"action","cap":"CloseTab","params":{"tabId":5}}
```