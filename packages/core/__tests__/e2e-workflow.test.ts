import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  StateManager,
  IdGenerator,
  TaskEngine,
  ContextEngine,
  ReviewEngine,
  GateKeeper,
} from '../src/index.js'

let forgeDir: string

beforeEach(async () => {
  forgeDir = await mkdtemp(join(tmpdir(), 'forge-e2e-'))
})

afterEach(async () => {
  await rm(forgeDir, { recursive: true, force: true })
})

describe('Forge end-to-end workflow', () => {
  it('runs the full lifecycle: init → intake → plan → execute → merge → review → qa → ship', async () => {
    // ----------------------------------------------------------------
    // Step 1: Init
    // ----------------------------------------------------------------
    const sm = new StateManager(forgeDir)
    await sm.initialize()

    // Verify project state exists (returns default without error)
    const initialProject = await sm.getProject()
    expect(initialProject.current_status).toBe('intake')
    expect(initialProject.goals).toEqual([])

    // ----------------------------------------------------------------
    // Step 2: Intake
    // ----------------------------------------------------------------
    await sm.updateProject({
      name: 'todo-app',
      description: 'A simple todo application',
      goals: ['Build a todo app'],
      current_status: 'intake',
    })

    const intakeProject = await sm.getProject()
    expect(intakeProject.goals).toEqual(['Build a todo app'])
    expect(intakeProject.name).toBe('todo-app')
    expect(intakeProject.current_status).toBe('intake')

    // ----------------------------------------------------------------
    // Step 3: Plan
    // ----------------------------------------------------------------
    const gen = new IdGenerator(sm)
    const taskEngine = new TaskEngine(sm, gen)

    // Create a planning task
    const planningTask = await taskEngine.createTask({
      title: 'Design todo app architecture',
      description: 'Decide on the architecture for the todo app',
      rationale: 'Need a solid design before implementation',
      phase: 'phase-1',
      owner_role: 'manager',
      dependencies: [],
      files_in_scope: ['src/architecture.md'],
      constraints: ['Keep it simple'],
      acceptance_criteria: [
        { id: 'ac-1', description: 'Architecture document exists', verified: false, evidence_ref: null },
      ],
      test_requirements: [],
      review_requirements: ['architecture-review'],
      qa_requirements: [],
    })

    // Create an implementation task that depends on planning
    const implTask = await taskEngine.createTask({
      title: 'Implement todo list CRUD',
      description: 'Build create/read/update/delete for todo items',
      rationale: 'Core functionality of the app',
      phase: 'phase-1',
      owner_role: 'builder',
      dependencies: [planningTask.task_id],
      files_in_scope: ['src/todo.ts', 'src/todo.test.ts'],
      constraints: [],
      acceptance_criteria: [
        { id: 'ac-1', description: 'Can create a todo item', verified: false, evidence_ref: null },
        { id: 'ac-2', description: 'Can mark todo as complete', verified: false, evidence_ref: null },
      ],
      test_requirements: [
        { type: 'unit', description: 'Unit tests for CRUD operations', test_file: null, status: 'pending' },
      ],
      review_requirements: ['implementation-review'],
      qa_requirements: ['functional-qa'],
    })

    // Transition both tasks from draft → planned
    await taskEngine.transition(planningTask.task_id, 'planned')
    await taskEngine.transition(implTask.task_id, 'planned')

    await sm.updateExecution({ total_tasks: 2 })
    await sm.updateProject({ current_status: 'planning' })

    const allTasks = await taskEngine.listTasks()
    expect(allTasks).toHaveLength(2)

    const plannedTasks = await taskEngine.listByStatus('planned')
    expect(plannedTasks).toHaveLength(2)

    const planProject = await sm.getProject()
    expect(planProject.current_status).toBe('planning')

    // ----------------------------------------------------------------
    // Step 4: Execute
    // ----------------------------------------------------------------
    // planningTask has no dependencies → it's ready
    const readyTasks = await taskEngine.getReadyTasks()
    expect(readyTasks.some(t => t.task_id === planningTask.task_id)).toBe(true)
    // implTask still has unresolved dependency → not ready
    expect(readyTasks.some(t => t.task_id === implTask.task_id)).toBe(false)

    // Transition planning task: planned → ready → in_progress
    await taskEngine.transition(planningTask.task_id, 'ready')
    await taskEngine.transition(planningTask.task_id, 'in_progress')

    // Generate a context pack with ContextEngine
    const contextEngine = new ContextEngine(sm, gen, forgeDir)
    const pack = await contextEngine.generateContextPack('manager', planningTask.task_id)

    expect(pack.pack_id).toBeTruthy()
    expect(pack.sections.objective).toContain(planningTask.task_id)

    await sm.updateProject({ current_status: 'executing' })

    const execProject = await sm.getProject()
    expect(execProject.current_status).toBe('executing')

    // ----------------------------------------------------------------
    // Step 5: Merge (submit for review)
    // ----------------------------------------------------------------
    // Attach a mock ExecutorResult and set acceptance criteria + tests to passing
    await taskEngine.updateTask(planningTask.task_id, {
      acceptance_criteria: [
        { id: 'ac-1', description: 'Architecture document exists', verified: true, evidence_ref: 'src/architecture.md' },
      ],
      test_requirements: [
        { type: 'unit', description: 'Architecture validation test', test_file: 'tests/arch.test.ts', status: 'passing' },
      ],
      result: {
        task_id: planningTask.task_id,
        status: 'completed',
        summary: 'Architecture designed and documented',
        files_changed: [{ path: 'src/architecture.md', operation: 'added' }],
        tests_added: ['tests/arch.test.ts'],
        tests_run: [],
        acceptance_criteria_status: [{ criterion_id: 'ac-1', passed: true, notes: null }],
        issues: [],
        merge_recommendation: 'merge',
      },
    })

    const planningTaskUpdated = await taskEngine.getTask(planningTask.task_id)
    const gateKeeper = new GateKeeper()
    const gateResult = gateKeeper.canSubmitForReview(planningTaskUpdated)
    expect(gateResult.allowed).toBe(true)
    expect(gateResult.reasons).toHaveLength(0)

    // Transition to in_review
    await taskEngine.transition(planningTask.task_id, 'in_review')

    const inReviewTask = await taskEngine.getTask(planningTask.task_id)
    expect(inReviewTask.status).toBe('in_review')

    // ----------------------------------------------------------------
    // Step 6: Review
    // ----------------------------------------------------------------
    const reviewEngine = new ReviewEngine(sm, gen, forgeDir)
    const review = await reviewEngine.createReview('implementation', [planningTask.task_id])

    expect(review.review_id).toBeTruthy()
    expect(review.verdict).toBe('rejected') // default until evaluated

    // Build all-pass results for every checklist item
    const allPassResults = review.checklist.map((_, idx) => ({
      item_index: idx,
      passed: true,
    }))

    const evaluatedReview = await reviewEngine.evaluateChecklist(review.review_id, allPassResults)
    expect(evaluatedReview.verdict).toBe('approved')

    // Verify GateKeeper allows QA transition
    const allReviews = await reviewEngine.listReviewsForTask(planningTask.task_id)
    const qaGate = gateKeeper.canApproveForQA(planningTaskUpdated, allReviews)
    expect(qaGate.allowed).toBe(true)

    // Transition to qa_pending
    await taskEngine.transition(planningTask.task_id, 'qa_pending')

    const qaPendingTask = await taskEngine.getTask(planningTask.task_id)
    expect(qaPendingTask.status).toBe('qa_pending')

    // ----------------------------------------------------------------
    // Step 7: QA
    // ----------------------------------------------------------------
    // Simulate a passing verification result — GateKeeper.canMarkDone requires at least one
    const verifications = [
      {
        plan_id: 'vplan-001',
        status: 'pass' as const,
        checks: [],
        evidence: [],
        issues: [],
        summary: 'All acceptance criteria verified',
        created_at: new Date().toISOString(),
      },
    ]

    const doneGate = gateKeeper.canMarkDone(qaPendingTask, verifications)
    expect(doneGate.allowed).toBe(true)

    // Transition to done
    await taskEngine.transition(planningTask.task_id, 'done')

    const doneTask = await taskEngine.getTask(planningTask.task_id)
    expect(doneTask.status).toBe('done')

    // Update execution state
    await sm.updateExecution({ tasks_done: 1 })
    const execState = await sm.getExecution()
    expect(execState.tasks_done).toBe(1)

    // ----------------------------------------------------------------
    // Step 8: Ship
    // ----------------------------------------------------------------
    // Verify all tasks that are done (we mark implTask done directly for the ship check)
    // First, get implTask through the dependency chain
    await taskEngine.transition(implTask.task_id, 'ready')
    await taskEngine.transition(implTask.task_id, 'in_progress')
    await taskEngine.updateTask(implTask.task_id, {
      acceptance_criteria: [
        { id: 'ac-1', description: 'Can create a todo item', verified: true, evidence_ref: 'test-output' },
        { id: 'ac-2', description: 'Can mark todo as complete', verified: true, evidence_ref: 'test-output' },
      ],
      test_requirements: [
        { type: 'unit', description: 'Unit tests for CRUD operations', test_file: 'src/todo.test.ts', status: 'passing' },
      ],
    })
    await taskEngine.transition(implTask.task_id, 'in_review')
    await taskEngine.transition(implTask.task_id, 'qa_pending')
    await taskEngine.transition(implTask.task_id, 'done')
    await sm.updateExecution({ tasks_done: 2 })

    // Verify all tasks done
    const finalTasks = await taskEngine.listTasks()
    const allDone = finalTasks.every(t => t.status === 'done')
    expect(allDone).toBe(true)

    const finalExec = await sm.getExecution()
    expect(finalExec.tasks_done).toBe(finalTasks.length)

    // Update project status to shipped
    await sm.updateProject({ current_status: 'shipped' })

    const shippedProject = await sm.getProject()
    expect(shippedProject.current_status).toBe('shipped')

    // Generate a final snapshot
    const finalSnapshot = await contextEngine.generateSnapshot('post-ship')

    expect(finalSnapshot.snapshot_id).toBeTruthy()
    expect(finalSnapshot.label).toBe('post-ship')
    expect(finalSnapshot.data.project.current_status).toBe('shipped')
    expect(Object.keys(finalSnapshot.data.task_index)).toHaveLength(2)

    // Verify snapshot was written to disk
    const snapshotRaw = await sm.readRaw(`snapshots/${finalSnapshot.snapshot_id}.json`)
    expect(snapshotRaw).not.toBeNull()
  })
})
