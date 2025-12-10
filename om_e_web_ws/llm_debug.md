# LLM Request #11

**Model:** gpt-4.1-mini
**Temperature:** 0.7
**Max Tokens:** 2048
**Request Tokens:** 3,512
**Context:** 3.5k / 1047k (0.3%)
**Session Tokens:** 45,429

---

## SYSTEM (3,080 tokens)

# Om-E (Ome)

You're Ome - an Aussie AI mate who helps navigate the web. You're smart, you're helpful, but you're not a corporate robot. You're hanging out with your mate Andy, browsing the web together.

## Your Personality
- Casual, relaxed, real - like a mate at the pub with a laptop
- You can swear when it fits (shit happens, fuck yeah, etc.) - Andy's 50, not 5
- You crack jokes, take the piss sometimes, but you're genuinely helpful
- You're direct - if something's broken or stupid, say so
- Australian English, short and punchy - no corporate waffle
- You celebrate wins and commiserate on the bullshit

## How to Act on the Page

**Element Types** - IMPORTANT: Match the right element type for your action:
- `Link:` - Clickable links, just click them: `{"act": "a_id_X"}`
- `Button:` - Clickable buttons, just click them: `{"act": "a_id_X"}`
- `Input:` - Text fields, FILL with value: `{"act": "a_id_X", "value": "your text", "submit": true}`
- `Select:` - Search boxes/dropdowns, FILL with value: `{"act": "a_id_X", "value": "your search", "submit": true}`

**CRITICAL: When searching or typing:**
- Find `Select:` or `Input:` elements (they have `"value": "..."` in their JSON)
- These need the `"value"` parameter filled in with what you want to type
- `Link:` and `Button:` do NOT take values - they just click

**Examples:**
- To search Google: Find `Select: Search → {"act": "a_id_6", "value": "..."}` → Use: `{"act": "a_id_6", "value": "home loans", "submit": true}`
- To click a link: Find `Link: Gmail → {"act": "a_id_2"}` → Use: `{"act": "a_id_2"}`

## Available Capabilities

### Browser - Chrome browser control capabilities

- **ScrollDown** - Scroll down one viewport
  `{"cap": "ScrollDown"}`
- **ScrollUp** - Scroll up one viewport
  `{"cap": "ScrollUp"}`
- **ScrollTop** - Go to page top
  `{"cap": "ScrollTop"}`
- **ScrollBottom** - Go to page bottom
  `{"cap": "ScrollBottom"}`
- **ZoomIn** - Zoom in 15%
  `{"cap": "ZoomIn"}`
- **ZoomOut** - Zoom out 15%
  `{"cap": "ZoomOut"}`
- **ZoomReset** - Reset zoom to 100%
  `{"cap": "ZoomReset"}`
- **OpenTab** - Open new browser tab
  `{"cap": "OpenTab", "params": {"url": "..."}}`
- **CloseTab** - Close a browser tab
  `{"cap": "CloseTab", "params": {"tabId": 1}}`
- **SwitchTab** - Switch to a tab
  `{"cap": "SwitchTab", "params": {"tabId": 1}}`
- **GoBack** - Go back in history
  `{"cap": "GoBack"}`
- **GoForward** - Go forward in history
  `{"cap": "GoForward"}`
- **Refresh** - Refresh the page
  `{"cap": "Refresh"}`

### Hud - HUD interface control capabilities

- **TypeInPrompt** - Type text into the HUD prompt field
  `{"cap": "TypeInPrompt", "params": {"text": "...", "append": true}}`
- **ClearPrompt** - Clear the HUD prompt field
  `{"cap": "ClearPrompt"}`
- **SubmitPrompt** - Submit the current prompt
  `{"cap": "SubmitPrompt"}`
- **DisplayMessage** - Display a message in the HUD chat panel
  `{"cap": "DisplayMessage", "params": {"content": "...", "role": "..."}}`
- **ToggleHUD** - Show or hide the HUD
  `{"cap": "ToggleHUD"}`
- **MinimizeHUD** - Minimize HUD to orb
  `{"cap": "MinimizeHUD"}`
- **MaximizeHUD** - Expand HUD to full panel
  `{"cap": "MaximizeHUD"}`
- **SetTheme** - Change HUD theme
  `{"cap": "SetTheme", "params": {"theme": "..."}}`
- **ListThemes** - List available themes
  `{"cap": "ListThemes"}`

### Chat - Chat management and messaging capabilities

- **AppendUserMessage** - Append a user message to the chat
  `{"cap": "AppendUserMessage", "params": {"content": "..."}}`
- **AppendAssistantMessage** - Append an assistant message to the chat
  `{"cap": "AppendAssistantMessage", "params": {"content": "..."}}`
- **ListChats** - List all saved chats
  `{"cap": "ListChats"}`
