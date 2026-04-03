/**
 * ZoraCoinsTrait Blockchain Integration Tests
 *
 * Tests blockchain interactions with Zora Protocol on Base L2.
 * All external RPC calls are mocked so tests run without network access.
 *
 * @version 3.2.0
 * @milestone v3.2 (June 2026)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletConnection } from '../../web3/WalletConnection';
import { GasEstimator } from '../../web3/GasEstimator';
import { createPublicClient, http, parseEther, type Address } from 'viem';
import { base, baseGoerli } from 'viem/chains';

// ---------------------------------------------------------------------------
// Mock viem's createPublicClient so no real RPC calls are made.
// The mock returns a client stub whose async methods return realistic data.
// ---------------------------------------------------------------------------
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');

  const mockBlock = {
    baseFeePerGas: actual.parseGwei('0.001'),
    number: BigInt(12345678),
    hash: '0x' + 'ab'.repeat(32),
    timestamp: BigInt(1700000000),
    transactions: [],
  };

  function createMockPublicClient(opts?: { chain?: { id: number; name: string } }) {
    return {
      chain: opts?.chain ?? actual.base,
      getBlock: vi.fn().mockResolvedValue(mockBlock),
      getBlockNumber: vi.fn().mockResolvedValue(BigInt(12345678)),
      getBalance: vi.fn().mockResolvedValue(BigInt(0)), // dead address = 0 balance
      estimateGas: vi.fn().mockResolvedValue(BigInt(180000)),
    };
  }

  return {
    ...actual,
    createPublicClient: vi.fn((opts?: Record<string, unknown>) => {
      const chain = opts?.chain as { id: number; name: string } | undefined;
      return createMockPublicClient({ chain });
    }),
  };
});

describe('ZoraCoinsTrait Blockchain Integration', () => {
  describe('WalletConnection', () => {
    it('should create wallet connection for Base mainnet', () => {
      const wallet = new WalletConnection({ chain: 'base' });

      expect(wallet).toBeDefined();
      expect(wallet.isConnected()).toBe(false);
      expect(wallet.getChainId()).toBe(8453); // Base mainnet chain ID
    });

    it('should create wallet connection for Base testnet', () => {
      const wallet = new WalletConnection({ chain: 'base-testnet' });

      expect(wallet).toBeDefined();
      expect(wallet.isConnected()).toBe(false);
      expect(wallet.getChainId()).toBe(84531); // Base Goerli chain ID
    });

    it('should use environment variable for custom RPC URL', () => {
      const customRpc = 'https://custom-base-rpc.example.com';
      process.env.BASE_RPC_URL = customRpc;

      const wallet = new WalletConnection({ chain: 'base' });
      expect(wallet.getPublicClient()).toBeDefined();

      delete process.env.BASE_RPC_URL;
    });

    it('should provide public client without connection', () => {
      const wallet = new WalletConnection({ chain: 'base' });
      const publicClient = wallet.getPublicClient();

      expect(publicClient).toBeDefined();
      expect(publicClient.chain?.id).toBe(8453);
    });

    it('should throw error when getting wallet client without connection', () => {
      const wallet = new WalletConnection({ chain: 'base' });

      expect(() => wallet.getWalletClient()).toThrow(
        'Wallet not connected. Call connect() first or emit wallet_connected event.'
      );
    });

    it('should connect wallet with account address', async () => {
      const wallet = new WalletConnection({ chain: 'base' });
      const mockAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

      await wallet.connect(mockAddress);

      expect(wallet.isConnected()).toBe(true);
      expect(wallet.getAddress()).toBe(mockAddress);
    });

    it('should disconnect wallet', async () => {
      const wallet = new WalletConnection({ chain: 'base' });
      const mockAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

      await wallet.connect(mockAddress);
      expect(wallet.isConnected()).toBe(true);

      wallet.disconnect();
      expect(wallet.isConnected()).toBe(false);
      expect(wallet.getAddress()).toBe(null);
    });

    it('should return correct chain information', () => {
      const wallet = new WalletConnection({ chain: 'base' });
      const chain = wallet.getChain();

      expect(chain.id).toBe(8453);
      expect(chain.name).toBe('Base');
    });
  });

  describe('GasEstimator', () => {
    it('should have correct Zora mint fee constant', () => {
      const expectedFee = parseEther('0.000777');
      expect(GasEstimator.ZORA_MINT_FEE).toBe(expectedFee);
    });

    it('should format gas estimate with ETH values', () => {
      const mockEstimate = {
        gasLimit: BigInt(200000),
        maxFeePerGas: parseEther('0.000001'), // 1 gwei
        maxPriorityFeePerGas: parseEther('0.000001'),
        totalGasCost: parseEther('0.0002'), // 200k gas * 1 gwei
        mintFee: parseEther('0.000777'),
        totalCost: parseEther('0.000977'), // 0.0002 + 0.000777
      };

      const formatted = GasEstimator.formatEstimate(mockEstimate);

      expect(formatted.totalGasCostETH).toBe('0.0002');
      expect(formatted.mintFeeETH).toBe('0.000777');
      expect(formatted.totalCostETH).toBe('0.000977');
      expect(formatted.totalCostUSD).toBeUndefined();
    });

    it('should format gas estimate with USD conversion', () => {
      const mockEstimate = {
        gasLimit: BigInt(200000),
        maxFeePerGas: parseEther('0.000001'),
        maxPriorityFeePerGas: parseEther('0.000001'),
        totalGasCost: parseEther('0.0002'),
        mintFee: parseEther('0.000777'),
        totalCost: parseEther('0.000977'),
      };

      const ethPriceUSD = 2000;
      const formatted = GasEstimator.formatEstimate(mockEstimate, ethPriceUSD);

      expect(formatted.totalCostUSD).toBe('$1.95'); // 0.000977 * 2000 = $1.954
    });

    it('should format wei amount to ETH string', () => {
      const wei = parseEther('0.5');
      const formatted = GasEstimator.formatCost(wei);

      expect(formatted).toBe('0.5 ETH');
    });

    it('should calculate gas estimate for single mint', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const mockContractAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const quantity = BigInt(1);

      const estimate = await GasEstimator.estimateMintGas(
        publicClient,
        mockContractAddress,
        quantity
      );

      expect(estimate).toBeDefined();
      expect(estimate.gasLimit).toBeGreaterThan(BigInt(0));
      expect(estimate.maxFeePerGas).toBeGreaterThan(BigInt(0));
      expect(estimate.maxPriorityFeePerGas).toBeGreaterThan(BigInt(0));
      expect(estimate.totalGasCost).toBeGreaterThan(BigInt(0));
      expect(estimate.mintFee).toBe(parseEther('0.000777')); // 1 * 0.000777
      expect(estimate.totalCost).toBe(estimate.totalGasCost + estimate.mintFee);
    });

    it('should calculate gas estimate for multiple mints', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const mockContractAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const quantity = BigInt(5);

      const estimate = await GasEstimator.estimateMintGas(
        publicClient,
        mockContractAddress,
        quantity
      );

      expect(estimate).toBeDefined();
      expect(estimate.mintFee).toBe(parseEther('0.003885')); // 5 * 0.000777
      expect(estimate.totalCost).toBeGreaterThan(estimate.mintFee);
    });

    it('should add 20% buffer to gas limit', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const mockContractAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const quantity = BigInt(1);

      const estimate = await GasEstimator.estimateMintGas(
        publicClient,
        mockContractAddress,
        quantity
      );

      // Conservative estimate is 200k gas with 20% buffer = 240k
      expect(estimate.gasLimit).toBeGreaterThanOrEqual(BigInt(240000));
    });

    it('should detect insufficient balance', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Use a randomly generated address that's extremely unlikely to have balance
      const mockWalletAddress: Address = '0x000000000000000000000000000000000000dEaD';
      const mockEstimate = {
        gasLimit: BigInt(200000),
        maxFeePerGas: parseEther('0.000001'),
        maxPriorityFeePerGas: parseEther('0.000001'),
        totalGasCost: parseEther('0.0002'),
        mintFee: parseEther('0.000777'),
        totalCost: parseEther('0.000977'),
      };

      const balanceCheck = await GasEstimator.checkSufficientBalance(
        publicClient,
        mockWalletAddress,
        mockEstimate
      );

      // Check that the function returns the expected structure
      expect(balanceCheck.sufficient).toBeDefined();
      expect(balanceCheck.balance).toBeDefined();
      expect(balanceCheck.required).toBe(mockEstimate.totalCost);

      // If balance is insufficient, verify shortfall calculation
      if (!balanceCheck.sufficient) {
        expect(balanceCheck.shortfall).toBe(mockEstimate.totalCost - balanceCheck.balance);
      }
    });

    it('should get current gas prices from Base L2', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const gasPrices = await GasEstimator.getCurrentGasPrices(publicClient);

      expect(gasPrices).toBeDefined();
      expect(gasPrices.baseFee).toBeGreaterThan(BigInt(0));
      expect(gasPrices.baseFeeGwei).toBeDefined();
      expect(gasPrices.maxFeePerGas).toBeGreaterThan(BigInt(0));
      expect(gasPrices.maxFeePerGasGwei).toBeDefined();
      expect(gasPrices.maxPriorityFeePerGas).toBeGreaterThan(BigInt(0));
      expect(gasPrices.maxPriorityFeePerGasGwei).toBeDefined();
    });
  });

  describe('Integration with ZoraCoinsTrait', () => {
    it('should initialize wallet connection in trait state', async () => {
      const wallet = new WalletConnection({ chain: 'base' });
      const mockAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

      await wallet.connect(mockAddress);

      // Simulate trait state
      const state = {
        isConnected: true,
        walletAddress: mockAddress,
        wallet,
        coins: [],
        pendingMints: [],
        totalRoyaltiesEarned: '0',
        collections: [],
        rewardsBalance: '0',
      };

      expect(state.wallet).toBeDefined();
      expect(state.wallet.isConnected()).toBe(true);
      expect(state.wallet.getAddress()).toBe(mockAddress);
    });

    it('should create execution context for trait handlers', async () => {
      const wallet = new WalletConnection({ chain: 'base' });
      const mockAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      await wallet.connect(mockAddress);

      const mockEmitEvent = vi.fn();

      const execContext = {
        wallet,
        emitEvent: mockEmitEvent,
      };

      expect(execContext.wallet.isConnected()).toBe(true);
      expect(execContext.emitEvent).toBeDefined();

      // Test event emission
      execContext.emitEvent('test_event', { data: 'test' });
      expect(mockEmitEvent).toHaveBeenCalledWith('test_event', { data: 'test' });
    });

    it('should validate wallet connection before minting', () => {
      const wallet = new WalletConnection({ chain: 'base' });

      const execContext = {
        wallet,
        emitEvent: vi.fn(),
      };

      // Should fail because wallet not connected
      expect(execContext.wallet.isConnected()).toBe(false);
      expect(() => execContext.wallet.getWalletClient()).toThrow('Wallet not connected');
    });
  });

  // Testnet integration tests — mocked, always enabled
  describe('Base Testnet Integration', () => {
    it('should connect to Base Goerli testnet', async () => {
      const wallet = new WalletConnection({ chain: 'base-testnet' });
      const publicClient = wallet.getPublicClient();

      const blockNumber = await publicClient.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(BigInt(0));
    });

    it('should estimate gas on Base Goerli', async () => {
      const publicClient = createPublicClient({
        chain: baseGoerli,
        transport: http(),
      });

      const mockContractAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const quantity = BigInt(1);

      const estimate = await GasEstimator.estimateMintGas(
        publicClient,
        mockContractAddress,
        quantity
      );

      expect(estimate.gasLimit).toBeGreaterThan(BigInt(0));
      expect(estimate.mintFee).toBe(parseEther('0.000777'));
    });

    it('should get testnet gas prices', async () => {
      const publicClient = createPublicClient({
        chain: baseGoerli,
        transport: http(),
      });

      const gasPrices = await GasEstimator.getCurrentGasPrices(publicClient);

      expect(gasPrices.baseFee).toBeGreaterThan(BigInt(0));
      expect(gasPrices.baseFeeGwei).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http('https://invalid-rpc-url-that-does-not-exist.com'),
      });

      // Override getBlock to simulate a network failure
      const client = publicClient as unknown as {
        getBlock: ReturnType<typeof vi.fn>;
      };
      client.getBlock.mockRejectedValueOnce(new Error('Network request failed'));

      const mockContractAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const quantity = BigInt(1);

      await expect(
        GasEstimator.estimateMintGas(publicClient, mockContractAddress, quantity)
      ).rejects.toThrow();
    });

    it('should handle invalid contract address', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const invalidAddress: Address = '0x0000000000000000000000000000000000000000';
      const quantity = BigInt(1);

      const estimate = await GasEstimator.estimateMintGas(publicClient, invalidAddress, quantity);

      // Should still return estimate (conservative fallback)
      expect(estimate).toBeDefined();
      expect(estimate.gasLimit).toBeGreaterThan(BigInt(0));
    });

    it('should handle zero quantity', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const mockContractAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const quantity = BigInt(0);

      const estimate = await GasEstimator.estimateMintGas(
        publicClient,
        mockContractAddress,
        quantity
      );

      expect(estimate.mintFee).toBe(BigInt(0)); // 0 * 0.000777 = 0
    });

    it('should handle very large quantity', async () => {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const mockContractAddress: Address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
      const quantity = BigInt(1000);

      const estimate = await GasEstimator.estimateMintGas(
        publicClient,
        mockContractAddress,
        quantity
      );

      const expectedMintFee = parseEther('0.777'); // 1000 * 0.000777
      expect(estimate.mintFee).toBe(expectedMintFee);
      expect(estimate.totalCost).toBeGreaterThan(expectedMintFee);
    });
  });
});
