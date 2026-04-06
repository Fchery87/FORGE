import { describe, it, expect } from 'vitest'
import { REVIEW_CHECKLISTS, DEFAULT_CONFIG } from '../src/index.js'
import type {
  ContextPack,
  ContextBudget,
  Digest,
  ReviewArtifact,
  ForgeConfig,
  Snapshot,
} from '../src/index.js'

describe('REVIEW_CHECKLISTS', () => {
  it('has entries for all four review types', () => {
    expect(REVIEW_CHECKLISTS.architecture.length).toBeGreaterThan(0)
    expect(REVIEW_CHECKLISTS.implementation.length).toBeGreaterThan(0)
    expect(REVIEW_CHECKLISTS.qa.length).toBeGreaterThan(0)
    expect(REVIEW_CHECKLISTS.ship.length).toBeGreaterThan(0)
  })

  it('ship checklist includes task completion check', () => {
    expect(REVIEW_CHECKLISTS.ship.some(item =>
      item.toLowerCase().includes('done')
    )).toBe(true)
  })
})

describe('DEFAULT_CONFIG', () => {
  it('has correct default executor', () => {
    expect(DEFAULT_CONFIG.adapter.executor).toBe('claude-code')
  })

  it('has correct default context budget', () => {
    expect(DEFAULT_CONFIG.context.budget_warning_threshold).toBe(80000)
    expect(DEFAULT_CONFIG.context.context_window_estimate).toBe(128000)
  })

  it('has zeroed ID counters', () => {
    const ids = DEFAULT_CONFIG.ids
    expect(ids.task_counter).toBe(0)
    expect(ids.decision_counter).toBe(0)
    expect(ids.review_counter).toBe(0)
    expect(ids.qa_counter).toBe(0)
    expect(ids.snapshot_counter).toBe(0)
  })
})

describe('ContextPack shape', () => {
  it('full ContextPack is valid', () => {
    const pack: ContextPack = {
      pack_id: 'PACK-001',
      generated_at: '2026-04-05T00:00:00Z',
      target_role: 'builder',
      target_task: 'TASK-001',
      estimated_tokens: 5000,
      sections: {
        objective: 'Implement the feature',
        task: null,
        constraints: ['No external deps'],
        relevant_decisions: [],
        relevant_files: ['src/feature.ts'],
        recent_changes: [],
        open_issues: [],
        state_digest: 'Phase 1, 0/5 tasks done',
      },
    }
    expect(pack.target_role).toBe('builder')
    expect(pack.sections.task).toBeNull()
  })
})

describe('ReviewArtifact shape', () => {
  it('full ReviewArtifact is valid', () => {
    const review: ReviewArtifact = {
      review_id: 'REV-001',
      type: 'implementation',
      task_ids: ['TASK-001'],
      reviewer_role: 'executive',
      verdict: 'approved',
      checklist: [{ item: 'Tests pass', passed: true, note: null }],
      findings: [],
      required_actions: [],
      created_at: '2026-04-05T00:00:00Z',
    }
    expect(review.verdict).toBe('approved')
  })
})
