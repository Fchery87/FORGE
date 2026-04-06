import kleur from 'kleur'

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug'

export interface Logger {
  info(msg: string): void
  success(msg: string): void
  warn(msg: string): void
  error(msg: string): void
  debug(msg: string): void
  log(msg: string): void
}

class CliLogger implements Logger {
  private readonly jsonMode: boolean
  private readonly verbose: boolean

  constructor(options: { json?: boolean; verbose?: boolean } = {}) {
    this.jsonMode = options.json ?? false
    this.verbose = options.verbose ?? false
  }

  info(msg: string): void {
    if (this.jsonMode) return
    process.stdout.write(kleur.blue('ℹ ') + msg + '\n')
  }

  success(msg: string): void {
    if (this.jsonMode) return
    process.stdout.write(kleur.green('✓ ') + msg + '\n')
  }

  warn(msg: string): void {
    if (this.jsonMode) return
    process.stderr.write(kleur.yellow('⚠ ') + msg + '\n')
  }

  error(msg: string): void {
    if (this.jsonMode) return
    process.stderr.write(kleur.red('✗ ') + msg + '\n')
  }

  debug(msg: string): void {
    if (!this.verbose) return
    if (this.jsonMode) return
    process.stderr.write(kleur.gray('[debug] ') + msg + '\n')
  }

  log(msg: string): void {
    process.stdout.write(msg + '\n')
  }

  json(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
  }
}

// Singleton logger — replaced by CLI setup
let _logger: CliLogger = new CliLogger()

export function setupLogger(options: { json?: boolean; verbose?: boolean }): void {
  _logger = new CliLogger(options)
}

export const logger: Logger = {
  info: (msg) => _logger.info(msg),
  success: (msg) => _logger.success(msg),
  warn: (msg) => _logger.warn(msg),
  error: (msg) => _logger.error(msg),
  debug: (msg) => _logger.debug(msg),
  log: (msg) => _logger.log(msg),
}
