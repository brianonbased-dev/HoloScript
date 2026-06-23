'use client';

/**
 * ImmersiveViewer — WebXR-capable three.js preview for /shared/[id].
 *
 * Parses the scene with @holoscript/core's HoloCompositionParser, renders a
 * 2D preview, and exposes an "Enter VR" button that starts an immersive-vr
 * session reusing the same scene.
 *
 * Auto-presents the "Enter VR" CTA on Meta Browser (Oculus Browser UA) so
 * opening /w/<id> from a Quest takes the user into VR with one tap.
 *
 * Intentionally narrow: handles primitives (cube, sphere, cylinder, cone,
 * torus, plane, capsule) with position + scale + color. Traits are displayed
 * in the summary but not animated in v0. Anything unsupported falls back
 * gracefully and the page still renders the source code.
 *
 * See:
 *  - research/quest3-iphone-moment/c-studio-share-path-map.md (G2)
 *  - packages/studio/src/app/shared/[id]/page.tsx (server parent)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HoloCompositionParser, SceneIRCompiler, type R3FNode } from '@holoscript/core';
import { XRLocomotionController, AgentAvatarTracker } from '@holoscript/xr-embodiment';

interface ImmersiveViewerProps {
  /** Inline scene source. Optional when `scene` is given (loaded from the library). */
  code?: string;
  /** Native example to load by name from the examples library (via /api/examples/<name>),
   *  so a compiler-generated .holo PAGE can mount this viewer with just a scene id.
   *  (`sceneName`, not `scene` — the latter is a reserved .holo keyword.) */
  sceneName?: string;
  /** Scene name — used as the share title when Publish runs. */
  name?: string;
  /** Entity id to embody as a tracked AgentAvatar (its world-state drives a body in
   *  the scene). Lets a native .holo page declare the embodied agent (e.g. Brittney)
   *  without a URL param; falls back to ?agent= in the URL when unset. */
  agentId?: string;
}

type ParsedObject = {
  name: string;
  type: string;
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  traits: string[];
};

/** Minimal AST -> ParsedObject extraction for the viewer. */
function extractObjects(source: string): {
  objects: ParsedObject[];
  parseOk: boolean;
  error?: string;
  ast?: ReturnType<HoloCompositionParser['parse']>['ast'];
} {
  try {
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);
    if (!result.success || !result.ast) {
      return {
        objects: [],
        parseOk: false,
        error: result.errors?.[0]?.message ?? 'parse failed',
      };
    }

    const rawObjects = (result.ast as unknown as { objects?: unknown[] }).objects ?? [];
    const out: ParsedObject[] = [];
    for (const raw of rawObjects) {
      const o = raw as {
        name?: string;
        properties?: Array<{ key: string; value: unknown }>;
        traits?: Array<{ name?: string }>;
      };
      const props = new Map<string, unknown>();
      for (const p of o.properties ?? []) props.set(p.key, p.value);

      const type = String(props.get('type') ?? 'sphere').toLowerCase();
      const pos = props.get('position');
      const scale = props.get('scale');
      const color = String(props.get('color') ?? '#ffffff');
      const position: [number, number, number] =
        Array.isArray(pos) && pos.length >= 3
          ? [Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0]
          : [0, 1, 0];
      const scl: [number, number, number] =
        Array.isArray(scale) && scale.length >= 3
          ? [Number(scale[0]) || 1, Number(scale[1]) || 1, Number(scale[2]) || 1]
          : [1, 1, 1];

      out.push({
        name: String(o.name ?? 'object'),
        type,
        position,
        scale: scl,
        color,
        traits: (o.traits ?? []).map((t) => String(t.name ?? 'unknown')),
      });
    }
    return { objects: out, parseOk: true, ast: result.ast };
  } catch (err) {
    return {
      objects: [],
      parseOk: false,
      error: err instanceof Error ? err.message : 'unknown parse error',
    };
  }
}

