import { z } from 'zod'

/** Create a Zod enum from a readonly tuple of string literals. */
export function enumSchema<T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values)
}

/** Zod schema that accepts an ISO 8601 date string. */
export const isoDateString = z.string().datetime({ local: true }).or(z.string().datetime())

/** Validate that a value is a record of string keys to unknown values. */
export const stringRecord = z.record(z.string(), z.unknown())

/** Helper to describe a validation path for error messages. */
export function formatPath(path: (string | number)[]): string {
  return path.length === 0 ? '(root)' : path.join('.')
}
