import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load a native HoloScript example (`.holo` / `.hsplus` / `.hs`) from the repo's
 * `examples/` library, server-side. Lets pages render REAL native scenes instead
 * of inlining scene strings in TSX — the source of truth is the `.holo` file, and
 * the viewer compiles it with @holoscript/core just like any published scene.
 *
 * Server-only (uses node:fs). Import only from server components / route handlers.
 *
 * Tries candidate repo roots so it resolves whether cwd is the studio package
 * (Next dev: packages/studio) or the monorepo root.
 */
const CANDIDATE_ROOTS = [
  process.cwd(), // Railway prod: cwd=/app = repo root (examples copied to /app/examples)
  join(process.cwd(), '..', '..'), // Next dev: cwd=packages/studio -> repo root
];

export type LoadedHoloExample = { source: string; path: string } | { error: string };

export function loadHoloExample(relPath: string): LoadedHoloExample {
  // Hardening: relPath is a trusted constant today, but guard against traversal in
  // case it ever becomes request-derived (would otherwise read any readable file).
  if (relPath.includes('..') || relPath.startsWith('/') || relPath.startsWith('\\')) {
    return { error: `invalid example path: ${relPath}` };
  }
  const tried: string[] = [];
  for (const root of CANDIDATE_ROOTS) {
    const full = join(root, 'examples', relPath);
    tried.push(full);
    try {
      return { source: readFileSync(full, 'utf8'), path: full };
    } catch {
      // try next candidate root
    }
  }
  return { error: `example not found: examples/${relPath} (tried: ${tried.join(', ')})` };
}
