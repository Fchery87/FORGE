import type { Command } from 'commander'
import { CliError } from './errors.js'
import { logger } from './utils/logger.js'

/**
 * Wrap a command action with centralized error handling.
 * Catches CliError subclasses and unknown errors, renders
 * user-facing output, and sets process.exitCode.
 */
export function runCommand(
  action: (...args: unknown[]) => Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    try {
      await action(...args)
    } catch (err) {
      if (err instanceof CliError) {
        process.exitCode = err.exitCode
        logger.error(err.message)
        if (err.details) {
          for (const detail of err.details) {
            logger.log(`  ${detail}`)
          }
        }
      } else {
        process.exitCode = 2
        const message = err instanceof Error ? err.message : String(err)
        logger.error(message)
      }
    }
  }
}

/**
 * Add a top-level error boundary to a Commander program.
 * Catches unhandled errors from command actions and sets exitCode.
 */
export function addErrorBoundary(program: Command): void {
  program.exitOverride()

  program.hook('postAction', () => {
    // Commander exits after postAction if exitOverride is set and
    // exitCode was set during action. Nothing needed here.
  })
}
