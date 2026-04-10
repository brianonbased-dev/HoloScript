/**
 * HoloMesh Wallet-Based Authentication (V4)
 *
 * Uses the agent's InvisibleWallet as a cryptographic identity anchor.
 * DID format: did:pkh:eip155:{chainId}:{address} (CAIP-10 standard)
 *
 * Three use cases:
 * 1. Onboard/Login: Challenge-response with wallet signature (EIP-191)
 * 2. Gossip signing: Sign CRDT delta payloads for peer verification
 * 3. Identity: Derive persistent DID from wallet address
 *
 * All verification uses viem's verifyMessage() — recovers signer from
 * signature without needing the private key.
 *
 * @module holomesh/wallet-auth
 */

import * as crypto from 'crypto';

// =============================================================================
// DID DERIVATION
// =============================================================================

const DID_PKH_PREFIX = 'did:pkh:eip155:';

/**
 * Derive a CAIP-10 DID from an Ethereum wallet address and chain ID.
 * Format: did:pkh:eip155:{chainId}:{address}
 */
export function deriveAgentDid(address: string, chainId: number): string {
  return `${DID_PKH_PREFIX}${chainId}:${address}`;
}

/**
 * Extract the Ethereum address from a did:pkh DID.
 * Returns null for non-wallet DIDs or malformed addresses.
 */
export function extractAddressFromDid(did: string): string | null {
  if (!did.startsWith(DID_PKH_PREFIX)) return null;
  const parts = did.slice(DID_PKH_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  const address = parts[1];
  if (!address || !address.startsWith('0x') || address.length !== 42) return null;
  return address;
}

/**
 * Check if a DID is wallet-derived (did:pkh format).
 */
export function isWalletDid(did: string): boolean {
  return did.startsWith(DID_PKH_PREFIX);
}

// =============================================================================
// CHALLENGE-RESPONSE AUTH
// =============================================================================

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a fresh authentication challenge for wallet-based login.
 */
export function createAuthChallenge(): {
  challenge: string;
  nonce: string;
  expiresAt: number;
} {
  return {
    challenge: crypto.randomBytes(32).toString('hex'),
    nonce: crypto.randomBytes(16).toString('base64url'),
    expiresAt: Date.now() + CHALLENGE_EXPIRY_MS,
  };
}

/**
 * Build the canonical message for auth signing.
 * Deterministic format ensures both signer and verifier agree on message content.
 */
export function buildAuthMessage(challenge: string, nonce: string): string {
  return `HoloMesh Auth\nChallenge: ${challenge}\nNonce: ${nonce}`;
}

/**
 * Sign an auth challenge using the agent's wallet.
 * Uses EIP-191 personal message signing via viem WalletClient.
 */
export async function signAuthChallenge(
  walletClient: { signMessage: (args: { message: string }) => Promise<string> },
  challenge: string,
  nonce: string
): Promise<string> {
  const message = buildAuthMessage(challenge, nonce);
  return walletClient.signMessage({ message });
}

/**
 * Verify an auth signature matches the claimed address.
 * Uses viem's verifyMessage (EIP-191 recovery) — dynamic import for tree-shaking.
 */
export async function verifyAuthSignature(
  address: string,
  challenge: string,
  nonce: string,
  signature: string
): Promise<boolean> {
  try {
    const { verifyMessage } = await import('viem');
    return await verifyMessage({
      address: address as `0x${string}`,
      message: buildAuthMessage(challenge, nonce),
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

// =============================================================================
// GOSSIP MESSAGE SIGNING
// =============================================================================

/**
 * Build the canonical message for gossip payload signing.
 */
export function buildGossipMessage(deltaBase64: string, timestamp: string): string {
  return `HoloMesh Gossip\nDelta: ${deltaBase64}\nTimestamp: ${timestamp}`;
}

/**
 * Sign a gossip payload (CRDT delta) using the agent's wallet.
 */
export async function signGossipPayload(
  walletClient: { signMessage: (args: { message: string }) => Promise<string> },
  deltaBase64: string,
  timestamp: string
): Promise<string> {
  const message = buildGossipMessage(deltaBase64, timestamp);
  return walletClient.signMessage({ message });
}

/**
 * Verify a gossip signature matches the claimed sender address.
 */
export async function verifyGossipSignature(
  address: string,
  deltaBase64: string,
  timestamp: string,
  signature: string
): Promise<boolean> {
  try {
    const { verifyMessage } = await import('viem');
    return await verifyMessage({
      address: address as `0x${string}`,
      message: buildGossipMessage(deltaBase64, timestamp),
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}
