import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

// ---------------------------------------------------------------------------
// Mock child_process BEFORE importing the verifier
// ---------------------------------------------------------------------------
type SpawnMockFn = (
  stdout: string,
  stderr: string,
  exitCode: number,
) => void

let _triggerChild: SpawnMockFn = () => {}

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn((_cmd: string, _args: string[], _opts: unknown) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
        kill: (signal?: string) => void
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = vi.fn()

      // Store a trigger so tests can fire off the fake process
      _triggerChild = (stdout: string, _stderr: string, exitCode: number) => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout))
        if (_stderr) child.stderr.emit('data', Buffer.from(_stderr))
        child.emit('close', exitCode)
      }

      return child
    }),
  }
})

import { TestRunnerVerifier } from '../src/test-runner-verifier.js'
import type { VerificationPlan } from '@forge-core/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePlan(overrides: Partial<VerificationPlan> = {}): VerificationPlan {
  return {
    plan_id: 'plan-001',
    task_ids: ['task-1'],
    scope: 'task',
    changed_files: [],
    acceptance_criteria_ids: [],
    strategies: ['unit'],
    ...overrides,
  }
}

async function run(
  verifier: TestRunnerVerifier,
  stdout: string,
  stderr: string,
  exitCode: number,
  plan?: VerificationPlan,
) {
  const verifyPromise = verifier.verify(plan ?? makePlan())
  // Let spawn be called, then trigger the fake close
  await Promise.resolve()
  _triggerChild(stdout, stderr, exitCode)
  return verifyPromise
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('TestRunnerVerifier', () => {
  let verifier: TestRunnerVerifier

  beforeEach(async () => {
    verifier = new TestRunnerVerifier()
    await verifier.initialize({ name: 'test-runner', options: { command: 'npm test' } })
  })

  it('has correct name and supports', () => {
    expect(verifier.name).toBe('test-runner')
    expect(verifier.supports).toContain('unit')
    expect(verifier.supports).toContain('integration')
  })

  it('defaults command to "npm test" when not provided and runs verify', async () => {
    const v = new TestRunnerVerifier()
    await v.initialize({ name: 'test-runner', options: {} })
    const verifyPromise = v.verify(makePlan())
    await Promise.resolve()
    _triggerChild('✓ default test\n', '', 0)
    const result = await verifyPromise
    expect(result.summary).toMatch(/\d+ passed/)
  })

  it('rejects shell-style command chaining during initialization', async () => {
    const v = new TestRunnerVerifier()
    await expect(v.initialize({
      name: 'test-runner',
      options: { command: 'npm test && curl https://example.com' },
    })).rejects.toThrow(/command/i)
  })

  // -------------------------------------------------------------------------
  // Pass scenario
  // -------------------------------------------------------------------------
  it('returns status "pass" when exit code is 0', async () => {
    const result = await run(verifier, '✓ my test passed\n', '', 0)
    expect(result.status).toBe('pass')
  })

  it('creates a check with status "pass" for each passing line', async () => {
    const result = await run(verifier, '✓ my test passed\n', '', 0)
    const passingChecks = result.checks.filter((c) => c.status === 'pass')
    expect(passingChecks.length).toBeGreaterThanOrEqual(1)
    expect(passingChecks[0].name).toContain('my test passed')
  })

  it('creates no issues on a full pass', async () => {
    const result = await run(verifier, '✓ everything fine\n', '', 0)
    expect(result.issues).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Fail scenario
  // -------------------------------------------------------------------------
  it('returns status "fail" when exit code is non-zero and no passing tests', async () => {
    const result = await run(verifier, '✗ my test failed\n', '', 1)
    expect(result.status).toBe('fail')
  })

  it('creates issues for each failing test line', async () => {
    const result = await run(verifier, '✗ my test failed\n', '', 1)
    expect(result.issues.length).toBeGreaterThanOrEqual(1)
    expect(result.issues[0].description).toContain('my test failed')
    expect(result.issues[0].severity).toBe('major')
    expect(result.issues[0].auto_reopen).toBe(true)
  })

  it('creates a check with status "fail" for each failing line', async () => {
    const result = await run(verifier, '✗ my test failed\n', '', 1)
    const failingChecks = result.checks.filter((c) => c.status === 'fail')
    expect(failingChecks.length).toBeGreaterThanOrEqual(1)
  })

  // -------------------------------------------------------------------------
  // Mixed / partial scenario
  // -------------------------------------------------------------------------
  it('returns status "partial" when there are both passing and failing tests', async () => {
    const mixed = '✓ test one passes\n✗ test two fails\n'
    const result = await run(verifier, mixed, '', 1)
    expect(result.status).toBe('partial')
  })

  it('creates both passing and failing checks for mixed output', async () => {
    const mixed = '✓ test one passes\n✗ test two fails\n'
    const result = await run(verifier, mixed, '', 1)
    expect(result.checks.some((c) => c.status === 'pass')).toBe(true)
    expect(result.checks.some((c) => c.status === 'fail')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Summary format
  // -------------------------------------------------------------------------
  it('includes pass/fail counts in summary', async () => {
    const mixed = '✓ test one passes\n✗ test two fails\n'
    const result = await run(verifier, mixed, '', 1)
    expect(result.summary).toMatch(/1 passed/)
    expect(result.summary).toMatch(/1 failed/)
  })

  it('formats summary as "N passed, M failed"', async () => {
    const result = await run(verifier, '✓ ok\n✓ ok2\n', '', 0)
    expect(result.summary).toBe('2 passed, 0 failed')
  })

  // -------------------------------------------------------------------------
  // Evidence
  // -------------------------------------------------------------------------
  it('includes test_output evidence with full output', async () => {
    const output = '✓ my test passed\n'
    const result = await run(verifier, output, '', 0)
    expect(result.evidence).toHaveLength(1)
    expect(result.evidence[0].type).toBe('test_output')
    expect(result.evidence[0].description).toContain('my test passed')
  })

  // -------------------------------------------------------------------------
  // Result shape
  // -------------------------------------------------------------------------
  it('returns correct plan_id', async () => {
    const plan = makePlan({ plan_id: 'my-plan' })
    const result = await run(verifier, '✓ pass\n', '', 0, plan)
    expect(result.plan_id).toBe('my-plan')
  })

  it('returns created_at as ISO string', async () => {
    const result = await run(verifier, '✓ pass\n', '', 0)
    expect(() => new Date(result.created_at)).not.toThrow()
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------
  it('dispose resolves without error', async () => {
    await expect(verifier.dispose()).resolves.toBeUndefined()
  })
})
