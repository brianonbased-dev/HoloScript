/**
 * Brian step 1: import report + fixed-angle turntable, using only HoloScript's own paths.
 *
 *  - Import:   packages/cli/src/importers/gltf-importer.ts  (importGltf -> .holo text)
 *              packages/engine/src/character-render/GltfMeshExtractor.ts (parseGlb, extractGltfStaticMesh)
 *              packages/core/src/assets/HumanoidLoader.ts   (loadAvatar -> humanoidState)
 *  - Render:   packages/engine/src/character-render/character-render.ts renderCharacter(), the
 *              WebGPU draw path CharacterHost.getDrawSpec() feeds, on a Dawn GPUDevice.
 *
 * CharacterHost itself cannot be constructed from a GLB today (its constructor always builds the
 * procedural body, CharacterHost.ts:526-530), so the GLB mesh goes straight into a
 * CharacterDrawSpec for renderCharacter. That gap is written into the manifest, not hidden.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { importGltf } from '../../packages/cli/src/importers/gltf-importer';
import {
  parseGlb,
  extractGltfStaticMesh,
} from '../../packages/engine/src/character-render/GltfMeshExtractor';
import { renderCharacter } from '../../packages/engine/src/character-render/character-render';
import { JOINT_COUNT } from '../../packages/engine/src/character-render/AgentAvatarMesh';
import { HumanoidLoader } from '../../packages/core/src/assets/HumanoidLoader';
import type { CharacterDrawSpec } from '../../packages/engine/src/native-render/draw-spec';

export const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

const sha256 = (b: Uint8Array) => crypto.createHash('sha256').update(b).digest('hex');

// ---------- PNG (no deps) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * stride + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- glTF node transforms (mesh world matrix) ----------
type M4 = number[];
const I4 = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n: any): M4 {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
/** World matrix of the first node instancing `meshIndex` (identity if none). */
function meshWorld(json: any, meshIndex: number): { matrix: M4; nodePath: string[] } {
  const nodes = json.nodes ?? [];
  const parent = new Map<number, number>();
  nodes.forEach((n: any, i: number) => (n.children ?? []).forEach((c: number) => parent.set(c, i)));
  const ni = nodes.findIndex((n: any) => n.mesh === meshIndex);
  if (ni < 0) return { matrix: I4(), nodePath: [] };
  let m = I4();
  const p: string[] = [];
  for (let cur: number | undefined = ni; cur !== undefined; cur = parent.get(cur)) {
    m = mul(trs(nodes[cur]), m);
    p.unshift(nodes[cur].name ?? `node${cur}`);
  }
  return { matrix: m, nodePath: p };
}
function xf(W: M4, x: number, y: number, z: number, w: number): [number, number, number] {
  return [
    W[0] * x + W[4] * y + W[8] * z + W[12] * w,
    W[1] * x + W[5] * y + W[9] * z + W[13] * w,
    W[2] * x + W[6] * y + W[10] * z + W[14] * w,
  ];
}

const toAB = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const round = (a: number[]) => a.map((v) => Math.round(v * 1e4) / 1e4);

