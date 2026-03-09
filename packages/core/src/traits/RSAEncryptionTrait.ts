/**
 * RSA Encryption Trait
 *
 * Public key cryptography with hybrid RSA+AES encryption and OAEP padding.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type RSAKeySize = 2048 | 3072 | 4096;
export type PaddingScheme = 'oaep' | 'pkcs1' | 'pss';
export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512';

export interface RSAEncryptionConfig {
  key_size: RSAKeySize;
  padding_scheme: PaddingScheme;
  hash_algorithm: HashAlgorithm;
  hybrid_encryption?: boolean; // Use RSA for key exchange, AES for data
  public_key_pem?: string;
  private_key_pem?: string;
  key_derivation?: 'pbkdf2' | 'scrypt' | 'argon2';
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const RSAEncryptionTrait: TraitHandler<RSAEncryptionConfig> = {
  name: 'rsa_encryption',

  validate(config: RSAEncryptionConfig): boolean {
    // Enforce minimum key size for security
    if (config.key_size < 2048) {
      throw new Error('RSA key size must be at least 2048 bits');
    }

    // Recommend OAEP over PKCS1
    if (config.padding_scheme === 'pkcs1') {
      console.warn('PKCS#1 padding is deprecated - use OAEP for better security');
    }

    // Hybrid encryption recommended for large data
    if (!config.hybrid_encryption) {
      console.warn('Hybrid encryption (RSA+AES) recommended for encrypting large data');
    }

    return true;
  },

  compile(config: RSAEncryptionConfig, target: string): string {
    switch (target) {
      case 'web':
      case 'react-three-fiber':
        return this.compileWeb(config);
      case 'node':
        return this.compileNode(config);
      case 'unity':
        return this.compileUnity(config);
      default:
        return this.compileGeneric(config);
    }
  },

  compileWeb(config: RSAEncryptionConfig): string {
    return `
// Web Crypto API - RSA Encryption
class RSAEncryption {
  constructor() {
    this.keySize = ${config.key_size};
    this.paddingScheme = '${config.padding_scheme}'.toUpperCase();
    this.hashAlgorithm = 'SHA-${config.hash_algorithm.replace('sha', '')}';
    this.hybridEncryption = ${config.hybrid_encryption !== false};
  }

  async generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: this.keySize,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: this.hashAlgorithm
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );

    return keyPair;
  }

  ${
    config.hybrid_encryption !== false
      ? `
  // Hybrid RSA+AES encryption (recommended for large data)
  async encryptHybrid(data, publicKey) {
    // Generate random AES key
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Encrypt data with AES
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      data
    );

    // Export AES key and encrypt with RSA
    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      rawAesKey
    );

    return {
      encryptedData: new Uint8Array(encryptedData),
      encryptedKey: new Uint8Array(encryptedKey),
      iv: iv,
      algorithm: 'RSA-${config.key_size}+AES-256-GCM'
    };
  }

  async decryptHybrid(encrypted, privateKey) {
    // Decrypt AES key with RSA
    const rawAesKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encrypted.encryptedKey
    );

    // Import decrypted AES key
    const aesKey = await crypto.subtle.importKey(
      'raw',
      rawAesKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt data with AES
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.iv },
      aesKey,
      encrypted.encryptedData
    );

    return new Uint8Array(decryptedData);
  }
  `
      : `
  // Direct RSA encryption (use only for small data)
  async encrypt(data, publicKey) {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      data
    );
    return new Uint8Array(encrypted);
  }

  async decrypt(encryptedData, privateKey) {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedData
    );
    return new Uint8Array(decrypted);
  }
  `
  }

  async exportPublicKey(publicKey) {
    const exported = await crypto.subtle.exportKey('spki', publicKey);
    return this.arrayBufferToBase64(exported);
  }

  async importPublicKey(base64Key) {
    const keyData = this.base64ToArrayBuffer(base64Key);
    return await crypto.subtle.importKey(
      'spki',
      keyData,
      { name: 'RSA-OAEP', hash: this.hashAlgorithm },
      true,
      ['encrypt']
    );
  }

  arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export default new RSAEncryption();`;
  },

  compileNode(config: RSAEncryptionConfig): string {
    return `
// Node.js Crypto - RSA Encryption
const crypto = require('crypto');

class RSAEncryption {
  constructor() {
    this.keySize = ${config.key_size};
    this.paddingScheme = crypto.constants.RSA_${config.padding_scheme.toUpperCase()}_PADDING;
    this.hashAlgorithm = '${config.hash_algorithm}';
    this.hybridEncryption = ${config.hybrid_encryption !== false};
  }

  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: this.keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        ${
          config.key_derivation
            ? `
        cipher: 'aes-256-cbc',
        passphrase: process.env.RSA_KEY_PASSPHRASE || 'default-passphrase'
        `
            : ''
        }
      }
    });
  }

  ${
    config.hybrid_encryption !== false
      ? `
  // Hybrid RSA+AES encryption
  encryptHybrid(data, publicKey) {
    // Generate random AES key
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // Encrypt data with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encryptedData = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Encrypt AES key with RSA
    const encryptedKey = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: this.paddingScheme,
        oaepHash: this.hashAlgorithm
      },
      aesKey
    );

    return {
      encryptedData,
      encryptedKey,
      iv,
      authTag,
      algorithm: 'RSA-${config.key_size}+AES-256-GCM'
    };
  }

  decryptHybrid(encrypted, privateKey) {
    // Decrypt AES key with RSA
    const aesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: this.paddingScheme,
        oaepHash: this.hashAlgorithm
      },
      encrypted.encryptedKey
    );

    // Decrypt data with AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, encrypted.iv);
    decipher.setAuthTag(encrypted.authTag);

    return Buffer.concat([
      decipher.update(encrypted.encryptedData),
      decipher.final()
    ]);
  }
  `
      : `
  // Direct RSA encryption (use only for small data < ${Math.floor(config.key_size / 8) - 42} bytes)
  encrypt(data, publicKey) {
    return crypto.publicEncrypt(
      {
        key: publicKey,
        padding: this.paddingScheme,
        oaepHash: this.hashAlgorithm
      },
      Buffer.from(data)
    );
  }

  decrypt(encryptedData, privateKey) {
    return crypto.privateDecrypt(
      {
        key: privateKey,
        padding: this.paddingScheme,
        oaepHash: this.hashAlgorithm
      },
      encryptedData
    );
  }
  `
  }

  sign(data, privateKey) {
    return crypto.sign(this.hashAlgorithm, Buffer.from(data), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    });
  }

  verify(data, signature, publicKey) {
    return crypto.verify(
      this.hashAlgorithm,
      Buffer.from(data),
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
      },
      signature
    );
  }
}

module.exports = new RSAEncryption();`;
  },

  compileUnity(config: RSAEncryptionConfig): string {
    return `
// Unity RSA Encryption (using System.Security.Cryptography)
using System;
using System.Security.Cryptography;
using System.Text;

public class RSAEncryption : MonoBehaviour {
    private RSACryptoServiceProvider rsa;
    private int keySize = ${config.key_size};

    void Start() {
        InitializeRSA();
    }

    void InitializeRSA() {
        rsa = new RSACryptoServiceProvider(keySize);
    }

    ${
      config.hybrid_encryption !== false
        ? `
    // Hybrid RSA+AES encryption
    public EncryptedPackage EncryptHybrid(byte[] data) {
        // Generate random AES key
        using (Aes aes = Aes.Create()) {
            aes.KeySize = 256;
            aes.GenerateKey();
            aes.GenerateIV();

            // Encrypt data with AES
            using (ICryptoTransform encryptor = aes.CreateEncryptor()) {
                byte[] encryptedData = encryptor.TransformFinalBlock(data, 0, data.Length);

                // Encrypt AES key with RSA
                byte[] encryptedKey = rsa.Encrypt(aes.Key, ${config.padding_scheme === 'oaep' ? 'true' : 'false'});

                return new EncryptedPackage {
                    EncryptedData = encryptedData,
                    EncryptedKey = encryptedKey,
                    IV = aes.IV,
                    Algorithm = "RSA-${config.key_size}+AES-256"
                };
            }
        }
    }

    public byte[] DecryptHybrid(EncryptedPackage package) {
        // Decrypt AES key with RSA
        byte[] aesKey = rsa.Decrypt(package.EncryptedKey, ${config.padding_scheme === 'oaep' ? 'true' : 'false'});

        // Decrypt data with AES
        using (Aes aes = Aes.Create()) {
            aes.Key = aesKey;
            aes.IV = package.IV;

            using (ICryptoTransform decryptor = aes.CreateDecryptor()) {
                return decryptor.TransformFinalBlock(
                    package.EncryptedData,
                    0,
                    package.EncryptedData.Length
                );
            }
        }
    }
    `
        : `
    // Direct RSA encryption
    public byte[] Encrypt(byte[] data) {
        return rsa.Encrypt(data, ${config.padding_scheme === 'oaep' ? 'true' : 'false'});
    }

    public byte[] Decrypt(byte[] encryptedData) {
        return rsa.Decrypt(encryptedData, ${config.padding_scheme === 'oaep' ? 'true' : 'false'});
    }
    `
    }

    public string ExportPublicKey() {
        return rsa.ToXmlString(false);
    }

    public string ExportPrivateKey() {
        return rsa.ToXmlString(true);
    }
}

[Serializable]
public struct EncryptedPackage {
    public byte[] EncryptedData;
    public byte[] EncryptedKey;
    public byte[] IV;
    public string Algorithm;
}`;
  },

  compileGeneric(config: RSAEncryptionConfig): string {
    return JSON.stringify(config, null, 2);
  },
};

export default RSAEncryptionTrait;
