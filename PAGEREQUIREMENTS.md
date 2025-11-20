OM-E DOM VERSIONING & ACTION ID REBUILD
FULL SOLUTION ARCHITECTURE & REQUIREMENTS SPEC

PURPOSE AND SCOPE

We are rebuilding the DOM scanning and action-id system used by the OM-E Chrome extension so that:

Single Page Apps (SPAs) don’t leak stale elements into prompts.

Action IDs are deterministic, versioned, and never collide.

Scans happen only when they should, with no MutationObserver or idle voodoo.

The service worker (sw.js) is the authority on tab state, including page version.

The content script (content.js) is the single place that scans and registers actionable elements.

The system is simple enough to reason about, debug, and test incrementally.

This doc defines:

Requirements (for later RTM).

The target architecture.

What must be removed from the existing code.

The staged implementation and test path.

KEY DESIGN DECISIONS

2.1 Where page version is stored

Page version is tracked in the service worker, not in the IntelligenceEngine instance and not only in the DOM.

Service worker maintains per-tab state, including:

pageVersion (integer)

maybe lastScanReason, etc.

2.2 Page version increments

Page version is incremented in the service worker when a new scan is requested for a tab.

Content script does not decide or increment page version. It receives the version from the service worker.

2.3 Single scan authority

There is exactly one function that performs a full scan and registry rebuild in content.js:

scanAndRegisterPageElements(pageVersion, reason)

No other function may perform scanning that assigns IDs or populates the main registry.

2.4 Action ID format

All action IDs must follow the format:

a_id_<pageVersion>_<index>

where:

pageVersion is provided by the service worker.

index starts at 0 for each scan and increments per accepted element.

2.5 DOM attributes

Each actionable element uses:

data-ome-action-id

Ephemeral per scan.

Assigned only by scanAndRegisterPageElements.

data-ome-page-version

Persistent per element.

Used to know which pageVersion it was last accepted under.

2.6 Site config exclusion rules

Per domain, site_configs.json has:

versioning:
excludeCarrySelectors: [
"selector1",
"selector2",
...
]

These selectors define DOM nodes that should NOT be carried forward from previous page versions (e.g. YouTube video tiles, old players, etc.).

2.7 MutationObserver and idle logic

ALL MutationObserver-based scanning and idle/settle logic are removed.

No pageIdleMonitor.

No scanWhenPageSettles.

No incremental DOM-based rescan triggers.

No preserved marker/ID systems.

2.8 Allowed scan triggers

Scans may only be triggered via the service worker when one of these happens:

Tab change (tab becomes active) – optional but allowed.

URL change for that tab:

normal navigation

back/forward

pushState/replaceState

Post-action execution:

After an LLM action finishes that might change the page.

No other trigger is allowed to cause a full scan.

2.9 No scans between prompt and action

Once a scan completes and the service worker has accepted the new registry (and llm_prompt.md has been generated), no new scans occur until one of the three triggers fires.

This stabilises the mapping from prompt IDs to DOM nodes.

2.10 Reject actions during scanning

If content script is in the middle of a scan (_scanInProgress == true), any attempt to execute an action by ID must be rejected or queued until the scan is finished.

REQUIREMENTS (FOR RTM)

I’ll tag requirements so you can trace them later.

3.1 Scan control

REQ-SCAN-001
Full scans must be initiated only by the service worker in response to:

Tab activation.

URL change.

Post-action completion.

REQ-SCAN-002
Content script must not start scans on its own based on DOM changes or idle timers.

REQ-SCAN-003
No scan may occur between:

Generating llm_prompt.md for a given page version, and

Executing the actions based on that prompt,
unless one of the three allowed triggers fires.

REQ-SCAN-004
scanAndRegisterPageElements must be guarded by a _scanInProgress flag in content.js. If a scan is already running, any new scan request must be ignored or reported as “already scanning”.

3.2 Page version (service worker)

REQ-PV-001
Service worker must maintain internalTabState[tabId].pageVersion as an integer, default 0 for new tabs.

REQ-PV-002
When a new scan is required for tabId, service worker must:

Increment internalTabState[tabId].pageVersion.

Send a message to that tab’s content script: { type: 'ome_run_full_scan', pageVersion, reason }.

REQ-PV-003
Content script must accept the pageVersion from the service worker and must not increment its own version counter.

REQ-PV-004
Service worker must handle tab removal and cleanup of internalTabState entries.

3.3 Page version (DOM elements)

REQ-DOMPV-001
Each actionable element accepted into the registry must have data-ome-page-version set to the pageVersion received from the service worker for that scan.

REQ-DOMPV-002
During scanning, the content script must evaluate an element’s “age” via:

oldVersion = Number(element.dataset.omePageVersion || 0)

If oldVersion == 0 → new element.

If oldVersion < pageVersion → “from a past version”.

