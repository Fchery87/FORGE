import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager, IdGenerator } from '@forge-agent/core'
import { DEFAULT_CONFIG } from '@forge-agent/types'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'

export function register(program: Command): void {
  program
    .command('init')
    .description('Initialize a new Forge project in the current directory')
    .option('--name <name>', 'Project name')
    .option('--description <desc>', 'Project description')
    .action(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (existsSync(forgeDir)) {
        logger.warn('.forge/ already exists. Run `forge status` to see project state.')
        process.exit(1)
      }

      const sm = new StateManager(forgeDir)
      await sm.initialize()

      // Write config
      const name = options.name ?? 'my-project'
      await sm.updateConfig({
        project: {
          name,
          description: options.description ?? '',
          goals: [],
        },
      })

      // Write initial project state
      await sm.updateProject({
        name,
        description: options.description ?? '',
        goals: [],
        constraints: [],
        current_phase: '',
        current_status: 'intake',
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify({ initialized: true, forgeDir, name }, null, 2) + '\n')
      } else {
        logger.success(`Forge project initialized: ${name}`)
        logger.log(`  Location: ${forgeDir}`)
        logger.log('')
        logger.log('Next steps:')
        logger.log('  forge intake "<your goal>"  — describe what you want to build')
        logger.log('  forge plan                  — generate tasks from your goal')
      }
    })
}
