import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.scenario.ts'],
        globals: true,
        setupFiles: ['./src/test-setup/vitest.setup.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            // Route idb → in-memory mock that works in Node without IndexedDB
            'idb': path.resolve(__dirname, 'src/__mocks__/idb.ts'),
        },
    },
});
