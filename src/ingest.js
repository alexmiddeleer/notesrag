const crypto = require('node:crypto');
const { CliError } = require('./errors');

const MAX_CHARS = 10000;

function normalizeText(rawText) {
  const unixLines = rawText.replace(/\r\n?/g, '\n');
  return unixLines.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function buildDocId(sourceDescriptor, text) {
  const hash = crypto
    .createHash('sha256')
    .update(`${sourceDescriptor.type}:${sourceDescriptor.value}\n${text}`)
    .digest('hex')
    .slice(0, 16);
  return `doc_${hash}`;
}

function ingest(request) {
  if (!request || typeof request !== 'object') {
    throw new CliError('invalid ingest request');
  }

  const { rawText, sourceDescriptor, metadata = {} } = request;

  if (typeof rawText !== 'string') {
    throw new CliError('raw text is required');
  }

  if (!sourceDescriptor || typeof sourceDescriptor !== 'object') {
    throw new CliError('source descriptor is required');
  }

  const text = normalizeText(rawText);
  if (text.trim().length === 0) {
    throw new CliError('input text is empty after normalization');
  }

  if (text.length > MAX_CHARS) {
    throw new CliError(`input exceeds max size of ${MAX_CHARS} characters`);
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  const chars = text.length;
  const documentId = buildDocId(sourceDescriptor, text);

  return {
    documentId,
    chars,
    bytes,
    normalizedText: text,
    sourceDescriptor,
    metadata,
  };
}

module.exports = {
  ingest,
  MAX_CHARS,
  normalizeText,
};
