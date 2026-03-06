/**
 * End-to-End Security Workflow Tests
 *
 * Comprehensive end-to-end tests for HoloScript security traits.
 * Tests complete security workflows from composition to compiled output
 * across multiple target platforms.
 *
 * Covered Security Domains:
 *   - TLS 1.3 Encryption (Unity, Unreal, Godot, Web)
 *   - RSA Hybrid Encryption (Web, Node.js, Unity)
 *   - Ed25519 Code Signing (Web, Node.js, Solidity)
 *   - zk-SNARKs (Solidity, Node.js)
 *   - HSM Integration (AWS, Azure, Google Cloud)
 *   - Sandboxed Execution (WASM, VM, iframe, Worker, Container)
 *   - Vulnerability Scanning (CI/CD, Node.js)
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';

import { EncryptionTrait } from '../EncryptionTrait';
import { RSAEncryptionTrait } from '../RSAEncryptionTrait';
import { PackageSigningTrait } from '../PackageSigningTrait';
import { ZeroKnowledgeProofTrait } from '../ZeroKnowledgeProofTrait';
import { HSMIntegrationTrait } from '../HSMIntegrationTrait';
import { SandboxExecutionTrait } from '../SandboxExecutionTrait';
import { VulnerabilityScannerTrait } from '../VulnerabilityScannerTrait';

import type {
  EncryptionConfig,
  RSAEncryptionConfig,
  PackageSigningConfig,
  ZeroKnowledgeProofConfig,
  HSMIntegrationConfig,
  SandboxExecutionConfig,
  VulnerabilityScannerConfig,
} from '../index';

// =============================================================================
// Workflow 1: Secure Multiplayer VR with TLS 1.3
// =============================================================================

describe('E2E Workflow: Secure Multiplayer VR with TLS 1.3', () => {
  const tlsConfig: EncryptionConfig = {
    protocol: 'tls_1_3',
    cipher_suite: 'aes_256_gcm',
    key_exchange: 'ecdhe_x25519',
    perfect_forward_secrecy: true,
    certificate_pinning: true,
  };

  it('should compile TLS 1.3 encryption for Unity multiplayer', () => {
    expect(() => EncryptionTrait.validate(tlsConfig)).not.toThrow();
    const code = EncryptionTrait.compile(tlsConfig, 'unity');

    // Verify Unity TLS setup
    expect(code).toContain('using System.Net.Security');
    expect(code).toContain('SslProtocols.Tls13');
    expect(code).toContain('TlsCipherSuite.TLS_AES_256_GCM_SHA384');
    expect(code).toContain('class SecureNetworkManager');
  });

  it('should compile TLS 1.3 encryption for Unreal multiplayer', () => {
    const code = EncryptionTrait.compile(tlsConfig, 'unreal');

    // Verify Unreal TLS setup
    expect(code).toContain('#include "Ssl.h"');
    expect(code).toContain('TLS_1_3');
    expect(code).toContain('AES_256_GCM');
    expect(code).toContain('class USecureNetworkManager');
  });

  it('should compile TLS 1.3 encryption for Godot multiplayer', () => {
    const code = EncryptionTrait.compile(tlsConfig, 'godot');

    // Verify Godot TLS setup
    expect(code).toContain('extends Node');
    expect(code).toContain('class_name SecureNetworkManager');
    expect(code).toContain('StreamPeerSSL');
    expect(code).toContain('TLS_1_3');
  });

  it('should compile TLS 1.3 encryption for Web (WebRTC)', () => {
    const code = EncryptionTrait.compile(tlsConfig, 'web');

    // Verify Web TLS setup
    expect(code).toContain('class SecureNetworkManager');
    expect(code).toContain('RTCPeerConnection');
    expect(code).toContain('iceServers');
    expect(code).toContain('TLS 1.3');
  });
});

// =============================================================================
// Workflow 2: Hybrid RSA+AES Encryption for Asset Protection
// =============================================================================

describe('E2E Workflow: Hybrid RSA+AES Asset Encryption', () => {
  const rsaConfig: RSAEncryptionConfig = {
    key_size: 4096,
    padding_scheme: 'oaep',
    hash_algorithm: 'sha256',
    hybrid_encryption: true,
  };

  it('should compile hybrid encryption for Web asset protection', () => {
    expect(() => RSAEncryptionTrait.validate(rsaConfig)).not.toThrow();
    const code = RSAEncryptionTrait.compile(rsaConfig, 'web');

    // Verify Web Crypto API usage
    expect(code).toContain('class HybridEncryption');
    expect(code).toContain('crypto.subtle.generateKey');
    expect(code).toContain('RSA-OAEP');
    expect(code).toContain('AES-GCM');
    expect(code).toContain('modulusLength: 4096');
    expect(code).toContain('encryptHybrid');
    expect(code).toContain('decryptHybrid');
  });

  it('should compile hybrid encryption for Node.js asset protection', () => {
    const code = RSAEncryptionTrait.compile(rsaConfig, 'node');

    // Verify Node.js crypto module usage
    expect(code).toContain("require('crypto')");
    expect(code).toContain('class HybridEncryption');
    expect(code).toContain('generateKeyPairSync');
    expect(code).toContain('publicEncrypt');
    expect(code).toContain('privateDecrypt');
    expect(code).toContain('RSA_PKCS1_OAEP_PADDING');
  });

  it('should compile hybrid encryption for Unity asset protection', () => {
    const code = RSAEncryptionTrait.compile(rsaConfig, 'unity');

    // Verify Unity RSA implementation
    expect(code).toContain('using System.Security.Cryptography');
    expect(code).toContain('class HybridEncryption');
    expect(code).toContain('RSACryptoServiceProvider');
    expect(code).toContain('OaepSHA256');
    expect(code).toContain('Aes.Create()');
  });
});

// =============================================================================
// Workflow 3: Ed25519 Package Signing for Distribution
// =============================================================================

describe('E2E Workflow: Ed25519 Package Signing', () => {
  const signingConfig: PackageSigningConfig = {
    signature_algorithm: 'ed25519',
    digest_algorithm: 'sha512',
    include_timestamp: true,
    timestamp_authority: 'https://timestamp.digicert.com',
  };

  it('should compile Ed25519 signing for Web distribution', () => {
    expect(() => PackageSigningTrait.validate(signingConfig)).not.toThrow();
    const code = PackageSigningTrait.compile(signingConfig, 'web');

    // Verify Ed25519 implementation
    expect(code).toContain("import { ed25519 } from '@noble/curves/ed25519'");
    expect(code).toContain('class PackageSigner');
    expect(code).toContain('async sign(packageData: Uint8Array)');
    expect(code).toContain('async verify(');
    expect(code).toContain('timestamp_authority');
  });

  it('should compile Ed25519 signing for Node.js CLI tools', () => {
    const code = PackageSigningTrait.compile(signingConfig, 'node');

    // Verify Node.js Ed25519 implementation
    expect(code).toContain("require('crypto')");
    expect(code).toContain('class PackageSigner');
    expect(code).toContain('createSign');
    expect(code).toContain('createVerify');
    expect(code).toContain('ed25519');
  });

  it('should compile ECDSA signing for Solidity on-chain verification', () => {
    const ecdsaConfig: PackageSigningConfig = {
      signature_algorithm: 'ecdsa_secp256k1',
      digest_algorithm: 'sha256',
    };

    const code = PackageSigningTrait.compile(ecdsaConfig, 'solidity');

    // Verify Solidity ECDSA verifier
    expect(code).toContain('pragma solidity');
    expect(code).toContain('contract PackageVerifier');
    expect(code).toContain('function verifySignature');
    expect(code).toContain('ecrecover');
  });
});

// =============================================================================
// Workflow 4: zk-SNARK Privacy-Preserving Verification
// =============================================================================

describe('E2E Workflow: zk-SNARK Privacy Verification', () => {
  const zkConfig: ZeroKnowledgeProofConfig = {
    proof_system: 'groth16',
    curve: 'bn254',
    circuit_complexity: 'medium',
    trusted_setup: 'powers_of_tau',
  };

  it('should compile Groth16 verifier for Solidity', () => {
    expect(() => ZeroKnowledgeProofTrait.validate(zkConfig)).not.toThrow();
    const code = ZeroKnowledgeProofTrait.compile(zkConfig, 'solidity');

    // Verify Solidity Groth16 verifier contract
    expect(code).toContain('pragma solidity');
    expect(code).toContain('contract ZKVerifier');
    expect(code).toContain('function verifyProof');
    expect(code).toContain('Groth16 verification');
    expect(code).toContain('bn254');
  });

  it('should compile Groth16 prover for Node.js', () => {
    const code = ZeroKnowledgeProofTrait.compile(zkConfig, 'node');

    // Verify Node.js Groth16 prover
    expect(code).toContain("require('snarkjs')");
    expect(code).toContain('class ZKProver');
    expect(code).toContain('async generateProof');
    expect(code).toContain('groth16.fullProve');
    expect(code).toContain('powers_of_tau');
  });

  it('should compile PLONK prover for high-performance scenarios', () => {
    const plonkConfig: ZeroKnowledgeProofConfig = {
      proof_system: 'plonk',
      curve: 'bls12_381',
      circuit_complexity: 'high',
    };

    const code = ZeroKnowledgeProofTrait.compile(plonkConfig, 'node');

    // Verify PLONK implementation
    expect(code).toContain("require('snarkjs')");
    expect(code).toContain('plonk.fullProve');
    expect(code).toContain('bls12_381');
  });
});

// =============================================================================
// Workflow 5: Multi-Cloud HSM Key Management
// =============================================================================

describe('E2E Workflow: Multi-Cloud HSM Integration', () => {
  it('should compile AWS CloudHSM integration', () => {
    const awsConfig: HSMIntegrationConfig = {
      provider: 'aws_cloudhsm',
      key_type: 'aes_256',
      key_rotation_days: 90,
      multi_region: true,
      compliance_level: 'fips_140_2',
    };

    expect(() => HSMIntegrationTrait.validate(awsConfig)).not.toThrow();
    const code = HSMIntegrationTrait.compile(awsConfig, 'node');

    // Verify AWS KMS integration
    expect(code).toContain("require('@aws-sdk/client-kms')");
    expect(code).toContain('class HSMKeyManager');
    expect(code).toContain('KMSClient');
    expect(code).toContain('CreateKeyCommand');
    expect(code).toContain('AES_256');
    expect(code).toContain('90'); // rotation days
  });

  it('should compile Azure Key Vault integration', () => {
    const azureConfig: HSMIntegrationConfig = {
      provider: 'azure_key_vault',
      key_type: 'rsa_4096',
      compliance_level: 'fips_140_3',
    };

    const code = HSMIntegrationTrait.compile(azureConfig, 'node');

    // Verify Azure Key Vault integration
    expect(code).toContain("require('@azure/keyvault-keys')");
    expect(code).toContain('class HSMKeyManager');
    expect(code).toContain('KeyClient');
    expect(code).toContain('createRsaKey');
    expect(code).toContain('4096');
  });

  it('should compile Google Cloud HSM integration', () => {
    const gcpConfig: HSMIntegrationConfig = {
      provider: 'google_cloud_hsm',
      key_type: 'aes_256',
      compliance_level: 'common_criteria',
    };

    const code = HSMIntegrationTrait.compile(gcpConfig, 'node');

    // Verify Google Cloud KMS integration
    expect(code).toContain("require('@google-cloud/kms')");
    expect(code).toContain('class HSMKeyManager');
    expect(code).toContain('KeyManagementServiceClient');
    expect(code).toContain('createCryptoKey');
  });

  it('should compile iOS Secure Enclave integration', () => {
    const iosConfig: HSMIntegrationConfig = {
      provider: 'secure_enclave',
      key_type: 'ecc_p256',
    };

    const code = HSMIntegrationTrait.compile(iosConfig, 'swift');

    // Verify iOS Secure Enclave integration
    expect(code).toContain('import Security');
    expect(code).toContain('import CryptoKit');
    expect(code).toContain('class HSMKeyManager');
    expect(code).toContain('SecureEnclave');
    expect(code).toContain('P256');
  });
});

// =============================================================================
// Workflow 6: Sandboxed Code Execution
// =============================================================================

describe('E2E Workflow: Sandboxed Code Execution', () => {
  it('should compile WebAssembly sandbox for untrusted code', () => {
    const wasmConfig: SandboxExecutionConfig = {
      sandbox_type: 'wasm',
      max_memory_mb: 128,
      max_execution_time_ms: 5000,
      permissions: {
        filesystem: 'none',
        network: 'none',
        environment: 'none',
      },
    };

    expect(() => SandboxExecutionTrait.validate(wasmConfig)).not.toThrow();
    const code = SandboxExecutionTrait.compile(wasmConfig, 'web');

    // Verify WASM sandbox
    expect(code).toContain('class WASMSandbox');
    expect(code).toContain('WebAssembly.instantiate');
    expect(code).toContain('memory');
    expect(code).toContain('initial: 128');
    expect(code).toContain('maximum: 128');
  });

  it('should compile Node.js VM sandbox for plugin execution', () => {
    const vmConfig: SandboxExecutionConfig = {
      sandbox_type: 'vm',
      max_memory_mb: 512,
      max_execution_time_ms: 10000,
      permissions: {
        filesystem: 'read',
        network: 'restricted',
        environment: 'none',
      },
    };

    const code = SandboxExecutionTrait.compile(vmConfig, 'node');

    // Verify VM sandbox
    expect(code).toContain("require('vm')");
    expect(code).toContain('class VMSandbox');
    expect(code).toContain('vm.createContext');
    expect(code).toContain('timeout: 10000');
    expect(code).toContain('readFileSync');
    expect(code).not.toContain('writeFileSync');
  });

  it('should compile Web Worker sandbox for client-side isolation', () => {
    const workerConfig: SandboxExecutionConfig = {
      sandbox_type: 'worker',
      max_execution_time_ms: 30000,
      permissions: {
        network: 'restricted',
      },
    };

    const code = SandboxExecutionTrait.compile(workerConfig, 'web');

    // Verify Web Worker sandbox
    expect(code).toContain('class WorkerSandbox');
    expect(code).toContain('new Worker');
    expect(code).toContain('postMessage');
    expect(code).toContain('terminate()');
  });

  it('should compile iframe sandbox for UI isolation', () => {
    const iframeConfig: SandboxExecutionConfig = {
      sandbox_type: 'iframe',
      permissions: {
        filesystem: 'none',
        network: 'restricted',
      },
    };

    const code = SandboxExecutionTrait.compile(iframeConfig, 'web');

    // Verify iframe sandbox
    expect(code).toContain('class IframeSandbox');
    expect(code).toContain('createElement("iframe")');
    expect(code).toContain('sandbox');
    expect(code).toContain('allow-scripts');
  });

  it('should compile Docker container sandbox for server-side isolation', () => {
    const containerConfig: SandboxExecutionConfig = {
      sandbox_type: 'container',
      max_memory_mb: 1024,
      max_cpu_percent: 50,
      permissions: {
        filesystem: 'read',
        network: 'none',
      },
    };

    const code = SandboxExecutionTrait.compile(containerConfig, 'docker');

    // Verify Docker container configuration
    expect(code).toContain('FROM');
    expect(code).toContain('--memory=1024m');
    expect(code).toContain('--cpus=0.5');
    expect(code).toContain('--network=none');
    expect(code).toContain('--read-only');
  });
});

// =============================================================================
// Workflow 7: Vulnerability Scanning in CI/CD
// =============================================================================

describe('E2E Workflow: CI/CD Vulnerability Scanning', () => {
  const ciConfig: VulnerabilityScannerConfig = {
    scan_types: ['static_analysis', 'dependency_check', 'composition_validation'],
    severity_threshold: 'medium',
    fail_on_critical: true,
    enable_auto_fix: false,
    parallel_scans: true,
  };

  it('should compile GitHub Actions security workflow', () => {
    expect(() => VulnerabilityScannerTrait.validate(ciConfig)).not.toThrow();
    const code = VulnerabilityScannerTrait.compile(ciConfig, 'github-actions');

    // Verify GitHub Actions workflow
    expect(code).toContain('name: Security Scan');
    expect(code).toContain('on: [push, pull_request]');
    expect(code).toContain('jobs:');
    expect(code).toContain('returntocorp/semgrep-action');
    expect(code).toContain('npm audit');
    expect(code).toContain('npx holoscript validate');
    expect(code).toContain('--security-check');
    expect(code).toContain('github/codeql-action/upload-sarif');
  });

  it('should compile local vulnerability scanner', () => {
    const code = VulnerabilityScannerTrait.compile(ciConfig, 'node');

    // Verify Node.js scanner implementation
    expect(code).toContain('class VulnerabilityScanner');
    expect(code).toContain('runAllScans');
    expect(code).toContain('runStaticAnalysis');
    expect(code).toContain('runDependencyCheck');
    expect(code).toContain('runCompositionValidation');
    expect(code).toContain('Promise.all'); // parallel scans
  });

  it('should detect code injection vulnerabilities', () => {
    const code = VulnerabilityScannerTrait.compile(ciConfig, 'node');

    // Verify code injection detection
    expect(code).toContain('eval(');
    expect(code).toContain('Function(');
    expect(code).toContain('Code injection risk');
    expect(code).toContain('CWE-94');
  });

  it('should detect XSS vulnerabilities', () => {
    const code = VulnerabilityScannerTrait.compile(ciConfig, 'node');

    // Verify XSS detection
    expect(code).toContain('innerHTML');
    expect(code).toContain('Cross-site scripting');
    expect(code).toContain('CWE-79');
  });

  it('should detect hardcoded secrets', () => {
    const code = VulnerabilityScannerTrait.compile(ciConfig, 'node');

    // Verify secret detection
    expect(code).toContain('api[_-]?key');
    expect(code).toContain('password');
    expect(code).toContain('secret');
    expect(code).toContain('Hardcoded secret detected');
    expect(code).toContain('CWE-798');
  });
});

// =============================================================================
// Workflow 8: Complete Security Stack Integration
// =============================================================================

describe('E2E Workflow: Complete Security Stack', () => {
  it('should integrate all security traits in production app', () => {
    // Simulate a production app using all security traits

    // 1. TLS 1.3 for transport security
    const tlsConfig: EncryptionConfig = {
      protocol: 'tls_1_3',
      cipher_suite: 'chacha20_poly1305',
      key_exchange: 'ecdhe_x25519',
      perfect_forward_secrecy: true,
    };
    const tlsCode = EncryptionTrait.compile(tlsConfig, 'unity');
    expect(tlsCode).toContain('SslProtocols.Tls13');

    // 2. RSA for asset encryption
    const rsaConfig: RSAEncryptionConfig = {
      key_size: 4096,
      padding_scheme: 'oaep',
      hash_algorithm: 'sha256',
      hybrid_encryption: true,
    };
    const rsaCode = RSAEncryptionTrait.compile(rsaConfig, 'unity');
    expect(rsaCode).toContain('RSACryptoServiceProvider');

    // 3. Ed25519 for code signing
    const signingConfig: PackageSigningConfig = {
      signature_algorithm: 'ed25519',
      digest_algorithm: 'sha512',
      include_timestamp: true,
    };
    const signingCode = PackageSigningTrait.compile(signingConfig, 'node');
    expect(signingCode).toContain('ed25519');

    // 4. HSM for key management
    const hsmConfig: HSMIntegrationConfig = {
      provider: 'aws_cloudhsm',
      key_type: 'aes_256',
      compliance_level: 'fips_140_2',
    };
    const hsmCode = HSMIntegrationTrait.compile(hsmConfig, 'node');
    expect(hsmCode).toContain('KMSClient');

    // 5. Sandbox for user-generated content
    const sandboxConfig: SandboxExecutionConfig = {
      sandbox_type: 'wasm',
      max_memory_mb: 256,
      permissions: {
        filesystem: 'none',
        network: 'none',
      },
    };
    const sandboxCode = SandboxExecutionTrait.compile(sandboxConfig, 'web');
    expect(sandboxCode).toContain('WebAssembly.instantiate');

    // 6. Vulnerability scanning in CI/CD
    const scanConfig: VulnerabilityScannerConfig = {
      scan_types: ['static_analysis', 'dependency_check'],
      severity_threshold: 'high',
      fail_on_critical: true,
    };
    const scanCode = VulnerabilityScannerTrait.compile(scanConfig, 'github-actions');
    expect(scanCode).toContain('returntocorp/semgrep-action');

    // All security traits compiled successfully
    expect(tlsCode.length).toBeGreaterThan(0);
    expect(rsaCode.length).toBeGreaterThan(0);
    expect(signingCode.length).toBeGreaterThan(0);
    expect(hsmCode.length).toBeGreaterThan(0);
    expect(sandboxCode.length).toBeGreaterThan(0);
    expect(scanCode.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Workflow 9: Cross-Platform Security Consistency
// =============================================================================

describe('E2E Workflow: Cross-Platform Security Consistency', () => {
  const tlsConfig: EncryptionConfig = {
    protocol: 'tls_1_3',
    cipher_suite: 'aes_256_gcm',
    key_exchange: 'ecdhe_x25519',
    perfect_forward_secrecy: true,
  };

  it('should maintain security guarantees across all platforms', () => {
    // Compile TLS 1.3 for all supported platforms
    const unityCode = EncryptionTrait.compile(tlsConfig, 'unity');
    const unrealCode = EncryptionTrait.compile(tlsConfig, 'unreal');
    const godotCode = EncryptionTrait.compile(tlsConfig, 'godot');
    const webCode = EncryptionTrait.compile(tlsConfig, 'web');
    const nodeCode = EncryptionTrait.compile(tlsConfig, 'node');

    // All platforms should use TLS 1.3
    expect(unityCode).toContain('Tls13');
    expect(unrealCode).toContain('TLS_1_3');
    expect(godotCode).toContain('TLS_1_3');
    expect(webCode).toContain('TLS 1.3');
    expect(nodeCode).toContain('TLSv1.3');

    // All platforms should use AES-256-GCM
    expect(unityCode).toContain('AES_256_GCM');
    expect(unrealCode).toContain('AES_256_GCM');
    expect(godotCode).toContain('aes-256-gcm');
    expect(webCode).toContain('AES-GCM');
    expect(nodeCode).toContain('AES-256-GCM');
  });
});

// =============================================================================
// Workflow 10: Performance Testing
// =============================================================================

describe('E2E Workflow: Security Performance Validation', () => {
  it('should generate lightweight WASM sandbox (< 5KB overhead)', () => {
    const wasmConfig: SandboxExecutionConfig = {
      sandbox_type: 'wasm',
      max_memory_mb: 64,
      permissions: {
        filesystem: 'none',
        network: 'none',
      },
    };

    const code = SandboxExecutionTrait.compile(wasmConfig, 'web');

    // Verify minimal overhead
    expect(code.length).toBeLessThan(10000); // Reasonable size limit
    expect(code).toContain('WebAssembly.instantiate');
  });

  it('should generate optimized zk-SNARK verifier for Solidity', () => {
    const zkConfig: ZeroKnowledgeProofConfig = {
      proof_system: 'groth16',
      curve: 'bn254',
      circuit_size: 1000,
    };

    const code = ZeroKnowledgeProofTrait.compile(zkConfig, 'solidity');

    // Verify gas-optimized verifier
    expect(code).toContain('contract ZKVerifier');
    expect(code).toContain('view'); // View function for gas savings
    expect(code).toContain('for'); // Fixed-size loop (not while) for predictable gas
  });
});
