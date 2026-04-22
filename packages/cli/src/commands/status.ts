import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager, IdGenerator, ContextEngine } from '@forge-core/core'
import { resolveForgeDir } from '../utils/cli-args.js'
import { CliPreconditionError } from '../errors.js'
import { runCommand } from '../command-runner.js'
import kleur from 'kleur'
import * as ui from '../ui/format.js'

export function register(program: Command): void {
  program
    .command('status')
    .description('Show current project status and task health')
    .option('--verbose', 'Show task details')
    .action(runCommand(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        throw new CliPreconditionError('No .forge/ directory found. Run `forge init` first.')
      }

      const sm = new StateManager(forgeDir)
      const gen = new IdGenerator(sm)
      const ctx = new ContextEngine(sm, gen, forgeDir)

      const [project, execution, context, tasks] = await Promise.all([
        sm.getProject(),
        sm.getExecution(),
        sm.getContext(),
        sm.listTasks(),
      ])

      await ctx.generateViews()
      const budget = await ctx.checkBudget()

      if (opts.json) {
        process.stdout.write(JSON.stringify({ project, execution, context, budget }, null, 2) + '\n')
        return
      }

      // ── Project panel ──
      ui.header('Status')

      const projectName = project.name || kleur.gray('(unnamed)')
      const projectLines = [
        `${kleur.dim('Project')}   ${kleur.bold(projectName)}`,
        `${kleur.dim('Status')}    ${ui.badge(project.current_status)}`,
        `${kleur.dim('Phase')}     ${project.current_phase || kleur.gray('none')}`,
      ]
      ui.panel(projectLines, { title: 'Project' })

      // ── Progress panel ──
      process.stdout.write('\n')
      const pct = execution.total_tasks > 0
        ? Math.round((execution.tasks_done / execution.total_tasks) * 100)
        : 0
      const progressBar = ui.gauge('Progress', execution.tasks_done, execution.total_tasks || 1)

      const progressLines = [
        `${kleur.dim('Tasks')}     ${kleur.bold(`${execution.tasks_done}`)}${kleur.dim('/')}${kleur.bold(`${execution.total_tasks}`)} complete ${kleur.dim(`(${pct}%)`)}`,
        progressBar,
        `${kleur.dim('Active')}    ${kleur.bold(String(execution.tasks_in_progress))}   ${kleur.dim('Blocked')}  ${execution.tasks_blocked > 0 ? kleur.red(String(execution.tasks_blocked)) : kleur.dim(String(execution.tasks_blocked))}`,
      ]
      ui.panel(progressLines, { title: 'Progress' })

      // ── Context panel ──
      process.stdout.write('\n')
      const budgetPct = context.context_window_estimate > 0
        ? Math.round((context.estimated_tokens_used / context.context_window_estimate) * 100)
        : 0
      const budgetGauge = ui.gauge('Tokens', context.estimated_tokens_used, context.context_window_estimate)
      const budgetLines = [
        budgetGauge,
        `${kleur.dim('Used')}      ${kleur.bold(`~${context.estimated_tokens_used.toLocaleString()}`)} ${kleur.dim('/')} ${context.context_window_estimate.toLocaleString()} ${kleur.dim(`(${budgetPct}%)`)}`,
      ]
      if (budget.warning_active) {
        budgetLines.push(`${kleur.yellow('⚠')}  ${kleur.yellow('Budget warning — run `forge snapshot` and start a fresh session')}`)
      }
      ui.panel(budgetLines, { title: 'Context', borderColor: budget.warning_active ? kleur.yellow : kleur.dim })

      // ── Verbose task list ──
      if (options.verbose && tasks.length > 0) {
        process.stdout.write('\n')
        ui.section('Tasks')
        for (const t of tasks) {
          ui.taskCard(t)
        }
      }

      ui.footer()
    }))
}
