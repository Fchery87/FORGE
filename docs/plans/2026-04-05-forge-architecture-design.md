# Forge Architecture Design

**Date**: 2026-04-05
**Status**: Approved
**Author**: Principal Systems Architect

## 1. Vision

Forge is an installable local AI coding agent framework for long-running software delivery. It functions like an internal software organization with three built-in roles: Builder (writes code), Manager (maintains state), and Executive (enforces quality). It is not a SaaS product, not a browser-first tool, and not a one-shot prompt wrapper.

Forge fuses three operating philosophies into one cohesive system:

- **Builder discipline**: test-first development, small implementation units, isolated subagent execution, code review before completion
- **State discipline**: canonical project memory on disk, clean context windows, fresh execution contexts per task, state restoration after resets
- **Quality discipline**: explicit review gates, verification evidence, browser-based validation for web projects, ship-readiness checks

The result is a framework where planning, execution, review, and QA are structurally separate concerns with enforced transitions.

## 2. Key Architecture Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Architecture model | Hybrid: standalone TS core + host adapter layers | Portability and testability from standalone core; native integration from thin adapters |
| 2 | Worker execution | Pluggable Executor interface | Clean separation: Forge owns orchestration, executors own code generation |
| 3 | State format | JSON core + generated Markdown views | Single unambiguous source of truth; readable views generated on demand |
| 4 | Role model | Explicit mode switching with structural permissions | Commands map to roles; role enforcement is structural, not just behavioral |
| 5 | Browser QA | Plugin Verifier interface | Core stays lightweight; Playwright is one verifier among many |
| 6 | Distribution | npm package + CLI with adapter installers | Standard TS tooling; `forge install <host>` keeps integration clean |
| 7 | Context engineering | Auto context packs + budget tracking | Resists context rot systematically; operator sees context health |
| 8 | Operator interface | CLI-only for v1, dashboard-ready architecture | JSON state enables future dashboard; don't build it yet |

## 3. System Architecture

### 3.1 Three-Layer Model

```
Layer 3: Adapters        @forge-agent/adapter-claude-code
                         @forge-agent/adapter-opencode
                         @forge-agent/verifier-playwright
                         @forge-agent/verifier-test-runner

Layer 2: Interfaces      @forge-agent/types
                         (Executor, Verifier, all data schemas)

Layer 1: Core Engine     @forge-agent/core
                         (Orchestrator, StateManager, TaskEngine,
                          ContextEngine, ReviewEngine, GateKeeper)

CLI Surface:             @forge-agent/cli
                         (Commands, formatters, terminal output)
```

### 3.2 Data Flow

```
CLI Command
  -> Orchestrator (role activation, permission check)
    -> StateManager (read current state)
    -> TaskEngine / ReviewEngine / ContextEngine (domain logic)
    -> Executor or Verifier (dispatched via plugin interface)
    -> Result returned
    -> GateKeeper (validate transition)
    -> StateManager (write updated state)
    -> ContextEngine (regenerate views if needed)
  -> CLI formatter (terminal output)
```

### 3.3 Module Responsibilities

**Orchestrator** (`orchestrator.ts`)
Command dispatcher and role router. Receives CLI commands, activates the correct role mode, coordinates between modules. Enforces that Builder mode cannot write state, Manager mode cannot write source files, Executive mode cannot bypass gates. Not a long-running loop — processes one command and exits.

**StateManager** (`state-manager.ts`)
Sole module with read/write access to `.forge/state/` JSON files. Provides typed accessors for project, architecture, execution, and context state. Handles atomic writes (write to temp, rename) to prevent corruption. Manages ID generation via counters in config.

**TaskEngine** (`task-engine.ts`)
Task CRUD operations and state machine enforcement. Creates task files in `.forge/tasks/`. Validates every transition against the state machine rules. Queries tasks by status, phase, dependencies. Determines task readiness (all dependencies met).

