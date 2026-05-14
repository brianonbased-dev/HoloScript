import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'device-lab': 'src/device-lab/cli.ts',
    'evidence-envelope': 'src/evidence-envelope/cli.ts',
    'adversarial-trajectory': 'src/adversarial-trajectory/cli.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
});
