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
    'src/hologram/FileSystemHologramStore.ts',
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
  // Wipe dist each build. Without this, content-hashed chunks from old source accumulate
  // (83 orphaned chunks were shipping month-old data — e.g. a stale prior-art corpus whose
  // `source` field still pointed at a private-repo research path, tripping the public-consumption
  // gate: private-repo-doc-ref). Fresh source no longer emits those; clean removes the orphans.
  clean: true,
  esbuildPlugins: [
    {
      name: 'wgsl-raw-loader',
      setup(build) {
        // Strip ?raw suffix from .wgsl imports (Vite convention)
        build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => {
          const abs = resolve(args.resolveDir, args.path.replace('?raw', ''));
          // Label the virtual module with a REPO-RELATIVE path. esbuild inlines a
          // "// wgsl-raw:<path>" module-origin comment into the bundle; an ABSOLUTE path here
          // leaked the maintainer's machine path (C:\Users\josep\...\radix-sort.wgsl) into every
          // published chunk (public-consumption gate: founder-path). Keep the absolute path in
          // pluginData for the loader; the relative label is drive- and cwd-independent.
          const label = abs.replace(/\\/g, '/').replace(/^.*?\/(src\/.*)$/, '$1');
          return { path: label, namespace: 'wgsl-raw', pluginData: { abs } };
        });
        // Load .wgsl files as text strings
        build.onLoad({ filter: /\.wgsl$/, namespace: 'wgsl-raw' }, (args) => {
          const text = readFileSync(args.pluginData.abs, 'utf8');
          return { contents: `export default ${JSON.stringify(text)};`, loader: 'js' };
        });
      },
    },
  ],
  external: [
    'three',
    '@holoscript/uaal',
    '@holoscript/core',
    '@holoscript/framework',
    '@holoscript/core-types',
    '@holoscript/holoembed',
    'react',
    'react-dom',
    'puppeteer',
    'puppeteer-core',
    /^@puppeteer\//,
  ],
  target: 'esnext',
});
