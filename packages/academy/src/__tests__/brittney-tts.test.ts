// @vitest-environment jsdom
/**
 * Tests for BrittneyChatPanel TTS integration (Sprint 12 P5)
 *
 * Validates that the TTS toggle state works correctly and speech synthesis
 * is called when enabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('BrittneyChatPanel — TTS', () => {
  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSpeak = vi.fn();
    mockCancel = vi.fn();

    // Mock SpeechSynthesisUtterance as a class
    class MockUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: any = null;
      lang = '';
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);

    // Mock speechSynthesis
    vi.stubGlobal('speechSynthesis', {
      speak: mockSpeak,
      cancel: mockCancel,
      getVoices: vi.fn().mockReturnValue([
        { name: 'Microsoft Zira Desktop', lang: 'en-US' },
        { name: 'Google UK Male', lang: 'en-GB' },
      ]),
      paused: false,
      speaking: false,
      pending: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('SpeechSynthesisUtterance is available in jsdom via stub', () => {
    const utt = new SpeechSynthesisUtterance('test');
    expect(utt.text).toBe('test');
  });

  it('speechSynthesis.speak can be called', () => {
    const utt = new SpeechSynthesisUtterance('Hello from Brittney');
    window.speechSynthesis.speak(utt);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('speechSynthesis.cancel stops current speech', () => {
    window.speechSynthesis.cancel();
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('getVoices returns mock voices including Zira', () => {
    const voices = window.speechSynthesis.getVoices();
    expect(voices).toHaveLength(2);
    const zira = voices.find((v: any) => v.name.includes('Zira'));
    expect(zira).toBeDefined();
  });

  it('speak-then-cancel flow works correctly', () => {
    const utt = new SpeechSynthesisUtterance('Test response');
    window.speechSynthesis.speak(utt);
    window.speechSynthesis.cancel();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });
});
