const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'toy-rag-test-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = {
  withTempDir,
};
