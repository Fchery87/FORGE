import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager, IdGenerator, TaskEngine, Orchestrator } from '@forge-agent/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'

export function register(program: Command): void {
  program
    .command('plan')
    .description('Generate execution plan from intake goal')
    .option('--phase <name>', 'Phase name', 'phase-1')
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
      const pre = orch.checkPreconditions('plan', project.current_status)
      if (!pre.met) {
        logger.error(pre.reason ?? 'Precondition not met')
        logger.log('Run `forge intake "<goal>"` first.')
        process.exit(1)
      }

      const gen = new IdGenerator(sm)
      const engine = new TaskEngine(sm, gen)

      // Update project status to planning
      await sm.updateProject({ current_status: 'planning' })

      // Update execution state with a phase
      const phaseName = options.phase
      const execution = await sm.getExecution()
      const phaseId = phaseName.toLowerCase().replace(/\s+/g, '-')

      // Create a stub plan task for the user to refine
      const planTask = await engine.createTask({
        title: `Plan: ${project.goals[0] ?? 'project goal'}`,
        description: `Define the execution plan for: ${project.goals.join('; ')}`,
        rationale: 'Planning task auto-created from intake goal',
        phase: phaseId,
        owner_role: 'manager',
        dependencies: [],
        files_in_scope: [],
        constraints: project.constraints,
        acceptance_criteria: [
          {
            id: 'ac-1',
            description: 'Phases are defined with clear task breakdown',
            verified: false,
            evidence_ref: null,
          },
        ],
        test_requirements: [],
        review_requirements: ['Architecture review before execution'],
        qa_requirements: [],
      })

      // Transition plan task to planned
      await engine.transition(planTask.task_id, 'planned')

      // Update execution state
      await sm.updateExecution({
        phases: [
          ...execution.phases,
          {
            phase_id: phaseId,
            name: phaseName,
            description: `Phase generated from goal: ${project.goals[0] ?? ''}`,
            task_ids: [planTask.task_id],
            status: 'active',
          },
        ],
        total_tasks: execution.total_tasks + 1,
      })

      // Record action
      const ctx = await sm.getContext()
      const actions = [...ctx.recent_actions.slice(-19), `plan: created phase ${phaseId}`]
      await sm.updateContext({ recent_actions: actions })

      if (opts.json) {
        const allTasks = await sm.listTasks()
        process.stdout.write(JSON.stringify({ phase: phaseId, tasks: allTasks }, null, 2) + '\n')
        return
      }

      logger.success(`Plan created: phase "${phaseName}"`)
      logger.log(`  Task created: ${planTask.task_id} — ${planTask.title}`)
      logger.log('')
      logger.log('Next steps:')
      logger.log('  forge review --arch      — architecture review before execution')
      logger.log('  forge execute            — start executing tasks')
    })
}
