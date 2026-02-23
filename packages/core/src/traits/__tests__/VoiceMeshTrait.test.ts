import { describe, it, expect, beforeEach } from 'vitest';
import { voiceMeshHandler } from '../VoiceMeshTrait';
import {
  createMockContext, createMockNode, attachTrait,
  sendEvent, getEventCount, getLastEvent,
} from './traitTestHelpers';

describe('VoiceMeshTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    auto_connect: false, // avoids navigator.mediaDevices calls in test
    mute: false,
    spatial: true,
    volume: 1.0,
    vad_threshold: -50,
  };

  function state() { return (node as any).__voiceMeshState; }

  beforeEach(() => {
    node = createMockNode('vm');
    ctx = createMockContext();
    attachTrait(voiceMeshHandler, node, cfg, ctx);
  });

  // ── onAttach ─────────────────────────────────────────────────────────────────

  it('emits voice_mesh_ready on attach', () => {
    expect(getEventCount(ctx, 'voice_mesh_ready')).toBe(1);
  });

  it('initializes isMuted from config', () => {
    expect(state().isMuted).toBe(false);
  });

  it('initializes isTalking=false', () => {
    expect(state().isTalking).toBe(false);
  });

  it('initializes with empty remoteStreams', () => {
    expect(state().remoteStreams.size).toBe(0);
  });

  it('initializes localStream as null', () => {
    expect(state().localStream).toBeNull();
  });

  it('mute:true config initializes isMuted=true', () => {
    const n2 = createMockNode('vm2');
    const c2 = createMockContext();
    attachTrait(voiceMeshHandler, n2, { ...cfg, mute: true }, c2);
    expect((n2 as any).__voiceMeshState.isMuted).toBe(true);
  });

  // ── voice_stream_received ─────────────────────────────────────────────────────

  it('voice_stream_received adds stream to remoteStreams', () => {
    const stream = {} as MediaStream;
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream });
    expect(state().remoteStreams.get('p1')).toBe(stream);
  });

  it('voice_stream_received emits audio_source_loaded', () => {
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream: {} });
    expect(getEventCount(ctx, 'audio_source_loaded')).toBe(1);
  });

  it('audio_source_loaded event includes peerId', () => {
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'peer-42', stream: {} });
    const ev = getLastEvent(ctx, 'audio_source_loaded') as any;
    expect(ev.sourceId).toBe('voice_peer-42');
  });

  it('audio_source_loaded event reflects spatial config', () => {
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream: {} });
    const ev = getLastEvent(ctx, 'audio_source_loaded') as any;
    expect(ev.spatial).toBe(true);
  });

  it('audio_source_loaded reflects spatial=false config', () => {
    const n2 = createMockNode('vm3');
    const c2 = createMockContext();
    const nsCfg = { ...cfg, spatial: false };
    attachTrait(voiceMeshHandler, n2, nsCfg, c2);
    sendEvent(voiceMeshHandler, n2, nsCfg, c2, { type: 'voice_stream_received', peerId: 'p1', stream: {} });
    const ev = getLastEvent(c2, 'audio_source_loaded') as any;
    expect(ev.spatial).toBe(false);
  });

  it('multiple peers tracked separately', () => {
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream: {} });
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p2', stream: {} });
    expect(state().remoteStreams.size).toBe(2);
  });

  it('same peer overwritten with new stream', () => {
    const s1 = { id: 's1' } as unknown as MediaStream;
    const s2 = { id: 's2' } as unknown as MediaStream;
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream: s1 });
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream: s2 });
    expect(state().remoteStreams.get('p1')).toBe(s2);
  });

  // ── unknown events ────────────────────────────────────────────────────────────

  it('unknown events do not throw', () => {
    expect(() =>
      sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'unknown_voice_event' })
    ).not.toThrow();
  });

  // ── detach ────────────────────────────────────────────────────────────────────

  it('detach removes state', () => {
    voiceMeshHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__voiceMeshState).toBeUndefined();
  });

  it('detach with peer streams still cleans up', () => {
    sendEvent(voiceMeshHandler, node, cfg, ctx, { type: 'voice_stream_received', peerId: 'p1', stream: {} });
    voiceMeshHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__voiceMeshState).toBeUndefined();
  });
});
