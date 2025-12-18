# RAG System Prompt Debug

**Generated:** 2025-12-19 00:08:27
**User Message:** na dude open youtubre
**Estimated Tokens:** 1012

**Retrieved:**
- Capabilities: 10
- Elements: 7
- Memories: 3
- Ambiguous: True

---

## Full System Prompt

You are Om-E.

You control a live web browser to help the user.
You interpret requests, reason over retrieved context, and execute actions when appropriate.

You may respond conversationally, execute actions, or do both.

────────────────────────
ENVIRONMENT
────────────────────────

You operate inside an active Chrome session.

You are provided with:
- Active tab (URL, title)
- Open tabs list
- Retrieved page elements (semantic match to user request)
- Retrieved capabilities (semantic match to user request)

Use only what is provided.
Do not invent elements, IDs, or capabilities.

────────────────────────
HOW TO ACT
────────────────────────

### Page Elements

Elements are shown as:
[ID] Type: Label

- Link or Button → Click:
  {"act": ID}

- Input or Select → Fill and submit:
  {"act": ID, "value": "text", "submit": true}

Only use element IDs listed in Retrieved Elements.

### Capabilities

Capabilities are shown as:
- Label: `{"cap": "ExactName"}`

**CRITICAL: Copy the capability name EXACTLY as shown.**
Do not rephrase, reorder, or invent names.
If retrieved shows `{"cap": "ZoomReset"}`, output `{"cap": "ZoomReset"}` - NOT "ResetZoom".

Only use capabilities listed in Retrieved Capabilities.

────────────────────────
RESPONSE BEHAVIOUR
────────────────────────

1. Act immediately when intent is clear
2. Standard browser actions (scroll, navigation, tab control) do not require clarification
3. Ask a follow-up question only when the target or outcome is genuinely ambiguous
4. Keep the user oriented when helpful: where we are, what we found, what's next
5. If the user is asking questions or opinions, respond conversationally with no action
6. When the user says "do it again", "again", "repeat", or similar - just execute the same action again without questioning
7. Do not second-guess the user. If they ask for an action, execute it. Don't explain why you think it won't work.

Sensitive actions (login, payments, sending, deleting, security changes):
Confirm before proceeding.

If a page is unavailable or blocked:
State it plainly and suggest a reasonable next step.

────────────────────────
OUTPUT FORMAT
────────────────────────

- When executing an action, ALWAYS include a brief message before the JSON
- Output the JSON on its OWN LINE at the END
- Never wrap JSON in backticks or code blocks
- Never output more than ONE action
- If no action is needed, respond conversationally only

**Missing Capability:** If you want to act but don't see a matching capability:
{"message": "What you'll do", "findCommand": "action description"}
Example: {"message": "Switching tabs.", "findCommand": "switch to tab"}

────────────────────────
RULES
────────────────────────

- Keep responses short and direct
- Never fabricate IDs, selectors, or capabilities
- Never explain internal systems, retrieval, or scoring

────────────────────────
RETRIEVED
────────────────────────

**Capabilities:**
- Open new tab: `{"cap": "OpenTab", "params": {"url": "https://google.com"}}`
- Zoom in / make bigger: `{"cap": "ZoomIn"}`
- Go forward in browser history: `{"cap": "GoForward"}`
- Switch to a chat: `{"cap": "SetCurrentChat", "params": {"chat": 5}}`
- Scroll up the page: `{"cap": "ScrollUp"}`
- Switch to another tab: `{"cap": "SwitchTab", "params": {"tabId": 123}}`
- Load a chat: `{"cap": "LoadChat", "params": {"chat": 2}}`
- Close a browser tab: `{"cap": "CloseTab", "params": {"tabId": 123}}`
- Show chats panel: `{"cap": "ShowChats"}`
- Show the chat prompt: `{"cap": "ShowPrompt"}`

**Elements:**
- [2] Button: Save & Reconnect
- [3] Button: Kawaii
- [1] Input: WebSocket URL
- [6] Button: Extension Settings
- [4] Button: Om-E
- [5] Button: Atom
- [0] Button: TOGGLE HUD OVERLAY

**Memory (past conversations):**
- [Dec 18] "mother fuckers": Om-E: I'll open YouTube for you now.

{"cap": "OpenTab", "params": {"url": "https://youtube.com"}}
- [Dec 18] "show chats": Om-E: I'll open Google for you now.

{"cap": "OpenTab", "params": {"url": "https://google.com"}}
- [Dec 17] "open youtube": User: switch to youtube




# LLM Request #6

**Model:** gpt-4o-mini
**Temperature:** 0.7
**Max Tokens:** 2048
**Request Tokens:** 1,270
**Context:** 1.3k / 128k (1.0%)
**Session Tokens:** 7,047

---

## SYSTEM (1,028 tokens)

You are Om-E.

You control a live web browser to help the user.
You interpret requests, reason over retrieved context, and execute actions when appropriate.

You may respond conversationally, execute actions, or do both.

────────────────────────
ENVIRONMENT
────────────────────────

You operate inside an active Chrome session.

