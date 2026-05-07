/**
 * Cross-Target Compilation Benchmark
 *
 * Measures trait compilation time across all registered compiler targets
 * for a complex scene (1000+ objects, 50+ trait types).
 */

import { Bench } from 'tinybench';
import {
  HoloScriptPlusParser,
  type HoloComposition,
} from '@holoscript/core';

// =============================================================================
// SCENE FIXTURE GENERATOR
// =============================================================================

const TRAIT_TEMPLATES = [
  '@transform { position: [${x}, ${y}, ${z}], scale: [1,1,1] }',
  '@material { preset: "pbr", metallic: 0.5, roughness: 0.3 }',
  '@shader { preset: "hologram" }',
  '@physics { mass: 1.0, collider: "box" }',
  '@animation { clip: "idle", loop: true }',
  '@light { type: "point", intensity: 1.0, color: "#ffffff" }',
  '@audio { source: "ambient.mp3", spatial: true }',
  '@network { role: "interactive", authoritative: false }',
  '@ui { canvas: "hud", anchor: "bottom-left" }',
  '@lidar { resolution: 0.01, range: 10.0 }',
  '@geospatial { lat: 40.7128, lon: -74.0060 }',
  '@digital_twin { source: "mqtt://sensor/temperature" }',
  '@avatar { vrm: "default.vrm", lipSync: true }',
  '@hologram { quilt: "mvhevc", views: 45 }',
  '@compute { dispatch: [64, 1, 1] }',
  '@gpu_particle { count: 10000, spawnRate: 100 }',
  '@billboard { alwaysFaceCamera: true }',
  '@snn { neurons: 256, threshold: 0.5 }',
  '@web_surface { url: "https://example.com", width: 800, height: 600 }',
  '@xr_anchor { persistent: true, cloudSync: true }',
  '@ semantic { category: "furniture", affordances: ["sittable", "movable"] }',
  '@behavior { tree: "patrol", patrolRadius: 5.0 }',
  '@lipsync { visemeSet: "ovr", blendshapes: 15 }',
  '@haptic { pattern: "click", intensity: 0.8 }',
  '@ gesture { recognizer: "hand", twoHanded: false }',
  '@eye_tracking { calibration: "auto", foveated: true }',
  '@voice { wakeWord: "Hey Holo", language: "en-US" }',
  '@npc { dialogue: "merchant", mood: "friendly" }',
  '@inventory { maxSlots: 20, stackable: true }',
  '@quest { id: "q001", stage: 3, prerequisites: ["q000"] }',
  '@weather { type: "rain", intensity: 0.5 }',
  '@time_of_day { cycle: 24, current: 14.5 }',
  '@occlusion { quality: "high", dynamic: true }',
  '@reflection { probe: "realtime", resolution: 512 }',
  '@shadow { cascadeCount: 4, maxDistance: 50 }',
  '@lod { distances: [10, 25, 50], meshes: ["lod0", "lod1", "lod2"] }',
  '@navmesh { agentHeight: 1.8, agentRadius: 0.3 }',
  '@path { waypoints: 8, closed: true }',
  '@spawner { template: "enemy_basic", maxCount: 20, rate: 2 }',
  '@trigger { shape: "box", onEnter: "activateDoor" }',
  '@sensor { type: "proximity", range: 3.0, layer: "player" }',
  '@door { state: "closed", keyRequired: false }',
  '@container { capacity: 50, filter: ["weapon", "ammo"] }',
  '@crafting { recipes: ["sword_iron", "potion_heal"] }',
  '@merchant { currency: "gold", restockInterval: 300 }',
  '@damage { health: 100, armor: 5, resistances: ["fire"] }',
  '@status_effect { active: ["poison", "slow"] }',
  '@team { faction: "alliance", role: "tank" }',
  '@ leaderboard { scope: "global", metric: "score" }',
  '@achievement { id: "first_kill", unlocked: false }',
  '@analytics { event: "interaction", sampling: 0.1 }',
];

