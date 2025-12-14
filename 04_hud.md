# HUD (Heads-Up Display) System Documentation

**File:** `/Users/andy7string/Projects/Om_E_Web/web_extension/hud.js`
**Size:** 7,023 lines
**Purpose:** Floating orb interface and full-screen overlay for LLM interaction

---

## Overview

The HUD system provides two complementary user interfaces for interacting with the Om-E AI assistant:

1. **Floating Orb** - A draggable, persistent character that floats on web pages
2. **Full HUD Overlay** - A ChatGPT-style fullscreen interface with chat history sidebar

Both interfaces share state and message history, allowing seamless switching between compact orb view and immersive HUD view.

### Key Characteristics

- **Shadow DOM isolation** - All UI rendered in closed Shadow DOM to prevent style conflicts
- **Dual-view architecture** - Orb view and HUD view share chat state (messages, settings)
- **Theme system** - Three visual themes (Kawaii, Robot, Atom) with matching colors
- **Persistent state** - Position, theme, chat input, and settings saved across sessions
- **Focus guards** - Auto-focus inputs with click-away detection to prevent focus stealing
- **Viewport-aware** - Automatically adjusts position and sizing to stay within viewport

---

## UI Components

### 1. Floating Orb (Orb View)

**Location:** Bottom-right of viewport (draggable)
**Components:**
- **Avatar SVG** - Animated character (Kawaii cat, Robot, or Atom)
- **HUD Button** - Purple circle labeled "HUD" - opens full overlay
- **Scroll Controls** - Vertical gear stick on right (top/gear/bottom buttons)
- **Zoom Controls** - Horizontal layout below orb (+/Z/-)
- **Prompt Button** - Toggle chat panel visibility ("Open Prompt" / "HIDE PROMPT")
- **Chat Panel** - Resizable floating panel anchored to orb (363-968px wide)

**Interaction Modes:**
- Click avatar → drag mode (orb follows cursor, click again to release)
- Click ears/goggles → open HUD overlay
- Hover avatar → spinning arrows appear around orb

### 2. Full HUD Overlay (HUD View)

**Layout:** Full-viewport overlay with three zones:

#### Top Bar
- **Sidebar Toggle** - Mini orb + arrow (left)
- **Close Button** - X button (right)

#### Content Area
- **Sidebar** (280px, slides in from left):
  - Orb close trigger (top)
  - "New Chat" button
  - "Search Chats" input (collapsible)
  - "Your Chats" list (collapsible)
  - Settings orb (bottom) - Chrome-style spinning loader

- **Main Area** (centered, max 900px):
  - **Messages Area** - Scrollable chat history (top to prompt)
  - **Input Area** - Fixed bottom:
    - Prompt wrapper (flexible width, 240-800px)
    - Textarea with clear (X) and send buttons
    - Orb display (80px, shows current theme)
    - Prompt toggle button ("HIDE PROMPT" / "Show Prompt")
    - Text zoom controls (+/T/-)
    - Scroll controls (vertical gear stick)

**Responsive Behavior:**
- Viewport < 614px wide + sidebar open → auto-close sidebar OR hide prompt
- User can force sidebar open on narrow viewports (sets `sidebarForcedNarrow` flag)
- Prompt and messages area shrink when sidebar open

### 3. Chat Panel (Orb View Only)

**Position:** Anchored to orb (85px left of orb, bottom-aligned)
**Size:** Default 750x400px, resizable (min 363x120px, max 968x800px)
**Features:**
- 8 resize handles (N, S, W, NW, SW edges only - right edge fixed to orb)
- Auto-expands to optimal width on open (viewport width - orb - margins)
- Persists size across sessions
- Viewport-aware: shrinks if viewport narrows, restores when space available

**Sections:**
- Messages area (scrollable, top)
- Input area (bottom):
  - Textarea (auto-resizing, 48-400px)
  - Send button (paper plane icon)

---

## State Management

### Global State Object: `hudState`

```javascript
{
  host: HTMLElement|null,              // Shadow host element
  shadow: ShadowRoot|null,             // Closed shadow root
  orb: HTMLElement|null,               // Floating orb element
  hud: HTMLElement|null,               // Full HUD overlay element
  chatPanel: HTMLElement|null,         // Orb chat panel element
  sidebar: HTMLElement|null,           // HUD sidebar element
  visible: boolean,                    // HUD overlay visibility (default: false)
  chatVisible: boolean,                // Chat panel visibility (default: true)
  sidebarOpen: boolean,                // Sidebar visibility (default: false)
  sidebarForcedNarrow: boolean,        // User opened sidebar in narrow viewport
  dragging: boolean,                   // Orb drag mode active
  theme: string,                       // Current theme ('kawaii'|'robot'|'atom')
  panelManuallyResized: boolean,       // User manually resized chat panel
  panelTargetWidth: number|null,       // User's preferred panel width (or optimal)
  focusGuardCleanup: Function|null,    // Orb input focus guard cleanup
  hudFocusGuardCleanup: Function|null, // HUD prompt focus guard cleanup
  userBlurRequested: boolean,          // User clicked outside input (suppress refocus)
  hudTextZoom: number,                 // HUD messages text zoom level (1 = 100%)
  shiftHeld: boolean                   // Shift key state (for Enter/Shift+Enter)
}
```

### Chat State Object: `chatState`

```javascript
{
  currentChatId: string|null,    // Active chat ID
  lastAck: string|null,          // Last acknowledged message
  messages: Array,               // Shared message array [{role, content, id, timestamp}]
  pendingTitle: string|null,     // Title for new chat before first message
  hasMoreMessages: boolean,      // Chat has older messages not loaded
  totalMessages: number          // Total message count in chat file
}
```

### Persistence (via Service Worker)

State synced to service worker via `chrome.runtime.sendMessage`:
- Orb position (right %, bottom %)
- Orb theme
- Chat panel visibility
- Chat panel size
- Chat input text
- Active chat ID
- Sidebar open state
- Browser zoom level (for orb scaling)

**Message Types:**
- `set_orb_state` - Save state key/value
- `get_orb_state` - Retrieve full state
- `sync_*` - Broadcast state change to all tabs

---

## Theming System

### Available Themes

| Theme Key | Name   | Avatar       | Primary Color       | Description                    |
|-----------|--------|--------------|---------------------|--------------------------------|
| `kawaii`  | Kawaii | White kitty  | #7ec8e3 (cyan)      | Fluffy cat with strawberry     |
| `robot`   | Om-E   | Purple bot   | #00e5ff (cyan)      | Bot with goggles, glowing eyes |
| `atom`    | Atom   | Orbital atom | #3CB371 (green)     | Spinning nucleus with rings    |

### Theme Registry: `ORB_THEMES`

