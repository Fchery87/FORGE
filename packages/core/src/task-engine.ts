import type { Task, TaskStatus } from '@forge-agent/types'
import { TASK_TRANSITIONS } from '@forge-agent/types'
import type { StateManager } from './state-manager.js'
import type { IdGenerator } from './id-generator.js'

export type CreateTaskInput = Omit<Task, 'task_id' | 'status' | 'evidence' | 'result' | 'created_at' | 'updated_at'>

export class TaskTransitionError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly currentStatus: TaskStatus,
    public readonly attemptedStatus: TaskStatus,
    public readonly validTransitions: TaskStatus[],
  ) {
    super(
      `Task ${taskId}: cannot transition from '${currentStatus}' to '${attemptedStatus}'. ` +
      `Valid transitions: [${validTransitions.join(', ') || 'none'}]`
    )
    this.name = 'TaskTransitionError'
  }
}

export class TaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task ${taskId} not found`)
    this.name = 'TaskNotFoundError'
  }
}

export class TaskEngine {
  constructor(
    private readonly stateManager: StateManager,
    private readonly idGenerator: IdGenerator,
  ) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    const taskId = await this.idGenerator.next('TASK')
    const now = new Date().toISOString()
    const task: Task = {
      ...input,
      task_id: taskId,
      status: 'draft',
      evidence: [],
      result: null,
      created_at: now,
      updated_at: now,
    }
    await this.stateManager.saveTask(task)
    return task
  }

  async getTask(taskId: string): Promise<Task> {
    const task = await this.stateManager.getTask(taskId)
    if (!task) throw new TaskNotFoundError(taskId)
    return task
  }

  async updateTask(taskId: string, patch: Partial<Omit<Task, 'task_id' | 'status' | 'created_at'>>): Promise<Task> {
    const task = await this.getTask(taskId)
    const updated: Task = {
      ...task,
      ...patch,
      task_id: task.task_id,
      status: task.status,
      created_at: task.created_at,
      updated_at: new Date().toISOString(),
    }
    await this.stateManager.saveTask(updated)
    return updated
  }

  async transition(taskId: string, newStatus: TaskStatus): Promise<Task> {
    const task = await this.getTask(taskId)
    const validTransitions = TASK_TRANSITIONS[task.status]

    if (!validTransitions.includes(newStatus)) {
      throw new TaskTransitionError(taskId, task.status, newStatus, validTransitions)
    }

    const updated: Task = {
      ...task,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }
    await this.stateManager.saveTask(updated)
    return updated
  }

  async listTasks(): Promise<Task[]> {
    return this.stateManager.listTasks()
  }

  async listByStatus(status: TaskStatus): Promise<Task[]> {
    const tasks = await this.listTasks()
    return tasks.filter(t => t.status === status)
  }

  async listByPhase(phaseId: string): Promise<Task[]> {
    const tasks = await this.listTasks()
    return tasks.filter(t => t.phase === phaseId)
  }

  async getReadyTasks(): Promise<Task[]> {
    const tasks = await this.listTasks()
    const doneTasks = new Set(
      tasks.filter(t => t.status === 'done').map(t => t.task_id)
    )
    return tasks.filter(t =>
      (t.status === 'planned' || t.status === 'ready') &&
      t.dependencies.every(dep => doneTasks.has(dep))
    )
  }
}
