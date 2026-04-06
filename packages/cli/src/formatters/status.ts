import kleur from 'kleur'
import type { ProjectState, ExecutionState, ContextState } from '@forge-agent/types'

export interface StatusData {
  project: ProjectState
  execution: ExecutionState
  context: ContextState
}

export function formatStatus(data: StatusData): string {
  const { project, execution, context } = data
  const pct = execution.total_tasks > 0
    ? Math.round((execution.tasks_done / execution.total_tasks) * 100)
    : 0
  const budgetPct = Math.round((context.estimated_tokens_used / context.context_window_estimate) * 100)
  const budgetWarning = context.estimated_tokens_used >= context.budget_warning_threshold

  const lines: string[] = [
    '',
    kleur.bold('Forge Project Status'),
    '─'.repeat(40),
    `Project:   ${project.name || kleur.gray('(unnamed)')}`,
    `Status:    ${formatProjectStatus(project.current_status)}`,
    `Phase:     ${project.current_phase || kleur.gray('none')}`,
    '',
    kleur.bold('Progress'),
    `  Tasks:   ${execution.tasks_done}/${execution.total_tasks} complete (${pct}%)`,
    `  Active:  ${execution.tasks_in_progress} | Blocked: ${execution.tasks_blocked}`,
    '',
    kleur.bold('Context Health'),
    `  Tokens:  ${formatBudget(budgetPct, budgetWarning)}`,
  ]

  if (budgetWarning) {
    lines.push(kleur.yellow('  ⚠ Budget warning — run `forge snapshot` then start a fresh session'))
  }

  if (project.goals.length > 0) {
    lines.push('')
    lines.push(kleur.bold('Goals'))
    for (const goal of project.goals) {
      lines.push(`  • ${goal}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

function formatProjectStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    intake:    kleur.gray,
    planning:  kleur.yellow,
    executing: kleur.blue,
    reviewing: kleur.magenta,
    shipping:  kleur.cyan,
    shipped:   kleur.green,
  }
  const fn = colors[status] ?? ((s: string) => s)
  return fn(status)
}

function formatBudget(pct: number, warning: boolean): string {
  const bar = progressBar(pct, 20)
  const label = `${pct}%`
  return warning ? kleur.yellow(`${bar} ${label}`) : kleur.green(`${bar} ${label}`)
}

export function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width)
  const empty = width - filled
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']'
}
