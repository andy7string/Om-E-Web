# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Om_E_Web** is a Chrome Extension (MV3) + Python WebSocket server that transforms web pages into LLM-actionable intelligence. The system scans DOM elements, generates structured artifacts (`page.jsonl`, `llm_actions.json`, `llm_prompt.md`), and executes LLM instructions via a bidirectional WebSocket pipeline.

**Key differentiator:** Site-config-driven architecture allows adding new automation capabilities without modifying runtime code—just update `web_extension/site_configs.json`.

## OME Coding Philosophy

This project follows a specific coding culture that prioritizes clarity and simplicity:

### Core Principles
- **Simple > Clever** — Prefer clear, short code over abstract solutions
- **Comments everywhere** — At file top (purpose + data flow), before functions (purpose + example), inside logic (anything non-trivial)
- **Globals are acceptable** — Used for shared state, config, environment toggles, caching (must be documented with examples)
- **Config-driven logic** — Use config objects/JSON when it simplifies behaviour
- **NO TIMERS, NO MAGIC NUMBERS** — Event-driven ONLY. All numbers come from config. No `x = 5000`. No `setTimeout` unless explicitly justified and approved.
- **Functional testing mindset** — After writing code, provide: how to test, input/output examples, edge cases, optional automated tests
- **Async everywhere** — JS: async/await only; Python: asyncio & websockets

### Workflow Rules (REQUIRED)
1. **Always start with design discussion** — Ask about design, verify architecture, summarize high-level flow, wait for approval
2. **Create testable plan** — Short (3-6 steps), testable, validated before coding
3. **Step-by-step execution** — Finish one step, show results, provide test instructions, wait for confirmation
4. **Never skip steps** unless instructed
5. **Use Australian English** — Tone: calm, direct, practical, supportive

### What NOT to Do
- Don't remove OME-style comments
- Don't refactor across languages without confirming
- Don't merge unrelated changes
- Don't produce verbose over-engineered code
- Don't force external dogma or corporate standards

### File Access Rules
- May modify any file but must explain intention
- Ask when changing cross-component protocols
- Avoid refactoring multiple subsystems at once unless approved
- Don't restructure directories without permission
- Show diffs when modifying code
- Keep edits tightly scoped unless told otherwise

### JavaScript/Extension Guidelines
- Keep content.js stable, readable, predictable
- Add comments around scanning, mutation observers, idle logic
- Use pure functions where helpful
- Avoid giant classes unless genuinely needed
- Make logic retry-friendly and SPA-friendly
- Hardcoded timing, selectors, fallbacks are allowed (with explanation)
- Avoid over-engineering, deep abstraction chains, callback hell

### Python/Server Guidelines
- Use async/await for all networking
- Keep ws_server.py functions short and predictable
- Comment data flows, file writes, and message formats
- Implement clear helper functions for repeated patterns
- Hardcoded paths allowed but not preferred (with explanation)

---

## CODE STANDARDS & QUALITY REQUIREMENTS

**These are NON-NEGOTIABLE standards for all new code and refactoring work.**

### Hard Limits (Enforced)

| Standard | Limit | Why | Enforcement |
|----------|-------|-----|-------------|
| **Function length** | ≤100 lines | Readability, testability | Code review blocker if exceeded |
| **File length** | ≤500 lines | Module focus, maintainability | Split into multiple modules |
| **Function parameters** | ≤5 params | Cognitive load, use objects for more | Refactor to options object |
| **Nesting depth** | ≤3 levels | Complexity, readability | Extract functions |
| **Cyclomatic complexity** | ≤10 | Testability, maintainability | Simplify logic, extract functions |
| **Code duplication** | 0 instances | DRY principle | Extract to shared utility |
| **Type coverage** | 100% | Catch bugs early | JSDoc for JS, type hints for Python |
| **Test coverage** | ≥80% critical paths | Prevent regressions | Automated check on PR |

### Function Size Examples

```javascript
// ❌ BAD: 429-line function (REJECT in code review)
function buildNormalizedPageRecords() {
  // 429 lines of nested logic
  // Impossible to test, understand, or maintain
}

// ✅ GOOD: 7 focused functions @ ~50 lines each
function extractPageMeta() { ... }      // 40 lines
function extractSections() { ... }      // 60 lines
function extractActionables() { ... }   // 50 lines
function extractContent() { ... }       // 45 lines
function normalizeRecord() { ... }      // 30 lines
function addMetadata() { ... }          // 35 lines
function buildPageRecord() { ... }      // 40 lines
```

### Code Duplication Examples

```javascript
// ❌ BAD: Duplicate utility in 3 places (REJECT)
// content.js line 3000
function generateSelector(element) { /* implementation */ }

// content.js line 5000
function generateSelector(element) { /* same implementation */ }

// sw.js line 500
function generateSelector(element) { /* same implementation */ }

// ✅ GOOD: Single shared implementation
// web_extension/src/common/dom-utils.js
export function generateSelector(element) { /* implementation */ }

// Import everywhere needed
import { generateSelector } from '../common/dom-utils.js';
```

