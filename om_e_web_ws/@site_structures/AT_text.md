# ChatGPT

**URL:** https://chatgpt.com/
**Timestamp:** 2025-12-21 18:50:10
**Scan Type:** Accessibility Tree

**Available Capabilities:**

### `SetInputValue`
Type into the ChatGPT prompt input (ProseMirror contenteditable). Use this capability instead of direct AT textbox setValue for reliable input on ChatGPT.
**Params:**
- `value`: string (the text to type)
- `submit`: boolean (optional, send message after typing)
**Usage:**
```json
{"type": "execute_capability", "action": "SetInputValue", "params": {"value": "Hello ChatGPT", "submit": true}}
```

---

RootWebArea: "ChatGPT" (focused)
  [0] link: "Skip to content" → {"act":0}
  banner
    [1] button: "Model selector, current model is 5.2" → {"act":1,"expanded":false} (collapsed)
    [2] button: "Start a group chat" → {"act":2}
    [3] button: "Turn on temporary chat" → {"act":3}
  main
    heading: "What are you working on?"
    [4] button: "Add files and more" → {"act":4,"expanded":false} (collapsed)
    [5] button: "Dictate button" → {"act":5}
    [6] button: "Start voice mode" → {"act":6}
  [7] button: "Open sidebar" → {"act":7,"expanded":false} (collapsed)
  [8] button: "Open profile menu" → {"act":8,"expanded":false} (collapsed)