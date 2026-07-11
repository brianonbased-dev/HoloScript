import { describe, it, expect } from 'vitest';
import {
  OPENAI_REALTIME_PRICING_USD_PER_MTOK,
  defaultOpenAIRealtimePricer,
  XAI_REALTIME_PRICING_USD_PER_HOUR,
  defaultXaiRealtimePricer,
  type AudioPricing,
  type RealtimePricer,
} from '../cost-guard.js';
import type { AudioUsage } from '@holoscript/llm-provider';

// Realtime audio pricing is a SEPARATE dimension from text TokenUsage — three
// audio rates (audio-in / cached-audio-in / audio-out) plus optional text.
// Verified 2026-07-10 (docs/llm-capabilities/openai.md, task r7y5). These are
// pure functions: fixed AudioUsage in, exact USD out — no network, no hardware.

describe('OPENAI_REALTIME_PRICING_USD_PER_MTOK', () => {
  it('pins gpt-realtime-2.1 to the verified per-M rates', () => {
    expect(OPENAI_REALTIME_PRICING_USD_PER_MTOK['gpt-realtime-2.1']).toEqual({
      audioInput: 32,
      cachedAudioInput: 0.4,
      audioOutput: 64,
      textInput: 4,
      textOutput: 24,
    });
  });

  it('pins gpt-realtime-2.1-mini to the verified per-M rates', () => {
    expect(OPENAI_REALTIME_PRICING_USD_PER_MTOK['gpt-realtime-2.1-mini']).toEqual({
      audioInput: 10,
      cachedAudioInput: 0.3,
      audioOutput: 20,
      textInput: 0.6,
      textOutput: 2.4,
    });
  });
});

describe('defaultOpenAIRealtimePricer', () => {
  it('prices a known AudioUsage for gpt-realtime-2.1 to exact USD', () => {
    const usage: AudioUsage = {
      audioInputTokens: 1_000_000,
      cachedAudioInputTokens: 500_000,
      audioOutputTokens: 2_000_000,
      textInputTokens: 0,
      textOutputTokens: 0,
    };
    // 1M*32 + 0.5M*0.40 + 2M*64 = (32 + 0.20 + 128) = 160.20 USD
    expect(defaultOpenAIRealtimePricer('gpt-realtime-2.1', usage)).toBeCloseTo(160.2, 6);
  });

  it('prices a known AudioUsage for gpt-realtime-2.1-mini to exact USD (incl. text dims)', () => {
    const usage: AudioUsage = {
      audioInputTokens: 1_000_000,
      cachedAudioInputTokens: 1_000_000,
      audioOutputTokens: 1_000_000,
      textInputTokens: 1_000_000,
      textOutputTokens: 1_000_000,
    };
    // 1M each: 10 + 0.30 + 20 + 0.60 + 2.40 = 33.30 USD
    expect(defaultOpenAIRealtimePricer('gpt-realtime-2.1-mini', usage)).toBeCloseTo(33.3, 6);
  });

  it('treats omitted text dims as zero (audio-only session)', () => {
    const usage: AudioUsage = {
      audioInputTokens: 1_000_000,
      cachedAudioInputTokens: 0,
      audioOutputTokens: 0,
    };
    expect(defaultOpenAIRealtimePricer('gpt-realtime-2.1', usage)).toBeCloseTo(32, 6);
  });

  it('throws on an unknown model so callers cannot silently undercount', () => {
    expect(() =>
      defaultOpenAIRealtimePricer('gpt-realtime-imaginary', {
        audioInputTokens: 1,
        cachedAudioInputTokens: 1,
        audioOutputTokens: 1,
      })
    ).toThrowError(/No realtime pricing configured/);
  });
});

