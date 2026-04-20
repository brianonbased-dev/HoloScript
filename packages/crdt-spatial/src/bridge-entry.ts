/**
 * Lightweight entry — Strategy C spatial bridge + types only.
 * Avoids pulling MeshNodeIntegrator / framework economy peers.
 */

export type {
  Vec3,
  Quaternion,
  SpatialTransform,
  SpatialCRDTBridgeConfig,
  EulerDelta,
} from './types.js';

export {
  SpatialCRDTBridge,
  quaternionMultiply,
  normalizeQuaternion,
  eulerToQuaternion,
  computeEffectiveRotation,
} from './SpatialCRDTBridge.js';
