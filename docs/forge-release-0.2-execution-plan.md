# FORGE Release 0.2 Execution Plan

## Purpose
This document converts the broader architectural implementation spec into an exact execution plan for Release 0.2.

Release 0.2 is the foundation-hardening release. Its purpose is to make FORGE safe, testable, and internally consistent before deeper workflow and platform expansion begins.

## Release 0.2 goals
- Add runtime validation for persisted Forge state and config
- Centralize CLI error handling and remove direct `process.exit()` from command modules
- Clean up build/tooling inconsistencies left from the tsup-to-tsdown migration
- Establish a consistent repo validation pipeline

## Out of scope for Release 0.2
- Shared executor abstraction
- Planning engine replacement
- Parallel wave execution
- MCP server
- Dynamic adapter loading
- Run record system

---

# 1. Release 0.2 deliverables

## Deliverable A — Runtime schema validation layer
FORGE gains runtime schemas and validation helpers for persisted models.

## Deliverable B — Validating StateManager
All major state reads and writes are schema-enforced.

## Deliverable C — Centralized CLI error boundary
Command handlers stop terminating the process directly.

## Deliverable D — Build/tooling cleanup
The repo no longer contains stale tsup migration debris, and scripts are normalized.

## Deliverable E — Validation pipeline
The repo has clear scripts for build/typecheck/test/lint and a CI workflow.

---

# 2. Execution order

Implementation should proceed in this order:
1. Add runtime schemas in `packages/types`
2. Integrate validation into `StateManager` and related readers
3. Introduce CLI error model and top-level command runner
4. Refactor commands to stop calling `process.exit()`
5. Clean build artifacts and normalize scripts
6. Add/normalize lint/typecheck/test workflow
7. Add/update tests

This order minimizes rework because schema-backed errors should exist before command-level error handling is finalized.

---

# 3. Concrete file plan

## 3.1 `packages/types`

### Files to edit
- `packages/types/src/config.ts`
- `packages/types/src/state.ts`
- `packages/types/src/task.ts`
- `packages/types/src/review.ts`
- `packages/types/src/verifier.ts`
- `packages/types/src/context.ts`
- `packages/types/src/index.ts`
- `packages/types/package.json`

### Files to create
- `packages/types/src/schema-utils.ts`
- `packages/types/src/validation.ts`

### Required changes

#### `packages/types/src/schema-utils.ts`
Create reusable helpers for:
- enum schema construction if helpful
- ISO date string validation helper
- record/object validation helpers
- parse helper result typing

#### `packages/types/src/validation.ts`
Export:
- `ForgeValidationError`
- `parseWithSchema<T>()`
- `safeParseWithSchema<T>()`
- validation result types

#### `packages/types/src/config.ts`
Add runtime schema for:
- `VerifierConfigEntry`
- `ForgeConfig`
- nested config sections
- `DEFAULT_CONFIG` compatibility checks if desired

#### `packages/types/src/state.ts`
Add schemas for:
- `ProjectState`
- `ArchitectureState`
- `Decision`
- `Dependency`
- `Risk`
- `ExecutionState`
- `Phase`
- `ContextState`

#### `packages/types/src/task.ts`
Add schemas for:
- `AcceptanceCriterion`
- `TestRequirement`
- `Evidence`
- `FileChange`
- `TestRunResult`
- `CriterionStatus`
- `ExecutorResult`
- `Task`

#### `packages/types/src/review.ts`
Add schemas for:
- `ChecklistItem`
- `ReviewArtifact`

#### `packages/types/src/verifier.ts`
Add schemas for:
- `CheckResult`
- `EvidenceArtifact`
- `Issue`
- `VerificationResult`
- `VerificationPlan` if persisted/consumed from disk

#### `packages/types/src/context.ts`
Add schemas for:
- `Digest`
- `ContextPackSections`
- `ContextPack`
- `SnapshotData`
- `Snapshot`

#### `packages/types/src/index.ts`
Re-export:
- schemas
- validation helpers
- validation error class

