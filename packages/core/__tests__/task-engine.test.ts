import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateManager, IdGenerator, TaskEngine, TaskTransitionError, TaskNotFoundError } from '../src/index.js'
import type { CreateTaskInput } from '../src/index.js'

let forgeDir: string
let sm: StateManager
let gen: IdGenerator
let engine: TaskEngine

const baseTask = (): CreateTaskInput => ({
  title: 'Test Task',
  description: 'A test task',
  rationale: 'Testing',
  phase: 'phase-1',
  owner_role: 'builder',
  dependencies: [],
  files_in_scope: ['src/foo.ts'],
  constraints: [],
  acceptance_criteria: [],
  test_requirements: [],
  review_requirements: [],
  qa_requirements: [],
})

beforeEach(async () => {
  forgeDir = await mkdtemp(join(tmpdir(), 'forge-test-'))
  sm = new StateManager(forgeDir)
  await sm.initialize()
  gen = new IdGenerator(sm)
  engine = new TaskEngine(sm, gen)
})

afterEach(async () => {
  await rm(forgeDir, { recursive: true, force: true })
})

describe('TaskEngine.createTask', () => {
  it('creates task with auto-generated ID', async () => {
    const task = await engine.createTask(baseTask())
    expect(task.task_id).toBe('TASK-001')
    expect(task.status).toBe('draft')
    expect(task.evidence).toEqual([])
    expect(task.result).toBeNull()
  })

  it('sequential IDs for multiple tasks', async () => {
    const t1 = await engine.createTask(baseTask())
    const t2 = await engine.createTask(baseTask())
    expect(t1.task_id).toBe('TASK-001')
    expect(t2.task_id).toBe('TASK-002')
  })
})

describe('TaskEngine.getTask', () => {
  it('retrieves existing task', async () => {
    const created = await engine.createTask(baseTask())
    const retrieved = await engine.getTask(created.task_id)
    expect(retrieved.task_id).toBe(created.task_id)
    expect(retrieved.title).toBe('Test Task')
  })

  it('throws TaskNotFoundError for missing task', async () => {
    await expect(engine.getTask('TASK-999')).rejects.toThrow(TaskNotFoundError)
  })
})

describe('TaskEngine.transition', () => {
  it('valid transition succeeds', async () => {
    const task = await engine.createTask(baseTask())
    const updated = await engine.transition(task.task_id, 'planned')
    expect(updated.status).toBe('planned')
  })

  it('invalid transition throws TaskTransitionError', async () => {
    const task = await engine.createTask(baseTask())
    // draft -> done is invalid
    await expect(engine.transition(task.task_id, 'done')).rejects.toThrow(TaskTransitionError)
  })

  it('TaskTransitionError message includes valid options', async () => {
    const task = await engine.createTask(baseTask())
    try {
      await engine.transition(task.task_id, 'done')
    } catch (e) {
      expect(e).toBeInstanceOf(TaskTransitionError)
      const err = e as TaskTransitionError
      expect(err.currentStatus).toBe('draft')
      expect(err.attemptedStatus).toBe('done')
      expect(err.validTransitions).toEqual(['planned'])
    }
  })

  it('done status has no valid transitions', async () => {
    const task = await engine.createTask(baseTask())
    // Walk task to done state through valid transitions
    await engine.transition(task.task_id, 'planned')
    await engine.transition(task.task_id, 'ready')
    await engine.transition(task.task_id, 'in_progress')
    await engine.transition(task.task_id, 'in_review')
    await engine.transition(task.task_id, 'qa_pending')
    await engine.transition(task.task_id, 'done')

    await expect(engine.transition(task.task_id, 'in_progress')).rejects.toThrow(TaskTransitionError)
  })
})

describe('TaskEngine.listByStatus', () => {
  it('returns tasks with matching status', async () => {
    const t1 = await engine.createTask(baseTask())
    const t2 = await engine.createTask(baseTask())
    await engine.transition(t1.task_id, 'planned')

    const drafted = await engine.listByStatus('draft')
    const planned = await engine.listByStatus('planned')
    expect(drafted).toHaveLength(1)
    expect(planned).toHaveLength(1)
    expect(drafted[0].task_id).toBe(t2.task_id)
  })
})

describe('TaskEngine.getReadyTasks', () => {
  it('returns planned tasks with all dependencies done', async () => {
    const dep = await engine.createTask(baseTask())
    // Walk dep to done
    await engine.transition(dep.task_id, 'planned')
    await engine.transition(dep.task_id, 'ready')
    await engine.transition(dep.task_id, 'in_progress')
    await engine.transition(dep.task_id, 'in_review')
    await engine.transition(dep.task_id, 'qa_pending')
    await engine.transition(dep.task_id, 'done')

    // Create a dependent task
    const dependent = await engine.createTask({ ...baseTask(), dependencies: [dep.task_id] })
    await engine.transition(dependent.task_id, 'planned')

    const ready = await engine.getReadyTasks()
    expect(ready).toHaveLength(1)
    expect(ready[0].task_id).toBe(dependent.task_id)
  })

  it('does not return planned tasks with unfinished dependencies', async () => {
    const dep = await engine.createTask(baseTask())
    // dep stays in draft — not done

    const dependent = await engine.createTask({ ...baseTask(), dependencies: [dep.task_id] })
    await engine.transition(dependent.task_id, 'planned')

    const ready = await engine.getReadyTasks()
    expect(ready).toHaveLength(0)
  })

  it('returns planned tasks with no dependencies', async () => {
    const task = await engine.createTask(baseTask())
    await engine.transition(task.task_id, 'planned')

    const ready = await engine.getReadyTasks()
    expect(ready).toHaveLength(1)
  })
})
