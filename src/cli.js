const { parseArgs, usage } = require('./parseArgs');
const { readFromFile, readFromStdin } = require('./adapters');
const { indexWorkflow } = require('./index');
const { isCliError } = require('./errors');
const {
  createDebugLogger,
  formatSource,
  formatSuccess,
  writeText,
} = require('./cli-helpers');

async function resolvePayload(parsed, io) {
  if (parsed.inputMode === 'source') {
    return readFromFile(parsed.sourcePath, io.cwd);
  }
  return readFromStdin(io.stdin);
}

async function executeIndex(parsed, io, deps = {}) {
  const { indexWorkflow: injectedWorkflow, ...workflowDeps } = deps;
  const workflow = injectedWorkflow || indexWorkflow;
  const debug = createDebugLogger(io, parsed.debug);
  await debug(
    `starting index input_mode=${parsed.inputMode} embed_model=${parsed.embedModel}`,
  );

  const payload = await resolvePayload(parsed, io);
  await debug(
    `loaded input source=${formatSource(payload.sourceDescriptor)} raw_chars=${payload.rawText.length}`,
  );
  const outcome = await workflow(
    {
      payload,
      embedModel: parsed.embedModel,
      dbPath: parsed.dbPath,
      cwd: io.cwd,
      debugEnabled: parsed.debug,
      debugLog: debug,
      ollamaHost: process.env.OLLAMA_HOST,
    },
    workflowDeps,
  );

  await writeText(io.stdout, `${formatSuccess({
    ...outcome.document,
    chunkCount: outcome.chunkCount,
    dimensions: outcome.dimensions,
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
