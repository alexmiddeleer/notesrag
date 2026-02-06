const { parseArgs, usage } = require('./parseArgs');
const { readFromFile, readFromStdin } = require('./adapters');
const { ingest } = require('./ingest');
const { CliError } = require('./errors');

function formatSuccess(result) {
  const source = result.sourceDescriptor.type === 'stdin'
    ? 'stdin'
    : result.sourceDescriptor.value;

  return [
    'indexed',
    `document_id=${result.documentId}`,
    `source=${source}`,
    `chars=${result.chars}`,
    `bytes=${result.bytes}`,
  ].join(' ');
}

async function executeIndex(parsed, io) {
  const payload = parsed.inputMode === 'source'
    ? await readFromFile(parsed.sourcePath, io.cwd)
    : await readFromStdin(io.stdin);

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
    const message = error instanceof CliError
      ? error.message
      : 'unexpected runtime error';

    io.stderr.write(`error: ${message}\n`);
    return error instanceof CliError ? error.exitCode : 1;
  }
}

module.exports = {
  main,
  executeIndex,
  formatSuccess,
};
