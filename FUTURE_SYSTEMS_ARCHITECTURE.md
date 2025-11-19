# 🚀 FUTURE SYSTEMS ARCHITECTURE: Om-E-Web Post-Refactor

> **Vision:** Clean, modular, maintainable architecture with 50% less code doing the same work
> **Status:** Target architecture after Master_Refactoring_Roadmap_v2.md completion
> **Principles:** Single Responsibility, DRY, Event-Driven, Async-First, Type-Safe

---

## Executive Summary

**Current State (The Soup):**
- 10,000+ lines in content.js (monolithic)
- 800-line handler function in ws_server.py
- 8 overlapping scan triggers
- Duplicate code across 7+ helper functions
- No clear module boundaries
- Zero type safety
- Global state everywhere

**Future State (Clean & Modular):**
- **50% code reduction** (5,000 lines → 2,500 in content.js)
- **Focused modules** (<200 lines each)
- **Single source of truth** for each responsibility
- **Type-safe** (JSDoc + Python type hints)
- **Event-driven** coordination
- **Zero duplication** (DRY principle)
- **Clear dependencies** (dependency injection)

**Core Functionality Preserved:**
- ✅ DOM scanning and element registration
- ✅ Action execution (click, setValue, navigate)
- ✅ Intelligence updates to server
- ✅ Artifact generation
- ✅ WebSocket message routing
- ✅ Multi-tab support
- ✅ Site config system
- ✅ Capability pipeline

---

## Target Metrics (Before → After)

| Metric | Current (Soup) | Target (Clean) | Improvement |
|--------|----------------|----------------|-------------|
| **Total Lines of Code** | ~15,000 | ~7,500 | 50% reduction |
| content.js | 10,000+ lines | 2,500 lines | 75% reduction |
| ws_server.py | 2,500+ lines | 800 lines | 68% reduction |
| sw.js | 1,400 lines | 600 lines | 57% reduction |
| Largest function | 800 lines | <50 lines | 94% reduction |
| Cyclomatic complexity | 300+ (unmaintainable) | <10 per function | 97% reduction |
| Code duplication | 7 duplicate utils | 0 (DRY) | 100% elimination |
| Module count | 4 monoliths | 25+ focused modules | 6x modularity |
| Type coverage | 0% | 100% (JSDoc + Python) | ∞ improvement |

---

## 1. New Directory Structure

```
Om_E_Web/
├── web_extension/                  # Chrome Extension (MV3)
│   ├── manifest.json
│   ├── src/                        # ✅ NEW: Source organization
│   │   ├── common/                 # Shared utilities
│   │   │   ├── logger.js           # Structured logging (50 lines)
│   │   │   ├── env.js              # Config + feature flags (30 lines)
│   │   │   ├── types.js            # JSDoc type definitions (100 lines)
│   │   │   └── dom-utils.js        # DOM helpers (80 lines)
│   │   │
│   │   ├── content/                # Content script modules
│   │   │   ├── main.js             # Entry point + initialization (100 lines)
│   │   │   ├── ScanController.js   # Scan coordination (150 lines)
│   │   │   ├── IntelligenceEngine.js  # Element registry (200 lines)
│   │   │   ├── ActionExecutor.js   # Click/setValue/navigate (180 lines)
│   │   │   ├── ElementRegistry.js  # ID tracking + dedup (120 lines)
│   │   │   ├── PageMonitor.js      # Idle detection + mutations (100 lines)
│   │   │   ├── CapabilityExecutor.js  # Dynamic selector search (80 lines)
│   │   │   └── MessageHandler.js   # SW ↔ content messaging (60 lines)
│   │   │
│   │   ├── service-worker/         # Service worker modules
│   │   │   ├── main.js             # Entry point + lifecycle (80 lines)
│   │   │   ├── WebSocketClient.js  # Server connection (120 lines)
│   │   │   ├── NavigationCoordinator.js  # Nav event dedup (100 lines)
│   │   │   ├── ContentScriptManager.js   # Injection tracking (80 lines)
│   │   │   ├── TabStateManager.js  # Per-tab state (100 lines)
│   │   │   ├── MessageRouter.js    # Server ↔ content routing (90 lines)
│   │   │   └── ConfigManager.js    # Site config distribution (70 lines)
│   │   │
│   │   └── popup/                  # Extension UI
│   │       ├── popup.html
│   │       └── popup.js            # Status display (50 lines)
│   │
│   └── site_configs.json           # Domain-specific configs (unchanged)
│
├── om_e_web_ws/                    # Python WebSocket Server
│   ├── src/                        # ✅ NEW: Source organization
│   │   ├── server/                 # Server core
│   │   │   ├── main.py             # Entry point (50 lines)
│   │   │   ├── websocket_server.py # WS handler (80 lines)
│   │   │   ├── message_router.py   # Message dispatcher (60 lines)
│   │   │   └── config.py           # Server config (40 lines)
│   │   │
│   │   ├── handlers/               # Message handlers (focused)
│   │   │   ├── llm_instruction.py  # LLM commands (40 lines)
│   │   │   ├── intelligence_update.py  # Intelligence processing (60 lines)
│   │   │   ├── capability.py       # Capability execution (30 lines)
│   │   │   └── navigation.py       # Nav commands (30 lines)
│   │   │
│   │   ├── artifacts/              # Artifact generation
│   │   │   ├── async_file_writer.py  # Non-blocking I/O (80 lines)
│   │   │   ├── page_jsonl.py       # page.jsonl writer (50 lines)
│   │   │   ├── content_jsonl.py    # content.jsonl writer (50 lines)
│   │   │   ├── llm_actions.py      # llm_actions.json writer (40 lines)
│   │   │   └── llm_prompt.py       # llm_prompt.md writer (40 lines)
│   │   │
│   │   ├── utils/                  # Shared utilities
│   │   │   ├── logger.py           # Structured logging (60 lines)
│   │   │   ├── deduplication.py    # O(n) dedup (40 lines)
│   │   │   ├── validation.py       # Message validation (80 lines)
│   │   │   └── types.py            # Type definitions (100 lines)
│   │   │
│   │   └── cli/                    # CLI client
│   │       ├── test_navigation.py  # Test harness (100 lines)
│   │       └── lock_manager.py     # Concurrency lock (40 lines)
│   │
│   ├── @site_structures/           # Generated artifacts (unchanged)
│   ├── env.py                      # Config + feature flags
│   └── requirements.txt
│
├── tests/                          # ✅ NEW: Comprehensive tests
│   ├── unit/
│   │   ├── test_scan_controller.js
│   │   ├── test_element_registry.js
│   │   ├── test_async_file_writer.py
│   │   └── test_deduplication.py
│   ├── integration/
│   │   ├── test_full_flow.py
│   │   └── test_message_routing.js
│   └── performance/
│       ├── benchmark_scan.js
│       └── benchmark_dedup.py
│
├── docs/                           # Documentation
│   ├── THIS_IS_HOW_IT_ALL_WORKS.md  # Current architecture (updated)
│   ├── SYSTEM_ARCHITECTURE_COMPLETE.md  # Historical reference
│   ├── Master_Refactoring_Roadmap_v2.md  # Implementation plan
│   └── FUTURE_SYSTEMS_ARCHITECTURE.md   # This file
│
└── .vscode/                        # ✅ NEW: Dev tooling
    ├── settings.json               # ESLint, Pylint configs
    └── launch.json                 # Debug configurations
```

