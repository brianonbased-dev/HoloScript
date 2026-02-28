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
