import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  outDir: 'dist',
  external: [
    'express',
    'cors',
    'compression',
    'helmet',
    'jsonwebtoken',
    'pino',
    'pino-pretty',
    'uuid',
    'ajv',
    'express-rate-limit',
  ],
});
