---
name: refactor
description: This skill is used to refactor existing code when the user requests a refactor
---

## Refactor Contract

1. Preserve externally observable behavior
2. Preserve public API contracts 
3. Keep the scope focused on structural/code quality improvements, not feature work.

## Workflow

0. Abort immediately if there is uncommitted changes to tracked files in the repo.
1. Analyze the user's instructions and current implementation and define refactor scope and non-goals before editing.
2. Record a baseline by running existing validation (at minimum tests; include lint, typecheck, and build when available). Abort if baseline validation fails.
3. If coverage is insufficient for risky areas, add or improve tests before major structural changes.
4. For each major refactor task, spawn an agent using `#runSubagent`, and ensure you orchestrate them properly.
5. You are encouraged to use parallel agents to speed up development, such as when refactoring the internals of several files.
6. Prompt each agent clearly and concisely, including repo-specific coding practices when applicable.
7. Make small, incremental changes that improve readability, maintainability, cohesion, and separation of concerns.
8. Typical refactor actions include:
   - Breaking large functions/classes into focused units.
   - Renaming identifiers for clarity.
   - Removing dead or redundant code.
   - Reducing coupling and simplifying control flow.
9. Re-run relevant validation after each meaningful change and stop if regressions appear.
10. Only create branches or commits when the user asks for git operations; do not commit failing code.

## Validation Checklist

1. Targeted unit/integration tests for changed behavior paths pass.
2. Full test suite (or agreed subset) passes.
3. Lint, typecheck, and build pass when those checks exist in the repo.
4. Confirm no unintended behavior or API changes were introduced.

## Completion Output

1. Brief summary of activites performed.