**ContextEngine** (`context-engine.ts`)
Generates context packs for workers and role transitions. Estimates token budgets using character-count heuristics. Produces digests: state digest, decision digest, changes digest, next-step briefing. Manages snapshots and restore flow. Regenerates Markdown views in `.forge/views/`.

**ReviewEngine** (`review-engine.ts`)
Runs review checklists for each gate type. Produces ReviewArtifact JSON files. Determines approve/reject/conditional verdicts. Creates required_actions lists for rejected reviews.

**GateKeeper** (`gate-keeper.ts`)
Pure validation logic. Before any task transition, checks that required evidence exists. Rules:
- `-> in_review`: tests written + passing, acceptance criteria self-assessed
- `-> qa_pending`: review artifact with approval exists
- `-> done`: verification result with pass status exists
Returns pass/fail with specific reasons.

### 3.4 Plugin Interfaces

```typescript
// Executor: how work gets done
interface Executor {
  name: string;
  initialize(config: ExecutorConfig): Promise<void>;
  dispatch(context: TaskContext): Promise<ExecutorResult>;
  dispose(): Promise<void>;
}

interface TaskContext {
  task: Task;
  context_pack: ContextPack;
  working_directory: string;
}

interface ExecutorResult {
  task_id: string;
  status: "completed" | "failed" | "partial";
  summary: string;
  files_changed: FileChange[];
  tests_added: string[];
  tests_run: TestRunResult[];
  acceptance_criteria_status: CriterionStatus[];
  issues: string[];
  merge_recommendation: "merge" | "revise" | "reject";
}

// Verifier: how work gets validated
interface Verifier {
  name: string;
  supports: VerificationType[];
  initialize(config: VerifierConfig): Promise<void>;
  verify(plan: VerificationPlan): Promise<VerificationResult>;
  dispose(): Promise<void>;
}
```

### 3.5 Role Permission Matrix

| Operation | Builder | Manager | Executive |
|---|---|---|---|
| Read state | scoped | full | full |
| Write source files | yes | no | no |
| Write state files | no | yes | no |
| Create tasks | no | yes | no |
| Transition tasks | limited | full | limited |
| Approve/reject reviews | no | no | yes |
| Spawn workers | no | yes | no |
| Run verifiers | no | no | yes |

## 4. State System

### 4.1 Directory Structure

```
.forge/
  config.json                   # Project config, adapter settings, ID counters
  state/
    project.json                # Identity, goals, phase, status
    architecture.json           # Design decisions, risks, dependencies
    execution.json              # Phases, current wave, progress summary
    context.json                # Budget tracking, session metadata
  tasks/
    TASK-001.json               # One file per task
    TASK-002.json
  decisions/
    DEC-001.json                # Architectural/design decisions
  reviews/
    REV-001.json                # Review pass artifacts
  qa/
    QA-001.json                 # QA run results
    evidence/                   # Screenshots, logs, captures
  snapshots/
    SNAP-001.json               # Full state snapshots
  views/                        # Generated Markdown (read-only projection)
    STATUS.md
    PLAN.md
    TASKS.md
    CONTEXT.md
```

### 4.2 State Schemas

```typescript
// project.json
interface ProjectState {
  name: string;
  description: string;
  goals: string[];
  constraints: string[];
  current_phase: string;
  current_status: "intake" | "planning" | "executing" | "reviewing" | "shipping" | "shipped";
  created_at: string;
  updated_at: string;
}

// architecture.json
interface ArchitectureState {
  design_summary: string;
  technical_decisions: Decision[];
  open_questions: string[];
  dependencies: Dependency[];
  risk_register: Risk[];
  updated_at: string;
}

interface Decision {
  decision_id: string;
  title: string;
  description: string;
  rationale: string;
  status: "proposed" | "accepted" | "superseded";
  created_at: string;
}

interface Risk {
  id: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  mitigation: string;
  status: "open" | "mitigated" | "accepted";
}

// execution.json
interface ExecutionState {
  phases: Phase[];
  current_wave: number;
  total_tasks: number;
  tasks_done: number;
  tasks_in_progress: number;
  tasks_blocked: number;
  updated_at: string;
}

interface Phase {
  phase_id: string;
  name: string;
  description: string;
  task_ids: string[];
  status: "pending" | "active" | "complete";
}

// context.json
interface ContextState {
  session_id: string;
  estimated_tokens_used: number;
  budget_warning_threshold: number;
  context_window_estimate: number;
  last_snapshot: string | null;
  last_digest_at: string;
  recent_actions: string[];        // Rolling buffer, last 20
  updated_at: string;
}
```

