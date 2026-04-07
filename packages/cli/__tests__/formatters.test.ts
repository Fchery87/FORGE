import { describe, it, expect } from 'vitest'
import { formatStatus, progressBar } from '../src/formatters/status.js'
import { formatTask, formatTaskList } from '../src/formatters/task.js'
import { formatReview } from '../src/formatters/review.js'
import type { ProjectState, ExecutionState, ContextState, Task, ReviewArtifact } from '@forge-core/types'

const mockProject: ProjectState = {
  name: 'test-project',
  description: 'A test',
  goals: ['ship it'],
  constraints: [],
  current_phase: 'phase-1',
  current_status: 'executing',
  created_at: '2026-04-05T00:00:00Z',
  updated_at: '2026-04-05T00:00:00Z',
}

const mockExecution: ExecutionState = {
  phases: [],
  current_wave: 1,
  total_tasks: 5,
  tasks_done: 2,
  tasks_in_progress: 1,
  tasks_blocked: 0,
  updated_at: '2026-04-05T00:00:00Z',
}

const mockContext: ContextState = {
  session_id: 'sess-001',
  estimated_tokens_used: 10000,
  budget_warning_threshold: 80000,
  context_window_estimate: 128000,
  last_snapshot: null,
  last_digest_at: '2026-04-05T00:00:00Z',
  recent_actions: [],
  updated_at: '2026-04-05T00:00:00Z',
}

const mockTask: Task = {
  task_id: 'TASK-001',
  title: 'Test task',
  description: 'Do the thing',
  rationale: 'Needed',
  phase: 'phase-1',
  owner_role: 'builder',
  dependencies: [],
  files_in_scope: ['src/foo.ts'],
  constraints: [],
  acceptance_criteria: [{ id: 'ac-1', description: 'Works', verified: true, evidence_ref: null }],
  test_requirements: [{ type: 'unit', description: 'Unit test', test_file: null, status: 'passing' }],
  review_requirements: [],
  qa_requirements: [],
  status: 'in_progress',
  evidence: [],
  result: null,
  created_at: '2026-04-05T00:00:00Z',
  updated_at: '2026-04-05T00:00:00Z',
}

describe('formatStatus', () => {
  it('produces non-empty output', () => {
    const out = formatStatus({ project: mockProject, execution: mockExecution, context: mockContext })
    expect(out.length).toBeGreaterThan(0)
    expect(out).toContain('test-project')
    expect(out).toContain('2/5')
  })

  it('shows budget warning when exceeded', () => {
    const out = formatStatus({
      project: mockProject,
      execution: mockExecution,
      context: { ...mockContext, estimated_tokens_used: 90000 },
    })
    expect(out).toContain('warning')
  })
})

describe('progressBar', () => {
  it('returns a bar string', () => {
    const bar = progressBar(50, 10)
    expect(bar).toContain('[')
    expect(bar).toContain(']')
    expect(bar.length).toBe(12)
  })
})

describe('formatTask', () => {
  it('produces non-empty output for a task', () => {
    const out = formatTask(mockTask)
    expect(out).toContain('TASK-001')
    expect(out).toContain('Test task')
  })

  it('verbose mode shows acceptance criteria', () => {
    const out = formatTask(mockTask, true)
    expect(out).toContain('Works')
    expect(out).toContain('Unit test')
  })
})

describe('formatTaskList', () => {
  it('groups tasks by status', () => {
    const out = formatTaskList([mockTask])
    expect(out).toContain('IN PROGRESS')
  })

  it('shows empty message for no tasks', () => {
    const out = formatTaskList([])
    expect(out).toContain('No tasks')
  })
})

describe('formatReview', () => {
  const mockReview: ReviewArtifact = {
    review_id: 'REV-001',
    type: 'implementation',
    task_ids: ['TASK-001'],
    reviewer_role: 'executive',
    verdict: 'approved',
    checklist: [
      { item: 'Tests pass', passed: true, note: null },
      { item: 'No scope creep', passed: false, note: 'Minor issue' },
    ],
    findings: ['Looks good overall'],
    required_actions: ['Fix the minor issue'],
    created_at: '2026-04-05T00:00:00Z',
  }

  it('produces non-empty output', () => {
    const out = formatReview(mockReview)
    expect(out).toContain('REV-001')
    expect(out).toContain('APPROVED')
  })

  it('shows required actions for rejected reviews', () => {
    const out = formatReview({ ...mockReview, verdict: 'rejected' })
    expect(out).toContain('Required Actions')
    expect(out).toContain('Fix the minor issue')
  })
})
