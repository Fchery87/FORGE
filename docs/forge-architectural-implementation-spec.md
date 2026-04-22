# FORGE Architectural Implementation Spec

## Document purpose
This spec converts the FORGE architectural review into a concrete implementation program. It defines the technical scope, rollout order, package-level changes, file-level changes, new abstractions, success criteria, and recommended commit structure required to move FORGE from its current 0.1.x state to a hardened, extensible, production-grade orchestration system.

## Primary goals
- Add runtime safety at all persisted state boundaries
- Eliminate duplicated executor logic across adapters
- Refactor CLI command architecture for testability and maintainability
- Improve observability, logging, and execution reliability
- Replace placeholder planning with a real planning engine
- Evolve FORGE into a stronger platform via standard host artifacts, plugin loading, and MCP exposure

## Non-goals
- Building a web dashboard in the first implementation wave
- Rewriting the current layered architecture
- Introducing remote state storage in the first implementation wave
- Replacing the Forge workflow model with a generic agent graph framework

## Guiding principles
- Preserve the existing package boundaries where possible: `types -> core -> adapters -> cli`
- Add runtime validation only at system boundaries, not indiscriminately
- Extract duplicated logic before adding new host/adaptation features
- Prefer incremental delivery over a large rewrite
- Keep state transitions explicit and auditable
- Make failures diagnosable from artifacts on disk

---

# 1. Current-state issues being addressed

## Critical
1. Persisted JSON state is parsed without runtime validation.
2. Executor implementations duplicate most subprocess and result parsing logic.

## High severity
1. `process.exit()` is scattered throughout command handlers.
2. Executor stderr is discarded, making failures hard to debug.
3. Skill instruction loading uses synchronous file I/O.
4. `forge plan` produces only a stub task rather than a usable task graph.
5. Build migration artifacts from `tsup` remain in the tree.

## Medium severity
1. `forge execute --wave` does not execute work in parallel.
2. Context budget accounting is simplistic and monotonic.
3. Multi-step command mutations can leave partially updated state.
4. Commands are too large and difficult to test.

---

# 2. Target architecture

## Desired system shape
FORGE remains a layered monorepo, but with stronger internal platforms:

- `@forge-core/types`
  - TypeScript interfaces
  - runtime schemas
  - parsing/validation helpers
- `@forge-core/core`
  - state manager
  - planning engine
  - task graph validation
  - execution scheduler
  - policy/gate logic
  - run recording
- `@forge-core/adapter-utils` (new)
  - shared subprocess executor primitives
  - output parsing helpers
  - adapter diagnostics utilities
- `@forge-core/adapter-*`
  - thin host-specific executors/installers
- `@forge-core/cli`
  - command registration
  - command service layer
  - centralized error handling
  - terminal/JSON formatting
- `@forge-core/mcp-server` (later)
  - MCP tool surface over Forge state/actions

## New internal architecture additions
- Runtime schema validation layer
- Shared executor base/utilities package
- Command service layer
- Run/log artifact model
- Planning engine + DAG validator
- Execution scheduler for wave dispatch
- Standard host artifact generation including `AGENTS.md`

---

# 3. Implementation program

## Epic A — Runtime safety and state integrity
Priority: P0

### Objectives
- Validate all persisted state and config at runtime
- Prevent malformed JSON from entering the core engine
- Produce actionable validation errors

### Package changes
#### `packages/types`
Add runtime schemas for:
- `ForgeConfig`
- `ProjectState`
- `ArchitectureState`
- `ExecutionState`
- `ContextState`
- `Task`
- `ExecutorResult`
- `Decision`
- `ReviewArtifact`
- `VerificationResult`
- `Snapshot`

### File-level changes
#### Edit
- `packages/types/src/config.ts`
  - add schema export for config
- `packages/types/src/state.ts`
  - add schemas for project, architecture, execution, context, decision, risk, dependency
- `packages/types/src/task.ts`
  - add schemas for task-related models
- `packages/types/src/review.ts`
  - add review schema
- `packages/types/src/verifier.ts`
  - add verification schemas
- `packages/types/src/context.ts`
  - add snapshot/context schemas where needed
- `packages/types/src/index.ts`
  - re-export schemas and validation helpers

#### Optional new files
- `packages/types/src/schema-utils.ts`
  - common parse helpers
- `packages/types/src/errors.ts`
  - validation error model if kept at type boundary

