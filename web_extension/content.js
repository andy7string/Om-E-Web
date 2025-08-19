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
    console.log("[Content] 🧪 First time initialization, setting up intelligence system...");
}

// 🆕 NEW: DOM Change Detection System - Use 'var' to prevent redeclaration errors
var domChangeObserver = null;
var changeDetectionEnabled = false;
var changeCount = 0;
var lastChangeTime = 0;

// 🆕 NEW: Intelligent Change Aggregation System
var changeAggregator = null;
var intelligenceEngine = null;
var pageContext = null;
var changeHistory = [];
var lastIntelligenceUpdate = 0;
var INTELLIGENCE_UPDATE_INTERVAL = 2000; // 2 seconds between intelligence updates

// 🆕 NEW: Simple test to verify code is running
console.log("[Content] 🧪 Testing intelligence system components...");
console.log("[Content] 🧪 DOM change detection system:", { domChangeObserver, changeDetectionEnabled, changeCount });
console.log("[Content] 🧪 Intelligence system variables:", { changeAggregator, intelligenceEngine, pageContext });

// 🆕 NEW: Test event listener for debugging from page context
document.addEventListener('testIntelligence', (event) => {
    console.log("[Content] 🧪 Test event received:", event.detail);
    
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
            
        default:
            console.log("[Content] 🧪 Unknown command:", command);
    }
});

