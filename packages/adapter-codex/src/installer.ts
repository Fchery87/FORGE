import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DEFAULT_CODEX_COMMANDS: Record<string, string> = {
  'forge-execute.md': `Read \`.forge/views/STATUS.md\` and the latest context pack in \`.forge/runtime/\`.
Implement the assigned Forge task, run relevant verification, and leave a structured JSON result as the final line.`,
  'forge-review.md': `Review the active Forge task in \`.forge/tasks/\` using the project state in \`.forge/views/STATUS.md\`.
Return findings first, then a concise approval or rejection summary.`,
  'forge-qa.md': `Run the configured Forge QA workflow against the active task or plan in \`.forge/qa/\`.
Summarize pass/fail status, evidence, and follow-up actions.`,
}

const DEFAULT_AGENTS_CONTENT = `# Forge Host Integration

This repository uses Forge as a host-native workflow layer.

- Read Forge state from \`.forge/views/\`
- Use command prompts from \`.codex/commands/\`
- Write implementation results as structured JSON when a Forge command requires it
`

export interface CodexInstallContent {
  agentsContent?: string
  commands?: Record<string, string>
}

export async function install(targetDir: string, content: CodexInstallContent = {}): Promise<void> {
  const codexDir = join(targetDir, '.codex')
  const commandsDir = join(codexDir, 'commands')
  await mkdir(commandsDir, { recursive: true })

  await Promise.all(
    Object.entries(content.commands ?? DEFAULT_CODEX_COMMANDS).map(([fileName, body]) =>
      writeFile(join(commandsDir, fileName), body, 'utf8'),
    ),
  )

  await writeFile(join(codexDir, 'AGENTS.md'), content.agentsContent ?? DEFAULT_AGENTS_CONTENT, 'utf8')

  console.log(`[forge] Installed Codex host integration to ${codexDir}`)
}
