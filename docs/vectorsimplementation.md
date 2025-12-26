# Om-E RAG & vStore Implementation Plan

**Last Updated:** 2025-12-26
**Status:** Phases 1-6 Complete, Phase 6.5 Next (Session History & URL Tracking)

---

## Design Philosophy & Scope

### What This Document Is

This document describes **Om-E's chosen RAG architecture** — a deliberate subset of retrieval-augmented generation techniques selected for our specific use case: a browser automation assistant with local-first, deterministic behaviour.

This is **not**:
- An exhaustive catalogue of RAG techniques
- A tutorial on how RAG works
- A framework-agnostic reference implementation

### Core Design Principle: Context Preservation

**The primary RAG failure mode is context loss.** When a retrieved chunk lacks sufficient context to be understood — when the reader (LLM) cannot determine *where this came from* or *what it relates to* — retrieval fails even if the chunk is semantically relevant.

All major design choices in this system flow from preventing context collapse:

| Design Choice | How It Preserves Context |
|---------------|--------------------------|
| **Structural metadata** (source, parent, position) | Chunk can be traced to origin; LLM knows provenance |
| **Chunk overlap** (64 chars) | Boundary sentences remain coherent |
| **Position tracking** (char_start, chunk_index) | Enables excerpt expansion if needed |
| **Source-aware retrieval** | LLM can distinguish "from vStore" vs "from current page" |
| **No aggressive summarisation** | Original text preserved; lossy compression avoided |

**What this system intentionally avoids:**
- **Naïve token inflation** — Padding every chunk with LLM-generated context wastes tokens and adds latency
- **Implicit context reconstruction** — Expecting the LLM to "figure out" where a chunk came from
- **Over-chunking** — Splitting at arbitrary token boundaries destroys sentence coherence

**Principle:** Structural context (metadata, parent references, ordering) is cheaper and more reliable than reconstructed context (LLM summarisation, embedding-based linking).

### Architectural Priorities

| Priority | Implication |
|----------|-------------|
| **Determinism** | Same input → same retrieval → predictable behaviour |
| **Explainability** | User can always ask "what did you use to answer that" |
| **Local execution** | No cloud dependencies for retrieval; FAISS + local embeddings |
| **Minimal latency** | <100ms retrieval; no LLM calls in retrieval path |
| **Controlled complexity** | Features disabled by default; opt-in only |

### Mechanism Status Convention

Throughout this document, RAG mechanisms are labelled:

| Status | Meaning | Default |
|--------|---------|---------|
| **✅ Implemented** | In production, active | On |
| **⚙️ Optional** | Implemented but configurable | Off |
| **📋 Documented** | Spec'd for future, not built | N/A |
| **❌ Rejected** | Evaluated and explicitly excluded | N/A |

**Rule:** A mechanism marked "Documented" or "Rejected" must not be implemented without updating this document first and justifying the change.

### Why Many Features Are Disabled

Advanced RAG techniques (multi-query, query expansion, agentic retrieval) are intentionally **documented but not enabled** because:

1. **Complexity cost** — Each feature adds debugging surface area
2. **Latency cost** — LLM calls in retrieval path add 200-500ms
3. **Predictability cost** — Dynamic behaviour makes failures harder to reproduce
4. **Marginal value** — Our corpus is small (<10k chunks); simple retrieval works

**Reconsider when:** Retrieval accuracy drops below 70% top-3 recall on representative queries AND simple tuning (thresholds, hybrid weights) has been exhausted.

---

## Table of Contents

