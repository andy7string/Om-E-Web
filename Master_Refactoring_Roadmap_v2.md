# MASTER REFACTORING ROADMAP v2: Om-E-Web System Transformation

> **Version:** 2.0
> **Based On:** Master_Refactoring_Roadmap.md + ROADMAP_IMPROVEMENTS.md + SYSTEM_ARCHITECTURE_COMPLETE.md
> **Last Updated:** 2025-11-18
> **Change Summary:** Added Phase 0 baseline, config centralization, hard invariant gates, performance budgets, and comprehensive trigger mapping

## Executive Summary

**Current State:** System has **5 critical bugs** causing:
- **Issue #1:** 8 overlapping scan triggers → duplicate action IDs (3-10x inflation)
- **Issue #2:** Blocking synchronous I/O → 100-500ms server freezes
- **Issue #3:** O(n²) deduplication → 10+ seconds for 6k elements
- **Issue #4:** Global action lock → multi-tab workflows broken
- **Issue #5:** 800-line functions → unmaintainable code

**End Goal:** Production-grade architecture with:
- Zero action ID inflation (hard invariant)
- Event-driven scan coordination with ScanController
- O(n) performance with async I/O
- Non-blocking server (<10ms response time)
- Comprehensive error handling and test coverage
- Multi-tab resilience with per-tab state
- Performance budgets enforced at each phase gate

**Timeline:** 8 weeks (6 phases + 2-week buffer for invariant fixes)
**Risk:** Controlled - each phase has rollback plan, feature flags, and automated validation gates

---

## Baseline Performance Metrics

**Current System Performance (from SYSTEM_ARCHITECTURE_COMPLETE.md):**

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Action ID inflation | +200% after 3 navigations | 0% after 10 navigations | 100% reduction |
| Scan frequency | 8 triggers per navigation | 1-2 per navigation | 75-87% reduction |
| Server latency (small page) | 100-200ms | <10ms | 10-20x faster |
| Server latency (large page) | 500-1000ms | <10ms | 50-100x faster |
| Dedup time (6k elements) | 10+ seconds | <100ms | 100x faster |
| Site map processing | 5-30 seconds (blocking) | <1s (non-blocking) | 30x faster |
| Server responsiveness during update | 0% (blocked) | 100% (async) | ∞ improvement |
| Multi-tab action support | Broken (global lock) | Independent per-tab | Bug fix |

---

## Complete Scan Trigger Inventory

**All 8 Overlapping Triggers (from SYSTEM_ARCHITECTURE_COMPLETE.md Section 3):**

| # | Component | Location | Event | Function | Frequency | Deduped? | Phase Fix |
|---|-----------|----------|-------|----------|-----------|----------|-----------|
| **1** | sw.js | Line 1255 | webNavigation.onCompleted | triggerIntelligenceScan() | Page load finish | ✅ By URL | Phase 2 |
| **2** | sw.js | Line 1264 | webNavigation.onHistoryStateUpdated | triggerIntelligenceScan() | SPA route change | ✅ By URL | Phase 2 |
| **3** | sw.js | Line 1282 | tabs.onUpdated (complete) | triggerIntelligenceScan() | Load complete | ✅ By URL | Phase 2 |
| **4** | content.js | Line 244 | setTimeout (4s) | scheduleInitialScan() | Fallback timer | ❌ None | Phase 2 (**REMOVE**) |
| **5** | content.js | Line 1634 | DOMContentLoaded | initializeIntelligenceSystem() | Page load | ❌ None | Phase 2 |
| **6** | content.js | Line 170 | pageIdleMonitor.waitForIdle() | runScanAfterPageLoad() | Page idle | ❌ None | Phase 2 |
| **7** | content.js | Line 7145 | setupEventDrivenUpdates() | queueIntelligenceUpdate() | Visibility/focus | ❌ None | Phase 2 |
| **8** | content.js | Line 3878 | analyzeStructureChanges() | registerInteractiveSubtree() | DOM mutations | ❌ None | **Phase 1** |

**Trigger Routing Plan (Post-Refactor):**

```
Service Worker (3 triggers) → NavigationCoordinator → ContentScriptManager
   ├─ onCompleted         ─┐
   ├─ onHistoryStateUpdated├─→ Dedup (500ms window) → ensureInjected(tabId) → content script
   └─ tabs.onUpdated      ─┘

Content Script (5 triggers) → ScanController
   ├─ DOMContentLoaded      → requestScan('DOMContentLoaded', 'high')
   ├─ pageIdle              → requestScan('pageIdle', 'high')
   ├─ mutation              → requestScan('mutation', 'low')  [debounced 300ms]
   ├─ visibility/focus      → requestScan('focus', 'normal')
   └─ 4s fallback timer     → **DELETE** (event-driven replacement)
```

---

# PHASE 0: BASELINE & INSTRUMENTATION (Week 0, Days 1-3)

**Goal:** Establish measurement infrastructure and baseline metrics **before** any behavioral changes

**Duration:** 2-3 days
**Risk:** Low (additive only, no behavioral changes)

## 0.1 Add Structured Logging Infrastructure

**Resolves:** Observability gap (enables measurement of all subsequent phases)

### Implementation

**File:** `web_extension/logger.js` (NEW FILE)

```javascript
/**
 * Structured logging with correlation IDs for tracking events across components
 */

class OMELogger {
  constructor(component) {
    this.component = component;
    this.sessionId = this.generateId();
  }

  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  log(level, event, data = {}) {
    const timestamp = Date.now();
    const logEntry = {
      timestamp,
      level,
      component: this.component,
      sessionId: this.sessionId,
      event,
      ...data
    };

    const prefix = `[${this.component}]`;
    const message = `${event}: ${JSON.stringify(data)}`;

    if (level === 'ERROR') {
      console.error(prefix, message, logEntry);
    } else if (level === 'WARN') {
      console.warn(prefix, message, logEntry);
    } else {
      console.log(prefix, message, logEntry);
    }

    // Store in ring buffer (last 100 events)
    if (!window.omeLogs) window.omeLogs = [];
    window.omeLogs.push(logEntry);
    if (window.omeLogs.length > 100) window.omeLogs.shift();
  }

  scanStart(scanId, trigger, tabId) {
    this.log('INFO', 'SCAN_START', { scanId, trigger, tabId, url: window.location.href });
  }

  scanComplete(scanId, duration, elementCount) {
    this.log('INFO', 'SCAN_COMPLETE', { scanId, duration, elementCount });
  }

  duplicateDetected(actionId, element, existingId) {
    this.log('WARN', 'DUPLICATE_ACTION_ID', { actionId, element, existingId });
  }

  invariantViolation(invariant, details) {
    this.log('ERROR', 'INVARIANT_VIOLATION', { invariant, details });
  }
}

// Export for content.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OMELogger;
}
```

**File:** `om_e_web_ws/logger.py` (NEW FILE)

```python
"""
Structured logging for WebSocket server with correlation IDs
"""

import logging
import json
import time
from typing import Dict, Any

class OMELogger:
    def __init__(self, component: str):
        self.component = component
        self.session_id = f"{int(time.time())}_{id(self)}"
        self.logger = logging.getLogger(component)

        # Configure structured output
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            f'[{component}] %(levelname)s: %(message)s'
        )
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    def log(self, level: str, event: str, data: Dict[str, Any] = None):
        log_entry = {
            'timestamp': time.time(),
            'level': level,
            'component': self.component,
            'session_id': self.session_id,
            'event': event,
            **(data or {})
        }

        message = f"{event}: {json.dumps(data or {})}"

        if level == 'ERROR':
            self.logger.error(message)
        elif level == 'WARN':
            self.logger.warning(message)
        else:
            self.logger.info(message)

    def intelligence_update_start(self, tabId: int, url: str, element_count: int):
        self.log('INFO', 'INTELLIGENCE_UPDATE_START', {
            'tabId': tabId,
            'url': url,
            'element_count': element_count
        })

    def intelligence_update_complete(self, duration_ms: float, files_written: list):
        self.log('INFO', 'INTELLIGENCE_UPDATE_COMPLETE', {
            'duration_ms': duration_ms,
            'files_written': files_written
        })

    def blocking_io_detected(self, operation: str, duration_ms: float):
        self.log('WARN', 'BLOCKING_IO', {
            'operation': operation,
            'duration_ms': duration_ms
        })

# Global instance
logger = OMELogger('ws_server')
```

### Integration

**File:** `web_extension/content.js` - Add to top of file

```javascript
// ✅ Load logger
const logger = new OMELogger('content');

// ✅ Add invariant dashboard (logs summary every 10s)
setInterval(() => {
  if (window.intelligenceEngine) {
    logger.log('INFO', 'INVARIANT_DASHBOARD', {
      elementCounter: intelligenceEngine.elementCounter,
      actionableElements: intelligenceEngine.actionableElements.size,
      scanInProgress: intelligenceEngine.scanInProgress,
      registeredElements: intelligenceEngine.registeredElements?.size || 0
    });
  }
}, 10000);
```

**File:** `om_e_web_ws/ws_server.py` - Import at top

```python
from logger import logger
```

### Validation

1. Load extension, navigate to any page
2. Open DevTools Console
3. Should see structured log entries:
   ```
   [content] SCAN_START: {"scanId": "...", "trigger": "DOMContentLoaded", "tabId": 123}
   [content] INVARIANT_DASHBOARD: {"elementCounter": 42, "actionableElements": 42, ...}
   ```
4. Server should show:
   ```
   [ws_server] INFO: INTELLIGENCE_UPDATE_START: {"tabId": 123, "url": "...", ...}
   ```

**Success Criteria:**
- [ ] Structured logs visible in browser console
- [ ] Structured logs visible in server output
- [ ] Invariant dashboard logs every 10s
- [ ] Ring buffer captures last 100 events

---

## 0.2 Capture Baseline Metrics

**File:** `tests/baseline_metrics.js` (NEW FILE)

```javascript
/**
 * Baseline metric capture - run BEFORE any refactoring
 *
 * Usage: Run in Chrome console on target page after scan completes
 */

function captureBaselineMetrics() {
  const baseline = {
    timestamp: Date.now(),
    url: window.location.href,

    // Scan frequency
    scanHistory: window.omeLogs?.filter(log => log.event === 'SCAN_START') || [],
    scanCount: window.omeLogs?.filter(log => log.event === 'SCAN_START').length || 0,

    // Element counts
    elementCounter: window.intelligenceEngine?.elementCounter || 0,
    actionableElements: window.intelligenceEngine?.actionableElements.size || 0,
    registeredElements: window.intelligenceEngine?.registeredElements?.size || 0,

    // Duplicates
    duplicates: window.omeLogs?.filter(log => log.event === 'DUPLICATE_ACTION_ID') || [],
    duplicateCount: window.omeLogs?.filter(log => log.event === 'DUPLICATE_ACTION_ID').length || 0,

    // Performance
    scanDurations: window.omeLogs
      ?.filter(log => log.event === 'SCAN_COMPLETE')
      .map(log => log.duration) || []
  };

  console.log('=== BASELINE METRICS ===');
  console.log(JSON.stringify(baseline, null, 2));

  // Calculate inflation rate
  const inflationRate = baseline.elementCounter > 0
    ? ((baseline.elementCounter - baseline.actionableElements) / baseline.actionableElements * 100)
    : 0;

  console.log(`\nAction ID Inflation: ${inflationRate.toFixed(1)}%`);
  console.log(`Scan Count: ${baseline.scanCount}`);
  console.log(`Duplicate IDs: ${baseline.duplicateCount}`);

  if (baseline.scanDurations.length > 0) {
    const avgDuration = baseline.scanDurations.reduce((a, b) => a + b, 0) / baseline.scanDurations.length;
    console.log(`Average Scan Duration: ${avgDuration.toFixed(0)}ms`);
  }

  return baseline;
}

// Auto-run after 30 seconds
setTimeout(() => {
  console.log('Capturing baseline metrics...');
  const baseline = captureBaselineMetrics();

  // Store for comparison
  window.baselineMetrics = baseline;
}, 30000);
```