### 4.3 Task Schema

```typescript
interface Task {
  task_id: string;
  title: string;
  description: string;
  rationale: string;
  phase: string;
  owner_role: "builder" | "manager" | "executive";
  dependencies: string[];
  files_in_scope: string[];
  constraints: string[];
  acceptance_criteria: AcceptanceCriterion[];
  test_requirements: TestRequirement[];
  review_requirements: string[];
  qa_requirements: string[];
  status: TaskStatus;
  evidence: Evidence[];
  result: ExecutorResult | null;
  created_at: string;
  updated_at: string;
}

interface AcceptanceCriterion {
  id: string;
  description: string;
  verified: boolean;
  evidence_ref: string | null;
}

interface TestRequirement {
  type: "unit" | "integration" | "e2e";
  description: string;
  test_file: string | null;
  status: "pending" | "written" | "passing" | "failing";
}

interface Evidence {
  type: "test_result" | "screenshot" | "review" | "log" | "manual";
  description: string;
  artifact_path: string;
  created_at: string;
}

type TaskStatus =
  | "draft"
  | "planned"
  | "ready"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "qa_pending"
  | "done"
  | "rejected";
```

### 4.4 Task State Machine

```
draft ---------> planned          Manager defines task fully
planned -------> ready            Manager confirms dependencies met
ready ---------> in_progress      Builder picks up task
in_progress ---> blocked          Builder hits blocker
blocked -------> in_progress      Blocker resolved
in_progress ---> in_review        Builder submits with evidence
in_review -----> rejected         Executive rejects
in_review -----> qa_pending       Executive approves implementation
rejected ------> in_progress      Builder reworks
qa_pending ----> done             Verifier passes
qa_pending ----> in_progress      Verifier fails, task reopened
```

Gate requirements:
- `-> in_review`: at least one test written, tests passing, acceptance criteria self-assessed
- `-> qa_pending`: review artifact with approval exists
- `-> done`: verification result with pass status

### 4.5 Context Pack Schema

```typescript
interface ContextPack {
  pack_id: string;
  generated_at: string;
  target_role: "builder" | "manager" | "executive";
  target_task: string | null;
  estimated_tokens: number;
  sections: {
    objective: string;
    task: Task | null;
    constraints: string[];
    relevant_decisions: Decision[];
    relevant_files: string[];
    recent_changes: string[];
    open_issues: string[];
    state_digest: string;
  };
}
```

### 4.6 Review Artifact Schema

```typescript
interface ReviewArtifact {
  review_id: string;
  type: "architecture" | "implementation" | "qa" | "ship";
  task_ids: string[];
  reviewer_role: "executive";
  verdict: "approved" | "rejected" | "conditional";
  checklist: ChecklistItem[];
  findings: string[];
  required_actions: string[];
  created_at: string;
}

interface ChecklistItem {
  item: string;
  passed: boolean;
  note: string | null;
}
```

### 4.7 Verification Schemas

```typescript
interface VerificationPlan {
  plan_id: string;
  task_ids: string[];
  scope: "task" | "phase" | "full";
  changed_files: string[];
  acceptance_criteria: AcceptanceCriterion[];
  strategies: VerificationType[];
}

type VerificationType = "unit" | "integration" | "e2e" | "browser";

interface VerificationResult {
  plan_id: string;
  status: "pass" | "fail" | "partial";
  checks: CheckResult[];
  evidence: EvidenceArtifact[];
  issues: Issue[];
  summary: string;
  created_at: string;
}

interface CheckResult {
  name: string;
  type: VerificationType;
  status: "pass" | "fail" | "skip";
  duration_ms: number;
  output: string | null;
}

interface EvidenceArtifact {
  type: "screenshot" | "console_log" | "network_log" | "test_output" | "coverage";
  path: string;
  description: string;
}

interface Issue {
  severity: "critical" | "major" | "minor" | "info";
  description: string;
  file: string | null;
  task_id: string | null;
  auto_reopen: boolean;
}
```

