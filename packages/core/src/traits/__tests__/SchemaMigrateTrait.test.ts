/**
 * SchemaMigrateTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { schemaMigrateHandler } from '../SchemaMigrateTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __migrateState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { auto_rollback: true };

describe('SchemaMigrateTrait', () => {
  it('has name "schema_migrate"', () => {
    expect(schemaMigrateHandler.name).toBe('schema_migrate');
  });

  it('migrate:up increments version and emits migrate:applied', () => {
    const node = makeNode();
    schemaMigrateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    schemaMigrateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'migrate:up', version: 1,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('migrate:applied', { version: 1 });
  });

  it('migrate:down rolls back to previous version', () => {
    const node = makeNode();
    schemaMigrateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    schemaMigrateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'migrate:up', version: 2,
    } as never);
    schemaMigrateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'migrate:down',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('migrate:rolled_back', { version: 0 });
  });
});
