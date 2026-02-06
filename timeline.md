# Phased Project Timeline — Offline Notes RAG (Learning Build)

## Phase 0 — Framing & Constraints (½ day)
- Lock constraints:
  - (DONE) Offline-only, stdin/stdout/stderr
  - Single executable + SQLite DB + embedding model file
- (DONE) Define the black-box contract:
  - `add_note(any text)`
  - `query(text) -> ranked chunks + metadata`
- (DONE) Decide target platforms (e.g., macOS/Linux first)

Deliverable:
- One-page design note with invariants and CLI contract

---

## Phase 1 — Storage Skeleton (½–1 day)
- Embed SQLite into the executable
- Create schema:
  - `documents`
  - `chunks`
  - vector table (via sqlite-vec)
- Add DB initialization and migrations (minimal)

Deliverable:
- Executable can create/open DB and run a no-op query

---

## Phase 2 — Chunking MVP (½ day)
- Implement deterministic chunking:
  - Split by blank lines / bullet blocks
  - Apply a simple size cap
- Insert documents and chunks into SQLite

Deliverable:
- `add_note` stores raw markdown + chunks correctly

---

## Phase 3 — Local Embedding Inference (1–2 days)
- Integrate local inference backend (llama.cpp-style)
- Load a single GGUF embedding model from disk
- Implement `embed(text[]) -> vectors[]`
- Handle cold-start and basic errors

Deliverable:
- Given text input, executable returns embeddings locally

---

## Phase 4 — Vector Index Integration (½–1 day)
- Wire embeddings into sqlite-vec
- Insert vectors keyed by `chunk_id`
- Validate round-trip:
  - embed → store → retrieve by ID

Deliverable:
- Vector table populated for ingested notes

---

## Phase 5 — Retrieval Pipeline (½–1 day)
- Embed query text
- Run top-K vector similarity search
- Join chunk IDs back to SQLite for text + metadata
- Output ranked results as JSON

Deliverable:
- `query` returns ranked chunks with provenance

---

## Phase 6 — End-to-End CLI (½ day)
- Implement CLI commands:
  - `init`
  - `add`
  - `query`
- Standardize JSON output and error handling
- Log diagnostics to stderr

Deliverable:
- Full ingest → query loop usable from terminal

---

## Phase 7 — Rebuild & Safety Hooks (½ day)
- Add `rebuild` command:
  - wipe vector table
  - re-embed all chunks
- Store minimal embedding metadata in DB:
  - model ID
  - embedding dimension
- Refuse retrieval if metadata mismatches current model

Deliverable:
- Safe regeneration path when embeddings change

---

## Phase 8 — Quality Pass & Learning Loop (ongoing)
- Add a small test corpus of notes
- Create a handful of “good” and “bad” queries
- Observe failure modes:
  - chunking misses
  - semantic drift
- Make small, targeted improvements

Deliverable:
- Working mental model of where RAG quality comes from

---

## Optional Stretch (only if curiosity strikes)
- Simple reranking at query time
- SQLite FTS fallback
- Plug a generator on top of ranked chunks

---

## Final Outcome
- A compact, offline, inspectable RAG system
- Clear understanding of:
  - what embeddings do
  - what vector search does
  - what LLMs *don’t* need to do
- A solid foundation you can evolve or discard with confidence
