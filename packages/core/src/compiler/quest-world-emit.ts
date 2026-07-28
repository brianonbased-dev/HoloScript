/**
 * Quest WORLD emit — compiles a HoloScript world composition into Meta Spatial SDK scene-building
 * Kotlin. The native answer to "how does HoloScript compile a world to Meta": a world is a `.holo`
 * composition authored in HoloScript's own scene vocabulary — the SAME grammar every 3D target
 * consumes (cf. BabylonCompiler) — and the quest target walks it into Spatial SDK entities.
 *
 * Per object:
 *   geometry: sphere|cube|box|plane|cylinder  → built-in mesh (mesh://sphere / mesh://box)
 *   model: "x.glb"                            → Mesh(apk:///models/x.glb)  (real AAA asset slot)
 *   color: "#hex"   + glow: true              → Material(Color4)  (PBR-lit by default; glow = unlit/full-bright)
 *   roughness / metallic (0..1)               → Material.roughness / Material.metallic (PBR shading)
 *   position / rotation / scale               → Transform(Pose(Vector3[, Quaternion]))  (size baked into geometry)
 *   behavior: spin|orbit|bob|float|sway       → a WorldAnimated descriptor the WorldRenderer ticks
 *     (speed, amplitude/amp, radius, orbit_center) → simulation / character actions, per-frame
 *
 * Lighting is set once by the activity (StarterSampleActivity onSceneReady): a warm sun key + cool
 * sky ambient + a nonzero environmentIntensity (the engine's built-in IBL/ambient term) +
 * setLightingEnvironment, PLUS a shadow-casting toolkit Light entity. Non-glow materials are PBR-lit
 * (baseColor + roughness/metallic → the SDK pbLit shader) so primitives read with real form,
 * reflective ambient, and contact shadows; unlit/glow materials read as emissive. No glb download, no
 * procedural hash — the world IS the composition, compiled to Meta. Consumed at app-build time by
 * generate-native.mts: each worlds/<id>.holo → World_<id>.kt, plus a WorldsRegistry the WorldRenderer
 * dispatches on.
 */
import type { HoloComposition, HoloObjectDecl, HoloValue } from '../parser/HoloCompositionTypes';
import { PKG } from './quest-mr-emit';

type Vec3 = [number, number, number];
type Rgba = [number, number, number, number];

// ── value helpers ────────────────────────────────────────────────────────────
const kf = (n: number): string => {
  const r = Math.round((n + 0) * 10000) / 10000;
  return Number.isInteger(r) ? `${r}.0f` : `${r}f`;
};

function parseColor(v: HoloValue | undefined, dflt: Rgba = [0.5, 0.5, 0.5, 1]): Rgba {
  if (typeof v === 'string') {
    let h = v.trim().replace(/^#/, '');
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].every((n) => !Number.isNaN(n))) return [r, g, b, a];
    }
  }
  if (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((n) => typeof n === 'number')) {
    const a = v as number[];
    const scale = Math.max(a[0], a[1], a[2]) > 1 ? 1 / 255 : 1;
    return [a[0] * scale, a[1] * scale, a[2] * scale, typeof a[3] === 'number' ? a[3] : 1];
  }
  return dflt;
}

function readVec3(v: HoloValue | undefined, dflt: Vec3): Vec3 {
  if (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((n) => typeof n === 'number'))
    return [v[0] as number, v[1] as number, v[2] as number];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.x === 'number' && typeof o.y === 'number' && typeof o.z === 'number')
      return [o.x, o.y, o.z];
  }
  return dflt;
}

function readScale(v: HoloValue | undefined): Vec3 {
  if (typeof v === 'number') return [v, v, v];
  return readVec3(v, [1, 1, 1]);
}

