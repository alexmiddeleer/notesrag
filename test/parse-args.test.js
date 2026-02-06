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
});

test('parseArgs rejects multiple sources', () => {
  assertParseError(['index', '--stdin', '--source', 'notes.txt'], /exactly one input source/);
});

test('parseArgs rejects missing source value', () => {
  assertParseError(['index', '--source'], /missing value/);
});

test('parseArgs rejects missing mode', () => {
  assertParseError(['index'], /missing input source/);
});
