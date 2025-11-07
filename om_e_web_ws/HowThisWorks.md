## Om_E_Web — How This Works

This document explains the end‑to‑end pipeline: Chrome Extension (MV3) + WebSocket server + page artifacts + LLM execution. It includes runnable examples for setting values, clicking, navigating, and direct URL submission.

### Components at a glance

- **Extension (MV3)**
  - `web_extension/content.js` — Scans the DOM, assigns stable `data-ome-action-id` to actionable elements, exports page intelligence, and executes actions (`click`, `setValue`, `navigate`).
  - `web_extension/sw.js` — Service Worker. Coordinates tab activation, forwards messages between the content script and the WebSocket server, handles CSP bypass cycles and page lifecycle.
- **Server**
  - `om_e_web_ws/ws_server.py` — WebSocket bridge and persistence. Receives intelligence from the extension, writes artifacts (`page.jsonl`, `content.jsonl`, `text.md`, `llm_actions.json`, `llm_prompt.md`), and forwards LLM instructions to the active tab. Handles large payloads (compression + larger `max_size`) and keeps cached tab/content state for quick API-style reads.
- **Artifacts (written under `om_e_web_ws/@site_structures/`)**
  - `page.jsonl` — JSON Lines export with `meta`, `section`, `text`, and `action` records in DOM order.
  - `content.jsonl` — Consolidated headings/paragraphs/lists/images extracted from the same update stream.
  - `text.md` — Human-readable transcript of the page.
  - `llm_actions.json` — Direct lookup of every `actionId` with selectors/metadata for deterministic execution.
  - `llm_prompt.md` — Lightweight prompt that mixes a clipped transcript with “return (a_id_x)” action instructions.
  - `llm_optimized.json` — Compact, LLM‑friendly snapshot built from the structured files above (generated manually or by the watcher).
- **Tools**
  - `om_e_web_ws/tools/create_llm_structure.js` — Transforms `page.jsonl` + `text.md` → `llm_optimized.json`.
  - `om_e_web_ws/tools/watch_llm_structure.js` — Watches the two inputs and regenerates the JSON on change.
- **Site configs**
  - `web_extension/site_configs.json` — Per‑site hints (selectors, focus targets, filters, optional URL templates) that guide scanning and execution.

See also: `om_e_web_ws/@site_structures/HowThisAllWorks.md` for a focused overview of the three artifacts and their generation.

---

### Data flow

1) You open or switch to a tab. The extension injects `content.js` and scans the DOM.

2) `content.js` returns intelligence (structured elements + content) to `sw.js`, which forwards it to `ws_server.py` over WebSocket.

3) The server writes/updates:
   - `@site_structures/page.jsonl`
   - `@site_structures/content.jsonl`
   - `@site_structures/text.md`
   - `@site_structures/llm_actions.json`
   - `@site_structures/llm_prompt.md`

4) Generate the optional all-in-one snapshot when you need it:

```bash
node om_e_web_ws/tools/create_llm_structure.js \
  om_e_web_ws/@site_structures/page.jsonl \
  om_e_web_ws/@site_structures/text.md \
  om_e_web_ws/@site_structures/llm_optimized.json
```

Or run the watcher:

```bash
node om_e_web_ws/tools/watch_llm_structure.js
```

5) An agent (or your test script) reads `llm_optimized.json`, picks an `actionId` from `actions.data`, and sends an instruction via the server.

6) The service worker forwards the instruction to `content.js`, which resolves the element and executes the action. The keep-alive port (added in `sw.js`) prevents Chrome from suspending the service worker mid-session so the WebSocket bridge stays online while you issue commands.

---

### Understanding `llm_optimized.json`

The file is a compact snapshot with three important sections:

- `meta` — page URL, title, timestamps, and counts.
- `markdown[]` — a readable transcript. Interactive items are annotated like `[Label](action:a_id_123)` and can be referenced by `a_id_123`.
- `actions` — the actionable lookup:
  - `actions.fields` — field order for packed values.
  - `actions.data` — a map of `actionId` → pipe‑delimited string matching `fields`.