---

## ARCHITECTURAL PRINCIPLES

**Follow these principles religiously. Violations require explicit justification.**

### 1. Single Responsibility Principle (SRP)

**Rule:** Every module, class, and function does ONE thing and does it well.

```javascript
// ❌ BAD: Class doing 3 things (scan + execute + monitor)
class IntelligenceEngine {
  scanAndRegisterElements() { ... }
  executeAction() { ... }
  monitorPageChanges() { ... }
}

// ✅ GOOD: Each class has single responsibility
class ScanController {
  scanAndRegisterElements() { ... } // ONLY scanning
}

class ActionExecutor {
  executeAction() { ... } // ONLY execution
}

class PageMonitor {
  monitorPageChanges() { ... } // ONLY monitoring
}
```

### 2. DRY (Don't Repeat Yourself)

**Rule:** Zero tolerance for code duplication. Extract to shared utility.

```python
# ❌ BAD: Same deduplication logic in 2 places
def process_actions(actions):
    unique = []
    for action in actions:
        if action not in unique:
            unique.append(action)
    return unique

def process_elements(elements):
    unique = []
    for element in elements:
        if element not in unique:
            unique.append(element)
    return unique

# ✅ GOOD: Single reusable function
def deduplicate_list(items):
    """Generic deduplication using set"""
    return list(dict.fromkeys(items))

# Use everywhere
unique_actions = deduplicate_list(actions)
unique_elements = deduplicate_list(elements)
```

### 3. Dependency Injection

**Rule:** Never hard-code dependencies. Inject them in constructor.

```javascript
// ❌ BAD: Hard-coded global dependency
class ActionExecutor {
  constructor() {
    this.engine = window.intelligenceEngine; // Hard-coded!
  }
}

// ✅ GOOD: Injected dependency (testable)
class ActionExecutor {
  constructor(engine) {
    this.engine = engine; // Injected, can mock in tests
  }
}

// Usage
const engine = new IntelligenceEngine();
const executor = new ActionExecutor(engine); // Inject
```

### 4. Event-Driven ONLY (NO TIMERS)

**Rule:** Use events/observers. NO `setTimeout`, NO `setInterval`, NO polling. Period.

**If you think you need a timer, you're wrong. Find the event.**

```javascript
// ❌ BANNED: Any timer-based logic
setInterval(() => {
  if (pageChanged()) scan();
}, 1000);

setTimeout(() => scan(), 5000);

let debounceTimer;
clearTimeout(debounceTimer);
debounceTimer = setTimeout(() => scan(), 300);

// ✅ GOOD: Pure event-driven
const observer = new MutationObserver((mutations) => {
  // React to ACTUAL change, not arbitrary timeout
  scanController.handleMutations(mutations);
});

// ✅ GOOD: Debouncing via event batching (no timers!)
class EventBatcher {
  constructor() {
    this.pendingEvents = [];
    this.batchSize = 10; // From config, not hardcoded
  }

  addEvent(event) {
    this.pendingEvents.push(event);
    if (this.pendingEvents.length >= this.batchSize) {
      this.flush();
    }
  }

  flush() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    this.processBatch(events);
  }
}

// ✅ GOOD: Request idle callback (browser decides timing)
requestIdleCallback(() => {
  scanController.scanWhenReady();
});

// ✅ GOOD: IntersectionObserver (event when element visible)
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      registerElement(entry.target);
    }
  });
});
```

**Valid alternatives to timers:**
- `MutationObserver` - DOM changes
- `IntersectionObserver` - Element visibility
- `ResizeObserver` - Size changes
- `requestIdleCallback` - Browser idle time
- `requestAnimationFrame` - Frame rendering
- Event listeners (`load`, `DOMContentLoaded`, `focus`, etc.)
- Promises/async/await - Wait for conditions
- Event batching - Collect events, flush on count/condition

**If you absolutely MUST use a timer (extremely rare):**
1. Get explicit approval first
2. Put delay in config: `window.OME_ENV.SOME_DELAY_MS`
3. Document WHY event-driven won't work
4. Plan to replace it with events in next iteration

### 5. Async I/O Always

**Rule:** Never block the event loop with synchronous I/O.

```python
# ❌ BAD: Blocking I/O in async function
async def save_artifact(data):
    with open('page.jsonl', 'w') as f:  # BLOCKS for 100-500ms
        f.write(json.dumps(data))

# ✅ GOOD: Non-blocking I/O
async def save_artifact(data):
    await file_writer.write_jsonl('page.jsonl', data)  # Queued, returns in <5ms
```

### 6. Fail Fast with Clear Errors

**Rule:** Validate inputs early, return clear error messages.

