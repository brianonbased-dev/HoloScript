/**
 * StructuredLoggerTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { structuredLoggerHandler } from '../StructuredLoggerTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __structuredLoggerState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  min_level: 'info' as const, max_entries: 1000, rotation_count: 200,
  emit_events: true, console_output: false, default_fields: {},
};

describe('StructuredLoggerTrait', () => {
  it('has name "structured_logger"', () => {
    expect(structuredLoggerHandler.name).toBe('structured_logger');
  });

  it('logger:info emits logger:entry', () => {
    const node = makeNode();
    structuredLoggerHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    structuredLoggerHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'logger:info', message: 'hello',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('logger:entry', expect.objectContaining({ level: 'info', message: 'hello' }));
  });
});
