/**
 * WalletTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { walletHandler } from '../WalletTrait';

function makeNode() {
  return { id: 'wallet_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...walletHandler.defaultConfig!, ...cfg };
  walletHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}
function fullConnect(state: any) {
  state.isConnected = true;
  state.address = '0xDEAD';
  state.ensName = 'alice.eth';
  state.chainId = 1;
  state.balance = '1 ETH';
  state.provider = 'metamask';
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('walletHandler.defaultConfig', () => {
  const d = walletHandler.defaultConfig!;
  it('has metamask', () => expect(d.supported_wallets).toContain('metamask'));
  it('auto_connect=false', () => expect(d.auto_connect).toBe(false));
  it('display_address=false', () => expect(d.display_address).toBe(false));
  it('display_ens=true', () => expect(d.display_ens).toBe(true));
  it('network=mainnet', () => expect(d.network).toBe('mainnet'));
  it('chain_id=1', () => expect(d.chain_id).toBe(1));
  it('required_chain=false', () => expect(d.required_chain).toBe(false));
  it('sign_message_prompt set', () => expect(d.sign_message_prompt.length).toBeGreaterThan(0));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('walletHandler.onAttach', () => {
  it('creates __walletState', () => expect(attach().node.__walletState).toBeDefined());
  it('isConnected=false', () => expect(attach().node.__walletState.isConnected).toBe(false));
  it('address=null', () => expect(attach().node.__walletState.address).toBeNull());
  it('ensName=null', () => expect(attach().node.__walletState.ensName).toBeNull());
  it('chainId=null', () => expect(attach().node.__walletState.chainId).toBeNull());
  it('balance=null', () => expect(attach().node.__walletState.balance).toBeNull());
  it('no auto_connect emit when off', () => {
    const { ctx } = attach({ auto_connect: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('wallet_auto_connect', expect.anything());
  });
  it('emits wallet_auto_connect when on', () => {
    const { ctx } = attach({ auto_connect: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_auto_connect',
      expect.objectContaining({ supportedWallets: expect.any(Array) })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('walletHandler.onDetach', () => {
  it('removes __walletState', () => {
    const { node, config, ctx } = attach();
    walletHandler.onDetach!(node, config, ctx);
    expect(node.__walletState).toBeUndefined();
  });
  it('wallet_cleanup emitted when connected', () => {
    const { node, config, ctx } = attach();
    node.__walletState.isConnected = true;
    ctx.emit.mockClear();
    walletHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('wallet_cleanup', expect.anything());
  });
  it('no wallet_cleanup when not connected', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    walletHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('wallet_cleanup', expect.anything());
  });
});

// ─── onEvent — wallet_connect ─────────────────────────────────────────────────

describe('walletHandler.onEvent — wallet_connect', () => {
  it('sets isConnecting=true', () => {
    const { node, ctx, config } = attach();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_connect', provider: 'metamask' });
    expect(node.__walletState.isConnecting).toBe(true);
  });
  it('emits wallet_request_connect', () => {
    const { node, ctx, config } = attach({ chain_id: 1 });
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_connect', provider: 'metamask' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_request_connect',
      expect.objectContaining({ provider: 'metamask', chainId: 1 })
    );
  });
  it('defaults to first supported wallet', () => {
    const { node, ctx, config } = attach({ supported_wallets: ['coinbase', 'metamask'] });
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_connect' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_request_connect',
      expect.objectContaining({ provider: 'coinbase' })
    );
  });
  it('rejects unsupported provider', () => {
    const { node, ctx, config } = attach({ supported_wallets: ['metamask'] });
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_connect', provider: 'phantom' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_error',
      expect.objectContaining({ error: expect.stringContaining('phantom') })
    );
    expect(node.__walletState.isConnecting).toBe(false);
  });
});

// ─── onEvent — wallet_connected ──────────────────────────────────────────────

describe('walletHandler.onEvent — wallet_connected', () => {
  function connected(node: any, ctx: any, config: any, overrides: any = {}) {
    walletHandler.onEvent!(node, config, ctx, {
      type: 'wallet_connected',
      address: '0xABC',
      chainId: 1,
      provider: 'metamask',
      ...overrides,
    });
  }
  it('sets isConnected=true', () => {
    const { node, ctx, config } = attach();
    connected(node, ctx, config);
    expect(node.__walletState.isConnected).toBe(true);
  });
  it('clears isConnecting', () => {
    const { node, ctx, config } = attach();
    node.__walletState.isConnecting = true;
    connected(node, ctx, config);
    expect(node.__walletState.isConnecting).toBe(false);
  });
  it('sets address, chainId, provider', () => {
    const { node, ctx, config } = attach();
    connected(node, ctx, config, { address: '0xDEAD', chainId: 137, provider: 'walletconnect' });
    expect(node.__walletState.address).toBe('0xDEAD');
    expect(node.__walletState.chainId).toBe(137);
    expect(node.__walletState.provider).toBe('walletconnect');
  });
  it('emits wallet_resolve_ens when display_ens=true', () => {
    const { node, ctx, config } = attach({ display_ens: true });
    ctx.emit.mockClear();
    connected(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_resolve_ens',
      expect.objectContaining({ address: '0xABC' })
    );
  });
  it('no ens when display_ens=false', () => {
    const { node, ctx, config } = attach({ display_ens: false });
    ctx.emit.mockClear();
    connected(node, ctx, config);
    expect(ctx.emit).not.toHaveBeenCalledWith('wallet_resolve_ens', expect.anything());
  });
  it('emits wallet_get_balance', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    connected(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_get_balance',
      expect.objectContaining({ address: '0xABC' })
    );
  });
  it('emits on_wallet_connected', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    connected(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_wallet_connected',
      expect.objectContaining({ address: '0xABC', provider: 'metamask' })
    );
  });
  it('wrong chain required → wallet_switch_chain, no connect', () => {
    const { node, ctx, config } = attach({ required_chain: true, chain_id: 1 });
    ctx.emit.mockClear();
    connected(node, ctx, config, { chainId: 137 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_switch_chain',
      expect.objectContaining({ targetChainId: 1 })
    );
    expect(node.__walletState.isConnected).toBe(false);
  });
  it('correct chain with required_chain=true connects', () => {
    const { node, ctx, config } = attach({ required_chain: true, chain_id: 1 });
    connected(node, ctx, config, { chainId: 1 });
    expect(node.__walletState.isConnected).toBe(true);
  });
});

// ─── onEvent — wallet_ens_resolved ───────────────────────────────────────────

describe('walletHandler.onEvent — wallet_ens_resolved', () => {
  it('sets ensName', () => {
    const { node, ctx, config } = attach();
    walletHandler.onEvent!(node, config, ctx, {
      type: 'wallet_ens_resolved',
      ensName: 'vitalik.eth',
      ensAvatar: null,
    });
    expect(node.__walletState.ensName).toBe('vitalik.eth');
  });
  it('emits on_ens_resolved', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, {
      type: 'wallet_ens_resolved',
      ensName: 'alice.eth',
      ensAvatar: null,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_ens_resolved',
      expect.objectContaining({ ensName: 'alice.eth' })
    );
  });
  it('no on_ens_resolved when ensName null', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, {
      type: 'wallet_ens_resolved',
      ensName: null,
      ensAvatar: null,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_ens_resolved', expect.anything());
  });
});

// ─── onEvent — wallet_balance_updated ────────────────────────────────────────

describe('walletHandler.onEvent — wallet_balance_updated', () => {
  it('sets balance on state', () => {
    const { node, ctx, config } = attach();
    walletHandler.onEvent!(node, config, ctx, {
      type: 'wallet_balance_updated',
      balance: '1.5 ETH',
    });
    expect(node.__walletState.balance).toBe('1.5 ETH');
  });
  it('emits on_balance_updated', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, {
      type: 'wallet_balance_updated',
      balance: '0.5 ETH',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_balance_updated',
      expect.objectContaining({ balance: '0.5 ETH' })
    );
  });
});

// ─── onEvent — wallet_disconnect ─────────────────────────────────────────────

describe('walletHandler.onEvent — wallet_disconnect', () => {
  it('clears all state fields', () => {
    const { node, ctx, config } = attach();
    fullConnect(node.__walletState);
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_disconnect' });
    expect(node.__walletState.isConnected).toBe(false);
    expect(node.__walletState.address).toBeNull();
    expect(node.__walletState.ensName).toBeNull();
    expect(node.__walletState.balance).toBeNull();
  });
  it('emits wallet_clear_connection', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_disconnect' });
    expect(ctx.emit).toHaveBeenCalledWith('wallet_clear_connection', expect.anything());
  });
  it('emits on_wallet_disconnected with previousAddress', () => {
    const { node, ctx, config } = attach();
    node.__walletState.address = '0xPREV';
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_disconnect' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_wallet_disconnected',
      expect.objectContaining({ previousAddress: '0xPREV' })
    );
  });
});

// ─── onEvent — wallet_chain_changed ──────────────────────────────────────────

describe('walletHandler.onEvent — wallet_chain_changed', () => {
  it('updates chainId', () => {
    const { node, ctx, config } = attach();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_chain_changed', chainId: 137 });
    expect(node.__walletState.chainId).toBe(137);
  });
  it('emits on_chain_changed', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_chain_changed', chainId: 10 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_chain_changed',
      expect.objectContaining({ chainId: 10 })
    );
  });
  it('emits wallet_switch_chain on mismatch with required_chain', () => {
    const { node, ctx, config } = attach({ required_chain: true, chain_id: 1 });
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_chain_changed', chainId: 137 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_switch_chain',
      expect.objectContaining({ targetChainId: 1 })
    );
  });
  it('no wallet_switch_chain when chain matches', () => {
    const { node, ctx, config } = attach({ required_chain: true, chain_id: 1 });
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_chain_changed', chainId: 1 });
    expect(ctx.emit).not.toHaveBeenCalledWith('wallet_switch_chain', expect.anything());
  });
});

// ─── onEvent — wallet_account_changed ────────────────────────────────────────

describe('walletHandler.onEvent — wallet_account_changed', () => {
  it('updates address', () => {
    const { node, ctx, config } = attach();
    node.__walletState.address = '0xOLD';
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_account_changed', address: '0xNEW' });
    expect(node.__walletState.address).toBe('0xNEW');
  });
  it('clears ensName', () => {
    const { node, ctx, config } = attach();
    node.__walletState.ensName = 'alice.eth';
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_account_changed', address: '0xNEW' });
    expect(node.__walletState.ensName).toBeNull();
  });
  it('emits wallet_resolve_ens when display_ens=true', () => {
    const { node, ctx, config } = attach({ display_ens: true });
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_account_changed', address: '0xNEW' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_resolve_ens',
      expect.objectContaining({ address: '0xNEW' })
    );
  });
  it('emits on_account_changed', () => {
    const { node, ctx, config } = attach();
    node.__walletState.address = '0xOLD';
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_account_changed', address: '0xNEW' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_account_changed',
      expect.objectContaining({ address: '0xNEW', previousAddress: '0xOLD' })
    );
  });
});

// ─── onEvent — wallet_sign_message ────────────────────────────────────────────

describe('walletHandler.onEvent — wallet_sign_message', () => {
  it('emits wallet_request_signature when connected', () => {
    const { node, ctx, config } = attach();
    node.__walletState.isConnected = true;
    node.__walletState.address = '0xABC';
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_sign_message', message: 'Hello' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_request_signature',
      expect.objectContaining({ address: '0xABC', message: 'Hello' })
    );
  });
  it('uses default prompt when no message', () => {
    const { node, ctx, config } = attach({ sign_message_prompt: 'Verify me' });
    node.__walletState.isConnected = true;
    node.__walletState.address = '0xABC';
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_sign_message' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_request_signature',
      expect.objectContaining({ message: 'Verify me' })
    );
  });
  it('emits wallet_error when not connected', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_sign_message', message: 'test' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_error',
      expect.objectContaining({ error: 'Wallet not connected' })
    );
  });
});

// ─── onEvent — wallet_signature_result ───────────────────────────────────────

describe('walletHandler.onEvent — wallet_signature_result', () => {
  it('emits on_message_signed', () => {
    const { node, ctx, config } = attach();
    node.__walletState.address = '0xABC';
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, {
      type: 'wallet_signature_result',
      signature: '0xSIG',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_message_signed',
      expect.objectContaining({ signature: '0xSIG', address: '0xABC' })
    );
  });
});

// ─── onEvent — wallet_error ───────────────────────────────────────────────────

describe('walletHandler.onEvent — wallet_error', () => {
  it('clears isConnecting', () => {
    const { node, ctx, config } = attach();
    node.__walletState.isConnecting = true;
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_error', error: 'Rejected' });
    expect(node.__walletState.isConnecting).toBe(false);
  });
  it('emits on_wallet_error', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_error', error: 'Rejected' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_wallet_error',
      expect.objectContaining({ error: 'Rejected' })
    );
  });
});

// ─── onEvent — wallet_query ───────────────────────────────────────────────────

describe('walletHandler.onEvent — wallet_query', () => {
  it('emits wallet_info snapshot', () => {
    const { node, ctx, config } = attach();
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_query', queryId: 'wq1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'wallet_info',
      expect.objectContaining({
        queryId: 'wq1',
        isConnected: false,
        address: null,
        ensName: null,
      })
    );
  });
  it('includes supportedWallets', () => {
    const { node, ctx, config } = attach({ supported_wallets: ['metamask'] });
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_query' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'wallet_info')!;
    expect(call[1].supportedWallets).toContain('metamask');
  });
  it('reflects live state after connect', () => {
    const { node, ctx, config } = attach();
    node.__walletState.isConnected = true;
    node.__walletState.address = '0xDEAD';
    walletHandler.onEvent!(node, config, ctx, { type: 'wallet_query' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'wallet_info')!;
    expect(call[1].address).toBe('0xDEAD');
  });
});