function makeMesh(obj: ParsedObject): THREE.Mesh {
  let geom: THREE.BufferGeometry;
  const [sx, sy, sz] = obj.scale;
  switch (obj.type) {
    case 'cube':
    case 'box':
      geom = new THREE.BoxGeometry(sx, sy, sz);
      break;
    case 'cylinder':
      geom = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 32);
      break;
    case 'cone':
      geom = new THREE.ConeGeometry(sx / 2, sy, 32);
      break;
    case 'torus':
      geom = new THREE.TorusGeometry(sx / 2, sx / 6, 16, 48);
      break;
    case 'plane':
      geom = new THREE.PlaneGeometry(sx, sz);
      break;
    case 'capsule':
      geom = new THREE.CapsuleGeometry(sx / 2, sy, 8, 16);
      break;
    default:
      geom = new THREE.SphereGeometry(sx / 2, 32, 32);
  }
  const material = new THREE.MeshStandardMaterial({
    color: obj.color,
    roughness: 0.5,
    // A floor must be visible from above AND below (the user spawns above it).
    side: obj.type === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
  // A `plane` is a ground/floor. THREE.PlaneGeometry is born VERTICAL (lying in
  // the XY plane, normal +z), so without this it stands up as a wall and occludes
  // the whole scene behind it — the "I only see a purple cube" bug. Lay it flat
  // into the XZ plane so it reads as a floor.
  if (obj.type === 'plane') mesh.rotation.x = -Math.PI / 2;
  mesh.name = obj.name;
  return mesh;
}

// =============================================================================
// Canonical .holo renderer — walks the resolved R3FCompiler tree into raw
// three.js so the immersive viewer faithfully renders the native example
// library (geometry, PBR material, lights, nesting), not just the minimal
// type/color dialect. The hard resolution (templates, material presets, lights,
// environment) is done by @holoscript/core's R3FCompiler; this only ports the
// thin render switch (cf. r3f-renderer MeshNode) to raw three.js for WebXR.
// =============================================================================

const numProp = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Unit geometry for an hsType. Non-plane primitives are unit-sized (the builder
 *  applies scale as a transform); a plane bakes its X/Z extent from explicit
 *  width/height or args:[w,h], falling back to scale.x/scale.z (the builder lays
 *  it flat and does not re-apply scale). */
function geometryForHsType(
  hsType: string,
  scale: number[] | null,
  props: Record<string, unknown> = {}
): THREE.BufferGeometry {
  const args = Array.isArray(props.args) ? (props.args as unknown[]) : null;
  switch (hsType) {
    case 'sphere':
    case 'orb':
      return new THREE.SphereGeometry(0.5, 32, 32);
    case 'cube':
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, numProp(props.radialSegments, 32));
    case 'pyramid':
      return new THREE.ConeGeometry(0.5, 1, 4);
    case 'circle':
    case 'disc':
      return new THREE.CircleGeometry(0.5, 32);
    case 'torus':
      return new THREE.TorusGeometry(0.5, 0.15, 16, 32);
    case 'ring':
      return new THREE.RingGeometry(0.3, 0.5, 32);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.3, 0.5, 4, 16);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(0.5);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(0.5);
    case 'octahedron':
      return new THREE.OctahedronGeometry(0.5);
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(0.5);
    case 'plane': {
      // The compiler emits planes via explicit width/height or args:[w,h] with no
      // scale (e.g. the [200,200] ground, the lotus water pond); other scenes (the
      // warehouse floor) size via scale.x/scale.z. Honor all three so a compiler-
      // authored ground isn't silently rendered 1×1.
      const w = numProp(
        props.width ?? (args ? args[0] : undefined) ?? (scale ? scale[0] : undefined),
        1
      );
      const h = numProp(
        props.height ?? (args ? args[1] : undefined) ?? (scale ? scale[2] : undefined),
        1
      );
      return new THREE.PlaneGeometry(w, h);
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

/**
 * Material from a compiled node's props (color + PBR materialProps).
 *
 * Returns a MeshStandardMaterial by default, but upgrades to MeshPhysicalMaterial
 * when the node declares advanced PBR channels (transmission/ior/clearcoat/
 * thickness/sheen/iridescence) — so glass, lacquer, and fabric read realistically
 * once an environment map is present. The standard channels (color/roughness/
 * metalness/emissive/opacity/wireframe) apply to both, since MeshPhysicalMaterial
 * extends MeshStandardMaterial.
 */
function materialFromProps(props: Record<string, unknown>): THREE.MeshStandardMaterial {
  const mp =
    props.materialProps && typeof props.materialProps === 'object'
      ? (props.materialProps as Record<string, unknown>)
      : {};
  // materialProps take precedence over flattened props (matches getMaterialProps).
  const pick = (key: string): unknown => (mp[key] !== undefined ? mp[key] : props[key]);
  const num = (key: string): number | undefined => {
    const v = pick(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };

  // Detect the physical-only channels. If any is present, build a
  // MeshPhysicalMaterial; otherwise stay on the cheaper MeshStandardMaterial.
  const transmission = num('transmission');
  const ior = num('ior');
  const clearcoat = num('clearcoat');
  const clearcoatRoughness = num('clearcoatRoughness');
  const thickness = num('thickness');
  const sheen = num('sheen');
  const sheenRoughness = num('sheenRoughness');
  const iridescence = num('iridescence');
  const iridescenceIOR = num('iridescenceIOR');
  const specularIntensity = num('specularIntensity');
  const isPhysical =
    transmission !== undefined ||
    ior !== undefined ||
    clearcoat !== undefined ||
    thickness !== undefined ||
    sheen !== undefined ||
    iridescence !== undefined;

  const colorHex = (pick('color') as string) ?? '#8888cc';
  const mat: THREE.MeshStandardMaterial = isPhysical
    ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colorHex), roughness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.5 });

  const roughness = num('roughness');
  if (roughness !== undefined) mat.roughness = roughness;
  const metalness = num('metalness');
  if (metalness !== undefined) mat.metalness = metalness;
  const emissive = pick('emissive');
  if (typeof emissive === 'string') mat.emissive = new THREE.Color(emissive);
  const emissiveIntensity = num('emissiveIntensity');
  if (emissiveIntensity !== undefined) mat.emissiveIntensity = emissiveIntensity;
  const opacity = num('opacity');
  if (opacity !== undefined && opacity < 1) {
    mat.opacity = opacity;
    mat.transparent = true;
  }
  const wireframe = pick('wireframe');
  if (typeof wireframe === 'boolean') mat.wireframe = wireframe;

  if (mat instanceof THREE.MeshPhysicalMaterial) {
    // transmission needs no transparent flag (it's its own blending path), but
    // does need a non-zero thickness to refract; default thickness so plain
    // `transmission: 1` glass still reads as solid rather than a flat film.
    if (transmission !== undefined) mat.transmission = transmission;
    if (ior !== undefined) mat.ior = ior;
    if (thickness !== undefined) mat.thickness = thickness;
    else if (transmission !== undefined && transmission > 0) mat.thickness = 0.5;
    if (clearcoat !== undefined) mat.clearcoat = clearcoat;
    if (clearcoatRoughness !== undefined) mat.clearcoatRoughness = clearcoatRoughness;
    if (sheen !== undefined) mat.sheen = sheen;
    if (sheenRoughness !== undefined) mat.sheenRoughness = sheenRoughness;
    const sheenColor = pick('sheenColor');
    if (typeof sheenColor === 'string') mat.sheenColor = new THREE.Color(sheenColor);
    if (iridescence !== undefined) mat.iridescence = iridescence;
    if (iridescenceIOR !== undefined) mat.iridescenceIOR = iridescenceIOR;
    if (specularIntensity !== undefined) mat.specularIntensity = specularIntensity;
  }
  return mat;
}

