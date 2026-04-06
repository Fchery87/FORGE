import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  Verifier,
  VerifierConfig,
  VerificationPlan,
  VerificationResult,
  VerificationType,
  CheckResult,
  EvidenceArtifact,
  Issue,
} from '@forge-agent/types'

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface RouteCheck {
  path: string
  name: string
  assertions?: string[]
}

export interface PlaywrightConfig {
  base_url?: string
  headless?: boolean
  timeout_ms?: number
  evidence_dir?: string
  session_file?: string | null
  routes?: RouteCheck[]
}

// ---------------------------------------------------------------------------
// Runtime type guards / parseConfig
// ---------------------------------------------------------------------------

function isRouteCheck(val: unknown): val is RouteCheck {
  if (typeof val !== 'object' || val === null) return false
  const obj = val as Record<string, unknown>
  return typeof obj['path'] === 'string' && typeof obj['name'] === 'string'
}

function parseConfig(options: Record<string, unknown>): PlaywrightConfig {
  const config: PlaywrightConfig = {}

  if (typeof options['base_url'] === 'string') {
    config.base_url = options['base_url']
  }
  if (typeof options['headless'] === 'boolean') {
    config.headless = options['headless']
  }
  if (typeof options['timeout_ms'] === 'number') {
    config.timeout_ms = options['timeout_ms']
  }
  if (typeof options['evidence_dir'] === 'string') {
    config.evidence_dir = options['evidence_dir']
  }
  if (typeof options['session_file'] === 'string') {
    config.session_file = options['session_file']
  }
  if (Array.isArray(options['routes'])) {
    config.routes = (options['routes'] as unknown[]).filter(isRouteCheck)
  }

  return config
}

// ---------------------------------------------------------------------------
// PlaywrightVerifier
// ---------------------------------------------------------------------------

export class PlaywrightVerifier implements Verifier {
  readonly name = 'playwright'
  readonly supports: VerificationType[] = ['browser', 'e2e']

  private config: PlaywrightConfig = {}

  async initialize(config: VerifierConfig): Promise<void> {
    this.config = parseConfig(config.options)
  }

  async verify(plan: VerificationPlan): Promise<VerificationResult> {
    // Skip if no browser/e2e strategy requested
    if (
      !plan.strategies.includes('browser') &&
      !plan.strategies.includes('e2e')
    ) {
      return {
        plan_id: plan.plan_id,
        status: 'pass',
        checks: [],
        evidence: [],
        issues: [],
        summary: 'No browser checks requested',
        created_at: new Date().toISOString(),
      }
    }

    // Check playwright availability
    let playwrightModule: { chromium: import('playwright').BrowserType }
    try {
      playwrightModule = (await import('playwright')) as {
        chromium: import('playwright').BrowserType
      }
    } catch {
      return {
        plan_id: plan.plan_id,
        status: 'fail',
        checks: [],
        evidence: [],
        issues: [
          {
            severity: 'critical',
            description: 'playwright not installed. Run: npm install playwright',
            file: null,
            task_id: plan.task_ids[0] ?? null,
            auto_reopen: true,
          },
        ],
        summary: 'playwright not installed. Run: npm install playwright',
        created_at: new Date().toISOString(),
      }
    }

    const {
      base_url = '',
      headless = true,
      timeout_ms = 30_000,
      evidence_dir = '.forge/qa/evidence',
    } = this.config

    const routes: RouteCheck[] =
      this.config.routes && this.config.routes.length > 0
        ? this.config.routes
        : base_url
          ? [{ path: '/', name: 'home' }]
          : []

    // If no base_url and no routes, return pass gracefully
    if (routes.length === 0) {
      return {
        plan_id: plan.plan_id,
        status: 'pass',
        checks: [],
        evidence: [],
        issues: [],
        summary: 'No routes configured for browser checks',
        created_at: new Date().toISOString(),
      }
    }

    const checks: CheckResult[] = []
    const evidence: EvidenceArtifact[] = []
    const issues: Issue[] = []

    const browser = await playwrightModule.chromium.launch({ headless })

    try {
      const evidencePlanDir = join(evidence_dir, plan.plan_id)

      for (const route of routes) {
        const startTime = Date.now()
        const url = `${base_url}${route.path}`
        const consoleLogs: string[] = []
        const pageErrors: string[] = []

        const page = await browser.newPage()
        page.setDefaultTimeout(timeout_ms)

        page.on('console', (msg) => {
          consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
        })
        page.on('pageerror', (err) => {
          pageErrors.push(err.message)
        })

        let navigateError: string | null = null
        try {
          await page.goto(url)

          // Take screenshot
          const screenshotPath = join(evidencePlanDir, `${route.name}.png`)
          try {
            await mkdir(evidencePlanDir, { recursive: true })
            const screenshotBuffer = await page.screenshot()
            await writeFile(screenshotPath, screenshotBuffer)
          } catch {
            // Screenshot failure is non-fatal; just note it
          }

          evidence.push({
            type: 'screenshot',
            path: screenshotPath,
            description: `Screenshot of ${route.name} (${url})`,
          })
        } catch (err) {
          navigateError = err instanceof Error ? err.message : String(err)
        }

        // Save console log
        const consoleLogPath = join(evidencePlanDir, `${route.name}-console.txt`)
        const consoleContent = consoleLogs.join('\n')
        try {
          await mkdir(evidencePlanDir, { recursive: true })
          await writeFile(consoleLogPath, consoleContent)
        } catch {
          // non-fatal
        }
        evidence.push({
          type: 'console_log',
          path: consoleLogPath,
          description: `Console log for ${route.name} (${url})`,
        })

        await page.close()

        const duration = Date.now() - startTime
        const allErrors = [
          ...(navigateError ? [navigateError] : []),
          ...pageErrors,
        ]
        const checkStatus: 'pass' | 'fail' =
          allErrors.length === 0 ? 'pass' : 'fail'
        const checkOutput =
          allErrors.length > 0 ? allErrors.join('\n') : null

        checks.push({
          name: route.name,
          type: 'browser',
          status: checkStatus,
          duration_ms: duration,
          output: checkOutput,
        })

        if (allErrors.length > 0) {
          issues.push({
            severity: 'major',
            description: `Browser check failed for route "${route.name}" (${url}): ${allErrors[0]}`,
            file: null,
            task_id: plan.task_ids[0] ?? null,
            auto_reopen: true,
          })
        }
      }
    } finally {
      await browser.close()
    }

    const passCount = checks.filter((c) => c.status === 'pass').length
    const failCount = checks.filter((c) => c.status === 'fail').length

    let status: 'pass' | 'fail' | 'partial'
    if (failCount === 0) {
      status = 'pass'
    } else if (passCount === 0) {
      status = 'fail'
    } else {
      status = 'partial'
    }

    return {
      plan_id: plan.plan_id,
      status,
      checks,
      evidence,
      issues,
      summary: `${passCount} passed, ${failCount} failed`,
      created_at: new Date().toISOString(),
    }
  }

  async dispose(): Promise<void> {
    // no-op: browser is closed after each verify call
  }
}
