import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CODEX_COMMANDS: Record<string, string> = {
  'forge-execute.md': `Read \`.forge/views/STATUS.md\` and the latest context pack in \`.forge/runtime/\`.
Implement the assigned Forge task, run relevant verification, and leave a structured JSON result as the final line.`,
  'forge-review.md': `Review the active Forge task in \`.forge/tasks/\` using the project state in \`.forge/views/STATUS.md\`.
Return findings first, then a concise approval or rejection summary.`,
  'forge-qa.md': `Run the configured Forge QA workflow against the active task or plan in \`.forge/qa/\`.
Summarize pass/fail status, evidence, and follow-up actions.`,
}

const AGENTS_CONTENT = `# Forge Host Integration

This repository uses Forge as a host-native workflow layer.

- Read Forge state from \`.forge/views/\`
- Use command prompts from \`.codex/commands/\`
- Write implementation results as structured JSON when a Forge command requires it
`

export async function install(targetDir: string): Promise<void> {
  const codexDir = join(targetDir, '.codex')
  const commandsDir = join(codexDir, 'commands')
  await mkdir(commandsDir, { recursive: true })

  await Promise.all(
    Object.entries(CODEX_COMMANDS).map(([fileName, content]) =>
      writeFile(join(commandsDir, fileName), content, 'utf8'),
    ),
  )

  await writeFile(join(codexDir, 'AGENTS.md'), AGENTS_CONTENT, 'utf8')

  console.log(`[forge] Installed Codex host integration to ${codexDir}`)
}
