# Forge

Forge is an installable local AI coding agent framework for long-running software delivery. It structures AI-assisted development around three explicit roles — Builder (writes code), Manager (maintains state), and Executive (enforces quality) — and enforces a strict workflow: plan, execute, review, verify, ship. Forge is not a SaaS product and not a one-shot prompt wrapper; it is a local framework that manages canonical state on disk and coordinates pluggable AI executors across the full delivery lifecycle.

## Architecture

Forge is a TypeScript monorepo with five layers:

| Package | Name | Responsibility |
|---------|------|----------------|
| `packages/types` | `@forge-agent/types` | Shared interfaces, schemas, and type definitions |
| `packages/core` | `@forge-agent/core` | Orchestrator, StateManager, TaskEngine, ContextEngine, ReviewEngine, GateKeeper |
| `packages/cli` | `@forge-agent/cli` | CLI commands, formatters, terminal output |
| `packages/adapter-*` | `@forge-agent/adapter-claude-code`, `@forge-agent/adapter-opencode` | Pluggable executor adapters |
| `packages/verifier-*` | `@forge-agent/verifier-test-runner`, `@forge-agent/verifier-playwright` | Pluggable verifier adapters |

The core engine is host-agnostic. Executors and verifiers are thin adapters loaded at runtime. State is stored as JSON in `.forge/` with generated Markdown views for human readability.

### Data Flow

```
CLI Command
  -> Orchestrator (role activation, permission check)
    -> StateManager (read current state)
    -> TaskEngine / ReviewEngine / ContextEngine (domain logic)
    -> Executor or Verifier (dispatched via plugin interface)
    -> GateKeeper (validate transition)
    -> StateManager (write updated state)
    -> ContextEngine (regenerate views)
  -> CLI formatter (terminal output)
```

## Installation

```bash
# Install CLI globally
npm install -g @forge-agent/cli

# Or use npx
npx @forge-agent/cli init
```

## Quick Start

The following example walks through a complete delivery cycle for a new project.

**1. Initialize a project**

```bash
forge init --name "my-app"
```

Scaffolds `.forge/` with all required state files and sets the project in `intake` status.

**2. Define goals**

```bash
forge intake "Build a REST API with Express"
```

Captures the project goal. Add constraints with `--constraints "no external auth,TypeScript only"`.

**3. Generate a plan**

```bash
forge plan
```

Creates a planning task and transitions the project to `planning` status. Run `forge review --arch` before execution to validate the design.

**4. Execute a task**

```bash
forge execute
```

Picks the next ready task, generates a scoped context pack, and dispatches it to the configured executor. Use `--task TASK-001` to target a specific task, or `--wave` to dispatch all ready tasks in parallel.

**5. Submit for review**

```bash
forge merge --task TASK-001
```

Validates gate conditions (tests written and passing, acceptance criteria self-assessed) and transitions the task to `in_review`.

**6. Conduct a review**

```bash
forge review
```

Runs the implementation review checklist against all `in_review` tasks and produces a `ReviewArtifact`. Use `--arch` to run an architecture review instead.

**7. Run QA verification**

```bash
forge qa
```

Dispatches a verification plan for tasks in `qa_pending` status. Runs configured verifiers and stores evidence in `.forge/qa/evidence/`.

**8. Ship the project**

```bash
forge ship
```

Runs the final gate check (all tasks done, all reviews approved, all QA passed), produces a release report, and transitions the project to `shipped`.

## Commands Reference

| Command | Description |
|---------|-------------|
| `forge init [--name] [--description]` | Initialize a new Forge project in the current directory |
| `forge intake <goal> [--constraints]` | Capture project goal and scope |
| `forge plan [--phase]` | Generate execution plan from intake goal |
| `forge execute [--task ID] [--wave]` | Execute the next ready task (or specified task) |
| `forge merge [--task ID] [--force]` | Merge completed task results into project state |
| `forge review [--arch] [--task ID]` | Run a review pass (implementation or architecture) |
| `forge qa [--task ID] [--full] [--pass]` | Run QA verification for affected tasks |
| `forge ship [--force]` | Validate ship readiness and produce release report |
| `forge status [--verbose]` | Show current project status and task health |
| `forge snapshot [--name] [--list]` | Save a snapshot of current project state |
| `forge restore --snapshot <ID>` | Restore project state from a snapshot |
| `forge config [key] [value]` | View or update Forge configuration |