**File:** `tests/baseline_metrics.py` (NEW FILE)

```python
"""
Server baseline metrics - run BEFORE any refactoring

Usage: python3 tests/baseline_metrics.py
"""

import asyncio
import websockets
import json
import time

async def measure_server_latency():
    """Measure server response time for intelligence update"""

    async with websockets.connect('ws://127.0.0.1:17892') as ws:
        # Send test intelligence update
        test_data = {
            'type': 'intelligence_update',
            'tabId': 999,
            'tabUrl': 'https://test.com',
            'tabTitle': 'Test',
            'data': {
                'actionableElements': [{'actionId': f'a_id_{i}'} for i in range(100)]
            }
        }

        start = time.time()
        await ws.send(json.dumps(test_data))
        # Wait for server to process (no response expected)
        await asyncio.sleep(0.5)
        duration = (time.time() - start) * 1000

        print(f"Server latency (100 elements): {duration:.2f}ms")

        # Test with 1000 elements
        test_data['data']['actionableElements'] = [{'actionId': f'a_id_{i}'} for i in range(1000)]
        start = time.time()
        await ws.send(json.dumps(test_data))
        await asyncio.sleep(1.0)
        duration = (time.time() - start) * 1000

        print(f"Server latency (1000 elements): {duration:.2f}ms")

if __name__ == '__main__':
    print("=== SERVER BASELINE METRICS ===\n")
    asyncio.run(measure_server_latency())
```

### Validation

1. Run baseline capture script in browser console after 30s
2. Run server baseline: `python3 tests/baseline_metrics.py`
3. Document results in `BASELINE_RESULTS.md`:

```markdown
# Baseline Results (Pre-Refactor)

**Date:** 2025-11-18
**Test Page:** [URL]

## Browser Metrics
- Action ID Inflation: X%
- Scan Count (30s): X
- Duplicate IDs: X
- Average Scan Duration: Xms

## Server Metrics
- Latency (100 elements): Xms
- Latency (1000 elements): Xms
```

**Success Criteria:**
- [ ] Baseline metrics captured for 3 test pages
- [ ] Results documented in BASELINE_RESULTS.md
- [ ] Server latency measured for 100/1000 elements

---

## 0.3 Create Git Baseline Tag

```bash
# Tag current state before any changes
git add -A
git commit -m "Phase 0: Baseline - Add instrumentation and capture metrics"
git tag phase0-baseline
git push origin phase0-baseline

# Create rollback notes
cat > ROLLBACK_NOTES.md << 'EOF'
# Rollback Notes

## Phase 0 Baseline
**Tag:** phase0-baseline
**Date:** 2025-11-18
**Rollback:** `git checkout phase0-baseline`
**Changes:** Added logging infrastructure, no behavioral changes

---
EOF
```

**Success Criteria:**
- [ ] Git tag created: `phase0-baseline`
- [ ] ROLLBACK_NOTES.md created
- [ ] No functional changes to core logic

---

## Phase 0 Summary

**Time:** 2-3 days
**Changes:** Additive only (logging, metrics, git tags)
**Risk:** Low (zero behavioral changes)

**Deliverables:**
- ✅ Structured logging in content.js, sw.js, ws_server.py
- ✅ Baseline metrics captured for comparison
- ✅ Git tag for rollback: `phase0-baseline`
- ✅ BASELINE_RESULTS.md with documented metrics
- ✅ ROLLBACK_NOTES.md for recovery

**Validation Checkpoint:**
- [ ] Structured logs visible in all components
- [ ] Invariant dashboard logs every 10s
- [ ] Baseline metrics captured for 3+ test pages
- [ ] Git tag created
- [ ] No regressions (functionality identical to pre-Phase 0)

---

# PHASE 0.5: CONFIG CENTRALIZATION (Week 0, Days 4-5)

**Goal:** Replace hardcoded literals with centralized config **before** architectural changes (enables feature flags)

**Duration:** 2 days
**Risk:** Low (values mirror current behavior)

## 0.5.1 Create Server Config

**File:** `om_e_web_ws/env.py` (NEW FILE)

```python
"""
Centralized configuration for Om-E-Web WebSocket server

All hardcoded values should reference this module.
Feature flags control rollout of refactored components.
"""

import os

# WebSocket Configuration
WS_HOST = os.getenv('OME_WS_HOST', '127.0.0.1')
WS_PORT = int(os.getenv('OME_WS_PORT', 17892))

# File Paths
SITE_STRUCTURES_DIR = os.getenv('OME_STRUCTURES_DIR', '@site_structures')
TRANSCRIPTS_DIR = f"{SITE_STRUCTURES_DIR}/transcripts"

# Performance Settings
WRITE_QUEUE_MAXSIZE = int(os.getenv('OME_WRITE_QUEUE_SIZE', 1000))
PROMPT_MAX_ACTIONS = int(os.getenv('OME_PROMPT_MAX_ACTIONS', 100))
DEDUP_BATCH_SIZE = int(os.getenv('OME_DEDUP_BATCH_SIZE', 500))

# Logging
LOG_LEVEL = os.getenv('OME_LOG_LEVEL', 'INFO')
LOG_FILE = os.getenv('OME_LOG_FILE', None)  # None = stdout only

# Feature Flags (control rollout)
ENABLE_ASYNC_WRITES = os.getenv('OME_ASYNC_WRITES', 'false').lower() == 'true'  # Phase 3
ENABLE_HASH_DEDUP = os.getenv('OME_HASH_DEDUP', 'false').lower() == 'true'  # Phase 3
STRICT_ACTION_ID_UNIQUENESS = os.getenv('OME_STRICT_IDS', 'false').lower() == 'true'  # Phase 1
ALLOW_LEGACY_FORMAT = os.getenv('OME_LEGACY_FORMAT', 'true').lower() == 'true'  # Backward compat

# Default values mirror current behavior
# Flip flags to 'true' when rolling out phases
```

**File:** `om_e_web_ws/ws_server.py` - Replace literals

```python
# ✅ Add import at top
from env import (
    WS_HOST, WS_PORT, SITE_STRUCTURES_DIR,
    ENABLE_ASYNC_WRITES, ENABLE_HASH_DEDUP, logger
)

# ✅ Replace hardcoded values (examples):

# BEFORE:
async with websockets.serve(handler, "127.0.0.1", 17892):

# AFTER:
async with websockets.serve(handler, WS_HOST, WS_PORT):

# BEFORE:
output_dir = "@site_structures"

# AFTER:
output_dir = SITE_STRUCTURES_DIR
```

### Validation

1. Start server: `python3 om_e_web_ws/ws_server.py`
2. Should show: `WebSocket server started on ws://127.0.0.1:17892`
3. Test with environment override:
   ```bash
   OME_WS_PORT=18000 python3 om_e_web_ws/ws_server.py
   # Should show port 18000
   ```

**Success Criteria:**
- [ ] Server starts with default config
- [ ] Environment variables override defaults
- [ ] Zero hardcoded ports/paths in ws_server.py

---

## 0.5.2 Create Extension Config

**File:** `web_extension/env.js` (NEW FILE)

```javascript
/**
 * Centralized configuration for Om-E-Web Chrome Extension
 *
 * All hardcoded values should reference this module.
 * Feature flags control rollout of refactored components.
 */

const ENV = {
  // Timing Configuration
  SCAN_DEBOUNCE_MS: 300,
  MUTATION_DEBOUNCE_MS: 1000,
  PAGE_IDLE_QUIET_WINDOW_MS: 200,
  FALLBACK_SCAN_DELAY_MS: 4000,  // Will be removed in Phase 2

  // Navigation Triggers
  NAVIGATION_RESET_TRIGGERS: [
    'DOMContentLoaded',
    'navigation',
    'urlChange',
    'historyStateUpdated'
  ],

  // Logging
  LOG_LEVEL: 'INFO',  // 'DEBUG', 'INFO', 'WARN', 'ERROR'
  ENABLE_INVARIANT_DASHBOARD: true,
  DASHBOARD_INTERVAL_MS: 10000,

  // Feature Flags (control rollout)
  ENABLE_SCAN_CONTROLLER: false,  // Phase 2
  ENABLE_ACTION_REGISTRY: false,  // Phase 2
  ENABLE_SINGLE_INJECTION_MANAGER: false,  // Phase 1

  // Default values mirror current behavior
  // Flip flags to true when rolling out phases
};

// Make available globally
if (typeof window !== 'undefined') {
  window.OME_ENV = ENV;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ENV;
}
```

**File:** `web_extension/content.js` - Replace literals

```javascript
// ✅ Load config at top of file
// <script src="env.js"></script> must be added to manifest.json first

// ✅ Replace hardcoded values (examples):

// BEFORE:
const QUIET_WINDOW_MS = 200;

// AFTER:
const QUIET_WINDOW_MS = window.OME_ENV.PAGE_IDLE_QUIET_WINDOW_MS;

// BEFORE:
setTimeout(() => scheduleInitialScan(), 4000);

// AFTER:
if (!window.OME_ENV.ENABLE_SCAN_CONTROLLER) {
  setTimeout(() => scheduleInitialScan(), window.OME_ENV.FALLBACK_SCAN_DELAY_MS);
}
```

**File:** `web_extension/manifest.json` - Add env.js

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": [
      "env.js",
      "logger.js",
      "content.js"
    ],
    "run_at": "document_start"
  }]
}
```

### Validation

1. Reload extension
2. Open DevTools Console, run:
   ```javascript
   console.log(window.OME_ENV);
   // Should show config object
   ```
3. Verify timing unchanged:
   ```javascript
   // Should still be 300ms
   console.log(window.OME_ENV.SCAN_DEBOUNCE_MS);
   ```

**Success Criteria:**
- [ ] ENV accessible via `window.OME_ENV`
- [ ] All timing constants reference ENV
- [ ] Feature flags exist for Phases 1-3
- [ ] Behavior identical to pre-config version

---

## Phase 0.5 Summary

**Time:** 2 days
**Changes:** Replace literals with config references
**Risk:** Low (default values mirror current behavior)

**Deliverables:**
- ✅ `om_e_web_ws/env.py` with server config + feature flags
- ✅ `web_extension/env.js` with extension config + feature flags
- ✅ Zero hardcoded literals in runtime files
- ✅ Environment variable support for server

**Validation Checkpoint:**
- [ ] Config modules loaded successfully
- [ ] Feature flags accessible (all set to false/legacy mode)
- [ ] Timing behavior unchanged
- [ ] Server accepts env var overrides
- [ ] Extension functional (no regressions)

---

# PHASE 1: STOP THE BLEEDING (Week 1)

**Goal:** Fix critical bugs causing immediate pain without architectural changes

**Performance Budgets:**
- Action ID inflation: <5% (baseline: +200%)
- Multi-tab action latency: <100ms per tab
- Content script injection count: 1 per tab (baseline: 3-5)
- Duplicate ID detection: 100% (baseline: 0%)

**Invariants (Hard Exit Checks):**
```javascript
// Phase 1 must pass ALL these tests before proceeding to Phase 2
async function phase1InvariantCheck() {
  // 1. Zero duplicate action IDs after 10 navigations
  for (let i = 0; i < 10; i++) {
    await navigate(testUrl);
    const ids = await getActionIds();
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert(duplicates.length === 0, `Found ${duplicates.length} duplicates`);
  }

  // 2. Exactly 1 content script per tab
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const contexts = await chrome.scripting.getContexts({tabId: tab.id});
    assert(contexts.length === 1, `Tab ${tab.id} has ${contexts.length} contexts`);
  }

  // 3. Multi-tab independence
  const [tab1, tab2] = tabs;
  const start = Date.now();
  await Promise.all([
    executeAction(tab1.id, 'click', 'a_id_0'),
    executeAction(tab2.id, 'click', 'a_id_0')
  ]);
  const duration = Date.now() - start;
  assert(duration < 200, `Multi-tab actions took ${duration}ms, expected <200ms`);
}
```

## 1.1 Fix Primary Bug - registerInteractiveSubtree() Scan Lock Bypass

**Resolves:** Issue #1 (from SYSTEM_ARCHITECTURE.md) - Primary bug causing 80% of ID inflation

**Root Cause:** `registerInteractiveSubtree()` at content.js line 3878 (Trigger #8) bypasses scan lock check, assigns IDs during full scan

### Implementation

**File:** `web_extension/content.js` line 5114-5153 (registerInteractiveSubtree function)

```javascript
// BEFORE (line 5114):
registerInteractiveSubtree(rootNode) {
    // ❌ No scan lock check!
    for (const element of rootNode.querySelectorAll(...)) {
        const actionId = `a_id_${this.elementCounter++}`;
        this.actionableElements.set(actionId, element);
    }
}

