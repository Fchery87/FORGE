import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  tsconfig: 'tsconfig.build.json',
  deps: {
    neverBundle: [
      'playwright',
      '@forge-core/types',
      '@forge-core/core',
      '@forge-core/cli',
      '@forge-core/adapter-claude-code',
      '@forge-core/adapter-opencode',
      '@forge-core/verifier-test-runner',
      '@forge-core/verifier-playwright',
    ],
  },
})
