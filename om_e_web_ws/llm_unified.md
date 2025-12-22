# Unified LLM Call Debug

**Generated:** 2025-12-22 15:49:52
**User Message:** this chat just rename it
**Messages:** 4
**Capabilities:** 8
**Tokens:** ~999 (system: 361, messages: 638)
**LLM Time:** 780ms

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
can we call it the future
```

### 2. ASSISTANT

```
Could you clarify what you'd like to call "the future"? Are you referring to a project, a concept, or something else?
```

### 3. USER

```
this chat just rename it
```

### 4. USER

```
ENVIRONMENT (current state - use these for actions)
Page: cats - Google Search (https://www.google.com/search?q=cats)

Tabs (currently open):
  1. OM-E Web (127.0.0.1:8080)
  2. OM-E Web (127.0.0.1:8080)
  3. cats - Google Search (www.google.com) ← ACTIVE

Chats (current names - use these, not history):
  1. 34_19_05_22_12_2025_the (0 msgs) [22/Dec] ← CURRENT
  2. 54_09_05_22_12_2025_can (26 msgs) [22/Dec]
  3. 50_05_05_22_12_2025_can (37 msgs) [22/Dec]

Capabilities:
- GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
  ex: {"cap": "GoogleIt", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to google
- YouTubeIt: Opens YouTube with your query. Use when user wants to find videos, watch something, or look up on Yo
  ex: {"cap": "YouTubeIt", "params": {"query": "how to cook pasta"}}
  params: query: Required - what to find on YouTube
- RenameChat: Updates the title of a chat by number, name, or current. Say 'rename X chat to Y' or 'rename it to Y
  ex: {"cap": "RenameChat", "params": {"title": "My New Title"}}
  params: chat: Optional - chat NUMBER (omit for current chat), name: Optional - existing chat title for fuzzy matching, title: Required - the new title
- DeleteChat: Permanently deletes a chat by number, name, or current. Say 'delete the X chat' for name.
  ex: {"cap": "DeleteChat", "params": {"name": "my project"}}
  params: chat: Optional - chat NUMBER (omit for current chat), name: Optional - chat title for fuzzy matching
- SetCurrentChat: Makes a chat active by number or name. Use number if visible, name for fuzzy match.
  ex: {"cap": "SetCurrentChat", "params": {"name": "my project"}}
  params: chat: Optional - the chat NUMBER from visible chats list, name: Optional - chat title for fuzzy matching (e.g. 'my project', 'yesterday')
- CreateChat: Creates a new chat file and returns the chat_id
  ex: {"cap": "CreateChat", "params": {"title": "My Chat"}}
  params: title: Optional - title for the chat, page_url: Optional - page URL for metadata, page_title: Optional - page title for metadata
- GetCurrentChat: Returns the current chat ID and chat data
  ex: {"cap": "GetCurrentChat"}
- ShowChats: Opens the chats sidebar to display saved conversations. If in orb view, switches to HUD first then o
  ex: {"cap": "ShowChats"}

USER: this chat just rename it
```

## Response
```json
{"type":"action","cap":"RenameChat","params":{"title":"the future"}}
```