import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OPENCODE_CONFIG_CONTENT = {
  forge: {
    role: 'builder',
    result_format: 'json_last_line',
  },
}

export async function install(targetDir: string): Promise<void> {
  const configPath = join(targetDir, 'opencode.config.json')
  await writeFile(configPath, JSON.stringify(OPENCODE_CONFIG_CONTENT, null, 2), 'utf8')

  console.log(`[forge] Installed OpenCode config to ${configPath}`)
}
