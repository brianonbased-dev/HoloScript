/**
 * HoloScript Compiler Agent Identity Framework
 *
 * Complete cryptographic identity system for multi-agent compiler architecture.
 *
 * @module @holoscript/core/compiler/identity
 * @version 1.0.0
 */

// Core identity types and utilities
export {
  // Enums
  AgentRole,
  AgentPermission,
  WorkflowStep,

  // Interfaces
  type AgentConfig,
  type AgentChecksum,
  type AgentKeyPair,
  type IntentTokenPayload,

  // Functions
  calculateAgentChecksum,
  generateAgentKeyPair,
  getDefaultPermissions,
  hasPermission,
  canPerformOperation,
  isValidWorkflowTransition,

  // Constants
  ROLE_PERMISSIONS,
  WORKFLOW_SEQUENCES,
} from './AgentIdentity';

// Keystore for credential management
export {
  type EncryptedCredential,
  type AgentCredential,
  type KeystoreConfig,
  type AuditLogEntry,
  AgentKeystore,
  getKeystore,
  resetKeystore,
} from './AgentKeystore';

// Token issuer and verifier
export {
  type TokenIssuerConfig,
  type TokenRequest,
  type TokenVerificationResult,
  AgentTokenIssuer,
  getTokenIssuer,
  resetTokenIssuer,
} from './AgentTokenIssuer';

// RBAC enforcer
export {
  type ResourceType,
  type AccessDecision,
  type ResourceAccessRequest,
  AgentRBAC,
  getRBAC,
  resetRBAC,
} from './AgentRBAC';

// Proof-of-Possession (PoP) HTTP Message Signatures
export {
  type SignatureComponents,
  type SignatureMetadata,
  type HTTPSignature,
  type SignatureVerificationResult,
  generateNonce,
  calculateContentDigest,
  constructSignatureBase,
  signRequest,
  verifySignature,
  derivePublicKey,
  formatSignatureHeaders,
  parseSignatureHeaders,
} from './AgentPoP';

// PoP middleware (Express-compatible)
export {
  type HttpRequest,
  type HttpResponse,
  type NextFunction,
  type PopMiddlewareConfig,
  type AuthenticatedRequest,
  createPopMiddleware,
  requirePermission,
  requireWorkflowStep,
} from './PopMiddleware';

// PoP utility functions
export {
  serializeComponent,
  validateComponents,
  extractComponentsFromRequest,
  buildSignatureParams,
  parseSignatureParams,
  normalizeHeaderName,
  extractNonce,
  hasSignatureHeaders,
  formatSignatureError,
} from './PopUtils';

// Per-package permission manifest
export {
  PackageTier,
  type PackagePermission,
  PACKAGE_PERMISSION_MANIFEST,
  PACKAGE_PERMISSIONS_BY_NAME,
  PACKAGE_PERMISSIONS_BY_PATH,
  getPackagesByTier,
  getWritablePackages,
  getSecretHandlingPackages,
  getNetworkAccessPackages,
  getManifestSummary,
} from './PackagePermissionManifest';

// Package scope enforcer
export {
  type ScopeDecision,
  type ScopeAuditEntry,
  type ScopeEnforcerConfig,
  PackageScopeEnforcer,
  getScopeEnforcer,
  resetScopeEnforcer,
} from './PackageScopeEnforcer';

// Agent commit signing
export {
  type CodeChange,
  type AgentCommitMetadata,
  type CommitVerificationResult,
  AgentCommitSigner,
  getCommitSigner,
  resetCommitSigner,
} from './AgentCommitSigner';

// Agent Passport (W3C DID + WAL + W/P/G memory)
export {
  // Constants
  PASSPORT_MAGIC,
  PASSPORT_FORMAT_VERSION,
  MAX_PASSPORT_SIZE,

  // Enums
  PassportSection,
  MemoryEntryType,
  WALOperation,

  // Types
  type AgentDIDDocument,
  type DIDVerificationMethod,
  type DIDServiceEndpoint,
  type WALEntry,
  type AgentStateSnapshot,
  type CompressedWisdom,
  type CompressedPattern,
  type CompressedGotcha,
  type CompressedMemory,
  type AgentPassport,
  type CreatePassportOptions,

  // Functions
  generateAgentDID,
  createDIDDocument,
  createAgentPassport,
  signPassport,
  verifyPassportSignature,
  isPassportExpired,
  validatePassport,
  createEmptyStateSnapshot,
  createEmptyMemory,
  extractRoleFromDID,
  estimatePassportSize,
} from './AgentPassport';

// Agent Passport Binary Serializer
export {
  // Enums
  PassportFlags,

  // Functions
  serializePassport,
  deserializePassport,
  calculateSizeReduction,
  isPassportBinary,
} from './AgentPassportSerializer';