```javascript
// ❌ BAD: Silent failure or cryptic error
async function executeAction(actionId, actionType) {
  const element = elements[actionId]; // undefined if missing
  element.click(); // TypeError: Cannot read property 'click' of undefined
}

// ✅ GOOD: Explicit validation with clear errors
async function executeAction(actionId, actionType) {
  if (!actionId) {
    return { ok: false, error: 'actionId is required' };
  }

  const element = elements[actionId];
  if (!element) {
    return { ok: false, error: `Action ID not found: ${actionId}` };
  }

  try {
    element.click();
    return { ok: true, result: { clicked: true } };
  } catch (err) {
    return { ok: false, error: `Click failed: ${err.message}` };
  }
}
```

### 7. Immutability Where Possible

**Rule:** Prefer const, avoid mutating objects, use pure functions.

```javascript
// ❌ BAD: Mutating input
function processActions(actions) {
  actions.forEach(action => {
    action.processed = true; // Mutates input!
  });
  return actions;
}

// ✅ GOOD: Immutable transformation
function processActions(actions) {
  return actions.map(action => ({
    ...action,
    processed: true // New object
  }));
}
```

---

## TYPE SAFETY REQUIREMENTS

**All new code must be fully typed. No exceptions.**

### JavaScript: JSDoc Types (100% coverage required)

```javascript
/**
 * Execute action by ID
 *
 * @param {string} actionId - Element action ID (e.g., "a_id_0")
 * @param {'click'|'setValue'|'navigate'} actionType - Type of action
 * @param {object} [params={}] - Optional parameters
 * @param {string} [params.value] - Value for setValue action
 * @param {boolean} [params.submit=false] - Submit form after setValue
 * @returns {Promise<{ok: boolean, result?: any, error?: string}>}
 * @throws {Error} If action type is unknown
 *
 * @example
 * const result = await executor.executeAction('a_id_0', 'click');
 * if (result.ok) {
 *   console.log('Success:', result.result);
 * } else {
 *   console.error('Error:', result.error);
 * }
 */
async function executeAction(actionId, actionType, params = {}) {
  // Implementation
}
```

**Required JSDoc tags:**
- `@param` for every parameter (with type and description)
- `@returns` for return value (with type)
- `@throws` if function can throw
- `@example` for complex functions
- `@typedef` for custom types

**Custom type definitions:**
```javascript
/**
 * @typedef {object} ActionResult
 * @property {boolean} ok - Whether action succeeded
 * @property {any} [result] - Result data if successful
 * @property {string} [error] - Error message if failed
 */

/**
 * Execute action
 * @returns {Promise<ActionResult>}
 */
async function executeAction(actionId, actionType) { ... }
```

### Python: Type Hints (100% coverage required)

```python
from typing import Dict, List, Optional, Any, Tuple

async def handle_llm_instruction(
    message: dict,
    websocket: WebSocket,
    server: WebSocketServer
) -> dict:
    """
    Handle LLM instruction message

    Args:
        message: Incoming message with type and data
        websocket: Client WebSocket connection
        server: Server instance

    Returns:
        Response dict with success/error status

    Raises:
        ValueError: If message format is invalid
    """
    action_data: dict = message.get('data', {})
    action_id: str = action_data.get('actionId')

    if not action_id:
        return {'error': 'actionId is required'}

    await server.extension_ws.send(json.dumps(message))
    return {'success': True}
```

**Required type hints:**
- Function parameters (all)
- Return types (all functions)
- Variable types (for complex/ambiguous cases)
- Use `Optional[T]` for nullable types
- Use `Union[A, B]` for multiple types
- Use `Dict[K, V]` instead of `dict`
- Use `List[T]` instead of `list`

---

## MODULE ORGANIZATION RULES

**Follow this structure for all new code. No monolithic files.**

### JavaScript Module Structure

```
web_extension/src/
├── common/                  # Shared utilities
│   ├── logger.js            # ≤100 lines
│   ├── env.js               # ≤50 lines
│   ├── types.js             # Type definitions only
│   └── dom-utils.js         # ≤150 lines
│
├── content/                 # Content script modules
│   ├── main.js              # Entry point ≤100 lines
│   ├── ScanController.js    # ≤200 lines
│   ├── ActionExecutor.js    # ≤200 lines
│   └── [feature].js         # ≤200 lines per module
│
└── service-worker/          # Service worker modules
    ├── main.js              # Entry point ≤100 lines
    ├── WebSocketClient.js   # ≤150 lines
    └── [feature].js         # ≤200 lines per module
```

**Rules:**
- **Entry points** (`main.js`): ≤100 lines, initialization only
- **Feature modules**: ≤200 lines, single responsibility
- **Utility modules**: ≤150 lines, pure functions
- **Type definition files**: Type definitions only, no logic
- **One class per file** (unless closely related)
- **Export/import only**: No global namespace pollution

### Python Module Structure

