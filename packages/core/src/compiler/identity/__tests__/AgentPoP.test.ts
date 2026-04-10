/**
 * Tests for AgentPoP module (HTTP Message Signatures)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as crypto from 'crypto';
import {
  generateNonce,
  calculateContentDigest,
  constructSignatureBase,
  signRequest,
  verifySignature,
  derivePublicKey,
  formatSignatureHeaders,
  parseSignatureHeaders,
  SignatureComponents,
  SignatureMetadata,
} from '../AgentPoP';
import { AgentRole, generateAgentKeyPair, AgentKeyPair } from '../AgentIdentity';

/**
 * Helper: Sign a signature base directly using crypto.sign, bypassing signRequest()
 * which adds the nonce to the module-level nonceCache. This allows verifySignature()
 * tests to work without hitting REPLAY_ATTACK on first verification.
 */
function signDirectly(signatureBase: string, privateKeyPem: string): string {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(signatureBase, 'utf8'), privateKey);
  return signature.toString('base64url');
}

describe('AgentPoP', () => {
  let keyPair: AgentKeyPair;

  beforeEach(async () => {
    keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);
  });

  describe('generateNonce', () => {
    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();

      expect(nonce1).toBeTruthy();
      expect(nonce2).toBeTruthy();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThan(0);
    });

    it('should generate base64url-encoded nonces', () => {
      const nonce = generateNonce();
      // Base64url should not contain +, /, or = characters
      expect(nonce).not.toMatch(/[+/=]/);
    });
  });

  describe('calculateContentDigest', () => {
    it('should calculate SHA-256 digest for string body', () => {
      const body = '{"hello":"world"}';
      const digest = calculateContentDigest(body);

      expect(digest).toMatch(/^sha-256=:/);
      expect(digest).toMatch(/:$/);
    });

    it('should calculate same digest for identical content', () => {
      const body = '{"test":"data"}';
      const digest1 = calculateContentDigest(body);
      const digest2 = calculateContentDigest(body);

      expect(digest1).toBe(digest2);
    });

    it('should calculate different digests for different content', () => {
      const digest1 = calculateContentDigest('{"a":"b"}');
      const digest2 = calculateContentDigest('{"c":"d"}');

      expect(digest1).not.toBe(digest2);
    });

    it('should handle Buffer input', () => {
      const buffer = Buffer.from('test data', 'utf8');
      const digest = calculateContentDigest(buffer);

      expect(digest).toMatch(/^sha-256=:/);
    });
  });

  describe('constructSignatureBase', () => {
    it('should construct canonical signature base', () => {
      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': 1735257600,
        '@nonce': 'abc123xyz',
        authorization: 'Bearer eyJhbGc...',
        'content-type': 'application/json',
      };

      const metadata: SignatureMetadata = {
        keyid: 'agent:code_generator#2026-02-27T00:00:00.000Z',
        alg: 'ed25519',
        created: 1735257600,
        nonce: 'abc123xyz',
      };

      const base = constructSignatureBase(components, metadata);

      expect(base).toContain('"@method": POST');
      expect(base).toContain('"@target-uri": /api/compile');
      expect(base).toContain('"@request-timestamp": 1735257600');
      expect(base).toContain('"@nonce": abc123xyz');
      expect(base).toContain('"authorization": Bearer eyJhbGc...');
      expect(base).toContain('"content-type": application/json');
      expect(base).toContain('"@signature-params":');
      expect(base).toContain('created=1735257600');
      expect(base).toContain('keyid="agent:code_generator#2026-02-27T00:00:00.000Z"');
      expect(base).toContain('alg="ed25519"');
    });

    it('should handle minimal components', () => {
      const components: SignatureComponents = {
        '@method': 'GET',
        '@target-uri': '/api/status',
        '@request-timestamp': 1735257600,
        '@nonce': 'xyz789',
      };

      const metadata: SignatureMetadata = {
        keyid: 'agent:orchestrator#2026-02-27T00:00:00.000Z',
        alg: 'ed25519',
        created: 1735257600,
        nonce: 'xyz789',
      };

      const base = constructSignatureBase(components, metadata);

      expect(base).toContain('"@method": GET');
      expect(base).toContain('"@target-uri": /api/status');
      expect(base).not.toContain('authorization');
      expect(base).not.toContain('content-type');
    });

    it('should include content-digest when present', () => {
      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/data',
        '@request-timestamp': 1735257600,
        '@nonce': 'test123',
        'content-digest': 'sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:',
      };

      const metadata: SignatureMetadata = {
        keyid: 'test-key',
        alg: 'ed25519',
        created: 1735257600,
        nonce: 'test123',
      };

      const base = constructSignatureBase(components, metadata);

      expect(base).toContain('"content-digest": sha-256=:');
    });
  });

  describe('signRequest', () => {
    it('should sign HTTP request and return signature', () => {
      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': 0, // Will be set by signRequest
        '@nonce': '', // Will be set by signRequest
        authorization: 'Bearer test-token',
      };

      const httpSignature = signRequest(components, keyPair);

      expect(httpSignature.signature).toBeTruthy();
      expect(httpSignature.metadata.keyid).toBe(keyPair.kid);
      expect(httpSignature.metadata.alg).toBe('ed25519');
      expect(httpSignature.metadata.created).toBeGreaterThan(0);
      expect(httpSignature.metadata.nonce).toBeTruthy();
      expect(httpSignature.components).toContain('@method');
      expect(httpSignature.components).toContain('@target-uri');
      expect(httpSignature.components).toContain('@nonce');
    });

    it('should use provided nonce if given', () => {
      const components: SignatureComponents = {
        '@method': 'GET',
        '@target-uri': '/api/data',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      const customNonce = 'custom-nonce-12345';
      const httpSignature = signRequest(components, keyPair, customNonce);

      expect(httpSignature.metadata.nonce).toBe(customNonce);
    });

    it('should generate different signatures for different requests', () => {
      const components1: SignatureComponents = {
        '@method': 'GET',
        '@target-uri': '/api/a',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      const components2: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/b',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      const sig1 = signRequest(components1, keyPair, 'nonce1');
      const sig2 = signRequest(components2, keyPair, 'nonce2');

      expect(sig1.signature).not.toBe(sig2.signature);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      // Use direct crypto signing to avoid signRequest() polluting the nonce cache
      // (signRequest caches the nonce, causing verifySignature to return REPLAY_ATTACK)
      const now = Math.floor(Date.now() / 1000);
      const nonce = generateNonce();

      const metadata: SignatureMetadata = {
        keyid: keyPair.kid,
        alg: 'ed25519',
        created: now,
        nonce,
      };

      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': now,
        '@nonce': nonce,
      };

      const signatureBase = constructSignatureBase(components, metadata);
      const signature = signDirectly(signatureBase, keyPair.privateKey);

      const result = verifySignature(signatureBase, signature, keyPair.publicKey, metadata);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject signature with wrong public key', async () => {
      // Use direct crypto signing to avoid nonce cache pollution
      const now = Math.floor(Date.now() / 1000);
      const nonce = generateNonce();

      const metadata: SignatureMetadata = {
        keyid: keyPair.kid,
        alg: 'ed25519',
        created: now,
        nonce,
      };

      const components: SignatureComponents = {
        '@method': 'GET',
        '@target-uri': '/test',
        '@request-timestamp': now,
        '@nonce': nonce,
      };

      const signatureBase = constructSignatureBase(components, metadata);
      const signature = signDirectly(signatureBase, keyPair.privateKey);

      // Use different key pair for verification
      const wrongKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

      const result = verifySignature(
        signatureBase,
        signature,
        wrongKeyPair.publicKey, // Wrong public key
        metadata
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject signature with tampered signature base', () => {
      // Use direct crypto signing to avoid nonce cache pollution
      const now = Math.floor(Date.now() / 1000);
      const nonce = generateNonce();

      const metadata: SignatureMetadata = {
        keyid: keyPair.kid,
        alg: 'ed25519',
        created: now,
        nonce,
      };

      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': now,
        '@nonce': nonce,
      };

      const signatureBase = constructSignatureBase(components, metadata);
      const signature = signDirectly(signatureBase, keyPair.privateKey);

      // Tamper with signature base
      const tamperedComponents: SignatureComponents = {
        '@method': 'DELETE', // Changed from POST
        '@target-uri': '/api/compile',
        '@request-timestamp': now,
        '@nonce': nonce,
      };

      const tamperedBase = constructSignatureBase(tamperedComponents, metadata);

      const result = verifySignature(tamperedBase, signature, keyPair.publicKey, metadata);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject expired request (too old)', () => {
      const components: SignatureComponents = {
        '@method': 'GET',
        '@target-uri': '/test',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      const nonce = generateNonce();
      const httpSignature = signRequest(components, keyPair, nonce);

      // Manually set created timestamp to 15 minutes ago (beyond max age of 10 minutes)
      const oldMetadata: SignatureMetadata = {
        ...httpSignature.metadata,
        created: Math.floor(Date.now() / 1000) - 15 * 60,
      };

      const enrichedComponents: SignatureComponents = {
        ...components,
        '@request-timestamp': oldMetadata.created,
        '@nonce': oldMetadata.nonce,
      };

      const signatureBase = constructSignatureBase(enrichedComponents, oldMetadata);

      const result = verifySignature(
        signatureBase,
        httpSignature.signature,
        keyPair.publicKey,
        oldMetadata
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('EXPIRED');
    });

    it('should reject request with future timestamp', () => {
      const components: SignatureComponents = {
        '@method': 'GET',
        '@target-uri': '/test',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      const nonce = generateNonce();
      const httpSignature = signRequest(components, keyPair, nonce);

      // Set timestamp 10 minutes in future (beyond max clock skew of 5 minutes)
      const futureMetadata: SignatureMetadata = {
        ...httpSignature.metadata,
        created: Math.floor(Date.now() / 1000) + 10 * 60,
      };

      const enrichedComponents: SignatureComponents = {
        ...components,
        '@request-timestamp': futureMetadata.created,
        '@nonce': futureMetadata.nonce,
      };

      const signatureBase = constructSignatureBase(enrichedComponents, futureMetadata);

      const result = verifySignature(
        signatureBase,
        httpSignature.signature,
        keyPair.publicKey,
        futureMetadata
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('EXPIRED');
    });
  });

  describe('derivePublicKey', () => {
    it('should derive public key from private key', () => {
      const publicKey = derivePublicKey(keyPair.privateKey);

      expect(publicKey).toBeTruthy();
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
      expect(publicKey).toContain('END PUBLIC KEY');
    });

    it('should derive same public key as generated', () => {
      const derivedPublicKey = derivePublicKey(keyPair.privateKey);

      // Public keys should match
      expect(derivedPublicKey).toBe(keyPair.publicKey);
    });
  });

  describe('formatSignatureHeaders', () => {
    it('should format signature headers correctly', () => {
      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      const httpSignature = signRequest(components, keyPair);
      const headers = formatSignatureHeaders(httpSignature);

      expect(headers['Signature-Input']).toContain('sig1=');
      expect(headers['Signature-Input']).toContain('created=');
      expect(headers['Signature-Input']).toContain('keyid=');
      expect(headers['Signature-Input']).toContain('alg="ed25519"');
      expect(headers['Signature-Input']).toContain('nonce=');

      expect(headers.Signature).toContain('sig1=:');
      expect(headers.Signature).toMatch(/sig1=:.+:/);
    });
  });

  describe('parseSignatureHeaders', () => {
    it('should parse formatted signature headers', () => {
      const components: SignatureComponents = {
        '@method': 'GET',
        '@target-uri': '/api/data',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      const httpSignature = signRequest(components, keyPair);
      const headers = formatSignatureHeaders(httpSignature);

      const parsed = parseSignatureHeaders({
        signature: headers.Signature,
        'signature-input': headers['Signature-Input'],
      });

      expect(parsed).toBeTruthy();
      expect(parsed!.signature).toBe(httpSignature.signature);
      expect(parsed!.metadata.keyid).toBe(httpSignature.metadata.keyid);
      expect(parsed!.metadata.alg).toBe('ed25519');
      expect(parsed!.metadata.created).toBe(httpSignature.metadata.created);
      expect(parsed!.metadata.nonce).toBe(httpSignature.metadata.nonce);
      expect(parsed!.components.length).toBeGreaterThan(0);
    });

    it('should return null for missing headers', () => {
      const parsed = parseSignatureHeaders({});
      expect(parsed).toBeNull();
    });

    it('should return null for malformed headers', () => {
      const parsed = parseSignatureHeaders({
        signature: 'invalid',
        'signature-input': 'malformed',
      });

      expect(parsed).toBeNull();
    });
  });

  describe('end-to-end signature flow', () => {
    it('should sign and verify complete HTTP request', async () => {
      // Use direct crypto signing to avoid nonce cache pollution from signRequest()
      const now = Math.floor(Date.now() / 1000);
      const nonce = generateNonce();
      const requestBody = '{"code":"holoscript code here"}';

      const metadata: SignatureMetadata = {
        keyid: keyPair.kid,
        alg: 'ed25519',
        created: now,
        nonce,
      };

      // 1. Create request components
      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': now,
        '@nonce': nonce,
        authorization: 'Bearer test-jwt-token',
        'content-type': 'application/json',
        'content-digest': calculateContentDigest(requestBody),
      };

      // 2. Construct signature base and sign directly
      const signatureBase = constructSignatureBase(components, metadata);
      const signature = signDirectly(signatureBase, keyPair.privateKey);

      // 3. Format headers (manually construct HTTPSignature for formatting)
      const httpSignature = {
        signature,
        metadata,
        components: Object.keys(components).filter(
          (k) => components[k as keyof SignatureComponents] !== undefined
        ),
      };
      const headers = formatSignatureHeaders(httpSignature);

      // 4. Parse headers (simulating server-side)
      const parsed = parseSignatureHeaders({
        signature: headers.Signature,
        'signature-input': headers['Signature-Input'],
      });

      expect(parsed).toBeTruthy();

      // 5. Reconstruct signature base
      const enrichedComponents: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': parsed!.metadata.created,
        '@nonce': parsed!.metadata.nonce,
        authorization: 'Bearer test-jwt-token',
        'content-type': 'application/json',
        'content-digest': calculateContentDigest(requestBody),
      };

      const verifyBase = constructSignatureBase(enrichedComponents, parsed!.metadata);

      // 6. Verify signature
      const result = verifySignature(
        verifyBase,
        parsed!.signature,
        keyPair.publicKey,
        parsed!.metadata
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('replay attack prevention', () => {
    it('should prevent replay of same nonce within time window', async () => {
      // Use direct crypto signing to avoid signRequest() polluting the nonce cache
      const now = Math.floor(Date.now() / 1000);
      const nonce = generateNonce();

      const metadata: SignatureMetadata = {
        keyid: keyPair.kid,
        alg: 'ed25519',
        created: now,
        nonce,
      };

      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': now,
        '@nonce': nonce,
      };

      const signatureBase = constructSignatureBase(components, metadata);
      const signature = signDirectly(signatureBase, keyPair.privateKey);

      // First verification should succeed (nonce not in cache)
      const result1 = verifySignature(signatureBase, signature, keyPair.publicKey, metadata);

      expect(result1.valid).toBe(true);

      // Second verification with same nonce should fail (replay attack)
      // verifySignature stores the nonce on successful verification
      const result2 = verifySignature(signatureBase, signature, keyPair.publicKey, metadata);

      expect(result2.valid).toBe(false);
      expect(result2.errorCode).toBe('REPLAY_ATTACK');
    });
  });
});
