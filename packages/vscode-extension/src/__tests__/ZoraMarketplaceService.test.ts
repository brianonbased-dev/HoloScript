/**
 * Unit tests for ZoraMarketplaceService
 *
 * Tests Zora Protocol NFT marketplace integration including:
 * - NFT minting with royalty configuration
 * - IPFS metadata upload simulation
 * - Marketplace listing generation
 * - Minted NFT tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZoraMarketplaceService } from '../services/ZoraMarketplaceService';
import type { NFTMetadata, ZoraRoyaltyConfig } from '../../../core/src/plugins/HololandTypes';

// Mock vscode module
vi.mock('vscode', async () => {
  const actual = await vi.importActual('vscode');
  return {
    ...actual,
    window: {
      ...((actual as any).window || {}),
      showInformationMessage: vi.fn().mockResolvedValue('Confirm'),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    env: {
      openExternal: vi.fn(),
    },
    Uri: {
      parse: vi.fn((url: string) => ({ toString: () => url })),
    },
  };
});

// Import mocked vscode to access the mock
import * as vscode from 'vscode';
const mockShowInformationMessage = vscode.window.showInformationMessage as ReturnType<typeof vi.fn>;

describe('ZoraMarketplaceService', () => {
  let service: ZoraMarketplaceService;
  let sampleMetadata: NFTMetadata;
  let sampleRoyaltyConfig: ZoraRoyaltyConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    sampleMetadata = {
      name: 'Phoenix Brew VRR Twin',
      description: 'A 1:1 digital twin of Phoenix Brew Coffee Shop in Seattle',
      image: 'ipfs://QmExampleHash123',
      attributes: [
        { trait_type: 'Category', value: 'VRR Twin' },
        { trait_type: 'Location', value: 'Seattle, WA' },
        { trait_type: 'Business Type', value: 'Coffee Shop' },
      ],
    };
    sampleRoyaltyConfig = {
      percentage: 10,
      recipient: '0xCreatorAddress123',
      permanent: true,
    };
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      service = new ZoraMarketplaceService();
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.network).toBe('base');
      expect(config.defaultRoyalty).toBe(10);
      expect(config.ipfsGateway).toBe('https://ipfs.io/ipfs');
      expect(config.simulationMode).toBe(true);
    });

    it('should create service with custom configuration', () => {
      service = new ZoraMarketplaceService({
        enabled: false,
        network: 'ethereum',
        defaultRoyalty: 15,
        ipfsGateway: 'https://gateway.pinata.cloud/ipfs',
        simulationMode: false,
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.network).toBe('ethereum');
      expect(config.defaultRoyalty).toBe(15);
    });
  });

  describe('NFT Minting - Simulation Mode', () => {
    beforeEach(() => {
      service = new ZoraMarketplaceService({ simulationMode: true });
    });

    it('should mint NFT successfully when user confirms', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      const result = await service.mintNFT(sampleMetadata, sampleRoyaltyConfig);

      expect(result).toMatchObject({
        tokenId: expect.stringMatching(/^zora_\d+$/),
        contractAddress: expect.stringMatching(/^0x[a-f0-9]{40}$/),
        network: 'base',
        txHash: expect.stringMatching(/^0x[a-f0-9]{64}$/),
        ipfsUrl: expect.stringContaining('ipfs'),
        marketplaceUrl: expect.stringContaining('zora.co'),
        royaltyPercentage: 10,
      });
    });

    it('should throw error when user cancels minting', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Cancel');

      await expect(service.mintNFT(sampleMetadata)).rejects.toThrow('Minting cancelled by user');
    });

    it('should use default royalty config if not provided', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      const result = await service.mintNFT(sampleMetadata);

      expect(result.royaltyPercentage).toBe(10); // default
    });

    it('should generate valid IPFS URL', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      const result = await service.mintNFT(sampleMetadata);

      expect(result.ipfsUrl).toMatch(/^https:\/\/ipfs\.io\/ipfs\/Qm[a-zA-Z0-9]+$/);
    });

    it('should add minted NFT to history', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      await service.mintNFT(sampleMetadata);
      const minted = service.getMintedNFTs();

      expect(minted.length).toBe(1);
      expect(minted[0].tokenId).toBeDefined();
    });
  });

  describe('Minted NFT Tracking', () => {
    beforeEach(() => {
      service = new ZoraMarketplaceService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should track all minted NFTs', async () => {
      const mint1 = service.mintNFT(sampleMetadata);
      await vi.advanceTimersByTimeAsync(3500);
      await mint1;

      const mint2 = service.mintNFT({ ...sampleMetadata, name: 'Second NFT' });
      await vi.advanceTimersByTimeAsync(3500);
      await mint2;

      const minted = service.getMintedNFTs();
      expect(minted.length).toBe(2);
    });

    it('should calculate average royalty rate', async () => {
      const mint1 = service.mintNFT(sampleMetadata, { percentage: 10, recipient: '0x123', permanent: true });
      await vi.advanceTimersByTimeAsync(3500);
      await mint1;

      const mint2 = service.mintNFT(sampleMetadata, { percentage: 15, recipient: '0x123', permanent: true });
      await vi.advanceTimersByTimeAsync(3500);
      await mint2;

      const avgRoyalty = service.getTotalRoyaltyRate();
      expect(avgRoyalty).toBe(12.5); // (10 + 15) / 2
    });

    it('should export minted NFTs as JSON', async () => {
      const mint = service.mintNFT(sampleMetadata);
      await vi.advanceTimersByTimeAsync(3500);
      await mint;

      const exported = service.exportNFTs();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });
  });

  describe('Zora Marketplace URLs', () => {
    beforeEach(() => {
      service = new ZoraMarketplaceService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');
    });

    it('should generate correct Zora marketplace URL', async () => {
      const result = await service.mintNFT(sampleMetadata);

      expect(result.marketplaceUrl).toMatch(/^https:\/\/zora\.co\//);
    });
  });

  describe('Royalty Configuration', () => {
    beforeEach(() => {
      service = new ZoraMarketplaceService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');
    });

    it('should respect custom royalty percentage', async () => {
      const customRoyalty: ZoraRoyaltyConfig = {
        percentage: 15,
        recipient: '0xCustomRecipient',
        permanent: true,
      };

      const result = await service.mintNFT(sampleMetadata, customRoyalty);
      expect(result.royaltyPercentage).toBe(15);
    });

    it('should support non-permanent royalties', async () => {
      const nonPermanent: ZoraRoyaltyConfig = {
        percentage: 10,
        recipient: '0xRecipient',
        permanent: false,
      };

      const result = await service.mintNFT(sampleMetadata, nonPermanent);
      expect(result.royaltyPercentage).toBe(10);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      service = new ZoraMarketplaceService({ network: 'base' });

      service.updateConfig({ network: 'ethereum', defaultRoyalty: 15 });

      const config = service.getConfig();
      expect(config.network).toBe('ethereum');
      expect(config.defaultRoyalty).toBe(15);
    });

    it('should preserve unmodified config values', () => {
      service = new ZoraMarketplaceService({
        network: 'base',
        ipfsGateway: 'https://custom-gateway.com/ipfs',
      });

      service.updateConfig({ network: 'ethereum' });

      const config = service.getConfig();
      expect(config.network).toBe('ethereum');
      expect(config.ipfsGateway).toBe('https://custom-gateway.com/ipfs');
    });
  });

  describe('Disabled State', () => {
    beforeEach(() => {
      service = new ZoraMarketplaceService({ enabled: false });
    });

    it('should throw error when minting is disabled', async () => {
      await expect(service.mintNFT(sampleMetadata)).rejects.toThrow('Zora Marketplace is disabled');
    });
  });

  describe('Different Networks', () => {
    beforeEach(() => {
      mockShowInformationMessage.mockResolvedValue('Confirm');
    });

    it('should mint on base network', async () => {
      service = new ZoraMarketplaceService({ network: 'base', simulationMode: true });
      const result = await service.mintNFT(sampleMetadata);
      expect(result.network).toBe('base');
    });

    it('should mint on ethereum network', async () => {
      service = new ZoraMarketplaceService({ network: 'ethereum', simulationMode: true });
      const result = await service.mintNFT(sampleMetadata);
      expect(result.network).toBe('ethereum');
    });

    it('should mint on zora network', async () => {
      service = new ZoraMarketplaceService({ network: 'zora', simulationMode: true });
      const result = await service.mintNFT(sampleMetadata);
      expect(result.network).toBe('zora');
    });
  });

  describe('IPFS Upload', () => {
    beforeEach(() => {
      service = new ZoraMarketplaceService({ simulationMode: true });
    });

    it('should simulate IPFS upload', async () => {
      const url = await service.uploadToIPFS(sampleMetadata);

      expect(url).toMatch(/^https:\/\/ipfs\.io\/ipfs\/Qm[a-zA-Z0-9]+$/);
    });
  });

  describe('Disposal', () => {
    it('should clear minted NFTs on dispose', async () => {
      service = new ZoraMarketplaceService({ simulationMode: true });
      mockShowInformationMessage.mockResolvedValue('Confirm');

      await service.mintNFT(sampleMetadata);
      expect(service.getMintedNFTs().length).toBe(1);

      service.dispose();
      expect(service.getMintedNFTs().length).toBe(0);
    });
  });
});
