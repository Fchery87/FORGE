import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}))

import { install as installClaude } from '@forge-core/adapter-claude-code'
import { install as installOpenCode } from '@forge-core/adapter-opencode'
import { install as installCodex } from '@forge-core/adapter-codex'
import { installHost, inspectHost } from '../src/runtime/host-installer.js'
import { loadExecutor, loadVerifiers } from '../src/runtime/adapter-loader.js'
import { runDoctor } from '../src/runtime/doctor.js'
import { resolveSkillRuntime } from '../src/runtime/skill-runtime.js'
import { DEFAULT_CONFIG } from '@forge-core/types'

describe('installHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates codex installation to the codex adapter', async () => {
    const result = await installHost('codex', '/tmp/project', DEFAULT_CONFIG)

    expect(installCodex).toHaveBeenCalledWith('/tmp/project', expect.any(Object))
    expect(result.files).toContain('.codex/AGENTS.md')
  })

  it('delegates claude-code installation to the claude adapter', async () => {
    await installHost('claude-code', '/tmp/project', DEFAULT_CONFIG)
    expect(installClaude).toHaveBeenCalledWith('/tmp/project', expect.any(Object))
  })

  it('delegates opencode installation to the opencode adapter', async () => {
    await installHost('opencode', '/tmp/project', DEFAULT_CONFIG)
    expect(installOpenCode).toHaveBeenCalledWith('/tmp/project', expect.any(Object))
  })

  it('generates host content from config and project-local overrides', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'forge-cli-runtime-'))
    const skillDir = join(projectDir, '.forge', 'skills', 'personas', 'code-reviewer')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'persona.json'), JSON.stringify({
      name: 'code-reviewer',
      role: 'executive',
      recommended_for: ['review'],
      prompt_overlay: 'Custom project review persona',
    }), 'utf8')

    await installHost('codex', projectDir, {
      ...DEFAULT_CONFIG,
      personas: {
        ...DEFAULT_CONFIG.personas,
        default_for_review: 'code-reviewer',
      },
    })

    expect(installCodex).toHaveBeenCalledWith(projectDir, expect.objectContaining({
      commands: expect.objectContaining({
        'forge-review.md': expect.stringContaining('Custom project review persona'),
      }),
    }))

    await rm(projectDir, { recursive: true, force: true })
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
    expect(report.skills.count).toBeGreaterThan(0)
  })

  it('inspects required files for a host', async () => {
    const result = await inspectHost('codex', '/tmp/project')
    expect(result.files.some((file) => file.path === '.codex/AGENTS.md')).toBe(true)
  })
})

describe('security boundaries', () => {
  it('rejects skill search paths that escape the project root', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'forge-skill-runtime-'))

    await expect(resolveSkillRuntime(projectDir, {
      ...DEFAULT_CONFIG,
      skills: {
        ...DEFAULT_CONFIG.skills,
        search_paths: ['../outside'],
      },
    }, 'review', 'executive', 'reviewing')).rejects.toThrow(/search path/i)

    await rm(projectDir, { recursive: true, force: true })
  })
})
