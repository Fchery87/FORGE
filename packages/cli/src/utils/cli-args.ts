import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

export interface GlobalOptions {
  json: boolean
  verbose: boolean
  forgeDir: string
}

/**
 * Find the .forge directory by walking up from cwd, or use explicit path.
 * If explicitPath is provided, use that directly.
 * Otherwise search from cwd upwards.
 */
export function resolveForgeDir(explicitPath?: string, cwd: string = process.cwd()): string {
  if (explicitPath) {
    return resolve(explicitPath)
  }

  // Walk up from cwd looking for .forge/
  let dir = resolve(cwd)
  while (true) {
    const candidate = resolve(dir, '.forge')
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break  // reached filesystem root
    dir = parent
  }

  // Default: .forge in cwd (for init commands)
  return resolve(cwd, '.forge')
}

/**
 * Exit the process with a formatted error message.
 */
export function exitWithError(message: string, code = 1): never {
  process.stderr.write(`forge: ${message}\n`)
  process.exit(code)
}
