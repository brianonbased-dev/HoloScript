/**
 * @holoscript/crdt-spatial
 *
 * Loro CRDT-based spatial transform synchronization for HoloScript.
 * Implements Strategy C hybrid rotation handling:
 * - Base quaternion: LWW via LoroMap (explicit placement / checkpoint)
 * - Delta yaw/pitch/roll: LoroCounter (commutative additive rotation)
 * - Periodic checkpoint: collapses deltas into base quaternion every 30s
 *
 * @packageDocumentation
 */

// Core types
export type {
  Vec3,
  Quaternion,
  EulerDelta,
  SpatialTransform,
  HybridRotationState,
  HybridSpatialState,
  SpatialCRDTBridgeConfig,
  WebSocketProviderConfig,
  AwarenessState,
  SyncMessage,
  UseSpatialSyncOptions,
  UseSpatialSyncReturn,
} from './types.js';

export {
  ConnectionState,
  SyncMessageType,
  DEFAULT_BRIDGE_CONFIG,
  DEFAULT_WS_CONFIG,
  IDENTITY_QUATERNION,
  IDENTITY_TRANSFORM,
  ZERO_VEC3,
  ONE_VEC3,
} from './types.js';

// SpatialCRDTBridge - Strategy C hybrid rotation CRDT
export {
  SpatialCRDTBridge,
  quaternionMultiply,
  normalizeQuaternion,
  eulerToQuaternion,
  computeEffectiveRotation,
} from './SpatialCRDTBridge.js';

/** CRDT-02 — safe numeric coercion for Loro map/counter reads */
export { coerceCounterValue, coerceFiniteNumber } from './loroCoercion.js';

// LoroWebSocketProvider - WebSocket sync transport
export { LoroWebSocketProvider } from './LoroWebSocketProvider.js';
export { LoroWebRTCProvider } from './LoroWebRTCProvider.js';
export { MeshNodeIntegrator } from './MeshNodeIntegrator.js';
export {
  ECONOMIC_TRAIT_NAMES,
  isEconomicTraitName,
  loroBatchTouchesEconomicTrait,
  loroEventTouchesEconomicTrait,
  type EconomicTraitName,
} from './loroSpatialTraitEvents.js';
export {
  FILM3D_VOLUMETRICS_ROOT,
  MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES,
  isWithinVolumetricWebRtcSyncBudget,
  ensureFilm3dVolumetricsRoot,
  registerVolumetricNode,
  setVolumetricChunk,
  setVolumetricVoxelPayload,
  unregisterVolumetricNode,
} from './film3dVolumetricCrdt.js';
export {
  LEGAL_DOCUMENT_CONTRACTS_ROOT,
  ensureLegalDocumentContractsRoot,
  setLegalSignatureBlock,
  appendLegalAuditTrailEntry,
  setLegalContractSnapshot,
  readLegalContractSnapshot,
  unregisterLegalContract,
  type SignatureBlockSnapshot,
  type SignatureWitnessSnapshot,
  type AuditTrailEntrySnapshot,
  type LegalContractSpatialSnapshot,
} from './legalDocumentCrdt.js';

// WorldState - Full world state CRDT document (objects, terrain, NPC memory, inventory)
export {
  WorldState,
  type ObjectState,
  type NPCMemoryEntry,
  type InventoryItem,
  type VersionEntry,
  type WorldMetadata,
} from './WorldState.js';

// React hook for R3F integration (requires React as peer dependency)
export { useSpatialSync } from './useSpatialSync.js';
