import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateManager, IdGenerator, ContextEngine } from '../src/index.js'

let forgeDir: string
let sm: StateManager
let gen: IdGenerator
let engine: ContextEngine

beforeEach(async () => {
  forgeDir = await mkdtemp(join(tmpdir(), 'forge-test-'))
  sm = new StateManager(forgeDir)
  await sm.initialize()
  gen = new IdGenerator(sm)
  engine = new ContextEngine(sm, gen, forgeDir)
})

afterEach(async () => {
  await rm(forgeDir, { recursive: true, force: true })
})

describe('ContextEngine.generateContextPack', () => {
  it('generates a pack for manager role without task', async () => {
    await sm.updateProject({ name: 'test-project' })
    const pack = await engine.generateContextPack('manager')
    expect(pack.target_role).toBe('manager')
    expect(pack.target_task).toBeNull()
    expect(pack.estimated_tokens).toBeGreaterThan(0)
    expect(pack.sections.task).toBeNull()
  })

  it('generates a scoped pack for a specific task', async () => {
    await sm.updateProject({ name: 'test-project' })
    const task = {
      task_id: 'TASK-001',
      title: 'Test task',
      description: 'Do something',
      rationale: 'Required',
      phase: 'phase-1',
      owner_role: 'builder' as const,
      dependencies: [],
      files_in_scope: ['src/foo.ts', 'src/bar.ts'],
      constraints: ['No external deps'],
      acceptance_criteria: [],
      test_requirements: [],
      review_requirements: [],
      qa_requirements: [],
      status: 'in_progress' as const,
      evidence: [],
      result: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await sm.saveTask(task)

    const pack = await engine.generateContextPack('builder', 'TASK-001')
    expect(pack.target_task).toBe('TASK-001')
    expect(pack.sections.task).not.toBeNull()
    expect(pack.sections.relevant_files).toContain('src/foo.ts')
    expect(pack.sections.constraints).toContain('No external deps')
  })

  it('estimated_tokens is positive and reasonable', async () => {
    const pack = await engine.generateContextPack('executive')
    expect(pack.estimated_tokens).toBeGreaterThan(0)
    expect(pack.estimated_tokens).toBeLessThan(100000)
  })

  it('updates context token usage', async () => {
    await engine.generateContextPack('manager')
    const ctx = await sm.getContext()
    expect(ctx.estimated_tokens_used).toBeGreaterThan(0)
  })
})

describe('ContextEngine.estimateTokens', () => {
  it('returns positive number proportional to content size', async () => {
    const smallPack = await engine.generateContextPack('manager')

    await sm.updateProject({ name: 'large-project', description: 'x'.repeat(10000) })
    const largePack = await engine.generateContextPack('manager')

    expect(largePack.estimated_tokens).toBeGreaterThan(smallPack.estimated_tokens)
  })
})

describe('ContextEngine.checkBudget', () => {
  it('returns healthy budget when usage is low', async () => {
    const budget = await engine.checkBudget()
    expect(budget.warning_active).toBe(false)
    expect(budget.recommendation).toBeNull()
  })

  it('activates warning when usage exceeds threshold', async () => {
    await sm.updateContext({
      estimated_tokens_used: 90000,
      budget_warning_threshold: 80000,
    })
    const budget = await engine.checkBudget()
    expect(budget.warning_active).toBe(true)
    expect(budget.recommendation).not.toBeNull()
  })
})

describe('ContextEngine.generateDigest', () => {
  it('generates state digest', async () => {
    await sm.updateProject({ name: 'my-project', current_status: 'executing' })
    const digest = await engine.generateDigest('state')
    expect(digest.type).toBe('state')
    expect(digest.content).toContain('my-project')
    expect(digest.generated_at).toBeTruthy()
  })

  it('generates decision digest with no decisions', async () => {
    const digest = await engine.generateDigest('decision')
    expect(digest.content).toContain('No accepted decisions')
  })

  it('generates changes digest', async () => {
    await sm.updateContext({ recent_actions: ['did thing A', 'did thing B'] })
    const digest = await engine.generateDigest('changes')
    expect(digest.content).toContain('did thing A')
  })

  it('generates next_step digest', async () => {
    await sm.updateProject({ name: 'test' })
    const digest = await engine.generateDigest('next_step')
    expect(digest.type).toBe('next_step')
    expect(digest.content).toContain('You are here')
  })
})

describe('ContextEngine.generateSnapshot and restoreSnapshot', () => {
  it('snapshot roundtrip preserves project state', async () => {
    await sm.updateProject({ name: 'snapshot-test', goals: ['goal-1'] })

    const snapshot = await engine.generateSnapshot('test-label')
    expect(snapshot.snapshot_id).toMatch(/^SNAP-\d+$/)
    expect(snapshot.label).toBe('test-label')

    // Corrupt the project state
    await sm.updateProject({ name: 'corrupted', goals: [] })

    // Restore
    const { briefing } = await engine.restoreSnapshot(snapshot.snapshot_id)
    const restored = await sm.getProject()
    expect(restored.name).toBe('snapshot-test')
    expect(restored.goals).toEqual(['goal-1'])
    expect(briefing).toContain('You are here')
  })

  it('updates context last_snapshot after generating snapshot', async () => {
    const snapshot = await engine.generateSnapshot()
    const ctx = await sm.getContext()
    expect(ctx.last_snapshot).toBe(snapshot.snapshot_id)
  })

  it('throws on missing snapshot', async () => {
    await expect(engine.restoreSnapshot('SNAP-999')).rejects.toThrow('not found')
  })
})

describe('ContextEngine.generateViews', () => {
  it('creates STATUS.md, TASKS.md, PLAN.md in views/', async () => {
    const { existsSync } = await import('node:fs')
    await sm.updateProject({ name: 'view-test' })
    await engine.generateViews()

    expect(existsSync(join(forgeDir, 'views', 'STATUS.md'))).toBe(true)
    expect(existsSync(join(forgeDir, 'views', 'TASKS.md'))).toBe(true)
    expect(existsSync(join(forgeDir, 'views', 'PLAN.md'))).toBe(true)
  })

  it('STATUS.md contains project name', async () => {
    await sm.updateProject({ name: 'my-awesome-project' })
    await engine.generateViews()
    const content = await readFile(join(forgeDir, 'views', 'STATUS.md'), 'utf-8')
    expect(content).toContain('my-awesome-project')
  })
})
