let ws = null;
let wsUrl = "ws://127.0.0.1:17892";

// Load saved WebSocket URL and connect
chrome.storage.local.get(["wsUrl"], (result) => {
    if (result.wsUrl) {
        wsUrl = result.wsUrl;
    }
    connect();
});

function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    
    console.log("[SW] connecting to", wsUrl);
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => { 
        console.log("[SW] WS open"); 
        send({ type: "bridge_status", status: "connected" }); 
    };
    
    ws.onclose = (e) => { 
        console.log("[SW] WS close", e.code, e.reason); 
        setTimeout(connect, 800); 
    };
    
    ws.onerror = (e) => { 
        console.log("[SW] WS error", e); 
        try { 
            ws.close(); 
        } catch {} 
    };
    
    ws.onmessage = async (event) => {
        console.log("[SW] Message received:", event.data);
        
        let msg;
        try {
            msg = JSON.parse(event.data);
            console.log("[SW] Parsed message:", msg);
        } catch (error) {
            console.log("[SW] Failed to parse message:", error);
            return;
        }
        
        const { id, command, params = {} } = msg;
        console.log("[SW] Processing command:", command, "with id:", id);
        
        try {
            if (command === "navigate") {
                console.log("[SW] Executing navigate command");
                const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                if (tab) {
                    await chrome.tabs.update(tab.id, { url: params.url });
                    console.log("[SW] Navigated tab:", tab.id, "to:", params.url);
                } else {
                    await chrome.tabs.create({ url: params.url, active: true });
                    console.log("[SW] Created new tab with:", params.url);
                }
                console.log("[SW] Sending navigate response");
                return reply(id, true, {});
            }
            
            // DOM operations go to content script
            console.log("[SW] Sending DOM command to content script:", command);
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab) {
                console.log("[SW] No active tab found");
                return reply(id, false, null, { code: "NO_TAB", msg: "No active tab" });
            }
            
            console.log("[SW] Sending message to tab:", tab.id);
            const response = await chrome.tabs.sendMessage(tab.id, { command, params });
            console.log("[SW] Content script response:", response);
            
            if (response && response.error) {
                return reply(id, false, null, response.error);
            }
            
            return reply(id, true, response || {});
        } catch (error) {
            console.log("[SW] Error processing command:", error);
            return reply(id, false, null, { code: "RUNTIME_ERROR", msg: String(error) });
        }
    };
}

function send(data) {
    try {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    } catch {}
}

function reply(id, ok, result = null, error = null) {
    send({ id, ok, result, error });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, callback) => {
    if (message.type === "setWsUrl") {
        wsUrl = message.url;
        chrome.storage.local.set({ wsUrl: message.url }, () => {
            try {
                ws?.close();
            } catch {}
            callback({ ok: true });
        });
        return true;
    }
});

// Auto-connect when extension starts up
chrome.runtime.onStartup.addListener(() => {
    console.log("[SW] Extension startup, connecting...");
    connect();
});

// Auto-connect when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
    console.log("[SW] Extension installed/updated, connecting...");
    connect();
});

// Ensure connection when tabs are updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only react to completed page loads on regular web pages
    if (changeInfo.status === 'complete' && 
        tab.url && 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('about:')) {
        
        console.log("[SW] Tab updated:", tab.url);
        
        // Send tab info to server
        send({ 
            type: "tab_updated", 
            tabId: tabId, 
            url: tab.url, 
            title: tab.title 
        });
        
        // Always try to connect if not connected
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log("[SW] Connection lost, reconnecting...");
            connect();
        } else {
            console.log("[SW] Connection healthy, no action needed");
        }
    }
});

// Also listen for tab activation changes
chrome.tabs.onActivated.addListener((activeInfo) => {
    console.log("[SW] Tab activated:", activeInfo.tabId);
    
    // Get tab info and send to server
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && tab.url) {
            send({ 
                type: "tab_activated", 
                tabId: tab.id, 
                url: tab.url, 
                title: tab.title 
            });
        }
    });
    
    // Ensure we're connected when switching tabs
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("[SW] Reconnecting due to tab switch...");
        connect();
    }
});

// Send all tabs info periodically
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        chrome.tabs.query({}, (tabs) => {
            const tabInfo = tabs.map(tab => ({
                id: tab.id,
                url: tab.url,
                title: tab.title,
                active: tab.active
            }));
            send({ 
                type: "tabs_info", 
                tabs: tabInfo 
            });
        });
    }
}, 10000); // Send every 10 seconds
