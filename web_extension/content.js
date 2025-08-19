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

// Utility function for async delays
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 👁️ Check if an element is visible on the page
 * 
 * This function determines if an element is actually visible to the user,
 * filtering out hidden, collapsed, or zero-sized elements.
 * 
 * @param {Element} element - DOM element to check
 * @returns {boolean} - True if element is visible
 */
const visible = (element) => {
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
let navigationHistory = [];
let currentHistoryIndex = -1;
let isHistoryTrackingEnabled = true;

/**
 * 🧭 Initialize history tracking
 * 
 * Sets up history tracking and popstate event listener to monitor
 * browser navigation changes.
 */
function initializeHistoryTracking() {
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

// Initialize history tracking when content script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHistoryTracking);
} else {
    initializeHistoryTracking();
}
