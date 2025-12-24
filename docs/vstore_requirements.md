# vStore Requirements Specification

**Feature:** Local RAG Management System
**Version:** 0.4
**Date:** 2025-12-24

---

## 1. Overview

### 1.1 Problem Statement

Currently, content flows through Om-E in two ways:
1. **Automatic session indexing** - all conversation content indexed ephemerally (clears on restart)
2. **Large payload storage** - content >500 chars stored automatically

Neither gives the user control over what becomes part of their persistent knowledge base. Users cannot:
- Explicitly save content for future reference
- Organize knowledge by chat or project
- Build a curated RAG corpus over time
- Upload files to augment their knowledge base

### 1.2 Proposed Solution

Introduce **vStore** - a user-curated vector storage system with two tiers:
- **Chat vStore** - content scoped to a single chat
- **Project vStore** - content shared across all chats in a project

Users explicitly choose what to save, can manage their stored content, and promote valuable chat-level content to project-wide availability.

### 1.3 Key Distinction: vStore vs Memory

| Concept | vStore | Memory |
|---------|--------|--------|
| **Purpose** | Curated reference content | Behavioural/conversational context |
| **Storage** | Exact, verbatim, never summarised | Lossy, summarised, compressed |
| **Persistence** | Permanent until deleted | Session or rolling window |
| **Control** | User-curated (opt-in) | Automatic |

**Rule:** vStore content is never summarised for storage, only chunked for embedding.

### 1.4 Analogy

| Automatic | User-Curated |
|-----------|--------------|
| Browser history | Bookmarks |
| Session memory | vStore |

---

## 2. User Stories

### 2.1 Content Capture

> **As a user**, when I paste or type large content into the prompt, I want to optionally save it to my vStore so I can reference it in future conversations.

**Acceptance Criteria:**
- [ ] Visual toggle appears when content exceeds threshold (e.g., 200+ chars)
- [ ] Two options: "Add to Chat vStore" / "Add to Project vStore"
- [ ] Default is unchecked (opt-in, not automatic)
- [ ] Selecting either stores content with metadata (timestamp, label, source chat)

### 2.2 Content Management

> **As a user**, I want to view, organize, and delete content in my vStore so I can maintain a clean knowledge base.

**Acceptance Criteria:**
- [ ] HUD sidebar shows vStore section under each chat
- [ ] Can view list of stored items (title/label, date, size)
- [ ] Can delete individual items
- [ ] Can rename/relabel items
- [ ] Can preview content without leaving chat

### 2.3 Content Promotion

> **As a user**, I want to promote valuable chat-level content to project level so it's available across all my chats.

