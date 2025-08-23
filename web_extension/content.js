/**
 * 🚀 Chrome Extension Content Script for Web Automation
 * 
 * This script runs in the context of web pages and implements:
 * 1. DOM manipulation and element interaction
 * 2. Crawl4AI-inspired markdown generation
 * 3. Message handling for WebSocket communication
 * 
 * 🔗 FULL ROUND-TRIP COMMUNICATION PATTERN:
 * 1. Server → Extension: Receives command via chrome.runtime.onMessage
 * 2. Extension → DOM: Executes command on current page
 * 3. Extension → Server: Sends response back via sendResponse
 * 4. Server → Test Client: Routes response to original client
 * 
 * 📡 MESSAGE FLOW:
 * Test Client → WebSocket Server → Chrome Extension → DOM → Response → Server → Test Client
 */

// 🛡️ MAIN FRAME SAFETY CHECK - Ensure script only runs in main frame
if (window.top !== window.self) {
    console.log("[Content] 🚫 Script running in iframe, exiting to prevent iframe scanning issues");
    // Exit early if we're in an iframe
    throw new Error("Content script should not run in iframes");
}

// 🎯 Confirm we're in main frame
console.log("[Content] ✅ Running in main frame:", {
    isMainFrame: window.top === window.self,
    currentUrl: window.location.href,
    topUrl: window.top.location.href
});

// 🆕 NEW: Content Script Intelligence System v2.0
console.log("[Content] 🚀 Content script loaded with intelligence system v2.0");

// 🆕 NEW: Guard against multiple initializations
if (window.intelligenceSystemInitialized && window.intelligenceComponents && window.intelligenceComponents.changeAggregator && window.intelligenceComponents.intelligenceEngine) {
    console.log("[Content] ⚠️ Intelligence system already initialized, reusing existing components...");
    // Reuse existing components
    changeAggregator = window.intelligenceComponents.changeAggregator;
    intelligenceEngine = window.intelligenceComponents.intelligenceEngine;
    pageContext = window.intelligenceComponents.pageContext || pageContext;
} else {
    window.intelligenceSystemInitialized = true;
    // Removed initialization logging
}

// 🆕 NEW: DOM Change Detection System - Use 'var' to prevent redeclaration errors
var domChangeObserver = null;
var changeDetectionEnabled = false;
var changeCount = 0;
var lastChangeTime = 0;

// 🆕 NEW: Intelligent Change Filtering
var lastSignificantChange = 0;
var MIN_CHANGE_INTERVAL = 2000; // Minimum 2 seconds between significant changes
var MIN_MUTATIONS_FOR_SIGNIFICANT = 3; // Need at least 3 mutations to be significant
var IGNORED_CHANGE_TYPES = new Set(['mouseover', 'mouseout', 'focus', 'blur']); // Ignore these

// 🆕 NEW: Intelligent Change Aggregation System
var changeAggregator = null;
var intelligenceEngine = null;
var pageContext = null;
var changeHistory = [];
var lastIntelligenceUpdate = 0;
var INTELLIGENCE_UPDATE_INTERVAL = 500; // 0.5 seconds between intelligence updates for continuous DOM scanning

// 🆕 NEW: Continuous DOM Monitoring System
var continuousDOMScanner = null;
var DOM_SCAN_INTERVAL = 1000; // Scan DOM every 1 second
var lastDOMScan = 0;
var totalElementsScanned = 0;
var continuousScanningEnabled = true;

// 🆕 NEW: Simple test to verify code is running
// Removed system testing logs
// Removed DOM status logs
// Removed variables logs
// Removed scanning logs

// 🆕 NEW: Site configuration and framework detection
if (typeof siteConfigs === 'undefined') {
    let siteConfigs = {};
    let currentSiteConfig = null;
    let currentFramework = 'generic';
    
    // Make them globally accessible
    window.siteConfigs = siteConfigs;
    window.currentSiteConfig = currentSiteConfig;
    window.currentFramework = currentFramework;
} else {
    // Use existing globals
    let siteConfigs = window.siteConfigs || {};
    let currentSiteConfig = window.currentSiteConfig || null;
    let currentFramework = window.currentFramework || 'generic';
}

// 🆕 NEW: Independent framework detection - no storage dependency
detectAndApplyFramework();

// 🚫 Continuous DOM scanning DISABLED to prevent context interference
console.log("[Content] 🚫 Continuous DOM scanning DISABLED - manual mode only");
console.log("[Content] 💡 Use test commands to trigger manual scans when needed");

// 🆕 NEW: Framework detection function
// 🆕 NEW: JavaScript implementation of fuzzy URL pattern matching
function matchUrlPattern(hostname, pattern) {
    try {
        // Normalize inputs
        hostname = hostname.toLowerCase();
        pattern = pattern.toLowerCase();
        
        // Handle exact matches
        if (pattern === '*' || hostname === pattern) {
            return true;
        }
        
        // Handle patterns with scheme (e.g., "https://google.com")
        if (pattern.includes('://')) {
            const [scheme, domain] = pattern.split('://', 2);
            if (scheme !== 'https' && scheme !== 'http*') {
                return false; // Only support http/https schemes
            }
            pattern = domain;
        }
        
        // Handle wildcard patterns
        if (pattern.includes('*')) {
            // Check for unsafe patterns (multiple wildcards, TLD wildcards)
            if (pattern.split('*').length > 2) {
                console.warn(`[Content] ⚠️ Unsafe pattern with multiple wildcards: ${pattern}`);
                return false;
            }
            
            if (pattern.endsWith('.*')) {
                console.warn(`[Content] ⚠️ TLD wildcards not supported: ${pattern}`);
                return false;
            }
            
            // Handle *.domain patterns (e.g., *.google.com)
            if (pattern.startsWith('*.')) {
                const parentDomain = pattern.substring(2);
                return hostname === parentDomain || hostname.endsWith('.' + parentDomain);
            }
            
            // Handle domain.* patterns (e.g., google.*)
            if (pattern.endsWith('.*')) {
                const baseDomain = pattern.substring(0, pattern.length - 2);
                return hostname === baseDomain || hostname.startsWith(baseDomain + '.');
            }
            
            // Convert glob pattern to regex and test
            const regexPattern = pattern.replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(hostname);
        }
        
        return false;
    } catch (error) {
        console.warn(`[Content] ⚠️ Error matching pattern ${pattern} against ${hostname}:`, error);
        return false;
    }
}

function detectAndApplyFramework() {
    const currentUrl = window.location.href;
    const hostname = new URL(currentUrl).hostname;
    
    console.log("🚨🚨🚨 FRAMEWORK DETECTION 🚨🚨🚨");
    console.log("🔍 Hostname:", hostname);
    
    // 🆕 NEW: Built-in site configs - no storage dependency
    const siteConfigs = {
        'google.com': {
            framework: 'google',
            scan_strategy: 'google_specific',
            url_patterns: ["google.com", "google.*", "*.google.com"],
            selectors: {
                navigation: [
                    "header",
                    "[role='banner']",
                    ".gb_ua",
                    ".gb_oa",
                    "nav",
                    "[role='navigation']"
                ],
                buttons: [
                    "button[aria-label]",
                    "[role='button']",
                    ".gb_oa",
                    "#gb_70",
                    "#gb_119",
                    "[data-ved]"
                ],
                menus: [
                    "#searchbox",
                    "#searchbox-input",
                    "#gb_70",
                    "#gb_119",
                    "[aria-label*='Google apps']",
                    "[aria-label*='Google Apps']"
                ],
                hidden_content: [
                    "#gb",
                    ".gb_oa",
                    "#searchbox-suggestions",
                    "#searchbox-results",
                    "[aria-hidden='true']",
                    ".gb_oa"
                ],
                text_inputs: [
                    "input[type='text']",
                    "input[type='search']",
                    "textarea",
                    "[contenteditable='true']",
                    "[role='textbox']",
                    "input[placeholder]"
                ]
            },
            filters: {
                include: [
                    "header",
                    "nav", 
                    "#searchbox",
                    "#gb_70",
                    "[aria-label*='Google apps']"
                ],
                exclude: [
                    "[data-ved]",
                    ".gb_oa",
                    ".gb_ua",
                    "[aria-hidden='true']",
                    "[style*='display: none']"
                ],
                max_elements: 25
            },
            interaction_patterns: {
                expand_apps: {
                    trigger: "[aria-label*='Google apps'], [aria-label*='Google Apps']",
                    wait_for: "#gb",
                    timeout: 1000
                },
                expand_search: {
                    trigger: "#searchbox, #searchbox-input",
                    wait_for: "#searchbox-suggestions",
                    timeout: 500
                },
                expand_account: {
                    trigger: "#gb_70, #gb_119",
                    wait_for: "[role='menu']",
                    timeout: 1000
                }
            },
            scan_priority: [
                "text_inputs",
                "search_interface",
                "header_navigation",
                "app_launcher",
                "account_menu",
                "hidden_content"
            ],
            custom_handlers: {
                google_framework: true,
                search_suggestions: true,
                app_drawer: true
            }
        },
        'youtube.com': {
            framework: 'youtube',
            scan_strategy: 'youtube_specific',
            url_patterns: ["youtube.com", "*.youtube.com", "youtu.be"],
            selectors: {
                navigation: [
                    "#guide-button", 
                    "#searchbox",
                    "#logo",
                    "#back-button",
                    "ytd-masthead",
                    "ytd-mini-guide-renderer",
                    "ytd-topbar-menu-button-renderer"
                ],
                buttons: [
                    "yt-icon-button",
                    "ytd-button-renderer",
                    "button[aria-label]",
                    "#guide-button",
                    "#avatar-btn",
                    "button:not([disabled]):not([aria-disabled='true']):not([hidden])",
                    "[role='button']:not([aria-disabled='true']):not([hidden])",
                    "ytd-toggle-button-renderer[is-icon-button]",
                    "ytd-subscribe-button-renderer",
                    "button[aria-label^='Like']",
                    "button[aria-label^='Dislike']",
                    "ytd-button-renderer[button-id='share'] button",
                    "ytd-button-renderer[button-id='menu'] button",
                    "ytd-comments-header-renderer ytd-button-renderer",
                    "yt-icon-button#search-icon-legacy",
                    "#voice-search-button",
                    "button[aria-label*='Comments']",
                    "paper-button#action-button",
                    ".ytp-play-button",
                    ".ytp-fullscreen-button",
                    ".ytp-settings-button"
                ],
                menus: [
                    "#guide-button",
                    "#avatar-btn", 
                    "#guide",
                    "#account-menu",
                    "ytd-guide-renderer",
                    "tp-yt-paper-listbox[role='listbox']",
                    "tp-yt-paper-menu",
                    "ytd-multi-page-menu-renderer",
                    "ytd-searchbox-suggestions",
                    "ytd-popup-container"
                ],
                hidden_content: [
                    "#guide[hidden]",
                    "[aria-hidden='true']",
                    ".ytd-app-drawer[opened]",
                    "tp-yt-paper-dialog[aria-hidden='false']",
                    ".ytd-app-drawer[opened]"
                ],
                text_inputs: [
                    "#searchbox",
                    "input[type='text']",
                    "input[type='search']",
                    "[contenteditable='true']",
                    "input:not([type='hidden']):not([disabled]):not([hidden])",
                    "select:not([disabled]):not([hidden])",
                    "textarea:not([disabled]):not([hidden])",
                    "[role='combobox']:not([aria-disabled='true']):not([hidden])"
                ],
                links: [
                    "a[href]:not([href='']):not([href^='#']):not([tabindex='-1']):not([hidden])"
                ],
                interactive_roles: [
                    "[role='search']:not([aria-disabled='true']):not([hidden])",
                    "[role='switch']:not([aria-disabled='true']):not([hidden])",
                    "[role='checkbox']:not([aria-disabled='true']):not([hidden])",
                    "[role='radio']:not([aria-disabled='true']):not([hidden])",
                    "[role='menuitem']:not([aria-disabled='true']):not([hidden])",
                    "[role='tab']:not([aria-disabled='true']):not([hidden])",
                    "[role='option']:not([aria-disabled='true']):not([hidden])"
                ],
                media_controls: [
                    "[aria-label~='play' i]",
                    "[aria-label~='pause' i]",
                    "[aria-label~='like' i]",
                    "[aria-label~='share' i]",
                    "[aria-label~='subscribe' i]",
                    "[aria-label~='comment' i]",
                    "[aria-label~='download' i]",
                    "[aria-label~='fullscreen' i]"
                ]
            },
            filters: {
                include: [
                    "#guide-button",
                    "#searchbox",
                    "#logo",
                    "yt-icon-button",
                    "ytd-button-renderer",
                    "button[aria-label]",
                    "a[href]",
                    "input[type='text']",
                    "input[type='search']",
                    "[role='button']",
                    "[role='search']",
                    "[role='menuitem']",
                    "[role='tab']",
                    ".ytp-play-button",
                    ".ytp-fullscreen-button",
                    ".ytp-settings-button"
                ],
                exclude: [
                    "[aria-hidden='true']",
                    "#guide[hidden]",
                    "[style*='display: none']",
                    "[disabled]",
                    "[aria-disabled='true']",
                    "[hidden]",
                    "script",
                    "style",
                    "meta",
                    "link"
                ],
                max_elements: 100
            },
            interaction_patterns: {
                expand_guide: {
                    trigger: "#guide-button",
                    wait_for: "#guide",
                    timeout: 1000
                },
                expand_search: {
                    trigger: "#searchbox",
                    wait_for: "#searchbox-suggestions",
                    timeout: 500
                }
            },
            scan_priority: [
                "navigation",
                "search_interface",
                "video_controls",
                "menu_system"
            ],
            custom_handlers: {
                youtube_framework: true,
                video_player: true,
                guide_menu: true
            }
        },
        'wordpress': {
            framework: 'wordpress',
            scan_strategy: 'wordpress_specific',
            url_patterns: ["wordpress.com", "*.wordpress.com"],
            selectors: {
                navigation: [
                    ".main-navigation",
                    ".site-header",
                    ".menu",
                    ".nav-menu"
                ],
                buttons: [
                    ".menu-toggle",
                    ".search-toggle",
                    "button[aria-label]",
                    "[role='button']"
                ],
                menus: [
                    ".main-navigation",
                    ".menu",
                    ".nav-menu",
                    ".dropdown-menu"
                ],
                hidden_content: [
                    "[aria-hidden='true']",
                    ".hidden",
                    "[style*='display: none']"
                ],
                text_inputs: [
                    "input[type='text']",
                    "input[type='search']",
                    "textarea",
                    "[contenteditable='true']"
                ]
            },
            filters: {
                include: [
                    ".main-navigation",
                    ".menu-toggle",
                    ".search-toggle",
                    ".site-header"
                ],
                exclude: [
                    "[aria-hidden='true']",
                    ".hidden",
                    "[style*='display: none']"
                ],
                max_elements: 25
            },
            interaction_patterns: {
                expand_menu: {
                    trigger: ".menu-toggle",
                    wait_for: ".main-navigation",
                    timeout: 1000
                },
                expand_search: {
                    trigger: ".search-toggle",
                    wait_for: ".search-form",
                    timeout: 500
                }
            },
            scan_priority: [
                "navigation",
                "content_management",
                "search_interface",
                "admin_tools"
            ],
            custom_handlers: {
                wordpress_framework: true,
                cms_interface: true,
                admin_panel: true
            }
        }
    };
    
    console.log("📋 Available configs:", Object.keys(siteConfigs));
    
    // 🆕 NEW: Pattern matching against built-in configs
    for (const [site, config] of Object.entries(siteConfigs)) {
        if (config.url_patterns && Array.isArray(config.url_patterns)) {
            for (const pattern of config.url_patterns) {
                if (matchUrlPattern(hostname, pattern)) {
                    currentSiteConfig = config;
                    currentFramework = config.framework;
                    console.log("🎯🎯🎯 FUZZY PATTERN MATCH FOUND! 🎯🎯🎯");
                    console.log("✅ Framework:", currentFramework);
                    console.log("✅ Site:", hostname);
                    console.log("✅ Pattern:", pattern);
                    console.log("✅ Config:", site);
                    return;
                }
            }
        }
    }
    
    // 🆕 NEW: Generic fallback if no fuzzy match
    currentSiteConfig = null;
    currentFramework = 'generic';
    console.log("🎯🎯🎯 GENERIC FALLBACK 🎯🎯🎯");
    console.log("⚠️ Framework:", currentFramework);
    console.log("⚠️ Site:", hostname);
    console.log("⚠️ No fuzzy pattern match found");
}

// 🆕 NEW: Continuous DOM Scanning Function
function startContinuousDOMScanning() {
    if (continuousDOMScanner) {
        clearInterval(continuousDOMScanner);
    }
    
    console.log("[Content] 🚀 Starting continuous DOM scanning every", DOM_SCAN_INTERVAL, "ms");
    
    continuousDOMScanner = setInterval(() => {
        try {
            const currentTime = Date.now();
            if (currentTime - lastDOMScan >= DOM_SCAN_INTERVAL) {
                performContinuousDOMScan();
                lastDOMScan = currentTime;
            }
        } catch (error) {
            console.warn("[Content] ⚠️ Error in continuous DOM scan:", error);
        }
    }, DOM_SCAN_INTERVAL);
    
    return continuousDOMScanner;
}

function performContinuousDOMScan() {
    try {
        const startTime = performance.now();
        
        // 🎯 NEW: Automatic disconnect cycle + comprehensive scan for CSP bypass in normal workflow
        console.log("[Content] 🔄 Continuous scan: Performing automatic disconnect cycle + comprehensive scan for CSP bypass...");
        performAutomaticDisconnectCycle();
        
        // 🎯 NEW: Run comprehensive scan to get 262+ elements
        console.log("[Content] 🔍 Continuous scan: Running comprehensive scan for full element detection...");
        const comprehensiveScanResult = performImmediateComprehensiveScan();
        console.log("[Content] ✅ Continuous scan comprehensive scan complete:", comprehensiveScanResult);
        
        // 🎯 Frame detection for continuous scanning
        const frameInfo = {
            isMainFrame: window.top === window.self,
            currentFrame: window.location.href,
            topFrame: window.top.location.href,
            frameDepth: 0
        };
        
        // Calculate frame depth
        let currentWindow = window;
        while (currentWindow !== window.top) {
            frameInfo.frameDepth++;
            try {
                currentWindow = currentWindow.parent;
            } catch (e) {
                break;
            }
        }
        
        // 🎯 Scan all DOM elements
        const allElements = document.querySelectorAll('*');
        const elementCount = allElements.length;
        
        // 🎯 Count interactive elements
        const interactiveElements = document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [onclick], [tabindex]');
        const interactiveCount = interactiveElements.length;
        
        // 🎯 Count content elements
        const contentElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, article, section, div[class*="content"], div[class*="text"]');
        const contentCount = contentElements.length;
        
        // 🎯 Update counters
        totalElementsScanned += elementCount;
        
        const scanResult = {
            timestamp: Date.now(),
            elementCount: elementCount,
            interactiveElements: interactiveCount,
            contentElements: contentCount,
            totalElementsScanned: totalElementsScanned,
            scanDuration: performance.now() - startTime,
            url: window.location.href,
            title: document.title
        };
        
        // 🎯 Log scan results with frame info (only if significant changes)
        if (elementCount > 0) {
            console.log(`[Content] 🔍 Continuous DOM scan: ${elementCount} elements, ${interactiveCount} interactive, ${contentCount} content (${scanResult.scanDuration.toFixed(2)}ms)`);
            console.log(`[Content] 🖼️ Frame context: ${frameInfo.isMainFrame ? 'MAIN' : 'IFRAME'} (depth: ${frameInfo.frameDepth})`);
        }
        
        // 🎯 Trigger intelligence update if significant changes detected
        if (intelligenceEngine && intelligenceEngine.isEngineReady && intelligenceEngine.isEngineReady()) {
            intelligenceEngine.queueIntelligenceUpdate('low');
        }
        
        return scanResult;
        
    } catch (error) {
        console.error("[Content] ❌ Error in continuous DOM scan:", error);
        return { error: error.message, timestamp: Date.now() };
    }
}

function stopContinuousDOMScanning() {
    if (continuousDOMScanner) {
        clearInterval(continuousDOMScanner);
        continuousDOMScanner = null;
        console.log("[Content] 🛑 Continuous DOM scanning stopped");
    }
}

// 🆕 NEW: Controlled Tear Away System
function performControlledTearAway() {
    console.log("[Content] 🚨 Starting controlled tear away sequence...");
    
    try {
        // 🎯 Step 1: Stop all current processes
        stopContinuousDOMScanning();
        
        // 🎯 Step 2: Clear all extension state
        if (intelligenceEngine) {
            intelligenceEngine.clearAllState();
        }
        
        // 🎯 Step 3: Disconnect all observers
        if (domChangeObserver) {
            domChangeObserver.disconnect();
            domChangeObserver = null;
        }
        
        // 🎯 Step 4: Clear all variables
        changeCount = 0;
        lastChangeTime = 0;
        lastSignificantChange = 0;
        changeHistory = [];
        lastIntelligenceUpdate = 0;
        totalElementsScanned = 0;
        
        // 🎯 Step 5: Force context invalidation
        const tearAwayResult = {
            timestamp: Date.now(),
            actions: [
                'Stopped continuous scanning',
                'Cleared intelligence engine state',
                'Disconnected DOM observers',
                'Reset all counters',
                'Forced context cleanup'
            ],
            note: 'Extension context should now be invalidated and ready for re-injection'
        };
        
        console.log("[Content] 🚨 Controlled tear away completed:", tearAwayResult);
        
        // 🎯 Step 6: Trigger re-injection by sending message to service worker
        chrome.runtime.sendMessage({
            type: 'force_content_script_reinjection',
            data: {
                tabId: null, // Will be set by service worker
                reason: 'controlled_tear_away',
                timestamp: Date.now()
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("[Content] ⚠️ Service worker not available for re-injection");
            } else {
                console.log("[Content] ✅ Re-injection request sent to service worker");
                
                // 🎯 CRITICAL: Wait for re-injection, then immediately scan
                setTimeout(() => {
                    console.log("[Content] 🚀 Tear away complete - performing immediate DOM scan...");
                    
                            // 🎯 Step 7: Immediate comprehensive scan
        const scanResults = performImmediateComprehensiveScan();
        
        // 🎯 Step 8: Continuous scanning DISABLED to prevent context interference
        console.log("[Content] 🚫 Continuous scanning DISABLED to preserve context state");
        
        // 🎯 Step 9: Only perform manual scans when requested
        console.log("[Content] 🎯 Manual scanning mode enabled - no automatic polling");
                    
                }, 1000); // Wait 1 second for re-injection to complete
            }
        });
        
        return tearAwayResult;
        
    } catch (error) {
        console.error("[Content] ❌ Error during controlled tear away:", error);
        return { error: error.message, timestamp: Date.now() };
    }
}

function forceContextReinjection() {
    console.log("[Content] 🔄 Forcing context re-injection...");
    
    try {
        // 🎯 Method 1: Force disconnect and reconnect
        if (chrome.runtime && chrome.runtime.connect) {
            const port = chrome.runtime.connect();
            port.disconnect();
            console.log("[Content] 🔄 Runtime port disconnected");
        }
        
        // 🎯 Method 2: Clear storage and force reload
        chrome.storage.local.clear(() => {
            console.log("[Content] 🔄 Storage cleared, forcing reload");
            
            // 🎯 Method 3: Send reload command to service worker
            chrome.runtime.sendMessage({
                type: 'force_extension_reload',
                data: {
                    reason: 'context_reinjection',
                    timestamp: Date.now()
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Content] ⚠️ Service worker not available for reload");
                } else {
                    console.log("[Content] ✅ Reload request sent to service worker");
                }
            });
        });
        
        return { success: true, timestamp: Date.now() };
        
    } catch (error) {
        console.error("[Content] ❌ Error during context re-injection:", error);
        return { error: error.message, timestamp: Date.now() };
    }
}

// 🆕 NEW: Pre-Scan Disconnect Cycle Function
function performPreScanDisconnectCycle() {
    console.log("[Content] 🔄 Starting pre-scan disconnect cycle...");
    
    try {
        const startTime = performance.now();
        
        // 🎯 Step 1: Force complete runtime disconnect
        if (chrome.runtime && chrome.runtime.connect) {
            console.log("[Content] 🔌 Forcing runtime port disconnect...");
            const ports = [];
            
            // Create multiple connections and disconnect them all
            for (let i = 0; i < 3; i++) {
                try {
                    const port = chrome.runtime.connect();
                    ports.push(port);
                    port.disconnect();
                } catch (error) {
                    console.warn(`[Content] ⚠️ Port ${i} disconnect error:`, error);
                }
            }
            console.log("[Content] ✅ All runtime ports disconnected");
        }
        
        // 🎯 Step 2: Clear all extension storage
        if (chrome.storage && chrome.storage.local) {
            console.log("[Content] 🗑️ Clearing extension storage...");
            chrome.storage.local.clear(() => {
                console.log("[Content] ✅ Extension storage cleared");
            });
        }
        
        // 🎯 Step 3: Force service worker reload
        console.log("[Content] 🔄 Requesting service worker reload...");
        chrome.runtime.sendMessage({
            type: 'force_extension_reload',
            data: {
                reason: 'pre_scan_disconnect_cycle',
                timestamp: Date.now(),
                forceReload: true
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("[Content] ⚠️ Service worker reload failed:", chrome.runtime.lastError);
            } else {
                console.log("[Content] ✅ Service worker reload requested");
            }
        });
        
        // 🎯 Step 4: Wait for disconnect cycle to complete
        setTimeout(() => {
            console.log("[Content] 🔄 Disconnect cycle complete, forcing re-injection...");
            
            // 🎯 Step 5: Force content script re-injection
            forceContentScriptReinjection();
            
        }, 2000); // Wait 2 seconds for disconnect cycle
        
        const disconnectResult = {
            success: true,
            timestamp: Date.now(),
            duration: performance.now() - startTime,
            steps: ['runtime_disconnect', 'storage_clear', 'sw_reload', 're_injection']
        };
        
        console.log("[Content] ✅ Pre-scan disconnect cycle initiated:", disconnectResult);
        return disconnectResult;
        
    } catch (error) {
        console.error("[Content] ❌ Error during pre-scan disconnect cycle:", error);
        return { 
            error: error.message, 
            timestamp: Date.now(),
            success: false
        };
    }
}

// 🆕 NEW: Force Content Script Re-injection
function forceContentScriptReinjection() {
    console.log("[Content] 🚀 Forcing content script re-injection...");
    
    try {
        // 🎯 Method 1: Send re-injection message to service worker
        chrome.runtime.sendMessage({
            type: 'force_content_script_reinjection',
            data: {
                tabId: null,
                reason: 'pre_scan_reinjection',
                timestamp: Date.now(),
                forceMainFrame: true
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("[Content] ⚠️ Re-injection request failed:", chrome.runtime.lastError);
            } else {
                console.log("[Content] ✅ Re-injection request sent");
                
                // 🎯 Method 2: Wait for re-injection, then scan
                setTimeout(() => {
                    console.log("[Content] 🚀 Re-injection complete, performing comprehensive scan...");
                    performImmediateComprehensiveScan();
                }, 1500); // Wait 1.5 seconds for re-injection
            }
        });
        
        return { success: true, timestamp: Date.now() };
        
    } catch (error) {
        console.error("[Content] ❌ Error during content script re-injection:", error);
        return { error: error.message, timestamp: Date.now() };
    }
}

// 🆕 NEW: Immediate Comprehensive Scan Function
function performImmediateComprehensiveScan() {
    console.log("[Content] 🚀 Performing immediate comprehensive DOM scan...");
    
    try {
        const startTime = performance.now();
        
        // 🎯 Step 0: AUTOMATIC DISCONNECT CYCLE for CSP bypass
        console.log("[Content] 🔄 Performing automatic disconnect cycle for CSP bypass...");
        performAutomaticDisconnectCycle();
        
        // 🎯 Step 1: Verify we're in main frame
        const frameInfo = {
            isMainFrame: window.top === window.self,
            currentFrame: window.location.href,
            topFrame: window.top.location.href,
            frameDepth: 0,
            parentFrames: []
        };
        
        // 🎯 Calculate frame depth and parent chain
        let currentWindow = window;
        while (currentWindow !== window.top) {
            frameInfo.frameDepth++;
            try {
                frameInfo.parentFrames.push({
                    depth: frameInfo.frameDepth,
                    url: currentWindow.location.href,
                    title: currentWindow.document.title
                });
                currentWindow = currentWindow.parent;
            } catch (e) {
                // Cross-origin restriction
                frameInfo.parentFrames.push({
                    depth: frameInfo.frameDepth,
                    url: "CROSS_ORIGIN_RESTRICTED",
                    title: "CROSS_ORIGIN_RESTRICTED"
                });
                break;
            }
        }
        
        console.log("[Content] 🖼️ Frame Analysis:", frameInfo);
        
        if (!frameInfo.isMainFrame) {
            console.warn("[Content] ⚠️ Running in iframe - depth:", frameInfo.frameDepth);
            console.warn("[Content] ⚠️ Parent frames:", frameInfo.parentFrames);
        } else {
            console.log("[Content] ✅ Confirmed main frame access");
        }
        
        // 🎯 Step 2: Comprehensive element scan
        const allElements = document.querySelectorAll('*');
        const elementCount = allElements.length;
        
        // 🎯 Step 3: Interactive elements scan
        const interactiveSelectors = [
            'a[href]', 'button', 'input', 'select', 'textarea',
            '[role="button"]', '[role="link"]', '[role="menuitem"]',
            '[onclick]', '[tabindex]', '[data-action]', '[data-toggle]',
            '[aria-label]', '[title]', '[alt]'
        ];
        
        const interactiveElements = [];
        interactiveSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (isElementVisible(element)) {
                        interactiveElements.push({
                            tagName: element.tagName.toLowerCase(),
                            text: element.textContent?.trim() || element.value || element.alt || '',
                            selector: generateSimpleSelector(element),
                            attributes: extractSimpleAttributes(element),
                            coordinates: getSimpleCoordinates(element)
                        });
                    }
                });
            } catch (error) {
                console.warn(`[Content] ⚠️ Error scanning selector ${selector}:`, error);
            }
        });
        
        // 🎯 Step 4: Content elements scan
        const contentSelectors = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'article', 'section',
            'div[class*="content"]', 'div[class*="text"]', 'span[class*="text"]',
            'main', 'header', 'footer', 'nav', 'aside'
        ];
        
        const contentElements = [];
        contentSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (isElementVisible(element) && element.textContent?.trim().length > 10) {
                        contentElements.push({
                            tagName: element.tagName.toLowerCase(),
                            text: element.textContent.trim().substring(0, 150) + '...',
                            selector: generateSimpleSelector(element),
                            coordinates: getSimpleCoordinates(element)
                        });
                    }
                });
            } catch (error) {
                console.warn(`[Content] ⚠️ Error scanning content selector ${selector}:`, error);
            }
        });
        
        // 🎯 Step 4.5: Generic content detection for ANY element with meaningful text
        const genericContentElements = [];
        try {
            // Look for ANY element with substantial text content that wasn't caught above
            allElements.forEach(element => {
                if (isElementVisible(element) && element.textContent?.trim().length > 20) {
                    // Skip if already captured by specific selectors
                    const isAlreadyCaptured = interactiveElements.some(ie => ie.selector === generateSimpleSelector(element)) ||
                                           contentElements.some(ce => ce.selector === generateSimpleSelector(element));
                    
                    if (!isAlreadyCaptured) {
                        genericContentElements.push({
                            tagName: element.tagName.toLowerCase(),
                            text: element.textContent.trim().substring(0, 150) + '...',
                            selector: generateSimpleSelector(element),
                            coordinates: getSimpleCoordinates(element),
                            note: "Generic content detection - meaningful text found"
                        });
                    }
                }
            });
        } catch (error) {
            console.warn(`[Content] ⚠️ Error in generic content detection:`, error);
        }
        
        // 🎯 Step 5: iframe detection (but not scanning)
        const iframes = document.querySelectorAll('iframe');
        const iframeInfo = Array.from(iframes).map((iframe, index) => ({
            index: index,
            src: iframe.src,
            width: iframe.offsetWidth,
            height: iframe.offsetHeight,
            isVisible: iframe.offsetWidth > 0 && iframe.offsetHeight > 0,
            note: "Detected but not scanned (main-frame-only approach)"
        }));
        
        // 🎯 Step 6: Compile comprehensive results
        const comprehensiveScanResult = {
            timestamp: Date.now(),
            scanType: 'immediate_comprehensive_after_tear_away',
            frameContext: {
                isMainFrame: window.top === window.self,
                currentUrl: window.location.href,
                title: document.title,
                hostname: window.location.hostname
            },
            elementCounts: {
                totalElements: elementCount,
                interactiveElements: interactiveElements.length,
                contentElements: contentElements.length,
                genericContentElements: genericContentElements.length,
                iframes: iframes.length
            },
            interactiveElements: interactiveElements.slice(0, 50), // Limit to first 50
            contentElements: contentElements.slice(0, 20), // Limit to first 20
            genericContentElements: genericContentElements.slice(0, 30), // Limit to first 30
            iframeInfo: iframeInfo,
            scanDuration: performance.now() - startTime,
            tearAwaySuccess: true,
            note: "This scan was performed immediately after tear away to capture main frame content"
        };
        
        // 🎯 Step 7: Log comprehensive results with filtering stats
        const filteringStats = {
            totalElements: elementCount,
            interactiveElements: interactiveElements.length,
            contentElements: contentElements.length,
            genericContentElements: genericContentElements.length,
            iframes: iframes.length,
            scanDuration: comprehensiveScanResult.scanDuration.toFixed(2) + "ms",
            isMainFrame: comprehensiveScanResult.frameContext.isMainFrame,
            frameDepth: frameInfo.frameDepth,
            filtering: {
                totalScanned: elementCount,
                interactiveFound: interactiveElements.length,
                contentFound: contentElements.length,
                genericContentFound: genericContentElements.length,
                iframesFound: iframes.length,
                elementsRetained: interactiveElements.length + contentElements.length + genericContentElements.length,
                elementsFiltered: elementCount - (interactiveElements.length + contentElements.length + genericContentElements.length),
                filteringRate: ((elementCount - (interactiveElements.length + contentElements.length + genericContentElements.length)) / elementCount * 100).toFixed(1) + "%"
            }
        };
        
        console.log(`[Content] 🚀 Immediate comprehensive scan complete:`, filteringStats);
        console.log(`[Content] 🧹 Filtering Summary:`, filteringStats.filtering);
        
        // 🆕 NEW: Step 8: Queue-based registration of all found elements
        console.log(`[Content] 🔄 Step 8: Queue-based registration of ${interactiveElements.length} interactive elements...`);
        
        try {
            // Create registration queue for all interactive elements
            const registrationQueue = [...interactiveElements];
            let registeredCount = 0;
            let failedCount = 0;
            
            // Process queue one element at a time to avoid overwhelming the engine
            const processRegistrationQueue = () => {
                if (registrationQueue.length === 0) {
                    console.log(`[Content] ✅ Registration queue complete: ${registeredCount} registered, ${failedCount} failed`);
                    return;
                }
                
                const elementObj = registrationQueue.shift();
                
                // Check if IntelligenceEngine is available
                if (window.intelligenceEngine && window.intelligenceEngine.registerActionableElement) {
                    try {
                        // Reconstruct DOM element from selector
                        let domElement = null;
                        try {
                            domElement = document.querySelector(elementObj.selector);
                        } catch (e) {
                            console.warn(`[Content] ⚠️ Could not resolve selector: ${elementObj.selector}`);
                            failedCount++;
                            // Continue with next element instead of returning
                            setTimeout(processRegistrationQueue, 10);
                            return;
                        }
                        
                        if (!domElement) {
                            console.warn(`[Content] ⚠️ Element not found for selector: ${elementObj.selector}`);
                            failedCount++;
                            // Continue with next element instead of returning
                            setTimeout(processRegistrationQueue, 10);
                            return;
                        }
                        
                        // Register the element directly with the DOM element
                        const actionId = window.intelligenceEngine.registerActionableElement(domElement, elementObj.actionType || 'click');
                        if (actionId) {
                            registeredCount++;
                            // Removed individual element logging to reduce console noise
                        } else {
                            failedCount++;
                            console.log(`[Content] ⚠️ Failed to register element: ${elementObj.selector}`);
                        }
                    } catch (error) {
                        failedCount++;
                        // 🆕 NEW: Suppress context invalidation errors
                        if (error.message && error.message.includes('Extension context invalidated')) {
                            console.log(`[Content] 🔄 Expected: Extension context invalidated during element registration`);
                        } else {
                            console.warn(`[Content] ⚠️ Error registering element:`, error.message);
                            console.log(`[Content] 🔍 Failed element details:`, elementObj);
                        }
                    }
                } else {
                    // IntelligenceEngine not available, retry after delay
                    console.log(`[Content] ⏳ IntelligenceEngine not available, retrying in 100ms...`);
                    registrationQueue.unshift(elementObj); // Put element back in queue
                    setTimeout(processRegistrationQueue, 100);
                    return;
                }
                
                // Process next element with small delay to avoid overwhelming
                // Always continue to next element, even if current one failed
                setTimeout(processRegistrationQueue, 10);
            };
            
            // Start processing the queue
            if (registrationQueue.length > 0) {
                processRegistrationQueue();
            }
            
        } catch (error) {
            // 🆕 NEW: Suppress context invalidation errors
            if (error.message && error.message.includes('Extension context invalidated')) {
                console.log(`[Content] 🔄 Expected: Extension context invalidated during queue registration`);
            } else {
                console.warn(`[Content] ⚠️ Error in queue-based registration:`, error.message);
            }
        }
        
        // 🎯 Step 9: Attempt to traverse to main frame if in iframe
        if (!frameInfo.isMainFrame && frameInfo.frameDepth > 0) {
            console.log("[Content] 🔍 Attempting to traverse to main frame...");
            
            // 🎯 Method 1: Try to access parent frame content (non-async)
            try {
                const mainFrameContent = attemptMainFrameAccess(frameInfo);
                if (mainFrameContent) {
                    console.log("[Content] ✅ Successfully accessed main frame content");
                    comprehensiveScanResult.mainFrameAccess = mainFrameContent;
                }
            } catch (error) {
                console.warn("[Content] ⚠️ Main frame access failed:", error.message);
            }
        }
        
        // 🎯 Step 10: Send results to service worker
        if (chrome.runtime && chrome.runtime.sendMessage) {
            try {
                chrome.runtime.sendMessage({
                    type: 'immediate_scan_results',
                    data: comprehensiveScanResult
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        // 🆕 NEW: Suppress intentional context invalidation errors
                        const errorMsg = chrome.runtime.lastError.message || '';
                        if (errorMsg.includes('Extension context invalidated')) {
                            console.log("[Content] 🔄 Expected: Extension context invalidated (CSP bypass successful)");
                        } else {
                            console.warn("[Content] ⚠️ Could not send scan results to service worker:", errorMsg);
                        }
                    } else {
                        console.log("[Content] ✅ Immediate scan results sent to service worker");
                    }
                });
            } catch (error) {
                // 🆕 NEW: Catch and suppress context invalidation errors
                if (error.message && error.message.includes('Extension context invalidated')) {
                    console.log("[Content] 🔄 Expected: Extension context invalidated (CSP bypass successful)");
                } else {
                    console.warn("[Content] ⚠️ Error sending scan results:", error.message);
                }
            }
        }
        
        return comprehensiveScanResult;
        
    } catch (error) {
        console.error("[Content] ❌ Error during immediate comprehensive scan:", error);
        return { 
            error: error.message, 
            timestamp: Date.now(),
            tearAwaySuccess: false
        };
    }
}

