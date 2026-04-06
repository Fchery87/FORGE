import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateManager, IdGenerator } from '../src/index.js'

let forgeDir: string
let sm: StateManager
let gen: IdGenerator

beforeEach(async () => {
  forgeDir = await mkdtemp(join(tmpdir(), 'forge-test-'))
  sm = new StateManager(forgeDir)
  await sm.initialize()
  gen = new IdGenerator(sm)
})

afterEach(async () => {
  await rm(forgeDir, { recursive: true, force: true })
})

describe('IdGenerator.next', () => {
  it('generates TASK-001 as first task ID', async () => {
    const id = await gen.next('TASK')
    expect(id).toBe('TASK-001')
  })

  it('generates sequential IDs', async () => {
    const id1 = await gen.next('TASK')
    const id2 = await gen.next('TASK')
    const id3 = await gen.next('TASK')
    expect(id1).toBe('TASK-001')
    expect(id2).toBe('TASK-002')
    expect(id3).toBe('TASK-003')
  })

  it('persists counter across instances', async () => {
    await gen.next('TASK')
    await gen.next('TASK')

    // Create a new IdGenerator with same StateManager
    const gen2 = new IdGenerator(sm)
    const id = await gen2.next('TASK')
    expect(id).toBe('TASK-003')
  })

  it('generates independent counters for different prefixes', async () => {
    const taskId = await gen.next('TASK')
    const decId = await gen.next('DEC')
    const revId = await gen.next('REV')
    expect(taskId).toBe('TASK-001')
    expect(decId).toBe('DEC-001')
    expect(revId).toBe('REV-001')
  })

  it('handles counter beyond 999 (no truncation)', async () => {
    // Manually set counter to 999
    const config = await sm.getConfig()
    await sm.updateConfig({ ids: { ...config.ids, task_counter: 999 } })
    const id = await gen.next('TASK')
    expect(id).toBe('TASK-1000')  // Should expand, not wrap
  })

  it('generates all prefix types', async () => {
    const prefixes = ['TASK', 'DEC', 'REV', 'QA', 'SNAP'] as const
    for (const prefix of prefixes) {
      const id = await gen.next(prefix)
      expect(id).toMatch(new RegExp(`^${prefix}-\\d+$`))
    }
  })
})

describe('IdGenerator.peek', () => {
  it('returns next ID without incrementing counter', async () => {
    const peeked = await gen.peek('TASK')
    expect(peeked).toBe('TASK-001')

    // Counter should not have incremented
    const peeked2 = await gen.peek('TASK')
    expect(peeked2).toBe('TASK-001')
  })

  it('peek matches next after increment', async () => {
    const peeked = await gen.peek('DEC')
    const actual = await gen.next('DEC')
    expect(peeked).toBe(actual)
  })
})
