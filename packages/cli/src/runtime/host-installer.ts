import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { install as installClaudeCodeHost } from '@forge-core/adapter-claude-code'
import { install as installOpenCodeHost } from '@forge-core/adapter-opencode'
import { install as installCodexHost } from '@forge-core/adapter-codex'

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
  ],
  opencode: [
    'opencode.config.json',
  ],
}

export async function installHost(host: ForgeHost, targetDir: string): Promise<InstallResult> {
  switch (host) {
    case 'codex':
      await installCodexHost(targetDir)
      break
    case 'claude-code':
      await installClaudeCodeHost(targetDir)
      break
    case 'opencode':
      await installOpenCodeHost(targetDir)
      break
  }

  return {
    host,
    targetDir,
    files: HOST_FILES[host],
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
