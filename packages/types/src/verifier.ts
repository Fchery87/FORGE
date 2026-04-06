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
