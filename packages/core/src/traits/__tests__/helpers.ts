
import { vi } from 'vitest';
import type { TraitContext } from '../TraitTypes';
import { createMockContext } from './traitTestHelpers';

export function makeTestContext(overrides: Partial<any> = {}): TraitContext {
  const base = createMockContext();
  
  const createDeepMock = () => {
    const fn = vi.fn();
    return new Proxy(fn, {
      get: (target, prop) => {
        if (prop === 'then') return undefined; // Promise chaining
        if (typeof prop === 'symbol') return undefined;
        if (prop in target) return (target as any)[prop];
        (target as any)[prop] = createDeepMock();
        return (target as any)[prop];
      }
    });
  };

  const ctx = {
    ...base,
    vr: overrides.vr || createDeepMock(),
    physics: overrides.physics || createDeepMock(),
    audio: overrides.audio || createDeepMock(),
    haptics: overrides.haptics || createDeepMock(),
    accessibility: overrides.accessibility || createDeepMock(),
    worldStore: overrides.worldStore || createDeepMock(),
    ...overrides
  };
  return ctx as unknown as TraitContext;
}
