# Security Traits Usage Examples

Complete guide to using HoloScript's 7 security trait handlers for building secure XR applications.

---

## 1. EncryptionTrait - TLS 1.3 & End-to-End Encryption

### Basic TLS 1.3 Configuration

```typescript
import { EncryptionTrait } from '@holoscript/core/traits/EncryptionTrait';

const tlsConfig = {
  protocol: 'tls_1_3',
  cipher_suite: 'aes_256_gcm',
  key_exchange: 'ecdhe_x25519',
  perfect_forward_secrecy: true,
  certificate_pinning: true,
  ocsp_stapling: true,
};

// Validate configuration
EncryptionTrait.validate(tlsConfig); // Returns true or throws error

// Generate Unity C# code
const unityCode = EncryptionTrait.compile(tlsConfig, 'unity');

// Generate Web code
const webCode = EncryptionTrait.compile(tlsConfig, 'web');
```

### QUIC Protocol for Low-Latency VR

```typescript
const quicConfig = {
  protocol: 'quic',
  cipher_suite: 'chacha20_poly1305',
  key_exchange: 'ecdhe_x25519',
  perfect_forward_secrecy: true,
  session_resumption: true, // Faster reconnection
};

const godotCode = EncryptionTrait.compile(quicConfig, 'godot');
```

---

## 2. RSAEncryptionTrait - Hybrid RSA+AES Encryption

### Hybrid Encryption for Large Data

```typescript
import { RSAEncryptionTrait } from '@holoscript/core/traits/RSAEncryptionTrait';

const rsaConfig = {
  key_size: 2048,
  padding_scheme: 'oaep',
  hash_algorithm: 'sha256',
  hybrid_encryption: true, // Use RSA for key exchange, AES-256 for data
};

RSAEncryptionTrait.validate(rsaConfig);

// Generate Web code (uses WebCrypto API)
const webRSA = RSAEncryptionTrait.compile(rsaConfig, 'web');

// Generate Node.js code (uses crypto module)
const nodeRSA = RSAEncryptionTrait.compile(rsaConfig, 'node');

// Generate Unity code (uses System.Security.Cryptography)
const unityRSA = RSAEncryptionTrait.compile(rsaConfig, 'unity');
```

### High-Security RSA-4096

```typescript
const highSecurityConfig = {
  key_size: 4096,
  padding_scheme: 'oaep',
  hash_algorithm: 'sha512',
  hybrid_encryption: true,
  key_derivation: 'pbkdf2',
};

const secureCode = RSAEncryptionTrait.compile(highSecurityConfig, 'node');
```

---

## 3. PackageSigningTrait - Code Signing & Verification

### Ed25519 Signing (Recommended)

```typescript
import { PackageSigningTrait } from '@holoscript/core/traits/PackageSigningTrait';

const signingConfig = {
  signature_algorithm: 'ed25519',
  digest_algorithm: 'sha256',
  include_timestamp: true,
  signature_format: 'detached',
};

PackageSigningTrait.validate(signingConfig);

// Generate Web code (uses @noble/curves)
const webSigning = PackageSigningTrait.compile(signingConfig, 'web');

// Generate Node.js code
const nodeSigning = PackageSigningTrait.compile(signingConfig, 'node');
```

### Ethereum-Compatible Signing

```typescript
const ethereumConfig = {
  signature_algorithm: 'ecdsa_secp256k1',
  digest_algorithm: 'sha256',
  include_timestamp: true,
  chain_of_trust: true,
  code_signing_certificate: 'path/to/cert.pem',
};

// Generate Solidity smart contract for on-chain verification
const soliditySigning = PackageSigningTrait.compile(ethereumConfig, 'solidity');
```

---

## 4. ZeroKnowledgeProofTrait - Privacy-Preserving Proofs

### Groth16 zk-SNARK (Most Popular)

