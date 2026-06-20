/**
 * Quest WORLD emit — compiles a HoloScript world composition into Meta Spatial SDK scene-building
 * Kotlin. The native answer to "how does HoloScript compile a world to Meta": a world is a `.holo`
 * composition authored in HoloScript's own scene vocabulary — the SAME grammar every 3D target
 * consumes (cf. BabylonCompiler) — and the quest target walks it into Spatial SDK entities.
 *
 * Per object:
 *   geometry: sphere|cube|box|plane|cylinder  → built-in mesh (mesh://sphere / mesh://box)
 *   model: "x.glb"                            → Mesh(apk:///models/x.glb)  (real AAA asset slot)
 *   color: "#hex"   + glow: true              → Material(Color4)  (lit by default; glow = unlit/full-bright)
 *   position / rotation / scale               → Transform(Pose(Vector3[, Quaternion]))  (size baked into geometry)
 *   behavior: spin|orbit|bob|float|sway       → a WorldAnimated descriptor the WorldRenderer ticks
 *     (speed, amplitude/amp, radius, orbit_center) → simulation / character actions, per-frame
 *
 * Lighting is a directional sun + ambient set once by the activity (setLightingEnvironment); lit
 * materials shade, unlit/glow materials read as emissive. No glb download, no procedural hash — the
 * world IS the composition, compiled to Meta. Consumed at app-build time by generate-native.mts:
 * each worlds/<id>.holo → World_<id>.kt, plus a WorldsRegistry the WorldRenderer dispatches on.
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
  shape: string;
  model: string;
  pos: Vec3;
  rot: Vec3;
  hasRot: boolean;
  scale: Vec3;
  color: Rgba;
  glow: boolean;
  behavior: string;
  speed: number;
  amp: number;
  radius: number;
  center: Vec3;
}

function collectObject(obj: HoloObjectDecl): WorldObj {
  let shape = 'box';
  let model = '';
  let pos: Vec3 = [0, 0, 0];
  let rot: Vec3 = [0, 0, 0];
  let hasRot = false;
  let scale: Vec3 = [1, 1, 1];
  let color: Rgba = [0.6, 0.6, 0.65, 1];
  let glow = false;
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
      case 'model':
      case 'src':
      case 'source':
        model = str(p.value, model);
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
    shape,
    model,
    pos,
    rot,
    hasRot,
    scale,
    color,
    glow,
    behavior,
    speed,
    amp,
    radius,
    center: center ?? pos,
  };
}

function materialKt(c: Rgba, glow: boolean): string {
  // Lit by default (shaded by the sun/ambient); glow = unlit, full-bright (reads as emissive).
  return glow
    ? `Material().apply { baseColor = Color4(${kf(c[0])}, ${kf(c[1])}, ${kf(c[2])}, ${kf(c[3])}); unlit = true }`
    : `Material().apply { baseColor = Color4(${kf(c[0])}, ${kf(c[1])}, ${kf(c[2])}, ${kf(c[3])}) }`;
}

function transformKt(o: WorldObj): string {
  const v = `Vector3(${kf(o.pos[0])}, ${kf(o.pos[1])}, ${kf(o.pos[2])})`;
  if (o.hasRot && (o.rot[0] || o.rot[1] || o.rot[2]))
    return `Transform(Pose(${v}, Quaternion(${kf(o.rot[0])}, ${kf(o.rot[1])}, ${kf(o.rot[2])})))`;
  return `Transform(Pose(${v}))`;
}

/** Geometry/material component lines for one object (model glb, or a built-in primitive). */
function meshComponentsKt(o: WorldObj): string[] {
  if (o.model) {
    // Real asset slot — the glb supplies geometry + its own materials.
    return [`Mesh(Uri.parse("apk:///models/${o.model}"))`];
  }
  const [sx, sy, sz] = o.scale;
  const shape = o.shape.toLowerCase();
  if (shape === 'sphere' || shape === 'orb') {
    return [`Mesh(Uri.parse("mesh://sphere"))`, `Sphere(${kf(0.5 * sx)})`, materialKt(o.color, o.glow)];
  }
  if (shape === 'plane' || shape === 'ground') {
    return [
      `Mesh(Uri.parse("mesh://box"))`,
      `Box(Vector3(${kf(-sx / 2)}, -0.05f, ${kf(-sy / 2)}), Vector3(${kf(sx / 2)}, 0.05f, ${kf(sy / 2)}))`,
      materialKt(o.color, o.glow),
    ];
  }
  return [
    `Mesh(Uri.parse("mesh://box"))`,
    `Box(Vector3(${kf(-sx / 2)}, ${kf(-sy / 2)}, ${kf(-sz / 2)}), Vector3(${kf(sx / 2)}, ${kf(sy / 2)}, ${kf(sz / 2)}))`,
    materialKt(o.color, o.glow),
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
  return worldId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'world';
}

function prettyName(composition: HoloComposition, fallback: string): string {
  const n = composition.name ?? fallback;
  return String(n)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
}

const ksafe = (s: string): string => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/** @generated World_<id>.kt — builds this world's Spatial SDK entities + animation descriptors. */
export function emitWorldSceneKt(composition: HoloComposition, worldId: string): string {
  const kid = worldKotlinId(worldId);
  const display = prettyName(composition, worldId);
  const sky = skyboxColor(composition);
  const objs = (composition.objects ?? []).map(collectObject);

  const objLines = objs
    .map((o, i) => {
      const comps = meshComponentsKt(o).concat(transformKt(o));
      const compBlock = comps.map((c) => `                ${c},`).join('\n');
      const animated = BEHAVIORS.has(o.behavior);
      if (!animated) {
        return `    // object "${o.name}" (${o.model || o.shape})
    w.entities.add(
        Entity.create(
            listOf(
${compBlock}
            )
        )
    )`;
      }
      const v = `o${i}`;
      return `    // object "${o.name}" (${o.model || o.shape}, behavior: ${o.behavior})
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

  return `package ${PKG}

import android.net.Uri
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.toolkit.Box
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
object World_${kid} {
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