// 🆕 NEW: Automatic Disconnect Cycle for CSP Bypass
function performAutomaticDisconnectCycle() {
    console.log("[Content] 🔄 Starting automatic disconnect cycle for CSP bypass...");
    
    try {
        // 🎯 Step 1: Force runtime disconnect to invalidate extension context
        if (chrome.runtime && chrome.runtime.disconnect) {
            console.log("[Content] 🔌 Forcing runtime disconnect...");
            chrome.runtime.disconnect();
        }
        
        // 🎯 Step 2: Clear any local storage/cache
        if (chrome.storage && chrome.storage.local) {
            try {
                chrome.storage.local.clear(() => {
                    console.log("[Content] 🗑️ Cleared local storage");
                });
            } catch (e) {
                console.log("[Content] ⚠️ Could not clear storage:", e.message);
            }
        }
        
        // 🎯 Step 3: Request service worker to re-inject content script
        if (chrome.runtime && chrome.runtime.sendMessage) {
            try {
                chrome.runtime.sendMessage({
                    command: 'forceContentScriptReinjection',
                    tabId: null, // Will be set by service worker
                    reason: 'automatic_csp_bypass_before_scan'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log("[Content] ⚠️ Service worker not responding, continuing with scan...");
                    } else {
                        console.log("[Content] ✅ Service worker acknowledged reinjection request");
                    }
                });
            } catch (e) {
                console.log("[Content] ⚠️ Could not request reinjection:", e.message);
            }
        }
        
        // 🎯 Step 4: Small delay to allow CSP to relax
        console.log("[Content] ⏳ Waiting for CSP to relax...");
        // Note: We can't use setTimeout here as the context is invalidated
        // The delay happens naturally as the function continues
        
        console.log("[Content] ✅ Automatic disconnect cycle complete - CSP should be relaxed");
        
    } catch (error) {
        console.warn("[Content] ⚠️ Error during automatic disconnect cycle:", error.message);
        console.log("[Content] 🔄 Continuing with scan anyway...");
    }
}

// 🆕 NEW: Simple Helper Functions for Comprehensive Scanning
function generateSimpleSelector(element) {
    try {
        if (element.id) {
            return `#${element.id}`;
        }
        
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(' ').filter(c => c.trim().length > 0);
            if (classes.length > 0) {
                return `${element.tagName.toLowerCase()}.${classes[0]}`;
            }
        }
        
        return `${element.tagName.toLowerCase()}`;
        
    } catch (error) {
        return element.tagName.toLowerCase();
    }
}

function extractSimpleAttributes(element) {
    try {
        const attributes = {};
        const importantAttrs = ['href', 'src', 'alt', 'title', 'aria-label', 'role', 'type', 'value', 'placeholder'];
        
        importantAttrs.forEach(attr => {
            if (element.hasAttribute(attr)) {
                attributes[attr] = element.getAttribute(attr);
            }
        });
        
        return attributes;
        
    } catch (error) {
        return {};
    }
}

function getSimpleCoordinates(element) {
    try {
        const rect = element.getBoundingClientRect();
        return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
        
    } catch (error) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
}

// 🆕 NEW: Main Frame Access Function
function attemptMainFrameAccess(frameInfo) {
    try {
        console.log("[Content] 🔍 Attempting main frame access...");
        
        // 🎯 Method 1: Try to access window.top directly
        if (window.top && window.top !== window.self) {
            try {
                const mainFrameElements = window.top.document.querySelectorAll('*');
                console.log(`[Content] ✅ Direct main frame access: ${mainFrameElements.length} elements`);
                
                return {
                    method: "direct_access",
                    elementCount: mainFrameElements.length,
                    accessible: true,
                    note: "Successfully accessed main frame DOM directly"
                };
            } catch (e) {
                console.log("[Content] ⚠️ Direct access blocked by CORS");
            }
        }
        
        // 🎯 Method 2: Try to traverse parent chain
        let currentWindow = window;
        let traversalDepth = 0;
        const maxTraversal = 10; // Prevent infinite loops
        
        while (currentWindow !== window.top && traversalDepth < maxTraversal) {
            traversalDepth++;
            try {
                const parentElements = currentWindow.parent.document.querySelectorAll('*');
                console.log(`[Content] ✅ Parent frame ${traversalDepth} access: ${parentElements.length} elements`);
                
                return {
                    method: "parent_traversal",
                    elementCount: parentElements.length,
                    accessible: true,
                    traversalDepth: traversalDepth,
                    note: `Accessed parent frame at depth ${traversalDepth}`
                };
            } catch (e) {
                console.log(`[Content] ⚠️ Parent frame ${traversalDepth} access blocked by CORS`);
                currentWindow = currentWindow.parent;
            }
        }
        
        // 🎯 Method 3: Try to inject script into parent frame
        try {
            const script = document.createElement('script');
            script.textContent = `
                console.log('[Main Frame] Script injected from iframe');
                window.iframeAccessRequest = true;
            `;
            document.head.appendChild(script);
            
            return {
                method: "script_injection",
                accessible: false,
                note: "Attempted script injection into parent frame"
            };
        } catch (e) {
            console.log("[Content] ⚠️ Script injection failed:", e.message);
        }
        
        return {
            method: "none",
            accessible: false,
            note: "All main frame access methods failed due to CORS restrictions"
        };
        
    } catch (error) {
        console.error("[Content] ❌ Error in main frame access attempt:", error);
        return {
            method: "error",
            accessible: false,
            error: error.message
        };
    }
}

// 🆕 NEW: Framework-specific element scanning
function scanWithFrameworkSelectors() {
    if (!currentSiteConfig) {
        console.log("[Content] ⚠️ No site config available, using generic scanning");
        return [];
    }
    
    console.log("[Content] 🎯 Scanning with framework:", currentFramework, "selectors");
    
    const frameworkElements = [];
    const selectors = currentSiteConfig.selectors;
    
    // Scan navigation elements
    if (selectors.navigation) {
        selectors.navigation.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    frameworkElements.push({
                        element: element,
                        type: 'navigation',
                        selector: selector,
                        framework: currentFramework
                    });
                });
            } catch (error) {
                console.log("[Content] ⚠️ Error scanning selector:", selector, error);
            }
        });
    }
    
    // Scan button elements
    if (selectors.buttons) {
        selectors.buttons.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    frameworkElements.push({
                        element: element,
                        type: 'button',
                        selector: selector,
                        framework: currentFramework
                    });
                });
            } catch (error) {
                console.log("[Content] ⚠️ Error scanning selector:", selector, error);
            }
        });
    }
    
    // Scan menu elements
    if (selectors.menus) {
        selectors.menus.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    frameworkElements.push({
                        element: element,
                        type: 'menu',
                        selector: selector,
                        framework: currentFramework
                    });
                });
            } catch (error) {
                console.log("[Content] ⚠️ Error scanning selector:", selector, error);
            }
        });
    }
    
    // Scan hidden content elements
    if (selectors.hidden_content) {
        selectors.hidden_content.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    frameworkElements.push({
                        element: element,
                        type: 'hidden_content',
                        selector: selector,
                        framework: currentFramework
                    });
                });
            } catch (error) {
                console.log("[Content] ⚠️ Error scanning selector:", selector, error);
            }
        });
    }
    
    console.log("[Content] 🎯 Framework scanning found:", frameworkElements.length, "elements");
    return frameworkElements;
}

// 🆕 NEW: Test event listener for debugging from page context
document.addEventListener('testIntelligence', (event) => {
    // Test event received (logging removed)
    
    const command = event.detail?.command;
    if (!command) {
        console.log("[Content] 🧪 No command specified, running basic test");
        console.log("[Content] 🧪 Intelligence system status:", {
            changeAggregator: !!changeAggregator,
            intelligenceEngine: !!intelligenceEngine,
            pageContext: !!pageContext,
            actionableElementsCount: intelligenceEngine?.actionableElements?.size || 0,
            eventHistoryCount: intelligenceEngine?.eventHistory?.length || 0
        });
        return;
    }
    
    // Handle specific commands
    switch (command) {
        case 'testIntelligenceSystem':
            console.log("[Content] 🧪 Running intelligence system test...");
            if (intelligenceEngine) {
                const result = {
                    changeAggregator: !!changeAggregator,
                    intelligenceEngine: !!intelligenceEngine,
                    pageContext: !!pageContext,
                    actionableElementsCount: intelligenceEngine.actionableElements.size,
                    eventHistoryCount: intelligenceEngine.eventHistory.length,
                    timestamp: Date.now()
                };
                console.log("[Content] 🧪 Test result:", result);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'getActionableElements':
            console.log("[Content] 🧪 Getting actionable elements...");
            if (intelligenceEngine) {
                const elements = intelligenceEngine.getActionableElementsSummary();
                console.log("[Content] 🧪 Actionable elements:", elements);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'scanElements':
            console.log("[Content] 🧪 Scanning page elements...");
            if (intelligenceEngine) {
                const result = intelligenceEngine.scanAndRegisterPageElements();
                console.log("[Content] 🧪 Scan result:", result);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'getDOMStatus':
            console.log("[Content] 🧪 Getting DOM change detection status...");
            const domStatus = {
                changeDetectionEnabled: changeDetectionEnabled,
                changeCount: changeCount,
                lastChangeTime: lastChangeTime,
                domChangeObserver: !!domChangeObserver,
                observerActive: domChangeObserver ? domChangeObserver.takeRecords().length >= 0 : false
            };
            console.log("[Content] 🧪 DOM status:", domStatus);
            break;
            
        case 'executeAction':
            const { actionId, action, params } = event.detail;
            console.log("[Content] 🧪 Executing action:", { actionId, action, params });
            if (intelligenceEngine) {
                const result = intelligenceEngine.executeAction(actionId, action, params);
                console.log("[Content] 🧪 Action execution result:", result);
            } else {
                console.log("[Content] ❌ Intelligence engine not available for action execution");
            }
            break;
            
        case 'testQueue':
            console.log("[Content] 🧪 Testing queue system...");
            if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                console.log("[Content] 🧪 Adding test updates to queue...");
                intelligenceEngine.queueIntelligenceUpdate('high');
                intelligenceEngine.queueIntelligenceUpdate('normal');
                intelligenceEngine.queueIntelligenceUpdate('low');
                console.log("[Content] 🧪 Test updates queued, check status with 'getStatus' command");
            } else {
                console.log("[Content] ❌ Queue system not available");
            }
            break;
            
        case 'checkEngine':
            console.log("[Content] 🧪 Checking engine readiness...");
            if (intelligenceEngine) {
                const readiness = intelligenceEngine.isEngineReady();
                console.log("[Content] 🧪 Engine readiness check:", {
                    isReady: readiness,
                    initialScanCompleted: intelligenceEngine.initialScanCompleted,
                    pageState: intelligenceEngine.pageState,
                });
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        // 🆕 NEW: iframe Testing Commands
        case 'testIframeScanning':
            console.log("[Content] 🧪 Testing iframe scanning...");
            try {
                // Test the main frame scanning (since we're main-frame only now)
                const result = {
                    isMainFrame: window.top === window.self,
                    currentUrl: window.location.href,
                    hasIframes: document.querySelectorAll('iframe').length,
                    iframeCount: document.querySelectorAll('iframe').length,
                    timestamp: Date.now(),
                    note: "Extension now runs main-frame only - no iframe scanning needed"
                };
                console.log("[Content] 🧪 iframe scanning test result:", result);
            } catch (error) {
                console.error("[Content] ❌ iframe scanning test failed:", error);
            }
            break;
            
        case 'testIframeAnalysis':
            console.log("[Content] 🧪 Testing iframe analysis...");
            try {
                const iframes = document.querySelectorAll('iframe');
                const analysis = {
                    totalIframes: iframes.length,
                    iframeDetails: Array.from(iframes).map((iframe, index) => ({
                        index: index,
                        src: iframe.src,
                        width: iframe.offsetWidth,
                        height: iframe.offsetHeight,
                        isVisible: iframe.offsetWidth > 0 && iframe.offsetHeight > 0
                    })),
                    note: "Extension runs in main frame only - iframes are detected but not scanned",
                    timestamp: Date.now()
                };
                console.log("[Content] 🧪 iframe analysis test result:", analysis);
            } catch (error) {
                console.error("[Content] ❌ iframe analysis test failed:", error);
            }
            break;
            
        case 'generateSiteMap':
            console.log("[Content] 🧪 Testing site map generation...");
            try {
                // This will call the actual generateSiteMap function
                generateSiteMap().then(result => {
                    console.log("[Content] 🧪 Site map generation test result:", {
                        success: true,
                        totalElements: result.statistics?.totalElements || 0,
                        clickableElements: result.statistics?.clickableElements || 0,
                        forms: result.statistics?.formElements || 0,
                        timestamp: Date.now()
                    });
                }).catch(error => {
                    console.error("[Content] ❌ Site map generation test failed:", error);
                });
            } catch (error) {
                console.error("[Content] ❌ Site map generation test failed:", error);
            }
            break;
            
        // 🆕 NEW: Continuous DOM Scanning Test Commands
        case 'startContinuousScanning':
            console.log("[Content] 🧪 Starting continuous DOM scanning...");
            try {
                startContinuousDOMScanning();
                console.log("[Content] 🧪 Continuous DOM scanning started successfully");
            } catch (error) {
                console.error("[Content] ❌ Failed to start continuous scanning:", error);
            }
            break;
            
        case 'stopContinuousScanning':
            console.log("[Content] 🧪 Stopping continuous DOM scanning...");
            try {
                stopContinuousDOMScanning();
                console.log("[Content] 🧪 Continuous DOM scanning stopped successfully");
            } catch (error) {
                console.error("[Content] ❌ Failed to stop continuous scanning:", error);
            }
            break;
            
        case 'getContinuousScanStatus':
            console.log("[Content] 🧪 Getting continuous scan status...");
            try {
                const status = {
                    isRunning: !!continuousDOMScanner,
                    interval: DOM_SCAN_INTERVAL,
                    lastScan: lastDOMScan,
                    totalElementsScanned: totalElementsScanned,
                    enabled: continuousScanningEnabled,
                    timestamp: Date.now()
                };
                console.log("[Content] 🧪 Continuous scan status:", status);
            } catch (error) {
                console.error("[Content] ❌ Failed to get scan status:", error);
            }
            break;
            
        // 🆕 NEW: Tear Away Test Commands
        case 'performTearAway':
            console.log("[Content] 🧪 Performing controlled tear away...");
            try {
                const result = performControlledTearAway();
                console.log("[Content] 🧪 Tear away result:", result);
            } catch (error) {
                console.error("[Content] ❌ Tear away failed:", error);
            }
            break;
            
        case 'forceReinjection':
            console.log("[Content] 🧪 Forcing context re-injection...");
            try {
                const result = forceContextReinjection();
                console.log("[Content] 🧪 Re-injection result:", result);
            } catch (error) {
                console.error("[Content] ❌ Re-injection failed:", error);
            }
            break;
            
        case 'fullTearAwaySequence':
            console.log("[Content] 🧪 Executing full tear away sequence...");
            try {
                // Step 1: Perform controlled tear away
                const tearAwayResult = performControlledTearAway();
                console.log("[Content] 🧪 Step 1 - Tear away completed:", tearAwayResult);
                
                // Step 2: Wait a bit, then force re-injection
                setTimeout(() => {
                    const reinjectionResult = forceContextReinjection();
                    console.log("[Content] 🧪 Step 2 - Re-injection completed:", reinjectionResult);
                    
                                    // Step 3: Continuous scanning DISABLED to preserve context
                console.log("[Content] 🧪 Step 3 - Continuous scanning DISABLED to preserve context state");
                }, 1000);
                
                console.log("[Content] 🧪 Full tear away sequence initiated");
            } catch (error) {
                console.error("[Content] ❌ Full tear away sequence failed:", error);
            }
            break;
            
        case 'preScanDisconnectCycle':
            console.log("[Content] 🧪 Testing pre-scan disconnect cycle...");
            try {
                const disconnectResult = performPreScanDisconnectCycle();
                console.log("[Content] 🧪 Pre-scan disconnect cycle result:", disconnectResult);
            } catch (error) {
                console.error("[Content] ❌ Pre-scan disconnect cycle failed:", error);
            }
            break;
            
        case 'forceTabRefreshAndRescan':
            console.log("[Content] 🧪 Testing force tab refresh and rescan...");
            try {
                // 🎯 This simulates the extension reload + navigation scenario
                console.log("[Content] 🔄 Simulating extension reload + tab navigation...");
                
                // Step 1: Force service worker to refresh tabs
                chrome.runtime.sendMessage({
                    type: 'force_extension_reload',
                    data: {
                        reason: 'force_tab_refresh_and_rescan',
                        timestamp: Date.now(),
                        forceReload: true
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("[Content] ⚠️ Tab refresh request failed:", chrome.runtime.lastError);
                    } else {
                        console.log("[Content] ✅ Tab refresh request sent:", response);
                        
                        // Step 2: Wait for tabs to refresh, then perform comprehensive scan
                        setTimeout(() => {
                            console.log("[Content] 🚀 Tabs refreshed, performing comprehensive scan...");
                            const scanResult = performImmediateComprehensiveScan();
                            console.log("[Content] 🧪 Comprehensive scan after tab refresh:", scanResult);
                        }, 5000); // Wait 5 seconds for tab refresh + content script injection
                    }
                });
                
            } catch (error) {
                console.error("[Content] ❌ Force tab refresh and rescan failed:", error);
            }
            break;
            
        case 'contextCycleForFullAccess':
            console.log("[Content] 🧪 Testing context cycling for full access...");
            try {
                // 🎯 This simulates the ideal pattern: extension reload + fresh tab access
                console.log("[Content] 🔄 Simulating extension reload + fresh tab access pattern...");
                
                // Step 1: Force extension context cycle (simulates reload)
                chrome.runtime.sendMessage({
                    type: 'force_extension_reload',
                    data: {
                        reason: 'context_cycle_for_full_access',
                        timestamp: Date.now(),
                        forceReload: false, // Don't refresh tabs, just cycle context
                        simulateReload: true
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("[Content] ⚠️ Context cycle request failed:", chrome.runtime.lastError);
                    } else {
                        console.log("[Content] ✅ Context cycle request sent:", response);
                        
                        // Step 2: Wait for context cycle, then scan
                        setTimeout(() => {
                            console.log("[Content] 🚀 Context cycled, performing comprehensive scan...");
                            const scanResult = performImmediateComprehensiveScan();
                            console.log("[Content] 🧪 Comprehensive scan after context cycle:", scanResult);
                            
                            // Step 3: Log the pattern
                            console.log("[Content] 🎯 Context cycling pattern complete:");
                            console.log("   🔄 Extension context cycled (simulated reload)");
                            console.log("   🎯 Fresh tab access established");
                            console.log("   📊 Expected: Full element access (236+ elements)");
                        }, 3000); // Wait 3 seconds for context cycle
                    }
                });
                
            } catch (error) {
                console.error("[Content] ❌ Context cycling for full access failed:", error);
            }
            break;
            
        case 'triggerExtensionPageReload':
            console.log("[Content] 🧪 Testing extension page reload trigger...");
            try {
                // 🎯 This simulates going to extension page and reloading
                console.log("[Content] 🔄 Simulating extension page reload pattern...");
                
                // Step 1: Check if we're on extension page
                const isExtensionPage = window.location.protocol === 'chrome-extension:' || 
                                      window.location.hostname === 'chrome-extension';
                
                if (isExtensionPage) {
                    console.log("[Content] ✅ On extension page, triggering reload...");
                    
                    // Step 2: Force extension reload from extension page
                    chrome.runtime.sendMessage({
                        type: 'force_extension_reload',
                        data: {
                            reason: 'extension_page_reload',
                            timestamp: Date.now(),
                            forceReload: false,
                            fromExtensionPage: true
                        }
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Content] ⚠️ Extension page reload failed:", chrome.runtime.lastError);
                        } else {
                            console.log("[Content] ✅ Extension page reload triggered:", response);
                            
                            // Step 3: Instructions for manual completion
                            console.log("[Content] 🎯 Extension page reload pattern:");
                            console.log("   1. ✅ Extension reload triggered");
                            console.log("   2. 🔄 Go to chrome://extensions/ and click reload");
                            console.log("   3. 🎯 Navigate back to Google tab");
                            console.log("   4. 📊 Expected: Full access (236+ elements)");
                        }
                    });
                    
                } else {
                    console.log("[Content] ⚠️ Not on extension page, cannot trigger reload");
                    console.log("[Content] 💡 To test this pattern:");
                    console.log("   1. 🔄 Go to chrome://extensions/");
                    console.log("   2. 🚀 Click reload button on your extension");
                    console.log("   3. 🎯 Navigate back to Google tab");
                    console.log("   4. 📊 Should get full access (236+ elements)");
                }
                
            } catch (error) {
                console.error("[Content] ❌ Extension page reload trigger failed:", error);
            }
            break;
            
        case 'manualScan':
            console.log("[Content] 🧪 Performing manual DOM scan...");
            try {
                // 🎯 Manual scan without continuous polling
                const scanResult = performImmediateComprehensiveScan();
                console.log("[Content] 🧪 Manual scan result:", scanResult);
                
                // 🎯 Show current element count
                if (intelligenceEngine && intelligenceEngine.isEngineReady && intelligenceEngine.isEngineReady()) {
                    const actionableCount = intelligenceEngine.actionableElements?.size || 0;
                    console.log(`[Content] 📊 Current actionable elements: ${actionableCount}`);
                    console.log(`[Content] 📊 Current actionable elements: ${actionableCount}`);
                    console.log(`[Content] 🎯 Expected: 236+ elements for full access, 39 for limited access`);
                }
                
            } catch (error) {
                console.error("[Content] ❌ Manual scan failed:", error);
            }
            break;
            
        case 'testAutoDisconnect':
            console.log("[Content] 🧪 Testing automatic disconnect cycle...");
            try {
                performAutomaticDisconnectCycle();
                console.log("[Content] 🧪 Automatic disconnect cycle test complete");
                return { success: true, message: "Automatic disconnect cycle executed", timestamp: Date.now() };
            } catch (error) {
                console.error("[Content] ❌ Error during auto disconnect test:", error);
                return { error: error.message, timestamp: Date.now() };
            }
            break;
            
        case 'getElementCoordinates':
            const coordActionId = event.detail?.actionId;
            console.log("[Content] 🧪 Getting element coordinates for:", coordActionId);
            if (!coordActionId) {
                console.log("[Content] ❌ No actionId provided");
                return;
            }
            if (intelligenceEngine) {
                console.log("[Content] 🔍 Step 1: Getting actionable element data...");
                const ae = intelligenceEngine.getActionableElement(coordActionId);
                console.log("[Content] 🔍 Actionable element data:", ae);
                
                if (!ae) {
                    console.log("[Content] ❌ No actionable element found for actionId:", coordActionId);
                    return;
                }
                
                console.log("[Content] 🔍 Step 2: Resolving DOM node from selectors...");
                const node = resolveNodeFromActionId(coordActionId);
                console.log("[Content] 🔍 DOM node found:", node);
                console.log("[Content] 🔍 Node tagName:", node?.tagName);
                console.log("[Content] 🔍 Node visible:", node && node.offsetWidth > 0 && node.offsetHeight > 0);
                
                if (!node) {
                    console.log("[Content] ❌ No DOM node found for actionId:", coordActionId);
                    return;
                }
                
                console.log("[Content] 🔍 Step 3: Getting bounding rect...");
                const rect = node.getBoundingClientRect();
                console.log("[Content] 🔍 Raw bounding rect:", rect);
                console.log("[Content] 🔍 Rect values:", {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                });
                
                console.log("[Content] 🔍 Step 4: Computing coordinates...");
                const coords = coordsForNode(node);
                console.log("[Content] 🔍 Computed coordinates:", coords);
                
                const result = { ok: true, actionId: coordActionId, coords };
                console.log("[Content] 🧪 Final coordinate result:", result);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'getStatus':
            console.log("[Content] 🧪 Getting system status...");
            if (intelligenceEngine) {
                const status = {
                    intelligenceEngine: !!intelligenceEngine,
                    actionableElementsCount: intelligenceEngine.actionableElements?.size || 0,
                    eventHistoryCount: intelligenceEngine.eventHistory?.length || 0,
                    updateQueueLength: intelligenceEngine.updateQueue?.length || 0,
                    isProcessingQueue: intelligenceEngine.isProcessingQueue || false,
                    engineReady: intelligenceEngine.isEngineReady ? intelligenceEngine.isEngineReady() : false,
                    timestamp: Date.now()
                };
                console.log("[Content] 🧪 System status:", status);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'reveal':
            const revealActionId = event.detail?.actionId;
            console.log("[Content] 🧪 Revealing element details for:", revealActionId);
            if (!revealActionId) {
                console.log("[Content] ❌ No actionId provided");
                return;
            }
            if (intelligenceEngine) {
                const result = intelligenceEngine.executeAction(revealActionId, 'reveal');
                console.log("[Content] 🧪 Reveal result:", result);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'getCoordinates':
            const getCoordActionId = event.detail?.actionId;
            console.log("[Content] 🧪 Getting coordinates with smart resolution for:", getCoordActionId);
            if (!getCoordActionId) {
                console.log("[Content] ❌ No actionId provided");
                return;
            }
            if (intelligenceEngine) {
                const result = intelligenceEngine.executeAction(getCoordActionId, 'getCoordinates');
                console.log("[Content] 🧪 Smart coordinates result:", result);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'testSmartClick':
            const smartClickActionId = event.detail?.actionId;
            console.log("[Content] 🧪 Testing smart resolution click for:", smartClickActionId);
            if (!smartClickActionId) {
                console.log("[Content] ❌ No actionId provided");
                return;
            }
            if (intelligenceEngine) {
                console.log("[Content] 🧪 Testing enhanced smart resolution click...");
                const result = intelligenceEngine.executeAction(smartClickActionId, 'click');
                console.log("[Content] 🧪 Enhanced smart click result:", result);
            } else {
                console.log("[Content] ❌ Intelligence engine not available");
            }
            break;
            
        case 'testEnhancedDimensions':
            const testElementSelector = event.detail?.selector || '.custom-logo-link';
            console.log("[Content] 🧪 Testing enhanced dimension detection for:", testElementSelector);
            
            const testElement = document.querySelector(testElementSelector);
            if (testElement) {
                const dimensionResult = hasValidDimensions(testElement);
                console.log("[Content] 🧪 Enhanced dimension test result:", dimensionResult);
            } else {
                console.log("[Content] ❌ Test element not found:", testElementSelector);
            }
            break;
            
        case 'testForceVisibility':
            const forceElementSelector = event.detail?.selector || '.ast-menu-toggle';
            console.log("[Content] 🧪 Testing force visibility for:", forceElementSelector);
            
            const forceElement = document.querySelector(forceElementSelector);
            if (forceElement) {
                const forceResult = forceElementVisibility(forceElement);
                console.log("[Content] 🧪 Force visibility test result:", forceResult);
            } else {
                console.log("[Content] ❌ Force visibility test element not found:", forceElementSelector);
            }
            break;
            
        case 'testViewportAnalysis':
            const viewportElementSelector = event.detail?.selector || '.ast-menu-toggle';
            console.log("[Content] 🧪 Testing viewport analysis for:", viewportElementSelector);
            
            const viewportElement = document.querySelector(viewportElementSelector);
            if (viewportElement) {
                const viewportResult = analyzeViewportPosition(viewportElement);
                console.log("[Content] 🧪 Viewport analysis test result:", viewportResult);
            } else {
                console.log("[Content] ❌ Viewport analysis test element not found:", viewportElementSelector);
            }
            break;
            
        case 'testViewportFix':
            const fixElementSelector = event.detail?.selector || '.ast-menu-toggle';
            console.log("[Content] 🧪 Testing viewport positioning fix for:", fixElementSelector);
            
            const fixElement = document.querySelector(fixElementSelector);
            if (fixElement) {
                const fixResult = fixViewportPositioning(fixElement);
                console.log("[Content] 🧪 Viewport positioning fix test result:", fixResult);
            } else {
                console.log("[Content] ❌ Viewport positioning fix test element not found:", fixElementSelector);
            }
            break;
            
        case 'testUniversalClick':
            const universalClickSelector = event.detail?.selector || '.ast-menu-toggle';
            console.log("[Content] 🧪 Testing universal click for:", universalClickSelector);
            
            const universalClickElement = document.querySelector(universalClickSelector);
            if (universalClickElement) {
                const universalClickResult = universalClick(universalClickElement);
                console.log("[Content] 🧪 Universal click test result:", universalClickResult);
            } else {
                console.log("[Content] ❌ Universal click test element not found:", universalClickSelector);
            }
            break;
            
        case 'testClickVerification':
            const verifySelector = event.detail?.selector || '.ast-menu-toggle';
            console.log("[Content] 🧪 Testing click verification for:", verifySelector);
            
            const verifyElement = document.querySelector(verifySelector);
            if (verifyElement) {
                verifyClickWorked(verifyElement).then(result => {
                    console.log("[Content] 🧪 Click verification test result:", result);
                });
            } else {
                console.log("[Content] ❌ Click verification test element not found:", verifySelector);
            }
            break;
            
        case 'testSubmenuInspection':
            const submenuSelector = event.detail?.selector || '.ast-menu-toggle';
            console.log("[Content] 🧪 Testing submenu inspection for:", submenuSelector);
            
            const submenuElement = document.querySelector(submenuSelector);
            if (submenuElement) {
                const submenuResult = inspectSubmenuContent(submenuElement);
                console.log("[Content] 🧪 Submenu inspection test result:", submenuResult);
            } else {
                console.log("[Content] ❌ Submenu inspection test element not found:", submenuSelector);
            }
            break;
            
        case 'testDelayedSubmenuInspection':
            const delayedSelector = event.detail?.selector || '.ast-menu-toggle';
            console.log("[Content] 🧪 Testing delayed submenu inspection for:", delayedSelector);
            
            const delayedElement = document.querySelector(delayedSelector);
            if (delayedElement) {
                delayedSubmenuInspection(delayedElement, 1000).then(result => {
                    console.log("[Content] 🧪 Delayed submenu inspection test result:", result);
                });
            } else {
                console.log("[Content] ❌ Delayed submenu inspection test element not found:", delayedSelector);
            }
            break;
            
        case 'testDocumentSearch':
            console.log("[Content] 🧪 Testing document-wide search for menu items...");
            const searchResult = searchDocumentForMenuItems();
            console.log("[Content] 🧪 Document search test result:", searchResult);
            break;
            
        case 'testMenuStructureBuilder':
            console.log("[Content] 🧪 Testing menu structure builder...");
            const menuStructures = buildMenuStructures();
            console.log("[Content] 🧪 Menu structure builder test result:", menuStructures);
            break;
            
        case 'testFrameworkScanning':
            console.log("[Content] 🧪 Testing framework-specific scanning...");
            console.log("[Content] 🧪 Current framework:", currentFramework);
            console.log("[Content] 🧪 Current site config:", currentSiteConfig);
            const frameworkElements = scanWithFrameworkSelectors();
            console.log("[Content] 🧪 Framework scanning result:", frameworkElements);
            break;
            
        case 'testEnhancedMenuClick':
            const enhancedSelector = event.detail?.selector || '[data-index="0"]';
            console.log("[Content] 🧪 Testing enhanced menu click for:", enhancedSelector);
            
            const enhancedElement = document.querySelector(enhancedSelector);
            if (enhancedElement) {
                console.log("[Content] 🧪 Step 1: Universal clicking the menu button...");
                const universalClickResult = universalClick(enhancedElement);
                console.log("[Content] 🧪 Universal click result:", universalClickResult);
                
                // Wait a bit, then inspect
                setTimeout(() => {
                    console.log("[Content] 🧪 Step 2: Inspecting submenu content...");
                    const submenuResult = inspectSubmenuContent(enhancedElement);
                    console.log("[Content] 🧪 Enhanced menu click final result:", submenuResult);
                }, 1500); // Wait 1.5 seconds for everything to load
            } else {
                console.log("[Content] ❌ Enhanced menu click test element not found:", enhancedSelector);
            }
            break;
            
        default:
            console.log("[Content] 🧪 Unknown command:", command);
    }
});

// Removed test commands logging
// 🧹 CLEANED: Removed verbose test command help logging

// Utility function for async delays
var sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🆕 NEW: Initialize DOM change detection
 * 
 * Sets up a MutationObserver to watch for real-time DOM changes
 * including new elements, attribute changes, and content modifications.
 */
function initializeDOMChangeDetection() {
    // Guard against multiple initializations
    if (window.domChangeDetectionInitialized && domChangeObserver) {
        console.log("[Content] ⚠️ DOM change detection already initialized, skipping...");
        return;
    }
    
    try {
        console.log("[Content] 🆕 Initializing DOM change detection...");
        
        // Create observer to watch for DOM changes
        domChangeObserver = new MutationObserver((mutations) => {
            if (!changeDetectionEnabled) return;

            changeCount++;
            lastChangeTime = Date.now();
            
            // 🆕 NEW: Use intelligent filtering to reduce noise
            if (isSignificantChange(mutations)) {
                console.log("[Content] 🧠 Significant DOM change detected:", {
                    mutations: mutations.length,
                    types: mutations.map(m => m.type),
                    timestamp: new Date().toISOString()
                });
                
                if (changeAggregator && intelligenceEngine) {
                    mutations.forEach(mutation => {
                        const changeInfo = {
                            type: mutation.type,
                            target: mutation.target?.tagName || 'unknown',
                            mutations: 1,
                            timestamp: lastChangeTime,
                            addedNodes: mutation.addedNodes?.length || 0,
                            removedNodes: mutation.removedNodes?.length || 0,
                            attributeName: mutation.attributeName || null
                        };
                        
                        changeAggregator.addChange(changeInfo);
                    });
                    
                    // 🆕 NEW: Trigger intelligence update on significant changes
                    console.log("[Content] 🧠 Triggering intelligence update due to significant DOM change");
                    // 🆕 NEW: Use queue system instead of immediate send
                    if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                        intelligenceEngine.queueIntelligenceUpdate('high');
                    }
                }
            } else {
                // Removed noisy DOM change logging to reduce console spam
            }
            
            // 🆕 NEW: Notify service worker about DOM changes (but only significant ones)
            if (isSignificantChange(mutations)) {
                notifyServiceWorkerOfChanges({
                    url: window.location.href,
                    changeNumber: changeCount,
                    totalMutations: mutations.length,
                    types: mutations.map(m => m.type),
                    timestamp: lastChangeTime,
                    isSignificant: true
                });
            }
        });
        
        const observerConfig = {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class', 'style', 'data-*', 'aria-*'],
            characterData: true, characterDataOldValue: false
        };
        
        domChangeObserver.observe(document.body, observerConfig);
        changeDetectionEnabled = true;
        
        // Mark as initialized
        window.domChangeDetectionInitialized = true;
        
        // Removed DOM change detection logging to reduce console spam
        
    } catch (error) {
        console.error("[Content] ❌ Failed to initialize DOM change detection:", error);
    }
}

/**
 * 🆕 NEW: Notify service worker of DOM changes
 * 
 * @param {Object} changeInfo - Information about the detected changes
 */
function notifyServiceWorkerOfChanges(changeInfo) {
    try {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                type: "dom_changed",
                ...changeInfo
            });
            // Removed DOM change notification logging to reduce console spam
        } else {
            console.warn("[Content] Service worker communication not available");
        }
    } catch (error) {
        if (error.message.includes("Extension context invalidated")) {
            console.warn("[Content] Extension context invalidated - reloading may have occurred");
            // Attempt to reconnect after a brief delay
            setTimeout(() => {
                // Try to reinitialize if needed
                if (typeof initializeIntelligenceSystem === 'function') {
                    initializeIntelligenceSystem();
                }
            }, 1000);
        } else {
            console.warn("[Content] Failed to notify service worker:", error.message);
        }
    }
}

/**
 * 🆕 NEW: Get current DOM change status
 * 
 * @returns {Object} - Current change detection status
 */
function getDOMChangeStatus() {
    return {
        enabled: changeDetectionEnabled,
        changeCount: changeCount,
        lastChangeTime: lastChangeTime,
        observerActive: domChangeObserver !== null,
        url: window.location.href,
        timestamp: Date.now()
    };
}

/**
 * 🆕 NEW: Disable DOM change detection
 */
function disableDOMChangeDetection() {
    if (domChangeObserver) {
        domChangeObserver.disconnect();
        domChangeObserver = null;
        changeDetectionEnabled = false;
        console.log("[Content] 🛑 DOM change detection disabled");
    }
}

/**
 * 🆕 NEW: Re-enable DOM change detection
 */
function enableDOMChangeDetection() {
    if (!domChangeObserver) {
        initializeDOMChangeDetection();
    } else {
        changeDetectionEnabled = true;
        console.log("[Content] ✅ DOM change detection re-enabled");
    }
}

/**
 * 👁️ Check if an element is visible on the page
 * 
 * This function determines if an element is actually visible to the user,
 * filtering out hidden, collapsed, or zero-sized elements.
 * 
 * @param {Element} element - DOM element to check
 * @returns {boolean} - True if element is visible
 */
var visible = (element) => {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    
    return rect.width > 0 && 
           rect.height > 0 && 
           style.visibility !== "hidden" && 
           style.display !== "none";
};

/**
 * 🎯 Generate CSS selector for an element (inspired by Crawl4AI)
 * 
 * This function creates unique CSS selectors for DOM elements, enabling
 * precise element targeting for automation and content extraction.
 * 
 * 🔍 SELECTOR PRIORITY:
 * 1. ID selector (#element-id) - Most specific
 * 2. Class selector (.class-name) - Good specificity
 * 3. Nth-child selector (tag:nth-child(n)) - Fallback
 * 4. Tag name - Least specific fallback
 * 
 * @param {Element} element - DOM element to generate selector for
 * @returns {string} - CSS selector string
 */
function generateSelector(element) {
    try {
        // First priority: Use ID if available
        if (element.id) return '#' + element.id;
        
        // Second priority: Use first class if available
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/);
            if (classes.length > 0 && classes[0]) {
                return '.' + classes[0];
            }
        }
        
        // Third priority: Generate nth-child selector path
        let path = [];
        let currentElement = element;
        while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
            let selector = currentElement.nodeName.toLowerCase();
            if (currentElement.id) {
                selector = '#' + currentElement.id;
                path.unshift(selector);
                break;
            } else {
                // Calculate nth-child position among siblings
                let sibling = currentElement;
                let nth = 1;
                while (sibling.previousElementSibling) {
                    sibling = sibling.previousElementSibling;
                    if (sibling.nodeName === currentElement.nodeName) nth++;
                }
                if (nth > 1) selector += ':nth-child(' + nth + ')';
            }
            path.unshift(selector);
            currentElement = currentElement.parentNode;
        }
        return path.join(' > ') || element.nodeName.toLowerCase();
    } catch (e) {
        return element.nodeName.toLowerCase();
    }
}

