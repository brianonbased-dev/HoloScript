import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: true,
  external: [
    '@holoscript/engine',
    'onnxruntime-node',
    'playwright',
    'sharp',
    '@ffmpeg-installer/ffmpeg',
  ],
});
