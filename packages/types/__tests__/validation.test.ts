import { describe, it, expect } from 'vitest'
import {
  ForgeValidationError,
  parseWithSchema,
  safeParseWithSchema,
  forgeConfigSchema,
  DEFAULT_CONFIG,
  projectStateSchema,
  architectureStateSchema,
  executionStateSchema,
  contextStateSchema,
  taskSchema,
  executorResultSchema,
  reviewArtifactSchema,
  verificationResultSchema,
  verificationPlanSchema,
  snapshotSchema,
  snapshotDataSchema,
  digestSchema,
} from '../src/index.js'

describe('ForgeValidationError', () => {
  it('formats issues from a ZodError', () => {
    const result = safeParseWithSchema(
      forgeConfigSchema,
      {},
      'test.json',
    )
    if (result.success) throw new Error('Expected failure')
    expect(result.error).toBeInstanceOf(ForgeValidationError)
    expect(result.error.filePath).toBe('test.json')
    expect(result.error.issues.length).toBeGreaterThan(0)
    expect(result.error.message).toContain('test.json')
  })
})

describe('parseWithSchema', () => {
  it('returns parsed data on success', () => {
    const data = parseWithSchema(
      digestSchema,
      { type: 'state', content: 'hello', generated_at: '2026-01-01T00:00:00Z' },
      'test.json',
    )
    expect(data.type).toBe('state')
  })

  it('throws ForgeValidationError on failure', () => {
    expect(() =>
      parseWithSchema(digestSchema, { type: 123 }, 'test.json')
    ).toThrow(ForgeValidationError)
  })
})

describe('safeParseWithSchema', () => {
  it('returns success result on valid input', () => {
    const result = safeParseWithSchema(
      digestSchema,
      { type: 'state', content: 'ok', generated_at: '2026-01-01T00:00:00Z' },
      'test.json',
    )
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.type).toBe('state')
  })

  it('returns error result on invalid input', () => {
    const result = safeParseWithSchema(
      digestSchema,
      { type: 'invalid' },
      'test.json',
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ForgeValidationError)
      expect(result.error.issues.length).toBeGreaterThan(0)
    }
  })
})

describe('ForgeConfig schema', () => {
  it('parses DEFAULT_CONFIG', () => {
    const result = forgeConfigSchema.safeParse(DEFAULT_CONFIG)
    expect(result.success).toBe(true)
  })

  it('rejects empty object', () => {
    const result = safeParseWithSchema(forgeConfigSchema, {}, 'config.json')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes('project'))).toBe(true)
    }
  })

  it('rejects invalid runtime mode', () => {
    const bad = { ...DEFAULT_CONFIG, runtime: { mode: 'invalid' } }
    const result = safeParseWithSchema(forgeConfigSchema, bad, 'config.json')
    expect(result.success).toBe(false)
  })
})

