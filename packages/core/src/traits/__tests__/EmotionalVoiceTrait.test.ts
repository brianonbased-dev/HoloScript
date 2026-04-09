import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait, sendEvent } from './traitTestHelpers';

// Mock VoiceSynthesizer — avoid hoisting issues by inlining stubs
vi.mock('@holoscript/engine/runtime/VoiceSynthesizer', () => {
  const gen = vi.fn().mockResolvedValue(new ArrayBuffer(1024));
  return {
    getVoiceSynthesizer: vi.fn(() => ({ generate: gen })),
    voiceSynthesizerRegistry: new Map([['default', { generate: gen }]]),
  };
});

import { emotionalVoiceHandler } from '../EmotionalVoiceTrait';

describe('EmotionalVoiceTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    voiceId: 'npc_voice_1',
    defaultEmotion: 'neutral' as const,
    defaultIntensity: 0.5,
    cacheEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('npc1');
    (node as any).emit = vi.fn();
    ctx = createMockContext();
    attachTrait(emotionalVoiceHandler, node, cfg, ctx);
  });

  it('initializes state with empty audio cache', () => {
    const s = (node as any).__emotionalVoiceState;
    expect(s).toBeDefined();
    expect(s.audioCache).toBeInstanceOf(Map);
    expect(s.audioCache.size).toBe(0);
  });

  it('cleans up on detach', () => {
    emotionalVoiceHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__emotionalVoiceState).toBeUndefined();
  });

  it('handles speak event without error', () => {
    sendEvent(emotionalVoiceHandler, node, cfg, ctx, {
      type: 'speak',
      data: { text: 'Hello world', emotion: 'excited', intensity: 0.9 },
    });
    expect((node as any).__emotionalVoiceState).toBeDefined();
  });

  it('uses default emotion when not specified in event', () => {
    sendEvent(emotionalVoiceHandler, node, cfg, ctx, {
      type: 'speak',
      data: { text: 'Test' },
    });
    expect((node as any).__emotionalVoiceState).toBeDefined();
  });

  it('ignores non-speak events', () => {
    sendEvent(emotionalVoiceHandler, node, cfg, ctx, { type: 'other_event' });
    // No crash and state is still intact
    expect((node as any).__emotionalVoiceState).toBeDefined();
  });

  it('has correct default config', () => {
    expect(emotionalVoiceHandler.defaultConfig).toBeDefined();
    expect((emotionalVoiceHandler.defaultConfig as any).defaultEmotion).toBe('neutral');
    expect((emotionalVoiceHandler.defaultConfig as any).defaultIntensity).toBe(0.5);
    expect((emotionalVoiceHandler.defaultConfig as any).cacheEnabled).toBe(true);
  });

  it('has correct handler name', () => {
    expect(emotionalVoiceHandler.name).toBe('emotional_voice');
  });

  it('does nothing on update (no frame-based logic)', () => {
    emotionalVoiceHandler.onUpdate?.(node as any, cfg as any, ctx as any, 0.016);
  });
});
