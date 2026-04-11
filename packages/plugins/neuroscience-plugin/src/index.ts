export { brainRegionHandler, BRAIN_REGION_TRAIT } from './traits/BrainRegionTrait';
export type { BrainRegionConfig } from './traits/BrainRegionTrait';

export { connectomeHandler, CONNECTOME_TRAIT } from './traits/ConnectomeTrait';
export type { ConnectomeConfig, ConnectomeEdge } from './traits/ConnectomeTrait';

export { eegStreamHandler, EEG_STREAM_TRAIT } from './traits/EEGStreamTrait';
export type { EEGStreamConfig } from './traits/EEGStreamTrait';

export type { HSPlusNode, TraitContext, TraitEvent, TraitHandler, BrainHemisphere } from './traits/types';

import { brainRegionHandler } from './traits/BrainRegionTrait';
import { connectomeHandler } from './traits/ConnectomeTrait';
import { eegStreamHandler } from './traits/EEGStreamTrait';
import type { TraitHandler } from './traits/types';

export const NEUROSCIENCE_TRAITS: TraitHandler<any>[] = [brainRegionHandler, connectomeHandler, eegStreamHandler];

export function registerNeurosciencePlugin(runtime: unknown): void {
  const rt = runtime as { registerTrait?: (handler: TraitHandler<any>) => void };
  if (typeof rt.registerTrait !== 'function') {
    throw new Error('registerNeurosciencePlugin requires runtime.registerTrait(handler)');
  }
  for (const handler of NEUROSCIENCE_TRAITS) rt.registerTrait(handler);
}

export const NEUROSCIENCE_KEYWORDS = [
  { term: 'brain region', traits: ['brain_region'], spatialRole: 'region' },
  { term: 'connectome', traits: ['connectome'], spatialRole: 'graph' },
  { term: 'eeg', traits: ['eeg_stream'], spatialRole: 'stream' },
];

export const VERSION = '1.0.0';
