export type ReviewType = 'architecture' | 'implementation' | 'qa' | 'ship'
export type ReviewVerdict = 'approved' | 'rejected' | 'conditional'

export interface ChecklistItem {
  item: string
  passed: boolean
  note: string | null
}

export interface ReviewArtifact {
  review_id: string         // e.g., "REV-001"
  type: ReviewType
  task_ids: string[]
  reviewer_role: 'executive'
  verdict: ReviewVerdict
  checklist: ChecklistItem[]
  findings: string[]
  required_actions: string[]
  created_at: string
}

// Checklist templates — the canonical items for each review type
export const REVIEW_CHECKLISTS: Record<ReviewType, string[]> = {
  architecture: [
    'Design is coherent and matches stated goals',
    'Risks are identified and have mitigations',
    'Dependencies are justified and minimal',
    'Scope is appropriate — not over- or under-engineered',
    'Test strategy covers the implementation',
    'No unresolved design questions block execution',
  ],
  implementation: [
    'Code matches the task specification',
    'No scope creep — only files_in_scope were modified',
    'Tests exist for all acceptance criteria',
    'All tests pass',
    'No obvious defects or unhandled error paths',
    'Evidence is attached',
  ],
  qa: [
    'All acceptance criteria are verified with evidence',
    'No regressions introduced',
    'Error handling works correctly',
    'Edge cases are covered',
    'Evidence artifacts are present and readable',
  ],
  ship: [
    'All tasks are in done status',
    'All implementation reviews are approved',
    'All QA reviews are passed',
    'No open blockers remain',
    'Decision log is complete',
    'State is consistent and accurate',
  ],
}