// ---------- HumanoidLoader ----------
async function runHumanoidLoader(file: string, bytes: Buffer): Promise<Record<string, unknown>> {
  const loader = new HumanoidLoader();
  const out: Record<string, unknown> = {
    path: 'packages/core/src/assets/HumanoidLoader.ts loadAvatar()',
  };
  try {
    await loader.initialize(); // real code path: imports three GLTFLoader (+ optional VRM/Draco)
  } catch (e) {
    out.initialized = false;
    out.error = (e as Error).message;
    return out;
  }
  out.initialized = true;
  // loadAvatar() fetches by URL; Node has no file:// fetch, so the SAME GLTFLoader instance
  // gets the bytes through its own parse(). Transport shim only; processLoadedModel is unchanged.
  const gl: any = (loader as any).gltfLoader;
  gl.load = (_url: string, onLoad: any, _onProgress: any, onError: any) =>
    gl.parse(toAB(bytes), '', onLoad, onError);
  out.transport = 'GLTFLoader.parse(bytes) shim (Node has no file:// URL fetch)';
  // three's GLTFLoader texture path expects a browser `self`; Node has none. Point it at
  // globalThis so geometry/skeleton parsing proceeds. Embedded images may still fail to decode
  // in Node (no DOM image decoder); three logs that and continues without the texture.
  const g = globalThis as any;
  if (typeof g.self === 'undefined') {
    g.self = globalThis;
    out.polyfills = ['globalThis.self = globalThis'];
  }
  try {
    const r = await loader.loadAvatar('brian', { url: file, format: 'glb' });
    const s = r.humanoidState;
    out.ok = true;
    out.format = s.format;
    out.isLoaded = s.isLoaded;
    out.boneCount = s.availableBones.length;
    out.availableBones = s.availableBones;
    out.mappedVRMBones = s.availableBones.map((b) => loader.mapBoneName(b)).filter(Boolean);
    out.availableExpressions = s.availableExpressions;
    out.hasSpringBones = s.hasSpringBones;
    out.animations = r.animations;
    out.vrm = !!r.vrm;
    out.says =
      s.availableBones.length === 0
        ? 'no bones, no animations: rig unknown (static mesh)'
        : `${s.availableBones.length} bones`;
  } catch (e) {
    out.ok = false;
    out.error = (e as Error).message;
  }
  try {
    loader.dispose();
  } catch {
    /* ignore */
  }
  return out;
}

// ---------- import report ----------
export async function importReport(file: string) {
  const bytes = fs.readFileSync(file);
  const { json } = parseGlb(toAB(bytes)) as { json: any };
  let prims = 0,
    verts = 0,
    tris = 0,
    morph = 0;
  const lmin = [Infinity, Infinity, Infinity],
    lmax = [-Infinity, -Infinity, -Infinity];
  for (const m of json.meshes ?? [])
    for (const p of m.primitives) {
      prims++;
      const a = json.accessors[p.attributes.POSITION];
      verts += a.count;
      tris += (p.indices !== undefined ? json.accessors[p.indices].count : a.count) / 3;
      morph += p.targets?.length ?? 0;
      for (let k = 0; k < 3; k++) {
        if (a.min) lmin[k] = Math.min(lmin[k], a.min[k]);
        if (a.max) lmax[k] = Math.max(lmax[k], a.max[k]);
      }
    }
  const mesh = extractGltfStaticMesh(toAB(bytes));
  const { matrix, nodePath } = meshWorld(json, 0);
  const wmin = [Infinity, Infinity, Infinity],
    wmax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertexCount; i++) {
    const w = xf(matrix, mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2], 1);
    for (let k = 0; k < 3; k++) {
      wmin[k] = Math.min(wmin[k], w[k]);
      wmax[k] = Math.max(wmax[k], w[k]);
    }
  }
  let gi: Record<string, unknown>;
  try {
    const holo = importGltf(file);
    gi = {
      ok: true,
      path: 'packages/cli/src/importers/gltf-importer.ts importGltf()',
      holoBytes: Buffer.byteLength(holo),
      meshShapeBlocks: (holo.match(/shape "[^"]+" mesh \{/g) ?? []).length,
      traits: [...new Set(holo.match(/@[a-z_]+/g) ?? [])].sort(),
    };
  } catch (e) {
    gi = { ok: false, error: (e as Error).message };
  }
  const skins = json.skins?.length ?? 0;
  const bones = new Set<number>((json.skins ?? []).flatMap((s: any) => s.joints)).size;
  const report = {
    file: path.basename(file),
    sha256: sha256(bytes),
    bytes: bytes.length,
    generator: json.asset?.generator,
    nodes: json.nodes?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    primitives: prims,
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    images: json.images?.length ?? 0,
    skins,
    bones,
    animations: json.animations?.length ?? 0,
    morphTargets: morph,
    vertices: verts,
    triangles: tris,
    extractedVertices: mesh.vertexCount,
    extractedTriangles: mesh.indices.length / 3,
    boundsLocal: { min: round(lmin), max: round(lmax) },
    boundsWorld: { min: round(wmin), max: round(wmax), size: round(wmax.map((v, k) => v - wmin[k])) },
    meshNodePath: nodePath,
    extensionsUsed: json.extensionsUsed ?? [],
    gltfImporter: gi,
    humanoidLoader: await runHumanoidLoader(file, bytes),
    rig: skins === 0 && bones === 0 ? 'unknown' : 'present',
  };
  return { report, bytes };
}

