/**
 * @provenance trait tests — the native authoring surface for the
 * observed-vs-invented moat axis.
 * @see ../ProvenanceTrait.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { provenanceHandler } from '../ProvenanceTrait';

describe('provenanceHandler (@provenance trait)', () => {
  it('registers under the unprefixed name with an observed default', () => {
    expect(provenanceHandler.name).toBe('provenance');
    expect(provenanceHandler.defaultConfig).toEqual({ class: 'observed' });
  });

  it('stashes the declared provenance on the node and emits provenance_declared', () => {
    const node: Record<string, unknown> = {};
    const emit = vi.fn();
    provenanceHandler.onAttach?.(
      node as never,
      { class: 'generative-extended', source: 'artifixer-14b' },
      { emit } as never
    );
    expect(node.__provenance).toEqual({ class: 'generative-extended', source: 'artifixer-14b' });
    expect(emit).toHaveBeenCalledWith('provenance_declared', expect.objectContaining({ node }));
  });

  it('defaults the class to observed when none is declared', () => {
    const node: Record<string, unknown> = {};
    provenanceHandler.onAttach?.(node as never, {}, { emit: () => {} } as never);
    expect((node.__provenance as { class: string }).class).toBe('observed');
  });

  it('clears provenance on detach', () => {
    const node: Record<string, unknown> = { __provenance: { class: 'observed' } };
    provenanceHandler.onDetach?.(node as never, {}, { emit: () => {} } as never);
    expect(node.__provenance).toBeUndefined();
  });
});
