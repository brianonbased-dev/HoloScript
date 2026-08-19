#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifySoftwareRenderer,
  createObserverBoundaryEnvelope,
  evaluateMaterialTruth,
  inferGraphicsBackend,
  normalizeResidentAssetManifest,
  parseGlbContainer,
  pngDimensions,
  runRenderingGate,
  validateResidentAssetGlb,
  validateResidentAssetSovereignSource,
  verifyObserverBoundaryEnvelope,
} from '../hololand-model-village-rendering-truth-gate.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const holoScriptRoot = path.resolve(repoRoot, '..', 'HoloScript');
const outputDir = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'test',
  `rendering-${process.pid}-${randomUUID()}`,
);

const effectiveDefaults = {
  type: 'MeshPhysicalMaterial',
  color: '#8aa0b5',
  metalness: 0,
  roughness: 0.6,
  clearcoat: 0,
  clearcoatRoughness: 0,
  transmission: 0,
  thickness: 0,
  ior: 1.5,
  opacity: 1,
  transparent: false,
  emissive: '#000000',
  emissiveIntensity: 0,
  sheen: 0,
  sheenColor: '#000000',
  anisotropy: 0,
  envMapIntensity: 1,
  side: 0,
  depthWrite: true,
};
const chuteOverrideValues = {
  transparent: true,
  opacity: 0.34,
  side: 2,
  depthWrite: false,
};

function meshNode(id, materialProps, properties = {}) {
  return {
    id,
    type: 'mesh',
    props: {
      materialProps,
      properties,
    },
  };
}

function chuteDisclosures(source, sourceBasis, disclosure) {
  return Object.entries(chuteOverrideValues).map(([property, effectiveValue]) => ({
    scope: 'presentation',
    property,
    sourceBasis,
    authoredValue: Object.hasOwn(source, property) ? source[property] : null,
    baselineValue: Object.hasOwn(source, property)
      ? source[property]
      : effectiveDefaults[property],
    effectiveValue,
    disclosure,
  }));
}

function observedMaterial(node, override = null) {
  const source = structuredClone(node.props.materialProps);
  return {
    objectId: node.id,
    source,
    effective: {
      ...effectiveDefaults,
      ...source,
      ...(override?.values || {}),
    },
    overrides: override
      ? chuteDisclosures(source, override.sourceBasis, override.disclosure)
      : [],
  };
}

function runMaterialTruthUnitTest() {
  const materialLab = meshNode('MaterialLab', {
    color: '#123456',
    metalness: 0.21,
    roughness: 0.37,
    clearcoat: 0.42,
    clearcoatRoughness: 0.16,
    transmission: 0.63,
    thickness: 0.71,
    ior: 1.41,
    opacity: 0.81,
    transparent: true,
    emissive: '#654321',
    emissiveIntensity: 0.28,
    sheen: 0.19,
    sheenColor: '#abcdef',
    anisotropy: 0.57,
    envMapIntensity: 0.91,
  });
  const admittedChute = meshNode(
    'AdmittedChuteShell',
    {
      color: '#4d2d16',
      metalness: 0.72,
      roughness: 0.31,
      emissive: '#f4a64e',
      emissiveIntensity: 0.16,
    },
    {
      presentationRole: 'admitted_gravity_chute',
      decorativeNonCollider: true,
    },
  );
  const blockedChute = meshNode(
    'BlockedChuteShell',
    {
      color: '#252348',
      metalness: 0.72,
      roughness: 0.31,
      emissive: '#7469ff',
      emissiveIntensity: 0.18,
    },
    {
      presentationRole: 'blocked_gravity_chute',
      decorativeNonCollider: true,
    },
  );
  const contracts = {
    projection: {
      nodes: [admittedChute, blockedChute],
    },
    calibration: {
      nodes: [materialLab],
    },
  };
  const admittedOverride = {
    values: chuteOverrideValues,
    sourceBasis: {
      presentationRole: 'admitted_gravity_chute',
      decorativeNonCollider: true,
    },
    disclosure: 'decorative admitted chute shell presentation',
  };
  const blockedOverride = {
    values: chuteOverrideValues,
    sourceBasis: {
      presentationRole: 'blocked_gravity_chute',
      decorativeNonCollider: true,
    },
    disclosure: 'decorative blocked chute shell presentation',
  };
  const materials = [
    observedMaterial(admittedChute, admittedOverride),
    observedMaterial(blockedChute, blockedOverride),
    observedMaterial(materialLab),
  ];

  const passing = evaluateMaterialTruth(contracts, materials);
  assert.equal(passing.status, 'pass', passing.errors.join('\n'));
  assert.equal(passing.expectedMeshCount, 3);
  assert.equal(passing.observedMaterialCount, 3);
  assert.ok(passing.meshes.every((mesh) => mesh.status === 'pass'));
  assert.deepEqual(
    passing.meshes.find((mesh) => mesh.objectId === 'AdmittedChuteShell')
      .overriddenProperties,
    ['transparent', 'opacity', 'side', 'depthWrite'],
  );

  for (const property of Object.keys(materialLab.props.materialProps)) {
    const tampered = structuredClone(materials);
    const effective = tampered.find((entry) => entry.objectId === 'MaterialLab').effective;
    const value = effective[property];
    if (typeof value === 'boolean') effective[property] = !value;
    else if (typeof value === 'number') effective[property] = value + 0.01;
    else effective[property] = '#ffffff';
    const failed = evaluateMaterialTruth(contracts, tampered);
    assert.equal(failed.status, 'fail', `tampered ${property} should fail`);
    assert.match(
      failed.errors.join('\n'),
      new RegExp(`MaterialLab: source-to-effective mismatch for ${property}`),
    );
  }

  for (const property of Object.keys(chuteOverrideValues)) {
    const tampered = structuredClone(materials);
    const effective = tampered.find(
      (entry) => entry.objectId === 'AdmittedChuteShell',
    ).effective;
    const value = effective[property];
    effective[property] = typeof value === 'boolean' ? !value : value + 0.01;
    const failed = evaluateMaterialTruth(contracts, tampered);
    assert.equal(failed.status, 'fail', `tampered override ${property} should fail`);
    assert.match(
      failed.errors.join('\n'),
      new RegExp(`AdmittedChuteShell: source-to-effective mismatch for ${property}`),
    );
  }

  const unauthorizedOverride = structuredClone(materials);
  unauthorizedOverride.find((entry) => entry.objectId === 'MaterialLab').overrides.push({
    scope: 'presentation',
    property: 'opacity',
    effectiveValue: 0.5,
    disclosure: 'undisclosed generic override',
  });
  const unauthorized = evaluateMaterialTruth(contracts, unauthorizedOverride);
  assert.equal(unauthorized.status, 'fail');
  assert.match(
    unauthorized.errors.join('\n'),
    /MaterialLab: presentation override disclosure mismatch/,
  );

  const tamperedSourceReceipt = structuredClone(materials);
  tamperedSourceReceipt.find((entry) => entry.objectId === 'MaterialLab').source.color =
    '#ffffff';
  const sourceMismatch = evaluateMaterialTruth(contracts, tamperedSourceReceipt);
  assert.equal(sourceMismatch.status, 'fail');
  assert.match(
    sourceMismatch.errors.join('\n'),
    /MaterialLab: receipted source mismatch for color/,
  );

  const invalidBasisContracts = structuredClone(contracts);
  invalidBasisContracts.projection.nodes.find(
    (node) => node.id === 'AdmittedChuteShell',
  ).props.properties.decorativeNonCollider = false;
  const invalidBasis = evaluateMaterialTruth(invalidBasisContracts, materials);
  assert.equal(invalidBasis.status, 'fail');
  assert.match(
    invalidBasis.errors.join('\n'),
    /AdmittedChuteShell: presentation override source basis is not satisfied/,
  );

  const missing = evaluateMaterialTruth(contracts, materials.slice(1));
  assert.equal(missing.status, 'fail');
  assert.match(missing.errors.join('\n'), /AdmittedChuteShell: material was not observed/);

  const duplicate = evaluateMaterialTruth(contracts, [...materials, materials[0]]);
  assert.equal(duplicate.status, 'fail');
  assert.match(duplicate.errors.join('\n'), /duplicate observed material id/);
}

