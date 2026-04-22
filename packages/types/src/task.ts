import { z } from 'zod'

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

// --- Runtime schemas ---

export const taskStatusSchema = z.enum([
  'draft', 'planned', 'ready', 'in_progress',
  'blocked', 'in_review', 'qa_pending', 'done', 'rejected',
])

export const ownerRoleSchema = z.enum(['builder', 'manager', 'executive'])

export const acceptanceCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  verified: z.boolean(),
  evidence_ref: z.string().nullable(),
})

export const testTypeSchema = z.enum(['unit', 'integration', 'e2e'])
export const testStatusSchema = z.enum(['pending', 'written', 'passing', 'failing'])

export const testRequirementSchema = z.object({
  type: testTypeSchema,
  description: z.string(),
  test_file: z.string().nullable(),
  status: testStatusSchema,
})

export const evidenceTypeSchema = z.enum(['test_result', 'screenshot', 'review', 'log', 'manual'])

export const evidenceSchema = z.object({
  type: evidenceTypeSchema,
  description: z.string(),
  artifact_path: z.string(),
  created_at: z.string(),
})

export const fileChangeSchema = z.object({
  path: z.string(),
  operation: z.enum(['added', 'modified', 'deleted']),
})

export const testRunResultSchema = z.object({
  test_file: z.string(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  duration_ms: z.number(),
  output: z.string().nullable(),
})

export const criterionStatusSchema = z.object({
  criterion_id: z.string(),
  passed: z.boolean(),
  notes: z.string().nullable(),
})

export const executorResultSchema = z.object({
  task_id: z.string(),
  status: z.enum(['completed', 'failed', 'partial']),
  summary: z.string(),
  files_changed: z.array(fileChangeSchema),
  tests_added: z.array(z.string()),
  tests_run: z.array(testRunResultSchema),
  acceptance_criteria_status: z.array(criterionStatusSchema),
  issues: z.array(z.string()),
  merge_recommendation: z.enum(['merge', 'revise', 'reject']),
})

export const taskSchema = z.object({
  task_id: z.string(),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  phase: z.string(),
  owner_role: ownerRoleSchema,
  dependencies: z.array(z.string()),
  files_in_scope: z.array(z.string()),
  constraints: z.array(z.string()),
  acceptance_criteria: z.array(acceptanceCriterionSchema),
  test_requirements: z.array(testRequirementSchema),
  review_requirements: z.array(z.string()),
  qa_requirements: z.array(z.string()),
  status: taskStatusSchema,
  evidence: z.array(evidenceSchema),
  result: executorResultSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
