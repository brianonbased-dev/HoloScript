#!/usr/bin/env node
// THE GOLD GAME — Drive build (photoreal from minimal geometric shapes).
// Walks the real parsed .holo and emits a self-contained static web build that
// opens by double-clicking index.html (offline, no install). three.js is
// bundled (IIFE) so it works on file://. Visual target (W.622 VLDL inversion:
// photoreal physics-upward, not asset-downward): glass crystals with emissive
// cores, golden terraces, PMREM environment, bloom, ACES tone-mapping, fog.
//
//   node examples/gold-game/drive-build.mjs
// Outputs: examples/gold-game/drive-build/{index.html, START-HERE.txt}
//          examples/gold-game/GOLD-VAULT-gate1-receipt.json

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const core = await import(pathToFileURL(join(repo, 'packages/core/dist/index.js')).href);
const parseHolo = core.parseHolo;

const HOLO = join(here, 'gold-vault-game.holo');
const OUT = join(here, 'drive-build');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const prop = (node, key, dflt) => {
  const p = (node.properties || []).find((x) => x.key === key);
  return p ? p.value : dflt;
};

// ── 1. Parse the real .holo (Gate 0 artifact) ───────────────────────────────
const src = readFileSync(HOLO, 'utf8');
const r = parseHolo(src);
if (!r.success || (r.errors || []).length) { console.error('PARSE FAILED', r.errors); process.exit(1); }
const ast = r.ast || r.composition || r;
const templates = Object.fromEntries((ast.templates || []).map((t) => [t.name, t]));

// ── 2. Walk composition → flat scene JSON (deterministic order) ──────────────
const geomFor = (g) =>
  ({ humanoid: 'capsule', octahedron: 'octahedron', tetrahedron: 'tetrahedron', sphere: 'sphere' }[g] || 'box');
const add = (arr, v) => (Array.isArray(v) ? v : [0, 0, 0]).map((n, i) => n + (arr[i] || 0));
const meshes = [];
for (const g of ast.spatialGroups || []) {
  const origin = prop(g, 'origin', [0, 0, 0]);
  for (const o of g.objects || []) {
    const tpl = templates[o.template] || {};
    const geometry = geomFor(prop(o, 'geometry', prop(tpl, 'geometry', 'box')));
    const scale = prop(o, 'scale', prop(tpl, 'scale', [1, 1, 1]));
    const color = prop(o, 'color', '#cccccc');
    const pos = add(origin, prop(o, 'position', [0, 0, 0]));
    const st = o.state || {};
    meshes.push({ name: o.name, region: g.name, geometry, position: pos, scale, color,
      tier: st.tier || null, title: st.title || null, inhabited_by: st.inhabited_by || null });
  }
}
const lights = (ast.lights || []).map((l) => ({ name: l.name, type: prop(l, 'type', 'directional'),
  intensity: prop(l, 'intensity', 1), color: prop(l, 'color', '#ffffff'), rotation: prop(l, 'rotation', [-30, 45, 0]) }));
const regions = (ast.spatialGroups || []).map((g) => ({ name: g.name, origin: prop(g, 'origin', [0, 0, 0]) }));
const ambient = prop(ast.environment || {}, 'ambient_light', 0.4);
const fog = prop(ast.environment || {}, 'fog_color', '#caa472');
const scene = { title: ast.name, ambient, fog, meshes, lights, regions };
const sceneJson = JSON.stringify(scene);

