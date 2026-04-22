import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import kleur from 'kleur'
import { StateManager, IdGenerator, ContextEngine } from '@forge-core/core'
import * as ui from '../ui/format.js'
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
        if (opts.json) {
          const { readdir } = await import('node:fs/promises')
          const snapshotsDir = `${forgeDir}/snapshots`
          const snapshots = existsSync(snapshotsDir)
            ? (await readdir(snapshotsDir)).filter(f => f.endsWith('.json'))
            : []
          process.stdout.write(JSON.stringify({ snapshots: snapshots.map(f => f.replace('.json', '')) }, null, 2) + '\n')
          return
        }

        ui.header('Snapshot')

        const { readdir } = await import('node:fs/promises')
        const snapshotsDir = `${forgeDir}/snapshots`
        if (!existsSync(snapshotsDir)) {
          ui.hint('No snapshots found.')
          ui.footer()
          return
        }
        const files = await readdir(snapshotsDir)
        const snapshots = files.filter(f => f.endsWith('.json'))
        if (snapshots.length === 0) {
          ui.hint('No snapshots found.')
          ui.footer()
          return
        }

        for (const f of snapshots) {
          process.stdout.write(`  ${kleur.dim('•')} ${f.replace('.json', '')}\n`)
        }
        ui.footer()
        return
      }

      const snapshot = await ctxEngine.generateSnapshot(options.name)

      if (opts.json) {
        process.stdout.write(JSON.stringify({ snapshot_id: snapshot.snapshot_id, label: snapshot.label, created_at: snapshot.created_at }, null, 2) + '\n')
        return
      }

      ui.header('Snapshot')

      const labelWidth = 14
      const kvLine = (label: string, value: string) =>
        `${kleur.dim(label.padEnd(labelWidth))} ${value}`

      const lines: string[] = [
        kvLine('Snapshot ID', snapshot.snapshot_id),
      ]
      if (snapshot.label) lines.push(kvLine('Label', snapshot.label))
      lines.push(kvLine('Created', snapshot.created_at))

      ui.panel(lines, { title: 'Saved' })
      ui.hint(`Restore with: forge restore --snapshot ${snapshot.snapshot_id}`)
      ui.successBanner('Snapshot saved successfully.')
      ui.footer()
    }))
}
