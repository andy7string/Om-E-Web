# Panel View Text Scanner - Complete Specification

## Overview

The Panel View feature adds a transparent "scanner window" below the HUD prompt unit. This window allows users to capture text from HUD messages by positioning the scanner over the desired text and clicking.

---

## Architecture

### Component Hierarchy

```
.ome-hud                              (Full screen overlay)
└── .ome-hud-main                     (Main content area)
    ├── .ome-hud-messages-area        (Scrollable message history)
    └── .ome-hud-input-area           (Floating prompt unit - position: absolute)
        └── .ome-hud-prompt-wrapper   (Unified border container)
            ├── .ome-hud-prompt       (Input area with textarea + button)
            └── .ome-hud-select-pane  (Transparent scanner window) ← NEW
```

---

## Dimensions & Sizing

### Prompt Wrapper (Container)

```css
.ome-hud-prompt-wrapper {
    width: 800px;
    border: 1px solid rgba(var(--theme-color), 0.35);
    border-radius: 12px;
    box-shadow: 0 0 6px rgba(var(--theme-color), 0.125),
                0 0 12px rgba(var(--theme-color), 0.075),
                0 2px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    filter: drop-shadow(0 0 2px rgba(var(--theme-color), 0.15));
    display: flex;
    flex-direction: column;
}
```

**Key dimensions:**
- Width: `800px` (matches prompt)
- Border: `1px` with theme color at 35% opacity
- Border radius: `12px`
- Contains both prompt and select pane in a column layout

### Prompt Section (Top)

```css
.ome-hud-prompt {
    min-height: 100px;
    max-height: 400px;
    background: rgba(33, 33, 33, 0.95);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
}
```

**Key dimensions:**
- Min height: `100px`
- Max height: `400px`
- Background: Dark grey at 95% opacity with blur

### Textarea (Inside Prompt)

```css
.ome-hud-prompt-textarea {
    width: calc(100% - 20px);
    margin: 0 10px;
    min-height: 40px;
    max-height: 300px;
    padding: 16px 6px 8px 6px;
    font-size: 15px;
    line-height: 1.5;
}
```

**Key dimensions:**
- Width: Full width minus 20px (10px margin each side)
- Min height: `40px`
- Padding: `16px` top, `8px` bottom, `6px` sides

### Button Actions Area (Inside Prompt)

```css
.ome-hud-prompt-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 16px;
    border-top: 1px solid rgba(var(--theme-color), 0.1);
}
```

**Key dimensions:**
- Padding: `8px` vertical, `16px` horizontal
- Gap: `8px` between items
- Border top: `1px` separator line at 10% opacity

### Send Button

```css
.ome-hud-send-btn {
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 8px;
}
```

**Key dimensions:**
- Size: `40px` x `40px`
- Border radius: `8px`

---

## Select Pane (Scanner Window) - NEW COMPONENT

### Purpose
A transparent extension below the prompt that acts as a "scanner window". Users position this window over HUD messages, then click to capture the visible text.

### CSS Definition

```css
.ome-hud-select-pane {
    height: 44px;
    background: transparent;
    border-top: 1px solid rgba(var(--theme-color), 0.1);
    position: relative;
}
```

**Key dimensions:**
- Height: `44px` (matches approximate height of textarea area for visual symmetry)
- Background: `transparent` (see-through to messages below)
- Border top: `1px` separator at 10% opacity (consistent with button area separator)
- Position: `relative` (for potential child positioning)

### Why 44px?
- The textarea area is approximately `40px` min-height + some padding
- `44px` provides visual balance between the "Ask anything..." area and the scanner area
- Not too tall (wastes space), not too short (hard to target text)

### Select Mode CSS

```css
/* When in select mode, input area passes clicks through */
.ome-hud.select-mode .ome-hud-input-area {
    pointer-events: none;
}

/* But orb remains clickable for exit */
.ome-hud.select-mode .ome-hud-orb {
    pointer-events: auto;
}
```

---

## HTML Structure

### Updated Prompt Wrapper

```html
<div class="ome-hud-input-area">
    <div class="ome-hud-prompt-wrapper">
        <!-- Existing prompt -->
        <div class="ome-hud-prompt">
            <textarea class="ome-hud-prompt-textarea" placeholder="Ask anything..." rows="1"></textarea>
            <div class="ome-hud-prompt-actions">
                <button class="ome-hud-send-btn">
                    <svg>...</svg>
                </button>
            </div>
        </div>

        <!-- NEW: Select Pane (Scanner Window) -->
        <div class="ome-hud-select-pane"></div>
    </div>

    <!-- Orb container (unchanged) -->
    <div class="ome-hud-orb-container">...</div>
</div>
```

---

## JavaScript Implementation

### State Variables

```javascript
// Add with other HUD variables
const selectPane = hud.querySelector('.ome-hud-select-pane');
let selectModeActive = false;
let lastMouseY = null;
```

### Enter Select Mode

```javascript
function enterSelectMode() {
    if (selectModeActive) return;

    selectModeActive = true;
    lastMouseY = null;
    hud.classList.add('select-mode');

    // Add event listeners
    document.addEventListener('mousemove', handleSelectMouseMove);
    document.addEventListener('mousedown', handleSelectMouseDown);
    document.addEventListener('contextmenu', handleSelectCancel);
    document.addEventListener('keydown', handleSelectKeydown);

    console.log('[Content] Entered select mode');
}
```

### Exit Select Mode

```javascript
function exitSelectMode() {
    if (!selectModeActive) return;

    selectModeActive = false;
    lastMouseY = null;
    hud.classList.remove('select-mode');

    // Remove event listeners
    document.removeEventListener('mousemove', handleSelectMouseMove);
    document.removeEventListener('mousedown', handleSelectMouseDown);
    document.removeEventListener('contextmenu', handleSelectCancel);
    document.removeEventListener('keydown', handleSelectKeydown);

    console.log('[Content] Exited select mode');
}
```

