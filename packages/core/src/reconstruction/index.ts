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
export * from './holoMapAnchoredManifest';
// Sprint-2 E2E + CPU-parity gate needs the micro-encoder entry points
// (GPU device factory + CPU reference) to assert pipeline parity.
// See packages/holomap/src/__tests__/HoloMapE2EParityGate.test.ts.
export {
  runHoloMapMicroEncoderCpu,
  tryCreateHoloMapEncoderDevice,
  createHoloMapMicroEncoder,
  frameToMicroImage,
  type HoloMapMicroEncoder,
  type HoloMapMicroFrame,
  type HoloMapMicroConfig,
} from './holoMapMicroEncoder';
