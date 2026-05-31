// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — NATIVE Canvas2D build (compiled from traits, not hand-written)
//
// Unlike gold-2d-build.mjs (which HAND-WALKS the scene and HAND-WRITES the game),
// this drives the SAME gold-vault-game.holo through the new trait-driven
// Canvas2DGameCompiler (packages/core/src/compiler/Canvas2DGameCompiler.ts):
// gameplay is DERIVED from traits — @controllable=player, @grabbable=collectible,
// @collidable=hazard, @dialogue=goal, environment.gravity, spatial_group origins=tiers.
//
//   node_modules/.bin/tsx examples/gold-game/gold-canvas2d-build.mjs
// Outputs: examples/gold-game/2d-build-native/{index.html, START-HERE.txt}
//          examples/gold-game/GOLD-VAULT-CANVAS2D-receipt.json
//
// Gate 1 of the native-2D-compiler build. Emits to a SEPARATE dir so the
// existing hand-written 2d-build (gate-30 / modality-verify green) is untouched
// until this compiled build is proven and promoted.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.env.HOLOSCRIPT_REPO || process.env.HOLOSCRIPT_ROOT || join(here, '..', '..'));
const imp = (p) => import(pathToFileURL(p).href);
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));
const core = await imp(join(repo, 'packages', 'core', 'dist', 'index.js'));
const { compileCanvas2DGame } = await imp(
  join(repo, 'packages', 'core', 'src', 'compiler', 'Canvas2DGameCompiler.ts')
);
const parseHolo = core.parseHolo;

const HOLO = join(here, 'gold-vault-game.holo');
const OUT = join(here, '2d-build-native');
const HASH_MODE = 'sha256';
const prop = (node, key, dflt) => {
  const p = (node?.properties || []).find((x) => x.key === key);
  return p ? p.value : dflt;
};

// ── Parse the real .holo (Gate 0 artifact) ───────────────────────────────────
const src = readFileSync(HOLO, 'utf8');
const r = parseHolo(src);
if (!r.success || (r.errors || []).length) { console.error('PARSE FAILED', r.errors); process.exit(1); }
const ast = r.ast || r.composition || r;
const templates = Object.fromEntries((ast.templates || []).map((t) => [t.name, t]));

// ── Normalize AST → the flat shape Canvas2DGameCompiler consumes ─────────────
// (properties → direct fields; template traits resolved per object).
const normTemplates = (ast.templates || []).map((t) => ({
  name: t.name,
  traits: (t.traits || []).map((tr) => ({ name: tr.name, config: tr.config || {} })),
}));
const normGroups = (ast.spatialGroups || []).map((g) => ({
  name: g.name,
  origin: prop(g, 'origin', [0, 0, 0]),
  objects: (g.objects || []).map((o) => ({
    name: o.name,
    template: o.template,
    position: prop(o, 'position', [0, 0, 0]),
    color: prop(o, 'color', '#cccccc'),
    state: o.state || {},
    traits: (o.traits || []).map((tr) => ({ name: tr.name, config: tr.config || {} })),
  })),
}));
const normComposition = {
  name: ast.name || 'GOLD — The Vault',
  templates: normTemplates,
  spatialGroups: normGroups,
  environment: { gravity: prop(ast.environment, 'gravity', [0, -9.81, 0]) },
};

// ── Build the embedded SCENE + deterministic digest (same as the 3D/2D builds) ─
const add = (arr, v) => (Array.isArray(v) ? v : [0, 0, 0]).map((n, i) => n + (arr[i] || 0));
const meshes = [];
for (const g of ast.spatialGroups || []) {
  const origin = prop(g, 'origin', [0, 0, 0]);
  for (const o of g.objects || []) {
    const tpl = templates[o.template] || {};
    const geometry = prop(o, 'geometry', prop(tpl, 'geometry', 'box'));
    const scale = prop(o, 'scale', prop(tpl, 'scale', [1, 1, 1]));
    const color = prop(o, 'color', '#cccccc');
    const pos = add(origin, prop(o, 'position', [0, 0, 0]));
    const st = o.state || {};
    meshes.push({ name: o.name, region: g.name, geometry, position: pos, scale, color,
      tier: st.tier || null, title: st.title || null, inhabited_by: st.inhabited_by || null });
  }
}
const regions = (ast.spatialGroups || []).map((g) => ({ name: g.name, origin: prop(g, 'origin', [0, 0, 0]) }));
const scene = { title: ast.name || 'GOLD — The Vault', meshes, regions };
const sceneJson = JSON.stringify(scene);

const colInt = (h) => parseInt((h || '#000000').replace('#', '').slice(0, 6), 16) || 0;
const sceneSolver = {
  fieldNames: ['scene'],
  getField: () => Float32Array.from(
    meshes.flatMap((m) => [...m.position.map((n) => Number(n.toFixed(4))), colInt(m.color), m.geometry.length]),
  ),
};
const sceneDigest = computeStateDigest(sceneSolver, HASH_MODE);

// ── Compile the composition → playable HTML (trait-driven) ───────────────────
const html = compileCanvas2DGame(normComposition, { title: 'THE GOLD GAME — The Vault' }, sceneJson);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, 'START-HERE.txt'),
  'THE GOLD GAME — NATIVE Canvas2D build (compiled from HoloScript traits)\n' +
  'Double-click index.html (offline, no install).\n' +
  'A/D or arrows move, SPACE/W jump, M mute, R restart.\n' +
  'Generated by Canvas2DGameCompiler from gold-vault-game.holo — gameplay derived from @controllable/@grabbable/@collidable/@dialogue.\n');

const receipt = {
  modality: '2d-native-canvas',
  name: 'THE GOLD GAME — native Canvas2D build (compiled from traits)',
  source: 'examples/gold-game/gold-vault-game.holo',
  builder: 'examples/gold-game/gold-canvas2d-build.mjs',
  compiler: 'packages/core/src/compiler/Canvas2DGameCompiler.ts (compileCanvas2DGame)',
  artifact: 'examples/gold-game/2d-build-native/index.html',
  contract: { algorithm: HASH_MODE, sceneDigest, meshCount: meshes.length },
  honestScope:
    'Gate 1 of the native 2D compiler. The game is GENERATED from the parsed composition: ' +
    'Canvas2DGameCompiler classifies each entity by its effective traits (player=@controllable, ' +
    'collectible=@grabbable, hazard=@collidable-only, goal=@dialogue, npc=@ai_agent), reads ' +
    'environment.gravity, and treats spatial_group origins as ascending tier platforms. The runtime ' +
    'engine is generic and consumes the derived GAME spec — it is NOT a 1:1 hardcode of this scene ' +
    '(proven by Canvas2DGameCompiler.test.ts on a second composition). NOT yet wired into ' +
    'CompilerBase/RBAC/MCP (later gate); the embedded SCENE + sceneDigest match the hand-written ' +
    'build so this can replace it once the gate is verified by /journalist.',
  builtAt: new Date().toISOString(),
};
writeFileSync(join(here, 'GOLD-VAULT-CANVAS2D-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');

console.log('NATIVE CANVAS2D BUILD EMITTED ->', join(OUT, 'index.html'));
console.log('  meshes=' + meshes.length, 'sceneDigest=' + sceneDigest);
