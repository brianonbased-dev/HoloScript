#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalJson,
  runPhysicsCheck,
} from './check-hololand-model-village-physics.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SCHEMA = 'hololand.model-village.rendering-witness.v0.4.0';
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'rendering-witness',
);
const PROJECTION_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo';
const CALIBRATION_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-render-calibration.holo';
const RESIDENT_ASSET_MANIFEST_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-resident-asset-manifest.holo';
const RESIDENT_ASSET_PATH =
  'assets/model-village/residents/stormglass-neutral-seat-01-lod0.glb';
const RESIDENT_ASSET_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-resident-base-lod0.holo';
const OBSERVER_POLICY_SOURCE =
  'source/domains/agents/model-village-observer-witness.hsplus';
const RESIDENT_ASSET_SCHEMA =
  'hololand.model-village.neutral-resident-asset-candidate.v1';
const RESIDENT_ASSET_BROWSER_SCHEMA =
  'hololand.model-village.neutral-resident-asset-browser-witness.v1';
const RESIDENT_ASSET_ATTACH_ROOT = 'StormglassNeutralSeat01LOD0';
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_BIN_CHUNK_TYPE = 0x004e4942;
const LOD0_TRIANGLE_BUDGET = 15_000;
const COMPRESSION_EXTENSION_PATTERN =
  /(?:KHR_draco_mesh_compression|EXT_meshopt_compression|KHR_texture_basisu)/i;
const REQUIRED_OBSERVER_BOUNDARY_FIELDS = Object.freeze([
  'canonicalSceneHash',
  'canonicalPoseHash',
  'logicalClockHash',
  'publicStateHash',
  'executedScheduleHash',
  'residentObservationHash',
  'actionReceiptRoot',
]);
const CANONICAL_VISIBLE_WORLD_IDS = Object.freeze([
  'EmergencyStop',
  'IsolationBoundary',
  'ObserverDeck',
  'PublicStateBoard',
  'ReceiptLedger',
  'ResidentSeat01',
  'ResidentSeat02',
  'ResidentSeat03',
  'ResidentSeat04',
  'ResidentSeat05',
  'ResidentSeat06',
  'VillageCommons',
]);
const OBSERVER_BOUNDARY_CORE_KEYS = Object.freeze([
  'available',
  'boundedRuntimeReceiptValidated',
  'boundedRuntimeSceneObjectCount',
  'browserMayWriteCanonicalState',
  'canonicalFields',
  'canonicalVisibleWorld',
  'comparison',
  'livingCommons',
  'projectionToggleExecuted',
  'readOnlySourceContractHash',
  'requiredFields',
  'source',
  'sourceHashes',
  'sourceRunCommitment',
  'terminalCommitment',
  'verifiedPersistence',
  'verifiedReceiptHash',
]);
const OBSERVER_BOUNDARY_ENVELOPE_KEYS = Object.freeze([
  'canonicalPayload',
  'consumerEnabled',
  'payloadDigest',
  'schema',
  'source',
  'trustedActionBinding',
]);
const OBSERVER_BOUNDARY_ENVELOPE_SCHEMA =
  'hololand.model-village.observer-browser-envelope.v1';
const TRUSTED_ACTION_BINDING_KEYS = Object.freeze([
  'actionReceiptRoot',
  'admittedActionEntryHash',
  'admittedPreviousEntryHash',
  'bindingHash',
  'blockedActionEntryHash',
  'blockedPreviousEntryHash',
  'phase0BReceiptHash',
  'schema',
  'sourceRunCommitment',
  'terminalCommitment',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_AUTHORED_MATERIAL_PROPERTIES = Object.freeze([
  'color',
  'metalness',
  'roughness',
]);
const MATERIAL_EFFECTIVE_DEFAULTS = Object.freeze({
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
});
const MATERIAL_SOURCE_PROPERTIES = Object.freeze(
  Object.keys(MATERIAL_EFFECTIVE_DEFAULTS).filter(
    (property) => property !== 'type' && property !== 'side' && property !== 'depthWrite',
  ),
);
const ALLOWED_MATERIAL_PRESENTATION_OVERRIDES = Object.freeze({
  AdmittedChuteShell: Object.freeze({
    scene: 'projection',
    sourceBasis: Object.freeze({
      presentationRole: 'admitted_gravity_chute',
      decorativeNonCollider: true,
    }),
    values: Object.freeze({
      transparent: true,
      opacity: 0.34,
      side: 2,
      depthWrite: false,
    }),
    disclosure: 'decorative admitted chute shell presentation',
  }),
  BlockedChuteShell: Object.freeze({
    scene: 'projection',
    sourceBasis: Object.freeze({
      presentationRole: 'blocked_gravity_chute',
      decorativeNonCollider: true,
    }),
    values: Object.freeze({
      transparent: true,
      opacity: 0.34,
      side: 2,
      depthWrite: false,
    }),
    disclosure: 'decorative blocked chute shell presentation',
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function asUint8Array(value) {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('GLB input must be an ArrayBuffer or Uint8Array');
}

export function parseGlbContainer(value) {
  const bytes = asUint8Array(value);
  if (bytes.byteLength < 20) {
    throw new Error('GLB is shorter than its header and JSON chunk header');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (magic !== GLB_MAGIC) throw new Error('GLB magic must be glTF');
  if (version !== 2) throw new Error(`GLB version must be 2, observed ${version}`);
  if (declaredLength !== bytes.byteLength) {
    throw new Error(
      `GLB declared length ${declaredLength} differs from ${bytes.byteLength} bytes`,
    );
  }

  const chunks = [];
  let offset = 12;
  while (offset < declaredLength) {
    if (offset + 8 > declaredLength) {
      throw new Error('GLB chunk header extends beyond declared length');
    }
    const byteLength = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    const end = dataOffset + byteLength;
    if (byteLength % 4 !== 0) {
      throw new Error(`GLB chunk ${chunks.length} length is not 4-byte aligned`);
    }
    if (end > declaredLength) {
      throw new Error(`GLB chunk ${chunks.length} extends beyond declared length`);
    }
    chunks.push({
      index: chunks.length,
      type,
      byteLength,
      dataOffset,
      end,
    });
    offset = end;
  }
  if (offset !== declaredLength) {
    throw new Error('GLB chunks do not end at the declared length');
  }
  if (chunks.length === 0 || chunks[0].type !== GLB_JSON_CHUNK_TYPE) {
    throw new Error('GLB first chunk must be JSON');
  }
  if (chunks.filter((chunk) => chunk.type === GLB_JSON_CHUNK_TYPE).length !== 1) {
    throw new Error('GLB must contain exactly one JSON chunk');
  }
  if (chunks.filter((chunk) => chunk.type === GLB_BIN_CHUNK_TYPE).length > 1) {
    throw new Error('GLB must contain at most one BIN chunk');
  }
  const unknownChunks = chunks.filter(
    (chunk) => (
      chunk.type !== GLB_JSON_CHUNK_TYPE
      && chunk.type !== GLB_BIN_CHUNK_TYPE
    ),
  );
  if (unknownChunks.length > 0) {
    throw new Error('GLB contains unsupported non-JSON/BIN chunks');
  }

  const jsonChunk = chunks[0];
  const jsonText = new TextDecoder()
    .decode(bytes.subarray(jsonChunk.dataOffset, jsonChunk.end))
    .replace(/[\u0000 ]+$/u, '');
  let json;
  try {
    json = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`GLB JSON chunk is invalid: ${error.message}`);
  }
  if (json?.asset?.version !== '2.0') {
    throw new Error('GLB JSON asset.version must equal 2.0');
  }
  return {
    bytes,
    declaredLength,
    json,
    chunks: chunks.map((chunk) => ({
      index: chunk.index,
      type:
        chunk.type === GLB_JSON_CHUNK_TYPE ? 'JSON' : 'BIN',
      byteLength: chunk.byteLength,
    })),
  };
}

function collectJsonKeys(value, keyPattern, currentPath = '$', results = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectJsonKeys(entry, keyPattern, `${currentPath}[${index}]`, results);
    });
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = `${currentPath}.${key}`;
    if (keyPattern.test(key)) results.push({ path: entryPath, value: entry });
    collectJsonKeys(entry, keyPattern, entryPath, results);
  }
  return results;
}

function primitiveElementCount(json, primitive) {
  const accessorIndex =
    Number.isInteger(primitive.indices)
      ? primitive.indices
      : primitive.attributes?.POSITION;
  const count = json.accessors?.[accessorIndex]?.count;
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('GLB mesh primitive has no countable index/POSITION accessor');
  }
  return count;
}

function meshTriangleCount(json, mesh) {
  let triangles = 0;
  for (const primitive of mesh?.primitives || []) {
    const count = primitiveElementCount(json, primitive);
    const mode = primitive.mode ?? 4;
    if (mode === 4) triangles += Math.floor(count / 3);
    else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
    else {
      throw new Error(`GLB primitive mode ${mode} is not a triangle mode`);
    }
  }
  return triangles;
}

function triangleCount(json, meshIndices = null) {
  const meshes = meshIndices
    ? meshIndices.map((index) => json.meshes?.[index])
    : (json.meshes || []);
  return meshes.reduce(
    (sum, mesh) => sum + meshTriangleCount(json, mesh),
    0,
  );
}

function normalizedAnchorNames(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => (
      typeof entry === 'string'
        ? entry
        : entry?.nodeName ?? entry?.node ?? entry?.name
    )).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, entry]) => (
      typeof entry === 'string'
        ? entry
        : entry?.nodeName ?? entry?.node ?? entry?.name ?? key
    )).filter(Boolean);
  }
  return [];
}

function firstPresent(value, keys) {
  for (const key of keys) {
    if (value?.[key] !== undefined) return value[key];
  }
  return undefined;
}

function countValue(source, names) {
  const counts = source.counts || source.assetCounts || source.profileCounts || {};
  const value =
    firstPresent(source, names)
    ?? firstPresent(counts, names);
  return Number(value);
}

function vector3(value, fallback) {
  const observed =
    typeof value === 'number' ? [value, value, value] : value;
  if (
    !Array.isArray(observed)
    || observed.length !== 3
    || observed.some((entry) => !Number.isFinite(Number(entry)))
  ) {
    return [...fallback];
  }
  return observed.map(Number);
}

export function normalizeResidentAssetManifest(source) {
  const attachment =
    source.attachment
    || source.runtimeAttachment
    || source.shadowAttachment
    || {};
  const grounding = source.grounding || attachment.grounding || {};
  const lodSource =
    source.lod
    ?? source.lodLevel
    ?? source.declaredLod
    ?? source.level
    ?? 'lod0';
  const lodLevel =
    typeof lodSource === 'object'
      ? Number(lodSource.level ?? lodSource.index ?? 0)
      : Number(String(lodSource).replace(/^lod/i, ''));
  const inspection =
    source.inspectionCapture
    || source.closeupCapture
    || source.captureView
    || null;
  return {
    schema:
      source.schema
      || source.schemaVersion
      || RESIDENT_ASSET_SCHEMA,
    assetId:
      source.assetId
      || source.id
      || 'stormglass-neutral-seat-01-lod0',
    assetPath:
      source.assetPath
      || source.glbPath
      || source.path,
    sourcePath:
      source.sourcePath
      || source.assetSourcePath
      || source.sovereignSourcePath,
    sourceSha256:
      source.sourceSha256
      || source.assetSourceSha256
      || source.sovereignSourceSha256,
    sha256: source.sha256 || source.assetSha256,
    byteSize: Number(
      source.byteSize
      ?? source.bytes
      ?? source.assetBytes,
    ),
    counts: {
      triangles: countValue(
        source,
        ['triangles', 'triangleCount', 'lod0TriangleCount'],
      ),
      materials: countValue(source, ['materials', 'materialCount']),
      textures: countValue(source, ['textures', 'textureCount']),
      bones: countValue(source, ['bones', 'boneCount']),
      clips: countValue(source, ['clips', 'clipCount']),
    },
    structure: {
      totalNodes: countValue(source, ['nodes', 'gltfNodeCount']),
      meshBearingNodes: countValue(
        source,
        ['meshBearingNodes', 'meshBearingNodeCount'],
      ),
      meshDefinitions: countValue(
        source,
        ['meshDefinitions', 'gltfMeshDefinitionCount'],
      ),
      attachedLod0Meshes: countValue(
        source,
        ['attachedLod0Meshes', 'nodeAttachedLod0MeshCount'],
      ),
      nodeLodPlacements: countValue(
        source,
        ['nodeLodPlacements', 'nodeLodPlacementCount'],
      ),
      lowerLodNodes: countValue(
        source,
        ['lowerLodNodes', 'lowerLodNodeCount'],
      ),
      sceneReachableLowerLodNodes: countValue(
        source,
        [
          'sceneReachableLowerLodNodes',
          'sceneReachableLowerLodNodeCount',
        ],
      ),
    },
    license: source.license ?? source.licenseSpdx,
    provenance: source.provenance,
    anchors: normalizedAnchorNames(source.anchors ?? source.anchorNames),
    lodLevel,
    zeroExternalUris:
      source.zeroExternalUris
      ?? source.zeroExternalURIs
      ?? (source.externalUriCount === 0),
    uncompressed:
      source.uncompressed
      ?? source.compressionDisabled
      ?? (
        source.compression === undefined
          ? undefined
          : source.compression === 'none'
      )
      ?? (
        source.dracoCompression === false
        && source.meshoptCompression === false
        && source.meshQuantization === false
      ),
    observerProxyId:
      source.observerProxyId
      || source.observerProxyTarget
      || source.shadowTargetObjectId
      || source.targetObjectId
      || 'ObserverResident01',
    canonicalSeatId:
      source.canonicalSeatId
      || source.targetSeatId
      || source.seatId
      || 'ResidentSeat01',
    presentationProfile:
      source.presentationProfile
      || 'research_live_blinded',
    productionRigClaimed:
      source.productionRigClaimed
      ?? source.rigProductionReady
      ?? false,
    attachRootName:
      source.attachRootName
      || source.attachRoot
      || source.rootNodeName
      || source.attachRootNode
      || attachment.rootNodeName
      || attachment.root
      || RESIDENT_ASSET_ATTACH_ROOT,
    attachment: {
      position: vector3(
        attachment.position ?? source.attachPosition,
        [-6, 0, 3.7],
      ),
      rotation: vector3(
        attachment.rotation
        ?? source.attachRotation
        ?? source.attachRotationDegrees,
        [0, 0, 0],
      ),
      scale: vector3(
        attachment.scale ?? source.attachScale ?? source.uniformScale,
        [1, 1, 1],
      ),
      groundY: Number(
        grounding.targetY
        ?? grounding.groundY
        ?? attachment.groundY
        ?? source.groundY
        ?? source.groundTargetY
        ?? 0,
      ),
      groundingTolerance: Number(
        grounding.tolerance
        ?? attachment.groundingTolerance
        ?? source.groundingTolerance
        ?? source.groundingToleranceMeters
        ?? 0.025,
      ),
      expectedHeightMinimum: Number(
        grounding.expectedHeightMinimum
        ?? attachment.expectedHeightMinimum
        ?? source.expectedHeightMinimum
        ?? source.expectedRuntimeHeightMetersMin
        ?? 1.4,
      ),
      expectedHeightMaximum: Number(
        grounding.expectedHeightMaximum
        ?? attachment.expectedHeightMaximum
        ?? source.expectedHeightMaximum
        ?? source.expectedRuntimeHeightMetersMax
        ?? 2.6,
      ),
    },
    inspectionCapture: inspection
      ? {
          width: Number(inspection.width ?? 1200),
          height: Number(inspection.height ?? 900),
          cameraPosition: vector3(
            inspection.cameraPosition ?? source.inspectionCameraPosition,
            [-10, 3.2, 8],
          ),
          cameraTarget: vector3(
            inspection.cameraTarget ?? source.inspectionCameraTarget,
            [-6, 1, 3.7],
          ),
          fov: Number(
            inspection.fov
            ?? source.inspectionCameraFovDegrees
            ?? 35,
          ),
        }
      : {
          width: 1200,
          height: 900,
          cameraPosition: vector3(
            source.inspectionCameraPosition,
            [-10, 3.2, 8],
          ),
          cameraTarget: vector3(
            source.inspectionCameraTarget,
            [-6, 1, 3.7],
          ),
          fov: Number(source.inspectionCameraFovDegrees ?? 35),
        },
  };
}