describe('RealtimePricer union', () => {
  it('accepts the OpenAI per-token pricer as a per-token variant', () => {
    const pricer: RealtimePricer = { kind: 'per-token', price: defaultOpenAIRealtimePricer };
    expect(pricer.kind).toBe('per-token');
    if (pricer.kind === 'per-token') {
      expect(
        pricer.price('gpt-realtime-2.1', {
          audioInputTokens: 1_000_000,
          cachedAudioInputTokens: 0,
          audioOutputTokens: 0,
        })
      ).toBeCloseTo(32, 6);
    }
  });

  it('structurally admits a future per-duration pricer without changing the type', () => {
    // Slice D (xAI $3/hr) supplies the real per-duration pricer; here we only
    // prove the union shape fits so that landing it later is additive.
    const perDuration: RealtimePricer = {
      kind: 'per-duration',
      price: (_model: string, seconds: number) => (3.0 / 3600) * seconds,
    };
    expect(perDuration.kind).toBe('per-duration');
    if (perDuration.kind === 'per-duration') {
      expect(perDuration.price('grok-voice-think-fast-1.0', 3600)).toBeCloseTo(3.0, 6);
    }
  });
});

// Compile-time anchor: AudioPricing is the exported table entry shape.
describe('AudioPricing shape', () => {
  it('is the shape of each pricing-table entry', () => {
    const entry: AudioPricing = OPENAI_REALTIME_PRICING_USD_PER_MTOK['gpt-realtime-2.1'];
    expect(entry.audioInput).toBe(32);
    expect(entry.cachedAudioInput).toBe(0.4);
    expect(entry.audioOutput).toBe(64);
  });
});

// --- Slice D (board mjz9): xAI per-DURATION realtime pricer -----------------
// xAI's Voice Agent bills PER HOUR of session wall-clock ($3/hr), not per audio
// token — a fundamentally different accrual model from OpenAI/Gemini. These are
// pure functions: fixed durationSeconds in, exact USD out — no network, no audio.
// Verified 2026-07-10 (docs/llm-capabilities/xai-grok.md § Voice pricing).

describe('XAI_REALTIME_PRICING_USD_PER_HOUR', () => {
  it('pins grok-voice-think-fast-1.0 to the verified $3.00/hour rate', () => {
    expect(XAI_REALTIME_PRICING_USD_PER_HOUR['grok-voice-think-fast-1.0']).toBe(3.0);
  });
});

describe('defaultXaiRealtimePricer', () => {
  it('prices a full hour to exactly the per-hour rate', () => {
    expect(defaultXaiRealtimePricer('grok-voice-think-fast-1.0', 3600)).toBeCloseTo(3.0, 6);
  });

  it('prices a partial session pro-rata by duration', () => {
    // 90s of a $3/hr session = 3 * 90/3600 = $0.075
    expect(defaultXaiRealtimePricer('grok-voice-think-fast-1.0', 90)).toBeCloseTo(0.075, 6);
  });

  it('prices a zero-duration session at $0 (open-then-immediately-close)', () => {
    expect(defaultXaiRealtimePricer('grok-voice-think-fast-1.0', 0)).toBe(0);
  });

  it('throws on an unknown model so callers cannot silently undercount', () => {
    expect(() => defaultXaiRealtimePricer('grok-voice-imaginary', 3600)).toThrowError(
      /No xAI realtime voice pricing configured/
    );
  });
});

describe('RealtimePricer union — per-duration variant is now implemented (slice D)', () => {
  it('admits the real xAI pricer as a per-duration variant and prices by duration', () => {
    const pricer: RealtimePricer = { kind: 'per-duration', price: defaultXaiRealtimePricer };
    expect(pricer.kind).toBe('per-duration');
    if (pricer.kind === 'per-duration') {
      expect(pricer.price('grok-voice-think-fast-1.0', 1800)).toBeCloseTo(1.5, 6); // half hour
    }
  });

  it('per-token and per-duration variants coexist under one union type', () => {
    const perToken: RealtimePricer = { kind: 'per-token', price: defaultOpenAIRealtimePricer };
    const perDuration: RealtimePricer = { kind: 'per-duration', price: defaultXaiRealtimePricer };
    // The discriminant selects the accrual model at the call site.
    const priceIt = (p: RealtimePricer): number =>
      p.kind === 'per-token'
        ? p.price('gpt-realtime-2.1', {
            audioInputTokens: 1_000_000,
            cachedAudioInputTokens: 0,
            audioOutputTokens: 0,
          })
        : p.price('grok-voice-think-fast-1.0', 3600);
    expect(priceIt(perToken)).toBeCloseTo(32, 6);
    expect(priceIt(perDuration)).toBeCloseTo(3.0, 6);
  });
});
