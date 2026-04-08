import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/types',
      'packages/core',
      'packages/cli',
      'packages/verifier-test-runner',
      'packages/adapter-codex',
      'packages/adapter-claude-code',
      'packages/adapter-opencode',
      'packages/verifier-playwright',
    ],
  },
})
