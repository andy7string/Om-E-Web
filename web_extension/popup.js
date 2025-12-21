// Get DOM elements
const wsUrlInput = document.getElementById("wsUrl");
const saveButton = document.getElementById("saveBtn");
const statusDiv = document.getElementById("status");
const extPageBtn = document.getElementById("extPageBtn");
const hudToggleBtn = document.getElementById("hudToggleBtn");

// Orb Style Buttons
const orbKawaiiBtn = document.getElementById("orbKawaii");
const orbRobotBtn = document.getElementById("orbRobot");
const orbAtomBtn = document.getElementById("orbAtom");
const orbButtons = [orbKawaiiBtn, orbRobotBtn, orbAtomBtn];

// Scan Mode Buttons
const scanModeDomBtn = document.getElementById("scanModeDom");
const scanModeAtBtn = document.getElementById("scanModeAt");
const scanModeButtons = [scanModeDomBtn, scanModeAtBtn];

// Status display elements
const connectionStatus = document.getElementById("connectionStatus");
const activeTabs = document.getElementById("activeTabs");
const contentScripts = document.getElementById("contentScripts");
const cacheStatus = document.getElementById("cacheStatus");
const domChanges = document.getElementById("domChanges");
const recentChanges = document.getElementById("recentChanges");

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

// Handle extension settings button click - opens chrome://extensions
extPageBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions" });
});

// Handle HUD toggle button click - toggles the HUD overlay on active tab
hudToggleBtn.addEventListener("click", async () => {
    try {
        // Get the active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) {
            showStatus("No active tab found", "error");
            return;
        }

        // Send toggle_hud message to the content script
        chrome.tabs.sendMessage(activeTab.id, { type: "toggle_hud" }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus("Could not toggle HUD - reload the page", "error");
                return;
            }
            if (response && response.ok) {
                showStatus(response.visible ? "HUD visible" : "HUD hidden", "success");
            }
        });
    } catch (error) {
        showStatus("Error toggling HUD: " + error.message, "error");
    }
});

// Orb Theme Selection Handlers

/**
 * Set active orb theme button styling
 * @param {string} themeName - Theme key ('kawaii', 'robot', or 'atom')
 */
function setActiveOrbButton(themeName) {
    orbButtons.forEach(btn => {
        if (btn.dataset.theme === themeName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Handle orb theme button click
 * @param {string} themeName - Theme key to set
 */
async function handleOrbThemeClick(themeName) {
    try {
        showStatus(`Switching to ${themeName} style...`, "info");

        // Send message to service worker to change theme
        const response = await chrome.runtime.sendMessage({
            type: "set_orb_theme",
            theme: themeName
        });

        if (response && response.ok) {
            setActiveOrbButton(themeName);
            showStatus(`Orb style changed to ${themeName}!`, "success");
        } else {
            showStatus("Failed to change orb style", "error");
        }
    } catch (error) {
        showStatus("Error changing orb style: " + error.message, "error");
    }
}

// Attach click handlers to orb buttons
orbButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        handleOrbThemeClick(btn.dataset.theme);
    });
});

// ============================================================================
// 🌳 SCAN MODE SELECTION
// ============================================================================

/**
 * Set active scan mode button styling
 * @param {string} mode - 'dom' or 'at'
 */
function setActiveScanModeButton(mode) {
    scanModeButtons.forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Handle scan mode button click
 * @param {string} mode - 'dom' or 'at'
 */
async function handleScanModeClick(mode) {
    try {
        const modeLabel = mode === 'at' ? 'Accessibility Tree' : 'DOM TreeWalker';
        showStatus(`Switching to ${modeLabel}...`, "info");

        // Send message to service worker to change scan mode
        const response = await chrome.runtime.sendMessage({
            type: "set_scan_mode",
            mode: mode
        });

        if (response && response.ok) {
            setActiveScanModeButton(mode);

            // Persist to storage
            await chrome.storage.local.set({ omeScanMode: mode });

            showStatus(`Scan mode: ${modeLabel}`, "success");
        } else {
            showStatus(response?.error || "Failed to change scan mode", "error");
        }
    } catch (error) {
        showStatus("Error changing scan mode: " + error.message, "error");
    }
}

// Attach click handlers to scan mode buttons
scanModeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        handleScanModeClick(btn.dataset.mode);
    });
});

/**
 * Load current scan mode from service worker and update button state
 */
async function loadCurrentScanMode() {
    try {
        const response = await chrome.runtime.sendMessage({ type: "get_scan_mode" });
        if (response && response.ok && response.scanMode) {
            setActiveScanModeButton(response.scanMode);
        } else {
            // Default to dom if not set
            setActiveScanModeButton('dom');
        }
    } catch (error) {
        console.error("Error loading scan mode:", error);
        setActiveScanModeButton('dom');
    }
}

/**
 * Load current orb theme from service worker and update button state
 */
async function loadCurrentOrbTheme() {
    try {
        const response = await chrome.runtime.sendMessage({ type: "get_orb_state" });
        if (response && response.ok && response.theme) {
            setActiveOrbButton(response.theme);
        } else {
            // Default to robot if not set
            setActiveOrbButton('robot');
        }
    } catch (error) {
        console.error("Error loading orb theme:", error);
        setActiveOrbButton('robot');
    }
}

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

            // Update connection status with proper dark theme colors
            connectionStatus.textContent = status.isConnected ? "Connected" : "Disconnected";
            connectionStatus.className = "value " + (status.isConnected ? "connected" : "error");

            // Update content scripts status
            const freshScripts = status.tabsWithFreshScripts || 0;
            const totalTabs = status.totalTabs || 0;
            contentScripts.textContent = `${freshScripts}/${totalTabs}`;

            // Update cache status
            const tabsNeedingScan = status.tabsNeedingFreshScan || 0;
            cacheStatus.textContent = tabsNeedingScan > 0 ? `${tabsNeedingScan} need scan` : "All fresh";
            cacheStatus.className = "value " + (tabsNeedingScan > 0 ? "warning" : "connected");

            // Update DOM change status
            const totalDomChanges = status.totalDomChanges || 0;
            const recentDomChanges = status.recentDomChanges || 0;
            domChanges.textContent = `${totalDomChanges} total, ${recentDomChanges} recent`;
            domChanges.className = "value " + (totalDomChanges > 0 ? "warning" : "");

            // Update recent changes
            recentChanges.textContent = status.recentChanges || "No recent changes";
        } else {
            // Fallback status display
            connectionStatus.textContent = "Unknown";
            contentScripts.textContent = "-";
            cacheStatus.textContent = "-";
            domChanges.textContent = "-";
            recentChanges.textContent = "-";
        }

    } catch (error) {
        console.error("Error updating status display:", error);
        // Set fallback values
        connectionStatus.textContent = "Error";
        activeTabs.textContent = "-";
        contentScripts.textContent = "-";
        cacheStatus.textContent = "-";
        domChanges.textContent = "-";
        recentChanges.textContent = "-";
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
    loadCurrentOrbTheme();
    loadCurrentScanMode();

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
