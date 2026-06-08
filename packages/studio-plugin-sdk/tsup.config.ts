import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/sandbox/index.ts',
    'src/sandbox/PluginGuestSDK.ts',
    'src/sandbox/types.ts',
    'src/templates/index.ts',
    'src/responsive/index.ts',
    'src/types.ts',
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
});