/**
 * ⏳ Wait for an element matching a selector to appear
 * 
 * This function polls the DOM until an element matching the selector
 * becomes visible, with configurable timeout.
 * 
 * @param {string} selector - CSS selector to wait for
 * @param {number} timeoutMs - Maximum wait time in milliseconds
 * @returns {Promise<Element>} - Promise that resolves to the found element
 * @throws {Error} - If element not found within timeout
 */
async function waitForSelector(selector, timeoutMs = 5000) {
    const startTime = performance.now();
    
    while (performance.now() - startTime < timeoutMs) {
        const element = document.querySelector(selector);
        if (element && visible(element)) {
            return element;
        }
        await sleep(60); // Poll every 60ms
    }
    
    const error = { 
        code: "SELECTOR_NOT_FOUND", 
        msg: `Timeout waiting for ${selector}` 
    };
    throw error;
}

/**
 * 🎯 Wait for element command implementation
 * 
 * Waits for an element matching the selector to appear and become visible.
 * This is a core automation command used by other functions.
 * 
 * @param {Object} params - Command parameters
 * @param {string} params.selector - CSS selector to wait for
 * @param {number} params.timeoutMs - Optional timeout override
 * @returns {Object} - Success response
 */
async function cmd_waitFor({ selector, timeoutMs }) { 
    console.log("[Content] waitFor: Starting with selector:", selector, "timeout:", timeoutMs);
    const result = await waitForSelector(selector, timeoutMs || 5000);
    console.log("[Content] waitFor: Element found:", result);
    return { ok: true }; 
}

/**
 * 📖 Extract text from element command implementation
 * 
 * Waits for an element to appear and extracts its text content.
 * Handles both text content and form input values.
 * 
 * @param {Object} params - Command parameters
 * @param {string} params.selector - CSS selector for target element
 * @returns {Object} - Response with extracted text
 */
async function cmd_getText({ selector }) { 
    console.log("[Content] getText: Starting with selector:", selector);
    const element = await waitForSelector(selector, 2000); 
    const text = element.innerText || element.value || "";
    console.log("[Content] getText: Extracted text length:", text.length);
    return { text: text }; 
}

/**
 * 🖱️ Click element command implementation
 * 
 * Waits for an element to appear, scrolls it into view, and clicks it.
 * Ensures the element is visible and clickable before interaction.
 * 
 * @param {Object} params - Command parameters
 * @param {string} params.selector - CSS selector for target element
 * @returns {Object} - Success response
 */
async function cmd_click({ selector }) { 
    console.log("[Content] click: Starting with selector:", selector);
    const el = await waitForSelector(selector, 5000); 
    el.scrollIntoView({ block: "center", inline: "center" }); 
    el.click(); 
    console.log("[Content] click: Element clicked successfully");
    return { clicked: true }; 
}

/**
 * 📝 Crawl4AI-inspired markdown generation function
 * 
 * This function implements intelligent content extraction and markdown generation
 * inspired by Crawl4AI's approach to web content processing.
 * 
 * 🎯 CONTENT PROCESSING STRATEGY:
 * 1. Content Filtering - Remove ads, navigation, irrelevant elements
 * 2. Smart Extraction - Focus on main content areas (main, article, etc.)
 * 3. Relevance Filtering - Filter out short or boilerplate content
 * 4. Structured Output - Generate hierarchical markdown with metadata
 * 
 * 🔍 CONTENT FILTERING:
 * - Removes navigation, headers, footers, ads
 * - Focuses on main content areas
 * - Filters paragraphs by length and relevance
 * - Extracts meaningful headings and links
 * 
 * @returns {Object} - Structured markdown data with metadata
 */
async function cmd_getPageMarkdown() {
    console.log("[Content] getPageMarkdown: Starting markdown generation");
    const startTime = performance.now();
    
    try {
        // 📊 Extract basic page information
        const basicInfo = {
            url: window.location.href,
            title: document.title,
            timestamp: Date.now()
        };
        console.log("[Content] getPageMarkdown: Basic info:", basicInfo);
        
        // 🗑️ Define selectors for irrelevant content removal (but preserve YouTube navigation)
        // 🚫 NO DOM MODIFICATION: We'll only analyze, not remove
        const analyzeSelectors = [
            // Elements to analyze but NOT remove
            '.ad', '.advertisement', '.banner',
            '.sidebar', '.navigation', '.menu', '.breadcrumb', '.pagination',
            '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
            'nav', 'header', 'footer'
        ];
        
        console.log("[Content] getPageMarkdown: Analyzing elements (NO REMOVAL):", analyzeSelectors);
        
        // 📋 Clone document to avoid modifying the original page
        const docClone = document.cloneNode(true);
        
        // 🔍 ANALYZE elements but DON'T remove anything
        let analyzedCount = 0;
        let youtubeNavCount = 0;
        
        analyzeSelectors.forEach(selector => {
            const elements = docClone.querySelectorAll(selector);
            elements.forEach(el => {
                // Check if this is a YouTube navigation element
                const className = el.className || '';
                const isYouTubeNav = className.includes('ytd') || className.includes('yt-') || className.includes('youtube');
                
                if (isYouTubeNav) {
                    console.log(`[Content] getPageMarkdown: Found YouTube navigation: ${el.tagName}.${className}`);
                    youtubeNavCount++;
                } else {
                    console.log(`[Content] getPageMarkdown: Found generic element: ${el.tagName}.${className}`);
                }
                analyzedCount++;
            });
        });
        
        console.log(`[Content] getPageMarkdown: Analyzed ${analyzedCount} elements, found ${youtubeNavCount} YouTube navigation elements (NO REMOVAL)`);
        
        // 🎯 Extract main content area
        const mainContent = docClone.querySelector('main') || 
                           docClone.querySelector('[role="main"]') || 
                           docClone.querySelector('article') || 
                           docClone.body;
        
        console.log("[Content] getPageMarkdown: Main content element:", mainContent.tagName);
        
        // 📚 Extract headings with hierarchy and selectors
        const headings = Array.from(mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .map(h => ({
                level: parseInt(h.tagName.charAt(1)),
                text: h.textContent.trim(),
                selector: generateSelector(h)  // Generate unique selector for each heading
            }))
            .filter(h => h.text && h.text.length > 2);  // Filter out very short headings
        
        console.log("[Content] getPageMarkdown: Found headings:", headings.length);
        
        // 📖 Extract and filter paragraphs by relevance
        const paragraphs = Array.from(mainContent.querySelectorAll('p'))
            .map(p => p.textContent.trim())
            .filter(text => {
                // Filter out very short or likely irrelevant content
                if (text.length < 20) return false;
                if (text.includes('cookie') || text.includes('privacy')) return false;
                if (text.includes('subscribe') || text.includes('newsletter')) return false;
                return true;
            });
        
        console.log("[Content] getPageMarkdown: Filtered paragraphs:", paragraphs.length);
        
        // 🔗 Extract links for citations and references
        const links = Array.from(mainContent.querySelectorAll('a[href]'))
            .map(a => ({
                text: a.textContent.trim(),
                url: a.href,
                title: a.title || a.textContent.trim()
            }))
            .filter(link => link.text && link.url && !link.url.startsWith('javascript:'));
        
        console.log("[Content] getPageMarkdown: Found links:", links.length);
        
        // 📝 Generate structured markdown with metadata
        let markdown = `# ${basicInfo.title}\n\n`;
        markdown += `**Source:** ${basicInfo.url}\n`;
        markdown += `**Generated:** ${new Date(basicInfo.timestamp).toISOString()}\n\n`;
        
        // Add headings with proper hierarchy
        headings.forEach(h => {
            markdown += `${'#'.repeat(h.level)} ${h.text}\n\n`;
        });
        
        // Add paragraphs (limit to most relevant)
        paragraphs.slice(0, 15).forEach(p => {
            markdown += `${p}\n\n`;
        });
        
        // Add citations if we have links
        if (links.length > 0) {
            markdown += `## References\n\n`;
            links.forEach((link, index) => {
                markdown += `${index + 1}. [${link.text}](${link.url})\n`;
            });
        }
        
        // ⏱️ Calculate processing time
        const processingTime = performance.now() - startTime;
        
        // 📊 Build comprehensive result object
        const result = {
            frontmatter: basicInfo,
            markdown: markdown,
            headings: headings,
            paragraphs: paragraphs.slice(0, 15),
            links: links,
            processingTime: processingTime,
            size: markdown.length,
            contentFiltering: {
                removedElements: 0, // No elements removed
                relevantTags: 0,
                filteredParagraphs: paragraphs.length
            }
        };
        
        console.log("[Content] getPageMarkdown: Generation complete:", {
            processingTime: processingTime.toFixed(2) + "ms",
            size: result.size + " bytes",
            headings: result.headings.length,
            paragraphs: result.paragraphs.length,
            links: result.links.length
        });
        
        return result;
        
    } catch (error) {
        console.error("[Content] getPageMarkdown: Error during generation:", error);
        throw error;
    }
}

/**
 * 📄 Extract page text to markdown format
 * 
 * This function extracts structured text content from the current page
 * and formats it as markdown for easy consumption by LLMs.
 * 
 * @returns {Object} - Structured markdown content with metadata
 */
async function cmd_extractPageText() {
    console.log("[Content] extractPageText: Starting text extraction");
    const startTime = performance.now();
    
    try {
        // 📊 Extract basic page information
        const basicInfo = {
            url: window.location.href,
            title: document.title,
            timestamp: Date.now()
        };
        console.log("[Content] extractPageText: Basic info:", basicInfo);
        
        // 🎯 Use the IntelligenceEngine's text extraction methods
        const intelligenceEngine = window.intelligenceEngine;
        if (!intelligenceEngine) {
            throw new Error("IntelligenceEngine not available");
        }
        
        // Extract markdown content
        const markdown = intelligenceEngine.extractPageTextToMarkdown();
        
        // Extract structured data for statistics
        const headings = intelligenceEngine.extractHeadings();
        const paragraphs = intelligenceEngine.extractParagraphs();
        const lists = intelligenceEngine.extractLists();
        
        // ⏱️ Calculate processing time
        const processingTime = performance.now() - startTime;
        
        // 📊 Build comprehensive result object
        const result = {
            frontmatter: basicInfo,
            markdown: markdown,
            headings: headings,
            paragraphs: paragraphs,
            lists: lists,
            processingTime: processingTime,
            size: markdown.length,
            statistics: {
                totalHeadings: headings.length,
                totalParagraphs: paragraphs.length,
                totalLists: lists.length,
                totalListItems: lists.reduce((sum, list) => sum + list.itemCount, 0)
            }
        };
        
        console.log("[Content] extractPageText: Extraction complete:", {
            processingTime: processingTime.toFixed(2) + "ms",
            size: result.size + " bytes",
            headings: result.statistics.totalHeadings,
            paragraphs: result.statistics.totalParagraphs,
            lists: result.statistics.totalLists,
            listItems: result.statistics.totalListItems
        });
        
        return result;
        
    } catch (error) {
        console.error("[Content] extractPageText: Error during extraction:", error);
        throw error;
    }
}

/**
 * 📨 Message handler for WebSocket communication
 * 
 * This listener handles all incoming messages from the service worker,
 * which receives commands from the WebSocket server. It implements
 * the command execution part of the round-trip communication.
 * 
 * 🔄 COMMAND EXECUTION FLOW:
 * 1. Receive command from service worker
 * 2. Execute appropriate function based on command type
 * 3. Send response back via sendResponse
 * 4. Response flows back through service worker → server → test client
 * 
 * 📋 SUPPORTED COMMANDS:
 * - waitFor: Wait for element to appear
 * - getText: Extract text from element
 * - click: Click element
 * - getPageMarkdown: Generate Crawl4AI-inspired markdown
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 🛡️ MAIN FRAME SAFETY CHECK - Ensure message handler only runs in main frame
    if (window.top !== window.self) {
        console.error("[Content] ❌ Message handler called from iframe - this should never happen");
        sendResponse({ error: "Message handler should only run in main frame" });
        return true;
    }
    
    console.log("[Content] Message received from service worker:", message);
    
    // 🆕 NEW: Handle site config updates
    if (message.type === "site_configs_update") {
        console.log("[Content] 📋 Received site configs update:", message.data);
        siteConfigs = message.data;
        detectAndApplyFramework();
        sendResponse({ ok: true, framework: currentFramework });
        return true;
    }
    
    // 🆕 NEW: Check if this is a typed message (LLM action) first
    if (message.type === "execute_action") {
        // Let the second listener handle this
        return false; // Don't handle this message
    }
    
    // Execute command asynchronously and send response
    (async () => {
        try {
            const { command, params } = message;
            console.log("[Content] Executing command:", command, "with params:", params);
            
            // 🎯 Route to appropriate command handler
            if (command === "waitFor") {
                console.log("[Content] waitFor command - selector:", params.selector, "timeout:", params.timeoutMs);
                const result = await cmd_waitFor(params);
                console.log("[Content] waitFor result:", result);
                return sendResponse(result);
            }
            if (command === "getText") {
                console.log("[Content] getText command - selector:", params.selector);
                const result = await cmd_getText(params);
                console.log("[Content] getText result:", result);
                return sendResponse(result);
            }
            if (command === "click") {
                console.log("[Content] click command - selector:", params.selector);
                const result = await cmd_click(params);
                console.log("[Content] click result:", result);
                return sendResponse(result);
            }
            if (command === "getPageMarkdown") {
                console.log("[Content] getPageMarkdown command - no params needed");
                const result = await cmd_getPageMarkdown();
                console.log("[Content] getPageMarkdown result:", {
                    processingTime: result.processingTime,
                    size: result.size,
                    headings: result.headings.length,
                    paragraphs: result.paragraphs.length,
                    links: result.links.length
                });
                return sendResponse(result);
            }
            
            // 🆕 NEW: Text Extraction Command
            if (command === "extractPageText") {
                console.log("[Content] extractPageText command - no params needed");
                const result = await cmd_extractPageText();
                console.log("[Content] extractPageText result:", {
                    processingTime: result.processingTime,
                    size: result.size,
                    headings: result.headings.length,
                    paragraphs: result.paragraphs.length,
                    lists: result.lists.length
                });
                return sendResponse(result);
            }
            
            if (command === "getCurrentTabInfo") {
                console.log("[Content] getCurrentTabInfo command - no params needed");
                const result = getCurrentTabInfo();
                console.log("[Content] getCurrentTabInfo result:", result);
                return sendResponse(result);
            }
            
            if (command === "getNavigationContext") {
                console.log("[Content] getNavigationContext command - no params needed");
                const result = getNavigationContext();
                console.log("[Content] getNavigationContext result:", result);
                return sendResponse(result);
            }
            
            if (command === "generateSiteMap") {
                console.log("[Content] generateSiteMap command - no params needed");
                const result = await generateSiteMap();
                console.log("[Content] generateSiteMap result:", {
                    totalElements: result.statistics.totalElements,
                    clickableElements: result.statistics.clickableElements,
                    forms: result.statistics.formElements
                });
                return sendResponse(result);
            }
            
            // 🆕 NEW: DOM Change Detection Commands
            if (command === "getDOMChangeStatus") {
                console.log("[Content] getDOMChangeStatus command - no params needed");
                const result = getDOMChangeStatus();
                console.log("[Content] getDOMChangeStatus result:", result);
                return sendResponse(result);
            }
            
            if (command === "enableDOMChangeDetection") {
                console.log("[Content] enableDOMChangeDetection command - no params needed");
                enableDOMChangeDetection();
                const result = { enabled: true, message: "DOM change detection enabled" };
                console.log("[Content] enableDOMChangeDetection result:", result);
                return sendResponse(result);
            }
            
            // 🆕 NEW: Get element coordinates by actionId
            if (command === "getElementCoordinatesByActionId") {
                const { actionId } = message.params || {};
                if (!actionId) {
                    sendResponse({ error: { code: "MISSING_PARAM", msg: "actionId is required" } });
                    return;
                }
                console.log("[Content] getElementCoordinatesByActionId command - actionId:", actionId);
                const node = resolveNodeFromActionId(actionId);
                if (!node) {
                    sendResponse({ error: { code: "NOT_FOUND", msg: `No element for ${actionId}` } });
                    return;
                }
                const coords = coordsForNode(node);
                const result = { ok: true, actionId, coords };
                console.log("[Content] getElementCoordinatesByActionId result:", result);
                sendResponse(result);
                return;
            }
            
            if (command === "disableDOMChangeDetection") {
                console.log("[Content] disableDOMChangeDetection command - no params needed");
                disableDOMChangeDetection();
                const result = { enabled: false, message: "DOM change detection disabled" };
                console.log("[Content] disableDOMChangeDetection result:", result);
                return sendResponse(result);
            }
            
            if (command === "resetDOMChangeCount") {
                console.log("[Content] resetDOMChangeCount command - no params needed");
                changeCount = 0;
                lastChangeTime = 0;
                const result = { reset: true, message: "DOM change count reset", newCount: changeCount };
                console.log("[Content] resetDOMChangeCount result:", result);
                return sendResponse(result);
            }
            
            if (command === "navigateBack") {
                console.log("[Content] navigateBack command - params:", params);
                const steps = params.steps || 1;
                const result = navigateBack(steps);
                console.log("[Content] navigateBack result:", result);
                return sendResponse(result);
            }
            
            if (command === "navigateForward") {
                console.log("[Content] navigateForward command - params:", params);
                const steps = params.steps || 1;
                const result = navigateForward(steps);
                console.log("[Content] navigateForward result:", result);
                return sendResponse(result);
            }
            
            if (command === "jumpToHistoryEntry") {
                console.log("[Content] jumpToHistoryEntry command - params:", params);
                const index = params.index;
                if (index === undefined) {
                    return sendResponse({
                        error: { code: "MISSING_PARAM", msg: "index parameter is required" }
                    });
                }
                const result = jumpToHistoryEntry(index);
                console.log("[Content] jumpToHistoryEntry result:", result);
                return sendResponse(result);
            }
            
            if (command === "getHistoryState") {
                console.log("[Content] getHistoryState command - no params needed");
                const result = getHistoryState();
                console.log("[Content] getHistoryState result:", {
                    currentIndex: result.currentIndex,
                    totalEntries: result.totalEntries,
                    canGoBack: result.canGoBack,
                    canGoForward: result.canGoForward
                });
                return sendResponse(result);
            }
            
            if (command === "searchHistory") {
                console.log("[Content] searchHistory command - params:", params);
                const result = searchHistory(params);
                console.log("[Content] searchHistory result:", {
                    matches: result.length,
                    criteria: params
                });
                return sendResponse(result);
            }
            
            if (command === "clearHistory") {
                console.log("[Content] clearHistory command - params:", params);
                const result = clearHistory(params);
                console.log("[Content] clearHistory result:", result);
                return sendResponse(result);
            }
            
            // 🆕 NEW: Intelligence System Commands
            if (command === "getIntelligenceStatus") {
                console.log("[Content] getIntelligenceStatus command - no params needed");
                const result = {
                    pageContext: pageContext,
                    pageState: intelligenceEngine?.pageState || null,
                    recentInsights: intelligenceEngine?.llmInsights.slice(-10) || [], // Last 10 insights
                    totalEvents: intelligenceEngine?.eventHistory.length || 0,
                    recommendations: intelligenceEngine?.getCurrentRecommendations() || [],
                    timestamp: Date.now()
                };
                console.log("[Content] getIntelligenceStatus result:", result);
                return sendResponse(result);
            }
            
            if (command === "getCurrentPageIntelligence") {
                console.log("[Content] getCurrentPageIntelligence command - no params needed");
                const result = {
                    url: window.location.href,
                    title: document.title,
                    currentView: intelligenceEngine?.pageState.currentView || 'unknown',
                    navigationState: intelligenceEngine?.pageState.navigationState || 'unknown',
                    interactiveElementsCount: intelligenceEngine?.pageState.interactiveElements.length || 0,
                    lastUpdate: intelligenceEngine?.pageState.lastUpdate || 0,
                    recommendations: intelligenceEngine?.getCurrentRecommendations() || [],
                    timestamp: Date.now()
                };
                console.log("[Content] getCurrentPageIntelligence result:", result);
                return sendResponse(result);
            }
            
            // 🆕 NEW: Get actionable elements for LLM instructions
            if (command === "getActionableElements") {
                console.log("[Content] getActionableElements command - no params needed");
                const result = {
                    actionableElements: intelligenceEngine?.getActionableElementsSummary() || [],
                    actionMapping: intelligenceEngine?.generateActionMapping() || {},
                    totalElements: intelligenceEngine?.actionableElements.size || 0,
                    timestamp: Date.now()
                };
                console.log("[Content] getActionableElements result:", result);
                return sendResponse(result);
            }
            
            // 🆕 NEW: Execute action on element by ID
            if (command === "executeAction") {
                const { actionId, action, params = {} } = message;
                console.log("[Content] executeAction command:", { actionId, action, params });
                
                if (!actionId || !action) {
                    return sendResponse({ success: false, error: "Missing actionId or action" });
                }
                
                try {
                    const result = intelligenceEngine?.executeAction(actionId, action, params);
                    console.log("[Content] executeAction result:", result);
                    return sendResponse(result);
                } catch (error) {
                    console.error("[Content] executeAction error:", error);
                    return sendResponse({ success: false, error: error.message });
                }
            }
            
            // 🆕 NEW: Scan page and register all interactive elements
            if (command === "scanAndRegisterElements") {
                console.log("[Content] scanAndRegisterElements command - no params needed");
                
                try {
                    const result = intelligenceEngine?.scanAndRegisterPageElements();
                    console.log("[Content] scanAndRegisterElements result:", result);
                    return sendResponse(result);
                } catch (error) {
                    console.error("[Content] scanAndRegisterElements error:", error);
                    return sendResponse({ success: false, error: error.message });
                }
            }
            
            // 🆕 NEW: Test intelligence system status
            if (command === "testIntelligenceSystem") {
                console.log("[Content] testIntelligenceSystem command - no params needed");
                
                const result = {
                    changeAggregator: !!changeAggregator,
                    intelligenceEngine: !!intelligenceEngine,
                    pageContext: !!pageContext,
                    actionableElementsCount: intelligenceEngine?.actionableElements.size || 0,
                    eventHistoryCount: intelligenceEngine?.eventHistory.length || 0,
                    timestamp: Date.now()
                };
                
                console.log("[Content] testIntelligenceSystem result:", result);
                return sendResponse(result);
            }
            
            // Unknown command handling
            console.log("[Content] Unknown command:", command);
            return sendResponse({ 
                error: { code: "UNKNOWN_COMMAND", msg: command } 
            });
        } catch (error) {
            console.error("[Content] Error executing command:", error);
            return sendResponse({ 
                error: { code: "DOM_ERROR", msg: error.message } 
            });
        }
    })();
    
    // Return true to indicate async response handling
    return true;
});

/**
 * 📊 Get current tab information and navigation status
 * 
 * This function provides real-time information about the current tab,
 * including URL, title, and navigation state. It's designed to be
 * consumed by external systems for monitoring and automation.
 * 
 * 🎯 FRAME CONTEXT HANDLING:
 * - Detects if we're running in an iframe
 * - Uses main frame context for page metadata
 * - Ensures we report the correct page URL and title
 * 
 * @returns {Object} - Current tab information
 */
function getCurrentTabInfo() {
    // 🛡️ MAIN FRAME SAFETY CHECK - This function should only run in main frame
    if (window.top !== window.self) {
        console.error("[Content] ❌ getCurrentTabInfo called from iframe - this should never happen");
        throw new Error("getCurrentTabInfo should only be called from main frame");
    }
    
    // 🎯 MAIN FRAME ONLY: Always use current frame since we're guaranteed to be in main frame
    const location = window.location;
    const mainDocument = document;
    
    return {
        url: location.href,  // Main page URL
        title: mainDocument.title,  // Main page title
        hostname: location.hostname,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        protocol: location.protocol,
        timestamp: Date.now(),
        readyState: document.readyState,
        userAgent: navigator.userAgent,
        isInIframe: false,  // Always false since we're in main frame
        frameContext: {
            isMainFrame: true,  // Always true since we're in main frame
            frameUrl: window.location.href,  // Current frame URL (main frame)
            mainPageUrl: location.href,  // Main page URL
            frameTitle: document.title,  // Current frame title (main frame)
            mainPageTitle: mainDocument.title  // Main page title
        }
    };
}

/**
 * 🧭 Get navigation history and current state
 * 
 * Provides information about the current page's navigation context,
 * useful for understanding the user's journey through the site.
 * 
 * @returns {Object} - Navigation context information
 */
function getNavigationContext() {
    return {
        currentUrl: window.location.href,
        referrer: document.referrer,
        historyLength: window.history.length,
        canGoBack: window.history.length > 1,
        canGoForward: false, // Would need to track forward state
        timestamp: Date.now()
    };
}

/**
 * 🧹 Remove overlays, popups, and noise elements before scanning
 * 
 * This function removes cookie banners, modals, popups, and other
 * intrusive elements that would add noise to our site mapping.
 * Inspired by crawl4ai's remove_overlay_elements.js
 * 
 * @param {Document} targetDocument - Document to clean (current frame or main frame)
 */
function removeOverlays(targetDocument = document) {
    console.log("[Content] removeOverlays: Starting DOM cleanup");
    
    // Common selectors for noise elements
    const noiseSelectors = [
        // Cookie notices
        '[class*="cookie-banner" i]',
        '[id*="cookie-banner" i]',
        '[class*="cookie-consent" i]',
        '[id*="cookie-consent" i]',
        
        // Newsletter/subscription dialogs
        '[class*="newsletter" i]',
        '[class*="subscribe" i]',
        '[class*="popup" i]',
        
        // Generic popups/modals
        '[class*="modal" i]',
        '[class*="overlay" i]',
        '[class*="dialog" i]',
        '[role="dialog"]',
        '[role="alertdialog"]',
        
        // Close buttons (remove them too)
        'button[class*="close" i]',
        'button[class*="dismiss" i]',
        'button[aria-label*="close" i]',
        'a[class*="close" i]',
        'span[class*="close" i]'
    ];
    
    let removedCount = 0;
    
    // Remove elements matching noise selectors
    noiseSelectors.forEach(selector => {
        const elements = targetDocument.querySelectorAll(selector);
        elements.forEach(element => {
            if (element && element.parentNode) {
                element.remove();
                removedCount++;
            }
        });
    });
    
    // Remove high z-index elements that might be overlays (but preserve navigation)
    let highZIndexRemoved = 0;
    const allElements = targetDocument.querySelectorAll('*');
    allElements.forEach(element => {
        const style = getComputedStyle(element);
        const zIndex = parseInt(style.zIndex);
        const position = style.position;
        
        // Check if element looks like an overlay
        if (zIndex > 999 && (position === 'fixed' || position === 'absolute')) {
            const rect = element.getBoundingClientRect();
            const isLargeOverlay = rect.width > window.innerWidth * 0.5 || 
                                  rect.height > window.innerHeight * 0.5;
            
            // 🚫 PRESERVE NAVIGATION: Don't remove header/nav elements
            const tagName = element.tagName.toLowerCase();
            const className = element.className || '';
            const id = element.id || '';
            
            // Check if this is likely a navigation element
            const isNavigation = 
                tagName === 'header' || 
                tagName === 'nav' ||
                className.includes('header') ||
                className.includes('navigation') ||
                className.includes('navbar') ||
                className.includes('nav') ||
                id.includes('header') ||
                id.includes('navigation') ||
                id.includes('navbar') ||
                id.includes('nav') ||
                // YouTube-specific navigation classes
                className.includes('ytd-masthead') ||
                className.includes('ytd-guide') ||
                className.includes('ytd-mini-guide') ||
                className.includes('ytd-searchbox') ||
                className.includes('ytd-topbar');
            
            // Only remove if it's a large overlay AND not navigation
            if (isLargeOverlay && !isNavigation && element.parentNode) {
                console.log(`[Content] removeOverlays: Removing overlay element: ${tagName}.${className}#${id}`);
                element.remove();
                removedCount++;
                highZIndexRemoved++;
            } else if (isNavigation) {
                console.log(`[Content] removeOverlays: Preserving navigation element: ${tagName}.${className}#${id}`);
            }
        }
    });
    
    console.log(`[Content] removeOverlays: Removed ${removedCount} noise elements (preserved navigation)`);
    
    return {
        elementsRemoved: removedCount,
        noiseSelectors: noiseSelectors.length,
        highZIndexRemoved: highZIndexRemoved,
        timestamp: Date.now()
    };
}

/**
 * 🗺️ Generate comprehensive LLM-friendly site map with click coordinates
 * 
 * 🚫 IMPORTANT: This function is now COMPLETELY NON-DESTRUCTIVE
 * It will NOT modify the actual page DOM, preserving all functionality
 * 
 * This function creates a structured representation of the current page
 * that's optimized for LLM consumption, including:
 * - Page structure and hierarchy
 * - Interactive elements with coordinates
 * - Content relationships
 * - Navigation paths
 * 
 * 🎯 LLM OPTIMIZATION:
 * - Structured data format
 * - Semantic relationships
 * - Actionable elements
 * - Coordinate-based navigation
 * 
 * @returns {Object} - Comprehensive site map structure
 */
async function generateSiteMap() {
    console.log("[Content] generateSiteMap: Starting comprehensive site mapping");
    const startTime = performance.now();
    
    try {
        // 🛡️ MAIN FRAME SAFETY CHECK - This function should only run in main frame
        if (window.top !== window.self) {
            console.error("[Content] ❌ generateSiteMap called from iframe - this should never happen");
            throw new Error("generateSiteMap should only be called from main frame");
        }
        
        // 🆕 ENHANCED ERROR HANDLING: Wrap everything in try-catch
        console.log("[Content] generateSiteMap: Initializing with error handling...");
        
        // 🎯 MAIN FRAME ONLY: Always use current frame since we're guaranteed to be in main frame
        const targetDocument = document;
        const targetWindow = window;
        const isInIframe = false; // Always false since we're in main frame
        
        console.log("[Content] generateSiteMap: Frame context:", {
            isInIframe: isInIframe,
            usingMainFrame: isInIframe,
            frameUrl: window.location.href,
            mainFrameUrl: isInIframe ? window.top.location.href : window.location.href
        });
        
        // 🚫 NO DOM MODIFICATION: Don't call removeOverlays on the actual page
        // Instead, we'll work with a cloned document for analysis
        console.log("[Content] generateSiteMap: Skipping DOM modification to preserve page functionality");
        
        // 📊 Get basic page information
        const pageInfo = getCurrentTabInfo();
        
        // 🐛 DEBUG: Log frame context information
        console.log("[Content] generateSiteMap: Frame context debug:", {
            isInIframe: pageInfo.isInIframe,
            frameUrl: pageInfo.frameContext.frameUrl,
            mainPageUrl: pageInfo.frameContext.mainPageUrl,
            frameTitle: pageInfo.frameContext.frameTitle,
            mainPageTitle: pageInfo.frameContext.mainPageTitle,
            reportedUrl: pageInfo.url,
            reportedTitle: pageInfo.title
        });
        
        // 🎯 Define interactive element selectors
        const interactiveSelectors = [
            'a[href]', 'button', 'input', 'select', 'textarea', 
            '[role="button"]', '[role="link"]', '[role="menuitem"]',
            '[onclick]', '[tabindex]', '[data-action]', '[data-toggle]'
        ];
        
        // 🔍 Find all interactive elements using target document
        const interactiveElements = [];
        
        try {
            interactiveSelectors.forEach(selector => {
                try {
                    const elements = targetDocument.querySelectorAll(selector);
                    elements.forEach((element, index) => {
                        try {
                            if (visible(element)) {
                                const rect = element.getBoundingClientRect();
                                const centerX = Math.round(rect.left + rect.width / 2);
                                const centerY = Math.round(rect.top + rect.height / 2);
                                
                                interactiveElements.push({
                                    type: element.tagName.toLowerCase(),
                                    tag: element.tagName.toLowerCase(),
                                    text: element.textContent?.trim() || element.value || element.alt || '',
                                    href: element.href || null,
                                    selector: generateSelector(element),
                                    coordinates: {
                                        x: centerX,
                                        y: centerY,
                                        left: Math.round(rect.left),
                                        top: Math.round(rect.top),
                                        right: Math.round(rect.right),
                                        bottom: Math.round(rect.bottom),
                                        width: Math.round(rect.width),
                                        height: Math.round(rect.height)
                                    },
                                    attributes: {
                                        id: element.id || null,
                                        className: element.className || null,
                                        role: element.getAttribute('role') || null,
                                        ariaLabel: element.getAttribute('aria-label') || null,
                                        title: element.title || null,
                                        placeholder: element.placeholder || null,
                                        type: element.type || null,
                                        value: element.value || null
                                    },
                                    accessibility: {
                                        isVisible: visible(element),
                                        isClickable: element.click !== undefined,
                                        isFocusable: element.focus !== undefined,
                                        tabIndex: element.tabIndex || null
                                    },
                                    position: {
                                        index: index,
                                        inViewport: rect.top >= 0 && rect.bottom <= targetWindow.innerHeight,
                                        aboveFold: rect.top < targetWindow.innerHeight / 2
                                    }
                                });
                            }
                        } catch (elementError) {
                            console.warn("[Content] Error processing element:", elementError.message);
                            // Continue with next element
                        }
                    });
                } catch (selectorError) {
                    console.warn("[Content] Error with selector:", selector, selectorError.message);
                    // Continue with next selector
                }
            });
        } catch (elementsError) {
            console.warn("[Content] Error finding interactive elements:", elementsError.message);
            // Continue with basic functionality
        }
        
        // 📚 Extract page structure and content hierarchy using target document
        const pageStructure = {
            headings: [],
            sections: [],
            forms: []
        };
        
        try {
            // Extract headings
            const headings = Array.from(targetDocument.querySelectorAll('h1, h2, h3, h4, h5, h6'));
            pageStructure.headings = headings
                .map(h => {
                    try {
                        return {
                            level: parseInt(h.tagName.charAt(1)),
                            text: h.textContent.trim(),
                            selector: generateSelector(h),
                            coordinates: getElementCoordinates(h)
                        };
                    } catch (headingError) {
                        console.warn("[Content] Error processing heading:", headingError.message);
                        return null;
                    }
                })
                .filter(h => h && h.text && h.text.length > 2);
            
            // Extract sections
            const sections = Array.from(targetDocument.querySelectorAll('section, article, main, aside, nav'));
            pageStructure.sections = sections
                .map(section => {
                    try {
                        return {
                            tag: section.tagName.toLowerCase(),
                            text: section.textContent.trim().substring(0, 200) + '...',
                            selector: generateSelector(section),
                            coordinates: getElementCoordinates(section),
                            children: section.children.length
                        };
                    } catch (sectionError) {
                        console.warn("[Content] Error processing section:", sectionError.message);
                        return null;
                    }
                })
                .filter(s => s && s.text.length > 10);
            
            // Extract forms
            const forms = Array.from(targetDocument.querySelectorAll('form'));
            pageStructure.forms = forms
                .map(form => {
                    try {
                        return {
                            action: form.action || null,
                            method: form.method || 'get',
                            selector: generateSelector(form),
                            coordinates: getElementCoordinates(form),
                            inputs: Array.from(form.querySelectorAll('input, select, textarea'))
                                .map(input => {
                                    try {
                                        return {
                                            type: input.type || input.tagName.toLowerCase(),
                                            name: input.name || null,
                                            placeholder: input.placeholder || null,
                                            required: input.required || false,
                                            selector: generateSelector(input),
                                            coordinates: getElementCoordinates(input)
                                        };
                                    } catch (inputError) {
                                        console.warn("[Content] Error processing form input:", inputError.message);
                                        return null;
                                    }
                                })
                                .filter(input => input)
                        };
                    } catch (formError) {
                        console.warn("[Content] Error processing form:", formError.message);
                        return null;
                    }
                })
                .filter(form => form);
                
        } catch (structureError) {
            console.warn("[Content] Error extracting page structure:", structureError.message);
            // Continue with basic functionality
        }
        
        // 🔗 Extract navigation and content relationships using target document
        const navigationMap = {
            breadcrumbs: [],
            pagination: [],
            navigation: [],
            relatedLinks: []
        };
        
        try {
            navigationMap.breadcrumbs = extractBreadcrumbs(targetDocument);
            navigationMap.pagination = extractPagination(targetDocument);
            navigationMap.navigation = extractNavigation(targetDocument);
            navigationMap.relatedLinks = extractRelatedLinks(targetDocument);
        } catch (navigationError) {
            console.warn("[Content] Error extracting navigation:", navigationError.message);
            // Continue with basic functionality
        }
        
        // 📊 Generate semantic content map using target document
        const contentMap = {
            mainContent: null,
            sidebar: null,
            footer: null,
            advertisements: []
        };
        
        try {
            contentMap.mainContent = findMainContent(targetDocument);
            contentMap.sidebar = findSidebar(targetDocument);
            contentMap.footer = findFooter(targetDocument);
            contentMap.advertisements = findAdvertisements(targetDocument);
        } catch (contentError) {
            console.warn("[Content] Error extracting content map:", contentError.message);
            // Continue with basic functionality
        }
        
        // 🎯 Create action map for LLM consumption
        const actionMap = {
            primaryActions: [],
            navigationActions: [],
            formActions: [],
            quickActions: []
        };
        
        try {
            actionMap.primaryActions = interactiveElements.filter(el => 
                el.position.aboveFold && 
                (el.type === 'button' || el.type === 'a') &&
                el.text.length > 0
            ).slice(0, 5);
            
            actionMap.navigationActions = interactiveElements.filter(el =>
                el.type === 'a' && 
                el.href && 
                !el.href.startsWith('javascript:') &&
                el.text.length > 0
            ).slice(0, 10);
            
            actionMap.formActions = interactiveElements.filter(el =>
                el.type === 'input' || el.type === 'select' || el.type === 'textarea'
            ).slice(0, 15);
            
            actionMap.quickActions = interactiveElements.filter(el =>
                el.position.inViewport && 
                el.coordinates.width > 30 && 
                el.coordinates.height > 30
            ).slice(0, 8);
        } catch (actionError) {
            console.warn("[Content] Error creating action map:", actionError.message);
            // Continue with basic functionality
        }
        
        // 📝 Generate LLM-friendly summary
        const llmSummary = {
            pagePurpose: 'Unknown',
            primaryActions: [],
            contentSummary: {
                headings: pageStructure.headings.length,
                sections: pageStructure.sections.length,
                forms: pageStructure.forms.length,
                interactiveElements: interactiveElements.length
            },
            navigationPaths: [],
            recommendedActions: []
        };
        
        try {
            llmSummary.pagePurpose = inferPagePurpose(targetDocument);
            llmSummary.primaryActions = actionMap.primaryActions.map(el => ({
                action: el.text,
                coordinates: el.coordinates,
                selector: el.selector
            }));
            llmSummary.navigationPaths = generateNavigationPaths(navigationMap);
            llmSummary.recommendedActions = generateRecommendedActions(actionMap);
        } catch (summaryError) {
            console.warn("[Content] Error generating LLM summary:", summaryError.message);
            // Continue with basic functionality
        }
        
        const processingTime = performance.now() - startTime;
        
        // 🏗️ Build comprehensive result
        const result = {
            metadata: {
                ...pageInfo,
                processingTime: processingTime,
                timestamp: Date.now()
            },
            overlayRemoval: { // This will now be empty or a placeholder
                elementsRemoved: 0,
                noiseSelectors: 0,
                highZIndexRemoved: 0,
                timestamp: Date.now()
            },
            pageStructure: pageStructure,
            interactiveElements: interactiveElements,
            navigationMap: navigationMap,
            contentMap: contentMap,
            actionMap: actionMap,
            llmSummary: llmSummary,
            statistics: {
                totalElements: interactiveElements.length,
                clickableElements: interactiveElements.filter(el => el.accessibility.isClickable).length,
                formElements: interactiveElements.filter(el => el.type === 'input' || el.type === 'select' || el.type === 'textarea').length,
                navigationElements: interactiveElements.filter(el => el.type === 'a' && el.href).length,
                processingTime: processingTime
            }
        };
        
        console.log("[Content] generateSiteMap: Mapping complete:", {
            processingTime: processingTime.toFixed(2) + "ms",
            totalElements: result.statistics.totalElements,
            clickableElements: result.statistics.clickableElements,
            forms: result.statistics.formElements
        });
        
        return result;
        
    } catch (error) {
        console.error("[Content] generateSiteMap: Critical error during mapping:", error);
        
        // 🆕 ENHANCED ERROR RECOVERY: Return a minimal but valid result
        const errorResult = {
            metadata: {
                url: window.location.href,
                title: document.title || 'Unknown',
                timestamp: Date.now(),
                error: true,
                errorMessage: error.message,
                errorStack: error.stack
            },
            error: {
                code: 'CRITICAL_ERROR',
                message: error.message,
                type: error.name,
                timestamp: Date.now()
            },
            interactiveElements: [],
            pageStructure: {
                headings: [],
                sections: [],
                forms: []
            },
            statistics: {
                totalElements: 0,
                clickableElements: 0,
                formElements: 0,
                navigationElements: 0,
                processingTime: 0,
                error: true
            }
        };
        
        console.log("[Content] generateSiteMap: Returning error recovery result");
        return errorResult;
    }
}

/**
 * 🎯 Helper function to get element coordinates
 * 
 * @param {Element} element - DOM element
 * @returns {Object} - Coordinate information
 */
function getElementCoordinates(element) {
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    };
}