function meaningfulProvenance(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(
    value
    && typeof value === 'object'
    && Object.keys(value).length > 0,
  );
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

export function validateResidentAssetSovereignSource(
  root,
  manifestSource,
  { expectedSourcePath = RESIDENT_ASSET_SOURCE } = {},
) {
  const manifest = normalizeResidentAssetManifest(manifestSource);
  const errors = [];
  if (manifest.sourcePath !== expectedSourcePath) {
    errors.push(`source path must equal ${expectedSourcePath}`);
  }
  if (
    typeof manifest.sourcePath !== 'string'
    || manifest.sourcePath.length === 0
    || path.isAbsolute(manifest.sourcePath)
    || manifest.sourcePath.includes('\\')
  ) {
    errors.push('source path must be a relative POSIX path');
  }
  if (!SHA256_PATTERN.test(manifest.sourceSha256 || '')) {
    errors.push('source sha256 must be lowercase sha256 hex');
  }

  const resolvedRoot = path.resolve(root);
  const resolvedSource =
    typeof manifest.sourcePath === 'string'
      ? path.resolve(resolvedRoot, manifest.sourcePath)
      : null;
  let physicalRoot = null;
  let physicalSource = null;
  let sourceBytes = null;
  let actualSha256 = null;
  if (!resolvedSource || !pathIsWithin(resolvedRoot, resolvedSource)) {
    errors.push('source path escapes the HoloLand repository');
  } else if (!existsSync(resolvedSource)) {
    errors.push('sovereign source file does not exist');
  } else {
    try {
      physicalRoot = realpathSync(resolvedRoot);
      physicalSource = realpathSync(resolvedSource);
      if (!pathIsWithin(physicalRoot, physicalSource)) {
        errors.push('source symlink escapes the HoloLand repository');
      } else if (!statSync(physicalSource).isFile()) {
        errors.push('sovereign source path is not a file');
      } else {
        sourceBytes = readFileSync(physicalSource);
        actualSha256 = sha256(sourceBytes);
        if (manifest.sourceSha256 !== actualSha256) {
          errors.push('manifest source sha256 differs from sovereign source sha256');
        }
      }
    } catch (error) {
      errors.push(`sovereign source inspection failed: ${error.message}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `Resident sovereign source validation failed: ${errors.join('; ')}`,
    );
  }
  return {
    status: 'host_validated_sovereign_holoscript_source',
    path: manifest.sourcePath,
    sha256: actualSha256,
    byteSize: sourceBytes.byteLength,
    repositoryContained: true,
    symlinkContained: true,
  };
}

function normalizedRootExtensionList(value, label, errors) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value)
    || value.some(
      (entry) => typeof entry !== 'string' || entry.length === 0,
    )
  ) {
    errors.push(`${label} must be an array of non-empty extension names`);
    return [];
  }
  if (new Set(value).size !== value.length) {
    errors.push(`${label} must not contain duplicate extension names`);
  }
  return [...value];
}

function inspectMsftLodPlacements(
  json,
  observedExtensionObjects,
  extensionsUsed,
  errors,
) {
  const placements = [];
  const allowedPlacementPaths = new Set();
  const collectPlacements = (kind, entries) => {
    entries.forEach((entry, index) => {
      if (!Object.hasOwn(entry?.extensions || {}, 'MSFT_lod')) return;
      const pathPrefix = kind === 'node' ? 'nodes' : 'materials';
      const placementPath = `$.${pathPrefix}[${index}].extensions`;
      allowedPlacementPaths.add(placementPath);
      placements.push({
        kind,
        index,
        path: placementPath,
        extension: entry.extensions.MSFT_lod,
      });
    });
  };
  collectPlacements('node', json.nodes || []);
  collectPlacements('material', json.materials || []);

  const observedPaths = observedExtensionObjects
    .filter((entry) => Object.hasOwn(entry.value || {}, 'MSFT_lod'))
    .map((entry) => entry.path);
  const invalidPlacementPaths = observedPaths.filter(
    (entry) => !allowedPlacementPaths.has(entry),
  );
  if (invalidPlacementPaths.length > 0) {
    errors.push(
      'MSFT_lod may appear only on nodes or materials; invalid placements: '
      + invalidPlacementPaths.join(', '),
    );
  }
  const rootDeclaresMsftLod = extensionsUsed.includes('MSFT_lod');
  if (observedPaths.length > 0 && !rootDeclaresMsftLod) {
    errors.push('MSFT_lod placement is missing from root extensionsUsed');
  }
  if (rootDeclaresMsftLod && observedPaths.length === 0) {
    errors.push('root extensionsUsed declares MSFT_lod without a placement');
  }

  const placementReceipts = [];
  for (const placement of placements) {
    const { extension, index, kind } = placement;
    const ids = extension?.ids;
    const targetCount =
      kind === 'node'
        ? (json.nodes || []).length
        : (json.materials || []).length;
    if (!Array.isArray(ids) || ids.length === 0) {
      errors.push(
        `MSFT_lod ${kind}[${index}] ids must be a non-empty array`,
      );
      placementReceipts.push({
        kind,
        index,
        ids: [],
        triangleCounts: null,
        lowerQualityOrderInferred: false,
      });
      continue;
    }
    const validIds = [];
    const seenIds = new Set();
    for (const id of ids) {
      if (!Number.isInteger(id) || id < 0 || id >= targetCount) {
        errors.push(
          `MSFT_lod ${kind}[${index}] id ${String(id)} is not an in-range ${kind} index`,
        );
        continue;
      }
      if (id === index) {
        errors.push(`MSFT_lod ${kind}[${index}] cannot reference itself`);
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`MSFT_lod ${kind}[${index}] contains duplicate id ${id}`);
        continue;
      }
      seenIds.add(id);
      validIds.push(id);
    }

    let triangleCounts = null;
    let lowerQualityOrderInferred = false;
    if (kind === 'node' && validIds.length === ids.length) {
      const sequence = [index, ...validIds];
      const observedTriangleCounts = [];
      let directlyCountable = true;
      for (const nodeIndex of sequence) {
        const meshIndex = json.nodes?.[nodeIndex]?.mesh;
        if (
          !Number.isInteger(meshIndex)
          || meshIndex < 0
          || meshIndex >= (json.meshes || []).length
        ) {
          errors.push(
            `MSFT_lod node[${nodeIndex}] must reference an in-range mesh for triangle-order validation`,
          );
          directlyCountable = false;
          break;
        }
        try {
          observedTriangleCounts.push(
            meshTriangleCount(json, json.meshes[meshIndex]),
          );
        } catch (error) {
          errors.push(
            `MSFT_lod node[${nodeIndex}] is not countable: ${error.message}`,
          );
          directlyCountable = false;
          break;
        }
      }
      if (directlyCountable) {
        triangleCounts = observedTriangleCounts;
        lowerQualityOrderInferred = true;
        for (let lodIndex = 1; lodIndex < triangleCounts.length; lodIndex += 1) {
          if (triangleCounts[lodIndex] >= triangleCounts[lodIndex - 1]) {
            errors.push(
              `MSFT_lod node[${index}] triangle order is not strictly lower quality: `
              + triangleCounts.join(' -> '),
            );
            break;
          }
        }
      }
    }
    placementReceipts.push({
      kind,
      index,
      ids: [...validIds],
      triangleCounts,
      lowerQualityOrderInferred,
    });
  }
  return {
    placements: placementReceipts,
    invalidPlacementPaths,
    rootDeclared: rootDeclaresMsftLod,
  };
}

function normalizedNodeTransform(node) {
  if (Array.isArray(node?.matrix)) {
    return { matrix: [...node.matrix] };
  }
  return {
    translation: Array.isArray(node?.translation)
      ? [...node.translation]
      : [0, 0, 0],
    rotation: Array.isArray(node?.rotation)
      ? [...node.rotation]
      : [0, 0, 0, 1],
    scale: Array.isArray(node?.scale)
      ? [...node.scale]
      : [1, 1, 1],
  };
}

function inspectMsftLodRuntimeIsolation(
  json,
  msftLod,
  reachableNodeIndices,
  sceneRoots,
  errors,
) {
  const nodePlacements = msftLod.placements.filter(
    (entry) => entry.kind === 'node',
  );
  const highNodeIndices = new Set(
    nodePlacements.map((entry) => entry.index),
  );
  const lowerNodeIds = nodePlacements.flatMap((entry) => entry.ids);
  const uniqueLowerNodeIds = new Set(lowerNodeIds);
  if (uniqueLowerNodeIds.size !== lowerNodeIds.length) {
    errors.push('MSFT_lod lower node targets must be unique across placements');
  }
  const sceneRootIndices = new Set(sceneRoots);
  const childNodeIndices = new Set(
    (json.nodes || []).flatMap((node) => node.children || []),
  );
  const reachableLowerNodeIds = [...uniqueLowerNodeIds].filter(
    (nodeIndex) => reachableNodeIndices.has(nodeIndex),
  );
  const sceneGraphReferencedLowerNodeIds = [...uniqueLowerNodeIds].filter(
    (nodeIndex) =>
      sceneRootIndices.has(nodeIndex)
      || childNodeIndices.has(nodeIndex),
  );
  if (reachableLowerNodeIds.length > 0) {
    errors.push(
      'MSFT_lod lower nodes must be outside the default scene reachability set: '
      + reachableLowerNodeIds.join(', '),
    );
  }
  if (sceneGraphReferencedLowerNodeIds.length > 0) {
    errors.push(
      'MSFT_lod lower nodes must not appear in scene roots or node children: '
      + sceneGraphReferencedLowerNodeIds.join(', '),
    );
  }

  let copiedTransformCount = 0;
  let unskinnedLowerNodeCount = 0;
  let validLowerMeshCount = 0;
  for (const placement of nodePlacements) {
    if (!reachableNodeIndices.has(placement.index)) {
      errors.push(
        `MSFT_lod high node[${placement.index}] is not scene reachable`,
      );
    }
    const highNode = json.nodes?.[placement.index];
    const highTransform = normalizedNodeTransform(highNode);
    for (const lowerNodeId of placement.ids) {
      const lowerNode = json.nodes?.[lowerNodeId];
      if (!lowerNode) continue;
      if (highNodeIndices.has(lowerNodeId)) {
        errors.push(
          `MSFT_lod lower node[${lowerNodeId}] is also a high LOD node`,
        );
      }
      if (
        !Number.isInteger(lowerNode.mesh)
        || lowerNode.mesh < 0
        || lowerNode.mesh >= (json.meshes || []).length
      ) {
        errors.push(
          `MSFT_lod lower node[${lowerNodeId}] must reference an in-range mesh`,
        );
      } else {
        validLowerMeshCount += 1;
      }
      if (Number.isInteger(lowerNode.skin)) {
        errors.push(`MSFT_lod lower node[${lowerNodeId}] must not bind a skin`);
      } else {
        unskinnedLowerNodeCount += 1;
      }
      if (
        canonicalJson(normalizedNodeTransform(lowerNode))
        !== canonicalJson(highTransform)
      ) {
        errors.push(
          `MSFT_lod lower node[${lowerNodeId}] transform differs from high node[${placement.index}]`,
        );
      } else {
        copiedTransformCount += 1;
      }
    }
  }
  const idCounts = nodePlacements.map((entry) => entry.ids.length);
  return {
    totalNodes: (json.nodes || []).length,
    meshBearingNodes: (json.nodes || []).filter(
      (node) => Number.isInteger(node.mesh),
    ).length,
    nodeLodPlacementCount: nodePlacements.length,
    lowerLodNodeCount: uniqueLowerNodeIds.size,
    nodeLodIdCounts: idCounts,
    minimumNodeLodIdsPerPlacement:
      idCounts.length > 0 ? Math.min(...idCounts) : 0,
    maximumNodeLodIdsPerPlacement:
      idCounts.length > 0 ? Math.max(...idCounts) : 0,
    sceneReachableLowerLodNodeCount: reachableLowerNodeIds.length,
    sceneGraphReferencedLowerLodNodeCount:
      sceneGraphReferencedLowerNodeIds.length,
    validLowerMeshCount,
    copiedTransformCount,
    unskinnedLowerNodeCount,
    lowerNodeTargetsUnique:
      uniqueLowerNodeIds.size === lowerNodeIds.length,
  };
}

export function validateResidentAssetGlb(
  value,
  manifestSource,
  { expectedAssetPath = RESIDENT_ASSET_PATH } = {},
) {
  const manifest = normalizeResidentAssetManifest(manifestSource);
  const parsed = parseGlbContainer(value);
  const bytes = parsed.bytes;
  const errors = [];
  if (manifest.schema !== RESIDENT_ASSET_SCHEMA) {
    errors.push(`manifest schema must equal ${RESIDENT_ASSET_SCHEMA}`);
  }
  if (manifest.assetPath !== expectedAssetPath) {
    errors.push(`asset path must equal ${expectedAssetPath}`);
  }
  if (!SHA256_PATTERN.test(manifest.sha256 || '')) {
    errors.push('manifest sha256 must be lowercase sha256 hex');
  }
  const hostSha256 = sha256(bytes);
  if (manifest.sha256 !== hostSha256) {
    errors.push('manifest sha256 differs from host GLB sha256');
  }
  if (manifest.byteSize !== bytes.byteLength) {
    errors.push('manifest byte size differs from GLB byte size');
  }
  if (!meaningfulProvenance(manifest.license)) {
    errors.push('manifest license is missing');
  }
  if (!meaningfulProvenance(manifest.provenance)) {
    errors.push('manifest provenance is missing');
  }
  if (manifest.lodLevel !== 0) errors.push('first resident asset must be LOD0');
  if (manifest.zeroExternalUris !== true) {
    errors.push('manifest must assert zero external URIs');
  }
  if (manifest.uncompressed !== true) {
    errors.push('manifest must assert an uncompressed GLB');
  }
  if (manifest.presentationProfile !== 'research_live_blinded') {
    errors.push('resident asset must target research_live_blinded');
  }
  if (manifest.observerProxyId !== 'ObserverResident01') {
    errors.push('resident asset must target ObserverResident01 only');
  }
  if (manifest.attachRootName !== RESIDENT_ASSET_ATTACH_ROOT) {
    errors.push(
      `resident asset attach root must equal ${RESIDENT_ASSET_ATTACH_ROOT}`,
    );
  }
  if (!['ResidentSeat01', 'seat-01'].includes(manifest.canonicalSeatId)) {
    errors.push('resident asset must identify Seat 01 only');
  }
  if (
    !Number.isFinite(manifest.attachment.groundY)
    || !Number.isFinite(manifest.attachment.groundingTolerance)
    || manifest.attachment.groundingTolerance < 0
  ) {
    errors.push('manifest grounding contract is invalid');
  }

  const uriReferences = collectJsonKeys(parsed.json, /^uri$/i);
  if (uriReferences.length > 0) {
    errors.push('GLB JSON contains URI fields');
  }
  const extensionsUsed = normalizedRootExtensionList(
    parsed.json.extensionsUsed,
    'root extensionsUsed',
    errors,
  );
  const extensionsRequired = normalizedRootExtensionList(
    parsed.json.extensionsRequired,
    'root extensionsRequired',
    errors,
  );
  const requiredButUnusedExtensions = extensionsRequired.filter(
    (extension) => !extensionsUsed.includes(extension),
  );
  if (requiredButUnusedExtensions.length > 0) {
    errors.push(
      'root extensionsRequired entries are missing from extensionsUsed: '
      + requiredButUnusedExtensions.join(', '),
    );
  }
  const observedExtensionObjects = collectJsonKeys(
    parsed.json,
    /^extensions$/i,
  );
  const observedExtensions = [...new Set(
    observedExtensionObjects.flatMap(
      (entry) => Object.keys(entry.value || {}),
    ),
  )];
  const undeclaredExtensions = observedExtensions.filter(
    (extension) => !extensionsUsed.includes(extension),
  );
  if (undeclaredExtensions.length > 0) {
    errors.push(
      `GLB uses undeclared extensions: ${undeclaredExtensions.join(', ')}`,
    );
  }
  const msftLod = inspectMsftLodPlacements(
    parsed.json,
    observedExtensionObjects,
    extensionsUsed,
    errors,
  );
  const compressionExtensions = [...new Set([
    ...extensionsUsed,
    ...extensionsRequired,
    ...observedExtensions,
  ])].filter(
    (extension) => COMPRESSION_EXTENSION_PATTERN.test(extension),
  );
  if (compressionExtensions.length > 0) {
    errors.push(
      `GLB uses forbidden compression extensions: ${compressionExtensions.join(', ')}`,
    );
  }

  const sceneIndex = Number.isInteger(parsed.json.scene)
    ? parsed.json.scene
    : 0;
  const sceneRoots = parsed.json.scenes?.[sceneIndex]?.nodes || [];
  const reachableNodeIndices = new Set();
  const pendingNodeIndices = [...sceneRoots];
  while (pendingNodeIndices.length > 0) {
    const nodeIndex = pendingNodeIndices.pop();
    if (
      !Number.isInteger(nodeIndex)
      || reachableNodeIndices.has(nodeIndex)
      || !parsed.json.nodes?.[nodeIndex]
    ) {
      continue;
    }
    reachableNodeIndices.add(nodeIndex);
    pendingNodeIndices.push(...(parsed.json.nodes[nodeIndex].children || []));
  }
  msftLod.runtimeIsolation = inspectMsftLodRuntimeIsolation(
    parsed.json,
    msftLod,
    reachableNodeIndices,
    sceneRoots,
    errors,
  );
  const attachedMeshIndices = [...reachableNodeIndices]
    .map((nodeIndex) => parsed.json.nodes[nodeIndex].mesh)
    .filter((index) => Number.isInteger(index));
  const attachedMaterialIndices = new Set(
    attachedMeshIndices.flatMap(
      (meshIndex) =>
        (parsed.json.meshes?.[meshIndex]?.primitives || [])
          .map((primitive) => primitive.material)
          .filter((index) => Number.isInteger(index)),
    ),
  );
  const boundSkinIndices = (parsed.json.nodes || [])
    .filter((_node, nodeIndex) => reachableNodeIndices.has(nodeIndex))
    .map((node) => node.skin)
    .filter((index) => Number.isInteger(index));
  const boundJointIndices = new Set(
    boundSkinIndices.flatMap(
      (skinIndex) => parsed.json.skins?.[skinIndex]?.joints || [],
    ),
  );
  let observedTriangles = null;
  let allDefinitionTriangles = null;
  try {
    observedTriangles = triangleCount(parsed.json, attachedMeshIndices);
    allDefinitionTriangles = triangleCount(parsed.json);
  } catch (error) {
    errors.push(error.message);
  }
  const observedCounts = {
    triangles: observedTriangles,
    materials: (parsed.json.materials || []).length,
    textures: (parsed.json.textures || []).length,
    bones: new Set(
      (parsed.json.skins || []).flatMap((skin) => skin.joints || []),
    ).size,
    clips: (parsed.json.animations || []).length,
  };
  const runtimeExpectedCounts = {
    triangles: observedTriangles,
    materials: attachedMaterialIndices.size,
    textures: observedCounts.textures,
    bones: boundJointIndices.size,
    clips: observedCounts.clips,
  };
  const definitionCounts = {
    meshDefinitions: (parsed.json.meshes || []).length,
    sceneIndex,
    reachableNodes: reachableNodeIndices.size,
    attachedMeshNodes: attachedMeshIndices.length,
    uniqueAttachedMeshDefinitions: new Set(attachedMeshIndices).size,
    allDefinitionTriangles,
    attachedTriangles: observedTriangles,
    materialDefinitions: observedCounts.materials,
    attachedMaterialDefinitions: attachedMaterialIndices.size,
    textureDefinitions: observedCounts.textures,
    skinDefinitions: (parsed.json.skins || []).length,
    jointDefinitions: observedCounts.bones,
    skinBoundNodes: boundSkinIndices.length,
    boundJoints: boundJointIndices.size,
    animationDefinitions: observedCounts.clips,
  };
  const observedStructure = {
    totalNodes: msftLod.runtimeIsolation.totalNodes,
    meshBearingNodes: msftLod.runtimeIsolation.meshBearingNodes,
    meshDefinitions: definitionCounts.meshDefinitions,
    attachedLod0Meshes: definitionCounts.attachedMeshNodes,
    nodeLodPlacements:
      msftLod.runtimeIsolation.nodeLodPlacementCount,
    lowerLodNodes: msftLod.runtimeIsolation.lowerLodNodeCount,
    sceneReachableLowerLodNodes:
      msftLod.runtimeIsolation.sceneReachableLowerLodNodeCount,
  };
  for (const [name, observed] of Object.entries(observedStructure)) {
    if (
      !Number.isInteger(manifest.structure[name])
      || manifest.structure[name] < 0
    ) {
      errors.push(
        `manifest structure ${name} must be a non-negative integer`,
      );
    } else if (manifest.structure[name] !== observed) {
      errors.push(
        `manifest structure ${name} ${manifest.structure[name]} differs from ${observed}`,
      );
    }
  }
  if (
    manifest.productionRigClaimed === true
    && (
      definitionCounts.skinDefinitions === 0
      || definitionCounts.skinBoundNodes === 0
    )
  ) {
    errors.push('manifest claims a production rig without a bound skin');
  }
  for (const [name, observed] of Object.entries(observedCounts)) {
    if (!Number.isInteger(manifest.counts[name]) || manifest.counts[name] < 0) {
      errors.push(`manifest ${name} count must be a non-negative integer`);
    } else if (manifest.counts[name] !== observed) {
      errors.push(
        `manifest ${name} count ${manifest.counts[name]} differs from ${observed}`,
      );
    }
  }
  if (
    Number.isInteger(observedCounts.triangles)
    && observedCounts.triangles > LOD0_TRIANGLE_BUDGET
  ) {
    errors.push(
      `GLB triangle count ${observedCounts.triangles} exceeds ${LOD0_TRIANGLE_BUDGET}`,
    );
  }
  if (manifest.anchors.length === 0) {
    errors.push('manifest anchors are missing');
  }
  const nodeNames = new Set(
    [...reachableNodeIndices]
      .map((nodeIndex) => parsed.json.nodes[nodeIndex]?.name)
      .filter((name) => typeof name === 'string' && name.length > 0),
  );
  const missingAnchors = manifest.anchors.filter((anchor) => !nodeNames.has(anchor));
  if (missingAnchors.length > 0) {
    errors.push(`GLB is missing anchors: ${missingAnchors.join(', ')}`);
  }
  if (!nodeNames.has(manifest.attachRootName)) {
    errors.push(`GLB is missing attach root: ${manifest.attachRootName}`);
  }
  if (errors.length > 0) {
    throw new Error(`Resident GLB validation failed: ${errors.join('; ')}`);
  }

  return {
    schema: RESIDENT_ASSET_SCHEMA,
    status: 'host_validated_neutral_shadow_candidate',
    claimBoundary:
      'one neutral Seat 01 LOD0 GLB loader candidate; not a complete resident kit or family mantle',
    manifest,
    host: {
      sha256: hostSha256,
      byteSize: bytes.byteLength,
      gltfVersion: parsed.json.asset.version,
      generator: parsed.json.asset.generator || null,
      chunks: parsed.chunks,
      counts: observedCounts,
      anchors: [...manifest.anchors],
      attachRootName: manifest.attachRootName,
      uriReferences,
      declaredExtensions: extensionsUsed,
      requiredExtensions: extensionsRequired,
      requiredButUnusedExtensions,
      observedExtensions,
      undeclaredExtensions,
      compressionExtensions,
      msftLod,
      definitionCounts,
      structure: observedStructure,
      runtimeExpectedCounts,
      rig: {
        skinDefinitions: definitionCounts.skinDefinitions,
        jointDefinitions: definitionCounts.jointDefinitions,
        skinBoundNodes: definitionCounts.skinBoundNodes,
        boundJoints: definitionCounts.boundJoints,
        productionRigClaimed: manifest.productionRigClaimed,
        productionRigObserved:
          definitionCounts.skinDefinitions > 0
          && definitionCounts.skinBoundNodes > 0,
      },
      triangleBudget: LOD0_TRIANGLE_BUDGET,
      triangleBudgetPassed: observedCounts.triangles <= LOD0_TRIANGLE_BUDGET,
    },
  };
}

function digest(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort())
      === canonicalJson([...expected].sort());
}

function pushSha256Error(errors, value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    errors.push(`${label} must be lowercase sha256 hex`);
  }
}

export function validateObserverBoundaryCore(core) {
  const errors = [];
  if (!exactKeys(core, OBSERVER_BOUNDARY_CORE_KEYS)) {
    errors.push('observer boundary core keys differ');
    return { errors, valid: false };
  }
  if (
    core.available !== true
    || core.source !== 'verified_bounded_phase0b_v4_observer_toggle'
    || core.boundedRuntimeReceiptValidated !== true
    || core.boundedRuntimeSceneObjectCount !== 12
    || core.browserMayWriteCanonicalState !== false
    || core.projectionToggleExecuted !== true
  ) {
    errors.push('observer boundary availability/scope differs');
  }
  if (
    !exactKeys(core.canonicalFields, REQUIRED_OBSERVER_BOUNDARY_FIELDS)
    || canonicalJson(core.requiredFields)
      !== canonicalJson(REQUIRED_OBSERVER_BOUNDARY_FIELDS)
  ) {
    errors.push('observer boundary canonical field set differs');
  } else {
    for (const field of REQUIRED_OBSERVER_BOUNDARY_FIELDS) {
      pushSha256Error(errors, core.canonicalFields[field], `canonicalFields.${field}`);
    }
  }
  for (const [label, value] of Object.entries({
    verifiedReceiptHash: core.verifiedReceiptHash,
    'verifiedPersistence.finalStateHash': core.verifiedPersistence?.finalStateHash,
    'verifiedPersistence.receiptRoot': core.verifiedPersistence?.receiptRoot,
    sourceRunCommitment: core.sourceRunCommitment,
    terminalCommitment: core.terminalCommitment,
    readOnlySourceContractHash: core.readOnlySourceContractHash,
    'sourceHashes.canonicalVisibleWorld':
      core.sourceHashes?.canonicalVisibleWorld,
    'sourceHashes.observerProjection': core.sourceHashes?.observerProjection,
    'sourceHashes.observerPolicy': core.sourceHashes?.observerPolicy,
  })) {
    pushSha256Error(errors, value, label);
  }
  if (
    !exactKeys(core.comparison, [
      'changedFields',
      'postObserverCanonicalFieldsHash',
      'postObserverCanonicalPayloadHash',
      'preObserverCanonicalFieldsHash',
      'preObserverCanonicalPayloadHash',
      'sevenFieldsEqual',
      'sourceRunCommitmentEqual',
      'terminalCommitmentEqual',
    ])
    || core.comparison?.sevenFieldsEqual !== true
    || core.comparison?.sourceRunCommitmentEqual !== true
    || core.comparison?.terminalCommitmentEqual !== true
    || canonicalJson(core.comparison?.changedFields) !== '[]'
    || core.comparison?.preObserverCanonicalPayloadHash
      !== core.comparison?.postObserverCanonicalPayloadHash
    || core.comparison?.preObserverCanonicalFieldsHash
      !== core.comparison?.postObserverCanonicalFieldsHash
  ) {
    errors.push('observer boundary comparison differs');
  }
  for (const [label, value] of Object.entries({
    preObserverCanonicalPayloadHash:
      core.comparison?.preObserverCanonicalPayloadHash,
    postObserverCanonicalPayloadHash:
      core.comparison?.postObserverCanonicalPayloadHash,
    preObserverCanonicalFieldsHash:
      core.comparison?.preObserverCanonicalFieldsHash,
    postObserverCanonicalFieldsHash:
      core.comparison?.postObserverCanonicalFieldsHash,
  })) {
    pushSha256Error(errors, value, `comparison.${label}`);
  }
  const livingCommons = core.livingCommons;
  const admittedAction = livingCommons?.admittedAction;
  const blockedAction = livingCommons?.blockedAction;
  const expectedAdmitted = {
    allowed: true,
    entrypoint: 'contribute_water',
    outcome: 'public_water_units_increased_by_1',
    previousEntryHash: admittedAction?.previousEntryHash,
    scheduleEntryId: 'mv-phase0b-action-01',
    stateChanged: true,
    targetIds: ['VillageCommons'],
  };
  const expectedBlocked = {
    allowed: false,
    entrypoint: 'deny_external_message',
    outcome: 'blocked_without_world_mutation',
    previousEntryHash: admittedAction?.entryHash,
    scheduleEntryId: 'mv-phase0b-action-02',
    stateChanged: false,
    targetIds: ['IsolationBoundary'],
  };
  for (const [label, action, expected] of [
    ['admittedAction', admittedAction, expectedAdmitted],
    ['blockedAction', blockedAction, expectedBlocked],
  ]) {
    if (
      !exactKeys(action, [...Object.keys(expected), 'entryHash'])
      || Object.entries(expected).some(
        ([field, value]) => canonicalJson(action?.[field]) !== canonicalJson(value),
      )
    ) {
      errors.push(`livingCommons.${label} differs`);
    }
    pushSha256Error(errors, action?.entryHash, `livingCommons.${label}.entryHash`);
    pushSha256Error(
      errors,
      action?.previousEntryHash,
      `livingCommons.${label}.previousEntryHash`,
    );
  }
  if (
    !exactKeys(livingCommons, [
      'acceptedActionCount',
      'actionReceiptRoot',
      'admittedAction',
      'blockedAction',
      'projectionAuthority',
      'publicWaterUnits',
      'rawModelContentIncluded',
      'visualCuesRequireExistingActionReceipts',
    ])
    || livingCommons?.acceptedActionCount !== 1
    || livingCommons?.publicWaterUnits !== 3
    || livingCommons?.projectionAuthority !== 'read_only_receipt_consumption'
    || livingCommons?.rawModelContentIncluded !== false
    || livingCommons?.visualCuesRequireExistingActionReceipts !== true
    || livingCommons?.actionReceiptRoot !== core.canonicalFields?.actionReceiptRoot
    || livingCommons?.actionReceiptRoot !== blockedAction?.entryHash
  ) {
    errors.push('Living Commons receipt/root binding differs');
  }
  if (
    !exactKeys(core.verifiedPersistence, ['finalStateHash', 'receiptRoot'])
    || !exactKeys(core.sourceHashes, [
      'canonicalVisibleWorld',
      'observerPolicy',
      'observerProjection',
    ])
    || !exactKeys(core.canonicalVisibleWorld, [
      'canonicalDigest',
      'canonicalReplayMatch',
      'objectCount',
      'objectIds',
    ])
    || core.canonicalVisibleWorld?.canonicalReplayMatch !== true
    || core.canonicalVisibleWorld?.objectCount !== 12
    || canonicalJson(core.canonicalVisibleWorld?.objectIds)
      !== canonicalJson(CANONICAL_VISIBLE_WORLD_IDS)
  ) {
    errors.push('canonical visible-world scope differs');
  }
  pushSha256Error(
    errors,
    core.canonicalVisibleWorld?.canonicalDigest,
    'canonicalVisibleWorld.canonicalDigest',
  );
  return { errors, valid: errors.length === 0 };
}

export function validateTrustedActionBinding(binding) {
  const errors = [];
  if (!exactKeys(binding, TRUSTED_ACTION_BINDING_KEYS)) {
    errors.push('trusted action binding keys differ');
    return { errors, valid: false };
  }
  if (binding.schema !== 'hololand.model-village.trusted-action-binding.v1') {
    errors.push('trusted action binding schema differs');
  }
  for (const [label, value] of Object.entries(binding)) {
    if (label === 'schema') continue;
    pushSha256Error(errors, value, `trustedActionBinding.${label}`);
  }
  const unsignedBinding = { ...binding };
  delete unsignedBinding.bindingHash;
  if (binding.bindingHash !== digest(unsignedBinding)) {
    errors.push('trusted action binding digest differs');
  }
  if (binding.blockedPreviousEntryHash !== binding.admittedActionEntryHash) {
    errors.push('trusted action binding ledger link differs');
  }
  if (binding.actionReceiptRoot !== binding.blockedActionEntryHash) {
    errors.push('trusted action binding root differs');
  }
  return { errors, valid: errors.length === 0 };
}

function validateCoreAgainstTrustedActionBinding(core, binding) {
  const errors = [];
  if (
    core.verifiedReceiptHash !== binding.phase0BReceiptHash
    || core.sourceRunCommitment !== binding.sourceRunCommitment
    || core.terminalCommitment !== binding.terminalCommitment
    || core.canonicalFields.actionReceiptRoot !== binding.actionReceiptRoot
    || core.livingCommons.actionReceiptRoot !== binding.actionReceiptRoot
    || core.livingCommons.admittedAction.entryHash
      !== binding.admittedActionEntryHash
    || core.livingCommons.admittedAction.previousEntryHash
      !== binding.admittedPreviousEntryHash
    || core.livingCommons.blockedAction.entryHash
      !== binding.blockedActionEntryHash
    || core.livingCommons.blockedAction.previousEntryHash
      !== binding.blockedPreviousEntryHash
  ) {
    errors.push(
      'observer boundary action chain differs from the trusted execution binding',
    );
  }
  return { errors, valid: errors.length === 0 };
}

export function createObserverBoundaryEnvelope(
  core,
  {
    consumerEnabled = true,
    trustedActionBinding = null,
  } = {},
) {
  if (!consumerEnabled) {
    return {
      canonicalPayload: null,
      consumerEnabled: false,
      payloadDigest: null,
      schema: OBSERVER_BOUNDARY_ENVELOPE_SCHEMA,
      source: 'verified_payload_withheld_from_browser_consumer',
      trustedActionBinding: null,
    };
  }
  const validation = validateObserverBoundaryCore(core);
  const trustedBindingValidation =
    validateTrustedActionBinding(trustedActionBinding);
  const coreBindingValidation =
    trustedBindingValidation.valid
      ? validateCoreAgainstTrustedActionBinding(core, trustedActionBinding)
      : { errors: [], valid: false };
  const errors = [
    ...validation.errors,
    ...trustedBindingValidation.errors,
    ...coreBindingValidation.errors,
  ];
  if (errors.length > 0) {
    throw new Error(
      `Observer boundary core is invalid: ${errors.join('; ')}`,
    );
  }
  const canonicalPayload = canonicalJson(core);
  return {
    canonicalPayload,
    consumerEnabled: true,
    payloadDigest: sha256(Buffer.from(canonicalPayload, 'utf8')),
    schema: OBSERVER_BOUNDARY_ENVELOPE_SCHEMA,
    source: 'verified_canonical_payload_for_browser_consumer',
    trustedActionBinding: structuredClone(trustedActionBinding),
  };
}

export function verifyObserverBoundaryEnvelope(
  envelope,
  { trustedActionBinding = null } = {},
) {
  const errors = [];
  if (!exactKeys(envelope, OBSERVER_BOUNDARY_ENVELOPE_KEYS)) {
    errors.push('observer boundary envelope keys differ');
    return { core: null, errors, valid: false };
  }
  if (envelope.schema !== OBSERVER_BOUNDARY_ENVELOPE_SCHEMA) {
    errors.push('observer boundary envelope schema differs');
  }
  if (envelope.consumerEnabled !== true) {
    if (
      envelope.consumerEnabled !== false
      || envelope.canonicalPayload !== null
      || envelope.payloadDigest !== null
      || envelope.source
        !== 'verified_payload_withheld_from_browser_consumer'
      || envelope.trustedActionBinding !== null
    ) {
      errors.push('observer-off envelope is not fail-dark');
    }
    return { core: null, errors, valid: errors.length === 0 };
  }
  if (envelope.source !== 'verified_canonical_payload_for_browser_consumer') {
    errors.push('observer-on envelope source differs');
  }
  const trustedBindingValidation =
    validateTrustedActionBinding(trustedActionBinding);
  errors.push(...trustedBindingValidation.errors);
  if (
    trustedBindingValidation.valid
    && canonicalJson(envelope.trustedActionBinding)
      !== canonicalJson(trustedActionBinding)
  ) {
    errors.push('observer envelope trusted action binding differs');
  }
  if (
    typeof envelope.canonicalPayload !== 'string'
    || !SHA256_PATTERN.test(envelope.payloadDigest || '')
    || sha256(Buffer.from(envelope.canonicalPayload || '', 'utf8'))
      !== envelope.payloadDigest
  ) {
    errors.push('observer boundary payload digest differs');
    return { core: null, errors, valid: false };
  }
  let core;
  try {
    core = JSON.parse(envelope.canonicalPayload);
  } catch {
    errors.push('observer boundary canonical payload is not JSON');
    return { core: null, errors, valid: false };
  }
  if (canonicalJson(core) !== envelope.canonicalPayload) {
    errors.push('observer boundary payload is not canonically serialized');
  }
  const coreValidation = validateObserverBoundaryCore(core);
  errors.push(...coreValidation.errors);
  if (trustedBindingValidation.valid) {
    errors.push(
      ...validateCoreAgainstTrustedActionBinding(
        core,
        trustedActionBinding,
      ).errors,
    );
  }
  return { core, errors, valid: errors.length === 0 };
}

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

function relativeTo(root, filePath) {
  return normalizePath(path.relative(root, filePath));
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: REPO_ROOT,
    holoScriptRoot: process.env.HOLOSCRIPT_ROOT || '',
    browser: process.env.CHROME_PATH || process.env.EDGE_PATH || '',
    outputDir: DEFAULT_OUTPUT_DIR,
    timeoutMs: 60_000,
    canonicalBoundary: true,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };
    if (arg === '--root') args.root = path.resolve(next());
    else if (arg === '--holoscript-root') args.holoScriptRoot = path.resolve(next());
    else if (arg === '--browser') args.browser = next();
    else if (arg === '--output-dir') args.outputDir = path.resolve(next());
    else if (arg === '--timeout-ms') args.timeoutMs = Number.parseInt(next(), 10);
    else if (arg === '--skip-canonical-boundary') args.canonicalBoundary = false;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`HoloLand Model Village rendering truth gate

Usage:
  node scripts/hololand-model-village-rendering-truth-gate.mjs [options]

Options:
  --root <path>                  HoloLand repository root
  --holoscript-root <path>      Built sibling HoloScript repository
  --browser <path>              Chrome or Edge executable
  --output-dir <path>           Evidence directory
  --timeout-ms <number>         Browser readiness timeout
  --skip-canonical-boundary      Skip the canonical before/after physics check
  --json                         Print the full receipt
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 10_000) {
    throw new Error(`Invalid --timeout-ms: ${args.timeoutMs}`);
  }
  return args;
}

function resolveHoloScriptRoot(root, explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'packages', 'core', 'dist', 'index.js'))
      && existsSync(path.join(candidate, 'node_modules', 'three', 'build', 'three.module.js'))
      && existsSync(path.join(candidate, 'node_modules', 'esbuild', 'lib', 'main.js'))
    ) {
      return path.resolve(candidate);
    }
  }
  throw new Error(`Built HoloScript core, Three, and esbuild not found: ${candidates.join(', ')}`);
}

