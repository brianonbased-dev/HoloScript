/**
 * @holoscript/core/world — barrel exports
 */

export {
  WorldAdapterRegistry,
  worldAdapterRegistry,
  type WorldGeneratorAdapter,
  type WorldGenerationRequest,
  type WorldGenerationResult,
  type WorldMetadata,
} from './WorldGeneratorAdapter';

export { HYWorldAdapter, type HYWorldAdapterOptions } from './adapters/HYWorldAdapter';

export {
  WorldGeneratorService,
  worldGeneratorService,
  type WorldGenerateEvent,
  type WorldGenerationStartedEvent,
  type WorldGenerationProgressEvent,
  type WorldGenerationCompleteEvent,
  type WorldGenerationErrorEvent,
  type WorldEventEmitter,
} from './WorldGeneratorService';
