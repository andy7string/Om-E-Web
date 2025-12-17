# LLM RAG Query - Two-Pass Capability Resolution

## Problem

When the user responds with short confirmations like "yes", "ok", "do it", the RAG system retrieves irrelevant capabilities because the query doesn't contain semantic information about the intended action.

**Example failure:**
1. LLM: "Facebook is already open in tab 3. Would you like me to switch to that tab?"
2. User: "yes"
3. RAG query "yes" retrieves random capabilities (not SwitchTab)
4. LLM makes up a command: `{"cap": "SetCurrentChat", "params": {"chat_id": "tab-3"}}`

The LLM understood the intent but didn't have the right capability, so it hallucinated.

---

## Solution: Two-Pass Capability Resolution

Instead of having the LLM make up commands, introduce a `findCommand` flag that triggers a second RAG lookup.

### Flow

```
User: "yes"
    │
    ▼
┌─────────────────────────────────────────┐
│ PASS 1: LLM understands intent          │
│ - Has conversation context              │
│ - Knows user wants to switch tabs       │
│ - But SwitchTab capability not in prompt│
└─────────────────────────────────────────┘
    │
    ▼
LLM returns: {"message": "Switching to Facebook tab", "findCommand": "switch to tab 3"}
    │
    ▼
┌─────────────────────────────────────────┐
│ RAG LOOKUP                              │
│ - Query: "switch to tab 3"              │
│ - Retrieves: SwitchTab capability       │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ PASS 2: LLM executes with capability    │
│ - Now has SwitchTab in context          │
│ - Generates correct command             │
└─────────────────────────────────────────┘
    │
    ▼
Final response: "Switching to Facebook tab."
{"cap": "SwitchTab", "params": {"tabId": 3}}
```

---

## Message Format

### findCommand Response (Pass 1)

When the LLM wants to execute an action but doesn't have a matching capability:

```json
{"message": "Human-readable response", "findCommand": "semantic description of action"}
```

**Examples:**
```json
{"message": "Switching to the Facebook tab for you.", "findCommand": "switch to tab"}
{"message": "Scrolling down the page.", "findCommand": "scroll down"}
{"message": "Opening YouTube.", "findCommand": "open youtube new tab"}
{"message": "Deleting that chat.", "findCommand": "delete chat"}
```

### Clarification Response (Alternative)

When the LLM is genuinely unsure and needs user input:

```json
{"message": "I found multiple options", "clarify": ["Option A", "Option B", "Option C"]}
```

This presents choices to the user instead of guessing.

---

## Implementation Steps

### 1. Update System Prompt (system.md)

Add to OUTPUT FORMAT section:

```markdown
### When You Don't Have the Right Capability

If you understand what the user wants but don't see a matching capability in Retrieved Capabilities:

DO NOT make up a capability name. Instead, output:
{"message": "What you're doing", "findCommand": "description of action"}

Examples:
- User confirms "yes" to switch tabs → {"message": "Switching tabs.", "findCommand": "switch tab"}
- User says "delete it" → {"message": "Deleting.", "findCommand": "delete"}

The system will find the right capability and re-query you.
```

### 2. Add Response Parser (ws_server.py)

In LLMChat handler, after getting LLM response:

```python
def parse_findcommand(response_text: str) -> dict | None:
    """
    Check if LLM response contains a findCommand request.
    Returns {message, findCommand} or None.
    """
    try:
        # Look for JSON with findCommand
        import re
        match = re.search(r'\{[^}]*"findCommand"[^}]*\}', response_text)
        if match:
            data = json.loads(match.group())
            if "findCommand" in data:
                return data
    except:
        pass
    return None
```

### 3. Implement Two-Pass Logic (ws_server.py)

```python
# After getting LLM response
response_text = await LLM_AGENT.chat(message, ...)

# Check for findCommand
findcmd = parse_findcommand(response_text)
if findcmd:
    # Extract the search query
    search_query = findcmd.get("findCommand", "")
    user_message = findcmd.get("message", "")

    print(f"[RAG] findCommand triggered: '{search_query}'")

    # Do targeted RAG query
    from retrieval.query import query
    rag_result = query(search_query, k_caps=5)

    if rag_result.capabilities:
        # Build mini-prompt with just the capabilities
        cap_context = "**Available Capabilities:**\n"
        for cap in rag_result.capabilities:
            cap_context += f"- {cap['label']}: `{cap['example']}`\n"

        # Pass 2: Re-query LLM with capabilities
        pass2_prompt = f"""Execute this action: {user_message}

{cap_context}

Output the JSON command on its own line. Use ONLY capabilities listed above."""

        response_text = await LLM_AGENT.chat(pass2_prompt, ...)
```

