import { describe, it, expect } from 'vitest'
import type {
  ProjectState,
  ArchitectureState,
  ExecutionState,
  ContextState,
  Phase,
  Risk,
  Decision,
} from '../src/index.js'

describe('state types', () => {
  it('ProjectState shape is valid', () => {
    const state: ProjectState = {
      name: 'test-project',
      description: 'A test project',
      goals: ['ship v1'],
      constraints: ['no external services'],
      current_phase: 'phase-1',
      current_status: 'planning',
      created_at: '2026-04-05T00:00:00Z',
      updated_at: '2026-04-05T00:00:00Z',
    }
    expect(state.name).toBe('test-project')
    expect(state.current_status).toBe('planning')
  })

  it('ArchitectureState shape is valid', () => {
    const decision: Decision = {
      decision_id: 'DEC-001',
      title: 'Use TypeScript',
      description: 'All code in TypeScript',
      rationale: 'Type safety',
      status: 'accepted',
      created_at: '2026-04-05T00:00:00Z',
    }
    const state: ArchitectureState = {
      design_summary: 'Monorepo with plugins',
      technical_decisions: [decision],
      open_questions: [],
      dependencies: [],
      risk_register: [],
      updated_at: '2026-04-05T00:00:00Z',
    }
    expect(state.technical_decisions).toHaveLength(1)
  })

  it('ExecutionState shape is valid', () => {
    const phase: Phase = {
      phase_id: 'phase-1',
      name: 'Phase 1',
      description: 'First phase',
      task_ids: ['TASK-001'],
      status: 'active',
    }
    const state: ExecutionState = {
      phases: [phase],
      current_wave: 1,
      total_tasks: 1,
      tasks_done: 0,
      tasks_in_progress: 1,
      tasks_blocked: 0,
      updated_at: '2026-04-05T00:00:00Z',
    }
    expect(state.phases).toHaveLength(1)
  })

  it('ContextState shape is valid', () => {
    const state: ContextState = {
      session_id: 'sess-001',
      estimated_tokens_used: 0,
      budget_warning_threshold: 80000,
      context_window_estimate: 128000,
      last_snapshot: null,
      last_digest_at: '2026-04-05T00:00:00Z',
      recent_actions: [],
      updated_at: '2026-04-05T00:00:00Z',
    }
    expect(state.last_snapshot).toBeNull()
  })

  it('Risk shape is valid', () => {
    const risk: Risk = {
      id: 'RISK-001',
      description: 'Context window overflow',
      severity: 'high',
      mitigation: 'Use context packs',
      status: 'open',
    }
    expect(risk.severity).toBe('high')
  })
})
