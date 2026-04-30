import { describe, expect, it } from 'vitest';
import {
  createVRMAvatarFromFile,
  validateVRM,
  extractMetadata,
  isCommerciallyUsable,
  estimateVRAM,
} from '../vrmImport';

function makeFile(name: string, data: Uint8Array | ArrayBuffer): File {
  return new File([data], name, { type: 'model/gltf-binary' });
}

/** Build a minimal GLB with a JSON chunk containing `json`. */
function buildGLB(json: Record<string, unknown>): ArrayBuffer {
  const jsonText = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const totalLen = 12 + 8 + jsonBytes.length;

  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  // header
  view.setUint32(0, 0x46546c67, true); // magic 'glTF'
  view.setUint32(4, 2, true); // version
  view.setUint32(8, totalLen, true); // length

  // JSON chunk header
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'

  // JSON data
  const u8 = new Uint8Array(buf);
  u8.set(jsonBytes, 20);

  return buf;
}

describe('vrmImport', () => {
  it('returns minimal model for non-GLB file', async () => {
    const file = makeFile('not-a-vrm.txt', new Uint8Array([1, 2, 3]));
    const model = await createVRMAvatarFromFile(file);
    expect(model.metadata.title).toBe('not-a-vrm.txt');
    expect(model.meshCount).toBe(0);
    expect(model.fileSizeBytes).toBe(3);
  });

  it('parses VRM 1.0 from GLB', async () => {
    const glb = buildGLB({
      asset: { version: '2.0' },
      meshes: [{ name: 'body' }, { name: 'face' }],
      nodes: [{}, {}, {}],
      materials: [{}, {}],
      textures: [{}],
      extensions: {
        VRMC_vrm: {
          meta: {
            name: 'Test Avatar',
            version: '1.0',
            authors: [{ name: 'Test Author' }],
            licenseUrl: 'https://example.com/license',
          },
          humanoid: {
            humanBones: [
              { bone: 'hips' },
              { bone: 'spine' },
              { bone: 'head' },
            ],
          },
          expressions: {},
          lookAt: {},
          springBone: {},
        },
      },
    });
    const file = makeFile('test.vrm', glb);
    const model = await createVRMAvatarFromFile(file);

    expect(model.vrmVersion).toBe('1.0');
    expect(model.meshCount).toBe(2);
    expect(model.materialCount).toBe(2);
    expect(model.textureCount).toBe(1);
    expect(model.boneCount).toBe(3);
    expect(model.hasSpringBones).toBe(true);
    expect(model.hasExpressions).toBe(true);
    expect(model.hasLookAt).toBe(true);
  });

  it('parses VRM 0.x from GLB', async () => {
    const glb = buildGLB({
      asset: { version: '2.0' },
      meshes: [{}],
      nodes: [{}],
      materials: [{}],
      extensions: {
        VRM: {
          meta: {
            title: 'Old Avatar',
            version: '0.0',
            author: 'Old Author',
          },
          humanoid: {
            bones: [{}, {}, {}, {}],
          },
          blendShapeMaster: {},
          firstPerson: {},
          secondaryAnimation: {},
        },
      },
    });
    const file = makeFile('old.vrm', glb);
    const model = await createVRMAvatarFromFile(file);

    expect(model.vrmVersion).toBe('0.x');
    expect(model.meshCount).toBe(1);
    expect(model.boneCount).toBe(4);
    expect(model.hasSpringBones).toBe(true);
    expect(model.hasExpressions).toBe(true);
    expect(model.hasLookAt).toBe(true);
  });

  it('throws when GLB has no JSON chunk', async () => {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint32(0, 0x46546c67, true); // magic
    view.setUint32(4, 2, true); // version
    view.setUint32(8, 12, true); // length = header only
    const file = makeFile('empty.glb', buf);
    await expect(createVRMAvatarFromFile(file)).rejects.toThrow(/missing JSON chunk/);
  });

  it('validateVRM detects missing extension', () => {
    const result = validateVRM({ asset: {}, meshes: [], nodes: [] });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing VRM extension/);
  });

  it('extractMetadata reads VRM 1.0 meta', () => {
    const meta = extractMetadata({
      meta: {
        name: 'Avatar One',
        version: '1.0',
        authors: [{ name: 'Alice' }],
      },
    });
    expect(meta.title).toBe('Avatar One');
    expect(meta.version).toBe('1.0');
    expect(meta.author).toBe('Alice');
  });

  it('isCommerciallyUsable returns true for allow', () => {
    expect(isCommerciallyUsable({ commercialUsage: 'allow' } as any)).toBe(true);
    expect(isCommerciallyUsable({ commercialUsage: 'disallow' } as any)).toBe(false);
  });

  it('estimateVRAM sums mesh and texture sizes', () => {
    const est = estimateVRAM({ meshCount: 2, textureCount: 3 } as any);
    expect(est.meshMB).toBeGreaterThan(0);
    expect(est.textureMB).toBeGreaterThan(0);
    expect(est.totalMB).toBe(est.meshMB + est.textureMB);
  });
});
