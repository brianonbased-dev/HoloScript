import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/three/index.ts', 'src/react/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['three', 'react', 'react-dom', '@react-three/fiber', '@react-three/xr'],
});
