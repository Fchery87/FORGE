# Forge Implementation Plan

**Date**: 2026-04-05
**Design Reference**: `docs/plans/2026-04-05-forge-architecture-design.md`
**Approach**: Bottom-up — types first, then core, then CLI, then adapters

## Phase 0: Project Scaffolding

### Task 0.1: Initialize monorepo
- Initialize git repo
- Create root `package.json` with npm workspaces
- Create root `tsconfig.json` with project references
- Create workspace directories for all packages
- Add `.gitignore`, `.editorconfig`
- Install shared dev dependencies: `typescript`, `vitest`, `tsup`

**Acceptance**: `npm install` succeeds, `npx tsc --build` succeeds with no source files, workspace resolution works.

### Task 0.2: Configure build tooling
- Configure `tsup` for each package (ESM output, dts generation)
- Configure `vitest` at root with workspace support
- Add root scripts: `build`, `test`, `lint`, `clean`
- Add per-package scripts: `build`, `test`, `dev`

**Acceptance**: `npm run build` compiles all packages in dependency order. `npm test` runs all test suites.

---

## Phase 1: Type Definitions (`@forge-agent/types`)

### Task 1.1: State types
- Implement `state.ts`: `ProjectState`, `ArchitectureState`, `ExecutionState`, `ContextState`
- Implement supporting types: `Decision`, `Risk`, `Dependency`, `Phase`
- Export all from `index.ts`

**Acceptance**: Types compile. Import from `@forge-agent/types` resolves.

### Task 1.2: Task types
- Implement `task.ts`: `Task`, `TaskStatus`, `AcceptanceCriterion`, `TestRequirement`, `Evidence`
- Define `TASK_TRANSITIONS` map as a const: `Record<TaskStatus, TaskStatus[]>`
- Include `FileChange`, `TestRunResult`, `CriterionStatus`

**Acceptance**: Transition map covers all valid transitions from the design. Types compile.

### Task 1.3: Executor and Verifier interfaces
- Implement `executor.ts`: `Executor`, `ExecutorConfig`, `TaskContext`, `ExecutorResult`
- Implement `verifier.ts`: `Verifier`, `VerifierConfig`, `VerificationPlan`, `VerificationResult`, `VerificationType`, `CheckResult`, `EvidenceArtifact`, `Issue`

**Acceptance**: Interfaces compile. No implementation required yet.

### Task 1.4: Context, Review, and Config types
- Implement `context.ts`: `ContextPack`, `ContextBudget`, `Digest`, `Snapshot`
- Implement `review.ts`: `ReviewArtifact`, `ChecklistItem`, `ReviewType`
- Implement `config.ts`: `ForgeConfig`, `VerifierConfig`

**Acceptance**: All types compile and export correctly from package index.

---

## Phase 2: Core Engine (`@forge-agent/core`)

### Task 2.1: StateManager
- Implement JSON file read/write for all state files
- Atomic writes: write to `.tmp`, rename on success
- Typed accessors: `getProject()`, `getExecution()`, `getArchitecture()`, `getContext()`
- Typed mutators: `updateProject(patch)`, `updateExecution(patch)`, etc.
- Initialize state directory structure on first use
- Handle missing files gracefully (return defaults)

**Tests**:
- Read/write roundtrip for each state file
- Atomic write doesn't corrupt on simulated failure
- Missing file returns typed default
- Concurrent write protection (advisory lock or error)

**Acceptance**: All state files can be read, written, and roundtripped without data loss.

### Task 2.2: ID Generator
- Implement sequential ID generation: `TASK-001`, `DEC-001`, `REV-001`, `QA-001`, `SNAP-001`
- Read/increment counters from `config.json`
- Pad to 3 digits, expand if needed (TASK-1000)

**Tests**:
- Sequential generation produces expected IDs
- Counter persists across calls
- Handles counter rollover past 999

**Acceptance**: IDs are sequential, unique, and persistent.

