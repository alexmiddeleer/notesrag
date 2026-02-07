function formatSource(sourceDescriptor) {
  return sourceDescriptor.type === 'stdin'
    ? 'stdin'
    : sourceDescriptor.value;
}

function writeText(stream, text) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof stream.write !== 'function') {
        resolve();
        return;
      }

      if (stream.write.length >= 2) {
        stream.write(text, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
        return;
      }

      const wrote = stream.write(text);
      if (wrote === false && typeof stream.once === 'function') {
        stream.once('drain', resolve);
        return;
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

async function logDebug(io, enabled, message) {
  if (!enabled) {
    return;
  }
  await writeText(io.stderr, `debug: ${message}\n`);
}

function createDebugLogger(io, enabled) {
  return async (message) => {
    await logDebug(io, enabled, message);
  };
}

function formatEmbeddedChunkForLog(embeddedChunk) {
  return JSON.stringify({
    ...embeddedChunk,
    embedding: embeddedChunk.embedding.slice(0, 25) + '...',
  });
}

function formatSuccess(result) {
  const source = formatSource(result.sourceDescriptor);

  return [
    'indexed',
    `document_id=${result.documentId}`,
    `source=${source}`,
    `chars=${result.chars}`,
    `bytes=${result.bytes}`,
    `chunks=${result.chunkCount}`,
    `dims=${result.dimensions}`,
  ].join(' ');
}

module.exports = {
  createDebugLogger,
  formatEmbeddedChunkForLog,
  formatSource,
  formatSuccess,
  writeText,
};
