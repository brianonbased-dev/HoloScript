/**
 * @holoscript/snn-webgpu - Prophetic GI public surface
 *
 * Re-exports the prophetic GI types and transports.  Mirrors the
 * pattern used by `neural-activity/index.ts` so consumers can do:
 *
 *   import { LocalProphecyTransport } from '@holoscript/snn-webgpu';
 *
 * once the parent index re-exports this module.
 */

export type {
  RadianceProbe,
  ProphecyFrame,
  ProphecyConfig,
  ProphecySceneContext,
  ProphecyTransport,
} from './types.js';

export { ProphecyNotImplementedError } from './types.js';

export { ProphecyOrchestrator } from './orchestrator.js';

export {
  LocalProphecyTransport,
  type LocalProphecyTransportOptions,
  type SpikeRateProvider,
} from './transport-local.js';

export {
  HoloMeshProphecyTransport,
  resolveTtuEndpoint,
  type HoloMeshProphecyTransportOptions,
} from './transport-holomesh.js';
