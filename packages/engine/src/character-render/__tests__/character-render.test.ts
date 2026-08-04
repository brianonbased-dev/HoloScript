/**
 * character-render e2e — native WebGPU GPU-skinned humanoid → verified pixels.
 *
 * The Phase-0 falsifiable claim: a procedural humanoid (NOT a primitive/sphere) renders
 * through the native WebGPU rasterizer, and posing a joint changes the rendered pixels (GPU
 * skinning works). Gated on GPU_LIVE so it skips — never false-greens — where Dawn is absent
 * (G.GOLD.006: the headless readback is also the WASM/CPU-fallback verification floor).
 */
import { describe, it, expect } from 'vitest';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { CharacterHost } from '../CharacterHost';
import {
  deriveCharacterDetailFrame,
  deriveCharacterEnvironmentLightReceipt,
  deriveCharacterMaterialPlateReceipt,
  renderCharacter,
} from '../character-render';
import { quatFromAxisAngle } from '../skin-math';
import type { PixelGrid } from '../../native-render/gpu-verify';

const CLEAR = [18, 18, 23]; // 0.07,0.07,0.09 × 255

/** Count pixels that visibly differ from the clear colour (the figure). */
function figurePixels(g: PixelGrid): number {
  let n = 0;
  for (let i = 0; i < g.data.length; i += 4) {
    const d =
      Math.abs(g.data[i] - CLEAR[0]) +
      Math.abs(g.data[i + 1] - CLEAR[1]) +
      Math.abs(g.data[i + 2] - CLEAR[2]);
    if (d > 40) n++;
  }
  return n;
}

