const { parseArgs, usage } = require('./parseArgs');
const { readFromFile, readFromStdin } = require('./adapters');
const { ingest } = require('./ingest');
const { isCliError } = require('./errors');

function formatSource(sourceDescriptor) {
  return sourceDescriptor.type === 'stdin'
    ? 'stdin'
    : sourceDescriptor.value;
}

function formatSuccess(result) {
  const source = formatSource(result.sourceDescriptor);

  return [
    'indexed',
    `document_id=${result.documentId}`,
    `source=${source}`,
    `chars=${result.chars}`,
    `bytes=${result.bytes}`,
  ].join(' ');
}

async function resolvePayload(parsed, io) {
  if (parsed.inputMode === 'source') {
    return readFromFile(parsed.sourcePath, io.cwd);
  }
  return readFromStdin(io.stdin);
}

async function executeIndex(parsed, io) {
  const payload = await resolvePayload(parsed, io);

  const result = ingest({
    rawText: payload.rawText,
    sourceDescriptor: payload.sourceDescriptor,
  });

  io.stdout.write(`${formatSuccess(result)}\n`);
}

async function main(argv, io) {
  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      io.stdout.write(`${usage()}\n`);
      return 0;
    }

    await executeIndex(parsed, io);
    return 0;
  } catch (error) {
    const message = isCliError(error)
      ? error.message
      : 'unexpected runtime error';

    io.stderr.write(`error: ${message}\n`);
    return isCliError(error) ? error.exitCode : 1;
  }
}

module.exports = {
  main,
  executeIndex,
  formatSuccess,
};