### Core integration changes
#### Edit
- `packages/core/src/state-manager.ts`
  - replace raw `JSON.parse` return path with schema-backed parsing
  - validate before writes
  - improve corrupt file errors with path + field detail
- `packages/core/src/context-engine.ts`
  - validate restored snapshot payloads
- `packages/core/src/review-engine.ts`
  - validate review reads

### Success criteria
- Invalid state files fail fast with precise errors
- No unchecked persisted JSON enters the core engine
- Unit tests cover malformed file scenarios

### Recommended commits
1. `feat(types): add runtime schemas for persisted Forge models`
2. `feat(core): validate persisted state and snapshots at I/O boundaries`

---

## Epic B — Executor abstraction and diagnostics
Priority: P0

### Objectives
- Remove duplicated executor logic
- Standardize subprocess execution and result extraction
- Capture diagnostics artifacts for debugging

### New package
#### Create
- `packages/adapter-utils/`

### Proposed contents
#### New files
- `packages/adapter-utils/src/base-executor.ts`
- `packages/adapter-utils/src/subprocess.ts`
- `packages/adapter-utils/src/result-parser.ts`
- `packages/adapter-utils/src/prompt.ts`
- `packages/adapter-utils/src/diagnostics.ts`
- `packages/adapter-utils/src/index.ts`

### Shared abstractions
#### `BaseExecutor`
Responsibilities:
- normalize config parsing
- create prompt payloads
- spawn subprocess with timeout
- collect stdout/stderr
- write temp files if needed
- normalize failure responses
- persist optional diagnostic artifacts

#### `SubprocessRunResult`
Fields:
- `stdout`
- `stderr`
- `exitCode`
- `timedOut`
- `enoent`
- `spawnError`
- `durationMs`

#### `parseJsonLastLine()`
Shared helper for Claude/OpenCode-like result extraction.

### Adapter refactors
#### Edit
- `packages/adapter-claude-code/src/claude-code-executor.ts`
- `packages/adapter-codex/src/codex-executor.ts`
- `packages/adapter-opencode/src/opencode-executor.ts`

Each adapter should only define:
- adapter name
- binary name
- argument strategy
- prompt wrapper differences
- output-file strategy differences for Codex
- install help text

### CLI/runtime integration
#### Edit
- `packages/cli/src/commands/execute.ts`
  - provide log/run context to executor if needed

### Success criteria
- Shared execution logic centralized
- Stderr and execution metadata are captured
- Adapter code size is substantially reduced
- Existing executor tests are updated and passing

### Recommended commits
3. `feat(adapter-utils): introduce shared subprocess and result parsing primitives`
4. `refactor(adapters): migrate executors onto shared execution base`
5. `feat(adapters): capture stderr and runtime diagnostics for executor runs`

---

## Epic C — CLI command architecture cleanup
Priority: P0

### Objectives
- Remove direct process termination from command handlers
- Make commands thin and testable
- Centralize error-to-exit-code behavior

### New CLI structure
#### Create
- `packages/cli/src/services/`

#### New files
- `packages/cli/src/services/execute-service.ts`
- `packages/cli/src/services/review-service.ts`
- `packages/cli/src/services/qa-service.ts`
- `packages/cli/src/services/ship-service.ts`
- `packages/cli/src/services/plan-service.ts`
- `packages/cli/src/services/merge-service.ts`
- `packages/cli/src/errors.ts`
- `packages/cli/src/command-runner.ts`

### File-level changes
#### Edit
- `packages/cli/src/index.ts`
  - add top-level error boundary and exit code handling
- `packages/cli/src/commands/execute.ts`
- `packages/cli/src/commands/review.ts`
- `packages/cli/src/commands/qa.ts`
- `packages/cli/src/commands/ship.ts`
- `packages/cli/src/commands/plan.ts`
- `packages/cli/src/commands/merge.ts`
- `packages/cli/src/commands/config.ts`
- `packages/cli/src/commands/install.ts`
- `packages/cli/src/commands/doctor.ts`

Command files should:
- parse options
- call a service
- delegate output formatting
- never call `process.exit()` directly

### Error model
Examples:
- `CliUsageError`
- `ForgePreconditionError`
- `ForgeValidationError`
- `ForgeAdapterError`
- `ForgePolicyError`
- `ForgeNotFoundError`

### Success criteria
- Command handlers become thin wrappers
- Exit behavior is centralized
- Command flows are unit-testable without mocking process exit

### Recommended commits
6. `refactor(cli): centralize command error handling and exit behavior`
7. `refactor(cli): extract command service layer for core workflows`

