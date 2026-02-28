import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        name: 'security-sandbox',
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
        },
    },
});
