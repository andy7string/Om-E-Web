/**
 * 🚀 Chrome Extension Service Worker for WebSocket Communication
 * 
 * This service worker acts as a bridge between the WebSocket server and
 * the content scripts running in web pages. It implements the message
 * routing part of the full round-trip communication pattern.
 * 
 * 🔗 FULL ROUND-TRIP COMMUNICATION PATTERN:
 * 1. WebSocket Server → Service Worker: Receives command via WebSocket
 * 2. Service Worker → Content Script: Sends command via chrome.tabs.sendMessage
 * 3. Content Script → DOM: Executes command on current page
 * 4. Content Script → Service Worker: Sends response via sendResponse
 * 5. Service Worker → WebSocket Server: Forwards response via WebSocket
 * 6. WebSocket Server → Test Client: Routes response to original client
 * 
 * 📡 MESSAGE FLOW:
 * Test Client → WebSocket Server → Service Worker → Content Script → DOM → Response → Service Worker → Server → Test Client
 * 
 * 🎯 KEY RESPONSIBILITIES:
 * - Maintain WebSocket connection to server
 * - Route commands to appropriate tabs
 * - Forward responses back to server
 * - Handle tab lifecycle and navigation
 * - 🆕 NEW: Enhanced tab state management and cache clearing
 */

// WebSocket connection to the server
let ws = null;

// Track connection status
let isConnected = false;

// Queue for messages when WebSocket isn't ready
let pendingMessages = [];

// 🆕 ENHANCED TAB STATE MANAGEMENT
let internalTabState = new Map(); // tabId -> enhanced tab info
let lastActiveTabId = null;
let tabCache = new Map(); // tabId -> cached data

// No caching - always get real-time tab state

/**
 * 🔌 Initialize WebSocket connection to the server
 * 
 * Establishes connection to the WebSocket server running on localhost:17892.
 * This connection is used for all communication between the extension
 * and external test clients.
 */
function connectWebSocket() {
    console.log("[SW] Extension startup, connecting...");
    
    try {
        // Connect to WebSocket server
        ws = new WebSocket("ws://127.0.0.1:17892");
        
        // Handle connection events
        ws.onopen = () => {
            console.log("[SW] WS open");
            isConnected = true;
            
            // Wait for WebSocket to be fully ready before sending messages
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    console.log("[SW] WebSocket fully ready, sending initial messages");
                    
                    // Send bridge status to identify this client as the extension
                    sendToServer({
                        type: "bridge_status",
                        status: "connected"
                    });
                    
                    // Send initial tabs information
                    sendTabsInfo();
                    
                    // Flush any pending messages that were queued
                    flushPendingMessages();
                } else {
                    console.warn("[SW] WebSocket not ready after delay, retrying...");
                    setTimeout(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            sendToServer({
                                type: "bridge_status",
                                status: "connected"
                            });
                            sendTabsInfo();
                            flushPendingMessages();
                        }
                    }, 500);
                }
            }, 100); // Small delay to ensure WebSocket is ready
        };
        
        ws.onmessage = (event) => {
            console.log("[SW] Message received:", event.data);
            handleServerMessage(event.data);
        };
        
        ws.onclose = () => {
            console.log("[SW] WS closed");
            isConnected = false;
            
            // Attempt to reconnect after a delay
            setTimeout(connectWebSocket, 1000);
        };
        
        ws.onerror = (error) => {
            console.error("[SW] WS error:", error);
        };
        
    } catch (error) {
        console.error("[SW] Failed to connect:", error);
        // Retry connection after delay
        setTimeout(connectWebSocket, 1000);
    }
}

/**
 * 📤 Send message to WebSocket server
 * 
 * @param {Object} data - Data to send to server
 */
function sendToServer(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(data));
            console.log("[SW] Message sent successfully:", data.type || 'data');
        } catch (error) {
            console.error("[SW] Failed to send message:", error);
        }
    } else {
        console.warn("[SW] WebSocket not ready, cannot send:", data);
        // Queue message for later if WebSocket isn't ready
        if (!pendingMessages) pendingMessages = [];
        pendingMessages.push(data);
    }
}

/**
 * 🚀 Flush pending messages when WebSocket becomes ready
 */