#### `packages/types/package.json`
Add runtime schema dependency.
Recommended options:
- `zod` for ergonomics and widespread familiarity
- `valibot` if bundle size is a concern

Recommended default: `zod`

---

## 3.2 `packages/core`

### Files to edit
- `packages/core/src/state-manager.ts`
- `packages/core/src/context-engine.ts`
- `packages/core/src/review-engine.ts`
- `packages/core/src/index.ts`
- `packages/core/package.json`

### Required changes

#### `packages/core/src/state-manager.ts`
Refactor `readJson<T>()` into schema-backed read helpers.

Add explicit methods or a schema map for:
- config
- project state
- architecture state
- execution state
- context state
- task
- decision

Replace:
- unchecked generic `readJson<T>()`

With something like:
- `readValidatedJson(filePath, schema, defaultValue)`
- `writeValidatedJson(filePath, schema, data)`

Requirements:
- missing files may still return default values where appropriate
- corrupt files must throw `ForgeValidationError`
- write path validates before serialization
- error includes file path and top-level reason

#### `packages/core/src/context-engine.ts`
Validate snapshot payloads during restore.

Update:
- `restoreSnapshot()`

Requirements:
- reject malformed snapshots before writing any restored state
- do not partially restore invalid snapshot data

#### `packages/core/src/review-engine.ts`
Validate review artifacts when loading from disk.

Update:
- `getReview()`
- `listReviews()`

#### `packages/core/src/index.ts`
Re-export any new validation-related helpers only if core should expose them.

---

## 3.3 `packages/cli`

### Files to edit
- `packages/cli/src/index.ts`
- `packages/cli/src/commands/config.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/src/commands/execute.ts`
- `packages/cli/src/commands/init.ts`
- `packages/cli/src/commands/install.ts`
- `packages/cli/src/commands/intake.ts`
- `packages/cli/src/commands/merge.ts`
- `packages/cli/src/commands/plan.ts`
- `packages/cli/src/commands/qa.ts`
- `packages/cli/src/commands/review.ts`
- `packages/cli/src/commands/restore.ts`
- `packages/cli/src/commands/ship.ts`
- `packages/cli/src/commands/snapshot.ts`
- `packages/cli/src/commands/status.ts`
- `packages/cli/src/utils/logger.ts`
- `packages/cli/package.json`
- `packages/cli/tsconfig.json`

### Files to create
- `packages/cli/src/errors.ts`
- `packages/cli/src/command-runner.ts`
- optionally `packages/cli/src/services/` directory, but keep Release 0.2 minimal unless needed for refactor clarity

### Required changes

#### `packages/cli/src/errors.ts`
Define CLI-facing errors:
- `CliUsageError`
- `CliPreconditionError`
- `CliNotFoundError`
- `CliStateError`
- `CliValidationError`
- `CliInternalError`

Each should support:
- message
- exitCode
- optional details

#### `packages/cli/src/command-runner.ts`
Create a small wrapper to execute command actions.
Responsibilities:
- invoke async command body
- catch known errors
- render user-facing error output
- set `process.exitCode` instead of calling `process.exit()`
- preserve `--json` behavior where relevant

#### `packages/cli/src/index.ts`
Use centralized error wrapping around command registration/actions where practical.
At minimum:
- ensure uncaught errors become consistent CLI output
- use `process.exitCode`, not direct exits at command definition level

#### All command files
Replace direct `process.exit(1)` usage.

Pattern to replace:
- `logger.error(...)`
- `process.exit(1)`

With:
- throw a structured CLI error

Examples:
- missing `.forge` directory -> `CliPreconditionError`
- invalid task id -> `CliNotFoundError`
- unmet workflow phase -> `CliPreconditionError`
- no tasks ready -> `CliStateError`

#### `packages/cli/src/utils/logger.ts`
Add helpers if needed for centralized error formatting.
Keep Release 0.2 minimal; this is not yet the structured logging release.

---

## 3.4 Root repo / tooling