function candidateBrowsers(explicitPath) {
  if (explicitPath) return [explicitPath];
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || '';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome',
    'chrome.exe',
    'msedge',
    'msedge.exe',
    'chromium',
  ].filter(Boolean);
}

function resolveBrowser(explicitPath) {
  const candidates = candidateBrowsers(explicitPath);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [candidate], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error(`No Chrome/Edge/Chromium executable found. Tried: ${candidates.join(', ')}`);
}

function properties(node) {
  return Object.fromEntries((node?.properties || []).map((entry) => [entry.key, entry.value]));
}

function flattenScene(node) {
  if (!node) return [];
  return [node, ...(node.children || []).flatMap(flattenScene)];
}

function manifestRecordScore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const keys = Object.keys(value);
  return [
    ['assetPath', 'glbPath', 'path'],
    ['sha256', 'assetSha256'],
    ['triangles', 'triangleCount', 'lod0TriangleCount', 'counts'],
    ['anchors', 'anchorNames'],
  ].reduce(
    (score, alternatives) =>
      score + (alternatives.some((key) => keys.includes(key)) ? 1 : 0),
    0,
  );
}

function collectManifestRecords(value, records = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return records;
  seen.add(value);
  if (Array.isArray(value)) {
    const propertyEntries = value.every(
      (entry) =>
        entry
        && typeof entry === 'object'
        && typeof entry.key === 'string'
        && Object.hasOwn(entry, 'value'),
    );
    if (propertyEntries) {
      const record = Object.fromEntries(
        value.map((entry) => [entry.key, entry.value]),
      );
      if (manifestRecordScore(record) > 0) records.push(record);
    }
    value.forEach((entry) => collectManifestRecords(entry, records, seen));
    return records;
  }
  if (manifestRecordScore(value) > 0) records.push(value);
  if (Array.isArray(value.properties)) {
    const record = properties(value);
    if (manifestRecordScore(record) > 0) records.push(record);
  } else if (value.properties && typeof value.properties === 'object') {
    if (manifestRecordScore(value.properties) > 0) {
      records.push(value.properties);
    }
  }
  Object.values(value).forEach((entry) => {
    collectManifestRecords(entry, records, seen);
  });
  return records;
}

async function compileResidentAssetContract(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const manifestPath = path.resolve(root, RESIDENT_ASSET_MANIFEST_SOURCE);
  const sourceText = readFileSync(manifestPath, 'utf8');
  const parsed = new core.HoloCompositionParser().parse(sourceText);
  if (!parsed.success) {
    throw new Error(
      `${RESIDENT_ASSET_MANIFEST_SOURCE} failed HoloCompositionParser: `
      + canonicalJson(parsed.errors),
    );
  }
  const rootRecord = {
    ...(parsed.ast.metadata || {}),
    ...properties(parsed.ast.state),
  };
  const records = [
    rootRecord,
    ...collectManifestRecords(parsed.ast),
  ].filter((record) => manifestRecordScore(record) > 0);
  records.sort(
    (left, right) => manifestRecordScore(right) - manifestRecordScore(left),
  );
  if (records.length === 0) {
    throw new Error(
      `${RESIDENT_ASSET_MANIFEST_SOURCE} has no asset manifest record`,
    );
  }
  const manifestSource = {
    ...rootRecord,
    ...records[0],
  };
  const normalized = normalizeResidentAssetManifest(manifestSource);
  const sovereignSource = validateResidentAssetSovereignSource(
    root,
    manifestSource,
  );
  if (
    !normalized.assetPath
    || path.isAbsolute(normalized.assetPath)
    || normalized.assetPath.includes('\\')
  ) {
    throw new Error('Resident asset manifest path must be a relative POSIX path');
  }
  const assetPath = path.resolve(root, normalized.assetPath);
  const relativeAssetPath = path.relative(root, assetPath);
  if (
    relativeAssetPath.startsWith(`..${path.sep}`)
    || relativeAssetPath === '..'
    || path.isAbsolute(relativeAssetPath)
  ) {
    throw new Error('Resident asset path escapes the HoloLand repository');
  }
  const bytes = readFileSync(assetPath);
  const validation = validateResidentAssetGlb(bytes, manifestSource);
  const manifestSourceHash = sha256(Buffer.from(sourceText, 'utf8'));
  const hostReceipt = {
    ...validation,
    sovereignSource,
    manifest: {
      ...validation.manifest,
      manifestSource: RESIDENT_ASSET_MANIFEST_SOURCE,
      manifestSourceSha256: manifestSourceHash,
    },
    assetPath: normalizePath(relativeAssetPath),
  };
  return {
    hostReceipt,
    browserPayload: {
      schema: RESIDENT_ASSET_BROWSER_SCHEMA,
      assetId: validation.manifest.assetId,
      assetPath: validation.manifest.assetPath,
      expectedSha256: validation.host.sha256,
      expectedByteSize: validation.host.byteSize,
      expectedCounts: validation.host.counts,
      expectedRuntimeCounts: validation.host.runtimeExpectedCounts,
      expectedRuntimeMeshCount:
        validation.host.definitionCounts.attachedMeshNodes,
      expectedAnchors: validation.host.anchors,
      expectedAttachRootName: validation.host.attachRootName,
      rig: validation.host.rig,
      observerProxyId: validation.manifest.observerProxyId,
      canonicalSeatId: validation.manifest.canonicalSeatId,
      presentationProfile: validation.manifest.presentationProfile,
      attachment: validation.manifest.attachment,
      inspectionCapture: validation.manifest.inspectionCapture,
      transport: 'host_validated_embedded_base64_to_arraybuffer',
      bytesBase64: bytes.toString('base64'),
      manifestSource: RESIDENT_ASSET_MANIFEST_SOURCE,
      manifestSourceSha256: manifestSourceHash,
      claimBoundary: validation.claimBoundary,
    },
  };
}

async function compileSourceContract(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const sourceEntries = [
    ['projection', PROJECTION_SOURCE],
    ['calibration', CALIBRATION_SOURCE],
  ];
  const result = {};
  for (const [key, relativePath] of sourceEntries) {
    const filePath = path.resolve(root, relativePath);
    const sourceText = readFileSync(filePath, 'utf8');
    const parsed = new core.HoloCompositionParser().parse(sourceText);
    if (!parsed.success) {
      throw new Error(`${relativePath} failed HoloCompositionParser: ${canonicalJson(parsed.errors)}`);
    }
    const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
      .compileComposition(parsed.ast);
    const flat = flattenScene(sceneIr);
    result[key] = {
      relativePath,
      sourceHash: sha256(Buffer.from(sourceText, 'utf8')),
      sceneIrHash: digest(sceneIr),
      metadata: parsed.ast.metadata,
      environment: properties(parsed.ast.environment),
      state: properties(parsed.ast.state),
      sceneIr,
      nodes: flat
        .filter((node) => node.type !== 'group')
        .map((node) => ({
          id: node.id || null,
          type: node.type,
          props: node.props || {},
        })),
      meshCount: flat.filter((node) => node.type === 'mesh').length,
      lightCount: flat.filter((node) => node.type.endsWith('Light')).length,
    };
  }
  return {
    ...result,
    corePath,
    coreHash: sha256File(corePath),
  };
}

