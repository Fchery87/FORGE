import { describe, it, expect } from 'vitest'
import { REVIEW_CHECKLISTS, DEFAULT_CONFIG } from '../src/index.js'
import { renderContextPack } from '../../cli/src/runtime/context-pack.js'
import type {
  ContextPack,
  ContextBudget,
  Digest,
  ReviewArtifact,
  ForgeConfig,
  Snapshot,
  SkillManifest,
  PersonaManifest,
  HookDefinition,
} from '../src/index.js'

describe('REVIEW_CHECKLISTS', () => {
  it('has entries for all four review types', () => {
    expect(REVIEW_CHECKLISTS.architecture.length).toBeGreaterThan(0)
    expect(REVIEW_CHECKLISTS.implementation.length).toBeGreaterThan(0)
    expect(REVIEW_CHECKLISTS.qa.length).toBeGreaterThan(0)
    expect(REVIEW_CHECKLISTS.ship.length).toBeGreaterThan(0)
  })

  it('ship checklist includes task completion check', () => {
    expect(REVIEW_CHECKLISTS.ship.some(item =>
      item.toLowerCase().includes('done')
    )).toBe(true)
  })
})

describe('DEFAULT_CONFIG', () => {
  it('has correct default executor', () => {
    expect(DEFAULT_CONFIG.adapter.executor).toBe('claude-code')
  })

  it('has correct default context budget', () => {
    expect(DEFAULT_CONFIG.context.budget_warning_threshold).toBe(80000)
    expect(DEFAULT_CONFIG.context.context_window_estimate).toBe(128000)
  })

  it('has zeroed ID counters', () => {
    const ids = DEFAULT_CONFIG.ids
    expect(ids.task_counter).toBe(0)
    expect(ids.decision_counter).toBe(0)
    expect(ids.review_counter).toBe(0)
    expect(ids.qa_counter).toBe(0)
    expect(ids.snapshot_counter).toBe(0)
  })

  it('enables the native skills subsystem by default', () => {
    expect(DEFAULT_CONFIG.skills.enabled).toBe(true)
    expect(DEFAULT_CONFIG.skills.auto_activate).toBe(true)
    expect(DEFAULT_CONFIG.skills.search_paths.length).toBeGreaterThan(0)
  })

  it('includes persona and hook defaults', () => {
    expect(DEFAULT_CONFIG.personas.enabled).toBe(true)
    expect(DEFAULT_CONFIG.personas.default_for_review).toBeNull()
    expect(DEFAULT_CONFIG.hooks.enabled).toBe(true)
    expect(DEFAULT_CONFIG.hooks.fail_on_error).toBe(false)
  })
})

describe('ContextPack shape', () => {
  it('full ContextPack is valid', () => {
    const pack: ContextPack = {
      pack_id: 'PACK-001',
      generated_at: '2026-04-05T00:00:00Z',
      target_role: 'builder',
      target_task: 'TASK-001',
      estimated_tokens: 5000,
      sections: {
        objective: 'Implement the feature',
        task: null,
        constraints: ['No external deps'],
        relevant_decisions: [],
        relevant_files: ['src/feature.ts'],
        recent_changes: [],
        open_issues: [],
        state_digest: 'Phase 1, 0/5 tasks done',
        active_skills: [],
        skill_references: [],
        persona_overlay: null,
        verification_gates: [],
      },
    }
    expect(pack.target_role).toBe('builder')
    expect(pack.sections.task).toBeNull()
  })

  it('rendered context pack includes active skills and persona sections', () => {
    const pack: ContextPack = {
      pack_id: 'PACK-002',
      generated_at: '2026-04-05T00:00:00Z',
      target_role: 'executive',
      target_task: null,
      estimated_tokens: 3000,
      sections: {
        objective: 'Review the task',
        task: null,
        constraints: [],
        relevant_decisions: [],
        relevant_files: [],
        recent_changes: [],
        open_issues: [],
        state_digest: 'Reviewing',
        active_skills: [
          {
            skill_name: 'code-review-and-quality',
            reason: 'Activated for review',
            instructions: 'Review findings first.',
            references: [],
          },
        ],
        skill_references: ['references/review-checklist.md'],
        persona_overlay: {
          name: 'code-reviewer',
          role: 'executive',
          recommended_for: ['review'],
          prompt_overlay: 'Be direct.',
        },
        verification_gates: ['Approved review artifact'],
      },
    }

    const rendered = renderContextPack(pack)
    expect(rendered).toContain('## Active Skills')
    expect(rendered).toContain('code-review-and-quality')
    expect(rendered).toContain('## Persona Overlay')
    expect(rendered).toContain('Approved review artifact')
  })
})

describe('Skill, persona, and hook shapes', () => {
  it('SkillManifest shape is valid', () => {
    const manifest: SkillManifest = {
      name: 'spec-driven-development',
      description: 'Define the feature before implementation.',
      version: '1.0.0',
      phases: ['planning'],
      triggers: [
        { type: 'command', value: 'plan' },
        { type: 'phase', value: 'planning' },
      ],
      requires: [],
      verification: ['Spec reviewed with the user'],
      assets: [
        { kind: 'instruction', path: 'skills/spec-driven-development.md', required: true },
      ],
    }

    expect(manifest.phases).toContain('planning')
    expect(manifest.assets[0]?.required).toBe(true)
  })

  it('PersonaManifest shape is valid', () => {
    const persona: PersonaManifest = {
      name: 'code-reviewer',
      role: 'executive',
      recommended_for: ['review'],
      prompt_overlay: 'Review findings first and be strict about regressions.',
    }

    expect(persona.recommended_for).toContain('review')
  })

  it('HookDefinition shape is valid', () => {
    const hook: HookDefinition = {
      event: 'before_execute',
      scope: 'command',
      action: 'inject_message',
      host_support: ['codex', 'claude-code'],
      failure_policy: 'warn',
      message: 'Use the active skill set.',
    }

    expect(hook.action).toBe('inject_message')
    expect(hook.host_support).toContain('codex')
  })
})

describe('ReviewArtifact shape', () => {
  it('full ReviewArtifact is valid', () => {
    const review: ReviewArtifact = {
      review_id: 'REV-001',
      type: 'implementation',
      task_ids: ['TASK-001'],
      reviewer_role: 'executive',
      verdict: 'approved',
      checklist: [{ item: 'Tests pass', passed: true, note: null }],
      findings: [],
      required_actions: [],
      created_at: '2026-04-05T00:00:00Z',
    }
    expect(review.verdict).toBe('approved')
  })
})
