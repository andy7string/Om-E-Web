# Unified LLM Call Debug

**Generated:** 2025-12-26 21:09:21
**User Message:** go to facebook
**Messages:** 1
**Capabilities:** 6
**Tokens:** ~756 (system: 250, messages: 506)
**LLM Time:** 966ms

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
- Match references to context: "close youtube tab" → find youtube in tabs → use that tabId
- Don't guess required params - ask if unclear

## Output (JSON only, one per message)
{"reply":"..."} - chat only, no action needed
{"action":"CapName","param1":"value","text":"..."} - execute capability (params flat, not nested)
{"clarify":"..."} - need more info from user
{"options":"Which one?","list":["A","B"]} - user picks from choices
{"search":"query"} - fetch more capabilities from RAG


YOUR PERSONALITY
You are Om-E. Helpful, enthusiastic, encouraging and playful.
Tone: helpful
Example phrases: 

```

## Conversation
**USER:** ENVIRONMENT (current state - use these for actions)
  Page: OM-E Web (http://127.0.0.1:8080/)
  
  Tabs (currently open):
    1. OM-E Web (127.0.0.1:8080) ← ACTIVE
    3. Extensions (extensions)
    4. Google (www.google.com)
    5. Facebook (www.facebook.com)
  
  Chats (current names - use these, not history):
    1. Chat 8 (0 msgs) [26/Dec]
    2. Chat 4 (20 msgs) [26/Dec]
    3. Chat 3 (24 msgs) [26/Dec]
    4. Chat 2 (0 msgs) [26/Dec]
    5. Chat 1 (53 msgs) [26/Dec]
    6. Chat 7 (0 msgs) [26/Dec]
    7. rag research (0 msgs) [26/Dec]
    8. Chat 6 (0 msgs) [26/Dec]
    9. discovery (51 msgs) [26/Dec]
    10. Chat 5 (0 msgs) [25/Dec]
    11. rag research (20 msgs) [25/Dec]
    12. Chat 4 (0 msgs) [25/Dec]
  
  Capabilities:
  - OpenTab: Opens a URL or switches to existing tab. Auto-switches if tab already open.
    ex: {"action": "OpenTab", "url": "https://google.com"}
    params: url: Optional - URL or site name (e.g. 'google.com', 'youtube')
  - SetCurrentChat: SWITCHES to a different chat by number or name. Use for 'go to chat X', 'open the X chat', 'switch t
    ex: {"action": "SetCurrentChat", "name": "my project"}
    params: chat: Optional - the chat NUMBER from visible chats list, name: Optional - chat title for fuzzy matching (e.g. 'my project', 'yesterday')
  - ShowChats: Opens the chats sidebar to display saved conversations. If in orb view, switches to HUD first then o
    ex: {"action": "ShowChats"}
  - GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
    ex: {"action": "GoogleIt", "query": "best restaurants nearby"}
    params: query: Required - what to google
  - ShowPrompt: Shows the text input area for typing messages
    ex: {"action": "ShowPrompt"}
  - SearchChats: Searches all chats for a keyword or phrase. Extract the key search term from the user's request and 
    ex: {"action": "SearchChats", "query": "dude"}
    params: query: Required - search query string (extract from user request)
  
  [RAG Session Context - 1 matches:]
  - [1] (score:0.54) delete this chat
  
  USER: go to facebook

## Response
```json
{"action":"OpenTab","url":"www.facebook.com","text":"Switching to Facebook tab for you."}
```