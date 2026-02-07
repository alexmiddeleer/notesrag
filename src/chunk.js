const crypto = require('node:crypto');
const { CliError } = require('./errors');

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliError(`${name} must be a positive integer`);
  }
}

function buildChunkId(documentId, index, text, startChar, endChar) {
  const hash = crypto
    .createHash('sha256')
    .update(`${documentId}:${index}:${startChar}:${endChar}\n${text}`)
    .digest('hex')
    .slice(0, 16);
  return `chunk_${hash}`;
}

function chunkDocument({
  documentId,
  text,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP,
}) {
  if (typeof documentId !== 'string' || documentId.length === 0) {
    throw new CliError('document id is required for chunking');
  }
  if (typeof text !== 'string') {
    throw new CliError('chunking input text is required');
  }

  assertPositiveInteger(chunkSize, 'chunk size');
  if (!Number.isInteger(overlap) || overlap < 0) {
    throw new CliError('chunk overlap must be a non-negative integer');
  }
  if (overlap >= chunkSize) {
    throw new CliError('chunk overlap must be smaller than chunk size');
  }

  const chunks = [];
  let startChar = 0;

  while (startChar < text.length) {
    const endChar = Math.min(startChar + chunkSize, text.length);
    const chunkText = text.slice(startChar, endChar);

    if (chunkText.trim().length > 0) {
      const index = chunks.length;
      chunks.push({
        chunkId: buildChunkId(documentId, index, chunkText, startChar, endChar),
        documentId,
        index,
        text: chunkText,
        startChar,
        endChar,
      });
    }

    if (endChar === text.length) {
      break;
    }

    startChar = endChar - overlap;
  }

  return chunks;
}

module.exports = {
  chunkDocument,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
};
