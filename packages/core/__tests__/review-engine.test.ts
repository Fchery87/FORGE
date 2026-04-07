import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateManager, IdGenerator, ReviewEngine } from '../src/index.js'
import { REVIEW_CHECKLISTS } from '@forge-core/types'

let forgeDir: string
let sm: StateManager
let gen: IdGenerator
let engine: ReviewEngine

beforeEach(async () => {
  forgeDir = await mkdtemp(join(tmpdir(), 'forge-test-'))
  sm = new StateManager(forgeDir)
  await sm.initialize()
  gen = new IdGenerator(sm)
  engine = new ReviewEngine(sm, gen, forgeDir)
})

afterEach(async () => {
  await rm(forgeDir, { recursive: true, force: true })
})

describe('ReviewEngine.createReview', () => {
  it('creates architecture review with correct checklist', async () => {
    const review = await engine.createReview('architecture', ['TASK-001'])
    expect(review.review_id).toMatch(/^REV-\d+$/)
    expect(review.type).toBe('architecture')
    expect(review.task_ids).toEqual(['TASK-001'])
    expect(review.reviewer_role).toBe('executive')
    expect(review.verdict).toBe('rejected')  // default before evaluation
    expect(review.checklist).toHaveLength(REVIEW_CHECKLISTS.architecture.length)
    expect(review.checklist.every(item => !item.passed)).toBe(true)
  })

  it('creates implementation review with correct checklist items', async () => {
    const review = await engine.createReview('implementation', ['TASK-001', 'TASK-002'])
    expect(review.checklist.map(c => c.item)).toEqual(REVIEW_CHECKLISTS.implementation)
  })

  it('creates qa review', async () => {
    const review = await engine.createReview('qa', ['TASK-001'])
    expect(review.type).toBe('qa')
    expect(review.checklist).toHaveLength(REVIEW_CHECKLISTS.qa.length)
  })

  it('creates ship review', async () => {
    const review = await engine.createReview('ship', [])
    expect(review.type).toBe('ship')
    expect(review.checklist).toHaveLength(REVIEW_CHECKLISTS.ship.length)
  })

  it('sequential review IDs', async () => {
    const r1 = await engine.createReview('architecture', [])
    const r2 = await engine.createReview('implementation', [])
    expect(r1.review_id).toBe('REV-001')
    expect(r2.review_id).toBe('REV-002')
  })
})

describe('ReviewEngine.evaluateChecklist', () => {
  it('all passed → approved verdict', async () => {
    const review = await engine.createReview('architecture', ['TASK-001'])
    const results = review.checklist.map((_, idx) => ({ item_index: idx, passed: true }))
    const evaluated = await engine.evaluateChecklist(review.review_id, results)
    expect(evaluated.verdict).toBe('approved')
    expect(evaluated.checklist.every(c => c.passed)).toBe(true)
    expect(evaluated.required_actions).toHaveLength(0)
  })

  it('any failed → rejected verdict', async () => {
    const review = await engine.createReview('implementation', ['TASK-001'])
    const results = review.checklist.map((_, idx) => ({
      item_index: idx,
      passed: idx !== 0,  // first item fails
      note: idx === 0 ? 'Tests missing' : undefined,
    }))
    const evaluated = await engine.evaluateChecklist(review.review_id, results)
    expect(evaluated.verdict).toBe('rejected')
    expect(evaluated.required_actions.length).toBeGreaterThan(0)
    expect(evaluated.checklist[0].note).toBe('Tests missing')
  })

  it('verdict_override → conditional', async () => {
    const review = await engine.createReview('architecture', ['TASK-001'])
    const results = review.checklist.map((_, idx) => ({ item_index: idx, passed: true }))
    const evaluated = await engine.evaluateChecklist(
      review.review_id,
      results,
      { verdict_override: 'conditional', findings: ['Minor concern'] }
    )
    expect(evaluated.verdict).toBe('conditional')
    expect(evaluated.findings).toEqual(['Minor concern'])
  })

  it('generates required_actions from failed items', async () => {
    const review = await engine.createReview('qa', ['TASK-001'])
    // fail first two items
    const results = review.checklist.map((_, idx) => ({
      item_index: idx,
      passed: idx > 1,
    }))
    const evaluated = await engine.evaluateChecklist(review.review_id, results)
    expect(evaluated.required_actions).toHaveLength(2)
    expect(evaluated.required_actions[0]).toContain('Fix:')
  })

  it('throws on missing review ID', async () => {
    await expect(engine.evaluateChecklist('REV-999', [])).rejects.toThrow('not found')
  })
})

describe('ReviewEngine.listReviews', () => {
  it('returns empty array when no reviews', async () => {
    const reviews = await engine.listReviews()
    expect(reviews).toHaveLength(0)
  })

  it('lists all created reviews', async () => {
    await engine.createReview('architecture', [])
    await engine.createReview('implementation', [])
    const reviews = await engine.listReviews()
    expect(reviews).toHaveLength(2)
  })
})

describe('ReviewEngine.listReviewsForTask', () => {
  it('returns only reviews for specified task', async () => {
    await engine.createReview('architecture', ['TASK-001'])
    await engine.createReview('implementation', ['TASK-002'])
    const forTask1 = await engine.listReviewsForTask('TASK-001')
    expect(forTask1).toHaveLength(1)
    expect(forTask1[0].task_ids).toContain('TASK-001')
  })
})
