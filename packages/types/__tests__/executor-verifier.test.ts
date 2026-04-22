import { describe, it, expect } from 'vitest'
import type {
  Executor,
  ExecutorConfig,
  TaskContext,
  ExecutorResult,
  Verifier,
  VerifierConfig,
  VerificationPlan,
  VerificationResult,
  CheckResult,
  Issue,
} from '../src/index.js'

describe('Executor interface', () => {
  it('can define a mock Executor implementation', () => {
    const config: ExecutorConfig = {
      name: 'mock',
      options: { timeout: 30000 },
    }
    expect(config.name).toBe('mock')
  })

  it('TaskContext shape is valid', () => {
    const ctx: TaskContext = {
      task_id: 'TASK-001',
      context_pack: {
        pack_id: 'PACK-001',
        estimated_tokens: 5000,
        content: '# Context\nDo this task.',
      },
      working_directory: '/project',
      active_skills: [],
      persona: null,
      evidence_requirements: [],
    }
    expect(ctx.task_id).toBe('TASK-001')
  })
})

describe('Verifier interface', () => {
  it('VerificationPlan shape is valid', () => {
    const plan: VerificationPlan = {
      plan_id: 'VER-001',
      task_ids: ['TASK-001'],
      scope: 'task',
      changed_files: ['src/foo.ts'],
      acceptance_criteria_ids: ['AC-001'],
      strategies: ['unit'],
    }
    expect(plan.scope).toBe('task')
    expect(plan.strategies).toContain('unit')
  })

  it('VerificationResult shape is valid', () => {
    const check: CheckResult = {
      name: 'unit tests',
      type: 'unit',
      status: 'pass',
      duration_ms: 150,
      output: '3 passed',
    }
    const issue: Issue = {
      severity: 'minor',
      description: 'Missing edge case',
      file: 'src/foo.ts',
      task_id: 'TASK-001',
      auto_reopen: false,
    }
    const result: VerificationResult = {
      plan_id: 'VER-001',
      status: 'pass',
      checks: [check],
      evidence: [],
      issues: [issue],
      summary: 'All checks passed',
      created_at: '2026-04-05T00:00:00Z',
    }
    expect(result.status).toBe('pass')
    expect(result.checks).toHaveLength(1)
    expect(result.issues).toHaveLength(1)
  })
})
