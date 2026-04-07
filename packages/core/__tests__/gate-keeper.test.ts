import { describe, it, expect } from 'vitest'
import { GateKeeper } from '../src/index.js'
import type { Task, ReviewArtifact, VerificationResult } from '@forge-core/types'

const gk = new GateKeeper()

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'TASK-001',
    title: 'Test Task',
    description: 'A test task',
    rationale: 'Testing',
    phase: 'phase-1',
    owner_role: 'builder',
    dependencies: [],
    files_in_scope: [],
    constraints: [],
    acceptance_criteria: [],
    test_requirements: [],
    review_requirements: [],
    qa_requirements: [],
    status: 'in_progress',
    evidence: [],
    result: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeReview(overrides: Partial<ReviewArtifact> = {}): ReviewArtifact {
  return {
    review_id: 'REV-001',
    type: 'implementation',
    task_ids: ['TASK-001'],
    reviewer_role: 'executive',
    verdict: 'approved',
    checklist: [],
    findings: [],
    required_actions: [],
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeVerification(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    plan_id: 'PLAN-001',
    status: 'pass',
    checks: [],
    evidence: [],
    issues: [],
    summary: 'All checks passed',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ── canSubmitForReview ─────────────────────────────────────────────────────

describe('GateKeeper.canSubmitForReview', () => {
  it('allows when there is a passing test and a verified criterion', () => {
    const task = makeTask({
      test_requirements: [
        { type: 'unit', description: 'unit tests', test_file: null, status: 'passing' },
      ],
      acceptance_criteria: [
        { id: 'AC-1', description: 'works', verified: true, evidence_ref: null },
      ],
    })

    const result = gk.canSubmitForReview(task)

    expect(result.allowed).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('fails when there are no test requirements at all', () => {
    const task = makeTask({
      test_requirements: [],
      acceptance_criteria: [
        { id: 'AC-1', description: 'works', verified: true, evidence_ref: null },
      ],
    })

    const result = gk.canSubmitForReview(task)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/passing/i)
  })

  it('fails when tests exist but none have status "passing"', () => {
    const task = makeTask({
      test_requirements: [
        { type: 'unit', description: 'unit tests', test_file: null, status: 'written' },
        { type: 'integration', description: 'int tests', test_file: null, status: 'failing' },
      ],
      acceptance_criteria: [
        { id: 'AC-1', description: 'works', verified: true, evidence_ref: null },
      ],
    })

    const result = gk.canSubmitForReview(task)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/passing/i)
  })

  it('fails when there are no acceptance criteria', () => {
    const task = makeTask({
      test_requirements: [
        { type: 'unit', description: 'unit tests', test_file: null, status: 'passing' },
      ],
      acceptance_criteria: [],
    })

    const result = gk.canSubmitForReview(task)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/verified/i)
  })

  it('fails when criteria exist but none are verified', () => {
    const task = makeTask({
      test_requirements: [
        { type: 'unit', description: 'unit tests', test_file: null, status: 'passing' },
      ],
      acceptance_criteria: [
        { id: 'AC-1', description: 'works', verified: false, evidence_ref: null },
        { id: 'AC-2', description: 'fast', verified: false, evidence_ref: null },
      ],
    })

    const result = gk.canSubmitForReview(task)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/verified/i)
  })

  it('returns two reasons when both tests and criteria requirements are unmet', () => {
    const task = makeTask({
      test_requirements: [
        { type: 'unit', description: 'unit tests', test_file: null, status: 'pending' },
      ],
      acceptance_criteria: [
        { id: 'AC-1', description: 'works', verified: false, evidence_ref: null },
      ],
    })

    const result = gk.canSubmitForReview(task)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(2)
  })
})

// ── canApproveForQA ────────────────────────────────────────────────────────

describe('GateKeeper.canApproveForQA', () => {
  it('allows when there is an approved review for this task', () => {
    const task = makeTask()
    const reviews = [makeReview({ task_ids: ['TASK-001'], verdict: 'approved' })]

    const result = gk.canApproveForQA(task, reviews)

    expect(result.allowed).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('fails when the reviews array is empty', () => {
    const task = makeTask()

    const result = gk.canApproveForQA(task, [])

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/TASK-001/)
  })

  it('fails when the review covers a different task', () => {
    const task = makeTask({ task_id: 'TASK-001' })
    const reviews = [makeReview({ task_ids: ['TASK-002'], verdict: 'approved' })]

    const result = gk.canApproveForQA(task, reviews)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
  })

  it('fails when the review for this task has verdict "rejected"', () => {
    const task = makeTask()
    const reviews = [makeReview({ task_ids: ['TASK-001'], verdict: 'rejected' })]

    const result = gk.canApproveForQA(task, reviews)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/approved/i)
  })

  it('fails when the review for this task has verdict "conditional"', () => {
    const task = makeTask()
    const reviews = [makeReview({ task_ids: ['TASK-001'], verdict: 'conditional' })]

    const result = gk.canApproveForQA(task, reviews)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
  })

  it('allows when one of multiple reviews covers this task with approved verdict', () => {
    const task = makeTask({ task_id: 'TASK-001' })
    const reviews = [
      makeReview({ review_id: 'REV-001', task_ids: ['TASK-002'], verdict: 'approved' }),
      makeReview({ review_id: 'REV-002', task_ids: ['TASK-001'], verdict: 'approved' }),
    ]

    const result = gk.canApproveForQA(task, reviews)

    expect(result.allowed).toBe(true)
  })
})

// ── canMarkDone ────────────────────────────────────────────────────────────

describe('GateKeeper.canMarkDone', () => {
  it('allows when there is at least one passing verification', () => {
    const task = makeTask()
    const verifications = [makeVerification({ status: 'pass' })]

    const result = gk.canMarkDone(task, verifications)

    expect(result.allowed).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('fails when the verifications array is empty', () => {
    const task = makeTask()

    const result = gk.canMarkDone(task, [])

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/TASK-001/)
  })

  it('fails when all verifications have status "fail"', () => {
    const task = makeTask()
    const verifications = [
      makeVerification({ status: 'fail' }),
      makeVerification({ plan_id: 'PLAN-002', status: 'fail' }),
    ]

    const result = gk.canMarkDone(task, verifications)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toMatch(/verification/i)
  })

  it('fails when all verifications have status "partial"', () => {
    const task = makeTask()
    const verifications = [makeVerification({ status: 'partial' })]

    const result = gk.canMarkDone(task, verifications)

    expect(result.allowed).toBe(false)
    expect(result.reasons).toHaveLength(1)
  })

  it('allows when at least one verification passes even if others fail', () => {
    const task = makeTask()
    const verifications = [
      makeVerification({ plan_id: 'PLAN-001', status: 'fail' }),
      makeVerification({ plan_id: 'PLAN-002', status: 'pass' }),
    ]

    const result = gk.canMarkDone(task, verifications)

    expect(result.allowed).toBe(true)
  })
})
