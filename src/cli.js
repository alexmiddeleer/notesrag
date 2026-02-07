const { parseArgs, usage } = require('./parseArgs');
const { readFromFile, readFromStdin } = require('./adapters');
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
const { isCliError } = require('./errors');
const path = require('node:path');

function formatSource(sourceDescriptor) {
  return sourceDescriptor.type === 'stdin'
    ? 'stdin'
    : sourceDescriptor.value;
}

function writeText(stream, text) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof stream.write !== 'function') {
        resolve();
        return;
      }

      if (stream.write.length >= 2) {
        stream.write(text, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
        return;
      }

      const wrote = stream.write(text);
      if (wrote === false && typeof stream.once === 'function') {
        stream.once('drain', resolve);
        return;
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

async function logDebug(io, enabled, message) {
  if (!enabled) {
    return;
  }
  await writeText(io.stderr, `debug: ${message}\n`);
}

function createDebugLogger(io, enabled) {
  return async (message) => {
    await logDebug(io, enabled, message);
  };
}

function formatEmbeddedChunkForLog(embeddedChunk) {
  return JSON.stringify({
    ...embeddedChunk,
    embedding: embeddedChunk.embedding.slice(0, 25) + '...',
  });
}

function formatSuccess(result) {
  const source = formatSource(result.sourceDescriptor);

  return [
    'indexed',
    `document_id=${result.documentId}`,
    `source=${source}`,
    `chars=${result.chars}`,
    `bytes=${result.bytes}`,
    `chunks=${result.chunkCount}`,
    `dims=${result.dimensions}`,
  ].join(' ');
}

function resolveDbPath(dbPath, cwd) {
  if (path.isAbsolute(dbPath)) {
    return dbPath;
  }
  return path.resolve(cwd, dbPath);
}

async function resolvePayload(parsed, io) {
  if (parsed.inputMode === 'source') {
    return readFromFile(parsed.sourcePath, io.cwd);
  }
  return readFromStdin(io.stdin);
}

async function executeIndex(parsed, io, deps = {}) {
  const {
    embedChunks: embedder = embedChunks,
    openDatabase: openDb = openDatabase,
    initSchema: initDb = initSchema,
    persistIndexBatch: persistBatch = persistIndexBatch,
    closeDatabase: closeDb = closeDatabase,
    getDatabaseStats: readStats = getDatabaseStats,
  } = deps;
  const debug = createDebugLogger(io, parsed.debug);
  await debug(
    `starting index input_mode=${parsed.inputMode} embed_model=${parsed.embedModel}`,
  );

  const payload = await resolvePayload(parsed, io);
  await debug(
    `loaded input source=${formatSource(payload.sourceDescriptor)} raw_chars=${payload.rawText.length}`,
  );

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
    model: parsed.embedModel,
    chunks,
    host: process.env.OLLAMA_HOST,
  });
  await debug(`embedded chunks=${embeddedChunks.length}`);

  if (embeddedChunks.length > 0) {
    await debug(
      `first embedded chunk =${formatEmbeddedChunkForLog(embeddedChunks[0])}`,
    );
  }

  const dimensions = embeddedChunks.length > 0 ? embeddedChunks[0].dimensions : 0;
  await debug(`completed dimensions=${dimensions}`);

  const dbPath = resolveDbPath(parsed.dbPath, io.cwd);
  const db = openDb(dbPath);
  try {
    initDb(db);
    await debug('db transaction begin');
    try {
      persistBatch(db, {
        document: result,
        embeddedChunks,
        sourceDescriptor: result.sourceDescriptor,
        model: parsed.embedModel,
      });
      await debug('db transaction commit');
      if (parsed.debug) {
        const stats = readStats(db);
        await debug(
          `db stats documents=${stats.documents} chunks=${stats.chunks} embeddings=${stats.embeddings} vector_bytes=${stats.vectorBytes} db_size_mb=${stats.dbSizeMb.toFixed(3)}`,
        );
      }
    } catch (error) {
      await debug(`db transaction rollback error=${error.message}`);
      throw error;
    }
  } finally {
    closeDb(db);
  }

  await writeText(io.stdout, `${formatSuccess({
    ...result,
    chunkCount: embeddedChunks.length,
    dimensions,
  })}\n`);
}

async function main(argv, io, deps = {}) {
  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      await writeText(io.stdout, `${usage()}\n`);
      return 0;
    }

    await executeIndex(parsed, io, deps);
    return 0;
  } catch (error) {
    const message = isCliError(error)
      ? error.message
      : 'unexpected runtime error';

    await writeText(io.stderr, `error: ${message}\n`);
    return isCliError(error) ? error.exitCode : 1;
  }
}

module.exports = {
  main,
  executeIndex,
  formatSuccess,
};
