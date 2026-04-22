import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, TaskEngine, GateKeeper, ContextEngine, Orchestrator
} from '@forge-core/core'
import * as ui from '../ui/format.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { runCommand } from '../command-runner.js'
import { CliPreconditionError, CliNotFoundError, CliStateError } from '../errors.js'

export function register(program: Command): void {
  program
    .command('merge')
    .description('Merge completed task results into project state')
    .option('--task <id>', 'Task ID to merge')
    .option('--force', 'Force merge even if GateKeeper conditions are not met')
    .action(runCommand(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        throw new CliPreconditionError('No .forge/ directory found. Run `forge init` first.')
      }

      const sm = new StateManager(forgeDir)
      const orch = new Orchestrator()
      const project = await sm.getProject()

      // Precondition check
      const pre = orch.checkPreconditions('merge', project.current_status)
      if (!pre.met) {
        throw new CliPreconditionError(pre.reason ?? 'Precondition not met')
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
          throw new CliNotFoundError('No in-progress task found. Specify --task <id>.')
        }
        taskId = candidate.task_id
      }

      const task = await engine.getTask(taskId).catch(() => null)
      if (!task) {
        throw new CliNotFoundError(`Task ${taskId} not found`)
      }

      if (!['in_progress', 'in_review'].includes(task.status)) {
        throw new CliStateError(`Task ${taskId} is in status '${task.status}'. Only in_progress or in_review tasks can be merged.`)
      }

      // GateKeeper check for in_review transition
      const gate = gk.canSubmitForReview(task)
      if (!gate.allowed && !options.force) {
        throw new CliStateError('GateKeeper: task not ready for review', [
          ...gate.reasons,
          'Use --force to override gate (not recommended).',
          "Or update the task's test_requirements and acceptance_criteria first.",
        ])
      }

      if (opts.json) {
        // Skip UI formatting for JSON output
      } else {
        ui.header('Merge')
      }

      if (!gate.allowed && options.force) {
        ui.warnBanner('GateKeeper override: forcing merge despite unmet conditions')
        for (const reason of gate.reasons) {
          ui.checkItem(reason, false)
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

      ui.panel(
        [
          `Task:   ${taskId}`,
          `Status: ${ui.badge('in_review')}`,
        ],
        { title: 'Merge Result' },
      )
      ui.successBanner(`Task ${taskId} submitted for review`)
      ui.hint('forge review — review the merged task')
      ui.footer()
    }))
}
