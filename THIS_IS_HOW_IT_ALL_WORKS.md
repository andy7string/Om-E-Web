# THIS_IS_HOW_IT_ALL_WORKS

> A single reference for how the current Om_E_Web stack captures a page, builds LLM-friendly artifacts, and executes natural-language instructions without editing the core runtime files.

## 1. End-to-end flow

1. **Browser/Extension**
   - `web_extension/content.js` injects into the active tab (main frame only), waits for the DOM/network to go idle, applies the matching `site_configs` block, and registers actionable elements with `data-ome-action-id`.
   - `web_extension/sw.js` (the MV3 service worker) keeps a persistent WebSocket to `ws://127.0.0.1:17892`, forwards commands to tabs, keeps site-config state in sync, and maintains keep-alive ports/offscreen docs so Chrome does not suspend the worker.
2. **Server**
   - `om_e_web_ws/ws_server.py` accepts both the extension connection and any number of test/LLM clients. When the extension streams intelligence updates, the server writes `@site_structures` artifacts (`page.jsonl`, `content.jsonl`, `text.md`, `llm_actions.json`, `llm_prompt.md`, optional transcripts). It also normalizes shortcut commands from clients into `llm_instruction` payloads for the extension.
3. **Artifacts + Prompting**
   - Downstream tools (`tools/create_llm_structure.js`, watcher) merge `page.jsonl + text.md` into `llm_optimized.json`, embedding `[Label](action:ID)` links so prompts stay tiny while keeping a lookup table of executable actions.
4. **Agent / Business App**
   - Users or orchestrators interact via natural language (e.g., “log my timesheet”). The orchestrator reads the artifacts, plans steps, and calls the server with `llm_instruction` or shortcut messages (`set_value`, `click`, `navigate_link`). The extension executes, reports results, and new intelligence streams back so the loop can continue.

## 2. Core responsibilities (unchanged files)

| Component | Path | What it owns |
|-----------|------|--------------|
| Content Script | `web_extension/content.js` | Idle detection, DOM scan, actionable/content registration, focus handling, mutation listeners, execution of clicks/setValue/navigate, optional transcript harvesting. |
| Service Worker | `web_extension/sw.js` | WebSocket bridge, tab state tracking, site-config distribution, keep-alive, shortcut routing, command injection (including reinjection of `content.js` when tabs change). |
| WebSocket Server | `om_e_web_ws/ws_server.py` | Connection broker, artifact writer, transcript saver, action-table generator, shortcut normalization, persistence of browser state and DOM deltas. |
| CLI/Test Harness | `om_e_web_ws/test_navigation.py` | Example client that hits the same WebSocket APIs an agent will use. |
| Artifact Docs | `om_e_web_ws/@site_structures/HowThisAllWorks.md`, `om_e_web_ws/HowThisWorks.md`, `web_extension/README.md` | Reference material already describing the file formats and flows; this doc supersedes them as the high-level snapshot. |

## 3. Artifact inventory

All artifacts land under `om_e_web_ws/@site_structures/` and are regenerated every time the extension streams an update:

- `page.jsonl` — Ordered JSONL feed of page `meta`, sections, text spans, and actions (includes browser state and transcript references).
- `content.jsonl` — Cleaned headings, paragraphs, lists, tables, images.
- `text.md` — Human transcript with frontmatter (title, URL, timestamp).
- `llm_actions.json` — ActionId → metadata (type, selectors, description, coordinates) with `_page_context`.
- `llm_prompt.md` — Truncated transcript plus canonical `return (a_id_X)` instructions.
- `transcripts/*` — Long-form transcripts (e.g., YouTube) saved with deduped signatures.
- `llm_optimized.json` — Compressed snapshot generated manually or via the watcher; merges markdown content with packed action table for prompts.

Nothing in this list needs to change to support new business apps—just regenerate them when the page changes.

## 4. Site configs = contract between UI and agent

File: `web_extension/site_configs.json`

Each domain entry may define:

- `focus_targets` — selectors to autofocus after scan (e.g., main search input, time-entry field).
- `selectors` — grouped arrays (`text_inputs`, `navigation`, `buttons`, `menus`, `content_elements`, `hidden_content`, etc.) that drive the priority scan order in `content.js`.
- `forceIncludeSelectors` — elements that must always be registered, even if heuristics would skip them.
- `filters.include` / `filters.exclude` — mark up extra nodes (e.g., skip noisy ads, include hidden combos).
- Optional `submit_url_template` & metadata for future `submitUrl` actions.

**How to leverage this without touching runtime files:**

1. When designing a new UI (Next.js, Claude code, etc.), assign stable selectors/classes/attributes that align with the domains you plan to automate. Tag actionable widgets with helpful ARIA labels, placeholders, or IDs to guarantee deterministic registration.
2. Add/update the relevant block in `site_configs.json`. The service worker will broadcast the updates to every tab instantly; no extension redeploy required.
3. After a UI change, refresh the page, let the extension rescan, and regenerate `llm_optimized.json` (or run the watcher) so the LLM sees the new structure.

## 5. Business-app natural language loop

1. **Prompt entry point** — Embed a “Command Console” or “Assistant” panel in your business UI. Users type “Log my timesheets for the week.”
2. **Planner** — Your orchestration layer (could be the same agent that reads `llm_optimized.json`) interprets the request, inspects the latest artifacts, and decides on the sequence of action IDs (e.g., open time sheet page, set values, submit).
3. **Execution** — Send `llm_instruction` payloads via WebSocket or reuse `test_navigation.py` logic. Shortcut messages (`set_value`, `click`, `navigate_url`) are normalized automatically by `ws_server.py`/`sw.js`.
4. **Verification loop** — After each action, wait for the extension to emit a fresh intelligence update (the server already writes new artifacts). Either:
   - Re-read `llm_optimized.json`/`page.jsonl` to confirm the DOM changed; or
   - Tap into the extension’s console/debug stream (see next section) for immediate success/failure cues.
5. **Result reporting** — The orchestrator summarizes what happened (e.g., “Hours logged for Mon–Fri, total 40”) and surfaces it back in the UI or via chat.

This approach keeps all automation state inside the existing files—no new RPC surface is required, just structured prompts and action selections.

## 6. Watching for page changes after each action

To ensure the agent reacts to dynamic pages:

- **Artifact polling** — The simplest option is to watch the timestamps on `page.jsonl`/`text.md`. When an action completes, wait for the next write before planning the next step.
- **Extension debug stream → server** (future enhancement) — The content script already logs rich diagnostics (`[Content] ...`). You can capture `console.log` output via the MV3 logging APIs or inject a lightweight bridge that forwards those logs over the existing WebSocket to `ws_server.py`, which can then echo them to clients. This would let the agent confirm “setValue succeeded” without waiting for a full rescan.
- **Force rescan** — If your UI performs heavy DOM mutations, expose a “Rescan now” action (button wired to `scanAndRegisterElements`) so the agent can request a fresh intelligence dump on demand.

## 7. Operational checklist (per session)

1. Start `python om_e_web_ws/ws_server.py`.
2. Load the Chrome extension (MV3) from `web_extension/`.
3. Open the target business app page; verify the content script logs show “scan complete.”
4. Regenerate `llm_optimized.json` (manual CLI or watcher) whenever you need a fresh prompt snapshot.
5. Let the agent test: run `python om_e_web_ws/test_navigation.py --action-id <id> ...` or send JSON over WebSocket.
6. After UI updates, adjust `site_configs.json` and redeploy only the configs (service worker pushes them live).

## 8. Why this architecture scales to new apps

- **Deterministic UI contract** — Site configs give you proactive control over what the scanner sees; no need to fork `content.js`.
- **Prompt-friendly artifacts** — Every update emits markdown, transcripts, and action tables ready for RAG/LLM ingestion.
- **Natural-language control** — `llm_prompt.md` enumerates canonical instructions (`return (a_id_X)`), so business users or agents can phrase tasks naturally while the orchestrator translates them into action IDs.
- **Extensibility hooks** — Future ideas (e.g., streaming extension logs, adding workflow status, scheduled rescans) can be layered on top of the existing server without modifying the MV3/runtime files.

Keep this file updated whenever the pipeline gains new capabilities so everyone shares the same mental model of “how it all works.”