// ── 3. App entry — photoreal renderer from minimal primitives ────────────────
const entry = `
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
// Gate 6: the REAL HoloGate intent validator (pure module, bundled by esbuild).
import { validatePortalIntent } from '../../../packages/mcp-server/src/holo-portal-intent.ts';
const SCENE = ${sceneJson};
const C = (h) => new THREE.Color(h);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;            // WebXR: inhabitable on Quest 3 (Gate 5c)
document.body.appendChild(renderer.domElement);
// "Enter VR" button — routes into the headset via the Oculus OpenXR runtime.
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
// gradient sky (no shader — a 1x256 canvas gradient)
const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
const cx = cv.getContext('2d'); const gr = cx.createLinearGradient(0, 0, 0, 256);
gr.addColorStop(0, '#5e7496'); gr.addColorStop(0.45, '#b08a4e'); gr.addColorStop(0.62, '#3a2e38'); gr.addColorStop(1, '#06060c');
cx.fillStyle = gr; cx.fillRect(0, 0, 2, 256);
const sky = new THREE.CanvasTexture(cv); sky.colorSpace = THREE.SRGBColorSpace; scene.background = sky;
scene.fog = new THREE.FogExp2(C(SCENE.fog).getHex(), 0.018);

// environment for crystal refraction/reflection
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);

// lights
scene.add(new THREE.AmbientLight(0xffffff, SCENE.ambient * 0.7));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
sun.position.set(12, 30, 6); scene.add(sun);
const fill = new THREE.DirectionalLight(0x88aaff, 0.5); fill.position.set(-10, 8, -12); scene.add(fill);
// the radiant sun-orb high above the peak (blooms into light shafts)
const orb = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
orb.position.set(2, 26, -18); scene.add(orb);

// materials
const goldMat = () => new THREE.MeshStandardMaterial({ color: 0xe9b96a, metalness: 1, roughness: 0.32, envMapIntensity: 1.1 });
const glassMat = (hex) => new THREE.MeshPhysicalMaterial({
  color: C(hex), metalness: 0, roughness: 0.04, transmission: 0.45, ior: 2.1, thickness: 1.0,
  clearcoat: 1, clearcoatRoughness: 0, transparent: true, opacity: 1.0, envMapIntensity: 1.7,
  emissive: C(hex), emissiveIntensity: 0.85, attenuationColor: C(hex), attenuationDistance: 1.6 });
const figureMat = () => new THREE.MeshStandardMaterial({ color: 0x05060a, metalness: 0.2, roughness: 0.7 });

// golden terraces: concentric stepped rings at each region elevation
for (const reg of SCENE.regions) {
  const [ox, oy, oz] = reg.origin;
  for (let i = 0; i < 6; i++) {
    const rOuter = 5.2 - i * 0.72, h = 0.4;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(rOuter, rOuter + 0.14, h, 72), goldMat());
    ring.position.set(ox, oy - 0.3 - i * h, oz); scene.add(ring);
  }
  // crystal spires ringing the rim (the concept-art skyline) — tall faceted gems
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, hh = 1.6 + (k % 3) * 0.9;
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), glassMat('#cfe6ff'));
    sp.scale.set(1, hh, 1);
    sp.position.set(ox + Math.cos(a) * 4.7, oy + hh * 0.26, oz + Math.sin(a) * 4.7);
    scene.add(sp);
  }
}

const glow = [];
const grabbables = []; // Gate 6: knowledge-entry gems the player can grab to graduate
const gem = (geo, hex) => {
  const grp = new THREE.Group();
  const shell = new THREE.Mesh(geo, glassMat(hex));
  const core = new THREE.Mesh(geo.clone(),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: C(hex).lerp(C('#ffffff'), 0.3), emissiveIntensity: 2.2, toneMapped: true }));
  core.scale.setScalar(0.4); grp.add(shell); grp.add(core); glow.push(core);
  return grp;
};
const focus = new THREE.Vector3(0, 4.5, -8);
for (const m of SCENE.meshes) {
  let obj;
  const s = m.scale;
  if (m.geometry === 'capsule') {             // a Curator — lone silhouette figure
    obj = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * s[0], 1.0 * s[1], 6, 12), figureMat());
  } else if (m.geometry === 'octahedron') {   // knowledge entry — faceted gem
    const big = m.tier === 'diamond';
    const g = big ? new THREE.DodecahedronGeometry(4.2, 0) : new THREE.OctahedronGeometry(1.9 * s[0], 0);
    obj = gem(g, m.color);
    obj.userData = { kind: 'entry', name: m.name, tier: m.tier, graduated: false };
    grabbables.push(obj);
    if (big) focus.set(m.position[0], m.position[1] + 0.5, m.position[2]);
  } else if (m.geometry === 'tetrahedron') {  // vault collision — dark red crystal
    obj = gem(new THREE.TetrahedronGeometry(0.8 * s[0], 0), '#7a1f1f');
  } else {
    obj = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]),
      new THREE.MeshStandardMaterial({ color: C(m.color).getHex(), metalness: 0.4, roughness: 0.5 }));
  }
  obj.position.set(m.position[0], m.position[1] + 0.2, m.position[2]);
  scene.add(obj);
}

// post: bloom for the radiant glow
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// In VR, the player stands inside the vault: place them on the path facing the
// Diamond peak, so the world surrounds them. A 'rig' carries the XR camera so we
// can position the human in the scene without fighting head-tracking.
const rig = new THREE.Group();
rig.position.set(focus.x, 1.6, focus.z + 12);   // eye height, just in front of the peak
rig.add(camera); scene.add(rig);

// ── Gate 6: HoloGate entry portal (menu) + controller interaction ─────────────
// A grab is NOT a raw mutation — it's a typed HoloGate PortalIntent validated
// against a HoloDoor spatial scope BEFORE it changes the world. drive-avatar =
// the player may drive their avatar and grab zone entities (curate in-headset).
const HOLODOOR_POLICY = { defaultScope: 'drive-avatar', allowedScopes: ['read-only', 'mutate-zone', 'drive-avatar'],
  mutableZoneGlobs: ['*'], driveAvatar: { allow: true, maxEntities: 16 }, enforcement: { onScopeViolation: 'reject' } };
const SCOPE = 'drive-avatar';
let graduatedCount = 0;
let started = false;

// world-space panel = the in-VR start menu / instruction HUD (fixes "no menu")
const panelMat = new THREE.MeshBasicMaterial({ transparent: true });
function panelTexture(lines, accent) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(6,7,10,0.93)'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = accent || '#d4af37'; g.lineWidth = 6; g.strokeRect(7, 7, 498, 242);
  g.textAlign = 'center'; g.fillStyle = '#ffe9a0'; g.font = 'bold 34px sans-serif';
  g.fillText('THE GOLD GAME', 256, 54);
  g.fillStyle = '#d8c590'; g.font = '21px sans-serif';
  lines.forEach((t, i) => g.fillText(t, 256, 100 + i * 33));
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function setPanel(lines, accent) { if (panelMat.map) panelMat.map.dispose(); panelMat.map = panelTexture(lines, accent); panelMat.needsUpdate = true; }
const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), panelMat);
panel.position.set(focus.x, 2.5, focus.z + 9.2); panel.lookAt(focus.x, 2.5, focus.z + 12); scene.add(panel);
setPanel(['THE VAULT', 'Pull the trigger to ENTER', '(then point at a gem + trigger', 'to graduate it via HoloGate)']);

// controllers + targeting ray
const raycaster = new THREE.Raycaster();
const tmpM = new THREE.Matrix4();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  ctrl.addEventListener('selectstart', () => onTrigger(ctrl));
  const beam = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -8)]),
    new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
  ctrl.add(beam); rig.add(ctrl);
}
function onTrigger(ctrl) {
  if (!started) { started = true; setPanel(['ENTERED — drive-avatar scope', 'Point at a glowing gem', 'and pull the trigger', 'Graduated: 0']); return; }
  tmpM.identity().extractRotation(ctrl.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  const hits = raycaster.intersectObjects(grabbables, true);
  if (!hits.length) return;
  let g = hits[0].object; while (g && !(g.userData && g.userData.kind === 'entry')) g = g.parent;
  if (!g || g.userData.graduated) return;
  // REAL HoloGate: validate the grab intent against the HoloDoor scope first.
  const intent = { kind: 'grab', entityId: 'curator-avatar', targetId: g.userData.name };
  const verdict = validatePortalIntent(intent, HOLODOOR_POLICY, SCOPE);
  if (!verdict.allowed) { setPanel(['DENIED by HoloGate', verdict.reason || 'scope', 'Graduated: ' + graduatedCount], '#8a2a2a'); return; }
  g.userData.graduated = true; graduatedCount++;
  const startY = g.position.y, endY = g.position.y + 4, t0 = performance.now();
  (function rise() { const k = Math.min(1, (performance.now() - t0) / 900); g.position.y = startY + (endY - startY) * k; if (k < 1) requestAnimationFrame(rise); })();
  setPanel(['GRADUATED via HoloGate', g.userData.name.replace(/_/g, '.'), 'grab intent -> validated (' + SCOPE + ')', 'Graduated: ' + graduatedCount], '#d4af37');
}

let t = 0.6;
function frame() {
  const inVR = renderer.xr.isPresenting;
  for (const g of glow) g.rotation.y += 0.012;
  if (inVR) {
    // Headset drives the camera pose; render per-eye directly (EffectComposer is
    // not XR-aware, so bloom is dropped inside the session — correctness over polish).
    renderer.render(scene, camera);
  } else {
    t += 0.0025;
    const rad = 17;
    camera.position.set(Math.cos(t) * rad, 6 + Math.sin(t * 0.5) * 3, Math.sin(t) * rad - 4);
    camera.lookAt(focus);
    composer.render();
  }
}
renderer.setAnimationLoop(frame);   // XR-compatible loop (replaces requestAnimationFrame)
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
`;

