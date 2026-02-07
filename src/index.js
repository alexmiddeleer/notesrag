const path = require('node:path');
const { ingest } = require('./ingest');
const { chunkDocument } = require('./chunk');
const { embedChunks } = require('./embed');
const {
  openDatabase,
  initSchema,
  persistIndexBatch,
  closeDatabase,
  getDatabaseStats,
} = require('./db');
const { formatEmbeddedChunkForLog } = require('./cli-helpers');

function resolveDbPath(dbPath, cwd) {
  if (path.isAbsolute(dbPath)) {
    return dbPath;
  }
  return path.resolve(cwd, dbPath);
}

async function persistIndexTransaction({
  db,
  debug,
  document,
  embeddedChunks,
  model,
  persistBatch,
  readStats,
  debugEnabled,
}) {
  await debug('db transaction begin');
  try {
    persistBatch(db, {
      document,
      embeddedChunks,
      sourceDescriptor: document.sourceDescriptor,
      model,
    });
    await debug('db transaction commit');
    if (debugEnabled) {
      const stats = readStats(db);
      await debug(
        `db stats documents=${stats.documents} chunks=${stats.chunks} embeddings=${stats.embeddings} vector_bytes=${stats.vectorBytes} db_size_mb=${stats.dbSizeMb.toFixed(3)}`,
      );
    }
  } catch (error) {
    await debug(`db transaction rollback error=${error.message}`);
    throw error;
  }
}

async function indexWorkflow(options, deps = {}) {
  const {
    payload,
    embedModel,
    dbPath,
    cwd,
    debugEnabled,
    debugLog,
    ollamaHost,
  } = options;
  const {
    embedChunks: embedder = embedChunks,
    openDatabase: openDb = openDatabase,
    initSchema: initDb = initSchema,
    persistIndexBatch: persistBatch = persistIndexBatch,
    closeDatabase: closeDb = closeDatabase,
    getDatabaseStats: readStats = getDatabaseStats,
  } = deps;
  const debug = typeof debugLog === 'function' ? debugLog : async () => {};

  const result = ingest({
    rawText: payload.rawText,
    sourceDescriptor: payload.sourceDescriptor,
  });
  await debug(
    `ingested document_id=${result.documentId} chars=${result.chars} bytes=${result.bytes}`,
  );

  const chunks = chunkDocument({
    documentId: result.documentId,
    text: result.normalizedText,
  });
  await debug(`chunked chunks=${chunks.length}`);
  const embeddedChunks = await embedder({
    model: embedModel,
    chunks,
    host: ollamaHost,
  });
  await debug(`embedded chunks=${embeddedChunks.length}`);

  if (embeddedChunks.length > 0) {
    await debug(
      `first embedded chunk =${formatEmbeddedChunkForLog(embeddedChunks[0])}`,
    );
  }

  const dimensions = embeddedChunks.length > 0 ? embeddedChunks[0].dimensions : 0;
  await debug(`completed dimensions=${dimensions}`);

  const resolvedDbPath = resolveDbPath(dbPath, cwd);
  const db = openDb(resolvedDbPath);
  try {
    initDb(db);
    await persistIndexTransaction({
      db,
      debug,
      document: result,
      embeddedChunks,
      model: embedModel,
      persistBatch,
      readStats,
      debugEnabled,
    });
  } finally {
    closeDb(db);
  }

  return {
    document: result,
    chunkCount: embeddedChunks.length,
    dimensions,
  };
}

module.exports = {
  indexWorkflow,
};
