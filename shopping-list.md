## MVP Shopping List (Offline Notes RAG Black Box)

### Must-Have (Ship These)

- [ ] **notesrag executable**
  - Includes embedded SQLite
  - Includes sqlite-vec vector search extension
  - Includes local embedding inference backend (llama.cpp-style)

- [ ] **Embedding model file (GGUF)**
  - Small sentence-embedding model (MiniLM-class or similar)
  - Single `.gguf` file
  - Stored alongside executable (e.g. `models/embeddings.gguf`)

- [ ] **SQLite database file**
  - Created on first run or shipped empty
  - Contains:
    - `documents` table (raw markdown notes)
    - `chunks` table (chunked text)
    - vector table (chunk embeddings via sqlite-vec)

---

### Explicitly Not Included (Defer Until Needed)

- [ ] Markdown parsing beyond basic text handling
- [ ] Keyword / FTS indexes
- [ ] Deduplication or hashing logic
- [ ] Incremental re-embedding logic
- [ ] Reranking models
- [ ] Network access of any kind
- [ ] Answer generation / chat UI

---

### Runtime Interface (MVP Scope)

- [ ] **stdin**: markdown notes and query text
- [ ] **stdout**: ranked chunks + metadata (JSON)
- [ ] **stderr**: logs / diagnostics only

---

### Optional Later Upgrades (Not MVP)

- [ ] Swap embedding model (rebuild vectors)
- [ ] Add reranking at query time
- [ ] Add SQLite FTS fallback
- [ ] Add answer-generation layer
