/**
 * OrmEntityTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { ormEntityHandler } from '../OrmEntityTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __ormState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { table_prefix: '' };

describe('OrmEntityTrait', () => {
  it('has name "orm_entity"', () => {
    expect(ormEntityHandler.name).toBe('orm_entity');
  });

  it('orm:create stores entity and emits orm:created', () => {
    const node = makeNode();
    ormEntityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    ormEntityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'orm:create', entityId: 'e1', data: { name: 'Alice' },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('orm:created', { entityId: 'e1', total: 1 });
  });

  it('orm:read emits orm:found with entity data', () => {
    const node = makeNode();
    ormEntityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    ormEntityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'orm:create', entityId: 'e1', data: { name: 'Bob' },
    } as never);
    node.emit.mockClear();
    ormEntityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'orm:read', entityId: 'e1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('orm:found', expect.objectContaining({ exists: true }));
  });

  it('orm:delete removes entity and emits orm:deleted', () => {
    const node = makeNode();
    ormEntityHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    ormEntityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'orm:create', entityId: 'del1', data: {},
    } as never);
    node.emit.mockClear();
    ormEntityHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'orm:delete', entityId: 'del1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('orm:deleted', { entityId: 'del1' });
  });
});
