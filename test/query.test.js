const assert = require('node:assert/strict');
const { queryWorkflow, cosineSimilarity } = require('../src/query');

function packFloat32(vector) {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  vector.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer;
}

function buildRow({
  chunkId,
  documentId,
  chunkIndex,
  text,
  embedding,
  sourceType = 'file',
  sourceValue = '/tmp/note.txt',
}) {
  return {
    chunk_id: chunkId,
    document_id: documentId,
    chunk_index: chunkIndex,
    start_char: 0,
    end_char: text.length,
    text,
    vector_blob: packFloat32(embedding),
    dimensions: embedding.length,
    source_type: sourceType,
    source_value: sourceValue,
  };
}

test('cosineSimilarity handles unit vectors and non-unit vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  const score = cosineSimilarity([2, 0], [1, 1]);
  assert.equal(Number(score.toFixed(6)), 0.707107);
});

test('queryWorkflow ranks candidates by score descending and enforces top-k', async () => {
  const rows = [
    buildRow({
      chunkId: 'chunk_1',
      documentId: 'doc_a',
      chunkIndex: 0,
      text: 'alpha',
      embedding: [0.9, 0.1],
    }),
    buildRow({
      chunkId: 'chunk_2',
      documentId: 'doc_b',
      chunkIndex: 0,
      text: 'beta',
      embedding: [0.1, 0.9],
    }),
  ];

  const result = await queryWorkflow(
    {
      queryText: 'hello',
      embedModel: 'nomic-embed-text',
      dbPath: 'notesrag.sqlite',
      topK: 1,
      cwd: '/tmp/work',
    },
    {
      embedChunks: async () => [{
        embedding: [1, 0],
      }],
      openDatabase: () => ({ id: 'db' }),
      initSchema: () => {},
      listEmbeddingRowsByModel: () => rows,
      closeDatabase: () => {},
    },
  );

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].chunkId, 'chunk_1');
});

test('queryWorkflow returns empty results when model has no rows', async () => {
  const result = await queryWorkflow(
    {
      queryText: 'hello',
      embedModel: 'nomic-embed-text',
      dbPath: '/tmp/notesrag.sqlite',
      topK: 5,
      cwd: '/tmp',
    },
    {
      embedChunks: async () => [{
        embedding: [1, 0, 0],
      }],
      openDatabase: () => ({ id: 'db' }),
      initSchema: () => {},
      listEmbeddingRowsByModel: () => [],
      closeDatabase: () => {},
    },
  );

  assert.deepEqual(result.results, []);
  assert.equal(result.totalCandidates, 0);
});

test('queryWorkflow throws on dimension mismatch', async () => {
  await assert.rejects(
    () => queryWorkflow(
      {
        queryText: 'hello',
        embedModel: 'nomic-embed-text',
        dbPath: '/tmp/notesrag.sqlite',
        topK: 5,
        cwd: '/tmp',
      },
      {
        embedChunks: async () => [{
          embedding: [1, 0, 0],
        }],
        openDatabase: () => ({ id: 'db' }),
        initSchema: () => {},
        listEmbeddingRowsByModel: () => [buildRow({
          chunkId: 'chunk_bad',
          documentId: 'doc_bad',
          chunkIndex: 0,
          text: 'bad',
          embedding: [1, 0],
        })],
        closeDatabase: () => {},
      },
    ),
    /dimension mismatch between query embedding/,
  );
});
