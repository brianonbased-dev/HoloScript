/**
 * PipelineTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { pipelineHandler } from '../PipelineTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __pipelineState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  pipeline_id: 'p1',
  steps: [],
  mode: 'sequential' as const,
  halt_on_error: true,
  auto_start: false,
};

describe('PipelineTrait', () => {
  it('has name "pipeline"', () => {
    expect(pipelineHandler.name).toBe('pipeline');
  });

  it('defaultConfig mode="sequential"', () => {
    expect(pipelineHandler.defaultConfig?.mode).toBe('sequential');
  });

  it('onAttach initializes running=false', () => {
    const node = makeNode();
    pipelineHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__pipelineState as { running: boolean };
    expect(state.running).toBe(false);
  });

  it('pipeline:run emits pipeline:start', () => {
    const node = makeNode();
    pipelineHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    pipelineHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'pipeline:run',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('pipeline:start', expect.objectContaining({
      pipelineId: 'p1',
    }));
  });
});
