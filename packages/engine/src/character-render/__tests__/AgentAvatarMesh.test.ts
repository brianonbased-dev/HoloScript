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

  it('builds opt-in recessed eyelid shells with a receipted orbital range', () => {
    const tearline = buildAgentAvatarMesh({
      faceTopology: 'neutral-anatomical-v2',
      faceTearline: true,
    });
    const fitted = buildAgentAvatarMesh({
      faceTopology: 'neutral-anatomical-v2',
      faceTearline: true,
      orbitalProfile: 'recessed-lids-v1',
      eyeRecess: 0.3,
      lidOpening: 0.54,
      canthalTilt: 0.14,
    });

    expect(fitted.orbital).toMatchObject({
      profile: 'recessed-lids-v1',
      eyeRecess: 0.3,
      lidOpening: 0.54,
      canthalTilt: 0.14,
    });
    expect(fitted.orbital?.vertexRange.vertexCount).toBe(152);
    expect(fitted.orbital?.indexRange.indexCount).toBe(432);
    expect(fitted.vertexCount).toBeGreaterThan(tearline.vertexCount);

    const orbital = fitted.orbital!;
    const headIndex = BONE_ORDER.indexOf('head');
    for (
      let vertex = orbital.vertexRange.vertexStart;
      vertex < orbital.vertexRange.vertexStart + orbital.vertexRange.vertexCount;
      vertex++
    ) {
      expect(fitted.jointIndices[vertex]).toBe(headIndex);
      expect(fitted.jointWeights[vertex]).toBe(1);
    }
    for (
      let offset = orbital.indexRange.indexStart;
      offset < orbital.indexRange.indexStart + orbital.indexRange.indexCount;
      offset++
    ) {
      const vertex = fitted.indices[offset];
      expect(vertex).toBeGreaterThanOrEqual(orbital.vertexRange.vertexStart);
      expect(vertex).toBeLessThan(
        orbital.vertexRange.vertexStart + orbital.vertexRange.vertexCount
      );
    }
  });

  it('applies and receipts bounded neutral-face and upper-body proportions', () => {
    const baseline = buildAgentAvatarMesh({
      faceTopology: 'neutral-anatomical-v2',
    });
    const authored = buildAgentAvatarMesh({
      faceTopology: 'neutral-anatomical-v2',
      faceWidth: 0.94,
      faceLength: 1.08,
      jawTaper: 0.31,
      shoulderScale: 1.14,
      torsoScale: 0.93,
    });
    const spanForJoint = (mesh: typeof authored, bone: string) => {
      const joint = BONE_ORDER.indexOf(bone);
      let minX = Infinity;
      let maxX = -Infinity;
      for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
        if (mesh.jointIndices[vertex] !== joint) continue;
        minX = Math.min(minX, mesh.positions[vertex * 3]);
        maxX = Math.max(maxX, mesh.positions[vertex * 3]);
      }
      return maxX - minX;
    };

    expect(baseline.anatomy).toEqual({
      schemaVersion: 'holoscript.agent-avatar-anatomy.v1',
      faceWidth: 1,
      faceLength: 1,
      jawTaper: 0.22,
      shoulderScale: 1,
      torsoScale: 1,
    });
    expect(authored.anatomy).toEqual({
      schemaVersion: 'holoscript.agent-avatar-anatomy.v1',
      faceWidth: 0.94,
      faceLength: 1.08,
      jawTaper: 0.31,
      shoulderScale: 1.14,
      torsoScale: 0.93,
    });
    expect(Array.from(authored.positions)).not.toEqual(Array.from(baseline.positions));
    expect(spanForJoint(authored, 'head')).toBeLessThan(spanForJoint(baseline, 'head'));
    expect(spanForJoint(authored, 'left_upper_arm')).toBeGreaterThan(
      spanForJoint(baseline, 'left_upper_arm')
    );
    expect(spanForJoint(authored, 'spine')).toBeLessThan(spanForJoint(baseline, 'spine'));
  });

  it('builds one connected coherent torso-shoulder-neck surface with causal native evidence', () => {
    const legacy = buildAgentAvatarMesh({
      upperBodyProfile: 'legacy-segments-v1',
    });
    const coherent = buildAgentAvatarMesh({
      upperBodyProfile: 'coherent-shoulder-neck-torso-v1',
      upperBodyRadialSegments: 18,
      shoulderScale: 1.12,
      torsoScale: 0.96,
    });
    const receipt = coherent.anatomy.upperBody!;

    expect(legacy.anatomy.upperBody).toBeUndefined();
    expect(receipt).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-upper-body-geometry.v1',
      profile: 'coherent-shoulder-neck-torso-v1',
      radialSegments: 18,
      ringCount: 10,
      shoulderHalfWidth: 0.2688,
      waistHalfWidth: 0.1536,
      neckRadius: 0.054,
    });
    expect(receipt.vertexRange.vertexCount).toBe(receipt.radialSegments * receipt.ringCount);
    expect(receipt.indexRange.indexCount).toBe(
      receipt.radialSegments * (receipt.ringCount - 1) * 6
    );
    expect(coherent.vertexCount).not.toBe(legacy.vertexCount);

    let curvedNormalCount = 0;
    const admittedJoints = new Set(
      ['hips', 'spine', 'spine1', 'spine2', 'neck'].map((bone) => BONE_ORDER.indexOf(bone))
    );
    for (
      let vertex = receipt.vertexRange.vertexStart;
      vertex < receipt.vertexRange.vertexStart + receipt.vertexRange.vertexCount;
      vertex++
    ) {
      const offset = vertex * 3;
      const components = [
        Math.abs(coherent.normals[offset]),
        Math.abs(coherent.normals[offset + 1]),
        Math.abs(coherent.normals[offset + 2]),
      ];
      if (components.filter((component) => component > 0.05).length >= 2) {
        curvedNormalCount++;
      }
      expect(admittedJoints.has(coherent.jointIndices[vertex])).toBe(true);
      expect(coherent.jointWeights[vertex]).toBe(1);
    }
    expect(curvedNormalCount).toBeGreaterThan(receipt.vertexRange.vertexCount * 0.8);

    const adjacency = new Map<number, Set<number>>();
    const connect = (a: number, b: number) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    };
    for (
      let offset = receipt.indexRange.indexStart;
      offset < receipt.indexRange.indexStart + receipt.indexRange.indexCount;
      offset += 3
    ) {
      const triangle = [
        coherent.indices[offset],
        coherent.indices[offset + 1],
        coherent.indices[offset + 2],
      ];
      for (const vertex of triangle) {
        expect(vertex).toBeGreaterThanOrEqual(receipt.vertexRange.vertexStart);
        expect(vertex).toBeLessThan(
          receipt.vertexRange.vertexStart + receipt.vertexRange.vertexCount
        );
      }
      connect(triangle[0], triangle[1]);
      connect(triangle[1], triangle[2]);
      connect(triangle[2], triangle[0]);
    }
    const visited = new Set<number>();
    const queue = [receipt.vertexRange.vertexStart];
    while (queue.length > 0) {
      const vertex = queue.shift()!;
      if (visited.has(vertex)) continue;
      visited.add(vertex);
      for (const neighbor of adjacency.get(vertex) ?? []) queue.push(neighbor);
    }
    expect(visited.size).toBe(receipt.vertexRange.vertexCount);
  });
});