## 5. Configuration Schema

```typescript
interface ForgeConfig {
  project: {
    name: string;
    description: string;
    goals: string[];
  };
  adapter: {
    executor: string;
    executor_options: Record<string, unknown>;
  };
  verification: {
    verifiers: VerifierConfig[];
    default_strategy: VerificationType[];
  };
  context: {
    budget_warning_threshold: number;
    context_window_estimate: number;
    auto_digest_on_merge: boolean;
  };
  testing: {
    test_command: string;
    test_pattern: string;
    coverage_command: string | null;
  };
  review: {
    require_architecture_review: boolean;
    require_qa_before_ship: boolean;
    auto_review_on_merge: boolean;
  };
  ids: {
    task_counter: number;
    decision_counter: number;
    review_counter: number;
    qa_counter: number;
    snapshot_counter: number;
  };
}

interface VerifierConfig {
  name: string;
  package: string | null;
  options: Record<string, unknown>;
}
```

## 6. Command Surface

Every command follows: read state -> validate preconditions -> perform operation -> write state -> print summary. All commands exit 0 on success, 1 on failure. `--json` flag available for programmatic output.

| Command | Role | Operation |
|---------|------|-----------|
| `forge init [--name]` | Manager | Scaffold `.forge/`, set project identity |
| `forge intake <goal>` | Manager | Capture goal, clarify scope, produce intake artifact |
| `forge plan` | Manager | Generate phases and tasks from intake |
| `forge execute [--task ID] [--wave]` | Builder | Pick next ready task or run parallel wave, dispatch to executor |
| `forge merge [--task ID]` | Manager | Validate executor result, merge into state |
| `forge review [--arch] [--task ID]` | Executive | Run review checklist, produce review artifact |
| `forge qa [--task ID] [--phase] [--full]` | Executive | Dispatch verification plan, store evidence |
| `forge ship` | Executive | Final gate check, produce release report |
| `forge status [--verbose]` | Manager | Regenerate views, print summary |
| `forge snapshot [--name]` | Manager | Serialize full state to snapshot |
| `forge restore [--snapshot ID]` | Manager | Load snapshot, print "you are here" briefing |
| `forge config [key] [value]` | Manager | View or update config |

### Workflow Lifecycle

```
forge intake -> forge plan -> [forge execute -> forge merge]* -> forge review -> forge qa -> forge ship
                                      ^                                  |
                                      |       (rejection loop)           |
                                      +----------------------------------+
```

The `execute -> merge` loop repeats per task. `--wave` mode dispatches independent tasks in parallel.

## 7. Verification Design

### 7.1 Built-in Verifiers

**TestRunnerVerifier** (`@forge-agent/verifier-test-runner`)
- Executes configured test command
- Parses output for pass/fail/skip counts
- Maps test files to tasks via `files_in_scope`
- Returns structured CheckResult array

**PlaywrightVerifier** (`@forge-agent/verifier-playwright`) - optional
- Manages persistent browser lifecycle
- Reusable session/auth state via stored cookies
- Screenshots on assertion and on failure
- Console error and network failure capture
- Route coverage tracking
- Evidence stored in `.forge/qa/evidence/`

### 7.2 QA Capabilities

The verification system answers:
- What routes/flows were tested?
- What changed since last pass?
- What failed and with what evidence?
- Is the build ship-ready?

Failed verification creates issues that feed back into the task system. Tasks reopen automatically when `auto_reopen: true`.

## 8. Review Gate Design

### 8.1 Four Gates

