const assert = require('node:assert/strict');
const { chunkDocument } = require('../src/chunk');

test('chunkDocument is deterministic for same input', () => {
  const input = {
    documentId: 'doc_abc',
    text: 'abcdefghij',
    chunkSize: 4,
    overlap: 1,
  };

  const a = chunkDocument(input);
  const b = chunkDocument(input);

  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(a[0].text, 'abcd');
  assert.equal(a[1].text, 'defg');
  assert.equal(a[2].text, 'ghij');
});

test('chunkDocument tracks overlap boundaries', () => {
  const chunks = chunkDocument({
    documentId: 'doc_overlap',
    text: '0123456789',
    chunkSize: 6,
    overlap: 2,
  });

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].startChar, 0);
  assert.equal(chunks[0].endChar, 6);
  assert.equal(chunks[1].startChar, 4);
  assert.equal(chunks[1].endChar, 10);
});

test('chunkDocument handles tiny and boundary text', () => {
  const tiny = chunkDocument({
    documentId: 'doc_tiny',
    text: 'hi',
    chunkSize: 10,
    overlap: 0,
  });
  assert.equal(tiny.length, 1);

  const exact = chunkDocument({
    documentId: 'doc_exact',
    text: '1234',
    chunkSize: 4,
    overlap: 0,
  });
  assert.equal(exact.length, 1);
  assert.equal(exact[0].text, '1234');
});

test('chunkDocument rejects invalid config', () => {
  assert.throws(() => chunkDocument({
    documentId: 'doc_bad',
    text: 'abc',
    chunkSize: 4,
    overlap: 4,
  }), /overlap/);
});
