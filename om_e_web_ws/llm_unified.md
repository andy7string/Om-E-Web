# Unified LLM Call Debug

**Generated:** 2025-12-22 16:51:51
**User Message:** yes but it takes up space dude
**Messages:** 52
**Capabilities:** 8
**Tokens:** ~1252 (system: 361, messages: 891)
**LLM Time:** 1012ms

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

### 26. ASSISTANT

```
Executing OpenTab...
```

### 27. USER

```
much better death dude
```

### 28. ASSISTANT

```
Glad you're feeling better with the 'death' chat! Let me know if you want to do anything else with it.
```

### 29. USER

```
be atom
```

### 30. ASSISTANT

```
Executing SetTheme...
```

### 31. USER

```
be kawaii
```

### 32. ASSISTANT

```
Executing SetTheme...
```

### 33. USER

```
be ome
```

### 34. ASSISTANT

```
Executing SetCurrentChat...
```

### 35. USER

```
be the robot guy
```

### 36. ASSISTANT

```
Executing SetTheme...
```

### 37. USER

```
be the bunny cat
```

### 38. ASSISTANT

```
Executing SetTheme...
```

### 39. USER

```
be the green thing
```

### 40. ASSISTANT

```
Executing SetTheme...
```

### 41. USER

```
be the white thing
```

### 42. ASSISTANT

```
Executing SetTheme...
```

### 43. USER

```
na the bunny
```

### 44. ASSISTANT

```
Executing SetTheme...
```

### 45. USER

```
thats a cat i guess
```

### 46. ASSISTANT

```
Executing SetTheme...
```

### 47. USER

```
so how are you doing
```

### 48. ASSISTANT

```
I'm doing great, thanks for asking! How about you? Ready to dive into something fun or need help with anything?
```

### 49. USER

```
im wondering if we should not seperate the actions from the chats
```

### 50. ASSISTANT

```
That's an interesting idea! Combining actions and chats could streamline the experience and make it more intuitive. What benefits or challenges do you see with merging them?
```

### 51. USER

```
yes but it takes up space dude
```

### 52. USER

```
ENVIRONMENT (current state - use these for actions)
Page: OM-E Web (http://127.0.0.1:8080/)

Tabs (currently open):
  1. OM-E Web (127.0.0.1:8080) ← ACTIVE

Chats (current names - use these, not history):
  1. new chat (2 msgs) [22/Dec]
  2. delete the chat with the date name (2 msgs) [22/Dec]
  3. go to the new chat (2 msgs) [22/Dec]
  4. lets call this assipe (0 msgs) [22/Dec]
  5. hud view (10 msgs) [22/Dec]
  6. is. this a good name (4 msgs) [22/Dec]
  7. brand new (20 msgs) [22/Dec]
  8. show me my previous conversations (4 msgs) [22/Dec]
  9. kawaii (8 msgs) [22/Dec]
  10. the future (4 msgs) [22/Dec]
  11. death (26 msgs) [22/Dec] ← CURRENT
  12. atom (79 msgs) [22/Dec]

Capabilities:
- GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
  ex: {"cap": "GoogleIt", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to google
- YouTubeIt: Opens YouTube with your query. Use when user wants to find videos, watch something, or look up on Yo
  ex: {"cap": "YouTubeIt", "params": {"query": "how to cook pasta"}}
  params: query: Required - what to find on YouTube
- ScrollUp: Scrolls the page up by one viewport height
  ex: {"cap": "ScrollUp"}
- ZoomOut: Decreases page zoom by 15%
  ex: {"cap": "ZoomOut"}
- DeleteChat: Permanently deletes a chat by number, name, or current. Say 'delete the X chat' for name.
  ex: {"cap": "DeleteChat", "params": {"name": "my project"}}
  params: chat: Optional - chat NUMBER (omit for current chat), name: Optional - chat title for fuzzy matching
- CloseTab: Closes a tab by ID or name. Say 'close the google tab' or 'close facebook'.
  ex: {"cap": "CloseTab", "params": {"name": "google"}}
  params: tabId: Optional - numeric tab ID to close, name: Optional - tab title/name for fuzzy matching (e.g. 'google', 'facebook')
- Refresh: Reloads the current page
  ex: {"cap": "Refresh"}
- ZoomIn: Increases page zoom by 15%
  ex: {"cap": "ZoomIn"}

USER: yes but it takes up space dude
```

## Response
```json
{"type":"reply","text":"I get that! Maybe we can find a way to toggle or collapse the actions and chats to save space when you don't need them. Would you like me to help brainstorm some layout ideas?"}
```