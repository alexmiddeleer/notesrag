const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { CliError } = require('./errors');

const SCHEMA_VERSION = '1';

function openDatabase(dbPath) {
  if (typeof dbPath !== 'string' || dbPath.length === 0) {
    throw new CliError('db path is required');
  }

  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

function initSchema(db) {
  if (!db) {
    throw new CliError('db instance is required');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      document_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_value TEXT NOT NULL,
      chars INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      normalized_text TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      chunk_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_char INTEGER NOT NULL,
      end_char INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY(document_id) REFERENCES documents(document_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vector_blob BLOB NOT NULL,
      FOREIGN KEY(chunk_id) REFERENCES chunks(chunk_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS chunks_document_id_chunk_index
      ON chunks(document_id, chunk_index);

    CREATE INDEX IF NOT EXISTS embeddings_model_dimensions
      ON embeddings(model, dimensions);
  `);

  db.prepare(`
    INSERT INTO schema_meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run('schema_version', SCHEMA_VERSION);
}

function assertDimensions(vector, expected) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new CliError('embedding vector is empty');
  }

  if (typeof expected === 'number' && vector.length !== expected) {
    throw new CliError('embedding vector dimensions did not match expected');
  }

  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CliError('embedding vector must contain finite numbers');
    }
  }
}

function packFloat32(vector) {
  assertDimensions(vector);

  const buffer = Buffer.allocUnsafe(vector.length * 4);
  vector.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer;
}

function assertDocument(document) {
  if (!document || typeof document !== 'object') {
    throw new CliError('document payload is required');
  }
  if (typeof document.documentId !== 'string' || document.documentId.length === 0) {
    throw new CliError('document id is required');
  }
  if (typeof document.normalizedText !== 'string') {
    throw new CliError('document normalized text is required');
  }
  if (!Number.isInteger(document.chars) || document.chars < 0) {
    throw new CliError('document chars must be a non-negative integer');
  }
  if (!Number.isInteger(document.bytes) || document.bytes < 0) {
    throw new CliError('document bytes must be a non-negative integer');
  }
}

function assertChunk(chunk, expectedDimensions) {
  if (!chunk || typeof chunk !== 'object') {
    throw new CliError('chunk payload is required');
  }
  if (typeof chunk.chunkId !== 'string' || chunk.chunkId.length === 0) {
    throw new CliError('chunk id is required');
  }
  if (typeof chunk.documentId !== 'string' || chunk.documentId.length === 0) {
    throw new CliError('chunk document id is required');
  }
  if (!Number.isInteger(chunk.index) || chunk.index < 0) {
    throw new CliError('chunk index must be a non-negative integer');
  }
  if (!Number.isInteger(chunk.startChar) || chunk.startChar < 0) {
    throw new CliError('chunk start char must be a non-negative integer');
  }
  if (!Number.isInteger(chunk.endChar) || chunk.endChar < 0) {
    throw new CliError('chunk end char must be a non-negative integer');
  }
  if (typeof chunk.text !== 'string') {
    throw new CliError('chunk text is required');
  }
  if (!Array.isArray(chunk.embedding)) {
    throw new CliError('chunk embedding is required');
  }

  const dimensions = Number.isInteger(chunk.dimensions)
    ? chunk.dimensions
    : chunk.embedding.length;

  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new CliError('embedding dimensions must be a positive integer');
  }

  assertDimensions(chunk.embedding, expectedDimensions ?? dimensions);

  return dimensions;
}

function persistIndexBatch(db, {
  document,
  embeddedChunks,
  sourceDescriptor,
  model,
}) {
  if (!db) {
    throw new CliError('db instance is required');
  }

  assertDocument(document);

  if (!Array.isArray(embeddedChunks)) {
    throw new CliError('embedded chunks are required');
  }

  const source = sourceDescriptor || document.sourceDescriptor;
  if (!source || typeof source !== 'object') {
    throw new CliError('source descriptor is required');
  }
  if (typeof source.type !== 'string' || typeof source.value !== 'string') {
    throw new CliError('source descriptor is invalid');
  }
  if (typeof model !== 'string' || model.length === 0) {
    throw new CliError('embedding model is required');
  }

  const expectedDimensions = embeddedChunks.length > 0
    ? (Number.isInteger(embeddedChunks[0].dimensions)
      ? embeddedChunks[0].dimensions
      : embeddedChunks[0].embedding.length)
    : 0;

  const insertDocument = db.prepare(`
    INSERT INTO documents (
      document_id,
      source_type,
      source_value,
      chars,
      bytes,
      normalized_text,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      source_type = excluded.source_type,
      source_value = excluded.source_value,
      chars = excluded.chars,
      bytes = excluded.bytes,
      normalized_text = excluded.normalized_text,
      updated_at = excluded.updated_at
  `);

  const deleteEmbeddings = db.prepare(`
    DELETE FROM embeddings
    WHERE chunk_id IN (
      SELECT chunk_id FROM chunks WHERE document_id = ?
    )
  `);

  const deleteChunks = db.prepare('DELETE FROM chunks WHERE document_id = ?');

  const insertChunk = db.prepare(`
    INSERT INTO chunks (
      chunk_id,
      document_id,
      chunk_index,
      start_char,
      end_char,
      text
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEmbedding = db.prepare(`
    INSERT INTO embeddings (
      chunk_id,
      model,
      dimensions,
      vector_blob
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(chunk_id) DO UPDATE SET
      model = excluded.model,
      dimensions = excluded.dimensions,
      vector_blob = excluded.vector_blob
  `);

  const now = new Date().toISOString();
  const writeTx = db.transaction(() => {
    insertDocument.run(
      document.documentId,
      source.type,
      source.value,
      document.chars,
      document.bytes,
      document.normalizedText,
      now,
    );

    deleteEmbeddings.run(document.documentId);
    deleteChunks.run(document.documentId);

    for (const chunk of embeddedChunks) {
      const dimensions = assertChunk(chunk, expectedDimensions || undefined);
      const vectorBlob = packFloat32(chunk.embedding);

      insertChunk.run(
        chunk.chunkId,
        chunk.documentId,
        chunk.index,
        chunk.startChar,
        chunk.endChar,
        chunk.text,
      );

      insertEmbedding.run(
        chunk.chunkId,
        model,
        dimensions,
        vectorBlob,
      );
    }
  });

  writeTx();
}

function closeDatabase(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

function getDatabaseStats(db) {
  if (!db) {
    throw new CliError('db instance is required');
  }

  const docCount = db.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
  const chunkCount = db.prepare('SELECT COUNT(*) AS count FROM chunks').get().count;
  const embedCount = db.prepare('SELECT COUNT(*) AS count FROM embeddings').get().count;
  const vectorBytes = db.prepare('SELECT COALESCE(SUM(LENGTH(vector_blob)), 0) AS total FROM embeddings').get().total;
  const pageCount = db.pragma('page_count', { simple: true }) || 0;
  const pageSize = db.pragma('page_size', { simple: true }) || 0;
  const dbSizeBytes = pageCount * pageSize;
  const dbSizeMb = dbSizeBytes / (1024 * 1024);

  return {
    documents: docCount,
    chunks: chunkCount,
    embeddings: embedCount,
    vectorBytes,
    dbSizeBytes,
    dbSizeMb,
  };
}

module.exports = {
  openDatabase,
  initSchema,
  persistIndexBatch,
  closeDatabase,
  packFloat32,
  assertDimensions,
  getDatabaseStats,
};
