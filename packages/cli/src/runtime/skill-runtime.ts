import type { ForgeConfig } from '@forge-core/types'
import { HookEngine, SkillRegistry, SkillResolver } from '@forge-core/core'
import { resolveSearchPathsWithinProject } from './trust-boundaries.js'

export async function resolveSkillRuntime(
  projectDir: string,
  config: ForgeConfig,
  command: 'execute' | 'review' | 'qa' | 'ship',
  role: 'builder' | 'executive',
  projectPhase: string,
): Promise<{
  skills: ReturnType<SkillResolver['resolveForCommand']>['skills']
  persona: ReturnType<SkillResolver['resolveForCommand']>['persona']
  evidenceRequirements: string[]
  hookMessages: string[]
  blockingReason: string | null
}> {
  const registry = new SkillRegistry()
  await registry.load(resolveSearchPathsWithinProject(projectDir, config.skills.search_paths))
  const resolver = new SkillResolver(registry)
  const hookEngine = new HookEngine(registry)

  const resolved = resolver.resolveForCommand({
    command,
    role,
    projectPhase,
    config,
  })

  const beforeContextPack = hookEngine.evaluate('before_context_pack', {
    command,
    host: config.host.type as 'codex' | 'claude-code' | 'opencode',
  })

  const commandEvent = ({
    execute: 'before_execute',
    review: 'before_review',
    qa: 'before_qa',
    ship: 'before_ship',
  } as const)[command]

  const phaseHook = hookEngine.evaluate(commandEvent, {
    command,
    host: config.host.type as 'codex' | 'claude-code' | 'opencode',
  })

  return {
    skills: resolved.skills,
    persona: resolved.persona,
    evidenceRequirements: [
      ...resolved.evidence_requirements,
      ...beforeContextPack.messages,
      ...phaseHook.messages,
    ],
    hookMessages: [...beforeContextPack.messages, ...phaseHook.messages],
    blockingReason: beforeContextPack.blockingReason ?? phaseHook.blockingReason,
  }
}
