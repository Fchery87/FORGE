import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager, IdGenerator, ContextEngine } from '@forge-core/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { CliPreconditionError, CliUsageError } from '../errors.js'
import { runCommand } from '../command-runner.js'

export function register(program: Command): void {
  program
    .command('restore')
    .description('Restore project state from a snapshot')
    .option('--snapshot <id>', 'Snapshot ID to restore')
    .action(runCommand(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        throw new CliPreconditionError('No .forge/ directory found. Run `forge init` first.')
      }

      if (!options.snapshot) {
        throw new CliUsageError('Specify a snapshot: forge restore --snapshot SNAP-001', [
          'List snapshots with: forge snapshot --list',
        ])
      }

      const sm = new StateManager(forgeDir)
      const gen = new IdGenerator(sm)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)

      let snapshot: Awaited<ReturnType<typeof ctxEngine.restoreSnapshot>>['snapshot']
      let briefing: string
      try {
        ;({ snapshot, briefing } = await ctxEngine.restoreSnapshot(options.snapshot))
      } catch (e: unknown) {
        throw new CliPreconditionError(
          `Failed to restore snapshot: ${e instanceof Error ? e.message : String(e)}`,
        )
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify({ restored: options.snapshot, briefing }, null, 2) + '\n')
        return
      }

      logger.success(`Restored snapshot: ${snapshot.snapshot_id}`)
      logger.log('')
      logger.log(briefing)
    }))
}
