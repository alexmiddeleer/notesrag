const test = require('node:test');
const assert = require('node:assert/strict');
const { embedChunks } = require('../src/embed');

test('embedChunks maps embeddings to chunks in order', async () => {
  const chunks = [
    { chunkId: 'chunk_1', text: 'hello' },
    { chunkId: 'chunk_2', text: 'world' },
  ];
  const mockClient = {
    embed: async ({ model, input }) => {
      assert.equal(model, 'nomic-embed-text');
      assert.deepEqual(input, ['hello', 'world']);
      return {
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
      };
    },
  };

  const result = await embedChunks({ model: 'nomic-embed-text', chunks, client: mockClient });
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].embedding, [0.1, 0.2, 0.3]);
  assert.equal(result[0].dimensions, 3);
});

test('embedChunks errors on malformed payload size mismatch', async () => {
  const chunks = [{ chunkId: 'chunk_1', text: 'hello' }];
  const mockClient = {
    embed: async () => ({ embeddings: [] }),
  };

  await assert.rejects(
    () => embedChunks({ chunks, client: mockClient }),
    /did not match chunk count/
  );
});

test('embedChunks maps unreachable server errors', async () => {
  const chunks = [{ chunkId: 'chunk_1', text: 'hello' }];
  const mockClient = {
    embed: async () => {
      const error = new Error('fetch failed');
      error.code = 'ECONNREFUSED';
      throw error;
    },
  };

  await assert.rejects(
    () => embedChunks({ chunks, client: mockClient }),
    /start it with `ollama serve`/
  );
});

test('embedChunks maps missing model errors', async () => {
  const chunks = [{ chunkId: 'chunk_1', text: 'hello' }];
  const mockClient = {
    embed: async () => {
      throw new Error('model "nomic-embed-text" not found');
    },
  };

  await assert.rejects(
    () => embedChunks({ model: 'nomic-embed-text', chunks, client: mockClient }),
    /ollama pull nomic-embed-text/
  );
});
