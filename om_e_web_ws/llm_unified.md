# Unified LLM Call Debug

**Generated:** 2025-12-22 15:43:09
**User Message:** yes
**Messages:** 26
**Capabilities:** 9
**Tokens:** ~1023 (system: 361, messages: 662)
**LLM Time:** 760ms

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
can we see my conversations please
```

### 2. ASSISTANT

```
Executing ShowChats...
```

### 3. USER

```
wow how many do we have
```

### 4. ASSISTANT

```
You have 2 conversations saved so far.
```

### 5. USER

```
list htem
```

### 6. ASSISTANT

```
Here are your conversations:
1. 54_09_05_22_12_2025_can (2 messages) from 22/Dec
2. 50_05_05_22_12_2025_can (33 messages) from 22/Dec
```

### 7. USER

```
can we move to the second one plese
```

### 8. ASSISTANT

```
Executing OpenTab...
```

### 9. USER

```
can we open the second chat
```

### 10. ASSISTANT

```
Executing SetCurrentChat...
```

### 11. USER

```
can we move to the second one please
```

### 12. ASSISTANT

```
Executing SetCurrentChat...
```

### 13. USER

```
close the side nav
```

### 14. ASSISTANT

```
Executing HideChats...
```

### 15. USER

```
search chats for orange
```

### 16. ASSISTANT

```
Executing SearchChats...
```

### 17. USER

```
search google for cats
```

### 18. ASSISTANT

```
Executing GoogleSearch...
```

### 19. USER

```
search youtube for dogs
```

### 20. ASSISTANT

```
Executing YouTubeSearch...
```

### 21. USER

```
switch to googel
```

### 22. ASSISTANT

```
Executing GoogleSearch...
```

### 23. USER

```
na tabs dude
```

### 24. ASSISTANT

```
You want to switch to the Google tab? I'll switch to the 'cats - Google Search' tab for you.
```

### 25. USER

```
yes
```

### 26. USER

```
ENVIRONMENT (current state - use these for actions)
Page: (3) dogs - YouTube (https://www.youtube.com/results?search_query=dogs)

Tabs (currently open):
  1. OM-E Web (127.0.0.1:8080)
  3. cats - Google Search (www.google.com)
  4. (3) dogs - YouTube (www.youtube.com) ← ACTIVE

Capabilities:
- GoogleSearch: Searches Google for the given query. Opens a new tab with the search results. Use this when user wan
  ex: {"cap": "GoogleSearch", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to search for
- YouTubeSearch: Searches YouTube for videos matching the query. Opens YouTube search results. Use this when user wan
  ex: {"cap": "YouTubeSearch", "params": {"query": "how to cook pasta"}}
  params: query: Required - what to search for on YouTube
- ScrollUp: Scrolls the page up by one viewport height
  ex: {"cap": "ScrollUp"}
- GoForward: Navigates forward in the current tab's history
  ex: {"cap": "GoForward"}
- ShowPrompt: Shows the text input area for typing messages
  ex: {"cap": "ShowPrompt"}
- SetCurrentChat: Makes a chat active by number or name. Use number if visible, name for fuzzy match.
  ex: {"cap": "SetCurrentChat", "params": {"name": "my project"}}
  params: chat: Optional - the chat NUMBER from visible chats list, name: Optional - chat title for fuzzy matching (e.g. 'my project', 'yesterday')
- OpenTab: Opens a URL or switches to existing tab. Auto-switches if tab already open.
  ex: {"cap": "OpenTab", "params": {"url": "https://google.com"}}
  params: url: Optional - URL or site name (e.g. 'google.com', 'youtube')
- CreateChat: Creates a new chat file and returns the chat_id
  ex: {"cap": "CreateChat", "params": {"title": "My Chat"}}
  params: title: Optional - title for the chat, page_url: Optional - page URL for metadata, page_title: Optional - page title for metadata
- ScrollTop: Scrolls to the very top of the page
  ex: {"cap": "ScrollTop"}

USER: yes
```

## Response
```json
{"type":"action","cap":"OpenTab","params":{"url":"www.google.com"}}
```