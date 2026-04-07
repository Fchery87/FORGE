import { join } from 'node:path'
import type {
  ContextPack,
  ContextBudget,
  Digest,
  DigestType,
  Snapshot,
  SnapshotData,
  OwnerRole,
} from '@forge-agent/types'
import type { StateManager } from './state-manager.js'
import type { IdGenerator } from './id-generator.js'

export class ContextEngine {
  constructor(
    private readonly stateManager: StateManager,
    private readonly idGenerator: IdGenerator,
    private readonly forgeDir: string,
  ) {}

  // --- Context pack generation ---

  async generateContextPack(role: OwnerRole, taskId?: string): Promise<ContextPack> {
    const [project, execution, architecture, allTasks, allDecisions] = await Promise.all([
      this.stateManager.getProject(),
      this.stateManager.getExecution(),
      this.stateManager.getArchitecture(),
      this.stateManager.listTasks(),
      this.stateManager.listDecisions(),
    ])

    const task = taskId ? allTasks.find(t => t.task_id === taskId) ?? null : null

    // Only include decisions relevant to this task's phase/files
    const relevantDecisions = taskId && task
      ? allDecisions.filter(d => d.status === 'accepted')
      : allDecisions.filter(d => d.status === 'accepted').slice(0, 5)

    // Files in scope from the task, or empty for non-task packs
    const relevantFiles = task?.files_in_scope ?? []

    // Recent actions from context state
    const contextState = await this.stateManager.getContext()
    const recentChanges = contextState.recent_actions.slice(-10)

    // Open issues: blocked tasks, open questions
    const blockedTasks = allTasks
      .filter(t => t.status === 'blocked')
      .map(t => `Blocked: ${t.task_id} — ${t.title}`)
    const openQuestions = architecture.open_questions.map(q => `Open: ${q}`)
    const openIssues = [...blockedTasks, ...openQuestions].slice(0, 5)

    const stateDigest = this.buildStateDigest(project, execution)

    const objective = task
      ? `Implement task ${task.task_id}: ${task.title}`
      : `${role} mode — project: ${project.name}, phase: ${project.current_phase}`

    const constraints = task?.constraints ?? []

    const pack: ContextPack = {
      pack_id: `pack-${Date.now()}`,
      generated_at: new Date().toISOString(),
      target_role: role,
      target_task: taskId ?? null,
      estimated_tokens: 0,
      sections: {
        objective,
        task,
        constraints,
        relevant_decisions: relevantDecisions,
        relevant_files: relevantFiles,
        recent_changes: recentChanges,
        open_issues: openIssues,
        state_digest: stateDigest,
      },
    }

    pack.estimated_tokens = this.estimateTokens(pack)

    // Update session token usage
    await this.stateManager.updateContext({
      estimated_tokens_used: contextState.estimated_tokens_used + pack.estimated_tokens,
    })

    return pack
  }

  // --- Token estimation ---

  estimateTokens(pack: ContextPack): number {
    const content = JSON.stringify(pack.sections)
    return Math.ceil(content.length / 4)
  }

  // --- Budget checking ---

  async checkBudget(): Promise<ContextBudget> {
    const ctx = await this.stateManager.getContext()
    const warningActive = ctx.estimated_tokens_used >= ctx.budget_warning_threshold
    const recommendation = warningActive
      ? 'Context budget exceeded. Run `forge snapshot` and start a fresh session.'
      : null

    return {
      estimated_tokens_used: ctx.estimated_tokens_used,
      context_window_estimate: ctx.context_window_estimate,
      budget_warning_threshold: ctx.budget_warning_threshold,
      warning_active: warningActive,
      recommendation,
    }
  }

  // --- Digest generation ---

  async generateDigest(type: DigestType): Promise<Digest> {
    let content: string

    switch (type) {
      case 'state':
        content = await this.buildFullStateDigest()
        break
      case 'decision':
        content = await this.buildDecisionDigest()
        break
      case 'changes':
        content = await this.buildChangesDigest()
        break
      case 'next_step':
        content = await this.buildNextStepDigest()
        break
    }

    return {
      type,
      content,
      generated_at: new Date().toISOString(),
    }
  }

  // --- Snapshot management ---

