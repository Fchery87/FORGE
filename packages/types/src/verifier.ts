import { z } from 'zod'

export type VerificationType = 'unit' | 'integration' | 'e2e' | 'browser'

export interface VerifierConfig {
  name: string
  options: Record<string, unknown>
}

export interface VerificationPlan {
  plan_id: string
  task_ids: string[]
  scope: 'task' | 'phase' | 'full'
  changed_files: string[]
  acceptance_criteria_ids: string[]
  strategies: VerificationType[]
}

export interface CheckResult {
  name: string
  type: VerificationType
  status: 'pass' | 'fail' | 'skip'
  duration_ms: number
  output: string | null
}

export interface EvidenceArtifact {
  type: 'screenshot' | 'console_log' | 'network_log' | 'test_output' | 'coverage'
  path: string
  description: string
}

export interface Issue {
  severity: 'critical' | 'major' | 'minor' | 'info'
  description: string
  file: string | null
  task_id: string | null
  auto_reopen: boolean
}

export interface VerificationResult {
  plan_id: string
  status: 'pass' | 'fail' | 'partial'
  checks: CheckResult[]
  evidence: EvidenceArtifact[]
  issues: Issue[]
  summary: string
  created_at: string
}

export interface Verifier {
  readonly name: string
  readonly supports: VerificationType[]
  initialize(config: VerifierConfig): Promise<void>
  verify(plan: VerificationPlan): Promise<VerificationResult>
  dispose(): Promise<void>
}

// --- Runtime schemas ---

export const verificationTypeSchema = z.enum(['unit', 'integration', 'e2e', 'browser'])

export const verifierConfigSchema = z.object({
  name: z.string(),
  options: z.record(z.string(), z.unknown()),
})

export const verificationPlanSchema = z.object({
  plan_id: z.string(),
  task_ids: z.array(z.string()),
  scope: z.enum(['task', 'phase', 'full']),
  changed_files: z.array(z.string()),
  acceptance_criteria_ids: z.array(z.string()),
  strategies: z.array(verificationTypeSchema),
})

export const checkResultSchema = z.object({
  name: z.string(),
  type: verificationTypeSchema,
  status: z.enum(['pass', 'fail', 'skip']),
  duration_ms: z.number(),
  output: z.string().nullable(),
})

export const evidenceArtifactSchema = z.object({
  type: z.enum(['screenshot', 'console_log', 'network_log', 'test_output', 'coverage']),
  path: z.string(),
  description: z.string(),
})

export const issueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'info']),
  description: z.string(),
  file: z.string().nullable(),
  task_id: z.string().nullable(),
  auto_reopen: z.boolean(),
})

export const verificationResultSchema = z.object({
  plan_id: z.string(),
  status: z.enum(['pass', 'fail', 'partial']),
  checks: z.array(checkResultSchema),
  evidence: z.array(evidenceArtifactSchema),
  issues: z.array(issueSchema),
  summary: z.string(),
  created_at: z.string(),
})
