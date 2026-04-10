/**
 * TokenGatedTrait Production Tests
 *
 * Access control via token ownership.
 * Covers: defaultConfig, onAttach (fallback behavior applied), onDetach,
 * onUpdate (re-verify interval), and all 5 onEvent types.
 * Also tests applyFallbackBehavior for all 5 modes.
 */

import { describe, it, expect, vi } from 'vitest';
import { tokenGatedHandler } from '../TokenGatedTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'tg_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...tokenGatedHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  tokenGatedHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__tokenGatedState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  tokenGatedHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('TokenGatedTrait — defaultConfig', () => {
  it('has 11 fields with correct defaults', () => {
    const d = tokenGatedHandler.defaultConfig!;
    expect(d.chain).toBe('ethereum');
    expect(d.contract_address).toBe('');
    expect(d.token_id).toBe('');
    expect(d.min_balance).toBe(1);
    expect(d.token_type).toBe('erc721');
    expect(d.fallback_behavior).toBe('hide');
    expect(d.gate_message).toBe('Token required for access');
    expect(d.redirect_url).toBe('');
    expect(d.verify_interval).toBe(0);
    expect(d.allow_list).toEqual([]);
    expect(d.block_list).toEqual([]);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('TokenGatedTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.isVerified).toBe(false);
    expect(s.hasAccess).toBe(false);
    expect(s.verifiedAddress).toBeNull();
    expect(s.tokenBalance).toBe(0);
    expect(s.verifyAttempts).toBe(0);
  });

  it('fallback_behavior=hide: emits token_gate_hide on attach', () => {
    const node = makeNode();
    const { ctx } = attach(node, { fallback_behavior: 'hide' });
    expect(ctx.emit).toHaveBeenCalledWith('token_gate_hide', expect.any(Object));
  });

  it('fallback_behavior=blur: emits token_gate_blur with amount=10', () => {
    const node = makeNode();
    const { ctx } = attach(node, { fallback_behavior: 'blur' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'token_gate_blur',
      expect.objectContaining({ amount: 10 })
    );
  });

  it('fallback_behavior=lock: emits token_gate_lock', () => {
    const node = makeNode();
    const { ctx } = attach(node, { fallback_behavior: 'lock' });
    expect(ctx.emit).toHaveBeenCalledWith('token_gate_lock', expect.any(Object));
  });

  it('fallback_behavior=message: emits token_gate_show_message with gate_message', () => {
    const node = makeNode();
    const { ctx } = attach(node, { fallback_behavior: 'message', gate_message: 'NFT required' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'token_gate_show_message',
      expect.objectContaining({ message: 'NFT required' })
    );
  });

  it('fallback_behavior=redirect: emits token_gate_redirect with redirect_url', () => {
    const node = makeNode();
    const { ctx } = attach(node, {
      fallback_behavior: 'redirect',
      redirect_url: 'https://mint.example.com',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'token_gate_redirect',
      expect.objectContaining({ url: 'https://mint.example.com' })
    );
  });

  it('fallback_behavior=redirect with empty redirect_url: no redirect emit', () => {
    const node = makeNode();
    const { ctx } = attach(node, { fallback_behavior: 'redirect', redirect_url: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('token_gate_redirect', expect.any(Object));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('TokenGatedTrait — onDetach', () => {
  it('removes __tokenGatedState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    tokenGatedHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__tokenGatedState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('TokenGatedTrait — onUpdate', () => {
  it('no-op when verify_interval=0', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { verify_interval: 0 });
    st(node).isVerified = true;
    ctx.emit.mockClear();
    tokenGatedHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('token_gate_reverify', expect.any(Object));
  });

  it('no re-verify when not yet verified', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { verify_interval: 100 });
    st(node).isVerified = false;
    ctx.emit.mockClear();
    tokenGatedHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits token_gate_reverify when interval elapsed and verified', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { verify_interval: 5000 });
    st(node).isVerified = true;
    st(node).verifiedAddress = '0xabc';
    st(node).lastVerifyTime = Date.now() - 6000; // expired
    ctx.emit.mockClear();
    tokenGatedHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'token_gate_reverify',
      expect.objectContaining({ address: '0xabc' })
    );
  });

  it('does NOT re-verify when interval not yet elapsed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { verify_interval: 30000 });
    st(node).isVerified = true;
    st(node).lastVerifyTime = Date.now() - 1000; // 1s ago, interval=30s
    ctx.emit.mockClear();
    tokenGatedHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('token_gate_reverify', expect.any(Object));
  });
});

// ─── onEvent — token_gate_verify ──────────────────────────────────────────────

describe('TokenGatedTrait — onEvent: token_gate_verify', () => {
  it('blocked address → denied + reason=blocked, no balance check', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { block_list: ['0xdead'] });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_verify', address: '0xdead' });
    expect(st(node).hasAccess).toBe(false);
    expect(st(node).isVerified).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_token_denied',
      expect.objectContaining({ reason: 'blocked' })
    );
    expect(ctx.emit).not.toHaveBeenCalledWith('token_gate_check_balance', expect.any(Object));
  });

  it('allowed address → grant access immediately, no balance check', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { allow_list: ['0xgood'], contract_address: '0xcontract' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_verify', address: '0xgood' });
    expect(st(node).hasAccess).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_token_verified', expect.any(Object));
    expect(ctx.emit).not.toHaveBeenCalledWith('token_gate_check_balance', expect.any(Object));
  });

  it('unrecognized address → emits token_gate_check_balance', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      chain: 'polygon',
      contract_address: '0xNFT',
      token_type: 'erc1155',
      token_id: '42',
    });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_verify', address: '0xunknown' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'token_gate_check_balance',
      expect.objectContaining({
        chain: 'polygon',
        contractAddress: '0xNFT',
        tokenType: 'erc1155',
        tokenId: '42',
        address: '0xunknown',
      })
    );
  });

  it('increments verifyAttempts on each verify', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'token_gate_verify', address: '0xa' });
    fire(node, cfg, ctx, { type: 'token_gate_verify', address: '0xa' });
    expect(st(node).verifyAttempts).toBe(2);
  });
});

