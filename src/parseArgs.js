const { CliError } = require('./errors');

function usage() {
  return [
    'Usage:',
    '  notesrag index --source <path>',
    '  notesrag index --stdin',
    '',
    'Options:',
    '  --source <path>  Read plain text from one file',
    '  --stdin          Read plain text from piped stdin',
    '  --embed-model    Embedding model name (default: nomic-embed-text)',
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
  if (command !== 'index') {
    throw new CliError(`unknown command '${command}'. expected 'index'`);
  }

  let sourcePath;
  let useStdin = false;
  let embedModel = 'nomic-embed-text';

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];

    if (isHelpFlag(token)) {
      return { help: true };
    }

    if (token === '--stdin') {
      useStdin = true;
      continue;
    }

    if (token === '--source') {
      const next = rest[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliError('missing value for --source');
      }
      sourcePath = next;
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

    throw new CliError(`unknown option '${token}'`);
  }

  if (sourcePath && useStdin) {
    throw new CliError('provide exactly one input source: --source or --stdin');
  }

  if (!sourcePath && !useStdin) {
    throw new CliError('missing input source. use --source <path> or --stdin');
  }

  return {
    help: false,
    command: 'index',
    inputMode: sourcePath ? 'source' : 'stdin',
    sourcePath,
    embedModel,
  };
}

module.exports = {
  parseArgs,
  usage,
};
