import type { ExecutorResult } from './task.js'

// Re-export so consumers can import ExecutorResult from executor.ts too
export type { ExecutorResult }

export interface ExecutorConfig {
  name: string
  options: Record<string, unknown>
}

export interface TaskContext {
  task_id: string
  context_pack: ContextPackRef   // reference, not full object (avoids circular import)
  working_directory: string
}

// Minimal reference type to avoid circular dependency with context.ts
// Full ContextPack type is in context.ts
export interface ContextPackRef {
  pack_id: string
  estimated_tokens: number
  content: string   // Rendered markdown content of the context pack
}

export interface Executor {
  readonly name: string
  initialize(config: ExecutorConfig): Promise<void>
  dispatch(context: TaskContext): Promise<ExecutorResult>
  dispose(): Promise<void>
}
