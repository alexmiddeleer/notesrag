const assert = require('node:assert/strict');
const path = require('node:path');
const { indexWorkflow } = require('../src/index');

function buildPayload(rawText = 'hello world') {
  return {
    rawText,
    sourceDescriptor: { type: 'stdin', value: 'stdin' },
  };
}

function buildEmbeddedChunks(chunks, dimensions = 3) {
  return chunks.map((chunk) => ({
    ...chunk,
    embedding: Array(dimensions).fill(0.1),
    dimensions,
  }));
}

test('indexWorkflow persists embeddings and returns summary', async () => {
  const payload = buildPayload();
  const fakeDb = { id: 'db' };
  let openedPath;
  let persisted;
  let closedDb;

  const deps = {
    embedChunks: async ({ model, chunks, host }) => {
      assert.equal(model, 'nomic-embed-text');
      assert.equal(host, 'http://localhost');
      return buildEmbeddedChunks(chunks, 5);
    },
    openDatabase: (dbPath) => {
      openedPath = dbPath;
      return fakeDb;
    },
    initSchema: (db) => {
      assert.equal(db, fakeDb);
    },
    persistIndexBatch: (db, args) => {
      persisted = { db, args };
    },
    closeDatabase: (db) => {
      closedDb = db;
    },
    getDatabaseStats: () => {
      throw new Error('getDatabaseStats should not be called');
    },
  };

  const result = await indexWorkflow(
    {
      payload,
      embedModel: 'nomic-embed-text',
      dbPath: 'notesrag.sqlite',
      cwd: '/tmp/project',
      debugEnabled: false,
      ollamaHost: 'http://localhost',
    },
    deps,
  );

  assert.equal(openedPath, path.resolve('/tmp/project', 'notesrag.sqlite'));
  assert.equal(persisted.db, fakeDb);
  assert.equal(persisted.args.model, 'nomic-embed-text');
  assert.equal(result.chunkCount, 1);
  assert.equal(result.dimensions, 5);
  assert.equal(closedDb, fakeDb);
});

test('indexWorkflow logs debug details and db stats when enabled', async () => {
  const payload = buildPayload('debug payload');
  const fakeDb = { id: 'db' };
  const debugMessages = [];
  let statsCalled = false;

  const deps = {
    embedChunks: async ({ chunks }) => buildEmbeddedChunks(chunks, 2),
    openDatabase: () => fakeDb,
    initSchema: () => {},
    persistIndexBatch: () => {},
    closeDatabase: () => {},
    getDatabaseStats: () => {
      statsCalled = true;
      return {
        documents: 1,
        chunks: 1,
        embeddings: 1,
        vectorBytes: 8,
        dbSizeMb: 0.002,
      };
    },
  };

  await indexWorkflow(
    {
      payload,
      embedModel: 'nomic-embed-text',
      dbPath: '/tmp/notesrag.sqlite',
      cwd: '/tmp',
      debugEnabled: true,
      debugLog: async (message) => {
        debugMessages.push(message);
      },
    },
    deps,
  );

  assert.ok(statsCalled);
  assert.ok(debugMessages.some((message) => message.startsWith('ingested document_id=')));
  assert.ok(debugMessages.some((message) => message.startsWith('chunked chunks=')));
  assert.ok(debugMessages.some((message) => message.startsWith('embedded chunks=')));
  assert.ok(debugMessages.some((message) => message.startsWith('first embedded chunk =')));
  assert.ok(debugMessages.some((message) => message.startsWith('completed dimensions=')));
  assert.ok(debugMessages.some((message) => message === 'db transaction begin'));
  assert.ok(debugMessages.some((message) => message === 'db transaction commit'));
  assert.ok(debugMessages.some((message) => message.startsWith('db stats documents=')));
});

test('indexWorkflow sets dimensions to 0 when embeddings are empty', async () => {
  const payload = buildPayload('empty embeddings');
  const debugMessages = [];

  const deps = {
    embedChunks: async () => [],
    openDatabase: () => ({}),
    initSchema: () => {},
    persistIndexBatch: () => {},
    closeDatabase: () => {},
    getDatabaseStats: () => ({
      documents: 1,
      chunks: 0,
      embeddings: 0,
      vectorBytes: 0,
      dbSizeMb: 0,
    }),
  };

  const result = await indexWorkflow(
    {
      payload,
      embedModel: 'nomic-embed-text',
      dbPath: '/tmp/notesrag.sqlite',
      cwd: '/tmp',
      debugEnabled: true,
      debugLog: async (message) => {
        debugMessages.push(message);
      },
    },
    deps,
  );

  assert.equal(result.chunkCount, 0);
  assert.equal(result.dimensions, 0);
  assert.ok(!debugMessages.some((message) => message.startsWith('first embedded chunk =')));
});

test('indexWorkflow logs rollback and rethrows on persist failure', async () => {
  const payload = buildPayload('rollback');
  const fakeDb = { id: 'db' };
  const debugMessages = [];
  let closedDb;

  const deps = {
    embedChunks: async ({ chunks }) => buildEmbeddedChunks(chunks, 2),
    openDatabase: () => fakeDb,
    initSchema: () => {},
    persistIndexBatch: () => {
      throw new Error('boom');
    },
    closeDatabase: (db) => {
      closedDb = db;
    },
    getDatabaseStats: () => ({
      documents: 0,
      chunks: 0,
      embeddings: 0,
      vectorBytes: 0,
      dbSizeMb: 0,
    }),
  };

  await assert.rejects(
    () => indexWorkflow(
      {
        payload,
        embedModel: 'nomic-embed-text',
        dbPath: '/tmp/notesrag.sqlite',
        cwd: '/tmp',
        debugEnabled: true,
        debugLog: async (message) => {
          debugMessages.push(message);
        },
      },
      deps,
    ),
    /boom/,
  );

  assert.equal(closedDb, fakeDb);
  assert.ok(debugMessages.some((message) => message.includes('db transaction rollback error=boom')));
});