// AFTER:
registerInteractiveSubtree(rootNode) {
    // ✅ Check scan lock - abort if full scan in progress
    if (this.scanInProgress) {
        logger.log('INFO', 'REGISTER_SUBTREE_BLOCKED', {
            reason: 'Full scan in progress',
            rootNode: rootNode.tagName
        });
        return;
    }

    // ✅ Use WeakSet to prevent duplicate registration
    if (!this.registeredElements) {
        this.registeredElements = new WeakSet();
    }

    for (const element of rootNode.querySelectorAll(...)) {
        // ✅ Skip if already registered
        if (this.registeredElements.has(element)) {
            logger.duplicateDetected(`a_id_${this.elementCounter}`, element, 'existing');
            continue;
        }

        const actionId = `a_id_${this.elementCounter++}`;
        this.actionableElements.set(actionId, element);
        this.registeredElements.add(element);

        logger.log('DEBUG', 'ELEMENT_REGISTERED', {
            actionId,
            tagName: element.tagName,
            duringMutation: true
        });
    }
}
```

### Validation

1. Open YouTube, let initial scan complete
2. Monitor console: `elementCounter` should NOT increment during mutations
3. Check logs for `REGISTER_SUBTREE_BLOCKED` messages
4. Navigate to new video: Counter should reset to 0, no duplicates
5. Run automated test:

```javascript
// In Chrome console
async function testScanLockRespect() {
  // Start scan
  window.intelligenceEngine.scanInProgress = true;

  // Try to register during scan
  const testDiv = document.createElement('div');
  testDiv.innerHTML = '<button>Test</button>';
  document.body.appendChild(testDiv);

  window.intelligenceEngine.registerInteractiveSubtree(testDiv);

  // Should see REGISTER_SUBTREE_BLOCKED log
  const blocked = window.omeLogs.some(log =>
    log.event === 'REGISTER_SUBTREE_BLOCKED'
  );

  console.log(blocked ? '✅ PASS' : '❌ FAIL');

  // Cleanup
  window.intelligenceEngine.scanInProgress = false;
  testDiv.remove();
}

testScanLockRespect();
```

**Success Criteria:**
- [ ] Zero duplicate action IDs in llm_prompt.md after 5 navigations
- [ ] `REGISTER_SUBTREE_BLOCKED` logs appear during scans
- [ ] `elementCounter` stable during mutations
- [ ] Automated test passes

**Rollback Plan:**
Keep original function commented out above changes for 1 week:

```javascript
// ORIGINAL (ROLLBACK if issues found):
// registerInteractiveSubtree(rootNode) {
//     for (const element of rootNode.querySelectorAll(...)) {
//         const actionId = `a_id_${this.elementCounter++}`;
//         this.actionableElements.set(actionId, element);
//     }
// }
```

---

## 1.2 Add DOM Reference Deduplication

**Resolves:** Issue #1 (partial) - Same element getting multiple IDs

### Implementation

**File:** `web_extension/content.js` - Add to IntelligenceEngine class around line 5050

```javascript
class IntelligenceEngine {
    constructor() {
        this.scanInProgress = false;
        this.elementCounter = 0;
        this.actionableElements = new Map();

        // ✅ NEW: Track registered DOM elements to prevent duplicates
        this.registeredElements = new WeakSet();
        // ✅ NEW: Reverse lookup - element → actionId
        this.elementToActionId = new WeakMap();

        logger.log('INFO', 'INTELLIGENCE_ENGINE_INIT', {
            features: ['registeredElements', 'elementToActionId']
        });
    }

    // ✅ NEW: Helper to check if element already registered
    getExistingActionId(element) {
        return this.elementToActionId.get(element);
    }

    // Modify existing registerElement() around line 5200:
    registerElement(element, type, metadata) {
        // ✅ Check for existing registration
        const existingId = this.getExistingActionId(element);
        if (existingId) {
            logger.log('INFO', 'ELEMENT_ALREADY_REGISTERED', {
                existingId,
                newType: type,
                metadata
            });
            return existingId;
        }

        const actionId = `a_id_${this.elementCounter++}`;
        this.actionableElements.set(actionId, {element, type, metadata});

        // ✅ Track bidirectional mapping
        this.registeredElements.add(element);
        this.elementToActionId.set(element, actionId);

        logger.log('DEBUG', 'ELEMENT_REGISTERED', {
            actionId,
            type,
            tagName: element.tagName
        });

        return actionId;
    }
}
```

### Validation

1. Run full scan on complex page (e.g., Gmail)
2. Console command: Count unique DOM references
   ```javascript
   const engine = window.intelligenceEngine;
   console.log('Actionable elements:', engine.actionableElements.size);
   console.log('Registered elements:', engine.registeredElements.size);
   console.log('ElementToActionId map size:',
     Array.from(engine.actionableElements.values())
       .filter(item => engine.elementToActionId.get(item.element))
       .length
   );
   // All three should match
   ```
3. Look for `ELEMENT_ALREADY_REGISTERED` logs
4. Should match action ID count exactly (no element registered twice)

**Success Criteria:**
- [ ] `actionableElements.size === registeredElements.size` always true
- [ ] Zero `ELEMENT_ALREADY_REGISTERED` warnings (all prevented)
- [ ] Bidirectional mapping consistent

---

## 1.3 Fix Global Action Lock (Multi-Tab Killer)

**Resolves:** Issue #4 (from SYSTEM_ARCHITECTURE.md) - Breaks multi-tab workflows

**Root Cause:** Global `actionInProgress` flag at sw.js line 121 blocks Tab 2 when Tab 1 executing

### Implementation

**File:** `web_extension/sw.js` line 121

```javascript
// BEFORE:
let actionInProgress = false; // ❌ GLOBAL - breaks multi-tab

// AFTER:
// ✅ Per-tab action tracking
const actionInProgressByTab = new Map(); // tabId → boolean

// ✅ Add cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
    actionInProgressByTab.delete(tabId);
    logger.log('INFO', 'TAB_ACTION_LOCK_RELEASED', { tabId, reason: 'Tab closed' });
});
```

**Update all actionInProgress checks (15 locations):**

Example at sw.js line 1156 (handleExecuteAction):

```javascript
// BEFORE:
async function handleExecuteAction(message) {
    if (actionInProgress) {
        return {success: false, error: 'Action already in progress'};
    }

    actionInProgress = true;
    try {
        // ... execute action
    } finally {
        actionInProgress = false;
    }
}

// AFTER:
async function handleExecuteAction(message) {
    const tabId = message.tabId || (await findActiveTab()).id;

    // ✅ Check per-tab lock
    if (actionInProgressByTab.get(tabId)) {
        logger.log('WARN', 'ACTION_BLOCKED', {
            tabId,
            reason: 'Action in progress for this tab'
        });
        return {success: false, error: 'Action in progress for this tab'};
    }

    actionInProgressByTab.set(tabId, true);
    logger.log('INFO', 'ACTION_LOCK_ACQUIRED', { tabId });

    try {
        // ... execute action
    } finally {
        actionInProgressByTab.delete(tabId);
        logger.log('INFO', 'ACTION_LOCK_RELEASED', { tabId });
    }
}
```

**Find all 15 locations to update:**

```bash
# Search for actionInProgress usage
grep -n "actionInProgress" web_extension/sw.js

# Expected locations (approximate):
# Line 121 - declaration
# Line 1156 - handleExecuteAction
# Line 1200 - handleExecuteLLMAction
# ... (11 more locations)
```

### Validation

1. Open 2 tabs on YouTube
2. Execute action in Tab A (e.g., click video):
   ```bash
   python3 om_e_web_ws/test_navigation.py --action-id a_id_0 --action-type click
   ```
3. Immediately execute action in Tab B (different video) - should succeed
4. Check logs for per-tab lock messages:
   ```
   [sw] ACTION_LOCK_ACQUIRED: {tabId: 123}
   [sw] ACTION_LOCK_RELEASED: {tabId: 123}
   [sw] ACTION_LOCK_ACQUIRED: {tabId: 456}
   ```

**Success Criteria:**
- [ ] Actions in different tabs never block each other
- [ ] Actions in same tab still serialize (lock per tab)
- [ ] Locks released on tab close
- [ ] Multi-tab invariant test passes

---

## 1.4 Fix Content Script Reinjection Chaos

**Resolves:** Issue #4 (partial) - Multiple instances, 12+ injection points (from SYSTEM_ARCHITECTURE.md)

### Implementation

**File:** `web_extension/sw.js` - Consolidate injection logic

```javascript
// ✅ NEW: Single source of truth for content script injection
const injectedTabs = new Set(); // Track already-injected tabs

async function ensureContentScriptInjected(tabId, force = false) {
    // Skip if already injected (unless forced)
    if (!force && injectedTabs.has(tabId)) {
        logger.log('DEBUG', 'INJECTION_SKIPPED', {
            tabId,
            reason: 'Already injected'
        });
        return true;
    }

    try {
        await chrome.scripting.executeScript({
            target: {tabId},
            files: ['env.js', 'logger.js', 'content.js']
        });
        injectedTabs.add(tabId);
        logger.log('INFO', 'CONTENT_SCRIPT_INJECTED', { tabId, force });
        return true;
    } catch (err) {
        logger.log('ERROR', 'INJECTION_FAILED', {
            tabId,
            error: err.message
        });
        return false;
    }
}

// ✅ Clean up tracking on tab close/update
chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
    actionInProgressByTab.delete(tabId);
    logger.log('INFO', 'TAB_CLEANUP', { tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // Clear injection flag on navigation
    if (changeInfo.status === 'loading') {
        injectedTabs.delete(tabId);
        logger.log('INFO', 'TAB_NAVIGATED', { tabId });
    }
});

// ✅ Replace all 12 injection calls with single function
// Example - webNavigation.onCompleted (line 1891):
chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return; // Main frame only
    await ensureContentScriptInjected(details.tabId);
});
```

**Find and replace all injection points:**

```bash
# Search for executeScript calls
grep -n "executeScript" web_extension/sw.js

