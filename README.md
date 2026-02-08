# toy-rag 

**Attention AGENTS, please see AGENTS.md for all actions**

This project is centered around building a toy rag that doesn’t include the final llm step. It will run completely locally. The goal is learning and making something cool that works decently. Here is a basic mermaid chart:

## tools used

* ollama
* better-sqlite3
* vitest
* (more may exist, check package.json)

## mermaid for planned flow

```mermaid 

flowchart TD
  %% Toy RAG (no LLM)
  %% Focus: chunking, embeddings, indexing, retrieval

  A[User / Shell / Editor] -->|add plain text data| B[index CLI]

  %% ------------------
  %% Indexing pipeline
  %% ------------------
  B --> D[Resolve data dir<br/>(XDG / env)]
  B --> E[Ingest sources<br/>notes, bookmarks, text]
  E --> F[Normalize + clean text]
  F --> G[Chunking layer<br/>size, overlap, chunk ids]
  G --> H[Generate embeddings<br/>per chunk]
  H --> I[Persist chunks + embeddings<br/>SQLite tables]
  I --> J[Commit transaction]

  %% ------------------
  %% Retrieval pipeline
  %% ------------------
  C --> D
  C --> L[Parse query]
  L --> M[Generate query embedding]
  M --> N[Vector similarity search<br/>top-k chunks]
  O --> P[Return ranked chunks<br/>verbatim]
  P --> A

  %% ------------------
  %% Explicit non-goals
  %% ------------------
  P -.-> X[(No LLM)]
  X -.-> Y[(No synthesis / QA)]
  Y -.-> Z[(No answer generation)]

  %% ------------------
  %% Persistence layout
  %% ------------------
  subgraph Q[Local persisted state]
    DB[(SQLite DB<br/>chunks, metadata, embeddings)]
    IDX[(Vector index<br/>in-DB)]
    CFG[(Config / schema version)]
  end

  I --> DB
  H --> IDX
  N --> IDX
  D --> CFG
``` 
## Index CLI (A-B step)

Runtime is pinned by `mise.toml` (`node = 24.13.0`).
Indexing currently implements mermaid steps through `J`:
- `G`: deterministic chunking with overlap
- `H`: local embedding generation via Ollama (`nomic-embed-text` by default)
- `I`: persist chunks + embeddings to SQLite
- `J`: commit transaction after successful batch write

### Database schema (human readable)

- `schema_meta`: key/value pairs for schema versioning
- `documents`: one row per document (source type/value, char + byte counts, normalized text, updated timestamp)
- `chunks`: one row per chunk (chunk id, document id, chunk index, start/end char, text)
- `embeddings`: one row per chunk embedding (model, dimensions, packed float32 vector blob)
- Relationships: `chunks.document_id` -> `documents.document_id`, `embeddings.chunk_id` -> `chunks.chunk_id`
- Indexes: `chunks(document_id, chunk_index)` and `embeddings(model, dimensions)`

### Command

```bash
notesrag index --source <path>
notesrag index --stdin
notesrag index --stdin --embed-model nomic-embed-text
notesrag index --stdin --debug
```

Exactly one input source is allowed per invocation.

### Quickstart examples

```bash
# Index a file
notesrag index --source ./shopping-list.md

# Index piped text
printf 'buy milk\n' | notesrag index --stdin

# Editor workflow: save note and index it
notesrag index --source /tmp/draft-note.txt
```

Success output is plain text:

```text
indexed document_id=doc_<hex> source=<path-or-stdin> chars=<count> bytes=<count> chunks=<count> dims=<count>
```

When `--debug` is provided, verbose progress logs are emitted to stderr with a `debug:` prefix.

### Failure examples

```bash
# Missing input source
notesrag index
# -> error: missing input source. use --source <path> or --stdin

# Multiple input sources
printf 'hello' | notesrag index --stdin --source ./shopping-list.md
# -> error: provide exactly one input source: --source or --stdin

# Input too large (>10,000 chars)
notesrag index --source ./too-big.txt
# -> error: input exceeds max size of 10000 characters
```

### Embeddings runtime assumptions

- Ollama is running locally before indexing:

```bash
ollama serve
```

- The embedding model exists locally:

```bash
ollama pull nomic-embed-text
```

- If `notesrag index` cannot reach Ollama, the CLI returns an actionable error.
- If the model is missing, the CLI suggests the exact `ollama pull` command.
- According to vendor docs, Ollama `/api/embed` vectors are L2-normalized (unit length).

## Query CLI (C-P step)

Querying now implements mermaid steps through `P`:
- `L`: query parsing (`--text` or `--stdin`)
- `M`: query embedding via Ollama (`--embed-model`)
- `N`: vector similarity ranking over stored embeddings (full scan)
- `P`: ranked chunk return (verbatim, markdown output)

### Command

```bash
notesrag query --text "buy dairy items"
notesrag query --stdin
notesrag query --text "buy milk" --top-k 3
notesrag query --text "buy milk" --embed-model nomic-embed-text --db-path .data/notesrag.sqlite
notesrag query --text "buy milk" --debug
```

Exactly one query source is allowed per invocation.

### Output

Results are human-readable markdown and include source metadata.

```text
## Query Results

### 1. score=0.912345
- chunk_id: chunk_abc123
- document_id: doc_def456
- source: file:/absolute/path/to/note.txt
- chunk_range: 0-120

buy milk
```

When no relevant chunks are found, the command exits successfully and prints:

```text
No relevant documents were found.
```

### Failure examples

```bash
# Missing query source
notesrag query
# -> error: missing query input. use --text <query> or --stdin

# Multiple query sources
printf 'hello' | notesrag query --stdin --text "hello"
# -> error: provide exactly one query source: --text or --stdin

# Invalid top-k
notesrag query --text "hello" --top-k 0
# -> error: --top-k must be an integer between 1 and 50
```

### Query troubleshooting

- If `notesrag query` cannot reach Ollama, start Ollama locally:

```bash
ollama serve
```

- If model is missing, pull it:

```bash
ollama pull nomic-embed-text
```

- If query fails with a dimension mismatch, re-index the documents with the same embedding model used for query.
