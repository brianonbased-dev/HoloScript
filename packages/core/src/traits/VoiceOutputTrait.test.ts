import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceOutputTrait, VoiceOutputConfig } from './VoiceOutputTrait';

// Mock SpeechSynthesis
class MockUtterance {
  text: string;
  voice: any = null;
  pitch = 1;
  rate = 1;
  volume = 1;
  onend: Function | null = null;
  onerror: Function | null = null;
  onboundary: Function | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('VoiceOutputTrait', () => {
  let mockSynth: any;

  beforeEach(() => {
    mockSynth = {
      speak: vi.fn().mockImplementation((utt) => {
        // Auto-complete immediately for testing
        if (utt.onend) setTimeout(utt.onend, 0);
      }),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn().mockReturnValue([{ name: 'Google US English', lang: 'en-US' }]),
    };

    // Mock window.speechSynthesis
    vi.stubGlobal('window', { speechSynthesis: mockSynth });
    vi.stubGlobal('speechSynthesis', mockSynth);
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should initialize and get voices', () => {
    const trait = new VoiceOutputTrait();
    expect(trait.getBrowserVoices()).toHaveLength(1);
  });

  it('should enqueue and speak text', () => {
    const trait = new VoiceOutputTrait();
    const spy = vi.fn();
    trait.on('start', spy);
    trait.on('end', spy);

    trait.speak('Hello World');

    expect(mockSynth.speak).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'start' }));

    // Fast forward for onEnd
    vi.runAllTimers();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'end' }));
  });

  it('should respect queue priority', () => {
    const trait = new VoiceOutputTrait();

    // Mock speak to NOT complete immediately so we can fill queue
    mockSynth.speak.mockImplementation(() => {});

    trait.speak('Low Priority', { priority: 0 });
    trait.speak('High Priority', { priority: 10 });

    // First one started immediately
    expect(mockSynth.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Low Priority' }));

    // Check queue - High Priority should be next
    const queueLen = trait.getQueueLength();
    expect(queueLen).toBe(1);

    // Now force 'Low Priority' to finish
    const currentUtterance = mockSynth.speak.mock.calls[0][0];
    currentUtterance.onend();

    // Next should be High Priority
    expect(mockSynth.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'High Priority' })
    );
  });

  it('should interrupt if configured', () => {
    const trait = new VoiceOutputTrait({ interrupt: true });

    mockSynth.speak.mockImplementation(() => {});

    trait.speak('First');
    expect(mockSynth.speak).toHaveBeenCalledTimes(1);

    trait.speak('Second');
    expect(mockSynth.cancel).toHaveBeenCalled();
    expect(mockSynth.speak).toHaveBeenCalledTimes(2);
    expect(mockSynth.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Second' }));
  });
});
