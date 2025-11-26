(() => {
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
        return;
    }
    window.omEWebContentScriptLoaded = true;

    // 🛡️ MAIN FRAME SAFETY CHECK - Ensure script only runs in main frame
    if (window.top !== window.self) {
        console.log("[Content] 🚫 Script running in iframe, exiting to prevent iframe scanning issues");
        // Exit early if we're in an iframe
        return;
    }

    // 🎯 Confirm we're in main frame
    console.log("[Content] ✅ Running in main frame:", {
        isMainFrame: window.top === window.self,
        currentUrl: window.location.href,
        topUrl: window.top.location.href
    });

    /**
     * 🛡️ Establish a persistent keep-alive port so the service worker stays awake.
     * This prevents Chrome from suspending the background context while the
     * automation bridge is connected to the Python server.
     */
    function ensureKeepAlivePortConnection() {
        if (window.__omeKeepAlivePort) {
            return;
        }

        try {
            const port = chrome.runtime.connect({ name: "ome_keep_alive" });
            window.__omeKeepAlivePort = port;

            port.onDisconnect.addListener(() => {
                console.warn("[Content] ⚠️ Keep-alive port disconnected, retrying…");
                window.__omeKeepAlivePort = null;
                setTimeout(ensureKeepAlivePortConnection, 500);
            });

            console.log("[Content] 🔌 Keep-alive port established");
        } catch (error) {
            console.error("[Content] ❌ Failed to establish keep-alive port:", error);
            setTimeout(ensureKeepAlivePortConnection, 1000);
        }
    }

    ensureKeepAlivePortConnection();

    let initialScanScheduled = false;
    let initialScanReason = null;

    // ============================================================================
    // 🆕 NEW CLEAN SCAN ORCHESTRATION
    // ============================================================================
    let scanInProgress = false;
    let currentPageVersion = null;
    let significantChangeDetector = null;
    let lastSignificantChangeTime = 0;

    /**
     * ============================================================================
     * MAIN SCAN FUNCTION - Execute scan with DOM-settle detection
     * ============================================================================
     */
    async function executeScanWithSettle(pageVersion, url, trigger) {
        console.log(`[Content] Scan request received: pageVersion=${pageVersion}, trigger=${trigger}`);

        // 🔒 CHECK SCAN LOCK
        if (scanInProgress) {
            console.log('[Content] ⏸️  Scan already in progress, ignoring request');
            return;
        }

        // Set lock
        scanInProgress = true;

        // 🗑️ CRUFT REMOVAL: Page version system removed - text.md uses simple sequential IDs
        // // 📌 READ/WRITE pageVersion from/to DOM for persistence
        // // If pageVersion is provided by sw.js, use it and update DOM
        // // Otherwise, read from DOM (or default to 1)
        // if (pageVersion !== null && pageVersion !== undefined) {
        //     // SW provided a version, store it in DOM
        //     document.body.dataset.omePageVersion = pageVersion;
        //     currentPageVersion = pageVersion;
        //     console.log(`[Content] 📝 Stored pageVersion=${pageVersion} in DOM`);
        // } else {
        //     // No version provided, read from DOM
        //     const domVersion = document.body.dataset.omePageVersion;
        //     currentPageVersion = domVersion ? parseInt(domVersion, 10) : 1;
        //     console.log(`[Content] 📖 Read pageVersion=${currentPageVersion} from DOM (or defaulted to 1)`);
        // }
        //
        // // 🔄 RESET COUNTER: Always reset to 0 for full rescan
        // // Every scan is a complete rescan (clears all DOM markers and rescans everything)
        // // The pageVersion differentiates between different page states, but within each scan
        // // we always start from 0
        // intelligenceEngine.elementCounter = 0;
        // console.log(`[Content] 🔄 Reset elementCounter to 0 for pageVersion=${currentPageVersion} scan`);

        currentPageVersion = null;  // ✅ SIMPLIFIED: No more page versioning
        console.log(`[Content] 🚀 Starting scan (no page versioning)`);

        try {
            console.log('[Content] 🕐 Waiting for DOM to settle...');

            // ============================================================================
            // STEP 1: WAIT FOR DOM TO SETTLE
            // ============================================================================
            await waitForDOMSettle({
                maxWait: 5000,      // Failsafe: 5s max
                quietWindow: 200    // No mutations for 200ms = settled
            });

            console.log('[Content] ✅ DOM settled, starting scan...');

            // ============================================================================
            // STEP 2: RUN ACTUAL SCAN
            // ============================================================================
            // 🗑️ CRUFT REMOVAL: Dual scanning removed - only use extractSemanticTextWithIds()
            // await intelligenceEngine.scanAndRegisterPageElements();

            console.log('[Content] ✅ Scan complete (semantic extraction only), sending results...');

            // ============================================================================
            // STEP 3: SEND RESULTS
            // ============================================================================
            const intelligenceData = intelligenceEngine.prepareIntelligenceData();

            chrome.runtime.sendMessage({
                type: 'scan_complete',
                pageVersion: currentPageVersion || 1,  // Never send null
                url: window.location.href,
                trigger: trigger,
                intelligenceData: intelligenceData
            });

        } catch (error) {
            console.error('[Content] Scan failed:', error);

            // Send error to service worker
            chrome.runtime.sendMessage({
                type: 'scan_error',
                pageVersion: currentPageVersion || 1,  // Never send null
                error: error.message
            });

        } finally {
            // 🔓 RELEASE LOCK
            scanInProgress = false;
            console.log('[Content] Scan lock released');

            // Start significant change detector after scan completes
            startSignificantChangeDetector();
        }
    }

    /**
     * ============================================================================
     * DOM SETTLE DETECTION - Minimal MutationObserver
     * ============================================================================
     */
    function waitForDOMSettle({ maxWait, quietWindow }) {
        return new Promise((resolve) => {
            let observer;
            let quietTimer;
            let maxWaitTimer;
            let lastMutationTime = Date.now();

            const cleanup = () => {
                if (observer) observer.disconnect();
                if (quietTimer) clearTimeout(quietTimer);
                if (maxWaitTimer) clearTimeout(maxWaitTimer);
            };

            const settle = () => {
                cleanup();
                const totalWait = Date.now() - lastMutationTime;
                console.log(`[Content] DOM settled after ${totalWait}ms`);
                resolve();
            };

            // MAX WAIT FAILSAFE - If DOM never settles, proceed anyway
            maxWaitTimer = setTimeout(() => {
                console.log(`[Content] ⚠️  Max wait (${maxWait}ms) reached, proceeding with scan`);
                settle();
            }, maxWait);

            // MUTATION OBSERVER - Detect when DOM stops changing
            observer = new MutationObserver((mutations) => {
                lastMutationTime = Date.now();

                // Clear previous quiet timer
                if (quietTimer) clearTimeout(quietTimer);

                // Start new quiet timer
                quietTimer = setTimeout(() => {
                    const quietTime = Date.now() - lastMutationTime;
                    if (quietTime >= quietWindow) {
                        console.log(`[Content] No mutations for 200ms, DOM settled`);
                        settle();
                    }
                }, quietWindow);
            });

            // Start observing
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: false,    // Ignore attribute changes (noisy)
                characterData: false  // Ignore text changes (noisy)
            });

            // Start initial quiet timer (in case DOM is already settled)
            quietTimer = setTimeout(settle, quietWindow);
        });
    }

    /**
     * ============================================================================
     * SIGNIFICANT CHANGE DETECTOR - Continuous observer for major DOM changes
     * ============================================================================
     * Watches DOM continuously. When DOM stops changing for 200ms, triggers scan.
     * Same pattern as waitForDOMSettle - resets timer on each mutation.
     */
    function startSignificantChangeDetector() {
        if (significantChangeDetector) {
            return; // Already running
        }

        let mutationCount = 0;
        let quietTimer = null;
        const QUIET_WINDOW_MS = 200;  // Same as scan settle

        significantChangeDetector = new MutationObserver((mutations) => {
            mutationCount += mutations.length;

            // Clear previous timer - DOM still changing
            if (quietTimer) {
                clearTimeout(quietTimer);
            }

            // Start new quiet window timer
            quietTimer = setTimeout(() => {
                const now = Date.now();

                // Significant change criteria:
                // 1. More than 20 mutations (substantial DOM change)
                // 2. At least 2 seconds since last significant change (rate limit)
                const isSignificant = mutationCount > 20 && (now - lastSignificantChangeTime) > 2000;

                if (isSignificant) {
                    console.log(`[Content] 🔄 Significant DOM change detected (${mutationCount} mutations), DOM quiet for 200ms, triggering scan`);
                    lastSignificantChangeTime = now;

                    // Trigger scan via service worker
                    chrome.runtime.sendMessage({
                        type: 'request_scan',
                        url: window.location.href,
                        trigger: 'significant_dom_change'
                    });
                }

                // Reset counter
                mutationCount = 0;
            }, QUIET_WINDOW_MS);
        });

        // Start observing - always watching
        significantChangeDetector.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });

        console.log('[Content] 🔍 Significant change detector started - watching DOM continuously');
    }

    // REMOVED 2025-11-21: stopSignificantChangeDetector() was never called (dead code, 7 lines)
    // Corresponding start function exists but stop function was orphaned and unused

    const pageIdleMonitor = (() => {
        if (window.omEWebPageIdleMonitor) {
            return window.omEWebPageIdleMonitor;
        }

        let inflightRequests = 0;
        const idleResolvers = new Set();
        let idleScheduled = false;
        let mutationObserver = null;
        let resourceObserver = null;
        let lastChangeTime = performance.now();
        let quietWindowMs = 200;

        const ensureNonNegative = (value) => (value < 0 ? 0 : value);

        const resolveIdleWaiters = () => {
            if (!idleResolvers.size) {
                return;
            }

            const resolvers = Array.from(idleResolvers);
            idleResolvers.clear();
            resolvers.forEach((resolve) => resolve());
        };

        const scheduleIdleCheck = () => {
            if (idleScheduled) {
                return;
            }

            idleScheduled = true;

            const runCheck = () => {
                idleScheduled = false;

                if (!idleResolvers.size) {
                    return;
                }

                if (inflightRequests > 0) {
                    scheduleIdleCheck();
                    return;
                }

                const now = performance.now();
                if (now - lastChangeTime < quietWindowMs) {
                    scheduleIdleCheck();
                    return;
                }

                resolveIdleWaiters();
            };

            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(runCheck, { timeout: quietWindowMs });
            } else {
                window.requestAnimationFrame(runCheck);
            }
        };

        const markChange = () => {
            lastChangeTime = performance.now();
            scheduleIdleCheck();
        };

        const wrapFetch = () => {
            if (typeof window.fetch !== 'function' || window.fetch.__omeWrapped) {
                return;
            }

            const originalFetch = window.fetch;
            const wrappedFetch = function wrappedFetch(...args) {
                inflightRequests += 1;
                markChange();

                // 🆕 NEW: Notify webserver about network activity
                const url = args[0]?.toString() || 'unknown';
                notifyNetworkActivity('fetch_start', url);

                let completed = false;
                const finalize = (status = 'complete') => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    inflightRequests = ensureNonNegative(inflightRequests - 1);
                    markChange();

                    // 🆕 NEW: Notify webserver about network completion
                    notifyNetworkActivity('fetch_end', url, status);
                };

                try {
                    const result = originalFetch.apply(this, args);
                    return Promise.resolve(result)
                        .then((response) => {
                            finalize('success');
                            return response;
                        })
                        .catch((error) => {
                            finalize('error');
                            throw error;
                        });
                } catch (error) {
                    finalize('error');
                    throw error;
                }
            };

            wrappedFetch.__omeWrapped = true;
            wrappedFetch.__omeOriginal = originalFetch;
            window.fetch = wrappedFetch;
        };

        const wrapXmlHttpRequest = () => {
            if (typeof XMLHttpRequest === 'undefined') {
                return;
            }
            const proto = XMLHttpRequest.prototype;
            if (!proto || proto.send.__omeWrapped) {
                return;
            }

            const originalSend = proto.send;
            proto.send = function wrappedSend(...args) {
                inflightRequests += 1;
                markChange();

                // 🆕 NEW: Notify webserver about network activity
                const url = this.responseURL || this._url || 'unknown';
                notifyNetworkActivity('xhr_start', url);

                let finalized = false;
                const finalize = (status = 'complete') => {
                    if (finalized) {
                        return;
                    }
                    finalized = true;
                    inflightRequests = ensureNonNegative(inflightRequests - 1);
                    markChange();

                    // 🆕 NEW: Notify webserver about network completion
                    notifyNetworkActivity('xhr_end', url, status);
                };

                this.addEventListener('loadend', () => finalize('success'), { once: true });
                this.addEventListener('error', () => finalize('error'), { once: true });
                this.addEventListener('abort', () => finalize('abort'), { once: true });

                try {
                    return originalSend.apply(this, args);
                } catch (error) {
                    finalize('error');
                    throw error;
                }
            };

            proto.send.__omeWrapped = true;
        };

        const ensureObservers = () => {
            if (!mutationObserver) {
                mutationObserver = new MutationObserver(() => markChange());
                try {
                    mutationObserver.observe(document, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true
                    });
                } catch (error) {
                    console.warn("[Content] ⚠️ MutationObserver failed to start:", error.message);
                }
            }

            if (!resourceObserver && typeof PerformanceObserver === 'function') {
                try {
                    resourceObserver = new PerformanceObserver(() => markChange());
                    resourceObserver.observe({ entryTypes: ['resource'] });
                } catch (error) {
                    resourceObserver = null;
                }
            }
        };

        const waitForIdle = ({ maxWait = 15000, quietWindow = 200 } = {}) => {
            ensureObservers();
            wrapFetch();
            wrapXmlHttpRequest();
            quietWindowMs = typeof quietWindow === 'number' && quietWindow >= 0 ? quietWindow : 0;
            lastChangeTime = performance.now() - quietWindowMs;
            scheduleIdleCheck();

            return new Promise((resolve) => {
                let timeoutId = null;

                const complete = () => {
                    idleResolvers.delete(onIdle);
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                    }
                    resolve();
                };

                const onIdle = () => {
                    complete();
                };

                idleResolvers.add(onIdle);
                scheduleIdleCheck();

                if (typeof maxWait === 'number' && Number.isFinite(maxWait) && maxWait > 0) {
                    timeoutId = setTimeout(() => {
                        console.warn("[Content] ⚠️ Idle wait exceeded maxWait, proceeding anyway");
                        complete();
                    }, maxWait);
                }
            });
        };

        const api = {
            waitForIdle,
            markChange
        };

        window.omEWebPageIdleMonitor = api;
        return api;
    })();

    function scheduleInitialScan(reason = 'unspecified', options = { maxWait: 12000 }) {
        if (initialScanScheduled) {
            console.log("[Content] ⏭️ Initial scan already scheduled (reason:", initialScanReason, ")");
            return;
        }

        initialScanScheduled = true;
        initialScanReason = reason;

        const startScan = async () => {
            const waitBudget = options?.maxWait;
            console.log(`[Content] 🔍 Scheduling initial scan (${reason}) using idle detection (maxWait ${waitBudget ?? '∞'}ms)`);
            try {
                await pageIdleMonitor.waitForIdle({ maxWait: waitBudget, quietWindow: 200 });
            } catch (error) {
                console.warn("[Content] ⚠️ Idle wait failed, running scan anyway:", error?.message || error);
            }
            runScanAfterPageLoad();
        };

        if (document.readyState === 'complete') {
            startScan();
        } else {
            console.log("[Content] 🔄 Page still loading, deferring initial scan until load event...");
            window.addEventListener('load', () => {
                startScan();
            }, { once: true });
        }
    }

    setTimeout(() => {
        if (!initialScanScheduled) {
            console.log("[Content] ⏳ Service worker trigger not received; scheduling fallback scan");
            scheduleInitialScan('fallback_timeout');
        }
    }, 4000);

    // 🆕 NEW: Function to wait for page to settle before scanning
    function scanWhenPageSettles(scanFn, options = {}) {
        const { maxWait = 12000, quietWindow = 200 } = options ?? {};

        pageIdleMonitor
            .waitForIdle({ maxWait, quietWindow })
            .then(() => {
                console.log("[Content] 💤 Browser idle detected, running scan...");
                scanFn();
            })
            .catch((error) => {
                console.warn("[Content] ⚠️ scanWhenPageSettles encountered an error, running scan anyway:", error?.message || error);
                scanFn();
            });
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

    // 🆕 NEW: Helper utilities for on-demand DOM discovery
    function cssEscape(value) {
        if (value == null) return '';
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }
        return String(value).replace(/["\\]/g, '\\$&');
    }

    function computeCssPath(element, maxDepth = 5) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return null;
        }

        const path = [];
        let depth = 0;
        let node = element;

        while (node && node.nodeType === Node.ELEMENT_NODE && depth < maxDepth) {
            let selector = node.nodeName.toLowerCase();

            if (node.id) {
                selector += `#${cssEscape(node.id)}`;
                path.unshift(selector);
                break;
            }

            const siblingTagName = selector;
            let position = 1;
            let sibling = node.previousElementSibling;
            while (sibling) {
                if (sibling.nodeName.toLowerCase() === siblingTagName) {
                    position += 1;
                }
                sibling = sibling.previousElementSibling;
            }

            selector += `:nth-of-type(${position})`;
            path.unshift(selector);
            node = node.parentElement;
            depth += 1;
        }

        return path.join(' > ') || null;
    }

    function buildSelectorCandidates(element) {
        const selectors = [];
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return selectors;
        }

        const tag = element.tagName.toLowerCase();

        if (element.id) {
            selectors.push(`#${cssEscape(element.id)}`);
        }

        const dataTestId = element.getAttribute('data-testid');
        if (dataTestId) {
            selectors.push(`[data-testid="${cssEscape(dataTestId)}"]`);
        }

        const nameAttr = element.getAttribute('name');
        if (nameAttr) {
            selectors.push(`${tag}[name="${cssEscape(nameAttr)}"]`);
        }

        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) {
            selectors.push(`${tag}[aria-label="${cssEscape(ariaLabel)}"]`);
        }

        const placeholder = element.getAttribute('placeholder');
        if (placeholder) {
            selectors.push(`${tag}[placeholder="${cssEscape(placeholder)}"]`);
        }

        const typeAttr = element.getAttribute('type');
        if (typeAttr) {
            selectors.push(`${tag}[type="${cssEscape(typeAttr)}"]`);
        }

        const cssPath = computeCssPath(element, 6);
        if (cssPath) {
            selectors.push(cssPath);
        }

        if (window.intelligenceEngine &&
            typeof window.intelligenceEngine.generateElementSelectors === 'function') {
            try {
                const generated = window.intelligenceEngine.generateElementSelectors.call(
                    window.intelligenceEngine,
                    element
                );
                if (Array.isArray(generated)) {
                    generated.forEach(sel => {
                        if (typeof sel === 'string' && sel.trim()) {
                            selectors.push(sel.trim());
                        }
                    });
                }
            } catch (error) {
                console.warn('[Content] ⚠️ Failed to generate selectors from engine:', error.message);
            }
        }

        return Array.from(new Set(selectors.filter(Boolean)));
    }

    function buildElementDescriptor(element, role) {
        if (!element) return null;

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        const visible = typeof isElementVisible === 'function'
            ? isElementVisible(element)
            : Boolean(style) &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0;

        const attributes = {
            id: element.getAttribute('id'),
            name: element.getAttribute('name'),
            type: element.getAttribute('type'),
            placeholder: element.getAttribute('placeholder'),
            ariaLabel: element.getAttribute('aria-label'),
            dataTestId: element.getAttribute('data-testid'),
            autocomplete: element.getAttribute('autocomplete'),
            role: element.getAttribute('role')
        };

        const textContent = element.tagName.toLowerCase() === 'button'
            ? element.innerText || element.textContent || ''
            : element.getAttribute('value') || '';

        const selectors = buildSelectorCandidates(element);

        return {
            role,
            tagName: element.tagName.toLowerCase(),
            primarySelector: selectors[0] || null,
            selectors,
            attributes,
            text: textContent.trim(),
            visible,
            rect: {
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left
            }
        };
    }
    function discoverLoginControls(options = {}) {
        const RESULT_ROLES = ['login_email', 'login_password', 'login_submit'];
        const EXACT_SELECTORS = {
            login_email: [
                '#email',
                'input#email',
                'input[name="email"]',
                'input[name="username"]',
                'input[data-testid="royal-email"]',
                'input[autocomplete="username"]',
                'input[type="email"]'
            ],
            login_password: [
                '#pass',
                'input#pass',
                'input[name="pass"]',
                'input[data-testid="royal-pass"]',
                'input[type="password"]',
                'input[autocomplete="current-password"]'
            ],
            login_submit: [
                'button[name="login"]',
                'button[data-testid="royal-login-button"]',
                'button[type="submit"]',
                'input[type="submit"]'
            ]
        };

        const KEYWORD_MATCHERS = {
            login_email: ['email', 'e-mail', 'phone', 'mobile', 'user', 'username', 'login id'],
            login_password: ['password', 'passcode', 'pin', 'security code'],
            login_submit: ['log in', 'login', 'sign in', 'sign-in', 'submit', 'continue', 'next']
        };

        const SCORE = {
            selector: 100,
            attribute: 80,
            keyword: 60
        };

        const matches = {
            login_email: [],
            login_password: [],
            login_submit: []
        };

        const descriptorByElement = new Map();
        const requireVisible = Boolean(options.requireVisible);

        function register(element, role, score, matchedBy) {
            if (!element || !RESULT_ROLES.includes(role)) {
                return;
            }

            const existing = descriptorByElement.get(element);
            if (existing) {
                existing.score = Math.max(existing.score, score);
                if (matchedBy && existing.matchedBy.indexOf(matchedBy) === -1) {
                    existing.matchedBy.push(matchedBy);
                }
                if (existing.role !== role) {
                    existing.role = role;
                }
                return;
            }

            const descriptor = buildElementDescriptor(element, role);
            if (!descriptor) return;
            if (requireVisible && !descriptor.visible) return;

            descriptor.score = score;
            descriptor.matchedBy = matchedBy ? [matchedBy] : [];
            descriptor.elementId = element.dataset?.omeActionId || null;

            descriptorByElement.set(element, descriptor);
            matches[role].push(descriptor);
        }

        Object.entries(EXACT_SELECTORS).forEach(([role, selectors]) => {
            selectors.forEach(selector => {
                let nodes = [];
                try {
                    nodes = Array.from(document.querySelectorAll(selector));
                } catch (error) {
                    // Ignore invalid selectors
                }
                nodes.forEach(node => register(node, role, SCORE.selector, `selector:${selector}`));
            });
        });

        const allInputs = Array.from(document.querySelectorAll('input, textarea'));
        const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"]'));

        function hasKeyword(text, keywords) {
            if (!text) return false;
            const normalized = text.toLowerCase();
            return keywords.some(keyword => normalized.includes(keyword));
        }

        allInputs.forEach(node => {
            const typeAttr = (node.getAttribute('type') || '').toLowerCase();
            const placeholder = node.getAttribute('placeholder') || '';
            const ariaLabel = node.getAttribute('aria-label') || '';
            const nameAttr = node.getAttribute('name') || '';

            if (typeAttr === 'password') {
                register(node, 'login_password', SCORE.attribute, 'type=password');
                return;
            }

            if (typeAttr === 'email') {
                register(node, 'login_email', SCORE.attribute, 'type=email');
            }

            if (hasKeyword(placeholder, KEYWORD_MATCHERS.login_email) ||
                hasKeyword(ariaLabel, KEYWORD_MATCHERS.login_email) ||
                hasKeyword(nameAttr, KEYWORD_MATCHERS.login_email)) {
                register(node, 'login_email', SCORE.keyword, 'keyword/email');
            }

            if (hasKeyword(placeholder, KEYWORD_MATCHERS.login_password) ||
                hasKeyword(ariaLabel, KEYWORD_MATCHERS.login_password) ||
                hasKeyword(nameAttr, KEYWORD_MATCHERS.login_password)) {
                register(node, 'login_password', SCORE.keyword, 'keyword/password');
            }
        });

        allButtons.forEach(node => {
            const text = (node.innerText || node.value || '').trim();
            const ariaLabel = node.getAttribute('aria-label') || '';
            const nameAttr = node.getAttribute('name') || '';

            if (hasKeyword(text, KEYWORD_MATCHERS.login_submit) ||
                hasKeyword(ariaLabel, KEYWORD_MATCHERS.login_submit) ||
                hasKeyword(nameAttr, KEYWORD_MATCHERS.login_submit)) {
                register(node, 'login_submit', SCORE.keyword, 'keyword/submit');
            }
        });

        Object.keys(matches).forEach(role => {
            matches[role] = matches[role]
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    if (a.visible !== b.visible) return (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
                    return a.rect.top - b.rect.top;
                });
        });

        const totals = Object.values(matches).reduce((sum, arr) => sum + arr.length, 0);

        return {
            timestamp: Date.now(),
            total: totals,
            matches
        };
    }

    // 🆕 NEW: Guard against multiple initializations
    if (window.intelligenceSystemInitialized && window.intelligenceComponents && window.intelligenceComponents.changeAggregator && window.intelligenceComponents.intelligenceEngine) {
        console.log("[Content] ⚠️ Intelligence system already initialized, reusing existing components...");
        // Reuse existing components
        changeAggregator = window.intelligenceComponents.changeAggregator;
        intelligenceEngine = window.intelligenceComponents.intelligenceEngine;
        if (intelligenceEngine) {
            window.intelligenceEngine = intelligenceEngine;
        }
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
        try {
            // Step 1: Load index file (domain → config file path mapping)
            const indexXhr = new XMLHttpRequest();
            indexXhr.open('GET', chrome.runtime.getURL('site_configs.json'), false); // Synchronous
            indexXhr.send();

            if (indexXhr.status !== 200) {
                console.error("❌ Error loading site config index file:", indexXhr.status);
                return null;
            }

            const domainIndex = JSON.parse(indexXhr.responseText);
            console.log("✅ Site config index loaded:", Object.keys(domainIndex).length, "domains");

            // Step 2: Find config file path for current domain
            let configFilePath = null;
            let matchedDomain = null;

            // Check for exact domain match
            if (domainIndex[currentDomain]) {
                configFilePath = domainIndex[currentDomain];
                matchedDomain = currentDomain;
                console.log(`✅ Exact domain match: ${currentDomain} → ${configFilePath}`);
            } else {
                // Check for partial domain match
                for (const [pattern, filePath] of Object.entries(domainIndex)) {
                    if (pattern !== 'default' && currentDomain.includes(pattern)) {
                        configFilePath = filePath;
                        matchedDomain = pattern;
                        console.log(`✅ Partial domain match: ${pattern} matches ${currentDomain} → ${filePath}`);
                        break;
                    }
                }
            }

            // Fallback to default config
            if (!configFilePath) {
                configFilePath = domainIndex['default'];
                matchedDomain = 'default';
                console.log(`✅ Using default config for ${currentDomain} → ${configFilePath}`);
            }

            if (!configFilePath) {
                console.error("❌ No config file path found for domain:", currentDomain);
                return null;
            }

            // Step 3: Load specific config file
            const configXhr = new XMLHttpRequest();
            configXhr.open('GET', chrome.runtime.getURL(configFilePath), false); // Synchronous
            configXhr.send();

            if (configXhr.status !== 200) {
                console.error(`❌ Error loading config file ${configFilePath}:`, configXhr.status);
                return null;
            }

            const config = JSON.parse(configXhr.responseText);
            console.log(`✅ Config loaded from ${configFilePath}:`, config.framework);

            // Step 4: Set globals (same as before)
            siteConfig = config;
            window.currentSiteConfig = config;
            window.currentFramework = config.framework;
            console.log("✅ Site config set:", config);

            return config;

        } catch (error) {
            console.error("❌ Error in getSiteConfigDirect:", error);
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

            // 🎯 Contenteditable / Rich text inputs
            const isContentEditable = element.isContentEditable === true || element.getAttribute('contenteditable') === 'true';
            if (isContentEditable) return 'input';

            // 🎯 Role-based Actions
            if (role === 'button') return 'click';
            if (role === 'link') return 'navigate';
            if (role === 'menuitem') return 'menu_select';
            if (role === 'tab') return 'tab_select';
            if (role === 'checkbox') return 'toggle';
            if (role === 'radio') return 'select';
            if (role === 'textbox') return 'input';

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
        const forceIncludeSelectors = window.currentSiteConfig.forceIncludeSelectors || [];
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

        // 🆕 NEW: Force-include selectors for mission-critical controls (e.g., main search input)
        if (forceIncludeSelectors.length > 0) {
            let forced = 0;
            forceIncludeSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        if (seenElements.has(element)) {
                            return;
                        }
                        seenElements.add(element);
                        forced += 1;
                        frameworkElements.push({
                            element,
                            type: inferForcedElementCategory(element),
                            selector,
                            framework: window.currentFramework,
                            forced: true
                        });
                    });
                } catch (error) {
                    console.log(`[Content] ⚠️ Force include selector error "${selector}":`, error);
                }
            });
            if (forced > 0) {
                console.log(`[Content] ✅ Force-included ${forced} high-priority elements (e.g., search inputs)`);
            }
        }

        // 🚫 REMOVED: max_elements filter - we want ALL elements including URLs!
        // URLs are gold - don't filter them out!

        // 🆕 NEW: Test if selectors are actually working
        testSelectorsAfterScan();

        // Framework scanning complete

        return frameworkElements;
    }

    function inferForcedElementCategory(element) {
        if (!element || !element.tagName) {
            return 'force_include';
        }
        const tag = element.tagName.toLowerCase();
        const role = (element.getAttribute && element.getAttribute('role')) ? element.getAttribute('role').toLowerCase() : '';
        const isContentEditable = element.isContentEditable === true || (element.getAttribute && element.getAttribute('contenteditable') === 'true');

        if (tag === 'input' || tag === 'textarea' || role === 'textbox' || isContentEditable) {
            return 'text_inputs';
        }
        if (tag === 'button' || role === 'button') {
            return 'buttons';
        }
        if (tag === 'a' || role === 'link') {
            return 'url_elements';
        }
        return 'force_include';
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
            // ♻️ DESTROY & RECREATE: Ensure completely fresh start (like browser refresh)
            console.log("[Content] ♻️ Service worker scan - recreating engine for fresh start");
            const freshEngine = recreateIntelligenceEngine();

            // 🎯 NEW: Automatic disconnect cycle + comprehensive scan for CSP bypass on page load
            console.log("[Content] 🔄 Page load: Performing automatic disconnect cycle + comprehensive scan for CSP bypass...");
            performAutomaticDisconnectCycle();

            // 🎯 NEW: Run comprehensive scan to get 262+ elements - REMOVED
            console.log("[Content] 🔍 Page load: Comprehensive scan skipped");

            // 🔔 ROUTE TO SW: All scans go through service worker
            chrome.runtime.sendMessage({
                type: 'request_scan',
                url: window.location.href,
                trigger: 'content_page_load_fallback'
            });
            console.log("[Content] 🔔 Scan requested via SW (content_page_load_fallback)");
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

                    // 🚫 DISABLED: DOM mutation rescans cause too many rapid scans during SPA navigation
                    // This was triggering 6+ rescans in 2 seconds, causing:
                    // - Mixed data from old + new pages
                    // - Race conditions in server updates
                    // - ID inflation and chaos
                    //
                    // ✅ NEW APPROACH: Only rescan on explicit service worker requests
                    // Service worker will trigger scans on REAL navigation events:
                    // - webNavigation.onHistoryStateUpdated
                    // - webNavigation.onCompleted
                    // - tabs.onUpdated (complete status)
                    //
                    // if (intelligenceEngine && intelligenceEngine.queueFullRescan) {
                    //     intelligenceEngine.queueFullRescan('dom_mutation');
                    // }

                    console.log("[Content] 📊 DOM mutation logged but NOT triggering rescan (service worker controls rescans)");
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
     * 🆕 NEW: Notify service worker of network activity
     * 
     * @param {string} eventType - Type of network event (fetch_start, fetch_end, xhr_start, xhr_end)
     * @param {string} url - URL of the network request
     * @param {string} status - Status of the request (success, error, abort, complete)
     */
    function notifyNetworkActivity(eventType, url, status = null) {
        try {
            if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    type: "network_activity",
                    eventType,
                    url,
                    status,
                    timestamp: Date.now(),
                    inflightRequests: window.inflightRequests || 0
                });
            }
        } catch (error) {
            // Silently fail - network monitoring is non-critical
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

        if (message && message.type === "start_intelligence_scan") {
            scheduleInitialScan('service_worker', {
                quietPeriod: 200,
                maxWait: 12000
            });

            if (typeof sendResponse === 'function') {
                sendResponse({ ok: true });
            }
            return false;
        }

        // ============================================================================
        // 🆕 NEW SCAN ORCHESTRATION - Clean scan with DOM-settle
        // ============================================================================
        if (message && message.type === "start_scan") {
            console.log(`[Content] 🚀 Scan request received: pageVersion=${message.pageVersion}, trigger=${message.trigger}`);

            // Execute scan asynchronously
            executeScanWithSettle(message.pageVersion, message.url, message.trigger)
                .then(() => sendResponse({ ok: true }))
                .catch(err => sendResponse({ ok: false, error: err.message }));

            return true; // Keep channel open for async response
        }

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

                if (command === "searchActions") {
                    console.log("[Content] searchActions command - params:", params);
                    if (!intelligenceEngine || typeof intelligenceEngine.searchActionableElements !== 'function') {
                        sendResponse({ error: { code: "ENGINE_NOT_READY", msg: "Intelligence engine not available" } });
                        return;
                    }
                    const results = intelligenceEngine.searchActionableElements(params || {});
                    console.log("[Content] searchActions found:", results.length);
                    return sendResponse({ results });
                }

                if (command === "discoverLoginControls") {
                    console.log("[Content] discoverLoginControls command - params:", params);
                    const discovery = discoverLoginControls(params || {});
                    console.log("[Content] discoverLoginControls result:", discovery);
                    return sendResponse({ ok: true, result: discovery });
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
                    console.log("[Content] scanAndRegisterElements command - routing to SW");

                    // 🔔 ROUTE TO SW: All scans go through service worker
                    chrome.runtime.sendMessage({
                        type: 'request_scan',
                        url: window.location.href,
                        trigger: 'content_manual_command'
                    });
                    console.log("[Content] 🔔 Scan requested via SW (content_manual_command)");
                    return sendResponse({ success: true, message: 'Scan requested via SW' });
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

    // REMOVED 2025-11-21: removeOverlays() was never called (dead code, 103 lines)
    // Legacy DOM cleanup function explicitly disabled with comment "🚫 NO DOM MODIFICATION"
    // Was designed to remove overlays/popups but caused navigation issues and was abandoned
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
            // Detect if this looks like a React/Facebook component (role="button" on div, complex classes)
            const isReactLikeElement = element.getAttribute('role') === 'button' &&
                element.tagName !== 'BUTTON' &&
                (element.className.length > 50 || element.className.includes(' x'));

            // For React-heavy sites (Facebook), run all strategies instead of stopping at first
            // because native click() doesn't throw but won't activate React handlers
            const runAllStrategies = isReactLikeElement;

            const clickStrategies = [
                // Strategy 1: Pointer events (Facebook/React compatibility) - FIRST for React elements
                () => {
                    const rect = element.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;

                    element.dispatchEvent(new PointerEvent('pointerdown', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: centerX, clientY: centerY, pointerId: 1, pointerType: 'mouse'
                    }));
                    element.dispatchEvent(new PointerEvent('pointerup', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: centerX, clientY: centerY, pointerId: 1, pointerType: 'mouse'
                    }));
                    element.dispatchEvent(new MouseEvent('click', {
                        bubbles: true, cancelable: true, view: window,
                        clientX: centerX, clientY: centerY
                    }));
                    return 'pointer events (Facebook/React)';
                },

                // Strategy 2: Native click() method
                () => {
                    element.click();
                    return 'native click()';
                },

                // Strategy 3: MouseEvent simulation
                () => {
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    element.dispatchEvent(clickEvent);
                    return 'MouseEvent simulation';
                },

                // Strategy 4: Focus + Enter key
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

                // Strategy 5: mousedown + mouseup events
                () => {
                    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
                    const mouseupEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
                    element.dispatchEvent(mousedownEvent);
                    element.dispatchEvent(mouseupEvent);
                    return 'mousedown + mouseup events';
                },

                // Strategy 6: Touch events (for mobile compatibility)
                () => {
                    const touchStartEvent = new TouchEvent('touchstart', { bubbles: true, cancelable: true });
                    const touchEndEvent = new TouchEvent('touchend', { bubbles: true, cancelable: true });
                    element.dispatchEvent(touchStartEvent);
                    element.dispatchEvent(touchEndEvent);
                    return 'touch events';
                }
            ];

            // Try each strategy until one works (or run all for React-like elements)
            let clickSuccess = false;
            let clickMethod = 'none';
            const successfulStrategies = [];

            console.log(`[Universal Click] 🔍 React-like element: ${isReactLikeElement}, runAllStrategies: ${runAllStrategies}`);

            for (const strategy of clickStrategies) {
                try {
                    clickMethod = strategy();
                    clickSuccess = true;
                    successfulStrategies.push(clickMethod);
                    console.log(`[Universal Click] ✅ Strategy succeeded: ${clickMethod}`);
                    // For React elements, continue trying all strategies
                    // For normal elements, stop at first success
                    if (!runAllStrategies) {
                        break;
                    }
                } catch (error) {
                    console.log(`[Universal Click] ⚠️ Strategy failed: ${clickMethod} - ${error.message}`);
                }
            }

            if (runAllStrategies && successfulStrategies.length > 0) {
                clickMethod = successfulStrategies.join(' + ');
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

        history.pushState = function (...args) {
            originalPushState.apply(history, args);
            handleProgrammaticNavigation();
        };

        history.replaceState = function (...args) {
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
    var ChangeAggregator = function () {
        this.pendingChanges = [];
        this.changeGroups = new Map();
        this.lastProcessedTime = 0;
        this.groupingTimeout = 500; // Group changes within 500ms
    };

    ChangeAggregator.prototype.addChange = function (change) {
        // console.log("[Content] 🧠 ChangeAggregator: Adding change:", change);
        this.pendingChanges.push(change);
        this.scheduleProcessing();
    };

    ChangeAggregator.prototype.scheduleProcessing = function () {
        if (this.processingScheduled) return;

        // console.log("[Content] 🧠 ChangeAggregator: Scheduling processing...");
        this.processingScheduled = true;
        var self = this;
        setTimeout(function () {
            self.processChanges();
            self.processingScheduled = false;
        }, this.groupingTimeout);
    };

    ChangeAggregator.prototype.processChanges = function () {
        if (this.pendingChanges.length === 0) return;

        // console.log("[Content] 🧠 ChangeAggregator: Processing", this.pendingChanges.length, "changes...");

        var changes = [...this.pendingChanges];
        this.pendingChanges = [];

        // Group changes by type and target
        var groups = this.groupChanges(changes);
        // console.log("[Content] 🧠 ChangeAggregator: Created", groups.length, "change groups");

        // Generate intelligence events for each group
        var self = this;
        groups.forEach(function (group, index) {
            var event = self.generateIntelligenceEvent(group);
            if (event) {
                //  console.log("[Content] 🧠 ChangeAggregator: Generated intelligence event", index + 1, ":", event);
                intelligenceEngine.processEvent(event);
            }
        });

        // console.log("[Content] 🧠 ChangeAggregator: Processing complete");
    };

    ChangeAggregator.prototype.groupChanges = function (changes) {
        var groups = new Map();

        var self = this;
        changes.forEach(function (change) {
            var key = self.getChangeGroupKey(change);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(change);
        });

        return Array.from(groups.values());
    };

    ChangeAggregator.prototype.getChangeGroupKey = function (change) {
        var target = change.target || 'unknown';
        var type = change.type || 'unknown';
        var timestamp = Math.floor(change.timestamp / 1000); // Group by second

        return target + '_' + type + '_' + timestamp;
    };

    ChangeAggregator.prototype.generateIntelligenceEvent = function (changeGroup) {
        if (changeGroup.length === 0) return null;

        var firstChange = changeGroup[0];
        var changeTypes = [...new Set(changeGroup.map(function (c) { return c.type; }))];
        var totalMutations = changeGroup.reduce(function (sum, c) { return sum + (c.mutations || 1); }, 0);

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

    ChangeAggregator.prototype.determineEventType = function (changeGroup) {
        var types = changeGroup.map(function (c) { return c.type; });
        var hasChildList = types.includes('childList');
        var hasAttributes = types.includes('attributes');
        var hasCharacterData = types.includes('characterData');

        if (hasChildList && hasAttributes) return 'element_transformation';
        if (hasChildList) return 'structure_change';
        if (hasAttributes) return 'state_change';
        if (hasCharacterData) return 'content_update';

        return 'general_change';
    };

    ChangeAggregator.prototype.generateSemanticSummary = function (changeGroup, eventType) {
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
    var IntelligenceEngine = function () {
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
        this.actionableElementNodes = new Map(); // 🆕 NEW: Map of live DOM nodes keyed by actionId
        this.contentElements = new Map(); // 🆕 NEW: Map of content elements with IDs
        this.elementCounter = 0; // 🆕 NEW: Counter for generating unique IDs
        this.initialScanCompleted = false; // 🆕 NEW: Track if initial scan is complete
        this.youtubeRegisteredUrls = new Set(); // 🆕 Track YouTube video URLs we've already registered
        this.lastTranscriptSignature = null; // 🆕 Track last harvested transcript snapshot

        // 🔒 SCAN LOCK: Prevent concurrent registration during full scans
        this._scanInProgress = false; // Track if a full scan is currently running

        // 🛡️ DUPLICATE PREVENTION: Track registered elements to prevent duplicate IDs
        this.registeredElements = new WeakSet(); // DOM elements already registered (WeakSet for memory safety)
        this.elementToActionId = new WeakMap(); // Reverse lookup: element → actionId

        console.log("[Content] 🧠 IntelligenceEngine initialized with page context:", {
            url: this.pageState.url,
            title: this.pageState.title,
            timestamp: this.pageState.lastUpdate,
            features: ['scanLock', 'duplicatePrevention']
        });
    };

    /**
     * Process an intelligence event
     */
    IntelligenceEngine.prototype.processEvent = function (event) {
        // console.log("[Content] 🧠 IntelligenceEngine: Processing event:", event);

        this.eventHistory.push(event);
        this.updatePageState(event);
        this.generateLLMInsights(event);

        // console.log("[Content] 🧠 IntelligenceEngine: Event processed, sending update...");

        // Send intelligence update to service worker
        // NOTE: Disabled old intelligence system - using new sendIntelligenceUpdateToServer instead
        // this.sendIntelligenceUpdate();
    };

    /**
     * Update page state based on event
     */
    IntelligenceEngine.prototype.updatePageState = function (event) {
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
     * 🚫 DISABLED: No longer triggering rescans on mutations
     * Service worker controls all rescans via navigation events
     */
    IntelligenceEngine.prototype.analyzeStructureChanges = function (event) {
        const newElements = event.changes
            .filter(c => c.type === 'childList' && c.addedNodes)
            .flatMap(c => Array.from(c.addedNodes))
            .filter(node => node.nodeType === Node.ELEMENT_NODE);

        if (newElements.length === 0) {
            return;
        }

        // 🚫 DISABLED: Don't queue rescans on mutations anymore
        // console.log(`[Content] 🔄 Significant DOM changes detected (${newElements.length} new elements) - queueing full rescan`);
        // this.queueFullRescan('dom_mutation');

        // Just log for debugging
        console.log(`[Content] 📊 Structure change detected: ${newElements.length} new elements (rescan controlled by service worker)`);
    };

    /**
     * Queue a full rescan (waits for current scan to finish if one is in progress)
     * ♻️ DESTROY & RECREATE: Kills old engine, creates fresh instance, scans from 0
     */
    IntelligenceEngine.prototype.queueFullRescan = function (reason) {
        // 🔔 ROUTE TO SW: All scans go through service worker
        console.log(`[Content] 🔔 queueFullRescan(${reason}) - routing to SW`);
        chrome.runtime.sendMessage({
            type: 'request_scan',
            url: window.location.href,
            trigger: `content_rescan_${reason}`
        });
    };

    IntelligenceEngine.prototype.registerInteractiveSubtree = function (rootNode) {
        if (!rootNode || rootNode.nodeType !== Node.ELEMENT_NODE) {
            return 0;
        }

        // 🔒 SCAN LOCK CHECK: Abort if full scan is in progress
        // This prevents duplicate ID assignment when DOM mutations occur during a full scan
        if (this._scanInProgress) {
            console.log("[Content] 🔒 registerInteractiveSubtree blocked - full scan in progress", {
                rootNode: rootNode.tagName,
                reason: 'Scan lock active'
            });
            return 0;
        }

        const stack = [rootNode];
        const visited = new Set();
        let registered = 0;
        let skippedDuplicates = 0;

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current || current.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }
            if (visited.has(current)) {
                continue;
            }
            visited.add(current);

            // 🛡️ DUPLICATE PREVENTION: Check if element already registered
            // WeakSet check prevents same DOM element from getting multiple action IDs
            if (this.registeredElements && this.registeredElements.has(current)) {
                const existingActionId = this.elementToActionId ? this.elementToActionId.get(current) : null;
                if (existingActionId) {
                    skippedDuplicates += 1;
                    // Element already registered, skip it
                    continue;
                }
            }

            const existingMarker = current.dataset?.omeActionId;
            const wasTracked = existingMarker ? this.actionableElements.has(existingMarker) : false;

            if (this.isInteractiveElement(current) && this.passesBasicQualityFilter(current)) {
                const actionType = this.determineActionType(current);
                const actionId = this.registerActionableElement(current, actionType);
                if (actionId && (!existingMarker || !wasTracked)) {
                    registered += 1;
                }
                // 🛡️ Tracking happens inside registerActionableElement - no need to duplicate here
            }

            const children = current.children;
            if (children && children.length) {
                for (let i = 0; i < children.length; i += 1) {
                    stack.push(children[i]);
                }
            }
        }

        if (skippedDuplicates > 0) {
            console.log("[Content] 🛡️ Prevented duplicate registrations:", {
                skipped: skippedDuplicates,
                registered: registered,
                rootNode: rootNode.tagName
            });
        }

        return registered;
    };

    /**
     * 🆕 NEW: Determine if an element is interactive
     */
    IntelligenceEngine.prototype.isInteractiveElement = function (element) {
        if (!element || !element.tagName) return false;
        const roleAttr = (element.getAttribute && element.getAttribute('role')) || '';
        const normalizedRole = roleAttr.toLowerCase ? roleAttr.toLowerCase() : roleAttr;
        const isContentEditable = element.isContentEditable === true || (element.getAttribute && element.getAttribute('contenteditable') === 'true');
        if (isContentEditable || normalizedRole === 'textbox') {
            return true;
        }

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
        const role = roleAttr;
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
    IntelligenceEngine.prototype.passesBasicQualityFilter = function (element) {
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
    IntelligenceEngine.prototype.extractPageTextToMarkdown = function () {
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
    IntelligenceEngine.prototype.extractCleanPageText = function () {
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
     * 🆕 NEW: Extract semantic text with inline action IDs
     *
     * Walks the DOM like innerText does (only visible elements),
     * but tags interactive elements with their action IDs.
     *
     * Example output:
     *   <Button id="a_id_0">Skip navigation</Button>
     *   <Input id="a_id_1">Search</Input>
     *   <Link id="a_id_2">Guthrie Govan acoustic solo</Link>
     *   Regular text here
     *
     * Returns: { text: string, actionables: Array }
     */
    IntelligenceEngine.prototype.extractSemanticTextWithIds = function () {
        const textParts = [];
        const actionables = [];
        let counter = 0;

        // 🧹 CLEAN: Remove old semantic IDs from previous extraction
        try {
            const oldMarkers = document.querySelectorAll('[data-ome-action-id]');
            console.log(`[Content] 🧹 Cleaning ${oldMarkers.length} old semantic IDs before extraction`);
            oldMarkers.forEach(el => {
                el.removeAttribute('data-ome-action-id');
                if (el.dataset) {
                    delete el.dataset.omeActionId;
                }
            });
        } catch (err) {
            console.warn('[Content] ⚠️ Error cleaning old semantic IDs:', err);
        }

        // Helper: Check if element is visible (same logic as innerText)
        const isVisible = (element) => {
            if (!element || element.nodeType !== Node.ELEMENT_NODE) return true;

            const style = window.getComputedStyle(element);
            if (style.display === 'none') return false;
            if (style.visibility === 'hidden') return false;
            if (style.opacity === '0') return false;

            return true;
        };

        // Helper: Get text label from element
        const getLabel = (element) => {
            // Try aria-label first (most explicit)
            let label = element.getAttribute('aria-label');
            if (label && label.trim()) return label.trim();

            // Try placeholder/aria-placeholder (for inputs AND contenteditable)
            const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';
            const isTextInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || isContentEditable || element.getAttribute('role') === 'textbox';

            if (isTextInput) {
                label = element.getAttribute('placeholder') || element.getAttribute('aria-placeholder') || '';
                if (label && label.trim()) return label.trim();

                // Try associated <label> element (HTML standard for form inputs)
                if (element.id) {
                    const associatedLabel = document.querySelector(`label[for="${element.id}"]`);
                    if (associatedLabel) {
                        label = associatedLabel.innerText || associatedLabel.textContent || '';
                        if (label && label.trim()) return label.trim();
                    }
                }
                // Also check if input is wrapped by <label>
                const parentLabel = element.closest('label');
                if (parentLabel) {
                    label = parentLabel.innerText || parentLabel.textContent || '';
                    if (label && label.trim()) return label.trim();
                }

                // Fallback to name attribute as label (e.g., name="search" -> "Search")
                const nameAttr = element.getAttribute('name');
                if (nameAttr && nameAttr.trim()) {
                    // Capitalise first letter for display
                    const formatted = nameAttr.charAt(0).toUpperCase() + nameAttr.slice(1).replace(/[-_]/g, ' ');
                    return formatted;
                }
            }

            // Try innerText (visible text)
            label = element.innerText || element.textContent || '';
            label = label.trim();

            // Fallback to value attribute for submit/button inputs
            if (!label && element.tagName === 'INPUT') {
                const inputType = element.getAttribute('type');
                if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
                    label = element.getAttribute('value') || '';
                    if (label && label.trim()) return label.trim();
                }
            }

            // Fallback to title
            if (!label) {
                label = element.getAttribute('title') || '';
            }

            return label.trim();
        };

        // Helper: Determine element type
        const getElementType = (element) => {
            const tag = element.tagName.toLowerCase();
            const role = element.getAttribute('role');
            const type = element.getAttribute('type');
            const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';

            // Buttons
            if (tag === 'button' || role === 'button') return 'Button';

            // Links
            if (tag === 'a' || role === 'link') return 'Link';

            // Inputs (including contenteditable and role="textbox")
            if (tag === 'input') {
                if (type === 'submit' || type === 'button') return 'Button';
                return 'Input';
            }

            if (tag === 'textarea') return 'Input';
            if (tag === 'select') return 'Select';

            // Contenteditable divs (ChatGPT, Perplexity, Claude, etc.)
            if (isContentEditable || role === 'textbox') return 'Input';

            return null; // Not interactive
        };

        // Walk the DOM tree
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Text nodes - always accept if parent is visible
                    if (node.nodeType === Node.TEXT_NODE) {
                        if (node.parentElement && isVisible(node.parentElement)) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_REJECT;
                    }

                    // Element nodes - check visibility
                    if (!isVisible(node)) {
                        return NodeFilter.FILTER_REJECT; // Skip hidden subtrees
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node;
        const processedElements = new WeakSet(); // Prevent duplicate processing

        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) {
                // Regular text - add as-is
                const text = node.textContent.trim();
                if (text && text.length > 0) {
                    textParts.push(text);
                }

            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Skip if already processed
                if (processedElements.has(node)) continue;

                // 🔍 SMART LOOKUP: For <a> without href, check if child has href
                let targetElement = node;
                if (node.tagName.toLowerCase() === 'a') {
                    const href = node.getAttribute('href');
                    if (!href || !href.trim() || href === '#' || href.startsWith('javascript:')) {
                        // No valid href - check direct children for <a> with href
                        const childLink = Array.from(node.children).find(child => {
                            if (child.tagName.toLowerCase() === 'a') {
                                const childHref = child.getAttribute('href');
                                return childHref && childHref.trim() &&
                                       childHref !== '#' && !childHref.startsWith('javascript:');
                            }
                            return false;
                        });

                        if (childLink) {
                            targetElement = childLink; // Use child instead
                        }
                    }
                }

                // Check if interactive
                const elementType = getElementType(targetElement);

                if (elementType) {
                    const label = getLabel(targetElement);

                    // Only tag if it has meaningful content
                    if (label && label.length > 0) {
                        // 🚫 EXCLUSION: Check if element should be excluded based on site config
                        const activeConfig = siteConfig || window.currentSiteConfig;
                        let shouldExclude = false;

                        if (activeConfig) {
                            // Check text-based exclusion
                            if (activeConfig.exclude_text && Array.isArray(activeConfig.exclude_text)) {
                                shouldExclude = activeConfig.exclude_text.some(excludeText => {
                                    return label.toLowerCase().includes(excludeText.toLowerCase());
                                });
                                if (shouldExclude) {
                                    console.log(`[Content] 🚫 Excluding element by text: "${label}" matches exclude pattern`);
                                }
                            }

                            // Check selector-based exclusion
                            if (!shouldExclude && activeConfig.exclude && Array.isArray(activeConfig.exclude)) {
                                shouldExclude = activeConfig.exclude.some(excludeSelector => {
                                    try {
                                        return targetElement.matches(excludeSelector);
                                    } catch (err) {
                                        console.warn('[Content] ⚠️ Invalid exclude selector:', excludeSelector, err);
                                        return false;
                                    }
                                });
                                if (shouldExclude) {
                                    console.log(`[Content] 🚫 Excluding element by selector: "${label}"`);
                                }
                            }
                        }

                        // Skip excluded elements
                        if (shouldExclude) {
                            processedElements.add(targetElement);
                            if (targetElement !== node) {
                                processedElements.add(node);
                            }
                            continue;
                        }

                        const actionId = `a_id_${counter++}`;

                        // Write ID to DOM for later execution
                        targetElement.setAttribute('data-ome-action-id', actionId);

                        // Store actionable metadata
                        actionables.push({
                            id: actionId,
                            type: elementType,
                            label: label,
                            tag: targetElement.tagName.toLowerCase(),
                            href: targetElement.href || null,
                            selector: this.generateSimpleSelector(targetElement)
                        });

                        // Add semantic tag to text (with usage hints for inputs)
                        if (elementType === 'Input') {
                            textParts.push(`<${elementType} id="${actionId}" use="(${actionId}, 'your text', submit:true)">${label}</${elementType}>`);
                        } else {
                            textParts.push(`<${elementType} id="${actionId}">${label}</${elementType}>`);
                        }

                        // Mark as processed
                        processedElements.add(targetElement);
                        if (targetElement !== node) {
                            processedElements.add(node); // Also mark parent
                        }

                        // Skip children - already captured in label
                        const skipSubtree = () => {
                            let next = walker.nextNode();
                            while (next && node.contains(next)) {
                                processedElements.add(next);
                                next = walker.nextNode();
                            }
                            if (next) {
                                walker.previousNode(); // Back up one step
                            }
                        };
                        skipSubtree();
                    }
                }
            }
        }

        // Join text parts and clean up
        let text = textParts.join('\n');

        // Normalize whitespace (like extractCleanPageText does)
        text = text.normalize('NFKC');
        text = text.replace(/[ \t]+/g, ' ');

        let lines = text.split('\n').map(l => l.trim());
        lines = lines.filter((l, i, arr) => l || (arr[i - 1] && arr[i - 1] !== ''));

        return {
            text: lines.join('\n'),
            actionables: actionables
        };
    };

    /**
     * 🆕 Helper: Generate simple selector for element
     */
    IntelligenceEngine.prototype.generateSimpleSelector = function (element) {
        // Try ID first
        if (element.id) {
            return `#${element.id}`;
        }

        // Try data-ome-action-id
        const actionId = element.getAttribute('data-ome-action-id');
        if (actionId) {
            return `[data-ome-action-id="${actionId}"]`;
        }

        // Try class
        if (element.className && typeof element.className === 'string') {
            const firstClass = element.className.split(' ')[0];
            if (firstClass) {
                return `${element.tagName.toLowerCase()}.${firstClass}`;
            }
        }

        // Fallback to tag
        return element.tagName.toLowerCase();
    };

    /**
     * 🆕 Extract headings from the page
     */
    IntelligenceEngine.prototype.extractHeadings = function () {
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
    IntelligenceEngine.prototype.extractParagraphs = function () {
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
    IntelligenceEngine.prototype.extractLists = function () {
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
    IntelligenceEngine.prototype.isElementVisible = function (element) {
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
    IntelligenceEngine.prototype.generateSelector = function (element) {
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
    IntelligenceEngine.prototype.determineActionType = function (element) {
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
    IntelligenceEngine.prototype.analyzeStateChanges = function (event) {
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
    IntelligenceEngine.prototype.analyzeClassChanges = function (element, change) {
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
    IntelligenceEngine.prototype.analyzeContentChanges = function (event) {
        const contentChanges = event.changes.filter(c => c.type === 'characterData');

        if (contentChanges.length > 0) {
            this.pageState.currentView = 'content_updated';
        }
    };

    /**
     * Analyze element transformations
     */
    IntelligenceEngine.prototype.analyzeElementTransformation = function (event) {
        // Complex changes that affect both structure and state
        this.pageState.currentView = 'transforming';
    };
    /**
     * Generate LLM insights from event
     */
    IntelligenceEngine.prototype.generateLLMInsights = function (event) {
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
    IntelligenceEngine.prototype.generateActionableInsights = function (event) {
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
    IntelligenceEngine.prototype.getPageContext = function () {
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
    IntelligenceEngine.prototype.generateRecommendations = function (event) {
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
    IntelligenceEngine.prototype.queueIntelligenceUpdate = function (priority = 'normal') {
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
    IntelligenceEngine.prototype.processUpdateQueue = async function () {
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
    IntelligenceEngine.prototype.prepareIntelligenceData = function () {
        const transcripts = this.collectTranscriptPayloads();

        // 🎯 PREMIUM: Extract capabilities from site config (URL-pattern based)
        const capabilities = this.extractCapabilities();

        // 🗑️ CRUFT REMOVAL: Removed unused data - only keeping what's needed for text.md
        return {
            type: "intelligence_update",
            timestamp: Date.now(),

            // ✅ KEEP: Basic page metadata (needed for text.md frontmatter)
            url: window.location.href,
            title: document.title,

            // pageState: this.pageState,  // ❌ REMOVED: Not needed for text.md
            // recentInsights: this.llmInsights.slice(-5),  // ❌ REMOVED: Not needed
            // totalEvents: this.eventHistory.length,  // ❌ REMOVED: Not needed
            // recommendations: this.getCurrentRecommendations(),  // ❌ REMOVED: Not needed
            // actionableElements: this.getActionableElementsSummary(),  // ❌ REMOVED: Not needed (Map-based)
            // actionMapping: this.generateActionMapping(),  // ❌ REMOVED: Not needed
            // contentElements: this.getContentElementsSummary(),  // ❌ REMOVED: Not needed
            // pageText: this.extractCleanPageText(),  // ❌ REMOVED: Redundant with semantic text
            semanticPageData: this.extractSemanticTextWithIds(), // ✅ KEEP: This generates text.md!
            // normalizedRecords: this.buildNormalizedPageRecords({ snapshot: true }),  // ❌ REMOVED: For llm_prompt.md which we don't use
            transcripts,  // ✅ KEEP: For YouTube transcripts
            capabilities  // ✅ KEEP: For site-specific capabilities
        };
    };

    /**
     * 🎯 PREMIUM: Extract capabilities from current site config
     * Returns only capabilities that match the current URL pattern
     *
     * This enables programmable web interaction - custom multi-step workflows
     * defined declaratively per domain/URL pattern in site_configs.json
     */
    IntelligenceEngine.prototype.extractCapabilities = function () {
        try {
            // Check if we have a site config loaded
            if (!window.currentSiteConfig || !window.currentSiteConfig.capabilities) {
                return [];
            }

            const currentUrl = window.location.href;
            const capabilities = window.currentSiteConfig.capabilities;
            const matchingCapabilities = [];

            // 🎯 CRITICAL: Only extract capabilities from the CURRENT site's config
            // Capabilities are site-specific - don't mix configs!
            console.log(`[Content] 🔍 Checking capabilities for framework: ${window.currentFramework}, URL: ${currentUrl}`);

            // Check each capability to see if URL pattern matches
            for (const [capabilityId, capability] of Object.entries(capabilities)) {
                // Check if url_pattern is present and matches current URL
                if (capability.url_pattern && currentUrl.includes(capability.url_pattern)) {
                    matchingCapabilities.push({
                        id: capabilityId,
                        action: capability.action,
                        label: capability.label,
                        description: capability.description,
                        handler: capability.handler,
                        framework: window.currentFramework
                    });
                    console.log(`[Content] 🎯 Capability matched: ${capabilityId} (${capability.action}) for ${window.currentFramework}`);
                }
            }

            if (matchingCapabilities.length > 0) {
                console.log(`[Content] ✅ Found ${matchingCapabilities.length} matching capabilities for ${window.currentFramework}`);
            } else {
                console.log(`[Content] ℹ️ No capabilities matched for current URL on ${window.currentFramework}`);
            }

            return matchingCapabilities;

        } catch (error) {
            console.error("[Content] ❌ Error extracting capabilities:", error);
            return [];
        }
    };
    /**
     * 🆕 EXPERIMENTAL: Build normalized JSONL-ready records for the current page
     *
     * This helper keeps the existing intelligence pipeline untouched while
     * providing the next-generation structure we want to stream to the server.
     * It consolidates page metadata, sections, content elements, and actionable
     * elements into a compact, reference-friendly format.
     */
    IntelligenceEngine.prototype.buildNormalizedPageRecords = function (options = {}) {
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

            // 🔧 FIX: Use semantic ID from DOM (written by extractSemanticTextWithIds)
            // instead of scan ID (which has pageVersion prefix)
            const semanticId = domNode?.getAttribute('data-ome-action-id');
            const actionId = semanticId || actionDescriptor.id; // Fallback to scan ID

            const actionRecord = {
                type: 'action',
                id: actionId,
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

            const placeholderAttr = actionDescriptor.attributes && (actionDescriptor.attributes.placeholder || actionDescriptor.attributes['aria-placeholder']);
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

                // 🔧 FIX: Use semantic ID from DOM (if exists) instead of generating scan ID
                const semanticId = linkEl.getAttribute('data-ome-action-id');
                const idCandidate = semanticId || `a_id_${currentPageVersion}_${this.elementCounter++}`;

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
                    this.storeActionableNode(idCandidate, linkEl);
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
            const ariaLabel = (attr['aria-label'] || (node && node.getAttribute && node.getAttribute('aria-label')) || '')?.trim?.();
            const titleLabel = (attr.title || (node && node.getAttribute && node.getAttribute('title')) || '')?.trim?.();
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

            // 🆕 CRITICAL FIX: For input elements (submit, button, reset), use value attribute as label
            const tag = descriptor.tagName ? descriptor.tagName.toLowerCase() : '';
            if (tag === 'input' && attr.type) {
                const inputType = String(attr.type).toLowerCase();
                if (['submit', 'button', 'reset'].includes(inputType) && attr.value) {
                    return attr.value.trim().substring(0, 120);
                }
            }

            if (placeholderLabel) return placeholderLabel;
            if (dataPlaceholderAttr) return dataPlaceholderAttr;
            if (descendantPlaceholder) return descendantPlaceholder;
            if (ariaLabel) return ariaLabel;
            if (titleLabel) return titleLabel;

            if (node && typeof node.querySelector === 'function') {
                const descendantAria = node.querySelector('[aria-label]')?.getAttribute('aria-label')?.trim();
                if (descendantAria) {
                    return descendantAria.substring(0, 120);
                }
            }

            if (attr.alt) return attr.alt;
            if (descriptor.urlContext && descriptor.urlContext.altText) {
                return descriptor.urlContext.altText;
            }

            if (node) {
                const innerText = typeof node.innerText === 'string' ? node.innerText.trim() : '';
                if (innerText) {
                    return innerText.substring(0, 120);
                }
                const textContent = typeof node.textContent === 'string' ? node.textContent.trim() : '';
                if (textContent) {
                    return textContent.substring(0, 120);
                }
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
                const inputType = (descriptor.attributes && descriptor.attributes.type ? String(descriptor.attributes.type).toLowerCase() : '');

                if (inputType === 'submit') {
                    types.add('submit');
                    types.add('click');
                } else if (inputType === 'button') {
                    types.add('click');
                } else if (inputType === 'reset') {
                    types.add('reset');
                } else {
                    types.add('focus');
                    types.add('setValue');
                }
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
                // 🎯 SPECIAL CASE: Guide drawer items should be considered visible even if drawer is collapsed
                // Check if element is in the guide drawer (navigation menu)
                const isGuideItem = node.closest && (
                    node.closest('tp-yt-app-drawer#guide') ||
                    node.closest('ytd-mini-guide-renderer') ||
                    node.closest('[id*="guide"]') ||
                    (node.classList && (
                        node.classList.contains('ytd-guide-entry-renderer') ||
                        node.closest('.ytd-guide-entry-renderer')
                    ))
                );

                // If it's a guide item with meaningful content, consider it visible
                if (isGuideItem) {
                    const hasLabel = node.textContent?.trim() ||
                        node.getAttribute('aria-label') ||
                        node.getAttribute('title') ||
                        node.querySelector('yt-formatted-string.title');
                    if (hasLabel) {
                        return 'visible';
                    }
                }

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
                const placeholder = (descriptor.placeholder || attrs.placeholder || attrs['data-placeholder'] || attrs['aria-placeholder'] || '').toLowerCase();
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
                const placeholder = descriptor.placeholder || attrs.placeholder || attrs['data-placeholder'] || attrs['aria-placeholder'];
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

            const roleAttr = attributes && attributes.role ? attributes.role.toLowerCase() : '';

            if (tag === 'tr' && roleAttr === 'row') {
                return true;
            }

            if (tag === 'div' && roleAttr === 'link' && attributes && attributes['data-legacy-thread-id']) {
                return true;
            }

            if (tag === 'nav' || tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') {
                return true;
            }

            if (attributes) {
                if (attributes.contenteditable === 'true') {
                    return true;
                }
                if (roleAttr === 'textbox' || roleAttr === 'input') {
                    return true;
                }
                if (attributes['aria-placeholder']) {
                    return true;
                }
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
    window.omEWebBuildNormalizedRecords = function (options) {
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
    IntelligenceEngine.prototype.sendIntelligenceUpdateToServiceWorker = async function (intelligenceData) {
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
    IntelligenceEngine.prototype.isEngineReady = function () {
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
    IntelligenceEngine.prototype.sleep = function (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    /**
     * Send intelligence update to service worker (now uses queue)
     */
    IntelligenceEngine.prototype.sendIntelligenceUpdate = function () {
        // 🆕 NEW: Use queue system instead of sending immediately
        this.queueIntelligenceUpdate('normal');
    };

    /**
     * 🆕 NEW: Get summary of actionable elements for LLM
     */
    IntelligenceEngine.prototype.getActionableElementsSummary = function () {
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
    IntelligenceEngine.prototype.getContentElementsSummary = function () {
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
    IntelligenceEngine.prototype.generateActionMapping = function () {
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
    IntelligenceEngine.prototype.getAvailableActions = function (actionType) {
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
    IntelligenceEngine.prototype.getCurrentRecommendations = function () {
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
    IntelligenceEngine.prototype.refreshPageIntelligenceWithRetry = function (trigger = 'manual', maxRetries = 3) {
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
    IntelligenceEngine.prototype.isExtensionContextValid = function () {
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
     * 🆕 NEW: Infer semantic role and hints for actionable elements
     */
    IntelligenceEngine.prototype.inferSemanticRole = function (element, actionType = 'general', attributes = {}) {
        try {
            const result = {
                role: null,
                confidence: 0,
                hints: []
            };

            if (!element) {
                return result;
            }

            const tag = element.tagName ? element.tagName.toLowerCase() : '';
            const attrMap = attributes || {};
            const typeAttr = (attrMap.type || element.type || '').toLowerCase();
            const roleAttr = (attrMap.role || '').toLowerCase();

            const textSources = [];
            const addSource = (value) => {
                if (!value || typeof value !== 'string') return;
                const trimmed = value.trim();
                if (!trimmed) return;
                textSources.push(trimmed.toLowerCase());
            };

            addSource(attrMap.placeholder);
            addSource(attrMap['data-placeholder']);
            addSource(attrMap['aria-label']);
            addSource(attrMap.title);
            addSource(attrMap.name);
            addSource(attrMap.id);
            addSource(element.textContent);
            addSource(element.getAttribute && element.getAttribute('value'));

            const classList = Array.isArray(attrMap.cssClasses) ? attrMap.cssClasses.join(' ').toLowerCase() : '';
            if (classList) {
                textSources.push(classList);
            }

            const containsAny = (keywords) => {
                return textSources.some(src => keywords.some(keyword => src.includes(keyword)));
            };

            const potentialRoles = [];
            const pushRole = (role, score, reason) => {
                potentialRoles.push({ role, score, reason });
            };

            // Email / username fields
            if (typeAttr === 'email' || containsAny(['email', 'e-mail'])) {
                pushRole('login_email', typeAttr === 'email' ? 5 : 4, 'email-field');
            }
            if (containsAny(['username', 'user name', 'user-id', 'userid', 'login id', 'user id'])) {
                pushRole('login_username', 4, 'username-field');
            }

            // Password / security related fields
            if (typeAttr === 'password' || containsAny(['password', 'passcode', 'pass code', 'secret'])) {
                pushRole('login_password', typeAttr === 'password' ? 6 : 4, 'password-field');
            }
            if (containsAny(['otp', 'one time', 'verification code', 'security code'])) {
                pushRole('login_otp', 4, 'otp-field');
            }

            // Search inputs
            if (typeAttr === 'search' || containsAny(['search', 'find', 'look up'])) {
                pushRole('search_input', typeAttr === 'search' ? 5 : 3, 'search-field');
            }

            // Remember me / stay signed in
            if (tag === 'input' && (typeAttr === 'checkbox' || roleAttr === 'checkbox') &&
                containsAny(['remember me', 'keep me signed', 'stay signed', 'stay logged'])) {
                pushRole('login_remember_me', 5, 'remember-checkbox');
            }

            // Submit / login buttons
            const isClickable = tag === 'button' || tag === 'a' || tag === 'input';
            const submitLike = containsAny(['log in', 'login', 'sign in', 'sign-in', 'submit', 'continue', 'next', 'send code']);
            if (isClickable && submitLike) {
                pushRole('login_submit', containsAny(['log in', 'login', 'sign in', 'sign-in']) ? 6 : 4, 'login-submit');
            } else if (isClickable && (typeAttr === 'submit' || roleAttr === 'button') && containsAny(['submit', 'continue', 'apply'])) {
                pushRole('form_submit', 3, 'form-submit');
            }

            // Forgot password link
            if (tag === 'a' && containsAny(['forgot password', 'trouble signing in', 'reset password', 'can\'t log in'])) {
                pushRole('login_forgot_password', 5, 'forgot-password-link');
            }

            // Generic navigation buttons that open menus or user/profile
            if (isClickable && containsAny(['profile', 'account', 'settings']) && classList.includes('menu')) {
                pushRole('account_menu', 2, 'account-menu');
            }

            // Choose best role
            let bestRole = null;
            let bestScore = 0;
            const hints = new Set();

            potentialRoles.forEach(candidate => {
                if (candidate.score > bestScore) {
                    bestRole = candidate.role;
                    bestScore = candidate.score;
                }
                if (candidate.reason) {
                    hints.add(candidate.reason);
                }
            });

            // Always provide basic tokens as hints for later search
            textSources.forEach(text => {
                text.split(/[^a-z0-9]+/).forEach(token => {
                    if (token && token.length >= 3) {
                        hints.add(token);
                    }
                });
            });

            return {
                role: bestRole,
                confidence: bestScore,
                hints: Array.from(hints).slice(0, 20) // keep hints compact
            };
        } catch (error) {
            console.warn('[Content] ⚠️ Failed to infer semantic role:', error.message);
            return {
                role: null,
                confidence: 0,
                hints: []
            };
        }
    };

    /**
     * 🆕 NEW: Extract clean text content from element, skipping style/script tags
     * Falls back to aria-placeholder, placeholder, aria-label, title, or className if text is empty or looks like CSS
     */
    IntelligenceEngine.prototype.getCleanTextContent = function (element) {
        try {
            // 🎯 FIX: For input-like elements, prioritize placeholder attributes over text content
            const tagName = element.tagName?.toLowerCase();
            const isInputLike = tagName === 'input' || tagName === 'textarea' ||
                element.getAttribute('contenteditable') === 'true' ||
                element.getAttribute('role') === 'textbox';

            if (isInputLike) {
                // For input elements, check useful attributes first
                const label = element.getAttribute('aria-placeholder')?.trim()
                    || element.getAttribute('placeholder')?.trim()
                    || element.getAttribute('aria-label')?.trim()
                    || element.getAttribute('title')?.trim();

                if (label) {
                    return label.substring(0, 100);
                }
            }

            // Clone element to avoid modifying DOM
            const clone = element.cloneNode(true);

            // Remove style and script tags from clone
            clone.querySelectorAll('style, script').forEach(el => el.remove());

            const cleanText = clone.textContent?.trim() || '';

            // 🎯 FIX: Check if text looks like CSS (starts with dot or has curly braces)
            const looksLikeCSS = cleanText.startsWith('.') || cleanText.includes('{');

            // Fallback chain if empty or looks like CSS
            if (!cleanText || looksLikeCSS) {
                return element.getAttribute('aria-label')?.trim()
                    || element.getAttribute('title')?.trim()
                    || element.getAttribute('placeholder')?.trim()
                    || element.getAttribute('aria-placeholder')?.trim()
                    || element.className?.split(' ')[0]
                    || '';
            }

            return cleanText.substring(0, 100);
        } catch (error) {
            console.warn("[Content] ⚠️ Error extracting clean text:", error);
            return element.textContent?.trim().substring(0, 100) || '';
        }
    };

    /**
     * 🆕 NEW: Generate unique actionable identifier for an element
     */
    IntelligenceEngine.prototype.generateActionableId = function (element, actionType = 'general', reuseId = null) {
        const tagName = element.tagName?.toLowerCase() || 'unknown';
        const className = element.className || '';
        const textContent = this.getCleanTextContent(element);

        // 🚫 NO COUNTER BUMPING: Only reuse ID if it's from THIS scan (prevents inflation)
        // If reuseId is provided, it means we already registered this element in THIS scan
        // Otherwise, generate next sequential ID starting from current counter
        let uniqueId = reuseId;
        if (!uniqueId) {
            uniqueId = `a_id_${currentPageVersion}_${this.elementCounter++}`;
        }
        // ❌ REMOVED: No Math.max logic that bumps counter based on old IDs
        // This was causing counter inflation when old DOM markers were found

        // Generate multiple selectors for reliability
        const selectors = this.generateElementSelectors(element);

        // 🆕 ENHANCED: Extract rich context for URL elements
        const attributes = this.extractKeyAttributes(element);
        const semantic = this.inferSemanticRole(element, actionType, attributes);
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
            semanticRole: semantic.role,
            semanticConfidence: semantic.confidence,
            semanticHints: semantic.hints,
            timestamp: Date.now()
        };
    };

    /**
     * 🆕 NEW: Generate multiple selector strategies for an element
     */
    IntelligenceEngine.prototype.generateElementSelectors = function (element) {
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
    IntelligenceEngine.prototype.generatePositionSelector = function (element) {
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
    IntelligenceEngine.prototype.extractKeyAttributes = function (element) {
        const attributes = {};
        let keyAttrs = ['id', 'name', 'type', 'role', 'aria-label', 'aria-placeholder', 'title', 'alt'];

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
        const ariaPlaceholder = element.getAttribute('aria-placeholder');
        if (ariaPlaceholder) {
            attributes['aria-placeholder'] = ariaPlaceholder;
        }

        return attributes;
    };
    /**
     * 🆕 NEW: Register an element as actionable
     */
    IntelligenceEngine.prototype.registerActionableElement = function (element, actionType = 'general') {
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

        // 🚫 NEVER READ OLD DOM MARKERS: Ignore data-ome-action-id from previous scans
        // Only check our NEW instance's registry to prevent duplicates within THIS scan
        // This ensures counter starts from 0 on every rescan (no ID inflation)

        // Check if we already registered THIS element in THIS scan
        const alreadyRegisteredId = this.elementToActionId.get(domElement);
        const idToUse = alreadyRegisteredId || null;

        const actionableId = this.generateActionableId(domElement, actionType, idToUse);

        // If element already has this ID in registry, update the stored node reference
        if (this.actionableElements.has(actionableId.id)) {
            const existingDescriptor = this.actionableElements.get(actionableId.id);
            // Update the stored node reference in case it changed
            this.storeActionableNode(actionableId.id, domElement);
            // Update the descriptor with latest info
            const updatedDescriptor = {
                ...existingDescriptor,
                ...actionableId,
                timestamp: Date.now()
            };
            this.actionableElements.set(actionableId.id, updatedDescriptor);
        } else {
            // New registration
            this.actionableElements.set(actionableId.id, actionableId);
        }

        // 🚫 DISABLED: Old ID writing system (conflicts with semantic extraction)
        // if (domElement.dataset) {
        //     domElement.dataset.omeActionId = actionableId.id;
        // }

        this.storeActionableNode(actionableId.id, domElement);

        // 🛡️ TRACK REGISTRATION: Add to duplicate prevention tracking
        // This is the single source of truth - all registrations flow through here
        if (this.registeredElements && !this.registeredElements.has(domElement)) {
            this.registeredElements.add(domElement);
        }
        if (this.elementToActionId && !this.elementToActionId.has(domElement)) {
            this.elementToActionId.set(domElement, actionableId.id);
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

    IntelligenceEngine.prototype.storeActionableNode = function (actionId, node) {
        if (!actionId || !node) {
            return;
        }

        // 🚫 DISABLED: Old ID writing system (conflicts with semantic extraction)
        // if (node.dataset) {
        //     node.dataset.omeActionId = actionId;
        // }

        this.actionableElementNodes.set(actionId, node);
    };
    IntelligenceEngine.prototype.getStoredActionableNode = function (actionId) {
        if (!this.actionableElementNodes.has(actionId)) {
            return null;
        }

        const node = this.actionableElementNodes.get(actionId);
        if (node && node.isConnected) {
            return node;
        }

        this.actionableElementNodes.delete(actionId);
        return null;
    };
    IntelligenceEngine.prototype._extractDescriptorLabel = function (descriptor) {
        if (!descriptor) {
            return '';
        }

        const candidates = [];
        if (typeof descriptor.label === 'string') {
            candidates.push(descriptor.label);
        }
        if (typeof descriptor.textContent === 'string') {
            candidates.push(descriptor.textContent);
        }
        if (descriptor.attributes) {
            const attrLabels = ['aria-label', 'title', 'label'];
            attrLabels.forEach(attr => {
                const value = descriptor.attributes[attr];
                if (typeof value === 'string') {
                    candidates.push(value);
                }
            });
        }

        const candidate = candidates.find(value => value && value.trim().length > 0);
        return candidate ? candidate.trim().toLowerCase() : '';
    };

    IntelligenceEngine.prototype._extractNodeLabel = function (node) {
        if (!node) {
            return '';
        }

        const candidates = [];
        if (node.getAttribute) {
            ['aria-label', 'title', 'label'].forEach(attr => {
                const value = node.getAttribute(attr);
                if (value) {
                    candidates.push(value);
                }
            });
        }
        if (node.textContent) {
            candidates.push(node.textContent);
        }

        const candidate = candidates.find(value => value && value.trim().length > 0);
        return candidate ? candidate.trim().toLowerCase() : '';
    };

    IntelligenceEngine.prototype._matchesActionDescriptor = function (node, actionId, descriptor) {
        if (!node || !node.isConnected) {
            return false;
        }

        const datasetId = node.dataset && node.dataset.omeActionId ? node.dataset.omeActionId : null;
        const descriptorTag = descriptor?.tagName;
        if (descriptorTag && node.tagName && descriptorTag.toLowerCase() !== node.tagName.toLowerCase()) {
            if (!datasetId || datasetId !== actionId) {
                return false;
            }
        }

        if (datasetId && datasetId !== actionId) {
            // Dataset already points to a different actionId - treat as mismatch
            return false;
        }

        if (datasetId === actionId) {
            return true;
        }

        const descriptorLabel = this._extractDescriptorLabel(descriptor);
        if (!descriptorLabel) {
            return true;
        }

        const nodeLabel = this._extractNodeLabel(node);
        if (!nodeLabel) {
            return true;
        }

        return nodeLabel.includes(descriptorLabel) || descriptorLabel.includes(nodeLabel);
    };

    IntelligenceEngine.prototype.resolveActionableDomNode = function (actionId, descriptor) {
        const normalizeText = (value) => (value ? value.replace(/\s+/g, ' ').trim().toLowerCase() : '');
        const extractReadableText = (value) => (value ? value.replace(/\s+/g, ' ').trim() : '');
        const ensureStored = (node, selectorUsed = null) => {
            if (!node) {
                return null;
            }

            this.storeActionableNode(actionId, node);

            if (descriptor && typeof descriptor === 'object') {
                const existingSelectors = Array.isArray(descriptor.selectors) ? descriptor.selectors : [];
                const selectorSet = new Set(existingSelectors);
                if (selectorUsed) {
                    selectorSet.add(selectorUsed);
                }

                const refreshedAttributes = this.extractKeyAttributes ? this.extractKeyAttributes(node) : {};
                if (!descriptor.attributes) {
                    descriptor.attributes = {};
                }
                Object.assign(descriptor.attributes, refreshedAttributes);

                descriptor.selectors = Array.from(selectorSet);

                const refreshedText = extractReadableText(node.textContent || '');
                if (refreshedText) {
                    descriptor.textContent = refreshedText.substring(0, 200);
                }

                const hrefValue = node.href || node.getAttribute && node.getAttribute('href');
                if (hrefValue) {
                    descriptor.urlContext = descriptor.urlContext || {};
                    descriptor.urlContext.url = hrefValue;
                    descriptor.urlContext.textContent = descriptor.textContent;
                    const ariaValue = node.getAttribute && node.getAttribute('aria-label');
                    if (ariaValue) {
                        descriptor.urlContext.ariaLabel = ariaValue;
                    }
                    const titleValue = node.getAttribute && node.getAttribute('title');
                    if (titleValue) {
                        descriptor.urlContext.title = titleValue;
                    }
                }

                descriptor.timestamp = Date.now();
                this.actionableElements.set(actionId, descriptor);
            }

            return node;
        };

        const refreshAndReturn = (node, strategy, selectorUsed = null) => {
            const stored = ensureStored(node, selectorUsed);
            return {
                node: stored,
                strategy: stored ? strategy : 'not_found',
                selector: selectorUsed
            };
        };

        const storedNode = this.getStoredActionableNode(actionId);
        if (storedNode && this._matchesActionDescriptor(storedNode, actionId, descriptor)) {
            return refreshAndReturn(storedNode, 'registry');
        }

        const escapeIdentifier = (value) => {
            if (window.CSS && typeof window.CSS.escape === 'function') {
                return window.CSS.escape(value);
            }
            return String(value).replace(/"/g, '\\"');
        };

        const attrSelector = `[data-ome-action-id="${escapeIdentifier(actionId)}"]`;
        let node = null;
        try {
            node = document.querySelector(attrSelector);
        } catch (error) {
            node = null;
        }

        if (node && this._matchesActionDescriptor(node, actionId, descriptor)) {
            return refreshAndReturn(node, 'data-attribute', attrSelector);
        }

        const selectors = Array.isArray(descriptor?.selectors) ? descriptor.selectors.filter(sel => typeof sel === 'string' && sel.trim().length > 0) : [];
        const prioritizedSelectors = [];
        const preferred = pickBestSelector(selectors, descriptor);
        if (preferred) {
            prioritizedSelectors.push(preferred);
        }
        selectors.forEach(selector => {
            if (!prioritizedSelectors.includes(selector)) {
                prioritizedSelectors.push(selector);
            }
        });

        for (const selector of prioritizedSelectors) {
            let candidate = null;
            try {
                candidate = document.querySelector(selector);
            } catch (error) {
                candidate = null;
            }

            if (candidate && this._matchesActionDescriptor(candidate, actionId, descriptor)) {
                return refreshAndReturn(candidate, 'selector', selector);
            }
        }

        const normalizeHref = (value) => {
            if (!value) return null;
            try {
                return new URL(value, window.location.href).href;
            } catch (error) {
                return value;
            }
        };

        const hrefCandidates = new Set();
        if (descriptor?.urlContext?.url) {
            hrefCandidates.add(normalizeHref(descriptor.urlContext.url));
        }
        if (descriptor?.attributes?.href) {
            hrefCandidates.add(normalizeHref(descriptor.attributes.href));
        }

        if (hrefCandidates.size > 0) {
            const anchors = document.querySelectorAll('a[href]');
            for (const anchor of anchors) {
                const anchorHref = normalizeHref(anchor.getAttribute('href') || anchor.href);
                if (anchorHref && hrefCandidates.has(anchorHref)) {
                    return refreshAndReturn(anchor, 'href-match');
                }
            }
        }

        const descriptorLabel = descriptor ? this._extractDescriptorLabel(descriptor) : '';
        if (descriptorLabel) {
            const targets = document.querySelectorAll('a, button, [role="button"], [data-ome-action-id]');
            for (const target of targets) {
                const targetLabel = normalizeText(this._extractNodeLabel(target));
                if (!targetLabel) continue;
                if (targetLabel.includes(descriptorLabel) || descriptorLabel.includes(targetLabel)) {
                    return refreshAndReturn(target, 'text-match');
                }
            }
        }

        return { node: null, strategy: 'not_found', selector: null };
    };

    /**
     * 🆕 NEW: Get actionable element by ID
     */
    IntelligenceEngine.prototype.getActionableElement = function (actionId) {
        // First, try the old system's Map
        let element = this.actionableElements.get(actionId);

        // If not found in Map, query DOM for semantic extraction IDs
        if (!element) {
            try {
                const domElement = document.querySelector(`[data-ome-action-id="${actionId}"]`);
                if (domElement) {
                    console.log("[Content] ✅ Found element via semantic extraction ID:", actionId);

                    // Build a minimal descriptor from the DOM element
                    element = {
                        id: actionId,
                        tagName: domElement.tagName.toLowerCase(),
                        actionType: domElement.tagName.toLowerCase() === 'a' ? 'navigate' :
                                   (domElement.tagName.toLowerCase() === 'input' ||
                                    domElement.tagName.toLowerCase() === 'textarea') ? 'setValue' : 'click',
                        textContent: domElement.innerText || domElement.textContent || '',
                        attributes: {
                            href: domElement.href || null,
                            'aria-label': domElement.getAttribute('aria-label') || null
                        },
                        selectors: [`[data-ome-action-id="${actionId}"]`]
                    };

                    // Store it in the Map for future lookups
                    this.actionableElements.set(actionId, element);

                    // Also store the DOM node
                    this.actionableElementNodes.set(actionId, domElement);
                }
            } catch (err) {
                console.warn("[Content] ⚠️ Error querying DOM for semantic ID:", err);
            }
        }

        return element;
    };

    /**
     * 🆕 NEW: Get content element by ID
     */
    IntelligenceEngine.prototype.getContentElement = function (contentId) {
        return this.contentElements.get(contentId);
    };

    /**
     * 🆕 NEW: Get all actionable elements
     */
    IntelligenceEngine.prototype.getAllActionableElements = function () {
        return Array.from(this.actionableElements.values());
    };

    /**
     * 🆕 NEW: Search actionable elements by semantic role or keywords
     */
    IntelligenceEngine.prototype.searchActionableElements = function (criteria = {}) {
        const limit = Number.isFinite(criteria.limit) ? Math.max(1, criteria.limit) : 10;

        const roleFilters = [];
        if (typeof criteria.role === 'string') {
            roleFilters.push(criteria.role.toLowerCase());
        }
        if (Array.isArray(criteria.roles)) {
            criteria.roles.forEach(role => {
                if (typeof role === 'string') {
                    roleFilters.push(role.toLowerCase());
                }
            });
        }

        const keywordSet = new Set();
        if (typeof criteria.keyword === 'string') {
            keywordSet.add(criteria.keyword.toLowerCase());
        }
        if (Array.isArray(criteria.keywords)) {
            criteria.keywords.forEach(keyword => {
                if (typeof keyword === 'string') {
                    keywordSet.add(keyword.toLowerCase());
                }
            });
        }

        const matchAll = Boolean(criteria.matchAll);
        const tagFilter = typeof criteria.tag === 'string' ? criteria.tag.toLowerCase() : null;

        const all = this.getAllActionableElements();
        const matches = [];

        all.forEach(item => {
            if (!item) return;

            if (tagFilter && (item.tagName || '').toLowerCase() !== tagFilter) {
                return;
            }

            let score = 0;
            const reasons = [];
            const keywordMatches = new Set();

            const elementRole = (item.semanticRole || '').toLowerCase();
            const elementHints = Array.isArray(item.semanticHints) ? item.semanticHints : [];

            if (roleFilters.length === 0 && keywordSet.size === 0) {
                score += item.semanticConfidence || 0;
                if (score <= 0) {
                    score = 1;
                }
                reasons.push('default');
            }

            if (roleFilters.length) {
                if (roleFilters.includes(elementRole)) {
                    score += 20;
                    reasons.push('role-exact');
                } else if (elementRole && roleFilters.some(role => elementRole.includes(role))) {
                    score += 10;
                    reasons.push('role-partial');
                }
            }

            const searchPool = [];
            if (elementRole) searchPool.push(elementRole);
            if (item.textContent) searchPool.push(item.textContent.toLowerCase());

            if (item.attributes) {
                Object.values(item.attributes).forEach(value => {
                    if (typeof value === 'string') {
                        searchPool.push(value.toLowerCase());
                    }
                });
                if (Array.isArray(item.attributes.cssClasses)) {
                    searchPool.push(item.attributes.cssClasses.join(' ').toLowerCase());
                }
            }

            if (elementHints.length) {
                searchPool.push(elementHints.join(' ').toLowerCase());
            }

            keywordSet.forEach(keyword => {
                if (!keyword || keyword.length < 2) return;
                const matched = searchPool.some(text => text && text.includes(keyword));
                if (matched) {
                    keywordMatches.add(keyword);
                    score += 5;
                }
            });

            if (keywordMatches.size) {
                reasons.push('keyword');
            }

            if (matchAll && keywordSet.size && keywordMatches.size !== keywordSet.size) {
                return;
            }

            if (roleFilters.length && elementRole && !roleFilters.includes(elementRole) && !roleFilters.some(role => elementRole.includes(role))) {
                if (score === 0 && keywordSet.size === 0) {
                    return;
                }
            }

            if (score <= 0) {
                return;
            }

            if (item.semanticConfidence) {
                score += Math.min(item.semanticConfidence, 5);
            }

            matches.push({
                actionId: item.id,
                semanticRole: item.semanticRole || null,
                semanticConfidence: item.semanticConfidence || 0,
                tagName: item.tagName || null,
                textContent: item.textContent || '',
                attributes: item.attributes || {},
                score,
                reasons,
                keywordsMatched: Array.from(keywordMatches)
            });
        });

        matches.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.semanticConfidence !== a.semanticConfidence) return b.semanticConfidence - a.semanticConfidence;
            return (b.textContent || '').length - (a.textContent || '').length;
        });

        return matches.slice(0, limit);
    };

    /**
     * 🆕 NEW: Get all content elements
     */
    IntelligenceEngine.prototype.getAllContentElements = function () {
        return Array.from(this.contentElements.values());
    };

    function pickBestSelector(selectorList, actionableElement) {
        if (!Array.isArray(selectorList) || selectorList.length === 0) return null;
        const selectors = selectorList.filter(s => typeof s === 'string' && s.trim().length > 0);
        if (!selectors.length) return null;
        const isBareClass = (s) => /^\.[a-zA-Z0-9_-]+$/.test(s.trim());
        const isLabelSelector = (s) => /^label\b/.test(s.trim());
        const hasId = (s) => /#/.test(s);
        const hasAttr = (s) => /\[.+\]/.test(s);
        const p1 = selectors.find(hasId);
        if (p1) return p1;
        const attrOrder = [
            /input\[placeholder=/i,
            /input\[aria-label=/i,
            /textarea\[placeholder=/i,
            /textarea\[aria-label=/i,
            /input\[type=.*\]\[role=.*\]/i,
            /\[contenteditable="?true"?\]/i,
            /\[role="?(textbox|combobox)"?\]/i
        ];
        for (const re of attrOrder) {
            const match = selectors.find(s => re.test(s));
            if (match) return match;
        }
        const p3 = selectors.find(hasAttr);
        if (p3) return p3;
        const nonWeak = selectors.find(s => !isBareClass(s) && !isLabelSelector(s));
        if (nonWeak) return nonWeak;
        return selectors[0];
    }
    /**
     * 🆕 NEW: Execute action on element by ID
     */
    IntelligenceEngine.prototype.executeAction = function (actionId, action = null, params = {}) {
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

        if (typeof action === 'string') {
            const lowered = action.toLowerCase();
            if (['textarea', 'input', 'type', 'text', 'enter_text'].includes(lowered)) {
                action = 'setValue';
                console.log("[Content] 🔁 Normalized action to 'setValue' for text entry");
            } else if (['button', 'press', 'toggle', 'menu', 'menuitem', 'tab'].includes(lowered)) {
                action = 'click';
                console.log("[Content] 🔁 Normalized action to 'click' for interactive button-like element");
            } else if (['link'].includes(lowered) && actionableElement.attributes?.href) {
                action = 'navigate';
                console.log("[Content] 🔁 Normalized action to 'navigate' for link element");
            }
        }

        try {
            const resolution = this.resolveActionableDomNode(actionId, actionableElement);
            let element = resolution.node;

            if (!element) {
                console.error("[Content] ❌ Unable to resolve DOM element for:", actionId);
                console.log("[Content] 🔍 Resolution attempt:", resolution);
                return { success: false, error: "Element not found in DOM" };
            }

            // Ensure we keep the most recent node on record
            this.storeActionableNode(actionId, element);

            const escapeIdentifier = (value) => {
                if (window.CSS && typeof window.CSS.escape === 'function') {
                    return window.CSS.escape(value);
                }
                return String(value).replace(/"/g, '\\"');
            };

            let selector = resolution.selector || null;
            if (!selector && element.dataset?.omeActionId === actionId) {
                selector = `[data-ome-action-id="${escapeIdentifier(actionId)}"]`;
            }

            console.log("[Content] 🔍 Resolved element via", resolution.strategy, "using selector:", selector || '(registry)');
            console.log("[Content] ✅ Resolved DOM element:", element);
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

                case 'setValue': {
                    const valueToSet = params && params.value != null ? String(params.value) : '';

                    // If the primary element is hidden or has no dimensions, try visible-first fallbacks
                    const visibleCheck = (typeof isElementVisible === 'function') ? isElementVisible(element) : true;
                    if (!visibleCheck) {
                        // Attribute-driven resolution using actionableElement hints (aria-label, placeholder, type, role)
                        const s = actionableElement && actionableElement.attributes ? actionableElement.attributes : {};
                        const aria = s['aria-label'] || s.ariaLabel || '';
                        const placeholder = s.placeholder || '';
                        const typeAttr = s.type || '';
                        const roleAttr = s.role || '';
                        const attrCandidates = [];
                        if (aria) attrCandidates.push(`input[aria-label="${aria}"]`);
                        if (placeholder) attrCandidates.push(`input[placeholder="${placeholder}"]`);
                        if (typeAttr && roleAttr) attrCandidates.push(`input[type="${String(typeAttr).toLowerCase()}"][role="${String(roleAttr).toLowerCase()}"]`);
                        if (typeAttr) attrCandidates.push(`input[type="${String(typeAttr).toLowerCase()}"]`);
                        if (roleAttr) attrCandidates.push(`input[role="${String(roleAttr).toLowerCase()}"]`);

                        // Generic high-confidence fallbacks
                        const genericFallbacks = [
                            '[contenteditable="true"]',
                            'div.ProseMirror[contenteditable="true"]',
                            '#prompt-textarea',
                            'textarea[name="prompt-textarea"]',
                            'textarea',
                            'input[type="search"]',
                            'input[type="text"]',
                            'input'
                        ];

                        const tried = new Set();
                        const tryList = [...attrCandidates, ...genericFallbacks];
                        for (const sel of tryList) {
                            if (tried.has(sel)) continue; tried.add(sel);
                            const cand = document.querySelector(sel);
                            if (cand && ((typeof isElementVisible === 'function') ? isElementVisible(cand) : true)) {
                                console.log('[Content] 🔄 Using attribute-driven/visible fallback for setValue:', sel);
                                element = cand;
                                break;
                            }
                        }

                        // As a last resort, search within the nearest form of the original element
                        if ((!element || !((typeof isElementVisible === 'function') ? isElementVisible(element) : true)) && actionableElement && actionableElement.selectors && actionableElement.selectors.length) {
                            try {
                                const original = document.querySelector(actionableElement.selectors[0]);
                                const form = original ? original.closest('form') : null;
                                if (form) {
                                    const inForm = form.querySelector('input, textarea, [contenteditable="true"]');
                                    if (inForm && ((typeof isElementVisible === 'function') ? isElementVisible(inForm) : true)) {
                                        console.log('[Content] 🔄 Using form-local fallback for setValue');
                                        element = inForm;
                                    }
                                }
                            } catch { }
                        }
                    }

                    // Focus first to ensure site handlers attach properly
                    try { element.focus && element.focus(); } catch { }

                    const tag = element.tagName;
                    const isTextarea = tag === 'TEXTAREA';
                    const isInput = tag === 'INPUT';
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
                            // Dispatch input/change for regular inputs
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        } else if (isContentEditable) {
                            // 🆕 LEXICAL/RICH TEXT EDITOR FIX: Simulate proper typing for frameworks like Lexical, ProseMirror, etc.
                            // Setting textContent directly causes the framework to clear it during state reconciliation
                            console.log('[Content] 🔤 Simulating typing for contenteditable element (Lexical/rich text framework)');

                            // Clear existing content first using proper events
                            if (element.textContent.length > 0) {
                                const selectAllRange = document.createRange();
                                selectAllRange.selectNodeContents(element);
                                const selection = window.getSelection();
                                selection.removeAllRanges();
                                selection.addRange(selectAllRange);

                                // Delete existing content with beforeinput event
                                const deleteEvent = new InputEvent('beforeinput', {
                                    bubbles: true,
                                    cancelable: true,
                                    inputType: 'deleteContentBackward',
                                    data: null
                                });
                                element.dispatchEvent(deleteEvent);
                                element.textContent = '';
                            }

                            // Insert text using beforeinput + input events that Lexical listens to
                            const beforeInputEvent = new InputEvent('beforeinput', {
                                bubbles: true,
                                cancelable: true,
                                inputType: 'insertText',
                                data: valueToSet
                            });
                            element.dispatchEvent(beforeInputEvent);

                            // Set the actual content
                            if (!beforeInputEvent.defaultPrevented) {
                                // Try execCommand first (some frameworks listen to this)
                                let execCommandWorked = false;
                                try {
                                    execCommandWorked = document.execCommand('insertText', false, valueToSet);
                                } catch (e) {
                                    execCommandWorked = false;
                                }

                                // Only use textContent fallback if execCommand failed or didn't insert the text
                                if (!execCommandWorked || element.textContent.trim() !== valueToSet) {
                                    element.textContent = valueToSet;
                                }
                            }

                            // Dispatch input event to notify framework that text was inserted
                            // 🎯 FIX: Don't include data in input event - text is already inserted
                            // Including data causes Lexical to insert the text again
                            const inputEvent = new InputEvent('input', {
                                bubbles: true,
                                cancelable: false,
                                inputType: 'insertText',
                                data: null
                            });
                            element.dispatchEvent(inputEvent);

                            // Additional change event for compatibility
                            element.dispatchEvent(new Event('change', { bubbles: true }));

                            console.log('[Content] ✅ Typing simulation complete for contenteditable element');
                        } else if (element.value !== undefined) {
                            element.value = valueToSet;
                            // Dispatch input/change for elements with value property
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            result = { success: false, error: 'Element does not support setValue' };
                            break;
                        }

                        // Optional submit: press Enter, then poll briefly for a visible send/submit button and click it
                        if (params && params.submit) {
                            // Detect if this is a search input with autocomplete/combobox UX
                            const hasAutocomplete = element.getAttribute('aria-autocomplete') === 'list' ||
                                element.getAttribute('aria-expanded') === 'true' ||
                                element.type === 'search' ||
                                element.getAttribute('role') === 'combobox';
                            const form = element.closest('form');

                            // For search inputs with autocomplete, wait longer for dropdown to appear before submitting
                            const submitDelay = hasAutocomplete ? 300 : 100;

                            setTimeout(() => {
                                // Ensure element is focused and has focus events
                                try {
                                    element.focus();
                                    // Trigger focus event to ensure site handlers are ready
                                    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
                                } catch (e) {
                                    console.warn('[Content] ⚠️ Focus failed:', e);
                                }

                                // Function to dispatch Enter key with proper event properties
                                const dispatchEnterKey = () => {
                                    try {
                                        // 🎯 FACEBOOK FIX: Ensure element is focused before dispatching Enter
                                        // This prevents the event from being handled by the wrong input
                                        element.focus();

                                        // Small delay to ensure focus is set
                                        setTimeout(() => {
                                            // Method 1: Try using document.execCommand for maximum compatibility
                                            // (deprecated but still works in many cases)
                                            try {
                                                document.execCommand('insertText', false, '\n');
                                            } catch (e) {
                                                // Ignore if not supported
                                            }

                                            // Method 2: Create very realistic keyboard events with all properties
                                            const enterKeyOptions = {
                                                key: 'Enter',
                                                code: 'Enter',
                                                keyCode: 13,
                                                which: 13,
                                                charCode: 13,
                                                keyIdentifier: 'Enter',
                                                bubbles: false, // 🎯 FIX: Don't bubble to prevent parent form submission
                                                cancelable: true,
                                                view: window,
                                                composed: true,
                                                isComposing: false,
                                                repeat: false
                                            };

                                            // Create events with all possible properties
                                            const keydownEvent = new KeyboardEvent('keydown', enterKeyOptions);
                                            const keypressEvent = new KeyboardEvent('keypress', enterKeyOptions);
                                            const keyupEvent = new KeyboardEvent('keyup', enterKeyOptions);

                                            // Set all target properties for maximum compatibility
                                            ['target', 'currentTarget', 'srcElement'].forEach(prop => {
                                                try {
                                                    Object.defineProperty(keydownEvent, prop, { value: element, writable: false, configurable: true });
                                                    Object.defineProperty(keypressEvent, prop, { value: element, writable: false, configurable: true });
                                                    Object.defineProperty(keyupEvent, prop, { value: element, writable: false, configurable: true });
                                                } catch (e) {
                                                    // Some properties might not be settable
                                                }
                                            });

                                            // Dispatch in sequence with small delays to simulate real typing
                                            const keydownResult = element.dispatchEvent(keydownEvent);
                                            setTimeout(() => {
                                                const keypressResult = element.dispatchEvent(keypressEvent);
                                                setTimeout(() => {
                                                    const keyupResult = element.dispatchEvent(keyupEvent);
                                                    console.log('[Content] ⌨️ Enter key dispatched on focused element:', {
                                                        element: element.getAttribute('aria-label') || element.getAttribute('placeholder'),
                                                        keydown: keydownResult,
                                                        keypress: keypressResult,
                                                        keyup: keyupResult,
                                                        defaultPrevented: keydownEvent.defaultPrevented
                                                    });
                                                }, 10);
                                            }, 10);
                                        }, 50); // Small delay to ensure focus

                                        return true; // Return true to indicate we attempted to dispatch
                                    } catch (e) {
                                        console.warn('[Content] ⚠️ Enter key dispatch failed:', e);
                                        return false;
                                    }
                                };

                                // 🎯 GENERIC: Find search button in autocomplete dropdown
                                // Works for any site with autocomplete dropdowns
                                const findAutocompleteSearchButton = () => {
                                    try {
                                        // Extract search context to filter dropdown options appropriately
                                        const searchContext = extractSearchContext(element);

                                        const ariaControls = element.getAttribute('aria-controls');
                                        if (ariaControls) {
                                            const listbox = document.getElementById(ariaControls);
                                            if (listbox) {
                                                // 🎯 GENERIC: Prioritize links matching search context keywords
                                                if (searchContext.keywords && searchContext.keywords.length > 0) {
                                                    for (const keyword of searchContext.keywords) {
                                                        const contextSelectors = [
                                                            `a[href*="${keyword}"]`,
                                                            `a[href*="${keyword.toLowerCase()}"]`,
                                                            `[role="button"][aria-label*="${keyword}" i]`
                                                        ];
                                                        for (const sel of contextSelectors) {
                                                            const btn = listbox.querySelector(sel);
                                                            if (btn && ((typeof isElementVisible === 'function') ? isElementVisible(btn) : true)) {
                                                                try {
                                                                    btn.click();
                                                                    console.log('[Content] ✅ Clicked context-specific search button:', sel);
                                                                    return true;
                                                                } catch (e) {
                                                                    console.warn('[Content] ⚠️ Context search button click failed:', e);
                                                                }
                                                            }
                                                        }
                                                    }
                                                }

                                                // Look for generic "See all results" link or search button
                                                const specificSelectors = [
                                                    'a[href*="/search"]',
                                                    'a[href*="q="]',
                                                    'a[href*="query="]',
                                                    '[role="button"][aria-label*="See all" i]',
                                                    '[role="button"][aria-label*="Search" i]'
                                                ];

                                                for (const sel of specificSelectors) {
                                                    const btn = listbox.querySelector(sel);
                                                    if (btn && ((typeof isElementVisible === 'function') ? isElementVisible(btn) : true)) {
                                                        try {
                                                            // 🎯 GENERIC: Filter by search context if available
                                                            const href = btn.href || btn.getAttribute('href') || '';
                                                            if (searchContext.keywords && searchContext.keywords.length > 0) {
                                                                // Skip links that don't match context keywords
                                                                const matchesContext = searchContext.keywords.some(kw =>
                                                                    href.toLowerCase().includes(kw.toLowerCase())
                                                                );
                                                                if (!matchesContext && href.includes('/search/')) {
                                                                    // Check if this is a general search link when we want context-specific
                                                                    const hasContextInUrl = searchContext.keywords.some(kw =>
                                                                        window.location.href.toLowerCase().includes(kw.toLowerCase())
                                                                    );
                                                                    if (hasContextInUrl) {
                                                                        continue; // Skip general search links when context-specific is expected
                                                                    }
                                                                }
                                                            }

                                                            btn.click();
                                                            console.log('[Content] ✅ Clicked autocomplete search button:', sel);
                                                            return true;
                                                        } catch (e) {
                                                            console.warn('[Content] ⚠️ Autocomplete search button click failed:', e);
                                                        }
                                                    }
                                                }

                                                // Fallback: Search all links and buttons for "See all" or "Search" text
                                                const allLinks = listbox.querySelectorAll('a, [role="button"], div[role="button"]');
                                                for (const btn of allLinks) {
                                                    const text = (btn.textContent || btn.innerText || '').toLowerCase().trim();
                                                    const href = btn.href || btn.getAttribute('href') || '';

                                                    // 🎯 GENERIC: Apply context filtering
                                                    if (searchContext.keywords && searchContext.keywords.length > 0 && href.includes('/search/')) {
                                                        const matchesContext = searchContext.keywords.some(kw =>
                                                            href.toLowerCase().includes(kw.toLowerCase())
                                                        );
                                                        if (!matchesContext) {
                                                            const hasContextInUrl = searchContext.keywords.some(kw =>
                                                                window.location.href.toLowerCase().includes(kw.toLowerCase())
                                                            );
                                                            if (hasContextInUrl) {
                                                                continue; // Skip general search links when context-specific is expected
                                                            }
                                                        }
                                                    }

                                                    if ((text.includes('see all') || text.includes('search') || href.includes('/search') || href.includes('query=') || href.includes('q=')) &&
                                                        ((typeof isElementVisible === 'function') ? isElementVisible(btn) : true)) {
                                                        try {
                                                            btn.click();
                                                            console.log('[Content] ✅ Clicked autocomplete search button by text:', text || href);
                                                            return true;
                                                        } catch (e) {
                                                            console.warn('[Content] ⚠️ Autocomplete search button click failed:', e);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('[Content] ⚠️ Autocomplete search button lookup failed:', e);
                                    }
                                    return false;
                                };

                                // 🎯 GENERIC: Extract search context from element attributes
                                const extractSearchContext = (el) => {
                                    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
                                    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                                    const dataContext = (el.getAttribute('data-context') || '').toLowerCase();
                                    const form = el.closest('form');
                                    const formAction = form ? (form.getAttribute('action') || '') : '';

                                    // Extract keywords from attributes (e.g., "marketplace", "products", etc.)
                                    const keywords = [];
                                    const allText = `${placeholder} ${ariaLabel} ${dataContext}`;

                                    // Common search context keywords
                                    const contextKeywords = ['marketplace', 'products', 'shopping', 'store', 'items', 'listings'];
                                    for (const kw of contextKeywords) {
                                        if (allText.includes(kw)) {
                                            keywords.push(kw);
                                        }
                                    }

                                    // Extract base URL from current page or form action
                                    const baseUrl = formAction || window.location.origin;

                                    return { keywords, baseUrl, formAction };
                                };

                                // 🎯 GENERIC: Build search URL from context
                                const buildSearchUrl = (context, searchValue) => {
                                    if (!context.baseUrl) return null;

                                    const base = context.baseUrl.startsWith('http') ? context.baseUrl : `${window.location.origin}${context.baseUrl}`;

                                    // If we have context keywords, try to build context-specific URL
                                    if (context.keywords && context.keywords.length > 0) {
                                        const primaryKeyword = context.keywords[0];

                                        // Try common URL patterns for context-specific searches
                                        const patterns = [
                                            `/${primaryKeyword}/search/?query=${searchValue}`,
                                            `/${primaryKeyword}/search?q=${searchValue}`,
                                            `/search/${primaryKeyword}/?q=${searchValue}`,
                                            `/${primaryKeyword}?q=${searchValue}`
                                        ];

                                        for (const pattern of patterns) {
                                            const url = base.endsWith('/') ? `${base}${pattern.substring(1)}` : `${base}${pattern}`;
                                            // Return first pattern (caller can validate if needed)
                                            return url;
                                        }
                                    }

                                    // Fallback to generic search URL
                                    const genericPatterns = [
                                        `/search/?q=${searchValue}`,
                                        `/search?q=${searchValue}`,
                                        `/search/top/?q=${searchValue}`
                                    ];

                                    for (const pattern of genericPatterns) {
                                        const url = base.endsWith('/') ? `${base}${pattern.substring(1)}` : `${base}${pattern}`;
                                        return url;
                                    }

                                    return null;
                                };

                                // Try Enter key first (this should execute search on any site with autocomplete)
                                // Note: dispatchEnterKey is now async, so we call it and let it run
                                dispatchEnterKey();
                                const enterWorked = true; // Assume it will work, actual result handled async

                                // 🎯 GENERIC: For search inputs with autocomplete, try dropdown actions only when no form exists
                                if (hasAutocomplete && !form) {
                                    setTimeout(() => {
                                        if (!findAutocompleteSearchButton()) {
                                            console.log('[Content] ⚠️ Autocomplete search button not found, trying generic navigation...');

                                            // 🎯 GENERIC: Extract search context from element attributes
                                            const searchContext = extractSearchContext(element);
                                            const searchValue = encodeURIComponent(element.value || element.textContent || '');

                                            if (searchValue && searchContext.baseUrl) {
                                                // Build search URL generically using extracted context
                                                const searchUrl = buildSearchUrl(searchContext, searchValue);
                                                if (searchUrl) {
                                                    console.log('[Content] 🔍 Navigating to search URL:', searchUrl);
                                                    window.location.href = searchUrl;
                                                }
                                            }
                                        }
                                    }, 400); // Wait longer to see if Enter worked first
                                }

                                // Also try form submission if element is in a form
                                // 🎯 GENERIC: If form exists, let it handle submission (even for autocomplete inputs)
                                const shouldSkipFormSubmission = hasAutocomplete && !form;

                                if (form && enterWorked && !shouldSkipFormSubmission) {
                                    setTimeout(() => {
                                        try {
                                            form.requestSubmit();
                                            console.log('[Content] ✅ Form.requestSubmit() called');
                                        } catch (e) {
                                            try {
                                                form.submit();
                                                console.log('[Content] ✅ Form.submit() called');
                                            } catch (e2) {
                                                console.warn('[Content] ⚠️ Form submission failed:', e2.message);
                                            }
                                        }
                                    }, 50);
                                } else if (shouldSkipFormSubmission) {
                                    console.log('[Content] 🚫 Skipping form submission for autocomplete/search input - using Enter key/autocomplete');
                                }

                                // For search inputs, DON'T click autocomplete options - let Enter key handle it
                                // Only click autocomplete as absolute last resort for non-search inputs
                                if (!hasAutocomplete) {
                                    // Only for non-search inputs, try clicking autocomplete options
                                    setTimeout(() => {
                                        const autocompleteSelectors = [
                                            '[role="option"]:first-child',
                                            '[role="listbox"] [role="option"]:first-child',
                                            'ul[role="listbox"] li:first-child'
                                        ];

                                        for (const sel of autocompleteSelectors) {
                                            const firstOption = document.querySelector(sel);
                                            if (firstOption && ((typeof isElementVisible === 'function') ? isElementVisible(firstOption) : true)) {
                                                try {
                                                    firstOption.click();
                                                    console.log('[Content] ✅ Clicked first autocomplete option:', sel);
                                                    return;
                                                } catch (e) {
                                                    console.warn('[Content] ⚠️ Autocomplete click failed:', e);
                                                }
                                            }
                                        }
                                    }, 200);
                                }

                                // 🎯 GENERIC: Look for submit buttons as fallback
                                // Skip for search inputs with autocomplete (Enter key handles it)
                                // But do look for textarea submit buttons (Enter creates new line, not submit)
                                const shouldLookForSubmitButton = !hasAutocomplete || isTextarea;

                                if (shouldLookForSubmitButton && params && params.submit) {
                                    const buttonPollDelay = hasAutocomplete ? 500 : 200;
                                    setTimeout(() => {
                                        // 🎯 GENERIC: Search in form, parent container, or document
                                        const formForButtonSearch = element.closest('form');
                                        const parentContainer = element.closest('[role="dialog"], [role="region"], div[class*="composer"], div[class*="comment"], div[class*="message"]') || formForButtonSearch;
                                        const searchRoot = parentContainer || document;

                                        // 🎯 GENERIC: Comprehensive submit button selectors
                                        const sendSelectors = [
                                            // Specific IDs (common patterns)
                                            '#composer-submit-button',
                                            '#composer-plus-btn',
                                            'button[data-testid*="send" i]',
                                            'button[data-testid*="submit" i]',
                                            'button[data-testid*="post" i]',

                                            // Aria labels (generic)
                                            'button[aria-label*="Send" i]',
                                            'button[aria-label*="Post" i]',
                                            'button[aria-label*="Submit" i]',
                                            'button[aria-label*="Comment" i]',
                                            'button[aria-label*="Reply" i]',
                                            'button[aria-label*="Search" i]',

                                            // Type attributes
                                            'button[type="submit"]',
                                            'input[type="submit"]',

                                            // Role-based
                                            '[role="button"][aria-label*="Send" i]',
                                            '[role="button"][aria-label*="Post" i]',
                                            '[role="button"][aria-label*="Submit" i]',
                                            '[role="button"][aria-label*="Search" i]',

                                            // Class-based (generic patterns)
                                            'button[class*="submit" i]',
                                            'button[class*="send" i]',
                                            'button[class*="post" i]',
                                            'button[class*="search" i]'
                                        ];

                                        let attempts = 0;
                                        const maxAttempts = isTextarea ? 15 : 10; // More attempts for textareas
                                        const poll = () => {
                                            // Try specific selectors first
                                            for (const s of sendSelectors) {
                                                const btn = searchRoot.querySelector(s);
                                                if (btn && ((typeof isElementVisible === 'function') ? isElementVisible(btn) : true)) {
                                                    const labelText = ((btn.getAttribute('aria-label') || '') + ' ' + (btn.textContent || btn.innerText || '')).toLowerCase();
                                                    if (labelText.includes('voice') || labelText.includes('microphone') || labelText.includes('mic') || labelText.includes('image') || labelText.includes('camera')) {
                                                        continue;
                                                    }
                                                    try {
                                                        btn.click();
                                                        console.log('[Content] ✅ Submit button clicked:', s);
                                                        return;
                                                    } catch (e) {
                                                        console.warn('[Content] ⚠️ Submit button click failed:', e);
                                                    }
                                                }
                                            }

                                            // Last resort: Find any enabled button near the element
                                            if (attempts >= 3) { // Only try generic selectors after a few attempts
                                                const genericBtns = searchRoot.querySelectorAll('button:not([disabled]):not([aria-disabled="true"]), [role="button"]:not([disabled]):not([aria-disabled="true"])');
                                                for (const btn of genericBtns) {
                                                    // Check if button is visible and has submit-related text
                                                    if ((typeof isElementVisible === 'function') ? isElementVisible(btn) : true) {
                                                        const btnText = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
                                                        // Look for submit-related keywords
                                                        if ((btnText.includes('send') || btnText.includes('post') || btnText.includes('submit') ||
                                                            btnText.includes('comment') || btnText.includes('reply') || btnText.includes('search')) &&
                                                            !(btnText.includes('voice') || btnText.includes('microphone') || btnText.includes('mic') || btnText.includes('image') || btnText.includes('camera'))) {
                                                            try {
                                                                btn.click();
                                                                console.log('[Content] ✅ Submit button clicked (generic match):', btnText || btn.className);
                                                                return;
                                                            } catch (e) {
                                                                console.warn('[Content] ⚠️ Generic submit button click failed:', e);
                                                            }
                                                        }
                                                    }
                                                }
                                            }

                                            attempts += 1;
                                            if (attempts < maxAttempts) {
                                                setTimeout(poll, 100);
                                            } else {
                                                console.log('[Content] ℹ️ Submit button not found after polling (this may be expected for some inputs)');
                                            }
                                        };
                                        poll();
                                    }, buttonPollDelay);
                                }
                            }, submitDelay);
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
                    break;
                }
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

            if (result && result.success && typeof this.schedulePostActionIntelligenceRefresh === 'function') {
                this.schedulePostActionIntelligenceRefresh(actionId, action);
            }

            return result;

        } catch (error) {
            console.error("[Content] ❌ Error executing action:", error);
            return { success: false, error: error.message, actionId, action };
        }
    };

    /**
     * 🆕 NEW: Schedule a high-priority scan + intelligence refresh after DOM actions
     * Enhanced with explicit transcript detection for YouTube "Show transcript" actions
     * 
     * 🎯 FIXED: No polling - only triggers scan AFTER action completes
     */
    IntelligenceEngine.prototype.schedulePostActionIntelligenceRefresh = function (actionId, actionType = 'unknown') {
        try {
            const isYoutube = window.location.hostname.includes('youtube.com') || window.currentFramework === 'youtube';
            const isTranscriptAction = actionType === 'click' && (
                actionId && this.getActionableElement(actionId)?.textContent?.toLowerCase().includes('transcript')
            );

            // 🎯 FIXED: For transcript actions, wait for page to settle then scan (no polling)
            if (isYoutube && isTranscriptAction) {
                console.log("[Content] 🎯 Transcript action detected, scheduling post-action scan...");

                // Wait for page to settle after transcript panel opens
                if (typeof scanWhenPageSettles === 'function') {
                    scanWhenPageSettles(() => {
                        console.log("[Content] 🔁 Post-action scan triggered after transcript action settled");
                        if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                            intelligenceEngine.queueIntelligenceUpdate('high', 'post_action_transcript');
                        }
                    }, {
                        quietWindow: 1000,  // Wait 1 second for transcript panel to fully load
                        maxWait: 12000,      // Max 12 seconds wait
                        checkInterval: 300
                    });
                }
            } else {
                // 🎯 ENHANCED: Use scanWhenPageSettles for more reliable post-action scanning
                if (typeof scanWhenPageSettles === 'function') {
                    scanWhenPageSettles(() => {
                        console.log("[Content] 🔁 Post-action scan triggered after page settled");
                        if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                            intelligenceEngine.queueIntelligenceUpdate('high', 'post_action_settled');
                        }
                    }, {
                        quietWindow: 800,  // Wait 800ms for SPAs
                        maxWait: 10000,
                        checkInterval: 200
                    });
                } else if (typeof scheduleInitialScan === 'function') {
                    scheduleInitialScan('post_action', {
                        quietPeriod: 800,  // Increased from 200ms
                        maxWait: 10000     // Increased from 8000ms
                    });
                }
            }

            console.log("[Content] 🔁 Post-action intelligence refresh scheduled", { actionId, actionType, isTranscriptAction });
        } catch (error) {
            console.warn("[Content] ⚠️ Failed to schedule post-action refresh:", error);
        }
    };

    // 🚫 REMOVED: pollForTranscriptPanel - replaced with post-action scan only
    // Polling was causing issues and is no longer needed with improved post-action scanning

    /**
     * 🆕 NEW: Purify element to ensure it's a clean actionable element
     * Filters out content elements and ensures only true actionable elements get registered
     */
    IntelligenceEngine.prototype.purifyElement = function (element, category) {
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
    IntelligenceEngine.prototype.registerContentElement = function (element, contentType = 'content') {
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
    IntelligenceEngine.prototype.generateContentId = function (element, contentType = 'content') {
        this.elementCounter++;
        const tagName = element.tagName ? element.tagName.toLowerCase() : 'unknown';
        const id = `content_${contentType}_${tagName}_${this.elementCounter}`;

        return {
            id: id,
            contentType: contentType,
            tagName: tagName,
            textContent: this.getCleanTextContent(element), // 🎯 FIX: Use clean text extraction
            selectors: this.generateElementSelectors(element),
            attributes: this.extractKeyAttributes(element),
            timestamp: Date.now()
        };
    };

    /**
     * 🆕 NEW: Extract URL from element for deduplication
     */
    IntelligenceEngine.prototype.extractElementUrl = function (element) {
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
    IntelligenceEngine.prototype.getYoutubeLinkSelectors = function () {
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
    IntelligenceEngine.prototype.registerYoutubeLockupLinks = function (registeredUrls) {
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
    IntelligenceEngine.prototype.registerYoutubeLinksFromNode = function (rootNode) {
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
     * 🆕 Collect transcript payloads (currently YouTube-specific)
     */
    IntelligenceEngine.prototype.collectTranscriptPayloads = function () {
        const transcripts = [];
        const youtubeTranscript = this.extractYoutubeTranscriptData();
        if (youtubeTranscript) {
            transcripts.push(youtubeTranscript);
        }
        return transcripts;
    };

    /**
     * 🆕 Extract YouTube transcript data when the transcript panel is open
     */
    IntelligenceEngine.prototype.extractYoutubeTranscriptData = function () {
        const isYoutube = window.location.hostname.includes('youtube.com') || window.currentFramework === 'youtube';
        if (!isYoutube) {
            return null;
        }

        const transcriptRoot = document.querySelector('ytd-transcript-segment-list-renderer');
        if (!transcriptRoot) {
            return null;
        }

        const segmentsContainer = transcriptRoot.querySelector('#segments-container');
        if (!segmentsContainer || !segmentsContainer.querySelector('ytd-transcript-segment-renderer')) {
            return null;
        }

        // Skip if panel is hidden/collapsed
        if (transcriptRoot.hasAttribute('hidden') || (typeof transcriptRoot.checkVisibility === 'function' && !transcriptRoot.checkVisibility())) {
            return null;
        }

        const segmentNodes = Array.from(segmentsContainer.querySelectorAll('ytd-transcript-segment-renderer'));
        if (!segmentNodes.length) {
            return null;
        }

        const segments = segmentNodes.map(node => {
            const timestampText = node.querySelector('.segment-timestamp')?.textContent?.trim() || null;
            const text = node.querySelector('.segment-text')?.textContent?.trim();
            if (!text) {
                return null;
            }
            return {
                timeText: timestampText,
                offsetSeconds: parseYoutubeTimestamp(timestampText),
                text,
                ariaLabel: node.getAttribute('aria-label') || null
            };
        }).filter(Boolean);

        if (!segments.length) {
            return null;
        }

        const signature = this.buildTranscriptSignature(segments);
        if (signature && signature === this.lastTranscriptSignature) {
            return null;
        }

        this.lastTranscriptSignature = signature;

        return {
            source: "youtube",
            collectedAt: Date.now(),
            title: this.extractYoutubeVideoTitle(),
            videoId: this.getYoutubeVideoId(),
            videoUrl: window.location.href,
            language: transcriptRoot.getAttribute('lang') || transcriptRoot.getAttribute('language') || document.documentElement.lang || 'en',
            segmentCount: segments.length,
            segments
        };
    };

    IntelligenceEngine.prototype.extractYoutubeVideoTitle = function () {
        // Prefer live DOM titles from the active YouTube watch surface
        const titleNode = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title');
        const domTitle = titleNode?.textContent?.trim();
        if (domTitle) {
            return domTitle;
        }

        const docTitle = document.title?.trim();
        if (docTitle) {
            return docTitle;
        }

        // Fall back to cached page state only when DOM/title tags fail
        if (this.pageState?.title && this.pageState.title !== 'Unknown') {
            return this.pageState.title;
        }

        return 'YouTube Video';
    };

    IntelligenceEngine.prototype.buildTranscriptSignature = function (segments) {
        if (!Array.isArray(segments) || !segments.length) {
            return null;
        }
        const headSample = segments.slice(0, 5).map(seg => `${seg.timeText || ''}|${seg.text}`).join('||');
        const tailSample = segments.slice(-5).map(seg => `${seg.timeText || ''}|${seg.text}`).join('||');
        return `${this.getYoutubeVideoId() || 'unknown'}|${segments.length}|${headSample}|${tailSample}`;
    };

    IntelligenceEngine.prototype.getYoutubeVideoId = function () {
        try {
            const currentUrl = new URL(window.location.href);
            const directId = currentUrl.searchParams.get('v');
            if (directId) {
                return directId;
            }
            const pathSegments = currentUrl.pathname.split('/').filter(Boolean);
            const shortsIndex = pathSegments.indexOf('shorts');
            if (shortsIndex >= 0 && pathSegments[shortsIndex + 1]) {
                return pathSegments[shortsIndex + 1];
            }
            if (pathSegments.length && pathSegments[0] === 'watch' && pathSegments[1]) {
                return pathSegments[1];
            }
            if (pathSegments.length === 1 && pathSegments[0].length >= 8) {
                return pathSegments[0];
            }
        } catch (error) {
            console.warn("[Content] ⚠️ Unable to parse YouTube video ID:", error);
        }
        return null;
    };

    function parseYoutubeTimestamp(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const cleaned = value.trim();
        if (!cleaned) {
            return null;
        }
        const parts = cleaned.split(':').map(part => parseInt(part.trim(), 10));
        if (parts.some(num => Number.isNaN(num))) {
            return null;
        }
        let multiplier = 1;
        let seconds = 0;
        while (parts.length) {
            seconds += (parts.pop() || 0) * multiplier;
            multiplier *= 60;
        }
        return seconds;
    }
    /**
     * 🆕 NEW: Collect structured YouTube card link descriptors (console-style)
     */
    IntelligenceEngine.prototype.collectYoutubeCardDescriptors = function (existingDescriptors = [], roots = null) {
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
            sourceNodes = Array.from(document.querySelectorAll('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer'));
        }

        const selectors = [
            'a#video-title[href*="watch"]',
            'a#video-title',
            'ytd-video-renderer a#video-title',
            'ytd-video-renderer a.yt-simple-endpoint[href*="watch"]',
            'a.yt-simple-endpoint.style-scope.ytd-video-renderer[href*="watch"]',
            'a.yt-simple-endpoint[href*="watch"][id="video-title"]',
            'a.yt-lockup-metadata-view-model__title[href*="watch"]',
            'yt-lockup-view-model a.yt-lockup-metadata-view-model__title[href*="watch"]',
            'a#video-title-link[href*="watch"]',
            'a[href*="watch"][class*="metadata-view-model__title"]',
            'a.shortsLockupViewModelHostEndpoint[href*="/shorts/"]',
            'a.shortsLockupViewModelHostOutsideMetadataEndpoint[href*="/shorts/"]',
            'a[href^="https://www.youtube.com/shorts/"]',
            'a[href^="/shorts/"]'
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

            const text = normalize(link.textContent || link.innerText) || normalize(link.getAttribute('aria-label')) || normalize(link.getAttribute('title'));
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
    IntelligenceEngine.prototype.collectAdditionalAnchorDescriptors = function (existingDescriptors = []) {
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

                // 🎯 SPECIAL CASE: Video-title links should bypass visibility checks if they have a label
                const isVideoTitleLink = (
                    anchor.id === 'video-title' ||
                    anchor.classList.contains('yt-simple-endpoint') ||
                    anchor.closest('ytd-video-renderer') !== null
                ) && (text || ariaLabel || titleAttr);

                const visibilityNode = anchor; // use anchor for visibility checks
                if (!isVideoTitleLink && (!this.isElementVisible || !this.isElementVisible(visibilityNode))) {
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
     * 🔧 HELPER: Compute DOM path for an element
     * Returns array of indices representing path from body to element
     */
    IntelligenceEngine.prototype.computeDomPath = function (node) {
        const path = [];
        let current = node;
        while (current && current !== document.body && current.parentElement) {
            const parent = current.parentElement;
            const index = Array.prototype.indexOf.call(parent.children, current);
            path.unshift(index);
            current = parent;
        }
        return path;
    };

    /**
     * 🔧 HELPER: Compare two DOM paths for sorting
     * Returns negative if a comes before b, positive if after, 0 if equal
     */
    IntelligenceEngine.prototype.compareDomPaths = function (a, b) {
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const av = a[i] ?? -1;
            const bv = b[i] ?? -1;
            if (av !== bv) return av - bv;
        }
        return 0;
    };

    /**
     * 🆕 NEW: Scan page and register all existing interactive elements
     */
    IntelligenceEngine.prototype.scanAndRegisterPageElements = function () {
        // 🔒 SCAN LOCK: Prevent concurrent scans from causing ID collisions
        if (this._scanInProgress) {
            console.warn("[Content] ⚠️ Scan already in progress, skipping concurrent scan request");
            return {
                success: false,
                message: "Scan already in progress",
                timestamp: Date.now()
            };
        }

        this._scanInProgress = true;

        try {
            console.log("[Content] 🔍 Scanning page for interactive elements...");

            // 🆕 CSP bypass already handled during page initialization - no need to repeat

            // ♻️ NO MANUAL CLEARING NEEDED: Engine already recreated with zero state
            // When queueFullRescan() calls recreateIntelligenceEngine(), we get a brand new instance with:
            // - All Maps empty (actionableElements, actionableElementNodes, contentElements)
            // - Counter at 0
            // - Fresh WeakSet/WeakMap for duplicate prevention
            // - No leftover state or "history"
            //
            // This function just scans and registers - the reset already happened.

            // 🚫 DISABLED: Old DOM marker cleanup (now handled by semantic extraction)
            // // 🧹 CLEAN DOM MARKERS: Remove old data-ome-action-id attributes from previous scan
            // // (This is DOM state, not engine state, so we still need to clean it manually)
            // console.log("[Content] 🧹 Starting DOM marker cleanup...");
            // try {
            //     const existingMarkers = document.querySelectorAll('[data-ome-action-id]');
            //     console.log(`[Content] 🧹 Found ${existingMarkers.length} old DOM markers to clean`);
            //
            //     if (existingMarkers.length > 0) {
            //         console.log(`[Content] 🧹 Removing ${existingMarkers.length} old DOM markers`);
            //         let removedCount = 0;
            //         existingMarkers.forEach(node => {
            //             try {
            //                 if (node.dataset) {
            //                     delete node.dataset.omeActionId;
            //                 }
            //                 node.removeAttribute('data-ome-action-id');
            //                 removedCount++;
            //             } catch (markerError) {
            //                 console.warn('[Content] ⚠️ Failed to clear actionable marker:', markerError?.message || markerError);
            //             }
            //         });
            //         console.log(`[Content] ✅ Successfully removed ${removedCount} DOM markers`);
            //     } else {
            //         console.log("[Content] ✅ No old DOM markers found (clean slate)");
            //     }
            // } catch (markerScanError) {
            //     console.warn('[Content] ⚠️ Unable to clear existing actionable markers:', markerScanError?.message || markerScanError);
            // }

            if (this.youtubeRegisteredUrls) {
                this.youtubeRegisteredUrls.clear();
            } else {
                this.youtubeRegisteredUrls = new Set();
            }
            this.lastTranscriptSignature = null;

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

            // 🔧 FIX: Collect elements first, then sort by DOM position before assigning IDs
            // This ensures a_id_0 goes to the first DOM element, not the first scanned element
            const elementsToRegister = [];

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
                            const actionType = this.determineActionType(purifiedElement);
                            const domPath = this.computeDomPath(purifiedElement);

                            // Collect element info instead of registering immediately
                            elementsToRegister.push({
                                element: purifiedElement,
                                actionType: actionType,
                                domPath: domPath,
                                url: elementUrl
                            });

                            // Mark URL as seen to prevent duplicates
                            if (elementUrl) {
                                registeredUrls.add(elementUrl);
                            }
                        }
                    }
                }
            });

            // 🔧 FIX: Sort by DOM position BEFORE assigning IDs
            // This ensures stable, predictable ID assignment based on visual DOM order
            elementsToRegister.sort((a, b) => {
                return this.compareDomPaths(a.domPath, b.domPath);
            });

            // Now register in DOM order to ensure a_id_0 = first DOM element
            elementsToRegister.forEach(item => {
                const actionId = this.registerActionableElement(item.element, item.actionType);
                registeredCount++;

                // Track URL count
                if (item.url) {
                    urlElementCount++;
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

            // 🎯 CLEANUP: Clear preserved marker IDs after scan completes
            if (this._preservedMarkerIds) {
                this._preservedMarkerIds.clear();
                this._preservedMarkerIds = null;
            }
            // applyConfiguredFocus('initial_scan');

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

            // 🔓 RELEASE SCAN LOCK: Allow next scan to proceed
            this._scanInProgress = false;

            // 🔄 CHECK FOR QUEUED RESCAN: If mutations happened during scan, trigger rescan now
            // ♻️ Use queueFullRescan() to ensure engine is recreated for queued rescan too
            if (this._rescanQueued) {
                const queuedReason = this._rescanQueued;
                this._rescanQueued = null;
                console.log(`[Content] 🔄 Starting queued rescan (${queuedReason})`);
                setTimeout(() => {
                    // Use global intelligenceEngine reference (not `this`) since this instance may be destroyed
                    if (intelligenceEngine && intelligenceEngine.queueFullRescan) {
                        intelligenceEngine.queueFullRescan(queuedReason);
                    }
                }, 100); // Small delay to let DOM settle
            }

            return result;

        } catch (error) {
            console.error("[Content] ❌ Error scanning page:", error);

            // 🔓 RELEASE SCAN LOCK: Even on error, unlock for next scan
            this._scanInProgress = false;

            // 🔄 CHECK FOR QUEUED RESCAN: Even on error, trigger queued rescan
            // ♻️ Use queueFullRescan() to ensure engine is recreated for queued rescan too
            if (this._rescanQueued) {
                const queuedReason = this._rescanQueued;
                this._rescanQueued = null;
                console.log(`[Content] 🔄 Starting queued rescan after error (${queuedReason})`);
                setTimeout(() => {
                    // Use global intelligenceEngine reference (not `this`) since this instance may be destroyed
                    if (intelligenceEngine && intelligenceEngine.queueFullRescan) {
                        intelligenceEngine.queueFullRescan(queuedReason);
                    }
                }, 100);
            }

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
     * ♻️ DESTROY & RECREATE: Kill old IntelligenceEngine and create fresh instance
     *
     * This is the ONLY way to guarantee a truly clean reset:
     * - Destroys all references to old instance
     * - Creates brand new instance with zero state
     * - All Maps, Sets, counters start from scratch
     * - Impossible to have leftover elements or "history"
     *
     * @returns {IntelligenceEngine} The newly created engine instance
     */
    function recreateIntelligenceEngine() {
        // Log what's being destroyed BEFORE we destroy it
        if (intelligenceEngine) {
            console.log("[Content] ♻️ Destroying old IntelligenceEngine:", {
                actionableElements: intelligenceEngine.actionableElements?.size || 0,
                actionableElementNodes: intelligenceEngine.actionableElementNodes?.size || 0,
                contentElements: intelligenceEngine.contentElements?.size || 0,
                elementCounter: intelligenceEngine.elementCounter || 0,
                message: "All Maps, node registry, and counter will be garbage collected"
            });
        } else {
            console.log("[Content] ♻️ No existing IntelligenceEngine to destroy");
        }

        // 1. DESTROY: Clear all references to old instance
        if (intelligenceEngine) {
            intelligenceEngine = null;
            window.intelligenceEngine = null;
            if (window.intelligenceComponents) {
                window.intelligenceComponents.intelligenceEngine = null;
            }
        }

        // 2. RECREATE: Brand new instance (zero state, fresh start)
        console.log("[Content] ♻️ Creating new IntelligenceEngine (all state cleared)...");
        intelligenceEngine = new IntelligenceEngine();
        window.intelligenceEngine = intelligenceEngine;

        // 3. UPDATE GLOBAL REFERENCES: Ensure all code uses new instance
        if (window.intelligenceComponents) {
            window.intelligenceComponents.intelligenceEngine = intelligenceEngine;
        } else {
            window.intelligenceComponents = {
                changeAggregator: changeAggregator,
                intelligenceEngine: intelligenceEngine,
                pageContext: pageContext
            };
        }

        // 4. VERIFY: Log new instance state to confirm clean slate
        console.log("[Content] ✅ IntelligenceEngine recreated with clean state:", {
            actionableElements: intelligenceEngine.actionableElements?.size || 0,
            actionableElementNodes: intelligenceEngine.actionableElementNodes?.size || 0,
            contentElements: intelligenceEngine.contentElements?.size || 0,
            elementCounter: intelligenceEngine.elementCounter || 0,
            message: "All registries empty, counter at 0"
        });

        return intelligenceEngine;
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
            if (intelligenceEngine) {
                window.intelligenceEngine = intelligenceEngine;
            }
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
            window.intelligenceEngine = intelligenceEngine;

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

    // REMOVED 2025-11-21: sendIntelligenceUpdateToServer() was never called (dead code, 40 lines)
    // Orphaned replacement function that was created but never integrated into the call flow
    // Intelligence updates now flow through intelligenceEngine.queueIntelligenceUpdate() directly

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
                console.log("[Content] 🧠 URL changed, triggering full rescan:", {
                    from: currentUrl,
                    to: newUrl
                });
                currentUrl = newUrl;

                // ♻️ URL CHANGE = FULL RESCAN: Treat like browser refresh (destroy + recreate + scan)
                setTimeout(() => {
                    if (intelligenceEngine && intelligenceEngine.queueFullRescan) {
                        intelligenceEngine.queueFullRescan('url_change');
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
            console.log("[Content] 🧠 Hash changed, triggering full rescan");
            setTimeout(() => {
                if (intelligenceEngine && intelligenceEngine.queueFullRescan) {
                    intelligenceEngine.queueFullRescan('hash_change');
                }
            }, 500);
        });

        // 4. ✅ TRIGGER: On popstate (browser back/forward)
        window.addEventListener('popstate', () => {
            console.log("[Content] 🧠 Popstate event, triggering full rescan");
            setTimeout(() => {
                if (intelligenceEngine && intelligenceEngine.queueFullRescan) {
                    intelligenceEngine.queueFullRescan('popstate');
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

    // 🎯 PREMIUM: Generic Capability Pipeline Executor (Dynamic Element Finder)
    async function capabilityPipelineExecutor(capabilityAction, params) {
        console.log(`[Content] 🎯 CAPABILITY PIPELINE - Dynamic Element Finder: ${capabilityAction}`);

        // 🆕 DIAGNOSTIC: Check all config sources
        console.log("[Content] 🔍 CONFIG DIAGNOSTIC:");
        console.log("  → window.currentSiteConfig:", window.currentSiteConfig);
        console.log("  → siteConfig (local):", typeof siteConfig !== 'undefined' ? siteConfig : 'undefined');
        console.log("  → window.currentFramework:", window.currentFramework);
        console.log("  → currentDomain:", currentDomain);

        // 🆕 USE SAME PATTERN AS INTELLIGENCE ENGINE: Prefer local siteConfig, fallback to window.currentSiteConfig
        const activeConfig = siteConfig || window.currentSiteConfig;

        if (!activeConfig) {
            console.log("[Content] ⚠️ Config not found, attempting reload...");
            const reloadedConfig = getSiteConfigDirect();
            if (!reloadedConfig) {
                console.error("[Content] ❌ Config reload failed");
                throw new Error("Site config not available and reload failed");
            }
            console.log("[Content] ✅ Config reloaded successfully");
        }

        // Final config check
        const finalConfig = siteConfig || window.currentSiteConfig;
        if (!finalConfig) {
            throw new Error("Site config unavailable after reload attempt");
        }

        console.log("[Content] ✅ Using config:", finalConfig.framework);

        try {
            // Step 1: Dynamic capability lookup - find config by action name
            const capabilityKey = Object.keys(finalConfig?.capabilities || {})
                .find(key => {
                    const cap = finalConfig.capabilities[key];
                    return cap.action === capabilityAction;
                });

            if (!capabilityKey) {
                console.error(`[Content] ❌ No capability found for action: ${capabilityAction}`);
                console.error(`[Content] Available capabilities:`, Object.keys(finalConfig?.capabilities || {}));
                throw new Error(`No capability config found for action: ${capabilityAction}`);
            }

            const capability = finalConfig.capabilities[capabilityKey];
            console.log(`[Content] ✅ Found capability: "${capabilityKey}" for action: ${capabilityAction}`);
            console.log(`[Content] Capability config:`, capability);

            // Step 2: Get selectors for dynamic element search
            const capabilitySelectors = capability.selectors || [];

            if (capabilitySelectors.length === 0) {
                throw new Error(`No selectors configured for capability: ${capabilityKey}`);
            }

            console.log(`[Content] 🔍 DYNAMIC SCAN: Searching DOM with ${capabilitySelectors.length} selectors...`);
            console.log(`[Content] Selectors to try:`, capabilitySelectors);

            let targetElement = null;
            let matchedSelector = null;

            // Try each selector with detailed logging
            for (let i = 0; i < capabilitySelectors.length; i++) {
                const selector = capabilitySelectors[i];
                console.log(`[Content] 🔎 Trying selector ${i + 1}/${capabilitySelectors.length}: ${selector}`);

                try {
                    const elements = document.querySelectorAll(selector);
                    console.log(`[Content]   → Found ${elements.length} elements`);

                    if (elements.length > 0) {
                        targetElement = elements[0];
                        matchedSelector = selector;
                        console.log(`[Content] ✅ MATCH! Element found with selector: ${selector}`);
                        console.log(`[Content] Element details:`, {
                            tagName: targetElement.tagName,
                            className: targetElement.className,
                            ariaLabel: targetElement.getAttribute('aria-label'),
                            textContent: targetElement.textContent?.trim().substring(0, 50)
                        });
                        break;
                    }
                } catch (error) {
                    console.log(`[Content]   ❌ Selector error: ${error.message}`);
                }
            }

            // If not found immediately, wait for it to appear (lazy loading)
            if (!targetElement) {
                console.log(`[Content] ⏳ Element not found immediately, waiting for lazy load (max 5s)...`);

                for (const selector of capabilitySelectors) {
                    try {
                        console.log(`[Content] 🔎 Waiting for: ${selector}`);
                        targetElement = await waitForElement(selector, 5000);
                        matchedSelector = selector;
                        console.log(`[Content] ✅ Element appeared: ${selector}`);
                        break;
                    } catch (error) {
                        console.log(`[Content]   ⏱️ Timeout waiting for: ${selector}`);
                    }
                }
            }

            if (!targetElement) {
                console.error(`[Content] ❌ Element not found after trying all selectors and waiting`);
                console.error(`[Content] DOM snapshot - all buttons with "transcript":`,
                    Array.from(document.querySelectorAll('button'))
                        .filter(btn => {
                            const text = (btn.textContent || '').toLowerCase();
                            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                            return text.includes('transcript') || label.includes('transcript');
                        })
                        .map(btn => ({
                            html: btn.outerHTML.substring(0, 200),
                            ariaLabel: btn.getAttribute('aria-label'),
                            classes: btn.className
                        }))
                );
                throw new Error(`Element not found using any configured selectors (tried ${capabilitySelectors.length} selectors)`);
            }


            // Step 3: Execute appropriate action based on element type
            const tagName = targetElement.tagName.toLowerCase();
            const isInput = tagName === 'input' || tagName === 'textarea';
            const isContentEditable = targetElement.isContentEditable || targetElement.getAttribute('contenteditable') === 'true';

            if ((isInput || isContentEditable) && params.value !== undefined) {
                // Handle input fields (including contenteditable like ProseMirror)
                console.log(`[Content] ⌨️ Setting value on ${isContentEditable ? 'contenteditable' : 'input'} element: "${params.value}"`);

                if (isContentEditable) {
                    // ProseMirror/Lexical/contenteditable handling
                    targetElement.focus();
                    targetElement.innerHTML = '<p><br></p>'; // Clear existing content
                    document.execCommand('insertText', false, params.value);
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log(`[Content] ✅ Value set via execCommand for contenteditable`);
                } else {
                    // Regular input/textarea
                    targetElement.value = params.value;
                    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                    targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                }

                if (params.submit) {
                    console.log(`[Content] 📤 Submitting form...`);

                    // Wait for UI to update (React/framework state sync)
                    await new Promise(r => setTimeout(r, 300));

                    // Get submit method from capability config
                    // Options: 'enter' (press Enter), 'click' (click button), 'form' (form.submit())
                    // Default: 'enter' for backwards compatibility with search inputs
                    const submitMethod = capability.submitMethod || 'enter';
                    const submitSelector = capability.submitSelector;

                    console.log(`[Content] 📤 Submit method: ${submitMethod}${submitSelector ? `, selector: ${submitSelector}` : ''}`);

                    if (submitMethod === 'click') {
                        // Method: Click button (for ChatGPT, etc.)
                        let submitBtn = null;

                        if (submitSelector) {
                            submitBtn = document.querySelector(submitSelector);
                            if (submitBtn) {
                                console.log(`[Content] ✅ Found submit button via config: ${submitSelector}`);
                            }
                        }

                        // Fallback selectors if config selector not found
                        if (!submitBtn) {
                            const fallbackSelectors = [
                                'button[data-testid="send-button"]',
                                '#composer-submit-button',
                                'button[type="submit"]',
                                'button[aria-label*="Send" i]',
                                'button[aria-label*="Submit" i]'
                            ];
                            for (const sel of fallbackSelectors) {
                                submitBtn = document.querySelector(sel);
                                if (submitBtn) {
                                    console.log(`[Content] ✅ Found submit button via fallback: ${sel}`);
                                    break;
                                }
                            }
                        }

                        if (submitBtn) {
                            submitBtn.click();
                            console.log(`[Content] 🖱️ Submit button clicked`);
                        } else {
                            console.log(`[Content] ⚠️ No submit button found, trying Enter key as fallback`);
                            targetElement.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
                            }));
                        }

                    } else if (submitMethod === 'form') {
                        // Method: Submit parent form directly
                        const form = targetElement.closest('form');
                        if (form) {
                            console.log(`[Content] 📝 Submitting via form.submit()`);
                            form.submit();
                        } else {
                            console.log(`[Content] ⚠️ No parent form, trying Enter key`);
                            targetElement.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
                            }));
                        }

                    } else {
                        // Method: 'enter' (default) - Press Enter key on input (for YouTube, Google, etc.)
                        console.log(`[Content] ⌨️ Submitting via Enter key`);
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true
                        });
                        targetElement.dispatchEvent(enterEvent);
                    }
                }
            } else {
                // Handle buttons and other clickable elements
                // Use universalClick for React/Facebook compatibility (multiple click strategies)
                console.log(`[Content] 🖱️ Clicking element via universalClick (matched by: ${matchedSelector})...`);
                const clickResult = universalClick(targetElement);
                console.log(`[Content] 🖱️ universalClick result:`, clickResult);
            }

            // Step 4: Wait for result to load
            console.log(`[Content] ⏳ Waiting for capability action to complete...`);
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 5: Trigger intelligence update
            console.log("[Content] 📤 Triggering intelligence update...");

            if (intelligenceEngine && intelligenceEngine.queueIntelligenceUpdate) {
                intelligenceEngine.queueIntelligenceUpdate('high', `capability_${capabilityAction}`);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));

            return {
                success: true,
                message: `Capability ${capabilityAction} executed successfully`,
                elementFound: matchedSelector,
                matchedBy: 'selector'
            };

        } catch (error) {
            console.error(`[Content] ❌ Capability pipeline failed:`, error);
            console.error(`[Content] Error stack:`, error.stack);
            throw error;
        }
    }

    // Helper function to wait for element to appear
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for element: ${selector}`));
            }, timeout);
        });
    }

    // 🎯 PREMIUM: Capability execution router
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "execute_capability") {
            const action = message.action;
            const params = message.params || {};

            console.log(`[Content] 🎯 CAPABILITY EXECUTION: ${action}`);

            // Route to generic capability pipeline executor
            capabilityPipelineExecutor(action, params)
                .then(result => {
                    console.log("[Content] ✅ Capability executed successfully:", result);
                    sendResponse({ ok: true, result });
                })
                .catch(error => {
                    console.error("[Content] ❌ Capability execution failed:", error);
                    sendResponse({ ok: false, error: error.message });
                });

            return true; // Keep channel open for async
        }

        if (message.type === "youtube_find_transcript_button") {
            console.log("[Content] 🎯 PHASE B: Hunting for transcript button directly in DOM...");

            try {
                // Strategy 1: Exact aria-label match
                let button = document.querySelector('button[aria-label="Show transcript"]');

                // Strategy 2: Case-insensitive contains
                if (!button) {
                    const allButtons = Array.from(document.querySelectorAll('button'));
                    button = allButtons.find(btn => {
                        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                        return ariaLabel.includes('transcript');
                    });
                }

                if (!button) {
                    console.log("[Content] ❌ Transcript button not found in DOM");
                    sendResponse({ ok: false, error: "Transcript button not found" });
                    return true;
                }

                console.log("[Content] ✅ Found transcript button:", button);
                console.log("[Content] 🎯 Button details:", {
                    tagName: button.tagName,
                    ariaLabel: button.getAttribute('aria-label'),
                    classes: button.className,
                    innerText: button.innerText
                });

                // Force-register this button if not already registered
                if (intelligenceEngine) {
                    // Check if already registered
                    let existingId = null;
                    for (const [id, element] of intelligenceEngine.actionableElements) {
                        if (element === button) {
                            existingId = id;
                            break;
                        }
                    }

                    if (existingId) {
                        console.log("[Content] ✅ Button already registered:", existingId);
                        sendResponse({ ok: true, actionId: existingId, alreadyRegistered: true });
                    } else {
                        // Force-register it now
                        const actionId = intelligenceEngine.registerActionableElement(button, 'click');
                        console.log("[Content] ✅ Force-registered transcript button:", actionId);

                        // Trigger intelligence update to send new button to server
                        if (intelligenceEngine.queueIntelligenceUpdate) {
                            intelligenceEngine.queueIntelligenceUpdate('high', 'transcript_button_found');
                        }

                        sendResponse({ ok: true, actionId, newlyRegistered: true });
                    }
                } else {
                    console.log("[Content] ⚠️ Intelligence engine not available");
                    sendResponse({ ok: false, error: "Intelligence engine not available" });
                }

            } catch (error) {
                console.error("[Content] ❌ Error hunting for transcript button:", error);
                sendResponse({ ok: false, error: error.message });
            }

            return true; // Keep channel open for async response
        }

        if (message.type === "execute_action") {
            console.log("[Content] 🤖 Executing LLM action:", message);

            try {
                // Extract data from the message structure
                let { actionId, actionType, params } = message.data || message;

                // 🎯 FIX: Normalize action ID format (handle both a_id_ and a_i_ formats)
                // Some LLMs or parsers may generate a_i_ instead of a_id_
                if (actionId && typeof actionId === 'string') {
                    const normalizedId = actionId.replace(/^a_i_/, 'a_id_');
                    if (normalizedId !== actionId) {
                        console.log(`[Content] 🔄 Normalized action ID: ${actionId} → ${normalizedId}`);
                        actionId = normalizedId;
                    }
                }

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
        const isYoutube = window.location.hostname.includes('youtube.com') || window.currentFramework === 'youtube';

        // 🎯 SPECIAL CASE: YouTube transcript elements should always trigger (panels AND buttons)
        const hasTranscriptElement = mutations.some(mutation => {
            if (mutation.type === 'childList') {
                return Array.from(mutation.addedNodes || []).some(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return false;

                    // Detect transcript panels (actual transcript content)
                    if (node.tagName === 'YTD-TRANSCRIPT-SEGMENT-LIST-RENDERER' ||
                        node.querySelector?.('ytd-transcript-segment-list-renderer') ||
                        node.closest?.('ytd-transcript-segment-list-renderer')) {
                        return true;
                    }

                    // 🎯 FIX: Detect "Show transcript" button (multiple strategies)
                    // Strategy 1: Node itself is a button with transcript in aria-label
                    if (node.tagName === 'BUTTON') {
                        const ariaLabel = node.getAttribute?.('aria-label')?.toLowerCase() || '';
                        if (ariaLabel.includes('transcript')) {
                            console.log("[Content] 🎯 Transcript button detected (direct):", ariaLabel);
                            return true;
                        }
                    }

                    // Strategy 2: Node contains a button with transcript in aria-label
                    const transcriptButton = node.querySelector?.('button[aria-label*="transcript" i]');
                    if (transcriptButton) {
                        console.log("[Content] 🎯 Transcript button detected (querySelector):", transcriptButton.getAttribute('aria-label'));
                        return true;
                    }

                    // Strategy 3: Check if added node is inside engagement panel (where transcript button lives)
                    if (node.closest?.('ytd-engagement-panel-section-list-renderer') ||
                        node.tagName === 'YTD-ENGAGEMENT-PANEL-SECTION-LIST-RENDERER') {
                        const buttons = node.querySelectorAll?.('button') || [];
                        for (const btn of buttons) {
                            const ariaLabel = btn.getAttribute?.('aria-label')?.toLowerCase() || '';
                            if (ariaLabel.includes('transcript')) {
                                console.log("[Content] 🎯 Transcript button detected (engagement panel):", ariaLabel);
                                return true;
                            }
                        }
                    }

                    return false;
                });
            }
            return false;
        });

        if (hasTranscriptElement) {
            console.log("[Content] 🎯 Transcript element change detected - forcing significant change and rescan");
            lastSignificantChange = now;
            return true;
        }

        // 🎯 SPECIAL CASE: YouTube playlist list renders updates frequently (virtualised entries)
        const playlistMutationDetected = isYoutube && mutations.some(mutation => {
            const affectedNodes = [];
            if (mutation.target) affectedNodes.push(mutation.target);
            if (mutation.addedNodes && mutation.addedNodes.length) {
                affectedNodes.push(...Array.from(mutation.addedNodes));
            }
            if (mutation.removedNodes && mutation.removedNodes.length) {
                affectedNodes.push(...Array.from(mutation.removedNodes));
            }

            return affectedNodes.some(node => {
                if (!node || node.nodeType !== Node.ELEMENT_NODE) {
                    return false;
                }
                return node.closest?.('ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-playlist-video-list-renderer, ytd-playlist-panel-renderer');
            });
        });

        if (playlistMutationDetected) {
            console.log("[Content] 🎯 Playlist change detected - forcing significant change");
            lastSignificantChange = now;
            return true;
        }

        // 🚫 FILTER 1: Rate limiting - minimum 2 seconds between significant changes (reduced for YouTube)
        const minInterval = isYoutube ? 1000 : MIN_CHANGE_INTERVAL; // 1 second for YouTube, 2 seconds otherwise
        if (now - lastSignificantChange < minInterval) {
            return false;
        }

        // 🚫 FILTER 2: Need minimum number of mutations to be significant (reduced for YouTube)
        const minMutations = isYoutube ? 1 : MIN_MUTATIONS_FOR_SIGNIFICANT; // 1 mutation for YouTube, 3 otherwise
        if (mutations.length < minMutations) {
            return false;
        }

        // 🚫 FILTER 3: Ignore mouse events and focus changes (but allow YouTube-specific elements)
        const hasIgnoredTypes = mutations.some(mutation => {
            // Allow YouTube transcript and video-related changes
            if (isYoutube) {
                const target = mutation.target;
                if (target && (
                    target.closest?.('ytd-transcript-segment-list-renderer') ||
                    target.closest?.('ytd-video-renderer') ||
                    target.closest?.('ytd-watch-flexy')
                )) {
                    return false; // Don't ignore YouTube-specific changes
                }
            }

            return IGNORED_CHANGE_TYPES.has(mutation.type) ||
                (mutation.type === 'attributes' &&
                    ['class', 'style', 'data-'].some(prefix =>
                        mutation.attributeName?.startsWith(prefix)
                    ));
        });

        if (hasIgnoredTypes) {
            return false;
        }

        // 🚫 FILTER 4: Ignore changes to hidden/invisible elements (but check YouTube elements more leniently)
        const hasVisibleChanges = mutations.some(mutation => {
            if (mutation.type === 'childList') {
                // Check if added/removed nodes are visible
                const addedVisible = Array.from(mutation.addedNodes || []).some(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return false;

                    // For YouTube, be more lenient with visibility checks
                    if (isYoutube && (
                        node.tagName === 'YTD-TRANSCRIPT-SEGMENT-RENDERER' ||
                        node.closest?.('ytd-transcript-segment-list-renderer')
                    )) {
                        return true; // Always consider transcript segments as visible
                    }

                    return isElementVisible(node);
                });
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
    // REMOVED 2025-11-21: setupEventDrivenUpdates() and initialization code was never called (dead code, 77 lines)
    // Duplicate implementation of event-driven updates that was never integrated
    // Intelligence updates are handled by the existing intelligence engine event listeners

    // REMOVED 2025-11-21: Entire Menu System (buildMenuStructures and 20+ helper functions, 1109 lines)
    // Complete experimental menu analysis system that was never executed
    // Included functions: buildMenuStructures(), findMenuItemsForToggle(), findMainNavigationMenus(),
    // findStandaloneNavigationMenus(), consolidateAllMenus(), buildCleanActionIdMappings(),
    // getMenuName(), generateIntelligenceOutput(), deduplicateMenus(), and 11 more helper functions

})();