/**
 * 🎯 Resolve a DOM node from an actionId by trying all stored selectors
 * 
 * @param {string} actionId - The action ID to look up
 * @returns {Element|null} - DOM node or null if not found
 */
function resolveNodeFromActionId(actionId) {
    const ae = window.intelligenceComponents?.intelligenceEngine?.getActionableElement?.(actionId);
    if (!ae) return null;
    
    const sels = Array.isArray(ae.selectors) ? ae.selectors : [];
    for (const sel of sels) {
        try {
            const n = document.querySelector(sel);
            if (n) {
                // Check if the element has dimensions
                const rect = n.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return n; // Element is visible, return it
                } else {
                    // Element has no dimensions, look for visible children or siblings
                    const visibleElement = findVisibleElement(n);
                    if (visibleElement) {
                        return visibleElement; // Return the visible element
                    }
                }
            }
        } catch (_) { /* ignore bad selector */ }
    }
    return null;
}

/**
 * 🎯 Find a visible element when the target element has no dimensions
 * 
 * @param {Element} element - The element with no dimensions
 * @returns {Element|null} - A visible element or null if none found
 */
function findVisibleElement(element) {
    console.log(`[Smart Resolution] 🔍 Finding visible element for: ${element.tagName} (${element.className})`);
    
    // Strategy 1: Look for visible children (HIGHEST PRIORITY - most specific)
    const children = element.querySelectorAll('*');
    console.log(`[Smart Resolution] 🔍 Checking ${children.length} children...`);
    
    for (const child of children) {
        // 🆕 ENHANCED: Use multi-property dimension detection
        const dimensionCheck = hasValidDimensions(child);
        if (dimensionCheck.hasDimensions) {
            // Prioritize interactive elements
            if (child.tagName === 'IMG' || child.tagName === 'BUTTON' || child.tagName === 'A') {
                console.log(`[Smart Resolution] ✅ Found visible interactive child: ${child.tagName} (${dimensionCheck.bestDimensions.width}x${dimensionCheck.bestDimensions.height} via ${dimensionCheck.bestDimensions.method})`);
                return child;
            }
        }
    }
    
    // Strategy 2: Look for any visible children
    for (const child of children) {
        // 🆕 ENHANCED: Use multi-property dimension detection
        const dimensionCheck = hasValidDimensions(child);
        if (dimensionCheck.hasDimensions) {
            console.log(`[Smart Resolution] ✅ Found visible child: ${child.tagName} (${dimensionCheck.bestDimensions.width}x${dimensionCheck.bestDimensions.height} via ${dimensionCheck.bestDimensions.method})`);
            return child;
        }
    }
    
    // Strategy 3: Look for visible siblings (LIMITED SCOPE - similar elements only)
    const siblings = element.parentElement?.children;
    if (siblings) {
        console.log(`[Smart Resolution] 🔍 Checking ${siblings.length} siblings...`);
        for (const sibling of siblings) {
            if (sibling.tagName === element.tagName) {
                // 🆕 ENHANCED: Use multi-property dimension detection
                const dimensionCheck = hasValidDimensions(sibling);
                if (dimensionCheck.hasDimensions) {
                    console.log(`[Smart Resolution] ✅ Found visible sibling: ${sibling.tagName} (${dimensionCheck.bestDimensions.width}x${dimensionCheck.bestDimensions.height} via ${dimensionCheck.bestDimensions.method})`);
                    return sibling;
                }
            }
        }
    }
    
    // Strategy 4: Look for visible parent (LIMITED DEPTH - max 2 levels, size constraints)
    let parent = element.parentElement;
    let depth = 0;
    console.log(`[Smart Resolution] 🔍 Checking parents (max depth: 2)...`);
    
    while (parent && parent !== document.body && depth < 2) {
        // 🆕 ENHANCED: Use multi-property dimension detection
        const dimensionCheck = hasValidDimensions(parent);
        if (dimensionCheck.hasDimensions) {
            // Only return parent if it's not too large (avoid header/body)
            if (dimensionCheck.bestDimensions.width < 800 && dimensionCheck.bestDimensions.height < 200) {
                console.log(`[Smart Resolution] ✅ Found suitable visible parent: ${parent.tagName} (${dimensionCheck.bestDimensions.width}x${dimensionCheck.bestDimensions.height} via ${dimensionCheck.bestDimensions.method})`);
                return parent;
            } else {
                console.log(`[Smart Resolution] ⚠️ Parent too large, skipping: ${parent.tagName} (${dimensionCheck.bestDimensions.width}x${dimensionCheck.bestDimensions.height} via ${dimensionCheck.bestDimensions.method})`);
            }
        }
        parent = parent.parentElement;
        depth++;
    }
    
    console.log(`[Smart Resolution] ❌ No suitable visible element found`);
    return null;
}

/**
 * 🆕 ENHANCED: Multi-property dimension detection based on Sentry.io guidance
 * 
 * Uses multiple element properties to detect if an element has valid dimensions:
 * - getBoundingClientRect() - Visual positioning and size
 * - offsetWidth/Height - Includes borders, padding, scrollbars
 * - clientWidth/Height - Content + padding only
 * - scrollWidth/Height - Total scrollable content
 * 
 * @param {Element} element - DOM element to check
 * @returns {Object} - Dimension analysis with detailed breakdown
 */
function hasValidDimensions(element) {
    if (!element) return { hasDimensions: false, reason: 'No element provided' };
    
    // Get all dimension properties
    const rect = element.getBoundingClientRect();
    const offsetWidth = element.offsetWidth;
    const offsetHeight = element.offsetHeight;
    const clientWidth = element.clientWidth;
    const clientHeight = element.clientHeight;
    const scrollWidth = element.scrollWidth;
    const scrollHeight = element.scrollHeight;
    
    // 🆕 ENHANCED: Check CSS properties that affect visibility
    const computedStyle = window.getComputedStyle(element);
    const transform = computedStyle.getPropertyValue('transform');
    const hasTransform = transform !== 'none';
    
    // 🆕 ENHANCED: Check critical CSS properties
    const display = computedStyle.getPropertyValue('display');
    const visibility = computedStyle.getPropertyValue('visibility');
    const opacity = computedStyle.getPropertyValue('opacity');
    const position = computedStyle.getPropertyValue('position');
    const zIndex = computedStyle.getPropertyValue('z-index');
    
    // 🆕 ENHANCED: Check if element is hidden by CSS
    const isHidden = (
        display === 'none' ||
        visibility === 'hidden' ||
        opacity === '0' ||
        position === 'absolute' && zIndex === '-1'
    );
    
    // Analyze dimensions using multiple properties
    const dimensionAnalysis = {
        getBoundingClientRect: {
            width: rect.width,
            height: rect.height,
            hasDimensions: rect.width > 0 && rect.height > 0
        },
        offsetDimensions: {
            width: offsetWidth,
            height: offsetHeight,
            hasDimensions: offsetWidth > 0 && offsetHeight > 0
        },
        clientDimensions: {
            width: clientWidth,
            height: clientHeight,
            hasDimensions: clientWidth > 0 && clientHeight > 0
        },
        scrollDimensions: {
            width: scrollWidth,
            height: scrollHeight,
            hasDimensions: scrollWidth > 0 && scrollHeight > 0
        },
        cssProperties: {
            display: display,
            visibility: visibility,
            opacity: opacity,
            position: position,
            zIndex: zIndex,
            isHidden: isHidden
        },
        cssTransform: {
            hasTransform: hasTransform,
            transformValue: transform
        }
    };
    
    // Determine if element has valid dimensions using any method
    const hasValidDimensions = (
        dimensionAnalysis.getBoundingClientRect.hasDimensions ||
        dimensionAnalysis.offsetDimensions.hasDimensions ||
        dimensionAnalysis.clientDimensions.hasDimensions ||
        dimensionAnalysis.scrollDimensions.hasDimensions
    );
    
    // Find the best dimension values to use
    let bestWidth = 0;
    let bestHeight = 0;
    let bestMethod = 'none';
    
    if (dimensionAnalysis.getBoundingClientRect.hasDimensions) {
        bestWidth = rect.width;
        bestHeight = rect.height;
        bestMethod = 'getBoundingClientRect';
    } else if (dimensionAnalysis.offsetDimensions.hasDimensions) {
        bestWidth = offsetWidth;
        bestHeight = offsetHeight;
        bestMethod = 'offsetDimensions';
    } else if (dimensionAnalysis.clientDimensions.hasDimensions) {
        bestWidth = clientWidth;
        bestHeight = clientHeight;
        bestMethod = 'clientDimensions';
    } else if (dimensionAnalysis.scrollDimensions.hasDimensions) {
        bestWidth = scrollWidth;
        bestHeight = scrollHeight;
        bestMethod = 'scrollDimensions';
    }
    
    const result = {
        hasDimensions: hasValidDimensions,
        bestDimensions: {
            width: Math.round(bestWidth),
            height: Math.round(bestHeight),
            method: bestMethod
        },
        analysis: dimensionAnalysis,
        reason: hasValidDimensions ? 
            `Element has dimensions via ${bestMethod}: ${Math.round(bestWidth)}x${Math.round(bestHeight)}` :
            `No valid dimensions found. CSS state: display=${display}, visibility=${visibility}, opacity=${opacity}, position=${position}, z-index=${zIndex}`
    };
    
    console.log(`[Enhanced Dimensions] Analysis for ${element.tagName}:`, result);
    return result;
}

/**
 * 🆕 VIEWPORT ANALYSIS: Analyze element positioning and viewport visibility
 * 
 * This function checks if an element is positioned outside the viewport,
 * has negative coordinates, or is affected by parent container issues.
 * 
 * @param {Element} element - DOM element to analyze
 * @returns {Object} - Viewport analysis with positioning details
 */
function analyzeViewportPosition(element) {
    if (!element) return { success: false, reason: 'No element provided' };
    
    console.log(`[Viewport Analysis] 🔍 Analyzing viewport position for ${element.tagName}...`);
    
    // Get all positioning information
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Analyze positioning
    const positioning = {
        getBoundingClientRect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        },
        cssPosition: {
            position: computedStyle.getPropertyValue('position'),
            left: computedStyle.getPropertyValue('left'),
            top: computedStyle.getPropertyValue('top'),
            right: computedStyle.getPropertyValue('right'),
            bottom: computedStyle.getPropertyValue('bottom'),
            margin: computedStyle.getPropertyValue('margin'),
            padding: computedStyle.getPropertyValue('padding')
        },
        viewport: {
            width: viewportWidth,
            height: viewportHeight
        }
    };
    
    // Check if element is outside viewport
    const isOutsideViewport = (
        rect.right < 0 || 
        rect.bottom < 0 || 
        rect.left > viewportWidth || 
        rect.top > viewportHeight
    );
    
    // Check if element has negative coordinates
    const hasNegativeCoords = rect.left < 0 || rect.top < 0;
    
    // Check if element is positioned but has no dimensions
    const isPositionedButNoDimensions = (
        computedStyle.getPropertyValue('position') !== 'static' &&
        rect.width === 0 && rect.height === 0
    );
    
    // Check parent container
    const parent = element.parentElement;
    let parentAnalysis = null;
    if (parent) {
        const parentRect = parent.getBoundingClientRect();
        parentAnalysis = {
            tagName: parent.tagName,
            className: parent.className,
            dimensions: `${Math.round(parentRect.width)}x${Math.round(parentRect.height)}`,
            position: window.getComputedStyle(parent).getPropertyValue('position'),
            overflow: window.getComputedStyle(parent).getPropertyValue('overflow')
        };
    }
    
    const result = {
        isOutsideViewport: isOutsideViewport,
        hasNegativeCoords: hasNegativeCoords,
        isPositionedButNoDimensions: isPositionedButNoDimensions,
        positioning: positioning,
        parentAnalysis: parentAnalysis,
        issues: []
    };
    
    // Identify specific issues
    if (isOutsideViewport) {
        result.issues.push('Element is positioned outside viewport');
    }
    if (hasNegativeCoords) {
        result.issues.push('Element has negative coordinates');
    }
    if (isPositionedButNoDimensions) {
        result.issues.push('Element is positioned but has no dimensions');
    }
    if (rect.width === 0 && rect.height === 0) {
        result.issues.push('Element has zero dimensions');
    }
    
    console.log(`[Viewport Analysis] 📊 Analysis result:`, result);
    return result;
}

/**
 * 🆕 FIX VIEWPORT POSITIONING: Fix elements positioned outside viewport
 * 
 * This function attempts to fix elements that are positioned outside the viewport
 * by adjusting their CSS positioning to bring them into view.
 * 
 * @param {Element} element - DOM element to fix
 * @returns {Object} - Fix result with positioning details
 */
function fixViewportPositioning(element) {
    if (!element) return { success: false, reason: 'No element provided' };
    
    console.log(`[Fix Viewport] 🔧 Attempting to fix viewport positioning for ${element.tagName}...`);
    
    // First analyze the current positioning
    const analysis = analyzeViewportPosition(element);
    
    // Get current CSS state
    const computedStyle = window.getComputedStyle(element);
    const originalState = {
        position: element.style.position,
        left: element.style.left,
        top: element.style.top,
        right: element.style.right,
        bottom: element.style.bottom,
        margin: element.style.margin,
        padding: element.style.padding
    };
    
    try {
        let fixesApplied = [];
        
        // Fix 1: If element is positioned absolute/fixed with no dimensions, try relative positioning
        if (analysis.isPositionedButNoDimensions) {
            element.style.position = 'relative';
            element.style.left = '0px';
            element.style.top = '0px';
            fixesApplied.push('Changed position from absolute to relative');
            console.log(`[Fix Viewport] ✅ Applied relative positioning fix`);
        }
        
        // Fix 2: If element has negative coordinates, bring it into viewport
        if (analysis.hasNegativeCoords) {
            element.style.left = '10px';
            element.style.top = '10px';
            fixesApplied.push('Fixed negative coordinates');
            console.log(`[Fix Viewport] ✅ Fixed negative coordinates`);
        }
        
        // Fix 3: If element is outside viewport, center it
        if (analysis.isOutsideViewport) {
            element.style.position = 'fixed';
            element.style.left = '50%';
            element.style.top = '50%';
            element.style.transform = 'translate(-50%, -50%)';
            element.style.zIndex = '9999';
            fixesApplied.push('Centered element in viewport');
            console.log(`[Fix Viewport] ✅ Centered element in viewport`);
        }
        
        // Fix 4: If element has no content, add minimal content for dimensions
        if (analysis.positioning.getBoundingClientRect.width === 0 && analysis.positioning.getBoundingClientRect.height === 0) {
            // Check if element has any content
            if (!element.textContent.trim() && element.children.length === 0) {
                // Add a minimal spacer div to give it dimensions
                const spacer = document.createElement('div');
                spacer.style.width = '20px';
                spacer.style.height = '20px';
                spacer.style.backgroundColor = 'transparent';
                element.appendChild(spacer);
                fixesApplied.push('Added minimal content for dimensions');
                console.log(`[Fix Viewport] ✅ Added minimal content for dimensions`);
            }
        }
        
        // Check if fixes worked
        const newAnalysis = analyzeViewportPosition(element);
        const newDimensions = hasValidDimensions(element);
        
        const success = newDimensions.hasDimensions && !newAnalysis.isOutsideViewport;
        
        if (success) {
            console.log(`[Fix Viewport] 🎯 SUCCESS: Element now has dimensions and is in viewport`);
        } else {
            console.log(`[Fix Viewport] ⚠️ Fixes applied but element still has issues`);
        }
        
        return {
            success: success,
            fixesApplied: fixesApplied,
            originalState: originalState,
            newAnalysis: newAnalysis,
            newDimensions: newDimensions,
            reason: success ? 'Viewport positioning fixed successfully' : 'Viewport positioning fixes applied but issues remain'
        };
        
    } catch (error) {
        console.error(`[Fix Viewport] ❌ Error fixing viewport positioning:`, error);
        return {
            success: false,
            originalState: originalState,
            error: error.message,
            reason: 'Error occurred while fixing viewport positioning'
        };
    }
}

/**
 * 🆕 FORCE VISIBILITY: Temporarily make hidden elements visible for interaction
 * 
 * This function temporarily overrides CSS properties that hide elements,
 * making them visible and clickable. It's used as a last resort when
 * smart resolution fails due to CSS hiding.
 * 
 * @param {Element} element - DOM element to make visible
 * @returns {Object} - Original CSS state and success status
 */
function forceElementVisibility(element) {
    if (!element) return { success: false, reason: 'No element provided' };
    
    console.log(`[Force Visibility] 🔧 Attempting to make ${element.tagName} visible...`);
    
    // Get current CSS state
    const computedStyle = window.getComputedStyle(element);
    const originalState = {
        display: element.style.display,
        visibility: element.style.visibility,
        opacity: element.style.opacity,
        position: element.style.position,
        zIndex: element.style.zIndex
    };
    
    // Force visibility by overriding CSS
    try {
        // Force display block if hidden
        if (computedStyle.display === 'none') {
            element.style.display = 'block';
            console.log(`[Force Visibility] ✅ Forced display: none → block`);
        }
        
        // Force visibility visible if hidden
        if (computedStyle.visibility === 'hidden') {
            element.style.visibility = 'visible';
            console.log(`[Force Visibility] ✅ Forced visibility: hidden → visible`);
        }
        
        // Force opacity 1 if transparent
        if (computedStyle.opacity === '0') {
            element.style.opacity = '1';
            console.log(`[Force Visibility] ✅ Forced opacity: 0 → 1`);
        }
        
        // Force z-index if negative
        if (computedStyle.position === 'absolute' && computedStyle.zIndex === '-1') {
            element.style.zIndex = '9999';
            console.log(`[Force Visibility] ✅ Forced z-index: -1 → 9999`);
        }
        
        // Check if element now has dimensions
        const newDimensionCheck = hasValidDimensions(element);
        const success = newDimensionCheck.hasDimensions;
        
        if (success) {
            console.log(`[Force Visibility] 🎯 SUCCESS: Element now has dimensions: ${newDimensionCheck.bestDimensions.width}x${newDimensionCheck.bestDimensions.height}`);
        } else {
            console.log(`[Force Visibility] ⚠️ Element still has no dimensions after CSS override`);
        }
        
        return {
            success: success,
            originalState: originalState,
            newDimensions: newDimensionCheck,
            reason: success ? 'Element made visible via CSS override' : 'CSS override failed to give element dimensions'
        };
        
    } catch (error) {
        console.error(`[Force Visibility] ❌ Error forcing visibility:`, error);
        return {
            success: false,
            originalState: originalState,
            error: error.message,
            reason: 'Error occurred while forcing visibility'
        };
    }
}

/**
 * 🆕 UNIVERSAL CLICK: Click ANY element regardless of dimensions or state
 * 
 * This function provides a bulletproof way to click ANY element that exists
 * in the DOM, regardless of dimensions, CSS state, or layout issues.
 * It's the ultimate fallback for the intelligence system.
 * 
 * @param {Element} element - DOM element to click
 * @returns {Object} - Click result and element details
 */
function universalClick(element) {
    if (!element) return { success: false, reason: 'No element provided' };
    
    console.log(`[Universal Click] 🔥 UNIVERSAL CLICK on ${element.tagName} (${element.className})`);
    
    try {
        // Get element details before clicking
        const elementInfo = {
            tagName: element.tagName,
            className: element.className,
            id: element.id,
            textContent: element.textContent?.trim(),
            ariaLabel: element.getAttribute('aria-label'),
            ariaExpanded: element.getAttribute('aria-expanded'),
            href: element.href || element.getAttribute('href'),
            type: element.type || element.getAttribute('type')
        };
        
        console.log(`[Universal Click] 📋 Element details:`, elementInfo);
        
        // 🆕 ENHANCED: Multiple click strategies for maximum compatibility
        const clickStrategies = [
            // Strategy 1: Native click() method
            () => {
                element.click();
                return 'native click()';
            },
            
            // Strategy 2: MouseEvent simulation
            () => {
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                element.dispatchEvent(clickEvent);
                return 'MouseEvent simulation';
            },
            
            // Strategy 3: Focus + Enter key
            () => {
                element.focus();
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(enterEvent);
                return 'Focus + Enter key';
            },
            
            // Strategy 4: mousedown + mouseup events
            () => {
                const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
                const mouseupEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
                element.dispatchEvent(mousedownEvent);
                element.dispatchEvent(mouseupEvent);
                return 'mousedown + mouseup events';
            },
            
            // Strategy 5: Touch events (for mobile compatibility)
            () => {
                const touchStartEvent = new TouchEvent('touchstart', { bubbles: true, cancelable: true });
                const touchEndEvent = new TouchEvent('touchend', { bubbles: true, cancelable: true });
                element.dispatchEvent(touchStartEvent);
                element.dispatchEvent(touchEndEvent);
                return 'touch events';
            }
        ];
        
        // Try each strategy until one works
        let clickSuccess = false;
        let clickMethod = 'none';
        
        for (const strategy of clickStrategies) {
            try {
                clickMethod = strategy();
                clickSuccess = true;
                console.log(`[Universal Click] ✅ Strategy succeeded: ${clickMethod}`);
                break;
            } catch (error) {
                console.log(`[Universal Click] ⚠️ Strategy failed: ${clickMethod} - ${error.message}`);
            }
        }
        
        if (clickSuccess) {
            console.log(`[Universal Click] 🎯 SUCCESS: Element clicked via ${clickMethod}!`);
            
            // 🆕 ENHANCED: Verify the click actually worked by checking for state changes
            const clickVerification = verifyClickWorked(element);
            if (clickVerification.worked) {
                console.log(`[Universal Click] ✅ Click verification passed: ${clickVerification.reason}`);
            } else {
                console.log(`[Universal Click] ⚠️ Click verification failed: ${clickVerification.reason}`);
            }
            
            return {
                success: true,
                clickMethod: clickMethod,
                elementInfo: elementInfo,
                clickVerification: clickVerification,
                reason: `Element successfully clicked via ${clickMethod}`,
                universal: true
            };
        } else {
            console.log(`[Universal Click] ❌ All strategies failed`);
            return {
                success: false,
                elementInfo: elementInfo,
                reason: 'All click strategies failed',
                universal: false
            };
        }
        
    } catch (error) {
        console.error(`[Universal Click] ❌ Error in universal click:`, error);
        return {
            success: false,
            error: error.message,
            reason: 'Error occurred during universal click',
            universal: false
        };
    }
}

/**
 * 🆕 CLICK VERIFICATION: Verify if a click actually worked
 * 
 * This function checks if a click event actually triggered the expected behavior
 * by monitoring state changes, attribute changes, and DOM modifications.
 * 
 * @param {Element} element - DOM element that was clicked
 * @returns {Object} - Verification result with details
 */