Each theme object contains:
```javascript
{
  name: string,           // Display name
  earSelector: string,    // CSS selector for clickable area (opens HUD)
  color: string,          // Hex color for controls/borders
  svg: string,            // Avatar SVG markup
  paws: string            // Paws SVG (shown when dragging, empty for atom)
}
```

### Theme Application

**Function:** `applyOrbTheme(themeName)`
- Swaps orb SVG content
- Updates color CSS variables
- Re-attaches event handlers
- Restores chat input and messages
- Updates HUD orb display if HUD exists
- Syncs theme to other tabs via service worker

**CSS Variables:**
```css
--theme-color: R,G,B        /* RGB values for rgba() */
--theme-accent: #rrggbb     /* Hex color for borders/buttons */
--text-color: #rrggbb       /* Text color (varies by theme) */
```

---

## Function Documentation

### Initialization & Setup

#### `initHUD()`
**Purpose:** Initialize HUD system (creates orb + overlay)
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Creates shadow host element
- Injects HUD styles into shadow DOM
- Creates orb and HUD elements
- Attaches event listeners for keyboard/mouse capture
- Requests saved state from service worker
- Starts auto-init on body ready

**Called By:** `initWhenBodyReady()`, message handlers
**Calls:** `createOrb()`, `createHUD()`, `injectHUDStyles()`, `applyOrbPosition()`, `applyOrbTheme()`, `loadChat()`, `startNewChat()`

#### `initWhenBodyReady()`
**Purpose:** Auto-initialize HUD as soon as document.body exists
**Inputs:** None
**Outputs:** None
**Side Effects:** Recursively calls via `requestAnimationFrame` until body ready
**Called By:** Script load
**Calls:** `initHUD()`

#### `injectHUDStyles(shadow)`
**Purpose:** Inject all CSS styles into shadow DOM
**Inputs:** `shadow` (ShadowRoot)
**Outputs:** None
**Side Effects:** Appends `<style>` element with 2850+ lines of CSS
**Called By:** `initHUD()`

---

### Orb Creation & Management

#### `createOrb(shadow)`
**Purpose:** Create floating orb element with all controls
**Inputs:** `shadow` (ShadowRoot)
**Outputs:** HTMLElement (orb)
**Side Effects:**
- Creates orb HTML structure
- Attaches scroll/zoom/menu/chat handlers
- Sets up drag behavior
- Appends to shadow root

**Called By:** `initHUD()`
**Calls:** `toggleHUD()`, `toggleChatPanel()`, `setupChatPanelResize()`, `renderChatMessages()`, `saveOrbPosition()`, `constrainOrbToViewport()`

#### `applyOrbTheme(themeName)`
**Purpose:** Change orb visual theme
**Inputs:** `themeName` (string) - 'kawaii', 'robot', or 'atom'
**Outputs:** None
**Side Effects:**
- Updates orb HTML with new SVG
- Re-attaches all event handlers
- Restores chat input text
- Updates HUD orb if exists
- Broadcasts theme to other tabs

**Called By:** `setOrbTheme()`, `initHUD()`
**Calls:** `disengageGear()`, `updateHUDOrb()`, `toggleHUD()`, `toggleChatPanel()`, `autoResizeOrbInput()`, `renderChatMessages()`, `setupChatPanelResize()`

---

### HUD Overlay Creation

#### `createHUD(shadow)`
**Purpose:** Create full-screen HUD overlay
**Inputs:** `shadow` (ShadowRoot)
**Outputs:** HTMLElement (HUD)
**Side Effects:**
- Creates HUD HTML structure (topbar, sidebar, main area)
- Attaches handlers for close, sidebar toggle, settings, etc.
- Sets up message scroll controls
- Configures LLM settings panel

**Called By:** `initHUD()`
**Calls:** `toggleHUD()`, `toggleSidebar()`, `startNewChat()`, `filterSidebarChats()`, `loadSettingsIntoPanel()`, `autoResizeTextarea()`, `sendChatMessage()`, `sendLLMChat()`, `renderChatMessages()`

#### `updateHUDOrb(hud, themeName)`
**Purpose:** Update HUD's orb display when theme changes
**Inputs:** `hud` (HTMLElement), `themeName` (string)
**Outputs:** None
**Side Effects:**
- Updates mini orb in topbar
- Updates main orb in input area
- Updates sidebar orb
- Updates theme dataset attribute

**Called By:** `applyOrbTheme()`, message handlers
**Calls:** None

---

### View Toggling

#### `toggleHUD()`
**Purpose:** Show/hide full HUD overlay
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Toggles `hudState.visible`
- Locks/unlocks page scroll
- Syncs chat input between views
- Activates appropriate focus guard

**Called By:** Orb HUD button, message handlers, keyboard shortcuts
**Calls:** `initHUD()`, `renderChatMessages()`, `updateHUDPromptVisibility()`, `syncHUDPromptInput()`, `syncOrbChatInput()`, `focusHUDPromptGuard()`, `focusOrbInputGuard()`, `stopHUDPromptFocusGuard()`

#### `toggleChatPanel()`
**Purpose:** Show/hide orb chat panel
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Toggles `hudState.chatVisible`
- Calculates optimal panel width if not manually resized
- Syncs input text from service worker
- Activates orb focus guard if opening
- Persists state to service worker

**Called By:** Orb prompt button, message handlers
**Calls:** `calculateOptimalPanelWidth()`, `constrainOrbToViewport()`, `renderChatMessages()`, `focusOrbInputGuard()`, `stopOrbInputFocusGuard()`, `updateHUDPromptVisibility()`, `saveChatInput()`

#### `toggleSidebar(forceState)`
**Purpose:** Open/close HUD sidebar
**Inputs:** `forceState` (boolean, optional) - force open (true) or closed (false)
**Outputs:** None
**Side Effects:**
- Toggles sidebar visibility
- Checks if prompt should hide on narrow viewport
- Loads chat list when opening
- Persists state to service worker

**Called By:** Sidebar toggle buttons, message handlers
**Calls:** `checkHudPromptVisibility()`, `loadSidebarChats()`

---

### Chat Panel Sizing & Positioning

#### `setupChatPanelResize(chatPanel)`
**Purpose:** Enable drag-to-resize on chat panel edges
**Inputs:** `chatPanel` (HTMLElement)
**Outputs:** None
**Side Effects:**
- Attaches mousedown handlers to resize handles
- Updates panel dimensions during drag
- Saves size on mouseup

**Called By:** `createOrb()`, `applyOrbTheme()`
**Calls:** `saveChatPanelSize()`, `restoreChatPanelSize()`

#### `saveChatPanelSize(width, height)`
**Purpose:** Persist chat panel dimensions
**Inputs:** `width` (number), `height` (number)
**Outputs:** None
**Side Effects:**
- Sets `panelManuallyResized` flag
- Stores dimensions in service worker
- Updates `panelTargetWidth`

