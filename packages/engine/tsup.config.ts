import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/rendering/index.ts',
    'src/physics/index.ts',
    'src/runtime/index.ts',
    'src/audio/index.ts',
    'src/animation/index.ts',
    'src/navigation/index.ts',
    'src/camera/index.ts',
    'src/input/index.ts',
    'src/vr/index.ts',
    'src/procedural/index.ts',
    'src/tilemap/index.ts',
    'src/terrain/index.ts',
    'src/particles/index.ts',
    'src/character/index.ts',
    'src/gameplay/index.ts',
    'src/dialogue/index.ts',
    'src/combat/index.ts',
    'src/orbital/index.ts',
    'src/world/index.ts',
    'src/environment/index.ts',
    'src/scene/index.ts',
    'src/ecs/index.ts',
    'src/hologram/index.ts',
    'src/vm/index.ts',
    'src/vm-bridge/index.ts',
    'src/simulation/index.ts',
    'src/spatial/index.ts',
    'src/choreography/index.ts',
    'src/gpu/index.ts',
    'src/postfx/index.ts',
    'src/shader/index.ts',
    'src/runtime/protocols/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: false, // Temporarily disabled: tsup DTS worker OOM on engine graph
  esbuildPlugins: [
    {
      name: 'wgsl-raw-loader',
      setup(build) {
        // Strip ?raw suffix from .wgsl imports (Vite convention)
        build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path.replace('?raw', '')),
          namespace: 'wgsl-raw',
        }));
        // Load .wgsl files as text strings
        build.onLoad({ filter: /\.wgsl$/, namespace: 'wgsl-raw' }, (args) => {
          const text = readFileSync(args.path, 'utf8');
          return { contents: `export default ${JSON.stringify(text)};`, loader: 'js' };
        });
      },
    },
  ],
  external: [
    'three',
    '@holoscript/core',
    '@holoscript/framework',
    '@holoscript/core-types',
    'react',
    'react-dom',
  ],
  target: 'esnext',
});
