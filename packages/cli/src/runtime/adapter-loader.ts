import type { Executor, ExecutorConfig, Verifier, VerifierConfigEntry } from '@forge-core/types'
import { ClaudeCodeExecutor } from '@forge-core/adapter-claude-code'
import { OpenCodeExecutor } from '@forge-core/adapter-opencode'
import { CodexExecutor } from '@forge-core/adapter-codex'
import { TestRunnerVerifier } from '@forge-core/verifier-test-runner'
import { PlaywrightVerifier } from '@forge-core/verifier-playwright'

function unsupportedAdapterError(kind: 'executor' | 'verifier', name: string): Error {
  return new Error(`Unsupported ${kind}: ${name}`)
}

export async function loadExecutor(config: ExecutorConfig): Promise<Executor> {
  const executor: Executor = (() => {
    switch (config.name) {
      case 'claude-code':
        return new ClaudeCodeExecutor()
      case 'opencode':
        return new OpenCodeExecutor()
      case 'codex':
        return new CodexExecutor()
      default:
        throw unsupportedAdapterError('executor', config.name)
    }
  })()

  await executor.initialize(config)
  return executor
}

export async function loadVerifiers(entries: VerifierConfigEntry[]): Promise<Verifier[]> {
  const verifiers: Verifier[] = []

  for (const entry of entries) {
    const verifier: Verifier = (() => {
      switch (entry.name) {
        case 'test-runner':
          return new TestRunnerVerifier()
        case 'playwright':
        case 'verifier-playwright':
          return new PlaywrightVerifier()
        default:
          throw unsupportedAdapterError('verifier', entry.name)
      }
    })()

    await verifier.initialize({
      name: entry.name,
      options: entry.options,
    })
    verifiers.push(verifier)
  }

  return verifiers
}
