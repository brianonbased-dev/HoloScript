export { createBrainRegionHandler, type BrainRegionConfig, type BrainRegionState } from './traits/BrainRegionTrait';
export { createConnectomeHandler, type ConnectomeConfig, type ConnectomeEdge } from './traits/ConnectomeTrait';
export { createEEGStreamHandler, type EEGStreamConfig, type EEGStreamState, type FrequencyBand } from './traits/EEGStreamTrait';
export * from './traits/types';

import { createBrainRegionHandler } from './traits/BrainRegionTrait';
import { createConnectomeHandler } from './traits/ConnectomeTrait';
import { createEEGStreamHandler } from './traits/EEGStreamTrait';

export * from './neurosolver';

export const pluginMeta = { name: '@holoscript/plugin-neuroscience', version: '1.0.0', traits: ['brain_region', 'connectome', 'eeg_stream', 'hh_neuron_solver', 'wilson_cowan_solver', 'lif_neuron', 'eeg_band_power', 'connectivity_metrics'] };
export const traitHandlers = [createBrainRegionHandler(), createConnectomeHandler(), createEEGStreamHandler()];

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic Leaky Integrate-and-Fire solver into HoloScriptRuntime's
// dispatch. Closes the built-but-dead-wired gap for `lif_neuron`, mirroring
// government-civic's `civic_decision` reference integration.
export {
  NEUROSCIENCE_PLUGIN_ID,
  lifNeuronHandler,
  registerNeuroscienceTraitHandlers,
  type LifNeuronTraitConfig,
  type LifNeuronSolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';