```
om_e_web_ws/src/
├── server/                  # Server core
│   ├── main.py              # Entry point ≤100 lines
│   ├── websocket_server.py  # ≤150 lines
│   └── message_router.py    # ≤100 lines
│
├── handlers/                # Message handlers
│   ├── llm_instruction.py   # ≤50 lines per handler
│   ├── intelligence_update.py
│   └── [message_type].py
│
├── artifacts/               # Artifact generation
│   ├── async_file_writer.py # ≤150 lines
│   └── [artifact_type].py   # ≤100 lines per artifact
│
└── utils/                   # Shared utilities
    ├── logger.py            # ≤100 lines
    ├── deduplication.py     # ≤50 lines
    ├── validation.py        # ≤150 lines
    └── types.py             # Type definitions only
```

**Rules:**
- **Entry points**: ≤100 lines, setup only
- **Handlers**: ≤50 lines each, single message type
- **Utilities**: ≤150 lines, pure functions
- **One class per file** (unless closely related)
- **Async by default**: All I/O must be async

### When to Create a New Module

Create a new module if:
- File exceeds 200 lines
- Adding unrelated functionality
- Code is reused in 2+ places
- Distinct responsibility emerges

**Example:**
```javascript
// content.js grows to 300 lines with scanning + monitoring
// ❌ BAD: Keep adding to content.js

// ✅ GOOD: Split into modules
// src/content/main.js (100 lines) - initialization
// src/content/ScanController.js (150 lines) - scanning
// src/content/PageMonitor.js (100 lines) - monitoring
```

---

## TESTING REQUIREMENTS

**All new code must have tests. No exceptions.**

### Test Coverage Targets

| Code Type | Coverage | Test Type |
|-----------|----------|-----------|
| **Utility functions** | 100% | Unit tests |
| **Core modules** (ScanController, ActionExecutor) | 100% | Unit tests |
| **Message handlers** | 100% | Unit tests |
| **Integration flows** | ≥80% | Integration tests |
| **Error paths** | 100% | Unit tests |

### Unit Test Pattern (JavaScript)

```javascript
// tests/unit/test_scan_controller.js
import { ScanController } from '../../web_extension/src/content/ScanController.js';

describe('ScanController', () => {
  let mockEngine;
  let controller;

  beforeEach(() => {
    mockEngine = {
      scanAndRegisterElements: jest.fn().mockResolvedValue(undefined),
      elementCounter: 0,
      actionableElements: new Map()
    };
    controller = new ScanController(mockEngine);
  });

  test('debounces rapid scan requests', async () => {
    // Request 5 scans in 100ms
    controller.requestScan('test1', 'normal');
    controller.requestScan('test2', 'normal');
    controller.requestScan('test3', 'normal');
    controller.requestScan('test4', 'normal');
    controller.requestScan('test5', 'normal');

    await sleep(400); // Wait for debounce + execution

    // Should only execute 1 scan (debounced)
    expect(mockEngine.scanAndRegisterElements).toHaveBeenCalledTimes(1);
  });

  test('high priority bypasses debounce', async () => {
    controller.requestScan('urgent', 'high');
    expect(controller.scanInProgress).toBe(true);
  });

  test('navigation triggers reset counter', async () => {
    mockEngine.elementCounter = 100;
    await controller.executeScan('DOMContentLoaded');
    expect(mockEngine.elementCounter).toBe(0);
  });

  test('mutation does not reset counter', async () => {
    mockEngine.elementCounter = 100;
    await controller.executeScan('mutation');
    expect(mockEngine.elementCounter).toBe(100); // Preserved
  });
});
```

### Unit Test Pattern (Python)

```python
# tests/unit/test_deduplication.py
import pytest
from om_e_web_ws.src.utils.deduplication import deduplicate_actions

def test_removes_exact_duplicates():
    """Test deduplication removes exact duplicates"""
    actions = [
        {'selector': 'div.test', 'type': 'click', 'label': 'Test'},
        {'selector': 'div.test', 'type': 'click', 'label': 'Test'},  # Duplicate
        {'selector': 'div.other', 'type': 'click', 'label': 'Other'}
    ]

    result = deduplicate_actions(actions)

    assert len(result) == 2
    assert result[0]['selector'] == 'div.test'
    assert result[1]['selector'] == 'div.other'

def test_preserves_different_types():
    """Test different action types are not deduplicated"""
    actions = [
        {'selector': 'div.test', 'type': 'click', 'label': 'Test'},
        {'selector': 'div.test', 'type': 'hover', 'label': 'Test'}  # Different type
    ]

    result = deduplicate_actions(actions)

    assert len(result) == 2  # Both preserved

def test_performance_large_dataset():
    """Test O(n) performance on large dataset"""
    import time

    # Generate 10k actions
    actions = [{'selector': f'div.test-{i}', 'type': 'click'} for i in range(10000)]

    start = time.time()
    result = deduplicate_actions(actions)
    duration = time.time() - start

    assert len(result) == 10000
    assert duration < 0.1  # Should complete in <100ms
```

### Integration Test Pattern

```python
# tests/integration/test_full_flow.py
import asyncio
import websockets
import json

async def test_click_action_end_to_end():
    """Test full flow: CLI → Server → Extension → DOM"""

    # Start server (in background)
    # Load extension (in test browser)

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
        response = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))

        # Verify success
        assert response['ok'] == True
        assert response['result']['clicked'] == True
```

