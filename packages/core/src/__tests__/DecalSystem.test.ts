import { describe, it, expect, beforeEach } from 'vitest';
import { DecalSystem } from '@holoscript/engine/rendering';

// =============================================================================
// C261 — Decal System
// =============================================================================

const pos = [0, 0, 0];
const normal = [0, 1, 0 ];

describe('DecalSystem', () => {
  let sys: DecalSystem;
  beforeEach(() => {
    sys = new DecalSystem();
  });

  it('spawn creates active decal', () => {
    const d = sys.spawn({ textureId: 'blood', position: pos, normal });
    expect(d.active).toBe(true);
    expect(d.textureId).toBe('blood');
  });

  it('getActiveCount reflects spawns', () => {
    sys.spawn({ textureId: 'a', position: pos, normal });
    sys.spawn({ textureId: 'b', position: pos, normal });
    expect(sys.getActiveCount()).toBe(2);
  });

  it('remove deactivates and pools decal', () => {
    const d = sys.spawn({ textureId: 'a', position: pos, normal });
    sys.remove(d.id);
    expect(sys.getActiveCount()).toBe(0);
  });

  it('update fades in during fadeInDuration', () => {
    const d = sys.spawn({ textureId: 'a', position: pos, normal, fadeInDuration: 1 });
    sys.update(0.5);
    expect(d.opacity).toBeCloseTo(0.5);
  });

  it('update reaches full opacity after fadeIn', () => {
    const d = sys.spawn({
      textureId: 'a',
      position: pos,
      normal,
      fadeInDuration: 0.1,
      lifetime: 0,
    });
    sys.update(0.2);
    expect(d.opacity).toBe(1);
  });

  it('update removes expired decals', () => {
    sys.spawn({
      textureId: 'a',
      position: pos,
      normal,
      lifetime: 1,
      fadeInDuration: 0,
      fadeOutDuration: 0,
    });
    sys.update(2);
    expect(sys.getActiveCount()).toBe(0);
  });

  it('infinite lifetime (0) never expires', () => {
    sys.spawn({ textureId: 'a', position: pos, normal, lifetime: 0, fadeInDuration: 0 });
    sys.update(100);
    expect(sys.getActiveCount()).toBe(1);
  });

  it('setMaxDecals enforces limit by removing oldest', () => {
    sys.setMaxDecals(2);
    const d1 = sys.spawn({ textureId: 'a', position: pos, normal });
    sys.update(0.1); // age d1
    sys.spawn({ textureId: 'b', position: pos, normal });
    sys.spawn({ textureId: 'c', position: pos, normal }); // should evict d1
    expect(sys.getActiveCount()).toBe(2);
    expect(sys.getDecal(d1.id)).toBeUndefined();
  });

  it('getVisible filters by opacity and layer', () => {
    sys.spawn({ textureId: 'a', position: pos, normal, fadeInDuration: 0 });
    sys.update(0.1);
    expect(sys.getVisible()).toHaveLength(1);
  });

  it('getVisible respects frustum test', () => {
    sys.spawn({ textureId: 'a', position: pos, normal, fadeInDuration: 0 });
    sys.update(0.1);
    expect(sys.getVisible(() => false)).toHaveLength(0);
    expect(sys.getVisible(() => true)).toHaveLength(1);
  });

  it('clear moves all to pool', () => {
    sys.spawn({ textureId: 'a', position: pos, normal });
    sys.spawn({ textureId: 'b', position: pos, normal });
    sys.clear();
    expect(sys.getActiveCount()).toBe(0);
  });

  it('setLayerMask filters getVisible', () => {
    sys.spawn({ textureId: 'a', position: pos, normal, layer: 2, fadeInDuration: 0 });
    sys.update(0.1);
    sys.setLayerMask(1); // only layer 1
    expect(sys.getVisible()).toHaveLength(0);
  });
});
