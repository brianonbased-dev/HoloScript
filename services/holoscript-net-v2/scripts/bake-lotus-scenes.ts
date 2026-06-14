#!/usr/bin/env tsx
/**
 * holoscript.net v2 — Lotus Scene Baker (build-time dogfood)
 *
 * Compiles the THREE pre-worked lotus `.holo` scenes through HoloScript's OWN
 * parser + R3FCompiler (and the @botanical_lotus trait), then serializes a
 * SELF-CONTAINED render descriptor per scene into public/scenes/<name>.baked.json.
 *
 * WHY a bake (not a runtime compile):
 *   The Next runtime bundle of holoscript-net-v2 must NOT depend on
 *   @holoscript/core or @holoscript/r3f-renderer — the Railway Dockerfile installs
 *   ONLY net-v2's declared dependency closure (`--filter @holoscript/net-v2`), and
 *   core is a build-time-only devDependency while r3f-renderer is not a dependency
 *   at all. So the flower is COMPILED HERE (the real HoloScript surface, like
 *   compile-holo-pages.ts) and the LotusWorld viewer renders the baked output with
 *   only three / @react-three/fiber / @react-three/drei. The flower is still
 *   genuinely HoloScript-compiled — geometry, golden-angle placement, pond layout,
 *   palette, and per-paper bloom all come from core, never hand-authored in React.
 *
 *   The custom petal shader (LOTUS_PETAL_SHADER_CHUNKS / buildCompiledMaterial)
 *   lives in @holoscript/r3f-renderer, which is unavailable at runtime, so the
 *   viewer drives the REAL compiled petal geometry with MeshStandardMaterial keyed
 *   to the REAL per-ring petal colors (the documented fallback: a robust real
 *   flower over a fragile photoreal one). Everything structural is real.
 *
 * Usage: pnpm holo:build  (runs compile-holo-pages.ts then this baker)
 *
 * @cites I.007, F.037 (honest bloom), F.099 (show the rendered artifact), F.014
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseHolo } from '../../../packages/core/src/parser/HoloCompositionParser';
import { R3FCompiler } from '../../../packages/core/src/compiler/R3FCompiler';
import type { R3FNode } from '../../../packages/core/src/compiler/r3f';
import {
  buildLotusSceneFromComposition,
  createBotanicalLotusRenderProfile,
  buildLotusPetalGeometryData,
  lotusPetalGeometryParamsFromProfile,
} from '../../../packages/core/src/traits/BotanicalLotusTrait';
import { deriveLotusHealth, type PapersStatusDoc } from '../../../packages/core/src/traits/deriveLotusHealth';

const SERVICE_ROOT = join(import.meta.dirname || __dirname, '..');
const SCENES_DIR = join(SERVICE_ROOT, 'public', 'scenes');
const AUDIT_PATH = join(SERVICE_ROOT, 'public', 'papers-status.json');
const MANIFEST_PATH = join(SCENES_DIR, 'baked-manifest.json');

// ── Serialized geometry: typed arrays → plain number[] (JSON-safe). ──────────
interface BakedGeometry {
  positions: number[];
  normals: number[];
  uv: number[];
  indices: number[];
}

/** A leaf primitive the viewer draws with a stock geometry + MeshStandardMaterial. */
interface BakedPrimitive {
  hsType: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  color?: string;
  roughness?: number;
  metalness?: number;
  reflective?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  // primitive params
  width?: number;
  height?: number;
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  notchAngle?: number;
}

interface BakedPetalPlacement {
  azimuth: number;
  tilt: number;
  radius: number;
  lift: number;
  ring: number;
}

interface BakedLotusInstance {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  growthCap: number;
  placements: BakedPetalPlacement[];
  /** The compiled __lotusScene descriptor (stem/scaffold/colors/center). */
  scene: Record<string, unknown>;
}

interface BakedAnimatedChannel {
  prop: string;
  target: string;
  edge0: number;
  edge1: number;
  from: number;
  to: number;
}

/** An animated scaffold group (stem rises, leaf unfurls) with primitive children. */
interface BakedAnimatedGroup {
  position?: [number, number, number];
  rotation?: [number, number, number];
  channels: BakedAnimatedChannel[];
  children: BakedPrimitive[];
}

interface BakedTimelineKey {
  t: number;
  target: string;
  value: number;
}

/** A paper-bound petal (seedable scene) with REAL health-derived bloom. */
interface BakedPaperPetal {
  index: number;
  ring: number;
  ringIndex: number;
  angle: number;
  radius: number;
  height: number;
  color: string;
  label: string;
  title: string;
  /** Authored bloom from the .holo @glowing encoding. */
  bloomAuthored: string;
  /** REAL bloom from the live paper-audit health (honest overlay). */
  bloomHealth: string | null;
  /** 0..1 health from deriveLotusHealth, or null if unmatched. */
  health: number | null;
  retired: boolean;
  failing: number | null;
  rowId: string | null;
}

