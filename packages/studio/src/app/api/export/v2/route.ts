import { NextRequest } from 'next/server';

/**
 * POST /api/export/v2
 *
 * Body: { code: string, format: 'obj'|'fbx'|'gltf'|'usd'|'json', sceneName?: string }
 *
 * Extends Sprint P export with:
 *  - OBJ + MTL format
 *  - FBX scaffold with readable ASCII header
 *  - Re-exports existing glTF/USD/JSON formats
 *
 * Returns a ZIP archive.
 */

type V2ExportFormat = 'obj' | 'fbx' | 'gltf' | 'usd' | 'json';

interface V2ExportRequest {
  code?: string;
  format?: V2ExportFormat;
  sceneName?: string;
}

interface ParsedObject {
  name: string;
  mesh?: string;
  material?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color?: string;
}

interface ParsedScene { name: string; objects: ParsedObject[] }

function parseScene(code: string): ParsedScene {
  const sceneMatch = code.match(/scene\s+"([^"]+)"/);
  const sceneName = sceneMatch?.[1] ?? 'Scene';
  const objectRe = /object\s+"([^"]+)"\s*\{([\s\S]*?)\}/g;
  const objects: ParsedObject[] = [];
  let m: RegExpExecArray | null;
  while ((m = objectRe.exec(code)) !== null) {
    const body = m[2];
    const posM = body.match(/@transform\s*\([^)]*position:\s*\[([^\]]+)\]/);
    const scaM = body.match(/@transform\s*\([^)]*scale:\s*\[([^\]]+)\]/);
    const rotM = body.match(/@transform\s*\([^)]*rotation:\s*\[([^\]]+)\]/);
    const meshM = body.match(/@mesh\s*\(\s*src:\s*"([^"]+)"/);
    const matM = body.match(/@material\s*\([^)]*color:\s*"([^"]+)"/);
    const parse3 = (s?: string): [number, number, number] => {
      if (!s) return [0, 0, 0];
      const p = s.split(',').map((v) => parseFloat(v.trim()) || 0);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
    };
    objects.push({
      name: m[1],
      mesh: meshM?.[1],
      material: matM?.[1],
      color: matM?.[1],
      position: parse3(posM?.[1]),
      rotation: parse3(rotM?.[1]),
      scale: scaM ? parse3(scaM[1]) : [1, 1, 1],
    });
  }
  return { name: sceneName, objects };
}

// ── Format generators ──────────────────────────────────────────────────────────

