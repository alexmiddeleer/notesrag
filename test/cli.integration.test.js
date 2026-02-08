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

function dbPathFor(dir) {
  return path.join(dir, 'notesrag.sqlite');
}

test('cli indexes file input', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'note.txt');
    await fs.writeFile(file, 'hello world');

    let captured;
    const indexWorkflow = async (options) => {
      captured = options;
      return {
        document: {
          documentId: 'doc_test_file',
          sourceDescriptor: options.payload.sourceDescriptor,
          chars: 11,
          bytes: 11,
        },
        chunkCount: 2,
        dimensions: 7,
      };
    };

    const { io, out, err } = ioFor({ cwd: dir, isTTY: true });
    const code = await main(
      ['index', '--source', file, '--db-path', dbPathFor(dir)],
      io,
      { indexWorkflow },
    );

    assert.equal(code, 0);
    assert.equal(
      out.value,
      `indexed document_id=doc_test_file source=${path.resolve(dir, 'note.txt')} chars=11 bytes=11 chunks=2 dims=7\n`,
    );
    assert.equal(err.value, '');
    assert.equal(captured.embedModel, 'nomic-embed-text');
    assert.equal(captured.dbPath, dbPathFor(dir));
    assert.equal(captured.cwd, dir);
    assert.equal(captured.payload.rawText, 'hello world');
  });
});

test('cli indexes stdin input', async () => {
  await withTempDir(async (dir) => {
    let captured;
    const indexWorkflow = async (options) => {
      captured = options;
      return {
        document: {
          documentId: 'doc_test_stdin',
          sourceDescriptor: options.payload.sourceDescriptor,
          chars: 11,
          bytes: 11,
        },
        chunkCount: 1,
        dimensions: 3,
      };
    };
    const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false, cwd: dir });
    const code = await main(
      ['index', '--stdin', '--db-path', dbPathFor(dir)],
      io,
      { indexWorkflow },
    );

    assert.equal(code, 0);
    assert.equal(
      out.value,
      'indexed document_id=doc_test_stdin source=stdin chars=11 bytes=11 chunks=1 dims=3\n',
    );
    assert.equal(err.value, '');
    assert.equal(captured.embedModel, 'nomic-embed-text');
    assert.equal(captured.dbPath, dbPathFor(dir));
    assert.equal(captured.cwd, dir);
    assert.equal(captured.payload.rawText, 'hello stdin');
  });
});

test('cli emits debug logs when --debug is provided', async () => {
  await withTempDir(async (dir) => {
    const indexWorkflow = async (options) => {
      await options.debugLog('workflow stub');
      return {
        document: {
          documentId: 'doc_test_debug',
          sourceDescriptor: options.payload.sourceDescriptor,
          chars: 11,
          bytes: 11,
        },
        chunkCount: 1,
        dimensions: 3,
      };
    };
    const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false, cwd: dir });
    const code = await main(
      ['index', '--stdin', '--debug', '--db-path', dbPathFor(dir)],
      io,
      { indexWorkflow },
    );

    assert.equal(code, 0);
    assert.equal(
      out.value,
      'indexed document_id=doc_test_debug source=stdin chars=11 bytes=11 chunks=1 dims=3\n',
    );
    assert.match(err.value, /debug: starting index input_mode=stdin embed_model=nomic-embed-text/);
    assert.match(err.value, /debug: loaded input source=stdin raw_chars=11/);
    assert.match(err.value, /debug: workflow stub/);
  });
});

test('cli fails when both sources are provided', async () => {
  const { io, out, err } = ioFor({ isTTY: false });
  const code = await main(['index', '--stdin', '--source', 'x.txt'], io, {
    indexWorkflow: async () => ({
      document: {
        documentId: 'doc_unused',
        sourceDescriptor: { type: 'stdin', value: 'stdin' },
        chars: 0,
        bytes: 0,
      },
      chunkCount: 0,
      dimensions: 0,
    }),
  });

  assert.notEqual(code, 0);
  assert.equal(out.value, '');
  assert.match(err.value, /^error: provide exactly one input source/);
});

