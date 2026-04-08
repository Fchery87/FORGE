import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OPENCODE_CONFIG_CONTENT = {
  forge: {
    role: 'builder',
    result_format: 'json_last_line',
  },
}

const OPENCODE_COMMANDS: Record<string, string> = {
  'forge-execute.md': `Use the active Forge context pack in \`.forge/runtime/\` to complete the assigned task and return a JSON result as the final line.`,
  'forge-review.md': `Review the active Forge task against the project state in \`.forge/views/STATUS.md\` and produce findings-first feedback.`,
  'forge-qa.md': `Run the configured Forge QA workflow and summarize verification results with evidence references.`,
}

export async function install(targetDir: string): Promise<void> {
  const configPath = join(targetDir, 'opencode.config.json')
  const commandsDir = join(targetDir, '.opencode', 'commands')
  await mkdir(commandsDir, { recursive: true })
  await Promise.all([
    writeFile(configPath, JSON.stringify(OPENCODE_CONFIG_CONTENT, null, 2), 'utf8'),
    ...Object.entries(OPENCODE_COMMANDS).map(([fileName, content]) =>
      writeFile(join(commandsDir, fileName), content, 'utf8'),
    ),
  ])

  console.log(`[forge] Installed OpenCode config to ${configPath}`)
}
