/**
 * EmotionalVoiceTrait — Production Test Suite
 *
 * emotionalVoiceHandler stores state on node.__emotionalVoiceState.
 * handleSpeak is async and delegates to VoiceSynthesizer (mocked).
 *
 * Key behaviours:
 * 1. defaultConfig — defaultEmotion=neutral, defaultIntensity=0.5, cacheEnabled=true
 * 2. onAttach — creates __emotionalVoiceState with empty audioCache Map
 * 3. onDetach — removes __emotionalVoiceState
 * 4. onEvent 'speak' — calls handleSpeak with merged emotion/voice params
 *    - text from event.data; voiceId: event.data.voiceId ?? config.voiceId
 *    - emotion: event.data.emotion ?? config.defaultEmotion
 *    - intensity: event.data.intensity ?? config.defaultIntensity
 * 5. onEvent unknown type — no-op (state guard also tested)
 * 6. handleSpeak — skips when no synthesizer registered
 * 7. handleSpeak — uses cache on 2nd call (cacheEnabled=true)
 * 8. handleSpeak — does NOT cache when cacheEnabled=false
 * 9. handleSpeak — emits 'vocalize' on node after synthesis
 * 10. handleSpeak — swallows errors from synthesizer.generate()
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock VoiceSynthesizer module ─────────────────────────────────────────────
// voiceSynthesizerRegistry is a Map; getVoiceSynthesizer looks up by name.
// We expose the registry so tests can populate it.

vi.mock('@holoscript/engine/runtime/VoiceSynthesizer', () => {
  const registry = new Map<string, unknown>();
  return {
    voiceSynthesizerRegistry: registry,
    getVoiceSynthesizer: (name: string) => registry.get(name) ?? null,
  };
});

import { emotionalVoiceHandler } from '../EmotionalVoiceTrait';
import { voiceSynthesizerRegistry } from '@holoscript/engine/runtime/VoiceSynthesizer';

// ─── helpers ──────────────────────────────────────────────────────────────────

let _nodeId = 0;

function makeNode() {
  return {
    id: `voice_node_${++_nodeId}`,
    name: `VoiceNPC_${_nodeId}`,
    emit: vi.fn(),
  };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function makeConfig(overrides: Partial<typeof emotionalVoiceHandler.defaultConfig> = {}) {
  return { ...emotionalVoiceHandler.defaultConfig!, ...overrides };
}

function attach(cfg = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(cfg);
  emotionalVoiceHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

function makeSynth(genResult: ArrayBuffer | null = new ArrayBuffer(8)) {
  return {
    generate: vi.fn().mockResolvedValue(genResult),
  };
}

beforeEach(() => {
  voiceSynthesizerRegistry.clear();
  vi.clearAllMocks();
});

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('emotionalVoiceHandler.defaultConfig', () => {
  const d = emotionalVoiceHandler.defaultConfig!;
  it('defaultEmotion = neutral', () => expect(d.defaultEmotion).toBe('neutral'));
  it('defaultIntensity = 0.5', () => expect(d.defaultIntensity).toBe(0.5));
  it('cacheEnabled = true', () => expect(d.cacheEnabled).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('emotionalVoiceHandler.onAttach', () => {
  it('creates __emotionalVoiceState on node', () => {
    const { node } = attach();
    expect((node as any).__emotionalVoiceState).toBeDefined();
  });

  it('audioCache is an empty Map', () => {
    const { node } = attach();
    const state = (node as any).__emotionalVoiceState;
    expect(state.audioCache).toBeInstanceOf(Map);
    expect(state.audioCache.size).toBe(0);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('emotionalVoiceHandler.onDetach', () => {
  it('removes __emotionalVoiceState', () => {
    const { node, ctx, config } = attach();
    emotionalVoiceHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__emotionalVoiceState).toBeUndefined();
  });
});

// ─── onEvent — no-op guards ───────────────────────────────────────────────────

describe('emotionalVoiceHandler.onEvent — guards', () => {
  it('does nothing when event type is not "speak"', () => {
    const { node, ctx, config } = attach();
    // should not throw
    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, { type: 'unknown_event' });
  });

  it('no-op when state is missing (node never attached)', () => {
    const node = makeNode();
    emotionalVoiceHandler.onEvent!(node as any, makeConfig(), makeCtx() as any, {
      type: 'speak',
      data: { text: 'hi' },
    });
  });
});

// ─── onEvent — speak calls handleSpeak ───────────────────────────────────────

describe('emotionalVoiceHandler.onEvent — speak event', () => {
  it('invokes handleSpeak (calls synth.generate)', async () => {
    const synth = makeSynth();
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ voiceId: 'v1' });

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Hello world', emotion: 'excited', intensity: 0.8 },
    });

    // handleSpeak is async — wait for microtask flush
    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalled());
    expect(synth.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello world',
        emotion: expect.objectContaining({ type: 'excited', intensity: 0.8 }),
      })
    );
  });

  it('falls back to config.defaultEmotion when event.emotion is missing', async () => {
    const synth = makeSynth();
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ defaultEmotion: 'sad' });

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Goodbye' },
    });

    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalled());
    const [req] = synth.generate.mock.calls[0];
    expect(req.emotion.type).toBe('sad');
  });

  it('falls back to config.defaultIntensity when event.intensity is missing', async () => {
    const synth = makeSynth();
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ defaultIntensity: 0.2 });

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Hi' },
    });

    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalled());
    const [req] = synth.generate.mock.calls[0];
    expect(req.emotion.intensity).toBe(0.2);
  });

  it('uses event.voiceId over config.voiceId', async () => {
    const synth = makeSynth();
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ voiceId: 'config_voice' });

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Test', voiceId: 'event_voice' },
    });

    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalled());
    const [req] = synth.generate.mock.calls[0];
    expect(req.voiceId).toBe('event_voice');
  });
});

// ─── handleSpeak — no synthesizer ────────────────────────────────────────────

describe('handleSpeak — no synthesizer registered', () => {
  it('silently skips synthesis without throwing', async () => {
    // registry is empty from beforeEach clear
    const { node, ctx, config } = attach();
    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Nothing happens' },
    });
    // Wait to ensure the async path completes — no error thrown
    await new Promise((r) => setTimeout(r, 10));
    expect(node.emit).not.toHaveBeenCalled();
  });
});

// ─── handleSpeak — caching ────────────────────────────────────────────────────

describe('handleSpeak — audio cache', () => {
  it('calls generate only once for the same text/emotion/voice when cacheEnabled=true', async () => {
    const synth = makeSynth();
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ voiceId: 'v1', cacheEnabled: true });

    const ev = {
      type: 'speak',
      data: { text: 'Cached text', emotion: 'friendly', intensity: 0.5 },
    };

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, ev);
    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalledTimes(1));

    // Second call — same params → should use cache
    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, ev);
    await new Promise((r) => setTimeout(r, 10));
    expect(synth.generate).toHaveBeenCalledTimes(1); // still 1
  });

  it('calls generate again for different text', async () => {
    const synth = makeSynth();
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ voiceId: 'v1', cacheEnabled: true });

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'First', emotion: 'neutral', intensity: 0.5 },
    });
    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalledTimes(1));

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Second', emotion: 'neutral', intensity: 0.5 },
    });
    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalledTimes(2));
  });

  it('does NOT cache when cacheEnabled=false (calls generate twice)', async () => {
    const synth = makeSynth();
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ voiceId: 'v1', cacheEnabled: false });

    const ev = { type: 'speak', data: { text: 'No cache', emotion: 'neutral', intensity: 0.5 } };
    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, ev);
    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalledTimes(1));

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, ev);
    await vi.waitFor(() => expect(synth.generate).toHaveBeenCalledTimes(2));
  });
});

// ─── handleSpeak — vocalize emit ─────────────────────────────────────────────

describe('handleSpeak — vocalize event', () => {
  it('emits "vocalize" on node with buffer + text + request', async () => {
    const buf = new ArrayBuffer(16);
    const synth = { generate: vi.fn().mockResolvedValue(buf) };
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach({ voiceId: 'v1' });

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Vocalize me', emotion: 'friendly', intensity: 0.7 },
    });

    await vi.waitFor(() => expect(node.emit).toHaveBeenCalled());
    expect(node.emit).toHaveBeenCalledWith(
      'vocalize',
      expect.objectContaining({
        buffer: buf,
        text: 'Vocalize me',
        request: expect.objectContaining({ text: 'Vocalize me' }),
      })
    );
  });
});

// ─── handleSpeak — error swallowing ──────────────────────────────────────────

describe('handleSpeak — synthesizer error', () => {
  it('swallows error from synth.generate() without emitting vocalize', async () => {
    const synth = { generate: vi.fn().mockRejectedValue(new Error('TTS down')) };
    voiceSynthesizerRegistry.set('default', synth);
    const { node, ctx, config } = attach();

    emotionalVoiceHandler.onEvent!(node as any, config, ctx as any, {
      type: 'speak',
      data: { text: 'Fail' },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(node.emit).not.toHaveBeenCalled();
  });
});
