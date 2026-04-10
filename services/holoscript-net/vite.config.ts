import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      external: [
        '@aztec/bb.js',
        'puppeteer-core',
        'ioredis',
        'jsonwebtoken',
        'jws',
        'cosmiconfig',
        'crypto',
        'fs',
        'fs/promises',
        'path',
        'zlib',
        'net',
        'tls',
        'dns',
        'stream',
        'os',
        'buffer',
        'punycode',
        'url',
        'child_process',
        'readline',
        'http',
        'https'
      ],
    },
  },
});
