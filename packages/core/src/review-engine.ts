import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import type {
  ReviewArtifact,
  ReviewType,
  ChecklistItem,
} from '@forge-core/types'
import { REVIEW_CHECKLISTS, parseWithSchema, reviewArtifactSchema } from '@forge-core/types'
import type { StateManager } from './state-manager.js'
import type { IdGenerator } from './id-generator.js'

export interface ChecklistResult {
  item_index: number
  passed: boolean
  note?: string
}

export class ReviewEngine {
  constructor(
    private readonly stateManager: StateManager,
    private readonly idGenerator: IdGenerator,
    private readonly forgeDir: string,
  ) {}

  /**
   * Create a new review artifact with pending checklist items.
   * The checklist items are pre-populated from REVIEW_CHECKLISTS but all start as passed=false.
   * The caller (or Executive role) fills in actual pass/fail via evaluateChecklist().
   */
  async createReview(type: ReviewType, taskIds: string[]): Promise<ReviewArtifact> {
    const reviewId = await this.idGenerator.next('REV')

    const checklist: ChecklistItem[] = REVIEW_CHECKLISTS[type].map(item => ({
      item,
      passed: false,
      note: null,
    }))

    const review: ReviewArtifact = {
      review_id: reviewId,
      type,
      task_ids: taskIds,
      reviewer_role: 'executive',
      verdict: 'rejected',  // default until evaluated
      checklist,
      findings: [],
      required_actions: [],
      created_at: new Date().toISOString(),
    }

    await this.saveReview(review)
    return review
  }

  /**
   * Evaluate a checklist — apply pass/fail results and compute verdict.
   * Results is an array of { item_index: number, passed: boolean, note?: string }
   *
   * Verdict rules:
   * - All passed → 'approved'
   * - Any failed → 'rejected'
   * - If conditional (caller explicitly passes verdict override) → 'conditional'
   */
  async evaluateChecklist(
    reviewId: string,
    results: ChecklistResult[],
    options?: { verdict_override?: 'conditional'; findings?: string[]; required_actions?: string[] }
  ): Promise<ReviewArtifact> {
    const review = await this.getReview(reviewId)
    if (!review) throw new Error(`Review ${reviewId} not found`)

    // Apply results to checklist items
    const updatedChecklist: ChecklistItem[] = review.checklist.map((item, idx) => {
      const result = results.find(r => r.item_index === idx)
      if (!result) return item
      return {
        ...item,
        passed: result.passed,
        note: result.note ?? null,
      }
    })

    // Compute verdict
    const allPassed = updatedChecklist.every(item => item.passed)
    const anyFailed = updatedChecklist.some(item => !item.passed)

    let verdict: ReviewArtifact['verdict']
    if (options?.verdict_override === 'conditional') {
      verdict = 'conditional'
    } else if (allPassed) {
      verdict = 'approved'
    } else {
      verdict = 'rejected'
    }

    // Generate required_actions from failed items
    const requiredActions = options?.required_actions ?? (
      anyFailed
        ? updatedChecklist
            .filter(item => !item.passed)
            .map(item => `Fix: ${item.item}`)
        : []
    )

    const updated: ReviewArtifact = {
      ...review,
      checklist: updatedChecklist,
      verdict,
      findings: options?.findings ?? review.findings,
      required_actions: requiredActions,
    }

    await this.saveReview(updated)
    return updated
  }

  async getReview(reviewId: string): Promise<ReviewArtifact | null> {
    const raw = await this.stateManager.readRaw(join('reviews', `${reviewId}.json`))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parseWithSchema(reviewArtifactSchema, parsed, join('reviews', `${reviewId}.json`))
  }

  async listReviews(): Promise<ReviewArtifact[]> {
    const reviewsDir = join(this.forgeDir, 'reviews')
    if (!existsSync(reviewsDir)) return []
    const files = await readdir(reviewsDir)
    const reviews: ReviewArtifact[] = []
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const raw = await this.stateManager.readRaw(join('reviews', file))
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw)
          const review = parseWithSchema(reviewArtifactSchema, parsed, join('reviews', file))
          reviews.push(review)
        } catch {
          // Skip malformed reviews in listing
        }
      }
    }
    return reviews
  }

  async listReviewsForTask(taskId: string): Promise<ReviewArtifact[]> {
    const all = await this.listReviews()
    return all.filter(r => r.task_ids.includes(taskId))
  }

  private async saveReview(review: ReviewArtifact): Promise<void> {
    await this.stateManager.writeRaw(
      join('reviews', `${review.review_id}.json`),
      JSON.stringify(review, null, 2)
    )
  }
}
