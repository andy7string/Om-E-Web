# text.md Creation Pipeline - Complete Flow Documentation

**Version:** 1.0
**Created:** 2025-11-23
**Purpose:** Trace the COMPLETE flow of text.md creation from DOM extraction to file write

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Complete Flow Diagram](#complete-flow-diagram)
3. [Step-by-Step Breakdown](#step-by-step-breakdown)
4. [Data Structure Evolution](#data-structure-evolution)
5. [Function Call Chain](#function-call-chain)
6. [Message Schemas](#message-schemas)
7. [Capability Integration](#capability-integration)
8. [Code References](#code-references)
9. [Timeline](#timeline)
10. [Error Handling](#error-handling)
11. [Testing the Pipeline](#testing-the-pipeline)

---

## Executive Summary

The text.md pipeline extracts semantic text from the DOM, packages it with page metadata and capabilities, transmits it through the extension → service worker → server pipeline, and generates a markdown file that LLMs can consume.

**Key Players:**
- **content.js**: DOM text extraction
- **sw.js**: Message forwarding
- **ws_server.py**: text.md generation with capability injection
- **site_configs.json**: Capability definitions

**Critical Flow:**
```
DOM → extractSemanticTextWithIds() → intelligence_update message →
sw.js forward → ws_server.py handler() → inline text.md generation →
@site_structures/text.md file
```

**Status:** ✅ ACTIVE (NEW approach as of recent refactor)

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TRIGGER: Page Load                           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: DOM Idle Detection (content.js)                             │
│                                                                       │
│ pageIdleMonitor.waitForIdle()                                        │
│   - Monitors network activity (fetch/XHR)                           │
│   - Watches DOM mutations                                            │
│   - Waits for quiet window (200ms)                                  │
│   - Returns when page is truly settled                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Full Page Scan Triggered (content.js)                       │
│                                                                       │
│ executeScanWithSettle()                                              │
│   - Sets scanInProgress = true (lock)                               │
│   - Resets elementCounter = 0                                       │
│   - Calls waitForDOMSettle() for final check                        │
│   - Calls intelligenceEngine.scanAndRegisterPageElements()          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Semantic Text Extraction (content.js)                       │
│                                                                       │
│ IntelligenceEngine.extractSemanticTextWithIds()                     │
│   Called by: prepareIntelligenceData()                              │
│   Location: content.js line ~5700                                   │
│                                                                       │
│ Process:                                                              │
│   1. Extract headings (h1-h6)                                       │
│      - Query: document.querySelectorAll('h1, h2, h3, h4, h5, h6')  │
│      - Filter: isElementVisible(element)                            │
│      - Assign: text_id (t_id_0, t_id_1, ...)                       │
│   2. Extract paragraphs (p)                                         │
│      - Query: document.querySelectorAll('p')                        │
│      - Filter: visible AND has text content                         │
│      - Assign: text_id (t_id_N, ...)                               │
│   3. Extract lists (ul, ol)                                         │
│      - Query: document.querySelectorAll('ul, ol')                   │
│      - Extract list items (li)                                      │
│      - Assign: text_id (t_id_M, ...)                               │
│   4. Combine and sort by document order                             │
│   5. Generate selectors for each text block                         │
│                                                                       │
│ Returns: Array of text blocks with metadata                         │
│ [                                                                    │
│   {                                                                  │
│     text_id: "t_id_0",                                              │
│     type: "heading",                                                │
│     level: 1,                                                       │
│     text: "Welcome to Page",                                        │
│     selector: "h1.title",                                           │
│     parent: "section.hero",                                         │
│     position: 0                                                     │
│   },                                                                 │
│   ...                                                                │
│ ]                                                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: Build Semantic Page Data (content.js)                       │
│                                                                       │
│ IntelligenceEngine.prepareIntelligenceData()                        │
│   Location: content.js line ~5900                                   │
│                                                                       │
│ Creates intelligenceData object:                                     │
│ {                                                                    │
│   semanticPageData: {                                               │
│     text: "<full markdown text with IDs>",                          │
│     extractionTimestamp: 1234567890,                                │
│     totalTextBlocks: 150,                                           │
│     structure: {                                                    │
│       headings: 20,                                                 │
│       paragraphs: 100,                                              │
│       lists: 30                                                     │
│     }                                                                │
│   },                                                                 │
│   semanticText: [                                                   │
│     {text_id, type, text, selector, ...},                           │
│     ...                                                              │
│   ],                                                                 │
│   actionableElements: [...],                                        │
│   contentElements: [...],                                           │
│   pageState: {                                                      │
│     url: "https://example.com",                                     │
│     title: "Page Title",                                            │
│     timestamp: 1234567890                                           │
│   },                                                                 │
│   transcripts: [...],  // if YouTube                                │
│   capabilities: [...]   // from site config                         │
│ }                                                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 5: Package Intelligence Update (content.js)                    │
│                                                                       │
│ queueIntelligenceUpdate('high')                                      │
│   - Debounces updates (500ms)                                       │
│   - Calls chrome.runtime.sendMessage()                              │
│                                                                       │
│ Message structure:                                                   │
│ {                                                                    │
│   type: 'scan_complete',                                            │
│   pageVersion: 1,                                                   │
│   intelligenceData: {                                               │
│     semanticPageData: {                                             │
│       text: "# Page Title\n\n## Section...",                        │
│       extractionTimestamp: 1234567890,                              │
│       ...                                                            │
│     },                                                               │
│     semanticText: [...],                                            │
│     actionableElements: [...],                                      │
│     pageState: {...},                                               │
│     transcripts: [...],                                             │
│     capabilities: [...]                                             │
│   }                                                                  │
│ }                                                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 6: Service Worker Receives (sw.js)                             │
│                                                                       │
│ chrome.runtime.onMessage listener                                   │
│   Message type: 'scan_complete'                                     │
│   Location: sw.js line ~1600                                        │
│                                                                       │
│ handleScanComplete(message, sender)                                 │
│   - Extracts intelligenceData                                       │
│   - Marks scan as no longer in progress                             │
│   - Forwards to WebSocket server                                    │
│                                                                       │
│ Transformation: scan_complete → intelligence_update                 │
│ {                                                                    │
│   type: 'intelligence_update',                                      │
│   data: message.intelligenceData,                                   │
│   tabId: sender.tab.id,                                             │
│   tabUrl: sender.tab.url,                                           │
│   tabTitle: sender.tab.title                                        │
│ }                                                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 7: WebSocket Send (sw.js → ws_server.py)                       │
│                                                                       │
│ ws.send(JSON.stringify(message))                                    │
│   - Checks if WebSocket is open                                     │
│   - Queues in pendingMessages if not ready                          │
│   - Sends JSON over WebSocket connection                            │
│                                                                       │
│ WebSocket message:                                                   │
│ {                                                                    │
│   "type": "intelligence_update",                                    │
│   "data": {                                                          │
│     "semanticPageData": {                                           │
│       "text": "# Page Title\n\n...",                                │
│       "extractionTimestamp": 1234567890                             │
│     },                                                               │
│     "pageState": {                                                  │
│       "url": "https://example.com",                                 │
│       "title": "Page Title"                                         │
│     },                                                               │
│     "capabilities": [...]                                           │
│   }                                                                  │
│ }                                                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 8: Server Receives (ws_server.py)                              │
│                                                                       │
│ handler(ws) - Main WebSocket handler                                │
│   Location: ws_server.py line ~2847                                 │
│                                                                       │
│ Message routing:                                                     │
│   if msg.get("type") == "intelligence_update":                      │
│       # Handle intelligence update                                  │
│       Lines: 3083-3213                                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 9: text.md Generation (ws_server.py - INLINE)                  │
│                                                                       │
│ Location: ws_server.py lines 3111-3167 (inside handler)             │
│                                                                       │
│ Process:                                                              │
│   1. Extract semantic text:                                         │
│      semantic_text = intelligence_data.get('semanticPageData', {}   │
│                      ).get('text')                                  │
│      OR fallback:                                                   │
│      plain_text = intelligence_data.get('pageText')                 │
│                                                                       │
│   2. Extract page metadata:                                         │
│      page_state = intelligence_data.get('pageState', {})            │
│      url = page_state.get('url', '')                                │
│      title = page_state.get('title', 'Untitled Page')              │
│                                                                       │
│   3. Resolve capabilities for URL:                                  │
│      capabilities = resolve_capabilities_for_url(url)               │
│        - Loads site_configs.json                                    │
│        - Finds matching domain config                               │
│        - Filters capabilities by url_pattern                        │
│        - Returns matching capabilities list                         │
│                                                                       │
│   4. Build markdown content:                                        │
│      content = []                                                   │
│      content.append("---")                                          │
│      content.append(f"title: {title}")                              │
│      content.append(f"url: {url}")                                  │
│      content.append(f"timestamp: {now}")                            │
│      if capabilities:                                               │
│          content.append("capabilities:")                            │
│          for cap in capabilities:                                   │
│              content.append(f"  - action: {cap['action']}")        │
│              content.append(f"    label: {cap['label']}")          │
│              if cap.get('url_pattern'):                             │
│                  content.append(f"    url_pattern: ...")            │
│      content.append("---\n")                                        │
│      content.append(f"# {title}\n")                                 │
│                                                                       │
│      if capabilities:                                               │
│          content.append("## Available Actions\n")                   │
│          for cap in capabilities:                                   │
│              content.append(f"**{cap['action']}** - ...")           │
│          content.append("\n---\n")                                  │
│                                                                       │
│      content.append(semantic_text or plain_text)                    │
│                                                                       │
│   5. Write to file:                                                 │
│      text_md_path = os.path.join(SITE_STRUCTURES_DIR, 'text.md')   │
│      with open(text_md_path, 'w', encoding='utf-8') as f:          │
│          f.write('\n'.join(content))                                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 10: File Written                                               │
│                                                                       │
│ File: @site_structures/text.md                                      │
│                                                                       │
│ Example content:                                                     │
│ ---                                                                  │
│ title: Video Title - YouTube                                        │
│ url: https://youtube.com/watch?v=abc123                             │
│ timestamp: 2025-11-23T12:00:00Z                                     │
│ capabilities:                                                        │
│   - action: RetrieveTranscript                                      │
│     label: Get video transcript                                     │
│     url_pattern: /watch?v=                                          │
│ ---                                                                  │
│                                                                       │
│ # Video Title                                                        │
│                                                                       │
│ ## Available Actions                                                │
│                                                                       │
│ **RetrieveTranscript** - Get video transcript                       │
│   - Retrieves the full transcript for this YouTube video           │
│   - Usage: python3 test_navigation.py --command capability \        │
│            --capability RetrieveTranscript                          │
│                                                                       │
│ ---                                                                  │
│                                                                       │
│ Video description and content here...                               │
│                                                                       │
│ [Full page text with semantic structure]                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Breakdown

### STEP 1: Trigger (content.js)

**What triggers text extraction?**
- Page navigation completes
- Service worker sends `scan_page` message
- Manual scan trigger

**Which function starts the process?**
- `executeScanWithSettle(pageVersion, url, trigger)`
- Location: content.js (main scan coordinator)

**Prerequisites:**
- DOM must be idle (pageIdleMonitor.waitForIdle())
- No scan currently in progress (scanInProgress === false)

---

### STEP 2: Text Extraction (content.js)

**Function:** `IntelligenceEngine.prototype.extractSemanticTextWithIds()`

**How is DOM traversed?**
```javascript
// Extract headings
const headings = [];
document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(element => {
    if (isElementVisible(element)) {
        headings.push({
            text_id: `t_id_${counter++}`,
            type: 'heading',
            level: parseInt(element.tagName.substring(1)),
            text: element.textContent.trim(),
            selector: generateSimpleSelector(element),
            parent: element.parentElement?.tagName,
            position: counter
        });
    }
});

// Extract paragraphs
const paragraphs = [];
document.querySelectorAll('p').forEach(element => {
    if (isElementVisible(element) && element.textContent.trim()) {
        paragraphs.push({
            text_id: `t_id_${counter++}`,
            type: 'paragraph',
            text: element.textContent.trim(),
            selector: generateSimpleSelector(element),
            parent: element.parentElement?.tagName,
            position: counter
        });
    }
});

// Extract lists
const lists = [];
document.querySelectorAll('ul, ol').forEach(element => {
    if (isElementVisible(element)) {
        const items = Array.from(element.querySelectorAll('li')).map(li =>
            li.textContent.trim()
        );
        lists.push({
            text_id: `t_id_${counter++}`,
            type: 'list',
            items: items,
            selector: generateSimpleSelector(element),
            parent: element.parentElement?.tagName,
            position: counter
        });
    }
});

// Combine and sort by document order
return [...headings, ...paragraphs, ...lists].sort((a, b) =>
    a.position - b.position
);
```

**How are elements tagged with IDs?**
- Text IDs are NOT set on DOM (unlike action IDs)
- Text IDs are purely metadata for artifact generation
- Sequential counter: `t_id_0`, `t_id_1`, `t_id_2`, etc.

**What data structure is built?**
```javascript
[
  {
    text_id: "t_id_0",
    type: "heading",
    level: 1,
    text: "Welcome to Page",
    selector: "h1.title",
    parent: "section",
    position: 0
  },
  {
    text_id: "t_id_1",
    type: "paragraph",
    text: "This is the introduction...",
    selector: "p.intro",
    parent: "section",
    position: 1
  },
  {
    text_id: "t_id_2",
    type: "list",
    items: ["Item 1", "Item 2", "Item 3"],
    selector: "ul.menu",
    parent: "nav",
    position: 2
  }
]
```

---

### STEP 3: Intelligence Update Packaging (content.js)

**Function:** `prepareIntelligenceData()`

**What fields are in the message?**
```javascript
const intelligenceData = {
    // Semantic page data with full text
    semanticPageData: {
        text: extractedMarkdownText,  // Full page text as markdown
        extractionTimestamp: Date.now(),
        totalTextBlocks: semanticText.length,
        structure: {
            headings: semanticText.filter(t => t.type === 'heading').length,
            paragraphs: semanticText.filter(t => t.type === 'paragraph').length,
            lists: semanticText.filter(t => t.type === 'list').length
        }
    },

    // Structured semantic text array
    semanticText: [
        {text_id, type, text, selector, ...},
        ...
    ],

    // Actionable elements
    actionableElements: Array.from(this.actionableElements.values()),

    // Content elements
    contentElements: Array.from(this.contentElements.values()),

    // Page state
    pageState: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        timestamp: Date.now(),
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        }
    },

    // Transcripts (if applicable)
    transcripts: this.extractYoutubeTranscriptData() || [],

    // Capabilities (from site config)
    capabilities: this.extractCapabilities()
};
```

**Where is semantic text stored in the message?**
- Primary: `intelligenceData.semanticPageData.text` (full markdown string)
- Secondary: `intelligenceData.semanticText` (structured array)
- Fallback: `intelligenceData.pageText` (plain text)

---

### STEP 4: Send to Service Worker (content.js → sw.js)

**How is message sent?**
```javascript
chrome.runtime.sendMessage({
    type: 'scan_complete',
    pageVersion: currentPageVersion,
    intelligenceData: intelligenceData
}, (response) => {
    // Optional response handling
});
```

**What does the message look like?**
```json
{
  "type": "scan_complete",
  "pageVersion": 1,
  "intelligenceData": {
    "semanticPageData": {
      "text": "# Page Title\n\n## Section Heading\n\nParagraph content...",
      "extractionTimestamp": 1700000000000,
      "totalTextBlocks": 150,
      "structure": {
        "headings": 20,
        "paragraphs": 100,
        "lists": 30
      }
    },
    "semanticText": [
      {"text_id": "t_id_0", "type": "heading", "level": 1, "text": "Page Title", ...},
      {"text_id": "t_id_1", "type": "paragraph", "text": "Content...", ...}
    ],
    "actionableElements": [...],
    "contentElements": [...],
    "pageState": {
      "url": "https://example.com",
      "title": "Page Title",
      "timestamp": 1700000000000
    },
    "transcripts": [],
    "capabilities": [
      {"action": "RetrieveTranscript", "label": "Get video transcript", ...}
    ]
  }
}
```

---

### STEP 5: Service Worker Receives (sw.js)

**Function:** `handleScanComplete(message, sender)`

**Location:** sw.js (chrome.runtime.onMessage listener)

**How is it forwarded to server?**
```javascript
async function handleScanComplete(message, sender) {
    const { pageVersion, intelligenceData } = message;
    const tabId = sender.tab.id;

    // Mark scan as no longer in progress
    const state = tabState.get(tabId);
    if (state) {
        state.scanInProgress = false;
    }

    // Forward to WebSocket server
    ws.send(JSON.stringify({
        type: 'intelligence_update',
        data: intelligenceData,
        tabId: tabId,
        tabUrl: sender.tab.url,
        tabTitle: sender.tab.title
    }));
}
```

**Any transformations?**
- Message type changed: `scan_complete` → `intelligence_update`
- Tab metadata added: `tabId`, `tabUrl`, `tabTitle`
- Data wrapped in `data` field

---

### STEP 6: WebSocket Send (sw.js → ws_server.py)

**Function:** `sendToServer(data)` or direct `ws.send()`

**What does the WebSocket message look like?**
```json
{
  "type": "intelligence_update",
  "data": {
    "semanticPageData": {
      "text": "# Page Title\n\n## Section...",
      "extractionTimestamp": 1700000000000,
      "totalTextBlocks": 150,
      "structure": {
        "headings": 20,
        "paragraphs": 100,
        "lists": 30
      }
    },
    "semanticText": [...],
    "actionableElements": [...],
    "contentElements": [...],
    "pageState": {
      "url": "https://example.com",
      "title": "Page Title",
      "timestamp": 1700000000000
    },
    "transcripts": [],
    "capabilities": [...]
  },
  "tabId": 123,
  "tabUrl": "https://example.com",
  "tabTitle": "Page Title"
}
```

---

### STEP 7: Server Receives (ws_server.py)

**Function:** `handler(ws)`

**Location:** ws_server.py line 2847

**Which message type?**
```python
async def handler(ws):
    async for message_raw in ws:
        message = json.loads(message_raw)

        if message.get("type") == "intelligence_update":
            # Handle intelligence update (lines 3083-3213)
            intelligence_data = message.get("data", {})

            # Process and generate artifacts
            ...
```

**Where does control flow next?**
Directly to inline text.md generation (lines 3111-3167)

---

### STEP 8: text.md Generation (ws_server.py)

**Location:** ws_server.py lines 3111-3167 (INLINE in handler function)

**What are the inputs?**
```python
# Extract semantic text (preferred)
semantic_text = intelligence_data.get('semanticPageData', {}).get('text')

# Fallback to plain text
if not semantic_text:
    semantic_text = intelligence_data.get('pageText', '')

# Extract page metadata
page_state = intelligence_data.get('pageState', {})
url = page_state.get('url', '')
title = page_state.get('title', 'Untitled Page')
timestamp = datetime.now().isoformat()
```

**How are capabilities resolved?**
```python
# Function: resolve_capabilities_for_url(url)
# Location: ws_server.py line 584

def resolve_capabilities_for_url(url):
    """
    Dynamically resolve capabilities from site_configs.json

    Args:
        url: Current page URL

    Returns:
        List of capability dicts matching URL pattern
    """
    # 1. Load site configs
    all_configs = get_all_site_configs()

    # 2. Find matching domain
    matching_config = None
    for domain, config in all_configs.items():
        if domain in url:
            matching_config = config
            break

    if not matching_config:
        return []

    # 3. Extract capabilities
    capabilities = matching_config.get('capabilities', {})

    # 4. Filter by url_pattern
    matching_capabilities = []
    for cap_id, cap_config in capabilities.items():
        url_pattern = cap_config.get('url_pattern')
        # Only include if no pattern OR pattern matches current URL
        if not url_pattern or url_pattern in url:
            matching_capabilities.append({
                'id': cap_id,
                'action': cap_config.get('action'),
                'label': cap_config.get('label'),
                'description': cap_config.get('description'),
                'handler': cap_config.get('handler'),
                'domain': domain
            })

    return matching_capabilities
```

**How are capabilities injected?**
```python
# Build markdown content
content_lines = []

# Frontmatter
content_lines.append("---")
content_lines.append(f"title: {title}")
content_lines.append(f"url: {url}")
content_lines.append(f"timestamp: {timestamp}")

# Add capabilities to frontmatter if present
if capabilities:
    content_lines.append("capabilities:")
    for cap in capabilities:
        content_lines.append(f"  - action: {cap['action']}")
        content_lines.append(f"    label: {cap['label']}")
        if cap.get('url_pattern'):
            content_lines.append(f"    url_pattern: {cap['url_pattern']}")

content_lines.append("---")
content_lines.append("")

# Title
content_lines.append(f"# {title}")
content_lines.append("")

# Capabilities section (if present)
if capabilities:
    content_lines.append("## Available Actions")
    content_lines.append("")
    content_lines.append("The following pre-configured actions are available for this page:")
    content_lines.append("")

    for cap in capabilities:
        content_lines.append(f"**{cap['action']}** - {cap['label']}")
        if cap.get('description'):
            content_lines.append(f"  - {cap['description']}")
        content_lines.append(f"  - Usage: python3 test_navigation.py --command capability --capability {cap['action']}")
        content_lines.append("")

    content_lines.append("---")
    content_lines.append("")

# Page content
content_lines.append(semantic_text)

# Join all lines
final_content = '\n'.join(content_lines)
```

**Show the complete generation logic:**
```python
# Lines 3111-3167 in handler()

# Extract semantic text
semantic_text = intelligence_data.get('semanticPageData', {}).get('text')
if not semantic_text:
    semantic_text = intelligence_data.get('pageText', '')

if semantic_text:
    # Get page metadata
    page_state = intelligence_data.get('pageState', {})
    url = page_state.get('url', '')
    title = page_state.get('title', 'Untitled Page')
    timestamp = datetime.now().isoformat()

    # Resolve capabilities
    capabilities = resolve_capabilities_for_url(url)

    # Build content
    content_lines = []

    # Frontmatter
    content_lines.append("---")
    content_lines.append(f"title: {title}")
    content_lines.append(f"url: {url}")
    content_lines.append(f"timestamp: {timestamp}")

    if capabilities:
        content_lines.append("capabilities:")
        for cap in capabilities:
            content_lines.append(f"  - action: {cap['action']}")
            content_lines.append(f"    label: {cap['label']}")
            if cap.get('url_pattern'):
                content_lines.append(f"    url_pattern: {cap['url_pattern']}")

    content_lines.append("---")
    content_lines.append("")

    # Title
    content_lines.append(f"# {title}")
    content_lines.append("")

    # Capabilities section
    if capabilities:
        content_lines.append("## Available Actions")
        content_lines.append("")
        for cap in capabilities:
            content_lines.append(f"**{cap['action']}** - {cap['label']}")
            if cap.get('description'):
                content_lines.append(f"  - {cap['description']}")
            content_lines.append(f"  - Usage: python3 test_navigation.py --command capability --capability {cap['action']}")
            content_lines.append("")
        content_lines.append("---")
        content_lines.append("")

    # Page content
    content_lines.append(semantic_text)

    # Write to file
    text_md_path = os.path.join(SITE_STRUCTURES_DIR, 'text.md')
    with open(text_md_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(content_lines))

    print(f"✅ text.md generated: {text_md_path}")
```

---

### STEP 9: File Write (ws_server.py)

**Where is text.md written?**
```python
text_md_path = os.path.join(SITE_STRUCTURES_DIR, 'text.md')
# Expands to: @site_structures/text.md
```

**What's the file path?**
- Absolute: `/Users/andy7string/Projects/Om_E_Web/om_e_web_ws/@site_structures/text.md`
- Relative: `@site_structures/text.md`

**Show example text.md content structure:**
```markdown
---
title: How to Build a Chrome Extension - YouTube
url: https://youtube.com/watch?v=abc123
timestamp: 2025-11-23T12:00:00Z
capabilities:
  - action: RetrieveTranscript
    label: Get video transcript
    url_pattern: /watch?v=
---

# How to Build a Chrome Extension

## Available Actions

The following pre-configured actions are available for this page:

**RetrieveTranscript** - Get video transcript
  - Retrieves the full transcript for this YouTube video
  - Usage: python3 test_navigation.py --command capability --capability RetrieveTranscript

---

Welcome to this tutorial on building Chrome extensions. In this video, we'll cover...

## Topics Covered

1. Manifest V3 basics
2. Content scripts vs service workers
3. WebSocket communication
4. DOM manipulation

[Full page content continues...]
```

---

### STEP 10: LLM Consumption

**How does LLM read text.md?**
- LLM reads file directly from filesystem
- Parses frontmatter for metadata
- Identifies capabilities section
- Reads full page content

**What does it see?**
```markdown
# Page Title
**URL:** https://example.com
**Timestamp:** 2025-11-23T12:00:00Z

## Available Actions
- RetrieveTranscript: Get video transcript

---

[Full page text with semantic structure]
```

**How does it reference elements?**
- **Capabilities:** By action name (e.g., `RetrieveTranscript`)
- **Actions:** By action ID from llm_actions.json (e.g., `a_id_5`)
- **Text:** By reading directly (no IDs needed)

**Key difference from llm_prompt.md:**
- text.md is content-first (full page text)
- llm_prompt.md is action-first (categorized action list)

---

## Data Structure Evolution

### DOM Element
```html
<h1 class="title">Welcome to Our Site</h1>
```

### ↓ (content.js extraction)

### Semantic Text Object
```javascript
{
  text_id: "t_id_0",
  type: "heading",
  level: 1,
  text: "Welcome to Our Site",
  selector: "h1.title",
  parent: "header",
  position: 0
}
```

### ↓ (intelligence update)

### Message Field
```json
{
  "semanticPageData": {
    "text": "# Welcome to Our Site\n\n...",
    "extractionTimestamp": 1700000000000,
    "totalTextBlocks": 150,
    "structure": {
      "headings": 20,
      "paragraphs": 100,
      "lists": 30
    }
  },
  "semanticText": [
    {
      "text_id": "t_id_0",
      "type": "heading",
      "level": 1,
      "text": "Welcome to Our Site",
      "selector": "h1.title"
    }
  ]
}
```

### ↓ (ws_server.py)

### text.md
```markdown
---
title: Our Site
url: https://example.com
timestamp: 2025-11-23T12:00:00Z
---

# Our Site

Welcome to Our Site

[More content...]
```

---

## Function Call Chain

### Complete Call Sequence

1. **content.js:** `executeScanWithSettle(pageVersion, url, trigger)`
2. **content.js:** `intelligenceEngine.scanAndRegisterPageElements()`
3. **content.js:** `intelligenceEngine.extractSemanticTextWithIds()`
   - `extractHeadings()`
   - `extractParagraphs()`
   - `extractLists()`
4. **content.js:** `intelligenceEngine.prepareIntelligenceData()`
   - `extractSemanticTextWithIds()` (called internally)
   - `extractCapabilities()`
5. **content.js:** `queueIntelligenceUpdate('high')`
6. **content.js:** `chrome.runtime.sendMessage({type: 'scan_complete', ...})`
7. **sw.js:** `handleScanComplete(message, sender)`
8. **sw.js:** `ws.send(JSON.stringify({type: 'intelligence_update', ...}))`
9. **ws_server.py:** `handler(ws)`
   - Receives message
   - Extracts `intelligence_data`
10. **ws_server.py:** `resolve_capabilities_for_url(url)`
    - `get_all_site_configs()`
11. **ws_server.py:** Inline text.md generation (lines 3111-3167)
    - Build frontmatter
    - Inject capabilities
    - Write to file

---

## Message Schemas

### content.js → sw.js
```json
{
  "type": "scan_complete",
  "pageVersion": 1,
  "intelligenceData": {
    "semanticPageData": {
      "text": "# Page Title\n\n...",
      "extractionTimestamp": 1700000000000,
      "totalTextBlocks": 150,
      "structure": {
        "headings": 20,
        "paragraphs": 100,
        "lists": 30
      }
    },
    "semanticText": [
      {"text_id": "t_id_0", "type": "heading", "level": 1, "text": "...", ...},
      ...
    ],
    "actionableElements": [...],
    "contentElements": [...],
    "pageState": {
      "url": "https://example.com",
      "title": "Page Title",
      "timestamp": 1700000000000
    },
    "transcripts": [],
    "capabilities": [...]
  }
}
```

### sw.js → ws_server.py
```json
{
  "type": "intelligence_update",
  "data": {
    "semanticPageData": {...},
    "semanticText": [...],
    "actionableElements": [...],
    "contentElements": [...],
    "pageState": {...},
    "transcripts": [],
    "capabilities": [...]
  },
  "tabId": 123,
  "tabUrl": "https://example.com",
  "tabTitle": "Page Title"
}
```

---

## Capability Integration

### Where capabilities come from

**File:** `web_extension/site_configs.json`

```json
{
  "youtube.com": {
    "framework": "youtube",
    "capabilities": {
      "transcript": {
        "action": "RetrieveTranscript",
        "label": "Get video transcript",
        "description": "Retrieves the full transcript for this YouTube video",
        "url_pattern": "/watch?v=",
        "handler": "youtube_transcript_pipeline",
        "selectors": [
          "button[aria-label='Show transcript']",
          "button[aria-label*='transcript' i]"
        ]
      }
    }
  }
}
```

### How they're resolved (domain + URL matching)

**Function:** `resolve_capabilities_for_url(url)`

```python
def resolve_capabilities_for_url(url):
    # 1. Load configs
    all_configs = get_all_site_configs()

    # 2. Match domain
    # Example: url = "https://youtube.com/watch?v=abc123"
    # Matches: "youtube.com" in url → True

    # 3. Extract capabilities
    config = all_configs.get("youtube.com")
    capabilities = config.get("capabilities", {})

    # 4. Filter by url_pattern
    # Only return "transcript" capability if "/watch?v=" in url

    matching = []
    for cap_id, cap_config in capabilities.items():
        url_pattern = cap_config.get('url_pattern')
        if not url_pattern or url_pattern in url:
            matching.append({
                'id': cap_id,
                'action': cap_config['action'],
                'label': cap_config['label'],
                'description': cap_config.get('description'),
                'handler': cap_config.get('handler')
            })

    return matching
```

### How they're injected into text.md

```python
# In text.md generation (ws_server.py lines 3111-3167)

capabilities = resolve_capabilities_for_url(url)

if capabilities:
    # Add to frontmatter
    content_lines.append("capabilities:")
    for cap in capabilities:
        content_lines.append(f"  - action: {cap['action']}")
        content_lines.append(f"    label: {cap['label']}")

    # Add capabilities section to body
    content_lines.append("## Available Actions")
    for cap in capabilities:
        content_lines.append(f"**{cap['action']}** - {cap['label']}")
        if cap.get('description'):
            content_lines.append(f"  - {cap['description']}")
        content_lines.append(f"  - Usage: python3 test_navigation.py --command capability --capability {cap['action']}")
```

### Show example capabilities section

```markdown
## Available Actions

The following pre-configured actions are available for this page:

**RetrieveTranscript** - Get video transcript
  - Retrieves the full transcript for this YouTube video
  - Usage: python3 test_navigation.py --command capability --capability RetrieveTranscript

**ExpandDescription** - Expand video description
  - Clicks the "Show more" button in video description
  - Usage: python3 test_navigation.py --command capability --capability ExpandDescription

---
```

---

## Code References

### For each step, provide:

#### STEP 1: Scan Trigger
- **File:** content.js
- **Function:** `executeScanWithSettle(pageVersion, url, trigger)`
- **Line:** ~1200 (main scan coordinator)
- **Signature:** `async function executeScanWithSettle(pageVersion, url, trigger)`

#### STEP 2: Text Extraction
- **File:** content.js
- **Function:** `IntelligenceEngine.prototype.extractSemanticTextWithIds()`
- **Line:** ~5700
- **Signature:** `extractSemanticTextWithIds() → Array<TextBlock>`
- **Called by:** `prepareIntelligenceData()`

#### STEP 3: Packaging
- **File:** content.js
- **Function:** `IntelligenceEngine.prototype.prepareIntelligenceData()`
- **Line:** ~5900
- **Signature:** `prepareIntelligenceData() → Object`
- **Called by:** `executeScanWithSettle()`

#### STEP 4: Queue Update
- **File:** content.js
- **Function:** `queueIntelligenceUpdate(priority)`
- **Line:** ~5655
- **Signature:** `queueIntelligenceUpdate(priority: string) → void`

#### STEP 5: Send Message
- **File:** content.js
- **Function:** `chrome.runtime.sendMessage()`
- **Line:** Inline in `queueIntelligenceUpdate`
- **Signature:** `chrome.runtime.sendMessage(message, callback)`

#### STEP 6: Service Worker Receive
- **File:** sw.js
- **Function:** `handleScanComplete(message, sender)`
- **Line:** ~1600
- **Signature:** `async function handleScanComplete(message, sender)`

#### STEP 7: WebSocket Send
- **File:** sw.js
- **Function:** `sendToServer(data)` or direct `ws.send()`
- **Line:** ~70-100
- **Signature:** `function sendToServer(data)`

#### STEP 8: Server Receive
- **File:** ws_server.py
- **Function:** `handler(ws)`
- **Line:** 2847
- **Signature:** `async def handler(ws)`

#### STEP 9: text.md Generation
- **File:** ws_server.py
- **Function:** Inline (no separate function)
- **Line:** 3111-3167
- **Location:** Inside `handler()` function, within `intelligence_update` message handler

#### STEP 10: Capability Resolution
- **File:** ws_server.py
- **Function:** `resolve_capabilities_for_url(url)`
- **Line:** 584
- **Signature:** `def resolve_capabilities_for_url(url: str) -> list`

---

## Timeline

### Typical execution time:

1. **DOM extraction:** 50-200ms
   - Depends on page complexity
   - YouTube: ~150ms
   - Simple page: ~50ms

2. **Message passing (content → sw):** 1-5ms
   - Chrome internal messaging
   - Fast synchronous call

3. **WebSocket transmission:** 5-20ms
   - Local connection (127.0.0.1)
   - Depends on payload size
   - YouTube with transcript: ~20ms
   - Simple page: ~5ms

4. **Server processing:** 10-50ms
   - Capability resolution: 1-2ms
   - text.md generation: 5-10ms
   - File write: 5-40ms (depends on disk)

5. **File write:** 5-40ms
   - SSD: 5-10ms
   - HDD: 20-40ms

**Total:** 70-300ms from DOM scan to text.md written

---

## Error Handling

### What happens if:

#### Extraction fails?
- content.js wraps in try-catch
- Returns empty `semanticPageData` object
- Server falls back to `pageText` field
- If both missing: writes empty text.md

#### WebSocket is down?
- sw.js queues message in `pendingMessages`
- Sends when connection re-established
- Auto-reconnect after 1s delay
- No data loss

#### File write fails?
- ws_server.py logs error
- Does NOT crash server
- Other artifacts may still write
- Next intelligence update retries

#### Capabilities resolution fails?
- Returns empty array `[]`
- text.md generated WITHOUT capabilities section
- No crash, graceful degradation

---

## Testing the Pipeline

### How to verify each step:

#### 1. Check Console Logs

**content.js:**
```javascript
console.log('[OME] Semantic text extraction:', semanticText.length, 'blocks');
console.log('[OME] Intelligence update queued');
```

**sw.js:**
```javascript
console.log('[SW] Scan complete received, forwarding to server');
```

**ws_server.py:**
```python
print(f"✅ text.md generated: {text_md_path}")
```

#### 2. Inspect Files

**Check text.md exists:**
```bash
ls -lh @site_structures/text.md
```

**View content:**
```bash
cat @site_structures/text.md
```

**Verify frontmatter:**
```bash
head -20 @site_structures/text.md
```

#### 3. Expected Outputs

**Successful text.md:**
```markdown
---
title: Page Title
url: https://example.com
timestamp: 2025-11-23T12:00:00Z
capabilities:
  - action: SomeAction
    label: Action label
---

# Page Title

## Available Actions

**SomeAction** - Action label
  - Description here
  - Usage: python3 test_navigation.py --command capability --capability SomeAction

---

[Page content]
```

**text.md without capabilities:**
```markdown
---
title: Page Title
url: https://example.com
timestamp: 2025-11-23T12:00:00Z
---

# Page Title

[Page content - no Available Actions section]
```

#### 4. Test Capability Resolution

**Python test:**
```python
from ws_server import resolve_capabilities_for_url

# YouTube video page
caps = resolve_capabilities_for_url("https://youtube.com/watch?v=abc123")
print(caps)
# Expected: [{'action': 'RetrieveTranscript', 'label': 'Get video transcript', ...}]

# YouTube home page
caps = resolve_capabilities_for_url("https://youtube.com")
print(caps)
# Expected: [] (no capabilities match)

# Non-YouTube site
caps = resolve_capabilities_for_url("https://google.com")
print(caps)
# Expected: [] (no config for google.com)
```

#### 5. End-to-End Test

**Full pipeline test:**
```bash
# 1. Start server
python om_e_web_ws/ws_server.py

# 2. Load extension in Chrome

# 3. Navigate to YouTube video
# Open: https://youtube.com/watch?v=dQw4w9WgXcQ

# 4. Wait for scan (check console)
# content.js: "Semantic text extraction: 150 blocks"
# sw.js: "Scan complete received"
# ws_server.py: "✅ text.md generated"

# 5. Verify file
cat @site_structures/text.md

# 6. Check capabilities section
grep -A 5 "Available Actions" @site_structures/text.md
```

---

## Summary

The text.md pipeline is a **complete end-to-end flow** that:

1. **Extracts** semantic text from DOM (headings, paragraphs, lists)
2. **Packages** into intelligence update message
3. **Transmits** through extension → service worker → server
4. **Resolves** capabilities from site configs
5. **Generates** markdown file with frontmatter + capabilities + content
6. **Writes** to @site_structures/text.md

**Key Innovation:** Capabilities are dynamically injected based on URL patterns, enabling context-aware automation without hardcoding logic.

**Status:** ✅ ACTIVE - This is the NEW approach for LLM consumption, replacing standalone text files and providing a unified view of page content + available actions.

---

**End of TEXT_MD_PIPELINE.md**