**Called By:** `setupChatPanelResize()`

#### `restoreChatPanelSize(chatPanel)`
**Purpose:** Restore saved panel size from service worker
**Inputs:** `chatPanel` (HTMLElement)
**Outputs:** None
**Side Effects:** Requests state from service worker, applies width/height
**Called By:** `setupChatPanelResize()`

#### `calculateOptimalPanelWidth(chatPanel)`
**Purpose:** Calculate maximum panel width based on viewport space
**Inputs:** `chatPanel` (HTMLElement)
**Outputs:** None
**Side Effects:** Sets panel width CSS (respects min 363px, max 968px)
**Called By:** `toggleChatPanel()`, `initHUD()`

#### `tryRestorePanelWidth()`
**Purpose:** Expand panel back to target width after resize (if space available)
**Inputs:** None
**Outputs:** None
**Side Effects:** Sets panel width to user's preferred or optimal width
**Called By:** Window resize handler

#### `constrainOrbToViewport()`
**Purpose:** Keep orb and chat panel within viewport bounds
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Adjusts orb position (right %, bottom %)
- Shrinks panel width if needed
- Shrinks panel height if needed
- Moves orb if panel can't shrink more
- Saves position changes

**Strategy:**
- Panel open: shrink panel first, then move orb
- Panel closed: just move orb
- Maintains 10px margin from all edges

**Called By:** `toggleChatPanel()`, `createOrb()`, `applyOrbTheme()`, window resize handler
**Calls:** `saveOrbPosition()`

---

### Orb Position Management

#### `saveOrbPosition(rightPct, bottomPct)`
**Purpose:** Persist orb position to service worker
**Inputs:** `rightPct` (number 0-100), `bottomPct` (number 0-100)
**Outputs:** None
**Side Effects:** Broadcasts position to all tabs
**Called By:** `constrainOrbToViewport()`, `createOrb()`, `applyOrbPosition()`

#### `applyOrbPosition(position)`
**Purpose:** Apply saved position from service worker
**Inputs:** `position` (object) - `{right, bottom}` (percentages) or `{left, top}` (legacy pixels)
**Outputs:** None
**Side Effects:**
- Converts legacy pixel positions to percentages
- Sets orb CSS `right` and `bottom` properties
- Saves converted position

**Called By:** `initHUD()`, message handlers

#### `restoreOrbScreenPosition(rightPct, bottomPct)`
**Purpose:** Restore orb to exact screen position after browser zoom
**Inputs:** `rightPct` (number), `bottomPct` (number)
**Outputs:** None
**Side Effects:** Clamps to 1-90% range, applies position, saves to SW
**Called By:** Zoom handlers

#### `applyOrbZoomScale(zoomLevel)`
**Purpose:** Scale orb inversely to browser zoom (keeps visual size constant)
**Inputs:** `zoomLevel` (number) - 1.0 = 100%, 1.5 = 150%, etc.
**Outputs:** None
**Side Effects:** Sets `--ome-zoom-scale` CSS variable (clamped 0.5-2.0)
**Called By:** `initHUD()`, zoom capability handlers

#### `clampOrbToViewport()`
**Purpose:** (Alias) Ensure orb stays within viewport
**Inputs:** None
**Outputs:** None
**Side Effects:** Calls `constrainOrbToViewport()`
**Called By:** Window resize listener

---

### Focus Management

#### `focusHUDPromptGuard(force)`
**Purpose:** Auto-focus HUD prompt with guard against focus stealing
**Inputs:** `force` (boolean) - ignore `userBlurRequested` once
**Outputs:** None
**Side Effects:**
- Focuses HUD textarea
- Sets cursor to end
- Attaches focusout and pointerdown listeners
- Stops orb focus guard

**Pattern:** Continuously refocuses unless user clicks outside
**Called By:** `toggleHUD()`, `renderChatMessages()`, message handlers
**Calls:** `stopOrbInputFocusGuard()`, `stopHUDPromptFocusGuard()`

#### `stopHUDPromptFocusGuard()`
**Purpose:** Remove HUD focus guard listeners
**Inputs:** None
**Outputs:** None
**Side Effects:** Calls cleanup function, sets to null
**Called By:** `focusHUDPromptGuard()`, `toggleHUD()`, `focusOrbInputGuard()`

#### `focusOrbInputGuard(force)`
**Purpose:** Auto-focus orb chat input with guard against focus stealing
**Inputs:** `force` (boolean) - ignore `userBlurRequested` once
**Outputs:** None
**Side Effects:**
- Skips if HUD visible (HUD has priority)
- Focuses chat input
- Sets cursor to end
- Attaches focusout and pointerdown listeners
- Stops HUD focus guard

**Pattern:** Continuously refocuses unless user clicks outside
**Called By:** `toggleChatPanel()`, `renderChatMessages()`, message handlers
**Calls:** `stopHUDPromptFocusGuard()`, `stopOrbInputFocusGuard()`

#### `stopOrbInputFocusGuard()`
**Purpose:** Remove orb input focus guard listeners
**Inputs:** None
**Outputs:** None
**Side Effects:** Calls cleanup function, sets to null
**Called By:** `focusOrbInputGuard()`, `toggleChatPanel()`, `focusHUDPromptGuard()`

---

### Input Syncing

#### `saveChatInput(value)`
**Purpose:** Persist chat input text to service worker
**Inputs:** `value` (string)
**Outputs:** None
**Side Effects:** Broadcasts to all tabs
**Called By:** Textarea blur handlers

#### `syncHUDPromptInput()`
**Purpose:** Sync HUD prompt textarea from service worker
**Inputs:** None
**Outputs:** None
**Side Effects:** Requests latest chatInput, sets textarea value, triggers resize
**Called By:** `toggleHUD()`, visibility change listener

#### `syncOrbChatInput()`
**Purpose:** Sync orb chat input from service worker
**Inputs:** None
**Outputs:** None
**Side Effects:** Requests latest chatInput, sets textarea value, triggers resize
**Called By:** `toggleHUD()`, visibility change listener

---

### Prompt Visibility Management

#### `updateHUDPromptVisibility()`
**Purpose:** Sync HUD prompt visibility with shared `chatVisible` state
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Toggles `.hidden-by-user` class
- Updates prompt button text
- Toggles `.prompt-hidden` class on HUD

**Called By:** `toggleHUD()`, `toggleChatPanel()`

#### `checkHudPromptVisibility(isManualToggle)`
**Purpose:** Auto-hide prompt on narrow viewport or auto-close sidebar
**Inputs:** `isManualToggle` (boolean) - true if user manually opened sidebar
**Outputs:** None
**Side Effects:**
- Viewport < 614px + sidebar open → auto-close sidebar (unless forced)
- Manual sidebar open on narrow → hide prompt, set `sidebarForcedNarrow` flag
- Wide viewport → show prompt, clear forced flag

