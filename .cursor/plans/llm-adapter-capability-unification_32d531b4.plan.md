---
name: llm-adapter-capability-unification
overview: High-level refactor outline to unify LLM adapter and capability registry without code changes yet.
todos:
  - id: adapter-layer
    content: Design llm_client facade + provider registry
    status: pending
  - id: orchestrator-slim
    content: Define orchestrator flow with JSON contract + dispatch
    status: pending
  - id: capability-registry
    content: Unify capability definitions and exposure
    status: pending
  - id: config-selection
    content: Plan provider/model selection UX and config
    status: pending
  - id: telemetry-guardrails
    content: Plan logging/validation/retry strategy
    status: pending
---

# High-Level LLM & Capability Refactor

1) Adapter Layer (LLM)

- Add `agent/llm_client.py` facade: one `chat(messages, provider, model, temperature, max_tokens, stream?)` entry; centralize retries, timeouts, and JSON validation.
- Keep provider registry (Anthropic/OpenAI/Ollama); start with LiteLLM or direct HTTP, but keep callers insulated.
- Normalize outputs to a single contract (recommended: JSON-command object/array) and reject/rehydrate malformed responses.

2) Orchestrator Slimming

- Make orchestrator build prompt/context, call `llm_client`, validate JSON, then dispatch to executors (element/capability/internal) only.
- Enforce tight context budget: recent messages, recent actions, trimmed page context, active capabilities list, active prompt/project.

3) Capability Registry Unification

- Declare all capabilities in one place (e.g., `internal_capabilities.json` + `site_configs.json` merged view) and expose a single JSON list to the LLM.
- Route internal capabilities in `ws_server.py` directly when they don’t require extension hops; send only browser/site actions to `sw.js`/content.

4) Config & Selection

- Keep `llm_config.json` (or state) as the selector for provider/model; add HUD/CLI toggle to switch providers/models without code changes.

5) Telemetry & Guardrails

- Log latency/tokens/retries per call; surface user-friendly errors on invalid JSON or provider failures; add a one-shot “re-ask for valid JSON” guardrail before failing.