import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

// ---------------------------------------------------------------------------
// Mock node:child_process BEFORE importing the executor
// ---------------------------------------------------------------------------
type SpawnMockFn = (exitCode: number, stdout: string) => void
let _triggerChild: SpawnMockFn = () => {}
let _lastSpawnArgs: string[] = []
let _spawnShouldThrow: Error | null = null

vi.mock('node:child_process', () => ({
  spawn: vi.fn((_cmd: string, args: string[], _opts: unknown) => {
    _lastSpawnArgs = args as string[]

    if (_spawnShouldThrow) {
      throw _spawnShouldThrow
    }

    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: (signal?: string) => void
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = vi.fn()

    _triggerChild = (exitCode: number, out: string) => {
      if (out) child.stdout.emit('data', Buffer.from(out))
      child.emit('close', exitCode)
    }

    return child
  }),
}))

// ---------------------------------------------------------------------------
// Mock node:fs/promises BEFORE importing
// ---------------------------------------------------------------------------
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

import { OpenCodeExecutor } from '../src/opencode-executor.js'
import { install } from '../src/installer.js'
import { writeFile, mkdir } from 'node:fs/promises'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeContext(content = 'Do the task') {
  return {
    task_id: 'TASK-001',
    context_pack: {
      pack_id: 'pack-1',
      estimated_tokens: 100,
      content,
    },
    working_directory: '/tmp/work',
  }
}

async function runDispatch(
  executor: OpenCodeExecutor,
  exitCode: number,
  stdout: string,
) {
  const dispatchPromise = executor.dispatch(makeContext())
  // Allow spawn to be called
  await Promise.resolve()
  await Promise.resolve()
  _triggerChild(exitCode, stdout)
  return dispatchPromise
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OpenCodeExecutor', () => {
  let executor: OpenCodeExecutor

  beforeEach(async () => {
    _triggerChild = () => {}
    _spawnShouldThrow = null
    _lastSpawnArgs = []
    executor = new OpenCodeExecutor()
    await executor.initialize({ name: 'opencode', options: {} })
  })

  // -------------------------------------------------------------------------
  // Basic properties
  // -------------------------------------------------------------------------
  it('has name "opencode"', () => {
    expect(executor.name).toBe('opencode')
  })

  it('dispose resolves without error', async () => {
    await expect(executor.dispose()).resolves.toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Successful dispatch
  // -------------------------------------------------------------------------
  it('returns parsed result when exit 0 and last line is valid JSON', async () => {
    const resultJson = JSON.stringify({
      task_id: 'TASK-001',
      status: 'completed',
      summary: 'All done',
      files_changed: [],
      tests_added: [],
      tests_run: [],
      acceptance_criteria_status: [],
      issues: [],
      merge_recommendation: 'merge',
    })
    const stdout = `Some output text\nMore output\n${resultJson}`

    const result = await runDispatch(executor, 0, stdout)

    expect(result.status).toBe('completed')
    expect(result.summary).toBe('All done')
    expect(result.files_changed).toEqual([])
    expect(result.merge_recommendation).toBe('merge')
  })

  // -------------------------------------------------------------------------
  // Non-JSON last line
  // -------------------------------------------------------------------------
  it('returns failure when exit 0 but no JSON on last line', async () => {
    const stdout = 'Some output\nNo JSON here\nJust text'

    const result = await runDispatch(executor, 0, stdout)

    expect(result.status).toBe('failed')
    expect(result.summary).toMatch(/Could not parse executor result/)
  })

  // -------------------------------------------------------------------------
  // Non-zero exit code with no JSON
  // -------------------------------------------------------------------------
  it('returns failure when exit code non-zero and no JSON', async () => {
    const stdout = 'error: something went wrong'

    const result = await runDispatch(executor, 1, stdout)

    expect(result.status).toBe('failed')
    expect(result.summary).toMatch(/Could not parse executor result/)
  })

  // -------------------------------------------------------------------------
  // CLI not found (ENOENT)
  // -------------------------------------------------------------------------
  it('returns ENOENT error result when opencode CLI not found', async () => {
    const enoentErr = new Error('spawn opencode ENOENT') as NodeJS.ErrnoException
    enoentErr.code = 'ENOENT'
    _spawnShouldThrow = enoentErr

    const result = await executor.dispatch(makeContext())

    expect(result.status).toBe('failed')
    expect(result.summary).toContain('opencode CLI not found')
    expect(result.summary).toContain('https://opencode.ai')
  })

  // -------------------------------------------------------------------------
  // Command args — no model flag
  // -------------------------------------------------------------------------
  it('passes "run --print <file>" args to opencode', async () => {
    const resultJson = JSON.stringify({
      task_id: 'TASK-001',
      status: 'completed',
      summary: 'done',
      files_changed: [],
      tests_added: [],
      tests_run: [],
      acceptance_criteria_status: [],
      issues: [],
      merge_recommendation: 'merge',
    })
    const dispatchPromise = executor.dispatch(makeContext())
    await Promise.resolve()
    await Promise.resolve()
    _triggerChild(0, resultJson)
    await dispatchPromise

    expect(_lastSpawnArgs[0]).toBe('run')
    expect(_lastSpawnArgs[1]).toBe('--print')
    expect(_lastSpawnArgs).toHaveLength(3)  // run, --print, <tempfile>
  })

  it('does NOT pass --model flag', async () => {
    const resultJson = JSON.stringify({
      task_id: 'TASK-001',
      status: 'completed',
      summary: 'done',
      files_changed: [],
      tests_added: [],
      tests_run: [],
      acceptance_criteria_status: [],
      issues: [],
      merge_recommendation: 'merge',
    })
    const dispatchPromise = executor.dispatch(makeContext())
    await Promise.resolve()
    await Promise.resolve()
    _triggerChild(0, resultJson)
    await dispatchPromise

    expect(_lastSpawnArgs).not.toContain('--model')
  })
})

// ---------------------------------------------------------------------------
// install() tests
// ---------------------------------------------------------------------------
describe('install', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes opencode.config.json to targetDir', async () => {
    await install('/some/project')

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('opencode.config.json'),
      expect.any(String),
      'utf8',
    )
  })

  it('creates .opencode/commands for host prompts', async () => {
    await install('/some/project')

    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining('.opencode/commands'),
      expect.objectContaining({ recursive: true }),
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.opencode/commands/forge-execute.md'),
      expect.any(String),
      'utf8',
    )
  })

  it('opencode.config.json content contains forge builder config', async () => {
    await install('/some/project')

    const writeFileMock = writeFile as ReturnType<typeof vi.fn>
    const calls = writeFileMock.mock.calls
    const configCall = calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).endsWith('opencode.config.json'),
    )
    expect(configCall).toBeDefined()

    const content = JSON.parse(configCall![1] as string)
    expect(content.forge.role).toBe('builder')
    expect(content.forge.result_format).toBe('json_last_line')
  })
})