```typescript
import { ZeroKnowledgeProofTrait } from '@holoscript/core/traits/ZeroKnowledgeProofTrait';

const zkConfig = {
  proof_system: 'groth16',
  curve: 'bn254',
  trusted_setup_required: true,
  circuit_size: 1024,
  commitment_scheme: 'pedersen',
};

ZeroKnowledgeProofTrait.validate(zkConfig);

// Generate Web code (uses snarkjs)
const webZK = ZeroKnowledgeProofTrait.compile(zkConfig, 'web');

// Generate Solidity verifier contract
const solidityZK = ZeroKnowledgeProofTrait.compile(zkConfig, 'solidity');
```

### zk-STARKs (Quantum-Resistant)

```typescript
const starkConfig = {
  proof_system: 'zk_stark',
  trusted_setup_required: false, // No trusted setup!
  recursive_proof: true,
  batch_verification: true,
};

const quantumSafeProof = ZeroKnowledgeProofTrait.compile(starkConfig, 'web');
```

### PLONK (Universal Setup)

```typescript
const plonkConfig = {
  proof_system: 'plonk',
  curve: 'bls12_381',
  trusted_setup_required: true, // Universal, not circuit-specific
  commitment_scheme: 'poseidon',
};

const plonkProof = ZeroKnowledgeProofTrait.compile(plonkConfig, 'web');
```

---

## 5. HSMIntegrationTrait - Hardware Security Modules

### AWS CloudHSM Integration

```typescript
import { HSMIntegrationTrait } from '@holoscript/core/traits/HSMIntegrationTrait';

const awsHSMConfig = {
  provider: 'aws_cloudhsm',
  key_type: 'aes_256',
  fips_compliance: 'fips_140_2_level_3',
  auto_rotation: true,
  multi_region_replication: true,
  audit_logging: true,
};

HSMIntegrationTrait.validate(awsHSMConfig);

// Generate Node.js AWS SDK code
const awsCode = HSMIntegrationTrait.compile(awsHSMConfig, 'node');
```

### iOS/macOS Secure Enclave

```typescript
const secureEnclaveConfig = {
  provider: 'secure_enclave',
  key_type: 'ec_p256',
};

// Generate Swift CryptoKit code
const swiftCode = HSMIntegrationTrait.compile(secureEnclaveConfig, 'swift');
```

### TPM (Trusted Platform Module)

```typescript
const tpmConfig = {
  provider: 'tpm',
  key_type: 'rsa_2048',
};

// Generate C++ TSS2 ESAPI code
const cppCode = HSMIntegrationTrait.compile(tpmConfig, 'cpp');
```

---

## 6. SandboxExecutionTrait - Code Isolation

### WebAssembly Sandbox (Strictest Isolation)

```typescript
import { SandboxExecutionTrait } from '@holoscript/core/traits/SandboxExecutionTrait';

const wasmConfig = {
  sandbox_type: 'wasm',
  max_memory_mb: 128,
  max_execution_time_ms: 5000,
  permissions: {
    filesystem: 'none',
    network: 'none',
    environment: 'none',
  },
};

SandboxExecutionTrait.validate(wasmConfig);

// Generate Web WASM sandbox code
const wasmSandbox = SandboxExecutionTrait.compile(wasmConfig, 'web');
```

### Node.js VM Sandbox

```typescript
const vmConfig = {
  sandbox_type: 'vm',
  max_memory_mb: 512,
  max_execution_time_ms: 10000,
  max_cpu_percent: 50,
  permissions: {
    filesystem: 'read', // Read-only access
    network: 'restricted', // Whitelist only
    environment: 'none',
  },
  api_restrictions: ['eval', 'Function', 'child_process'],
  allow_native_modules: false,
};

const vmSandbox = SandboxExecutionTrait.compile(vmConfig, 'node');
```

### Container Sandbox (Docker)