/** Figure pixels within a fractional vertical band [y0,y1) of the image (0=top, 1=bottom). */
function figureInBand(g: PixelGrid, y0: number, y1: number): number {
  let n = 0;
  const r0 = Math.floor(y0 * g.height),
    r1 = Math.floor(y1 * g.height);
  for (let row = r0; row < r1; row++) {
    for (let col = 0; col < g.width; col++) {
      const i = (row * g.width + col) * 4;
      const d =
        Math.abs(g.data[i] - CLEAR[0]) +
        Math.abs(g.data[i + 1] - CLEAR[1]) +
        Math.abs(g.data[i + 2] - CLEAR[2]);
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

function absoluteChannelDiff(a: PixelGrid, b: PixelGrid): number {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum +=
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum;
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('character-render — analytic environment contract', () => {
  it('normalizes and clamps a source-authored three-point environment receipt', () => {
    const receipt = deriveCharacterEnvironmentLightReceipt({
      profile: 'analytic-three-point-v1',
      keyDirection: [0, 3, 4],
      keyColor: [1.2, 0.82, 0.68],
      keyIntensity: 1.25,
      fillIntensity: 0.34,
      rimIntensity: 0.58,
      exposure: 1.08,
    });
    expect(receipt).toMatchObject({
      schemaVersion: 'holoscript.character-environment-light.v1',
      profile: 'analytic-three-point-v1',
      key: {
        direction: [0, 0.6, 0.8],
        color: [1.2, 0.82, 0.68],
        intensity: 1.25,
      },
      fill: { intensity: 0.34 },
      rim: { intensity: 0.58 },
      exposure: 1.08,
    });
    expect(deriveCharacterEnvironmentLightReceipt().fill.intensity).toBe(0);
    expect(deriveCharacterEnvironmentLightReceipt().rim.intensity).toBe(0);
  });

  it('binds H3Z to a source-authored non-photographic room basis', () => {
    const receipt = deriveCharacterEnvironmentLightReceipt({
      profile: 'stormglass-room-basis-v2',
      keyDirection: [0.42, 0.74, 0.52],
      fillDirection: [-0.62, 0.18, 0.76],
      rimDirection: [0.68, 0.4, -0.62],
    });
    expect(receipt).toMatchObject({
      schemaVersion: 'holoscript.character-environment-light.v3',
      profile: 'stormglass-room-basis-v2',
      responseProfile: 'source-authored-room-basis-v2',
      photographicHdri: false,
    });
  });
});

describe('character-render — native WebGPU GPU-skinned humanoid', () => {
  itGpu('renders a vertically-extended humanoid (head up top, feet down low)', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const grid = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });

    expect(figurePixels(grid)).toBeGreaterThan(150); // a real figure, not empty
    expect(figureInBand(grid, 0.0, 0.35)).toBeGreaterThan(5); // head/torso up top
    expect(figureInBand(grid, 0.65, 1.0)).toBeGreaterThan(5); // legs/feet down low
  });

  itGpu('posing the shoulder changes the rendered pixels (GPU skinning works)', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const bind = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });

    host.setBoneRotation('left_upper_arm', quatFromAxisAngle(0, 0, 1, -1.2));
    const posed = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });

    expect(pixelDiff(bind, posed)).toBeGreaterThan(30); // the arm moved
  });

  itGpu('V4 secondary weights change posed wrist pixels on the native GPU path', async () => {
    const host = new CharacterHost({
      entityId: 'dual-influence-gpu-proof',
      upperBodyProfile: 'coherent-deforming-hands-v4',
      upperBodyRadialSegments: 24,
    });
    host.setBoneRotation('left_hand', quatFromAxisAngle(0, 0, 1, 0.75));
    const spec = host.getDrawSpec();
    const limb = host.getAnatomyReceipt().upperBody!.upperLimbs[0];
    const viewProj = deriveCharacterDetailFrame(
      spec.mesh,
      [limb.vertexRange, ...(limb.digits ?? []).map((digit) => digit.vertexRange)],
      { padding: 1.35 }
    ).matrix;
    const blended = await renderCharacter(testDevice!, spec, { size: 256, viewProj });

    const primaryOnlyWeights = new Float32Array(spec.mesh.jointWeights);
    for (let vertex = 0; vertex < primaryOnlyWeights.length; vertex++) {
      primaryOnlyWeights[vertex] += spec.mesh.secondaryJointWeights?.[vertex] ?? 0;
    }
    const primaryOnly = await renderCharacter(
      testDevice!,
      {
        ...spec,
        mesh: {
          ...spec.mesh,
          jointWeights: primaryOnlyWeights,
          secondaryJointWeights: new Float32Array(spec.mesh.vertexCount),
        },
      },
      { size: 256, viewProj }
    );

    expect(figurePixels(blended)).toBeGreaterThan(100);
    expect(pixelDiff(blended, primaryOnly)).toBeGreaterThan(5);
    expect(absoluteChannelDiff(blended, primaryOnly)).toBeGreaterThan(100);
  });

  it('GPU_LIVE gate is recorded (pixel tests skip, never false-pass, when no live GPU)', () => {
    expect(typeof GPU_LIVE).toBe('boolean');
  });
});