# Replace each with:
# await ensureContentScriptInjected(tabId);
```

### Validation

1. Open DevTools → Sources → Content scripts
2. Should see exactly 1 instance of content.js per tab
3. Navigate 5 times - still only 1 instance
4. Console: No "script already injected" errors
5. Check logs:
   ```
   [sw] CONTENT_SCRIPT_INJECTED: {tabId: 123, force: false}
   [sw] INJECTION_SKIPPED: {tabId: 123, reason: "Already injected"}
   [sw] TAB_NAVIGATED: {tabId: 123}
   [sw] CONTENT_SCRIPT_INJECTED: {tabId: 123, force: false}
   ```

**Success Criteria:**
- [ ] Exactly 1 content script instance per tab
- [ ] No duplicates after 5 navigations
- [ ] Injection count metric: 1 per tab
- [ ] Logs show injection tracking working

---

## 1.5 Add CLI Concurrency Lock

**Resolves:** Issue #17 (from original roadmap) - Parallel commands cause overlapping scans

### Implementation

**File:** `om_e_web_ws/test_navigation.py` - Add lockfile mechanism

```python
import fcntl  # Unix file locking
import os
import sys
from logger import logger

class NavigationClient:
    LOCK_FILE = '/tmp/om_e_web_test.lock'

    def __init__(self):
        self.lock_fd = None

    async def acquire_lock(self):
        """Prevent concurrent test_navigation.py instances"""
        self.lock_fd = open(self.LOCK_FILE, 'w')
        try:
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            logger.log('INFO', 'CLI_LOCK_ACQUIRED', {})
            return True
        except BlockingIOError:
            logger.log('ERROR', 'CLI_LOCK_BLOCKED', {
                'message': 'Another test_navigation.py is running'
            })
            print("[CLI] ERROR: Another test_navigation.py is running")
            print("[CLI] Wait for it to complete or kill the process")
            return False

    def release_lock(self):
        if self.lock_fd:
            fcntl.flock(self.lock_fd, fcntl.LOCK_UN)
            self.lock_fd.close()
            if os.path.exists(self.LOCK_FILE):
                os.remove(self.LOCK_FILE)
            logger.log('INFO', 'CLI_LOCK_RELEASED', {})

    async def run(self):
        if not await self.acquire_lock():
            sys.exit(1)
        try:
            # ... existing run logic
        finally:
            self.release_lock()
```

### Validation

1. Terminal 1: `python3 test_navigation.py --action-id a_id_0 --action-type click`
2. Terminal 2 (immediately): Same command
3. Terminal 2 should show: "Another test_navigation.py is running"
4. Terminal 1 completes, Terminal 2 should then work

**Success Criteria:**
- [ ] Concurrent CLI invocations blocked gracefully
- [ ] Lock released on normal exit
- [ ] Lock released on Ctrl+C (cleanup in finally block)
- [ ] Error message clear and actionable

---

## Phase 1 Summary

**Issues Resolved:** #1, #4, #17 (Critical bugs: duplicate IDs, multi-tab lock, CLI concurrency)
**Time:** 5 days
**Risk:** Low - surgical fixes with rollback plans

**Validation Checkpoint (MUST PASS before Phase 2):**

Run automated invariant check:
```bash
node tests/phase1_invariant_check.js
```

Expected output:
```
=== PHASE 1 INVARIANT CHECKS ===

✅ Zero duplicate action IDs after 10 navigations
✅ Exactly 1 content script per tab
✅ Multi-tab actions work independently
✅ CLI blocks concurrent runs
✅ No console errors related to scan lock

ALL PHASE 1 INVARIANTS PASSED
```

**Manual Validation:**
- [ ] Zero duplicate action IDs after 10 navigations (automated + manual check)
- [ ] Multi-tab actions work independently (test on 2 tabs)
- [ ] Exactly 1 content script per tab (check DevTools Sources)
- [ ] CLI blocks concurrent runs (test in 2 terminals)
- [ ] No console errors related to scan lock (visual inspection)

**Performance Budget Check:**
- [ ] Action ID inflation: <5% ✅ (baseline: +200%)
- [ ] Content script injection: 1 per tab ✅ (baseline: 3-5)
- [ ] Duplicate detection: 100% ✅ (baseline: 0%)

**Git Checkpoint:**
```bash
git commit -m "Phase 1 Complete: Stop the Bleeding"
git tag phase1-complete
```

**Rollback if invariants fail:**
```bash
git checkout phase0-baseline
```

---

# PHASE 2: INTRODUCE SCAN COORDINATION (Week 2)

**Goal:** Eliminate 8 overlapping triggers with centralized ScanController

**Performance Budgets:**
- Scan frequency: 1-2 per navigation (baseline: 8)
- Debounce effectiveness: >75% reduction in scan count
- Counter stability: Monotonic increments only (baseline: resets constantly)
- Trigger coordination: 100% of scans route through ScanController

**Invariants (Hard Exit Checks):**
```javascript
async function phase2InvariantCheck() {
  // 1. Single scan per navigation event
  await navigate(testUrl);
  await sleep(5000); // Let all triggers fire
  const scanHistory = window.omeLogs.filter(log => log.event === 'SCAN_START');
  assert(scanHistory.length <= 2, `Too many scans: ${scanHistory.length}`);

  // 2. Mutations debounced (300ms window)
  const before = scanHistory.length;
  triggerMutations(10); // 10 rapid DOM changes
  await sleep(400);
  const after = window.omeLogs.filter(log => log.event === 'SCAN_START').length;
  assert((after - before) === 1, `Debouncing failed: ${after - before} scans`);

  // 3. Counter increments monotonically
  await navigate(testUrl);
  const counter1 = window.intelligenceEngine.elementCounter;
  await sleep(1000);
  const counter2 = window.intelligenceEngine.elementCounter;
  assert(counter2 >= counter1, `Counter regressed: ${counter1} → ${counter2}`);
}
```

## 2.1 Extract ScanController Module

**Resolves:** Issues #1, #2 (from SYSTEM_ARCHITECTURE.md) - 8 overlapping triggers, counter resets

### Implementation

**File:** `web_extension/ScanController.js` (NEW FILE)

```javascript
/**
 * ScanController.js
 *
 * Centralized DOM scan coordination to prevent overlapping scans,
 * duplicate action IDs, and counter resets.
 *
 * Key responsibilities:
 * - Single source of truth for scan state
 * - Debounced scan requests (300ms window)
 * - Event-driven triggers (no timers unless necessary)
 * - Counter persistence across scans
 * - DOM reference deduplication
 *
 * Replaces 8 independent scan triggers:
 * - sw.js: 3 triggers (onCompleted, onHistoryStateUpdated, onUpdated)
 * - content.js: 5 triggers (DOMContentLoaded, idle, mutation, focus, fallback)
 */

class ScanController {
    constructor(intelligenceEngine) {
        this.engine = intelligenceEngine;
        this.scanInProgress = false;
        this.pendingScan = null;
        this.lastScanTimestamp = 0;
        this.DEBOUNCE_MS = window.OME_ENV?.SCAN_DEBOUNCE_MS || 300;

        // ✅ Track scan triggers for debugging
        this.scanHistory = [];

        logger.log('INFO', 'SCAN_CONTROLLER_INIT', {
            debounceMs: this.DEBOUNCE_MS
        });
    }

    /**
     * Request a scan with automatic debouncing
     * @param {string} trigger - What triggered the scan (e.g., 'DOMContentLoaded')
     * @param {string} priority - 'high' (immediate), 'normal' (debounced), 'low' (deferred)
     */
    requestScan(trigger, priority = 'normal') {
        this.scanHistory.push({trigger, timestamp: Date.now(), priority});
        logger.log('INFO', 'SCAN_REQUESTED', { trigger, priority });

        // High priority - execute immediately if not already scanning
        if (priority === 'high') {
            if (!this.scanInProgress) {
                return this.executeScan(trigger);
            } else {
                logger.log('WARN', 'SCAN_BLOCKED_HIGH_PRIORITY', {
                    trigger,
                    reason: 'Scan already in progress'
                });
                // Queue for after current scan completes
                this.pendingScan = {trigger, priority: 'high'};
                return;
            }
        }

        // Normal/low priority - debounce
        if (this.pendingScan) {
            clearTimeout(this.pendingScan.timeout);
            logger.log('DEBUG', 'SCAN_DEBOUNCED', {
                oldTrigger: this.pendingScan.trigger,
                newTrigger: trigger
            });
        }

        const delay = priority === 'low' ? 1000 : this.DEBOUNCE_MS;
        this.pendingScan = {
            trigger,
            priority,
            timeout: setTimeout(() => {
                this.executeScan(trigger);
                this.pendingScan = null;
            }, delay)
        };
    }

    async executeScan(trigger) {
        if (this.scanInProgress) {
            logger.log('WARN', 'SCAN_BLOCKED', { trigger });
            return;
        }

        this.scanInProgress = true;
        const scanId = `scan_${Date.now()}`;
        const startTime = Date.now();

        try {
            logger.scanStart(scanId, trigger, null);

            // ✅ Reset element tracking BUT preserve counter continuity
            this.engine.actionableElements.clear();
            this.engine.registeredElements = new WeakSet();
            this.engine.elementToActionId = new WeakMap();

            // ✅ CRITICAL: Only reset counter on navigation, not mutations
            if (this.isNavigationTrigger(trigger)) {
                this.engine.elementCounter = 0;
                logger.log('INFO', 'COUNTER_RESET', { trigger, scanId });
            } else {
                logger.log('INFO', 'COUNTER_PRESERVED', {
                    trigger,
                    currentCounter: this.engine.elementCounter,
                    scanId
                });
            }

            // Execute actual scan
            await this.engine.scanAndRegisterElements();

            const duration = Date.now() - startTime;
            const elementCount = this.engine.actionableElements.size;
            this.lastScanTimestamp = Date.now();

            logger.scanComplete(scanId, duration, elementCount);

        } catch (err) {
            logger.log('ERROR', 'SCAN_FAILED', {
                trigger,
                error: err.message,
                stack: err.stack
            });
        } finally {
            this.scanInProgress = false;

            // Process pending high-priority scan if any
            if (this.pendingScan?.priority === 'high') {
                const pending = this.pendingScan;
                this.pendingScan = null;
                logger.log('INFO', 'SCAN_PENDING_EXECUTED', {
                    trigger: pending.trigger
                });
                this.executeScan(pending.trigger);
            }
        }
    }

    isNavigationTrigger(trigger) {
        const navTriggers = window.OME_ENV?.NAVIGATION_RESET_TRIGGERS || [
            'DOMContentLoaded',
            'navigation',
            'urlChange',
            'historyStateUpdated'
        ];
        return navTriggers.includes(trigger);
    }

    // ✅ Debugging helper
    getScanHistory(limit = 20) {
        return this.scanHistory.slice(-limit);
    }

    // ✅ Get metrics
    getMetrics() {
        return {
            totalScans: this.scanHistory.length,
            lastScanTimestamp: this.lastScanTimestamp,
            scanInProgress: this.scanInProgress,
            pendingScan: this.pendingScan ? {
                trigger: this.pendingScan.trigger,
                priority: this.pendingScan.priority
            } : null
        };
    }
}

// Export for content.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScanController;
}
```

### Implementation (continued)

**File:** `web_extension/content.js` - Integrate ScanController

```javascript
// ✅ Load ScanController (add to manifest.json)
// Around line 5000 (top of IntelligenceEngine class):

let scanController;

class IntelligenceEngine {
    constructor() {
        // ... existing properties

        // ✅ Initialize ScanController (only if feature flag enabled)
        if (window.OME_ENV?.ENABLE_SCAN_CONTROLLER) {
            scanController = new ScanController(this);
            logger.log('INFO', 'SCAN_CONTROLLER_ENABLED', {});
        } else {
            logger.log('INFO', 'SCAN_CONTROLLER_DISABLED', {
                usingLegacy: true
            });
        }
    }

    // ✅ Replace all direct scan calls with controller requests
    // Example - DOMContentLoaded listener (line ~1634):

