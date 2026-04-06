import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, ReviewEngine, ContextEngine, Orchestrator
} from '@forge-agent/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'

export function register(program: Command): void {
  program
    .command('ship')
    .description('Validate ship readiness and produce release report')
    .option('--force', 'Force ship even with open items')
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
      const pre = orch.checkPreconditions('ship', project.current_status)
      if (!pre.met && !options.force) {
        logger.error(pre.reason ?? 'Precondition not met')
        process.exit(1)
      }

      const gen = new IdGenerator(sm)
      const reviewEngine = new ReviewEngine(sm, gen, forgeDir)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)

      const [allTasks, allReviews] = await Promise.all([
        sm.listTasks(),
        reviewEngine.listReviews(),
      ])

      // Ship gate checks
      const failures: string[] = []

      const undone = allTasks.filter(t => t.status !== 'done' && t.status !== 'rejected')
      if (undone.length > 0) {
        failures.push(`${undone.length} task(s) not done: ${undone.map(t => t.task_id).join(', ')}`)
      }

      const pendingReviews = allReviews.filter(r => r.verdict !== 'approved')
      if (pendingReviews.length > 0) {
        failures.push(`${pendingReviews.length} review(s) not approved`)
      }

      const shipReady = failures.length === 0

      if (!shipReady && !options.force) {
        logger.error('Ship gate failed:')
        for (const f of failures) {
          logger.log(`  ${kleur.red('✗')} ${f}`)
        }
        logger.log('')
        logger.log('Fix the issues above or use --force to override (not recommended).')
        process.exit(1)
      }

      if (!shipReady && options.force) {
        logger.warn('Forcing ship with open items:')
        for (const f of failures) {
          logger.warn(`  ${f}`)
        }
      }

      // Create ship review
      const shipReview = await reviewEngine.createReview('ship', [])
      const allPassed = shipReview.checklist.map((_, idx) => ({ item_index: idx, passed: shipReady }))
      await reviewEngine.evaluateChecklist(shipReview.review_id, allPassed, {
        findings: failures,
        required_actions: shipReady ? [] : failures,
      })

      // Update project status to shipped
      await sm.updateProject({ current_status: 'shipped' })

      // Generate final snapshot
      const snapshot = await ctxEngine.generateSnapshot('ship')

      // Regenerate views
      await ctxEngine.generateViews()

      if (opts.json) {
        process.stdout.write(JSON.stringify({
          shipped: true,
          project: project.name,
          tasks_done: allTasks.filter(t => t.status === 'done').length,
          snapshot_id: snapshot.snapshot_id,
          failures: failures.length > 0 ? failures : undefined,
        }, null, 2) + '\n')
        return
      }

      logger.log('')
      logger.log(kleur.bold('─'.repeat(40)))
      logger.log(kleur.bold(kleur.green('  FORGE SHIP COMPLETE')))
      logger.log(kleur.bold('─'.repeat(40)))
      logger.log('')
      logger.log(`Project:   ${project.name}`)
      logger.log(`Tasks:     ${allTasks.filter(t => t.status === 'done').length}/${allTasks.length} done`)
      logger.log(`Snapshot:  ${snapshot.snapshot_id}`)
      logger.log('')
      logger.success('Project shipped successfully.')
    })
}
