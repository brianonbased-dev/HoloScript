/**
 * PackageSigningTrait Unit Tests
 *
 * Tests for code signing and signature verification with Ed25519 and ECDSA
 */

import { describe, it, expect, vi } from 'vitest';
import { PackageSigningTrait } from '../PackageSigningTrait';
import type { PackageSigningConfig } from '../PackageSigningTrait';

describe('PackageSigningTrait', () => {
  describe('handler definition', () => {
    it('should have name "package_signing"', () => {
      expect(PackageSigningTrait.name).toBe('package_signing');
    });

    it('should have validate and compile methods', () => {
      expect(typeof PackageSigningTrait.validate).toBe('function');
      expect(typeof PackageSigningTrait.compile).toBe('function');
    });
  });

  describe('validate()', () => {
    it('should pass validation for Ed25519 (recommended)', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
        include_timestamp: true,
      };

      expect(() => PackageSigningTrait.validate(config)).not.toThrow();
      expect(PackageSigningTrait.validate(config)).toBe(true);
    });

    it('should pass validation for ECDSA P-256', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_p256',
        digest_algorithm: 'sha256',
      };

      expect(() => PackageSigningTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for ECDSA secp256k1 (Ethereum-compatible)', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_secp256k1',
        digest_algorithm: 'sha256',
      };

      expect(() => PackageSigningTrait.validate(config)).not.toThrow();
    });

    it('should recommend timestamps to prevent replay attacks', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
        include_timestamp: false,
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      PackageSigningTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Timestamps recommended to prevent replay attacks'));
      consoleSpy.mockRestore();
    });

    it('should require certificate for chain of trust', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
        chain_of_trust: true,
        // Missing code_signing_certificate
      };

      expect(() => PackageSigningTrait.validate(config)).toThrow('Chain of trust requires code signing certificate');
    });
  });

  describe('compile() - Web target (Ed25519)', () => {
    it('should generate Ed25519 signing code using @noble/curves', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain("import { ed25519 } from '@noble/curves/ed25519'");
      expect(result).toContain('class PackageSigner');
      expect(result).toContain('generateKeyPair');
      expect(result).toContain('signPackage');
      expect(result).toContain('verifySignature');
    });

    it('should use Ed25519 for signing and verification', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('ed25519.utils.randomPrivateKey()');
      expect(result).toContain('ed25519.getPublicKey');
      expect(result).toContain('ed25519.sign');
      expect(result).toContain('ed25519.verify');
    });

    it('should include timestamp if configured', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
        include_timestamp: true,
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('timestamp: Date.now()');
      expect(result).toContain('verifyTimestamp');
    });
  });

  describe('compile() - Web target (ECDSA secp256k1)', () => {
    it('should generate Ethereum-compatible ECDSA signing', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_secp256k1',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain("import { secp256k1 } from '@noble/curves/secp256k1'");
      expect(result).toContain('secp256k1.utils.randomPrivateKey()');
      expect(result).toContain('secp256k1.sign');
      expect(result).toContain('secp256k1.verify');
    });

    it('should use compact signature format', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_secp256k1',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('toCompactRawBytes');
      expect(result).toContain('fromCompact');
    });
  });

  describe('compile() - Web target (ECDSA P-256)', () => {
    it('should use WebCrypto API for ECDSA P-256', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_p256',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('crypto.subtle.generateKey');
      expect(result).toContain('ECDSA');
      expect(result).toContain('P-256');
    });
  });

  describe('compile() - Node.js target', () => {
    it('should use Node.js crypto module for Ed25519', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'node');

      expect(result).toContain("require('crypto')");
      expect(result).toContain("generateKeyPairSync('ed25519'");
      expect(result).toContain('crypto.sign');
      expect(result).toContain('crypto.verify');
    });

    it('should export keys in PEM format', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'node');

      expect(result).toContain('spki');
      expect(result).toContain('pkcs8');
      expect(result).toContain("format: 'pem'");
    });

    it('should support ECDSA with secp256k1 curve', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_secp256k1',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'node');

      expect(result).toContain('secp256k1');
      expect(result).toContain("generateKeyPairSync('ec'");
    });
  });

  describe('compile() - Solidity target', () => {
    it('should generate ECDSA signature verification contract', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_secp256k1',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'solidity');

      expect(result).toContain('pragma solidity');
      expect(result).toContain('contract PackageVerifier');
      expect(result).toContain('verifyPackageSignature');
      expect(result).toContain('ecrecover');
    });

    it('should include signature splitting logic', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_secp256k1',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'solidity');

      expect(result).toContain('splitSignature');
      expect(result).toContain('bytes32 r');
      expect(result).toContain('bytes32 s');
      expect(result).toContain('uint8 v');
    });

    it('should support timestamp verification on-chain', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ecdsa_secp256k1',
        digest_algorithm: 'sha256',
        include_timestamp: true,
      };

      const result = PackageSigningTrait.compile(config, 'solidity');

      expect(result).toContain('verifyWithTimestamp');
      expect(result).toContain('block.timestamp');
      expect(result).toContain('maxAge');
    });

    it('should reject Ed25519 (not natively supported)', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'solidity');

      expect(result).toContain('Ed25519 verification not natively supported');
      expect(result).toContain('revert');
    });
  });

  describe('compile() - signature formats', () => {
    it('should support detached signatures', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
        signature_format: 'detached',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('exportSignature');
      expect(result).toContain('JSON.stringify');
    });

    it('should support embedded signatures', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
        signature_format: 'embedded',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('embedSignature');
      expect(result).toContain('header_length');
    });
  });

  describe('compile() - digest algorithms', () => {
    it('should support SHA-256', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha256',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('sha256');
    });

    it('should support SHA-384', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'sha384',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('sha384');
    });

    it('should support BLAKE2b', () => {
      const config: PackageSigningConfig = {
        signature_algorithm: 'ed25519',
        digest_algorithm: 'blake2b',
      };

      const result = PackageSigningTrait.compile(config, 'web');

      expect(result).toContain('blake2b');
    });
  });
});
