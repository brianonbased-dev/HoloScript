/**
 * renderer-conformance — FIRST cross-package consumer of
 * `holoscript.native-renderer-contract.v1` (packages/runtime/src/native-renderer-contract.ts).
 *
 * W.830b ruled the engine unifies behind the native renderer contract, but the
 * contract had ZERO consumers (dark-holon pattern: built beside a compile-to-R3F
 * path that keeps working). This runner makes the contract consumed and makes
 * bridge-only capability growth impossible to land silently:
 *
 *   1. Parses the contract's golden `.holo` scenes (fixtures/native-renderer/)
 *      with the real @holoscript/core parser and drives them through BOTH
 *      engine backends — WebGPUBackendRenderer (native, three-free, the
 *      DEFAULT_BACKEND) and ThreeJSRenderer (bridge) — via the shared
 *      RuntimeRenderer seam.
 *   2. Derives a capability-coverage matrix against the contract's declared
 *      capabilities from auditable SOURCE EVIDENCE (regex probes over each
 *      backend's implementation file, matches recorded with line numbers) and
 *      validates both backends with the contract's own
 *      `validateNativeRendererBackendContract`.
 *   3. Emits a verified-view style receipt (mode + hashes + coverage). Headless
 *      Node has no GPUDevice, so the runner degrades HONESTLY to structural
 *      conformance: it hashes the scene model each backend ingested and NEVER
 *      fakes a frame hash (`frame.rendered: false`, `frameHashes: null`).
 *
 * The forcing function (scripts/holo-ci/check-renderer-conformance.mjs +
 * renderer-conformance.test.ts) fails when a contract capability is implemented
 * by the threejs bridge but NOT by the native backend.
 *
 * NOTE: the contract is imported by relative source path because
 * @holoscript/engine does not (yet) depend on @holoscript/runtime — promoting
 * that to a real workspace dependency is the named follow-up. This directory is
 * excluded from the engine tsc build (see tsconfig.json / tsconfig.dts.json);
 * it runs under vitest and tsx only.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NATIVE_RENDERER_CONTRACT_VERSION,
  NATIVE_RENDERER_GOLDEN_FIXTURES,
  REQUIRED_NATIVE_RENDERER_CAPABILITIES,
  validateNativeRendererBackendContract,
  validateNativeRendererGoldenFixtures,
  type NativeRendererBackendContract,
  type NativeRendererBackendValidationResult,
  type NativeRendererGoldenCapability,
  type NativeRendererGoldenFixture,
  type NativeRendererValidationResult,
} from '../../../../runtime/src/native-renderer-contract';

import { WebGPUBackendRenderer } from '../../runtime/WebGPUBackendRenderer';
import { ThreeJSRenderer } from '../../runtime/ThreeJSRenderer';
import type {
  RenderableCamera,
  RenderableLight,
  RenderableObject,
  RendererStatistics,
  RuntimeRenderer,
} from '../../runtime/RuntimeRenderer';
import type { HoloComposition } from '@holoscript/core';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/engine/src/native-render/__conformance__ → repo root is 5 levels up. */
export const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

const NATIVE_BACKEND_SOURCE = resolve(HERE, '..', '..', 'runtime', 'WebGPUBackendRenderer.ts');
const BRIDGE_BACKEND_SOURCE = resolve(HERE, '..', '..', 'runtime', 'ThreeJSRenderer.ts');

export const DEFAULT_RECEIPT_PATH = join(
  REPO_ROOT,
  '.scratch',
  'receipts',
  'renderer-conformance.receipt.json'
);

// ---------------------------------------------------------------------------
// Structural views of @holoscript/core (acquired via dynamic import at call
// time — mirrors packages/holo-vm/src/render/render-holo.ts).
// ---------------------------------------------------------------------------

interface HoloParseResultLike {
  success: boolean;
  ast?: unknown;
  errors?: Array<{ message?: string }>;
}
type ParseHolo = (source: string, options?: unknown) => HoloParseResultLike;

