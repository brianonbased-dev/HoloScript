#!/usr/bin/env node
// THE GOLD GAME — Drive build (photoreal from minimal geometric shapes).
// Walks the real parsed .holo and emits a self-contained static web build that
// opens by double-clicking index.html (offline, no install). three.js is
// bundled (IIFE) so it works on file://. Visual target (W.622 VLDL inversion:
// photoreal physics-upward, not asset-downward): glass crystals with emissive
// cores, golden terraces, PMREM environment, bloom, ACES tone-mapping, fog.
//
//   node examples/gold-game/drive-build.mjs
//   HOLOSCRIPT_REPO=C:/Users/josep/Documents/GitHub/HoloScript node drive-build.mjs
// Outputs: examples/gold-game/drive-build/{index.html, START-HERE.txt}
//          examples/gold-game/GOLD-VAULT-gate1-receipt.json

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
// Gate 41: pure mount module (F.077) — turns the Gate-39 coords artifact into the
// deterministic render payload embedded below.
import { buildMountainMount } from './gold-game-knowledge-mountain.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const vaultOps = require('./vault-ops.cjs'); // Gate 28: shared catalog/lineage reader
const repo = resolve(process.env.HOLOSCRIPT_REPO || process.env.HOLOSCRIPT_ROOT || join(here, '..', '..'));
const core = await import(pathToFileURL(join(repo, 'packages/core/dist/index.js')).href);
const parseHolo = core.parseHolo;

const HOLO = join(here, 'gold-vault-game.holo');
const OUT = join(here, 'drive-build');
const CONCEPT_ART = join(here, 'assets', 'gold-vault-vista-wlNgg.jpg');
const HOLOGRAPH_RECEIPT = join(here, 'GATE-10-HOLOGRAPH-receipt.json');
const HOLOMAP_ROOM = join(here, 'gold-vault-holomap-room.json');
const HOLOGRAPHIC_EXPORT = join(here, 'gold-vault-holographic-export.json');
const MOUNTAIN_COORDS = join(here, 'knowledge-mountain-coords.json');
const VAULT_ROOT = process.env.GOLD_ROOT || 'D:/GOLD';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const conceptArtBytes = existsSync(CONCEPT_ART) ? readFileSync(CONCEPT_ART) : null;
const conceptArt = conceptArtBytes ? {
  file: 'examples/gold-game/assets/gold-vault-vista-wlNgg.jpg',
  source: 'C:/Users/josep/Downloads/wlNgg.jpg',
  mime: 'image/jpeg',
  bytes: conceptArtBytes.length,
  width: 1168,
  height: 784,
  sha256: sha256(conceptArtBytes),
  dataUrl: 'data:image/jpeg;base64,' + conceptArtBytes.toString('base64'),
  role: 'Gate 24 opening vista and visual target for the GOLD vault world',
} : null;
const packageSystemSpecs = [
  ['core', 'World source', 'parse the .holo scene, traits, compiler outputs, and SimulationContract identities'],
  ['engine', 'Runtime loop', 'rendering, physics, animation, hologram orchestration, and game subsystems'],
  ['mcp-server', 'HoloGate', 'validate player intent before any GOLD mutation happens'],
  ['mesh', 'Shared state', 'authority, replication, co-presence, and agent/player convergence'],
  ['crdt', 'Safe edits', 'signed CRDT state for concurrent knowledge changes'],
  ['crdt-spatial', 'Spatial sync', 'Loro-backed transform convergence for shared objects and rooms'],
  ['holoembed', 'HoloGraph recall', 'native embeddings for lineage search and knowledge routing'],
  ['absorb-service', 'Graph intelligence', 'code/knowledge graph ingestion, GraphRAG, and recursive improvement hooks'],
  ['holomap', 'Scanned spaces', 'video/device capture reconstruction into anchored GOLD rooms and portals'],
  ['hologram-worker', 'HoloGram render', 'depth, quilt, stereo, parallax, and Studio upload worker path'],
  ['r3f-renderer', '3D renderer', 'shared React Three Fiber renderer surface for GOLD visual clients'],
  ['spatial-index', 'Vault navigation', 'spatial lookup for entries, anchors, routes, and scanned spaces'],
  ['snn-webgpu', 'Agent cognition', 'GPU spiking-neural simulation for future companion perception/choice loops'],
  ['security-sandbox', 'Mutation sandbox', 'execute generated HoloScript safely before live-vault application'],
  ['secrets-broker', 'Capabilities', 'short-lived scoped capability tokens for live GOLD actions'],
  ['studio', 'Creator surface', 'author and inspect GOLD scenes as HoloScript Studio artifacts'],
  ['compiler-wasm', 'Browser compiler', 'ship parser/compiler pieces into offline browser contexts'],
  ['holo-vm', 'Bytecode runtime', 'future native execution path for heavier in-game HoloScript behaviors'],
  ['runtime', 'Browser runtime', 'browser device APIs, events, physics, and R3F integration'],
  ['agent-protocol', 'Agent party', 'uAA2++ protocol types for companion agents and team actions'],
];
const readPackageSystem = ([dir, role, consumes]) => {
  const packageJson = join(repo, 'packages', dir, 'package.json');
  if (!existsSync(packageJson)) return { dir, role, consumes, found: false };
  const pkg = JSON.parse(readFileSync(packageJson, 'utf8'));
  return {
    dir,
    role,
    consumes,
    found: true,
    name: pkg.name || dir,
    version: pkg.version || null,
    description: pkg.description || '',
  };
};
const holoscriptToolset = {
  gate: 36,
  source: 'packages/*/package.json',
  purpose: 'Expose HoloScript packages as concrete GOLD game systems instead of passive repo inventory.',
  systems: packageSystemSpecs.map(readPackageSystem),
};
const prop = (node, key, dflt) => {
  const p = (node.properties || []).find((x) => x.key === key);
  return p ? p.value : dflt;
};
const entryIdForName = (name) => {
  const raw = String(name || '');
  if (!/^[A-Z]+_[A-Z]+_[0-9]+$/.test(raw)) return null;
  return raw.replace(/_/g, '.');
};
const parseFrontmatter = (markdown) => {
  const lines = String(markdown || '').split(/\r?\n/);
  if (lines[0] !== '---') return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const idx = lines[i].indexOf(':');
    if (idx > 0) out[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return out;
};
const findVaultEntryFile = (id) => {
  const wanted = String(id || '').toLowerCase().replace(/\./g, '_') + '.md';
  const roots = ['wisdom', 'patterns', 'gotchas', 'architectures', 'protocols', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'graduated'];
  const walk = (dir) => {
    let items = [];
    try { items = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const item of items) {
      if (item.name === '.git') continue;
      const p = join(dir, item.name);
      if (item.isFile() && item.name.toLowerCase() === wanted) return p;
      if (item.isDirectory()) {
        const found = walk(p);
        if (found) return found;
      }
    }
    return null;
  };
  if (!existsSync(VAULT_ROOT)) return null;
  for (const root of roots) {
    const found = walk(join(VAULT_ROOT, root));
    if (found) return found;
  }
  return null;
};
const readVaultEntry = (id) => {
  const file = findVaultEntryFile(id);
  if (!file) return { id, found: false, content: '', metadata: {} };
  const content = readFileSync(file, 'utf8');
  return { id, found: true, relativePath: file.replace(VAULT_ROOT, '').replace(/^[/\\]/, '').replace(/\\/g, '/'), metadata: parseFrontmatter(content), content };
};
// Gate 28: enumerate the WHOLE vault for the offline full-vault browser. We reuse
// the SAME catalog reader the live server uses (vault-ops.cjs) so the offline
// embedded catalog is identical to the live /api/vault-list. Bodies are NOT
// embedded (912 entries would bloat the build); the browser fetches a body live
// via /api/vault-entry, and falls back to the seeded full bodies on file://.
const readVaultCatalog = () => {
  if (!existsSync(VAULT_ROOT)) return { count: 0, entries: [], facets: { tiers: {}, types: {}, domains: {} }, found: false };
  try {
    const cat = vaultOps.readVaultCatalog(VAULT_ROOT);
    return { ...cat, found: true };
  } catch (e) {
    return { count: 0, entries: [], facets: { tiers: {}, types: {}, domains: {} }, found: false, error: String(e && e.message || e) };
  }
};
const readPlayableHoloGraph = () => {
  if (!existsSync(HOLOGRAPH_RECEIPT)) {
    return { gate: 31, found: false, nodes: [], edges: [], source: 'missing GATE-10-HOLOGRAPH-receipt.json' };
  }
  const receipt = JSON.parse(readFileSync(HOLOGRAPH_RECEIPT, 'utf8'));
  const entries = receipt.corpus?.entries || [];
  const outEdges = receipt.holoGraph?.outEdges || {};
  const top3 = receipt.holoEmbed?.top3 || [];
  const nodes = entries.map((entry, index) => {
    const id = entry.id;
    const entryData = readVaultEntry(id);
    const top = top3.find((x) => x.id === id);
    return {
      id,
      index,
      title: entryData.metadata?.title || id,
      refs: outEdges[id] || [],
      reachableFrom534: (receipt.holoGraph?.reachableFrom534 || []).includes(id),
      semanticScore: top ? top.score : null,
      entryData,
    };
  });
  const edges = nodes.flatMap((node) => (node.refs || []).map((target) => ({ source: node.id, target })));
  return {
    gate: 31,
    found: true,
    source: 'GATE-10-HOLOGRAPH-receipt.json',
    implementation: receipt.implementation || {},
    semanticQuery: receipt.holoEmbed?.semanticQuery || '',
    nodes,
    edges,
    exactByConstruction: receipt.holoGraph?.exactByConstruction === true,
    navigable: receipt.holoGraph?.navigable === true,
    graphDigest: receipt.contract?.graphDigest || '',
    embedDigest: receipt.contract?.embedDigest || '',
  };
};
const readJsonArtifact = (file, gate, label) => {
  if (!existsSync(file)) return { gate, found: false, label, source: file.replace(here, 'examples/gold-game').replace(/\\/g, '/') };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { ...data, gate, found: true, label, source: file.replace(here, 'examples/gold-game').replace(/\\/g, '/') };
  } catch (e) {
    return { gate, found: false, label, error: String(e && e.message || e), source: file.replace(here, 'examples/gold-game').replace(/\\/g, '/') };
  }
};
const playableHoloGraph = readPlayableHoloGraph();
const vaultCatalog = readVaultCatalog(); // Gate 28: every real GOLD entry (summaries)
const holomapRoom = readJsonArtifact(HOLOMAP_ROOM, 33, 'HoloMap scanned room');
const holographicExport = readJsonArtifact(HOLOGRAPHIC_EXPORT, 38, 'holographic export leg');
// Gate 41: mount the Gate-39 Knowledge Mountain (full real GOLD vault as a climbable
// region) INTO this playable build. Reads the SAME committed coords artifact the Gate-39
// verifier proved; buildMountainMount is a pure deterministic transform.
let knowledgeMountain = null;
try {
  const mc = JSON.parse(readFileSync(MOUNTAIN_COORDS, 'utf8'));
  knowledgeMountain = buildMountainMount(mc);
  // link back to the Gate-39 proof: carry its sealed terrain digest into the mount.
  try {
    const g39 = JSON.parse(readFileSync(join(here, 'GATE-39-KNOWLEDGE-MOUNTAIN-receipt.json'), 'utf8'));
    if (g39?.terrainDigest) knowledgeMountain.terrainDigest = g39.terrainDigest;
  } catch { /* receipt optional */ }
} catch { /* no mountain coords yet — additive, build still works */ }

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
    const entryId = entryIdForName(o.name);
    meshes.push({ name: o.name, region: g.name, geometry, position: pos, scale, color,
      tier: st.tier || null, title: st.title || null, inhabited_by: st.inhabited_by || null,
      entryId, entryData: entryId ? readVaultEntry(entryId) : null });
  }
}
const lights = (ast.lights || []).map((l) => ({ name: l.name, type: prop(l, 'type', 'directional'),
  intensity: prop(l, 'intensity', 1), color: prop(l, 'color', '#ffffff'), rotation: prop(l, 'rotation', [-30, 45, 0]) }));
