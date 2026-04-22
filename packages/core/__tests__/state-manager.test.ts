import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateManager, ForgeValidationError } from '../src/index.js'

let forgeDir: string
let sm: StateManager

beforeEach(async () => {
  forgeDir = await mkdtemp(join(tmpdir(), 'forge-test-'))
  sm = new StateManager(forgeDir)
  await sm.initialize()
})

afterEach(async () => {
  await rm(forgeDir, { recursive: true, force: true })
})

describe('StateManager.initialize', () => {
  it('creates all required directories', async () => {
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(forgeDir, 'state'))).toBe(true)
    expect(existsSync(join(forgeDir, 'tasks'))).toBe(true)
    expect(existsSync(join(forgeDir, 'decisions'))).toBe(true)
    expect(existsSync(join(forgeDir, 'reviews'))).toBe(true)
    expect(existsSync(join(forgeDir, 'snapshots'))).toBe(true)
  })
})

describe('StateManager config', () => {
  it('returns default config when file does not exist', async () => {
    const config = await sm.getConfig()
    expect(config.adapter.executor).toBe('claude-code')
    expect(config.ids.task_counter).toBe(0)
  })

  it('updates config and persists', async () => {
    await sm.updateConfig({ project: { name: 'my-project', description: '', goals: [] } })
    const config = await sm.getConfig()
    expect(config.project.name).toBe('my-project')
  })
})

describe('StateManager project', () => {
  it('returns default project state when file does not exist', async () => {
    const project = await sm.getProject()
    expect(project.current_status).toBe('intake')
    expect(project.goals).toEqual([])
  })

  it('roundtrips project state', async () => {
    await sm.updateProject({ name: 'test-project', goals: ['ship v1'] })
    const project = await sm.getProject()
    expect(project.name).toBe('test-project')
    expect(project.goals).toEqual(['ship v1'])
  })

  it('sets updated_at on update', async () => {
    const before = new Date().toISOString()
    await sm.updateProject({ name: 'test' })
    const project = await sm.getProject()
    expect(project.updated_at >= before).toBe(true)
  })
})

describe('StateManager tasks', () => {
  it('returns null for nonexistent task', async () => {
    const task = await sm.getTask('TASK-001')
    expect(task).toBeNull()
  })

  it('saves and retrieves a task', async () => {
    const task = {
      task_id: 'TASK-001',
      title: 'Test task',
      description: 'A task',
      rationale: 'Testing',
      phase: 'phase-1',
      owner_role: 'builder' as const,
      dependencies: [],
      files_in_scope: [],
      constraints: [],
      acceptance_criteria: [],
      test_requirements: [],
      review_requirements: [],
      qa_requirements: [],
      status: 'draft' as const,
      evidence: [],
      result: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await sm.saveTask(task)
    const retrieved = await sm.getTask('TASK-001')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.title).toBe('Test task')
  })

  it('lists all tasks', async () => {
    const base = {
      title: 'T', description: 'D', rationale: 'R', phase: 'p1',
      owner_role: 'builder' as const, dependencies: [], files_in_scope: [],
      constraints: [], acceptance_criteria: [], test_requirements: [],
      review_requirements: [], qa_requirements: [], status: 'draft' as const,
      evidence: [], result: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    await sm.saveTask({ ...base, task_id: 'TASK-001' })
    await sm.saveTask({ ...base, task_id: 'TASK-002' })
    const tasks = await sm.listTasks()
    expect(tasks).toHaveLength(2)
  })
})

describe('StateManager atomic write', () => {
  it('roundtrips execution state without corruption', async () => {
    await sm.updateExecution({ current_wave: 3, total_tasks: 10, tasks_done: 5 })
    const exec = await sm.getExecution()
    expect(exec.current_wave).toBe(3)
    expect(exec.total_tasks).toBe(10)
    expect(exec.tasks_done).toBe(5)
  })
})

describe('StateManager validation', () => {
  it('rejects invalid config on read', async () => {
    await writeFile(
      join(forgeDir, 'config.json'),
      JSON.stringify({ project: { name: 123 } }),
    )
    await expect(sm.getConfig()).rejects.toThrow(ForgeValidationError)
  })

  it('rejects invalid project state on read', async () => {
    await writeFile(
      join(forgeDir, 'state', 'project.json'),
      JSON.stringify({ current_status: 'bogus' }),
    )
    await expect(sm.getProject()).rejects.toThrow(ForgeValidationError)
  })

  it('rejects invalid task on read', async () => {
    await writeFile(
      join(forgeDir, 'tasks', 'TASK-001.json'),
      JSON.stringify({ task_id: 'TASK-001', status: 'unknown' }),
    )
    await expect(sm.getTask('TASK-001')).rejects.toThrow(ForgeValidationError)
  })

  it('rejects invalid task on write', async () => {
    const badTask = {
      task_id: 'TASK-001',
      title: 'Test',
      status: 'invalid_status',
    }
    await expect(sm.saveTask(badTask as never)).rejects.toThrow(ForgeValidationError)
  })

  it('rejects invalid execution state on read', async () => {
    await writeFile(
      join(forgeDir, 'state', 'execution.json'),
      JSON.stringify({ phases: 'not-an-array' }),
    )
    await expect(sm.getExecution()).rejects.toThrow(ForgeValidationError)
  })

  it('rejects invalid context state on read', async () => {
    await writeFile(
      join(forgeDir, 'state', 'context.json'),
      JSON.stringify({ session_id: 123 }),
    )
    await expect(sm.getContext()).rejects.toThrow(ForgeValidationError)
  })

  it('returns default values for missing files', async () => {
    const config = await sm.getConfig()
    expect(config.adapter.executor).toBe('claude-code')

    const project = await sm.getProject()
    expect(project.current_status).toBe('intake')

    const execution = await sm.getExecution()
    expect(execution.phases).toEqual([])
  })

  it('rejects corrupt JSON with ForgeValidationError', async () => {
    await writeFile(join(forgeDir, 'config.json'), '{ not valid json }')
    await expect(sm.getConfig()).rejects.toThrow(ForgeValidationError)
  })
})
