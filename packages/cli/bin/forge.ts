#!/usr/bin/env node
import { program } from '../src/index.js'

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`forge: unexpected error: ${message}\n`)
  process.exit(1)
})
