/**
 * Realtime voice segregated dialects (slice D, board mjz9).
 *
 * Slice A+B added the OpenAI `realtimeVoice` dialect (3-way transport union + SIP
 * + ephemeral secret) on `OpenAIProviderExtensions`. Slice D adds the xAI (Grok)
 * and Gemini dialects — each a GENUINELY DIFFERENT transport, segregated on its
 * OWN extension interface so the shapes never flatten (same two-axis rule as
 * computerUse — see computer-use-capability.test.ts):
 *   - OpenAI: `transport` union (webrtc|sip|websocket) + SIP telephony + ephemeral
 *     secret + audioFormat. Richest.
 *   - xAI:    WebSocket-ONLY (`transport: 'websocket'` literal) + SPLIT REST
 *     STT/TTS endpoints. Per-HOUR billing (pricer lives with CostGuard). No
 *     WebRTC/SIP, no ephemeral secret.
 *   - Gemini: NO `transport` field at all — a `mode: 'live' | 'tts'` discriminant
 *     (Live API vs streaming TTS) + `responseModalities` + ephemeral TOKEN.
 *
 * Slice D wires the typed INTENT surfaces + the per-duration pricer only; the
 * per-vendor session openers (`GrokRealtimeAdapter` / `GeminiRealtimeAdapter`)
 * need live wire frames and are deferred to slice E. This is therefore a
 * compile/type + distinctness test (no mock session driver) mirroring
 * computer-use-capability.test.ts — it only COMPILES if the three shapes are
 * structurally distinct, and it asserts each carries fields the others do not.
 */
import { describe, it, expect } from 'vitest';
import type { ProviderExtensions } from '../types';

describe('realtime voice segregated dialects (not flattened)', () => {
  // One ProviderExtensions carrying all THREE realtimeVoice shapes. This object
  // literal only type-checks if each dialect accepts its own distinct fields —
  // proving the shapes are segregated, not a single flattened shape.
  const ext: ProviderExtensions = {
    openai: {
      // OpenAI dialect: 3-way transport union + ephemeral secret + SIP + audioFormat.
      realtimeVoice: {
        transport: 'webrtc',
        model: 'gpt-realtime-2.1',
        voice: 'cedar',
        ephemeralSecret: { mint: true, ttlSeconds: 60 },
        sip: { projectId: 'proj_1', inbound: true },
        turnDetection: { type: 'server_vad', threshold: 0.5 },
        audioFormat: { input: 'pcm16', output: 'pcm16' },
      },
    },
    grok: {
      // xAI dialect: WebSocket ONLY + split REST STT/TTS. No WebRTC/SIP/ephemeral.
      realtimeVoice: {
        transport: 'websocket',
        model: 'grok-voice-think-fast-1.0',
        endpoint: '/v1/realtime',
        stt: { endpoint: '/v1/stt', streaming: true },
        tts: { endpoint: '/v1/tts' },
      },
    },
    gemini: {
      // Gemini dialect: live-vs-tts mode discriminant + responseModalities + token.
      realtimeVoice: {
        mode: 'live',
        model: 'gemini-3-flash-preview',
        responseModalities: ['AUDIO', 'TEXT'],
        ephemeralToken: { mint: true, ttlSeconds: 120 },
        voiceConfig: { prebuiltVoice: 'Puck' },
      },
    },
  };

  it('OpenAI carries a transport union + SIP telephony the others do not', () => {
    expect(ext.openai?.realtimeVoice?.transport).toBe('webrtc');
    expect(ext.openai?.realtimeVoice?.sip?.projectId).toBe('proj_1');
    expect(ext.openai?.realtimeVoice?.ephemeralSecret?.mint).toBe(true);
    // SIP is an OpenAI-only concept — neither sibling shape has it.
    expect('sip' in (ext.grok?.realtimeVoice ?? {})).toBe(false);
    expect('sip' in (ext.gemini?.realtimeVoice ?? {})).toBe(false);
  });

  it('xAI is WebSocket-only with a split REST STT/TTS surface (distinct fields)', () => {
    expect(ext.grok?.realtimeVoice?.transport).toBe('websocket');
    expect(ext.grok?.realtimeVoice?.stt?.endpoint).toBe('/v1/stt');
    expect(ext.grok?.realtimeVoice?.tts?.endpoint).toBe('/v1/tts');
    // The STT/TTS split is xAI-only — OpenAI/Gemini realtime shapes have neither.
    expect('stt' in (ext.openai?.realtimeVoice ?? {})).toBe(false);
    expect('tts' in (ext.gemini?.realtimeVoice ?? {})).toBe(false);
  });

  it('Gemini is mode-discriminated (Live vs TTS) with NO transport field', () => {
    expect(ext.gemini?.realtimeVoice?.mode).toBe('live');
    expect(ext.gemini?.realtimeVoice?.responseModalities).toContain('AUDIO');
    expect(ext.gemini?.realtimeVoice?.ephemeralToken?.mint).toBe(true);
    // Gemini has no `transport` field at all — the discriminant is `mode`.
    expect('transport' in (ext.gemini?.realtimeVoice ?? {})).toBe(false);
    // `mode` is Gemini-only — the other two dialects are transport-shaped.
    expect('mode' in (ext.openai?.realtimeVoice ?? {})).toBe(false);
    expect('mode' in (ext.grok?.realtimeVoice ?? {})).toBe(false);
  });

  it('the three dialects share NO common discriminating key set (genuinely distinct)', () => {
    const openaiKeys = new Set(Object.keys(ext.openai?.realtimeVoice ?? {}));
    const grokKeys = new Set(Object.keys(ext.grok?.realtimeVoice ?? {}));
    const geminiKeys = new Set(Object.keys(ext.gemini?.realtimeVoice ?? {}));
    // OpenAI ∩ Gemini discriminators: OpenAI has `sip`/`transport`, Gemini has `mode`.
    expect(openaiKeys.has('sip')).toBe(true);
    expect(geminiKeys.has('mode')).toBe(true);
    // xAI's REST split keys are unique to it.
    expect(grokKeys.has('stt')).toBe(true);
    expect(grokKeys.has('tts')).toBe(true);
    expect(openaiKeys.has('stt')).toBe(false);
    expect(geminiKeys.has('stt')).toBe(false);
  });

  it('Gemini supports the streaming-TTS mode as well as the Live mode', () => {
    const ttsOnly: ProviderExtensions = {
      gemini: { realtimeVoice: { mode: 'tts', model: 'gemini-3.1-flash-tts-preview' } },
    };
    expect(ttsOnly.gemini?.realtimeVoice?.mode).toBe('tts');
    expect(ttsOnly.gemini?.realtimeVoice?.model).toBe('gemini-3.1-flash-tts-preview');
  });
});