REQ-DOMPV-003
We do not rely on any previous in-memory registry to determine past vs current; only the DOM attribute data-ome-page-version.

3.4 Action ID rules

REQ-ID-001
The ID format must be: a_id_<pageVersion>_<index>.

REQ-ID-002
Index must reset to 0 at the start of each scan and must increment by 1 for each accepted element.

REQ-ID-003
Content script must not reuse IDs across scans.

REQ-ID-004
No other function besides scanAndRegisterPageElements (or a tight helper it calls directly) may assign or modify data-ome-action-id.

REQ-ID-005
Existing stale IDs from older page versions are harmless because they contain older pageVersion; they must never conflict with new IDs for the current pageVersion.

3.5 Element evaluation rules

REQ-EVAL-001
For each candidate element in scanAndRegisterPageElements, logic must run in this order:

Read oldVersion = Number(element.dataset.omePageVersion || 0).

Determine if isFromPast = oldVersion > 0 && oldVersion < pageVersion.

If isFromPast:

Check against site_configs.versioning.excludeCarrySelectors for the domain.

If matches any selector → element is excluded:

Delete element.dataset.omeActionId if present.

Do not register this element for current scan.

If does not match selectors → element is allowed.

If not isFromPast (new or already current):

Element is allowed.

For allowed elements:

Assign ID: a_id_<pageVersion>_<index>.

Set:

element.dataset.omeActionId = that ID.

element.dataset.omePageVersion = pageVersion.

Add to this.actionableElements and this.actionableElementNodes.

REQ-EVAL-002
No DOM attributes relating to IDs or pageVersion may be modified before evaluation steps 1–3 are complete for that element.

3.6 Site config versioning

REQ-CONF-001
site_configs.json must support a versioning block per domain:

versioning:
excludeCarrySelectors: [
"selector1",
"selector2",
...
]

REQ-CONF-002
When element isFromPast is true, it must be checked against excludeCarrySelectors.

REQ-CONF-003
If an element from a past version matches any exclude selector, it must:

Have its data-ome-action-id removed.

Not be registered in current registry.

REQ-CONF-004
If an element from a past version does not match any exclude selector, it is allowed to be accepted and assigned a fresh ID.

3.7 Registry rules

REQ-REG-001
At the start of each scan, content script must clear:

this.actionableElements

this.actionableElementNodes

this.contentElements (or equivalent structures used for prompt building)

REQ-REG-002
The registry is not persisted across scans; it is rebuilt from scratch using the DOM as the source of truth plus site configs.

REQ-REG-003
No _preservedMarkerIds, markerIdMap, or similar ID-preservation systems are allowed.

REQ-REG-004
No incremental registration functions (e.g. registerInteractiveSubtree) may add entries to the main registry or assign action IDs, unless they are refactored to fully respect these rules. For now, they should be disabled/no-op.

3.8 MutationObserver and idle behaviour

REQ-MUT-001
All MutationObserver usage that relates to:

scheduling scans,

scheduling intelligence updates based on DOM changes,

marking page “dirty” / “changed”,
must be removed.

REQ-MUT-002
pageIdleMonitor and related functions like waitForIdle, markChange, scanWhenPageSettles must be removed or left as dead code with no references.

REQ-MUT-003
No idle/settle logic may trigger scans. All scanning is explicit via service worker commands.

3.9 Action execution rules

REQ-ACT-001
Before executing an action by ID, content script must:

Check _scanInProgress; if true, reject or queue the action.

REQ-ACT-002
Action execution must find the element via:

document.querySelector([data-ome-action-id="${id}"])

If no element is found, action must:

log a clean failure, and

not try to guess alternative targets.

REQ-ACT-003
After executing an action that the system deems “page-changing”, content script must send a message to the service worker (e.g. action_completed) so that sw.js can decide to trigger a new scan (and increment pageVersion).

3.10 Error handling and logging

REQ-LOG-001
Each scan must log:

tabId,

reason,

pageVersion,

number of accepted elements.

REQ-LOG-002
Rejected scan requests due to _scanInProgress must log a clear message.

REQ-LOG-003
Action execution failures due to missing IDs must be logged clearly.

3.11 Forbidden behaviours

REQ-FORB-001
No global wipe of data-ome-action-id or data-ome-page-version before evaluation.

REQ-FORB-002
No cross-scan ID reuse mechanisms.

REQ-FORB-003
No scan triggers based on MutationObserver, idle time, generic DOM changes, or network/resource trackers.

REQ-FORB-004
No writing of data-ome-action-id outside the scan pipeline.

TARGET ARCHITECTURE

4.1 Components

Service worker (sw.js)

Tracks tab state including pageVersion.

Decides when scans should occur.

Sends messages to content to start scans.

Forwards action execution requests to the right tab.

Content script (content.js)