### Testing Checklist

Before merging, verify:
- [ ] All new functions have unit tests
- [ ] All error paths have tests
- [ ] Integration test covers happy path
- [ ] Test coverage ≥80% (run `npm test --coverage`)
- [ ] All tests pass (`npm test && pytest`)
- [ ] No test skips without justification

---

## PERFORMANCE BUDGETS

**These are hard limits. Exceeding them requires architectural review.**

| Metric | Budget | Measurement | Action if Exceeded |
|--------|--------|-------------|-------------------|
| **Server handler latency** | <10ms | Log in handler | Investigate blocking I/O |
| **Scan latency (typical page)** | <400ms | Log in ScanController | Optimize selectors |
| **Scan latency (complex page)** | <1000ms | Log in ScanController | Lazy loading, pagination |
| **Dedup (6k elements)** | <100ms | Log in dedup function | Review algorithm complexity |
| **Artifact write (perceived)** | <5ms | Log in handler | Ensure async writes enabled |
| **Function execution** | <50ms | Profile hot paths | Extract, optimize, or parallelize |
| **Memory per tab** | <50MB | Chrome DevTools | Review WeakMap/WeakSet usage |

### Measuring Performance

```javascript
// Example: Measure scan latency
async executeScan(trigger) {
  const start = performance.now();

  // ... scan logic

  const duration = performance.now() - start;
  logger.log('INFO', 'SCAN_COMPLETE', {
    trigger,
    duration,
    elementCount: this.engine.actionableElements.size
  });

  if (duration > 400) {
    logger.log('WARN', 'SCAN_SLOW', {
      trigger,
      duration,
      budget: 400
    });
  }
}
```

```python
# Example: Measure handler latency
async def handler(websocket, path):
    start = time.time()

    # ... handle message

    duration = (time.time() - start) * 1000
    logger.log('INFO', 'HANDLER_LATENCY', {
        'duration_ms': duration
    })

    if duration > 10:
        logger.log('WARN', 'HANDLER_SLOW', {
            'duration_ms': duration,
            'budget_ms': 10
        })
```

---

## CODE REVIEW CHECKLIST

**All code changes must pass this checklist before merging.**

### General Quality
- [ ] No function >100 lines
- [ ] No file >500 lines
- [ ] No code duplication (DRY)
- [ ] All functions have single responsibility (SRP)
- [ ] Clear, descriptive names (no abbreviations except standard ones)
- [ ] Comments explain WHY, not WHAT

### Type Safety
- [ ] JavaScript: 100% JSDoc coverage
- [ ] Python: 100% type hints
- [ ] All parameters typed
- [ ] All return values typed
- [ ] Custom types defined where needed

### Testing
- [ ] Unit tests for all new functions
- [ ] Integration tests for new flows
- [ ] Test coverage ≥80%
- [ ] All tests pass
- [ ] Error paths tested

### Performance
- [ ] No blocking I/O in async functions
- [ ] Event-driven, not polling (except debouncing)
- [ ] Performance budgets met (logged)
- [ ] No memory leaks (WeakMap/WeakSet used correctly)

### Architecture
- [ ] Dependencies injected, not hard-coded
- [ ] Module in correct directory (src/content/, src/server/, etc.)
- [ ] Imports from relative paths, not globals
- [ ] No circular dependencies

### Error Handling
- [ ] All errors caught and logged
- [ ] Clear error messages returned
- [ ] No silent failures
- [ ] Graceful degradation where appropriate

### Documentation
- [ ] README updated if public API changed
- [ ] JSDoc/docstring with examples
- [ ] CHANGELOG.md updated
- [ ] Migration guide if breaking change

---

## ANTI-PATTERNS TO AVOID

**These patterns are BANNED. Reject in code review.**

### 1. God Objects/Classes
```javascript
// ❌ BANNED: One class doing everything
class IntelligenceEngine {
  scanDOM() { ... }           // Scanning
  executeAction() { ... }     // Execution
  monitorChanges() { ... }    // Monitoring
  generateArtifacts() { ... } // Artifact generation
  handleMessages() { ... }    // Messaging
  // 2,000 lines of mixed responsibilities
}
```

### 2. Callback Hell
```javascript
// ❌ BANNED: Nested callbacks
function doSomething(callback) {
  doStep1(() => {
    doStep2(() => {
      doStep3(() => {
        callback();
      });
    });
  });
}

// ✅ USE: async/await
async function doSomething() {
  await doStep1();
  await doStep2();
  await doStep3();
}
```

### 3. Magic Numbers/Strings
```javascript
// ❌ BANNED: Magic numbers
setTimeout(scanDOM, 4000);
if (count > 300) { ... }

// ✅ USE: Named constants
const SCAN_DELAY_MS = 4000;
const MAX_ELEMENTS = 300;

setTimeout(scanDOM, SCAN_DELAY_MS);
if (count > MAX_ELEMENTS) { ... }
```

