import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type {
  ForgeConfig,
  ProjectState,
  ArchitectureState,
  ExecutionState,
  ContextState,
  Task,
  Decision,
} from '@forge-core/types'
import {
  DEFAULT_CONFIG,
  ForgeValidationError,
  parseWithSchema,
  forgeConfigSchema,
  projectStateSchema,
  architectureStateSchema,
  executionStateSchema,
  contextStateSchema,
  taskSchema,
  decisionSchema,
  reviewArtifactSchema,
  snapshotSchema,
} from '@forge-core/types'
import type { ZodType } from 'zod'

export class StateManager {
  private readonly forgeDir: string

  constructor(forgeDir: string) {
    this.forgeDir = forgeDir
  }

  // --- Directory initialization ---

  async initialize(): Promise<void> {
    const dirs = [
      this.forgeDir,
      join(this.forgeDir, 'state'),
      join(this.forgeDir, 'tasks'),
      join(this.forgeDir, 'decisions'),
      join(this.forgeDir, 'reviews'),
      join(this.forgeDir, 'qa'),
      join(this.forgeDir, 'qa', 'evidence'),
      join(this.forgeDir, 'runtime'),
      join(this.forgeDir, 'snapshots'),
      join(this.forgeDir, 'views'),
    ]
    for (const dir of dirs) {
      await mkdir(dir, { recursive: true })
    }
  }

  // --- Config ---

  async getConfig(): Promise<ForgeConfig> {
    return this.readJson<ForgeConfig>(
      join(this.forgeDir, 'config.json'),
      DEFAULT_CONFIG
    )
  }

  async updateConfig(patch: Partial<ForgeConfig>): Promise<void> {
    const current = await this.getConfig()
    await this.writeJson(join(this.forgeDir, 'config.json'), deepMerge(current, patch))
  }

  // --- Project state ---

  async getProject(): Promise<ProjectState> {
    return this.readJson<ProjectState>(
      join(this.forgeDir, 'state', 'project.json'),
      this.defaultProject()
    )
  }

  async updateProject(patch: Partial<ProjectState>): Promise<void> {
    const current = await this.getProject()
    const updated: ProjectState = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    await this.writeJson(join(this.forgeDir, 'state', 'project.json'), updated)
  }

  // --- Architecture state ---

  async getArchitecture(): Promise<ArchitectureState> {
    return this.readJson<ArchitectureState>(
      join(this.forgeDir, 'state', 'architecture.json'),
      this.defaultArchitecture()
    )
  }

  async updateArchitecture(patch: Partial<ArchitectureState>): Promise<void> {
    const current = await this.getArchitecture()
    const updated: ArchitectureState = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    await this.writeJson(join(this.forgeDir, 'state', 'architecture.json'), updated)
  }

  // --- Execution state ---

  async getExecution(): Promise<ExecutionState> {
    return this.readJson<ExecutionState>(
      join(this.forgeDir, 'state', 'execution.json'),
      this.defaultExecution()
    )
  }

  async updateExecution(patch: Partial<ExecutionState>): Promise<void> {
    const current = await this.getExecution()
    const updated: ExecutionState = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    await this.writeJson(join(this.forgeDir, 'state', 'execution.json'), updated)
  }

  // --- Context state ---

  async getContext(): Promise<ContextState> {
    return this.readJson<ContextState>(
      join(this.forgeDir, 'state', 'context.json'),
      this.defaultContext()
    )
  }