### Files to edit
- `/package.json`
- `/README.md` only if scripts/docs become misleading and require correction; avoid unless necessary
- package-level `package.json` files where scripts are inconsistent

### Files to create
- `/.github/workflows/ci.yml`
- optional lint/format config files depending on chosen tooling

### Files/directories to remove
Across packages, remove stale artifacts where safe:
- `tsup.config.d.ts`
- `tsup.config.d.ts.map`
- `tsup.config.js`
- `tsup.config.js.map`
- `.tsup/`
- generated `vitest.config.js` / `vitest.config.d.ts` files if the canonical source is `vitest.config.ts`

### Script normalization requirements
#### Root `package.json`
Ensure scripts include:
- `build`
- `typecheck`
- `test`
- `lint`
- `clean`

Recommended minimal script set:
- `build`: existing workspace build
- `typecheck`: `tsc --build --pretty false`
- `test`: existing vitest run
- `lint`: either ESLint/Biome or `npm run typecheck && npm run test` if lint tool is deferred

#### Package `package.json` files
Normalize `dev` script usage if still referencing `tsup --watch`.
For Release 0.2:
- either replace with `tsdown --watch` where supported
- or replace with `tsc --build --watch` for consistency

### CI workflow requirements
Workflow should run:
- install dependencies
- build
- typecheck
- test

Optional in Release 0.2:
- lint

---

# 4. Detailed implementation checklist

## Step 1 — Add schema dependency and validation helpers
- [ ] Add runtime schema library to `packages/types/package.json`
- [ ] Create `packages/types/src/schema-utils.ts`
- [ ] Create `packages/types/src/validation.ts`
- [ ] Export validation helpers from `packages/types/src/index.ts`

## Step 2 — Add schemas for all core persisted models
- [ ] Add config schemas in `packages/types/src/config.ts`
- [ ] Add state schemas in `packages/types/src/state.ts`
- [ ] Add task schemas in `packages/types/src/task.ts`
- [ ] Add review schemas in `packages/types/src/review.ts`
- [ ] Add verifier schemas in `packages/types/src/verifier.ts`
- [ ] Add context/snapshot schemas in `packages/types/src/context.ts`

## Step 3 — Integrate validation into core I/O
- [ ] Refactor `StateManager` read path to validate loaded JSON
- [ ] Refactor `StateManager` write path to validate before writing
- [ ] Validate snapshot restore in `ContextEngine`
- [ ] Validate review artifact reads in `ReviewEngine`

## Step 4 — Add CLI error model
- [ ] Create `packages/cli/src/errors.ts`
- [ ] Create `packages/cli/src/command-runner.ts`
- [ ] Add top-level error handling in `packages/cli/src/index.ts`

## Step 5 — Remove direct process exits from command modules
- [ ] Refactor `init.ts`
- [ ] Refactor `install.ts`
- [ ] Refactor `doctor.ts`
- [ ] Refactor `intake.ts`
- [ ] Refactor `status.ts`
- [ ] Refactor `plan.ts`
- [ ] Refactor `execute.ts`
- [ ] Refactor `merge.ts`
- [ ] Refactor `review.ts`
- [ ] Refactor `qa.ts`
- [ ] Refactor `ship.ts`
- [ ] Refactor `snapshot.ts`
- [ ] Refactor `restore.ts`
- [ ] Refactor `config.ts`

## Step 6 — Build cleanup
- [ ] Remove stale `tsup` generated files from all packages
- [ ] Remove `.tsup/` directories where obsolete
- [ ] Remove stale generated Vitest config outputs where source `.ts` exists
- [ ] Normalize package `dev` scripts
- [ ] Add `typecheck` script at root

## Step 7 — CI
- [ ] Add `.github/workflows/ci.yml`
- [ ] Ensure CI runs install/build/typecheck/test

