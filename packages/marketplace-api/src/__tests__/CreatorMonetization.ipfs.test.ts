import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import CreatorMonetization from '../CreatorMonetization';
import type { NFTMetadata } from '../CreatorMonetization';

const storageMocks = vi.hoisted(() => ({
  upload: vi.fn(),
  IPFSService: vi.fn(),
}));

vi.mock('@holoscript/core/storage', () => ({
  IPFSService: storageMocks.IPFSService,
}));

const CREATOR_ADDRESS: Address = '0x1234567890123456789012345678901234567890';

function createCreator(options: Partial<ConstructorParameters<typeof CreatorMonetization>[0]> = {}) {
  return new CreatorMonetization({
    network: 'base',
    creatorAddress: CREATOR_ADDRESS,
    ipfsProvider: 'pinata',
    ipfsApiKey: 'pinata-key',
    ipfsApiSecret: 'pinata-secret',
    ...options,
  });
}

function makeFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('CreatorMonetization IPFS storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.upload.mockResolvedValue({
      cid: 'bafybeiholoscript',
      uri: 'ipfs://bafybeiholoscript',
      gatewayUrl: 'https://ipfs.io/ipfs/bafybeiholoscript',
      size: 42,
    });
    storageMocks.IPFSService.mockImplementation(function IPFSServiceMock() {
      return {
        upload: storageMocks.upload,
      };
    });
  });

  it('uploads files through the configured core IPFS service and records returned CIDs', async () => {
    const onIPFSUpload = vi.fn();
    const creator = createCreator({
      ipfsGatewayUrl: 'https://gateway.example/ipfs',
      onIPFSUpload,
    });

    const result = await creator.uploadToIPFS([makeFile('hello', 'preview image.png')]);

    expect(storageMocks.IPFSService).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pinata',
        apiKey: 'pinata-key',
        apiSecret: 'pinata-secret',
        gatewayUrl: 'https://gateway.example/ipfs',
      })
    );
    expect(storageMocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'preview-image',
        pin: true,
        files: [
          expect.objectContaining({
            path: 'preview-image.png',
            content: expect.any(Buffer),
          }),
        ],
      })
    );
    expect(result).toMatchObject({
      cid: 'bafybeiholoscript',
      uri: 'ipfs://bafybeiholoscript',
      gatewayUrl: 'https://ipfs.io/ipfs/bafybeiholoscript',
      size: 42,
    });
    expect(creator.getIPFSUploadRecords()).toEqual([
      expect.objectContaining({
        cid: 'bafybeiholoscript',
        provider: 'pinata',
        name: 'preview-image',
        fileCount: 1,
      }),
    ]);
    expect(onIPFSUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafybeiholoscript',
        provider: 'pinata',
      })
    );
  });

  it('uploads NFT metadata JSON instead of generating a mock CID', async () => {
    const creator = createCreator();
    const metadata: NFTMetadata = {
      name: 'Phoenix Downtown VRR Twin',
      description: '1:1 digital twin',
      image: 'ipfs://bafypreview',
      attributes: [{ trait_type: 'Layer', value: 'VRR' }],
    };

    const uri = await (
      creator as unknown as {
        uploadMetadataToIPFS(metadata: NFTMetadata): Promise<string>;
      }
    ).uploadMetadataToIPFS(metadata);

    expect(uri).toBe('ipfs://bafybeiholoscript');
    expect(storageMocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'metadata-Phoenix-Downtown-VRR-Twin',
        files: [
          expect.objectContaining({
            path: 'metadata.json',
            content: expect.stringContaining('"name": "Phoenix Downtown VRR Twin"'),
          }),
        ],
      })
    );
    expect(creator.getIPFSUploadRecords()[0]).toMatchObject({
      cid: 'bafybeiholoscript',
      name: 'metadata-Phoenix-Downtown-VRR-Twin',
    });
  });

  it('fails loudly before minting when no IPFS API key is configured', async () => {
    const creator = createCreator({ ipfsApiKey: undefined });
    const previousPinata = process.env.PINATA_API_KEY;
    const previousGeneric = process.env.HOLOSCRIPT_IPFS_API_KEY;
    delete process.env.PINATA_API_KEY;
    delete process.env.HOLOSCRIPT_IPFS_API_KEY;

    await expect(creator.uploadToIPFS([makeFile('hello', 'asset.txt')])).rejects.toMatchObject({
      code: 'IPFS_UPLOAD_FAILED',
      details: { provider: 'pinata' },
    });
    expect(storageMocks.IPFSService).not.toHaveBeenCalled();

    if (previousPinata) {
      process.env.PINATA_API_KEY = previousPinata;
    }
    if (previousGeneric) {
      process.env.HOLOSCRIPT_IPFS_API_KEY = previousGeneric;
    }
  });
});
