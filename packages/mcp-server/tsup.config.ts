import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    'http-server': 'src/http-server.ts',
    'server-sizing': 'src/server-sizing.ts',
  },
  format: ['cjs', 'esm'],
  dts: false, // Disable for now - types need work
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  external: [
    '@holoscript/core',
    '@holoscript/crdt-spatial',
    '@holoscript/holomap',
    '@huggingface/transformers',
    'onnxruntime-node',
    'onnxruntime-web',
    'onnxruntime-common',
    'pg',
    'loro-crdt',
    'ffmpeg-static',
    'react',
    '@react-three/fiber',
    '@opentelemetry/api',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/semantic-conventions',
  ],
  define: {
    __SERVICE_VERSION__: JSON.stringify(pkg.version),
  },
  // The ESM output bundles CommonJS deps (jsonwebtoken -> jws -> safe-buffer)
  // whose internal require('buffer') / require(...) calls hit tsup's __require
  // shim, which throws "Dynamic require of X is not supported" because `require`
  // is undefined in an ES module. Injecting a real createRequire(import.meta.url)
  // at the top of the ESM bundle gives the shim a working `require` to delegate
  // to, so bundled CJS deps resolve Node built-ins and modules normally. Applied
  // to esm only; the cjs output already has a native require.
  esbuildOptions(options, context) {
    if (context.format === 'esm') {
      options.banner = {
        js: "import { createRequire as __hsCreateRequire } from 'module'; const require = __hsCreateRequire(import.meta.url);",
      };
    }
  },
});
