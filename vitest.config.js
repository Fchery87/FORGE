import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        projects: [
            'packages/types',
            'packages/core',
            'packages/cli',
            'packages/verifier-test-runner',
        ],
    },
});
//# sourceMappingURL=vitest.config.js.map