---

## Epic D — Logging, run artifacts, and execution reliability
Priority: P1

### Objectives
- Make every meaningful run diagnosable
- Improve resilience around interrupted or partial operations
- Add a durable execution trail

### New state/artifact model
#### Create
- `packages/types/src/run.ts`
- `packages/core/src/run-recorder.ts`

### Run record model
Fields:
- `run_id`
- `command`
- `task_ids`
- `started_at`
- `completed_at`
- `status`
- `adapter`
- `verifiers`
- `artifacts`
- `error_summary`

### Forge artifact directories
#### Add under `.forge/`
- `logs/`
- `runs/`

### File-level changes
#### Edit
- `packages/cli/src/utils/logger.ts`
  - support structured fields
- `packages/cli/src/commands/execute.ts`
- `packages/cli/src/commands/review.ts`
- `packages/cli/src/commands/qa.ts`
- `packages/cli/src/commands/ship.ts`
- `packages/core/src/context-engine.ts`
  - possibly attach run references into context state

### Minimal reliability layer
Before long operations:
- create a run record
During operations:
- update phase/status
On completion/failure:
- finalize record with artifacts and outcome

### Success criteria
- Failures leave useful logs in `.forge/logs/`
- Long-running operations create durable run metadata
- Debugging does not depend on reproducing failures live

### Recommended commits
8. `feat(core): add run record model for command execution lifecycle`
9. `feat(cli): persist logs and run artifacts under .forge`

---

## Epic E — Planning engine and task graph validation
Priority: P1

### Objectives
- Turn `forge plan` into a real planning command
- Generate a task graph instead of a placeholder task
- Validate task dependencies before execution begins

### New planning domain
#### Create
- `packages/types/src/plan.ts`
- `packages/core/src/planning-engine.ts`
- `packages/core/src/task-graph.ts`

### Planning engine responsibilities
- transform goals/constraints into phases
- generate tasks per phase
- derive acceptance criteria and test requirements
- attach dependencies
- validate graph before persistence
- optionally support deterministic mode and AI-assisted mode

### DAG validator responsibilities
- cycle detection
- missing dependency references
- duplicate task identity prevention
- unreachable task detection
- invalid phase/task associations

### File-level changes
#### Edit
- `packages/cli/src/commands/plan.ts`
  - replace placeholder task creation with planning engine invocation
- `packages/core/src/task-engine.ts`
  - support graph-aware bulk task creation if needed
- `packages/core/src/orchestrator.ts`
  - update any planning precondition assumptions if necessary

### Rollout strategy
#### Stage 1
Deterministic planning:
- template-driven phase/task generation
- no host/executor dependency

#### Stage 2
AI-assisted planning:
- optional use of configured executor to draft plan
- validate result before persistence

### Success criteria
- `forge plan` can produce a usable multi-task plan
- Invalid task graphs are rejected before being written
- Execution can start immediately after planning in common workflows

### Recommended commits
10. `feat(core): add planning engine and task graph validator`
11. `feat(cli): upgrade forge plan to generate executable task graphs`

---

## Epic F — Parallel wave execution and context accounting
Priority: P1

### Objectives
- Make wave execution match its interface promise
- Improve scheduling and budget visibility

### New scheduler
#### Create
- `packages/core/src/execution-scheduler.ts`

### Scheduler responsibilities
- compute ready task sets
- apply bounded concurrency
- protect dependency order
- aggregate results and failures
- support future retry policies

### File-level changes
#### Edit
- `packages/cli/src/commands/execute.ts`
  - use scheduler for `--wave`
- `packages/core/src/context-engine.ts`
  - track per-pack, per-session, possibly per-run token usage
- `packages/types/src/context.ts`
  - extend budget model

### Context accounting improvements
- keep current heuristic initially, but track usage in a more useful structure
- add snapshot/session-aware compaction or reset policy
- optionally allow future tokenizer adapters by model/host

### Success criteria
- `forge execute --wave` dispatches independent tasks concurrently
- Budget output becomes more actionable and less misleading

### Recommended commits
12. `feat(core): add dependency-aware execution scheduler`
13. `feat(cli): execute wave tasks with bounded parallelism`
14. `feat(core): improve context budget accounting and session tracking`

---

## Epic G — Skill/runtime cleanup and ecosystem alignment
Priority: P2

