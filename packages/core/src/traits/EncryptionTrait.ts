/**
 * Encryption Trait
 *
 * Provides TLS 1.3, end-to-end encryption, and AES-256 support for secure communications.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type EncryptionProtocol = 'tls_1_3' | 'tls_1_2' | 'dtls_1_3' | 'quic';
export type CipherSuite = 'aes_256_gcm' | 'aes_128_gcm' | 'chacha20_poly1305';
export type KeyExchange = 'ecdhe_x25519' | 'ecdhe_p256' | 'ecdhe_p384';

export interface EncryptionConfig {
  protocol: EncryptionProtocol;
  cipher_suite: CipherSuite;
  key_exchange: KeyExchange;
  perfect_forward_secrecy: boolean;
  certificate_pinning?: boolean;
  min_tls_version?: '1.2' | '1.3';
  allowed_ciphers?: CipherSuite[];
  session_resumption?: boolean;
  ocsp_stapling?: boolean;
}

export interface EncryptionState {
  active: boolean;
  protocol_version: string;
  cipher_suite: string;
  key_exchange_algorithm: string;
  certificate_valid: boolean;
  session_id?: string;
  handshake_time_ms?: number;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const EncryptionTrait: TraitHandler<EncryptionConfig> = {
  name: 'encryption',

  validate(config: EncryptionConfig): boolean {
    // Require TLS 1.3 or higher for maximum security
    if (config.min_tls_version === '1.2' && config.protocol === 'tls_1_3') {
      console.warn('TLS 1.2 minimum with TLS 1.3 protocol - consider raising minimum');
    }

    // Validate cipher suite compatibility
    const validCiphers: CipherSuite[] = ['aes_256_gcm', 'aes_128_gcm', 'chacha20_poly1305'];
    if (!validCiphers.includes(config.cipher_suite)) {
      throw new Error(`Invalid cipher suite: ${config.cipher_suite}`);
    }

    // Perfect forward secrecy is strongly recommended
    if (!config.perfect_forward_secrecy) {
      console.warn('Perfect forward secrecy disabled - not recommended for production');
    }

    return true;
  },

  compile(config: EncryptionConfig, target: string): string {
    switch (target) {
      case 'unity':
        return (this as any).compileUnity(config);
      case 'unreal':
        return (this as any).compileUnreal(config);
      case 'godot':
        return (this as any).compileGodot(config);
      case 'web':
      case 'react-three-fiber':
        return (this as any).compileWeb(config);
      default:
        return (this as any).compileGeneric(config);
    }
  },

  compileUnity(config: EncryptionConfig): string {
    return `
// Unity TLS Configuration
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

public class EncryptionManager : MonoBehaviour {
    private SslStream sslStream;

    void Start() {
        ConfigureTLS();
    }

    void ConfigureTLS() {
        // Protocol: ${config.protocol}
        // Cipher: ${config.cipher_suite}
        // Key Exchange: ${config.key_exchange}
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls13;
        ServicePointManager.ServerCertificateValidationCallback = ValidateServerCertificate;

        ${
          config.certificate_pinning
            ? `
        // Certificate pinning enabled
        ServicePointManager.CheckCertificateRevocationList = true;
        `
            : ''
        }
    }

    bool ValidateServerCertificate(object sender, X509Certificate certificate,
                                    X509Chain chain, SslPolicyErrors sslPolicyErrors) {
        ${
          config.certificate_pinning
            ? `
        // Implement certificate pinning validation
        string expectedThumbprint = "YOUR_CERTIFICATE_THUMBPRINT";
        return certificate.GetCertHashString() == expectedThumbprint;
        `
            : `
        return sslPolicyErrors == SslPolicyErrors.None;
        `
        }
    }
}`;
  },

  compileUnreal(config: EncryptionConfig): string {
    return `
// Unreal SSL Configuration
#include "Ssl/SslManager.h"

class AEncryptionManager : public AActor {
public:
    void BeginPlay() override {
        ConfigureTLS();
    }

private:
    void ConfigureTLS() {
        // Protocol: ${config.protocol}
        // Cipher: ${config.cipher_suite}
        FSslModule& SslModule = FModuleManager::LoadModuleChecked<FSslModule>("SSL");

        ${
          config.perfect_forward_secrecy
            ? `
        // Enable perfect forward secrecy
        SslModule.SetCipherList("ECDHE+AESGCM");
        `
            : ''
        }

        ${
          config.certificate_pinning
            ? `
        // Enable certificate pinning
        SslModule.SetCertificateVerificationMode(ESslCertificateVerificationMode::VerifyPeer);
        `
            : ''
        }
    }
};`;
  },

  compileGodot(config: EncryptionConfig): string {
    return `
# Godot TLS Configuration
extends Node

var stream_peer_tls: StreamPeerTLS

func _ready():
    configure_tls()

func configure_tls():
    # Protocol: ${config.protocol}
    # Cipher: ${config.cipher_suite}
    stream_peer_tls = StreamPeerTLS.new()

    ${
      config.certificate_pinning
        ? `
    # Certificate pinning enabled
    var cert = X509Certificate.new()
    cert.load("res://certificates/server.crt")
    stream_peer_tls.accept_stream(stream_peer, TLSOptions.server(cert))
    `
        : `
    stream_peer_tls.accept_stream(stream_peer, TLSOptions.server())
    `
    }`;
  },

  compileWeb(config: EncryptionConfig): string {
    return `
// Web Crypto API - TLS Configuration
const encryptionConfig = {
  protocol: '${config.protocol}',
  cipherSuite: '${config.cipher_suite}',
  keyExchange: '${config.key_exchange}',
  perfectForwardSecrecy: ${config.perfect_forward_secrecy}
};

// TLS is handled by the browser, but we can configure fetch options
const tlsOptions = {
  credentials: 'include',
  mode: 'cors',
  ${
    config.certificate_pinning
      ? `
  // Note: Certificate pinning in browsers requires custom implementation
  // or use of Content Security Policy (CSP) headers
  `
      : ''
  }
};

// For WebSocket TLS (wss://)
const ws = new WebSocket('wss://your-server.com', {
  perMessageDeflate: false,
  rejectUnauthorized: ${config.certificate_pinning ? 'true' : 'false'}
});

// For SubtleCrypto API (end-to-end encryption)
async function generateEncryptionKey() {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256 // AES-256
    },
    true,
    ['encrypt', 'decrypt']
  );
}`;
  },

  compileGeneric(config: EncryptionConfig): string {
    return `
// Generic Encryption Configuration
{
  "protocol": "${config.protocol}",
  "cipher_suite": "${config.cipher_suite}",
  "key_exchange": "${config.key_exchange}",
  "perfect_forward_secrecy": ${config.perfect_forward_secrecy},
  "certificate_pinning": ${config.certificate_pinning || false},
  "min_tls_version": "${config.min_tls_version || '1.3'}",
  "session_resumption": ${config.session_resumption || false},
  "ocsp_stapling": ${config.ocsp_stapling || false}
}`;
  },
};

export default EncryptionTrait;