**Architecture Review** (`forge review --arch`)
Triggered after `forge plan`, before execution.
Checklist: design coherence, risk identification, dependency sanity, scope appropriateness, test strategy coverage.

**Implementation Review** (`forge review`)
Triggered after `forge merge`, before QA.
Checklist: code matches task spec, no scope creep, tests exist and pass, no obvious defects, files touched match files_in_scope.

**QA Review** (`forge qa`)
Triggered after implementation review passes.
Checklist: acceptance criteria met with evidence, no regressions, error handling works, edge cases covered.

**Ship Review** (`forge ship`)
Final gate before delivery.
Checklist: all tasks done, all reviews approved, all QA passed, no open blockers, decision log complete, state consistent.

### 8.2 Rejection Flow

Rejected review -> required_actions list -> tasks transition back to in_progress -> rework -> re-review. No shortcuts.

## 9. Context Engineering Design

### 9.1 Automatic Context Packs

Before every worker dispatch or role transition, ContextEngine generates a scoped ContextPack containing only what that operation needs. Workers never receive full project history.

### 9.2 Budget Tracking

Token estimation via character count / 4 heuristic. Session tracks cumulative context load. Warning emitted at configurable threshold (default 80k tokens). Recommendation: `forge snapshot` + fresh session.

### 9.3 Digest Types

- **State digest**: 1-paragraph project status
- **Decision digest**: numbered list of active decisions
- **Changes digest**: what shipped since last snapshot
- **Next-step briefing**: what the next command should do and why

### 9.4 Snapshot/Restore

`forge snapshot` serializes all state + task index + decision index into one JSON blob. `forge restore` loads it, regenerates digests, prints a "you are here" summary. Enables session recovery without history replay.

## 10. Package Structure

```
forge/
  package.json                   # Workspace root
  tsconfig.json
  packages/
    types/                       # @forge-agent/types
      src/
        index.ts
        state.ts
        task.ts
        context.ts
        review.ts
        verification.ts
        executor.ts
        verifier.ts
        config.ts
    core/                        # @forge-agent/core
      src/
        index.ts
        orchestrator.ts
        state-manager.ts
        task-engine.ts
        context-engine.ts
        review-engine.ts
        gate-keeper.ts
        id-generator.ts
      __tests__/
    cli/                         # @forge-agent/cli
      src/
        index.ts
        commands/
          init.ts
          intake.ts
          plan.ts
          execute.ts
          merge.ts
          review.ts
          qa.ts
          ship.ts
          status.ts
          snapshot.ts
          restore.ts
          config.ts
        formatters/
          status.ts
          task.ts
          review.ts
        utils/
          logger.ts
          cli-args.ts
      bin/
        forge.ts
    adapter-claude-code/         # @forge-agent/adapter-claude-code
      src/
        executor.ts
        installer.ts
        templates/
    adapter-opencode/            # @forge-agent/adapter-opencode
      src/
        executor.ts
        installer.ts
    verifier-test-runner/        # @forge-agent/verifier-test-runner
      src/
        index.ts
    verifier-playwright/         # @forge-agent/verifier-playwright
      src/
        index.ts
        browser-manager.ts
        evidence-capture.ts
```

## 11. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Executor adapters produce inconsistent result formats | High | Strict ExecutorResult schema validation at merge boundary; reject malformed results |
| Token budget heuristic is inaccurate | Medium | Character/4 is a floor estimate; allow config override; track actual usage where host exposes it |
| State corruption from partial writes | High | Atomic writes (temp file + rename); snapshots as recovery mechanism |
| Task state machine too rigid for edge cases | Medium | `blocked` status as escape valve; Manager can force-transition with logged override |
| Playwright verifier adds heavy dependency | Low | Optional package; only installed when configured; core has zero browser dependency |
| Host agent ignores role permission constraints | Medium | Structural enforcement in Orchestrator (reject write operations in wrong mode); adapters validate |
| Context packs miss critical information | Medium | Include state digest in every pack as safety net; operator can inspect packs via `forge status --verbose` |