function flushPendingMessages() {
    if (pendingMessages.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        console.log(`[SW] Flushing ${pendingMessages.length} pending messages`);
        const messagesToSend = [...pendingMessages];
        pendingMessages = [];
        
        messagesToSend.forEach(message => {
            try {
                ws.send(JSON.stringify(message));
                console.log("[SW] Pending message sent:", message.type || 'data');
            } catch (error) {
                console.error("[SW] Failed to send pending message:", error);
            }
        });
    }
}

/**
 * 🧹 Clear cached data for a specific tab
 * 
 * @param {number} tabId - Tab ID to clear cache for
 */
function clearTabCache(tabId) {
    console.log("[SW] Clearing cache for tab:", tabId);
    
    // Clear any cached data for this tab
    if (tabCache.has(tabId)) {
        const cachedData = tabCache.get(tabId);
        console.log("[SW] Cleared cached data:", {
            tabId: tabId,
            cachedElements: cachedData.elements || 0,
            cachedSelectors: cachedData.selectors || 0
        });
        tabCache.delete(tabId);
    }
    
    // Mark tab as needing fresh scan
    const tabState = internalTabState.get(tabId);
    if (tabState) {
        tabState.needsFreshScan = true;
        tabState.lastCacheClear = Date.now();
        console.log("[SW] Tab marked as needing fresh scan:", tabId);
    }
}

/**
 * 🔄 Ensure content script is fresh for a tab
 * 
 * @param {number} tabId - Tab ID to refresh content script for
 */
async function ensureContentScriptFresh(tabId) {
    try {
        console.log("[SW] Ensuring content script is fresh for tab:", tabId);
        
        // Force re-injection of content script
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        
        console.log("[SW] Content script refreshed for tab:", tabId);
        
        // Mark tab as having fresh content script
        const tabState = internalTabState.get(tabId);
        if (tabState) {
            tabState.contentScriptFresh = true;
            tabState.lastContentScriptRefresh = Date.now();
        }
        
    } catch (error) {
        console.log("[SW] Content script refresh failed:", error.message);
        
        // Mark tab as having refresh issues
        const tabState = internalTabState.get(tabId);
        if (tabState) {
            tabState.contentScriptRefreshFailed = true;
            tabState.lastRefreshError = Date.now();
        }
    }
}

/**
 * 📋 Send current tabs information to server with enhanced internal state management
 * 
 * This function queries all tabs, updates internal state, and sends information to the server
 * for debugging and monitoring purposes.
 * 
 * @param {boolean} forceRefresh - Whether to force refresh all internal state
 */
async function sendTabsInfo(forceRefresh = false) {
    try {
        const tabs = await chrome.tabs.query({});
        const tabsInfo = tabs.map(tab => ({
            id: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active,
            status: tab.status,
            pendingUrl: tab.pendingUrl
        }));
        
        // 🆕 ENHANCED: Update internal state and manage cache
        updateInternalTabState(tabsInfo, forceRefresh);
        
        // Send to server
        sendToServer({
            type: "tabs_info",
            tabs: tabsInfo
        });
        
        console.log("[SW] Tabs info updated and sent to server");
        
    } catch (error) {
        console.error("[SW] Failed to get tabs info:", error);
    }
}

/**
 * 🆕 NEW: Update internal tab state with enhanced management
 * 
 * @param {Array} tabsInfo - Array of tab information objects
 * @param {boolean} forceRefresh - Whether to force refresh all state
 */