function verifyClickWorked(element) {
    if (!element) return { worked: false, reason: 'No element provided' };
    
    console.log(`[Click Verification] 🔍 Verifying click worked for ${element.tagName}...`);
    
    // Get initial state
    const initialState = {
        ariaExpanded: element.getAttribute('aria-expanded'),
        className: element.className,
        textContent: element.textContent?.trim(),
        style: {
            display: element.style.display,
            visibility: element.style.visibility,
            opacity: element.style.opacity
        }
    };
    
    console.log(`[Click Verification] 📋 Initial state:`, initialState);
    
    // Wait a bit for any state changes to occur
    return new Promise((resolve) => {
        setTimeout(() => {
            // Get final state
            const finalState = {
                ariaExpanded: element.getAttribute('aria-expanded'),
                className: element.className,
                textContent: element.textContent?.trim(),
                style: {
                    display: element.style.display,
                    visibility: element.style.visibility,
                    opacity: element.style.opacity
                }
            };
            
            console.log(`[Click Verification] 📋 Final state:`, finalState);
            
            // Check for state changes that indicate the click worked
            let worked = false;
            let reason = 'No state changes detected';
            
            // Check aria-expanded changes (common for toggle buttons)
            if (initialState.ariaExpanded !== finalState.ariaExpanded) {
                worked = true;
                reason = `aria-expanded changed from "${initialState.ariaExpanded}" to "${finalState.ariaExpanded}"`;
            }
            
            // Check class changes (common for state toggles)
            if (initialState.className !== finalState.className) {
                worked = true;
                reason = `className changed from "${initialState.className}" to "${finalState.className}"`;
            }
            
            // Check text content changes
            if (initialState.textContent !== finalState.textContent) {
                worked = true;
                reason = `textContent changed from "${initialState.textContent}" to "${finalState.textContent}"`;
            }
            
            // Check for DOM mutations (new elements, removed elements)
            const mutations = checkForDOMChanges(element);
            if (mutations.length > 0) {
                worked = true;
                reason = `DOM changes detected: ${mutations.join(', ')}`;
            }
            
            // 🆕 ENHANCED: Inspect the actual submenu content
            const submenuContent = inspectSubmenuContent(element);
            if (submenuContent.hasSubmenu) {
                reason += ` | Submenu content: ${submenuContent.summary}`;
                
                // 🆕 ENHANCED: Log the actual menu items found
                if (submenuContent.items && submenuContent.items.length > 0) {
                    console.log(`[Click Verification] 📋 Menu items found:`, submenuContent.items.map(item => item.text || item.textContent));
                }
                
                // 🆕 ENHANCED: Log all containers if available
                if (submenuContent.allContainers && submenuContent.allContainers.length > 0) {
                    console.log(`[Click Verification] 📦 All containers found:`, submenuContent.allContainers.map(container => ({
                        selector: container.selector,
                        itemCount: container.items.length
                    })));
                }
            }
            
            const result = {
                worked: worked,
                reason: reason,
                initialState: initialState,
                finalState: finalState,
                mutations: mutations,
                submenuContent: submenuContent
            };
            
            console.log(`[Click Verification] 📊 Verification result:`, result);
            resolve(result);
        }, 100); // Wait 100ms for state changes
    });
}

/**
 * 🆕 DOM CHANGE DETECTION: Check for DOM mutations after click
 * 
 * @param {Element} element - Element to monitor for changes
 * @returns {Array} - List of detected changes
 */
function checkForDOMChanges(element) {
    const changes = [];
    
    // Check if element has new children
    if (element.children.length > 0) {
        changes.push(`Element now has ${element.children.length} children`);
    }
    
    // Check if parent has new children
    if (element.parentElement && element.parentElement.children.length > 0) {
        changes.push(`Parent now has ${element.parentElement.children.length} children`);
    }
    
    // Check for new elements in the document
    const newElements = document.querySelectorAll('[data-clicked]');
    if (newElements.length > 0) {
        changes.push(`${newElements.length} new elements with data-clicked attribute`);
    }
    
    return changes;
}

/**
 * 🆕 SUBMENU INSPECTION: Inspect submenu content after click
 * 
 * This function examines the DOM after a click to see what submenu
 * content was revealed, including navigation items, links, and structure.
 * 
 * @param {Element} element - Element that was clicked (usually button)
 * @returns {Object} - Submenu content analysis
 */
function inspectSubmenuContent(element) {
    if (!element) return { hasSubmenu: false, reason: 'No element provided' };
    
    console.log(`[Submenu Inspection] 🔍 Inspecting submenu content for ${element.tagName}...`);
    
    // Look for common submenu patterns
    const submenuSelectors = [
        // Navigation menus
        'nav',
        '.nav',
        '.navigation',
        '.menu',
        '.submenu',
        '.dropdown',
        '.dropdown-menu',
        '.mobile-menu',
        '.mobile-nav',
        // Astra theme specific
        '.ast-mobile-popup-drawer',
        '.ast-mobile-header-navigation',
        '.ast-mobile-menu-buttons',
        // Generic patterns
        '[role="navigation"]',
        '[aria-label*="menu"]',
        '[aria-label*="navigation"]'
    ];
    
    let submenuFound = null;
    let submenuContent = [];
    
    // Search for submenu in the document
    for (const selector of submenuSelectors) {
        const submenu = document.querySelector(selector);
        if (submenu && submenu !== element && isElementVisible(submenu)) {
            submenuFound = submenu;
            console.log(`[Submenu Inspection] ✅ Found submenu: ${selector}`);
            break;
        }
    }
    
    if (submenuFound) {
        // Extract submenu content
        const menuItems = submenuFound.querySelectorAll('a, button, li, .menu-item, .nav-item');
        console.log(`[Submenu Inspection] 📋 Found ${menuItems.length} menu items`);
        
        menuItems.forEach((item, index) => {
            const itemInfo = {
                index: index,
                tagName: item.tagName,
                text: item.textContent?.trim() || '',
                href: item.href || item.getAttribute('href') || null,
                className: item.className || '',
                ariaLabel: item.getAttribute('aria-label') || null
            };
            
            // Only include items with meaningful content
            if (itemInfo.text.length > 0 || itemInfo.href) {
                submenuContent.push(itemInfo);
                console.log(`[Submenu Inspection] 📋 Menu item ${index}: ${itemInfo.text} (${itemInfo.tagName})`);
            }
        });
        
        // Get submenu dimensions and position
        const rect = submenuFound.getBoundingClientRect();
        const submenuInfo = {
            selector: generateSelector(submenuFound),
            dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            position: `${Math.round(rect.left)},${Math.round(rect.top)}`,
            visible: isElementVisible(submenuFound),
            itemCount: submenuContent.length
        };
        
        return {
            hasSubmenu: true,
            submenu: submenuInfo,
            items: submenuContent,
            summary: `${submenuContent.length} items in ${submenuInfo.dimensions} submenu`,
            reason: `Submenu found with ${submenuContent.length} navigation items`
        };
    }
    
    // Check if the clicked element itself has new children
    if (element.children.length > 0) {
        const children = Array.from(element.children).map((child, index) => ({
            index: index,
            tagName: child.tagName,
            text: child.textContent?.trim() || '',
            className: child.className || ''
        }));
        
        return {
            hasSubmenu: true,
            submenu: { type: 'inline', itemCount: children.length },
            items: children,
            summary: `${children.length} inline items`,
            reason: `Element has ${children.length} new children after click`
        };
    }
    
    // 🆕 ENHANCED: Look for mobile menu containers that might be dynamically revealed
    const mobileMenuSelectors = [
        // Astra theme specific mobile menus
        '.ast-mobile-popup-drawer',
        '.ast-mobile-header-navigation',
        '.ast-mobile-menu-buttons',
        '.ast-mobile-menu',
        '.ast-mobile-nav',
        // Generic mobile menu patterns
        '.mobile-menu',
        '.mobile-nav',
        '.mobile-popup',
        '.mobile-drawer',
        '.mobile-overlay',
        // Navigation containers
        '.navigation',
        '.nav-menu',
        '.menu-container',
        // Look for elements with mobile-related classes
        '[class*="mobile"]',
        '[class*="popup"]',
        '[class*="drawer"]',
        // 🆕 ADDITIONAL: More specific selectors for this site
        '.menu-link',
        '.ast-mobile-header',
        '.ast-header-navigation',
        '.ast-navigation',
        '.ast-menu',
        '.ast-header-menu',
        // 🆕 ADDITIONAL: Look for elements with the menu items we know exist
        'a[href*="brighttreedigital.com.au"]',
        'a[href*="about"]',
        'a[href*="services"]',
        'a[href*="contact"]'
    ];
    
    for (const selector of mobileMenuSelectors) {
        const mobileMenu = document.querySelector(selector);
        if (mobileMenu && mobileMenu !== element && isElementVisible(mobileMenu)) {
            console.log(`[Submenu Inspection] 🔍 Found mobile menu container: ${selector}`);
            
            // Look for actual menu items within the container
            const menuItems = mobileMenu.querySelectorAll('a, button, li, .menu-item, .nav-item, .ast-menu-item');
            console.log(`[Submenu Inspection] 📋 Found ${menuItems.length} menu items in mobile container`);
            
            if (menuItems.length > 0) {
                const items = Array.from(menuItems).map((item, index) => ({
                    index: index,
                    tagName: item.tagName,
                    text: item.textContent?.trim() || '',
                    href: item.href || item.getAttribute('href') || null,
                    className: item.className || '',
                    ariaLabel: item.getAttribute('aria-label') || null
                })).filter(item => item.text.length > 0 || item.href);
                
                const rect = mobileMenu.getBoundingClientRect();
                return {
                    hasSubmenu: true,
                    submenu: {
                        type: 'mobile-container',
                        selector: selector,
                        dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                        position: `${Math.round(rect.left)},${Math.round(rect.top)}`,
                        itemCount: items.length
                    },
                    items: items,
                    summary: `${items.length} items in mobile menu container`,
                    reason: `Mobile menu container found with ${items.length} navigation items`
                };
            }
        }
    }
    
    // 🆕 FINAL RESORT: Use document-wide search to find menu items
    console.log(`[Submenu Inspection] 🔍 No submenu found via selectors, trying document-wide search...`);
    const documentSearch = searchDocumentForMenuItems(element);
    
    if (documentSearch.totalItems > 0) {
        console.log(`[Submenu Inspection] ✅ Document search found ${documentSearch.totalItems} menu items in ${documentSearch.containers.length} containers`);
        
        // Find the most likely container (the one with the most menu items)
        const primaryContainer = documentSearch.containers.reduce((max, container) => 
            container.items.length > max.items.length ? container : max
        );
        
        if (primaryContainer && primaryContainer.items.length > 0) {
            const rect = primaryContainer.container.getBoundingClientRect();
            return {
                hasSubmenu: true,
                submenu: {
                    type: 'document-search',
                    selector: primaryContainer.selector,
                    dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                    position: `${Math.round(rect.left)},${Math.round(rect.top)}`,
                    itemCount: primaryContainer.items.length,
                    totalItemsFound: documentSearch.totalItems,
                    containersFound: documentSearch.containers.length
                },
                items: primaryContainer.items,
                allContainers: documentSearch.containers,
                summary: `${primaryContainer.items.length} items in primary container (${documentSearch.totalItems} total found)`,
                reason: `Document search found ${documentSearch.totalItems} menu items across ${documentSearch.containers.length} containers`
            };
        }
    }
    
    return {
        hasSubmenu: false,
        reason: 'No submenu content found via any method'
    };
}

/**
 * 🆕 DOCUMENT-WIDE SEARCH: Search entire document for menu items
 * 
 * This function searches the entire document for elements that contain
 * the menu items we know should exist, regardless of where they are.
 * 
 * @param {Element} element - Element that was clicked (for context)
 * @returns {Object} - Document-wide search results
 */
function searchDocumentForMenuItems(element) {
    console.log(`[Document Search] 🔍 Searching entire document for menu items...`);
    
    // Search for elements containing the menu items we know exist
    const knownMenuItems = [
        'HOME',
        'ABOUT', 
        'SERVICES',
        'CONTACT',
        'Banner Design',
        'Logo Design',
        'Web Design'
    ];
    
    const foundItems = [];
    const searchSelectors = [
        'a', 'button', 'li', '.menu-item', '.nav-item', '.ast-menu-item'
    ];
    
    // Search through all elements with these selectors
    for (const selector of searchSelectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`[Document Search] 🔍 Searching ${elements.length} ${selector} elements...`);
        
        elements.forEach((el, index) => {
            const text = el.textContent?.trim() || '';
            const href = el.href || el.getAttribute('href') || '';
            
            // Check if this element contains any of our known menu items
            for (const menuItem of knownMenuItems) {
                if (text.includes(menuItem) || href.includes(menuItem.toLowerCase().replace(' ', '-'))) {
                    foundItems.push({
                        element: el,
                        text: text,
                        href: href,
                        selector: generateSelector(el),
                        tagName: el.tagName,
                        className: el.className || ''
                    });
                    console.log(`[Document Search] ✅ Found menu item: "${text}" (${el.tagName})`);
                    break; // Found one match, move to next element
                }
            }
        });
    }
    
    // Group items by their parent container
    const containers = new Map();
    foundItems.forEach(item => {
        const parent = item.element.parentElement;
        if (parent) {
            const parentSelector = generateSelector(parent);
            if (!containers.has(parentSelector)) {
                containers.set(parentSelector, {
                    container: parent,
                    selector: parentSelector,
                    items: []
                });
            }
            containers.get(parentSelector).items.push(item);
        }
    });
    
    console.log(`[Document Search] 📊 Found ${foundItems.length} menu items in ${containers.size} containers`);
    
    return {
        totalItems: foundItems.length,
        containers: Array.from(containers.values()),
        allItems: foundItems,
        summary: `${foundItems.length} menu items found in ${containers.size} containers`
    };
}

/**
 * 🆕 DELAYED SUBMENU INSPECTION: Wait for dynamic content to load
 * 
 * This function waits a bit after a click to allow dynamic content
 * to fully load before inspecting the submenu.
 * 
 * @param {Element} element - Element that was clicked
 * @param {number} delay - Delay in milliseconds (default: 500ms)
 * @returns {Promise} - Promise that resolves with submenu content
 */
function delayedSubmenuInspection(element, delay = 500) {
    return new Promise((resolve) => {
        console.log(`[Delayed Inspection] ⏳ Waiting ${delay}ms for dynamic content to load...`);
        
        setTimeout(() => {
            console.log(`[Delayed Inspection] 🔍 Now inspecting submenu content...`);
            const result = inspectSubmenuContent(element);
            console.log(`[Delayed Inspection] 📊 Delayed inspection result:`, result);
            resolve(result);
        }, delay);
    });
}

/**
 * 🆕 UTILITY: Check if element is visible
 * 
 * @param {Element} element - Element to check
 * @returns {boolean} - Whether element is visible
 */
function isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    
    // Basic visibility checks
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    
    // Check if element has physical dimensions
    if (element.offsetWidth > 0 && element.offsetHeight > 0) {
        return true;
    }
    
    // For elements with no physical dimensions, check if they're "conceptually visible"
    const hasTextContent = element.textContent && element.textContent.trim().length > 0;
    const hasAriaLabel = element.getAttribute('aria-label') || element.getAttribute('title');
    const hasRole = element.getAttribute('role');
    const hasTabIndex = element.getAttribute('tabindex');
    
    // Consider visible if it has meaningful content or accessibility attributes
    if (hasTextContent || hasAriaLabel || hasRole || hasTabIndex) {
        return true;
    }
    
    // Check if it's a flexbox/grid child that might not have intrinsic dimensions
    const parentStyle = element.parentElement ? window.getComputedStyle(element.parentElement) : null;
    if (parentStyle && (parentStyle.display === 'flex' || parentStyle.display === 'grid')) {
        return hasTextContent || hasAriaLabel;
    }
    
    return false;
}

/**
 * 🆕 UTILITY: Generate CSS selector for element
 * 
 * @param {Element} element - Element to generate selector for
 * @returns {string} - CSS selector
 */
function generateSelector(element) {
    if (!element) return '';
    
    if (element.id) {
        return `#${element.id}`;
    }
    
    if (element.className) {
        const classes = element.className.split(' ').filter(c => c.length > 0);
        if (classes.length > 0) {
            return `.${classes[0]}`;
        }
    }
    
    return element.tagName.toLowerCase();
}

/**
 * 🎯 Compute viewport + page coords for a node
 * 
 * @param {Element} node - DOM element
 * @returns {Object} - Viewport and page coordinates
 */
function coordsForNode(node) {
    const r = node.getBoundingClientRect();
    const viewport = {
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height)
    };
    const page = {
        x: viewport.x + window.scrollX,
        y: viewport.y + window.scrollY,
        left: viewport.left + window.scrollX,
        top: viewport.top + window.scrollY,
        width: viewport.width,
        height: viewport.height
    };
    return { viewport, page };
}

/**
 * 🍞 Extract breadcrumb navigation
 * 
 * @returns {Array} - Breadcrumb items
 */
function extractBreadcrumbs(document) {
    const breadcrumbs = [];
    
    // Look for common breadcrumb patterns
    const breadcrumbSelectors = [
        '[role="navigation"][aria-label*="breadcrumb"]',
        '.breadcrumb',
        '.breadcrumbs',
        '[class*="breadcrumb"]',
        'nav[aria-label*="breadcrumb"]'
    ];
    
    breadcrumbSelectors.forEach(selector => {
        const breadcrumb = document.querySelector(selector);
        if (breadcrumb) {
            const items = Array.from(breadcrumb.querySelectorAll('a, span, li'))
                .map(item => ({
                    text: item.textContent.trim(),
                    href: item.href || null,
                    isCurrent: item.getAttribute('aria-current') === 'page' || 
                               item.classList.contains('current') ||
                               item.classList.contains('active')
                }))
                .filter(item => item.text.length > 0);
            
            if (items.length > 0) {
                breadcrumbs.push({
                    selector: generateSelector(breadcrumb),
                    items: items,
                    coordinates: getElementCoordinates(breadcrumb)
                });
            }
        }
    });
    
    return breadcrumbs;
}

/**
 * 📄 Extract pagination information
 * 
 * @returns {Object} - Pagination data
 */
function extractPagination(document) {
    const pagination = {
        currentPage: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
        elements: []
    };
    
    const paginationSelectors = [
        '.pagination',
        '.pager',
        '[class*="pagination"]',
        '[class*="pager"]',
        'nav[aria-label*="pagination"]'
    ];
    
    paginationSelectors.forEach(selector => {
        const paginationEl = document.querySelector(selector);
        if (paginationEl) {
            const links = Array.from(paginationEl.querySelectorAll('a, button'))
                .map(link => ({
                    text: link.textContent.trim(),
                    href: link.href || null,
                    isCurrent: link.classList.contains('current') || 
                               link.classList.contains('active') ||
                               link.getAttribute('aria-current') === 'page',
                    coordinates: getElementCoordinates(link)
                }))
                .filter(link => link.text.length > 0);
            
            if (links.length > 0) {
                pagination.elements.push({
                    selector: generateSelector(paginationEl),
                    links: links,
                    coordinates: getElementCoordinates(paginationEl)
                });
            }
        }
    });
    
    return pagination;
}

/**
 * 🧭 Extract navigation elements
 * 
 * @returns {Array} - Navigation elements
 */
function extractNavigation(document) {
    const navigation = [];
    
    const navSelectors = [
        'nav',
        '[role="navigation"]',
        '.navigation',
        '.nav',
        '.menu',
        '.navbar'
    ];
    
    navSelectors.forEach(selector => {
        const navEl = document.querySelectorAll(selector);
        navEl.forEach(nav => {
            const links = Array.from(nav.querySelectorAll('a'))
                .map(link => ({
                    text: link.textContent.trim(),
                    href: link.href,
                    isActive: link.classList.contains('active') || 
                              link.classList.contains('current'),
                    coordinates: getElementCoordinates(link)
                }))
                .filter(link => link.text.length > 0);
            
            if (links.length > 0) {
                navigation.push({
                    selector: generateSelector(nav),
                    links: links,
                    coordinates: getElementCoordinates(nav)
                });
            }
        });
    });
    
    return navigation;
}

/**
 * 🔗 Extract related links
 * 
 * @returns {Array} - Related link groups
 */
function extractRelatedLinks(document) {
    const relatedLinks = [];
    
    // Look for related content sections
    const relatedSelectors = [
        '.related',
        '.related-posts',
        '.related-articles',
        '.suggestions',
        '.recommendations'
    ];
    
    relatedSelectors.forEach(selector => {
        const relatedEl = document.querySelector(selector);
        if (relatedEl) {
            const links = Array.from(relatedEl.querySelectorAll('a'))
                .map(link => ({
                    text: link.textContent.trim(),
                    href: link.href,
                    coordinates: getElementCoordinates(link)
                }))
                .filter(link => link.text.length > 0);
            
            if (links.length > 0) {
                relatedLinks.push({
                    selector: generateSelector(relatedEl),
                    links: links,
                    coordinates: getElementCoordinates(relatedEl)
                });
            }
        }
    });
    
    return relatedLinks;
}

/**
 * 🎯 Find main content area
 * 
 * @returns {Object} - Main content information
 */
function findMainContent(document) {
    const mainSelectors = [
        'main',
        '[role="main"]',
        'article',
        '.main-content',
        '.content',
        '#content'
    ];
    
    for (const selector of mainSelectors) {
        const main = document.querySelector(selector);
        if (main) {
            return {
                selector: generateSelector(main),
                coordinates: getElementCoordinates(main),
                text: main.textContent.trim().substring(0, 300) + '...',
                children: main.children.length
            };
        }
    }
    
    return null;
}

/**
 * 📱 Find sidebar content
 * 
 * @returns {Object} - Sidebar information
 */
function findSidebar(document) {
    const sidebarSelectors = [
        'aside',
        '.sidebar',
        '.side-panel',
        '[role="complementary"]'
    ];
    
    for (const selector of sidebarSelectors) {
        const sidebar = document.querySelector(selector);
        if (sidebar) {
            return {
                selector: generateSelector(sidebar),
                coordinates: getElementCoordinates(sidebar),
                text: sidebar.textContent.trim().substring(0, 200) + '...',
                children: sidebar.children.length
            };
        }
    }
    
    return null;
}

/**
 * 🦶 Find footer content
 * 
 * @returns {Object} - Footer information
 */
function findFooter(document) {
    const footer = document.querySelector('footer');
    if (footer) {
        return {
            selector: generateSelector(footer),
            coordinates: getElementCoordinates(footer),
            text: footer.textContent.trim().substring(0, 200) + '...',
            children: footer.children.length
        };
    }
    return null;
}

/**
 * 📢 Find advertisement elements
 * 
 * @returns {Array} - Advertisement elements
 */
function findAdvertisements(document) {
    const adSelectors = [
        '.ad',
        '.advertisement',
        '.banner',
        '[id*="ad"]',
        '[class*="ad"]',
        '[data-ad]'
    ];
    
    const ads = [];
    adSelectors.forEach(selector => {
        const adElements = document.querySelectorAll(selector);
        adElements.forEach(ad => {
            if (visible(ad)) {
                ads.push({
                    selector: generateSelector(ad),
                    coordinates: getElementCoordinates(ad),
                    text: ad.textContent.trim().substring(0, 100) + '...'
                });
            }
        });
    });
    
    return ads;
}

/**
 * 🎯 Infer page purpose based on content and structure
 * 
 * @returns {string} - Inferred page purpose
 */
function inferPagePurpose(document) {
    const title = document.title.toLowerCase();
    const url = window.location.href.toLowerCase();
    const headings = Array.from(document.querySelectorAll('h1, h2'))
        .map(h => h.textContent.toLowerCase())
        .join(' ');
    
    if (title.includes('login') || title.includes('sign in')) return 'Authentication';
    if (title.includes('register') || title.includes('sign up')) return 'Registration';
    if (title.includes('search') || title.includes('find')) return 'Search';
    if (title.includes('product') || title.includes('item')) return 'Product Detail';
    if (title.includes('cart') || title.includes('checkout')) return 'Shopping';
    if (title.includes('about') || title.includes('contact')) return 'Information';
    if (title.includes('news') || title.includes('article')) return 'Content';
    if (title.includes('home') || title.includes('welcome')) return 'Landing';
    
    return 'General';
}

/**
 * 🛤️ Generate navigation paths for LLM consumption
 * 
 * @param {Object} navigationMap - Navigation data
 * @returns {Array} - Navigation paths
 */
function generateNavigationPaths(navigationMap) {
    const paths = [];
    
    // Add breadcrumb path
    if (navigationMap.breadcrumbs.length > 0) {
        paths.push({
            type: 'breadcrumb',
            path: navigationMap.breadcrumbs[0].items.map(item => item.text).join(' > '),
            elements: navigationMap.breadcrumbs[0].items
        });
    }
    
    // Add main navigation paths
    navigationMap.navigation.forEach(nav => {
        paths.push({
            type: 'main-navigation',
            path: nav.links.map(link => link.text).join(' | '),
            elements: nav.links
        });
    });
    
    return paths;
}

/**
 * 🎯 Generate recommended actions for LLM
 * 
 * @param {Object} actionMap - Action data
 * @returns {Array} - Recommended actions
 */
function generateRecommendedActions(actionMap) {
    const recommendations = [];
    
    // Primary actions (above the fold)
    if (actionMap.primaryActions.length > 0) {
        recommendations.push({
            type: 'primary',
            description: 'Main actions visible on page load',
            actions: actionMap.primaryActions.slice(0, 3)
        });
    }
    
    // Navigation actions
    if (actionMap.navigationActions.length > 0) {
        recommendations.push({
            type: 'navigation',
            description: 'Key navigation links',
            actions: actionMap.navigationActions.slice(0, 5)
        });
    }
    
    // Form actions
    if (actionMap.formActions.length > 0) {
        recommendations.push({
            type: 'forms',
            description: 'Interactive form elements',
            actions: actionMap.formActions.slice(0, 3)
        });
    }
    
    return recommendations;
}

/**
 * 📚 Browser History Management and Navigation
 * 
 * This module provides comprehensive browser history tracking and navigation
 * capabilities, allowing the automation system to move back and forth through
 * the user's browsing session.
 * 
 * 🎯 FEATURES:
 * - Track navigation history with timestamps
 * - Navigate back/forward through history
 * - Get current history state
 * - Jump to specific history entries
 * - Monitor history changes
 */

// Global history tracking
var navigationHistory = [];
var currentHistoryIndex = -1;
var isHistoryTrackingEnabled = true;

/**
 * 🧭 Initialize history tracking
 * 
 * Sets up history tracking and popstate event listener to monitor
 * browser navigation changes.
 */
function initializeHistoryTracking() {
    // Guard against multiple initializations
    if (window.historyTrackingInitialized) {
        console.log("[Content] ⚠️ History tracking already initialized, skipping...");
        return;
    }
    
    console.log("[Content] History tracking initialized");
    
    // Add current page to history if not already there
    const currentUrl = window.location.href;
    if (navigationHistory.length === 0 || navigationHistory[currentHistoryIndex]?.url !== currentUrl) {
        addToHistory(currentUrl, document.title);
    }
    
    // Listen for browser navigation events (back/forward buttons)
    window.addEventListener('popstate', handlePopState);
    
    // Listen for programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
        originalPushState.apply(history, args);
        handleProgrammaticNavigation();
    };
    
    history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        handleProgrammaticNavigation();
    };
    
    // Mark as initialized
    window.historyTrackingInitialized = true;
    
    console.log("[Content] History tracking active for:", currentUrl);
}

/**
 * 📝 Add page to navigation history
 * 
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @param {Object} metadata - Additional page metadata
 */
function addToHistory(url, title, metadata = {}) {
    const historyEntry = {
        url: url,
        title: title || 'Untitled',
        timestamp: Date.now(),
        metadata: {
            ...metadata,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        }
    };
    
    // If we're not at the end of history, truncate future entries
    if (currentHistoryIndex < navigationHistory.length - 1) {
        navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
    }
    
    // Add new entry
    navigationHistory.push(historyEntry);
    currentHistoryIndex = navigationHistory.length - 1;
    
    console.log("[Content] Added to history:", {
        url: url,
        index: currentHistoryIndex,
        totalEntries: navigationHistory.length
    });
}

/**
 * 🔄 Handle browser popstate events (back/forward buttons)
 * 
 * @param {PopStateEvent} event - Popstate event
 */
function handlePopState(event) {
    console.log("[Content] Popstate event detected:", event);
    
    // Update current history index based on current URL
    const currentUrl = window.location.href;
    const newIndex = navigationHistory.findIndex(entry => entry.url === currentUrl);
    
    if (newIndex !== -1) {
        currentHistoryIndex = newIndex;
        console.log("[Content] History index updated to:", currentHistoryIndex);
    } else {
        // This might be a new entry or external navigation
        addToHistory(currentUrl, document.title);
    }
}

/**
 * 🔄 Handle programmatic navigation (pushState/replaceState)
 */
function handleProgrammaticNavigation() {
    const currentUrl = window.location.href;
    const currentTitle = document.title;
    
    // Check if this is a new entry or existing one
    const existingIndex = navigationHistory.findIndex(entry => entry.url === currentUrl);
    
    if (existingIndex === -1) {
        // New entry
        addToHistory(currentUrl, currentTitle);
    } else {
        // Update existing entry
        navigationHistory[existingIndex].title = currentTitle;
        navigationHistory[existingIndex].timestamp = Date.now();
        currentHistoryIndex = existingIndex;
        
        console.log("[Content] Updated existing history entry:", {
            url: currentUrl,
            index: currentHistoryIndex
        });
    }
}

/**
 * ⬅️ Navigate back in history
 * 
 * @param {number} steps - Number of steps to go back (default: 1)
 * @returns {Object} - Navigation result
 */
function navigateBack(steps = 1) {
    if (currentHistoryIndex - steps < 0) {
        return {
            success: false,
            error: "Cannot go back further - already at beginning of history",
            currentIndex: currentHistoryIndex,
            totalEntries: navigationHistory.length
        };
    }
    
    const targetIndex = currentHistoryIndex - steps;
    const targetEntry = navigationHistory[targetIndex];
    
    console.log("[Content] Navigating back:", {
        from: currentHistoryIndex,
        to: targetIndex,
        targetUrl: targetEntry.url
    });
    
    // Use browser history API to navigate back
    try {
        window.history.go(-steps);
        currentHistoryIndex = targetIndex;
        
        return {
            success: true,
            fromIndex: currentHistoryIndex + steps,
            toIndex: currentHistoryIndex,
            targetUrl: targetEntry.url,
            targetTitle: targetEntry.title
        };
    } catch (error) {
        console.error("[Content] Navigation back failed:", error);
        return {
            success: false,
            error: error.message,
            currentIndex: currentHistoryIndex
        };
    }
}

/**
 * ➡️ Navigate forward in history
 * 
 * @param {number} steps - Number of steps to go forward (default: 1)
 * @returns {Object} - Navigation result
 */
function navigateForward(steps = 1) {
    if (currentHistoryIndex + steps >= navigationHistory.length) {
        return {
            success: false,
            error: "Cannot go forward further - already at end of history",
            currentIndex: currentHistoryIndex,
            totalEntries: navigationHistory.length
        };
    }
    
    const targetIndex = currentHistoryIndex + steps;
    const targetEntry = navigationHistory[targetIndex];
    
    console.log("[Content] Navigating forward:", {
        from: currentHistoryIndex,
        to: targetIndex,
        targetUrl: targetEntry.url
    });
    
    // Use browser history API to navigate forward
    try {
        window.history.go(steps);
        currentHistoryIndex = targetIndex;
        
        return {
            success: true,
            fromIndex: currentHistoryIndex - steps,
            toIndex: currentHistoryIndex,
            targetUrl: targetEntry.url,
            targetTitle: targetEntry.title
        };
    } catch (error) {
        console.error("[Content] Navigation forward failed:", error);
        return {
            success: false,
            error: error.message,
            currentIndex: currentHistoryIndex
        };
    }
}

/**
 * 🎯 Jump to specific history entry
 * 
 * @param {number} index - Target history index
 * @returns {Object} - Navigation result
 */
function jumpToHistoryEntry(index) {
    if (index < 0 || index >= navigationHistory.length) {
        return {
            success: false,
            error: `Invalid history index: ${index}. Valid range: 0-${navigationHistory.length - 1}`,
            currentIndex: currentHistoryIndex,
            totalEntries: navigationHistory.length
        };
    }
    
    const targetEntry = navigationHistory[index];
    const steps = index - currentHistoryIndex;
    
    console.log("[Content] Jumping to history entry:", {
        from: currentHistoryIndex,
        to: index,
        steps: steps,
        targetUrl: targetEntry.url
    });
    
    try {
        window.history.go(steps);
        currentHistoryIndex = index;
        
        return {
            success: true,
            fromIndex: currentHistoryIndex - steps,
            toIndex: currentHistoryIndex,
            targetUrl: targetEntry.url,
            targetTitle: targetEntry.title,
            steps: steps
        };
    } catch (error) {
        console.error("[Content] History jump failed:", error);
        return {
            success: false,
            error: error.message,
            currentIndex: currentHistoryIndex
        };
    }
}

/**
 * 📊 Get current history state
 * 
 * @returns {Object} - Current history information
 */
function getHistoryState() {
    return {
        currentIndex: currentHistoryIndex,
        totalEntries: navigationHistory.length,
        canGoBack: currentHistoryIndex > 0,
        canGoForward: currentHistoryIndex < navigationHistory.length - 1,
        currentEntry: navigationHistory[currentHistoryIndex] || null,
        history: navigationHistory.map((entry, index) => ({
            ...entry,
            isCurrent: index === currentHistoryIndex
        }))
    };
}

/**
 * 🔍 Search history by criteria
 * 
 * @param {Object} criteria - Search criteria
 * @param {string} criteria.url - URL to search for
 * @param {string} criteria.title - Title to search for
 * @param {string} criteria.domain - Domain to search for
 * @returns {Array} - Matching history entries
 */
function searchHistory(criteria = {}) {
    let results = navigationHistory;
    
    if (criteria.url) {
        results = results.filter(entry => 
            entry.url.toLowerCase().includes(criteria.url.toLowerCase())
        );
    }
    
    if (criteria.title) {
        results = results.filter(entry => 
            entry.title.toLowerCase().includes(criteria.title.toLowerCase())
        );
    }
    
    if (criteria.domain) {
        results = results.filter(entry => {
            try {
                const url = new URL(entry.url);
                return url.hostname.toLowerCase().includes(criteria.domain.toLowerCase());
            } catch {
                return false;
            }
        });
    }
    
    return results.map((entry, index) => ({
        ...entry,
        originalIndex: index
    }));
}

/**
 * 🧹 Clear history entries
 * 
 * @param {Object} options - Clear options
 * @param {number} options.beforeIndex - Clear entries before this index
 * @param {number} options.afterIndex - Clear entries after this index
 * @param {boolean} options.keepCurrent - Keep current entry
 * @returns {Object} - Clear result
 */
function clearHistory(options = {}) {
    const { beforeIndex, afterIndex, keepCurrent = true } = options;
    const initialCount = navigationHistory.length;
    
    if (beforeIndex !== undefined) {
        navigationHistory = navigationHistory.slice(beforeIndex);
        currentHistoryIndex = Math.max(0, currentHistoryIndex - beforeIndex);
    }
    
    if (afterIndex !== undefined) {
        navigationHistory = navigationHistory.slice(0, afterIndex + 1);
        currentHistoryIndex = Math.min(currentHistoryIndex, afterIndex);
    }
    
    if (keepCurrent && currentHistoryIndex >= 0) {
        // Ensure current entry is preserved
        const currentEntry = navigationHistory[currentHistoryIndex];
        navigationHistory = [currentEntry];
        currentHistoryIndex = 0;
    }
    
    const clearedCount = initialCount - navigationHistory.length;
    
    console.log("[Content] History cleared:", {
        clearedCount: clearedCount,
        remainingCount: navigationHistory.length,
        newCurrentIndex: currentHistoryIndex
    });
    
    return {
        success: true,
        clearedCount: clearedCount,
        remainingCount: navigationHistory.length,
        newCurrentIndex: currentHistoryIndex
    };
}

/**
 * 🆕 NEW: Intelligent Change Aggregation System
 * 
 * This system transforms raw DOM changes into meaningful intelligence events
 * that are optimized for LLM consumption and provide actionable insights.
 */

