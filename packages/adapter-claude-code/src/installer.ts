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

const CLAUDE_COMMANDS: Record<string, string> = {
  'forge-execute.md': `Read the active Forge context pack in \`.forge/runtime/\` and implement the task exactly as written.
Run the relevant tests and emit a structured JSON result as the final line.`,
  'forge-review.md': `Review the active Forge task using \`.forge/views/STATUS.md\` and the task JSON in \`.forge/tasks/\`.
List findings first, then provide an approval or rejection summary.`,
  'forge-qa.md': `Run the configured QA workflow for the active Forge task and summarize evidence, failures, and follow-up work.`,
}

export async function install(targetDir: string): Promise<void> {
  const claudeDir = join(targetDir, '.claude')
  const commandsDir = join(claudeDir, 'commands')
  await mkdir(commandsDir, { recursive: true })

  const claudeMdPath = join(claudeDir, 'CLAUDE.md')
  await Promise.all([
    writeFile(claudeMdPath, CLAUDE_MD_CONTENT, 'utf8'),
    ...Object.entries(CLAUDE_COMMANDS).map(([fileName, content]) =>
      writeFile(join(commandsDir, fileName), content, 'utf8'),
    ),
  ])

  console.log(`[forge] Installed Forge Builder contract to ${claudeMdPath}`)
}
