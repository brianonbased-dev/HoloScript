/**
 * VoiceMesh Trait
 *
 * Handles Voice-over-IP (VoIP) for the HoloScript Mesh.
 * Captures local microphone input and plays back remote streams via HeadTrackedAudio.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export interface VoiceMeshConfig {
  auto_connect: boolean;
  mute: boolean;
  spatial: boolean;
  volume: number;
  vad_threshold: number; // Voice Activity Detection (-100 to 0 dB)
}

interface VoiceMeshState {
  isTalking: boolean;
  isMuted: boolean;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>; // peerId -> Stream
  audioContext: AudioContext | null;
  analyzer: AnalyserNode | null;
}

export const voiceMeshHandler: TraitHandler<VoiceMeshConfig> = {
  name: 'voice_mesh',

  defaultConfig: {
    auto_connect: true,
    mute: false,
    spatial: true,
    volume: 1.0,
    vad_threshold: -50,
  },

  onAttach(node, config, context) {
    const state: VoiceMeshState = {
      isTalking: false,
      isMuted: config.mute,
      localStream: null,
      remoteStreams: new Map(),
      audioContext: null,
      analyzer: null,
    };
    node.__voiceMeshState = state;

    if (config.auto_connect) {
      this.startLocalStream(node, config, context);
    }

    context.emit?.('voice_mesh_ready', { node });
  },

  onDetach(node, _config, context) {
    const state = node.__voiceMeshState as VoiceMeshState;
    if (state) {
      state.localStream?.getTracks().forEach((track) => track.stop());
      state.audioContext?.close();
      delete node.__voiceMeshState;
    }
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__voiceMeshState as VoiceMeshState;
    if (!state || !state.analyzer || state.isMuted) return;

    // VAD Logic
    const dataArray = new Uint8Array(state.analyzer.frequencyBinCount);
    state.analyzer.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    // Simple mock VAD: average amplitude check
    // In real implementation, converts to dB
    const isTalking = average > config.vad_threshold + 100; // Mock scaling

    if (isTalking !== state.isTalking) {
      state.isTalking = isTalking;
      context.emit?.('voice_activity_change', { node, isTalking });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__voiceMeshState as VoiceMeshState;
    if (!state) return;

    if (event.type === 'voice_stream_received') {
      const { peerId, stream } = event as any;
      state.remoteStreams.set(peerId, stream);

      // Pipe to HeadTrackedAudio if spatial is enabled
      // Needs a separate node for each peer really, but simple case:
      context.emit?.('audio_source_loaded', {
        node,
        sourceId: `voice_${peerId}`,
        stream,
        spatial: config.spatial,
      });
    }
  },

  // --- Helpers ---

  async startLocalStream(node: any, config: VoiceMeshConfig, context: any) {
    const state = node.__voiceMeshState as VoiceMeshState;

    // In node/test env, navigator might be missing
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      console.warn('VoiceMesh: No media devices found (non-browser env).');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.localStream = stream;

      // Setup Analysis for VAD
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        state.audioContext = new AudioContextClass();
        const source = state.audioContext.createMediaStreamSource(stream);
        state.analyzer = state.audioContext.createAnalyser();
        state.analyzer.fftSize = 256;
        source.connect(state.analyzer);
      }

      context.emit?.('voice_local_stream_started', { node, stream });
    } catch (err) {
      console.error('VoiceMesh: Failed to get microphone:', err);
      context.emit?.('voice_error', { node, error: err });
    }
  },
};

export default voiceMeshHandler;
