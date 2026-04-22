import { z } from 'zod'

// Project identity and lifecycle
export interface ProjectState {
  name: string
  description: string
  goals: string[]
  constraints: string[]
  current_phase: string
  current_status: ProjectStatus
  created_at: string  // ISO 8601
  updated_at: string  // ISO 8601
}

export type ProjectStatus =
  | 'intake'
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'shipping'
  | 'shipped'

// Architectural state
export interface ArchitectureState {
  design_summary: string
  technical_decisions: Decision[]
  open_questions: string[]
  dependencies: Dependency[]
  risk_register: Risk[]
  updated_at: string
}

export interface Decision {
  decision_id: string   // e.g., "DEC-001"
  title: string
  description: string
  rationale: string
  status: DecisionStatus
  created_at: string
}

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded'

export interface Dependency {
  name: string
  version: string | null
  type: 'runtime' | 'dev' | 'peer' | 'optional'
  notes: string
}

export interface Risk {
  id: string
  description: string
  severity: RiskSeverity
  mitigation: string
  status: RiskStatus
}

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'
export type RiskStatus = 'open' | 'mitigated' | 'accepted'

// Execution state
export interface ExecutionState {
  phases: Phase[]
  current_wave: number
  total_tasks: number
  tasks_done: number
  tasks_in_progress: number
  tasks_blocked: number
  updated_at: string
}

export interface Phase {
  phase_id: string
  name: string
  description: string
  task_ids: string[]
  status: PhaseStatus
}

export type PhaseStatus = 'pending' | 'active' | 'complete'

// Context/session state
export interface ContextState {
  session_id: string
  estimated_tokens_used: number
  budget_warning_threshold: number
  context_window_estimate: number
  last_snapshot: string | null  // snapshot ID
  last_digest_at: string
  recent_actions: string[]  // Rolling buffer, max 20 entries
  updated_at: string
}

// --- Runtime schemas ---

export const projectStatusSchema = z.enum([
  'intake', 'planning', 'executing', 'reviewing', 'shipping', 'shipped',
])

export const projectStateSchema = z.object({
  name: z.string(),
  description: z.string(),
  goals: z.array(z.string()),
  constraints: z.array(z.string()),
  current_phase: z.string(),
  current_status: projectStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
})

export const decisionStatusSchema = z.enum(['proposed', 'accepted', 'superseded'])

export const decisionSchema = z.object({
  decision_id: z.string(),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  status: decisionStatusSchema,
  created_at: z.string(),
})

export const dependencySchema = z.object({
  name: z.string(),
  version: z.string().nullable(),
  type: z.enum(['runtime', 'dev', 'peer', 'optional']),
  notes: z.string(),
})

export const riskSeveritySchema = z.enum(['low', 'medium', 'high', 'critical'])
export const riskStatusSchema = z.enum(['open', 'mitigated', 'accepted'])

export const riskSchema = z.object({
  id: z.string(),
  description: z.string(),
  severity: riskSeveritySchema,
  mitigation: z.string(),
  status: riskStatusSchema,
})

export const architectureStateSchema = z.object({
  design_summary: z.string(),
  technical_decisions: z.array(decisionSchema),
  open_questions: z.array(z.string()),
  dependencies: z.array(dependencySchema),
  risk_register: z.array(riskSchema),
  updated_at: z.string(),
})

export const phaseStatusSchema = z.enum(['pending', 'active', 'complete'])

export const phaseSchema = z.object({
  phase_id: z.string(),
  name: z.string(),
  description: z.string(),
  task_ids: z.array(z.string()),
  status: phaseStatusSchema,
})

export const executionStateSchema = z.object({
  phases: z.array(phaseSchema),
  current_wave: z.number(),
  total_tasks: z.number(),
  tasks_done: z.number(),
  tasks_in_progress: z.number(),
  tasks_blocked: z.number(),
  updated_at: z.string(),
})

export const contextStateSchema = z.object({
  session_id: z.string(),
  estimated_tokens_used: z.number(),
  budget_warning_threshold: z.number(),
  context_window_estimate: z.number(),
  last_snapshot: z.string().nullable(),
  last_digest_at: z.string(),
  recent_actions: z.array(z.string()),
  updated_at: z.string(),
})