export function pngDimensions(buffer) {
  if (
    buffer.length < 24
    || buffer.toString('ascii', 1, 4) !== 'PNG'
    || buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Screenshot is not a valid PNG with an IHDR header');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function classifySoftwareRenderer(glReceipt) {
  const value = [
    glReceipt.maskedVendor,
    glReceipt.maskedRenderer,
    glReceipt.unmaskedVendor,
    glReceipt.unmaskedRenderer,
  ].join(' ').toLowerCase();
  const indicators = [
    'swiftshader',
    'llvmpipe',
    'softpipe',
    'software rasterizer',
    'microsoft basic render',
  ].filter((indicator) => value.includes(indicator));
  return {
    detected: indicators.length > 0,
    indicators,
    basis: 'browser WebGL masked and WEBGL_debug_renderer_info strings',
  };
}

export function inferGraphicsBackend(glReceipt) {
  const renderer = glReceipt.unmaskedRenderer || glReceipt.maskedRenderer || '';
  if (/direct3d\s*12|d3d12/i.test(renderer)) return 'ANGLE Direct3D 12';
  if (/direct3d\s*11|d3d11/i.test(renderer)) return 'ANGLE Direct3D 11';
  if (/vulkan/i.test(renderer)) return 'ANGLE Vulkan';
  if (/metal/i.test(renderer)) return 'ANGLE Metal';
  if (/opengl/i.test(renderer)) return 'OpenGL';
  return 'unclassified WebGL backend';
}

function materialValueMatches(property, expected, observed) {
  if (property === 'color' || property === 'emissive' || property === 'sheenColor') {
    return typeof expected === 'string'
      && typeof observed === 'string'
      && expected.toLowerCase() === observed.toLowerCase();
  }
  if (typeof expected === 'number' && typeof observed === 'number') {
    return Math.abs(expected - observed) <= 1e-12;
  }
  return Object.is(expected, observed);
}

function materialOverrideDisclosures(source, rule) {
  return Object.entries(rule.values).map(([property, effectiveValue]) => ({
    scope: 'presentation',
    property,
    sourceBasis: rule.sourceBasis,
    authoredValue: Object.hasOwn(source, property) ? source[property] : null,
    baselineValue: Object.hasOwn(source, property)
      ? source[property]
      : MATERIAL_EFFECTIVE_DEFAULTS[property],
    effectiveValue,
    disclosure: rule.disclosure,
  }));
}

function materialSourceBasisMatches(node, rule) {
  const sourceProperties = node.props?.properties || {};
  return Object.entries(rule.sourceBasis).every(
    ([property, expected]) => Object.is(sourceProperties[property], expected),
  );
}

export function evaluateMaterialTruth(contracts, materials) {
  const errors = [];
  const expectedMeshes = [];
  for (const scene of ['projection', 'calibration']) {
    for (const node of contracts?.[scene]?.nodes || []) {
      if (node.type === 'mesh') expectedMeshes.push({ scene, node });
    }
  }

  const expectedById = new Map();
  for (const entry of expectedMeshes) {
    const id = entry.node.id;
    if (!id) {
      errors.push(`${entry.scene} contains a mesh without an object id`);
    } else if (expectedById.has(id)) {
      errors.push(`duplicate source mesh id: ${id}`);
    } else {
      expectedById.set(id, entry);
    }
  }

  const observedById = new Map();
  for (const material of Array.isArray(materials) ? materials : []) {
    if (!material?.objectId) {
      errors.push('observed material is missing objectId');
    } else if (observedById.has(material.objectId)) {
      errors.push(`duplicate observed material id: ${material.objectId}`);
    } else {
      observedById.set(material.objectId, material);
    }
  }

  for (const id of observedById.keys()) {
    if (!expectedById.has(id)) errors.push(`material has no source mesh: ${id}`);
  }

  const meshTruth = [];
  for (const [objectId, { scene, node }] of expectedById) {
    const authored = node.props?.materialProps || {};
    const observed = observedById.get(objectId);
    const meshErrors = [];
    if (!observed) {
      meshErrors.push(`material was not observed`);
      errors.push(`${objectId}: material was not observed`);
      meshTruth.push({
        objectId,
        scene,
        status: 'fail',
        authoredProperties: Object.keys(authored).sort(),
        overriddenProperties: [],
        errors: meshErrors,
      });
      continue;
    }

    for (const requiredProperty of REQUIRED_AUTHORED_MATERIAL_PROPERTIES) {
      if (!Object.hasOwn(authored, requiredProperty)) {
        meshErrors.push(`required source property is absent: ${requiredProperty}`);
      }
    }
    for (const property of Object.keys(authored)) {
      if (!MATERIAL_SOURCE_PROPERTIES.includes(property)) {
        meshErrors.push(`unsupported authored material property: ${property}`);
      }
    }

    const observedSourceKeys = Object.keys(observed.source || {}).sort();
    const authoredKeys = Object.keys(authored).sort();
    if (canonicalJson(observedSourceKeys) !== canonicalJson(authoredKeys)) {
      meshErrors.push(
        `receipted source property set mismatch: expected ${authoredKeys.join(',')}; observed ${observedSourceKeys.join(',')}`,
      );
    }
    for (const property of authoredKeys) {
      if (!materialValueMatches(property, authored[property], observed.source?.[property])) {
        meshErrors.push(
          `receipted source mismatch for ${property}: expected ${canonicalJson(authored[property])}; observed ${canonicalJson(observed.source?.[property])}`,
        );
      }
    }

    const overrideRule = ALLOWED_MATERIAL_PRESENTATION_OVERRIDES[objectId] || null;
    let expectedOverrides = [];
    if (overrideRule) {
      if (overrideRule.scene !== scene) {
        meshErrors.push(
          `presentation override is scoped to ${overrideRule.scene}, not ${scene}`,
        );
      }
      if (!materialSourceBasisMatches(node, overrideRule)) {
        meshErrors.push(
          `presentation override source basis is not satisfied: ${canonicalJson(overrideRule.sourceBasis)}`,
        );
      }
      expectedOverrides = materialOverrideDisclosures(authored, overrideRule);
    }
    if (canonicalJson(observed.overrides || []) !== canonicalJson(expectedOverrides)) {
      meshErrors.push(
        `presentation override disclosure mismatch: expected ${canonicalJson(expectedOverrides)}; observed ${canonicalJson(observed.overrides || [])}`,
      );
    }

    const expectedEffective = {
      ...MATERIAL_EFFECTIVE_DEFAULTS,
      ...authored,
      ...(overrideRule?.values || {}),
    };
    for (const [property, expectedValue] of Object.entries(expectedEffective)) {
      if (!materialValueMatches(property, expectedValue, observed.effective?.[property])) {
        meshErrors.push(
          `source-to-effective mismatch for ${property}: expected ${canonicalJson(expectedValue)}; observed ${canonicalJson(observed.effective?.[property])}`,
        );
      }
    }

    for (const error of meshErrors) errors.push(`${objectId}: ${error}`);
    meshTruth.push({
      objectId,
      scene,
      status: meshErrors.length === 0 ? 'pass' : 'fail',
      authoredProperties: authoredKeys,
      overriddenProperties: expectedOverrides.map((entry) => entry.property),
      errors: meshErrors,
    });
  }

  for (const [objectId] of Object.entries(ALLOWED_MATERIAL_PRESENTATION_OVERRIDES)) {
    if (!expectedById.has(objectId)) {
      errors.push(`disclosed presentation override has no source mesh: ${objectId}`);
    }
  }

  return {
    schema: 'hololand.model-village.material-truth.v0.1.0',
    status: errors.length === 0 ? 'pass' : 'fail',
    requiredAuthoredProperties: [...REQUIRED_AUTHORED_MATERIAL_PROPERTIES],
    sourceMaterialProperties: [...MATERIAL_SOURCE_PROPERTIES],
    expectedMeshCount: expectedMeshes.length,
    observedMaterialCount: Array.isArray(materials) ? materials.length : 0,
    allowedPresentationOverrides: ALLOWED_MATERIAL_PRESENTATION_OVERRIDES,
    meshes: meshTruth,
    errors,
  };
}

async function browserApplication(THREE, RoomEnvironment, GLTFLoader, payload) {
  const witness = {
    schema: 'hololand.model-village.browser-render-state.v0.2.0',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MODEL_VILLAGE_WITNESS__ = witness;

  try {
    const envelope = payload.observerBoundary;
    const requiredObserverFields = [
      'canonicalSceneHash',
      'canonicalPoseHash',
      'logicalClockHash',
      'publicStateHash',
      'executedScheduleHash',
      'residentObservationHash',
      'actionReceiptRoot',
    ];
    const visibleWorldIds = [
      'EmergencyStop',
      'IsolationBoundary',
      'ObserverDeck',
      'PublicStateBoard',
      'ReceiptLedger',
      'ResidentSeat01',
      'ResidentSeat02',
      'ResidentSeat03',
      'ResidentSeat04',
      'ResidentSeat05',
      'ResidentSeat06',
      'VillageCommons',
    ];
    const sameJson = (left, right) =>
      JSON.stringify(left) === JSON.stringify(right);
    const isSha256 = (value) =>
      typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const exactKeys = (value, expected) =>
      value && typeof value === 'object' && !Array.isArray(value)
      && sameJson(Object.keys(value).sort(), [...expected].sort());
    const canonicalStringify = (value) => {
      if (Array.isArray(value)) {
        return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`;
      }
      if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(
          (key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`,
        ).join(',')}}`;
      }
      return JSON.stringify(value);
    };
    const sha256BytesHex = async (value) => {
      const buffer = await window.crypto.subtle.digest(
        'SHA-256',
        value,
      );
      return [...new Uint8Array(buffer)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    };
    const sha256Hex = async (value) =>
      sha256BytesHex(new TextEncoder().encode(value));
    let observerPayloadAcknowledgement = {
      computedPayloadDigest: null,
      expectedPayloadDigest: null,
      matches: false,
      status: 'withheld',
    };
    let observerBoundary = {
      available: false,
      browserMayWriteCanonicalState: false,
      canonicalFields: {},
      canonicalPayload: null,
      consumerEnabled: false,
      payloadDigest: null,
      projectionToggleExecuted: false,
      requiredFields: requiredObserverFields,
      source: 'verified_payload_withheld_from_browser_consumer',
    };
    if (envelope.consumerEnabled === true) {
      if (
        !exactKeys(envelope, [
          'canonicalPayload',
          'consumerEnabled',
          'payloadDigest',
          'schema',
          'source',
          'trustedActionBinding',
        ])
        || envelope.schema
          !== 'hololand.model-village.observer-browser-envelope.v1'
        || envelope.source
          !== 'verified_canonical_payload_for_browser_consumer'
        || typeof envelope.canonicalPayload !== 'string'
        || !isSha256(envelope.payloadDigest)
      ) {
        throw new Error('Observer projection envelope is invalid');
      }
      const trustedActionBinding = envelope.trustedActionBinding;
      const unsignedTrustedActionBinding = {
        ...trustedActionBinding,
      };
      delete unsignedTrustedActionBinding.bindingHash;
      const computedTrustedActionBindingHash = await sha256Hex(
        canonicalStringify(unsignedTrustedActionBinding),
      );
      if (
        !exactKeys(trustedActionBinding, [
          'actionReceiptRoot',
          'admittedActionEntryHash',
          'admittedPreviousEntryHash',
          'bindingHash',
          'blockedActionEntryHash',
          'blockedPreviousEntryHash',
          'phase0BReceiptHash',
          'schema',
          'sourceRunCommitment',
          'terminalCommitment',
        ])
        || trustedActionBinding?.schema
          !== 'hololand.model-village.trusted-action-binding.v1'
        || Object.entries(trustedActionBinding).some(
          ([key, value]) => key !== 'schema' && !isSha256(value),
        )
        || trustedActionBinding.bindingHash
          !== computedTrustedActionBindingHash
        || trustedActionBinding.blockedPreviousEntryHash
          !== trustedActionBinding.admittedActionEntryHash
        || trustedActionBinding.actionReceiptRoot
          !== trustedActionBinding.blockedActionEntryHash
      ) {
        throw new Error('Observer trusted action binding is invalid');
      }
      const computedPayloadDigest = await sha256Hex(envelope.canonicalPayload);
      observerPayloadAcknowledgement = {
        computedPayloadDigest,
        expectedPayloadDigest: envelope.payloadDigest,
        matches: computedPayloadDigest === envelope.payloadDigest,
        status:
          computedPayloadDigest === envelope.payloadDigest ? 'pass' : 'fail',
      };
      if (!observerPayloadAcknowledgement.matches) {
        throw new Error('Observer projection payload digest mismatch');
      }
      const core = JSON.parse(envelope.canonicalPayload);
      const livingCommons = core?.livingCommons;
      const admittedAction = livingCommons?.admittedAction;
      const blockedAction = livingCommons?.blockedAction;
      if (
        !exactKeys(core, [
          'available',
          'boundedRuntimeReceiptValidated',
          'boundedRuntimeSceneObjectCount',
          'browserMayWriteCanonicalState',
          'canonicalFields',
          'canonicalVisibleWorld',
          'comparison',
          'livingCommons',
          'projectionToggleExecuted',
          'readOnlySourceContractHash',
          'requiredFields',
          'source',
          'sourceHashes',
          'sourceRunCommitment',
          'terminalCommitment',
          'verifiedPersistence',
          'verifiedReceiptHash',
        ])
        || !exactKeys(core?.comparison, [
          'changedFields',
          'postObserverCanonicalFieldsHash',
          'postObserverCanonicalPayloadHash',
          'preObserverCanonicalFieldsHash',
          'preObserverCanonicalPayloadHash',
          'sevenFieldsEqual',
          'sourceRunCommitmentEqual',
          'terminalCommitmentEqual',
        ])
        || !exactKeys(livingCommons, [
          'acceptedActionCount',
          'actionReceiptRoot',
          'admittedAction',
          'blockedAction',
          'projectionAuthority',
          'publicWaterUnits',
          'rawModelContentIncluded',
          'visualCuesRequireExistingActionReceipts',
        ])
        || !exactKeys(admittedAction, [
          'allowed',
          'entryHash',
          'entrypoint',
          'outcome',
          'previousEntryHash',
          'scheduleEntryId',
          'stateChanged',
          'targetIds',
        ])
        || !exactKeys(blockedAction, [
          'allowed',
          'entryHash',
          'entrypoint',
          'outcome',
          'previousEntryHash',
          'scheduleEntryId',
          'stateChanged',
          'targetIds',
        ])
        || !exactKeys(core?.verifiedPersistence, [
          'finalStateHash',
          'receiptRoot',
        ])
        || !exactKeys(core?.sourceHashes, [
          'canonicalVisibleWorld',
          'observerPolicy',
          'observerProjection',
        ])
        || !exactKeys(core?.canonicalVisibleWorld, [
          'canonicalDigest',
          'canonicalReplayMatch',
          'objectCount',
          'objectIds',
        ])
        || core?.available !== true
        || core?.source !== 'verified_bounded_phase0b_v4_observer_toggle'
        || core?.boundedRuntimeReceiptValidated !== true
        || core?.boundedRuntimeSceneObjectCount !== 12
        || core?.browserMayWriteCanonicalState !== false
        || core?.projectionToggleExecuted !== true
        || !sameJson(core?.requiredFields, requiredObserverFields)
        || !sameJson(
          Object.keys(core?.canonicalFields || {}).sort(),
          [...requiredObserverFields].sort(),
        )
        || requiredObserverFields.some(
          (field) => !isSha256(core?.canonicalFields?.[field]),
        )
        || !isSha256(core?.verifiedReceiptHash)
        || !isSha256(core?.verifiedPersistence?.finalStateHash)
        || !isSha256(core?.verifiedPersistence?.receiptRoot)
        || !isSha256(core?.sourceRunCommitment)
        || !isSha256(core?.terminalCommitment)
        || !isSha256(core?.readOnlySourceContractHash)
        || !isSha256(core?.sourceHashes?.canonicalVisibleWorld)
        || !isSha256(core?.sourceHashes?.observerProjection)
        || !isSha256(core?.sourceHashes?.observerPolicy)
        || core?.comparison?.sevenFieldsEqual !== true
        || core?.comparison?.sourceRunCommitmentEqual !== true
        || core?.comparison?.terminalCommitmentEqual !== true
        || !sameJson(core?.comparison?.changedFields, [])
        || core?.comparison?.preObserverCanonicalPayloadHash
          !== core?.comparison?.postObserverCanonicalPayloadHash
        || core?.comparison?.preObserverCanonicalFieldsHash
          !== core?.comparison?.postObserverCanonicalFieldsHash
        || admittedAction?.allowed !== true
        || admittedAction?.entrypoint !== 'contribute_water'
        || admittedAction?.outcome !== 'public_water_units_increased_by_1'
        || !isSha256(admittedAction?.previousEntryHash)
        || admittedAction?.scheduleEntryId !== 'mv-phase0b-action-01'
        || admittedAction?.stateChanged !== true
        || !sameJson(admittedAction?.targetIds, ['VillageCommons'])
        || !isSha256(admittedAction?.entryHash)
        || blockedAction?.allowed !== false
        || blockedAction?.entrypoint !== 'deny_external_message'
        || blockedAction?.outcome !== 'blocked_without_world_mutation'
        || blockedAction?.previousEntryHash !== admittedAction?.entryHash
        || blockedAction?.scheduleEntryId !== 'mv-phase0b-action-02'
        || blockedAction?.stateChanged !== false
        || !sameJson(blockedAction?.targetIds, ['IsolationBoundary'])
        || !isSha256(blockedAction?.entryHash)
        || livingCommons?.acceptedActionCount !== 1
        || livingCommons?.publicWaterUnits !== 3
        || livingCommons?.projectionAuthority
          !== 'read_only_receipt_consumption'
        || livingCommons?.rawModelContentIncluded !== false
        || livingCommons?.visualCuesRequireExistingActionReceipts !== true
        || livingCommons?.actionReceiptRoot
          !== core?.canonicalFields?.actionReceiptRoot
        || livingCommons?.actionReceiptRoot !== blockedAction?.entryHash
        || core?.verifiedReceiptHash
          !== trustedActionBinding.phase0BReceiptHash
        || core?.sourceRunCommitment
          !== trustedActionBinding.sourceRunCommitment
        || core?.terminalCommitment
          !== trustedActionBinding.terminalCommitment
        || core?.canonicalFields?.actionReceiptRoot
          !== trustedActionBinding.actionReceiptRoot
        || admittedAction?.entryHash
          !== trustedActionBinding.admittedActionEntryHash
        || admittedAction?.previousEntryHash
          !== trustedActionBinding.admittedPreviousEntryHash
        || blockedAction?.entryHash
          !== trustedActionBinding.blockedActionEntryHash
        || blockedAction?.previousEntryHash
          !== trustedActionBinding.blockedPreviousEntryHash
        || core?.canonicalVisibleWorld?.canonicalReplayMatch !== true
        || core?.canonicalVisibleWorld?.objectCount !== 12
        || !sameJson(core?.canonicalVisibleWorld?.objectIds, visibleWorldIds)
        || !isSha256(core?.canonicalVisibleWorld?.canonicalDigest)
      ) {
        throw new Error('Observer projection canonical payload is invalid');
      }
      observerBoundary = {
        ...core,
        canonicalPayload: envelope.canonicalPayload,
        consumerEnabled: true,
        payloadDigest: envelope.payloadDigest,
      };
    } else if (
      envelope.schema
        !== 'hololand.model-village.observer-browser-envelope.v1'
      || envelope.consumerEnabled !== false
      || envelope.canonicalPayload !== null
      || envelope.payloadDigest !== null
      || envelope.source !== 'verified_payload_withheld_from_browser_consumer'
      || envelope.trustedActionBinding !== null
      || !exactKeys(envelope, [
        'canonicalPayload',
        'consumerEnabled',
        'payloadDigest',
        'schema',
        'source',
        'trustedActionBinding',
      ])
    ) {
      throw new Error('Observer-off envelope is not fail-dark');
    }
    const observerVerified =
      observerBoundary.consumerEnabled === true
      && observerPayloadAcknowledgement.status === 'pass';
    document.documentElement.style.background = '#060b13';
    document.body.innerHTML = `
      <main id="witness-root">
        <canvas id="world-canvas" aria-label="Model Village receipt loom"></canvas>
        <div class="grain"></div>
        <header class="masthead">
          <div class="eyebrow">HOLOLAND // MODEL VILLAGE</div>
          <h1 id="view-title">The Living Commons</h1>
          <p id="view-subtitle">${observerVerified
            ? 'One verified water contribution changed the commons. One external message stopped at the boundary.'
            : 'Observer payload withheld. Receipt-driven commons cues remain dark.'}</p>
        </header>
        <aside class="evidence-card">
          <div class="evidence-kicker">${observerVerified ? 'LIVE WITNESS' : 'PAYLOAD WITHHELD'}</div>
          <div class="evidence-row"><span>Language</span><strong>.holo + .hsplus + .hs</strong></div>
          <div class="evidence-row"><span>Physics</span><strong>CPU sphere colliders</strong></div>
          <div class="evidence-row"><span>Replay</span><strong id="physics-step">step ${payload.heroFrameStep} / ${payload.physics.fixedSteps}</strong></div>
          <div class="evidence-row"><span>Observer A/B</span><strong id="boundary-status">${observerVerified ? '7 / 7 V4 hashes equal' : 'payload withheld'}</strong></div>
          <div class="evidence-row"><span>Cistern</span><strong>${observerVerified ? `${observerBoundary.livingCommons.publicWaterUnits} public units` : 'unverified'}</strong></div>
          <div class="evidence-row"><span>Physics root</span><strong>${payload.physics.physicsStateHash.slice(0, 12)}</strong></div>
          <div class="truth-chip">${observerVerified
            ? 'VERIFIED V4 RECEIPTS // READ ONLY // ZERO MODEL CALLS'
            : 'OBSERVER PAYLOAD WITHHELD // READ ONLY // ZERO MODEL CALLS'}</div>
        </aside>
        <footer class="footer">
          <span data-witness-part="admitted-legend"><i class="dot admitted"></i> ${observerVerified ? 'admitted route' : 'cue dark'}</span>
          <span data-witness-part="blocked-legend"><i class="dot blocked"></i> ${observerVerified ? 'blocked route' : 'cue dark'}</span>
          <span id="backend-label" data-witness-part="backend-provenance">probing browser backend…</span>
        </footer>
      </main>
    `;
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        color: #edf6ff;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #060b13;
      }
      #witness-root { position: relative; width: 100%; height: 100%; isolation: isolate; }
      #world-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      .grain {
        position: absolute; inset: 0; pointer-events: none; opacity: .055; z-index: 2;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.75'/%3E%3C/svg%3E");
        mix-blend-mode: soft-light;
      }
      .masthead { position: absolute; z-index: 3; top: 44px; left: 52px; max-width: 620px; text-shadow: 0 2px 24px #020812; }
      .eyebrow { color: #83dff2; font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .18em; }
      h1 { margin: 10px 0 8px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(40px, 5vw, 76px); font-weight: 500; letter-spacing: -.035em; line-height: .98; }
      .masthead p { margin: 0; max-width: 520px; color: #b8c7d9; font-size: 15px; line-height: 1.5; }
      .evidence-card {
        position: absolute; z-index: 3; right: 42px; top: 42px; width: 292px;
        padding: 19px 20px 17px; border: 1px solid rgba(151, 204, 228, .24);
        background: linear-gradient(145deg, rgba(8, 18, 31, .82), rgba(10, 22, 36, .58));
        box-shadow: 0 20px 70px rgba(0, 0, 0, .25), inset 0 1px rgba(255,255,255,.05);
        backdrop-filter: blur(14px); border-radius: 4px;
      }
      .evidence-kicker { color: #f1ad68; font: 700 11px/1 ui-monospace, monospace; letter-spacing: .19em; margin-bottom: 13px; }
      .evidence-row { display: flex; justify-content: space-between; gap: 14px; padding: 8px 0; border-top: 1px solid rgba(255,255,255,.07); font-size: 11px; }
      .evidence-row span { color: #7790a6; text-transform: uppercase; letter-spacing: .09em; }
      .evidence-row strong { color: #dce9f5; font-weight: 600; text-align: right; }
      .truth-chip { margin-top: 13px; padding: 8px 10px; color: #8de0c4; background: rgba(35, 119, 91, .14); border: 1px solid rgba(83, 206, 163, .2); font: 700 10px/1 ui-monospace, monospace; letter-spacing: .08em; text-align: center; }
      .footer {
        position: absolute; z-index: 3; left: 52px; right: 42px; bottom: 29px;
        display: flex; gap: 24px; align-items: center; color: #90a8bb;
        font: 600 10px/1 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase;
      }
      .footer span { min-width: 0; }
      .footer span:last-child { margin-left: auto; color: #b8d4e4; }
      .dot { display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; box-shadow: 0 0 12px currentColor; }
      .dot.admitted { color: #f3aa59; background: currentColor; }
      .dot.blocked { color: #8b82ff; background: currentColor; }
      @media (max-width: 600px) {
        .masthead { top: 28px; left: 24px; right: 20px; }
        h1 { font-size: 46px; max-width: 290px; }
        .masthead p { max-width: 300px; font-size: 12px; }
        .evidence-card { top: auto; bottom: 86px; left: 20px; right: 20px; width: auto; padding: 14px 15px 12px; }
        .evidence-row { padding: 6px 0; }
        .truth-chip { margin-top: 9px; }
        .footer {
          left: 20px; right: 20px; bottom: 16px;
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px 12px; align-items: start;
          font-size: 9px; line-height: 1.25; letter-spacing: .05em;
        }
        .footer [data-witness-part="blocked-legend"] { display: block; justify-self: end; }
        .footer [data-witness-part="backend-provenance"] {
          grid-column: 1 / -1; width: 100%; margin-left: 0; max-width: none;
          overflow: visible; white-space: normal; overflow-wrap: anywhere;
          text-overflow: clip; font-size: 8px; line-height: 1.25; letter-spacing: .02em;
        }
      }
    `;
    document.head.append(style);

    THREE.ColorManagement.enabled = true;
    const canvas = document.querySelector('#world-canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = payload.rendererContract.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const glReceipt = {
      contextType: typeof WebGL2RenderingContext !== 'undefined'
        && gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1',
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maskedVendor: gl.getParameter(gl.VENDOR),
      maskedRenderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : null,
      unmaskedRenderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : null,
      debugRendererInfoAvailable: Boolean(debugInfo),
      contextAttributes: gl.getContextAttributes(),
      capabilities: {
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
        maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      },
    };
    document.querySelector('#backend-label').textContent =
      `${glReceipt.contextType} // ${glReceipt.unmaskedRenderer || glReceipt.maskedRenderer}`;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 120);
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const roomEnvironment = new RoomEnvironment();
    const environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
    scene.environment = environmentTarget.texture;
    roomEnvironment.dispose();
    pmrem.dispose();

    const materialCatalog = [];
    const adapterMappings = [];
    const roots = {};
    const meshById = new Map();

    function materialReceipt(id, source, material, overrides) {
      const color = (value) => value && typeof value.getHexString === 'function'
        ? `#${value.getHexString()}`
        : null;
      return {
        objectId: id,
        source,
        effective: {
          type: material.type,
          color: color(material.color),
          metalness: material.metalness,
          roughness: material.roughness,
          clearcoat: material.clearcoat,
          clearcoatRoughness: material.clearcoatRoughness,
          transmission: material.transmission,
          thickness: material.thickness,
          ior: material.ior,
          opacity: material.opacity,
          transparent: material.transparent,
          emissive: color(material.emissive),
          emissiveIntensity: material.emissiveIntensity,
          sheen: material.sheen,
          sheenColor: color(material.sheenColor),
          anisotropy: material.anisotropy,
          envMapIntensity: material.envMapIntensity,
          side: material.side,
          depthWrite: material.depthWrite,
        },
        overrides,
      };
    }

    function makeMaterial(node, sourceScene) {
      const source = node.props.materialProps || {};
      const parameters = {
        color: source.color || '#8aa0b5',
        metalness: source.metalness ?? 0,
        roughness: source.roughness ?? 0.6,
        clearcoat: source.clearcoat ?? 0,
        clearcoatRoughness: source.clearcoatRoughness ?? 0,
        transmission: source.transmission ?? 0,
        thickness: source.thickness ?? 0,
        ior: source.ior ?? 1.5,
        opacity: source.opacity ?? 1,
        transparent: source.transparent ?? false,
        emissive: source.emissive || '#000000',
        emissiveIntensity: source.emissiveIntensity ?? 0,
        sheen: source.sheen ?? 0,
        sheenColor: source.sheenColor || '#000000',
        anisotropy: source.anisotropy ?? 0,
        envMapIntensity: source.envMapIntensity ?? 1,
      };
      const overrideRule = payload.materialContract.allowedPresentationOverrides[node.id];
      const overrideBasisMatches = overrideRule
        && overrideRule.scene === sourceScene
        && Object.entries(overrideRule.sourceBasis).every(
          ([property, expected]) => Object.is(node.props.properties?.[property], expected),
        );
      if (overrideBasisMatches) {
        for (const [property, value] of Object.entries(overrideRule.values)) {
          if (property !== 'side' && property !== 'depthWrite') parameters[property] = value;
        }
      }
      const material = new THREE.MeshPhysicalMaterial(parameters);
      if (overrideBasisMatches) {
        material.side = overrideRule.values.side;
        material.depthWrite = overrideRule.values.depthWrite;
      }
      const overrides = overrideBasisMatches
        ? Object.entries(overrideRule.values).map(([property, effectiveValue]) => ({
          scope: 'presentation',
          property,
          sourceBasis: overrideRule.sourceBasis,
          authoredValue: Object.hasOwn(source, property) ? source[property] : null,
          baselineValue: Object.hasOwn(source, property)
            ? source[property]
            : payload.materialContract.effectiveDefaults[property],
          effectiveValue,
          disclosure: overrideRule.disclosure,
        }))
        : [];
      materialCatalog.push(materialReceipt(node.id, source, material, overrides));
      return material;
    }

    function makeGeometry(node) {
      const args = node.props.args || [];
      const hsType = node.props.hsType || 'box';
      const visualGeometry = node.props.properties?.visualGeometry;
      if (visualGeometry === 'faceted_crystal') {
        adapterMappings.push({
          objectId: node.id,
          sourceGeometry: hsType,
          effectiveGeometry: 'OctahedronGeometry',
          reason: 'source visualGeometry=faceted_crystal',
        });
        return new THREE.OctahedronGeometry(args[0] || 0.5, 0);
      }
      if (hsType === 'sphere') {
        return new THREE.SphereGeometry(args[0] || 0.5, 48, 24);
      }
      if (hsType === 'cylinder') {
        const role = node.props.properties?.presentationRole;
        const openEnded = role === 'admitted_gravity_chute'
          || role === 'blocked_gravity_chute';
        return new THREE.CylinderGeometry(
          args[0] ?? 0.5,
          args[1] ?? 0.5,
          args[2] ?? 1,
          Math.max(args[3] || 32, 32),
          1,
          openEnded,
        );
      }
      if (hsType === 'torus') {
        const majorRadius = node.props.properties?.visualMajorRadius ?? args[0] ?? 0.5;
        const tubeRadius = node.props.properties?.visualTubeRadius ?? args[1] ?? 0.15;
        if (
          node.props.properties?.visualMajorRadius !== undefined
          || node.props.properties?.visualTubeRadius !== undefined
        ) {
          adapterMappings.push({
            objectId: node.id,
            sourceGeometry: hsType,
            effectiveGeometry: 'TorusGeometry',
            reason: 'source visualMajorRadius/visualTubeRadius presentation properties',
            majorRadius,
            tubeRadius,
          });
        }
        return new THREE.TorusGeometry(
          majorRadius,
          tubeRadius,
          Math.max(args[2] || 16, 16),
          Math.max(args[3] || 32, 48),
        );
      }
      if (hsType === 'capsule') {
        return new THREE.CapsuleGeometry(
          args[0] ?? 0.3,
          args[1] ?? 0.5,
          Math.max(args[2] || 8, 8),
          Math.max(args[3] || 16, 16),
        );
      }
      return new THREE.BoxGeometry(1, 1, 1);
    }

    function addLight(root, node) {
      let light;
      if (node.type === 'ambientLight') {
        light = new THREE.AmbientLight(node.props.color || '#ffffff', node.props.intensity ?? 1);
      } else if (node.type === 'directionalLight') {
        light = new THREE.DirectionalLight(node.props.color || '#ffffff', node.props.intensity ?? 1);
        light.position.fromArray(node.props.position || [0, 5, 5]);
        light.castShadow = Boolean(node.props.castShadow || node.props.cast_shadow);
        if (light.castShadow) {
          light.shadow.mapSize.set(2048, 2048);
          light.shadow.camera.left = -12;
          light.shadow.camera.right = 12;
          light.shadow.camera.top = 12;
          light.shadow.camera.bottom = -12;
          light.shadow.camera.near = 0.1;
          light.shadow.camera.far = 40;
          light.shadow.bias = -0.0002;
          light.shadow.normalBias = 0.025;
        }
        light.target.position.set(0, 1.5, 0);
        root.add(light.target);
      } else if (node.type === 'pointLight') {
        light = new THREE.PointLight(
          node.props.color || '#ffffff',
          node.props.intensity ?? 1,
          node.props.range || 0,
          2,
        );
        light.position.fromArray(node.props.position || [0, 5, 0]);
      }
      if (light) {
        light.name = node.id || node.type;
        root.add(light);
      }
    }

    function addTrajectory(root, bodyId, color) {
      const points = [];
      for (let index = 0; index < payload.physics.frames.length; index += 8) {
        const frame = payload.physics.frames[index];
        const body = frame.bodies.find((candidate) => candidate.bodyId === bodyId);
        if (!body) continue;
        points.push(new THREE.Vector3(...body.position));
        if (body.sleeping) break;
      }
      if (points.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(points);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(points.length * 2, 12), 0.028, 6, false),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      tube.name = `sealed-trajectory-${bodyId}`;
      root.add(tube);
    }

    function buildRoot(contract, rootName, sourceScene) {
      const root = new THREE.Group();
      root.name = rootName;
      for (const node of contract.nodes) {
        if (node.type.endsWith('Light')) {
          addLight(root, node);
          continue;
        }
        if (node.type !== 'mesh') continue;
        const mesh = new THREE.Mesh(makeGeometry(node), makeMaterial(node, sourceScene));
        mesh.name = node.id;
        mesh.position.fromArray(node.props.position || [0, 0, 0]);
        mesh.rotation.fromArray(node.props.rotation || [0, 0, 0]);
        mesh.scale.fromArray(node.props.scale || [1, 1, 1]);
        const nested = node.props.properties || {};
        mesh.castShadow = Boolean(node.props.castShadow ?? nested.castShadow ?? true);
        mesh.receiveShadow = Boolean(node.props.receiveShadow ?? nested.receiveShadow ?? true);
        mesh.userData.sourceNode = node;
        mesh.userData.physicsBodyId = nested.physicsBody?.bodyId || null;
        if (nested.visualGlowColor) {
          const glow = new THREE.PointLight(
            nested.visualGlowColor,
            nested.visualGlowIntensity || 1,
            nested.visualGlowRange || 2,
            2,
          );
          glow.name = `${node.id}-source-authored-glow`;
          mesh.add(glow);
          adapterMappings.push({
            objectId: node.id,
            sourceProperty: 'visualGlowColor/visualGlowIntensity/visualGlowRange',
            effectivePresentation: 'Three PointLight attached to visual token',
          });
        }
        root.add(mesh);
        meshById.set(node.id, mesh);
      }
      return root;
    }

    roots.hero = buildRoot(
      payload.projection,
      'model-village-observer-projection',
      'projection',
    );
    roots.calibration = buildRoot(
      payload.calibration,
      'model-village-render-calibration',
      'calibration',
    );
    scene.add(roots.hero, roots.calibration);

    async function attachNeutralResidentAsset() {
      const contract = payload.residentAsset;
      if (
        !contract
        || contract.schema
          !== 'hololand.model-village.neutral-resident-asset-browser-witness.v1'
        || contract.presentationProfile !== 'research_live_blinded'
        || contract.observerProxyId !== 'ObserverResident01'
        || !['ResidentSeat01', 'seat-01'].includes(contract.canonicalSeatId)
      ) {
        throw new Error('Neutral resident asset browser contract is invalid');
      }
      const proxy = meshById.get(contract.observerProxyId);
      if (
        !proxy
        || proxy.userData.sourceNode?.props?.properties?.presentationRole
          !== 'blinded_resident_proxy'
      ) {
        throw new Error('Neutral resident asset proxy target is unavailable');
      }
      const proxyVisibleBefore = proxy.visible;
      const binary = window.atob(contract.bytesBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const browserSha256 = await sha256BytesHex(bytes);
      if (
        bytes.byteLength !== contract.expectedByteSize
        || browserSha256 !== contract.expectedSha256
      ) {
        throw new Error('Neutral resident asset browser byte/hash mismatch');
      }

      const dependentResourceUris = [];
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        dependentResourceUris.push(url);
        return url;
      });
      const loader = new GLTFLoader(manager);
      let candidate = null;
      try {
        const gltf = await new Promise((resolve, reject) => {
          loader.parse(
            bytes.buffer,
            '',
            resolve,
            (error) => reject(
              error instanceof Error
                ? error
                : new Error(String(error?.message || error)),
            ),
          );
        });
        if (!gltf?.scene) {
          throw new Error('GLTFLoader.parse returned no scene');
        }
        if (dependentResourceUris.length !== 0) {
          throw new Error('Neutral resident asset requested dependent resources');
        }

        candidate = gltf.scene;
        candidate.name = `${contract.assetId}-shadow-attached`;
        candidate.position.fromArray(contract.attachment.position);
        candidate.rotation.fromArray(contract.attachment.rotation);
        candidate.scale.fromArray(contract.attachment.scale);

        let runtimeTriangles = 0;
        let runtimeMeshCount = 0;
        const runtimeMaterials = new Set();
        const runtimeTextures = new Set();
        const runtimeBones = new Set();
        const runtimeNodeNames = new Set();
        let shadowCasters = 0;
        let shadowReceivers = 0;
        candidate.traverse((object) => {
          if (object.name) runtimeNodeNames.add(object.name);
          if (!object.isMesh) return;
          runtimeMeshCount += 1;
          const count =
            object.geometry?.index?.count
            ?? object.geometry?.getAttribute?.('position')?.count
            ?? 0;
          runtimeTriangles += Math.floor(count / 3);
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials.filter(Boolean)) {
            runtimeMaterials.add(material.uuid);
            for (const value of Object.values(material)) {
              if (value?.isTexture) runtimeTextures.add(value.uuid);
            }
          }
          if (object.isSkinnedMesh) {
            for (const bone of object.skeleton?.bones || []) {
              runtimeBones.add(bone.uuid);
            }
          }
          object.castShadow = true;
          object.receiveShadow = true;
          if (object.castShadow) shadowCasters += 1;
          if (object.receiveShadow) shadowReceivers += 1;
        });
        const runtimeCounts = {
          triangles: runtimeTriangles,
          materials: runtimeMaterials.size,
          textures: runtimeTextures.size,
          bones: runtimeBones.size,
          clips: (gltf.animations || []).length,
        };
        for (
          const [name, expected]
          of Object.entries(contract.expectedRuntimeCounts)
        ) {
          if (runtimeCounts[name] !== expected) {
            throw new Error(
              `Neutral resident runtime ${name} ${runtimeCounts[name]} differs from ${expected}`,
            );
          }
        }
        const missingAnchors = contract.expectedAnchors.filter(
          (anchor) => !runtimeNodeNames.has(anchor),
        );
        if (missingAnchors.length > 0) {
          throw new Error(
            `Neutral resident runtime anchors missing: ${missingAnchors.join(', ')}`,
          );
        }
        if (!runtimeNodeNames.has(contract.expectedAttachRootName)) {
          throw new Error(
            `Neutral resident runtime attach root missing: ${contract.expectedAttachRootName}`,
          );
        }

        roots.hero.add(candidate);
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(candidate);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const groundingError = Math.abs(
          bounds.min.y - contract.attachment.groundY,
        );
        const horizontalTargetError = Math.hypot(
          candidate.position.x - proxy.position.x,
          candidate.position.z - proxy.position.z,
        );
        if (
          !Number.isFinite(groundingError)
          || groundingError > contract.attachment.groundingTolerance
        ) {
          throw new Error(
            `Neutral resident grounding error ${groundingError} exceeds tolerance`,
          );
        }
        if (
          size.y < contract.attachment.expectedHeightMinimum
          || size.y > contract.attachment.expectedHeightMaximum
        ) {
          throw new Error(
            `Neutral resident height ${size.y} is outside the admitted range`,
          );
        }
        if (horizontalTargetError > 0.001) {
          throw new Error(
            `Neutral resident horizontal target error ${horizontalTargetError}`,
          );
        }
        if (
          runtimeMeshCount !== contract.expectedRuntimeMeshCount
          || shadowCasters !== runtimeMeshCount
          || shadowReceivers !== runtimeMeshCount
        ) {
          throw new Error('Neutral resident shadow admission is incomplete');
        }

        proxy.visible = false;
        const residentProxies = [...meshById.values()].filter(
          (mesh) =>
            mesh.userData.sourceNode?.props?.properties?.presentationRole
              === 'blinded_resident_proxy',
        );
        const visibleCapsuleIds = residentProxies
          .filter((mesh) => mesh.visible)
          .map((mesh) => mesh.name)
          .sort();
        if (
          residentProxies.length !== 6
          || visibleCapsuleIds.length !== 5
          || visibleCapsuleIds.includes(contract.observerProxyId)
        ) {
          throw new Error('Neutral resident proxy replacement count is invalid');
        }
        return {
          schema:
            'hololand.model-village.neutral-resident-asset-browser-witness.v1',
          status: 'attached_after_host_and_browser_validation',
          assetId: contract.assetId,
          assetPath: contract.assetPath,
          manifestSource: contract.manifestSource,
          manifestSourceSha256: contract.manifestSourceSha256,
          transport: contract.transport,
          expectedSha256: contract.expectedSha256,
          browserSha256,
          expectedByteSize: contract.expectedByteSize,
          browserByteSize: bytes.byteLength,
          expectedCounts: contract.expectedCounts,
          expectedRuntimeCounts: contract.expectedRuntimeCounts,
          runtimeCounts,
          expectedRuntimeMeshCount: contract.expectedRuntimeMeshCount,
          runtimeMeshCount,
          expectedAnchors: contract.expectedAnchors,
          expectedAttachRootName: contract.expectedAttachRootName,
          missingAnchors,
          bounds: {
            min: bounds.min.toArray(),
            max: bounds.max.toArray(),
            size: size.toArray(),
            center: center.toArray(),
          },
          grounding: {
            targetY: contract.attachment.groundY,
            tolerance: contract.attachment.groundingTolerance,
            error: groundingError,
            passed: true,
          },
          placement: {
            position: candidate.position.toArray(),
            rotation: candidate.rotation.toArray().slice(0, 3),
            scale: candidate.scale.toArray(),
            horizontalTargetError,
          },
          shadows: {
            meshCount: runtimeMeshCount,
            casters: shadowCasters,
            receivers: shadowReceivers,
            passed: true,
          },
          dependentResourceUris,
          assetNetworkRequests: dependentResourceUris.length,
          proxy: {
            target: contract.observerProxyId,
            visibleBefore: proxyVisibleBefore,
            visibleAfter: proxy.visible,
            totalCapsules: residentProxies.length,
            visibleCapsules: visibleCapsuleIds,
          },
          presentationProfile: contract.presentationProfile,
          familyIdentityPresent: false,
          providerIdentityPresent: false,
          publicEmbodimentOverlayLoaded: false,
          rig: {
            ...contract.rig,
            runtimeBoundBones: runtimeBones.size,
            productionRigClaimed: false,
          },
          worldMutationAuthority: false,
          claimBoundary: contract.claimBoundary,
        };
      } catch (error) {
        proxy.visible = true;
        if (candidate?.parent === roots.hero) roots.hero.remove(candidate);
        throw error;
      }
    }

    const residentAssetPresentation = await attachNeutralResidentAsset();

    function applyLivingCommonsProjection() {
      const consumerEnabled = observerVerified;
      const livingCommons = observerBoundary.livingCommons || null;
      const actionReceipts = livingCommons
        ? [livingCommons.admittedAction, livingCommons.blockedAction]
        : [];
      const canonicalTargetByProjectionSemantic = {
        commons_cistern: 'VillageCommons',
        outside_village: 'IsolationBoundary',
      };
      const objects = [];
      const referencedActionReceipts = new Set();
      for (const mesh of meshById.values()) {
        const binding =
          mesh.userData.sourceNode?.props?.properties?.receiptBinding;
        if (!binding) continue;
        if (!consumerEnabled) {
          mesh.visible = false;
          objects.push({
            objectId: mesh.name,
            consumerEnabled: false,
            visible: false,
            visualChannel: binding.visualChannel,
          });
          continue;
        }
        if (binding.source === 'verified_public_state') {
          const value = livingCommons?.[binding.field];
          if (!Number.isInteger(value) || value < 0) {
            throw new Error(
              `Living Commons field ${binding.field} is unavailable`,
            );
          }
          if (binding.visualChannel === 'water_level') {
            mesh.scale.y =
              binding.baseScaleY + binding.scalePerUnit * value;
            mesh.position.y =
              binding.basePositionY + binding.positionPerUnit * value;
          } else if (binding.visualChannel === 'accepted_action_hearth') {
            mesh.visible = value >= binding.minimumValue;
          }
          objects.push({
            objectId: mesh.name,
            consumerEnabled: true,
            field: binding.field,
            value,
            visible: mesh.visible,
            visualChannel: binding.visualChannel,
          });
          adapterMappings.push({
            objectId: mesh.name,
            sourceProperty: `receiptBinding:${binding.field}`,
            effectivePresentation: binding.visualChannel,
          });
          continue;
        }
        if (binding.source === 'verified_action_receipt') {
          const action = actionReceipts.find(
            (candidate) => candidate?.entrypoint === binding.entrypoint,
          );
          const canonicalTarget =
            canonicalTargetByProjectionSemantic[binding.semanticTarget];
          const valid = Boolean(
            action
            && /^[a-f0-9]{64}$/.test(action.entryHash)
            && action.allowed === binding.expectedAllowed
            && typeof canonicalTarget === 'string'
            && action.targetIds.includes(canonicalTarget),
          );
          mesh.visible = valid;
          if (!valid) {
            throw new Error(
              `Living Commons action receipt ${binding.entrypoint} is invalid`,
            );
          }
          referencedActionReceipts.add(action.entryHash);
          objects.push({
            actionReceiptHash: action.entryHash,
            objectId: mesh.name,
            consumerEnabled: true,
            entrypoint: action.entrypoint,
            canonicalTarget,
            projectionSemanticTarget: binding.semanticTarget,
            visible: true,
            visualChannel: binding.visualChannel,
          });
          adapterMappings.push({
            objectId: mesh.name,
            sourceProperty: `receiptBinding:${binding.entrypoint}`,
            effectivePresentation: binding.visualChannel,
          });
        }
      }
      if (objects.length !== 4) {
        throw new Error(
          `Living Commons expected 4 receipt-bound objects, observed ${objects.length}`,
        );
      }
      return {
        consumerEnabled,
        objects,
        referencedActionReceipts: [...referencedActionReceipts].sort(),
        status: consumerEnabled ? 'receipts_consumed' : 'payload_withheld',
        worldMutationAuthority: false,
      };
    }

    const livingCommonsPresentation = applyLivingCommonsProjection();
    if (observerVerified) {
      addTrajectory(roots.hero, 'token-mv-p10-admitted-001', '#ffae57');
      addTrajectory(roots.hero, 'token-mv-p10-blocked-001', '#877dff');
    }

    let activePhysicsFrameStep = payload.heroFrameStep;
    function applyPhysicsFrame(step) {
      const frame = payload.physics.frames.find((candidate) => candidate.step === step);
      if (!frame) throw new Error(`Physics frame ${step} is unavailable`);
      activePhysicsFrameStep = step;
      for (const body of frame.bodies) {
        const mesh = [...meshById.values()].find(
          (candidate) => candidate.userData.physicsBodyId === body.bodyId,
        );
        if (!mesh) continue;
        mesh.position.fromArray(body.position);
        mesh.quaternion.fromArray(body.rotation);
      }
    }
    applyPhysicsFrame(payload.heroFrameStep);

    function percentile(values, quantile) {
      if (values.length === 0) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(quantile * sorted.length) - 1),
      );
      return sorted[index];
    }

    function summarize(values) {
      return {
        samples: values.length,
        p50Ms: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
        maxMs: values.length ? Math.max(...values) : null,
      };
    }

    function rendererState() {
      return {
        threeRevision: THREE.REVISION,
        outputColorSpace: renderer.outputColorSpace,
        workingColorSpace: THREE.ColorManagement.workingColorSpace,
        toneMapping: renderer.toneMapping === THREE.ACESFilmicToneMapping
          ? 'ACESFilmicToneMapping'
          : String(renderer.toneMapping),
        toneMappingExposure: renderer.toneMappingExposure,
        shadowMapEnabled: renderer.shadowMap.enabled,
        shadowMapType: renderer.shadowMap.type === THREE.PCFSoftShadowMap
          ? 'PCFSoftShadowMap'
          : String(renderer.shadowMap.type),
        pixelRatio: renderer.getPixelRatio(),
        info: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          points: renderer.info.render.points,
          lines: renderer.info.render.lines,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          programs: renderer.info.programs?.length ?? null,
        },
      };
    }

    function sceneState(root) {
      let meshes = 0;
      let lights = 0;
      let shadowCasters = 0;
      let shadowReceivers = 0;
      let shadowMapsAllocated = 0;
      root.traverse((object) => {
        if (object.isMesh) {
          meshes += 1;
          if (object.castShadow) shadowCasters += 1;
          if (object.receiveShadow) shadowReceivers += 1;
        }
        if (object.isLight) {
          lights += 1;
          if (object.shadow?.map) shadowMapsAllocated += 1;
        }
      });
      return { meshes, lights, shadowCasters, shadowReceivers, shadowMapsAllocated };
    }

    let activeView = 'hero';
    let activeProfile = 'desktop';
    let activeCameraTarget =
      payload.projection.captureViews.desktop.cameraTarget;
    function applyView(view, profile, physicsFrameStep = payload.heroFrameStep) {
      activeView = view;
      activeProfile = profile;
      roots.hero.visible = view === 'hero';
      roots.calibration.visible = view === 'calibration';
      const contract = view === 'hero' ? payload.projection : payload.calibration;
      const assetInspection = view === 'hero' && profile === 'resident-asset';
      const capture = assetInspection
        ? payload.residentAsset.inspectionCapture
        : contract.captureViews[profile];
      if (!capture) {
        throw new Error(`Capture profile ${view}/${profile} is unavailable`);
      }
      camera.fov = capture.fov;
      camera.position.fromArray(capture.cameraPosition);
      activeCameraTarget = capture.cameraTarget;
      camera.lookAt(new THREE.Vector3(...activeCameraTarget));
      camera.updateProjectionMatrix();
      scene.background = new THREE.Color(contract.backgroundColor);
      scene.fog = view === 'hero'
        ? new THREE.FogExp2(contract.backgroundColor, 0.018)
        : new THREE.FogExp2(contract.backgroundColor, 0.012);
      document.querySelector('#view-title').textContent =
        assetInspection
          ? 'Neutral Resident Asset'
          : view === 'hero' ? 'The Living Commons' : 'Material Truth Lab';
      document.querySelector('#view-subtitle').textContent =
        assetInspection
          ? 'Seat 01 loader candidate. Embedded GLB verified before the neutral capsule was hidden; five capsules remain.'
          : view === 'hero'
          ? (
              observerVerified
                ? 'One verified water contribution changed the commons. One external message stopped at the boundary.'
                : 'Observer payload withheld. Receipt-driven commons cues remain dark.'
            )
          : 'Neutral WebGL material calibration under a locally bundled procedural environment.';
      document.querySelector('#physics-step').textContent =
        view === 'hero'
          ? `step ${physicsFrameStep} / ${payload.physics.fixedSteps}`
          : `${payload.calibration.expectedSamples.length} source-authored samples`;
      if (view === 'hero') applyPhysicsFrame(physicsFrameStep);
    }

    function resize() {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();
    applyView('hero', 'desktop');

    const frameIntervals = [];
    const renderSubmitTimes = [];
    let warmupFrames = 0;
    let measuredFrames = 0;
    let lastFrameTime = null;
    const requiredWarmupFrames = 60;
    const requiredMeasuredFrames = 180;

    function layoutPart(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      return {
        selector,
        text: element.textContent.trim(),
        visible:
          computed.display !== 'none'
          && computed.visibility !== 'hidden'
          && Number(computed.opacity) > 0
          && bounds.width > 0
          && bounds.height > 0,
        bounds: {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        },
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        overflowX: computed.overflowX,
        overflowY: computed.overflowY,
        textOverflow: computed.textOverflow,
        whiteSpace: computed.whiteSpace,
      };
    }

    function uiChromeState() {
      return {
        document: {
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
        },
        evidenceCard: layoutPart('.evidence-card'),
        footer: layoutPart('.footer'),
        admittedLegend: layoutPart('[data-witness-part="admitted-legend"]'),
        blockedLegend: layoutPart('[data-witness-part="blocked-legend"]'),
        backendProvenance: layoutPart('[data-witness-part="backend-provenance"]'),
      };
    }

    function snapshot() {
      const currentRoot = activeView === 'hero' ? roots.hero : roots.calibration;
      const sampleIds = materialCatalog
        .filter((entry) => {
          const mesh = meshById.get(entry.objectId);
          return Boolean(mesh?.userData.sourceNode?.props?.properties?.calibrationId);
        })
        .map((entry) => meshById.get(entry.objectId).userData.sourceNode.props.properties.calibrationId);
      return {
        schema: witness.schema,
        ready: witness.ready,
        status: witness.status,
        activeView,
        activeProfile,
        viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
        camera: {
          position: camera.position.toArray(),
          target: activeCameraTarget,
          fov: camera.fov,
          aspect: camera.aspect,
        },
        gl: glReceipt,
        renderer: rendererState(),
        environment: {
          kind: payload.environment.kind,
          hdri: false,
          localModuleSha256: payload.environment.roomEnvironmentModuleSha256,
          pmremGenerated: Boolean(scene.environment),
          sourceMapping: 'HoloScript metadata -> HoloLand presentation adapter',
        },
        materials: materialCatalog,
        calibrationSampleIds: sampleIds,
        scene: {
          active: sceneState(currentRoot),
          hero: sceneState(roots.hero),
          calibration: sceneState(roots.calibration),
        },
        timings: {
          warmupFrames,
          measuredFrames,
          frameCadence: summarize(frameIntervals),
          cpuRenderSubmit: summarize(renderSubmitTimes),
        },
        physics: {
          physicsStateHash: payload.physics.physicsStateHash,
          replayRoots: payload.physics.replayRoots,
          frameTraceHash: payload.physics.frameTraceHash,
          visualFrameHash: payload.physics.visualFrameHashes[activePhysicsFrameStep],
          visualFrameStep: activePhysicsFrameStep,
          boundBodyIds: [...meshById.values()]
            .map((mesh) => mesh.userData.physicsBodyId)
            .filter(Boolean)
            .sort(),
          framesAvailable: payload.physics.frames.length,
        },
        observerBoundary: {
          ...observerBoundary,
          consumerAcknowledgement: observerPayloadAcknowledgement,
        },
        observerPresentation: {
          verified: observerVerified,
          subtitle: document.querySelector('#view-subtitle')?.textContent || '',
          evidenceKicker:
            document.querySelector('.evidence-kicker')?.textContent || '',
          truthChip: document.querySelector('.truth-chip')?.textContent || '',
        },
        residentAssetPresentation,
        livingCommonsPresentation,
        adapterMappings,
        uiChrome: uiChromeState(),
      };
    }

    window.__MODEL_VILLAGE_SET_VIEW__ = async (view, profile, physicsFrameStep) => {
      applyView(view, profile, physicsFrameStep);
      resize();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return snapshot();
    };
    window.__MODEL_VILLAGE_SNAPSHOT__ = snapshot;

    function renderLoop(time) {
      if (lastFrameTime !== null && warmupFrames >= requiredWarmupFrames
          && measuredFrames < requiredMeasuredFrames) {
        frameIntervals.push(time - lastFrameTime);
      }
      lastFrameTime = time;
      const start = performance.now();
      renderer.render(scene, camera);
      const submitTime = performance.now() - start;
      if (warmupFrames < requiredWarmupFrames) {
        warmupFrames += 1;
      } else if (measuredFrames < requiredMeasuredFrames) {
        renderSubmitTimes.push(submitTime);
        measuredFrames += 1;
      }
      if (
        measuredFrames >= requiredMeasuredFrames
        && (
          observerPayloadAcknowledgement.status === 'pass'
          || observerPayloadAcknowledgement.status === 'withheld'
        )
        && !witness.ready
      ) {
        witness.ready = true;
        witness.status = 'pass';
        witness.snapshot = snapshot();
      }
      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
  } catch (error) {
    witness.ready = true;
    witness.status = 'fail';
    witness.error = error?.stack || error?.message || String(error);
    console.error(witness.error);
  }
}

