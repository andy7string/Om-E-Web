# Unified LLM Call Debug

**Generated:** 2025-12-23 13:43:19
**User Message:** this is interesting
**Messages:** 8
**Capabilities:** 7
**Tokens:** ~1185 (system: 392, messages: 793)
**LLM Time:** 1124ms

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

**Search** - need more capabilities (current list doesn't fit):
```json
{"type":"search","query":"what to search for"}
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

### 1. SYSTEM

```
[**Recent actions (this session):**
- SwitchView [chat:MikeHunt]
- ShowChats [chat:MikeHunt]
- SearchChats: lets search for chat1 [chat:MikeHunt]
- CloseSearch: na close the search [chat:MikeHunt]
- CreateChat: all good i need a new chat now please [chat:MikeHunt]
- GoogleIt: lets find out about it on google [chat:valeria]]
```

### 2. USER

```
valeria
```

### 3. ASSISTANT

```
Hey Valeria! How can I help you today?
```

### 4. USER

```
so where is valeria
```

### 5. ASSISTANT

```
Valeria is the name of one of your chat sessions here. You are currently in the 'valeria' chat. How can I assist you with Valeria?
```

### 6. USER

```
lets find out about it on google
```

### 7. USER

```
this is interesting
```

### 8. USER

```
ENVIRONMENT (current state - use these for actions)
Page: Valeria - Google Search (https://www.google.com/search?q=Valeria)

Tabs (currently open):
  1. OM-E Web (127.0.0.1:8080)
  2. Extensions (extensions)
  3. Valeria - Google Search (www.google.com) ← ACTIVE

Capabilities:
- GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
  ex: {"cap": "GoogleIt", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to google
- YouTubeIt: Opens YouTube with your query. Use when user wants to find videos, watch something, or look up on Yo
  ex: {"cap": "YouTubeIt", "params": {"query": "how to cook pasta"}}
  params: query: Required - what to find on YouTube
- SetTemperature: Adjusts LLM temperature (0.0-2.0)
  ex: {"cap": "SetTemperature", "params": {"temperature": 0.7}}
  params: temperature: Required - temperature value
- ScrollUp: Scrolls the page up by one viewport height
  ex: {"cap": "ScrollUp"}
- RenameChat: Updates the title of a chat by number, name, or current. Say 'rename X chat to Y' or 'rename it to Y
  ex: {"cap": "RenameChat", "params": {"title": "My New Title"}}
  params: chat: Optional - chat NUMBER (omit for current chat), name: Optional - existing chat title for fuzzy matching, title: Required - the new title
- CreateChat: Creates a new chat file and returns the chat_id
  ex: {"cap": "CreateChat", "params": {"title": "My Chat"}}
  params: title: Optional - title for the chat, page_url: Optional - page URL for metadata, page_title: Optional - page title for metadata
- SetLLMModel: Changes the model for a provider
  ex: {"cap": "SetLLMModel", "params": {"model": "gpt-4"}}
  params: provider: Optional - provider to update (default: active), model: Required - model name/ID

[Relevant stored content:]
- Gerald the fox jumped over Buster the dog near the old oak tree in Springfield park by the river; cat Whiskers is 7 years old and eats tuna treats. The Eiffel Tower in Paris is 330 meters tall, completed in 1889; Mount Everest is 8849 meters tall, located in Nepal near Tibet. Australia's capital is Canberra with about 450,000 people. The secret password is blueberry42.
- User is testing the system's ability to handle large text inputs by submitting a lengthy message to trigger summarization and storage for later retrieval. They describe the infrastructure managing large content like code or documents in chat.

[User facts:]
- User's name is Andy
- User likes to think of the assistant as a friend
- User likes optimistic things because it helps them be happy

USER: this is interesting
```

## Response
```json
{"type":"reply","text":"I'm glad you find it interesting, Andy! Is there anything specific about Valeria or the search results you'd like to explore or discuss?"}
```