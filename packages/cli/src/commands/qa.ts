import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, ReviewEngine, TaskEngine, ContextEngine, Orchestrator
} from '@forge-core/core'
import type { VerificationPlan, VerificationResult } from '@forge-core/types'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'
import { loadVerifiers } from '../runtime/adapter-loader.js'
import { renderContextPack } from '../runtime/context-pack.js'
import { resolveSkillRuntime } from '../runtime/skill-runtime.js'
import { join } from 'node:path'
import { runCommand } from '../command-runner.js'
import { CliPreconditionError, CliStateError } from '../errors.js'

function aggregateVerificationResults(results: VerificationResult[]): VerificationResult['status'] {
  if (results.every((result) => result.status === 'pass')) return 'pass'
  if (results.every((result) => result.status === 'fail')) return 'fail'
  return 'partial'
}

export function register(program: Command): void {
  program
    .command('qa')
    .description('Run QA verification for affected tasks')
    .option('--task <id>', 'Specific task to QA')
    .option('--full', 'Run full project QA')
    .option('--pass', 'Mark QA as passed (for scripted use without a verifier)')
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
      const pre = orch.checkPreconditions('qa', project.current_status)
      if (!pre.met) {
        throw new CliPreconditionError(pre.reason ?? 'Precondition not met')
      }

      const gen = new IdGenerator(sm)
      const taskEngine = new TaskEngine(sm, gen)
      const reviewEngine = new ReviewEngine(sm, gen, forgeDir)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)
      const config = await sm.getConfig()
      const runtime = await resolveSkillRuntime(process.cwd(), config, 'qa', 'executive', project.current_status)
      if (runtime.blockingReason) {
        throw new CliPreconditionError(runtime.blockingReason)
      }

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
        throw new CliStateError('No tasks in qa_pending status', ['Use --task <id> or --full.'])
      }

      logger.info(`Running QA for tasks: ${taskIds.join(', ')}`)

      // Create QA review artifact
      const qaReview = await reviewEngine.createReview('qa', taskIds)
      const pack = await ctxEngine.generateContextPack('executive', taskIds[0], {
        active_skills: runtime.skills,
        persona: runtime.persona,
        evidence_requirements: runtime.evidenceRequirements,
      })
      await sm.writeRaw(join('runtime', `${qaReview.review_id}.md`), renderContextPack(pack))

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
        const verifiers = await loadVerifiers(config.verification.verifiers)
        const plan: VerificationPlan = {
          plan_id: `QA-${Date.now()}`,
          task_ids: taskIds,
          scope: options.full ? 'full' : 'task',
          changed_files: [],
          acceptance_criteria_ids: [],
          strategies: config.verification.default_strategy,
        }

        const results = await Promise.all(verifiers.map((verifier) => verifier.verify(plan)))
        for (const verifier of verifiers) {
          await verifier.dispose()
        }

        const aggregateStatus = aggregateVerificationResults(results)
        await sm.writeRaw(
          `qa/${plan.plan_id}.json`,
          JSON.stringify({ plan, results, aggregateStatus }, null, 2),
        )

        if (aggregateStatus === 'pass') {
          for (const taskId of taskIds) {
            const task = await taskEngine.getTask(taskId).catch(() => null)
            if (task?.status === 'qa_pending') {
              await taskEngine.transition(taskId, 'done')
              logger.success(`Task ${taskId} → done`)
            }
          }

          const execution = await sm.getExecution()
          await sm.updateExecution({
            tasks_done: execution.tasks_done + taskIds.length,
            tasks_in_progress: Math.max(0, execution.tasks_in_progress - taskIds.length),
          })
          await ctxEngine.generateViews()

          if (opts.json) {
            process.stdout.write(JSON.stringify({ plan, results, aggregateStatus }, null, 2) + '\n')
            return
          }

          logger.success(`QA passed for ${taskIds.length} task(s)`)
          logger.log(`Evidence: .forge/qa/${plan.plan_id}.json`)
          logger.log('Next: forge ship')
          return
        }

        if (opts.json) {
          process.stdout.write(JSON.stringify({ plan, results, aggregateStatus }, null, 2) + '\n')
          throw new CliStateError(`QA ${aggregateStatus}`)
        }

        throw new CliStateError(`QA ${aggregateStatus}. Evidence saved to .forge/qa/${plan.plan_id}.json`, [
          `Verifier: ${config.verification.verifiers.map(v => v.name).join(', ')}`,
          `Strategy: ${config.verification.default_strategy.join(', ')}`,
          `Tasks: ${taskIds.join(', ')}`,
          'Review the verification issues before retrying or using --pass.',
        ])
      }

      // Record action
      const ctx = await sm.getContext()
      const actions = [...ctx.recent_actions.slice(-19), `qa: reviewed ${taskIds.join(', ')}`]
      await sm.updateContext({ recent_actions: actions })
    }))
}