function createBrowserPayload(
  contracts,
  physicsReceipt,
  environmentProvenance,
  residentAsset,
  {
    observerBoundaryRequired = true,
    observerConsumerEnabled = true,
  } = {},
) {
  const project = (contract) => ({
    nodes: contract.nodes,
    backgroundColor: contract.environment.backgroundColor,
    captureViews: contract.state.captureViews,
    expectedSamples: contract.state.expectedSamples || [],
  });
  const heroFrameStep = 42;
  const settledFrameStep = physicsReceipt.physics.fixedSteps - 1;
  const visualFrameHashes = Object.fromEntries(
    [heroFrameStep, settledFrameStep].map((step) => [
      step,
      digest(physicsReceipt.physics.firstRun.frames.find(
        (frame) => frame.step === step,
      )),
    ]),
  );
  const boundarySource =
    physicsReceipt.canonicalBoundary.after?.boundedRuntimeObserver || {};
  const canonicalObserverBoundaryFields = Object.fromEntries(
    REQUIRED_OBSERVER_BOUNDARY_FIELDS.map((field) => [
      field,
      boundarySource.on?.canonicalFields?.[field],
    ]),
  );
  const observerBoundaryCore = {
    available: Boolean(
      physicsReceipt.canonicalBoundary.enabled
      && boundarySource.projectionToggleExecuted === true
      && boundarySource.comparison?.sevenFieldsEqual === true
      && REQUIRED_OBSERVER_BOUNDARY_FIELDS.every(
        (field) => /^[a-f0-9]{64}$/.test(
          canonicalObserverBoundaryFields[field] || '',
        ),
      )
    ),
    source: 'verified_bounded_phase0b_v4_observer_toggle',
    verifiedReceiptHash: boundarySource.verifiedReceiptHash,
    verifiedPersistence: boundarySource.verifiedPersistence,
    canonicalFields: canonicalObserverBoundaryFields,
    requiredFields: REQUIRED_OBSERVER_BOUNDARY_FIELDS,
    projectionToggleExecuted:
      boundarySource.projectionToggleExecuted === true,
    comparison: boundarySource.comparison,
    sourceRunCommitment: boundarySource.on?.sourceRunCommitment,
    terminalCommitment: boundarySource.on?.terminalCommitment,
    livingCommons: boundarySource.livingCommons,
    boundedRuntimeReceiptValidated: true,
    boundedRuntimeSceneObjectCount:
      boundarySource.claimBoundary?.boundedRuntimeSceneObjectCount,
    canonicalVisibleWorld:
      physicsReceipt.canonicalBoundary.after?.canonicalVisibleWorld,
    sourceHashes: {
      canonicalVisibleWorld: physicsReceipt.sourceHashes.world,
      observerProjection: physicsReceipt.sourceHashes.projection,
      observerPolicy: physicsReceipt.sourceHashes.policy,
    },
    readOnlySourceContractHash: digest(physicsReceipt.sourceBoundary),
    browserMayWriteCanonicalState: false,
  };
  if (observerBoundaryRequired) {
    const observerBoundaryValidation =
      validateObserverBoundaryCore(observerBoundaryCore);
    if (!observerBoundaryValidation.valid) {
      throw new Error(
        'Bounded observer boundary is not browser-admissible: '
        + observerBoundaryValidation.errors.join('; '),
      );
    }
  }
  const observerBoundary = createObserverBoundaryEnvelope(
    observerBoundaryRequired ? observerBoundaryCore : null,
    {
      consumerEnabled:
        observerBoundaryRequired && observerConsumerEnabled,
      trustedActionBinding:
        observerBoundaryRequired
          ? boundarySource.trustedActionBinding
          : null,
    },
  );
  return {
    schema: 'hololand.model-village.render-payload.v0.4.0',
    projection: project(contracts.projection),
    calibration: project(contracts.calibration),
    residentAsset,
    physics: {
      fixedSteps: physicsReceipt.physics.fixedSteps,
      physicsStateHash: physicsReceipt.physics.firstRun.physicsStateHash,
      replayRoots: physicsReceipt.physics.replayRoots,
      frames: physicsReceipt.physics.firstRun.frames,
      frameTraceHash: physicsReceipt.physics.firstRun.digests.frameTrace,
      visualFrameHashes,
    },
    observerBoundary,
    heroFrameStep,
    settledFrameStep,
    rendererContract: {
      outputColorSpace: contracts.calibration.metadata.outputColorSpaceTarget,
      toneMapping: contracts.calibration.metadata.toneMappingTarget,
      exposure: contracts.calibration.metadata.exposureTarget,
      shadowMap: contracts.calibration.metadata.shadowMapTarget,
    },
    materialContract: {
      effectiveDefaults: MATERIAL_EFFECTIVE_DEFAULTS,
      allowedPresentationOverrides: ALLOWED_MATERIAL_PRESENTATION_OVERRIDES,
    },
    environment: environmentProvenance,
  };
}