**Called By:** `toggleSidebar()`, window resize listener

---

### Sidebar Chat Management

#### `loadSidebarChats()`
**Purpose:** Fetch and render chat list from server
**Inputs:** None
**Outputs:** None
**Side Effects:** Sends `GetChatList` capability message, calls `renderSidebarChats()`
**Called By:** `toggleSidebar()`, `initHUD()`, `startNewChat()`, `deleteChat()`, `renameNewChat()`

#### `renderSidebarChats(chats)`
**Purpose:** Populate sidebar with chat items
**Inputs:** `chats` (Array) - `[{chat_id, title, date_short, message_count}, ...]`
**Outputs:** None
**Side Effects:**
- Clears chat list
- Creates chat item elements with title, date, actions
- Attaches click handlers for load/rename/delete

**Called By:** `loadSidebarChats()`
**Calls:** `loadChat()`, `renameChat()`, `showDeleteConfirm()`, `escapeHtml()`

#### `filterSidebarChats(query)`
**Purpose:** Client-side filter of chat list by title
**Inputs:** `query` (string) - search term
**Outputs:** None
**Side Effects:**
- Shows/hides chat items based on title match
- Updates empty message ("No matching chats")

**Called By:** Search input handler

#### `markActiveChatInSidebar(chatId)`
**Purpose:** Highlight active chat in sidebar
**Inputs:** `chatId` (string)
**Outputs:** None
**Side Effects:** Removes `.active` from all, adds to matching chat
**Called By:** `loadChat()`

---

### Chat CRUD Operations

#### `loadChat(chatId, skipBroadcast, tail)`
**Purpose:** Load chat from server and render messages
**Inputs:**
- `chatId` (string)
- `skipBroadcast` (boolean, default false) - skip setting active chat in SW
- `tail` (number, default 10) - number of recent messages (null = all)

**Outputs:** None
**Side Effects:**
- Sends `LoadChat` capability message
- Updates `chatState` with messages
- Removes new chat placeholder
- Marks active in sidebar
- Renders messages
- Handles truncation and "has more" flag

**Called By:** Sidebar click, message handlers, `initHUD()`
**Calls:** `removeNewChatPlaceholder()`, `markActiveChatInSidebar()`, `renderChatMessages()`, `loadSidebarChats()`

#### `loadFullChatHistory(chatId)`
**Purpose:** Load all messages in chat (not just recent tail)
**Inputs:** `chatId` (string)
**Outputs:** None
**Side Effects:** Calls `loadChat()` with `tail=null`
**Called By:** Manual invocation (future: scroll-to-load-more feature)

#### `startNewChat()`
**Purpose:** Start a fresh chat (clear messages, reset state)
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Clears `chatState`
- Clears active chat in service worker
- Removes active class from sidebar items
- Shows new chat placeholder
- Re-renders (empty messages)

**Called By:** New Chat button, `deleteChat()`, message handlers
**Calls:** `showNewChatPlaceholder()`, `renderChatMessages()`

#### `showNewChatPlaceholder()`
**Purpose:** Display "New Chat" item in sidebar
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Creates placeholder element with "Unsaved" meta
- Attaches click handler to rename

**Called By:** `startNewChat()`
**Calls:** `renameNewChat()`, `escapeHtml()`

#### `removeNewChatPlaceholder()`
**Purpose:** Remove "New Chat" placeholder from sidebar
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Clears placeholder container
- Resets "New Chat" button state

**Called By:** `loadChat()`, `renameNewChat()`, sidebar handler

#### `renameNewChat()`
**Purpose:** Make new chat title editable, create chat on confirm
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Makes title contentEditable
- Shows tick/cross buttons
- Sends `CreateChat` capability on confirm
- Loads new chat on success

**Called By:** `showNewChatPlaceholder()` click handler
**Calls:** `loadChat()`, `loadSidebarChats()`

#### `renameChat(chatId, currentTitle)`
**Purpose:** Make existing chat title editable
**Inputs:** `chatId` (string), `currentTitle` (string)
**Outputs:** None
**Side Effects:**
- Makes title contentEditable
- Sends `RenameChat` capability on blur
- Restores original title on error/cancel

**Called By:** Sidebar rename button
**Calls:** None

#### `deleteChat(chatId, title)`
**Purpose:** Delete a chat file (called after confirmation)
**Inputs:** `chatId` (string), `title` (string)
**Outputs:** None
**Side Effects:**
- Sends `DeleteChat` capability
- Starts new chat if was active
- Refreshes sidebar

**Called By:** `showDeleteConfirm()` confirm handler
**Calls:** `startNewChat()`, `loadSidebarChats()`

#### `showDeleteConfirm(chatItem, chatId, title)`
**Purpose:** Show inline confirm/cancel buttons for delete
**Inputs:** `chatItem` (HTMLElement), `chatId` (string), `title` (string)
**Outputs:** None
**Side Effects:**
- Hides pen button
- Shows tick/cross buttons
- Attaches click-outside-to-dismiss handler

**Called By:** Sidebar delete button
**Calls:** `deleteChat()`

---

### Message Rendering

#### `renderChatMessages()`
**Purpose:** Render all messages to both orb and HUD from shared `chatState`
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Clears and rebuilds both message areas
- Scrolls to bottom for user messages
- Scrolls to top of assistant messages (for reading long responses)
- Refocuses appropriate input

**Called By:** `toggleHUD()`, `toggleChatPanel()`, `loadChat()`, `startNewChat()`, `addChatMessage()`, `applyOrbTheme()`, `createOrb()`
**Calls:** `renderMessageContent()`, `focusHUDPromptGuard()`, `focusOrbInputGuard()`, `checkAndRepositionHUD()`

#### `renderMessageContent(msgEl, msg)`
**Purpose:** Render message text, images, and copy button
**Inputs:** `msgEl` (HTMLElement), `msg` (Object) - `{content, images, role}`
**Outputs:** None
**Side Effects:**
- Parses markdown to HTML
- Appends image elements
- Adds copy button with click handler

**Called By:** `renderChatMessages()`
**Calls:** `parseMarkdown()`

#### `parseMarkdown(text)`
**Purpose:** Convert markdown to HTML (safe, XSS-protected)
**Inputs:** `text` (string)
**Outputs:** HTML string
**Side Effects:** None
**Supports:**
- Headers (`#`, `##`, `###`)
- Bold (`**text**`, `__text__`)
- Italic (`*text*`, `_text_`)
- Inline code (`` `code` ``)
- Code blocks (` ```lang\ncode\n``` `)
- Links (`[text](url)`)
- Auto-link URLs
- Blockquotes (`> text`)
- Lists (`- item`, `1. item`)
- Horizontal rules (`---`, `***`)

