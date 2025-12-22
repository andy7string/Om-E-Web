# Unified LLM Call Debug

**Generated:** 2025-12-22 16:06:09
**User Message:** lets go look at that chat
**Messages:** 6
**Capabilities:** 7
**Tokens:** ~1044 (system: 361, messages: 683)
**LLM Time:** 1039ms

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
list my chats please
```

### 2. ASSISTANT

```
Here are your chats:
1. brand new
2. 06_35_05_22_12_2025_new
3. show me my previous conversations
4. 21_21_05_22_12_2025_the
5. the future
6. life
7. 50_05_05_22_12_2025_can
Let me know if you want to open or know more about any of them!
```

### 3. USER

```
which one is your favourite
```

### 4. ASSISTANT

```
I don't have personal favorites, but I enjoy chats with lots of interesting questions and conversations, like "life" or "50_05_05_22_12_2025_can" since they seem to have more messages. Which one is your favorite?
```

### 5. USER

```
lets go look at that chat
```

### 6. USER

```
ENVIRONMENT (current state - use these for actions)
Page: OM-E Web (http://127.0.0.1:8080/)

Tabs (currently open):
  4. OM-E Web (127.0.0.1:8080) ← ACTIVE

Chats (current names - use these, not history):
  1. brand new (0 msgs) [22/Dec] ← CURRENT
  2. 06_35_05_22_12_2025_new (0 msgs) [22/Dec]
  3. show me my previous conversations (4 msgs) [22/Dec]
  4. 21_21_05_22_12_2025_the (6 msgs) [22/Dec]
  5. the future (4 msgs) [22/Dec]
  6. life (26 msgs) [22/Dec]
  7. 50_05_05_22_12_2025_can (37 msgs) [22/Dec]

Capabilities:
- GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
  ex: {"cap": "GoogleIt", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to google
- YouTubeIt: Opens YouTube with your query. Use when user wants to find videos, watch something, or look up on Yo
  ex: {"cap": "YouTubeIt", "params": {"query": "how to cook pasta"}}
  params: query: Required - what to find on YouTube
- SetCurrentChat: Makes a chat active by number or name. Use number if visible, name for fuzzy match.
  ex: {"cap": "SetCurrentChat", "params": {"name": "my project"}}
  params: chat: Optional - the chat NUMBER from visible chats list, name: Optional - chat title for fuzzy matching (e.g. 'my project', 'yesterday')
- ShowChats: Opens the chats sidebar to display saved conversations. If in orb view, switches to HUD first then o
  ex: {"cap": "ShowChats"}
- LoadChat: Returns full chat content including all messages. Use chat NUMBER from list OR chat_id directly.
  ex: {"cap": "LoadChat", "params": {"chat": 2}}
  params: chat: Optional - chat NUMBER from visible chats list, chat_id: Optional - direct chat ID string, tail: Optional - only return last N messages (default: all), offset: Optional - skip last N messages before tail (for pagination)
- SearchChats: Searches all chats for a keyword or phrase. Extract the key search term from the user's request and 
  ex: {"cap": "SearchChats", "params": {"query": "dude"}}
  params: query: Required - search query string (extract from user request)
- GetCurrentChat: Returns the current chat ID and chat data
  ex: {"cap": "GetCurrentChat"}

USER: lets go look at that chat
```

## Response
```json
{"type":"action","cap":"SetCurrentChat","params":{"name":"50_05_05_22_12_2025_can"}}
```