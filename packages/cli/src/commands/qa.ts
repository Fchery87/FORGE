import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, ReviewEngine, TaskEngine, ContextEngine, Orchestrator
} from '@forge-agent/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'

export function register(program: Command): void {
  program
    .command('qa')
    .description('Run QA verification for affected tasks')
    .option('--task <id>', 'Specific task to QA')
    .option('--full', 'Run full project QA')
    .option('--pass', 'Mark QA as passed (for scripted use without a verifier)')
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
      const pre = orch.checkPreconditions('qa', project.current_status)
      if (!pre.met) {
        logger.error(pre.reason ?? 'Precondition not met')
        process.exit(1)
      }

      const gen = new IdGenerator(sm)
      const taskEngine = new TaskEngine(sm, gen)
      const reviewEngine = new ReviewEngine(sm, gen, forgeDir)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)

      // Determine tasks to QA
      const allTasks = await sm.listTasks()
      let taskIds: string[]
      if (options.task) {
        taskIds = [options.task]
      } else if (options.full) {
        taskIds = allTasks.map(t => t.task_id)
      } else {
        taskIds = allTasks.filter(t => t.status === 'qa_pending').map(t => t.task_id)
      }

      if (taskIds.length === 0) {
        logger.warn('No tasks in qa_pending status. Use --task <id> or --full.')
        process.exit(1)
      }

      logger.info(`Running QA for tasks: ${taskIds.join(', ')}`)

      // Create QA review artifact
      const qaReview = await reviewEngine.createReview('qa', taskIds)

      if (options.pass) {
        // Auto-pass QA (for scripted use / no verifier configured)
        const results = qaReview.checklist.map((_, idx) => ({ item_index: idx, passed: true }))
        const evaluated = await reviewEngine.evaluateChecklist(qaReview.review_id, results)

        // Transition tasks to done
        for (const taskId of taskIds) {
          const task = await taskEngine.getTask(taskId).catch(() => null)
          if (task?.status === 'qa_pending') {
            await taskEngine.transition(taskId, 'done')
            logger.success(`Task ${taskId} → done`)
          }
        }

        // Update execution counts
        const execution = await sm.getExecution()
        await sm.updateExecution({
          tasks_done: execution.tasks_done + taskIds.length,
          tasks_in_progress: Math.max(0, execution.tasks_in_progress - taskIds.length),
        })

        await ctxEngine.generateViews()

        if (opts.json) {
          process.stdout.write(JSON.stringify({ qa_review: evaluated, tasks_passed: taskIds }, null, 2) + '\n')
          return
        }

        logger.success(`QA passed for ${taskIds.length} task(s)`)
        logger.log('Next: forge ship')
      } else {
        // No verifier configured — show what would be verified
        const config = await sm.getConfig()
        logger.log('')
        logger.log(kleur.bold('QA Plan'))
        logger.log(`Verifier: ${config.verification.verifiers.map(v => v.name).join(', ')}`)
        logger.log(`Strategy: ${config.verification.default_strategy.join(', ')}`)
        logger.log(`Tasks: ${taskIds.join(', ')}`)
        logger.log('')
        logger.warn('No verifier adapter active. To run automated QA:')
        logger.log('  1. Install a verifier: forge install verifier-playwright (coming soon)')
        logger.log('  2. Or use --pass to manually mark QA as passed')
        logger.log(`     forge qa --pass${options.task ? ` --task ${options.task}` : ''}`)
      }

      // Record action
      const ctx = await sm.getContext()
      const actions = [...ctx.recent_actions.slice(-19), `qa: reviewed ${taskIds.join(', ')}`]
      await sm.updateContext({ recent_actions: actions })
    })
}
