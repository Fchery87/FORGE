import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { StateManager } from '@forge-core/core'
import { logger } from '../utils/logger.js'
import { resolveForgeDir } from '../utils/cli-args.js'

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
])

export function register(program: Command): void {
  program
    .command('config')
    .description('View or update Forge configuration')
    .argument('[key]', 'Config key (e.g., adapter.executor)')
    .argument('[value]', 'Value to set')
    .action(async (key: string | undefined, value: string | undefined, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)

      if (!existsSync(forgeDir)) {
        logger.error('No .forge/ directory found. Run `forge init` first.')
        process.exit(1)
      }

      const sm = new StateManager(forgeDir)
      const config = await sm.getConfig()

      if (!key) {
        // Print full config
        if (opts.json) {
          process.stdout.write(JSON.stringify(config, null, 2) + '\n')
        } else {
          logger.log(JSON.stringify(config, null, 2))
        }
        return
      }

      if (!value) {
        // Print specific key value
        const val = getNestedValue(config, key)
        if (val === undefined) {
          logger.warn(`Unknown key: ${key}`)
          process.exit(1)
        }
        if (opts.json) {
          process.stdout.write(JSON.stringify({ [key]: val }, null, 2) + '\n')
        } else {
          logger.log(`${key}: ${JSON.stringify(val)}`)
        }
        return
      }

      // Set a value
      if (!KNOWN_KEYS.has(key)) {
        logger.warn(`Unknown config key: ${key}`)
        logger.log('Known keys:')
        for (const k of KNOWN_KEYS) logger.log(`  ${k}`)
        process.exit(1)
      }

      const parsed = parseValue(value)
      const patch = setNestedValue({}, key, parsed)
      await sm.updateConfig(patch)
      logger.success(`Set ${key} = ${JSON.stringify(parsed)}`)
    })
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
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
  if (value === 'true') return true
  if (value === 'false') return false
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== '') return num
  return value
}
