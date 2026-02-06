const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { readFromFile, readFromStdin } = require('../src/adapters');
const { withTempDir } = require('./helpers/tmp');

test('readFromFile reads UTF-8 text', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'note.txt');
    await fs.writeFile(file, 'hello');

    const payload = await readFromFile(file, process.cwd());
    assert.equal(payload.rawText, 'hello');
    assert.equal(payload.sourceDescriptor.type, 'file');
  });
});

test('readFromFile rejects binary payload', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'note.bin');
    await fs.writeFile(file, Buffer.from([0, 1, 2]));

    await assert.rejects(() => readFromFile(file, process.cwd()), /appears binary/);
  });
});

test('readFromStdin reads piped text', async () => {
  const stream = Readable.from(['hello from stdin']);
  stream.isTTY = false;

  const payload = await readFromStdin(stream);
  assert.equal(payload.rawText, 'hello from stdin');
  assert.equal(payload.sourceDescriptor.type, 'stdin');
});

test('readFromStdin rejects tty usage', async () => {
  const stream = Readable.from([]);
  stream.isTTY = true;

  await assert.rejects(() => readFromStdin(stream), /requires piped input/);
});
