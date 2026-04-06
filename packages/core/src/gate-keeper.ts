import type { Task, ReviewArtifact, VerificationResult } from '@forge-agent/types'

export interface GateResult {
  allowed: boolean
  reasons: string[]
}

export class GateKeeper {
  /**
   * Can task transition to 'in_review'?
   * Requires: at least one test requirement with status 'passing',
   * and at least one acceptance criterion with verified: true.
   */
  canSubmitForReview(task: Task): GateResult {
    const reasons: string[] = []

    const hasPassingTest = task.test_requirements.some(t => t.status === 'passing')
    if (!hasPassingTest) {
      reasons.push(
        'No passing tests: at least one test requirement must have status "passing"'
      )
    }

    const hasCriterionVerified = task.acceptance_criteria.some(c => c.verified)
    if (!hasCriterionVerified) {
      reasons.push(
        'No verified acceptance criteria: at least one criterion must be marked verified'
      )
    }

    return { allowed: reasons.length === 0, reasons }
  }

  /**
   * Can task transition to 'qa_pending'?
   * Requires: at least one ReviewArtifact in reviews for this task with verdict 'approved'.
   */
  canApproveForQA(task: Task, reviews: ReviewArtifact[]): GateResult {
    const reasons: string[] = []

    const hasApprovedReview = reviews.some(
      r => r.task_ids.includes(task.task_id) && r.verdict === 'approved'
    )
    if (!hasApprovedReview) {
      reasons.push(
        `No approved review for task ${task.task_id}: an implementation review must be approved first`
      )
    }

    return { allowed: reasons.length === 0, reasons }
  }

  /**
   * Can task transition to 'done'?
   * Requires: at least one VerificationResult in verifications with status 'pass'.
   * The caller is responsible for passing only verifications relevant to this task
   * (VerificationResult does not carry task_ids; those live on VerificationPlan).
   */
  canMarkDone(task: Task, verifications: VerificationResult[]): GateResult {
    const reasons: string[] = []

    const hasPassingVerification = verifications.some(v => v.status === 'pass')
    if (!hasPassingVerification) {
      reasons.push(
        `No passing verification for task ${task.task_id}: QA verification must pass first`
      )
    }

    return { allowed: reasons.length === 0, reasons }
  }
}
