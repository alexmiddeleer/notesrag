const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../src/parseArgs');

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
  assert.throws(
    () => parseArgs(['index', '--stdin', '--source', 'notes.txt']),
    /exactly one input source/
  );
});

test('parseArgs rejects missing source value', () => {
  assert.throws(
    () => parseArgs(['index', '--source']),
    /missing value/
  );
});

test('parseArgs rejects missing mode', () => {
  assert.throws(
    () => parseArgs(['index']),
    /missing input source/
  );
});