When the LLM chooses an `actionId`, your automation layer uses the fields to decide how to execute it (e.g., link `href`, element `tag`, normalization hints).

### Fast references (`llm_actions.json` + `llm_prompt.md`)

- `llm_actions.json` is produced directly by the server on every intelligence update (see `process_actionable_elements_for_llm()` in `ws_server.py`). It is an exhaustive JSON map of `actionId -> {action_type, selectors, description, …}` and is ideal when you want the most literal reference data.
- `llm_prompt.md` is generated via `generate_llm_prompt()` inside `ws_server.py` right after `text.md`/`page.jsonl` are refreshed. It contains:
  - Title + short transcript (trimmed to ~1.5k chars, URL stripped).
  - A canonical list of instructions using the `return (a_id_x)` syntax your LLM prompt already expects.
- These two files give you an immediate “cheat sheet” without having to rebuild `llm_optimized.json`. The watcher/CLI still matters when you want the compressed markdown + packed action table for prompting.

---

### Action execution model

Supported action types (from the client into the extension):

- `click` — clicks the element identified by `actionId`.
- `setValue` — sets text in inputs/textarea/contenteditable. Params:
  - `value` (string) — required
  - `submit` (boolean, optional) — if true, sends Enter and/or attempts to click a visible submit button nearby.
- `navigate` — navigates using the element’s `href` (if the `actionId` points to an anchor) or a provided `url` param.

Planned (optional):

- `submitUrl` — direct URL navigation with query params or a per‑site template (e.g., Marketplace search). Params:
  - `url` or `templateKey` + `templateParams`
  - `openInNewTab` (bool), `replaceHistory` (bool)

Notes on `setValue` robustness:

- Uses native property setters so frameworks see real `input`/`change` events.
- If the primary element is hidden or not directly editable, the client attempts a visible, form‑local fallback.
- When `submit` is true, it dispatches an Enter key and briefly polls for a visible submit/send button to click.

---

### How to test actions

Start the server (in another terminal) and load/refresh the extension in Chrome. Ensure you have an active tab you want to control.

1) Generate or watch `llm_optimized.json` as shown above.

2) Pick an `actionId` from `llm_optimized.json`:
   - Search `markdown[]` for `[Label](action:...)` annotations, or
   - Search `actions.data` for anchors/inputs you care about.

3) Use `test_navigation.py` for one‑shot commands:

```bash
# Click an element
python3 om_e_web_ws/test_navigation.py --action-id a_id_123 --action-type click

# Navigate using a link’s href (anchor element)
python3 om_e_web_ws/test_navigation.py --action-id a_id_456 --action-type navigate

# Set a value and submit
python3 om_e_web_ws/test_navigation.py --action-id a_id_0 --action-type setValue --value "water" --submit
```

Alternatively, send a raw JSON instruction directly to the server:

```bash
python3 - <<'PY'
import asyncio, json, websockets
async def main():
    msg = {"type":"llm_instruction","data":{
        "actionId":"a_id_0",
        "actionType":"setValue",
        "params":{"value":"water","submit":True}
    }}
    async with websockets.connect("ws://127.0.0.1:17892") as ws:
        await ws.send(json.dumps(msg))
        try:
            print(await asyncio.wait_for(ws.recv(), timeout=10))
        except asyncio.TimeoutError:
            print("No response (timeout)")
asyncio.run(main())
PY
```

---

### Site‑specific examples

Below examples assume you’ve regenerated `llm_optimized.json` for the active tab, and identified the correct `actionId`.

#### Google Search

Set and submit the main search box:

```bash
python3 om_e_web_ws/test_navigation.py \
  --action-id a_id_0 \
  --action-type setValue \
  --value "water" \
  --submit
```

If you prefer pressing a named search button (anchor or button) instead of Enter, choose its `actionId` and run `--action-type click`.

#### YouTube Search

```bash
python3 om_e_web_ws/test_navigation.py \
  --action-id a_id_0 \
  --action-type setValue \
  --value "hamas" \
  --submit
```

