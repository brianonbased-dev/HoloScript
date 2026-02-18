import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceInputTrait } from '../VoiceInputTrait';

describe('VoiceInputTrait', () => {
  let voice: VoiceInputTrait;

  beforeEach(() => {
    voice = new VoiceInputTrait({
      mode: 'continuous',
      confidenceThreshold: 0.7,
      languages: ['en-US'],
      commands: [
        { phrase: 'open menu', action: 'open_menu' },
        { phrase: 'close menu', action: 'close_menu', aliases: ['hide menu'] },
      ],
      showTranscript: true,
      audioFeedback: false,
      timeout: 5000,
    });
  });

  it('initializes without throwing', () => {
    expect(voice).toBeDefined();
  });

  it('isActive returns false initially', () => {
    expect(voice.isActive()).toBe(false);
  });

  it('fuzzyMatch scores identical strings as 1', () => {
    const score = (voice as any).fuzzyMatch('hello', 'hello');
    expect(score).toBe(1);
  });

  it('fuzzyMatch scores different-length strings lower', () => {
    // Algorithm uses length difference, so different-length strings score lower
    const score = (voice as any).fuzzyMatch('hi', 'hello world');
    expect(score).toBeLessThan(1);
  });

  it('fuzzyMatch returns 0 for empty string', () => {
    const score = (voice as any).fuzzyMatch('', 'hello');
    expect(score).toBe(0);
  });

  it('fuzzyMatch substring gives proportional score', () => {
    const score = (voice as any).fuzzyMatch('open', 'open menu');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('on registers listener without error', () => {
    expect(() => voice.on(() => {})).not.toThrow();
  });

  it('off removes listener without error', () => {
    const fn = () => {};
    voice.on(fn);
    expect(() => voice.off(fn)).not.toThrow();
  });

  it('toggleListening does not throw without recognition', () => {
    expect(() => voice.toggleListening()).not.toThrow();
  });

  it('dispose does not throw', () => {
    expect(() => voice.dispose()).not.toThrow();
  });
});