### Task 2.3: TaskEngine
- CRUD operations: create, read, update, list, query by status/phase
- State machine enforcement: `transition(taskId, newStatus)` validates against `TASK_TRANSITIONS`
- Dependency resolution: `getReadyTasks()` returns tasks whose dependencies are all `done`
- File operations: read/write individual task JSON files in `.forge/tasks/`

**Tests**:
- Create task produces valid file
- Valid transitions succeed
- Invalid transitions throw with reason
- Dependency resolution correctly identifies ready tasks
- Query by status returns correct subset

**Acceptance**: Full task lifecycle can be exercised programmatically with all transitions validated.

### Task 2.4: GateKeeper
- Pure validation functions per gate:
  - `canSubmitForReview(task)`: checks tests written + passing, criteria self-assessed
  - `canApproveForQA(task, reviews)`: checks review artifact with approval
  - `canMarkDone(task, verifications)`: checks verification result with pass
- Returns `{ allowed: boolean, reasons: string[] }`

**Tests**:
- Each gate passes with valid evidence
- Each gate fails with specific missing evidence
- Reasons are human-readable

**Acceptance**: All three gates enforce their requirements correctly.

### Task 2.5: ContextEngine
- `generateContextPack(role, taskId?)`: builds scoped context pack from current state
- `estimateTokens(pack)`: character count / 4 heuristic
- `generateDigest(type)`: state, decision, changes, or next-step digest
- `generateSnapshot()`: serialize all state to snapshot file
- `restoreSnapshot(snapshotId)`: load snapshot, rebuild state, return briefing
- `checkBudget()`: compare estimated usage to threshold, return warning if exceeded
- `generateViews()`: write STATUS.md, PLAN.md, TASKS.md, CONTEXT.md to `.forge/views/`

**Tests**:
- Context pack contains only relevant data for scoped task
- Token estimate is within reasonable range
- Snapshot roundtrip preserves all state
- Views are regenerated correctly
- Budget warning triggers at threshold

**Acceptance**: Context packs are scoped, snapshots are recoverable, views are generated.

### Task 2.6: ReviewEngine
- `createReview(type, taskIds)`: generate review artifact with checklist for the given type
- Checklist templates per review type (architecture, implementation, qa, ship)
- `evaluateChecklist(reviewId, results)`: apply pass/fail to each item, compute verdict
- Write review artifacts to `.forge/reviews/`

**Tests**:
- Each review type produces correct checklist items
- All-pass yields approved verdict
- Any critical fail yields rejected verdict
- Required actions are generated for rejections

**Acceptance**: All four review types produce valid artifacts with correct verdicts.