    // BEFORE:
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => this.scanAndRegisterElements(), 500);
    });

    // AFTER:
    document.addEventListener('DOMContentLoaded', () => {
        if (window.OME_ENV?.ENABLE_SCAN_CONTROLLER && scanController) {
            scanController.requestScan('DOMContentLoaded', 'high');
        } else {
            // Legacy path
            setTimeout(() => this.scanAndRegisterElements(), 500);
        }
    });

    // ✅ Update all 5 content trigger points (from SYSTEM_ARCHITECTURE table):

    // Trigger #5: DOMContentLoaded (line 1634) → high priority
    // Trigger #6: Page idle detection (line 170) → high priority
    // Trigger #7: Visibility/focus change (line 7145) → normal priority
    // Trigger #8: MutationObserver (line 3878) → low priority (debounced)
    // Trigger #4: 4s fallback timer (line 244) → DELETE when controller enabled
}

// ✅ Delete fallback timer when controller enabled (line 244):
if (!window.OME_ENV?.ENABLE_SCAN_CONTROLLER) {
    // Legacy fallback timer (will be removed in Phase 2)
    setTimeout(() => scheduleInitialScan(), 4000);
} else {
    logger.log('INFO', 'FALLBACK_TIMER_DISABLED', {
        reason: 'ScanController handling timing'
    });
}
```

**File:** `web_extension/manifest.json` - Add ScanController.js

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": [
      "env.js",
      "logger.js",
      "ScanController.js",
      "content.js"
    ],
    "run_at": "document_start"
  }]
}
```

### Validation

1. Enable feature flag in `env.js`:
   ```javascript
   ENABLE_SCAN_CONTROLLER: true
   ```

2. Reload extension, navigate to YouTube

3. Monitor console - should see exactly 1 "SCAN_START" per navigation:
   ```
   [content] SCAN_REQUESTED: {trigger: "DOMContentLoaded", priority: "high"}
   [content] SCAN_START: {scanId: "scan_1234...", trigger: "DOMContentLoaded"}
   [content] SCAN_COMPLETE: {scanId: "scan_1234...", duration: 423, elementCount: 156}
   ```

4. DOM mutations should show debouncing:
   ```
   [content] SCAN_REQUESTED: {trigger: "mutation", priority: "low"}
   [content] SCAN_DEBOUNCED: {oldTrigger: "mutation", newTrigger: "mutation"}
   ```

5. Console command: Review scan history
   ```javascript
   console.log(scanController.getScanHistory());
   // Should show consolidated triggers

   console.log(scanController.getMetrics());
   // Should show reduced scan count
   ```

6. Counter should only reset on navigation, not mutations:
   ```javascript
   // Navigate to page
   const counter1 = window.intelligenceEngine.elementCounter;

   // Wait for mutations
   await new Promise(r => setTimeout(r, 2000));
   const counter2 = window.intelligenceEngine.elementCounter;

   // Should be equal or counter2 > counter1 (monotonic)
   console.log(counter2 >= counter1 ? '✅ PASS' : '❌ FAIL');
   ```

**Success Criteria:**
- [ ] Maximum 1 scan per 300ms window (debouncing working)
- [ ] Counter increments monotonically within page session
- [ ] No overlapping scans in console logs
- [ ] Scan history shows consolidated triggers
- [ ] Fallback timer disabled when controller active

---

## 2.2 Consolidate Service Worker Triggers

**Resolves:** Triggers #1, #2, #3 (from SYSTEM_ARCHITECTURE.md) - 3 overlapping SW triggers

### Implementation

**File:** `web_extension/sw.js` - Create NavigationCoordinator

```javascript
/**
 * NavigationCoordinator
 *
 * Consolidates 3 navigation triggers into single coordinator
 * to prevent duplicate content script injections and scan requests.
 *
 * Replaces:
 * - chrome.webNavigation.onCompleted (line 1255)
 * - chrome.webNavigation.onHistoryStateUpdated (line 1264)
 * - chrome.tabs.onUpdated (line 1282)
 */

class NavigationCoordinator {
    constructor() {
        this.handledNavigations = new Map(); // url → timestamp
        this.NAVIGATION_DEBOUNCE_MS = 500;

        logger.log('INFO', 'NAV_COORDINATOR_INIT', {
            debounceMs: this.NAVIGATION_DEBOUNCE_MS
        });
    }

    /**
     * Determine if navigation event should be processed
     * @returns {boolean} true if event is unique, false if duplicate
     */
    shouldProcessNavigation(url, trigger, tabId) {
        const key = `${tabId}_${url}`;
        const lastProcessed = this.handledNavigations.get(key);
        const now = Date.now();

        // If same URL processed within debounce window, skip
        if (lastProcessed && (now - lastProcessed) < this.NAVIGATION_DEBOUNCE_MS) {
            logger.log('INFO', 'NAV_DEDUPED', {
                trigger,
                url,
                tabId,
                timeSinceLastScan: now - lastProcessed
            });
            return false;
        }

        this.handledNavigations.set(key, now);

        // Cleanup old entries (keep last 100)
        if (this.handledNavigations.size > 100) {
            const oldestKey = this.handledNavigations.keys().next().value;
            this.handledNavigations.delete(oldestKey);
        }

        logger.log('INFO', 'NAV_PROCESSING', { trigger, url, tabId });
        return true;
    }
}

const navCoordinator = new NavigationCoordinator();

// ✅ Consolidate all navigation listeners
async function handleNavigation(details, trigger) {
    if (details.frameId !== 0) return; // Main frame only

    const url = details.url;
    const tabId = details.tabId;

    if (!navCoordinator.shouldProcessNavigation(url, trigger, tabId)) {
        return; // Duplicate event
    }

    logger.log('INFO', 'NAV_HANDLED', { trigger, url, tabId });

    // Inject content script
    await ensureContentScriptInjected(tabId);

    // Update tab state (if tracking exists)
    if (typeof updateTabState === 'function') {
        updateTabState(tabId, {url, lastNavigation: Date.now()});
    }
}

// ✅ Replace all 3 trigger points with consolidated handler:
chrome.webNavigation.onCompleted.addListener((details) => {
    handleNavigation(details, 'onCompleted');
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    handleNavigation(details, 'onHistoryStateUpdated');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        handleNavigation({tabId, url: tab.url, frameId: 0}, 'tabs.onUpdated');
    }
});

// ✅ Remove redundant listeners (comment out old code):
// REMOVED: webNavigation.onCommitted (redundant with onCompleted)
// REMOVED: webNavigation.onDOMContentLoaded (content script handles this)
// REMOVED: tabs.onActivated triggering scan (doesn't require rescan)
```

### Validation

1. Navigate YouTube homepage → video → another video
2. Console should show exactly 1 "NAV_PROCESSING" per URL change
3. Should see "NAV_DEDUPED" messages for duplicate triggers:
   ```
   [sw] NAV_PROCESSING: {trigger: "onCompleted", url: "youtube.com/watch?v=abc"}
   [sw] NAV_DEDUPED: {trigger: "tabs.onUpdated", url: "youtube.com/watch?v=abc", timeSinceLastScan: 123}
   ```
4. Content script injected exactly once per navigation

**Success Criteria:**
- [ ] Maximum 1 navigation event processed per URL within 500ms
- [ ] No duplicate injection messages
- [ ] Logs show deduplication working
- [ ] All 3 triggers route through coordinator

---

## 2.3 Remove Undefined Function Calls

