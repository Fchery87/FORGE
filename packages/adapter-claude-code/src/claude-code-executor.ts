import { spawn } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  Executor,
  ExecutorConfig,
  TaskContext,
  ExecutorResult,
} from '@forge-core/types'

export interface ClaudeCodeConfig {
  model?: string
  max_tokens?: number
  timeout_ms?: number
  working_directory?: string
}

const DEFAULT_TIMEOUT_MS = 300_000 // 5 minutes

function buildPrompt(content: string): string {
  return `You are a Forge Builder agent. Execute the following task precisely.

${content}

When complete, output a JSON result on the last line matching this schema:
{"task_id": "<task_id>", "status": "completed" | "failed" | "partial", "summary": "<summary>", "files_changed": [], "tests_added": [], "tests_run": [], "acceptance_criteria_status": [], "issues": [], "merge_recommendation": "merge" | "revise" | "reject"}`
}

function parseLastLine(stdout: string): Record<string, unknown> | null {
  const lines = stdout.trimEnd().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('{')) {
      try {
        return JSON.parse(line) as Record<string, unknown>
      } catch {
        // not valid JSON, keep looking
      }
    }
  }
  return null
}

function parseConfig(options: Record<string, unknown>): ClaudeCodeConfig {
  const cfg: ClaudeCodeConfig = {}
  if (typeof options['model'] === 'string') cfg.model = options['model']
  if (typeof options['max_tokens'] === 'number') cfg.max_tokens = options['max_tokens']
  if (typeof options['timeout_ms'] === 'number') cfg.timeout_ms = options['timeout_ms']
  if (typeof options['working_directory'] === 'string') cfg.working_directory = options['working_directory']
  return cfg
}

export class ClaudeCodeExecutor implements Executor {
  readonly name = 'claude-code'

  private config: ClaudeCodeConfig = {}

  async initialize(config: ExecutorConfig): Promise<void> {
    const parsed = parseConfig(config.options as Record<string, unknown>)
    this.config = {
      model: parsed.model,
      max_tokens: parsed.max_tokens,
      timeout_ms: parsed.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      working_directory: parsed.working_directory,
    }
  }

  async dispatch(context: TaskContext): Promise<ExecutorResult> {
    const prompt = buildPrompt(context.context_pack.content)
    const tempFile = join(tmpdir(), `forge-${randomUUID()}.md`)

    try {
      await writeFile(tempFile, prompt, 'utf8')
      const result = await this._runClaude(tempFile)

      if (result.enoent) {
        return this._errorResult(
          'claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code',
        )
      }
      if (result.spawnError) {
        return this._errorResult(result.spawnError.message)
      }

      const stdout = result.stdout
      const parsed = parseLastLine(stdout)

      if (!parsed) {
        return {
          task_id: context.task_id,
          status: 'failed',
          summary: 'Could not parse executor result from output',
          files_changed: [],
          tests_added: [],
          tests_run: [],
          acceptance_criteria_status: [],
          issues: [],
          merge_recommendation: 'revise',
          output: stdout,
        } as ExecutorResult & { output: string }
      }

      return {
        task_id: (parsed['task_id'] as string | undefined) ?? context.task_id,
        status:
          (parsed['status'] as ExecutorResult['status'] | undefined) ?? 'failed',
        summary: (parsed['summary'] as string | undefined) ?? '',
        files_changed:
          (parsed['files_changed'] as ExecutorResult['files_changed'] | undefined) ?? [],
        tests_added:
          (parsed['tests_added'] as string[] | undefined) ?? [],
        tests_run:
          (parsed['tests_run'] as ExecutorResult['tests_run'] | undefined) ?? [],
        acceptance_criteria_status:
          (parsed['acceptance_criteria_status'] as ExecutorResult['acceptance_criteria_status'] | undefined) ?? [],
        issues:
          (parsed['issues'] as string[] | undefined) ?? [],
        merge_recommendation:
          (parsed['merge_recommendation'] as ExecutorResult['merge_recommendation'] | undefined) ?? 'revise',
      }
    } finally {
      await unlink(tempFile).catch(() => {})  // ignore if never created
    }
  }

  async dispose(): Promise<void> {
    // no-op
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _runClaude(
    inputFile: string,
  ): Promise<{ stdout: string; exitCode: number; spawnError: Error | null; enoent: boolean }> {
    return new Promise((resolve) => {
      const args = ['--print', '--input-file', inputFile]
      if (this.config.model) {
        args.push('--model', this.config.model)
      }
      if (this.config.max_tokens !== undefined) {
        args.push('--max-tokens', String(this.config.max_tokens))
      }

      const cwd = this.config.working_directory ?? process.cwd()
      const timeout_ms = this.config.timeout_ms ?? DEFAULT_TIMEOUT_MS

      let child: ReturnType<typeof spawn>
      try {
        child = spawn('claude', args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err) {
        const isEnoent = (err as NodeJS.ErrnoException).code === 'ENOENT'
        resolve({
          stdout: '',
          exitCode: 1,
          spawnError: err instanceof Error ? err : new Error(String(err)),
          enoent: isEnoent,
        })
        return
      }

      let stdout = ''

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      child.stderr?.on('data', (_chunk: Buffer) => {
        // discard stderr
      })

      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        resolve({ stdout, exitCode: 1, spawnError: null, enoent: false })
      }, timeout_ms)

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (timedOut) return  // already resolved by timeout handler
        clearTimeout(timer)
        if (err.code === 'ENOENT') {
          resolve({ stdout: '', exitCode: -1, spawnError: err, enoent: true })
        } else {
          resolve({ stdout: '', exitCode: -1, spawnError: err, enoent: false })
        }
      })

      child.on('close', (code: number | null) => {
        clearTimeout(timer)
        if (!timedOut) {
          resolve({ stdout, exitCode: code ?? 1, spawnError: null, enoent: false })
        }
      })
    })
  }

  private _errorResult(error: string): ExecutorResult {
    return {
      task_id: '',
      status: 'failed',
      summary: error,
      files_changed: [],
      tests_added: [],
      tests_run: [],
      acceptance_criteria_status: [],
      issues: [error],
      merge_recommendation: 'revise',
    }
  }
}
