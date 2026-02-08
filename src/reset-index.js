const fs = require('node:fs');
const path = require('node:path');
const {
  openDatabase,
  initSchema,
  closeDatabase,
  getDatabaseStats,
} = require('./db');
const { CliError } = require('./errors');

const DEFAULT_DB_PATH = '.data/notesrag.sqlite';
const DEFAULT_ARCHIVE_DIR = '.archives';

function resolvePath(value, cwd) {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(cwd, value);
}

function timestampForFilename(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function buildArchivePath(dbPath, archiveDir, now = new Date()) {
  const parsed = path.parse(dbPath);
  const extension = parsed.ext || '.sqlite';
  const baseName = parsed.ext ? parsed.name : parsed.base;
  const archiveName = `${baseName}-${timestampForFilename(now)}${extension}`;
  return path.join(archiveDir, archiveName);
}

function resetIndex({
  cwd = process.cwd(),
  dbPath = DEFAULT_DB_PATH,
  archiveDir = DEFAULT_ARCHIVE_DIR,
  now = new Date(),
} = {}, deps = {}) {
  const {
    existsSync = fs.existsSync,
    mkdirSync = fs.mkdirSync,
    copyFileSync = fs.copyFileSync,
    openDatabase: openDb = openDatabase,
    initSchema: initDb = initSchema,
    closeDatabase: closeDb = closeDatabase,
    getDatabaseStats: readStats = getDatabaseStats,
  } = deps;

  const resolvedDbPath = resolvePath(dbPath, cwd);
  const resolvedArchiveDir = resolvePath(archiveDir, cwd);

  if (!existsSync(resolvedDbPath)) {
    throw new CliError(`database not found at ${resolvedDbPath}`);
  }

  mkdirSync(resolvedArchiveDir, { recursive: true });
  const archivePath = buildArchivePath(resolvedDbPath, resolvedArchiveDir, now);
  copyFileSync(resolvedDbPath, archivePath);

  const db = openDb(resolvedDbPath);
  try {
    initDb(db);
    const before = readStats(db);
    const clearTx = db.transaction(() => {
      db.prepare('DELETE FROM embeddings').run();
      db.prepare('DELETE FROM chunks').run();
    });
    clearTx();
    const after = readStats(db);
    return {
      dbPath: resolvedDbPath,
      archivePath,
      before,
      after,
    };
  } finally {
    closeDb(db);
  }
}

module.exports = {
  DEFAULT_DB_PATH,
  DEFAULT_ARCHIVE_DIR,
  resolvePath,
  buildArchivePath,
  resetIndex,
};
