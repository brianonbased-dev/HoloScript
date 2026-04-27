/**
 * InferenceTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { inferenceHandler } from '../InferenceTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __inferenceState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { timeout_ms: 30000, max_tokens: 4096 };

describe('InferenceTrait', () => {
  it('has name "inference"', () => {
    expect(inferenceHandler.name).toBe('inference');
  });

  it('defaultConfig timeout_ms=30000, max_tokens=4096', () => {
    expect(inferenceHandler.defaultConfig?.timeout_ms).toBe(30000);
    expect(inferenceHandler.defaultConfig?.max_tokens).toBe(4096);
  });

  it('onAttach initializes totalRuns=0', () => {
    const node = makeNode();
    inferenceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__inferenceState as { totalRuns: number };
    expect(state.totalRuns).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    inferenceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    inferenceHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__inferenceState).toBeUndefined();
  });

  it('inference:run emits inference:result with runNumber', () => {
    const node = makeNode();
    inferenceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    inferenceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'inference:run', modelId: 'gpt-mini', input: 'hello',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('inference:result', expect.objectContaining({
      modelId: 'gpt-mini', runNumber: 1,
    }));
  });

  it('increments totalRuns on each inference:run', () => {
    const node = makeNode();
    inferenceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    for (let i = 0; i < 3; i++) {
      inferenceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'inference:run', modelId: 'model', input: 'x',
      } as never);
    }
    expect((node.__inferenceState as { totalRuns: number }).totalRuns).toBe(3);
  });
});
