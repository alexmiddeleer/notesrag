const path = require('node:path');
const { embedChunks } = require('./embed');
const {
  openDatabase,
  initSchema,
  closeDatabase,
  listEmbeddingRowsByModel,
  unpackFloat32,
} = require('./db');
const { normalizeText } = require('./ingest');
const { CliError } = require('./errors');

function resolveDbPath(dbPath, cwd) {
  if (path.isAbsolute(dbPath)) {
    return dbPath;
  }
  return path.resolve(cwd, dbPath);
}

function assertVectorPair(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    throw new CliError('embedding vectors must be arrays');
  }
  if (left.length === 0 || right.length === 0) {
    throw new CliError('embedding vectors must not be empty');
  }
  if (left.length !== right.length) {
    throw new CliError('embedding dimensions did not match for query scoring');
  }
}

function cosineSimilarity(left, right) {
  assertVectorPair(left, right);

  let dot = 0;
  let leftNormSq = 0;
  let rightNormSq = 0;

  for (let i = 0; i < left.length; i += 1) {
    const lv = left[i];
    const rv = right[i];
    if (!Number.isFinite(lv) || !Number.isFinite(rv)) {
      throw new CliError('embedding vectors must contain finite numbers');
    }

    dot += lv * rv;
    leftNormSq += lv * lv;
    rightNormSq += rv * rv;
  }

  if (leftNormSq === 0 || rightNormSq === 0) {
    throw new CliError('embedding vectors must be non-zero');
  }

  const leftUnit = Math.abs(leftNormSq - 1) < 1e-3;
  const rightUnit = Math.abs(rightNormSq - 1) < 1e-3;
  if (leftUnit && rightUnit) {
    return dot;
  }

  return dot / (Math.sqrt(leftNormSq) * Math.sqrt(rightNormSq));
}

function normalizeQueryText(rawQueryText) {
  if (typeof rawQueryText !== 'string') {
    throw new CliError('query text is required');
  }

  const normalized = normalizeText(rawQueryText).trim();
  if (normalized.length === 0) {
    throw new CliError('query text is empty after normalization');
  }

  return normalized;
}

function rankCandidates({ queryVector, rows, topK }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const scored = rows.map((row) => {
    const candidateVector = unpackFloat32(row.vector_blob, row.dimensions);
    if (candidateVector.length !== queryVector.length) {
      throw new CliError(
        `dimension mismatch between query embedding (${queryVector.length}) and stored embedding (${candidateVector.length})`,
      );
    }

    return {
      score: cosineSimilarity(queryVector, candidateVector),
      chunkId: row.chunk_id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      startChar: row.start_char,
      endChar: row.end_char,
      text: row.text,
      dimensions: row.dimensions,
      source: {
        type: row.source_type,
        value: row.source_value,
      },
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.documentId !== b.documentId) {
      return a.documentId.localeCompare(b.documentId);
    }
    return a.chunkIndex - b.chunkIndex;
  });

  return scored.slice(0, topK);
}

async function embedQuery({ queryText, model, host, embedder }) {
  const embedded = await embedder({
    model,
    host,
    chunks: [{
      chunkId: 'query',
      documentId: 'query',
      index: 0,
      startChar: 0,
      endChar: queryText.length,
      text: queryText,
    }],
  });

  if (!Array.isArray(embedded) || embedded.length !== 1) {
    throw new CliError('query embedding did not return exactly one vector');
  }

  return embedded[0].embedding;
}

async function queryWorkflow(options, deps = {}) {
  const {
    queryText,
    embedModel,
    dbPath,
    topK,
    cwd,
    debugLog,
    ollamaHost,
  } = options;
  const {
    embedChunks: embedder = embedChunks,
    openDatabase: openDb = openDatabase,
    initSchema: initDb = initSchema,
    listEmbeddingRowsByModel: listRows = listEmbeddingRowsByModel,
    closeDatabase: closeDb = closeDatabase,
  } = deps;
  const debug = typeof debugLog === 'function' ? debugLog : async () => {};

  if (!Number.isInteger(topK) || topK <= 0) {
    throw new CliError('top-k must be a positive integer');
  }

  const normalizedQuery = normalizeQueryText(queryText);
  await debug(`query chars=${normalizedQuery.length}`);
  const queryVector = await embedQuery({
    queryText: normalizedQuery,
    model: embedModel,
    host: ollamaHost,
    embedder,
  });
  await debug(`query embedding dimensions=${queryVector.length}`);

  const resolvedDbPath = resolveDbPath(dbPath, cwd);
  const db = openDb(resolvedDbPath);

  try {
    initDb(db);
    const rows = listRows(db, { model: embedModel });
    await debug(`query candidates=${rows.length}`);
    if (rows.length === 0) {
      return {
        queryText: normalizedQuery,
        model: embedModel,
        dimensions: queryVector.length,
        totalCandidates: 0,
        results: [],
      };
    }

    const startedAt = process.hrtime.bigint();
    const results = rankCandidates({ queryVector, rows, topK });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const topScore = results.length > 0 ? results[0].score : null;
    await debug(
      `query scored top_k=${results.length} elapsed_ms=${elapsedMs.toFixed(2)} top_score=${topScore === null ? 'n/a' : topScore.toFixed(6)}`,
    );

    return {
      queryText: normalizedQuery,
      model: embedModel,
      dimensions: queryVector.length,
      totalCandidates: rows.length,
      results,
    };
  } finally {
    closeDb(db);
  }
}

module.exports = {
  queryWorkflow,
  cosineSimilarity,
};
