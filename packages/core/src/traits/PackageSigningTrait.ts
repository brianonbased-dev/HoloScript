/**
 * Package Signing Trait
 *
 * Code signing and signature verification with Ed25519 and ECDSA.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type SignatureAlgorithm = 'ed25519' | 'ecdsa_p256' | 'ecdsa_secp256k1' | 'rsa_pss';
export type DigestAlgorithm = 'sha256' | 'sha384' | 'sha512' | 'blake2b';

export interface PackageSigningConfig {
  signature_algorithm: SignatureAlgorithm;
  digest_algorithm: DigestAlgorithm;
  include_timestamp?: boolean;
  chain_of_trust?: boolean;
  code_signing_certificate?: string;
  timestamp_authority_url?: string;
  signature_format?: 'detached' | 'embedded';
}

export interface SignatureResult {
  signature: Uint8Array;
  public_key: Uint8Array;
  digest: Uint8Array;
  timestamp?: number;
  certificate_chain?: Uint8Array[];
  algorithm: string;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const PackageSigningTrait: TraitHandler<PackageSigningConfig> = {
  name: 'package_signing',

  validate(config: PackageSigningConfig): boolean {
    // Recommend Ed25519 for performance and security
    if (config.signature_algorithm !== 'ed25519') {
      console.info('Ed25519 recommended for best performance and security');
    }

    // Timestamps improve security
    if (!config.include_timestamp) {
      console.warn('Timestamps recommended to prevent replay attacks');
    }

    // Chain of trust for production
    if (config.chain_of_trust && !config.code_signing_certificate) {
      throw new Error('Chain of trust requires code signing certificate');
    }

    return true;
  },

  compile(config: PackageSigningConfig, target: string): string {
    switch (target) {
      case 'web':
      case 'react-three-fiber':
        return (this as any).compileWeb(config);
      case 'node':
        return (this as any).compileNode(config);
      case 'solidity':
        return (this as any).compileSolidity(config);
      default:
        return (this as any).compileGeneric(config);
    }
  },

  compileWeb(config: PackageSigningConfig): string {
    return `
// Package Signing - ${config.signature_algorithm}
${
  config.signature_algorithm === 'ed25519'
    ? `
import { ed25519 } from '@noble/curves/ed25519';
`
    : `
import { secp256k1 } from '@noble/curves/secp256k1';
`
}

class PackageSigner {
  constructor() {
    this.algorithm = '${config.signature_algorithm}';
    this.digestAlgorithm = '${config.digest_algorithm}';
    this.includeTimestamp = ${config.include_timestamp || false};
  }

  ${
    config.signature_algorithm === 'ed25519'
      ? `
  // Ed25519 signing (recommended)
  async generateKeyPair() {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = ed25519.getPublicKey(privateKey);

    return {
      privateKey: new Uint8Array(privateKey),
      publicKey: new Uint8Array(publicKey)
    };
  }

  async signPackage(packageData, privateKey) {
    // Compute digest
    const digest = await this.computeDigest(packageData);

    // Sign with Ed25519
    const signature = ed25519.sign(digest, privateKey);

    return {
      signature: new Uint8Array(signature),
      publicKey: ed25519.getPublicKey(privateKey),
      digest: new Uint8Array(digest),
      ${config.include_timestamp ? `timestamp: Date.now(),` : ''}
      algorithm: 'Ed25519/${config.digest_algorithm.toUpperCase()}'
    };
  }

  async verifySignature(packageData, signature, publicKey) {
    const digest = await this.computeDigest(packageData);
    return ed25519.verify(signature.signature, digest, publicKey);
  }
  `
      : config.signature_algorithm === 'ecdsa_secp256k1'
        ? `
  // ECDSA secp256k1 signing (Ethereum-compatible)
  async generateKeyPair() {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, false);

    return {
      privateKey: new Uint8Array(privateKey),
      publicKey: new Uint8Array(publicKey)
    };
  }

  async signPackage(packageData, privateKey) {
    const digest = await this.computeDigest(packageData);
    const signature = secp256k1.sign(digest, privateKey);

    return {
      signature: new Uint8Array(signature.toCompactRawBytes()),
      publicKey: secp256k1.getPublicKey(privateKey, false),
      digest: new Uint8Array(digest),
      ${config.include_timestamp ? `timestamp: Date.now(),` : ''}
      algorithm: 'ECDSA-secp256k1/${config.digest_algorithm.toUpperCase()}'
    };
  }

  async verifySignature(packageData, signatureData, publicKey) {
    const digest = await this.computeDigest(packageData);
    const sig = secp256k1.Signature.fromCompact(signatureData.signature);
    return secp256k1.verify(sig, digest, publicKey);
  }
  `
        : `
  // Web Crypto API - ECDSA P-256
  async generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    return {
      keyPair,
      publicKey: new Uint8Array(publicKeyRaw)
    };
  }

  async signPackage(packageData, keyPair) {
    const digest = await this.computeDigest(packageData);

    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: this.digestAlgorithm.toUpperCase() } },
      keyPair.privateKey,
      digest
    );

    return {
      signature: new Uint8Array(signature),
      publicKey: await crypto.subtle.exportKey('raw', keyPair.publicKey),
      digest: new Uint8Array(digest),
      ${config.include_timestamp ? `timestamp: Date.now(),` : ''}
      algorithm: 'ECDSA-P256/${config.digest_algorithm.toUpperCase()}'
    };
  }

  async verifySignature(packageData, signatureData, publicKey) {
    const digest = await this.computeDigest(packageData);

    const key = await crypto.subtle.importKey(
      'raw',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: this.digestAlgorithm.toUpperCase() } },
      key,
      signatureData.signature,
      digest
    );
  }
  `
  }

  async computeDigest(data) {
    const hashAlgorithm = this.digestAlgorithm.replace(/\\d+/, '-$&').toUpperCase();
    const digest = await crypto.subtle.digest(hashAlgorithm, data);
    return new Uint8Array(digest);
  }

  ${
    config.include_timestamp
      ? `
  async verifyTimestamp(signatureData, maxAgeMs = 86400000) {
    if (!signatureData.timestamp) {
      throw new Error('Signature does not include timestamp');
    }

    const age = Date.now() - signatureData.timestamp;
    if (age > maxAgeMs) {
      throw new Error(\`Signature expired (age: \${age}ms > max: \${maxAgeMs}ms)\`);
    }

    return true;
  }
  `
      : ''
  }

  ${
    config.signature_format === 'detached'
      ? `
  // Detached signature (signature stored separately)
  exportSignature(signatureData) {
    return JSON.stringify({
      signature: Array.from(signatureData.signature),
      publicKey: Array.from(signatureData.publicKey),
      digest: Array.from(signatureData.digest),
      timestamp: signatureData.timestamp,
      algorithm: signatureData.algorithm
    });
  }
  `
      : `
  // Embedded signature (signature included in package)
  embedSignature(packageData, signatureData) {
    const header = new TextEncoder().encode(JSON.stringify({
      algorithm: signatureData.algorithm,
      timestamp: signatureData.timestamp,
      publicKey: Array.from(signatureData.publicKey)
    }));

    // Format: [header_length(4)] [header] [signature] [package_data]
    const result = new Uint8Array(
      4 + header.length + signatureData.signature.length + packageData.length
    );

    const view = new DataView(result.buffer);
    view.setUint32(0, header.length, true);

    result.set(header, 4);
    result.set(signatureData.signature, 4 + header.length);
    result.set(packageData, 4 + header.length + signatureData.signature.length);

    return result;
  }
  `
  }
}

export default new PackageSigner();`;
  },

  compileNode(config: PackageSigningConfig): string {
    return `
// Node.js Package Signing
const crypto = require('crypto');

class PackageSigner {
  constructor() {
    this.algorithm = '${config.signature_algorithm}';
    this.digestAlgorithm = '${config.digest_algorithm}';
  }

  ${
    config.signature_algorithm === 'ed25519'
      ? `
  // Ed25519 signing
  generateKeyPair() {
    return crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  }

  signPackage(packageData, privateKey) {
    const digest = crypto.createHash(this.digestAlgorithm).update(packageData).digest();
    const signature = crypto.sign(null, digest, privateKey);

    return {
      signature,
      digest,
      ${config.include_timestamp ? `timestamp: Date.now(),` : ''}
      algorithm: 'Ed25519/${this.digestAlgorithm}'
    };
  }

  verifySignature(packageData, signatureData, publicKey) {
    const digest = crypto.createHash(this.digestAlgorithm).update(packageData).digest();
    return crypto.verify(null, digest, publicKey, signatureData.signature);
  }
  `
      : `
  // ECDSA signing
  generateKeyPair() {
    const curve = this.algorithm.includes('secp256k1') ? 'secp256k1' : 'prime256v1';
    return crypto.generateKeyPairSync('ec', {
      namedCurve: curve,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  }

  signPackage(packageData, privateKey) {
    const sign = crypto.createSign(this.digestAlgorithm);
    sign.update(packageData);
    sign.end();

    const signature = sign.sign(privateKey);

    return {
      signature,
      digest: crypto.createHash(this.digestAlgorithm).update(packageData).digest(),
      ${config.include_timestamp ? `timestamp: Date.now(),` : ''}
      algorithm: \`\${this.algorithm}/\${this.digestAlgorithm}\`
    };
  }

  verifySignature(packageData, signatureData, publicKey) {
    const verify = crypto.createVerify(this.digestAlgorithm);
    verify.update(packageData);
    verify.end();

    return verify.verify(publicKey, signatureData.signature);
  }
  `
  }
}

module.exports = new PackageSigner();`;
  },

  compileSolidity(config: PackageSigningConfig): string {
    return `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * Package Signature Verifier
 * Algorithm: ${config.signature_algorithm}
 */
