/**
 * GLB decompression boundary — Draco / meshopt → plain glTF, the Track-0 follow-up that lets
 * real-world compressed assets (Meshy/Tripo exports, most published `.glb`s) carry their REAL
 * mesh into `.holo` instead of failing.
 *
 * The native extractor (`GltfMeshExtractor`) is deliberately pure-data and fails loud on a
 * `KHR_draco_mesh_compression` / `EXT_meshopt_compression` primitive. Rather than bolt a WASM
 * decoder into that pure module, decode happens HERE, at the CLI import boundary: `decompressGlb`
 * reads the compressed GLB through glTF-Transform (with the Draco + meshopt decoders that already
 * ship in this monorepo), drops the compression extensions, and re-writes a plain GLB that flows
 * through the existing extractor unchanged. glTF + its Draco/meshopt extensions are an open
 * Khronos standard; consuming them via the reference tooling is a bridge to that standard, not a
 * fork of it.
 *
 * `importGltfAsync` is the async entry that decompresses-then-imports; it keeps the synchronous
 * `importGltf` untouched (the common uncompressed path stays sync) and is implemented as a thin
 * wrapper that writes the decompressed bytes to a temp file and delegates — so it adds no edits
 * to the importer itself.
 *
 * @package @holoscript/cli/importers
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, EXTMeshoptCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { MeshoptDecoder } from 'meshoptimizer';
import { importGltf } from './gltf-importer';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const DRACO_EXT = 'KHR_draco_mesh_compression';
const MESHOPT_EXT = 'EXT_meshopt_compression';

/** Read just the JSON chunk of a .glb (no BIN, no decode) — enough to inspect `extensionsUsed`. */
function readGlbJson(glb: ArrayBuffer): { extensionsUsed?: string[] } {
  const dv = new DataView(glb);
  if (glb.byteLength < 12 || dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a .glb (bad magic)');
  const total = Math.min(dv.getUint32(8, true), glb.byteLength);
  let off = 12;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > total) break;
    if (type === CHUNK_JSON) {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(glb, start, len))) as { extensionsUsed?: string[] };
    }
    off = start + len;
  }
  throw new Error('.glb missing JSON chunk');
}

/** True when the GLB declares Draco or meshopt compression (so the native extractor can't read it raw). */
export function isGlbCompressed(glb: ArrayBuffer): boolean {
  const used = readGlbJson(glb).extensionsUsed ?? [];
  return used.includes(DRACO_EXT) || used.includes(MESHOPT_EXT);
}

/**
 * Decompress a Draco/meshopt-compressed GLB into a plain glTF 2.0 GLB. A GLB with no compression
 * extension is returned through the same pipe (a harmless re-serialize), so callers need not
 * special-case it. Geometry is preserved up to the encoder's quantization.
 */
export async function decompressGlb(glb: ArrayBuffer): Promise<ArrayBuffer> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression]).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.readBinary(new Uint8Array(glb)); // decodes compressed attributes into raw accessors
  // Drop the compression extensions so the re-write is plain glTF the native extractor reads.
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === DRACO_EXT || ext.extensionName === MESHOPT_EXT) ext.dispose();
  }
  // A fresh IO with no compression deps guarantees an uncompressed re-write.
  const plain = await new NodeIO().writeBinary(doc);
  return plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer;
}

/**
 * Import a glTF/GLB to `.holo`, transparently decompressing a Draco/meshopt `.glb` first. The
 * uncompressed path delegates straight to the synchronous {@link importGltf}; a compressed `.glb`
 * is decompressed to a temp file (basename preserved so the generated mesh-shape name matches)
 * and then imported. The temp dir is always cleaned up.
 */
export async function importGltfAsync(inputPath: string): Promise<string> {
  const resolved = path.resolve(inputPath);
  if (path.extname(resolved).toLowerCase() === '.glb' && fs.existsSync(resolved)) {
    const buf = fs.readFileSync(resolved);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (isGlbCompressed(ab)) {
      const plain = await decompressGlb(ab);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-decomp-'));
      const tmp = path.join(dir, path.basename(resolved)); // preserve basename → stable mesh-shape name
      fs.writeFileSync(tmp, Buffer.from(plain));
      try {
        return importGltf(tmp);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
  return importGltf(inputPath);
}
