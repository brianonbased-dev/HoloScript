/**
 * Quest WORLD emit — compiles a HoloScript world composition into Meta Spatial SDK scene-building
 * Kotlin. This is the native answer to "how does HoloScript compile a world to Meta": a world is a
 * `.holo` composition authored in HoloScript's own scene vocabulary (object { geometry; position;
 * scale; rotation; color }, environment { backgroundColor }) — the SAME grammar every 3D target
 * consumes (cf. BabylonCompiler SHAPE_TO_MESH) — and the quest target walks it into Spatial SDK
 * entities: geometry → built-in mesh (mesh://sphere / mesh://box), color → Material(Color4, unlit),
 * position/rotation/scale → Transform(Pose(Vector3[, Quaternion])). No glb download, no procedural
 * hash — the world IS the composition, compiled to Meta.
 *
 * Consumed at app-build time by generate-native.mts: each worlds/<id>.holo → World_<id>.kt, plus a
 * WorldsRegistry.kt that the @generated WorldRenderer dispatches on by world id.
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

// ── resolved world object ────────────────────────────────────────────────────
interface WorldObj {
  name: string;
  shape: string;
  pos: Vec3;
  rot: Vec3;
  hasRot: boolean;
  scale: Vec3;
  color: Rgba;
}

function collectObject(obj: HoloObjectDecl): WorldObj {
  let shape = 'box';
  let pos: Vec3 = [0, 0, 0];
  let rot: Vec3 = [0, 0, 0];
  let hasRot = false;
  let scale: Vec3 = [1, 1, 1];
  let color: Rgba = [0.6, 0.6, 0.65, 1];

  for (const p of obj.properties ?? []) {
    switch (p.key) {
      case 'geometry':
      case 'mesh':
      case 'type':
        if (typeof p.value === 'string') shape = p.value;
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
    }
  }
  // Top-level AST fallbacks (HoloPosition {x,y,z}) if not given as properties.
  if (obj.position) pos = readVec3(obj.position as unknown as HoloValue, pos);
  if (obj.scale) scale = readScale(obj.scale as unknown as HoloValue);
  if (obj.rotation) {
    rot = readVec3(obj.rotation as unknown as HoloValue, rot);
    hasRot = true;
  }
  return { name: obj.name, shape, pos, rot, hasRot, scale, color };
}

function materialKt(c: Rgba): string {
  return `Material().apply { baseColor = Color4(${kf(c[0])}, ${kf(c[1])}, ${kf(c[2])}, ${kf(c[3])}); unlit = true }`;
}

function transformKt(o: WorldObj): string {
  const v = `Vector3(${kf(o.pos[0])}, ${kf(o.pos[1])}, ${kf(o.pos[2])})`;
  if (o.hasRot && (o.rot[0] || o.rot[1] || o.rot[2]))
    return `Transform(Pose(${v}, Quaternion(${kf(o.rot[0])}, ${kf(o.rot[1])}, ${kf(o.rot[2])})))`;
  return `Transform(Pose(${v}))`;
}

/** Map a HoloScript geometry name → (Spatial SDK mesh uri, geometry component) with size baked in. */
function geometryKt(o: WorldObj): { mesh: string; geom: string } {
  const [sx, sy, sz] = o.scale;
  const shape = o.shape.toLowerCase();
  if (shape === 'sphere' || shape === 'orb') {
    return { mesh: 'Mesh(Uri.parse("mesh://sphere"))', geom: `Sphere(${kf(0.5 * sx)})` };
  }
  if (shape === 'plane' || shape === 'ground') {
    // Babylon CreateGround uses scale [w, h, 1] → horizontal w×h, flat. Thin box slab.
    return {
      mesh: 'Mesh(Uri.parse("mesh://box"))',
      geom: `Box(Vector3(${kf(-sx / 2)}, -0.05f, ${kf(-sy / 2)}), Vector3(${kf(sx / 2)}, 0.05f, ${kf(sy / 2)}))`,
    };
  }
  // box / cube / cylinder / cone / default → box with the object's scale as full size.
  return {
    mesh: 'Mesh(Uri.parse("mesh://box"))',
    geom: `Box(Vector3(${kf(-sx / 2)}, ${kf(-sy / 2)}, ${kf(-sz / 2)}), Vector3(${kf(sx / 2)}, ${kf(sy / 2)}, ${kf(sz / 2)}))`,
  };
}

function skyboxColor(composition: HoloComposition): Rgba {
  const props = composition.environment?.properties ?? [];
  const v = props.find((p) =>
    ['backgroundColor', 'background', 'skybox', 'skyColor', 'color'].includes(p.key)
  )?.value as HoloValue | undefined;
  return parseColor(v, [0.04, 0.08, 0.16, 1]);
}

/** Sanitize a world id to a Kotlin identifier suffix (World_<id>). */
export function worldKotlinId(worldId: string): string {
  return worldId.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'world';
}

function prettyName(composition: HoloComposition, fallback: string): string {
  const n = composition.name ?? fallback;
  // "AuroraFields" → "Aurora Fields"; "HoloLand" → "Holo Land"
  return String(n)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
}

const ksafe = (s: string): string => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

/** @generated World_<id>.kt — builds this world's Spatial SDK entities. */
export function emitWorldSceneKt(composition: HoloComposition, worldId: string): string {
  const kid = worldKotlinId(worldId);
  const display = prettyName(composition, worldId);
  const sky = skyboxColor(composition);
  const objs = (composition.objects ?? []).map(collectObject);

  const objLines = objs
    .map((o) => {
      const g = geometryKt(o);
      return `    // object "${o.name}" (${o.shape})
    e.add(
        Entity.create(
            listOf(
                ${g.mesh},
                ${g.geom},
                ${materialKt(o.color)},
                ${transformKt(o)},
            )
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
 * The world is authored in HoloScript and compiled to Meta Spatial SDK entities (geometry → mesh,
 * color → Material, position/rotation/scale → Transform).
 */
object World_${kid} {
  const val displayName = ${ksafe(display)}

  fun build(): MutableList<Entity> {
    val e = mutableListOf<Entity>()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(${kf(sky[0])}, ${kf(sky[1])}, ${kf(sky[2])}, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
${objLines}
    return e
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

import com.meta.spatial.core.Entity

/*
 * @generated by the quest compiler from the worlds/ folder (compile_to_quest, world registry).
 * DO NOT EDIT — add a world by dropping a worlds/<id>.holo and recompiling.
 * Maps a scanned world id (WorldPortal.worldId) to its compiled HoloScript world.
 */
object Worlds {
  val ids: Set<String> = setOf(${idSet})

  /** Build the compiled world for [worldId], or null if no such HoloScript world is bundled. */
  fun build(worldId: String): MutableList<Entity>? =
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
