import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager } from '@forge-agent/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'

export function register(program: Command): void {
  program
    .command('intake')
    .description('Capture project goal and scope')
    .argument('[goal]', 'Goal or objective to build')
    .option('--constraints <constraints>', 'Comma-separated constraints')
    .action(async (goal: string | undefined, options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        logger.error('No .forge/ directory found. Run `forge init` first.')
        process.exit(1)
      }

      if (!goal) {
        logger.error('Please provide a goal: forge intake "<your goal>"')
        process.exit(1)
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

      logger.success('Goal captured')
      logger.log(`  Goal: ${goal}`)
      if (constraints.length > 0) {
        logger.log(`  Constraints: ${constraints.join(', ')}`)
      }
      logger.log('')
      logger.log('Next: forge plan')
    })
}
