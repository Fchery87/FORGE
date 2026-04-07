# Forge

**An installable local AI coding agent framework for long-running software delivery.**

Forge is not a SaaS product, not a browser-first tool, and not a one-shot prompt wrapper. It is a local-first orchestration framework that gives your AI coding agents a structured operating environment — with enforced quality gates, canonical state, and clean context management — so they can work through real software projects from initial planning to production ship.

---

## Table of Contents

- [Why Forge](#why-forge)
- [Core Concepts](#core-concepts)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Workflow Reference](#workflow-reference)
- [Command Reference](#command-reference)
- [Configuration](#configuration)
- [Executor Adapters](#executor-adapters)
- [Verifier Adapters](#verifier-adapters)
- [State and Storage](#state-and-storage)
- [Context Management](#context-management)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Package Reference](#package-reference)

---

## Why Forge

Modern AI coding agents (Claude Code, OpenCode, Copilot Workspace) are powerful at the task level but struggle with multi-day, multi-task projects. Common failure modes:

- **Context rot** — the context window fills with stale information; quality degrades silently
- **No state** — each session starts cold, losing all decisions, rationale, and progress
- **No gates** — agents merge untested code, skip reviews, or ship before QA
- **No accountability** — there is no clear record of what was done, why, and by whom

Forge solves this by providing the _organizational structure_ around AI agents that humans take for granted: a project manager, a quality process, and institutional memory.

---

## Core Concepts

### Three Roles

Every action in Forge is performed by one of three roles:

| Role | Responsibility | Commands |
|------|---------------|----------|
| **Builder** | Writes code, runs tests, implements tasks | `execute`, `merge` |
| **Manager** | Plans work, maintains state, tracks progress | `init`, `intake`, `plan`, `status`, `snapshot`, `restore`, `config` |
| **Executive** | Reviews quality, makes ship decisions | `review`, `qa`, `ship` |

Role boundaries are enforced structurally. Forge will refuse to run a command in the wrong workflow phase.

### The Workflow

Every project follows the same enforced lifecycle:

```
intake -> plan -> execute -> merge -> review -> qa -> ship
```

Each transition has prerequisites. You cannot skip to `ship` without evidence of passing tests and an approved review. Forge tracks this state on disk so the discipline survives session restarts.

### Task State Machine

Tasks move through a strict state machine:

```
draft -> planned -> ready -> in_progress -> in_review -> qa_pending -> done
                                 |-> blocked                |-> in_progress (reopen)
                                 |-> in_review -> rejected -> in_progress
```

Every transition is validated. Attempting an invalid transition fails with an explicit error.

### Quality Gates

Before any task can advance, evidence must exist:

| Gate | Required evidence |
|------|------------------|
| `-> in_review` | At least one passing test requirement; at least one verified acceptance criterion |
| `-> qa_pending` | A review artifact with verdict `approved` |
| `-> done` | A verification result with status `pass` |

Gates are enforced by `GateKeeper` — a pure, stateless module with no side effects and no I/O.

---

## Architecture

Forge is a TypeScript ESM monorepo with seven packages arranged in three layers:

```
Layer 3: Adapters (plug-in executors and verifiers)
  @forge-agent/adapter-claude-code   — dispatches work to the claude CLI
  @forge-agent/adapter-opencode      — dispatches work to the opencode CLI
  @forge-agent/verifier-test-runner  — runs shell test commands
  @forge-agent/verifier-playwright   — browser-based QA via Playwright

Layer 2: Contracts (shared TypeScript interfaces)
  @forge-agent/types                 — all data schemas and plugin interfaces

Layer 1: Core Engine (business logic, no I/O except .forge/ state files)
  @forge-agent/core                  — Orchestrator, StateManager, TaskEngine,
                                       ContextEngine, ReviewEngine, GateKeeper,
                                       IdGenerator

CLI Surface
  @forge-agent/cli                   — 12 commands, terminal formatters, JSON output
```

### Data Flow

```
CLI Command
  -> Orchestrator   — activates role, checks permissions and preconditions
  -> StateManager   — reads current project state from .forge/
  -> Domain module  — TaskEngine / ReviewEngine / ContextEngine applies logic
  -> Executor or Verifier — dispatched for AI work or verification
  -> GateKeeper     — validates the state transition is permitted
  -> StateManager   — writes updated state atomically to .forge/
  -> ContextEngine  — regenerates .forge/views/ Markdown files
  -> CLI formatter  — renders terminal output (or JSON with --json)
```

### Core Module Responsibilities

**Orchestrator** — Command dispatcher and role router. Enforces that each command is valid in the current project phase and is performed by the correct role. Stateless — runs once per command invocation.

**StateManager** — Sole module with read/write access to `.forge/` JSON state files. Provides typed accessors for all five state domains. Handles atomic writes (write to `.tmp`, then `rename`) to prevent partial state on crash.

**TaskEngine** — Task CRUD and state machine enforcement. Validates every transition against `TASK_TRANSITIONS`. Queries tasks by status, phase, or readiness (dependencies all `done`).

**ContextEngine** — Generates context packs for executor dispatch. Tracks token budget. Produces digests (state, decisions, changes, next-steps). Manages snapshot write/restore. Regenerates Markdown views.

**ReviewEngine** — Runs typed review checklists (implementation, architecture, QA, ship). Persists `ReviewArtifact` JSON. Computes `approved` / `rejected` / `conditional` verdicts.

**GateKeeper** — Pure validation. No side effects. Checks gate preconditions before each task transition: tests written and passing, acceptance criteria verified, review approved, verification passed.

**IdGenerator** — Sequential, persistent IDs (`TASK-001`, `SNAP-001`, `REV-001`). Counters are stored in `config.json` and incremented atomically.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State format | JSON source of truth + generated Markdown views | Single unambiguous source; human-readable views regenerated on demand |
| Atomic writes | Write to `.tmp`, then `rename` | No corrupt state on crash or power loss |
| Plugin interfaces | `Executor` and `Verifier` are plain TypeScript interfaces | Any adapter that satisfies the interface works; core stays lightweight |
| Context packs | Scoped bundle per task | Executor receives only relevant context, not entire project history |
| Sequential IDs | Human-readable padded counters | `TASK-001` is easier to work with than `uuid-abc-123` |
| CLI-first | No web dashboard in v1 | JSON state enables a future dashboard; don't build it speculatively |

---

## Installation

### Prerequisites

- Node.js 18 or later
- npm 9 or later
- An AI coding agent CLI (see [Executor Adapters](#executor-adapters))

### Install the CLI

```bash
npm install -g @forge-agent/cli
```

Verify the installation:

```bash
forge --version
forge --help
```

### Install an executor adapter

```bash
# For Claude Code
npm install -g @forge-agent/adapter-claude-code

# For OpenCode
npm install -g @forge-agent/adapter-opencode
```

---

## Quick Start

This walkthrough creates a project from scratch and runs the full delivery lifecycle.

### 1. Initialize a project

```bash
mkdir my-app && cd my-app
forge init --name "my-app" --description "A REST API built with Express"
```

This creates the `.forge/` directory with default configuration and empty project state. The directory tree looks like this after init:

```
.forge/
  config.json
  state/
    project.json
    architecture.json
    execution.json
    context.json
  tasks/
  reviews/
  snapshots/
  views/
```

### 2. Define your goals

```bash
forge intake "Build a REST API with Express, PostgreSQL, and JWT authentication"
forge intake "All endpoints must have OpenAPI documentation"
```

Run `intake` as many times as needed to capture goals and constraints.

### 3. Check project status

```bash
forge status             # summary view
forge status --verbose   # includes task details
forge status --json      # machine-readable output
```

### 4. Create the plan

```bash
forge plan
```

This transitions the project to `planning` status and creates a planning task. Tasks can be added to `.forge/tasks/` manually or via the executor during the plan phase.

### 5. Execute a task

```bash
forge execute                    # picks the next ready task automatically
forge execute --task TASK-001    # execute a specific task
forge execute --wave             # execute all ready tasks
```

Forge generates a **context pack** for the task — a structured prompt containing the task definition, acceptance criteria, relevant project context, and result format instructions — then dispatches it to your configured executor adapter.

### 6. Submit for review

```bash
forge merge --task TASK-001
```

GateKeeper validates prerequisites before allowing the transition to `in_review`. If the task lacks a passing test or a verified acceptance criterion, the merge is rejected with specific reasons. Use `--force` to bypass for draft work.

### 7. Conduct the review

```bash
forge review              # implementation review
forge review --arch       # architecture review (required before shipping by default)
forge review --pass-all   # approve all checklist items
```

Review checklists are tailored by review type. An approved review records a `ReviewArtifact` in `.forge/reviews/`.

### 8. Run QA

```bash
forge qa             # runs configured verifiers
forge qa --pass      # mark QA as passed manually
```

Verifiers run against tasks in `qa_pending` status. Evidence (screenshots, test output) is stored in `.forge/qa/evidence/`.

### 9. Ship

```bash
forge ship --dry-run    # check readiness without shipping
forge ship              # validate all gates and mark the project shipped
```

Ship validates that every task is `done`, every required review is `approved`, and all QA criteria are met. On success, the project status is set to `shipped` and a final snapshot is generated.

---

## Workflow Reference

### Full lifecycle diagram

```
forge init
    |
    v
forge intake "describe your goal"
    |
    v
forge plan
    |
    v
forge execute [--task TASK-xxx] [--wave]
    |
    v (GateKeeper: requires passing test + verified acceptance criterion)
forge merge --task TASK-xxx
    |
    v (ReviewEngine: generates checklist, records verdict)
forge review [--arch]
    |
    v (Verifier: runs tests or browser checks, stores evidence)
forge qa
    |
    v (validates: all tasks done, all reviews approved, all QA passed)
forge ship
    |
    v
  SHIPPED
```

### Session handoff

For projects spanning multiple sessions:

```bash
# End of session — capture full state
forge snapshot
# Creates .forge/snapshots/SNAP-001.json

# Start of next session — restore and get a briefing
forge restore --snapshot SNAP-001

# List available snapshots
forge snapshot --list
```

Snapshots capture the complete project state: all task data, decisions, execution progress, and context budget. Restore replays all state back into `.forge/` and prints a next-step briefing to orient the new session immediately.

---

## Command Reference

### Commands

| Command | Role | Description |
|---------|------|-------------|
| `forge init` | Manager | Initialize `.forge/` directory and default config |
| `forge intake <goal>` | Manager | Record a project goal or constraint |
| `forge plan` | Manager | Create a planning task; set project to planning |
| `forge status` | Manager | Show project status, progress, and context health |
| `forge execute` | Builder | Dispatch the next ready task to the executor |
| `forge merge` | Builder | Submit a completed task for review |
| `forge review` | Executive | Conduct implementation or architecture review |
| `forge qa` | Executive | Run QA verification against pending tasks |
| `forge ship` | Executive | Validate all gates and mark the project shipped |
| `forge snapshot` | Manager | Capture full project state to a snapshot file |
| `forge restore` | Manager | Restore project state from a snapshot |
| `forge config` | Manager | View or update Forge configuration |

### Global flags

| Flag | Description |
|------|-------------|
| `--json` | Output as machine-readable JSON |
| `--verbose` | Enable debug-level logging |
| `--forge-dir <path>` | Override `.forge/` path (default: auto-detect by walking up from cwd) |

### Per-command flags

```bash
forge init --name <name> --description <desc>

forge execute --task <TASK-xxx>
forge execute --wave

forge merge --task <TASK-xxx>
forge merge --task <TASK-xxx> --force       # bypass gate checks

forge review --arch                          # architecture review
forge review --pass-all                      # approve all checklist items
forge review --task <TASK-xxx>

forge qa --pass                              # mark QA as passed manually

forge ship --dry-run                         # check readiness without shipping

forge snapshot --list                        # list available snapshots

forge restore --snapshot <SNAP-xxx>

forge config                                 # show full config
forge config adapter.executor               # show a specific key
forge config adapter.executor opencode      # set a value
```

---

## Configuration

Forge stores configuration in `.forge/config.json`. The `forge config` command reads and writes values without requiring you to edit JSON directly.

### Full schema

```json
{
  "adapter": {
    "executor": "claude-code",
    "executor_options": {}
  },
  "verification": {
    "verifiers": [
      { "name": "test-runner", "package": null, "options": {} }
    ],
    "default_strategy": ["unit"]
  },
  "context": {
    "budget_warning_threshold": 80000,
    "context_window_estimate": 128000,
    "auto_digest_on_merge": true
  },
  "testing": {
    "test_command": "npm test",
    "test_pattern": "**/*.test.ts",
    "coverage_command": null
  },
  "review": {
    "require_architecture_review": true,
    "require_qa_before_ship": true,
    "auto_review_on_merge": false
  }
}
```

### Configurable keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `adapter.executor` | string | `claude-code` | Executor adapter name |
| `context.budget_warning_threshold` | number | `80000` | Token count at which budget warning activates |
| `context.context_window_estimate` | number | `128000` | Estimated total context window size |
| `context.auto_digest_on_merge` | boolean | `true` | Auto-generate digest when a task is merged |
| `testing.test_command` | string | `npm test` | Command the test-runner verifier executes |
| `testing.test_pattern` | string | `**/*.test.ts` | Glob pattern for test files |
| `review.require_architecture_review` | boolean | `true` | Require `forge review --arch` before shipping |
| `review.require_qa_before_ship` | boolean | `true` | Require `forge qa` pass before shipping |
| `review.auto_review_on_merge` | boolean | `false` | Auto-run review when a task is merged |

---

## Executor Adapters

Executors are the adapters that perform AI coding work. Forge dispatches a structured context pack to the executor and receives a structured result back.

### Executor interface

```typescript
interface Executor {
  readonly name: string
  initialize(config: ExecutorConfig): Promise<void>
  dispatch(context: TaskContext): Promise<ExecutorResult>
  dispose(): Promise<void>
}

interface TaskContext {
  task_id: string
  context_pack: ContextPackRef   // pack_id, estimated_tokens, markdown content
  working_directory: string
}

interface ExecutorResult {
  task_id: string
  status: 'completed' | 'failed' | 'partial'
  summary: string
  files_changed: FileChange[]
  tests_added: string[]
  tests_run: TestRunResult[]
  acceptance_criteria_status: CriterionStatus[]
  issues: string[]
  merge_recommendation: 'merge' | 'revise' | 'reject'
}
```

### Claude Code (`@forge-agent/adapter-claude-code`)

Dispatches work to the `claude` CLI via subprocess.

```bash
npm install -g @forge-agent/adapter-claude-code
forge config adapter.executor claude-code
```

**How it works:**
1. Forge generates a context pack with the task, acceptance criteria, project context, and output format instructions
2. The prompt is written to a temp file in the OS temp directory
3. `claude --print --input-file <tempfile>` is spawned as a subprocess
4. The last JSON line of stdout is parsed as `ExecutorResult`
5. The temp file is deleted in a `finally` block (always cleaned up)

**Requirements:** `claude` CLI must be installed and authenticated with `ANTHROPIC_API_KEY`.

**Options:**
```json
{
  "adapter": {
    "executor": "claude-code",
    "executor_options": {
      "model": "claude-sonnet-4-6",
      "max_tokens": 8096,
      "timeout_ms": 300000
    }
  }
}
```

### OpenCode (`@forge-agent/adapter-opencode`)

Dispatches work to the `opencode` CLI via subprocess.

```bash
npm install -g @forge-agent/adapter-opencode
forge config adapter.executor opencode
```

**How it works:** Same pattern — temp file prompt, `opencode run --print <file>`, parse last JSON line.

**Requirements:** `opencode` CLI installed and configured with a provider API key.

### Custom Executors

```typescript
import type { Executor, ExecutorConfig, TaskContext, ExecutorResult } from '@forge-agent/types'

export class MyExecutor implements Executor {
  readonly name = 'my-executor'

  async initialize(config: ExecutorConfig): Promise<void> {
    // parse config.options with typeof guards — no unsafe casts
  }

  async dispatch(context: TaskContext): Promise<ExecutorResult> {
    // context.context_pack.content — full task prompt as markdown
    // return structured ExecutorResult
  }

  async dispose(): Promise<void> { }
}
```

---

## Verifier Adapters

Verifiers validate completed work. They produce `VerificationResult` objects containing check results, evidence artifacts, and issues.

### Verifier interface

```typescript
interface Verifier {
  readonly name: string
  readonly supports: VerificationType[]   // 'unit' | 'integration' | 'e2e' | 'browser'
  initialize(config: VerifierConfig): Promise<void>
  verify(plan: VerificationPlan): Promise<VerificationResult>
  dispose(): Promise<void>
}
```

### Test Runner (`@forge-agent/verifier-test-runner`)

Runs a shell test command and parses the output for pass/fail signals.

Configuration in `config.json`:
```json
{
  "verification": {
    "verifiers": [
      {
        "name": "test-runner",
        "package": "@forge-agent/verifier-test-runner",
        "options": {
          "command": "npm test",
          "timeout_ms": 60000
        }
      }
    ]
  }
}
```

**Output parsing:** Looks for passing indicators (`✓`, `✔`, `passed`, `PASS`, TAP `ok`) and failing indicators (`✗`, `✘`, `failed`, `FAIL`, `not ok`, `×`, `●`). Exit code 0 → `pass`; non-zero with some passes → `partial`; non-zero with no passes → `fail`.

**Evidence:** Full test output is captured as a `test_output` evidence artifact.

### Playwright (`@forge-agent/verifier-playwright`)

Navigates configured routes in a real browser, captures screenshots and console logs, and reports page errors as failed checks.

```bash
npm install playwright
npx playwright install chromium
```

Configuration:
```json
{
  "verification": {
    "verifiers": [
      {
        "name": "playwright",
        "package": "@forge-agent/verifier-playwright",
        "options": {
          "base_url": "http://localhost:3000",
          "headless": true,
          "timeout_ms": 30000,
          "evidence_dir": ".forge/qa/evidence",
          "routes": [
            { "path": "/", "name": "homepage" },
            { "path": "/dashboard", "name": "dashboard" },
            { "path": "/api/health", "name": "health-check" }
          ]
        }
      }
    ]
  }
}
```

**Evidence:** Screenshots saved to `.forge/qa/evidence/<plan_id>/<route_name>.png`. Console logs captured per route.

**Graceful degradation:** If Playwright is not installed, the verifier returns a `fail` result with install instructions rather than crashing.

### Custom Verifiers

```typescript
import type { Verifier, VerifierConfig, VerificationPlan, VerificationResult, VerificationType } from '@forge-agent/types'

export class MyVerifier implements Verifier {
  readonly name = 'my-verifier'
  readonly supports: VerificationType[] = ['unit', 'integration']

  async initialize(config: VerifierConfig): Promise<void> { }

  async verify(plan: VerificationPlan): Promise<VerificationResult> {
    return {
      plan_id: plan.plan_id,
      status: 'pass',
      checks: [],
      evidence: [],
      issues: [],
      summary: '0 checks run',
      created_at: new Date().toISOString(),
    }
  }

  async dispose(): Promise<void> { }
}
```

---

## State and Storage

All Forge state is stored in `.forge/` at the project root. The directory is created by `forge init` and should be added to your project's `.gitignore` if you do not want to commit project state.

### Full directory structure

```
.forge/
  config.json                — project configuration
  state/
    project.json             — name, goals, constraints, current phase and status
    architecture.json        — technical decisions, open questions, risk register
    execution.json           — phases, task counts by status, current wave
    context.json             — token budget, session ID, recent actions
  tasks/
    TASK-001.json            — individual task files (one per task)
    TASK-002.json
    ...
  decisions/
    DEC-001.json             — architecture decision records
  reviews/
    REV-001.json             — review artifacts with checklist results and verdict
  qa/
    evidence/                — screenshots, test outputs, console logs
      SNAP-001/
        homepage.png
        dashboard.png
  snapshots/
    SNAP-001.json            — full state snapshots (for session handoff)
  views/                     — generated Markdown files (safe to delete)
    STATUS.md
    TASKS.md
    PLAN.md
```

### Atomic writes

Every state mutation uses a crash-safe write pattern:
1. New content written to `<file>.tmp`
2. File atomically renamed to replace the original

A crash during any write leaves a `.tmp` file, never a corrupt state file. The original is always preserved until the new content is fully written.

### Sequential IDs

All artifacts use sequential, human-readable IDs:

| Prefix | Entity | Example |
|--------|--------|---------|
| `TASK` | Tasks | `TASK-001` |
| `DEC` | Decisions | `DEC-001` |
| `REV` | Reviews | `REV-001` |
| `QA` | QA artifacts | `QA-001` |
| `SNAP` | Snapshots | `SNAP-001` |

Counters are persisted in `config.json` and incremented on each `next()` call. IDs pad to 3 digits, expanding automatically beyond 999.

---

## Context Management

Context management is a first-class concern in Forge. AI agents routinely exhaust context windows mid-project; Forge provides the tooling to handle this without losing progress.

### Context packs

Each task dispatch includes a **context pack** — a scoped bundle of information relevant to that specific task:

- Task definition, description, and rationale
- Acceptance criteria and test requirements
- Project goals and architecture summary
- Decisions made during the project
- Files in scope for the task
- Current execution progress

The executor receives only what it needs, not the entire project history. Context packs are estimated for token cost before dispatch.

### Budget tracking

`forge status` shows real-time context health:

```
Context Health
  Tokens: [████████████░░░░░░░░] 62%
```

When `estimated_tokens_used` exceeds `budget_warning_threshold` (default 80,000), the status view shows a warning and suggests taking a snapshot.

The estimate uses a character-count heuristic (`characters / 4`). It is an approximation — treat it as a directional signal, not a precise measurement.

Configure the thresholds:
```bash
forge config context.budget_warning_threshold 60000
forge config context.context_window_estimate 200000   # for models with larger windows
```

### Taking and restoring snapshots

```bash
# Capture state at the end of a session
forge snapshot
# -> SNAP-001 saved to .forge/snapshots/SNAP-001.json

# Restore at the start of the next session
forge restore --snapshot SNAP-001
# -> Restores: project, architecture, execution, context state, all tasks, all decisions
# -> Regenerates: .forge/views/
# -> Prints: next-step briefing

# List all snapshots
forge snapshot --list
```

A snapshot captures the complete project state. Restore replays it fully — including context budget tracking — so the new session knows exactly where the project stands.

### Generated views

The `.forge/views/` directory contains Markdown files generated from JSON state:

| File | Contents |
|------|----------|
| `STATUS.md` | Project name, phase, status, goals, task counts by status, context budget |
| `TASKS.md` | All tasks grouped by status with IDs, titles, and owners |
| `PLAN.md` | Phase breakdown, goals, constraints, current wave |

These files are regenerated by any command that modifies state. They are safe to delete — `forge status` regenerates them. They are useful as context documents to paste into a new AI session when you do not want to restore a full snapshot.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values for your adapters.

```bash
cp .env.example .env
```

| Variable | Required by | Description |
|----------|-------------|-------------|
| `ANTHROPIC_API_KEY` | adapter-claude-code | Anthropic API key (`sk-ant-...`) |
| `ANTHROPIC_MODEL` | adapter-claude-code | Model override (e.g. `claude-sonnet-4-6`) |
| `ANTHROPIC_BASE_URL` | adapter-claude-code | API base URL override (for proxies) |
| `OPENAI_API_KEY` | adapter-opencode | OpenAI API key if OpenCode uses OpenAI |
| `FORGE_BASE_URL` | verifier-playwright | Base URL of the running app to verify |
| `FORGE_SESSION_FILE` | verifier-playwright | Path to Playwright auth storage state |
| `FORGE_DIR` | cli | Override the `.forge/` directory path |
| `FORGE_LOG_LEVEL` | cli | Log level: `debug`, `info`, `warn`, `error` |

Forge reads no environment variables directly. Each adapter reads the variables it requires when initialized.

---

## Development

### Build from source

```bash
git clone <repo-url>
cd forge
npm install
npm run build
```

### Run tests

```bash
npm test                                    # all 196+ tests across all packages
npm test --workspace=packages/core          # core engine only
npm test --workspace=packages/cli           # CLI formatters only
```

### Watch mode

```bash
npm run dev --workspace=packages/cli
npm run dev --workspace=packages/core
```

### Clean build artifacts

```bash
npm run clean    # removes all dist/, *.tsbuildinfo, compiled test files
```

### Repository layout

```
forge/
  packages/
    types/               @forge-agent/types
    core/                @forge-agent/core
    cli/                 @forge-agent/cli
    adapter-claude-code/ @forge-agent/adapter-claude-code
    adapter-opencode/    @forge-agent/adapter-opencode
    verifier-test-runner/@forge-agent/verifier-test-runner
    verifier-playwright/ @forge-agent/verifier-playwright
  docs/
    plans/               architecture design and implementation plan
  .forge/                created at runtime (gitignored)
  .env.example           environment variable template
```

### Technical stack

- **TypeScript** — strict mode, ESM, NodeNext module resolution
- **tsup** — ESM build with DTS generation per package
- **vitest** — testing with workspace configuration
- **commander.js** — CLI argument parsing
- **kleur** — terminal colors (no stack traces in user-facing errors)

---

## Package Reference

| Package | Version | Description |
|---------|---------|-------------|
| `@forge-agent/types` | 0.1.0 | Shared TypeScript interfaces and type definitions |
| `@forge-agent/core` | 0.1.0 | Core engine: state, tasks, context, reviews, gates |
| `@forge-agent/cli` | 0.1.0 | CLI entry point with 12 commands |
| `@forge-agent/adapter-claude-code` | 0.1.0 | Executor adapter for the `claude` CLI |
| `@forge-agent/adapter-opencode` | 0.1.0 | Executor adapter for the `opencode` CLI |
| `@forge-agent/verifier-test-runner` | 0.1.0 | Verifier: runs shell test commands |
| `@forge-agent/verifier-playwright` | 0.1.0 | Verifier: browser-based QA via Playwright |

---

## License

MIT
