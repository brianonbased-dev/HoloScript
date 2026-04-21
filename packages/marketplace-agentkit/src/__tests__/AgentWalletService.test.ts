import { describe, it, expect, beforeEach } from 'vitest';
import { AgentWalletService } from '../AgentWalletService.js';

describe('AgentWalletService', () => {
  let service: AgentWalletService;

  beforeEach(() => {
    service = new AgentWalletService('base-sepolia');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service.walletAddress).toBeNull();
  });

  it('should initialize and produce a wallet address', async () => {
    const address = await service.initialize();
    expect(address).toBeDefined();
    expect(address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(service.walletAddress).toBe(address);
  });

  it('should process a payment challenge after initialization', async () => {
    await service.initialize();

    const challenge = {
      cost: '1000000',
      currency: 'wei',
      memo: 'test-skill-purchase',
    };

    const receipt = await service.processPaymentChallenge(challenge);
    expect(receipt).toBeDefined();
    expect(receipt.txHash).toBeDefined();
    expect(receipt.signature).toBeDefined();
    expect(receipt.agentWallet).toBe(service.walletAddress);
  });

  it('should throw when processing payment before initialization', async () => {
    const challenge = { cost: '100', currency: 'wei', memo: 'test' };
    await expect(service.processPaymentChallenge(challenge)).rejects.toThrow(
      'Wallet not initialized'
    );
  });
});
