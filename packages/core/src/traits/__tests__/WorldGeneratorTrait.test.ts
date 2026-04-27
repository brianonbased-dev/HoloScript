/**
 * WorldGeneratorTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { worldGeneratorHandler } from '../WorldGeneratorTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __worldGeneratorState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  prompt: '', engine: 'sovereign-3d' as const, format: '3dgs' as const,
  quality: 'medium' as const, auto_render: false,
};

describe('WorldGeneratorTrait', () => {
  it('has name "world_generator"', () => {
    expect(worldGeneratorHandler.name).toBe('world_generator');
  });

  it('onAttach sets isGenerating to false', () => {
    const node = makeNode();
    worldGeneratorHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__worldGeneratorState as { isGenerating: boolean };
    expect(state.isGenerating).toBe(false);
  });
});
