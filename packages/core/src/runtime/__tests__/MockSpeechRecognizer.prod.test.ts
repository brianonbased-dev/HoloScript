/**
 * MockSpeechRecognizer Production Tests
 *
 * SpeechRecognizer interface: initialize, transcribe with/without phonemes,
 * phoneme generation, stop, dispose.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockSpeechRecognizer } from '../MockSpeechRecognizer';

describe('MockSpeechRecognizer — Production', () => {
  let recognizer: MockSpeechRecognizer;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    recognizer = new MockSpeechRecognizer();
    await recognizer.initialize({ backend: 'whisper' } as any);
  });

  it('initializes with config', () => {
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('whisper'));
  });

  it('transcribes returning segments', async () => {
    const segments = await recognizer.transcribe(new ArrayBuffer(100));
    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe('Hello');
    expect(segments[1].text).toBe('HoloLand');
    expect(segments[0].start).toBeLessThan(segments[0].end);
  });

  it('transcribes with phoneme mode', async () => {
    const segments = await recognizer.transcribe(new ArrayBuffer(100), { phonemeMode: true });
    expect(segments[0].phonemes).toBeDefined();
    expect(segments[0].phonemes!.length).toBe(4); // hh, eh, l, ow
    expect(segments[0].phonemes![0].phoneme).toBe('hh');
    expect(segments[1].phonemes!.length).toBe(8); // hololand
  });

  it('transcribes without phonemes when mode is off', async () => {
    const segments = await recognizer.transcribe(new ArrayBuffer(100), { phonemeMode: false });
    expect(segments[0].phonemes).toBeUndefined();
  });

  it('phonemes have correct timing', async () => {
    const segments = await recognizer.transcribe(new ArrayBuffer(100), { phonemeMode: true });
    const phonemes = segments[0].phonemes!;
    for (let i = 1; i < phonemes.length; i++) {
      expect(phonemes[i].time).toBeGreaterThan(phonemes[i - 1].time);
    }
    expect(phonemes[0].duration).toBe(0.15);
    expect(phonemes[0].weight).toBe(1.0);
  });

  it('stop and dispose do not throw', () => {
    expect(() => recognizer.stop()).not.toThrow();
    expect(() => recognizer.dispose()).not.toThrow();
  });
});