0. [Design Philosophy & Scope](#design-philosophy--scope)
   - [Core Design Principle: Context Preservation](#core-design-principle-context-preservation)
1. [CLAUDE CODE: How to Test Om-E via Chrome MCP](#claude-code-how-to-test-om-e-via-chrome-mcp)
2. [Architecture Overview](#architecture-overview)
   - [End-to-End Retrieval Flow](#end-to-end-retrieval-flow-runtime)
   - [RAG Mechanism Status Matrix](#rag-mechanism-status-matrix)
   - [Decision Thresholds: When to Use What](#decision-thresholds-when-to-use-what)
   - [Contextual Enrichment](#contextual-enrichment-named-concept)
   - [Retrieval Evaluation](#retrieval-evaluation-lightweight)
   - [Anti-Patterns: What NOT to Add](#anti-patterns-what-not-to-add)
3. [Implementation Status](#implementation-status)
4. [Phase 6: Complete Rolling Summarization](#phase-6-complete-rolling-summarization)
5. [Phase 6.5: Session History & URL Tracking](#phase-65-session-history--url-tracking)
6. [Phase 6.6: RAG Infrastructure Hardening](#phase-66-rag-infrastructure-hardening)
7. [Phase 7: vStore Foundation](#phase-7-vstore-foundation)
8. [Phase 8: vStore UI Integration](#phase-8-vstore-ui-integration)
9. [Phase 9: vStore RAG Integration](#phase-9-vstore-rag-integration)
10. [Phase 10: Project Structure Migration](#phase-10-project-structure-migration)
11. [Phase 11: vStore File Upload](#phase-11-vstore-file-upload)
12. [Phase 12: Global Session Context](#phase-12-global-session-context)
13. [Design Guardrails & Non-Goals](#design-guardrails--non-goals)
14. [Appendices](#appendices)

---

## CLAUDE CODE: How to Test Om-E via Chrome MCP

**READ THIS FIRST when you need to test the chat/message pipeline.**

### Quick Reference

**Step 1:** Get tab context
```
mcp__claude-in-chrome__tabs_context_mcp
```
Returns `tabId` for the Om-E Web tab (usually `http://127.0.0.1:8080/`)

**Step 2:** Send a message using `omeSendChat`
```javascript
// mcp__claude-in-chrome__javascript_tool
// action: "javascript_exec"
// tabId: {the tabId from step 1}
// text:
window.omeSendChat('Your test message here').then(r => console.log('Done:', r));
'Message sent'
```

**Step 3:** Verify via console
```
mcp__claude-in-chrome__read_console_messages with tabId and pattern "Result"
```

**Step 4:** Check debug output
```bash
cat om_e_web_ws/llm_unified.md
```

### Testing Large Payloads (>500 chars)

```javascript
// action: "javascript_exec", tabId: {tabId}
const largeContent = `Sharks are a group of elasmobranch fish characterized by a cartilaginous skeleton, five to seven gill slits on the sides of the head, and pectoral fins that are not fused to the head. They have been around for more than 400 million years, predating dinosaurs. There are over 500 species of sharks, ranging from the small dwarf lanternshark at just 17 centimeters to the massive whale shark reaching up to 12 meters. Sharks play a crucial role as apex predators in maintaining healthy ocean ecosystems.`;
window.omeSendChat(largeContent).then(r => console.log('Done:', r));
'Large payload sent'
```

Then check:
- `data/chats/*.json` - should have stub `[Large content: ...; ref=hash]`
- `data/large_payloads/` - should have full content file

### DO NOT USE

- `window.postMessage({type: 'ome_send_chat_test', ...})` - may not work on dashboard page
- `window.omeLLMChat()` - doesn't save user message to chat file

### Key Files to Monitor

| File | What to Check |
|------|---------------|
| `data/chats/*.json` | Message saved with correct content |
| `data/large_payloads/` | Full content for large payloads |
| `llm_unified.md` | LLM prompt debug output |
| Server terminal | `[SessionContent] Added:` logs for vector indexing |

### MCP Testing Loop

```
1. GET CONTEXT
   mcp__claude-in-chrome__tabs_context_mcp
   → Returns: tabId for Om-E Web tab

2. SCREENSHOT (verify state)
   mcp__claude-in-chrome__computer action=screenshot tabId=XXX

3. SEND MESSAGE
   mcp__claude-in-chrome__javascript_tool
   → window.omeSendChat('test message')

4. WAIT
   mcp__claude-in-chrome__computer action=wait duration=3 tabId=XXX

5. READ FEEDBACK
   Read /Users/andy7string/Projects/Om_E_Web/om_e_web_ws/llm_unified.md
   → Contains: User Message, Tokens, Capabilities, Full prompt, Response

6. VERIFY & ITERATE
```

### Debug Output File Structure (`llm_unified.md`)

```markdown
# Unified LLM Call Debug

**Generated:** 2025-12-23 00:20:37
**User Message:** <what user typed or processed version>
**Messages:** <count of messages in history>
**Capabilities:** <count injected>
**Tokens:** ~XXX (system: XXX, messages: XXX)
**LLM Time:** XXXms

## System Prompt
<full system prompt with personality, rules, output format>

## Conversation
**USER:** <message content>
**SYSTEM:** [Session Context:]...

## Response
```json
{"type":"reply","text":"Om-E's response"}
```
```

### Server Restart Required

Code changes require server restart:
```bash
pkill -f ws_server.py
python om_e_web_ws/ws_server.py
```

Config changes in `llm_config.json` also need restart (server caches on load).

---

## Architecture Overview

### Current RAG Pipeline

```
User types message
        ↓
Ingestion: Large payload detection, persistence intent, dedup
        ↓
RAG queries capabilities (semantic search on user message)
        ↓
Build prompt with browser context + session context + retrieved items
        ↓
Single LLM call (unified orchestrator)
        ↓
Response (chat or action JSON)
```

### End-to-End Retrieval Flow (Runtime)

**Purpose:** A reader should be able to mentally "run" a query through this system.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER MESSAGE: "What do I have saved about machine learning?"               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: RAG GATING (should_skip_rag)                                       │
│  ─────────────────────────────────────                                      │
│  • Check: Is this a vStore query? → YES (matches "have saved")              │
│  • Decision: FORCE RAG (user explicitly asking about stored content)        │
│  • Outcome: Proceed to retrieval                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 2: QUERY NORMALISATION                                                │
│  ────────────────────────────                                               │
│  • Input: "What do I have saved about machine learning?"                    │
│  • Normalise: lowercase, trim whitespace                                    │
│  • Output: "what do i have saved about machine learning?"                   │
│  • NO query expansion, NO multi-query, NO HyDE                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 3: PARALLEL STORE QUERIES                                             │
│  ───────────────────────────────                                            │
│  Query all stores with normalised message (k=5 each, threshold=0.3):        │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Capabilities    │  │ Facts Store     │  │ Session Content │             │
│  │ (always_include │  │ (user knowledge)│  │ (ephemeral)     │             │
│  │  bypasses       │  │                 │  │                 │             │
│  │  threshold)     │  │                 │  │                 │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           ▼                    ▼                    ▼                       │
│     [0 results]          [2 results]          [1 result]                    │
│                          score: 0.72, 0.58    score: 0.41                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 4: RESULT AGGREGATION                                                 │
│  ──────────────────────────                                                 │
│  • Merge results from all stores                                            │
│  • Apply score threshold (0.3) — all 3 results pass                         │
│  • Sort by score descending                                                 │
│  • Apply top-k limit (5)                                                    │
│  • Deduplicate by content hash                                              │
│                                                                             │
│  Final results:                                                             │
│  1. [Facts] "ML basics summary" (0.72)                                      │
│  2. [Facts] "Neural network notes" (0.58)                                   │
│  3. [Session] "Recent ML article excerpt" (0.41)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 5: CONTEXT FORMATTING                                                 │
│  ─────────────────────────                                                  │
│  • Prepend source label: "[From vStore - Facts]", "[From Session]"          │
│  • Include metadata: saved date, original source URL                        │
│  • Preserve chunk position for "tell me more" capability                    │
│                                                                             │
│  Formatted context:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [From vStore - Facts, saved 2025-12-20]                             │   │
│  │ ML basics summary: Machine learning is a subset of AI that...       │   │
│  │                                                                     │   │
│  │ [From vStore - Facts, saved 2025-12-18]                             │   │
│  │ Neural network notes: A neural network consists of layers...        │   │
│  │                                                                     │   │
│  │ [From Session - current]                                            │   │
│  │ Recent ML article excerpt: The latest advances in...                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 6: PROMPT INJECTION                                                   │
│  ────────────────────────                                                   │
│  • Context injected into <retrieved_context> block                          │
│  • System prompt + browser context + retrieved context + user message       │
│  • Single LLM call                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LLM RESPONSE: "You have 2 items saved about machine learning:              │
│                 1. ML basics summary (saved Dec 20)                         │
│                 2. Neural network notes (saved Dec 18)                      │
│                 Would you like me to expand on either?"                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions visible in this flow:**
1. **RAG gating happens first** — No retrieval cost if query doesn't need it
2. **No LLM in retrieval path** — All steps are deterministic operations
3. **Parallel store queries** — Latency is max(store queries), not sum
4. **Source labelling** — LLM knows provenance of each chunk
5. **Threshold filtering** — Low-confidence results excluded

### Memory Tiers (Current + Planned)

| Tier | Scope | Storage | Trigger | Status |
|------|-------|---------|---------|--------|
| **Session** | Current browser session | In-memory + ephemeral vector | Automatic | ✅ Implemented |
| **Facts** | Permanent user knowledge | `vectors/system/facts/` | "remember X" patterns | ✅ Implemented |
| **Chat vStore** | Per-chat curated | `projects/{id}/chats/{chat}/vectors/` | User opt-in | 📋 Documented |
| **Project vStore** | Cross-chat curated | `projects/{id}/vectors/content/` | User opt-in | 📋 Documented |

### RAG Mechanism Status Matrix

**Authoritative reference for what is enabled, optional, planned, or rejected.**

Each category below represents a distinct stage in the retrieval pipeline. Understanding *why* each stage exists helps future maintainers decide whether to enable optional mechanisms or reconsider rejected ones.

#### Retrieval Mechanisms

**Problem solved:** How do we find relevant content from storage?

**Failure mode if removed:** No content retrieval; LLM has no context beyond conversation.

| Mechanism | Status | Default | Justification |
|-----------|--------|---------|---------------|
| Vector similarity (FAISS) | ✅ Implemented | On | Core retrieval; fast, local, deterministic |
| BM25 keyword search | 📋 **Planned (6.6.4)** | On | **Priority:** Fixes exact-match failures; ~30ms |
| Hybrid RRF fusion | 📋 **Planned (6.6.4)** | On | Combines BM25 + vector via rank fusion |
| Metadata pre-filtering | ✅ Implemented | On | Filter by scope/tags before similarity search |
| Score thresholding | ✅ Implemented | On | Prevents low-confidence injection |

#### Query Transformation

**Problem solved:** How do we prepare the user's message for retrieval?

**Failure mode if removed:** Raw queries with inconsistent casing/whitespace produce inconsistent retrieval.

| Mechanism | Status | Default | Justification |
|-----------|--------|---------|---------------|
| Query normalisation | ✅ Implemented | On | Lowercase, whitespace trim |
| Multi-query expansion | ❌ Rejected | N/A | Adds latency; hybrid search handles synonyms |
| HyDE (hypothetical docs) | ❌ Rejected | N/A | LLM in retrieval path; violates latency constraint |
| Query routing | 📋 Documented | N/A | May add for vStore scope selection |

#### Contextual Enrichment

**Problem solved:** How do we ensure retrieved chunks carry enough context to be understood?

**Failure mode if removed:** LLM receives orphan text fragments; cannot determine provenance or relevance.

| Mechanism | Status | Default | Justification |
|-----------|--------|---------|---------------|
| Metadata context headers | ✅ Implemented | On | Deterministic; no LLM at ingest |
| Chunk position tracking | ⚙️ Optional | On | Enables "tell me more" functionality |
| LLM chunk summarisation | ❌ Rejected | N/A | Hallucination risk; latency; storage overhead |
| Parent-child chunking | 📋 Documented | N/A | May add for long documents |

#### Re-ranking & Fusion

**Problem solved:** How do we improve result ordering after initial retrieval?

**Failure mode if removed:** Results ordered by raw similarity score; may miss semantically superior but lower-scoring results.

**Our position:** For small corpora, initial retrieval is accurate enough. Re-ranking adds latency without proportional benefit.

| Mechanism | Status | Default | Justification |
|-----------|--------|---------|---------------|
| RRF (Reciprocal Rank Fusion) | ⚙️ Optional | Off | Only useful with hybrid search |
| Cross-encoder re-ranking | ❌ Rejected | N/A | Adds 100-300ms; marginal accuracy gain |
| MMR (diversity) | ❌ Rejected | N/A | Corpus too small to need diversity |
| LLM-based re-ranking | ❌ Rejected | N/A | LLM in retrieval path; violates constraints |

#### Advanced Patterns

**Problem solved:** Techniques for complex retrieval scenarios beyond simple similarity search.

**Failure mode if removed:** N/A — these are extensions, not baseline requirements.

**Our position:** These patterns are evaluated and rejected because they violate core constraints (determinism, latency) or address problems we don't have (complex entity relationships, large corpus diversity).

| Mechanism | Status | Default | Justification |
|-----------|--------|---------|---------------|
| Multi-vector embeddings | ❌ Rejected | N/A | Single embedding sufficient for doc sizes |
| Agentic RAG | ❌ Rejected | N/A | Unpredictable; violates determinism |
| Graph RAG | ❌ Rejected | N/A | No entity relationships to model |
| Self-reflective retrieval | ❌ Rejected | N/A | Retry loops add latency; not needed |
| RAG fusion (multi-source) | 📋 Documented | N/A | Planned for vStore integration |

### Decision Thresholds: When to Use What

**Purpose:** Qualitative triggers for enabling optional mechanisms. These are guidelines, not hard rules.

#### When Cosine Similarity Alone Is Sufficient

Use vector-only retrieval (current default) when:
- Corpus is small (<10k chunks)
- Queries are semantically rich (natural language questions)
- Exact keyword matching is not critical
- Latency budget is tight (<50ms)

**Reconsider when:** Users report "I know I saved something about X but it didn't find it" — this often indicates exact-match failures that BM25 would catch.

#### When to Enable BM25 Hybrid Search

Enable hybrid search when:
- Queries often contain proper nouns, technical terms, or codes (e.g., "RFC 7231", "ModelX-500")
- Users frequently search for exact phrases
- Vector search returns semantically related but not literally matching results
- You observe >20% of queries where the correct chunk exists but scores below threshold

**Cost:** Adds ~30ms latency, requires maintaining BM25 index.

#### When MMR Diversity Is Justified

Enable MMR when:
- Top-k results are near-duplicates (paraphrased versions of same content)
- Corpus contains many similar documents on same topic
- User feedback indicates "all results say the same thing"

**Cost:** Adds computation; may exclude highly relevant results in favour of diverse but less relevant ones.

**Our decision:** Rejected for Om-E because corpus is small and diverse by nature (different page types, capabilities, user facts).

#### When Re-ranking Cost Is Worth the Latency

Enable cross-encoder re-ranking when:
- Initial retrieval quality is poor despite tuning
- High-stakes queries (e.g., financial, medical) require maximum precision
- Latency budget allows 100-300ms additional processing
- You have ground-truth data showing re-ranking improves accuracy

**Our decision:** Rejected. Our corpus is small enough that initial vector retrieval is accurate; re-ranking adds latency without proportional benefit.

### Query Transformation Boundaries

**CRITICAL:** Query transformation is **retrieval-scoped only**.

| Allowed | Not Allowed |
|---------|-------------|
| Normalise query text | Inject new facts into query |
| Expand synonyms (if enabled) | Modify user intent |
| Route to appropriate store | Add retrieved content to query |
| Apply metadata filters | Bleed into generation prompt as knowledge |

**Violation example:**
```python
# ❌ WRONG: Query transformation injecting knowledge
transformed_query = f"{original_query} (context: user previously asked about sharks)"

# ✅ CORRECT: Query transformation is text normalisation only
transformed_query = original_query.lower().strip()
```

**Rationale:** Query transformation that injects context makes RAG behave like an agent without the explicit control structures. This creates debugging nightmares and unpredictable behaviour.

### Multi-Vector Representation Constraints

**If multi-vector representations are ever added, these constraints are non-negotiable:**

| Constraint | Rationale |
|------------|-----------|
| Original chunks preserved | Multi-vector is additive, never replaces source |
| Parent-child traceability | Every vector links back to source chunk |
| No LLM-generated summaries embedded | Hallucination risk; provenance lost |
| Retrieval-only | Multi-vectors used for matching, not shown to user |
| Metadata parity | All vectors for same chunk share metadata |

**Warning:** Embedding LLM-generated summaries creates provenance risks. If the summary hallucinates, the retrieval system will confidently return wrong information with no way to trace it back to source.

### Contextual Enrichment (Named Concept)

**IMPORTANT:** This section defines how we add context to chunks WITHOUT using LLM summarization at ingest time.

We use **metadata-based context enrichment**, not generative summarization. This is a deliberate architectural choice.

| Term | Definition |
|------|------------|
| **Context Header** | Metadata prepended to chunk for retrieval (source, position, parent item) |
| **Chunk Situating Metadata** | Position info (`char_start`, `char_end`, `chunk_index`) for excerpt extraction |
| **Retrieval Context Envelope** | Full metadata wrapper returned with each search hit |

**What we DO:**
```python
# Metadata-based context (deterministic, no LLM at ingest)
chunk_metadata = {
    "item_id": "vs_abc123",
    "item_label": "Shark Article",     # User-assigned label
    "chunk_index": 2,                   # Position in parent
    "char_start": 1024,                 # Offset for excerpt
    "char_end": 1536,
    "source": "project_vstore",
    "tags": ["research", "animals"]     # User-assigned filtering
}
```

**What we DON'T do (and why):**
```python
# ❌ LLM-generated chunk context (Anthropic's "contextual retrieval")
# We explicitly avoid this because:
# 1. Adds latency at ingest (LLM call per chunk)
# 2. Risk of hallucination in chunk summaries
# 3. Increases storage (summary + original)
# 4. Harder to debug retrieval issues
# 5. Not needed for our document sizes (<50 chunks typical)

chunk_with_llm_context = {
    "text": "original chunk...",
    "llm_context": "This chunk discusses shark biology..."  # ❌ NOT doing this
}
```

**When to reconsider:** If average document size exceeds 100 chunks AND retrieval accuracy drops below 70% top-3 recall, revisit this decision. Log the issue first.

### Retrieval Evaluation (Lightweight)

**What "good retrieval" means for Om-E:**

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| **Top-3 Recall** | >80% | ~85% (estimated) | User-relevant content in first 3 results |
| **Top-1 Precision** | >70% | ~75% (estimated) | Best result is actually what user wanted |
| **Retrieval Latency** | <100ms | ~50ms | Vector search only, not LLM |
| **False Positive Rate** | <20% | ~15% (estimated) | Irrelevant content injected into prompt |

**Expected top-K ranges:**

| Store | Default K | Threshold | Rationale |
|-------|-----------|-----------|-----------|
| Capabilities | 7 | 0.55 | Higher bar, fewer but more confident |
| Session content | 5 | 0.40 | Lower bar, prefer recall |
| vStore (future) | 3 | 0.35 | User-curated, want to surface |
| Facts | 3 | 0.30 | Explicitly saved, low bar |

**Acceptable latency targets:**

| Operation | Target | Hard Limit |
|-----------|--------|------------|
| Vector search (FAISS) | <50ms | 100ms |
| BM25 search | <30ms | 50ms |
| Hybrid fusion (RRF) | <10ms | 20ms |
| Total retrieval | <100ms | 200ms |

**Known failure modes:**

| Failure Mode | Symptoms | Mitigation |
|--------------|----------|------------|
| **ID Mismatch** | "Action not found" errors | Action IDs are ephemeral; rescan on stale ID |
| **Temporal Ambiguity** | "yesterday" retrieves wrong content | Session memory is fresh; vStore is permanent |
| **Code/Technical Terms** | "GB10" misses exact match | Hybrid search (BM25) for keyword anchoring |
| **Short Queries** | "scroll" matches too many | Command patterns skip RAG entirely |
| **Threshold Cliff** | Good result at 0.54, threshold 0.55 | Log near-misses, tune thresholds |

**How to debug retrieval issues:**

```bash
# Check llm_unified.md for what was injected
cat om_e_web_ws/llm_unified.md | grep -A5 "Capabilities:"

# Check server logs for RAG decisions
grep "\[RAG\]" server.log

# Manual search test
python -c "
from retrieval.capabilities_store import CapabilitiesStore
store = CapabilitiesStore()
store.build()
results = store.search('scroll down', k=5)
for r in results:
    print(f'{r.score:.3f} {r.label}')
"
```

### Anti-Patterns: What NOT to Add

**Based on current architecture maturity, do NOT add these yet:**

| Pattern | Why Not | Reconsider When |
|---------|---------|-----------------|
| **Agentic RAG** | Adds unpredictability; current deterministic flow works | Retrieval accuracy <60% after tuning |
| **Graph RAG** | Document relationships not complex enough | Cross-document entity resolution needed |
| **LLM Chunk Context** | Latency + hallucination risk; metadata sufficient | 100+ chunk documents common |
| **Multi-Vector Embeddings** | Single embedding works for our doc sizes | Semantic precision drops significantly |
| **Multimodal Indexing** | Text-only sufficient; images handled via page scan | Image-based knowledge base requested |
| **Query Expansion (LLM)** | Adds latency; hybrid search handles synonyms | Vocabulary mismatch causes >30% misses |
| **Self-Reflective Retrieval** | Retry loops add latency; not needed | First-pass recall <50% |

**Rule:** The system is in the 90% solution zone. These additions add cost and complexity without proportional value for current use cases.

**Decision log location:** If these are reconsidered, document the decision in `docs/decisions/rag_extensions.md` with:
- What triggered reconsideration
- Measured failure rate before
- Expected improvement
- Implementation cost

### Directory Structure (Target)

```
om_e_web_ws/
├── retrieval/
│   ├── vector_store.py         # Base FAISS wrapper ✅
│   ├── capabilities_store.py   # Indexes capabilities ✅
│   ├── elements_store.py       # Indexes text.json ✅
│   ├── chat_memory_store.py    # Chat history summaries ✅
│   ├── session_content_store.py # Session content ✅
│   ├── memory_cycle.py         # Large payloads, persistence ✅
│   ├── chat_context.py         # Action/content classification ✅
│   ├── vstore.py               # NEW: User-curated vStore 🔲
│   └── query.py                # Combined query interface ✅
├── llm/
│   ├── orchestrator.py         # Unified single-call pipeline ✅
│   ├── ingestion.py            # Message preprocessing ✅
│   └── ...
└── data/
    ├── vectors/
    │   └── system/
    │       ├── capabilities/   # Capability embeddings ✅
    │       ├── chat_memory/    # Chat summaries ✅
    │       └── facts/          # Permanent facts ✅
    ├── chats/                  # Current chat storage ✅
    ├── large_payloads/         # Full large content ✅
    └── projects/               # NEW: Project-scoped data 🔲
        └── {project_id}/
            ├── project.json
            ├── vectors/
            │   └── content/    # Project vStore
            └── chats/
                └── {chat_id}/
                    ├── chat.json
                    └── vectors/
                        └── content/  # Chat vStore
```

---

## Implementation Status

### Completed Phases

| Phase | Description | Key Files |
|-------|-------------|-----------|
| 1 | Base VectorStore | `retrieval/vector_store.py` |
| 2 | ElementsStore | `retrieval/elements_store.py` |
| 3 | CapabilitiesStore | `retrieval/capabilities_store.py` |
| 4 | Query Integration | `retrieval/query.py`, `llm/orchestrator.py` |
| 5 | Large Payload Handling | `retrieval/memory_cycle.py` |

### Current Configuration

From `data/llm_config.json`:

```json
{
  "settings": {
    "cap_score_threshold": 0.55,
    "session_actions_limit": 10
  },
  "context": {
    "payload_context_lines": 5,
    "large_payload_threshold": 550,
    "payload_summary_budget": 50,
    "message_count_threshold": 8,
    "max_facts_in_prompt": 3,
    "fact_token_budget": 50
  }
}
```

---

## Phase 6: Complete Rolling Summarization

**Status:** ✅ Complete (2025-12-24)

### Intent

**Problem solved:** Long conversations exceed context windows. Without summarisation, early messages are truncated and context is lost.

**Failure mode guarded against:** User says "as I mentioned earlier" but the LLM has no access to that earlier content.

**Why this approach:** Rolling summarisation preserves semantic essence while reducing token count. Summaries are stored in chat JSON and injected into prompts, maintaining conversation continuity without context overflow.

### What's Done
- [x] Persistence intent detection patterns
- [x] Fact extraction when intent detected
- [x] Permanent fact storage in vector
- [x] Integration with prompt retrieval
- [x] Config: `message_count_threshold: 8`
- [x] **Flag-based action filtering** - `action_executed` flag from OrchestratorResult (authoritative)
- [x] **Rolling intent summarization** - LLM-generated summaries every 5 interactions
- [x] **Interaction tracking** - `interaction_count` in chat `context_state`
- [x] **Rolling summaries in chat JSON** - stored in `summaries.rolling` array
- [x] **Rolling summaries in prompt** - injected as `[Chat summary: ...]` in conversation

### What Remains (Future Phases)
- [ ] **Hybrid Search (BM25 + Vector)** - combine keyword and semantic search (deferred to Phase 7+)

### Implementation

**File:** `retrieval/memory_cycle.py`

```python
async def check_rolling_summary_needed(chat_dict: Dict) -> bool:
    """Check if content messages exceed threshold."""
    state = chat_dict.get("context_state", {})
    content_count = state.get("content_message_count", 0)
    threshold = get_config().get("context", {}).get("message_count_threshold", 8)
    return content_count > threshold

async def create_rolling_summary(chat_dict: Dict) -> str:
    """Summarize oldest content messages, store in chat JSON."""
    # Get messages since last summary
    # LLM summarization call
    # Update chat_dict["summaries"]["rolling"]
    # Reset content_message_count
```

**Hook:** `ws_server.py` in `append_user_message()` / `append_assistant_message()`

### Checklist
- [ ] `check_rolling_summary_needed()` function
- [ ] `create_rolling_summary()` LLM call
- [ ] Prompt template: `data/prompts/rolling_summary.md`
- [ ] Hook into message append flow
- [ ] Track `content_message_count` in chat context_state
- [ ] Test: After 9+ content messages, summary appears

### Hybrid Search (BM25 + Vector)

**Why:** Exact keyword matches (BM25) + semantic similarity (vectors) = better accuracy

| Query Type | BM25 Strength | Vector Strength |
|------------|---------------|-----------------|
| "GB10 specs" | ✅ Exact "GB10" | ✅ "specs" meaning |
| "guitar pricing" | ❌ No exact match | ✅ Semantic |
| "what was that RAG thing" | ✅ Exact "RAG" | ✅ Context |

**Implementation:**

**File:** `retrieval/vector_store.py`

```python
from rank_bm25 import BM25Okapi

class VectorStore:
    def __init__(self, store_name: str, ...):
        ...
        self.bm25 = None  # BM25 index (rebuilt on add)
        self.tokenized_texts = []  # For BM25

    def add(self, texts: List[str], metadata_list: List[dict]):
        # ... existing vector add ...

        # Rebuild BM25 index
        self.tokenized_texts = [t.lower().split() for t in self.texts]
        self.bm25 = BM25Okapi(self.tokenized_texts)

    def search(self, query: str, k: int = 5, threshold: float = 0.3,
               hybrid: bool = True, bm25_weight: float = 0.3) -> List[SearchResult]:
        """
        Search with optional hybrid BM25 + vector ranking.

        @param hybrid: Use hybrid search (default True)
        @param bm25_weight: Weight for BM25 scores (0-1, default 0.3)
        """
        if not hybrid or self.bm25 is None:
            return self._vector_search(query, k, threshold)

        # Get both result sets
        vector_results = self._vector_search(query, k * 2, threshold=0.0)
        bm25_scores = self.bm25.get_scores(query.lower().split())

        # Reciprocal Rank Fusion
        combined = self._rrf_combine(vector_results, bm25_scores, bm25_weight)
        return combined[:k]

    def _rrf_combine(self, vector_results, bm25_scores, bm25_weight):
        """Combine rankings using Reciprocal Rank Fusion."""
        # RRF: score = 1/(k+rank) for each system, then sum
        k = 60  # RRF constant
        scores = {}

        # Vector scores (already sorted by score)
        for rank, r in enumerate(vector_results):
            idx = self.texts.index(r.text)
            scores[idx] = scores.get(idx, 0) + (1 - bm25_weight) / (k + rank)

        # BM25 scores
        bm25_ranked = sorted(enumerate(bm25_scores), key=lambda x: -x[1])
        for rank, (idx, score) in enumerate(bm25_ranked):
            if score > 0:
                scores[idx] = scores.get(idx, 0) + bm25_weight / (k + rank)

        # Sort by combined score
        ranked = sorted(scores.items(), key=lambda x: -x[1])
        return [SearchResult(self.texts[idx], self.metadata[idx], score)
                for idx, score in ranked]
```

**Dependency:** `pip install rank-bm25`

### Action Filtering (Flag-Based, Not Heuristic)

**Problem:** Action requests and confirmations pollute session vector index, degrading RAG quality.

**Current State:** `is_action_message()` in `session_content_store.py` uses text pattern matching (heuristics) which misses cases and creates false positives.

**Solution:** Use the authoritative `action_executed` flag from `OrchestratorResult` instead of guessing from text patterns.

#### Architecture: Two-Layer Action History

| Layer | Storage | Purpose | Retention |
|-------|---------|---------|-----------|
| **Quick Access** | `session_actions.json` | Cross-chat action history for prompt injection | Rolling (session_actions_limit) |
| **Deep Lookup** | `turns.jsonl` | Full metrics for analysis and lookup | Append-only (permanent) |

#### Implementation Steps

**Step 1: Pass `action_executed` through message save flow**

**File:** `ws_server.py` - Update message append functions

```python
# Current signature:
def append_assistant_message(chat: dict, content: str) -> dict:

# New signature - add action_executed flag:
def append_assistant_message(chat: dict, content: str, action_executed: bool = False) -> dict:
    """
    @param action_executed: True if this was an action turn (from OrchestratorResult)
    """
    message = {...}
    # Pass flag to memory cycle
    on_message_saved(chat, message, action_executed=action_executed)
```

**Step 2: Update `on_message_saved()` to use flag**

**File:** `retrieval/memory_cycle.py`

```python
def on_message_saved(chat_dict: Dict, message: Dict, action_executed: bool = False) -> Dict:
    """
    @param action_executed: True if this turn executed an action (skip session vector)
    """
    # ... existing code ...

    if action_executed:
        # ACTION TURN: Log to session_actions.json only, skip vector
        condensed = condense_action(message, prev_user_content)
        if condensed:
            add_session_action(condensed, chat_title, chat_id)
        print(f"[MemoryCycle] Action turn - skipping session vector")
    else:
        # CONTENT TURN: Index to session vector
        if not content.startswith('[Large content:'):
            store = get_session_content_store()
            store.add(content, chat_id, chat_title, role, timestamp)

        # Track interaction count for rolling summary
        state['interaction_count'] = state.get('interaction_count', 0) + 1
```

**Step 3: Remove heuristic filtering from session_content_store.py**

The `is_action_message()` function becomes a fallback only - primary filtering happens via flag.

```python
def add(self, content: str, chat_id: str, ..., action_turn: bool = False):
    """
    @param action_turn: If True, skip indexing (authoritative flag from orchestrator)
    """
    # Primary filter: flag-based
    if action_turn:
        return

    # Fallback filter: heuristic (for edge cases)
    if not is_substantive(content):
        return

    # ... rest of indexing logic
```

### Rolling Intent Summarization

**Trigger:** Every 5 total interactions (chat + action turns)

**Storage:** `chat.json` → `summaries.rolling`

**File:** `retrieval/memory_cycle.py`

```python
SUMMARY_INTERACTION_THRESHOLD = 5  # Configurable

async def check_and_create_rolling_summary(chat_dict: Dict) -> Optional[str]:
    """
    Check if we've hit 5 interactions and need to summarize.
    Returns summary text if created, None otherwise.
    """
    state = chat_dict.get('context_state', {})
    count = state.get('interaction_count', 0)

    if count < SUMMARY_INTERACTION_THRESHOLD:
        return None

    # Get messages since last summary
    last_summarized = state.get('last_summarized_idx', 0)
    messages = chat_dict.get('messages', [])
    to_summarize = messages[last_summarized:last_summarized + SUMMARY_INTERACTION_THRESHOLD * 2]

    if not to_summarize:
        return None

    # LLM call to extract intent
    summary = await extract_intent_summary(to_summarize)

    # Store in chat JSON
    if 'summaries' not in chat_dict:
        chat_dict['summaries'] = {}

    # Append to rolling summary (keep last 3 summaries)
    rolling = chat_dict['summaries'].get('rolling', [])
    rolling.append({
        'text': summary,
        'from_idx': last_summarized,
        'to_idx': last_summarized + len(to_summarize),
        'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ')
    })
    chat_dict['summaries']['rolling'] = rolling[-3:]  # Keep last 3

    # Update state
    state['last_summarized_idx'] = last_summarized + len(to_summarize)
    state['interaction_count'] = 0  # Reset counter

    return summary

async def extract_intent_summary(messages: List[Dict]) -> str:
    """LLM call to extract intent/topic from messages."""
    # Use rolling_summary.md prompt template
    # Return condensed intent (50-100 tokens)
```

**Prompt Template:** `data/prompts/rolling_summary.md`

```markdown
Summarize the following conversation exchange into a brief intent statement.
Focus on: what the user wanted, what actions were taken, key topics discussed.
Output 1-2 sentences max.

Messages:
{messages}

Intent summary:
```

### Hybrid Action Lookup

**Quick Access (session_actions.json):**
- Used in prompt: `format_session_actions_for_prompt()`
- Rolling window: last N actions (session_actions_limit)
- Format: `[{"text": "GoogleIt: cats", "chat_id": "...", "ts": "..."}]`

**Deep Lookup (turns.jsonl):**
- Append-only metrics log
- Rich data: `turn_state`, `decision_type`, `execution_success`, `total_ms`
- Query by chat_id for action history analysis

```python
def get_action_history_for_chat(chat_id: str, limit: int = 20) -> List[Dict]:
    """Query turns.jsonl for action history."""
    turns_path = Path("data/metrics/turns.jsonl")
    actions = []

    with open(turns_path) as f:
        for line in f:
            turn = json.loads(line)
            if turn.get('chat_id') == chat_id and turn.get('handoff'):
                actions.append({
                    'decision_type': turn.get('decision_type'),
                    'timestamp': turn.get('timestamp'),
                    'execution_success': turn.get('execution_success'),
                    'top_score': turn.get('top_score')
                })

    return actions[-limit:]
```

### Updated Checklist

- [x] Pass `action_executed` flag from `OrchestratorResult` to `append_assistant_message()`
- [x] Update `on_message_saved()` to use flag instead of heuristics
- [x] Skip session vector indexing when `action_executed=True`
- [x] Track `interaction_count` in chat `context_state`
- [x] Implement `check_and_create_rolling_summary()` (trigger every 5 interactions)
- [x] Create `data/prompts/rolling_summary.md` template
- [x] Store rolling summaries in `chat.json` → `summaries.rolling`
- [x] Include rolling summary in prompt building
- [x] Add `get_action_history_for_chat()` for deep lookup from turns.jsonl
- [x] Test: Action turns skip session vector ✅ Verified 2025-12-24
- [x] Test: Content turns indexed to session vector ✅ Verified 2025-12-24
- [x] Test: After 5 interactions, rolling summary created ✅ Verified 2025-12-24
- [x] Test: Rolling summary appears in prompt context ✅ Verified 2025-12-24

### Configuration

Add to `llm_config.json`:

```json
{
  "context": {
    "summary_interaction_threshold": 5,
    "max_rolling_summaries": 3,
    "rolling_summary_token_budget": 100
  }
}
```

---

## Phase 6.5: Session History & URL Tracking

**Status:** 🔲 Not Started

### Intent

**Problem solved:** Users lose track of what pages they visited and what actions were taken during a session. Without history, there's no audit trail and no way to resume interrupted workflows.

**Failure mode guarded against:** User asks "what did I do on that page earlier?" and the system has no record.

**Why this approach:** Append-only URL logging provides an audit trail without affecting runtime performance. Session info is linked to chats, maintaining the existing mental model.

### Goal

Enable users to view session history (visited URLs, actions taken) through the HUD, with natural language search and filtering capabilities.

### User Requirements

1. HUD displays chats (existing ✅)
2. When chat selected → show **session info** underneath
3. Session info can be selected → populate chat view pane with **rolling URL list**
4. Natural language search across all URLs and actions
5. Filter by dates, URLs, searches, action types

### Architecture Overview

```
Sidebar                          │  Main View Pane
─────────────────────────────────┼────────────────────────────
🔍 Search Chats                  │
                                 │  [Chat Messages - default]
📁 Your Chats                    │       OR
  ├─ Machine Learning Chat  ◀───│  [Session History View]
  │   └─ 📊 Session Info    ◀───│       - Rolling URL list
  │       └─ 3 URLs, 12 actions │       - Actions timeline
  ├─ Project Planning           │       - Searchable/filterable
  └─ ...                        │
```

### Data Model

#### New File: `om_e_web_ws/data/url_history.jsonl`

Append-only log of all URL visits:

```jsonl
{"url":"https://youtube.com/watch?v=abc","title":"Video Title","chat_id":"20251224...","ts":"2025-12-24T07:00:00Z","action_type":"navigation"}
{"url":"https://google.com/search?q=ml","title":"ml - Google","chat_id":"20251224...","ts":"2025-12-24T07:01:00Z","action_type":"search"}
```

#### Enhanced: `om_e_web_ws/data/session_actions.json`

Add `url` and `action_type` fields:

```json
{
  "actions": [
    {"text":"Navigated to YouTube","chat_id":"...","ts":"...","action_type":"navigation","url":"https://youtube.com"},
    {"text":"Scrolled down","chat_id":"...","ts":"...","action_type":"scroll"},
    {"text":"Searched for ML tutorials","chat_id":"...","ts":"...","action_type":"search","url":"https://google.com/search?q=..."}
  ]
}
```

#### Action Types

| Type | Description |
|------|-------------|
| `navigation` | URL change/visit |
| `search` | Search query (Google, YouTube, etc.) |
| `scroll` | Page scroll |
| `click` | Element click |
| `input` | Form input |
| `tab` | Tab operations (open, close, switch) |

### Implementation Phases

#### Step 1: URL History Storage (Backend)

**Files:** `ws_server.py`, `memory_cycle.py`

- Create `url_history.jsonl` on first write
- Hook into `intelligence_update` messages (already receive URL/title)
- Append URL entry when page changes
- Add `action_type` classification to session_actions

#### Step 2: Session Info API (Backend)

**Files:** `ws_server.py`

New capabilities:

```python
# GetSessionInfo - returns URLs + actions for a chat
{"cap": "GetSessionInfo", "params": {"chat_id": "..."}}
# Returns: {urls: [...], actions: [...], stats: {url_count, action_count, duration}}

# SearchHistory - natural language search across URLs/actions
{"cap": "SearchHistory", "params": {"query": "youtube videos yesterday"}}
# Returns: {results: [{type, text, url, chat_id, ts, score}...]}
```

#### Step 3: HUD Session Info Toggle (Frontend)

**Files:** `hud.js`

- Add collapsible "Session Info" section under each chat item in sidebar
- Shows: URL count, action count, time range
- Click to expand → shows mini URL list
- Click URL list → switches main pane to Session History View

#### Step 4: Session History View (Frontend)

**Files:** `hud.js`

New view mode for main pane (alternative to chat messages):
- Rolling list of URLs with timestamps
- Action timeline interleaved
- Filter bar: date range, action type, URL domain
- Search box with natural language support

#### Step 5: Search Integration

**Files:** `hud.js`, `ws_server.py`

- Extend sidebar search to query `SearchHistory` capability
- Show results grouped by: Chats, URLs, Actions
- Click result → load relevant chat or session view

### UI Mockups

#### Session Info in Sidebar

```
┌─────────────────────────────┐
│ 🔍 Search...                │
├─────────────────────────────┤
│ 📁 Your Chats               │
│                             │
│ ▼ Machine Learning Chat     │  ← Click chat to load
│   ├─ Dec 24 • 42 messages   │
│   └─ 📊 Session Info ▼      │  ← NEW: Expandable
│       ├─ 5 URLs visited     │
│       ├─ 18 actions         │
│       └─ [View History →]   │  ← Opens Session View
│                             │
│ ▶ Project Planning          │  ← Collapsed
│ ▶ Daily Notes               │
└─────────────────────────────┘
```

#### Session History View (Main Pane)

```
┌────────────────────────────────────────────┐
│ ← Back to Chat    Session History          │
├────────────────────────────────────────────┤
│ 🔍 Search URLs & actions...                │
│ Filter: [All Types ▼] [Today ▼] [All ▼]    │
├────────────────────────────────────────────┤
│ 📍 Dec 24, 7:00 AM                         │
│ ├─ 🌐 youtube.com/watch?v=abc              │
│ │   "Machine Learning Tutorial"            │
│ ├─ 📜 Scrolled down                        │
│ ├─ 🔍 Searched: "neural networks"          │
│ └─ 🌐 google.com/search?q=neural+networks  │
│                                            │
│ 📍 Dec 24, 7:15 AM                         │
│ ├─ 🌐 arxiv.org/abs/2312.xxxxx             │
│ │   "Attention Is All You Need"            │
│ └─ 📜 Scrolled to top                      │
└────────────────────────────────────────────┘
```

### File Changes Summary

| File | Changes |
|------|---------|
| `ws_server.py` | Add `GetSessionInfo`, `SearchHistory` caps; URL logging |
| `memory_cycle.py` | Add URL history append; action_type classification |
| `hud.js` | Session info toggle; Session History View; enhanced search |
| `data/url_history.jsonl` | New file (auto-created) |

### Checklist

- [ ] Create `url_history.jsonl` logging in `memory_cycle.py`
- [ ] Hook into `intelligence_update` for URL tracking
- [ ] Add `action_type` field to session_actions
- [ ] Implement `GetSessionInfo` capability
- [ ] Implement `SearchHistory` capability
- [ ] Add Session Info toggle under chat items in HUD sidebar
- [ ] Create Session History View component in HUD main pane
- [ ] Add filter bar (date, action type, domain)
- [ ] Add natural language search box
- [ ] Extend sidebar search to include URL/action results
- [ ] Test: Navigate pages, verify URLs logged
- [ ] Test: Switch to Session History View, verify display
- [ ] Test: Search "youtube" returns relevant URLs

---

## Phase 6.6: RAG Infrastructure Hardening

**Status:** 🔲 Not Started

### Intent

**Problem solved:** Current RAG infrastructure has gaps that will compound as vStore scales: boundary information loss, silent model drift, exact-match failures, and data integrity risks.

**Failure mode guarded against:** Retrieval silently degrades after model update, or user content is lost at chunk boundaries.

**Why this approach:** Address infrastructure debt now, before vStore adds more complexity. Each component (overlap, versioning, hybrid search, atomic saves) is a targeted fix for an observed or predictable failure mode.

### Scope

This phase hardens the foundation before vStore implementation:

| Gap | Risk | Fix |
|-----|------|-----|
| No chunk overlap | Boundary information lost | 64-char overlap |
| No embedding version | Model change breaks retrieval | Version in index metadata |
| No BM25 | Exact keywords miss | Hybrid search (optional) |
| Non-atomic saves | Index/metadata drift | Atomic temp+rename |
| Undocumented thresholds | Future tuning impossible | Document rationale |

### 6.6.1 Chunk Overlap for Session Content

**Current:** `session_content_store.py:29-85` uses paragraph → sentence splitting with no overlap.

**Problem:** Information at chunk boundaries is lost during embedding.

**File:** `retrieval/session_content_store.py`

```python
def semantic_chunk(content: str, max_chunk_chars: int = 512, overlap: int = 64) -> List[str]:
    """
    Split content into semantic chunks WITH overlap.

    @param content: Text to chunk
    @param max_chunk_chars: Max chars per chunk (~128 tokens at 4 chars/token)
    @param overlap: Chars to repeat at chunk boundaries (prevents info loss)
    @return: List of chunk strings
    """
    # Short content - return as single chunk
    if len(content) <= max_chunk_chars:
        return [content.strip()] if content.strip() else []

    chunks = []
    current_pos = 0

    while current_pos < len(content):
        # Find chunk end
        chunk_end = min(current_pos + max_chunk_chars, len(content))

        # If not at end, try to break at sentence boundary
        if chunk_end < len(content):
            # Look for sentence end within last 100 chars
            search_start = max(chunk_end - 100, current_pos)
            for i in range(chunk_end, search_start, -1):
                if content[i-1:i+1] in ['. ', '.\n', '! ', '!\n', '? ', '?\n']:
                    chunk_end = i
                    break

        chunk = content[current_pos:chunk_end].strip()
        if chunk:
            chunks.append(chunk)

        # Move position forward, but overlap by `overlap` chars
        current_pos = chunk_end - overlap if chunk_end < len(content) else chunk_end

    return chunks
```

**Test:**
```python
def test_chunk_overlap():
    text = "First sentence ends here. Second sentence continues. Third sentence follows."
    chunks = semantic_chunk(text, max_chunk_chars=50, overlap=10)
    # Chunks should overlap by ~10 chars
    assert chunks[0][-10:] in chunks[1][:20]  # Overlap present
```

### 6.6.2 Chunk Position Metadata

**Purpose:** Enable "tell me more" and accurate excerpt extraction in vStore (Phase 7).

**Required per chunk:**

```python
@dataclass
class ChunkMetadata:
    item_id: str       # Parent item reference (for vStore)
    chunk_index: int   # Position in item (0-indexed)
    char_start: int    # Offset in original content
    char_end: int      # End offset in original content
```

**Update `semantic_chunk()` to return metadata:**

```python
@dataclass
class ChunkWithMeta:
    text: str
    char_start: int
    char_end: int

def semantic_chunk_with_meta(content: str, max_chunk_chars: int = 512, overlap: int = 64) -> List[ChunkWithMeta]:
    """
    Split content into chunks with position metadata.
    Required for vStore's "tell me more" functionality.
    """
    chunks = []
    current_pos = 0

    while current_pos < len(content):
        chunk_end = min(current_pos + max_chunk_chars, len(content))

        # ... sentence boundary logic ...

        chunk_text = content[current_pos:chunk_end].strip()
        if chunk_text:
            chunks.append(ChunkWithMeta(
                text=chunk_text,
                char_start=current_pos,
                char_end=chunk_end
            ))

        current_pos = chunk_end - overlap if chunk_end < len(content) else chunk_end

    return chunks
```

**Rule:** Reject chunks without position metadata on ingest. This is enforced in vStore (Phase 7) but prepared here.

### 6.6.3 Embedding Version Pinning

**Problem:** If embedding model changes, old indices silently return garbage results.

**Solution:** Store embedding metadata in index header, validate on load.

**File:** `retrieval/vector_store.py`

**Metadata header (stored in `metadata.json` alongside FAISS index):**

```json
{
  "embedding_model": "BAAI/bge-base-en-v1.5",
  "embedding_dimensions": 768,
  "created_with_version": "1.0",
  "created_at": "2025-12-26T00:00:00Z"
}
```

**Validation on index load:**

```python
def validate_embedding_compatibility(metadata: dict, config: dict) -> None:
    """
    Fail fast if index was created with different embedding model.

    @raises ValueError: If embedding dimensions mismatch
    """
    expected_dims = config.get("embedding", {}).get("dimensions", 768)
    actual_dims = metadata.get("embedding_dimensions")

    if actual_dims is None:
        print("[VectorStore] WARNING: Index missing embedding_dimensions - assuming compatible")
        return

    if actual_dims != expected_dims:
        raise ValueError(
            f"Index/embedding mismatch (expected {expected_dims}, found {actual_dims}). "
            f"Reindex required. Delete index files and restart."
        )

    # Log model info for debugging
    model = metadata.get("embedding_model", "unknown")
    version = metadata.get("created_with_version", "unknown")
    print(f"[VectorStore] Index validated: {model} v{version} ({actual_dims}d)")
```

**Config addition (`llm_config.json`):**

```json
{
  "embedding": {
    "model": "BAAI/bge-base-en-v1.5",
    "dimensions": 768,
    "version": "1.0"
  }
}
```

**Reindex conditions (document for maintainers):**

| Condition | Reindex Required |
|-----------|------------------|
| Embedding model change | ✅ Yes |
| Chunk size change | ✅ Yes |
| Chunk overlap change | ✅ Yes |
| Threshold change | ❌ No |
| Adding BM25 | ❌ No (additive) |

### 6.6.4 Hybrid Search (BM25 + Vector) — HIGH PRIORITY

**Intent**

**Problem solved:** Vector search finds semantically similar content but misses exact keyword matches. When a user searches for "GB10" or "RFC 7231", vector similarity may return related content but miss the exact term.

**Failure mode guarded against:** User saves content containing specific terms (product codes, technical identifiers, proper nouns), then searches for those terms and gets "no results" because vector similarity doesn't capture lexical matching.

**Why this approach:** BM25 provides lexical matching that vectors lack. Reciprocal Rank Fusion (RRF) combines both signals without requiring tuned weights — it uses rank positions, not raw scores.

**Why high priority:** This is the single highest-impact retrieval improvement for real-world queries. Most retrieval failures in production RAG systems are exact-match failures, not semantic failures.

| Query Type | Vector-Only | With Hybrid |
|------------|-------------|-------------|
| "GB10 specs" | ❌ May miss exact keyword | ✅ BM25 finds "GB10" |
| "RFC 7231 status codes" | ❌ Semantic drift | ✅ "RFC 7231" keyword anchors |
| "guitar pricing" | ✅ Semantic works | ✅ Same |
| "what was that RAG thing" | ❌ May drift | ✅ "RAG" keyword anchors |

**Dependency:** `pip install rank-bm25`

**File:** `retrieval/vector_store.py`

```python
from rank_bm25 import BM25Okapi
from typing import List, Optional
from dataclasses import dataclass

@dataclass
class SearchResult:
    text: str
    metadata: dict
    score: float
    source: str = "vector"  # "vector", "bm25", or "hybrid"

class VectorStore:
    def __init__(self, store_name: str, ...):
        ...
        self.bm25: Optional[BM25Okapi] = None
        self.tokenized_texts: List[List[str]] = []

    def add(self, texts: List[str], metadata_list: List[dict]):
        """Add texts to both vector and BM25 indices."""
        # ... existing vector add ...

        # Rebuild BM25 index (fast for <10k docs)
        self._rebuild_bm25()

    def _rebuild_bm25(self):
        """Rebuild BM25 index from current texts."""
        if not self.texts:
            self.bm25 = None
            return

        self.tokenized_texts = [self._tokenize(t) for t in self.texts]
        self.bm25 = BM25Okapi(self.tokenized_texts)
        print(f"[VectorStore] BM25 index rebuilt: {len(self.texts)} docs")

    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization for BM25."""
        # Lowercase, split on whitespace and punctuation
        import re
        return re.findall(r'\b\w+\b', text.lower())

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.3,
        hybrid: bool = True,
        bm25_weight: float = 0.3
    ) -> List[SearchResult]:
        """
        Search with optional hybrid BM25 + vector ranking.

        @param query: Search query
        @param k: Number of results
        @param threshold: Minimum score threshold
        @param hybrid: Use hybrid search (default True)
        @param bm25_weight: Weight for BM25 scores (0-1, default 0.3)
        """
        if not hybrid or self.bm25 is None:
            return self._vector_search(query, k, threshold)

        # Get both result sets
        vector_results = self._vector_search(query, k * 2, threshold=0.0)
        bm25_scores = self.bm25.get_scores(self._tokenize(query))

        # Reciprocal Rank Fusion
        combined = self._rrf_combine(vector_results, bm25_scores, bm25_weight)

        # Apply threshold and limit
        filtered = [r for r in combined if r.score >= threshold]
        return filtered[:k]

    def _rrf_combine(
        self,
        vector_results: List[SearchResult],
        bm25_scores: List[float],
        bm25_weight: float
    ) -> List[SearchResult]:
        """
        Combine rankings using Reciprocal Rank Fusion.

        RRF score = (1-w)/(k+rank_vector) + w/(k+rank_bm25)
        where k=60 is the RRF constant.
        """
        k = 60  # RRF constant (standard value)
        scores = {}

        # Vector contribution
        for rank, r in enumerate(vector_results):
            try:
                idx = self.texts.index(r.text)
                scores[idx] = (1 - bm25_weight) / (k + rank)
            except ValueError:
                continue

        # BM25 contribution
        bm25_ranked = sorted(enumerate(bm25_scores), key=lambda x: -x[1])
        for rank, (idx, score) in enumerate(bm25_ranked):
            if score > 0:
                scores[idx] = scores.get(idx, 0) + bm25_weight / (k + rank)

        # Sort by combined score
        ranked = sorted(scores.items(), key=lambda x: -x[1], reverse=False)
        ranked = sorted(scores.items(), key=lambda x: -x[1])

        return [
            SearchResult(
                text=self.texts[idx],
                metadata=self.metadata[idx],
                score=score,
                source="hybrid"
            )
            for idx, score in ranked
        ]
```

**Config addition (`llm_config.json`):**

```json
{
  "retrieval": {
    "hybrid_enabled": true,
    "bm25_weight": 0.3,
    "rrf_k": 60
  }
}
```

### 6.6.5 Atomic Index Save

**Problem:** If save fails mid-operation, FAISS index and metadata can drift.

**Solution:** Write to temp files, then atomic rename.

**File:** `retrieval/vector_store.py`

```python
import tempfile
import shutil
from pathlib import Path

def save(self) -> None:
    """
    Atomic save - write to temp, then rename.
    Prevents index/metadata drift on failure.
    """
    if self.index is None:
        return

    index_path = Path(self.index_path)
    meta_path = Path(self.metadata_path)

    # Create temp files in same directory (for atomic rename)
    temp_dir = index_path.parent
    temp_dir.mkdir(parents=True, exist_ok=True)

    temp_index = temp_dir / f".{index_path.name}.tmp"
    temp_meta = temp_dir / f".{meta_path.name}.tmp"

    try:
        # Write to temp files
        import faiss
        faiss.write_index(self.index, str(temp_index))

        with open(temp_meta, 'w') as f:
            json.dump({
                "embedding_model": MODEL_NAME,
                "embedding_dimensions": 768,
                "created_with_version": "1.0",
                "created_at": time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                "texts": self.texts,
                "metadata": self.metadata
            }, f, indent=2)

        # Atomic rename
        temp_index.rename(index_path)
        temp_meta.rename(meta_path)

        print(f"[VectorStore] Saved atomically: {len(self.texts)} entries")

    except Exception as e:
        # Clean up temp files on failure
        temp_index.unlink(missing_ok=True)
        temp_meta.unlink(missing_ok=True)
        raise RuntimeError(f"Failed to save index: {e}")
```

### 6.6.6 Retrieval Threshold Documentation

**Purpose:** Document threshold rationale so future maintainers can tune appropriately.

**Add to `llm_config.json`:**

```json
{
  "retrieval": {
    "thresholds": {
      "capabilities": {
        "value": 0.55,
        "rationale": "Higher bar - wrong capability execution is costly"
      },
      "session_content": {
        "value": 0.4,
        "rationale": "Lower bar - false positives less harmful for context"
      },
      "facts": {
        "value": 0.3,
        "rationale": "Even lower - user explicitly saved these, want to surface"
      },
      "vstore": {
        "value": 0.35,
        "rationale": "User-curated content, prefer surfacing over missing"
      }
    }
  }
}
```

**Document in code:**

```python
# retrieval/session_content_store.py
SEARCH_THRESHOLD = 0.4  # Lower than caps (0.55) - false positives less harmful

# retrieval/capabilities_store.py
SEARCH_THRESHOLD = 0.55  # Higher bar - wrong cap execution is costly

# retrieval/vstore.py (Phase 7)
SEARCH_THRESHOLD = 0.35  # User-curated, prefer surfacing
```

### 6.6.7 Facts Store Quota Tracking

**Problem:** Facts store is unbounded and could grow indefinitely.

**Solution:** Add quota tracking with warning.

**File:** `retrieval/memory_cycle.py`

```python
MAX_FACTS_QUOTA = 500  # Configurable

def check_facts_quota() -> bool:
    """
    Check if facts store exceeds quota.
    Returns True if under quota, False with warning if exceeded.
    """
    facts_path = Path("data/vectors/system/facts")
    if not facts_path.exists():
        return True

    # Count entries in metadata
    meta_path = facts_path / "metadata.json"
    if not meta_path.exists():
        return True

    with open(meta_path) as f:
        meta = json.load(f)

    count = len(meta.get("texts", []))

    if count > MAX_FACTS_QUOTA:
        print(f"[MemoryCycle] WARNING: Facts store exceeds quota: {count}/{MAX_FACTS_QUOTA}")
        print("[MemoryCycle] Consider cleaning up old facts")
        return False

    return True

def add_fact(fact_text: str, chat_id: str, original_message: str) -> bool:
    """Add fact with quota check."""
    if not check_facts_quota():
        print("[MemoryCycle] Facts quota exceeded - fact not added")
        return False

    # ... existing add logic ...
    return True
```

### Checklist

**6.6.1 Chunk Overlap:**
- [ ] Update `semantic_chunk()` to accept overlap parameter
- [ ] Implement overlap logic (default 64 chars)
- [ ] Test: Verify chunks overlap at boundaries
- [ ] Test: End-of-content doesn't create tiny trailing chunks

**6.6.2 Chunk Position Metadata:**
- [ ] Create `ChunkWithMeta` dataclass
- [ ] Implement `semantic_chunk_with_meta()`
- [ ] Update session_content_store to use metadata (optional, required for vStore)

**6.6.3 Embedding Version Pinning:**
- [ ] Add `embedding` section to `llm_config.json`
- [ ] Update `VectorStore.save()` to include embedding metadata
- [ ] Implement `validate_embedding_compatibility()`
- [ ] Call validation on index load
- [ ] Test: Mismatched dimensions raises ValueError

**6.6.4 Hybrid Search (BM25):**
- [ ] Add `rank-bm25` to requirements.txt
- [ ] Add `bm25` and `tokenized_texts` to VectorStore
- [ ] Implement `_rebuild_bm25()`
- [ ] Implement `_tokenize()`
- [ ] Implement `_rrf_combine()`
- [ ] Update `search()` with hybrid parameter
- [ ] Add `retrieval` section to `llm_config.json`
- [ ] Test: "GB10 specs" finds exact keyword match
- [ ] Test: Hybrid disabled still works (vector-only)

**6.6.5 Atomic Index Save:**
- [ ] Update `save()` to use temp files
- [ ] Implement atomic rename
- [ ] Add cleanup on failure
- [ ] Test: Interrupted save doesn't corrupt index

**6.6.6 Threshold Documentation:**
- [ ] Add `thresholds` section to `llm_config.json`
- [ ] Add threshold comments to each store file
- [ ] Document rationale in code comments

**6.6.7 Facts Quota:**
- [ ] Add `MAX_FACTS_QUOTA` constant
- [ ] Implement `check_facts_quota()`
- [ ] Update `add_fact()` with quota check
- [ ] Test: Quota warning appears when exceeded

---

## Phase 7: vStore Foundation

**Status:** 🔲 Not Started
**Dependencies:** Phase 6.6 (RAG Infrastructure Hardening) must be complete

### Intent

**Problem solved:** Users have knowledge they want to persist across sessions and reference later. Current facts store is implicit; users need explicit, curated storage they control.

**Failure mode guarded against:** User pastes important content, expects to reference it later, but it's only in ephemeral session memory.

**Why this approach:** Two-tier storage (chat-scoped and project-scoped) matches user mental model. Content is verbatim-preserved, never summarised, to maintain fidelity.

### Prerequisites from Phase 6.6

This phase builds on infrastructure from Phase 6.6:
- Chunk overlap (64 chars) for boundary preservation
- Chunk position metadata for "tell me more"
- Embedding version pinning for index compatibility
- Atomic index saves for data integrity

### Goal

Introduce user-curated vector storage with two tiers:
- **Chat vStore** — content scoped to a single chat
- **Project vStore** — content shared across all chats in a project

### Key Distinction: vStore vs Memory

| Concept | vStore | Memory |
|---------|--------|--------|
| **Purpose** | Curated reference content | Behavioural/conversational context |
| **Storage** | Exact, verbatim, never summarised | Lossy, summarised, compressed |
| **Persistence** | Permanent until deleted | Session or rolling window |
| **Control** | User-curated (opt-in) | Automatic |

**Rule:** vStore content is never summarised for storage, only chunked for embedding.

### Data Schema

**Metadata Schema** (`vectors/content/metadata.json`):
```json
{
  "items": [
    {
      "id": "vs_abc123",
      "label": "Shark Article",
      "source": "pasted",
      "source_chat_id": "chat_xyz",
      "content_hash": "sha256...",
      "chunk_ids": [0, 1, 2, 3],
      "char_count": 2450,
      "file_path": "files/abc123_shark-article.md",
      "created_at": "2025-12-24T10:00:00Z",
      "tags": ["research", "animals"]
    }
  ]
}
```

### Implementation

**File:** `retrieval/vstore.py`

```python
class VStoreItem:
    """Single item in a vStore."""
    id: str
    label: str
    source: Literal["pasted", "uploaded", "promoted"]
    content_hash: str
    chunk_ids: List[int]
    char_count: int
    file_path: Optional[str]
    created_at: str
    tags: List[str]

class ChatVStore(VectorStore):
    """Per-chat user-curated content."""

    def __init__(self, project_id: str, chat_id: str):
        path = f"projects/{project_id}/chats/{chat_id}/vectors/content"
        super().__init__(path)

    def add_content(self, content: str, label: str, tags: List[str] = None) -> VStoreItem:
        """Add user-curated content to chat vStore."""
        # 1. Hash content for dedup
        # 2. Chunk content for embedding
        # 3. Add chunks to FAISS
        # 4. Store original in files/
        # 5. Update metadata.json

    def remove_item(self, item_id: str) -> bool:
        """Remove item and its chunks."""

    def search(self, query: str, k: int = 5) -> List[VStoreResult]:
        """Semantic search over stored content."""

class ProjectVStore(VectorStore):
    """Cross-chat user-curated content."""

    def __init__(self, project_id: str):
        path = f"projects/{project_id}/vectors/content"
        super().__init__(path)

    def promote_from_chat(self, chat_vstore: ChatVStore, item_id: str, keep_in_chat: bool = False):
        """Promote chat item to project level."""
```

### Capabilities

| Capability | Description | Params |
|------------|-------------|--------|
| `AddToChatVStore` | Save content to current chat's vStore | `content`, `label?`, `tags?` |
| `AddToProjectVStore` | Save content to project vStore | `content`, `label?`, `tags?` |
| `PromoteToProject` | Move chat item to project | `item_id`, `keep_in_chat?` |
| `RemoveFromVStore` | Delete item | `item_id`, `scope` (chat/project) |
| `ListVStore` | List items | `scope`, `search?` |
| `SearchVStore` | Semantic search | `query`, `scope`, `limit` |

### Chunking Rules (from §3.5)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `chunk_size` | 512 chars | Balances context vs embedding precision |
| `chunk_overlap` | 64 chars | Prevents hard boundary loss |
| `split_preference` | sentence > paragraph > fixed | Avoid mid-sentence breaks |
| `min_chunk_size` | 128 chars | Reject fragments below this |

**Split priority:**
1. Sentence boundary (`. ` or `.\n`)
2. Paragraph boundary (`\n\n`)
3. Fixed offset (only if no natural break within 2× chunk_size)

### Chunk Metadata (required on ingest)

Each chunk must have:
```json
{
  "item_id": "vs_abc123",
  "chunk_index": 0,
  "char_start": 0,
  "char_end": 512
}
```
**Rule:** Reject chunks without complete position metadata.

### Embedding Validation

On index load, validate embedding compatibility:
```python
def validate_index(metadata: dict, config: dict) -> None:
    """Fail fast if index/config mismatch."""
    expected_dims = config["vstore"]["embedding"]["dimensions"]  # 768
    actual_dims = metadata.get("embedding_dimensions")
    if actual_dims != expected_dims:
        raise ValueError(f"Index/embedding mismatch (expected {expected_dims}, found {actual_dims}). Reindex required.")
```

### Checklist
- [ ] Create `retrieval/vstore.py` with VStoreItem, ChatVStore, ProjectVStore
- [ ] Content hashing for deduplication
- [ ] Chunking with overlap (512 chars, 64 overlap)
- [ ] Sentence-aware splitting (prefer natural breaks)
- [ ] Reject chunks < 128 chars
- [ ] Chunk position metadata (`char_start`, `char_end`)
- [ ] Embedding dimension validation on index load
- [ ] Store embedding metadata in `metadata.json` header
- [ ] Metadata persistence (`metadata.json`)
- [ ] Original file storage (`files/`)
- [ ] Add capabilities to `internal_capabilities.json`
- [ ] Handlers in `ws_server.py`
- [ ] Test: Add content, list, search, remove
- [ ] Test: Embedding mismatch fails fast

---

## Phase 8: vStore UI Integration

**Status:** 🔲 Not Started

### Intent

**Problem solved:** Users need visibility into what's stored and control over what gets saved. Without UI, vStore is a black box.

**Failure mode guarded against:** User doesn't know content was saved, or can't find/manage saved content.

**Why this approach:** Save prompts appear contextually (when content exceeds threshold). Sidebar provides inventory view. Design follows existing HUD patterns.

### Goal

Integrate vStore into the HUD interface:
1. Prompt area toggle for saving content
2. Sidebar vStore section
3. Item detail view

### Prompt Area Toggle

When content exceeds threshold (e.g., 200+ chars), show save options:

```
┌─────────────────────────────────────────────────────────────┐
│  [Ask me anything...]                                        │
│                                                              │
│  ┌─────────────────────────────────────┐                    │
│  │ Large content detected (2.4kb)      │                    │
│  │                                     │                    │
│  │  ☐ Save to Chat vStore              │                    │
│  │  ☐ Save to Project vStore           │                    │
│  │                                     │                    │
│  │  Label: [Auto-generated...]     [✎] │                    │
│  └─────────────────────────────────────┘                    │
│                                              [Send →]        │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar vStore Section

```
┌─────────────────────────────────────┐
│  📁 Project: Om-E Web               │
│                                     │
│  ▼ 📦 Project vStore (3)            │
│    ├── 📄 Shark Biology    [↗][🗑]  │
│    ├── 📄 Guitar Specs     [↗][🗑]  │
│    └── [+ Upload file]              │
│                                     │
│  ▼ 💬 Chats                         │
│    ▼ jazz guitar research           │
│      ▼ 📦 vStore (2)                │
│        ├── 📄 Ibanez vs Gibson [↑]  │
│        ├── 📄 Price List       [↑]  │
│        └── [+ Add]                  │
└─────────────────────────────────────┘
```

### Checklist
- [ ] Content length detection in HUD prompt area
- [ ] Toggle UI component
- [ ] Label input field
- [ ] Wire to AddToChatVStore / AddToProjectVStore capabilities
- [ ] Sidebar vStore section
- [ ] Item list with actions (view, delete, promote)
- [ ] Item detail modal/panel
- [ ] Test: Paste large content, toggle save, verify stored

---

## Phase 9: vStore RAG Integration

**Status:** 🔲 Not Started

### Intent

**Problem solved:** vStore content needs to surface in LLM responses with correct priority and clear attribution. Without integration, saved content is invisible to the LLM.

**Failure mode guarded against:** User saves content to vStore but LLM doesn't use it, or uses it without attribution so user can't verify source.

**Why this approach:** Fixed priority order (chat vStore → project vStore → session → capabilities) ensures most relevant content wins. Attribution in responses lets users verify sources.

### Goal

Integrate vStore into the RAG query flow with proper priority and attribution.

### Query Priority Order

```
1. Chat vStore (current chat)
   └── Most specific, user-curated for this conversation

2. Project vStore
   └── Cross-chat curated knowledge

3. Session Memory (ephemeral)
   └── Recent conversation context

4. Capabilities
   └── What actions can be taken
```

**Do not change this order.** It matches how humans expect answers to feel.

### Retrieval Contract

| Rule | Description |
|------|-------------|
| **Excerpts, not documents** | Retrieval returns excerpts, never full documents |
| **Full content on request** | Full content shown only on explicit user request |
| **Excerpt size cap** | Max 512 chars per excerpt (configurable) |
| **Explainability** | User can always ask "what did you use to answer that" |

### Multi-Hit Handling

| Matches | Behaviour |
|---------|-----------|
| **0** | Acknowledge clearly: "I don't have any saved content about X" |
| **1-2** | Summarise inline with source attribution |
| **3+** | List items, ask user which to use |

### Source Attribution

Every RAG hit must carry:

| Field | Description |
|-------|-------------|
| `source` | `chat_vstore` / `project_vstore` / `session_memory` |
| `label` | User-assigned label or auto-generated |
| `date_added` | When content was saved |
| `item_id` | For vStore items, enables "tell me more about this" |

### Implementation

**File:** `retrieval/query.py` - Update existing query function:

```python
async def query_with_vstore(
    user_message: str,
    chat_id: str,
    project_id: str = "default",
    k_vstore: int = 3,
    k_session: int = 3,
    k_caps: int = 7
) -> RetrievalResult:
    """Query all stores with vStore priority."""

    results = []

    # 1. Chat vStore (highest priority)
    chat_vstore = ChatVStore(project_id, chat_id)
    chat_results = chat_vstore.search(user_message, k=k_vstore)
    for r in chat_results:
        r.source = "chat_vstore"
    results.extend(chat_results)

    # 2. Project vStore
    project_vstore = ProjectVStore(project_id)
    project_results = project_vstore.search(user_message, k=k_vstore)
    for r in project_results:
        r.source = "project_vstore"
    results.extend(project_results)

    # 3. Session memory (existing)
    session_results = get_session_context(user_message, chat_id)

    # 4. Capabilities (existing)
    cap_results = cap_store.search(user_message, k=k_caps)

    return RetrievalResult(
        vstore=results,
        session=session_results,
        capabilities=cap_results
    )
```

### "What Do I Have Saved?" Query

This is a **first-class query type**, not a side effect of search:

```
User: "What do I have saved about sharks?"

Om-E: "You have 2 items about sharks:
       1. Shark Biology (2.4kb) - saved Dec 24 in project vStore
       2. Ocean Facts (1.1kb) - saved Dec 20 in 'research' chat

       Want me to summarise either one?"
```

### When NOT to Use RAG (from §6.11)

**Architectural principle:** RAG is a retrieval mechanism, not a universal enhancement. Injecting irrelevant context is worse than injecting nothing — it costs latency, pollutes the prompt, and can actively mislead the LLM.

**Decision priority order:**
1. Is this an explicit vStore query? → **Force RAG** (user asking about saved content)
2. Is this a creative/generative request? → **Skip RAG** (user wants original content)
3. Is this an imperative command? → **Skip RAG** (direct action, not knowledge lookup)
4. Is this about current page state? → **Skip RAG** (use live DOM scan instead)
5. Does this exactly match a capability? → **Skip RAG** (capability pipeline handles it)
6. Otherwise → **Use RAG** with standard thresholds

#### Query Classification Examples

| User Message | Classification | RAG Action | Rationale |
|--------------|----------------|------------|-----------|
| "What do I have saved about sharks?" | vStore query | **Force RAG** | Explicit request for stored content |
| "Write me a poem about the ocean" | Creative request | **Skip** | User wants original generation |
| "Click the submit button" | Imperative command | **Skip** | Direct action, not knowledge lookup |
| "What's on this page?" | Current page query | **Skip** | Use live DOM scan |
| "Open YouTube" | Capability match | **Skip** | Capability pipeline handles |
| "Tell me about machine learning" | Knowledge query | **Use RAG** | May have relevant stored content |
| "How do I reset my password?" | Knowledge query | **Use RAG** | May have relevant stored content |

#### Failure Modes (What Happens When RAG Is Misused)

| Misuse Pattern | Symptom | Impact |
|----------------|---------|--------|
| RAG on creative requests | Generic/repetitive outputs | User gets rehashed stored content instead of original ideas |
| RAG on commands | Latency + confusion | LLM receives irrelevant context, may misinterpret command |
| RAG on current-page queries | Stale/wrong answers | LLM uses stored content instead of live DOM |
| Skip RAG on knowledge queries | "I don't know" responses | LLM has no context even when user has saved relevant content |

#### Skip Scenarios Table

RAG is for **reference retrieval**, not for everything. Skip RAG for:

| Scenario | Why | Alternative |
|----------|-----|-------------|
| **Creative generation** | User wants original, not recalled | LLM generation without RAG |
| **Real-time/volatile data** | vStore may be stale | Direct page scan |
| **Behavioural instructions** | "Always do X" rules | System prompt or capabilities |
| **Sensitive data** | Credentials, keys | Never store in vStore |
| **Action parameters** | Dynamic values | LLM extraction from conversation |

**Detection patterns (skip RAG):**
- User asks for "something new" or "original"
- Query is about current page state
- Query matches a capability exactly
- Message is a command, not a question

**File:** `retrieval/rag_gating.py` (NEW)

```python
"""
RAG Gating - Determines when to skip RAG retrieval.

Principle: When in doubt, prefer no RAG injection over irrelevant injection.
Silent is better than wrong.
"""

import re
from typing import List, Optional

# Patterns that indicate creative/generative intent (skip RAG)
CREATIVE_PATTERNS = [
    r'\boriginal\b',
    r'\bnew idea\b',
    r'\bcreate\b',
    r'\bimagine\b',
    r'\bwrite me\b',
    r'\bgenerate\b',
    r'\binvent\b',
    r'\bmake up\b',
    r'\bcome up with\b'
]

# Imperative command patterns (skip RAG - direct action)
COMMAND_PATTERNS = [
    r'^scroll\s',
    r'^click\s',
    r'^open\s',
    r'^close\s',
    r'^go\s+to\b',
    r'^navigate\s',
    r'^switch\s',
    r'^play\b',
    r'^pause\b',
    r'^stop\b',
    r'^refresh\b',
    r'^reload\b',
    r'^search\s+for\b',
    r'^google\b',
    r'^find\s+on\b'
]

# Current page state patterns (skip vStore, use live scan)
CURRENT_PAGE_PATTERNS = [
    r'\bthis page\b',
    r'\bcurrent page\b',
    r'\bon screen\b',
    r'\bwhat.+see\b',
    r'\bwhat.+showing\b',
    r'\bright now\b'
]


def should_skip_rag(
    message: str,
    matched_capabilities: Optional[List[dict]] = None,
    exact_cap_threshold: float = 0.9
) -> tuple[bool, str]:
    """
    Determine if RAG retrieval should be skipped.

    @param message: User message
    @param matched_capabilities: Capabilities that matched (from RAG)
    @param exact_cap_threshold: Score threshold for "exact match"
    @return: (should_skip: bool, reason: str)
    """
    msg_lower = message.lower().strip()

    # 1. Creative/generative request - user wants original content
    for pattern in CREATIVE_PATTERNS:
        if re.search(pattern, msg_lower):
            return True, "creative_request"

    # 2. Imperative command - direct action, skip vStore lookup
    for pattern in COMMAND_PATTERNS:
        if re.search(pattern, msg_lower):
            return True, "imperative_command"

    # 3. Current page query - use live DOM scan, not stored content
    for pattern in CURRENT_PAGE_PATTERNS:
        if re.search(pattern, msg_lower):
            return True, "current_page_query"

    # 4. Exact capability match - capability pipeline handles it
    if matched_capabilities:
        for cap in matched_capabilities:
            if cap.get('score', 0) >= exact_cap_threshold:
                return True, f"exact_capability_match:{cap.get('label', 'unknown')}"

    # 5. Very short messages are usually commands or acknowledgments
    if len(msg_lower) < 15 and not '?' in msg_lower:
        return True, "short_command"

    return False, "rag_appropriate"


def is_vstore_query(message: str) -> bool:
    """
    Detect if user is explicitly asking about stored content.
    These queries should ALWAYS use vStore.

    Examples:
    - "What do I have saved about sharks?"
    - "Show my saved content"
    - "What's in my knowledge base?"
    """
    patterns = [
        r'\bwhat.+have.+saved\b',
        r'\bshow.+saved\b',
        r'\bmy.+knowledge\s*base\b',
        r'\bwhat.+stored\b',
        r'\blist.+vstore\b',
        r'\bmy.+vstore\b',
        r'\bwhat.+know about\b'  # "what do I know about X"
    ]

    msg_lower = message.lower()
    for pattern in patterns:
        if re.search(pattern, msg_lower):
            return True

    return False
```

**Integration with orchestrator:**

```python
# llm/orchestrator.py
from retrieval.rag_gating import should_skip_rag, is_vstore_query

async def _query_all_stores(self, user_message: str, chat_id: str) -> RetrievalResult:
    """Query stores with gating logic."""

    # Check if user is explicitly asking about stored content
    if is_vstore_query(user_message):
        # Force vStore query even if it would otherwise be skipped
        return await query_with_vstore(user_message, chat_id, force=True)

    # Check if RAG should be skipped
    skip, reason = should_skip_rag(user_message, self.matched_caps)
    if skip:
        print(f"[RAG] Skipped: {reason}")
        return RetrievalResult.empty()  # No vStore context injected

    # Normal RAG query
    return await query_with_vstore(user_message, chat_id)
```

**Rule:** When in doubt, prefer no RAG injection over irrelevant injection.

### Checklist

**vStore Query Integration:**
- [ ] Update `query.py` with vStore priority
- [ ] Source attribution on all results
- [ ] Excerpt extraction (max 512 chars)
- [ ] Multi-hit handling logic (0, 1-2, 3+ matches)
- [ ] Integration with orchestrator prompt building

**RAG Gating (`retrieval/rag_gating.py`):**
- [ ] Create `rag_gating.py` with pattern constants
- [ ] Implement `should_skip_rag()` with reason codes
- [ ] Implement `is_vstore_query()` for explicit queries
- [ ] Add CREATIVE_PATTERNS (original, create, imagine, etc.)
- [ ] Add COMMAND_PATTERNS (scroll, click, open, etc.)
- [ ] Add CURRENT_PAGE_PATTERNS (this page, on screen, etc.)
- [ ] Integrate with orchestrator `_query_all_stores()`
- [ ] Add logging for skip reasons

**Testing:**
- [ ] Test: "Create a new poem" → skips RAG (creative_request)
- [ ] Test: "scroll down" → skips RAG (imperative_command)
- [ ] Test: "What's on this page?" → skips vStore (current_page_query)
- [ ] Test: "What do I have saved about sharks?" → forces vStore query
- [ ] Test: Save content, query, verify attribution
- [ ] Test: 3+ matches presents list to user

---

## Phase 10: Project Structure Migration

**Status:** 🔲 Not Started

### Goal

Migrate from flat `data/chats/` to project-scoped structure.

### Migration Steps

1. Create default project structure:
   ```
   data/projects/default/
   ├── project.json
   ├── vectors/
   │   └── content/     # Project vStore (empty initially)
   └── chats/           # Migrated chats
   ```

2. Move existing chats:
   ```
   data/chats/{id}.json → data/projects/default/chats/{id}/chat.json
   ```

3. Update all file path references in:
   - `ws_server.py`
   - `llm/orchestrator.py`
   - `retrieval/*.py`

### Project JSON Schema

```json
{
  "project_id": "default",
  "name": "Default Project",
  "owner_id": "default",
  "created_at": "2025-12-24T00:00:00Z",
  "updated_at": "2025-12-24T00:00:00Z",
  "settings": {
    "auto_summarise": true
  }
}
```

### Backward Compatibility

- Existing chats continue working without vStore
- Session memory functions as before
- vStore is additive, not replacing existing functionality

### Checklist
- [ ] Create `data/projects/default/` structure
- [ ] Migration script for existing chats
- [ ] Update `CHATS_DIR` references in ws_server.py
- [ ] Update orchestrator path references
- [ ] Update retrieval store paths
- [ ] Test: Verify existing chats work after migration
- [ ] Test: New chats created in project structure

---

## Phase 11: vStore File Upload

**Status:** 🔲 Not Started

### Goal

Allow users to upload files (.md, .txt, .pdf, .json) to their vStore.

### Supported Formats

| Format | Processing |
|--------|------------|
| `.md` | Direct text extraction |
| `.txt` | Direct text extraction |
| `.pdf` | PDF text extraction (PyPDF2 or pdfplumber) |
| `.json` | JSON stringify or key extraction |

### Upload Flow

```
User clicks [+ Upload] in sidebar
        ↓
File picker (browser native)
        ↓
File sent to server via WebSocket (base64 encoded)
        ↓
Server: Validate format, size < 1MB
        ↓
Server: Extract text content
        ↓
Server: Chunk and index to vStore
        ↓
Server: Store original in files/
        ↓
UI: Item appears in vStore list
```

### Capability

```json
{
  "UploadToVStore": {
    "group": "vstore",
    "label": "Upload file to vStore",
    "description": "Upload a document to your knowledge base",
    "params": {
      "file_data": "base64 encoded file content",
      "filename": "original filename",
      "scope": "chat or project"
    }
  }
}
```

### Checklist
- [ ] File upload UI in HUD sidebar
- [ ] Base64 encoding in extension
- [ ] Upload message type in WebSocket protocol
- [ ] Server-side file validation
- [ ] Text extraction for each format
- [ ] PDF extraction (add pdfplumber dependency)
- [ ] Chunking and indexing
- [ ] Original file storage
- [ ] Test: Upload .md, .txt, .pdf files

---

## Phase 12: Global Session Context

**Status:** 🔲 Not Started (Lower Priority)

### Goal

Persist action history and chat flow across chat switches within a session.

### Session State

```python
class SessionState:
    session_id: str
    started_at: str
    actions: List[Dict]      # Last 10 global actions
    chat_flow: List[Dict]    # Trail of chats visited
    current_chat_id: str
    previous_chat_id: str
```

### Benefits

- "go back to what we were doing" → knows previous chat
- "what did I just search" → knows last action even if in different chat
- Context carries across chat switches

### Note

This phase is **lower priority** than vStore. The vStore provides more user value and the session context is a nice-to-have for conversational flow.

### Checklist
- [ ] Create `retrieval/session_state.py`
- [ ] `add_action()` - record actions globally (max 10)
- [ ] `switch_chat()` - track chat flow
- [ ] `format_for_prompt()` - format for injection
- [ ] Hook into ws_server.py for action recording
- [ ] Hook into SetCurrentChat for chat switch tracking
- [ ] Test: Actions persist across chat switches

---

## Design Guardrails & Non-Goals

This section defines **hard boundaries** that protect Om-E's architectural integrity. These are not "nice to haves" — they are constraints that prevent the system from drifting into unpredictable, undebuggable territory.

### Immutable Constraints

| Constraint | Rationale | Violation Example |
|------------|-----------|-------------------|
| **No agentic self-modification** | System must not alter its own retrieval logic, thresholds, or index structure without explicit human approval | LLM deciding to re-index based on "poor results" |
| **No silent summarisation** | All summarisation must be explicit, logged, and reversible | LLM silently condensing facts before storage |
| **No automatic memory mutation** | Memory writes require deterministic triggers, not LLM judgment | LLM deciding a fact is "outdated" and deleting it |
| **No hidden model switching** | The embedding model and LLM model must be explicit in config and logged at startup | Fallback to different model on timeout |
| **No retrieval-time LLM calls** | Retrieval path must be pure vector/BM25 operations; no LLM in the loop | LLM reranking retrieved chunks |

### Non-Goals (Explicitly Out of Scope)

These features have been **evaluated and rejected** — not because they're bad, but because they don't fit Om-E's architecture:

| Non-Goal | Why Rejected |
|----------|--------------|
| **Conversational memory editing** | "Forget what I said about X" requires semantic matching + deletion, high risk of over-deletion |
| **Confidence-based branching** | "If unsure, ask for clarification" adds latency and unpredictable UX |
| **Cross-session learning** | Session content is ephemeral by design; persistence goes to vStore only |
| **Automatic fact correction** | User must explicitly update facts; no "I think you meant..." behaviour |
| **Query result caching** | Queries are cheap (<100ms); cache invalidation harder than re-query |

### Behavioural Boundaries

**The LLM may NOT:**
- Decide that retrieval "wasn't helpful" and retry with different parameters
- Infer that a fact is outdated and suggest deletion
- Expand a query into multiple sub-queries without explicit configuration
- Store conversation content as persistent facts without user action

**The system MUST:**
- Log every retrieval with query, results, and scores
- Use the same embedding model for indexing and querying (no mismatched models)
- Fail fast on malformed input rather than "best effort" parsing
- Preserve original chunk text alongside any enriched metadata

### When to Revisit These Guardrails

These constraints are appropriate for a single-user, local-first assistant. Revisit if:

1. **Multi-user deployment** — May need per-user memory isolation
2. **Enterprise integration** — May need audit trails, access control
3. **Retrieval accuracy below 60%** — May need more sophisticated reranking

**Process:** Any guardrail change requires a design document in `docs/decisions/` with:
- What constraint is being relaxed
- Why the current constraint is blocking a valid use case
- Risk mitigation for the relaxed constraint
- Rollback plan

---

## Appendices

### A. Configuration Reference

Add to `llm_config.json`:

```json
{
  "vstore": {
    "enabled": true,
    "content_threshold": 200,

    "embedding": {
      "model": "BAAI/bge-base-en-v1.5",
      "dimensions": 768,
      "version": "1.0",
      "fail_on_mismatch": true
    },

    "chunking": {
      "chunk_size": 512,
      "chunk_overlap": 64,
      "min_chunk_size": 128
    },

    "excerpt_max_chars": 512,
    "max_chunks_per_item": 20,
    "default_search_limit": 5,
    "supported_formats": [".md", ".txt", ".pdf", ".json"],
    "quotas": {
      "max_items_per_chat": 100,
      "max_items_per_project": 500,
      "max_total_size_mb": 50,
      "max_file_size_mb": 1
    }
  }
}
```

### B. Natural Language Mappings

| User Says | Capability |
|-----------|------------|
| "save this to my knowledge" | AddToChatVStore |
| "add to project" | AddToProjectVStore |
| "what do I have about sharks" | SearchVStore |
| "remove the guitar article" | RemoveFromVStore |
| "show my saved content" | ListVStore |
| "promote this to project" | PromoteToProject |

### C. Test Cases

| Query | Expected |
|-------|----------|
| "What do I have saved about X?" | List matching vStore items |
| Large paste + toggle save | Content stored in vStore |
| "Remove the shark article" | Item deleted from vStore |
| Upload .pdf | Content extracted and indexed |
| Query after save | vStore content in RAG results |

### D. Migration from Large Payloads

Existing `data/large_payloads/` can optionally be imported to vStore:

```python
# Future: Optional import script
def import_large_payloads_to_vstore(project_id: str):
    """Import existing large payloads to project vStore."""
    for file in glob.glob("data/large_payloads/*.txt"):
        content = Path(file).read_text()
        # Auto-label from content
        # Add to project vStore
```

### E. Operational Guidance

**Scaling Limits (Current Implementation):**

| Component | Limit | Notes |
|-----------|-------|-------|
| Session content store | In-memory only | Clears on server restart — by design |
| Capabilities index | ~100 capabilities | FAISS handles fine at this scale |
| Facts store | 500 entries (quota) | Warning at quota, consider cleanup capability |
| Large payloads | File-based, unbounded | No size tracking currently |
| BM25 index | ~10k docs | Rebuild time acceptable |

**Debug Observability:**

Add RAG hit logging for retrieval tuning:

```python
# In vector_store.py search()
def search(self, query: str, k: int = 5, ...) -> List[SearchResult]:
    results = ...

    # Debug logging for tuning
    print(f"[RAG] Query: '{query[:50]}...' → {len(results)} results")
    for r in results[:3]:
        print(f"  - score={r.score:.3f} source={r.source}")

    return results
```

**Known Trade-offs:**

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| Session memory in-memory | Lost on restart | Freshness > persistence for session |
| Hybrid search default on | +50ms latency | Keyword accuracy worth it |
| 512 char chunks | Larger = more context, less precision | Balance for LLM context |
| 64 char overlap | More overlap = more embeddings | Minimal overhead for boundary preservation |
| 0.55 cap threshold | May miss low-confidence matches | Prefer precision over recall for actions |

**When NOT to Use RAG in This System:**

| Scenario | Why RAG is Wrong | Alternative |
|----------|------------------|-------------|
| **Creative generation** | User wants original content | LLM generation without RAG injection |
| **Real-time/volatile data** | vStore content may be stale | Direct page scan via intelligence_update |
| **Behavioural instructions** | "Always do X" rules shouldn't be stored | System prompt or capabilities |
| **Sensitive data lookup** | Credentials, keys, passwords | Never store in vStore |
| **Action parameters** | Dynamic values for execution | LLM extraction from conversation |
| **Current page queries** | "What's on this page?" | Live DOM scan, not stored content |

**Maintenance Tasks:**

```bash
# Check facts quota
python -c "from retrieval.memory_cycle import check_facts_quota; check_facts_quota()"

# Clear session content (restart server)
pkill -f ws_server.py && python om_e_web_ws/ws_server.py

# Reindex capabilities (delete and restart)
rm -rf data/vectors/system/capabilities && python om_e_web_ws/ws_server.py

# Validate embedding compatibility
python -c "from retrieval.vector_store import VectorStore; VectorStore('test').load()"
```

### F. Reindex Conditions

**CRITICAL:** Document for future maintainers — when must indices be rebuilt?

Failure to reindex when required causes **silent vector corruption** — results look valid but are semantically wrong.

#### Hard Reindex Triggers (MUST rebuild)

| Change | Reindex Required | Reason | Detection |
|--------|------------------|--------|-----------|
| Embedding model change | ✅ **MUST** | Different embedding space | Dimension mismatch error |
| Embedding model version bump | ✅ **MUST** | Different learned weights | May not detect — validate manually |
| Chunk size change (512 → 256) | ✅ **MUST** | Different text boundaries | Existing chunks wrong size |
| Chunk overlap change (64 → 128) | ✅ **MUST** | Different overlap regions | Boundary content duplicated/missing |
| Metadata schema change | ✅ **MUST** | Old metadata incompatible | KeyError on retrieval |
| Tokenizer change (for BM25) | ✅ **MUST** | Different term extraction | BM25 scores invalid |

#### Soft Reindex Triggers (SHOULD rebuild for consistency)

| Change | Reindex Recommended | Reason |
|--------|---------------------|--------|
| Chunk position metadata added | ⚠️ Recommended | Existing chunks lack `char_start`/`char_end` |
| New metadata fields added | ⚠️ Recommended | Old entries missing field |
| Source attribution added | ⚠️ Recommended | Old entries lack `source` field |

#### No Reindex Required (Runtime changes)

| Change | Reindex Required | Reason |
|--------|------------------|--------|
| Threshold change (0.55 → 0.5) | ❌ No | Runtime parameter |
| Adding BM25 layer | ❌ No | Additive; doesn't change vectors |
| Changing RRF k value | ❌ No | Ranking parameter only |
| Adding new capabilities | ❌ No | Incremental add supported |
| Changing search K value | ❌ No | Query-time parameter |
| Adding quota limits | ❌ No | Doesn't affect existing data |

#### Version Compatibility Matrix

| Index Version | Code Version | Compatible | Action |
|---------------|--------------|------------|--------|
| 1.0 | 1.0 | ✅ Yes | Normal operation |
| 1.0 | 1.1 | ⚠️ Check | Validate metadata schema |
| 1.0 | 2.0 | ❌ No | Full reindex required |
| None (legacy) | 1.0+ | ⚠️ Warning | Works but log warning |

**Embed this in index metadata:**
```json
{
  "embedding_model": "BAAI/bge-base-en-v1.5",
  "embedding_dimensions": 768,
  "schema_version": "1.0",
  "chunk_size": 512,
  "chunk_overlap": 64,
  "created_at": "2025-12-26T00:00:00Z"
}
```

**Safe reindex procedure:**

```bash
# 1. Backup current indices
cp -r data/vectors data/vectors.bak

# 2. Delete indices (NOT the source data)
rm -rf data/vectors/system/capabilities/index.faiss
rm -rf data/vectors/system/capabilities/metadata.json

# 3. Restart server (rebuilds from capabilities JSON)
python om_e_web_ws/ws_server.py

# 4. Verify
# Check logs for "[VectorStore] Index validated: BAAI/bge-base-en-v1.5 v1.0 (768d)"
```

---

## Next Steps

1. ~~**Complete Phase 6**~~ ✅ Done - Action filtering + rolling summaries working
2. **Start Phase 6.5** - Session History & URL Tracking (HUD integration)
3. **Then Phase 6.6** - RAG Infrastructure Hardening (hybrid search, chunk overlap, versioning)
4. **Then Phase 7** - vStore Foundation (biggest value add, builds on 6.6)
5. **Then Phase 8** - vStore UI (makes it usable)
6. **Then Phase 9** - vStore RAG Integration (includes RAG gating)

### Recommended Implementation Order for Phase 6.6

Phase 6.6 has 7 components. BM25 is the highest-impact improvement and should start early.

| Order | Component | Dependencies | Effort | Impact |
|-------|-----------|--------------|--------|--------|
| 1 | **Hybrid Search / BM25 (6.6.4)** | None | Medium | **HIGH** |
| 2 | Chunk Overlap (6.6.1) | None | Low | Medium |
| 3 | Chunk Position Metadata (6.6.2) | 6.6.1 | Low | Medium |
| 4 | Embedding Version Pinning (6.6.3) | None | Medium | Medium |
| 5 | Atomic Index Save (6.6.5) | None | Medium | Medium |
| 6 | Threshold Documentation (6.6.6) | None | Low | Low |
| 7 | Facts Quota (6.6.7) | None | Low | Low |

**Rationale for BM25 first:**
- Highest retrieval quality impact — fixes the most common failure mode (exact-match misses)
- No dependencies on other 6.6 components
- Can be tested immediately with existing stores
- `rank-bm25` is lightweight (pure Python, no C dependencies)

**Parallel track:** While implementing BM25, 6.6.1-6.6.3 (chunking improvements) can proceed in parallel as they touch different code paths.

**Blocking for Phase 7:** Complete 6.6.1-6.6.5 before Phase 7 (vStore) starts. vStore depends on chunk overlap and position metadata for "tell me more" functionality.

---

## Phase 6 Implementation Summary (2025-12-24)

**Key Changes:**

| File | Changes |
|------|---------|
| `ws_server.py` | Added `action_executed` param to `append_assistant_message()`, calls `check_and_create_rolling_summary()` |
| `retrieval/memory_cycle.py` | Flag-based filtering in `on_message_saved()`, `check_and_create_rolling_summary()`, config helpers |
| `data/llm_config.json` | Added `summary_interaction_threshold`, `max_rolling_summaries`, `rolling_summary_token_budget` |

**Test Results:**
- 36 messages sent (18 turns) with mix of chat and action commands
- Actions (scroll, navigate, tabs) properly filtered from RAG session vector
- 3 rolling summaries created covering interactions 18-24, 24-30, 30-36
- Summaries appear in prompt as `[Chat summary: [...]]`
- Content turns (ML discussions) properly indexed to session vector