### Orb Click Handler

```javascript
// Single click orb to toggle select mode
hudOrb.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectModeActive) {
        exitSelectMode();
    } else {
        enterSelectMode();
    }
});

// Double click orb to exit HUD (existing behaviour)
hudOrb.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    toggleHUD();
});
```

### Mouse Move Handler (Slides Prompt Unit)

```javascript
function handleSelectMouseMove(e) {
    if (!selectModeActive || !inputArea) return;

    // Vertical mouse movement slides the prompt unit
    if (lastMouseY !== null) {
        const deltaY = lastMouseY - e.clientY;
        const currentBottom = parseInt(inputArea.style.bottom) || 400;
        const newBottom = Math.max(20, Math.min(window.innerHeight - 150, currentBottom + deltaY));
        inputArea.style.bottom = newBottom + 'px';
    }
    lastMouseY = e.clientY;
}
```

**Constraints:**
- Minimum bottom: `20px` (don't go off screen)
- Maximum bottom: `window.innerHeight - 150` (don't go off top)

### Get Text In View Pane (Core Scanner Logic)

```javascript
function getTextInViewPane() {
    const paneRect = selectPane?.getBoundingClientRect();
    if (!paneRect) return '';

    // Find messages area
    const messagesArea = hud.querySelector('.ome-hud-messages-area');
    if (!messagesArea) return '';

    let visibleText = [];

    // Walk through all text nodes in messages
    const walker = document.createTreeWalker(
        messagesArea,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        // Get bounding rectangles for this text node
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();

        for (const rect of rects) {
            // Check if text rectangle overlaps with view pane rectangle
            const overlapsVertically = rect.top < paneRect.bottom && rect.bottom > paneRect.top;
            const overlapsHorizontally = rect.left < paneRect.right && rect.right > paneRect.left;

            if (overlapsVertically && overlapsHorizontally) {
                const text = node.textContent.trim();
                if (text && !visibleText.includes(text)) {
                    visibleText.push(text);
                }
                break; // Found overlap, move to next node
            }
        }
    }

    return visibleText.join(' ');
}
```

**How it works:**
1. Get the view pane's screen coordinates (`getBoundingClientRect`)
2. Walk through every text node in the messages area
3. For each text node, get its screen coordinates
4. Check if the text overlaps with the view pane
5. Collect all overlapping text
6. Return as space-separated string

### Mouse Down Handler (Capture Text)

```javascript
function handleSelectMouseDown(e) {
    if (!selectModeActive) return;

    // Allow orb click to exit
    if (e.target.closest('.ome-hud-orb')) return;

    // Get text visible in the view pane
    const visibleText = getTextInViewPane();

    if (visibleText && promptTextarea) {
        // Add space if textarea already has content
        const prefix = promptTextarea.value.length > 0 ? ' ' : '';
        promptTextarea.value += prefix + visibleText;
        promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[Content] Captured:', visibleText.substring(0, 50) + '...');
    } else {
        console.log('[Content] No text visible in view pane');
    }

    exitSelectMode();
}
```

### Cancel Handlers

```javascript
// Right-click cancels
function handleSelectCancel(e) {
    if (!selectModeActive) return;
    e.preventDefault();
    exitSelectMode();
}

// Escape key cancels
function handleSelectKeydown(e) {
    if (!selectModeActive) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        exitSelectMode();
    }
}
```

---

## User Flow

```
1. User is in HUD view with messages displayed

2. User CLICKS ORB (single click)
   → Enters select mode
   → .ome-hud gets class 'select-mode'
   → Input area becomes pointer-events: none (clicks pass through)
   → Event listeners attached

3. User MOVES MOUSE UP/DOWN
   → Prompt unit slides vertically
   → View pane moves over different message text
   → User positions view pane over desired text

4. User CLICKS ANYWHERE
   → getTextInViewPane() scans for visible text
   → Text overlapping view pane is collected
   → Text added to prompt textarea
   → Exits select mode

5. Alternative: User CLICKS ORB or presses ESCAPE
   → Exits select mode without capturing
```

---

## Visual Layout

```
┌─────────────────────────────────────────────────────┐
│                    HUD MESSAGES                      │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ Message 1: Lorem ipsum dolor sit amet...     │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ Message 2: **ZoomReset** - Reset zoom...     │ ←──┼── This text visible in pane
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ╔═══════════════════════════════════════════════╗  │
│  ║  Ask anything...                              ║  │
│  ║                                          [▶]  ║  │
│  ╠───────────────────────────────────────────────╣  │
│  ║  [TRANSPARENT VIEW PANE - 44px height]        ║ ←── Scanner window
│  ╚═══════════════════════════════════════════════╝  │
│                                              (◉)    │ ← Orb
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Summary

| Component | Dimension | Purpose |
|-----------|-----------|---------|
| Prompt wrapper | 800px wide | Contains prompt + pane with unified border |
| Prompt section | min 100px, max 400px | Input area with textarea and button |
| Textarea | 40px min height | User input |
| Button area | ~56px (40px btn + 16px padding) | Send button |
| **Select pane** | **44px height** | **Transparent scanner window** |
| Border radius | 12px | Rounded corners on wrapper |
| Separator lines | 1px at 10% opacity | Visual separation |

---

## Files Modified

1. **content.js** - CSS styles (inside template literal)
2. **content.js** - HTML structure (inside `createHUD()`)
3. **content.js** - JavaScript handlers (inside `createHUD()`)

No other files need modification. All changes are contained in `content.js`.
