/**
 * Unit tests for identity/custodial-wallet.ts — Phase 5 Tier 2 custodial wallets.
 *
 * @module holomesh/identity/__tests__/custodial-wallet.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'crypto';
import {
  provisionCustodialWallet,
  custodialSign,
  getWalletInfo,
  hasCustodialWallet,
  rotateCustodialKey,
  enableTwoFactor,
  isTwoFactorEnabled,
  markSelfCustodyActive,
  decryptForSigning,
  _resetCustodialWalletForTests,
  _generateTestWrappingKey,
} from '../custodial-wallet';
import {
  _resetAuditLogForTests,
  _getEventBufferForTests,
} from '../audit-log';
import { resetAttestationRegistry, getAttestationRegistry } from '../signing-middleware';

let testWrappingKey: Buffer;

beforeEach(() => {
  _resetCustodialWalletForTests();
  _resetAuditLogForTests();
  resetAttestationRegistry();
  testWrappingKey = _generateTestWrappingKey();
});

describe('provisionCustodialWallet', () => {
  it('provisions a new wallet for a user', () => {
    const result = provisionCustodialWallet('user-1', {
      wrappingKey: testWrappingKey,
      provisionedBy: 'test',
    });

    expect(result.wallet).toBeDefined();
    expect(result.wallet.userId).toBe('user-1');
    expect(result.wallet.publicKeyBase64).toBeTruthy();
    expect(result.wallet.publicKeyHash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.wallet.encryptedPrivateKeyBase64).toBeTruthy();
    expect(result.wallet.encryptedDataKeyBase64).toBeTruthy();
    expect(result.wallet.derivationPath).toBe("m/44'/60'/2'/0/1");
    expect(result.wallet.userOrdinal).toBe(1);
    expect(result.wallet.custodyMode).toBe('custodial_active');
    expect(result.wallet.twoFactorEnabled).toBe(false);
  });

  it('registers the public key in the attestation registry', () => {
    const result = provisionCustodialWallet('user-2', {
      wrappingKey: testWrappingKey,
    });

    const registry = getAttestationRegistry();
    const lookupKey = `ed25519:${result.wallet.publicKeyBase64}`;
    expect(registry.isAttested(lookupKey)).toBe(true);
  });

  it('emits a key_generated audit event', () => {
    provisionCustodialWallet('user-3', {
      wrappingKey: testWrappingKey,
      provisionedBy: 'test-provisioner',
    });

    const events = _getEventBufferForTests();
    const genEvent = events.find((e) => e.type === 'key_generated');
    expect(genEvent).toBeDefined();
    expect(genEvent!.userId).toBe('user-3');
    expect(genEvent!.accessedBy).toBe('test-provisioner');
  });

  it('is idempotent — returns existing wallet on repeat call', () => {
    const first = provisionCustodialWallet('user-4', { wrappingKey: testWrappingKey });
    const second = provisionCustodialWallet('user-4', { wrappingKey: testWrappingKey });

    expect(first.wallet.publicKeyBase64).toBe(second.wallet.publicKeyBase64);
    expect(first.wallet.publicKeyHash).toBe(second.wallet.publicKeyHash);
  });

  it('increments user ordinal for each new user', () => {
    const a = provisionCustodialWallet('user-a', { wrappingKey: testWrappingKey });
    const b = provisionCustodialWallet('user-b', { wrappingKey: testWrappingKey });

    expect(a.wallet.userOrdinal).toBe(1);
    expect(b.wallet.userOrdinal).toBe(2);
    expect(a.wallet.derivationPath).toBe("m/44'/60'/2'/0/1");
    expect(b.wallet.derivationPath).toBe("m/44'/60'/2'/0/2");
  });

  it('throws on missing userId', () => {
    expect(() => provisionCustodialWallet('', { wrappingKey: testWrappingKey })).toThrow();
  });
});

describe('custodialSign', () => {
  it('signs a payload on behalf of a user', () => {
    provisionCustodialWallet('signer-1', { wrappingKey: testWrappingKey });

    const payload = Buffer.from('hello world');
    const result = custodialSign('signer-1', payload, 'signer-1', {
      wrappingKey: testWrappingKey,
    });

    expect(result.signatureBase64).toBeTruthy();
    expect(result.auditEventId).toMatch(/^audit-/);
  });

  it('signature is verifiable with the public key', () => {
    const prov = provisionCustodialWallet('signer-2', { wrappingKey: testWrappingKey });
    const payload = Buffer.from('test payload');
    const result = custodialSign('signer-2', payload, 'signer-2', {
      wrappingKey: testWrappingKey,
    });

    // Verify the signature with the public key
    const pubKeyDer = Buffer.from(prov.wallet.publicKeyBase64, 'base64');
    // Reconstruct an Ed25519 public key from raw bytes
    const spkiPrefix = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
      0x03, 0x21, 0x00,
    ]);
    const fullDer = Buffer.concat([spkiPrefix, pubKeyDer]);
    const publicKey = crypto.createPublicKey({
      key: fullDer,
      format: 'der',
      type: 'spki',
    });

    const sigBytes = Buffer.from(result.signatureBase64, 'base64');
    const valid = crypto.verify(null, payload, publicKey, sigBytes);
    expect(valid).toBe(true);
  });

  it('emits key_accessed and signing_performed audit events', () => {
    provisionCustodialWallet('signer-3', { wrappingKey: testWrappingKey });
    custodialSign('signer-3', Buffer.from('data'), 'signer-3', {
      wrappingKey: testWrappingKey,
    });

    const events = _getEventBufferForTests();
    const accessEvent = events.find((e) => e.type === 'key_accessed');
    const signingEvent = events.find((e) => e.type === 'signing_performed');

    expect(accessEvent).toBeDefined();
    expect(signingEvent).toBeDefined();
  });

  it('rejects if user has no wallet', () => {
    expect(() =>
      custodialSign('no-wallet-user', Buffer.from('data'), 'no-wallet-user', {
        wrappingKey: testWrappingKey,
      })
    ).toThrow(/no wallet found/);
  });

  it('rejects if caller is not authorized', () => {
    provisionCustodialWallet('signer-4', { wrappingKey: testWrappingKey });

    expect(() =>
      custodialSign('signer-4', Buffer.from('data'), 'unauthorized-caller', {
        wrappingKey: testWrappingKey,
      })
    ).toThrow(/not authorized/);
  });

  it('rejects if user has migrated to self-custody', () => {
    provisionCustodialWallet('signer-5', { wrappingKey: testWrappingKey });
    markSelfCustodyActive('signer-5');

    expect(() =>
      custodialSign('signer-5', Buffer.from('data'), 'signer-5', {
        wrappingKey: testWrappingKey,
      })
    ).toThrow(/migrated to self-custody/);
  });

  it('allows system signing service to sign', () => {
    provisionCustodialWallet('signer-6', { wrappingKey: testWrappingKey });

    const result = custodialSign('signer-6', Buffer.from('data'), 'system:custodial-signing-service', {
      wrappingKey: testWrappingKey,
    });

    expect(result.signatureBase64).toBeTruthy();
  });
});

describe('decryptForSigning', () => {
  it('returns a valid KeyObject', () => {
    provisionCustodialWallet('decrypt-1', { wrappingKey: testWrappingKey });

    const result = decryptForSigning('decrypt-1', 'decrypt-1', {
      wrappingKey: testWrappingKey,
    });

    expect(result.privateKey).toBeDefined();
    expect(result.publicKeyBase64).toBeTruthy();
    expect(result.privateKey.type).toBe('private');
  });

  it('emits a key_access_denied event for unauthorized callers', () => {
    provisionCustodialWallet('decrypt-2', { wrappingKey: testWrappingKey });

    expect(() =>
      decryptForSigning('decrypt-2', 'random-attacker', { wrappingKey: testWrappingKey })
    ).toThrow();

    const events = _getEventBufferForTests();
    const deniedEvent = events.find((e) => e.type === 'key_access_denied');
    expect(deniedEvent).toBeDefined();
    expect(deniedEvent!.metadata.reason).toBe('not_authorized');
  });
});

describe('rotateCustodialKey', () => {
  it('generates a new keypair and updates the wallet', () => {
    const original = provisionCustodialWallet('rotate-1', { wrappingKey: testWrappingKey });
    const originalPubKey = original.wallet.publicKeyBase64;

    const rotated = rotateCustodialKey('rotate-1', 'rotate-1', { wrappingKey: testWrappingKey });

    expect(rotated.wallet.publicKeyBase64).not.toBe(originalPubKey);
    expect(rotated.wallet.rotatedAt).toBeTruthy();
  });

  it('retires old attestation and registers new one', () => {
    const original = provisionCustodialWallet('rotate-2', { wrappingKey: testWrappingKey });
    const oldLookupKey = `ed25519:${original.wallet.publicKeyBase64}`;

    rotateCustodialKey('rotate-2', 'rotate-2', { wrappingKey: testWrappingKey });

    const registry = getAttestationRegistry();
    expect(registry.isRetired(oldLookupKey)).toBe(true);
    // New key should be attested
    const newLookupKey = `ed25519:${getWalletInfo('rotate-2')!.publicKeyBase64}`;
    expect(registry.isAttested(newLookupKey)).toBe(true);
  });

  it('emits key_rotated audit event', () => {
    provisionCustodialWallet('rotate-3', { wrappingKey: testWrappingKey });
    rotateCustodialKey('rotate-3', 'rotate-3', { wrappingKey: testWrappingKey });

    const events = _getEventBufferForTests();
    const rotateEvent = events.find((e) => e.type === 'key_rotated');
    expect(rotateEvent).toBeDefined();
    expect(rotateEvent!.metadata.oldPublicKeyHash).toBeTruthy();
  });

  it('signing works with the new key after rotation', () => {
    provisionCustodialWallet('rotate-4', { wrappingKey: testWrappingKey });
    rotateCustodialKey('rotate-4', 'rotate-4', { wrappingKey: testWrappingKey });

    const result = custodialSign('rotate-4', Buffer.from('post-rotation'), 'rotate-4', {
      wrappingKey: testWrappingKey,
    });

    expect(result.signatureBase64).toBeTruthy();
  });
});

describe('getWalletInfo', () => {
  it('returns public wallet info for a provisioned user', () => {
    provisionCustodialWallet('info-1', { wrappingKey: testWrappingKey });

    const info = getWalletInfo('info-1');

    expect(info).toBeDefined();
    expect(info!.publicKeyBase64).toBeTruthy();
    expect(info!.publicKeyHash).toBeTruthy();
    expect(info!.derivationPath).toBeTruthy();
    // Never expose encrypted key material
    expect((info as any).encryptedPrivateKeyBase64).toBeUndefined();
    expect((info as any).encryptedDataKeyBase64).toBeUndefined();
  });

  it('returns null for unknown user', () => {
    expect(getWalletInfo('unknown')).toBeNull();
  });
});

describe('hasCustodialWallet', () => {
  it('returns true when user has a wallet', () => {
    provisionCustodialWallet('has-1', { wrappingKey: testWrappingKey });
    expect(hasCustodialWallet('has-1')).toBe(true);
  });

  it('returns false when user has no wallet', () => {
    expect(hasCustodialWallet('no-user')).toBe(false);
  });
});

describe('2FA opt-in', () => {
  it('enables 2FA for a user', () => {
    provisionCustodialWallet('2fa-1', { wrappingKey: testWrappingKey });
    expect(isTwoFactorEnabled('2fa-1')).toBe(false);

    enableTwoFactor('2fa-1');
    expect(isTwoFactorEnabled('2fa-1')).toBe(true);
  });

  it('returns false for unknown user', () => {
    expect(isTwoFactorEnabled('unknown')).toBe(false);
  });

  it('enableTwoFactor returns false for unknown user', () => {
    expect(enableTwoFactor('unknown')).toBe(false);
  });
});

describe('markSelfCustodyActive', () => {
  it('transitions custody mode and blocks custodial signing', () => {
    provisionCustodialWallet('migrate-1', { wrappingKey: testWrappingKey });
    expect(getWalletInfo('migrate-1')!.custodyMode).toBe('custodial_active');

    markSelfCustodyActive('migrate-1');
    expect(getWalletInfo('migrate-1')!.custodyMode).toBe('self_custody_active');

    expect(() =>
      custodialSign('migrate-1', Buffer.from('data'), 'migrate-1', {
        wrappingKey: testWrappingKey,
      })
    ).toThrow(/migrated to self-custody/);
  });
});

describe('envelope encryption integrity', () => {
  it('decrypted key can produce a verifiable signature (round-trip)', () => {
    const prov = provisionCustodialWallet('roundtrip-1', { wrappingKey: testWrappingKey });
    const payload = Buffer.from('integrity-check-payload');

    const signResult = custodialSign('roundtrip-1', payload, 'roundtrip-1', {
      wrappingKey: testWrappingKey,
    });

    // Verify using the stored public key
    const pubKeyBytes = Buffer.from(prov.wallet.publicKeyBase64, 'base64');
    const spkiPrefix = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
      0x03, 0x21, 0x00,
    ]);
    const fullDer = Buffer.concat([spkiPrefix, pubKeyBytes]);
    const publicKey = crypto.createPublicKey({
      key: fullDer,
      format: 'der',
      type: 'spki',
    });

    const sig = Buffer.from(signResult.signatureBase64, 'base64');
    expect(crypto.verify(null, payload, publicKey, sig)).toBe(true);
  });

  it('wrong wrapping key cannot decrypt', () => {
    provisionCustodialWallet('bad-key-1', { wrappingKey: testWrappingKey });

    const wrongKey = _generateTestWrappingKey();
    expect(() =>
      custodialSign('bad-key-1', Buffer.from('data'), 'bad-key-1', {
        wrappingKey: wrongKey,
      })
    ).toThrow();
  });
});