---

## 2. Module Architecture Breakdown

### 2.1 Content Script Modules (`web_extension/src/content/`)

**Before:** 10,000 lines in single content.js
**After:** 8 focused modules (~1,000 lines total)

#### **main.js** - Entry Point (100 lines)
```javascript
/**
 * Content script entry point
 *
 * Responsibilities:
 * - Initialize all modules
 * - Set up global error handler
 * - Coordinate lifecycle
 */

import { logger } from '../common/logger.js';
import { ScanController } from './ScanController.js';
import { IntelligenceEngine } from './IntelligenceEngine.js';
import { PageMonitor } from './PageMonitor.js';
import { MessageHandler } from './MessageHandler.js';

async function init() {
  // Guard against duplicate injection
  if (window.omEWebLoaded) return;
  window.omEWebLoaded = true;

  logger.log('INFO', 'CONTENT_INIT', { url: window.location.href });

  // Initialize modules
  const engine = new IntelligenceEngine();
  const scanController = new ScanController(engine);
  const pageMonitor = new PageMonitor(scanController);
  const messageHandler = new MessageHandler(engine, scanController);

  // Set up event listeners
  document.addEventListener('DOMContentLoaded', () => {
    scanController.requestScan('DOMContentLoaded', 'high');
  });

  // Global error handler
  window.addEventListener('error', (e) => {
    logger.log('ERROR', 'UNCAUGHT_ERROR', { message: e.message });
  });

  logger.log('INFO', 'CONTENT_READY', {});
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
```

#### **ScanController.js** - Scan Coordination (150 lines)
```javascript
/**
 * Centralized scan coordination
 *
 * Single Responsibility: Deduplicate and prioritize scan requests
 *
 * Features:
 * - Debouncing (300ms window)
 * - Priority queue (high, normal, low)
 * - Navigation detection (resets counter)
 * - Scan lock (prevent overlaps)
 */

export class ScanController {
  /**
   * @param {IntelligenceEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
    this.scanInProgress = false;
    this.pendingScan = null;
    this.DEBOUNCE_MS = 300;
  }

  /**
   * Request a scan with automatic debouncing
   * @param {string} trigger - What triggered scan
   * @param {'high'|'normal'|'low'} priority
   */
  requestScan(trigger, priority = 'normal') {
    // Implementation from roadmap Phase 2
  }

  async executeScan(trigger) {
    // Implementation from roadmap Phase 2
  }

  isNavigationTrigger(trigger) {
    return ['DOMContentLoaded', 'navigation', 'urlChange'].includes(trigger);
  }
}
```

#### **IntelligenceEngine.js** - Element Registry (200 lines)
```javascript
/**
 * Element registry and intelligence generation
 *
 * Single Responsibility: Manage actionable elements
 *
 * Features:
 * - Element registration with dedup
 * - Action ID generation
 * - Intelligence data formatting
 * - Site config application
 */

export class IntelligenceEngine {
  constructor() {
    this.actionableElements = new Map(); // actionId → element data
    this.elementToActionId = new WeakMap(); // element → actionId
    this.registeredElements = new WeakSet(); // dedup tracking
    this.elementCounter = 0;
  }

  /**
   * Register element if not already tracked
   * @param {HTMLElement} element
   * @param {string} type - 'button', 'input', 'link', etc.
   * @returns {string} actionId
   */
  registerElement(element, type) {
    // Check for existing registration
    const existingId = this.elementToActionId.get(element);
    if (existingId) return existingId;

    const actionId = `a_id_${this.elementCounter++}`;
    this.actionableElements.set(actionId, { element, type });
    this.elementToActionId.set(element, actionId);
    this.registeredElements.add(element);

    return actionId;
  }

  /**
   * Scan DOM and register elements
   */
  async scanAndRegisterElements() {
    // Uses site config selectors
    // Registers all actionable elements
    // Returns intelligence data
  }

  /**
   * Generate intelligence update payload
   * @returns {object} Intelligence data for server
   */
  generateIntelligenceUpdate() {
    const actionableElements = [];
    for (const [actionId, data] of this.actionableElements) {
      actionableElements.push({
        actionId,
        type: data.type,
        selector: this.generateSelector(data.element),
        text: data.element.textContent?.trim(),
        // ... other metadata
      });
    }

    return {
      actionableElements,
      contentElements: this.extractContentElements(),
      pageState: { url: window.location.href, title: document.title }
    };
  }
}
```

