export type SkillPhase =
  | 'intake'
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'qa'
  | 'shipping'

export type SkillTriggerType = 'command' | 'phase' | 'task_status' | 'file_pattern'

export interface SkillTrigger {
  type: SkillTriggerType
  value: string
}

export type SkillAssetKind = 'instruction' | 'reference' | 'script'

export interface SkillAssetRef {
  kind: SkillAssetKind
  path: string
  required: boolean
}

export interface SkillManifest {
  name: string
  description: string
  version: string
  phases: SkillPhase[]
  triggers: SkillTrigger[]
  requires: string[]
  verification: string[]
  assets: SkillAssetRef[]
}

export interface SkillActivation {
  skill_name: string
  reason: string
  instructions: string
  references: SkillAssetRef[]
}

export type PersonaRole = 'builder' | 'manager' | 'executive'

export interface PersonaManifest {
  name: string
  role: PersonaRole
  recommended_for: string[]
  prompt_overlay: string
}

export type HookEvent =
  | 'session_start'
  | 'before_context_pack'
  | 'before_execute'
  | 'after_execute'
  | 'before_review'
  | 'before_qa'
  | 'before_ship'
  | 'host_install'

export type HookScope = 'global' | 'command' | 'task'
export type HookAction = 'inject_message' | 'attach_reference' | 'block' | 'annotate_host_artifact'
export type HookFailurePolicy = 'ignore' | 'warn' | 'error'
export type HookSupportedHost = 'codex' | 'claude-code' | 'opencode'

export interface HookDefinition {
  event: HookEvent
  scope: HookScope
  action: HookAction
  host_support: HookSupportedHost[]
  failure_policy: HookFailurePolicy
  message?: string
  reference_path?: string
}

export interface SkillRegistryEntry {
  manifest: SkillManifest
  source: 'builtin' | 'project'
  base_path: string
}