### Objectives
- Make the skill system safer and more extensible
- Align host integration with broader agent ecosystem conventions
- Prepare FORGE for plugin and MCP growth

### Skill/runtime cleanup
#### Edit
- `packages/core/src/skill-registry.ts`
- `packages/core/src/skill-resolver.ts`
- `packages/core/src/hook-engine.ts`
- `packages/cli/src/runtime/skill-runtime.ts`

### Changes
- validate skill manifests at load time
- replace sync reads with async reads
- make source precedence explicit between builtin and project skills
- improve hook diagnostics and artifact attachment support

### Standard host artifacts
#### Edit
- `packages/cli/src/runtime/host-installer.ts`
- `packages/adapter-claude-code/src/installer.ts`
- `packages/adapter-codex/src/installer.ts`
- `packages/adapter-opencode/src/installer.ts`

### Add support for
- `AGENTS.md`
- current host-specific command files
- consistent generated instructions across hosts

### Dynamic plugin loading
#### Edit
- `packages/cli/src/runtime/adapter-loader.ts`

### Refactor toward
- package resolution by configured adapter name
- runtime interface validation
- fewer hard-coded switch statements

### MCP server (later wave)
#### Create
- `packages/mcp-server/`

### Initial MCP tools
- `forge_status`
- `forge_list_tasks`
- `forge_get_task`
- `forge_get_review`
- `forge_get_context_pack`

### Success criteria
- Skills are loaded asynchronously and validated
- Forge emits more standard agent-facing artifacts
- New adapters/verifiers become easier to add
- MCP-capable clients can query Forge state

### Recommended commits
15. `refactor(skills): validate manifests and load skill assets asynchronously`
16. `feat(hosts): generate AGENTS.md alongside host-specific artifacts`
17. `refactor(cli): move adapter loading toward dynamic plugin resolution`
18. `feat(mcp): add initial Forge MCP server surface`

---

# 4. Rollout order

## Release 0.2
Foundation hardening
- Epic A
- Epic C
- build cleanup and repo validation setup

## Release 0.3
Execution platform cleanup
- Epic B
- Epic D

## Release 0.4
Planning intelligence
- Epic E

## Release 0.5
Execution quality
- Epic F

## Release 0.6
Platform expansion
- Epic G

---

# 5. Required repository hygiene updates

## Add/finish tooling
- ESLint or Biome
- Prettier if Biome is not chosen
- CI workflow under `.github/workflows/ci.yml`
- explicit scripts for:
  - `build`
  - `typecheck`
  - `test`
  - `lint`
  - `format`

## Remove stale artifacts
Across packages, remove:
- stale `tsup.config.*` generated outputs if no longer needed
- `.tsup/` directories
- stale generated `vitest.config.js/.d.ts` files if source `.ts` is canonical
- any lingering script references to `tsup --watch`

---

# 6. Testing strategy

## Unit tests
Add/extend tests for:
- schema validation failures
- state-manager invalid read paths
- executor shared utility behavior
- command services without process termination
- planning engine generation and graph validation
- scheduler concurrency behavior

## Integration tests
Add end-to-end coverage for:
- init -> intake -> plan -> execute -> merge -> review -> qa -> ship
- malformed state recovery behavior
- snapshot restore validation
- wave execution with multiple ready tasks

## Regression tests
Protect against:
- invalid task transitions
- unvalidated config writes
- executor parse failures
- missing stderr diagnostics
- duplicate task graph creation

---

# 7. Acceptance criteria for the full program

FORGE will be considered to have met this implementation spec when:
- persisted state is schema-validated at all major boundaries
- executor logic is centralized and adapters are thin wrappers
- CLI commands no longer directly own process termination
- execution artifacts and logs are emitted for debugging
- `forge plan` produces usable task graphs
- wave execution supports bounded concurrency
- skill loading is async and validated
- host generation includes a broader standard artifact model
- the repository has a consistent validation/build/test pipeline

---

# 8. First implementation batch recommendation

If implementation starts immediately, the first batch should be:
1. Runtime schema layer
2. StateManager validation
3. Centralized CLI error handling
4. Shared executor abstraction
5. Executor stderr/log capture
6. Build artifact cleanup and script normalization

This batch gives the highest reliability return with the least workflow disruption.

---

# 9. Suggested follow-up spec
After this document is approved, the next spec should define the exact implementation sequence for Release 0.2, including:
- precise files to create
- exact interfaces/classes to introduce
- test files to add or update
- command-by-command refactor order
- commit-by-commit execution plan
