import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, TaskEngine, GateKeeper, ContextEngine, Orchestrator
} from '@forge-core/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'

export function register(program: Command): void {
  program
    .command('merge')
    .description('Merge completed task results into project state')
    .option('--task <id>', 'Task ID to merge')
    .option('--force', 'Force merge even if GateKeeper conditions are not met')
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
      const pre = orch.checkPreconditions('merge', project.current_status)
      if (!pre.met) {
        logger.error(pre.reason ?? 'Precondition not met')
        process.exit(1)
      }

      const gen = new IdGenerator(sm)
      const engine = new TaskEngine(sm, gen)
      const gk = new GateKeeper()
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)

      // Find task to merge
      let taskId = options.task
      if (!taskId) {
        // Auto-select: find a task in in_progress or in_review
        const allTasks = await sm.listTasks()
        const candidate = allTasks.find(t => t.status === 'in_progress')
        if (!candidate) {
          logger.error('No in-progress task found. Specify --task <id>.')
          process.exit(1)
        }
        taskId = candidate.task_id
      }

      const task = await engine.getTask(taskId).catch(() => null)
      if (!task) {
        logger.error(`Task ${taskId} not found`)
        process.exit(1)
      }

      if (!['in_progress', 'in_review'].includes(task.status)) {
        logger.error(`Task ${taskId} is in status '${task.status}'. Only in_progress or in_review tasks can be merged.`)
        process.exit(1)
      }

      // GateKeeper check for in_review transition
      const gate = gk.canSubmitForReview(task)
      if (!gate.allowed && !options.force) {
        logger.warn(`GateKeeper: task not ready for review`)
        for (const reason of gate.reasons) {
          logger.log(`  ${kleur.red('✗')} ${reason}`)
        }
        logger.log('')
        logger.log('Use --force to override gate (not recommended).')
        logger.log('Or update the task\'s test_requirements and acceptance_criteria first.')
        process.exit(1)
      }

      if (!gate.allowed && options.force) {
        logger.warn('GateKeeper override: forcing merge despite unmet conditions')
        for (const reason of gate.reasons) {
          logger.warn(`  ${reason}`)
        }
      }

      // Transition task to in_review (only if currently in_progress)
      const wasInProgress = task.status === 'in_progress'
      if (wasInProgress) {
        await engine.transition(taskId, 'in_review')
      }

      // Update execution progress counts (only decrement if task was in_progress)
      if (wasInProgress) {
        const execution = await sm.getExecution()
        await sm.updateExecution({
          tasks_in_progress: Math.max(0, execution.tasks_in_progress - 1),
        })
      }

      // Auto-generate digest if configured
      const config = await sm.getConfig()
      if (config.context.auto_digest_on_merge) {
        const digest = await ctxEngine.generateDigest('state')
        logger.debug(`State digest: ${digest.content}`)
      }

      // Regenerate views
      await ctxEngine.generateViews()

      // Record action
      const ctx = await sm.getContext()
      const actions = [...ctx.recent_actions.slice(-19), `merge: ${taskId} submitted for review`]
      await sm.updateContext({ recent_actions: actions })

      if (opts.json) {
        const updated = await engine.getTask(taskId)
        process.stdout.write(JSON.stringify({ task: updated }, null, 2) + '\n')
        return
      }

      logger.success(`Task ${taskId} submitted for review`)
      logger.log(`  Status: in_review`)
      logger.log('')
      logger.log('Next: forge review')
    })
}
