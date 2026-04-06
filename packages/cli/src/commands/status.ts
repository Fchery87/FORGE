import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager, IdGenerator, ContextEngine } from '@forge-agent/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'

export function register(program: Command): void {
  program
    .command('status')
    .description('Show current project status and task health')
    .option('--verbose', 'Show task details')
    .action(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        logger.error('No .forge/ directory found. Run `forge init` first.')
        process.exit(1)
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

      // Regenerate views
      await ctx.generateViews()
      const budget = await ctx.checkBudget()

      if (opts.json) {
        process.stdout.write(JSON.stringify({ project, execution, context, budget }, null, 2) + '\n')
        return
      }

      // Terminal output
      const pct = execution.total_tasks > 0
        ? Math.round((execution.tasks_done / execution.total_tasks) * 100)
        : 0
      const budgetPct = Math.round((context.estimated_tokens_used / context.context_window_estimate) * 100)

      logger.log(kleur.bold('\nForge Project Status'))
      logger.log('─'.repeat(40))
      logger.log(`Project:  ${project.name || kleur.gray('(unnamed)')}`)
      logger.log(`Status:   ${colorStatus(project.current_status)}`)
      logger.log(`Phase:    ${project.current_phase || kleur.gray('none')}`)
      logger.log('')
      logger.log(kleur.bold('Progress'))
      logger.log(`  Tasks:  ${execution.tasks_done}/${execution.total_tasks} complete (${pct}%)`)
      logger.log(`  Active: ${execution.tasks_in_progress} | Blocked: ${execution.tasks_blocked}`)
      logger.log('')
      logger.log(kleur.bold('Context Health'))

      const budgetColor = budget.warning_active ? kleur.yellow : kleur.green
      logger.log(`  Tokens: ${budgetColor(`~${context.estimated_tokens_used.toLocaleString()} / ${context.context_window_estimate.toLocaleString()} (${budgetPct}%)`)}`)
      if (budget.warning_active) {
        logger.warn('  Budget warning: run `forge snapshot` and start a fresh session')
      }

      if (options.verbose && tasks.length > 0) {
        logger.log('')
        logger.log(kleur.bold('Tasks'))
        for (const t of tasks) {
          const statusColor = t.status === 'done' ? kleur.green
            : t.status === 'blocked' ? kleur.red
            : t.status === 'in_progress' ? kleur.blue
            : kleur.gray
          logger.log(`  ${statusColor(t.status.padEnd(12))} ${t.task_id}: ${t.title}`)
        }
      }
      logger.log('')
    })
}

function colorStatus(status: string): string {
  switch (status) {
    case 'executing': return kleur.blue(status)
    case 'shipped': return kleur.green(status)
    case 'reviewing': return kleur.yellow(status)
    default: return status
  }
}
