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
 * - 🆕 NEW: Proactive site config detection and sending
 */

// WebSocket connection to the server
let ws = null;

// Track connection status
let isConnected = false;

// Queue for messages when WebSocket isn't ready
let pendingMessages = [];

// 🐰 ORB STATE - persists across page navigations
const orbState = {
    theme: 'kawaii',      // Current theme name
    position: null        // { left: number, top: number } or null for default
};

// ============================================================================
// 🗑️ PAGE VERSIONING SYSTEM - COMMENTED OUT FOR TESTING
// ============================================================================
// NOTE: This entire section has been commented out because pageVersion is no longer used.
// The system now uses simple sequential IDs in text.md instead of version tracking.
// After testing confirms no issues, this entire block can be safely deleted.
// ============================================================================

/*
// ============================================================================
// 🎯 PERSISTENT PAGE VERSION MANAGEMENT - Chrome Storage API
// ============================================================================
/**
 * 🔐 GENERIC TAB+DOMAIN PAGE VERSION TRACKING
 *
 * Per-domain version scoping: Each domain maintains its own version counter per tab
 * Example: YouTube video 1 → 2 → 3, Google search stays at 1
 *
 * Uses chrome.storage.local for persistence across:
 * - Extension reloads
 * - Browser restarts
 * - Tab navigations
 *
 * Business Rules:
 * 1. Tab closes → Delete all domains for that tab
 * 2. First scan on domain → Version 1
 * 3. Navigation on same domain → Increment version (1 → 2 → 3...)
 * 4. Different domain → New entry at version 1
 * 5. Rescan (mutation, etc.) → Keep same version
 *
 * Storage structure (chrome.storage.local.tabState):
 * {
 *   "version": "1.0",
 *   "lastUpdated": "2025-11-23T...",
 *   "tabs": {
 *     "123": {
 *       "domains": {
 *         "youtube.com": {
 *           "currentVersion": 5,
 *           "lastScanAt": "2025-11-23T..."
 *         },
 *         "google.com": {
 *           "currentVersion": 3,
 *           "lastScanAt": "2025-11-23T..."
 *         }
 *       }
 *     }
 *   }
 * }
 *\/

// Extract domain from URL (e.g., "https://www.youtube.com/watch" → "youtube.com")
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        // Remove "www." prefix if present
        const hostname = urlObj.hostname.replace(/^www\./, '');
        return hostname;
    } catch (err) {
        console.error('[SW] Failed to extract domain:', err);
        return null;
    }
}

// Read tab state from chrome.storage.local (persistent storage)
async function readTabState() {
    try {
        const result = await chrome.storage.local.get(['tabState']);
        if (result.tabState) {
            return result.tabState;
        }
        // Default structure
        return { version: "1.0", lastUpdated: new Date().toISOString(), tabs: {} };
    } catch (err) {
        console.error('[SW] Failed to read tab state:', err);
        return { version: "1.0", lastUpdated: new Date().toISOString(), tabs: {} };
    }
}

// Write tab state to chrome.storage.local
async function writeTabState(state) {
    try {
        // Update timestamp
        state.lastUpdated = new Date().toISOString();

        await chrome.storage.local.set({ tabState: state });
        console.log('[SW] 💾 Tab state saved to storage');
        return true;
    } catch (err) {
        console.error('[SW] Failed to write tab state:', err);
        return false;
    }
}

// Get pageVersion for tab+domain
async function getPageVersion(tabId, url) {
    const domain = extractDomain(url);
    if (!domain) {
        console.warn('[SW] Could not extract domain from URL:', url);
        return 0;
    }

    const state = await readTabState();
    const tabData = state.tabs[tabId];

    if (!tabData || !tabData.domains || !tabData.domains[domain]) {
        console.log(`[SW] 📖 No version found for tab ${tabId}, domain ${domain} (will start at 1)`);
        return 0; // 0 means "not yet set"
    }

    const version = tabData.domains[domain].currentVersion;
    console.log(`[SW] 📖 Read pageVersion=${version} for tab ${tabId}, domain ${domain}`);
    return version;
}

// Set pageVersion for tab+domain
async function setPageVersion(tabId, url, version) {
    const domain = extractDomain(url);
    if (!domain) {
        console.warn('[SW] Could not extract domain from URL:', url);
        return 0;
    }

    const state = await readTabState();

    // Ensure tab exists
    if (!state.tabs[tabId]) {
        state.tabs[tabId] = { domains: {} };
    }

    // Ensure domains object exists
    if (!state.tabs[tabId].domains) {
        state.tabs[tabId].domains = {};
    }

    // Set version for domain
    state.tabs[tabId].domains[domain] = {
        currentVersion: version,
        lastScanAt: new Date().toISOString()
    };

    await writeTabState(state);
    console.log(`[SW] 💾 Saved pageVersion=${version} for tab ${tabId}, domain ${domain}`);
    return version;
}

// Increment pageVersion for tab+domain
async function incrementPageVersion(tabId, url) {
    const current = await getPageVersion(tabId, url);
    const newVersion = current + 1;
    await setPageVersion(tabId, url, newVersion);
    console.log(`[SW] ⬆️  Incremented pageVersion: ${current} → ${newVersion} (tab ${tabId}, ${extractDomain(url)})`);
    return newVersion;
}

// Reset pageVersion to 1 (for page refresh)
async function resetPageVersion(tabId, url) {
    await setPageVersion(tabId, url, 1);
    console.log(`[SW] 🔄 Reset pageVersion to 1 for tab ${tabId}, domain ${extractDomain(url)}`);
    return 1;
}

// Delete all domains for a specific tab (on tab close)
async function deleteTabPageVersions(tabId) {
    const state = await readTabState();

    if (state.tabs[tabId]) {
        const domainCount = Object.keys(state.tabs[tabId].domains || {}).length;
        delete state.tabs[tabId];
        await writeTabState(state);
        console.log(`[SW] 🗑️  Deleted tab ${tabId} with ${domainCount} domain(s)`);
    }
}

// Listen for tab close events
chrome.tabs.onRemoved.addListener((tabId) => {
    console.log(`[SW] 🚪 Tab ${tabId} closed, cleaning up pageVersions`);
    deleteTabPageVersions(tabId);
    tabState.delete(tabId);
});
*/

// ============================================================================
// 🗑️ END OF COMMENTED OUT PAGE VERSIONING SYSTEM
// ============================================================================

// ============================================================================
// 🎯 CLEAN SCAN ORCHESTRATION - One scan at a time, no overlaps
// ============================================================================
// Per-tab state tracking (in-memory for scan coordination)
const tabState = new Map(); // tabId -> { scanInProgress, lastUrl }

// Legacy state (keeping for compatibility with other code)
const tabScanState = new Map(); // DEPRECATED - will be removed
let internalTabState = new Map(); // tabId -> enhanced tab info
let lastActiveTabId = null;
let tabCache = new Map(); // tabId -> cached data

// 🆕 NEW: Proactive site config management
let siteConfigs = {}; // Store site configs locally for immediate access

// 🛡️ Keep-alive configuration to prevent Chrome from suspending the service worker
const KEEP_ALIVE_PORT_NAME = "ome_keep_alive";
const KEEP_ALIVE_CHECK_INTERVAL_MS = 30 * 1000;
const HEARTBEAT_ALARM_NAME = "ome_ws_heartbeat";
const HEARTBEAT_PERIOD_MINUTES = 1;
const keepAlivePorts = new Set();
let lastHeartbeatSent = 0;

// No caching - always get real-time tab state

/**
 * 🔌 Initialize WebSocket connection to the server
 * 
 * Establishes connection to the WebSocket server running on localhost:17892.
 * This connection is used for all communication between the extension
 * and external test clients.
 */
