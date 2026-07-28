import { describe, it, expect, vi } from 'vitest';

import { freezeWhenHandler } from '../FreezeWhenTrait';
import { TRAIT_DOCS } from '../../traitDocs/traitDocs';
import { vrTraitRegistry } from '../VRTraitSystem';

describe('@freeze_when trait', () => {
  it('has the canonical trait name', () => {
    expect(freezeWhenHandler.name).toBe('freeze_when');
  });

  it('onAttach records the rule and emits freeze_declared with the native-first invariants', () => {
    const node: any = {};
    const emit = vi.fn();
    freezeWhenHandler.onAttach!(
      node,
      {
        id: 'features-on-red-gate',
        scope: 'new-feature-work',
        signal: 'required-gate:red',
        unfreeze: 'gate passes',
      },
      { emit } as any // TraitContext mock — only emit is exercised here
    );

    expect(node.__freezeWhen).toMatchObject({
      id: 'features-on-red-gate',
      scope: 'new-feature-work',
      signal: 'required-gate:red',
      unfreeze: 'gate passes',
      severity: 'advisory',
      exempt: ['fix', 'native-format', 'infra-repair'], // native-first guarantee by default
    });
    expect(emit).toHaveBeenCalledWith(
      'freeze_declared',
      expect.objectContaining({ derived: true, nativeExempt: true })
    );
  });

  it('onDetach clears per-instance state (F.126 — no module/class state)', () => {
    const node: any = { __freezeWhen: { id: 'x' } };
    freezeWhenHandler.onDetach!(node, {} as any, { emit: vi.fn() } as any);
    expect(node.__freezeWhen).toBeUndefined();
  });

  it('TRAIT_DOCS carries the arg schema for LSP/validation', () => {
    const doc = TRAIT_DOCS['freeze_when'];
    expect(doc).toBeDefined();
    expect(doc.annotation).toBe('@freeze_when');
    const props = doc.properties.map((p) => p.name);
    expect(props).toEqual(
      expect.arrayContaining(['id', 'scope', 'signal', 'unfreeze', 'exempt', 'severity'])
    );
  });

  it('is registered in the trait registry (the decorator is now KNOWN, not freeform)', () => {
    const handler = vrTraitRegistry.getHandler('freeze_when');
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('freeze_when');
  });
});