#### **ActionExecutor.js** - Action Execution (180 lines)
```javascript
/**
 * Execute actions on DOM elements
 *
 * Single Responsibility: Perform clicks, setValue, navigate
 *
 * Features:
 * - Smart element resolution
 * - Visibility enforcement
 * - Multiple click strategies
 * - Error recovery
 */

export class ActionExecutor {
  /**
   * @param {IntelligenceEngine} engine
   */
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Execute action by ID
   * @param {string} actionId
   * @param {string} actionType - 'click', 'setValue', 'navigate'
   * @param {object} params - Action parameters
   * @returns {Promise<{ok: boolean, result?: any, error?: string}>}
   */
  async executeAction(actionId, actionType, params = {}) {
    const elementData = this.engine.actionableElements.get(actionId);
    if (!elementData) {
      return { ok: false, error: `Action ID not found: ${actionId}` };
    }

    const element = elementData.element;

    try {
      switch (actionType) {
        case 'click':
          return await this.executeClick(element);
        case 'setValue':
          return await this.executeSetValue(element, params.value);
        case 'navigate':
          return await this.executeNavigate(element);
        default:
          return { ok: false, error: `Unknown action type: ${actionType}` };
      }
    } catch (err) {
      logger.log('ERROR', 'ACTION_FAILED', {
        actionId,
        actionType,
        error: err.message
      });
      return { ok: false, error: err.message };
    }
  }

  /**
   * Execute click with multiple strategies
   * @private
   */
  async executeClick(element) {
    // Ensure visible
    this.ensureVisible(element);

    // Try strategies in order
    const strategies = [
      () => element.click(),
      () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })),
      () => {
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new MouseEvent('click', {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true
        }));
      }
    ];

    for (const strategy of strategies) {
      try {
        strategy();
        return { ok: true, result: { clicked: true } };
      } catch (err) {
        continue; // Try next strategy
      }
    }

    return { ok: false, error: 'All click strategies failed' };
  }

  /**
   * Ensure element is visible
   * @private
   */
  ensureVisible(element) {
    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Force visibility if needed
    if (window.getComputedStyle(element).display === 'none') {
      element.style.display = 'block';
    }
  }
}
```

#### **ElementRegistry.js** - ID Tracking (120 lines)
```javascript
/**
 * Element ID tracking and deduplication
 *
 * Single Responsibility: Ensure 1:1 element-to-ID mapping
 *
 * Uses WeakMap/WeakSet for automatic garbage collection
 */

export class ElementRegistry {
  constructor() {
    this.elementToId = new WeakMap();
    this.idToElement = new Map();
    this.registeredElements = new WeakSet();
    this.counter = 0;
  }

  /**
   * Register element or return existing ID
   * @param {HTMLElement} element
   * @returns {string} actionId
   */
  register(element) {
    const existingId = this.elementToId.get(element);
    if (existingId) return existingId;

    const actionId = `a_id_${this.counter++}`;
    this.elementToId.set(element, actionId);
    this.idToElement.set(actionId, new WeakRef(element));
    this.registeredElements.add(element);

    return actionId;
  }

  /**
   * Get element by ID
   * @param {string} actionId
   * @returns {HTMLElement|null}
   */
  getElement(actionId) {
    const ref = this.idToElement.get(actionId);
    return ref?.deref() || null;
  }

  /**
   * Reset counter (on navigation)
   */
  resetCounter() {
    this.counter = 0;
  }

  /**
   * Clear all registrations (on navigation)
   */
  clear() {
    this.idToElement.clear();
    // WeakMap/WeakSet clear themselves via GC
  }
}
```

#### **PageMonitor.js** - Page State Detection (100 lines)
```javascript
/**
 * Monitor page state (idle, mutations)
 *
 * Single Responsibility: Detect when page is ready to scan
 *
 * Features:
 * - Idle detection (network + DOM quiet)
 * - Mutation observation (debounced)
 * - Focus/visibility tracking
 */

export class PageMonitor {
  /**
   * @param {ScanController} scanController
   */
  constructor(scanController) {
    this.scanController = scanController;
    this.inflightRequests = 0;
    this.lastChangeTime = Date.now();
    this.QUIET_WINDOW_MS = 200;

    this.setupMonitoring();
  }

  setupMonitoring() {
    // Wrap fetch/XHR
    this.wrapNetworkAPIs();

    // MutationObserver
    const observer = new MutationObserver(() => {
      this.lastChangeTime = Date.now();
      this.scanController.requestScan('mutation', 'low');
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.scanController.requestScan('visibility', 'normal');
      }
    });
  }

  /**
   * Wait for page to be idle
   * @returns {Promise<void>}
   */
  async waitForIdle() {
    while (true) {
      const timeSinceChange = Date.now() - this.lastChangeTime;
      if (this.inflightRequests === 0 && timeSinceChange > this.QUIET_WINDOW_MS) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  wrapNetworkAPIs() {
    // Wrap fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      this.inflightRequests++;
      try {
        return await originalFetch(...args);
      } finally {
        this.inflightRequests--;
        this.lastChangeTime = Date.now();
      }
    };

    // Wrap XHR (similar pattern)
  }
}
```

#### **MessageHandler.js** - SW Communication (60 lines)
```javascript
/**
 * Handle messages from service worker
 *
 * Single Responsibility: Route SW messages to appropriate handlers
 */

export class MessageHandler {
  constructor(engine, scanController) {
    this.engine = engine;
    this.scanController = scanController;
    this.setupListeners();
  }

  setupListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender).then(sendResponse);
      return true; // Async response
    });
  }

  async handleMessage(message, sender) {
    const { type, data } = message;

    switch (type) {
      case 'execute_action':
        return await this.handleExecuteAction(data);
      case 'execute_capability':
        return await this.handleExecuteCapability(data);
      case 'start_intelligence_scan':
        this.scanController.requestScan('service_worker', 'high');
        return { ok: true };
      case 'site_configs_update':
        return this.handleConfigUpdate(data);
      default:
        logger.log('WARN', 'UNKNOWN_MESSAGE_TYPE', { type });
        return { ok: false, error: `Unknown message type: ${type}` };
    }
  }

  async handleExecuteAction(data) {
    const executor = new ActionExecutor(this.engine);
    return await executor.executeAction(data.actionId, data.actionType, data);
  }
}
```

---

### 2.2 Service Worker Modules (`web_extension/src/service-worker/`)

