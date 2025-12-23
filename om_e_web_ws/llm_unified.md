# Unified LLM Call Debug

**Generated:** 2025-12-23 21:29:41
**User Message:** take me to google
**Messages:** 1
**Capabilities:** 3
**Tokens:** ~455 (system: 263, messages: 192)
**LLM Time:** 1798ms

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

### 1. USER

```
ENVIRONMENT (current state - use these for actions)
Page: OM-E Web (http://127.0.0.1:8080/)

Tabs (currently open):
  1. OM-E Web (127.0.0.1:8080) ← ACTIVE
  2. Extensions (extensions)

Capabilities:
- GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
  ex: {"cap": "GoogleIt", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to google
- ShowPrompt: Shows the text input area for typing messages
  ex: {"cap": "ShowPrompt"}
- OpenTab: Opens a URL or switches to existing tab. Auto-switches if tab already open.
  ex: {"cap": "OpenTab", "params": {"url": "https://google.com"}}
  params: url: Optional - URL or site name (e.g. 'google.com', 'youtube')

USER: take me to google
```

## Response
```json
{"type":"action","cap":"OpenTab","params":{"url":"https://google.com"}}
```