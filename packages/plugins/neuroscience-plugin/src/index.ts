export { createBrainRegionHandler, type BrainRegionConfig, type BrainRegionState } from './traits/BrainRegionTrait';
export { createConnectomeHandler, type ConnectomeConfig, type ConnectomeEdge } from './traits/ConnectomeTrait';
export { createEEGStreamHandler, type EEGStreamConfig, type EEGStreamState, type FrequencyBand } from './traits/EEGStreamTrait';
export * from './traits/types';

import { createBrainRegionHandler } from './traits/BrainRegionTrait';
import { createConnectomeHandler } from './traits/ConnectomeTrait';
import { createEEGStreamHandler } from './traits/EEGStreamTrait';

export const pluginMeta = { name: '@holoscript/plugin-neuroscience', version: '1.0.0', traits: ['brain_region', 'connectome', 'eeg_stream'] };
export const traitHandlers = [createBrainRegionHandler(), createConnectomeHandler(), createEEGStreamHandler()];