function makeGlb(json) {
  const source = Buffer.from(JSON.stringify(json), 'utf8');
  const padding = (4 - (source.length % 4)) % 4;
  const jsonChunk = Buffer.concat([source, Buffer.alloc(padding, 0x20)]);
  const buffer = Buffer.alloc(12 + 8 + jsonChunk.length);
  buffer.write('glTF', 0, 'ascii');
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(jsonChunk.length, 12);
  buffer.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(buffer, 20);
  return buffer;
}

function residentAssetFixtureJson(overrides = {}) {
  return {
    asset: { version: '2.0', generator: 'focused unit fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'StormglassNeutralSeat01LOD0', mesh: 0, children: [1] },
      { name: 'Head' },
    ],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
    }],
    accessors: [
      { count: 3, componentType: 5126, type: 'VEC3' },
      { count: 3, componentType: 5123, type: 'SCALAR' },
    ],
    materials: [{}],
    ...overrides,
  };
}

function residentAssetFixtureManifest(glb, overrides = {}) {
  return {
    schema: 'hololand.model-village.neutral-resident-asset-candidate.v1',
    assetId: 'stormglass-neutral-seat-01-lod0',
    assetPath:
      'assets/model-village/residents/stormglass-neutral-seat-01-lod0.glb',
    sha256: createHash('sha256').update(glb).digest('hex'),
    byteSize: glb.length,
    counts: {
      triangles: 1,
      materials: 1,
      textures: 0,
      bones: 0,
      clips: 0,
    },
    gltfNodeCount: 2,
    meshBearingNodeCount: 1,
    gltfMeshDefinitionCount: 1,
    nodeAttachedLod0MeshCount: 1,
    nodeLodPlacementCount: 0,
    lowerLodNodeCount: 0,
    sceneReachableLowerLodNodeCount: 0,
    license: 'CC0-1.0 unit fixture',
    provenance: { generator: 'focused unit fixture' },
    anchors: {
      StormglassNeutralSeat01LOD0: [0, 0, 0],
      head: 'Head',
    },
    attachRootName: 'StormglassNeutralSeat01LOD0',
    lod: 'lod0',
    zeroExternalUris: true,
    uncompressed: true,
    observerProxyId: 'ObserverResident01',
    canonicalSeatId: 'ResidentSeat01',
    presentationProfile: 'research_live_blinded',
    attachment: {
      position: [-6, 0, 3.7],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      groundY: 0,
      groundingTolerance: 0.025,
      expectedHeightMinimum: 1.4,
      expectedHeightMaximum: 2.2,
    },
    ...overrides,
  };
}

