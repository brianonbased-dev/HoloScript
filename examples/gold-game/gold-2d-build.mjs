// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — RETRO 2D build (same .holo, second modality).
//
// Walks the SAME parsed gold-vault-game.holo the 3D Drive build (drive-build.mjs)
// walks, and emits a self-contained RETRO 2D build: a low-res pixel HTML5 canvas
// (NES-ish 320x288, nearest-neighbor upscale, limited palette, scanlines) that
// opens by double-clicking index.html (offline, no install). One .holo -> two
// modalities (D.007: one source -> any device). The scene digest is computed via
// the REAL packages/engine computeStateDigest so the 2D and 3D builds provably
// derive from the identical source scene.
//
//   node_modules/.bin/tsx examples/gold-game/gold-2d-build.mjs
// Outputs: examples/gold-game/2d-build/{index.html, START-HERE.txt}
//          examples/gold-game/GOLD-VAULT-2D-receipt.json
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));
const core = await imp(join(repo, 'packages', 'core', 'dist', 'index.js'));
const parseHolo = core.parseHolo;

const HOLO = join(here, 'gold-vault-game.holo');
const OUT = join(here, '2d-build');
const HASH_MODE = 'sha256';
const prop = (node, key, dflt) => {
  const p = (node.properties || []).find((x) => x.key === key);
  return p ? p.value : dflt;
};

// ── 1. Parse the real .holo (same Gate 0 artifact the 3D build uses) ─────────
const src = readFileSync(HOLO, 'utf8');
const r = parseHolo(src);
if (!r.success || (r.errors || []).length) { console.error('PARSE FAILED', r.errors); process.exit(1); }
const ast = r.ast || r.composition || r;
const templates = Object.fromEntries((ast.templates || []).map((t) => [t.name, t]));

// ── 2. Walk composition -> flat scene (SAME extraction as drive-build.mjs) ───
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

// ── 3. Deterministic scene digest via the REAL contract fn (shared with 3D) ──
// Encode the scene numerically so the SAME .holo always yields the SAME digest.
const colInt = (h) => parseInt((h || '#000000').replace('#', '').slice(0, 6), 16) || 0;
const sceneSolver = {
  fieldNames: ['scene'],
  getField: () => Float32Array.from(
    meshes.flatMap((m) => [...m.position.map((n) => Number(n.toFixed(4))), colInt(m.color), m.geometry.length]),
  ),
};
const sceneDigest = computeStateDigest(sceneSolver, HASH_MODE);

