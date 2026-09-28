/**
 * iOS draws the shape a scene names and sizes it the way Quest does.
 *
 * compile_to_ios used to read the shape from mesh/type only, so the common
 * `geometry: "sphere"` came out a box, and it built a fixed 0.1 m base with node.scale set to
 * the scale, so an object of scale s was 0.1*s across, ten times smaller than on Quest, the
 * web and Android (board task_1790563586994_5f34). This compiles one source through the iOS
 * and Quest emitters and compares the sizes they write.
 */
import { describe, it, expect, vi } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { IOSCompiler } from '../IOSCompiler';
import { emitWorldSceneKt } from '../quest-world-emit';

// The compiler's agent-token check is not what this file tests (NativeCompilerFidelity does the same).
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function parse(src: string): HoloComposition {
  const r = new HoloCompositionParser().parse(src);
  if (!r.success || !r.ast) {
    throw new Error('parse failed: ' + JSON.stringify(r.errors));
  }
  return r.ast;
}

const SCENE = `composition "IosSizeParity" {
  object "Ball" {
    geometry: "sphere"
    scale: 0.3
    position: [0, 1, -1]
  }
  object "Crate" {
    geometry: "cube"
    scale: [0.2, 0.4, 0.6]
    position: [1, 1, -1]
  }
  object "Post" {
    geometry: "cylinder"
    scale: [0.2, 0.5, 0.2]
    position: [2, 1, -1]
  }
  object "Pebble" {
    geometry: "sphere"
    position: [3, 1, -1]
  }
}`;

/** The body of `static func make<name>()` in iOS's scene file. */
function iosFactory(swift: string, name: string): string {
  const start = swift.indexOf(`static func make${name}()`);
  expect(start, `make${name}() is emitted`).toBeGreaterThanOrEqual(0);
  const next = swift.indexOf('static func ', start + 1);
  return swift.slice(start, next === -1 ? undefined : next);
}

/** Every Quest `Box(min, max)` as its full [width, height, depth]. */
function questBoxes(kotlin: string): number[][] {
  const re =
    /Box\(Vector3\((-?[\d.]+)f, (-?[\d.]+)f, (-?[\d.]+)f\), Vector3\((-?[\d.]+)f, (-?[\d.]+)f, (-?[\d.]+)f\)\)/g;
  return [...kotlin.matchAll(re)].map((m) => [4, 5, 6].map((i) => Number(m[i]) * 2));
}

describe('iOS shapes: the geometry key, and sizes that match Quest', () => {
  const composition = parse(SCENE);
  const swift = new IOSCompiler().compile(composition, 'test-token').sceneFile;
  const quest = emitWorldSceneKt(composition, 'ios-size-parity');

  it('reads geometry: a sphere is a sphere, a cylinder a cylinder', () => {
    expect(iosFactory(swift, 'Ball')).toContain('SCNSphere(');
    expect(iosFactory(swift, 'Ball')).not.toContain('SCNBox(');
    expect(iosFactory(swift, 'Post')).toContain('SCNCylinder(');
  });

  it('a sphere has the same radius as on Quest', () => {
    const questRadius = Number(/Sphere\((-?[\d.]+)f\)/.exec(quest)?.[1]);
    expect(questRadius).toBeCloseTo(0.15, 6);
    const iosRadius = Number(/SCNSphere\(radius: (-?[\d.]+)\)/.exec(iosFactory(swift, 'Ball'))?.[1]);
    expect(iosRadius).toBeCloseTo(questRadius, 6);
  });

  it('a box has the same width, height and depth as on Quest', () => {
    const m = /SCNBox\(width: ([\d.]+), height: ([\d.]+), length: ([\d.]+)/.exec(iosFactory(swift, 'Crate'));
    expect(m, 'Crate is an SCNBox').not.toBeNull();
    const ios = [1, 2, 3].map((i) => Number(m![i]));
    expect(ios).toEqual([0.2, 0.4, 0.6]);
    const match = questBoxes(quest).find(
      (b) => Math.abs(b[0] - 0.2) < 1e-6 && Math.abs(b[1] - 0.4) < 1e-6 && Math.abs(b[2] - 0.6) < 1e-6
    );
    expect(match, `Quest drew the crate 0.2 x 0.4 x 0.6: ${JSON.stringify(questBoxes(quest))}`).toBeDefined();
  });

  it('a cylinder is as wide and as tall as Quest draws it', () => {
    const m = /SCNCylinder\(radius: ([\d.]+), height: ([\d.]+)\)/.exec(iosFactory(swift, 'Post'));
    expect(m, 'Post is an SCNCylinder').not.toBeNull();
    const [width, height] = [Number(m![1]) * 2, Number(m![2])];
    // Quest has no cylinder primitive and draws a box of the same footprint and height.
    const match = questBoxes(quest).find(
      (b) => Math.abs(b[0] - width) < 1e-6 && Math.abs(b[1] - height) < 1e-6
    );
    expect(match, `Quest drew a ${width} x ${height} box for the post`).toBeDefined();
    expect(width).toBeCloseTo(0.2, 6);
    expect(height).toBeCloseTo(0.5, 6);
  });

  it('the size lives in the geometry: no node.scale, and no scale keeps the 0.1 m default', () => {
    for (const name of ['Ball', 'Crate', 'Post', 'Pebble']) {
      expect(iosFactory(swift, name), `make${name}`).not.toContain('node.scale');
    }
    expect(iosFactory(swift, 'Pebble')).toContain('SCNSphere(radius: 0.05)');
  });
});
