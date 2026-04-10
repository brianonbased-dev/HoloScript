/**
 * VideoTranscodeTrait — v5.1
 *
 * Video format conversion and encoding.
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface VideoTranscodeConfig {
  default_codec: string;
  max_bitrate: number;
}

export const videoTranscodeHandler: TraitHandler<VideoTranscodeConfig> = {
  name: 'video_transcode',
  defaultConfig: { default_codec: 'h264', max_bitrate: 8000 },

  onAttach(node: HSPlusNode): void {
    node.__videoState = { jobs: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__videoState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: VideoTranscodeConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__videoState as { jobs: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'video:transcode') {
      state.jobs++;
      context.emit?.('video:transcoded', {
        src: event.src,
        codec: (event.codec as string) ?? config.default_codec,
        bitrate: Math.min((event.bitrate as number) ?? config.max_bitrate, config.max_bitrate),
        jobNumber: state.jobs,
      });
    }
  },
};

export default videoTranscodeHandler;
