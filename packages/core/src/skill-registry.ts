import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  HookDefinition,
  PersonaManifest,
  SkillManifest,
  SkillRegistryEntry,
} from '@forge-core/types'

interface PersonaRegistryEntry {
  manifest: PersonaManifest
  source: 'builtin' | 'project'
  base_path: string
}

export class SkillRegistry {
  private readonly builtinPaths: string[]
  private readonly skills = new Map<string, SkillRegistryEntry>()
  private readonly personas = new Map<string, PersonaRegistryEntry>()
  private hooks: HookDefinition[] = []

  constructor(builtinPaths: string[] = []) {
    const assetRoot = join(dirnameFromUrl(import.meta.url), '..', 'assets')
    this.builtinPaths = builtinPaths.length > 0 ? builtinPaths : [assetRoot]
  }

  async load(projectPaths: string[] = []): Promise<void> {
    this.skills.clear()
    this.personas.clear()
    this.hooks = []

    for (const basePath of this.builtinPaths) {
      await this.loadPath(basePath, 'builtin')
    }

    for (const basePath of projectPaths) {
      await this.loadPath(basePath, 'project')
    }
  }

  getSkill(name: string): SkillRegistryEntry | undefined {
    return this.skills.get(name)
  }

  listSkills(): SkillRegistryEntry[] {
    return [...this.skills.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  }

  getPersona(name: string): PersonaManifest | undefined {
    return this.personas.get(name)?.manifest
  }

  listPersonas(): PersonaManifest[] {
    return [...this.personas.values()]
      .map((entry) => entry.manifest)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  listHooks(): HookDefinition[] {
    return [...this.hooks]
  }

  private async loadPath(basePath: string, source: 'builtin' | 'project'): Promise<void> {
    await Promise.all([
      this.loadSkills(basePath, source),
      this.loadPersonas(basePath, source),
      this.loadHooks(basePath),
    ])
  }

  private async loadSkills(basePath: string, source: 'builtin' | 'project'): Promise<void> {
    const skillsDir = join(basePath, 'skills')
    if (!existsSync(skillsDir)) return

    const entries = await readdir(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillPath = join(skillsDir, entry.name)
      const manifestPath = join(skillPath, 'skill.json')
      if (!existsSync(manifestPath)) continue

      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as SkillManifest
      this.skills.set(manifest.name, {
        manifest,
        source,
        base_path: skillPath,
      })
    }
  }

  private async loadPersonas(basePath: string, source: 'builtin' | 'project'): Promise<void> {
    const personasDir = join(basePath, 'personas')
    if (!existsSync(personasDir)) return

    const entries = await readdir(personasDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const personaPath = join(personasDir, entry.name)
      const manifestPath = join(personaPath, 'persona.json')
      if (!existsSync(manifestPath)) continue

      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as PersonaManifest
      this.personas.set(manifest.name, {
        manifest,
        source,
        base_path: personaPath,
      })
    }
  }

  private async loadHooks(basePath: string): Promise<void> {
    const hooksDir = join(basePath, 'hooks')
    if (!existsSync(hooksDir)) return

    const entries = await readdir(hooksDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const hookPath = join(hooksDir, entry.name)
      const hook = JSON.parse(await readFile(hookPath, 'utf8')) as HookDefinition
      this.hooks.push(hook)
    }
  }
}

function dirnameFromUrl(moduleUrl: string): string {
  return fileURLToPath(new URL('.', moduleUrl))
}
