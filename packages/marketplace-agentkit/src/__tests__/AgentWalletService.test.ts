import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentWalletService } from '../AgentWalletService.js';

describe('AgentWalletService', () => {
  let service: AgentWalletService;

  beforeEach(() => {
    vi.stubEnv('CDP_API_KEY_NAME', '');
    vi.stubEnv('CDP_API_KEY_ID', '');
    vi.stubEnv('CDP_API_KEY_SECRET', '');
    vi.stubEnv('CDP_WALLET_SECRET', '');
    service = new AgentWalletService('base-sepolia', { mode: 'simulation' });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('fails closed when live credentials are absent', async () => {
    const live = new AgentWalletService('base-sepolia');
    await expect(live.initialize()).rejects.toThrow(
      'Live Coinbase CDP wallet initialization requires'
    );
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
    expect(receipt.simulated).toBe(true);
  });

  it('should throw when processing payment before initialization', async () => {
    const challenge = { cost: '100', currency: 'wei', memo: 'test' };
    await expect(service.processPaymentChallenge(challenge)).rejects.toThrow(
      'Wallet not initialized'
    );
  });
});
