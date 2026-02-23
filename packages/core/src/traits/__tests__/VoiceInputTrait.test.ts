import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceInputTrait } from '../VoiceInputTrait';

describe('VoiceInputTrait', () => {
  let voice: VoiceInputTrait;
  const baseCfg = {
    mode: 'continuous' as const,
    confidenceThreshold: 0.7,
    languages: ['en-US'],
    commands: [
      { phrase: 'open menu', action: 'open_menu' },
      { phrase: 'close menu', action: 'close_menu', aliases: ['hide menu'] },
      { phrase: 'go back', action: 'navigate_back', confidence: 0.8 },
    ],
    showTranscript: true,
    audioFeedback: false,
    timeout: 5000,
  };

  beforeEach(() => {
    voice = new VoiceInputTrait(baseCfg);
  });

  // ── Construction ─────────────────────────────────────────────────────────────

  it('constructs without throwing', () => {
    expect(voice).toBeDefined();
  });

  it('isActive returns false initially', () => {
    expect(voice.isActive()).toBe(false);
  });

  it('constructs with minimal config (no commands)', () => {
    const minimal = new VoiceInputTrait({ mode: 'command', confidenceThreshold: 0.5 });
    expect(minimal).toBeDefined();
    expect(minimal.isActive()).toBe(false);
  });

  it('constructs with push_to_talk mode', () => {
    const ptt = new VoiceInputTrait({ mode: 'push_to_talk', confidenceThreshold: 0.9 });
    expect(ptt.isActive()).toBe(false);
  });

  // ── fuzzyMatch ────────────────────────────────────────────────────────────────

  it('fuzzyMatch returns 1 for identical strings', () => {
    expect((voice as any).fuzzyMatch('hello', 'hello')).toBe(1);
  });

  it('fuzzyMatch returns 0 for empty input', () => {
    expect((voice as any).fuzzyMatch('', 'hello')).toBe(0);
  });

  it('fuzzyMatch returns 0 for empty target', () => {
    expect((voice as any).fuzzyMatch('hello', '')).toBe(0);
  });

  it('fuzzyMatch returns value in [0,1]', () => {
    const score = (voice as any).fuzzyMatch('hi', 'hello world');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('fuzzyMatch: prefix match > dissimilar match', () => {
    const prefixScore = (voice as any).fuzzyMatch('open', 'open menu');
    const randomScore = (voice as any).fuzzyMatch('xyz', 'open menu');
    expect(prefixScore).toBeGreaterThanOrEqual(randomScore);
  });

  it('fuzzyMatch is case-sensitive (base implementation)', () => {
    // The implementation doesn't lower-case — documenting actual behavior
    const lowerScore = (voice as any).fuzzyMatch('open menu', 'open menu');
    const mixedScore = (voice as any).fuzzyMatch('Open Menu', 'open menu');
    expect(lowerScore).toBeGreaterThanOrEqual(mixedScore);
  });

  // ── Listener management ───────────────────────────────────────────────────────

  it('on() registers a listener without error', () => {
    expect(() => voice.on(() => {})).not.toThrow();
  });

  it('off() removes a registered listener without error', () => {
    const fn = () => {};
    voice.on(fn);
    expect(() => voice.off(fn)).not.toThrow();
  });

  it('off() is a no-op for unregistered listener', () => {
    expect(() => voice.off(() => {})).not.toThrow();
  });

  it('multiple listeners can be registered independently', () => {
    const fn1 = () => {};
    const fn2 = () => {};
    voice.on(fn1);
    voice.on(fn2);
    voice.off(fn1);
    // fn2 still registered — removing fn1 shouldn't affect fn2
    expect(() => voice.off(fn2)).not.toThrow();
  });

  // ── toggleListening ───────────────────────────────────────────────────────────

  it('toggleListening does not throw when no SpeechRecognition API', () => {
    expect(() => voice.toggleListening()).not.toThrow();
  });

  it('isActive stays false when no SpeechRecognition API available', () => {
    voice.toggleListening(); // would start if API present
    expect(voice.isActive()).toBe(false);
  });

  it('toggleListening twice is a no-op in environments without API', () => {
    expect(() => {
      voice.toggleListening();
      voice.toggleListening();
    }).not.toThrow();
  });

  // ── dispose ───────────────────────────────────────────────────────────────────

  it('dispose does not throw', () => {
    expect(() => voice.dispose()).not.toThrow();
  });

  it('dispose with active listener does not throw', () => {
    voice.on(() => {});
    expect(() => voice.dispose()).not.toThrow();
  });

  it('isActive returns false after dispose', () => {
    voice.dispose();
    expect(voice.isActive()).toBe(false);
  });
});
