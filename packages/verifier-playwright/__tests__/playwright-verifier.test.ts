import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { VerificationPlan } from '@forge-core/types'

// ---------------------------------------------------------------------------
// Mock node:fs/promises so tests never touch the filesystem
// ---------------------------------------------------------------------------
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Playwright mock
// We control these mutable objects from within tests to simulate behaviour.
// ---------------------------------------------------------------------------

// State that tests can configure
const _state = {
  gotoError: null as Error | null,
  pageErrors: [] as string[],
  consoleMessages: [] as Array<{ type: string; text: string }>,
}

// Page event listener registry
const _listeners: Record<string, Array<(arg: unknown) => void>> = {}

const _mockPage = {
  setDefaultTimeout: vi.fn(),
  on: vi.fn((event: string, handler: (arg: unknown) => void) => {
    if (!_listeners[event]) _listeners[event] = []
    _listeners[event].push(handler)
  }),
  goto: vi.fn(async () => {
    // Fire queued console messages
    for (const msg of _state.consoleMessages) {
      const msgObj = { type: () => msg.type, text: () => msg.text }
      for (const h of _listeners['console'] ?? []) h(msgObj)
    }
    // Fire queued page errors
    for (const errMsg of _state.pageErrors) {
      for (const h of _listeners['pageerror'] ?? []) h(new Error(errMsg))
    }
    if (_state.gotoError) throw _state.gotoError
  }),
  screenshot: vi.fn(async () => Buffer.from('fake-png')),
  close: vi.fn(async () => undefined),
}

const _mockBrowser = {
  newPage: vi.fn(async () => _mockPage),
  close: vi.fn(async () => undefined),
}

const _mockChromium = {
  launch: vi.fn(async () => _mockBrowser),
}

vi.mock('playwright', () => ({
  chromium: _mockChromium,
}))

// ---------------------------------------------------------------------------
// Import AFTER mocks are hoisted
// ---------------------------------------------------------------------------
import { PlaywrightVerifier } from '../src/playwright-verifier.js'

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
    strategies: ['browser'],
    ...overrides,
  }
}

