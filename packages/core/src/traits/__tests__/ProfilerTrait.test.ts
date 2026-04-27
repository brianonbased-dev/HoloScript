/**
 * ProfilerTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { profilerHandler } from '../ProfilerTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __profilerState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_spans: 500, auto_report_interval_ms: 0 };

describe('ProfilerTrait', () => {
  it('has name "profiler"', () => {
    expect(profilerHandler.name).toBe('profiler');
  });

  it('profiler:start + profiler:end emits profiler:result with durationMs', () => {
    const node = makeNode();
    profilerHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    profilerHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'profiler:start', spanName: 'mySpan',
    } as never);
    profilerHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'profiler:end', spanName: 'mySpan',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('profiler:result', expect.objectContaining({
      spanName: 'mySpan',
    }));
  });

  it('profiler:report emits completed spans', () => {
    const node = makeNode();
    profilerHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    profilerHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'profiler:start', spanName: 's1',
    } as never);
    profilerHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'profiler:end', spanName: 's1',
    } as never);
    node.emit.mockClear();
    profilerHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'profiler:report',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('profiler:report', expect.objectContaining({
      spans: expect.any(Array),
    }));
  });
});