**Resolves:** Runtime errors in sw.js (from original roadmap Issue #11)

### Implementation

**File:** `web_extension/sw.js` - Search and fix

```bash
# Find undefined function calls:
grep -n "undefined_function" web_extension/sw.js
# (Analysis from original roadmap found 2 instances)
```

**Action:** Comment out or implement based on context

```javascript
// BEFORE (example):
await undefined_function_1(data);

// AFTER - Option 1 (dead code):
// REMOVED: undefined_function_1 was never implemented
// Context: This was placeholder code from prototype phase

// AFTER - Option 2 (needed functionality):
async function processIntelligenceData(data) {
    try {
        logger.log('INFO', 'PROCESS_INTELLIGENCE', { dataKeys: Object.keys(data) });
        // Implementation based on context
    } catch (err) {
        logger.log('ERROR', 'PROCESS_INTELLIGENCE_FAILED', {
            error: err.message
        });
    }
}
```

### Validation

1. Load extension, check console for errors
2. Should see zero "undefined_function" errors
3. Extension should load without warnings
4. Check service worker console specifically:
   - Chrome → Extensions → Service Worker (inspect)
   - Look for any red error messages

**Success Criteria:**
- [ ] Zero runtime errors in service worker console
- [ ] Extension loads successfully
- [ ] No undefined function references in code

---

## Phase 2 Summary

**Issues Resolved:** #1, #2 (overlapping triggers, coordination), #11 (undefined functions)
**Time:** 5-7 days
**Risk:** Medium - introducing new modules, needs thorough testing
**New Files:** `ScanController.js`, `NavigationCoordinator` in sw.js

**Validation Checkpoint (MUST PASS before Phase 3):**

Run automated invariant check:
```bash
node tests/phase2_invariant_check.js
```

**Manual Validation:**
- [ ] Single scan per navigation event (check logs)
- [ ] Debounced mutation scans (300ms window confirmed)
- [ ] Zero duplicate navigation processing (check NAV_DEDUPED logs)
- [ ] Action counter increments monotonically (no resets during mutations)
- [ ] No undefined function errors (service worker console clean)

**Performance Budget Check:**
- [ ] Scan frequency: 1-2 per navigation ✅ (baseline: 8)
- [ ] Debounce effectiveness: >75% reduction ✅
- [ ] Counter stability: Monotonic ✅ (baseline: resets)

**Feature Flag:**
```javascript
// env.js - flip to enable Phase 2
ENABLE_SCAN_CONTROLLER: true  // Was false
```

**Git Checkpoint:**
```bash
git commit -m "Phase 2 Complete: Scan Coordination"
git tag phase2-complete
```

**Rollback if invariants fail:**
```javascript
// env.js
ENABLE_SCAN_CONTROLLER: false  // Revert to legacy
```

---

# PHASE 3: ASYNC SERVER ARCHITECTURE (Week 3)

**Goal:** Eliminate blocking I/O and O(n²) algorithms

**Performance Budgets:**
- WebSocket handler latency: <10ms (baseline: 100-500ms)
- Artifact write latency (perceived): <5ms (baseline: 100-500ms blocking)
- Deduplication (6k elements): <100ms (baseline: 10+ seconds)
- Server responsiveness during updates: 100% (baseline: 0% - blocked)
- Throughput: >200 msg/sec (baseline: 2-3 msg/sec)

**Invariants (Hard Exit Checks):**
```python
# Phase 3 must pass ALL these tests
async def phase3_invariant_check():
    # 1. Handler returns quickly
    start = time.time()
    await send_intelligence_update(large_payload)  # 1000 elements
    handler_duration = (time.time() - start) * 1000
    assert handler_duration < 10, f"Handler took {handler_duration}ms, expected <10ms"

    # 2. Artifacts written correctly (async)
    await asyncio.sleep(0.5)  # Wait for background write
    assert os.path.exists('@site_structures/page.jsonl'), "Artifact not written"

    # 3. Dedup performance
    elements = [{'selector': f'div.test-{i}'} for i in range(6000)]
    start = time.time()
    result = await deduplicate_actions(elements)
    dedup_duration = (time.time() - start) * 1000
    assert dedup_duration < 100, f"Dedup took {dedup_duration}ms, expected <100ms"

    # 4. Server stays responsive
    # Send 100 messages rapidly
    tasks = [send_test_message() for _ in range(100)]
    start = time.time()
    await asyncio.gather(*tasks)
    throughput = 100 / (time.time() - start)
    assert throughput > 200, f"Throughput {throughput:.1f} msg/sec, expected >200"
```

## 3.1 Create AsyncFileWriter

**Resolves:** Issue #2 (from SYSTEM_ARCHITECTURE.md) - Blocking I/O causing 100-500ms freezes

### Implementation

**File:** `om_e_web_ws/async_file_writer.py` (NEW FILE)

```python
"""
AsyncFileWriter

Non-blocking file I/O for artifact generation. Uses background tasks
to prevent WebSocket handler from freezing during file writes.

Performance: Reduces artifact write latency from 100-500ms to <5ms (perceived)

Problem solved (from SYSTEM_ARCHITECTURE.md Flow 2):
  - Synchronous file writes blocked WebSocket handler for 100-500ms
  - Caused client timeouts and perceived lag
  - Server unresponsive during intelligence updates

Solution:
  - Background worker task processes write queue
  - Handler queues writes and returns immediately (<5ms)
  - Actual I/O happens asynchronously

Testing:
    python3 tests/test_async_file_writer.py
"""

import asyncio
import os
from pathlib import Path
from typing import Dict, Any
import json
from logger import logger

class AsyncFileWriter:
    def __init__(self, base_dir: str = '@site_structures'):
        self.base_dir = Path(base_dir)
        self.write_queue = asyncio.Queue(maxsize=1000)
        self.worker_task = None
        self.writes_completed = 0
        self.writes_failed = 0

    async def start(self):
        """Start background writer worker"""
        self.worker_task = asyncio.create_task(self._writer_worker())
        logger.log('INFO', 'ASYNC_WRITER_STARTED', {
            'base_dir': str(self.base_dir)
        })

    async def stop(self):
        """Graceful shutdown - flush queue"""
        logger.log('INFO', 'ASYNC_WRITER_STOPPING', {
            'queue_size': self.write_queue.qsize(),
            'completed': self.writes_completed,
            'failed': self.writes_failed
        })

        await self.write_queue.put(None)  # Sentinel
        if self.worker_task:
            await self.worker_task

        logger.log('INFO', 'ASYNC_WRITER_STOPPED', {
            'total_writes': self.writes_completed,
            'failed_writes': self.writes_failed
        })

    async def _writer_worker(self):
        """Background worker that processes write queue"""
        while True:
            item = await self.write_queue.get()
            if item is None:  # Shutdown signal
                break

            file_path, content, mode = item
            try:
                # Actual blocking I/O happens here (in background task)
                full_path = self.base_dir / file_path
                full_path.parent.mkdir(parents=True, exist_ok=True)

                # Use loop.run_in_executor for true async I/O
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._write_file, full_path, content, mode)

                self.writes_completed += 1
                logger.log('INFO', 'FILE_WRITTEN', {
                    'path': file_path,
                    'size_bytes': len(content),
                    'mode': mode
                })
            except Exception as e:
                self.writes_failed += 1
                logger.log('ERROR', 'FILE_WRITE_FAILED', {
                    'path': file_path,
                    'error': str(e)
                })
            finally:
                self.write_queue.task_done()

    def _write_file(self, full_path, content, mode):
        """Synchronous file write (runs in executor)"""
        with open(full_path, mode, encoding='utf-8') as f:
            f.write(content)

    async def write(self, file_path: str, content: str, mode: str = 'w'):
        """
        Queue file write (non-blocking)

        Args:
            file_path: Relative path from base_dir (e.g., 'page.jsonl')
            content: File content
            mode: 'w' (overwrite) or 'a' (append)
        """
        if self.write_queue.full():
            logger.log('WARN', 'WRITE_QUEUE_FULL', {
                'file_path': file_path,
                'queue_size': self.write_queue.qsize()
            })

        await self.write_queue.put((file_path, content, mode))

        logger.log('DEBUG', 'FILE_QUEUED', {
            'path': file_path,
            'queue_size': self.write_queue.qsize()
        })

    async def write_json(self, file_path: str, data: Dict[Any, Any]):
        """Convenience method for JSON files"""
        content = json.dumps(data, indent=2, ensure_ascii=False)
        await self.write(file_path, content, mode='w')

    async def write_jsonl(self, file_path: str, records: list):
        """Convenience method for JSONL files"""
        lines = [json.dumps(record, ensure_ascii=False) for record in records]
        content = '\n'.join(lines) + '\n'
        await self.write(file_path, content, mode='w')

    def get_metrics(self):
        """Get writer metrics"""
        return {
            'queue_size': self.write_queue.qsize(),
            'writes_completed': self.writes_completed,
            'writes_failed': self.writes_failed
        }

# Global instance
file_writer = AsyncFileWriter()
```

### Implementation (continued)

**File:** `om_e_web_ws/ws_server.py` - Integrate AsyncFileWriter

```python
# Add imports (top of file):
from async_file_writer import file_writer
from env import ENABLE_ASYNC_WRITES
import time

# In main() startup (around line 3650):
async def main():
    # ✅ Start async file writer (if feature flag enabled)
    if ENABLE_ASYNC_WRITES:
        await file_writer.start()
        logger.log('INFO', 'ASYNC_WRITES_ENABLED', {})
    else:
        logger.log('INFO', 'ASYNC_WRITES_DISABLED', {
            'using': 'Synchronous I/O (legacy)'
        })

    async with websockets.serve(handler, WS_HOST, WS_PORT):
        logger.log('INFO', 'WS_SERVER_STARTED', {
            'host': WS_HOST,
            'port': WS_PORT
        })

        try:
            await asyncio.Future()  # Run forever
        finally:
            if ENABLE_ASYNC_WRITES:
                await file_writer.stop()

# Replace all synchronous file writes:
# BEFORE (line ~2500):
async def save_intelligence_to_page_jsonl(intelligence_data):
    output_dir = "@site_structures"
    os.makedirs(output_dir, exist_ok=True)

    filepath = os.path.join(output_dir, "page.jsonl")
    with open(filepath, 'w') as f:  # ❌ BLOCKING
        f.write(content)

    return filepath

# AFTER:
async def save_intelligence_to_page_jsonl(intelligence_data):
    start = time.time()

    # Parse records from intelligence_data
    records = parse_intelligence_records(intelligence_data)

    if ENABLE_ASYNC_WRITES:
        # ✅ Non-blocking queue
        await file_writer.write_jsonl('page.jsonl', records)
        duration = (time.time() - start) * 1000
        logger.log('INFO', 'INTELLIGENCE_QUEUED', {
            'records': len(records),
            'duration_ms': duration
        })
        # Returns immediately, actual write happens in background
    else:
        # Legacy synchronous path
        output_dir = "@site_structures"
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, "page.jsonl")
        with open(filepath, 'w') as f:
            content = '\n'.join([json.dumps(r, ensure_ascii=False) for r in records]) + '\n'
            f.write(content)
        duration = (time.time() - start) * 1000
        logger.log('WARN', 'BLOCKING_IO_DETECTED', {
            'operation': 'save_intelligence_to_page_jsonl',
            'duration_ms': duration
        })

    return f"{output_dir}/page.jsonl" if not ENABLE_ASYNC_WRITES else "@site_structures/page.jsonl"

# Update all file write locations (~15 places):
# 1. save_intelligence_to_page_jsonl()
# 2. save_content_to_content_jsonl()
# 3. save_page_text_to_markdown()
# 4. process_actionable_elements_for_llm()
# 5. generate_llm_prompt()
# 6. save_transcript() (for YouTube transcripts)
```

### Validation

1. Enable feature flag in `env.py`:
   ```python
   ENABLE_ASYNC_WRITES = True  # Was False
   ```

2. Start server with verbose logging:
   ```bash
   OME_LOG_LEVEL=DEBUG python3 om_e_web_ws/ws_server.py
   ```

3. Send intelligence update from extension (navigate to any page)

4. Check server console - should see:
   ```
   [ws_server] INFO: INTELLIGENCE_QUEUED: {records: 156, duration_ms: 3.2}
   [ws_server] INFO: FILE_WRITTEN: {path: "page.jsonl", size_bytes: 45231}
   ```

5. Measure latency - handler should return in <10ms (was 100-500ms):
   ```python
   # In handler()
   start = time.time()
   await save_intelligence_to_page_jsonl(data)
   duration = (time.time() - start) * 1000
   logger.log('INFO', 'HANDLER_LATENCY', {'duration_ms': duration})
   # Should be <10ms with async writes
   ```

6. Verify file contents match synchronous version exactly:
   ```bash
   # Compare artifacts with baseline
   diff @site_structures/page.jsonl baseline/page.jsonl
   # Should be identical (except timestamps)
   ```

**Success Criteria:**
- [ ] WebSocket handler returns in <10ms (was 100-500ms)
- [ ] Files written correctly in background
- [ ] File contents identical to synchronous version
- [ ] Queue metrics accessible via `file_writer.get_metrics()`

---

## 3.2 Replace O(n²) Deduplication with O(n)

**Resolves:** Issue #3 (from SYSTEM_ARCHITECTURE.md) - 10+ second processing for 6k elements

### Implementation

**File:** `om_e_web_ws/ws_server.py` - Optimize deduplication logic

```python
# BEFORE (line ~2800 - O(n²) nested loops):
async def deduplicate_actions(actions):
    """
    ❌ O(n²) - 10+ seconds for 6k elements
    """
    unique_actions = []
    for action in actions:
        is_duplicate = False
        for existing in unique_actions:
            if action['selector'] == existing['selector']:
                is_duplicate = True
                break
        if not is_duplicate:
            unique_actions.append(action)
    return unique_actions

# AFTER - O(n) hash-based deduplication:
async def deduplicate_actions(actions):
    """
    O(n) deduplication using selector hash

    Performance: 6k elements in ~50ms (was 10+ seconds)

    Uses hash key combining selector + type + label for comprehensive uniqueness.
    Maintains first occurrence of each unique element.
    """
    start = time.time()

    if ENABLE_HASH_DEDUP:
        # ✅ O(n) hash-based dedup
        seen_selectors = set()
        unique_actions = []

        for action in actions:
            selector = action.get('selector')
            if not selector:
                logger.log('WARN', 'MALFORMED_ACTION', {
                    'action': action,
                    'missing': 'selector'
                })
                continue  # Skip malformed actions

            # Create hash key from selector + type + label (comprehensive uniqueness)
            hash_key = f"{selector}|{action.get('type', '')}|{action.get('label', '')}"

            if hash_key not in seen_selectors:
                seen_selectors.add(hash_key)
                unique_actions.append(action)

        duration = (time.time() - start) * 1000
        logger.log('INFO', 'DEDUP_HASH', {
            'input_count': len(actions),
            'output_count': len(unique_actions),
            'duplicates_removed': len(actions) - len(unique_actions),
            'duration_ms': duration
        })

        return unique_actions
    else:
        # Legacy O(n²) path (for rollback)
        unique_actions = []
        for action in actions:
            is_duplicate = False
            for existing in unique_actions:
                if action.get('selector') == existing.get('selector'):
                    is_duplicate = True
                    break
            if not is_duplicate:
                unique_actions.append(action)

        duration = (time.time() - start) * 1000
        logger.log('WARN', 'DEDUP_LEGACY', {
            'input_count': len(actions),
            'output_count': len(unique_actions),
            'duration_ms': duration,
            'algorithm': 'O(n²)'
        })

        return unique_actions
```

### Validation

1. Enable feature flag in `env.py`:
   ```python
   ENABLE_HASH_DEDUP = True  # Was False
   ```

2. Send intelligence update with 6k+ elements (complex page like Gmail)

3. Measure processing time - should complete in <100ms (was 10+ seconds):
   ```bash
   # Server log should show:
   [ws_server] INFO: DEDUP_HASH: {
     input_count: 6234,
     output_count: 5891,
     duplicates_removed: 343,
     duration_ms: 47.3
   }
   ```

4. Verify correctness - count unique selectors manually vs algorithm output:
   ```python
   # Test script
   async def test_dedup_correctness():
       # Generate test data with known duplicates
       actions = [
           {'selector': 'div.test', 'type': 'click', 'label': 'Test'},
           {'selector': 'div.test', 'type': 'click', 'label': 'Test'},  # Duplicate
           {'selector': 'div.test2', 'type': 'click', 'label': 'Test2'},
           {'selector': 'div.test', 'type': 'hover', 'label': 'Test'},  # Different type
       ]

       result = await deduplicate_actions(actions)

       # Should have 3 unique: (div.test, click), (div.test2, click), (div.test, hover)
       assert len(result) == 3, f"Expected 3, got {len(result)}"
       print("✅ Dedup correctness verified")

   asyncio.run(test_dedup_correctness())
   ```

**Success Criteria:**
- [ ] Processing time <100ms for 6k elements (was 10+ seconds)
- [ ] Correctness maintained (manual verification matches algorithm)
- [ ] Logs show hash-based dedup active
- [ ] Performance budget met: 100x improvement

---

## 3.3 Add Input Validation and Error Handling

**Resolves:** Issue #16 (from original roadmap) - No input validation

### Implementation

**File:** `om_e_web_ws/ws_server.py` - Add validation layer

```python
import jsonschema
from jsonschema import validate, ValidationError

# ✅ Define message schemas
MESSAGE_SCHEMAS = {
    'llm_instruction': {
        'type': 'object',
        'required': ['type', 'data'],
        'properties': {
            'type': {'enum': ['llm_instruction']},
            'data': {
                'type': 'object',
                'required': ['actionId', 'actionType'],
                'properties': {
                    'actionId': {'type': 'string', 'pattern': '^a_id_\\d+$'},
                    'actionType': {'enum': ['click', 'setValue', 'navigate', 'submit', 'getText']},
                    'value': {'type': 'string'}
                }
            }
        }
    },
    'execute_capability': {
        'type': 'object',
        'required': ['type', 'action'],
        'properties': {
            'type': {'enum': ['execute_capability']},
            'action': {'type': 'string'},
            'params': {'type': 'object'}
        }
    },
    'intelligence_update': {
        'type': 'object',
        'required': ['type', 'data'],
        'properties': {
            'type': {'enum': ['intelligence_update']},
            'tabId': {'type': 'integer'},
            'tabUrl': {'type': 'string'},
            'data': {
                'type': 'object',
                'required': ['actionableElements'],
                'properties': {
                    'actionableElements': {'type': 'array'}
                }
            }
        }
    }
}

def validate_message(message: dict) -> tuple[bool, str]:
    """
    Validate incoming WebSocket message

    Returns: (is_valid, error_message)
    """
    msg_type = message.get('type')
    if not msg_type:
        return False, "Missing 'type' field"

    schema = MESSAGE_SCHEMAS.get(msg_type)
    if not schema:
        # Unknown type - allow but log
        logger.log('WARN', 'UNKNOWN_MESSAGE_TYPE', {
            'type': msg_type
        })
        return True, ""  # Don't block unknown types (forward compatibility)

    try:
        validate(instance=message, schema=schema)
        return True, ""
    except ValidationError as e:
        logger.log('ERROR', 'MESSAGE_VALIDATION_FAILED', {
            'type': msg_type,
            'error': e.message,
            'path': list(e.path)
        })
        return False, f"Validation error: {e.message}"

# Update handler (line ~3100):
async def handler(websocket, path):
    client_id = str(id(websocket))
    CLIENTS.add(websocket)
    logger.log('INFO', 'CLIENT_CONNECTED', {'client_id': client_id})

    try:
        async for message in websocket:
            # ✅ Parse JSON
            try:
                data = json.loads(message)
            except json.JSONDecodeError as e:
                logger.log('ERROR', 'INVALID_JSON', {
                    'client_id': client_id,
                    'error': str(e)
                })
                await websocket.send(json.dumps({
                    'error': 'Invalid JSON',
                    'details': str(e)
                }))
                continue

            # ✅ Validate message
            is_valid, error_msg = validate_message(data)
            if not is_valid:
                await websocket.send(json.dumps({
                    'error': 'Invalid message format',
                    'details': error_msg
                }))
                continue

            # ✅ Process valid message
            # ... existing handler logic

    except websockets.exceptions.ConnectionClosed:
        logger.log('INFO', 'CLIENT_DISCONNECTED', {'client_id': client_id})
    except Exception as e:
        logger.log('ERROR', 'HANDLER_ERROR', {
            'client_id': client_id,
            'error': str(e),
            'type': type(e).__name__
        })
        # Don't crash server on single connection error
    finally:
        CLIENTS.remove(websocket)
```

### Validation

1. Send malformed JSON:
   ```bash
   echo '{"invalid json' | websocat ws://127.0.0.1:17892
   # Should get: {"error": "Invalid JSON", "details": "..."}
   ```

2. Send message without 'type':
   ```bash
   echo '{"data": "test"}' | websocat ws://127.0.0.1:17892
   # Should get: {"error": "Invalid message format", "details": "Missing 'type' field"}
   ```

3. Send invalid actionId format:
   ```bash
   echo '{"type": "llm_instruction", "data": {"actionId": "invalid", "actionType": "click"}}' | websocat ws://127.0.0.1:17892
   # Should get: {"error": "Invalid message format", "details": "...pattern..."}
   ```

4. Send valid message - should process normally:
   ```bash
   python3 om_e_web_ws/test_navigation.py --action-id a_id_0 --action-type click
   # Should work normally
   ```

**Success Criteria:**
- [ ] All malformed messages rejected gracefully
- [ ] Server never crashes on invalid input
- [ ] Clear error messages returned to client
- [ ] Valid messages process normally

---

## 3.4 Refactor Monolithic Handler Function

**Resolves:** Issue #5 (from SYSTEM_ARCHITECTURE.md) - 800-line unmaintainable function

### Implementation

**File:** `om_e_web_ws/ws_server.py` - Extract message handlers

```python
# ✅ Split 800-line handler into focused functions

async def handle_llm_instruction(data: dict, client_ws):
    """Handle llm_instruction message type"""
    if not EXTENSION_WS:
        return {'error': 'Extension not connected'}

    action_data = data.get('data', {})

    logger.log('INFO', 'LLM_INSTRUCTION_RECEIVED', {
        'actionId': action_data.get('actionId'),
        'actionType': action_data.get('actionType')
    })

    await EXTENSION_WS.send(json.dumps({
        'type': 'execute_llm_action',
        'data': action_data
    }))
    return {'success': True}

async def handle_execute_capability(data: dict, client_ws):
    """Handle execute_capability message type"""
    if not EXTENSION_WS:
        return {'error': 'Extension not connected'}

    logger.log('INFO', 'CAPABILITY_EXECUTION', {
        'action': data.get('action'),
        'params': data.get('params', {})
    })

    await EXTENSION_WS.send(json.dumps(data))
    return {'success': True}

async def handle_intelligence_update(data: dict, client_ws):
    """
    Handle intelligence_update from extension

    Queues async artifact generation (non-blocking if ENABLE_ASYNC_WRITES)
    """
    start = time.time()

    # Extract metadata
    tab_id = data.get('tabId')
    tab_url = data.get('tabUrl')
    element_count = len(data.get('data', {}).get('actionableElements', []))

    logger.intelligence_update_start(tab_id, tab_url, element_count)

    # Queue async artifact generation
    asyncio.create_task(process_intelligence_async(data))

    duration = (time.time() - start) * 1000
    logger.log('INFO', 'INTELLIGENCE_UPDATE_QUEUED', {
        'tab_id': tab_id,
        'duration_ms': duration
    })

    return {'success': True}

async def process_intelligence_async(data: dict):
    """
    Background task for artifact generation

    This runs independently of WebSocket handler to prevent blocking
    """
    start = time.time()
    files_written = []

    try:
        # Parse intelligence data
        records = parse_intelligence_records(data)
        actionable_elements = data.get('data', {}).get('actionableElements', [])
        content_elements = data.get('data', {}).get('contentElements', [])
        text_data = data.get('data', {}).get('textData', '')

        # Write artifacts (non-blocking if async writes enabled)
        await save_intelligence_to_page_jsonl(data)
        files_written.append('page.jsonl')

        await save_content_to_content_jsonl(content_elements)
        files_written.append('content.jsonl')

        await process_actionable_elements_for_llm(actionable_elements)
        files_written.append('llm_actions.json')

        await save_page_text_to_markdown(text_data)
        files_written.append('text.md')

        await generate_llm_prompt()
        files_written.append('llm_prompt.md')

        duration = (time.time() - start) * 1000
        logger.intelligence_update_complete(duration, files_written)

    except Exception as e:
        logger.log('ERROR', 'ARTIFACT_GENERATION_FAILED', {
            'error': str(e),
            'stack': traceback.format_exc()
        })

# ✅ Main handler becomes message router (50 lines instead of 800)
async def handler(websocket, path):
    """
    WebSocket message router

    Dispatches to specialized handlers based on message type.
    Keeps handler logic minimal and focused.
    """
    client_id = str(id(websocket))
    CLIENTS.add(websocket)
    logger.log('INFO', 'CLIENT_CONNECTED', {'client_id': client_id})

    # ✅ Message type → handler mapping
    handlers = {
        'llm_instruction': handle_llm_instruction,
        'execute_capability': handle_execute_capability,
        'intelligence_update': handle_intelligence_update,
        'navigate': handle_navigate,
        'click': handle_click,
        'set_value': handle_set_value,
        # ... add more handlers
    }

    try:
        async for message in websocket:
            # Parse and validate
            try:
                data = json.loads(message)
            except json.JSONDecodeError as e:
                await websocket.send(json.dumps({'error': 'Invalid JSON', 'details': str(e)}))
                continue

            is_valid, error_msg = validate_message(data)
            if not is_valid:
                await websocket.send(json.dumps({'error': error_msg}))
                continue

            # Route to handler
            msg_type = data.get('type')
            handler_func = handlers.get(msg_type)

            if handler_func:
                try:
                    result = await handler_func(data, websocket)
                    if result and not data.get('no_response'):
                        await websocket.send(json.dumps(result))
                except Exception as e:
                    logger.log('ERROR', 'HANDLER_EXCEPTION', {
                        'type': msg_type,
                        'error': str(e)
                    })
                    await websocket.send(json.dumps({
                        'error': f'Handler error: {str(e)}'
                    }))
            else:
                logger.log('WARN', 'NO_HANDLER', {'type': msg_type})
                await websocket.send(json.dumps({
                    'error': f'No handler for type: {msg_type}'
                }))

    except websockets.exceptions.ConnectionClosed:
        logger.log('INFO', 'CLIENT_DISCONNECTED', {'client_id': client_id})
    except Exception as e:
        logger.log('ERROR', 'HANDLER_ERROR', {
            'client_id': client_id,
            'error': str(e)
        })
    finally:
        CLIENTS.remove(websocket)
```

### Validation

1. Review ws_server.py line count:
   ```bash
   # Count lines in handler function
   sed -n '/^async def handler/,/^async def/p' ws_server.py | wc -l
   # Should be <100 lines (was 800+)
   ```

2. Verify each message type has dedicated handler:
   ```bash
   grep -n "^async def handle_" ws_server.py
   # Should show list of focused handler functions
   ```

3. Test all message types still work:
   ```bash
   # Test LLM instruction
   python3 test_navigation.py --action-id a_id_0 --action-type click

   # Test capability
   python3 test_navigation.py --command capability --capability RetrieveTranscript

   # Test intelligence update (navigate to any page)
   ```

4. Check error handling in each handler:
   ```bash
   # Send message that triggers error
   # Each handler should return clear error, not crash server
   ```

**Success Criteria:**
- [ ] `handler()` function <100 lines (was 800+)
- [ ] Each message type in focused function (<50 lines each)
- [ ] All message types still work
- [ ] Error handling in each handler
- [ ] No global try/catch hiding errors

---

## Phase 3 Summary

**Issues Resolved:** #2, #3, #5 (blocking I/O, O(n²) dedup, monolithic functions)
**Time:** 5-7 days
**Risk:** Medium - touching core server logic
**New Files:** `async_file_writer.py`

**Validation Checkpoint (MUST PASS before Phase 4):**

Run automated invariant check:
```bash
python3 tests/phase3_invariant_check.py
```

**Manual Validation:**
- [ ] WebSocket handler returns in <10ms (measure with logs)
- [ ] Artifact writes happen in background (check timestamps)
- [ ] 6k element deduplication in <100ms (run test)
- [ ] All malformed messages rejected gracefully (test bad JSON)
- [ ] handler() function <100 lines (count lines)

**Performance Budget Check:**
- [ ] Handler latency: <10ms ✅ (baseline: 100-500ms)
- [ ] Dedup (6k elements): <100ms ✅ (baseline: 10+ seconds)
- [ ] Server responsiveness: 100% ✅ (baseline: 0%)
- [ ] Throughput: >200 msg/sec ✅ (baseline: 2-3 msg/sec)

**Feature Flags:**
```python
# env.py - flip to enable Phase 3
ENABLE_ASYNC_WRITES = True  # Was False
ENABLE_HASH_DEDUP = True    # Was False
```

**Git Checkpoint:**
```bash
git commit -m "Phase 3 Complete: Async Server Architecture"
git tag phase3-complete
```

**Rollback if invariants fail:**
```python
# env.py
ENABLE_ASYNC_WRITES = False
ENABLE_HASH_DEDUP = False
```

---

# PHASE 4: ERROR HANDLING & RESILIENCE (Week 4)
# PHASE 5: TESTING & VALIDATION (Week 5-6)
# PHASE 6: CLEANUP & DOCUMENTATION (Week 7)

**Note:** Phases 4-6 follow the same enhanced structure with:
- Performance budgets
- Hard invariant checks
- Feature flags
- Detailed validation
- Git checkpoints
- Rollback plans

Full details in original Master_Refactoring_Roadmap.md sections (no changes to those phases beyond adding the enhanced structure established in Phases 0-3).

---

# COMPLETE TRIGGER MAPPING REFERENCE

**All 8 Triggers with Routing Plan:**

| # | Component | Line | Event | Function | Priority | Routes To (Phase 2) | Status |
|---|-----------|------|-------|----------|----------|---------------------|--------|
| 1 | sw.js | 1255 | webNavigation.onCompleted | triggerIntelligenceScan() | High | NavigationCoordinator → ensureInjected() | Phase 2 |
| 2 | sw.js | 1264 | webNavigation.onHistoryStateUpdated | triggerIntelligenceScan() | High | NavigationCoordinator → ensureInjected() | Phase 2 |
| 3 | sw.js | 1282 | tabs.onUpdated (complete) | triggerIntelligenceScan() | High | NavigationCoordinator → ensureInjected() | Phase 2 |
| 4 | content.js | 244 | setTimeout (4s fallback) | scheduleInitialScan() | Low | **DELETE** | Phase 2 |
| 5 | content.js | 1634 | DOMContentLoaded | initializeIntelligenceSystem() | High | ScanController.requestScan('DOMContentLoaded', 'high') | Phase 2 |
| 6 | content.js | 170 | pageIdleMonitor.waitForIdle() | runScanAfterPageLoad() | High | ScanController.requestScan('pageIdle', 'high') | Phase 2 |
| 7 | content.js | 7145 | setupEventDrivenUpdates() | queueIntelligenceUpdate() | Normal | ScanController.requestScan('focus', 'normal') | Phase 2 |
| 8 | content.js | 3878 | analyzeStructureChanges() | registerInteractiveSubtree() | Low | ScanController.requestScan('mutation', 'low') + scan lock check | Phase 1 & 2 |

---

# IMPLEMENTATION TIMELINE (8 Weeks)

## Week 0: Baseline & Config
- [ ] Days 1-3: **Phase 0** - Instrumentation, logging, baseline metrics
- [ ] Days 4-5: **Phase 0.5** - Config centralization

## Week 1: Stop the Bleeding
- [ ] Days 1-2: Fix primary bug (registerInteractiveSubtree)
- [ ] Day 2-3: Add DOM deduplication
- [ ] Day 3-4: Fix global action lock, content script reinjection
- [ ] Day 4: Add CLI concurrency lock
- [ ] Day 5: Testing and validation, **Phase 1 gate**

## Week 2: Scan Coordination
- [ ] Days 1-3: Extract ScanController module
- [ ] Days 3-4: Consolidate sw.js triggers (NavigationCoordinator)
- [ ] Day 4: Remove undefined functions
- [ ] Day 5: Testing and validation, **Phase 2 gate**

## Week 3: Async Server
- [ ] Days 1-2: Create AsyncFileWriter
- [ ] Days 2-3: Replace O(n²) algorithms
- [ ] Day 3-4: Add input validation
- [ ] Days 4-5: Refactor monolithic handler, **Phase 3 gate**

## Week 4: Error Handling
- [ ] Days 1-2: Content script error boundaries
- [ ] Days 2-3: Service worker recovery
- [ ] Days 3-4: Server graceful shutdown
- [ ] Day 5: Testing and validation, **Phase 4 gate**

## Week 5-6: Testing
- [ ] Week 5 Days 1-2: Unit tests (ScanController, AsyncFileWriter)
- [ ] Week 5 Days 2-3: Integration tests
- [ ] Week 5 Days 3-4: Performance benchmarks
- [ ] Week 5 Day 5: Fix failing tests
- [ ] Week 6: Enhanced component-specific testing matrix, **Phase 5 gate**

## Week 7: Cleanup
- [ ] Days 1-2: Remove dead code
- [ ] Days 2-3: Add documentation
- [ ] Days 3-4: Update architecture docs
- [ ] Day 5: Final validation, **Phase 6 gate**

## Week 8: Buffer
- [ ] Week 8: Buffer for invariant failures and rework

---

# VALIDATION GATES (MUST PASS to proceed)

## Phase 0 Gate ✅
- [ ] Structured logs visible in all components
- [ ] Invariant dashboard logs every 10s
- [ ] Baseline metrics captured for 3+ test pages
- [ ] Git tag created: `phase0-baseline`

## Phase 0.5 Gate ✅
- [ ] Config modules loaded successfully
- [ ] Feature flags accessible (all defaulting to legacy mode)
- [ ] Timing behavior unchanged
- [ ] Server accepts env var overrides

## Phase 1 Gate 🔴 (HARD STOP)
- [ ] Zero duplicate action IDs after 10 navigations (automated test)
- [ ] Multi-tab actions work independently (automated test)
- [ ] Exactly 1 content script per tab (DevTools check)
- [ ] CLI blocks concurrent runs (manual test)
- [ ] Action ID inflation <5%

## Phase 2 Gate 🔴 (HARD STOP)
- [ ] Single scan per navigation event (log verification)
- [ ] Debounced mutation scans (300ms window confirmed)
- [ ] Zero duplicate navigation processing (NAV_DEDUPED logs)
- [ ] Counter increments monotonically (automated test)
- [ ] Scan frequency: 1-2 per navigation

## Phase 3 Gate 🔴 (HARD STOP)
- [ ] WebSocket handler returns in <10ms (measured)
- [ ] Artifact writes happen in background (timestamp check)
- [ ] 6k element deduplication in <100ms (automated test)
- [ ] All malformed messages rejected gracefully (manual test)
- [ ] Server responsiveness: 100%

## Phase 4-6 Gates
*Follow same pattern with hard metrics and automated tests*

---

# ROLLBACK PLAN

**Per-Phase Rollback:**

```bash
# Rollback to any phase
git checkout phase0-baseline   # Before all changes
git checkout phase1-complete   # After Phase 1
git checkout phase2-complete   # After Phase 2
git checkout phase3-complete   # After Phase 3
```

**Feature Flag Rollback:**

```javascript
// env.js - instant rollback without code changes
ENABLE_SCAN_CONTROLLER: false,      // Phase 2
ENABLE_ACTION_REGISTRY: false,      // Phase 2
ENABLE_SINGLE_INJECTION_MANAGER: false  // Phase 1
```

```python
# env.py
ENABLE_ASYNC_WRITES = False   # Phase 3
ENABLE_HASH_DEDUP = False     # Phase 3
```

**Rollback Testing:**

After each phase, test rollback:
1. Set feature flags to `false`
2. Reload extension / restart server
3. Verify functionality identical to pre-phase
4. If issues found, fix before proceeding

---

# SUCCESS METRICS

## Before Refactoring (Baseline - Documented in BASELINE_RESULTS.md)
- Action ID inflation: +200% after 3 navigations
- Scan frequency: 8 triggers per navigation
- Server latency (small page): 100-200ms
- Server latency (large page): 500-1000ms
- Dedup time (6k elements): 10+ seconds
- Site map processing: 5-30 seconds (blocking)
- Server responsiveness during update: 0% (blocked)
- Multi-tab: Broken (global lock)
- Error handling: None (silent failures)
- Test coverage: 0%
- Code maintainability: 800-line functions

## After Refactoring (Target - Validated at Phase 6)
- Action ID inflation: 0% after 10 navigations ✅
- Scan frequency: 1-2 per navigation ✅
- Server latency: <10ms per message ✅
- Dedup time (6k elements): <100ms ✅
- Site map processing: <1s (non-blocking) ✅
- Server responsiveness: 100% ✅
- Multi-tab: Independent per-tab state ✅
- Error handling: Comprehensive boundaries and recovery ✅
- Test coverage: >80% critical paths ✅
- Code maintainability: <100 line functions ✅

---

# FINAL NOTES

This v2 roadmap addresses **all 5 critical issues** (from SYSTEM_ARCHITECTURE_COMPLETE.md) through **8 structured phases** (including new Phase 0 and 0.5) with:

✅ **Phase 0 baseline** - Measurement before changes
✅ **Config centralization** - Feature flags for safe rollout
✅ **Exact line numbers** - From SYSTEM_ARCHITECTURE_COMPLETE.md
✅ **Performance budgets** - Hard targets per phase
✅ **Automated invariants** - Tests that MUST pass to proceed
✅ **Trigger mapping** - All 8 triggers documented with routing
✅ **Rollback plans** - Git tags + feature flags
✅ **Testing strategy** - Component-specific matrix
✅ **Success metrics** - Quantifiable improvements
✅ **8-week timeline** - Including 2-week buffer

**Key Improvements Over v1:**
1. **Phase 0/0.5 added** - Baseline and config before refactoring
2. **Hard invariant gates** - Automated tests block phase progression
3. **Performance budgets** - Per-phase metrics that must be met
4. **Trigger mapping reference** - Complete table with exact line numbers
5. **Feature flags** - Safe rollout without code changes
6. **Enhanced logging** - Structured observability from day 1

**Next Steps:**
1. Review this v2 roadmap ✅
2. Confirm approach and timeline
3. Capture baseline metrics (Phase 0.1)
4. Begin Phase 0: Baseline & Instrumentation

Let's transform Om-E-Web into production-grade software! 🚀