async function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    console.log("[SW] Extension startup / reconnect, connecting WebSocket…");

    try {
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

                    // 🆕 NEW: Send active tab info immediately on connection
                    sendActiveTabInfo();

                    // Flush any pending messages that were queued
                    flushPendingMessages();

                    // Send immediate heartbeat so server knows we are alive
                    sendHeartbeat("onopen");
                } else {
                    console.warn("[SW] WebSocket not ready after delay, retrying…");
                    setTimeout(connectWebSocket, 500);
                }
            }, 100); // Small delay to ensure WebSocket is ready
        };

        ws.onmessage = (event) => {
            console.log("[SW] Message received:", event.data);
            handleServerMessage(event.data);
        };

        ws.onclose = (event) => {
            console.warn("[SW] WS closed", {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            });
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
 * 🛡️ Ensure a keep-alive port is connected so Chrome does not suspend the worker
 */
async function ensureKeepAlivePort() {
    if (keepAlivePorts.size > 0) {
        return;
    }

    console.log("[SW] ⏳ No keep-alive ports detected, attempting recovery…");

    // Try to create or ensure the offscreen document first (works even with no tabs)
    await ensureOffscreenDocument();
    if (keepAlivePorts.size > 0) {
        return;
    }

    // Fallback: inject helper into any accessible HTTP(S) tab
    try {
        const candidateTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
        for (const tab of candidateTabs) {
            if (!isTabAccessible(tab)) {
                continue;
            }

            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        if (window.__omeKeepAlivePort) {
                            return;
                        }
                        const port = chrome.runtime.connect({ name: "ome_keep_alive" });
                        window.__omeKeepAlivePort = port;
                        port.onDisconnect.addListener(() => {
                            delete window.__omeKeepAlivePort;
                        });
                    }
                });

                console.log(`[SW] Keep-alive port established via tab ${tab.id}`);
                return;
            } catch (injectionError) {
                console.warn(`[SW] Keep-alive injection failed for tab ${tab.id}:`, injectionError.message);
            }
        }

        console.warn("[SW] Keep-alive port not created - no accessible tabs available");
    } catch (error) {
        console.error("[SW] Failed to establish keep-alive port:", error);
    }
}

/**
 * 🪟 Create/ensure an offscreen document to host a persistent keep-alive port.
 * This is used when no regular tabs are available (e.g., only chrome:// pages open).
 */
async function ensureOffscreenDocument() {
    if (!chrome.offscreen || !chrome.offscreen.createDocument) {
        return;
    }

    try {
        const hasDoc = await chrome.offscreen.hasDocument?.();
        if (hasDoc) {
            return;
        }

        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL("offscreen.html"),
            reasons: ["TESTING"],
            justification: "Keep OM-E automation bridge alive while tabs are inactive"
        });
        console.log("[SW] 🪟 Offscreen document created for keep-alive");
    } catch (error) {
        console.warn("[SW] ⚠️ Failed to create offscreen document:", error);
    }
}

/**
 * 💓 Create/restart the heartbeat alarm so Chrome periodically wakes us up.
 */
function scheduleHeartbeatAlarm() {
    if (!chrome.alarms) {
        return;
    }
    chrome.alarms.create(HEARTBEAT_ALARM_NAME, { periodInMinutes: HEARTBEAT_PERIOD_MINUTES });
}

chrome.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM_NAME) {
        sendHeartbeat("alarm");
        ensureKeepAlivePort();
    }
});

/**
 * 💓 Send a ping to the server so both sides know the connection is alive.
 */
function sendHeartbeat(reason = "manual") {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("[SW] Heartbeat skipped - WebSocket not open");
        connectWebSocket();
        return;
    }

    lastHeartbeatSent = Date.now();
    sendToServer({
        type: "ping",
        source: "extension",
        reason,
        keepAlivePorts: keepAlivePorts.size,
        timestamp: lastHeartbeatSent
    });
}

/**
 * 🆕 NEW: Load site configs from storage on service worker startup
 * 
 * This ensures site configs are available immediately for proactive sending
 * without waiting for the WebSocket connection to be established.
 */
async function loadSiteConfigsFromStorage() {
    try {
        const result = await chrome.storage.local.get(['siteConfigs']);
        siteConfigs = result.siteConfigs || {};
        console.log(`[SW] 📋 Loaded ${Object.keys(siteConfigs).length} site configs from storage on startup`);

        // Log available domains for debugging
        if (Object.keys(siteConfigs).length > 0) {
            const domains = Object.keys(siteConfigs).filter(domain => domain !== 'default');
            console.log(`[SW] 🎯 Available site configs for domains:`, domains);
        }

    } catch (error) {
        console.error("[SW] ❌ Failed to load site configs from storage on startup:", error);
        siteConfigs = {};
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

// ============================================================================
// 🚀 UNIFIED SCAN REQUEST - Single entry point for ALL scan triggers
// ============================================================================

// 🔍 DEBUG: Track scan request order
let scanRequestCounter = 0;

async function requestScan(tabId, url, trigger) {
    const requestNum = ++scanRequestCounter;
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.log(`[SW] 🔍 SCAN REQUEST #${requestNum} @ ${timestamp} | trigger="${trigger}" | tab=${tabId} | url=${url}`);

    // Skip chrome:// URLs
    if (!url || url.startsWith("chrome://")) {
        console.log(`[SW] ⏭️  Skipping chrome:// URL`);
        return;
    }

    const state = tabState.get(tabId) || { scanInProgress: false };

    // 🔒 DEDUPE: Scan already in progress
    if (state.scanInProgress) {
        console.log(`[SW] ⏸️  Scan in progress, ignoring request from ${trigger}`);
        return;
    }

    // 🔒 DEDUPE: Same URL, already scanned (unless forced rescan)
    // Force rescan for: post_action, significant_dom_change, page_refresh, tab_switch, post_scroll, inputPattern_submit
    // TODO: Move forcedTriggers to config
    const forcedTriggers = ['post_action', 'significant_dom_change', 'page_refresh', 'tab_switch', 'post_scroll', 'inputPattern_submit'];
    const shouldSkip = state.lastUrl === url && !state.scanInProgress && !forcedTriggers.includes(trigger);

    if (shouldSkip) {
        console.log(`[SW] ✅ Already scanned ${url}, skipping (trigger: ${trigger})`);
        return;
    }

    // 🗑️ CRUFT REMOVAL: Page version system removed - text.md uses simple sequential IDs
    // // 🔢 PAGE VERSION: Get from Chrome Storage (persistent across reloads)
    // const isNewPage = state.lastUrl !== url;
    // const isRefresh = trigger === 'page_refresh';
    // let pageVersion;
    //
    // if (isRefresh) {
    //     // Page refresh (F5) - reset to version 1
    //     pageVersion = await resetPageVersion(tabId, url);
    //     console.log(`[SW] 🔄 PAGE REFRESH: pageVersion reset to ${pageVersion}`);
    // } else if (isNewPage) {
    //     // New URL navigation - increment version
    //     pageVersion = await incrementPageVersion(tabId, url);
    //     console.log(`[SW] 📄 NEW PAGE: pageVersion=${pageVersion}`);
    // } else {
    //     // Rescan of same URL - keep existing version
    //     pageVersion = await getPageVersion(tabId, url);
    //     if (pageVersion === 0) {
    //         // First scan of this tab-URL combo
    //         pageVersion = await incrementPageVersion(tabId, url);
    //     }
    //     console.log(`[SW] 🔄 RESCAN: pageVersion=${pageVersion} (unchanged)`);
    // }

    const pageVersion = null;  // ✅ SIMPLIFIED: No more page versioning

    // Mark scan in progress
    tabState.set(tabId, {
        scanInProgress: true,
        lastUrl: url
    });

    console.log(`[SW] 🚀 Starting scan: trigger=${trigger}`);

    // Ensure content script is injected
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
    } catch (error) {
        console.warn("[SW] Unable to inject content script:", error.message);
        // Release lock on error
        const currentState = tabState.get(tabId);
        if (currentState) {
            currentState.scanInProgress = false;
        }
        return;
    }

    // Send scan request to content script
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: 'start_scan',
            pageVersion,
            url,
            trigger
        });
    } catch (err) {
        console.error('[SW] Failed to send scan request:', err);
        // Release lock on error
        const currentState = tabState.get(tabId);
        if (currentState) {
            currentState.scanInProgress = false;
        }
    }
}

// ============================================================================
// 📦 Handle scan completion from content script
// ============================================================================
function handleScanComplete(message, sender) {
    const tabId = sender.tab.id;
    const state = tabState.get(tabId);

    if (state) {
        state.scanInProgress = false;
        console.log(`[SW] ✅ Scan complete: tab=${tabId}`);
    }

    // Forward intelligence update to server
    if (message.intelligenceData && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'intelligence_update',
            data: message.intelligenceData
        }));
    }
}

