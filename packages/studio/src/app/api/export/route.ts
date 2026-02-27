import { NextResponse, NextRequest } from 'next/server';

/**
 * POST /api/export
 *
 * Body: { code: string, format: 'gltf' | 'usd' | 'usdz' | 'json', sceneName?: string }
 *
 * Returns a ZIP file containing the export artefacts.
 * For MVP we produce text-based formats inline; binary USDZ is scaffolded.
 * No external build tool required — uses native string generation.
 */

type SceneExportFormat = 'gltf' | 'usd' | 'usdz' | 'json';

interface SceneExportRequest {
  code?: string;
  format?: SceneExportFormat;
  sceneName?: string;
  /** Full scene-graph nodes from Zustand, including traits */
  nodes?: unknown[];
}

// ── Minimal scene model parsed from HoloScript code ──────────────────────────

interface ParsedObject {
  name: string;
  mesh?: string;
  material?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface ParsedScene {
  name: string;
  objects: ParsedObject[];
}

function parseScene(code: string): ParsedScene {
  const sceneMatch = code.match(/scene\s+"([^"]+)"/);
  const sceneName = sceneMatch?.[1] ?? 'Scene';

  // Use [\s\S] instead of /s flag so this compiles on tsconfig targets < ES2018
  const objectRe = /object\s+"([^"]+)"\s*\{([\s\S]*?)\}/g;
  const objects: ParsedObject[] = [];
  let m: RegExpExecArray | null;

  while ((m = objectRe.exec(code)) !== null) {
    const objName = m[1];
    const body = m[2];

    const meshM = body.match(/@mesh\s*\(\s*src:\s*"([^"]+)"/);
    const matM = body.match(/@material\s*\(\s*src:\s*"([^"]+)"/);
    const posM = body.match(/@transform\s*\([^)]*position:\s*\[([^\]]+)\]/);
    const rotM = body.match(/@transform\s*\([^)]*rotation:\s*\[([^\]]+)\]/);
    const scaM = body.match(/@transform\s*\([^)]*scale:\s*\[([^\]]+)\]/);

    const parseVec = (s?: string): [number, number, number] => {
      if (!s) return [0, 0, 0];
      const parts = s.split(',').map((v) => parseFloat(v.trim()) || 0);
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    };

    objects.push({
      name: objName,
      mesh: meshM?.[1],
      material: matM?.[1],
      position: parseVec(posM?.[1]),
      rotation: parseVec(rotM?.[1]),
      scale: scaM ? parseVec(scaM[1]) : [1, 1, 1],
    });
  }

  return { name: sceneName, objects };
}

// ── Format generators ────────────────────────────────────────────────────────

function toGLTF(scene: ParsedScene): string {
  const nodes = scene.objects.map((obj, i) => ({
    name: obj.name,
    translation: obj.position,
    rotation: [0, 0, 0, 1],
    scale: obj.scale,
    ...(obj.mesh ? { mesh: i } : {}),
  }));

  const meshes = scene.objects
    .filter((o) => o.mesh)
    .map((o) => ({
      name: o.name,
      primitives: [{ attributes: { POSITION: 0 }, material: 0 }],
      extras: { source: o.mesh },
    }));

  const gltf = {
    asset: { version: '2.0', generator: 'HoloScript Studio v1.0' },
    scene: 0,
    scenes: [{ name: scene.name, nodes: scene.objects.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [{ name: 'Default', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1] } }],
    extensionsUsed: [],
  };

  return JSON.stringify(gltf, null, 2);
}

function toUSD(scene: ParsedScene): string {
  const lines = [
    '#usda 1.0',
    `(`,
    `    defaultPrim = "${scene.name}"`,
    `    doc = "Exported by HoloScript Studio"`,
    `)`,
    '',
    `def Xform "${scene.name}"`,
    `{`,
  ];

  for (const obj of scene.objects) {
    const safeName = obj.name.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`    def Mesh "${safeName}"`);
    lines.push(`    {`);
    lines.push(`        double3 xformOp:translate = (${obj.position.join(', ')})`);
    lines.push(`        float3 xformOp:scale = (${obj.scale.join(', ')})`);
    lines.push(`        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]`);
    if (obj.mesh) lines.push(`        # Source mesh: ${obj.mesh}`);
    lines.push(`    }`);
  }

  lines.push(`}`);
  return lines.join('\n');
}