**Before:** 1,400 lines in single sw.js
**After:** 7 focused modules (~600 lines total)

#### **main.js** - Entry Point (80 lines)
```javascript
/**
 * Service worker entry point
 *
 * Responsibilities:
 * - Initialize modules
 * - Set up lifecycle hooks
 * - Coordinate keep-alive
 */

import { logger } from '../common/logger.js';
import { WebSocketClient } from './WebSocketClient.js';
import { NavigationCoordinator } from './NavigationCoordinator.js';
import { ContentScriptManager } from './ContentScriptManager.js';
import { TabStateManager } from './TabStateManager.js';
import { MessageRouter } from './MessageRouter.js';

// Initialize modules
const wsClient = new WebSocketClient();
const navCoordinator = new NavigationCoordinator();
const scriptManager = new ContentScriptManager();
const tabState = new TabStateManager();
const router = new MessageRouter(wsClient, scriptManager, tabState);

// Set up lifecycle
chrome.runtime.onInstalled.addListener(() => {
  logger.log('INFO', 'SW_INSTALLED', {});
  wsClient.connect();
});

chrome.runtime.onStartup.addListener(() => {
  logger.log('INFO', 'SW_STARTUP', {});
  wsClient.connect();
});

// Navigation events
chrome.webNavigation.onCompleted.addListener((details) => {
  navCoordinator.handleNavigation(details, 'onCompleted', scriptManager);
});

// Tab events
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.cleanup(tabId);
  scriptManager.cleanup(tabId);
});

// Keep-alive port
let keepAlivePort = null;
function ensureKeepAlive() {
  if (!keepAlivePort) {
    keepAlivePort = chrome.runtime.connect({ name: 'keepalive' });
    keepAlivePort.onDisconnect.addListener(() => {
      keepAlivePort = null;
      setTimeout(ensureKeepAlive, 1000);
    });
  }
}
ensureKeepAlive();
```

#### **WebSocketClient.js** - Server Connection (120 lines)
```javascript
/**
 * WebSocket client for server communication
 *
 * Single Responsibility: Manage WS connection lifecycle
 *
 * Features:
 * - Auto-reconnect
 * - Message queuing when disconnected
 * - Heartbeat/keep-alive
 */

export class WebSocketClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.messageQueue = [];
    this.reconnectDelay = 1000;
  }

  /**
   * Connect to server
   */
  async connect() {
    try {
      this.ws = new WebSocket('ws://127.0.0.1:17892');

      this.ws.onopen = () => {
        this.connected = true;
        logger.log('INFO', 'WS_CONNECTED', {});
        this.flushQueue();
      };

      this.ws.onclose = () => {
        this.connected = false;
        logger.log('WARN', 'WS_DISCONNECTED', {});
        setTimeout(() => this.connect(), this.reconnectDelay);
      };

      this.ws.onerror = (err) => {
        logger.log('ERROR', 'WS_ERROR', { error: err.message });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

    } catch (err) {
      logger.log('ERROR', 'WS_CONNECT_FAILED', { error: err.message });
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  }

  /**
   * Send message (queues if disconnected)
   */
  send(message) {
    if (this.connected) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
      logger.log('WARN', 'WS_MESSAGE_QUEUED', { queueSize: this.messageQueue.length });
    }
  }

  /**
   * Flush queued messages
   * @private
   */
  flushQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  /**
   * Handle incoming message
   * @private
   */
  handleMessage(message) {
    // Dispatch to MessageRouter
    chrome.runtime.sendMessage({ type: 'ws_message', data: message });
  }
}
```

#### **NavigationCoordinator.js** - Nav Dedup (100 lines)
```javascript
/**
 * Navigation event coordination
 *
 * Single Responsibility: Deduplicate navigation events
 *
 * Consolidates:
 * - webNavigation.onCompleted
 * - webNavigation.onHistoryStateUpdated
 * - tabs.onUpdated
 */

export class NavigationCoordinator {
  constructor() {
    this.handledNavigations = new Map(); // tabId_url → timestamp
    this.DEBOUNCE_MS = 500;
  }

  /**
   * Handle navigation event (all types)
   */
  async handleNavigation(details, trigger, scriptManager) {
    if (details.frameId !== 0) return; // Main frame only

    const key = `${details.tabId}_${details.url}`;
    const lastProcessed = this.handledNavigations.get(key);
    const now = Date.now();

    // Deduplicate
    if (lastProcessed && (now - lastProcessed) < this.DEBOUNCE_MS) {
      logger.log('INFO', 'NAV_DEDUPED', { trigger, url: details.url });
      return;
    }

    this.handledNavigations.set(key, now);
    logger.log('INFO', 'NAV_PROCESSING', { trigger, url: details.url });

    // Inject content script
    await scriptManager.ensureInjected(details.tabId);

    // Cleanup old entries
    if (this.handledNavigations.size > 100) {
      const oldest = this.handledNavigations.keys().next().value;
      this.handledNavigations.delete(oldest);
    }
  }
}
```

#### **ContentScriptManager.js** - Injection Tracking (80 lines)
```javascript
/**
 * Content script injection management
 *
 * Single Responsibility: Ensure 1 content script per tab
 */

export class ContentScriptManager {
  constructor() {
    this.injectedTabs = new Set();
  }

  /**
   * Ensure content script is injected
   */
  async ensureInjected(tabId, force = false) {
    if (!force && this.injectedTabs.has(tabId)) {
      logger.log('DEBUG', 'INJECTION_SKIPPED', { tabId });
      return true;
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'src/common/env.js',
          'src/common/logger.js',
          'src/content/main.js'
        ]
      });

      this.injectedTabs.add(tabId);
      logger.log('INFO', 'CONTENT_INJECTED', { tabId });
      return true;

    } catch (err) {
      logger.log('ERROR', 'INJECTION_FAILED', { tabId, error: err.message });
      return false;
    }
  }

  /**
   * Clean up tab tracking
   */
  cleanup(tabId) {
    this.injectedTabs.delete(tabId);
  }
}
```

