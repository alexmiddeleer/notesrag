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

function buildTextPayload({ data, sourceDescriptor, decodeLabel, emptyMessage, binaryMessage }) {
  if (data.length === 0) {
    throw new CliError(emptyMessage);
  }

  if (hasBinarySignature(data)) {
    throw new CliError(binaryMessage);
  }

  return {
    rawText: decodeUtf8(data, decodeLabel),
    sourceDescriptor,
  };
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

  return buildTextPayload({
    data,
    sourceDescriptor: {
      type: 'file',
      value: resolvedPath,
    },
    decodeLabel: 'input file',
    emptyMessage: 'input file is empty',
    binaryMessage: 'input file appears binary; expected plain text',
  });
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

  return buildTextPayload({
    data,
    sourceDescriptor: {
      type: 'stdin',
      value: 'stdin',
    },
    decodeLabel: 'stdin input',
    emptyMessage: 'stdin input is empty',
    binaryMessage: 'stdin appears binary; expected plain text',
  });
}

module.exports = {
  readFromFile,
  readFromStdin,
};