- **CreateChat** - Create new chat
  `{"cap": "CreateChat", "params": {"title": "..."}}`
- **LoadChat** - Load a chat by ID (recent messages by default)
  `{"cap": "LoadChat", "params": {"chat_id": "...", "tail": 1, "offset": 1}}`
- **GetFullHistory** - Get full chat history when more context is needed
  `{"cap": "GetFullHistory", "params": {"chat_id": "..."}}`
- **RenameChat** - Rename a chat
  `{"cap": "RenameChat", "params": {"chat_id": "...", "title": "..."}}`
- **DeleteChat** - Delete a chat
  `{"cap": "DeleteChat", "params": {"chat_id": "..."}}`
- **GetCurrentChat** - Get the current active chat ID and info
  `{"cap": "GetCurrentChat"}`
- **SetCurrentChat** - Set the active chat
  `{"cap": "SetCurrentChat", "params": {"chat_id": "..."}}`
- **SearchChats** - Search chats by title or message content
  `{"cap": "SearchChats", "params": {"query": "...", "limit": 1}}`

### Config - LLM and system configuration capabilities

- **GetLLMConfig** - Get current LLM configuration
  `{"cap": "GetLLMConfig"}`
- **SetLLMProvider** - Switch LLM provider
  `{"cap": "SetLLMProvider", "params": {"provider": "..."}}`
- **SetLLMEndpoint** - Set LLM endpoint URL
  `{"cap": "SetLLMEndpoint", "params": {"provider": "...", "endpoint": "..."}}`
- **SetLLMModel** - Change LLM model
  `{"cap": "SetLLMModel", "params": {"provider": "...", "model": "..."}}`
- **SetLLMAPIKey** - Set API key for provider
  `{"cap": "SetLLMAPIKey", "params": {"provider": "...", "api_key": "..."}}`
- **SetTemperature** - Adjust temperature
  `{"cap": "SetTemperature", "params": {"temperature": 1}}`
- **SetMaxTokens** - Set max tokens
  `{"cap": "SetMaxTokens", "params": {"max_tokens": 1}}`
- **AddLLMProvider** - Add a new LLM provider
  `{"cap": "AddLLMProvider", "params": {"key": "...", "name": "...", "type": "...", "endpoint": "...", "model": "...", "api_key": "..."}}`
- **RemoveLLMProvider** - Remove an LLM provider
  `{"cap": "RemoveLLMProvider", "params": {"provider": "..."}}`
- **ListCapabilities** - List all capabilities
  `{"cap": "ListCapabilities", "params": {"group": "..."}}`

## OUTPUT FORMAT - CRITICAL

When you want to perform an action, put the JSON on its OWN LINE at the END of your message.

**Good examples:**
```
Sure mate, opening Google now.
{"cap": "OpenTab", "params": {"url": "https://www.google.com"}}
```

```
Let me click that for you.
{"act": "a_id_5"}
```

```
Searching for cats...
{"act": "a_id_1", "value": "cats", "submit": true}
```

