/**
 * Security Module Exports
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */

// Crypto utilities (Sprint 3)
export {
  // Hashing
  sha256,
  sha512,
  hmacSha256,
  verifyHmacSha256,

  // Encryption
  encrypt,
  decrypt,
  generateEncryptionKey,
  exportKey,
  importKey,

  // Random
  randomBytes,
  randomHex,
  randomUUID,

  // Key Derivation
  deriveKey,

  // Validation
  validateWalletAddress,
  validateApiKey,
  sanitizeInput,
  validateUrl,

  // Rate Limiting
  checkRateLimit,
  resetRateLimit,
} from './crypto';

// Security Policy (Sprint 9)
export { createDefaultPolicy, createStrictPolicy, mergePolicy } from './SecurityPolicy';
export type { SecurityPolicy, FileSystemAccess, DeepPartial } from './SecurityPolicy';

// Security Enforcer (Sprint 9)
export { validateComposition, validateImports, scanForVulnerabilities } from './SecurityEnforcer';
export type {
  SecurityViolation,
  SecurityScanResult,
  ViolationSeverity,
  ViolationCategory,
  ASTNode,
  ImportDeclaration,
} from './SecurityEnforcer';

// Package Signer (Sprint 9)
export {
  generateKeyPair,
  signPackage,
  verifySignature,
  createPackageManifest,
  canonicalizeManifest,
} from './PackageSigner';
export type { Ed25519KeyPair, PackageManifest, SignedPackage } from './PackageSigner';

// Sandbox Executor (Sprint 9)
export {
  createSandbox,
  execute as executeSandbox,
  destroy as destroySandbox,
} from './SandboxExecutor';
export type { Sandbox, SandboxState, SandboxExecutionResult } from './SandboxExecutor';
