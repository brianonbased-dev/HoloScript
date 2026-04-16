import { describe, expect, it } from 'vitest';
import {
  LEGACY_IMPORTER_ROUTING_DEFINITIONS,
  compile,
  routeNamespacedFilmVFXTraitEnvelopes,
  toNamespacedFilmVFXTraitToken,
  type FilmVFXTrait,
} from './index';

describe('film-vfx plugin namespace envelopes', () => {
  it('maps flat trait tokens to FilmVFXPlugin namespace', () => {
    expect(toNamespacedFilmVFXTraitToken('shot_list')).toBe('FilmVFXPlugin.shot_list');
    expect(toNamespacedFilmVFXTraitToken('@color_grade')).toBe('FilmVFXPlugin.color_grade');
    expect(LEGACY_IMPORTER_ROUTING_DEFINITIONS.virtual_production).toBe(
      'FilmVFXPlugin.virtual_production'
    );
  });

  it('rewrites legacy flat trait envelopes in source text', () => {
    const source = `composition "Film" {\n  object "Shot" @shot_list {}\n  trait: "dmx_lighting"\n}`;
    const routed = routeNamespacedFilmVFXTraitEnvelopes(source);

    expect(routed).toContain('@FilmVFXPlugin.shot_list');
    expect(routed).toContain('trait: "FilmVFXPlugin.dmx_lighting"');
  });

  it('accepts namespaced trait discriminants during compile()', () => {
    const traits: FilmVFXTrait[] = [
      {
        trait: 'FilmVFXPlugin.shot_list',
        shotId: 'A001',
        scene: 1,
        shotType: 'wide',
        duration: 4,
        lens: { focalLength: 35, aperture: 2.8 },
        movement: 'static',
      },
    ];

    const holo = compile(traits, { format: 'holo' });
    const edl = compile(traits, { format: 'edl' });
    const otio = compile(traits, { format: 'otio' });

    expect(holo).toContain('@shot_list');
    expect(edl).toContain('SHOT: A001');
    expect(otio).toContain('Shot_A001');
  });
});
