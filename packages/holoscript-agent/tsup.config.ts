import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/runner.ts',
    'src/brain.ts',
    'src/cost-guard.ts',
    'src/identity.ts',
    'src/holomesh-client.ts',
    'src/commit-hook.ts',
    'src/ablation.ts',
    'src/supervisor.ts',
    'src/supervisor-config.ts',
    'src/provision.ts',
    'src/audit-log.ts',
    'src/care-claims.ts',
    'src/mesh-character-mind.ts',
    'src/portable-mind.ts',
    'src/types.ts',
  ],
  format: ['esm'],
  dts: true,
  // Sourcemaps embed the full original source (which trips the public-consumption leak scanner and
  // widens the published surface). Omit them like @holoscript/memory; debug from src, not the tarball.
  sourcemap: false,
  clean: true,
  splitting: false,
  target: 'node18',
});