```typescript
const containerConfig = {
  sandbox_type: 'container',
  max_memory_mb: 1024,
  max_cpu_percent: 50,
  permissions: {
    filesystem: 'read',
    network: 'restricted',
  },
};

// Generate Dockerfile
const dockerfile = SandboxExecutionTrait.compile(containerConfig, 'docker');
```

---

## 7. VulnerabilityScannerTrait - Security Validation

### Comprehensive Security Scan

```typescript
import { VulnerabilityScannerTrait } from '@holoscript/core/traits/VulnerabilityScannerTrait';

const scanConfig = {
  scan_types: [
    'static_analysis',
    'dependency_check',
    'composition_validation',
  ],
  severity_threshold: 'medium',
  fail_on_critical: true,
  enable_auto_fix: true,
  parallel_scans: true,
  max_scan_time_ms: 300000, // 5 minutes
  output_format: 'sarif',
};

VulnerabilityScannerTrait.validate(scanConfig);

// Generate Node.js scanner
const nodeScanner = VulnerabilityScannerTrait.compile(scanConfig, 'node');

// Generate GitHub Actions workflow
const ciWorkflow = VulnerabilityScannerTrait.compile(scanConfig, 'github-actions');
```

### CI/CD Integration

```typescript
const ciScanConfig = {
  scan_types: ['static_analysis', 'dependency_check'],
  severity_threshold: 'high',
  fail_on_critical: true,
  enable_auto_fix: false, // Manual review required
  exclude_patterns: ['node_modules', 'dist', '*.test.ts'],
};

// Generate GitHub Actions workflow YAML
const githubActions = VulnerabilityScannerTrait.compile(ciScanConfig, 'ci');
```

---

## Full-Stack Security Example

### Secure VR Application with All 7 Traits

```typescript
import {
  EncryptionTrait,
  RSAEncryptionTrait,
  PackageSigningTrait,
  ZeroKnowledgeProofTrait,
  HSMIntegrationTrait,
  SandboxExecutionTrait,
  VulnerabilityScannerTrait,
} from '@holoscript/core/traits';

// 1. Transport Security (TLS 1.3)
const tls = EncryptionTrait.compile({
  protocol: 'tls_1_3',
  cipher_suite: 'aes_256_gcm',
  key_exchange: 'ecdhe_x25519',
  perfect_forward_secrecy: true,
}, 'web');

// 2. Data Encryption (Hybrid RSA+AES)
const encryption = RSAEncryptionTrait.compile({
  key_size: 2048,
  padding_scheme: 'oaep',
  hash_algorithm: 'sha256',
  hybrid_encryption: true,
}, 'web');

// 3. Code Signing (Ed25519)
const signing = PackageSigningTrait.compile({
  signature_algorithm: 'ed25519',
  digest_algorithm: 'sha256',
  include_timestamp: true,
}, 'web');

// 4. Privacy (zk-SNARKs)
const privacy = ZeroKnowledgeProofTrait.compile({
  proof_system: 'groth16',
  curve: 'bn254',
}, 'web');

// 5. Key Management (AWS CloudHSM)
const keyManagement = HSMIntegrationTrait.compile({
  provider: 'aws_cloudhsm',
  key_type: 'aes_256',
  fips_compliance: 'fips_140_2_level_3',
  auto_rotation: true,
}, 'node');

// 6. Code Isolation (WASM Sandbox)
const sandbox = SandboxExecutionTrait.compile({
  sandbox_type: 'wasm',
  max_memory_mb: 128,
  permissions: { filesystem: 'none', network: 'none' },
}, 'web');

// 7. Security Validation (Comprehensive Scan)
const scanner = VulnerabilityScannerTrait.compile({
  scan_types: ['static_analysis', 'dependency_check', 'composition_validation'],
  fail_on_critical: true,
}, 'node');

console.log('✅ Complete secure VR application stack generated!');
```

---

## Best Practices

### 1. Always Validate Configurations