// ============================================================================
// DEPRECATED - Old function kept for compatibility, redirects to requestScan
// ============================================================================
async function triggerIntelligenceScan(tabId, url, reason = "navigation_completed") {
    console.log(`[SW] ⚠️  DEPRECATED: triggerIntelligenceScan called, redirecting to requestScan`);
    await requestScan(tabId, url, reason);
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
        // 🆕 NEW: Prevent content script refresh during action execution
        if (actionInProgress) {
            console.log("[SW] ⏸️ Skipping content script refresh - action in progress for tab:", tabId);
            return;
        }

        console.log("[SW] Ensuring content script is fresh for tab:", tabId);

        // Force re-injection of content script
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });

        console.log("[SW] Content script refreshed for tab:", tabId);

        // 🆕 NEW: Proactively send site config immediately after content script injection
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab && tab.url) {
                console.log(`[SW] 🚀 Proactively sending site config after content script refresh for tab ${tabId}`);
                await proactivelySendSiteConfig(tabId, tab.url);
            }
        } catch (error) {
            console.warn(`[SW] ⚠️ Could not proactively send site config after refresh for tab ${tabId}:`, error.message);
        }

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

        // 🆕 NEW: Also send active tab information immediately
        await sendActiveTabInfo();

    } catch (error) {
        console.error("[SW] Failed to get tabs info:", error);
    }
}

/**
 * 🎯 NEW: Send active tab information to server
 * 
 * This function sends just the current active tab information
 * for immediate visibility in the terminal.
 */