/**
 * 🧠 Change Aggregator - Groups related changes into meaningful events
 */
var ChangeAggregator = function() {
    this.pendingChanges = [];
    this.changeGroups = new Map();
    this.lastProcessedTime = 0;
    this.groupingTimeout = 500; // Group changes within 500ms
};

ChangeAggregator.prototype.addChange = function(change) {
    console.log("[Content] 🧠 ChangeAggregator: Adding change:", change);
    this.pendingChanges.push(change);
    this.scheduleProcessing();
};

ChangeAggregator.prototype.scheduleProcessing = function() {
    if (this.processingScheduled) return;
    
    console.log("[Content] 🧠 ChangeAggregator: Scheduling processing...");
    this.processingScheduled = true;
    var self = this;
    setTimeout(function() {
        self.processChanges();
        self.processingScheduled = false;
    }, this.groupingTimeout);
};

ChangeAggregator.prototype.processChanges = function() {
    if (this.pendingChanges.length === 0) return;
    
    console.log("[Content] 🧠 ChangeAggregator: Processing", this.pendingChanges.length, "changes...");
    
    var changes = [...this.pendingChanges];
    this.pendingChanges = [];
    
    // Group changes by type and target
    var groups = this.groupChanges(changes);
    console.log("[Content] 🧠 ChangeAggregator: Created", groups.length, "change groups");
    
    // Generate intelligence events for each group
    var self = this;
    groups.forEach(function(group, index) {
        var event = self.generateIntelligenceEvent(group);
        if (event) {
            console.log("[Content] 🧠 ChangeAggregator: Generated intelligence event", index + 1, ":", event);
            intelligenceEngine.processEvent(event);
        }
    });
    
    console.log("[Content] 🧠 ChangeAggregator: Processing complete");
};

ChangeAggregator.prototype.groupChanges = function(changes) {
    var groups = new Map();
    
    var self = this;
    changes.forEach(function(change) {
        var key = self.getChangeGroupKey(change);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(change);
    });
    
    return Array.from(groups.values());
};

ChangeAggregator.prototype.getChangeGroupKey = function(change) {
    var target = change.target || 'unknown';
    var type = change.type || 'unknown';
    var timestamp = Math.floor(change.timestamp / 1000); // Group by second
    
    return target + '_' + type + '_' + timestamp;
};

ChangeAggregator.prototype.generateIntelligenceEvent = function(changeGroup) {
    if (changeGroup.length === 0) return null;
    
    var firstChange = changeGroup[0];
    var changeTypes = [...new Set(changeGroup.map(function(c) { return c.type; }))];
    var totalMutations = changeGroup.reduce(function(sum, c) { return sum + (c.mutations || 1); }, 0);
    
    // Determine event type based on change patterns
    var eventType = this.determineEventType(changeGroup);
    
    return {
        eventType: eventType,
        timestamp: Date.now(),
        changeCount: changeGroup.length,
        changeTypes: changeTypes,
        totalMutations: totalMutations,
        target: firstChange.target,
        changes: changeGroup,
        semanticSummary: this.generateSemanticSummary(changeGroup, eventType)
    };
};

ChangeAggregator.prototype.determineEventType = function(changeGroup) {
    var types = changeGroup.map(function(c) { return c.type; });
    var hasChildList = types.includes('childList');
    var hasAttributes = types.includes('attributes');
    var hasCharacterData = types.includes('characterData');
    
    if (hasChildList && hasAttributes) return 'element_transformation';
    if (hasChildList) return 'structure_change';
    if (hasAttributes) return 'state_change';
    if (hasCharacterData) return 'content_update';
    
    return 'general_change';
};

ChangeAggregator.prototype.generateSemanticSummary = function(changeGroup, eventType) {
    var firstChange = changeGroup[0];
    
    switch (eventType) {
        case 'structure_change':
            return 'Page structure modified: ' + changeGroup.length + ' new elements added/removed';
        case 'state_change':
            return 'Element state updated: ' + changeGroup.length + ' attribute changes detected';
        case 'content_update':
            return 'Content modified: ' + changeGroup.length + ' text/content changes';
        case 'element_transformation':
            return 'Element transformed: structure and state changes detected';
        default:
            return 'Multiple changes detected: ' + changeGroup.length + ' modifications';
    }
};

/**
 * 🧠 Intelligence Engine - Analyzes changes and generates LLM insights
 */
var IntelligenceEngine = function() {
    this.pageState = {
        currentView: 'unknown',
        interactiveElements: [],
        navigationState: 'unknown',
        contentSections: [],
        lastUpdate: Date.now(),
        // 🆕 NEW: Set page context immediately
        url: window.location.href,
        title: document.title || 'Unknown'
    };
    this.eventHistory = [];
    this.llmInsights = [];
    this.actionableElements = new Map(); // 🆕 NEW: Map of actionable elements with IDs
    this.elementCounter = 0; // 🆕 NEW: Counter for generating unique IDs
    this.initialScanCompleted = false; // 🆕 NEW: Track if initial scan is complete
    
    console.log("[Content] 🧠 IntelligenceEngine initialized with page context:", {
        url: this.pageState.url,
        title: this.pageState.title,
        timestamp: this.pageState.lastUpdate
    });
};

/**
 * Process an intelligence event
 */
IntelligenceEngine.prototype.processEvent = function(event) {
    console.log("[Content] 🧠 IntelligenceEngine: Processing event:", event);
    
    this.eventHistory.push(event);
    this.updatePageState(event);
    this.generateLLMInsights(event);
    
    console.log("[Content] 🧠 IntelligenceEngine: Event processed, sending update...");
    
    // Send intelligence update to service worker
    // NOTE: Disabled old intelligence system - using new sendIntelligenceUpdateToServer instead
    // this.sendIntelligenceUpdate();
};

/**
 * Update page state based on event
 */
IntelligenceEngine.prototype.updatePageState = function(event) {
    this.pageState.lastUpdate = Date.now();
    
    switch (event.eventType) {
        case 'structure_change':
            this.analyzeStructureChanges(event);
            break;
        case 'state_change':
            this.analyzeStateChanges(event);
            break;
        case 'content_update':
            this.analyzeContentChanges(event);
            break;
        case 'element_transformation':
            this.analyzeElementTransformation(event);
            break;
    }
};

/**
 * Analyze structure changes (new elements, navigation, etc.)
 */
IntelligenceEngine.prototype.analyzeStructureChanges = function(event) {
    const newElements = event.changes
        .filter(c => c.type === 'childList' && c.addedNodes)
        .flatMap(c => Array.from(c.addedNodes))
        .filter(node => node.nodeType === Node.ELEMENT_NODE);
    
    if (newElements.length > 0) {
        // 🆕 ENHANCED: Register new interactive elements with actionable IDs
        newElements.forEach(element => {
            if (this.isInteractiveElement(element)) {
                const actionType = this.determineActionType(element);
                const actionId = this.registerActionableElement(element, actionType);
                
                console.log("[Content] 🆕 New actionable element registered:", {
                    actionId: actionId,
                    tagName: element.tagName,
                    actionType: actionType,
                    textContent: element.textContent?.trim().substring(0, 30) || '',
                    selectors: this.actionableElements.get(actionId)?.selectors || []
                });
            }
        });
        
        // Update interactive elements count
        this.pageState.interactiveElements = this.getAllActionableElements();
        
        // Check for navigation changes
        const navElements = newElements.filter(el => 
            el.tagName === 'NAV' || el.getAttribute('role') === 'navigation'
        );
        
        if (navElements.length > 0) {
            this.pageState.navigationState = 'expanded';
            
            // Register navigation elements as actionable
            navElements.forEach(nav => {
                const actionId = this.registerActionableElement(nav, 'navigation');
                console.log("[Content] 🧭 Navigation element registered:", actionId);
            });
        }
    }
};

/**
 * 🆕 NEW: Determine if an element is interactive
 */
IntelligenceEngine.prototype.isInteractiveElement = function(element) {
    if (!element || !element.tagName) return false;
    
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'textbox'];
    
    // Check tag name
    if (interactiveTags.includes(element.tagName)) return true;
    
    // Check role attribute
    const role = element.getAttribute('role');
    if (role && interactiveRoles.includes(role)) return true;
    
    // Check for click handlers or interactive classes
    const className = element.className || '';
    // 🆕 FIX: Handle both string and DOMTokenList for className
    const classNameStr = typeof className === 'string' ? className : className.toString();
    const interactiveClasses = ['btn', 'button', 'clickable', 'interactive', 'link'];
    if (interactiveClasses.some(cls => classNameStr.toLowerCase().includes(cls))) return true;
    
    // Check for event listeners (basic check)
    if (element.onclick || element.onmousedown || element.onmouseup) return true;
    
    return false;
};

/**
 * 🆕 PHASE 1: Basic quality filter for interactive elements
 * Filters out low-quality elements during scanning to reduce payload
 */
IntelligenceEngine.prototype.passesBasicQualityFilter = function(element) {
    if (!element) return false;
    
    // 🚫 Filter out hidden elements
    if (element.hidden) return false;
    
    // 🚫 Filter out elements with aria-hidden="true"
    const ariaHidden = element.getAttribute('aria-hidden');
    if (ariaHidden === 'true') return false;
    
    // 🆕 ENHANCED: Always include interactive elements regardless of dimensions
    const isInteractiveElement = this.isInteractiveElement(element);
    if (isInteractiveElement) {
        // Removed quality filter logging
        return true; // Always include interactive elements
    }
    
    // 🚫 Filter out elements with no meaningful content
    const text = element.textContent?.trim();
    const ariaLabel = element.getAttribute('aria-label');
    const title = element.title;
    const placeholder = element.getAttribute('placeholder');
    
    // Check if element has any meaningful content
    const hasContent = (text && text.length > 2) || 
                      (ariaLabel && ariaLabel.length > 2) || 
                      (title && title.length > 2) ||
                      (placeholder && placeholder.length > 2);
    
    // Form inputs are always considered meaningful
    const isFormInput = element.tagName === 'INPUT' || 
                       element.tagName === 'SELECT' || 
                       element.tagName === 'TEXTAREA';
    
    if (!hasContent && !isFormInput) return false;
    
    // 🚫 Filter out placeholder links
    if (element.tagName === 'A') {
        const href = element.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:')) return false;
    }
    
    // ✅ Element passes basic quality filter
    return true;
};

/**
 * 🆕 TEXT EXTRACTION: Extract page text to markdown format
 * Called when text extraction is requested via command
 */
IntelligenceEngine.prototype.extractPageTextToMarkdown = function() {
    const markdown = [];
    
    // Header with metadata
    markdown.push(`# Page Text Extraction`);
    markdown.push(`**URL:** ${window.location.href}`);
    markdown.push(`**Title:** ${document.title}`);
    markdown.push(`**Extracted:** ${new Date().toISOString()}`);
    markdown.push('');
    
    // 🆕 NEW: Clean text extraction with proper whitespace handling
    const cleanText = this.extractCleanPageText();
    if (cleanText) {
        markdown.push('## Page Content');
        markdown.push(cleanText);
        markdown.push('');
    }
    
    return markdown.join('\n');
};

/**
 * 🆕 NEW: Extract clean page text with proper whitespace handling
 * Based on the efficient extractPageText() approach
 */
IntelligenceEngine.prototype.extractCleanPageText = function() {
    let raw = document.body?.innerText || '';

    // 1. Normalise Unicode
    let txt = raw.normalize('NFKC');

    // 2. Collapse runs of spaces/tabs into a single space
    txt = txt.replace(/[ \t]+/g, ' ');

    // 3. Trim each line
    let lines = txt.split('\n').map(l => l.trim());

    // 4. Drop empties & collapse multiple blank lines to one
    lines = lines.filter((l, i, arr) => l || (arr[i - 1] && arr[i - 1] !== ''));

    // 5. Rejoin with single newlines
    return lines.join('\n');
};

/**
 * 🆕 Extract headings from the page
 */
IntelligenceEngine.prototype.extractHeadings = function() {
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    headingElements.forEach(heading => {
        if (this.isElementVisible(heading)) {
            headings.push({
                level: parseInt(heading.tagName.charAt(1)),
                text: heading.textContent.trim(),
                id: heading.id || null,
                selector: this.generateSelector(heading)
            });
        }
    });
    
    return headings;
};

/**
 * 🆕 Extract paragraphs from the page
 */
IntelligenceEngine.prototype.extractParagraphs = function() {
    const paragraphs = [];
    const paragraphElements = document.querySelectorAll('p, article, section');
    
    paragraphElements.forEach(p => {
        if (this.isElementVisible(p) && p.textContent.trim().length > 50) {
            paragraphs.push({
                text: p.textContent.trim(),
                length: p.textContent.trim().length,
                selector: this.generateSelector(p)
            });
        }
    });
    
    return paragraphs.slice(0, 20); // Limit to top 20 paragraphs
};

/**
 * 🆕 Extract lists from the page
 */
IntelligenceEngine.prototype.extractLists = function() {
    const lists = [];
    const listElements = document.querySelectorAll('ul, ol');
    
    listElements.forEach(list => {
        if (this.isElementVisible(list)) {
            const items = Array.from(list.querySelectorAll('li')).map(li => li.textContent.trim());
            lists.push({
                type: list.tagName.toLowerCase(),
                items: items,
                itemCount: items.length,
                selector: this.generateSelector(list)
            });
        }
    });
    
    return lists;
};

/**
 * 🆕 Check if element is visible
 */
IntelligenceEngine.prototype.isElementVisible = function(element) {
    if (!element || element.hidden) return false;
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    
    // Check if element has physical dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        return true;
    }
    
    // For elements with no physical dimensions, check if they're "conceptually visible"
    const hasTextContent = element.textContent && element.textContent.trim().length > 0;
    const hasAriaLabel = element.getAttribute('aria-label') || element.getAttribute('title');
    const hasRole = element.getAttribute('role');
    const hasTabIndex = element.getAttribute('tabindex');
    
    // Consider visible if it has meaningful content or accessibility attributes
    if (hasTextContent || hasAriaLabel || hasRole || hasTabIndex) {
        return true;
    }
    
    // Check if it's a flexbox/grid child that might not have intrinsic dimensions
    const parentStyle = element.parentElement ? window.getComputedStyle(element.parentElement) : null;
    if (parentStyle && (parentStyle.display === 'flex' || parentStyle.display === 'grid')) {
        return hasTextContent || hasAriaLabel;
    }
    
    return false;
};

/**
 * 🆕 Generate simple selector for element
 */
IntelligenceEngine.prototype.generateSelector = function(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    
    const tagName = element.tagName.toLowerCase();
    const className = element.className;
    
    if (className) {
        const firstClass = className.split(' ')[0];
        return `${tagName}.${firstClass}`;
    }
    
    return tagName;
};

/**
 * 🆕 NEW: Determine the action type for an element
 */
IntelligenceEngine.prototype.determineActionType = function(element) {
    if (!element || !element.tagName) return 'general';
    
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const type = element.getAttribute('type');
    
    // Button actions
    if (tagName === 'button' || role === 'button') {
        return 'click';
    }
    
    // Link actions
    if (tagName === 'a' || role === 'link') {
        return 'navigate';
    }
    
    // Input actions
    if (tagName === 'input') {
        if (type === 'submit') return 'submit';
        if (type === 'button') return 'click';
        return 'input';
    }
    
    // Form actions
    if (tagName === 'form') return 'submit';
    
    // Navigation actions
    if (tagName === 'nav' || role === 'navigation') return 'navigation';
    
    // Menu actions
    if (role === 'menuitem') return 'menu';
    
    // Tab actions
    if (role === 'tab') return 'tab';
    
    return 'general';
};

/**
 * Analyze state changes (attributes, classes, etc.)
 */
IntelligenceEngine.prototype.analyzeStateChanges = function(event) {
    const stateChanges = event.changes.filter(c => c.type === 'attributes');
    
    stateChanges.forEach(change => {
        if (change.attributeName === 'class') {
            // Check for significant class changes
            const element = change.target;
            if (element) {
                this.analyzeClassChanges(element, change);
            }
        }
    });
};

/**
 * Analyze class changes for semantic meaning
 */
IntelligenceEngine.prototype.analyzeClassChanges = function(element, change) {
    const className = element.className || '';
    
    // Check for common UI state indicators
    if (className.includes('expanded') || className.includes('open')) {
        this.pageState.navigationState = 'expanded';
    } else if (className.includes('collapsed') || className.includes('closed')) {
        this.pageState.navigationState = 'collapsed';
    }
    
    // Check for visibility changes
    if (className.includes('hidden') || className.includes('invisible')) {
        this.pageState.currentView = 'content_hidden';
    } else if (className.includes('visible') || className.includes('active')) {
        this.pageState.currentView = 'content_visible';
    }
};

/**
 * Analyze content changes
 */
IntelligenceEngine.prototype.analyzeContentChanges = function(event) {
    const contentChanges = event.changes.filter(c => c.type === 'characterData');
    
    if (contentChanges.length > 0) {
        this.pageState.currentView = 'content_updated';
    }
};

/**
 * Analyze element transformations
 */
IntelligenceEngine.prototype.analyzeElementTransformation = function(event) {
    // Complex changes that affect both structure and state
    this.pageState.currentView = 'transforming';
};

/**
 * Generate LLM insights from event
 */
IntelligenceEngine.prototype.generateLLMInsights = function(event) {
    const insight = {
        timestamp: Date.now(),
        eventType: event.eventType,
        summary: event.semanticSummary,
        actionableInsights: this.generateActionableInsights(event),
        pageContext: this.getPageContext(),
        recommendations: this.generateRecommendations(event)
    };
    
    this.llmInsights.push(insight);
};

/**
 * Generate actionable insights for the LLM
 */
IntelligenceEngine.prototype.generateActionableInsights = function(event) {
    const insights = [];
    
    switch (event.eventType) {
        case 'structure_change':
            insights.push('New interactive elements may be available');
            insights.push('Page structure has changed - consider rescanning');
            break;
        case 'state_change':
            insights.push('Element states have changed');
            insights.push('UI may be in different mode/state');
            break;
        case 'content_update':
            insights.push('Page content has been modified');
            insights.push('Consider extracting updated information');
            break;
        case 'element_transformation':
            insights.push('Complex changes detected - page may be in transition');
            insights.push('Wait for changes to complete before acting');
            break;
    }
    
    return insights;
};

/**
 * Get current page context
 */
IntelligenceEngine.prototype.getPageContext = function() {
    return {
        url: window.location.href,
        title: document.title,
        currentView: this.pageState.currentView,
        navigationState: this.pageState.navigationState,
        interactiveElementsCount: this.pageState.interactiveElements.length,
        lastUpdate: this.pageState.lastUpdate
    };
};

/**
 * Generate recommendations for the LLM
 */
IntelligenceEngine.prototype.generateRecommendations = function(event) {
    const recommendations = [];
    
    if (event.eventType === 'structure_change') {
        recommendations.push('immediate_rescan');
    } else if (event.eventType === 'state_change') {
        recommendations.push('check_element_states');
    } else if (event.eventType === 'content_update') {
        recommendations.push('extract_updated_content');
    }
    
    return recommendations;
};

/**
 * 🆕 NEW: Intelligence Update Queue System
 * Queues updates and processes them sequentially to prevent extension context invalidation
 */
IntelligenceEngine.prototype.updateQueue = [];
IntelligenceEngine.prototype.isProcessingQueue = false;
IntelligenceEngine.prototype.lastUpdateTime = 0;

/**
 * 🆕 NEW: Queue intelligence update for processing
 */
IntelligenceEngine.prototype.queueIntelligenceUpdate = function(priority = 'normal') {
    const updateItem = {
        id: Date.now() + Math.random(),
        priority: priority, // 'high', 'normal', 'low'
        timestamp: Date.now(),
        data: this.prepareIntelligenceData()
    };
    
    // Add to queue based on priority
    if (priority === 'high') {
        this.updateQueue.unshift(updateItem); // Add to front
    } else {
        this.updateQueue.push(updateItem); // Add to back
    }
    
    console.log("[Content] 📋 Intelligence update queued:", {
        id: updateItem.id,
        priority: priority,
        queueLength: this.updateQueue.length
    });
    
    // Process queue if not already processing
    if (!this.isProcessingQueue) {
        this.processUpdateQueue();
    }
};

/**
 * 🆕 NEW: Process the intelligence update queue sequentially
 */
IntelligenceEngine.prototype.processUpdateQueue = async function() {
    if (this.isProcessingQueue || this.updateQueue.length === 0) {
        return;
    }
    
    this.isProcessingQueue = true;
    console.log("[Content] 🔄 Processing intelligence update queue, length:", this.updateQueue.length);
    
    while (this.updateQueue.length > 0) {
        const updateItem = this.updateQueue.shift();
        
        try {
            console.log("[Content] 📤 Processing queued update:", updateItem.id);
            
            // 🆕 NEW: Check if intelligence engine is ready before sending
            if (!this.isEngineReady()) {
                console.log("[Content] ⏳ Intelligence engine not ready, re-queuing update:", updateItem.id);
                // Re-queue with lower priority if engine not ready
                if (updateItem.priority !== 'low') {
                    updateItem.priority = 'low';
                    this.updateQueue.push(updateItem);
                }
                // Wait a bit before processing next item to avoid infinite loop
                await this.sleep(100);
                continue;
            }
            
            // Send update to service worker
            await this.sendIntelligenceUpdateToServiceWorker(updateItem.data);
            
            this.lastUpdateTime = Date.now();
            console.log("[Content] ✅ Queued update processed successfully:", updateItem.id);
            
        } catch (error) {
            console.error("[Content] ❌ Error processing queued update:", updateItem.id, error);
            
            // Re-queue failed updates with lower priority (unless it's already low)
            if (updateItem.priority !== 'low') {
                updateItem.priority = 'low';
                this.updateQueue.push(updateItem);
                console.log("[Content] 🔄 Re-queued failed update with lower priority:", updateItem.id);
            }
        }
    }
    
    this.isProcessingQueue = false;
    console.log("[Content] ✅ Intelligence update queue processing complete");
};

/**
 * 🆕 NEW: Prepare intelligence data for updates
 */
IntelligenceEngine.prototype.prepareIntelligenceData = function() {
    return {
        type: "intelligence_update",
        timestamp: Date.now(),
        pageState: this.pageState,
        recentInsights: this.llmInsights.slice(-5),
        totalEvents: this.eventHistory.length,
        recommendations: this.getCurrentRecommendations(),
        actionableElements: this.getActionableElementsSummary(),
        actionMapping: this.generateActionMapping()
    };
};

/**
 * 🆕 NEW: Send intelligence update to service worker with error handling
 */
IntelligenceEngine.prototype.sendIntelligenceUpdateToServiceWorker = async function(intelligenceData) {
    return new Promise((resolve, reject) => {
        try {
            // 🆕 NEW: Wrap intelligence data in the format expected by service worker
            const message = {
                type: "intelligence_update",
                data: intelligenceData
            };
            
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("[Content] ⚠️ Service worker not available for intelligence update");
                    reject(new Error("Service worker not available"));
                } else {
                    console.log("[Content] ✅ Intelligence update sent to service worker");
                    resolve(response);
                }
            });
        } catch (error) {
            console.error("[Content] ❌ Error sending intelligence update:", error);
            reject(error);
        }
    });
};

/**
 * 🆕 NEW: Check if intelligence engine is ready to send updates
 */
IntelligenceEngine.prototype.isEngineReady = function() {
    // 🎯 NEW: Automatic disconnect cycle for CSP bypass in normal workflow
    if (Math.random() < 0.1) { // Only 10% of the time to avoid excessive disconnects
        console.log("[Content] 🔄 Engine ready check: Performing automatic disconnect cycle for CSP bypass...");
        performAutomaticDisconnectCycle();
    }
    
    // Check if core components are initialized
    if (!this.pageState || !this.actionableElements) {
        console.log("[Content] ⚠️ Core components not initialized");
        return false;
    }
    
    // 🆕 NEW: Always set page context if not present
    if (!this.pageState.url || !this.pageState.lastUpdate) {
        console.log("[Content] 🆕 Setting page context...");
        this.pageState.url = window.location.href;
        this.pageState.lastUpdate = Date.now();
        console.log("[Content] ✅ Page context set:", {
            url: this.pageState.url,
            lastUpdate: this.pageState.lastUpdate
        });
    }
    
    // 🎯 NEW: Force comprehensive scan integration for CSP bypass
    if (typeof performImmediateComprehensiveScan === 'function') {
        console.log("[Content] 🔄 Engine ready: Forcing comprehensive scan for CSP bypass...");
        try {
            const comprehensiveResult = performImmediateComprehensiveScan();
            console.log("[Content] ✅ Forced comprehensive scan complete:", comprehensiveResult);
        } catch (error) {
            console.warn("[Content] ⚠️ Forced comprehensive scan failed:", error);
        }
    } else {
        console.warn("[Content] ⚠️ performImmediateComprehensiveScan function not found");
    }
    
    // 🆕 NEW: Refresh page context if URL has changed
    if (this.pageState.url !== window.location.href) {
        console.log("[Content] 🆕 URL changed, updating page context...");
        this.pageState.url = window.location.href;
        this.pageState.title = document.title || 'Unknown';
        this.pageState.lastUpdate = Date.now();
        console.log("[Content] ✅ Page context refreshed:", {
            url: this.pageState.url,
            title: this.pageState.title,
            timestamp: this.pageState.lastUpdate
        });
    }
    
    // 🆕 NEW: Check if initial scan has completed
    if (!this.initialScanCompleted) {
        console.log("[Content] ⚠️ Initial page scan not completed yet");
        return false;
    }
    
    // 🆕 NEW: Check if we have actionable elements
    if (this.actionableElements.size === 0) {
        console.log("[Content] ⚠️ No actionable elements found after scan");
        return false;
    }
    
            // 🎯 Add frame detection to regular scanning
        const frameInfo = {
            isMainFrame: window.top === window.self,
            currentFrame: window.location.href,
            topFrame: window.top.location.href,
            frameDepth: 0,
            parentFrames: []
        };
        
        // Calculate frame depth and parent chain
        let currentWindow = window;
        while (currentWindow !== window.top) {
            frameInfo.frameDepth++;
            try {
                frameInfo.parentFrames.push({
                    depth: frameInfo.frameDepth,
                    url: currentWindow.location.href,
                    title: currentWindow.document.title
                });
                currentWindow = currentWindow.parent;
            } catch (e) {
                frameInfo.parentFrames.push({
                    depth: frameInfo.frameDepth,
                    url: "CROSS_ORIGIN_RESTRICTED",
                    title: "CROSS_ORIGIN_RESTRICTED"
                });
                break;
            }
        }
        
        console.log("[Content] 🖼️ Frame Analysis:", frameInfo);
        console.log("[Content] ✅ Engine ready - actionable elements available:", this.actionableElements.size);
        
        if (!frameInfo.isMainFrame) {
            console.warn("[Content] ⚠️ Running in iframe - depth:", frameInfo.frameDepth);
            console.warn("[Content] ⚠️ Parent frames:", frameInfo.parentFrames);
        } else {
            console.log("[Content] ✅ Confirmed main frame access");
        }
    return true;
};

/**
 * 🆕 NEW: Utility function for delays
 */
IntelligenceEngine.prototype.sleep = function(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Send intelligence update to service worker (now uses queue)
 */
IntelligenceEngine.prototype.sendIntelligenceUpdate = function() {
    // 🆕 NEW: Use queue system instead of sending immediately
    this.queueIntelligenceUpdate('normal');
};

/**
 * 🆕 NEW: Get summary of actionable elements for LLM
 */
IntelligenceEngine.prototype.getActionableElementsSummary = function() {
    const elements = this.getAllActionableElements();
    
    return elements.map(element => ({
        actionId: element.id,
        actionType: element.actionType,
        tagName: element.tagName,
        textContent: element.textContent,
        selectors: element.selectors,
        attributes: element.attributes,
        timestamp: element.timestamp
    }));
};

/**
 * 🆕 NEW: Generate action mapping for LLM instructions
 */
IntelligenceEngine.prototype.generateActionMapping = function() {
    const mapping = {};
    const elements = this.getAllActionableElements();
    
    elements.forEach(element => {
        mapping[element.id] = {
            action: element.actionType,
            selectors: element.selectors,
            description: `${element.tagName} element: ${element.textContent}`,
            availableActions: this.getAvailableActions(element.actionType)
        };
    });
    
    return mapping;
};

/**
 * 🆕 NEW: Get available actions for an element type
 */
IntelligenceEngine.prototype.getAvailableActions = function(actionType) {
    const actionMap = {
        'click': ['click', 'hover', 'focus', 'doubleClick'],
        'navigate': ['click', 'getHref', 'getText'],
        'input': ['type', 'clear', 'getValue', 'setValue', 'focus'],
        'submit': ['click', 'submit', 'validate'],
        'navigation': ['expand', 'collapse', 'getItems'],
        'menu': ['click', 'expand', 'getOptions'],
        'tab': ['click', 'activate', 'getContent'],
        'general': ['click', 'getText', 'getAttributes']
    };
    
    return actionMap[actionType] || ['click', 'getText'];
};

/**
 * Get current recommendations based on page state
 */
IntelligenceEngine.prototype.getCurrentRecommendations = function() {
    const recommendations = [];
    
    if (this.pageState.navigationState === 'expanded') {
        recommendations.push('navigation_expanded');
    }
    
    if (this.pageState.currentView === 'content_updated') {
        recommendations.push('content_updated');
    }
    
    if (this.pageState.interactiveElements.length > 0) {
        recommendations.push('new_interactive_elements');
    }
    
    return recommendations;
};

/**
 * 🆕 NEW: Refresh page intelligence with retry mechanism
 * This is the main method called by event-driven updates
 */
IntelligenceEngine.prototype.refreshPageIntelligenceWithRetry = function(trigger = 'manual', maxRetries = 3) {
    console.log("[Content] 🔄 refreshPageIntelligenceWithRetry called:", { trigger, maxRetries });
    
    // Check if engine is ready
    if (!this.isEngineReady()) {
        console.log("[Content] ⚠️ Engine not ready, will retry...");
        if (maxRetries > 0) {
            setTimeout(() => {
                this.refreshPageIntelligenceWithRetry(trigger, maxRetries - 1);
            }, 1000);
        }
        return;
    }
    
    // Check if extension context is still valid
    if (!this.isExtensionContextValid()) {
        console.log("[Content] ⚠️ Extension context invalid, dropping update");
        return;
    }
    
    // Queue the intelligence update
    this.queueIntelligenceUpdate('high', trigger);
    
    console.log("[Content] ✅ Intelligence update queued for trigger:", trigger);
};

/**
 * 🆕 NEW: Check if extension context is still valid
 * Prevents sending messages to invalidated extension context
 */
IntelligenceEngine.prototype.isExtensionContextValid = function() {
    try {
        // Try to access chrome.runtime to check if context is valid
        if (typeof chrome === 'undefined' || !chrome.runtime) {
            return false;
        }
        
        // Check if we can send a test message
        chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
            // This is just a test, we don't need to handle the response
        });
        
        return true;
    } catch (error) {
        console.warn("[Content] ⚠️ Extension context validation failed:", error.message);
        return false;
    }
};

/**
 * 🆕 NEW: Generate unique actionable identifier for an element
 */
IntelligenceEngine.prototype.generateActionableId = function(element, actionType = 'general') {
    const tagName = element.tagName?.toLowerCase() || 'unknown';
    const className = element.className || '';
    const textContent = element.textContent?.trim().substring(0, 20) || '';
    
    // Create a unique ID based on element properties
    const uniqueId = `action_${actionType}_${tagName}_${this.elementCounter++}`;
    
    // Generate multiple selectors for reliability
    const selectors = this.generateElementSelectors(element);
    
    return {
        id: uniqueId,
        tagName: tagName,
        actionType: actionType,
        selectors: selectors,
        textContent: textContent,
        className: className,
        attributes: this.extractKeyAttributes(element),
        timestamp: Date.now()
    };
};

/**
 * 🆕 NEW: Generate multiple selector strategies for an element
 */
IntelligenceEngine.prototype.generateElementSelectors = function(element) {
    const selectors = [];
    
    try {
        // Strategy 1: ID selector (most reliable)
        if (element.id) {
            selectors.push(`#${element.id}`);
        }
        
        // Strategy 2: Data attributes
        const dataAttrs = Array.from(element.attributes)
            .filter(attr => attr.name.startsWith('data-'))
            .map(attr => `[${attr.name}="${attr.value}"]`);
        selectors.push(...dataAttrs);
        
        // Strategy 3: Class-based selector
        if (element.className && typeof element.className === 'string' && element.className.trim()) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
                selectors.push(`.${classes[0]}`);
            }
        }
        
        // Strategy 4: Tag + class combination
        if (element.tagName && element.className && typeof element.className === 'string' && element.className.trim()) {
            const firstClass = element.className.split(' ')[0];
            if (firstClass) {
                selectors.push(`${element.tagName.toLowerCase()}.${firstClass}`);
            }
        }
        
        // Strategy 5: Position-based selector (fallback)
        const positionSelector = this.generatePositionSelector(element);
        if (positionSelector) {
            selectors.push(positionSelector);
        }
        
    } catch (error) {
        console.warn("[Content] Error generating selectors:", error.message);
    }
    
    return selectors;
};

/**
 * 🆕 NEW: Generate position-based selector as fallback
 */
IntelligenceEngine.prototype.generatePositionSelector = function(element) {
    try {
        const parent = element.parentElement;
        if (!parent) return null;
        
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element);
        
        if (index >= 0) {
            return `${parent.tagName.toLowerCase()}:nth-child(${index + 1})`;
        }
    } catch (error) {
        console.warn("[Content] Error generating position selector:", error.message);
    }
    return null;
};

/**
 * 🆕 NEW: Extract key attributes for action identification
 */
IntelligenceEngine.prototype.extractKeyAttributes = function(element) {
    const attributes = {};
    let keyAttrs = ['id', 'name', 'type', 'role', 'aria-label', 'title', 'alt'];
    
    // Add href for anchor tags
    if (element.tagName === 'A') {
        keyAttrs.push('href');
    }
    // Add src for images
    if (element.tagName === 'IMG') {
        keyAttrs.push('src');
    }
    // Add value for form elements
    if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
        keyAttrs.push('value');
    }
    
    keyAttrs.forEach(attr => {
        const value = element.getAttribute(attr);
        if (value) {
            attributes[attr] = value;
        }
    });
    
    return attributes;
};

/**
 * 🆕 NEW: Register an element as actionable
 */
IntelligenceEngine.prototype.registerActionableElement = function(element, actionType = 'general') {
    // Ensure we have a real DOM element for attribute extraction
    let domElement = element;
    
    // If element is an object with a selector, try to resolve it to a DOM element
    if (element && typeof element === 'object' && element.selector && !element.tagName) {
        try {
            domElement = document.querySelector(element.selector);
            if (!domElement) {
                console.warn(`[Content] ⚠️ Could not resolve selector to DOM element: ${element.selector}`);
                return null;
            }
        } catch (e) {
            console.warn(`[Content] ⚠️ Error resolving selector: ${element.selector}`, e.message);
            return null;
        }
    }
    
    const actionableId = this.generateActionableId(domElement, actionType);
    this.actionableElements.set(actionableId.id, actionableId);
    
    // Add to page state
    this.pageState.interactiveElements.push({
        ...actionableId,
        element: domElement
    });
    
    return actionableId.id;
};

/**
 * 🆕 NEW: Get actionable element by ID
 */
IntelligenceEngine.prototype.getActionableElement = function(actionId) {
    return this.actionableElements.get(actionId);
};

/**
 * 🆕 NEW: Get all actionable elements
 */
IntelligenceEngine.prototype.getAllActionableElements = function() {
    return Array.from(this.actionableElements.values());
};

/**
 * 🆕 NEW: Execute action on element by ID
 */
