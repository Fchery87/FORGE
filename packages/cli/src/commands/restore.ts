import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import kleur from 'kleur'
import { StateManager, IdGenerator, ContextEngine } from '@forge-core/core'
import * as ui from '../ui/format.js'
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

      ui.header('Restore')

      const labelWidth = 14
      const kvLine = (label: string, value: string) =>
        `${kleur.dim(label.padEnd(labelWidth))} ${value}`

      ui.panel([
        kvLine('Snapshot ID', snapshot.snapshot_id),
      ], { title: 'Restored' })

      if (briefing) {
        process.stdout.write('\n')
        process.stdout.write(briefing + '\n')
      }

      ui.successBanner('Snapshot restored successfully.')
      ui.footer()
    }))
}
