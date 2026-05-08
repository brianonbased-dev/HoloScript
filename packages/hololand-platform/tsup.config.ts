import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'device-lab': 'src/device-lab/cli.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
});
