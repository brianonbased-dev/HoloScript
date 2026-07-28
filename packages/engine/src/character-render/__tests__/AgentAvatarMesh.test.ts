/**
 * AgentAvatarMesh pure-data tests — no GPU, fully headless (CI floor).
 *
 * Proves the procedural humanoid mesh + skinning math are structurally correct:
 * valid skinned geometry, bind pose ⇒ identity palette (the false case, G.GOLD.013), and a
 * shoulder rotation propagates down the arm chain via FK but leaves unrelated bones at bind.
 */
import { describe, it, expect } from 'vitest';
import {
  buildAgentAvatarMesh,
  computeBindWorld,
  computeInverseBind,
  computeJointPalette,
  colorForEntity,
  BONE_ORDER,
  JOINT_COUNT,
} from '../AgentAvatarMesh';
import { quatFromAxisAngle, IDENTITY4 } from '../skin-math';

function blockAt(palette: Float32Array, boneIndex: number): Float32Array {
  return palette.slice(boneIndex * 16, boneIndex * 16 + 16);
}
function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe('AgentAvatarMesh — procedural humanoid (pure data)', () => {
  it('builds valid skinned geometry bound to canonical bones', () => {
    const mesh = buildAgentAvatarMesh({ entityId: 'brittney' });
    expect(mesh.vertexCount).toBeGreaterThan(100);
    expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
    expect(mesh.normals.length).toBe(mesh.vertexCount * 3);
    expect(mesh.jointIndices.length).toBe(mesh.vertexCount);
    expect(mesh.jointWeights.length).toBe(mesh.vertexCount);
    expect(mesh.jointCount).toBe(JOINT_COUNT);

    // Every joint index addresses a real palette slot; every weight is the rigid 1.0.
    for (let i = 0; i < mesh.jointIndices.length; i++) {
      expect(mesh.jointIndices[i]).toBeLessThan(JOINT_COUNT);
      expect(mesh.jointWeights[i]).toBe(1);
    }
    // Every index addresses a real vertex.
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeLessThan(mesh.vertexCount);
    }
    // Vertically extended (a standing figure, not a blob): head above ~1.5m, feet near 0.
    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 1; i < mesh.positions.length; i += 3) {
      minY = Math.min(minY, mesh.positions[i]);
      maxY = Math.max(maxY, mesh.positions[i]);
    }
    expect(maxY).toBeGreaterThan(1.5);
    expect(minY).toBeLessThan(0.2);
  });

  it('bind pose ⇒ identity skin palette (the false case)', () => {
    const palette = computeJointPalette(new Map());
    const I = IDENTITY4();
    for (let b = 0; b < JOINT_COUNT; b++) {
      expect(maxAbsDiff(blockAt(palette, b), I)).toBeLessThan(1e-4);
    }
  });

  it('a shoulder rotation propagates down the arm chain but not to unrelated bones', () => {
    const bindWorld = computeBindWorld();
    const inverseBind = computeInverseBind(bindWorld);
    const pose = new Map([['left_upper_arm', quatFromAxisAngle(0, 0, 1, -1.2)]]);
    const palette = computeJointPalette(pose, bindWorld, inverseBind);
    const I = IDENTITY4();

    const upperArm = BONE_ORDER.indexOf('left_upper_arm');
    const hand = BONE_ORDER.indexOf('left_hand'); // descendant via forearm
    const rightFoot = BONE_ORDER.indexOf('right_foot'); // unrelated chain

    expect(maxAbsDiff(blockAt(palette, upperArm), I)).toBeGreaterThan(0.1);
    expect(maxAbsDiff(blockAt(palette, hand), I)).toBeGreaterThan(0.1); // FK propagation
    expect(maxAbsDiff(blockAt(palette, rightFoot), I)).toBeLessThan(1e-4); // untouched
  });

  it('entity colour is deterministic and id-specific (D.094)', () => {
    expect(colorForEntity('brittney')).toBe(colorForEntity('brittney'));
    expect(colorForEntity('brittney')).not.toBe(colorForEntity('agent-2'));
    expect(colorForEntity('brittney')).toBeGreaterThanOrEqual(0);
    expect(colorForEntity('brittney')).toBeLessThanOrEqual(0xffffff);
  });

  it('builds the opt-in neutral anatomical face as smooth native geometry', () => {
    const legacy = buildAgentAvatarMesh();
    const anatomical = buildAgentAvatarMesh({
      faceTopology: 'neutral-anatomical-v2',
      faceRadialSegments: 20,
      faceVerticalSegments: 14,
      faceTearline: true,
    });
    const headIndex = BONE_ORDER.indexOf('head');
    const headVertices = Array.from(anatomical.jointIndices).filter(
      (jointIndex) => jointIndex === headIndex
    ).length;
    let curvedNormalCount = 0;
    for (let vertex = 0; vertex < anatomical.vertexCount; vertex++) {
      if (anatomical.jointIndices[vertex] !== headIndex) continue;
      const offset = vertex * 3;
      const components = [
        Math.abs(anatomical.normals[offset]),
        Math.abs(anatomical.normals[offset + 1]),
        Math.abs(anatomical.normals[offset + 2]),
      ];
      if (components.filter((component) => component > 0.05).length >= 2) {
        curvedNormalCount++;
      }
    }

    expect(anatomical.vertexCount).toBeGreaterThan(legacy.vertexCount + 250);
    expect(headVertices).toBeGreaterThan(300);
    expect(curvedNormalCount).toBeGreaterThan(150);
    expect(anatomical.indices.length).toBeGreaterThan(legacy.indices.length);
  });
});
