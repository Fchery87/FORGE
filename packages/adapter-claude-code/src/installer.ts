import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CLAUDE_MD_CONTENT = `# Forge Builder Contract

You are operating as a Forge Builder agent. When dispatched a task:
1. Read the task context carefully
2. Implement exactly what is specified — no more, no less
3. Run tests and ensure they pass
4. Output your result as JSON on the last line

Result schema: {"task_id": string, "status": "completed" | "failed" | "partial", "summary": string, "files_changed": FileChange[], "tests_added": string[], "tests_run": TestRunResult[], "acceptance_criteria_status": CriterionStatus[], "issues": string[], "merge_recommendation": "merge" | "revise" | "reject"}
`

export async function install(targetDir: string): Promise<void> {
  const claudeDir = join(targetDir, '.claude')
  await mkdir(claudeDir, { recursive: true })

  const claudeMdPath = join(claudeDir, 'CLAUDE.md')
  await writeFile(claudeMdPath, CLAUDE_MD_CONTENT, 'utf8')

  console.log(`[forge] Installed Forge Builder contract to ${claudeMdPath}`)
}
