import fs from 'node:fs';

const SCALE = { x: 82, y: 92, z: 72 };
const SEG_LAT = 10, SEG_LON = 14;

function gen() {
  const pos = [], idx = [];
  for (let lat = 0; lat <= SEG_LAT; lat++) {
    const t = (lat / SEG_LAT) * Math.PI;
    const cy = Math.cos(t);
    const r = Math.sin(t);
    for (let lon = 0; lon < SEG_LON; lon++) {
      const p = (lon / SEG_LON) * 2 * Math.PI;
      let gx = Math.sin(3 * p) * Math.sin(2 * t) * 0.07;
      let gz = Math.sin(5 * p + 0.7) * Math.sin(t) * 0.05;
      const rx = SCALE.x * (1 + gx);
      const ry = SCALE.y * (1 + 0.02 * Math.sin(4 * t));
      const rz = SCALE.z * (1 + gz);
      pos.push(r * Math.cos(p) * rx, cy * ry, r * Math.sin(p) * rz);
    }
  }
  for (let lat = 0; lat < SEG_LAT; lat++) {
    for (let lon = 0; lon < SEG_LON; lon++) {
      const a = lat * SEG_LON + lon;
      const b = lat * SEG_LON + ((lon + 1) % SEG_LON);
      const c = (lat + 1) * SEG_LON + lon;
      const d = (lat + 1) * SEG_LON + ((lon + 1) % SEG_LON);
      idx.push(a, c, b, b, c, d);
    }
  }
  const pBuf = Buffer.from(new Float32Array(pos).buffer);
  const iBuf = Buffer.from(new Uint16Array(idx).buffer);
  const data = Buffer.concat([pBuf, iBuf]);
  const b64 = data.toString('base64');

  const gltf = {
    asset: { version: "2.0", generator: "HoloScript procedural MNI152 pial v1 (ellipsoid + gyri modulation)" },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "MNI152-pial-v1" }],
    meshes: [{ name: "pial", primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    buffers: [{ uri: "data:application/octet-stream;base64," + b64, byteLength: data.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pBuf.length, target: 34962 },
      { buffer: 0, byteOffset: pBuf.length, byteLength: iBuf.length, target: 34963 }
    ],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: [-SCALE.x, -SCALE.y, -SCALE.z], max: [SCALE.x, SCALE.y, SCALE.z] },
      { bufferView: 1, byteOffset: 0, componentType: 5123, count: idx.length, type: "SCALAR" }
    ]
  };
  return JSON.stringify(gltf, null, 2);
}

fs.writeFileSync('brain-mni152-pial.gltf', gen());
console.log('Wrote improved MNI152 pial v1 (~' + (SEG_LAT * SEG_LON) + ' verts)');
