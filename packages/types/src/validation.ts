import { z, ZodError, type ZodType } from 'zod'

/**
 * Error thrown when persisted state fails schema validation.
 * Includes the file path and structured error details.
 */
export class ForgeValidationError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly zodError: ZodError,
    message?: string,
  ) {
    super(
      message ?? `Validation failed for ${filePath}: ${zodError.message}`,
    )
    this.name = 'ForgeValidationError'
  }

  /** Human-readable list of field-level issues. */
  get issues(): Array<{ path: string; message: string }> {
    return this.zodError.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }))
  }
}

/** Result of a safe parse operation. */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: ForgeValidationError }

/**
 * Parse a value with a Zod schema, throwing ForgeValidationError on failure.
 * The filePath is used for error context only.
 */
export function parseWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
  filePath: string,
): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new ForgeValidationError(filePath, result.error)
}

/**
 * Parse a value with a Zod schema, returning a discriminated result.
 * Does not throw.
 */
export function safeParseWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
  filePath: string,
): SafeParseResult<T> {
  const result = schema.safeParse(value)
  if (result.success) return { success: true, data: result.data }
  return { success: false, error: new ForgeValidationError(filePath, result.error) }
}
