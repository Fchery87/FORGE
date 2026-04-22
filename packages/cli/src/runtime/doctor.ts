import { spawnSync } from 'node:child_process'
import type { ForgeConfig } from '@forge-core/types'
import { SkillRegistry } from '@forge-core/core'
import type { ForgeHost } from './host-installer.js'
import { inspectHost } from './host-installer.js'
import { resolveSearchPathsWithinProject } from './trust-boundaries.js'

export interface DoctorReport {
  host: Awaited<ReturnType<typeof inspectHost>>
  executorBinary: {
    command: string
    available: boolean
  }
  skills: {
    count: number
    personas: number
    hooks: number
  }
}

const EXECUTOR_BINARIES: Record<string, string> = {
  codex: 'codex',
  'claude-code': 'claude',
  opencode: 'opencode',
}

export async function runDoctor(targetDir: string, config: ForgeConfig): Promise<DoctorReport> {
  const hostName = (config.host.type || config.adapter.executor) as ForgeHost
  const command = EXECUTOR_BINARIES[config.adapter.executor] ?? config.adapter.executor
  const host = await inspectHost(hostName, targetDir)
  const registry = new SkillRegistry()
  await registry.load(resolveSearchPathsWithinProject(targetDir, config.skills.search_paths))

  const probe = spawnSync('which', [command], {
    stdio: 'ignore',
  })

  return {
    host,
    executorBinary: {
      command,
      available: probe.status === 0,
    },
    skills: {
      count: registry.listSkills().length,
      personas: registry.listPersonas().length,
      hooks: registry.listHooks().length,
    },
  }
}
