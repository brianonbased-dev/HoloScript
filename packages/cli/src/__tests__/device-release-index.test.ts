import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createSignedDeviceReleaseIndex,
  verifySignedDeviceReleaseIndex,
} from '../device-release-index';

const ENTRY = {
  profileId: 'jetson-orin' as const,
  phase: 'source-materialized' as const,
  sourceSha256: '1'.repeat(64),
  planSha256: '2'.repeat(64),
  materializationSha256: '3'.repeat(64),
};

describe('signed public device release index', () => {
  it('signs exact materialization commitments and verifies independently', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const index = createSignedDeviceReleaseIndex({
      issuedAt: '2026-08-01T12:00:00.000Z',
      entries: [ENTRY],
      privateKey,
      publicKey,
    });

    expect(index).toMatchObject({
      schema: 'holoscript-device-release-index/v0.1.0',
      claimBoundary: {
        signatureVerifiedImpliesBuiltArtifacts: false,
        signatureVerifiedImpliesHardwareCertified: false,
      },
    });
    expect(index.signature.algorithm).toBe('Ed25519');
    expect(verifySignedDeviceReleaseIndex(index, publicKey)).toEqual({ valid: true, errors: [] });
  });

  it('rejects commitment tampering and the wrong signer', () => {
    const signer = generateKeyPairSync('ed25519');
    const stranger = generateKeyPairSync('ed25519');
    const index = createSignedDeviceReleaseIndex({
      issuedAt: '2026-08-01T12:00:00.000Z',
      entries: [ENTRY],
      privateKey: signer.privateKey,
      publicKey: signer.publicKey,
    });
    const tampered = {
      ...index,
      entries: [{ ...index.entries[0], materializationSha256: '4'.repeat(64) }],
    };

    expect(verifySignedDeviceReleaseIndex(tampered, signer.publicKey).valid).toBe(false);
    expect(verifySignedDeviceReleaseIndex(index, stranger.publicKey).valid).toBe(false);
  });

  it('refuses malformed hashes before signing', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    expect(() =>
      createSignedDeviceReleaseIndex({
        issuedAt: '2026-08-01T12:00:00.000Z',
        entries: [{ ...ENTRY, sourceSha256: 'not-a-hash' }],
        privateKey,
        publicKey,
      })
    ).toThrow(/sourceSha256/);
  });
});