### 4. Mutable Global State
```javascript
// ❌ BANNED: Global mutable state
window.actionInProgress = false; // Global flag
window.elements = []; // Global array

// ✅ USE: Encapsulated state
class TabStateManager {
  constructor() {
    this.tabStates = new Map(); // Encapsulated
  }

  setActionInProgress(tabId, inProgress) {
    this.tabStates.get(tabId).actionInProgress = inProgress;
  }
}
```

### 5. Synchronous I/O in Async Context
```python
# ❌ BANNED: Blocking I/O in async function
async def save_artifact(data):
    with open('file.json', 'w') as f:  # BLOCKS event loop!
        f.write(json.dumps(data))

# ✅ USE: Async I/O
async def save_artifact(data):
    await file_writer.write_json('file.json', data)  # Non-blocking
```

---

## Architecture: Two Execution Pipelines

### 1. Standard Action-ID Pipeline (95% of cases)
Extension scans page → registers elements with `a_id_XXX` → generates artifacts → LLM reads artifacts → sends `execute_llm_action` with actionId

**Flow:**
```
test_navigation.py → ws_server.py → sw.js → content.js
Message: {"type": "llm_instruction", "data": {"actionId": "a_id_123", "actionType": "click"}}
```

### 2. Capability Pipeline (edge cases, dynamic content)
Bypasses action-ID registry, uses pure selector-based DOM scanning for lazy-loaded/modal elements. This enables **programmable web interaction** where complex multi-step workflows are defined declaratively in site_configs.json.

**Flow:**
```
test_navigation.py → ws_server.py → sw.js → content.js → capabilityPipelineExecutor()
Message: {"type": "execute_capability", "action": "RetrieveTranscript", "params": {}}
```

**Key functions:**
- `ws_server.py` line 3105-3129: Routes `execute_capability` to extension
- `sw.js` line 1442-1476: `handleExecuteCapability()` forwards to content script
- `content.js` line 10073-10226: `capabilityPipelineExecutor()` performs selector-based search

**Architecture principles:**
- **URL-pattern activation** — Capabilities only appear when URL matches pattern
- **Handler-based execution** — Server-side handlers orchestrate multi-step workflows
- **Declarative config** — Everything defined in site_configs.json, zero code changes needed
- **Extensible** — Add new sites/capabilities by editing config only

## Development Commands

### Environment Setup
```bash
# Python 3.11+ required, uses .venv virtual environment
# WebSocket library: websockets (async)
# Platform: Tested on macOS (Darwin)

# Activate virtual environment (if using .venv)
source .venv/bin/activate  # macOS/Linux
.venv\Scripts\activate     # Windows
```

### Running the System
```bash
# Start WebSocket server (required for all operations)
python om_e_web_ws/ws_server.py

# Test standard action execution
python3 om_e_web_ws/test_navigation.py --action-id a_id_123 --action-type click

# Test capability pipeline (dynamic element discovery)
python3 om_e_web_ws/test_navigation.py --command capability --capability RetrieveTranscript

# Set value and submit form
python3 om_e_web_ws/test_navigation.py --action-id a_id_0 --action-type setValue --value "search query" --submit
```

### Artifact Generation
```bash
# One-time generation of LLM-optimized snapshot
node om_e_web_ws/tools/create_llm_structure.js \
  om_e_web_ws/@site_structures/page.jsonl \
  om_e_web_ws/@site_structures/text.md \
  om_e_web_ws/@site_structures/llm_optimized.json

# Watch mode (auto-regenerate on file changes)
node om_e_web_ws/tools/watch_llm_structure.js
```

### Extension Development
```bash
# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select web_extension/ folder

# After code changes: click extension reload button in chrome://extensions/
# No restart needed for site_configs.json changes (service worker broadcasts instantly)
```

## Critical Architecture Concepts

### Site Config Contract
**File:** `web_extension/site_configs.json`

Each domain defines scanning behavior and capabilities without touching runtime code:

```json
{
  "youtube.com": {
    "framework": "youtube",
    "selectors": { /* DOM scan priorities */ },
    "focus_targets": [ /* auto-focus elements */ ],
    "capabilities": {
      "transcript": {
        "action": "RetrieveTranscript",
        "label": "Get video transcript",
        "description": "Retrieves the full transcript for this YouTube video",
        "url_pattern": "/watch?v=",
        "handler": "youtube_transcript_pipeline",
        "selectors": [ /* ordered priority: specific → generic */ ]
      }
    }
  }
}
```

**Adding new capabilities:** Edit site_configs.json only. Service worker broadcasts updates to all tabs instantly.

### Config Access Pattern (CRITICAL)
When accessing site config in `content.js`, always use the same pattern as the intelligence engine:

```javascript
// ✅ CORRECT: Use local siteConfig first, fallback to window
const activeConfig = siteConfig || window.currentSiteConfig;

// ❌ WRONG: Only check window (may be undefined)
const config = window.currentSiteConfig;
```

See `content.js` lines 5168-5170 (intelligence engine) and 10083-10084 (capability executor) for reference.