function updateInternalTabState(tabsInfo, forceRefresh = false) {
    console.log("[SW] Updating internal tab state...");
    
    // Clear old state if force refresh
    if (forceRefresh) {
        internalTabState.clear();
        tabCache.clear();
        console.log("[SW] Internal state cleared due to force refresh");
    }
    
    // Update internal state with new tab info
    tabsInfo.forEach(tabInfo => {
        const oldInfo = internalTabState.get(tabInfo.id);
        
        // Check if this tab has changed significantly
        if (!oldInfo || 
            oldInfo.url !== tabInfo.url || 
            oldInfo.title !== tabInfo.title ||
            oldInfo.active !== tabInfo.active ||
            oldInfo.status !== tabInfo.status) {
            
            console.log("[SW] Tab state changed:", {
                id: tabInfo.id,
                oldUrl: oldInfo?.url,
                newUrl: tabInfo.url,
                oldTitle: oldInfo?.title,
                newTitle: tabInfo.title,
                oldStatus: oldInfo?.status,
                newStatus: tabInfo.status
            });
            
            // Clear any cached references for this tab
            clearTabCache(tabInfo.id);
            
            // Update internal state with enhanced information
            internalTabState.set(tabInfo.id, {
                ...tabInfo,
                lastUpdate: Date.now(),
                needsFreshScan: true,
                contentScriptFresh: false,
                cacheCleared: true,
                // 🆕 NEW: DOM change tracking
                domChanges: {
                    totalChanges: 0,
                    lastChangeTime: null,
                    changeTypes: new Set(),
                    lastMutationCount: 0
                }
            });
            
            // If this is a new active tab, ensure content script is fresh
            if (tabInfo.active && tabInfo.id !== lastActiveTabId) {
                console.log("[SW] New active tab detected, ensuring fresh content script");
                ensureContentScriptFresh(tabInfo.id);
                lastActiveTabId = tabInfo.id;
            }
            
            // If URL changed, this definitely needs fresh scan
            if (oldInfo && oldInfo.url !== tabInfo.url) {
                console.log("[SW] URL change detected, forcing content script refresh");
                ensureContentScriptFresh(tabInfo.id);
            }
        }
    });
    
    // Remove tabs that no longer exist
    const currentTabIds = new Set(tabsInfo.map(t => t.id));
    for (const [tabId, tabInfo] of internalTabState.entries()) {
        if (!currentTabIds.has(tabId)) {
            console.log("[SW] Removing stale tab from internal state:", tabId);
            internalTabState.delete(tabId);
            clearTabCache(tabId);
        }
    }
    
    console.log("[SW] Internal tab state updated:", {
        totalTabs: internalTabState.size,
        activeTabs: tabsInfo.filter(t => t.active).length,
        tabsNeedingFreshScan: Array.from(internalTabState.values()).filter(t => t.needsFreshScan).length
    });
}

/**
 * 🎯 Handle incoming messages from the WebSocket server
 * 
 * This function processes commands received from the server and routes them
 * to the appropriate content script in the active tab.
 * 
 * @param {string} messageData - Raw message data from server
 */
function handleServerMessage(messageData) {
    try {
        const message = JSON.parse(messageData);
        console.log("[SW] Parsed message:", message);
        
        // Check if this is a command message
        if (message.command && message.id) {
            console.log("[SW] Processing command:", message.command, "with id:", message.id, "and params:", message.params);
            
            // Route command to appropriate handler
            switch (message.command) {
                case "navigate":
                    handleNavigateCommand(message);
                    break;
                case "waitFor":
                case "getText":
                case "click":
                case "getPageMarkdown":
                case "getCurrentTabInfo":
                case "getNavigationContext":
                case "generateSiteMap":
                case "navigateBack":
                case "navigateForward":
                case "jumpToHistoryEntry":
                case "getHistoryState":
                case "searchHistory":
                case "clearHistory":
                    handleDOMCommand(message);
                    break;
                default:
                    console.warn("[SW] Unknown command:", message.command);
                    sendErrorResponse(message.id, "UNKNOWN_COMMAND", `Unknown command: ${message.command}`);
            }
        }
    } catch (error) {
        console.error("[SW] Failed to handle server message:", error);
    }
}

/**
 * 🆕 NEW: Handle messages from popup and other extension components
 * 
 * This function processes internal extension messages for status updates,
 * force refresh, and cache management.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[SW] Internal message received:", message);
    
    try {
        switch (message.type) {
            case "setWsUrl":
                handleSetWsUrl(message, sendResponse);
                break;
            case "forceRefresh":
                handleForceRefresh(message, sendResponse);
                break;
            case "clearAllCache":
                handleClearAllCache(message, sendResponse);
                break;
            case "getStatus":
                handleGetStatus(message, sendResponse);
                break;
            case "dom_changed":
                handleDOMChanged(message, sendResponse);
                break;
            default:
                console.warn("[SW] Unknown internal message type:", message.type);
                sendResponse({ ok: false, error: "Unknown message type" });
        }
    } catch (error) {
        console.error("[SW] Error handling internal message:", error);
        sendResponse({ ok: false, error: error.message });
    }
    
    // Return true to indicate async response handling
    return true;
});

/**
 * 🧭 Handle navigation commands
 * 
 * Navigation commands update the URL of the current tab, which is a
 * special case that doesn't require content script communication.
 * 
 * @param {Object} message - Command message with navigation parameters
 */
