const assert = require('node:assert/strict');
const { parseArgs } = require('../src/parseArgs');

function assertParseError(args, pattern) {
  assert.throws(() => parseArgs(args), pattern);
}

test('parseArgs accepts --source', () => {
  const parsed = parseArgs(['index', '--source', 'notes.txt']);
  assert.equal(parsed.inputMode, 'source');
  assert.equal(parsed.sourcePath, 'notes.txt');
});

test('parseArgs accepts --stdin', () => {
  const parsed = parseArgs(['index', '--stdin']);
  assert.equal(parsed.inputMode, 'stdin');
  assert.equal(parsed.embedModel, 'nomic-embed-text');
  assert.equal(parsed.dbPath, '.data/notesrag.sqlite');
  assert.equal(parsed.debug, false);
});

test('parseArgs accepts --embed-model override', () => {
  const parsed = parseArgs(['index', '--stdin', '--embed-model', 'all-minilm']);
  assert.equal(parsed.embedModel, 'all-minilm');
});

test('parseArgs accepts --debug', () => {
  const parsed = parseArgs(['index', '--stdin', '--debug']);
  assert.equal(parsed.debug, true);
});

test('parseArgs accepts --db-path override', () => {
  const parsed = parseArgs(['index', '--stdin', '--db-path', '/tmp/notesrag.sqlite']);
  assert.equal(parsed.dbPath, '/tmp/notesrag.sqlite');
});

test('parseArgs rejects multiple sources', () => {
  assertParseError(['index', '--stdin', '--source', 'notes.txt'], /exactly one input source/);
});

test('parseArgs rejects missing source value', () => {
  assertParseError(['index', '--source'], /missing value/);
});

test('parseArgs rejects missing embed model value', () => {
  assertParseError(['index', '--stdin', '--embed-model'], /missing value for --embed-model/);
});

test('parseArgs rejects missing db path value', () => {
  assertParseError(['index', '--stdin', '--db-path'], /missing value for --db-path/);
});

test('parseArgs rejects missing mode', () => {
  assertParseError(['index'], /missing input source/);
});

test('parseArgs accepts query --text input', () => {
  const parsed = parseArgs(['query', '--text', 'hello world']);
  assert.equal(parsed.command, 'query');
  assert.equal(parsed.inputMode, 'text');
  assert.equal(parsed.queryText, 'hello world');
  assert.equal(parsed.topK, 5);
  assert.equal(parsed.embedModel, 'nomic-embed-text');
  assert.equal(parsed.dbPath, '.data/notesrag.sqlite');
  assert.equal(parsed.debug, false);
});

test('parseArgs accepts query --stdin input', () => {
  const parsed = parseArgs(['query', '--stdin']);
  assert.equal(parsed.command, 'query');
  assert.equal(parsed.inputMode, 'stdin');
  assert.equal(parsed.queryText, undefined);
});

test('parseArgs accepts query --top-k override', () => {
  const parsed = parseArgs(['query', '--text', 'hello', '--top-k', '9']);
  assert.equal(parsed.topK, 9);
});

test('parseArgs rejects query with both text and stdin', () => {
  assertParseError(['query', '--text', 'hello', '--stdin'], /exactly one query source/);
});

test('parseArgs rejects query with no source', () => {
  assertParseError(['query'], /missing query input/);
});

test('parseArgs rejects query missing --text value', () => {
  assertParseError(['query', '--text'], /missing value for --text/);
});

test('parseArgs rejects invalid --top-k', () => {
  assertParseError(['query', '--text', 'hello', '--top-k', '0'], /--top-k must be an integer between 1 and 50/);
  assertParseError(['query', '--text', 'hello', '--top-k', '51'], /--top-k must be an integer between 1 and 50/);
  assertParseError(['query', '--text', 'hello', '--top-k', '1.5'], /--top-k must be an integer between 1 and 50/);
});

test('parseArgs rejects index-only options on query', () => {
  assertParseError(['query', '--text', 'hello', '--source', 'x.txt'], /unknown option '--source'/);
});
