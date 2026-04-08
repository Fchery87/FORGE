import type { VerificationType } from './verifier.js'

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
  ids: {
    task_counter: 0,
    decision_counter: 0,
    review_counter: 0,
    qa_counter: 0,
    snapshot_counter: 0,
  },
}