describe('character-render — material groups (skin-SSS) + lambert fallback', () => {
  it('receipts preserve semantic skin/nail roles and the exact native draw schedule', () => {
    const host = new CharacterHost({
      entityId: 'hand-material-receipt',
      upperBodyProfile: 'coherent-hand-landmarks-v3',
      upperBodyRadialSegments: 24,
      nailTone: 0xe6beb2,
      nailRoughness: 0.24,
    });
    const spec = host.getDrawSpec();
    const receipt = deriveCharacterMaterialPlateReceipt(spec);

    expect(receipt.backend).toBe('webgpu');
    expect(receipt.deviceExecutionMeasured).toBe(false);
    expect(receipt.scheduledDrawCount).toBe(spec.materialGroups!.length);
    expect(receipt.roleCounts['keratin-nail']).toBe(10);
    expect(receipt.roleCounts.skin).toBeGreaterThan(1);
    expect(receipt.nailIndexCount).toBeGreaterThan(0);
    expect(receipt.skinIndexCount).toBeGreaterThan(receipt.nailIndexCount);
    expect(receipt.skinNailOverlapIndexCount).toBe(0);
    expect(receipt.nailSeparatedFromSkin).toBe(true);
    expect(
      receipt.groups
        .filter((group) => group.materialRole === 'keratin-nail')
        .every(
          (group) =>
            group.shadingModel === 'skin-sss' &&
            group.color === 0xe6beb2 &&
            group.roughness === 0.24
        )
    ).toBe(true);
  });

  it('fixed-light calibration partitions each nail into keratin and proximal nail-bed draws', () => {
    const host = new CharacterHost({
      entityId: 'fixed-light-material-calibration',
      upperBodyProfile: 'coherent-hand-landmarks-v3',
      upperBodyRadialSegments: 24,
      materialCalibrationProfile: 'fixed-light-human-v1',
      skinTone: 0xb9826f,
      skinScatterColor: [0.65, 0.36, 0.31],
      skinMicrodetailProfile: 'analytic-pore-v1',
      skinMicrodetailScale: 94,
      skinMicrodetailStrength: 0.074,
      nailTone: 0xe6beb2,
      nailRoughness: 0.24,
      nailBedTone: 0xc9827c,
      nailBedRoughness: 0.36,
    });
    const spec = host.getDrawSpec();
    const receipt = deriveCharacterMaterialPlateReceipt(spec);
    const skin = host.getSkinMaterialReceipt();

    expect(skin).toMatchObject({
      schemaVersion: 'holoscript.agent-avatar-skin-material.v2',
      calibrationProfile: 'fixed-light-human-v1',
      color: 0xb9826f,
      roughness: 0.5,
      specularF0: 0.028,
      thickness: 0.24,
      transmitStrength: 0.32,
      ambient: 0.09,
      microdetailProfile: 'analytic-pore-v1',
      microdetailScale: 94,
      microdetailStrength: 0.074,
    });
    expect(receipt.schemaVersion).toBe('holoscript.character-material-plate.v2');
    expect(receipt.roleCounts['keratin-nail']).toBe(20);
    expect(receipt.roleCounts['nail-bed']).toBe(10);
    expect(receipt.keratinIndexCount).toBe(2160);
    expect(receipt.nailBedIndexCount).toBe(720);
    expect(receipt.nailSurfaceIndexCount).toBe(2880);
    expect(receipt.skinNailOverlapIndexCount).toBe(0);
    expect(receipt.skinNailBedOverlapIndexCount).toBe(0);
    expect(receipt.nailBedKeratinOverlapIndexCount).toBe(0);
    expect(receipt.nailSeparatedFromSkin).toBe(true);
    expect(receipt.nailBedSeparatedFromKeratin).toBe(true);
    expect(receipt.calibratedNailSurface).toBe(true);
    expect(
      receipt.groups
        .filter((group) => group.materialRole === 'nail-bed')
        .every(
          (group) =>
            group.color === 0xc9827c &&
            group.roughness === 0.36 &&
            group.specularF0 === 0.032 &&
            group.thickness === 0.52 &&
            group.transmitStrength === 0.24
        )
    ).toBe(true);
    expect(
      receipt.groups
        .filter((group) => group.materialRole === 'keratin-nail')
        .every(
          (group) =>
            group.color === 0xe6beb2 &&
            group.roughness === 0.24 &&
            group.specularF0 === 0.045 &&
            group.thickness === 0.36 &&
            group.transmitStrength === 0.1
        )
    ).toBe(true);
  });

  it('derives a source-bounded close-up frame from one hand landmark set', () => {
    const host = new CharacterHost({
      entityId: 'hand-detail-frame',
      upperBodyProfile: 'coherent-hand-landmarks-v3',
      upperBodyRadialSegments: 24,
    });
    const anatomy = host.getAnatomyReceipt();
    const leftLandmarks = anatomy.upperBody!.upperLimbs[0].handLandmarks!;
    const frame = deriveCharacterDetailFrame(
      host.getDrawSpec().mesh,
      leftLandmarks.map((landmark) => landmark.vertexRange),
      { padding: 1.25 }
    );

    expect(frame.vertexRangeCount).toBe(18);
    expect(frame.selectedVertexCount).toBe(
      leftLandmarks.reduce((sum, landmark) => sum + landmark.vertexRange.vertexCount, 0)
    );
    expect(frame.halfExtent).toBeGreaterThan(0.04);
    expect(frame.center[0]).toBeGreaterThan(0);
    expect(frame.matrix[15]).toBe(1);
  });

  itGpu('the lambert fallback path (no materialGroups) still renders a figure', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const spec = host.getDrawSpec();
    // Strip groups → exercise the single-draw lambert fallback (the additive guard).
    const fallback = { ...spec, materialGroups: undefined };
    const grid = await renderCharacter(testDevice!, fallback, { size: 128 });
    expect(figurePixels(grid)).toBeGreaterThan(150);
  });

  itGpu('SSS skin shades differently from the flat lambert fallback', async () => {
    const host = new CharacterHost({ entityId: 'brittney' });
    const spec = host.getDrawSpec(); // emits a skin-sss material group
    const skin = await renderCharacter(testDevice!, spec, { size: 128 });
    const lambert = await renderCharacter(
      testDevice!,
      { ...spec, materialGroups: undefined },
      { size: 128 }
    );
    // Same silhouette, different shading → many pixels differ but the figure area is similar.
    expect(pixelDiff(skin, lambert)).toBeGreaterThan(50);
    expect(figurePixels(skin)).toBeGreaterThan(150);
  });

  itGpu('source-authored analytic pore response changes native skin pixels', async () => {
    const smooth = new CharacterHost({ entityId: 'microdetail-proof' });
    const detailed = new CharacterHost({
      entityId: 'microdetail-proof',
      skinMicrodetailProfile: 'analytic-pore-v1',
      skinMicrodetailScale: 96,
      skinMicrodetailStrength: 0.12,
    });
    const smoothPixels = await renderCharacter(testDevice!, smooth.getDrawSpec(), { size: 128 });
    const detailedPixels = await renderCharacter(testDevice!, detailed.getDrawSpec(), {
      size: 128,
    });

    expect(figurePixels(detailedPixels)).toBeGreaterThan(150);
    expect(absoluteChannelDiff(smoothPixels, detailedPixels)).toBeGreaterThan(100);
  });

  itGpu('anatomical complexion changes native skin pixels without changing geometry', async () => {
    const counterfactual = new CharacterHost({
      entityId: 'anatomical-complexion-proof',
      materialCalibrationProfile: 'fixed-light-human-v1',
      skinSurfaceResponseProfile: 'calibrated-skin-surface-v1',
      skinComplexionStrength: 0,
    });
    const authored = new CharacterHost({
      entityId: 'anatomical-complexion-proof',
      materialCalibrationProfile: 'fixed-light-human-v1',
      skinSurfaceResponseProfile: 'calibrated-skin-surface-v1',
      skinComplexionProfile: 'anatomical-complexion-v1',
      skinComplexionStrength: 0.64,
    });
    const counterfactualSpec = counterfactual.getDrawSpec();
    const authoredSpec = authored.getDrawSpec();
    const counterfactualPixels = await renderCharacter(testDevice!, counterfactualSpec, {
      size: 128,
      lightDir: [0.58, 0.44, 0.68],
    });
    const authoredPixels = await renderCharacter(testDevice!, authoredSpec, {
      size: 128,
      lightDir: [0.58, 0.44, 0.68],
    });

    expect(authoredSpec.mesh.positions).toEqual(counterfactualSpec.mesh.positions);
    expect(figurePixels(authoredPixels)).toBeGreaterThan(150);
    expect(absoluteChannelDiff(authoredPixels, counterfactualPixels)).toBeGreaterThan(100);
  });

  itGpu(
    'decoupled fine-normal response changes native pixels without changing geometry',
    async () => {
      const counterfactual = new CharacterHost({
        entityId: 'skin-surface-response-proof',
        materialCalibrationProfile: 'fixed-light-human-v1',
        skinMicrodetailProfile: 'analytic-pore-v1',
        skinMicrodetailScale: 104,
        skinMicrodetailStrength: 0.09,
        skinSurfaceResponseProfile: 'calibrated-skin-surface-v1',
        skinAlbedoVariationStrength: 0.024,
        skinRoughnessVariationStrength: 0.072,
        skinNormalMicrodetailStrength: 0,
      });
      const authored = new CharacterHost({
        entityId: 'skin-surface-response-proof',
        materialCalibrationProfile: 'fixed-light-human-v1',
        skinMicrodetailProfile: 'analytic-pore-v1',
        skinMicrodetailScale: 104,
        skinMicrodetailStrength: 0.09,
        skinSurfaceResponseProfile: 'calibrated-skin-surface-v1',
        skinAlbedoVariationStrength: 0.024,
        skinRoughnessVariationStrength: 0.072,
        skinNormalMicrodetailStrength: 0.14,
      });
      const counterfactualSpec = counterfactual.getDrawSpec();
      const authoredSpec = authored.getDrawSpec();
      const counterfactualPixels = await renderCharacter(testDevice!, counterfactualSpec, {
        size: 128,
        lightDir: [0.72, 0.28, 0.63],
      });
      const authoredPixels = await renderCharacter(testDevice!, authoredSpec, {
        size: 128,
        lightDir: [0.72, 0.28, 0.63],
      });

      expect(authoredSpec.mesh.positions).toEqual(counterfactualSpec.mesh.positions);
      expect(figurePixels(authoredPixels)).toBeGreaterThan(150);
      expect(absoluteChannelDiff(authoredPixels, counterfactualPixels)).toBeGreaterThan(50);
    }
  );

  itGpu('changing only the keratin plate material changes native WebGPU hand pixels', async () => {
    const host = new CharacterHost({
      entityId: 'hand-material-gpu-proof',
      upperBodyProfile: 'coherent-hand-landmarks-v3',
      upperBodyRadialSegments: 24,
      nailTone: 0xe6beb2,
      nailRoughness: 0.24,
    });
    const spec = host.getDrawSpec();
    const anatomy = host.getAnatomyReceipt();
    const leftLandmarks = anatomy.upperBody!.upperLimbs[0].handLandmarks!;
    const viewProj = deriveCharacterDetailFrame(
      spec.mesh,
      leftLandmarks.map((landmark) => landmark.vertexRange),
      { padding: 1.25 }
    ).matrix;
    const authored = await renderCharacter(testDevice!, spec, { size: 256, viewProj });
    const counterfactual = await renderCharacter(
      testDevice!,
      {
        ...spec,
        materialGroups: spec.materialGroups!.map((group) =>
          group.materialRole === 'keratin-nail'
            ? {
                ...group,
                material: {
                  ...group.material,
                  color: 0x18f6ff,
                  roughness: 0.08,
                },
              }
            : group
        ),
      },
      { size: 256, viewProj }
    );

    expect(figurePixels(authored)).toBeGreaterThan(100);
    expect(pixelDiff(authored, counterfactual)).toBeGreaterThan(5);
    expect(absoluteChannelDiff(authored, counterfactual)).toBeGreaterThan(100);
  });

  itGpu(
    'changes live material pixels under a source-authored three-point environment',
    async () => {
      const host = new CharacterHost({
        entityId: 'h3w-environment-response',
        faceTopology: 'neutral-anatomical-v2',
        facialDetailProfile: 'portrait-silhouette-v2',
        upperBodyProfile: 'coherent-expressive-anatomy-v7',
        includeHair: false,
      });
      const legacy = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
      const analytic = await renderCharacter(testDevice!, host.getDrawSpec(), {
        size: 128,
        environmentLight: {
          profile: 'analytic-three-point-v1',
          keyDirection: [0.42, 0.74, 0.52],
          keyColor: [1, 0.82, 0.68],
          keyIntensity: 1.25,
          fillDirection: [-0.62, 0.18, 0.76],
          fillColor: [0.48, 0.64, 1],
          fillIntensity: 0.34,
          rimDirection: [0.68, 0.4, -0.62],
          rimColor: [1, 0.48, 0.28],
          rimIntensity: 0.58,
          exposure: 1.08,
        },
      });
      expect(figurePixels(analytic)).toBeGreaterThan(100);
      expect(pixelDiff(legacy, analytic)).toBeGreaterThan(25);
      expect(absoluteChannelDiff(legacy, analytic)).toBeGreaterThan(1000);
    }
  );
});