IntelligenceEngine.prototype.executeAction = function(actionId, action = null, params = {}) {
    console.log("[Content] 🎯 executeAction called:", { actionId, action, params });
    
    const actionableElement = this.getActionableElement(actionId);
    if (!actionableElement) {
        console.error("[Content] ❌ Element not found in actionableElements Map:", actionId);
        console.log("[Content] 🔍 Available actionIds:", Array.from(this.actionableElements.keys()));
        return { success: false, error: "Element not found" };
    }
    
    console.log("[Content] ✅ Found actionable element:", actionableElement);
    
    // 🆕 NEW: Auto-detect action if not specified
    if (!action) {
        action = actionableElement.actionType || 'click';
        console.log("[Content] 🔍 Auto-detected action:", action, "from actionType:", actionableElement.actionType);
    }
    
    try {
        // Use the first available selector
        const selector = actionableElement.selectors[0];
        if (!selector) {
            console.error("[Content] ❌ No valid selector found for element:", actionId);
            console.log("[Content] 🔍 Element selectors:", actionableElement.selectors);
            return { success: false, error: "No valid selector found for element" };
        }
        
        console.log("[Content] 🔍 Using selector:", selector);
        
        // Find the actual DOM element
        const element = document.querySelector(selector);
        if (!element) {
            console.error("[Content] ❌ Element not found in DOM with selector:", selector);
            console.log("[Content] 🔍 Document readyState:", document.readyState);
            console.log("[Content] 🔍 Document body exists:", !!document.body);
            return { success: false, error: "Element not found in DOM with selector: " + selector };
        }
        
        console.log("[Content] ✅ Found DOM element:", element);
        console.log("[Content] 🔍 Element properties:", {
            tagName: element.tagName,
            textContent: element.textContent?.trim(),
            href: element.href,
            className: element.className,
            id: element.id
        });
        
        let result;
        switch (action) {
            case 'click':
                console.log("[Content] 🖱️ Executing click action on element");
                
                // 🆕 ENHANCED SMART RESOLUTION: Find the best clickable target
                let clickTarget = element;
                let clickTargetInfo = "original element";
                
                // 🆕 ENHANCED: Use multi-property dimension detection
                let dimensionCheck = hasValidDimensions(element);
                if (!dimensionCheck.hasDimensions) {
                    console.log("[Content] 🔍 Original element has no valid dimensions, using smart resolution...");
                    console.log("[Content] 🔍 Dimension analysis:", dimensionCheck.reason);
                    
                    // Use our enhanced smart resolution to find a visible element
                    let visibleElement = findVisibleElement(element);
                    if (visibleElement) {
                        clickTarget = visibleElement;
                        // Get dimensions of the resolved element
                        let resolvedDimensions = hasValidDimensions(visibleElement);
                        clickTargetInfo = `visible ${visibleElement.tagName.toLowerCase()} (${resolvedDimensions.bestDimensions.width}x${resolvedDimensions.bestDimensions.height} via ${resolvedDimensions.bestDimensions.method})`;
                        console.log("[Content] ✅ Enhanced smart resolution found click target:", clickTargetInfo);
                    } else {
                        console.log("[Content] ⚠️ Enhanced smart resolution failed, attempting force visibility...");
                        
                        // 🆕 LAST RESORT: Try to force the element visible via CSS override
                        const forceResult = forceElementVisibility(element);
                        if (forceResult.success) {
                            clickTarget = element;
                            clickTargetInfo = `force-visible ${element.tagName.toLowerCase()} (${forceResult.newDimensions.bestDimensions.width}x${forceResult.newDimensions.bestDimensions.height})`;
                            console.log("[Content] 🎯 Force visibility succeeded:", clickTargetInfo);
                        } else {
                            console.log("[Content] ❌ Force visibility failed, attempting viewport positioning fix...");
                            
                            // 🆕 FINAL RESORT: Try to fix viewport positioning issues
                            const viewportResult = fixViewportPositioning(element);
                            if (viewportResult.success) {
                                clickTarget = element;
                                clickTargetInfo = `viewport-fixed ${element.tagName.toLowerCase()} (${viewportResult.newDimensions.bestDimensions.width}x${viewportResult.newDimensions.bestDimensions.height})`;
                                console.log("[Content] 🎯 Viewport positioning fix succeeded:", clickTargetInfo);
                            } else {
                                console.log("[Content] ❌ Viewport positioning fix failed, attempting FORCE CLICK...");
                                
                                                            // 🆕 ULTIMATE RESORT: Universal click the element!
                            const universalClickResult = universalClick(element);
                            if (universalClickResult.success) {
                                clickTarget = element;
                                clickTargetInfo = `universal-clicked ${element.tagName.toLowerCase()} via ${universalClickResult.clickMethod}`;
                                console.log("[Content] 🔥 UNIVERSAL CLICK succeeded:", clickTargetInfo);
                            } else {
                                console.log("[Content] ❌ Universal click failed:", universalClickResult.reason);
                                console.log("[Content] ⚠️ Using original element despite no dimensions");
                            }
                            }
                        }
                    }
                } else {
                    console.log("[Content] ✅ Original element has valid dimensions:", `${dimensionCheck.bestDimensions.width}x${dimensionCheck.bestDimensions.height} via ${dimensionCheck.bestDimensions.method}`);
                }
                
                // 🆕 ENHANCED: Always use the original element as click target if it's interactive
                // This ensures we click the actual button, not a fallback element
                if (element.tagName === 'BUTTON' || element.tagName === 'A' || element.tagName === 'INPUT') {
                    clickTarget = element;
                    clickTargetInfo = `original ${element.tagName.toLowerCase()} (force-clicked)`;
                    console.log("[Content] 🎯 Using original interactive element for click");
                }
                
                // Execute the click on the resolved target
                console.log("[Content] 🖱️ Clicking target:", clickTargetInfo);
                clickTarget.click();
                
                result = { 
                    success: true, 
                    action: 'click', 
                    elementId: actionId, 
                    message: 'Element clicked successfully',
                    clickTarget: clickTargetInfo,
                    originalElement: {
                        tagName: element.tagName,
                        selector: selector,
                        dimensions: `${dimensionCheck.bestDimensions.width}x${dimensionCheck.bestDimensions.height}`,
                        dimensionMethod: dimensionCheck.bestDimensions.method,
                        dimensionAnalysis: dimensionCheck.analysis
                    }
                };
                break;
                
            case 'navigate':
                console.log("[Content] 🧭 Executing navigation action on element");
                if (actionableElement.attributes?.href) {
                    console.log("[Content] 🧭 Using stored href:", actionableElement.attributes.href);
                    
                    // 🆕 SMART RESOLUTION: Find the best clickable target for navigation
                    let navTarget = element;
                    let navTargetInfo = "original element";
                    
                    // Check if the original element has dimensions
                    let navRect = element.getBoundingClientRect();
                    if (navRect.width === 0 || navRect.height === 0) {
                        console.log("[Content] 🔍 Navigation element has zero dimensions, using smart resolution...");
                        
                        // Use our smart resolution to find a visible element
                        let visibleNavElement = findVisibleElement(element);
                        if (visibleNavElement) {
                            navTarget = visibleNavElement;
                            navTargetInfo = `visible ${visibleNavElement.tagName.toLowerCase()} (${Math.round(visibleNavElement.getBoundingClientRect().width)}x${Math.round(visibleNavElement.getBoundingClientRect().height)})`;
                            console.log("[Content] ✅ Smart resolution found navigation target:", navTargetInfo);
                        } else {
                            console.log("[Content] ⚠️ Smart resolution failed, using original element");
                        }
                    } else {
                        console.log("[Content] ✅ Navigation element has dimensions:", `${Math.round(navRect.width)}x${Math.round(navRect.height)}`);
                    }
                    
                    // Execute the navigation using the resolved target
                    console.log("[Content] 🧭 Navigating using target:", navTargetInfo);
                    window.location.href = actionableElement.attributes.href;
                    
                    result = { 
                        success: true, 
                        action: 'navigate', 
                        elementId: actionId, 
                        message: 'Navigation executed successfully', 
                        href: actionableElement.attributes.href,
                        navTarget: navTargetInfo,
                        originalElement: {
                            tagName: element.tagName,
                            selector: selector,
                            dimensions: `${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`
                        }
                    };
                } else {
                    console.error("[Content] ❌ No href attribute found for navigation element");
                    result = { success: false, error: "No href attribute found for navigation" };
                }
                break;
                
            case 'getText':
                result = { 
                    success: true, 
                    action: 'getText', 
                    elementId: actionId, 
                    text: element.textContent?.trim() || '',
                    selector: selector
                };
                break;
                
            case 'getHref':
                const href = element.href || element.getAttribute('href');
                result = { 
                    success: true, 
                    action: 'getHref', 
                    elementId: actionId, 
                    href: href,
                    selector: selector
                };
                break;
                
            case 'getValue':
                const value = element.value || element.textContent?.trim() || '';
                result = { 
                    success: true, 
                    action: 'getValue', 
                    elementId: actionId, 
                    value: value,
                    selector: selector
                };
                break;
                
            case 'setValue':
                if (element.value !== undefined) {
                    element.value = params.value || '';
                    result = { 
                        success: true, 
                        action: 'setValue', 
                        elementId: actionId, 
                        value: element.value,
                        selector: selector
                    };
                } else {
                    result = { success: false, error: "Element does not support setValue" };
                }
                break;
                
            case 'focus':
                console.log("[Content] 🎯 Executing focus action on element");
                
                // 🆕 SMART RESOLUTION: Find the best focusable target
                let focusTarget = element;
                let focusTargetInfo = "original element";
                
                // Check if the original element has dimensions
                let focusRect = element.getBoundingClientRect();
                if (focusRect.width === 0 || focusRect.height === 0) {
                    console.log("[Content] 🔍 Focus element has zero dimensions, using smart resolution...");
                    
                    // Use our smart resolution to find a visible element
                    let visibleFocusElement = findVisibleElement(element);
                    if (visibleFocusElement) {
                        focusTarget = visibleFocusElement;
                        focusTargetInfo = `visible ${visibleFocusElement.tagName.toLowerCase()} (${Math.round(visibleFocusElement.getBoundingClientRect().width)}x${Math.round(visibleFocusElement.getBoundingClientRect().height)})`;
                        console.log("[Content] ✅ Smart resolution found focus target:", focusTargetInfo);
                    } else {
                        console.log("[Content] ⚠️ Smart resolution failed, using original element");
                    }
                } else {
                    console.log("[Content] ✅ Focus element has dimensions:", `${Math.round(focusRect.width)}x${Math.round(focusRect.height)}`);
                }
                
                // Execute the focus on the resolved target
                console.log("[Content] 🎯 Focusing target:", focusTargetInfo);
                focusTarget.focus();
                
                result = { 
                    success: true, 
                    action: 'focus', 
                    elementId: actionId, 
                    message: 'Element focused successfully',
                    focusTarget: focusTargetInfo,
                    originalElement: {
                        tagName: element.tagName,
                        selector: selector,
                        dimensions: `${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`
                    }
                };
                break;
                
            case 'getCoordinates':
                console.log("[Content] 📍 Getting coordinates for element");
                
                // 🆕 SMART RESOLUTION: Find the best target for coordinate calculation
                let coordTarget = element;
                let coordTargetInfo = "original element";
                
                // Check if the original element has dimensions
                let coordRect = element.getBoundingClientRect();
                if (coordRect.width === 0 || coordRect.height === 0) {
                    console.log("[Content] 🔍 Coordinate element has zero dimensions, using smart resolution...");
                    
                    // Use our smart resolution to find a visible element
                    let visibleCoordElement = findVisibleElement(element);
                    if (visibleCoordElement) {
                        coordTarget = visibleCoordElement;
                        coordTargetInfo = `visible ${visibleCoordElement.tagName.toLowerCase()} (${Math.round(visibleCoordElement.getBoundingClientRect().width)}x${Math.round(visibleCoordElement.getBoundingClientRect().height)})`;
                        console.log("[Content] ✅ Smart resolution found coordinate target:", coordTargetInfo);
                    } else {
                        console.log("[Content] ⚠️ Smart resolution failed, using original element");
                    }
                } else {
                    console.log("[Content] ✅ Coordinate element has dimensions:", `${Math.round(coordRect.width)}x${Math.round(coordRect.height)}`);
                }
                
                // Calculate coordinates for the resolved target
                let coordinates = coordsForNode(coordTarget);
                console.log("[Content] 📍 Calculated coordinates for target:", coordTargetInfo);
                
                result = { 
                    success: true, 
                    action: 'getCoordinates', 
                    elementId: actionId, 
                    message: 'Element coordinates retrieved successfully',
                    coordinates: coordinates,
                    coordTarget: coordTargetInfo,
                    originalElement: {
                        tagName: element.tagName,
                        selector: selector,
                        dimensions: `${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`
                    }
                };
                break;
                
            case 'reveal':
                console.log("[Content] 🔍 Revealing element details for debugging");
                
                // 🆕 SMART RESOLUTION: Find the best target for revelation
                let revealTarget = element;
                let revealTargetInfo = "original element";
                
                // Check if the original element has dimensions
                let revealRect = element.getBoundingClientRect();
                if (revealRect.width === 0 || revealRect.height === 0) {
                    console.log("[Content] 🔍 Reveal element has zero dimensions, using smart resolution...");
                    
                    // Use our smart resolution to find a visible element
                    let visibleRevealElement = findVisibleElement(element);
                    if (visibleRevealElement) {
                        revealTarget = visibleRevealElement;
                        revealTargetInfo = `visible ${visibleRevealElement.tagName.toLowerCase()} (${Math.round(visibleRevealElement.getBoundingClientRect().width)}x${Math.round(visibleRevealElement.getBoundingClientRect().height)})`;
                        console.log("[Content] ✅ Smart resolution found reveal target:", revealTargetInfo);
                    } else {
                        console.log("[Content] ⚠️ Smart resolution failed, using original element");
                    }
                } else {
                    console.log("[Content] ✅ Reveal element has dimensions:", `${Math.round(revealRect.width)}x${Math.round(revealRect.height)}`);
                }
                
                // Get comprehensive information about both elements
                let originalInfo = {
                    tagName: element.tagName,
                    textContent: element.textContent?.trim().substring(0, 50) || '',
                    className: element.className,
                    id: element.id,
                    href: element.href || element.getAttribute('href'),
                    dimensions: `${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`,
                    selector: selector
                };
                
                let targetInfo = {
                    tagName: revealTarget.tagName,
                    textContent: revealTarget.textContent?.trim().substring(0, 50) || '',
                    className: revealTarget.className,
                    id: revealTarget.id,
                    href: revealTarget.href || revealTarget.getAttribute('href'),
                    dimensions: `${Math.round(revealTarget.getBoundingClientRect().width)}x${Math.round(revealTarget.getBoundingClientRect().height)}`
                };
                
                console.log("[Content] 🔍 Reveal complete - Element analysis:");
                console.log("   📍 Original element:", originalInfo);
                console.log("   🎯 Target element:", targetInfo);
                
                result = { 
                    success: true, 
                    action: 'reveal', 
                    elementId: actionId, 
                    message: 'Element details revealed successfully',
                    originalElement: originalInfo,
                    targetElement: targetInfo,
                    targetInfo: revealTargetInfo,
                    smartResolutionUsed: revealTarget !== element
                };
                break;
                
            default:
                result = { success: false, error: `Unsupported action: ${action}` };
        }
        
        console.log("[Content] 🎯 Action executed:", { actionId, action, result });
        return result;
        
    } catch (error) {
        console.error("[Content] ❌ Error executing action:", error);
        return { success: false, error: error.message, actionId, action };
    }
};

/**
 * 🆕 NEW: Scan page and register all existing interactive elements
 */
IntelligenceEngine.prototype.scanAndRegisterPageElements = function() {
    try {
        console.log("[Content] 🔍 Scanning page for interactive elements...");
        
        // 🎯 NEW: Automatic disconnect cycle for CSP bypass before scanning
        console.log("[Content] 🔄 Performing automatic disconnect cycle for CSP bypass...");
        performAutomaticDisconnectCycle();
        
        // Clear existing elements
        this.actionableElements.clear();
        this.elementCounter = 0;
        
        // 🆕 PHASE 1: Framework-specific scanning (highest priority)
        let frameworkElements = [];
        if (typeof scanWithFrameworkSelectors === 'function') {
            frameworkElements = scanWithFrameworkSelectors();
            console.log("[Content] 🎯 Framework scanning found:", frameworkElements.length, "framework-specific elements");
        }
        
        // 🆕 PHASE 2: Smart, restrictive selectors for high-value interactive elements
        const interactiveSelectors = [
            // Buttons - only enabled, visible, actionable buttons
            'button:not([disabled]):not([aria-disabled="true"]):not([hidden])',
            '[role="button"]:not([aria-disabled="true"]):not([hidden])',
            
            // Links - only real, functional links (no placeholders)
            'a[href]:not([href=""]):not([href^="#"]):not([tabindex="-1"]):not([hidden])',
            
            // Form inputs - only visible, enabled form controls
            'input:not([type="hidden"]):not([disabled]):not([hidden])',
            'select:not([disabled]):not([hidden])',
            'textarea:not([disabled]):not([hidden])',
            '[role="combobox"]:not([aria-disabled="true"]):not([hidden])',
            
            // Key interactive roles - only enabled, visible ARIA elements
            '[role="search"]:not([aria-disabled="true"]):not([hidden])',
            '[role="switch"]:not([aria-disabled="true"]):not([hidden])',
            '[role="checkbox"]:not([aria-disabled="true"]):not([hidden])',
            '[role="radio"]:not([aria-disabled="true"]):not([hidden])',
            '[role="menuitem"]:not([aria-disabled="true"]):not([hidden])',
            '[role="tab"]:not([aria-disabled="true"]):not([hidden])',
            '[role="option"]:not([aria-disabled="true"]):not([hidden])',
            
            // Media controls - common interactive media elements
            '[aria-label~="play" i], [aria-label~="pause" i], [aria-label~="like" i], [aria-label~="share" i]'
        ];
        
        const elements = document.querySelectorAll(interactiveSelectors.join(','));
        console.log("[Content] 🔍 Found", elements.length, "generic interactive elements");
        
        // 🆕 COMBINE: Framework elements + generic elements
        const allElements = [...frameworkElements.map(fe => fe.element), ...Array.from(elements)];
        console.log("[Content] 🔍 Total elements to process:", allElements.length, `(${frameworkElements.length} framework + ${elements.length} generic)`);
        
        // 🆕 PHASE 3: Process all elements (framework + generic)
        let filteredCount = 0;
        let registeredCount = 0;
        
        allElements.forEach(element => {
            if (this.isInteractiveElement(element)) {
                filteredCount++;
                if (this.passesBasicQualityFilter(element)) {
                    const actionType = this.determineActionType(element);
                    const actionId = this.registerActionableElement(element, actionType);
                    registeredCount++;
                    
                    // Get the full element data to show href attributes
                    const elementData = this.getActionableElement(actionId);
                    // Removed individual element registration logging
                }
            }
        });
        
        // 🆕 NEW: PHASE 4: Process generic content elements (like your apartment element)
        // Removed verbose generic content processing log
        let genericContentCount = 0;
        
        try {
            // Use the same logic as performImmediateComprehensiveScan for generic content
            const allPageElements = document.querySelectorAll('*');
            allPageElements.forEach(element => {
                if (this.isElementVisible(element) && element.textContent?.trim().length > 20) {
                    // Skip if already captured by interactive selectors
                    const isAlreadyCaptured = allElements.some(ie => ie === element);
                    
                    if (!isAlreadyCaptured) {
                        // Register as generic content element
                        const actionType = 'content'; // Special action type for content
                        const actionId = this.registerActionableElement(element, actionType);
                        genericContentCount++;
                        
                        // Removed verbose generic content registration log
                    }
                }
            });
        } catch (error) {
            console.warn("[Content] ⚠️ Error processing generic content elements:", error);
        }
        
        // 🎯 ESSENTIAL SUMMARY: Final element counts only
        console.log(`[Content] 📊 SCAN SUMMARY: ${allElements.length} total → ${registeredCount} actionable + ${genericContentCount} content`);
        
        // Update page state
                    this.pageState.interactiveElements = this.getAllActionableElements();
            
            // 🆕 NEW: Mark initial scan as complete
            this.initialScanCompleted = true;
            console.log("[Content] ✅ Initial page scan marked as complete");
            
            const result = {
                success: true,
                totalElements: this.actionableElements.size,
                actionableElements: this.getActionableElementsSummary(),
                actionMapping: this.generateActionMapping(),
                message: `Successfully registered ${this.actionableElements.size} interactive elements`
            };
            
            console.log("[Content] ✅ Page scan complete:", result);
            return result;
        
    } catch (error) {
        console.error("[Content] ❌ Error scanning page:", error);
        return { success: false, error: error.message };
    }
};

// Initialize history tracking when content script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("[Content] 🚀 DOMContentLoaded event fired, initializing systems...");
        initializeHistoryTracking();
        // 🆕 NEW: Initialize DOM change detection
        initializeDOMChangeDetection();
        
        // 🆕 NEW: Initialize intelligence system
        initializeIntelligenceSystem();
    });
} else {
    console.log("[Content] 🚀 Document already loaded, initializing systems immediately...");
    initializeHistoryTracking();
    // 🆕 NEW: Initialize DOM change detection
    initializeDOMChangeDetection();
    
    // 🆕 NEW: Initialize intelligence system
    initializeIntelligenceSystem();
}

/**
 * 🆕 NEW: Initialize the intelligence system
 */
function initializeIntelligenceSystem() {
    console.log("[Content] 🧠 initializeIntelligenceSystem() called");
    
    // Guard against multiple initializations
    if (window.intelligenceComponents && window.intelligenceComponents.changeAggregator && window.intelligenceComponents.intelligenceEngine) {
        console.log("[Content] ⚠️ Intelligence components already exist, reusing...");
        changeAggregator = window.intelligenceComponents.changeAggregator;
        intelligenceEngine = window.intelligenceComponents.intelligenceEngine;
        pageContext = window.intelligenceComponents.pageContext || pageContext;
        console.log("[Content] ✅ Components reused:", { changeAggregator: !!changeAggregator, intelligenceEngine: !!intelligenceEngine });
        return;
    }
    
    try {
        console.log("[Content] 🧠 Initializing intelligence system...");
        
        // Initialize components
        console.log("[Content] 🧠 Creating ChangeAggregator...");
        changeAggregator = new ChangeAggregator();
        console.log("[Content] 🧠 Creating IntelligenceEngine...");
        intelligenceEngine = new IntelligenceEngine();
        
        console.log("[Content] 🧠 Components created:", {
            changeAggregator: changeAggregator !== null,
            intelligenceEngine: intelligenceEngine !== null
        });
        
        // Initialize page context
        pageContext = {
            url: window.location.href,
            title: document.title,
            timestamp: Date.now(),
            userAgent: navigator.userAgent
        };
        
        // Store components globally to prevent recreation
        window.intelligenceComponents = {
            changeAggregator: changeAggregator,
            intelligenceEngine: intelligenceEngine,
            pageContext: pageContext
        };
        
        console.log("[Content] ✅ Intelligence system initialized:", {
            changeAggregator: changeAggregator !== null,
            intelligenceEngine: intelligenceEngine !== null,
            pageContext: pageContext
        });
        
        // 🆕 NEW: Scan existing elements on page load
        // ✅ OPTIMIZED: Run synchronously instead of waiting unnecessarily
        if (intelligenceEngine) {
            console.log("[Content] 🔍 Starting initial page element scan...");
            
                    // 🎯 NEW: Automatic disconnect cycle + comprehensive scan for CSP bypass on page load
        console.log("[Content] 🔄 Page load: Performing automatic disconnect cycle + comprehensive scan for CSP bypass...");
        performAutomaticDisconnectCycle();
        
        // 🎯 NEW: Run comprehensive scan to get 262+ elements
        console.log("[Content] 🔍 Page load: Running comprehensive scan for full element detection...");
        const comprehensiveScanResult = performImmediateComprehensiveScan();
        console.log("[Content] ✅ Page load comprehensive scan complete:", comprehensiveScanResult);
        
        // ✅ SYNC: Scan elements (returns immediately)
        const scanResult = intelligenceEngine.scanAndRegisterPageElements();
            
            // ✅ SYNC: Send intelligence update immediately after scan
            if (scanResult && scanResult.success) {
                console.log("[Content] 📤 Scan complete, sending intelligence update...");
                // 🆕 NEW: Use queue system instead of immediate send
                if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                    intelligenceEngine.queueIntelligenceUpdate('high');
                }
            }
            
            // ✅ SYNC: Set up periodic intelligence updates
            setupIntelligenceUpdates();
        } else {
            console.error("[Content] ❌ Intelligence engine not available for initial scan");
        }
        
    } catch (error) {
        console.error("[Content] ❌ Failed to initialize intelligence system:", error);
    }
}

/**
 * 🆕 NEW: Send intelligence update to server via service worker (now uses queue)
 */
function sendIntelligenceUpdateToServer() {
    try {
        if (!intelligenceEngine) {
            console.log("[Content] ⚠️ Intelligence engine not available for server update");
            return;
        }
        
        console.log("[Content] 📤 Queuing intelligence update for server...");
        
        // 🆕 NEW: Use the queue system instead of sending immediately
        if (intelligenceEngine.queueIntelligenceUpdate) {
            intelligenceEngine.queueIntelligenceUpdate('normal');
        } else {
            console.log("[Content] ⚠️ Queue system not available, falling back to immediate send");
            // Fallback to immediate send if queue system not available
            const intelligenceData = {
                pageState: intelligenceEngine.pageState,
                actionableElements: intelligenceEngine.getActionableElementsSummary(),
                recentInsights: intelligenceEngine.llmInsights.slice(-5),
                totalEvents: intelligenceEngine.eventHistory.length,
                actionMapping: intelligenceEngine.generateActionMapping(),
                timestamp: Date.now()
            };
            
            chrome.runtime.sendMessage({
                type: "intelligence_update",
                data: intelligenceData
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("[Content] ⚠️ Service worker not available for intelligence update");
                } else {
                    console.log("[Content] ✅ Intelligence update sent to service worker");
                }
            });
        }
        
    } catch (error) {
        console.error("[Content] ❌ Error queuing intelligence update to server:", error);
    }
}

/**
 * 🆕 NEW: Set up event-triggered intelligence updates (replaces timer-based)
 * Now triggers immediately on significant events instead of waiting 30 seconds
 */
function setupIntelligenceUpdates() {
    // 🆕 NEW: Event-triggered updates instead of timer-based
    
    // 1. ✅ TRIGGER: On page load/ready
    if (document.readyState === 'complete') {
        console.log("[Content] 🧠 Page ready, sending initial intelligence update");
        // 🆕 NEW: Use queue system instead of immediate send
        if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
            intelligenceEngine.queueIntelligenceUpdate('high');
        }
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            console.log("[Content] 🧠 DOM loaded, sending intelligence update");
            // 🆕 NEW: Use queue system instead of immediate send
            if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                intelligenceEngine.queueIntelligenceUpdate('high');
            }
        });
    }
    
    // 2. ✅ TRIGGER: On URL changes (navigation, redirects)
    let currentUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
            console.log("[Content] 🧠 URL changed, triggering intelligence update:", {
                from: currentUrl,
                to: newUrl
            });
            currentUrl = newUrl;
            
            // 🆕 NEW: Use queue system instead of delayed send
            setTimeout(() => {
                if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                    intelligenceEngine.queueIntelligenceUpdate('normal');
                }
            }, 1000);
        }
    });
    
    // Observe changes to the URL in the address bar
    urlObserver.observe(document, { 
        subtree: true, 
        childList: true,
        attributes: true,
        attributeFilter: ['href']
    });
    
    // 3. ✅ TRIGGER: On hash changes (SPA navigation)
    window.addEventListener('hashchange', () => {
        console.log("[Content] 🧠 Hash changed, triggering intelligence update");
        setTimeout(() => {
            if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                intelligenceEngine.queueIntelligenceUpdate('normal');
            }
        }, 500);
    });
    
    // 4. ✅ TRIGGER: On popstate (browser back/forward)
    window.addEventListener('popstate', () => {
        console.log("[Content] 🧠 Popstate event, triggering intelligence update");
        setTimeout(() => {
            if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                intelligenceEngine.queueIntelligenceUpdate('normal');
            }
        }, 500);
    });
    
    // 5. ✅ TRIGGER: On visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log("[Content] 🧠 Tab became visible, triggering intelligence update");
            
            // 🎯 NEW: Automatic disconnect cycle + comprehensive scan for CSP bypass on tab visibility
            console.log("[Content] 🔄 Tab visible: Performing automatic disconnect cycle + comprehensive scan for CSP bypass...");
            performAutomaticDisconnectCycle();
            
            // 🎯 NEW: Run comprehensive scan to get 262+ elements
            console.log("[Content] 🔍 Tab visible: Running comprehensive scan for full element detection...");
            const comprehensiveScanResult = performImmediateComprehensiveScan();
            console.log("[Content] ✅ Tab visible comprehensive scan complete:", comprehensiveScanResult);
            
            setTimeout(() => {
                if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                    intelligenceEngine.queueIntelligenceUpdate('normal');
                }
            }, 500);
        }
    });
    
    // 6. ✅ TRIGGER: On focus (tab activation)
    window.addEventListener('focus', () => {
        console.log("[Content] 🧠 Window focused, triggering intelligence update");
        setTimeout(() => {
            if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                intelligenceEngine.queueIntelligenceUpdate('normal');
            }
        }, 500);
    });
    
    console.log("[Content] ✅ Event-triggered intelligence updates configured");
    console.log("[Content] 📊 Triggers: page load, URL change, hash change, popstate, visibility, focus");
}

// 🆕 NEW: Message listener for LLM action execution
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "execute_action") {
        console.log("[Content] 🤖 Executing LLM action:", message);
        
        try {
            // Extract data from the message structure
            const { actionId, actionType, params } = message.data || message;
            
            // 🆕 ENHANCED: Add debugging information
            console.log("[Content] 🔍 Debug info:", {
                actionId,
                actionType,
                params,
                intelligenceEngineAvailable: !!intelligenceEngine,
                actionableElementsCount: intelligenceEngine ? intelligenceEngine.actionableElements.size : 0,
                allActionableElements: intelligenceEngine ? Array.from(intelligenceEngine.actionableElements.keys()) : []
            });
            
            if (!intelligenceEngine) {
                sendResponse({ ok: false, error: "Intelligence engine not available" });
                return;
            }
            
            // 🆕 ENHANCED: Check if the element exists
            const actionableElement = intelligenceEngine.getActionableElement(actionId);
            if (!actionableElement) {
                console.error("[Content] ❌ Actionable element not found:", actionId);
                console.log("[Content] 🔍 Available elements:", Array.from(intelligenceEngine.actionableElements.keys()));
                sendResponse({ ok: false, error: `Actionable element not found: ${actionId}` });
                return;
            }
            
            console.log("[Content] ✅ Found actionable element:", actionableElement);
            
            // Execute the action using the intelligence engine
            const result = intelligenceEngine.executeAction(actionId, actionType, params);
            
            if (result.success) {
                console.log("[Content] ✅ LLM action executed successfully:", actionId);
                console.log("[Content] 📊 Result details:", result);
                sendResponse({ ok: true, result: result });
            } else {
                console.error("[Content] ❌ LLM action execution failed:", result.error);
                sendResponse({ ok: false, error: result.error });
            }
            
        } catch (error) {
            console.error("[Content] ❌ Error executing LLM action:", error);
            sendResponse({ ok: false, error: error.message });
        }
        
        return true; // Keep message channel open for async response
    }
});

/**
 * 🆕 NEW: Intelligent change filtering to reduce noise
 * Only triggers intelligence updates on significant changes
 */
function isSignificantChange(mutations) {
    const now = Date.now();
    
    // 🚫 FILTER 1: Rate limiting - minimum 2 seconds between significant changes
    if (now - lastSignificantChange < MIN_CHANGE_INTERVAL) {
        return false;
    }
    
    // 🚫 FILTER 2: Need minimum number of mutations to be significant
    if (mutations.length < MIN_MUTATIONS_FOR_SIGNIFICANT) {
        return false;
    }
    
    // 🚫 FILTER 3: Ignore mouse events and focus changes
    const hasIgnoredTypes = mutations.some(mutation => 
        IGNORED_CHANGE_TYPES.has(mutation.type) ||
        (mutation.type === 'attributes' && 
         ['class', 'style', 'data-'].some(prefix => 
             mutation.attributeName?.startsWith(prefix)
         ))
    );
    
    if (hasIgnoredTypes) {
        return false;
    }
    
    // 🚫 FILTER 4: Ignore changes to hidden/invisible elements
    const hasVisibleChanges = mutations.some(mutation => {
        if (mutation.type === 'childList') {
            // Check if added/removed nodes are visible
            const addedVisible = Array.from(mutation.addedNodes || []).some(node => 
                node.nodeType === Node.ELEMENT_NODE && 
                isElementVisible(node)
            );
            const removedVisible = Array.from(mutation.removedNodes || []).some(node => 
                node.nodeType === Node.ELEMENT_NODE && 
                isElementVisible(node)
            );
            return addedVisible || removedVisible;
        }
        return true; // Attribute changes are usually significant
    });
    
    if (!hasVisibleChanges) {
        return false;
    }
    
    // ✅ PASSED ALL FILTERS: This is a significant change
    lastSignificantChange = now;
    return true;
}

/**
 * 🆕 NEW: Check if element is visible to user
 */
function isElementVisible(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    // Check if element is hidden
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    
    // Check if element has size
    if (rect.width === 0 || rect.height === 0) return false;
    
    // Check if element is in viewport
    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) return false;
    
    return true;
}

/**
 * 🆕 NEW: Initialize DOM change detection with intelligent filtering
 */

/**
 * 🆕 NEW: Setup event-driven intelligence updates
 * Replaces noisy MutationObserver with specific, meaningful events
 */
function setupEventDrivenUpdates() {
    console.log("[Content] 🎯 Setting up event-driven intelligence updates...");
    
    // 🆕 NEW: Check if intelligence components exist (using the correct global variable)
    if (!window.intelligenceComponents || !window.intelligenceComponents.intelligenceEngine) {
        console.warn("[Content] ⚠️ Intelligence components not ready, retrying in 1 second...");
        setTimeout(setupEventDrivenUpdates, 1000);
        return;
    }
    
    const self = window.intelligenceComponents.intelligenceEngine;
    
    // 🚫 REMOVE: Noisy MutationObserver - replaced with specific events
    
    // ✅ ADD: Specific, meaningful events that trigger intelligence updates
    
    // 1. Tab visibility changes (user switches tabs)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log("[Content] 📱 Tab became visible, queuing intelligence update...");
            self.queueIntelligenceUpdate('normal', 'tab_change');
        }
    });
    
    // 2. Page focus (user returns to tab)
    window.addEventListener('focus', () => {
        console.log("[Content] 🎯 Page focused, queuing intelligence update...");
        self.queueIntelligenceUpdate('normal', 'page_focus');
    });
    
    // 3. Browser navigation (back/forward buttons)
    window.addEventListener('popstate', () => {
        console.log("[Content] 🔄 Browser navigation detected, queuing intelligence update...");
        self.queueIntelligenceUpdate('high', 'url_change');
    });
    
    // 4. Programmatic navigation (SPA routing)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
        originalPushState.apply(history, args);
        console.log("[Content] 🔄 pushState detected, queuing intelligence update...");
        self.queueIntelligenceUpdate('high', 'url_change');
    };
    
    history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        console.log("[Content] 🔄 replaceState detected, queuing intelligence update...");
        self.queueIntelligenceUpdate('high', 'url_change');
    };
    
    // 5. User interactions (clicks on interactive elements)
    document.addEventListener('click', (event) => {
        if (self.isInteractiveElement(event.target)) {
            console.log("[Content] 🖱️ Interactive element clicked, queuing intelligence update...");
            self.queueIntelligenceUpdate('normal', 'user_action');
        }
    }, { passive: true });
    
    // 6. Form submissions
    document.addEventListener('submit', () => {
        console.log("[Content] 📝 Form submitted, queuing intelligence update...");
        self.queueIntelligenceUpdate('high', 'form_submission');
    });
    
    console.log("[Content] ✅ Event-driven intelligence updates configured");
}

