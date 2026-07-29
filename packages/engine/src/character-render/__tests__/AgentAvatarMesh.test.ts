/**
 * AgentAvatarMesh pure-data tests — no GPU, fully headless (CI floor).
 *
 * Proves the procedural humanoid mesh + skinning math are structurally correct:
 * valid skinned geometry, bind pose ⇒ identity palette (the false case, G.GOLD.013), and a
 * shoulder rotation propagates down the arm chain via FK but leaves unrelated bones at bind.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
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
function sha256(view: ArrayBufferView): string {
  return createHash('sha256')
    .update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .digest('hex');
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

  it('extends the coherent body into continuous curved arm-to-palm surfaces', () => {
    const legacy = buildAgentAvatarMesh({
      upperBodyProfile: 'legacy-segments-v1',
    });
    const coherent = buildAgentAvatarMesh({
      upperBodyProfile: 'coherent-shoulder-neck-torso-v1',
      upperBodyRadialSegments: 20,
      shoulderScale: 1.1,
      torsoScale: 0.96,
    });
    const upperBody = coherent.anatomy.upperBody!;

    expect(legacy.anatomy.upperBody).toBeUndefined();
    expect(upperBody.upperLimbs).toHaveLength(2);
    expect(upperBody.upperLimbs.map((limb) => limb.side)).toEqual(['left', 'right']);

    for (const limb of upperBody.upperLimbs) {
      expect(limb).toMatchObject({
        schemaVersion: 'holoscript.agent-avatar-upper-limb-geometry.v1',
        profile: 'coherent-arm-palm-v1',
        radialSegments: 20,
        ringCount: 8,
        shoulderRadius: 0.0715,
        wristRadius: 0.0385,
        palmHalfWidth: 0.0528,
      });
      expect(limb.vertexRange.vertexCount).toBe(limb.radialSegments * limb.ringCount + 1);
      expect(limb.indexRange.indexCount).toBe(
        limb.radialSegments * (limb.ringCount - 1) * 6 + limb.radialSegments * 3
      );

      const adjacency = new Map<number, Set<number>>();
      const connect = (a: number, b: number) => {
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a)!.add(b);
        adjacency.get(b)!.add(a);
      };
      for (
        let offset = limb.indexRange.indexStart;
        offset < limb.indexRange.indexStart + limb.indexRange.indexCount;
        offset += 3
      ) {
        const triangle = [
          coherent.indices[offset],
          coherent.indices[offset + 1],
          coherent.indices[offset + 2],
        ];
        for (const vertex of triangle) {
          expect(vertex).toBeGreaterThanOrEqual(limb.vertexRange.vertexStart);
          expect(vertex).toBeLessThan(limb.vertexRange.vertexStart + limb.vertexRange.vertexCount);
        }
        connect(triangle[0], triangle[1]);
        connect(triangle[1], triangle[2]);
        connect(triangle[2], triangle[0]);
      }

      const visited = new Set<number>();
      const queue = [limb.vertexRange.vertexStart];
      while (queue.length > 0) {
        const vertex = queue.shift()!;
        if (visited.has(vertex)) continue;
        visited.add(vertex);
        for (const neighbor of adjacency.get(vertex) ?? []) queue.push(neighbor);
      }
      expect(visited.size).toBe(limb.vertexRange.vertexCount);

      const allowedBones = new Set(
        [
          'spine2',
          `${limb.side}_shoulder`,
          `${limb.side}_upper_arm`,
          `${limb.side}_forearm`,
          `${limb.side}_hand`,
        ].map((bone) => BONE_ORDER.indexOf(bone))
      );
      let curvedNormalCount = 0;
      for (
        let vertex = limb.vertexRange.vertexStart;
        vertex < limb.vertexRange.vertexStart + limb.vertexRange.vertexCount - 1;
        vertex++
      ) {
        const offset = vertex * 3;
        const y = Math.abs(coherent.normals[offset + 1]);
        const z = Math.abs(coherent.normals[offset + 2]);
        if (y > 0.05 && z > 0.05) curvedNormalCount++;
        expect(allowedBones.has(coherent.jointIndices[vertex])).toBe(true);
        expect(coherent.jointWeights[vertex]).toBe(1);
      }
      expect(curvedNormalCount).toBeGreaterThan((limb.vertexRange.vertexCount - 1) * 0.75);
    }
  });

  it('emits an anatomical deltoid transition and five articulated digits per hand in v2', () => {
    const anatomical = buildAgentAvatarMesh({
      upperBodyProfile: 'coherent-anatomical-limbs-v2',
      upperBodyRadialSegments: 24,
      shoulderScale: 1.1,
      torsoScale: 0.96,
    });
    const repeated = buildAgentAvatarMesh({
      upperBodyProfile: 'coherent-anatomical-limbs-v2',
      upperBodyRadialSegments: 24,
      shoulderScale: 1.1,
      torsoScale: 0.96,
    });
    const upperBody = anatomical.anatomy.upperBody!;

    expect(upperBody).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-upper-body-geometry.v1',
      profile: 'anatomical-shoulder-neck-torso-v2',
      radialSegments: 24,
      ringCount: 12,
    });
    expect(upperBody.vertexRange.vertexCount).toBe(24 * 12);
    expect(upperBody.indexRange.indexCount).toBe(24 * 11 * 6);
    expect(Array.from(anatomical.positions)).toEqual(Array.from(repeated.positions));
    expect(Array.from(anatomical.indices)).toEqual(Array.from(repeated.indices));

    for (const limb of upperBody.upperLimbs) {
      expect(limb).toMatchObject({
        schemaVersion: 'holoscript.agent-avatar-upper-limb-geometry.v1',
        profile: 'anatomical-deltoid-hand-v2',
        radialSegments: 24,
        ringCount: 9,
        deltoidBlendRingCount: 3,
        connectedSurfaceCount: 6,
      });
      expect(limb.shoulderOverlapDepth).toBeGreaterThan(0.02);
      expect(limb.vertexRange.vertexCount).toBe(24 * 9 + 1);
      expect(limb.indexRange.indexCount).toBe(24 * 8 * 6 + 24 * 3);
      expect(limb.digits?.map((digit) => digit.digit)).toEqual([
        'thumb',
        'index',
        'middle',
        'ring',
        'pinky',
      ]);

      const tipDepths = new Set<number>();
      for (const digit of limb.digits ?? []) {
        expect(digit).toMatchObject({
          schemaVersion: 'holoscript.agent-avatar-digit-geometry.v1',
          profile: 'articulated-three-phalanx-v1',
          side: limb.side,
          radialSegments: 8,
          ringCount: 5,
          phalanxSegmentCount: 3,
          webBlendRingCount: 1,
        });
        expect(digit.vertexRange.vertexCount).toBe(8 * 5 + 1);
        expect(digit.indexRange.indexCount).toBe(8 * 4 * 6 + 8 * 3);
        expect(digit.tipRadius).toBeLessThan(digit.baseRadius);

        const start = digit.vertexRange.vertexStart;
        const end = start + digit.vertexRange.vertexCount;
        const adjacency = new Map<number, Set<number>>();
        const connect = (a: number, b: number) => {
          if (!adjacency.has(a)) adjacency.set(a, new Set());
          if (!adjacency.has(b)) adjacency.set(b, new Set());
          adjacency.get(a)!.add(b);
          adjacency.get(b)!.add(a);
        };
        for (
          let offset = digit.indexRange.indexStart;
          offset < digit.indexRange.indexStart + digit.indexRange.indexCount;
          offset += 3
        ) {
          const triangle = [
            anatomical.indices[offset],
            anatomical.indices[offset + 1],
            anatomical.indices[offset + 2],
          ];
          for (const vertex of triangle) {
            expect(vertex).toBeGreaterThanOrEqual(start);
            expect(vertex).toBeLessThan(end);
          }
          connect(triangle[0], triangle[1]);
          connect(triangle[1], triangle[2]);
          connect(triangle[2], triangle[0]);
        }
        const visited = new Set<number>();
        const queue = [start];
        while (queue.length) {
          const vertex = queue.shift()!;
          if (visited.has(vertex)) continue;
          visited.add(vertex);
          for (const neighbor of adjacency.get(vertex) ?? []) queue.push(neighbor);
        }
        expect(visited.size).toBe(digit.vertexRange.vertexCount);

        const allowedBones = new Set(
          [
            `${limb.side}_hand`,
            `${limb.side}_${digit.digit}_proximal`,
            `${limb.side}_${digit.digit}_intermediate`,
            `${limb.side}_${digit.digit}_distal`,
          ].map((bone) => BONE_ORDER.indexOf(bone))
        );
        for (let vertex = start; vertex < end; vertex++) {
          expect(allowedBones.has(anatomical.jointIndices[vertex])).toBe(true);
          expect(anatomical.jointWeights[vertex]).toBe(1);
        }
        const capOffset = (end - 1) * 3;
        tipDepths.add(Number(anatomical.positions[capOffset + 2].toFixed(4)));
      }
      expect(tipDepths.size).toBe(5);
    }
  });

  it('preserves the exact legacy, coherent-v1, and anatomical-v2 mesh bytes', () => {
    const cases = [
      {
        name: 'legacy',
        options: { upperBodyProfile: 'legacy-segments-v1' as const },
        hashes: {
          positions: '4f6141d4af283f4d77df7d5733f84cdd59bc21e681c19f9fbbc712c6a407dba3',
          normals: '24b5c3202518568f6e5018490658fc56185df6e1d0475c3533200b8a0fe718d1',
          tangents: '81b341f7b7ea429c324e0e2ba34892470ffdf62e756f8cc176b7b44d1d52dd39',
          indices: '4d9492b2890248a8c3f6e9cd2d9828c43336f266b86a1a6a9894e937740377df',
          joints: 'ac64afef5266d33a8aaff1258c56c2c59dd0fd75a16a53b995a8009835c5df03',
          weights: '2c79482c90d441b0ecd6dc08878d47df6478bb411e12f27ff699dec3eab5a06f',
          anatomy: '6e7bbdaa24cc3a05754fdc5d19db08ec55fd37802916954a4e6ead4871c3dd14',
        },
      },
      {
        name: 'coherent-v1',
        options: {
          upperBodyProfile: 'coherent-shoulder-neck-torso-v1' as const,
          upperBodyRadialSegments: 24,
          shoulderScale: 1.1,
          torsoScale: 0.96,
        },
        hashes: {
          positions: '4ceb44855d3f7c3d1e8af9aa19c0bdac2c1f6eaf80d97ff40ee0b8d0bd1c4697',
          normals: 'a0376e2351aa2fa25c23165fba0c77a305bfb863365c5a835e9ec5193213b485',
          tangents: 'bb613d1655f3654e16dc095ac8db6ddce41bf830dc6c0deacc015e9bf8af3a03',
          indices: '720dd5ec4a8086a1a9765284bfe6c12d0b23fa972c299c517e5fd38712bffcf6',
          joints: '57468757ecbd2a7f4c646483f8b2779fcaa2905b5cc4ee0b07abd8c993581964',
          weights: '6c330f1011aefc3893bdfa568afee81d52ee3aad32d08e20cd4bea41315e4452',
          anatomy: '69ca11c994c97980fa3b40ec6001f8c0f096ab671155ad358024ef40759f0e8f',
        },
      },
      {
        name: 'anatomical-v2',
        options: {
          upperBodyProfile: 'coherent-anatomical-limbs-v2' as const,
          upperBodyRadialSegments: 24,
          shoulderScale: 1.1,
          torsoScale: 0.96,
        },
        hashes: {
          positions: '1f7f16ef040a2c7adbc9afb63a5e1d3679789876698f17e9fc523ac8f18f42fa',
          normals: '79cb0a756a53906ea3c77492e30f46d84bb3549f2072a29707684efd16c7e69b',
          tangents: '05ebd2f3c19989239874171c8c8bb6c8e941138d0e5bfda2ef564c05a32f5476',
          indices: 'cb4492ff987aed62ae08f9b0f72d36efc065ad9041a31939ae87b44fd3b63f6e',
          joints: '84ff2cdb50c9b3add5fa8e4790201aa21462a1804320c1f2aeecd39490f179e5',
          weights: 'a6cc8e131d44827bd0e0debc2b0ff10b82f99d3cbfb501ecb172b750d0461ebf',
          anatomy: '49e7599149083ae2c295cdad7b866b5bcf881057ba15817a5040f6208013fca0',
        },
      },
    ];

    for (const fixture of cases) {
      const mesh = buildAgentAvatarMesh(fixture.options);
      expect(
        {
          positions: sha256(mesh.positions),
          normals: sha256(mesh.normals),
          tangents: sha256(mesh.tangents),
          indices: sha256(mesh.indices),
          joints: sha256(mesh.jointIndices),
          weights: sha256(mesh.jointWeights),
          anatomy: createHash('sha256').update(JSON.stringify(mesh.anatomy)).digest('hex'),
        },
        fixture.name
      ).toEqual(fixture.hashes);
    }
  });

  it('emits connected v3 web, knuckle, tendon, and keratin nail landmarks', () => {
    const landmarked = buildAgentAvatarMesh({
      upperBodyProfile: 'coherent-hand-landmarks-v3',
      upperBodyRadialSegments: 24,
      shoulderScale: 1.1,
      torsoScale: 0.96,
    });
    const repeated = buildAgentAvatarMesh({
      upperBodyProfile: 'coherent-hand-landmarks-v3',
      upperBodyRadialSegments: 24,
      shoulderScale: 1.1,
      torsoScale: 0.96,
    });
    const upperBody = landmarked.anatomy.upperBody!;

    expect(upperBody.profile).toBe('anatomical-hand-landmarks-v3');
    expect(Array.from(landmarked.positions)).toEqual(Array.from(repeated.positions));
    expect(Array.from(landmarked.indices)).toEqual(Array.from(repeated.indices));
    for (const limb of upperBody.upperLimbs) {
      const digits = limb.digits ?? [];
      const landmarks = limb.handLandmarks ?? [];
      expect(limb.profile).toBe('anatomical-landmark-hand-v3');
      expect(limb.connectedSurfaceCount).toBe(24);
      expect(digits).toHaveLength(5);
      for (const digit of digits) {
        expect(digit).toMatchObject({
          schemaVersion: 'holoscript.agent-avatar-digit-geometry.v1',
          profile: 'volume-preserving-three-phalanx-v2',
          side: limb.side,
          radialSegments: 12,
          ringCount: 9,
          phalanxSegmentCount: 3,
          webBlendRingCount: 2,
          jointVolumeBlendRingCount: 4,
          minimumJointRadiusRatio: 0.62,
          maximumAdjacentRadiusDrop: 0.1,
          crossSectionAspectRatio: 0.88,
        });
        expect(digit.vertexRange.vertexCount).toBe(12 * 9 + 1);
        expect(digit.indexRange.indexCount).toBe(12 * 8 * 6 + 12 * 3);
      }
      expect(landmarks).toHaveLength(18);
      expect(landmarks.filter((landmark) => landmark.kind === 'interdigital-web')).toHaveLength(4);
      expect(landmarks.filter((landmark) => landmark.kind === 'metacarpal-knuckle')).toHaveLength(
        5
      );
      expect(landmarks.filter((landmark) => landmark.kind === 'dorsal-tendon-ridge')).toHaveLength(
        4
      );
      expect(landmarks.filter((landmark) => landmark.kind === 'nail-plate')).toHaveLength(5);

      for (const landmark of landmarks) {
        expect(landmark.schemaVersion).toBe('holoscript.agent-avatar-hand-landmark-geometry.v1');
        expect(landmark.side).toBe(limb.side);
        expect(landmark.profile).toBe(
          landmark.kind === 'interdigital-web'
            ? 'volumetric-interdigital-web-v2'
            : landmark.kind === 'nail-plate'
              ? 'surface-conforming-nail-plate-v2'
              : 'anatomical-hand-landmark-v1'
        );
        expect(landmark.vertexRange.vertexCount).toBe(
          landmark.kind === 'interdigital-web' ? 50 : landmark.kind === 'nail-plate' ? 50 : 26
        );
        expect(landmark.indexRange.indexCount).toBe(
          landmark.kind === 'interdigital-web' ? 288 : landmark.kind === 'nail-plate' ? 288 : 144
        );
        expect(landmark.materialRole).toBe(
          landmark.kind === 'nail-plate' ? 'keratin-nail' : 'skin'
        );
        if (landmark.kind === 'interdigital-web') {
          expect(landmark.blendRingCount).toBe(4);
        }
        if (landmark.kind === 'nail-plate') {
          expect(landmark).toMatchObject({
            attachment: 'distal-phalanx-surface-conforming-v1',
            attachmentSampleCount: 25,
          });
          expect(landmark.surfaceEmbedDepth).toBeGreaterThan(0);
          expect(landmark.freeEdgeThickness).toBeGreaterThan(
            landmark.surfaceEmbedDepth ?? Number.POSITIVE_INFINITY
          );
          const layerVertexCount = landmark.attachmentSampleCount ?? 0;
          for (let vertex = 0; vertex < layerVertexCount; vertex++) {
            const bottomY =
              landmarked.positions[(landmark.vertexRange.vertexStart + vertex) * 3 + 1];
            const topY =
              landmarked.positions[
                (landmark.vertexRange.vertexStart + layerVertexCount + vertex) * 3 + 1
              ];
            expect(topY).toBeGreaterThan(bottomY);
          }
        }
        const start = landmark.vertexRange.vertexStart;
        const end = start + landmark.vertexRange.vertexCount;
        const adjacency = new Map<number, Set<number>>();
        const connect = (a: number, b: number): void => {
          if (!adjacency.has(a)) adjacency.set(a, new Set());
          if (!adjacency.has(b)) adjacency.set(b, new Set());
          adjacency.get(a)!.add(b);
          adjacency.get(b)!.add(a);
        };
        for (
          let offset = landmark.indexRange.indexStart;
          offset < landmark.indexRange.indexStart + landmark.indexRange.indexCount;
          offset += 3
        ) {
          const triangle = [
            landmarked.indices[offset],
            landmarked.indices[offset + 1],
            landmarked.indices[offset + 2],
          ];
          for (const vertex of triangle) {
            expect(vertex).toBeGreaterThanOrEqual(start);
            expect(vertex).toBeLessThan(end);
          }
          connect(triangle[0], triangle[1]);
          connect(triangle[1], triangle[2]);
          connect(triangle[2], triangle[0]);
        }
        const visited = new Set<number>();
        const queue = [start];
        while (queue.length) {
          const vertex = queue.shift()!;
          if (visited.has(vertex)) continue;
          visited.add(vertex);
          for (const neighbor of adjacency.get(vertex) ?? []) queue.push(neighbor);
        }
        expect(visited.size).toBe(landmark.vertexRange.vertexCount);
        const joint = BONE_ORDER.indexOf(landmark.jointName);
        expect(joint).toBeGreaterThanOrEqual(0);
        for (let vertex = start; vertex < end; vertex++) {
          expect(landmarked.jointIndices[vertex]).toBe(joint);
          expect(landmarked.jointWeights[vertex]).toBe(1);
        }
      }
    }
  });
});
