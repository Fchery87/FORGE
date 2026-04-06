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
