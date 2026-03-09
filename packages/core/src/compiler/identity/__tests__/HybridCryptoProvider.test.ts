/**
 * Tests for HybridCryptoProvider module
 *
 * Covers:
 * - Ed25519CryptoProvider: key generation, signing, verification
 * - MLDSACryptoProvider: ML-DSA-65 with dynamic @noble/post-quantum import
 * - HybridCryptoProvider: composite signing/verification with mock PQ provider
 * - Composite verification logic (defense in depth: EITHER signature validates)
 * - Factory function: createCryptoProvider()
 * - isPostQuantumAvailable() utility
 * - Edge cases: invalid keys, tampered messages, missing PQ provider
 */

import { describe, it, expect, vi } from 'vitest';
import {
  type SignatureAlgorithm,
  type ICryptoProvider,
  type CryptoKeyPair,
  type HybridKeyPair,
  type CompositeSignature,
  Ed25519CryptoProvider,
  MLDSACryptoProvider,
  HybridCryptoProvider,
  createCryptoProvider,
  isPostQuantumAvailable,
} from '../HybridCryptoProvider';

// ---------------------------------------------------------------------------
// Mock PQ Provider (simulates ML-DSA-65 for testing)
// ---------------------------------------------------------------------------

/**
 * Mock ML-DSA-65 provider that uses HMAC-SHA256 as a stand-in for actual
 * lattice-based signatures. This allows testing the hybrid flow without
 * a real PQ dependency.
 */
class MockMlDsa65Provider implements ICryptoProvider {
  private signBehavior: 'normal' | 'always-fail-verify' = 'normal';

  constructor(options?: { failVerify?: boolean }) {
    if (options?.failVerify) {
      this.signBehavior = 'always-fail-verify';
    }
  }

  async generateKeyPair(kid?: string): Promise<CryptoKeyPair> {
    // Generate a random "key" for mock purposes
    const { createHash, randomBytes } = await import('crypto');
    const secret = randomBytes(32).toString('base64');
    const pubKey = createHash('sha256').update(secret).digest('base64');

    return {
      publicKey: pubKey,
      privateKey: secret,
      kid: kid || `ml-dsa-65#${Date.now()}`,
      algorithm: 'ml-dsa-65',
    };
  }

  async sign(message: Uint8Array, privateKey: string): Promise<string> {
    const { createHmac } = await import('crypto');
    const sig = createHmac('sha256', privateKey).update(Buffer.from(message)).digest('base64');
    return sig;
  }

  async verify(message: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
    if (this.signBehavior === 'always-fail-verify') {
      return false;
    }
    // For mock: we cannot truly verify HMAC with only the public key.
    // In the mock, publicKey = SHA256(privateKey), so we just check format.
    // Real verification would use lattice math.
    // For testing purposes, we accept any well-formed signature.
    return signature.length > 0;
  }

  getAlgorithm(): SignatureAlgorithm {
    return 'ml-dsa-65';
  }
}

// ---------------------------------------------------------------------------
// Ed25519CryptoProvider Tests
// ---------------------------------------------------------------------------

