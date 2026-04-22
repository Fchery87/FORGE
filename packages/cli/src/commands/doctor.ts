import type { Command } from 'commander'
import { dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { StateManager } from '@forge-core/core'
import { DEFAULT_CONFIG } from '@forge-core/types'
import * as ui from '../ui/format.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { runDoctor } from '../runtime/doctor.js'
import { runCommand } from '../command-runner.js'

export function register(program: Command): void {
  program
    .command('doctor')
    .description('Validate Forge host integration and executor availability')
    .action(runCommand(async (_options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)
      const projectDir = existsSync(forgeDir) ? dirname(forgeDir) : process.cwd()

      const config = existsSync(forgeDir)
        ? await new StateManager(forgeDir).getConfig()
        : DEFAULT_CONFIG

      const report = await runDoctor(projectDir, config)

      if (opts.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n')
        return
      }

      ui.header('Doctor')
      ui.checkItem(`Host: ${report.host.host}`, report.host.installed)
      for (const file of report.host.files) {
        ui.checkItem(file.path, file.present)
      }
      ui.checkItem(`Executor binary: ${report.executorBinary.command}`, report.executorBinary.available)
      ui.section('Inventory')
      ui.kv('Skills', String(report.skills.count))
      ui.kv('Personas', String(report.skills.personas))
      ui.kv('Hooks', String(report.skills.hooks))
      ui.footer()
    }))
}
