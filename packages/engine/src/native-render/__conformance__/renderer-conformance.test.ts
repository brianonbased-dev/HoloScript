/**
 * Renderer conformance — the consuming test for
 * `holoscript.native-renderer-contract.v1` (see renderer-conformance.ts).
 *
 * THE FORCING FUNCTION: this suite (and the holo-ci gate that runs it,
 * scripts/holo-ci/check-renderer-conformance.mjs) fails when a contract
 * capability is implemented by the ThreeJS bridge but NOT by the native
 * WebGPU backend — bridge-only feature growth can no longer land silently.
 *
 * It also enforces receipt honesty: structural mode may never carry a frame
 * hash, and every capability verdict must be grounded in recorded evidence.
 */
import { describe, expect, it } from 'vitest';
import {
  runRendererConformance,
  writeRendererConformanceReceipt,
  DEFAULT_RECEIPT_PATH,
  type RendererConformanceReceipt,
} from './renderer-conformance';
import { REQUIRED_NATIVE_RENDERER_CAPABILITIES } from '../../../../runtime/src/native-renderer-contract';

let receiptPromise: Promise<RendererConformanceReceipt> | null = null;
function getReceipt(): Promise<RendererConformanceReceipt> {
  receiptPromise ??= runRendererConformance();
  return receiptPromise;
}

describe('native renderer contract conformance (engine backends)', () => {
  it('FORCING FUNCTION: no contract capability is bridge-only (threejs without native)', async () => {
    const receipt = await getReceipt();

    expect(
      receipt.coverage.bridgeOnlyCapabilities,
      'A native-renderer-contract capability is implemented by the ThreeJS bridge but NOT by ' +
        'the native WebGPU backend. Bridge-only growth is frozen (W.830b): implement the ' +
        'capability in WebGPUBackendRenderer first (or in the same change), then re-run ' +
        'pnpm check:renderer-conformance.'
    ).toEqual([]);
  });

  it('validates the golden fixture suite through the contract validator', async () => {
    const receipt = await getReceipt();
    expect(receipt.goldenSuite.ok).toBe(true);
    expect(receipt.goldenSuite.missingCapabilities).toEqual([]);
  });

  it('exercises the .holo golden scenes through BOTH backends', async () => {
    const receipt = await getReceipt();
    const holoRuns = receipt.fixtures.filter((f) => f.sourcePath.endsWith('.holo'));
    expect(holoRuns.length).toBeGreaterThanOrEqual(2);

    for (const run of holoRuns) {
      expect(run.parsed, `${run.id} must parse (${run.parseErrors.join('; ')})`).toBe(true);
      expect(run.exercised).toBe(true);
      expect(run.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(run.sceneModelHash).toMatch(/^[0-9a-f]{64}$/);
      expect(run.expectationDeltas, `${run.id} contract expectation deltas`).toEqual([]);
      for (const side of ['native', 'bridge'] as const) {
        const backendRun = run.backends[side];
        expect(backendRun, `${run.id} missing ${side} backend run`).not.toBeNull();
        expect(backendRun!.sceneGraphHash).toMatch(/^[0-9a-f]{64}$/);
        const failedOps = backendRun!.ops.filter((op) => !op.ok);
        expect(failedOps, `${run.id}/${side} ops threw: ${JSON.stringify(failedOps)}`).toEqual([]);
      }
    }
  });

  it('degrades honestly in headless mode — never a fabricated frame hash', async () => {
    const receipt = await getReceipt();
    expect(receipt.mode).toBe('structural');
    expect(receipt.frame.rendered).toBe(false);
    expect(receipt.frame.frameHashes).toBeNull();
    expect(receipt.frame.reason).toContain('structural conformance only');
  });

  it('grounds every implemented-capability verdict in recorded source evidence', async () => {
    const receipt = await getReceipt();
    for (const side of ['native', 'bridge'] as const) {
      const backend = receipt.backends[side];
      for (const capability of REQUIRED_NATIVE_RENDERER_CAPABILITIES) {
        const verdict = backend.capabilities[capability];
        if (verdict.implemented) {
          expect(
            verdict.evidence.length,
            `${backend.backendId}/${capability} implemented without evidence`
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('native backend covers the structural seam capabilities the golden scenes exercise', async () => {
    const receipt = await getReceipt();
    const native = receipt.backends.native;
    expect(native.capabilities.scene_graph.implemented).toBe(true);
    expect(native.capabilities.camera.implemented).toBe(true);
    expect(native.capabilities.materials.implemented).toBe(true);
    // The validator result is recorded contract debt, not asserted green:
    // missing capabilities at the renderer seam are visible in the receipt.
    expect(native.validation.backendId).toBe('engine.webgpu-native');
  });

  it('writes the verified-view receipt to the receipts lane', async () => {
    const receipt = await getReceipt();
    const outPath = writeRendererConformanceReceipt(receipt);
    expect(outPath).toBe(DEFAULT_RECEIPT_PATH);
  });
});
