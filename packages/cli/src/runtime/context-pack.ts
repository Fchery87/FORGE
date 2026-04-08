import type { ContextPack, TestRequirement, AcceptanceCriterion } from '@forge-core/types'

function renderCriteria(criteria: AcceptanceCriterion[]): string {
  if (criteria.length === 0) return '- None'
  return criteria
    .map((criterion) => `- [${criterion.id}] ${criterion.description}`)
    .join('\n')
}

function renderTests(requirements: TestRequirement[]): string {
  if (requirements.length === 0) return '- None'
  return requirements
    .map((requirement) => `- (${requirement.type}) ${requirement.description}`)
    .join('\n')
}

export function renderContextPack(pack: ContextPack): string {
  const task = pack.sections.task
  const lines = [
    `# Forge Context Pack`,
    ``,
    `Pack ID: ${pack.pack_id}`,
    `Objective: ${pack.sections.objective}`,
    `State: ${pack.sections.state_digest}`,
    ``,
  ]

  if (task) {
    lines.push(`## Task`)
    lines.push(`- Task ID: ${task.task_id}`)
    lines.push(`- Title: ${task.title}`)
    lines.push(`- Description: ${task.description}`)
    lines.push(`- Rationale: ${task.rationale}`)
    lines.push(`- Files in Scope: ${task.files_in_scope.join(', ') || 'none'}`)
    lines.push(``)
    lines.push(`## Acceptance Criteria`)
    lines.push(renderCriteria(task.acceptance_criteria))
    lines.push(``)
    lines.push(`## Test Requirements`)
    lines.push(renderTests(task.test_requirements))
    lines.push(``)
  }

  lines.push(`## Constraints`)
  lines.push(pack.sections.constraints.length > 0 ? pack.sections.constraints.map((constraint) => `- ${constraint}`).join('\n') : '- None')
  lines.push(``)
  lines.push(`## Relevant Decisions`)
  lines.push(
    pack.sections.relevant_decisions.length > 0
      ? pack.sections.relevant_decisions.map((decision) => `- ${decision.decision_id}: ${decision.title}`).join('\n')
      : '- None',
  )
  lines.push(``)
  lines.push(`## Recent Changes`)
  lines.push(pack.sections.recent_changes.length > 0 ? pack.sections.recent_changes.map((change) => `- ${change}`).join('\n') : '- None')
  lines.push(``)
  lines.push(`## Open Issues`)
  lines.push(pack.sections.open_issues.length > 0 ? pack.sections.open_issues.map((issue) => `- ${issue}`).join('\n') : '- None')

  return lines.join('\n')
}