// ── 4. Bundle to one classic IIFE (three inlined → works on file://) ─────────
// Resilient clean: if the dir is locked (e.g. being served by a live tunnel),
// skip the wipe and overwrite in place — we only emit index.html + START-HERE.txt.
try { rmSync(OUT, { recursive: true, force: true }); } catch (e) { /* dir in use — overwrite in place */ }
mkdirSync(OUT, { recursive: true });
const entryPath = join(OUT, '_entry.mjs');
writeFileSync(entryPath, entry);
const esbuild = await import(pathToFileURL(join(repo, 'node_modules/esbuild/lib/main.js')).href);
const result = await esbuild.build({ entryPoints: [entryPath], bundle: true, format: 'iife', minify: true,
  platform: 'browser', write: false, logLevel: 'silent' });
const bundle = result.outputFiles[0].text;
rmSync(entryPath, { force: true });

// ── 5. Self-contained index.html ────────────────────────────────────────────
const tierList = regions.map((rg) => '<li>' + rg.name + ' — y=' + rg.origin[1] + '</li>').join('');
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>THE GOLD GAME — The Vault</title><style>' +
'html,body{margin:0;height:100%;overflow:hidden;background:#06070a;font-family:system-ui,sans-serif}' +
'#hud{position:fixed;top:14px;left:16px;color:#f0d79a;z-index:10;text-shadow:0 1px 6px #000;max-width:360px}' +
'#hud h1{font-size:18px;margin:0 0 4px;letter-spacing:2px}' +
'#hud p{font-size:12px;margin:2px 0;color:#d8c590;line-height:1.45}' +
'#hud ul{font-size:11px;margin:6px 0 0;padding-left:16px;color:#b09a5a}canvas{display:block}' +
'</style></head><body><div id="hud"><h1>THE GOLD GAME · The Vault</h1>' +
'<p>The real GOLD curation system as a world. Bronze valley rises to the Diamond peak; glass gems with glowing cores are real vault entries you graduate.</p>' +
'<p>Photoreal from minimal geometric shapes. Backend stays real AI work; the human plays.</p>' +
'<p><b>In VR:</b> pull the trigger to ENTER, then point a controller at a glowing gem and pull the trigger to graduate it — each grab is a HoloGate intent validated against your HoloDoor scope.</p>' +
'<p id="live">vault: open via the launcher for the live count (embedded snapshot on file://)</p>' +
'<ul>' + tierList + '</ul></div>' +
'<script>' + bundle + '</script>' +
'<script>fetch("./api/vault").then(function(r){return r.json()}).then(function(v){var el=document.getElementById("live");if(!el)return;' +
'el.textContent=v.connected?("LIVE vault: "+(v.total||"?")+" entries · as of "+(v.asOf||"?")):"vault not detected — embedded snapshot"}).catch(function(){});</script>' +
'</body></html>';
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, 'START-HERE.txt'),
  'THE GOLD GAME — The Vault\\n\\nDouble-click index.html to open the game in any browser.\\n' +
  'Works offline; nothing to install. (For the live vault count, use the launcher exe.)\\n');

