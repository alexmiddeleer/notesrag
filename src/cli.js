const { parseArgs, usage } = require('./parseArgs');
const { readFromFile, readFromStdin } = require('./adapters');
const { indexWorkflow } = require('./index');
const { queryWorkflow } = require('./query');
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

function formatQueryResultsMarkdown(outcome) {
  if (!Array.isArray(outcome.results) || outcome.results.length === 0) {
    return 'No relevant documents were found.\n';
  }

  const lines = ['## Query Results', ''];
  outcome.results.forEach((result, index) => {
    lines.push(`### ${index + 1}. score=${result.score.toFixed(6)}`);
    lines.push(`- chunk_id: ${result.chunkId}`);
    lines.push(`- document_id: ${result.documentId}`);
    lines.push(`- source: ${result.source.type}:${result.source.value}`);
    lines.push(`- chunk_range: ${result.startChar}-${result.endChar}`);
    lines.push('');
    lines.push(result.text);
    lines.push('');
  });

  return `${lines.join('\n').trimEnd()}\n`;
}

async function executeQuery(parsed, io, deps = {}) {
  const { queryWorkflow: injectedWorkflow, ...workflowDeps } = deps;
  const workflow = injectedWorkflow || queryWorkflow;
  const debug = createDebugLogger(io, parsed.debug);

  await debug(
    `starting query input_mode=${parsed.inputMode} embed_model=${parsed.embedModel} top_k=${parsed.topK}`,
  );

  let queryText;
  if (parsed.inputMode === 'stdin') {
    const payload = await readFromStdin(io.stdin);
    queryText = payload.rawText;
    await debug(`loaded query source=stdin raw_chars=${queryText.length}`);
  } else {
    queryText = parsed.queryText;
    await debug(`loaded query source=text raw_chars=${queryText.length}`);
  }

  const outcome = await workflow(
    {
      queryText,
      embedModel: parsed.embedModel,
      dbPath: parsed.dbPath,
      topK: parsed.topK,
      cwd: io.cwd,
      debugLog: debug,
      ollamaHost: process.env.OLLAMA_HOST,
    },
    workflowDeps,
  );

  await writeText(io.stdout, formatQueryResultsMarkdown(outcome));
}

async function main(argv, io, deps = {}) {
  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      await writeText(io.stdout, `${usage()}\n`);
      return 0;
    }

    if (parsed.command === 'index') {
      await executeIndex(parsed, io, deps);
    } else {
      await executeQuery(parsed, io, deps);
    }
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
  executeQuery,
  formatSuccess,
  formatQueryResultsMarkdown,
};
