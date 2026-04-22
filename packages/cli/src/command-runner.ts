import type { Command } from 'commander'
import { CliError } from './errors.js'
import * as ui from './ui/format.js'

/**
 * Wrap a command action with centralized error handling.
 * Catches CliError subclasses and unknown errors, renders
 * user-facing output, and sets process.exitCode.
 * Commander's own exit errors (help, version) are re-thrown.
 */
export function runCommand(
  action: (...args: unknown[]) => Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    try {
      await action(...args)
    } catch (err: unknown) {
      // Commander throws CommanderError with exitCode 0 for --help/--version
      if (
        err != null &&
        typeof err === 'object' &&
        'exitCode' in err &&
        (err as { exitCode: number }).exitCode === 0
      ) {
        throw err
      }

      if (err instanceof CliError) {
        process.exitCode = err.exitCode
        ui.errorBanner(err.message)
        if (err.details) {
          for (const detail of err.details) {
            process.stdout.write(`  ${detail}\n`)
          }
        }
      } else {
        process.exitCode = 2
        const message = err instanceof Error ? err.message : String(err)
        ui.errorBanner(message)
      }
    }
  }
}
