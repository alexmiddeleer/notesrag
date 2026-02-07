const ollama = require('ollama');
const { CliError } = require('./errors');

const DEFAULT_EMBED_MODEL = 'nomic-embed-text';

function buildClient(host) {
  const defaultClient = ollama.default;

  if (host) {
    return new ollama.Ollama({ host });
  }
  if (defaultClient && typeof defaultClient.embed === 'function') {
    return defaultClient;
  }
  return ollama;
}

function errorMessage(error) {
  return error && error.message ? error.message : 'unknown error';
}

function isMissingModelError(error) {
  const message = String(error && error.message ? error.message : '').toLowerCase();
  return message.includes('model') && message.includes('not found');
}

function isUnreachableError(error) {
  const code = String(error && error.code ? error.code : '');
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    return true;
  }

  const message = String(error && error.message ? error.message : '').toLowerCase();
  return (
    message.includes('fetch failed')
    || message.includes('connect econnrefused')
    || message.includes('connection refused')
  );
}

function assertVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new CliError('embedding response contained an empty vector');
  }

  for (const value of vector) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new CliError('embedding response contained non-numeric values');
    }
  }
}

function resolveEmbeddings(response, expectedLength) {
  const vectors = response && response.embeddings;
  if (!Array.isArray(vectors)) {
    throw new CliError('embedding response is missing embeddings');
  }
  if (vectors.length !== expectedLength) {
    throw new CliError('embedding response did not match chunk count');
  }

  return vectors;
}

function mapEmbeddingsToChunks(chunks, vectors) {
  return chunks.map((chunk, index) => {
    const embedding = vectors[index];
    assertVector(embedding);

    return {
      ...chunk,
      embedding,
      dimensions: embedding.length,
    };
  });
}

async function embedChunks({ chunks, model = DEFAULT_EMBED_MODEL, host, client }) {
  if (!Array.isArray(chunks)) {
    throw new CliError('embedding chunks must be an array');
  }
  if (chunks.length === 0) {
    return [];
  }

  const texts = chunks.map((chunk) => chunk.text);
  const embedClient = client || buildClient(host);

  let response;
  try {
    response = await embedClient.embed({ model, input: texts });
  } catch (error) {
    if (isUnreachableError(error)) {
      throw new CliError('failed to reach Ollama. start it with `ollama serve` and retry');
    }
    if (isMissingModelError(error)) {
      throw new CliError(`embedding model not found: ${model}. run \`ollama pull ${model}\``);
    }
    throw new CliError(`embedding request failed: ${errorMessage(error)}`);
  }

  const vectors = resolveEmbeddings(response, chunks.length);
  return mapEmbeddingsToChunks(chunks, vectors);
}

module.exports = {
  embedChunks,
  DEFAULT_EMBED_MODEL,
};