describe('Ed25519CryptoProvider', () => {
  const provider = new Ed25519CryptoProvider();

  describe('generateKeyPair', () => {
    it('should generate a valid Ed25519 key pair', async () => {
      const keyPair = await provider.generateKeyPair();

      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
      expect(keyPair.algorithm).toBe('ed25519');
      expect(keyPair.kid).toContain('ed25519#');
    });

    it('should use custom kid when provided', async () => {
      const keyPair = await provider.generateKeyPair('my-custom-kid');

      expect(keyPair.kid).toBe('my-custom-kid');
    });

    it('should generate unique key pairs on each call', async () => {
      const kp1 = await provider.generateKeyPair();
      const kp2 = await provider.generateKeyPair();

      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify a message successfully', async () => {
      const keyPair = await provider.generateKeyPair();
      const message = new TextEncoder().encode('Hello, post-quantum world!');

      const signature = await provider.sign(message, keyPair.privateKey);

      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');

      const valid = await provider.verify(message, signature, keyPair.publicKey);
      expect(valid).toBe(true);
    });

    it('should reject a tampered message', async () => {
      const keyPair = await provider.generateKeyPair();
      const originalMessage = new TextEncoder().encode('original message');
      const tamperedMessage = new TextEncoder().encode('tampered message');

      const signature = await provider.sign(originalMessage, keyPair.privateKey);
      const valid = await provider.verify(tamperedMessage, signature, keyPair.publicKey);

      expect(valid).toBe(false);
    });

    it('should reject a signature from a different key', async () => {
      const kp1 = await provider.generateKeyPair();
      const kp2 = await provider.generateKeyPair();
      const message = new TextEncoder().encode('test message');

      const signature = await provider.sign(message, kp1.privateKey);
      const valid = await provider.verify(message, signature, kp2.publicKey);

      expect(valid).toBe(false);
    });

    it('should return false for malformed signature instead of throwing', async () => {
      const keyPair = await provider.generateKeyPair();
      const message = new TextEncoder().encode('test');

      const valid = await provider.verify(message, 'not-a-valid-signature', keyPair.publicKey);
      expect(valid).toBe(false);
    });

    it('should handle empty message', async () => {
      const keyPair = await provider.generateKeyPair();
      const message = new Uint8Array(0);

      const signature = await provider.sign(message, keyPair.privateKey);
      const valid = await provider.verify(message, signature, keyPair.publicKey);

      expect(valid).toBe(true);
    });

    it('should handle large messages', async () => {
      const keyPair = await provider.generateKeyPair();
      // 1MB message
      const message = new Uint8Array(1024 * 1024).fill(42);

      const signature = await provider.sign(message, keyPair.privateKey);
      const valid = await provider.verify(message, signature, keyPair.publicKey);

      expect(valid).toBe(true);
    });
  });

  describe('getAlgorithm', () => {
    it('should return ed25519', () => {
      expect(provider.getAlgorithm()).toBe('ed25519');
    });
  });
});

// ---------------------------------------------------------------------------
// HybridCryptoProvider Tests
// ---------------------------------------------------------------------------

