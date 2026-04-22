import type { Command } from 'commander'
import { dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { DEFAULT_CONFIG } from '@forge-core/types'
import { StateManager } from '@forge-core/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { installHost, type ForgeHost } from '../runtime/host-installer.js'
import { CliUsageError } from '../errors.js'
import { runCommand } from '../command-runner.js'

function isHost(value: string): value is ForgeHost {
  return value === 'codex' || value === 'claude-code' || value === 'opencode'
}

export function register(program: Command): void {
  program
    .command('install')
    .description('Install Forge host integration for a supported agent CLI')
    .argument('[target]', 'Host to install (codex, claude-code, opencode)')
    .option('--host <name>', 'Host to install (codex, claude-code, opencode)')
    .action(runCommand(async (target: string | undefined, options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)
      const selected = options.host ?? target

      if (!selected || !isHost(selected)) {
        throw new CliUsageError('Choose a supported host: codex, claude-code, or opencode')
      }

      const projectDir = existsSync(forgeDir) ? dirname(forgeDir) : process.cwd()
      const config = existsSync(forgeDir)
        ? await new StateManager(forgeDir).getConfig()
        : DEFAULT_CONFIG
      const result = await installHost(selected, projectDir, config)

      if (existsSync(forgeDir)) {
        const sm = new StateManager(forgeDir)
        await sm.updateConfig({
          host: {
            type: selected,
            install_path: projectDir,
          },
          adapter: {
            executor: selected,
            executor_options: {},
          },
          runtime: {
            mode: 'host-native',
          },
        })
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        return
      }

      logger.success(`Installed Forge host integration for ${selected}`)
      logger.log(`  Location: ${result.targetDir}`)
      logger.log('  Files:')
      for (const file of result.files) {
        logger.log(`    ${file}`)
      }
    }))
}
