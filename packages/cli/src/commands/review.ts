import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, ReviewEngine, TaskEngine, ContextEngine, Orchestrator
} from '@forge-core/core'
import { REVIEW_CHECKLISTS } from '@forge-core/types'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'
import { renderContextPack } from '../runtime/context-pack.js'
import { resolveSkillRuntime } from '../runtime/skill-runtime.js'
import { join } from 'node:path'
import { runCommand } from '../command-runner.js'
import { CliPreconditionError } from '../errors.js'

export function register(program: Command): void {
  program
    .command('review')
    .description('Run a review pass (implementation review by default, --arch for architecture review)')
    .option('--arch', 'Run architecture review')
    .option('--task <id>', 'Task ID to review')
    .option('--pass-all', 'Mark all checklist items as passed (for testing)')
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
      const pre = orch.checkPreconditions('review', project.current_status)
      if (!pre.met) {
        throw new CliPreconditionError(pre.reason ?? 'Precondition not met')
      }

      const gen = new IdGenerator(sm)
      const reviewEngine = new ReviewEngine(sm, gen, forgeDir)
      const taskEngine = new TaskEngine(sm, gen)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)
      const config = await sm.getConfig()
      const runtime = await resolveSkillRuntime(process.cwd(), config, 'review', 'executive', project.current_status)
      if (runtime.blockingReason) {
        throw new CliPreconditionError(runtime.blockingReason)
      }

      const reviewType = options.arch ? 'architecture' : 'implementation'

      // Determine task IDs to review
      let taskIds: string[] = []
      if (options.task) {
        taskIds = [options.task]
      } else {
        const allTasks = await sm.listTasks()
        if (reviewType === 'implementation') {
          taskIds = allTasks
            .filter(t => t.status === 'in_review')
            .map(t => t.task_id)
        }
      }

      // Create the review
      const review = await reviewEngine.createReview(reviewType, taskIds)
      const pack = await ctxEngine.generateContextPack('executive', taskIds[0], {
        active_skills: runtime.skills,
        persona: runtime.persona,
        evidence_requirements: runtime.evidenceRequirements,
      })
      await sm.writeRaw(join('runtime', `${review.review_id}.md`), renderContextPack(pack))

      // Update project status to reviewing for arch review (always, before any early returns)
      if (reviewType === 'architecture') {
        await sm.updateProject({ current_status: 'reviewing' })
      }

      if (options.passAll) {
        // Auto-pass all items (for testing/scripted use)
        const results = review.checklist.map((_, idx) => ({ item_index: idx, passed: true }))
        const evaluated = await reviewEngine.evaluateChecklist(review.review_id, results)

        // Transition tasks to qa_pending if implementation review
        if (reviewType === 'implementation') {
          for (const taskId of taskIds) {
            const task = await taskEngine.getTask(taskId).catch(() => null)
            if (task?.status === 'in_review') {
              await taskEngine.transition(taskId, 'qa_pending')
            }
          }
        }

        if (opts.json) {
          process.stdout.write(JSON.stringify({ review: evaluated }, null, 2) + '\n')
          return
        }

        logger.success(`Review ${review.review_id}: ${kleur.bold('APPROVED')}`)
        for (const taskId of taskIds) {
          logger.log(`  Task ${taskId} → qa_pending`)
        }
        return
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify({ review }, null, 2) + '\n')
        return
      }

      logger.log('')
      logger.log(kleur.bold(`Review: ${reviewType.toUpperCase()}`))
      logger.log(`Review ID: ${review.review_id}`)
      if (taskIds.length > 0) {
        logger.log(`Tasks: ${taskIds.join(', ')}`)
      }
      logger.log('─'.repeat(40))
      logger.log('')

      // Display checklist
      const checklist = REVIEW_CHECKLISTS[reviewType]
      logger.log(kleur.bold('Checklist:'))
      checklist.forEach((item, idx) => {
        logger.log(`  ${idx + 1}. ${item}`)
      })
      logger.log('')

      logger.log(kleur.yellow('Review artifact created.'))
      logger.log(`Review ID: ${kleur.bold(review.review_id)}`)
      logger.log(`Runtime: ${kleur.bold(`.forge/runtime/${review.review_id}.md`)}`)
      logger.log('')
      logger.log('To evaluate this review interactively, use your AI agent with the checklist above.')
      logger.log(`Or use --pass-all to approve all items (for scripted use).`)
    }))
}