Contains IntelligenceEngine.

Performs scanAndRegisterPageElements(pageVersion, reason).

Maintains registry only in memory per scan.

Writes data-ome-action-id and data-ome-page-version to DOM.

Executes actions by ID.

Site config (site_configs.json)

Provides versioning.excludeCarrySelectors per domain.

Backend/WebSocket server and artifact writers

Take the registry data and write llm_prompt.md, llm_actions.json, etc.

No changes to logic required beyond trusting the now-clean registry.

4.2 Data flows

4.2.1 Scan initiation

Event occurs (URL change, tab change, or action completion).

Service worker determines that tabId requires a new scan.

Service worker increments internalTabState[tabId].pageVersion.

Service worker sends message:

{ type: 'ome_run_full_scan', pageVersion, reason }

to that tab.

4.2.2 Scan in content

Content script receives message ome_run_full_scan with pageVersion.

If _scanInProgress is true, log and abort.

Set _scanInProgress = true.

Clear registry maps.

Set local index = 0.

Get site_config for current domain, including versioning.excludeCarrySelectors.

Collect candidate elements via existing framework selector logic.

For each candidate, run evaluation rules (REQ-EVAL-001).

After all candidates processed:

_scanInProgress = false.

Pack up registry and send intelligence update to service worker / backend to regenerate llm_prompt.md.

4.2.3 Action execution

Backend/LLM sends action request for a specific a_id_<pageVersion>_<index>.

Service worker routes the action to the correct tab’s content script.

Content script:

Checks _scanInProgress.

If true: reject or queue.

If false:

Looks up DOM node via data-ome-action-id.

If found, executes.

If not, logs failure.

After completion, content script notifies service worker (if the action is page-changing).

Service worker may decide to trigger the next scan, repeating the process.

WHAT MUST BE REMOVED FROM content.js

5.1 Mutation/idle-related systems

These systems must be removed or fully disconnected:

MutationObserver-based logic that:

Watches DOM changes.

Marks page state as “dirty”.

Schedules rescan or intelligence update.

pageIdleMonitor:

Any IIFE named pageIdleMonitor.

Functions like:

ensureObservers

waitForIdle

markChange

scheduleIdleCheck

resourceObserver

network/Fetch/XHR wrapping functions that call markChange.

scanWhenPageSettles:

Any function that uses idle/settle logic to wrap scan initiation.

scheduleInitialScan:

Any function that uses idle/settle timers or timeouts to trigger scanAndRegisterPageElements.

5.2 ID preservation logic

Remove:

Any _preservedMarkerIds map or markerIdMap used to store previous IDs to reassign on next scan.

Any logic that:

Saves existing data-ome-action-id.

Clears them.

Reapplies them based on node identity.

Any logic that tries to keep IDs stable across scans.

5.3 Incremental registration / structure-change logic

These should be removed or neutered:

analyzeStructureChanges

registerInteractiveSubtree

Any call sites that:

respond to DOM events with structure-change logic.

assign IDs or add elements to actionableElements outside the full scan pipeline.

5.4 Global wipes

Remove or rewrite:

Any code that globally wipes all data-ome-action-id or data-ome-page-version before evaluation.

For example, calling querySelectorAll('[data-ome-action-id]') and clearing them all at the scan start.

IMPLEMENTATION SEQUENCE AND TESTING

We’ll do this in phases with checkpoints for Git commits.

PHASE 1 – Service Worker Page Version & Trigger Skeleton

Goal: Introduce pageVersion tracking in sw.js and basic scan messaging, without touching scanning logic yet.

Steps:

In sw.js:

Extend internalTabState[tabId] to include pageVersion (default 0).

On events:

tab activation,

URL change (webNavigation.onCommitted / onHistoryStateUpdated),

post-action notification,
set a flag that a scan is needed and increment pageVersion.

Implement a function in sw.js:

requestFullScan(tabId, reason)

increments pageVersion,

sends { type: 'ome_run_full_scan', pageVersion, reason } to tab.

In content.js:

Add a message listener for ome_run_full_scan.

For now, just log the request and pageVersion, but don’t yet change scanning logic.

Tests:

Print logs in sw.js when pageVersion increments.

Print logs in content.js when ome_run_full_scan is received.

Git checkpoint:
“Phase 1 – service worker pageVersion and scan request messaging added.”

PHASE 2 – Wire scanAndRegisterPageElements to pageVersion and new ID format

Goal: Make scanAndRegisterPageElements accept pageVersion from sw.js and emit IDs in new format, but no filtering yet.

Steps:

Change scanAndRegisterPageElements to:

Accept pageVersion and reason as parameters or read from a stored field set when message is received.

Set _scanInProgress = true at start; reset at end.

Clear registry maps at start.

Set local index = 0.

