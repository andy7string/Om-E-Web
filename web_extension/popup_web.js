/**
 * 🌐 Web-Compatible Popup Controller
 *
 * Replaces Chrome extension APIs with WebSocket communication to ws_server.py.
 * Provides full sync with extension popup via broadcast messages.
 *
 * Message Types (sent to server):
 * - setWsUrl: Update WebSocket URL
 * - toggle_hud: Toggle HUD overlay on active tab
 * - set_orb_theme: Change orb visual theme
 * - get_orb_state: Request current orb theme
 * - getStatus: Request extension connection status
 *
 * Broadcast Messages (received from server):
 * - state_update: Sync state changes from other clients
 * - orb_theme_changed: Theme was changed by another client
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 🔌 WEBSOCKET CONNECTION
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {WebSocket|null} */
let ws = null;

/** @type {boolean} */
let isConnected = false;

/** @type {Object<string, Function>} Pending request callbacks keyed by request ID */
const pendingRequests = {};

/** @type {number} Request ID counter */
let requestIdCounter = 0;

/**
 * Connect to WebSocket server
 * @param {string} url - WebSocket URL (default: ws://127.0.0.1:17892)
 */
function connectWebSocket(url = 'ws://127.0.0.1:17892') {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }

    ws = new WebSocket(url);

    ws.onopen = () => {
        console.log('🔌 WebSocket connected to server');
        isConnected = true;
        // Identify as web dashboard client
        ws.send(JSON.stringify({ type: 'identify', client: 'web_dashboard' }));
        // Initial state fetch
        updateStatusDisplay();
        loadCurrentOrbTheme();
        loadCurrentScanMode();
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleServerMessage(msg);
        } catch (e) {
            console.error('Failed to parse server message:', e);
        }
    };

    ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        isConnected = false;
        updateConnectionUI(false);
        // Reconnect after 3 seconds
        setTimeout(() => connectWebSocket(url), 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnected = false;
    };
}

/**
 * Handle incoming server messages
 * @param {Object} msg - Parsed message from server
 */
function handleServerMessage(msg) {
    // Check if this is a response to a pending request
    if (msg._requestId && pendingRequests[msg._requestId]) {
        pendingRequests[msg._requestId](msg);
        delete pendingRequests[msg._requestId];
        return;
    }

    // Handle broadcast messages for sync
    switch (msg.type) {
        case 'orb_theme_changed':
            // Another client changed the theme - update our UI
            console.log('🎨 Theme sync:', msg.theme);
            setActiveOrbButton(msg.theme);
            break;

        case 'scan_mode_changed':
            // Another client changed the scan mode - update our UI
            console.log('🌳 Scan mode sync:', msg.mode);
            setActiveScanModeButton(msg.mode);
            break;

        case 'hud_toggled':
            // HUD was toggled by another client
            console.log('🎛️ HUD sync:', msg.visible ? 'visible' : 'hidden');
            showStatus(msg.visible ? 'HUD visible' : 'HUD hidden', 'info');
            break;

        case 'extension_status':
            // Extension connection status broadcast
            updateStatusFromData(msg.status);
            break;

        case 'state_update':
            // Generic state update broadcast
            if (msg.orbTheme) setActiveOrbButton(msg.orbTheme);
            if (msg.scanMode) setActiveScanModeButton(msg.scanMode);
            if (msg.status) updateStatusFromData(msg.status);
            break;

        default:
            // Ignore unknown message types
            break;
    }
}

/**
 * Send message to server and wait for response
 * @param {Object} message - Message to send
 * @param {number} timeout - Timeout in ms (default 5000)
 * @returns {Promise<Object>} Server response
 */
function sendMessage(message, timeout = 5000) {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket not connected'));
            return;
        }

        const requestId = `req_${++requestIdCounter}_${Date.now()}`;
        message._requestId = requestId;

        const timer = setTimeout(() => {
            delete pendingRequests[requestId];
            reject(new Error('Request timeout'));
        }, timeout);

        pendingRequests[requestId] = (response) => {
            clearTimeout(timer);
            resolve(response);
        };

        ws.send(JSON.stringify(message));
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎛️ DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const wsUrlInput = document.getElementById('wsUrl');
const saveButton = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');
const extPageBtn = document.getElementById('extPageBtn');
const hudToggleBtn = document.getElementById('hudToggleBtn');

