import { existsSync } from 'node:fs'
import kleur from 'kleur'
import { StateManager, IdGenerator, ContextEngine } from '@forge-core/core'
import { resolveForgeDir } from '../utils/cli-args.js'
import * as ui from './format.js'

export async function renderWelcome(opts: { forgeDir?: string; json?: boolean }): Promise<void> {
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      name: 'forge',
      description: 'AI coding agent workflow orchestrator',
      commands: [
        'init', 'install', 'doctor', 'intake', 'status', 'plan', 'execute',
        'merge', 'review', 'qa', 'ship', 'snapshot', 'restore', 'config', 'skills',
      ],
    }, null, 2) + '\n')
    return
  }

  ui.header('Welcome')

  const forgeDir = resolveForgeDir(opts.forgeDir)
  const hasWorkspace = existsSync(forgeDir)

  const introLines = [
    `${kleur.bold('Forge')} is the workflow layer for long-running AI coding projects.`,
    `${kleur.dim('It plans work, persists project state, scopes context, and enforces review + QA gates.')}`,
  ]
  ui.panel(introLines, { title: 'What Forge Does', borderColor: kleur.cyan })

  process.stdout.write('\n')

  if (hasWorkspace) {
    const sm = new StateManager(forgeDir)
    const gen = new IdGenerator(sm)
    const ctx = new ContextEngine(sm, gen, forgeDir)

    const [project, execution, context] = await Promise.all([
      sm.getProject(),
      sm.getExecution(),
      sm.getContext(),
    ])

    const projectName = project.name || kleur.gray('(unnamed)')
    const pct = execution.total_tasks > 0
      ? Math.round((execution.tasks_done / execution.total_tasks) * 100)
      : 0
    const budgetPct = context.context_window_estimate > 0
      ? Math.round((context.estimated_tokens_used / context.context_window_estimate) * 100)
      : 0

    ui.panel([
      `${kleur.dim('Workspace')} ${kleur.bold(forgeDir)}`,
      `${kleur.dim('Project')}   ${kleur.bold(projectName)}`,
      `${kleur.dim('Status')}    ${ui.badge(project.current_status)}`,
      `${kleur.dim('Phase')}     ${project.current_phase || kleur.gray('none')}`,
    ], { title: 'Current Project' })

    process.stdout.write('\n')
    ui.panel([
      `${kleur.dim('Tasks')}     ${kleur.bold(`${execution.tasks_done}`)}${kleur.dim('/')}${kleur.bold(`${execution.total_tasks}`)} complete ${kleur.dim(`(${pct}%)`)}`,
      ui.gauge('Progress', execution.tasks_done, execution.total_tasks || 1),
      `${kleur.dim('Active')}    ${kleur.bold(String(execution.tasks_in_progress))}   ${kleur.dim('Blocked')}  ${execution.tasks_blocked > 0 ? kleur.red(String(execution.tasks_blocked)) : kleur.dim(String(execution.tasks_blocked))}`,
    ], { title: 'Progress' })

    process.stdout.write('\n')
    ui.panel([
      ui.gauge('Tokens', context.estimated_tokens_used, context.context_window_estimate),
      `${kleur.dim('Used')}      ${kleur.bold(`~${context.estimated_tokens_used.toLocaleString()}`)} ${kleur.dim('/')} ${context.context_window_estimate.toLocaleString()} ${kleur.dim(`(${budgetPct}%)`)}`,
      `${kleur.dim('Next')}      ${kleur.bold('forge status')} ${kleur.dim('for the full dashboard')}`,
    ], { title: 'Context' })

    process.stdout.write('\n')
    ui.section('Common commands')
    process.stdout.write(`  ${kleur.bold('forge status')}   ${kleur.dim('— full project dashboard')}\n`)
    process.stdout.write(`  ${kleur.bold('forge plan')}     ${kleur.dim('— generate the next phase of work')}\n`)
    process.stdout.write(`  ${kleur.bold('forge execute')}  ${kleur.dim('— dispatch the next ready task to your agent')}\n`)
    process.stdout.write(`  ${kleur.bold('forge review')}   ${kleur.dim('— review completed work with checklist artifacts')}\n`)
    process.stdout.write(`  ${kleur.bold('forge qa')}       ${kleur.dim('— run verification and store evidence')}\n`)
    process.stdout.write(`  ${kleur.bold('forge ship')}     ${kleur.dim('— final release gate')}\n`)
  } else {
    ui.panel([
      `${kleur.dim('No .forge workspace found in this directory.')}`,
      `${kleur.dim('Start by creating one with:')} ${kleur.bold('forge init --name "my-project"')}`,
    ], { title: 'Get Started', borderColor: kleur.yellow })

    process.stdout.write('\n')
    ui.section('First-run flow')
    process.stdout.write(`  ${kleur.bold('forge init')}     ${kleur.dim('— create the Forge workspace')}\n`)
    process.stdout.write(`  ${kleur.bold('forge intake')}   ${kleur.dim('— describe what you want to ship')}\n`)
    process.stdout.write(`  ${kleur.bold('forge install')}  ${kleur.dim('— connect Forge to codex / claude-code / opencode')}\n`)
    process.stdout.write(`  ${kleur.bold('forge doctor')}   ${kleur.dim('— verify host integration and executor availability')}\n`)
  }

  process.stdout.write('\n')
  ui.section('Help')
  process.stdout.write(`  ${kleur.bold('forge --help')}   ${kleur.dim('— full command reference')}\n`)
  process.stdout.write(`  ${kleur.bold('forge --json')}   ${kleur.dim('— machine-readable output')}\n`)

  ui.footer()
}
