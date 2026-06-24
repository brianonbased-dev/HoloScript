/**
 * @provenance_densify trait tests — the native densification authoring surface.
 * @see ../ProvenanceDensifyTrait.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { provenanceDensifyHandler } from '../ProvenanceDensifyTrait';

describe('provenanceDensifyHandler (@provenance_densify trait)', () => {
  it('registers under the unprefixed name with an interpolation default', () => {
    expect(provenanceDensifyHandler.name).toBe('provenance_densify');
    expect(provenanceDensifyHandler.defaultConfig).toEqual({ mode: 'interpolation' });
  });

  it('stashes the densify directive and emits provenance_densify_declared', () => {
    const node: Record<string, unknown> = {};
    const emit = vi.fn();
    provenanceDensifyHandler.onAttach?.(
      node as never,
      { mode: 'generative', source: 'wan2.1-sovereign', maxAdded: 100 },
      { emit } as never
    );
    expect(node.__provenanceDensify).toEqual({
      mode: 'generative',
      source: 'wan2.1-sovereign',
      maxAdded: 100,
    });
    expect(emit).toHaveBeenCalledWith(
      'provenance_densify_declared',
      expect.objectContaining({ node })
    );
  });

  it('defaults the mode to interpolation when none is declared', () => {
    const node: Record<string, unknown> = {};
    provenanceDensifyHandler.onAttach?.(node as never, {}, { emit: () => {} } as never);
    expect((node.__provenanceDensify as { mode: string }).mode).toBe('interpolation');
  });

  it('clears the directive on detach', () => {
    const node: Record<string, unknown> = { __provenanceDensify: { mode: 'interpolation' } };
    provenanceDensifyHandler.onDetach?.(node as never, {}, { emit: () => {} } as never);
    expect(node.__provenanceDensify).toBeUndefined();
  });
});
