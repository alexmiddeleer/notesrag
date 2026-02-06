# Plan: Next Indexing Phase (Source Persistence via better-sqlite3)

## Overview
This phase adds durable local persistence for ingested source documents using `better-sqlite3`.
The goal is to store each original normalized source text with a stable `document_id`, source descriptor, and metadata (including timestamp fields) in SQLite.
Chunking, embeddings, and retrieval indexing are explicitly out of scope for this phase.

## Scope
- In scope:
  - (done) Add `better-sqlite3` dependency.
  - Add SQLite open/init layer.
  - Create initial schema for persisted source documents.
  - Write ingested source records to DB during `notesrag index`.
  - Persist metadata and ingestion timestamps.
  - Add tests for schema init + inserts + duplicate handling.
- Out of scope:
  - Chunk generation.
  - Embedding generation.
  - Vector tables/indexes.
  - Retrieval/search commands.

## Proposed Data Model (Phase-Limited)
Single table for now:
- `documents`
  - `document_id TEXT PRIMARY KEY`
  - `source_type TEXT NOT NULL` (`file` or `stdin`)
  - `source_value TEXT NOT NULL` (resolved file path or `stdin`)
  - `normalized_text TEXT NOT NULL`
  - `char_count INTEGER NOT NULL`
  - `byte_count INTEGER NOT NULL`
  - `metadata_json TEXT NOT NULL DEFAULT '{}'`
  - `ingested_at TEXT NOT NULL` (ISO-8601 UTC timestamp)

Notes:
- Keep metadata as JSON text for flexibility.
- Do not add extra uniqueness constraints in this phase; `document_id` primary key is sufficient.

## Implementation Steps
1. Add dependency
- Install `better-sqlite3` and commit lockfile updates if generated.
- Verify runtime compatibility with pinned Node version.

2. Add DB module and connection lifecycle
- Create `src/db.js` with:
  - `openDatabase(dbPath)` for opening/creating DB.
  - safe default DB path strategy (project-local for now, configurable later).
  - SQLite pragmas suitable for local durability (`journal_mode = WAL`, `foreign_keys = ON`).

3. Add schema initialization
- Create idempotent `initSchema(db)` in `src/db.js` (or `src/schema.js`).
- Ensure table creation runs before first write from CLI.

4. Add document repository layer
- Create `src/documentStore.js` with:
  - `saveDocument(db, ingestResult)` using UPSERT semantics.
  - mapping for `sourceDescriptor`, counts, text, and `metadata` JSON.

5. Wire into index command flow
- Update `src/cli.js` `executeIndex` flow:
  - read payload -> ingest -> open DB -> init schema -> save document -> print success.
- Populate ingest metadata with `command_version` from `package.json` before persistence.
- Preserve existing success output fields; optionally add `stored=true` in a later pass.

6. Define duplicate behavior
- Use UPSERT on `document_id` to refresh stored content for idempotent re-index operations.
- On conflict, update: `normalized_text`, `char_count`, `byte_count`, `metadata_json`, `ingested_at`.
- Document this behavior clearly in README.

7. Add tests
- Unit tests for DB init and `saveDocument`.
- Integration test for `notesrag index` writing to SQLite and record shape.
- Duplicate-ingest test aligned with chosen behavior.

8. Update docs
- README: add persistence behavior, DB file location, and schema summary.
- timeline.md: mark this storage sub-phase complete and note chunking is next phase.

## Definition of Done
- `notesrag index --source ...` and `--stdin` both persist one document row.
- Persisted row includes:
  - stable `document_id`
  - source descriptor
  - normalized text
  - `char_count`, `byte_count`
  - metadata JSON
  - `ingested_at` timestamp
- `metadata_json` includes `command_version` from `package.json`.
- Tests pass for schema creation, insert, and duplicate strategy.
- README reflects actual persistence behavior and current non-goals.

## Risks and Mitigations
- Native module install friction (`better-sqlite3`):
  - Mitigation: document required build tooling and verify in CI/local setup.
- Schema churn before chunking starts:
  - Mitigation: keep schema minimal; postpone chunk-related tables.
- Ambiguous duplicate semantics:
  - Mitigation: choose explicit behavior now and encode via tests.

## Resolved Decisions
1. DB location: project root, filename `notesrag.db`.
2. Duplicate behavior: `upsert/refresh` on `document_id`.
3. Timestamp field: `ingested_at` only.
4. Metadata inclusion now: include `command_version` from `package.json`; do not include `cwd`.