async function handleNavigateCommand(message) {
    try {
        const { url } = message.params;
        console.log("[SW] Executing navigate command with params:", message.params);
        
        // Find the active tab to navigate
        const activeTab = await findActiveTab();
        if (!activeTab) {
            sendErrorResponse(message.id, "NO_ACTIVE_TAB", "No active tab found");
            return;
        }
        
        // Navigate the tab to the new URL
        await chrome.tabs.update(activeTab.id, { url: url });
        console.log("[SW] Navigated tab:", activeTab.id, "to:", url);
        
        // 🆕 ENHANCED: Clear cache and mark for fresh scan
        clearTabCache(activeTab.id);
        
        // Send success response
        sendSuccessResponse(message.id, {});
        
    } catch (error) {
        console.error("[SW] Navigation failed:", error);
        sendErrorResponse(message.id, "NAVIGATION_ERROR", error.message);
    }
}

/**
 * 🎯 Handle DOM manipulation commands
 * 
 * DOM commands (waitFor, getText, click, getPageMarkdown) require
 * communication with content scripts running in web pages.
 * 
 * @param {Object} message - Command message with DOM parameters
 */
async function handleDOMCommand(message) {
    try {
        console.log("[SW] Sending DOM command to content script:", message.command);
        
        // Find the active tab to send the command to
        console.log("[SW] 🔍 Finding active tab for command:", message.command);
        const activeTab = await findActiveTab();
        if (!activeTab) {
            sendErrorResponse(message.id, "NO_ACTIVE_TAB", "No active tab found");
            return;
        }
        
        console.log("[SW] 🎯 Command will be sent to tab:", {
            id: activeTab.id,
            url: activeTab.url,
            title: activeTab.title,
            active: activeTab.active
        });
        
        // 🆕 ENHANCED: Check if content script needs refresh
        const tabState = internalTabState.get(activeTab.id);
        if (tabState && (tabState.needsFreshScan || !tabState.contentScriptFresh)) {
            console.log("[SW] Content script needs refresh for tab:", activeTab.id);
            await ensureContentScriptFresh(activeTab.id);
        }
        
        // Try to inject content script if it's not already there
        try {
            await chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                files: ['content.js']
            });
            console.log("[SW] Content script injected into tab:", activeTab.id);
        } catch (injectError) {
            console.log("[SW] Content script already exists or injection failed:", injectError.message);
        }
        
        // Wait a moment for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Send message to content script in the active tab
        const response = await chrome.tabs.sendMessage(activeTab.id, {
            command: message.command,
            params: message.params || {}
        });
        
        console.log("[SW] Content script response:", response);
        
        // Check if response contains an error
        if (response && response.error) {
            console.log("[SW] Content script returned error:", response.error);
            sendErrorResponse(message.id, response.error.code || "CONTENT_SCRIPT_ERROR", response.error.msg);
        } else {
            // 🆕 ENHANCED: Mark tab as successfully scanned
            if (tabState && message.command === "generateSiteMap") {
                tabState.needsFreshScan = false;
                tabState.lastSuccessfulScan = Date.now();
                console.log("[SW] Tab marked as successfully scanned:", activeTab.id);
            }
            
            // Send successful response back to server
            console.log("[SW] Sending successful response back to server");
            sendSuccessResponse(message.id, response || {});
        }
        
    } catch (error) {
        console.error("[SW] Failed to execute DOM command:", error);
        sendErrorResponse(message.id, "MESSAGE_ERROR", error.message);
    }
}

/**
 * 🔧 Handle WebSocket URL update from popup
 * 
 * @param {Object} message - Message with new WebSocket URL
 * @param {Function} sendResponse - Response callback
 */
