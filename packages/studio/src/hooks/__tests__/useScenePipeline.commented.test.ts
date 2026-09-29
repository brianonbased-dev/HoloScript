// @vitest-environment jsdom
/**
 * Most .holo files open with a comment. Studio's viewport hook (the /create
 * viewport, the Preview tab, the WebXR and share viewers) used to hand text to the
 * composition parser only when it literally began with `composition`, so a
 * commented composition went to the .hsplus parser. That parser cannot read a
 * named `directional_light` block, so the viewport showed an error instead of the
 * scene. .hsplus has composition blocks too, so the last case checks that a
 * commented .hsplus composition still draws. These run the real hook on the real
 * core, with no mocks (useScenePipeline.test.ts mocks @holoscript/core).
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HoloCompositionParser, HoloScriptPlusParser } from '@holoscript/core';
import { useScenePipeline } from '../useScenePipeline';

const COMMENTED_ROOM = `// A room with one lamp, lit by the sun.
/* Most .holo files in this repo open with a comment,
   so this is the ordinary case, not an edge case. */

composition "CommentedRoom" {
  directional_light "Sun" {
    intensity: 1.2
    position: [5, 10, 5]
  }

  object "Lamp" {
    geometry: "sphere"
    position: [0, 2, 0]
  }
}
`;

describe('useScenePipeline — a composition that opens with comments', () => {
  it('draws the lamp and the sun instead of an error', () => {
    const { result } = renderHook(() => useScenePipeline(COMMENTED_ROOM));
    expect(result.current.errors).toEqual([]);

    const tree = result.current.r3fTree;
    expect(tree?.id).toBe('CommentedRoom');
    const children = tree?.children ?? [];
    expect(children.filter((n) => n.type === 'mesh').map((n) => [n.id, n.props.position])).toEqual([
      ['Lamp', [0, 2, 0]],
    ]);
    expect(children.filter((n) => n.type === 'directionalLight').map((n) => n.id)).toEqual(['Sun']);
  });

  it('reads it with the composition parser, not the .hsplus parser', () => {
    const composition = vi.spyOn(HoloCompositionParser.prototype, 'parse');
    const hsplus = vi.spyOn(HoloScriptPlusParser.prototype, 'parse');

    renderHook(() => useScenePipeline(COMMENTED_ROOM));

    expect(composition).toHaveBeenCalledTimes(1);
    expect(hsplus).not.toHaveBeenCalled();
  });

  it('builds the same tree as when the caller says the text is .holo', () => {
    const auto = renderHook(() => useScenePipeline(COMMENTED_ROOM)).result.current;
    const holo = renderHook(() => useScenePipeline(COMMENTED_ROOM, { formatHint: 'holo' })).result
      .current;
    expect(auto).toEqual(holo);
  });

  it('still reads commented .hsplus that mentions composition with the .hsplus parser', () => {
    const composition = vi.spyOn(HoloCompositionParser.prototype, 'parse');
    const hsplus = vi.spyOn(HoloScriptPlusParser.prototype, 'parse');

    const { result } = renderHook(() =>
      useScenePipeline(`// Not a composition, though this comment says composition.
orb lamp {
  position: [0, 2, 0]
}
`)
    );

    expect(hsplus).toHaveBeenCalledTimes(1);
    expect(composition).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual([]);
  });

  it('still draws a commented .hsplus composition that the composition parser cannot read', () => {
    // .hsplus has composition blocks too; an arrow-function handler is .hsplus-only syntax.
    const { result } = renderHook(() =>
      useScenePipeline(`// A lamp you can click. This is .hsplus, not .holo.
composition "ClickLamp" {
  object "Lamp" {
    geometry: "sphere"
    position: [0, 2, 0]
    onClick: () => {
      state.lit = true
    }
  }
}
`)
    );

    expect(result.current.errors).toEqual([]);
    const meshes = (result.current.r3fTree?.children ?? []).filter((n) => n.type === 'mesh');
    expect(meshes.map((n) => n.id)).toEqual(['Lamp']);
  });
});
