# How This All Works

This directory captures three views of every page we crawl:

- **page.jsonl** – the raw JSON Lines output exported by the content script. It has the `meta`, `section`, `text`, and `action` records in DOM order, one JSON object per line.
- **text.md** – the plain-language transcript scraped from the same page, arranged the way a human would read it.
- **llm_optimized.json** – the merged, LLM-friendly snapshot we generate by combining the two files above.

## Generating the LLM snapshot

We expose a single function (`createLLMOptimizedStructure`) in `tools/create_llm_structure.js`. It reads the JSONL and markdown files, lines them up, and emits a compact JSON payload with:

- `meta` – page metadata (URL, title, timestamp, totals).
- `markdown` – an array of markdown lines; actionable text is wrapped in `[label](action:ACTION_ID)` (or `action-ref:` on repeats) so an LLM can recognise clickable items.
- `actions.data` – a compressed lookup keyed by action id that tells the automation layer how to execute each action.

### One-off generation

From the repo root:

```bash
node om_e_web_ws/tools/create_llm_structure.js \
  om_e_web_ws/@site_structures/page.jsonl \
  om_e_web_ws/@site_structures/text.md \
  om_e_web_ws/@site_structures/llm_optimized.json
```

Call this whenever you have fresh `page.jsonl` and `text.md` files and want the LLM view regenerated.

### Continuous regeneration while editing

If you prefer not to run the command manually, we provide a lightweight watcher in `tools/watch_llm_structure.js`. It monitors both source files and only regenerates once **both** have changed (avoids partial outputs when just one file is mid-write). Launch it in another terminal:

```bash
node om_e_web_ws/tools/watch_llm_structure.js
```

Flags:

- `--page <path>` / `--text <path>` – override default file locations.
- `--output <path>` – where to write the merged payload (defaults to `llm_optimized.json`).
- `--debounce <ms>` – delay between successive file events (default 500 ms).
- `--quiet` – suppress log messages.

The watcher calls `createLLMOptimizedStructure(...)` under the hood; you can remove or skip it if you only need manual runs.

## How the LLM uses the output

When you serve `llm_optimized.json` to an agent:

1. It reads the `markdown` array and follows the page content in order.
2. Whenever it sees `[Label](action:ACTION_ID)` it knows there is a clickable element named `ACTION_ID`.
3. When the agent decides to act, it returns that ID (`action_link_a_12`, etc.).
4. Your automation layer looks up `actions.data[ACTION_ID]`, unpacks the pipe-delimited string using the order in `actions.fields`, and performs the corresponding DOM action (click, navigate, etc.).

This keeps the prompt footprint small, preserves human-readable context, and avoids duplicated action metadata across the markdown.

## Updating/extending the pipeline

- Modify `createLLMOptimizedStructure` if you need additional metadata or different markdown annotations.
- Add tests by calling `createLLMOptimizedStructure(pagePath, textPath)` directly and snapshotting the JSON—it’s just a pure function.
- If you want a single CLI with both behaviors, you can add a `--watch` flag to `create_llm_structure.js` that internally requires and delegates to the watcher, but we keep the responsibilities split today for simplicity.

Questions or changes: start with `tools/create_llm_structure.js` for the transformer logic and `tools/watch_llm_structure.js` for automation.
