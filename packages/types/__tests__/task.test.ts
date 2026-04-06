import { describe, it, expect } from 'vitest'
import { TASK_TRANSITIONS } from '../src/index.js'
import type {
  Task,
  TaskStatus,
  AcceptanceCriterion,
  TestRequirement,
  Evidence,
  ExecutorResult,
} from '../src/index.js'

describe('TASK_TRANSITIONS', () => {
  it('covers all TaskStatus values', () => {
    const allStatuses: TaskStatus[] = [
      'draft', 'planned', 'ready', 'in_progress',
      'blocked', 'in_review', 'qa_pending', 'done', 'rejected',
    ]
    for (const status of allStatuses) {
      expect(TASK_TRANSITIONS).toHaveProperty(status)
    }
  })

  it('draft can only transition to planned', () => {
    expect(TASK_TRANSITIONS.draft).toEqual(['planned'])
  })

  it('done has no valid transitions', () => {
    expect(TASK_TRANSITIONS.done).toEqual([])
  })

  it('in_progress can go to blocked or in_review', () => {
    expect(TASK_TRANSITIONS.in_progress).toContain('blocked')
    expect(TASK_TRANSITIONS.in_progress).toContain('in_review')
  })

  it('qa_pending can go to done or back to in_progress', () => {
    expect(TASK_TRANSITIONS.qa_pending).toContain('done')
    expect(TASK_TRANSITIONS.qa_pending).toContain('in_progress')
  })
})

describe('Task shape', () => {
  it('full Task object is valid', () => {
    const criterion: AcceptanceCriterion = {
      id: 'AC-001',
      description: 'Returns correct type',
      verified: false,
      evidence_ref: null,
    }
    const testReq: TestRequirement = {
      type: 'unit',
      description: 'Unit test for the function',
      test_file: null,
      status: 'pending',
    }
    const evidence: Evidence = {
      type: 'test_result',
      description: 'Vitest output',
      artifact_path: '.forge/qa/evidence/test-output.txt',
      created_at: '2026-04-05T00:00:00Z',
    }
    const task: Task = {
      task_id: 'TASK-001',
      title: 'Implement feature X',
      description: 'Add feature X to the system',
      rationale: 'Required by spec',
      phase: 'phase-1',
      owner_role: 'builder',
      dependencies: [],
      files_in_scope: ['src/feature-x.ts'],
      constraints: ['No external deps'],
      acceptance_criteria: [criterion],
      test_requirements: [testReq],
      review_requirements: ['Code reviewed by Executive'],
      qa_requirements: ['Unit tests pass'],
      status: 'draft',
      evidence: [evidence],
      result: null,
      created_at: '2026-04-05T00:00:00Z',
      updated_at: '2026-04-05T00:00:00Z',
    }
    expect(task.task_id).toBe('TASK-001')
    expect(task.status).toBe('draft')
    expect(task.result).toBeNull()
  })

  it('ExecutorResult shape is valid', () => {
    const result: ExecutorResult = {
      task_id: 'TASK-001',
      status: 'completed',
      summary: 'Implementation complete',
      files_changed: [{ path: 'src/foo.ts', operation: 'added' }],
      tests_added: ['src/foo.test.ts'],
      tests_run: [{
        test_file: 'src/foo.test.ts',
        passed: 3,
        failed: 0,
        skipped: 0,
        duration_ms: 42,
        output: null,
      }],
      acceptance_criteria_status: [{
        criterion_id: 'AC-001',
        passed: true,
        notes: null,
      }],
      issues: [],
      merge_recommendation: 'merge',
    }
    expect(result.status).toBe('completed')
    expect(result.merge_recommendation).toBe('merge')
  })
})
