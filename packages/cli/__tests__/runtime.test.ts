import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@forge-core/adapter-claude-code', () => ({
  ClaudeCodeExecutor: class {
    readonly name = 'claude-code'
    async initialize(): Promise<void> {}
    async dispatch(): Promise<never> { throw new Error('not used') }
    async dispose(): Promise<void> {}
  },
  install: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@forge-core/adapter-opencode', () => ({
  OpenCodeExecutor: class {
    readonly name = 'opencode'
    async initialize(): Promise<void> {}
    async dispatch(): Promise<never> { throw new Error('not used') }
    async dispose(): Promise<void> {}
  },
  install: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@forge-core/adapter-codex', () => ({
  CodexExecutor: class {
    readonly name = 'codex'
    async initialize(): Promise<void> {}
    async dispatch(): Promise<never> { throw new Error('not used') }
    async dispose(): Promise<void> {}
  },
  install: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@forge-core/verifier-test-runner', () => ({
  TestRunnerVerifier: class {
    readonly name = 'test-runner'
    readonly supports = ['unit', 'integration']
    async initialize(): Promise<void> {}
    async verify(): Promise<never> { throw new Error('not used') }
    async dispose(): Promise<void> {}
  },
}))

vi.mock('@forge-core/verifier-playwright', () => ({
  PlaywrightVerifier: class {
    readonly name = 'playwright'
    readonly supports = ['browser', 'e2e']
    async initialize(): Promise<void> {}
    async verify(): Promise<never> { throw new Error('not used') }
    async dispose(): Promise<void> {}
  },
}))

vi.mock('node:fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}))

import { install as installClaude } from '@forge-core/adapter-claude-code'
import { install as installOpenCode } from '@forge-core/adapter-opencode'
import { install as installCodex } from '@forge-core/adapter-codex'
import { installHost, inspectHost } from '../src/runtime/host-installer.js'
import { loadExecutor, loadVerifiers } from '../src/runtime/adapter-loader.js'
import { runDoctor } from '../src/runtime/doctor.js'
import { DEFAULT_CONFIG } from '@forge-core/types'

describe('installHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates codex installation to the codex adapter', async () => {
    const result = await installHost('codex', '/tmp/project')

    expect(installCodex).toHaveBeenCalledWith('/tmp/project')
    expect(result.files).toContain('.codex/AGENTS.md')
  })

  it('delegates claude-code installation to the claude adapter', async () => {
    await installHost('claude-code', '/tmp/project')
    expect(installClaude).toHaveBeenCalledWith('/tmp/project')
  })

  it('delegates opencode installation to the opencode adapter', async () => {
    await installHost('opencode', '/tmp/project')
    expect(installOpenCode).toHaveBeenCalledWith('/tmp/project')
  })
})

describe('adapter loaders', () => {
  it('loads the configured executor', async () => {
    const executor = await loadExecutor({ name: 'codex', options: {} })
    expect(executor.name).toBe('codex')
  })

  it('loads configured verifiers', async () => {
    const verifiers = await loadVerifiers([
      { name: 'test-runner', package: null, options: {} },
      { name: 'playwright', package: null, options: {} },
    ])
    expect(verifiers.map((verifier) => verifier.name)).toEqual(['test-runner', 'playwright'])
  })
})

describe('doctor', () => {
  it('reports host installation and executor binary availability', async () => {
    const report = await runDoctor('/tmp/project', {
      ...DEFAULT_CONFIG,
      adapter: {
        ...DEFAULT_CONFIG.adapter,
        executor: 'codex',
      },
      host: {
        type: 'codex',
        install_path: null,
      },
      runtime: {
        mode: 'host-native',
      },
    })

    expect(report.host.installed).toBe(true)
    expect(report.executorBinary.command).toBe('codex')
    expect(report.executorBinary.available).toBe(true)
  })

  it('inspects required files for a host', async () => {
    const result = await inspectHost('codex', '/tmp/project')
    expect(result.files.some((file) => file.path === '.codex/AGENTS.md')).toBe(true)
  })
})