const regions = (ast.spatialGroups || []).map((g) => ({ name: g.name, origin: prop(g, 'origin', [0, 0, 0]) }));
const ambient = prop(ast.environment || {}, 'ambient_light', 0.4);
const fog = prop(ast.environment || {}, 'fog_color', '#caa472');
const scene = { title: ast.name, ambient, fog, meshes, lights, regions,
  conceptArt: conceptArt ? {
    file: conceptArt.file,
    sha256: conceptArt.sha256,
    width: conceptArt.width,
    height: conceptArt.height,
    role: conceptArt.role,
  } : null,
  holoGraph: playableHoloGraph,
  holomapRoom: holomapRoom.found ? {
    gate: 33,
    found: true,
    name: holomapRoom.name,
    replayFingerprint: holomapRoom.holomap?.replayFingerprint,
    points: holomapRoom.holomap?.export?.exportPointCount,
    portal: holomapRoom.portal,
    spaceDigest: holomapRoom.contract?.spaceDigest,
  } : holomapRoom,
  holographicExport: holographicExport.found ? {
    gate: 38,
    found: true,
    targets: holographicExport.shareReceipt?.targets || [],
    exportDigest: holographicExport.shareReceipt?.exportDigest,
    quilt: holographicExport.quilt ? { views: holographicExport.quilt.views, grid: holographicExport.quilt.grid, device: holographicExport.quilt.device } : null,
    mvhevc: holographicExport.mvhevc ? { stereoMode: holographicExport.mvhevc.stereoMode, fps: holographicExport.mvhevc.fps, resolution: holographicExport.mvhevc.resolution } : null,
  } : holographicExport,
  toolset: { gate: holoscriptToolset.gate, systems: holoscriptToolset.systems.map((s) => ({
    dir: s.dir, name: s.name || s.dir, role: s.role, consumes: s.consumes, found: s.found,
  })) },
  // Gate 28: the full-vault catalog (summaries only — bodies fetched live or
  // from the seeded full-body gems). Keeps the offline build searchable across
  // every entry without embedding hundreds of full markdown bodies.
  vaultCatalog: { gate: 28, found: vaultCatalog.found, count: vaultCatalog.count,
    facets: vaultCatalog.facets,
    entries: vaultCatalog.entries.map((e) => ({
      id: e.id, title: e.title, tier: e.tier, type: e.type, domain: e.domain,
      relativePath: e.relativePath, lineage: e.lineage, provenance: e.provenance,
    })) } };
const sceneJson = JSON.stringify(scene);
const portalIntentPath = join(repo, 'packages/mcp-server/src/holo-portal-intent.ts');

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
import { validatePortalIntent } from 'gold-game:holo-portal-intent';
// Gate 25: the SAME pure campaign state machine the verifier exercises (bundled by
// esbuild). Path is relative to the emitted drive-build/_entry.mjs, like the HoloGate import.
import * as Campaign from '../gold-game-campaign.mjs';
const SCENE = ${sceneJson};
window.__GOLD_GAME_SCENE__ = SCENE;
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
if (window.__GOLD_GAME_CONCEPT_ART__) {
  new THREE.TextureLoader().load(window.__GOLD_GAME_CONCEPT_ART__, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  });
}
// Gate 34: the founder art as a REAL depth-displaced 3D world (parallax behind
// DiamondPeak), reconstructed from the SAME Gate-32 gold-vault-vista-world.json depth
// grid the verifier proved. The 2D vista becomes geometry you can see depth in.
const vista = window.__GOLD_GAME_VISTA__;
if (vista && vista.depths && vista.depths.length === vista.width * vista.height) {
  const bd = vista.backdrop;
  const vgeo = new THREE.PlaneGeometry(bd.spanX, bd.spanY, vista.width - 1, vista.height - 1);
  const vpos = vgeo.attributes.position;
  for (let iy = 0; iy < vista.height; iy++) {
    for (let ix = 0; ix < vista.width; ix++) {
      const vi = iy * vista.width + ix;
      vpos.setZ(vi, -(1 - vista.depths[vi]) * bd.depthScale); // far (low depth) pushed back
    }
  }
  vgeo.computeVertexNormals();
  const vmat = new THREE.MeshStandardMaterial({ color: 0x9fb4d6, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  if (window.__GOLD_GAME_CONCEPT_ART__) {
    new THREE.TextureLoader().load(window.__GOLD_GAME_CONCEPT_ART__, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; vmat.map = tex; vmat.needsUpdate = true; });
  }
  const vistaBackdrop = new THREE.Mesh(vgeo, vmat);
  vistaBackdrop.name = 'VaultVistaBackdrop';
  vistaBackdrop.position.set(bd.originX, bd.originY, bd.originZ);
  scene.add(vistaBackdrop);
  window.__GOLD_GAME_VISTA_MOUNTED__ = 'VaultVistaBackdrop';
}

// Gate 33: anchored HoloMap room portal. The verifier emits the room artifact
// from the real HoloMap session/export path; the build mounts that artifact as a
// visible portal inside the playable vault.
const holomapRoom = window.__GOLD_GAME_HOLOMAP_ROOM__;
if (holomapRoom && holomapRoom.portal) {
  const p = holomapRoom.portal;
  const portal = new THREE.Group();
  portal.name = p.id || 'HoloMapRoomPortal';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.055, 12, 42),
    new THREE.MeshBasicMaterial({ color: 0x42b7d9, transparent: true, opacity: 0.9 }));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.62),
    new THREE.MeshBasicMaterial({ color: 0x163849, transparent: true, opacity: 0.38, side: THREE.DoubleSide }));
  portal.add(pane); portal.add(ring);
  portal.position.set(p.position[0], p.position[1], p.position[2]);
  portal.scale.set(p.scale[0], p.scale[1], p.scale[2]);
  portal.userData = { kind: 'holomap-room-portal', gate: 33, digest: holomapRoom.contract && holomapRoom.contract.spaceDigest };
  scene.add(portal);
  window.__GOLD_GAME_HOLOMAP_PORTAL_MOUNTED__ = portal.name;
}

// Gate 41: the Knowledge Mountain — the FULL real GOLD vault (186 entries, 83 lineage
// cables) placed by Gate 39 as a climbable region, mounted IN the playable build (not
// only the standalone viewer). An additive landmass behind the onboarding vault: each
// entry is a tier-colored crystal at its semantic (x,z) + tier elevation, sized by
// citations; lineage cables are drawn between cited entries. Reads the SAME deterministic
// payload Gate 41's verifier asserts byte-equal.
const km = window.__GOLD_GAME_KNOWLEDGE_MOUNTAIN__;
if (km && Array.isArray(km.nodes) && km.nodes.length) {
  const mountain = new THREE.Group();
  mountain.name = 'KnowledgeMountain';
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  for (const n of km.nodes) {
    const mat = new THREE.MeshStandardMaterial({
      color: C(n.color), roughness: 0.18, metalness: 0.0,
      emissive: C(n.color), emissiveIntensity: 0.35,
      transparent: true, opacity: 0.92,
    });
    const m = new THREE.Mesh(crystalGeo, mat);
    m.position.set(n.pos[0], n.pos[1] + n.size, n.pos[2]);
    m.scale.setScalar(n.size);
    m.userData = { kind: 'knowledge-mountain-entry', gate: 41, entryId: n.id, tier: n.tier, lineageIn: n.lineageIn };
    mountain.add(m);
  }
  // lineage cables — thin lines between cited entries
  if (Array.isArray(km.cables) && km.cables.length) {
    const cablePts = [];
    for (const c of km.cables) {
      cablePts.push(c.a[0], c.a[1] + 0.4, c.a[2]);
      cablePts.push(c.b[0], c.b[1] + 0.4, c.b[2]);
    }
    const cableGeo = new THREE.BufferGeometry();
    cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
    const cableMat = new THREE.LineBasicMaterial({ color: 0x6fd2ff, transparent: true, opacity: 0.34 });
    const cables = new THREE.LineSegments(cableGeo, cableMat);
    cables.name = 'KnowledgeMountainLineage';
    mountain.add(cables);
  }
  scene.add(mountain);
  window.__GOLD_GAME_MOUNTAIN_MOUNTED__ = { name: mountain.name, entries: km.nodes.length, cables: (km.cables || []).length };
}

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
    obj.userData = { kind: 'entry', name: m.name, tier: m.tier, entryId: m.entryId, entryData: m.entryData, graduated: false };
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

// ── Gate 25: continuous campaign ──────────────────────────────────────────────
// The game does not stop at one graduation. A persistent campaign tracks a quest
// log, a win condition (One Climb = first real graduation), and a post-win
// continuation that surfaces the NEXT ratchet. State persists across reload via
// localStorage so a player can resume. This is the same backend op (graduate)
// projected as ongoing progression — no fake state behind it. The state machine
// is the imported pure Campaign module (also exercised by gate-25); this is the
// thin browser glue: localStorage I/O + DOM event emission.
const CAMPAIGN_KEY = Campaign.CAMPAIGN_KEY;
let campaign = Campaign.initCampaign();
function loadCampaign() {
  try {
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(CAMPAIGN_KEY);
    if (!raw) return;
    campaign = Campaign.deserialize(raw);
    graduatedCount = campaign.graduatedIds.length;
  } catch (e) { /* corrupt save — start fresh, never throw into the loop */ }
}
function saveCampaign() {
  try {
    if (typeof localStorage === 'undefined') return;
    campaign.lastPlayedAt = new Date().toISOString();
    localStorage.setItem(CAMPAIGN_KEY, Campaign.serialize(campaign));
  } catch (e) { /* storage blocked (private mode) — campaign still runs in-memory */ }
}
function setQuestDone(id) { return Campaign.setQuestDone(campaign, id); }
function emitCampaign() {
  window.dispatchEvent(new CustomEvent('gold-game-state', { detail: {
    questLog: campaign.questLog.map((q) => ({ id: q.id, title: q.title, desc: q.desc, done: q.done })),
    graduated: graduatedCount,
    graduatedIds: campaign.graduatedIds.slice(),
    oneClimbComplete: campaign.oneClimbComplete,
    campaignComplete: campaign.campaignComplete,
    nextRatchet: campaign.nextRatchet,
    resumed: Boolean(campaign.lastPlayedAt),
  } }));
}
// Called whenever a REAL graduation lands (any path: VR / first-person / keyboard).
function recordGraduation(entryId) {
  Campaign.recordGraduation(campaign, entryId);
  saveCampaign();
  emitCampaign();
}
loadCampaign();

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
  recordGraduation(g.userData.entryId || g.userData.name);
  const startY = g.position.y, endY = g.position.y + 4, t0 = performance.now();
  (function rise() { const k = Math.min(1, (performance.now() - t0) / 900); g.position.y = startY + (endY - startY) * k; if (k < 1) requestAnimationFrame(rise); })();
  setPanel(['GRADUATED via HoloGate', g.userData.name.replace(/_/g, '.'), 'grab intent -> validated (' + SCOPE + ')', 'Graduated: ' + graduatedCount], '#d4af37');
}

