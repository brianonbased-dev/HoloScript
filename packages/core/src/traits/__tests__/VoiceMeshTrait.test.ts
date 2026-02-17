import { describe, it, expect, beforeEach } from 'vitest';
import { voiceMeshHandler } from '../VoiceMeshTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('VoiceMeshTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    auto_connect: false, // Don't trigger navigator.mediaDevices in tests
    mute: false,
    spatial: true,
    volume: 1.0,
    vad_threshold: -50,
  };

  beforeEach(() => {
    node = createMockNode('vm');
    ctx = createMockContext();
    attachTrait(voiceMeshHandler, node, cfg, ctx);
  });

  it('emits voice_mesh_ready on attach', () => {
    expect(getEventCount(ctx, 'voice_mesh_ready')).toBe(1);
    const s = (node as any).__voiceMeshState;
    expect(s.isMuted).toBe(false);
    expect(s.isTalking).toBe(false);
  });

  it('mute config applied on attach', () => {
    const n = createMockNode('vm2');
    const c = createMockContext();
    attachTrait(voiceMeshHandler, n, { ...cfg, mute: true }, c);
    expect((n as any).__voiceMeshState.isMuted).toBe(true);
  });

  it('voice_stream_received adds remote stream', () => {
    const mockStream = {} as any;
    sendEvent(voiceMeshHandler, node, cfg, ctx, {
      type: 'voice_stream_received',
      peerId: 'peer-1',
      stream: mockStream,
    });
    const s = (node as any).__voiceMeshState;
    expect(s.remoteStreams.size).toBe(1);
    expect(s.remoteStreams.get('peer-1')).toBe(mockStream);
    expect(getEventCount(ctx, 'audio_source_loaded')).toBe(1);
  });

  it('multiple peers tracked separately', () => {
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream: {} });
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p2', stream: {} });
    const s = (node as any).__voiceMeshState;
    expect(s.remoteStreams.size).toBe(2);
  });

  it('detach cleans up state', () => {
    voiceMeshHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__voiceMeshState).toBeUndefined();
  });
});