**Called By:** `renderMessageContent()`

#### `addChatMessage(role, content, options)`
**Purpose:** Add message to shared state and render
**Inputs:**
- `role` (string) - 'user', 'assistant', or 'error'
- `content` (string)
- `options` (Object, optional) - `{id, images}`

**Outputs:** None
**Side Effects:**
- Pushes to `chatState.messages`
- Calls `renderChatMessages()`

**Called By:** Message handlers, error handlers

---

### Message Sending

#### `sendChatMessage(prompt, chatId, meta)`
**Purpose:** Send user message to server via `AppendMessage` capability
**Inputs:**
- `prompt` (string) - user's message text
- `chatId` (string|null) - existing chat ID or null for new chat
- `meta` (Object) - `{page_url, page_title}`

**Outputs:** Promise resolving to result object
**Side Effects:**
- Creates new chat if needed (stores `chat_id` in `chatState`)
- Removes new chat placeholder
- Refreshes sidebar
- Broadcasts active chat to other tabs

**Called By:** Orb send button, HUD send button
**Calls:** `removeNewChatPlaceholder()`, `loadSidebarChats()`

#### `sendLLMChat(message, clearHistory)`
**Purpose:** Send message to LLM and get response
**Inputs:**
- `message` (string) - user's message
- `clearHistory` (boolean, default false) - reset agent conversation

**Outputs:** Promise resolving to LLM response
**Side Effects:**
- Sends `LLMChat` capability message
- Response arrives via `hud_action` message (append_message)

**Called By:** Orb send button, HUD send button
**Calls:** None

---

### Scroll Control Functions

#### `scrollWithFeedback(direction, button)`
**Purpose:** Scroll page with boundary visual feedback
**Inputs:** `direction` ('up'|'down'|'left'|'right'), `button` (HTMLElement)
**Outputs:** None
**Side Effects:**
- Scrolls viewport 80% of dimension
- Flashes button if at boundary

**Called By:** Scroll button handlers (currently unused - using direct scrollTo)

---

### Scroll Gear Functions (Orb & HUD)

Both orb and HUD have identical gear control patterns:

**Gear Button States:**
- **Disengaged** (default) - click to engage
- **Engaged** - gold glow, cursor Y offset = scroll speed
- **Scrolling Up** - upward glow
- **Scrolling Down** - downward glow
- **Boundary** - red flash when at scroll limit

**Functions:**
- `engageGear(e)` - Click gear to engage, store Y position
- `disengageGear()` - Release gear, stop scrolling
- `handleGearMove(e)` - Mouse move updates scroll speed from Y delta
- `handleGearClick(e)` - Click anywhere disengages
- `scrollLoop()` - Animation loop applies scroll based on offset

