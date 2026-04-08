import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

type SpawnMockFn = (stdout: string) => void
let _triggerChild: SpawnMockFn = () => {}
let _lastSpawnArgs: string[] = []
let _stdinWritten = ''
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
      stdin: { write: (chunk: string) => void; end: () => void }
      kill: (signal?: string) => void
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = {
      write: (chunk: string) => {
        _stdinWritten += chunk
      },
      end: () => {},
    }
    child.kill = vi.fn()

    _triggerChild = (stdout: string) => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout))
      child.emit('close', 0)
    }

    return child
  }),
}))

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(
    '{"task_id":"TASK-001","status":"completed","summary":"done","files_changed":[],"tests_added":[],"tests_run":[],"acceptance_criteria_status":[],"issues":[],"merge_recommendation":"merge"}',
  ),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

import { CodexExecutor } from '../src/codex-executor.js'
import { install } from '../src/installer.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

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

describe('CodexExecutor', () => {
  let executor: CodexExecutor

  beforeEach(async () => {
    _triggerChild = () => {}
    _spawnShouldThrow = null
    _lastSpawnArgs = []
    _stdinWritten = ''
    executor = new CodexExecutor()
    await executor.initialize({ name: 'codex', options: {} })
  })

  it('has name "codex"', () => {
    expect(executor.name).toBe('codex')
  })

  it('dispatches via `codex exec` and reads the output file', async () => {
    const dispatchPromise = executor.dispatch(makeContext())
    await Promise.resolve()
    _triggerChild('')
    const result = await dispatchPromise

    expect(_lastSpawnArgs[0]).toBe('exec')
    expect(_lastSpawnArgs).toContain('--output-last-message')
    expect(_stdinWritten).toContain('Do the task')
    expect(result.status).toBe('completed')
    expect(result.merge_recommendation).toBe('merge')
    expect(readFile).toHaveBeenCalled()
  })

  it('passes --model when configured', async () => {
    const modeled = new CodexExecutor()
    await modeled.initialize({ name: 'codex', options: { model: 'gpt-5.4' } })
    const dispatchPromise = modeled.dispatch(makeContext())
    await Promise.resolve()
    _triggerChild('')
    await dispatchPromise

    expect(_lastSpawnArgs).toContain('--model')
    expect(_lastSpawnArgs).toContain('gpt-5.4')
  })

  it('returns ENOENT error result when codex CLI not found', async () => {
    const enoentErr = new Error('spawn codex ENOENT') as NodeJS.ErrnoException
    enoentErr.code = 'ENOENT'
    _spawnShouldThrow = enoentErr

    const result = await executor.dispatch(makeContext())

    expect(result.status).toBe('failed')
    expect(result.summary).toContain('codex CLI not found')
  })
})

describe('install', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates .codex/commands and writes AGENTS.md', async () => {
    await install('/some/project')

    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining('.codex/commands'),
      expect.objectContaining({ recursive: true }),
    )
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.codex/AGENTS.md'),
      expect.any(String),
      'utf8',
    )
  })
})
