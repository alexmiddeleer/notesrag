# Plan: Implement `H --> I` and `I --> J` in Index Pipeline

## Scope
Implement the indexing pipeline steps shown in `README.md`:
- `I`: Persist chunks + embeddings to SQLite.
- `J`: Commit transaction after successful batch write.

## Decisions
1. SQLite driver
- Use `better-sqlite3` (already present in `package.json` and installed).

2. Embedding storage format
- Store embeddings as packed float32 `BLOB` for compact size and deterministic read/write.
- Store `dimensions` as integer alongside each embedding.

3. Duplicate indexing behavior
- Upsert semantics for deterministic reruns.
- `documents.document_id` is stable key from ingest; chunk rows keyed by `chunk_id`.

## Implementation Plan
1. Add DB module and schema.
- Create `src/db.js`.
- Implement:
  - `openDatabase(dbPath)`
  - `initSchema(db)`
  - `persistIndexBatch(db, { document, embeddedChunks, sourceDescriptor, model })`
  - `closeDatabase(db)`
- Schema:
  - `schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  - `documents(document_id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_value TEXT NOT NULL, chars INTEGER NOT NULL, bytes INTEGER NOT NULL, normalized_text TEXT NOT NULL, updated_at TEXT NOT NULL)`
  - `chunks(chunk_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, start_char INTEGER NOT NULL, end_char INTEGER NOT NULL, text TEXT NOT NULL, FOREIGN KEY(document_id) REFERENCES documents(document_id) ON DELETE CASCADE)`
  - `embeddings(chunk_id TEXT PRIMARY KEY, model TEXT NOT NULL, dimensions INTEGER NOT NULL, vector_blob BLOB NOT NULL, FOREIGN KEY(chunk_id) REFERENCES chunks(chunk_id) ON DELETE CASCADE)`
- Indexes:
  - `chunks(document_id, chunk_index)`
  - `embeddings(model, dimensions)`

2. Add vector serialization helpers.
- In `src/db.js`, add:
  - `packFloat32(vector) -> Buffer`
  - `assertDimensions(vector, expected?)`
- Validate numeric vectors before writing.

3. Integrate persistence into CLI flow.
- Update `src/cli.js`:
  - Open DB and init schema before persist.
  - After embedding (`H`), call `persistIndexBatch(...)` (`I`).
  - Commit inside `persistIndexBatch` transaction (`J`).
  - Keep success output format unchanged.
  - Add `--debug` logs for transaction begin/commit/rollback.

4. Add DB path config.
- Update `src/parseArgs.js` for optional `--db-path`.
- If omitted, default to local path (e.g. `.data/notesrag.sqlite`) until XDG path handling is implemented.

5. Add tests.
- Add/extend tests in `test/`:
  - Schema init test (tables + indexes exist).
  - Persist success test (rows written for doc/chunks/embeddings).
  - Rollback test (inject failure mid-write and assert zero partial rows).
  - Upsert test (second run updates same `document_id`/chunks consistently).

6. Documentation updates.
- `README.md`: change "implements steps through `H`" to through `J` once complete.
- `README.md`: add a simple human readable database schema description
- `TODOS.md`: ignore this file.

## Acceptance Criteria
- Index command persists document, chunks, and embeddings in SQLite.
- A failed write rolls back all rows from that indexing attempt.
- Re-indexing same input is deterministic and succeeds via upsert.
- CLI success line remains:
  - `indexed document_id=... source=... chars=... bytes=... chunks=... dims=...`
- `node --test` passes for new and existing tests.
