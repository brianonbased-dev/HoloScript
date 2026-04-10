/**
 * WalletTrait Tests
 *
 * Tests for wallet connection and identity management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { walletHandler } from '../WalletTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('WalletTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('wallet-node');
    ctx = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct default config', () => {
      expect(walletHandler.defaultConfig.supported_wallets).toContain('metamask');
      expect(walletHandler.defaultConfig.display_ens).toBe(true);
      expect(walletHandler.defaultConfig.network).toBe('mainnet');
    });

    it('should attach and create disconnected state', () => {
      attachTrait(walletHandler, node, {}, ctx);

      const state = (node as any).__walletState;
      expect(state).toBeDefined();
      expect(state.isConnected).toBe(false);
      expect(state.address).toBeNull();
    });

    it('should auto-connect if configured', () => {
      attachTrait(walletHandler, node, { auto_connect: true }, ctx);

      expect(getEventCount(ctx, 'wallet_auto_connect')).toBe(1);
    });
  });

  describe('connection flow', () => {
    beforeEach(() => {
      attachTrait(walletHandler, node, {}, ctx);
      ctx.clearEvents();
    });

    it('should request connect for supported wallet', () => {
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_connect',
        provider: 'metamask',
      });

      expect(getEventCount(ctx, 'wallet_request_connect')).toBe(1);
      const connectEvent = getLastEvent(ctx, 'wallet_request_connect');
      expect(connectEvent.provider).toBe('metamask');
    });

    it('should reject unsupported wallet', () => {
      sendEvent(walletHandler, node, { supported_wallets: ['metamask'] }, ctx, {
        type: 'wallet_connect',
        provider: 'phantom',
      });

      expect(getEventCount(ctx, 'wallet_error')).toBe(1);
      expect(getEventCount(ctx, 'wallet_request_connect')).toBe(0);
    });

    it('should handle wallet_connected event', () => {
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_connected',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1,
        provider: 'metamask',
      });

      const state = (node as any).__walletState;
      expect(state.isConnected).toBe(true);
      expect(state.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(state.chainId).toBe(1);
      expect(state.provider).toBe('metamask');

      expect(getEventCount(ctx, 'on_wallet_connected')).toBe(1);
    });

    it('should request ENS resolution on connect', () => {
      sendEvent(walletHandler, node, { display_ens: true }, ctx, {
        type: 'wallet_connected',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1,
        provider: 'metamask',
      });

      expect(getEventCount(ctx, 'wallet_resolve_ens')).toBe(1);
    });
  });

  describe('ENS resolution', () => {
    beforeEach(() => {
      attachTrait(walletHandler, node, {}, ctx);
      // Simulate connection
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_connected',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1,
        provider: 'metamask',
      });
      ctx.clearEvents();
    });

    it('should handle ENS resolution result', () => {
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_ens_resolved',
        ensName: 'vitalik.eth',
        ensAvatar: 'https://avatar.url/vitalik.png',
      });

      const state = (node as any).__walletState;
      expect(state.ensName).toBe('vitalik.eth');
      expect(state.ensAvatar).toBe('https://avatar.url/vitalik.png');
      expect(getEventCount(ctx, 'on_ens_resolved')).toBe(1);
    });
  });

  describe('disconnection', () => {
    beforeEach(() => {
      attachTrait(walletHandler, node, {}, ctx);
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_connected',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        chainId: 1,
        provider: 'metamask',
      });
      ctx.clearEvents();
    });

    it('should handle disconnect', () => {
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_disconnect',
      });

      const state = (node as any).__walletState;
      expect(state.isConnected).toBe(false);
      expect(state.address).toBeNull();
      expect(state.ensName).toBeNull();

      expect(getEventCount(ctx, 'on_wallet_disconnected')).toBe(1);
    });
  });

  describe('chain changes', () => {
    beforeEach(() => {
      attachTrait(walletHandler, node, { required_chain: false }, ctx);
      sendEvent(walletHandler, node, { required_chain: false }, ctx, {
        type: 'wallet_connected',
        address: '0x1234',
        chainId: 1,
        provider: 'metamask',
      });
      ctx.clearEvents();
    });

    it('should handle chain change', () => {
      sendEvent(walletHandler, node, { required_chain: false }, ctx, {
        type: 'wallet_chain_changed',
        chainId: 137, // Polygon
      });

      const state = (node as any).__walletState;
      expect(state.chainId).toBe(137);
      expect(getEventCount(ctx, 'on_chain_changed')).toBe(1);
    });

    it('should request chain switch if required_chain is set', () => {
      sendEvent(walletHandler, node, { required_chain: true, chain_id: 1 }, ctx, {
        type: 'wallet_chain_changed',
        chainId: 137,
      });

      expect(getEventCount(ctx, 'wallet_switch_chain')).toBe(1);
    });
  });

  describe('message signing', () => {
    beforeEach(() => {
      attachTrait(walletHandler, node, {}, ctx);
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_connected',
        address: '0x1234',
        chainId: 1,
        provider: 'metamask',
      });
      ctx.clearEvents();
    });

    it('should request signature when connected', () => {
      sendEvent(walletHandler, node, { sign_message_prompt: 'Sign to verify' }, ctx, {
        type: 'wallet_sign_message',
      });

      expect(getEventCount(ctx, 'wallet_request_signature')).toBe(1);
      const sigEvent = getLastEvent(ctx, 'wallet_request_signature');
      expect(sigEvent.message).toBe('Sign to verify');
    });

    it('should fail signing when not connected', () => {
      // Disconnect first
      sendEvent(walletHandler, node, {}, ctx, { type: 'wallet_disconnect' });
      ctx.clearEvents();

      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_sign_message',
      });

      expect(getEventCount(ctx, 'wallet_error')).toBe(1);
    });
  });

  describe('query', () => {
    it('should respond to query event', () => {
      attachTrait(walletHandler, node, {}, ctx);
      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_connected',
        address: '0x1234',
        chainId: 1,
        provider: 'metamask',
      });
      ctx.clearEvents();

      sendEvent(walletHandler, node, {}, ctx, {
        type: 'wallet_query',
        queryId: 'test-query',
      });

      const info = getLastEvent(ctx, 'wallet_info');
      expect(info).toBeDefined();
      expect(info.queryId).toBe('test-query');
      expect(info.isConnected).toBe(true);
      expect(info.address).toBe('0x1234');
    });
  });
});
