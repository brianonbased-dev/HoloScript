/**
 * LotusGenesisTriggerTrait - founder-gated anchor/seed firing tests.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveLotusGenesisGate,
  deriveLotusGenesisSeed,
  lotusGenesisTriggerHandler,
  normalizeLotusSeed,
  type LotusGenesisAnchor,
} from '../LotusGenesisTriggerTrait';
import {
  attachTrait,
  createMockContext,
  createMockNode,
  getEventCount,
  getLastEvent,
  sendEvent,
} from './traitTestHelpers';

const VALID_HASH = '0x0123456789abcdef0123456789abcdef9999999999999999';
const VALID_WALLET = '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3';

const signedAnchor: LotusGenesisAnchor = {
  events: [{ hash: VALID_HASH }],
  wallet: VALID_WALLET,
  signature: 'founder-signature-fixture',
};

describe('LotusGenesisTriggerTrait - pure gate helpers', () => {
  it('normalizes placeholder and real seeds', () => {
    expect(normalizeLotusSeed('0000DEAD')).toBe('0x0000dead');
    expect(normalizeLotusSeed('0XABCDEF')).toBe('0xabcdef');
  });

  it('derives first 16 bytes from the signed anchor hash', () => {
    expect(deriveLotusGenesisSeed(signedAnchor)).toBe('0x0123456789abcdef0123456789abcdef');
  });

  it('blocks without an anchor even when all petals are full', () => {
    const out = deriveLotusGenesisGate({
      seed: '0x0000DEAD',
      placeholderSeed: '0x0000DEAD',
      anchor: null,
      requireSignedAnchor: true,
      allPetalsFull: true,
    });
    expect(out.canFire).toBe(false);
    expect(out.phase).toBe('anchor_missing');
    expect(out.reasons).toContain('anchor_missing');
  });

  it('blocks unsigned anchors', () => {
    const out = deriveLotusGenesisGate({
      seed: '0x0000DEAD',
      placeholderSeed: '0x0000DEAD',
      anchor: { events: [{ hash: VALID_HASH }], wallet: VALID_WALLET },
      requireSignedAnchor: true,
      requiredWallet: VALID_WALLET,
      allPetalsFull: true,
    });
    expect(out.canFire).toBe(false);
    expect(out.phase).toBe('anchor_invalid');
    expect(out.reasons).toContain('anchor_signature_missing');
  });

  it('blocks signed anchors until all petals are full', () => {
    const out = deriveLotusGenesisGate({
      seed: '0x0000DEAD',
      placeholderSeed: '0x0000DEAD',
      anchor: signedAnchor,
      requireSignedAnchor: true,
      requiredWallet: VALID_WALLET,
      allPetalsFull: false,
    });
    expect(out.canFire).toBe(false);
    expect(out.phase).toBe('petals_pending');
    expect(out.reasons).toEqual(['petals_not_full']);
  });

  it('arms only with signed anchor, non-placeholder seed, and full petals', () => {
    const out = deriveLotusGenesisGate({
      seed: '0x0000DEAD',
      placeholderSeed: '0x0000DEAD',
      anchor: signedAnchor,
      requireSignedAnchor: true,
      requiredWallet: VALID_WALLET,
      allPetalsFull: true,
    });
    expect(out.canFire).toBe(true);
    expect(out.phase).toBe('armed');
    expect(out.seed).toBe('0x0123456789abcdef0123456789abcdef');
  });
});

describe('LotusGenesisTriggerTrait - handler lifecycle', () => {
  it('attaches locked on the placeholder seed', () => {
    const ctx = createMockContext();
    const node = createMockNode('genesis-trigger');
    attachTrait(lotusGenesisTriggerHandler, node, {}, ctx);

    const evt = getLastEvent(ctx, 'lotus_genesis_trigger_attached') as
      | Record<string, unknown>
      | undefined;
    expect(evt?.phase).toBe('anchor_missing');
    expect(evt?.canFire).toBe(false);
  });

  it('fire request before anchor emits blocked instead of fired', () => {
    const ctx = createMockContext();
    const node = createMockNode('genesis-trigger');
    attachTrait(lotusGenesisTriggerHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(lotusGenesisTriggerHandler, node, {}, ctx, {
      type: 'lotus_genesis_fire_requested',
    });

    expect(getEventCount(ctx, 'lotus_genesis_blocked')).toBe(1);
    expect(getEventCount(ctx, 'lotus_genesis_fired')).toBe(0);
  });

  it('signed anchor + all petals full fires exactly once and sets state', () => {
    const ctx = createMockContext() as ReturnType<typeof createMockContext> & {
      getState: () => Record<string, unknown>;
      setState: (updates: Record<string, unknown>) => void;
      state: Record<string, unknown>;
    };
    ctx.state = {};
    ctx.getState = () => ctx.state;
    ctx.setState = (updates) => {
      ctx.state = { ...ctx.state, ...updates };
    };

    const node = createMockNode('genesis-trigger');
    attachTrait(lotusGenesisTriggerHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(lotusGenesisTriggerHandler, node, {}, ctx, {
      type: 'lotus_genesis_anchor_loaded',
      anchor: signedAnchor,
    });
    sendEvent(lotusGenesisTriggerHandler, node, {}, ctx, {
      type: 'lotus_all_petals_full',
    });
    sendEvent(lotusGenesisTriggerHandler, node, {}, ctx, {
      type: 'lotus_genesis_fire_requested',
    });

    expect(getEventCount(ctx, 'lotus_genesis_fired')).toBe(1);
    expect(ctx.state.LOTUS_GENESIS_SEED).toBe('0x0123456789abcdef0123456789abcdef');
    expect(ctx.state['lotus.api.genesis_fired']).toBe(true);

    sendEvent(lotusGenesisTriggerHandler, node, {}, ctx, {
      type: 'lotus_genesis_fire_requested',
    });
    expect(getEventCount(ctx, 'lotus_genesis_fired')).toBe(1);
    expect(getEventCount(ctx, 'lotus_genesis_blocked')).toBe(1);
  });

  it('query reports the current gate state', () => {
    const ctx = createMockContext();
    const node = createMockNode('genesis-trigger');
    attachTrait(lotusGenesisTriggerHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(lotusGenesisTriggerHandler, node, {}, ctx, {
      type: 'lotus_genesis_anchor_loaded',
      anchor: signedAnchor,
    });
    sendEvent(lotusGenesisTriggerHandler, node, {}, ctx, {
      type: 'lotus_genesis_query',
      queryId: 'q-g',
    });

    const evt = getLastEvent(ctx, 'lotus_genesis_response') as Record<string, unknown> | undefined;
    expect(evt?.queryId).toBe('q-g');
    expect(evt?.phase).toBe('petals_pending');
    expect(evt?.anchorHash).toBe(VALID_HASH.toLowerCase());
  });

  it('onDetach emits lotus_genesis_trigger_detached', () => {
    const ctx = createMockContext();
    const node = createMockNode('genesis-trigger');
    attachTrait(lotusGenesisTriggerHandler, node, {}, ctx);
    ctx.clearEvents();

    lotusGenesisTriggerHandler.onDetach?.(
      node as never,
      lotusGenesisTriggerHandler.defaultConfig as never,
      ctx as never
    );
    expect(getEventCount(ctx, 'lotus_genesis_trigger_detached')).toBe(1);
  });
});