async function handleSetWsUrl(message, sendResponse) {
    try {
        const { url } = message;
        console.log("[SW] Setting WebSocket URL to:", url);
        
        // Store the new URL
        await chrome.storage.local.set({ wsUrl: url });
        
        // If we have an existing connection, close it and reconnect
        if (ws) {
            console.log("[SW] Closing existing WebSocket connection");
            ws.close();
        }
        
        // Reconnect with new URL
        setTimeout(() => {
            connectWebSocket();
        }, 100);
        
        sendResponse({ ok: true, message: "WebSocket URL updated" });
        
    } catch (error) {
        console.error("[SW] Failed to set WebSocket URL:", error);
        sendResponse({ ok: false, error: error.message });
    }
}

/**
 * 🔄 Handle force refresh request from popup
 * 
 * @param {Object} message - Force refresh message
 * @param {Function} sendResponse - Response callback
 */
async function handleForceRefresh(message, sendResponse) {
    try {
        console.log("[SW] Force refresh requested");
        
        // Force refresh all internal state
        await sendTabsInfo(true); // true = force refresh
        
        // Force content script refresh for all tabs
        const tabs = await chrome.tabs.query({});
        let refreshedCount = 0;
        
        for (const tab of tabs) {
            try {
                await ensureContentScriptFresh(tab.id);
                refreshedCount++;
            } catch (error) {
                console.log("[SW] Failed to refresh content script for tab:", tab.id, error.message);
            }
        }
        
        console.log("[SW] Force refresh completed:", refreshedCount, "tabs refreshed");
        sendResponse({ 
            ok: true, 
            message: `Force refresh completed: ${refreshedCount} tabs refreshed`,
            refreshedTabs: refreshedCount
        });
        
    } catch (error) {
        console.error("[SW] Force refresh failed:", error);
        sendResponse({ ok: false, error: error.message });
    }
}

/**
 * 🧹 Handle clear all cache request from popup
 * 
 * @param {Object} message - Clear cache message
 * @param {Function} sendResponse - Response callback
 */
async function handleClearAllCache(message, sendResponse) {
    try {
        console.log("[SW] Clear all cache requested");
        
        // Clear all tab cache
        const clearedTabs = [];
        for (const [tabId, cachedData] of tabCache.entries()) {
            clearTabCache(tabId);
            clearedTabs.push(tabId);
        }
        
        // Mark all tabs as needing fresh scan
        for (const [tabId, tabState] of internalTabState.entries()) {
            tabState.needsFreshScan = true;
            tabState.contentScriptFresh = false;
            tabState.cacheCleared = true;
        }
        
        console.log("[SW] All cache cleared:", clearedTabs.length, "tabs affected");
        sendResponse({ 
            ok: true, 
            message: `All cache cleared: ${clearedTabs.length} tabs affected`,
            clearedTabs: clearedTabs.length
        });
        
    } catch (error) {
        console.error("[SW] Clear all cache failed:", error);
        sendResponse({ ok: false, error: error.message });
    }
}

/**
 * 📊 Handle get status request from popup
 * 
 * @param {Object} message - Get status message
 * @param {Function} sendResponse - Response callback
 */
async function handleGetStatus(message, sendResponse) {
    try {
        console.log("[SW] Status request received");
        
        // Calculate status metrics
        const totalTabs = internalTabState.size;
        const tabsWithFreshScripts = Array.from(internalTabState.values())
            .filter(tab => tab.contentScriptFresh).length;
        const tabsNeedingFreshScan = Array.from(internalTabState.values())
            .filter(tab => tab.needsFreshScan).length;
        const tabsWithCacheIssues = Array.from(internalTabState.values())
            .filter(tab => tab.contentScriptRefreshFailed).length;
        
        // 🆕 NEW: DOM change metrics
        const tabsWithDOMChanges = Array.from(internalTabState.values())
            .filter(tab => tab.domChanges && tab.domChanges.totalChanges > 0).length;
        const totalDOMChanges = Array.from(internalTabState.values())
            .reduce((total, tab) => total + (tab.domChanges?.totalChanges || 0), 0);
        const recentDOMChanges = Array.from(internalTabState.values())
            .filter(tab => tab.domChanges && tab.domChanges.lastChangeTime && 
                    (Date.now() - tab.domChanges.lastChangeTime) < 30000).length; // Last 30 seconds
        
        const status = {
            isConnected: isConnected,
            totalTabs: totalTabs,
            tabsWithFreshScripts: tabsWithFreshScripts,
            tabsNeedingFreshScan: tabsNeedingFreshScan,
            tabsWithCacheIssues: tabsWithCacheIssues,
            // 🆕 NEW: DOM change status
            tabsWithDOMChanges: tabsWithDOMChanges,
            totalDOMChanges: totalDOMChanges,
            recentDOMChanges: recentDOMChanges,
            lastActiveTabId: lastActiveTabId,
            websocketState: ws ? ws.readyState : 'CLOSED',
            timestamp: Date.now()
        };
        
        console.log("[SW] Status calculated:", status);
        sendResponse({ ok: true, result: status });
        
    } catch (error) {
        console.error("[SW] Get status failed:", error);
        sendResponse({ ok: false, error: error.message });
    }
}

