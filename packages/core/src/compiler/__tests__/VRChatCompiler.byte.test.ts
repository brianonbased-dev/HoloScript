/**
 * VRChatCompiler — "Byte" (Udon Assembly) target tests.
 *
 * The Phase-2 vertical slice: a `@clickable` object lowers to a valid `_interact`
 * toggle UASM that passes the offline validator against the EXTERN manifest, and a
 * corrupted artifact is provably rejected (the gate is real, not decorative).
 */
import { describe, it, expect, vi } from 'vitest';
import { VRChatCompiler } from '../VRChatCompiler';
import { validateUdonAssembly } from '../udon/udon-assembly';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'ByteWorld', objects: [], ...overrides } as HoloComposition;
}

function clickableCube(name = 'cube') {
  return {
    name,
    properties: [{ key: 'geometry', value: 'box' }],
    traits: [{ name: 'clickable' }],
  } as any;
}

describe('VRChatCompiler — Byte / Udon Assembly target', () => {
  it('emits a per-object .uasm behaviour for a @clickable object', () => {
    const c = new VRChatCompiler({ outputFormat: 'udon-assembly', className: 'ByteWorld' });
    const result = c.compile(makeComp({ objects: [clickableCube()] }), '');
    expect(result.outputFormat).toBe('udon-assembly');
    expect(result.udonAssembly).toBeDefined();
    expect(result.udonAssembly).toHaveProperty('cubeBehaviour.uasm');
    expect(result.udonAssembly).toHaveProperty('ByteWorld.uasm'); // main behaviour keyed by className
  });

  it('produces UASM that passes the offline validator with EXTERNs resolved', () => {
    const c = new VRChatCompiler({ outputFormat: 'udon-assembly' });
    const result = c.compile(makeComp({ objects: [clickableCube()] }), '');
    const uasm = result.udonAssembly!['cubeBehaviour.uasm'];
    const v = validateUdonAssembly(uasm);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(uasm).toContain(
      'EXTERN, "UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid"'
    );
  });

  it('FALSE CASE: a corrupted EXTERN in the emitted UASM fails the validator', () => {
    const c = new VRChatCompiler({ outputFormat: 'udon-assembly' });
    const result = c.compile(makeComp({ objects: [clickableCube()] }), '');
    const corrupted = result
      .udonAssembly!['cubeBehaviour.uasm'].replace(
        'UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid',
        'UnityEngineGameObject.__Bogus__SystemBoolean__SystemVoid'
      );
    const v = validateUdonAssembly(corrupted);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => /not in manifest/.test(e))).toBe(true);
  });

  it('does not emit a behaviour for non-clickable objects (no fake UASM)', () => {
    const c = new VRChatCompiler({ outputFormat: 'udon-assembly', className: 'ByteWorld' });
    const wall = { name: 'wall', properties: [{ key: 'geometry', value: 'box' }], traits: [] };
    const result = c.compile(makeComp({ objects: [wall as any] }), '');
    expect(result.udonAssembly).not.toHaveProperty('wallBehaviour.uasm');
    expect(Object.keys(result.udonAssembly!)).toEqual(['ByteWorld.uasm']);
  });

  it('still gates udon-bytecode (Unity-side derivative, not an offline artifact)', () => {
    const c = new VRChatCompiler({ outputFormat: 'udon-bytecode' });
    expect(() => c.compile(makeComp(), '')).toThrow(/artifact contract must be confirmed/);
  });
});
