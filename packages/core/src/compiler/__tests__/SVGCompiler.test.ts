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
    properties: Object.entries(props).map(([key, value]) => ({
      type: 'ObjectProperty',
      key,
      value,
    })),
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
    const comp = composition([
      obj('Wing', {
        geometry: 'cube',
        position: [0, 0, 0],
        scale: [4, 0.1, 1],
        rotation: [0, 22, 0],
      }),
    ]);
    const { svg } = new SVGCompiler().compile(comp as never, '');
    expect(svg).toContain('<rect');
    expect(svg).toContain('transform="rotate(');
  });

  it('sizes a box from the scale array rather than collapsing to unit size', () => {
    // background:false so the only <rect> is the box itself (not the viewport backdrop).
    const big = new SVGCompiler({ background: false }).compile(
      composition([obj('B', { geometry: 'cube', position: [0, 0, 0], scale: [8, 1, 1] })]) as never,
      ''
    ).svg;
    const small = new SVGCompiler({ background: false }).compile(
      composition([obj('B', { geometry: 'cube', position: [0, 0, 0], scale: [1, 1, 1] })]) as never,
      ''
    ).svg;
    const widthOf = (svg: string) => Number(svg.match(/<rect[^>]*width="([\d.]+)"/)?.[1] ?? 0);
    expect(widthOf(big)).toBeGreaterThan(widthOf(small) * 4);
  });

  it('accumulates parent scale into child SIZE (a nested part sizes to its parent)', () => {
    const widthOf = (svg: string) => Number(svg.match(/<rect[^>]*width="([\d.]+)"/)?.[1] ?? 0);
    // Same leaf box, once under a 3x-scaled container, once at top level.
    const nested = new SVGCompiler({ background: false }).compile(
      composition([
        obj('P', { scale: [3, 1, 3] }, [
          obj('C', { geometry: 'cube', position: [0, 0, 0], scale: [1, 0.1, 1] }),
        ]),
      ]) as never,
      ''
    ).svg;
    const flat = new SVGCompiler({ background: false }).compile(
      composition([
        obj('C', { geometry: 'cube', position: [0, 0, 0], scale: [1, 0.1, 1] }),
      ]) as never,
      ''
    ).svg;
    expect(widthOf(nested)).toBeCloseTo(widthOf(flat) * 3, 0);
  });

  it('does NOT scale child POSITION by parent scale (world-authored offsets)', () => {
    // A child at x=1.6 under a 4x-scaled parent must stay at world x≈1.6 (svg 464),
    // not be flung to x=6.4 (svg 656). Default origin 400, scale 40.
    const svg = new SVGCompiler({ background: false }).compile(
      composition([
        obj('P', { scale: [4, 1, 1] }, [
          obj('C', { geometry: 'sphere', position: [1.6, 0, 0], scale: [0.1, 0.1, 0.1] }),
        ]),
      ]) as never,
      ''
    ).svg;
    const cx = Number(svg.match(/<circle cx="([\d.]+)"/)?.[1] ?? 0);
    expect(cx).toBeCloseTo(464, 0);
  });
});

describe('SVGCompiler — decision-network cognition surface', () => {
  it('renders a receipt-bound node: label + receipt text ride on the shape', () => {
    const svg = new SVGCompiler({ background: false }).compile(
      composition([
        obj('N', {
          geometry: 'box',
          position: [0, 0, 0],
          scale: [4, 1, 1.4],
          label: 'Material realism',
          receipt: 'commit 5ecb0d48b',
        }),
      ]) as never,
      ''
    ).svg;
    expect(svg).toContain('>Material realism<'); // label
    expect(svg).toContain('>commit 5ecb0d48b<'); // receipt rides on the node
  });

  it('renders an edge between two named nodes as an arrowed line (source/target)', () => {
    const svg = new SVGCompiler({ background: false }).compile(
      composition([
        obj('A', { geometry: 'box', position: [0, 0, -2], scale: [4, 1, 1] }),
        obj('B', { geometry: 'box', position: [0, 0, 2], scale: [4, 1, 1] }),
        obj('e', { geometry: 'edge', source: 'A', target: 'B' }),
      ]) as never,
      ''
    ).svg;
    expect(svg).toContain('marker-end="url(#holo-arrow)"');
    expect(svg).toContain('data-holo-edge="A-&gt;B"');
    expect(svg).not.toContain('endpoint not found'); // both endpoints resolved
  });

  it('an edge to a missing node fails visibly (a comment), never a silent skip', () => {
    const svg = new SVGCompiler({ background: false }).compile(
      composition([
        obj('A', { geometry: 'box', position: [0, 0, 0], scale: [4, 1, 1] }),
        obj('e', { geometry: 'edge', source: 'A', target: 'Ghost' }),
      ]) as never,
      ''
    ).svg;
    expect(svg).toContain('endpoint not found');
  });
});
