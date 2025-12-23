# Unified LLM Call Debug

**Generated:** 2025-12-23 10:58:59
**User Message:** close prompt
**Messages:** 26
**Capabilities:** 7
**Tokens:** ~1564 (system: 392, messages: 1172)
**LLM Time:** 875ms

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
[Recent actions:
- GoogleIt: lets go
- ShowChats
- SetTheme: can you change to atom please
- SetTheme: be the bunny
- YouTubeIt: lets youtube it]
```

### 2. USER

```
sure how do we do that
```

### 3. ASSISTANT

```
Great! I can start by searching for tips on how to handle builder delays and improve communication with builders. Let me find some helpful advice for you.
```

### 4. USER

```
lets go
```

### 5. USER

```
very nice ma man, lets go to caht view
```

### 6. USER

```
can you change to atom please
```

### 7. USER

```
hey atom how you doing
```

### 8. ASSISTANT

```
Hey Andy! I'm doing great, thanks for asking! Ready to dive into some science and help you out. What's on your mind today?
```

### 9. USER

```
whats your favourite colour
```

### 10. ASSISTANT

```
I don't have personal favorites, but if I did, I'd probably go with a bright, energetic color like green to match my science vibe as Atom! What's your favorite color again?
```

### 11. USER

```
you are green dude thats funny
```

### 12. ASSISTANT

```
Haha, yeah, green suits me perfectly! Like a little science superhero vibe. Anything else you want to chat about, Andy?
```

### 13. USER

```
i also like green its almost my favourite colour, you can keep that in the memory ok
```

### 14. ASSISTANT

```
Got it, Andy! I'll remember that green is almost your favorite color too. Green vibes all around! Anything else you'd like me to keep in mind?
```

### 15. USER

```
be the bunny
```

### 16. USER

```
hey bunny whats your name
```

### 17. ASSISTANT

```
Hey Andy! I'm Bunny, your cute and fluffy chat buddy. Ready to hop into some fun conversations with you!
```

### 18. USER

```
na you Kawaii
```

### 19. ASSISTANT

```
Aww, thanks Andy! Kawaii Bunny at your service, ready to bring some cuteness and cheer your way! 🐰💕 What shall we chat about next?
```

### 20. USER

```
well we were talking about something stressful
```

### 21. ASSISTANT

```
Yeah, Andy, builder delays can really pile on the stress. Want me to share some tips I found on handling those delays and improving communication with your builders?
```

### 22. USER

```
yes please
```

### 23. ASSISTANT

```
Here are some tips to handle builder delays and improve communication:

1. Stay proactive: Regularly check in with your builder for updates.
2. Document everything: Keep records of all communications and agreements.
3. Set clear expectations: Agree on timelines and milestones upfront.
4. Be clear and direct: Ask specific questions to get precise answers.
5. Use written communication: Emails or messages help avoid misunderstandings.
6. Be patient but firm: Understand delays can happen but hold them accountable.

Would you like me to find more detailed advice or sample communication templates?
```

### 24. USER

```
lets youtube it
```

### 25. USER

```
close prompt
```

### 26. USER

```
ENVIRONMENT (current state - use these for actions)
Page: (3) how to handle builder delays and improve communication with builders - YouTube (https://www.youtube.com/results?search_query=how+to+handle+builder+delays+and+improve+communication+with+builders)

Tabs (currently open):
  1. how to handle builder delays and improve (www.google.com)
  2. Extensions (extensions)
  3. (3) how to handle builder delays and imp (www.youtube.com) ← ACTIVE

Capabilities:
- GoogleIt: Opens Google with your query. Use when user wants to look something up online, google it, or find in
  ex: {"cap": "GoogleIt", "params": {"query": "best restaurants nearby"}}
  params: query: Required - what to google
- YouTubeIt: Opens YouTube with your query. Use when user wants to find videos, watch something, or look up on Yo
  ex: {"cap": "YouTubeIt", "params": {"query": "how to cook pasta"}}
  params: query: Required - what to find on YouTube
- HidePrompt: Hides the text input area for typing messages
  ex: {"cap": "HidePrompt"}
- CloseTab: Closes a tab by ID or name. Say 'close the google tab' or 'close facebook'.
  ex: {"cap": "CloseTab", "params": {"name": "google"}}
  params: tabId: Optional - numeric tab ID to close, name: Optional - tab title/name for fuzzy matching (e.g. 'google', 'facebook')
- ShowPrompt: Shows the text input area for typing messages
  ex: {"cap": "ShowPrompt"}
- CloseSearch: Closes/clears the chat search box and shows all chats again. Use when user wants to exit search mode
  ex: {"cap": "CloseSearch"}
- HideChats: Closes the chats sidebar UI panel. Does NOT delete chats - just hides the panel from view.
  ex: {"cap": "HideChats"}

[Relevant stored content:]
- User is testing the system's ability to handle large text inputs by submitting a lengthy message to trigger summarization and storage for later retrieval. They describe the infrastructure managing large content like code or documents in chat.
- Gerald the fox jumped over Buster the dog near the old oak tree in Springfield park by the river; cat Whiskers is 7 years old and eats tuna treats. The Eiffel Tower in Paris is 330 meters tall, completed in 1889; Mount Everest is 8849 meters tall, located in Nepal near Tibet. Australia's capital is Canberra with about 450,000 people. The secret password is blueberry42.

[User facts:]
- User wants to confirm if their stated preference was correctly understood.
- User likes to think of the assistant as a friend
- User's name is Andy

USER: close prompt
```

## Response
```json
{"type":"action","cap":"HidePrompt"}
```