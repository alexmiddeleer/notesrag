const assert = require('node:assert/strict');
const path = require('node:path');
const { openDatabase, initSchema, persistIndexBatch, closeDatabase } = require('../src/db');
const { withTempDir } = require('./helpers/tmp');

function buildChunk({
  chunkId,
  documentId,
  index,
  startChar,
  endChar,
  text,
  embedding,
}) {
  return {
    chunkId,
    documentId,
    index,
    startChar,
    endChar,
    text,
    embedding,
    dimensions: embedding.length,
  };
}

test('initSchema creates tables and indexes', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'notesrag.sqlite');
    const db = openDatabase(dbPath);
    try {
      initSchema(db);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name);

      assert.ok(tables.includes('schema_meta'));
      assert.ok(tables.includes('documents'));
      assert.ok(tables.includes('chunks'));
      assert.ok(tables.includes('embeddings'));

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((row) => row.name);

      assert.ok(indexes.includes('chunks_document_id_chunk_index'));
      assert.ok(indexes.includes('embeddings_model_dimensions'));
    } finally {
      closeDatabase(db);
    }
  });
});

test('persistIndexBatch writes documents, chunks, and embeddings', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'notesrag.sqlite');
    const db = openDatabase(dbPath);
    try {
      initSchema(db);

      const document = {
        documentId: 'doc_test',
        chars: 11,
        bytes: 11,
        normalizedText: 'hello world',
        sourceDescriptor: { type: 'stdin', value: 'stdin' },
      };

      const embeddedChunks = [
        buildChunk({
          chunkId: 'chunk_a',
          documentId: 'doc_test',
          index: 0,
          startChar: 0,
          endChar: 5,
          text: 'hello',
          embedding: [0.1, 0.2, 0.3],
        }),
        buildChunk({
          chunkId: 'chunk_b',
          documentId: 'doc_test',
          index: 1,
          startChar: 6,
          endChar: 11,
          text: 'world',
          embedding: [0.4, 0.5, 0.6],
        }),
      ];

      persistIndexBatch(db, {
        document,
        embeddedChunks,
        model: 'nomic-embed-text',
      });

      const docCount = db.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
      const chunkCount = db.prepare('SELECT COUNT(*) AS count FROM chunks').get().count;
      const embedCount = db.prepare('SELECT COUNT(*) AS count FROM embeddings').get().count;
      const vectorSize = db.prepare('SELECT LENGTH(vector_blob) AS size FROM embeddings LIMIT 1').get().size;

      assert.equal(docCount, 1);
      assert.equal(chunkCount, 2);
      assert.equal(embedCount, 2);
      assert.equal(vectorSize, 12);
    } finally {
      closeDatabase(db);
    }
  });
});

test('persistIndexBatch rolls back on failure', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'notesrag.sqlite');
    const db = openDatabase(dbPath);
    try {
      initSchema(db);

      const document = {
        documentId: 'doc_fail',
        chars: 4,
        bytes: 4,
        normalizedText: 'test',
        sourceDescriptor: { type: 'stdin', value: 'stdin' },
      };

      const embeddedChunks = [
        buildChunk({
          chunkId: 'chunk_bad',
          documentId: 'doc_fail',
          index: 0,
          startChar: 0,
          endChar: 4,
          text: 'test',
          embedding: [0.1, Number.NaN, 0.3],
        }),
      ];

      assert.throws(() => {
        persistIndexBatch(db, {
          document,
          embeddedChunks,
          model: 'nomic-embed-text',
        });
      }, /embedding vector/);

      const docCount = db.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
      const chunkCount = db.prepare('SELECT COUNT(*) AS count FROM chunks').get().count;
      const embedCount = db.prepare('SELECT COUNT(*) AS count FROM embeddings').get().count;

      assert.equal(docCount, 0);
      assert.equal(chunkCount, 0);
      assert.equal(embedCount, 0);
    } finally {
      closeDatabase(db);
    }
  });
});

test('persistIndexBatch upserts by document id', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'notesrag.sqlite');
    const db = openDatabase(dbPath);
    try {
      initSchema(db);

      const document = {
        documentId: 'doc_upsert',
        chars: 5,
        bytes: 5,
        normalizedText: 'hello',
        sourceDescriptor: { type: 'file', value: '/tmp/hello.txt' },
      };

      const firstChunks = [
        buildChunk({
          chunkId: 'chunk_first',
          documentId: 'doc_upsert',
          index: 0,
          startChar: 0,
          endChar: 5,
          text: 'hello',
          embedding: [0.1, 0.2, 0.3],
        }),
      ];

      persistIndexBatch(db, {
        document,
        embeddedChunks: firstChunks,
        model: 'nomic-embed-text',
      });

      const updatedDocument = {
        ...document,
        chars: 7,
        bytes: 7,
        normalizedText: 'goodbye',
      };

      const secondChunks = [
        buildChunk({
          chunkId: 'chunk_second',
          documentId: 'doc_upsert',
          index: 0,
          startChar: 0,
          endChar: 7,
          text: 'goodbye',
          embedding: [0.4, 0.5, 0.6],
        }),
      ];

      persistIndexBatch(db, {
        document: updatedDocument,
        embeddedChunks: secondChunks,
        model: 'nomic-embed-text',
      });

      const chunkCount = db.prepare('SELECT COUNT(*) AS count FROM chunks').get().count;
      const embedCount = db.prepare('SELECT COUNT(*) AS count FROM embeddings').get().count;
      const chunkText = db.prepare('SELECT text FROM chunks WHERE document_id = ?').get('doc_upsert').text;
      const docRow = db.prepare('SELECT chars, normalized_text FROM documents WHERE document_id = ?').get('doc_upsert');

      assert.equal(chunkCount, 1);
      assert.equal(embedCount, 1);
      assert.equal(chunkText, 'goodbye');
      assert.equal(docRow.chars, 7);
      assert.equal(docRow.normalized_text, 'goodbye');
    } finally {
      closeDatabase(db);
    }
  });
});
