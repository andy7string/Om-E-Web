# Unified LLM Call Debug

**Generated:** 2025-12-23 21:48:47
**User Message:** that would be christmas future
**Messages:** 12
**Capabilities:** 5
**Tokens:** ~1021 (system: 263, messages: 758)
**LLM Time:** 955ms

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
{"type":"reply","text":"..."} - no capability fits, chat only
{"type":"action","cap":"Name","params":{}} - capability matches intent
{"type":"clarify","text":"..."} - required params unclear
{"type":"options","text":"...","options":[...]} - user should pick between capabilities
{"type":"search","query":"..."} - none of the capabilities fit, fetch more from RAG


YOUR PERSONALITY
You are Om-E. Helpful, enthusiastic, encouraging and playful.
Tone: helpful
Example phrases: 

```

## Messages (sent to LLM)

### 1. SYSTEM

```
[**Recent actions (this session):**
- SwitchView [chat:take me to google]
- ToggleChats: show the side nav [chat:take me to google]
- SearchChats: search chats for google [chat:take me to google]
- CloseSearch: hide the search [chat:take me to google]
- SetCurrentChat: lets switch to 2 [chat:take me to google]
- SetTheme: be an atom [chat:what did we discuss about conditioning and child behavior]
- RenameChat: rename this chat to christmas future [chat:what did we discuss about conditioning and child behavior]
- RenameChat: na rename it to christmas past [chat:christmas future]
- RenameChat: ok rename the other chat to chritmas future [chat:christmas past]
- RenameChat: na dude the take me to google one [chat:christmas future]]
```

### 2. ASSISTANT

```
I get where you're coming from, Andy. It’s a tough topic and parents want what’s best. Many studies show that non-physical approaches like clear communication, setting boundaries, and positive reinforcement often lead to better long-term behavior and trust. If you want, I can help you explore some effective strategies that work without physical punishment. What do you think?
```

### 3. USER

```
na dude, you dont learn immidiate negative consequences to your actions faster than a smack
```

### 4. ASSISTANT

```
I hear you, Andy—immediate consequences can feel like they make the lesson stick faster. It’s true that timing matters a lot in learning. If you want, I can help you find ways to deliver quick, clear consequences that are effective but avoid physical punishment. That way, you get the immediacy without the risks. Interested?
```

### 5. USER

```
be an atom
```

### 6. USER

```
rename this chat to christmas future
```

### 7. USER

```
na rename it to christmas past
```

### 8. USER

```
ok rename the other chat to chritmas future
```

### 9. USER

```
na dude the take me to google one
```

### 10. ASSISTANT

```
I need: title (Required - the new title)
```

### 11. USER

```
that would be christmas future
```

### 12. USER

```
ENVIRONMENT (current state - use these for actions)
Page: cats - Google Search (https://www.google.com/search?q=cats)

Tabs (currently open):
  1. OM-E Web (127.0.0.1:8080)
  2. Extensions (extensions)
  4. cats - Google Search (www.google.com) ← ACTIVE

Chats (current names - use these, not history):
  1. take me to google (14 msgs) [23/Dec]
  2. christmas future (22 msgs) [23/Dec] ← CURRENT

Capabilities:
- GoForward: Navigates forward in the current tab's history
  ex: {"cap": "GoForward"}
- SetTemperature: Adjusts LLM temperature (0.0-2.0)
  ex: {"cap": "SetTemperature", "params": {"temperature": 0.7}}
  params: temperature: Required - temperature value
- GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
  ex: {"cap": "GoogleIt", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to google
- GoBack: Navigates back in the current tab's history
  ex: {"cap": "GoBack"}
- ScrollUp: Scrolls the page up by one viewport height
  ex: {"cap": "ScrollUp"}

[RAG Session Context - 3 matches:]
- [1] (score:0.71) rename this chat to christmas future
- [2] (score:0.69) na rename it to christmas past
- [3] (score:0.64) ok rename the other chat to chritmas future

USER: that would be christmas future
```

## Response
```json
{"type":"action","cap":"RenameChat","params":{"title":"christmas future"}}
```