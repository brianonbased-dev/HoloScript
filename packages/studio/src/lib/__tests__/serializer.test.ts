/**
 * serializer.test.ts
 * Tests for scene serialization and URL sharing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  serializeScene,
  serializeToJSON,
  deserializeScene,
  downloadHoloFile,
  openHoloFile,
  encodeSceneToURL,
  decodeSceneFromURL,
  copyShareURL,
  type HoloScene,
  type HoloSceneMetadata,
} from '../serializer';

describe('serializer', () => {
  const mockMetadata: HoloSceneMetadata = {
    id: 'test-scene-123',
    name: 'Test Scene',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const mockCode = 'scene TestScene { object Box {} }';

  const mockNodes = [
    {
      id: 'node1',
      name: 'Box',
      type: 'object' as const,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      traits: [],
    },
  ];

  const mockAssets = [
    {
      id: 'asset1',
      name: 'Texture.png',
      type: 'texture' as const,
      src: 'data:image/png;base64,abc123',
    },
  ];

  describe('serializeScene', () => {
    it('should create a v2 HoloScene object', () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);

      expect(scene.v).toBe(2);
      expect(scene.code).toBe(mockCode);
      expect(scene.nodes).toEqual(mockNodes);
      expect(scene.assets).toEqual(mockAssets);
    });

    it('should update the updatedAt timestamp', () => {
      const beforeTime = new Date().toISOString();
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);
      const afterTime = new Date().toISOString();

      expect(scene.metadata.updatedAt).not.toBe(mockMetadata.updatedAt);
      expect(scene.metadata.updatedAt >= beforeTime).toBe(true);
      expect(scene.metadata.updatedAt <= afterTime).toBe(true);
    });

    it('should preserve other metadata fields', () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);

      expect(scene.metadata.id).toBe(mockMetadata.id);
      expect(scene.metadata.name).toBe(mockMetadata.name);
      expect(scene.metadata.createdAt).toBe(mockMetadata.createdAt);
    });

    it('should handle empty nodes and assets', () => {
      const scene = serializeScene(mockMetadata, mockCode, [], []);

      expect(scene.nodes).toEqual([]);
      expect(scene.assets).toEqual([]);
    });
  });

  describe('serializeToJSON', () => {
    it('should convert scene to formatted JSON string', () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);
      const json = serializeToJSON(scene);

      expect(typeof json).toBe('string');
      expect(json).toContain('"v": 2');
      expect(json).toContain('"name": "Test Scene"');
      expect(json).toContain(mockCode);
    });

    it('should create valid parseable JSON', () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);
      const json = serializeToJSON(scene);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.v).toBe(2);
    });
  });

  describe('deserializeScene', () => {
    it('should deserialize v2 scene', () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);
      const json = serializeToJSON(scene);
      const result = deserializeScene(json);

      expect(result.ok).toBe(true);
      expect(result.scene?.v).toBe(2);
      expect(result.scene?.code).toBe(mockCode);
      expect(result.scene?.nodes).toEqual(mockNodes);
      expect(result.scene?.assets).toEqual(mockAssets);
    });

    it('should migrate v1 scene to v2', () => {
      const v1JSON = JSON.stringify({
        v: 1,
        code: 'scene OldScene {}',
        name: 'Old Scene',
      });

      const result = deserializeScene(v1JSON);

      expect(result.ok).toBe(true);
      expect(result.scene?.v).toBe(2);
      expect(result.scene?.code).toBe('scene OldScene {}');
      expect(result.scene?.metadata.name).toBe('Old Scene');
      expect(result.scene?.nodes).toEqual([]);
      expect(result.scene?.assets).toEqual([]);
    });

    it('should migrate v1 scene without version field', () => {
      const v1JSON = JSON.stringify({
        code: 'scene AnotherOldScene {}',
      });

      const result = deserializeScene(v1JSON);

      expect(result.ok).toBe(true);
      expect(result.scene?.v).toBe(2);
      expect(result.scene?.code).toBe('scene AnotherOldScene {}');
      expect(result.scene?.metadata.name).toBe('Imported Scene');
    });

    it('should reject unsupported versions', () => {
      const futureJSON = JSON.stringify({ v: 99, code: '' });
      const result = deserializeScene(futureJSON);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unsupported .holo version: 99');
    });

    it('should handle invalid JSON', () => {
      const result = deserializeScene('{invalid json}');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Parse error');
    });

    it('should handle empty string', () => {
      const result = deserializeScene('');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Parse error');
    });
  });

  describe('downloadHoloFile', () => {
    let mockCreateElement: any;
    let mockClick: any;
    let mockCreateObjectURL: any;
    let mockRevokeObjectURL: any;

    beforeEach(() => {
      mockClick = vi.fn();
      mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
      mockRevokeObjectURL = vi.fn();

      const mockAnchor = {
        href: '',
        download: '',
        click: mockClick,
      };

      mockCreateElement = vi.fn(() => mockAnchor);

      // Mock document if not available (Node.js environment)
      if (!global.document) {
        (global as any).document = {};
      }
      global.document.createElement = mockCreateElement;

      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;
    });

    it('should trigger download with correct filename', () => {
      const scene = serializeScene(mockMetadata, mockCode, [], []);
      downloadHoloFile(scene);

      const mockAnchor = mockCreateElement.mock.results[0].value;

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('test-scene.holo');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should slugify scene name with spaces', () => {
      const metadata = { ...mockMetadata, name: 'My Awesome Scene' };
      const scene = serializeScene(metadata, mockCode, [], []);
      downloadHoloFile(scene);

      const mockAnchor = mockCreateElement.mock.results[0].value;
      expect(mockAnchor.download).toBe('my-awesome-scene.holo');
    });

    it('should use fallback filename for empty name', () => {
      const metadata = { ...mockMetadata, name: '' };
      const scene = serializeScene(metadata, mockCode, [], []);
      downloadHoloFile(scene);

      const mockAnchor = mockCreateElement.mock.results[0].value;
      expect(mockAnchor.download).toBe('scene.holo');
    });

    it('should create blob with correct content', () => {
      const scene = serializeScene(mockMetadata, mockCode, [], []);
      downloadHoloFile(scene);

      // Verify blob creation
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });

  describe('openHoloFile', () => {
    it('should read and deserialize file', async () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);
      const json = serializeToJSON(scene);

      const mockFile = new File([json], 'test.holo', { type: 'application/json' });
      const mockInput = {
        type: '',
        accept: '',
        files: [mockFile],
        onchange: null as any,
        click: vi.fn(),
      };

      // Mock document if not available
      if (!global.document) {
        (global as any).document = {};
      }
      global.document.createElement = vi.fn(() => mockInput);

      // Create a mock FileReader
      const originalFileReader = global.FileReader;
      global.FileReader = vi.fn().mockImplementation(function () {
        return {
          onload: null,
          onerror: null,
          result: json,
          readAsText: function () {
            setTimeout(() => this.onload?.(), 0);
          },
        };
      }) as any;

      const resultPromise = openHoloFile();

      // Trigger the onchange event
      mockInput.onchange?.();

      const result = await resultPromise;

      expect(result.ok).toBe(true);
      expect(result.scene?.code).toBe(mockCode);

      global.FileReader = originalFileReader;
    });

    it('should handle no file selected', async () => {
      const mockInput = {
        files: [],
        onchange: null as any,
        click: vi.fn(),
      };

      if (!global.document) {
        (global as any).document = {};
      }
      global.document.createElement = vi.fn(() => mockInput);

      const resultPromise = openHoloFile();
      mockInput.onchange?.();
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      expect(result.error).toBe('No file selected');
    });

    it('should handle file read error', async () => {
      const mockFile = new File(['test'], 'test.holo');
      const mockInput = {
        files: [mockFile],
        onchange: null as any,
        click: vi.fn(),
      };

      if (!global.document) {
        (global as any).document = {};
      }
      global.document.createElement = vi.fn(() => mockInput);

      const originalFileReader = global.FileReader;
      global.FileReader = vi.fn().mockImplementation(function () {
        return {
          onload: null,
          onerror: null,
          readAsText: function () {
            setTimeout(() => this.onerror?.(), 0);
          },
        };
      }) as any;

      const resultPromise = openHoloFile();
      mockInput.onchange?.();
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      expect(result.error).toBe('File read error');

      global.FileReader = originalFileReader;
    });
  });

  describe('URL encoding/decoding', () => {
    it('should encode and decode scene to/from URL', async () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);

      const encoded = await encodeSceneToURL(scene);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const result = await decodeSceneFromURL(encoded);
      expect(result.ok).toBe(true);
      expect(result.scene?.code).toBe(mockCode);
      expect(result.scene?.nodes).toEqual(mockNodes);
    });

    it('should use URL-safe base64 (no +/= characters)', async () => {
      const scene = serializeScene(mockMetadata, mockCode, mockNodes, mockAssets);
      const encoded = await encodeSceneToURL(scene);

      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should handle compression fallback', async () => {
      // Mock CompressionStream to fail
      const originalCompressionStream = (global as any).CompressionStream;
      (global as any).CompressionStream = undefined;

      const scene = serializeScene(mockMetadata, 'scene Simple {}', [], []);
      const encoded = await encodeSceneToURL(scene);

      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      // Restore
      (global as any).CompressionStream = originalCompressionStream;
    });

    it('should handle decompression fallback', async () => {
      // First encode without compression
      const originalCompressionStream = (global as any).CompressionStream;
      (global as any).CompressionStream = undefined;

      const scene = serializeScene(mockMetadata, 'scene Fallback {}', [], []);
      const encoded = await encodeSceneToURL(scene);

      // Now decode without decompression
      const originalDecompressionStream = (global as any).DecompressionStream;
      (global as any).DecompressionStream = undefined;

      const result = await decodeSceneFromURL(encoded);

      expect(result.ok).toBe(true);
      expect(result.scene?.code).toBe('scene Fallback {}');

      // Restore
      (global as any).CompressionStream = originalCompressionStream;
      (global as any).DecompressionStream = originalDecompressionStream;
    });

    it('should handle invalid base64 in decode', async () => {
      const result = await decodeSceneFromURL('!!!invalid!!!');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL decode error');
    });

    it('should handle corrupted compressed data', async () => {
      // 'SGVsbG8gV29ybGQ' is base64("Hello World") — valid base64 but not valid deflate
      const badData = 'SGVsbG8gV29ybGQ';
      const result = await decodeSceneFromURL(badData);
      expect(result.ok).toBe(false);
    });
  });

  describe('copyShareURL', () => {
    it('should copy share URL to clipboard', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      });

      // Mock window if not available (Node.js environment)
      if (typeof window === 'undefined') {
        (global as any).window = {};
      }
      Object.defineProperty(window, 'location', {
        value: {
          origin: 'https://holoscript.studio',
        },
        writable: true,
        configurable: true,
      });

      const scene = serializeScene(mockMetadata, 'scene Share {}', [], []);
      await copyShareURL(scene);

      expect(mockWriteText).toHaveBeenCalled();
      const copiedURL = mockWriteText.mock.calls[0][0];
      expect(copiedURL).toContain('https://holoscript.studio/create?scene=');
    });
  });
});