function runResidentAssetValidatorUnitTest() {
  const validGlb = makeGlb(residentAssetFixtureJson());
  const validManifest = residentAssetFixtureManifest(validGlb);
  const normalized = normalizeResidentAssetManifest(validManifest);
  assert.equal(normalized.assetPath, validManifest.assetPath);
  assert.deepEqual(
    normalized.anchors,
    ['StormglassNeutralSeat01LOD0', 'Head'],
  );
  const custodyManifestShape = normalizeResidentAssetManifest({
    schema: validManifest.schema,
    assetId: validManifest.assetId,
    glbPath: validManifest.assetPath,
    sourcePath:
      'source/layers/vr/frontier/model-village/model-village-resident-base-lod0.holo',
    sourceSha256: '1'.repeat(64),
    sha256: validManifest.sha256,
    byteSize: validManifest.byteSize,
    lod0TriangleCount: 1,
    materialCount: 1,
    textureCount: 0,
    boneCount: 0,
    clipCount: 0,
    licenseSpdx: 'Elastic-2.0',
    provenance: 'HoloScript-authored unit fixture',
    anchorNames: ['StormglassNeutralSeat01LOD0', 'Head'],
    declaredLod: 0,
    externalUriCount: 0,
    dracoCompression: false,
    meshoptCompression: false,
    meshQuantization: false,
    observerProxyTarget: 'ObserverResident01',
    seatId: 'seat-01',
    presentationProfile: 'research_live_blinded',
    attachRootNode: 'StormglassNeutralSeat01LOD0',
    attachPosition: [-6, 0, 3.7],
    attachRotationDegrees: [0, 0, 0],
    attachScale: [1, 1, 1],
    groundTargetY: 0,
    groundingToleranceMeters: 0.001,
    expectedRuntimeHeightMetersMin: 2.45,
    expectedRuntimeHeightMetersMax: 2.49,
    inspectionCameraPosition: [-6, 1.35, 6.8],
    inspectionCameraTarget: [-6, 1.24, 3.7],
    inspectionCameraFovDegrees: 38,
  });
  assert.equal(custodyManifestShape.license, 'Elastic-2.0');
  assert.equal(
    custodyManifestShape.sourcePath,
    'source/layers/vr/frontier/model-village/model-village-resident-base-lod0.holo',
  );
  assert.equal(custodyManifestShape.sourceSha256, '1'.repeat(64));
  assert.equal(custodyManifestShape.counts.triangles, 1);
  assert.deepEqual(
    custodyManifestShape.anchors,
    ['StormglassNeutralSeat01LOD0', 'Head'],
  );
  assert.equal(custodyManifestShape.uncompressed, true);
  assert.equal(custodyManifestShape.canonicalSeatId, 'seat-01');
  assert.equal(
    custodyManifestShape.attachRootName,
    'StormglassNeutralSeat01LOD0',
  );
  assert.equal(custodyManifestShape.attachment.groundingTolerance, 0.001);
  assert.equal(custodyManifestShape.attachment.expectedHeightMinimum, 2.45);
  assert.equal(custodyManifestShape.inspectionCapture.fov, 38);
  const container = parseGlbContainer(validGlb);
  assert.equal(container.json.asset.version, '2.0');
  assert.deepEqual(container.chunks, [{
    index: 0,
    type: 'JSON',
    byteLength: container.chunks[0].byteLength,
  }]);
  const passing = validateResidentAssetGlb(validGlb, validManifest);
  assert.equal(passing.status, 'host_validated_neutral_shadow_candidate');
  assert.deepEqual(passing.host.counts, validManifest.counts);
  assert.equal(passing.host.uriReferences.length, 0);
  assert.equal(passing.host.compressionExtensions.length, 0);

  assert.throws(
    () => validateResidentAssetGlb(
      validGlb,
      { ...validManifest, sha256: '0'.repeat(64) },
    ),
    /manifest sha256 differs from host GLB sha256/,
  );
  assert.throws(
    () => validateResidentAssetGlb(
      validGlb,
      { ...validManifest, assetPath: '../escaped.glb' },
    ),
    /asset path must equal/,
  );
  assert.throws(
    () => validateResidentAssetGlb(
      validGlb,
      {
        ...validManifest,
        counts: { ...validManifest.counts, triangles: 2 },
      },
    ),
    /manifest triangles count 2 differs from 1/,
  );
  assert.throws(
    () => validateResidentAssetGlb(
      validGlb,
      {
        ...validManifest,
        anchors: ['StormglassNeutralSeat01LOD0', 'MissingHand'],
      },
    ),
    /GLB is missing anchors: MissingHand/,
  );

  const externalGlb = makeGlb(residentAssetFixtureJson({
    buffers: [{ byteLength: 8, uri: 'external.bin' }],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      externalGlb,
      residentAssetFixtureManifest(externalGlb),
    ),
    /GLB JSON contains URI fields/,
  );

  const compressedGlb = makeGlb(residentAssetFixtureJson({
    extensionsUsed: ['KHR_draco_mesh_compression'],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      compressedGlb,
      residentAssetFixtureManifest(compressedGlb),
    ),
    /forbidden compression extensions: KHR_draco_mesh_compression/,
  );

  const undeclaredExtensionGlb = makeGlb(residentAssetFixtureJson({
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
      extensions: { MSFT_lod: { ids: [] } },
    }],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      undeclaredExtensionGlb,
      residentAssetFixtureManifest(undeclaredExtensionGlb),
    ),
    /uses undeclared extensions: MSFT_lod/,
  );

  const declaredMeshExtensionGlb = makeGlb(residentAssetFixtureJson({
    extensionsUsed: ['MSFT_lod'],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
      extensions: { MSFT_lod: { ids: [] } },
    }],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      declaredMeshExtensionGlb,
      residentAssetFixtureManifest(declaredMeshExtensionGlb),
    ),
    /MSFT_lod may appear only on nodes or materials/,
  );

  const nodeLodFixtureJson = residentAssetFixtureJson({
    extensionsUsed: ['MSFT_lod'],
    nodes: [
      {
        name: 'StormglassNeutralSeat01LOD0',
        mesh: 0,
        children: [1],
        extensions: { MSFT_lod: { ids: [2] } },
      },
      { name: 'Head' },
      { name: 'StormglassNeutralSeat01LOD1', mesh: 1 },
    ],
    meshes: [
      {
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          material: 0,
        }],
      },
      {
        primitives: [{
          attributes: { POSITION: 2 },
          indices: 3,
          material: 0,
        }],
      },
    ],
    accessors: [
      { count: 6, componentType: 5126, type: 'VEC3' },
      { count: 6, componentType: 5123, type: 'SCALAR' },
      { count: 3, componentType: 5126, type: 'VEC3' },
      { count: 3, componentType: 5123, type: 'SCALAR' },
    ],
  });
  const nodeLodGlb = makeGlb(nodeLodFixtureJson);
  const nodeLodManifest = (glb, overrides = {}) =>
    residentAssetFixtureManifest(glb, {
      gltfNodeCount: 3,
      meshBearingNodeCount: 2,
      gltfMeshDefinitionCount: 2,
      nodeAttachedLod0MeshCount: 1,
      nodeLodPlacementCount: 1,
      lowerLodNodeCount: 1,
      sceneReachableLowerLodNodeCount: 0,
      counts: {
        triangles: 2,
        materials: 1,
        textures: 0,
        bones: 0,
        clips: 0,
      },
      ...overrides,
    });
  const nodeLodValidation = validateResidentAssetGlb(
    nodeLodGlb,
    nodeLodManifest(nodeLodGlb),
  );
  assert.deepEqual(
    nodeLodValidation.host.msftLod.placements,
    [{
      kind: 'node',
      index: 0,
      ids: [2],
      triangleCounts: [2, 1],
      lowerQualityOrderInferred: true,
    }],
  );
  assert.equal(nodeLodValidation.host.msftLod.rootDeclared, true);

  const reachableLowerNodeJson = structuredClone(nodeLodFixtureJson);
  reachableLowerNodeJson.nodes[0].children.push(2);
  const reachableLowerNodeGlb = makeGlb(reachableLowerNodeJson);
  assert.throws(
    () => validateResidentAssetGlb(
      reachableLowerNodeGlb,
      nodeLodManifest(reachableLowerNodeGlb, {
        sceneReachableLowerLodNodeCount: 1,
      }),
    ),
    /lower nodes must be outside the default scene reachability set/,
  );

  const transformedLowerNodeJson = structuredClone(nodeLodFixtureJson);
  transformedLowerNodeJson.nodes[2].translation = [1, 0, 0];
  const transformedLowerNodeGlb = makeGlb(transformedLowerNodeJson);
  assert.throws(
    () => validateResidentAssetGlb(
      transformedLowerNodeGlb,
      nodeLodManifest(transformedLowerNodeGlb),
    ),
    /lower node\[2\] transform differs from high node\[0\]/,
  );

  const skinnedLowerNodeJson = structuredClone(nodeLodFixtureJson);
  skinnedLowerNodeJson.nodes[2].skin = 0;
  skinnedLowerNodeJson.skins = [{ joints: [1] }];
  const skinnedLowerNodeGlb = makeGlb(skinnedLowerNodeJson);
  assert.throws(
    () => validateResidentAssetGlb(
      skinnedLowerNodeGlb,
      nodeLodManifest(skinnedLowerNodeGlb, {
        counts: {
          triangles: 2,
          materials: 1,
          textures: 0,
          bones: 1,
          clips: 0,
        },
      }),
    ),
    /lower node\[2\] must not bind a skin/,
  );

  const invalidLowerMeshJson = structuredClone(nodeLodFixtureJson);
  invalidLowerMeshJson.nodes[2].mesh = 99;
  const invalidLowerMeshGlb = makeGlb(invalidLowerMeshJson);
  assert.throws(
    () => validateResidentAssetGlb(
      invalidLowerMeshGlb,
      nodeLodManifest(invalidLowerMeshGlb, {
        meshBearingNodeCount: 2,
      }),
    ),
    /lower node\[2\] must reference an in-range mesh/,
  );

  const missingHighMeshJson = structuredClone(nodeLodFixtureJson);
  delete missingHighMeshJson.nodes[0].mesh;
  const missingHighMeshGlb = makeGlb(missingHighMeshJson);
  assert.throws(
    () => validateResidentAssetGlb(
      missingHighMeshGlb,
      nodeLodManifest(missingHighMeshGlb),
    ),
    /node\[0\] must reference an in-range mesh for triangle-order validation/,
  );

  const duplicatedLowerTargetJson = structuredClone(nodeLodFixtureJson);
  duplicatedLowerTargetJson.scenes[0].nodes = [0, 2];
  duplicatedLowerTargetJson.nodes = [
    {
      ...duplicatedLowerTargetJson.nodes[0],
      extensions: { MSFT_lod: { ids: [3] } },
    },
    duplicatedLowerTargetJson.nodes[1],
    {
      name: 'SecondHighLOD0',
      mesh: 0,
      extensions: { MSFT_lod: { ids: [3] } },
    },
    {
      ...duplicatedLowerTargetJson.nodes[2],
      name: 'SharedLowerLOD1',
    },
  ];
  const duplicatedLowerTargetGlb = makeGlb(duplicatedLowerTargetJson);
  assert.throws(
    () => validateResidentAssetGlb(
      duplicatedLowerTargetGlb,
      nodeLodManifest(duplicatedLowerTargetGlb, {
        gltfNodeCount: 4,
        meshBearingNodeCount: 3,
        nodeAttachedLod0MeshCount: 2,
        nodeLodPlacementCount: 2,
        lowerLodNodeCount: 1,
        counts: {
          triangles: 4,
          materials: 1,
          textures: 0,
          bones: 0,
          clips: 0,
        },
      }),
    ),
    /lower node targets must be unique across placements/,
  );

  const undeclaredNodeLodGlb = makeGlb(residentAssetFixtureJson({
    nodes: [
      {
        name: 'StormglassNeutralSeat01LOD0',
        mesh: 0,
        children: [1],
        extensions: { MSFT_lod: { ids: [2] } },
      },
      { name: 'Head' },
      { name: 'StormglassNeutralSeat01LOD1' },
    ],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      undeclaredNodeLodGlb,
      residentAssetFixtureManifest(undeclaredNodeLodGlb),
    ),
    /MSFT_lod placement is missing from root extensionsUsed/,
  );

  const outOfRangeNodeLodGlb = makeGlb(residentAssetFixtureJson({
    extensionsUsed: ['MSFT_lod'],
    nodes: [
      {
        name: 'StormglassNeutralSeat01LOD0',
        mesh: 0,
        children: [1],
        extensions: { MSFT_lod: { ids: [99] } },
      },
      { name: 'Head' },
    ],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      outOfRangeNodeLodGlb,
      residentAssetFixtureManifest(outOfRangeNodeLodGlb),
    ),
    /is not an in-range node index/,
  );

  const wrongOrderNodeLodGlb = makeGlb(residentAssetFixtureJson({
    extensionsUsed: ['MSFT_lod'],
    nodes: [
      {
        name: 'StormglassNeutralSeat01LOD0',
        mesh: 0,
        children: [1],
        extensions: { MSFT_lod: { ids: [2] } },
      },
      { name: 'Head' },
      { name: 'StormglassNeutralSeat01LOD1', mesh: 1 },
    ],
    meshes: [
      {
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          material: 0,
        }],
      },
      {
        primitives: [{
          attributes: { POSITION: 2 },
          indices: 3,
          material: 0,
        }],
      },
    ],
    accessors: [
      { count: 3, componentType: 5126, type: 'VEC3' },
      { count: 3, componentType: 5123, type: 'SCALAR' },
      { count: 6, componentType: 5126, type: 'VEC3' },
      { count: 6, componentType: 5123, type: 'SCALAR' },
    ],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      wrongOrderNodeLodGlb,
      residentAssetFixtureManifest(wrongOrderNodeLodGlb),
    ),
    /triangle order is not strictly lower quality: 1 -> 2/,
  );

  const unusedDeclarationGlb = makeGlb(residentAssetFixtureJson({
    extensionsUsed: ['MSFT_lod'],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      unusedDeclarationGlb,
      residentAssetFixtureManifest(unusedDeclarationGlb),
    ),
    /declares MSFT_lod without a placement/,
  );

  const unboundSkinGlb = makeGlb(residentAssetFixtureJson({
    skins: [{ joints: [1] }],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      unboundSkinGlb,
      residentAssetFixtureManifest(unboundSkinGlb, {
        productionRigClaimed: true,
        counts: {
          triangles: 1,
          materials: 1,
          textures: 0,
          bones: 1,
          clips: 0,
        },
      }),
    ),
    /claims a production rig without a bound skin/,
  );

  const overBudgetGlb = makeGlb(residentAssetFixtureJson({
    accessors: [
      { count: 45_003, componentType: 5126, type: 'VEC3' },
      { count: 45_003, componentType: 5123, type: 'SCALAR' },
    ],
  }));
  assert.throws(
    () => validateResidentAssetGlb(
      overBudgetGlb,
      residentAssetFixtureManifest(overBudgetGlb, {
        counts: {
          triangles: 15_001,
          materials: 1,
          textures: 0,
          bones: 0,
          clips: 0,
        },
      }),
    ),
    /exceeds 15000/,
  );

  const invalidMagic = Buffer.from(validGlb);
  invalidMagic.write('nope', 0, 'ascii');
  assert.throws(
    () => parseGlbContainer(invalidMagic),
    /GLB magic must be glTF/,
  );
}

function runResidentAssetSovereignSourceValidatorUnitTest() {
  const fixtureRoot = mkdtempSync(
    path.join(tmpdir(), 'hololand-resident-source-custody-'),
  );
  const sourcePath =
    'source/layers/vr/frontier/model-village/model-village-resident-base-lod0.holo';
  const sourceFile = path.join(fixtureRoot, ...sourcePath.split('/'));
  const unrelatedPath =
    'source/layers/vr/frontier/model-village/unrelated-resident.holo';
  const unrelatedFile = path.join(
    fixtureRoot,
    ...unrelatedPath.split('/'),
  );
  const sourceBytes = Buffer.from(
    'composition "Sovereign Resident Fixture" {}',
    'utf8',
  );
  const sourceSha256 = createHash('sha256')
    .update(sourceBytes)
    .digest('hex');
  try {
    mkdirSync(path.dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, sourceBytes);
    writeFileSync(
      unrelatedFile,
      'composition "Unrelated Resident Fixture" {}',
      'utf8',
    );
    const manifest = { sourcePath, sourceSha256 };
    assert.deepEqual(
      validateResidentAssetSovereignSource(fixtureRoot, manifest),
      {
        status: 'host_validated_sovereign_holoscript_source',
        path: sourcePath,
        sha256: sourceSha256,
        byteSize: sourceBytes.byteLength,
        repositoryContained: true,
        symlinkContained: true,
      },
    );
    assert.throws(
      () => validateResidentAssetSovereignSource(
        fixtureRoot,
        { ...manifest, sourceSha256: '0'.repeat(64) },
      ),
      /manifest source sha256 differs from sovereign source sha256/,
    );
    assert.throws(
      () => validateResidentAssetSovereignSource(
        fixtureRoot,
        { sourcePath: unrelatedPath, sourceSha256 },
      ),
      /source path must equal/,
    );
    assert.throws(
      () => validateResidentAssetSovereignSource(
        fixtureRoot,
        { sourcePath: '../outside.holo', sourceSha256 },
      ),
      /source path escapes the HoloLand repository/,
    );
    writeFileSync(
      sourceFile,
      'composition "Tampered Resident Fixture" {}',
      'utf8',
    );
    assert.throws(
      () => validateResidentAssetSovereignSource(
        fixtureRoot,
        manifest,
      ),
      /manifest source sha256 differs from sovereign source sha256/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

runMaterialTruthUnitTest();
runResidentAssetValidatorUnitTest();
runResidentAssetSovereignSourceValidatorUnitTest();

const materialsOnly = process.argv.includes('--materials-only');
if (!materialsOnly) {
try {
  const { receipt, receiptPath, screenshots } = await runRenderingGate({
    root: repoRoot,
    holoScriptRoot,
    outputDir,
    canonicalBoundary: true,
    timeoutMs: 60_000,
  });

  assert.equal(receipt.schema, 'hololand.model-village.rendering-witness.v0.4.0');
  assert.equal(receipt.status, 'pass');
  assert.ok(Object.values(receipt.assertions).every(Boolean));
  assert.equal(receipt.source.parser, 'HoloCompositionParser');
  assert.equal(receipt.source.compiler, 'SceneIRCompiler');
  assert.equal(receipt.source.projection.meshCount, 29);
  assert.equal(receipt.source.calibration.meshCount, 10);
  assert.equal(receipt.source.sourceSemanticsRewritten, false);
  assert.equal(receipt.physics.canonicalBoundary.enabled, true);
  assert.equal(receipt.physics.canonicalBoundary.observedBoundaryMatch, true);
  assert.equal(receipt.physics.canonicalBoundary.projectionToggleExecuted, true);
  assert.equal(receipt.observerBoundary.consumerExecuted, true);
  assert.equal(receipt.observerBoundary.isolatedProjectionToggleExecuted, true);
  assert.equal(receipt.observerBoundary.canonicalAuthoritativeMutationDelta, 0);
  assert.equal(receipt.observerBoundary.off.payload.consumerEnabled, false);
  assert.deepEqual(
    Object.keys(receipt.observerBoundary.off.payload).sort(),
    [
      'canonicalPayload',
      'consumerEnabled',
      'payloadDigest',
      'schema',
      'source',
      'trustedActionBinding',
    ],
  );
  assert.equal(
    receipt.observerBoundary.off.browserObserved.consumerAcknowledgement.status,
    'withheld',
  );
  assert.equal(receipt.observerBoundary.on.payload.consumerEnabled, true);
  const trustedActionBinding =
    receipt.physics.canonicalBoundary.after.boundedRuntimeObserver
      .trustedActionBinding;
  const observerEnvelopeVerification = verifyObserverBoundaryEnvelope(
    receipt.observerBoundary.on.payload,
    { trustedActionBinding },
  );
  assert.equal(
    observerEnvelopeVerification.valid,
    true,
    observerEnvelopeVerification.errors.join('\n'),
  );
  assert.equal(observerEnvelopeVerification.core.available, true);
  assert.equal(
    observerEnvelopeVerification.core.boundedRuntimeSceneObjectCount,
    12,
  );
  assert.equal(
    observerEnvelopeVerification.core.canonicalVisibleWorld.objectCount,
    12,
  );
  assert.equal(
    trustedActionBinding.blockedPreviousEntryHash,
    trustedActionBinding.admittedActionEntryHash,
  );
  assert.equal(
    trustedActionBinding.actionReceiptRoot,
    trustedActionBinding.blockedActionEntryHash,
  );
  assert.equal(
    receipt.observerBoundary.on.browserObserved.consumerAcknowledgement.status,
    'pass',
  );
  assert.equal(
    receipt.observerBoundary.on.browserObserved.consumerAcknowledgement
      .computedPayloadDigest,
    receipt.observerBoundary.on.payload.payloadDigest,
  );
  assert.equal(
    Object.keys(
      receipt.observerBoundary.on.browserObserved.canonicalFields,
    ).length,
    7,
  );
  assert.equal(receipt.observerBoundary.off.heroPresentation.verified, false);
  assert.match(
    receipt.observerBoundary.off.heroPresentation.subtitle,
    /withheld/i,
  );
  assert.doesNotMatch(
    JSON.stringify(receipt.observerBoundary.off.heroPresentation),
    /one verified water contribution|verified v4 receipts/i,
  );
  assert.equal(receipt.observerBoundary.on.heroPresentation.verified, true);
  assert.match(
    receipt.observerBoundary.on.heroPresentation.truthChip,
    /verified v4 receipts/i,
  );
  assert.ok(
    receipt.claimBoundary.observed.some(
      (claim) =>
        /canonical scene payload withheld.*sha-256 acknowledged/i.test(claim),
    ),
  );
  assert.ok(
    receipt.claimBoundary.notObserved.every(
      (claim) => claim !== 'isolated observer projection off/on consumer toggle',
    ),
  );
  const detachedSiblingTamper = {
    ...structuredClone(receipt.observerBoundary.on.payload),
    livingCommons: { publicWaterUnits: 999 },
  };
  assert.equal(
    verifyObserverBoundaryEnvelope(detachedSiblingTamper, {
      trustedActionBinding,
    }).valid,
    false,
  );
  const digestMismatchTamper =
    structuredClone(receipt.observerBoundary.on.payload);
  digestMismatchTamper.canonicalPayload += ' ';
  assert.equal(
    verifyObserverBoundaryEnvelope(digestMismatchTamper, {
      trustedActionBinding,
    }).valid,
    false,
  );
  const sourceLabelTamper =
    structuredClone(receipt.observerBoundary.on.payload);
  sourceLabelTamper.source = 'attacker_supplied_payload';
  assert.equal(
    verifyObserverBoundaryEnvelope(sourceLabelTamper, {
      trustedActionBinding,
    }).valid,
    false,
  );
  const coordinatedChainTamper =
    structuredClone(observerEnvelopeVerification.core);
  coordinatedChainTamper.livingCommons.admittedAction.entryHash =
    'a'.repeat(64);
  coordinatedChainTamper.livingCommons.blockedAction.previousEntryHash =
    'a'.repeat(64);
  coordinatedChainTamper.livingCommons.blockedAction.entryHash =
    'b'.repeat(64);
  coordinatedChainTamper.livingCommons.actionReceiptRoot = 'b'.repeat(64);
  coordinatedChainTamper.canonicalFields.actionReceiptRoot = 'b'.repeat(64);
  assert.throws(
    () => createObserverBoundaryEnvelope(coordinatedChainTamper, {
      trustedActionBinding,
    }),
    /trusted execution binding/i,
  );
  for (const mutate of [
    (core) => {
      core.livingCommons.publicWaterUnits = 4;
    },
    (core) => {
      core.livingCommons.actionReceiptRoot = '7'.repeat(64);
    },
    (core) => {
      core.livingCommons.blockedAction.entryHash = '8'.repeat(64);
    },
    (core) => {
      core.livingCommons.blockedAction.previousEntryHash = '9'.repeat(64);
    },
    (core) => {
      core.verifiedReceiptHash = null;
    },
    (core) => {
      core.boundedRuntimeSceneObjectCount = 4;
    },
  ]) {
    const tamperedCore = structuredClone(observerEnvelopeVerification.core);
    mutate(tamperedCore);
    assert.throws(
      () => createObserverBoundaryEnvelope(tamperedCore, {
        trustedActionBinding,
      }),
      /observer boundary core is invalid/i,
    );
  }
  assert.match(
    receipt.source.observerPolicy.browserRenderEvidenceEnforcement,
    /browser_payload_sha256_acknowledged/,
  );
  assert.ok(receipt.physics.frameTraceSha256);
  assert.ok(receipt.physics.visualFrameSha256);
  assert.ok(receipt.physics.settledFrameSha256);
  assert.equal(receipt.renderer.existingReactThreeAdapterUsed, false);
  assert.equal(receipt.renderer.environment.hdri, false);
  assert.equal(receipt.renderer.environment.networkAssetFetches, 0);
  assert.equal(receipt.renderer.effective.outputColorSpace, 'srgb');
  assert.equal(receipt.renderer.effective.toneMapping, 'ACESFilmicToneMapping');
  assert.equal(receipt.renderer.effective.shadowMapType, 'PCFSoftShadowMap');
  assert.equal(receipt.renderer.materials.length, 39);
  assert.ok(receipt.renderer.materials.every((entry) => entry.effective.type === 'MeshPhysicalMaterial'));
  assert.equal(receipt.assertions.sourceMaterialsMatchEffective, true);
  assert.equal(receipt.renderer.materialTruth.status, 'pass');
  assert.equal(receipt.renderer.materialTruth.expectedMeshCount, 39);
  assert.equal(receipt.renderer.materialTruth.observedMaterialCount, 39);
  assert.ok(receipt.renderer.materialTruth.meshes.every((entry) => entry.status === 'pass'));
  assert.equal(
    receipt.residentAsset.host.status,
    'host_validated_neutral_shadow_candidate',
  );
  assert.equal(
    receipt.residentAsset.host.sovereignSource.status,
    'host_validated_sovereign_holoscript_source',
  );
  assert.equal(
    receipt.residentAsset.host.sovereignSource.path,
    receipt.residentAsset.host.manifest.sourcePath,
  );
  assert.equal(
    receipt.residentAsset.host.sovereignSource.sha256,
    receipt.residentAsset.host.manifest.sourceSha256,
  );
  assert.match(
    receipt.residentAsset.host.manifest.manifestSourceSha256,
    /^[a-f0-9]{64}$/,
  );
  assert.notEqual(
    receipt.residentAsset.host.manifest.manifestSourceSha256,
    receipt.residentAsset.host.manifest.sourceSha256,
  );
  assert.equal(
    receipt.residentAsset.host.host.definitionCounts.meshDefinitions,
    receipt.residentAsset.host.manifest.structure.meshDefinitions,
  );
  assert.equal(receipt.residentAsset.host.host.definitionCounts.attachedMeshNodes, 30);
  assert.equal(receipt.residentAsset.host.host.msftLod.rootDeclared, true);
  assert.equal(
    receipt.residentAsset.host.host.msftLod.invalidPlacementPaths.length,
    0,
  );
  assert.equal(
    receipt.residentAsset.host.host.msftLod.placements.length,
    receipt.residentAsset.host.manifest.structure.nodeLodPlacements,
  );
  assert.ok(
    receipt.residentAsset.host.host.msftLod.placements.every(
      (entry) =>
        entry.kind === 'node'
        && entry.ids.length >= 1
        && entry.triangleCounts.length === entry.ids.length + 1
        && entry.lowerQualityOrderInferred === true
        && entry.triangleCounts.every(
          (triangles, index, counts) =>
            index === 0 || counts[index - 1] > triangles,
        ),
    ),
  );
  const lodIsolation =
    receipt.residentAsset.host.host.msftLod.runtimeIsolation;
  assert.equal(
    lodIsolation.totalNodes,
    receipt.residentAsset.host.manifest.structure.totalNodes,
  );
  assert.equal(
    lodIsolation.meshBearingNodes,
    receipt.residentAsset.host.manifest.structure.meshBearingNodes,
  );
  assert.equal(
    lodIsolation.lowerLodNodeCount,
    receipt.residentAsset.host.manifest.structure.lowerLodNodes,
  );
  assert.equal(lodIsolation.sceneReachableLowerLodNodeCount, 0);
  assert.equal(lodIsolation.sceneGraphReferencedLowerLodNodeCount, 0);
  assert.equal(
    lodIsolation.validLowerMeshCount,
    lodIsolation.lowerLodNodeCount,
  );
  assert.equal(
    lodIsolation.copiedTransformCount,
    lodIsolation.lowerLodNodeCount,
  );
  assert.equal(
    lodIsolation.unskinnedLowerNodeCount,
    lodIsolation.lowerLodNodeCount,
  );
  assert.equal(lodIsolation.lowerNodeTargetsUnique, true);
  assert.equal(receipt.residentAsset.host.host.rig.skinDefinitions, 1);
  assert.equal(receipt.residentAsset.host.host.rig.jointDefinitions, 20);
  assert.equal(receipt.residentAsset.host.host.rig.skinBoundNodes, 0);
  assert.equal(receipt.residentAsset.host.host.rig.productionRigObserved, false);
  assert.equal(receipt.residentAsset.observerOnBrowser.runtimeMeshCount, 30);
  assert.equal(receipt.residentAsset.observerOnBrowser.runtimeCounts.bones, 0);
  assert.equal(receipt.residentAsset.observerOnBrowser.proxy.totalCapsules, 6);
  assert.equal(receipt.residentAsset.observerOnBrowser.proxy.visibleCapsules.length, 5);
  assert.equal(receipt.residentAsset.observerOnBrowser.proxy.visibleAfter, false);
  assert.equal(receipt.residentAsset.observerOnBrowser.assetNetworkRequests, 0);
  assert.equal(receipt.residentAsset.materialCatalogIsolation.sourceMaterialCount, 39);
  assert.equal(
    receipt.residentAsset.materialCatalogIsolation
      .residentMaterialsIncludedInSourceMaterialTruth,
    false,
  );
  assert.equal(
    receipt.renderer.livingCommonsPresentation.status,
    'receipts_consumed',
  );
  assert.equal(
    receipt.renderer.livingCommonsPresentation.referencedActionReceipts.length,
    2,
  );
  assert.equal(receipt.renderer.portraitUiChrome.status, 'pass');
  assert.ok(Object.values(receipt.renderer.portraitUiChrome.checks).every(Boolean));
  assert.ok(receipt.renderer.portraitUiChrome.cardFooterGap >= 8);
  assert.match(
    receipt.renderer.portraitUiChrome.uiChrome.admittedLegend.text,
    /admitted route/i,
  );
  assert.match(
    receipt.renderer.portraitUiChrome.uiChrome.blockedLegend.text,
    /blocked route/i,
  );
  assert.notEqual(
    receipt.renderer.portraitUiChrome.uiChrome.backendProvenance.textOverflow,
    'ellipsis',
  );
  assert.ok(
    receipt.renderer.portraitUiChrome.uiChrome.backendProvenance.scrollWidth
      <= receipt.renderer.portraitUiChrome.uiChrome.backendProvenance.clientWidth + 1,
  );
  assert.ok(
    receipt.renderer.portraitUiChrome.uiChrome.backendProvenance.scrollHeight
      <= receipt.renderer.portraitUiChrome.uiChrome.backendProvenance.clientHeight + 1,
  );
  assert.equal(receipt.browser.gl.contextType, 'webgl2');
  assert.equal(receipt.browser.softwareFallback.detected, false);
  assert.notEqual(receipt.browser.backendObserved, 'unclassified WebGL backend');
  assert.equal(receipt.browser.externalNetworkRequests.length, 0);
  assert.equal(receipt.browser.exceptions.length, 0);
  assert.ok(receipt.browser.timings.frameCadence.samples >= 170);
  assert.ok(receipt.browser.timings.cpuRenderSubmit.samples >= 170);
  assert.deepEqual(
    receipt.screenshots.map((capture) => [
      capture.id,
      capture.dimensions.width,
      capture.dimensions.height,
    ]),
    [
      ['hero-desktop', 1600, 900],
      ['hero-portrait', 390, 844],
      ['hero-settled', 1600, 900],
      ['calibration-desktop', 1600, 900],
      ['resident-asset-closeup', 1200, 900],
    ],
  );
  assert.ok(receipt.screenshots.every((capture) => capture.sha256 && capture.bytes > 25_000));
  assert.equal(
    receipt.screenshots.find((capture) => capture.id === 'hero-portrait')
      .uiChrome.blockedLegend.visible,
    true,
  );
  assert.equal(screenshots.length, 5);
  assert.ok(screenshots.every((filePath) => existsSync(filePath)));
  assert.equal(existsSync(receiptPath), true);

  const persisted = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(persisted.receipt.receiptHash, receipt.receipt.receiptHash);

  assert.deepEqual(
    classifySoftwareRenderer({
      maskedVendor: 'Google Inc.',
      maskedRenderer: 'WebKit WebGL',
      unmaskedVendor: 'Google Inc.',
      unmaskedRenderer: 'ANGLE (Google, Vulkan 1.3 SwiftShader Device)',
    }),
    {
      detected: true,
      indicators: ['swiftshader'],
      basis: 'browser WebGL masked and WEBGL_debug_renderer_info strings',
    },
  );
  assert.equal(
    inferGraphicsBackend({
      unmaskedRenderer: 'ANGLE (NVIDIA, GeForce RTX, D3D11)',
    }),
    'ANGLE Direct3D 11',
  );
  assert.throws(() => pngDimensions(Buffer.alloc(24)), /valid PNG/);

  const skippedBoundary = await runRenderingGate({
    root: repoRoot,
    holoScriptRoot,
    outputDir: path.join(outputDir, 'skip-boundary'),
    canonicalBoundary: false,
    timeoutMs: 60_000,
  });
  assert.equal(skippedBoundary.receipt.status, 'pass');
  assert.equal(
    skippedBoundary.receipt.observerBoundary.consumerExecuted,
    false,
  );
  assert.equal(
    skippedBoundary.receipt.observerBoundary.isolatedProjectionToggleExecuted,
    false,
  );
  assert.equal(
    skippedBoundary.receipt.observerBoundary.on.payload.consumerEnabled,
    false,
  );
  assert.ok(
    skippedBoundary.receipt.claimBoundary.notObserved.includes(
      'browser observer projection off/on consumer toggle',
    ),
  );
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
}

console.log(
  materialsOnly
    ? 'PASS HoloLand Model Village source-to-effective material truth unit gate'
    : 'PASS HoloLand Model Village rendering truth gate',
);
