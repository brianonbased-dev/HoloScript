/**
 * generate-models.ts — HoloScript GLTFPipeline Asset Generator
 *
 * Compiles HoloComposition objects to .glb files for the Play Mode 3D scene builder.
 * This is pure dogfooding: HoloScript generates its own assets.
 *
 * Usage: npx tsx scripts/generate-models.ts
 * Output: public/models/*.glb
 */

import * as fs from 'fs';
import * as path from 'path';
import { GLTFPipeline } from '../../core/src/compiler/GLTFPipeline';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectProperty,
} from '../../core/src/parser/HoloCompositionTypes';

// ─── Helpers ────────────────────────────────────────────────────────────────

function prop(key: string, value: any): HoloObjectProperty {
  return { type: 'ObjectProperty', key, value };
}

function obj(
  name: string,
  geometry: string,
  position: number[],
  scale: number[],
  color: string,
  extra: Record<string, any> = {},
  children?: HoloObjectDecl[]
): HoloObjectDecl {
  const properties: HoloObjectProperty[] = [
    prop('geometry', geometry),
    prop('position', position),
    prop('scale', scale),
    prop('color', color),
  ];
  for (const [k, v] of Object.entries(extra)) {
    properties.push(prop(k, v));
  }
  return {
    type: 'Object',
    name,
    properties,
    traits: [],
    children,
  };
}

function composition(name: string, objects: HoloObjectDecl[]): HoloComposition {
  return {
    type: 'Composition',
    name,
    objects,
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };
}

// ─── Model Definitions ─────────────────────────────────────────────────────