type BuildCtx = { lights: number; meshes: number };

/**
 * Walk a resolved R3FCompiler tree into a three.js Object3D. Mirrors r3f-renderer
 * MeshNode: a mesh becomes a group hosting the transformed mesh, with child
 * objects added as siblings so a parent's non-uniform scale never distorts them.
 */
function buildObject3D(node: R3FNode, ctx: BuildCtx): THREE.Object3D | null {
  const p = (node.props ?? {}) as Record<string, unknown>;
  const pos = Array.isArray(p.position) ? (p.position as number[]) : null;
  const rot = Array.isArray(p.rotation) ? (p.rotation as number[]) : null;
  const scl = Array.isArray(p.scale) ? (p.scale as number[]) : null;
  const setPos = (o: THREE.Object3D) => {
    if (pos) o.position.set(numProp(pos[0], 0), numProp(pos[1], 0), numProp(pos[2], 0));
  };
  const setRot = (o: THREE.Object3D) => {
    if (rot) o.rotation.set(numProp(rot[0], 0), numProp(rot[1], 0), numProp(rot[2], 0));
  };
  const setScale = (o: THREE.Object3D) => {
    if (scl) o.scale.set(numProp(scl[0], 1), numProp(scl[1], 1), numProp(scl[2], 1));
  };

  let container: THREE.Object3D;

  switch (node.type) {
    case 'mesh': {
      const hsType = String(p.hsType ?? 'box');
      const isPlane = hsType === 'plane';
      const mesh = new THREE.Mesh(geometryForHsType(hsType, scl, p), materialFromProps(p));
      mesh.name = node.id ?? hsType;
      ctx.meshes++;
      setPos(mesh);
      if (isPlane) {
        // Ground: PlaneGeometry is born vertical, so lay it flat. Dimensions are
        // baked from scale.x/scale.z, so do NOT re-apply scale. Explicit rotation
        // (if authored) overrides the flat default.
        mesh.rotation.x = -Math.PI / 2;
        if (rot) setRot(mesh);
        (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      } else {
        setRot(mesh);
        setScale(mesh);
      }
      const group = new THREE.Group();
      group.add(mesh);
      container = group;
      break;
    }
    case 'directionalLight': {
      const l = new THREE.DirectionalLight(
        new THREE.Color((p.color as string) ?? '#ffffff'),
        numProp(p.intensity, 1)
      );
      setPos(l);
      ctx.lights++;
      container = l;
      break;
    }
    case 'ambientLight': {
      const l = new THREE.AmbientLight(
        new THREE.Color((p.color as string) ?? '#ffffff'),
        numProp(p.intensity, 0.5)
      );
      ctx.lights++;
      container = l;
      break;
    }
    case 'pointLight': {
      const l = new THREE.PointLight(
        new THREE.Color((p.color as string) ?? '#ffffff'),
        numProp(p.intensity, 1),
        numProp(p.distance, 0),
        numProp(p.decay, 2)
      );
      setPos(l);
      ctx.lights++;
      container = l;
      break;
    }
    case 'hemisphereLight': {
      const l = new THREE.HemisphereLight(
        new THREE.Color((p.color as string) ?? '#ffffff'),
        new THREE.Color((p.groundColor as string) ?? '#444444'),
        numProp(p.intensity, 1)
      );
      ctx.lights++;
      container = l;
      break;
    }
    case 'spotLight': {
      const l = new THREE.SpotLight(
        new THREE.Color((p.color as string) ?? '#ffffff'),
        numProp(p.intensity, 1),
        numProp(p.distance, 0),
        numProp(p.angle, Math.PI / 6),
        numProp(p.penumbra, 0.1),
        numProp(p.decay, 2)
      );
      setPos(l);
      if (Array.isArray(p.target)) {
        const t = p.target as number[];
        l.target.position.set(numProp(t[0], 0), numProp(t[1], 0), numProp(t[2], 0));
      }
      // The spot's target must be in the scene graph to aim; wrap both in a group.
      const g = new THREE.Group();
      g.add(l);
      g.add(l.target);
      ctx.lights++;
      container = g;
      break;
    }
    case 'gltfModel': {
      // GLB/glTF model node (compiler emits `type:'gltfModel'` with the URL in
      // props.src — see SceneIRCompiler). Worlds like Shangri-La carry their
      // temple/trees as GLBs; before this they hit the "draw nothing" path and
      // rendered empty. Load via three's GLTFLoader and keep the GLB's own PBR
      // materials (which the environment map now lights). Load is async, so add
      // a transformed group immediately and swap the scene in on load.
      const src = (typeof p.src === 'string' && p.src) || (typeof p.model === 'string' && p.model);
      const g = new THREE.Group();
      g.name = node.id ?? 'gltfModel';
      setPos(g);
      setRot(g);
      setScale(g);
      if (src) {
        // Count the model as a mesh so the canonical path isn't discarded as
        // "produced no geometry" when a scene is GLB-only.
        ctx.meshes++;
        new GLTFLoader()
          .loadAsync(src)
          .then((gltf) => {
            g.add(gltf.scene);
          })
          .catch((err) => {
            console.warn('[ImmersiveViewer] GLTF load failed:', src, err);
          });
      }
      container = g;
      break;
    }
    case 'scatter': {
      // Procedural scatter (compiler emits `type:'scatter'` with props.transforms,
      // each [x, y, z, rotationY, scale] — see SceneIRCompiler.compileProceduralScatterNode).
      // Render the whole field as ONE InstancedMesh so `scatter { count: 2000 }`
      // is real geometry at one draw call instead of being dropped.
      const transforms = Array.isArray(p.transforms) ? (p.transforms as number[][]) : [];
      const hsType = String(p.hsType ?? 'box');
      const inst = new THREE.InstancedMesh(
        geometryForHsType(hsType, null, p),
        materialFromProps(p),
        Math.max(1, transforms.length)
      );
      inst.name = node.id ?? 'scatter';
      const dummy = new THREE.Object3D();
      transforms.forEach((t, i) => {
        dummy.position.set(numProp(t[0], 0), numProp(t[1], 0), numProp(t[2], 0));
        dummy.rotation.set(0, numProp(t[3], 0), 0);
        const s = numProp(t[4], 1);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.count = transforms.length;
      inst.instanceMatrix.needsUpdate = true;
      if (transforms.length > 0) ctx.meshes++;
      const group = new THREE.Group();
      group.add(inst);
      container = group;
      break;
    }
    case 'group':
    default: {
      // group, plus non-renderable nodes (Environment, EffectComposer, Text,
      // Sparkles, Timeline) host children but draw nothing in v0.
      const g = new THREE.Group();
      setPos(g);
      setRot(g);
      setScale(g);
      container = g;
      break;
    }
  }

  for (const child of node.children ?? []) {
    const built = buildObject3D(child, ctx);
    if (built) container.add(built);
  }
  return container;
}

/** True if any object in the parsed composition declares a `geometry` property —
 *  the authoritative signal for the canonical .holo dialect (vs the simple
 *  type:/color: dialect). Checked on the AST, not the raw source, so a
 *  `geometry:` substring in a comment or string value can't misroute a simple
 *  scene into the canonical path (which would render it blank). */
function compositionHasGeometry(ast: unknown): boolean {
  const objs = (ast as { objects?: unknown[] } | null | undefined)?.objects;
  if (!Array.isArray(objs)) return false;
  const stack = [...objs];
  while (stack.length) {
    const o = stack.pop() as { properties?: Array<{ key?: string }>; children?: unknown[] };
    if (o?.properties?.some((pr) => pr?.key === 'geometry')) return true;
    if (Array.isArray(o?.children)) stack.push(...o.children);
  }
  return false;
}

function isQuestBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Quest 3 Browser reports "Quest 3" (not OculusBrowser) in its UA.
  // Match both for forward/backward compat.
  return /OculusBrowser|Quest\s*\d/i.test(navigator.userAgent);
}

function questProofRunId(): string {
  if (typeof window === 'undefined') return new Date().toISOString().slice(0, 10);
  return (
    new URLSearchParams(window.location.search).get('runId') ??
    `${new Date().toISOString().slice(0, 10)}-quest-proof`
  );
}

function questProofPageId(): string {
  if (typeof window === 'undefined') return 'immersive-viewer';
  const path = window.location.pathname.replace(/^\/live/, '');
  if (path.includes('/examples/no-app-webxr')) return 'examples/no-app-webxr';
  if (path.includes('/shared/')) return 'shared/immersive-viewer';
  if (path.includes('/w/')) return 'w/immersive-viewer';
  return path.replace(/^\/+/, '') || 'immersive-viewer';
}

function questProofApiPath(path: string): string {
  if (typeof window === 'undefined') return path;
  const tunnel = window.location.pathname.match(/^\/t\/[^/]+/);
  if (tunnel) return `${tunnel[0]}${path}`;
  if (window.location.pathname.startsWith('/live/')) return `/live${path}`;
  return path;
}

async function postQuestProof(
  label: string,
  status: 'OK' | 'WARN' | 'FAIL' | 'INFO',
  detail: string,
  checks?: Record<string, unknown>
) {
  if (typeof window === 'undefined') return;
  const payload = {
    runId: questProofRunId(),
    pageId: questProofPageId(),
    label,
    status,
    detail,
    url: window.location.href,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      orientation: screen.orientation?.type ?? null,
      crossOriginIsolated: self.crossOriginIsolated === true,
    },
    xr: {
      questBrowser: isQuestBrowser(),
      hasNavigatorXr: Boolean((navigator as unknown as { xr?: unknown }).xr),
    },
    checks,
  };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  const posted = await fetch(questProofApiPath('/api/quest-proof'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => window.clearTimeout(timeout));
  if (posted) return;
  const query = new URLSearchParams({
    record: '1',
    runId: payload.runId,
    pageId: payload.pageId,
    label,
    status,
    detail,
    url: payload.url,
    userAgent: payload.userAgent,
  });
  await fetch(`${questProofApiPath('/api/quest-proof')}?${query.toString()}`).catch(
    () => undefined
  );
}

export function ImmersiveViewer({ code, sceneName, name, agentId }: ImmersiveViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  // 3D "Publish" button mesh + 3D QR display plane — created when entering VR.
  const publishButtonRef = useRef<THREE.Mesh | null>(null);
  const qrPlaneRef = useRef<THREE.Mesh | null>(null);
  // Scene source: inline `code`, or fetched from the examples library by `scene`
  // name — so a compiler-generated .holo page can mount this viewer with a scene id
  // and the scene stays the single source of truth in examples/ (no inline string).
  const [source, setSource] = useState<string | null>(code ?? null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  useEffect(() => {
    if (code != null) {
      setSource(code);
      return;
    }
    if (!sceneName) return;
    let cancelled = false;
    fetch(`/api/examples/${encodeURIComponent(sceneName)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (!cancelled) setSource(text);
      })
      .catch((e) => {
        if (!cancelled) setSceneError(e instanceof Error ? e.message : 'scene load failed');
      });
    return () => {
      cancelled = true;
    };
  }, [code, sceneName]);
  const parsed = useMemo(
    () =>
      source != null
        ? extractObjects(source)
        : { objects: [] as ParsedObject[], parseOk: false, error: sceneError ?? 'loading scene…' },
    [source, sceneError]
  );
  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'ready' | 'error'>(
    'idle'
  );
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Set up three.js scene + animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!parsed.parseOk) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // Cap pixel ratio: the Quest Browser reports a high devicePixelRatio that,
    // multiplied by the flat panel size, can blow past the GL renderbuffer limit
    // and leave the canvas black. min(dpr, 2) keeps the buffer in-bounds.
    renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.xr.enabled = true;
    renderer.setClearColor(0x0a0a12, 1);
    // Photoreal output pipeline: ACES filmic tone mapping + sRGB output give PBR
    // its film-like highlight rolloff and correct gamma. Without these, lit PBR
    // reads washed-out/flat. Exposure nudged slightly above 1 to lift the IBL.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();

    // Image-based lighting (IBL): generate a prefiltered environment map from
    // three's built-in RoomEnvironment (a synthetic neutral-lit room — no asset
    // file, $0) and set it as scene.environment. This is what gives metalness/
    // roughness materials something to reflect and a soft ambient term, so PBR
    // surfaces read as real materials instead of dull flat shapes. We keep the
    // dark clearColor as the background (transparent-friendly for passthrough);
    // the env map drives reflections/shading only, not the visible backdrop.
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTexture;
    // The room scene + PMREM generator are done after baking; free them.
    roomEnv.dispose();
    pmrem.dispose();

    // Canonical .holo (geometry:/material:, templates, lights, nesting) is rendered
    // through @holoscript/core's real SceneIRCompiler so the immersive viewer faithfully
    // shows the native example library. The minimal type/color dialect (and any
    // compile failure) falls back to the simple makeMesh path — zero regression.
    const ctx = { lights: 0, meshes: 0 };
    let built = false;
    if (parsed.ast && compositionHasGeometry(parsed.ast)) {
      try {
        const root = new SceneIRCompiler().compileComposition(parsed.ast);
        const obj = buildObject3D(root, ctx);
        // Only trust the canonical path if it actually produced meshes; otherwise
        // (empty/misrouted compile) fall back to the simple renderer.
        if (obj && ctx.meshes > 0) {
          scene.add(obj);
          built = true;
        }
      } catch (err) {
        console.warn('[ImmersiveViewer] R3F compile failed; using simple renderer', err);
      }
    }
    if (!built) {
      for (const o of parsed.objects) scene.add(makeMesh(o));
    }
    // Light the scene only if the composition itself brought no lights.
    if (ctx.lights === 0) {
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(5, 10, 5);
      scene.add(dir);
    }
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.6, 4);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    // Embodied agent: the `agentId` prop (native page declaration) wins; otherwise
    // fall back to ?agent= in the URL (the warehouse path — unchanged).
    const resolvedAgentId =
      agentId ??
      (typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('agent')
        : null);

    // User locomotion (move + smooth-turn + teleport) and NPC embodiment, both
    // from the shared @holoscript/xr-embodiment package — no longer hardcoded here,
    // so every VR scene inherits the same mobility (F.118) and agent-avatar tracking.
    const loco = new XRLocomotionController({ renderer });
    const tracker = resolvedAgentId
      ? new AgentAvatarTracker({ scene, entityId: resolvedAgentId })
      : null;

    // setAnimationLoop is the correct loop for BOTH XR and non-XR (three.js drives
    // it via rAF when not presenting), so it is the single render driver — a second
    // hand-rolled rAF loop would render the scene twice per frame.
    renderer.setAnimationLoop((now?: number) => {
      loco.update(typeof now === 'number' ? now : performance.now());
      tracker?.update();
      renderer.render(scene, camera);
    });

    const handleResize = () => {
      if (!canvas) return;
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', handleResize);
      loco.dispose();
      tracker?.dispose();
      // renderer.dispose() frees only the renderer's own GL resources, NOT
      // scene-owned geometries/materials — traverse and dispose them to avoid a
      // GPU leak each time the scene rebuilds.
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m?.dispose());
        else (mat as THREE.Material | undefined)?.dispose();
      });
      // The PMREM-baked environment map is scene-owned too — free it so a scene
      // rebuild doesn't leak a render target per mount.
      scene.environment?.dispose();
      scene.environment = null;
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [parsed]);

  // Agent-avatar tracking now lives in the scene effect above (AgentAvatarTracker
  // from @holoscript/xr-embodiment) — no separate effect needed.

  // Feature-detect immersive-vr.
  // Quest Browser returns false from isSessionSupported('immersive-vr') while
  // the page is flat (2D panel mode) even though requestSession succeeds. We
  // enable the button optimistically whenever navigator.xr exists and rely on
  // the requestSession error path in enterVR() to surface real failures.
  useEffect(() => {
    const xr = (
      navigator as unknown as { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }
    ).xr;
    if (!xr) {
      void postQuestProof('WebXR API', 'FAIL', 'navigator.xr missing', {
        parseOk: parsed.parseOk,
        objectCount: parsed.objects.length,
      });
      return;
    }
    // Optimistically enable for any browser that has the XR API.
    setXrSupported(true);
    // Refine: if the browser explicitly reports no support, disable.
    xr.isSessionSupported('immersive-vr')
      .then((supported) => {
        // Do NOT disable the button on a false result: Quest Browser reports
        // immersive-vr unsupported in flat panel mode even though requestSession
        // succeeds (see comment above). Stay optimistically enabled and let
        // enterVR()'s requestSession error path surface any real failure.
        void postQuestProof(
          'WebXR immersive-vr support',
          supported ? 'OK' : 'WARN',
          supported
            ? 'isSessionSupported returned true'
            : 'isSessionSupported returned false; requestSession may still work on Quest panel mode',
          { parseOk: parsed.parseOk, objectCount: parsed.objects.length }
        );
      })
      .catch(() => {
        /* leave optimistic true */
      });
  }, [parsed.objects.length, parsed.parseOk]);

  const enterVR = async () => {
    setXrError(null);
    const renderer = rendererRef.current;
    if (!renderer) {
      setXrError('renderer not ready');
      return;
    }
    const xr = (
      navigator as unknown as {
        xr?: {
          requestSession: (m: string, o?: { optionalFeatures?: string[] }) => Promise<XRSession>;
        };
      }
    ).xr;
    if (!xr) {
      setXrError('WebXR not available');
      return;
    }
    try {
      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      setXrActive(true);
      void postQuestProof('VR session start', 'OK', 'immersive-vr session created', {
        objectCount: parsed.objects.length,
        sceneName: name ?? null,
      });
      session.addEventListener('end', () => {
        setXrActive(false);
        void postQuestProof('VR session end', 'INFO', 'immersive-vr session ended', {
          objectCount: parsed.objects.length,
          sceneName: name ?? null,
        });
      });
      await renderer.xr.setSession(session as unknown as XRSession);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'failed to enter VR';
      setXrError(detail);
      void postQuestProof('VR session start', 'FAIL', detail, {
        objectCount: parsed.objects.length,
        sceneName: name ?? null,
      });
    }
  };

  // Auto-enter on Oculus Browser once XR support is confirmed
  useEffect(() => {
    if (xrSupported && isQuestBrowser() && !xrActive && parsed.parseOk) {
      const t = setTimeout(() => void enterVR(), 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xrSupported, parsed.parseOk]);

  /**
   * G6 — Publish the current scene and display a 3D QR code with the share
   * URL in-world. The user points their friend's phone at it.
   */
  const publishInVR = async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    setPublishState('publishing');
    setXrError(null);

    // Flash the button yellow to show "working"
    const btn = publishButtonRef.current;
    const btnMat = btn?.material as THREE.MeshStandardMaterial | undefined;
    const originalColor = btnMat?.color.clone();
    if (btnMat) btnMat.color.setHex(0xeab308);

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name ?? 'Voice-authored scene',
          code: source ?? '',
          author: 'Anonymous',
        }),
      });
      const data = (await res.json()) as { id?: string; url?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Prefer short /w/<id> URL over /shared/<id>
      const base = window.location.origin;
      const shortUrl = `${base}/w/${data.id}`;
      setPublishedUrl(shortUrl);

      // Generate the QR bitmap and map it onto the 3D plane.
      const qr = await import('qrcode');
      const dataUrl = await qr.toDataURL(shortUrl, { width: 512, margin: 2 });
      const tex = await new THREE.TextureLoader().loadAsync(dataUrl);
      tex.colorSpace = THREE.SRGBColorSpace;

      // Create or update the QR plane mesh
      if (!qrPlaneRef.current) {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.6, 0.6),
          new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
        );
        // In front of the user at roughly head height
        plane.position.set(0, 1.6, -1.2);
        scene.add(plane);
        qrPlaneRef.current = plane;
      } else {
        const mat = qrPlaneRef.current.material as THREE.MeshBasicMaterial;
        mat.map = tex;
        mat.needsUpdate = true;
        qrPlaneRef.current.visible = true;
      }

      setPublishState('ready');
      if (btnMat) btnMat.color.setHex(0x16a34a); // green = success
    } catch (e) {
      setPublishState('error');
      setXrError(e instanceof Error ? e.message : 'publish failed');
      if (btnMat && originalColor) btnMat.color.copy(originalColor);
    }
  };

  // When entering VR, spawn the publish button in the scene + wire XR select.
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!xrActive || !scene || !renderer) return;

    // Spawn a small purple cube as the publish button, to the user's right.
    const btn = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x7c3aed,
        emissive: 0x2e1065,
        emissiveIntensity: 0.4,
      })
    );
    // Down and to the right — a reachable control, NOT a cube dead-center in the
    // user's gaze (which read as "the scene" before the floor-occlusion fix).
    btn.position.set(1.15, 1.0, -0.9);
    btn.userData.isPublishButton = true;
    scene.add(btn);
    publishButtonRef.current = btn;

    // Raycast on XR controller select events; if the publish button was hit, fire publishInVR.
    const raycaster = new THREE.Raycaster();
    const tmpMatrix = new THREE.Matrix4();
    const handleSelect = (e: Event) => {
      const xrEvent = e as unknown as { target: { matrixWorld?: THREE.Matrix4 } };
      const mw = xrEvent.target.matrixWorld;
      if (!mw) return;
      tmpMatrix.identity().extractRotation(mw);
      const origin = new THREE.Vector3().setFromMatrixPosition(mw);
      const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tmpMatrix);
      raycaster.set(origin, direction);
      const hits = raycaster.intersectObject(btn, false);
      if (hits.length > 0) void publishInVR();
    };

    // Controllers 0 and 1 (left/right). three.js's XRTargetRaySpace uses a
    // strict EventListener<...> type we can't match with a plain (e: Event)
    // signature; cast to a looser shape for the add/remove calls.
    const c0 = renderer.xr.getController(0) as unknown as {
      addEventListener: (type: string, fn: (e: Event) => void) => void;
      removeEventListener: (type: string, fn: (e: Event) => void) => void;
    };
    const c1 = renderer.xr.getController(1) as unknown as {
      addEventListener: (type: string, fn: (e: Event) => void) => void;
      removeEventListener: (type: string, fn: (e: Event) => void) => void;
    };
    c0.addEventListener('select', handleSelect);
    c1.addEventListener('select', handleSelect);

    return () => {
      c0.removeEventListener('select', handleSelect);
      c1.removeEventListener('select', handleSelect);
      scene.remove(btn);
      publishButtonRef.current = null;
      if (qrPlaneRef.current) {
        scene.remove(qrPlaneRef.current);
        qrPlaneRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xrActive]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
      >
        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
          3D Preview — {parsed.objects.length} object{parsed.objects.length === 1 ? '' : 's'}
          {!parsed.parseOk && (
            <span style={{ color: '#f97316', marginLeft: 8 }}>(parse failed: {parsed.error})</span>
          )}
        </div>
        <button
          onClick={() => void enterVR()}
          disabled={!xrSupported || xrActive || !parsed.parseOk}
          style={{
            background: xrActive ? '#16a34a' : xrSupported ? '#7c3aed' : '#475569',
            color: 'white',
            border: 0,
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: xrSupported && !xrActive ? 'pointer' : 'not-allowed',
          }}
        >
          {xrActive ? 'In VR' : xrSupported ? '🥽 Enter VR' : 'VR not supported'}
        </button>
      </div>

      {xrError && (
        <div
          style={{
            background: '#7f1d1d',
            color: '#fca5a5',
            padding: 8,
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          {xrError}
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '50vh',
          minHeight: 320,
          maxHeight: 600,
          display: 'block',
          borderRadius: 8,
          background: '#0a0a12',
        }}
      />

      {/* Publish status — visible whether or not user is in VR.
          In-VR the cube button publishes; out-of-VR this button does.
          See G6 in research/quest3-iphone-moment/c-studio-share-path-map.md */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#94a3b8' }}
      >
        <button
          onClick={() => void publishInVR()}
          disabled={publishState === 'publishing' || !parsed.parseOk}
          style={{
            background:
              publishState === 'ready'
                ? '#16a34a'
                : publishState === 'error'
                  ? '#dc2626'
                  : publishState === 'publishing'
                    ? '#eab308'
                    : '#7c3aed',
            color: 'white',
            border: 0,
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            cursor: publishState === 'publishing' ? 'wait' : 'pointer',
          }}
        >
          {publishState === 'idle' && '📤 Publish + QR'}
          {publishState === 'publishing' && '…'}
          {publishState === 'ready' && '✓ Published'}
          {publishState === 'error' && '× Error'}
        </button>
        {publishedUrl && (
          <code style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'ui-monospace, monospace' }}>
            {publishedUrl}
          </code>
        )}
      </div>
    </div>
  );
}