**Acceptance Criteria:**
- [ ] "Promote to Project" action on chat vStore items
- [ ] Promoted content appears in Project vStore
- [ ] Option to keep or remove from chat vStore after promotion
- [ ] Duplicate detection (don't re-add if already in project)

### 2.4 File Upload

> **As a user**, I want to upload files (markdown, text, PDF) to my vStore so I can include external documents in my knowledge base.

**Acceptance Criteria:**
- [ ] Upload button in vStore UI
- [ ] Supported formats: .md, .txt, .pdf, .json
- [ ] Files chunked and indexed into vector store
- [ ] Original file preserved for download/viewing
- [ ] Size limit per file (configurable, default 1MB)

### 2.5 RAG Query Integration

> **As a user**, when I ask questions, I want Om-E to search my vStore and use relevant content to inform responses.

**Acceptance Criteria:**
- [ ] RAG queries search: (1) chat vStore, (2) project vStore, (3) session memory
- [ ] Results ranked by relevance across all sources
- [ ] Source attribution in response (e.g., "Based on your saved article...")
- [ ] User can ask "what do I have saved about X"

### 2.6 Conversational vStore Management

> **As a user**, I want to manage my vStore through natural language commands.

**Acceptance Criteria:**
- [ ] "Save this to my knowledge base" → AddToChatVStore
- [ ] "Add this to the project" → AddToProjectVStore
- [ ] "What do I have saved about sharks" → ListVStore + search
- [ ] "Remove the shark article from my vStore" → RemoveFromVStore
- [ ] "Show my project knowledge base" → ListProjectVStore

---

## 3. Data Architecture

### 3.1 Directory Structure

```
data/projects/{project_id}/
├── project.json                    # Project metadata
│
├── vectors/
│   └── content/                    # PROJECT vStore
│       ├── index.faiss             # Vector index
│       ├── metadata.json           # Item metadata
│       └── files/                  # Original uploaded files
│           ├── {hash}_shark-article.md
│           └── {hash}_specs.txt
│
└── chats/
    └── {chat_id}/
        ├── chat.json               # Chat history + state
        └── vectors/
            └── content/            # CHAT vStore
                ├── index.faiss
                ├── metadata.json
                └── files/
                    └── {hash}_notes.md
```

### 3.2 Metadata Schema

```json
// vectors/content/metadata.json
{
  "items": [
    {
      "id": "vs_abc123",
      "label": "Shark Article",
      "source": "pasted",           // "pasted" | "uploaded" | "promoted"
      "source_chat_id": "chat_xyz", // null for direct project uploads
      "content_hash": "sha256...",
      "chunk_ids": [0, 1, 2, 3],    // indices in FAISS
      "char_count": 2450,
      "file_path": "files/abc123_shark-article.md",  // null if no file
      "created_at": "2025-12-24T10:00:00Z",
      "tags": ["research", "animals"]
    }
  ]
}
```

### 3.3 Vector Entry Schema

```json
// Each chunk in FAISS has metadata:
{
  "item_id": "vs_abc123",
  "chunk_index": 0,
  "text": "Sharks are a group of elasmobranch fish...",
  "char_start": 0,
  "char_end": 512
}
```

**Required chunk metadata (enforced on ingest):**

| Field | Type | Purpose |
|-------|------|---------|
| `item_id` | string | Parent item reference |
| `chunk_index` | int | Position in item (0-indexed) |
| `char_start` | int | Offset in original content |
| `char_end` | int | End offset in original content |

**Rule:** Chunks without complete position metadata are rejected on ingest. This enables accurate excerpt extraction and "tell me more" functionality.

### 3.4 Ingestion Contract

**Non-negotiable rules for vStore content:**

| Rule | Description |
|------|-------------|
| **Original intact** | Always store original content verbatim |
| **Chunk for embedding only** | Chunking is for vector search, not storage |
| **Hash for dedupe** | Content hash used for duplicate detection |
| **Hash is immutable** | Labels are user-editable, hashes are not |
| **No summarisation** | Unlike memory, vStore content is never compressed |

This prevents confusion when:
- Content is edited (label changes, hash stays)
- Items are promoted (same hash in both stores = duplicate)
- Duplicates appear "different" (hash comparison is authoritative)

### 3.5 Chunking Rules

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

**Rule:** If a sentence exceeds `chunk_size`, split at clause boundary (`, ` or `; `) rather than mid-word.

### 3.6 Metadata Requirements

**Required metadata fields (minimum for every vStore item):**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `label` | string | User-assigned or auto-generated name |
| `tags` | string[] | User-assigned categorisation |
| `scope` | enum | `chat` or `project` |
| `source` | enum | `pasted`, `uploaded`, `promoted` |
| `created_at` | ISO timestamp | When content was saved |

**Optional metadata (not required):**

| Field | Type | Description |
|-------|------|-------------|
| `source_chat_id` | string | Origin chat for promoted items |
| `file_path` | string | Path to original file if uploaded |
| `auxiliary_text` | string | Retrieval hints (see §6.8) |

Metadata is used for **filtering before similarity search**, not just display.

### 3.7 Auxiliary Retrieval Text (Optional)

For **Project vStore only**, uploaded or static documents may include auxiliary retrieval text:

| Rule | Description |
|------|-------------|
| **Scope** | Project vStore only, not Chat vStore |
| **Content type** | Uploaded files and static documents only |
| **Visibility** | Never shown to user |
| **Prompt inclusion** | Never included verbatim in prompts |
| **Purpose** | Improves retrieval quality (inferred questions, alternate phrasings) |

**Example:**
```json
{
  "id": "vs_guitar_specs",
  "label": "Guitar Specifications",
  "auxiliary_text": "What are the specs? Compare guitars. Ibanez vs Gibson."
}
```

---

## 4. UI Components

### 4.1 Prompt Area Toggle

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

**Trigger:** Content length > 200 chars (configurable)

### 4.2 Sidebar vStore Section

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
│                                     │
│    ▶ shark facts                    │
│    ▶ other chat...                  │
└─────────────────────────────────────┘

Legend:
[↗] = Open/preview
[🗑] = Delete
[↑] = Promote to Project
[+] = Add/upload
```

### 4.3 vStore Detail View

When clicking on a vStore item:

```
┌─────────────────────────────────────────────────────────────┐
│  📄 Shark Biology                                    [✕]    │
├─────────────────────────────────────────────────────────────┤
│  Source: Pasted in "shark facts" chat                       │
│  Added: Dec 24, 2025 10:30am                                │
│  Size: 2.4kb (5 chunks)                                     │
│  Tags: [research] [animals] [+ add tag]                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Sharks are a group of elasmobranch fish characterized     │
│  by a cartilaginous skeleton, five to seven gill slits...  │
│                                                              │
│  [Show full content ▼]                                      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  [↑ Promote to Project]  [✎ Edit Label]  [🗑 Delete]        │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Capabilities (Server-Side)

### 5.1 Capability Definitions

| Capability | Description | Params |
|------------|-------------|--------|
| `AddToChatVStore` | Save content to current chat's vStore | `content`, `label?`, `tags?` |
| `AddToProjectVStore` | Save content to project vStore | `content`, `label?`, `tags?` |
| `PromoteToProject` | Move chat item to project | `item_id`, `keep_in_chat?` |
| `RemoveFromVStore` | Delete item | `item_id`, `scope` (chat/project) |
| `ListVStore` | List items | `scope`, `search?` |
| `SearchVStore` | Semantic search | `query`, `scope`, `limit` |
| `UploadToVStore` | Upload file | `file_path`, `scope`, `label?` |

### 5.2 Natural Language Mappings

```
"save this to my knowledge" → AddToChatVStore
"add to project" → AddToProjectVStore
"what do I have about sharks" → SearchVStore
"remove the guitar article" → RemoveFromVStore
"show my saved content" → ListVStore
"promote this to project" → PromoteToProject
```

---

## 6. Query Flow

### 6.1 RAG Query Priority

When user asks a question:

```
1. Search Chat vStore (current chat)
   └── Most specific, user-curated for this conversation

2. Search Project vStore
   └── Cross-chat curated knowledge

3. Search Session Memory (ephemeral)
   └── Recent conversation context

4. Search Capabilities
   └── What actions can be taken
```

**Do not change this order.** It matches how humans expect answers to feel.

### 6.2 Retrieval Contract

**Non-negotiable rules for vStore retrieval:**

| Rule | Description |
|------|-------------|
| **Excerpts, not documents** | Retrieval returns excerpts, never full documents |
| **Full content on request** | Full content shown only on explicit user request ("show", "open", "tell me more") |
| **Excerpt size cap** | Max excerpt size configurable (default 512 chars) to prevent prompt flooding |
| **Explainability** | User can always ask "what did you use to answer that" |

This preserves token discipline and keeps responses traceable.

### 6.3 Retrieval Pipeline (Detailed)

```
User message arrives
       ↓
┌──────────────────────────────────────────┐
│ 1. METADATA FILTERING                    │
│    - Filter by scope (chat/project)      │
│    - Filter by tags if specified         │
│    - Irrelevant content excluded early   │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ 2. SIMILARITY SEARCH                     │
│    - Vector search on filtered set       │
│    - Returns candidate matches           │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ 3. RERANKING                             │
│    - Score: relevance + source priority  │
│    - Boost: metadata match, recency      │
│    - Does NOT alter behaviour, only order│
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ 4. TOP-N SELECTION                       │
│    - Cap results (default 5)             │
│    - Deduplicate by content hash         │
│    - Extract excerpts (not full docs)    │
└──────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────┐
│ 5. SESSION MEMORY + CAPABILITIES         │
│    - Existing pipeline continues         │
└──────────────────────────────────────────┘
       ↓
Build prompt with merged results
       ↓
LLM response
```

**Note:** Vector search is the default retrieval method, but the architecture may later support keyword, structured, or hybrid retrieval without changing this pipeline structure.

### 6.4 Reranking Stage

Reranking occurs **after retrieval, before prompt construction**.

| Factor | Weight | Description |
|--------|--------|-------------|
| Relevance score | High | Similarity match from vector search |
| Source priority | Medium | Chat vStore > Project vStore > Session |
| Metadata match | Low | Tags, labels matching query terms |
| Recency | Low | More recent items slightly preferred |

**Constraint:** Reranking affects ordering and selection only. It never alters system behaviour or triggers actions.

### 6.5 Multi-Hit Handling

When multiple items match a query:

| Matches | Behaviour |
|---------|-----------|
| **0** | No relevant context found (see §6.9) |
| **1-2** | Summarise inline with source attribution |
| **3+** | List items, ask user which to use |

**Rule:** The system must not silently blend unrelated sources. When sources are distinct, user picks.

**Example (3+ matches):**
```
User: "What do I know about guitars?"

Om-E: "I found 4 items about guitars:
       1. Ibanez vs Gibson (chat vStore)
       2. Guitar Specs (project vStore)
       3. Price Comparison (project vStore)
       4. Jazz Guitar Notes (chat vStore)

       Which would you like me to use?"
```

### 6.6 Result Merging

- Deduplicate by content hash
- Rank by reranking factors (§6.4)
- Cap at N results (configurable, default 5)
- Include source attribution in metadata

### 6.7 Source Attribution Standard

**Every RAG hit must carry:**

| Field | Description |
|-------|-------------|
| `source` | `chat_vstore` / `project_vstore` / `session_memory` |
| `label` | User-assigned label or auto-generated |
| `date_added` | When content was saved |
| `item_id` | For vStore items, enables "tell me more about this" |

This keeps Om-E explainable and debuggable.

### 6.8 "What Do I Have Saved?" - First-Class Query

This is a **supported query type**, not a side effect of search.

```
User: "What do I have saved about sharks?"
       ↓
Detected as: ListVStore + SearchVStore query
       ↓
Returns: Structured list of matching items with metadata
       ↓
Om-E: "You have 2 items about sharks:
       1. Shark Biology (2.4kb) - saved Dec 24 in project vStore
       2. Ocean Facts (1.1kb) - saved Dec 20 in 'research' chat

       Want me to summarise either one?"
```

This makes vStore feel like a **tool**, not a backend trick.

### 6.9 No Relevant Context Failsafe

When vStore search returns no relevant matches:

| Rule | Description |
|------|-------------|
| **Acknowledge clearly** | Om-E must say "I don't have any saved content about X" |
| **Offer next steps** | Suggest: save content, upload a file, or search elsewhere |
| **No hallucination** | Never fabricate answers when vStore has no matches |

**Example:**
```
User: "What do I know about quantum physics?"

Om-E: "I don't have any saved content about quantum physics in your vStore.

       Would you like to:
       - Save some content about this topic?
       - Search the web for information?
       - Ask me what I know from general knowledge?"
```

### 6.10 Behaviour Rule: vStore Never Triggers Actions

**Non-negotiable:**

> vStore can **inform** responses, but never **auto-trigger** actions.

All actions must still come from:
- Explicit user request
- LLM decision based on user intent
- Existing capability/action pipeline

**Why this matters:**
- Trust: User knows vStore won't do things on its own
- Predictability: Same content, same behaviour
- Debuggability: Actions trace back to user intent, not hidden content

**Example:**
```
vStore contains: "Always search YouTube when I mention music"

User: "I like jazz"

WRONG: Om-E auto-searches YouTube because vStore said to
RIGHT: Om-E responds about jazz, user can ask to search if they want
```

### 6.11 When RAG Should NOT Be Used

RAG is appropriate for **reference retrieval**, not for:

| Scenario | Why RAG is Wrong | Alternative |
|----------|------------------|-------------|
| **Creative generation** | User wants original content, not recalled facts | Use LLM generation without RAG injection |
| **Real-time/volatile data** | vStore content may be stale | Direct API call or page scan |
| **Behavioural instructions** | "Always do X" rules should not be stored/retrieved | Use system prompt or capabilities |
| **Sensitive data lookup** | Credentials, keys, passwords | Never store in vStore |
| **Action parameters** | Dynamic values for capability execution | Use LLM extraction from conversation |

**Detection patterns (skip RAG for these):**
- User asks for "something new" or "original"
- Query is about current page state (use live scan)
- Query matches a capability exactly (skip to action)
- Message is a command, not a question

**Rule:** When in doubt, prefer no RAG injection over irrelevant injection. Silent is better than wrong.

---

## 7. RAG Strategy Configuration

This section defines the tiered approach to RAG strategies: baseline (always enabled) vs advanced (opt-in, configuration-driven).

### 7.1 Strategy Tiering

| Tier | Activation | Description |
|------|------------|-------------|
| **Baseline** | Always enabled | Core retrieval that runs on every query |
| **Advanced** | Explicit opt-in | Enhanced strategies requiring configuration |

**Rule:** No advanced strategy may activate implicitly. All must be explicitly enabled in configuration.

### 7.2 Baseline Strategies (Always Enabled)

These run on every vStore query without configuration:

| Strategy | Description |
|----------|-------------|
| **Metadata filtering** | Filter by scope, tags before similarity search |
| **Vector similarity search** | Standard embedding-based retrieval |
| **Score-based reranking** | Order by relevance + source priority |
| **Excerpt extraction** | Return bounded excerpts, not full documents |
| **Source attribution** | Tag every result with origin metadata |

### 7.3 Advanced Strategies (Opt-In Only)

These require explicit configuration and are **disabled by default**:

| Strategy | Config Key | Description | Constraints |
|----------|------------|-------------|-------------|
| **Hybrid retrieval** | `hybrid_search` | Combine vector + keyword search | Keyword results merged, not prioritised |
| **Query expansion** | `query_expansion` | Generate alternate query phrasings | LLM-generated, never stored |
| **Retrieval retry** | `retry_on_low_score` | Retry with relaxed threshold if no results | Max 1 retry, see §7.6 |
| **Cross-scope fallback** | `cross_scope_fallback` | Search project if chat returns nothing | Only when chat vStore empty |

**Configuration example:**
```json
{
  "vstore": {
    "advanced_strategies": {
      "hybrid_search": false,
      "query_expansion": false,
      "retry_on_low_score": false,
      "cross_scope_fallback": true
    }
  }
}
```

### 7.4 Agentic RAG Constraints

If agentic retrieval patterns are introduced (future), they must obey:

| Constraint | Description |
|------------|-------------|
| **Retrieval method selection only** | Agent may choose between vector, keyword, hybrid |
| **No authority override** | Agent cannot bypass scope boundaries |
| **No order override** | Agent cannot change Chat → Project → Session priority |
| **Rule-bound behaviour** | Agent follows explicit rules, not emergent patterns |
| **Predictable output** | Same query + same content = same retrieval result |

**Non-negotiable:** Agentic RAG must remain a retrieval optimisation, not an autonomous decision-maker.

### 7.5 Contextual Retrieval Constraints

For contextual enrichment (auxiliary text, query context):

| Rule | Description |
|------|-------------|
| **Auxiliary to embeddings only** | Enriched text improves vector matching |
| **Original content unchanged** | Stored content is never modified |
| **Never surfaced** | Auxiliary text is internal, never shown to user |
| **Never stored as truth** | Auxiliary text is ephemeral, not authoritative |
| **Project vStore only** | Contextual enrichment limited to uploaded documents |

### 7.6 Retry / Self-Reflective Retrieval Constraints

If retrieval retry loops are enabled:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_retries` | 1 | Maximum retry attempts |
| `retry_threshold` | 0.3 | Retry if best score below this |
| `relaxed_threshold` | 0.2 | Threshold for retry attempt |
| `timeout_ms` | 500 | Max additional latency per retry |

**Hard stop conditions:**
- Max retries reached
- Timeout exceeded
- Any result above relaxed threshold found
- User explicitly requests "search anyway"

**Rule:** Latency and cost predictability take priority over exhaustive search.

### 7.7 Multi-Source Blending Rules

When combining results from multiple sources:

| Rule | Description |
|------|-------------|
| **Intentional combination** | Sources combined only when semantically related |
| **Bounded results** | Total results capped regardless of source count |
| **No silent blending** | Distinct sources must be attributed, not merged |
| **User disambiguation** | When sources conflict, ask user which to use |
| **Scope respects hierarchy** | Chat results always precede project results |

### 7.8 Storage-Agnostic Design

The retrieval architecture supports multiple backend strategies without contract changes:

| Method | Status | Notes |
|--------|--------|-------|
| **Vector (FAISS)** | Default | Semantic similarity search |
| **Keyword (BM25)** | Future | Full-text search, opt-in |
| **Structured (SQL)** | Future | Metadata-only queries |
| **Hybrid** | Future | Combined vector + keyword |

**Contract:** The retrieval pipeline (§6.3) remains unchanged regardless of backend method. All methods must:
- Accept metadata filters
- Return scored results
- Support deduplication by hash
- Provide source attribution

---

## 8. Configuration

### 8.1 Embedding Configuration (Pinned)

```json
{
  "vstore": {
    "embedding": {
      "model": "BAAI/bge-base-en-v1.5",
      "dimensions": 768,
      "version": "1.0",
      "fail_on_mismatch": true
    }
  }
}
```

| Field | Purpose |
|-------|---------|
| `model` | Exact HuggingFace model ID (no aliases) |
| `dimensions` | Expected vector size (768 for bge-base-en-v1.5) |
| `version` | Bumped when model changes; triggers reindex prompt |
| `fail_on_mismatch` | If true, refuse to query mismatched index |

**Index header (stored in `metadata.json`):**
```json
{
  "embedding_model": "BAAI/bge-base-en-v1.5",
  "embedding_dimensions": 768,
  "created_with_version": "1.0"
}
```

**Rule:** On index load, if stored `embedding_dimensions` ≠ config dimensions, fail immediately with error: `"Index/embedding mismatch (expected 768, found X). Reindex required."`

### 8.2 vStore Settings

```json
// llm_config.json additions
{
  "vstore": {
    "enabled": true,
    "content_threshold": 200,        // Chars to trigger "save" option
    "chunk_size": 512,               // Chars per vector chunk
    "chunk_overlap": 64,             // Overlap between chunks
    "min_chunk_size": 128,           // Reject fragments below this
    "excerpt_max_chars": 512,        // Max excerpt size in prompt (token discipline)
    "max_chunks_per_item": 20,       // Limit chunking
    "default_search_limit": 5,       // RAG results per source
    "supported_formats": [".md", ".txt", ".pdf", ".json"],

    "quotas": {
      "max_items_per_chat": 100,     // 0 = unlimited
      "max_items_per_project": 500,  // 0 = unlimited
      "max_total_size_mb": 50,       // Per project
      "max_file_size_mb": 1          // Per upload
    },

    "advanced_strategies": {
      "hybrid_search": false,        // Combine vector + keyword (default: off)
      "query_expansion": false,      // LLM-generated query variants (default: off)
      "retry_on_low_score": false,   // Retry with relaxed threshold (default: off)
      "cross_scope_fallback": true   // Search project if chat empty (default: on)
    },

    "retry": {
      "max_retries": 1,              // Only applies if retry_on_low_score enabled
      "retry_threshold": 0.3,        // Retry if best score below this
      "relaxed_threshold": 0.2,      // Threshold for retry attempt
      "timeout_ms": 500              // Max additional latency per retry
    }
  }
}
```

---

## 9. vStore Administration

The user needs full control over vStore content within the existing HUD framework. This section covers the management UI and operations.

### 9.1 Admin Context

Om-E does two things:
1. **Harvesting** - collecting and curating content for knowledge
2. **Navigating** - browsing and acting on the web

vStore admin supports the harvesting workflow with local-first RAG management.

### 9.2 Management Operations

| Operation | Chat vStore | Project vStore | How Triggered |
|-----------|-------------|----------------|---------------|
| **Add content** | ✓ | ✓ | Prompt toggle, natural language, HUD button |
| **Upload file** | ✓ | ✓ | HUD upload button, drag-drop |
| **View item** | ✓ | ✓ | Click in sidebar, "show me X" |
| **Edit label/tags** | ✓ | ✓ | HUD detail view, natural language |
| **Delete item** | ✓ | ✓ | HUD button, "remove X" |
| **Promote to project** | ✓ | — | HUD button, "promote X" |
| **Search vStore** | ✓ | ✓ | HUD search, "what do I have about X" |
| **List all items** | ✓ | ✓ | HUD browse, "show my saved content" |
| **Bulk delete** | ✓ | ✓ | HUD multi-select |
| **Export** | ✓ | ✓ | HUD menu (future) |

### 9.3 HUD Integration Points

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OM-E HUD                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │ SIDEBAR              │  │ MAIN VIEW                                │ │
│  │                      │  │                                          │ │
│  │ 📁 Project: My Proj  │  │  [When vStore item selected:]            │ │
│  │                      │  │                                          │ │
│  │ ▼ 📦 Project vStore  │  │  ┌────────────────────────────────────┐  │ │
│  │   ├── 🔍 [Search...] │  │  │ 📄 Shark Biology                   │  │ │
│  │   ├── 📄 Item 1      │  │  │                                    │  │ │
│  │   ├── 📄 Item 2      │  │  │ Label: [Shark Biology        ] [✓] │  │ │
│  │   └── [+ Upload]     │  │  │ Tags:  [research] [animals] [+]    │  │ │
│  │                      │  │  │ Scope: Project vStore              │  │ │
│  │ ▼ 💬 Chats           │  │  │ Added: Dec 24, 2025                │  │ │
│  │   ▼ current chat     │  │  │ Size:  2.4kb (5 chunks)            │  │ │
│  │     ▼ 📦 vStore (2)  │  │  │                                    │  │ │
│  │       ├── 📄 Notes   │  │  │ ─────────────────────────────────  │  │ │
│  │       └── [+ Add]    │  │  │                                    │  │ │
│  │                      │  │  │ Sharks are a group of elasmobranch │  │ │
│  │                      │  │  │ fish characterized by...           │  │ │
│  │                      │  │  │                                    │  │ │
│  │                      │  │  │ [Show full ▼]                      │  │ │
│  │                      │  │  │                                    │  │ │
│  │                      │  │  │ ─────────────────────────────────  │  │ │
│  │                      │  │  │                                    │  │ │
│  │                      │  │  │ [🗑 Delete] [↑ Promote] [📋 Copy]  │  │ │
│  │                      │  │  └────────────────────────────────────┘  │ │
│  │                      │  │                                          │ │
│  └──────────────────────┘  └──────────────────────────────────────────┘ │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │ PROMPT AREA                                                          ││
│  │ [Ask me anything...]                                                 ││
│  │                                                                      ││
│  │ [When large content detected:]                                       ││
│  │ ☐ Save to Chat vStore  ☐ Save to Project vStore  Label: [...]       ││
│  └──────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.4 Search Interface

**Sidebar search box** filters vStore items in real-time:

| Search Type | Example | Behaviour |
|-------------|---------|-----------|
| **Label match** | "shark" | Items with "shark" in label |
| **Tag filter** | "#research" | Items tagged "research" |
| **Semantic search** | "ocean animals" | Vector similarity search |
| **Scope filter** | "in:project" | Only project vStore |

**Natural language search** via chat:
```
User: "What do I have saved about guitars?"
Om-E: [Lists matching items with option to view/use]
```

### 9.5 Bulk Operations

For managing multiple items:

| Operation | Trigger | Confirmation |
|-----------|---------|--------------|
| **Multi-select delete** | Checkbox + delete button | "Delete 5 items?" |
| **Bulk promote** | Checkbox + promote button | "Promote 3 items to project?" |
| **Bulk tag** | Checkbox + add tag | "Add tag 'archive' to 4 items?" |

### 9.6 Conversational Admin

All admin operations available via natural language:

```
"Delete the shark article"           → RemoveFromVStore
"Add the 'research' tag to this"     → UpdateVStoreItem
"Show me everything tagged finance"  → ListVStore + filter
"Move my notes to the project"       → PromoteToProject
"What did I save yesterday?"         → ListVStore + date filter
"Clear all items from this chat"     → BulkDelete (with confirmation)
```

### 9.7 Integration with Web Harvesting

When harvesting content from the web:

```
User browses article on web
       ↓
User: "Save this article to my knowledge"
       ↓
Om-E extracts main content from page
       ↓
Shows preview: "Save this 2.4kb article as 'Article Title'?"
       ↓
User confirms → Saved to vStore
       ↓
Available for RAG queries immediately
```

**Capabilities for harvesting:**
- `SavePageContent` - extract and save current page content
- `SaveSelection` - save highlighted text only
- `SaveWithLabel` - save with custom label

---

## 10. Migration Path

### 10.1 From Current State

1. **Create project structure** - `data/projects/default/`
2. **Move chats** - `data/chats/` → `data/projects/default/chats/`
3. **Create vStore directories** - empty initially
4. **Existing large_payloads** - offer to import into vStore (optional)

### 10.2 Backward Compatibility

- Session memory continues working as-is
- Existing chats work without vStore
- vStore is additive, not replacing existing functionality

---

## 11. Future Roadmap

Features explicitly **not** in v1 scope. Documented for future reference.

### 11.1 Deferred to v2+

| Feature | Description | Why Deferred |
|---------|-------------|--------------|
| **Versioning** | Track changes to vStore items over time | Adds complexity, unclear user need |
| **Auto-suggest saving** | Om-E proactively suggests saving valuable content | Risk of being annoying, dilutes opt-in model |
| **Cross-project sharing** | Share project vStore with other users | Requires auth/permissions system |
| **Cloud sync** | Sync vStore content across devices | Infrastructure dependency |
| **Dedicated search UI** | Visual search interface for vStore | Conversational approach sufficient for v1 |

### 11.2 Deferred to v3+

| Feature | Description | Why Deferred |
|---------|-------------|--------------|
| **LLM-controlled database routing** | LLM decides which store to query dynamically | Reduces predictability, adds complexity |
| **Auto-saving** | Automatic content capture without user action | Violates opt-in principle, needs careful UX |
| **Behavioural instructions in vStore** | Stored rules that modify Om-E behaviour | Risk of unpredictable actions, trust issues |

### 11.3 Open Design Questions

1. **Import from URLs** - Should vStore support fetching and saving web content directly?
2. **Embedding model choice** - Allow users to select different embedding models?
3. **Export format** - What format for exporting vStore content? (JSON, markdown, zip?)

---

## 12. Implementation Phases

### Phase 1: Foundation
- [ ] Project directory structure migration
- [ ] Chat vStore class (vector + files)
- [ ] Project vStore class
- [ ] Basic capabilities (Add, Remove, List)

### Phase 2: UI Integration
- [ ] Prompt area toggle for save option
- [ ] Sidebar vStore section
- [ ] Item detail view

### Phase 3: RAG Integration
- [ ] Query flow with vStore priority
- [ ] Source attribution in responses
- [ ] "What do I have saved" queries

### Phase 4: File Upload
- [ ] Upload UI
- [ ] File chunking and indexing
- [ ] PDF text extraction

### Phase 5: Polish
- [ ] Tags and organization
- [ ] Promotion workflow
- [ ] Import existing large_payloads

---

## Appendix: Example Interactions

### A. Saving Content

```
User: [pastes 2000 char article about sharks]

UI: Shows toggle - "Save to Chat vStore ☐" "Save to Project vStore ☐"

User: Checks "Save to Project vStore", labels it "Shark Biology"

User: What can you tell me about this?

Om-E: [Responds based on content]
      [Content saved to Project vStore as "Shark Biology"]
```

### B. Cross-Chat Query

```
[In a different chat, weeks later]

User: What do I know about sharks?

Om-E: Based on your saved content "Shark Biology" in your project vStore:

      Sharks are elasmobranch fish with cartilaginous skeletons...

      Would you like me to elaborate on any aspect?
```

### C. Managing vStore

```
User: Show me what I have saved

Om-E: Your Project vStore contains 3 items:
      1. Shark Biology (2.4kb) - saved Dec 24
      2. Guitar Specs (1.1kb) - saved Dec 20
      3. Recipe Collection (3.2kb) - saved Dec 15

      Your current chat vStore has 1 item:
      1. Meeting Notes (800b) - saved today

      Want to view, delete, or promote any of these?
```