test('cli fails for empty stdin', async () => {
  const { io, out, err } = ioFor({ stdinChunks: [], isTTY: false });
  const code = await main(['index', '--stdin'], io, {
    indexWorkflow: async () => ({
      document: {
        documentId: 'doc_unused',
        sourceDescriptor: { type: 'stdin', value: 'stdin' },
        chars: 0,
        bytes: 0,
      },
      chunkCount: 0,
      dimensions: 0,
    }),
  });

  assert.notEqual(code, 0);
  assert.equal(out.value, '');
  assert.match(err.value, /^error: stdin input is empty/);
});

test('cli surfaces embedding failures as cli errors', async () => {
  const indexWorkflow = async () => {
    throw new CliError('failed to reach Ollama. start it with `ollama serve` and retry');
  };

  const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false });
  const code = await main(['index', '--stdin'], io, { indexWorkflow });

  assert.notEqual(code, 0);
  assert.equal(out.value, '');
  assert.match(err.value, /^error: failed to reach Ollama/);
});

test('cli queries text input and prints markdown results', async () => {
  await withTempDir(async (dir) => {
    let captured;
    const queryWorkflow = async (options) => {
      captured = options;
      return {
        results: [
          {
            score: 0.987654,
            chunkId: 'chunk_a',
            documentId: 'doc_a',
            startChar: 0,
            endChar: 11,
            text: 'hello world',
            source: { type: 'file', value: '/tmp/hello.txt' },
          },
        ],
      };
    };

    const { io, out, err } = ioFor({ cwd: dir, isTTY: true });
    const code = await main(
      ['query', '--text', 'hello', '--db-path', dbPathFor(dir), '--top-k', '3'],
      io,
      { queryWorkflow },
    );

    assert.equal(code, 0);
    assert.equal(err.value, '');
    assert.match(out.value, /^## Query Results/);
    assert.match(out.value, /### 1\. score=0\.987654/);
    assert.match(out.value, /- chunk_id: chunk_a/);
    assert.match(out.value, /- document_id: doc_a/);
    assert.match(out.value, /- source: file:\/tmp\/hello\.txt/);
    assert.match(out.value, /hello world/);
    assert.equal(captured.queryText, 'hello');
    assert.equal(captured.embedModel, 'nomic-embed-text');
    assert.equal(captured.dbPath, dbPathFor(dir));
    assert.equal(captured.topK, 3);
    assert.equal(captured.cwd, dir);
  });
});

test('cli query supports stdin and no-result success path', async () => {
  await withTempDir(async (dir) => {
    const queryWorkflow = async (options) => {
      assert.equal(options.queryText, 'hello stdin');
      return { results: [] };
    };
    const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false, cwd: dir });
    const code = await main(
      ['query', '--stdin', '--db-path', dbPathFor(dir)],
      io,
      { queryWorkflow },
    );

    assert.equal(code, 0);
    assert.equal(out.value, 'No relevant documents were found.\n');
    assert.equal(err.value, '');
  });
});

test('cli query emits debug logs when --debug is provided', async () => {
  await withTempDir(async (dir) => {
    const queryWorkflow = async (options) => {
      await options.debugLog('query workflow stub');
      return { results: [] };
    };
    const { io, out, err } = ioFor({ stdinChunks: ['hello stdin'], isTTY: false, cwd: dir });
    const code = await main(
      ['query', '--stdin', '--debug', '--db-path', dbPathFor(dir)],
      io,
      { queryWorkflow },
    );

    assert.equal(code, 0);
    assert.equal(out.value, 'No relevant documents were found.\n');
    assert.match(err.value, /debug: starting query input_mode=stdin embed_model=nomic-embed-text top_k=5/);
    assert.match(err.value, /debug: loaded query source=stdin raw_chars=11/);
    assert.match(err.value, /debug: query workflow stub/);
  });
});