Assign IDs as a_id_<pageVersion>_<index> to all candidates unconditionally.

Ensure:

No use of _preservedMarkerIds.

No ID reuse logic remains.

At this stage, still ignore old data-ome-page-version; just overwrite IDs and set pageVersion on all candidates.

Tests:

Trigger scans via sw.js.

Confirm:

IDs follow a_id_<pageVersion>_<index>.

Each scan uses the new pageVersion.

No other logic changed yet.

Git checkpoint:
“Phase 2 – scan uses SW pageVersion and new ID format, no filtering yet.”

PHASE 3 – Element Past/Exclude Logic & DOM Page Version

Goal: Introduce real past vs current logic using data-ome-page-version and excludeCarrySelectors.

Steps:

In scanAndRegisterPageElements:

Before assigning an ID:

Read oldVersion from element.dataset.omePageVersion.

Compute isFromPast = oldVersion > 0 && oldVersion < pageVersion.

If isFromPast:

Check site_configs.versioning.excludeCarrySelectors for current domain.

If matches any:

Delete data-ome-action-id if present.

Do not register this element (skip).

Else:

Accept as allowed.

If not isFromPast:

Accept as allowed.

For each accepted element:

Assign new ID: a_id_<pageVersion>_<index>.

Set data-ome-page-version = pageVersion.

Add versioning.excludeCarrySelectors for at least one domain (e.g. youtube.com) to test.

Tests:

Open YouTube (or equivalent SPA).

First scan: pageVersion = 1.

Navigate to a new video (URL change).

Second scan: pageVersion = 2.

Confirm:

Elements that match excludeCarrySelectors from previous versions are not in the registry and do not get new IDs.

Header/navigation/search elements that don’t match stay and get new IDs with pageVersion 2.

Git checkpoint:
“Phase 3 – per-element past/exclude logic and DOM page version handling implemented.”

PHASE 4 – Kill MutationObserver, Idle Logic, and Incremental Registration

Goal: Remove all mutation/idle/incremental-based scanning and registration.

Steps:

In content.js:

Locate and remove:

pageIdleMonitor IIFE and all its helper functions.

scanWhenPageSettles.

scheduleInitialScan logic that uses idle or timeouts.

Any MutationObserver that:

calls scanAndRegisterPageElements,

or calls queueIntelligenceUpdate with intent to rescan.

Any ResourceObserver or network wrappers that mark changes.

Locate incremental registration:

analyzeStructureChanges.

registerInteractiveSubtree.

Any code that:

registers elements outside the main scan, or

assigns data-ome-action-id.

Disable or refactor them to do nothing or just log.

Ensure no remaining references to these removed pieces.

Tests:

Confirm no scans are triggered by DOM changes or idle periods.

Confirm scans only happen when sw.js sends ome_run_full_scan.

Git checkpoint:
“Phase 4 – mutation/idle-based logic and incremental registration removed.”

PHASE 5 – Action Execution Guarding & Post-Action Scans

Goal: Tie in _scanInProgress checks and hook post-action events back to sw.js.

Steps:

In content.js action executor:

Before resolving data-ome-action-id:

If _scanInProgress is true, reject or queue the action and log a warning.

After successfully executing an action that may affect DOM:

Post a message to sw.js:

{ type: 'ome_action_completed', tabId, maybeActionId, pageChanging: true }

In sw.js:

On ome_action_completed with pageChanging:

Call requestFullScan(tabId, 'post_action') which increments pageVersion and sends ome_run_full_scan.

Tests:

Execute an action that changes the page.

Confirm:

Action runs.

Then exactly one scan happens afterwards.

New IDs use incremented pageVersion.

Git checkpoint:
“Phase 5 – action execution guarded and connected to post-action scanning.”

PHASE 6 – Clean-up, Logging, Regression

Goal: Remove dead code, verify no forbidden behaviours remain, and confirm full flow works across domains.

Steps:

Grep for:

MutationObserver

pageIdleMonitor

scanWhenPageSettles

scheduleInitialScan

_preservedMarkerIds

markerIdMap

registerInteractiveSubtree

analyzeStructureChanges

setAttribute('data-ome-action-id'

actionableElements.set(

actionableElementNodes.set(

Confirm:

Only scanAndRegisterPageElements (and tightly coupled helpers) do ID assignment and registry population.

No other code path writes IDs.

Add logging:

On each ome_run_full_scan received:

Log tabId, pageVersion, reason.

At end of scan:

Log count of registered elements.

On each action execute:

Log ID and success/failure.

Regression tests:

Multi-tab with same domain.

Non-SPA sites (no versioning.excludeCarrySelectors).

Repeated actions without URL change.

Invalid IDs from LLM.

Rapid URL changes.

Git checkpoint:
“Phase 6 – cleanup, logging, and full regression for DOM versioning and ID system.”

===========================================================