async function sendActiveTabInfo() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const activeTab = tabs[0];
            const activeTabInfo = {
                id: activeTab.id,
                url: activeTab.url,
                title: activeTab.title,
                status: activeTab.status,
                pendingUrl: activeTab.pendingUrl
            };

            // Send active tab info to server
            sendToServer({
                type: "active_tab_info",
                activeTab: activeTabInfo,
                timestamp: Date.now()
            });

            console.log("[SW] 🎯 Active tab info sent:", {
                id: activeTabInfo.id,
                url: activeTabInfo.url,
                title: activeTabInfo.title.substring(0, 50) + "..."
            });
        }
    } catch (error) {
        console.error("[SW] Failed to send active tab info:", error);
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
                },
                // 🆕 NEW: Site config tracking
                siteConfigSent: false,
                lastConfigSent: null,
                currentDomain: null,
                currentFramework: 'generic',
                siteConfigError: null,
                lastConfigError: null
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

        // Handle site configs update
        if (message.type === "site_configs_update") {
            console.log("[SW] 📋 Received site configs update:", message.data);

            // 🆕 NEW: Store site configs locally for immediate access
            siteConfigs = message.data;
            console.log(`[SW] ✅ Site configs stored locally: ${Object.keys(siteConfigs).length} configs available`);

            // Store in chrome.storage for persistence
            chrome.storage.local.set({ siteConfigs: message.data }, () => {
                console.log("[SW] ✅ Site configs stored in chrome.storage");
            });



            // Forward to all content scripts
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        type: "site_configs_update",
                        data: message.data
                    }).catch(() => {
                        // Tab might not have content script loaded
                    });
                });
            });
            return;
        }

        // Handle LLM action messages
        if (message.type === "execute_llm_action") {
            console.log("[SW] 🤖 Processing LLM action:", message.data);
            handleExecuteLLMAction(message, (response) => {
                console.log("[SW] 🤖 LLM action response:", response);
            });
            return;
        }

        // 🎯 PREMIUM: Handle capability execution messages
        if (message.type === "execute_capability") {
            console.log("[SW] 🎯 Processing capability execution:", message);
            handleExecuteCapability(message);
            return;
        }

        if (message.type === "server_ping") {
            console.log("[SW] 💓 Server heartbeat received");
            sendToServer({
                type: "pong",
                source: "extension",
                timestamp: Date.now()
            });
            return;
        }

        // 🎛️ HUD: Toggle overlay interface
        if (message.type === "toggle_hud") {
            console.log("[SW] 🎛️ Processing HUD toggle");
            handleToggleHUD(message);
            return;
        }

        // 🎨 Set orb theme
        if (message.type === "set_orb_theme") {
            console.log("[SW] 🎨 Processing orb theme change:", message.theme);
            handleSetOrbTheme(message);
            return;
        }

        // 🎨 Get available orb themes
        if (message.type === "get_orb_themes") {
            console.log("[SW] 🎨 Getting available orb themes");
            handleGetOrbThemes(message);
            return;
        }

        // Check if this is a command message
        if (message.command && message.id) {
            console.log("[SW] Processing command:", message.command, "with id:", message.id, "and params:", message.params);

            // Route command to appropriate handler
            switch (message.command) {
                case "navigate":
                    handleNavigateCommand(message);
                    break;
                // 🗂️ TAB CONTROL: Browser tab management commands
                case "switchTab":
                    handleSwitchTabCommand(message);
                    break;
                case "openTab":
                    handleOpenTabCommand(message);
                    break;
                case "closeTab":
                    handleCloseTabCommand(message);
                    break;
                case "updateTabUrl":
                    handleUpdateTabUrlCommand(message);
                    break;
                case "waitFor":
                case "getText":
                case "click":
                case "getPageMarkdown":
                case "extractPageText":
                case "scroll":  // 📜 Page-by-page viewport scrolling
                case "getCurrentTabInfo":
                case "getNavigationContext":
                case "searchActions":
                case "discoverLoginControls":
                case "generateSiteMap":
                case "scanAndRegisterElements":  // 🆕 NEW: Added missing command
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
            case "network_activity":
                handleNetworkActivity(message, sender);
                return true; // Keep channel open for async response
            case 'intelligence_update':
                handleIntelligenceUpdate(message, sender, sendResponse);
                break;
            case 'scan_complete':
                handleScanComplete(message, sender);
                sendResponse({ ok: true });
                break;
            case 'request_scan':
                // Content script detected significant DOM change
                if (sender.tab) {
                    requestScan(sender.tab.id, message.url, message.trigger);
                }
                sendResponse({ ok: true });
                break;
            case 'get_site_config_for_domain':
                // Handle async response properly
                handleGetSiteConfigForDomain(message, sendResponse).catch(error => {
                    console.error('[SW] Error in handleGetSiteConfigForDomain:', error);
                    sendResponse({ config: null, error: error.message });
                });
                break;

            case 'execute_llm_action':
                handleExecuteLLMAction(message, sendResponse);
                break;
            case 'execute_capability':
                // Handle capability execution from content script (e.g., zoom controls)
                // Must handle async properly to keep message channel open
                handleExecuteCapabilityFromContent(message, sendResponse).catch(error => {
                    console.error('[SW] Error in handleExecuteCapabilityFromContent:', error);
                    sendResponse({ ok: false, error: error.message });
                });
                break;
            case 'ping':
                // Simple ping response for context validation
                sendResponse({ ok: true, pong: true });
                break;
            case 'force_content_script_reinjection':
                handleForceContentScriptReinjection(message, sendResponse);
                break;
            case 'force_extension_reload':
                handleForceExtensionReload(message, sendResponse);
                break;
            case 'immediate_scan_results':
                handleImmediateScanResults(message, sendResponse);
                break;
            case 'get_orb_state':
                // 🐰 Return current orb state to content script
                console.log('[SW] 🐰 Returning orb state:', orbState);
                sendResponse({ ok: true, ...orbState });
                break;
            case 'set_orb_state':
                // 🐰 Update orb state from content script
                if (message.theme !== undefined) orbState.theme = message.theme;
                if (message.position !== undefined) orbState.position = message.position;
                console.log('[SW] 🐰 Updated orb state:', orbState);
                sendResponse({ ok: true });
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
 * 🛡️ Track keep-alive ports so the service worker stays running
 */
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== KEEP_ALIVE_PORT_NAME) {
        return;
    }

    keepAlivePorts.add(port);
    console.log("[SW] Keep-alive port connected", { total: keepAlivePorts.size });

    port.onDisconnect.addListener(() => {
        keepAlivePorts.delete(port);
        console.log("[SW] Keep-alive port disconnected", { remaining: keepAlivePorts.size });
        ensureKeepAlivePort();
    });
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

// ============================================================================
// 🗂️ TAB CONTROL HANDLERS - Browser tab management via chrome.tabs API
// ============================================================================

/**
 * 🗂️ Handle switch tab command
 *
 * Switches to a specific tab by ID, making it the active tab.
 * Uses chrome.tabs.update() to activate the tab.
 *
 * @param {Object} message - Command message with tabId in params
 */
async function handleSwitchTabCommand(message) {
    try {
        const { tabId } = message.params || {};
        console.log("[SW] 🗂️ Executing switchTab command with params:", message.params);

        if (!tabId) {
            sendErrorResponse(message.id, "MISSING_PARAM", "tabId is required for switchTab");
            return;
        }

        // Activate the specified tab
        await chrome.tabs.update(parseInt(tabId), { active: true });
        console.log("[SW] 🗂️ Switched to tab:", tabId);

        // Get the tab info to return
        const tab = await chrome.tabs.get(parseInt(tabId));

        // Send updated tab info to server
        await sendActiveTabInfo();
        await sendTabsInfo();

        // Send success response
        sendSuccessResponse(message.id, {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active
        });

    } catch (error) {
        console.error("[SW] 🗂️ Switch tab failed:", error);
        sendErrorResponse(message.id, "SWITCH_TAB_ERROR", error.message);
    }
}

/**
 * 🗂️ Handle open tab command
 *
 * Opens a new browser tab with an optional URL.
 * Uses chrome.tabs.create() to create the new tab.
 *
 * @param {Object} message - Command message with optional url in params
 */
async function handleOpenTabCommand(message) {
    try {
        const { url } = message.params || {};
        console.log("[SW] 🗂️ Executing openTab command with params:", message.params);

        // Create new tab (with URL if provided)
        const createOptions = {};
        if (url) {
            createOptions.url = url;
        }

        const newTab = await chrome.tabs.create(createOptions);
        console.log("[SW] 🗂️ Opened new tab:", newTab.id, "url:", newTab.url || "new tab page");

        // Send updated tab info to server
        await sendActiveTabInfo();
        await sendTabsInfo();

        // Send success response
        sendSuccessResponse(message.id, {
            tabId: newTab.id,
            url: newTab.url,
            title: newTab.title,
            active: newTab.active
        });

    } catch (error) {
        console.error("[SW] 🗂️ Open tab failed:", error);
        sendErrorResponse(message.id, "OPEN_TAB_ERROR", error.message);
    }
}

/**
 * 🗂️ Handle close tab command
 *
 * Closes a specific tab by ID.
 * Uses chrome.tabs.remove() to close the tab.
 *
 * @param {Object} message - Command message with tabId in params
 */
async function handleCloseTabCommand(message) {
    try {
        const { tabId } = message.params || {};
        console.log("[SW] 🗂️ Executing closeTab command with params:", message.params);

        if (!tabId) {
            sendErrorResponse(message.id, "MISSING_PARAM", "tabId is required for closeTab");
            return;
        }

        // Close the specified tab
        await chrome.tabs.remove(parseInt(tabId));
        console.log("[SW] 🗂️ Closed tab:", tabId);

        // Send updated tab info to server
        await sendActiveTabInfo();
        await sendTabsInfo();

        // Send success response
        sendSuccessResponse(message.id, {
            closedTabId: parseInt(tabId),
            message: `Tab ${tabId} closed successfully`
        });

    } catch (error) {
        console.error("[SW] 🗂️ Close tab failed:", error);
        sendErrorResponse(message.id, "CLOSE_TAB_ERROR", error.message);
    }
}

/**
 * 🗂️ Handle update tab URL command
 *
 * Navigates a specific tab to a new URL.
 * Uses chrome.tabs.update() to change the URL.
 *
 * @param {Object} message - Command message with tabId and url in params
 */
async function handleUpdateTabUrlCommand(message) {
    try {
        const { tabId, url } = message.params || {};
        console.log("[SW] 🗂️ Executing updateTabUrl command with params:", message.params);

        if (!tabId) {
            sendErrorResponse(message.id, "MISSING_PARAM", "tabId is required for updateTabUrl");
            return;
        }
        if (!url) {
            sendErrorResponse(message.id, "MISSING_PARAM", "url is required for updateTabUrl");
            return;
        }

        // Update the tab's URL
        await chrome.tabs.update(parseInt(tabId), { url: url });
        console.log("[SW] 🗂️ Updated tab:", tabId, "to URL:", url);

        // Clear cache for this tab
        clearTabCache(parseInt(tabId));

        // Get the updated tab info
        const tab = await chrome.tabs.get(parseInt(tabId));

        // Send updated tab info to server
        await sendActiveTabInfo();
        await sendTabsInfo();

        // Send success response
        sendSuccessResponse(message.id, {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active
        });

    } catch (error) {
        console.error("[SW] 🗂️ Update tab URL failed:", error);
        sendErrorResponse(message.id, "UPDATE_TAB_URL_ERROR", error.message);
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

            // 🆕 NEW: Proactively send site config immediately after content script injection
            console.log(`[SW] 🚀 Proactively sending site config after content script injection for tab ${activeTab.id}`);
            await proactivelySendSiteConfig(activeTab.id, activeTab.url);

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

            // 📜 POST-SCROLL SCAN: Trigger rescan after scroll completes
            if (message.command === "scroll" && response && response.ok) {
                console.log("[SW] 📜 Scroll complete, triggering post-scroll scan...");
                setTimeout(() => {
                    requestScan(activeTab.id, activeTab.url, 'post_scroll');
                }, 300);
            }
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

        // 🆕 NEW: Site config status
        const tabsWithSiteConfigs = Array.from(internalTabState.values())
            .filter(tab => tab.siteConfigSent).length;
        const totalSiteConfigs = Object.keys(siteConfigs).length;

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
            // 🆕 NEW: Site config status
            tabsWithSiteConfigs: tabsWithSiteConfigs,
            totalSiteConfigs: totalSiteConfigs,
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

        // 🚫 DISABLED: Don't trigger full rescans on DOM mutations
        // DOM mutations are now handled incrementally by content.js via registerInteractiveSubtree
        // which respects the scan lock and prevents duplicate IDs.
        // Triggering full rescans here causes:
        // - Counter accumulation (165 → 173 → 189 → 250)
        // - ID inconsistency in llm_prompt.md
        // - Multiple overlapping scans
        // - Chaos for LLM as action IDs keep changing
        //
        // ORIGINAL CODE (DISABLED):
        // if (targetTabId && message.isSignificant && !actionInProgress) {
        //     console.log("[SW] 🔁 Triggering rescan due to significant DOM changes (action not in progress)");
        //     setTimeout(() => {
        //         triggerIntelligenceScan(targetTabId, message.url, "dom_mutation", true);
        //     }, 500);
        // } else if (actionInProgress) {
        //     console.log("[SW] ⏸️ Skipping DOM mutation rescan - action in progress");
        // }

        // ✅ NEW: Log that we're letting content.js handle mutations incrementally
        if (targetTabId && message.isSignificant) {
            console.log("[SW] ✅ DOM mutation detected - content.js will handle incrementally via registerInteractiveSubtree");
        }

    } catch (error) {
        console.error("[SW] ❌ Failed to handle DOM changed message:", error);
    }
}

// Note: Network activity handler is added to the existing message listener below

async function handleNetworkActivity(message, sender) {
    try {
        const tabId = sender.tab?.id;
        if (!tabId) return;

        console.log("[SW] 🌐 Network activity:", {
            eventType: message.eventType,
            url: message.url,
            status: message.status,
            inflightRequests: message.inflightRequests,
            tabId
        });

        // Update tab state with network activity
        const tabState = internalTabState.get(tabId);
        if (tabState) {
            if (!tabState.networkActivity) {
                tabState.networkActivity = {
                    inflightRequests: 0,
                    lastActivity: null,
                    recentRequests: []
                };
            }

            tabState.networkActivity.inflightRequests = message.inflightRequests || 0;
            tabState.networkActivity.lastActivity = message.timestamp;

            // Track recent requests (keep last 10)
            if (message.eventType.includes('_end')) {
                tabState.networkActivity.recentRequests.push({
                    url: message.url,
                    status: message.status,
                    timestamp: message.timestamp
                });
                if (tabState.networkActivity.recentRequests.length > 10) {
                    tabState.networkActivity.recentRequests.shift();
                }
            }
        }

        // 🆕 NEW: Notify webserver about network activity
        sendToServer({
            type: "network_activity",
            tabId,
            eventType: message.eventType,
            url: message.url,
            status: message.status,
            timestamp: message.timestamp,
            inflightRequests: message.inflightRequests
        });

        // 🚫 DISABLED: Don't trigger automatic rescans during action execution
        // This prevents invalidating action IDs before actions complete
        // Rescans will be triggered post-action instead
        if (message.eventType.includes('_end') && message.inflightRequests === 0 && !actionInProgress) {
            console.log("[SW] 🔁 Network activity completed, scheduling rescan (action not in progress)...");
            setTimeout(() => {
                const tab = internalTabState.get(tabId);
                if (tab && tab.url) {
                    triggerIntelligenceScan(tabId, tab.url, "network_idle", true);
                }
            }, 1000); // Wait 1 second after network idle
        } else if (actionInProgress) {
            console.log("[SW] ⏸️ Skipping network idle rescan - action in progress");
        }

    } catch (error) {
        console.error("[SW] ❌ Failed to handle network activity:", error);
    }
}

/**
 * 🧠 Handle intelligence updates from content script
 * 
 * This function processes intelligence updates and forwards them to the server
 * for LLM consumption and storage.
 * 
 * @param {Object} message - Intelligence update message
 * @param {Function} sendResponse - Response callback
 */
async function handleIntelligenceUpdate(message, sender, sendResponse) {
    try {
        console.log("[SW] 🧠 Processing intelligence update from content script");

        // 🆕 ENHANCED: Better data validation
        if (!message || !message.data) {
            console.error("[SW] ❌ Invalid intelligence update message:", message);
            sendResponse({ ok: false, error: "Invalid message format" });
            return;
        }

        const sourceTabId = sender?.tab?.id;
        const sourceTabUrl = sender?.tab?.url || 'unknown';
        const sourceTabTitle = sender?.tab?.title || 'Unknown';

        if (!sourceTabId) {
            console.warn('[SW] ⚠️ Intelligence update without tab context, ignoring');
            sendResponse({ ok: false, error: 'Missing tab context' });
            return;
        }

        // Ensure this update is for the currently active tab
        const activeTab = await findActiveTab();
        if (!activeTab || activeTab.id !== sourceTabId) {
            console.log('[SW] ⏸️ Skipping intelligence update from inactive tab', {
                sourceTabId,
                sourceTabUrl,
                activeTabId: activeTab?.id,
                reason: 'inactive_tab'
            });
            sendResponse({ ok: true, skipped: true, reason: 'inactive_tab' });
            return;
        }

        const intelligenceData = message.data;
        console.log("[SW] 🧠 Intelligence data received:", {
            hasPageState: !!intelligenceData.pageState,
            actionableElementsCount: intelligenceData.actionableElements?.length || 0,
            insightsCount: intelligenceData.recentInsights?.length || 0,
            totalEvents: intelligenceData.totalEvents || 0,
            hasActionMapping: !!intelligenceData.actionMapping,
            timestamp: intelligenceData.timestamp
        });

        // Attach tab metadata to intelligence payload
        intelligenceData.tabId = sourceTabId;
        intelligenceData.tabUrl = sourceTabUrl;
        intelligenceData.tabTitle = sourceTabTitle;

        // 🆕 ENHANCED: Validate required fields
        if (!intelligenceData.actionableElements || !Array.isArray(intelligenceData.actionableElements)) {
            console.warn("[SW] ⚠️ Missing or invalid actionableElements in intelligence data");
        }

        // Forward intelligence update to server
        if (ws && ws.readyState === WebSocket.OPEN) {
            const serverMessage = {
                type: "intelligence_update",
                tabId: sourceTabId,
                tabUrl: sourceTabUrl,
                tabTitle: sourceTabTitle,
                data: intelligenceData
            };

            ws.send(JSON.stringify(serverMessage));
            console.log("[SW] 📤 Intelligence update sent to server");

            sendResponse({ ok: true, message: "Intelligence update sent to server" });
        } else {
            console.warn("[SW] ⚠️ WebSocket not available for intelligence update");
            sendResponse({ ok: false, error: "WebSocket not available" });
        }

    } catch (error) {
        console.error("[SW] ❌ Error handling intelligence update:", error);
        console.error("[SW] ❌ Error details:", {
            message: message,
            error: error.message,
            stack: error.stack
        });
        sendResponse({ ok: false, error: error.message });
    }
}

/**
 * 🤖 Handle LLM action execution requests
 * 
 * This function receives LLM action requests from the server and executes
 * them on the appropriate page elements.
 * 
 * @param {Object} message - LLM action execution message
 * @param {Function} sendResponse - Response callback
 */
async function handleExecuteLLMAction(message, sendResponse) {
    try {
        console.log("[SW] 🤖 Executing LLM action:", message.data);

        const { actionId, actionType, params } = message.data;

        // 🆕 NEW: Set action in progress flag to prevent content script refresh
        actionInProgress = true;
        console.log("[SW] 🔒 Action execution started - preventing content script refresh");

        // Find the active tab to execute the action
        const activeTab = await findActiveTab();
        if (!activeTab) {
            actionInProgress = false; // Clear flag on error
            sendResponse({ ok: false, error: "No active tab found" });
            return;
        }

        // Send action execution command to content script
        const actionMessage = {
            type: "execute_action",
            data: {
                actionId: actionId,
                actionType: actionType,
                params: params
            }
        };

        console.log("[SW] 📨 Sending execute_action message to content script:", actionMessage);

        // Execute the action in the content script
        const response = await chrome.tabs.sendMessage(activeTab.id, actionMessage);

        if (response && response.ok) {
            console.log("[SW] ✅ LLM action executed successfully:", actionId);

            sendResponse({ ok: true, result: response.result });

            // 🆕 NEW: Trigger rescan after action completes (1s delay for DOM changes)
            console.log("[SW] ⏳ Waiting 1 second before triggering post-action scan...");
            setTimeout(async () => {
                await requestScan(activeTab.id, activeTab.url, 'post_action');
            }, 1000);
        } else {
            console.error("[SW] ❌ LLM action execution failed:", response?.error);

            // 🆕 NEW: Clear action flag on failure
            actionInProgress = false;
            console.log("[SW] 🔓 Action execution failed - clearing action flag");

            sendResponse({ ok: false, error: response?.error || "Action execution failed" });
        }

    } catch (error) {
        console.error("[SW] ❌ Error executing LLM action:", error);

        // 🆕 NEW: Clear action flag on exception
        actionInProgress = false;
        console.log("[SW] 🔓 Action execution exception - clearing action flag");

        sendResponse({ ok: false, error: error.message });
    }
}

/**
 * 🎯 PREMIUM: Handle capability execution with smart dispatcher
 *
 * Routes capabilities to appropriate handlers:
 * - Tab capabilities (SwitchTab, OpenTab, etc.) → Service worker handlers (chrome.tabs API)
 * - DOM capabilities (RetrieveTranscript, etc.) → Content script (page-level operations)
 */
async function handleExecuteCapability(message) {
    try {
        console.log("[SW] 🎯 Executing capability:", message);

        const { id, action, params } = message;
        const requestId = id || `cap_${action}_${Date.now()}`;

        // 🗂️ SMART DISPATCHER: Check if this is a browser-level capability
        const tabCapabilities = ['SwitchTab', 'OpenTab', 'CloseTab', 'UpdateTabURL'];
        const zoomCapabilities = ['ZoomIn', 'ZoomOut', 'ZoomReset'];

        if (tabCapabilities.includes(action)) {
            // Route to service worker handlers (browser-level operations)
            console.log("[SW] 🗂️ Routing to tab capability handler:", action, "requestId:", requestId);
            await handleTabCapability(action, params || {}, requestId);
            return;
        }

        if (zoomCapabilities.includes(action)) {
            // Route to zoom handlers (browser-level operations)
            console.log("[SW] 🔍 Routing to zoom capability handler:", action, "requestId:", requestId);
            await handleZoomCapability(action, params || {}, requestId);
            return;
        }

        // 🎯 DOM CAPABILITY: Route to content script (page-level operations)
        console.log("[SW] 🎯 Routing to DOM capability handler:", action, "requestId:", requestId);
        await handleDOMCapability(action, params || {}, requestId);

    } catch (error) {
        console.error("[SW] ❌ Error executing capability:", error);
    }
}

/**
 * 🎛️ Handle HUD toggle command
 *
 * Forwards toggle_hud message to the active tab's content script.
 * The content script manages orb and HUD overlay visibility.
 *
 * @param {Object} message - Message with id property
 */
async function handleToggleHUD(message) {
    try {
        console.log("[SW] 🎛️ Toggling HUD");
        const requestId = message.id || `hud_${Date.now()}`;

        const activeTab = await findActiveTab();
        if (!activeTab) {
            console.error("[SW] 🎛️ No active tab found for HUD toggle");
            sendToServer({
                type: "hud_response",
                id: requestId,
                ok: false,
                error: "No active tab found"
            });
            return;
        }

        // Forward to content script
        const response = await chrome.tabs.sendMessage(activeTab.id, {
            type: "toggle_hud"
        });

        console.log("[SW] 🎛️ HUD toggle response:", response);
        sendToServer({
            type: "hud_response",
            id: requestId,
            ok: response?.ok ?? true,
            result: response
        });

    } catch (error) {
        console.error("[SW] ❌ Error toggling HUD:", error);
        sendToServer({
            type: "hud_response",
            id: message.id,
            ok: false,
            error: error.message
        });
    }
}

/**
 * 🎨 Handle set orb theme command
 *
 * Forwards set_orb_theme message to the active tab's content script.
 *
 * @param {Object} message - Message with id and theme properties
 */
async function handleSetOrbTheme(message) {
    try {
        console.log("[SW] 🎨 Setting orb theme:", message.theme);
        const requestId = message.id || `theme_${Date.now()}`;

        const activeTab = await findActiveTab();
        if (!activeTab) {
            console.error("[SW] 🎨 No active tab found for theme change");
            sendToServer({
                type: "orb_theme_response",
                id: requestId,
                ok: false,
                error: "No active tab found"
            });
            return;
        }

        // Forward to content script
        const response = await chrome.tabs.sendMessage(activeTab.id, {
            type: "set_orb_theme",
            theme: message.theme
        });

        console.log("[SW] 🎨 Set orb theme response:", response);
        sendToServer({
            type: "orb_theme_response",
            id: requestId,
            ok: response?.ok ?? false,
            result: response
        });

    } catch (error) {
        console.error("[SW] ❌ Error setting orb theme:", error);
        sendToServer({
            type: "orb_theme_response",
            id: message.id,
            ok: false,
            error: error.message
        });
    }
}

/**
 * 🎨 Handle get orb themes command
 *
 * Forwards get_orb_themes message to the active tab's content script.
 *
 * @param {Object} message - Message with id property
 */
async function handleGetOrbThemes(message) {
    try {
        console.log("[SW] 🎨 Getting available orb themes");
        const requestId = message.id || `themes_${Date.now()}`;

        const activeTab = await findActiveTab();
        if (!activeTab) {
            console.error("[SW] 🎨 No active tab found");
            sendToServer({
                type: "orb_themes_response",
                id: requestId,
                ok: false,
                error: "No active tab found"
            });
            return;
        }

        // Forward to content script
        const response = await chrome.tabs.sendMessage(activeTab.id, {
            type: "get_orb_themes"
        });

        console.log("[SW] 🎨 Get orb themes response:", response);
        sendToServer({
            type: "orb_themes_response",
            id: requestId,
            ok: response?.ok ?? false,
            result: response
        });

    } catch (error) {
        console.error("[SW] ❌ Error getting orb themes:", error);
        sendToServer({
            type: "orb_themes_response",
            id: message.id,
            ok: false,
            error: error.message
        });
    }
}

/**
 * 🗂️ Handle tab manipulation capabilities
 *
 * Adapts capability format to existing tab command handlers.
 * Tab operations use chrome.tabs API and don't require content script.
 *
 * @param {string} action - Capability action name (SwitchTab, OpenTab, etc.)
 * @param {Object} params - Parameters (tabId, url, etc.)
 * @param {string} requestId - Request ID for response matching
 */
async function handleTabCapability(action, params, requestId) {
    console.log("[SW] 🗂️ Handling tab capability:", action, "params:", params, "requestId:", requestId);

    // Create a message in the format expected by tab handlers
    // Use the passed requestId so responses can be matched by the server
    const adaptedMessage = {
        id: requestId,
        params: params
    };

    try {
        switch (action) {
            case 'SwitchTab':
                await handleSwitchTabCommand(adaptedMessage);
                break;
            case 'OpenTab':
                await handleOpenTabCommand(adaptedMessage);
                break;
            case 'CloseTab':
                await handleCloseTabCommand(adaptedMessage);
                break;
            case 'UpdateTabURL':
                await handleUpdateTabUrlCommand(adaptedMessage);
                break;
            default:
                console.error("[SW] 🗂️ Unknown tab capability:", action);
                sendErrorResponse(requestId, "UNKNOWN_TAB_ACTION", `Unknown tab capability: ${action}`);
        }
    } catch (error) {
        console.error("[SW] 🗂️ Tab capability execution failed:", error);
        sendErrorResponse(requestId, "TAB_CAPABILITY_ERROR", error.message);
    }
}

/**
 * 🎮 Handle capability execution from content script
 *
 * Routes capability requests from HUD controls (zoom buttons, etc.)
 * to the appropriate handlers.
 *
 * @param {Object} message - Message with action and params
 * @param {Function} sendResponse - Response callback
 */
async function handleExecuteCapabilityFromContent(message, sendResponse) {
    const { action, params } = message;
    console.log("[SW] 🎮 Capability from content script:", action);

    try {
        const zoomCapabilities = ['ZoomIn', 'ZoomOut', 'ZoomReset'];

        if (zoomCapabilities.includes(action)) {
            // Handle zoom directly (no requestId needed for internal calls)
            await handleZoomCapabilityDirect(action);
            sendResponse({ ok: true, action });
        } else {
            console.warn("[SW] 🎮 Unknown capability from content:", action);
            sendResponse({ ok: false, error: `Unknown capability: ${action}` });
        }
    } catch (error) {
        console.error("[SW] 🎮 Capability error:", error);
        sendResponse({ ok: false, error: error.message });
    }
}

/**
 * 🔍 Handle zoom directly (for internal content script calls)
 *
 * Simplified zoom handler without WebSocket response handling.
 *
 * @param {string} action - ZoomIn, ZoomOut, or ZoomReset
 */
async function handleZoomCapabilityDirect(action) {
    const activeTab = await findActiveTab();
    if (!activeTab) {
        throw new Error("No active tab found for zoom");
    }

    const currentZoom = await chrome.tabs.getZoom(activeTab.id);
    const ZOOM_INCREMENT = 0.15;
    let newZoom;

    switch (action) {
        case 'ZoomIn':
            newZoom = Math.min(currentZoom + ZOOM_INCREMENT, 5.0);
            break;
        case 'ZoomOut':
            newZoom = Math.max(currentZoom - ZOOM_INCREMENT, 0.25);
            break;
        case 'ZoomReset':
            newZoom = 1.0;
            break;
        default:
            throw new Error(`Unknown zoom action: ${action}`);
    }

    await chrome.tabs.setZoom(activeTab.id, newZoom);
    console.log("[SW] 🔍 Zoom changed:", Math.round(currentZoom * 100) + "% ->", Math.round(newZoom * 100) + "%");
}

/**
 * 🔍 Handle zoom capabilities
 *
 * Uses chrome.tabs.setZoom() API for browser-level zoom control.
 * Zoom changes by 15% increments (0.15 factor).
 *
 * @param {string} action - Capability action name (ZoomIn, ZoomOut, ZoomReset)
 * @param {Object} params - Parameters (unused for zoom)
 * @param {string} requestId - Request ID for response matching
 */
async function handleZoomCapability(action, params, requestId) {
    console.log("[SW] 🔍 Handling zoom capability:", action, "requestId:", requestId);

    try {
        // Find the active tab
        const activeTab = await findActiveTab();
        if (!activeTab) {
            console.error("[SW] 🔍 No active tab found for zoom");
            sendErrorResponse(requestId, "NO_ACTIVE_TAB", "No active tab found for zoom");
            return;
        }

        // Get current zoom level
        const currentZoom = await chrome.tabs.getZoom(activeTab.id);
        console.log("[SW] 🔍 Current zoom level:", currentZoom);

        let newZoom;
        const ZOOM_INCREMENT = 0.15; // 15% increment

        switch (action) {
            case 'ZoomIn':
                newZoom = Math.min(currentZoom + ZOOM_INCREMENT, 5.0); // Max 500%
                break;
            case 'ZoomOut':
                newZoom = Math.max(currentZoom - ZOOM_INCREMENT, 0.25); // Min 25%
                break;
            case 'ZoomReset':
                newZoom = 1.0; // 100%
                break;
            default:
                console.error("[SW] 🔍 Unknown zoom action:", action);
                sendErrorResponse(requestId, "UNKNOWN_ZOOM_ACTION", `Unknown zoom action: ${action}`);
                return;
        }

        // Apply the new zoom level
        await chrome.tabs.setZoom(activeTab.id, newZoom);
        console.log("[SW] 🔍 Zoom changed:", currentZoom, "->", newZoom);

        // Send success response
        sendSuccessResponse(requestId, {
            action: action,
            previousZoom: Math.round(currentZoom * 100),
            newZoom: Math.round(newZoom * 100),
            tabId: activeTab.id
        });

    } catch (error) {
        console.error("[SW] 🔍 Zoom capability execution failed:", error);
        sendErrorResponse(requestId, "ZOOM_CAPABILITY_ERROR", error.message);
    }
}

/**
 * 🎯 Handle DOM-based capabilities
 *
 * Forwards capability commands to the active tab's content script.
 * Used for page-level operations like RetrieveTranscript, TogglePlayPause, etc.
 *
 * @param {string} action - Capability action name
 * @param {Object} params - Parameters for the capability
 * @param {string} requestId - Request ID for response matching
 */
async function handleDOMCapability(action, params, requestId) {
    console.log("[SW] 🎯 Handling DOM capability:", action, "params:", params, "requestId:", requestId);

    // Find the active tab
    const activeTab = await findActiveTab();
    if (!activeTab) {
        console.error("[SW] ❌ No active tab found for DOM capability execution");
        sendErrorResponse(requestId, "NO_ACTIVE_TAB", "No active tab found for DOM capability execution");
        return;
    }

    // Forward capability message to content script
    const capabilityMessage = {
        type: "execute_capability",
        action: action,
        params: params || {}
    };

    console.log("[SW] 📨 Forwarding capability to content script:", capabilityMessage);

    try {
        // Send to content script
        const response = await chrome.tabs.sendMessage(activeTab.id, capabilityMessage);

        if (response && response.ok) {
            console.log("[SW] ✅ DOM capability executed successfully:", action);
            // Send success response back to server with the request ID
            sendSuccessResponse(requestId, response.result || { action: action, status: "completed" });
        } else {
            console.error("[SW] ❌ DOM capability execution failed:", response?.error);
            sendErrorResponse(requestId, "DOM_CAPABILITY_FAILED", response?.error || "DOM capability execution failed");
        }
    } catch (error) {
        console.error("[SW] ❌ Error sending to content script:", error);
        sendErrorResponse(requestId, "CONTENT_SCRIPT_ERROR", error.message);
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

// ============================================================================
// TRIGGER 3: Tab Activation (user switches tabs)
// ============================================================================
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

    // 🆕 NEW: Send active tab info immediately when tab changes
    await sendActiveTabInfo();
    await sendTabsInfo();

    // 🔄 TRIGGER SCAN: When switching to a tab, trigger fresh scan to update artifacts
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
            console.log("[SW] 🔄 Triggering scan for newly activated tab:", tab.url);
            await requestScan(activeInfo.tabId, tab.url, 'tab_switch');
        }
    } catch (error) {
        console.log("[SW] Failed to trigger scan for activated tab:", error.message);
    }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) {
        return;
    }
    tabScanState.delete(details.tabId);
}, { url: [{ schemes: ['http', 'https'] }] });

