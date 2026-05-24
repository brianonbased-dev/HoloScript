/**
 * determinism-verdict.emit.test.ts — runs the REAL assessDeterminismGate over the collected
 * fleet manifests (scope 2026-05-23 P1) and prints the official promotion verdict. INERT
 * unless EMIT_DETERMINISM_VERDICT=1, so `pnpm test` skips it.
 *
 *   cd packages/engine
 *   EMIT_DETERMINISM_VERDICT=1 npx vitest run src/simulation/__tests__/determinism-verdict.emit.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessDeterminismGate, type DeterminismManifest } from '../SemanticDeterminismGate';

const ENABLED = process.env.EMIT_DETERMINISM_VERDICT === '1';
const SNAP = join(process.cwd(), '..', '..', 'scripts', 'fleet-corpus-snapshot');

describe('semantic-novelty determinism verdict (P1)', () => {
  it(ENABLED ? 'computes the cross-fleet verdict from collected manifests' : 'inert unless EMIT_DETERMINISM_VERDICT=1', (ctx) => {
    if (!ENABLED) return ctx.skip();
    const manifests: DeterminismManifest[] = [
      'determinism-manifest.local-win-x64.json',
      'determinism-manifest.vast-linux-x64.json',
    ].map((f) => JSON.parse(readFileSync(join(SNAP, f), 'utf8')) as DeterminismManifest);
    const verdict = assessDeterminismGate(manifests);
    writeFileSync(join(SNAP, 'determinism-verdict.json'), JSON.stringify(verdict, null, 2), 'utf8');
    expect(verdict.machineCount).toBe(2);
    expect(['byte-identical', 'divergent', 'unstable', 'incomparable']).toContain(verdict.verdict);
  });
});