All commands accept `--json` for machine-readable output and `--verbose` for detailed output.

## Adapters (Executors)

Executors implement the `Executor` interface and are responsible for code generation. Forge dispatches a scoped `TaskContext` (task definition + context pack + working directory) to the executor and receives a structured `ExecutorResult`.

**Claude Code**

```bash
npm install @forge-agent/adapter-claude-code
forge config adapter.executor claude-code
```

**OpenCode**

```bash
npm install @forge-agent/adapter-opencode
forge config adapter.executor opencode
```

To implement a custom executor, implement the `Executor` interface from `@forge-agent/types` and register it via config.

## Verifiers

Verifiers implement the `Verifier` interface and are responsible for validating that tasks meet acceptance criteria. Forge dispatches a `VerificationPlan` and stores the resulting `VerificationResult` and evidence artifacts in `.forge/qa/`.

**Test Runner**

```bash
npm install @forge-agent/verifier-test-runner
```

Executes the configured test command (`testing.test_command`) and parses output for pass/fail/skip counts. Maps test files to tasks via `files_in_scope`.

```bash
forge config testing.test_command "npm test"
```

**Playwright (browser QA)**

```bash
npm install @forge-agent/verifier-playwright
```

Manages a persistent browser session for end-to-end verification. Captures screenshots, console errors, and network failures as evidence. Stores artifacts in `.forge/qa/evidence/`.

Playwright is an optional dependency. The core engine has no browser dependency.

## State Directory

All project state lives in `.forge/` in the project root. JSON files are the single source of truth; Markdown files in `views/` are generated projections.

```
.forge/
  config.json          # Project config, adapter settings, ID counters
  state/
    project.json       # Project identity, goals, phase, current status
    architecture.json  # Design decisions, risks, dependencies
    execution.json     # Phases, wave progress, task counts
    context.json       # Token budget tracking, session metadata
  tasks/
    TASK-001.json      # One file per task
    TASK-002.json
  decisions/
    DEC-001.json       # Architectural and design decisions
  reviews/
    REV-001.json       # Review artifacts (approved/rejected/conditional)
  qa/
    QA-001.json        # QA run results
    evidence/          # Screenshots, logs, test output
  snapshots/
    SNAP-001.json      # Full state snapshots for session handoff
  views/               # Generated Markdown (read-only projections)
    STATUS.md
    PLAN.md
    TASKS.md
    CONTEXT.md
```

### Task State Machine

```
draft -> planned -> ready -> in_progress -> in_review -> qa_pending -> done
                                  ^              |
                               rejected <--------+  (rejection loop)
```

Gate requirements enforced by GateKeeper:
- `-> in_review`: at least one test written, tests passing, acceptance criteria self-assessed
- `-> qa_pending`: review artifact with approval verdict exists
- `-> done`: verification result with pass status exists

## Context Management

Forge tracks token budget across sessions and warns when context pressure is high. Before every executor dispatch or role transition, the ContextEngine generates a scoped context pack containing only what that operation requires. Workers never receive full project history.

### Snapshots

When context budget warnings appear, save state and start a fresh session:

```bash
# Save current state
forge snapshot --name "before-phase-2"

# List available snapshots
forge snapshot --list

# Restore from snapshot in a new session
forge restore --snapshot SNAP-001
```

`forge restore` loads all state, regenerates views, and prints a "you are here" briefing summarizing project status, recent actions, and next steps.

### Context Budget

Configure the warning threshold:

```bash
forge config context.budget_warning_threshold 80000
forge config context.context_window_estimate 200000
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

### Repository Structure

```
forge/
  packages/
    types/                # @forge-agent/types
    core/                 # @forge-agent/core
    cli/                  # @forge-agent/cli
    adapter-claude-code/  # @forge-agent/adapter-claude-code
    adapter-opencode/     # @forge-agent/adapter-opencode
    verifier-test-runner/ # @forge-agent/verifier-test-runner
    verifier-playwright/  # @forge-agent/verifier-playwright
```

Each package has its own `tsup` build config and is linked via npm workspaces.