contract PackageVerifier {
    ${
      config.signature_algorithm.includes('ecdsa')
        ? `
    // ECDSA signature verification (Ethereum-native)
    function verifyPackageSignature(
        bytes32 packageHash,
        bytes memory signature,
        address signer
    ) public pure returns (bool) {
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\\x19Ethereum Signed Message:\\n32", packageHash)
        );

        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        address recoveredSigner = ecrecover(ethSignedHash, v, r, s);

        return recoveredSigner == signer;
    }

    function splitSignature(bytes memory sig)
        internal pure returns (bytes32 r, bytes32 s, uint8 v)
    {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
    `
        : `
    // Ed25519 verification requires external library
    // Placeholder for Ed25519 verification
    function verifyEd25519(
        bytes32 message,
        bytes memory signature,
        bytes32 publicKey
    ) public pure returns (bool) {
        // Implementation requires Ed25519 precompile or library
        revert("Ed25519 verification not natively supported");
    }
    `
    }

    ${
      config.include_timestamp
        ? `
    mapping(bytes32 => uint256) public packageTimestamps;

    function verifyWithTimestamp(
        bytes32 packageHash,
        bytes memory signature,
        address signer,
        uint256 timestamp,
        uint256 maxAge
    ) public view returns (bool) {
        require(block.timestamp - timestamp <= maxAge, "Signature expired");
        return verifyPackageSignature(packageHash, signature, signer);
    }
    `
        : ''
    }
}`;
  },

  compileGeneric(config: PackageSigningConfig): string {
    return JSON.stringify(config, null, 2);
  },
};

export default PackageSigningTrait;