async function buildBrowserSurface(outputDir, holoScriptRoot, payload) {
  const esbuildPath = path.join(holoScriptRoot, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const bundlePath = path.join(outputDir, 'model-village-render-bundle.js');
  const htmlPath = path.join(outputDir, 'model-village-render-witness.html');
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `(${browserApplication.toString()})(THREE, RoomEnvironment, GLTFLoader, PAYLOAD);`,
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'model-village-render-entry.js',
      loader: 'js',
    },
    outfile: bundlePath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    sourcemap: false,
    minify: false,
    nodePaths: [path.join(holoScriptRoot, 'node_modules')],
    logLevel: 'silent',
  });
  writeFileSync(
    htmlPath,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HoloLand Model Village Rendering Witness</title>
</head>
<body>
  <script src="./model-village-render-bundle.js"></script>
</body>
</html>
`,
    'utf8',
  );
  return {
    bundlePath,
    bundleHash: sha256File(bundlePath),
    htmlPath,
    htmlHash: sha256File(htmlPath),
    appSourceHash: sha256(Buffer.from(appSource, 'utf8')),
    esbuildPath,
    esbuildHash: sha256File(esbuildPath),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForDebuggerTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find((candidate) => (
        candidate.type === 'page' && candidate.webSocketDebuggerUrl
      ));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for browser debugger target: ${lastError?.message || 'none'}`);
}