/**
 * 🎯 Handle messages from content scripts indicating DOM changes
 * 
 * This function processes messages from content scripts that report
 * changes in the DOM, such as new elements, removed elements, or
 * attribute changes. It updates the internal state accordingly.
 * 
 * @param {Object} message - Message from content script with DOM changes
 * @param {Function} sendResponse - Response callback (not used for this type of message)
 */
async function handleDOMChanged(message, sendResponse) {
    try {
        console.log("[SW] 🆕 DOM changed message received:", {
            changeNumber: message.changeNumber,
            types: message.types,
            mutations: message.totalMutations,
            url: message.url,
            timestamp: new Date(message.timestamp).toISOString()
        });
        
        // Find the tab that sent this message
        let targetTabId = null;
        for (const [tabId, tabState] of internalTabState.entries()) {
            if (tabState.url === message.url) {
                targetTabId = tabId;
                break;
            }
        }
        
        if (targetTabId) {
            // Update internal state with DOM changes
            const tabState = internalTabState.get(targetTabId);
            if (tabState && tabState.domChanges) {
                // Update DOM change tracking
                tabState.domChanges.totalChanges = message.changeNumber;
                tabState.domChanges.lastChangeTime = message.timestamp;
                tabState.domChanges.lastMutationCount = message.totalMutations;
                
                // Add change types to the set
                message.types.forEach(type => {
                    tabState.domChanges.changeTypes.add(type);
                });
                
                // Mark tab as needing fresh scan
                tabState.needsFreshScan = true;
                tabState.lastDOMChange = message.timestamp;
                
                console.log("[SW] ✅ Tab DOM changes updated:", {
                    tabId: targetTabId,
                    url: tabState.url,
                    totalChanges: tabState.domChanges.totalChanges,
                    changeTypes: Array.from(tabState.domChanges.changeTypes),
                    lastChange: new Date(tabState.domChanges.lastChangeTime).toISOString(),
                    needsFreshScan: tabState.needsFreshScan
                });
            }
        } else {
            console.log("[SW] ⚠️ Could not find tab for DOM change message:", message.url);
        }
        
        // 🆕 NEW: Optionally notify server about significant DOM changes
        if (message.totalMutations > 10) { // Only notify for significant changes
            console.log("[SW] 📤 Notifying server of significant DOM changes");
            sendToServer({
                type: "dom_content_changed",
                tabId: targetTabId,
                url: message.url,
                timestamp: message.timestamp,
                changes: {
                    changeNumber: message.changeNumber,
                    types: message.types,
                    mutations: message.totalMutations
                }
            });
        }
        
    } catch (error) {
        console.error("[SW] ❌ Failed to handle DOM changed message:", error);
    }
}

/**
 * 🔍 Find the currently active tab with enhanced detection
 * 
 * This function implements multiple strategies to find the active tab:
 * 1. First try to find the currently active tab
 * 2. Fall back to the last focused window
 * 3. Finally, use any non-chrome tab as fallback
 * 
 * @returns {Promise<Object>} - Promise that resolves to the active tab
 */
