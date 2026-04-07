import { spawn } from 'node:child_process'
import type {
  Verifier,
  VerifierConfig,
  VerificationPlan,
  VerificationResult,
  VerificationType,
  CheckResult,
  Issue,
} from '@forge-core/types'

export interface TestRunnerConfig {
  command: string
  cwd?: string
  timeout_ms?: number
  env?: NodeJS.ProcessEnv
}

const DEFAULT_TIMEOUT_MS = 60_000

export class TestRunnerVerifier implements Verifier {
  readonly name = 'test-runner'
  readonly supports: VerificationType[] = ['unit', 'integration']

  private config: TestRunnerConfig = { command: 'npm test' }

  async initialize(config: VerifierConfig): Promise<void> {
    const opts = config.options as Partial<TestRunnerConfig>
    this.config = {
      command: opts.command ?? 'npm test',
      cwd: opts.cwd,
      timeout_ms: opts.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      env: opts.env,
    }
  }

  async verify(plan: VerificationPlan): Promise<VerificationResult> {
    const startTime = Date.now()
    const { command, cwd, timeout_ms = DEFAULT_TIMEOUT_MS, env } = this.config

    if (!command.trim()) {
      throw new Error('TestRunnerVerifier: command must not be empty')
    }

    const [cmd, ...args] = command.split(/\s+/)

    const { output, exitCode } = await this._runCommand(cmd, args, {
      cwd: cwd ?? process.cwd(),
      timeout_ms,
      env: { ...process.env, ...env },
    })

    const duration = Date.now() - startTime

    const passingLines = this._extractPassingLines(output)
    const failingLines = this._extractFailingLines(output)

    const passCount = passingLines.length
    const failCount = failingLines.length

    let status: 'pass' | 'fail' | 'partial'
    if (exitCode === 0) {
      status = 'pass'
    } else if (passCount > 0 && failCount > 0) {
      status = 'partial'
    } else {
      status = 'fail'
    }

    const checks: CheckResult[] = this._buildChecks(
      passingLines,
      failingLines,
      output,
      duration,
    )

    const issues: Issue[] = failingLines.map((line) => ({
      severity: 'major' as const,
      description: line.trim(),
      file: null,
      task_id: plan.task_ids[0] ?? null,
      auto_reopen: true,
    }))

    const summary = `${passCount} passed, ${failCount} failed`

    return {
      plan_id: plan.plan_id,
      status,
      checks,
      evidence: [
        {
          type: 'test_output',
          path: '',
          description: output,
        },
      ],
      issues,
      summary,
      created_at: new Date().toISOString(),
    }
  }

  async dispose(): Promise<void> {
    // no-op
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _runCommand(
    cmd: string,
    args: string[],
    opts: { cwd: string; timeout_ms: number; env: NodeJS.ProcessEnv },
  ): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let output = ''
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })

      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        resolve({ output: output + '\n[TIMEOUT]', exitCode: 1 })
      }, opts.timeout_ms)

      child.on('error', (err: Error) => {
        clearTimeout(timer)
        reject(err)
      })

      child.on('close', (code: number | null) => {
        clearTimeout(timer)
        if (!timedOut) resolve({ output, exitCode: code ?? 1 })
      })
    })
  }

  private _extractPassingLines(output: string): string[] {
    return output
      .split('\n')
      .filter((line) =>
        /[✓✔]|passed|PASS\b|^ok\b/.test(line),
      )
  }

  private _extractFailingLines(output: string): string[] {
    return output
      .split('\n')
      .filter((line) =>
        /[✗✘×●]|failed|FAIL\b|FAILED\b|not ok/.test(line),
      )
  }

  private _buildChecks(
    passingLines: string[],
    failingLines: string[],
    output: string,
    totalDuration: number,
  ): CheckResult[] {
    const checks: CheckResult[] = []

    if (passingLines.length === 0 && failingLines.length === 0) {
      // Aggregate check — no individual test names detected
      checks.push({
        name: 'test-suite',
        type: 'unit',
        status: 'fail',
        duration_ms: totalDuration,
        output,
      })
      return checks
    }

    const perCheck = Math.round(totalDuration / (passingLines.length + failingLines.length || 1))

    for (const line of passingLines) {
      checks.push({
        name: line.trim() || 'passing test',
        type: 'unit',
        status: 'pass',
        duration_ms: perCheck,
        output: line,
      })
    }

    for (const line of failingLines) {
      checks.push({
        name: line.trim() || 'failing test',
        type: 'unit',
        status: 'fail',
        duration_ms: perCheck,
        output: line,
      })
    }

    return checks
  }
}
