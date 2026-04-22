import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ForgeConfig,
  HookSupportedHost,
  PersonaManifest,
  SkillActivation,
} from '@forge-core/types'
import type { ForgeCommand, ForgeRole } from './orchestrator.js'
import { SkillRegistry } from './skill-registry.js'

interface ResolveCommandInput {
  command: ForgeCommand
  role: ForgeRole
  projectPhase: string
  config: ForgeConfig
}

interface ResolveCommandResult {
  skills: SkillActivation[]
  persona: PersonaManifest | null
  evidence_requirements: string[]
}

export class SkillResolver {
  constructor(private readonly registry: SkillRegistry) {}

  resolveForCommand(input: ResolveCommandInput): ResolveCommandResult {
    if (!input.config.skills.enabled) {
      return {
        skills: [],
        persona: null,
        evidence_requirements: [],
      }
    }

    const orderedNames: string[] = []
    const pushUnique = (name: string): void => {
      if (!orderedNames.includes(name)) orderedNames.push(name)
    }

    if (input.config.skills.auto_activate) {
      pushUnique('using-forge-skills')
    }

    for (const name of input.config.skills.phase_defaults[input.projectPhase] ?? []) {
      pushUnique(name)
    }

    for (const entry of this.registry.listSkills()) {
      const matches = entry.manifest.triggers.some((trigger) => {
        if (trigger.type === 'command') return trigger.value === input.command
        if (trigger.type === 'phase') return trigger.value === input.projectPhase
        return false
      })
      if (matches) pushUnique(entry.manifest.name)
    }

    const skills = orderedNames
      .map((name) => this.registry.getSkill(name))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => {
        const instructionAsset = entry.manifest.assets.find((asset) => asset.kind === 'instruction')
        const instructions = instructionAsset
          ? readFileSync(join(entry.base_path, instructionAsset.path), 'utf8')
          : entry.manifest.description

        return {
          skill_name: entry.manifest.name,
          reason: `Activated for ${input.command}/${input.projectPhase}`,
          instructions,
          references: entry.manifest.assets.filter((asset) => asset.kind === 'reference'),
        } satisfies SkillActivation
      })

    const persona = input.config.personas.enabled
      && input.command === 'review'
      && input.config.personas.default_for_review
      ? this.registry.getPersona(input.config.personas.default_for_review) ?? null
      : null

    const evidence_requirements = skills.flatMap((skill) => {
      const manifest = this.registry.getSkill(skill.skill_name)?.manifest
      return manifest?.verification ?? []
    })

    return { skills, persona, evidence_requirements }
  }
}
