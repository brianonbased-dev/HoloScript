/**
 * IPFS Service Tests
 *
 * Comprehensive test suite for IPFS integration with mocked APIs,
 * provider testing, chunked uploads, retry logic, and benchmarks.
 *
 * @module storage/__tests__/IPFSService
 * @since 3.42.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IPFSService } from '../IPFSService.js';
import { PinataProvider, NFTStorageProvider, InfuraProvider } from '../IPFSProviders.js';
import { IPFSUploadError, FileSizeExceededError } from '../IPFSTypes.js';
import type { UploadOptions, UploadProgress } from '../IPFSTypes.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('IPFSService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with Pinata provider', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      expect(service).toBeDefined();
      expect(service.getGatewayUrl('QmTest')).toContain('ipfs.io');
    });

    it('should initialize with NFT.Storage provider', () => {
      const service = new IPFSService({
        provider: 'nft.storage',
        apiKey: 'test-key',
      });

      expect(service).toBeDefined();
    });

    it('should initialize with Infura provider', () => {
      const service = new IPFSService({
        provider: 'infura',
        apiKey: 'test-project-id',
        apiSecret: 'test-secret',
      });

      expect(service).toBeDefined();
    });

    it('should initialize with fallback providers', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        fallbackProviders: [
          { provider: 'nft.storage', apiKey: 'nft-key' },
          { provider: 'infura', apiKey: 'infura-key' },
        ],
      });

      expect(service).toBeDefined();
    });

    it('should enable CDN by default', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const cdnUrl = service.getCDNUrl('QmTest');
      expect(cdnUrl).toContain('cloudflare-ipfs.com');
    });

    it('should disable CDN when specified', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        enableCDN: false,
      });

      const cdnUrl = service.getCDNUrl('QmTest');
      expect(cdnUrl).toContain('ipfs.io');
    });
  });

  describe('Upload', () => {
    it('should upload files to Pinata successfully', async () => {
      const mockResponse = {
        IpfsHash: 'QmTestHash123',
        PinSize: 1024,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });

      const result = await service.upload({
        name: 'test-upload',
        files: [{ path: 'test.txt', content: Buffer.from('Hello IPFS') }],
      });

      expect(result.cid).toBe('QmTestHash123');
      expect(result.uri).toBe('ipfs://QmTestHash123');
      expect(result.gatewayUrl).toContain('QmTestHash123');
      expect(result.cdnUrl).toContain('cloudflare-ipfs.com');
      expect(result.pinned).toBe(true);
      expect(result.size).toBe(1024);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should upload files to NFT.Storage successfully', async () => {
      const mockResponse = {
        value: {
          cid: 'bafyTest123',
          size: 2048,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const service = new IPFSService({
        provider: 'nft.storage',
        apiKey: 'test-key',
      });

      const result = await service.upload({
        name: 'test-upload',
        files: [{ path: 'test.json', content: JSON.stringify({ test: true }) }],
      });

      expect(result.cid).toBe('bafyTest123');
      expect(result.size).toBe(2048);
    });

    it('should upload files to Infura successfully', async () => {
      const mockResponse =
        JSON.stringify({ Hash: 'QmDir', Size: 512 }) +
        '\n' +
        JSON.stringify({ Hash: 'QmInfuraTest', Size: 1536 });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        text: async () => mockResponse,
      });

      const service = new IPFSService({
        provider: 'infura',
        apiKey: 'test-project-id',
        apiSecret: 'test-secret',
      });

      const result = await service.upload({
        name: 'test-upload',
        files: [{ path: 'data.bin', content: new Uint8Array([1, 2, 3, 4]) }],
      });

      expect(result.cid).toBe('QmInfuraTest');
      expect(result.size).toBe(2048);
    });

    it('should track upload progress', async () => {
      const mockResponse = {
        IpfsHash: 'QmProgress',
        PinSize: 1000,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const progressUpdates: UploadProgress[] = [];

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      await service.upload({
        name: 'progress-test',
        files: [
          { path: 'file1.txt', content: Buffer.alloc(500) },
          { path: 'file2.txt', content: Buffer.alloc(500) },
        ],
        onProgress: (progress) => {
          progressUpdates.push(progress);
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBeLessThanOrEqual(100);
    });

    it('should throw error when file size exceeds maximum', async () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        maxFileSize: 1024, // 1KB limit
      });

      await expect(
        service.upload({
          name: 'large-file',
          files: [
            { path: 'large.bin', content: Buffer.alloc(2048) }, // 2KB file
          ],
        })
      ).rejects.toThrow(FileSizeExceededError);
    });

    it('should handle upload errors gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Upload failed',
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        maxRetries: 1, // Minimize retry attempts for faster test
      });

      await expect(
        service.upload({
          name: 'error-test',
          files: [{ path: 'test.txt', content: 'test' }],
        })
      ).rejects.toThrow(IPFSUploadError);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on failure with exponential backoff', async () => {
      let attempts = 0;

      (global.fetch as any).mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return { ok: false, text: async () => 'Temporary failure' };
        }
        return {
          ok: true,
          json: async () => ({ IpfsHash: 'QmRetrySuccess', PinSize: 100 }),
        };
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        maxRetries: 3,
        retryDelay: 10, // Short delay for testing
      });

      const result = await service.upload({
        name: 'retry-test',
        files: [{ path: 'test.txt', content: 'retry' }],
      });

      expect(attempts).toBe(3);
      expect(result.cid).toBe('QmRetrySuccess');
    });

    it('should fail after max retries', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        text: async () => 'Permanent failure',
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        maxRetries: 2,
        retryDelay: 10,
      });

      await expect(
        service.upload({
          name: 'max-retry-test',
          files: [{ path: 'test.txt', content: 'fail' }],
        })
      ).rejects.toThrow(IPFSUploadError);
    });
  });

  describe('Fallback Providers', () => {
    it('should fallback to secondary provider on primary failure', async () => {
      let callCount = 0;

      (global.fetch as any).mockImplementation(async (url: string) => {
        callCount++;

        // Pinata fails
        if (url.includes('pinata')) {
          return { ok: false, text: async () => 'Pinata error' };
        }

        // NFT.Storage succeeds
        if (url.includes('nft.storage')) {
          return {
            ok: true,
            json: async () => ({ value: { cid: 'bafyFallback', size: 100 } }),
          };
        }

        return { ok: false, text: async () => 'Unknown error' };
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'pinata-key',
        maxRetries: 1,
        retryDelay: 10,
        fallbackProviders: [{ provider: 'nft.storage', apiKey: 'nft-key' }],
      });

      const result = await service.upload({
        name: 'fallback-test',
        files: [{ path: 'test.txt', content: 'fallback' }],
      });

      expect(result.cid).toBe('bafyFallback');
      expect(callCount).toBeGreaterThan(1);
    });

    it('should fail when all providers fail', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        text: async () => 'All providers failed',
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'pinata-key',
        maxRetries: 1,
        retryDelay: 10,
        fallbackProviders: [
          { provider: 'nft.storage', apiKey: 'nft-key' },
          { provider: 'infura', apiKey: 'infura-key' },
        ],
      });

      await expect(
        service.upload({
          name: 'all-fail-test',
          files: [{ path: 'test.txt', content: 'fail' }],
        })
      ).rejects.toThrow(IPFSUploadError);
    });
  });

  describe('Chunked Uploads', () => {
    it('should upload large files in chunks', async () => {
      const mockResponse = {
        IpfsHash: 'QmChunked',
        PinSize: 10 * 1024 * 1024, // 10MB
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
      });

      const largeFile = Buffer.alloc(10 * 1024 * 1024); // 10MB file

      const result = await service.upload({
        name: 'chunked-test',
        files: [{ path: 'large.bin', content: largeFile }],
      });

      expect(result.cid).toBe('QmChunked');
    });

    it('should report progress during chunked upload', async () => {
      const mockResponse = {
        IpfsHash: 'QmChunkedProgress',
        PinSize: 15 * 1024 * 1024,
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const progressUpdates: UploadProgress[] = [];

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        chunkSize: 5 * 1024 * 1024,
      });

      const largeFile = Buffer.alloc(15 * 1024 * 1024); // 15MB file

      await service.upload({
        name: 'chunked-progress-test',
        files: [{ path: 'large.bin', content: largeFile }],
        onProgress: (progress) => {
          progressUpdates.push(progress);
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBeCloseTo(100, 0);
    });
  });

  describe('Pin Operations', () => {
    it('should pin existing CID', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      await expect(service.pin('QmExisting', 'my-pin')).resolves.not.toThrow();
    });

    it('should unpin CID', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      await expect(service.unpin('QmToRemove')).resolves.not.toThrow();
    });

    it('should get pin status', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          rows: [{ status: 'pinned' }],
        }),
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const status = await service.getPinStatus('QmPinned');
      expect(status).toBe('pinned');
    });

    it('should list all pins', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rows: [
            {
              ipfs_pin_hash: 'QmPin1',
              metadata: { name: 'Pin 1' },
              size: 1024,
              status: 'pinned',
              date_pinned: '2024-01-01T00:00:00Z',
            },
            {
              ipfs_pin_hash: 'QmPin2',
              metadata: { name: 'Pin 2' },
              size: 2048,
              status: 'pinned',
              date_pinned: '2024-01-02T00:00:00Z',
            },
          ],
        }),
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const pins = await service.listPins();
      expect(pins).toHaveLength(2);
      expect(pins[0].cid).toBe('QmPin1');
      expect(pins[1].cid).toBe('QmPin2');
    });
  });

  describe('CID Verification', () => {
    it('should verify accessible CID', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          rows: [{ status: 'pinned' }],
        }),
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const isValid = await service.verifyCID('QmValid');
      expect(isValid).toBe(true);
    });

    it('should return false for inaccessible CID', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const isValid = await service.verifyCID('QmInvalid');
      expect(isValid).toBe(false);
    });
  });

  describe('CDN Integration', () => {
    it('should return CDN URL when enabled', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        enableCDN: true,
      });

      const url = service.getCDNUrl('QmTest');
      expect(url).toBe('https://cloudflare-ipfs.com/ipfs/QmTest');
    });

    it('should return gateway URL when CDN disabled', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
        enableCDN: false,
      });

      const url = service.getCDNUrl('QmTest');
      expect(url).toBe('https://ipfs.io/ipfs/QmTest');
    });

    it('should always return gateway URL', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const url = service.getGatewayUrl('QmTest');
      expect(url).toBe('https://ipfs.io/ipfs/QmTest');
    });

    it('should return IPFS URI', () => {
      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const uri = service.getIPFSUri('QmTest');
      expect(uri).toBe('ipfs://QmTest');
    });
  });

  describe('Get File', () => {
    it('should fetch file from IPFS', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => testData.buffer,
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const data = await service.get('QmFile');
      expect(data).toEqual(testData);
    });

    it('should fetch file with path', async () => {
      const testData = new Uint8Array([1, 2, 3]);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => testData.buffer,
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const data = await service.get('QmDir', 'file.txt');
      expect(data).toEqual(testData);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should upload small file quickly (< 500ms)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ IpfsHash: 'QmFast', PinSize: 100 }),
      });

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const start = Date.now();
      const result = await service.upload({
        name: 'speed-test',
        files: [{ path: 'small.txt', content: 'Hello' }],
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent uploads', async () => {
      (global.fetch as any).mockImplementation(async () => ({
        ok: true,
        json: async () => ({ IpfsHash: `QmConcurrent${Math.random()}`, PinSize: 100 }),
      }));

      const service = new IPFSService({
        provider: 'pinata',
        apiKey: 'test-key',
      });

      const uploads = Array.from({ length: 5 }, (_, i) =>
        service.upload({
          name: `concurrent-${i}`,
          files: [{ path: `file${i}.txt`, content: `Content ${i}` }],
        })
      );

      const results = await Promise.all(uploads);
      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result.cid).toContain('QmConcurrent');
      });
    });
  });
});
