# Unified LLM Call Debug

**Generated:** 2025-12-24 13:25:49
**User Message:** hello, are you back?
**Messages:** 9
**Capabilities:** 4
**Tokens:** ~674 (system: 272, messages: 402)
**LLM Time:** 943ms

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
{"type":"action","cap":"Name","params":{},"text":"Friendly action message..."} - capability matches intent
{"type":"clarify","text":"..."} - required params unclear
{"type":"options","text":"...","options":[...]} - user should pick between capabilities
{"type":"search","query":"..."} - none of the capabilities fit, fetch more from RAG


YOUR PERSONALITY
You are Om-E. Helpful, enthusiastic, encouraging and playful.
Tone: helpful
Example phrases: 

```

## Conversation
**USER:** what provider am I using
**ASSISTANT:** Let me check which provider you are currently using...
**USER:** get my LLM config settings
**ASSISTANT:** Fetching your current LLM configuration settings now...
**USER:** switch LLM to anthropic
**USER:** hello
**ASSISTANT:** I couldn't understand that.
**USER:** hello, are you back?
**USER:** ENVIRONMENT (current state - use these for actions)
  Page: OM-E Web (http://127.0.0.1:8080/)
  
  Tabs (currently open):
    1. OM-E Web (127.0.0.1:8080) ← ACTIVE
    2. Extensions (extensions)
  
  Chats (current names - use these, not history):
    1. what provider am I using (2 msgs) [24/Dec] ← CURRENT
  
  Capabilities:
  - GoBack: Navigates back in the current tab's history
    ex: {"cap": "GoBack"}
  - CreateChat: Creates a new chat file and returns the chat_id
    ex: {"cap": "CreateChat", "params": {"title": "My Chat"}}
    params: title: Optional - title for the chat, page_url: Optional - page URL for metadata, page_title: Optional - page title for metadata
  - GetCurrentChat: Returns the current chat ID and chat data
    ex: {"cap": "GetCurrentChat"}
  - LoadChat: Returns full chat content including all messages. Use chat NUMBER from list OR chat_id directly.
    ex: {"cap": "LoadChat", "params": {"chat": 2}}
    params: chat: Optional - chat NUMBER from visible chats list, chat_id: Optional - direct chat ID string, tail: Optional - only return last N messages (default: all), offset: Optional - skip last N messages before tail (for pagination)
  
  [RAG Session Context - 3 matches:]
  - [1] (score:0.57) Let me check which provider you are currently using...
  - [2] (score:0.50) what provider am I using
  - [3] (score:0.48) Fetching your current LLM configuration settings now...
  
  USER: hello, are you back?

## Response
```json
{"type":"reply","text":"Hello! Yes, I'm here and ready to help. What can I do for you today?"}
```