#### **TabStateManager.js** - Per-Tab State (100 lines)
```javascript
/**
 * Per-tab state management
 *
 * Single Responsibility: Track tab-specific state
 *
 * Replaces global actionInProgress flag
 */

export class TabStateManager {
  constructor() {
    this.tabStates = new Map(); // tabId → state
  }

  /**
   * Get or create tab state
   */
  getState(tabId) {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        actionInProgress: false,
        lastUrl: null,
        lastScanAt: null,
        scanInProgress: false
      });
    }
    return this.tabStates.get(tabId);
  }

  /**
   * Check if action in progress for tab
   */
  isActionInProgress(tabId) {
    return this.getState(tabId).actionInProgress;
  }

  /**
   * Set action lock for tab
   */
  setActionInProgress(tabId, inProgress) {
    this.getState(tabId).actionInProgress = inProgress;
    logger.log('INFO', inProgress ? 'ACTION_LOCK_ACQUIRED' : 'ACTION_LOCK_RELEASED', { tabId });
  }

  /**
   * Clean up tab state
   */
  cleanup(tabId) {
    this.tabStates.delete(tabId);
    logger.log('INFO', 'TAB_STATE_CLEANUP', { tabId });
  }
}
```

#### **MessageRouter.js** - Message Routing (90 lines)
```javascript
/**
 * Route messages between server and content scripts
 *
 * Single Responsibility: Message dispatch
 */

export class MessageRouter {
  constructor(wsClient, scriptManager, tabState) {
    this.wsClient = wsClient;
    this.scriptManager = scriptManager;
    this.tabState = tabState;
    this.setupListeners();
  }

  setupListeners() {
    // From server
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'ws_message') {
        this.handleServerMessage(message.data).then(sendResponse);
        return true;
      }
    });

    // From content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'intelligence_update') {
        this.handleIntelligenceUpdate(message, sender).then(sendResponse);
        return true;
      }
    });
  }

  /**
   * Handle message from server
   */
  async handleServerMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'execute_llm_action':
        return await this.forwardToContentScript(data);
      case 'execute_capability':
        return await this.forwardToContentScript(data);
      default:
        logger.log('WARN', 'UNKNOWN_SERVER_MESSAGE', { type });
    }
  }

  /**
   * Forward message to active tab's content script
   */
  async forwardToContentScript(message) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      return { ok: false, error: 'No active tab' };
    }

    const tabId = tabs[0].id;

    // Check action lock
    if (this.tabState.isActionInProgress(tabId)) {
      return { ok: false, error: 'Action in progress for this tab' };
    }

    this.tabState.setActionInProgress(tabId, true);
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } finally {
      this.tabState.setActionInProgress(tabId, false);
    }
  }

  /**
   * Handle intelligence update from content script
   */
  async handleIntelligenceUpdate(message, sender) {
    // Forward to server
    this.wsClient.send({
      type: 'intelligence_update',
      tabId: sender.tab.id,
      tabUrl: sender.tab.url,
      tabTitle: sender.tab.title,
      data: message.data
    });

    return { ok: true };
  }
}
```

---

### 2.3 Server Modules (`om_e_web_ws/src/`)

**Before:** 2,500 lines across 2 files (ws_server.py, test_navigation.py)
**After:** 15 focused modules (~800 lines total)

#### **server/websocket_server.py** - WS Handler (80 lines)
```python
"""
WebSocket server main handler

Single Responsibility: Accept connections, delegate to router
"""

import asyncio
import websockets
from ..utils.logger import logger
from .message_router import MessageRouter
from ..artifacts.async_file_writer import file_writer

class WebSocketServer:
    def __init__(self, host='127.0.0.1', port=17892):
        self.host = host
        self.port = port
        self.clients = set()
        self.extension_ws = None
        self.router = MessageRouter(self)

    async def handler(self, websocket, path):
        """Main WebSocket handler - focused and clean"""
        client_id = str(id(websocket))
        self.clients.add(websocket)
        logger.log('INFO', 'CLIENT_CONNECTED', {'client_id': client_id})

        try:
            async for message in websocket:
                # Parse
                try:
                    data = json.loads(message)
                except json.JSONDecodeError as e:
                    await websocket.send(json.dumps({
                        'error': 'Invalid JSON',
                        'details': str(e)
                    }))
                    continue

                # Route to handler
                response = await self.router.route(data, websocket)
                if response:
                    await websocket.send(json.dumps(response))

        except websockets.exceptions.ConnectionClosed:
            logger.log('INFO', 'CLIENT_DISCONNECTED', {'client_id': client_id})
        finally:
            self.clients.remove(websocket)

    async def start(self):
        """Start server"""
        await file_writer.start()
        logger.log('INFO', 'SERVER_STARTING', {
            'host': self.host,
            'port': self.port
        })

        async with websockets.serve(self.handler, self.host, self.port):
            await asyncio.Future()  # Run forever

    async def stop(self):
        """Graceful shutdown"""
        await file_writer.stop()
        logger.log('INFO', 'SERVER_STOPPED', {})
```

#### **server/message_router.py** - Message Dispatcher (60 lines)
```python
"""
Route messages to appropriate handlers

Single Responsibility: Message type → handler mapping
"""

from ..handlers import (
    llm_instruction,
    intelligence_update,
    capability,
    navigation
)
from ..utils.validation import validate_message

class MessageRouter:
    def __init__(self, server):
        self.server = server

        # Message type → handler mapping
        self.handlers = {
            'llm_instruction': llm_instruction.handle,
            'intelligence_update': intelligence_update.handle,
            'execute_capability': capability.handle,
            'navigate': navigation.handle,
            'click': navigation.handle,
            'set_value': navigation.handle,
        }

    async def route(self, message: dict, websocket) -> dict:
        """Route message to handler"""

        # Validate
        is_valid, error_msg = validate_message(message)
        if not is_valid:
            return {'error': error_msg}

        # Get handler
        msg_type = message.get('type')
        handler = self.handlers.get(msg_type)

        if not handler:
            logger.log('WARN', 'NO_HANDLER', {'type': msg_type})
            return {'error': f'No handler for type: {msg_type}'}

        # Execute handler
        try:
            return await handler(message, websocket, self.server)
        except Exception as e:
            logger.log('ERROR', 'HANDLER_EXCEPTION', {
                'type': msg_type,
                'error': str(e)
            })
            return {'error': f'Handler error: {str(e)}'}
```

