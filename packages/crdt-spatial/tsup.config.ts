import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/bridge-entry.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: ['loro-crdt', '@holoscript/framework', '@holoscript/framework/economy', 'react', 'react-dom'],
  target: 'esnext',
  clean: true,
});
