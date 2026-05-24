/**
 * determinism-manifest.emit.test.ts — the portable P1 fleet artifact (scope 2026-05-23 P1).
 *
 * Run this on EACH machine (local + every vast.ai fleet node + CI) to WRITE that machine's
 * semantic-novelty determinism manifest to disk. Collect the manifests across the fleet and
 * feed them to `assessDeterminismGate` (SemanticDeterminismGate.ts) — the pure verdict decides
 * advisory → receipt-binding promotion for the learned-semantic novelty layer.
 *
 * It's a vitest spec (not a standalone script) because the engine's TS modules use the
 * bundler's extensionless import resolution + @huggingface/transformers resolves only from
 * within packages/engine — vitest handles both; native `node x.ts` does not. This matches the
 * repo's established "test produces evidence" pattern (cf. the WebGPU determinism harness).
 *
 * INERT in normal runs: gated on EMIT_DETERMINISM_MANIFEST=1, so `pnpm test` skips it.
 *
 *   cd packages/engine
 *   EMIT_DETERMINISM_MANIFEST=1 npx vitest run src/simulation/__tests__/determinism-manifest.emit.test.ts
 *   # optional: DETERMINISM_OUT=/abs/path.json  DETERMINISM_LABEL=ci-ubuntu-22
 */
import { hostname, platform, arch, release } from 'node:os';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDeterminismManifest } from '../SemanticDeterminismGate';

const ENABLED = process.env.EMIT_DETERMINISM_MANIFEST === '1';

/** Distinct-enough machine fingerprint for the gate's ≥2-distinct-machines requirement. */
function defaultLabel(): string {
  return `${hostname()}|${platform()}-${arch()}|node${process.version}|kernel${release()}`;
}

describe('semantic-novelty determinism manifest emitter (P1 fleet artifact)', () => {
  it(
    ENABLED ? 'emits this machine\'s manifest and is same-machine stable' : 'is inert unless EMIT_DETERMINISM_MANIFEST=1',
    async (ctx) => {
      if (!ENABLED) return ctx.skip();
      const label = process.env.DETERMINISM_LABEL ?? defaultLabel();
      const manifest = await buildDeterminismManifest({ machineLabel: label });
      const out =
        process.env.DETERMINISM_OUT ??
        `determinism-manifest.${hostname()}-${platform()}-${arch()}.json`;
      writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf8');
      // eslint-disable-next-line no-console
      console.log(`[determinism] wrote ${out} (sameMachineStable=${manifest.sameMachineStable}, dim=${manifest.dim})`);
      // A machine that isn't even same-machine stable can never contribute to a byte-identical
      // verdict — assert it here so a broken node fails loudly rather than emitting junk.
      expect(manifest.sameMachineStable).toBe(true);
      expect(manifest.entries.length).toBeGreaterThan(0);
    },
    180_000,
  );
});
