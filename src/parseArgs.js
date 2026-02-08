const { CliError } = require('./errors');

function usage() {
  return [
    'Usage:',
    '  notesrag index --source <path>',
    '  notesrag index --stdin',
    '  notesrag query --text <query>',
    '  notesrag query --stdin',
    '',
    'Options:',
    '  --source <path>  Read plain text from one file',
    '  --text <query>   Query text',
    '  --stdin          Read plain text from piped stdin',
    '  --embed-model    Embedding model name (default: nomic-embed-text)',
    '  --db-path        SQLite file path (default: .data/notesrag.sqlite)',
    '  --top-k <int>    Result count for query (default: 5, range: 1..50)',
    '  --debug          Emit verbose debug logs to stderr',
    '  --help           Show command help',
  ].join('\n');
}

function isHelpFlag(token) {
  return token === '--help' || token === '-h';
}

function parseArgs(argv) {
  if (argv.length === 0 || isHelpFlag(argv[0])) {
    return { help: true };
  }

  const [command, ...rest] = argv;
  if (command !== 'index' && command !== 'query') {
    throw new CliError(`unknown command '${command}'. expected 'index' or 'query'`);
  }

  let sourcePath;
  let queryText;
  let useStdin = false;
  let embedModel = 'nomic-embed-text';
  let dbPath = '.data/notesrag.sqlite';
  let topK = 5;
  let debug = false;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];

    if (isHelpFlag(token)) {
      return { help: true };
    }

    if (token === '--stdin') {
      useStdin = true;
      continue;
    }

    if (token === '--debug') {
      debug = true;
      continue;
    }

    if (token === '--source') {
      if (command !== 'index') {
        throw new CliError(`unknown option '${token}'`);
      }
      const next = rest[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliError('missing value for --source');
      }
      sourcePath = next;
      i += 1;
      continue;
    }

    if (token === '--text') {
      if (command !== 'query') {
        throw new CliError(`unknown option '${token}'`);
      }
      const next = rest[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliError('missing value for --text');
      }
      queryText = next;
      i += 1;
      continue;
    }

    if (token === '--embed-model') {
      const next = rest[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliError('missing value for --embed-model');
      }
      embedModel = next;
      i += 1;
      continue;
    }

    if (token === '--db-path') {
      const next = rest[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliError('missing value for --db-path');
      }
      dbPath = next;
      i += 1;
      continue;
    }

    if (token === '--top-k') {
      if (command !== 'query') {
        throw new CliError(`unknown option '${token}'`);
      }
      const next = rest[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliError('missing value for --top-k');
      }
      if (!/^\d+$/.test(next)) {
        throw new CliError('--top-k must be an integer between 1 and 50');
      }
      topK = Number.parseInt(next, 10);
      if (!Number.isInteger(topK) || topK < 1 || topK > 50) {
        throw new CliError('--top-k must be an integer between 1 and 50');
      }
      i += 1;
      continue;
    }

    throw new CliError(`unknown option '${token}'`);
  }

  if (command === 'index') {
    if (sourcePath && useStdin) {
      throw new CliError('provide exactly one input source: --source or --stdin');
    }
    if (!sourcePath && !useStdin) {
      throw new CliError('missing input source. use --source <path> or --stdin');
    }
  } else {
    if (queryText && useStdin) {
      throw new CliError('provide exactly one query source: --text or --stdin');
    }
    if (!queryText && !useStdin) {
      throw new CliError('missing query input. use --text <query> or --stdin');
    }
  }

  return {
    help: false,
    command,
    inputMode: command === 'index'
      ? (sourcePath ? 'source' : 'stdin')
      : (queryText ? 'text' : 'stdin'),
    sourcePath,
    queryText,
    embedModel,
    dbPath,
    topK,
    debug,
  };
}

module.exports = {
  parseArgs,
  usage,
};