interface HoloPositionLike {
  x?: number;
  y?: number;
  z?: number;
}
interface HoloObjectPropertyLike {
  key?: string;
  value?: unknown;
}
interface HoloObjectDeclLike {
  name?: string;
  position?: HoloPositionLike;
  rotation?: HoloPositionLike;
  scale?: HoloPositionLike;
  properties?: HoloObjectPropertyLike[];
  traits?: Array<{ name?: string }>;
}
interface HoloCameraLike {
  cameraType?: string;
  properties?: HoloObjectPropertyLike[];
}
interface HoloCompositionLike {
  name?: string;
  objects?: HoloObjectDeclLike[];
  camera?: HoloCameraLike;
}

// ---------------------------------------------------------------------------
// Receipt types
// ---------------------------------------------------------------------------

export type ConformanceMode = 'structural' | 'gpu-frame';

export interface OpTrace {
  op: string;
  target?: string;
  ok: boolean;
  error?: string;
}

export interface CapabilityEvidence {
  implemented: boolean;
  /** `file:line: snippet` matches that ground the verdict — auditable, never asserted. */
  evidence: string[];
}

export interface BackendSceneRun {
  backendId: string;
  ops: OpTrace[];
  statistics: RendererStatistics | null;
  /** sha256 over the canonicalized op trace + statistics this backend produced. */
  sceneGraphHash: string;
}

export interface FixtureRun {
  id: string;
  sourcePath: string;
  sourceSha256: string | null;
  parsed: boolean | null;
  parseErrors: string[];
  /** Was this fixture actually driven through the backends this run? */
  exercised: boolean;
  notExercisedReason?: string;
  /** Contract expectations that did NOT hold against the parsed source (recorded, non-fatal). */
  expectationDeltas: string[];
  /** sha256 of the source-derived scene model (identical input handed to both backends). */
  sceneModelHash: string | null;
  backends: { native: BackendSceneRun | null; bridge: BackendSceneRun | null };
}

export interface BackendReport {
  backendId: string;
  sourcePath: string;
  capabilities: Record<NativeRendererGoldenCapability, CapabilityEvidence>;
  contract: NativeRendererBackendContract;
  validation: NativeRendererBackendValidationResult;
}

export interface RendererConformanceReceipt {
  schema: 'holoscript.renderer-conformance-receipt.v1';
  contractVersion: typeof NATIVE_RENDERER_CONTRACT_VERSION;
  generatedAtIso: string;
  generator: string;
  mode: ConformanceMode;
  frame: {
    rendered: false;
    frameHashes: null;
    reason: string;
  };
  goldenSuite: NativeRendererValidationResult;
  fixtures: FixtureRun[];
  backends: { native: BackendReport; bridge: BackendReport };
  coverage: {
    requiredCapabilities: readonly NativeRendererGoldenCapability[];
    matrix: Record<NativeRendererGoldenCapability, { native: boolean; bridge: boolean }>;
    /** THE forcing list — capabilities the bridge implements that the native backend does not. */
    bridgeOnlyCapabilities: NativeRendererGoldenCapability[];
    nativeOnlyCapabilities: NativeRendererGoldenCapability[];
    missingEverywhere: NativeRendererGoldenCapability[];
  };
}

// ---------------------------------------------------------------------------
// Canonical JSON + hashing
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = canonicalize(v);
    return out;
  }
  return value;
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ---------------------------------------------------------------------------
// Capability probes — auditable source evidence, per contract capability.
// allOf = every regex must match (method-definition probes);
// anyOf = any regex match is evidence (token probes).
// ---------------------------------------------------------------------------

interface CapabilityProbe {
  allOf?: RegExp[];
  anyOf?: RegExp[];
}

