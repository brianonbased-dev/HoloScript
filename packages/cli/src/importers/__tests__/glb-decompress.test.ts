/**
 * Track-0 follow-up: a Draco/meshopt-compressed GLB decompresses at the import boundary so its
 * REAL mesh is carried into `.holo`, instead of failing the native extractor.
 * @see ../glb-decompress.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseHolo } from '@holoscript/core/parser';
import { CharacterRender } from '@holoscript/engine';
import { isGlbCompressed, decompressGlb, importGltfAsync } from '../glb-decompress';
import { buildGlb, makeSkinnedTriangleGlb, compressDraco } from './glb-fixtures';

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Track-0 GLB decompression boundary', () => {
  it('isGlbCompressed: false for a plain GLB, true for a Draco-compressed one', async () => {
    const plain = makeSkinnedTriangleGlb();
    expect(isGlbCompressed(plain)).toBe(false);
    expect(isGlbCompressed(await compressDraco(plain))).toBe(true);
  });

  it('isGlbCompressed: detects EXT_meshopt_compression via extensionsUsed', () => {
    const glb = buildGlb(
      { asset: { version: '2.0' }, extensionsUsed: ['EXT_meshopt_compression'] },
      new ArrayBuffer(0)
    );
    expect(isGlbCompressed(glb)).toBe(true);
  });

  it('decompressGlb: a Draco GLB → plain glTF the native extractor reads', async () => {
    const compressed = await compressDraco(makeSkinnedTriangleGlb());
    const plain = await decompressGlb(compressed);
    // the compression extension is gone …
    expect(isGlbCompressed(plain)).toBe(false);
    // … and the native skinned extractor (which throws on a compressed primitive) now succeeds
    const mesh = CharacterRender.extractGltfSkinnedMesh(plain);
    expect(mesh.vertexCount).toBe(3);
    expect(mesh.indices.length).toBe(3);
  });

  it('importGltfAsync: a compressed GLB carries a real mesh shape into `.holo`', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-decomp-test-'));
    const file = path.join(dir, 'compressed_model.glb');
    fs.writeFileSync(file, Buffer.from(await compressDraco(makeSkinnedTriangleGlb())));
    try {
      const holo = await importGltfAsync(file);
      // a real mesh shape — not the degraded `file.glb#Node` text pointer
      expect(holo).toContain(' mesh {');
      const parsed = parseHolo(holo);
      expect(parsed.success).toBe(true);
      const shape = parsed.ast?.shapes?.find((s: { shapeType: string }) => s.shapeType === 'mesh');
      expect(shape).toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('importGltfAsync: an uncompressed GLB delegates to importGltf (still carries the mesh)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-plain-test-'));
    const file = path.join(dir, 'plain_model.glb');
    fs.writeFileSync(file, Buffer.from(makeSkinnedTriangleGlb()));
    try {
      const holo = await importGltfAsync(file);
      expect(holo).toContain(' mesh {');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
