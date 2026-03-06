/**
 * Security & Cryptography Traits
 *
 * Comprehensive security features including encryption, cryptographic primitives,
 * code signing, zero-knowledge proofs, HSM integration, sandboxing, and vulnerability scanning.
 *
 * Covers 35+ security traits for enterprise-grade secure XR applications.
 */
export const SECURITY_CRYPTO_TRAITS = [
  // Encryption & Transport Security
  'encryption',
  'tls_1_3',
  'tls_1_2',
  'dtls',
  'quic',
  'end_to_end_encryption',
  'aes_256',
  'aes_128',
  'chacha20_poly1305',
  'perfect_forward_secrecy',
  'certificate_pinning',
  'ocsp_stapling',
  'session_resumption',

  // Public Key Cryptography
  'rsa_encryption',
  'rsa_2048',
  'rsa_3072',
  'rsa_4096',
  'oaep_padding',
  'pkcs1_padding',
  'pss_padding',
  'hybrid_encryption',
  'key_derivation',

  // Code Signing & Verification
  'package_signing',
  'ed25519_signing',
  'ecdsa_signing',
  'ecdsa_p256',
  'ecdsa_secp256k1',
  'signature_verification',
  'timestamp_authority',
  'chain_of_trust',
  'detached_signature',
  'embedded_signature',

  // Zero-Knowledge Proofs
  'zero_knowledge_proof',
  'zk_snark',
  'zk_stark',
  'groth16',
  'plonk',
  'bulletproofs',
  'bn254_curve',
  'bls12_381_curve',
  'recursive_proof',
  'batch_verification',
  'pedersen_commitment',
  'poseidon_hash',

  // Hardware Security Modules
  'hsm_integration',
  'aws_cloudhsm',
  'azure_key_vault',
  'google_cloud_hsm',
  'tpm_module',
  'secure_enclave',
  'fips_140_2',
  'fips_140_3',
  'common_criteria',
  'key_rotation',
  'multi_region_key',

  // Code Sandboxing
  'sandbox_execution',
  'vm_sandbox',
  'wasm_sandbox',
  'iframe_sandbox',
  'worker_sandbox',
  'container_sandbox',
  'isolate_sandbox',
  'resource_limits',
  'permission_system',
  'api_restriction',

  // Vulnerability Scanning
  'vulnerability_scanner',
  'static_analysis',
  'dynamic_analysis',
  'dependency_check',
  'composition_validation',
  'penetration_test',
  'code_injection_detection',
  'xss_detection',
  'secret_detection',
  'owasp_top_10',
  'cwe_mapping',
  'cvss_scoring',
  'sarif_output',
] as const;
