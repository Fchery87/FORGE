import { z } from 'zod'
import type { Task } from './task.js'
import type { Decision } from './state.js'
import type { OwnerRole } from './task.js'
import type { SkillActivation, PersonaManifest } from './skill.js'

export type DigestType = 'state' | 'decision' | 'changes' | 'next_step'

export interface ContextPackSections {
  objective: string
  task: Task | null
  constraints: string[]
  relevant_decisions: Decision[]
  relevant_files: string[]
  recent_changes: string[]
  open_issues: string[]
  state_digest: string
  active_skills: SkillActivation[]
  skill_references: string[]
  persona_overlay: PersonaManifest | null
  verification_gates: string[]
}

export interface ContextPack {
  pack_id: string
  generated_at: string   // ISO 8601
  target_role: OwnerRole
  target_task: string | null   // task_id
  estimated_tokens: number
  sections: ContextPackSections
}

export interface ContextBudget {
  estimated_tokens_used: number
  context_window_estimate: number
  budget_warning_threshold: number
  warning_active: boolean
  recommendation: string | null
}

export interface Digest {
  type: DigestType
  content: string
  generated_at: string
}

export interface Snapshot {
  snapshot_id: string   // e.g., "SNAP-001"
  label: string | null
  created_at: string
  // Serialized state — stored as opaque JSON blob
  // Full type is SnapshotData, but for the interface we just need to know it exists
  data: SnapshotData
}

export interface SnapshotData {
  project: unknown
  architecture: unknown
  execution: unknown
  context: unknown
  task_index: Record<string, unknown>   // task_id -> Task
  decision_index: Record<string, unknown>  // decision_id -> Decision
}

// --- Runtime schemas ---

export const digestTypeSchema = z.enum(['state', 'decision', 'changes', 'next_step'])

export const digestSchema = z.object({
  type: digestTypeSchema,
  content: z.string(),
  generated_at: z.string(),
})

export const snapshotDataSchema = z.object({
  project: z.unknown(),
  architecture: z.unknown(),
  execution: z.unknown(),
  context: z.unknown(),
  task_index: z.record(z.string(), z.unknown()),
  decision_index: z.record(z.string(), z.unknown()),
})

export const snapshotSchema = z.object({
  snapshot_id: z.string(),
  label: z.string().nullable(),
  created_at: z.string(),
  data: snapshotDataSchema,
})
