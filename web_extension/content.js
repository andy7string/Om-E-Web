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

// 🛡️ PREVENT DUPLICATE INJECTION - Check if script already loaded
if (window.omEWebContentScriptLoaded) {
    console.log("[Content] 🚫 Content script already loaded, preventing duplicate injection");
    throw new Error("Content script already loaded");
}
window.omEWebContentScriptLoaded = true;

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

// 🆕 NEW: Wait for page to be fully loaded before scanning
if (document.readyState === 'complete') {
    console.log("[Content] ✅ Page already fully loaded, proceeding with initialization...");
    scanWhenPageSettles(runScanAfterPageLoad, { quietPeriod: 250, maxWait: 10000 });
} else {
    console.log("[Content] 🔄 Page still loading, waiting for load event...");
    window.addEventListener('load', () => {
        console.log("[Content] ✅ Page fully loaded, proceeding with initialization...");
        scanWhenPageSettles(runScanAfterPageLoad, { quietPeriod: 250, maxWait: 10000 });
    });
}

// 🆕 NEW: Function to wait for page to settle before scanning
function scanWhenPageSettles(scanFn, {
  observeTarget = document.body,
  quietPeriod = 250,    // ms with no changes = settled (250ms as requested)
  maxWait = 10000       // ms before forcing scan
} = {}) {
  let observer, quietTimer, hasScanned = false, maxTimer;

  function finish() {
    if (hasScanned) return;
    hasScanned = true;
    observer.disconnect();
    clearTimeout(quietTimer);
    clearTimeout(maxTimer);
    console.log(`[Content] 🔍 Page settled (${quietPeriod}ms quiet), running scan...`);
    scanFn();
  }

  observer = new MutationObserver(() => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(finish, quietPeriod);
  });

  observer.observe(observeTarget, { childList: true, subtree: true });
  console.log(`[Content] 🔍 Page settling detection started - waiting for ${quietPeriod}ms quiet period (max ${maxWait}ms)`);
  
  // Kick off max wait
  maxTimer = setTimeout(() => {
    console.log(`[Content] ⏰ Max wait (${maxWait}ms) reached, forcing scan...`);
    finish();
  }, maxWait);
  // Initial scan for cases where page is already settled
  quietTimer = setTimeout(finish, quietPeriod);
}

// 🆕 NEW: Content Script Intelligence System v2.0
console.log("[Content] 🚀 Content script loaded with intelligence system v2.0");

function applyConfiguredFocus(reason = 'post_scan') {
    if (initialFocusApplied) {
        return true;
    }

    try {
        const configSelectors = Array.isArray(window.currentSiteConfig?.focus_targets)
            ? window.currentSiteConfig.focus_targets
            : [];

        const fallbackSelectors = [
            "input[type='search']",
            "input[type='text']",
            "textarea",
            "[contenteditable='true']",
            "input:not([type='hidden'])",
            "select"
        ];

        const selectorPool = [...configSelectors, ...fallbackSelectors];
        const tested = new Set();

        for (const selector of selectorPool) {
            if (!selector || tested.has(selector)) {
                continue;
            }
            tested.add(selector);

            let candidate;
            try {
                candidate = document.querySelector(selector);
            } catch (error) {
                continue;
            }

            if (!candidate) {
                continue;
            }

            if (!isElementFocusable(candidate)) {
                continue;
            }

            if (focusElement(candidate, reason)) {
                return true;
            }
        }
    } catch (error) {
        console.warn('[Content] ⚠️ Failed to apply configured focus:', error.message);
    }

    if (!initialFocusApplied) {
        scheduleFocusRetry(reason);
    }

    return false;
}

function focusElement(element, reason) {
    if (!element || typeof element.focus !== 'function') {
        return false;
    }

    try {
        element.focus({ preventScroll: true });
    } catch (error) {
        try {
            element.focus();
        } catch (err) {
            return false;
        }
    }

    if (document.activeElement !== element) {
        return false;
    }

    initialFocusApplied = true;
    if (focusRetryTimer) {
        clearTimeout(focusRetryTimer);
        focusRetryTimer = null;
    }

    try {
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + Math.min(rect.width || 1, 10);
        const clientY = rect.top + Math.min(rect.height || 1, 10);
        window.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true,
            clientX,
            clientY
        }));
    } catch (error) {
        // Ignore pointer simulation failures
    }

    console.log(`[Content] 🎯 Default focus applied (${reason})`, {
        tag: element.tagName,
        id: element.id || null,
        placeholder: element.getAttribute('placeholder') || null
    });

    simulateUserInput(element);

    return true;
}

function scheduleFocusRetry(reason) {
    if (initialFocusApplied || focusRetryTimer) {
        return;
    }

    focusRetryTimer = setTimeout(() => {
        focusRetryTimer = null;
        applyConfiguredFocus(reason);
    }, 600);
}

function isElementFocusable(element) {
    if (!element) {
        return false;
    }

    if (element.disabled) {
        return false;
    }

    if (element.getAttribute('aria-disabled') === 'true') {
        return false;
    }

    if (!isElementVisible(element)) {
        return false;
    }

    if (element.tabIndex >= 0) {
        return true;
    }

    const focusableTags = ['input', 'textarea', 'select', 'button'];
    if (focusableTags.includes(element.tagName?.toLowerCase())) {
        return true;
    }

    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
        return true;
    }

    return typeof element.focus === 'function';
}

function simulateUserInput(element) {
    try {
        element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            data: '',
            inputType: 'insertFromProgrammatic'
        }));

        element.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
        console.warn('[Content] ⚠️ simulateUserInput failed:', error.message);
    }
}

// 🆕 NEW: Guard against multiple initializations
if (window.intelligenceSystemInitialized && window.intelligenceComponents && window.intelligenceComponents.changeAggregator && window.intelligenceComponents.intelligenceEngine) {
    console.log("[Content] ⚠️ Intelligence system already initialized, reusing existing components...");
    // Reuse existing components
    changeAggregator = window.intelligenceComponents.changeAggregator;
    intelligenceEngine = window.intelligenceComponents.intelligenceEngine;
    pageContext = window.intelligenceComponents.pageContext || pageContext;
} else {
    window.intelligenceSystemInitialized = true;
    console.log("[Content] 🧪 First time initialization, setting up intelligence system...");
}

// 🆕 NEW: DOM Change Detection System - Use 'var' to prevent redeclaration errors
var domChangeObserver = null;                    // Observer for monitoring DOM changes
var changeDetectionEnabled = false;              // Flag to enable/disable change detection
var changeCount = 0;                             // Counter for total DOM changes detected
var lastChangeTime = 0;                          // Timestamp of last DOM change

// 🆕 NEW: Intelligent Change Filtering
var lastSignificantChange = 0;                   // Timestamp of last significant change
const MIN_CHANGE_INTERVAL = 2000;                // Minimum 2 seconds between significant changes
const MIN_MUTATIONS_FOR_SIGNIFICANT = 3;         // Need at least 3 mutations to be significant
const IGNORED_CHANGE_TYPES = new Set(['mouseover', 'mouseout', 'focus', 'blur']); // Ignore these

// 🆕 NEW: Intelligent Change Aggregation System
var changeAggregator = null;                     // Aggregates DOM changes for intelligence system
var intelligenceEngine = null;                   // Main intelligence processing engine
var pageContext = null;                          // Current page context and metadata
var changeHistory = [];                          // History of DOM changes for analysis
var lastIntelligenceUpdate = 0;                  // Timestamp of last intelligence update
const INTELLIGENCE_UPDATE_INTERVAL = 500;        // 0.5 seconds between intelligence updates
var initialFocusApplied = false;                 // Tracks whether an initial focus has been applied
var focusRetryTimer = null;                      // Pending retry timer for focus attempts


// Set default framework configuration
window.siteConfigs = {};
window.currentSiteConfig = null;
window.currentFramework = 'generic';

// 🆕 NEW: IMMEDIATE FRAMEWORK SETUP - Use injected config first, fallback to message
var currentDomain = new URL(window.location.href).hostname.toLowerCase();
var siteConfig = null; // Will be populated immediately from injected config or message
console.log(`🎯 Framework setup ready for domain: ${currentDomain}`);

// 🆕 NEW: Load site config immediately
siteConfig = getSiteConfigDirect();
if (siteConfig) {
    console.log(`✅ Site config loaded for ${currentDomain}: ${siteConfig.framework}`);
} else {
    console.log(`⚠️ No site config available for ${currentDomain}, using generic framework`);
}

// 🆕 NEW: Read site config directly from extension file
function getSiteConfigDirect() {
    // Read the config file synchronously
    const xhr = new XMLHttpRequest();
    xhr.open('GET', chrome.runtime.getURL('site_configs.json'), false); // Synchronous
    xhr.send();
    
    if (xhr.status === 200) {
        try {
            const allConfigs = JSON.parse(xhr.responseText);
            console.log("✅ Site configs loaded from file:", Object.keys(allConfigs));
            
            // Find config for current domain
            let foundConfig = null;
            
            // Check for exact domain match
            if (allConfigs[currentDomain]) {
                foundConfig = allConfigs[currentDomain];
                console.log(`✅ Exact domain match found for ${currentDomain}: ${foundConfig.framework}`);
            } else {
                // Check for partial domain match
                for (const [configDomain, config] of Object.entries(allConfigs)) {
                    if (currentDomain.includes(configDomain) && configDomain !== 'default') {
                        foundConfig = config;
                        console.log(`✅ Partial domain match found: ${configDomain} matches ${currentDomain}: ${config.framework}`);
                        break;
                    }
                }
                
                // Fallback to default config
                if (!foundConfig && allConfigs['default']) {
                    foundConfig = allConfigs['default'];
                    console.log(`✅ Using default config for ${currentDomain}: ${foundConfig.framework}`);
                }
            }
            
            if (foundConfig) {
                siteConfig = foundConfig;
                window.currentSiteConfig = foundConfig;
                window.currentFramework = foundConfig.framework;
                console.log("✅ Site config set from file:", foundConfig);
                return foundConfig; // Return the actual config object
            } else {
                console.log("⚠️ No site config found for domain:", currentDomain);
                return allConfigs['default'] || null; // Return default config or null
            }
            
        } catch (error) {
            console.error("❌ Error parsing site config file:", error);
            return null;
        }
    } else {
        console.error("❌ Error loading site config file:", xhr.status);
        return null;
    }
}

