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
 */

// WebSocket connection to the server
let ws = null;

// Track connection status
let isConnected = false;

// Queue for messages when WebSocket isn't ready
let pendingMessages = [];

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
 * 📋 Send current tabs information to server
 * 
 * This function queries all tabs and sends their information to the server
 * for debugging and monitoring purposes.
 */
async function sendTabsInfo() {
    try {
        const tabs = await chrome.tabs.query({});
        const tabsInfo = tabs.map(tab => ({
            id: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active
        }));
        
        sendToServer({
            type: "tabs_info",
            tabs: tabsInfo
        });
    } catch (error) {
        console.error("[SW] Failed to get tabs info:", error);
    }
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
 * 🔍 Find the currently active tab
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

        
        // Strategy 1: Find currently active tab
        let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            console.log("[SW] ✅ Found active tab (current window):", {
                id: tabs[0].id,
                url: tabs[0].url,
                title: tabs[0].title
            });
            return tabs[0];
        }
        
        // Strategy 2: Find tab in last focused window
        tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs.length > 0) {
            console.log("[SW] ✅ Found active tab (last focused):", {
                id: tabs[0].id,
                url: tabs[0].url,
                title: tabs[0].title
            });
            return tabs[0];
        }
        
        // Strategy 3: Force refresh and find the currently active tab
        console.log("[SW] Forcing active tab refresh...");
        
        // Get the current window to ensure we're looking at the right one
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow) {
            // Query for active tab in the current window specifically
            const currentWindowTabs = await chrome.tabs.query({ 
                windowId: currentWindow.id,
                active: true 
            });
            if (currentWindowTabs.length > 0) {
                console.log("[SW] Found active tab in current window:", currentWindowTabs[0].id);
                return currentWindowTabs[0];
            }
        }
        
        // Last resort: find any visible non-chrome tab
        tabs = await chrome.tabs.query({});
        const visibleNonChromeTabs = tabs.filter(tab => 
            tab.url && 
            !tab.url.startsWith('chrome://') && 
            !tab.url.startsWith('chrome-extension://') &&
            !tab.url.startsWith('about:') &&
            tab.visible === true
        );
        if (visibleNonChromeTabs.length > 0) {
            console.log("[SW] Using visible non-chrome tab:", visibleNonChromeTabs[0].id);
            return visibleNonChromeTabs[0];
        }
        
        console.warn("[SW] No suitable tab found");
        return null;
        
    } catch (error) {
        console.error("[SW] Error finding active tab:", error);
        return null;
    }
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
 * 📱 Handle tab activation events
 * 
 * When a tab becomes active, send updated tabs information to the server
 * for monitoring and debugging purposes.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("[SW] Tab activated:", activeInfo.tabId);
    await sendTabsInfo();
});

/**
 * 🔄 Handle tab update events
 * 
 * When a tab's URL or title changes, send updated information to the server.
 * This helps track navigation and page changes.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title) {
        console.log("[SW] Tab updated:", tabId, "to:", changeInfo.url || tab.url);
        

        
        await sendTabsInfo();
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
 * 🔄 Periodic connection health check
 * 
 * Send periodic tabs information to maintain connection health and
 * provide real-time tab status to the server.
 */
setInterval(() => {
    if (isConnected) {
        sendTabsInfo();
    }
}, 30000); // Every 30 seconds

// Initialize connection when service worker loads
connectWebSocket();
