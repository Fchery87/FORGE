import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ForgeConfig, HookDefinition, Task } from '@forge-core/types'
import { DEFAULT_CONFIG } from '@forge-core/types'
import { HookEngine, SkillRegistry, SkillResolver } from '../src/index.js'

let rootDir: string
let builtinDir: string
let projectDir: string

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8')
}

async function writeSkill(root: string, name: string, description: string, source = 'builtin'): Promise<void> {
  const dir = join(root, 'skills', name)
  await mkdir(dir, { recursive: true })
  await writeJson(join(dir, 'skill.json'), {
    name,
    description,
    version: '1.0.0',
    phases: ['planning'],
    triggers: [{ type: 'command', value: 'plan' }],
    requires: [],
    verification: [`verified from ${source}`],
    assets: [
      { kind: 'instruction', path: 'instruction.md', required: true },
      { kind: 'reference', path: 'reference.md', required: false },
    ],
  })
  await writeFile(join(dir, 'instruction.md'), `# ${name}\n${description}\n`, 'utf8')
  await writeFile(join(dir, 'reference.md'), `Reference for ${name}\n`, 'utf8')
}

async function writePersona(root: string, name: string): Promise<void> {
  const dir = join(root, 'personas', name)
  await mkdir(dir, { recursive: true })
  await writeJson(join(dir, 'persona.json'), {
    name,
    role: 'executive',
    recommended_for: ['review'],
    prompt_overlay: `Persona overlay for ${name}`,
  })
}

async function writeHook(root: string, name: string, hook: HookDefinition): Promise<void> {
  const dir = join(root, 'hooks')
  await mkdir(dir, { recursive: true })
  await writeJson(join(dir, `${name}.json`), hook)
}

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'forge-skills-'))
  builtinDir = join(rootDir, 'builtin')
  projectDir = join(rootDir, 'project')

  await writeSkill(builtinDir, 'using-forge-skills', 'meta skill', 'builtin')
  await writeSkill(builtinDir, 'spec-driven-development', 'builtin version', 'builtin')
  await writeSkill(projectDir, 'spec-driven-development', 'project override', 'project')
  await writeSkill(projectDir, 'planning-and-task-breakdown', 'task planning', 'project')
  await writePersona(projectDir, 'code-reviewer')
  await writeHook(projectDir, 'before-review', {
    event: 'before_review',
    scope: 'command',
    action: 'inject_message',
    host_support: ['codex'],
    failure_policy: 'warn',
    message: 'Use the review persona.',
  })
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe('SkillRegistry', () => {
  it('prefers project-local skill manifests over built-ins', async () => {
    const registry = new SkillRegistry([builtinDir])
    await registry.load([projectDir])

    const skill = registry.getSkill('spec-driven-development')
    expect(skill?.source).toBe('project')
    expect(skill?.manifest.description).toBe('project override')
  })

  it('discovers personas and hooks alongside skills', async () => {
    const registry = new SkillRegistry([builtinDir])
    await registry.load([projectDir])

    expect(registry.listPersonas().map((persona) => persona.name)).toContain('code-reviewer')
    expect(registry.listHooks().map((hook) => hook.event)).toContain('before_review')
  })
})

describe('SkillResolver', () => {
  it('resolves phase defaults and command-triggered skills in deterministic order', async () => {
    const registry = new SkillRegistry([builtinDir])
    await registry.load([projectDir])
    const resolver = new SkillResolver(registry)

    const config: ForgeConfig = {
      ...DEFAULT_CONFIG,
      personas: { ...DEFAULT_CONFIG.personas, default_for_review: 'code-reviewer' },
    }

    const result = resolver.resolveForCommand({
      command: 'plan',
      role: 'manager',
      projectPhase: 'planning',
      config,
    })

    expect(result.skills.map((skill) => skill.skill_name)).toEqual([
      'using-forge-skills',
      'spec-driven-development',
      'planning-and-task-breakdown',
    ])
    expect(result.persona).toBeNull()
  })

  it('attaches the configured review persona for review commands', async () => {
    const registry = new SkillRegistry([builtinDir])
    await registry.load([projectDir])
    const resolver = new SkillResolver(registry)

    const result = resolver.resolveForCommand({
      command: 'review',
      role: 'executive',
      projectPhase: 'reviewing',
      config: {
        ...DEFAULT_CONFIG,
        personas: { ...DEFAULT_CONFIG.personas, default_for_review: 'code-reviewer' },
      },
    })

    expect(result.persona?.name).toBe('code-reviewer')
  })
})

describe('HookEngine', () => {
  it('returns structured effects for the requested lifecycle event', async () => {
    const registry = new SkillRegistry([builtinDir])
    await registry.load([projectDir])
    const hookEngine = new HookEngine(registry)

    const effects = hookEngine.evaluate('before_review', {
      command: 'review',
      host: 'codex',
    })

    expect(effects.messages).toContain('Use the review persona.')
    expect(effects.blockingReason).toBeNull()
  })
})
