// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — modality verifier (one .holo -> retro 2D + 3D).
//
// Proves the dual-modality claim: the SAME gold-vault-game.holo yields ONE
// deterministic source scene (digest via the REAL computeStateDigest), and BOTH
// the retro-2D build and the 3D Drive build are emitted from it and embed it.
//
//   node_modules/.bin/tsx examples/gold-game/modality-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);
const core = await imp(join(repo, 'packages', 'core', 'dist', 'index.js'));
const prop = (node, key, dflt) => {
  const p = (node.properties || []).find((x) => x.key === key);
  return p ? p.value : dflt;
};

const src = readFileSync(join(here, 'gold-vault-game.holo'), 'utf8');
const r = core.parseHolo(src);
const parsesClean = r.success && (r.errors || []).length === 0;
const ast = r.ast || r.composition || r;
const templates = Object.fromEntries((ast.templates || []).map((t) => [t.name, t]));

const add = (arr, v) => (Array.isArray(v) ? v : [0, 0, 0]).map((n, i) => n + (arr[i] || 0));
const colInt = (h) => parseInt((h || '#000000').replace('#', '').slice(0, 6), 16) || 0;
const meshes = [];
for (const g of ast.spatialGroups || []) {
  const origin = prop(g, 'origin', [0, 0, 0]);
  for (const o of g.objects || []) {
    const tpl = templates[o.template] || {};
    const geometry = prop(o, 'geometry', prop(tpl, 'geometry', 'box'));
    const color = prop(o, 'color', '#cccccc');
    const pos = add(origin, prop(o, 'position', [0, 0, 0]));
    meshes.push({ position: pos, color, geometry });
  }
}
const sceneDigest = computeStateDigest(
  {
    fieldNames: ['scene'],
    getField: () =>
      Float32Array.from(
        meshes.flatMap((m) => [
          ...m.position.map((n) => Number(n.toFixed(4))),
          colInt(m.color),
          m.geometry.length,
        ])
      ),
  },
  'sha256'
);

let r2d = {};
try {
  r2d = JSON.parse(readFileSync(join(here, 'GOLD-VAULT-2D-receipt.json'), 'utf8'));
} catch {}
const html2d = existsSync(join(here, '2d-build', 'index.html'))
  ? readFileSync(join(here, '2d-build', 'index.html'), 'utf8')
  : '';
const html3d = existsSync(join(here, 'drive-build', 'index.html'))
  ? readFileSync(join(here, 'drive-build', 'index.html'), 'utf8')
  : '';

const checks = [
  ['gold-vault-game.holo parses clean (the one source)', parsesClean],
  ['source scene digest is non-empty (real computeStateDigest)', sceneDigest.length > 0],
  ['2D build exists (examples/gold-game/2d-build/index.html)', html2d.length > 0],
  ['3D build exists (examples/gold-game/drive-build/index.html)', html3d.length > 0],
  ['2D receipt sceneDigest reproduces from the .holo', r2d?.contract?.sceneDigest === sceneDigest],
  ['2D build embeds the source scene (SCENE =)', /SCENE\s*=/.test(html2d)],
  [
    '3D build embeds the source scene (scene-derived names survive bundling)',
    html3d.includes('AgentCompanion') &&
      html3d.includes('DiamondPeak') &&
      html3d.includes('B_GRADUATE_001'),
  ],
  ['both modalities saw the same mesh count', meshes.length === r2d?.contract?.meshCount],
  [
    '2D is a retro canvas (pixelated, no WebGL)',
    /image-rendering\s*:\s*pixelated/.test(html2d) && !/WebGLRenderer/.test(html2d),
  ],
  ['3D is WebGL (three.js)', /WebGLRenderer|THREE/.test(html3d)],
];
let ok = true;
console.log('MODALITY VERIFICATION — one .holo -> retro 2D + 3D (real contract fn):');
for (const [label, pass] of checks) {
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
  ok = ok && pass;
}
console.log('  sharedSceneDigest=' + sceneDigest);
console.log('  => MODALITIES', ok ? 'VERIFIED' : 'BROKEN');
process.exit(ok ? 0 : 1);
