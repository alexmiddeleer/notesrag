# toy-rag 

This project is centered around building a toy rag that doesn’t include the final llm step. It will run completely locally. The goal is learning and making something cool that works decently. Here is a basic mermaid chart:

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
  I --> J[Optional lexical index, probably will not build<br/>FTS / BM25]
  J --> K[Commit transaction]

  %% ------------------
  %% Retrieval pipeline
  %% ------------------
  C --> D
  C --> L[Parse query]
  L --> M[Generate query embedding]
  M --> N[Vector similarity search<br/>top-k chunks]
  N --> O[Optional rerank / filter<br/>lexical or metadata, won’t build initially]
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
Indexing currently implements mermaid steps through `H`:
- `G`: deterministic chunking with overlap
- `H`: local embedding generation via Ollama (`nomic-embed-text` by default)

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
