import { describe, it, expect, vi, beforeEach } from 'vitest';
import { voiceMeshHandler } from '../traits/VoiceMeshTrait';

// Mock Browser Audio APIs
const mockGetUserMedia = vi.fn().mockResolvedValue({
  getTracks: () => [],
});

class MockAudioContext {
  createMediaStreamSource = vi.fn().mockReturnValue({ connect: vi.fn() });
  createAnalyser = vi.fn().mockReturnValue({
    frequencyBinCount: 128,
    fftSize: 256,
    getByteFrequencyData: vi.fn((array) => {
      array.fill(100);
    }),
  });
  close = vi.fn();
}

// Setup Global Mocks
vi.stubGlobal('navigator', {
  mediaDevices: { getUserMedia: mockGetUserMedia },
});
vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('window', { AudioContext: MockAudioContext });

describe('Voice Mesh (Cycle 74)', () => {
  let node: any;
  let context: any;

  beforeEach(() => {
    node = { id: 'voice_node' };
    context = { emit: vi.fn() };
    vi.clearAllMocks();
  });

  it('should auto-connect microphone on attach', async () => {
    await voiceMeshHandler.onAttach!(
      node,
      { ...voiceMeshHandler.defaultConfig, auto_connect: true } as any,
      context
    );

    expect(mockGetUserMedia).toHaveBeenCalled();
    // Wait for promise resolution in actual code (mocked here, but logical flow check)
  });

  it('should handle VAD logic', () => {
    const config = { ...voiceMeshHandler.defaultConfig, vad_threshold: 0 }; // Threshold < 100

    // Manually setup state to skip async start
    const analyzerMock = {
      frequencyBinCount: 10,
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(150), // High volume
    };
    (node as any).__voiceMeshState = {
      isTalking: false,
      isMuted: false,
      analyzer: analyzerMock,
    };

    voiceMeshHandler.onUpdate!(node, config as any, context, 0.1);

    expect((node as any).__voiceMeshState.isTalking).toBe(true);
    expect(context.emit).toHaveBeenCalledWith('voice_activity_change', { node, isTalking: true });
  });

  it('should pipe remote streams to events', () => {
    const config = voiceMeshHandler.defaultConfig;
    (node as any).__voiceMeshState = { remoteStreams: new Map() };

    const mockStream = { id: 'remote_stream' };
    voiceMeshHandler.onEvent!(node, config as any, context, {
      type: 'voice_stream_received',
      peerId: 'peer_123',
      stream: mockStream,
    } as any);

    expect((node as any).__voiceMeshState.remoteStreams.get('peer_123')).toBe(mockStream);
    expect(context.emit).toHaveBeenCalledWith(
      'audio_source_loaded',
      expect.objectContaining({
        sourceId: 'voice_peer_123',
        stream: mockStream,
      })
    );
  });
});