**Disengage Triggers:**
- Click anywhere (consumed, won't trigger page elements)
- Move mouse >50px horizontally
- Click gear again

---

### HUD Zoom Functions

#### `applyHudTextZoom(zoom)`
**Purpose:** Set text zoom level for HUD messages
**Inputs:** `zoom` (number) - 0.75 to 1.5 (75% to 150%)
**Outputs:** None
**Side Effects:** Sets `--hud-text-zoom` CSS variable
**Called By:** Zoom button handlers

---

### Settings Panel Functions

#### `loadSettingsIntoPanel()`
**Purpose:** Load LLM config into settings panel
**Inputs:** None
**Outputs:** None
**Side Effects:**
- Requests config from service worker
- Populates provider, endpoint, model, API key, temperature, max tokens
- Syncs temperature availability based on model

**Called By:** Settings orb click handler

#### `loadLLMModelsConfig()`
**Purpose:** Load `llm_models.json` (cached)
**Inputs:** None
**Outputs:** Promise resolving to config object
**Side Effects:** Fetches file, stores in `_llmModelsCache`
**Called By:** `getDefaultEndpointForProvider()`, `loadModelsForProvider()`

#### `getDefaultEndpointForProvider(provider)`
**Purpose:** Get default endpoint URL for provider
**Inputs:** `provider` (string) - 'openai', 'anthropic', 'lm_studio'
**Outputs:** Promise resolving to URL string
**Side Effects:** None
**Called By:** Provider change handler

#### `loadModelsForProvider(provider)`
**Purpose:** Get model list for provider
**Inputs:** `provider` (string)
**Outputs:** Promise resolving to array of `{id, name, default}`
**Side Effects:** None
**Called By:** `populateModelList()`

#### `populateModelList(provider, currentModel)`
**Purpose:** Populate model dropdown for provider
**Inputs:** `provider` (string), `currentModel` (string, optional)
**Outputs:** None
**Side Effects:**
- Clears and rebuilds select options
- Adds "Other (Custom)" option
- Shows/hides custom input based on selection
- Syncs temperature availability

**Called By:** Provider change handler, `loadSettingsIntoPanel()`

#### `getSelectedModel()`
**Purpose:** Get current model ID from panel
**Inputs:** None
**Outputs:** String (model ID or custom value)
**Side Effects:** None
**Called By:** Save settings handler

#### `modelSupportsTemperature(modelId)`
**Purpose:** Check if model supports temperature parameter
**Inputs:** `modelId` (string)
**Outputs:** Boolean
**Logic:** O1 models and o1-preview models → false, all others → true
**Called By:** `syncTemperatureAvailability()`

#### `syncTemperatureAvailability()`
**Purpose:** Enable/disable temperature input based on model
**Inputs:** None
**Outputs:** None
**Side Effects:** Sets disabled state and opacity on temperature input
**Called By:** Model select change handler, `populateModelList()`

---

### Textarea Auto-Resize

#### `autoResizeOrbInput()`
**Purpose:** Resize orb chat input as user types
**Inputs:** None
**Outputs:** None
**Side Effects:** Sets height to fit content (48-400px)
**Called By:** Input event handler, theme change, resize observer

#### `autoResizeTextarea()`
**Purpose:** Resize HUD prompt textarea as user types
**Inputs:** None
**Outputs:** None
**Side Effects:** Sets height to fit content (40-300px)
**Called By:** Input event handler

---

### Utility Functions

#### `escapeHtml(str)`
**Purpose:** Escape HTML to prevent XSS
**Inputs:** `str` (string)
**Outputs:** Escaped string
**Side Effects:** None
**Called By:** `renderSidebarChats()`, `showNewChatPlaceholder()`

#### `checkAndRepositionHUD()`
**Purpose:** Ensure HUD fits within viewport after content change
**Inputs:** None
**Outputs:** None
**Side Effects:** (Currently empty function - placeholder for future)
**Called By:** `renderChatMessages()`

---

## Event Handling

### User Interaction Handlers

#### Orb Interactions
- **Click avatar** → `startFollowing()` / `releaseOrb()` (toggle drag mode)
- **Click ears/goggles** → `toggleHUD()` (open overlay)
- **Click HUD button** → `toggleHUD()`
- **Click Scroll Top** → `window.scrollTo({top: 0})`
- **Click Scroll Bottom** → `window.scrollTo({top: scrollHeight})`
- **Click Gear** → `engageGear()` (variable scroll mode)
- **Click Zoom +** → Send `ZoomIn` capability
- **Click Zoom -** → Send `ZoomOut` capability
- **Click Z label** → Send `ZoomReset` capability
- **Click Prompt Button** → `toggleChatPanel()`
- **Drag resize handles** → Resize chat panel (via `setupChatPanelResize()`)

#### HUD Interactions
- **Click Close (X)** → `toggleHUD()`
- **Click Sidebar Toggle** → `toggleSidebar()`
- **Click Sidebar Close** → `toggleSidebar(false)`
- **Click New Chat** → `startNewChat()` / `removeNewChatPlaceholder()` (toggle)
- **Click Search Chats** → Show/hide search box
- **Click Your Chats Label** → Collapse/expand chat list
- **Click Settings Orb** → Show/hide settings panel
- **Click Outside Settings** → Close settings panel
- **Click Chat Item** → `loadChat(chatId)`
- **Click Rename Button** → `renameChat(chatId, title)`
- **Click Delete Button** → `showDeleteConfirm()`
- **Click Scroll Top** → Scroll messages to top
- **Click Scroll Bottom** → Scroll messages to bottom
- **Click Gear** → `engageGear()` (messages scroll)
- **Click Zoom +** → `applyHudTextZoom(hudState.hudTextZoom + 0.1)`
- **Click Zoom -** → `applyHudTextZoom(hudState.hudTextZoom - 0.1)`
- **Click T label** → `applyHudTextZoom(1)` (reset)
- **Click Prompt Button** → Toggle prompt visibility
- **Click Send Button** → Send message via `sendChatMessage()` + `sendLLMChat()`
- **Click Clear Button** → Clear prompt textarea

#### Keyboard Shortcuts
- **Enter** (prompt focused) → Send message (unless Shift held)
- **Shift+Enter** (prompt) → Insert newline
- **Escape** (prompt focused) → Clear and blur
- **Escape** (editing title) → Cancel edit
- **Escape** (chat panel open) → Close chat panel
- **Escape** (search box open) → Close search

#### Input Events
- **Orb chat input** → Auto-resize, save on blur
- **HUD prompt textarea** → Auto-resize, save on blur
- **Search input** → Filter chats in real-time

### Message Handlers (from Service Worker)

#### `toggle_hud`
**Action:** Toggle HUD overlay visibility
**Response:** `{ok: true, visible: boolean}`
**Calls:** `initHUD()`, `toggleHUD()`

#### `set_orb_theme`
**Action:** Set orb theme via CLI/WebSocket
**Payload:** `{theme: string}`
**Response:** `{ok: true, theme, available}` or `{ok: false, error, available}`
**Calls:** `initHUD()`, `setOrbTheme()`

#### `get_orb_themes`
**Action:** Get list of available themes
**Response:** `{ok: true, current, themes: [{key, name}, ...]}`

#### `apply_orb_theme`
**Action:** Set theme from popup
**Payload:** `{theme: string}`
**Response:** `{ok: true, theme}` or `{ok: false, error}`
**Calls:** `initHUD()`, `setOrbTheme()`

#### `sync_orb_position`
**Action:** Sync position from another tab
**Payload:** `{position: {right, bottom}}`
**Calls:** `initHUD()`, `applyOrbPosition()`

#### `sync_orb_theme`
**Action:** Sync theme from another tab
**Payload:** `{theme: string}`
**Calls:** `initHUD()`, `applyOrbTheme()`, `updateHUDOrb()`

#### `sync_chat_visible`
**Action:** Sync chat panel visibility from another tab
**Payload:** `{chatVisible: boolean}`
**Calls:** `initHUD()`, `updateHUDPromptVisibility()`

#### `sync_panel_size`
**Action:** Sync chat panel size from another tab
**Payload:** `{chatPanelSize: {width, height}}`
**Calls:** `initHUD()`

#### `sync_active_chat`
**Action:** Sync active chat from another tab
**Payload:** `{activeChatId: string|null}`
**Calls:** `initHUD()`, `loadChat()`, `renderChatMessages()`

#### `hud_action`
**Action:** Server-driven UI actions
**Payload:** `{action: {type, ...data}}`
**Types:**
- `load_chat` - Load and display chat
- `create_chat` - New chat created
- `append_message` - New message added
- `rename_chat` - Chat renamed
- `delete_chat` - Chat deleted
- `search_results` - Search results from LLM
- `show_hud` / `hide_hud` / `toggle_hud` - HUD control
- `show_sidebar` / `hide_sidebar` / `toggle_sidebar` - Sidebar control
- `expand_orb` / `collapse_orb` - Chat panel control
- `focus_orb_input` - Focus appropriate input

### Custom Events

#### `ome-focus-orb-input` (window)
**Source:** `content.js` after scan completes
**Action:** Route focus to appropriate input (HUD or orb)
**Calls:** `focusHUDPromptGuard()` or `focusOrbInputGuard()`

### Document Event Listeners (Capture Phase)

When HUD visible or shadow DOM focused:

- **click** → Block propagation to page
- **mousedown** → Block propagation to page
- **keydown** → Block propagation, handle prompt keys (Enter/Escape)
- **keyup** → Block propagation
- **keypress** → Block propagation

**Purpose:** Prevent page interactions when HUD is active

---

## Pipelines & Flows

### 1. HUD Initialization Flow

```
Page Load
  → initWhenBodyReady() (requestAnimationFrame loop)
  → document.body exists
  → initHUD()
    → Create shadow host
    → injectHUDStyles()
    → createOrb()
      → Build orb HTML
      → Attach scroll/zoom/menu/chat handlers
      → Setup chat panel resize
      → Append to shadow
    → createHUD()
      → Build HUD HTML (topbar, sidebar, main)
      → Attach close/sidebar/settings handlers
      → Setup messages scroll
      → Append to shadow
    → Attach document capture listeners (block page events)
    → Request orb state from service worker
      → Apply theme (applyOrbTheme)
      → Apply position (applyOrbPosition)
      → Apply zoom scale (applyOrbZoomScale)
      → Restore chat panel visibility
      → Restore chat input text
      → Restore sidebar state
      → Load active chat or start new
```

### 2. Chat Message Flow (User Input → Server → Response Display)

**Orb View:**
```
User types in chat input
  → Textarea auto-resizes (autoResizeOrbInput)
  → User presses Enter (or clicks send)
  → handleOrbSend()
    → Clear input, save empty string
    → sendChatMessage(text)
      → Send AppendMessage capability
      → Creates new chat if needed
      → Stores chat_id in chatState
      → Refreshes sidebar
    → sendLLMChat(text)
      → Send LLMChat capability
      → Response arrives via hud_action (append_message)
        → Updates chatState.messages
        → Calls renderChatMessages()
          → Renders to both orb and HUD
          → Scrolls to appropriate position
          → Refocuses input
```

**HUD View:**
```
User types in HUD prompt
  → Textarea auto-resizes (autoResizeTextarea)
  → User presses Enter (or clicks send)
  → handleHUDSend()
    → Clear prompt, save empty string
    → sendChatMessage(text)
      → (same as orb view)
    → sendLLMChat(text)
      → (same as orb view)
```

### 3. Theme Switching Flow

```
User clicks theme button (or message received)
  → setOrbTheme(themeName)
    → Save theme to service worker
    → Broadcast sync_orb_theme to all tabs
    → applyOrbTheme(themeName)
      → Release any active dragging
      → Build new HTML (orb wrapper + controls + chat panel)
      → Re-attach all event handlers
        → Scroll buttons
        → Gear button (engage/disengage/move)
        → Zoom buttons
        → Menu button
        → Prompt button
        → Chat panel handlers
      → Restore chat input from service worker
      → Render messages
      → Setup resize handlers
      → Update HUD orb display if exists
      → Update theme selector active state
```

### 4. Orb State Persistence Flow

```
State Change (position/theme/chatVisible/etc.)
  → Save function called (e.g., saveOrbPosition, saveChatInput)
  → chrome.runtime.sendMessage({type: 'set_orb_state', ...data})
  → Service Worker
    → Stores in local state
    → Broadcasts sync_* message to all tabs
  → Other tabs receive sync message
    → Apply state change (e.g., applyOrbPosition)
    → Update UI to match
```

### 5. Panel Resize/Drag Flow

```
User hovers resize handle
  → Cursor changes (n-resize, w-resize, etc.)
  → User clicks and drags
    → mousedown event
      → Store start position and dimensions
      → Add .resizing class
      → Attach document mousemove/mouseup listeners
    → mousemove events
      → Calculate new width/height based on delta
      → Clamp to min/max constraints
      → Apply CSS dimensions
    → mouseup event
      → Remove .resizing class
      → Remove document listeners
      → saveChatPanelSize(width, height)
        → Store in service worker
        → Set panelManuallyResized flag
        → Broadcast to other tabs
```

### 6. Viewport Constraint Flow

**Triggered by:** Window resize, chat panel open/close, orb position change

```
Window resize OR chat panel toggle
  → Immediate: tryRestorePanelWidth()
    → Calculate available space
    → Expand panel to target width if space allows
  → Debounced (100ms): constrainOrbToViewport()
    → Calculate orb and panel footprints
    → Check edges (left, right, top, bottom)
    → Panel open strategy:
      → Left overflow: shrink panel, then move orb
      → Right overflow: move orb
      → Top overflow: move orb down, then shrink panel height
    → Panel closed strategy:
      → Just move orb within bounds
    → Apply position changes
    → Save if changed
```

---

## Redundant/Deprecated Functions

### Potentially Unused

1. **`scrollWithFeedback(direction, button)`** - Defined but not called (scroll buttons use direct `scrollTo`)
2. **`constrainChatPanelToViewport`** - Alias for `constrainOrbToViewport`, kept for backwards compatibility
3. **Sweep Mode Functions** - Defined in createHUD but never activated:
   - `startSweep()`
   - `endSweep()`
   - `highlightSweptText()`
   - `clearSweptHighlights()`
   - `updateSweptRegion()`
4. **Scan Mode Functions** - Defined but never activated:
   - `exitScanMode()`
5. **HUD Slide Functions** - Defined but never used:
   - `startHudSlide()`
   - `releaseHudSlide()`

### Legacy Code Patterns

1. **Typing Preview** - Orb chat panel has typing preview element but it's never rendered (code looks for `.typing-preview` which doesn't exist in HTML)
2. **Theme Selector Buttons** - HUD references `.ome-theme-btn` but they're not in the HTML anymore
3. **HUD Rail** - `.ome-hud-rail` element exists but is `display: none` (was for sliding prompt unit)

