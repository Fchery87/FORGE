# Forge

[![CI](https://github.com/Fchery87/FORGE/actions/workflows/ci.yml/badge.svg)](https://github.com/Fchery87/FORGE/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@forge-core/cli)](https://www.npmjs.com/package/@forge-core/cli)
[![Node](https://img.shields.io/node/v/@forge-core/cli)](https://nodejs.org)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](#license)

**The local workflow system for AI coding agents that need to ship real software.**

Forge gives coding agents the structure they usually lack: explicit roles, enforceable workflow stages, durable project state, review and QA gates, and a native skills layer that shapes how work gets done. Instead of treating each session like a fresh prompt, Forge keeps the project moving from planning through ship with a single source of truth on disk.

Every piece of state Forge reads from or writes to disk is runtime-validated against a Zod schema. Corrupt files are rejected with precise, actionable errors instead of silent failures.

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

Modern AI coding agents are strong at solving isolated tasks. They are much weaker at running a project for days, across many tasks, without drifting. Common failure modes:

- **Context rot** — the context window fills with stale information; quality degrades silently
- **No state** — each session starts cold, losing all decisions, rationale, and progress
- **No gates** — agents merge untested code, skip reviews, or ship before QA
- **No accountability** — there is no clear record of what was done, why, and by whom

Forge solves this by adding the missing operating system around the agent:

- a **manager layer** that plans and tracks work
- a **builder layer** that implements against scoped context
- an **executive layer** that enforces review, QA, and ship readiness
- a **skills layer** that injects the right workflow guidance at the right time

The result is a local-first system for agents that need to behave more like an engineering organization and less like a chat session.

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

Forge is a TypeScript ESM monorepo with eight packages arranged in three layers:

```
Layer 3: Adapters (plug-in executors and verifiers)
  @forge-core/adapter-claude-code   — dispatches work to the claude CLI
  @forge-core/adapter-codex         — dispatches work to the codex CLI
  @forge-core/adapter-opencode      — dispatches work to the opencode CLI
  @forge-core/verifier-test-runner  — runs shell test commands
  @forge-core/verifier-playwright   — browser-based QA via Playwright

Layer 2: Contracts (shared TypeScript interfaces and runtime schemas)
  @forge-core/types                 — all data schemas, Zod validators, and plugin interfaces

Layer 1: Core Engine (business logic, no I/O except .forge/ state files)
  @forge-core/core                  — Orchestrator, StateManager, TaskEngine,
                                       ContextEngine, ReviewEngine, GateKeeper,
                                       IdGenerator

CLI Surface
  @forge-core/cli                   — 14 commands, structured error handling,
                                       terminal formatters, JSON output
```

### Native Skills Layer

Forge includes a native skills layer on top of the workflow engine:

- **Skills** are typed manifests plus instruction/reference assets that Forge resolves per command and phase.
- **Personas** are typed prompt overlays for review, QA, and ship workflows.
- **Hooks** are declarative lifecycle events that can inject guidance, attach references, or block unsafe transitions.

These are Forge-managed primitives, not loose prompt files. Host integrations for Codex, Claude Code, and OpenCode are generated from Forge config and the active built-in or project-local registry, so workflow behavior stays consistent across hosts.

### Data Flow

```
CLI Command
  -> Command runner   — catches structured errors, sets exit code
  -> Orchestrator     — activates role, checks permissions and preconditions
  -> StateManager     — reads current project state from .forge/ (schema-validated)
  -> Domain module    — TaskEngine / ReviewEngine / ContextEngine applies logic
  -> Executor or Verifier — dispatched for AI work or verification
  -> GateKeeper       — validates the state transition is permitted
  -> StateManager     — writes updated state atomically to .forge/ (schema-validated)
  -> ContextEngine    — regenerates .forge/views/ Markdown files
  -> CLI formatter    — renders terminal output (or JSON with --json)
```

### Core Module Responsibilities

**Orchestrator** — Command dispatcher and role router. Enforces that each command is valid in the current project phase and is performed by the correct role. Stateless — runs once per command invocation.

**StateManager** — Sole module with read/write access to `.forge/` JSON state files. Provides typed accessors for all five state domains. All reads and writes are validated against Zod schemas — corrupt or invalid files are rejected with `ForgeValidationError` before they reach the engine. Handles atomic writes (write to `.tmp`, then `rename`) to prevent partial state on crash.

**TaskEngine** — Task CRUD and state machine enforcement. Validates every transition against `TASK_TRANSITIONS`. Queries tasks by status, phase, or readiness (dependencies all `done`).

**ContextEngine** — Generates context packs for executor dispatch. Tracks token budget. Produces digests (state, decisions, changes, next-steps). Manages snapshot write/restore. Regenerates Markdown views.

**ReviewEngine** — Runs typed review checklists (implementation, architecture, QA, ship). Persists `ReviewArtifact` JSON. Computes `approved` / `rejected` / `conditional` verdicts.

**GateKeeper** — Pure validation. No side effects. Checks gate preconditions before each task transition: tests written and passing, acceptance criteria verified, review approved, verification passed.

**IdGenerator** — Sequential, persistent IDs (`TASK-001`, `SNAP-001`, `REV-001`). Counters are stored in `config.json` and incremented atomically.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State format | JSON source of truth + generated Markdown views | Single unambiguous source; human-readable views regenerated on demand |
| State integrity | Zod schema validation at every I/O boundary | Corrupt or tampered files are caught immediately with field-level error detail |
| Atomic writes | Write to `.tmp`, then `rename` | No corrupt state on crash or power loss |
| Error handling | Structured CLI errors with centralized exit codes | Commands never call `process.exit()` directly; all failures flow through typed error classes |
| Plugin interfaces | `Executor` and `Verifier` are plain TypeScript interfaces | Any adapter that satisfies the interface works; core stays lightweight |
| Context packs | Scoped bundle per task | Executor receives only relevant context, not entire project history |
| Sequential IDs | Human-readable padded counters | `TASK-001` is easier to work with than `uuid-abc-123` |
| CLI-first | No web dashboard in v1 | JSON state enables a future dashboard; don't build it speculatively |

---

## Installation

### Prerequisites

- Node.js 20 or later
- npm 9 or later
- An AI coding agent CLI (see [Executor Adapters](#executor-adapters))

### Install the CLI

```bash
npm install -g @forge-core/cli
```

Verify the installation:

```bash
forge --version
forge --help
forge           # polished welcome / project-aware dashboard
```

By default, running `forge` with no subcommand opens a polished landing screen. Outside a Forge project it shows a first-run guide. Inside a directory with `.forge/`, it shows a mini dashboard with project status, progress, and context health.

### Install Forge into your host agent

```bash
# Pick the agent you actually use
forge install codex
forge install claude-code
forge install opencode

# Confirm the host integration and executor binary
forge doctor
```

Forge generates host-facing integration files from its own registry and config. You do not need to maintain separate prompt files for each host.

---

## Quick Start

This walkthrough creates a project from scratch and takes it through the full Forge lifecycle.

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

### 2. Capture the project goals

```bash
forge intake "Build a REST API with Express, PostgreSQL, and JWT authentication"
forge intake "All endpoints must have OpenAPI documentation"
```

Use `intake` to record the outcomes that matter before the agent starts planning. Add as many goals and constraints as needed.

### 3. See what Forge knows

```bash
forge                    # welcome screen outside a project, mini dashboard inside one
forge status             # summary view
forge status --verbose   # includes task details
forge status --json      # machine-readable output
```

### 4. Create the plan

```bash
forge plan
```

This moves the project into `planning` and creates the first planning artifact. From there, Forge can track tasks, dependencies, and readiness instead of treating planning as an unstructured conversation.

### 5. Dispatch the next task

```bash
forge execute                    # picks the next ready task automatically
forge execute --task TASK-001    # execute a specific task
forge execute --wave             # execute all ready tasks
```

Forge generates a scoped **context pack** for the task, activates the relevant skills and personas, and dispatches the work through your configured executor. The agent gets just enough context to act without dragging the whole project history into every run.

### 6. Move completed work into review

```bash
forge merge --task TASK-001
```

Before the task can enter review, Forge checks the gate conditions. If tests are still failing or acceptance criteria are not verified, the transition is rejected with explicit reasons instead of letting weak work drift forward.

### 7. Run the review

```bash
forge review              # implementation review
forge review --arch       # architecture review (required before shipping by default)
forge review --pass-all   # approve all checklist items
```

Review checklists are tailored to the workflow stage. Approved reviews become durable artifacts in `.forge/reviews/`, which means review history survives restarts instead of disappearing into chat logs.

### 8. Verify the result

```bash
forge qa             # runs configured verifiers
forge qa --pass      # mark QA as passed manually
```

Verifiers run against tasks in `qa_pending` and store evidence alongside the result. Screenshots, logs, and test output live in `.forge/qa/` so QA has a real audit trail.

### 9. Ship with a final checkpoint

```bash
forge ship --dry-run    # check readiness without shipping
forge ship              # validate all gates and mark the project shipped
```

Ship is the final gate. Forge checks task completion, review approval, and QA status before marking the project `shipped` and capturing a final snapshot.

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

Forge commands are grouped by role on purpose. The split is part of the product, not just a documentation convenience.

### Commands

| Command | Role | Description |
|---------|------|-------------|
| `forge init` | Manager | Create the Forge workspace and baseline state |
| `forge install <host>` | Manager | Install Forge host integration for a supported agent CLI |
| `forge doctor` | Manager | Validate host integration and executor availability |
| `forge intake <goal>` | Manager | Record goals, constraints, and delivery intent |
| `forge plan` | Manager | Move the project into planning and create planning work |
| `forge status` | Manager | Show project health, progress, and context budget |
| `forge execute` | Builder | Dispatch the next ready task with scoped runtime context |
| `forge merge` | Builder | Submit completed work to Forge’s review gates |
| `forge review` | Executive | Run implementation or architecture review with checklist artifacts |
| `forge qa` | Executive | Run verification and record QA evidence |
| `forge ship` | Executive | Validate release readiness and mark the project shipped |
| `forge snapshot` | Manager | Capture a full handoff snapshot of current state |
| `forge restore` | Manager | Restore the project from a saved snapshot |
| `forge config` | Manager | Read or update Forge configuration |
| `forge skills` | Manager | Inspect discovered skills and explain how a skill is defined |

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

Forge stores configuration in `.forge/config.json`. You can edit it directly, but in normal use you should prefer `forge config` so changes stay deliberate and inspectable.

### What configuration controls

Configuration decides:

- which host and executor Forge uses
- which verifiers define QA
- how aggressively Forge manages context budget
- whether the native skills, personas, and hooks layers are active

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
| `skills.enabled` | boolean | `true` | Enable Forge's native skills registry and activation |
| `skills.search_paths` | string[] | `[".forge/skills"]` | Project-local skill search paths |
| `skills.auto_activate` | boolean | `true` | Inject the Forge meta-skill automatically |
| `personas.default_for_review` | string | `null` | Default persona overlay for `forge review` |
| `hooks.enabled` | boolean | `true` | Enable declarative Forge lifecycle hooks |
| `testing.test_command` | string | `npm test` | Command the test-runner verifier executes |
| `testing.test_pattern` | string | `**/*.test.ts` | Glob pattern for test files |
| `review.require_architecture_review` | boolean | `true` | Require `forge review --arch` before shipping |
| `review.require_qa_before_ship` | boolean | `true` | Require `forge qa` pass before shipping |
| `review.auto_review_on_merge` | boolean | `false` | Auto-run review when a task is merged |

---

## Executor Adapters

Executors are the bridge between Forge’s workflow engine and the AI coding agent you actually use. Forge owns the workflow, state, skills, and context packing. The executor’s job is to deliver that runtime context to the host and return a structured result.

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

### Claude Code (`@forge-core/adapter-claude-code`)

Generates Claude-specific host files in `.claude/` and dispatches work to the `claude` CLI when `forge execute` runs.

```bash
forge install claude-code
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

### OpenCode (`@forge-core/adapter-opencode`)

Generates OpenCode host files in `.opencode/` and dispatches work to the `opencode` CLI when `forge execute` runs.

```bash
forge install opencode
forge config adapter.executor opencode
```

**How it works:** Same pattern — temp file prompt, `opencode run --print <file>`, parse last JSON line.

**Requirements:** `opencode` CLI installed and configured with a provider API key.

### Codex (`@forge-core/adapter-codex`)

Generates Codex host files in `.codex/` and dispatches work to the `codex` CLI via `codex exec` when `forge execute` runs.

```bash
forge install codex
forge config adapter.executor codex
```

**How it works:** Forge writes the rendered context pack to `.forge/runtime/<task>.md`, streams that prompt into `codex exec`, and parses the final JSON result written by Codex.

**Requirements:** `codex` CLI installed and authenticated.

### Custom Executors

```typescript
import type { Executor, ExecutorConfig, TaskContext, ExecutorResult } from '@forge-core/types'

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

Verifiers are how Forge turns “looks good” into actual proof. They validate completed work and return structured evidence, issues, and pass/fail status.

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

### Test Runner (`@forge-core/verifier-test-runner`)

Runs a shell test command and parses the output for pass/fail signals.

Configuration in `config.json`:
```json
{
  "verification": {
    "verifiers": [
      {
        "name": "test-runner",
        "package": "@forge-core/verifier-test-runner",
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

### Playwright (`@forge-core/verifier-playwright`)

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
        "package": "@forge-core/verifier-playwright",
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
import type { Verifier, VerifierConfig, VerificationPlan, VerificationResult, VerificationType } from '@forge-core/types'

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

### Atomic writes and state integrity

Every state mutation uses a crash-safe write pattern:
1. Data is validated against its Zod schema before serialization
2. New content written to `<file>.tmp`
3. File atomically renamed to replace the original

A crash during any write leaves a `.tmp` file, never a corrupt state file. The original is always preserved until the new content is fully written.

If a file on disk is corrupt or does not match the expected schema, Forge throws `ForgeValidationError` with the file path and a list of specific fields that failed validation. This makes it straightforward to diagnose and fix state problems without guessing.

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

Context management is one of Forge’s main reasons to exist. Agents lose quality as sessions get longer. Forge keeps context scoped, tracked, and restorable.

### Context packs

Each task dispatch includes a **context pack** built for that specific step of work:

- Task definition, description, and rationale
- Acceptance criteria and test requirements
- Project goals and architecture summary
- Decisions made during the project
- Files in scope for the task
- Current execution progress
- Active skills and persona overlays for the command
- Verification gates that must be satisfied before the next transition

The executor gets only what it needs for that run, not the entire project history. Forge also budgets skill and reference payloads so packs stay bounded as the system grows.

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

### Use the local CLI globally during development

```bash
npm run dev:link
```

This rebuilds the workspace and refreshes the global `forge` symlink to your local `packages/cli` build. Use it when you want the `forge` command on your machine to reflect your latest local changes.

To go back to the published npm version later:

```bash
cd packages/cli
npm unlink -g
npm install -g @forge-core/cli
```

### Run tests

```bash
npm test                                    # all tests across all packages
npm test --workspace=packages/core          # core engine only
npm test --workspace=packages/types         # types and schema validation only
npm test --workspace=packages/cli           # CLI commands and formatters
```

### Type checking

```bash
npm run typecheck                           # type-check all packages without emitting
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
    types/               @forge-core/types      — interfaces and Zod runtime schemas
    core/                @forge-core/core
    cli/                 @forge-core/cli
    adapter-claude-code/ @forge-core/adapter-claude-code
    adapter-codex/       @forge-core/adapter-codex
    adapter-opencode/    @forge-core/adapter-opencode
    verifier-test-runner/@forge-core/verifier-test-runner
    verifier-playwright/ @forge-core/verifier-playwright
  docs/                  architecture design, execution plans, implementation specs
  .forge/                created at runtime (gitignored)
  .env.example           environment variable template
```

### Technical stack

- **TypeScript 6** — strict mode, ESM, NodeNext module resolution
- **Zod 4** — runtime schema validation for all persisted state and config
- **tsdown 0.21.7** — ESM build with DTS generation per package (powered by Rolldown)
- **vitest 4** — testing with workspace configuration
- **commander 14** — CLI argument parsing
- **kleur** — terminal colors and visual formatting primitives
- **ora** — spinners for long-running terminal operations
- **@clack/prompts** — beautiful prompt primitives for future interactive flows

---

## Package Reference

| Package | Version | Description |
|---------|---------|-------------|
| `@forge-core/types` | 0.1.0 | Shared TypeScript interfaces, Zod runtime schemas, and validation helpers |
| `@forge-core/core` | 0.1.0 | Core engine: state, tasks, context, reviews, gates |
| `@forge-core/cli` | 0.1.0 | CLI entry point with 14 commands and structured error handling |
| `@forge-core/adapter-claude-code` | 0.1.0 | Executor adapter for the `claude` CLI |
| `@forge-core/adapter-codex` | 0.1.0 | Executor adapter for the `codex` CLI |
| `@forge-core/adapter-opencode` | 0.1.0 | Executor adapter for the `opencode` CLI |
| `@forge-core/verifier-test-runner` | 0.1.0 | Verifier: runs shell test commands |
| `@forge-core/verifier-playwright` | 0.1.0 | Verifier: browser-based QA via Playwright |

---

## License

Copyright © 2026 Fchery87. All rights reserved.

Forge is proprietary software. You may install and use the published npm packages (`@forge-core/*`) in your own projects free of charge. You may **not** copy, modify, merge, distribute, sublicense, or sell copies of the source code, nor create derivative works or competing products based on Forge, without explicit written permission from the copyright holder.

See the [LICENSE](LICENSE) file for full terms.