// Orb Style Buttons
const orbKawaiiBtn = document.getElementById('orbKawaii');
const orbRobotBtn = document.getElementById('orbRobot');
const orbAtomBtn = document.getElementById('orbAtom');
const orbButtons = [orbKawaiiBtn, orbRobotBtn, orbAtomBtn];

// Scan Mode Buttons
const scanModeDomBtn = document.getElementById('scanModeDom');
const scanModeAtBtn = document.getElementById('scanModeAt');
const scanModeButtons = [scanModeDomBtn, scanModeAtBtn];

// Status display elements
const connectionStatus = document.getElementById('connectionStatus');
const activeTabs = document.getElementById('activeTabs');
const contentScripts = document.getElementById('contentScripts');
const cacheStatus = document.getElementById('cacheStatus');
const domChanges = document.getElementById('domChanges');
const recentChanges = document.getElementById('recentChanges');

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 UI FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update connection status UI
 * @param {boolean} connected - Connection state
 */
function updateConnectionUI(connected) {
    if (connectionStatus) {
        connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
        connectionStatus.className = 'value ' + (connected ? 'connected' : 'error');
    }
}

/**
 * Show status message with styling
 * @param {string} message - Message to display
 * @param {string} type - Status type: 'success', 'error', 'info'
 */
function showStatus(message, type = 'success') {
    if (!statusDiv) return;
    statusDiv.textContent = message;
    statusDiv.className = type;

    // Clear status after 5 seconds
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = '';
    }, 5000);
}

/**
 * Set active orb theme button styling
 * @param {string} themeName - Theme key ('kawaii', 'robot', or 'atom')
 */
function setActiveOrbButton(themeName) {
    orbButtons.forEach(btn => {
        if (btn && btn.dataset.theme === themeName) {
            btn.classList.add('active');
        } else if (btn) {
            btn.classList.remove('active');
        }
    });
}

/**
 * Set active scan mode button styling
 * @param {string} mode - 'dom' or 'at'
 */