```typescript
// ✅ GOOD: Validate before compiling
try {
  EncryptionTrait.validate(config);
  const code = EncryptionTrait.compile(config, 'web');
} catch (error) {
  console.error('Invalid configuration:', error.message);
}

// ❌ BAD: Skip validation
const code = EncryptionTrait.compile(config, 'web'); // May fail at runtime
```

### 2. Use Recommended Algorithms

```typescript
// ✅ GOOD: Ed25519 for signing (fast, secure)
const signingConfig = { signature_algorithm: 'ed25519' };

// ⚠️ WARNING: PKCS#1 is deprecated
const oldConfig = { padding_scheme: 'pkcs1' }; // Triggers warning
```

### 3. Enable Security Features

```typescript
// ✅ GOOD: Enable all security features
const secureConfig = {
  perfect_forward_secrecy: true,
  certificate_pinning: true,
  ocsp_stapling: true,
  session_resumption: true,
};

// ❌ BAD: Disable security features
const insecureConfig = {
  perfect_forward_secrecy: false, // Throws error!
};
```

### 4. Fail on Critical Vulnerabilities

```typescript
// ✅ GOOD: Fail builds on critical issues
const scanConfig = {
  fail_on_critical: true,
  severity_threshold: 'medium',
};

// ⚠️ WARNING: May miss critical vulnerabilities
const lenientConfig = {
  fail_on_critical: false, // Triggers warning
};
```

---

## Platform-Specific Examples

### Unity VR Application

```typescript
const unitySecurityStack = {
  tls: EncryptionTrait.compile(tlsConfig, 'unity'),
  rsa: RSAEncryptionTrait.compile(rsaConfig, 'unity'),
  signing: PackageSigningTrait.compile(signingConfig, 'node'), // Build-time
  scanner: VulnerabilityScannerTrait.compile(scanConfig, 'ci'), // CI/CD
};

// Outputs C# code for Unity integration
```

### Web-Based VR (WebXR)

```typescript
const webXRSecurity = {
  tls: EncryptionTrait.compile(tlsConfig, 'web'),
  rsa: RSAEncryptionTrait.compile(rsaConfig, 'web'),
  zkProof: ZeroKnowledgeProofTrait.compile(zkConfig, 'web'),
  sandbox: SandboxExecutionTrait.compile(wasmConfig, 'web'),
};

// Outputs JavaScript/WebAssembly code
```

### Blockchain-Based VR

```typescript
const web3VRSecurity = {
  signing: PackageSigningTrait.compile(ethereumConfig, 'solidity'),
  zkProof: ZeroKnowledgeProofTrait.compile(zkConfig, 'solidity'),
};

// Outputs Solidity smart contracts for on-chain verification
```

---

## Troubleshooting

### Common Validation Errors

```typescript
// Error: "RSA key size must be at least 2048 bits"
const badConfig = { key_size: 1024 }; // Too small!
// Fix: Use 2048, 3072, or 4096

// Error: "Perfect forward secrecy is required"
const badTLS = { perfect_forward_secrecy: false };
// Fix: Set to true

// Error: "Chain of trust requires code signing certificate"
const badSigning = { chain_of_trust: true }; // Missing certificate
// Fix: Add code_signing_certificate field

// Error: "At least one scan type must be specified"
const badScan = { scan_types: [] };
// Fix: Add scan types array
```

---

## Performance Optimization

### Parallel Scanning

```typescript
const fastScan = {
  scan_types: ['static_analysis', 'dependency_check'],
  parallel_scans: true, // 2x faster!
};
```

### Hybrid Encryption for Large Files

```typescript
const largeFileConfig = {
  hybrid_encryption: true, // RSA for key, AES for data
  // Much faster than pure RSA for files > 100KB
};
```

### Session Resumption

```typescript
const quickReconnect = {
  session_resumption: true, // Skip full TLS handshake
  // 50% faster reconnection
};
```

---

**Status**: 🎉 All 7 security traits fully documented with usage examples!
