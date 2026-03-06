import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__tests__/**',
        'src/index.ts',
      ],
    },
    // Mock WebGPU APIs since they aren't available in Node
    setupFiles: ['./src/__tests__/setup.ts'],
  },
  // Resolve .wgsl imports as raw text
  assetsInclude: ['**/*.wgsl'],
});