const num = (v: HoloValue | undefined, d: number): number => (typeof v === 'number' ? v : d);
const bool = (v: HoloValue | undefined, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const str = (v: HoloValue | undefined, d: string): string => (typeof v === 'string' ? v : d);

// ── resolved world object ────────────────────────────────────────────────────
interface WorldObj {
  name: string;
  agentId: string; // `agent:` — this object embodies a HoloScript agent (its mind carries via memory)
  shape: string;
  model: string;
  splat: string; // a Gaussian-splat asset file (`.spz`/`.ply`) → Meta's native com.meta.spatial.splat.Splat
  pos: Vec3;
  rot: Vec3;
  hasRot: boolean;
  scale: Vec3;
  color: Rgba;
  glow: boolean;
  roughness: number; // PBR surface roughness (0 = mirror, 1 = fully matte); default 0.85 (matte)
  metallic: number; // PBR metalness (0 = dielectric, 1 = metal); default 0
  behavior: string;
  speed: number;
  amp: number;
  radius: number;
  center: Vec3;
}

/** A Gaussian-splat asset reference is any source ending in .spz or .ply (Meta Splat reads both). */
const isSplatAsset = (s: string): boolean => /\.(spz|ply)$/i.test(s.trim());

function collectObject(obj: HoloObjectDecl): WorldObj {
  let shape = 'box';
  let agentId = '';
  let model = '';
  let splat = '';
  let pos: Vec3 = [0, 0, 0];
  let rot: Vec3 = [0, 0, 0];
  let hasRot = false;
  let scale: Vec3 = [1, 1, 1];
  let color: Rgba = [0.6, 0.6, 0.65, 1];
  let glow = false;
  let roughness = 0.85; // matte by default — most world surfaces (stone, wood, foliage) are rough
  let metallic = 0; // dielectric by default
  let behavior = '';
  let speed = 1;
  let amp = 0.2;
  let radius = 2;
  let center: Vec3 | null = null;

  for (const p of obj.properties ?? []) {
    switch (p.key) {
      case 'geometry':
      case 'mesh':
      case 'type':
        if (typeof p.value === 'string') shape = p.value;
        break;
      case 'agent':
      case 'agent_id':
      case 'embodies':
        // This object is the in-world embodiment of a HoloScript agent. The body is authored here
        // (model/geometry); the MIND (wallet-keyed identity + memory) carries from the compute node
        // (Jetson/laptop) — the memory-carry binding consumes this in the agent-embodiment slice.
        agentId = str(p.value, agentId);
        break;
      case 'model':
      case 'src':
      case 'source': {
        // A .spz/.ply source is a Gaussian splat (Meta's native Splat target); anything else is a glb
        // mesh. Routing on the extension lets one `source:`/`model:` key feed either path natively.
        const s = str(p.value, '');
        if (isSplatAsset(s)) splat = s;
        else if (s) model = s;
        break;
      }
      case 'splat':
      case 'gaussian_splat':
        // Explicit Gaussian-splat asset (also accepts the @gaussian_splat trait's `splat: "x.spz"`).
        splat = str(p.value, splat);
        break;
      case 'position':
        pos = readVec3(p.value, pos);
        break;
      case 'rotation':
        rot = readVec3(p.value, rot);
        hasRot = true;
        break;
      case 'scale':
        scale = readScale(p.value);
        break;
      case 'color':
        color = parseColor(p.value, color);
        break;
      case 'glow':
      case 'emissive':
        glow = bool(p.value, true);
        break;
      case 'roughness':
        roughness = num(p.value, roughness);
        break;
      case 'metallic':
      case 'metalness':
        metallic = num(p.value, metallic);
        break;
      case 'motion':
      case 'animate':
        // 'behavior'/'action' are reserved keywords in the composition grammar — use 'motion'.
        behavior = str(p.value, behavior).toLowerCase();
        break;
      case 'speed':
        speed = num(p.value, speed);
        break;
      case 'amplitude':
      case 'amp':
        amp = num(p.value, amp);
        break;
      case 'radius':
        radius = num(p.value, radius);
        break;
      case 'orbit_center':
      case 'center':
        center = readVec3(p.value, pos);
        break;
    }
  }
  if (obj.position) pos = readVec3(obj.position as unknown as HoloValue, pos);
  if (obj.scale) scale = readScale(obj.scale as unknown as HoloValue);
  if (obj.rotation) {
    rot = readVec3(obj.rotation as unknown as HoloValue, rot);
    hasRot = true;
  }
  return {
    name: obj.name,
    agentId,
    shape,
    model,
    // bundled-asset basename only (apk:///splats/<file>); drop any leading dir the author wrote
    splat: splat ? splat.trim().replace(/^.*[\\/]/, '') : '',
    pos,
    rot,
    hasRot,
    scale,
    color,
    glow,
    roughness: Math.min(1, Math.max(0, roughness)),
    metallic: Math.min(1, Math.max(0, metallic)),
    behavior,
    speed,
    amp,
    radius,
    center: center ?? pos,
  };
}

function materialKt(c: Rgba, glow: boolean, roughness: number, metallic: number): string {
  // glow = unlit, full-bright (reads as emissive, no shading). Otherwise PBR-lit: baseColor +
  // roughness/metallic so the SDK's physically-based shader (pbLit) shades the surface with the
  // sun key, sky ambient, the IBL/environment term, and contact shadows from the shadow-casting
  // Light — giving primitives real form and reflective ambient, not a flat fill.
  const col = `baseColor = Color4(${kf(c[0])}, ${kf(c[1])}, ${kf(c[2])}, ${kf(c[3])})`;
  return glow
    ? `Material().apply { ${col}; unlit = true }`
    : `Material().apply { ${col}; roughness = ${kf(roughness)}; metallic = ${kf(metallic)} }`;
}

function transformKt(o: WorldObj): string {
  const v = `Vector3(${kf(o.pos[0])}, ${kf(o.pos[1])}, ${kf(o.pos[2])})`;
  if (o.hasRot && (o.rot[0] || o.rot[1] || o.rot[2]))
    return `Transform(Pose(${v}, Quaternion(${kf(o.rot[0])}, ${kf(o.rot[1])}, ${kf(o.rot[2])})))`;
  return `Transform(Pose(${v}))`;
}

/** Geometry/material component lines for one object (splat asset, model glb, or a built-in primitive). */
function meshComponentsKt(o: WorldObj): string[] {
  if (o.splat) {
    // Gaussian-splat asset — Meta's native com.meta.spatial.splat.Splat reads the .spz/.ply directly
    // (≤150k splats on Quest 3). No mesh/material: the splat cloud carries its own per-gaussian color.
    return [`Splat(Uri.parse("apk:///splats/${o.splat}"))`];
  }
  if (o.model) {
    // Real asset slot — the glb supplies geometry + its own materials.
    return [`Mesh(Uri.parse("apk:///models/${o.model}"))`];
  }
  const [sx, sy, sz] = o.scale;
  const shape = o.shape.toLowerCase();
  if (shape === 'sphere' || shape === 'orb') {
    return [
      `Mesh(Uri.parse("mesh://sphere"))`,
      `Sphere(${kf(0.5 * sx)})`,
      materialKt(o.color, o.glow, o.roughness, o.metallic),
    ];
  }
  if (shape === 'plane' || shape === 'ground') {
    return [
      `Mesh(Uri.parse("mesh://box"))`,
      `Box(Vector3(${kf(-sx / 2)}, -0.05f, ${kf(-sy / 2)}), Vector3(${kf(sx / 2)}, 0.05f, ${kf(sy / 2)}))`,
      materialKt(o.color, o.glow, o.roughness, o.metallic),
    ];
  }
  return [
    `Mesh(Uri.parse("mesh://box"))`,
    `Box(Vector3(${kf(-sx / 2)}, ${kf(-sy / 2)}, ${kf(-sz / 2)}), Vector3(${kf(sx / 2)}, ${kf(sy / 2)}, ${kf(sz / 2)}))`,
    materialKt(o.color, o.glow, o.roughness, o.metallic),
  ];
}

const BEHAVIORS = new Set(['spin', 'orbit', 'bob', 'float', 'sway']);

function skyboxColor(composition: HoloComposition): Rgba {
  const props = composition.environment?.properties ?? [];
  const v = props.find((p) =>
    ['backgroundColor', 'background', 'skybox', 'skyColor', 'color'].includes(p.key)
  )?.value as HoloValue | undefined;
  return parseColor(v, [0.04, 0.08, 0.16, 1]);
}

export function worldKotlinId(worldId: string): string {
  return (
    worldId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'world'
  );
}

function prettyName(composition: HoloComposition, fallback: string): string {
  const n = composition.name ?? fallback;
  return String(n)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
}

const ksafe = (s: string): string =>
  '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/** @generated World_<id>.kt — builds this world's Spatial SDK entities + animation descriptors. */
export function emitWorldSceneKt(composition: HoloComposition, worldId: string): string {
  const kid = worldKotlinId(worldId);
  const display = prettyName(composition, worldId);
  const sky = skyboxColor(composition);
  const objs = (composition.objects ?? []).map(collectObject);

  // Does this world reference a Gaussian-splat asset? Only then do we import Meta's experimental Splat
  // component and opt in to its @RequiresOptIn API — so splat-free worlds (e.g. the marketing worlds)
  // emit BYTE-IDENTICAL Kotlin with no splat import and no dependency on meta-spatial-sdk-splat.
  const usesSplat = objs.some((o) => o.splat);

  const objLines = objs
    .map((o, i) => {
      const comps = meshComponentsKt(o).concat(transformKt(o));
      const compBlock = comps.map((c) => `                ${c},`).join('\n');
      const animated = BEHAVIORS.has(o.behavior);
      const agentTag = o.agentId ? ` @agent ${o.agentId}` : '';
      // Comment label: splat asset > glb model > primitive shape (so the generated comment names what
      // the object actually is — a splat reads "splat: x.spz", not the unused fallback "box").
      const descriptor = o.splat ? `splat: ${o.splat}` : o.model || o.shape;
      if (!animated) {
        return `    // object "${o.name}" (${descriptor})${agentTag}
    w.entities.add(
        Entity.create(
            listOf(
${compBlock}
            )
        )
    )`;
      }
      const v = `o${i}`;
      return `    // object "${o.name}" (${descriptor}, behavior: ${o.behavior})${agentTag}
    val ${v} =
        Entity.create(
            listOf(
${compBlock}
            )
        )
    w.entities.add(${v})
    w.animated.add(
        WorldAnimated(
            ${v},
            ${ksafe(o.behavior)},
            Vector3(${kf(o.pos[0])}, ${kf(o.pos[1])}, ${kf(o.pos[2])}),
            ${kf(o.speed)},
            ${kf(o.amp)},
            ${kf(o.radius)},
            Vector3(${kf(o.center[0])}, ${kf(o.center[1])}, ${kf(o.center[2])}),
        )
    )`;
    })
    .join('\n');

  // Splat import + experimental opt-in, injected ONLY when the world uses a Gaussian splat (keeps
  // splat-free worlds byte-identical and free of the meta-spatial-sdk-splat dependency).
  const splatImports = usesSplat
    ? `import com.meta.spatial.splat.Splat\nimport com.meta.spatial.splat.SpatialSDKExperimentalSplatAPI\n`
    : '';
  // Splat is a @RequiresOptIn(ERROR) experimental API — the object that references it must opt in.
  const splatOptIn = usesSplat ? `@OptIn(SpatialSDKExperimentalSplatAPI::class)\n` : '';

  return `package ${PKG}

import android.net.Uri
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
${splatImports}import com.meta.spatial.toolkit.Box
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Sphere
import com.meta.spatial.toolkit.Transform

/*
 * @generated from worlds/${worldId}.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/${worldId}.holo and recompile.
 * Authored in HoloScript, compiled to Meta Spatial SDK entities (geometry -> mesh, color -> Material,
 * position/rotation/scale -> Transform, behavior -> a per-frame WorldAnimated the WorldRenderer ticks).
 */
${splatOptIn}object World_${kid} {
  const val displayName = ${ksafe(display)}

  fun build(): WorldBuild {
    val w = WorldBuild()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(${kf(sky[0])}, ${kf(sky[1])}, ${kf(sky[2])}, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
${objLines}
    return w
  }
}
`;
}

/** @generated WorldsRegistry.kt — dispatches a world id to its compiled scene builder. */
export function emitWorldsRegistryKt(worldIds: string[]): string {
  const buildArms = worldIds
    .map((id) => `      ${ksafe(id.toLowerCase())} -> World_${worldKotlinId(id)}.build()`)
    .join('\n');
  const nameArms = worldIds
    .map((id) => `      ${ksafe(id.toLowerCase())} -> World_${worldKotlinId(id)}.displayName`)
    .join('\n');
  const idSet = worldIds.map((id) => ksafe(id.toLowerCase())).join(', ');
  return `package ${PKG}

/*
 * @generated by the quest compiler from the worlds/ folder (compile_to_quest, world registry).
 * DO NOT EDIT — add a world by dropping a worlds/<id>.holo and recompiling.
 * Maps a scanned world id (WorldPortal.worldId) to its compiled HoloScript world.
 */
object Worlds {
  val ids: Set<String> = setOf(${idSet})

  /** Build the compiled world for [worldId], or null if no such HoloScript world is bundled. */
  fun build(worldId: String): WorldBuild? =
      when (worldId.lowercase()) {
${buildArms}
        else -> null
      }

  /** The world's own display name (from its composition), or null if unknown. */
  fun displayName(worldId: String): String? =
      when (worldId.lowercase()) {
${nameArms}
        else -> null
      }
}
`;
}
