import { describe, expect, it } from 'vitest';
import { SVGCompiler } from '../SVGCompiler';

/**
 * Regression tests for the 2026-07-03 SVGCompiler fix: it used to emit ONE dashed
 * placeholder box for the top-level object and ignore all nested geometry (a scene
 * authored under a container "Ship" { ... } rendered as an empty box). The fix makes
 * compileObject recurse into children, resolve the primitive from the `geometry`
 * property, size from the scale array, and rotate boxes by yaw.
 */
function obj(name: string, props: Record<string, unknown>, children: unknown[] = []) {
  return {
    type: 'Object',
    name,
    properties: Object.entries(props).map(([key, value]) => ({ type: 'ObjectProperty', key, value })),
    traits: [],
    directives: [],
    children,
  };
}
function composition(objects: unknown[]) {
  return { type: 'Composition', name: 'T', objects, lights: [], spatialGroups: [] };
}

describe('SVGCompiler — nested geometry projection', () => {
  it('recurses into child objects instead of rendering only the container', () => {
    const comp = composition([
      obj('Ship', {}, [
        obj('Wing', { geometry: 'cube', position: [-2, 0, 0], scale: [4, 0.1, 1] }),
        obj('Nose', { geometry: 'cone', position: [0, 0, 3], scale: [0.3, 1.7, 0.2] }),
        obj('Canopy', { geometry: 'sphere', position: [0, 0.3, 1.9], scale: [0.34, 0.26, 0.7] }),
      ]),
    ]);
    // agentToken '' bypasses RBAC (CompilerBase).
    const { svg, elements } = new SVGCompiler().compile(comp as never, '');
    expect(elements).toBeGreaterThanOrEqual(3);
    expect(svg).toContain('data-holo-object="Wing"');
    expect(svg).toContain('data-holo-object="Nose"');
    expect(svg).toContain('data-holo-object="Canopy"');
    // A pure container (no geometry, has children) emits no shape of its own.
    expect(svg).not.toContain('data-holo-object="Ship"');
  });

  it('resolves the primitive from the geometry property (cone → polygon, sphere → circle)', () => {
    const comp = composition([
      obj('N', { geometry: 'cone', position: [0, 0, 0], scale: [0.3, 1.7, 0.2] }),
      obj('C', { geometry: 'sphere', position: [1, 0, 0], scale: [0.5, 0.5, 0.5] }),
    ]);
    const { svg } = new SVGCompiler().compile(comp as never, '');
    expect(svg).toContain('<polygon'); // cone
    expect(svg).toContain('<circle'); // sphere
  });

  it('rotates a yaw-rotated box (the swept wing) via an SVG transform', () => {
    const comp = composition([obj('Wing', { geometry: 'cube', position: [0, 0, 0], scale: [4, 0.1, 1], rotation: [0, 22, 0] })]);
    const { svg } = new SVGCompiler().compile(comp as never, '');
    expect(svg).toContain('<rect');
    expect(svg).toContain('transform="rotate(');
  });

  it('sizes a box from the scale array rather than collapsing to unit size', () => {
    // background:false so the only <rect> is the box itself (not the viewport backdrop).
    const big = new SVGCompiler({ background: false }).compile(composition([obj('B', { geometry: 'cube', position: [0, 0, 0], scale: [8, 1, 1] })]) as never, '').svg;
    const small = new SVGCompiler({ background: false }).compile(composition([obj('B', { geometry: 'cube', position: [0, 0, 0], scale: [1, 1, 1] })]) as never, '').svg;
    const widthOf = (svg: string) => Number(svg.match(/<rect[^>]*width="([\d.]+)"/)?.[1] ?? 0);
    expect(widthOf(big)).toBeGreaterThan(widthOf(small) * 4);
  });
});