let orbitT = 0.6;
let lastFrame = performance.now();
let desktopMode = 'orbit';
const keys = new Set();
const player = {
  position: new THREE.Vector3(0, 1.65, 5.5),
  yaw: Math.PI,
  pitch: -0.06,
  speed: 6,
};
const startPosition = player.position.clone();
camera.rotation.order = 'YXZ';
window.__GOLD_GAME_CONTROL_STATE__ = () => ({
  mode: desktopMode,
  position: [player.position.x, player.position.y, player.position.z],
  yaw: player.yaw,
  pitch: player.pitch,
});

function dispatchEntry(g) {
  if (!g) return;
  if (setQuestDone('read-record')) { saveCampaign(); emitCampaign(); }
  window.dispatchEvent(new CustomEvent('gold-entry-selected', { detail: { id: g.userData.entryId || g.userData.name, entry: g.userData.entryData || null } }));
}
function resetToOverlook() {
  player.position.copy(startPosition);
  player.yaw = Math.PI;
  player.pitch = -0.06;
  enterFirstPerson();
  setPanel(['FIRST OBJECTIVE', 'Graduate one glowing entry', 'Then read its full GOLD record', 'Return to Overlook can retry'], '#d4af37');
}
function graduateGem(g, label) {
  if (!g || g.userData.graduated) return false;
  const verdict = validatePortalIntent({ kind: 'grab', entityId: 'curator-avatar', targetId: g.userData.name }, HOLODOOR_POLICY, SCOPE);
  if (!verdict.allowed) { setPanel(['DENIED by HoloGate', verdict.reason || 'scope', 'Graduated: ' + graduatedCount], '#8a2a2a'); return false; }
  g.userData.graduated = true; graduatedCount++;
  recordGraduation(g.userData.entryId || g.userData.name);
  const sy = g.position.y, ey = sy + 4, t0 = performance.now();
  (function rise() { const kf = Math.min(1, (performance.now() - t0) / 900); g.position.y = sy + (ey - sy) * kf; if (kf < 1) requestAnimationFrame(rise); })();
  setPanel([label || 'GRADUATED via HoloGate', g.userData.name.replace(/_/g, '.'), 'Graduated: ' + graduatedCount], '#d4af37');
  spawnGraduateSeal(g.position, g.userData.entryId || g.userData.name);
  dispatchEntry(g);
  return true;
}
// Gate 34 proof-as-play: graduation SEALS visibly — a golden ring blooms at the gem
// and a short content hash flashes, so the receipt is FELT in the world, not read in a
// side panel. The visible beat IS the proof for the human half of the audience (F.074).
function spawnGraduateSeal(pos, id) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.06, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.95 }));
  ring.name = 'GraduateSeal';
  ring.position.copy(pos); ring.lookAt(camera.position);
  scene.add(ring);
  const t0 = performance.now();
  (function bloom() {
    const k = Math.min(1, (performance.now() - t0) / 800);
    const s = 0.3 + k * 3.5; ring.scale.set(s, s, s);
    ring.material.opacity = 0.95 * (1 - k);
    if (k < 1) requestAnimationFrame(bloom); else scene.remove(ring);
  })();
  let h = 0; const str = String(id); for (let i = 0; i < str.length; i++) h = (h * 131 + str.charCodeAt(i)) >>> 0;
  setPanel(['SEALED', str.replace(/_/g, '.'), 'receipt ' + ('00000000' + h.toString(16)).slice(-8), 'Graduated: ' + graduatedCount], '#ffd76a');
}
function cameraPickEntry() {
  camera.updateMatrixWorld();
  raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
  camera.getWorldDirection(raycaster.ray.direction);
  const hits = raycaster.intersectObjects(grabbables, true);
  if (!hits.length) return null;
  let g = hits[0].object; while (g && !(g.userData && g.userData.kind === 'entry')) g = g.parent;
  return g || null;
}
function enterFirstPerson() {
  if (renderer.xr.isPresenting) return;
  desktopMode = 'first-person';
  document.body.dataset.mode = 'first-person';
}
renderer.domElement.addEventListener('click', () => {
  enterFirstPerson();
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) enterFirstPerson();
});
// Gate 25: replay saved graduations onto the gems so a resumed campaign shows
// real prior progress (the entries you already graduated stay graduated).
function restoreGraduatedGems() {
  if (!campaign.graduatedIds.length) return;
  for (const g of grabbables) {
    const id = g.userData.entryId || g.userData.name;
    if (campaign.graduatedIds.indexOf(id) !== -1 && !g.userData.graduated) {
      g.userData.graduated = true;
      g.position.y += 4;
    }
  }
}
window.addEventListener('gold-game-start', () => {
  started = true;
  restoreGraduatedGems();
  resetToOverlook();
  emitCampaign();
});
// Gate 25: resume picks up exactly where the saved campaign left off.
window.addEventListener('gold-game-resume', () => {
  started = true;
  restoreGraduatedGems();
  enterFirstPerson();
  setPanel(['RESUMED', 'Graduated: ' + graduatedCount, campaign.campaignComplete ? campaign.nextRatchet : 'Continue the climb'], '#d4af37');
  emitCampaign();
});
window.addEventListener('gold-game-inspect-first', () => {
  dispatchEntry(cameraPickEntry() || grabbables.find((o) => !o.userData.graduated));
});
// Gate 25: opening the lineage constellation completes the Lineage Walk quest.
window.addEventListener('gold-game-lineage-walk', () => {
  if (setQuestDone('lineage-walk')) { saveCampaign(); emitCampaign(); }
});
window.addEventListener('gold-game-reset-to-overlook', () => resetToOverlook());
// Surface the loaded campaign immediately so the HUD reflects saved progress on boot.
emitCampaign();
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= e.movementX * 0.0023;
  player.pitch = Math.max(-1.25, Math.min(1.1, player.pitch - e.movementY * 0.002));
});
addEventListener('keydown', (e) => {
  keys.add(e.code);
  const k = e.key;
  if (['w','W','a','A','s','S','d','D','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)) enterFirstPerson();
  if (k === 'e' || k === 'E' || k === ' ' || k === 'Enter') {
    enterFirstPerson();
    const picked = cameraPickEntry() || grabbables.find((o) => !o.userData.graduated);
    graduateGem(picked, 'GRADUATED via HoloGate (first-person)');
  }
  if (k === 'f' || k === 'F') {
    enterFirstPerson();
    dispatchEntry(cameraPickEntry() || grabbables.find((o) => !o.userData.graduated));
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
function updateFirstPerson(dt) {
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const speed = player.speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.8 : 1) * dt;
  if (keys.has('KeyW') || keys.has('ArrowUp')) player.position.addScaledVector(forward, speed);
  if (keys.has('KeyS') || keys.has('ArrowDown')) player.position.addScaledVector(forward, -speed);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) player.position.addScaledVector(right, -speed);
  if (keys.has('KeyD') || keys.has('ArrowRight')) player.position.addScaledVector(right, speed);
  player.position.y = 1.65;
  camera.position.copy(player.position).sub(rig.position);
  camera.rotation.set(player.pitch, player.yaw, 0);
}
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const inVR = renderer.xr.isPresenting;
  for (const g of glow) g.rotation.y += 0.012;
  if (inVR) {
    // Headset drives the camera pose; render per-eye directly (EffectComposer is
    // not XR-aware, so bloom is dropped inside the session — correctness over polish).
    renderer.render(scene, camera);
  } else if (desktopMode === 'first-person') {
    updateFirstPerson(dt);
    composer.render();
  } else {
    orbitT += 0.0025;
    const rad = 17;
    camera.position.set(Math.cos(orbitT) * rad, 6 + Math.sin(orbitT * 0.5) * 3, Math.sin(orbitT) * rad - 4);
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
  platform: 'browser', write: false, logLevel: 'silent', nodePaths: [join(repo, 'node_modules')],
  plugins: [{
    name: 'gold-game-holoscript-imports',
    setup(build) {
      build.onResolve({ filter: /^gold-game:holo-portal-intent$/ }, () => ({ path: portalIntentPath }));
    },
  }] });
const bundle = result.outputFiles[0].text;
rmSync(entryPath, { force: true });

// ── 5. Self-contained index.html ────────────────────────────────────────────
const tierList = regions.map((rg) => '<li>' + rg.name + ' — y=' + rg.origin[1] + '</li>').join('');
const goldDataScript = `<script>
(function(){
  var scene = window.__GOLD_GAME_SCENE__ || { meshes: [] };
  var entries = (scene.meshes || []).filter(function(m){ return m.entryId; });
  var catalog = (scene.vaultCatalog && scene.vaultCatalog.entries) || [];
  var catalogById = {};
  catalog.forEach(function(e){ catalogById[e.id] = e; });
  var panel = document.getElementById('entryPanel');
  var list = document.getElementById('entryList');
  var title = document.getElementById('entryTitle');
  var meta = document.getElementById('entryMeta');
  var body = document.getElementById('entryBody');
  var lineageEl = document.getElementById('entryLineage');
  var receiptsEl = document.getElementById('entryReceipts');
  var close = document.getElementById('entryClose');
  function entryLabel(entry){
    var md = (entry && entry.entryData && entry.entryData.metadata) || {};
    return md.id || entry.entryId || entry.name;
  }
  function renderButtons(){
    list.innerHTML = '';
    entries.forEach(function(entry){
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = entryLabel(entry);
      button.addEventListener('click', function(){ showEntry(entry.entryId, entry.entryData); });
      list.appendChild(button);
    });
  }
  // Gate 28: lineage links the player can click to walk the knowledge graph.
  function renderLineage(id, data){
    if (!lineageEl) return;
    lineageEl.innerHTML = '';
    var md = (data && data.metadata) || {};
    var links = (data && data.lineage) || (catalogById[id] && catalogById[id].lineage) || [];
    if (!links.length) { lineageEl.textContent = 'lineage: (no links)'; return; }
    var label = document.createElement('span');
    label.textContent = 'lineage: ';
    lineageEl.appendChild(label);
    links.forEach(function(linkId){
      var a = document.createElement('button');
      a.type = 'button'; a.className = 'lineageLink';
      a.textContent = linkId;
      a.disabled = !catalogById[linkId]; // dim links that aren't browsable entries
      a.addEventListener('click', function(){ showEntry(linkId, null); });
      lineageEl.appendChild(a);
    });
  }
  // Gate 28: the receipt/provenance history each graduated entry carries.
  function renderReceipts(id, data){
    if (!receiptsEl) return;
    var prov = (data && data.provenance) || (catalogById[id] && catalogById[id].provenance) || {};
    var rows = [
      prov.status ? 'status: ' + prov.status : '',
      prov.tier ? 'tier: ' + prov.tier : '',
      prov.graduated ? 'graduated: ' + prov.graduated : '',
      prov.sha256 ? 'sha256: ' + String(prov.sha256).slice(0, 24) + '…' : '',
      (prov.sourceIds && prov.sourceIds.length) ? 'source_ids: ' + prov.sourceIds.length : ''
    ].filter(Boolean);
    receiptsEl.textContent = rows.length ? 'receipts — ' + rows.join('  ·  ') : 'receipts: (none recorded)';
  }
  function renderEntry(data, fallbackId){
    var md = (data && data.metadata) || {};
    var id = md.id || fallbackId || '';
    title.textContent = md.title || (catalogById[id] && catalogById[id].title) || fallbackId || 'GOLD entry';
    meta.textContent = [
      id,
      md.type ? 'type: ' + md.type : '',
      md.domain ? 'domain: ' + md.domain : '',
      data && data.relativePath ? data.relativePath : (catalogById[id] && catalogById[id].relativePath) || ''
    ].filter(Boolean).join('  |  ');
    body.textContent = (data && data.content) || 'Body not embedded for this entry. Launch the Node launcher (live server) to read the full markdown of every entry; seeded gems carry their full body offline.';
    renderLineage(id, data);
    renderReceipts(id, data);
    panel.dataset.open = 'true';
  }
  async function showEntry(id, embedded){
    var data = embedded || null;
    try {
      if (location.protocol !== 'file:') {
        var response = await fetch('./api/vault-entry?id=' + encodeURIComponent(id));
        if (response.ok) data = await response.json();
      }
    } catch (_) {}
    renderEntry(data, id);
  }
  close.addEventListener('click', function(){ panel.dataset.open = 'false'; });
  window.addEventListener('gold-entry-selected', function(e){ showEntry(e.detail.id, e.detail.entry); });
  renderButtons();
  var initial = entries.find(function(entry){ return entry.entryData && entry.entryData.content; }) || entries[0];
  if (initial) renderEntry(initial.entryData, initial.entryId);
})();
</script>`;
// Gate 28: the FULL-VAULT BROWSER — search/filter/open EVERY entry in the vault.
const vaultBrowserScript = `<script>
(function(){
  var scene = window.__GOLD_GAME_SCENE__ || {};
  var cat = scene.vaultCatalog || { entries: [], facets: {}, count: 0 };
  var all = cat.entries || [];
  var panel = document.getElementById('vaultBrowser');
  var toggle = document.getElementById('vaultToggle');
  var close = document.getElementById('vaultClose');
  var search = document.getElementById('vaultSearch');
  var tierSel = document.getElementById('vaultTier');
  var typeSel = document.getElementById('vaultType');
  var listEl = document.getElementById('vaultResults');
  var countEl = document.getElementById('vaultCount');
  if (!panel || !listEl) return;
  // Pure filter — identical shape to vault-ops.filterCatalog so offline == live.
  function applyFilter(){
    var q = (search && search.value || '').trim().toLowerCase();
    var tier = (tierSel && tierSel.value) || '';
    var type = (typeSel && typeSel.value) || '';
    var rows = all.filter(function(e){
      if (tier && e.tier !== tier) return false;
      if (type && e.type !== type) return false;
      if (q){
        var hay = (e.id + ' ' + e.title + ' ' + e.domain + ' ' + e.type).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    render(rows);
  }
  function render(rows){
    if (countEl) countEl.textContent = rows.length + ' / ' + all.length + ' entries';
    listEl.innerHTML = '';
    // cap DOM rows for responsiveness; full set still searchable/filterable
    rows.slice(0, 400).forEach(function(e){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'vaultRow'; b.dataset.id = e.id; b.dataset.tier = e.tier || '';
      b.innerHTML = '<span class="vid"></span><span class="vtt"></span><span class="vtier"></span>';
      b.querySelector('.vid').textContent = e.id;
      b.querySelector('.vtt').textContent = e.title || '';
      b.querySelector('.vtier').textContent = (e.tier || '') + (e.lineage && e.lineage.length ? ' · ' + e.lineage.length + ' links' : '');
      b.addEventListener('click', function(){
        // open the entry in the inspector (live body fetch happens there)
        window.dispatchEvent(new CustomEvent('gold-entry-selected', { detail: { id: e.id, entry: null } }));
      });
      listEl.appendChild(b);
    });
    if (rows.length > 400){
      var more = document.createElement('div'); more.className = 'vaultMore';
      more.textContent = '… ' + (rows.length - 400) + ' more — narrow with search/filter';
      listEl.appendChild(more);
    }
  }
  // populate facet dropdowns from the embedded catalog facets
  function fillSelect(sel, facet, label){
    if (!sel) return;
    sel.innerHTML = '<option value="">' + label + '</option>';
    Object.keys(facet || {}).sort().forEach(function(k){
      var o = document.createElement('option'); o.value = k;
      o.textContent = k + ' (' + facet[k] + ')'; sel.appendChild(o);
    });
  }
  fillSelect(tierSel, cat.facets && cat.facets.tiers, 'all tiers');
  fillSelect(typeSel, cat.facets && cat.facets.types, 'all types');
  search && search.addEventListener('input', applyFilter);
  tierSel && tierSel.addEventListener('change', applyFilter);
  typeSel && typeSel.addEventListener('change', applyFilter);
  function setOpen(v){ panel.dataset.open = v ? 'true' : 'false'; if (v) applyFilter(); }
  toggle && toggle.addEventListener('click', function(){ setOpen(panel.dataset.open !== 'true'); });
  close && close.addEventListener('click', function(){ setOpen(false); });
  window.addEventListener('keydown', function(e){ if ((e.key === 'v' || e.key === 'V') && !/input|textarea/i.test((e.target||{}).tagName||'')) setOpen(panel.dataset.open !== 'true'); });
  applyFilter();
})();
</script>`;
// Gate 29: VISIBLE agent party. Embeds the SAME persona roster + deterministic POOL
// the verified gold-game-party.mjs engine uses, so the on-screen companions render the
// same persona-attributable picks the engine proves (cold-session). REWARD/ceiling are
// the engine's real economy constants (REWARD=25, $0.50/day agenda ceiling).
const partyData = {
  reward: 25,
  dailyCeilingUsd: 0.5,
  roster: [
    { id: 'companion-archivist', name: 'Maren the Archivist', glyph: '📜', persona: 'lineage-depth' },
    { id: 'companion-scout', name: 'Edda the Scout', glyph: '🧭', persona: 'breadth/novelty' },
    { id: 'companion-quartermaster', name: 'Bran the Quartermaster', glyph: '⚖️', persona: 'ROI' },
  ],
  pool: [
    { id: 'P.PARTY.001', title: 'cross-domain-synthesis-of-causal-and-quantum', lineage_links: 6 },
    { id: 'P.PARTY.002', title: 'receipt-with-solver', lineage_links: 5 },
    { id: 'P.PARTY.003', title: 'survey-before-gap-analysis', lineage_links: 4 },
    { id: 'P.PARTY.004', title: 'import-array-regex-gate', lineage_links: 3 },
    { id: 'P.PARTY.005', title: 'apply-four-refusals-to-own-analysis', lineage_links: 2 },
    { id: 'P.PARTY.006', title: 'scavenging-is-the-default', lineage_links: 1 },
  ],
};
const partyBoot = '<script>window.__GOLD_GAME_PARTY__=' + JSON.stringify(partyData) + ';</script>';
// Gate 29: render the named party — each companion CHOOSES (persona policy), EXPLAINS
// (grounded voice + live lineage/budget), and SPENDS under the metered ceiling.
const partyPanelScript = `<script>
(function(){
  var P = window.__GOLD_GAME_PARTY__; if (!P) return;
  var panel = document.getElementById('agentParty');
  var toggle = document.getElementById('partyToggle');
  var close = document.getElementById('partyClose');
  var listEl = document.getElementById('partyList');
  if (!panel || !listEl) return;
  // The persona score/voice — byte-faithful to gold-game-party.mjs PARTY[].
  var score = {
    'companion-archivist': function(e){ return (e.lineage_links||0)*10; },
    'companion-scout': function(e){ return (e.title||'').length*1.5 + (e.lineage_links||0); },
    'companion-quartermaster': function(e){ return 100 - (e.lineage_links||0)*5; }
  };
  var voice = {
    'companion-archivist': function(e){ return e.lineage_links + ' threads run through "' + e.title + '" — that depth is what the ledger should remember.'; },
    'companion-scout': function(e){ return '"' + e.title + '" opens ground we havent mapped — Ill plant the flag there.'; },
    'companion-quartermaster': function(e){ return '"' + e.title + '" earns its keep for the least outlay — ' + e.lineage_links + ' links is plenty. Good stewardship.'; }
  };
  function planAndRender(){
    listEl.innerHTML = '';
    var taken = {};
    P.roster.forEach(function(c){
      var pool = P.pool.filter(function(e){ return (e.lineage_links||0) >= 1 && !taken[e.id]; });
      var card = document.createElement('div');
      card.className = 'partyCard'; card.dataset.companion = c.id; card.setAttribute('data-gate29', 'companion');
      if (!pool.length){
        card.innerHTML = '<div class="pcHead"></div><div class="pcPick">nothing left that respects the players taste</div>';
        card.querySelector('.pcHead').textContent = c.glyph + ' ' + c.name;
        listEl.appendChild(card); return;
      }
      pool.sort(function(a,b){ return (score[c.id](b) - score[c.id](a)) || (a.id < b.id ? -1 : 1); });
      var pick = pool[0]; taken[pick.id] = true;
      var reason = voice[c.id](pick) + ' (lineage=' + pick.lineage_links + ', earned +' + P.reward + ', under $' + P.dailyCeilingUsd.toFixed(2) + '/day ceiling)';
      card.innerHTML = '<div class="pcHead"></div><div class="pcPick" data-gate29="choice"></div>'
        + '<div class="pcWhy" data-gate29="explanation"></div><div class="pcBudget" data-gate29="budget"></div>';
      card.querySelector('.pcHead').textContent = c.glyph + ' ' + c.name;
      card.querySelector('.pcPick').textContent = 'graduates ' + pick.id + ' — ' + pick.title;
      card.querySelector('.pcWhy').textContent = reason;
      card.querySelector('.pcBudget').textContent = 'reward +' + P.reward + ' · ceiling $' + P.dailyCeilingUsd.toFixed(2) + '/day (not breached)';
      listEl.appendChild(card);
    });
  }
  function setOpen(v){ panel.dataset.open = v ? 'true' : 'false'; if (v) planAndRender(); }
  toggle && toggle.addEventListener('click', function(){ setOpen(panel.dataset.open !== 'true'); });
  close && close.addEventListener('click', function(){ setOpen(false); });
  window.addEventListener('keydown', function(e){ if ((e.key === 'p' || e.key === 'P') && !/input|textarea/i.test((e.target||{}).tagName||'')) setOpen(panel.dataset.open !== 'true'); });
  planAndRender();
})();
</script>`;
const conceptArtBoot = '<script>window.__GOLD_GAME_CONCEPT_ART__=' + JSON.stringify(conceptArt ? conceptArt.dataUrl : '') +
  ';window.__GOLD_GAME_CONCEPT_ART_META__=' + JSON.stringify(conceptArt ? {
    file: conceptArt.file,
    source: conceptArt.source,
    mime: conceptArt.mime,
    bytes: conceptArt.bytes,
    width: conceptArt.width,
    height: conceptArt.height,
    sha256: conceptArt.sha256,
    role: conceptArt.role,
  } : null) + ';</script>';
const toolsetBoot = '<script>window.__GOLD_GAME_TOOLSET__=' + JSON.stringify(holoscriptToolset) + ';</script>';
const holomapBoot = '<script>window.__GOLD_GAME_HOLOMAP_ROOM__=' + JSON.stringify(holomapRoom.found ? holomapRoom : null) + ';</script>';
const holographicExportBoot = '<script>window.__GOLD_GAME_HOLOGRAPHIC_EXPORT__=' + JSON.stringify(holographicExport.found ? holographicExport : null) + ';</script>';
// Gate 41: embed the deterministic Knowledge Mountain mount payload (the full real vault
// region) so the playable build renders it, not only the standalone viewer.
const mountainBoot = '<script>window.__GOLD_GAME_KNOWLEDGE_MOUNTAIN__=' + JSON.stringify(knowledgeMountain) + ';</script>';
// Gate 34: embed the Gate-32 depth-displaced world source so the scene renders the
// founder art as a REAL 3D depth surface (parallax) behind DiamondPeak — not a flat
// skybox. Reads the SAME gold-vault-vista-world.json the Gate-32 verifier emitted.
let vistaWorld = null;
try { vistaWorld = JSON.parse(readFileSync(join(here, 'gold-vault-vista-world.json'), 'utf8')); } catch { /* no vista yet */ }
const vistaGrid = vistaWorld?.generated_group?.depthGrid || null;
const vistaBoot = '<script>window.__GOLD_GAME_VISTA__=' + JSON.stringify(vistaGrid) + ';</script>';

// ── Gate 37: SELF-PROVING BOOT ────────────────────────────────────────────────
// On load the air-gapped build RE-DERIVES the SHA-256 of its own embedded data blobs
// and compares to a build-time manifest — proving the bytes you're running are the
// bytes that were sealed, re-checked OFFLINE on the player's own machine, no network.
// HONEST: this proves DATA INTEGRITY offline; it does NOT re-run the TS gate verifiers
// (those need the dev repo). The receipts ride on the drive for full re-derivation.
// Pure-JS SHA-256 (NOT crypto.subtle) so it works on file:// (no secure context). The
// gate-37 verifier cross-checks this exact function against Node's createHash, so a
// buggy impl FAILS the gate (anti-F.069).
const SHA256_JS = `function(str){
  function rr(v,a){return (v>>>a)|(v<<(32-a));}
  var u8=unescape(encodeURIComponent(str)); // string -> UTF-8 byte string (charCode<256)
  var mp=Math.pow,mw=mp(2,32),words=[],bitLen=u8.length*8,i,j;
  var h=[],k=[],pc=0,comp={};
  for(var c=2;pc<64;c++){if(!comp[c]){for(i=0;i<313;i+=c)comp[i]=c;h[pc]=(mp(c,.5)*mw)|0;k[pc++]=(mp(c,1/3)*mw)|0;}}
  u8+='\\x80';while(u8.length%64-56)u8+='\\x00';
  for(i=0;i<u8.length;i++){j=u8.charCodeAt(i);words[i>>2]|=j<<((3-i)%4)*8;}
  words[words.length]=((bitLen/mw)|0);words[words.length]=(bitLen);
  for(j=0;j<words.length;){
    var w=words.slice(j,j+=16),oh=h;h=h.slice(0,8);
    for(i=0;i<64;i++){
      var w15=w[i-15],w2=w[i-2],a=h[0],e=h[4];
      var t1=(h[7]+(rr(e,6)^rr(e,11)^rr(e,25))+((e&h[5])^((~e)&h[6]))+k[i]+(w[i]=(i<16)?(w[i]|0):((w[i-16]+(rr(w15,7)^rr(w15,18)^(w15>>>3))+w[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10)))|0)))|0;
      var t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&h[1])^(a&h[2])^(h[1]&h[2])))|0;
      h=[(t1+t2)|0].concat(h);h[4]=(h[4]+t1)|0;
    }
    for(i=0;i<8;i++)h[i]=(h[i]+oh[i])|0;
  }
  var r='';for(i=0;i<8;i++)for(j=3;j+1;j--){var b=(h[i]>>(j*8))&255;r+=((b<16)?'0':'')+b.toString(16);}
  return r;
}`;
// Cross-check the embedded function against Node's real SHA-256 at build time (and seal
// the manifest with the EMBEDDED function so build == browser byte-for-byte).
const browserSha = new Function('return (' + SHA256_JS + ')')();
for (const tv of ['', 'abc', 'GOLD📜']) {
  if (browserSha(tv) !== sha256(Buffer.from(tv, 'utf8'))) {
    throw new Error('embedded SHA-256 disagrees with node:crypto for "' + tv + '" — self-proof would be invalid');
  }
}
const selfProofManifest = [
  vistaGrid ? { name: 'vista (depth world)', key: '__GOLD_GAME_VISTA__', sha256: browserSha(JSON.stringify(vistaGrid)) } : null,
  holomapRoom.found ? { name: 'holomap (scanned room)', key: '__GOLD_GAME_HOLOMAP_ROOM__', sha256: browserSha(JSON.stringify(holomapRoom)) } : null,
  holographicExport.found ? { name: 'hologram export (quilt/MVHEVC)', key: '__GOLD_GAME_HOLOGRAPHIC_EXPORT__', sha256: browserSha(JSON.stringify(holographicExport)) } : null,
  knowledgeMountain ? { name: 'knowledge mountain (full vault region)', key: '__GOLD_GAME_KNOWLEDGE_MOUNTAIN__', sha256: browserSha(JSON.stringify(knowledgeMountain)) } : null,
  { name: 'toolset (HoloScript packages)', key: '__GOLD_GAME_TOOLSET__', sha256: browserSha(JSON.stringify(holoscriptToolset)) },
  { name: 'party (AI companions)', key: '__GOLD_GAME_PARTY__', sha256: browserSha(JSON.stringify(partyData)) },
].filter(Boolean);
// NOTE: no wall-clock timestamp here — the build must stay byte-deterministic (Gate 30
// asserts two packagings are identical), so the self-proof seal is content-only.
const selfProofBoot = '<script>window.__GOLD_GAME_SELFPROOF__=' + JSON.stringify({
  manifest: selfProofManifest, algo: 'sha256(utf8)',
}) + ';window.__GOLD_GAME_SHA256__=(' + SHA256_JS + ');</script>';
const selfProofScript = `<script>
(function(){
  var SP = window.__GOLD_GAME_SELFPROOF__, sha = window.__GOLD_GAME_SHA256__;
  if (!SP || !SP.manifest || typeof sha !== 'function') return;
  var panel = document.getElementById('selfProof');
  var toggle = document.getElementById('selfProofToggle');
  var close = document.getElementById('selfProofClose');
  var listEl = document.getElementById('selfProofList');
  var sumEl = document.getElementById('selfProofSummary');
  if (!panel || !listEl) return;
  function run(){
    listEl.innerHTML = ''; var pass = 0;
    for (var i = 0; i < SP.manifest.length; i++){
      var m = SP.manifest[i], val = window[m.key], ok = false;
      if (val !== undefined) ok = (sha(JSON.stringify(val)) === m.sha256);
      if (ok) pass++;
      var row = document.createElement('div');
      row.className = 'spRow'; row.setAttribute('data-gate37', 'check'); row.dataset.ok = ok ? 'true' : 'false';
      row.innerHTML = '<span class="spName"></span><span class="spState"></span>';
      row.querySelector('.spName').textContent = m.name;
      row.querySelector('.spState').textContent = ok ? 're-derived \\u2713' : 'MISMATCH';
      listEl.appendChild(row);
    }
    var allOk = pass === SP.manifest.length;
    panel.dataset.proof = allOk ? 'pass' : 'fail';
    if (sumEl) sumEl.textContent = pass + '/' + SP.manifest.length + ' systems re-verified OFFLINE on THIS machine \\u2014 no network, no trust required.';
  }
  function setOpen(v){ panel.dataset.open = v ? 'true' : 'false'; }
  toggle && toggle.addEventListener('click', function(){ setOpen(panel.dataset.open !== 'true'); });
  close && close.addEventListener('click', function(){ setOpen(false); });
  window.addEventListener('keydown', function(e){ if ((e.key === 's' || e.key === 'S') && !/input|textarea/i.test((e.target||{}).tagName||'')) setOpen(panel.dataset.open !== 'true'); });
  run(); // compute the proof on load so it's ready before the panel opens
})();
</script>`;
const startOnboardingScript = `<script>
(function(){
  var start = document.getElementById('startScreen');
  var begin = document.getElementById('beginRun');
  var inspect = document.getElementById('inspectFirst');
  var retry = document.getElementById('retryStart');
  var art = window.__GOLD_GAME_CONCEPT_ART__;
  if (start && art) {
    start.style.backgroundImage = 'linear-gradient(90deg, rgba(3,4,8,.82), rgba(3,4,8,.42) 46%, rgba(3,4,8,.18)), url("' + art + '")';
  }
  function openGate(){
    if (start) start.dataset.open = 'false';
    document.body.dataset.started = 'true';
    window.dispatchEvent(new CustomEvent('gold-game-start'));
  }
  begin && begin.addEventListener('click', openGate);
  inspect && inspect.addEventListener('click', function(){
    if (start) start.dataset.open = 'false';
    window.dispatchEvent(new CustomEvent('gold-game-inspect-first'));
  });
  retry && retry.addEventListener('click', function(){
    document.body.dataset.started = 'true';
    window.dispatchEvent(new CustomEvent('gold-game-reset-to-overlook'));
  });
  // Gate 25: show Continue only when a saved campaign exists; resume from it.
  var cont = document.getElementById('continueRun');
  try {
    var raw = window.localStorage && window.localStorage.getItem('goldGame.campaign.v1');
    var saved = raw ? JSON.parse(raw) : null;
    if (cont && saved && saved.version === 1 && (saved.oneClimbComplete || (saved.graduatedIds && saved.graduatedIds.length))) {
      cont.dataset.visible = 'true';
      cont.addEventListener('click', function(){
        if (start) start.dataset.open = 'false';
        document.body.dataset.started = 'true';
        window.dispatchEvent(new CustomEvent('gold-game-resume'));
      });
    }
  } catch (_) {}
})();
</script>`;
const toolsetScript = `<script>
(function(){
  var toolset = window.__GOLD_GAME_TOOLSET__ || { systems: [] };
  var list = document.getElementById('toolsetList');
  var count = document.getElementById('toolsetCount');
  var toggle = document.getElementById('toolsetToggle');
  var panel = document.getElementById('toolsetPanel');
  var close = document.getElementById('toolsetClose');
  if (!list || !panel) return;
  var systems = toolset.systems || [];
  if (count) count.textContent = systems.filter(function(s){ return s.found; }).length + ' package systems';
  systems.forEach(function(system){
    var row = document.createElement('div');
    row.className = 'toolsetRow';
    row.dataset.found = system.found ? 'true' : 'false';
    row.innerHTML = '<strong></strong><span></span><small></small>';
    row.querySelector('strong').textContent = system.role + ' · ' + (system.name || system.dir);
    row.querySelector('span').textContent = system.consumes || '';
    row.querySelector('small').textContent = system.dir + (system.version ? ' @ ' + system.version : '') + (system.found ? '' : ' · missing');
    list.appendChild(row);
  });
  function setOpen(value){ panel.dataset.open = value ? 'true' : 'false'; }
  toggle && toggle.addEventListener('click', function(){ setOpen(panel.dataset.open !== 'true'); });
  close && close.addEventListener('click', function(){ setOpen(false); });
})();
</script>`;
const holomapRoomScript = `<script>
(function(){
  var room = window.__GOLD_GAME_HOLOMAP_ROOM__;
  var panel = document.getElementById('holomapPanel');
  var toggle = document.getElementById('holomapToggle');
  var close = document.getElementById('holomapClose');
  var list = document.getElementById('holomapFacts');
  if (!panel || !list) return;
  function add(label, value){
    var row = document.createElement('div');
    row.className = 'proofRow';
    row.innerHTML = '<strong></strong><span></span>';
    row.querySelector('strong').textContent = label;
    row.querySelector('span').textContent = value || 'n/a';
    list.appendChild(row);
  }
  if (room) {
    add('portal', (room.portal && room.portal.label) || 'HoloMap Room');
    add('capture', room.source ? (room.source.frames + ' frames @ ' + room.source.width + 'x' + room.source.height) : '');
    add('points', room.holomap && room.holomap.export ? String(room.holomap.export.exportPointCount) : '');
    add('anchor revision', room.holomap && room.holomap.anchor ? String(room.holomap.anchor.revision) : '');
    add('space digest', room.contract ? String(room.contract.spaceDigest).slice(0, 24) : '');
  } else {
    add('status', 'missing Gate 33 artifact');
  }
  function setOpen(value){ panel.dataset.open = value ? 'true' : 'false'; }
  toggle && toggle.addEventListener('click', function(){ setOpen(panel.dataset.open !== 'true'); });
  close && close.addEventListener('click', function(){ setOpen(false); });
})();
</script>`;
const holographicExportScript = `<script>
(function(){
  var exp = window.__GOLD_GAME_HOLOGRAPHIC_EXPORT__;
  var panel = document.getElementById('hologramExportPanel');
  var toggle = document.getElementById('hologramExportToggle');
  var close = document.getElementById('hologramExportClose');
  var list = document.getElementById('hologramExportFacts');
  if (!panel || !list) return;
  function add(label, value){
    var row = document.createElement('div');
    row.className = 'proofRow';
    row.innerHTML = '<strong></strong><span></span>';
    row.querySelector('strong').textContent = label;
    row.querySelector('span').textContent = value || 'n/a';
    list.appendChild(row);
  }
  if (exp) {
    add('quilt', exp.quilt ? (exp.quilt.device + ' ' + exp.quilt.views + ' views ' + exp.quilt.grid) : '');
    add('mv-hevc', exp.mvhevc ? (exp.mvhevc.stereoMode + ' ' + exp.mvhevc.fps + 'fps') : '');
    add('parallax', exp.parallax ? (exp.parallax.frames + ' frames') : '');
    add('targets', exp.shareReceipt ? (exp.shareReceipt.targets || []).join(', ') : '');
    add('export digest', exp.shareReceipt ? String(exp.shareReceipt.exportDigest).slice(0, 24) : '');
  } else {
    add('status', 'missing Gate 38 artifact');
  }
  function setOpen(value){ panel.dataset.open = value ? 'true' : 'false'; }
  toggle && toggle.addEventListener('click', function(){ setOpen(panel.dataset.open !== 'true'); });
  close && close.addEventListener('click', function(){ setOpen(false); });
})();
</script>`;
const holoGraphScript = `<script>
(function(){
  var scene = window.__GOLD_GAME_SCENE__ || {};
  var graph = scene.holoGraph || { nodes: [], edges: [] };
  var panel = document.getElementById('graphPanel');
  var toggle = document.getElementById('graphToggle');
  var close = document.getElementById('graphClose');
  var canvas = document.getElementById('graphCanvas');
  var nodeList = document.getElementById('graphNodes');
  var meta = document.getElementById('graphMeta');
  if (!panel || !canvas || !nodeList) return;
  var nodes = graph.nodes || [];
  var edges = graph.edges || [];
  function setOpen(value){ panel.dataset.open = value ? 'true' : 'false'; }
  function dispatchNode(node){
    if (!node) return;
    window.dispatchEvent(new CustomEvent('gold-entry-selected', { detail: { id: node.id, entry: node.entryData || null } }));
  }
  function pointFor(index, count){
    var cx = 180, cy = 118, r = count > 4 ? 84 : 68;
    var a = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }
  function draw(){
    canvas.innerHTML = '';
    var ns = 'http://www.w3.org/2000/svg';
    var byId = {};
    nodes.forEach(function(node, i){ byId[node.id] = pointFor(i, nodes.length); });
    edges.forEach(function(edge){
      var a = byId[edge.source], b = byId[edge.target];
      if (!a || !b) return;
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('stroke', '#8db9ff'); line.setAttribute('stroke-opacity', '.56');
      line.setAttribute('stroke-width', '2');
      canvas.appendChild(line);
    });
    nodes.forEach(function(node, i){
      var p = byId[node.id];
      var group = document.createElementNS(ns, 'g');
      group.setAttribute('class', 'graphNode');
      group.setAttribute('data-id', node.id);
      var circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y);
      circle.setAttribute('r', node.reachableFrom534 ? '14' : '11');
      circle.setAttribute('fill', node.semanticScore ? '#ffe9a0' : '#dbe8ff');
      circle.setAttribute('stroke', node.reachableFrom534 ? '#d4af37' : '#6f92b8');
      circle.setAttribute('stroke-width', '3');
      var text = document.createElementNS(ns, 'text');
      text.setAttribute('x', p.x); text.setAttribute('y', p.y + 28);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = node.id.replace('W.GOLD.', 'G.');
      group.appendChild(circle); group.appendChild(text);
      group.addEventListener('click', function(){ dispatchNode(node); });
      canvas.appendChild(group);
    });
  }
  function renderList(){
    nodeList.innerHTML = '';
    nodes.forEach(function(node){
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'graphEntry';
      button.dataset.id = node.id;
      button.textContent = node.id + ' — ' + (node.title || 'GOLD entry');
      button.addEventListener('click', function(){ dispatchNode(node); });
      nodeList.appendChild(button);
    });
  }
  if (meta) {
    meta.textContent = [
      nodes.length + ' nodes',
      edges.length + ' edges',
      graph.exactByConstruction ? 'recall 1.0' : '',
      graph.navigable ? 'navigable' : '',
      graph.semanticQuery ? 'query: ' + graph.semanticQuery : ''
    ].filter(Boolean).join('  |  ');
  }
  draw();
  renderList();
  function openGraph(open){ setOpen(open); if (open) window.dispatchEvent(new CustomEvent('gold-game-lineage-walk')); }
  toggle && toggle.addEventListener('click', function(){ openGraph(panel.dataset.open !== 'true'); });
  close && close.addEventListener('click', function(){ setOpen(false); });
  window.addEventListener('keydown', function(e){
    if (e.key === 'g' || e.key === 'G') openGraph(panel.dataset.open !== 'true');
  });
})();
</script>`;
// Gate 25: continuous campaign UI — quest log, live objective, post-win banner +
// next-ratchet, driven entirely by the in-scene `gold-game-state` events. No state
// is invented here; it mirrors what the real graduation ops produced.
const campaignScript = `<script>
(function(){
  var toggle = document.getElementById('questToggle');
  var panel = document.getElementById('questPanel');
  var items = document.getElementById('questItems');
  var objective = document.getElementById('objectiveText');
  var banner = document.getElementById('winBanner');
  var winSummary = document.getElementById('winSummary');
  var winNext = document.getElementById('winNext');
  var winContinue = document.getElementById('winContinue');
  if (!panel || !items) return;
  toggle && toggle.addEventListener('click', function(){ panel.dataset.open = panel.dataset.open !== 'true' ? 'true' : 'false'; });
  winContinue && winContinue.addEventListener('click', function(){ if (banner) banner.dataset.open = 'false'; });
  function renderQuests(log){
    items.innerHTML = '';
    (log || []).forEach(function(q){
      var li = document.createElement('li');
      li.className = 'questItem';
      li.dataset.done = q.done ? 'true' : 'false';
      li.innerHTML = '<strong></strong><small></small>';
      li.querySelector('strong').textContent = q.title;
      li.querySelector('small').textContent = q.desc;
      items.appendChild(li);
    });
  }
  function nextOpen(log){ var n = (log || []).find(function(q){ return !q.done; }); return n ? (n.title + ' — ' + n.desc) : null; }
  window.addEventListener('gold-game-state', function(e){
    var s = e.detail || {};
    renderQuests(s.questLog);
    var next = nextOpen(s.questLog);
    if (objective) objective.textContent = s.campaignComplete ? ('Campaign complete · next ratchet: ' + (s.nextRatchet || '')) : (next || 'Keep climbing.');
    if (s.oneClimbComplete && banner) {
      if (winSummary) winSummary.textContent = 'You graduated ' + (s.graduated || 0) + ' GOLD ' + ((s.graduated === 1) ? 'entry' : 'entries') + '. The campaign continues — the vault keeps rising.';
      if (winNext) winNext.textContent = s.nextRatchet || '';
      // Only auto-pop the banner on the transition, not on every resume.
      if (!banner.dataset.shown) { banner.dataset.open = 'true'; banner.dataset.shown = 'true'; }
    }
  });
})();
</script>`;
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
conceptArtBoot +
toolsetBoot +
vistaBoot +
holomapBoot +
holographicExportBoot +
mountainBoot +
'<title>THE GOLD GAME — The Vault</title><style>' +
'html,body{margin:0;height:100%;overflow:hidden;background:#06070a;font-family:system-ui,sans-serif}' +
'#startScreen{position:fixed;inset:0;z-index:30;background:#06070a center/cover no-repeat;display:grid;align-items:end;justify-items:start;padding:clamp(28px,7vw,96px);box-sizing:border-box;color:#fff;transition:opacity .28s ease}' +
'#startScreen[data-open="false"]{opacity:0;pointer-events:none}' +
'#startCopy{max-width:min(620px,88vw);text-shadow:0 2px 16px #000,0 0 42px #000}' +
'#startCopy h1{font-size:clamp(40px,8vw,86px);line-height:.9;margin:0 0 14px;letter-spacing:0;font-weight:800}' +
'#startCopy p{font-size:clamp(15px,2.1vw,20px);line-height:1.45;margin:8px 0;color:#f3e4b0}' +
'#startActions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}' +
'#startActions button,#questHud button{background:#f0d79a;color:#090a0d;border:1px solid #ffe9a0;padding:9px 12px;font-weight:700;cursor:pointer}' +
'#startActions button+button{background:rgba(9,10,13,.72);color:#f0d79a;border-color:#8f7730}' +
'#questHud{position:fixed;left:16px;bottom:14px;z-index:11;color:#f0d79a;text-shadow:0 1px 8px #000;display:flex;gap:10px;align-items:center;max-width:min(620px,calc(100vw - 32px));font-size:12px}' +
'#questHud strong{color:#ffe9a0}' +
'#questToggle{position:fixed;right:16px;bottom:14px;z-index:13;background:#10131b;color:#f0d79a;border:1px solid #8f7730;padding:8px 10px;cursor:pointer;font-size:12px}' +
'#questPanel{position:fixed;right:14px;bottom:54px;width:min(340px,80vw);z-index:14;background:rgba(6,7,10,.95);border:1px solid #d4af37;color:#e9d99d;padding:12px;box-sizing:border-box;display:none;flex-direction:column;gap:8px;box-shadow:0 12px 48px #0008}' +
'#questPanel[data-open="true"]{display:flex}' +
'#questPanel h2{font-size:14px;margin:0;color:#ffe9a0}' +
'#questItems{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}' +
'.questItem{font-size:11px;line-height:1.35;border-left:3px solid #6f6233;padding-left:8px;color:#cbb778}' +
'.questItem[data-done="true"]{border-left-color:#d4af37;color:#ffe9a0}' +
'.questItem[data-done="true"] strong::before{content:"\\2713 ";color:#7ddc7d}' +
'.questItem[data-done="false"] strong::before{content:"\\25cb ";color:#8f7730}' +
'.questItem small{display:block;color:#9c8a52}' +
'#winBanner{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:20;background:rgba(6,7,10,.95);border:2px solid #d4af37;color:#ffe9a0;padding:18px 22px;max-width:min(520px,86vw);text-align:center;display:none;box-shadow:0 16px 64px #000c}' +
'#winBanner[data-open="true"]{display:block}' +
'#winBanner h2{margin:0 0 6px;font-size:22px}' +
'#winBanner p{margin:6px 0;font-size:13px;color:#f3e4b0;line-height:1.45}' +
'#winBanner b{color:#ffe9a0}' +
'#winContinue{margin-top:10px;background:#f0d79a;color:#090a0d;border:1px solid #ffe9a0;padding:9px 14px;font-weight:700;cursor:pointer}' +
'#continueRun{display:none}' +
'#continueRun[data-visible="true"]{display:inline-block}' +
'#toolsetToggle{position:fixed;left:16px;bottom:58px;z-index:13;background:#10131b;color:#f0d79a;border:1px solid #8f7730;padding:8px 10px;cursor:pointer;font-size:12px}' +
'#toolsetPanel{position:fixed;left:14px;top:220px;bottom:104px;width:min(430px,34vw);z-index:13;background:rgba(6,7,10,.94);border:1px solid #6f92b8;color:#dbe8ff;padding:12px;box-sizing:border-box;display:none;flex-direction:column;gap:10px;box-shadow:0 12px 48px #0008}' +
'#toolsetPanel[data-open="true"]{display:flex}' +
'#toolsetPanel h2{font-size:15px;line-height:1.25;margin:0;color:#dff0ff}' +
'#toolsetPanel p{margin:0;color:#adc7df;font-size:11px;line-height:1.35}' +
'#toolsetClose{align-self:flex-start;background:#10131b;color:#dbe8ff;border:1px solid #6f92b8;padding:6px 8px;cursor:pointer}' +
'#toolsetList{overflow:auto;display:flex;flex-direction:column;gap:7px;padding-right:4px}' +
'.toolsetRow{border-left:3px solid #6f92b8;padding:0 0 0 8px;display:grid;gap:2px}' +
'.toolsetRow[data-found="false"]{opacity:.55;border-left-color:#8a2a2a}' +
'.toolsetRow strong{font-size:11px;color:#f2f7ff}' +
'.toolsetRow span,.toolsetRow small{font-size:10px;line-height:1.35;color:#adc7df}' +
'#graphToggle{position:fixed;left:162px;bottom:58px;z-index:13;background:#14100a;color:#f0d79a;border:1px solid #8f7730;padding:8px 10px;cursor:pointer;font-size:12px}' +
'#graphPanel{position:fixed;left:min(462px,36vw);top:220px;bottom:104px;width:min(430px,31vw);z-index:13;background:rgba(6,7,10,.94);border:1px solid #d4af37;color:#e9d99d;padding:12px;box-sizing:border-box;display:none;flex-direction:column;gap:10px;box-shadow:0 12px 48px #0008}' +
'#graphPanel[data-open="true"]{display:flex}' +
'#graphPanel h2{font-size:15px;line-height:1.25;margin:0;color:#ffe9a0}' +
'#graphMeta{font-size:10px;line-height:1.35;color:#bfa75b}' +
'#graphCanvas{width:100%;height:230px;min-height:170px;background:#07090f;border:1px solid #403719}' +
'.graphNode{cursor:pointer}' +
'.graphNode text{font:10px ui-monospace,Consolas,monospace;fill:#d8c590;pointer-events:none}' +
'#graphNodes{overflow:auto;display:flex;flex-direction:column;gap:6px}' +
'#graphClose,.graphEntry{background:#15140f;color:#f0d79a;border:1px solid #8f7730;padding:6px 8px;cursor:pointer;text-align:left;font-size:10px;line-height:1.35}' +
'#holomapToggle{position:fixed;left:272px;bottom:58px;z-index:13;background:#0b1620;color:#bdefff;border:1px solid #42b7d9;padding:8px 10px;cursor:pointer;font-size:12px}' +
'#hologramExportToggle{position:fixed;left:362px;bottom:58px;z-index:13;background:#18130a;color:#ffe9a0;border:1px solid #d4af37;padding:8px 10px;cursor:pointer;font-size:12px}' +
'#holomapPanel,#hologramExportPanel{position:fixed;top:104px;bottom:104px;width:min(360px,30vw);z-index:13;background:rgba(6,7,10,.94);padding:12px;box-sizing:border-box;display:none;flex-direction:column;gap:10px;box-shadow:0 12px 48px #0008}' +
'#holomapPanel{left:14px;border:1px solid #42b7d9;color:#d8f7ff}' +
'#hologramExportPanel{left:min(390px,32vw);border:1px solid #d4af37;color:#f5df9d}' +
'#holomapPanel[data-open="true"],#hologramExportPanel[data-open="true"]{display:flex}' +
'#holomapPanel h2,#hologramExportPanel h2{font-size:15px;line-height:1.25;margin:0}' +
'#holomapPanel p,#hologramExportPanel p{font-size:11px;line-height:1.35;margin:0;color:#adc7df}' +
'#holomapClose,#hologramExportClose{align-self:flex-start;background:#10131b;color:inherit;border:1px solid currentColor;padding:6px 8px;cursor:pointer}' +
'#holomapFacts,#hologramExportFacts{display:flex;flex-direction:column;gap:7px;overflow:auto}' +
'.proofRow{border-left:3px solid currentColor;padding-left:8px;display:grid;gap:2px}' +
'.proofRow strong{font-size:10px;color:#fff}' +
'.proofRow span{font:10px/1.35 ui-monospace,Consolas,monospace;color:inherit;overflow-wrap:anywhere}' +
'#hud{position:fixed;top:14px;left:16px;color:#f0d79a;z-index:10;text-shadow:0 1px 6px #000;max-width:360px}' +
'#hud h1{font-size:18px;margin:0 0 4px;letter-spacing:2px}' +
'#hud p{font-size:12px;margin:2px 0;color:#d8c590;line-height:1.45}' +
'#hud ul{font-size:11px;margin:6px 0 0;padding-left:16px;color:#b09a5a}' +
'#crosshair{position:fixed;left:50%;top:50%;z-index:9;color:#ffe9a0;font:20px monospace;text-shadow:0 1px 8px #000;transform:translate(-50%,-50%);opacity:.78}' +
'#entryPanel{position:fixed;right:14px;top:14px;bottom:14px;width:min(460px,38vw);z-index:12;background:rgba(6,7,10,.92);border:1px solid #d4af37;color:#e9d99d;padding:14px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 48px #0008}' +
'#entryPanel[data-open="false"]{display:none}' +
'#entryPanel h2{font-size:16px;line-height:1.25;margin:0;color:#ffe9a0}' +
'#entryMeta{font-size:11px;line-height:1.35;color:#bfa75b}' +
'#entryList{display:flex;gap:6px;flex-wrap:wrap}' +
'#entryPanel button{background:#15140f;color:#f0d79a;border:1px solid #8f7730;padding:6px 8px;cursor:pointer}' +
'#entryBody{margin:0;white-space:pre-wrap;overflow:auto;font:11px/1.45 ui-monospace,Consolas,monospace;color:#d8c590;background:#090a0d;padding:10px;flex:1}' +
'canvas{display:block;position:fixed;inset:0;z-index:0}' +
'</style></head><body><section id="startScreen" data-open="true" data-gate24="start-onboarding"><div id="startCopy"><h1>THE GOLD GAME</h1>' +
'<p>Bronze Valley opens beneath the Diamond peak. The vault is alive now: art, entries, HoloGate, and the first climb all meet here.</p>' +
'<p><b>First objective:</b> reach a glowing entry, open its full GOLD record, then graduate it.</p>' +
'<div id="startActions"><button id="beginRun" type="button">Begin One Climb</button><button id="continueRun" type="button" data-gate25="resume">Continue Campaign</button><button id="inspectFirst" type="button">Read First Entry</button></div></div></section>' +
'<div id="questHud" data-gate24="objective"><strong>Objective</strong><span id="objectiveText">Graduate one glowing entry, then follow its record upward.</span><button id="retryStart" type="button">Return to Overlook</button></div>' +
'<button id="questToggle" type="button" data-gate25="quest-log">Quest Log</button>' +
'<aside id="questPanel" data-open="false" data-gate25="quest-log"><h2>Quest Log</h2><ul id="questItems"></ul></aside>' +
'<div id="winBanner" data-gate25="post-win"><h2>One Climb complete</h2><p id="winSummary"></p><p>Next ratchet: <b id="winNext"></b></p><button id="winContinue" type="button">Continue the campaign</button></div>' +
'<button id="toolsetToggle" type="button">HoloScript Systems</button>' +
'<aside id="toolsetPanel" data-open="false" data-gate36="holoscript-toolset"><button id="toolsetClose" type="button">Close</button><h2>HoloScript Systems</h2><p id="toolsetCount">package systems</p><div id="toolsetList"></div></aside>' +
'<button id="graphToggle" type="button">HoloGraph</button>' +
'<aside id="graphPanel" data-open="false" data-gate31="playable-holograph"><button id="graphClose" type="button">Close</button><h2>HoloGraph Lineage</h2><div id="graphMeta"></div><svg id="graphCanvas" viewBox="0 0 360 236" role="img" aria-label="GOLD lineage constellation"></svg><div id="graphNodes"></div></aside>' +
'<button id="holomapToggle" type="button" data-gate33="holomap-room">HoloMap</button>' +
'<aside id="holomapPanel" data-open="false" data-gate33="holomap-room-panel"><button id="holomapClose" type="button">Close</button><h2>HoloMap Room</h2><p>Captured frames become an anchored GOLD room portal through the HoloMap session/export path.</p><div id="holomapFacts"></div></aside>' +
'<button id="hologramExportToggle" type="button" data-gate38="holographic-export">Exports</button>' +
'<aside id="hologramExportPanel" data-open="false" data-gate38="holographic-export-panel"><button id="hologramExportClose" type="button">Close</button><h2>HoloGram Exports</h2><p>The depth-real vista is sealed for quilt, MV-HEVC, and parallax targets.</p><div id="hologramExportFacts"></div></aside>' +
'<div id="hud"><h1>THE GOLD GAME · The Vault</h1>' +
'<p>The real GOLD curation system as a world. Bronze valley rises to the Diamond peak; glass gems with glowing cores are real vault entries you graduate.</p>' +
'<p>Photoreal from minimal geometric shapes. Backend stays real AI work; the human plays.</p>' +
'<p><b>Desktop:</b> click the scene for first-person control. WASD moves, mouse looks, E graduates, F opens the full GOLD entry.</p>' +
'<p><b>In VR:</b> pull the trigger to ENTER, then point a controller at a glowing gem and pull the trigger to graduate it — each grab is a HoloGate intent validated against your HoloDoor scope.</p>' +
'<p id="live">vault: open via the launcher for the live count (embedded snapshot on file://)</p>' +
'<ul>' + tierList + '</ul></div><div id="crosshair">+</div>' +
'<aside id="entryPanel" data-open="true"><button id="entryClose" type="button">Close</button><div id="entryList"></div><h2 id="entryTitle">GOLD entry</h2><div id="entryMeta"></div><div id="entryLineage" data-gate28="lineage"></div><div id="entryReceipts" data-gate28="receipts"></div><pre id="entryBody"></pre></aside>' +
'<button id="vaultToggle" type="button" data-gate28="vault-browser">Browse Vault</button>' +
'<aside id="vaultBrowser" data-open="false" data-gate28="full-vault-browser"><button id="vaultClose" type="button">Close</button><h2>Browse the GOLD Vault</h2>' +
'<div id="vaultControls"><input id="vaultSearch" type="search" placeholder="search id / title / domain…" autocomplete="off"><select id="vaultTier"></select><select id="vaultType"></select></div>' +
'<div id="vaultCount">entries</div><div id="vaultResults"></div></aside>' +
'<button id="partyToggle" type="button" data-gate29="agent-party">Party</button>' +
'<aside id="agentParty" data-open="false" data-gate29="agent-party-panel"><button id="partyClose" type="button">Close</button><h2>Your Party</h2><p>Named AI companions climb alongside you — each chooses a GOLD entry by its own persona, explains why, and spends under a metered ceiling.</p><div id="partyList"></div></aside>' +
'<button id="selfProofToggle" type="button" data-gate37="self-proof">Self-Proof</button>' +
'<aside id="selfProof" data-open="false" data-proof="pending" data-gate37="self-proof-panel"><button id="selfProofClose" type="button">Close</button><h2>This drive proves itself</h2><p>No network. On load, each system below is re-hashed (SHA-256) right here in your browser and checked against the seal baked in at build time — so the bytes you are playing are provably the bytes that were verified.</p><div id="selfProofList"></div><p id="selfProofSummary" data-gate37="summary"></p></aside>' +
'<script>' + bundle + '</script>' +
'<script>if(location.protocol!=="file:"){fetch("./api/vault").then(function(r){return r.json()}).then(function(v){var el=document.getElementById("live");if(!el)return;' +
 'el.textContent=v.connected?("LIVE vault: "+(v.total||"?")+" entries · as of "+(v.asOf||"?")):"vault not detected — embedded snapshot"}).catch(function(){});}</script>' +
startOnboardingScript +
toolsetScript +
holomapRoomScript +
holographicExportScript +
holoGraphScript +
goldDataScript +
vaultBrowserScript +
partyBoot +
partyPanelScript +
selfProofBoot +
selfProofScript +
campaignScript +
'</body></html>';
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, 'START-HERE.txt'),
  'THE GOLD GAME — The Vault\\n\\nDouble-click index.html to open the game in any browser.\\n' +
  'Works offline; nothing to install. Gate 24 opens on the founder art vista.\\n' +
  'Click Begin One Climb, then use WASD/mouse, E to graduate, F to inspect full GOLD data.\\n' +
  'Open HoloGraph (or press G) to navigate the GOLD lineage constellation.\\n' +
  'Open HoloScript Systems in-game to see package systems being consumed by the GOLD loop.\\n' +
  'Open HoloMap for the anchored scanned-room portal, and Exports for quilt/MV-HEVC/parallax targets.\\n' +
  'Canonical GOLD product home: D:/GOLD/assets/game/gold-game (HoloScript is the toolset).\\n' +
  'For live full-data reads, use the Node launcher on the deployed Drive copy.\\n');

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
  desktopFirstPerson: { enabled: true, controls: 'click-to-lock pointer; WASD/arrow movement; mouse look; Shift speed; E graduate; F inspect full entry', camera: 'player-position + yaw/pitch, no auto-orbit after entry' },
  goldFullData: { enabled: true, staticEmbeddedEntries: meshes.filter((m) => m.entryData && m.entryData.found).length,
    liveEndpoint: './api/vault-entry?id=<GOLD-ID>', note: 'the right-side panel shows the full markdown body, not only metadata; live mode re-reads D:/GOLD through server.cjs' },
  startOnboarding: { enabled: true, gate: 24, openingVista: conceptArt ? {
      file: conceptArt.file, source: conceptArt.source, width: conceptArt.width,
      height: conceptArt.height, bytes: conceptArt.bytes, sha256: conceptArt.sha256,
    } : null,
    firstObjective: 'reach a glowing entry, open its full GOLD record, then graduate it',
    retryPath: 'Return to Overlook dispatches gold-game-reset-to-overlook',
    nextObjective: 'follow the record upward after the first graduation' },
  playableHoloGraph: { enabled: true, gate: 31,
    nodes: playableHoloGraph.nodes.length,
    edges: playableHoloGraph.edges.length,
    exactByConstruction: playableHoloGraph.exactByConstruction,
    navigable: playableHoloGraph.navigable,
    source: playableHoloGraph.source,
    graphDigest: playableHoloGraph.graphDigest,
    embedDigest: playableHoloGraph.embedDigest,
    interaction: 'HoloGraph button / G key opens lineage constellation; selecting a node dispatches gold-entry-selected and opens full GOLD data' },
  continuousCampaign: { enabled: true, gate: 25,
    saveKey: 'goldGame.campaign.v1', persistence: 'localStorage (survives reload); replays graduated gems on resume',
    questLog: ['one-climb', 'read-record', 'three-summits', 'lineage-walk'],
    winCondition: 'One Climb = first real graduation (recordGraduation); campaign completes when all quests done',
    postWin: 'win banner + persistent next-ratchet pointer; play continues after win, not a dead-end',
    nextRatchet: 'Gate 26 — prove the shared-world shape before claiming MMO',
    resume: 'Continue Campaign button appears only when a save exists; gold-game-resume restores progress',
    note: 'campaign mirrors REAL graduate ops only — no fabricated progress; corrupt/blocked storage degrades to in-memory' },
  holomapRoom: { enabled: holomapRoom.found === true, gate: 33,
    artifact: 'gold-vault-holomap-room.json',
    portalMounted: holomapRoom.found ? 'HoloMapRoomPortal' : null,
    points: holomapRoom.holomap?.export?.exportPointCount || 0,
    spaceDigest: holomapRoom.contract?.spaceDigest || null },
  holographicExport: { enabled: holographicExport.found === true, gate: 38,
    artifact: 'gold-vault-holographic-export.json',
    targets: holographicExport.shareReceipt?.targets || [],
    exportDigest: holographicExport.shareReceipt?.exportDigest || null },
  knowledgeMountain: { enabled: knowledgeMountain !== null, gate: 41,
    artifact: 'knowledge-mountain-coords.json',
    mounted: knowledgeMountain ? 'KnowledgeMountain' : null,
    entries: knowledgeMountain?.entryCount || 0,
    cables: knowledgeMountain?.cableCount || 0,
    missingBridges: knowledgeMountain?.missingBridgeCount || 0,
    terrainDigest: knowledgeMountain?.terrainDigest || null,
    mountDigest: knowledgeMountain?.mountDigest || null,
    additive: true,
    note: 'Gate 39 placed the full real vault as a climbable region + standalone viewer; '
      + 'Gate 41 mounts that region IN the playable drive-build (tier-colored crystals by '
      + 'semantics->x/z + tier elevation, lineage cables) — additive behind the onboarding vault' },
  holoscriptToolset: { enabled: true, gate: 36,
    packageCount: holoscriptToolset.systems.length,
    foundPackageCount: holoscriptToolset.systems.filter((s) => s.found).length,
    systems: holoscriptToolset.systems.map((s) => ({
      dir: s.dir, name: s.name || s.dir, role: s.role, found: s.found, consumes: s.consumes,
    })),
    missing: holoscriptToolset.systems.filter((s) => !s.found).map((s) => s.dir) },
  sceneDigest: sha256(sceneJson), htmlBytes: html.length,
  selfContained: true, offline: true, three: '0.182.0 (bundled IIFE)', core: '6.1.0',
  verifiedAt: new Date().toISOString(),
};
writeFileSync(join(here, 'GOLD-VAULT-gate1-receipt.json'), JSON.stringify(receipt, null, 2));
console.log('BUILD OK — meshes:', meshes.length, '| entries:', receipt.scene.entries,
  '| regions:', regions.length, '| html bytes:', html.length, '| digest:', receipt.sceneDigest.slice(0, 16));
if (esbuild.stop) await esbuild.stop();
process.exit(0);