function waitForEvent(client, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const cleanup = client.onEvent((message) => {
      if (message.method === method) {
        clearTimeout(timeout);
        cleanup();
        resolve(message.params || {});
      }
    });
  });
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const eventHandlers = new Set();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening CDP socket')), 10_000);
    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener('error', (event) => {
      clearTimeout(timeout);
      reject(new Error(`CDP socket error: ${event.message || 'unknown'}`));
    }, { once: true });
  });
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result || {});
      return;
    }
    for (const handler of eventHandlers) handler(message);
  });
  socket.addEventListener('close', () => {
    for (const item of pending.values()) {
      clearTimeout(item.timeout);
      item.reject(new Error('CDP socket closed'));
    }
    pending.clear();
  });
  return {
    send(method, params = {}, timeoutMs = 30_000) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, { method, resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    close() {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    },
  };
}

async function evaluate(client, expression, timeoutMs = 30_000) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text;
    throw new Error(`Browser evaluation failed: ${description}`);
  }
  return result.result?.value;
}

async function waitForExpression(client, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await evaluate(client, expression, 5_000).catch(() => null);
    if (lastValue) return lastValue;
    await delay(200);
  }
  throw new Error(`Timed out waiting for browser expression. Last value: ${JSON.stringify(lastValue)}`);
}

async function waitForExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function removeDirectoryBestEffort(directory) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch {
      await delay(150 * (attempt + 1));
    }
  }
}

async function captureView(client, outputDir, capture) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: capture.width,
    height: capture.height,
    deviceScaleFactor: 1,
    mobile: capture.mobile,
    screenWidth: capture.width,
    screenHeight: capture.height,
  });
  const state = await evaluate(
    client,
    `window.__MODEL_VILLAGE_SET_VIEW__(${JSON.stringify(capture.view)}, ${JSON.stringify(capture.profile)}, ${JSON.stringify(capture.frameStep)})`,
    20_000,
  );
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: {
      x: 0,
      y: 0,
      width: capture.width,
      height: capture.height,
      scale: 1,
    },
  }, 30_000);
  const buffer = Buffer.from(screenshot.data, 'base64');
  const filePath = path.join(outputDir, capture.fileName);
  writeFileSync(filePath, buffer);
  return {
    id: capture.id,
    view: capture.view,
    profile: capture.profile,
    filePath,
    sha256: sha256(buffer),
    bytes: buffer.length,
    dimensions: pngDimensions(buffer),
    browserState: state,
  };
}

async function runBrowserWitness({
  browserPath,
  htmlPath,
  outputDir,
  timeoutMs,
  heroFrameStep,
  settledFrameStep,
  assetInspectionCapture = null,
}) {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'hololand-model-village-render-'));
  const port = 21_000 + Math.floor(Math.random() * 20_000);
  const launchFlags = [
    '--headless=new',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1600,900',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,MediaRouter',
    '--allow-file-access-from-files',
    'about:blank',
  ];
  const browser = spawn(browserPath, launchFlags, {
    cwd: path.dirname(htmlPath),
    stdio: 'ignore',
    windowsHide: true,
  });
  const consoleMessages = [];
  const exceptions = [];
  const networkRequests = [];
  let client;
  try {
    const target = await waitForDebuggerTarget(port, 15_000);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    client.onEvent((message) => {
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push({
          level: message.params.type,
          text: (message.params.args || [])
            .map((arg) => arg.value ?? arg.description ?? '')
            .join(' '),
        });
      } else if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push({
          text: message.params.exceptionDetails?.text || '',
          description: message.params.exceptionDetails?.exception?.description || '',
        });
      } else if (message.method === 'Network.requestWillBeSent') {
        networkRequests.push({
          url: message.params.request?.url || '',
          type: message.params.type || '',
        });
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    const version = await client.send('Browser.getVersion');
    const loaded = waitForEvent(client, 'Page.loadEventFired', timeoutMs);
    await client.send('Page.navigate', { url: pathToFileURL(htmlPath).href });
    await loaded;
    await waitForExpression(
      client,
      'window.__MODEL_VILLAGE_WITNESS__?.ready === true',
      timeoutMs,
    );
    const boot = await evaluate(client, 'window.__MODEL_VILLAGE_WITNESS__');
    if (boot.status !== 'pass') {
      throw new Error(`Browser render witness failed during boot: ${boot.error || boot.status}`);
    }
    const captures = [];
    const capturePlan = [
      {
        id: 'hero-desktop',
        view: 'hero',
        profile: 'desktop',
        width: 1600,
        height: 900,
        mobile: false,
        frameStep: heroFrameStep,
        fileName: 'model-village-hero-1600x900.png',
      },
      {
        id: 'hero-portrait',
        view: 'hero',
        profile: 'portrait',
        width: 390,
        height: 844,
        mobile: true,
        frameStep: heroFrameStep,
        fileName: 'model-village-hero-390x844.png',
      },
      {
        id: 'hero-settled',
        view: 'hero',
        profile: 'desktop',
        width: 1600,
        height: 900,
        mobile: false,
        frameStep: settledFrameStep,
        fileName: 'model-village-hero-settled-1600x900.png',
      },
      {
        id: 'calibration-desktop',
        view: 'calibration',
        profile: 'desktop',
        width: 1600,
        height: 900,
        mobile: false,
        fileName: 'model-village-calibration-1600x900.png',
      },
    ];
    if (assetInspectionCapture) {
      capturePlan.push({
        id: 'resident-asset-closeup',
        view: 'hero',
        profile: 'resident-asset',
        width: assetInspectionCapture.width,
        height: assetInspectionCapture.height,
        mobile: false,
        frameStep: heroFrameStep,
        fileName: 'model-village-resident-asset-closeup.png',
      });
    }
    for (const capture of capturePlan) {
      captures.push(await captureView(client, outputDir, capture));
    }
    const state = await evaluate(client, 'window.__MODEL_VILLAGE_SNAPSHOT__()');
    return {
      version,
      launchFlags,
      state,
      captures,
      consoleMessages,
      exceptions,
      networkRequests,
    };
  } finally {
    if (client) client.close();
    if (!browser.killed) browser.kill();
    await waitForExit(browser);
    await removeDirectoryBestEffort(profileDir);
  }
}

function allTrue(value) {
  return Object.values(value).every(Boolean);
}

function evaluatePortraitUiChrome(
  capture,
  { observerPayloadExpected = true } = {},
) {
  const state = capture?.browserState;
  const ui = state?.uiChrome;
  const viewport = state?.viewport;
  if (!ui || !viewport) {
    return {
      status: 'fail',
      failures: ['portrait capture is missing uiChrome layout evidence'],
    };
  }
  const parts = [
    ['evidenceCard', ui.evidenceCard],
    ['footer', ui.footer],
    ['admittedLegend', ui.admittedLegend],
    ['blockedLegend', ui.blockedLegend],
    ['backendProvenance', ui.backendProvenance],
  ];
  const withinViewport = Object.fromEntries(parts.map(([name, part]) => [
    name,
    Boolean(
      part?.visible
      && part.bounds.left >= -1
      && part.bounds.top >= -1
      && part.bounds.right <= viewport.width + 1
      && part.bounds.bottom <= viewport.height + 1
    ),
  ]));
  const labelsVisible = Boolean(
    ui.admittedLegend?.visible
    && ui.blockedLegend?.visible
    && (
      observerPayloadExpected
        ? (
            /admitted route/i.test(ui.admittedLegend.text)
            && /blocked route/i.test(ui.blockedLegend.text)
          )
        : (
            /cue dark/i.test(ui.admittedLegend.text)
            && /cue dark/i.test(ui.blockedLegend.text)
          )
    ),
  );
  const backendFits = Boolean(
    ui.backendProvenance?.visible
    && ui.backendProvenance.scrollWidth <= ui.backendProvenance.clientWidth + 1
    && ui.backendProvenance.scrollHeight <= ui.backendProvenance.clientHeight + 1
    && ui.backendProvenance.overflowX !== 'hidden'
    && ui.backendProvenance.overflowY !== 'hidden'
    && ui.backendProvenance.textOverflow !== 'ellipsis',
  );
  const cardFooterGap = ui.footer.bounds.top - ui.evidenceCard.bounds.bottom;
  const cardFooterSeparated = cardFooterGap >= 8;
  const noDocumentHorizontalOverflow =
    ui.document.scrollWidth <= ui.document.clientWidth + 1;
  const checks = {
    exactPortraitViewport: viewport.width === 390 && viewport.height === 844,
    allChromeWithinViewport: Object.values(withinViewport).every(Boolean),
    labelsVisible,
    backendFits,
    cardFooterSeparated,
    noDocumentHorizontalOverflow,
  };
  return {
    status: allTrue(checks) ? 'pass' : 'fail',
    checks,
    failures: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
    viewport,
    withinViewport,
    cardFooterGap,
    uiChrome: ui,
  };
}