#### **handlers/llm_instruction.py** - LLM Commands (40 lines)
```python
"""
Handle LLM instruction messages

Single Responsibility: Forward LLM commands to extension
"""

from ..utils.logger import logger

async def handle(message: dict, websocket, server) -> dict:
    """Handle llm_instruction"""

    if not server.extension_ws:
        return {'error': 'Extension not connected'}

    action_data = message.get('data', {})

    logger.log('INFO', 'LLM_INSTRUCTION', {
        'actionId': action_data.get('actionId'),
        'actionType': action_data.get('actionType')
    })

    # Forward to extension
    await server.extension_ws.send(json.dumps({
        'type': 'execute_llm_action',
        'data': action_data
    }))

    return {'success': True}
```

#### **handlers/intelligence_update.py** - Intelligence Processing (60 lines)
```python
"""
Handle intelligence update from extension

Single Responsibility: Process intelligence, queue artifacts
"""

from ..utils.logger import logger
from ..artifacts import (
    page_jsonl,
    content_jsonl,
    llm_actions,
    llm_prompt
)
import asyncio

async def handle(message: dict, websocket, server) -> dict:
    """Handle intelligence_update"""

    tab_id = message.get('tabId')
    element_count = len(message.get('data', {}).get('actionableElements', []))

    logger.intelligence_update_start(tab_id, message.get('tabUrl'), element_count)

    # Queue async artifact generation (non-blocking)
    asyncio.create_task(process_artifacts(message))

    return {'success': True}

async def process_artifacts(message: dict):
    """Background task for artifact generation"""

    try:
        data = message.get('data', {})

        # Write artifacts in parallel
        await asyncio.gather(
            page_jsonl.write(data),
            content_jsonl.write(data.get('contentElements', [])),
            llm_actions.write(data.get('actionableElements', [])),
            llm_prompt.write(data)
        )

        logger.log('INFO', 'ARTIFACTS_WRITTEN', {
            'files': ['page.jsonl', 'content.jsonl', 'llm_actions.json', 'llm_prompt.md']
        })

    except Exception as e:
        logger.log('ERROR', 'ARTIFACT_GENERATION_FAILED', {'error': str(e)})
```

#### **artifacts/async_file_writer.py** - Non-Blocking I/O (80 lines)
```python
"""
Async file writer with background worker

Single Responsibility: Non-blocking file I/O

Reduces handler latency from 100-500ms → <5ms
"""

import asyncio
from pathlib import Path
from typing import Dict, Any
import json
from ..utils.logger import logger

class AsyncFileWriter:
    def __init__(self, base_dir: str = '@site_structures'):
        self.base_dir = Path(base_dir)
        self.write_queue = asyncio.Queue(maxsize=1000)
        self.worker_task = None

    async def start(self):
        """Start background worker"""
        self.worker_task = asyncio.create_task(self._writer_worker())
        logger.log('INFO', 'ASYNC_WRITER_STARTED', {})

    async def stop(self):
        """Graceful shutdown"""
        await self.write_queue.put(None)  # Sentinel
        if self.worker_task:
            await self.worker_task

    async def _writer_worker(self):
        """Background worker"""
        while True:
            item = await self.write_queue.get()
            if item is None:
                break

            file_path, content, mode = item

            # Actual I/O in executor (non-blocking)
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._write_file, file_path, content, mode)

    def _write_file(self, file_path, content, mode):
        """Synchronous write (runs in executor)"""
        full_path = self.base_dir / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, mode, encoding='utf-8') as f:
            f.write(content)

    async def write(self, file_path: str, content: str, mode: str = 'w'):
        """Queue write (non-blocking)"""
        await self.write_queue.put((file_path, content, mode))

    async def write_jsonl(self, file_path: str, records: list):
        """Write JSONL"""
        lines = [json.dumps(r, ensure_ascii=False) for r in records]
        content = '\n'.join(lines) + '\n'
        await self.write(file_path, content)

# Global instance
file_writer = AsyncFileWriter()
```

#### **utils/deduplication.py** - O(n) Dedup (40 lines)
```python
"""
O(n) hash-based deduplication

Single Responsibility: Remove duplicate elements

Replaces O(n²) nested loop implementation
"""

from typing import List, Dict, Any

def deduplicate_actions(actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    O(n) deduplication using hash set

    Performance: 6k elements in ~50ms (was 10+ seconds)
    """
    seen = set()
    unique = []

    for action in actions:
        selector = action.get('selector')
        if not selector:
            continue

        # Hash key: selector + type + label
        key = f"{selector}|{action.get('type', '')}|{action.get('label', '')}"

        if key not in seen:
            seen.add(key)
            unique.append(action)

    return unique
```

---

## 3. Code Patterns & Best Practices

### 3.1 JavaScript (Extension) Patterns

#### **Module Pattern**
```javascript
// ✅ GOOD: ES6 modules with clear exports
export class ScanController {
  constructor(engine) {
    this.engine = engine;
  }
}

// ❌ BAD: Global namespace pollution
window.ScanController = class { ... };
```

#### **Dependency Injection**
```javascript
// ✅ GOOD: Inject dependencies
class ActionExecutor {
  constructor(engine) {
    this.engine = engine; // Injected
  }
}

// ❌ BAD: Hard-coded dependencies
class ActionExecutor {
  constructor() {
    this.engine = window.intelligenceEngine; // Global coupling
  }
}
```

#### **Type Safety (JSDoc)**
```javascript
/**
 * Execute action by ID
 * @param {string} actionId - Action ID (e.g., "a_id_0")
 * @param {'click'|'setValue'|'navigate'} actionType
 * @param {object} params - Action parameters
 * @param {string} [params.value] - Value for setValue action
 * @returns {Promise<{ok: boolean, result?: any, error?: string}>}
 */
async executeAction(actionId, actionType, params = {}) {
  // TypeScript-like safety in vanilla JS
}
```

