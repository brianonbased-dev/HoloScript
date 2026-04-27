/**
 * SqlQueryTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { sqlQueryHandler } from '../SqlQueryTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __sqlState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_results: 1000 };

describe('SqlQueryTrait', () => {
  it('has name "sql_query"', () => {
    expect(sqlQueryHandler.name).toBe('sql_query');
  });

  it('sql:exec emits sql:result', () => {
    const node = makeNode();
    sqlQueryHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    sqlQueryHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sql:exec', query: 'SELECT 1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sql:result', expect.objectContaining({ queryCount: 1 }));
  });
});
