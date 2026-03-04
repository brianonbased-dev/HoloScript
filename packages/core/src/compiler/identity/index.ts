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
  type CapabilityTokenOptions,
  type HybridTokenResult,
  type DelegationRequest,
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
  type DIDVersion,
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

  // Functions — DID v1 (legacy)
  generateAgentDID,
  extractRoleFromDID,

  // Functions — DID v2 (role-agnostic)
  generateAgentDIDv2,
  detectDIDVersion,
  getDIDv2,
  migratePassportToV2,

  // Functions — UCAN delegation
  getCapabilities,
  addDelegation,

  // Functions — common
  createDIDDocument,
  createAgentPassport,
  signPassport,
  verifyPassportSignature,
  isPassportExpired,
  validatePassport,
  createEmptyStateSnapshot,
  createEmptyMemory,
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

// UCAN Capability Token interfaces and constants
export {
  // Interfaces
  type Capability,
  type CapabilitySemantics,
  type CapabilityTokenHeader,
  type CapabilityTokenPayload,
  type CapabilityToken,
  type DelegationLink,
  type AttenuationChain,
  type CapabilityVerificationResult,
  type RootTokenOptions,
  type DelegationOptions,

  // Constants
  HOLOSCRIPT_RESOURCE_SCHEME,
  HOLOSCRIPT_RESOURCE_ALL,
  CapabilityActions,
  PERMISSION_TO_ACTION,
  ACTION_TO_PERMISSION,

  // Type
  type CapabilityAction,
} from './CapabilityToken';

// UCAN Capability Token Issuer
export {
  type CapabilityTokenIssuerConfig,
  HoloScriptCapabilitySemantics,
  CapabilityTokenIssuer,
  getCapabilityTokenIssuer,
  resetCapabilityTokenIssuer,
} from './CapabilityTokenIssuer';

// Capability-Aware RBAC Adapter (dual-mode: JWT RBAC + UCAN)
export {
  type CapabilityAccessDecision,
  type CapabilityAccessRequest,
  type CapabilityRBACConfig,
  CapabilityRBAC,
  getCapabilityRBAC,
  resetCapabilityRBAC,
} from './CapabilityRBAC';

// Agent Namespace Schema (ANS) — capability namespace constants for all compilers
export {
  // Domain constants
  ANSDomain,
  type ANSDomainValue,

  // Risk tier constants
  RiskTier,
  type RiskTierValue,
  DOMAIN_RISK_TIERS,

  // Compiler name union type
  type CompilerName,

  // ANS capability paths
  ANS_PREFIX,
  ANSCapabilityPath,
  type ANSCapabilityPathValue,

  // Mapping tables
  COMPILER_DOMAIN_MAP,
  COMPILER_ANS_MAP,
  ALL_COMPILER_NAMES,
  ALL_DOMAINS,

  // Helper functions
  getNamespaceForCompiler,
  getDomainForCompiler,
  getRiskTierForDomain,
  getRiskTierForCompiler,
  getAllCompilersInDomain,
  getAllCompilersWithRiskTier,
  getAllDomainsWithRiskTier,
  isValidCompilerName,
  isValidDomain,
  parseANSPath,
  buildANSPath,
  getANSSummary,
} from './ANSNamespace';

// Hybrid Crypto Provider (Post-Quantum Phase 2 — real ML-DSA-65 support)
export {
  // Types
  type SignatureAlgorithm,
  type CryptoKeyPair,
  type HybridKeyPair,
  type CompositeSignature,
  type CompositeVerificationResult,

  // Interfaces
  type ICryptoProvider,

  // Classes
  Ed25519CryptoProvider,
  MLDSACryptoProvider,
  HybridCryptoProvider,

  // Factory
  createCryptoProvider,

  // Utilities
  isPostQuantumAvailable,
} from './HybridCryptoProvider';
