/**
 * @holoscript/mvc-schema - TypeScript types
 *
 * Minimal Viable Context (MVC) types for cross-reality agent state.
 * All 5 MVC objects with CRDT-compatible schemas, targeting <10KB total.
 *
 * @packageDocumentation
 */

// DecisionHistory (G-Set CRDT)
export type { DecisionEntry, DecisionHistory, DecisionHistoryMetadata } from './DecisionHistory';

// ActiveTaskState (OR-Set + LWW-Register hybrid)
export type {
  TaskEntry,
  TaskStatus,
  TaskPriority,
  TaskStatusUpdate,
  ActiveTaskState,
  ActiveTaskStateMetadata,
} from './ActiveTaskState';

// UserPreferences (LWW-Map)
export type {
  SpatialPreferences,
  CommunicationPreferences,
  VisualPreferences,
  PrivacyPreferences,
  LWWValue,
  UserPreferences,
  UserPreferencesMetadata,
} from './UserPreferences';

// SpatialContextSummary (LWW + G-Set hybrid)
export type {
  WGS84Coordinate,
  SpatialAnchor,
  AgentPose,
  EnvironmentalContext,
  SpatialContextSummary,
  SpatialContextMetadata,
} from './SpatialContextSummary';

// EvidenceTrail (VCP v1.1 hash chain)
export type {
  EvidenceEntry,
  EvidenceType,
  HashAlgorithm,
  VCPMetadata,
  ChainVerificationResult,
  EvidenceTrail,
  EvidenceTrailMetadata,
} from './EvidenceTrail';

// Import types for union types
import type { DecisionHistory, DecisionHistoryMetadata } from './DecisionHistory';
import type { ActiveTaskState, ActiveTaskStateMetadata } from './ActiveTaskState';
import type { UserPreferences, UserPreferencesMetadata } from './UserPreferences';
import type { SpatialContextSummary, SpatialContextMetadata } from './SpatialContextSummary';
import type { EvidenceTrail, EvidenceTrailMetadata } from './EvidenceTrail';

/**
 * Complete MVC object union type
 */
export type MVCObject =
  | DecisionHistory
  | ActiveTaskState
  | UserPreferences
  | SpatialContextSummary
  | EvidenceTrail;

/**
 * MVC object type discriminator
 */
export type MVCType =
  | 'decision-history'
  | 'task-state'
  | 'preferences'
  | 'spatial-context'
  | 'evidence-trail';

/**
 * MVC metadata union type
 */
export type MVCMetadata =
  | DecisionHistoryMetadata
  | ActiveTaskStateMetadata
  | UserPreferencesMetadata
  | SpatialContextMetadata
  | EvidenceTrailMetadata;