function toOBJ(scene: ParsedScene): { obj: string; mtl: string } {
  const slug = scene.name.replace(/\s+/g, '_');
  let obj = `# OBJ export from HoloScript Studio\n# Scene: ${scene.name}\nmtllib ${slug}.mtl\n\n`;
  let mtl = `# MTL export from HoloScript Studio\n\n`;

  scene.objects.forEach((o, i) => {
    const safeName = o.name.replace(/[^a-zA-Z0-9_]/g, '_');
    const [sx, sy, sz] = o.scale;
    const [px, py, pz] = o.position;

    // Simple box geometry scaled by transform
    const hw = (sx ?? 1) * 0.5; const hh = (sy ?? 1) * 0.5; const hd = (sz ?? 1) * 0.5;
    const verts: [number, number, number][] = [
      [px - hw, py - hh, pz - hd], [px + hw, py - hh, pz - hd],
      [px + hw, py + hh, pz - hd], [px - hw, py + hh, pz - hd],
      [px - hw, py - hh, pz + hd], [px + hw, py - hh, pz + hd],
      [px + hw, py + hh, pz + hd], [px - hw, py + hh, pz + hd],
    ];
    const base = i * 8 + 1;
    obj += `o ${safeName}\nusemtl Mat_${safeName}\n`;
    verts.forEach(([x, y, z]) => { obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`; });
    // 6 faces (quads → 2 tris each)
    obj += `f ${base} ${base+1} ${base+2} ${base+3}\n`;
    obj += `f ${base+4} ${base+5} ${base+6} ${base+7}\n`;
    obj += `f ${base} ${base+1} ${base+5} ${base+4}\n`;
    obj += `f ${base+2} ${base+3} ${base+7} ${base+6}\n`;
    obj += `f ${base+3} ${base} ${base+4} ${base+7}\n`;
    obj += `f ${base+1} ${base+2} ${base+6} ${base+5}\n\n`;

    // MTL material
    const hex = o.color ?? '#cccccc';
    const r = parseInt(hex.slice(1, 3), 16) / 255 || 0.8;
    const g = parseInt(hex.slice(3, 5), 16) / 255 || 0.8;
    const b = parseInt(hex.slice(5, 7), 16) / 255 || 0.8;
    mtl += `newmtl Mat_${safeName}\nKd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\nKs 0.1 0.1 0.1\nNs 32\nd 1\n\n`;
  });

  return { obj, mtl };
}

function toFBX(scene: ParsedScene): string {
  // ASCII FBX scaffold (readable, not binary)
  const now = new Date().toISOString();
  let fbx = `; FBX 7.4.0 project file\n; Created by HoloScript Studio\n; Scene: ${scene.name}\n; Date: ${now}\n\nFBXHeaderExtension: {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n\tCreationTime: "${now}"\n\tCreator: "HoloScript Studio 1.0"\n}\n\n`;
  fbx += `GlobalSettings: {\n\tVersion: 1000\n\tProperties70:  {\n\t\tP: "UpAxis", "int", "Integer", "",1\n\t\tP: "FrontAxis", "int", "Integer", "",2\n\t\tP: "UnitScaleFactor", "double", "Number", "",1\n\t}\n}\n\n`;
  fbx += `Objects: {\n`;
  scene.objects.forEach((o, i) => {
    const id = 1000 + i;
    fbx += `\tModel: ${id}, "${o.name}", "Mesh" {\n`;
    fbx += `\t\tProperties70: {\n`;
    fbx += `\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${o.position.join(',')}\n`;
    fbx += `\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",${o.rotation.join(',')}\n`;
    fbx += `\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",${o.scale.join(',')}\n`;
    fbx += `\t\t}\n\t}\n`;
  });
  fbx += `}\n\nConnections: {\n}\n`;
  return fbx;
}

function toGLTF(scene: ParsedScene): string {
  const nodes = scene.objects.map((o) => ({ name: o.name, translation: o.position, scale: o.scale }));
  return JSON.stringify({ asset: { version: '2.0', generator: 'HoloScript Studio v1.0' }, scene: 0, scenes: [{ name: scene.name, nodes: scene.objects.map((_, i) => i) }], nodes }, null, 2);
}

// ── Minimal ZIP (CRC32 + STORED) ──────────────────────────────────────────────

function crc32(data: Uint8Array): number {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
  let crc = 0xffffffff;
  for (const b of data) crc = t[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const lhs: Uint8Array[] = []; const offs: number[] = []; let off = 0;
  for (const f of files) {
    const nb = enc.encode(f.name); const cr = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30 + nb.length));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0, true);
    h.setUint32(14, cr, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    const arr = new Uint8Array(h.buffer); nb.forEach((b, i) => arr[30 + i] = b);
    offs.push(off); lhs.push(arr); off += arr.length + f.data.length;
  }
  const cdOff = off; const cds: Uint8Array[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]!; const nb = enc.encode(f.name); const cr = crc32(f.data);
    const cd = new DataView(new ArrayBuffer(46 + nb.length));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0, true); cd.setUint16(10, 0, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0, true);
    cd.setUint32(16, cr, true); cd.setUint32(20, f.data.length, true); cd.setUint32(24, f.data.length, true); cd.setUint16(28, nb.length, true);
    cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offs[i]!, true);
    const arr = new Uint8Array(cd.buffer); nb.forEach((b, j) => arr[46 + j] = b); cds.push(arr);
  }
  const cdSz = cds.reduce((s, c) => s + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(4, 0, true); eocd.setUint16(6, 0, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true); eocd.setUint32(12, cdSz, true); eocd.setUint32(16, cdOff, true); eocd.setUint16(20, 0, true);
  const total = lhs.reduce((s, h, i) => s + h.length + files[i]!.data.length, 0) + cdSz + 22;
  const out = new Uint8Array(total); let pos = 0;
  for (let i = 0; i < files.length; i++) { out.set(lhs[i]!, pos); pos += lhs[i]!.length; out.set(files[i]!.data, pos); pos += files[i]!.data.length; }
  cds.forEach((c) => { out.set(c, pos); pos += c.length; });
  out.set(new Uint8Array(eocd.buffer), pos);
  return out;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: V2ExportRequest;
  try { body = (await request.json()) as V2ExportRequest; }
  catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }

  const { code = '', format = 'obj', sceneName } = body;
  const enc = new TextEncoder();
  const scene = parseScene(code);
  if (sceneName) scene.name = sceneName;
  const slug = scene.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  let files: { name: string; data: Uint8Array }[];

  switch (format as V2ExportFormat) {
    case 'obj': {
      const { obj, mtl } = toOBJ(scene);
      files = [
        { name: `${slug}.obj`, data: enc.encode(obj) },
        { name: `${slug}.mtl`, data: enc.encode(mtl) },
        { name: 'source.holoscript', data: enc.encode(code) },
        { name: 'README.txt', data: enc.encode(`HoloScript Studio Export\nFormat: Wavefront OBJ\nScene: ${scene.name}\nObjects: ${scene.objects.length}\n`) },
      ];
      break;
    }
    case 'fbx': {
      files = [
        { name: `${slug}.fbx`, data: enc.encode(toFBX(scene)) },
        { name: 'source.holoscript', data: enc.encode(code) },
        { name: 'README.txt', data: enc.encode(`HoloScript Studio Export\nFormat: ASCII FBX 7.4\nScene: ${scene.name}\nNote: This is an ASCII FBX scaffold. Import into Blender/Maya then assign materials.\n`) },
      ];
      break;
    }
    case 'gltf': {
      files = [
        { name: `${slug}.gltf`, data: enc.encode(toGLTF(scene)) },
        { name: 'source.holoscript', data: enc.encode(code) },
      ];
      break;
    }
    case 'usd': {
      const usda = `#usda 1.0\n(\n    defaultPrim = "${scene.name}"\n    doc = "HoloScript Studio Export"\n)\n\ndef Xform "${scene.name}"\n{\n${scene.objects.map((o) => `    def Mesh "${o.name.replace(/\W/g, '_')}"\n    {\n        double3 xformOp:translate = (${o.position.join(', ')})\n        float3 xformOp:scale = (${o.scale.join(', ')})\n        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]\n    }`).join('\n')}\n}\n`;
      files = [
        { name: `${slug}.usda`, data: enc.encode(usda) },
        { name: 'source.holoscript', data: enc.encode(code) },
      ];
      break;
    }
    default: { // json
      files = [
        { name: `${slug}.json`, data: enc.encode(JSON.stringify({ meta: { generator: 'HoloScript Studio', version: '2.0' }, scene, source: code }, null, 2)) },
      ];
    }
  }

  const zip = buildZip(files);
  const body2 = Buffer.from(zip);
  return new Response(body2, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}_${format}_v2.zip"`,
      'Content-Length': String(body2.length),
    },
  });
}
