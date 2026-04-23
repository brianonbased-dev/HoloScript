import { describe, it, expect } from 'vitest';
import {
  buildManifest,
  canonicalSerialize,
  computeManifestHash,
  validateTierConsistency,
  verifyManifest,
  type NeuralAssetManifest,
} from '../NeuralAssetManifest';

const baseT0: Omit<NeuralAssetManifest, 'asset_id'> = {
  tier: 'T0',
  representation: 'mesh',
  canonical_viewpoints: [],
  hash_mode: 'fnv1a',
  created_at: '2026-04-23T00:00:00Z',
  created_by: 'agent_xyz',
};

const baseT1: Omit<NeuralAssetManifest, 'asset_id'> = {
  tier: 'T1',
  representation: 'nerf',
  checkpoint_hash: 'sha256:abc123',
  canonical_viewpoints: [
    {
      view_id: 'v0',
      camera: {
        position: [0, 0, 5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov_degrees: 60,
        resolution: [1024, 1024],
      },
      golden_frame_hash: 'sha256:frame0',
    },
  ],
  tolerance_bands: { psnr_min: 30, ssim_min: 0.95 },
  hash_mode: 'fnv1a',
  created_at: '2026-04-23T00:00:00Z',
  created_by: 'agent_xyz',
};

describe('NeuralAssetManifest canonicalization', () => {
  it('canonicalSerialize sorts keys deterministically', () => {
    const a = canonicalSerialize({ ...baseT0, asset_id: '' });
    const b = canonicalSerialize({ ...baseT0, asset_id: '' });
    expect(a).toBe(b);
    // Verify it's actually sorted — 'canonical_viewpoints' should come before 'created_at'
    const parsed = JSON.parse(a);
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].sort());
  });

  it('asset_id excluded from canonical body (hash depends only on content)', () => {
    const m1: NeuralAssetManifest = { ...baseT0, asset_id: 'foo' };
    const m2: NeuralAssetManifest = { ...baseT0, asset_id: 'bar' };
    expect(canonicalSerialize(m1)).toBe(canonicalSerialize(m2));
  });
});

describe('NeuralAssetManifest buildManifest + verify', () => {
  it('buildManifest produces a stable asset_id for T0 fnv1a', async () => {
    const m = await buildManifest(baseT0);
    expect(m.asset_id).toMatch(/^neural:fnv1a:[0-9a-f]{8}$/);
    const m2 = await buildManifest(baseT0);
    expect(m.asset_id).toBe(m2.asset_id);
  });

  it('buildManifest produces sha256-prefixed asset_id when hash_mode=sha256', async () => {
    const m = await buildManifest({ ...baseT0, hash_mode: 'sha256' });
    expect(m.asset_id).toMatch(/^neural:sha256:[0-9a-f]{64}$/);
  });

  it('verifyManifest returns true for a freshly built manifest', async () => {
    const m = await buildManifest(baseT1);
    expect(await verifyManifest(m)).toBe(true);
  });

  it('verifyManifest returns false if any body field mutated', async () => {
    const m = await buildManifest(baseT0);
    const tampered: NeuralAssetManifest = { ...m, created_by: 'attacker' };
    expect(await verifyManifest(tampered)).toBe(false);
  });

  it('different representation produces different asset_id', async () => {
    const m1 = await buildManifest(baseT0);
    const m2 = await buildManifest({ ...baseT0, representation: 'hybrid' });
    expect(m1.asset_id).not.toBe(m2.asset_id);
  });
});

describe('NeuralAssetManifest tier consistency', () => {
  it('T0 with checkpoint_hash flagged as invalid', () => {
    const v = validateTierConsistency({ ...baseT0, asset_id: 'x', checkpoint_hash: 'xx' });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toContain('T0');
  });

  it('T1 without tolerance_bands flagged', () => {
    const v = validateTierConsistency({ ...baseT1, asset_id: 'x', tolerance_bands: undefined });
    expect(v.some((m) => m.includes('tolerance_bands'))).toBe(true);
  });

  it('T1 without canonical_viewpoints flagged', () => {
    const v = validateTierConsistency({ ...baseT1, asset_id: 'x', canonical_viewpoints: [] });
    expect(v.some((m) => m.includes('canonical_viewpoint'))).toBe(true);
  });

  it('T1 without checkpoint_hash flagged', () => {
    const v = validateTierConsistency({ ...baseT1, asset_id: 'x', checkpoint_hash: undefined });
    expect(v.some((m) => m.includes('checkpoint_hash'))).toBe(true);
  });

  it('T2 with tolerance_bands flagged (misuse — promote to T1)', () => {
    const v = validateTierConsistency({
      ...baseT0,
      asset_id: 'x',
      tier: 'T2',
      tolerance_bands: { psnr_min: 30 },
    });
    expect(v.some((m) => m.includes('T2'))).toBe(true);
  });

  it('valid T0 has no violations', () => {
    const v = validateTierConsistency({ ...baseT0, asset_id: 'x' });
    expect(v).toEqual([]);
  });

  it('valid T1 has no violations', () => {
    const v = validateTierConsistency({ ...baseT1, asset_id: 'x' });
    expect(v).toEqual([]);
  });
});
