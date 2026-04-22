import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Command } from 'commander'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateManager } from '@forge-core/core'

vi.mock('@forge-core/types', async () => await import('../../types/src/index.ts'))

vi.mock('@forge-core/adapter-claude-code', () => ({
  ClaudeCodeExecutor: class {},
  install: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@forge-core/adapter-opencode', () => ({
  OpenCodeExecutor: class {},
  install: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@forge-core/adapter-codex', () => ({
  CodexExecutor: class {},
  install: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@forge-core/verifier-test-runner', () => ({
  TestRunnerVerifier: class {
    readonly name = 'test-runner'
    readonly supports = ['unit']
    async initialize(): Promise<void> {}
    async verify(): Promise<never> { throw new Error('not used') }
    async dispose(): Promise<void> {}
  },
}))

vi.mock('@forge-core/verifier-playwright', () => ({
  PlaywrightVerifier: class {
    readonly name = 'playwright'
    readonly supports = ['browser']
    async initialize(): Promise<void> {}
    async verify(): Promise<never> { throw new Error('not used') }
    async dispose(): Promise<void> {}
  },
}))
import { register as registerReview } from '../src/commands/review.js'
import { register as registerQa } from '../src/commands/qa.js'
import { register as registerShip } from '../src/commands/ship.js'
import { register as registerSkills } from '../src/commands/skills.js'

let projectDir: string
let forgeDir: string
let stdout = ''
let stderr = ''
const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
  stdout += String(chunk)
  return true
})
const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
  stderr += String(chunk)
  return true
})

function makeProgram(): Command {
  const program = new Command()
  program
    .exitOverride()
    .option('--json', 'json', false)
    .option('--verbose', 'verbose', false)
    .option('--forge-dir <path>')
  registerReview(program)
  registerQa(program)
  registerShip(program)
  registerSkills(program)
  return program
}

async function seedBaseState(): Promise<StateManager> {
  const sm = new StateManager(forgeDir)
  await sm.initialize()
  await sm.updateProject({
    name: 'forge-test',
    description: 'test',
    goals: ['ship it'],
    current_phase: 'phase-1',
  })
  return sm
}

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'forge-cli-cmd-'))
  forgeDir = join(projectDir, '.forge')
  stdout = ''
  stderr = ''
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

describe('CLI commands', () => {
  it('skills list and explain read built-in and project-local skills', async () => {
    const sm = await seedBaseState()
    const skillDir = join(forgeDir, 'skills', 'skills', 'project-review-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'skill.json'), JSON.stringify({
      name: 'project-review-skill',
      description: 'Project-local review helper.',
      version: '1.0.0',
      phases: ['reviewing'],
      triggers: [{ type: 'command', value: 'review' }],
      requires: [],
      verification: ['Review completed'],
      assets: [{ kind: 'instruction', path: 'instruction.md', required: true }],
    }), 'utf8')
    await writeFile(join(skillDir, 'instruction.md'), '# Project Review Skill', 'utf8')

    const program = makeProgram()
    await program.parseAsync(['node', 'forge', '--json', '--forge-dir', forgeDir, 'skills', 'list'], { from: 'node' })
    expect(stdout).toContain('project-review-skill')
    stdout = ''

    await program.parseAsync(['node', 'forge', '--json', '--forge-dir', forgeDir, 'skills', 'explain', 'project-review-skill'], { from: 'node' })
    expect(stdout).toContain('Project-local review helper.')
    expect(stdout).toContain('"name": "project-review-skill"')
    void sm
  })

  it('review writes a runtime context pack and transitions tasks with --pass-all', async () => {
    const sm = await seedBaseState()
    await sm.updateProject({ current_status: 'executing' })
    const now = new Date().toISOString()
    await sm.saveTask({
      task_id: 'TASK-001',
      title: 'Review me',
      description: 'desc',
      rationale: 'why',
      phase: 'phase-1',
      owner_role: 'builder',
      dependencies: [],
      files_in_scope: ['src/a.ts'],
      constraints: [],
      acceptance_criteria: [],
      test_requirements: [],
      review_requirements: [],
      qa_requirements: [],
      status: 'in_review',
      evidence: [],
      result: null,
      created_at: now,
      updated_at: now,
    })

    const program = makeProgram()
    await program.parseAsync(['node', 'forge', '--json', '--forge-dir', forgeDir, 'review', '--task', 'TASK-001', '--pass-all'], { from: 'node' })

    const task = await sm.getTask('TASK-001')
    expect(task?.status).toBe('qa_pending')
    const runtimeDir = join(forgeDir, 'runtime')
    expect(existsSync(runtimeDir)).toBe(true)
  })

  it('qa --pass completes qa_pending tasks and ship emits a runtime review artifact', async () => {
    const sm = await seedBaseState()
    await sm.updateProject({ current_status: 'reviewing' })
    const now = new Date().toISOString()
    await sm.saveTask({
      task_id: 'TASK-002',
      title: 'QA me',
      description: 'desc',
      rationale: 'why',
      phase: 'phase-1',
      owner_role: 'builder',
      dependencies: [],
      files_in_scope: ['src/a.ts'],
      constraints: [],
      acceptance_criteria: [],
      test_requirements: [],
      review_requirements: [],
      qa_requirements: [],
      status: 'qa_pending',
      evidence: [],
      result: null,
      created_at: now,
      updated_at: now,
    })
    await sm.writeRaw('reviews/REV-001.json', JSON.stringify({
      review_id: 'REV-001',
      type: 'implementation',
      task_ids: ['TASK-002'],
      reviewer_role: 'executive',
      verdict: 'approved',
      checklist: [],
      findings: [],
      required_actions: [],
      created_at: now,
    }))

    const program = makeProgram()
    await program.parseAsync(['node', 'forge', '--json', '--forge-dir', forgeDir, 'qa', '--task', 'TASK-002', '--pass'], { from: 'node' })
    const taskAfterQa = await sm.getTask('TASK-002')
    expect(taskAfterQa?.status).toBe('done')

    stdout = ''
    await program.parseAsync(['node', 'forge', '--json', '--forge-dir', forgeDir, 'ship'], { from: 'node' })
    expect(stdout).toContain('"shipped": true')
    const runtimeFiles = await readFile(join(forgeDir, 'views', 'STATUS.md'), 'utf8')
    expect(runtimeFiles).toContain('shipped')
  })
})

afterEach(() => {
  stdoutSpy.mockClear()
  stderrSpy.mockClear()
})
