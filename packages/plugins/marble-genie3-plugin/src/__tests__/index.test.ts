import { describe, it, expect } from 'vitest';
import { importWorldModel } from '../index';

describe('marble-genie3-plugin stub', () => {
  it('builds a stable asset_id from source+checkpoint', () => {
    const r = importWorldModel({
      source: 'marble',
      checkpoint_hash: 'sha256:abcdef1234567890',
      frames: [{ t: 0, image_uri: 'frame0' }, { t: 0.1, image_uri: 'frame1' }],
    });
    expect(r.neural_asset.asset_id).toMatch(/^wm:marble:/);
    expect(r.neural_asset.tier).toBe('T1');
    expect(r.neural_asset.canonical_viewpoints).toBe(2);
  });

  it('emits one @world_frame trait per frame', () => {
    const r = importWorldModel({
      source: 'genie3',
      checkpoint_hash: 'sha256:xx',
      frames: [{ t: 0, image_uri: 'a' }, { t: 0.5, image_uri: 'b' }, { t: 1, image_uri: 'c' }],
    });
    expect(r.traits.length).toBe(3);
    expect(r.traits.every((t) => t.kind === '@world_frame')).toBe(true);
  });
});
