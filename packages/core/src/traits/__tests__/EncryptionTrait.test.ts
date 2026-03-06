/**
 * EncryptionTrait Unit Tests
 *
 * Tests for TLS 1.3, E2EE, and AES-256 encryption trait handler
 */

import { describe, it, expect } from 'vitest';
import { EncryptionTrait } from '../EncryptionTrait';
import type { EncryptionConfig } from '../EncryptionTrait';

describe('EncryptionTrait', () => {
  describe('handler definition', () => {
    it('should have name "encryption"', () => {
      expect(EncryptionTrait.name).toBe('encryption');
    });

    it('should have validate method', () => {
      expect(typeof EncryptionTrait.validate).toBe('function');
    });

    it('should have compile method', () => {
      expect(typeof EncryptionTrait.compile).toBe('function');
    });
  });

  describe('validate()', () => {
    it('should pass validation for TLS 1.3 with AES-256-GCM', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      expect(() => EncryptionTrait.validate(config)).not.toThrow();
      expect(EncryptionTrait.validate(config)).toBe(true);
    });

    it('should pass validation for TLS 1.2 with backward compatibility', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_2',
        cipher_suite: 'aes_128_gcm',
        key_exchange: 'ecdhe_p256',
        perfect_forward_secrecy: true,
      };

      expect(() => EncryptionTrait.validate(config)).not.toThrow();
      expect(EncryptionTrait.validate(config)).toBe(true);
    });

    it('should pass validation for QUIC protocol', () => {
      const config: EncryptionConfig = {
        protocol: 'quic',
        cipher_suite: 'chacha20_poly1305',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      expect(() => EncryptionTrait.validate(config)).not.toThrow();
      expect(EncryptionTrait.validate(config)).toBe(true);
    });

    it('should fail if perfect forward secrecy is disabled', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: false,
      };

      expect(() => EncryptionTrait.validate(config)).toThrow('Perfect forward secrecy is required');
    });
  });

  describe('compile() - Unity target', () => {
    it('should generate C# SSL/TLS configuration', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      const result = EncryptionTrait.compile(config, 'unity');

      expect(result).toContain('using System.Security.Authentication');
      expect(result).toContain('SslProtocols.Tls13');
      expect(result).toContain('class SecureConnection');
    });

    it('should include certificate pinning if configured', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
        certificate_pinning: true,
      };

      const result = EncryptionTrait.compile(config, 'unity');

      expect(result).toContain('certificate_pinning');
      expect(result).toContain('CertificateValidationCallback');
    });
  });

  describe('compile() - Unreal target', () => {
    it('should generate C++ SSL module configuration', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      const result = EncryptionTrait.compile(config, 'unreal');

      expect(result).toContain('#include "Ssl.h"');
      expect(result).toContain('class USecureConnection');
      expect(result).toContain('UCLASS');
    });
  });

  describe('compile() - Godot target', () => {
    it('should generate GDScript StreamPeerTLS', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      const result = EncryptionTrait.compile(config, 'godot');

      expect(result).toContain('extends Node');
      expect(result).toContain('StreamPeerTLS');
      expect(result).toContain('func establish_secure_connection');
    });
  });

  describe('compile() - Web target', () => {
    it('should generate Fetch API with HTTPS', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      const result = EncryptionTrait.compile(config, 'web');

      expect(result).toContain('class SecureConnection');
      expect(result).toContain('async fetch');
      expect(result).toContain('https://');
    });

    it('should include WebSocket wss:// for real-time connections', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      const result = EncryptionTrait.compile(config, 'web');

      expect(result).toContain('WebSocket');
      expect(result).toContain('wss://');
    });

    it('should include SubtleCrypto for client-side encryption', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
      };

      const result = EncryptionTrait.compile(config, 'web');

      expect(result).toContain('crypto.subtle');
      expect(result).toContain('AES-GCM');
    });
  });

  describe('compile() - OCSP stapling', () => {
    it('should include OCSP stapling configuration', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
        ocsp_stapling: true,
      };

      const result = EncryptionTrait.compile(config, 'unity');

      expect(result).toContain('ocsp_stapling');
    });
  });

  describe('compile() - session resumption', () => {
    it('should include session resumption for performance', () => {
      const config: EncryptionConfig = {
        protocol: 'tls_1_3',
        cipher_suite: 'aes_256_gcm',
        key_exchange: 'ecdhe_x25519',
        perfect_forward_secrecy: true,
        session_resumption: true,
      };

      const result = EncryptionTrait.compile(config, 'unity');

      expect(result).toContain('session_resumption');
    });
  });
});
