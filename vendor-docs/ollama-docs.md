# Linux

Start Ollama:

```shell  theme={"system"}
ollama serve
```

In another terminal, verify that Ollama is running:

```shell  theme={"system"}
ollama -v
```

### Start Ollama

Start Ollama and verify it is running:

```shell  theme={"system"}
sudo systemctl start ollama
sudo systemctl status ollama
```

## Customizing

To customize the installation of Ollama, you can edit the systemd service file or the environment variables by running:

```shell  theme={"system"}
sudo systemctl edit ollama
```

Alternatively, create an override file manually in `/etc/systemd/system/ollama.service.d/override.conf`:

```ini  theme={"system"}
[Service]
Environment="OLLAMA_DEBUG=1"
```
# Embeddings

> Generate text embeddings for semantic search, retrieval, and RAG.

Embeddings turn text into numeric vectors you can store in a vector database, search with cosine similarity, or use in RAG pipelines. The vector length depends on the model (typically 384–1024 dimensions).

## Recommended models

* [nomic-embed-text](https://ollama.com/library/nomic-embed-text)
* [qwen3-embedding](https://ollama.com/library/qwen3-embedding)
* [all-minilm](https://ollama.com/library/all-minilm)

## Generate embeddings

<Tabs>

  <Tab title="JavaScript">
    ```javascript  theme={"system"}
    import ollama from 'ollama'

    const single = await ollama.embed({
      model: 'nomic-embed-text',
      input: 'The quick brown fox jumps over the lazy dog.',
    })
    console.log(single.embeddings[0].length) // vector length
    ```
  </Tab>
</Tabs>

<Note>
  The `/api/embed` endpoint returns L2‑normalized (unit‑length) vectors.
</Note>

## Generate a batch of embeddings

Pass an array of strings to `input`.

<Tabs>
  <Tab title="JavaScript">
    ```javascript  theme={"system"}
    import ollama from 'ollama'

    const batch = await ollama.embed({
      model: 'nomic-embed-text',
      input: [
        'The quick brown fox jumps over the lazy dog.',
        'The five boxing wizards jump quickly.',
        'Jackdaws love my big sphinx of quartz.',
      ],
    })
    console.log(batch.embeddings.length) // number of vectors
    ```
  </Tab>
</Tabs>

## Tips

* Use cosine similarity for most semantic search use cases.
* Use the same embedding model for both indexing and querying.