// ── 4. The retro 2D renderer (pure canvas, inlined, works on file://) ────────
const html = `<!doctype html><html><head><meta charset="utf-8">
<title>THE GOLD GAME — 2D</title>
<style>
  html,body{margin:0;height:100%;background:#06060c;overflow:hidden;
    image-rendering:pixelated;image-rendering:crisp-edges;}
  #c{position:absolute;inset:0;margin:auto;image-rendering:pixelated;
    width:100vmin;height:90vmin;background:#06060c;}
  #t{position:absolute;top:6px;width:100%;text-align:center;color:#ffe9a0;
    font:bold 13px/1.2 monospace;letter-spacing:2px;text-shadow:2px 2px 0 #000;}
</style></head><body>
<div id="t">THE GOLD GAME &mdash; THE VAULT &nbsp;(retro 2D)</div>
<canvas id="c" width="320" height="288"></canvas>
<script>
const SCENE = ${sceneJson};
const cv = document.getElementById('c'), x = cv.getContext('2d');
x.imageSmoothingEnabled = false;
const W = cv.width, H = cv.height;
// 16-color retro palette; scene colors snap to nearest for authenticity.
const PAL = ['#06060c','#1a1a2e','#3a2e38','#5e7496','#3a6ea5','#a55a3a','#8a2a2a',
  '#cd7f32','#d4af37','#ffe9a0','#b9f2ff','#7a5a8a','#2e5e3a','#caa472','#ffffff','#9aa0b0'];
const hx = (h)=>{h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};
const PALr = PAL.map(hx);
function snap(c){const [r,g,b]=hx(c);let bi=0,bd=1e9;for(let i=0;i<PALr.length;i++){const [R,G,B]=PALr[i];const d=(r-R)**2+(g-G)**2+(b-B)**2;if(d<bd){bd=d;bi=i;}}return PAL[bi];}
// world -> screen (side-elevation: ascend the tiers; higher tier = higher on screen)
const SX=34, SY=15, CX=W/2, GY=H-26;
const sx=(m)=> CX + m.position[0]*SX - (m.position[2]*2);          // x + slight z parallax
const sy=(m)=> GY - m.position[1]*SY;                              // elevation up
// pixel helpers
const px=(px_,py_,w,h,c)=>{x.fillStyle=c;x.fillRect(px_|0,py_|0,w,h);};
const txt=(s,px_,py_,c)=>{x.fillStyle=c;x.font='6px monospace';x.fillText(s,px_|0,py_|0);};
// region label bands (BRONZE / GOLD / DIAMOND ground platforms)
const bandColor={BronzeValley:'#cd7f32',GoldTerrace:'#d4af37',DiamondPeak:'#b9f2ff'};
const bandName={BronzeValley:'BRONZE VALLEY',GoldTerrace:'GOLD TERRACE',DiamondPeak:'DIAMOND PEAK'};
// sprites (chunky pixel art per entity kind)
function gem(m,t){const s=snap(m.color),X=sx(m),Y=sy(m)+Math.sin(t/20+m.position[0])*2;
  px(X-4,Y,8,2,s);px(X-2,Y-3,4,3,s);px(X-2,Y+2,4,3,s);px(X-3,Y+5,6,1,s);
  px(X-1,Y-2,2,1,'#ffffff'); // glint
  if(m.tier)txt(m.tier[0].toUpperCase(),X-2,Y-5,'#ffe9a0');}
function curator(m){const s=snap(m.color),X=sx(m),Y=sy(m);
  px(X-3,Y-10,6,5,'#f0c890'); // head
  px(X-4,Y-5,8,8,s);          // body
  px(X-4,Y+3,3,4,s);px(X+1,Y+3,3,4,s); // legs
  txt(m.inhabited_by==='agent'?'AI':'YOU',X-6,Y-12,m.inhabited_by==='agent'?'#a55a3a':'#5e7496');}
function monster(m){const s=snap(m.color),X=sx(m),Y=sy(m);
  px(X-5,Y+2,10,4,s);px(X-3,Y-2,6,4,s);px(X-1,Y-6,2,4,s); // spiky tetra
  px(X-3,Y+1,2,2,'#ffe9a0');px(X+1,Y+1,2,2,'#ffe9a0');}   // eyes
function archivist(m){const s=snap(m.color),X=sx(m),Y=sy(m);
  px(X-3,Y-11,6,5,'#d8c8e8');px(X-5,Y-6,10,11,s);px(X-1,Y-9,2,2,'#000'); // robed NPC
  txt('ARCHIVIST',X-14,Y+10,'#7a5a8a');}

function draw(t){
  x.fillStyle='#06060c';x.fillRect(0,0,W,H);
  // sky gradient (banded, retro)
  const sky=['#1a1a2e','#3a2e38','#5e7496'];
  for(let i=0;i<sky.length;i++)px(0,i*10,W,10,sky[sky.length-1-i]);
  // tier platforms + labels, drawn back(top) to front(bottom)
  const ordered=[...SCENE.regions].sort((a,b)=>b.origin[1]-a.origin[1]);
  for(const rg of ordered){const Y=GY - rg.origin[1]*SY + 8;
    px(0,Y,W,3,bandColor[rg.name]||'#caa472');
    px(0,Y+3,W,2,'#3a2e38');
    txt(bandName[rg.name]||rg.name,4,Y-2,bandColor[rg.name]||'#fff');}
  // entities
  for(const m of SCENE.meshes){
    if(m.geometry==='octahedron')gem(m,t);
    else if(m.geometry==='tetrahedron')monster(m);
    else if(m.name==='TheArchivist')archivist(m);
    else if(m.geometry==='humanoid')curator(m);
  }
  // blinking prompt
  if((t>>5)&1)txt('▲ GRADUATE',CX-22,H-6,'#ffe9a0');
  // scanline overlay (retro CRT)
  x.fillStyle='rgba(0,0,0,0.18)';for(let y=0;y<H;y+=2)x.fillRect(0,y,W,1);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
</script></body></html>`;

// ── 5. Emit the build + receipt ──────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, 'START-HERE.txt'),
  'THE GOLD GAME — retro 2D build\nDouble-click index.html (offline, no install).\nSame gold-vault-game.holo as the 3D build; second modality.\n');

const receipt = {
  modality: '2d-retro',
  name: 'THE GOLD GAME — retro 2D build (same .holo, second modality)',
  source: 'examples/gold-game/gold-vault-game.holo',
  builder: 'examples/gold-game/gold-2d-build.mjs',
  artifact: 'examples/gold-game/2d-build/index.html',
  renderer: 'pure HTML5 canvas, 320x288 internal, nearest-neighbor upscale, 16-color palette + scanlines (no external deps; opens on file://)',
  contract: {
    spine: 'REAL computeStateDigest from packages/engine/src/simulation/hashes.ts',
    function: 'computeStateDigest(sceneSolver, hashMode)',
    algorithm: HASH_MODE,
    sceneDigest,
    sceneFields: 'per-mesh [posX,posY,posZ, colorInt, geometryNameLen]',
    meshCount: meshes.length,
    reproducible: 'run `node_modules/.bin/tsx examples/gold-game/gold-2d-build.mjs` to re-derive sceneDigest',
  },
  oneSourceTwoModalities: {
    note: 'this 2D build and the 3D Drive build (drive-build.mjs -> drive-build/index.html) walk the IDENTICAL parsed gold-vault-game.holo; the sceneDigest below is the shared deterministic source-scene fingerprint.',
    holoParsesClean: true,
  },
  honestScope: 'The 2D renderer is a faithful side-elevation projection of the real parsed scene (tiers as ascending platforms, knowledge entries as gems, curators/archivist/collision as sprites) with a retro aesthetic. It is a PRESENTATION modality: it renders the same world the 3D build renders and embeds the same scene; it does not re-implement the curation verb (that is the flagship gates). Full pixel render is verified by opening index.html in a browser (headless screenshot optional); this receipt proves the source scene + digest reproduce deterministically and the artifact is emitted.',
  builtAt: new Date().toISOString(),
};
writeFileSync(join(here, 'GOLD-VAULT-2D-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');

console.log('2D RETRO BUILD EMITTED ->', join(OUT, 'index.html'));
console.log('  meshes=' + meshes.length, 'sceneDigest=' + sceneDigest);
