/**
 * HoloMap reconstruction runtime barrel.
 *
 * See RFC-HoloMap.md for architecture and Sprint plan.
 */

export * from './HoloMapRuntime';
export * from './FusedAttentionKernel';
export * from './PagedKVCache';
export * from './TrajectoryMemory';
export * from './AnchorContext';
export * from './replayFingerprint';
export * from './contractConstants';
export * from './simulationContractBinding';
export * from './holoMapTelemetry';
export * from './webgpuGate';
export * from './holoMapWeightLoader';
export { getCachedWeightBlob, putCachedWeightBlob } from './holoMapWeightCache';
export * from './holoMapAnchoredManifest';
export * from './mobileSensorBundle';
// Sprint-2 E2E + CPU-parity gate needs the micro-encoder entry points
// (GPU device factory + CPU reference) to assert pipeline parity.
// See packages/holomap/src/__tests__/HoloMapE2EParityGate.test.ts.
export {
  runHoloMapMicroEncoderCpu,
  tryCreateHoloMapEncoderDevice,
  createHoloMapMicroEncoder,
  frameToMicroImage,
  serializeMicroWeights,
  deserializeMicroWeights,
  type HoloMapMicroEncoder,
  type HoloMapMicroFrame,
  type HoloMapMicroConfig,
  type HoloMapMicroWeights,
} from './holoMapMicroEncoder';

// @cross_perceiver_contract — perceiver-consensus receipt + per-artifact
// derivations (consumed by the verify_cross_perceiver MCP tool and the
// scripts/holo-ci/check-cross-perceiver.mjs gate).
export * from './PerceiverConsensusReceipt';
export * from './webgpuPerceiverDerivation';
export * from './agentInferencePerceiverDerivation';
export * from './urdfPerceiverDerivation';

// @verified_view — make agent-authored 2D surfaces provenance-complete so they
// route through the Native2DCompiler @verified_view gate by default (Slice 4 consumer).
export {
  enforceVerifiedViewReceipts,
  isProvenanceComplete,
  diagnoseVerifiedView,
  derivedProjectionNode,
} from './enforceVerifiedViewReceipts';
export type {
  VerifiedViewViolationReason,
  VerifiedViewViolation,
  VerifiedViewDiagnosis,
} from './enforceVerifiedViewReceipts';