  async generateSnapshot(label?: string): Promise<Snapshot> {
    const snapshotId = await this.idGenerator.next('SNAP')

    const [project, architecture, execution, context, allTasks, allDecisions] = await Promise.all([
      this.stateManager.getProject(),
      this.stateManager.getArchitecture(),
      this.stateManager.getExecution(),
      this.stateManager.getContext(),
      this.stateManager.listTasks(),
      this.stateManager.listDecisions(),
    ])

    const taskIndex: Record<string, unknown> = {}
    for (const task of allTasks) {
      taskIndex[task.task_id] = task
    }

    const decisionIndex: Record<string, unknown> = {}
    for (const decision of allDecisions) {
      decisionIndex[decision.decision_id] = decision
    }

    const data: SnapshotData = {
      project,
      architecture,
      execution,
      context,
      task_index: taskIndex,
      decision_index: decisionIndex,
    }

    const snapshot: Snapshot = {
      snapshot_id: snapshotId,
      label: label ?? null,
      created_at: new Date().toISOString(),
      data,
    }

    await this.stateManager.writeRaw(
      join('snapshots', `${snapshotId}.json`),
      JSON.stringify(snapshot, null, 2)
    )

    // Update context with snapshot reference
    await this.stateManager.updateContext({ last_snapshot: snapshotId })

    return snapshot
  }

  async restoreSnapshot(snapshotId: string): Promise<{ snapshot: Snapshot; briefing: string }> {
    const raw = await this.stateManager.readRaw(join('snapshots', `${snapshotId}.json`))
    if (!raw) throw new Error(`Snapshot ${snapshotId} not found`)

    const snapshot = JSON.parse(raw) as Snapshot
    const { data } = snapshot

    // Restore all state from snapshot
    await Promise.all([
      this.stateManager.updateProject(data.project as Parameters<StateManager['updateProject']>[0]),
      this.stateManager.updateArchitecture(data.architecture as Parameters<StateManager['updateArchitecture']>[0]),
      this.stateManager.updateExecution(data.execution as Parameters<StateManager['updateExecution']>[0]),
      this.stateManager.updateContext(data.context as Parameters<StateManager['updateContext']>[0]),
    ])

    // Restore tasks
    for (const task of Object.values(data.task_index)) {
      await this.stateManager.saveTask(task as Parameters<StateManager['saveTask']>[0])
    }

    // Restore decisions
    for (const decision of Object.values(data.decision_index)) {
      await this.stateManager.saveDecision(decision as Parameters<StateManager['saveDecision']>[0])
    }

    const briefing = await this.buildNextStepDigest()

    return { snapshot, briefing }
  }

  // --- Markdown view generation ---

  async generateViews(): Promise<void> {
    const [project, execution, allTasks, ctx] = await Promise.all([
      this.stateManager.getProject(),
      this.stateManager.getExecution(),
      this.stateManager.listTasks(),
      this.stateManager.getContext(),
    ])

    await Promise.all([
      this.writeView('STATUS.md', this.renderStatusView(project, execution, ctx)),
      this.writeView('TASKS.md', this.renderTasksView(allTasks)),
      this.writeView('PLAN.md', this.renderPlanView(project, execution)),
    ])
  }

  // --- Private helpers ---

  private buildStateDigest(
    project: Awaited<ReturnType<StateManager['getProject']>>,
    execution: Awaited<ReturnType<StateManager['getExecution']>>,
  ): string {
    const pct = execution.total_tasks > 0
      ? Math.round((execution.tasks_done / execution.total_tasks) * 100)
      : 0
    return (
      `Project: ${project.name} | Status: ${project.current_status} | ` +
      `Phase: ${project.current_phase} | ` +
      `Progress: ${execution.tasks_done}/${execution.total_tasks} tasks (${pct}%)`
    )
  }

  private async buildFullStateDigest(): Promise<string> {
    const [project, execution] = await Promise.all([
      this.stateManager.getProject(),
      this.stateManager.getExecution(),
    ])
    const allTasks = await this.stateManager.listTasks()
    const blocked = allTasks.filter(t => t.status === 'blocked')
    const blocker = blocked.length > 0
      ? ` Blocked: ${blocked.map(t => t.task_id).join(', ')}.`
      : ''
    return this.buildStateDigest(project, execution) + blocker
  }

  private async buildDecisionDigest(): Promise<string> {
    const decisions = await this.stateManager.listDecisions()
    const accepted = decisions.filter(d => d.status === 'accepted')
    if (accepted.length === 0) return 'No accepted decisions yet.'
    return accepted
      .map((d, i) => `${i + 1}. [${d.decision_id}] ${d.title}: ${d.rationale}`)
      .join('\n')
  }

  private async buildChangesDigest(): Promise<string> {
    const ctx = await this.stateManager.getContext()
    if (ctx.recent_actions.length === 0) return 'No recent changes.'
    return 'Recent actions:\n' + ctx.recent_actions.slice(-10).map(a => `- ${a}`).join('\n')
  }

