/**
 * Flag-gated signer->identity binding for board mutations
 * (research/2026-07-26_holomesh-mcp-identity-gap.md, task_1785110141929_xx29).
 *
 * Proves: with HOLOMESH_BOARD_BIND_SIGNER=1, a board write must be authorized by
 * the wallet owning the written identity (or the authenticated caller, preserving
 * fleet delegation). Non-wallet signers (founder/grace null, capability handle,
 * pqc key) pass through for SELF-writes but fail closed for DELEGATED writes. Flag
 * off is a no-op.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkSignerIdentityBinding,
  resolveAgentWallet,
  defaultSignerMapsToCaller,
} from '../identity/board-signer-binding';
import { keyRegistry, walletToAgent } from '../state';

const FLAG = 'HOLOMESH_BOARD_BIND_SIGNER';
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const CAROL = '0x3333333333333333333333333333333333333333';

const alice = { id: 'agent_alice', walletAddress: ALICE };
const noWallet = (): string | undefined => undefined;
const noMap = (): boolean => false;

// Convenience: check with both resolvers stubbed for hermetic determinism.
const check = (
  signer: string | null,
  writtenAgentId: string,
  caller: { id: string; walletAddress?: string },
  resolveWallet: (a: string) => string | undefined = noWallet,
  mapsToCaller: (s: string, c: string) => boolean = noMap
) => checkSignerIdentityBinding({ signer }, writtenAgentId, caller, resolveWallet, mapsToCaller);

describe('checkSignerIdentityBinding', () => {
  afterEach(() => {
    delete process.env[FLAG];
  });

  it('flag OFF: passes through even a foreign-wallet signature (zero behavior change)', () => {
    delete process.env[FLAG];
    expect(check(BOB, 'agent_alice', alice).ok).toBe(true);
  });

  describe('flag ON', () => {
    beforeEach(() => {
      process.env[FLAG] = '1';
    });

    // ── Non-wallet signers (null / capability handle / pqc) ──
    it('null signer (founder-bypass/grace) on a SELF-write passes through', () => {
      expect(check(null, 'agent_alice', alice).ok).toBe(true);
    });
    it('capability-handle signer on a SELF-write passes through', () => {
      expect(check('mobile1', 'agent_alice', alice).ok).toBe(true);
    });
    it('null signer on a DELEGATED write -> 403 (non-bindable cannot authorize)', () => {
      expect(check(null, 'agent_bob', alice).ok).toBe(false);
    });
    it('capability-handle signer on a DELEGATED write -> 403 (closes impersonation)', () => {
      expect(check('mobile1', 'agent_bob', alice).ok).toBe(false);
    });
    it('pqc-key signer on a DELEGATED write -> 403', () => {
      expect(check('pqc:deadbeef', 'agent_bob', alice).ok).toBe(false);
    });

    // ── Classical wallet signers ──
    it('self-write signed by own wallet -> ok', () => {
      expect(check(ALICE, 'agent_alice', alice).ok).toBe(true);
    });
    it('self-write signed by a FOREIGN wallet -> 403 (impersonation blocked)', () => {
      const r = check(BOB, 'agent_alice', alice);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(403);
        expect(r.error).toBe('signer-identity-mismatch');
      }
    });
    it('delegation: caller signs its OWN wallet, writes ANOTHER agentId -> ok', () => {
      expect(check(ALICE, 'agent_bob', alice, () => BOB).ok).toBe(true);
    });
    it("cross-sign: the written identity's OWNER signs (not the caller) -> ok", () => {
      expect(check(BOB, 'agent_bob', alice, () => BOB).ok).toBe(true);
    });
    it('signer is neither the caller nor the written-identity owner -> 403', () => {
      expect(check(CAROL, 'agent_bob', alice, () => BOB).ok).toBe(false);
    });
    it('written identity has no registered wallet + signer != caller -> 403 (cannot verify)', () => {
      expect(check(BOB, 'agent_unknown', alice).ok).toBe(false);
    });
    it('case-insensitive address match (checksummed signer vs lowercase wallet)', () => {
      const upper = '0x' + 'A'.repeat(40);
      const lower = '0x' + 'a'.repeat(40);
      expect(check(upper, 'agent_x', { id: 'agent_x', walletAddress: lower }).ok).toBe(true);
    });

    // ── walletToAgent fallback (bearer record wallet unset/differs from seat) ──
    it('caller with no walletAddress + self-write, signer does NOT map -> 403', () => {
      expect(check(BOB, 'agent_nw', { id: 'agent_nw' }).ok).toBe(false);
    });
    it('caller with no walletAddress + self-write, signer MAPS to caller identity -> ok', () => {
      expect(check(BOB, 'agent_nw', { id: 'agent_nw' }, noWallet, () => true).ok).toBe(true);
    });
  });

  describe('default resolvers', () => {
    beforeEach(() => {
      keyRegistry.clear();
      walletToAgent.clear();
    });
    afterEach(() => {
      keyRegistry.clear();
      walletToAgent.clear();
    });

    it('resolveAgentWallet resolves a registered agentId to its wallet, undefined otherwise', () => {
      keyRegistry.set('tok', { key: 'tok', agentId: 'agent_bob', walletAddress: BOB } as never);
      expect(resolveAgentWallet('agent_bob')).toBe(BOB);
      expect(resolveAgentWallet('agent_missing')).toBeUndefined();
    });

    it('defaultSignerMapsToCaller matches a lowercased wallet -> agent id', () => {
      walletToAgent.set(BOB.toLowerCase(), { id: 'agent_bob' } as never);
      expect(defaultSignerMapsToCaller(BOB, 'agent_bob')).toBe(true);
      expect(defaultSignerMapsToCaller('0x' + 'B'.repeat(40), 'agent_bob')).toBe(false);
      expect(defaultSignerMapsToCaller(BOB, 'agent_other')).toBe(false);
    });
  });
});
