import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_CONFIG, type ForgeConfig } from '@forge-core/types'
import { HookEngine, SkillRegistry, SkillResolver } from '@forge-core/core'
import type { ForgeCommand, ForgeRole } from '@forge-core/core'
import { install as installClaudeCodeHost } from '@forge-core/adapter-claude-code'
import { install as installOpenCodeHost } from '@forge-core/adapter-opencode'
import { install as installCodexHost } from '@forge-core/adapter-codex'
import { resolveSearchPathsWithinProject } from './trust-boundaries.js'

export type ForgeHost = 'codex' | 'claude-code' | 'opencode'

export interface InstallResult {
  host: ForgeHost
  targetDir: string
  files: string[]
}

const HOST_FILES: Record<ForgeHost, string[]> = {
  codex: [
    '.codex/AGENTS.md',
    '.codex/commands/forge-execute.md',
    '.codex/commands/forge-review.md',
    '.codex/commands/forge-qa.md',
  ],
  'claude-code': [
    '.claude/CLAUDE.md',
    '.claude/commands/forge-execute.md',
    '.claude/commands/forge-review.md',
    '.claude/commands/forge-qa.md',
  ],
  opencode: [
    'opencode.config.json',
    '.opencode/commands/forge-execute.md',
    '.opencode/commands/forge-review.md',
    '.opencode/commands/forge-qa.md',
  ],
}

export async function installHost(
  host: ForgeHost,
  targetDir: string,
  config: ForgeConfig = DEFAULT_CONFIG,
): Promise<InstallResult> {
  const generated = await generateHostInstallContent(host, targetDir, config)

  switch (host) {
    case 'codex':
      await installCodexHost(targetDir, generated)
      break
    case 'claude-code':
      await installClaudeCodeHost(targetDir, generated)
      break
    case 'opencode':
      await installOpenCodeHost(targetDir, generated)
      break
  }

  return {
    host,
    targetDir,
    files: HOST_FILES[host],
  }
}

async function generateHostInstallContent(host: ForgeHost, targetDir: string, config: ForgeConfig): Promise<{
  agentsContent?: string
  claudeMdContent?: string
  configContent?: Record<string, unknown>
  commands: Record<string, string>
}> {
  const registry = new SkillRegistry()
  await registry.load(resolveSearchPathsWithinProject(targetDir, config.skills.search_paths))
  const resolver = new SkillResolver(registry)
  const hookEngine = new HookEngine(registry)
  const localOverrideSkills = registry.listSkills().filter((entry) => entry.source === 'project').map((entry) => entry.manifest.name)
  const localPersonas = registry.listPersonas().map((persona) => persona.name)

  const commandMap: Array<{ command: ForgeCommand; phase: string; role: ForgeRole }> = [
    { command: 'execute', phase: 'executing', role: 'builder' as const },
    { command: 'review', phase: 'reviewing', role: 'executive' as const },
    { command: 'qa', phase: 'reviewing', role: 'executive' as const },
  ]

  const commands = Object.fromEntries(commandMap.map(({ command, phase, role }) => {
    const resolved = resolver.resolveForCommand({
      command,
      role,
      projectPhase: phase,
      config,
    })
    const hookEffects = hookEngine.evaluate('host_install', { command, host })
    const body = [
      `# Forge ${command}`,
      '',
      `Forge owns workflow activation for this command.`,
      '',
      `## Active Skills`,
      ...(resolved.skills.length > 0
        ? resolved.skills.map((skill) => `- ${skill.skill_name}: ${skill.reason}`)
        : ['- None']),
      '',
      ...(resolved.persona
        ? ['## Persona', `- ${resolved.persona.name}: ${resolved.persona.prompt_overlay}`, '']
        : []),
      `## Evidence Requirements`,
      ...(resolved.evidence_requirements.length > 0
        ? resolved.evidence_requirements.map((item) => `- ${item}`)
        : ['- None']),
      '',
      ...(hookEffects.hostAnnotations.length > 0
        ? ['## Host Annotations', ...hookEffects.hostAnnotations.map((item) => `- ${item}`), '']
        : []),
      `Read Forge state from \`.forge/views/\` and task/runtime files from \`.forge/\` before acting.`,
    ].join('\n')

    return [`forge-${command}.md`, body]
  }))

  const commonHeader = [
    '# Forge Host Integration',
    '',
    'Forge generates host-facing workflow files from its native skills registry.',
    '',
    'Do not invent a separate workflow. Use the active Forge context pack and command guidance.',
    '',
    `Project-local skill paths: ${config.skills.search_paths.join(', ')}`,
    `Project-local overrides detected: ${localOverrideSkills.length > 0 ? localOverrideSkills.join(', ') : 'none'}`,
    `Project personas detected: ${localPersonas.length > 0 ? localPersonas.join(', ') : 'none'}`,
  ].join('\n')

  if (host === 'codex') {
    return {
      agentsContent: commonHeader,
      commands,
    }
  }

  if (host === 'claude-code') {
    return {
      claudeMdContent: commonHeader,
      commands,
    }
  }

  return {
    configContent: {
      forge: {
        role: 'builder',
        result_format: 'json_last_line',
        skills_enabled: config.skills.enabled,
      },
    },
    commands,
  }
}

export async function inspectHost(host: ForgeHost, targetDir: string): Promise<{
  host: ForgeHost
  installed: boolean
  files: Array<{ path: string; present: boolean }>
}> {
  const files = await Promise.all(
    HOST_FILES[host].map(async (relativePath) => {
      const path = join(targetDir, relativePath)
      try {
        await access(path, constants.F_OK)
        return { path: relativePath, present: true }
      } catch {
        return { path: relativePath, present: false }
      }
    }),
  )

  return {
    host,
    installed: files.every((file) => file.present),
    files,
  }
}