const CAPABILITY_PROBES: Record<NativeRendererGoldenCapability, CapabilityProbe> = {
  scene_graph: {
    allOf: [/\baddObject\s*\(/, /\bremoveObject\s*\(/, /\bupdateObjectTransform\s*\(/],
  },
  camera: { allOf: [/\bupdateCamera\s*\(/] },
  materials: {
    anyOf: [
      /\bcreateMaterial\s*\(/,
      /\bgetOrCreateMaterial\s*\(/,
      /\bbuildRenderMaterial\s*\(/,
      /MATERIAL_PRESETS/,
    ],
  },
  input: {
    anyOf: [
      /\bpointer(?:down|up|move|enter|leave)\b/i,
      /\bkey(?:down|up)\b/i,
      /\bgamepad\b/i,
      /selectstart|selectend|squeezestart|squeezeend/i,
      /\bXRInputSource\b/,
    ],
  },
  timeline: {
    anyOf: [/\bkeyframe/i, /\btimeline\b/i, /AnimationMixer|AnimationClip|KeyframeTrack/],
  },
  asset_loading: {
    anyOf: [
      /GLTFLoader|TextureLoader|FileLoader|OBJLoader|FBXLoader|KTX2Loader/,
      /\bloadAsset\b|\bAssetPipeline\b|\bAssetStreamer\b/,
      /\.gl(?:b|tf)\b/i,
    ],
  },
  interaction: {
    anyOf: [/Raycaster|\braycast/i, /\bintersectObjects?\s*\(/, /\bhitTest\b/i, /\bstateTransition\b/],
  },
  xr_device_semantics: {
    anyOf: [
      /WebXR|XRSession|XRFrame|XRReferenceSpace/,
      /referenceSpace/i,
      /immersive-(?:vr|ar)/,
      /\bpassthrough\b/i,
      /\bhaptic/i,
    ],
  },
  state: {
    anyOf: [/StateMachine|\bstateStore\b|\bstate_machine\b/, /\bpersistence\b/i],
  },
};

function collectMatches(source: string, sourcePath: string, regex: RegExp): string[] {
  const lines = source.split(/\r?\n/);
  const matches: string[] = [];
  for (let i = 0; i < lines.length && matches.length < 3; i++) {
    if (regex.test(lines[i])) {
      matches.push(`${sourcePath}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
    }
  }
  return matches;
}

export function probeBackendCapabilities(
  sourcePath: string
): Record<NativeRendererGoldenCapability, CapabilityEvidence> {
  const source = readFileSync(sourcePath, 'utf-8');
  const relPath = sourcePath.slice(REPO_ROOT.length + 1).split('\\').join('/');
  const out = {} as Record<NativeRendererGoldenCapability, CapabilityEvidence>;

  for (const capability of REQUIRED_NATIVE_RENDERER_CAPABILITIES) {
    const probe = CAPABILITY_PROBES[capability];
    const evidence: string[] = [];
    let implemented = false;

    if (probe.allOf) {
      implemented = probe.allOf.every((r) => r.test(source));
      if (implemented) {
        for (const r of probe.allOf) evidence.push(...collectMatches(source, relPath, r));
      }
    }
    if (probe.anyOf) {
      const anyHits = probe.anyOf.filter((r) => r.test(source));
      if (anyHits.length > 0) {
        implemented = true;
        for (const r of anyHits) evidence.push(...collectMatches(source, relPath, r));
      }
    }

    out[capability] = { implemented, evidence };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scene model derivation (parsed .holo composition → RuntimeRenderer inputs)
// ---------------------------------------------------------------------------

interface SceneModel {
  compositionName: string;
  objects: RenderableObject[];
  lights: RenderableLight[];
  camera: RenderableCamera;
  assets: Array<{ id: string; kind: string; uri: string; loadPolicy: string }>;
  xrDevices: Array<{ id: string }>;
  /** contract node-type per declared object, in declaration order (root 'scene' excluded). */
  nodeTypes: string[];
  objectOrder: string[];
}

function prop(decl: HoloObjectDeclLike, key: string): unknown {
  return decl.properties?.find((p) => p.key === key)?.value;
}

function toTuple(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value;
    if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') return [x, y, z];
  }
  if (value && typeof value === 'object') {
    const v = value as HoloPositionLike;
    if (typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number') {
      return [v.x, v.y, v.z];
    }
  }
  return fallback;
}

const LIGHT_TYPES: Record<string, RenderableLight['type']> = {
  directional_light: 'directional',
  point_light: 'point',
  spot_light: 'spot',
  ambient_light: 'ambient',
  hemisphere_light: 'hemisphere',
  area_light: 'area',
};

export function deriveSceneModel(comp: HoloCompositionLike): SceneModel {
  const objects: RenderableObject[] = [];
  const lights: RenderableLight[] = [];
  const assets: SceneModel['assets'] = [];
  const xrDevices: SceneModel['xrDevices'] = [];
  const nodeTypes: string[] = [];
  const objectOrder: string[] = [];

  for (const decl of comp.objects ?? []) {
    const name = decl.name ?? '(anonymous)';
    objectOrder.push(name);
    const typeProp = typeof prop(decl, 'type') === 'string' ? (prop(decl, 'type') as string) : '';
    const geometry =
      typeof prop(decl, 'geometry') === 'string' ? (prop(decl, 'geometry') as string) : '';
    const position = toTuple(prop(decl, 'position') ?? decl.position, [0, 0, 0]);

    if (typeProp in LIGHT_TYPES) {
      nodeTypes.push('light');
      lights.push({
        id: name,
        type: LIGHT_TYPES[typeProp],
        position,
        color: typeof prop(decl, 'color') === 'string' ? (prop(decl, 'color') as string) : undefined,
        intensity:
          typeof prop(decl, 'intensity') === 'number'
            ? (prop(decl, 'intensity') as number)
            : undefined,
      });
      continue;
    }
    if (typeProp === 'asset') {
      nodeTypes.push('asset');
      assets.push({
        id: name,
        kind: typeof prop(decl, 'asset_type') === 'string' ? (prop(decl, 'asset_type') as string) : '',
        uri: typeof prop(decl, 'uri') === 'string' ? (prop(decl, 'uri') as string) : '',
        loadPolicy:
          typeof prop(decl, 'load_policy') === 'string' ? (prop(decl, 'load_policy') as string) : '',
      });
      continue;
    }
    if (typeProp === 'xr_device') {
      nodeTypes.push('xr_device');
      xrDevices.push({ id: name });
      continue;
    }

    nodeTypes.push(geometry || typeProp || 'object');
    objects.push({
      id: name,
      type: geometry || typeProp || 'box',
      position,
      rotation: toTuple(prop(decl, 'rotation') ?? decl.rotation, [0, 0, 0]),
      scale: toTuple(prop(decl, 'scale') ?? decl.scale, [1, 1, 1]),
      geometry: { type: geometry || 'box' },
      material: {
        type:
          typeof prop(decl, 'material_type') === 'string'
            ? (prop(decl, 'material_type') as string)
            : undefined,
        color: typeof prop(decl, 'color') === 'string' ? (prop(decl, 'color') as string) : undefined,
        roughness:
          typeof prop(decl, 'roughness') === 'number'
            ? (prop(decl, 'roughness') as number)
            : undefined,
        metalness:
          typeof prop(decl, 'metalness') === 'number'
            ? (prop(decl, 'metalness') as number)
            : undefined,
      },
    });
  }

  const camProps = comp.camera?.properties ?? [];
  const camProp = (key: string): unknown => camProps.find((p) => p.key === key)?.value;
  const camera: RenderableCamera = {
    position: toTuple(camProp('position'), [0, 1.6, 5]),
    target: toTuple(camProp('target'), [0, 1, 0]),
    fov: typeof camProp('fov') === 'number' ? (camProp('fov') as number) : 60,
  };

  return {
    compositionName: comp.name ?? '(unnamed)',
    objects,
    lights,
    camera,
    assets,
    xrDevices,
    nodeTypes,
    objectOrder,
  };
}

// ---------------------------------------------------------------------------
// Contract expectation checks (recorded per fixture — non-fatal deltas)
// ---------------------------------------------------------------------------

function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let i = 0;
  for (const item of haystack) {
    if (i < needle.length && item === needle[i]) i++;
  }
  return i === needle.length;
}

export function checkFixtureExpectations(
  fixture: NativeRendererGoldenFixture,
  model: SceneModel,
  source: string
): string[] {
  const deltas: string[] = [];

  const sg = fixture.sceneGraph;
  if (sg) {
    const observedTypes = new Set<string>(['scene', ...model.nodeTypes]);
    for (const required of sg.requiredNodeTypes) {
      if (!observedTypes.has(required)) {
        deltas.push(`sceneGraph: required node type '${required}' not present in parsed source`);
      }
    }
    if (!isSubsequence(sg.childOrder, model.objectOrder)) {
      deltas.push(
        `sceneGraph: childOrder [${sg.childOrder.join(', ')}] is not a subsequence of declared objects [${model.objectOrder.join(', ')}]`
      );
    }
    const observedCount = 1 + model.nodeTypes.length; // scene root + declared nodes
    if (observedCount !== sg.nodeCount) {
      deltas.push(`sceneGraph: nodeCount expected ${sg.nodeCount}, observed ${observedCount}`);
    }
    for (const trait of sg.requiredTraits) {
      if (!source.includes(trait)) {
        deltas.push(`sceneGraph: required trait '${trait}' not present in source`);
      }
    }
  }

  const cam = fixture.camera;
  if (cam) {
    const same = (a: readonly number[], b: readonly number[]): boolean =>
      a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
    if (!same(cam.position, model.camera.position)) {
      deltas.push(
        `camera: position expected [${cam.position.join(', ')}], observed [${model.camera.position.join(', ')}]`
      );
    }
    if (!same(cam.target, model.camera.target)) {
      deltas.push(
        `camera: target expected [${cam.target.join(', ')}], observed [${model.camera.target.join(', ')}]`
      );
    }
    if (cam.fovDegrees !== undefined && model.camera.fov !== cam.fovDegrees) {
      deltas.push(`camera: fov expected ${cam.fovDegrees}, observed ${model.camera.fov}`);
    }
  }

  for (const material of fixture.materials ?? []) {
    const owner = model.objects.find(
      (o) => typeof o.material?.color === 'string' && source.includes(`"${material.id}"`)
    );
    if (!owner) {
      deltas.push(`materials: no parsed object carries material '${material.id}'`);
      continue;
    }
    const declared = model.objects.find(
      (o) => (o.material?.color ?? '').toLowerCase() === (material.color ?? '').toLowerCase()
    );
    if (material.color && !declared) {
      deltas.push(`materials: '${material.id}' color ${material.color} not found on any object`);
    }
  }

  for (const asset of fixture.assets ?? []) {
    const found = model.assets.find((a) => a.id === asset.id);
    if (!found) {
      deltas.push(`assets: expected asset '${asset.id}' not declared`);
    } else if (found.uri !== asset.uri || found.kind !== asset.kind) {
      deltas.push(
        `assets: '${asset.id}' expected ${asset.kind}@${asset.uri}, observed ${found.kind}@${found.uri}`
      );
    }
  }

  if (fixture.xrDevice && model.xrDevices.length === 0) {
    deltas.push('xrDevice: contract declares XR device semantics but no xr_device node parsed');
  }

  return deltas;
}

// ---------------------------------------------------------------------------
// Backend drive (behavioral, headless-honest)
// ---------------------------------------------------------------------------

function traceOp(ops: OpTrace[], op: string, target: string | undefined, fn: () => void): void {
  try {
    fn();
    ops.push({ op, target, ok: true });
  } catch (error) {
    ops.push({ op, target, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function driveBackend(
  backendId: string,
  renderer: RuntimeRenderer,
  model: SceneModel,
  composition: HoloComposition
): BackendSceneRun {
  const ops: OpTrace[] = [];

  traceOp(ops, 'initialize', model.compositionName, () => renderer.initialize(composition));
  for (const object of model.objects) {
    traceOp(ops, 'addObject', object.id, () => renderer.addObject(object));
  }
  for (const light of model.lights) {
    traceOp(ops, 'addLight', light.id, () => renderer.addLight(light));
  }
  traceOp(ops, 'updateCamera', undefined, () => renderer.updateCamera(model.camera));
  if (model.objects.length > 0) {
    const first = model.objects[0];
    traceOp(ops, 'updateObjectTransform', first.id, () =>
      renderer.updateObjectTransform(first.id, { position: first.position })
    );
  }

  let statistics: RendererStatistics | null = null;
  traceOp(ops, 'getStatistics', undefined, () => {
    statistics = renderer.getStatistics();
  });

  if (model.objects.length > 0) {
    const last = model.objects[model.objects.length - 1];
    traceOp(ops, 'removeObject', last.id, () => renderer.removeObject(last.id));
  }
  traceOp(ops, 'dispose', undefined, () => renderer.dispose());

  return {
    backendId,
    ops,
    statistics,
    sceneGraphHash: sha256Json({ backendId, ops, statistics }),
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runRendererConformance(): Promise<RendererConformanceReceipt> {
  const core = (await import('@holoscript/core')) as unknown as { parseHolo?: ParseHolo };
  if (typeof core.parseHolo !== 'function') {
    throw new Error('renderer-conformance: @holoscript/core does not expose parseHolo');
  }
  const parseHolo = core.parseHolo;

  const goldenSuite = validateNativeRendererGoldenFixtures();
  const fixtures: FixtureRun[] = [];

  for (const fixture of NATIVE_RENDERER_GOLDEN_FIXTURES) {
    const absPath = join(REPO_ROOT, fixture.source.path);
    const run: FixtureRun = {
      id: fixture.id,
      sourcePath: fixture.source.path,
      sourceSha256: null,
      parsed: null,
      parseErrors: [],
      exercised: false,
      expectationDeltas: [],
      sceneModelHash: null,
      backends: { native: null, bridge: null },
    };
    fixtures.push(run);

    if (!existsSync(absPath)) {
      run.parseErrors.push(`golden source missing on disk: ${fixture.source.path}`);
      run.parsed = false;
      continue;
    }
    const source = readFileSync(absPath, 'utf-8');
    run.sourceSha256 = sha256Text(source);

    if (fixture.source.format !== 'holo') {
      run.notExercisedReason =
        `source format '${fixture.source.format}' is declared-only in conformance runner v1 — ` +
        'neither backend implements its capabilities at the renderer seam yet ' +
        '(see coverage.missingEverywhere); wire the .hsplus parse path when one does.';
      continue;
    }

    const parsed = parseHolo(source);
    run.parsed = parsed.success === true;
    if (!run.parsed) {
      run.parseErrors = (parsed.errors ?? []).map((e) => e.message ?? 'unknown parse error');
      continue;
    }

    const composition = parsed.ast as HoloComposition;
    const model = deriveSceneModel(parsed.ast as HoloCompositionLike);
    run.sceneModelHash = sha256Json({
      compositionName: model.compositionName,
      objects: model.objects,
      lights: model.lights,
      camera: model.camera,
      assets: model.assets,
      xrDevices: model.xrDevices,
    });
    run.expectationDeltas = checkFixtureExpectations(fixture, model, source);

    run.backends.native = driveBackend(
      'engine.webgpu-native',
      new WebGPUBackendRenderer({ debug: false }),
      model,
      composition
    );
    run.backends.bridge = driveBackend(
      'engine.threejs-bridge',
      new ThreeJSRenderer({ debug: false }),
      model,
      composition
    );
    run.exercised = true;
  }

  // Capability coverage — auditable source evidence per backend.
  const nativeCapabilities = probeBackendCapabilities(NATIVE_BACKEND_SOURCE);
  const bridgeCapabilities = probeBackendCapabilities(BRIDGE_BACKEND_SOURCE);

  const implementedList = (
    caps: Record<NativeRendererGoldenCapability, CapabilityEvidence>
  ): NativeRendererGoldenCapability[] =>
    REQUIRED_NATIVE_RENDERER_CAPABILITIES.filter((c) => caps[c].implemented);

  const exercisedFixtureIds = fixtures.filter((f) => f.exercised).map((f) => f.id);

  const nativeContract: NativeRendererBackendContract = {
    contractVersion: NATIVE_RENDERER_CONTRACT_VERSION,
    backendId: 'engine.webgpu-native',
    adapterKind: 'native-runtime-backend',
    runtimeEntryPoint: 'packages/engine/src/runtime/WebGPUBackendRenderer.ts',
    semanticsSource: 'holo-runtime',
    consumes: {
      sourceFormats: ['holo', 'hsplus', 'hs'],
      ir: 'scene-ir',
      runtime: '@holoscript/runtime',
    },
    implementsCapabilities: implementedList(nativeCapabilities),
    goldenFixtureIds: exercisedFixtureIds,
  };

  const bridgeContract: NativeRendererBackendContract = {
    contractVersion: NATIVE_RENDERER_CONTRACT_VERSION,
    backendId: 'engine.threejs-bridge',
    adapterKind: 'native-runtime-backend',
    runtimeEntryPoint: 'packages/engine/src/runtime/ThreeJSRenderer.ts',
    // Honest: the bridge renders through three.js scene semantics, not the Holo
    // runtime — the contract validator flags this, and the receipt records it.
    semanticsSource: 'target-local-three',
    consumes: {
      sourceFormats: ['holo'],
      ir: 'scene-ir',
      runtime: '@holoscript/runtime',
    },
    implementsCapabilities: implementedList(bridgeCapabilities),
    goldenFixtureIds: exercisedFixtureIds,
  };

  const matrix = {} as Record<NativeRendererGoldenCapability, { native: boolean; bridge: boolean }>;
  const bridgeOnlyCapabilities: NativeRendererGoldenCapability[] = [];
  const nativeOnlyCapabilities: NativeRendererGoldenCapability[] = [];
  const missingEverywhere: NativeRendererGoldenCapability[] = [];
  for (const capability of REQUIRED_NATIVE_RENDERER_CAPABILITIES) {
    const native = nativeCapabilities[capability].implemented;
    const bridge = bridgeCapabilities[capability].implemented;
    matrix[capability] = { native, bridge };
    if (bridge && !native) bridgeOnlyCapabilities.push(capability);
    if (native && !bridge) nativeOnlyCapabilities.push(capability);
    if (!native && !bridge) missingEverywhere.push(capability);
  }

  const relNative = NATIVE_BACKEND_SOURCE.slice(REPO_ROOT.length + 1).split('\\').join('/');
  const relBridge = BRIDGE_BACKEND_SOURCE.slice(REPO_ROOT.length + 1).split('\\').join('/');

  return {
    schema: 'holoscript.renderer-conformance-receipt.v1',
    contractVersion: NATIVE_RENDERER_CONTRACT_VERSION,
    generatedAtIso: new Date().toISOString(),
    generator: 'packages/engine/src/native-render/__conformance__/renderer-conformance.ts',
    mode: 'structural',
    frame: {
      rendered: false,
      frameHashes: null,
      reason:
        'no GPUDevice in the Node test context — structural conformance only. ' +
        'A frame hash is only ever emitted from a real render+readback (gpu-verify.ts); ' +
        'this runner NEVER fabricates one.',
    },
    goldenSuite,
    fixtures,
    backends: {
      native: {
        backendId: nativeContract.backendId,
        sourcePath: relNative,
        capabilities: nativeCapabilities,
        contract: nativeContract,
        validation: validateNativeRendererBackendContract(nativeContract),
      },
      bridge: {
        backendId: bridgeContract.backendId,
        sourcePath: relBridge,
        capabilities: bridgeCapabilities,
        contract: bridgeContract,
        validation: validateNativeRendererBackendContract(bridgeContract),
      },
    },
    coverage: {
      requiredCapabilities: REQUIRED_NATIVE_RENDERER_CAPABILITIES,
      matrix,
      bridgeOnlyCapabilities,
      nativeOnlyCapabilities,
      missingEverywhere,
    },
  };
}

export function writeRendererConformanceReceipt(
  receipt: RendererConformanceReceipt,
  outPath: string = DEFAULT_RECEIPT_PATH
): string {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  return outPath;
}