// ============================================================================
// TRIGGER 0: Detect F5 Refresh (before page loads)
// ============================================================================
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) {
        return;
    }

    // Check if this is a refresh (F5 or Ctrl+R)
    const isReload = details.transitionType === 'reload' ||
                     details.transitionQualifiers?.includes('forward_back');

    if (isReload) {
        console.log(`[SW] 🔄 F5 REFRESH detected for tab ${details.tabId}`);
        // Mark this tab as having a refresh, so onCompleted knows to reset version
        const state = tabState.get(details.tabId) || {};
        state.isRefresh = true;
        tabState.set(details.tabId, state);
    }
}, { url: [{ schemes: ['http', 'https'] }] });

// ============================================================================
// TRIGGER 1: URL Change (normal navigation)
// ============================================================================
chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId !== 0) {
        return;
    }

    // Check if this was marked as a refresh by onCommitted
    const state = tabState.get(details.tabId) || {};
    const trigger = state.isRefresh ? "page_refresh" : "url_change";

    // Clear refresh flag
    if (state.isRefresh) {
        state.isRefresh = false;
        tabState.set(details.tabId, state);
    }

    requestScan(details.tabId, details.url, trigger);
}, { url: [{ schemes: ['http', 'https'] }] });

// ============================================================================
// TRIGGER 2: SPA Navigation (history API)
// ============================================================================
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) {
        return;
    }
    requestScan(details.tabId, details.url, "spa_navigation");
}, { url: [{ schemes: ['http', 'https'] }] });

