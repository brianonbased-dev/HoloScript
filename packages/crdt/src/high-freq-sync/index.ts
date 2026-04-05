/**
 * Sync Module Exports
 *
 * @version 3.3.0
 * @sprint Sprint 2: Performance Optimization
 */

export {
  // Types
  type QuantizedPosition,
  type CompressedQuaternion,
  type HighFrequencyUpdate,
  type InterpolationSample,
  type HighFrequencySyncStats,

  // Utilities
  quantizePosition,
  dequantizePosition,
  compressQuaternion,
  decompressQuaternion,

  // Classes
  PriorityScheduler,
  JitterBuffer,

  // Factories
  createPriorityScheduler,
  createJitterBuffer,
} from './HighFrequencySync';
