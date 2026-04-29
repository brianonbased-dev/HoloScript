/**
 * Hot-Reload Pipeline — public exports.
 *
 * @package @holoscript/studio
 */

export { diffScenes, type DiffResult } from './SceneDiffer';
export { HoloFileWatcher, type HoloFileWatcherOptions, type WatchEventType } from './HoloFileWatcher';
export {
  HotReloadPipeline,
  type HotReloadPipelineOptions,
  type PipelineParseResult,
  type LiveUpdateHandler,
} from './HotReloadPipeline';
export {
  createMutationBatch,
  createFullScene,
  serializeMessage,
  deserializeMessage,
  makeBatchId,
  type LiveUpdateMessage,
  type MutationBatchMessage,
  type FullSceneMessage,
  type PingMessage,
  type PongMessage,
  type ErrorMessage,
} from './LiveUpdateProtocol';
export {
  BroadcastChannelTransport,
  WebSocketTransport,
  EventTargetTransport,
  createTransport,
  type Transport,
  type TransportFactoryOptions,
  type WebSocketTransportOptions,
} from './LiveUpdateTransport';
export { useHotReload, type UseHotReloadOptions, type UseHotReloadResult } from './useHotReload';
