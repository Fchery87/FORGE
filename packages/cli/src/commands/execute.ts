import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, TaskEngine, ContextEngine, Orchestrator
} from '@forge-agent/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'

export function register(program: Command): void {
  program
    .command('execute')
    .description('Execute the next ready task (or specified task)')
    .option('--task <id>', 'Specific task ID to execute')
    .option('--wave', 'Execute all ready tasks in parallel')
    .action(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        logger.error('No .forge/ directory found. Run `forge init` first.')
        process.exit(1)
      }

      const sm = new StateManager(forgeDir)
      const orch = new Orchestrator()
      const project = await sm.getProject()

      // Precondition check
      const pre = orch.checkPreconditions('execute', project.current_status)
      if (!pre.met) {
        logger.error(pre.reason ?? 'Precondition not met')
        process.exit(1)
      }

      const gen = new IdGenerator(sm)
      const engine = new TaskEngine(sm, gen)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)

      // Determine which task(s) to execute
      let tasksToExecute = []
      if (options.task) {
        const task = await engine.getTask(options.task).catch(() => null)
        if (!task) {
          logger.error(`Task ${options.task} not found`)
          process.exit(1)
        }
        tasksToExecute = [task]
      } else if (options.wave) {
        tasksToExecute = await engine.getReadyTasks()
      } else {
        const ready = await engine.getReadyTasks()
        if (ready.length === 0) {
          logger.warn('No ready tasks found. Check task dependencies and statuses.')
          const allTasks = await sm.listTasks()
          const planned = allTasks.filter(t => t.status === 'planned' || t.status === 'ready')
          if (planned.length > 0) {
            logger.log('Planned tasks (may have unmet dependencies):')
            for (const t of planned) {
              logger.log(`  ${t.task_id}: ${t.title} (deps: ${t.dependencies.join(', ') || 'none'})`)
            }
          }
          process.exit(1)
        }
        tasksToExecute = [ready[0]]
      }

      // Update project status
      await sm.updateProject({ current_status: 'executing' })

      for (const task of tasksToExecute) {
        logger.info(`Executing task: ${kleur.bold(task.task_id)} — ${task.title}`)

        // Transition to in_progress (planned → ready → in_progress)
        if (task.status === 'planned') {
          await engine.transition(task.task_id, 'ready')
        }
        await engine.transition(task.task_id, 'in_progress')

        // Generate context pack
        const pack = await ctxEngine.generateContextPack('builder', task.task_id)
        logger.debug(`Context pack: ${pack.pack_id} (~${pack.estimated_tokens} tokens)`)

        // Check budget
        const budget = await ctxEngine.checkBudget()
        if (budget.warning_active) {
          logger.warn(budget.recommendation ?? 'Context budget warning')
        }

        // Dispatch to executor
        const config = await sm.getConfig()
        const executorName = config.adapter.executor

        if (opts.json) {
          // In JSON mode, output the context pack that would be sent
          process.stdout.write(JSON.stringify({
            task: task.task_id,
            executor: executorName,
            context_pack: pack,
          }, null, 2) + '\n')
          continue
        }

        logger.log('')
        logger.log(kleur.bold('Context Pack Generated'))
        logger.log(`  Pack ID:    ${pack.pack_id}`)
        logger.log(`  Tokens:     ~${pack.estimated_tokens}`)
        logger.log(`  Objective:  ${pack.sections.objective}`)
        logger.log('')
        logger.warn(`Executor "${executorName}" dispatch not yet active.`)
        logger.log('The context pack above contains everything a worker needs.')
        logger.log('To complete this task:')
        logger.log(`  1. Run \`forge install ${executorName}\` to install an executor adapter`)
        logger.log(`  2. Or use the context pack above to manually guide your AI agent`)
        logger.log(`  3. When done, run \`forge merge --task ${task.task_id}\` to record results`)
        logger.log('')
      }

      // Record action
      const ctx = await sm.getContext()
      const taskIds = tasksToExecute.map(t => t.task_id).join(', ')
      const actions = [...ctx.recent_actions.slice(-19), `execute: dispatched ${taskIds}`]
      await sm.updateContext({ recent_actions: actions })
    })
}
