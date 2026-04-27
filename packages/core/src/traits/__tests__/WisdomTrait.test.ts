/**
 * WisdomTrait — tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wisdomHandler, clearWisdomRegistry } from '../WisdomTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  description: 'Test wisdom insight', source: 'community',
  applies_to: ['grabbable'], examples: [],
};

describe('WisdomTrait', () => {
  beforeEach(() => clearWisdomRegistry());

  it('has name "wisdom"', () => {
    expect(wisdomHandler.name).toBe('wisdom');
  });

  it('onAttach emits wisdom_registered', () => {
    const node = makeNode();
    wisdomHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('wisdom_registered', expect.objectContaining({ description: 'Test wisdom insight' }));
  });
});
