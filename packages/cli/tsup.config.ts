import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/forge': 'bin/forge.ts',
  },
  format: ['esm'],
  dts: {
    resolve: true,
    compilerOptions: {
      composite: false,
    },
  },
  tsconfig: 'tsconfig.build.json',
  clean: true,
  splitting: false,
  target: 'node18',
  external: [
    '@forge-core/types',
    '@forge-core/core',
    '@forge-core/cli',
    '@forge-core/adapter-claude-code',
    '@forge-core/adapter-opencode',
    '@forge-core/verifier-test-runner',
    '@forge-core/verifier-playwright',
  ],
})