function setActiveScanModeButton(mode) {
    scanModeButtons.forEach(btn => {
        if (btn && btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else if (btn) {
            btn.classList.remove('active');
        }
    });
}

/**
 * Update status display from data object
 * @param {Object} status - Status data from server
 */
function updateStatusFromData(status) {
    if (!status) return;

    // Update connection status
    if (connectionStatus) {
        connectionStatus.textContent = status.isConnected ? 'Connected' : 'Disconnected';
        connectionStatus.className = 'value ' + (status.isConnected ? 'connected' : 'error');
    }

    // Update content scripts status
    if (contentScripts) {
        const freshScripts = status.tabsWithFreshScripts || 0;
        const totalTabs = status.totalTabs || 0;
        contentScripts.textContent = `${freshScripts}/${totalTabs}`;
    }

    // Update cache status
    if (cacheStatus) {
        const tabsNeedingScan = status.tabsNeedingFreshScan || 0;
        cacheStatus.textContent = tabsNeedingScan > 0 ? `${tabsNeedingScan} need scan` : 'All fresh';
        cacheStatus.className = 'value ' + (tabsNeedingScan > 0 ? 'warning' : 'connected');
    }

    // Update DOM change status
    if (domChanges) {
        const totalDomChanges = status.totalDomChanges || 0;
        const recentDomChangesCount = status.recentDomChanges || 0;
        domChanges.textContent = `${totalDomChanges} total, ${recentDomChangesCount} recent`;
        domChanges.className = 'value ' + (totalDomChanges > 0 ? 'warning' : '');
    }

    // Update recent changes
    if (recentChanges) {
        recentChanges.textContent = status.recentChanges || 'No recent changes';
    }

    // Update active tabs
    if (activeTabs && status.totalTabs !== undefined) {
        activeTabs.textContent = status.totalTabs;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📡 SERVER COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update status display by fetching from server
 */
async function updateStatusDisplay() {
    try {
        const response = await sendMessage({ type: 'getStatus' });
        if (response && response.ok) {
            updateStatusFromData(response.result);
        } else {
            // Fallback status display
            updateConnectionUI(isConnected);
        }
    } catch (error) {
        console.error('Error updating status display:', error);
        updateConnectionUI(false);
    }
}

/**
 * Load current orb theme from server and update button state
 */
async function loadCurrentOrbTheme() {
    try {
        const response = await sendMessage({ type: 'get_orb_state' });
        if (response && response.ok && response.theme) {
            setActiveOrbButton(response.theme);
        } else {
            // Default to robot if not set
            setActiveOrbButton('robot');
        }
    } catch (error) {
        console.error('Error loading orb theme:', error);
        setActiveOrbButton('robot');
    }
}

/**
 * Load current scan mode from server and update button state
 */
async function loadCurrentScanMode() {
    try {
        const response = await sendMessage({ type: 'get_scan_mode' });
        if (response && response.ok && response.scanMode) {
            setActiveScanModeButton(response.scanMode);
        } else {
            // Default to dom if not set
            setActiveScanModeButton('dom');
        }
    } catch (error) {
        console.error('Error loading scan mode:', error);
        setActiveScanModeButton('dom');
    }
}

/**
 * Handle orb theme button click
 * @param {string} themeName - Theme key to set
 */
async function handleOrbThemeClick(themeName) {
    try {
        showStatus(`Switching to ${themeName} style...`, 'info');

        const response = await sendMessage({
            type: 'set_orb_theme',
            theme: themeName
        });

        if (response && response.ok) {
            setActiveOrbButton(themeName);
            showStatus(`Orb style changed to ${themeName}!`, 'success');
        } else {
            showStatus('Failed to change orb style', 'error');
        }
    } catch (error) {
        showStatus('Error changing orb style: ' + error.message, 'error');
    }
}

/**
 * Handle scan mode button click
 * @param {string} mode - 'dom' or 'at'
 */
async function handleScanModeClick(mode) {
    try {
        const modeLabel = mode === 'at' ? 'Accessibility Tree' : 'DOM TreeWalker';
        showStatus(`Switching to ${modeLabel}...`, 'info');

        const response = await sendMessage({
            type: 'set_scan_mode',
            mode: mode
        });

        if (response && response.ok) {
            setActiveScanModeButton(mode);
            showStatus(`Scan mode: ${modeLabel}`, 'success');
        } else {
            showStatus(response?.error || 'Failed to change scan mode', 'error');
        }
    } catch (error) {
        showStatus('Error changing scan mode: ' + error.message, 'error');
    }
}

/**
 * Handle HUD toggle button click
 */
async function handleHudToggle() {
    try {
        const response = await sendMessage({ type: 'toggle_hud' });
        if (response && response.ok) {
            showStatus(response.visible ? 'HUD visible' : 'HUD toggled', 'success');
        } else {
            showStatus('Could not toggle HUD - check extension', 'error');
        }
    } catch (error) {
        showStatus('Error toggling HUD: ' + error.message, 'error');
    }
}

/**
 * Handle save & reconnect button click
 */
async function handleSaveWsUrl() {
    const url = wsUrlInput.value.trim();

    if (!url) {
        showStatus('Please enter a WebSocket URL', 'error');
        return;
    }

    // Validate WebSocket URL format
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        showStatus('Invalid WebSocket URL format', 'error');
        return;
    }

    try {
        // Save to localStorage for persistence
        localStorage.setItem('ome_ws_url', url);

        // Send to server to update extension
        const response = await sendMessage({ type: 'setWsUrl', url });
        if (response && response.ok) {
            showStatus('WebSocket URL saved and reconnecting...', 'success');
        } else {
            showStatus('Failed to save WebSocket URL', 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🚀 INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Load saved WebSocket URL from localStorage
    const savedUrl = localStorage.getItem('ome_ws_url');
    if (savedUrl && wsUrlInput) {
        wsUrlInput.value = savedUrl;
    }

    // Connect to WebSocket server
    connectWebSocket();

    // Attach event handlers
    if (saveButton) {
        saveButton.addEventListener('click', handleSaveWsUrl);
    }

    if (hudToggleBtn) {
        hudToggleBtn.addEventListener('click', handleHudToggle);
    }

    if (extPageBtn) {
        // In web context, open extension docs or disable
        extPageBtn.addEventListener('click', () => {
            showStatus('Extension settings only available in Chrome extension popup', 'info');
        });
    }

    // Attach orb button handlers
    orbButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                handleOrbThemeClick(btn.dataset.theme);
            });
        }
    });

    // Attach scan mode button handlers
    scanModeButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                handleScanModeClick(btn.dataset.mode);
            });
        }
    });

    // Enter key support for input field
    if (wsUrlInput) {
        wsUrlInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                handleSaveWsUrl();
            }
        });
    }

    // Update status periodically
    setInterval(updateStatusDisplay, 2000);
});
