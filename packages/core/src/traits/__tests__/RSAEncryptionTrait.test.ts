/**
 * RSAEncryptionTrait Unit Tests
 *
 * Tests for RSA public key cryptography with hybrid RSA+AES encryption
 */

import { describe, it, expect } from 'vitest';
import { RSAEncryptionTrait } from '../RSAEncryptionTrait';
import type { RSAEncryptionConfig } from '../RSAEncryptionTrait';

describe('RSAEncryptionTrait', () => {
  describe('handler definition', () => {
    it('should have name "rsa_encryption"', () => {
      expect(RSAEncryptionTrait.name).toBe('rsa_encryption');
    });

    it('should have validate and compile methods', () => {
      expect(typeof RSAEncryptionTrait.validate).toBe('function');
      expect(typeof RSAEncryptionTrait.compile).toBe('function');
    });
  });

  describe('validate()', () => {
    it('should pass validation for RSA-2048 with OAEP', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
        hybrid_encryption: true,
      };

      expect(() => RSAEncryptionTrait.validate(config)).not.toThrow();
      expect(RSAEncryptionTrait.validate(config)).toBe(true);
    });

    it('should pass validation for RSA-4096 with PSS', () => {
      const config: RSAEncryptionConfig = {
        key_size: 4096,
        padding_scheme: 'pss',
        hash_algorithm: 'sha512',
        hybrid_encryption: true,
      };

      expect(() => RSAEncryptionTrait.validate(config)).not.toThrow();
    });

    it('should fail if key size is less than 2048 bits', () => {
      const config: RSAEncryptionConfig = {
        key_size: 1024 as any, // Invalid key size
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
      };

      expect(() => RSAEncryptionTrait.validate(config)).toThrow('RSA key size must be at least 2048 bits');
    });

    it('should warn about PKCS#1 padding (deprecated)', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'pkcs1',
        hash_algorithm: 'sha256',
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      RSAEncryptionTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('PKCS#1 padding is deprecated'));
      consoleSpy.mockRestore();
    });

    it('should warn if hybrid encryption is disabled', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
        hybrid_encryption: false,
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      RSAEncryptionTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Hybrid encryption (RSA+AES) recommended'));
      consoleSpy.mockRestore();
    });
  });

  describe('compile() - Web target', () => {
    it('should generate hybrid RSA+AES encryption', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
        hybrid_encryption: true,
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('class RSAEncryption');
      expect(result).toContain('encryptHybrid');
      expect(result).toContain('decryptHybrid');
      expect(result).toContain('AES-GCM');
      expect(result).toContain('RSA-OAEP');
    });

    it('should generate key pair generation code', () => {
      const config: RSAEncryptionConfig = {
        key_size: 3072,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha384',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('generateKeyPair');
      expect(result).toContain('modulusLength: 3072');
      expect(result).toContain('SHA-384');
    });

    it('should include key export/import utilities', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('exportPublicKey');
      expect(result).toContain('importPublicKey');
      expect(result).toContain('arrayBufferToBase64');
      expect(result).toContain('base64ToArrayBuffer');
    });
  });

  describe('compile() - Node.js target', () => {
    it('should use Node.js crypto module', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
        hybrid_encryption: true,
      };

      const result = RSAEncryptionTrait.compile(config, 'node');

      expect(result).toContain("require('crypto')");
      expect(result).toContain('generateKeyPairSync');
      expect(result).toContain('publicEncrypt');
      expect(result).toContain('privateDecrypt');
    });

    it('should include hybrid encryption with AES-256-GCM', () => {
      const config: RSAEncryptionConfig = {
        key_size: 4096,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha512',
        hybrid_encryption: true,
      };

      const result = RSAEncryptionTrait.compile(config, 'node');

      expect(result).toContain('encryptHybrid');
      expect(result).toContain('aes-256-gcm');
      expect(result).toContain('randomBytes(32)'); // AES key
      expect(result).toContain('randomBytes(16)'); // IV
    });

    it('should support key derivation', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
        key_derivation: 'pbkdf2',
      };

      const result = RSAEncryptionTrait.compile(config, 'node');

      expect(result).toContain('passphrase');
    });
  });

  describe('compile() - Unity target', () => {
    it('should generate C# RSACryptoServiceProvider code', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
        hybrid_encryption: true,
      };

      const result = RSAEncryptionTrait.compile(config, 'unity');

      expect(result).toContain('using System.Security.Cryptography');
      expect(result).toContain('RSACryptoServiceProvider');
      expect(result).toContain('class RSAEncryption : MonoBehaviour');
    });

    it('should include hybrid encryption with Aes class', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
        hybrid_encryption: true,
      };

      const result = RSAEncryptionTrait.compile(config, 'unity');

      expect(result).toContain('EncryptHybrid');
      expect(result).toContain('Aes.Create()');
      expect(result).toContain('KeySize = 256');
    });

    it('should support OAEP padding flag', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
      };

      const result = RSAEncryptionTrait.compile(config, 'unity');

      expect(result).toContain('true'); // OAEP = true
    });

    it('should support PKCS#1 padding flag', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'pkcs1',
        hash_algorithm: 'sha256',
      };

      const result = RSAEncryptionTrait.compile(config, 'unity');

      expect(result).toContain('false'); // OAEP = false (PKCS#1)
    });
  });

  describe('compile() - different key sizes', () => {
    it('should support RSA-2048', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('2048');
    });

    it('should support RSA-3072', () => {
      const config: RSAEncryptionConfig = {
        key_size: 3072,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha384',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('3072');
    });

    it('should support RSA-4096', () => {
      const config: RSAEncryptionConfig = {
        key_size: 4096,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha512',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('4096');
    });
  });

  describe('compile() - hash algorithms', () => {
    it('should support SHA-256', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha256',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('SHA-256');
    });

    it('should support SHA-384', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha384',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('SHA-384');
    });

    it('should support SHA-512', () => {
      const config: RSAEncryptionConfig = {
        key_size: 2048,
        padding_scheme: 'oaep',
        hash_algorithm: 'sha512',
      };

      const result = RSAEncryptionTrait.compile(config, 'web');

      expect(result).toContain('SHA-512');
    });
  });
});