#### **Error Boundaries**
```javascript
// ✅ GOOD: Wrap critical operations
async executeAction(actionId, actionType, params) {
  try {
    const result = await this._executeUnsafe(actionId, actionType, params);
    return { ok: true, result };
  } catch (err) {
    logger.log('ERROR', 'ACTION_FAILED', {
      actionId,
      error: err.message,
      stack: err.stack
    });
    return { ok: false, error: err.message };
  }
}

// ❌ BAD: Let errors bubble silently
async executeAction(actionId, actionType, params) {
  // Might throw, caller has to handle
}
```

#### **Event-Driven > Timers**
```javascript
// ✅ GOOD: Event-driven with debouncing
class PageMonitor {
  setupMonitoring() {
    const observer = new MutationObserver(() => {
      this.lastChangeTime = Date.now();
      this.scanController.requestScan('mutation', 'low'); // Debounced internally
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// ❌ BAD: Polling with timers
setInterval(() => {
  if (pageChanged()) {
    scanAndRegisterElements();
  }
}, 1000);
```

---

### 3.2 Python (Server) Patterns

#### **Type Hints**
```python
# ✅ GOOD: Full type hints
async def handle(message: dict, websocket: WebSocket, server: WebSocketServer) -> dict:
    """Handle message with type safety"""
    action_data: dict = message.get('data', {})
    return {'success': True}

# ❌ BAD: No types
async def handle(message, websocket, server):
    action_data = message.get('data', {})
    return {'success': True}
```

#### **Async I/O**
```python
# ✅ GOOD: Non-blocking I/O
async def write_artifact(data: dict):
    await file_writer.write_jsonl('page.jsonl', data)  # Queued, returns immediately

# ❌ BAD: Blocking I/O
async def write_artifact(data: dict):
    with open('page.jsonl', 'w') as f:  # Blocks entire event loop
        f.write(json.dumps(data))
```

#### **Focused Handlers**
```python
# ✅ GOOD: Single responsibility, <50 lines
async def handle_llm_instruction(message: dict, websocket, server) -> dict:
    """Handle LLM instruction - focused and testable"""
    if not server.extension_ws:
        return {'error': 'Extension not connected'}

    await server.extension_ws.send(json.dumps(message))
    return {'success': True}

# ❌ BAD: Monolithic handler, 800+ lines
async def handler(websocket, path):
    # 800 lines of nested if/elif/else
    # Handles all message types
    # Unmaintainable
```

#### **Validation Layer**
```python
# ✅ GOOD: Explicit validation
from ..utils.validation import validate_message

async def route(self, message: dict, websocket) -> dict:
    is_valid, error_msg = validate_message(message)
    if not is_valid:
        return {'error': error_msg}
    # ... process

# ❌ BAD: Assume valid input
async def route(self, message: dict, websocket) -> dict:
    # Crashes on malformed input
    handler = self.handlers[message['type']]  # KeyError if missing
```

---

## 4. Migration Path (How to Get There)

### Phase-by-Phase Module Extraction

**Phase 1: Stop the Bleeding**
- No new modules yet
- Fix bugs in existing monolithic files
- Add feature flags to existing code

**Phase 2: Extract Core Modules**
```bash
# Week 2: Create first modules
web_extension/src/content/ScanController.js      # NEW
web_extension/src/content/main.js                # NEW (minimal entry point)
web_extension/content.js                         # OLD (still works via feature flag)
```

**Phase 3: Server Refactor**
```bash
# Week 3: Extract server modules
om_e_web_ws/src/server/websocket_server.py       # NEW
om_e_web_ws/src/server/message_router.py         # NEW
om_e_web_ws/src/handlers/llm_instruction.py      # NEW
om_e_web_ws/ws_server.py                         # OLD (still works via feature flag)
```

**Phase 4-6: Incremental Extraction**
- Extract one module at a time
- Run both old and new code paths in parallel
- Feature flag controls which path is active
- Validate each module independently

**Phase 7: Delete Legacy Code**
```bash
# After all modules validated
rm web_extension/content.js        # Delete 10,000-line monolith
rm web_extension/sw.js              # Delete 1,400-line monolith
rm om_e_web_ws/ws_server.py         # Delete 2,500-line monolith
# Keep only modular code
```

---

## 5. Code Reduction Targets

### Elimination Through DRY Principle

**Current Duplication (7 instances):**
```javascript
// Duplicate #1: generateSelector (content.js line 3000, line 5000, line 7000)
// Duplicate #2: isElementVisible (content.js line 2000, line 4000, sw.js line 500)
// Duplicate #3: getElementCoordinates (content.js line 1500, line 3500)
// ... 4 more duplicates
```

**After DRY:**
```javascript
// web_extension/src/common/dom-utils.js
export function generateSelector(element) {
  // Single implementation, imported everywhere
}

export function isElementVisible(element) {
  // Single implementation
}

// Imported by all modules that need it
import { generateSelector, isElementVisible } from '../common/dom-utils.js';
```

**Lines Saved:** ~2,000 lines (duplicate code elimination)

### Focused Functions

**Before:**
```javascript
// buildNormalizedPageRecords() - 429 lines
// Single function doing 7 different things
```

**After:**
```javascript
// 7 focused functions, ~50 lines each
function extractPageMeta() { ... }           // 40 lines
function extractSections() { ... }           // 60 lines
function extractActionables() { ... }        // 50 lines
function extractContent() { ... }            // 45 lines
function normalizeRecord() { ... }           // 30 lines
function addMetadata() { ... }               // 35 lines
function buildPageRecord() { ... }           // 40 lines
// Total: 300 lines (30% reduction + testable)
```

**Lines Saved:** ~3,000 lines (function decomposition + clarity)

### Module Extraction

**Before:**
```javascript
// content.js: 10,000 lines
// - Scanning logic: 2,000 lines
// - Execution logic: 1,500 lines
// - Monitoring logic: 1,200 lines
// - Message handling: 800 lines
// - Utilities: 1,000 lines
// - Duplicate code: 2,000 lines
// - Obsolete code: 1,500 lines
```

