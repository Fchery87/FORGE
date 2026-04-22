import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager, IdGenerator, ContextEngine } from '@forge-core/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { CliPreconditionError } from '../errors.js'
import { runCommand } from '../command-runner.js'

export function register(program: Command): void {
  program
    .command('snapshot')
    .description('Save a snapshot of current project state')
    .option('--name <label>', 'Label for the snapshot')
    .option('--list', 'List available snapshots')
    .action(runCommand(async (options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        throw new CliPreconditionError('No .forge/ directory found. Run `forge init` first.')
      }

      const sm = new StateManager(forgeDir)
      const gen = new IdGenerator(sm)
      const ctxEngine = new ContextEngine(sm, gen, forgeDir)

      if (options.list) {
        // List snapshots
        const { readdir } = await import('node:fs/promises')
        const snapshotsDir = `${forgeDir}/snapshots`
        if (!existsSync(snapshotsDir)) {
          logger.log('No snapshots found.')
          return
        }
        const files = await readdir(snapshotsDir)
        const snapshots = files.filter(f => f.endsWith('.json'))
        if (snapshots.length === 0) {
          logger.log('No snapshots found.')
          return
        }
        logger.log('Available snapshots:')
        for (const f of snapshots) {
          logger.log(`  ${f.replace('.json', '')}`)
        }
        return
      }

      const snapshot = await ctxEngine.generateSnapshot(options.name)

      if (opts.json) {
        process.stdout.write(JSON.stringify({ snapshot_id: snapshot.snapshot_id, label: snapshot.label, created_at: snapshot.created_at }, null, 2) + '\n')
        return
      }

      logger.success(`Snapshot saved: ${snapshot.snapshot_id}`)
      if (snapshot.label) logger.log(`  Label: ${snapshot.label}`)
      logger.log(`  Created: ${snapshot.created_at}`)
      logger.log('')
      logger.log('To restore: forge restore --snapshot ' + snapshot.snapshot_id)
    }))
}
