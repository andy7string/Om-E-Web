// Get DOM elements
const wsUrlInput = document.getElementById("wsUrl");
const saveButton = document.getElementById("saveBtn");
const statusDiv = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");

// Status display elements
const connectionStatus = document.getElementById("connectionStatus");
const activeTabs = document.getElementById("activeTabs");
const contentScripts = document.getElementById("contentScripts");
const cacheStatus = document.getElementById("cacheStatus");

// Load saved WebSocket URL from storage
chrome.storage.local.get(["wsUrl"], (result) => {
    if (result.wsUrl) {
        wsUrlInput.value = result.wsUrl;
    }
});

// Handle save button click
saveButton.addEventListener("click", () => {
    const url = wsUrlInput.value.trim();
    
    if (!url) {
        showStatus("Please enter a WebSocket URL", "error");
        return;
    }
    
    // Validate WebSocket URL format
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
        showStatus("Invalid WebSocket URL format", "error");
        return;
    }
    
    // Send message to service worker to update URL
    chrome.runtime.sendMessage({ type: "setWsUrl", url }, (response) => {
        if (response && response.ok) {
            showStatus("WebSocket URL saved and reconnecting...", "success");
        } else {
            showStatus("Failed to save WebSocket URL", "error");
        }
    });
});

// Handle refresh button click
refreshBtn.addEventListener("click", async () => {
    try {
        showStatus("Refreshing extension state...", "info");
        
        // Send message to service worker to force refresh
        const response = await chrome.runtime.sendMessage({ 
            type: "forceRefresh" 
        });
        
        if (response && response.ok) {
            showStatus("Extension state refreshed successfully!", "success");
            // Update status display
            setTimeout(updateStatusDisplay, 1000);
        } else {
            showStatus("Failed to refresh extension state", "error");
        }
    } catch (error) {
        showStatus("Error refreshing extension state: " + error.message, "error");
    }
});

// Handle clear cache button click
clearCacheBtn.addEventListener("click", async () => {
    try {
        showStatus("Clearing all cache...", "info");
        
        // Send message to service worker to clear all cache
        const response = await chrome.runtime.sendMessage({ 
            type: "clearAllCache" 
        });
        
        if (response && response.ok) {
            showStatus("All cache cleared successfully!", "success");
            // Update status display
            setTimeout(updateStatusDisplay, 1000);
        } else {
            showStatus("Failed to clear cache", "error");
        }
    } catch (error) {
        showStatus("Error clearing cache: " + error.message, "error");
    }
});

// Update status display
async function updateStatusDisplay() {
    try {
        // Get current tabs info
        const tabs = await chrome.tabs.query({});
        const activeTabsCount = tabs.filter(tab => tab.active).length;
        
        // Update active tabs count
        activeTabs.textContent = activeTabsCount;
        
        // Get extension status from service worker
        const statusResponse = await chrome.runtime.sendMessage({ 
            type: "getStatus" 
        });
        
        if (statusResponse && statusResponse.ok) {
            const status = statusResponse.result;
            
            // Update connection status
            connectionStatus.textContent = status.isConnected ? "Connected" : "Disconnected";
            connectionStatus.style.color = status.isConnected ? "#28a745" : "#dc3545";
            
            // Update content scripts status
            const freshScripts = status.tabsWithFreshScripts || 0;
            const totalTabs = status.totalTabs || 0;
            contentScripts.textContent = `${freshScripts}/${totalTabs}`;
            
            // Update cache status
            const tabsNeedingScan = status.tabsNeedingFreshScan || 0;
            cacheStatus.textContent = tabsNeedingScan > 0 ? `${tabsNeedingScan} need scan` : "All fresh";
            cacheStatus.style.color = tabsNeedingScan > 0 ? "#ffc107" : "#28a745";
            
        } else {
            // Fallback status display
            connectionStatus.textContent = "Unknown";
            contentScripts.textContent = "-";
            cacheStatus.textContent = "-";
        }
        
    } catch (error) {
        console.error("Error updating status display:", error);
        // Set fallback values
        connectionStatus.textContent = "Error";
        activeTabs.textContent = "-";
        contentScripts.textContent = "-";
        cacheStatus.textContent = "-";
    }
}

// Show status message with styling
function showStatus(message, type = "success") {
    statusDiv.textContent = message;
    statusDiv.className = type;
    
    // Clear status after 5 seconds
    setTimeout(() => {
        statusDiv.textContent = "";
        statusDiv.className = "";
    }, 5000);
}

// Add enter key support for input field
wsUrlInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        saveButton.click();
    }
});

// Initialize status display when popup opens
document.addEventListener("DOMContentLoaded", () => {
    updateStatusDisplay();
    
    // Update status every 2 seconds while popup is open
    const statusInterval = setInterval(updateStatusDisplay, 2000);
    
    // Clean up interval when popup closes
    window.addEventListener("beforeunload", () => {
        clearInterval(statusInterval);
    });
});

// Add click handlers for status items to refresh specific data
activeTabs.addEventListener("click", () => {
    updateStatusDisplay();
});

contentScripts.addEventListener("click", () => {
    updateStatusDisplay();
});

cacheStatus.addEventListener("click", () => {
    updateStatusDisplay();
});
