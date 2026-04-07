import kleur from 'kleur'
import type { ReviewArtifact } from '@forge-core/types'

export function formatReview(review: ReviewArtifact): string {
  const verdictColor = {
    approved:    kleur.green,
    rejected:    kleur.red,
    conditional: kleur.yellow,
  }[review.verdict] ?? kleur.white

  const lines: string[] = [
    '',
    kleur.bold(`Review: ${review.type.toUpperCase()}`),
    `  ID:      ${review.review_id}`,
    `  Verdict: ${verdictColor(review.verdict.toUpperCase())}`,
    `  Tasks:   ${review.task_ids.join(', ') || 'none'}`,
    '',
    kleur.bold('Checklist:'),
  ]

  for (const item of review.checklist) {
    const icon = item.passed ? kleur.green('✓') : kleur.red('✗')
    const note = item.note ? kleur.gray(` (${item.note})`) : ''
    lines.push(`  ${icon} ${item.item}${note}`)
  }

  if (review.findings.length > 0) {
    lines.push('')
    lines.push(kleur.bold('Findings:'))
    for (const f of review.findings) {
      lines.push(`  • ${f}`)
    }
  }

  if (review.required_actions.length > 0) {
    lines.push('')
    lines.push(kleur.bold(kleur.red('Required Actions:')))
    for (const a of review.required_actions) {
      lines.push(`  ${kleur.red('→')} ${a}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}
