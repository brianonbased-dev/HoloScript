/**
 * TokenGatedTrait Tests
 *
 * Tests for token-gated access control
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { tokenGatedHandler } from '../TokenGatedTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('TokenGatedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('gated-node');
    ctx = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct default config', () => {
      expect(tokenGatedHandler.defaultConfig.chain).toBe('ethereum');
      expect(tokenGatedHandler.defaultConfig.token_type).toBe('erc721');
      expect(tokenGatedHandler.defaultConfig.fallback_behavior).toBe('hide');
    });

    it('should attach and initialize state', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234567890abcdef',
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
      expect(state.isVerified).toBe(false);
      expect(state.hasAccess).toBe(false);
    });

    it('should apply fallback behavior on attach', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234567890abcdef',
        },
        ctx
      );

      // Fallback is applied immediately (access denied initially)
      const state = (node as any).__tokenGatedState;
      expect(state.hasAccess).toBe(false);
    });
  });

  describe('token verification', () => {
    beforeEach(() => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234567890abcdef',
          token_type: 'erc721',
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should store verified state after verification', () => {
      sendEvent(
        tokenGatedHandler,
        node,
        { contract_address: '0x1234567890abcdef', min_balance: 1 },
        ctx,
        {
          type: 'token_gate_balance_result',
          balance: 1,
          address: '0xuser',
        }
      );

      const state = (node as any).__tokenGatedState;
      expect(state.isVerified).toBe(true);
    });

    it('should handle access denied', () => {
      sendEvent(
        tokenGatedHandler,
        node,
        { contract_address: '0x1234567890abcdef', min_balance: 1 },
        ctx,
        {
          type: 'token_gate_balance_result',
          balance: 0,
          address: '0xuser',
        }
      );

      const state = (node as any).__tokenGatedState;
      expect(state.isVerified).toBe(true);
      expect(state.hasAccess).toBe(false);
    });
  });

  describe('fallback behaviors', () => {
    it('should apply hide fallback on attach', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234567890abcdef',
          fallback_behavior: 'hide',
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state.hasAccess).toBe(false);
    });

    it('should apply blur fallback on attach', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234567890abcdef',
          fallback_behavior: 'blur',
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });

    it('should apply lock fallback on attach', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234567890abcdef',
          fallback_behavior: 'lock',
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });

    it('should apply message fallback on attach', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234567890abcdef',
          fallback_behavior: 'message',
          gate_message: 'You need a token!',
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });
  });

  describe('token types', () => {
    it('should support erc721 tokens', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234',
          token_type: 'erc721',
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });

    it('should support erc1155 tokens', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234',
          token_type: 'erc1155',
          token_id: '1',
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });

    it('should support erc20 tokens with minimum balance', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234',
          token_type: 'erc20',
          min_balance: 100,
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });
  });

  describe('chain support', () => {
    const chains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'solana'];

    chains.forEach((chain) => {
      it(`should support ${chain} chain`, () => {
        const testNode = createMockNode('test');
        const testCtx = createMockContext();

        attachTrait(
          tokenGatedHandler,
          testNode,
          {
            contract_address: '0x1234',
            chain,
          },
          testCtx
        );

        const state = (testNode as any).__tokenGatedState;
        expect(state).toBeDefined();
      });
    });
  });

  describe('allow/block lists', () => {
    it('should support allow list configuration', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234',
          allow_list: ['0xuser1', '0xuser2'],
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });

    it('should support block list configuration', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234',
          block_list: ['0xbad1', '0xbad2'],
        },
        ctx
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
    });
  });

  describe('re-verification', () => {
    beforeEach(() => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234',
          verify_interval: 5000,
          min_balance: 1,
        },
        ctx
      );
      sendEvent(tokenGatedHandler, node, { contract_address: '0x1234', min_balance: 1 }, ctx, {
        type: 'token_gate_balance_result',
        balance: 1,
        address: '0xuser',
      });
      ctx.clearEvents();
    });

    it('should track verification timestamp', () => {
      const state = (node as any).__tokenGatedState;
      expect(state.isVerified).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up state on detach', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234',
        },
        ctx
      );

      tokenGatedHandler.onDetach?.(node, tokenGatedHandler.defaultConfig, ctx);

      expect((node as any).__tokenGatedState).toBeUndefined();
    });
  });

  describe('query', () => {
    it('should track verified address after verification', () => {
      attachTrait(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234abcd',
          chain: 'polygon',
          token_type: 'erc1155',
          min_balance: 1,
        },
        ctx
      );

      sendEvent(
        tokenGatedHandler,
        node,
        {
          contract_address: '0x1234abcd',
          chain: 'polygon',
          token_type: 'erc1155',
          min_balance: 1,
        },
        ctx,
        {
          type: 'token_gate_balance_result',
          balance: 5,
          address: '0xverified',
        }
      );

      const state = (node as any).__tokenGatedState;
      expect(state).toBeDefined();
      expect(state.isVerified).toBe(true);
      expect(state.verifiedAddress).toBe('0xverified');
    });
  });
});