describe('ProjectState schema', () => {
  it('parses a valid project state', () => {
    const state = {
      name: 'test',
      description: 'desc',
      goals: [],
      constraints: [],
      current_phase: '',
      current_status: 'intake',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(projectStateSchema.parse(state)).toEqual(state)
  })

  it('rejects invalid status', () => {
    const result = safeParseWithSchema(
      projectStateSchema,
      { name: 'x', description: '', goals: [], constraints: [], current_phase: '', current_status: 'bogus', created_at: '', updated_at: '' },
      'state.json',
    )
    expect(result.success).toBe(false)
  })
})

describe('ArchitectureState schema', () => {
  it('parses a valid architecture state', () => {
    const state = {
      design_summary: '',
      technical_decisions: [],
      open_questions: [],
      dependencies: [],
      risk_register: [],
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(architectureStateSchema.parse(state)).toEqual(state)
  })
})

describe('ExecutionState schema', () => {
  it('parses a valid execution state', () => {
    const state = {
      phases: [],
      current_wave: 0,
      total_tasks: 0,
      tasks_done: 0,
      tasks_in_progress: 0,
      tasks_blocked: 0,
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(executionStateSchema.parse(state)).toEqual(state)
  })
})

describe('ContextState schema', () => {
  it('parses a valid context state', () => {
    const state = {
      session_id: 'sess-1',
      estimated_tokens_used: 0,
      budget_warning_threshold: 80000,
      context_window_estimate: 128000,
      last_snapshot: null,
      last_digest_at: '2026-01-01T00:00:00Z',
      recent_actions: [],
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(contextStateSchema.parse(state)).toEqual(state)
  })
})

describe('Task schema', () => {
  const validTask = {
    task_id: 'TASK-001',
    title: 'Test task',
    description: 'A test',
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
    status: 'draft',
    evidence: [],
    result: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  it('parses a valid task', () => {
    expect(taskSchema.parse(validTask)).toEqual(validTask)
  })

  it('rejects task with invalid status', () => {
    const result = safeParseWithSchema(
      taskSchema,
      { ...validTask, status: 'unknown' },
      'task.json',
    )
    expect(result.success).toBe(false)
  })

  it('rejects task missing required fields', () => {
    const result = safeParseWithSchema(
      taskSchema,
      { task_id: 'TASK-001' },
      'task.json',
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(1)
    }
  })
})

describe('ExecutorResult schema', () => {
  it('parses a valid executor result', () => {
    const result = {
      task_id: 'TASK-001',
      status: 'completed',
      summary: 'Done',
      files_changed: [],
      tests_added: [],
      tests_run: [],
      acceptance_criteria_status: [],
      issues: [],
      merge_recommendation: 'merge',
    }
    expect(executorResultSchema.parse(result)).toEqual(result)
  })
})

describe('ReviewArtifact schema', () => {
  it('parses a valid review', () => {
    const review = {
      review_id: 'REV-001',
      type: 'implementation',
      task_ids: ['TASK-001'],
      reviewer_role: 'executive',
      verdict: 'approved',
      checklist: [],
      findings: [],
      required_actions: [],
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(reviewArtifactSchema.parse(review)).toEqual(review)
  })

  it('rejects invalid verdict', () => {
    const result = safeParseWithSchema(
      reviewArtifactSchema,
      { review_id: 'REV-001', type: 'implementation', task_ids: [], reviewer_role: 'executive', verdict: 'maybe', checklist: [], findings: [], required_actions: [], created_at: '' },
      'review.json',
    )
    expect(result.success).toBe(false)
  })
})

describe('VerificationResult schema', () => {
  it('parses a valid verification result', () => {
    const vr = {
      plan_id: 'VP-001',
      status: 'pass',
      checks: [],
      evidence: [],
      issues: [],
      summary: 'All pass',
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(verificationResultSchema.parse(vr)).toEqual(vr)
  })
})

describe('VerificationPlan schema', () => {
  it('parses a valid plan', () => {
    const plan = {
      plan_id: 'VP-001',
      task_ids: ['TASK-001'],
      scope: 'task',
      changed_files: [],
      acceptance_criteria_ids: [],
      strategies: ['unit'],
    }
    expect(verificationPlanSchema.parse(plan)).toEqual(plan)
  })
})

describe('Snapshot schema', () => {
  it('parses a valid snapshot', () => {
    const snap = {
      snapshot_id: 'SNAP-001',
      label: null,
      created_at: '2026-01-01T00:00:00Z',
      data: {
        project: {},
        architecture: {},
        execution: {},
        context: {},
        task_index: {},
        decision_index: {},
      },
    }
    expect(snapshotSchema.parse(snap)).toEqual(snap)
  })

  it('rejects snapshot missing data fields', () => {
    const result = safeParseWithSchema(
      snapshotSchema,
      { snapshot_id: 'SNAP-001', label: null, created_at: '', data: {} },
      'snapshot.json',
    )
    expect(result.success).toBe(false)
  })
})

describe('SnapshotData schema', () => {
  it('parses a valid snapshot data', () => {
    const data = {
      project: { name: 'test' },
      architecture: {},
      execution: {},
      context: {},
      task_index: { 'TASK-001': {} },
      decision_index: {},
    }
    expect(snapshotDataSchema.parse(data)).toEqual(data)
  })
})
