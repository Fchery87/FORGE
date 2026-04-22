import type { Command } from 'commander'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_CONFIG } from '@forge-core/types'
import { SkillRegistry, StateManager } from '@forge-core/core'
import kleur from 'kleur'
import * as ui from '../ui/format.js'
import { resolveForgeDir } from '../utils/cli-args.js'
import { resolveSearchPathsWithinProject } from '../runtime/trust-boundaries.js'
import { CliNotFoundError } from '../errors.js'
import { runCommand } from '../command-runner.js'

export function register(program: Command): void {
  const command = program.command('skills').description('Inspect Forge skills and personas')

  command
    .command('list')
    .description('List all discovered skills')
    .action(runCommand(async (_options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)
      const projectDir = existsSync(forgeDir) ? dirname(forgeDir) : process.cwd()
      const config = existsSync(forgeDir)
        ? await new StateManager(forgeDir).getConfig()
        : DEFAULT_CONFIG

      const registry = new SkillRegistry()
      await registry.load(resolveSearchPathsWithinProject(projectDir, config.skills.search_paths))

      const skills = registry.listSkills().map((entry) => ({
        name: entry.manifest.name,
        source: entry.source,
        description: entry.manifest.description,
      }))

      if (opts.json) {
        process.stdout.write(JSON.stringify({ skills }, null, 2) + '\n')
        return
      }

      ui.header('Skills')

      for (const skill of skills) {
        const name = kleur.bold(skill.name)
        const source = kleur.dim(`[${skill.source}]`)
        process.stdout.write(`  ${name} ${source}\n`)
        process.stdout.write(`    ${kleur.dim(skill.description)}\n`)
      }

      ui.footer()
    }))

  command
    .command('explain')
    .description('Show manifest details for a skill')
    .argument('<name>', 'Skill name')
    .action(runCommand(async (name: string, _options, cmd) => {
      const opts = cmd.optsWithGlobals()
      const forgeDir = resolveForgeDir(opts.forgeDir)
      const projectDir = existsSync(forgeDir) ? dirname(forgeDir) : process.cwd()
      const config = existsSync(forgeDir)
        ? await new StateManager(forgeDir).getConfig()
        : DEFAULT_CONFIG

      const registry = new SkillRegistry()
      await registry.load(resolveSearchPathsWithinProject(projectDir, config.skills.search_paths))
      const skill = registry.getSkill(name)
      if (!skill) {
        throw new CliNotFoundError(`Unknown skill: ${name}`)
      }

      if (opts.json) {
        process.stdout.write(JSON.stringify(skill, null, 2) + '\n')
        return
      }

      ui.header('Skills')

      const labelWidth = 14
      const kvLine = (label: string, value: string) =>
        `${kleur.dim(label.padEnd(labelWidth))} ${value}`

      const lines: string[] = [
        kvLine('Name', skill.manifest.name),
        kvLine('Source', skill.source),
        kvLine('Description', skill.manifest.description),
        kvLine('Phases', skill.manifest.phases.join(', ')),
        kvLine('Triggers', skill.manifest.triggers.map((t) => `${t.type}:${t.value}`).join(', ')),
        kvLine('Verification', skill.manifest.verification.join('; ') || 'None'),
      ]

      ui.panel(lines, { title: skill.manifest.name })
      ui.footer()
    }))
}
