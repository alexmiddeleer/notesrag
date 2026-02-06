const test = require('node:test');
const assert = require('node:assert/strict');
const { ingest, MAX_CHARS, normalizeText } = require('../src/ingest');

const stdinDescriptor = { type: 'stdin', value: 'stdin' };

function assertIngestError(payload, pattern) {
  assert.throws(() => ingest(payload), pattern);
}

test('normalizeText converts CRLF and strips dangerous control chars', () => {
  const value = normalizeText('a\r\nb\u0001c');
  assert.equal(value, 'a\nbc');
});

test('ingest returns stable shape with generated document id', () => {
  const result = ingest({
    rawText: 'hello world',
    sourceDescriptor: { type: 'file', value: '/tmp/note.txt' },
  });

  assert.match(result.documentId, /^doc_[a-f0-9]{16}$/);
  assert.equal(result.chars, 11);
  assert.equal(result.bytes, 11);
});

test('ingest rejects empty text after normalization', () => {
  assertIngestError(
    { rawText: '\u0001\u0002', sourceDescriptor: stdinDescriptor },
    /empty after normalization/
  );
});

test('ingest rejects oversized text', () => {
  const payload = 'x'.repeat(MAX_CHARS + 1);
  assertIngestError({ rawText: payload, sourceDescriptor: stdinDescriptor }, /exceeds max size/);
});
