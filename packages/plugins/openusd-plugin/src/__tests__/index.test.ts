import { describe, it, expect } from 'vitest';
import { exportToUsda, usdaStableRoundTrip } from '../index';

describe('openusd-plugin stub', () => {
  it('emits valid #usda 1.0 preamble', () => {
    const out = exportToUsda({ name: 't' });
    expect(out.usda.startsWith('#usda 1.0')).toBe(true);
    expect(out.usda).toContain('defaultPrim = "World"');
    expect(out.loc).toBeGreaterThan(5);
  });

  it('emits primitives with sanitized paths', () => {
    const out = exportToUsda({
      name: 'scene',
      primitives: [
        { kind: 'mesh', path: 'hero/body', attrs: { position: [0, 1, 0] } },
        { kind: 'light', path: 'sun', attrs: { intensity: 3.0 } },
      ],
    });
    expect(out.usda).toContain('def Mesh "hero_body"');
    expect(out.usda).toContain('def SphereLight "sun"');
    expect(out.usda).toContain('float3 position = (0, 1, 0)');
    expect(out.usda).toContain('float intensity = 3');
    expect(out.primitive_count).toBe(2);
  });

  it('round-trip stability: declared primitives appear in output', () => {
    expect(
      usdaStableRoundTrip({
        name: 's',
        primitives: [{ kind: 'xform', path: 'camera-main' }, { kind: 'mesh', path: 'ground' }],
      })
    ).toBe(true);
  });
});
