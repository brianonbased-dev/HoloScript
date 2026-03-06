/**
 * Unit tests for AgentKitService
 *
 * Tests AI agent wallet management including:
 * - Wallet creation and retrieval
 * - NFT minting in simulation and real modes
 * - Balance queries
 * - Royalty tracking
 * - Configuration management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentKitService } from '../services/AgentKitService';
import type { NFTMetadata, RoyaltyEvent } from '../../../core/src/plugins/HololandTypes';

// Mock vscode module
vi.mock('vscode', async () => {
  const actual = await vi.importActual('vscode');
  return {
    ...actual,
    window: {
      ...((actual as any).window || {}),
      showInformationMessage: vi.fn(),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
    },
  };
});

// Import mocked vscode to access the mock
import * as vscode from 'vscode';
const mockShowInformationMessage = vscode.window.showInformationMessage as ReturnType<typeof vi.fn>;

describe('AgentKitService', () => {
  let service: AgentKitService;
  let sampleNFTMetadata: NFTMetadata;

  beforeEach(() => {
    vi.clearAllMocks();
    sampleNFTMetadata = {
      name: 'VRR Coffee Shop Twin',
      description: 'Digital twin of Phoenix Brew Coffee Shop',
      image: 'ipfs://QmTest123',
      attributes: [
        { trait_type: 'Category', value: 'VRR Twin' },
        { trait_type: 'Location', value: 'Seattle' },
      ],
    };
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      service = new AgentKitService();
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.network).toBe('base-sepolia');
      expect(config.defaultGasLimit).toBe(21000);
      expect(config.simulationMode).toBe(true);
    });

    it('should create service with custom configuration', () => {
      service = new AgentKitService({
        enabled: false,
        network: 'ethereum',
        defaultGasLimit: 50000,
        simulationMode: false,
      });

      const config = service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.network).toBe('ethereum');
      expect(config.defaultGasLimit).toBe(50000);
      expect(config.simulationMode).toBe(false);
    });
  });

  describe('Wallet Creation', () => {
    beforeEach(() => {
      service = new AgentKitService();
    });

    it('should create wallet for new agent', async () => {
      const wallet = await service.createWallet('agent-001');

      expect(wallet).toMatchObject({
        id: 'agent-001',
        address: expect.stringMatching(/^0x[a-f0-9]+$/),
        network: 'base-sepolia',
        balance: '0',
        nonce: 0,
        createdAt: expect.any(Number),
      });
    });

    it('should return existing wallet if already created', async () => {
      const wallet1 = await service.createWallet('agent-001');
      const wallet2 = await service.createWallet('agent-001');

      expect(wallet1.address).toBe(wallet2.address);
    });

    it('should throw error when disabled', async () => {
      service = new AgentKitService({ enabled: false });

      await expect(service.createWallet('agent-001')).rejects.toThrow('AgentKit is disabled');
    });

    it('should create multiple wallets for different agents', async () => {
      const wallet1 = await service.createWallet('agent-001');
      const wallet2 = await service.createWallet('agent-002');

      expect(wallet1.address).not.toBe(wallet2.address);
      expect(service.getAllWallets().length).toBe(2);
    });
  });

  describe('Wallet Retrieval', () => {
    beforeEach(async () => {
      service = new AgentKitService();
      await service.createWallet('agent-001');
      await service.createWallet('agent-002');
    });

    it('should get wallet by agent ID', () => {
      const wallet = service.getWallet('agent-001');

      expect(wallet).toBeDefined();
      expect(wallet?.id).toBe('agent-001');
    });

    it('should return undefined for non-existent wallet', () => {
      const wallet = service.getWallet('non-existent');
      expect(wallet).toBeUndefined();
    });

    it('should get all wallets', () => {
      const wallets = service.getAllWallets();

      expect(wallets.length).toBe(2);
      expect(wallets[0].id).toBe('agent-001');
      expect(wallets[1].id).toBe('agent-002');
    });

    it('should return empty array when no wallets exist', () => {
      service = new AgentKitService();
      const wallets = service.getAllWallets();
      expect(wallets).toEqual([]);
    });
  });

  describe('NFT Minting - Simulation Mode', () => {
    beforeEach(async () => {
      service = new AgentKitService({ simulationMode: true });
      await service.createWallet('agent-001');
    });

    it('should mint NFT successfully when user confirms', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      const result = await service.mintNFT('agent-001', sampleNFTMetadata, 10);

      expect(result).toMatchObject({
        tokenId: expect.stringMatching(/^token_\d+$/),
        txHash: expect.stringMatching(/^0x[a-f0-9]{64}$/),
      });
    });

    it('should throw error when user cancels minting', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Cancel');

      await expect(service.mintNFT('agent-001', sampleNFTMetadata)).rejects.toThrow(
        'Minting cancelled by user'
      );
    });

    it('should throw error when wallet does not exist', async () => {
      await expect(service.mintNFT('non-existent', sampleNFTMetadata)).rejects.toThrow(
        'No wallet found for agent: non-existent'
      );
    });

    it('should use default royalty percentage if not specified', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');

      const result = await service.mintNFT('agent-001', sampleNFTMetadata);
      expect(result.tokenId).toBeDefined();
    });

    it('should simulate network delay', async () => {
      mockShowInformationMessage.mockResolvedValueOnce('Confirm');
      vi.useFakeTimers();

      const mintPromise = service.mintNFT('agent-001', sampleNFTMetadata);
      await vi.advanceTimersByTimeAsync(2000);

      const result = await mintPromise;
      expect(result.tokenId).toBeDefined();

      vi.useRealTimers();
    });
  });

  describe('NFT Minting - Real Mode', () => {
    beforeEach(async () => {
      service = new AgentKitService({ simulationMode: false });
      await service.createWallet('agent-001');
    });

    it('should throw error for real minting (not yet implemented)', async () => {
      await expect(service.mintNFT('agent-001', sampleNFTMetadata)).rejects.toThrow(
        'Real NFT minting not yet implemented'
      );
    });
  });

  describe('Balance Queries', () => {
    beforeEach(async () => {
      service = new AgentKitService();
      await service.createWallet('agent-001');
    });

    it('should return mock balance in simulation mode', async () => {
      const balance = await service.getBalance('agent-001');
      expect(balance).toBe('1000000000000000000'); // 1 ETH
    });

    it('should throw error for non-existent wallet', async () => {
      await expect(service.getBalance('non-existent')).rejects.toThrow(
        'No wallet found for agent: non-existent'
      );
    });
  });

  describe('Royalty Tracking', () => {
    beforeEach(() => {
      service = new AgentKitService();
    });

    it('should record royalty event', () => {
      const event: RoyaltyEvent = {
        tokenId: 'token_123',
        amount: '1000000000000000', // 0.001 ETH
        percentage: 10,
        from: '0xBuyer...',
        timestamp: Date.now(),
      };

      service.recordRoyalty(event);
      const history = service.getRoyaltyHistory();

      expect(history.length).toBe(1);
      expect(history[0]).toEqual(event);
    });

    it('should get royalty history for specific token', () => {
      service.recordRoyalty({
        tokenId: 'token_123',
        amount: '1000',
        percentage: 10,
        from: '0xBuyer1',
        timestamp: Date.now(),
      });
      service.recordRoyalty({
        tokenId: 'token_456',
        amount: '2000',
        percentage: 10,
        from: '0xBuyer2',
        timestamp: Date.now(),
      });

      const history = service.getRoyaltyHistory('token_123');
      expect(history.length).toBe(1);
      expect(history[0].tokenId).toBe('token_123');
    });

    it('should calculate total royalties correctly', () => {
      service.recordRoyalty({
        tokenId: 'token_1',
        amount: '1000000000000000',
        percentage: 10,
        from: '0xBuyer1',
        timestamp: Date.now(),
      });
      service.recordRoyalty({
        tokenId: 'token_2',
        amount: '2000000000000000',
        percentage: 10,
        from: '0xBuyer2',
        timestamp: Date.now(),
      });

      const total = service.getTotalRoyalties();
      expect(total).toBe((BigInt('1000000000000000') + BigInt('2000000000000000')).toString());
    });

    it('should return zero for no royalties', () => {
      const total = service.getTotalRoyalties();
      expect(total).toBe('0');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      service = new AgentKitService({ network: 'base-sepolia' });

      service.updateConfig({ network: 'ethereum', simulationMode: false });

      const config = service.getConfig();
      expect(config.network).toBe('ethereum');
      expect(config.simulationMode).toBe(false);
    });

    it('should preserve unmodified config values', () => {
      service = new AgentKitService({ network: 'base', defaultGasLimit: 50000 });

      service.updateConfig({ network: 'ethereum' });

      const config = service.getConfig();
      expect(config.network).toBe('ethereum');
      expect(config.defaultGasLimit).toBe(50000);
    });
  });

  describe('Wallet Export', () => {
    it('should export wallets as JSON', async () => {
      service = new AgentKitService();
      await service.createWallet('agent-001');
      await service.createWallet('agent-002');

      const exported = service.exportWallets();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].id).toBe('agent-001');
    });

    it('should export empty array when no wallets exist', () => {
      service = new AgentKitService();

      const exported = service.exportWallets();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual([]);
    });
  });

  describe('Disposal', () => {
    it('should clear wallets on dispose', async () => {
      service = new AgentKitService();
      await service.createWallet('agent-001');

      expect(service.getAllWallets().length).toBe(1);

      service.dispose();
      expect(service.getAllWallets().length).toBe(0);
    });

    it('should clear royalty events on dispose', () => {
      service = new AgentKitService();
      service.recordRoyalty({
        tokenId: 'token_1',
        amount: '1000',
        percentage: 10,
        from: '0xBuyer',
        timestamp: Date.now(),
      });

      service.dispose();
      expect(service.getRoyaltyHistory().length).toBe(0);
    });
  });

  describe('Different Networks', () => {
    it('should create wallet on base network', async () => {
      service = new AgentKitService({ network: 'base' });
      const wallet = await service.createWallet('agent-001');
      expect(wallet.network).toBe('base');
    });

    it('should create wallet on ethereum network', async () => {
      service = new AgentKitService({ network: 'ethereum' });
      const wallet = await service.createWallet('agent-001');
      expect(wallet.network).toBe('ethereum');
    });

    it('should create wallet on base-sepolia testnet', async () => {
      service = new AgentKitService({ network: 'base-sepolia' });
      const wallet = await service.createWallet('agent-001');
      expect(wallet.network).toBe('base-sepolia');
    });
  });
});
