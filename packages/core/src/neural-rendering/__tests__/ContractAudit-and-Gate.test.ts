import { describe, it, expect } from 'vitest';
import { buildManifest, type NeuralAssetManifest } from '../NeuralAssetManifest';
import { auditNeuralAsset, fixedMetricsComparator } from '../ContractAudit';
import { gateResolve } from '../NeuralRuntimeGate';

async function t1Manifest(overrides: Partial<NeuralAssetManifest> = {}): Promise<NeuralAssetManifest> {
  return buildManifest({
    tier: 'T1',
    representation: 'nerf',
    checkpoint_hash: 'sha256:ckpt',
    canonical_viewpoints: [
      {
        view_id: 'v0',
        camera: { position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fov_degrees: 60, resolution: [1024, 1024] },
        golden_frame_hash: 'sha256:golden0',
      },
    ],
    tolerance_bands: { psnr_min: 30, ssim_min: 0.95, depth_l1_max: 0.1 },
    hash_mode: 'fnv1a',
    created_at: '2026-04-23T00:00:00Z',
    created_by: 'agent_x',
    ...overrides,
  });
}

describe('ContractAudit', () => {
  it('passes when all metrics within bounds', async () => {
    const m = await t1Manifest();
    const comp = fixedMetricsComparator({
      v0: { view_id: 'v0', psnr: 35, ssim: 0.98, depth_l1: 0.02 },
    });
    const r = await auditNeuralAsset(m, comp);
    expect(r.pass).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('fails when PSNR below bound', async () => {
    const m = await t1Manifest();
    const comp = fixedMetricsComparator({
      v0: { view_id: 'v0', psnr: 20, ssim: 0.98, depth_l1: 0.02 },
    });
    const r = await auditNeuralAsset(m, comp);
    expect(r.pass).toBe(false);
    expect(r.violations[0].metric).toBe('psnr');
    expect(r.violations[0].observed).toBe(20);
  });

  it('throws if manifest is not T1', async () => {
    const m: NeuralAssetManifest = await buildManifest({
      tier: 'T0',
      representation: 'mesh',
      canonical_viewpoints: [],
      hash_mode: 'fnv1a',
      created_at: 'now',
      created_by: 'x',
    });
    const comp = fixedMetricsComparator({});
    await expect(auditNeuralAsset(m, comp)).rejects.toThrow(/T1/);
  });
});

describe('NeuralRuntimeGate', () => {
  it('accepts T0 unconditionally', async () => {
    const m = await buildManifest({
      tier: 'T0',
      representation: 'mesh',
      canonical_viewpoints: [],
      hash_mode: 'fnv1a',
      created_at: 'now',
      created_by: 'x',
    });
    const r = await gateResolve(
      { manifest: m, budget: {}, accept_approximate: false },
      fixedMetricsComparator({})
    );
    expect(r.decision).toBe('accept');
  });

  it('accepts T1 when threshold + budget pass', async () => {
    const m = await t1Manifest();
    const r = await gateResolve(
      { manifest: m, budget: { max_latency_ms: 100 }, accept_approximate: false, observed_cost: { max_latency_ms: 50 } },
      fixedMetricsComparator({ v0: { view_id: 'v0', psnr: 35, ssim: 0.98, depth_l1: 0.01 } })
    );
    expect(r.decision).toBe('accept');
  });

  it('falls back on threshold fail when upgrade_path present', async () => {
    const m = await t1Manifest({ upgrade_path: 'neural:fnv1a:meshproxy' });
    const r = await gateResolve(
      { manifest: m, budget: {}, accept_approximate: false },
      fixedMetricsComparator({ v0: { view_id: 'v0', psnr: 10, ssim: 0.5, depth_l1: 1 } })
    );
    expect(r.decision).toBe('fallback');
    expect(r.fallback_used).toBe('neural:fnv1a:meshproxy');
  });

  it('refuses on threshold fail when no upgrade_path + no opt-in', async () => {
    const m = await t1Manifest();
    const r = await gateResolve(
      { manifest: m, budget: {}, accept_approximate: false },
      fixedMetricsComparator({ v0: { view_id: 'v0', psnr: 10 } })
    );
    expect(r.decision).toBe('refuse');
  });

  it('accepts T1 threshold fail when accept_approximate=true', async () => {
    const m = await t1Manifest();
    const r = await gateResolve(
      { manifest: m, budget: {}, accept_approximate: true },
      fixedMetricsComparator({ v0: { view_id: 'v0', psnr: 10 } })
    );
    expect(r.decision).toBe('accept');
  });

  it('falls back on budget exceedance when upgrade_path present', async () => {
    const m = await t1Manifest({ upgrade_path: 'neural:fnv1a:cheap' });
    const r = await gateResolve(
      {
        manifest: m,
        budget: { max_latency_ms: 50 },
        accept_approximate: false,
        observed_cost: { max_latency_ms: 500 },
      },
      fixedMetricsComparator({ v0: { view_id: 'v0', psnr: 35, ssim: 0.98, depth_l1: 0.01 } })
    );
    expect(r.decision).toBe('fallback');
    expect(r.reason).toContain('budget');
  });

  it('refuses T2 without opt-in', async () => {
    const m = await buildManifest({
      tier: 'T2',
      representation: 'nerf',
      checkpoint_hash: 'xx',
      canonical_viewpoints: [],
      hash_mode: 'fnv1a',
      created_at: 'now',
      created_by: 'x',
    });
    const r = await gateResolve(
      { manifest: m, budget: {}, accept_approximate: false },
      fixedMetricsComparator({})
    );
    expect(r.decision).toBe('refuse');
  });

  it('accepts T2 with opt-in', async () => {
    const m = await buildManifest({
      tier: 'T2',
      representation: 'nerf',
      checkpoint_hash: 'xx',
      canonical_viewpoints: [],
      hash_mode: 'fnv1a',
      created_at: 'now',
      created_by: 'x',
    });
    const r = await gateResolve(
      { manifest: m, budget: {}, accept_approximate: true },
      fixedMetricsComparator({})
    );
    expect(r.decision).toBe('accept');
  });
});