### 4. Add Flags to Track State

```python
# In LLMChat handler
MAX_FINDCOMMAND_RETRIES = 2  # Prevent infinite loops

async def handle_llm_chat(message, ...):
    retry_count = 0

    while retry_count < MAX_FINDCOMMAND_RETRIES:
        response_text = await LLM_AGENT.chat(...)

        findcmd = parse_findcommand(response_text)
        if not findcmd:
            break  # Normal response, exit loop

        # Handle findCommand...
        retry_count += 1

    # Return final response
    return response_text
```

---

## Flags and Safety

### Prevent Loops
- `MAX_FINDCOMMAND_RETRIES = 2` - Maximum times to retry RAG lookup
- If still no match after retries, respond with "I couldn't find a way to do that"

### Track State
- `_findcommand_in_progress` - Prevent nested findCommand calls
- Log each RAG lookup for debugging

### Fallback Behavior
If RAG lookup fails to find relevant capabilities:
```python
if not rag_result.capabilities:
    return {
        "response": f"{findcmd['message']} (I don't have a capability for this action)",
        "error": "no_capability_found"
    }
```

---

## System Prompt Changes

### Current OUTPUT FORMAT:
```markdown
- When executing an action, ALWAYS include a brief message before the JSON
- Output the JSON on its OWN LINE at the END
- Never wrap JSON in backticks or code blocks
- Never output more than ONE action
- If no action is needed, respond conversationally only
```

### New OUTPUT FORMAT:
```markdown
- When executing an action, ALWAYS include a brief message before the JSON
- Output the JSON on its OWN LINE at the END
- Never wrap JSON in backticks or code blocks
- Never output more than ONE action
- If no action is needed, respond conversationally only

### Missing Capability
If you want to execute an action but don't see a matching capability:
- DO NOT invent capability names
- Output: {"message": "What you'll do", "findCommand": "action description"}
- Example: {"message": "Switching to that tab.", "findCommand": "switch tab"}
```

---

## End-to-End Example

### Scenario: User confirms tab switch

**Turn 1:**
```
User: "open facebook"
LLM: "Opening Facebook in a new tab."
{"cap": "OpenTab", "params": {"url": "https://facebook.com"}}
```

**Turn 2:**
```
User: "is it already open?"
LLM: "Yes, Facebook is already open in Tab 3. Would you like me to switch to it?"
```

**Turn 3:**
```
User: "yes"

[RAG query "yes" - retrieves irrelevant capabilities]

LLM Pass 1: {"message": "Switching to Facebook.", "findCommand": "switch to tab 3"}

[System detects findCommand]
[RAG query "switch to tab 3" - retrieves SwitchTab]

LLM Pass 2: "Switching to Facebook."
{"cap": "SwitchTab", "params": {"tabId": 3}}

[Action executed successfully]
```

---

## Files to Modify

1. **om_e_web_ws/data/prompts/system.md**
   - Add findCommand output format instructions

2. **om_e_web_ws/ws_server.py**
   - Add `parse_findcommand()` function
   - Add two-pass logic in LLMChat handler
   - Add retry limits and logging

3. **om_e_web_ws/retrieval/query.py**
   - Ensure `query()` function is importable standalone
   - Maybe add `query_capabilities_only()` for lighter lookups

4. **om_e_web_ws/llm/agent.py**
   - Optionally add `chat_with_context()` for Pass 2 calls
   - Or handle Pass 2 directly in ws_server.py

---

## Success Criteria

1. User says "yes" after tab switch question → Correct SwitchTab executed
2. No hallucinated capability names
3. Maximum 2 LLM calls per user message (Pass 1 + Pass 2)
4. Clear logging: `[RAG] findCommand triggered: 'switch to tab 3'`
5. Graceful fallback if no capability found

---

## Future Enhancements

1. **Clarification Mode**: `{"clarify": ["Option A", "Option B"]}` for ambiguous requests
2. **Capability Caching**: Remember recently used capabilities for follow-up
3. **Intent Classification**: Pre-classify user message to inform RAG before LLM call
4. **Confidence Scores**: LLM outputs confidence, low confidence triggers findCommand automatically