#### ChatGPT Prompt

```bash
python3 om_e_web_ws/test_navigation.py \
  --action-id a_id_0 \
  --action-type setValue \
  --value "ome" \
  --submit
```

The client will send Enter and, when visible, attempt to click the send button.

#### Facebook Marketplace

Option A — set + submit in the search input:

```bash
python3 om_e_web_ws/test_navigation.py \
  --action-id a_id_1 \
  --action-type setValue \
  --value "Gibson" \
  --submit
```

Option B — (Planned) use a direct URL template for consistent results:

```json
{"type":"llm_instruction","data":{
  "actionType":"submitUrl",
  "params":{
    "url":"https://www.facebook.com/marketplace/search/",
    "query":{"query":"Gibson"},
    "openInNewTab":false,
    "replaceHistory":false
  }
}}
```

If your `site_configs.json` includes a `submit_url_template` for `facebook.com`, you can use `templateKey` + `templateParams` instead of a raw `url`.

---

### Working with `site_configs.json`

Per‑site blocks define scanning hints and optional execution helpers:

- `focus_targets` — elements to focus/observe for text inputs or search controls.
- `selectors.text_inputs` — high‑confidence selectors for inputs/textarea.
- `filters.include`/`exclude` — trim noisy/non‑interactive elements (e.g., `[aria-hidden='true']`).
- `forceIncludeSelectors` — force specific elements into the intelligence export.
- `extraInteractiveSelectors` — buttons/anchors likely to be used for submit/navigate.
- Optional `submit_url_template` — used by `submitUrl` to build a deterministic navigation URL.

Tune these if elements are missing from `page.jsonl` or resolve incorrectly during execution.

---

### Troubleshooting

- **Element missing in `page.jsonl`/`llm_optimized.json`**
  - Refresh the tab and wait for the extension logs to show a completed intelligence update.
  - Regenerate `llm_optimized.json` with `create_llm_structure.js` (or run the watcher).
  - Add/adjust `focus_targets`, `selectors.text_inputs`, or `forceIncludeSelectors` in `site_configs.json` and reload.

- **`setValue` doesn’t submit**
  - Use `--submit` so the client sends Enter and attempts a visible button click.
  - If frameworks override Enter, try clicking a known submit button by its `actionId`.
  - Consider a `submitUrl` path for highly dynamic UIs (Marketplace‑style).

- **Message too large / connection closed**
  - The server is configured with larger `max_size` and compression; ensure you’re running the latest `ws_server.py`.
- **Service worker disconnects after a minute**
  - MV3 service workers are event-driven and Chrome will suspend them even if a WebSocket is open.
  - `sw.js` now establishes a hidden keep-alive port (see `ensureKeepAlivePort()` and the `ome_keep_alive` port) by injecting a tiny helper into any accessible tab. As long as one regular tab is open, the WebSocket bridge stays online and queued messages flush automatically once the socket is ready.
  - If *all* open tabs are `chrome://` or otherwise inaccessible, the keep-alive port cannot be created; open a regular page before sending actions.

- **Reinjection errors (`Identifier already declared`)**
  - The content script guards initialization to avoid redeclaration on reinject; ensure the extension is refreshed after updates.

---

### Glossary

- **Actionable element** — A DOM element promoted to an action with a stable `data-ome-action-id`.
- **`actionId`** — Stable ID for an actionable element (e.g., `a_id_0`).
- **`page.jsonl`** — Raw, ordered page export with meta/sections/text/actions.
- **`text.md`** — Human transcript.
- **`llm_optimized.json`** — Compressed view for LLMs with a markdown transcript and `actions` lookup.
- **`site_configs.json`** — Per‑site scanning and execution hints.

---

### Quick checklist

1) Open target page in Chrome, ensure the extension is active.
2) Confirm logs show intelligence updates.
3) Generate `llm_optimized.json` (or run the watcher).
4) Pick an `actionId` from the snapshot.
5) Execute via `test_navigation.py` or send a JSON instruction.
6) If it fails, refine `site_configs.json` or use the direct URL submission strategy.

