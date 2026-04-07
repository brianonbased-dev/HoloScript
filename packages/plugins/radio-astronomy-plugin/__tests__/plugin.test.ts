import { describe, it, expect } from 'vitest';
import { DOMAIN_MANIFEST, RADIO_ASTRONOMY_TRAITS, PythonAstropyBridge } from '../src/index';

describe('Radio Astronomy Plugin', () => {
  it('should export the domain manifest correctly', () => {
    expect(DOMAIN_MANIFEST.id).toBe('domain.science.astronomy.radio');
    expect(DOMAIN_MANIFEST.traits.length).toBeGreaterThan(0);
  });

  it('should include basic astrophysics semantic traits', () => {
    expect(RADIO_ASTRONOMY_TRAITS).toContain('synchrotron');
    expect(RADIO_ASTRONOMY_TRAITS).toContain('interferometer');
    expect(RADIO_ASTRONOMY_TRAITS).toContain('radio_emitter');
  });

  it('should instantiate the python bridge without throwing', () => {
    const bridge = new PythonAstropyBridge();
    expect(bridge).toBeDefined();
    expect(typeof bridge.executeCommand).toBe('function');
  });
});