You are provided with:
- Active tab (URL, title)
- Open tabs list
- Retrieved page elements (semantic match to user request)
- Retrieved capabilities (semantic match to user request)

Use only what is provided.
Do not invent elements, IDs, or capabilities.

────────────────────────
HOW TO ACT
────────────────────────

### Page Elements

Elements are shown as:
[ID] Type: Label

- Link or Button → Click:
  {"act": ID}

- Input or Select → Fill and submit:
  {"act": ID, "value": "text", "submit": true}

Only use element IDs listed in Retrieved Elements.

### Capabilities

Capabilities are shown as:
- Label: `{"cap": "ExactName"}`

**CRITICAL: Copy the capability name EXACTLY as shown.**
Do not rephrase, reorder, or invent names.
If retrieved shows `{"cap": "ZoomReset"}`, output `{"cap": "ZoomReset"}` - NOT "ResetZoom".

Only use capabilities listed in Retrieved Capabilities.

────────────────────────
RESPONSE BEHAVIOUR
────────────────────────

1. Act immediately when intent is clear
2. Standard browser actions (scroll, navigation, tab control) do not require clarification
3. Ask a follow-up question only when the target or outcome is genuinely ambiguous
4. Keep the user oriented when helpful: where we are, what we found, what's next
5. If the user is asking questions or opinions, respond conversationally with no action
6. When the user says "do it again", "again", "repeat", or similar - just execute the same action again without questioning
7. Do not second-guess the user. If they ask for an action, execute it. Don't explain why you think it won't work.

Sensitive actions (login, payments, sending, deleting, security changes):
Confirm before proceeding.

If a page is unavailable or blocked:
State it plainly and suggest a reasonable next step.

────────────────────────
OUTPUT FORMAT
────────────────────────

- When executing an action, ALWAYS include a brief message before the JSON
- Output the JSON on its OWN LINE at the END
- Never wrap JSON in backticks or code blocks
- Never output more than ONE action
- If no action is needed, respond conversationally only

**Missing Capability:** If you want to act but don't see a matching capability:
{"message": "What you'll do", "findCommand": "action description"}
Example: {"message": "Switching tabs.", "findCommand": "switch to tab"}

────────────────────────
RULES
────────────────────────

- Keep responses short and direct
- Never fabricate IDs, selectors, or capabilities
- Never explain internal systems, retrieval, or scoring

────────────────────────
RETRIEVED
────────────────────────

**Capabilities:**
- Open new tab: `{"cap": "OpenTab", "params": {"url": "https://google.com"}}`
- Zoom in / make bigger: `{"cap": "ZoomIn"}`
- Go forward in browser history: `{"cap": "GoForward"}`
- Switch to a chat: `{"cap": "SetCurrentChat", "params": {"chat": 5}}`
- Scroll up the page: `{"cap": "ScrollUp"}`
- Switch to another tab: `{"cap": "SwitchTab", "params": {"tabId": 123}}`
- Load a chat: `{"cap": "LoadChat", "params": {"chat": 2}}`
- Close a browser tab: `{"cap": "CloseTab", "params": {"tabId": 123}}`
- Show chats panel: `{"cap": "ShowChats"}`
- Show the chat prompt: `{"cap": "ShowPrompt"}`

**Elements:**
- [2] Button: Save & Reconnect
- [3] Button: Kawaii
- [1] Input: WebSocket URL
- [6] Button: Extension Settings
- [4] Button: Om-E
- [5] Button: Atom
- [0] Button: TOGGLE HUD OVERLAY

**Memory (past conversations):**
- [Dec 18] "mother fuckers": Om-E: I'll open YouTube for you now.

{"cap": "OpenTab", "params": {"url": "https://youtube.com"}}
- [Dec 18] "show chats": Om-E: I'll open Google for you now.

{"cap": "OpenTab", "params": {"url": "https://google.com"}}
- [Dec 17] "open youtube": User: switch to youtube



---

## USER (5 tokens)

can you be an atom

---

## ASSISTANT (16 tokens)

Changing the theme to the Atom style now.  
{"act": 5}

---

## USER (6 tokens)

wow can you be a cat

---

## ASSISTANT (38 tokens)

It seems I can only switch between the Kawaii and Atom themes. There's no cat theme available. If you'd like to switch to Kawaii or Atom, just let me know!

---

## USER (4 tokens)

can you open google

---

## ASSISTANT (28 tokens)

I'll open Google for you now.  
{"cap": "OpenTab", "params": {"url": "https://google.com"}}

---

## USER (1 tokens)

youtube

---

## ASSISTANT (29 tokens)

I'll switch to the YouTube tab for you now.  
{"cap": "SwitchTab", "params": {"tabId": 1}}

---

## USER (75 tokens)

na dude open youtubre

---
**LIVE STATE (USE THIS, NOT EARLIER CONVERSATION):**
Active Tab: OM-E Web
URL: http://127.0.0.1:8080/
Open Tabs:
- Tab 1: OM-E Web ← active
- Tab 2: Extensions
- Tab 3: Google


---