async function findActiveTab() {
    try {
        
        // Strategy 1: Find currently active tab with force refresh
        let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const tab = tabs[0];
            
            // 🆕 ENHANCED: Check if this tab is accessible for content scripts
            if (isTabAccessible(tab)) {
                // Force refresh tab info to ensure we have latest data
                const refreshedTab = await chrome.tabs.get(tab.id);
                
                console.log("[SW] ✅ Found accessible active tab (current window):", {
                    id: refreshedTab.id,
                    url: refreshedTab.url,
                    title: refreshedTab.title,
                    status: refreshedTab.status
                });
                
                return refreshedTab;
            } else {
                console.log("[SW] ⚠️ Active tab is not accessible (chrome:// URL):", tab.url);
            }
        }
        
        // Strategy 2: Find tab in last focused window
        tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs.length > 0) {
            const tab = tabs[0];
            
            if (isTabAccessible(tab)) {
                const refreshedTab = await chrome.tabs.get(tab.id);
                
                console.log("[SW] ✅ Found accessible active tab (last focused):", {
                    id: refreshedTab.id,
                    url: refreshedTab.url,
                    title: refreshedTab.title,
                    status: refreshedTab.status
                });
                return refreshedTab;
            } else {
                console.log("[SW] ⚠️ Last focused tab is not accessible:", tab.url);
            }
        }
        
        // Strategy 3: Find any accessible tab in current window
        console.log("[SW] Looking for accessible tabs in current window...");
        
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow) {
            const currentWindowTabs = await chrome.tabs.query({ 
                windowId: currentWindow.id
            });
            
            // Filter for accessible tabs and prioritize non-active ones
            const accessibleTabs = currentWindowTabs
                .filter(tab => isTabAccessible(tab))
                .sort((a, b) => {
                    // Prioritize non-chrome tabs, then active tabs
                    if (a.url.startsWith('chrome://') && !b.url.startsWith('chrome://')) return 1;
                    if (!a.url.startsWith('chrome://') && b.url.startsWith('chrome://')) return -1;
                    if (a.active && !b.active) return -1;
                    if (!a.active && b.active) return 1;
                    return 0;
                });
            
            if (accessibleTabs.length > 0) {
                const bestTab = accessibleTabs[0];
                const refreshedTab = await chrome.tabs.get(bestTab.id);
                
                console.log("[SW] ✅ Found best accessible tab in current window:", {
                    id: refreshedTab.id,
                    url: refreshedTab.url,
                    title: refreshedTab.title,
                    active: refreshedTab.active,
                    reason: "accessible tab found"
                });
                
                return refreshedTab;
            }
        }
        
        // Last resort: find any visible non-chrome tab across all windows
        console.log("[SW] Last resort: searching for any accessible tab...");
        tabs = await chrome.tabs.query({});
        const visibleNonChromeTabs = tabs.filter(tab => 
            isTabAccessible(tab) && tab.visible === true
        );
        
        if (visibleNonChromeTabs.length > 0) {
            // Sort by priority: active tabs first, then by recency
            const sortedTabs = visibleNonChromeTabs.sort((a, b) => {
                if (a.active && !b.active) return -1;
                if (!a.active && b.active) return 1;
                return 0;
            });
            
            const bestTab = sortedTabs[0];
            const refreshedTab = await chrome.tabs.get(bestTab.id);
            
            console.log("[SW] ✅ Using accessible visible tab as fallback:", {
                id: refreshedTab.id,
                url: refreshedTab.url,
                title: refreshedTab.title,
                active: refreshedTab.active,
                reason: "fallback accessible tab"
            });
            
            return refreshedTab;
        }
        
        console.warn("[SW] No accessible tabs found");
        return null;
        
    } catch (error) {
        console.error("[SW] Error finding active tab:", error);
        return null;
    }
}

/**
 * 🆕 NEW: Check if a tab is accessible for content scripts
 * 
 * @param {Object} tab - Tab object to check
 * @returns {boolean} - True if tab is accessible
 */
function isTabAccessible(tab) {
    if (!tab.url) return false;
    
    // Chrome:// URLs are not accessible
    if (tab.url.startsWith('chrome://')) return false;
    if (tab.url.startsWith('chrome-extension://')) return false;
    if (tab.url.startsWith('about:')) return false;
    if (tab.url.startsWith('edge://')) return false;
    if (tab.url.startsWith('moz-extension://')) return false;
    
    // Must have a valid URL
    if (tab.url === 'about:blank') return false;
    
    return true;
}

