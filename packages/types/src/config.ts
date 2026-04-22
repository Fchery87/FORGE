import { z } from 'zod'
import type { VerificationType } from './verifier.js'
import { verificationTypeSchema } from './verifier.js'

export interface VerifierConfigEntry {
  name: string
  package: string | null
  options: Record<string, unknown>
}

export interface ForgeConfig {
  project: {
    name: string
    description: string
    goals: string[]
  }
  host: {
    type: string
    install_path: string | null
  }
  runtime: {
    mode: 'host-native' | 'subprocess'
  }
  adapter: {
    executor: string
    executor_options: Record<string, unknown>
  }
  verification: {
    verifiers: VerifierConfigEntry[]
    default_strategy: VerificationType[]
  }
  context: {
    budget_warning_threshold: number
    context_window_estimate: number
    auto_digest_on_merge: boolean
  }
  testing: {
    test_command: string
    test_pattern: string
    coverage_command: string | null
  }
  review: {
    require_architecture_review: boolean
    require_qa_before_ship: boolean
    auto_review_on_merge: boolean
  }
  skills: {
    enabled: boolean
    search_paths: string[]
    auto_activate: boolean
    phase_defaults: Record<string, string[]>
    builtins: string[]
  }
  personas: {
    enabled: boolean
    default_for_review: string | null
  }
  hooks: {
    enabled: boolean
    fail_on_error: boolean
  }
  ids: {
    task_counter: number
    decision_counter: number
    review_counter: number
    qa_counter: number
    snapshot_counter: number
  }
}

export const DEFAULT_CONFIG: ForgeConfig = {
  project: {
    name: '',
    description: '',
    goals: [],
  },
  host: {
    type: 'claude-code',
    install_path: null,
  },
  runtime: {
    mode: 'host-native',
  },
  adapter: {
    executor: 'claude-code',
    executor_options: {},
  },
  verification: {
    verifiers: [{ name: 'test-runner', package: null, options: {} }],
    default_strategy: ['unit'],
  },
  context: {
    budget_warning_threshold: 80000,
    context_window_estimate: 128000,
    auto_digest_on_merge: true,
  },
  testing: {
    test_command: 'npm test',
    test_pattern: '**/*.test.ts',
    coverage_command: null,
  },
  review: {
    require_architecture_review: true,
    require_qa_before_ship: true,
    auto_review_on_merge: false,
  },
  skills: {
    enabled: true,
    search_paths: ['.forge/skills'],
    auto_activate: true,
    phase_defaults: {
      planning: ['using-forge-skills', 'spec-driven-development', 'planning-and-task-breakdown'],
      executing: ['incremental-implementation', 'test-driven-development'],
      reviewing: ['code-review-and-quality'],
      shipping: ['shipping-and-launch'],
    },
    builtins: [
      'using-forge-skills',
      'spec-driven-development',
      'planning-and-task-breakdown',
      'incremental-implementation',
      'test-driven-development',
      'debugging-and-error-recovery',
      'code-review-and-quality',
      'documentation-and-adrs',
      'shipping-and-launch',
    ],
  },
  personas: {
    enabled: true,
    default_for_review: null,
  },
  hooks: {
    enabled: true,
    fail_on_error: false,
  },
  ids: {
    task_counter: 0,
    decision_counter: 0,
    review_counter: 0,
    qa_counter: 0,
    snapshot_counter: 0,
  },
}

// --- Runtime schemas ---

export const verifierConfigEntrySchema = z.object({
  name: z.string(),
  package: z.string().nullable(),
  options: z.record(z.string(), z.unknown()),
})

export const forgeConfigSchema = z.object({
  project: z.object({
    name: z.string(),
    description: z.string(),
    goals: z.array(z.string()),
  }),
  host: z.object({
    type: z.string(),
    install_path: z.string().nullable(),
  }),
  runtime: z.object({
    mode: z.enum(['host-native', 'subprocess']),
  }),
  adapter: z.object({
    executor: z.string(),
    executor_options: z.record(z.string(), z.unknown()),
  }),
  verification: z.object({
    verifiers: z.array(verifierConfigEntrySchema),
    default_strategy: z.array(verificationTypeSchema),
  }),
  context: z.object({
    budget_warning_threshold: z.number(),
    context_window_estimate: z.number(),
    auto_digest_on_merge: z.boolean(),
  }),
  testing: z.object({
    test_command: z.string(),
    test_pattern: z.string(),
    coverage_command: z.string().nullable(),
  }),
  review: z.object({
    require_architecture_review: z.boolean(),
    require_qa_before_ship: z.boolean(),
    auto_review_on_merge: z.boolean(),
  }),
  skills: z.object({
    enabled: z.boolean(),
    search_paths: z.array(z.string()),
    auto_activate: z.boolean(),
    phase_defaults: z.record(z.string(), z.array(z.string())),
    builtins: z.array(z.string()),
  }),
  personas: z.object({
    enabled: z.boolean(),
    default_for_review: z.string().nullable(),
  }),
  hooks: z.object({
    enabled: z.boolean(),
    fail_on_error: z.boolean(),
  }),
  ids: z.object({
    task_counter: z.number(),
    decision_counter: z.number(),
    review_counter: z.number(),
    qa_counter: z.number(),
    snapshot_counter: z.number(),
  }),
})
