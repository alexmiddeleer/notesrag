#!/usr/bin/env node

const { resetIndex, DEFAULT_DB_PATH, DEFAULT_ARCHIVE_DIR } = require('../src/reset-index');
const { isCliError } = require('../src/errors');

function usage() {
  return [
    'Usage:',
    '  node bin/reset-index.js [--db-path <path>] [--archive-dir <path>]',
    '',
    'Options:',
    `  --db-path <path>      SQLite file path (default: ${DEFAULT_DB_PATH})`,
    `  --archive-dir <path>  Backup directory (default: ${DEFAULT_ARCHIVE_DIR})`,
    '  --help                Show command help',
  ].join('\n');
}

function parseArgs(argv) {
  let dbPath = DEFAULT_DB_PATH;
  let archiveDir = DEFAULT_ARCHIVE_DIR;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      return { help: true };
    }
    if (token === '--db-path') {
      const next = argv[index + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('missing value for --db-path');
      }
      dbPath = next;
      index += 1;
      continue;
    }
    if (token === '--archive-dir') {
      const next = argv[index + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('missing value for --archive-dir');
      }
      archiveDir = next;
      index += 1;
      continue;
    }

    throw new Error(`unknown option '${token}'`);
  }

  return {
    help: false,
    dbPath,
    archiveDir,
  };
}

function main(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const cwd = io.cwd || process.cwd();

  try {
    const parsed = parseArgs(argv);
    if (parsed.help) {
      stdout.write(`${usage()}\n`);
      return 0;
    }

    const outcome = resetIndex({
      cwd,
      dbPath: parsed.dbPath,
      archiveDir: parsed.archiveDir,
    });

    stdout.write(
      `reset complete db=${outcome.dbPath} archive=${outcome.archivePath} chunks=${outcome.before.chunks}->${outcome.after.chunks} embeddings=${outcome.before.embeddings}->${outcome.after.embeddings}\n`,
    );
    return 0;
  } catch (error) {
    const message = isCliError(error) ? error.message : error.message || 'unexpected runtime error';
    stderr.write(`error: ${message}\n`);
    return isCliError(error) ? error.exitCode : 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  main,
  parseArgs,
  usage,
};
