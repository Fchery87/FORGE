import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager } from '@forge-core/core'
import * as ui from '../ui/format.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { CliPreconditionError, CliUsageError } from '../errors.js'
import { runCommand } from '../command-runner.js'

export function register(program: Command): void {
  program
    .command('intake')
    .description('Capture project goal and scope')
    .argument('[goal]', 'Goal or objective to build')
    .option('--constraints <constraints>', 'Comma-separated constraints')
    .action(runCommand(async (goal: string | undefined, options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        throw new CliPreconditionError('No .forge/ directory found. Run `forge init` first.')
      }

      if (!goal) {
        throw new CliUsageError('Please provide a goal: forge intake "<your goal>"')
      }

      const sm = new StateManager(forgeDir)
      const constraints = options.constraints
        ? options.constraints.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []

      await sm.updateProject({
        goals: [goal],
        constraints,
        current_status: 'intake',
      })

      // Record action in context
      const ctx = await sm.getContext()
      const actions = [...ctx.recent_actions.slice(-19), `intake: ${goal.slice(0, 80)}`]
      await sm.updateContext({ recent_actions: actions })

      if (opts.json) {
        const project = await sm.getProject()
        process.stdout.write(JSON.stringify({ project }, null, 2) + '\n')
        return
      }

      ui.header('Intake')
      ui.successBanner('Goal captured')
      ui.kv('Goal', goal)
      if (constraints.length > 0) {
        ui.kv('Constraints', constraints.join(', '))
      }
      ui.hint('Next: forge plan')
      ui.footer()
    }))
}
