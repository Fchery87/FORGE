export type TaskStatus =
  | 'draft'
  | 'planned'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'qa_pending'
  | 'done'
  | 'rejected'

// Valid transitions: key status -> array of allowed next statuses
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft:       ['planned'],
  planned:     ['ready'],
  ready:       ['in_progress'],
  in_progress: ['blocked', 'in_review'],
  blocked:     ['in_progress'],
  in_review:   ['rejected', 'qa_pending'],
  rejected:    ['in_progress'],
  qa_pending:  ['done', 'in_progress'],
  done:        [],
}

export type OwnerRole = 'builder' | 'manager' | 'executive'

export interface AcceptanceCriterion {
  id: string
  description: string
  verified: boolean
  evidence_ref: string | null
}

export type TestType = 'unit' | 'integration' | 'e2e'
export type TestStatus = 'pending' | 'written' | 'passing' | 'failing'

export interface TestRequirement {
  type: TestType
  description: string
  test_file: string | null
  status: TestStatus
}

export type EvidenceType = 'test_result' | 'screenshot' | 'review' | 'log' | 'manual'

export interface Evidence {
  type: EvidenceType
  description: string
  artifact_path: string
  created_at: string  // ISO 8601
}

export interface FileChange {
  path: string
  operation: 'added' | 'modified' | 'deleted'
}

export interface TestRunResult {
  test_file: string
  passed: number
  failed: number
  skipped: number
  duration_ms: number
  output: string | null
}

export type CriterionStatus = {
  criterion_id: string
  passed: boolean
  notes: string | null
}

export interface Task {
  task_id: string                          // e.g., "TASK-001"
  title: string
  description: string
  rationale: string
  phase: string                            // phase_id reference
  owner_role: OwnerRole
  dependencies: string[]                   // task_id references
  files_in_scope: string[]
  constraints: string[]
  acceptance_criteria: AcceptanceCriterion[]
  test_requirements: TestRequirement[]
  review_requirements: string[]
  qa_requirements: string[]
  status: TaskStatus
  evidence: Evidence[]
  result: ExecutorResult | null            // populated when worker completes
  created_at: string
  updated_at: string
}

// Forward reference — ExecutorResult will be defined in executor.ts
// We need a minimal inline type here to avoid circular imports
export interface ExecutorResult {
  task_id: string
  status: 'completed' | 'failed' | 'partial'
  summary: string
  files_changed: FileChange[]
  tests_added: string[]
  tests_run: TestRunResult[]
  acceptance_criteria_status: CriterionStatus[]
  issues: string[]
  merge_recommendation: 'merge' | 'revise' | 'reject'
}
