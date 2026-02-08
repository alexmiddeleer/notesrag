const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withTempDir } = require('./helpers/tmp');
const { resetIndex } = require('../src/reset-index');

test('resetIndex archives db and clears chunks and embeddings', async () => {
  await withTempDir(async (dir) => {
    const dbPath = path.join(dir, 'notesrag.sqlite');
    const archiveDir = path.join(dir, '.archives');
    const originalBytes = Buffer.from('fake sqlite bytes');
    fs.writeFileSync(dbPath, originalBytes);

    const state = { documents: 1, chunks: 1, embeddings: 1 };
    const fakeDb = {
      transaction(fn) {
        return () => fn();
      },
      prepare(sql) {
        if (sql.includes('DELETE FROM embeddings')) {
          return {
            run() {
              state.embeddings = 0;
            },
          };
        }
        if (sql.includes('DELETE FROM chunks')) {
          return {
            run() {
              state.chunks = 0;
            },
          };
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
    };

    let openCalledWith;
    let closedWith;

    const outcome = resetIndex({
      cwd: dir,
      dbPath,
      archiveDir,
      now: new Date('2026-02-08T10:15:30.456Z'),
    }, {
      openDatabase: (resolvedPath) => {
        openCalledWith = resolvedPath;
        return fakeDb;
      },
      initSchema: () => {},
      closeDatabase: (db) => {
        closedWith = db;
      },
      getDatabaseStats: () => ({ ...state }),
    });

    assert.equal(openCalledWith, dbPath);
    assert.equal(closedWith, fakeDb);
    assert.equal(outcome.before.documents, 1);
    assert.equal(outcome.before.chunks, 1);
    assert.equal(outcome.before.embeddings, 1);
    assert.equal(outcome.after.documents, 1);
    assert.equal(outcome.after.chunks, 0);
    assert.equal(outcome.after.embeddings, 0);
    assert.ok(fs.existsSync(outcome.archivePath));
    assert.match(path.basename(outcome.archivePath), /^notesrag-2026-02-08T10-15-30-456Z\.sqlite$/);
    assert.deepEqual(fs.readFileSync(outcome.archivePath), originalBytes);
    assert.deepEqual(fs.readFileSync(dbPath), originalBytes);
  });
});

test('resetIndex throws when database is missing', async () => {
  await withTempDir(async (dir) => {
    assert.throws(() => {
      resetIndex({
        cwd: dir,
        dbPath: 'missing.sqlite',
      });
    }, /database not found/);
  });
});
