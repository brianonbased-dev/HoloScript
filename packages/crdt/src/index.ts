/**
 * @holoscript/crdt - Authenticated CRDTs for distributed agent state
 *
 * Provides conflict-free replicated data types with:
 * - DID-based cryptographic signing
 * - AgentRBAC permission integration
 * - WebRTC peer-to-peer synchronization
 * - Tamper-proof operation logs
 *
 * @packageDocumentation
 */

// Authentication
export {
  DIDSigner,
  createTestSigner,
  type DIDSignerConfig,
  type CRDTOperation,
  type SignedOperation,
  type VerificationResult,
  CRDTOperationType,
} from './auth/DIDSigner';

export { OperationLog, type OperationLogConfig, type LogEntry } from './auth/OperationLog';

export {
  RBACConflictResolver,
  MockPermissionChecker,
  type AgentRole,
  type PermissionChecker,
  type ConflictResolution,
  AgentPermissionLevel,
  ConflictStrategy,
} from './auth/RBACConflictResolver';

// CRDT types
export { LWWRegister, type LWWValue } from './types/LWWRegister';

export { ORSet } from './types/ORSet';

export { GCounter } from './types/GCounter';

// Synchronization
export {
  WebRTCSync,
  type SyncMessage,
  type SyncEventHandlers,
  type SyncRequestPayload,
  type SyncResponsePayload,
  type OperationPayload,
  SyncMessageType,
  PeerState,
} from './sync/WebRTCSync';

