// @vitest-environment jsdom
/**
 * Studio's viewport (/create), its Preview tab and the share viewer build their
 * scene through useScenePipeline: HoloCompositionParser, then SceneIRCompiler.
 * The parser keeps an object written inside `scene "X" { ... }` on
 * composition.scenes, and the compiler never read scenes, so such a composition
 * rendered an empty viewport. These run the real hook on the real core, no mocks
 * (useScenePipeline.test.ts mocks @holoscript/core).
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useScenePipeline } from '../useScenePipeline';

// Studio's own cloud-fallback scene, as written in app/api/generate/route.ts
// (MOCK_SCENE_TEMPLATE).
const CLOUD_FALLBACK_SCENE = `composition "CloudFallbackScene" {
  scene "Main" {
    object "Placeholder" {
      position: [0, 1, 0]
      @glowing { intensity: 0.6 }
    }
  }
}`;

describe('useScenePipeline — objects written inside a scene block', () => {
  it("puts the object of Studio's cloud-fallback scene into the viewport tree", () => {
    const { result } = renderHook(() => useScenePipeline(CLOUD_FALLBACK_SCENE));
    expect(result.current.errors).toEqual([]);

    const meshes = (result.current.r3fTree?.children ?? []).filter((n) => n.type === 'mesh');
    expect(meshes.map((n) => n.id)).toEqual(['Placeholder']);
    expect(meshes[0].props.position).toEqual([0, 1, 0]);
    // @glowing reaches the node, and so does the emissive material it turns into.
    expect(meshes[0].props.glowing).toEqual({ intensity: 0.6 });
    expect(meshes[0].props.materialProps).toMatchObject({ emissive: expect.any(String) });
  });

  it('builds the scene objects in order, with the geometry each one was given', () => {
    const { result } = renderHook(() =>
      useScenePipeline(`composition "Room" {
  object "Floor" { geometry: "plane" }
  scene "Main" {
    object "Lamp" { geometry: "sphere" position: [0, 2, 0] }
    object "Desk" { geometry: "cube" position: [1, 0.5, 0] }
  }
}`)
    );
    expect(result.current.errors).toEqual([]);
    const meshes = (result.current.r3fTree?.children ?? []).filter((n) => n.type === 'mesh');
    expect(meshes.map((n) => [n.id, n.props.hsType])).toEqual([
      ['Floor', 'plane'],
      ['Lamp', 'sphere'],
      ['Desk', 'cube'],
    ]);
  });
});
