import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  StateManager, IdGenerator, TaskEngine, ContextEngine, Orchestrator
} from '@forge-core/core'
import type { Task } from '@forge-core/types'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import kleur from 'kleur'
import { loadExecutor } from '../runtime/adapter-loader.js'
import { renderContextPack } from '../runtime/context-pack.js'
import { resolveSkillRuntime } from '../runtime/skill-runtime.js'
import { runCommand } from '../command-runner.js'
import { CliPreconditionError, CliNotFoundError, CliStateError } from '../errors.js'

function updateAcceptanceCriteria(task: Task, result: NonNullable<Task['result']>): Task['acceptance_criteria'] {
  return task.acceptance_criteria.map((criterion) => {
    const status = result.acceptance_criteria_status.find(
      (candidate) => candidate.criterion_id === criterion.id,
    )
    return status
      ? {
          ...criterion,
          verified: status.passed,
          evidence_ref: status.passed ? result.summary : criterion.evidence_ref,
        }
      : criterion
  })
}

function updateTestRequirements(task: Task, result: NonNullable<Task['result']>): Task['test_requirements'] {
  const passed = result.tests_run.some((test) => test.failed === 0 && test.passed > 0)
  const failed = result.tests_run.some((test) => test.failed > 0)
  const wroteTests = result.tests_added.length > 0

  return task.test_requirements.map((requirement, index) => {
    if (failed) {
      return { ...requirement, status: 'failing' }
    }
    if (passed && index === 0) {
      return { ...requirement, status: 'passing' }
    }
    if (wroteTests) {
      return { ...requirement, status: 'written' }
    }
    return requirement
  })
}

export function register(program: Command): void {
  program
    .command('execute')
    .description('Execute the next ready task (or specified task)')
    .option('--task <id>', 'Specific task ID to execute')
    .option('--wave', 'Execute all ready tasks in parallel')
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
      const pre = orch.checkPreconditions('execute', project.current_status)
      if (!pre.met) {
        throw new CliPreconditionError(pre.reason ?? 'Precondition not met')
      }

      const gen = new IdGenerator(sm)
      const engine = new TaskEngine(sm, gen)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)
      const config = await sm.getConfig()
      const projectRoot = process.cwd()
      const executor = await loadExecutor({
        name: config.adapter.executor,
        options: config.adapter.executor_options,
      })

      // Determine which task(s) to execute
      let tasksToExecute: Task[] = []
      if (options.task) {
        const task = await engine.getTask(options.task).catch(() => null)
        if (!task) {
          throw new CliNotFoundError(`Task ${options.task} not found`)
        }
        tasksToExecute = [task]
      } else if (options.wave) {
        tasksToExecute = await engine.getReadyTasks()
      } else {
        const ready = await engine.getReadyTasks()
        if (ready.length === 0) {
          const details: string[] = ['Check task dependencies and statuses.']
          const allTasks = await sm.listTasks()
          const planned = allTasks.filter(t => t.status === 'planned' || t.status === 'ready')
          if (planned.length > 0) {
            details.push('Planned tasks (may have unmet dependencies):')
            for (const t of planned) {
              details.push(`  ${t.task_id}: ${t.title} (deps: ${t.dependencies.join(', ') || 'none'})`)
            }
          }
          throw new CliStateError('No ready tasks found', details)
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
        const runtime = await resolveSkillRuntime(projectRoot, config, 'execute', 'builder', project.current_status)
        if (runtime.blockingReason) {
          throw new CliPreconditionError(runtime.blockingReason)
        }

        const pack = await ctxEngine.generateContextPack('builder', task.task_id, {
          active_skills: runtime.skills,
          persona: runtime.persona,
          evidence_requirements: runtime.evidenceRequirements,
        })
        const renderedPack = renderContextPack(pack)
        await sm.writeRaw(join('runtime', `${task.task_id}.md`), renderedPack)
        logger.debug(`Context pack: ${pack.pack_id} (~${pack.estimated_tokens} tokens)`)

        // Check budget
        const budget = await ctxEngine.checkBudget()
        if (budget.warning_active) {
          logger.warn(budget.recommendation ?? 'Context budget warning')
        }

        const result = await executor.dispatch({
          task_id: task.task_id,
          context_pack: {
            pack_id: pack.pack_id,
            estimated_tokens: pack.estimated_tokens,
            content: renderedPack,
          },
          working_directory: process.cwd(),
          active_skills: pack.sections.active_skills,
          persona: pack.sections.persona_overlay,
          evidence_requirements: pack.sections.verification_gates,
        })

        const updatedTask = await engine.updateTask(task.task_id, {
          result,
          acceptance_criteria: updateAcceptanceCriteria(task, result),
          test_requirements: updateTestRequirements(task, result),
          evidence: [
            ...task.evidence,
            {
              type: 'log',
              description: `Executor result: ${result.summary}`,
              artifact_path: join('.forge', 'runtime', `${task.task_id}.md`),
              created_at: new Date().toISOString(),
            },
          ],
        })

        if (opts.json) {
          process.stdout.write(JSON.stringify({
            task: updatedTask.task_id,
            executor: executor.name,
            context_pack: pack.pack_id,
            result,
          }, null, 2) + '\n')
          continue
        }

        logger.log('')
        logger.log(kleur.bold('Executor Result'))
        logger.log(`  Task:       ${updatedTask.task_id}`)
        logger.log(`  Executor:   ${executor.name}`)
        logger.log(`  Status:     ${result.status}`)
        logger.log(`  Summary:    ${result.summary}`)
        logger.log(`  Runtime:    .forge/runtime/${task.task_id}.md`)
        logger.log('')
        logger.log(`Next: run \`forge merge --task ${task.task_id}\` when the result is ready for review`)
        logger.log('')
      }

      await executor.dispose()

      // Record action
      const ctx = await sm.getContext()
      const taskIds = tasksToExecute.map(t => t.task_id).join(', ')
      const actions = [...ctx.recent_actions.slice(-19), `execute: dispatched ${taskIds}`]
      await sm.updateContext({ recent_actions: actions })
    }))
}
