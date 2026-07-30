/**
 * hair tests — procedural hair geometry + combined body+hair mesh.
 *
 * Pure-data: every hair vertex skins to the head bone (index + weight), strand tangents are
 * unit-length, strandT spans 0..1, hair sits above the head anchor, and the combined mesh
 * concatenates body+hair with correct index ranges. GPU-gated: hair adds pixels above the
 * head, and a head-bone pose rotation moves the hair with the head (proves palette reuse).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import {
  AGENT_AVATAR_HAIR_STYLES,
  buildAgentAvatarHair,
  buildCharacterMesh,
  resolveAgentAvatarGroomProfile,
  resolveAgentAvatarHairCoverageProfile,
  resolveAgentAvatarHairStyle,
} from '../AgentAvatarHair';
import { CharacterHost } from '../CharacterHost';
import { deriveCharacterRenderPipelineReceipt, renderCharacter } from '../character-render';
import { quatFromAxisAngle } from '../skin-math';
import { HUMANOID_BONE_NAMES } from '../../character/HumanoidSkeleton';
import type { PixelGrid } from '../../native-render/gpu-verify';

const HEAD_INDEX = HUMANOID_BONE_NAMES.indexOf('head');

function bandFigure(g: PixelGrid, y0: number, y1: number): number {
  const clear = [18, 18, 23];
  let n = 0;
  const r0 = Math.floor(y0 * g.height),
    r1 = Math.floor(y1 * g.height);
  for (let row = r0; row < r1; row++) {
    for (let col = 0; col < g.width; col++) {
      const i = (row * g.width + col) * 4;
      const d =
        Math.abs(g.data[i] - clear[0]) +
        Math.abs(g.data[i + 1] - clear[1]) +
        Math.abs(g.data[i + 2] - clear[2]);
      if (d > 40) n++;
    }
  }
  return n;
}
function pixelDiff(a: PixelGrid, b: PixelGrid): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 40) n++;
  }
  return n;
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('hair — procedural geometry (pure data)', () => {
  it('every hair vertex skins to the head bone with real tangent + strandT', () => {
    const hair = buildAgentAvatarHair();
    expect(hair.vertexCount).toBeGreaterThan(100);
    expect(hair.tangents.length).toBe(hair.vertexCount * 4);

    let minY = Infinity;
    for (let i = 0; i < hair.vertexCount; i++) {
      expect(hair.jointIndices[i]).toBe(HEAD_INDEX); // rides the head bone
      expect(hair.jointWeights[i]).toBe(1);
      const tx = hair.tangents[i * 4],
        ty = hair.tangents[i * 4 + 1],
        tz = hair.tangents[i * 4 + 2],
        st = hair.tangents[i * 4 + 3];
      expect(Math.hypot(tx, ty, tz)).toBeCloseTo(1, 1); // unit tangent
      expect(st).toBeGreaterThanOrEqual(0);
      expect(st).toBeLessThanOrEqual(1);
      minY = Math.min(minY, hair.positions[i * 3 + 1]);
    }
    expect(minY).toBeGreaterThan(1.4); // sits on/above the head (world-bind y≈1.51)
    // strandT actually varies (not all root / all tip — the bug the critique caught).
    const ts = new Set(
      Array.from({ length: hair.vertexCount }, (_, i) => hair.tangents[i * 4 + 3])
    );
    expect(ts.size).toBeGreaterThan(1);
  });

  it('combined mesh concatenates body+hair with contiguous, exhaustive index ranges', () => {
    const c = buildCharacterMesh({ entityId: 'brittney' });
    expect(c.bodyRange.indexStart).toBe(0);
    expect(c.hairRange.indexStart).toBe(c.bodyRange.indexCount);
    // body + hair + eyes are contiguous and exhaustive over the index buffer.
    expect(c.bodyRange.indexCount + c.hairRange.indexCount + c.eyeRange.indexCount).toBe(
      c.mesh.indices.length
    );
    // every index addresses a real vertex; tangents present for all
    expect(c.mesh.tangents.length).toBe(c.mesh.vertexCount * 4);
    for (let i = 0; i < c.mesh.indices.length; i++) {
      expect(c.mesh.indices[i]).toBeLessThan(c.mesh.vertexCount);
    }
  });

  it('preserves V4 dual influences through the combined character mesh', () => {
    const c = buildCharacterMesh({
      upperBodyProfile: 'coherent-deforming-hands-v4',
      upperBodyRadialSegments: 24,
    });
    expect(c.jointDeformation).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-joint-deformation.v1',
      profile: 'dual-influence-upper-limb-v1',
      influencedVertexCount: 1008,
      jointPairCount: 38,
    });
    expect(c.mesh.secondaryJointIndices).toHaveLength(c.mesh.vertexCount);
    expect(c.mesh.secondaryJointWeights).toHaveLength(c.mesh.vertexCount);
    expect(Array.from(c.mesh.secondaryJointWeights!).filter((weight) => weight > 0)).toHaveLength(
      1008
    );

    const bodyEnd = c.bodyVertexRange.vertexStart + c.bodyVertexRange.vertexCount;
    for (let vertex = bodyEnd; vertex < c.mesh.vertexCount; vertex++) {
      expect(c.mesh.secondaryJointIndices![vertex]).toBe(c.mesh.jointIndices[vertex]);
      expect(c.mesh.secondaryJointWeights![vertex]).toBe(0);
    }
  });

  it('neutral anatomical faces use a smaller embedded ocular surface', () => {
    const legacy = buildCharacterMesh({ includeHair: false });
    const anatomical = buildCharacterMesh({
      includeHair: false,
      faceTopology: 'neutral-anatomical-v2',
    });
    const firstEyeDiameter = (mesh: typeof legacy) => {
      const start = mesh.eyeVertexRange.vertexStart;
      const end = start + mesh.eyeVertexRange.vertexCount / 2;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let vertex = start; vertex < end; vertex++) {
        const x = mesh.mesh.positions[vertex * 3];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      return maxX - minX;
    };
    expect(firstEyeDiameter(anatomical)).toBeLessThan(firstEyeDiameter(legacy) * 0.8);
  });

  it('source style profiles are deterministic and materially change native topology', () => {
    const signatures = new Set<string>();
    for (const style of AGENT_AVATAR_HAIR_STYLES) {
      const first = buildAgentAvatarHair({ style });
      const replay = buildAgentAvatarHair({ style });
      expect(Array.from(replay.positions)).toEqual(Array.from(first.positions));
      expect(Array.from(replay.indices)).toEqual(Array.from(first.indices));
      signatures.add(
        `${first.vertexCount}:${Array.from(first.positions.slice(-24))
          .map((value) => value.toFixed(5))
          .join(',')}`
      );
    }
    expect(signatures.size).toBe(AGENT_AVATAR_HAIR_STYLES.length);
    expect(buildAgentAvatarHair({ style: 'long' }).vertexCount).toBeGreaterThan(
      buildAgentAvatarHair({ style: 'short' }).vertexCount
    );
    expect(resolveAgentAvatarHairStyle('Medium Wavy')).toBe('medium_wavy');
    expect(resolveAgentAvatarHairStyle('not_a_style')).toBeUndefined();
  });

  it('source-authored hair topology budgets reduce guides, cards, and curve segments', () => {
    const lod0 = buildAgentAvatarHair({
      style: 'cropped_coils',
      guides: 168,
      cardsPerGuide: 2,
      segments: 7,
    });
    const lod1 = buildAgentAvatarHair({
      style: 'cropped_coils',
      guides: 92,
      cardsPerGuide: 1,
      segments: 5,
    });
    const lod2 = buildAgentAvatarHair({
      style: 'cropped_coils',
      guides: 48,
      cardsPerGuide: 1,
      segments: 3,
    });

    expect(lod0.vertexCount).toBeGreaterThan(lod1.vertexCount);
    expect(lod1.vertexCount).toBeGreaterThan(lod2.vertexCount);
    expect(lod0.indices.length).toBeGreaterThan(lod1.indices.length);
    expect(lod1.indices.length).toBeGreaterThan(lod2.indices.length);
    expect(
      Array.from(
        buildAgentAvatarHair({
          style: 'cropped_coils',
          guides: 48,
          cardsPerGuide: 1,
          segments: 3,
        }).positions
      )
    ).toEqual(Array.from(lod2.positions));
  });

  it('keeps the legacy radial-card default exact while scalp-flow is deterministic', () => {
    const implicitLegacy = buildAgentAvatarHair({
      style: 'medium_wavy',
      guides: 48,
      cardsPerGuide: 1,
      segments: 5,
    });
    const explicitLegacy = buildAgentAvatarHair({
      style: 'medium_wavy',
      guides: 48,
      cardsPerGuide: 1,
      segments: 5,
      groomProfile: 'radial-cards-v1',
    });
    const scalpFlow = buildAgentAvatarHair({
      style: 'medium_wavy',
      guides: 48,
      cardsPerGuide: 1,
      segments: 5,
      groomProfile: 'scalp-flow-v1',
      cardWidth: 0.006,
      rootLift: 0.002,
      tipTaper: 0.1,
      hairlineBias: 0.16,
    });
    const replay = buildAgentAvatarHair({
      style: 'medium_wavy',
      guides: 48,
      cardsPerGuide: 1,
      segments: 5,
      groomProfile: 'scalp-flow-v1',
      cardWidth: 0.006,
      rootLift: 0.002,
      tipTaper: 0.1,
      hairlineBias: 0.16,
    });

    expect(Array.from(explicitLegacy.positions)).toEqual(Array.from(implicitLegacy.positions));
    expect(Array.from(explicitLegacy.indices)).toEqual(Array.from(implicitLegacy.indices));
    expect(Array.from(replay.positions)).toEqual(Array.from(scalpFlow.positions));
    expect(replay.groom).toEqual(scalpFlow.groom);
    expect(resolveAgentAvatarGroomProfile('Scalp Flow V1')).toBe('scalp-flow-v1');
    expect(resolveAgentAvatarGroomProfile('Scalp Flow Containment V2')).toBe(
      'scalp-flow-containment-v2'
    );
    expect(resolveAgentAvatarGroomProfile('billboard_wig_v9')).toBeUndefined();
  });

  it('projects H3Y groom cards outside the authored ellipsoidal scalp', () => {
    const common = {
      style: 'medium_wavy' as const,
      faceTopology: 'neutral-anatomical-v2' as const,
      faceWidth: 0.94,
      faceLength: 1.08,
      guides: 72,
      cardsPerGuide: 2,
      segments: 6,
      cardWidth: 0.014,
      rootLift: 0.001,
      tipTaper: 0.08,
      hairlineBias: 0.18,
    };
    const baseline = buildAgentAvatarHair({
      ...common,
      groomProfile: 'scalp-flow-v1',
    });
    const contained = buildAgentAvatarHair({
      ...common,
      groomProfile: 'scalp-flow-containment-v2',
    });
    const replay = buildAgentAvatarHair({
      ...common,
      groomProfile: 'scalp-flow-containment-v2',
    });

    expect(contained.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v2',
      profile: 'scalp-flow-containment-v2',
      containmentProfile: 'ellipsoidal-scalp-exterior-v1',
      scalpPenetrationVertexCount: 0,
    });
    expect(contained.groom!.containmentAdjustedVertexCount).toBeGreaterThan(0);
    expect(Array.from(contained.positions)).not.toEqual(Array.from(baseline.positions));
    expect(Array.from(replay.positions)).toEqual(Array.from(contained.positions));
    expect(replay.groom).toEqual(contained.groom);
  });

  it('emits deterministic H3Z scalp-contained flyaway breakup', () => {
    const options = {
      style: 'medium_wavy' as const,
      faceTopology: 'neutral-anatomical-v2' as const,
      guides: 72,
      cardsPerGuide: 2,
      segments: 6,
      groomProfile: 'scalp-flow-breakup-v3' as const,
      rootLift: 0.001,
      cardWidth: 0.014,
    };
    const breakup = buildAgentAvatarHair(options);
    const replay = buildAgentAvatarHair(options);

    expect(breakup.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v3',
      profile: 'scalp-flow-breakup-v3',
      containmentProfile: 'ellipsoidal-scalp-exterior-v1',
      breakupProfile: 'contained-flyaway-breakup-v1',
      flyawayGuideCount: 12,
      flyawayCardCount: 12,
      scalpPenetrationVertexCount: 0,
    });
    expect(breakup.groom?.cardCount).toBe(
      breakup.groom!.emittedGuideCount * 2 + breakup.groom!.flyawayCardCount!
    );
    expect(Array.from(replay.positions)).toEqual(Array.from(breakup.positions));
    expect(replay.groom).toEqual(breakup.groom);
    expect(resolveAgentAvatarGroomProfile('Scalp Flow Breakup V3')).toBe(
      'scalp-flow-breakup-v3'
    );
  });

  it('turns source-authored crown whorl into deterministic de-clumped scalp-flow topology', () => {
    const common = {
      style: 'cropped_coils' as const,
      guides: 72,
      cardsPerGuide: 1,
      segments: 5,
      groomProfile: 'scalp-flow-v1' as const,
      faceTopology: 'neutral-anatomical-v2' as const,
      faceWidth: 0.95,
      faceLength: 1.06,
    };
    const baseline = buildAgentAvatarHair(common);
    const authored = buildAgentAvatarHair({ ...common, crownWhorl: 0.42 });
    const replay = buildAgentAvatarHair({ ...common, crownWhorl: 0.42 });

    expect(baseline.groom?.crownWhorl).toBe(0);
    expect(authored.groom?.crownWhorl).toBe(0.42);
    expect(Array.from(authored.positions)).not.toEqual(Array.from(baseline.positions));
    expect(Array.from(replay.positions)).toEqual(Array.from(authored.positions));
    expect(replay.groom).toEqual(authored.groom);
    expect(authored.groom!.rootTangentRadialDotP95).toBeLessThan(0.01);
  });

  it('aligns scalp-flow roots and cap to the neutral anatomical head ellipsoid', () => {
    const legacySurface = buildAgentAvatarHair({
      groomProfile: 'scalp-flow-v1',
      guides: 24,
      cardsPerGuide: 1,
      segments: 3,
    });
    const neutralSurface = buildAgentAvatarHair({
      groomProfile: 'scalp-flow-v1',
      faceTopology: 'neutral-anatomical-v2',
      guides: 24,
      cardsPerGuide: 1,
      segments: 3,
    });

    expect(legacySurface.groom?.scalpSurface).toBe('legacy-sphere');
    expect(neutralSurface.groom?.scalpSurface).toBe('neutral-anatomical-ellipsoid');
    expect(neutralSurface.positions[1] - legacySurface.positions[1]).toBeGreaterThan(0.06);
  });

  it('scalp-flow derives tangent, taper, hairline, and topology evidence from emitted geometry', () => {
    const legacy = buildAgentAvatarHair({
      style: 'medium_wavy',
      guides: 72,
      cardsPerGuide: 1,
      segments: 5,
      groomProfile: 'radial-cards-v1',
      cardWidth: 0.006,
    });
    const scalpFlow = buildAgentAvatarHair({
      style: 'medium_wavy',
      guides: 72,
      cardsPerGuide: 1,
      segments: 5,
      groomProfile: 'scalp-flow-v1',
      cardWidth: 0.006,
      rootLift: 0.002,
      tipTaper: 0.1,
      hairlineBias: 0.16,
    });
    const distance = (vertexA: number, vertexB: number) =>
      Math.hypot(
        scalpFlow.positions[vertexA * 3] - scalpFlow.positions[vertexB * 3],
        scalpFlow.positions[vertexA * 3 + 1] - scalpFlow.positions[vertexB * 3 + 1],
        scalpFlow.positions[vertexA * 3 + 2] - scalpFlow.positions[vertexB * 3 + 2]
      );
    const segments = 5;
    const firstCardVertex = scalpFlow.groom!.scalpCapVertexCount;
    const rootWidth = distance(firstCardVertex, firstCardVertex + 1);
    const tipWidth = distance(
      firstCardVertex + (segments - 1) * 2,
      firstCardVertex + (segments - 1) * 2 + 1
    );

    expect(tipWidth / rootWidth).toBeCloseTo(0.1, 4);
    expect(scalpFlow.groom).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-groom-geometry.v1',
      profile: 'scalp-flow-v1',
      rootLift: 0.002,
      tipTaper: 0.1,
      hairlineBias: 0.16,
      requestedGuideCount: 72,
      cardCount: scalpFlow.groom!.emittedGuideCount,
      scalpSurface: 'legacy-sphere',
      scalpCapVertexCount: 197,
      scalpCapTriangleCount: 364,
      vertexCount: scalpFlow.vertexCount,
      triangleCount: scalpFlow.indices.length / 3,
    });
    expect(scalpFlow.groom!.rootTangentRadialDotP95).toBeLessThan(0.01);
    expect(scalpFlow.groom!.rootTangentRadialDotP95).toBeLessThan(
      legacy.groom!.rootTangentRadialDotP95 * 0.1
    );
    expect(legacy.groom!.scalpCapVertexCount).toBe(0);
    expect(legacy.groom!.scalpCapTriangleCount).toBe(0);
    expect(scalpFlow.groom!.frontalOcclusionVertexCount).toBeLessThan(
      legacy.groom!.frontalOcclusionVertexCount
    );
  });

  it('emits operative card-width UVs and derives an alpha-to-coverage material receipt', () => {
    const hair = buildAgentAvatarHair({
      groomProfile: 'scalp-flow-v1',
      guides: 24,
      cardsPerGuide: 1,
      segments: 4,
    });
    expect(hair.uvs?.length).toBe(hair.vertexCount * 2);
    const firstCard = hair.groom!.scalpCapVertexCount;
    expect(Array.from(hair.uvs!.slice(firstCard * 2, firstCard * 2 + 4))).toEqual([0, 0, 1, 0]);
    expect(hair.uvs![1]).toBeLessThan(0); // cap is full-coverage, not card-edge clipped

    const host = new CharacterHost({
      entityId: 'coverage-receipt',
      hairGroomProfile: 'scalp-flow-v1',
      hairCoverageProfile: 'alpha-to-coverage-v1',
      hairStrandCoverage: 0.74,
      hairEdgeSoftness: 0.16,
      hairAnisotropyStrength: 0.86,
      hairLongitudinalShift: 0.08,
    });
    expect(host.getGroomGeometryReceipt()?.material).toEqual({
      schemaVersion: 'holoscript.agent-avatar-hair-material.v1',
      shadingModel: 'marschner-hair',
      coverageProfile: 'alpha-to-coverage-v1',
      strandCoverage: 0.74,
      edgeSoftness: 0.16,
      anisotropyStrength: 0.86,
      longitudinalShift: 0.08,
      primaryExponent: 48,
      secondaryExponent: 12,
      tangentAttribute: 'strand-flow',
      cardUvAttribute: 'card-width',
      alphaToCoverageRequested: true,
    });
    expect(deriveCharacterRenderPipelineReceipt(host.getDrawSpec())).toEqual({
      schemaVersion: 'holoscript.character-render-pipeline.v1',
      sampleCount: 4,
      alphaToCoverageEnabled: true,
      alphaToCoverageGroupCount: 1,
    });
    expect(resolveAgentAvatarHairCoverageProfile('alpha_to_coverage_v1')).toBe(
      'alpha-to-coverage-v1'
    );
    expect(resolveAgentAvatarHairCoverageProfile('painted_fuzz_v9')).toBeUndefined();
  });
});

describe('hair — rendered (native WebGPU)', () => {
  itGpu('hair adds pixels in the head band vs a body with no hair group', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const spec = host.getDrawSpec(); // body=skin + hair=marschner
    const withHair = await renderCharacter(testDevice!, spec, { size: 128 });
    // Same mesh, but only the body (skin) group → no hair drawn.
    const bodyOnly = await renderCharacter(
      testDevice!,
      { ...spec, materialGroups: spec.materialGroups!.slice(0, 1) },
      { size: 128 }
    );
    // Head band (top ~30%) gains pixels when hair is drawn.
    expect(bandFigure(withHair, 0.0, 0.3)).toBeGreaterThan(bandFigure(bodyOnly, 0.0, 0.3));
  });

  itGpu('hair moves with a head-bone pose (palette reuse skins it)', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const a = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    host.setBoneRotation('head', quatFromAxisAngle(0, 0, 1, 0.5)); // tilt head
    const b = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    expect(pixelDiff(a, b)).toBeGreaterThan(20); // head + hair tilt together
  });

  itGpu('source-authored card coverage changes real multisampled GPU pixels', async () => {
    const opaqueHost = new CharacterHost({
      entityId: 'opaque-hair',
      faceTopology: 'neutral-anatomical-v2',
      hairGroomProfile: 'scalp-flow-v1',
      hairCoverageProfile: 'opaque-v1',
    });
    const coveredHost = new CharacterHost({
      entityId: 'covered-hair',
      faceTopology: 'neutral-anatomical-v2',
      hairGroomProfile: 'scalp-flow-v1',
      hairCoverageProfile: 'alpha-to-coverage-v1',
      hairStrandCoverage: 0.68,
      hairEdgeSoftness: 0.18,
      hairAnisotropyStrength: 0.88,
      hairLongitudinalShift: 0.1,
    });
    const opaque = await renderCharacter(testDevice!, opaqueHost.getDrawSpec(), { size: 128 });
    const covered = await renderCharacter(testDevice!, coveredHost.getDrawSpec(), { size: 128 });
    expect(pixelDiff(opaque, covered)).toBeGreaterThan(20);
  });
});