### Task 2.7: Orchestrator
- Command dispatch: map command name to role + operation
- Role permission enforcement: check operation against permission matrix, reject unauthorized
- Precondition validation: check project state before executing (e.g., can't `execute` before `plan`)
- Coordinate between modules: StateManager -> TaskEngine -> Executor -> GateKeeper -> StateManager
- Error handling: catch module errors, return structured error with context

**Tests**:
- Each command routes to correct role
- Permission violations are rejected with reason
- Precondition failures are rejected with reason
- Happy path for each command produces expected state changes
- Error in module produces structured error, not crash

**Acceptance**: Full command dispatch works for all commands with role enforcement.

---

## Phase 3: CLI (`@forge-agent/cli`)

### Task 3.1: CLI framework and entry point
- Set up command parsing (use `commander` or `citty`)
- Create `bin/forge.ts` entry point with shebang
- Register all commands
- Global flags: `--json`, `--verbose`, `--forge-dir`
- Error handling: catch all, format for terminal, exit code 1

**Acceptance**: `forge --help` shows all commands. `forge nonexistent` shows error.

### Task 3.2: `forge init`
- Interactive prompts for project name, description, goals (skip with flags)
- Create `.forge/` directory structure
- Write default `config.json`
- Write initial `project.json`
- Print confirmation

**Acceptance**: Running `forge init --name test` in an empty directory creates full `.forge/` structure with valid JSON files.

### Task 3.3: `forge status`
- Read all state files
- Regenerate Markdown views
- Print formatted summary: phase, task counts by status, blockers, context health
- `--verbose` shows task details

**Acceptance**: Output correctly reflects state. Works on fresh init (empty project).

### Task 3.4: `forge intake`
- Accept goal as argument or interactive prompt
- Store intake artifact in `state/project.json` (update goals, constraints)
- Update project status to `intake`
- Print intake summary

**Acceptance**: Goal is captured in project state. Status transitions to `intake`.

### Task 3.5: `forge plan`
- Read intake from project state
- Generate phases and tasks (via executor or built-in logic)
- Write task files
- Update execution state
- Trigger architecture review prompt
- Update project status to `planning`

**Acceptance**: Tasks are created with valid schemas. Execution state reflects phases.

### Task 3.6: `forge execute`
- `--task TASK-XXX`: execute specific task
- No flag: pick next ready task via `getReadyTasks()`
- `--wave`: dispatch all ready tasks in parallel
- Generate context pack for task
- Dispatch to configured executor
- Print execution summary
- Update project status to `executing`

**Acceptance**: Task transitions to `in_progress`. Executor receives valid context pack. Result is returned.

### Task 3.7: `forge merge`
- Read executor result for task
- Validate against acceptance criteria
- Run GateKeeper checks for `in_review` transition
- Update task status
- Update execution state (progress counts)
- Auto-generate digest if configured
- Print merge summary

**Acceptance**: Valid result merges successfully. Invalid result is rejected with reasons.

### Task 3.8: `forge review`
- `--arch`: architecture review
- Default: implementation review
- Generate review checklist
- Dispatch to executor for review (or interactive CLI checklist)
- Store review artifact
- Print review summary with verdict

**Acceptance**: Review artifact is created. Verdict is rendered. Task transitions accordingly.

### Task 3.9: `forge qa`
- Build verification plan from task acceptance criteria + changed files
- Dispatch to configured verifier(s)
- Store QA artifact and evidence
- Create issues for failures
- Reopen tasks if `auto_reopen` is true
- Print QA summary

**Acceptance**: Verification runs. Evidence is stored. Failures create issues.

### Task 3.10: `forge ship`
- Run ship review checklist
- Validate: all tasks done, all reviews approved, all QA passed
- Produce release report
- Print ship summary or rejection with reasons

**Acceptance**: Clean project ships successfully. Project with open items is rejected with specific reasons.

### Task 3.11: `forge snapshot` and `forge restore`
- Snapshot: serialize state, write to `.forge/snapshots/`
- Restore: load snapshot, rebuild state, regenerate views, print briefing
- List snapshots with `forge snapshot --list`

**Acceptance**: Snapshot roundtrip preserves all state. Restore prints accurate briefing.

### Task 3.12: `forge config`
- No args: print current config
- Key: print value
- Key + value: update and save
- Validate known keys

**Acceptance**: Config reads and writes correctly. Invalid keys warn.

### Task 3.13: Formatters
- Status formatter: phase, progress bar, task counts, context health
- Task formatter: task details, criteria, evidence
- Review formatter: checklist with pass/fail indicators
- Color and unicode support with fallback for dumb terminals

**Acceptance**: Output is readable and informative in standard terminal.

---

## Phase 4: Adapters

### Task 4.1: Test Runner Verifier (`@forge-agent/verifier-test-runner`)
- Implement `Verifier` interface
- Execute configured test command via child process
- Parse stdout/stderr for test results (support common formats: TAP, Jest, Vitest)
- Map results to `CheckResult[]`
- Capture output as evidence artifact

**Acceptance**: Running against a project with tests produces valid `VerificationResult`.

### Task 4.2: Claude Code Adapter (`@forge-agent/adapter-claude-code`)
- Implement `Executor` interface
- Generate prompt from `TaskContext` (task definition + context pack as structured prompt)
- Execute via `claude` CLI subprocess with `--print` flag
- Parse response into `ExecutorResult`
- `installer.ts`: copy skill templates and CLAUDE.md contracts into `.claude/` directory
- Skill templates for each Forge command

**Acceptance**: `forge install claude-code` copies templates. Executor dispatches task and returns structured result.

### Task 4.3: OpenCode Adapter (`@forge-agent/adapter-opencode`)
- Same pattern as Claude Code adapter
- Execute via `opencode` CLI
- Adapter-specific prompt formatting
- Installer copies appropriate config files

**Acceptance**: Executor dispatches and returns structured result.

### Task 4.4: Playwright Verifier (`@forge-agent/verifier-playwright`)
- Implement `Verifier` interface
- Browser lifecycle management: launch, reuse, dispose
- Session persistence: save/load cookies and storage state
- Screenshot capture on assertion and failure
- Console log and network error capture
- Route-based test execution
- Evidence storage in `.forge/qa/evidence/`

**Acceptance**: Browser launches, navigates, captures evidence, returns structured results.

---

## Phase 5: Integration and Polish

### Task 5.1: End-to-end workflow test
- Script a full lifecycle: init -> intake -> plan -> execute -> merge -> review -> qa -> ship
- Use a mock executor that returns predetermined results
- Verify all state transitions and artifacts

**Acceptance**: Full lifecycle completes with correct state at every step.

### Task 5.2: Error handling audit
- Verify every command handles: missing `.forge/`, corrupt JSON, missing files, executor timeout, verifier failure
- Ensure errors are user-friendly with actionable messages
- No unhandled promise rejections or stack traces in normal operation

**Acceptance**: Each error case produces a clear message and non-zero exit code.

### Task 5.3: Documentation
- README.md with installation, quickstart, command reference
- `forge --help` and `forge <command> --help` for every command
- Example workflow walkthrough

**Acceptance**: New user can install and run full lifecycle from docs alone.

### Task 5.4: Package publishing setup
- Configure package.json for each package with correct `main`, `types`, `bin`, `files`
- Verify `npm pack` produces correct package contents
- Add `prepublishOnly` scripts for build verification
- Version all packages at `0.1.0`

**Acceptance**: `npm pack` for each package produces installable tarball.

---

## Implementation Order Summary

```
Phase 0: Scaffolding          [2 tasks]   Foundation
Phase 1: Types                [4 tasks]   Data contracts
Phase 2: Core Engine          [7 tasks]   Business logic
Phase 3: CLI                  [13 tasks]  User interface
Phase 4: Adapters             [4 tasks]   Integrations
Phase 5: Integration/Polish   [4 tasks]   Quality assurance
                              ----------
                              34 tasks total
```

## Dependencies Between Phases

```
Phase 0 (scaffolding)
  └── Phase 1 (types) — needs build tooling
       └── Phase 2 (core) — needs type definitions
            ├── Phase 3 (CLI) — needs core modules
            └── Phase 4 (adapters) — needs Executor/Verifier interfaces
                 └── Phase 5 (integration) — needs everything
```

Phases 3 and 4 can execute in parallel once Phase 2 is complete.

## Critical Path

The longest chain is: Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 5.

Phase 4 (adapters) can be developed in parallel with Phase 3 (CLI) and should not block the critical path. The mock executor in Phase 5 Task 5.1 allows full workflow testing without real adapters.

## Implementation Notes

- **Test first**: Every core module task includes test requirements. Write tests before implementation.
- **No premature abstraction**: Build the concrete implementation first. Extract shared patterns only after Phase 2 is complete.
- **Atomic commits**: One commit per task. Commit message references task ID.
- **Type safety**: Strict TypeScript throughout. No `any` except at adapter parsing boundaries, and even there prefer `unknown` with type guards.