---

## CSS & Styling

### Shadow DOM Approach

All styles injected into closed Shadow DOM via `<style>` tag (~2850 lines). This ensures:
- No conflicts with page styles
- No leakage to page
- Complete visual isolation

### Style Organization

Styles follow a logical structure:
1. **Canvas** (`:host`) - Fixed full-viewport positioning
2. **Orb** - Floating orb, drag indicators, paws, animations
3. **Theme Colors** - CSS variables for each theme
4. **HUD Layout** - Topbar, sidebar, main area, input area
5. **Messages** - Bubbles, markdown styling, copy buttons
6. **Chat Panel** - Sizing, resize handles, input area
7. **Sidebar** - Chat list, search, settings panel
8. **Controls** - Scroll gear, zoom buttons, menu buttons
9. **Animations** - Float, wiggle, spin, pulse, etc.

### Key CSS Variables

```css
:host {
  --ome-zoom-scale: 1.21;        /* Orb scale compensation for browser zoom */
}

.ome-hud {
  --theme-color: R,G,B;          /* RGB for rgba() usage */
  --theme-accent: #rrggbb;       /* Hex color for borders/buttons */
  --text-color: #rrggbb;         /* Text color */
}

.ome-hud-messages-content {
  --hud-text-zoom: 1;            /* Text zoom multiplier */
}
```

### Theme Color Application

Each theme defines 3 CSS variables:
- `--theme-color` (RGB triplet) - Used in `rgba(var(--theme-color), alpha)`
- `--theme-accent` (hex) - Used for solid colors (borders, backgrounds)
- `--text-color` (hex) - Text and icon colors

**Examples:**
```css
/* Kawaii theme */
--theme-color: 126,200,227;
--theme-accent: #7ec8e3;
--text-color: #7ec8e3;

/* Robot theme */
--theme-color: 0,229,255;
--theme-accent: #00e5ff;
--text-color: #00e5ff;

/* Atom theme */
--theme-color: 60,179,113;
--theme-accent: #3CB371;
--text-color: #3CB371;  /* Forest green */
```

### Animations

**Orb Animations:**
- `ome-bunny-float` - Gentle up/down float (3s loop)
- `ome-bunny-wiggle` - Rotate wiggle when dragging (0.3s loop)
- `ome-arrow-spin` - Drag indicators spin twice (0.6s)
- `ome-nucleus-spin` - Atom nucleus rotation (6s loop)
- `ome-orbit-pulse` - Atom rings pulse (2.5s loop, staggered)

