# Roadmap Improvements & Best Practices (Augmenting Master_Refactoring_Roadmap.md)

Purpose: layer practical, testable enhancements on the existing roadmap so we can ship refactors safely, measurably, and without new monoliths.

---

## 1) Guardrails Before Changing Behavior
- **Invariant logging first** (Phase 0.0): add structured logs `{scan_id, trigger, tabId, url, duration_ms, element_count, actionId, warning}`.
- **Detect & block duplicates**: content.js warns/blocks duplicate actionIds; server rejects or drops with log; SW warns on double injection.
- **One-instance checks**: per-tab content-script count; scan-in-flight flag per tab; action lock per tab.
- **Tag & rollback**: tag repo per phase (`phase0-baseline`, `phase1-guards`, …); keep rollback notes in file.

---

## 2) Config Centralization (Early Task)
- Add `om_e_web_ws/env.py`: `WS_HOST/PORT`, `SITE_STRUCTURES_DIR`, `WRITE_QUEUE_MAXSIZE`, `PROMPT_MAX_ACTIONS`, flags `ENABLE_ASYNC_WRITES`, `STRICT_ACTION_ID_UNIQUENESS`, `ALLOW_LEGACY_FORMAT`, `LOG_LEVEL`, `LOG_FILE`.
- Add `web_extension/env.js`: `SCAN_DEBOUNCE_MS`, `MUTATION_DEBOUNCE_MS`, `NAVIGATION_RESET_TRIGGERS`, `LOG_LEVEL`, flags `ENABLE_SCAN_CONTROLLER`, `ENABLE_ACTION_REGISTRY`, `ENABLE_SINGLE_INJECTION_MANAGER`.
- Replace literals before refactors; default values mirror today’s behavior.

---

## 3) Trigger Mapping (Fix Order Matters)
- **Content triggers (11+)**: DOMContentLoaded; 4s fallback; pageIdleMonitor idle; MutationObserver significant change; SPA URL/focus; manual rescan; capability pipelines; transcript pipeline; visibility/focus regain; changeAggregator flush; context re-init.
- **SW triggers (6+)**: webNavigation onCompleted; onHistoryStateUpdated; tabs.onUpdated (complete/url/title); tabs.onActivated; DOM-command reinjection; manual reinjection endpoints.
- **Plan**: route all content triggers through ScanController; route all SW injections through ContentScriptManager; debounce per tab in SW before messaging content.

---

## 4) Non-Negotiable Invariants (Phase Exit Checks)
- One content script per tab.
- One scan in-flight per tab; queued/debounced otherwise.
- actionId uniqueness enforced client + server; elementCounter resets only on navigation triggers.
- Per-tab action lock; Tab A never blocks Tab B.
- Server writes non-blocking; prompt dedup by actionId, not line text.

---

## 5) Phase Enhancements (Practical Steps)
### Phase 0 – Instrument & Guard
- Add telemetry helpers (`logger.js`/`logger.py`) with correlation IDs.
- Add “invariant dashboard” log line every N seconds summarizing counts per tab.
- Server: soft-validation of payloads (log malformed), duplicate-ID warning.

### Phase 1 – Single Injection Authority (SW)
- Implement `ContentScriptManager` (even inline) with `injectedTabs` Set, `ensureInjected(tabId)`, cleanup on `tabs.onRemoved`.
- Replace all `executeScript` call-sites; undefined functions become explicit errors with guidance.
- Add metric: injections per tab per hour (target: 1 unless reloaded).

### Phase 2 – ScanController (Content)
- Debounce windows configurable via env.js; emit `{scan_id, trigger, duration, element_count}`.
- Queue high-priority scans when one is in-flight; flush after completion.
- Kill timers where possible; if a timer remains, log why.

### Phase 3 – ActionRegistry & Dedup
- Centralize ID generation + WeakMap/WeakSet for element↔id.
- Guard `registerInteractiveSubtree` with scan lock + dedup path.
- Add “refresh-like-reload” command: clear registry safely, re-scan with preserved counter semantics.

### Phase 4 – Tab State & Routing (SW)
- `TabState` map: `{lastUrl, lastScanAt, scanInFlight, actionInProgress}`.
- Per-tab debounce of scan requests; include `scan_id` from SW to content.
- Replace global `actionInProgress` with map; clear on tab close.

### Phase 5 – Async Server & Validation
- Introduce `AsyncFileWriter`; queue writes; graceful shutdown flush.
- Pydantic/dataclass schemas for inbound messages; fail fast with clear error.
- O(n) dedup path; prompt builder dedups by actionId.
- Bench harness: 6k elements <500ms; writes <5ms p95.

### Phase 6 – CLI Hardening
- Lockfile to block concurrent runs; response schema validation; env-driven URL.
- Friendly errors for bad connection; optional retry/backoff.

### Phase 7 – Extraction & Cleanup
- Extract stabilized facades to `web_extension/src/content/*`, `web_extension/src/sw/*`, `om_e_web_ws/server/*`.
- Delete legacy/dead code post-parity tests.

---

## 6) Testing & Validation Matrix
- **Content**: scan history shows 1 per navigation; debounced mutations; registry size == actionableElements; collision detection exercised.
- **SW**: per-tab action lock verified with two simultaneous actions; injection count ==1 per tab across 5 navigations.
- **Server**: malformed payload rejected with clear error; duplicate IDs dropped with log; perf targets hit.
- **CLI**: concurrent runs blocked; schema validation of responses; env overrides work.
- Keep smoke scripts short and phase-aligned (e.g., `npm run smoke:content`, `python -m pytest tests/server_smoke.py`).

---

## 7) Observability & Tooling
- Structured logs with correlation IDs; optional ring buffer in SW/content for last N events.
- Add a tiny `/health` or ping endpoint in server to confirm async writer alive and queue depth.
- Log timers that remain with “sunset” notes.

---

## 8) Performance Budgets
- Scan: <400ms typical page; mutation rescan debounced to avoid storms.
- Server write: <5ms p95; 6k-element processing <500ms; prompt build <200ms.
- Track these per phase; fail the phase if budgets regress.

---

## 9) Repo & Workflow
- Prefer branch + tags for rollback; if cloning, keep cherry-picks aligned to phase tags.
- Keep rollback notes per phase inside the roadmap for quick recovery.

---

## 10) Quick Wins to Bake Into Existing Roadmap
- Add “Phase 0.0 Instrumentation” section with invariant logging + config centralization.
- Append exit criteria + tags to each phase.
- Insert trigger mapping table and module extraction targets so refactors don’t create new monoliths.
- Require event-driven replacements for timers; justify any timer that remains.

