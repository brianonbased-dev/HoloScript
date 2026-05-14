import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'device-lab': 'src/device-lab/cli.ts',
    'evidence-envelope': 'src/evidence-envelope/cli.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
});
