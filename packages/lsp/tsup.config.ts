import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/debugServer.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
});