// ---------- turntable ----------
async function dawnDevice() {
  // @ts-ignore - optional native dep, same source as engine physics/__tests__/gpu-setup.ts
  const { create, globals } = await import('webgpu');
  if (globals) Object.assign(globalThis, globals);
  const gpu = create([]);
  // keep the GPU instance reachable: if it is GCd while the device lives, Dawn-node segfaults
  (globalThis as any).__brianGpu = gpu;
  const adapter =
    (await gpu.requestAdapter({ powerPreference: 'high-performance' })) ?? (await gpu.requestAdapter());
  if (!adapter) throw new Error('no Dawn WebGPU adapter');
  const device = (await adapter.requestDevice()) as GPUDevice;
  return { device, info: (adapter as any).info ?? null };
}

/** Column-major orthographic camera, fixed on +Z, looking at the origin (bounds centre). */
function fixedCamera(halfExtent: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1 / halfExtent;
  m[5] = 1 / halfExtent;
  m[10] = -1 / (4 * halfExtent);
  m[14] = 0.5;
  m[15] = 1;
  return m;
}

export async function renderTurntable(bytes: Buffer, outDir: string, size: number, device: GPUDevice) {
  const { json } = parseGlb(toAB(bytes)) as { json: any };
  const base = extractGltfStaticMesh(toAB(bytes));
  const { matrix: W } = meshWorld(json, 0);
  const n = base.vertexCount;
  const P = new Float32Array(n * 3),
    N = new Float32Array(n * 3);
  const mn = [Infinity, Infinity, Infinity],
    mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const p = xf(W, base.positions[i * 3], base.positions[i * 3 + 1], base.positions[i * 3 + 2], 1);
    const q = xf(W, base.normals[i * 3], base.normals[i * 3 + 1], base.normals[i * 3 + 2], 0);
    const l = Math.hypot(q[0], q[1], q[2]) || 1;
    for (let k = 0; k < 3; k++) {
      P[i * 3 + k] = p[k];
      N[i * 3 + k] = q[k] / l;
      mn[k] = Math.min(mn[k], p[k]);
      mx[k] = Math.max(mx[k], p[k]);
    }
  }
  const c = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2);
  let r = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) P[i * 3 + k] -= c[k];
    r = Math.max(r, Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  }
  const half = r * 1.05;
  const viewProj = fixedCamera(half);
  const palette = new Float32Array(JOINT_COUNT * 16);
  for (let j = 0; j < JOINT_COUNT; j++) palette.set(I4(), j * 16);
  const results: Array<{ angle: number; file: string; sha256: string; nonBackgroundPixels: number }> = [];
  fs.mkdirSync(outDir, { recursive: true });
  for (const deg of ANGLES) {
    // turntable: the model turns about +Y; camera and light stay fixed.
    const t = (deg * Math.PI) / 180,
      cs = Math.cos(t),
      sn = Math.sin(t);
    const pos = new Float32Array(n * 3),
      nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      pos[i * 3] = cs * x + sn * z;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = -sn * x + cs * z;
      const a = N[i * 3], b = N[i * 3 + 1], d = N[i * 3 + 2];
      nor[i * 3] = cs * a + sn * d;
      nor[i * 3 + 1] = b;
      nor[i * 3 + 2] = -sn * a + cs * d;
    }
    const spec: CharacterDrawSpec = {
      entityId: 'brian',
      mesh: { ...base, positions: pos, normals: nor } as any,
      jointMatrices: palette,
      jointCount: JOINT_COUNT,
      material: { color: 0xc8b8a8, metalness: 0, roughness: 0.8, emissive: 0, opacity: 1 },
      modelMatrix: new Float32Array(I4()),
    };
    process.stderr.write('  render ' + deg + '\n');
    const grid = await renderCharacter(device, spec, {
      size,
      viewProj: viewProj as any,
      cameraPos: [0, 0, half * 4],
      clear: [1, 1, 1, 1],
    });
    let nonBg = 0;
    for (let i = 0; i < grid.data.length; i += 4)
      if (grid.data[i] !== 255 || grid.data[i + 1] !== 255 || grid.data[i + 2] !== 255) nonBg++;
    const png = encodePng(grid.width, grid.height, grid.data);
    const f = path.join(outDir, `${deg}.png`);
    fs.writeFileSync(f, png);
    results.push({ angle: deg, file: f, sha256: sha256(png), nonBackgroundPixels: nonBg });
  }
  return { centre: round(c), radius: Math.round(r * 1e4) / 1e4, results };
}