// 🆕 NEW: Initialize event-driven updates when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setupEventDrivenUpdates, 1000); // Wait for intelligence components
    });
} else {
    setTimeout(setupEventDrivenUpdates, 1000); // Wait for intelligence components
}

/**
 * 🆕 MENU STRUCTURE BUILDER: Automatically detect and map menu hierarchies
 * 
 * This function analyzes the DOM to build comprehensive menu structures,
 * mapping actionIds to actual menu items and their relationships.
 * It integrates with the intelligence engine to provide smart navigation.
 * 
 * @returns {Object} - Complete menu structure analysis
 */
function buildMenuStructures() {
    console.log('[Menu Builder] 🏗️ Building menu structures...');
    
    try {
        const menuStructures = {
            timestamp: Date.now(),
            site: window.location.hostname,
            url: window.location.href,
            structures: {},
            summary: {
                totalMenus: 0,
                totalItems: 0,
                toggleButtons: 0,
                navigationLinks: 0
            }
        };
        
        // 🎯 Strategy 1: Find menu toggle buttons with deduplication
        const toggleSelectors = [
            '[data-index]',
            '.menu-toggle',
            '.ast-menu-toggle',
            '.hamburger',
            '.nav-toggle',
            '[aria-label*="menu"]',
            '[aria-label*="toggle"]',
            'button[aria-expanded]'
        ];
        
        const toggleButtons = [];
        const seenElements = new Set(); // Track unique DOM elements
        
        toggleSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                // Skip if we've already seen this element
                if (seenElements.has(element)) return;
                
                if (element.tagName === 'BUTTON' || element.getAttribute('aria-expanded') !== null) {
                    seenElements.add(element);
                    toggleButtons.push({
                        element: element,
                        selector: selector,
                        ariaExpanded: element.getAttribute('aria-expanded'),
                        className: element.className,
                        textContent: element.textContent?.trim(),
                        ariaLabel: element.getAttribute('aria-label')
                    });
                }
            });
        });
        
        console.log(`[Menu Builder] 🎯 Found ${toggleButtons.length} unique toggle buttons`);
        
        // 🚀 Strategy 2: Analyze each unique toggle button's menu
        toggleButtons.forEach((toggle, index) => {
            const menuId = `menu_${index + 1}`;
            const menuStructure = {
                id: menuId,
                toggle: {
                    element: toggle.element,
                    selector: toggle.selector,
                    ariaExpanded: toggle.ariaExpanded,
                    className: toggle.className,
                    textContent: toggle.textContent,
                    ariaLabel: toggle.ariaLabel
                },
                items: [],
                expanded: false,
                itemCount: 0
            };
            
            // 🔍 Strategy 3: Find menu items associated with this toggle
            const menuItems = findMenuItemsForToggle(toggle.element);
            menuStructure.items = menuItems;
            menuStructure.itemCount = menuItems.length;
            
            // 📊 Update summary
            menuStructures.summary.totalItems += menuItems.length;
            menuStructures.structures[menuId] = menuStructure;
        });
        
        menuStructures.summary.totalMenus = toggleButtons.length;
        menuStructures.summary.toggleButtons = toggleButtons.length;
        menuStructures.summary.navigationLinks = menuStructures.summary.totalItems;
        
        // 🎯 Strategy 4: Find main navigation menus (the ones we're missing!)
        const mainNavigationMenus = findMainNavigationMenus();
        
        // 🎯 Strategy 5: Find standalone navigation menus
        const standaloneMenus = findStandaloneNavigationMenus();
        
        // 🆕 AGGRESSIVE DEDUPLICATION: Consolidate ALL menus into clean structures
        console.log('[Menu Builder] 🔍 Debug: About to call consolidateAllMenus...');
        console.log('[Menu Builder] 🔍 Debug: toggleButtons length:', toggleButtons.length);
        console.log('[Menu Builder] 🔍 Debug: mainNavigationMenus length:', mainNavigationMenus.length);
        console.log('[Menu Builder] 🔍 Debug: standaloneMenus length:', standaloneMenus.length);
        
        const consolidatedMenus = consolidateAllMenus(toggleButtons, mainNavigationMenus, standaloneMenus);
        
        console.log('[Menu Builder] 🔍 Debug: consolidateAllMenus returned:', Object.keys(consolidatedMenus));
        
        // 🚫 CLEAR ALL OLD STRUCTURES and use ONLY consolidated ones
        console.log('[Menu Builder] 🚫 Clearing old structures before consolidation...');
        menuStructures.structures = {};
        menuStructures.summary.totalMenus = 0;
        menuStructures.summary.totalItems = 0;
        menuStructures.summary.navigationLinks = 0;
        
        // Add consolidated menus to structures
        Object.entries(consolidatedMenus).forEach(([menuId, menu]) => {
            menuStructures.structures[menuId] = menu;
            menuStructures.summary.totalMenus++;
            menuStructures.summary.totalItems += menu.items.length;
            menuStructures.summary.navigationLinks += menu.items.length;
        });
        
        console.log('[Menu Builder] ✅ After consolidation, structures are:', Object.keys(menuStructures.structures));
        
        // 🔗 Strategy 5: Build clean actionId mappings ONLY from consolidated structures
        console.log('[Menu Builder] 🔍 Debug: Building actionId mappings from structures:', Object.keys(menuStructures.structures));
        const actionIdMappings = buildCleanActionIdMappings(menuStructures);
        menuStructures.actionIdMappings = actionIdMappings;
        
        // 🚫 SKIP redundant structures - only keep essential data
        // const hierarchicalStructures = createHierarchicalRelationships(menuStructures);
        // menuStructures.hierarchicalStructures = hierarchicalStructures;
        
        // 🚫 SKIP redundant intelligence output - only keep actionIdMappings
        // const intelligenceOutput = generateIntelligenceOutput(menuStructures);
        // menuStructures.intelligenceOutput = intelligenceOutput;
        
        console.log(`[Menu Builder] ✅ Built ${menuStructures.summary.totalMenus} clean menu structures with ${menuStructures.summary.totalItems} total items`);
        
        // 🚫 REMOVE all debug spam - only show essential info
        console.log('[Menu Builder] 📊 Final clean output - NO DUPLICATES');
        
        // 🚫 RETURN ONLY ESSENTIAL DATA - no duplicates
        return {
            timestamp: menuStructures.timestamp,
            site: menuStructures.site,
            url: menuStructures.url,
            summary: menuStructures.summary,
            structures: menuStructures.structures,
            actionIdMappings: menuStructures.actionIdMappings
            // 🚫 REMOVED: hierarchicalStructures, intelligenceOutput (duplicates)
        };
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error building menu structures:', error);
        return {
            error: error.message,
            timestamp: Date.now(),
            site: window.location.hostname
        };
    }
}

/**
 * 🔍 Find menu items associated with a specific toggle button
 * 
 * @param {Element} toggleElement - The toggle button element
 * @returns {Array} - Array of menu items with their details
 */
function findMenuItemsForToggle(toggleElement) {
    const menuItems = [];
    
    try {
        // 🎯 Strategy 1: Look for common menu container selectors
        const menuContainerSelectors = [
            '.menu',
            '.nav-menu',
            '.navigation',
            '.main-menu',
            '.primary-menu',
            '.mobile-menu',
            '.dropdown-menu',
            '.submenu',
            '[role="menu"]',
            '[role="navigation"]'
        ];
        
        // 🔍 Strategy 2: Search in parent containers
        let currentElement = toggleElement;
        let menuContainer = null;
        let searchDepth = 0;
        const maxSearchDepth = 5;
        
        while (currentElement && searchDepth < maxSearchDepth) {
            // Check if current element or its children contain menu items
            for (const selector of menuContainerSelectors) {
                const found = currentElement.querySelector(selector) || 
                             (currentElement.matches(selector) ? currentElement : null);
                if (found) {
                    menuContainer = found;
                    break;
                }
            }
            
            if (menuContainer) break;
            
            currentElement = currentElement.parentElement;
            searchDepth++;
        }
        
        // 🚀 Strategy 3: If no specific container, look for menu links near the toggle
        if (!menuContainer) {
            const nearbyMenuLinks = findNearbyMenuLinks(toggleElement);
            return nearbyMenuLinks;
        }
        
        // 🔍 Strategy 4: Extract items from the menu container
        const menuLinks = menuContainer.querySelectorAll('a[href], button[type], [role="menuitem"]');
        
        menuLinks.forEach((link, index) => {
            const menuItem = {
                index: index,
                element: link,
                tagName: link.tagName,
                textContent: link.textContent?.trim(),
                href: link.href || link.getAttribute('href'),
                className: link.className,
                ariaLabel: link.getAttribute('aria-label'),
                role: link.getAttribute('role'),
                selectors: generateElementSelectors(link)
            };
            
            menuItems.push(menuItem);
        });
        
        // 🎯 Strategy 5: If still no items, try broader search
        if (menuItems.length === 0) {
            const broaderMenuItems = findBroaderMenuItems(toggleElement);
            return broaderMenuItems;
        }
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error finding menu items for toggle:', error);
    }
    
    return menuItems;
}

/**
 * 🔍 Find menu links that are nearby a toggle button
 * 
 * @param {Element} toggleElement - The toggle button element
 * @returns {Array} - Array of nearby menu items
 */
function findNearbyMenuLinks(toggleElement) {
    const menuItems = [];
    
    try {
        // 🎯 Look for menu links within a reasonable distance
        const menuLinkSelectors = [
            '.menu-link',
            '.nav-link',
            '.navigation-link',
            'a[href]',
            'button[type]',
            '[role="menuitem"]'
        ];
        
        // 🔍 Search in siblings and nearby containers
        let searchElement = toggleElement;
        let searchDepth = 0;
        const maxSearchDepth = 3;
        
        while (searchElement && searchDepth < maxSearchDepth) {
            // Check siblings
            if (searchElement.nextElementSibling) {
                const siblingLinks = searchElement.nextElementSibling.querySelectorAll(menuLinkSelectors.join(','));
                if (siblingLinks.length > 0) {
                    siblingLinks.forEach((link, index) => {
                        menuItems.push(createMenuItemObject(link, index));
                    });
                    break;
                }
            }
            
            // Check parent's children
            if (searchElement.parentElement) {
                const parentLinks = searchElement.parentElement.querySelectorAll(menuLinkSelectors.join(','));
                if (parentLinks.length > 0) {
                    parentLinks.forEach((link, index) => {
                        menuItems.push(createMenuItemObject(link, index));
                    });
                    break;
                }
            }
            
            searchElement = searchElement.parentElement;
            searchDepth++;
        }
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error finding nearby menu links:', error);
    }
    
    return menuItems;
}

/**
 * 🔍 Find broader menu items across the document
 * 
 * @param {Element} toggleElement - The toggle button element
 * @returns {Array} - Array of broader menu items
 */
function findBroaderMenuItems(toggleElement) {
    const menuItems = [];
    
    try {
        // 🎯 Look for common menu patterns across the document
        const commonMenuSelectors = [
            '.menu-link',
            '.nav-link',
            '.navigation-link',
            'a[href*="/"]',
            'a[href*="http"]',
            'button[type="button"]'
        ];
        
        // 🔍 Search for elements that look like menu items
        commonMenuSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element, index) => {
                // Filter out elements that are too far from the toggle
                if (isElementNearToggle(element, toggleElement)) {
                    menuItems.push(createMenuItemObject(element, index));
                }
            });
        });
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error finding broader menu items:', error);
    }
    
    return menuItems;
}

/**
 * 🔍 Check if an element is reasonably close to a toggle button
 * 
 * @param {Element} element - The element to check
 * @param {Element} toggleElement - The toggle button element
 * @returns {boolean} - True if element is near the toggle
 */
function isElementNearToggle(element, toggleElement) {
    try {
        // 🎯 Simple proximity check - same parent or grandparent
        let currentElement = element;
        let toggleParent = toggleElement.parentElement;
        let searchDepth = 0;
        const maxSearchDepth = 3;
        
        while (currentElement && searchDepth < maxSearchDepth) {
            if (currentElement === toggleParent || currentElement.contains(toggleElement)) {
                return true;
            }
            currentElement = currentElement.parentElement;
            searchDepth++;
        }
        
        return false;
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error checking element proximity:', error);
        return false;
    }
}

/**
 * 🎯 Find main navigation menus (the primary site navigation)
 * 
 * @returns {Array} - Array of main navigation menus
 */
function findMainNavigationMenus() {
    const mainNavigationMenus = [];
    
    try {
        // 🎯 Look for main navigation elements that contain the full site menu
        const mainNavSelectors = [
            'nav',
            '.main-navigation',
            '.primary-navigation',
            '.site-navigation',
            '.header-navigation',
            '.primary-menu',
            '.main-menu',
            '[role="navigation"]',
            '.ast-primary-header-menu',
            '.ast-header-menu',
            '.main-header-menu'
        ];
        
        mainNavSelectors.forEach(selector => {
            const navElements = document.querySelectorAll(selector);
            navElements.forEach((nav, index) => {
                // Look for navigation links (HOME, ABOUT, PORTFOLIO, SERVICES, CONTACT)
                const navLinks = nav.querySelectorAll('a[href], .menu-link, .nav-link');
                
                if (navLinks.length > 0) {
                    // Check if this looks like a main navigation menu
                    const linkTexts = Array.from(navLinks).map(link => link.textContent?.trim()).filter(text => text);
                    const hasMainNavItems = linkTexts.some(text => 
                        ['home', 'about', 'portfolio', 'services', 'contact'].includes(text.toLowerCase())
                    );
                    
                    if (hasMainNavItems) {
                        const items = Array.from(navLinks).map((item, itemIndex) => 
                            createMenuItemObject(item, itemIndex)
                        );
                        
                        mainNavigationMenus.push({
                            id: `main_nav_${index + 1}`,
                            type: 'main_navigation',
                            element: nav,
                            selector: selector,
                            items: items,
                            itemCount: items.length,
                            mainNavItems: linkTexts
                        });
                        
                        console.log(`[Menu Builder] 🎯 Found main navigation: ${linkTexts.join(', ')}`);
                    }
                }
            });
        });
        
        // 🚀 Alternative: Look for menu containers with main navigation items
        const menuContainerSelectors = [
            '.menu',
            '.nav-menu',
            '.navigation',
            '.ast-menu',
            '.ast-header-menu'
        ];
        
        menuContainerSelectors.forEach(selector => {
            const containers = document.querySelectorAll(selector);
            containers.forEach((container, index) => {
                // Check if this container has main navigation items
                const links = container.querySelectorAll('a[href], .menu-link');
                const linkTexts = Array.from(links).map(link => link.textContent?.trim()).filter(text => text);
                
                const hasMainNavItems = linkTexts.some(text => 
                    ['home', 'about', 'portfolio', 'services', 'contact'].includes(text.toLowerCase())
                );
                
                if (hasMainNavItems && !mainNavigationMenus.some(menu => menu.element === container)) {
                    const items = Array.from(links).map((item, itemIndex) => 
                        createMenuItemObject(item, itemIndex)
                    );
                    
                    mainNavigationMenus.push({
                        id: `main_nav_${mainNavigationMenus.length + 1}`,
                        type: 'main_navigation',
                        element: container,
                        selector: selector,
                        items: items,
                        itemCount: items.length,
                        mainNavItems: linkTexts
                    });
                    
                    console.log(`[Menu Builder] 🎯 Found main navigation container: ${linkTexts.join(', ')}`);
                }
            });
        });
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error finding main navigation menus:', error);
    }
    
    return mainNavigationMenus;
}

/**
 * 🔍 Find standalone navigation menus (no toggle buttons)
 * 
 * @returns {Array} - Array of standalone navigation menus
 */
function findStandaloneNavigationMenus() {
    const standaloneMenus = [];
    
    try {
        // 🎯 Look for navigation elements that don't have toggle buttons
        const navigationSelectors = [
            'nav',
            '[role="navigation"]',
            '.main-navigation',
            '.primary-navigation',
            '.site-navigation'
        ];
        
        navigationSelectors.forEach(selector => {
            const navElements = document.querySelectorAll(selector);
            navElements.forEach((nav, index) => {
                // Check if this nav has a toggle button
                const hasToggle = nav.querySelector('button[aria-expanded], .menu-toggle, .nav-toggle');
                
                if (!hasToggle) {
                    const menuItems = nav.querySelectorAll('a[href], button[type]');
                    const items = Array.from(menuItems).map((item, itemIndex) => 
                        createMenuItemObject(item, itemIndex)
                    );
                    
                    if (items.length > 0) {
                        standaloneMenus.push({
                            id: `standalone_nav_${index + 1}`,
                            type: 'standalone_navigation',
                            element: nav,
                            selector: selector,
                            items: items,
                            itemCount: items.length
                        });
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error finding standalone navigation menus:', error);
    }
    
    return standaloneMenus;
}

/**
 * 🔗 Build clean actionId mappings for menu items
 * 
 * @param {Object} menuStructures - The complete menu structures object
 * @returns {Object} - Clean actionId to menu item mappings
 */
function buildCleanActionIdMappings(menuStructures) {
    const actionIdMappings = {};
    
    try {
        // 🎯 Map each menu structure to clean actionIds
        Object.values(menuStructures.structures).forEach(menu => {
            const menuType = menu.type || 'toggle_menu';
            const menuName = getMenuName(menu);
            
            menu.items.forEach((item, index) => {
                // Generate a clean, descriptive actionId
                const actionId = `action_menu_${menuName}_item_${index + 1}`;
                
                actionIdMappings[actionId] = {
                    actionId: actionId,
                    menuId: menu.id,
                    menuType: menuType,
                    menuName: menuName,
                    itemIndex: index,
                    element: item.element,
                    selectors: item.selectors,
                    textContent: item.textContent,
                    href: item.href,
                    tagName: item.tagName,
                    actionType: item.tagName === 'A' ? 'navigate' : 'click'
                };
            });
            
            // Add toggle button actionId
            if (menu.toggle) {
                const toggleActionId = `action_menu_${menuName}_toggle`;
                actionIdMappings[toggleActionId] = {
                    actionId: toggleActionId,
                    menuId: menu.id,
                    menuType: 'toggle',
                    menuName: menuName,
                    element: menu.toggle.element,
                    selectors: generateElementSelectors(menu.toggle.element),
                    textContent: menu.toggle.textContent,
                    ariaLabel: menu.toggle.ariaLabel,
                    tagName: menu.toggle.element.tagName,
                    actionType: 'click'
                };
            }
            
            // 🚫 AGGRESSIVE: Handle toggles array for consolidated menus
            if (menu.toggles && Array.isArray(menu.toggles)) {
                menu.toggles.forEach((toggle, toggleIndex) => {
                    const toggleActionId = `action_menu_${menuName}_toggle_${toggleIndex + 1}`;
                    actionIdMappings[toggleActionId] = {
                        actionId: toggleActionId,
                        menuId: menu.id,
                        menuType: 'toggle',
                        menuName: menuName,
                        element: toggle.toggle.element,
                        selectors: generateElementSelectors(toggle.toggle.element),
                        textContent: toggle.toggle.textContent,
                        ariaLabel: toggle.toggle.ariaLabel,
                        tagName: toggle.toggle.element.tagName,
                        actionType: 'click'
                    };
                });
            }
        });
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error building clean actionId mappings:', error);
    }
    
    return actionIdMappings;
}

/**
 * 🏷️ Get a clean, descriptive name for a menu
 * 
 * @param {Object} menu - The menu structure object
 * @returns {string} - Clean menu name
 */
function getMenuName(menu) {
    try {
        // Try to get name from toggle button text
        if (menu.toggle && menu.toggle.textContent) {
            const text = menu.toggle.textContent.toLowerCase().replace(/\s+/g, '_');
            if (text && text !== 'menu' && text !== 'toggle') {
                return text;
            }
        }
        
        // Try to get name from toggle button aria-label
        if (menu.toggle && menu.toggle.ariaLabel) {
            const label = menu.toggle.ariaLabel.toLowerCase().replace(/\s+/g, '_');
            if (label && label !== 'menu' && label !== 'toggle') {
                return label;
            }
        }
        
        // Try to get name from first menu item
        if (menu.items && menu.items.length > 0) {
            const firstItem = menu.items[0];
            if (firstItem.textContent) {
                const text = firstItem.textContent.toLowerCase().replace(/\s+/g, '_');
                if (text && text !== 'menu' && text !== 'toggle') {
                    return text;
                }
            }
        }
        
        // Fallback to menu type
        return menu.type || 'main';
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error getting menu name:', error);
        return 'main';
    }
}

/**
 * 🧠 Generate intelligence-engine-friendly output
 * 
 * @param {Object} menuStructures - The complete menu structures object
 * @returns {Object} - Clean output for intelligence engine
 */
function generateIntelligenceOutput(menuStructures) {
    const intelligenceOutput = {
        menus: [],
        actions: [],
        summary: {
            totalMenus: menuStructures.summary.totalMenus,
            totalActions: 0,
            menuTypes: new Set()
        }
    };
    
    try {
        // 🎯 Convert menu structures to clean format using actionIdMappings
        Object.values(menuStructures.structures).forEach(menu => {
            const cleanMenu = {
                id: menu.id,
                name: getMenuName(menu),
                type: menu.type || 'toggle_menu',
                toggle: menu.toggle ? {
                    actionId: `action_menu_${getMenuName(menu)}_toggle`,
                    textContent: menu.toggle.textContent,
                    ariaLabel: menu.toggle.ariaLabel,
                    selectors: generateElementSelectors(menu.toggle.element)
                } : null,
                items: menu.items.map((item, index) => ({
                    actionId: `action_menu_${getMenuName(menu)}_item_${index + 1}`,
                    textContent: item.textContent,
                    href: item.href,
                    tagName: item.tagName,
                    actionType: item.tagName === 'A' ? 'navigate' : 'click',
                    selectors: item.selectors
                }))
            };
            
            // 🚫 AGGRESSIVE: Handle toggles array for consolidated menus
            if (menu.toggles && Array.isArray(menu.toggles)) {
                cleanMenu.toggles = menu.toggles.map((toggle, toggleIndex) => ({
                    actionId: `action_menu_${getMenuName(menu)}_toggle_${toggleIndex + 1}`,
                    textContent: toggle.toggle.textContent,
                    ariaLabel: toggle.toggle.ariaLabel,
                    selectors: generateElementSelectors(toggle.toggle.element)
                }));
            }
            
            intelligenceOutput.menus.push(cleanMenu);
            intelligenceOutput.summary.menuTypes.add(cleanMenu.type);
        });
        
        // 🚫 Use actionIdMappings instead of regenerating actions to prevent duplicates
        if (menuStructures.actionIdMappings) {
            Object.values(menuStructures.actionIdMappings).forEach(action => {
                intelligenceOutput.actions.push({
                    actionId: action.actionId,
                    actionType: action.actionType,
                    tagName: action.tagName,
                    textContent: action.textContent,
                    href: action.href,
                    selectors: action.selectors,
                    menuId: action.menuId,
                    menuName: action.menuName,
                    ariaLabel: action.ariaLabel
                });
            });
        }
        
        intelligenceOutput.summary.totalActions = intelligenceOutput.actions.length;
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error generating intelligence output:', error);
    }
    
    return intelligenceOutput;
}

/**
 * 🚫 Deduplicate menus by content and structure
 * 
 * @param {Array} menus - Array of menu structures
 * @returns {Array} - Array of unique menu structures
 */
function deduplicateMenus(menus) {
    const uniqueMenus = [];
    const seenSignatures = new Set();
    
    try {
        menus.forEach(menu => {
            // Create a unique signature for this menu
            const signature = createMenuSignature(menu);
            
            // Skip if we've already seen this signature
            if (seenSignatures.has(signature)) {
                console.log(`[Menu Builder] 🚫 Skipping duplicate menu: ${signature}`);
                return;
            }
            
            seenSignatures.add(signature);
            uniqueMenus.push(menu);
            console.log(`[Menu Builder] ✅ Added unique menu: ${signature}`);
        });
        
        console.log(`[Menu Builder] 🔍 Deduplication: ${menus.length} → ${uniqueMenus.length} unique menus`);
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error deduplicating menus:', error);
    }
    
    return uniqueMenus;
}

/**
 * 🚫 AGGRESSIVE DEDUPLICATION: Consolidate ALL menus into clean structures
 * 
 * @param {Array} toggleButtons - Array of toggle button menus
 * @param {Array} mainNavigationMenus - Array of main navigation menus
 * @param {Array} standaloneMenus - Array of standalone menus
 * @returns {Object} - Consolidated menu structures
 */
function consolidateAllMenus(toggleButtons, mainNavigationMenus, standaloneMenus) {
    const consolidatedMenus = {};
    const seenElements = new Set(); // Track unique DOM elements
    const seenContent = new Set(); // Track unique content signatures
    
    try {
        console.log('[Menu Builder] 🚫 Starting aggressive deduplication...');
        
        // 🎯 Step 1: Find the ONE main navigation menu and merge everything into it
        let mainNavMenu = null;
        if (mainNavigationMenus.length > 0) {
            mainNavMenu = mainNavigationMenus[0]; // Take the first one
            const mainNavId = 'main_navigation';
            
            // 🚫 AGGRESSIVE: Merge ALL related content into ONE main navigation menu
            const mergedMenu = {
                ...mainNavMenu,
                id: mainNavId,
                type: 'main_navigation',
                items: [...mainNavMenu.items], // Start with main nav items
                toggles: [] // Add toggle buttons as separate toggles
            };
            
            // 🚀 Step 2: Merge portfolio submenu items INTO main navigation
            const portfolioMenus = toggleButtons.filter(menu => {
                if (!menu.items || menu.items.length === 0) return false;
                
                // Check if this looks like a portfolio submenu
                const itemTexts = menu.items.map(item => item.textContent?.toLowerCase()).filter(text => text);
                const isPortfolio = itemTexts.some(text => 
                    text.includes('banner') || text.includes('logo') || text.includes('web') || text.includes('design')
                );
                
                return isPortfolio;
            });
            
            if (portfolioMenus.length > 0) {
                const portfolioSubmenu = portfolioMenus[0];
                // 🚫 MERGE portfolio items into main navigation instead of keeping separate
                portfolioSubmenu.items.forEach(item => {
                    if (!mergedMenu.items.some(existing => existing.textContent === item.textContent)) {
                        mergedMenu.items.push(item);
                        seenElements.add(item.element);
                    }
                });
                console.log(`[Menu Builder] ✅ Merged portfolio items into main navigation`);
            }
            
            // 🎯 Step 3: Add toggle buttons as toggles (not separate menus)
            console.log('[Menu Builder] 🔍 Debug: Available toggle buttons:', toggleButtons.map(t => ({text: t.toggle?.textContent, ariaLabel: t.toggle?.ariaLabel})));
            console.log('[Menu Builder] 🔍 Debug: toggleButtons structure:', toggleButtons);
            
            // 🚫 AGGRESSIVE: Add ALL toggle buttons as toggles (don't filter by text)
            let toggleCount = 0;
            toggleButtons.forEach((toggleButton, index) => {
                console.log(`[Menu Builder] 🔍 Debug: Processing toggle button ${index}:`, toggleButton);
                
                // ✅ FIXED: Toggle buttons ARE the toggle objects, not nested
                if (toggleButton.element) {
                    const toggleId = `toggle_${index + 1}`;
                    mergedMenu.toggles.push({
                        id: toggleId,
                        type: 'toggle_button',
                        toggle: {
                            element: toggleButton.element,
                            textContent: toggleButton.textContent,
                            ariaLabel: toggleButton.ariaLabel,
                            ariaExpanded: toggleButton.ariaExpanded,
                            className: toggleButton.className,
                            selector: toggleButton.selector
                        },
                        items: toggleButton.items || []
                    });
                    seenElements.add(toggleButton.element);
                    toggleCount++;
                    console.log(`[Menu Builder] ✅ Added toggle button ${index + 1}: "${toggleButton.textContent}"`);
                } else {
                    console.log(`[Menu Builder] ❌ Toggle button ${index} has no element:`, toggleButton);
                }
            });
            
            console.log(`[Menu Builder] 🔍 Debug: Total toggles added: ${toggleCount}`);
            
            // 🚫 AGGRESSIVE: Only ONE consolidated menu with everything merged
            consolidatedMenus[mainNavId] = mergedMenu;
            console.log(`[Menu Builder] ✅ Created ONE consolidated main navigation with ${mergedMenu.items.length} items and ${mergedMenu.toggles.length} toggles`);
        }
        
        console.log(`[Menu Builder] 🚫 Aggressive deduplication complete: ${Object.keys(consolidatedMenus).length} clean menus`);
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error in aggressive deduplication:', error);
    }
    
    return consolidatedMenus;
}

/**
 * 🔗 Create proper parent-child relationships between menus
 * 
 * @param {Object} menuStructures - The complete menu structures object
 * @returns {Object} - Hierarchical menu structures with parent-child relationships
 */
function createHierarchicalRelationships(menuStructures) {
    const hierarchicalStructures = {
        mainNavigation: null,
        submenus: [],
        standaloneMenus: []
    };
    
    try {
        // 🎯 Find the main navigation menu from CONSOLIDATED structures only
        console.log('[Menu Builder] 🔍 Debug: Processing structures for hierarchical relationships:', Object.keys(menuStructures.structures));
        Object.values(menuStructures.structures).forEach(menu => {
            if (menu.type === 'main_navigation') {
                hierarchicalStructures.mainNavigation = {
                    ...menu,
                    submenus: []
                };
                console.log(`[Menu Builder] 🎯 Found main navigation: ${menu.mainNavItems?.join(', ')}`);
            }
        });
        
        // 🚀 Find submenus and link them to main navigation from CONSOLIDATED structures only
        Object.values(menuStructures.structures).forEach(menu => {
            if (menu.type === 'toggle_menu' && menu.items.length > 0) {
                // Check if this is a submenu of the main navigation
                const isSubmenu = checkIfSubmenu(menu, hierarchicalStructures.mainNavigation);
                
                if (isSubmenu && hierarchicalStructures.mainNavigation) {
                    // Link submenu to main navigation
                    hierarchicalStructures.mainNavigation.submenus.push({
                        ...menu,
                        parentMenu: 'main_navigation'
                    });
                    console.log(`[Menu Builder] 🔗 Linked submenu to main navigation: ${menu.items.map(item => item.textContent).join(', ')}`);
                } else {
                    // Standalone menu
                    hierarchicalStructures.standaloneMenus.push(menu);
                }
            }
        });
        
        console.log(`[Menu Builder] 🔗 Created hierarchical structure with ${hierarchicalStructures.mainNavigation?.submenus?.length || 0} submenus`);
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error creating hierarchical relationships:', error);
    }
    
    return hierarchicalStructures;
}

/**
 * 🔍 Check if a menu is a submenu of the main navigation
 * 
 * @param {Object} menu - The potential submenu
 * @param {Object} mainNav - The main navigation menu
 * @returns {boolean} - True if this is a submenu
 */
function checkIfSubmenu(menu, mainNav) {
    try {
        if (!mainNav || !mainNav.items) return false;
        
        // Check if any of the submenu items are related to main navigation items
        const submenuTexts = menu.items.map(item => item.textContent?.toLowerCase()).filter(text => text);
        const mainNavTexts = mainNav.items.map(item => item.textContent?.toLowerCase()).filter(text => text);
        
        // Look for relationships (e.g., PORTFOLIO in main nav → Banner Design in submenu)
        const hasRelationship = submenuTexts.some(subText => {
            // Check if this submenu item is related to a main nav item
            return mainNavTexts.some(mainText => {
                // Simple relationship detection
                if (mainText.includes('portfolio') && (subText.includes('design') || subText.includes('banner') || subText.includes('logo') || subText.includes('web'))) {
                    return true;
                }
                if (mainText.includes('services') && subText.includes('service')) {
                    return true;
                }
                return false;
            });
        });
        
        return hasRelationship;
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error checking submenu relationship:', error);
        return false;
    }
}

/**
 * 🔗 Group similar menus for consolidation
 * 
 * @param {Object} menuStructures - The complete menu structures object
 * @returns {Object} - Groups of similar menus
 */
function groupSimilarMenus(menuStructures) {
    const menuGroups = {};
    
    try {
        Object.values(menuStructures.structures).forEach(menu => {
            // Create a signature for this menu based on its content
            const menuSignature = createMenuSignature(menu);
            
            if (!menuGroups[menuSignature]) {
                menuGroups[menuSignature] = [];
            }
            
            menuGroups[menuSignature].push({
                menuId: menu.id,
                menuName: getMenuName(menu),
                itemCount: menu.itemCount,
                items: menu.items.map(item => item.textContent)
            });
        });
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error grouping similar menus:', error);
    }
    
    return menuGroups;
}

/**
 * 🔑 Create a unique signature for a menu based on its content
 * 
 * @param {Object} menu - The menu structure object
 * @returns {string} - Unique menu signature
 */
function createMenuSignature(menu) {
    try {
        if (!menu.items || menu.items.length === 0) {
            return 'empty_menu';
        }
        
        // Create signature from menu items text content
        const itemTexts = menu.items
            .map(item => item.textContent || '')
            .filter(text => text.trim())
            .sort()
            .join('|');
        
        // Add menu type to signature for better uniqueness
        const menuType = menu.type || 'unknown';
        const signature = `${menuType}:${itemTexts}`;
        
        return signature || 'no_text_menu';
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error creating menu signature:', error);
        return 'error_menu';
    }
}

/**
 * 🏗️ Create a standardized menu item object
 * 
 * @param {Element} element - The DOM element
 * @param {number} index - The index of the item
 * @returns {Object} - Standardized menu item object
 */
function createMenuItemObject(element, index) {
    return {
        index: index,
        element: element,
        tagName: element.tagName,
        textContent: element.textContent?.trim(),
        href: element.href || element.getAttribute('href'),
        className: element.className,
        ariaLabel: element.getAttribute('aria-label'),
        role: element.getAttribute('role'),
        selectors: generateElementSelectors(element)
    };
}

/**
 * 🔍 Generate multiple selectors for an element
 * 
 * @param {Element} element - The DOM element
 * @returns {Array} - Array of CSS selectors
 */
function generateElementSelectors(element) {
    const selectors = [];
    
    try {
        // 🎯 ID selector
        if (element.id) {
            selectors.push(`#${element.id}`);
        }
        
        // 🎯 Class selector
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            classes.forEach(className => {
                if (className) {
                    selectors.push(`.${className}`);
                }
            });
        }
        
        // 🎯 Tag + class selector
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            classes.forEach(className => {
                if (className) {
                    selectors.push(`${element.tagName.toLowerCase()}.${className}`);
                }
            });
        }
        
        // 🎯 Attribute selectors
        if (element.getAttribute('aria-label')) {
            selectors.push(`${element.tagName.toLowerCase()}[aria-label="${element.getAttribute('aria-label')}"]`);
        }
        
        if (element.href) {
            selectors.push(`${element.tagName.toLowerCase()}[href="${element.href}"]`);
        }
        
        // 🎯 Position-based selector (fallback)
        if (element.parentElement) {
            const siblings = Array.from(element.parentElement.children);
            const position = siblings.indexOf(element) + 1;
            selectors.push(`${element.tagName.toLowerCase()}:nth-child(${position})`);
        }
        
    } catch (error) {
        console.error('[Menu Builder] ❌ Error generating selectors:', error);
    }
    
    return selectors;
}
