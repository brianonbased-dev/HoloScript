/**
 * @eeg_stream Trait — EEG signal streaming (10-20 system)
 * @trait eeg_stream
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type FrequencyBand = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma' | 'high_gamma';
export interface EEGStreamConfig { channels: string[]; samplingRate: number; epochLengthMs: number; frequencyBands: FrequencyBand[]; artifactRejection: boolean; notchFilter: number | null; }
export interface EEGStreamState { isStreaming: boolean; samplesCollected: number; currentEpoch: number; bandPowers: Record<string, number>; }

const defaultConfig: EEGStreamConfig = { channels: ['Fp1','Fp2','F3','F4','C3','C4','P3','P4','O1','O2'], samplingRate: 256, epochLengthMs: 1000, frequencyBands: ['delta','theta','alpha','beta','gamma'], artifactRejection: true, notchFilter: 60 };

export function createEEGStreamHandler(): TraitHandler<EEGStreamConfig> {
  return {
    name: 'eeg_stream',
    defaultConfig,
    onAttach(node: HSPlusNode, config: EEGStreamConfig, ctx: TraitContext) {
      const bandPowers: Record<string, number> = {};
      for (const b of config.frequencyBands) bandPowers[b] = 0;
      node.__eegState = { isStreaming: false, samplesCollected: 0, currentEpoch: 0, bandPowers };
      ctx.emit?.('eeg_stream:attached', { channels: config.channels.length, rate: config.samplingRate });
    },
    onDetach(node: HSPlusNode, _c: EEGStreamConfig, ctx: TraitContext) { delete node.__eegState; ctx.emit?.('eeg_stream:detached'); },
    onUpdate(node: HSPlusNode, config: EEGStreamConfig, ctx: TraitContext, delta: number) {
      const s = node.__eegState as EEGStreamState | undefined;
      if (!s?.isStreaming) return;
      s.samplesCollected += Math.round(config.samplingRate * (delta / 1000));
      const samplesPerEpoch = config.samplingRate * (config.epochLengthMs / 1000);
      if (s.samplesCollected >= samplesPerEpoch) { s.currentEpoch++; s.samplesCollected = 0; ctx.emit?.('eeg_stream:epoch', { epoch: s.currentEpoch, bandPowers: s.bandPowers }); }
    },
    onEvent(node: HSPlusNode, _c: EEGStreamConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__eegState as EEGStreamState | undefined;
      if (!s) return;
      if (event.type === 'eeg_stream:start') { s.isStreaming = true; ctx.emit?.('eeg_stream:started'); }
      if (event.type === 'eeg_stream:stop') { s.isStreaming = false; ctx.emit?.('eeg_stream:stopped'); }
    },
  };
}