const MODELS: Record<string, HoloComposition> = {
  // ── Tree ──────────────────────────────────────────────────────────────
  tree: composition('Tree', [
    // Trunk
    obj('trunk', 'cylinder', [0, 0.6, 0], [0.25, 1.2, 0.25], '#6b4226', {
      roughness: 0.9,
      metallic: 0,
    }),
    // Lower canopy (large)
    obj('canopy_lower', 'sphere', [0, 1.6, 0], [1.6, 1.4, 1.6], '#2d8a4e', {
      roughness: 0.7,
      metallic: 0,
    }),
    // Middle canopy
    obj('canopy_mid', 'sphere', [0, 2.2, 0], [1.3, 1.2, 1.3], '#34a853', {
      roughness: 0.7,
      metallic: 0,
    }),
    // Top canopy (small)
    obj('canopy_top', 'sphere', [0, 2.7, 0], [0.9, 0.9, 0.9], '#4caf50', {
      roughness: 0.6,
      metallic: 0,
    }),
  ]),

  // ── House ─────────────────────────────────────────────────────────────
  house: composition('House', [
    // Walls
    obj('walls', 'box', [0, 0.75, 0], [2, 1.5, 1.8], '#e8d4b0', {
      roughness: 0.85,
      metallic: 0,
    }),
    // Roof
    obj('roof', 'cone', [0, 1.9, 0], [2.4, 1.0, 2.2], '#8b4513', {
      roughness: 0.8,
      metallic: 0,
    }),
    // Door
    obj('door', 'box', [0, 0.5, 0.91], [0.5, 1.0, 0.05], '#5c3317', {
      roughness: 0.7,
      metallic: 0,
    }),
    // Window left
    obj('window_left', 'box', [-0.6, 1.0, 0.91], [0.35, 0.35, 0.02], '#87ceeb', {
      emissive: '#4488cc',
      metallic: 0,
      roughness: 0.1,
    }),
    // Window right
    obj('window_right', 'box', [0.6, 1.0, 0.91], [0.35, 0.35, 0.02], '#87ceeb', {
      emissive: '#4488cc',
      metallic: 0,
      roughness: 0.1,
    }),
    // Chimney
    obj('chimney', 'box', [0.6, 2.1, -0.3], [0.3, 0.6, 0.3], '#8B0000', {
      roughness: 0.9,
      metallic: 0,
    }),
  ]),

  // ── Castle ────────────────────────────────────────────────────────────
  castle: composition('Castle', [
    // Main body
    obj('body', 'box', [0, 1.0, 0], [3, 2.0, 2.5], '#a0a0a0', {
      roughness: 0.85,
      metallic: 0.05,
    }),
    // Tower front-left
    obj('tower_fl', 'cylinder', [-1.5, 1.5, -1.25], [0.5, 3.0, 0.5], '#909090', {
      roughness: 0.8,
      metallic: 0.1,
    }),
    // Tower front-right
    obj('tower_fr', 'cylinder', [1.5, 1.5, -1.25], [0.5, 3.0, 0.5], '#909090', {
      roughness: 0.8,
      metallic: 0.1,
    }),
    // Tower back-left
    obj('tower_bl', 'cylinder', [-1.5, 1.5, 1.25], [0.5, 3.0, 0.5], '#909090', {
      roughness: 0.8,
      metallic: 0.1,
    }),
    // Tower back-right
    obj('tower_br', 'cylinder', [1.5, 1.5, 1.25], [0.5, 3.0, 0.5], '#909090', {
      roughness: 0.8,
      metallic: 0.1,
    }),
    // Roof FL
    obj('roof_fl', 'cone', [-1.5, 3.3, -1.25], [0.7, 0.8, 0.7], '#4a1a8a', {
      roughness: 0.5,
      metallic: 0.2,
    }),
    // Roof FR
    obj('roof_fr', 'cone', [1.5, 3.3, -1.25], [0.7, 0.8, 0.7], '#4a1a8a', {
      roughness: 0.5,
      metallic: 0.2,
    }),
    // Roof BL
    obj('roof_bl', 'cone', [-1.5, 3.3, 1.25], [0.7, 0.8, 0.7], '#4a1a8a', {
      roughness: 0.5,
      metallic: 0.2,
    }),
    // Roof BR
    obj('roof_br', 'cone', [1.5, 3.3, 1.25], [0.7, 0.8, 0.7], '#4a1a8a', {
      roughness: 0.5,
      metallic: 0.2,
    }),
    // Gate
    obj('gate', 'box', [0, 0.6, -1.26], [0.8, 1.2, 0.05], '#c9a832', {
      emissive: '#b8960f',
      metallic: 0.8,
      roughness: 0.3,
    }),
    // Banner
    obj('banner', 'box', [0, 1.8, -1.26], [0.6, 0.4, 0.02], '#b22222', {
      roughness: 0.9,
      metallic: 0,
    }),
  ]),

  // ── Snowman ───────────────────────────────────────────────────────────
  snowman: composition('Snowman', [
    // Bottom sphere
    obj('body_bottom', 'sphere', [0, 0.5, 0], [1.0, 1.0, 1.0], '#f5f5f5', {
      roughness: 0.7,
      metallic: 0,
    }),
    // Middle sphere
    obj('body_middle', 'sphere', [0, 1.2, 0], [0.7, 0.7, 0.7], '#f0f0f0', {
      roughness: 0.7,
      metallic: 0,
    }),
    // Head
    obj('head', 'sphere', [0, 1.75, 0], [0.5, 0.5, 0.5], '#fafafa', {
      roughness: 0.6,
      metallic: 0,
    }),
    // Nose (carrot)
    obj('nose', 'cone', [0, 1.75, 0.3], [0.08, 0.3, 0.08], '#ff6600', {
      roughness: 0.5,
      metallic: 0,
    }),
    // Left eye
    obj('eye_left', 'sphere', [-0.12, 1.85, 0.22], [0.06, 0.06, 0.06], '#1a1a1a', {
      roughness: 0.2,
      metallic: 0,
    }),
    // Right eye
    obj('eye_right', 'sphere', [0.12, 1.85, 0.22], [0.06, 0.06, 0.06], '#1a1a1a', {
      roughness: 0.2,
      metallic: 0,
    }),
    // Hat brim
    obj('hat_brim', 'cylinder', [0, 2.0, 0], [0.4, 0.05, 0.4], '#1a1a1a', {
      roughness: 0.3,
      metallic: 0,
    }),
    // Hat top
    obj('hat_top', 'cylinder', [0, 2.2, 0], [0.25, 0.35, 0.25], '#1a1a1a', {
      roughness: 0.3,
      metallic: 0,
    }),
    // Button 1
    obj('button1', 'sphere', [0, 1.35, 0.34], [0.06, 0.06, 0.06], '#1a1a1a', {
      roughness: 0.2,
      metallic: 0,
    }),
    // Button 2
    obj('button2', 'sphere', [0, 1.15, 0.34], [0.06, 0.06, 0.06], '#1a1a1a', {
      roughness: 0.2,
      metallic: 0,
    }),
    // Button 3
    obj('button3', 'sphere', [0, 0.95, 0.34], [0.06, 0.06, 0.06], '#1a1a1a', {
      roughness: 0.2,
      metallic: 0,
    }),
  ]),

  // ── Rocket ────────────────────────────────────────────────────────────
  rocket: composition('Rocket', [
    // Body
    obj('body', 'cylinder', [0, 1.2, 0], [0.6, 2.0, 0.6], '#e0e0e0', {
      roughness: 0.15,
      metallic: 0.9,
    }),
    // Nose cone
    obj('nose', 'cone', [0, 2.5, 0], [0.6, 0.8, 0.6], '#cc2222', {
      roughness: 0.3,
      metallic: 0.5,
    }),
    // Fin 1
    obj('fin1', 'box', [0, 0.3, 0.35], [0.06, 0.6, 0.5], '#cc2222', {
      roughness: 0.4,
      metallic: 0.3,
    }),
    // Fin 2
    obj('fin2', 'box', [0.3, 0.3, -0.18], [0.5, 0.6, 0.06], '#cc2222', {
      roughness: 0.4,
      metallic: 0.3,
    }),
    // Fin 3
    obj('fin3', 'box', [-0.3, 0.3, -0.18], [0.5, 0.6, 0.06], '#cc2222', {
      roughness: 0.4,
      metallic: 0.3,
    }),
    // Engine bell
    obj('engine', 'cylinder', [0, 0.05, 0], [0.35, 0.15, 0.35], '#ff6600', {
      emissive: '#ff4400',
      roughness: 0.2,
      metallic: 0.6,
    }),
    // Window
    obj('window', 'sphere', [0, 1.8, 0.31], [0.2, 0.2, 0.05], '#4488ff', {
      emissive: '#2266cc',
      roughness: 0.0,
      metallic: 0.1,
    }),
  ]),

  // ── Crystal ───────────────────────────────────────────────────────────
  crystal: composition('Crystal', [
    // Main crystal body (upper cone)
    obj('crystal_upper', 'cone', [0, 0.7, 0], [0.6, 1.4, 0.6], '#9966cc', {
      roughness: 0.05,
      metallic: 0.3,
      emissive: '#6633aa',
    }),
    // Lower inverted cone (reflected)
    obj('crystal_lower', 'cone', [0, -0.15, 0], [0.5, 0.3, 0.5], '#7744bb', {
      roughness: 0.05,
      metallic: 0.3,
      emissive: '#5522aa',
    }),
    // Side shard 1
    obj('shard1', 'cone', [0.35, 0.3, 0.2], [0.2, 0.7, 0.2], '#aa77dd', {
      roughness: 0.08,
      metallic: 0.25,
      emissive: '#7744bb',
    }),
    // Side shard 2
    obj('shard2', 'cone', [-0.3, 0.25, -0.15], [0.15, 0.5, 0.15], '#bb88ee', {
      roughness: 0.08,
      metallic: 0.25,
      emissive: '#7744bb',
    }),
    // Base
    obj('base', 'cylinder', [0, 0.02, 0], [0.8, 0.04, 0.8], '#555555', {
      roughness: 0.7,
      metallic: 0.4,
    }),
  ]),
};

// ─── Generate ───────────────────────────────────────────────────────────────

const outDir = path.resolve(__dirname, '..', 'public', 'models');
fs.mkdirSync(outDir, { recursive: true });

const pipeline = new GLTFPipeline({ format: 'glb' });

console.log('🔮 HoloScript GLTFPipeline — Generating Play Mode assets\n');

for (const [name, comp] of Object.entries(MODELS)) {
  try {
    const result = pipeline.compile(comp, undefined as any);
    if (result.binary) {
      const outPath = path.join(outDir, `${name}.glb`);
      fs.writeFileSync(outPath, result.binary);
      const kb = (result.binary.byteLength / 1024).toFixed(1);
      console.log(
        `  ✅ ${name}.glb — ${kb} KB ` +
          `(${result.stats.meshCount} meshes, ${result.stats.materialCount} materials, ` +
          `${result.stats.totalVertices} verts, ${result.stats.totalTriangles} tris)`
      );
    } else {
      console.error(`  ❌ ${name} — no binary output`);
    }
  } catch (err: unknown) {
    console.error(`  ❌ ${name} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n📁 Output: ${outDir}`);
console.log('Done!');