/**
 * 🔄 Handle tab update events - send tab info to server
 *
 * Note: Scans are triggered by webNavigation.onCompleted, not here
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title) {
        console.log("[SW] Tab updated:", tabId, "to:", changeInfo.url || tab.url);

        // Send active tab info if this is the active tab
        if (tab.active) {
            await sendActiveTabInfo();
        }

        // Send tabs info to server
        await sendTabsInfo(false);
    }

    await ensureKeepAlivePort();
});

/**
 * 🔄 Handle tab creation events
 * 
 * When a new tab is created, send updated tab info
 */
chrome.tabs.onCreated.addListener(async (tab) => {
    console.log("[SW] Tab created:", tab.id);
    await sendActiveTabInfo();
    await sendTabsInfo();
    await ensureKeepAlivePort();
});

/**
 * 🔄 Handle tab removal events
 * 
 * When a tab is removed, send updated tab info
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
    console.log("[SW] Tab removed:", tabId);
    tabState.delete(tabId);
    tabScanState.delete(tabId);
    await sendActiveTabInfo();
    await sendTabsInfo();
    if (keepAlivePorts.size === 0) {
        await ensureKeepAlivePort();
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
    ensureKeepAlivePort();
    scheduleHeartbeatAlarm();
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
    ensureKeepAlivePort();
    scheduleHeartbeatAlarm();
});

/**
 * 🔄 Event-driven tab management (no polling needed)
 * 
 * Tab information is now sent only when:
 * - Extension connects initially
 * - Tab is activated (switched to)
 * - Tab URL/title changes
 * - Content script needs refresh
 * 
 * This eliminates unnecessary polling while maintaining real-time updates.
 */