describe('HybridCryptoProvider', () => {
  describe('constructor validation', () => {
    it('should accept Ed25519 classical provider', () => {
      const classical = new Ed25519CryptoProvider();
      const hybrid = new HybridCryptoProvider(classical);

      expect(hybrid.getAlgorithm()).toBe('hybrid-ed25519-ml-dsa-65');
    });

    it('should accept Ed25519 + ML-DSA-65 providers', () => {
      const classical = new Ed25519CryptoProvider();
      const pq = new MockMlDsa65Provider();
      const hybrid = new HybridCryptoProvider(classical, pq);

      expect(hybrid.getAlgorithm()).toBe('hybrid-ed25519-ml-dsa-65');
      expect(hybrid.hasPQProvider()).toBe(true);
    });

    it('should reject non-ed25519 classical provider', () => {
      const wrongProvider = new MockMlDsa65Provider(); // ml-dsa-65, not ed25519

      expect(() => {
        new HybridCryptoProvider(wrongProvider as any);
      }).toThrow('Classical provider must be ed25519');
    });

    it('should reject non-ml-dsa-65 PQ provider', () => {
      const classical = new Ed25519CryptoProvider();
      const wrongPq = new Ed25519CryptoProvider(); // ed25519, not ml-dsa-65

      expect(() => {
        new HybridCryptoProvider(classical, wrongPq as any);
      }).toThrow('Post-quantum provider must be ml-dsa-65');
    });
  });

  describe('without PQ provider (Phase 1 mode)', () => {
    const classical = new Ed25519CryptoProvider();
    const hybrid = new HybridCryptoProvider(classical);

    it('should report no PQ provider', () => {
      expect(hybrid.hasPQProvider()).toBe(false);
    });

    it('should generate hybrid key pair with only classical key', async () => {
      const keyPair = await hybrid.generateHybridKeyPair('test-kid');

      expect(keyPair.classicalKey).toBeDefined();
      expect(keyPair.classicalKey.algorithm).toBe('ed25519');
      expect(keyPair.pqKey).toBeUndefined();
      expect(keyPair.kid).toBe('test-kid');
      expect(keyPair.algorithm).toBe('hybrid-ed25519-ml-dsa-65');
    });

    it('should produce composite signature with only classical component', async () => {
      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('Phase 1 message');

      const composite = await hybrid.signComposite(message, keyPair);

      expect(composite.classicalSignature).toBeTruthy();
      expect(composite.pqSignature).toBeUndefined();
      expect(composite.algorithm).toBe('hybrid-ed25519-ml-dsa-65');
      expect(composite.kid).toBe(keyPair.kid);
      expect(composite.signedAt).toBeTruthy();
    });

    it('should verify composite with only classical component', async () => {
      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('verify me');

      const composite = await hybrid.signComposite(message, keyPair);
      const result = await hybrid.verifyComposite(message, composite, keyPair);

      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
      expect(result.pqValid).toBeNull();
      expect(result.algorithm).toBe('hybrid-ed25519-ml-dsa-65');
      expect(result.error).toBeUndefined();
    });

    it('should fail verification for tampered message', async () => {
      const keyPair = await hybrid.generateHybridKeyPair();
      const original = new TextEncoder().encode('original');
      const tampered = new TextEncoder().encode('tampered');

      const composite = await hybrid.signComposite(original, keyPair);
      const result = await hybrid.verifyComposite(tampered, composite, keyPair);

      expect(result.valid).toBe(false);
      expect(result.classicalValid).toBe(false);
      expect(result.pqValid).toBeNull();
      expect(result.error).toContain('Both classical');
    });

    it('should implement ICryptoProvider interface (sign/verify)', async () => {
      const keyPair = await hybrid.generateKeyPair();
      const message = new TextEncoder().encode('ICryptoProvider test');

      const signature = await hybrid.sign(message, keyPair.privateKey);
      const valid = await hybrid.verify(message, signature, keyPair.publicKey);

      expect(valid).toBe(true);
    });
  });

  describe('with PQ provider (Phase 2 simulation)', () => {
    it('should generate hybrid key pair with both keys', async () => {
      const classical = new Ed25519CryptoProvider();
      const pq = new MockMlDsa65Provider();
      const hybrid = new HybridCryptoProvider(classical, pq);

      const keyPair = await hybrid.generateHybridKeyPair('dual-kid');

      expect(keyPair.classicalKey).toBeDefined();
      expect(keyPair.classicalKey.algorithm).toBe('ed25519');
      expect(keyPair.pqKey).toBeDefined();
      expect(keyPair.pqKey!.algorithm).toBe('ml-dsa-65');
      expect(keyPair.kid).toBe('dual-kid');
    });

    it('should produce composite signature with both components', async () => {
      const classical = new Ed25519CryptoProvider();
      const pq = new MockMlDsa65Provider();
      const hybrid = new HybridCryptoProvider(classical, pq);

      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('dual-signed message');

      const composite = await hybrid.signComposite(message, keyPair);

      expect(composite.classicalSignature).toBeTruthy();
      expect(composite.pqSignature).toBeTruthy();
      expect(composite.algorithm).toBe('hybrid-ed25519-ml-dsa-65');
    });

    it('should verify when both signatures are valid', async () => {
      const classical = new Ed25519CryptoProvider();
      const pq = new MockMlDsa65Provider();
      const hybrid = new HybridCryptoProvider(classical, pq);

      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('both valid');

      const composite = await hybrid.signComposite(message, keyPair);
      const result = await hybrid.verifyComposite(message, composite, keyPair);

      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
      expect(result.pqValid).toBe(true);
    });
  });

  describe('defense in depth verification logic', () => {
    it('should pass when classical valid but PQ fails', async () => {
      // Simulate PQ implementation bug: PQ always fails verification
      const classical = new Ed25519CryptoProvider();
      const brokenPq = new MockMlDsa65Provider({ failVerify: true });
      const hybrid = new HybridCryptoProvider(classical, brokenPq);

      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('classical saves the day');

      const composite = await hybrid.signComposite(message, keyPair);
      const result = await hybrid.verifyComposite(message, composite, keyPair);

      // Defense in depth: valid because classical verifies
      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
      expect(result.pqValid).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should pass when PQ valid but classical fails (quantum break scenario)', async () => {
      const classical = new Ed25519CryptoProvider();
      const pq = new MockMlDsa65Provider();
      const hybrid = new HybridCryptoProvider(classical, pq);

      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('quantum break scenario');

      const composite = await hybrid.signComposite(message, keyPair);

      // Tamper with classical signature to simulate quantum break
      const tamperedComposite: CompositeSignature = {
        ...composite,
        classicalSignature: 'AAAA' + composite.classicalSignature.slice(4),
      };

      const result = await hybrid.verifyComposite(message, tamperedComposite, keyPair);

      // Defense in depth: valid because PQ verifies
      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(false);
      expect(result.pqValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail when BOTH signatures are invalid', async () => {
      const classical = new Ed25519CryptoProvider();
      const brokenPq = new MockMlDsa65Provider({ failVerify: true });
      const hybrid = new HybridCryptoProvider(classical, brokenPq);

      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('sign this');
      const wrongMessage = new TextEncoder().encode('verify with wrong message');

      const composite = await hybrid.signComposite(message, keyPair);
      const result = await hybrid.verifyComposite(wrongMessage, composite, keyPair);

      // Both fail: overall verification fails
      expect(result.valid).toBe(false);
      expect(result.classicalValid).toBe(false);
      expect(result.pqValid).toBe(false);
      expect(result.error).toContain('Both classical');
      expect(result.error).toContain('post-quantum');
    });

    it('should handle composite with missing PQ signature gracefully', async () => {
      const classical = new Ed25519CryptoProvider();
      const pq = new MockMlDsa65Provider();
      const hybrid = new HybridCryptoProvider(classical, pq);

      const keyPair = await hybrid.generateHybridKeyPair();
      const message = new TextEncoder().encode('missing PQ sig');

      const composite = await hybrid.signComposite(message, keyPair);

      // Remove PQ signature to simulate backward-compatible signature
      const classicalOnly: CompositeSignature = {
        ...composite,
        pqSignature: undefined,
      };

      const result = await hybrid.verifyComposite(message, classicalOnly, keyPair);

      // Classical verifies, PQ is null (not present)
      expect(result.valid).toBe(true);
      expect(result.classicalValid).toBe(true);
      expect(result.pqValid).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// createCryptoProvider Factory Tests
// ---------------------------------------------------------------------------

describe('createCryptoProvider', () => {
  it('should create Ed25519 provider for ed25519 algorithm', () => {
    const provider = createCryptoProvider('ed25519');

    expect(provider).toBeInstanceOf(Ed25519CryptoProvider);
    expect(provider.getAlgorithm()).toBe('ed25519');
  });

  it('should create MLDSACryptoProvider for ml-dsa-65', () => {
    const provider = createCryptoProvider('ml-dsa-65');

    expect(provider).toBeInstanceOf(MLDSACryptoProvider);
    expect(provider.getAlgorithm()).toBe('ml-dsa-65');
  });

  it('should create HybridCryptoProvider for hybrid algorithm', () => {
    const provider = createCryptoProvider('hybrid-ed25519-ml-dsa-65');

    expect(provider).toBeInstanceOf(HybridCryptoProvider);
    expect(provider.getAlgorithm()).toBe('hybrid-ed25519-ml-dsa-65');
  });

  it('should create HybridCryptoProvider with custom PQ provider', () => {
    const mockPq = new MockMlDsa65Provider();
    const provider = createCryptoProvider('hybrid-ed25519-ml-dsa-65', mockPq);

    expect(provider).toBeInstanceOf(HybridCryptoProvider);
    expect((provider as HybridCryptoProvider).hasPQProvider()).toBe(true);
  });

  it('should auto-create MLDSACryptoProvider for hybrid when no PQ provider given', () => {
    const provider = createCryptoProvider('hybrid-ed25519-ml-dsa-65');

    // Phase 2: factory auto-creates MLDSACryptoProvider as PQ provider
    expect((provider as HybridCryptoProvider).hasPQProvider()).toBe(true);
  });

  it('should produce working sign/verify cycle via factory', async () => {
    const provider = createCryptoProvider('ed25519');
    const keyPair = await provider.generateKeyPair();
    const message = new TextEncoder().encode('factory test');

    const signature = await provider.sign(message, keyPair.privateKey);
    const valid = await provider.verify(message, signature, keyPair.publicKey);

    expect(valid).toBe(true);
  });

  it('should produce working hybrid sign/verify cycle via factory', async () => {
    const mockPq = new MockMlDsa65Provider();
    const provider = createCryptoProvider(
      'hybrid-ed25519-ml-dsa-65',
      mockPq
    ) as HybridCryptoProvider;
    const keyPair = await provider.generateHybridKeyPair();
    const message = new TextEncoder().encode('hybrid factory test');

    const composite = await provider.signComposite(message, keyPair);
    const result = await provider.verifyComposite(message, composite, keyPair);

    expect(result.valid).toBe(true);
    expect(result.classicalValid).toBe(true);
    expect(result.pqValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Type and Interface Tests
// ---------------------------------------------------------------------------

describe('Type safety', () => {
  it('SignatureAlgorithm covers all three variants', () => {
    const algorithms: SignatureAlgorithm[] = ['ed25519', 'ml-dsa-65', 'hybrid-ed25519-ml-dsa-65'];

    expect(algorithms).toHaveLength(3);
    algorithms.forEach((alg) => expect(typeof alg).toBe('string'));
  });

  it('CryptoKeyPair has required fields', async () => {
    const provider = new Ed25519CryptoProvider();
    const kp = await provider.generateKeyPair('test');

    // Type-level check: all fields present
    expect(kp).toHaveProperty('publicKey');
    expect(kp).toHaveProperty('privateKey');
    expect(kp).toHaveProperty('kid');
    expect(kp).toHaveProperty('algorithm');
  });

  it('HybridKeyPair has required fields', async () => {
    const classical = new Ed25519CryptoProvider();
    const hybrid = new HybridCryptoProvider(classical);
    const kp = await hybrid.generateHybridKeyPair();

    expect(kp).toHaveProperty('classicalKey');
    expect(kp).toHaveProperty('kid');
    expect(kp).toHaveProperty('algorithm');
    // pqKey is optional
    expect('pqKey' in kp).toBe(true);
  });

  it('CompositeSignature has required fields', async () => {
    const classical = new Ed25519CryptoProvider();
    const hybrid = new HybridCryptoProvider(classical);
    const kp = await hybrid.generateHybridKeyPair();
    const msg = new TextEncoder().encode('type test');

    const sig = await hybrid.signComposite(msg, kp);

    expect(sig).toHaveProperty('classicalSignature');
    expect(sig).toHaveProperty('algorithm');
    expect(sig).toHaveProperty('signedAt');
    expect(sig).toHaveProperty('kid');
  });
});

// ---------------------------------------------------------------------------
// MLDSACryptoProvider Tests
// ---------------------------------------------------------------------------

describe('MLDSACryptoProvider', () => {
  describe('when @noble/post-quantum is NOT available', () => {
    it('should throw a clear error when module import fails', async () => {
      const provider = new MLDSACryptoProvider();

      // Simulate missing module by injecting a getModule override that rejects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).getModule = async () => {
        throw new Error(
          'ML-DSA-65 requires @noble/post-quantum. ' +
            'Install it with: npm install @noble/post-quantum'
        );
      };

      await expect(provider.generateKeyPair()).rejects.toThrow(
        'ML-DSA-65 requires @noble/post-quantum'
      );
    });

    it('should throw clear error on sign when module unavailable', async () => {
      const provider = new MLDSACryptoProvider();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).getModule = async () => {
        throw new Error(
          'ML-DSA-65 requires @noble/post-quantum. ' +
            'Install it with: npm install @noble/post-quantum'
        );
      };

      const message = new TextEncoder().encode('test');
      await expect(provider.sign(message, 'key')).rejects.toThrow(
        'ML-DSA-65 requires @noble/post-quantum'
      );
    });

    it('should throw clear error on verify when module unavailable', async () => {
      const provider = new MLDSACryptoProvider();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).getModule = async () => {
        throw new Error(
          'ML-DSA-65 requires @noble/post-quantum. ' +
            'Install it with: npm install @noble/post-quantum'
        );
      };

      const message = new TextEncoder().encode('test');
      // verify catches errors and returns false
      const result = await provider.verify(message, 'sig', 'key');
      expect(result).toBe(false);
    });

    it('should return ml-dsa-65 from getAlgorithm without needing module', () => {
      const provider = new MLDSACryptoProvider();
      expect(provider.getAlgorithm()).toBe('ml-dsa-65');
    });
  });

  describe('with mocked @noble/post-quantum module', () => {
    // Create a mock that simulates the @noble/post-quantum/ml-dsa API
    function createMockMLDSA() {
      const mockKeyPair = {
        publicKey: new Uint8Array(1952).fill(1),
        secretKey: new Uint8Array(4032).fill(2),
      };
      const mockSignature = new Uint8Array(3309).fill(3);

      return {
        ml_dsa65: {
          keygen: vi.fn().mockReturnValue(mockKeyPair),
          sign: vi.fn().mockReturnValue(mockSignature),
          verify: vi.fn().mockReturnValue(true),
        },
      };
    }

    it('should generate key pair using noble ml_dsa65.keygen', async () => {
      const provider = new MLDSACryptoProvider();
      const mockNoble = createMockMLDSA();

      // Inject mock module directly into provider cache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = mockNoble;

      const keyPair = await provider.generateKeyPair('test-pq-kid');

      expect(mockNoble.ml_dsa65.keygen).toHaveBeenCalledOnce();
      expect(keyPair.kid).toBe('test-pq-kid');
      expect(keyPair.algorithm).toBe('ml-dsa-65');
      expect(keyPair.publicKey).toBeTruthy();
      expect(keyPair.privateKey).toBeTruthy();
      // Verify base64 encoding
      expect(() => Buffer.from(keyPair.publicKey, 'base64')).not.toThrow();
      expect(() => Buffer.from(keyPair.privateKey, 'base64')).not.toThrow();
    });

    it('should generate default kid when none provided', async () => {
      const provider = new MLDSACryptoProvider();
      const mockNoble = createMockMLDSA();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = mockNoble;

      const keyPair = await provider.generateKeyPair();

      expect(keyPair.kid).toContain('ml-dsa-65#');
    });

    it('should sign a message using noble ml_dsa65.sign', async () => {
      const provider = new MLDSACryptoProvider();
      const mockNoble = createMockMLDSA();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = mockNoble;

      const message = new TextEncoder().encode('sign this PQ message');
      const privateKey = Buffer.from(new Uint8Array(32).fill(99)).toString('base64');

      const signature = await provider.sign(message, privateKey);

      expect(mockNoble.ml_dsa65.sign).toHaveBeenCalledOnce();
      // First arg: secretKey bytes, second arg: message
      const callArgs = mockNoble.ml_dsa65.sign.mock.calls[0];
      expect(callArgs[0]).toBeInstanceOf(Uint8Array);
      expect(callArgs[1]).toEqual(message);
      // Signature is base64 encoded
      expect(typeof signature).toBe('string');
      expect(() => Buffer.from(signature, 'base64')).not.toThrow();
    });

    it('should verify a signature using noble ml_dsa65.verify', async () => {
      const provider = new MLDSACryptoProvider();
      const mockNoble = createMockMLDSA();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = mockNoble;

      const message = new TextEncoder().encode('verify this PQ message');
      const publicKey = Buffer.from(new Uint8Array(1952).fill(1)).toString('base64');
      const signature = Buffer.from(new Uint8Array(3309).fill(3)).toString('base64');

      const valid = await provider.verify(message, signature, publicKey);

      expect(mockNoble.ml_dsa65.verify).toHaveBeenCalledOnce();
      expect(valid).toBe(true);
    });

    it('should return false when verify throws', async () => {
      const provider = new MLDSACryptoProvider();
      const mockNoble = createMockMLDSA();
      mockNoble.ml_dsa65.verify.mockImplementation(() => {
        throw new Error('Invalid signature format');
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = mockNoble;

      const message = new TextEncoder().encode('bad verify');
      const valid = await provider.verify(message, 'bad-sig', 'bad-key');

      expect(valid).toBe(false);
    });

    it('should return false when verify returns false', async () => {
      const provider = new MLDSACryptoProvider();
      const mockNoble = createMockMLDSA();
      mockNoble.ml_dsa65.verify.mockReturnValue(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = mockNoble;

      const message = new TextEncoder().encode('tampered');
      const valid = await provider.verify(message, 'some-sig', 'some-key');

      expect(valid).toBe(false);
    });

    it('should cache the module after first getModule call', async () => {
      const provider = new MLDSACryptoProvider();
      const mockNoble = createMockMLDSA();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).mlDsaModule = mockNoble;

      // Call generateKeyPair twice — keygen should be called twice but module stays cached
      await provider.generateKeyPair();
      await provider.generateKeyPair();

      expect(mockNoble.ml_dsa65.keygen).toHaveBeenCalledTimes(2);
      // Module reference should still be the same object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((provider as any).mlDsaModule).toBe(mockNoble);
    });
  });

  describe('integration with HybridCryptoProvider', () => {
    it('should work as PQ provider in HybridCryptoProvider', () => {
      const classical = new Ed25519CryptoProvider();
      const pq = new MLDSACryptoProvider();
      const hybrid = new HybridCryptoProvider(classical, pq);

      expect(hybrid.hasPQProvider()).toBe(true);
      expect(hybrid.getAlgorithm()).toBe('hybrid-ed25519-ml-dsa-65');
    });

    it('should be created automatically by createCryptoProvider hybrid', () => {
      const provider = createCryptoProvider('hybrid-ed25519-ml-dsa-65');

      expect(provider).toBeInstanceOf(HybridCryptoProvider);
      expect((provider as HybridCryptoProvider).hasPQProvider()).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// isPostQuantumAvailable Tests
// ---------------------------------------------------------------------------

describe('isPostQuantumAvailable', () => {
  it('should return a boolean', async () => {
    // This test works regardless of whether @noble/post-quantum is installed:
    // - If installed: returns true
    // - If not installed: returns false
    // Either way, it should not throw.
    const result = await isPostQuantumAvailable();
    expect(typeof result).toBe('boolean');
  });
});