// ── 6. Reproducible Gate-1 receipt ───────────────────────────────────────────
const receipt = {
  gate: 1, name: 'Drive build — photoreal self-contained web build',
  artifact: 'examples/gold-game/drive-build/index.html',
  source_holo: 'examples/gold-game/gold-vault-game.holo',
  parse: { success: true, errors: 0, warnings: 0 },
  scene: { meshes: meshes.length, lights: lights.length, regions: regions.length,
    entries: meshes.filter((m) => m.geometry === 'octahedron').length },
  render: { primitives_only: true, glass_transmission: true, emissive_cores: true,
    golden_terraces: true, pmrem_environment: true, bloom: true, tone_mapping: 'ACESFilmic' },
  webxr: { enabled: true, entry: 'VRButton', loop: 'setAnimationLoop',
    immersive_mode: 'immersive-vr', player_rig: true, note: 'bloom dropped inside XR session (EffectComposer not XR-aware)' },
  gate6_holoGate: { enabled: true, module: 'packages/mcp-server/src/holo-portal-intent.ts (real, bundled by esbuild)',
    entry_portal_menu: 'world-space panel; pull trigger to ENTER then to graduate',
    interaction: 'controller raycast -> PortalIntent{kind:grab} -> validatePortalIntent(intent, HoloDoorPolicy, "drive-avatar") -> graduate gem rises a tier',
    scope: 'drive-avatar', note: 'a grab MUTATES only after HoloGate validates it against the spatial scope; read-only/mutate-zone-without-glob are rejected' },
  sceneDigest: sha256(sceneJson), htmlBytes: html.length,
  selfContained: true, offline: true, three: '0.182.0 (bundled IIFE)', core: '6.1.0',
  verifiedAt: new Date().toISOString(),
};
writeFileSync(join(here, 'GOLD-VAULT-gate1-receipt.json'), JSON.stringify(receipt, null, 2));
console.log('BUILD OK — meshes:', meshes.length, '| entries:', receipt.scene.entries,
  '| regions:', regions.length, '| html bytes:', html.length, '| digest:', receipt.sceneDigest.slice(0, 16));
if (esbuild.stop) await esbuild.stop();
process.exit(0);
