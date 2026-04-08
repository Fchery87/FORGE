import { spawn } from 'node:child_process'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  Executor,
  ExecutorConfig,
  TaskContext,
  ExecutorResult,
} from '@forge-core/types'

export interface CodexConfig {
  model?: string
  timeout_ms?: number
  working_directory?: string
}

const DEFAULT_TIMEOUT_MS = 300_000

function buildPrompt(content: string): string {
  return `You are a Forge Builder agent running in Codex. Execute the following task precisely.

${content}

When complete, output a JSON result on the last line matching this schema:
{"task_id": "<task_id>", "status": "completed" | "failed" | "partial", "summary": "<summary>", "files_changed": [], "tests_added": [], "tests_run": [], "acceptance_criteria_status": [], "issues": [], "merge_recommendation": "merge" | "revise" | "reject"}`
}

function parseConfig(options: Record<string, unknown>): CodexConfig {
  const cfg: CodexConfig = {}
  if (typeof options['model'] === 'string') cfg.model = options['model']
  if (typeof options['timeout_ms'] === 'number') cfg.timeout_ms = options['timeout_ms']
  if (typeof options['working_directory'] === 'string') cfg.working_directory = options['working_directory']
  return cfg
}

function parseResultPayload(payload: string, taskId: string): ExecutorResult {
  const lines = payload.trimEnd().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) continue
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      return {
        task_id: typeof parsed['task_id'] === 'string' ? parsed['task_id'] : taskId,
        status:
          parsed['status'] === 'completed' ||
          parsed['status'] === 'failed' ||
          parsed['status'] === 'partial'
            ? parsed['status']
            : 'failed',
        summary: typeof parsed['summary'] === 'string' ? parsed['summary'] : '',
        files_changed: Array.isArray(parsed['files_changed']) ? parsed['files_changed'] as ExecutorResult['files_changed'] : [],
        tests_added: Array.isArray(parsed['tests_added']) ? parsed['tests_added'] as string[] : [],
        tests_run: Array.isArray(parsed['tests_run']) ? parsed['tests_run'] as ExecutorResult['tests_run'] : [],
        acceptance_criteria_status: Array.isArray(parsed['acceptance_criteria_status']) ? parsed['acceptance_criteria_status'] as ExecutorResult['acceptance_criteria_status'] : [],
        issues: Array.isArray(parsed['issues']) ? parsed['issues'] as string[] : [],
        merge_recommendation:
          parsed['merge_recommendation'] === 'merge' ||
          parsed['merge_recommendation'] === 'revise' ||
          parsed['merge_recommendation'] === 'reject'
            ? parsed['merge_recommendation']
            : 'revise',
      }
    } catch {
      continue
    }
  }

  return {
    task_id: taskId,
    status: 'failed',
    summary: 'Could not parse executor result from output',
    files_changed: [],
    tests_added: [],
    tests_run: [],
    acceptance_criteria_status: [],
    issues: [],
    merge_recommendation: 'revise',
  }
}

export class CodexExecutor implements Executor {
  readonly name = 'codex'

  private config: CodexConfig = {}

  async initialize(config: ExecutorConfig): Promise<void> {
    const parsed = parseConfig(config.options as Record<string, unknown>)
    this.config = {
      model: parsed.model,
      timeout_ms: parsed.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      working_directory: parsed.working_directory,
    }
  }

  async dispatch(context: TaskContext): Promise<ExecutorResult> {
    const prompt = buildPrompt(context.context_pack.content)
    const outputFile = join(tmpdir(), `forge-codex-output-${randomUUID()}.jsonl`)

    try {
      const run = await this.runCodex(prompt, outputFile)
      if (run.enoent) {
        return this.errorResult('codex CLI not found. Install Codex and ensure `codex` is on PATH.')
      }
      if (run.spawnError) {
        return this.errorResult(run.spawnError.message)
      }

      const output = await readFile(outputFile, 'utf8').catch(() => run.stdout)
      return parseResultPayload(output, context.task_id)
    } finally {
      await unlink(outputFile).catch(() => {})
    }
  }

  async dispose(): Promise<void> {
    // no-op
  }

  private runCodex(
    prompt: string,
    outputFile: string,
  ): Promise<{ stdout: string; spawnError: Error | null; enoent: boolean }> {
    return new Promise((resolve) => {
      const args = [
        'exec',
        '--skip-git-repo-check',
        '--output-last-message',
        outputFile,
        '-',
      ]
      if (this.config.model) {
        args.push('--model', this.config.model)
      }

      const cwd = this.config.working_directory ?? process.cwd()
      const timeoutMs = this.config.timeout_ms ?? DEFAULT_TIMEOUT_MS

      let child: ReturnType<typeof spawn>
      try {
        child = spawn('codex', args, {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        resolve({
          stdout: '',
          spawnError: error,
          enoent: (err as NodeJS.ErrnoException).code === 'ENOENT',
        })
        return
      }

      let stdout = ''
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr?.on('data', () => {
        // stderr is ignored; output file is the source of truth
      })

      child.stdin?.write(prompt)
      child.stdin?.end()

      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        resolve({ stdout, spawnError: null, enoent: false })
      }, timeoutMs)

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        resolve({
          stdout,
          spawnError: err,
          enoent: err.code === 'ENOENT',
        })
      })

      child.on('close', () => {
        clearTimeout(timer)
        if (!timedOut) {
          resolve({ stdout, spawnError: null, enoent: false })
        }
      })
    })
  }

  private errorResult(error: string): ExecutorResult {
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