export async function run(o: {
  out: string;
  size: number;
  skipRender: boolean;
  files: string[];
  repoRoot: string;
}): Promise<number> {
  const git = (cmd: string) => {
    try {
      return execSync(`git ${cmd}`, { cwd: o.repoRoot }).toString().trim();
    } catch {
      return null;
    }
  };
  const manifest: any = {
    schema: 'brian-import-turntable/v1',
    createdAt: new Date().toISOString(),
    renderer: {
      label:
        "our renderer: HoloScript renderCharacter() WebGPU path on a native Dawn GPUDevice (webgpu npm), headless Node; no browser, no three.js in the render path",
      entry: 'packages/engine/src/character-render/character-render.ts renderCharacter()',
      meshSource: 'packages/engine/src/character-render/GltfMeshExtractor.ts extractGltfStaticMesh()',
      gaps: [
        'CharacterHost (CharacterHost.ts:526-530) always builds the procedural body via buildCharacterMesh and has no GLB body option, so the GLB mesh is fed to renderCharacter as a CharacterDrawSpec directly (the type CharacterHost.getDrawSpec returns).',
        'renderCharacter binds only uniform per-group materials (no texture/sampler bindings), so GLB baseColor textures carried in mesh.materialMaps are not sampled: renders are untextured shaded geometry in flat material 0xc8b8a8.',
      ],
      commit: git('rev-parse HEAD'),
      dirty: (git('status --porcelain') ?? '') !== '',
      camera: {
        projection: 'orthographic, fixed on +Z, looking at the mesh bounds centre, half-extent = 1.05 x bounding radius',
        turntable: 'model rotated about +Y by angle; camera and light fixed',
        size: o.size,
        background: 'white',
      },
      angles: ANGLES,
    },
    models: [] as any[],
  };
  let dev: GPUDevice | null = null;
  if (!o.skipRender) {
    const d = await dawnDevice();
    dev = d.device;
    manifest.renderer.adapter = d.info
      ? { vendor: d.info.vendor, architecture: d.info.architecture, description: d.info.description }
      : null;
  }
  for (const f of o.files) {
    const { report, bytes } = await importReport(f);
    const stem = path.basename(f, path.extname(f));
    const entry: any = {
      stem,
      glb: { file: report.file, sha256: report.sha256, bytes: report.bytes },
      importReport: report,
    };
    if (dev) entry.turntable = await renderTurntable(bytes, path.join(o.out, stem), o.size, dev);
    manifest.models.push(entry);
    console.log(
      JSON.stringify({
        stem,
        rig: report.rig,
        renders: entry.turntable?.results.length ?? 0,
      })
    );
  }
  fs.mkdirSync(o.out, { recursive: true });
  fs.writeFileSync(path.join(o.out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest: ${path.join(o.out, 'manifest.json')}`);
  return 0;
}