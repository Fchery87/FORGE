#!/usr/bin/env node
import { program } from '../src/index.js'

program.parseAsync(process.argv).catch((err: unknown) => {
  if (
    err != null &&
    typeof err === 'object' &&
    'exitCode' in err &&
    typeof (err as { exitCode: unknown }).exitCode === 'number'
  ) {
    process.exit((err as { exitCode: number }).exitCode)
  }

  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`forge: unexpected error: ${message}\n`)
  process.exit(1)
})
