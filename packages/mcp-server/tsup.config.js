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
});