### Message Routing
All external commands flow through the same WebSocket pipeline:

```
Client → ws_server.py (port 17892) → sw.js (handleServerMessage) → content.js
```

**Key message types:**
- `llm_instruction` → standard action execution
- `execute_capability` → capability pipeline
- `intelligence_update` → artifact regeneration trigger
- `dom_content_changed` → real-time DOM change notifications

**Example LLM instruction flow:**
```
1. LLM/Client → Server: {"type": "llm_instruction", "data": {"actionId": "a_id_42", "actionType": "click"}}
2. Server → Extension: {"type": "execute_llm_action", "data": {...}}
3. Extension → Content: {"type": "execute_action", "data": {...}}
4. Content → DOM: Click element with actionId="a_id_42"
5. Response: DOM → Content → Extension → Server → LLM/Client
```

**Example intelligence update flow:**
```
1. Content Script: Scans page, registers elements
2. Content → Service Worker: Sends intelligence update
3. Service Worker → Server: Forwards intelligence data
4. Server: Writes page.jsonl, content.jsonl, llm_actions.json, etc.
5. LLM: Reads artifacts for next instruction
```

### Artifact Files (generated under `om_e_web_ws/@site_structures/`)

**Core artifacts (auto-generated on page updates):**
- `page.jsonl` — Ordered JSONL with meta, sections, text, actions
- `content.jsonl` — Cleaned headings, paragraphs, lists, images
- `text.md` — Human-readable transcript with frontmatter
- `llm_actions.json` — ActionId → metadata lookup (selectors, type, description)
- `llm_prompt.md` — Compact prompt with `return (a_id_X)` instructions
- `transcripts/*.md` — Long-form transcripts (e.g., YouTube) with signature-based deduplication

**LLM-optimized (manually generated):**
- `llm_optimized.json` — Compressed snapshot with markdown + packed action table

## Common Patterns

### Adding a New Capability
1. Edit `web_extension/site_configs.json`:
```json
"capabilities": {
  "myFeature": {
    "action": "ExecuteMyFeature",
    "label": "Human description",
    "url_pattern": "/specific/path",  // optional
    "selectors": [
      "button.specific-class[aria-label='Target']",
      "button[aria-label='Target']",  // fallback
      "button[aria-label*='target' i]"  // case-insensitive contains
    ]
  }
}
```

2. Test immediately (no extension reload needed):
```bash
python3 om_e_web_ws/test_navigation.py --command capability --capability ExecuteMyFeature
```

3. Capability executor will:
   - Look up action in site config
   - Try selectors in order (specific → generic)
   - Wait up to 5s for lazy-loaded elements
   - Click matched element
   - Trigger intelligence update

### Debugging Action Execution
```javascript
// In Chrome console on target page:

// Check config loaded
console.log("Config:", siteConfig || window.currentSiteConfig);

// Check actionable elements registered
console.log("Actions:", intelligenceEngine?.actionableElements);

// Manual capability test
document.querySelector('button[aria-label="Show transcript"]')?.click();
```

### Extending ws_server.py Message Handlers
Add new message type in `handler()` function around line 3105:
```python
if msg.get("type") == "my_new_command":
    # Handle command
    if EXTENSION_WS:
        await EXTENSION_WS.send(json.dumps({
            "type": "my_extension_message",
            "data": msg.get("data")
        }))
```

Then add corresponding handler in `sw.js` `handleServerMessage()` (line 621-669) and `content.js` onMessage listener (line 10229+).

## File Organization

**Extension (web_extension/):**
- `manifest.json` — MV3 config, permissions, web_accessible_resources
- `sw.js` — Service worker (WebSocket bridge, tab management, keep-alive)
- `content.js` — Content script (DOM operations, intelligence engine, action execution)
- `site_configs.json` — Per-domain scanning/capability config (THE configuration file)
- `popup.html/js` — Extension UI for status monitoring

**Server (om_e_web_ws/):**
- `ws_server.py` — Main WebSocket server (port 17892)
- `test_navigation.py` — CLI test harness for action execution
- `@site_structures/` — Auto-generated artifacts directory
- `tools/` — Artifact transformation utilities

**Documentation:**
- `THIS_IS_HOW_IT_ALL_WORKS.md` — Complete system architecture (READ THIS FIRST)
- `web_extension/README.md` — Extension-specific documentation
- `om_e_web_ws/HowThisWorks.md` — Data flow and artifact generation

**Note:** Additional reference materials in `.claude/` folder (capabilities_architecture.md, instructions.md, agents/PipelineAgent.md) - but all critical info is consolidated into this CLAUDE.md file.

## Important Constraints

### Never Modify These Runtime Files (use site_configs.json instead):
- `web_extension/content.js` (unless fixing bugs or adding generic features)
- `web_extension/sw.js` (unless fixing bugs)
- `om_e_web_ws/ws_server.py` (unless adding new message types)

