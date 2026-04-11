import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface EEGStreamConfig { streamId: string; channels: string[]; sampleRateHz: number; running: boolean }

export const eegStreamHandler: TraitHandler<EEGStreamConfig> = {
  name: 'eeg_stream',
  defaultConfig: { streamId: '', channels: [], sampleRateHz: 256, running: false },
  onAttach(node: HSPlusNode, config: EEGStreamConfig, ctx: TraitContext): void {
    ctx.emit?.('eeg_stream:attached', { nodeId: node.id, streamId: config.streamId, channels: config.channels.length });
  },
  onEvent(node: HSPlusNode, config: EEGStreamConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'eeg_stream:start') {
      config.running = true;
      ctx.emit?.('eeg_stream:started', { nodeId: node.id, streamId: config.streamId, sampleRateHz: config.sampleRateHz });
    }
    if (event.type === 'eeg_stream:stop') {
      config.running = false;
      ctx.emit?.('eeg_stream:stopped', { nodeId: node.id, streamId: config.streamId });
    }
  },
};

export const EEG_STREAM_TRAIT = {
  name: 'eeg_stream',
  category: 'neuroscience',
  description: 'Handles EEG channel stream lifecycle and metadata.',
};
