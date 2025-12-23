// ============================================================================
// 🎛️ OM-E HUD SYSTEM - Separated for maintainability
// Floating orb and overlay interface
// ============================================================================

(() => {

    // 🖼️ IFRAME GUARD - Only run HUD in main frame, not iframes
    if (window.top !== window.self) {
        console.log("[HUD] 🖼️ Skipping HUD injection in iframe:", window.location.href);
        return;
    }

    /** @type {{ host: HTMLElement|null, shadow: ShadowRoot|null, orb: HTMLElement|null, hud: HTMLElement|null, chatPanel: HTMLElement|null, sidebar: HTMLElement|null, visible: boolean, chatVisible: boolean, sidebarOpen: boolean, dragging: boolean, theme: string, panelManuallyResized: boolean, panelTargetWidth: number|null, focusGuardCleanup: (() => void)|null, hudFocusGuardCleanup: (() => void)|null, userBlurRequested: boolean, hudTextZoom: number }} */
    const hudState = {
        host: null,
        shadow: null,
        orb: null,
        hud: null,
        chatPanel: null,      // 💬 Chat panel element
        sidebar: null,        // 📚 Sidebar element
        visible: false,
        chatVisible: true,    // 💬 Chat panel visibility (open by default)
        sidebarOpen: false,   // 📚 Sidebar open state
        sidebarForcedNarrow: false,  // 📚 User chose to open sidebar in narrow viewport
        dragging: false,
        theme: 'robot',       // Current orb theme (default)
        panelManuallyResized: false,  // 📐 Track if user has resized panel
        panelTargetWidth: null,        // 📐 Target width to restore on resize (user-set or optimal)
        focusGuardCleanup: null,       // 🎯 Active orb focus guard disposer
        hudFocusGuardCleanup: null,    // 🎯 Active HUD focus guard disposer
        userBlurRequested: false,      // 🎯 Tracks if user intentionally blurred input
        hudTextZoom: 1,                // 🔍 HUD messages text zoom level (1 = 100%)
        visibleChats: []               // 📚 Currently visible chats in sidebar (for LLM context)
    };

    // 💬 Save chat input immediately (persists across navigation)
    function saveChatInput(value) {
        try {
            chrome.runtime.sendMessage({ type: 'set_orb_state', chatInput: value });
        } catch (e) {
            console.warn('[Content] Could not save chat input:', e);
        }
    }

    // 📐 Save chat panel size (persists across sessions)
    function saveChatPanelSize(width, height) {
        hudState.panelManuallyResized = true;  // 📐 User resized - skip auto-expand
        hudState.panelTargetWidth = width;     // 📐 Track user's preferred width
        try {
            chrome.runtime.sendMessage({
                type: 'set_orb_state',
                chatPanelSize: { width, height }
            });
        } catch (e) {
            console.warn('[Content] Could not save chat panel size:', e);
        }
    }

    /**
     * 📐 Setup resize handlers for chat panel
     * Enables drag-to-resize on all edges and corners
     * @param {HTMLElement} chatPanel - The chat panel element
     */
    function setupChatPanelResize(chatPanel) {
        if (!chatPanel) return;

        let isResizing = false;
        let resizeDir = null;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        // Get all resize handles
        const handles = chatPanel.querySelectorAll('.ome-resize-handle');

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();

                isResizing = true;
                resizeDir = handle.dataset.resize;
                startX = e.clientX;
                startY = e.clientY;

                const rect = chatPanel.getBoundingClientRect();
                startWidth = rect.width;
                startHeight = rect.height;

                chatPanel.classList.add('resizing');

                // Use document listeners so resize works even if mouse leaves panel
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });

        function onMouseMove(e) {
            if (!isResizing) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;

            // Handle width changes
            if (resizeDir.includes('e')) {
                // East: decrease width as mouse moves right (panel anchored on right)
                newWidth = Math.max(200, Math.min(800, startWidth - dx));
            }
            if (resizeDir.includes('w')) {
                // West (left edge): drag left = wider, drag right = narrower
                newWidth = Math.max(200, Math.min(800, startWidth - dx));
            }

            // Handle height changes
            if (resizeDir.includes('n')) {
                // North: increase height as mouse moves up
                newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight - dy));
            }
            if (resizeDir.includes('s')) {
                // South: decrease height as mouse moves down (panel anchored at bottom)
                newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + dy));
            }

            chatPanel.style.width = `${newWidth}px`;
            chatPanel.style.height = `${newHeight}px`;
        }

        function onMouseUp() {
            if (!isResizing) return;

            isResizing = false;
            resizeDir = null;
            chatPanel.classList.remove('resizing');

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // 💾 Save dimensions for persistence
            const rect = chatPanel.getBoundingClientRect();
            saveChatPanelSize(rect.width, rect.height);
        }

        // 💾 Restore saved dimensions
        restoreChatPanelSize(chatPanel);
    }

    /**
     * 📐 Restore chat panel size from saved state
     * Note: Optimal width calculation is now done in initHUD after position is restored
     * @param {HTMLElement} chatPanel - The chat panel element
     */
    function restoreChatPanelSize(chatPanel) {
        try {
            chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                if (response?.ok && response.chatPanelSize) {
                    const { width, height } = response.chatPanelSize;
                    if (width && height) {
                        chatPanel.style.width = `${width}px`;
                        chatPanel.style.height = `${height}px`;
                        hudState.panelManuallyResized = true;  // 📐 Has saved size - skip auto-expand
                        hudState.panelTargetWidth = width;     // 📐 Track user's preferred width
                        console.log('[Content] 📐 Restored chat panel size:', width, 'x', height);
                    }
                }
                // Note: If no saved size, optimal width is calculated in initHUD after orb position is set
            });
        } catch (e) {
            console.warn('[Content] Could not restore chat panel size:', e);
        }
    }

    /**
     * 📐 Calculate and set optimal panel width based on available viewport space
     * Panel extends as far left as possible while respecting min/max constraints
     * @param {HTMLElement} chatPanel - The chat panel element
     */
    function calculateOptimalPanelWidth(chatPanel) {
        if (!chatPanel || !hudState.orb) return;

        const margin = 10;          // 10px from left edge
        const panelGap = 85;        // Panel is 85px left of orb right edge
        const minWidth = 363;       // CSS min-width
        const maxWidth = 968;       // CSS max-width

        // Get orb position - panel is positioned right:85px from orb, so use orb's RIGHT edge
        const orbRect = hudState.orb.getBoundingClientRect();
        // Available width = orb right edge - gap - margin from left
        // Panel right edge is at (orbRect.right - panelGap), panel extends leftward
        const availableWidth = orbRect.right - panelGap - margin;

        // Calculate optimal width: as big as possible within constraints
        const optimalWidth = Math.max(minWidth, Math.min(maxWidth, availableWidth));

        chatPanel.style.width = `${optimalWidth}px`;
        console.log('[Content] 📐 Calculated optimal panel width:', optimalWidth, 'px (available:', availableWidth, 'px)');
    }

    /**
     * 📐 Smart orb positioning - keeps orb and all controls within viewport
     * Handles both open and closed chat panel states:
     * - Panel open: shrink panel first, then move orb
     * - Panel closed: just move orb to stay within bounds
     * Maintains 10px margin from all viewport edges
     */
    function constrainOrbToViewport() {
        const orb = hudState.orb;
        const chatPanel = hudState.chatPanel;
        if (!orb) return;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 10; // 10px from all edges

        // Fixed minimum right position in pixels (same pattern as HUD view)
        // Controls at right: -54px from orb, plus 10px gap + 8px for button outer ring = 72px
        const minRightPx = 72;

        // Orb dimensions
        const orbRect = orb.getBoundingClientRect();
        const zoomControlsBelow = 50;   // Zoom controls extend ~50px below orb
        const promptButtonBelow = 25;   // Prompt button extends ~25px below orb

        // Calculate orb's total footprint
        const footprintBottom = orbRect.bottom + Math.max(zoomControlsBelow, promptButtonBelow);
        const footprintLeft = orbRect.left;
        const footprintTop = orbRect.top;

        // Current position as percentages (calculate from actual position, not style)
        let rightPx = viewportWidth - orbRect.right;  // Current right position in pixels
        const originalRightPx = rightPx;  // Track original to detect actual horizontal changes
        let rightPct = (rightPx / viewportWidth) * 100;
        let bottomPct = ((viewportHeight - orbRect.bottom) / viewportHeight) * 100;
        const originalBottomPct = bottomPct;  // Track original to detect actual vertical changes

        // ============================================================
        // CHAT PANEL OPEN: Handle panel + orb together
        // ============================================================
        if (hudState.chatVisible && chatPanel) {
            const panelRect = chatPanel.getBoundingClientRect();
            const panelRightOffset = 85;  // Panel is 85px left of orb
            const minPanelWidth = 220;
            const minPanelHeight = 150;   // Minimum panel height before it can't shrink more
            let currentPanelWidth = panelRect.width || 750;
            let currentPanelHeight = panelRect.height || 400;

            // Calculate theoretical panel position (not clipped by viewport)
            // Panel right edge is positioned relative to orb's left edge
            const panelTheoreticalRight = orbRect.left - panelRightOffset;
            const panelTheoreticalLeft = panelTheoreticalRight - currentPanelWidth;

            // Check LEFT edge overflow using theoretical position
            if (panelTheoreticalLeft < margin) {
                const leftOverflow = margin - panelTheoreticalLeft;

                // Strategy 1: Shrink panel first (preferred)
                if (currentPanelWidth - leftOverflow >= minPanelWidth) {
                    currentPanelWidth -= leftOverflow;
                    chatPanel.style.width = `${currentPanelWidth}px`;
                    console.log('[Content] 📐 Shrunk panel width to:', currentPanelWidth);
                } else {
                    // Strategy 2: Shrink to min, then move orb right
                    const shrinkAmount = currentPanelWidth - minPanelWidth;
                    if (shrinkAmount > 0) {
                        currentPanelWidth = minPanelWidth;
                        chatPanel.style.width = `${minPanelWidth}px`;
                    }
                    const remainingOverflow = leftOverflow - Math.max(0, shrinkAmount);
                    if (remainingOverflow > 0) {
                        // Move orb right - decrease rightPx to shift orb toward right edge
                        rightPx = Math.max(minRightPx, rightPx - remainingOverflow);
                        rightPct = (rightPx / viewportWidth) * 100;
                        console.log('[Content] 📐 Moved orb right to:', rightPx + 'px');
                    }
                }
            }

            // Check RIGHT edge - ensure orb is at least minRightPx from right edge
            if (rightPx < minRightPx) {
                rightPx = minRightPx;
                rightPct = (rightPx / viewportWidth) * 100;
                console.log('[Content] 📐 Enforced min right distance:', minRightPx + 'px');
            }

            // Check TOP edge - ensure panel top stays within viewport
            // Strategy: First move orb down, then shrink panel height if orb can't move more
            const panelTop = panelRect.top;
            if (panelTop < margin) {
                const topOverflow = margin - panelTop;

                // Calculate how much room orb has to move down (before hitting bottom constraint)
                const currentBottomPx = (bottomPct / 100) * viewportHeight;
                const roomToMoveDown = Math.max(0, currentBottomPx - (margin + 10)); // Keep some margin from bottom

                // Strategy 1: Move orb down first (preferred)
                if (roomToMoveDown >= topOverflow) {
                    // Enough room - just move orb down
                    bottomPct = ((currentBottomPx - topOverflow) / viewportHeight) * 100;
                    console.log('[Content] 📐 Moved orb down for panel top:', topOverflow + 'px');
                } else {
                    // Strategy 2: Move orb down as much as possible, then shrink panel height
                    if (roomToMoveDown > 0) {
                        bottomPct = ((currentBottomPx - roomToMoveDown) / viewportHeight) * 100;
                        console.log('[Content] 📐 Moved orb down max:', roomToMoveDown + 'px');
                    }
                    const remainingOverflow = topOverflow - roomToMoveDown;
                    if (remainingOverflow > 0 && currentPanelHeight - remainingOverflow >= minPanelHeight) {
                        // Shrink panel height
                        currentPanelHeight -= remainingOverflow;
                        chatPanel.style.height = `${currentPanelHeight}px`;
                        console.log('[Content] 📐 Shrunk panel height to:', currentPanelHeight);
                    } else if (remainingOverflow > 0) {
                        // Shrink to minimum height
                        chatPanel.style.height = `${minPanelHeight}px`;
                        console.log('[Content] 📐 Panel at min height:', minPanelHeight);
                    }
                }
            }

            // Update max-width constraint for manual resize
            const orbRightAfter = viewportWidth - orb.getBoundingClientRect().right;
            const maxAvailableWidth = viewportWidth - orbRightAfter - panelRightOffset - margin;
            chatPanel.style.maxWidth = `${Math.max(minPanelWidth, maxAvailableWidth)}px`;
        }
        // ============================================================
        // CHAT PANEL CLOSED: Just keep orb within bounds
        // ============================================================
        else {
            // Check RIGHT edge - ensure orb is at least minRightPx from right edge (same as HUD view pattern)
            if (rightPx < minRightPx) {
                rightPx = minRightPx;
                rightPct = (rightPx / viewportWidth) * 100;
            }

            // Check LEFT edge (orb body)
            if (footprintLeft < margin) {
                const leftOverflow = margin - footprintLeft;
                rightPx = rightPx - leftOverflow;
                rightPct = (rightPx / viewportWidth) * 100;
            }
        }

        // ============================================================
        // VERTICAL BOUNDS (same for both states)
        // ============================================================
        // Check BOTTOM edge (zoom controls / prompt button)
        if (footprintBottom > viewportHeight - margin) {
            const bottomOverflow = footprintBottom - (viewportHeight - margin);
            const bottomPx = (bottomPct / 100) * viewportHeight;
            bottomPct = ((bottomPx + bottomOverflow) / viewportHeight) * 100;
        }

        // Check TOP edge (orb body)
        if (footprintTop < margin) {
            const topOverflow = margin - footprintTop;
            const bottomPx = (bottomPct / 100) * viewportHeight;
            bottomPct = ((bottomPx - topOverflow) / viewportHeight) * 100;
        }

        // Determine what actually changed (separate horizontal from vertical)
        const horizontalChanged = Math.abs(rightPx - originalRightPx) > 1;
        const verticalChanged = Math.abs(bottomPct - originalBottomPct) > 0.1;

        // Apply position changes only if something actually changed
        if (horizontalChanged || verticalChanged) {
            // Clamp values to sane bounds
            const minRightPct = (minRightPx / viewportWidth) * 100;
            rightPct = Math.max(minRightPct, Math.min(95, rightPct));
            bottomPct = Math.max(1, Math.min(90, bottomPct));

            orb.style.left = 'auto';
            orb.style.top = 'auto';

            // Only update the axis that actually changed (prevents drift)
            if (horizontalChanged) {
                orb.style.right = `${rightPct}%`;
            }
            if (verticalChanged) {
                orb.style.bottom = `${bottomPct}%`;
            }

            console.log('[Content] 📐 Adjusted orb position:', {
                right: horizontalChanged ? rightPct.toFixed(1) + '%' : '(unchanged)',
                bottom: verticalChanged ? bottomPct.toFixed(1) + '%' : '(unchanged)'
            });

            // Only save if position actually changed
            if (horizontalChanged || verticalChanged) {
                saveOrbPosition(rightPct, bottomPct);
            }
        }
    }

    // Alias for backwards compatibility
    const constrainChatPanelToViewport = constrainOrbToViewport;

    /**
     * 📐 Try to restore panel width toward target after constraints shrink it
     * Called after window resize to expand panel back if space is available
     */
    function tryRestorePanelWidth() {
        const chatPanel = hudState.chatPanel;
        if (!chatPanel || !hudState.orb || !hudState.chatVisible) return;

        const margin = 10;
        const panelGap = 85;
        const minWidth = 363;
        const maxWidth = 968;

        // Get current and available dimensions - use orb's RIGHT edge (panel is positioned right:85px)
        const orbRect = hudState.orb.getBoundingClientRect();
        const currentWidth = chatPanel.getBoundingClientRect().width;
        const availableWidth = orbRect.right - panelGap - margin;

        // Determine target: user-set width, or optimal (max available within constraints)
        let targetWidth;
        if (hudState.panelManuallyResized && hudState.panelTargetWidth) {
            // User has set a preferred width - try to restore to that
            targetWidth = hudState.panelTargetWidth;
        } else {
            // No user preference - target is optimal (as big as possible)
            targetWidth = Math.min(maxWidth, availableWidth);
        }

        // Clamp target to valid range
        targetWidth = Math.max(minWidth, Math.min(maxWidth, targetWidth));

        // Only expand if current is smaller than target AND space allows
        const expandableTo = Math.min(targetWidth, availableWidth);
        if (currentWidth < expandableTo) {
            chatPanel.style.width = `${expandableTo}px`;
            console.log('[Content] 📐 Restored panel width to:', expandableTo, 'px (target:', targetWidth, 'px)');
        }
    }

    // 📐 Window resize listener for orb chat panel viewport constraints
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
        // Immediate: try to restore panel width (smooth, like HUD view)
        tryRestorePanelWidth();
        // Debounced: constraint checks (heavier operation)
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            constrainChatPanelToViewport();
        }, 100);
    });

    // ============================================================================
    // 🎨 ORB THEMES REGISTRY - Different visual styles for the floating orb
    // ============================================================================

    /**
     * @typedef {Object} OrbTheme
     * @property {string} name - Display name
     * @property {string} svg - SVG markup for the orb
     * @property {string} paws - SVG markup for paws (shown when holding)
     * @property {string} earSelector - CSS selector for clickable ears
     */

    /** @type {Object<string, OrbTheme>} */
    const ORB_THEMES = {
        // 🐱 Kawaii - fluffy white kitty with cherry, big sparkly blue eyes
        kawaii: {
            name: 'Kawaii',
            earSelector: '.ome-ear',
            color: '#7ec8e3',  // Sparkly blue (matching eyes)
            svg: `
                <svg class="ome-bunny" viewBox="0 0 60 72" fill="none">
                    <defs>
                        <!-- Fluffy white body gradient -->
                        <radialGradient id="kawaiiFluffyGrad" cx="50%" cy="40%" r="60%">
                            <stop offset="0%" stop-color="rgba(255,255,255,0.95)"/>
                            <stop offset="70%" stop-color="rgba(248,244,255,0.9)"/>
                            <stop offset="100%" stop-color="rgba(232,224,240,0.85)"/>
                        </radialGradient>
                        <!-- Pink inner ear -->
                        <linearGradient id="kawaiiPinkEarGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                            <stop offset="0%" stop-color="rgba(255,182,193,0.8)"/>
                            <stop offset="100%" stop-color="rgba(255,145,164,0.7)"/>
                        </linearGradient>
                        <!-- Sparkly blue eye gradient -->
                        <radialGradient id="kawaiiEyeBlueGrad" cx="50%" cy="30%" r="50%">
                            <stop offset="0%" stop-color="#7ec8e3"/>
                            <stop offset="50%" stop-color="#4a9eca"/>
                            <stop offset="100%" stop-color="#2d7eb0"/>
                        </radialGradient>
                        <!-- Cherry gradient -->
                        <radialGradient id="kawaiiCherryGrad" cx="30%" cy="30%" r="60%">
                            <stop offset="0%" stop-color="#ff8a9b"/>
                            <stop offset="100%" stop-color="#e05670"/>
                        </radialGradient>
                    </defs>
                    <!-- Left ear (pointed, cat-style) - clickable -->
                    <path class="ome-ear" d="M12 28 L8 8 L22 22 Z" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.8)" stroke-width="1.5" style="cursor:pointer"/>
                    <path d="M13 24 L11 12 L19 21 Z" fill="url(#kawaiiPinkEarGrad)" style="pointer-events:none"/>
                    <!-- Right ear - clickable -->
                    <path class="ome-ear" d="M48 28 L52 8 L38 22 Z" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.8)" stroke-width="1.5" style="cursor:pointer"/>
                    <path d="M47 24 L49 12 L41 21 Z" fill="url(#kawaiiPinkEarGrad)" style="pointer-events:none"/>
                    <!-- Strawberry on top - clickable to open HUD -->
                    <g class="ome-ear" style="cursor:pointer">
                        <path d="M30 2 Q28 -2 26 0 M30 2 Q32 -2 34 0 M30 2 Q30 -3 30 -1" stroke="#50a060" stroke-width="1.5" fill="none"/>
                        <ellipse cx="30" cy="10" rx="9" ry="8" fill="url(#kawaiiCherryGrad)"/>
                        <ellipse cx="27" cy="7" rx="2.5" ry="1.5" fill="rgba(255,255,255,0.5)"/>
                        <!-- Strawberry seeds -->
                        <ellipse cx="26" cy="12" rx="1" ry="0.7" fill="rgba(255,220,180,0.7)"/>
                        <ellipse cx="34" cy="11" rx="1" ry="0.7" fill="rgba(255,220,180,0.7)"/>
                        <ellipse cx="30" cy="14" rx="1" ry="0.7" fill="rgba(255,220,180,0.7)"/>
                    </g>
                    <!-- Fluffy head -->
                    <ellipse cx="30" cy="38" rx="24" ry="22" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.7)" stroke-width="1.5"/>
                    <!-- Fluffy cheek tufts -->
                    <ellipse cx="8" cy="40" rx="6" ry="8" fill="url(#kawaiiFluffyGrad)"/>
                    <ellipse cx="52" cy="40" rx="6" ry="8" fill="url(#kawaiiFluffyGrad)"/>
                    <!-- Big sparkly eyes -->
                    <ellipse cx="20" cy="38" rx="7" ry="8" fill="url(#kawaiiEyeBlueGrad)" stroke="rgba(45,96,144,0.5)" stroke-width="0.5"/>
                    <ellipse cx="40" cy="38" rx="7" ry="8" fill="url(#kawaiiEyeBlueGrad)" stroke="rgba(45,96,144,0.5)" stroke-width="0.5"/>
                    <!-- Eye highlights (sparkles) -->
                    <circle cx="17" cy="35" r="2.5" fill="rgba(255,255,255,0.95)"/>
                    <circle cx="22" cy="33" r="1.2" fill="rgba(255,255,255,0.9)"/>
                    <circle cx="37" cy="35" r="2.5" fill="rgba(255,255,255,0.95)"/>
                    <circle cx="42" cy="33" r="1.2" fill="rgba(255,255,255,0.9)"/>
                    <!-- Pupils -->
                    <ellipse cx="21" cy="40" rx="2" ry="2.5" fill="rgba(26,48,80,0.9)"/>
                    <ellipse cx="41" cy="40" rx="2" ry="2.5" fill="rgba(26,48,80,0.9)"/>
                    <!-- Rosy blush -->
                    <ellipse cx="10" cy="44" rx="4" ry="2.5" fill="rgba(255,150,170,0.5)"/>
                    <ellipse cx="50" cy="44" rx="4" ry="2.5" fill="rgba(255,150,170,0.5)"/>
                    <!-- Cute nose -->
                    <ellipse cx="30" cy="46" rx="2.5" ry="2" fill="rgba(255,176,192,0.8)"/>
                    <!-- Tiny smile -->
                    <path d="M26 50 Q30 54 34 50" stroke="rgba(192,144,160,0.7)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                    <!-- Little body hint -->
                    <ellipse cx="30" cy="64" rx="14" ry="8" fill="url(#kawaiiFluffyGrad)" stroke="rgba(208,192,224,0.6)" stroke-width="1"/>
                </svg>`,
            paws: `
                <svg class="ome-bunny-paws" width="36" height="14" viewBox="0 0 36 14" fill="none">
                    <ellipse cx="8" cy="8" rx="6" ry="4" fill="rgba(255,255,255,0.4)" stroke="rgba(208,192,224,0.5)" stroke-width="1"/>
                    <ellipse cx="28" cy="8" rx="6" ry="4" fill="rgba(255,255,255,0.4)" stroke="rgba(208,192,224,0.5)" stroke-width="1"/>
                </svg>`
        },

        // 🤖 Om-E - cute bot with goggles and glowing eyes
        robot: {
            name: 'Om-E',
            earSelector: '.ome-goggle',
            color: '#00e5ff',  // Cyan from eyes
            svg: `
                <svg class="ome-bunny" viewBox="0 14 60 72" fill="none">
                    <defs>
                        <!-- Body gradient: purple top to blue bottom -->
                        <linearGradient id="robotBodyGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                            <stop offset="0%" stop-color="rgba(147,112,219,0.5)"/>
                            <stop offset="50%" stop-color="rgba(80,100,200,0.4)"/>
                            <stop offset="100%" stop-color="rgba(66,133,244,0.35)"/>
                        </linearGradient>
                        <!-- Goggle gradient -->
                        <linearGradient id="goggleGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                            <stop offset="0%" stop-color="rgba(186,147,255,0.6)"/>
                            <stop offset="100%" stop-color="rgba(147,112,219,0.5)"/>
                        </linearGradient>
                        <!-- Glowing eye gradient -->
                        <radialGradient id="glowEyeGrad" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#00ffff"/>
                            <stop offset="100%" stop-color="#00e5ff"/>
                        </radialGradient>
                    </defs>
                    <!-- Ear muffs (sides) - positioned at bottom of dome -->
                    <ellipse cx="6" cy="54" rx="5" ry="7" fill="rgba(66,133,244,0.35)" stroke="rgba(66,133,244,0.6)" stroke-width="1.5"/>
                    <ellipse cx="54" cy="54" rx="5" ry="7" fill="rgba(66,133,244,0.35)" stroke="rgba(66,133,244,0.6)" stroke-width="1.5"/>
                    <!-- Wide dome/helmet head shape -->
                    <path d="M8 58 Q8 32 30 28 Q52 32 52 58 Q52 64 30 66 Q8 64 8 58 Z" fill="url(#robotBodyGrad)" stroke="rgba(66,133,244,0.6)" stroke-width="1.5"/>
                    <!-- Goggles on top (clickable) -->
                    <ellipse class="ome-goggle" cx="20" cy="34" rx="9" ry="7" fill="url(#goggleGrad)" stroke="rgba(147,112,219,0.8)" stroke-width="1.5" style="cursor:pointer"/>
                    <ellipse class="ome-goggle" cx="40" cy="34" rx="9" ry="7" fill="url(#goggleGrad)" stroke="rgba(147,112,219,0.8)" stroke-width="1.5" style="cursor:pointer"/>
                    <!-- Goggle lenses (dark) -->
                    <ellipse cx="20" cy="34" rx="6" ry="5" fill="rgba(40,40,80,0.7)" style="pointer-events:none"/>
                    <ellipse cx="40" cy="34" rx="6" ry="5" fill="rgba(40,40,80,0.7)" style="pointer-events:none"/>
                    <!-- Goggle bridge -->
                    <rect x="28" y="32" width="4" height="4" rx="1" fill="rgba(147,112,219,0.6)" style="pointer-events:none"/>
                    <!-- Face plate area (rounded rect) -->
                    <rect x="14" y="46" rx="6" ry="6" width="32" height="16" fill="rgba(30,50,90,0.5)" stroke="rgba(66,133,244,0.5)" stroke-width="1"/>
                    <!-- Glowing cyan eyes -->
                    <ellipse cx="23" cy="54" rx="3" ry="5" fill="url(#glowEyeGrad)"/>
                    <ellipse cx="37" cy="54" rx="3" ry="5" fill="url(#glowEyeGrad)"/>
                    <!-- Eye glow effect -->
                    <ellipse cx="23" cy="54" rx="4" ry="6" fill="none" stroke="rgba(0,229,255,0.3)" stroke-width="2"/>
                    <ellipse cx="37" cy="54" rx="4" ry="6" fill="none" stroke="rgba(0,229,255,0.3)" stroke-width="2"/>
                </svg>`,
            paws: `
                <svg class="ome-bunny-paws" width="36" height="14" viewBox="0 0 36 14" fill="none">
                    <ellipse cx="8" cy="8" rx="6" ry="4" fill="rgba(66,133,244,0.2)" stroke="rgba(66,133,244,0.5)" stroke-width="1"/>
                    <ellipse cx="28" cy="8" rx="6" ry="4" fill="rgba(66,133,244,0.2)" stroke="rgba(66,133,244,0.5)" stroke-width="1"/>
                </svg>`
        },

        // ⚛️ Atom - glowing orbital rings with neon green
        atom: {
            name: 'Atom',
            earSelector: '.ome-atom-click',
            color: '#3CB371',  // Forest green (Z, HUD buttons)
            svg: `
                <svg class="ome-bunny ome-atom-svg" viewBox="0 0 60 60" fill="none">
                    <defs>
                        <!-- Nucleus gradient - dark purple like robot head -->
                        <radialGradient id="atomNucleusGrad" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="rgba(120,100,180,0.95)"/>
                            <stop offset="50%" stop-color="rgba(80,70,150,0.9)"/>
                            <stop offset="100%" stop-color="rgba(50,45,100,0.85)"/>
                        </radialGradient>
                        <!-- Nucleus outer glow - purple -->
                        <radialGradient id="atomNucleusGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="rgba(147,112,219,0.6)"/>
                            <stop offset="100%" stop-color="rgba(80,70,150,0)"/>
                        </radialGradient>
                        <!-- Orbital gradients - neon green rings -->
                        <linearGradient id="atomOrbitGrad1" x1="0%" y1="50%" x2="100%" y2="50%">
                            <stop offset="0%" stop-color="rgba(57,255,20,0.95)"/>
                            <stop offset="35%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="50%" stop-color="rgba(40,120,30,0.5)"/>
                            <stop offset="65%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="100%" stop-color="rgba(57,255,20,0.95)"/>
                        </linearGradient>
                        <linearGradient id="atomOrbitGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="rgba(57,255,20,0.95)"/>
                            <stop offset="35%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="50%" stop-color="rgba(40,120,30,0.5)"/>
                            <stop offset="65%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="100%" stop-color="rgba(57,255,20,0.95)"/>
                        </linearGradient>
                        <linearGradient id="atomOrbitGrad3" x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="rgba(57,255,20,0.95)"/>
                            <stop offset="35%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="50%" stop-color="rgba(40,120,30,0.5)"/>
                            <stop offset="65%" stop-color="rgba(80,220,60,0.7)"/>
                            <stop offset="100%" stop-color="rgba(57,255,20,0.95)"/>
                        </linearGradient>
                    </defs>
                    <!-- Clickable area - invisible circle -->
                    <circle class="ome-atom-click" cx="30" cy="30" r="28" fill="transparent" style="cursor:pointer"/>
                    <!-- Orbital ring 1 - horizontal -->
                    <ellipse class="ome-orbit ome-orbit-1" cx="30" cy="30" rx="26" ry="10" fill="none" stroke="url(#atomOrbitGrad1)" stroke-width="2"/>
                    <!-- Orbital ring 2 - tilted left -->
                    <ellipse class="ome-orbit ome-orbit-2" cx="30" cy="30" rx="26" ry="10" fill="none" stroke="url(#atomOrbitGrad2)" stroke-width="2" transform="rotate(-60 30 30)"/>
                    <!-- Orbital ring 3 - tilted right -->
                    <ellipse class="ome-orbit ome-orbit-3" cx="30" cy="30" rx="26" ry="10" fill="none" stroke="url(#atomOrbitGrad3)" stroke-width="2" transform="rotate(60 30 30)"/>
                    <!-- Nucleus outer glow -->
                    <circle cx="30" cy="30" r="12" fill="url(#atomNucleusGlow)"/>
                    <!-- Nucleus core - spinning -->
                    <g class="ome-nucleus">
                        <circle cx="30" cy="30" r="7" fill="url(#atomNucleusGrad)"/>
                        <circle cx="30" cy="30" r="8" fill="none" stroke="rgba(186,147,255,0.4)" stroke-width="1"/>
                        <!-- Inner swirl details for rotation effect -->
                        <circle cx="27" cy="28" r="1.5" fill="rgba(186,147,255,0.6)"/>
                        <circle cx="33" cy="32" r="1.2" fill="rgba(147,112,219,0.5)"/>
                        <circle cx="29" cy="33" r="1" fill="rgba(186,147,255,0.4)"/>
                    </g>
                </svg>`,
            paws: ``  // No paws for atom
        }
    };

    /**
     * 🎨 Inject HUD styles into Shadow DOM
     * @param {ShadowRoot} shadow
     */
    function injectHUDStyles(shadow) {
        const style = document.createElement('style');
        style.textContent = `
            /* 🎯 HUD Canvas - our coordinate system */
            :host {
                position: fixed !important;
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
                pointer-events: none !important;
                z-index: 2147483646 !important;
            }

            /* 🐰 OM-E Orb - positioned relative to our canvas */
            .ome-orb {
                position: absolute;
                left: calc(50% + 400px);
                bottom: 128px;
                width: 66px;
                height: 103px;
                background: transparent;
                cursor: pointer;
                pointer-events: auto;
                display: flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                touch-action: none;
                transition: transform 0.15s ease;
                --ome-zoom-scale: 1.21;
                transform: translateX(-50%) scale(var(--ome-zoom-scale, 1.21));
                transform-origin: bottom center;
            }
            .ome-orb:hover { transform: translateX(-50%) scale(calc(var(--ome-zoom-scale, 1.21) * 1.1)); }
            .ome-orb.holding { cursor: none; }
            .ome-orb.holding .ome-bunny-paws { opacity: 1; transform: translateX(-50%) translateY(0); }
            /* 🔮 Orb Wrapper (for 4 arrows) */
            .ome-orb-wrapper {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                -webkit-user-select: none;
            }
            /* ⬆️⬇️⬅️➡️ Drag indicators (4 arrows) */
            .ome-orb-drag-indicator {
                position: absolute;
                width: 18px;
                height: 18px;
                opacity: 0;
                pointer-events: none;
            }
            .ome-orb-drag-indicator svg {
                width: 18px;
                height: 18px;
                stroke: currentColor;
                stroke-width: 2.5;
                fill: none;
            }
            .ome-orb-drag-up { top: -12px; left: 50%; transform: translateX(-50%); }
            .ome-orb-drag-down { bottom: -12px; left: 50%; transform: translateX(-50%); }
            .ome-orb-drag-left { left: -12px; top: 50%; transform: translateY(-50%); }
            .ome-orb-drag-right { right: -12px; top: 50%; transform: translateY(-50%); }
            /* 🌀 Arrows appear and spin twice ONLY when hovering the orb SVG (bunny/atom/kawaii) */
            .ome-orb-wrapper .ome-bunny:hover ~ .ome-orb-drag-indicator,
            .ome-orb-wrapper .ome-atom-svg:hover ~ .ome-orb-drag-indicator,
            .ome-orb-wrapper .ome-kawaii-svg:hover ~ .ome-orb-drag-indicator,
            .ome-orb-wrapper .ome-robot-svg:hover ~ .ome-orb-drag-indicator {
                opacity: 0.7;
                animation: ome-arrow-spin 0.6s ease-out;
            }
            @keyframes ome-arrow-spin {
                from { transform: translateX(-50%) rotate(0deg); }
                to { transform: translateX(-50%) rotate(720deg); }
            }
            .ome-orb-wrapper .ome-bunny:hover ~ .ome-orb-drag-left,
            .ome-orb-wrapper .ome-atom-svg:hover ~ .ome-orb-drag-left,
            .ome-orb-wrapper .ome-kawaii-svg:hover ~ .ome-orb-drag-left,
            .ome-orb-wrapper .ome-robot-svg:hover ~ .ome-orb-drag-left,
            .ome-orb-wrapper .ome-bunny:hover ~ .ome-orb-drag-right,
            .ome-orb-wrapper .ome-atom-svg:hover ~ .ome-orb-drag-right,
            .ome-orb-wrapper .ome-kawaii-svg:hover ~ .ome-orb-drag-right,
            .ome-orb-wrapper .ome-robot-svg:hover ~ .ome-orb-drag-right {
                animation-name: ome-arrow-spin-y;
            }
            @keyframes ome-arrow-spin-y {
                from { transform: translateY(-50%) rotate(0deg); }
                to { transform: translateY(-50%) rotate(720deg); }
            }
            .ome-bunny { width: 100%; height: 100%; }
            .ome-bunny-paws {
                position: absolute;
                bottom: -18px;
                left: 50%;
                transform: translateX(-50%) translateY(6px);
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
                pointer-events: none;
            }
            @keyframes ome-bunny-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
            .ome-orb:not(.holding) { animation: ome-bunny-float 3s ease-in-out infinite; }
            @keyframes ome-bunny-wiggle { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
            .ome-orb.holding { animation: ome-bunny-wiggle 0.3s ease-in-out infinite; }

            /* ⚛️ Atom animations */
            @keyframes ome-nucleus-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes ome-orbit-pulse { 0%,100% { opacity: 0.5; stroke-width: 1.5; } 50% { opacity: 1; stroke-width: 3; } }
            .ome-atom-svg .ome-nucleus { transform-origin: 30px 30px; animation: ome-nucleus-spin 6s linear infinite; }
            .ome-atom-svg .ome-orbit { animation: ome-orbit-pulse 2.5s ease-in-out infinite; }
            .ome-atom-svg .ome-orbit-2 { animation-delay: 0.8s; }
            .ome-atom-svg .ome-orbit-3 { animation-delay: 1.6s; }

            /* 🎨 Theme color variables */
            .ome-hud {
                --theme-color: 147,112,219;  /* Default purple (atom) */
                --theme-accent: #ba93ff;
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                background: #212121;
                z-index: 2147483645;
                display: none;
                font-family: system-ui, -apple-system, sans-serif;
                color: #7ec8e3;
                opacity: 0;
                transition: opacity 0.2s ease;
                pointer-events: auto;
                overflow: hidden;  /* Prevent HUD from scrolling */
                overscroll-behavior: contain;  /* Prevent scroll chaining to window */
            }
            .ome-hud[data-theme="kawaii"] {
                --theme-color: 126,200,227;  /* Sparkly blue */
                --theme-accent: #7ec8e3;
                --text-color: #7ec8e3;
            }
            .ome-hud[data-theme="robot"] {
                --theme-color: 0,229,255;  /* Cyan */
                --theme-accent: #00e5ff;
                --text-color: #00e5ff;
            }
            .ome-hud[data-theme="atom"] {
                --theme-color: 60,179,113;  /* Forest green RGB */
                --theme-accent: #3CB371;    /* Forest green */
                --text-color: #3CB371;      /* Forest green text */
            }
            .ome-hud.visible { display: flex; opacity: 1; flex-direction: column; }
            @keyframes ome-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

            /* 🔝 Top Bar - ChatGPT style header */
            .ome-hud-topbar {
                flex: 0 0 auto;
                height: 56px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 16px;
                background: rgba(33,33,33,0.95);
                z-index: 10;
            }
            .ome-hud-topbar-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .ome-hud-topbar-title {
                font-size: 16px;
                font-weight: 600;
                color: #e5e5e5;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .ome-hud-topbar-title svg {
                width: 20px;
                height: 20px;
                stroke: var(--theme-accent);
                fill: none;
                stroke-width: 2;
            }
            .ome-hud-model-select {
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                padding: 6px 12px;
                color: #e5e5e5;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .ome-hud-model-select:hover { background: rgba(255,255,255,0.12); }
            .ome-hud-topbar-right {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            /* 🤖 Mini Orb Sidebar Trigger - identical orb just smaller */
            .ome-sidebar-trigger {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 4px;
                cursor: pointer;
                background: transparent;
                border: none;
            }
            .ome-mini-orb-wrapper {
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease;
                background: transparent;
                border: none;
            }
            .ome-mini-orb-wrapper .ome-mini-orb {
                width: 44px;
                height: 44px;
                background: transparent;
            }
            .ome-sidebar-trigger:hover .ome-mini-orb-wrapper {
                transform: scale(1.2);
            }
            .ome-mini-arrow {
                width: 16px;
                height: 16px;
                opacity: 0.6;
                transition: opacity 0.15s ease, transform 0.15s ease;
            }
            .ome-sidebar-trigger:hover .ome-mini-arrow {
                opacity: 1;
                transform: translateX(2px);
            }

            /* 🔘 Topbar Close Button */
            .ome-hud-topbar-btn {
                width: 40px;
                height: 40px;
                border: 1px solid rgba(var(--theme-color),0.35);
                border-radius: 12px;
                background: rgba(80,100,160,0.55);
                color: var(--text-color);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, border-color 0.15s ease;
            }
            .ome-hud-topbar-btn:hover { background: rgba(80,100,160,0.75); border-color: rgba(var(--theme-color),0.55); }
            .ome-hud-topbar-btn:active { transform: scale(0.95); }
            .ome-hud-topbar-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; }

            /* 🎯 HUD Content Area - full height flex layout */
            .ome-hud-content {
                flex: 1 1 auto;
                display: flex;
                overflow: hidden;
                position: relative;
            }

            /* 🎯 HUD Main Container - ChatGPT centered layout */
            .ome-hud-main {
                flex: 1 1 auto;
                display: flex;
                flex-direction: column;
                max-width: 900px;
                margin: 0 auto;
                padding: 0 24px;
                width: 100%;
                transition: margin-left 0.25s ease;
            }
            /* 📚 When sidebar is open, shift main content */
            .ome-hud.sidebar-open .ome-hud-main {
                margin-left: 280px;
            }
            /* 📚 When sidebar is open, hide topbar mini orb (sidebar has its own) */
            .ome-hud.sidebar-open .ome-sidebar-trigger {
                display: none;
            }

            /* 💬 HUD Messages Area - scrollable container with scrollbar at far right */
            .ome-hud-messages-area {
                position: absolute;
                top: 10px;  /* Near top of page */
                bottom: 115px;  /* Just above input area */
                left: 80px;   /* SAME as input-area */
                right: 10px;  /* Extended to edge for scrollbar */
                overflow-y: auto;
                overflow-x: hidden;
                overscroll-behavior: contain;
                transition: opacity 0.2s ease, visibility 0.2s ease, left 0.25s ease;
            }
            /* 📚 When sidebar open, shift left edge (SAME as input-area) */
            .ome-hud.sidebar-open .ome-hud-messages-area {
                left: 284px;
            }
            /* 🙈 Hide messages when prompt is hidden */
            .ome-hud-messages-area.hidden-for-sidebar {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
            }
            .ome-hud-messages-area::-webkit-scrollbar { width: 8px; }
            .ome-hud-messages-area::-webkit-scrollbar-track { background: transparent; }
            .ome-hud-messages-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
            .ome-hud-messages-area::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }

            /* 💬 Messages Flex - centering wrapper inside scroll area */
            .ome-hud-messages-flex {
                display: flex;
                justify-content: center;  /* SAME as input-area */
                gap: 4px;     /* SAME as input-area */
                min-height: 100%;
                padding-right: 8px;  /* Account for extended right edge (18px - 10px) */
            }

            /* 💬 Messages Scroll Container - matches prompt-wrapper width */
            .ome-hud-messages-scroll {
                flex: 0 1 800px;  /* SAME as prompt-wrapper */
                min-width: 240px; /* SAME as prompt-wrapper */
                display: flex;
                flex-direction: column;
                transition: flex-basis 0.25s ease;  /* SAME transition as prompt-wrapper */
            }

            /* 💬 Messages Content - inside scroll container */
            .ome-hud-messages-content {
                --hud-text-zoom: 1;  /* 🔍 Text zoom level (controlled by zoom buttons) */
                display: flex;
                flex-direction: column;
                gap: 24px;
                padding: 24px 12px;
                font-size: calc(1rem * var(--hud-text-zoom));
            }

            /* 📐 Messages Spacers - mirror the orb-wrapper + scroll structure exactly */
            .ome-hud-messages-spacer-orb {
                flex: 0 0 80px;  /* Match orb-wrapper (character) width */
            }
            .ome-hud-messages-spacer-scroll {
                flex: 0 0 48px;  /* Match ome-hud-scroll (ORB button) width */
            }

            /* 🛤️ HUD Rail - hidden (was for sliding prompt unit) */
            .ome-hud-rail {
                display: none;
            }

            /* 💬 HUD Input Area - pinned to bottom, constrained by edges */
            .ome-hud-input-area {
                position: absolute;
                left: 80px;   /* space for sidebar trigger */
                right: 18px;  /* 10px visual gap + 8px for ORB button outer ring */
                bottom: 16px;
                display: flex;
                justify-content: center;  /* centre prompt unit when space available */
                align-items: center;      /* 🎯 vertically centre prompt to orb */
                gap: 4px;     /* tight spacing to maximize prompt space */
                z-index: 2;
                transition: left 0.25s ease;
            }
            .ome-hud-input-area.dragging {
                cursor: grabbing;
            }
            /* 📚 When sidebar open, adjust left edge (sidebar 280px + 4px gap) */
            .ome-hud.sidebar-open .ome-hud-input-area {
                left: 284px;
            }

            /* 💬 HUD Prompt Wrapper - flexible width, shrinks when sidebar opens */
            .ome-hud-prompt-wrapper {
                flex: 0 1 800px;  /* don't grow, can shrink, ideal 800px */
                min-width: 240px; /* minimum usable width */
                border: 1px solid rgba(var(--theme-color), 0.35);
                border-radius: 12px;
                box-shadow: 0 0 6px rgba(var(--theme-color), 0.125),
                            0 0 12px rgba(var(--theme-color), 0.075),
                            0 2px 12px rgba(0, 0, 0, 0.15);
                overflow: hidden;
                filter: drop-shadow(0 0 2px rgba(var(--theme-color), 0.15));
                display: flex;
                flex-direction: column;
                transition: opacity 0.2s ease, visibility 0.2s ease, flex-basis 0.25s ease;
            }
            /* 🙈 Hide prompt when sidebar causes overflow (narrow viewport) */
            .ome-hud-prompt-wrapper.hidden-for-sidebar {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                width: 0;
                min-width: 0;
                flex-basis: 0;
                overflow: hidden;
            }
            /* 🙈 Hide prompt when toggled via button */
            .ome-hud-prompt-wrapper.hidden-by-user {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                height: 0;
                overflow: hidden;
            }
            /* 📐 Expand messages when prompt hidden */
            .ome-hud.prompt-hidden .ome-hud-messages-area {
                bottom: 20px;
            }
            /* 🙈 When prompt hidden, move orb/controls to left (after sidebar) */
            .ome-hud-input-area.prompt-hidden {
                justify-content: flex-start;
            }

            /* 💬 HUD Prompt Box - OME style (YOUR prompt unit) */
            .ome-hud-prompt {
                min-height: 100px;
                max-height: 400px;
                background: rgba(33,33,33,0.95);
                backdrop-filter: blur(12px);
                border-radius: 12px;  /* Match wrapper border-radius */
                display: flex;
                flex-direction: column;
                font-family: system-ui, -apple-system, sans-serif;
                overflow: hidden;
                color: #7ec8e3;
            }
            /* 💬 HUD Textarea - OME style (YOUR input) */
            .ome-hud-prompt-textarea {
                display: block;
                box-sizing: border-box;
                width: calc(100% - 20px);
                margin: 0 10px;
                min-height: 40px;
                max-height: 300px;
                background: transparent;
                border: none;
                padding: 16px 6px 8px 6px;
                font-size: 15px;
                line-height: 1.5;
                color: var(--text-color);
                outline: none;
                resize: none;
                overflow-y: hidden;
                overflow-x: hidden;
                font-family: inherit;
                word-wrap: break-word;
                white-space: pre-wrap;
            }
            .ome-hud-prompt-textarea::placeholder {
                color: var(--text-color);
                opacity: 0.5;
            }
            .ome-hud-prompt-textarea::-webkit-scrollbar { width: 6px; }
            .ome-hud-prompt-textarea::-webkit-scrollbar-track { background: transparent; }
            .ome-hud-prompt-textarea::-webkit-scrollbar-thumb {
                background: rgba(var(--theme-color),0.3);
                border-radius: 3px;
            }
            /* 💬 HUD Actions Bar - buttons at bottom */
            .ome-hud-prompt-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 16px;
                border-top: 1px solid rgba(var(--theme-color),0.1);
            }
            /* 🔍 Sweep Mode - highlighted text */
            .ome-hud-swept {
                background: rgba(var(--theme-color), 0.25) !important;
                border-radius: 2px;
            }
            /* 🔍 Scan Mode - 8 converging arrows around orb */
            .ome-hud-scan-arrow {
                position: absolute;
                width: 20px;
                height: 20px;
                opacity: 0;
                pointer-events: none;
            }
            .ome-hud-scan-arrow svg {
                width: 20px;
                height: 20px;
                stroke: currentColor;
                stroke-width: 2.5;
                fill: none;
            }
            /* Position arrows at 8 points around orb (orb is 80px) */
            .ome-hud-scan-arrow-n  { top: -30px; left: 50%; transform: translateX(-50%) rotate(180deg); }
            .ome-hud-scan-arrow-ne { top: -15px; right: -15px; transform: rotate(225deg); }
            .ome-hud-scan-arrow-e  { top: 50%; right: -30px; transform: translateY(-50%) rotate(270deg); }
            .ome-hud-scan-arrow-se { bottom: -15px; right: -15px; transform: rotate(315deg); }
            .ome-hud-scan-arrow-s  { bottom: -30px; left: 50%; transform: translateX(-50%); }
            .ome-hud-scan-arrow-sw { bottom: -15px; left: -15px; transform: rotate(45deg); }
            .ome-hud-scan-arrow-w  { top: 50%; left: -30px; transform: translateY(-50%) rotate(90deg); }
            .ome-hud-scan-arrow-nw { top: -15px; left: -15px; transform: rotate(135deg); }
            /* Animate arrows converging inward during scan mode */
            .ome-hud.scan-mode .ome-hud-scan-arrow {
                animation: ome-arrow-converge 1.2s ease-in-out infinite;
            }
            .ome-hud.scan-mode .ome-hud-scan-arrow-ne,
            .ome-hud.scan-mode .ome-hud-scan-arrow-sw { animation-delay: 0.15s; }
            .ome-hud.scan-mode .ome-hud-scan-arrow-e,
            .ome-hud.scan-mode .ome-hud-scan-arrow-w { animation-delay: 0.3s; }
            .ome-hud.scan-mode .ome-hud-scan-arrow-se,
            .ome-hud.scan-mode .ome-hud-scan-arrow-nw { animation-delay: 0.45s; }
            @keyframes ome-arrow-converge {
                0% { opacity: 0.9; }
                50% { opacity: 0.5; }
                100% { opacity: 0; }
            }
            /* 💬 HUD Send Button - consistent with orb button */
            .ome-hud-send-btn {
                width: 40px;
                height: 40px;
                min-width: 40px;
                min-height: 40px;
                border: 1px solid rgba(var(--theme-color),0.35);
                border-radius: 10px;
                background: rgba(80,100,160,0.55);
                color: var(--text-color);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, border-color 0.15s ease;
            }
            .ome-hud-send-btn:hover { background: rgba(80,100,160,0.75); border-color: rgba(var(--theme-color),0.55); }
            .ome-hud-send-btn:active { transform: scale(0.95); }
            .ome-hud-send-btn svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; fill: none; }
            /* 🗑️ HUD Clear Button - alien X style */
            .ome-hud-clear-btn {
                width: 40px;
                height: 40px;
                min-width: 40px;
                min-height: 40px;
                border: 1px solid rgba(var(--theme-color),0.35);
                border-radius: 10px;
                background: rgba(80,100,160,0.55);
                color: var(--text-color);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, border-color 0.15s ease;
            }
            .ome-hud-clear-btn:hover { background: rgba(160,80,80,0.75); border-color: rgba(var(--theme-color),0.55); }
            .ome-hud-clear-btn:active { transform: scale(0.95); }
            .ome-hud-clear-btn svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 2; fill: none; }

            /* 💬 HUD Message Bubbles - left-aligned, user indented */
            .ome-hud-message {
                padding: 12px 14px;
                font-size: 1em;  /* 🔍 Inherits from parent (scaled by --hud-text-zoom) */
                line-height: 1.6;
                word-wrap: break-word;
                white-space: pre-wrap;
                border-radius: 8px;
            }
            .ome-hud-message.user {
                margin-left: 0;
                padding-left: 0;
                border-left: none;
                background: rgba(255,255,255,0.03);
                color: var(--text-color);
                opacity: 0.6;
            }
            .ome-hud-message.assistant {
                margin-left: 0;
                background: rgba(60,80,120,0.15);
                color: var(--text-color);
                opacity: 0.6;
            }
            .ome-hud-message.error {
                margin-left: 0;
                background: rgba(220,38,38,0.2);
                color: #fca5a5;
                font-size: 0.87em;  /* 🔍 Slightly smaller, still scales with zoom */
            }
            /* 💬 HUD Message Images */
            .ome-hud-message img {
                max-width: 100%;
                max-height: 300px;
                border-radius: 6px;
                margin-top: 8px;
                object-fit: contain;
            }
            .ome-hud-message img:first-child { margin-top: 0; }

            /* ⬆️⬇️ HUD Scroll Controls (vertical, mirrors orb gear stick layout) - fixed, never shrinks */
            .ome-hud-scroll {
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                color: var(--text-color);
            }
            .ome-hud-scroll .ome-hud-ctrl-btn {
                width: 28px;
                height: 28px;
                border: 3px solid currentColor;
                border-radius: 50%;
                background: transparent;
                color: inherit;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
                opacity: 0.5;
            }
            .ome-hud-scroll .ome-hud-ctrl-btn:hover { background: rgba(var(--theme-color),0.15); opacity: 1; transform: scale(1.2); }
            .ome-hud-scroll .ome-hud-ctrl-btn:active { transform: scale(0.9); }
            .ome-hud-scroll .ome-hud-ctrl-btn svg {
                width: 12px;
                height: 12px;
                stroke: currentColor;
                stroke-width: 3;
                fill: none;
            }
            /* ⚙️ HUD Gear Button - gold metallic, identical to orb */
            .ome-hud-gear-btn {
                width: 32px;
                height: 32px;
                border: 3px solid #d4a84b;
                border-radius: 50%;
                background: linear-gradient(145deg, #ffd700 0%, #b8860b 50%, #d4a84b 100%);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
                transition: opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
                padding: 0;
            }
            .ome-hud-gear-btn svg {
                width: 18px;
                height: 18px;
                stroke: #2a2a2a;
                stroke-width: 2.5;
                fill: none;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            .ome-hud-gear-btn:hover { opacity: 1; transform: scale(1.08); }
            .ome-hud-gear-btn.engaged {
                opacity: 1;
                transform: scale(1.1);
                box-shadow: 0 0 6px rgba(255, 215, 0, 0.5);
                border-color: #ffd700;
            }
            .ome-hud-gear-btn.scrolling-up { box-shadow: 0 -3px 6px rgba(255, 215, 0, 0.4); }
            .ome-hud-gear-btn.scrolling-down { box-shadow: 0 3px 6px rgba(255, 215, 0, 0.4); }
            .ome-hud-gear-btn.boundary { animation: ome-hud-gear-boundary 0.3s ease-out; }
            @keyframes ome-hud-gear-boundary {
                0% { background: linear-gradient(145deg, #ff6b6b 0%, #cc4444 100%); border-color: #ff6b6b; }
                100% { background: linear-gradient(145deg, #ffd700 0%, #b8860b 50%, #d4a84b 100%); border-color: #d4a84b; }
            }
            /* 🌀 Arrows spin when hovering gear */
            .ome-hud-scroll:has(.ome-hud-gear-btn:hover) .ome-hud-ctrl-btn svg {
                animation: ome-arrow-spin-scroll 0.6s ease-out;
            }
            /* 🔮 HUD Menu Button (ORB label, purple style with theme-colored outer ring) */
            .ome-hud-menu-btn {
                position: relative;
                width: 48px;
                height: 48px;
                border: 2px solid var(--text-color);
                border-radius: 50%;
                background: transparent;
                color: var(--text-color);
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.5px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, transform 0.1s ease, border-color 0.15s ease;
                opacity: 0.7;
            }
            /* 🌀 Outer ring - theme colored, spins on hover */
            .ome-hud-menu-btn::before {
                content: '';
                position: absolute;
                top: -6px;
                left: -6px;
                right: -6px;
                bottom: -6px;
                border: 2px solid var(--text-color);
                border-radius: 50%;
                opacity: 0.5;
                transition: opacity 0.2s ease;
            }
            .ome-hud-menu-btn { margin-bottom: 10px; }
            .ome-hud-menu-btn:hover { background: rgba(var(--theme-color),0.15); opacity: 1; }
            .ome-hud-menu-btn:hover::before { opacity: 1; animation: ome-ring-spin 1s linear infinite; }
            .ome-hud-menu-btn:active { transform: scale(0.95); }

            /* 🔮 HUD Orb Container - fixed size, never shrinks */
            .ome-hud-orb-container {
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            /* 💬 HUD Prompt Button - toggle prompt visibility */
            .ome-hud-prompt-btn {
                padding: 3px 10px;
                font-size: 9px;
                font-weight: 600;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                color: #a5b4fc;
                background: rgba(167,139,250,0.25);
                border: 1px solid rgba(167,139,250,0.5);
                border-radius: 10px;
                cursor: pointer;
                opacity: 0.85;
                transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
                white-space: nowrap;
            }
            .ome-hud-prompt-btn:hover { opacity: 1; background: rgba(167,139,250,0.4); transform: scale(1.08); }
            .ome-hud-prompt-btn:active { transform: scale(0.95); }
            .ome-hud-prompt-btn.active { opacity: 1; background: rgba(167,139,250,0.5); border-color: #a5b4fc; color: #fff; }

            /* 🔍 HUD Zoom Controls - text size for messages area (mirrors orb layout) */
            .ome-hud-zoom {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 2px;
                color: var(--text-color);
            }
            .ome-hud-zoom .ome-hud-ctrl-btn {
                width: 28px;
                height: 28px;
                border: 3px solid currentColor;
                border-radius: 50%;
                background: transparent;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
                opacity: 0.5;
                font-size: 16px;
                font-weight: 600;
                color: currentColor;
                line-height: 1;
            }
            .ome-hud-zoom .ome-hud-ctrl-btn:hover { background: rgba(var(--theme-color),0.15); opacity: 1; transform: scale(1.2); }
            .ome-hud-zoom .ome-hud-ctrl-btn:active { transform: scale(0.9); }
            .ome-hud-zoom-label {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid currentColor;
                background: transparent;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 700;
                color: currentColor;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.15s ease, transform 0.15s ease;
                text-transform: none;
            }
            .ome-hud-zoom-label:hover { opacity: 1; transform: scale(1.08); }

            /* 🔮 HUD Orb Wrapper (for arrows) */
            .ome-hud-orb-wrapper {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                -webkit-user-select: none;
            }
            .ome-hud-orb-wrapper * { user-select: none; -webkit-user-select: none; }
            /* Allow text selection in messages */
            .ome-chat-bubble, .ome-chat-bubble *,
            .ome-hud-message, .ome-hud-message * {
                user-select: text;
                -webkit-user-select: text;
            }
            .ome-copy-btn { user-select: none; -webkit-user-select: none; }
            /* ⬆️⬇️ Drag indicators (arrows) */
            .ome-hud-drag-indicator {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                width: 24px;
                height: 24px;
                color: var(--text-color);
                opacity: 0;
                pointer-events: none;
            }
            .ome-hud-drag-indicator svg {
                width: 24px;
                height: 24px;
                stroke: currentColor;
                stroke-width: 2.5;
                fill: none;
            }
            .ome-hud-drag-up { top: -18px; }
            .ome-hud-drag-down { bottom: -18px; }
            /* HUD orb doesn't drag - hide the drag indicators */
            .ome-hud-drag-indicator { display: none; }
            /* 🔮 HUD Orb Display */
            .ome-hud-orb {
                width: 80px;
                height: 80px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: transform 0.2s ease;
                outline: none;
                caret-color: transparent;
            }
            .ome-hud-orb:hover { transform: scale(1.05); }
            .ome-hud-orb.holding { transform: scale(1.1); cursor: grabbing; }
            .ome-hud-orb svg { width: 80px; height: 80px; }

            /* ⬆️⬇️ Scroll Controls (right side of orb, vertical - mirrors zoom layout) */
            .ome-scroll-controls {
                position: absolute;
                right: -54px;
                top: 50%;
                transform: translateY(-50%);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }
            /* ⬆️⬇️ Scroll control buttons - match zoom button sizing */
            .ome-scroll-controls .ome-ctrl-btn {
                width: 28px;
                height: 28px;
                border-width: 3px;
            }
            .ome-scroll-controls .ome-ctrl-btn svg {
                width: 12px;
                height: 12px;
                stroke-width: 3;
            }
            /* ⚙️ Gear Button - gold metallic, identical to Z label (32px + 3px border) */
            .ome-gear-btn {
                width: 32px;
                height: 32px;
                border: 3px solid #d4a84b;
                border-radius: 50%;
                background: linear-gradient(145deg, #ffd700 0%, #b8860b 50%, #d4a84b 100%);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
                transition: opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
                padding: 0;
            }
            .ome-gear-btn svg {
                width: 18px;
                height: 18px;
                stroke: #2a2a2a;
                stroke-width: 2.5;
                fill: none;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            .ome-gear-btn:hover {
                opacity: 1;
                transform: scale(1.08);
            }
            /* 🌀 Arrows spin twice when hovering gear */
            .ome-gear-btn:hover ~ .ome-scroll-top svg,
            .ome-gear-btn:hover ~ .ome-scroll-bottom svg,
            .ome-gear-btn:hover + .ome-scroll-bottom svg,
            .ome-scroll-top:has(~ .ome-gear-btn:hover) svg {
                animation: ome-arrow-spin-scroll 0.6s ease-out;
            }
            @keyframes ome-arrow-spin-scroll {
                from { transform: rotate(0deg); }
                to { transform: rotate(720deg); }
            }
            /* Fallback: spin arrows when gear is hovered (parent selector approach) */
            .ome-scroll-controls:has(.ome-gear-btn:hover) .ome-ctrl-btn svg {
                animation: ome-arrow-spin-scroll 0.6s ease-out;
            }
            /* 🔒 Engaged state - gear is active */
            .ome-gear-btn.engaged {
                opacity: 1;
                transform: scale(1.1);
                box-shadow: 0 0 6px rgba(255, 215, 0, 0.5);
                border-color: #ffd700;
            }
            /* ⬆️ Scrolling up indicator */
            .ome-gear-btn.scrolling-up {
                box-shadow: 0 -3px 6px rgba(255, 215, 0, 0.4);
            }
            /* ⬇️ Scrolling down indicator */
            .ome-gear-btn.scrolling-down {
                box-shadow: 0 3px 6px rgba(255, 215, 0, 0.4);
            }
            /* 🚫 Boundary flash */
            .ome-gear-btn.boundary {
                animation: ome-gear-boundary 0.3s ease-out;
            }
            @keyframes ome-gear-boundary {
                0% { background: linear-gradient(145deg, #ff6b6b 0%, #cc4444 100%); border-color: #ff6b6b; }
                100% { background: linear-gradient(145deg, #ffd700 0%, #b8860b 50%, #d4a84b 100%); border-color: #d4a84b; }
            }
            /* 📋 Menu button (HUD label, purple style with theme-colored outer ring) */
            .ome-menu-btn {
                position: relative;
                width: 36px;
                height: 36px;
                border: 2px solid currentColor;
                border-radius: 50%;
                background: transparent;
                color: inherit;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 0.5px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, transform 0.1s ease, border-color 0.15s ease;
                opacity: 0.7;
            }
            /* 🌀 Outer ring - theme colored, spins on hover */
            .ome-menu-btn::before {
                content: '';
                position: absolute;
                top: -6px;
                left: -6px;
                right: -6px;
                bottom: -6px;
                border: 2px solid currentColor;
                border-radius: 50%;
                opacity: 0.5;
                transition: opacity 0.2s ease;
            }
            .ome-menu-btn { margin-bottom: 10px; }
            .ome-menu-btn:hover { background: rgba(126,200,227,0.15); opacity: 1; }
            .ome-menu-btn:hover::before { opacity: 1; animation: ome-ring-spin 1s linear infinite; }
            .ome-menu-btn:active { transform: scale(0.95); }
            @keyframes ome-ring-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            /* 💬 Prompt Button (between orb and zoom) - consistent purple style across all orbs */
            .ome-prompt-btn {
                position: absolute;
                bottom: -20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 3px 10px;
                font-size: 9px;
                font-weight: 600;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                color: #a5b4fc;
                background: rgba(167,139,250,0.25);
                border: 1px solid rgba(167,139,250,0.5);
                border-radius: 10px;
                cursor: pointer;
                opacity: 0.85;
                transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
                white-space: nowrap;
                z-index: 10;
            }
            .ome-prompt-btn:hover { opacity: 1; background: rgba(167,139,250,0.4); transform: translateX(-50%) scale(1.08); }
            .ome-prompt-btn:active { transform: translateX(-50%) scale(0.95); }
            .ome-prompt-btn.active { opacity: 1; background: rgba(167,139,250,0.5); border-color: #a5b4fc; color: #fff; }

            /* 🔍 Zoom Controls (bottom of orb, below prompt) */
            .ome-zoom-controls {
                position: absolute;
                bottom: -64px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 2px;
            }
            .ome-ctrl-btn {
                width: 14px;
                height: 14px;
                border: 1.5px solid currentColor;
                border-radius: 50%;
                background: transparent;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.5;
                transition: opacity 0.15s ease, transform 0.15s ease;
                padding: 0;
                font-size: 9px;
                font-weight: bold;
                color: currentColor;
                line-height: 1;
            }
            .ome-zoom-controls .ome-ctrl-btn {
                width: 28px;
                height: 28px;
                border-width: 3px;
                font-size: 16px;
            }
            .ome-ctrl-btn:hover { opacity: 1; transform: scale(1.2); }
            .ome-ctrl-btn:active { transform: scale(0.9); }
            .ome-ctrl-btn svg { width: 8px; height: 8px; stroke: currentColor; stroke-width: 2.5; fill: none; }
            .ome-ctrl-btn.ome-boundary { animation: ome-boundary-flash 0.3s ease-out; }
            @keyframes ome-boundary-flash {
                0% { background: rgba(255, 100, 100, 0.8); transform: scale(1.1); }
                100% { background: transparent; transform: scale(1); }
            }
            .ome-zoom-label {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid currentColor;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                font-weight: 700;
                letter-spacing: 0.5px;
                opacity: 0.8;
                cursor: pointer;
                transition: opacity 0.15s ease, transform 0.15s ease;
                text-transform: none;
            }
            .ome-zoom-label:hover { opacity: 1; transform: scale(1.08); }

            /* 🎨 Theme Selector */
            .ome-theme-section { margin-top: 24px; width: 100%; max-width: 400px; }
            .ome-theme-label { font-size: 12px; color: #6b7280; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
            .ome-theme-grid { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
            .ome-theme-btn {
                width: 72px; height: 90px;
                border: 2px solid rgba(255,255,255,0.1);
                border-radius: 12px;
                background: rgba(255,255,255,0.05);
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: all 0.2s ease;
                padding: 8px;
            }
            .ome-theme-btn:hover { border-color: rgba(167,139,250,0.5); background: rgba(167,139,250,0.1); }
            .ome-theme-btn.active { border-color: #a5b4fc; background: rgba(167,139,250,0.2); }
            .ome-theme-btn svg { width: 40px; height: 52px; }
            .ome-theme-btn span { font-size: 10px; color: #9ca3af; }
            .ome-theme-btn.active span { color: #a5b4fc; }

            /* 💬 Chat Panel (anchored to orb) - RESIZABLE & RESPONSIVE */
            .ome-chat-panel {
                --theme-color: 126,200,227;  /* Default kawaii blue */
                --theme-accent: #7ec8e3;
                --text-color: #7ec8e3;  /* Default text color */
                position: absolute;
                bottom: 0;
                right: 85px;
                width: 750px;
                height: auto;
                min-width: 363px;
                min-height: 120px;
                max-width: 968px;
                max-height: min(800px, 80vh);
                background: rgba(33,33,33,0.85);
                border: 1px solid rgba(var(--theme-color),0.35);
                border-radius: 12px;
                display: none;
                flex-direction: column;
                font-family: system-ui, -apple-system, sans-serif;
                box-shadow: 0 0 6px rgba(var(--theme-color),0.125), 0 0 12px rgba(var(--theme-color),0.075), 0 2px 12px rgba(0,0,0,0.15);
                overflow: hidden;
                color: var(--theme-accent);
                filter: drop-shadow(0 0 2px rgba(var(--theme-color),0.15));
            }
            .ome-chat-panel.visible { display: flex; }
            /* 🎨 Chat Panel Theme Colors */
            .ome-chat-panel[data-theme="kawaii"] {
                --theme-color: 126,200,227;
                --theme-accent: #7ec8e3;
                --text-color: #7ec8e3;
            }
            .ome-chat-panel[data-theme="robot"] {
                --theme-color: 0,229,255;
                --theme-accent: #00e5ff;
                --text-color: #00e5ff;
            }
            .ome-chat-panel[data-theme="atom"] {
                --theme-color: 147,112,219;
                --theme-accent: #ba93ff;
                --text-color: #3CB371;  /* Forest green text for atom */
            }

            /* 📐 Resize Handles */
            .ome-resize-handle {
                position: absolute;
                background: transparent;
                z-index: 10;
            }
            .ome-resize-n { top: -4px; left: 8px; right: 8px; height: 8px; cursor: n-resize; }
            .ome-resize-s { bottom: -4px; left: 8px; right: 8px; height: 8px; cursor: s-resize; }
            .ome-resize-e { display: none; }
            .ome-resize-w { top: 8px; left: -4px; bottom: 8px; width: 8px; cursor: w-resize; }
            .ome-resize-nw { top: -4px; left: -4px; width: 12px; height: 12px; cursor: nw-resize; }
            .ome-resize-ne { display: none; }
            .ome-resize-sw { bottom: -4px; left: -4px; width: 12px; height: 12px; cursor: sw-resize; }
            .ome-resize-se { display: none; }
            .ome-chat-panel.resizing { user-select: none; }

            /* 💬 Chat Messages Area */
            .ome-chat-messages {
                flex: 1 1 auto;
                overflow-y: auto;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-height: 60px;
            }
            .ome-chat-messages::-webkit-scrollbar { width: 12px; }
            .ome-chat-messages::-webkit-scrollbar-track { background: rgba(30,30,40,0.5); border-radius: 6px; }
            .ome-chat-messages::-webkit-scrollbar-thumb { background: rgba(167,139,250,0.5); border-radius: 6px; min-height: 40px; }
            .ome-chat-messages::-webkit-scrollbar-thumb:hover { background: rgba(167,139,250,0.7); }

            /* 💬 Message Bubbles */
            .ome-chat-bubble {
                max-width: 85%;
                padding: 10px 14px;
                border-radius: 14px;
                font-size: 15px;
                line-height: 1.5;
                word-wrap: break-word;
                white-space: pre-wrap;
            }
            .ome-chat-bubble.user {
                align-self: flex-start;
                background: transparent;
                border: 1px solid rgba(147,112,219,0.3);
                color: var(--text-color);
                text-align: left;
            }
            .ome-chat-bubble.assistant {
                align-self: flex-start;
                background: rgba(60,80,120,0.25);
                color: inherit;
                border-bottom-left-radius: 4px;
            }
            .ome-chat-bubble.error {
                align-self: center;
                background: rgba(220,38,38,0.3);
                color: #fca5a5;
                font-size: 12px;
            }
            /* 💬 Chat Bubble Images */
            .ome-chat-bubble img {
                max-width: 100%;
                max-height: 300px;
                border-radius: 6px;
                margin-top: 8px;
                object-fit: contain;
            }
            .ome-chat-bubble img:first-child { margin-top: 0; }

            /* 📝 Markdown Styles (shared by chat bubbles and HUD messages) */
            .md-content { line-height: 1.6; }
            .md-header { margin: 12px 0 6px 0; font-weight: 600; color: #a5b4fc; }
            h3.md-header { font-size: 1.2em; }
            h4.md-header { font-size: 1.1em; }
            h5.md-header { font-size: 1em; }
            .md-inline-code {
                background: rgba(139,92,246,0.2);
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'SF Mono', Monaco, Consolas, monospace;
                font-size: 0.9em;
                color: #c4b5fd;
            }
            .md-code-block {
                background: rgba(15,23,42,0.6);
                border: 1px solid rgba(139,92,246,0.3);
                border-radius: 8px;
                padding: 12px;
                margin: 10px 0;
                overflow-x: auto;
                font-family: 'SF Mono', Monaco, Consolas, monospace;
                font-size: 0.85em;
                line-height: 1.5;
                color: #e2e8f0;
            }
            .md-code-block code { background: none; padding: 0; color: inherit; }
            .md-link {
                color: #93c5fd;
                text-decoration: none;
                border-bottom: 1px dotted rgba(147,197,253,0.5);
            }
            .md-link:hover { color: #bfdbfe; border-bottom-color: #bfdbfe; }
            /* 🔗 Action links (tab://, chat://) - clickable, distinct style */
            .ome-action-link {
                color: #a5f3fc;
                background: rgba(34,211,238,0.15);
                padding: 2px 6px;
                border-radius: 4px;
                border-bottom: none;
                cursor: pointer;
                transition: background 0.15s, color 0.15s;
            }
            .ome-action-link:hover {
                color: #fff;
                background: rgba(34,211,238,0.35);
            }
            .md-blockquote {
                border-left: 3px solid rgba(139,92,246,0.5);
                padding-left: 12px;
                margin: 8px 0;
                color: rgba(255,255,255,0.7);
                font-style: italic;
            }
            .md-list {
                margin: 8px 0;
                padding-left: 24px;
            }
            .md-list li { margin: 4px 0; }
            .md-hr {
                border: none;
                border-top: 1px solid rgba(139,92,246,0.3);
                margin: 12px 0;
            }
            strong { font-weight: 600; color: #f1f5f9; }
            em { font-style: italic; color: rgba(255,255,255,0.85); }

            /* 📋 Copy Button (appears on message hover) */
            .ome-chat-bubble, .ome-hud-message { position: relative; }
            .ome-copy-btn {
                position: absolute;
                top: 6px;
                right: 6px;
                width: 28px;
                height: 28px;
                padding: 0;
                border: none;
                border-radius: 6px;
                background: rgba(30,41,59,0.8);
                color: rgba(255,255,255,0.6);
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.15s, background 0.15s;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ome-chat-bubble:hover .ome-copy-btn,
            .ome-hud-message:hover .ome-copy-btn { opacity: 1; }
            .ome-copy-btn:hover {
                background: rgba(59,130,246,0.5);
                color: #fff;
            }
            .ome-copy-btn.copied {
                background: rgba(34,197,94,0.5);
                color: #fff;
            }
            .ome-copy-btn svg { width: 16px; height: 16px; }

            /* 💬 Typing Preview (live draft as you type) */
            .ome-chat-bubble.typing-preview {
                align-self: flex-end;
                background: rgba(80,100,160,0.12);
                color: rgba(var(--theme-color),0.75);
                border: 1px dashed rgba(100,120,180,0.25);
                border-bottom-right-radius: 4px;
                max-width: 100%;
                min-height: 20px;
            }
            .ome-chat-bubble.typing-preview:empty { display: none; }

            /* 💬 Chat Input Area - flexbox at bottom, expands with content */
            .ome-chat-input-area {
                flex: 0 0 auto;
                display: flex;
                align-items: flex-end;
                gap: 8px;
                padding: 12px 14px;
                border-top: 1px solid rgba(var(--theme-color),0.15);
            }
            .ome-chat-input-wrapper {
                flex: 1;
                position: relative;
            }
            .ome-chat-input {
                width: 100%;
                display: block;
                box-sizing: border-box;
                min-height: 48px;
                max-height: 400px;
                background: rgba(40,50,80,0.22);
                border: 1px solid rgba(var(--theme-color),0.3);
                border-radius: 10px;
                padding: 12px 14px;
                font-size: 15px;
                line-height: 1.5;
                color: var(--text-color);
                outline: none;
                resize: none;
                overflow-y: auto;
                font-family: inherit;
                word-wrap: break-word;
                white-space: pre-wrap;
                transition: border-color 0.15s ease, background 0.15s ease;
            }
            .ome-chat-input::placeholder { color: var(--text-color); opacity: 0.5; }
            .ome-chat-input:focus { border-color: rgba(var(--theme-color),0.5); background: rgba(40,50,80,0.28); }
            .ome-chat-send {
                flex: 0 0 auto;
                width: 48px;
                height: 48px;
                min-width: 48px;
                min-height: 48px;
                border: 1px solid rgba(var(--theme-color),0.35);
                border-radius: 12px;
                background: rgba(80,100,160,0.55);
                color: var(--text-color);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, border-color 0.15s ease;
                z-index: 5;
            }
            .ome-chat-send:hover { background: rgba(80,100,160,0.75); border-color: rgba(var(--theme-color),0.55); }
            .ome-chat-send:active { transform: scale(0.95); }
            .ome-chat-send svg { width: 20px; height: 20px; stroke: currentColor; stroke-width: 2; fill: none; }
            /* 🗑️ Clear prompt button */
            .ome-chat-clear {
                flex: 0 0 auto;
                width: 36px;
                height: 48px;
                min-width: 36px;
                border: none;
                border-radius: 8px;
                background: transparent;
                color: rgba(var(--theme-color), 0.5);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.15s ease, background 0.15s ease;
            }
            .ome-chat-clear:hover { color: #ff6b6b; background: rgba(255, 100, 100, 0.15); }
            .ome-chat-clear:active { transform: scale(0.9); }
            .ome-chat-clear svg { width: 18px; height: 18px; fill: currentColor; }

            /* ═══════════════════════════════════════════════════════════════════
               📚 SIDEBAR - ChatGPT-style side panel for chat history
               ═══════════════════════════════════════════════════════════════════ */


            /* 📚 Sidebar Container - matches orb prompt box style */
            .ome-sidebar {
                position: fixed;
                top: 0;
                left: 0;
                width: 280px;
                height: 100%;
                background: rgba(40,50,80,0.22);
                border-right: 1px solid rgba(var(--theme-color, 126,200,227), 0.3);
                display: flex;
                flex-direction: column;
                transform: translateX(-100%);
                transition: transform 0.25s ease;
                z-index: 100001;
                box-shadow: 4px 0 24px rgba(0,0,0,0.4);
            }
            .ome-sidebar.open {
                transform: translateX(0);
            }

            /* 📚 Sidebar Header */
            .ome-sidebar-header {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(var(--theme-color, 126,200,227), 0.15);
            }
            /* 🐰 Sidebar Orb Trigger - arrow + orb to close sidebar */
            .ome-sidebar-orb-trigger {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 4px;
                cursor: pointer;
                background: transparent;
                border: none;
                padding: 0;
            }
            .ome-sidebar-orb-wrapper {
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease;
                background: transparent;
                border: none;
            }
            .ome-sidebar-orb-wrapper .ome-sidebar-orb {
                width: 44px;
                height: 44px;
                background: transparent;
            }
            .ome-sidebar-orb-trigger:hover .ome-sidebar-orb-wrapper {
                transform: scale(1.15);
            }
            .ome-sidebar-arrow {
                width: 16px;
                height: 16px;
                opacity: 0.6;
                transition: opacity 0.15s ease, transform 0.15s ease;
            }
            .ome-sidebar-orb-trigger:hover .ome-sidebar-arrow {
                opacity: 1;
                transform: translateX(-2px);
            }

            /* 📚 Sidebar Content (chat list area) */
            .ome-sidebar-content {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            }
            .ome-sidebar-content::-webkit-scrollbar { width: 6px; }
            .ome-sidebar-content::-webkit-scrollbar-track { background: transparent; }
            .ome-sidebar-content::-webkit-scrollbar-thumb {
                background: rgba(var(--theme-color, 126,200,227), 0.3);
                border-radius: 3px;
            }

            /* 📚 Sidebar Section Label - collapsible toggle */
            .ome-sidebar-label {
                padding: 12px 8px 8px;
                font-size: 14px;
                color: rgba(var(--theme-color, 126,200,227), 0.5);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                user-select: none;
                transition: color 0.15s;
            }
            .ome-sidebar-label:hover {
                color: rgba(var(--theme-color, 126,200,227), 0.9);
            }
            .ome-sidebar-label .arrow {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 14px;
                height: 14px;
            }
            .ome-sidebar-label .arrow svg {
                width: 14px;
                height: 14px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
                transition: transform 0.4s ease;
            }
            .ome-sidebar-label .arrow-left svg {
                transform: rotate(0deg);
            }
            .ome-sidebar-label .arrow-right svg {
                transform: rotate(180deg);
            }
            .ome-sidebar-label.expanded .arrow-left svg {
                transform: rotate(-450deg);
            }
            .ome-sidebar-label.expanded .arrow-right svg {
                transform: rotate(-270deg);
            }
            .ome-sidebar-label .label-text-collapsed,
            .ome-sidebar-label .label-text-expanded {
                transition: opacity 0.2s;
            }
            .ome-sidebar-label .label-text-expanded {
                display: none;
            }
            .ome-sidebar-label.expanded .label-text-collapsed {
                display: none;
            }
            .ome-sidebar-label.expanded .label-text-expanded {
                display: inline;
            }
            .ome-sidebar-chat-list {
                overflow: hidden;
                transition: max-height 0.25s ease;
                max-height: 1000px;
            }
            .ome-sidebar-chat-list.collapsed {
                max-height: 0;
            }

            /* 📚 Chat List Items - uses theme color */
            .ome-chat-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                border-radius: 8px;
                color: var(--theme-accent, #7ec8e3);
                font-size: 13px;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                opacity: 0.7;
            }
            .ome-chat-item:hover {
                background: rgba(var(--theme-color, 126,200,227), 0.1);
                opacity: 1;
            }
            .ome-chat-item.active {
                background: rgba(var(--theme-color, 126,200,227), 0.15);
                color: var(--theme-accent, #a5dff0);
                opacity: 1;
            }
            .ome-chat-item-title {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* 📚 New Chat link */
            .ome-sidebar-new-chat {
                padding: 12px 12px 8px;
                font-size: 14px;
                color: rgba(var(--theme-color, 126,200,227), 0.8);
                user-select: none;
                cursor: pointer;
                transition: color 0.15s;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .ome-sidebar-new-chat:hover {
                color: rgba(var(--theme-color, 126,200,227), 1);
            }
            .ome-sidebar-new-chat .plus {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                height: 18px;
            }
            .ome-sidebar-new-chat .plus svg {
                width: 18px;
                height: 18px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2.5;
                stroke-linecap: round;
                stroke-linejoin: round;
                transition: transform 0.1s;
            }
            .ome-sidebar-new-chat .plus.spinning svg {
                animation: spin-plus 0.6s ease-out;
            }
            @keyframes spin-plus {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(720deg); }
            }
            /* 📚 New Chat active/close state */
            .ome-sidebar-new-chat.active {
                color: rgba(200, 150, 100, 0.9);
            }
            .ome-sidebar-new-chat.active:hover {
                color: rgba(200, 150, 100, 1);
            }
            .ome-sidebar-new-chat.active .plus svg {
                transform: rotate(45deg);
            }

            /* 🔍 Search Chats link */
            .ome-sidebar-search {
                padding: 8px 12px;
                font-size: 14px;
                color: rgba(var(--theme-color, 126,200,227), 0.6);
                user-select: none;
                cursor: pointer;
                transition: color 0.15s;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .ome-sidebar-search:hover {
                color: rgba(var(--theme-color, 126,200,227), 0.9);
            }
            .ome-sidebar-search .icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
            }
            .ome-sidebar-search .icon svg {
                width: 16px;
                height: 16px;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            .ome-sidebar-search.active {
                color: rgba(200, 150, 100, 0.9);
            }
            .ome-sidebar-search.active:hover {
                color: rgba(200, 150, 100, 1);
            }
            /* 🔍 Search box */
            .ome-sidebar-search-box {
                padding: 0 12px 0 12px;
                overflow: hidden;
                max-height: 0;
                transition: max-height 0.2s ease, padding 0.2s ease;
                box-sizing: border-box;
            }
            .ome-sidebar-search-box.expanded {
                max-height: 50px;
                padding: 4px 12px 8px 12px;
            }
            .ome-sidebar-search-input {
                width: 100%;
                padding: 8px 12px;
                font-size: 13px;
                color: rgba(var(--theme-color, 126,200,227), 0.9);
                background: rgba(var(--theme-color, 126,200,227), 0.1);
                border: 1px solid rgba(var(--theme-color, 126,200,227), 0.2);
                border-radius: 6px;
                outline: none;
                transition: border-color 0.15s, background 0.15s;
                box-sizing: border-box;
            }
            .ome-sidebar-search-input:focus {
                border-color: rgba(var(--theme-color, 126,200,227), 0.5);
                background: rgba(var(--theme-color, 126,200,227), 0.15);
            }
            .ome-sidebar-search-input::placeholder {
                color: rgba(var(--theme-color, 126,200,227), 0.4);
            }

            /* 📚 Chat Item - row in sidebar */
            .ome-sidebar-chat {
                display: flex;
                align-items: center;
                padding: 10px 12px;
                margin: 4px 0;
                border-radius: 8px;
                transition: background 0.15s;
                position: relative;
            }
            .ome-sidebar-chat:hover {
                background: rgba(var(--theme-color, 126,200,227), 0.1);
            }
            .ome-sidebar-chat.active {
                background: rgba(var(--theme-color, 126,200,227), 0.12);
                border-left: 3px solid rgba(var(--theme-color, 126,200,227), 0.6);
                padding-left: 9px; /* Compensate for border */
            }
            .ome-sidebar-chat.new-chat {
                opacity: 0.7;
            }
            .ome-sidebar-chat.new-chat .ome-sidebar-chat-title {
                font-style: italic;
            }
            .ome-sidebar-chat-info {
                flex: 1;
                min-width: 0;
                margin-right: 10px;
                cursor: pointer;
            }
            .ome-sidebar-chat-title {
                font-size: 13px;
                color: rgba(var(--theme-color, 126,200,227), 0.9);
                white-space: nowrap;
                border-radius: 4px;
                padding: 2px 4px;
                margin: -2px -4px;
            }
            .ome-sidebar-chat-title.editing {
                white-space: normal;
                animation: text-heartbeat 1s ease-in-out infinite;
            }
            @keyframes text-heartbeat {
                0%, 100% {
                    opacity: 1;
                    transform: scale(1);
                }
                50% {
                    opacity: 0.7;
                    transform: scale(1.02);
                }
            }
            .ome-sidebar-chat-meta {
                font-size: 11px;
                color: rgba(var(--theme-color, 126,200,227), 0.5);
                margin-top: 2px;
                user-select: none;
                pointer-events: none;
            }
            .ome-sidebar-chat-title {
                user-select: none;
            }
            .ome-sidebar-chat-title.editing {
                user-select: text;
            }
            /* 🎨 Selection highlight for editing - high contrast */
            .ome-sidebar-chat-title.editing::selection {
                background: rgba(var(--theme-color, 126,200,227), 0.5);
                color: #fff;
            }
            /* 🎨 Remove pink text selection highlight */
            ::selection {
                background: transparent;
            }

            /* 📚 Three-dot menu - hidden by default, shown on hover */
            .ome-sidebar-chat-menu {
                opacity: 0;
                padding: 4px 8px;
                cursor: pointer;
                transition: opacity 0.15s;
                display: flex;
                align-items: center;
                gap: 3px;
                background: none;
                border: none;
            }
            .ome-sidebar-chat:hover .ome-sidebar-chat-menu {
                opacity: 1;
            }
            .ome-sidebar-chat-menu .dot {
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: rgba(var(--theme-color, 126,200,227), 0.5);
                transition: background 0.15s, box-shadow 0.15s;
            }
            .ome-sidebar-chat-menu:hover .dot {
                background: rgba(var(--theme-color, 126,200,227), 1);
                box-shadow: 0 0 6px rgba(var(--theme-color, 126,200,227), 0.8);
            }

            /* 📚 Edit hint pen icon - shown on new chat hover */
            .ome-sidebar-edit-hint {
                opacity: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-right: 8px;
                transition: opacity 0.15s;
            }
            .ome-sidebar-edit-hint svg {
                width: 14px;
                height: 14px;
                fill: rgba(var(--theme-color, 126,200,227), 0.7);
            }
            .ome-sidebar-chat.new-chat:hover .ome-sidebar-edit-hint {
                opacity: 1;
                animation: pen-flash 0.6s ease-out;
            }
            @keyframes pen-flash {
                0%, 100% { opacity: 1; }
                25% { opacity: 0.3; }
                50% { opacity: 1; }
                75% { opacity: 0.3; }
            }

            /* 📚 Inline action buttons (pen + trash) - shown on hover */
            .ome-sidebar-chat-actions {
                display: flex;
                align-items: center;
                gap: 4px;
                opacity: 0;
                transform: scale(0.8);
                transition: opacity 0.15s, transform 0.15s;
            }
            .ome-sidebar-chat:hover .ome-sidebar-chat-actions {
                opacity: 1;
                transform: scale(1);
            }
            .ome-sidebar-action-btn {
                width: 28px;
                height: 28px;
                border: none;
                border-radius: 6px;
                background: rgba(var(--theme-color, 126,200,227), 0.1);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                /* Simplified: opacity only, no transform transitions */
                opacity: 0.5;
            }
            .ome-sidebar-action-btn:hover {
                opacity: 1;
                background: rgba(var(--theme-color, 126,200,227), 0.35);
            }
            .ome-sidebar-action-btn svg {
                width: 14px;
                height: 14px;
                fill: rgba(var(--theme-color, 126,200,227), 0.9);
            }
            .ome-sidebar-action-btn.ome-action-delete:hover {
                background: rgba(255, 100, 100, 0.4);
            }
            .ome-sidebar-action-btn.ome-action-delete:hover svg {
                fill: #ff6b6b;
            }

            /* 📚 Confirm Delete - inline icon buttons */
            .ome-confirm-delete {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .ome-confirm-delete-btn {
                width: 28px;
                height: 28px;
                border-radius: 6px;
                cursor: pointer;
                border: 1px solid;
                display: flex;
                align-items: center;
                justify-content: center;
                /* Simplified: no transform transitions */
                opacity: 0.6;
            }
            .ome-confirm-delete-btn:hover {
                opacity: 1;
            }
            .ome-confirm-delete-btn:active {
                opacity: 0.8;
            }
            .ome-confirm-delete-btn svg {
                width: 14px;
                height: 14px;
                stroke-width: 2.5;
                fill: none;
            }
            .ome-confirm-delete-btn.yes {
                background: rgba(255, 80, 80, 0.2);
                border-color: rgba(255, 100, 100, 0.4);
            }
            .ome-confirm-delete-btn.yes:hover {
                background: rgba(255, 80, 80, 0.5);
                border-color: rgba(255, 100, 100, 0.8);
            }
            .ome-confirm-delete-btn.yes svg {
                stroke: #ff6b6b;
            }
            .ome-confirm-delete-btn.no {
                background: rgba(var(--theme-color, 126,200,227), 0.1);
                border-color: rgba(var(--theme-color, 126,200,227), 0.3);
            }
            .ome-confirm-delete-btn.no:hover {
                background: rgba(var(--theme-color, 126,200,227), 0.35);
                border-color: rgba(var(--theme-color, 126,200,227), 0.6);
            }
            .ome-confirm-delete-btn.no svg {
                stroke: rgba(var(--theme-color, 126,200,227), 0.9);
            }

            /* 📚 Confirm Edit - inline icon buttons (tick/cross for rename) */
            .ome-confirm-edit {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .ome-confirm-edit-btn {
                width: 28px;
                height: 28px;
                border-radius: 6px;
                cursor: pointer;
                border: 1px solid;
                display: flex;
                align-items: center;
                justify-content: center;
                /* Simplified: no transform transitions */
                opacity: 0.6;
            }
            .ome-confirm-edit-btn:hover {
                opacity: 1;
            }
            .ome-confirm-edit-btn:active {
                opacity: 0.8;
            }
            .ome-confirm-edit-btn svg {
                width: 14px;
                height: 14px;
                stroke-width: 2.5;
                fill: none;
            }
            .ome-confirm-edit-btn.yes {
                background: rgba(100, 200, 100, 0.2);
                border-color: rgba(100, 200, 100, 0.4);
            }
            .ome-confirm-edit-btn.yes:hover {
                background: rgba(100, 200, 100, 0.5);
                border-color: rgba(100, 200, 100, 0.8);
            }
            .ome-confirm-edit-btn.yes svg {
                stroke: #6bd66b;
            }
            .ome-confirm-edit-btn.no {
                background: rgba(200, 150, 100, 0.1);
                border-color: rgba(200, 150, 100, 0.3);
            }
            .ome-confirm-edit-btn.no:hover {
                background: rgba(200, 150, 100, 0.4);
                border-color: rgba(200, 150, 100, 0.7);
            }
            .ome-confirm-edit-btn.no svg {
                stroke: rgba(200, 150, 100, 0.9);
            }

            /* 📚 Dropdown menu (legacy - keeping for reference) */
            .ome-sidebar-dropdown {
                display: none;
                position: absolute;
                right: 8px;
                top: 100%;
                background: rgba(30, 30, 35, 0.98);
                border: 1px solid rgba(var(--theme-color, 126,200,227), 0.2);
                border-radius: 8px;
                padding: 4px 0;
                min-width: 120px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 1000;
                display: none;
            }
            .ome-sidebar-dropdown.open {
                display: block;
            }
            .ome-sidebar-dropdown-item {
                padding: 8px 12px;
                font-size: 13px;
                color: rgba(var(--theme-color, 126,200,227), 0.9);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.15s;
            }
            .ome-sidebar-dropdown-item:hover {
                background: rgba(var(--theme-color, 126,200,227), 0.1);
            }
            .ome-sidebar-dropdown-item.delete {
                color: #ff6b6b;
            }
            .ome-sidebar-dropdown-item svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
            }

            /* 📚 Empty State - uses theme color */
            .ome-sidebar-empty {
                padding: 24px 16px;
                text-align: center;
                color: rgba(var(--theme-color, 126,200,227), 0.5);
                font-size: 13px;
            }

            /* 📚 Sidebar Footer - uses theme color */
            .ome-sidebar-footer {
                padding: 12px 16px;
                border-top: 1px solid rgba(var(--theme-color, 126,200,227), 0.15);
                font-size: 11px;
                color: rgba(var(--theme-color, 126,200,227), 0.5);
                display: flex;
                align-items: center;
                justify-content: flex-start;
            }

            /* 🎛️ Settings Orb - spinning Chrome-style, same size as main orbs */
            .ome-settings-orb-container {
                position: relative;
                width: 42px;
                height: 42px;
                cursor: pointer;
                transition: transform 0.3s ease;
            }

            .ome-settings-orb-container:hover {
                transform: scale(1.15);
            }

            .ome-settings-orb {
                width: 42px;
                height: 42px;
                position: relative;
                animation: ome-settings-spin 24s linear infinite;
            }

            .ome-settings-orb-container:hover .ome-settings-orb {
                animation-duration: 6s;
            }

            .ome-settings-orb svg {
                width: 100%;
                height: 100%;
            }

            /* Chrome-style segments */
            .ome-settings-orb .segment {
                fill: none;
                stroke-width: 5;
                stroke-linecap: round;
            }
            .ome-settings-orb .seg1 { stroke: rgba(var(--theme-color, 126,200,227), 0.9); }
            .ome-settings-orb .seg2 { stroke: rgba(var(--theme-color, 126,200,227), 0.6); }
            .ome-settings-orb .seg3 { stroke: rgba(var(--theme-color, 126,200,227), 0.3); }
            .ome-settings-orb .center-dot {
                fill: rgba(var(--theme-color, 126,200,227), 1);
            }

            @keyframes ome-settings-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            /* Settings panel styles - matches new chat input styling */
            .ome-settings-panel {
                display: none;
                position: absolute;
                bottom: 50px;
                left: 8px;
                right: 8px;
                background: rgb(32, 33, 36);
                border: 1px solid rgba(var(--theme-color, 126,200,227), 0.2);
                border-radius: 10px;
                padding: 14px;
                z-index: 100;
                max-height: 400px;
                overflow-y: auto;
            }

            .ome-settings-panel.open {
                display: block;
            }

            /* Title - faded like "Unsaved" label */
            .ome-settings-panel h3 {
                margin: 0 0 14px 0;
                font-size: 12px;
                font-weight: 400;
                color: rgba(255,255,255,0.35);
                letter-spacing: 0.3px;
            }

            .ome-settings-group {
                margin-bottom: 14px;
            }

            /* Labels - faded gray, uppercase */
            .ome-settings-group label {
                display: block;
                font-size: 10px;
                color: rgba(255,255,255,0.35);
                margin-bottom: 6px;
                text-transform: uppercase;
                letter-spacing: 0.8px;
            }

            /* Throb animation for focused inputs */
            @keyframes ome-settings-throb {
                0%, 100% { border-color: rgba(var(--theme-color, 126,200,227), 0.35); }
                50% { border-color: rgba(var(--theme-color, 126,200,227), 0.6); }
            }

            /* Inputs - match New Chat input style with theme border + theme text */
            .ome-settings-group select,
            .ome-settings-group input {
                width: 100%;
                padding: 10px 12px;
                background: transparent;
                border: 1px solid rgba(var(--theme-color, 126,200,227), 0.3);
                border-radius: 6px;
                color: rgba(var(--theme-color, 126,200,227), 0.9);
                font-size: 13px;
                box-sizing: border-box;
                transition: all 0.2s ease;
            }

            .ome-settings-group select {
                appearance: none;
                -webkit-appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(126,200,227,0.5)' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 10px center;
                background-size: 14px;
                padding-right: 34px;
                cursor: pointer;
            }

            .ome-settings-group select option {
                background: rgba(30, 30, 35, 0.98);
                color: rgba(255,255,255,0.85);
                padding: 8px;
            }

            .ome-settings-group select:hover,
            .ome-settings-group input:hover {
                border-color: rgba(var(--theme-color, 126,200,227), 0.45);
            }

            /* Disabled inputs - clearly greyed out */
            .ome-settings-group input:disabled {
                opacity: 0.45;
                cursor: not-allowed;
                border-color: rgba(255, 255, 255, 0.12);
            }

            .ome-settings-group select:focus,
            .ome-settings-group input:focus {
                outline: none;
                border-color: rgba(var(--theme-color, 126,200,227), 0.5);
                animation: ome-settings-throb 1.5s ease-in-out infinite;
            }

            .ome-settings-group input::placeholder {
                color: rgba(255,255,255,0.25);
                font-style: italic;
            }

            /* Model wrapper - stack select and custom input */
            .ome-settings-model-wrapper {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .ome-settings-model-custom {
                margin-top: 0;
            }

            .ome-settings-row {
                display: flex;
                gap: 10px;
            }

            .ome-settings-row .ome-settings-group {
                flex: 1;
            }

            /* Save button - theme colored border like inputs */
            .ome-settings-save {
                width: 100%;
                padding: 10px;
                margin-top: 4px;
                background: transparent;
                border: 1px solid rgba(var(--theme-color, 126,200,227), 0.3);
                border-radius: 6px;
                color: rgba(var(--theme-color, 126,200,227), 0.7);
                font-size: 13px;
                font-weight: 400;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .ome-settings-save:hover {
                border-color: rgba(var(--theme-color, 126,200,227), 0.5);
                color: rgba(var(--theme-color, 126,200,227), 0.9);
            }

            .ome-settings-status {
                margin-top: 10px;
                font-size: 11px;
                text-align: center;
                color: rgba(100, 200, 100, 0.6);
            }
        `;
        shadow.appendChild(style);
    }

    /**
     * 🔄 Scroll with boundary feedback
     * Shows visual feedback if scroll boundary is reached
     * @param {string} direction - 'up', 'down', 'left', 'right'
     * @param {HTMLElement} button - The button element to flash if at boundary
     */
    function scrollWithFeedback(direction, button) {
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const maxScrollX = document.documentElement.scrollWidth - window.innerWidth;
        const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;

        // Check if we can scroll in the requested direction
        let canScroll = false;
        let scrollOptions = { behavior: 'smooth' };

        switch (direction) {
            case 'up':
                canScroll = scrollY > 0;
                scrollOptions.top = -window.innerHeight * 0.8;
                break;
            case 'down':
                canScroll = scrollY < maxScrollY;
                scrollOptions.top = window.innerHeight * 0.8;
                break;
            case 'left':
                canScroll = scrollX > 0;
                scrollOptions.left = -window.innerWidth * 0.8;
                break;
            case 'right':
                canScroll = scrollX < maxScrollX;
                scrollOptions.left = window.innerWidth * 0.8;
                break;
        }

        if (canScroll) {
            window.scrollBy(scrollOptions);
        } else if (button) {
            // Flash the button to indicate boundary
            button.classList.remove('ome-boundary');
            // Force reflow to restart animation
            void button.offsetWidth;
            button.classList.add('ome-boundary');
            // Remove class after animation completes
            setTimeout(() => button.classList.remove('ome-boundary'), 300);
        }
    }

    /**
     * 🎨 Apply theme to orb (swaps SVG content)
     * @param {string} themeName - Theme key from ORB_THEMES
     */
    function applyOrbTheme(themeName) {
        const theme = ORB_THEMES[themeName] || ORB_THEMES.minimal;
        if (!hudState.orb) return;

        // Release any active dragging first
        if (hudState.dragging) {
            hudState.dragging = false;
            hudState.orb.classList.remove('holding');
        }

        // Build controls HTML - menu + scroll gearstick (right) + zoom controls (bottom)
        // 🎚️ Scroll gear: top/bottom jump buttons + centre gear for variable scroll
        const scrollHTML = `
            <div class="ome-scroll-controls" style="color: ${theme.color}">
                <button class="ome-menu-btn">HUD</button>
                <button class="ome-ctrl-btn ome-scroll-top" title="Scroll to top">
                    <svg viewBox="0 0 24 24"><polyline points="18 11 12 5 6 11"/><polyline points="18 19 12 13 6 19"/></svg>
                </button>
                <button class="ome-gear-btn" title="Drag to scroll">
                    <svg viewBox="0 0 24 24"><polyline points="17 8 12 3 7 8"/><polyline points="7 16 12 21 17 16"/></svg>
                </button>
                <button class="ome-ctrl-btn ome-scroll-bottom" title="Scroll to bottom">
                    <svg viewBox="0 0 24 24"><polyline points="6 5 12 11 18 5"/><polyline points="6 13 12 19 18 13"/></svg>
                </button>
            </div>`;
        const zoomHTML = `
            <div class="ome-zoom-controls" style="color: ${theme.color}">
                <button class="ome-ctrl-btn ome-zoom-in">+</button>
                <span class="ome-zoom-label ome-zoom-reset">Z</span>
                <button class="ome-ctrl-btn ome-zoom-out">−</button>
            </div>`;

        // 💬 Prompt button (opens chat panel)
        const promptHTML = `
            <button class="ome-prompt-btn" style="color: ${theme.color}">Open Prompt</button>`;

        // 💬 Chat panel (anchored to orb) - with resize handles and theme
        const chatPanelHTML = `
            <div class="ome-chat-panel" data-theme="${themeName}">
                <div class="ome-resize-handle ome-resize-n" data-resize="n"></div>
                <div class="ome-resize-handle ome-resize-s" data-resize="s"></div>
                <div class="ome-resize-handle ome-resize-e" data-resize="e"></div>
                <div class="ome-resize-handle ome-resize-w" data-resize="w"></div>
                <div class="ome-resize-handle ome-resize-nw" data-resize="nw"></div>
                <div class="ome-resize-handle ome-resize-ne" data-resize="ne"></div>
                <div class="ome-resize-handle ome-resize-sw" data-resize="sw"></div>
                <div class="ome-resize-handle ome-resize-se" data-resize="se"></div>
                <div class="ome-chat-messages">
                    <!-- Messages loaded from chat file -->
                </div>
                <div class="ome-chat-input-area">
                    <div class="ome-chat-input-wrapper">
                        <textarea class="ome-chat-input" placeholder="Ask me anything..." rows="1"></textarea>
                    </div>
                    <button class="ome-chat-send" title="Send message">
                        <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                </div>
            </div>`;

        // 🔮 Wrap SVG in drag indicator wrapper with 4 directional arrows (theme colored)
        const orbWrapperHTML = `
            <div class="ome-orb-wrapper" style="color: ${theme.color}">
                ${theme.svg}
                ${theme.paws}
                <div class="ome-orb-drag-indicator ome-orb-drag-up"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                <div class="ome-orb-drag-indicator ome-orb-drag-down"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
                <div class="ome-orb-drag-indicator ome-orb-drag-left"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
                <div class="ome-orb-drag-indicator ome-orb-drag-right"><svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg></div>
            </div>`;
        // Update orb content (wrapper + scroll + prompt + zoom + chat panel)
        hudState.orb.innerHTML = orbWrapperHTML + scrollHTML + promptHTML + zoomHTML + chatPanelHTML;
        hudState.theme = themeName;

        // 🔮 Also update HUD orb display if HUD exists
        if (hudState.hud) {
            updateHUDOrb(hudState.hud, themeName);
        }

        // ⬆️⬇️ Re-attach scroll top/bottom button handlers
        hudState.orb.querySelector('.ome-scroll-top')?.addEventListener('click', (e) => {
            e.stopPropagation();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        hudState.orb.querySelector('.ome-scroll-bottom')?.addEventListener('click', (e) => {
            e.stopPropagation();
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        });

        // ⚙️ Re-attach gear button handlers
        const gearBtn = hudState.orb.querySelector('.ome-gear-btn');
        if (gearBtn) {
            let gearEngaged = false;
            let engageY = 0;
            let engageX = 0;
            let scrollAnimationId = null;
            let currentOffset = 0;

            const SENSITIVITY = 0.2;
            const DISENGAGE_X = 50;

            function scrollLoop() {
                if (!gearEngaged) {
                    scrollAnimationId = null;
                    return;
                }
                if (Math.abs(currentOffset) > 2) {
                    const scrollSpeed = currentOffset * SENSITIVITY;
                    const scrollY = window.scrollY;
                    const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
                    const atTop = scrollY <= 0 && scrollSpeed < 0;
                    const atBottom = scrollY >= maxScrollY && scrollSpeed > 0;
                    if (atTop || atBottom) {
                        gearBtn.classList.add('boundary');
                        setTimeout(() => gearBtn.classList.remove('boundary'), 300);
                    } else {
                        window.scrollBy(0, scrollSpeed);
                    }
                }
                scrollAnimationId = requestAnimationFrame(scrollLoop);
            }

            function engageGear(e) {
                if (gearEngaged) {
                    disengageGear();
                    return;
                }
                gearEngaged = true;
                engageY = e.clientY;
                engageX = e.clientX;
                currentOffset = 0;
                gearBtn.classList.add('engaged');
                if (!scrollAnimationId) {
                    scrollAnimationId = requestAnimationFrame(scrollLoop);
                }
                document.addEventListener('mousemove', handleGearMove);
                // Any click anywhere disengages
                setTimeout(() => document.addEventListener('click', handleGearClick, true), 0);
            }

            function handleGearClick(e) {
                // If click is on the gear button itself, let the button handler handle it
                if (e.target === gearBtn || gearBtn.contains(e.target)) {
                    return;
                }
                // 🛡️ Consume this click entirely - don't let it trigger other elements
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                disengageGear();
                console.log('[HUD] ⚙️ Gear disengage - click consumed (theme handler)');
            }

            function disengageGear() {
                if (!gearEngaged) return;
                gearEngaged = false;
                currentOffset = 0;
                gearBtn.classList.remove('engaged', 'scrolling-up', 'scrolling-down');
                document.removeEventListener('click', handleGearClick, true);
                if (scrollAnimationId) {
                    cancelAnimationFrame(scrollAnimationId);
                    scrollAnimationId = null;
                }
                document.removeEventListener('mousemove', handleGearMove);
                console.log('[HUD] ⚙️ Gear disengaged (theme handler)');
            }

            function handleGearMove(e) {
                if (!gearEngaged) return;
                const deltaX = Math.abs(e.clientX - engageX);
                if (deltaX > DISENGAGE_X) {
                    disengageGear();
                    return;
                }
                const deltaY = e.clientY - engageY;
                currentOffset = Math.max(-60, Math.min(60, deltaY));
                gearBtn.classList.toggle('scrolling-up', currentOffset < -5);
                gearBtn.classList.toggle('scrolling-down', currentOffset > 5);
            }

            gearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle: if engaged, disengage. If not, engage.
                if (gearEngaged) {
                    disengageGear();
                } else {
                    engageGear(e);
                }
            });
        }

        // 📋 Re-attach menu button handler (toggles HUD)
        hudState.orb.querySelector('.ome-menu-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHUD();
        });

        // Re-attach zoom button handlers
        hudState.orb.querySelector('.ome-zoom-in')?.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'execute_capability', action: 'ZoomIn', params: {} });
        });
        hudState.orb.querySelector('.ome-zoom-out')?.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'execute_capability', action: 'ZoomOut', params: {} });
        });
        hudState.orb.querySelector('.ome-zoom-reset')?.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'execute_capability', action: 'ZoomReset', params: {} });
        });

        // 💬 Re-attach prompt button handler
        hudState.orb.querySelector('.ome-prompt-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChatPanel();
        });

        // 💬 Re-attach chat panel reference and handlers
        const chatPanel = hudState.orb.querySelector('.ome-chat-panel');
        if (chatPanel) {
            hudState.chatPanel = chatPanel;
            chatPanel.addEventListener('click', (e) => e.stopPropagation());
            // Restore visibility state if was open
            if (hudState.chatVisible) {
                chatPanel.classList.add('visible');
                const promptBtn = hudState.orb.querySelector('.ome-prompt-btn');
                if (promptBtn) {
                    promptBtn.classList.add('active');
                    promptBtn.textContent = 'HIDE PROMPT';
                }
                constrainChatPanelToViewport(); // Ensure panel fits viewport
            }

            // 💬 Chat input setup (textarea with auto-resize)
            const chatInput = chatPanel.querySelector('.ome-chat-input');
            const chatSendBtn = chatPanel.querySelector('.ome-chat-send');
            const chatClearBtn = chatPanel.querySelector('.ome-chat-clear');

            // 📐 Auto-resize textarea as user types (expands up to 400px)
            function autoResizeOrbInput() {
                if (!chatInput) return;
                chatInput.style.height = '48px';
                const scrollH = chatInput.scrollHeight;
                const newHeight = Math.max(48, Math.min(scrollH, 400));
                chatInput.style.height = newHeight + 'px';
                chatInput.style.overflowY = scrollH > 400 ? 'auto' : 'hidden';
            }

            if (chatInput) {
                // 💾 Auto-resize on input (save only on blur to reduce overhead)
                chatInput.addEventListener('input', () => {
                    autoResizeOrbInput();
                });

                // 🎯 Keep guard in sync with user actions
                chatInput.addEventListener('focusin', () => {
                    hudState.userBlurRequested = false;
                    focusOrbInputGuard(true);
                });

                // 💾 Save input on blur only (persists across navigation)
                chatInput.addEventListener('blur', () => {
                    saveChatInput(chatInput.value);
                });
                chatPanel.addEventListener('pointerdown', () => {
                    hudState.userBlurRequested = false;
                }, true);

                // 💬 Restore chat input value after theme change
                try {
                    chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                        if (response?.ok && response.chatInput) {
                            chatInput.value = response.chatInput;
                            autoResizeOrbInput();
                        }
                    });
                } catch (e) {
                    console.warn('[Content] Could not restore chat input:', e);
                }

                // Initial sizing
                autoResizeOrbInput();

                // 💬 Re-render chat messages after theme change
                renderChatMessages();

                // 📐 ResizeObserver to auto-resize when panel width changes
                const orbResizeObserver = new ResizeObserver(() => {
                    autoResizeOrbInput();
                });
                orbResizeObserver.observe(chatPanel);
            }

            // 💬 Send button handler - same pipeline as HUD
            if (chatSendBtn && chatInput) {
                const handleOrbSend = async () => {
                    const text = chatInput.value.trim();
                    if (!text) return;

                    // ⏱️ TIMING: Track full submit flow
                    const t0 = performance.now();
                    console.log(`[Content] ⏱️ SUBMIT START: "${text.substring(0, 30)}..."`);

                    // Clear input, reset size, and saved state
                    chatInput.value = '';
                    autoResizeOrbInput();
                    saveChatInput('');

                    // 📬 Immediately display user message in chat
                    addChatMessage('user', text);

                    // Send through chat pipeline (LLMChat now saves user message + gets response)
                    try {
                        // 🧪 EXPERIMENT: Trigger scan before LLM submission
                        const t1 = performance.now();
                        const scanResult = await triggerScanAndWait();
                        const t2 = performance.now();
                        console.log(`[Content] ⏱️ ScanAndWait: ${Math.round(t2 - t1)}ms (${scanResult?.skipped ? 'skipped' : scanResult?.timeout ? 'timeout' : 'scanned'})`);

                        // Send to LLM (saves user msg + processes + saves response)
                        const llmResult = await sendLLMChat(text);
                        const t3 = performance.now();
                        console.log(`[Content] ⏱️ LLMChat: ${Math.round(t3 - t2)}ms`);
                        console.log(`[Content] ⏱️ SUBMIT TOTAL: ${Math.round(t3 - t0)}ms`);

                        // 📬 Display assistant response
                        if (llmResult?.response) {
                            addChatMessage('assistant', llmResult.response);
                        }

                        // 🚨 Check for capability execution errors
                        if (llmResult?.capability_results?.length) {
                            for (const capRes of llmResult.capability_results) {
                                if (capRes.result?.error) {
                                    console.error('[Content] ❌ Capability error:', capRes.action, capRes.result.error);
                                    addChatMessage('error', `${capRes.action} failed: ${capRes.result.error}`);
                                }
                            }
                        }

                    } catch (error) {
                        console.error('[Content] ❌ Orb chat send failed:', error);
                        addChatMessage('error', 'Failed to send message');
                    }

                    // 🎯 Always refocus input after send (success or error)
                    hudState.userBlurRequested = false;
                    chatInput.focus();
                };

                chatSendBtn.addEventListener('click', handleOrbSend);

                // Enter to send (Shift+Enter for new line)
                chatInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleOrbSend();
                    }
                });
            }

            // 📐 Setup resize handlers for chat panel
            setupChatPanelResize(chatPanel);
        }

        // Update theme selector active state if HUD exists
        if (hudState.hud) {
            hudState.hud.querySelectorAll('.ome-theme-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === themeName);
            });
        }

        console.log(`[Content] 🎨 Orb theme: ${themeName}`);
    }

    /**
     * 🔮 Create floating orb
     * @param {ShadowRoot} shadow
     * @returns {HTMLElement}
     */
    function createOrb(shadow) {
        const orb = document.createElement('div');
        orb.className = 'ome-orb';

        // 🎨 Use theme system - get SVG from registry
        const theme = ORB_THEMES[hudState.theme] || ORB_THEMES.minimal;

        // Build controls HTML - menu + scroll gearstick (right) + zoom controls (bottom)
        // 🎚️ Scroll gear: top/bottom jump buttons + centre gear for variable scroll
        const scrollHTML = `
            <div class="ome-scroll-controls" style="color: ${theme.color}">
                <button class="ome-menu-btn">HUD</button>
                <button class="ome-ctrl-btn ome-scroll-top" title="Scroll to top">
                    <svg viewBox="0 0 24 24"><polyline points="18 11 12 5 6 11"/><polyline points="18 19 12 13 6 19"/></svg>
                </button>
                <button class="ome-gear-btn" title="Drag to scroll">
                    <svg viewBox="0 0 24 24"><polyline points="17 8 12 3 7 8"/><polyline points="7 16 12 21 17 16"/></svg>
                </button>
                <button class="ome-ctrl-btn ome-scroll-bottom" title="Scroll to bottom">
                    <svg viewBox="0 0 24 24"><polyline points="6 5 12 11 18 5"/><polyline points="6 13 12 19 18 13"/></svg>
                </button>
            </div>`;
        const zoomHTML = `
            <div class="ome-zoom-controls" style="color: ${theme.color}">
                <button class="ome-ctrl-btn ome-zoom-in">+</button>
                <span class="ome-zoom-label ome-zoom-reset">Z</span>
                <button class="ome-ctrl-btn ome-zoom-out">−</button>
            </div>`;

        // 💬 Prompt button (opens chat panel)
        const promptHTML = `
            <button class="ome-prompt-btn" style="color: ${theme.color}">Open Prompt</button>`;

        // 💬 Chat panel (anchored to orb) - with resize handles
        const chatPanelHTML = `
            <div class="ome-chat-panel" data-theme="${hudState.theme}">
                <div class="ome-resize-handle ome-resize-n" data-resize="n"></div>
                <div class="ome-resize-handle ome-resize-s" data-resize="s"></div>
                <div class="ome-resize-handle ome-resize-e" data-resize="e"></div>
                <div class="ome-resize-handle ome-resize-w" data-resize="w"></div>
                <div class="ome-resize-handle ome-resize-nw" data-resize="nw"></div>
                <div class="ome-resize-handle ome-resize-ne" data-resize="ne"></div>
                <div class="ome-resize-handle ome-resize-sw" data-resize="sw"></div>
                <div class="ome-resize-handle ome-resize-se" data-resize="se"></div>
                <div class="ome-chat-messages">
                    <!-- Messages loaded from chat file -->
                </div>
                <div class="ome-chat-input-area">
                    <div class="ome-chat-input-wrapper">
                        <textarea class="ome-chat-input" placeholder="Ask me anything..." rows="1"></textarea>
                    </div>
                    <button class="ome-chat-send" title="Send message">
                        <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                </div>
            </div>`;

        // 🔮 Wrap SVG in drag indicator wrapper with 4 directional arrows (theme colored)
        const orbWrapperHTML = `
            <div class="ome-orb-wrapper" style="color: ${theme.color}">
                ${theme.svg}
                ${theme.paws}
                <div class="ome-orb-drag-indicator ome-orb-drag-up"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                <div class="ome-orb-drag-indicator ome-orb-drag-down"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
                <div class="ome-orb-drag-indicator ome-orb-drag-left"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
                <div class="ome-orb-drag-indicator ome-orb-drag-right"><svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg></div>
            </div>`;
        orb.innerHTML = orbWrapperHTML + scrollHTML + promptHTML + zoomHTML + chatPanelHTML;

        // 🐰 Track holding state (use hudState so all handlers can access)
        let followHandler = null;

        /**
         * Release the bunny from follow mode and save position
         */
        function releaseOrb() {
            if (!hudState.dragging) return;
            hudState.dragging = false;
            orb.classList.remove('holding');
            document.removeEventListener('mousemove', followHandler);
            followHandler = null;

            // 💾 Save position when released (convert to percentages)
            const orbRect = orb.getBoundingClientRect();
            const hostRect = hudState.host.getBoundingClientRect();
            // Calculate percentage from right and bottom of our canvas
            const rightPct = ((hostRect.right - orbRect.right) / hostRect.width) * 100;
            const bottomPct = ((hostRect.bottom - orbRect.bottom) / hostRect.height) * 100;
            // Reset to percentage positioning for consistency
            orb.style.left = 'auto';
            orb.style.top = 'auto';
            orb.style.right = `${Math.max(0, rightPct)}%`;
            orb.style.bottom = `${Math.max(0, bottomPct)}%`;

            // 💾 Save position to service worker
            saveOrbPosition(Math.max(0, rightPct), Math.max(0, bottomPct));

            // 📐 Ensure orb stays within viewport bounds after release
            constrainOrbToViewport();
        }

        /**
         * Start follow mode - bunny follows cursor
         * Uses left/top during drag for smooth tracking, converts to right/bottom on release
         */
        function startFollowing() {
            if (hudState.dragging) return;
            hudState.dragging = true;
            orb.classList.add('holding');
            followHandler = (e) => {
                // Use left/top during active drag for smooth cursor tracking
                orb.style.right = 'auto';
                orb.style.bottom = 'auto';
                orb.style.left = `${e.clientX - 30}px`;
                orb.style.top = `${e.clientY - 40}px`;
            };
            document.addEventListener('mousemove', followHandler);
        }

        // ⬆️⬇️ Scroll top/bottom buttons (instant jump)
        orb.querySelector('.ome-scroll-top')?.addEventListener('click', (e) => {
            e.stopPropagation();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        orb.querySelector('.ome-scroll-bottom')?.addEventListener('click', (e) => {
            e.stopPropagation();
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        });

        // ⚙️ Gear button - click to engage, vertical movement = scroll speed
        const gearBtn = orb.querySelector('.ome-gear-btn');
        if (gearBtn) {
            let gearEngaged = false;
            let engageY = 0;
            let engageX = 0;
            let scrollAnimationId = null;
            let currentOffset = 0;

            const SENSITIVITY = 0.2;
            const DISENGAGE_X = 50;

            function scrollLoop() {
                if (!gearEngaged) {
                    scrollAnimationId = null;
                    return;
                }
                if (Math.abs(currentOffset) > 2) {
                    const scrollSpeed = currentOffset * SENSITIVITY;
                    const scrollY = window.scrollY;
                    const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
                    const atTop = scrollY <= 0 && scrollSpeed < 0;
                    const atBottom = scrollY >= maxScrollY && scrollSpeed > 0;
                    if (atTop || atBottom) {
                        gearBtn.classList.add('boundary');
                        setTimeout(() => gearBtn.classList.remove('boundary'), 300);
                    } else {
                        window.scrollBy(0, scrollSpeed);
                    }
                }
                scrollAnimationId = requestAnimationFrame(scrollLoop);
            }

            function engageGear(e) {
                if (gearEngaged) {
                    disengageGear();
                    return;
                }
                gearEngaged = true;
                engageY = e.clientY;
                engageX = e.clientX;
                currentOffset = 0;
                gearBtn.classList.add('engaged');
                if (!scrollAnimationId) {
                    scrollAnimationId = requestAnimationFrame(scrollLoop);
                }
                document.addEventListener('mousemove', handleGearMove);
                // Any click anywhere disengages
                setTimeout(() => document.addEventListener('click', handleGearClick, true), 0);
                console.log('[HUD] ⚙️ Gear engaged');
            }

            function disengageGear() {
                if (!gearEngaged) return;
                gearEngaged = false;
                currentOffset = 0;
                gearBtn.classList.remove('engaged', 'scrolling-up', 'scrolling-down');
                if (scrollAnimationId) {
                    cancelAnimationFrame(scrollAnimationId);
                    scrollAnimationId = null;
                }
                document.removeEventListener('mousemove', handleGearMove);
                document.removeEventListener('click', handleGearClick, true);
                console.log('[HUD] ⚙️ Gear disengaged');
            }

            function handleGearClick(e) {
                // If click is on the gear button itself, let the button handler handle it
                if (e.target === gearBtn || gearBtn.contains(e.target)) {
                    return;
                }
                // 🛡️ Consume this click entirely - don't let it trigger other elements
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                disengageGear();
                console.log('[HUD] ⚙️ Gear disengage - click consumed');
            }

            function handleGearMove(e) {
                if (!gearEngaged) return;
                const deltaX = Math.abs(e.clientX - engageX);
                if (deltaX > DISENGAGE_X) {
                    disengageGear();
                    return;
                }
                const deltaY = e.clientY - engageY;
                currentOffset = Math.max(-60, Math.min(60, deltaY));
                gearBtn.classList.toggle('scrolling-up', currentOffset < -5);
                gearBtn.classList.toggle('scrolling-down', currentOffset > 5);
            }

            gearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle: if engaged, disengage. If not, engage.
                if (gearEngaged) {
                    disengageGear();
                } else {
                    engageGear(e);
                }
            });
        }

        // 📋 Menu button handler (toggles HUD)
        orb.querySelector('.ome-menu-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHUD();
        });

        // 🔍 Zoom button handlers (send to service worker)
        orb.querySelector('.ome-zoom-in')?.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'execute_capability', action: 'ZoomIn', params: {} });
        });
        orb.querySelector('.ome-zoom-out')?.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'execute_capability', action: 'ZoomOut', params: {} });
        });
        orb.querySelector('.ome-zoom-reset')?.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'execute_capability', action: 'ZoomReset', params: {} });
        });

        // 💬 Prompt button handler (opens chat panel)
        orb.querySelector('.ome-prompt-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChatPanel();
        });

        // 💬 Store chat panel reference and set up its handlers
        const chatPanel = orb.querySelector('.ome-chat-panel');
        if (chatPanel) {
            hudState.chatPanel = chatPanel;
            // 💬 Open chat panel by default if chatVisible is true
            if (hudState.chatVisible) {
                chatPanel.classList.add('visible');
                const promptBtn = orb.querySelector('.ome-prompt-btn');
                if (promptBtn) {
                    promptBtn.classList.add('active');
                    promptBtn.textContent = 'HIDE PROMPT';
                }
            }
            // Prevent clicks inside panel from bubbling to orb
            chatPanel.addEventListener('click', (e) => e.stopPropagation());
            // Close panel on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && hudState.chatVisible) toggleChatPanel();
            });

            // 💬 Live typing preview - updates as you type
            const chatInput = chatPanel.querySelector('.ome-chat-input');
            const typingPreview = chatPanel.querySelector('.typing-preview');
            if (chatInput && typingPreview) {
                chatInput.addEventListener('input', () => {
                    typingPreview.textContent = chatInput.value;
                    // Auto-scroll messages to bottom to keep preview visible
                    const messagesArea = chatPanel.querySelector('.ome-chat-messages');
                    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
                });

                // 💾 Save input on blur only (persists across navigation)
                chatInput.addEventListener('blur', () => {
                    saveChatInput(chatInput.value);
                });

                // 💬 Restore chat input value and active chat on initial load
                try {
                    chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                        if (response?.ok) {
                            // Restore input value
                            if (response.chatInput) {
                                chatInput.value = response.chatInput;
                                typingPreview.textContent = response.chatInput;
                            }
                            // 💬 Load active chat if one exists and different from current
                            if (response.activeChatId && response.activeChatId !== chatState.currentChatId) {
                                chatState.currentChatId = response.activeChatId;
                                loadChat(response.activeChatId);
                            }
                            // 🎯 FOCUS: Handled by 'ome-focus-orb-input' event after scan completes
                        }
                    });
                } catch (e) {
                    console.warn('[Content] Could not restore chat input:', e);
                }
            }

            // 📐 Setup resize handlers for chat panel
            setupChatPanelResize(chatPanel);
        }

        // 🐰 Body click: toggle follow mode (ears/goggles now included, but NOT on scroll/zoom/prompt/chat)
        orb.addEventListener('click', (e) => {
            e.stopPropagation();
            // If click was on control element, their handlers already handled it
            if (e.target.closest('.ome-scroll-controls') ||
                e.target.closest('.ome-zoom-controls') ||
                e.target.closest('.ome-prompt-btn') ||
                e.target.closest('.ome-chat-panel')) return;

            if (hudState.dragging) {
                releaseOrb();
            } else {
                startFollowing();
            }
        });

        shadow.appendChild(orb);
        return orb;
    }

    /**
     * 📺 Create HUD overlay
     * @param {ShadowRoot} shadow
     * @returns {HTMLElement}
     */
    function createHUD(shadow) {
        const hud = document.createElement('div');
        hud.className = 'ome-hud';
        hud.dataset.theme = hudState.theme || 'atom';  // Apply theme colors

        // Get current theme SVG for orb display
        const currentTheme = ORB_THEMES[hudState.theme] || ORB_THEMES.robot;

        hud.innerHTML = `
            <!-- 🔝 Top Bar - ChatGPT style header -->
            <div class="ome-hud-topbar">
                <div class="ome-hud-topbar-left">
                    <div class="ome-sidebar-trigger ome-sidebar-toggle">
                        <div class="ome-mini-orb-wrapper">
                            ${currentTheme.svg.replace('ome-bunny', 'ome-mini-orb')}
                        </div>
                        <svg class="ome-mini-arrow" viewBox="0 0 24 24" fill="none">
                            <polyline points="9 6 15 12 9 18" stroke="var(--text-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                </div>
                <div class="ome-hud-topbar-right">
                    <button class="ome-hud-topbar-btn ome-hud-close">
                        <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                    </button>
                </div>
            </div>

            <!-- 📦 Content Area - sidebar + main -->
            <div class="ome-hud-content">
                <!-- 📚 Sidebar Panel -->
                <div class="ome-sidebar">
                    <div class="ome-sidebar-header">
                        <div class="ome-sidebar-orb-trigger ome-sidebar-close">
                            <svg class="ome-sidebar-arrow" viewBox="0 0 24 24" fill="none">
                                <polyline points="15 6 9 12 15 18" stroke="var(--text-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <div class="ome-sidebar-orb-wrapper">
                                ${currentTheme.svg.replace('ome-bunny', 'ome-sidebar-orb')}
                            </div>
                        </div>
                    </div>
                    <div class="ome-sidebar-content">
                        <div class="ome-sidebar-new-chat"><span class="plus"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span><span class="text">New Chat</span></div>
                        <div class="ome-sidebar-new-chat-placeholder"></div>
                        <div class="ome-sidebar-search"><span class="icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><span class="text">Search Chats</span></div>
                        <div class="ome-sidebar-search-box"></div>
                        <div class="ome-sidebar-label expanded"><span class="arrow arrow-left"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></span><span class="label-text-collapsed">Show Chats</span><span class="label-text-expanded">Hide Chats</span><span class="arrow arrow-right"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></span></div>
                        <div class="ome-sidebar-chat-list">
                            <div class="ome-sidebar-empty">No chats yet</div>
                        </div>
                    </div>
                    <div class="ome-sidebar-footer">
                        <div class="ome-settings-orb-container">
                            <div class="ome-settings-orb">
                                <svg viewBox="0 0 32 32">
                                    <!-- Chrome-style spinning segments -->
                                    <circle class="segment seg1" cx="16" cy="16" r="12" stroke-dasharray="19 57" stroke-dashoffset="0"/>
                                    <circle class="segment seg2" cx="16" cy="16" r="12" stroke-dasharray="19 57" stroke-dashoffset="-25"/>
                                    <circle class="segment seg3" cx="16" cy="16" r="12" stroke-dasharray="19 57" stroke-dashoffset="-50"/>
                                    <!-- Center dot -->
                                    <circle class="center-dot" cx="16" cy="16" r="4"/>
                                </svg>
                            </div>
                        </div>
                        <!-- Settings Panel -->
                        <div class="ome-settings-panel">
                            <h3>LLM Settings</h3>
                            <div class="ome-settings-group">
                                <label>Provider</label>
                                <select class="ome-settings-provider">
                                    <option value="lm_studio">LM Studio (Local)</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic</option>
                                </select>
                            </div>
                            <div class="ome-settings-group">
                                <label>Endpoint</label>
                                <input type="text" class="ome-settings-endpoint" placeholder="http://localhost:1234/v1/chat/completions">
                            </div>
                            <div class="ome-settings-group">
                                <label>Model</label>
                                <div class="ome-settings-model-wrapper">
                                    <select class="ome-settings-model-select">
                                        <option value="">Select a model...</option>
                                    </select>
                                    <input type="text" class="ome-settings-model-custom" placeholder="Custom model ID..." style="display: none;">
                                </div>
                            </div>
                            <div class="ome-settings-group">
                                <label>API Key</label>
                                <input type="password" class="ome-settings-apikey" placeholder="sk-... or $ENV_VAR">
                            </div>
                            <div class="ome-settings-row">
                                <div class="ome-settings-group">
                                    <label>Temperature</label>
                                    <input type="number" class="ome-settings-temperature" min="0" max="2" step="0.1" value="0.7">
                                </div>
                                <div class="ome-settings-group">
                                    <label>Max Tokens</label>
                                    <input type="number" class="ome-settings-max-tokens" min="1" max="128000" value="2048">
                                </div>
                            </div>
                            <div class="ome-settings-row">
                                <div class="ome-settings-group">
                                    <label>Cap Score</label>
                                    <input type="number" class="ome-settings-cap-score" min="0" max="1" step="0.05" value="0.45" title="RAG confidence threshold - below this, no capabilities shown (saves tokens)">
                                </div>
                                <div class="ome-settings-group">
                                    <label>Session Actions</label>
                                    <input type="number" class="ome-settings-session-actions" min="5" max="50" step="1" value="20" title="Rolling limit for session-wide action history (cross-chat bridge)">
                                </div>
                            </div>
                            <div class="ome-settings-row">
                                <div class="ome-settings-group">
                                    <label>Large Payload</label>
                                    <input type="number" class="ome-settings-large-payload" min="100" max="5000" step="50" value="500" title="Char threshold for large content - above this is summarised and indexed to session vector">
                                </div>
                                <div class="ome-settings-group">
                                    <button class="ome-clear-session" title="Clear session content vector (large content summaries)">Clear Session</button>
                                </div>
                            </div>
                            <button class="ome-settings-save">Save Settings</button>
                            <div class="ome-settings-status"></div>
                        </div>
                    </div>
                </div>

                <!-- 🎯 Main Area - messages + input -->
                <div class="ome-hud-main">
                    <!-- 💬 Messages Area - scrollbar at far right, content centered -->
                    <div class="ome-hud-messages-area">
                        <div class="ome-hud-messages-flex">
                            <div class="ome-hud-messages-scroll">
                                <div class="ome-hud-messages-content"></div>
                            </div>
                            <div class="ome-hud-messages-spacer-orb"></div>
                            <div class="ome-hud-messages-spacer-scroll"></div>
                        </div>
                    </div>

                    <!-- 🛤️ Rail - vertical track for sliding -->
                    <div class="ome-hud-rail"></div>

                    <!-- 💬 Input Area - YOUR OME prompt unit (slidable) -->
                    <div class="ome-hud-input-area">
                        <div class="ome-hud-prompt-wrapper">
                            <div class="ome-hud-prompt">
                                <textarea class="ome-hud-prompt-textarea" placeholder="Ask me anything..." rows="1"></textarea>
                                <div class="ome-hud-prompt-actions">
                                    <button class="ome-hud-clear-btn" title="Clear prompt">
                                        <svg viewBox="0 0 24 24">
                                            <!-- Alien X - angular Annunaki style -->
                                            <line x1="6" y1="6" x2="18" y2="18"/>
                                            <line x1="18" y1="6" x2="6" y2="18"/>
                                            <line x1="12" y1="3" x2="12" y2="7"/>
                                            <line x1="12" y1="17" x2="12" y2="21"/>
                                            <line x1="3" y1="12" x2="7" y2="12"/>
                                            <line x1="17" y1="12" x2="21" y2="12"/>
                                        </svg>
                                    </button>
                                    <button class="ome-hud-send-btn" title="Send">
                                        <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- 🔮 Current Orb Display with drag indicators -->
                        <div class="ome-hud-orb-container">
                            <div class="ome-hud-orb-wrapper">
                                <div class="ome-hud-orb" data-theme="${hudState.theme}">
                                    ${currentTheme.svg}
                                </div>
                                <div class="ome-hud-drag-indicator ome-hud-drag-up"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                                <div class="ome-hud-drag-indicator ome-hud-drag-down"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>
                                <!-- 🔍 Scan mode converging arrows (6 directions - no N/S to avoid drag indicator clash) -->
                                <div class="ome-hud-scan-arrow ome-hud-scan-arrow-ne"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                                <div class="ome-hud-scan-arrow ome-hud-scan-arrow-e"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                                <div class="ome-hud-scan-arrow ome-hud-scan-arrow-se"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                                <div class="ome-hud-scan-arrow ome-hud-scan-arrow-sw"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                                <div class="ome-hud-scan-arrow ome-hud-scan-arrow-w"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                                <div class="ome-hud-scan-arrow ome-hud-scan-arrow-nw"><svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg></div>
                            </div>
                            <button class="ome-hud-prompt-btn active" style="color: ${currentTheme.color}">HIDE PROMPT</button>
                            <!-- 🔍 HUD Zoom Controls - text size for messages -->
                            <div class="ome-hud-zoom">
                                <button class="ome-hud-ctrl-btn ome-hud-zoom-in" title="Increase text size">+</button>
                                <span class="ome-hud-zoom-label ome-hud-zoom-reset" title="Reset text size">T</span>
                                <button class="ome-hud-ctrl-btn ome-hud-zoom-out" title="Decrease text size">−</button>
                            </div>
                        </div>

                        <!-- 🎮 HUD Scroll Controls - gear stick for messages -->
                        <div class="ome-hud-scroll">
                            <button class="ome-hud-menu-btn ome-hud-orb-btn">ORB</button>
                            <button class="ome-hud-ctrl-btn ome-hud-scroll-top" title="Scroll to top">
                                <svg viewBox="0 0 24 24"><polyline points="18 11 12 5 6 11"/><polyline points="18 19 12 13 6 19"/></svg>
                            </button>
                            <button class="ome-hud-gear-btn" title="Drag to scroll">
                                <svg viewBox="0 0 24 24"><polyline points="17 8 12 3 7 8"/><polyline points="7 16 12 21 17 16"/></svg>
                            </button>
                            <button class="ome-hud-ctrl-btn ome-hud-scroll-bottom" title="Scroll to bottom">
                                <svg viewBox="0 0 24 24"><polyline points="6 5 12 11 18 5"/><polyline points="6 13 12 19 18 13"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 🛡️ Block events from escaping HUD to underlying page (bubbling phase, NOT capture)
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(eventType => {
            hud.addEventListener(eventType, (e) => {
                e.stopPropagation();
            }, false);  // bubbling phase - lets internal button clicks work first
        });

        // Close button handler
        hud.querySelector('.ome-hud-close').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHUD();
        });

        // 📚 Sidebar toggle button handler
        const sidebarToggle = hud.querySelector('.ome-sidebar-toggle');
        const sidebar = hud.querySelector('.ome-sidebar');
        hudState.sidebar = sidebar;

        sidebarToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });

        // 📚 Sidebar close button handler (orb trigger in sidebar header)
        hud.querySelector('.ome-sidebar-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar(false);
        });

        // 📚 New Chat link handler (toggle behavior)
        hud.querySelector('.ome-sidebar-new-chat')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const textSpan = btn.querySelector('.text');
            const placeholderContainer = hud.querySelector('.ome-sidebar-new-chat-placeholder');
            const hasPlaceholder = placeholderContainer?.children.length > 0;

            if (hasPlaceholder) {
                // Close: remove placeholder and reset button
                removeNewChatPlaceholder();
                btn.classList.remove('active');
                if (textSpan) textSpan.textContent = 'New Chat';
                // Clear pending state
                chatState.pendingTitle = null;
            } else {
                // Open: spin the + sign and start new chat
                const plus = btn.querySelector('.plus');
                if (plus) {
                    plus.classList.remove('spinning');
                    void plus.offsetWidth; // Force reflow to restart animation
                    plus.classList.add('spinning');
                }
                btn.classList.add('active');
                if (textSpan) textSpan.textContent = 'Close New Chat';
                startNewChat();
            }
        });

        // 🔍 Search Chats toggle handler
        hud.querySelector('.ome-sidebar-search')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const searchBtn = e.currentTarget;
            const textSpan = searchBtn.querySelector('.text');
            const searchBox = hud.querySelector('.ome-sidebar-search-box');
            const isExpanded = searchBox?.classList.contains('expanded');

            if (isExpanded) {
                // Close search
                searchBox.classList.remove('expanded');
                searchBtn.classList.remove('active');
                if (textSpan) textSpan.textContent = 'Search Chats';
                searchBox.innerHTML = '';
                filterSidebarChats(''); // Reset filter
            } else {
                // Open search - create input
                searchBtn.classList.add('active');
                if (textSpan) textSpan.textContent = 'Close Search Chats';
                searchBox.classList.add('expanded');
                searchBox.innerHTML = `<input type="text" class="ome-sidebar-search-input" placeholder="Search chats..." />`;
                const input = searchBox.querySelector('.ome-sidebar-search-input');
                input?.focus();

                // Handle search input
                input?.addEventListener('input', (ev) => {
                    const query = ev.target.value.trim().toLowerCase();
                    filterSidebarChats(query);
                });

                // Close on Escape
                input?.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Escape') {
                        searchBox.classList.remove('expanded');
                        searchBtn.classList.remove('active');
                        if (textSpan) textSpan.textContent = 'Search Chats';
                        searchBox.innerHTML = '';
                        filterSidebarChats(''); // Reset filter
                    }
                });
            }
        });

        // 📚 Show Chats label toggle handler
        hud.querySelector('.ome-sidebar-label')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const label = e.currentTarget;
            const chatList = hud.querySelector('.ome-sidebar-chat-list');
            if (label && chatList) {
                label.classList.toggle('expanded');
                chatList.classList.toggle('collapsed');
            }
        });

        // 🎛️ Settings Orb - click to toggle settings panel
        const settingsOrb = hud.querySelector('.ome-settings-orb-container');
        const settingsPanel = hud.querySelector('.ome-settings-panel');

        settingsOrb?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = settingsPanel?.classList.toggle('open');
            if (isOpen) {
                // Load current config when opening
                loadSettingsIntoPanel();
            }
        });

        // Close settings panel when clicking outside
        hud.addEventListener('click', (e) => {
            if (settingsPanel?.classList.contains('open') &&
                !settingsPanel.contains(e.target) &&
                !settingsOrb.contains(e.target)) {
                settingsPanel.classList.remove('open');
            }
        });

        /**
         * 🎛️ Load llm_models.json (provider endpoints + model list) with caching.
         * Used by HUD only for dropdown population and endpoint defaults.
         * @returns {Promise<Record<string, {endpoint?: string, models?: Array<{id: string, name?: string, default?: boolean}>}>>}
         */
        let _llmModelsCache = null;
        async function loadLLMModelsConfig() {
            if (_llmModelsCache) return _llmModelsCache;
            try {
                const url = chrome.runtime.getURL('llm_models.json');
                const response = await fetch(url);
                _llmModelsCache = await response.json();
                return _llmModelsCache;
            } catch (err) {
                console.error('[HUD] 🎛️ Error loading llm_models.json:', err);
                _llmModelsCache = {};
                return _llmModelsCache;
            }
        }

        /**
         * 🎛️ Get default endpoint for provider (from llm_models.json)
         * @param {string} provider - Provider key (openai, anthropic, lm_studio)
         * @returns {Promise<string>} Endpoint or empty string
         */
        async function getDefaultEndpointForProvider(provider) {
            const data = await loadLLMModelsConfig();
            return data?.[provider]?.endpoint || '';
        }

        /**
         * 🎛️ Load models from llm_models.json for a provider
         * @param {string} provider - Provider key (openai, anthropic, lm_studio)
         * @returns {Promise<Array<{id: string, name?: string, default?: boolean}>>} Array of model objects
         */
        async function loadModelsForProvider(provider) {
            const data = await loadLLMModelsConfig();
            return data?.[provider]?.models || [];
        }

        /**
         * 🎛️ Populate model select dropdown for current provider
         * @param {string} provider - Provider key
         * @param {string} [currentModel] - Current model to select
         */
        async function populateModelList(provider, currentModel = '') {
            const modelSelect = hud.querySelector('.ome-settings-model-select');
            const customInput = hud.querySelector('.ome-settings-model-custom');
            if (!modelSelect) return;

            // Clear and rebuild options
            modelSelect.innerHTML = '';
            const models = await loadModelsForProvider(provider);

            // Add all models from config
            for (const model of models) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = `${model.name || model.id} (${model.id})`;
                modelSelect.appendChild(option);
            }

            // Add "Other (Custom)" option at the end
            const customOption = document.createElement('option');
            customOption.value = '__custom__';
            customOption.textContent = '— Other (Custom) —';
            modelSelect.appendChild(customOption);

            // Set current model or default
            if (currentModel) {
                // Check if current model is in the list
                const existsInList = models.some(m => m.id === currentModel);
                if (existsInList) {
                    modelSelect.value = currentModel;
                    if (customInput) customInput.style.display = 'none';
                } else {
                    // Custom model - show input
                    modelSelect.value = '__custom__';
                    if (customInput) {
                        customInput.value = currentModel;
                        customInput.style.display = 'block';
                    }
                }
            } else {
                // Set default model
                const defaultModel = models.find(m => m.default);
                if (defaultModel) {
                    modelSelect.value = defaultModel.id;
                }
                if (customInput) customInput.style.display = 'none';
            }

            console.log(`[HUD] 🎛️ Loaded ${models.length} models for ${provider}`);
        }

        /**
         * 🎛️ Get currently selected model (from select or custom input)
         * @returns {string} Model ID
         */
        function getSelectedModel() {
            const modelSelect = hud.querySelector('.ome-settings-model-select');
            const customInput = hud.querySelector('.ome-settings-model-custom');
            if (modelSelect?.value === '__custom__') {
                return customInput?.value || '';
            }
            return modelSelect?.value || '';
        }

        /**
         * 🎛️ Some models (notably GPT-5 / o-series) reject temperature.
         * Keep the rule simple and string-based (works for dropdown + custom).
         * @param {string} modelId
         * @returns {boolean}
         */
        function modelSupportsTemperature(modelId) {
            const id = (modelId || '').toLowerCase().trim();
            if (!id) return true;
            return !(id.includes('gpt-5') || id.includes('o3') || id.includes('o1'));
        }

        /**
         * 🎛️ Enable/disable temperature input based on selected model.
         * Keeps the value but prevents editing when unsupported.
         */
        function syncTemperatureAvailability() {
            const tempInput = hud.querySelector('.ome-settings-temperature');
            if (!tempInput) return;
            const modelId = getSelectedModel();
            const supported = modelSupportsTemperature(modelId);
            tempInput.disabled = !supported;
            tempInput.title = supported ? '' : 'This model does not support temperature.';
        }

        /**
         * 🎛️ Load current LLM config into settings panel
         */
        async function loadSettingsIntoPanel() {
            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'GetLLMConfig',
                        params: {}
                    }, resolve);
                });

                if (response?.result?.config) {
                    const config = response.result.config;
                    const activeProvider = config.active_provider;
                    const provider = config.providers?.[activeProvider] || {};
                    const settings = config.settings || {};

                    // Update form fields
                    const providerSelect = hud.querySelector('.ome-settings-provider');
                    const endpointInput = hud.querySelector('.ome-settings-endpoint');
                    const apikeyInput = hud.querySelector('.ome-settings-apikey');
                    const tempInput = hud.querySelector('.ome-settings-temperature');
                    const tokensInput = hud.querySelector('.ome-settings-max-tokens');

                    // Populate provider dropdown with all available providers
                    if (providerSelect) {
                        providerSelect.innerHTML = '';
                        for (const [key, prov] of Object.entries(config.providers || {})) {
                            const option = document.createElement('option');
                            option.value = key;
                            option.textContent = prov.name || key;
                            if (key === activeProvider) option.selected = true;
                            providerSelect.appendChild(option);
                        }
                    }

                    if (endpointInput) {
                        endpointInput.value = provider.endpoint || await getDefaultEndpointForProvider(activeProvider) || '';
                    }
                    if (apikeyInput) apikeyInput.value = provider.api_key || '';
                    if (tempInput) tempInput.value = settings.temperature ?? 0.7;
                    if (tokensInput) tokensInput.value = settings.max_tokens ?? 2048;
                    const capScoreInput = hud.querySelector('.ome-settings-cap-score');
                    if (capScoreInput) capScoreInput.value = settings.cap_score_threshold ?? 0.45;
                    const sessionActionsInput = hud.querySelector('.ome-settings-session-actions');
                    if (sessionActionsInput) sessionActionsInput.value = settings.session_actions_limit ?? 20;

                    // Context settings
                    const context = config.context || {};
                    const largePayloadInput = hud.querySelector('.ome-settings-large-payload');
                    if (largePayloadInput) largePayloadInput.value = context.large_payload_threshold ?? 500;

                    // Populate model dropdown for this provider (pass current model)
                    await populateModelList(activeProvider, provider.model || '');
                    syncTemperatureAvailability();

                    console.log('[HUD] 🎛️ Settings loaded:', activeProvider);
                }
            } catch (err) {
                console.error('[HUD] 🎛️ Error loading settings:', err);
            }
        }

        // Provider dropdown change - load that provider's settings
        hud.querySelector('.ome-settings-provider')?.addEventListener('change', async (e) => {
            const provider = e.target.value;
            try {
                const response = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'GetLLMConfig',
                        params: {}
                    }, resolve);
                });

                if (response?.result?.config) {
                    const providerConfig = response.result.config.providers?.[provider] || {};
                    const endpointInput = hud.querySelector('.ome-settings-endpoint');
                    const apikeyInput = hud.querySelector('.ome-settings-apikey');

                    if (endpointInput) {
                        endpointInput.value = providerConfig.endpoint || await getDefaultEndpointForProvider(provider) || '';
                    }
                    if (apikeyInput) apikeyInput.value = providerConfig.api_key || '';

                    // Populate model dropdown for selected provider (with current model)
                    await populateModelList(provider, providerConfig.model || '');
                    syncTemperatureAvailability();
                }
            } catch (err) {
                console.error('[HUD] 🎛️ Error switching provider:', err);
            }
        });

        // Model select change - show/hide custom input
        hud.querySelector('.ome-settings-model-select')?.addEventListener('change', (e) => {
            const customInput = hud.querySelector('.ome-settings-model-custom');
            if (!customInput) return;
            const show = e.target.value === '__custom__';
            customInput.style.display = show ? 'block' : 'none';
            if (show) {
                customInput.focus();
                customInput.select?.();
            }
            syncTemperatureAvailability();
        });

        // Custom model typing should also update temperature availability
        hud.querySelector('.ome-settings-model-custom')?.addEventListener('input', () => {
            syncTemperatureAvailability();
        });

        // Clear Session button
        hud.querySelector('.ome-clear-session')?.addEventListener('click', async () => {
            const statusEl = hud.querySelector('.ome-settings-status');
            if (statusEl) statusEl.textContent = 'Clearing session...';

            try {
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'ClearSessionContent',
                        params: {}
                    }, resolve);
                });

                if (statusEl) {
                    statusEl.textContent = '✓ Session cleared!';
                    setTimeout(() => { statusEl.textContent = ''; }, 2000);
                }
            } catch (err) {
                console.error('[HUD] Failed to clear session:', err);
                if (statusEl) statusEl.textContent = '✗ Failed to clear session';
            }
        });

        // Save Settings button
        hud.querySelector('.ome-settings-save')?.addEventListener('click', async () => {
            const statusEl = hud.querySelector('.ome-settings-status');
            const provider = hud.querySelector('.ome-settings-provider')?.value;
            const endpoint = hud.querySelector('.ome-settings-endpoint')?.value;
            const model = getSelectedModel();
            const apikey = hud.querySelector('.ome-settings-apikey')?.value;
            const temperature = parseFloat(hud.querySelector('.ome-settings-temperature')?.value || '0.7');
            const maxTokens = parseInt(hud.querySelector('.ome-settings-max-tokens')?.value || '2048');

            if (statusEl) statusEl.textContent = 'Saving...';

            try {
                // Set active provider
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'SetLLMProvider',
                        params: { provider }
                    }, resolve);
                });

                // Set endpoint
                if (endpoint) {
                    await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            type: 'execute_capability',
                            action: 'SetLLMEndpoint',
                            params: { provider, endpoint }
                        }, resolve);
                    });
                }

                // Set model
                if (model) {
                    await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            type: 'execute_capability',
                            action: 'SetLLMModel',
                            params: { provider, model }
                        }, resolve);
                    });
                }

                // Set API key (if provided and not masked)
                if (apikey && !apikey.startsWith('***')) {
                    await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            type: 'execute_capability',
                            action: 'SetLLMAPIKey',
                            params: { provider, api_key: apikey }
                        }, resolve);
                    });
                }

                // Set temperature
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'SetTemperature',
                        params: { temperature }
                    }, resolve);
                });

                // Set max tokens
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'SetMaxTokens',
                        params: { max_tokens: maxTokens }
                    }, resolve);
                });

                // Set cap score threshold
                const capScore = parseFloat(hud.querySelector('.ome-settings-cap-score')?.value || '0.45');
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'SetCapScoreThreshold',
                        params: { threshold: capScore }
                    }, resolve);
                });

                // Set session actions limit
                const sessionActionsLimit = parseInt(hud.querySelector('.ome-settings-session-actions')?.value || '20', 10);
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'SetSessionActionsLimit',
                        params: { limit: sessionActionsLimit }
                    }, resolve);
                });

                // Set large payload threshold
                const largePayloadThreshold = parseInt(hud.querySelector('.ome-settings-large-payload')?.value || '500', 10);
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'SetLargePayloadThreshold',
                        params: { threshold: largePayloadThreshold }
                    }, resolve);
                });

                // Reload LLM config in the agent (no server restart needed)
                await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        type: 'execute_capability',
                        action: 'ReloadLLMConfig',
                        params: {}
                    }, resolve);
                });

                if (statusEl) {
                    statusEl.textContent = '✓ Settings saved!';
                    setTimeout(() => { statusEl.textContent = ''; }, 2000);
                }
                console.log('[HUD] 🎛️ Settings saved and LLM config reloaded');

            } catch (err) {
                console.error('[HUD] 🎛️ Error saving settings:', err);
                if (statusEl) statusEl.textContent = '✗ Error saving settings';
            }
        });

        // NOTE: Removed backdrop click-to-close - only exit via Exit HUD button or orb click

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && hudState.visible) toggleHUD();
        });

        // 🎯 Focus textarea when HUD prompt box is clicked
        const promptBox = hud.querySelector('.ome-hud-prompt');
        const promptTextarea = hud.querySelector('.ome-hud-prompt-textarea');

        promptBox?.addEventListener('click', (e) => {
            if (promptTextarea && e.target !== promptTextarea) {
                promptTextarea.focus();
            }
        });

        // 📐 Auto-resize textarea as user types (Perplexity-style)
        function autoResizeTextarea() {
            if (!promptTextarea) return;
            // Set height to minimum first to measure true scrollHeight
            promptTextarea.style.height = '40px';
            // Calculate new height (capped at 300px)
            const scrollH = promptTextarea.scrollHeight;
            const newHeight = Math.max(40, Math.min(scrollH, 300));
            promptTextarea.style.height = newHeight + 'px';
            // Show scrollbar only when at max height
            promptTextarea.style.overflowY = scrollH > 300 ? 'auto' : 'hidden';
            // Check if HUD needs repositioning
            checkAndRepositionHUD();
        }

        promptTextarea?.addEventListener('input', () => {
            autoResizeTextarea();
        });

        // 💾 Save input on blur only (persists across navigation)
        promptTextarea?.addEventListener('blur', () => {
            saveChatInput(promptTextarea.value);
        });
        // Initial sizing and restore saved input
        if (promptTextarea) {
            autoResizeTextarea();
            // Restore chat input from service worker
            try {
                chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                    if (response?.ok && response.chatInput) {
                        promptTextarea.value = response.chatInput;
                        autoResizeTextarea();
                    }
                });
            } catch (e) {
                console.warn('[Content] Could not restore HUD prompt input:', e);
            }
        }

        // 📐 ResizeObserver to auto-resize textarea when container width changes
        // (e.g., sidebar opens/closes, window resizes)
        const hudPrompt = hud.querySelector('.ome-hud-prompt');
        if (hudPrompt && promptTextarea) {
            const resizeObserver = new ResizeObserver(() => {
                autoResizeTextarea();
                checkAndRepositionHUD();
            });
            resizeObserver.observe(hudPrompt);
        }

        // 📍 Window resize listener for HUD repositioning
        window.addEventListener('resize', checkAndRepositionHUD);

        // Send button handler
        const sendBtn = hud.querySelector('.ome-hud-send-btn');
        const clearBtn = hud.querySelector('.ome-hud-clear-btn');

        // 🗑️ Clear button - clears prompt text
        clearBtn?.addEventListener('click', () => {
            if (promptTextarea) {
                promptTextarea.value = '';
                promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                promptTextarea.focus();
                console.log('[Content] 🗑️ Prompt cleared');
            }
        });

        sendBtn?.addEventListener('click', async () => {
            const text = promptTextarea?.value.trim();
            if (!text) return;

            // ⏱️ TIMING: Track full submit flow
            const t0 = performance.now();
            console.log(`[Content] ⏱️ SUBMIT START: "${text.substring(0, 30)}..."`);

            // Clear textarea, reset size, and save empty state
            promptTextarea.value = '';
            autoResizeTextarea();
            saveChatInput(''); // Clear shared state so orb input stays in sync

            // 📬 Immediately display user message in chat
            addChatMessage('user', text);

            // Send through chat pipeline (LLMChat now saves user message + gets response)
            try {
                // 🧪 EXPERIMENT: Trigger scan before LLM submission
                const t1 = performance.now();
                const scanResult = await triggerScanAndWait();
                const t2 = performance.now();
                console.log(`[Content] ⏱️ ScanAndWait: ${Math.round(t2 - t1)}ms (${scanResult?.skipped ? 'skipped' : scanResult?.timeout ? 'timeout' : 'scanned'})`);

                // Send to LLM (saves user msg + processes + saves response)
                const llmResult = await sendLLMChat(text);
                const t3 = performance.now();
                console.log(`[Content] ⏱️ LLMChat: ${Math.round(t3 - t2)}ms`);
                console.log(`[Content] ⏱️ SUBMIT TOTAL: ${Math.round(t3 - t0)}ms`);

                // 📬 Display assistant response
                if (llmResult?.response) {
                    addChatMessage('assistant', llmResult.response);
                }

                // 🚨 Check for capability execution errors
                if (llmResult?.capability_results?.length) {
                    for (const capRes of llmResult.capability_results) {
                        if (capRes.result?.error) {
                            console.error('[Content] ❌ Capability error:', capRes.action, capRes.result.error);
                            addChatMessage('error', `${capRes.action} failed: ${capRes.result.error}`);
                        }
                    }
                }

            } catch (error) {
                console.error('[Content] ❌ Chat send failed:', error);
                addChatMessage('error', 'Failed to send message');
            }

            // 🎯 Always refocus prompt textarea after send (success or error)
            focusHUDPromptGuard(true);
        });

        // Enter to send (Shift+Enter for new line)
        promptTextarea?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn?.click();
            }
        });

        // 📜 HUD Scroll controls - gear stick for messages area
        const hudMessagesArea = hud.querySelector('.ome-hud-messages-area');

        // ⬆️⬇️ Scroll top/bottom buttons (instant jump)
        hud.querySelector('.ome-hud-scroll-top')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hudMessagesArea) {
                hudMessagesArea.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        hud.querySelector('.ome-hud-scroll-bottom')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hudMessagesArea) {
                hudMessagesArea.scrollTo({ top: hudMessagesArea.scrollHeight, behavior: 'smooth' });
            }
        });

        // 🔍 HUD Text Zoom - apply to messages content
        const hudMessagesContent = hud.querySelector('.ome-hud-messages-content');
        const ZOOM_STEP = 0.1;
        const ZOOM_MIN = 0.6;
        const ZOOM_MAX = 2.0;

        /**
         * 🔍 Apply text zoom to HUD messages
         * @param {number} zoom - Zoom level (1 = 100%)
         */
        function applyHudTextZoom(zoom) {
            hudState.hudTextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
            if (hudMessagesContent) {
                hudMessagesContent.style.setProperty('--hud-text-zoom', String(hudState.hudTextZoom));
            }
            console.log(`[HUD] 🔍 Text zoom: ${Math.round(hudState.hudTextZoom * 100)}%`);
        }

        // 🔍 Zoom in button
        hud.querySelector('.ome-hud-zoom-in')?.addEventListener('click', (e) => {
            e.stopPropagation();
            applyHudTextZoom(hudState.hudTextZoom + ZOOM_STEP);
        });

        // 🔍 Zoom out button
        hud.querySelector('.ome-hud-zoom-out')?.addEventListener('click', (e) => {
            e.stopPropagation();
            applyHudTextZoom(hudState.hudTextZoom - ZOOM_STEP);
        });

        // 🔍 Zoom reset button
        hud.querySelector('.ome-hud-zoom-reset')?.addEventListener('click', (e) => {
            e.stopPropagation();
            applyHudTextZoom(1);
        });

        // ⚙️ HUD Gear button - click to engage, vertical movement = scroll speed
        const hudGearBtn = hud.querySelector('.ome-hud-gear-btn');
        if (hudGearBtn && hudMessagesArea) {
            let gearEngaged = false;
            let engageY = 0;
            let engageX = 0;
            let scrollAnimationId = null;
            let currentOffset = 0;

            const SENSITIVITY = 0.25;
            const DISENGAGE_X = 50;

            function scrollLoop() {
                if (!gearEngaged) {
                    scrollAnimationId = null;
                    return;
                }
                if (Math.abs(currentOffset) > 2) {
                    const scrollSpeed = currentOffset * SENSITIVITY;
                    const scrollTop = hudMessagesArea.scrollTop;
                    const maxScroll = hudMessagesArea.scrollHeight - hudMessagesArea.clientHeight;
                    const atTop = scrollTop <= 0 && scrollSpeed < 0;
                    const atBottom = scrollTop >= maxScroll && scrollSpeed > 0;
                    if (atTop || atBottom) {
                        hudGearBtn.classList.add('boundary');
                        setTimeout(() => hudGearBtn.classList.remove('boundary'), 300);
                    } else {
                        hudMessagesArea.scrollTop += scrollSpeed;
                    }
                }
                scrollAnimationId = requestAnimationFrame(scrollLoop);
            }

            function engageGear(e) {
                if (gearEngaged) {
                    disengageGear();
                    return;
                }
                gearEngaged = true;
                engageY = e.clientY;
                engageX = e.clientX;
                currentOffset = 0;
                hudGearBtn.classList.add('engaged');
                if (!scrollAnimationId) {
                    scrollAnimationId = requestAnimationFrame(scrollLoop);
                }
                document.addEventListener('mousemove', handleGearMove);
                // Any click anywhere disengages
                setTimeout(() => document.addEventListener('click', handleGearClick, true), 0);
                console.log('[HUD] ⚙️ HUD Gear engaged');
            }

            function disengageGear() {
                if (!gearEngaged) return;
                gearEngaged = false;
                currentOffset = 0;
                hudGearBtn.classList.remove('engaged', 'scrolling-up', 'scrolling-down');
                if (scrollAnimationId) {
                    cancelAnimationFrame(scrollAnimationId);
                    scrollAnimationId = null;
                }
                document.removeEventListener('mousemove', handleGearMove);
                document.removeEventListener('click', handleGearClick, true);
                console.log('[HUD] ⚙️ HUD Gear disengaged');
            }

            function handleGearClick(e) {
                // If click is on the gear button itself, let the button handler handle it
                if (e.target === hudGearBtn || hudGearBtn.contains(e.target)) {
                    return;
                }
                // 🛡️ Consume this click entirely - don't let it trigger other elements
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                disengageGear();
                console.log('[HUD] ⚙️ HUD Gear disengage - click consumed');
            }

            function handleGearMove(e) {
                if (!gearEngaged) return;
                const deltaX = Math.abs(e.clientX - engageX);
                if (deltaX > DISENGAGE_X) {
                    disengageGear();
                    return;
                }
                const deltaY = e.clientY - engageY;
                currentOffset = Math.max(-60, Math.min(60, deltaY));
                hudGearBtn.classList.toggle('scrolling-up', currentOffset < -5);
                hudGearBtn.classList.toggle('scrolling-down', currentOffset > 5);
            }

            hudGearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle: if engaged, disengage. If not, engage.
                if (gearEngaged) {
                    disengageGear();
                } else {
                    engageGear(e);
                }
            });
        }

        // 🔮 ORB button - return to orb view
        hud.querySelector('.ome-hud-orb-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHUD();
        });

        // 💬 HUD Prompt toggle button - show/hide prompt for more reading space
        const hudPromptBtn = hud.querySelector('.ome-hud-prompt-btn');
        hudPromptBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Toggle shared state (syncs with orb view)
            hudState.chatVisible = !hudState.chatVisible;
            updateHUDPromptVisibility();
            // Also update orb view prompt button if exists
            const orbPromptBtn = hudState.orb?.querySelector('.ome-prompt-btn');
            if (orbPromptBtn) {
                orbPromptBtn.classList.toggle('active', hudState.chatVisible);
                orbPromptBtn.textContent = hudState.chatVisible ? 'HIDE PROMPT' : 'Open Prompt';
            }
            // Update orb chat panel visibility
            hudState.chatPanel?.classList.toggle('visible', hudState.chatVisible);
            // 🎯 Focus HUD prompt input when opening
            // Delay focus to allow CSS transition to complete
            if (hudState.chatVisible) {
                setTimeout(() => {
                    const promptTextarea = hud.querySelector('.ome-hud-prompt-textarea');
                    if (promptTextarea) {
                        promptTextarea.focus();
                        console.log('[HUD] 🎯 Direct focus on prompt textarea (delayed)');
                    }
                }, 100);
            }
            // Persist to service worker
            try {
                chrome.runtime.sendMessage({ type: 'set_orb_state', chatVisible: hudState.chatVisible });
            } catch (e) { /* ignore */ }
            console.log('[Content] 💬 Prompt:', hudState.chatVisible ? 'visible' : 'hidden');
        });

        // 🛤️ Rail slider - drag orb to slide prompt unit up/down
        // Uses click-to-toggle pattern (same as floating orb)
        const inputArea = hud.querySelector('.ome-hud-input-area');
        const hudOrb = hud.querySelector('.ome-hud-orb');
        let hudSliding = false;
        let hudSlideHandler = null;

        /**
         * Release HUD orb from slide mode
         */
        function releaseHudSlide() {
            if (!hudSliding) return;
            hudSliding = false;
            inputArea?.classList.remove('dragging');
            hudOrb?.classList.remove('holding');
            document.body.style.cursor = '';
            if (hudSlideHandler) {
                document.removeEventListener('mousemove', hudSlideHandler);
                hudSlideHandler = null;
            }
        }

        /**
         * Start HUD orb slide mode - follows cursor vertically
         * Exits if mouse drifts too far horizontally from orb
         */
        function startHudSlide() {
            if (hudSliding || !inputArea) return;
            hudSliding = true;
            inputArea.classList.add('dragging');
            hudOrb?.classList.add('holding');
            document.body.style.cursor = 'grabbing';

            const startBottom = parseInt(inputArea.style.bottom) || 400;
            let lastY = null;
            let lastX = null;
            let scrollAnimationId = null;
            let scrollVelocity = 0; // Current scroll velocity (positive = down, negative = up)
            let applyFriction = false; // Only apply friction when decelerating
            let reverseAccumulator = 0; // Accumulated opposite direction movement
            const FRICTION = 0.94; // Velocity decay per frame when stopping
            const SENSITIVITY = 0.6; // Mouse movement to velocity multiplier
            const ACCELERATION = 0.4; // Speed boost when continuing same direction
            const MAX_VELOCITY = 25; // Cap on scroll speed
            const MIN_VELOCITY = 0.3; // Stop scrolling below this threshold
            const REVERSE_THRESHOLD = 30; // Pixels of sustained movement needed after stop before activating scroll
            const hudGearBtnRef = hud.querySelector('.ome-hud-gear-btn');

            // 🔍 Continuous scroll loop - infinite until direction change
            function infiniteScrollLoop() {
                if (!hudSliding || !hudMessagesArea) {
                    scrollAnimationId = null;
                    return;
                }

                // Apply scroll velocity
                if (Math.abs(scrollVelocity) > MIN_VELOCITY) {
                    hudMessagesArea.scrollTop += scrollVelocity;
                    // Only apply friction when decelerating (user reversed direction)
                    if (applyFriction) {
                        scrollVelocity *= FRICTION;
                    }
                } else {
                    scrollVelocity = 0;
                    applyFriction = false;
                }

                // Update gear button indicators based on current velocity
                if (scrollVelocity > MIN_VELOCITY) {
                    hudGearBtnRef?.classList.add('scrolling-down');
                    hudGearBtnRef?.classList.remove('scrolling-up');
                } else if (scrollVelocity < -MIN_VELOCITY) {
                    hudGearBtnRef?.classList.add('scrolling-up');
                    hudGearBtnRef?.classList.remove('scrolling-down');
                } else {
                    hudGearBtnRef?.classList.remove('scrolling-up', 'scrolling-down');
                }

                scrollAnimationId = requestAnimationFrame(infiniteScrollLoop);
            }

            hudSlideHandler = (e) => {
                // 🧲 Orb stays centered - only exit if mouse drifts WAY outside horizontally
                const orbRect = hudOrb?.getBoundingClientRect();
                if (orbRect && lastX !== null && lastY !== null) {
                    const orbCenterX = orbRect.left + orbRect.width / 2;
                    const cursorOffsetX = Math.abs(e.clientX - orbCenterX);
                    const deltaX = Math.abs(e.clientX - lastX);
                    const deltaYAbs = Math.abs(e.clientY - lastY);
                    const EXIT_THRESHOLD = 50; // Only exit if cursor is ~50px from orb center horizontally

                    // Only exit if WAY outside AND movement is more horizontal than vertical
                    if (cursorOffsetX > EXIT_THRESHOLD && deltaX > deltaYAbs) {
                        exitScanMode();
                        return;
                    }
                }
                lastX = e.clientX;

                if (lastY === null) {
                    lastY = e.clientY;
                    // Start the infinite scroll loop
                    if (!scrollAnimationId) {
                        scrollAnimationId = requestAnimationFrame(infiniteScrollLoop);
                    }
                    return;
                }

                const deltaY = e.clientY - lastY; // Positive = mouse moved down
                lastY = e.clientY;
                const currentBottom = parseInt(inputArea.style.bottom) || startBottom;
                const newBottom = Math.max(20, Math.min(window.innerHeight - 150, currentBottom - deltaY));
                inputArea.style.bottom = newBottom + 'px';

                // 🔍 Hybrid scroll: infinite momentum, direction change = stop first
                const moveDirection = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
                const scrollDirection = scrollVelocity > 0 ? 1 : scrollVelocity < 0 ? -1 : 0;

                if (moveDirection !== 0) {
                    if (scrollDirection === 0) {
                        // Stopped - need sustained movement to start new direction
                        reverseAccumulator += Math.abs(deltaY);
                        if (reverseAccumulator >= REVERSE_THRESHOLD) {
                            scrollVelocity = deltaY * SENSITIVITY;
                            applyFriction = false;
                            reverseAccumulator = 0;
                        }
                    } else if (moveDirection === scrollDirection) {
                        // Same direction - accelerate! Add to velocity
                        const boost = Math.abs(deltaY) * ACCELERATION;
                        scrollVelocity = Math.min(Math.abs(scrollVelocity) + boost, MAX_VELOCITY) * scrollDirection;
                        applyFriction = false;
                        reverseAccumulator = 0;
                    } else {
                        // Opposite direction - trigger stop, don't reverse
                        applyFriction = true;
                        reverseAccumulator = 0; // Reset - will accumulate after stopped
                    }
                }
            };
            document.addEventListener('mousemove', hudSlideHandler);

            // Cleanup scroll animation on slide release
            const originalRelease = releaseHudSlide;
            releaseHudSlide = function() {
                if (scrollAnimationId) {
                    cancelAnimationFrame(scrollAnimationId);
                    scrollAnimationId = null;
                }
                scrollVelocity = 0;
                applyFriction = false;
                reverseAccumulator = 0;
                hudGearBtnRef?.classList.remove('scrolling-up', 'scrolling-down');
                originalRelease();
            };
        }

        /**
         * 🔍 Exit scan mode completely
         */
        function exitScanMode() {
            scanModeActive = false;
            sweepingActive = false;
            sweptRegion = { minY: null, maxY: null };
            hud.classList.remove('scan-mode', 'sweeping');
            clearSweptHighlights();
            releaseHudSlide();
            // Clear scroll indicator flash
            hud.querySelector('.ome-hud-gear-btn')?.classList.remove('scrolling-up', 'scrolling-down');
            console.log('[Content] 🔍 Exited scan mode');
        }

        // 🔍 Click to toggle scan mode (visual + slide behavior)
        let sweepingActive = false;
        let sweptRegion = { minY: null, maxY: null };
        const messagesArea = hud.querySelector('.ome-hud-messages-area');

        /**
         * 🔍 Clear all swept highlights from messages
         */
        function clearSweptHighlights() {
            if (!messagesArea) return;
            messagesArea.querySelectorAll('.ome-hud-swept').forEach(el => {
                el.classList.remove('ome-hud-swept');
            });
        }

        /**
         * 🔍 Highlight messages within swept region
         */
        function highlightSweptText() {
            if (!messagesArea || sweptRegion.minY === null) return;
            const messages = messagesArea.querySelectorAll('.ome-hud-message');
            messages.forEach(msg => {
                const rect = msg.getBoundingClientRect();
                const overlaps = rect.top < sweptRegion.maxY && rect.bottom > sweptRegion.minY;
                if (overlaps) {
                    msg.classList.add('ome-hud-swept');
                } else {
                    msg.classList.remove('ome-hud-swept');
                }
            });
        }

        /**
         * 🔍 Update swept region (disabled - select pane removed)
         */
        function updateSweptRegion() {
            // Sweep functionality disabled - select pane removed
        }

        /**
         * 🔍 Start sweep - click in scan mode
         */
        function startSweep() {
            sweepingActive = true;
            sweptRegion = { minY: null, maxY: null };
            hud.classList.add('sweeping');
            updateSweptRegion();
            console.log('[Content] 🔍 Sweep started - move to scan, click to capture');
        }

        /**
         * 🔍 End sweep - capture text and exit
         */
        function endSweep() {
            if (!sweepingActive) return;

            // Capture swept text
            const sweptMessages = messagesArea?.querySelectorAll('.ome-hud-swept');
            const texts = [];
            sweptMessages?.forEach(msg => {
                const text = msg.textContent?.trim();
                if (text) texts.push(text);
            });
            const capturedText = texts.join('\n\n');

            if (capturedText && promptTextarea) {
                const prefix = promptTextarea.value.length > 0 ? '\n\n' : '';
                promptTextarea.value += prefix + capturedText;
                promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[Content] 🔍 Captured:', capturedText.substring(0, 50) + '...');
            }

            // Reset sweep state
            sweepingActive = false;
            sweptRegion = { minY: null, maxY: null };
            hud.classList.remove('sweeping');
            clearSweptHighlights();

            // Exit scan mode too
            scanModeActive = false;
            hud.classList.remove('scan-mode');
            releaseHudSlide();
            console.log('[Content] 🔍 Sweep ended, exited scan mode');
        }

        // Modify slide handler to update swept region
        const originalStartHudSlide = startHudSlide;
        startHudSlide = function() {
            originalStartHudSlide();
            // Patch the mousemove handler to also update sweep
            const originalHandler = hudSlideHandler;
            hudSlideHandler = (e) => {
                originalHandler(e);
                if (sweepingActive) updateSweptRegion();
            };
            document.removeEventListener('mousemove', originalHandler);
            document.addEventListener('mousemove', hudSlideHandler);
        };

        hudOrb?.addEventListener('click', (e) => {
            e.stopPropagation();
            // 📚 Toggle sidebar on orb click
            toggleSidebar();
        });

        // 🔮 Double-click orb to exit HUD
        hudOrb?.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            console.log('[Content] 🔮 HUD orb double-clicked - exiting HUD');
            if (!hudState.host) initHUD();
            toggleHUD();
        });

        shadow.appendChild(hud);
        return hud;
    }

    /**
     * 📍 Scroll HUD messages to bottom after new content
     * ChatGPT-style layout handles sizing automatically via flexbox
     */
    function checkAndRepositionHUD() {
        if (!hudState.hud || !hudState.visible) return;

        // 🙈 Check if prompt should be hidden/shown based on viewport + sidebar state
        checkHudPromptVisibility();

        // 📜 Smart scroll: assistant responses show TOP, user messages show bottom
        const hudMessages = hudState.hud.querySelector('.ome-hud-messages-area');
        const hudMessagesContent = hudState.hud.querySelector('.ome-hud-messages-content');
        if (hudMessages && hudMessagesContent) {
            const lastMessage = hudMessagesContent.lastElementChild;
            if (lastMessage && lastMessage.classList.contains('assistant')) {
                // Show START of assistant response (for reading long responses)
                hudMessages.scrollTop = lastMessage.offsetTop;
            } else {
                // User message - show at bottom
                hudMessages.scrollTop = hudMessages.scrollHeight;
            }
        }
    }

    /**
     * 🔮 Update HUD orb display and theme colors when theme changes
     * @param {HTMLElement} hud - HUD element
     * @param {string} themeName - New theme key
     */
    function updateHUDOrb(hud, themeName) {
        // Update HUD theme colors
        hud.dataset.theme = themeName;

        const theme = ORB_THEMES[themeName] || ORB_THEMES.robot;

        // Update main orb SVG in prompt area
        const orbContainer = hud.querySelector('.ome-hud-orb');
        if (orbContainer) {
            orbContainer.dataset.theme = themeName;
            orbContainer.innerHTML = theme.svg;
        }

        // Update mini orb in topbar trigger (top-left header)
        const miniOrbWrapper = hud.querySelector('.ome-mini-orb-wrapper');
        if (miniOrbWrapper) {
            miniOrbWrapper.innerHTML = theme.svg.replace('ome-bunny', 'ome-mini-orb');
        }

        // Update sidebar orb (inside expanded sidebar header)
        const sidebarOrbWrapper = hud.querySelector('.ome-sidebar-orb-wrapper');
        if (sidebarOrbWrapper) {
            sidebarOrbWrapper.innerHTML = theme.svg.replace('ome-bunny', 'ome-sidebar-orb');
        }

        // Update HUD prompt button color
        const hudPromptBtn = hud.querySelector('.ome-hud-prompt-btn');
        if (hudPromptBtn) {
            hudPromptBtn.style.color = theme.color;
        }
    }

    /**
     * 🎨 Set and persist orb theme
     * @param {string} themeName - Theme key from ORB_THEMES
     */
    function setOrbTheme(themeName) {
        if (!ORB_THEMES[themeName]) {
            console.warn(`[Content] Unknown theme: ${themeName}`);
            return;
        }
        applyOrbTheme(themeName);

        // Persist to service worker (async, non-blocking)
        try {
            chrome.runtime.sendMessage({ type: 'set_orb_state', theme: themeName });
            console.log('[Content] 💾 Saved theme to SW:', themeName);
        } catch (e) {
            console.warn('[Content] Could not persist theme:', e);
        }
    }

    /**
     * 📐 Clamp orb position to keep it visible within viewport
     * Now uses the comprehensive constrainOrbToViewport function
     */
    function clampOrbToViewport() {
        constrainOrbToViewport();
    }

    /**
     * 💾 Save orb position to service worker (using percentages for consistency)
     * @param {number} rightPct - Right offset as percentage (0-100)
     * @param {number} bottomPct - Bottom offset as percentage (0-100)
     */
    function saveOrbPosition(rightPct, bottomPct) {
        try {
            chrome.runtime.sendMessage({ type: 'set_orb_state', position: { rightPct, bottomPct } });
        } catch (e) {
            console.warn('[Content] Could not save position:', e);
        }
    }

    /**
     * 📍 Apply saved position to orb (using percentages)
     * @param {{ rightPct: number, bottomPct: number } | { right: number, bottom: number } | { left: number, top: number }} position
     */
    function applyOrbPosition(position) {
        if (!hudState.orb || !position) return;

        // New format: percentages
        if (position.rightPct !== undefined && position.bottomPct !== undefined) {
            hudState.orb.style.left = 'auto';
            hudState.orb.style.top = 'auto';
            hudState.orb.style.right = `${position.rightPct}%`;
            hudState.orb.style.bottom = `${position.bottomPct}%`;
            console.log('[Content] 📍 Applied orb position:', { right: position.rightPct + '%', bottom: position.bottomPct + '%' });
        }
        // Legacy format: pixels (right/bottom) - convert to percentages
        else if (position.right !== undefined && position.bottom !== undefined) {
            const rightPct = (position.right / window.innerWidth) * 100;
            const bottomPct = (position.bottom / window.innerHeight) * 100;
            hudState.orb.style.left = 'auto';
            hudState.orb.style.top = 'auto';
            hudState.orb.style.right = `${rightPct}%`;
            hudState.orb.style.bottom = `${bottomPct}%`;
            saveOrbPosition(rightPct, bottomPct);
            console.log('[Content] 📍 Converted pixel position to percentages');
        }
        // Legacy format: pixels (left/top) - convert to percentages
        else if (position.left !== undefined && position.top !== undefined) {
            const rightPct = ((window.innerWidth - position.left - 50) / window.innerWidth) * 100;
            const bottomPct = ((window.innerHeight - position.top - 78) / window.innerHeight) * 100;
            hudState.orb.style.left = 'auto';
            hudState.orb.style.top = 'auto';
            hudState.orb.style.right = `${Math.max(0, rightPct)}%`;
            hudState.orb.style.bottom = `${Math.max(0, bottomPct)}%`;
            saveOrbPosition(Math.max(0, rightPct), Math.max(0, bottomPct));
            console.log('[Content] 📍 Converted legacy left/top to percentages');
        }

    }

    /**
     * 🔍 Restore orb to same screen position after zoom
     * Uses percentage positioning for consistency
     * @param {number} rightPct - Right position as percentage (0-100)
     * @param {number} bottomPct - Bottom position as percentage (0-100)
     */
    function restoreOrbScreenPosition(rightPct, bottomPct) {
        if (!hudState.orb) return;

        // Clamp to keep orb visible (1% to 90% range)
        const clampedRightPct = Math.max(1, Math.min(rightPct, 90));
        const clampedBottomPct = Math.max(1, Math.min(bottomPct, 85));

        // Apply percentage position
        hudState.orb.style.left = 'auto';
        hudState.orb.style.top = 'auto';
        hudState.orb.style.right = `${clampedRightPct}%`;
        hudState.orb.style.bottom = `${clampedBottomPct}%`;

        // Save to service worker
        saveOrbPosition(clampedRightPct, clampedBottomPct);
        console.log(`[Content] 🔍 Restored orb position: right:${clampedRightPct.toFixed(1)}%, bottom:${clampedBottomPct.toFixed(1)}%`);
    }

    /**
     * 🔍 Apply zoom scale to keep orb same visual size
     * Uses CSS custom property so hover states work correctly
     * @param {number} zoomLevel - Browser zoom level (1.0 = 100%)
     */
    function applyOrbZoomScale(zoomLevel) {
        if (!hudState.orb) return;

        // Validate zoom level
        if (!zoomLevel || zoomLevel <= 0 || isNaN(zoomLevel)) {
            console.warn(`[Content] 🔍 Invalid zoom level: ${zoomLevel}, resetting to 1.0`);
            zoomLevel = 1.0;
        }

        // Scale inversely to zoom: at 150% zoom, scale to 0.667 to appear same size
        const scale = 1 / zoomLevel;

        // Clamp scale to reasonable bounds (0.5x to 2x)
        const clampedScale = Math.max(0.5, Math.min(2.0, scale));

        // Update CSS custom property (CSS handles the actual transform)
        hudState.orb.style.setProperty('--ome-zoom-scale', clampedScale.toString());
        hudState.zoomScale = zoomLevel;
        console.log(`[Content] 🔍 Orb scale: zoom=${Math.round(zoomLevel * 100)}%, scale=${clampedScale.toFixed(3)}`);
    }

    /** 🎛️ Initialize HUD system */
    function initHUD() {
        if (hudState.host) return;

        const host = document.createElement('div');
        host.id = 'ome-hud-host';
        host.setAttribute('data-ome-ignore', 'true');
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'closed' });
        injectHUDStyles(shadow);
        hudState.host = host;
        hudState.shadow = shadow;
        hudState.orb = createOrb(shadow);
        hudState.hud = createHUD(shadow);

        // 🛡️ Block line breaks in .editing elements and prompt inputs (on shadow root)
        // Note: hudState.shiftHeld is set by document keydown handler before this fires
        shadow.addEventListener('beforeinput', (e) => {
            if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
                const target = e.target;
                // Always block in contentEditable .editing elements (chat name rename)
                if (target?.classList?.contains('editing')) {
                    e.preventDefault();
                }
                // Block in prompt inputs unless Shift is held (Shift+Enter for new line)
                const isPromptInput = target?.classList?.contains('ome-hud-prompt-textarea') ||
                                      target?.classList?.contains('ome-chat-input');
                if (isPromptInput && !hudState.shiftHeld) {
                    e.preventDefault();
                }
            }
        }, true);

        // 🛡️ GLOBAL CATCH: Block clicks to page when HUD visible
        // Capture phase on document - fires BEFORE any page handlers
        document.addEventListener('click', (e) => {
            if (!hudState.visible) return;
            // If click target is our host (Shadow DOM), let it through
            if (e.target === host || e.target.closest('#ome-hud-host')) return;
            // Block clicks to underlying page
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
        }, true);

        document.addEventListener('mousedown', (e) => {
            if (!hudState.visible) return;
            if (e.target === host || e.target.closest('#ome-hud-host')) return;
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
        }, true);

        // Block keyboard events to document when HUD visible or shadow DOM has focus
        // Handle Enter/Escape for editing elements and chat input before blocking
        document.addEventListener('keydown', (e) => {
            // Track shift state for beforeinput handler (InputEvent doesn't have shiftKey)
            hudState.shiftHeld = e.shiftKey;

            // Check focused element in shadow DOM (closed shadow requires activeElement check)
            const activeEl = hudState.shadow?.activeElement;

            // Block if HUD visible OR if shadow DOM element has focus (e.g., orb chat input)
            if (!hudState.visible && !activeEl) return;

            // Handle prompt inputs: Enter to send (Shift+Enter for new line), Escape to clear/blur
            const isHudPrompt = activeEl?.classList?.contains('ome-hud-prompt-textarea');
            const isOrbChat = activeEl?.classList?.contains('ome-chat-input');
            if (isHudPrompt || isOrbChat) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    // Find send button (different selectors for HUD prompt vs orb chat)
                    let sendBtn;
                    if (isHudPrompt) {
                        sendBtn = hudState.hud?.querySelector('.ome-hud-send-btn');
                    } else {
                        const inputArea = activeEl.closest('.ome-chat-input-area');
                        sendBtn = inputArea?.querySelector('.ome-chat-send');
                    }
                    sendBtn?.click();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    activeEl.value = '';
                    activeEl.blur();
                }
            }
            // Handle contentEditable .editing elements (chat name rename)
            else if (activeEl?.classList?.contains('editing')) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    activeEl.blur(); // Triggers onblur save handler
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    // Restore original and blur (onblur will save original back)
                    if (activeEl.dataset.originalTitle !== undefined) {
                        activeEl.textContent = activeEl.dataset.originalTitle;
                    }
                    activeEl.blur();
                }
            }

            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        document.addEventListener('keyup', (e) => {
            const activeEl = hudState.shadow?.activeElement;
            if (!hudState.visible && !activeEl) return;
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        document.addEventListener('keypress', (e) => {
            const activeEl = hudState.shadow?.activeElement;
            if (!hudState.visible && !activeEl) return;
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        // 🐰 Request orb state from service worker and apply
        hudTrace.log('requesting get_orb_state from SW');
        try {
            chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                hudTrace.log('get_orb_state response received');
                if (chrome.runtime.lastError) {
                    console.warn('[Content] Could not get orb state:', chrome.runtime.lastError);
                    return;
                }
                if (response && response.ok) {
                    // Apply saved theme
                    if (response.theme && ORB_THEMES[response.theme]) {
                        hudState.theme = response.theme;
                        applyOrbTheme(response.theme);
                        console.log('[Content] 🎨 Restored theme from SW:', response.theme);
                    }
                    // Apply saved position
                    if (response.position) {
                        applyOrbPosition(response.position);
                        console.log('[Content] 📍 Restored position from SW:', response.position);
                    }
                    // Apply zoom scale to keep orb same visual size
                    if (response.zoom && response.zoom !== 1.0) {
                        applyOrbZoomScale(response.zoom);
                        console.log('[Content] 🔍 Applied zoom scale from SW:', response.zoom);
                    }
                    // 💬 Restore chat panel visibility (handle both true and false)
                    if (response.chatVisible !== undefined && hudState.chatPanel) {
                        hudState.chatVisible = response.chatVisible;
                        const promptBtn = hudState.orb?.querySelector('.ome-prompt-btn');
                        if (response.chatVisible) {
                            hudState.chatPanel.classList.add('visible');
                            if (promptBtn) {
                                promptBtn.classList.add('active');
                                promptBtn.textContent = 'HIDE PROMPT';
                            }
                            constrainChatPanelToViewport(); // Ensure panel fits viewport
                            console.log('[Content] 💬 Restored chat panel: OPEN');
                        } else {
                            hudState.chatPanel.classList.remove('visible');
                            if (promptBtn) {
                                promptBtn.classList.remove('active');
                                promptBtn.textContent = 'Open Prompt';
                            }
                            console.log('[Content] 💬 Restored chat panel: CLOSED');
                        }
                    }
                    // 💬 Restore chat input text
                    if (response.chatInput && hudState.chatPanel) {
                        const chatInput = hudState.chatPanel.querySelector('.ome-chat-input');
                        const typingPreview = hudState.chatPanel.querySelector('.typing-preview');
                        if (chatInput) {
                            chatInput.value = response.chatInput;
                            if (typingPreview) typingPreview.textContent = response.chatInput;
                            console.log('[Content] 💬 Restored chat input from SW');
                        }
                    }
                    // 📚 Restore sidebar state
                    if (response.sidebarOpen && hudState.sidebar) {
                        hudState.sidebarOpen = true;
                        hudState.sidebar.classList.add('open');
                        hudState.hud?.classList.add('sidebar-open');
                        console.log('[Content] 📚 Restored sidebar state from SW');
                        loadSidebarChats();  // Load chats on restore
                    }

                    // 📐 Calculate optimal panel width AFTER position is restored (if no saved size)
                    if (!response.chatPanelSize && hudState.chatPanel && !hudState.panelManuallyResized) {
                        calculateOptimalPanelWidth(hudState.chatPanel);
                    }

                    // 💬 Load active chat if one exists, otherwise start fresh
                    hudTrace.log(`activeChatId from SW: ${response.activeChatId || 'none'}`);
                    if (response.activeChatId && response.activeChatId !== chatState.currentChatId) {
                        chatState.currentChatId = response.activeChatId;
                        hudTrace.log('calling loadChat');
                        loadChat(response.activeChatId, true);
                    } else if (!response.activeChatId) {
                        hudTrace.log('no active chat - starting new');
                        startNewChat();
                    } else {
                        hudTrace.log('same chat as current - skipping');
                    }

                }
            });
        } catch (e) {
            console.warn('[Content] Error getting orb state:', e);
        }

        // 📐 Keep orb visible on window resize
        window.addEventListener('resize', clampOrbToViewport);

        // 🛑 Prevent wheel events on HUD from scrolling the underlying page
        hudState.hud.addEventListener('wheel', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // 💬 Sync state when tab becomes visible (user switches back to tab)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('[Content] 💬 Tab visible, syncing state');
                // Sync chat messages if we have an active chat
                if (chatState.currentChatId) {
                    loadChat(chatState.currentChatId, true);  // skipBroadcast
                }
                // Sync input text from other tabs
                syncHUDPromptInput();
                syncOrbChatInput();
            }
        });

        console.log('[Content] 🎛️ HUD initialized');
    }

    /** 🔄 Toggle HUD visibility */
    function toggleHUD() {
        if (!hudState.hud) initHUD();
        hudState.visible = !hudState.visible;
        hudState.hud.classList.toggle('visible', hudState.visible);
        // 🔒 Lock page scroll when HUD visible so wheel works for messages/sidebar only
        document.body.style.overflow = hudState.visible ? 'hidden' : '';
        // Render from shared state when opening HUD
        if (hudState.visible) {
            renderChatMessages();
            updateHUDPromptVisibility();  // Sync prompt state from orb view
            // Sync chat input text from orb
            syncHUDPromptInput();
            // 🎯 Focus prompt textarea when HUD opens (stop orb guard, start HUD guard)
            focusHUDPromptGuard(true);
        } else {
            // 🎯 Stop HUD focus guard when closing
            stopHUDPromptFocusGuard();
            // Sync orb chat input when closing HUD (in case HUD prompt was edited)
            syncOrbChatInput();
            // 🎯 Activate orb focus guard when switching to orb view
            if (hudState.chatVisible) {
                focusOrbInputGuard(true);
            }
        }
        console.log('[Content] 🎛️ HUD:', hudState.visible ? 'visible' : 'hidden');
    }

    /**
     * 💬 Update HUD prompt visibility based on shared hudState.chatVisible
     */
    function updateHUDPromptVisibility() {
        if (!hudState.hud) return;
        const promptWrapper = hudState.hud.querySelector('.ome-hud-prompt-wrapper');
        const promptBtn = hudState.hud.querySelector('.ome-hud-prompt-btn');
        if (promptWrapper) {
            promptWrapper.classList.toggle('hidden-by-user', !hudState.chatVisible);
        }
        hudState.hud.classList.toggle('prompt-hidden', !hudState.chatVisible);
        if (promptBtn) {
            promptBtn.classList.toggle('active', hudState.chatVisible);
            promptBtn.textContent = hudState.chatVisible ? 'HIDE PROMPT' : 'Show Prompt';
        }
    }

    /**
     * 🎯 Stop any active HUD prompt focus guard
     */
    function stopHUDPromptFocusGuard() {
        if (hudState.hudFocusGuardCleanup) {
            hudState.hudFocusGuardCleanup();
            hudState.hudFocusGuardCleanup = null;
        }
    }

    /**
     * 🎯 Focus HUD prompt textarea with guard against focus-stealing
     * Same pattern as focusOrbInputGuard but for HUD view
     * @param {boolean} [force=false] - ignore user-requested blur once
     */
    function focusHUDPromptGuard(force = false) {
        // Only run if HUD is visible
        if (!hudState.hud || !hudState.visible || !hudState.chatVisible) return;
        if (hudState.userBlurRequested && !force) return;

        const promptTextarea = hudState.hud.querySelector('.ome-hud-prompt-textarea');
        if (!promptTextarea) return;

        // Stop orb focus guard - HUD has priority when visible
        stopOrbInputFocusGuard();
        stopHUDPromptFocusGuard();

        const requestFocus = () => {
            // Double-check HUD is still visible
            if (!hudState.visible || !hudState.chatVisible || hudState.userBlurRequested) return;
            if (promptTextarea.disabled || promptTextarea.getAttribute('aria-disabled') === 'true') return;
            if (promptTextarea.offsetParent === null) return; // hidden
            if (promptTextarea.tabIndex < 0) promptTextarea.tabIndex = 0;
            promptTextarea.focus({ preventScroll: true });
            const len = promptTextarea.value?.length || 0;
            try {
                promptTextarea.setSelectionRange(len, len);
            } catch (e) {
                console.warn('[HUD] Could not set selection on HUD prompt:', e);
            }
            console.log('[HUD] 🎯 Focused HUD prompt textarea');
        };

        const onPointerDown = (event) => {
            // Check if click is outside HUD
            const hud = hudState.hud;
            if (hud && !hud.contains(event.target)) {
                hudState.userBlurRequested = true;
                stopHUDPromptFocusGuard();
            }
        };

        const onFocusOut = () => {
            if (hudState.userBlurRequested || !hudState.visible || !hudState.chatVisible) {
                stopHUDPromptFocusGuard();
                return;
            }
            // Re-focus after a short delay (let other handlers complete)
            requestAnimationFrame(requestFocus);
        };

        hudState.userBlurRequested = false;
        promptTextarea.addEventListener('focusout', onFocusOut);
        document.addEventListener('pointerdown', onPointerDown, true);

        hudState.hudFocusGuardCleanup = () => {
            promptTextarea.removeEventListener('focusout', onFocusOut);
            document.removeEventListener('pointerdown', onPointerDown, true);
            hudState.hudFocusGuardCleanup = null;
        };

        requestFocus();
    }

    /**
     * 🎯 Stop any active orb input focus guard
     */
    function stopOrbInputFocusGuard() {
        if (hudState.focusGuardCleanup) {
            hudState.focusGuardCleanup();
            hudState.focusGuardCleanup = null;
        }
    }

    /**
     * 🎯 Focus orb chat input with guard against focus-stealing scripts
     * @param {boolean} [force=false] - ignore user-requested blur once
     */
    function focusOrbInputGuard(force = false) {
        // 🛑 Skip if HUD is visible - HUD view has focus priority
        if (hudState.visible) return;

        const chatPanel = hudState.chatPanel;
        if (!chatPanel || !hudState.chatVisible) return;
        if (hudState.userBlurRequested && !force) return;

        const input = chatPanel.querySelector('.ome-chat-input');
        if (!input) return;

        // Stop HUD focus guard - orb has priority when HUD is hidden
        stopHUDPromptFocusGuard();
        stopOrbInputFocusGuard();

        const requestFocus = () => {
            // 🛑 Double-check HUD is still hidden
            if (hudState.visible) return;
            if (!hudState.chatVisible || hudState.userBlurRequested) return;
            if (input.disabled || input.getAttribute('aria-disabled') === 'true') return;
            if (input.offsetParent === null) return; // hidden
            if (input.tabIndex < 0) input.tabIndex = 0;
            input.focus({ preventScroll: true });
            const len = input.value?.length || 0;
            try {
                input.setSelectionRange(len, len);
            } catch (e) {
                console.warn('[Content] Could not set selection on orb input:', e);
            }
        };

        const onPointerDown = (event) => {
            if (!chatPanel.contains(event.target)) {
                hudState.userBlurRequested = true; // user clicked away
                stopOrbInputFocusGuard();
            }
        };

        const onFocusOut = () => {
            // 🛑 Stop if HUD became visible
            if (hudState.visible) {
                stopOrbInputFocusGuard();
                return;
            }
            if (hudState.userBlurRequested || !hudState.chatVisible) {
                stopOrbInputFocusGuard();
                return;
            }
            requestFocus();
        };

        hudState.userBlurRequested = false;
        input.addEventListener('focusout', onFocusOut);
        document.addEventListener('pointerdown', onPointerDown, true);

        hudState.focusGuardCleanup = () => {
            input.removeEventListener('focusout', onFocusOut);
            document.removeEventListener('pointerdown', onPointerDown, true);
            hudState.focusGuardCleanup = null;
        };

        requestFocus();
    }

    /**
     * 💬 Sync HUD prompt input from service worker (shared with orb chat input)
     */
    function syncHUDPromptInput() {
        const promptTextarea = hudState.hud?.querySelector('.ome-hud-prompt-textarea');
        if (!promptTextarea) return;
        try {
            chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                if (response?.ok && response.chatInput !== undefined) {
                    promptTextarea.value = response.chatInput;
                    // Trigger resize
                    promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        } catch (e) {
            console.warn('[Content] Could not sync HUD prompt input:', e);
        }
    }

    /**
     * 💬 Sync orb chat input from service worker (shared with HUD prompt)
     */
    function syncOrbChatInput() {
        const orbInput = hudState.chatPanel?.querySelector('.ome-chat-input');
        if (!orbInput) return;
        try {
            chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                if (response?.ok && response.chatInput !== undefined) {
                    orbInput.value = response.chatInput;
                    // Trigger resize via input event
                    orbInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        } catch (e) {
            console.warn('[Content] Could not sync orb chat input:', e);
        }
    }

    /** 💬 Toggle Chat Panel visibility */
    function toggleChatPanel() {
        if (!hudState.chatPanel) return;
        hudState.chatVisible = !hudState.chatVisible;
        hudState.chatPanel.classList.toggle('visible', hudState.chatVisible);
        // Toggle active state and text on prompt button
        const promptBtn = hudState.orb?.querySelector('.ome-prompt-btn');
        if (promptBtn) {
            promptBtn.classList.toggle('active', hudState.chatVisible);
            promptBtn.textContent = hudState.chatVisible ? 'HIDE PROMPT' : 'Open Prompt';
        }
        // Focus input and render from shared state when opening
        if (hudState.chatVisible) {
            // 📐 Recalculate optimal width if not manually resized (ensures max size for current viewport)
            if (!hudState.panelManuallyResized) {
                calculateOptimalPanelWidth(hudState.chatPanel);
            }
            constrainOrbToViewport(); // Ensure panel + orb fit viewport
            const input = hudState.chatPanel.querySelector('.ome-chat-input');
            // Sync input text from service worker (shared with HUD prompt)
            if (input) {
                try {
                    chrome.runtime.sendMessage({ type: 'get_orb_state' }, (response) => {
                        if (response?.ok && response.chatInput !== undefined) {
                            input.value = response.chatInput;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        hudState.userBlurRequested = false;
                        focusOrbInputGuard(true);
                    });
                } catch (e) {
                    hudState.userBlurRequested = false;
                    focusOrbInputGuard(true);
                }
            }
            renderChatMessages();
        } else {
            // When closing, ensure orb still fits within viewport
            constrainOrbToViewport();
            stopOrbInputFocusGuard();
        }
        // 🔄 Sync HUD prompt visibility
        updateHUDPromptVisibility();
        // 💾 Persist chat visibility to service worker
        try {
            chrome.runtime.sendMessage({ type: 'set_orb_state', chatVisible: hudState.chatVisible });
        } catch (e) {
            console.warn('[Content] Could not persist chat visibility:', e);
        }
        console.log('[Content] 💬 Chat panel:', hudState.chatVisible ? 'visible' : 'hidden');
    }

    /**
     * 📚 Toggle Sidebar visibility
     * @param {boolean} [forceState] - Optional: force open (true) or closed (false)
     */
    function toggleSidebar(forceState) {
        if (!hudState.sidebar) return;

        // Determine new state
        if (typeof forceState === 'boolean') {
            hudState.sidebarOpen = forceState;
        } else {
            hudState.sidebarOpen = !hudState.sidebarOpen;
        }

        // Reset forced-narrow flag when sidebar is closed
        if (!hudState.sidebarOpen) {
            hudState.sidebarForcedNarrow = false;
        }

        // Apply state to DOM
        hudState.sidebar.classList.toggle('open', hudState.sidebarOpen);
        hudState.hud?.classList.toggle('sidebar-open', hudState.sidebarOpen);

        // 🙈 Check if prompt needs to be hidden due to narrow viewport (manual toggle)
        checkHudPromptVisibility(true);

        // 💾 Persist sidebar state to service worker
        try {
            chrome.runtime.sendMessage({ type: 'set_orb_state', sidebarOpen: hudState.sidebarOpen });
        } catch (e) {
            console.warn('[Content] Could not persist sidebar state:', e);
        }

        console.log('[Content] 📚 Sidebar:', hudState.sidebarOpen ? 'open' : 'closed');

        // 📚 Load chats when sidebar opens
        if (hudState.sidebarOpen) {
            loadSidebarChats();
        }
    }

    /**
     * 📚 Load chat list into sidebar via GetChatList capability
     * Fetches lightweight chat summaries (project_id="default") and renders them
     */
    function loadSidebarChats() {
        console.log('[Content] 📚 Loading sidebar chats...');

        chrome.runtime.sendMessage(
            { type: 'execute_capability', action: 'GetChatList', params: { project_id: 'default' } },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Content] 📚 Failed to load chats:', chrome.runtime.lastError);
                    return;
                }

                if (!response?.ok || !response?.result?.chats) {
                    console.error('[Content] 📚 Invalid response:', response);
                    return;
                }

                const chats = response.result.chats;
                console.log('[Content] 📚 Loaded', chats.length, 'chats');
                renderSidebarChats(chats);
            }
        );
    }

    /**
     * 📚 Render chat list in sidebar
     * @param {Array} chats - Array of {chat_id, title, date_short, message_count}
     */
    function renderSidebarChats(chats) {
        const chatList = hudState.sidebar?.querySelector('.ome-sidebar-chat-list');
        if (!chatList) return;

        // 📚 Store visible chats for LLM context
        hudState.visibleChats = chats.map(c => ({
            chat_id: c.chat_id,
            title: c.title,
            message_count: c.message_count,
            date_short: c.date_short || ""
        }));

        // Clear chat list but preserve collapsed state
        const wasCollapsed = chatList.classList.contains('collapsed');
        chatList.innerHTML = '';
        if (wasCollapsed) chatList.classList.add('collapsed');

        // Note: New chat placeholder only shown when user clicks "+ New Chat"
        // Not shown automatically on page load

        // Always add empty message element (for filtering "no results")
        const empty = document.createElement('div');
        empty.className = 'ome-sidebar-empty';
        empty.textContent = chats.length === 0 ? 'No chats yet' : '';
        empty.style.display = chats.length === 0 ? '' : 'none';
        chatList.appendChild(empty);

        if (chats.length === 0) {
            return;
        }

        // Render chat items
        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'ome-sidebar-chat';
            item.dataset.chatId = chat.chat_id;

            item.innerHTML = `
                <div class="ome-sidebar-chat-info">
                    <div class="ome-sidebar-chat-title">${escapeHtml(chat.title)}</div>
                    <div class="ome-sidebar-chat-meta">${chat.date_short} · ${chat.message_count} msgs</div>
                </div>
                <div class="ome-sidebar-chat-actions">
                    <button class="ome-sidebar-action-btn ome-action-rename" title="Rename">
                        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button class="ome-sidebar-action-btn ome-action-delete" title="Delete">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            `;

            // Click on chat info to load chat
            const chatInfo = item.querySelector('.ome-sidebar-chat-info');
            chatInfo.addEventListener('click', () => {
                console.log('[Content] 📚 Chat clicked:', chat.chat_id);
                loadChat(chat.chat_id);
            });

            // Rename action
            item.querySelector('.ome-action-rename').addEventListener('click', (e) => {
                e.stopPropagation();
                renameChat(chat.chat_id, chat.title);
            });

            // Delete action - show confirm popup
            item.querySelector('.ome-action-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteConfirm(item, chat.chat_id, chat.title);
            });

            chatList.appendChild(item);
        });

        // 📚 Re-apply active state to current chat after render
        if (chatState.currentChatId) {
            markActiveChatInSidebar(chatState.currentChatId);
        }
    }

    /**
     * 🔍 Filter sidebar chats by search query (client-side filter)
     * @param {string} query - Search query to filter by
     */
    function filterSidebarChats(query) {
        const chatList = hudState.sidebar?.querySelector('.ome-sidebar-chat-list');
        if (!chatList) return;

        const items = chatList.querySelectorAll('.ome-sidebar-chat');
        items.forEach(item => {
            const title = item.querySelector('.ome-sidebar-chat-title')?.textContent?.toLowerCase() || '';
            if (!query || title.includes(query)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });

        // Show/hide empty message
        const visibleItems = chatList.querySelectorAll('.ome-sidebar-chat:not([style*="display: none"])');
        const emptyMsg = chatList.querySelector('.ome-sidebar-empty');
        if (emptyMsg) {
            if (visibleItems.length === 0 && query) {
                emptyMsg.textContent = 'No matching chats';
                emptyMsg.style.display = '';
            } else if (visibleItems.length === 0) {
                emptyMsg.textContent = 'No chats yet';
                emptyMsg.style.display = '';
            } else {
                emptyMsg.style.display = 'none';
            }
        }
    }

    /**
     * 📚 Load chat by ID with optional tail limit
     */
    function loadChat(chatId, skipBroadcast = false, tail = 10) {
        hudTrace.log(`loadChat(${chatId}) START`);

        chrome.runtime.sendMessage(
            { type: 'execute_capability', action: 'LoadChat', params: { chat_id: chatId, tail } },
            (response) => {
                hudTrace.log('loadChat response received');
                if (chrome.runtime.lastError) {
                    hudTrace.log(`loadChat ERROR: ${chrome.runtime.lastError.message}`);
                    return;
                }

                if (!response?.ok || !response?.result?.chat) {
                    console.log('[Content] 📚 Chat not found, starting fresh:', chatId);
                    // Chat was deleted or doesn't exist - start fresh
                    chatState.currentChatId = null;
                    chatState.messages = [];
                    chatState.hasMoreMessages = false;
                    chatState.totalMessages = 0;
                    if (!skipBroadcast) {
                        chrome.runtime.sendMessage({ type: 'set_orb_state', activeChatId: null });
                    }
                    renderChatMessages();
                    // Refresh sidebar to remove stale entry
                    loadSidebarChats();
                    return;
                }

                const chat = response.result.chat;
                const truncated = chat._truncated || false;
                const totalMessages = chat._total_messages || chat.messages?.length || 0;
                const hasMore = chat._has_more || false;

                console.log('[Content] 📚 Loaded chat:', chat.chat_id,
                    `${chat.messages?.length}/${totalMessages} messages`,
                    truncated ? '(truncated)' : '(full)',
                    hasMore ? '[has more]' : '');

                // Store active chat ID in service worker (skip if syncing to prevent loops)
                if (!skipBroadcast) {
                    chrome.runtime.sendMessage({ type: 'set_orb_state', activeChatId: chatId });
                }

                // Update chatState with loaded messages (existing system)
                chatState.currentChatId = chatId;
                chatState.messages = (chat.messages || []).map(m => ({
                    role: m.role,
                    content: m.content,
                    id: m.id
                }));
                chatState.hasMoreMessages = hasMore;
                chatState.totalMessages = totalMessages;

                // Remove new chat placeholder if present
                removeNewChatPlaceholder();

                // Mark active chat in sidebar
                markActiveChatInSidebar(chatId);

                // Render using existing function (renders to both orb and HUD)
                hudTrace.log('rendering chat messages');
                renderChatMessages();
                hudTrace.log('loadChat() DONE');
            }
        );
    }

    /**
     * 📚 Load full chat history (all messages)
     * Used when LLM needs full context or user scrolls up
     */
    function loadFullChatHistory(chatId) {
        console.log('[Content] 📚 Loading FULL chat history:', chatId);
        loadChat(chatId, true, null);  // tail=null means all messages
    }

    /**
     * 📚 Start a new chat (clean slate)
     * Clears messages and resets active chat ID
     */
    function startNewChat() {
        console.log('[Content] 📚 Starting new chat');

        // Clear chat state
        chatState.currentChatId = null;
        chatState.messages = [];
        chatState.pendingTitle = null;

        // Clear active chat ID in service worker
        chrome.runtime.sendMessage({ type: 'set_orb_state', activeChatId: null });

        // Remove active class from all sidebar chats
        hudState.sidebar?.querySelectorAll('.ome-sidebar-chat').forEach(el => {
            el.classList.remove('active');
        });

        // Show new chat placeholder in sidebar
        showNewChatPlaceholder();

        // Re-render (clears messages)
        renderChatMessages();
    }

    /**
     * 📚 Show a "New Chat" placeholder in the sidebar
     * Displayed until first message is sent or chat is renamed
     */
    function showNewChatPlaceholder() {
        const placeholderContainer = hudState.sidebar?.querySelector('.ome-sidebar-new-chat-placeholder');
        if (!placeholderContainer) return;

        // Remove any existing placeholder
        placeholderContainer.innerHTML = '';

        // Use pending title if set
        const title = chatState.pendingTitle || 'New Chat';

        // Create placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'ome-sidebar-chat new-chat active';
        placeholder.innerHTML = `
            <div class="ome-sidebar-chat-info">
                <div class="ome-sidebar-chat-title">${escapeHtml(title)}</div>
                <div class="ome-sidebar-chat-meta">Unsaved</div>
            </div>
            <div class="ome-sidebar-chat-actions">
                <button class="ome-sidebar-action-btn ome-action-rename" title="Rename">
                    <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
            </div>
        `;

        // Rename action - click anywhere on placeholder to edit
        placeholder.style.cursor = 'pointer';
        placeholder.addEventListener('click', (e) => {
            e.stopPropagation();
            renameNewChat();
        });

        // Insert into placeholder container (above Show Chats)
        placeholderContainer.appendChild(placeholder);
    }

    /**
     * 📚 Rename the new chat placeholder (shows tick/cross, creates chat on confirm)
     */
    function renameNewChat() {
        const placeholder = hudState.sidebar?.querySelector('.ome-sidebar-new-chat-placeholder .ome-sidebar-chat.new-chat');
        if (!placeholder) return;

        const titleEl = placeholder.querySelector('.ome-sidebar-chat-title');
        const actionsDiv = placeholder.querySelector('.ome-sidebar-chat-actions');
        if (!titleEl || !actionsDiv) return;

        // Already editing? Don't reinit
        if (titleEl.contentEditable === 'true') return;

        const currentTitle = chatState.pendingTitle || 'New Chat';
        const penBtn = actionsDiv.querySelector('.ome-action-rename');

        // Hide pen button, show tick/cross
        if (penBtn) penBtn.style.display = 'none';

        const confirmPopup = document.createElement('div');
        confirmPopup.className = 'ome-confirm-edit';
        confirmPopup.innerHTML = `
            <button class="ome-confirm-edit-btn yes" title="Create chat">
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="ome-confirm-edit-btn no" title="Cancel">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;
        actionsDiv.appendChild(confirmPopup);

        // Make title editable
        titleEl.dataset.originalTitle = currentTitle;
        titleEl.contentEditable = 'true';
        titleEl.classList.add('editing');
        titleEl.focus();

        // Select all text - use execCommand for Shadow DOM compatibility
        document.execCommand('selectAll', false, null);

        // Cleanup function - restore UI state
        const cleanup = () => {
            titleEl.contentEditable = 'false';
            titleEl.classList.remove('editing');
            titleEl.onkeydown = null;
            titleEl.onblur = null;
            window.getSelection()?.removeAllRanges();
            confirmPopup.remove();
            if (penBtn) penBtn.style.display = '';
        };

        // Save function - create chat and load it
        const saveAndCreate = () => {
            const newTitle = titleEl.textContent.trim();
            cleanup();

            if (newTitle && newTitle !== 'New Chat') {
                console.log('[Content] 📚 Creating chat with title:', newTitle);
                // Create the chat file via capability
                chrome.runtime.sendMessage(
                    { type: 'execute_capability', action: 'CreateChat', params: { title: newTitle } },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Content] 📚 Failed to create chat:', chrome.runtime.lastError);
                            return;
                        }
                        if (response?.ok && response?.result?.chat_id) {
                            console.log('[Content] 📚 Chat created:', response.result.chat_id);
                            // Load the new chat (removes placeholder, updates sidebar)
                            loadChat(response.result.chat_id);
                            loadSidebarChats();
                        } else {
                            console.error('[Content] 📚 CreateChat failed:', response);
                        }
                    }
                );
            } else {
                // No valid title - just update display
                chatState.pendingTitle = null;
                titleEl.textContent = 'New Chat';
            }
        };

        // Cancel function - restore original
        const cancelEdit = () => {
            cleanup();
            titleEl.textContent = currentTitle;
        };

        // Tick button - save and create
        confirmPopup.querySelector('.yes').addEventListener('click', (e) => {
            e.stopPropagation();
            saveAndCreate();
        });

        // Cross button - cancel
        confirmPopup.querySelector('.no').addEventListener('click', (e) => {
            e.stopPropagation();
            cancelEdit();
        });

        // Handle keyboard
        titleEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveAndCreate();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        };

        // Blur saves - delay to allow click-to-reposition inside text
        titleEl.onblur = () => {
            setTimeout(() => {
                // If element regained focus (user clicked inside), don't save
                if (hudState.shadow?.activeElement === titleEl) return;
                if (titleEl.contentEditable === 'true') {
                    saveAndCreate();
                }
            }, 150);
        };
    }

    /**
     * 📚 Remove the new chat placeholder from sidebar
     * Also resets the "New Chat" button to its default state
     */
    function removeNewChatPlaceholder() {
        const container = hudState.sidebar?.querySelector('.ome-sidebar-new-chat-placeholder');
        if (container) container.innerHTML = '';

        // Reset the New Chat button state
        const newChatBtn = hudState.sidebar?.querySelector('.ome-sidebar-new-chat');
        if (newChatBtn) {
            newChatBtn.classList.remove('active');
            const textSpan = newChatBtn.querySelector('.text');
            if (textSpan) textSpan.textContent = 'New Chat';
        }
    }

    /**
     * 📚 Rename a chat
     * @param {string} chatId - The chat ID to rename
     * @param {string} currentTitle - Current title for prompt default
     */
    function renameChat(chatId, currentTitle) {
        console.log('[Content] 📚 Rename requested for:', chatId, 'current title:', currentTitle);

        // Find the chat item and title element
        const chatItem = hudState.sidebar?.querySelector(`.ome-sidebar-chat[data-chat-id="${chatId}"]`);
        if (!chatItem) return;

        const titleEl = chatItem.querySelector('.ome-sidebar-chat-title');
        if (!titleEl) return;

        // Make it editable - store original for escape handling
        titleEl.dataset.originalTitle = currentTitle;
        titleEl.contentEditable = 'true';
        titleEl.classList.add('editing');
        titleEl.focus();

        // Select all text - use execCommand for Shadow DOM compatibility
        document.execCommand('selectAll', false, null);

        // Save function
        const saveRename = () => {
            const newTitle = titleEl.textContent.trim();
            titleEl.contentEditable = 'false';
            titleEl.classList.remove('editing');
            titleEl.blur();
            window.getSelection()?.removeAllRanges();

            if (!newTitle || newTitle === currentTitle) {
                titleEl.textContent = currentTitle; // Restore original
                return;
            }

            console.log('[Content] 📚 Renaming chat:', chatId, 'to', newTitle);

            chrome.runtime.sendMessage(
                { type: 'execute_capability', action: 'RenameChat', params: { chat_id: chatId, title: newTitle } },
                (response) => {
                    if (chrome.runtime.lastError || !response?.ok) {
                        console.error('[Content] 📚 Rename failed:', response?.error || chrome.runtime.lastError);
                        titleEl.textContent = currentTitle; // Restore on error
                        return;
                    }
                    console.log('[Content] 📚 Chat renamed successfully');
                }
            );
        };

        // Cancel function
        const cancelRename = () => {
            titleEl.contentEditable = 'false';
            titleEl.classList.remove('editing');
            titleEl.blur();
            window.getSelection()?.removeAllRanges();
            titleEl.textContent = currentTitle;
        };

        // Handle keyboard
        titleEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelRename();
            }
        };

        // Save on blur - delay to allow click-to-reposition inside text
        titleEl.onblur = () => {
            setTimeout(() => {
                // If element regained focus (user clicked inside), don't save
                if (hudState.shadow?.activeElement === titleEl) return;
                if (titleEl.contentEditable === 'true') {
                    saveRename();
                }
            }, 150);
        };
    }

    /**
     * 📚 Show confirm delete popup on chat item
     * @param {HTMLElement} chatItem - The chat item element
     * @param {string} chatId - The chat ID to delete
     * @param {string} title - Chat title for display
     */
    function showDeleteConfirm(chatItem, chatId, title) {
        // Guard: if this item already has confirm buttons, don't add more
        if (chatItem.querySelector('.ome-confirm-delete')) return;

        // Remove any existing confirm popups from OTHER items (and restore their pens)
        document.querySelectorAll('.ome-confirm-delete').forEach(el => {
            const otherItem = el.closest('.ome-sidebar-chat');
            if (otherItem) {
                const otherPen = otherItem.querySelector('.ome-action-rename');
                if (otherPen) otherPen.style.display = '';
            }
            el.remove();
        });

        // Hide just the pen (keep trash visible)
        const penBtn = chatItem.querySelector('.ome-action-rename');
        if (penBtn) penBtn.style.display = 'none';

        // Create confirm buttons (tick + X) - insert before the trash
        const popup = document.createElement('div');
        popup.className = 'ome-confirm-delete';
        popup.innerHTML = `
            <button class="ome-confirm-delete-btn yes" title="Confirm delete">
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="ome-confirm-delete-btn no" title="Cancel">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;

        // Restore on dismiss
        const restore = () => {
            popup.remove();
            if (penBtn) penBtn.style.display = '';
            document.removeEventListener('click', clickOutside);
        };

        // Tick - confirm delete
        popup.querySelector('.yes').addEventListener('click', (e) => {
            e.stopPropagation();
            restore();
            deleteChat(chatId, title);
        });

        // X - cancel
        popup.querySelector('.no').addEventListener('click', (e) => {
            e.stopPropagation();
            restore();
        });

        // Click outside to dismiss
        const clickOutside = (e) => {
            if (!popup.contains(e.target)) {
                restore();
            }
        };
        setTimeout(() => document.addEventListener('click', clickOutside), 10);

        // Insert into actions div (before trash)
        const actionsDiv = chatItem.querySelector('.ome-sidebar-chat-actions');
        const trashBtn = chatItem.querySelector('.ome-action-delete');
        if (actionsDiv && trashBtn) {
            actionsDiv.insertBefore(popup, trashBtn);
        } else {
            chatItem.appendChild(popup);
        }
    }

    /**
     * 📚 Delete a chat (called after confirmation)
     * @param {string} chatId - The chat ID to delete
     * @param {string} title - Chat title for logging
     */
    function deleteChat(chatId, title) {
        console.log('[Content] 📚 Deleting chat:', chatId);

        chrome.runtime.sendMessage(
            { type: 'execute_capability', action: 'DeleteChat', params: { chat_id: chatId } },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Content] 📚 Failed to delete chat:', chrome.runtime.lastError);
                    return;
                }

                if (!response?.ok) {
                    console.error('[Content] 📚 Delete failed:', response?.error);
                    return;
                }

                console.log('[Content] 📚 Chat deleted successfully');

                // If this was the active chat, clear it
                if (chatState.currentChatId === chatId) {
                    startNewChat();
                }

                // Refresh sidebar chat list
                loadSidebarChats();
            }
        );
    }

    /**
     * 📚 Mark the active chat in sidebar
     * @param {string} chatId - The active chat ID
     */
    function markActiveChatInSidebar(chatId) {
        const sidebar = hudState.sidebar;
        if (!sidebar) return;

        // Remove active class from all
        sidebar.querySelectorAll('.ome-sidebar-chat').forEach(el => {
            el.classList.remove('active');
        });

        // Add active class to selected
        const active = sidebar.querySelector(`[data-chat-id="${chatId}"]`);
        if (active) {
            active.classList.add('active');
        }
    }

    /**
     * 🔒 Escape HTML to prevent XSS
     * @param {string} str - Raw string
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * 🙈 Check if HUD prompt should be hidden due to narrow viewport with sidebar open
     * @param {boolean} isManualToggle - True if called from manual sidebar toggle, false if from resize
     *
     * Behavior:
     * - Resize makes viewport narrow while sidebar open → auto-close sidebar (unless user forced it open)
     * - Manual sidebar open when narrow → hide prompt, set forcedNarrow flag
     * - User can re-open sidebar after auto-close; forcedNarrow flag prevents re-auto-close
     */
    function checkHudPromptVisibility(isManualToggle = false) {
        if (!hudState.hud) return;

        const promptWrapper = hudState.hud.querySelector('.ome-hud-prompt-wrapper');
        const inputArea = hudState.hud.querySelector('.ome-hud-input-area');
        const messagesArea = hudState.hud.querySelector('.ome-hud-messages-area');
        if (!promptWrapper || !inputArea) return;

        // Minimum space needed: sidebar (284px with gap) + prompt min (240px) + right controls (~90px)
        const minWidthNeeded = 284 + 240 + 90; // 614px
        const isNarrow = window.innerWidth < minWidthNeeded;

        if (hudState.sidebarOpen && isNarrow) {
            if (!isManualToggle && !hudState.sidebarForcedNarrow) {
                // Resize made it narrow and user hasn't forced it open - auto-close sidebar
                console.log('[Content] 📐 Viewport too narrow - auto-closing sidebar');
                toggleSidebar(false);
                return;
            }
            // Manual toggle OR user previously forced it open - hide prompt, keep sidebar
            if (isManualToggle) {
                hudState.sidebarForcedNarrow = true;
                console.log('[Content] 📚 Sidebar forced open in narrow viewport');
            }
            promptWrapper.classList.add('hidden-for-sidebar');
            inputArea.classList.add('prompt-hidden');
            messagesArea?.classList.add('hidden-for-sidebar');
            console.log('[Content] 🙈 Prompt hidden - viewport too narrow for sidebar + prompt');
        } else {
            // Enough space OR sidebar closed - show prompt/messages and centre layout
            promptWrapper.classList.remove('hidden-for-sidebar');
            inputArea.classList.remove('prompt-hidden');
            messagesArea?.classList.remove('hidden-for-sidebar');

            // Reset forced flag when viewport becomes wide enough
            if (!isNarrow && hudState.sidebarForcedNarrow) {
                hudState.sidebarForcedNarrow = false;
                console.log('[Content] 📚 Viewport wide enough - reset forcedNarrow flag');
            }
        }
    }

    // 🎛️ HUD message handler
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        // Toggle HUD visibility
        if (message.type === 'toggle_hud') {
            console.log('[Content] 🎛️ toggle_hud received');
            if (!hudState.host) initHUD();
            toggleHUD();
            sendResponse({ ok: true, visible: hudState.visible });
            return true;
        }

        // 🎨 Set orb theme via CLI/WebSocket
        if (message.type === 'set_orb_theme') {
            const themeName = message.theme;
            console.log(`[Content] 🎨 set_orb_theme received: ${themeName}`);

            if (!hudState.host) initHUD();

            if (ORB_THEMES[themeName]) {
                setOrbTheme(themeName);
                sendResponse({ ok: true, theme: themeName, available: Object.keys(ORB_THEMES) });
            } else {
                sendResponse({ ok: false, error: `Unknown theme: ${themeName}`, available: Object.keys(ORB_THEMES) });
            }
            return true;
        }

        // 🎨 Get available themes
        if (message.type === 'get_orb_themes') {
            console.log('[Content] 🎨 get_orb_themes received');
            const themes = Object.entries(ORB_THEMES).map(([key, t]) => ({ key, name: t.name }));
            sendResponse({ ok: true, current: hudState.theme, themes });
            return true;
        }

        // 🐰 Apply orb theme from popup (forwarded via SW)
        if (message.type === 'apply_orb_theme') {
            const themeName = message.theme;
            console.log(`[Content] 🐰 apply_orb_theme from popup: ${themeName}`);

            if (!hudState.host) initHUD();

            if (ORB_THEMES[themeName]) {
                // Use setOrbTheme to persist and broadcast to other tabs
                setOrbTheme(themeName);
                sendResponse({ ok: true, theme: themeName });
            } else {
                sendResponse({ ok: false, error: `Unknown theme: ${themeName}` });
            }
            return true;
        }

        // 🔄 Sync orb position from another tab
        if (message.type === 'sync_orb_position') {
            console.log('[Content] 🔄 sync_orb_position received:', message.position);
            // Ensure orb exists before applying position
            if (!hudState.host) initHUD();
            applyOrbPosition(message.position);
            sendResponse({ ok: true });
            return true;
        }

        // 🎨 Sync orb theme from another tab
        if (message.type === 'sync_orb_theme') {
            console.log('[Content] 🎨 sync_orb_theme received:', message.theme);
            if (!hudState.host) initHUD();
            // Update state first (same pattern as chatVisible)
            if (ORB_THEMES[message.theme]) {
                hudState.theme = message.theme;
                // Update orb view if exists
                if (hudState.orb) {
                    applyOrbTheme(message.theme);
                }
                // Update HUD view if exists
                if (hudState.hud) {
                    updateHUDOrb(hudState.hud, message.theme);
                }
            }
            sendResponse({ ok: true });
            return true;
        }

        // 💬 Sync chat visibility from another tab
        if (message.type === 'sync_chat_visible') {
            console.log('[Content] 💬 sync_chat_visible received:', message.chatVisible);
            // Ensure orb exists before applying
            if (!hudState.host) initHUD();
            hudState.chatVisible = message.chatVisible;
            // Update orb view
            if (hudState.chatPanel) {
                hudState.chatPanel.classList.toggle('visible', message.chatVisible);
                const promptBtn = hudState.orb?.querySelector('.ome-prompt-btn');
                if (promptBtn) {
                    promptBtn.classList.toggle('active', message.chatVisible);
                    promptBtn.textContent = message.chatVisible ? 'HIDE PROMPT' : 'Open Prompt';
                }
            }
            // Update HUD view
            updateHUDPromptVisibility();
            sendResponse({ ok: true });
            return true;
        }

        // 📐 Sync chat panel size from another tab
        if (message.type === 'sync_panel_size') {
            console.log('[Content] 📐 sync_panel_size received:', message.chatPanelSize);
            // Ensure orb exists before applying
            if (!hudState.host) initHUD();
            if (hudState.chatPanel && message.chatPanelSize) {
                const { width, height } = message.chatPanelSize;
                if (width) hudState.chatPanel.style.width = `${width}px`;
                if (height) hudState.chatPanel.style.height = `${height}px`;
                hudState.panelManuallyResized = true;
                hudState.panelTargetWidth = width;
            }
            sendResponse({ ok: true });
            return true;
        }

        // 💬 Sync active chat from another tab
        if (message.type === 'sync_active_chat') {
            console.log('[Content] 💬 sync_active_chat received:', message.activeChatId, 'current:', chatState.currentChatId);
            if (!hudState.host) initHUD();
            // Always reload - either new chat ID or same chat with new messages
            if (message.activeChatId) {
                chatState.currentChatId = message.activeChatId;
                // Request fresh chat history from server (skipBroadcast=true to prevent loop)
                console.log('[Content] 💬 Reloading chat history for:', message.activeChatId);
                loadChat(message.activeChatId, true);
            } else {
                // Clear messages if no active chat
                chatState.currentChatId = null;
                chatState.messages = [];
                renderChatMessages();
            }
            sendResponse({ ok: true });
            return true;
        }

        // 🎛️ HUD ACTION: Server pushes UI actions (LLM driving the HUD)
        if (message.type === 'hud_action') {
            const action = message.action;
            console.log('[Content] 🎛️ hud_action received:', action?.type);

            if (!hudState.host) initHUD();

            switch (action?.type) {
                case 'load_chat':
                    // Load and display a chat
                    if (action.chat_id && action.chat) {
                        chatState.currentChatId = action.chat_id;
                        chatState.messages = (action.chat.messages || []).map(m => ({
                            role: m.role,
                            content: m.content,
                            id: m.id
                        }));
                        removeNewChatPlaceholder();
                        markActiveChatInSidebar(action.chat_id);
                        renderChatMessages();
                    }
                    break;

                case 'create_chat':
                    // New chat created - load it and refresh sidebar
                    if (action.chat_id && action.chat) {
                        chatState.currentChatId = action.chat_id;
                        chatState.messages = [];
                        removeNewChatPlaceholder();
                        loadSidebarChats();
                        renderChatMessages();
                    }
                    break;

                case 'start_new_chat':
                    // Show new chat naming UI (user asked for "new chat" without a name)
                    {
                        const needsHudSwitch = !hudState.visible;
                        const needsSidebar = !hudState.sidebarOpen;

                        // Switch to HUD view if in orb mode
                        if (needsHudSwitch) {
                            toggleHUD();
                        }

                        // Wait for HUD to render, then open sidebar and show edit
                        setTimeout(() => {
                            if (needsSidebar || !hudState.sidebarOpen) {
                                toggleSidebar(true);
                            }
                            // Wait for sidebar, then start new chat
                            setTimeout(() => {
                                startNewChat();
                                // Wait for placeholder, then enter edit mode
                                setTimeout(() => {
                                    renameNewChat();
                                    console.log('[Content] 🎛️ start_new_chat: edit mode activated');
                                }, 150);
                            }, 150);
                        }, needsHudSwitch ? 300 : 50);
                    }
                    break;

                case 'append_message':
                    // New message added - reload the chat if it's active
                    if (action.chat_id === chatState.currentChatId && action.message) {
                        // Check if message already exists (avoid duplicates from local add + server response)
                        // Local messages have IDs like "local_1234567890"
                        const msgExists = chatState.messages.some(m =>
                            m.id === action.message.id ||
                            (m.content === action.message.content && m.role === action.message.role)
                        );
                        if (!msgExists) {
                            chatState.messages.push({
                                role: action.message.role,
                                content: action.message.content,
                                id: action.message.id
                            });
                            renderChatMessages();
                            hudState.userBlurRequested = false;
                            focusOrbInputGuard(true);
                        } else {
                            // Update the existing local message with the server ID
                            const existing = chatState.messages.find(m =>
                                m.content === action.message.content &&
                                m.role === action.message.role &&
                                m.id?.startsWith('local_')
                            );
                            if (existing) {
                                existing.id = action.message.id;
                            }
                        }
                    } else if (action.chat_id) {
                        // Different chat - just refresh sidebar
                        loadSidebarChats();
                    }
                    break;

                case 'rename_chat':
                    // Chat renamed - update sidebar and visibleChats
                    if (action.chat_id) {
                        const chatItem = hudState.sidebar?.querySelector(`.ome-sidebar-chat[data-chat-id="${action.chat_id}"]`);
                        if (chatItem) {
                            const titleEl = chatItem.querySelector('.ome-sidebar-chat-title');
                            if (titleEl) titleEl.textContent = action.title;
                        }
                        // Update visibleChats so LLM sees current names
                        const visibleChat = hudState.visibleChats.find(c => c.chat_id === action.chat_id);
                        if (visibleChat) {
                            visibleChat.title = action.title;
                            console.log('[Content] 📚 Updated visibleChats title:', action.chat_id, '→', action.title);
                        }
                    }
                    break;

                case 'delete_chat':
                    // Chat deleted - clear if active, refresh sidebar
                    if (action.chat_id === chatState.currentChatId) {
                        chatState.currentChatId = null;
                        chatState.messages = [];
                        renderChatMessages();
                    }
                    loadSidebarChats();
                    break;

                case 'search_results':
                    // Search results from LLM - filter sidebar to show matches
                    if (action.results) {
                        const matchingIds = action.results.map(r => r.chat_id);
                        const chatList = hudState.sidebar?.querySelector('.ome-sidebar-chat-list');
                        if (chatList) {
                            const items = chatList.querySelectorAll('.ome-sidebar-chat');
                            items.forEach(item => {
                                const chatId = item.dataset.chatId;
                                item.style.display = matchingIds.includes(chatId) ? '' : 'none';
                            });
                            // Show "no results" if empty
                            const emptyMsg = chatList.querySelector('.ome-sidebar-empty');
                            if (emptyMsg) {
                                if (matchingIds.length === 0) {
                                    emptyMsg.textContent = `No chats matching "${action.query}"`;
                                    emptyMsg.style.display = '';
                                } else {
                                    emptyMsg.style.display = 'none';
                                }
                            }
                        }
                        // Open search UI and populate query
                        const searchBtn = hudState.sidebar?.querySelector('.ome-sidebar-search');
                        const searchBox = hudState.sidebar?.querySelector('.ome-sidebar-search-box');
                        if (searchBtn && searchBox && !searchBox.classList.contains('expanded')) {
                            searchBtn.classList.add('active');
                            const textSpan = searchBtn.querySelector('.text');
                            if (textSpan) textSpan.textContent = 'Close Search Chats';
                            searchBox.classList.add('expanded');
                            searchBox.innerHTML = `<input type="text" class="ome-sidebar-search-input" placeholder="Search chats..." value="${action.query || ''}" />`;
                        } else if (searchBox) {
                            const input = searchBox.querySelector('.ome-sidebar-search-input');
                            if (input) input.value = action.query || '';
                        }
                    }
                    break;

                case 'close_search':
                    // Close search UI and show all chats
                    {
                        const searchBtn = hudState.sidebar?.querySelector('.ome-sidebar-search');
                        const searchBox = hudState.sidebar?.querySelector('.ome-sidebar-search-box');
                        if (searchBtn && searchBox) {
                            searchBox.classList.remove('expanded');
                            searchBtn.classList.remove('active');
                            const textSpan = searchBtn.querySelector('.text');
                            if (textSpan) textSpan.textContent = 'Search Chats';
                            searchBox.innerHTML = '';
                            filterSidebarChats(''); // Reset filter to show all
                        }
                    }
                    break;

                // 🎛️ UI CONTROL ACTIONS
                case 'toggle_hud':
                    toggleHUD();
                    break;

                case 'show_sidebar':
                    // 📚 Smart show - if in orb view, switch to HUD first
                    if (!hudState.visible) {
                        toggleHUD();  // Switch to HUD view
                    }
                    // Now open sidebar if not already open
                    if (!hudState.sidebarOpen) toggleSidebar(true);
                    break;

                case 'hide_sidebar':
                    if (hudState.sidebarOpen) toggleSidebar(false);
                    break;

                case 'toggle_sidebar':
                    toggleSidebar();
                    break;

                case 'show_prompt':
                    // Show prompt input area
                    if (hudState.visible) {
                        // In HUD view - show prompt wrapper and focus it
                        hudState.chatVisible = true;
                        const promptWrapper = hudState.hud?.querySelector('.ome-hud-prompt-wrapper');
                        const promptBtn = hudState.hud?.querySelector('.ome-hud-prompt-btn');
                        if (promptWrapper) {
                            promptWrapper.classList.remove('hidden-by-user');
                        }
                        hudState.hud?.classList.remove('prompt-hidden');
                        if (promptBtn) {
                            promptBtn.classList.add('active');
                            promptBtn.textContent = 'HIDE PROMPT';
                        }
                        focusHUDPromptGuard(true);
                    } else {
                        // In orb view - expand the chat panel
                        if (hudState.chatPanel && !hudState.chatPanel.classList.contains('visible')) {
                            hudState.chatPanel.classList.add('visible');
                            hudState.chatVisible = true;
                        }
                        focusOrbInputGuard(true);
                    }
                    console.log('[Content] 🎛️ ShowPrompt executed (HUD visible:', hudState.visible, ')');
                    break;

                case 'hide_prompt':
                    // Hide prompt input area (NOT the whole HUD)
                    if (hudState.visible) {
                        // In HUD view - hide the prompt wrapper
                        hudState.chatVisible = false;
                        const promptWrapper = hudState.hud?.querySelector('.ome-hud-prompt-wrapper');
                        const promptBtn = hudState.hud?.querySelector('.ome-hud-prompt-btn');
                        if (promptWrapper) {
                            promptWrapper.classList.add('hidden-by-user');
                        }
                        hudState.hud?.classList.add('prompt-hidden');
                        if (promptBtn) {
                            promptBtn.classList.remove('active');
                            promptBtn.textContent = 'Show Prompt';
                        }
                    } else {
                        // In orb view - collapse the chat panel
                        if (hudState.chatPanel && hudState.chatPanel.classList.contains('visible')) {
                            hudState.chatPanel.classList.remove('visible');
                            hudState.chatVisible = false;
                        }
                    }
                    console.log('[Content] 🎛️ HidePrompt executed (HUD visible:', hudState.visible, ')');
                    break;

                case 'set_theme':
                    // 🎨 Change HUD/orb theme
                    if (action.theme) {
                        setOrbTheme(action.theme);
                        console.log('[Content] 🎨 SetTheme executed:', action.theme);
                    }
                    break;

                default:
                    console.warn('[Content] 🎛️ Unknown hud_action type:', action?.type);
            }

            sendResponse({ ok: true });
            return true;
        }

    });

    // 🎯 FOCUS: Listen for custom event from content.js after scan completes
    // Routes to appropriate input based on which view is active
    window.addEventListener('ome-focus-orb-input', () => {
        hudState.userBlurRequested = false;
        if (hudState.visible) {
            focusHUDPromptGuard(true);
            console.log('[HUD] 🎯 Focus guard activated after scan (HUD view)');
        } else {
            focusOrbInputGuard(true);
            console.log('[HUD] 🎯 Focus guard activated after scan (orb view)');
        }
    });

    // ========================================================================
    // 💬 CHAT SYSTEM HELPERS
    // ========================================================================

    // Chat state tracking - single source of truth for both HUD and orb
    const chatState = {
        currentChatId: null,
        lastAck: null,
        messages: [],  // Shared message array - both UIs render from this
        pendingTitle: null,  // Title set before first message (for new chats)
        hasMoreMessages: false,  // True if chat has older messages not yet loaded
        totalMessages: 0  // Total message count in full chat
    };

    /**
     * 📝 Parse markdown to HTML (lightweight, safe)
     * Supports: headers, bold, italic, code, links, lists, blockquotes
     * @param {string} text - Raw markdown text
     * @returns {string} - HTML string
     */
    function parseMarkdown(text) {
        if (!text) return '';

        // Escape HTML to prevent XSS
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Code blocks (``` ... ```) - must be first to protect content
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre class="md-code-block${lang ? ` lang-${lang}` : ''}"><code>${code.trim()}</code></pre>`;
        });

        // Inline code (`code`)
        html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

        // Headers (# ## ###)
        html = html.replace(/^### (.+)$/gm, '<h5 class="md-header">$1</h5>');
        html = html.replace(/^## (.+)$/gm, '<h4 class="md-header">$1</h4>');
        html = html.replace(/^# (.+)$/gm, '<h3 class="md-header">$1</h3>');

        // Bold (**text** or __text__)
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

        // Italic (*text* or _text_) - careful not to match inside words
        html = html.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<em>$1</em>');
        html = html.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');

        // Links [text](url) - mark special protocols with data attribute
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            if (url.startsWith('tab://') || url.startsWith('chat://')) {
                // Special Om-E action links - don't open in new tab
                return `<a href="${url}" class="md-link ome-action-link" data-ome-action="${url}">${text}</a>`;
            }
            // Regular external links
            return `<a href="${url}" target="_blank" rel="noopener" class="md-link">${text}</a>`;
        });

        // Auto-link URLs (not already in href)
        html = html.replace(/(?<!href="|">)(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="md-link">$1</a>');

        // Blockquotes (> text)
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

        // Unordered lists (- item)
        html = html.replace(/^- (.+)$/gm, '<li class="md-list-item">$1</li>');
        html = html.replace(/(<li class="md-list-item">.*<\/li>\n?)+/g, '<ul class="md-list">$&</ul>');

        // Ordered lists (1. item)
        html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-list-item-num">$1</li>');
        html = html.replace(/(<li class="md-list-item-num">.*<\/li>\n?)+/g, '<ol class="md-list">$&</ol>');

        // Horizontal rule (--- or ***)
        html = html.replace(/^(---|\*\*\*)$/gm, '<hr class="md-hr">');

        // Convert remaining newlines to <br> (but not inside pre/code)
        // Only convert double newlines to preserve paragraphs
        html = html.replace(/\n\n/g, '<br><br>');
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    /**
     * 🔗 Handle Om-E action link clicks (tab://, chat://)
     * @param {Event} e - Click event
     */
    function handleActionLinkClick(e) {
        const link = e.target.closest('.ome-action-link');
        if (!link) return;

        const action = link.dataset.omeAction;
        if (!action) return;

        e.preventDefault();
        e.stopPropagation();

        // Parse action URL: tab://3 or chat://2
        if (action.startsWith('tab://')) {
            const tabNum = parseInt(action.replace('tab://', ''), 10);
            if (!isNaN(tabNum)) {
                console.log(`[HUD] 🔗 Action link: switch to tab ${tabNum}`);
                // Send capability to switch tab
                chrome.runtime.sendMessage({
                    type: 'execute_capability',
                    action: 'OpenTab',
                    params: { tabId: tabNum }
                });
            }
        } else if (action.startsWith('chat://')) {
            const chatNum = parseInt(action.replace('chat://', ''), 10);
            if (!isNaN(chatNum)) {
                console.log(`[HUD] 🔗 Action link: switch to chat ${chatNum}`);
                // Send capability to switch chat
                chrome.runtime.sendMessage({
                    type: 'execute_capability',
                    action: 'SetCurrentChat',
                    params: { chat: chatNum }
                });
            }
        }
    }

    /**
     * 💬 Render message content (text + images + copy button)
     * @param {HTMLElement} msgEl - Message element to render into
     * @param {Object} msg - Message object with content/images
     */
    function renderMessageContent(msgEl, msg) {
        // Text content with markdown parsing
        if (msg.content) {
            const textEl = document.createElement('div');
            textEl.className = 'md-content';
            textEl.innerHTML = parseMarkdown(msg.content);
            msgEl.appendChild(textEl);
        }
        // Image support - check for images array or image URLs in content
        if (msg.images && Array.isArray(msg.images)) {
            msg.images.forEach(imgSrc => {
                const img = document.createElement('img');
                img.src = imgSrc;
                img.alt = 'Message image';
                img.loading = 'lazy';
                msgEl.appendChild(img);
            });
        }

        // 📋 Copy button (appears on hover)
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ome-copy-btn';
        copyBtn.title = 'Copy to clipboard';
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </svg>`;
        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(msg.content || '');
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>`;
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                    </svg>`;
                }, 1500);
            } catch (err) {
                console.warn('[HUD] Copy failed:', err);
            }
        });
        msgEl.appendChild(copyBtn);
    }

    /**
     * 💬 Render all messages to both HUD and orb from shared state
     * Called on toggle and after adding messages
     */
    function renderChatMessages() {
        const messages = chatState.messages;

        // Render to orb chat panel
        if (hudState.chatPanel) {
            const orbMessages = hudState.chatPanel.querySelector('.ome-chat-messages');
            if (orbMessages) {
                orbMessages.innerHTML = '';
                messages.forEach(msg => {
                    const msgEl = document.createElement('div');
                    msgEl.className = `ome-chat-bubble ${msg.role}`;
                    renderMessageContent(msgEl, msg);
                    orbMessages.appendChild(msgEl);
                });
                // 📜 Smart scroll: assistant responses show TOP, user messages show bottom
                const lastMessage = orbMessages.lastElementChild;
                if (lastMessage && lastMessage.classList.contains('assistant')) {
                    orbMessages.scrollTop = lastMessage.offsetTop;
                } else {
                    orbMessages.scrollTop = orbMessages.scrollHeight;
                }
            }
        }

        // Render to HUD messages area (ChatGPT style)
        if (hudState.hud) {
            const hudMessagesContent = hudState.hud.querySelector('.ome-hud-messages-content');
            const hudMessagesArea = hudState.hud.querySelector('.ome-hud-messages-area');
            if (hudMessagesContent) {
                hudMessagesContent.innerHTML = '';
                messages.forEach(msg => {
                    const msgEl = document.createElement('div');
                    msgEl.className = `ome-hud-message ${msg.role}`;
                    renderMessageContent(msgEl, msg);
                    hudMessagesContent.appendChild(msgEl);
                });
                // 📜 Smart scroll: assistant responses show TOP, user messages show bottom
                if (hudMessagesArea) {
                    const lastMessage = hudMessagesContent.lastElementChild;
                    if (lastMessage && lastMessage.classList.contains('assistant')) {
                        // Show START of assistant response (for reading long responses)
                        hudMessagesArea.scrollTop = lastMessage.offsetTop;
                    } else {
                        // User message - show at bottom
                        hudMessagesArea.scrollTop = hudMessagesArea.scrollHeight;
                    }
                }
            }
        }

        // Check if HUD needs repositioning after content change
        checkAndRepositionHUD();

        // 🎯 Refocus appropriate input after rendering (keeps cursor in input after response)
        if (hudState.visible) {
            focusHUDPromptGuard(true);
        } else {
            focusOrbInputGuard(true);
        }

        console.log(`[Content] 💬 Rendered ${messages.length} messages to both UIs`);
    }

    /**
     * 💬 Add message to shared state and render
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - Message text
     * @param {Object|null} options - Optional {id, images} for message ID and image URLs
     */
    function addChatMessage(role, content, options = null) {
        const msg = {
            id: options?.id || `local_${Date.now()}`,
            role,
            content,
            timestamp: new Date().toISOString()
        };
        // Add images if provided
        if (options?.images) {
            msg.images = options.images;
        }
        chatState.messages.push(msg);
        renderChatMessages();
    }

    /**
     * 💬 Send a chat message via AppendMessage capability
     *
     * @param {string} prompt - The user's message text
     * @param {string|null} chatId - Existing chat ID or null for new chat
     * @param {Object} meta - Optional metadata (page_url, page_title)
     * @returns {Promise<Object>} - Response from service worker
     */
    function sendChatMessage(prompt, chatId = null, meta = {}) {
        return new Promise((resolve, reject) => {
            // 🔧 Use capability pipeline for consistent architecture
            const params = {
                chat_id: chatId || chatState.currentChatId || null,
                role: 'user',
                content: prompt,
                title: chatState.pendingTitle || null,  // Use pending title if set
                page_url: meta.page_url || window.location.href,
                page_title: meta.page_title || document.title
            };

            console.log('[Content] 💬 Sending via AppendMessage capability:', params);

            chrome.runtime.sendMessage(
                { type: 'execute_capability', action: 'AppendMessage', params },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Content] 💬 AppendMessage error:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    if (!response?.ok) {
                        console.error('[Content] 💬 AppendMessage failed:', response);
                        reject(new Error(response?.error || 'Unknown error'));
                        return;
                    }

                    const result = response.result;
                    console.log('[Content] 💬 AppendMessage success:', result);

                    // 🎨 Update UI with the saved message
                    if (result?.message) {
                        addChatMessage('user', prompt, { id: result.message.id });
                    }

                    // Store chat_id if new chat was created
                    if (result?.chat_id && !chatState.currentChatId) {
                        chatState.currentChatId = result.chat_id;
                        chatState.pendingTitle = null;  // Clear pending title
                        chrome.runtime.sendMessage({ type: 'set_orb_state', activeChatId: result.chat_id });
                        console.log('[Content] 💬 New chat created:', result.chat_id);

                        // Remove placeholder and refresh sidebar to show the new chat
                        removeNewChatPlaceholder();
                        loadSidebarChats();
                    }

                    resolve(result);
                }
            );
        });
    }

    /**
     * 🧪 EXPERIMENT: Trigger page scan and wait for completion
     * Called before sending to LLM to ensure fresh page intelligence
     *
     * @returns {Promise<Object>} - Scan result
     */
    function triggerScanAndWait() {
        return new Promise((resolve) => {
            console.log('[Content] 🧪 Triggering scan before LLM submission...');

            chrome.runtime.sendMessage(
                {
                    type: 'request_scan_and_wait',
                    url: window.location.href,
                    trigger: 'prompt_submit'
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('[Content] 🧪 Scan request error:', chrome.runtime.lastError.message);
                        // Don't reject - still allow LLM chat even if scan fails
                        resolve({ ok: false, error: chrome.runtime.lastError.message });
                        return;
                    }

                    if (response?.timeout) {
                        console.warn('[Content] 🧪 Scan timed out, proceeding anyway');
                    } else {
                        console.log('[Content] 🧪 Scan complete:', response?.message || 'success');
                    }
                    resolve(response || { ok: true });
                }
            );
        });
    }

    /**
     * 🤖 Send a message to the LLM and get a response
     * Response flows back via hud_action append_message
     *
     * @param {string} message - The user's message text
     * @param {boolean} clearHistory - Reset agent conversation history
     * @returns {Promise<Object>} - LLM response result
     */
    function sendLLMChat(message, clearHistory = false) {
        return new Promise((resolve, reject) => {
            const params = {
                message: message,
                chat_id: chatState.currentChatId || null,
                clear_history: clearHistory
            };

            // 📚 Include visible chats ONLY when in HUD view with sidebar open and chat list expanded
            const chatListEl = hudState.hud?.querySelector('.ome-sidebar-chat-list');
            const chatListExpanded = chatListEl && !chatListEl.classList.contains('collapsed');
            if (hudState.visible && hudState.sidebarOpen && chatListExpanded && hudState.visibleChats.length > 0) {
                params.hud_state = {
                    sidebar_open: true,
                    visible_chats: hudState.visibleChats
                };
                console.log('[Content] 📚 Including', hudState.visibleChats.length, 'visible chats in LLM context');
            }

            console.log('[Content] 🤖 Sending via LLMChat capability:', params);

            chrome.runtime.sendMessage(
                { type: 'execute_capability', action: 'LLMChat', params },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Content] 🤖 LLMChat error:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    if (!response?.ok) {
                        console.error('[Content] 🤖 LLMChat failed:', response);
                        reject(new Error(response?.error || 'LLM request failed'));
                        return;
                    }

                    console.log('[Content] 🤖 LLMChat success:', response.result);

                    // Store chat_id if new chat was created
                    const result = response.result;
                    if (result?.chat_id && !chatState.currentChatId) {
                        chatState.currentChatId = result.chat_id;
                        chatState.pendingTitle = null;
                        chrome.runtime.sendMessage({ type: 'set_orb_state', activeChatId: result.chat_id });
                        console.log('[Content] 🤖 New chat created:', result.chat_id);

                        // Remove placeholder and refresh sidebar
                        removeNewChatPlaceholder();
                        loadSidebarChats();
                    }

                    resolve(result);
                }
            );
        });
    }

    // Expose functions globally for console testing
    // Content scripts run in isolated world, so we use postMessage bridge
    window.omeSendChat = sendChatMessage;
    window.omeLLMChat = sendLLMChat;

    // Listen for page-context test calls via postMessage
    // ADDED: 2025-12-23 - Bridge for Claude Code integration testing
    // Handles messages from chat_test_helper.js (MAIN world) to content script (isolated world)
    // Can be removed if no longer needed for automated testing
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        // AppendMessage - just saves to chat (omeSendChat)
        if (event.data?.type === 'ome_send_chat_test') {
            const { prompt, chatId, meta } = event.data;
            sendChatMessage(prompt, chatId, meta)
                .then(result => {
                    window.postMessage({ type: 'ome_send_chat_result', result }, '*');
                })
                .catch(error => {
                    window.postMessage({ type: 'ome_send_chat_result', error: error.message }, '*');
                });
        }

        // LLMChat - triggers orchestrator (updates llm_unified.md) (omeLLMChat)
        if (event.data?.type === 'ome_llm_chat_test') {
            const { message, clearHistory } = event.data;
            sendLLMChat(message, clearHistory)
                .then(result => {
                    window.postMessage({ type: 'ome_llm_chat_result', result }, '*');
                })
                .catch(error => {
                    window.postMessage({ type: 'ome_llm_chat_result', error: error.message }, '*');
                });
        }
    });


    // ⏱️ HUD TRACE
    const hudTrace = {
        start: performance.now(),
        log(step) {
            const elapsed = (performance.now() - this.start).toFixed(1);
            console.log(`⏱️ [HUD-TRACE] +${elapsed}ms ${step}`);
        }
    };
    window.hudTrace = hudTrace;
    hudTrace.log('hud.js loaded');

    // 🔗 Global click handler for action links (tab://, chat://)
    // Uses event delegation so it works for dynamically added messages
    document.addEventListener('click', handleActionLinkClick, true);

    // 🚀 Auto-init orb IMMEDIATELY - don't wait for page content
    function initWhenBodyReady() {
        if (document.body) {
            hudTrace.log('body ready - calling initHUD');
            initHUD();
            hudTrace.log('initHUD returned');
        } else {
            requestAnimationFrame(initWhenBodyReady);
        }
    }

    initWhenBodyReady();

})();