### Config Loading Timing
- Site config loads synchronously via `getSiteConfigDirect()` on content script injection (line 886)
- Uses XHR to read `chrome.runtime.getURL('site_configs.json')`
- Domain matching: exact match → partial match → default fallback
- Always check `siteConfig || window.currentSiteConfig` (see Config Access Pattern above)

### Content Script Constraints
- **Main-frame only** — Exits if `window.top !== window.self`
- **Idle detection** — Waits for DOM/network quiet before scanning
- **Keep-alive port** — Prevents service worker suspension
- **Mutation observers** — Monitors post-scan changes
- **Action IDs are ephemeral** — Regenerated on every scan

### Service Worker Constraints
- **Persistent WebSocket** — Maintains connection to server (port 17892)
- **Tab state tracking** — Internal state map for all tabs
- **Content script reinjection** — Auto-reinjects on tab changes
- **Shortcut routing** — Normalizes commands to llm_instruction format
- **Keep-alive mechanism** — Uses `ome_keep_alive` port to prevent suspension

### WebSocket Server Constraints
- **Multi-client support** — Extension + multiple test/LLM clients
- **Artifact regeneration** — Writes artifacts on every intelligence update
- **Transcript deduplication** — Uses content hashes to avoid duplicates
- **Command normalization** — Converts shortcuts to standard format

### Message Format Consistency
When adding new test_navigation.py commands, update `send_command()` (line 65-101) to format message correctly:
```python
elif command == "my_new_command":
    message = {
        "type": "my_new_command",
        # Flatten data structure appropriately
        "field1": data.get("field1"),
        "field2": data.get("field2")
    }
```

## Testing Workflow

1. Start server: `python om_e_web_ws/ws_server.py`
2. Load extension in Chrome
3. Navigate to target page, verify console shows "scan complete"
4. Check artifacts written: `ls -lh om_e_web_ws/@site_structures/`
5. Test action: `python3 om_e_web_ws/test_navigation.py --action-id <id> --action-type click`
6. For capability: `python3 om_e_web_ws/test_navigation.py --command capability --capability <action>`

## Reference: Key Function Signatures

**content.js:**
```javascript
async function capabilityPipelineExecutor(capabilityAction, params)
// Returns: {success: bool, message: str, elementFound: str, matchedBy: str}

function getSiteConfigDirect()
// Returns: siteConfig object or null

IntelligenceEngine.prototype.executeAction(actionId, actionType, params)
// Executes standard action-ID pipeline
```

**ws_server.py:**
```python
async def handler(websocket, path)
# Main WebSocket handler

async def handle_llm_instruction(data, client)
# Routes llm_instruction messages to extension

async def save_intelligence_to_page_jsonl(intelligence_data)
# Persists artifacts to @site_structures/
```

**test_navigation.py:**
```python
async def send_command(self, command, data=None)
# Formats and sends WebSocket messages
# command: "llm", "capability", "navigate", "click"
# data: {"action": str, "params": dict} or {"actionId": str, ...}
```

## Common Gotchas

1. **Service worker suspension:** MV3 service workers are event-driven and will suspend. The extension uses a keep-alive port (`ome_keep_alive`) to maintain WebSocket connection. If all tabs are `chrome://` pages, the port cannot be created—open a regular web page.

2. **Capability not finding element:** Check Console logs show "Element not found after trying all selectors". Verify:
   - Page is on correct URL (check `url_pattern` in site config)
   - Element exists in DOM (not just visually hidden)
   - Selectors match actual element structure (inspect in DevTools)

3. **Action ID collision:** Elements preserve their IDs across rescans, but if DOM structure changes significantly, IDs may shift. Regenerate `llm_optimized.json` after major page changes.

4. **Message timeout:** Default timeout is 10s. For slow operations, increase timeout in test_navigation.py line 108 or handle async responses differently.

5. **Config changes not taking effect:** Site configs broadcast instantly to tabs, but content.js only loads config on injection. If config seems stale, reload the tab to reinject content script.

## When Building New Features

**ALWAYS follow this sequence:**

1. **Design discussion** — Ask about architecture, verify approach, get approval
2. **Validate plan** — Create short (3-6 step) testable plan, confirm before coding
3. **Prefer config changes** — Update site_configs.json rather than core runtime files
4. **Implement step-by-step** — Execute one step, show results, provide test instructions, wait for confirmation
5. **Test at each step** — Verify artifacts generate correctly, test with test_navigation.py
6. **Scope tightly** — Keep edits focused, don't refactor across languages without permission

**Key principle:** When automating new pages/apps, assign stable selectors (IDs, classes, ARIA labels) in your UI, then update site_configs.json. DO NOT modify core runtime files unless adding generic features or fixing bugs.

## Additional Documentation

For deeper technical details, see:
- Complete architecture: `THIS_IS_HOW_IT_ALL_WORKS.md`
- Capability pipeline deep dive: Section 6 of `THIS_IS_HOW_IT_ALL_WORKS.md`
- Artifact formats: `om_e_web_ws/HowThisWorks.md`
- Extension internals: `web_extension/README.md`