// Initialize connection when service worker loads
connectWebSocket();
ensureKeepAlivePort();
scheduleHeartbeatAlarm();

// Periodically verify the keep-alive port still exists
setInterval(() => {
    if (keepAlivePorts.size === 0) {
        ensureKeepAlivePort();
    }
}, KEEP_ALIVE_CHECK_INTERVAL_MS);

/**
 * 🚨 Tear Away System Handlers
 * 
 * These functions handle controlled tear away and context re-injection
 * to bypass CSP restrictions on protected sites like Google.
 */

/**
 * 🔄 Handle force content script re-injection
 * 
 * @param {Object} message - Message containing re-injection request
 * @param {Function} sendResponse - Response function
 */
async function handleForceContentScriptReinjection(message, sendResponse) {
    try {
        console.log("[SW] 🚨 Handling force content script re-injection...");

        const { tabId, reason, timestamp } = message.data;

        // 🎯 Get the current active tab if not provided
        const targetTabId = tabId || await getCurrentActiveTabId();
        if (!targetTabId) {
            throw new Error("No active tab found for re-injection");
        }

        console.log(`[SW] 🚨 Force re-injecting content script in tab ${targetTabId} for reason: ${reason}`);

        // 🎯 Force content script refresh
        await ensureContentScriptFresh(targetTabId);

        // 🎯 Clear tab cache to force fresh scan
        clearTabCache(targetTabId);

        // 🎯 Mark tab as needing fresh scan
        const tabState = internalTabState.get(targetTabId);
        if (tabState) {
            tabState.needsFreshScan = true;
            tabState.contentScriptFresh = false;
            tabState.lastContentScriptRefresh = Date.now();
        }

        sendResponse({
            success: true,
            tabId: targetTabId,
            reason: reason,
            message: `Content script re-injected in tab ${targetTabId}`,
            timestamp: timestamp
        });

    } catch (error) {
        console.error("[SW] ❌ Error during force content script re-injection:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 🔄 Handle force extension reload
 * 
 * @param {Object} message - Message containing reload request
 * @param {Function} sendResponse - Response function
 */
async function handleForceExtensionReload(message, sendResponse) {
    try {
        console.log("[SW] 🚨 Handling force extension reload...");

        const { reason, timestamp } = message.data;

        console.log(`[SW] 🚨 Force reloading extension for reason: ${reason}`);

        // 🎯 Clear all internal state
        internalTabState.clear();

        // 🎯 Disconnect WebSocket
        if (ws) {
            ws.close();
            ws = null;
        }

        // 🎯 Force extension reload by updating manifest
        // Note: This is a workaround - actual reload requires user action
        console.log("[SW] 🚨 Extension reload requested - user must manually reload from chrome://extensions/");

        // 🎯 CRITICAL: Force refresh all active tabs to ensure fresh content script injection
        if (message.data.forceReload) {
            console.log("[SW] 🔄 Force reload requested, refreshing active tabs...");

            try {
                // Get all active tabs
                const tabs = await chrome.tabs.query({ active: true });
                console.log(`[SW] 🔄 Found ${tabs.length} active tabs to refresh`);

                for (const tab of tabs) {
                    try {
                        // 🎯 CRITICAL: Force hard refresh (bypass cache)
                        await chrome.tabs.reload(tab.id, { bypassCache: true });
                        console.log(`[SW] ✅ Tab ${tab.id} hard refreshed: ${tab.url}`);

                        // 🎯 Wait a moment for page to load, then inject content script
                        setTimeout(async () => {
                            try {
                                await chrome.scripting.executeScript({
                                    target: { tabId: tab.id },
                                    files: ['content.js']
                                });
                                console.log(`[SW] ✅ Content script re-injected into tab ${tab.id}`);
                            } catch (error) {
                                console.warn(`[SW] ⚠️ Failed to re-inject content script into tab ${tab.id}:`, error);
                            }
                        }, 2000); // Wait 2 seconds for page load

                    } catch (error) {
                        console.warn(`[SW] ⚠️ Failed to refresh tab ${tab.id}:`, error);
                    }
                }

                console.log("[SW] ✅ All active tabs refreshed and content scripts queued for re-injection");

            } catch (error) {
                console.error("[SW] ❌ Error refreshing tabs:", error);
            }
        }

        sendResponse({
            success: true,
            reason: reason,
            message: "Extension reload requested - manual reload required",
            timestamp: timestamp,
            note: "Go to chrome://extensions/ and click reload button",
            tabsRefreshed: message.data.forceReload || false
        });

    } catch (error) {
        console.error("[SW] ❌ Error during force extension reload:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 📊 Handle immediate scan results after tear away
 * 
 * @param {Object} message - Message containing immediate scan results
 * @param {Function} sendResponse - Response function
 */
async function handleImmediateScanResults(message, sendResponse) {
    try {
        console.log("[SW] 📊 Handling immediate scan results after tear away...");

        const scanData = message.data;

        console.log(`[SW] 📊 Immediate scan results received:`, {
            scanType: scanData.scanType,
            totalElements: scanData.elementCounts?.totalElements || 0,
            interactiveElements: scanData.elementCounts?.interactiveElements || 0,
            contentElements: scanData.elementCounts?.contentElements || 0,
            iframes: scanData.elementCounts?.iframes || 0,
            isMainFrame: scanData.frameContext?.isMainFrame || false,
            scanDuration: scanData.scanDuration || 0,
            tearAwaySuccess: scanData.tearAwaySuccess || false
        });

        // 🎯 Send results to server via WebSocket
        if (isConnected && ws) {
            const serverMessage = {
                type: "immediate_scan_results_after_tear_away",
                timestamp: Date.now(),
                data: scanData
            };

            ws.send(JSON.stringify(serverMessage));
            console.log("[SW] 📊 Immediate scan results sent to server");
        } else {
            console.log("[SW] 📊 WebSocket not available, queuing results");
            pendingMessages.push({
                type: "immediate_scan_results_after_tear_away",
                timestamp: Date.now(),
                data: scanData
            });
        }

        sendResponse({
            success: true,
            message: "Immediate scan results processed successfully",
            timestamp: Date.now()
        });

    } catch (error) {
        console.error("[SW] ❌ Error handling immediate scan results:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 🎯 Handle site config lookup for domain
 * 
 * @param {Object} message - Message containing domain to look up
 * @param {Function} sendResponse - Response function
 */
async function handleGetSiteConfigForDomain(message, sendResponse) {
    try {
        const domain = message.domain;
        console.log(`[SW] 🎯 Looking up site config for domain: ${domain}`);

        // Use local site configs if available, otherwise get from storage
        if (Object.keys(siteConfigs).length === 0) {
            const result = await chrome.storage.local.get(['siteConfigs']);
            siteConfigs = result.siteConfigs || {};
            console.log(`[SW] 📋 Loaded ${Object.keys(siteConfigs).length} site configs from storage for lookup`);
        }

        // Look up site config for this domain
        let siteConfig = null;

        // Check for exact domain match first
        if (siteConfigs[domain]) {
            siteConfig = siteConfigs[domain];
            console.log(`[SW] 🎯 Exact domain match: ${domain}`);
        } else {
            // Sort config domains by specificity (longer = more specific = higher priority)
            const sortedConfigDomains = Object.keys(siteConfigs)
                .filter(d => d !== 'default')
                .sort((a, b) => b.length - a.length);

            // Check for wildcard/subdomain matches
            for (const configDomain of sortedConfigDomains) {
                // Handle wildcard patterns like *.google.com
                if (configDomain.startsWith('*.')) {
                    const baseDomain = configDomain.slice(2); // Remove "*."
                    if (domain === baseDomain || domain.endsWith('.' + baseDomain)) {
                        siteConfig = siteConfigs[configDomain];
                        console.log(`[SW] 🎯 Wildcard match: ${domain} matched ${configDomain}`);
                        break;
                    }
                }
                // Handle exact subdomain match (domain ends with .configDomain)
                else if (domain.endsWith('.' + configDomain)) {
                    siteConfig = siteConfigs[configDomain];
                    console.log(`[SW] 🎯 Subdomain match: ${domain} matched ${configDomain}`);
                    break;
                }
            }

            // Fallback to default config
            if (!siteConfig && siteConfigs['default']) {
                siteConfig = siteConfigs['default'];
                console.log(`[SW] 🎯 Using default config for: ${domain}`);
            }
        }

        if (siteConfig) {
            console.log(`[SW] ✅ Found site config for ${domain}:`, siteConfig.framework);
            sendResponse({ config: siteConfig });
        } else {
            console.log(`[SW] ⚠️ No site config found for ${domain}`);
            sendResponse({ config: null });
        }

    } catch (error) {
        console.error('[SW] ❌ Error getting site config:', error);
        sendResponse({ config: null, error: error.message });
    }
}