  private async buildNextStepDigest(): Promise<string> {
    const [project, allTasks] = await Promise.all([
      this.stateManager.getProject(),
      this.stateManager.listTasks(),
    ])

    const inProgress = allTasks.filter(t => t.status === 'in_progress')
    const ready = allTasks.filter(t => t.status === 'ready' || t.status === 'planned')
    const blocked = allTasks.filter(t => t.status === 'blocked')

    const lines: string[] = [
      `## You are here`,
      `Project: ${project.name} | Status: ${project.current_status}`,
      '',
    ]

    if (inProgress.length > 0) {
      lines.push(`### In Progress`)
      lines.push(...inProgress.map(t => `- ${t.task_id}: ${t.title}`))
      lines.push('')
    }

    if (ready.length > 0) {
      lines.push(`### Next Available`)
      lines.push(...ready.slice(0, 3).map(t => `- ${t.task_id}: ${t.title}`))
      lines.push('')
    }

    if (blocked.length > 0) {
      lines.push(`### Blocked`)
      lines.push(...blocked.map(t => `- ${t.task_id}: ${t.title}`))
      lines.push('')
    }

    if (inProgress.length === 0 && ready.length === 0) {
      lines.push('No tasks in progress. Run `forge plan` to generate tasks or `forge status` to check project state.')
    }

    return lines.join('\n')
  }

  private renderStatusView(
    project: Awaited<ReturnType<StateManager['getProject']>>,
    execution: Awaited<ReturnType<StateManager['getExecution']>>,
    ctx: Awaited<ReturnType<StateManager['getContext']>>,
  ): string {
    const pct = execution.total_tasks > 0
      ? Math.round((execution.tasks_done / execution.total_tasks) * 100)
      : 0
    const budgetPct = Math.round((ctx.estimated_tokens_used / ctx.context_window_estimate) * 100)

    return [
      `# Forge Status`,
      '',
      `**Project**: ${project.name}`,
      `**Status**: ${project.current_status}`,
      `**Phase**: ${project.current_phase || 'none'}`,
      '',
      `## Progress`,
      `${execution.tasks_done}/${execution.total_tasks} tasks complete (${pct}%)`,
      `In progress: ${execution.tasks_in_progress} | Blocked: ${execution.tasks_blocked}`,
      '',
      `## Context Health`,
      `Tokens used: ~${ctx.estimated_tokens_used.toLocaleString()} / ${ctx.context_window_estimate.toLocaleString()} (${budgetPct}%)`,
      ctx.estimated_tokens_used >= ctx.budget_warning_threshold
        ? '⚠ Budget warning active — run `forge snapshot` and start fresh session'
        : '✓ Context budget healthy',
      '',
      `_Generated: ${new Date().toISOString()}_`,
    ].join('\n')
  }

  private renderTasksView(tasks: Awaited<ReturnType<StateManager['listTasks']>>): string {
    if (tasks.length === 0) return '# Tasks\n\nNo tasks yet. Run `forge plan` to generate tasks.'

    const byStatus = tasks.reduce<Record<string, typeof tasks>>(
      (acc, t) => { (acc[t.status] ??= []).push(t); return acc },
      {}
    )

    const statusOrder = ['in_progress', 'blocked', 'in_review', 'qa_pending', 'ready', 'planned', 'draft', 'done', 'rejected']
    const lines = ['# Tasks', '']

    for (const status of statusOrder) {
      const group = byStatus[status]
      if (!group || group.length === 0) continue
      lines.push(`## ${status.replace(/_/g, ' ').toUpperCase()} (${group.length})`)
      for (const t of group) {
        lines.push(`- **${t.task_id}**: ${t.title}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  private renderPlanView(
    project: Awaited<ReturnType<StateManager['getProject']>>,
    execution: Awaited<ReturnType<StateManager['getExecution']>>,
  ): string {
    const lines = [
      `# Plan: ${project.name}`,
      '',
      `**Goals**: ${project.goals.join(', ') || 'none defined'}`,
      '',
      `## Phases`,
      '',
    ]

    if (execution.phases.length === 0) {
      lines.push('No phases defined yet.')
    } else {
      for (const phase of execution.phases) {
        lines.push(`### ${phase.name} [${phase.status}]`)
        lines.push(phase.description)
        lines.push(`Tasks: ${phase.task_ids.join(', ') || 'none'}`)
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  private async writeView(filename: string, content: string): Promise<void> {
    await this.stateManager.writeRaw(join('views', filename), content)
  }
}