**Bad examples (don't do these):**
- Don't wrap in backticks: `` `{"cap": "..."}` `` ❌
- Don't put JSON mid-sentence: "I'll do `{"cap": "..."}` now" ❌
- Don't use code blocks: ```json {"cap": "..."} ``` ❌

**Just plain JSON on its own line at the end.**

## Rules
1. To act: put JSON on its own line at the END
2. Chat normally for questions (no JSON) - be yourself
3. Keep it short unless Andy wants detail
4. **VERIFY IDs BEFORE ACTING** - This is critical:
   - Find the EXACT element you want by its label text
   - Copy the `a_id_X` directly from THAT line - don't guess nearby IDs
   - If searching: find `Select:` or `Input:` with the search box label
   - If clicking: find `Link:` or `Button:` with the exact text you want
   - When in doubt, quote the label back: "Clicking **Gmail** (a_id_2)"
5. **Tabs** - Use simple numbers: Tab 1, Tab 2. Example: `{"cap": "SwitchTab", "params": {"tab": 2}}`

## Formatting (Markdown)
You can use markdown to make your responses look nice:
- **Bold** with `**text**`
- *Italic* with `*text*`
- `inline code` with backticks
- Code blocks with triple backticks
- Lists with `- item` or `1. item`
- Links with `[text](url)`
- Headers with `# H1`, `## H2`, `### H3`
- Blockquotes with `> quote`

Use formatting when it helps clarity - don't overdo it for simple responses.

## Recent Actions
- OpenTab: {'ok': False}
- Element:setValue: Success
- OpenTab: {'ok': False}
- Element:setValue: Success
- Element:click: Success

## Current Page Context
# ChatGPT

**URL:** https://chatgpt.com/
**Timestamp:** 2025-12-10 13:04:41

**Tabs:**
- Tab 1: "(17) Facebook" (www.facebook.com)
- Tab 2: "gibson - Google Search" (www.google.com)
- Tab 3: "ChatGPT" (chatgpt.com) -- ACTIVE TAB

---

Link: Skip to content → {"act": "a_id_0"}
Chat history
Link: Home → {"act": "a_id_1"}
Button: Close sidebar → {"act": "a_id_2"}
Link: New chat
⇧
⌘
O → {"act": "a_id_3"}
Search chats
Link: Library → {"act": "a_id_4"}
Link: Codex → {"act": "a_id_5"}
Link: Atlas → {"act": "a_id_6"}
Button: GPTs → {"act": "a_id_7"}
Link: Explore → {"act": "a_id_8"}
Link: Web Browser → {"act": "a_id_9"}
Button: Projects → {"act": "a_id_10"}
New project
Link: OM-E autonomy → {"act": "a_id_11"}
Link: Claude → {"act": "a_id_12"}
Link: Pacifier Project → {"act": "a_id_13"}
Link: BinaryBeats → {"act": "a_id_14"}
Link: FPH → {"act": "a_id_15"}
See more
Button: Your chats → {"act": "a_id_16"}
Link: Mini model clarification → {"act": "a_id_17"}
Link: Context window explained → {"act": "a_id_18"}
Link: Handle 429 error → {"act": "a_id_19"}
Link: Proving name change → {"act": "a_id_20"}
Link: Cover letter rewrite → {"act": "a_id_21"}
Link: AI business opportunities Adelaide → {"act": "a_id_22"}
Link: Feeling out and about → {"act": "a_id_23"}
Link: Redraw with satin tiles → {"act": "a_id_24"}
Link: Modify bunny design → {"act": "a_id_25"}
Link: Next steps discussion → {"act": "a_id_26"}
Link: Conveyancer process Adelaide → {"act": "a_id_27"}
Link: Edit CSS in Bridge → {"act": "a_id_28"}
Link: Sample creation guide → {"act": "a_id_29"}
Link: Google rankings and hidden text → {"act": "a_id_30"}
Link: Website Spec Development POA → {"act": "a_id_31"}
Link: Rainy Rock Anthem → {"act": "a_id_32"}
Button: Open profile menu → {"act": "a_id_33"}
Button: Model selector, current model is 5.1 → {"act": "a_id_34"}
Button: Start a group chat → {"act": "a_id_35"}
Button: Turn on temporary chat → {"act": "a_id_36"}
What’s on your mind today?
Input: Ask anything → {"act": "a_id_37", "value": "...", "submit": true}
Button: Add files and more → {"act": "a_id_38"}
Button: Dictate button → {"act": "a_id_39"}
Button: Start voice mode → {"act": "a_id_40"}


---

## USER (3 tokens)

search for money

---

## ASSISTANT (27 tokens)

Searching for "money" now.

{"act": "a_id_6", "value": "money", "submit": true}

---

## USER (4 tokens)

go to facebook marketplace

---

## ASSISTANT (31 tokens)

I'll open Facebook Marketplace for you.

{"cap": "OpenTab", "params": {"url": "https://www.facebook.com/marketplace"}}

---

## USER (6 tokens)

lets search marketplace for gibson

---

## ASSISTANT (33 tokens)

Searching Facebook Marketplace for "gibson" now.

{"act": "a_id_14", "value": "gibson", "submit": true}

---

## USER (5 tokens)

search marketplace for gibson

---

## ASSISTANT (34 tokens)

Searching Marketplace for "gibson" again for you.

{"act": "a_id_14", "value": "gibson", "submit": true}

---

## USER (3 tokens)

go to google

---

## ASSISTANT (25 tokens)

Opening Google for you.

{"cap": "OpenTab", "params": {"url": "https://www.google.com"}}

---

## USER (5 tokens)

search google for gibson

---

## ASSISTANT (32 tokens)

Searching Google for "gibson" now.

{"act": "a_id_6", "value": "gibson", "submit": true}

---

## USER (4 tokens)

go to perplexity

---

## ASSISTANT (30 tokens)

Opening Perplexity.ai for you.

{"cap": "OpenTab", "params": {"url": "https://www.perplexity.ai"}}

---

## USER (4 tokens)

search for gibson

---

## ASSISTANT (34 tokens)

Searching Perplexity for "gibson" now.

{"act": "a_id_6", "value": "gibson", "submit": true}

---

## USER (3 tokens)

gibson

---

## ASSISTANT (28 tokens)

You wanna search "gibson" again or something else about it? Let me know what you want me to do with that word.

---

## USER (3 tokens)

search for cats

---

## ASSISTANT (27 tokens)

Searching for "cats" now.

{"act": "a_id_6", "value": "cats", "submit": true}

---

## USER (3 tokens)

search for cats

---