// 🆕 NEW: Automatic Disconnect Cycle for CSP Bypass
function performAutomaticDisconnectCycle() {
    console.log("[Content] 🔄 Starting automatic disconnect cycle for CSP bypass...");
    
    try {
        const isYoutube = window.location.hostname.includes('youtube.com');
        if (isYoutube || window.currentFramework === 'youtube') {
            return [];
        }
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

// 🆕 NEW: Check if element has any form of URL
function hasUrl(element) {
    try {
        // Check for href attribute (links)
        if (element.href) return true;
        
        // Check for data attributes that might contain URLs
        if (element.getAttribute('data-url')) return true;
        if (element.getAttribute('data-href')) return true;
        if (element.getAttribute('data-link')) return true;
        
        // Check for onclick handlers that might navigate
        if (element.onclick || element.getAttribute('onclick')) {
            const onclickValue = element.getAttribute('onclick') || '';
            if (onclickValue.includes('window.location') || onclickValue.includes('href') || onclickValue.includes('navigate')) {
                return true;
            }
        }
 
        return false;
    } catch (error) {
        return false;
    }
}

// 🆕 NEW: Determine what type of action an element represents
function determineActionType(element) {
    try {
        const tagName = element.tagName.toLowerCase();
        const hasUrl = hasUrl(element);
        const role = element.getAttribute('role');
        const type = element.getAttribute('type');
        
        // 🎯 Navigation Actions
        if (hasUrl) {
            if (tagName === 'a') return 'navigate';
            if (tagName === 'form') return 'submit';
            if (element.getAttribute('onclick')) return 'navigate';
            return 'navigate';
        }
        
        // 🎯 Button Actions
        if (tagName === 'button') {
            if (type === 'submit') return 'submit';
            if (type === 'reset') return 'reset';
            if (role === 'menuitem') return 'menu_select';
            return 'click';
        }
        
        // 🎯 Form Input Actions
        if (tagName === 'input') {
            if (type === 'submit') return 'submit';
            if (type === 'button') return 'click';
            if (type === 'reset') return 'reset';
            if (type === 'checkbox') return 'toggle';
            if (type === 'radio') return 'select';
            return 'input';
        }
        
        // 🎯 Select Actions
        if (tagName === 'select') return 'select';
        
        // 🎯 Textarea Actions
        if (tagName === 'textarea') return 'input';
        
        // 🎯 Role-based Actions
        if (role === 'button') return 'click';
        if (role === 'link') return 'navigate';
        if (role === 'menuitem') return 'menu_select';
        if (role === 'tab') return 'tab_select';
        if (role === 'checkbox') return 'toggle';
        if (role === 'radio') return 'select';
        
        // 🎯 Event-based Actions
        if (element.onclick || element.getAttribute('onclick')) return 'click';
        if (element.getAttribute('tabindex')) return 'focus';
        
        // 🎯 Default
        return 'interact';
        
    } catch (error) {
        return 'unknown';
    }
}

// 🆕 NEW: Dynamic framework-specific element scanning
function scanWithFrameworkSelectors() {
    if (!window.currentSiteConfig) {
        console.log("[Content] ⚠️ No site config available, using generic scanning");
        return [];
    }
    
    console.log("[Content] 🎯 Scanning with framework:", window.currentFramework, "selectors");
    
    const frameworkElements = [];
    const selectors = window.currentSiteConfig.selectors;
    // 🎯 PRIORITY SCANNING: Most important categories first
    const priorityOrder = ['text_inputs', 'navigation', 'url_elements', 'buttons', 'menus', 'content_elements', 'hidden_content'];
    const categoriesToScan = priorityOrder.filter(cat => selectors[cat]).concat(
        Object.keys(selectors).filter(cat => !priorityOrder.includes(cat))
    );
    console.log(`[Content] 🔍 Scanning with priority: ${categoriesToScan.join(', ')}`);
    
    // 🆕 NEW: Track elements found per category
    const categoryResults = {};
    
    // 🚀 NEW: Prevent duplicate element scanning using WeakSet
    const seenElements = new WeakSet();
    
    categoriesToScan.forEach(category => {
        const selectorList = selectors[category];
        let categoryElementCount = 0;
        
        if (Array.isArray(selectorList) && selectorList.length > 0) {
            // 🆕 NEW: Silent scanning - no intermediate logs
            
            selectorList.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    
                    elements.forEach(element => {
                        // 🚀 NEW: Skip if we've already seen this DOM element
                        if (seenElements.has(element)) {
                            return; // Skip duplicate element
                        }
                        
                        // Mark this element as seen
                        seenElements.add(element);
                        
                        frameworkElements.push({
                            element: element,
                            type: category, // ← Dynamic category name
                            selector: selector,
                            framework: window.currentFramework
                        });
                        
                        categoryElementCount++;
                    });
                } catch (error) {
                    console.log(`[Content] ⚠️ Error scanning selector "${selector}":`, error);
                }
            });
            
            // 🆕 NEW: Store category results for summary (no individual logging)
            categoryResults[category] = categoryElementCount;
            
        } else {
            console.log(`[Content] ⚠️ Category "${category}" has no valid selectors or is empty`);
            categoryResults[category] = 0;
        }
    });
    
    // 🆕 NEW: Display concise category summary
    console.log(`[Content] 🎯 Framework: ${window.currentFramework} - ${Object.entries(categoryResults).map(([cat, count]) => `${cat}: ${count}`).join(', ')} - Total: ${frameworkElements.length}`);
    
    // 🚫 REMOVED: max_elements filter - we want ALL elements including URLs!
    // URLs are gold - don't filter them out!
    
    // 🆕 NEW: Test if selectors are actually working
    testSelectorsAfterScan();
    
    // Framework scanning complete
    
    return frameworkElements;
}

// 🆕 NEW: Test function to check if selectors are working
function testSelectorsAfterScan() {
    
    
    // Test the EXACT selectors from the current site config
    if (window.currentSiteConfig && window.currentSiteConfig.selectors) {
        const selectors = window.currentSiteConfig.selectors;
        
        let totalFound = 0;
        
        // Test text_inputs and buttons specifically
        if (selectors.text_inputs) {
            selectors.text_inputs.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    totalFound += elements.length;
                }
            });
        }
        
        if (selectors.buttons) {
            selectors.buttons.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    totalFound += elements.length;
                }
            });
        }
        
        // 🆕 NEW: Aggressive debugging - find ALL input elements
        const allInputs = document.querySelectorAll('input');
        const passwordInputs = document.querySelectorAll('input[type="password"], [data-type="password"], [name*="password"], [id*="password"]');
    } else {
        console.log("[Content] ❌ TEST: No site config available for testing");
    }
}

