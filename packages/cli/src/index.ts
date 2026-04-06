import { Command } from 'commander'
import { setupLogger, logger } from './utils/logger.js'
import { resolveForgeDir } from './utils/cli-args.js'
import { register as registerInit } from './commands/init.js'
import { register as registerIntake } from './commands/intake.js'
import { register as registerStatus } from './commands/status.js'

const program = new Command()

program
  .name('forge')
  .description('Forge — AI coding agent framework for long-running software delivery')
  .version('0.1.0')
  .option('--json', 'Output as JSON', false)
  .option('--verbose', 'Verbose output', false)
  .option('--forge-dir <path>', 'Path to .forge directory (default: auto-detect)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals()
    setupLogger({ json: opts.json, verbose: opts.verbose })
  })

// Register implemented commands
registerInit(program)
registerIntake(program)
registerStatus(program)

// Remaining commands — stubs until implemented
const pendingCommands = ['plan', 'execute', 'merge', 'review', 'qa', 'ship', 'snapshot', 'restore', 'config']
for (const cmd of pendingCommands) {
  program
    .command(cmd)
    .description(`forge ${cmd}`)
    .action(() => {
      logger.warn(`Command '${cmd}' not yet implemented`)
      process.exit(1)
    })
}

// Unknown command handler
program.on('command:*', (operands: string[]) => {
  process.stderr.write(`forge: unknown command '${operands[0]}'\n`)
  process.stderr.write("Run 'forge --help' for usage.\n")
  process.exit(1)
})

export { program }
export { resolveForgeDir } from './utils/cli-args.js'
export { logger, setupLogger } from './utils/logger.js'
export type { Logger, LogLevel } from './utils/logger.js'
export type { GlobalOptions } from './utils/cli-args.js'
