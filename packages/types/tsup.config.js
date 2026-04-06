import { defineConfig } from 'tsup';
export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    tsconfig: 'tsconfig.build.json',
    clean: true,
    splitting: false,
    target: 'node18',
    external: [
        '@forge-agent/types',
        '@forge-agent/core',
        '@forge-agent/cli',
        '@forge-agent/adapter-claude-code',
        '@forge-agent/adapter-opencode',
        '@forge-agent/verifier-test-runner',
        '@forge-agent/verifier-playwright',
    ],
});
//# sourceMappingURL=tsup.config.js.map