import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        name: 'comparative-benchmarks',
        globals: true,
        environment: 'node',
    },
});
