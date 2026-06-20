/**
 * @fileoverview GaussianPlyLoader — decode a 3D Gaussian Splatting `.ply` into the trainer's
 * `Gaussian3D` SoA. This is the `dataset.init` consumer that was missing (flagged by the 2026-06-20
 * /critic review: "no loader turns job.dataset.init into the Gaussian3D the runner requires").
 *
 * Decodes the standard 3DGS PLY layout (the inria/gsplat format): position is raw; scale is stored
 * in LOG space (→ exp); opacity in LOGIT space (→ sigmoid); color is the SH degree-0 DC term
 * (→ 0.5 + C0·f_dc, C0 = 0.28209); rotation is a (w,x,y,z) quaternion (→ normalized). This decode is
 * the one proven correct against the real S23 capture (it renders matching gsplat).
 *
 * Parses `binary_little_endian` / `binary_big_endian` headers with per-property typed byte offsets
 * (so non-float properties like normals don't corrupt the stride). ASCII PLY bodies are not supported
 * (3DGS exports are always binary). Higher-order SH (`f_rest_*`) is skipped — the trainer is diffuse
 * RGB only (see GaussianTrainer3D header).
 */

import { type Gaussian3D } from './GaussianTrainer3D';

const SH_C0 = 0.28209479177387814; // SH degree-0 basis constant
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Byte size of a PLY scalar type. */
function typeBytes(t: string): number {
  switch (t) {
    case 'float': case 'float32': case 'int': case 'int32': case 'uint': case 'uint32': return 4;
    case 'double': case 'float64': return 8;
    case 'uchar': case 'uint8': case 'char': case 'int8': return 1;
    case 'short': case 'int16': case 'ushort': case 'uint16': return 2;
    default: throw new Error(`GaussianPlyLoader: unsupported PLY property type '${t}'`);
  }
}

interface PropInfo {
  type: string;
  offset: number; // byte offset within a vertex record
}

/**
 * Decode a 3DGS `.ply` (binary) into a `Gaussian3D`. The caller reads the file bytes (the engine
 * module stays fs-free / portable); pass the buffer in.
 *
 * @throws on a non-3DGS PLY (missing scale_, rot_, opacity, or f_dc_ properties) or an ASCII body.
 */
export function loadGaussianPly(data: Uint8Array | ArrayBuffer): Gaussian3D {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  // ── parse ASCII header up to and including "end_header\n" ──
  let header = '';
  let bodyStart = 0;
  for (let i = 0; i < bytes.length; i++) {
    header += String.fromCharCode(bytes[i]);
    if (header.endsWith('end_header\n')) { bodyStart = i + 1; break; }
  }
  if (bodyStart === 0) throw new Error('GaussianPlyLoader: no end_header found (not a PLY?)');

  let N = 0;
  let littleEndian = true;
  let isAscii = false;
  const props: PropInfo[] = [];
  const idx: Record<string, PropInfo> = {};
  let byteOffset = 0;
  for (const raw of header.split('\n')) {
    const t = raw.trim().split(/\s+/);
    if (t[0] === 'format') {
      isAscii = t[1] === 'ascii';
      littleEndian = t[1] !== 'binary_big_endian';
    } else if (t[0] === 'element' && t[1] === 'vertex') {
      N = parseInt(t[2], 10);
    } else if (t[0] === 'property' && t[1] !== 'list') {
      // "property <type> <name>"
      const type = t[1], name = t[t.length - 1];
      const info: PropInfo = { type, offset: byteOffset };
      props.push(info);
      idx[name] = info;
      byteOffset += typeBytes(type);
    }
  }
  if (isAscii) throw new Error('GaussianPlyLoader: ASCII PLY not supported (3DGS exports are binary)');
  if (N <= 0) throw new Error('GaussianPlyLoader: header declares no vertices');

  const required = ['x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3', 'opacity', 'f_dc_0', 'f_dc_1', 'f_dc_2'];
  for (const r of required) {
    if (!(r in idx)) throw new Error(`GaussianPlyLoader: missing property '${r}' — not a 3DGS PLY`);
  }
  const stride = byteOffset; // bytes per vertex record
  const dv = new DataView(bytes.buffer, bytes.byteOffset + bodyStart, bytes.byteLength - bodyStart);

  const read = (v: number, name: string): number => {
    const p = idx[name];
    const at = v * stride + p.offset;
    switch (p.type) {
      case 'double': case 'float64': return dv.getFloat64(at, littleEndian);
      case 'float': case 'float32': default: return dv.getFloat32(at, littleEndian);
    }
  };

  const G: Gaussian3D = {
    N,
    x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N),
    sx: new Float64Array(N), sy: new Float64Array(N), sz: new Float64Array(N),
    qr: new Float64Array(N), qx: new Float64Array(N), qy: new Float64Array(N), qz: new Float64Array(N),
    op: new Float64Array(N), r: new Float64Array(N), gr: new Float64Array(N), bl: new Float64Array(N),
  };
  for (let v = 0; v < N; v++) {
    G.x[v] = read(v, 'x'); G.y[v] = read(v, 'y'); G.z[v] = read(v, 'z');
    G.sx[v] = Math.exp(read(v, 'scale_0')); // log-space → linear
    G.sy[v] = Math.exp(read(v, 'scale_1'));
    G.sz[v] = Math.exp(read(v, 'scale_2'));
    let q0 = read(v, 'rot_0'), q1 = read(v, 'rot_1'), q2 = read(v, 'rot_2'), q3 = read(v, 'rot_3');
    const qn = Math.hypot(q0, q1, q2, q3) || 1; // (w,x,y,z), normalized → (qr,qx,qy,qz)
    G.qr[v] = q0 / qn; G.qx[v] = q1 / qn; G.qy[v] = q2 / qn; G.qz[v] = q3 / qn;
    G.op[v] = sigmoid(read(v, 'opacity')); // logit → [0,1]
    G.r[v] = clamp01(0.5 + SH_C0 * read(v, 'f_dc_0')); // SH DC → RGB
    G.gr[v] = clamp01(0.5 + SH_C0 * read(v, 'f_dc_1'));
    G.bl[v] = clamp01(0.5 + SH_C0 * read(v, 'f_dc_2'));
  }
  return G;
}
