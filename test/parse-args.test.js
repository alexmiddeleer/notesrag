const test = require('node:test');
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

test('parseArgs rejects multiple sources', () => {
  assertParseError(['index', '--stdin', '--source', 'notes.txt'], /exactly one input source/);
});

test('parseArgs rejects missing source value', () => {
  assertParseError(['index', '--source'], /missing value/);
});

test('parseArgs rejects missing embed model value', () => {
  assertParseError(['index', '--stdin', '--embed-model'], /missing value for --embed-model/);
});

test('parseArgs rejects missing mode', () => {
  assertParseError(['index'], /missing input source/);
});