// ─── onEvent — token_gate_balance_result ──────────────────────────────────────

describe('TokenGatedTrait — onEvent: token_gate_balance_result', () => {
  it('balance >= min_balance → grants access + emits on_token_verified + reveal', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { min_balance: 1, contract_address: '0xNFT' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_balance_result', address: '0xowner', balance: 3 });
    expect(st(node).hasAccess).toBe(true);
    expect(st(node).tokenBalance).toBe(3);
    expect(ctx.emit).toHaveBeenCalledWith('token_gate_reveal', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_token_verified',
      expect.objectContaining({ balance: 3 })
    );
  });

  it('balance < min_balance → denies access + reason=insufficient_balance', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { min_balance: 5, fallback_behavior: 'hide' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_balance_result', address: '0xpoor', balance: 2 });
    expect(st(node).hasAccess).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_token_denied',
      expect.objectContaining({
        reason: 'insufficient_balance',
        balance: 2,
        required: 5,
      })
    );
    expect(ctx.emit).toHaveBeenCalledWith('token_gate_hide', expect.any(Object));
  });
});

// ─── onEvent — token_gate_disconnect ──────────────────────────────────────────

describe('TokenGatedTrait — onEvent: token_gate_disconnect', () => {
  it('resets state, applies fallback, emits on_token_access_revoked', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { fallback_behavior: 'hide' });
    st(node).isVerified = true;
    st(node).hasAccess = true;
    st(node).verifiedAddress = '0xaddr';
    st(node).tokenBalance = 5;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_disconnect' });
    const s = st(node);
    expect(s.isVerified).toBe(false);
    expect(s.hasAccess).toBe(false);
    expect(s.verifiedAddress).toBeNull();
    expect(s.tokenBalance).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('on_token_access_revoked', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('token_gate_hide', expect.any(Object));
  });
});

// ─── onEvent — token_gate_refresh ────────────────────────────────────────────

describe('TokenGatedTrait — onEvent: token_gate_refresh', () => {
  it('re-emits token_gate_verify with verifiedAddress when address known', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).verifiedAddress = '0xold';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_refresh' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'token_gate_verify',
      expect.objectContaining({ address: '0xold' })
    );
  });

  it('no-op when no verifiedAddress', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_refresh' });
    expect(ctx.emit).not.toHaveBeenCalledWith('token_gate_verify', expect.any(Object));
  });
});

// ─── onEvent — token_gate_query ───────────────────────────────────────────────

describe('TokenGatedTrait — onEvent: token_gate_query', () => {
  it('emits token_gate_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      chain: 'polygon',
      contract_address: '0xABC',
      token_type: 'erc1155',
      min_balance: 3,
    });
    st(node).isVerified = true;
    st(node).hasAccess = true;
    st(node).verifiedAddress = '0xowner';
    st(node).tokenBalance = 5;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'token_gate_query', queryId: 'q7' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'token_gate_info',
      expect.objectContaining({
        queryId: 'q7',
        isVerified: true,
        hasAccess: true,
        verifiedAddress: '0xowner',
        tokenBalance: 5,
        chain: 'polygon',
        tokenType: 'erc1155',
        minBalance: 3,
      })
    );
  });
});
