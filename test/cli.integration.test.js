const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { main } = require('../src/cli');
const { CliError } = require('../src/errors');
const { withTempDir } = require('./helpers/tmp');

function ioFor({ cwd, stdinChunks = [], isTTY = false } = {}) {
  const stdin = Readable.from(stdinChunks);
  stdin.isTTY = isTTY;

  const out = { value: '' };
  const err = { value: '' };

  return {
    io: {
      cwd: cwd || process.cwd(),
      stdin,
      stdout: { write: (chunk) => { out.value += String(chunk); } },
      stderr: { write: (chunk) => { err.value += String(chunk); } },
    },
    out,
    err,
  };
}

function mockEmbedder({ dimensions = 3 } = {}) {
  return async ({ chunks }) => chunks.map((chunk) => ({
    ...chunk,
    embedding: Array(dimensions).fill(0.1),
    dimensions,
  }));
}

test('cli indexes file input', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'note.txt');
    await fs.writeFile(file, 'hello world');

    const { io, out, err } = ioFor({ cwd: dir, isTTY: true });
    const code = await main(['index', '--source', file], io, { embedChunks: mockEmbedder() });

    assert.equal(code, 0);
    assert.match(out.value, /^indexed document_id=doc_[a-f0-9]{16} source=.* chars=11 bytes=11 chunks=1 dims=3\n$/);
    assert.equal(err.value, '');
  });
});

test('cli indexes stdin input', async () => {
  const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false });
  const code = await main(['index', '--stdin'], io, { embedChunks: mockEmbedder() });

  assert.equal(code, 0);
  assert.match(out.value, /^indexed document_id=doc_[a-f0-9]{16} source=stdin chars=11 bytes=11 chunks=1 dims=3\n$/);
  assert.equal(err.value, '');
});

test('cli emits debug logs when --debug is provided', async () => {
  const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false });
  const code = await main(['index', '--stdin', '--debug'], io, { embedChunks: mockEmbedder() });

  assert.equal(code, 0);
  assert.match(out.value, /^indexed document_id=doc_[a-f0-9]{16} source=stdin chars=11 bytes=11 chunks=1 dims=3\n$/);
  assert.match(err.value, /debug: starting index input_mode=stdin embed_model=nomic-embed-text/);
  assert.match(err.value, /debug: loaded input source=stdin raw_chars=11/);
  assert.match(err.value, /debug: ingested document_id=doc_[a-f0-9]{16} chars=11 bytes=11/);
  assert.match(err.value, /debug: chunked chunks=1/);
  assert.match(err.value, /debug: embedded chunks=1/);
  assert.match(err.value, /debug: completed dimensions=3/);
});

test('cli fails when both sources are provided', async () => {
  const { io, out, err } = ioFor({ isTTY: false });
  const code = await main(['index', '--stdin', '--source', 'x.txt'], io, { embedChunks: mockEmbedder() });

  assert.notEqual(code, 0);
  assert.equal(out.value, '');
  assert.match(err.value, /^error: provide exactly one input source/);
});

test('cli fails for empty stdin', async () => {
  const { io, out, err } = ioFor({ stdinChunks: [], isTTY: false });
  const code = await main(['index', '--stdin'], io, { embedChunks: mockEmbedder() });

  assert.notEqual(code, 0);
  assert.equal(out.value, '');
  assert.match(err.value, /^error: stdin input is empty/);
});

test('cli surfaces embedding failures as cli errors', async () => {
  const failingEmbedder = async () => {
    throw new CliError('failed to reach Ollama. start it with `ollama serve` and retry');
  };

  const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false });
  const code = await main(['index', '--stdin'], io, { embedChunks: failingEmbedder });

  assert.notEqual(code, 0);
  assert.equal(out.value, '');
  assert.match(err.value, /^error: failed to reach Ollama/);
});