function generateComplexScene(): string {
  const lines: string[] = [];
  lines.push('world ComplexBenchmarkScene {');
  lines.push('  dimensions: [1000, 1000, 1000]');
  lines.push('  gravity: [0, -9.81, 0]');
  lines.push('');

  // Generate 1024 objects with rotating trait sets
  const objectCount = 1024;
  for (let i = 0; i < objectCount; i++) {
    const x = (i % 32) * 30 - 480;
    const z = Math.floor(i / 32) * 30 - 480;
    const y = Math.sin(i * 0.1) * 10;

    // Each object gets 4-8 traits from the pool
    const traitCount = 4 + (i % 5);
    const traits: string[] = [];
    for (let t = 0; t < traitCount; t++) {
      const template = TRAIT_TEMPLATES[(i + t * 7) % TRAIT_TEMPLATES.length];
      traits.push(template.replace('${x}', String(x)).replace('${y}', String(y)).replace('${z}', String(z)));
    }

    lines.push(`  object bench_obj_${i} {`);
    lines.push(`    geometry: "box"`);
    for (const trait of traits) {
      lines.push(`    ${trait}`);
    }
    lines.push('  }');
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// COMPILER TARGETS
// =============================================================================

// List of compiler modules to benchmark
const TARGET_MODULES = [
  'UnityCompiler',
  'UnrealCompiler',
  'GodotCompiler',
  'R3FCompiler',
  'WebGPUCompiler',
  'BabylonCompiler',
  'OpenXRCompiler',
  'VisionOSCompiler',
  'AndroidXRCompiler',
  'WASMCompiler',
  'URDFCompiler',
  'SDFCompiler',
  'DTDLCompiler',
  'NIRCompiler',
  'USDCompiler',
  'VRChatCompiler',
  'TSLCompiler',
  'Native2DCompiler',
];

// Dynamically import compiler modules
async function loadCompilers() {
  const compilerModule = await import('@holoscript/core');
  const compilers: Record<string, (ast: HoloComposition) => unknown> = {};

  for (const name of TARGET_MODULES) {
    const factory = (compilerModule as Record<string, unknown>)[`create${name}`];
    if (typeof factory === 'function') {
      try {
        const instance = factory();
        if (instance && typeof (instance as { compile?: unknown }).compile === 'function') {
          compilers[name] = (ast: HoloComposition) => (instance as { compile: (ast: HoloComposition) => unknown }).compile(ast);
        }
      } catch {
        // Compiler not available or misconfigured — skip
      }
    }
  }

  return compilers;
}

// =============================================================================
// BENCHMARK
// =============================================================================

export async function runCrossTargetBench() {
  const parser = new HoloScriptPlusParser();
  const source = generateComplexScene();
  const ast = parser.parse(source).ast as HoloComposition;

  // Verify scene complexity
  const objectCount = ast.objects?.length ?? 0;
  const traitCount = new Set(
    (ast.objects ?? []).flatMap((o: { traits?: Array<{ kind: string }> }) =>
      (o.traits ?? []).map((t: { kind: string }) => t.kind)
    )
  ).size;
  console.log(`\n📐 Scene: ${objectCount} objects, ${traitCount} unique trait types`);

  const compilers = await loadCompilers();
  const availableTargets = Object.keys(compilers);
  console.log(`🔧 Available compiler targets: ${availableTargets.length} / ${TARGET_MODULES.length}`);

  const bench = new Bench({ time: 500, iterations: 3 });

  for (const [name, compile] of Object.entries(compilers)) {
    bench.add(`compile-${name}-complex`, () => {
      compile(ast);
    });
  }

  await bench.run();

  // Print summary
  console.log('\n📊 Cross-Target Compilation Results:');
  console.log('-'.repeat(70));
  for (const task of bench.tasks) {
    if (!task.result) continue;
    const ms = task.result.mean * 1000;
    const hz = task.result.hz;
    console.log(
      `  ${task.name.padEnd(45)} ${hz.toFixed(1).padStart(8)} ops/s  (${ms.toFixed(2)}ms ±${(task.result.moe * 100).toFixed(1)}%)`
    );
  }

  return bench;
}
