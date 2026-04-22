/**
 * CLI-facing error types for structured error handling.
 * Command modules throw these instead of calling process.exit() directly.
 * The command runner catches them and sets process.exitCode appropriately.
 */

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
    public readonly details?: string[],
  ) {
    super(message)
    this.name = 'CliError'
  }
}

/** Missing or invalid arguments. */
export class CliUsageError extends CliError {
  constructor(message: string, details?: string[]) {
    super(message, 1, details)
    this.name = 'CliUsageError'
  }
}

/** Precondition not met (e.g., no .forge directory, wrong project phase). */
export class CliPreconditionError extends CliError {
  constructor(message: string, details?: string[]) {
    super(message, 1, details)
    this.name = 'CliPreconditionError'
  }
}

/** Resource not found (e.g., task, snapshot, review). */
export class CliNotFoundError extends CliError {
  constructor(message: string, details?: string[]) {
    super(message, 1, details)
    this.name = 'CliNotFoundError'
  }
}

/** Invalid state for the requested operation. */
export class CliStateError extends CliError {
  constructor(message: string, details?: string[]) {
    super(message, 1, details)
    this.name = 'CliStateError'
  }
}

/** Validation failure. */
export class CliValidationError extends CliError {
  constructor(message: string, details?: string[]) {
    super(message, 1, details)
    this.name = 'CliValidationError'
  }
}

/** Unexpected internal error. */
export class CliInternalError extends CliError {
  constructor(message: string, details?: string[]) {
    super(message, 2, details)
    this.name = 'CliInternalError'
  }
}