function resetState() {
  _state.gotoError = null
  _state.pageErrors = []
  _state.consoleMessages = []
  for (const key of Object.keys(_listeners)) {
    delete _listeners[key]
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlaywrightVerifier', () => {
  let verifier: PlaywrightVerifier

  beforeEach(async () => {
    resetState()
    vi.clearAllMocks()

    // Restore mock implementations after clearAllMocks wipes them
    _mockPage.goto.mockImplementation(async () => {
      for (const msg of _state.consoleMessages) {
        const msgObj = { type: () => msg.type, text: () => msg.text }
        for (const h of _listeners['console'] ?? []) h(msgObj)
      }
      for (const errMsg of _state.pageErrors) {
        for (const h of _listeners['pageerror'] ?? []) h(new Error(errMsg))
      }
      if (_state.gotoError) throw _state.gotoError
    })
    _mockPage.screenshot.mockResolvedValue(Buffer.from('fake-png'))
    _mockPage.close.mockResolvedValue(undefined)
    _mockPage.on.mockImplementation((event: string, handler: (arg: unknown) => void) => {
      if (!_listeners[event]) _listeners[event] = []
      _listeners[event].push(handler)
    })
    _mockBrowser.newPage.mockResolvedValue(_mockPage)
    _mockBrowser.close.mockResolvedValue(undefined)
    _mockChromium.launch.mockResolvedValue(_mockBrowser)

    verifier = new PlaywrightVerifier()
    await verifier.initialize({
      name: 'playwright',
      options: {
        base_url: 'http://localhost:3000',
        evidence_dir: '.forge/qa/evidence',
        routes: [{ path: '/dashboard', name: 'dashboard' }],
      },
    })
  })

  // -------------------------------------------------------------------------
  // name / supports
  // -------------------------------------------------------------------------
  it('has correct name', () => {
    expect(verifier.name).toBe('playwright')
  })

  it('has correct supports array', () => {
    expect(verifier.supports).toContain('browser')
    expect(verifier.supports).toContain('e2e')
  })

  // -------------------------------------------------------------------------
  // Skip when no browser strategy
  // -------------------------------------------------------------------------
  it('returns pass with no checks when strategy is unit only', async () => {
    const result = await verifier.verify(makePlan({ strategies: ['unit'] }))
    expect(result.status).toBe('pass')
    expect(result.checks).toHaveLength(0)
    expect(result.summary).toMatch(/No browser checks/i)
  })

  it('does not launch a browser when strategy is skipped', async () => {
    await verifier.verify(makePlan({ strategies: ['unit'] }))
    expect(_mockChromium.launch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Successful navigation
  // -------------------------------------------------------------------------
  it('returns pass result when navigation succeeds', async () => {
    const result = await verifier.verify(makePlan())
    expect(result.status).toBe('pass')
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0].status).toBe('pass')
    expect(result.checks[0].name).toBe('dashboard')
  })

  it('launches browser with headless: true by default', async () => {
    await verifier.verify(makePlan())
    expect(_mockChromium.launch).toHaveBeenCalledWith({ headless: true })
  })

  it('closes browser after verify', async () => {
    await verifier.verify(makePlan())
    expect(_mockBrowser.close).toHaveBeenCalled()
  })

  it('navigates to base_url + route path', async () => {
    await verifier.verify(makePlan())
    expect(_mockPage.goto).toHaveBeenCalledWith('http://localhost:3000/dashboard')
  })

  it('takes a screenshot per route', async () => {
    await verifier.verify(makePlan())
    expect(_mockPage.screenshot).toHaveBeenCalled()
  })

  it('includes screenshot evidence artifact', async () => {
    const result = await verifier.verify(makePlan())
    const screenshots = result.evidence.filter((e) => e.type === 'screenshot')
    expect(screenshots.length).toBeGreaterThanOrEqual(1)
    expect(screenshots[0].path).toContain('dashboard.png')
  })

  it('includes console_log evidence artifact', async () => {
    const result = await verifier.verify(makePlan())
    const logs = result.evidence.filter((e) => e.type === 'console_log')
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  it('returns correct plan_id', async () => {
    const result = await verifier.verify(makePlan({ plan_id: 'my-plan' }))
    expect(result.plan_id).toBe('my-plan')
  })

  it('returns created_at as ISO string', async () => {
    const result = await verifier.verify(makePlan())
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  // -------------------------------------------------------------------------
  // Page error during navigation → fail check + issue
  // -------------------------------------------------------------------------
  it('returns fail check when a page error occurs', async () => {
    _state.pageErrors = ['Uncaught ReferenceError: foo is not defined']
    const result = await verifier.verify(makePlan())
    expect(result.checks[0].status).toBe('fail')
    expect(result.checks[0].output).toContain('Uncaught ReferenceError')
  })

  it('creates an issue with severity major for a page error', async () => {
    _state.pageErrors = ['Uncaught TypeError: cannot read property']
    const result = await verifier.verify(makePlan())
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].severity).toBe('major')
  })

  it('returns status fail when all checks fail', async () => {
    _state.pageErrors = ['fatal page error']
    const result = await verifier.verify(makePlan())
    expect(result.status).toBe('fail')
  })

  it('returns status partial when some checks pass and some fail', async () => {
    const v2 = new PlaywrightVerifier()
    await v2.initialize({
      name: 'playwright',
      options: {
        base_url: 'http://localhost:3000',
        evidence_dir: '.forge/qa/evidence',
        routes: [
          { path: '/', name: 'home' },
          { path: '/broken', name: 'broken' },
        ],
      },
    })

    let callCount = 0
    _mockPage.goto.mockImplementation(async () => {
      callCount++
      if (callCount === 2) {
        // Simulate pageerror on second route
        for (const h of _listeners['pageerror'] ?? []) {
          h(new Error('broken page'))
        }
      }
    })

    const result = await v2.verify(makePlan())
    expect(result.status).toBe('partial')
  })

  // -------------------------------------------------------------------------
  // Navigation failure (goto throws)
  // -------------------------------------------------------------------------
  it('returns fail check when goto throws', async () => {
    _state.gotoError = new Error('net::ERR_CONNECTION_REFUSED')
    const result = await verifier.verify(makePlan())
    expect(result.checks[0].status).toBe('fail')
    expect(result.checks[0].output).toContain('ERR_CONNECTION_REFUSED')
  })

  it('still closes browser when goto throws', async () => {
    _state.gotoError = new Error('timeout')
    await verifier.verify(makePlan())
    expect(_mockBrowser.close).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Missing base_url with no routes
  // -------------------------------------------------------------------------
  it('returns pass gracefully when no base_url and no routes configured', async () => {
    const v = new PlaywrightVerifier()
    await v.initialize({ name: 'playwright', options: {} })
    const result = await v.verify(makePlan())
    expect(result.status).toBe('pass')
    expect(result.summary).toContain('No routes configured')
  })

  // -------------------------------------------------------------------------
  // Default route when base_url is set but no routes array
  // -------------------------------------------------------------------------
  it('uses default "/" route when base_url provided but routes not set', async () => {
    const v = new PlaywrightVerifier()
    await v.initialize({
      name: 'playwright',
      options: { base_url: 'http://localhost:4000' },
    })
    await v.verify(makePlan())
    expect(_mockPage.goto).toHaveBeenCalledWith('http://localhost:4000/')
  })

  // -------------------------------------------------------------------------
  // Playwright not available — exercises the real catch branch in verify()
  // -------------------------------------------------------------------------
  it('returns fail result when playwright is not installed', async () => {
    // Reset the module registry so the next dynamic import('playwright') goes
    // through the mock factory again, then register a throwing replacement.
    vi.resetModules()
    vi.doMock('playwright', () => {
      throw new Error('Cannot find module playwright')
    })

    // Re-import the verifier so its module-level state is fresh and its
    // dynamic import('playwright') will hit the new throwing mock.
    const { PlaywrightVerifier: FreshVerifier } = await import(
      '../src/playwright-verifier.js'
    )
    const freshVerifier = new FreshVerifier()
    await freshVerifier.initialize({
      name: 'playwright',
      options: {
        base_url: 'http://localhost:3000',
        evidence_dir: '.forge/qa/evidence',
        routes: [{ path: '/dashboard', name: 'dashboard' }],
      },
    })

    const result = await freshVerifier.verify(makePlan())
    expect(result.status).toBe('fail')
    expect(result.checks).toHaveLength(0)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].severity).toBe('critical')
    expect(result.issues[0].description).toContain('npm install playwright')
    expect(result.summary).toContain('npm install playwright')

    // Restore normal mocks for subsequent tests
    vi.resetModules()
    vi.doMock('playwright', () => ({ chromium: _mockChromium }))
  })

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------
  it('dispose resolves without error', async () => {
    await expect(verifier.dispose()).resolves.toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Summary format
  // -------------------------------------------------------------------------
  it('includes pass/fail counts in summary', async () => {
    const result = await verifier.verify(makePlan())
    expect(result.summary).toMatch(/\d+ passed, \d+ failed/)
  })

  // -------------------------------------------------------------------------
  // e2e strategy also triggers browser checks
  // -------------------------------------------------------------------------
  it('runs browser checks when strategy is e2e', async () => {
    const result = await verifier.verify(makePlan({ strategies: ['e2e'] }))
    expect(result.status).toBe('pass')
    expect(_mockChromium.launch).toHaveBeenCalled()
  })
})
