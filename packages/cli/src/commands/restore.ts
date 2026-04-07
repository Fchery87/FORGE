import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager, IdGenerator, ContextEngine } from '@forge-core/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'

export function register(program: Command): void {
  program
    .command('restore')
    .description('Restore project state from a snapshot')
    .option('--snapshot <id>', 'Snapshot ID to restore')
    .action(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        logger.error('No .forge/ directory found. Run `forge init` first.')
        process.exit(1)
      }

      if (!options.snapshot) {
        logger.error('Specify a snapshot: forge restore --snapshot SNAP-001')
        logger.log('List snapshots with: forge snapshot --list')
        process.exit(1)
      }

      const sm = new StateManager(forgeDir)
      const gen = new IdGenerator(sm)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)

      const { snapshot, briefing } = await ctxEngine.restoreSnapshot(options.snapshot).catch((e: unknown) => {
        logger.error(`Failed to restore snapshot: ${e instanceof Error ? e.message : String(e)}`)
        process.exit(1)
      })

      if (opts.json) {
        process.stdout.write(JSON.stringify({ restored: options.snapshot, briefing }, null, 2) + '\n')
        return
      }

      logger.success(`Restored snapshot: ${snapshot.snapshot_id}`)
      logger.log('')
      logger.log(briefing)
    })
}
