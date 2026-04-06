import { defineConfig } from 'tsup';
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