  async updateContext(patch: Partial<ContextState>): Promise<void> {
    const current = await this.getContext()
    const updated: ContextState = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    }
    await this.writeJson(join(this.forgeDir, 'state', 'context.json'), updated)
  }

  // --- Tasks ---

  async getTask(taskId: string): Promise<Task | null> {
    const path = join(this.forgeDir, 'tasks', `${taskId}.json`)
    return this.readValidatedJson<Task>(path, taskSchema)
  }

  async saveTask(task: Task): Promise<void> {
    parseWithSchema(taskSchema, task, join(this.forgeDir, 'tasks', `${task.task_id}.json`))
    const updated = { ...task, updated_at: new Date().toISOString() }
    await this.writeJson(
      join(this.forgeDir, 'tasks', `${task.task_id}.json`),
      updated
    )
  }

  async listTasks(): Promise<Task[]> {
    const tasksDir = join(this.forgeDir, 'tasks')
    if (!existsSync(tasksDir)) return []
    const files = await readdir(tasksDir)
    const tasks: Task[] = []
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const task = await this.readValidatedJson<Task>(join(tasksDir, file), taskSchema)
      if (task) tasks.push(task)
    }
    return tasks
  }

  // --- Decisions ---

  async getDecision(decisionId: string): Promise<Decision | null> {
    const path = join(this.forgeDir, 'decisions', `${decisionId}.json`)
    return this.readValidatedJson<Decision>(path, decisionSchema)
  }

  async saveDecision(decision: Decision): Promise<void> {
    parseWithSchema(decisionSchema, decision, join(this.forgeDir, 'decisions', `${decision.decision_id}.json`))
    await this.writeJson(
      join(this.forgeDir, 'decisions', `${decision.decision_id}.json`),
      decision
    )
  }

  async listDecisions(): Promise<Decision[]> {
    const dir = join(this.forgeDir, 'decisions')
    if (!existsSync(dir)) return []
    const files = await readdir(dir)
    const decisions: Decision[] = []
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const d = await this.readValidatedJson<Decision>(join(dir, file), decisionSchema)
      if (d) decisions.push(d)
    }
    return decisions
  }

  // --- Raw file access (for snapshots, reviews, qa) ---

  async readRaw(relativePath: string): Promise<string | null> {
    const path = join(this.forgeDir, relativePath)
    if (!existsSync(path)) return null
    return readFile(path, 'utf-8')
  }

  async writeRaw(relativePath: string, content: string): Promise<void> {
    const path = join(this.forgeDir, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await this.atomicWrite(path, content)
  }

  // --- Schema map for validated reads ---

  private static readonly schemaMap: Record<string, ZodType> = {
    'config.json': forgeConfigSchema,
    'state/project.json': projectStateSchema,
    'state/architecture.json': architectureStateSchema,
    'state/execution.json': executionStateSchema,
    'state/context.json': contextStateSchema,
  }

  private schemaForPath(filePath: string): ZodType | undefined {
    const rel = filePath.startsWith(this.forgeDir)
      ? filePath.slice(this.forgeDir.length + 1)
      : filePath
    return StateManager.schemaMap[rel]
  }

  /**
   * Read and validate JSON using an explicit schema.
   * Returns null if file doesn't exist. Throws ForgeValidationError on corrupt/invalid data.
   */
  async readValidatedJson<T>(filePath: string, schema: ZodType<T>): Promise<T | null> {
    const absPath = filePath.startsWith(this.forgeDir) ? filePath : join(this.forgeDir, filePath)
    if (!existsSync(absPath)) return null
    const content = await readFile(absPath, 'utf-8')
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err) {
      throw new ForgeValidationError(
        absPath,
        { message: err instanceof Error ? err.message : String(err), issues: [] } as never,
        `Corrupt state file at ${absPath}: ${err instanceof Error ? err.message : String(err)}\n` +
        `Delete the file and re-run \`forge init\` to reset.`,
      )
    }
    return parseWithSchema(schema, parsed, absPath)
  }

  // --- Private helpers ---

  private async readJson<T>(filePath: string, defaultValue: T): Promise<T> {
    if (!existsSync(filePath)) return defaultValue
    const content = await readFile(filePath, 'utf-8')
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err) {
      throw new ForgeValidationError(
        filePath,
        err instanceof Error
          ? { message: err.message, issues: [] } as never
          : ({ message: String(err), issues: [] } as never),
        `Corrupt state file at ${filePath}: ${err instanceof Error ? err.message : String(err)}\n` +
        `Delete the file and re-run \`forge init\` to reset.`,
      )
    }
    const schema = this.schemaForPath(filePath)
    if (schema) {
      return parseWithSchema(schema, parsed, filePath) as T
    }
    return parsed as T
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    const schema = this.schemaForPath(filePath)
    if (schema) {
      parseWithSchema(schema, data, filePath)
    }
    const content = JSON.stringify(data, null, 2)
    await mkdir(dirname(filePath), { recursive: true })
    await this.atomicWrite(filePath, content)
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, content, 'utf-8')
    await rename(tmpPath, filePath)
  }

  private defaultProject(): ProjectState {
    const now = new Date().toISOString()
    return {
      name: '',
      description: '',
      goals: [],
      constraints: [],
      current_phase: '',
      current_status: 'intake',
      created_at: now,
      updated_at: now,
    }
  }

  private defaultArchitecture(): ArchitectureState {
    return {
      design_summary: '',
      technical_decisions: [],
      open_questions: [],
      dependencies: [],
      risk_register: [],
      updated_at: new Date().toISOString(),
    }
  }

  private defaultExecution(): ExecutionState {
    return {
      phases: [],
      current_wave: 0,
      total_tasks: 0,
      tasks_done: 0,
      tasks_in_progress: 0,
      tasks_blocked: 0,
      updated_at: new Date().toISOString(),
    }
  }

  private defaultContext(): ContextState {
    const cfg = DEFAULT_CONFIG
    return {
      session_id: `sess-${Date.now()}`,
      estimated_tokens_used: 0,
      budget_warning_threshold: cfg.context.budget_warning_threshold,
      context_window_estimate: cfg.context.context_window_estimate,
      last_snapshot: null,
      last_digest_at: new Date().toISOString(),
      recent_actions: [],
      updated_at: new Date().toISOString(),
    }
  }
}

// Recursively merge b into a, returning a new object. Arrays in b replace arrays in a.
function deepMerge<T extends object>(a: T, b: Partial<T>): T {
  const result = { ...a }
  for (const key of Object.keys(b) as (keyof T)[]) {
    const bVal = b[key]
    const aVal = result[key]
    if (
      bVal !== null &&
      typeof bVal === 'object' &&
      !Array.isArray(bVal) &&
      aVal !== null &&
      typeof aVal === 'object' &&
      !Array.isArray(aVal)
    ) {
      result[key] = deepMerge(aVal as Record<string, unknown>, bVal as Record<string, unknown>) as T[keyof T]
    } else if (bVal !== undefined) {
      result[key] = bVal as T[keyof T]
    }
  }
  return result
}
