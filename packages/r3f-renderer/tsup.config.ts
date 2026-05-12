import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'hooks/useWebcamGaze': 'src/hooks/useWebcamGaze.ts',
  },
  format: ['esm'],
  dts: false, // DTS via tsc separately — tsup DTS worker can't resolve R3F JSX augmentations
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: [
    'react',
    'react-dom',
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@react-three/postprocessing',
    '@react-three/rapier',
  ],
});
