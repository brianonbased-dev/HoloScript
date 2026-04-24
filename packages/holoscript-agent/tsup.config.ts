import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/runner.ts',
    'src/brain.ts',
    'src/cost-guard.ts',
    'src/identity.ts',
    'src/holomesh-client.ts',
    'src/commit-hook.ts',
    'src/ablation.ts',
    'src/types.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node18',
});