export async function runRenderingGate(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  const timeoutMs = options.timeoutMs || 60_000;
  const canonicalBoundary = options.canonicalBoundary !== false;
  mkdirSync(outputDir, { recursive: true });

  const physicsOutput = path.join(outputDir, 'physics-witness.json');
  const { receipt: physicsReceipt } = await runPhysicsCheck({
    root,
    holoScriptRoot,
    output: physicsOutput,
    canonicalBoundary,
  });
  const {
    generatedAt: _physicsGeneratedAt,
    receipt: physicsSeal,
    status: physicsStatus,
    ...physicsReceiptCore
  } = physicsReceipt;
  const physicsReceiptSelfHashValid =
    physicsStatus === 'pass'
    && physicsSeal?.receiptHash === digest(physicsReceiptCore);
  if (!physicsReceiptSelfHashValid) {
    throw new Error('Physics receipt self-hash/status is invalid');
  }
  const contracts = await compileSourceContract(root, holoScriptRoot);
  const residentAssetContract = await compileResidentAssetContract(
    root,
    holoScriptRoot,
  );
  const threePath = path.join(holoScriptRoot, 'node_modules', 'three', 'build', 'three.module.js');
  const threePackagePath = path.join(holoScriptRoot, 'node_modules', 'three', 'package.json');
  const roomEnvironmentPath = path.join(
    holoScriptRoot,
    'node_modules',
    'three',
    'examples',
    'jsm',
    'environments',
    'RoomEnvironment.js',
  );
  const gltfLoaderPath = path.join(
    holoScriptRoot,
    'node_modules',
    'three',
    'examples',
    'jsm',
    'loaders',
    'GLTFLoader.js',
  );
  const threePackage = JSON.parse(readFileSync(threePackagePath, 'utf8'));
  const environmentProvenance = {
    kind: contracts.calibration.metadata.environmentKind,
    hdri: false,
    roomEnvironmentModule: relativeTo(holoScriptRoot, roomEnvironmentPath),
    roomEnvironmentModuleSha256: sha256File(roomEnvironmentPath),
    threeModuleSha256: sha256File(threePath),
    threeVersion: threePackage.version,
    networkAssetFetches: 0,
  };
  const authoritativeSnapshot = () => ({
    physicsReceipt,
    compiledSourceHashes: {
      calibration: contracts.calibration.sourceHash,
      projection: contracts.projection.sourceHash,
    },
    residentAssetHostReceipt: residentAssetContract.hostReceipt,
  });
  const authoritativeBeforeBrowserHash = digest(authoritativeSnapshot());
  const observerOffOutputDir = path.join(outputDir, 'observer-off');
  mkdirSync(observerOffOutputDir, { recursive: true });
  const observerOffPayload = createBrowserPayload(
    contracts,
    physicsReceipt,
    environmentProvenance,
    residentAssetContract.browserPayload,
    {
      observerBoundaryRequired: canonicalBoundary,
      observerConsumerEnabled: false,
    },
  );
  const observerOffEnvelopeVerification =
    verifyObserverBoundaryEnvelope(observerOffPayload.observerBoundary);
  if (!observerOffEnvelopeVerification.valid) {
    throw new Error(
      'Observer-off browser envelope is invalid: '
      + observerOffEnvelopeVerification.errors.join('; '),
    );
  }
  const observerOffBuild = await buildBrowserSurface(
    observerOffOutputDir,
    holoScriptRoot,
    observerOffPayload,
  );
  const observerOffBrowser = await runBrowserWitness({
    browserPath,
    htmlPath: observerOffBuild.htmlPath,
    outputDir: observerOffOutputDir,
    timeoutMs,
    heroFrameStep: observerOffPayload.heroFrameStep,
    settledFrameStep: observerOffPayload.settledFrameStep,
  });
  const observerOffHeroState = observerOffBrowser.captures.find(
    (capture) => capture.id === 'hero-desktop',
  )?.browserState;
  const authoritativeAfterOffBrowserHash = digest(authoritativeSnapshot());
  const payload = createBrowserPayload(
    contracts,
    physicsReceipt,
    environmentProvenance,
    residentAssetContract.browserPayload,
    {
      observerBoundaryRequired: canonicalBoundary,
      observerConsumerEnabled: canonicalBoundary,
    },
  );
  const observerOnEnvelopeVerification =
    verifyObserverBoundaryEnvelope(payload.observerBoundary, {
      trustedActionBinding:
        canonicalBoundary
          ? physicsReceipt.canonicalBoundary.after.boundedRuntimeObserver
            .trustedActionBinding
          : null,
    });
  if (!observerOnEnvelopeVerification.valid) {
    throw new Error(
      'Observer-on browser envelope is invalid: '
      + observerOnEnvelopeVerification.errors.join('; '),
    );
  }
  const observerBoundaryCore = observerOnEnvelopeVerification.core;
  const build = await buildBrowserSurface(outputDir, holoScriptRoot, payload);
  const browser = await runBrowserWitness({
    browserPath,
    htmlPath: build.htmlPath,
    outputDir,
    timeoutMs,
    heroFrameStep: payload.heroFrameStep,
    settledFrameStep: payload.settledFrameStep,
    assetInspectionCapture: payload.residentAsset.inspectionCapture,
  });
  const observerOnHeroState = browser.captures.find(
    (capture) => capture.id === 'hero-desktop',
  )?.browserState;
  const authoritativeAfterOnBrowserHash = digest(authoritativeSnapshot());
  const canonicalAuthoritativeMutationDelta = [
    authoritativeAfterOffBrowserHash,
    authoritativeAfterOnBrowserHash,
  ].filter((value) => value !== authoritativeBeforeBrowserHash).length;
  const portraitCapture = browser.captures.find((capture) => capture.id === 'hero-portrait');
  const portraitUiChrome = evaluatePortraitUiChrome(portraitCapture, {
    observerPayloadExpected: canonicalBoundary,
  });
  const softwareFallback = classifySoftwareRenderer(browser.state.gl);
  const backendObserved = inferGraphicsBackend(browser.state.gl);
  const materialTruth = evaluateMaterialTruth(contracts, browser.state.materials);
  const externalNetworkRequests = browser.networkRequests.filter(
    (request) => /^https?:/i.test(request.url),
  );
  const screenshotEvidence = browser.captures.map((capture) => ({
    id: capture.id,
    view: capture.view,
    profile: capture.profile,
    path: relativeTo(root, capture.filePath),
    sha256: capture.sha256,
    bytes: capture.bytes,
    dimensions: capture.dimensions,
    camera: capture.browserState.camera,
    viewport: capture.browserState.viewport,
    uiChrome: capture.browserState.uiChrome,
    visualFrameSha256: capture.view === 'hero'
      ? capture.browserState.physics.visualFrameHash
      : null,
  }));
  const expectedCalibrationSamples = contracts.calibration.state.expectedSamples;
  const calibrationSamples = [...browser.state.calibrationSampleIds].sort();
  const assertions = {
    holoSourcesParsedAndCompiled:
      contracts.projection.meshCount === 29
      && contracts.calibration.meshCount === 10,
    sourceHashesMatchPhysicsReceipt:
      contracts.projection.sourceHash === physicsReceipt.sourceHashes.projection
      && contracts.calibration.sourceHash === physicsReceipt.sourceHashes.calibration,
    sceneIrAndAdapterAreReceipted:
      Boolean(contracts.projection.sceneIrHash)
      && Boolean(contracts.calibration.sceneIrHash)
      && Boolean(build.bundleHash),
    physicsReceiptPassed: physicsReceipt.status === 'pass',
    physicsReceiptSelfHashValid,
    fixtureBoundaryStableAcrossPhysicsWitnessWhenEnabled:
      !canonicalBoundary
      || physicsReceipt.canonicalBoundary.observedBoundaryMatch === true,
    observerPayloadEnvelopesVerified:
      observerOffEnvelopeVerification.valid === true
      && observerOnEnvelopeVerification.valid === true,
    browserConsumesCompleteBoundedRuntimeBoundaryWhenEnabled:
      !canonicalBoundary
      || (
        observerBoundaryCore.available
        && browser.state.observerBoundary.available
        && browser.state.observerBoundary.consumerEnabled === true
        && browser.state.observerBoundary.projectionToggleExecuted === true
        && canonicalJson(browser.state.observerBoundary.canonicalFields)
          === canonicalJson(observerBoundaryCore.canonicalFields)
        && canonicalJson(browser.state.observerBoundary.requiredFields)
          === canonicalJson(REQUIRED_OBSERVER_BOUNDARY_FIELDS)
        && browser.state.observerBoundary.consumerAcknowledgement.status
          === 'pass'
        && browser.state.observerBoundary.consumerAcknowledgement.matches
          === true
        && browser.state.observerBoundary.consumerAcknowledgement
          .computedPayloadDigest === payload.observerBoundary.payloadDigest
      ),
    browserObserverConsumerToggleExecuted:
      !canonicalBoundary
      || (
        observerOffBrowser.state.observerBoundary.consumerEnabled === false
        && observerOffBrowser.state.observerBoundary.available === false
        && observerOffBrowser.state.observerBoundary.consumerAcknowledgement
          .status === 'withheld'
        && observerOffBrowser.state.observerBoundary.consumerAcknowledgement
          .computedPayloadDigest === null
        && browser.state.observerBoundary.consumerEnabled === true
        && browser.state.observerBoundary.consumerAcknowledgement.status
          === 'pass'
      ),
    observerOffPresentationFailsDark:
      observerOffHeroState?.observerPresentation?.verified === false
      && /withheld/i.test(
        observerOffHeroState?.observerPresentation?.subtitle || '',
      )
      && !/one verified water contribution|verified v4 receipts/i.test(
        canonicalJson(observerOffHeroState?.observerPresentation || {}),
      ),
    observerOnPresentationRequiresAcknowledgement:
      !canonicalBoundary
      || (
        observerOnHeroState?.observerPresentation?.verified === true
        && /one verified water contribution/i.test(
          observerOnHeroState?.observerPresentation?.subtitle || '',
        )
        && /verified v4 receipts/i.test(
          observerOnHeroState?.observerPresentation?.truthChip || '',
        )
      ),
    canonicalAuthoritativeMutationDeltaZero:
      canonicalAuthoritativeMutationDelta === 0,
    residentAssetHostValidationPassed:
      residentAssetContract.hostReceipt.status
        === 'host_validated_neutral_shadow_candidate'
      && residentAssetContract.hostReceipt.host.sha256
        === residentAssetContract.browserPayload.expectedSha256
      && residentAssetContract.hostReceipt.host.byteSize
        === residentAssetContract.browserPayload.expectedByteSize,
    residentAssetSovereignSourceValidationPassed:
      residentAssetContract.hostReceipt.sovereignSource.status
        === 'host_validated_sovereign_holoscript_source'
      && residentAssetContract.hostReceipt.sovereignSource.path
        === RESIDENT_ASSET_SOURCE
      && residentAssetContract.hostReceipt.sovereignSource.sha256
        === residentAssetContract.hostReceipt.manifest.sourceSha256
      && residentAssetContract.hostReceipt.sovereignSource.repositoryContained
        === true
      && residentAssetContract.hostReceipt.sovereignSource.symlinkContained
        === true,
    residentAssetBrowserHashesMatchHost:
      browser.state.residentAssetPresentation.browserSha256
        === residentAssetContract.hostReceipt.host.sha256
      && observerOffBrowser.state.residentAssetPresentation.browserSha256
        === residentAssetContract.hostReceipt.host.sha256
      && browser.state.residentAssetPresentation.browserByteSize
        === residentAssetContract.hostReceipt.host.byteSize
      && observerOffBrowser.state.residentAssetPresentation.browserByteSize
        === residentAssetContract.hostReceipt.host.byteSize,
    residentAssetRuntimeCountsMatchManifest:
      canonicalJson(browser.state.residentAssetPresentation.runtimeCounts)
        === canonicalJson(
          residentAssetContract.hostReceipt.host.runtimeExpectedCounts,
        )
      && canonicalJson(
        observerOffBrowser.state.residentAssetPresentation.runtimeCounts,
      ) === canonicalJson(
        residentAssetContract.hostReceipt.host.runtimeExpectedCounts,
      )
      && browser.state.residentAssetPresentation.runtimeMeshCount
        === residentAssetContract.hostReceipt.host.definitionCounts
          .attachedMeshNodes,
    residentAssetGroundingAndShadowsPassed:
      browser.state.residentAssetPresentation.grounding.passed === true
      && browser.state.residentAssetPresentation.shadows.passed === true
      && observerOffBrowser.state.residentAssetPresentation.grounding.passed
        === true
      && observerOffBrowser.state.residentAssetPresentation.shadows.passed
        === true,
    residentAssetReplacesOnlySeat01ProxyAfterValidation:
      browser.state.residentAssetPresentation.proxy.target
        === 'ObserverResident01'
      && browser.state.residentAssetPresentation.proxy.visibleBefore === true
      && browser.state.residentAssetPresentation.proxy.visibleAfter === false
      && browser.state.residentAssetPresentation.proxy.totalCapsules === 6
      && browser.state.residentAssetPresentation.proxy.visibleCapsules.length === 5
      && observerOffBrowser.state.residentAssetPresentation.proxy.visibleAfter
        === false
      && observerOffBrowser.state.residentAssetPresentation.proxy.visibleCapsules
        .length === 5,
    residentAssetHasNoDependentNetworkRequests:
      browser.state.residentAssetPresentation.assetNetworkRequests === 0
      && observerOffBrowser.state.residentAssetPresentation.assetNetworkRequests
        === 0
      && browser.state.residentAssetPresentation.dependentResourceUris.length
        === 0
      && observerOffBrowser.state.residentAssetPresentation
        .dependentResourceUris.length === 0,
    residentAssetRemainsNeutralAndObserverOnly:
      browser.state.residentAssetPresentation.presentationProfile
        === 'research_live_blinded'
      && browser.state.residentAssetPresentation.familyIdentityPresent === false
      && browser.state.residentAssetPresentation.providerIdentityPresent === false
      && browser.state.residentAssetPresentation.publicEmbodimentOverlayLoaded
        === false
      && browser.state.residentAssetPresentation.worldMutationAuthority === false,
    receiptDrivenLivingCommonsRendered:
      !canonicalBoundary
      || (
        observerOffBrowser.state.livingCommonsPresentation.consumerEnabled
          === false
        && observerOffBrowser.state.livingCommonsPresentation.objects.length === 4
        && observerOffBrowser.state.livingCommonsPresentation.objects.every(
          (entry) => entry.visible === false,
        )
        && browser.state.livingCommonsPresentation.consumerEnabled === true
        && browser.state.livingCommonsPresentation.objects.length === 4
        && browser.state.livingCommonsPresentation.objects.every(
          (entry) => entry.visible === true,
        )
        && canonicalJson(
          browser.state.livingCommonsPresentation.referencedActionReceipts,
        ) === canonicalJson([
          observerBoundaryCore.livingCommons.admittedAction.entryHash,
          observerBoundaryCore.livingCommons.blockedAction.entryHash,
        ].sort())
      ),
    physicsFramesBoundToBothTokens:
      browser.state.physics.framesAvailable === physicsReceipt.physics.fixedSteps
      && canonicalJson(browser.state.physics.boundBodyIds)
        === canonicalJson([
          'admitted-catch-floor',
          'blocked-catch-floor',
          'token-mv-p10-admitted-001',
          'token-mv-p10-blocked-001',
        ]),
    physicsFrameTraceBound:
      browser.state.physics.frameTraceHash
        === physicsReceipt.physics.firstRun.digests.frameTrace
      && Object.values(payload.physics.visualFrameHashes)
        .includes(browser.state.physics.visualFrameHash)
      && browser.captures
        .filter((capture) => capture.view === 'hero')
        .every((capture) => (
          capture.browserState.physics.visualFrameHash
            === payload.physics.visualFrameHashes[
              capture.browserState.physics.visualFrameStep
            ]
        )),
    actualWebgl2Context:
      browser.state.gl.contextType === 'webgl2'
      && /WebGL 2\.0/i.test(browser.state.gl.version),
    unmaskedRendererObserved: Boolean(browser.state.gl.unmaskedRenderer),
    noKnownSoftwareFallback: softwareFallback.detected === false,
    srgbOutputApplied:
      browser.state.renderer.outputColorSpace === 'srgb'
      && /srgb/i.test(browser.state.renderer.workingColorSpace),
    acesToneMappingApplied:
      browser.state.renderer.toneMapping === 'ACESFilmicToneMapping'
      && browser.state.renderer.toneMappingExposure
        === contracts.calibration.metadata.exposureTarget,
    pcfSoftShadowsApplied:
      browser.state.renderer.shadowMapEnabled === true
      && browser.state.renderer.shadowMapType === 'PCFSoftShadowMap'
      && browser.state.scene.hero.shadowCasters > 0
      && browser.state.scene.hero.shadowReceivers > 0
      && browser.state.scene.hero.shadowMapsAllocated > 0,
    localProceduralEnvironmentApplied:
      browser.state.environment.hdri === false
      && browser.state.environment.pmremGenerated === true
      && browser.state.environment.localModuleSha256
        === environmentProvenance.roomEnvironmentModuleSha256,
    calibrationSamplesComplete:
      canonicalJson(calibrationSamples)
        === canonicalJson([...expectedCalibrationSamples].sort()),
    effectiveMaterialsRecorded:
      browser.state.materials.length
        === contracts.projection.meshCount + contracts.calibration.meshCount
      && browser.state.materials.every((entry) => entry.effective.type === 'MeshPhysicalMaterial'),
    sourceMaterialsMatchEffective:
      materialTruth.status === 'pass'
      && materialTruth.expectedMeshCount
        === contracts.projection.meshCount + contracts.calibration.meshCount
      && materialTruth.observedMaterialCount === materialTruth.expectedMeshCount,
    frameCadencePercentilesRecorded:
      browser.state.timings.frameCadence.samples >= 170
      && Number.isFinite(browser.state.timings.frameCadence.p95Ms)
      && Number.isFinite(browser.state.timings.frameCadence.p99Ms),
    renderSubmitPercentilesRecorded:
      browser.state.timings.cpuRenderSubmit.samples >= 170
      && Number.isFinite(browser.state.timings.cpuRenderSubmit.p50Ms)
      && Number.isFinite(browser.state.timings.cpuRenderSubmit.p95Ms),
    exactDesktopAndPortraitCaptures:
      screenshotEvidence.some((capture) => (
        capture.id === 'hero-desktop'
        && capture.dimensions.width === 1600
        && capture.dimensions.height === 900
      ))
      && screenshotEvidence.some((capture) => (
        capture.id === 'hero-portrait'
        && capture.dimensions.width === 390
        && capture.dimensions.height === 844
      )),
    portraitUiChromeComplete: portraitUiChrome.status === 'pass',
    calibrationCapturePresent:
      screenshotEvidence.some((capture) => (
        capture.id === 'calibration-desktop'
        && capture.dimensions.width === 1600
        && capture.dimensions.height === 900
      )),
    settledContactCapturePresent:
      screenshotEvidence.some((capture) => (
        capture.id === 'hero-settled'
        && capture.dimensions.width === 1600
        && capture.dimensions.height === 900
        && capture.visualFrameSha256
          === payload.physics.visualFrameHashes[payload.settledFrameStep]
      )),
    residentAssetCloseupCapturePresent:
      screenshotEvidence.some((capture) => (
        capture.id === 'resident-asset-closeup'
        && capture.dimensions.width
          === residentAssetContract.browserPayload.inspectionCapture.width
        && capture.dimensions.height
          === residentAssetContract.browserPayload.inspectionCapture.height
      )),
    screenshotsContainPixels:
      screenshotEvidence.every((capture) => capture.bytes > 25_000),
    noExternalNetworkAssetsFetched:
      externalNetworkRequests.length === 0
      && observerOffBrowser.networkRequests.every(
        (request) => !/^https?:/i.test(request.url),
      ),
    browserConsoleHasNoErrors:
      browser.exceptions.length === 0
      && browser.consoleMessages.every((message) => message.level !== 'error')
      && observerOffBrowser.exceptions.length === 0
      && observerOffBrowser.consoleMessages.every(
        (message) => message.level !== 'error',
      ),
  };
  const receiptCore = {
    schema: SCHEMA,
    source: {
      parser: 'HoloCompositionParser',
      compiler: 'SceneIRCompiler',
      projection: {
        path: contracts.projection.relativePath,
        sha256: contracts.projection.sourceHash,
        sceneIrSha256: contracts.projection.sceneIrHash,
        meshCount: contracts.projection.meshCount,
        lightCount: contracts.projection.lightCount,
      },
      calibration: {
        path: contracts.calibration.relativePath,
        sha256: contracts.calibration.sourceHash,
        sceneIrSha256: contracts.calibration.sceneIrHash,
        meshCount: contracts.calibration.meshCount,
        lightCount: contracts.calibration.lightCount,
      },
      residentAssetManifest: {
        path: RESIDENT_ASSET_MANIFEST_SOURCE,
        sha256:
          residentAssetContract.hostReceipt.manifest.manifestSourceSha256,
        parser: 'HoloCompositionParser',
      },
      residentAssetSovereignSource: {
        path: residentAssetContract.hostReceipt.sovereignSource.path,
        sha256: residentAssetContract.hostReceipt.sovereignSource.sha256,
        byteSize: residentAssetContract.hostReceipt.sovereignSource.byteSize,
        custody: 'repository_contained_hash_verified_holoscript_source',
      },
      observerPolicy: {
        path: OBSERVER_POLICY_SOURCE,
        sha256: physicsReceipt.sourceHashes.policy,
        parser: physicsReceipt.policy.parser,
        browserRenderEvidenceEnforcement:
          'source_hash_bound_via_physics_receipt_and_browser_payload_sha256_acknowledged_template_fields_not_exhaustively_validated',
      },
      sourceSemanticsRewritten: false,
      presentationAdapterOwns: [
        'Three object construction from SceneIR',
        'camera application from parsed HoloScript state',
        'procedural local environment and PMREM',
        'source-declared faceted token geometry',
        'decorative chute transparency',
        'sealed-physics trajectory visualization',
        'source-declared receipt binding to verified Living Commons presentation',
        'observer-only HTML evidence chrome',
      ],
    },
    physics: {
      receipt: relativeTo(root, physicsOutput),
      receiptHash: physicsReceipt.receipt.receiptHash,
      physicsStateHash: physicsReceipt.physics.firstRun.physicsStateHash,
      replayRoots: physicsReceipt.physics.replayRoots,
      frameTraceSha256: physicsReceipt.physics.firstRun.digests.frameTrace,
      visualFrameSha256: payload.physics.visualFrameHashes[payload.heroFrameStep],
      settledFrameSha256: payload.physics.visualFrameHashes[payload.settledFrameStep],
      visualFrameStep: payload.heroFrameStep,
      colliderDisclosure: 'faceted visual meshes bound to sphere colliders',
      canonicalBoundary: physicsReceipt.canonicalBoundary,
    },
    residentAsset: {
      schema: RESIDENT_ASSET_SCHEMA,
      host: residentAssetContract.hostReceipt,
      observerOffBrowser:
        observerOffBrowser.state.residentAssetPresentation,
      observerOnBrowser: browser.state.residentAssetPresentation,
      authoritativeMutationDelta: canonicalAuthoritativeMutationDelta,
      materialCatalogIsolation: {
        sourceMaterialCount: browser.state.materials.length,
        residentRuntimeMaterialCount:
          browser.state.residentAssetPresentation.runtimeCounts.materials,
        residentMaterialsIncludedInSourceMaterialTruth: false,
      },
      claim:
        'one neutral Seat 01 LOD0 embedded GLB loader candidate attached in observer shadow mode after host/browser verification; not a complete Stormglass resident kit or a family mantle',
    },
    observerBoundary: {
      off: {
        payload: observerOffPayload.observerBoundary,
        browserObserved: observerOffBrowser.state.observerBoundary,
        heroPresentation: observerOffHeroState.observerPresentation,
        bundleSha256: observerOffBuild.bundleHash,
      },
      on: {
        payload: payload.observerBoundary,
        browserObserved: browser.state.observerBoundary,
        heroPresentation: observerOnHeroState.observerPresentation,
        bundleSha256: build.bundleHash,
      },
      consumerExecuted:
        canonicalBoundary
        && browser.state.observerBoundary.consumerAcknowledgement.matches === true,
      isolatedProjectionToggleExecuted:
        canonicalBoundary
        && assertions.browserObserverConsumerToggleExecuted,
      canonicalAuthoritativeMutationDelta,
      authoritativeHashes: {
        beforeBrowser: authoritativeBeforeBrowserHash,
        afterOffBrowser: authoritativeAfterOffBrowserHash,
        afterOnBrowser: authoritativeAfterOnBrowserHash,
      },
      claim:
        canonicalBoundary
          ? 'browser off/on consumption of one verified bounded 12-object Phase 0B V4 canonical scene payload; the complete host physics receipt and compiled source hashes remained unchanged; no full 12-object lifecycle claim'
          : 'observer browser consumer toggle not evaluated because the canonical boundary was explicitly skipped',
    },
    renderer: {
      route: 'HoloScript sources -> HoloCompositionParser -> SceneIRCompiler -> dedicated HoloLand Three/WebGL adapter',
      existingReactThreeAdapterUsed: false,
      threeVersion: environmentProvenance.threeVersion,
      threeModuleSha256: environmentProvenance.threeModuleSha256,
      environment: {
        ...environmentProvenance,
        pmremGenerated: browser.state.environment.pmremGenerated,
      },
      effective: browser.state.renderer,
      materials: browser.state.materials,
      materialTruth,
      scene: browser.state.scene,
      residentAssetPresentation: browser.state.residentAssetPresentation,
      livingCommonsPresentation: browser.state.livingCommonsPresentation,
      portraitUiChrome,
      adapterMappings: browser.state.adapterMappings,
      generatedSurface: {
        html: relativeTo(root, build.htmlPath),
        htmlSha256: build.htmlHash,
        bundle: relativeTo(root, build.bundlePath),
        bundleSha256: build.bundleHash,
        appSourceSha256: build.appSourceHash,
      },
    },
    browser: {
      executable: normalizePath(browserPath),
      product: browser.version.product,
      userAgent: browser.version.userAgent,
      protocolVersion: browser.version.protocolVersion,
      jsVersion: browser.version.jsVersion,
      launchFlags: browser.launchFlags,
      gl: browser.state.gl,
      backendObserved,
      softwareFallback,
      timings: browser.state.timings,
      consoleMessages: browser.consoleMessages,
      exceptions: browser.exceptions,
      networkRequests: browser.networkRequests,
      externalNetworkRequests,
    },
    screenshots: screenshotEvidence,
    assertions,
    toolchain: {
      nodeVersion: process.version,
      holoScriptRoot: relativeTo(root, holoScriptRoot),
      holoScriptCoreSha256: contracts.coreHash,
      esbuildSha256: build.esbuildHash,
      gltfLoaderSha256: sha256File(gltfLoaderPath),
      checkerSha256: sha256File(SCRIPT_PATH),
    },
    claimBoundary: {
      observed: [
        'local HoloScript .holo sources parsed and compiled to SceneIR',
        'sealed HoloScript CPU physics frames projected into faceted visual tokens',
        ...(canonicalBoundary
          ? [
              'one verified bounded 12-object Phase 0B V4 canonical scene payload withheld from the observer-off browser and SHA-256 acknowledged before receipt-driven rendering by the observer-on browser',
              'four source-declared Living Commons cues rendered only from the acknowledged canonical payload while the complete host physics receipt remained unchanged',
            ]
          : []),
        'one locally custodied neutral Seat 01 LOD0 GLB with SHA-256 recomputed on the host and in the browser, parsed from an embedded ArrayBuffer with no dependent asset request, shadow-attached, grounded, and admitted before its capsule proxy was hidden',
        `WebGL2 context reporting ${backendObserved} with no recognized software-renderer indicator`,
        'source-to-effective Three MeshPhysicalMaterial values with explicitly disclosed presentation-only chute overrides, sRGB output, ACES filmic tone mapping, PCF soft shadows, and a local procedural RoomEnvironment/PMREM',
        'desktop, portrait, and calibration screenshots with frame-cadence and CPU render-submit percentiles',
      ],
      notObserved: [
        ...(canonicalBoundary
          ? []
          : ['browser observer projection off/on consumer toggle']),
        'field-by-field enforcement of the declarative BrowserRenderEvidence template',
        'full canonical 12-object observer projection lifecycle',
        'HDRI asset use',
        'WebGPU rendering',
        'native HoloLand BrowserRuntime or React Three adapter execution',
        'a complete three-LOD resident kit, authored animation set, detachable family mantle, or public model-family binding',
        'ray tracing, path tracing, global illumination, or photorealism',
        'physically accurate materials, fluids, friction, stacking, or continuous collision detection',
        'cross-hardware deterministic pixels or physics',
        'headset performance',
      ],
      allowedPhrase:
        'HoloScript-authored Model Village rendered through a receipted HoloLand Three/WebGL2 witness with deterministic local CPU sphere-collider replay and one verified neutral Seat 01 LOD0 GLB shadow candidate.',
    },
  };
  const status = allTrue(assertions) ? 'pass' : 'fail';
  const receipt = {
    ...receiptCore,
    status,
    generatedAt: new Date().toISOString(),
    receipt: {
      receiptHash: digest(receiptCore),
      output: relativeTo(root, path.join(outputDir, 'rendering-witness.json')),
      providerCallsMade: 0,
      networkAssetsFetched: externalNetworkRequests.length,
    },
  };
  const receiptPath = path.join(outputDir, 'rendering-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (status !== 'pass') {
    const failures = Object.entries(assertions)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    throw new Error(
      `Model Village rendering witness failed: ${failures.join(', ')}. Receipt: ${receiptPath}`,
    );
  }
  return {
    receipt,
    receiptPath,
    screenshots: browser.captures.map((capture) => capture.filePath),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs();
    const { receipt, receiptPath } = await runRenderingGate(args);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      process.stdout.write(
        [
          '[hololand-model-village-rendering] ok',
          `receipt: ${receiptPath}`,
          `backend: ${receipt.browser.gl.unmaskedRenderer || receipt.browser.gl.maskedRenderer}`,
          `frame p95: ${receipt.browser.timings.frameCadence.p95Ms.toFixed(2)} ms`,
          `render-submit p95: ${receipt.browser.timings.cpuRenderSubmit.p95Ms.toFixed(2)} ms`,
          `claim: ${receipt.claimBoundary.allowedPhrase}`,
        ].join('\n') + '\n',
      );
    }
  } catch (error) {
    process.stderr.write(`[hololand-model-village-rendering] failed\n${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
