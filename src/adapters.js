const fs = require('node:fs/promises');
const path = require('node:path');
const { CliError } = require('./errors');

function decodeUtf8(buffer, sourceLabel) {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  } catch {
    throw new CliError(`${sourceLabel} is not valid UTF-8 text`);
  }
}

function hasBinarySignature(buffer) {
  return buffer.includes(0);
}

async function readFromFile(sourcePath, cwd) {
  const resolvedPath = path.resolve(cwd, sourcePath);

  let data;
  try {
    data = await fs.readFile(resolvedPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new CliError(`file not found: ${sourcePath}`);
    }
    throw new CliError(`failed to read file: ${sourcePath}`);
  }

  if (data.length === 0) {
    throw new CliError('input file is empty');
  }

  if (hasBinarySignature(data)) {
    throw new CliError('input file appears binary; expected plain text');
  }

  return {
    rawText: decodeUtf8(data, 'input file'),
    sourceDescriptor: {
      type: 'file',
      value: resolvedPath,
    },
  };
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readFromStdin(stdin) {
  if (stdin.isTTY) {
    throw new CliError('stdin mode requires piped input');
  }

  const data = await readAll(stdin);

  if (data.length === 0) {
    throw new CliError('stdin input is empty');
  }

  if (hasBinarySignature(data)) {
    throw new CliError('stdin appears binary; expected plain text');
  }

  return {
    rawText: decodeUtf8(data, 'stdin input'),
    sourceDescriptor: {
      type: 'stdin',
      value: 'stdin',
    },
  };
}

module.exports = {
  readFromFile,
  readFromStdin,
};
