import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emotionalVoiceHandler } from '../traits/EmotionalVoiceTrait';
import { registerVoiceSynthesizer, type VoiceSynthesizer } from '@holoscript/engine/runtime/VoiceSynthesizer';
import { HSPlusNode } from '../types/HoloScriptPlus';

describe('EmotionalVoiceTrait - Phase 20 (Procedural Voice)', () => {
  let mockSynthesizer: VoiceSynthesizer;
  let node: HSPlusNode;

  beforeEach(() => {
    mockSynthesizer = {
      initialize: vi.fn(),
      generate: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      getVoices: vi.fn(),
      dispose: vi.fn(),
    };
    registerVoiceSynthesizer('default', mockSynthesizer);

    node = {
      id: 'npc_merchant',
      name: 'Merchant',
      type: 'object',
      traits: new Map([['emotional_voice', { voiceId: 'voice_1' }]]),
      properties: {},
      children: [],
    } as any as HSPlusNode;
  });

  it('should initialize state on attach', () => {
    emotionalVoiceHandler.onAttach!(node, emotionalVoiceHandler.defaultConfig as any, {} as any);
    expect((node as any).__emotionalVoiceState).toBeDefined();
    expect((node as any).__emotionalVoiceState.audioCache).toBeDefined();
  });

  it('should call synthesizer.generate with correct parameters on speak event', async () => {
    emotionalVoiceHandler.onAttach!(node, emotionalVoiceHandler.defaultConfig as any, {} as any);

    const speakEvent = {
      type: 'speak',
      data: {
        text: 'Hello, traveler!',
        emotion: 'friendly',
        intensity: 0.8,
      },
    };

    // Fast-track calling the internal handleSpeak via onEvent
    emotionalVoiceHandler.onEvent!(
      node,
      emotionalVoiceHandler.defaultConfig as any,
      {} as any,
      speakEvent as any
    );

    // Wait for the async generate call (since onEvent doesn't await it internally in the trait)
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockSynthesizer.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello, traveler!',
        emotion: {
          type: 'friendly',
          intensity: 0.8,
        },
      })
    );
  });

  it('should cache audio buffers for identical requests', async () => {
    emotionalVoiceHandler.onAttach!(node, { cacheEnabled: true } as any, {} as any);

    const speakEvent = {
      type: 'speak',
      data: { text: 'Welcome!' },
    };

    // First call
    emotionalVoiceHandler.onEvent!(
      node,
      { cacheEnabled: true } as any,
      {} as any,
      speakEvent as any
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockSynthesizer.generate).toHaveBeenCalledTimes(1);

    // Second call with same text
    emotionalVoiceHandler.onEvent!(
      node,
      { cacheEnabled: true } as any,
      {} as any,
      speakEvent as any
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should NOT call synthesizer again
    expect(mockSynthesizer.generate).toHaveBeenCalledTimes(1);

    const state = (node as any).__emotionalVoiceState;
    expect(state.audioCache.size).toBe(1);
  });
});