interface BakedScene {
  kind: 'pond' | 'paper-flower' | 'symbolic';
  name: string;
  source: string;
  generatedAt: string;
  // shared petal mesh for lotus + paper flower (the real compiled petal geometry)
  petalGeometry?: BakedGeometry;
  // pond
  lotuses?: BakedLotusInstance[];
  scaffold?: BakedPrimitive[];
  animatedGroups?: BakedAnimatedGroup[];
  timeline?: BakedTimelineKey[];
  camera?: { position: [number, number, number]; target: [number, number, number] };
  // paper-flower (seedable)
  paperPetals?: BakedPaperPetal[];
  center?: Record<string, unknown>;
  colors?: Record<string, string>;
  aggregate?: number;
  aggregateBloom?: string;
  // symbolic (refreshed)
  nodes?: BakedPrimitive[];
}

// ── helpers ──────────────────────────────────────────────────────────────────
function toNumArr(a: ArrayLike<number> | undefined): number[] {
  return a ? Array.from(a as ArrayLike<number>) : [];
}

function asTriple(v: unknown, fb: [number, number, number]): [number, number, number] {
  return Array.isArray(v) && v.length === 3 ? (v as [number, number, number]) : fb;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Compiled mesh node → baked primitive. */
function bakePrimitive(node: R3FNode): BakedPrimitive {
  const p = node.props as Record<string, unknown>;
  const mat = (p.materialProps ?? {}) as Record<string, unknown>;
  const glow = (p.glowing ?? {}) as Record<string, unknown>;
  const prim: BakedPrimitive = {
    hsType: str(p.hsType) ?? 'box',
  };
  if (Array.isArray(p.position)) prim.position = p.position as [number, number, number];
  if (Array.isArray(p.rotation)) prim.rotation = p.rotation as [number, number, number];
  if (typeof p.scale === 'number') prim.scale = p.scale;
  else if (Array.isArray(p.scale)) prim.scale = p.scale as [number, number, number];
  const color = str(p.color) ?? str(glow.color) ?? str(mat.color);
  if (color) prim.color = color;
  const roughness = num(p.roughness) ?? num(mat.roughness);
  if (roughness !== undefined) prim.roughness = roughness;
  const metalness = num(p.metalness) ?? num(mat.metalness);
  if (metalness !== undefined) prim.metalness = metalness;
  if (p.reflective === true) prim.reflective = true;
  const emissive = str(mat.emissive) ?? str(glow.color);
  if (emissive) prim.emissive = emissive;
  // glow intensity → emissive intensity; pulse handled in viewer by emissive base
  const ei = num(mat.emissiveIntensity);
  const gi = num(glow.intensity);
  if (ei !== undefined) prim.emissiveIntensity = ei;
  else if (gi !== undefined) prim.emissiveIntensity = gi;
  for (const k of ['width', 'height', 'radius', 'radiusTop', 'radiusBottom', 'notchAngle'] as const) {
    const val = num(p[k]);
    if (val !== undefined) prim[k] = val;
  }
  return prim;
}

function bakeGeometry(g: {
  positions?: ArrayLike<number>;
  normals?: ArrayLike<number>;
  petalUv?: ArrayLike<number>;
  indices?: ArrayLike<number>;
}): BakedGeometry {
  return {
    positions: toNumArr(g.positions),
    normals: toNumArr(g.normals),
    uv: toNumArr(g.petalUv),
    indices: toNumArr(g.indices),
  };
}

// ── POND: lotus-pond.holo ─────────────────────────────────────────────────────
function bakePond(ast: unknown, name: string): BakedScene {
  const compiler = new R3FCompiler();
  const tree = compiler.compileComposition(ast as Parameters<typeof compiler.compileComposition>[0]);
  const lotuses: BakedLotusInstance[] = [];
  const scaffold: BakedPrimitive[] = [];
  const animatedGroups: BakedAnimatedGroup[] = [];
  const timeline: BakedTimelineKey[] = [];
  let petalGeometry: BakedGeometry | undefined;

  const topChildren = (tree?.children ?? []) as R3FNode[];

  for (const node of topChildren) {
    const p = node.props as Record<string, unknown>;
    if (p.__compiledMaterial) {
      // a @botanical_lotus instance
      if (!petalGeometry && p.__petalGeometry) {
        petalGeometry = bakeGeometry(p.__petalGeometry as Parameters<typeof bakeGeometry>[0]);
      }
      lotuses.push({
        id: node.id ?? `lotus-${lotuses.length}`,
        position: asTriple(p.position, [0, 0, 0]),
        rotation: asTriple(p.rotation, [0, 0, 0]),
        scale: typeof p.scale === 'number' ? (p.scale as number) : 1,
        growthCap: typeof p.growthCap === 'number' ? (p.growthCap as number) : 1,
        placements: (p.__petalPlacements as BakedPetalPlacement[] | undefined) ?? [],
        scene: (p.__lotusScene as Record<string, unknown>) as never,
      });
      // The first lotus carries the pond scaffold (water/pads/stem/leaves).
      const scaffoldNodes = (p.__scaffoldNodes as R3FNode[] | undefined) ?? [];
      if (scaffold.length === 0 && animatedGroups.length === 0) {
        for (const sn of scaffoldNodes) {
          const sp = sn.props as Record<string, unknown>;
          if (sn.type === 'group' && sp.__animatedTransform) {
            animatedGroups.push({
              position: Array.isArray(sp.position)
                ? (sp.position as [number, number, number])
                : undefined,
              channels: sp.__animatedTransform as BakedAnimatedChannel[],
              children: (sn.children ?? []).map(bakePrimitive),
            });
          } else if (sn.type === 'mesh') {
            scaffold.push(bakePrimitive(sn));
          }
        }
      }
    } else if (node.type === 'Timeline') {
      for (const entry of node.children ?? []) {
        const ep = entry.props as Record<string, unknown>;
        if (ep.actionKind !== 'animate' || typeof ep.target !== 'string') continue;
        const props = (ep.properties ?? {}) as Record<string, unknown>;
        const value = num(props.value);
        const t = num(ep.time);
        if (value === undefined || t === undefined) continue;
        timeline.push({ t, target: ep.target as string, value });
      }
    } else if (node.type === 'mesh') {
      // generic pond mesh authored directly in the scene (water/pads/reeds/duckweed)
      scaffold.push(bakePrimitive(node));
    }
  }

  return {
    kind: 'pond',
    name,
    source: 'public/scenes/lotus-pond.holo',
    generatedAt: new Date().toISOString(),
    petalGeometry,
    lotuses,
    scaffold,
    animatedGroups,
    timeline,
    camera: { position: [0, 3.02, 6.65], target: [0, 0.52, 0] },
  };
}

// ── PAPER FLOWER: garden.seedable.holo (42 paper-bound petals) ────────────────
function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/^petal\s+p?\d*\.?\d*:?\s*/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bakePaperFlower(
  objects: unknown[],
  name: string,
  audit: PapersStatusDoc | null
): BakedScene {
  const profile = createBotanicalLotusRenderProfile();
  const scene = buildLotusSceneFromComposition(
    objects as Parameters<typeof buildLotusSceneFromComposition>[0],
    profile
  );
  // Compiled petal geometry from the SAME profile (real botanical petal mesh).
  const geo = buildLotusPetalGeometryData(lotusPetalGeometryParamsFromProfile(profile));
  const petalGeometry = bakeGeometry(geo);

  const health = audit ? deriveLotusHealth(audit) : null;
  const perPaper = health?.perPaper ?? [];

  // Map each paper-bound petal title onto the live audit by normalized title match.
  const paperPetals: BakedPaperPetal[] = scene.petals.map((pt) => {
    const nt = normalizeTitle(pt.title);
    let match = perPaper.find((pp) => {
      const ppn = normalizeTitle(pp.title);
      return ppn && (nt.includes(ppn) || ppn.includes(nt));
    });
    // Targeted aliases for titles whose audit name differs from the .holo label.
    if (!match) {
      if (nt.includes('trust by construction')) {
        match = perPaper.find((pp) => pp.rowId === 'TVCG');
      } else if (nt.includes('ik under contract') || nt.includes('verifiable ik')) {
        match = perPaper.find((pp) => pp.rowId === '7');
      } else if (nt.includes('cael')) {
        match = perPaper.find((pp) => pp.title.toLowerCase() === 'cael');
      }
    }
    return {
      index: pt.index,
      ring: pt.ring,
      ringIndex: pt.ringIndex,
      angle: pt.angle,
      radius: pt.radius,
      height: pt.height,
      color: pt.color,
      label: pt.label,
      title: pt.title,
      bloomAuthored: pt.bloom,
      bloomHealth: match ? match.bloom : null,
      health: match ? match.health : null,
      retired: match ? match.retired : false,
      failing: match ? match.failing : null,
      rowId: match ? match.rowId : null,
    };
  });

  return {
    kind: 'paper-flower',
    name,
    source: 'public/scenes/garden.seedable.holo',
    generatedAt: new Date().toISOString(),
    petalGeometry,
    paperPetals,
    center: {
      seedPod: scene.colors.seed_pod,
      seedPodRim: scene.colors.seed_pod_rim,
      stamen: scene.colors.stamen,
      stamenTip: scene.colors.stamen_tip,
      stamenCount: scene.stamen_filament_count,
    },
    colors: {
      water: scene.colors.water,
      leaf: scene.colors.leaf,
      leafDark: scene.colors.leaf_dark,
    },
    aggregate: health?.aggregate,
    aggregateBloom: health?.aggregateBloom,
    camera: { position: [0, 1.5, 9], target: [0, 0.5, 0] },
  };
}

// ── SYMBOLIC: garden.refreshed.holo (root/stalk/center/petals, glow-readable) ──
function bakeSymbolic(ast: unknown, objects: unknown[], name: string): BakedScene {
  const compiler = new R3FCompiler();
  const tree = compiler.compileComposition(ast as Parameters<typeof compiler.compileComposition>[0]);
  const nodes: BakedPrimitive[] = [];
  for (const node of (tree?.children ?? []) as R3FNode[]) {
    if (node.type !== 'mesh') continue;
    const prim = bakePrimitive(node);
    // carry the object name through so the viewer can label / arrange symbolically
    (prim as BakedPrimitive & { name?: string }).name = node.id;
    nodes.push(prim);
  }
  return {
    kind: 'symbolic',
    name,
    source: 'public/scenes/garden.refreshed.holo',
    generatedAt: new Date().toISOString(),
    nodes,
    camera: { position: [0, 4, 12], target: [0, 3, 0] },
  };
}

function loadAudit(): PapersStatusDoc | null {
  if (!existsSync(AUDIT_PATH)) {
    console.warn('  ⚠ papers-status.json missing — paper flower will have no health overlay');
    return null;
  }
  try {
    return JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as PapersStatusDoc;
  } catch (e) {
    console.warn('  ⚠ papers-status.json unreadable:', (e as Error).message);
    return null;
  }
}

function compileScene(file: string): { ast: unknown; objects: unknown[] } {
  const src = readFileSync(join(SCENES_DIR, file), 'utf-8');
  const parsed = parseHolo(src);
  if (!parsed.success || !parsed.ast) {
    throw new Error(`${file} did not parse: ${JSON.stringify(parsed.errors?.[0] ?? 'unknown')}`);
  }
  const objects = (parsed.ast as { objects?: unknown[] }).objects ?? [];
  return { ast: parsed.ast, objects };
}

function main(): void {
  if (!existsSync(SCENES_DIR)) mkdirSync(SCENES_DIR, { recursive: true });
  const audit = loadAudit();

  const baked: { name: string; file: string; kind: string }[] = [];

  // 1) pond (default)
  {
    const { ast } = compileScene('lotus-pond.holo');
    const scene = bakePond(ast, 'pond');
    const out = join(SCENES_DIR, 'lotus-pond.baked.json');
    writeFileSync(out, JSON.stringify(scene));
    console.log(`  ✓ pond → lotus-pond.baked.json (${scene.lotuses?.length ?? 0} lotuses, ${scene.scaffold?.length ?? 0} scaffold, geom ${(scene.petalGeometry?.positions.length ?? 0) / 3} verts)`);
    baked.push({ name: 'pond', file: 'lotus-pond.baked.json', kind: scene.kind });
  }

  // 2) paper flower (seedable, paper-bound, honest bloom)
  {
    const { objects } = compileScene('garden.seedable.holo');
    const scene = bakePaperFlower(objects, 'seedable', audit);
    const wilted = (scene.paperPetals ?? []).filter((pp) => pp.bloomHealth === 'wilted');
    const out = join(SCENES_DIR, 'garden.seedable.baked.json');
    writeFileSync(out, JSON.stringify(scene));
    console.log(`  ✓ seedable → garden.seedable.baked.json (${scene.paperPetals?.length ?? 0} petals, ${wilted.length} health-wilted: ${wilted.map((w) => `${w.rowId}:${w.title.replace(/^Petal\s+\S+\s*/, '').slice(0, 28)}`).join(' | ')})`);
    baked.push({ name: 'seedable', file: 'garden.seedable.baked.json', kind: scene.kind });
  }

  // 3) symbolic (refreshed baseline)
  {
    const { ast, objects } = compileScene('garden.refreshed.holo');
    const scene = bakeSymbolic(ast, objects, 'refreshed');
    const out = join(SCENES_DIR, 'garden.refreshed.baked.json');
    writeFileSync(out, JSON.stringify(scene));
    console.log(`  ✓ refreshed → garden.refreshed.baked.json (${scene.nodes?.length ?? 0} nodes)`);
    baked.push({ name: 'refreshed', file: 'garden.refreshed.baked.json', kind: scene.kind });
  }

  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), scenes: baked }, null, 2) + '\n'
  );
  console.log(`\nBaked ${baked.length} lotus scenes → public/scenes/*.baked.json`);
}

main();