/**
 * ✅ Send success response to server
 * 
 * @param {string} id - Command ID to match with request
 * @param {Object} result - Result data to send
 */
function sendSuccessResponse(id, result) {
    sendToServer({
        id: id,
        ok: true,
        result: result,
        error: null
    });
}

/**
 * ❌ Send error response to server
 * 
 * @param {string} id - Command ID to match with request
 * @param {string} code - Error code
 * @param {string} msg - Error message
 */
function sendErrorResponse(id, code, msg) {
    sendToServer({
        id: id,
        ok: false,
        result: null,
        error: {
            code: code,
            msg: msg
        }
    });
}

/**
 * 📱 Handle tab activation events with enhanced state management
 * 
 * When a tab becomes active, update internal state and ensure content script is fresh
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("[SW] Tab activated:", activeInfo.tabId);
    
    // 🆕 ENHANCED: Clear cache for the previously active tab
    if (lastActiveTabId && lastActiveTabId !== activeInfo.tabId) {
        console.log("[SW] Clearing cache for previously active tab:", lastActiveTabId);
        clearTabCache(lastActiveTabId);
    }
    
    // Update last active tab
    lastActiveTabId = activeInfo.tabId;
    
    // 🆕 ENHANCED: Force content script injection into new active tab
    try {
        await chrome.scripting.executeScript({
            target: { tabId: activeInfo.tabId },
            files: ['content.js']
        });
        console.log("[SW] Content script injected into newly active tab");
        
        // Mark tab as having fresh content script
        const tabState = internalTabState.get(activeInfo.tabId);
        if (tabState) {
            tabState.contentScriptFresh = true;
            tabState.lastContentScriptRefresh = Date.now();
        }
        
    } catch (error) {
        console.log("[SW] Content script injection failed:", error.message);
    }
    
    await sendTabsInfo();
});

/**
 * 🔄 Handle tab update events with enhanced cache management
 * 
 * When a tab's URL or title changes, clear cache and refresh content script
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title) {
        console.log("[SW] Tab updated:", tabId, "to:", changeInfo.url || tab.url);
        
        // 🆕 ENHANCED: Clear cache and mark for fresh scan
        clearTabCache(tabId);
        
        // 🆕 ENHANCED: Force content script refresh for this tab
        await ensureContentScriptFresh(tabId);
        
        // This will now update both internal state AND send to server
        await sendTabsInfo(false); // false = not a force refresh
    }
});

/**
 * 🏠 Handle extension startup
 * 
 * When the service worker starts, establish WebSocket connection to the server.
 * This enables the extension to receive commands from external test clients.
 */
chrome.runtime.onStartup.addListener(() => {
    console.log("[SW] Extension startup");
    connectWebSocket();
});

/**
 * 🔌 Handle extension installation/update
 * 
 * When the extension is installed or updated, establish WebSocket connection.
 * This ensures the extension can communicate with the server immediately.
 */
chrome.runtime.onInstalled.addListener(() => {
    console.log("[SW] Extension installed/updated");
    connectWebSocket();
});

/**
 * 🔄 Periodic connection health check with state validation
 * 
 * Send periodic tabs information to maintain connection health and
 * provide real-time tab status to the server.
 */
setInterval(() => {
    if (isConnected) {
        // 🆕 ENHANCED: Check for tabs that need attention
        const tabsNeedingAttention = Array.from(internalTabState.values())
            .filter(tab => tab.needsFreshScan || !tab.contentScriptFresh);
        
        if (tabsNeedingAttention.length > 0) {
            console.log("[SW] Found tabs needing attention:", tabsNeedingAttention.length);
            tabsNeedingAttention.forEach(tab => {
                console.log("[SW] Tab needs attention:", {
                    id: tab.id,
                    url: tab.url,
                    needsFreshScan: tab.needsFreshScan,
                    contentScriptFresh: tab.contentScriptFresh
                });
            });
        }
        
        sendTabsInfo();
    }
}, 30000); // Every 30 seconds

// Initialize connection when service worker loads
connectWebSocket();
