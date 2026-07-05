import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/http-server.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Disable for now - types need work
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  external: ['@holoscript/core'],
  // See tsup.config.ts: give the ESM bundle a real require via createRequire so
  // bundled CommonJS deps' internal require() calls don't hit the throwing
  // __require shim ("Dynamic require of X is not supported").
  esbuildOptions(options, context) {
    if (context.format === 'esm') {
      options.banner = {
        js: "import { createRequire as __hsCreateRequire } from 'module'; const require = __hsCreateRequire(import.meta.url);",
      };
    }
  },
});
