/**
 * Tests for HoloMesh Wallet Authentication (V4)
 *
 * Validates DID derivation, challenge construction, gossip message
 * building, and signature verification (mocked viem).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock viem's verifyMessage
const mockVerifyMessage = vi.fn().mockResolvedValue(true);
vi.mock('viem', () => ({
  verifyMessage: (...args: any[]) => mockVerifyMessage(...args),
}));

import {
  deriveAgentDid,
  extractAddressFromDid,
  isWalletDid,
  createAuthChallenge,
  buildAuthMessage,
  signAuthChallenge,
  verifyAuthSignature,
  buildGossipMessage,
  signGossipPayload,
  verifyGossipSignature,
} from '../wallet-auth';

// ── DID Derivation ──

describe('deriveAgentDid', () => {
  it('produces did:pkh format with Base mainnet chain ID', () => {
    const did = deriveAgentDid('0xABCdef1234567890abcdef1234567890ABCDef12', 8453);
    expect(did).toBe('did:pkh:eip155:8453:0xABCdef1234567890abcdef1234567890ABCDef12');
  });

  it('works with Base Sepolia testnet chain ID', () => {
    const did = deriveAgentDid('0x1234567890123456789012345678901234567890', 84532);
    expect(did).toBe('did:pkh:eip155:84532:0x1234567890123456789012345678901234567890');
  });
});

describe('extractAddressFromDid', () => {
  it('extracts address from valid did:pkh', () => {
    const addr = extractAddressFromDid('did:pkh:eip155:8453:0xABCdef1234567890abcdef1234567890ABCDef12');
    expect(addr).toBe('0xABCdef1234567890abcdef1234567890ABCDef12');
  });

  it('returns null for non-pkh DID', () => {
    expect(extractAddressFromDid('holomesh-agent-abc12345')).toBeNull();
  });

  it('returns null for malformed address (too short)', () => {
    expect(extractAddressFromDid('did:pkh:eip155:8453:0xshort')).toBeNull();
  });

  it('returns null for missing address segment', () => {
    expect(extractAddressFromDid('did:pkh:eip155:8453')).toBeNull();
  });
});

describe('isWalletDid', () => {
  it('returns true for did:pkh DIDs', () => {
    expect(isWalletDid('did:pkh:eip155:8453:0xABC')).toBe(true);
  });

  it('returns false for UUID-based agent IDs', () => {
    expect(isWalletDid('holomesh-agent-abc12345')).toBe(false);
  });

  it('returns false for other DID methods', () => {
    expect(isWalletDid('did:key:z6MkTest')).toBe(false);
  });
});

// ── Challenge-Response Auth ──

describe('createAuthChallenge', () => {
  it('returns challenge as 64-char hex string', () => {
    const ch = createAuthChallenge();
    expect(ch.challenge).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a non-empty nonce', () => {
    const ch = createAuthChallenge();
    expect(ch.nonce.length).toBeGreaterThan(0);
  });

  it('returns expiry in the future', () => {
    const ch = createAuthChallenge();
    expect(ch.expiresAt).toBeGreaterThan(Date.now());
  });

  it('generates unique challenges', () => {
    const a = createAuthChallenge();
    const b = createAuthChallenge();
    expect(a.challenge).not.toBe(b.challenge);
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe('buildAuthMessage', () => {
  it('produces deterministic canonical message', () => {
    const msg = buildAuthMessage('abc123', 'nonce456');
    expect(msg).toBe('HoloMesh Auth\nChallenge: abc123\nNonce: nonce456');
  });
});

describe('signAuthChallenge', () => {
  it('calls walletClient.signMessage with canonical message', async () => {
    const mockWallet = { signMessage: vi.fn().mockResolvedValue('0xSIG') };
    const sig = await signAuthChallenge(mockWallet, 'challenge', 'nonce');
    expect(sig).toBe('0xSIG');
    expect(mockWallet.signMessage).toHaveBeenCalledWith({
      message: 'HoloMesh Auth\nChallenge: challenge\nNonce: nonce',
    });
  });
});

describe('verifyAuthSignature', () => {
  beforeEach(() => {
    mockVerifyMessage.mockReset().mockResolvedValue(true);
  });

  it('returns true when viem verifies', async () => {
    const result = await verifyAuthSignature('0xAddr', 'challenge', 'nonce', '0xSig');
    expect(result).toBe(true);
    expect(mockVerifyMessage).toHaveBeenCalledWith({
      address: '0xAddr',
      message: 'HoloMesh Auth\nChallenge: challenge\nNonce: nonce',
      signature: '0xSig',
    });
  });

  it('returns false when viem rejects', async () => {
    mockVerifyMessage.mockResolvedValue(false);
    const result = await verifyAuthSignature('0xAddr', 'ch', 'n', '0xBad');
    expect(result).toBe(false);
  });

  it('returns false when viem throws', async () => {
    mockVerifyMessage.mockRejectedValue(new Error('viem import failed'));
    const result = await verifyAuthSignature('0xAddr', 'ch', 'n', '0xBad');
    expect(result).toBe(false);
  });
});

// ── Gossip Message Signing ──

describe('buildGossipMessage', () => {
  it('produces deterministic canonical message', () => {
    const msg = buildGossipMessage('base64delta', '2026-03-27T00:00:00Z');
    expect(msg).toBe('HoloMesh Gossip\nDelta: base64delta\nTimestamp: 2026-03-27T00:00:00Z');
  });
});

describe('signGossipPayload', () => {
  it('calls walletClient.signMessage with gossip canonical message', async () => {
    const mockWallet = { signMessage: vi.fn().mockResolvedValue('0xGSIG') };
    const sig = await signGossipPayload(mockWallet, 'delta64', '2026-01-01T00:00:00Z');
    expect(sig).toBe('0xGSIG');
    expect(mockWallet.signMessage).toHaveBeenCalledWith({
      message: 'HoloMesh Gossip\nDelta: delta64\nTimestamp: 2026-01-01T00:00:00Z',
    });
  });
});

describe('verifyGossipSignature', () => {
  beforeEach(() => {
    mockVerifyMessage.mockReset().mockResolvedValue(true);
  });

  it('returns true for valid signature', async () => {
    const result = await verifyGossipSignature('0xAddr', 'delta', '2026-01-01', '0xSig');
    expect(result).toBe(true);
  });

  it('returns false for invalid signature', async () => {
    mockVerifyMessage.mockResolvedValue(false);
    const result = await verifyGossipSignature('0xAddr', 'delta', '2026-01-01', '0xBad');
    expect(result).toBe(false);
  });

  it('returns false when viem throws', async () => {
    mockVerifyMessage.mockRejectedValue(new Error('not installed'));
    const result = await verifyGossipSignature('0xAddr', 'delta', '2026-01-01', '0xBad');
    expect(result).toBe(false);
  });
});
