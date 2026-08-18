import { build } from 'esbuild';
import { execSync } from 'node:child_process';

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: import.meta.dirname })
    .toString()
    .trim();
} catch {
  /* not a git checkout — receipt will say "unknown" */
}

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/probe.js',
  sourcemap: true,
  define: { GIT_COMMIT: JSON.stringify(commit) },
  logLevel: 'info',
});
