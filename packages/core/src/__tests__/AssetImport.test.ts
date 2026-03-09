import { describe, it, expect, beforeEach } from 'vitest';
import { ModelImporter } from '../assets/ModelImporter';
import { TextureProcessor } from '../assets/TextureProcessor';
import { ImportPipeline } from '../assets/ImportPipeline';

describe('Asset Import Pipeline (Cycle 177)', () => {
  describe('ModelImporter', () => {
    let importer: ModelImporter;
    beforeEach(() => {
      importer = new ModelImporter();
    });

    it('should import glTF models', () => {
      const result = importer.import('model.gltf', 'data');
      expect(result.meshes).toHaveLength(1);
      expect(result.materials).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should import OBJ with warnings', () => {
      const result = importer.import('model.obj', 'data');
      expect(result.meshes).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should reject unsupported formats', () => {
      const result = importer.import('model.xyz', 'data');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect format from extension', () => {
      expect(importer.detectFormat('scene.glb')).toBe('gltf');
      expect(importer.detectFormat('mesh.fbx')).toBe('fbx');
    });
  });

  describe('TextureProcessor', () => {
    let processor: TextureProcessor;
    beforeEach(() => {
      processor = new TextureProcessor({ maxSize: 2048, targetFormat: 'bc3' });
    });

    it('should resize to power of two', () => {
      const result = processor.process({
        id: 't1',
        name: 'Tex',
        width: 300,
        height: 500,
        format: 'rgba8',
        sizeBytes: 600000,
      });
      expect(result.width).toBe(256);
      expect(result.height).toBe(512);
    });

    it('should generate mipmaps', () => {
      const result = processor.process({
        id: 't1',
        name: 'Tex',
        width: 512,
        height: 512,
        format: 'rgba8',
        sizeBytes: 1048576,
      });
      expect(result.mipmapLevels).toBeGreaterThan(1);
    });

    it('should compress textures', () => {
      const result = processor.process({
        id: 't1',
        name: 'Tex',
        width: 512,
        height: 512,
        format: 'rgba8',
        sizeBytes: 1048576,
      });
      expect(result.compressionRatio).toBeLessThan(1);
    });

    it('should pack atlas', () => {
      const textures = [
        {
          id: 't1',
          name: 'A',
          width: 256,
          height: 256,
          format: 'rgba8' as const,
          sizeBytes: 262144,
        },
        {
          id: 't2',
          name: 'B',
          width: 256,
          height: 256,
          format: 'rgba8' as const,
          sizeBytes: 262144,
        },
      ];
      const atlas = processor.packAtlas(textures, 1024);
      expect(atlas.entries).toHaveLength(2);
      expect(atlas.utilization).toBeGreaterThan(0);
    });
  });

  describe('ImportPipeline', () => {
    let pipeline: ImportPipeline;
    beforeEach(() => {
      pipeline = new ImportPipeline();
    });

    it('should queue and run model jobs', () => {
      pipeline.addModelJob('scene.gltf', 'data');
      const stats = pipeline.runAll();
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0);
    });

    it('should queue and run texture jobs', () => {
      pipeline.addTextureJob('tex.png', {
        id: 't1',
        name: 'Tex',
        width: 512,
        height: 512,
        format: 'rgba8',
        sizeBytes: 1048576,
      });
      const stats = pipeline.runAll();
      expect(stats.completed).toBe(1);
    });

    it('should handle batch imports', () => {
      pipeline.addModelJob('a.gltf', 'data');
      pipeline.addModelJob('b.obj', 'data');
      pipeline.addTextureJob('c.png', {
        id: 't1',
        name: 'C',
        width: 256,
        height: 256,
        format: 'rgba8',
        sizeBytes: 65536,
      });
      const stats = pipeline.runAll();
      expect(stats.totalJobs).toBe(3);
      expect(stats.completed).toBe(3);
    });

    it('should report failures for unsupported formats', () => {
      pipeline.addModelJob('bad.xyz', 'data');
      const stats = pipeline.runAll();
      expect(stats.failed).toBe(1);
    });
  });
});
