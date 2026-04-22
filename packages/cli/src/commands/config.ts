import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import type { ForgeConfig } from '@forge-core/types'
import { StateManager } from '@forge-core/core'
import * as ui from '../ui/format.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { CliPreconditionError, CliUsageError } from '../errors.js'
import { runCommand } from '../command-runner.js'

// Known top-level config keys that can be set via CLI
const KNOWN_KEYS = new Set([
  'host.type',
  'host.install_path',
  'runtime.mode',
  'adapter.executor',
  'context.budget_warning_threshold',
  'context.context_window_estimate',
  'context.auto_digest_on_merge',
  'testing.test_command',
  'testing.test_pattern',
  'review.require_architecture_review',
  'review.require_qa_before_ship',
  'review.auto_review_on_merge',
  'skills.enabled',
  'skills.search_paths',
  'skills.auto_activate',
  'skills.phase_defaults',
  'skills.builtins',
  'personas.enabled',
  'personas.default_for_review',
  'hooks.enabled',
  'hooks.fail_on_error',
])

export function register(program: Command): void {
  program
    .command('config')
    .description('View or update Forge configuration')
    .argument('[key]', 'Config key (e.g., adapter.executor)')
    .argument('[value]', 'Value to set')
    .action(runCommand(async (key: string | undefined, value: string | undefined, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        throw new CliPreconditionError('No .forge/ directory found. Run `forge init` first.')
      }

      const sm = new StateManager(forgeDir)
      const config = await sm.getConfig()

      if (!key) {
        // Print full config
        if (opts.json) {
          process.stdout.write(JSON.stringify(config, null, 2) + '\n')
        } else {
          ui.header('Config')
          ui.panel([JSON.stringify(config, null, 2)])
          ui.footer()
        }
        return
      }

      if (!value) {
        // Print specific key value
        const val = getNestedValue(config, key)
        if (val === undefined) {
          throw new CliUsageError(`Unknown key: ${key}`)
        }
        if (opts.json) {
          process.stdout.write(JSON.stringify({ [key]: val }, null, 2) + '\n')
        } else {
          ui.header('Config')
          ui.kv(key, JSON.stringify(val))
          ui.footer()
        }
        return
      }

      // Set a value
      if (!KNOWN_KEYS.has(key)) {
        throw new CliUsageError(
          `Unknown config key: ${key}`,
          ['Known keys:', ...Array.from(KNOWN_KEYS).map(k => `  ${k}`)],
        )
      }

      const parsed = parseValue(value)
      const patch = setNestedValue({}, key, parsed) as Partial<ForgeConfig>
      await sm.updateConfig(patch)
      if (opts.json) {
        process.stdout.write(JSON.stringify({ [key]: parsed }, null, 2) + '\n')
      } else {
        ui.header('Config')
        ui.successBanner(`Set ${key} = ${JSON.stringify(parsed)}`)
        ui.footer()
      }
    }))
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): unknown {
  const parts = path.split('.')
  if (parts.length === 1) {
    return { [path]: value }
  }
  return {
    [parts[0]]: setNestedValue(
      {} as Record<string, unknown>,
      parts.slice(1).join('.'),
      value
    ),
  }
}

function parseValue(value: string): unknown {
  if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  if (value === 'true') return true
  if (value === 'false') return false
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== '') return num
  return value
}
