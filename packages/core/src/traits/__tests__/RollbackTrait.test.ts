/**
 * RollbackTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { rollbackHandler } from '../RollbackTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __rollbackState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_history: 20 };

describe('RollbackTrait', () => {
  it('has name "rollback"', () => {
    expect(rollbackHandler.name).toBe('rollback');
  });

  it('rollback:trigger emits rollback:complete', () => {
    const node = makeNode();
    rollbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rollbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rollback:trigger', deployId: 'd1', targetVersion: 'v1.2.0',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rollback:complete', { deployId: 'd1', rolledBackTo: 'v1.2.0' });
  });
});