**After:**
```javascript
// ScanController.js: 150 lines (focused)
// ActionExecutor.js: 180 lines (focused)
// PageMonitor.js: 100 lines (focused)
// MessageHandler.js: 60 lines (focused)
// dom-utils.js: 80 lines (shared, no duplication)
// Total: 570 lines (clean, tested)
```

**Lines Saved:** 9,430 lines (94% reduction in content.js)

---

## 6. Testing Strategy

### Unit Tests (New in Future Architecture)

**Coverage Target:** 100% of critical paths

```javascript
// tests/unit/test_scan_controller.js
import { ScanController } from '../web_extension/src/content/ScanController.js';

describe('ScanController', () => {
  test('debounces rapid scan requests', async () => {
    const mockEngine = { scanAndRegisterElements: jest.fn() };
    const controller = new ScanController(mockEngine);

    // Request 5 scans in 100ms
    controller.requestScan('test1', 'normal');
    controller.requestScan('test2', 'normal');
    controller.requestScan('test3', 'normal');

    await sleep(400); // Wait for debounce + execution

    // Should only execute 1 scan
    expect(mockEngine.scanAndRegisterElements).toHaveBeenCalledTimes(1);
  });

  test('high priority bypasses debounce', async () => {
    const mockEngine = { scanAndRegisterElements: jest.fn() };
    const controller = new ScanController(mockEngine);

    controller.requestScan('urgent', 'high');

    // Should execute immediately
    expect(controller.scanInProgress).toBe(true);
  });
});
```

**Test Coverage:**
- ScanController: 100%
- ActionExecutor: 100%
- ElementRegistry: 100%
- AsyncFileWriter: 100%
- Deduplication: 100%

### Integration Tests

```python
# tests/integration/test_full_flow.py
async def test_click_action_end_to_end():
    """Test full flow: CLI → Server → Extension → DOM"""

    # Start server
    server = WebSocketServer()
    await server.start()

    # Connect test client
    async with websockets.connect('ws://127.0.0.1:17892') as ws:
        # Send click command
        await ws.send(json.dumps({
            'type': 'llm_instruction',
            'data': {
                'actionId': 'a_id_0',
                'actionType': 'click'
            }
        }))

        # Wait for response
        response = json.loads(await ws.recv())

        # Verify success
        assert response['ok'] == True
        assert response['result']['clicked'] == True
```

---

## 7. Developer Experience Improvements

### VSCode Configuration

**`.vscode/settings.json`**
```json
{
  "editor.formatOnSave": true,
  "javascript.suggest.autoImports": true,
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "files.exclude": {
    "**/__pycache__": true,
    "**/node_modules": true
  },
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  }
}
```

### Pre-commit Hooks

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Lint JavaScript
npx eslint web_extension/src/**/*.js

# Lint Python
pylint om_e_web_ws/src/**/*.py

# Run unit tests
npm test
python -m pytest tests/unit/
```

### Documentation

```javascript
/**
 * Execute action by ID
 *
 * @example
 * const executor = new ActionExecutor(engine);
 * const result = await executor.executeAction('a_id_0', 'click');
 * if (result.ok) {
 *   console.log('Clicked successfully');
 * }
 *
 * @param {string} actionId - Element action ID
 * @param {'click'|'setValue'|'navigate'} actionType
 * @param {object} [params={}] - Optional parameters
 * @returns {Promise<ActionResult>}
 * @throws {Error} If action type unknown
 */
async executeAction(actionId, actionType, params = {}) { ... }
```

---

## 8. Performance Targets (After Refactor)

| Operation | Current | Target | How Achieved |
|-----------|---------|--------|--------------|
| **Code Size** |
| Total LOC | 15,000 | 7,500 | Module extraction + DRY |
| Largest function | 800 lines | <50 lines | Function decomposition |
| **Runtime Performance** |
| Scan latency | 500-2000ms | <400ms | ScanController dedup |
| Server handler latency | 100-500ms | <10ms | AsyncFileWriter |
| Dedup (6k elements) | 10+ seconds | <100ms | O(n) hash-based |
| **Maintainability** |
| Cyclomatic complexity | 300+ | <10 | Focused functions |
| Code duplication | 7 instances | 0 | Shared utils |
| Type coverage | 0% | 100% | JSDoc + Python hints |
| Test coverage | 0% | >80% | Unit + integration tests |

---

## 9. Success Criteria

### Quantitative Metrics
- [ ] 50% code reduction (15,000 → 7,500 LOC)
- [ ] 100% type coverage (JSDoc + Python)
- [ ] >80% test coverage
- [ ] Zero functions >100 lines
- [ ] Zero code duplication
- [ ] <10ms server handler latency
- [ ] <400ms scan latency
- [ ] <100ms dedup time (6k elements)

### Qualitative Improvements
- [ ] Clear module boundaries (SRP)
- [ ] Dependency injection (testable)
- [ ] Event-driven architecture (no polling)
- [ ] Comprehensive error handling
- [ ] Developer-friendly (VSCode + pre-commit)
- [ ] Self-documenting code (JSDoc examples)
- [ ] Easy onboarding (README per module)

---

## 10. Final Vision: The Clean Stack

**After completion, the system will:**

✅ **Be 50% smaller** - Same functionality, half the code
✅ **Be fully typed** - JSDoc + Python hints catch errors early
✅ **Be fully tested** - >80% coverage prevents regressions
✅ **Be modular** - Each module <200 lines, single responsibility
✅ **Be DRY** - Zero code duplication
✅ **Be fast** - <10ms server latency, <400ms scans
✅ **Be maintainable** - New devs understand it in hours, not weeks
✅ **Be production-ready** - Error handling, logging, monitoring
✅ **Be future-proof** - Easy to extend without touching core

**The soup becomes soup-er clean code.** 🚀

---

## Next Steps

1. **Review this architecture** - Confirm vision aligns with goals
2. **Execute Master_Refactoring_Roadmap_v2.md** - Phase-by-phase extraction
3. **Validate each module** - Unit tests + integration tests
4. **Delete legacy code** - After Phase 7 validation
5. **Ship production-grade system** - Same features, 50% less code

Let's build the future! 🔥
