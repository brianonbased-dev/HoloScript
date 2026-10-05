// @vitest-environment jsdom
/**
 * Studio's viewport (/create), its Preview tab and the share viewer build their
 * scene through useScenePipeline: HoloCompositionParser, then SceneIRCompiler.
 * compileComposition used to drop three things the older .hsplus reading drew:
 * the bloom of a post_processing block (Studio's PostProcessingNode draws an
 * EffectComposer node), the Environment node of an environment block without a
 * skybox (without one, SceneRenderer swaps in its "apartment" lighting), and the
 * objects inside a group block. These run the real hook on the real core, no
 * mocks (useScenePipeline.test.ts mocks @holoscript/core).
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useScenePipeline } from '../useScenePipeline';

const GLOWING_ROOM = `composition "GlowingRoom" {
  environment {
    backgroundColor: "#101018"
    shadows: true
  }

  group "Shelf" {
    position: [0, 1, 0]
    object "BookA" { geometry: "cube" position: [0.5, 0, 0] }
    object "BookB" { geometry: "cube" position: [-0.5, 0, 0] }
  }

  object "Lamp" { geometry: "sphere" position: [0, 2, 0] }

  post_processing {
    bloom: { intensity: 0.6, threshold: 0.8 }
  }
}`;

describe('useScenePipeline — post-processing, lighting and group blocks', () => {
  it('keeps the glow, the lighting and the grouped objects of a composition', () => {
    const { result } = renderHook(() => useScenePipeline(GLOWING_ROOM));
    expect(result.current.errors).toEqual([]);
    const top = result.current.r3fTree?.children ?? [];

    // Glow: one EffectComposer holding the block's bloom.
    const composers = top.filter((n) => n.type === 'EffectComposer');
    expect(composers).toHaveLength(1);
    expect(composers[0].children?.map((e) => [e.type, e.props])).toEqual([
      ['Bloom', { intensity: 0.6, threshold: 0.8 }],
    ]);

    // Lighting: an Environment node at the top, so the viewport renders it (the
    // "studio" preset) instead of adding its own "apartment" fallback.
    expect(top.filter((n) => n.type === 'Environment')).toHaveLength(1);

    // Grouped objects: inside the Shelf group, which carries the position.
    const shelf = top.find((n) => n.id === 'Shelf');
    expect(shelf?.type).toBe('group');
    expect(shelf?.props.position).toEqual([0, 1, 0]);
    expect(shelf?.children?.map((n) => [n.id, n.type, n.props.position])).toEqual([
      ['BookA', 'mesh', [0.5, 0, 0]],
      ['BookB', 'mesh', [-0.5, 0, 0]],
    ]);
    expect(top.some((n) => n.id === 'Lamp' && n.type === 'mesh')).toBe(true);
  });
});