## Step 8 — Tests
- [ ] Add schema validation tests in `packages/types/__tests__/`
- [ ] Extend `packages/core/__tests__/state-manager.test.ts`
- [ ] Extend `packages/core/__tests__/context-engine.test.ts`
- [ ] Extend `packages/core/__tests__/review-engine.test.ts`
- [ ] Add CLI error handling tests in `packages/cli/__tests__/`
- [ ] Update command tests to assert thrown/handled errors instead of process exit behavior

---

# 5. Test plan for Release 0.2

## `packages/types/__tests__/`
### Add
- `validation.test.ts`
  - valid config parses
  - invalid config fails with structured details
  - valid task parses
  - invalid task fails
  - valid snapshot parses
  - invalid snapshot fails

## `packages/core/__tests__/state-manager.test.ts`
### Add coverage for
- invalid config file on disk
- invalid task file on disk
- write rejection for invalid data shape
- default values still returned for missing files

## `packages/core/__tests__/context-engine.test.ts`
### Add coverage for
- invalid snapshot restore rejects before any writes
- valid snapshot restore still succeeds

## `packages/core/__tests__/review-engine.test.ts`
### Add coverage for
- malformed review artifact in reviews dir
- list/get review validation behavior

## `packages/cli/__tests__/commands.test.ts`
### Update coverage for
- command failures produce expected exit codes/messages
- command modules no longer call `process.exit()` directly
- centralized error boundary handles known and unknown errors

---

# 6. Commit-by-commit implementation plan

## Commit 1
### Message
`feat(types): add runtime validation helpers and model schemas`

### Scope
- add schema dependency
- create validation helpers
- add schemas to `config.ts`, `state.ts`, `task.ts`, `review.ts`, `verifier.ts`, `context.ts`
- export from `index.ts`
- add schema unit tests

### Verification
- run package tests for `packages/types`
- run root typecheck

## Commit 2
### Message
`feat(core): validate Forge state and snapshot artifacts at I/O boundaries`

### Scope
- refactor `StateManager`
- validate snapshot restore in `ContextEngine`
- validate review reads in `ReviewEngine`
- add/extend core tests

### Verification
- run `packages/core` tests
- run root typecheck

## Commit 3
### Message
`refactor(cli): add centralized command error handling`

### Scope
- create `errors.ts`
- create `command-runner.ts`
- update `index.ts`
- update command test scaffolding

### Verification
- run `packages/cli` tests
- verify CLI behavior for one known error path

## Commit 4
### Message
`refactor(cli): remove direct process exits from command modules`

### Scope
- refactor all command files to throw structured errors
- update tests to assert handled error output/exit codes

### Verification
- run `packages/cli` tests
- run root tests

## Commit 5
### Message
`chore(build): clean tsup migration artifacts and normalize scripts`

### Scope
- remove stale generated artifacts
- normalize `dev` scripts
- add `typecheck` script
- fix package script inconsistencies

### Verification
- run clean build from scratch
- run root typecheck
- run root tests

## Commit 6
### Message
`ci: add release 0.2 validation workflow`

### Scope
- add GitHub Actions workflow
- ensure build/typecheck/test run cleanly in CI

### Verification
- local dry run of listed commands
- inspect workflow syntax

---

# 7. Recommended implementation constraints

- Do not refactor executor architecture in this release
- Do not mix planning engine work into schema/error cleanup
- Do not introduce broad logging changes yet; keep logging changes narrowly focused on error consistency
- Keep command refactors surgical; avoid changing core command semantics unless required by the error architecture
- Preserve current JSON output behavior as much as possible

---

# 8. Definition of done for Release 0.2

Release 0.2 is complete when:
- persisted Forge state and config are runtime-validated
- invalid files are rejected with actionable errors
- no command module directly calls `process.exit()`
- CLI errors are handled consistently at the top level
- stale tsup migration artifacts are removed
- build/typecheck/test commands are normalized
- CI is present and runs the validation pipeline
- tests cover the new validation and error flows

---

# 9. Immediate next action after approval

Start with Commit 1:
- add `zod`
- create validation helpers
- define schemas for all persisted models
- add schema tests

That first step unlocks the rest of the Release 0.2 work without forcing architectural churn elsewhere.
