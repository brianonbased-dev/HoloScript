import { describe, it, expect, beforeEach } from 'vitest';
import { AgentWalletRegistry, getAgentWalletRegistry } from '../AgentWalletRegistry';

describe('AgentWalletRegistry', () => {
  // Reset singleton between tests by accessing the private instance
  let registry: AgentWalletRegistry;

  beforeEach(() => {
    // Get a fresh-ish registry and clean up any leftover wallets
    registry = getAgentWalletRegistry();
    // Unregister known test agents to avoid cross-test pollution
    registry.unregisterWallet('agent-1');
    registry.unregisterWallet('agent-2');
    registry.unregisterWallet('agent-3');
  });

  // ===========================================================================
  // Singleton
  // ===========================================================================

  describe('singleton pattern', () => {
    it('getInstance returns the same instance', () => {
      const a = AgentWalletRegistry.getInstance();
      const b = AgentWalletRegistry.getInstance();
      expect(a).toBe(b);
    });

    it('getAgentWalletRegistry returns the singleton', () => {
      expect(getAgentWalletRegistry()).toBe(AgentWalletRegistry.getInstance());
    });
  });

  // ===========================================================================
  // registerWallet
  // ===========================================================================

  describe('registerWallet', () => {
    it('registers a wallet with default networkId (Base L2 = 8453)', () => {
      const wallet = registry.registerWallet('agent-1', '0xABCD');
      expect(wallet.agentId).toBe('agent-1');
      expect(wallet.walletAddress).toBe('0xABCD');
      expect(wallet.networkId).toBe(8453);
      expect(wallet.balanceThreshold).toBe(0.001);
    });

    it('registers a wallet with custom networkId', () => {
      const wallet = registry.registerWallet('agent-2', '0x1234', 1); // Ethereum mainnet
      expect(wallet.networkId).toBe(1);
    });

    it('overwrites an existing wallet for the same agent', () => {
      registry.registerWallet('agent-1', '0xOLD');
      registry.registerWallet('agent-1', '0xNEW');
      const wallet = registry.getWallet('agent-1');
      expect(wallet?.walletAddress).toBe('0xNEW');
    });
  });

  // ===========================================================================
  // getWallet
  // ===========================================================================

  describe('getWallet', () => {
    it('returns the registered wallet', () => {
      registry.registerWallet('agent-1', '0xABC');
      const wallet = registry.getWallet('agent-1');
      expect(wallet).toBeDefined();
      expect(wallet!.agentId).toBe('agent-1');
    });

    it('returns undefined for unknown agents', () => {
      expect(registry.getWallet('nonexistent')).toBeUndefined();
    });
  });

  // ===========================================================================
  // unregisterWallet
  // ===========================================================================

  describe('unregisterWallet', () => {
    it('removes a registered wallet and returns true', () => {
      registry.registerWallet('agent-1', '0xABC');
      expect(registry.unregisterWallet('agent-1')).toBe(true);
      expect(registry.getWallet('agent-1')).toBeUndefined();
    });

    it('returns false when unregistering a non-existent wallet', () => {
      expect(registry.unregisterWallet('ghost-agent')).toBe(false);
    });
  });

  // ===========================================================================
  // authorizeTransaction
  // ===========================================================================

  describe('authorizeTransaction', () => {
    it('returns a hex signature for a registered agent', async () => {
      registry.registerWallet('agent-1', '0xABC');
      const sig = await registry.authorizeTransaction('agent-1', {
        action: 'buy',
        traitId: 'T.001',
      });
      expect(sig).toMatch(/^0x[0-9a-f]+$/);
    });

    it('throws for an unregistered agent', async () => {
      await expect(
        registry.authorizeTransaction('unknown-agent', { action: 'buy' })
      ).rejects.toThrow('[AgentWalletRegistry] No wallet registered for agent unknown-agent');
    });

    it('produces different signatures for different payloads', async () => {
      registry.registerWallet('agent-1', '0xABC');
      const sig1 = await registry.authorizeTransaction('agent-1', { action: 'buy', id: 1 });
      const sig2 = await registry.authorizeTransaction('agent-1', { action: 'sell', id: 2 });
      expect(sig1).not.toBe(sig2);
    });

    it('signature is deterministic for the same payload', async () => {
      registry.registerWallet('agent-1', '0xABC');
      const payload = { action: 'buy', traitId: 'T.001' };
      const sig1 = await registry.authorizeTransaction('agent-1', payload);
      const sig2 = await registry.authorizeTransaction('agent-1', payload);
      expect(sig1).toBe(sig2);
    });

    it('signature length is capped at 64 hex chars after 0x prefix', async () => {
      registry.registerWallet('agent-1', '0xABC');
      const sig = await registry.authorizeTransaction('agent-1', { data: 'x'.repeat(1000) });
      // Implementation: '0x' + hex.slice(0, 64)
      const hexPart = sig.slice(2);
      expect(hexPart.length).toBeLessThanOrEqual(64);
    });
  });

  // ===========================================================================
  // Integration: register → authorize → unregister
  // ===========================================================================

  describe('lifecycle', () => {
    it('register → authorize → unregister → authorize fails', async () => {
      registry.registerWallet('agent-3', '0xDEF');
      // Should work
      await expect(
        registry.authorizeTransaction('agent-3', { action: 'test' })
      ).resolves.toBeDefined();
      // Unregister
      registry.unregisterWallet('agent-3');
      // Should fail
      await expect(registry.authorizeTransaction('agent-3', { action: 'test' })).rejects.toThrow();
    });
  });
});
