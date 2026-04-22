import type { HookEvent, HookSupportedHost } from '@forge-core/types'
import { SkillRegistry } from './skill-registry.js'

interface HookContext {
  command?: string
  host?: HookSupportedHost
}

interface HookEffects {
  messages: string[]
  references: string[]
  blockingReason: string | null
  hostAnnotations: string[]
}

export class HookEngine {
  constructor(private readonly registry: SkillRegistry) {}

  evaluate(event: HookEvent, context: HookContext = {}): HookEffects {
    const effects: HookEffects = {
      messages: [],
      references: [],
      blockingReason: null,
      hostAnnotations: [],
    }

    for (const hook of this.registry.listHooks()) {
      if (hook.event !== event) continue
      if (context.host && hook.host_support.length > 0 && !hook.host_support.includes(context.host)) {
        continue
      }

      switch (hook.action) {
        case 'inject_message':
          if (hook.message) effects.messages.push(hook.message)
          break
        case 'attach_reference':
          if (hook.reference_path) effects.references.push(hook.reference_path)
          break
        case 'block':
          effects.blockingReason = hook.message ?? 'Blocked by hook'
          break
        case 'annotate_host_artifact':
          if (hook.message) effects.hostAnnotations.push(hook.message)
          break
      }
    }

    return effects
  }
}
