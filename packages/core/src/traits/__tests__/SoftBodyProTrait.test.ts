/**
 * SoftBodyProTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { softBodyProHandler } from '../SoftBodyProTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  tear_threshold: 0.8, tear_color: '#8b0000', solver_iterations: 10,
  compliance: 0.001, self_collision: true, damping: 0.99,
};

describe('SoftBodyProTrait', () => {
  it('has name "soft_body_pro"', () => {
    expect(softBodyProHandler.name).toBe('soft_body_pro');
  });

  it('onAttach emits soft_body_pro_create', () => {
    const node = makeNode();
    softBodyProHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('soft_body_pro_create', expect.objectContaining({ tearThreshold: 0.8 }));
  });
});
