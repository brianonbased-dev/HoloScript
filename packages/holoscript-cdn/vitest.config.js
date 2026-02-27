import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        name: 'holoscript-cdn',
        environment: 'jsdom',
        globals: true,
    },
});
