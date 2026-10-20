/**
 * Round shapes are the same size on Android and Quest for the same scale.
 *
 * Android's AR emitter used to pass the scale itself as SceneView's radius, and twice the
 * scale as a cylinder's height, so spheres and cylinders came out twice as big as on Quest
 * for the same scene (board task_1790546202171_uysm). Quest (quest-world-emit.ts) sizes a
 * sphere `Sphere(0.5 * sx)` and draws a cylinder as a box sx wide and sy tall. This compiles
 * one source through both emitters and compares the numbers they write.
 */
import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { AndroidCompiler } from '../AndroidCompiler';
import { emitWorldSceneKt } from '../quest-world-emit';

function parse(src: string): HoloComposition {
  const r = new HoloCompositionParser().parse(src);
  if (!r.success || !r.ast) {
    throw new Error('parse failed: ' + JSON.stringify(r.errors));
  }
  return r.ast;
}

const SCENE = `composition "SizeParity" {
  object "Ball" {
    geometry: "sphere"
    scale: 0.3
    position: [0, 1, -1]
  }
  object "Post" {
    geometry: "cylinder"
    scale: [0.2, 0.5, 0.2]
    position: [1, 1, -1]
  }
}`;

/** A named Float argument of the first `<node>(` call in Android's activity file. */
function androidArg(kotlin: string, node: 'SphereNode' | 'CylinderNode', name: string): number {
  const start = kotlin.indexOf(`${node}(`);
  expect(start, `${node}( is emitted`).toBeGreaterThanOrEqual(0);
  // Arguments follow the node line directly, so the first match after it is this node's.
  const m = new RegExp(`^\\s*${name}\\s*=\\s*(-?[\\d.]+)f,`, 'm').exec(kotlin.slice(start));
  expect(m, `${node} has a ${name} argument`).not.toBeNull();
  return Number(m![1]);
}

describe('round shapes: Android and Quest agree on size', () => {
  const composition = parse(SCENE);
  const android = new AndroidCompiler().compile(composition).activityFile;
  const quest = emitWorldSceneKt(composition, 'size-parity');

  it('a sphere has the same radius on both', () => {
    const questRadius = Number(/Sphere\((-?[\d.]+)f\)/.exec(quest)?.[1]);
    expect(questRadius).toBeCloseTo(0.15, 6);
    expect(androidArg(android, 'SphereNode', 'radius')).toBeCloseTo(questRadius, 6);
  });

  it('a cylinder is as wide and as tall as Quest draws it', () => {
    // Quest has no cylinder primitive: it draws Box(min, max) with max = +size/2 on each axis.
    // The sphere is not a box, so the only Box in this scene is the cylinder's.
    const box = /Box\(Vector3\((-?[\d.]+)f, (-?[\d.]+)f, (-?[\d.]+)f\), Vector3\((-?[\d.]+)f, (-?[\d.]+)f, (-?[\d.]+)f\)\)/.exec(
      quest
    );
    expect(box, 'Quest emitted the cylinder as a box').not.toBeNull();
    const questWidth = Number(box![4]) * 2;
    const questHeight = Number(box![5]) * 2;

    const radius = androidArg(android, 'CylinderNode', 'radius');
    const height = androidArg(android, 'CylinderNode', 'height');
    expect(radius * 2).toBeCloseTo(questWidth, 6);
    expect(height).toBeCloseTo(questHeight, 6);
    expect(radius).toBeCloseTo(0.1, 6);
    expect(height).toBeCloseTo(0.5, 6);
  });
});