function toJSON(scene: ParsedScene, code: string, nodes?: unknown[]): string {
  return JSON.stringify(
    {
      meta: { generator: 'HoloScript Studio', version: '1.0', exportedAt: new Date().toISOString() },
      scene,
      sceneGraph: nodes ?? [],  // full Zustand SceneNode[] with traits
      source: code,
    },
    null,
    2
  );
}

// ── Minimal ZIP builder (no dependencies) ───────────────────────────────────
// Produces a valid ZIP with STORED (no-compression) entries.

function crc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const header = new DataView(new ArrayBuffer(30 + nameBytes.length));
    header.setUint32(0, 0x04034b50, true); // local file header sig
    header.setUint16(4, 20, true);          // version needed
    header.setUint16(6, 0, true);           // flags
    header.setUint16(8, 0, true);           // compression (STORED)
    header.setUint16(10, 0, true);          // mod time
    header.setUint16(12, 0, true);          // mod date
    header.setUint32(14, crc, true);
    header.setUint32(18, f.data.length, true);
    header.setUint32(22, f.data.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);
    const arr = new Uint8Array(header.buffer);
    nameBytes.forEach((b, i) => arr[30 + i] = b);
    offsets.push(offset);
    localHeaders.push(arr);
    offset += arr.length + f.data.length;
  }

  const cdOffset = offset;
  const centralDir: Uint8Array[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const lh = localHeaders[i]!;
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const cd = new DataView(new ArrayBuffer(46 + nameBytes.length));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, offsets[i]!, true);
    const arr = new Uint8Array(cd.buffer);
    nameBytes.forEach((b, j) => arr[46 + j] = b);
    centralDir.push(arr);
    void lh; // referenced above
  }

  const cdSize = centralDir.reduce((s, c) => s + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdOffset, true);
  eocd.setUint16(20, 0, true);

  const totalSize = localHeaders.reduce((s, h, i) => s + h.length + files[i]!.data.length, 0)
    + centralDir.reduce((s, c) => s + c.length, 0) + 22;

  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (let i = 0; i < files.length; i++) {
    out.set(localHeaders[i]!, pos); pos += localHeaders[i]!.length;
    out.set(files[i]!.data, pos); pos += files[i]!.data.length;
  }
  centralDir.forEach((c) => { out.set(c, pos); pos += c.length; });
  out.set(new Uint8Array(eocd.buffer), pos);
  return out;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: SceneExportRequest;
  try {
    body = (await request.json()) as SceneExportRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code = '', format = 'gltf', sceneName, nodes } = body;
  const enc = new TextEncoder();

  const scene = parseScene(code);
  if (sceneName) scene.name = sceneName;

  const slug = scene.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  let files: { name: string; data: Uint8Array }[];

  switch (format as SceneExportFormat) {
    case 'usd':
    case 'usdz': {
      const usdContent = toUSD(scene);
      files = [
        { name: `${slug}.usda`, data: enc.encode(usdContent) },
        { name: 'source.holoscript', data: enc.encode(code) },
        { name: 'README.txt', data: enc.encode(`HoloScript Studio Export\nScene: ${scene.name}\nFormat: ${format.toUpperCase()}\n`) },
      ];
      break;
    }
    case 'json': {
      files = [
        { name: `${slug}.json`, data: enc.encode(toJSON(scene, code, nodes)) },
        { name: 'source.holoscript', data: enc.encode(code) },
      ];
      break;
    }
    default: { // gltf
      files = [
        { name: `${slug}.gltf`, data: enc.encode(toGLTF(scene)) },
        { name: 'source.holoscript', data: enc.encode(code) },
        { name: 'README.txt', data: enc.encode(`HoloScript Studio Export\nScene: ${scene.name}\nFormat: glTF 2.0\n\nPlace your .glb mesh files alongside this .gltf to complete the asset bundle.\n`) },
      ];
    }
  }

  const zip = buildZip(files);
  // Buffer is a BodyInit-compatible Uint8Array subclass in Node.js
  const zipBuffer = Buffer.from(zip);

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}_${format}.zip"`,
      'Content-Length': String(zipBuffer.length),
    },
  });
}
