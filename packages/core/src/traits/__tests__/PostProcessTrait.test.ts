/**
 * PostProcessTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { postProcessHandler } from '../PostProcessTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __ppState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_effects: 16 };

describe('PostProcessTrait', () => {
  it('has name "post_process"', () => {
    expect(postProcessHandler.name).toBe('post_process');
  });

  it('pp:add emits pp:added', () => {
    const node = makeNode();
    postProcessHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    postProcessHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'pp:add', effectName: 'bloom', intensity: 0.8,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('pp:added', { effectName: 'bloom', total: 1 });
  });
});
