import kleur from 'kleur'
import type { Task, TaskStatus } from '@forge-agent/types'

export function formatTask(task: Task, verbose = false): string {
  const lines: string[] = [
    '',
    `${kleur.bold(task.task_id)}: ${task.title}`,
    `  Status:  ${formatTaskStatus(task.status)}`,
    `  Phase:   ${task.phase}`,
    `  Owner:   ${task.owner_role}`,
  ]

  if (task.dependencies.length > 0) {
    lines.push(`  Deps:    ${task.dependencies.join(', ')}`)
  }

  if (task.files_in_scope.length > 0) {
    lines.push(`  Files:   ${task.files_in_scope.join(', ')}`)
  }

  if (verbose) {
    lines.push('')
    lines.push(`  ${kleur.bold('Description')}: ${task.description}`)

    if (task.acceptance_criteria.length > 0) {
      lines.push('')
      lines.push(`  ${kleur.bold('Acceptance Criteria')}:`)
      for (const ac of task.acceptance_criteria) {
        const icon = ac.verified ? kleur.green('✓') : kleur.gray('○')
        lines.push(`    ${icon} ${ac.description}`)
      }
    }

    if (task.test_requirements.length > 0) {
      lines.push('')
      lines.push(`  ${kleur.bold('Tests')}:`)
      for (const tr of task.test_requirements) {
        const icon = tr.status === 'passing' ? kleur.green('✓')
          : tr.status === 'failing' ? kleur.red('✗')
          : kleur.gray('○')
        lines.push(`    ${icon} [${tr.type}] ${tr.description} (${tr.status})`)
      }
    }

    if (task.evidence.length > 0) {
      lines.push('')
      lines.push(`  ${kleur.bold('Evidence')}:`)
      for (const ev of task.evidence) {
        lines.push(`    • [${ev.type}] ${ev.description}`)
      }
    }
  }

  lines.push('')
  return lines.join('\n')
}

export function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) return '\nNo tasks.\n'

  const statusOrder: TaskStatus[] = [
    'in_progress', 'blocked', 'in_review', 'qa_pending',
    'ready', 'planned', 'draft', 'done', 'rejected',
  ]

  const byStatus = new Map<TaskStatus, Task[]>()
  for (const t of tasks) {
    if (!byStatus.has(t.status)) byStatus.set(t.status, [])
    byStatus.get(t.status)!.push(t)
  }

  const lines: string[] = ['']

  for (const status of statusOrder) {
    const group = byStatus.get(status)
    if (!group || group.length === 0) continue
    lines.push(kleur.bold(`${status.replace(/_/g, ' ').toUpperCase()} (${group.length})`))
    for (const t of group) {
      lines.push(`  ${t.task_id.padEnd(10)} ${t.title}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatTaskStatus(status: TaskStatus): string {
  const colors: Record<TaskStatus, (s: string) => string> = {
    draft:       kleur.gray,
    planned:     kleur.gray,
    ready:       kleur.yellow,
    in_progress: kleur.blue,
    blocked:     kleur.red,
    in_review:   kleur.magenta,
    qa_pending:  kleur.cyan,
    done:        kleur.green,
    rejected:    kleur.red,
  }
  return (colors[status] ?? kleur.white)(status)
}
