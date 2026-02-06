# Plan: Flowchart Step A-B (User/Shell/Editor -> index CLI)

## Overview
Implement the ingest entrypoint that lets a user provide plain text data from shell/editor workflows and reliably hand it off to an `index` CLI command. Scope is strictly the A-B edge in `README.md`: input acquisition, command surface, validation, and handoff contract to downstream indexing pipeline.
The CLI program for this plan must be implemented in Node.js.

## Fixed Decisions (From Answers)
- Runtime: use project-provided Node from `mise.toml` (`node = 24.13.0`).
- CLI name: `notesrag`.
- MVP input scope: single source per invocation.
- MVP success output: plain text (not JSON).
- Input size cap: 10,000 characters.
- Document IDs: auto-generated only.

## Goals
- Define and implement a stable `index` command interface.
- Accept plain text input from common user paths (args and stdin).
- Validate and normalize input envelope before pipeline internals run.
- Emit deterministic output and errors so later pipeline steps can plug in cleanly.
- Use Node.js runtime and conventions for CLI architecture, IO, and packaging.

## Deliverables
- Node.js-based `index` CLI command with documented usage.
- Input adapter for:
  - file path arguments
  - stdin (piped content)
- Input validation rules and user-facing error messages.
- Handoff contract from CLI layer to indexing pipeline boundary.
- Basic tests for command behavior and failure modes.
- README update for quickstart examples.

## Implementation Steps
1. Define CLI contract (done)
- Choose command shape (done): `notesrag index [--source PATH | --stdin]` with exactly one source per run.
- Decide exit code policy (done) (`0` success, non-zero for validation/runtime errors).
- Define stdout/stderr behavior (done): plain-text success output on stdout; diagnostics on stderr.

2. Define ingestion boundary interface
- Create a minimal internal API in Node.js (example): `ingest(request) -> ingest_result`.
- Keep this boundary independent from chunking/embedding internals.
- Specify required request fields: raw text, source descriptor, optional metadata.

3. Implement input adapters (A-side)
- File adapter: read one or more text files via Node.js filesystem APIs, reject binary/empty payloads per rules.
- Stdin adapter: detect piped input and read full stream safely using Node.js streams.
- Editor workflow support: document temp-file/path usage pattern (editor saves file, CLI indexes file).

4. Add validation and normalization
- Normalize line endings and trim dangerous control chars.
- Enforce max input size guardrails (hard limit: 10,000 characters).
- Validate encoding assumptions (UTF-8 default).
- Produce actionable, consistent validation errors.

5. Implement command execution path (B-side)
- Parse args/options.
- Resolve exactly one input source strategy (file or stdin) and reject multi-source input.
- Build ingest request and call the ingestion boundary.
- Return plain-text success response with source summary + bytes/chars ingested + auto-generated document ID.

6. Add tests
- Unit tests for arg parsing and validation behavior.
- Adapter tests: file success/failure, stdin success/empty input.
- CLI integration tests for exit codes and stdout/stderr contracts.

7. Document usage
- Add README section “Index CLI (A-B step)” with 3-4 command examples.
- Include failure examples and expected error style.

## Acceptance Criteria
- User can ingest plain text by file path and by stdin via `index` command.
- Command accepts only one input source per invocation.
- Invalid input paths/empty input/encoding issues fail with clear non-zero exits.
- Inputs over 10,000 characters fail with a clear validation error.
- Success output is deterministic and script-friendly.
- Ingestion boundary can be reused by later pipeline stages without CLI coupling.
- Tests cover primary success and at least key error paths.
- Implementation runs on the project-provided Node version from `mise.toml`.

## Risks and Mitigations
- Ambiguous input mode when both file and stdin are provided.
  - Mitigation: enforce mutually exclusive source flags with explicit error.
- Large input causing memory spikes.
  - Mitigation: enforce size limit and fail early with guidance.
- Future pipeline changes breaking CLI contract.
  - Mitigation: keep interface typed/versioned and test it as a stable contract.

## Resolved Assumptions
- Node runtime is taken from `mise.toml` (no distribution-level Node support matrix needed now).
- Canonical executable name is `notesrag`.
- MVP indexing is one source per invocation.
- MVP success output format is plain text.
- Max input size is 10,000 characters.
- Document IDs are auto-generated.