**Control Animations:**
- `ome-ring-spin` - Menu button outer ring (1s loop)
- `ome-gear-boundary` - Gear red flash at scroll boundary (0.3s)
- `ome-arrow-spin-scroll` - Scroll arrows spin on gear hover (0.6s)
- `ome-arrow-converge` - Scan mode arrows converge (1.2s loop)

**Sidebar Animations:**
- `spin-plus` - New Chat + spins 720° (0.6s)
- `text-heartbeat` - Editing title pulses (1s loop)
- `pen-flash` - Pen icon flashes on new chat hover (0.6s)
- `pulse-red` - Delete confirm button pulses (continuous)
- `ome-settings-spin` - Settings orb rotates (24s, 6s on hover)
- `ome-settings-throb` - Input border throbs when focused (1.5s loop)

### Responsive Design

**Orb View:**
- Fixed min/max constraints on chat panel (363-968px wide)
- Auto-adjusts to viewport on resize
- Maintains 10px margins from all edges

**HUD View:**
- Main area max-width 900px (centered)
- Sidebar 280px fixed
- Prompt shrinks to min 240px
- Viewport < 614px → auto-close sidebar or hide prompt
- Messages area extends full height minus input area

### Z-Index Layers

```
Page content: (default)
Orb shadow host: 2147483646
HUD overlay: 2147483645
Sidebar: 100001
Settings panel: 100
Resize handles: 10
Scroll controls: 5
```

---

## Common Patterns

### 1. Theme-Colored Controls

All buttons/borders use theme color:
```javascript
style="color: ${theme.color}"
border: 1px solid rgba(var(--theme-color), 0.35)
```

### 2. Event Propagation Control

All control handlers stop propagation:
```javascript
button.addEventListener('click', (e) => {
  e.stopPropagation();
  // ... action
});
```

### 3. Focus Guard Pattern

Both orb and HUD use identical focus guard:
```javascript
function focusGuard(force = false) {
  if (userBlurRequested && !force) return;

  const requestFocus = () => {
    if (disqualified) return;
    input.focus({preventScroll: true});
    input.setSelectionRange(len, len);
  };

  const onPointerDown = (event) => {
    if (outsideClick) {
      userBlurRequested = true;
      stopGuard();
    }
  };

  const onFocusOut = () => {
    if (shouldRefocus) {
      requestAnimationFrame(requestFocus);
    }
  };

  input.addEventListener('focusout', onFocusOut);
  document.addEventListener('pointerdown', onPointerDown, true);

  cleanup = () => { /* remove listeners */ };
  requestFocus();
}
```

### 4. State Persistence Pattern

All state changes follow this pattern:
```javascript
function updateState(value) {
  // 1. Update local state
  hudState.property = value;

  // 2. Update UI
  element.classList.toggle('active', value);

  // 3. Persist to service worker
  chrome.runtime.sendMessage({
    type: 'set_orb_state',
    property: value
  });

  // 4. Service worker broadcasts to tabs
  // Other tabs receive sync_* message
}
```

---

## Integration Points

### Service Worker Messages

**Outgoing (HUD → SW):**
- `get_orb_state` - Retrieve persisted state
- `set_orb_state` - Save state key/value
- `execute_capability` - Trigger capability (ZoomIn, LoadChat, etc.)

**Incoming (SW → HUD):**
- `toggle_hud` - Show/hide HUD
- `set_orb_theme` - Set theme
- `apply_orb_theme` - Set theme (from popup)
- `sync_orb_position` - Position changed in another tab
- `sync_orb_theme` - Theme changed in another tab
- `sync_chat_visible` - Chat panel toggled in another tab
- `sync_panel_size` - Chat panel resized in another tab
- `sync_active_chat` - Active chat changed in another tab
- `hud_action` - Server-driven UI action

### Content Script Integration

**Custom Events:**
- `ome-focus-orb-input` - Fired by content.js after scan completes

**Global Functions:**
- `window.omeSendChat` - Manual chat sending (console testing)
- `window.omeLLMChat` - Manual LLM invocation (console testing)
- `window.hudTrace` - Performance tracing

### Capability Pipeline

HUD invokes capabilities via service worker:
- `ZoomIn` / `ZoomOut` / `ZoomReset` - Browser zoom control
- `GetChatList` - Fetch chat summaries
- `LoadChat` - Load chat messages
- `CreateChat` - Create new chat file
- `AppendMessage` - Add message to chat
- `LLMChat` - Send message to LLM
- `RenameChat` - Rename chat file
- `DeleteChat` - Delete chat file

---

## File Structure Summary

```
hud.js (7,023 lines)
├── Iframe Guard (lines 8-12)
├── State Objects (lines 14-34, 6663-6671)
├── Persistence Functions (lines 37-174)
├── Viewport Constraint Functions (lines 181-449)
├── Theme Registry (lines 452-663)
├── Style Injection (lines 669-2852)
├── Scroll Feedback (lines 2860-2900)
├── Theme Application (lines 2906-3256)
├── Orb Creation (lines 3263-3601)
├── HUD Creation (lines 3608-4743)
├── HUD Utilities (lines 4744-4876)
├── Position Management (lines 4877-5064)
├── HUD Initialization (lines 5067-5299)
├── View Toggling (lines 5302-5627)
├── Sidebar Chat Management (lines 5633-6258)
├── Visibility Checks (lines 6280-6320)
├── Message Handlers (lines 6323-6644)
├── Focus Event Listener (lines 6647-6657)
├── Chat Helpers (lines 6679-6975)
├── Trace & Auto-Init (lines 6998-7020)
```

---

## Testing & Debugging

### Console Functions

```javascript
// Send test message
window.omeSendChat("Hello!", chatId, {page_url, page_title});

// Send to LLM directly
window.omeLLMChat("What is 2+2?", false);

// Trace performance
window.hudTrace.log("Custom step");
```

### Debug Logging

All major actions log to console with prefixes:
- `[HUD]` - HUD-specific actions
- `[Content]` - General content script actions
- `⏱️ [HUD-TRACE]` - Performance timing

### Common Issues

1. **Focus stealing** - Check `userBlurRequested` flag, force focus with `focusGuard(true)`
2. **Theme not applying** - Verify theme key exists in `ORB_THEMES`
3. **Messages not rendering** - Check `chatState.messages` array
4. **Panel off-screen** - Call `constrainOrbToViewport()`
5. **Input not saving** - Check blur events firing, verify SW connection

---

This documentation reflects the complete HUD system architecture as of the analyzed codebase. The system is production-ready with robust state management, theme support, and dual-view interfaces for flexible LLM interaction.
