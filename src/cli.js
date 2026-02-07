const { parseArgs, usage } = require('./parseArgs');
const { readFromFile, readFromStdin } = require('./adapters');
const { ingest } = require('./ingest');
const { chunkDocument } = require('./chunk');
const { embedChunks } = require('./embed');
const { isCliError } = require('./errors');

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

async function resolvePayload(parsed, io) {
  if (parsed.inputMode === 'source') {
    return readFromFile(parsed.sourcePath, io.cwd);
  }
  return readFromStdin(io.stdin);
}

async function executeIndex(parsed, io, deps = {}) {
  const embedder = deps.embedChunks || embedChunks;
  const payload = await resolvePayload(parsed, io);

  const result = ingest({
    rawText: payload.rawText,
    sourceDescriptor: payload.sourceDescriptor,
  });

  const chunks = chunkDocument({
    documentId: result.documentId,
    text: result.normalizedText,
  });
  const embeddedChunks = await embedder({
    model: parsed.embedModel,
    chunks,
    host: process.env.OLLAMA_HOST,
  });

  const dimensions = embeddedChunks.length > 0 ? embeddedChunks[0].dimensions : 0;
  await writeText(io.stdout, `${formatSuccess({
    ...result,
    chunkCount: embeddedChunks.length,
    dimensions,
  })}\n`);
}

async function main(argv, io, deps = {}) {
  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      await writeText(io.stdout, `${usage()}\n`);
      return 0;
    }

    await executeIndex(parsed, io, deps);
    return 0;
  } catch (error) {
    const message = isCliError(error)
      ? error.message
      : 'unexpected runtime error';

    await writeText(io.stderr, `error: ${message}\n`);
    return isCliError(error) ? error.exitCode : 1;
  }
}

module.exports = {
  main,
  executeIndex,
  formatSuccess,
};