---

## Public WebSocket API (planned shortcuts)

To keep the server as the single ingress while avoiding a hard dependency on `test_navigation.py`, we can add lightweight shortcut message types that the server translates into the existing pipeline (no behavioral changes to the extension).

- These are additive and backward compatible with the current messages:
  - Existing: `llm_instruction` and `command` (e.g., `navigate`)
  - New (server translates → existing):
    - `exec_action` → `llm_instruction`
    - `set_value` → `llm_instruction` with `actionType: setValue`
    - `click` → `llm_instruction` with `actionType: click`
    - `navigate_link` → `llm_instruction` with `actionType: navigate`
    - `navigate_url` → `command: navigate`

Schema (client → server):

```json
{"type":"exec_action","actionId":"a_id_0","actionType":"setValue","params":{"value":"water","submit":true}}
```

```json
{"type":"set_value","actionId":"a_id_0","value":"water","submit":true}
```

```json
{"type":"click","actionId":"a_id_123"}
```

```json
{"type":"navigate_link","actionId":"a_id_LINK"}
```

```json
{"type":"navigate_url","url":"https:\/\/www.google.com\/search?q=water","openInNewTab":false,"replaceHistory":false}
```

Server normalization (conceptual):

- `exec_action` → `{ type: "llm_instruction", data: { actionId, actionType?, params? } }`
- `set_value` → `{ type: "llm_instruction", data: { actionId, actionType: "setValue", params: { value, submit? } } }`
- `click` → `{ type: "llm_instruction", data: { actionId, actionType: "click", params: {} } }`
- `navigate_link` → `{ type: "llm_instruction", data: { actionId, actionType: "navigate", params: {} } }`
- `navigate_url` → `{ id, command: "navigate", params: { url, openInNewTab?, replaceHistory? } }`

These flow through the existing Service Worker → Content Script path as today.

---

## Scripted examples (terminal → server)

Call the same running server (`ws://127.0.0.1:17892`) without the CLI:

```bash
python3 - <<'PY'
import asyncio, json, websockets
async def send(msg):
    async with websockets.connect("ws://127.0.0.1:17892") as ws:
        await ws.send(json.dumps(msg))
        try:
            print(await asyncio.wait_for(ws.recv(), timeout=10))
        except asyncio.TimeoutError:
            print("No response")
# Set value + submit (shortcut)
asyncio.run(send({"type":"set_value","actionId":"a_id_0","value":"water","submit":True}))
PY
```

```bash
python3 - <<'PY'
import asyncio, json, websockets
async def send(msg):
    async with websockets.connect("ws://127.0.0.1:17892") as ws:
        await ws.send(json.dumps(msg))
        print(await ws.recv())
# Navigate via anchor href (shortcut)
asyncio.run(send({"type":"navigate_link","actionId":"a_id_LINK"}))
PY
```

```bash
python3 - <<'PY'
import asyncio, json, websockets
async def send(msg):
    async with websockets.connect("ws://127.0.0.1:17892") as ws:
        await ws.send(json.dumps(msg))
        print(await ws.recv())
# Navigate by URL (existing command path)
asyncio.run(send({"id":"nav-1","command":"navigate","params":{"url":"https://www.google.com/search?q=water"}}))
PY
```

You can continue using `test_navigation.py` in parallel; both hit the same server.

---

## LLM handoff (future integration)

Goal: Keep the server/websocket as the sole ingress while allowing an LLM to choose `actionId`s from `llm_optimized.json` and return instructions for execution.

Reference flow:

1) LLM consumes `llm_optimized.json` (markdown + `actions.data`).
2) LLM decides to act (e.g., set search value, click link) and returns a structured instruction (one of the shortcut schemas above).
3) Your orchestrator forwards that JSON to the server (same socket).
4) The server normalizes and routes to the extension; result is returned to the orchestrator.

This keeps prompts small, preserves the current pipeline, and lets you swap the CLI for an agent later without changing the extension.

