import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import {
  StateManager, IdGenerator, ReviewEngine, ContextEngine, Orchestrator
} from '@forge-core/core'
import * as ui from '../ui/format.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'
import { renderContextPack } from '../runtime/context-pack.js'
import { resolveSkillRuntime } from '../runtime/skill-runtime.js'
import { join } from 'node:path'
import { runCommand } from '../command-runner.js'
import { CliPreconditionError, CliStateError } from '../errors.js'

export function register(program: Command): void {
  program
    .command('ship')
    .description('Validate ship readiness and produce release report')
    .option('--force', 'Force ship even with open items')
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
      const pre = orch.checkPreconditions('ship', project.current_status)
      if (!pre.met && !options.force) {
        throw new CliPreconditionError(pre.reason ?? 'Precondition not met')
      }

      const gen = new IdGenerator(sm)
      const reviewEngine = new ReviewEngine(sm, gen, forgeDir)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)
      const config = await sm.getConfig()
      const runtime = await resolveSkillRuntime(process.cwd(), config, 'ship', 'executive', project.current_status)
      if (runtime.blockingReason) {
        throw new CliPreconditionError(runtime.blockingReason)
      }

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
        throw new CliStateError('Ship gate failed', [
          ...failures,
          'Fix the issues above or use --force to override (not recommended).',
        ])
      }

      if (opts.json) {
        // Skip UI formatting for JSON output
      } else {
        ui.header('Ship')
      }

      if (!shipReady && options.force) {
        ui.warnBanner('Forcing ship with open items:')
        for (const f of failures) {
          ui.checkItem(f, false)
        }
      }

      // Create ship review
      const shipReview = await reviewEngine.createReview('ship', [])
      const pack = await ctxEngine.generateContextPack('executive', undefined, {
        active_skills: runtime.skills,
        persona: runtime.persona,
        evidence_requirements: [...runtime.evidenceRequirements, ...failures],
      })
      await sm.writeRaw(join('runtime', `${shipReview.review_id}.md`), renderContextPack(pack))
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

      ui.panel(
        [
          `Project:   ${project.name}`,
          `Tasks:     ${allTasks.filter(t => t.status === 'done').length}/${allTasks.length} done`,
          `Snapshot:  ${snapshot.snapshot_id}`,
        ],
        { title: 'Ship Result' },
      )
      ui.successBanner('Project shipped successfully.')
      ui.footer()
    }))
}