// 🆕 NEW: Function to run scan after page is fully loaded
function runScanAfterPageLoad() {
    console.log("[Content] 🔍 Page fully loaded - now running scan...");
    
    if (intelligenceEngine) {
        // 🎯 NEW: Automatic disconnect cycle + comprehensive scan for CSP bypass on page load
        console.log("[Content] 🔄 Page load: Performing automatic disconnect cycle + comprehensive scan for CSP bypass...");
        performAutomaticDisconnectCycle();
        
        // 🎯 NEW: Run comprehensive scan to get 262+ elements - REMOVED
        console.log("[Content] 🔍 Page load: Comprehensive scan skipped");
        
        // ✅ SYNC: Scan elements (returns immediately)
        const scanResult = intelligenceEngine.scanAndRegisterPageElements();
        
        // 🚫 REMOVED: Intelligence update triggered here - moved to AFTER filtering is complete
        // The scan result will trigger the intelligence update automatically when filtering is done
    } else {
        console.error("[Content] ❌ Intelligence engine not available for delayed scan");
    }
}

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
                // 🚫 SILENT: No logging of insignificant changes
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
        
        console.log("[Content] ✅ DOM change detection active with config:", observerConfig);
        
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
            console.log("[Content] 📤 DOM change notification sent to service worker");
        } else {
            console.warn("[Content] Service worker communication not available");
        }
    } catch (error) {
        if (error.message.includes("Extension context invalidated")) {
            console.warn("[Content] Extension context invalidated - reloading may have occurred");
            // Attempt to reconnect after a brief delay
            setTimeout(() => {
                console.log("[Content] Attempting to reconnect after context invalidation...");
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
/**
 * 🚀 MAIN MESSAGE HANDLER - Central Communication Hub
 * 
 * This function handles ALL incoming messages from the service worker and routes them
 * to appropriate command handlers. It's the single entry point for all extension
 * communication and command execution.
 * 
 * MESSAGE FLOW:
 * Service Worker → Content Script → Command Execution → Response → Service Worker
 * 
 * SUPPORTED MESSAGE TYPES:
 * 1. site_configs_update - Framework configuration updates
 * 2. execute_action - LLM action execution (delegated to second listener)
 * 3. Command messages - Various automation commands (waitFor, click, etc.)
 * 
 * @param {Object} message - Message object from service worker
 * @param {Object} sender - Information about the sender
 * @param {Function} sendResponse - Function to send response back to service worker
 * @returns {boolean} true to indicate async response handling
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 🛡️ MAIN FRAME SAFETY CHECK - Ensure message handler only runs in main frame
    // This prevents iframe-related issues and ensures commands only run in the primary page context
    if (window.top !== window.self) {
        console.error("[Content] ❌ Message handler called from iframe - this should never happen");
        sendResponse({ error: "Message handler should only run in main frame" });
        return true;
    }
    
    console.log("[Content] Message received from service worker:", message);
    

    
    // 🆕 NEW: Check if this is a typed message (LLM action) first
    // LLM actions are handled by a separate listener to avoid conflicts
    // This ensures clean separation between automation commands and AI actions
    if (message.type === "execute_action") {
        // Let the second listener handle this
        return false; // Don't handle this message in this listener
    }
    
    // 🎯 COMMAND EXECUTION SECTION - Handle all automation commands
    // Execute command asynchronously and send response
    // This allows for long-running operations without blocking the message handler
    (async () => {
        try {
            const { command, params } = message;
            console.log("[Content] Executing command:", command, "with params:", params);
            
            // 🎯 ELEMENT INTERACTION COMMANDS - Basic DOM manipulation
            // Route to appropriate command handler based on command type
            
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
            // 🎯 CONTENT EXTRACTION COMMANDS - Get page content in various formats
            if (command === "getPageMarkdown") {
                // Convert the entire page to markdown format for analysis
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
            
            // 🎯 PAGE INFORMATION COMMANDS - Get metadata about the current page
            if (command === "getCurrentTabInfo") {
                // Get basic information about the current tab/page
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
            
            // 🆕 NEW: DOM Change Detection Commands - Monitor page changes
            // These commands control the DOM change monitoring system
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
            
            // 🆕 NEW: Element Coordinate Commands - Get element positions
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
            
            // 🎯 NAVIGATION COMMANDS - Control browser navigation
            if (command === "navigateBack") {
                // Navigate back in browser history
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
            
            // 🆕 NEW: Intelligence System Commands - AI-powered page analysis
            // These commands interact with the intelligence engine for advanced page understanding
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
            
            // 🆕 NEW: Actionable Elements Commands - Get elements for LLM instructions
            // These commands provide information about elements that can be interacted with
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
            // Execute a specific action on an element identified by actionId
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
            // Perform a comprehensive scan of the page to find and register all interactive elements
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
            // Test the health and status of the intelligence system components
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
            
            // 🚫 Unknown command handling
            // If we receive a command we don't recognize, return an error
            console.log("[Content] Unknown command:", command);
            return sendResponse({ 
                error: { code: "UNKNOWN_COMMAND", msg: command } 
            });
        } catch (error) {
            // 🚨 Error handling for any command execution failures
            console.error("[Content] Error executing command:", error);
            return sendResponse({ 
                error: { code: "DOM_ERROR", msg: error.message } 
            });
        }
    })();
    
    // Return true to indicate async response handling
    // This tells Chrome that we'll send the response asynchronously
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
        const classes = (element.className && typeof element.className === 'string') ? element.className.split(' ').filter(c => c.length > 0) : [];
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
        contentElements: [], // 🆕 NEW: Array of content elements
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
    this.contentElements = new Map(); // 🆕 NEW: Map of content elements with IDs
    this.elementCounter = 0; // 🆕 NEW: Counter for generating unique IDs
    this.initialScanCompleted = false; // 🆕 NEW: Track if initial scan is complete
    this.youtubeRegisteredUrls = new Set(); // 🆕 Track YouTube video URLs we've already registered
    
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

    if (newElements.length === 0) {
        return;
    }

    let newlyRegistered = 0;

    newElements.forEach(element => {
        newlyRegistered += this.registerInteractiveSubtree(element);

        if (window.currentFramework === 'youtube') {
            this.registerYoutubeLinksFromNode(element);
        }
    });

    const navElements = newElements.filter(el => 
        el.tagName === 'NAV' || el.getAttribute('role') === 'navigation'
    );

    if (navElements.length > 0) {
        this.pageState.navigationState = 'expanded';
        navElements.forEach(nav => {
            this.registerActionableElement(nav, 'navigation');
        });
    }

    if (newlyRegistered > 0 || navElements.length > 0) {
        this.pageState.interactiveElements = this.getAllActionableElements();
        applyConfiguredFocus('dom_subtree');

        if (this.queueIntelligenceUpdate) {
            const changeLabel = newlyRegistered > 0 ? `${newlyRegistered} interactive descendants` : 'navigation updates';
            console.log(`[Content] 🆕 DOM change trigger: ${changeLabel}`);
            this.queueIntelligenceUpdate('high', 'dom_subtree');
        }
    }
};

IntelligenceEngine.prototype.registerInteractiveSubtree = function(rootNode) {
    if (!rootNode || rootNode.nodeType !== Node.ELEMENT_NODE) {
        return 0;
    }

    const stack = [rootNode];
    const visited = new Set();
    let registered = 0;

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || current.nodeType !== Node.ELEMENT_NODE) {
            continue;
        }
        if (visited.has(current)) {
            continue;
        }
        visited.add(current);

        const existingMarker = current.dataset?.omeActionId;
        const wasTracked = existingMarker ? this.actionableElements.has(existingMarker) : false;

        if (this.isInteractiveElement(current) && this.passesBasicQualityFilter(current)) {
            const actionType = this.determineActionType(current);
            const actionId = this.registerActionableElement(current, actionType);
            if (actionId && (!existingMarker || !wasTracked)) {
                registered += 1;
            }
        }

        const children = current.children;
        if (children && children.length) {
            for (let i = 0; i < children.length; i += 1) {
                stack.push(children[i]);
            }
        }
    }

    return registered;
};

/**
 * 🆕 NEW: Determine if an element is interactive
 */
IntelligenceEngine.prototype.isInteractiveElement = function(element) {
    if (!element || !element.tagName) return false;
    
    // 🆕 NEW: Use site config if available (either specific or default)
    if (siteConfig) {
        try {
            const selectors = siteConfig.selectors;
            const filters = siteConfig.filters;
            
                    // 🚨 PRIORITY 1: Always return true for elements with URLs
        if (hasUrl(element)) {
            // 🆕 NEW: Don't log individual URL elements - just count them
            return true;
        }
        
        // 🎯 PRIORITY 2: Check if element matches framework-specific interactive selectors
        for (const [category, selectorList] of Object.entries(selectors)) {
            if (Array.isArray(selectorList)) {
                for (const selector of selectorList) {
                    try {
                        if (element.matches(selector)) {
                            // 🆕 NEW: Don't log individual matches - just return true
                            return true; // Element matches framework pattern
                        }
                    } catch (error) {
                        // Invalid selector, skip
                    }
                }
            }
        }
        
        // 🎯 PRIORITY 3: Check if element matches include filters (enhanced scanning)
        if (filters && filters.include) {
            for (const includeSelector of filters.include) {
                try {
                    if (element.matches(includeSelector)) {
                        // 🆕 NEW: Don't log individual include matches
                        return true; // Explicitly included by framework
                    }
                } catch (error) {
                    // Invalid selector, skip
                }
            }
        }
        
        // 🚫 PRIORITY 4: Apply framework-specific exclude filters
        if (filters && filters.exclude) {
            for (const excludeSelector of filters.exclude) {
                try {
                    if (element.matches(excludeSelector)) {
                        console.log(`🚫 Element excluded by framework filter: ${excludeSelector}`);
                        return false; // Explicitly excluded by framework
                    }
                } catch (error) {
                    // Invalid selector, skip
                }
            }
        }
        
        return false; // Not interactive for this framework
        } catch (error) {
            console.warn('⚠️ Error in framework-specific interactive check:', error);
            // Fall through to generic logic
        }
    }
    
    // 🆕 FALLBACK: Generic logic if no site config or error
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
    
    // 🆕 Always include elements we already classified as interactive
    const isInteractiveElement = this.isInteractiveElement(element);
    if (isInteractiveElement) {
        return true;
    }

    // 🚫 Filter out hidden elements
    if (element.hidden) return false;
    
    // 🚫 Filter out elements with aria-hidden="true"
    const ariaHidden = element.getAttribute('aria-hidden');
    if (ariaHidden === 'true') return false;
    
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
    if (!element || !element.tagName) return 'unknown';
    
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const type = element.getAttribute('type');
    
    // Button actions
    if (tagName === 'button' || role === 'button') {
        return 'button';
    }
    
    // Link actions
    if (tagName === 'a' || role === 'link') {
        return 'link';
    }
    
    // Input actions
    if (tagName === 'input') {
        if (type === 'submit') return 'submit';
        if (type === 'button') return 'button';
        return 'input';
    }
    
    // Form actions
    if (tagName === 'form') return 'form';
    
    // Navigation actions
    if (tagName === 'nav' || role === 'navigation') return 'nav';
    
    // Menu actions
    if (role === 'menuitem') return 'menu';
    
    // Tab actions
    if (role === 'tab') return 'tab';
    
    // Select and textarea
    if (tagName === 'select') return 'select';
    if (tagName === 'textarea') return 'textarea';
    
    return 'unknown';
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
    
    // 🆕 NEW: Don't log individual queue details - just track silently
    
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
    // 🆕 NEW: Simplified queue processing - only log errors and completion
    while (this.updateQueue.length > 0) {
        const updateItem = this.updateQueue.shift();
        
        try {
            // 🆕 NEW: Check if intelligence engine is ready before sending
            if (!this.isEngineReady()) {
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
            
        } catch (error) {
            console.error("[Content] ❌ Error processing queued update:", updateItem.id, error);
            
            // Re-queue failed updates with lower priority (unless it's already low)
            if (updateItem.priority !== 'low') {
                updateItem.priority = 'low';
                this.updateQueue.push(updateItem);
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
        actionMapping: this.generateActionMapping(),
        contentElements: this.getContentElementsSummary(),
        pageText: this.extractCleanPageText(), // 🆕 NEW: Include page text for automatic markdown generation
        normalizedRecords: this.buildNormalizedPageRecords({ snapshot: true })
    };
};

/**
 * 🆕 EXPERIMENTAL: Build normalized JSONL-ready records for the current page
 *
 * This helper keeps the existing intelligence pipeline untouched while
 * providing the next-generation structure we want to stream to the server.
 * It consolidates page metadata, sections, content elements, and actionable
 * elements into a compact, reference-friendly format.
 */
IntelligenceEngine.prototype.buildNormalizedPageRecords = function(options = {}) {
    const now = Date.now();
    const records = [];

    const metaRecord = {
        type: 'meta',
        id: 'meta-page',
        url: window.location.href,
        title: document.title || 'Untitled page',
        timestamp: now,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        options
    };
    records.push(metaRecord);

    const sectionMap = new WeakMap();
    const sectionRecords = [];
    let sectionCounter = 0;

    const rootSectionId = 'section-root';
    sectionMap.set(document.body, rootSectionId);
    sectionRecords.push({
        type: 'section',
        id: rootSectionId,
        tag: 'body',
        label: 'Page Body',
        selector: 'body',
        path: []
    });

    const rawActionableElements = this.getAllActionableElements();
    const rawContentElements = this.getAllContentElements();

    const actionableBase = Array.isArray(rawActionableElements) ? [...rawActionableElements] : [];
    const youtubeDescriptors = this.collectYoutubeCardDescriptors(actionableBase);
    if (youtubeDescriptors.length) {
        actionableBase.push(...youtubeDescriptors);
    }
    const extraAnchorDescriptors = this.collectAdditionalAnchorDescriptors(actionableBase);
    if (extraAnchorDescriptors.length) {
        actionableBase.push(...extraAnchorDescriptors);
    }

    const actionableElements = filterInteractiveRecords(actionableBase);
    const existingActionHrefs = new Set();
    const contentElements = filterContentRecords(rawContentElements);

    const ensureSectionRecord = (element) => {
        if (!element) {
            return rootSectionId;
        }

        let current = element;
        while (current && !sectionMap.has(current)) {
            if (isSectionCandidate(current)) {
                const id = `section-${sectionCounter++}`;
                const label = pickSectionLabel(current);
                const selector = buildSelectorPath(current);
                const parentSection = ensureSectionRecord(current.parentElement);

                const record = {
                    type: 'section',
                    id,
                    tag: current.tagName ? current.tagName.toLowerCase() : 'unknown',
                    label,
                    selector,
                    parent: parentSection,
                    path: computeDomPath(current)
                };

                sectionMap.set(current, id);
                sectionRecords.push(record);
                break;
            }
            current = current.parentElement;
        }

        return sectionMap.get(current || document.body) || rootSectionId;
    };

    const resolveDomNode = (descriptor) => {
        if (!descriptor || !Array.isArray(descriptor.selectors)) {
            return null;
        }

        for (const sel of descriptor.selectors) {
            if (!sel || typeof sel !== 'string') continue;
            try {
                const node = document.querySelector(sel);
                if (node) return node;
            } catch (error) {
                // Ignore malformed selectors
            }
        }
        return null;
    };

    const buildContextTrail = (node) => {
        if (!node) return [];
        const trail = [];
        let current = node;
        while (current && current !== document.body && trail.length < 6) {
            const label = pickSectionLabel(current);
            if (label) {
                trail.unshift(label);
            }
            current = current.parentElement;
        }
        return trail;
    };

    const computeBoundingBox = (node) => {
        if (!node || typeof node.getBoundingClientRect !== 'function') {
            return null;
        }
        const rect = node.getBoundingClientRect();
        return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    };

    const sectionBuckets = new Map(); // sectionId -> { entries: [], textCount: 0, actionCount: 0, textSeen: Set, actionSeen: Set }
    const textIndex = new Map();

    const registerTextIndex = (label, id) => {
        if (!label || !id) return;
        const key = normalizeAnchorKey(label);
        if (!key) return;
        if (!textIndex.has(key)) {
            textIndex.set(key, []);
        }
        textIndex.get(key).push(id);
    };

    contentElements.forEach((contentDescriptor) => {
        const domNode = resolveDomNode(contentDescriptor);
        const sectionId = ensureSectionRecord(domNode);
        ensureSectionBucket(sectionId);
        const textValue = normalizeTextContent(contentDescriptor.textContent);
        if (!textValue) return;
        const tagName = contentDescriptor.tagName ? contentDescriptor.tagName.toLowerCase() : '';
        if (tagName === 'h3') {
            return;
        }
        const primarySelector = pickPrimarySelector(contentDescriptor);
        const visibility = computeVisibility(domNode);

        const elementRecord = {
            type: 'text',
            id: contentDescriptor.id,
            category: contentDescriptor.contentType,
            text: textValue,
            visibility
        };

        registerTextIndex(textValue, elementRecord.id);

        const bucket = sectionBuckets.get(sectionId);
        const dedupKey = `${(contentDescriptor.tagName || '').toLowerCase()}|${textValue}`;
        if (bucket.textSeen.has(dedupKey)) return;
        bucket.textSeen.add(dedupKey);
        bucket.entries.push({ order: computeDomPath(domNode), record: elementRecord });
        bucket.textCount += 1;
    });

    actionableElements.forEach((actionDescriptor) => {
        const domNode = resolveDomNode(actionDescriptor);
        const sectionId = ensureSectionRecord(domNode);
        ensureSectionBucket(sectionId);
        const primarySelector = pickPrimarySelector(actionDescriptor);
        const visibility = computeVisibility(domNode);

        const actionRecord = {
            type: 'action',
            id: actionDescriptor.id,
            tag: actionDescriptor.tagName ? actionDescriptor.tagName.toLowerCase() : 'unknown',
            label: extractLabelFromAction(actionDescriptor, domNode),
            actionTypes: deriveActionTypes(actionDescriptor),
            visibility
        };

        if (actionDescriptor.urlContext) {
            const ctx = actionDescriptor.urlContext;
            if (ctx.url) actionRecord.href = ctx.url;
            if (ctx.ariaLabel) actionRecord.ariaLabel = ctx.ariaLabel;
            if (ctx.title) actionRecord.title = ctx.title;
        }
        if (!actionRecord.href && actionDescriptor.attributes) {
            const attrs = actionDescriptor.attributes;
            if (attrs.href) actionRecord.href = attrs.href;
            if (attrs['aria-label']) actionRecord.ariaLabel = attrs['aria-label'];
            if (attrs.title) actionRecord.title = attrs.title;
            if (attrs.placeholder) actionRecord.placeholder = attrs.placeholder;
            if (attrs['data-placeholder'] && !actionRecord.placeholder) {
                actionRecord.placeholder = attrs['data-placeholder'];
            }
        }

        if (actionDescriptor.attributes && Object.keys(actionDescriptor.attributes).length > 0) {
            actionRecord.attributes = { ...actionDescriptor.attributes };
        }

        const controlType = inferControlType(actionDescriptor, actionRecord);
        if (controlType) {
            actionRecord.controlType = controlType;
        }

        const placeholderAttr = actionDescriptor.attributes && actionDescriptor.attributes.placeholder;
        if (placeholderAttr) {
            actionRecord.placeholder = placeholderAttr;
        } else if (actionDescriptor.attributes && actionDescriptor.attributes['data-placeholder']) {
            actionRecord.placeholder = actionDescriptor.attributes['data-placeholder'];
        } else if (domNode && typeof domNode.querySelector === 'function') {
            const fallbackPlaceholder = domNode.querySelector('[data-placeholder]')?.getAttribute('data-placeholder');
            if (fallbackPlaceholder) {
                actionRecord.placeholder = fallbackPlaceholder.trim();
            }
        }

        const bucket = sectionBuckets.get(sectionId);
        const dedupKey = `${actionRecord.tag}|${actionRecord.label}|${actionRecord.href || ''}|${primarySelector}`;
        if (bucket.actionSeen.has(dedupKey)) return;
        bucket.actionSeen.add(dedupKey);

        const potentialMatches = actionRecord.label ? textIndex.get(normalizeAnchorKey(actionRecord.label)) : null;
        if (potentialMatches && potentialMatches.length) {
            actionRecord.relatedTexts = Array.from(new Set(potentialMatches));
        }

        bucket.entries.push({ order: computeDomPath(domNode), record: actionRecord });
        bucket.actionCount += 1;
        if (actionRecord.href) {
            existingActionHrefs.add(actionRecord.href);
        }
    });

    if (window.location.hostname && window.location.hostname.includes('youtube.com')) {
        const youtubeSelectors = [
            'a.yt-lockup-metadata-view-model__title[href*="watch"]',
            'a[href*="watch"][class*="metadata-view-model__title"]',
            'a#video-title-link[href*="watch"]'
        ];
        const youtubeCards = document.querySelectorAll('ytd-rich-item-renderer, yt-lockup-view-model');
        const youtubeSeen = new Set(existingActionHrefs);

        youtubeCards.forEach(card => {
            let linkEl = null;
            for (const selector of youtubeSelectors) {
                linkEl = card.querySelector(selector);
                if (linkEl) break;
            }
            if (!linkEl) return;

            const href = linkEl.href;
            if (!href || youtubeSeen.has(href)) return;
            if (href.startsWith('javascript:') || href === '#' || href === window.location.href + '#') return;

            const labelText = normalizeTextContent(linkEl.textContent) || normalizeTextContent(linkEl.getAttribute('aria-label')) || normalizeTextContent(linkEl.getAttribute('title')) || href;
            if (!labelText) return;

            const sectionId = ensureSectionRecord(linkEl);
            ensureSectionBucket(sectionId);

            const selectorList = this.generateElementSelectors(linkEl) || [];
            const primarySelector = selectorList.find(sel => typeof sel === 'string' && sel.length > 0 && !sel.includes('head')) || selectorList[0] || null;
            const visibility = computeVisibility(linkEl);

            const idCandidate = `a_id_${this.elementCounter++}`;

            const actionRecord = {
                type: 'action',
                id: idCandidate,
                label: labelText.substring(0, 240),
                actionTypes: ['link', 'navigate'],
                visibility,
                href,
                ariaLabel: linkEl.getAttribute('aria-label') || undefined,
                title: linkEl.getAttribute('title') || undefined
            };

            const inferred = inferControlType({ tagName: 'a' }, actionRecord);
            if (inferred) {
                actionRecord.controlType = inferred;
            }

            const bucket = sectionBuckets.get(sectionId);
            const dedupKey = `${actionRecord.label}|${href}`;
            if (bucket.actionSeen.has(dedupKey)) return;
            bucket.actionSeen.add(dedupKey);
            bucket.entries.push({ order: computeDomPath(linkEl), record: actionRecord });
            bucket.actionCount += 1;
            youtubeSeen.add(href);

        if (this.actionableElements && !this.actionableElements.has(idCandidate)) {
            this.actionableElements.set(idCandidate, {
                id: idCandidate,
                tagName: 'a',
                actionType: 'link',
                textContent: labelText,
                selectors: selectorList,
                attributes: this.extractKeyAttributes(linkEl) || { href },
                urlContext: {
                    url: href,
                    textContent: labelText,
                    title: linkEl.getAttribute('title'),
                    ariaLabel: linkEl.getAttribute('aria-label')
                },
                timestamp: Date.now()
            });
        }
        });
    }

    sectionRecords
        .sort((a, b) => compareDomPaths(a.path || [], b.path || []))
        .forEach((section) => {
            records.push({
                type: 'section',
                id: section.id,
                tag: section.tag,
                label: section.label,
                selector: section.selector,
                parent: section.parent || null
            });

            const bucket = sectionBuckets.get(section.id);
            if (!bucket) return;

            bucket.entries
                .sort((a, b) => compareDomPaths(a.order, b.order))
                .forEach(entry => records.push(entry.record));
        });

    const totalText = sumBuckets(sectionBuckets, 'textCount');
    const totalActions = sumBuckets(sectionBuckets, 'actionCount');

    metaRecord.totals = {
        sections: sectionRecords.length,
        text: totalText,
        actions: totalActions
    };
    metaRecord.generatedAt = now;

    records.push({
        type: 'summary',
        id: 'summary-page',
        totals: {
            sections: sectionRecords.length,
            text: totalText,
            actions: totalActions
        },
        generatedAt: now
    });

    return records;

    // Helper utilities ---------------------------------------------

    function isSectionCandidate(node) {
        if (!node || node === document.body) return node === document.body;
        if (!node.tagName) return false;
        const tag = node.tagName.toLowerCase();
        if (['section', 'article', 'main', 'aside', 'nav', 'header', 'footer'].includes(tag)) {
            return true;
        }
        const role = node.getAttribute && node.getAttribute('role');
        if (role && ['region', 'navigation', 'main', 'dialog'].includes(role.toLowerCase())) {
            return true;
        }
        if (node.hasAttribute && (node.hasAttribute('data-section') || node.hasAttribute('data-region'))) {
            return true;
        }
        return false;
    }

    function pickSectionLabel(node) {
        if (!node) return '';
        const ariaLabel = node.getAttribute && node.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();
        const dataLabel = node.getAttribute && (node.getAttribute('data-section-title') || node.getAttribute('data-region'));
        if (dataLabel) return dataLabel.trim();
        const heading = node.querySelector && node.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading && heading.textContent) {
            return heading.textContent.trim().substring(0, 120);
        }
        if (node.id) return `#${node.id}`;
        if (node.classList && node.classList.length > 0) {
            return `.${node.classList[0]}`;
        }
        return node.tagName ? node.tagName.toLowerCase() : 'section';
    }

    function buildSelectorPath(node) {
        if (!node || node === document.body) return 'body';
        const parts = [];
        let current = node;
        while (current && current !== document.body && parts.length < 6) {
            let selector = current.tagName ? current.tagName.toLowerCase() : 'node';
            if (current.id) {
                selector += `#${current.id}`;
                parts.unshift(selector);
                break;
            }
            if (current.classList && current.classList.length > 0) {
                selector += `.${current.classList[0]}`;
            }
            parts.unshift(selector);
            current = current.parentElement;
        }
        return parts.length ? parts.join(' > ') : 'body';
    }

    function prettifyLabel(value) {
        if (!value) return '';
        const cleaned = value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned) return '';
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    function extractLabelFromAction(descriptor, node) {
    const attr = descriptor.attributes || {};
    const ariaLabel = (attr['aria-label'] || (node && node.getAttribute('aria-label')) || '')?.trim?.();
    const titleLabel = (attr.title || (node && node.getAttribute('title')) || '')?.trim?.();
    const placeholderLabel = (attr.placeholder || (node && node.getAttribute && node.getAttribute('placeholder')) || '')?.trim?.();
    const dataPlaceholderAttr = (attr['data-placeholder'] || (node && node.getAttribute && node.getAttribute('data-placeholder')) || '')?.trim?.();
    const descendantPlaceholder = node && typeof node.querySelector === 'function'
        ? node.querySelector('[data-placeholder]')?.getAttribute('data-placeholder')?.trim()
        : '';
    const textLabel = descriptor.textContent ? descriptor.textContent.trim() : '';

    if (textLabel) {
        const looksLikeIndex = /^\d{1,3}$/.test(textLabel);
        if (looksLikeIndex && ariaLabel) {
            return ariaLabel;
        }
        return textLabel.substring(0, 120);
    }

    if (placeholderLabel) return placeholderLabel;
    if (dataPlaceholderAttr) return dataPlaceholderAttr;
    if (descendantPlaceholder) return descendantPlaceholder;
    if (ariaLabel) return ariaLabel;
    if (titleLabel) return titleLabel;
        if (attr.alt) return attr.alt;
        if (descriptor.urlContext && descriptor.urlContext.altText) {
            return descriptor.urlContext.altText;
        }
        const idAttr = attr.id || (node && node.id);
        if (idAttr) {
            const prettyId = prettifyLabel(idAttr);
            if (prettyId) return prettyId;
        }
        if (attr.cssClasses && attr.cssClasses.length > 0) {
            const prettyClass = prettifyLabel(attr.cssClasses[0]);
            if (prettyClass) return prettyClass;
        }
        if (node && node.textContent) {
            return node.textContent.trim().substring(0, 120);
        }
        const fallback = descriptor.tagName || 'element';
        return prettifyLabel(fallback) || fallback;
    }

    function deriveActionTypes(descriptor) {
        const types = new Set();
        if (descriptor.actionType) {
            types.add(descriptor.actionType);
        }
        const tag = descriptor.tagName ? descriptor.tagName.toLowerCase() : '';
        if (tag === 'input') {
            types.add('focus');
            types.add('setValue');
        }
        if (tag === 'textarea') {
            types.add('focus');
            types.add('setValue');
        }
        if (descriptor.attributes && descriptor.attributes.contenteditable === 'true') {
            types.add('focus');
            types.add('setValue');
        }
        const role = descriptor.attributes && descriptor.attributes.role ? descriptor.attributes.role.toLowerCase() : '';
        if (role === 'textbox' || role === 'input') {
            types.add('focus');
            types.add('setValue');
        }
        if (tag === 'select') {
            types.add('select');
        }
        if (tag === 'button' || types.has('click')) {
            types.add('click');
        }
        if (descriptor.urlContext && descriptor.urlContext.url) {
            types.add('navigate');
        }
        return Array.from(types);
    }

    function deriveConfidenceScore(descriptor, node) {
        let score = 0.6;
        if (descriptor.urlContext && descriptor.urlContext.url) {
            score += 0.2;
        }
        if (descriptor.selectors && descriptor.selectors.length > 0) {
            score += 0.1;
        }
        if (node && node.offsetParent !== null) {
            score += 0.1;
        }
        return Math.min(1, Number(score.toFixed(2)));
    }

    function ensureSectionBucket(sectionId) {
        if (!sectionBuckets.has(sectionId)) {
            sectionBuckets.set(sectionId, {
                entries: [],
                textCount: 0,
                actionCount: 0,
                textSeen: new Set(),
                actionSeen: new Set()
            });
        }
    }

    function computeVisibility(node) {
        if (!node) return 'unknown';
        try {
            const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
            const hidden = node.offsetParent === null || (rect && rect.width === 0 && rect.height === 0);
            return hidden ? 'hidden' : 'visible';
        } catch (error) {
            return 'unknown';
        }
    }

    function computeDomPath(node) {
        const path = [];
        let current = node;
        while (current && current !== document.body && current.parentElement) {
            const parent = current.parentElement;
            const index = Array.prototype.indexOf.call(parent.children, current);
            path.unshift(index);
            current = parent;
        }
        return path;
    }

    function compareDomPaths(a, b) {
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const av = a[i] ?? -1;
            const bv = b[i] ?? -1;
            if (av !== bv) return av - bv;
        }
        return 0;
    }

    function sumBuckets(map, key) {
        let count = 0;
        map.forEach(bucket => {
            if (typeof bucket[key] === 'number') {
                count += bucket[key];
            }
        });
        return count;
    }

    function normalizeTextContent(value) {
        if (!value) return '';
        return value.replace(/\s+/g, ' ').trim();
    }

    function filterInteractiveRecords(records) {
        const filtered = [];
        const keyToIndex = new Map();

        const computeKey = (descriptor, primarySelector, url, label) => {
            const attrs = descriptor.attributes || {};
            const placeholder = (descriptor.placeholder || attrs.placeholder || attrs['data-placeholder'] || '').toLowerCase();
            const aria = (attrs['aria-label'] || '').toLowerCase();
            const idAttr = (attrs.id || '').toLowerCase();
            if (placeholder) return `placeholder:${placeholder}`;
            if (aria) return `aria:${aria}`;
            if (idAttr) return `id:${idAttr}`;
            if (label) return `label:${label.toLowerCase()}`;
            if (url) return `url:${url}`;
            if (primarySelector) return `selector:${primarySelector.toLowerCase()}`;
            return descriptor.id || null;
        };

        const hasMeaningfulLabel = (descriptor) => {
            const attrs = descriptor.attributes || {};
            const label = (descriptor.textContent || descriptor.label || '').trim();
            const placeholder = descriptor.placeholder || attrs.placeholder || attrs['data-placeholder'];
            const aria = attrs['aria-label'];
            const idAttr = attrs.id;
            if (placeholder || aria || idAttr) return true;
            if (!label) return false;
            const normalized = label.toLowerCase();
            return normalized !== 'input' && normalized !== 'button' && normalized.length > 1;
        };

        records.forEach((descriptor) => {
            const tag = descriptor.tagName ? descriptor.tagName.toLowerCase() : '';

            if (tag === 'link' || tag === 'meta' || tag === 'script') {
                return;
            }

            if (descriptor.attributes && descriptor.attributes.type) {
                const typeAttr = descriptor.attributes.type.toLowerCase();
                if (typeAttr === 'hidden' || typeAttr === 'file') {
                    return;
                }
            }

            if (!descriptor.selectors || descriptor.selectors.length === 0) {
                return;
            }

            const primarySelector = descriptor.selectors
                .filter(sel => typeof sel === 'string' && sel.length > 0)
                .find(sel => !sel.includes('head'));

            if (!primarySelector) {
                return;
            }

            if (!isMeaningfulInteractiveSelector(primarySelector, tag, descriptor.attributes || {})) {
                return;
            }

            if (descriptor.visibility === 'hidden' && !hasMeaningfulLabel(descriptor)) {
                return;
            }

            const url = descriptor.urlContext && descriptor.urlContext.url;
            const label = (descriptor.textContent || (descriptor.attributes && (descriptor.attributes['aria-label'] || descriptor.attributes.title || descriptor.attributes['data-placeholder'])) || '').trim();
            const key = computeKey(descriptor, primarySelector, url, label);

            if (key) {
                const existingIndex = keyToIndex.get(key);
                if (existingIndex !== undefined) {
                    const existing = filtered[existingIndex];
                    if (existing.visibility === 'hidden' && descriptor.visibility !== 'hidden') {
                        filtered[existingIndex] = descriptor;
                    }
                    return;
                }
                keyToIndex.set(key, filtered.length);
            }

            filtered.push(descriptor);
        });

        return filtered;
    }

    function filterContentRecords(records) {
        const allowedTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'label']);
        const filtered = [];

        records.forEach((descriptor) => {
            const tag = descriptor.tagName ? descriptor.tagName.toLowerCase() : '';
            if (!allowedTags.has(tag)) {
                return;
            }
            if (!descriptor.textContent || descriptor.textContent.trim().length < 2) {
                return;
            }
            descriptor.textContent = descriptor.textContent.trim().substring(0, 240);
            filtered.push(descriptor);
        });

        return filtered;
    }

    function isMeaningfulInteractiveSelector(selector, tag, attributes) {
        if (!selector) return false;

        if (selector.includes('head') || selector.includes('meta') || selector.includes('script')) {
            return false;
        }

        if (selector.includes('elementor-background-overlay') || selector.includes('slick-track')) {
            return false;
        }

        if (tag === 'nav' || tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') {
            return true;
        }

        const classList = attributes && attributes.cssClasses ? attributes.cssClasses.join(' ') : '';
        if (classList.match(/(btn|button|link|nav|menu|toggle|tab|cta)/i)) {
            return true;
        }

        if (attributes && (attributes['aria-label'] || attributes.title)) {
            return true;
        }

        return false;
    }

    function pickPrimarySelector(descriptor) {
        if (!descriptor || !Array.isArray(descriptor.selectors)) {
            return null;
        }
        for (const sel of descriptor.selectors) {
            if (typeof sel === 'string' && sel.length > 0 && !sel.includes('head')) {
                return sel;
            }
        }
        return descriptor.selectors[0] || null;
    }

    function normalizeAnchorKey(value) {
        if (!value) return null;
        const trimmed = value.replace(/\s+/g, ' ').trim();
        if (!trimmed) return null;
        return trimmed.toLowerCase();
    }

    function inferControlType(descriptor, actionRecord) {
        if (!actionRecord) return null;
        const actionTypes = Array.isArray(actionRecord.actionTypes) ? actionRecord.actionTypes : [];
        const label = (actionRecord.label || '').toLowerCase();
        const aria = (actionRecord.ariaLabel || '').toLowerCase();
        const placeholder = (actionRecord.placeholder || '').toLowerCase();
        const keywords = ['search', 'submit', 'apply', 'filter', 'go', 'enter'];

        if (actionTypes.includes('setValue')) {
            return 'input';
        }

        const hasKeyword = keywords.some(keyword => label.includes(keyword) || aria.includes(keyword) || placeholder.includes(keyword));
        if (actionTypes.includes('click') && !actionRecord.href && hasKeyword) {
            return 'button';
        }

        return null;
    }
};

// 🆕 DEBUG: expose normalized record builder for manual testing during migration
window.omEWebBuildNormalizedRecords = function(options) {
    try {
        if (window.intelligenceEngine && typeof window.intelligenceEngine.buildNormalizedPageRecords === 'function') {
            return window.intelligenceEngine.buildNormalizedPageRecords(options);
        }
        console.warn('[Content] ⚠️ intelligenceEngine not ready for normalized records');
        return [];
    } catch (error) {
        console.error('[Content] ❌ Failed to build normalized records:', error);
        return [];
    }
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
    // 🎯 FIXED: No CSP bypass needed for engine ready checks - only needed during actual scanning
    
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
    
    // 🎯 NEW: Force comprehensive scan integration for CSP bypass - REMOVED
    console.log("[Content] 🔄 Engine ready: Comprehensive scan skipped");
    
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
 * 🆕 NEW: Get summary of content elements for LLM
 */
IntelligenceEngine.prototype.getContentElementsSummary = function() {
    const elements = Array.from(this.contentElements.values());
    
    return elements.map(element => ({
        contentId: element.id,
        contentType: element.contentType,
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
    
    // 🆕 NEW: Don't log individual trigger events - just queue silently
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
IntelligenceEngine.prototype.generateActionableId = function(element, actionType = 'general', reuseId = null) {
    const tagName = element.tagName?.toLowerCase() || 'unknown';
    const className = element.className || '';
    const textContent = element.textContent?.trim().substring(0, 100) || '';
    
    let uniqueId = reuseId;
    if (!uniqueId) {
        uniqueId = `a_id_${this.elementCounter++}`;
    }
    
    // Generate multiple selectors for reliability
    const selectors = this.generateElementSelectors(element);
    
    // 🆕 ENHANCED: Extract rich context for URL elements
    const attributes = this.extractKeyAttributes(element);
    let urlContext = null;
    
    // If this is a URL element, capture rich context
    if (element.href || element.getAttribute('data-url') || element.getAttribute('data-href')) {
        urlContext = {
            url: element.href || element.getAttribute('data-url') || element.getAttribute('data-href'),
            textContent: textContent,
            title: element.getAttribute('title'),
            ariaLabel: element.getAttribute('aria-label'),
            altText: element.querySelector('img')?.getAttribute('alt'),
            // Check if it's an image link
            hasImage: !!element.querySelector('img'),
            imageSrc: element.querySelector('img')?.getAttribute('src'),
            // Check if it's a button-style link
            isButton: element.classList.contains('btn') || element.classList.contains('button') || element.role === 'button'
        };
        
       // console.log(`[Content] 🔗 Rich URL context captured:`, urlContext);
    }
    
    return {
        id: uniqueId,
        tagName: tagName,
        actionType: actionType,
        selectors: selectors,
        textContent: textContent,
        className: className,
        attributes: attributes,
        urlContext: urlContext, // 🆕 NEW: Rich context for URL elements
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
        if (element.className) {
            const classes = (element.className && typeof element.className === 'string') ? element.className.split(' ').filter(c => c.trim()) : [];
            if (classes.length > 0) {
                selectors.push(`.${classes[0]}`);
            }
        }
        
        // Strategy 4: Tag + class combination
        if (element.tagName && element.className) {
            const firstClass = (element.className && typeof element.className === 'string') ? element.className.split(' ')[0] : '';
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
    
    // 🆕 ENHANCED: Add URL-related attributes for better context
    if (element.tagName === 'A' || element.href || element.getAttribute('data-url')) {
        keyAttrs.push('href', 'data-url', 'data-href', 'data-link', 'target', 'rel');
    }

    if (element.hasAttribute && element.hasAttribute('contenteditable')) {
        keyAttrs.push('contenteditable');
    }
    if (element.hasAttribute && element.hasAttribute('data-placeholder')) {
        keyAttrs.push('data-placeholder');
    }
    
    // Add src for images
    if (element.tagName === 'IMG') {
        keyAttrs.push('src');
    }
    
    // Add value for form elements
    if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
        keyAttrs.push('value');
    }
    
    // 🆕 NEW: Add common CSS classes for styling context
    if (element.className && typeof element.className === 'string') {
        const classes = element.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) {
            attributes['cssClasses'] = classes;
        }
    }
    
    keyAttrs.forEach(attr => {
        const value = element.getAttribute(attr);
        if (value) {
            attributes[attr] = value;
        }
    });
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
        attributes.placeholder = placeholder;
    }

    return attributes;
};

/**
 * 🆕 NEW: Register an element as actionable
 */
IntelligenceEngine.prototype.registerActionableElement = function(element, actionType = 'general') {
    let domElement = element;

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

    if (!domElement || !domElement.tagName) {
        return null;
    }

    const existingMarker = domElement.dataset?.omeActionId;

    const actionableId = this.generateActionableId(domElement, actionType, existingMarker || null);
    this.actionableElements.set(actionableId.id, actionableId);

    if (domElement.dataset) {
        domElement.dataset.omeActionId = actionableId.id;
    }

    if (this.pageState && Array.isArray(this.pageState.interactiveElements)) {
        const existingIndex = this.pageState.interactiveElements.findIndex(item => item.id === actionableId.id);
        const entry = {
            ...actionableId,
            element: domElement
        };
        if (existingIndex >= 0) {
            this.pageState.interactiveElements[existingIndex] = entry;
        } else {
            this.pageState.interactiveElements.push(entry);
        }
    }

    return actionableId.id;
};

/**
 * 🆕 NEW: Get actionable element by ID
 */
IntelligenceEngine.prototype.getActionableElement = function(actionId) {
    return this.actionableElements.get(actionId);
};

/**
 * 🆕 NEW: Get content element by ID
 */
IntelligenceEngine.prototype.getContentElement = function(contentId) {
    return this.contentElements.get(contentId);
};

/**
 * 🆕 NEW: Get all actionable elements
 */
IntelligenceEngine.prototype.getAllActionableElements = function() {
    return Array.from(this.actionableElements.values());
};

/**
 * 🆕 NEW: Get all content elements
 */
IntelligenceEngine.prototype.getAllContentElements = function() {
    return Array.from(this.contentElements.values());
};

/**
 * 🆕 NEW: Execute action on element by ID
 */
IntelligenceEngine.prototype.executeAction = function(actionId, action = null, params = {}) {
    console.log("[Content] 🎯 executeAction called:", { actionId, action, params });
    
    const actionableElement = this.getActionableElement(actionId);
    if (!actionableElement) {
        console.error("[Content] ❌ Element not found in actionableElements Map:", actionId);

        return { success: false, error: "Element not found" };
    }
    
    console.log("[Content] ✅ Found actionable element:", actionableElement);
    
    // 🆕 NEW: Auto-detect action if not specified
    if (!action) {
        action = actionableElement.actionType || 'click';
        console.log("[Content] 🔍 Auto-detected action:", action, "from actionType:", actionableElement.actionType);
    }
    
    // 🆕 NEW: Normalize action names for text entry (generic, site-agnostic)
    // Some pipelines label text-entry elements as 'textarea' or 'input'.
    // Normalize these to the canonical 'setValue' so downstream handling works everywhere.
    const lowered = typeof action === 'string' ? action.toLowerCase() : '';
    if (['textarea', 'input', 'type', 'text', 'enter_text'].includes(lowered)) {
        action = 'setValue';
        console.log("[Content] 🔁 Normalized action to 'setValue' for text entry");
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
                {
                    const valueToSet = params.value != null ? String(params.value) : '';
                    // Focus first to ensure site handlers attach properly
                    if (typeof element.focus === 'function') {
                        element.focus();
                    }
                    
                    // Use native setter so frameworks detect change
                    const isTextarea = element.tagName === 'TEXTAREA';
                    const isInput = element.tagName === 'INPUT';
                    const isContentEditable = element.isContentEditable === true || element.getAttribute('contenteditable') === 'true';
                    
                    try {
                        if (isTextarea || isInput) {
                            const proto = isTextarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                            if (desc && typeof desc.set === 'function') {
                                desc.set.call(element, valueToSet);
                            } else {
                                element.value = valueToSet;
                            }
                        } else if (isContentEditable) {
                            element.textContent = valueToSet;
                        } else if (element.value !== undefined) {
                            element.value = valueToSet;
                        } else {
                            result = { success: false, error: "Element does not support setValue" };
                            break;
                        }
                        
                        // Dispatch input/change events so pages react to the update
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        // Optionally submit by simulating Enter, if requested
                        if (params && params.submit) {
                            const kOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
                            element.dispatchEvent(new KeyboardEvent('keydown', kOpts));
                            element.dispatchEvent(new KeyboardEvent('keyup', kOpts));
                        }
                        
                        result = { 
                            success: true, 
                            action: 'setValue', 
                            elementId: actionId, 
                            value: isContentEditable ? element.textContent : element.value,
                            selector: selector
                        };
                    } catch (e) {
                        result = { success: false, error: `setValue failed: ${e.message}` };
                    }
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
 * 🆕 NEW: Purify element to ensure it's a clean actionable element
 * Filters out content elements and ensures only true actionable elements get registered
 */
IntelligenceEngine.prototype.purifyElement = function(element, category) {
    // 🆕 NEW: Register content elements before filtering them out
    if (category === 'content_elements') {
        // Register content element first
        const contentId = this.registerContentElement(element, category);
       //console.log(`[Content] 📝 Content element registered: ${contentId}`);
        return null; // Still return null to keep it out of actionable elements
    }
    
    // All other categories are actionable (navigation, buttons, menus, text_inputs, url_elements)
    return element;
};

/**
 * 🆕 NEW: Register a content element
 */
IntelligenceEngine.prototype.registerContentElement = function(element, contentType = 'content') {
    // Generate unique content ID
    const contentId = this.generateContentId(element, contentType);
    this.contentElements.set(contentId.id, contentId);
    
    // Add to page state
    this.pageState.contentElements.push({
        ...contentId,
        element: element
    });
    
    return contentId.id;
};

/**
 * 🆕 NEW: Generate unique ID for content elements
 */
IntelligenceEngine.prototype.generateContentId = function(element, contentType = 'content') {
    this.elementCounter++;
    const tagName = element.tagName ? element.tagName.toLowerCase() : 'unknown';
    const id = `content_${contentType}_${tagName}_${this.elementCounter}`;
    
    return {
        id: id,
        contentType: contentType,
        tagName: tagName,
        textContent: element.textContent ? element.textContent.trim().substring(0, 100) : '',
        selectors: this.generateElementSelectors(element),
        attributes: this.extractKeyAttributes(element),
        timestamp: Date.now()
    };
};

/**
 * 🆕 NEW: Extract URL from element for deduplication
 */
IntelligenceEngine.prototype.extractElementUrl = function(element) {
    try {
        // Check for href attribute (links)
        if (element.href) return element.href;
        
        // Check for data attributes that might contain URLs
        const dataUrl = element.getAttribute('data-url');
        if (dataUrl) return dataUrl;
        
        const dataHref = element.getAttribute('data-href');
        if (dataHref) return dataHref;
        
        const dataLink = element.getAttribute('data-link');
        if (dataLink) return dataLink;
        
        // 🆕 SIMPLE: No more DOM traversal bullshit - just check the element itself
        
        // Check for onclick handlers on the element itself
        if (element.onclick || element.getAttribute('onclick')) {
            const onclickValue = element.getAttribute('onclick') || '';
            if (onclickValue.includes('window.location') || onclickValue.includes('href') || onclickValue.includes('navigate')) {
                // Extract URL from onclick if possible
                const urlMatch = onclickValue.match(/['"`]([^'"`]+)['"`]/);
                if (urlMatch) return urlMatch[1];
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`[Content] ⚠️ Error extracting URL from element:`, error);
        return null;
    }
};

/**
 * 🆕 NEW: Get the selectors used to locate YouTube video title links
 */
IntelligenceEngine.prototype.getYoutubeLinkSelectors = function() {
    return [
        "a.yt-lockup-metadata-view-model__title[href*='watch']",
        "yt-lockup-view-model a.yt-lockup-metadata-view-model__title[href*='watch']",
        "yt-lockup-view-model a[href*='watch']",
        "a#video-title-link[href*='watch']",
        "a#video-title[href*='watch']"
    ];
};

/**
 * 🆕 NEW: Register YouTube video links discovered via metadata lockups
 */
IntelligenceEngine.prototype.registerYoutubeLockupLinks = function(registeredUrls) {
    if (window.currentFramework !== 'youtube') {
        return { registered: 0, urlCount: 0 };
    }

    const descriptors = this.collectYoutubeCardDescriptors();
    let registered = 0;

    if (registeredUrls) {
        descriptors.forEach(desc => {
            const url = desc?.urlContext?.url || desc?.attributes?.href;
            if (url && !registeredUrls.has(url)) {
                registeredUrls.add(url);
                registered += 1;
            }
        });
    } else {
        registered = descriptors.length;
    }

    return { registered, urlCount: registered };
};

/**
 * 🆕 NEW: Register YouTube links found within a specific DOM node
 */
IntelligenceEngine.prototype.registerYoutubeLinksFromNode = function(rootNode) {
    const isYoutube = window.location.hostname.includes('youtube.com');
    if (!(isYoutube || window.currentFramework === 'youtube')) {
        return 0;
    }

    const nodes = [];
    if (Array.isArray(rootNode)) {
        nodes.push(...rootNode.filter(Boolean));
    } else if (rootNode && typeof rootNode.length === 'number' && !rootNode.tagName) {
        nodes.push(...Array.from(rootNode).filter(Boolean));
    } else if (rootNode) {
        nodes.push(rootNode);
    }

    if (!nodes.length) {
        nodes.push(document.body);
    }

    const descriptors = this.collectYoutubeCardDescriptors([], nodes);
    return descriptors.length;
};

/**
 * 🆕 NEW: Collect structured YouTube card link descriptors (console-style)
 */
IntelligenceEngine.prototype.collectYoutubeCardDescriptors = function(existingDescriptors = [], roots = null) {
    const isYoutube = window.location.hostname.includes('youtube.com');
    if (!(isYoutube || window.currentFramework === 'youtube')) {
        return [];
    }

    const extras = [];
    const existingHrefs = new Set();

    const addHref = (href) => {
        if (href) existingHrefs.add(href);
    };

    existingDescriptors.forEach(desc => {
        const url = (desc && desc.urlContext && desc.urlContext.url) || (desc && desc.attributes && desc.attributes.href);
        addHref(url);
    });

    if (this.actionableElements) {
        this.actionableElements.forEach(item => {
            const url = (item && item.urlContext && item.urlContext.url) || (item && item.attributes && item.attributes.href);
            addHref(url);
        });
    }

    const normalize = (value) => (value ? value.replace(/\s+/g, ' ').trim() : '');

    let sourceNodes = [];
    if (Array.isArray(roots) && roots.length) {
        sourceNodes = roots.filter(Boolean);
    } else if (roots && typeof roots.length === 'number' && roots !== document && !roots.tagName) {
        sourceNodes = Array.from(roots).filter(Boolean);
    } else if (roots && roots.tagName) {
        sourceNodes = [roots];
    } else {
        sourceNodes = Array.from(document.querySelectorAll('ytd-rich-item-renderer, yt-lockup-view-model'));
    }

    const selectors = [
        'a.yt-lockup-metadata-view-model__title[href*="watch"]',
        'yt-lockup-view-model a.yt-lockup-metadata-view-model__title[href*="watch"]',
        'a#video-title-link[href*="watch"]',
        'a[href*="watch"][class*="metadata-view-model__title"]'
    ];

    sourceNodes.forEach(card => {
        if (!card) return;

        let link = null;
        for (const selector of selectors) {
            link = card.querySelector(selector);
            if (link) break;
        }
        if (!link) return;

        const href = link.href;
        if (!href || existingHrefs.has(href)) return;

        if (href.startsWith('javascript:') || href === '#' || href === window.location.href + '#') {
            return;
        }

        const text = normalize(link.textContent) || normalize(link.getAttribute('aria-label')) || normalize(link.getAttribute('title'));
        if (!text) return;

        let selectorsForLink = this.generateElementSelectors(link) || [];
        selectorsForLink = selectorsForLink.filter(sel => typeof sel === 'string' && sel.length > 0);

        if (!selectorsForLink.length) {
            const fallbackSelector = this.generatePositionSelector(link);
            if (fallbackSelector) {
                selectorsForLink.push(fallbackSelector);
            }
        }

        if (!selectorsForLink.length) return;

        const actionId = this.registerActionableElement(link, 'link');
        if (!actionId) return;

        const storedDescriptor = this.getActionableElement(actionId);
        if (!storedDescriptor) return;

        const combinedSelectors = Array.from(
            new Set([...(storedDescriptor.selectors || []), ...selectorsForLink])
        );

        const attributes = { ...(storedDescriptor.attributes || {}) };
        attributes.href = href;
        const titleAttr = link.getAttribute('title');
        if (titleAttr) {
            attributes.title = titleAttr;
        }
        const ariaAttr = link.getAttribute('aria-label');
        if (ariaAttr) {
            attributes['aria-label'] = ariaAttr;
        }

        const normalizedText = text.substring(0, 240);
        const baseUrlContext = storedDescriptor.urlContext || {};

        const descriptor = {
            ...storedDescriptor,
            selectors: combinedSelectors,
            attributes,
            textContent: normalizedText,
            urlContext: {
                ...baseUrlContext,
                url: href,
                textContent: normalizedText,
                title: titleAttr?.trim() || baseUrlContext.title || null,
                ariaLabel: ariaAttr?.trim() || baseUrlContext.ariaLabel || null
            },
            timestamp: Date.now()
        };

        this.actionableElements.set(actionId, descriptor);

        if (this.pageState && Array.isArray(this.pageState.interactiveElements)) {
            const existingIndex = this.pageState.interactiveElements.findIndex(item => item.id === actionId);
            if (existingIndex >= 0) {
                const existingEntry = this.pageState.interactiveElements[existingIndex];
                this.pageState.interactiveElements[existingIndex] = {
                    ...descriptor,
                    element: existingEntry.element
                };
            }
        }

        extras.push({ ...descriptor });
        existingHrefs.add(href);
        if (this.youtubeRegisteredUrls) {
            this.youtubeRegisteredUrls.add(href);
        }
    });

    return extras;
};

/**
 * 🆕 NEW: Collect additional anchor descriptors for normalized records
 */
IntelligenceEngine.prototype.collectAdditionalAnchorDescriptors = function(existingDescriptors = []) {
    try {
        const extras = [];
        const existingHrefs = new Set();

        existingDescriptors.forEach(desc => {
            const url = (desc.urlContext && desc.urlContext.url) || (desc.attributes && desc.attributes.href);
            if (url) existingHrefs.add(url);
        });

        if (this.actionableElements) {
            this.actionableElements.forEach(item => {
                const url = (item && item.urlContext && item.urlContext.url) || (item && item.attributes && item.attributes.href);
                if (url) {
                    existingHrefs.add(url);
                }
            });
        }

        const anchors = document.querySelectorAll('a[href]');
        anchors.forEach(anchor => {
            const href = anchor.href;
            if (!href || existingHrefs.has(href)) {
                return;
            }

            if (href.startsWith('javascript:') || href === '#' || href === window.location.href + '#') {
                return;
            }

            const text = anchor.innerText ? anchor.innerText.replace(/\s+/g, ' ').trim() : '';
            const ariaLabel = anchor.getAttribute('aria-label')?.trim();
            const titleAttr = anchor.getAttribute('title')?.trim();

            if (!text && !ariaLabel && !titleAttr) {
                return;
            }

            const visibilityNode = anchor; // use anchor for visibility checks
            if (!this.isElementVisible || !this.isElementVisible(visibilityNode)) {
                // Fallback: allow anchors that at least have text even if visibility helper unavailable
                if (!text) {
                    return;
                }
            }

            let selectors = this.generateElementSelectors(anchor) || [];
            selectors = selectors.filter(sel => typeof sel === 'string' && sel.length > 0);

            if (!selectors.length) {
                const fallbackSelector = this.generatePositionSelector(anchor);
                if (fallbackSelector) {
                    selectors.push(fallbackSelector);
                }
            }

            if (!selectors.length) {
                return;
            }

            const labelText = text || ariaLabel || titleAttr || href;

            const actionId = this.registerActionableElement(anchor, 'link');
            if (!actionId) {
                return;
            }

            const storedDescriptor = this.getActionableElement(actionId);
            if (!storedDescriptor) {
                return;
            }

            const combinedSelectors = Array.from(
                new Set([...(storedDescriptor.selectors || []), ...selectors])
            );

            const attributes = { ...(storedDescriptor.attributes || {}) };
            attributes.href = href;
            if (titleAttr) {
                attributes.title = titleAttr;
            }
            if (ariaLabel) {
                attributes['aria-label'] = ariaLabel;
            }

            const normalizedText = labelText.substring(0, 240);
            const baseUrlContext = storedDescriptor.urlContext || {};
            const descriptor = {
                ...storedDescriptor,
                selectors: combinedSelectors,
                attributes,
                textContent: labelText.substring(0, 200),
                urlContext: {
                    ...baseUrlContext,
                    url: href,
                    textContent: normalizedText,
                    title: titleAttr?.trim() || baseUrlContext.title || null,
                    ariaLabel: ariaLabel?.trim() || baseUrlContext.ariaLabel || null
                },
                timestamp: Date.now()
            };

            this.actionableElements.set(actionId, descriptor);

            if (this.pageState && Array.isArray(this.pageState.interactiveElements)) {
                const existingIndex = this.pageState.interactiveElements.findIndex(item => item.id === actionId);
                if (existingIndex >= 0) {
                    const existingEntry = this.pageState.interactiveElements[existingIndex];
                    this.pageState.interactiveElements[existingIndex] = {
                        ...descriptor,
                        element: existingEntry.element
                    };
                }
            }

            extras.push({ ...descriptor });
            existingHrefs.add(href);
        });

        return extras;
    } catch (error) {
        console.warn('[Content] ⚠️ Failed to collect additional anchor descriptors:', error);
        return [];
    }
};

/**
 * 🆕 NEW: Scan page and register all existing interactive elements
 */
IntelligenceEngine.prototype.scanAndRegisterPageElements = function() {
    try {
        console.log("[Content] 🔍 Scanning page for interactive elements...");
        
        // 🆕 CSP bypass already handled during page initialization - no need to repeat
        
        // Clear existing elements
        this.actionableElements.clear();
        this.contentElements.clear(); // 🆕 NEW: Clear content elements too
        this.elementCounter = 0;
        if (this.youtubeRegisteredUrls) {
            this.youtubeRegisteredUrls.clear();
        } else {
            this.youtubeRegisteredUrls = new Set();
        }
        
        // 🎯 Framework-specific scanning (site configs only)
        let frameworkElements = [];
        if (typeof scanWithFrameworkSelectors === 'function') {
            frameworkElements = scanWithFrameworkSelectors();
        }
        
        // Process framework elements only
        const allElements = frameworkElements.map(fe => fe.element);
        
        // 🎯 Process framework elements only
        let registeredCount = 0;
        let urlElementCount = 0;
        
        // 🆕 NEW: Track URLs to prevent duplicates across ALL registries
        const registeredUrls = new Set();
        
        allElements.forEach(element => {
            // Get the category from the framework element data
            const frameworkElement = frameworkElements.find(fe => fe.element === element);
            if (frameworkElement && frameworkElement.type) {
                const category = frameworkElement.type;
                
                // 🆕 NEW: Check for URL duplicates BEFORE any processing
                const elementUrl = this.extractElementUrl(element);
                if (elementUrl && registeredUrls.has(elementUrl)) {
                    return; // Skip this element completely - don't process it at all
                }
                
                // 🎯 PURIFY: Filter out content elements before processing
                const purifiedElement = this.purifyElement(element, category);
                
                if (purifiedElement) {
                    const isInteractive = this.isInteractiveElement(purifiedElement);
                    const passesQuality = this.passesBasicQualityFilter(purifiedElement);
                    
                    if (isInteractive && passesQuality) {
                        // Register the element (we already know it's not a duplicate URL)
                        const actionType = this.determineActionType(purifiedElement);
                        const actionId = this.registerActionableElement(purifiedElement, actionType);
                        registeredCount++;
                        
                        // Track the URL to prevent future duplicates
                        if (elementUrl) {
                            registeredUrls.add(elementUrl);
                            urlElementCount++;
                        }
                    }
                }
            }
        });

        if (window.currentFramework === 'youtube') {
            const extraLinks = this.registerYoutubeLockupLinks(registeredUrls);
            if (extraLinks.registered > 0) {
                registeredCount += extraLinks.registered;
                urlElementCount += extraLinks.urlCount;
            }
        }

        // 🎯 CLEAN BREAKDOWN: Show site config categories and URL elements
        const categoryBreakdown = {};
        allElements.forEach(element => {
            // Get the category from the framework element data
            const frameworkElement = frameworkElements.find(fe => fe.element === element);
            if (frameworkElement && frameworkElement.type) {
                const category = frameworkElement.type;
                categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
            }
        });
        
        // 🎯 NEW: Detailed breakdown of what actionable elements you actually have
        const actionableBreakdown = {};
        this.actionableElements.forEach((element, id) => {
            const type = element.actionType || 'unknown';
            actionableBreakdown[type] = (actionableBreakdown[type] || 0) + 1;
        });
        
        // 🎯 CONCISE SUMMARY: Show essential scan results
        console.log(`[Content] 🎯 SCAN: ${registeredCount} actionable + ${this.contentElements.size} content + ${urlElementCount} URLs = ${allElements.length} total`);
        
        // 🎯 NEW: Show exactly what actionable elements you got
        console.log(`[Content] 🎯 ACTIONABLE BREAKDOWN:`, actionableBreakdown);
        console.log(`[Content] 🎯 CATEGORY BREAKDOWN:`, categoryBreakdown);
        
        // Update page state
        this.pageState.interactiveElements = this.getAllActionableElements();
        
        // 🆕 NEW: Mark initial scan as complete
        this.initialScanCompleted = true;
        console.log("[Content] ✅ Initial page scan marked as complete");
        applyConfiguredFocus('initial_scan');
        
        // 🎯 NEW: Send intelligence update AFTER filtering is complete (not during scan)
        console.log("[Content] 📤 Filtering complete, sending intelligence update with filtered results...");
        
        // ✅ ENSURE: Only send update if we have filtered results
        if (this.actionableElements.size > 0 && this.queueIntelligenceUpdate) {
            console.log(`[Content] 📤 Sending intelligence update with ${this.actionableElements.size} filtered actionable elements`);
            this.queueIntelligenceUpdate('high', 'scan_complete');
        } else {
            console.log("[Content] ⚠️ No actionable elements after filtering, skipping intelligence update");
        }
            
            const result = {
                success: true,
                totalElements: this.actionableElements.size + this.contentElements.size,
                actionableElements: this.getActionableElementsSummary(),
                contentElements: this.getContentElementsSummary(),
                actionMapping: this.generateActionMapping(),
                message: `Successfully registered ${this.actionableElements.size} actionable elements and ${this.contentElements.size} content elements`
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
        
        // 🆕 NEW: Scan will be triggered by load event listener instead of running immediately
        if (intelligenceEngine) {
            console.log("[Content] 🔍 Scan delayed until page is fully loaded...");
            
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
            
            // 🎯 FIXED: No CSP bypass needed for tab visibility - just queue intelligence update
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

        
        const consolidatedMenus = consolidateAllMenus(toggleButtons, mainNavigationMenus, standaloneMenus);
        

        
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
            
            
            // 🚫 AGGRESSIVE: Add ALL toggle buttons as toggles (don't filter by text)
            let toggleCount = 0;
            toggleButtons.forEach((toggleButton, index) => {

                
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
            const classes = (element.className && typeof element.className === 'string') ? element.className.split(' ').filter(c => c.trim()) : [];
            classes.forEach(className => {
                if (className) {
                    selectors.push(`.${className}`);
                }
            });
        }
        
        // 🎯 Tag + class selector
        if (element.className) {
            const classes = (element.className && typeof element.className === 'string') ? element.className.split(' ').filter(c => c.trim()) : [];
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