console.log("[Content] 🧪 Test event listener added - use document.dispatchEvent(new CustomEvent('testIntelligence', {detail: {command: 'testIntelligenceSystem'}}))");

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
            
            let hasSignificantChanges = false;
            let changeTypes = new Set();
            
            mutations.forEach((mutation) => {
                try {
                    // Track change types
                    changeTypes.add(mutation.type);
                    
                    // Check if this is a significant change
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // New elements added
                        hasSignificantChanges = true;
                        
                        // Log significant additions
                        const addedElements = Array.from(mutation.addedNodes)
                            .filter(node => node.nodeType === Node.ELEMENT_NODE)
                            .slice(0, 3); // Limit logging to first 3
                        
                        if (addedElements.length > 0) {
                            console.log("[Content] 🆕 DOM change: Added elements:", {
                                count: mutation.addedNodes.length,
                                elements: addedElements.map(el => ({
                                    tag: el.tagName,
                                    id: el.id || 'no-id',
                                    className: el.className || 'no-class'
                                }))
                            });
                        }
                        
                    } else if (mutation.type === 'attributes') {
                        // Attribute changes
                        const target = mutation.target;
                        if (target && target.nodeType === Node.ELEMENT_NODE) {
                            const attrName = mutation.attributeName;
                            
                            // Only log significant attribute changes
                            if (attrName === 'class' || 
                                attrName === 'style' || 
                                attrName === 'data-*' ||
                                attrName === 'aria-*') {
                                
                                hasSignificantChanges = true;
                                console.log("[Content] 🆕 DOM change: Attribute change:", {
                                    element: target.tagName,
                                    attribute: attrName,
                                    target: target.id || target.className || 'unknown'
                                });
                            }
                        }
                    } else if (mutation.type === 'characterData') {
                        // Text content changes
                        const target = mutation.target;
                        if (target && target.parentElement) {
                            const parent = target.parentElement;
                            const textLength = target.textContent?.length || 0;
                            
                            // Only log significant text changes
                            if (textLength > 10) {
                                hasSignificantChanges = true;
                                console.log("[Content] 🆕 DOM change: Text content change:", {
                                    element: parent.tagName,
                                    textLength: textLength,
                                    target: parent.id || parent.className || 'unknown'
                                });
                            }
                        }
                    }
                    
                } catch (mutationError) {
                    console.warn("[Content] Error processing mutation:", mutationError.message);
                }
            });
            
            if (hasSignificantChanges) {
                // Update change tracking
                changeCount++;
                lastChangeTime = Date.now();
                
                console.log("[Content] 🆕 DOM changes detected:", {
                    changeNumber: changeCount,
                    types: Array.from(changeTypes),
                    timestamp: new Date(lastChangeTime).toISOString(),
                    totalMutations: mutations.length
                });
                
                // 🆕 ENHANCED: Route changes through intelligence system with debug logging
                if (changeAggregator && intelligenceEngine) {
                    console.log("[Content] 🧠 Routing changes through intelligence system...");
                    
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
                        
                        console.log("[Content] 🧠 Processing change:", changeInfo);
                        changeAggregator.addChange(changeInfo);
                    });
                    
                    console.log("[Content] 🧠 Changes queued for intelligence processing");
                } else {
                    console.warn("[Content] ⚠️ Intelligence system not ready:", {
                        changeAggregator: !!changeAggregator,
                        intelligenceEngine: !!intelligenceEngine
                    });
                }
                
                // 🆕 NEW: Notify service worker about DOM changes
                notifyServiceWorkerOfChanges({
                    changeNumber: changeCount,
                    types: Array.from(changeTypes),
                    timestamp: lastChangeTime,
                    totalMutations: mutations.length,
                    url: window.location.href
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
        console.warn("[Content] Failed to notify service worker:", error.message);
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
    console.log("[Content] Message received from service worker:", message);
    
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
    // Check if we're in an iframe (crawl4ai-inspired approach)
    let isInIframe = window !== window.top;
    
    // 🛡️ SAFE CROSS-ORIGIN ACCESS: Handle restricted iframe contexts
    let location, mainDocument;
    
    try {
        if (isInIframe) {
            // Try to access main frame, but handle cross-origin restrictions
            location = window.top.location;
            mainDocument = window.top.document;
        } else {
            location = window.location;
            mainDocument = document;
        }
    } catch (crossOriginError) {
        console.warn("[Content] Cross-origin iframe detected, using current frame context:", crossOriginError.message);
        // Fall back to current frame if we can't access main frame
        location = window.location;
        mainDocument = document;
        // Mark that we're in a restricted iframe
        isInIframe = true;
    }
    
    return {
        url: location.href,  // Main page URL, not iframe URL
        title: mainDocument.title,  // Main page title
        hostname: location.hostname,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        protocol: location.protocol,
        timestamp: Date.now(),
        readyState: document.readyState,
        userAgent: navigator.userAgent,
        isInIframe: isInIframe,  // Track if we're in iframe for debugging
        frameContext: {
            isMainFrame: !isInIframe,
            frameUrl: window.location.href,  // Current frame URL
            mainPageUrl: location.href,  // Main page URL
            frameTitle: document.title,  // Current frame title
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
        // 🆕 ENHANCED ERROR HANDLING: Wrap everything in try-catch
        console.log("[Content] generateSiteMap: Initializing with error handling...");
        
        // 🎯 FRAME CONTEXT HANDLING: Use main frame if we're in an iframe
        const isInIframe = window !== window.top;
        
        // 🛡️ SAFE CROSS-ORIGIN ACCESS: Handle restricted iframe contexts
        let targetDocument, targetWindow;
        
        try {
            if (isInIframe) {
                // Try to access main frame, but handle cross-origin restrictions
                targetDocument = window.top.document;
                targetWindow = window.top;
            } else {
                targetDocument = document;
                targetWindow = window;
            }
        } catch (crossOriginError) {
            console.warn("[Content] Cross-origin iframe detected in generateSiteMap, using current frame context:", crossOriginError.message);
            // Fall back to current frame if we can't access main frame
            targetDocument = document;
            targetWindow = window;
            // Mark that we're in a restricted iframe
            isInIframe = true;
        }
        
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
        lastUpdate: Date.now()
    };
    this.eventHistory = [];
    this.llmInsights = [];
    this.actionableElements = new Map(); // 🆕 NEW: Map of actionable elements with IDs
    this.elementCounter = 0; // 🆕 NEW: Counter for generating unique IDs
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
    this.sendIntelligenceUpdate();
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
    const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'];
    
    // Check tag name
    if (interactiveTags.includes(element.tagName)) return true;
    
    // Check role attribute
    const role = element.getAttribute('role');
    if (role && interactiveRoles.includes(role)) return true;
    
    // Check for click handlers or interactive classes
    const className = element.className || '';
    const interactiveClasses = ['btn', 'button', 'clickable', 'interactive', 'link'];
    if (interactiveClasses.some(cls => className.toLowerCase().includes(cls))) return true;
    
    // Check for event listeners (basic check)
    if (element.onclick || element.onmousedown || element.onmouseup) return true;
    
    return false;
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
 * Send intelligence update to service worker
 */
IntelligenceEngine.prototype.sendIntelligenceUpdate = function() {
    const update = {
        type: "intelligence_update",
        timestamp: Date.now(),
        pageState: this.pageState,
        recentInsights: this.llmInsights.slice(-5), // Last 5 insights
        totalEvents: this.eventHistory.length,
        recommendations: this.getCurrentRecommendations(),
        // 🆕 NEW: Actionable elements for LLM instructions
        actionableElements: this.getActionableElementsSummary(),
        actionMapping: this.generateActionMapping()
    };
    
    console.log("[Content] 🧠 IntelligenceEngine: Preparing update:", {
        type: update.type,
        totalEvents: update.totalEvents,
        actionableElements: update.actionableElements.length,
        recommendations: update.recommendations
    });
    
    try {
        chrome.runtime.sendMessage(update);
        console.log("[Content] 🧠 Intelligence update sent to service worker");
    } catch (error) {
        console.warn("[Content] Failed to send intelligence update:", error.message);
    }
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
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
                selectors.push(`.${classes[0]}`);
            }
        }
        
        // Strategy 4: Tag + class combination
        if (element.tagName && element.className) {
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
    const keyAttrs = ['id', 'name', 'type', 'role', 'aria-label', 'title', 'alt'];
    
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
    const actionableId = this.generateActionableId(element, actionType);
    this.actionableElements.set(actionableId.id, actionableId);
    
    // Add to page state
    this.pageState.interactiveElements.push({
        ...actionableId,
        element: element
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
IntelligenceEngine.prototype.executeAction = function(actionId, action, params = {}) {
    const actionableElement = this.getActionableElement(actionId);
    if (!actionableElement) {
        return { success: false, error: "Element not found" };
    }
    
    try {
        // Use the first available selector
        const selector = actionableElement.selectors[0];
        if (!selector) {
            return { success: false, error: "No valid selector found for element" };
        }
        
        // Find the actual DOM element
        const element = document.querySelector(selector);
        if (!element) {
            return { success: false, error: "Element not found in DOM with selector: " + selector };
        }
        
        let result;
        switch (action) {
            case 'click':
                element.click();
                result = { success: true, action: 'click', elementId: actionId, message: 'Element clicked successfully' };
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
                element.focus();
                result = { success: true, action: 'focus', elementId: actionId, message: 'Element focused successfully' };
                break;
                
            default:
                result = { success: false, error: `Unsupported action: ${action}` };
        }
        
        console.log("[Content] 🎯 Action executed:", { actionId, action, result });
        return result;
        
    } catch (error) {
        console.error("[Content] Error executing action:", error);
        return { success: false, error: error.message, actionId, action };
    }
};

/**
 * 🆕 NEW: Scan page and register all existing interactive elements
 */
IntelligenceEngine.prototype.scanAndRegisterPageElements = function() {
    try {
        console.log("[Content] 🔍 Scanning page for interactive elements...");
        
        // Clear existing elements
        this.actionableElements.clear();
        this.elementCounter = 0;
        
        // Find all interactive elements
        const interactiveSelectors = [
            'a', 'button', 'input', 'select', 'textarea',
            '[role="button"]', '[role="link"]', '[role="menuitem"]',
            '[role="tab"]', '[role="checkbox"]', '[role="radio"]',
            '.btn', '.button', '.clickable', '.interactive'
        ];
        
        const elements = document.querySelectorAll(interactiveSelectors.join(','));
        console.log("[Content] 🔍 Found", elements.length, "interactive elements");
        
        // Register each element
        elements.forEach(element => {
            if (this.isInteractiveElement(element)) {
                const actionType = this.determineActionType(element);
                const actionId = this.registerActionableElement(element, actionType);
                
                console.log("[Content] 📝 Registered element:", {
                    actionId: actionId,
                    tagName: element.tagName,
                    actionType: actionType,
                    textContent: element.textContent?.trim().substring(0, 30) || ''
                });
            }
        });
        
        // Update page state
        this.pageState.interactiveElements = this.getAllActionableElements();
        
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
        setTimeout(() => {
            if (intelligenceEngine) {
                console.log("[Content] 🔍 Starting initial page element scan...");
                intelligenceEngine.scanAndRegisterPageElements();
            } else {
                console.error("[Content] ❌ Intelligence engine not available for initial scan");
            }
        }, 1000); // Wait 1 second for page to fully load
        
    } catch (error) {
        console.error("[Content] ❌ Failed to initialize intelligence system:", error);
    }
}
