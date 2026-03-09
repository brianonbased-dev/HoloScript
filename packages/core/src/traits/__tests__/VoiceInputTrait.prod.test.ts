/**
 * VoiceInputTrait Production Tests
 *
 * Class-based trait testing: construction, start/stop/toggle listening,
 * command matching (exact + fuzzy), listener management, dispose, and
 * factory function. Mocks Web Speech API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceInputTrait, createVoiceInputTrait, type VoiceInputConfig } from '../VoiceInputTrait';

// =============================================================================
// MOCK WEB SPEECH API
// =============================================================================

let lastMockInstance: MockSpeechRecognition | null = null;

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = 'en-US';
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  start = vi.fn(() => {
    this.onstart?.();
  });
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();

  constructor() {
    lastMockInstance = this;
  }
}

function getMock(): MockSpeechRecognition {
  return lastMockInstance!;
}

// =============================================================================
// HELPERS
// =============================================================================

function makeConfig(overrides: Partial<VoiceInputConfig> = {}): VoiceInputConfig {
  return {
    mode: 'continuous',
    confidenceThreshold: 0.7,
    languages: ['en-US'],
    commands: [
      { phrase: 'open menu', action: 'openMenu' },
      { phrase: 'close', aliases: ['shut', 'dismiss'], action: 'close' },
      { phrase: 'select', confidence: 0.9, action: 'select' },
    ],
    audioFeedback: false, // Disable beeps in tests
    showTranscript: false,
    timeout: 5000,
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('VoiceInputTrait — Production', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Assign the class itself so `new SpeechRecognition()` works
    (globalThis as any).SpeechRecognition = MockSpeechRecognition;
  });

  afterEach(() => {
    delete (globalThis as any).SpeechRecognition;
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('creates with default overrides', () => {
      const trait = new VoiceInputTrait(makeConfig());
      expect(trait.isActive()).toBe(false);
    });

    it('applies default audioFeedback and timeout', () => {
      const trait = new VoiceInputTrait({ mode: 'push-to-talk', confidenceThreshold: 0.5 });
      // Should not throw
      expect(trait).toBeDefined();
    });

    it('handles missing SpeechRecognition gracefully', () => {
      delete (globalThis as any).SpeechRecognition;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const trait = new VoiceInputTrait(makeConfig());
      expect(trait).toBeDefined();
      // Start should be a no-op
      trait.startListening();
      expect(trait.isActive()).toBe(false);

      spy.mockRestore();
    });
  });

  // ======== START / STOP / TOGGLE ========

  describe('listening lifecycle', () => {
    it('starts listening', () => {
      const trait = new VoiceInputTrait(makeConfig());
      trait.startListening();

      expect(getMock().start).toHaveBeenCalled();
      expect(trait.isActive()).toBe(true);
    });

    it('stops listening', () => {
      const trait = new VoiceInputTrait(makeConfig());
      trait.startListening();
      trait.stopListening();

      expect(getMock().stop).toHaveBeenCalled();
      expect(trait.isActive()).toBe(false);
    });

    it('does not start when already listening', () => {
      const trait = new VoiceInputTrait(makeConfig());
      trait.startListening();
      getMock().start.mockClear();

      trait.startListening();
      expect(getMock().start).not.toHaveBeenCalled();
    });

    it('does not stop when not listening', () => {
      const trait = new VoiceInputTrait(makeConfig());
      trait.stopListening();
      expect(getMock().stop).not.toHaveBeenCalled();
    });

    it('toggles from off to on', () => {
      const trait = new VoiceInputTrait(makeConfig());
      trait.toggleListening();
      expect(trait.isActive()).toBe(true);
    });

    it('toggles from on to off', () => {
      const trait = new VoiceInputTrait(makeConfig());
      trait.startListening();
      trait.toggleListening();
      expect(trait.isActive()).toBe(false);
    });
  });

  // ======== COMMAND MATCHING ========

  describe('command matching', () => {
    it('matches exact command and emits final event', () => {
      const listener = vi.fn();
      const trait = new VoiceInputTrait(makeConfig());
      trait.on(listener);
      trait.startListening();

      // Simulate recognition result
      getMock().onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: 'open menu', confidence: 0.95 },
            isFinal: true,
            length: 1,
          },
        ],
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'final',
          result: expect.objectContaining({
            transcript: 'open menu',
            confidence: 0.95,
            isFinal: true,
            matchedCommand: expect.objectContaining({ action: 'openMenu' }),
          }),
        })
      );
    });

    it('filters below confidence threshold', () => {
      const listener = vi.fn();
      const trait = new VoiceInputTrait(makeConfig());
      trait.on(listener);
      trait.startListening();

      getMock().onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: 'open menu', confidence: 0.3 }, // below 0.7
            isFinal: true,
            length: 1,
          },
        ],
      });

      // Should NOT emit because confidence too low
      expect(listener).not.toHaveBeenCalled();
    });

    it('fuzzy matches alias', () => {
      const listener = vi.fn();
      const trait = new VoiceInputTrait(makeConfig());
      trait.on(listener);
      trait.startListening();

      getMock().onresult?.({
        resultIndex: 0,
        results: [
          {
            0: { transcript: 'shut', confidence: 0.85 },
            isFinal: true,
            length: 1,
          },
        ],
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'final',
          result: expect.objectContaining({
            matchedCommand: expect.objectContaining({ action: 'close' }),
          }),
        })
      );
    });

    it('does not match unrecognized commands', () => {
      const listener = vi.fn();
      const trait = new VoiceInputTrait(makeConfig());
      trait.on(listener);
      trait.startListening();

      getMock().onresult?.({
        resultIndex: 0,
        results: [
          {
            0: {
              transcript: 'this is a completely unrelated and very long sentence',
              confidence: 0.9,
            },
            isFinal: true,
            length: 1,
          },
        ],
      });

      // Still emits event but without matchedCommand
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'final',
          result: expect.objectContaining({
            matchedCommand: undefined,
          }),
        })
      );
    });
  });

  // ======== ERROR HANDLING ========

  describe('error handling', () => {
    it('emits error event on recognition error', () => {
      const listener = vi.fn();
      const trait = new VoiceInputTrait(makeConfig());
      trait.on(listener);

      getMock().onerror?.({ error: 'no-speech' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
        })
      );
    });
  });

  // ======== LISTENER MANAGEMENT ========

  describe('listener management', () => {
    it('adds and removes listeners', () => {
      const trait = new VoiceInputTrait(makeConfig());
      const listener = vi.fn();

      trait.on(listener);
      trait.startListening();

      getMock().onerror?.({ error: 'test' });
      expect(listener).toHaveBeenCalledTimes(1);

      trait.off(listener);
      getMock().onerror?.({ error: 'test2' });
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  // ======== DISPOSE ========

  describe('dispose', () => {
    it('aborts recognition and clears listeners', () => {
      const trait = new VoiceInputTrait(makeConfig());
      const listener = vi.fn();
      trait.on(listener);

      trait.dispose();

      expect(getMock().abort).toHaveBeenCalled();

      // Listener should be removed
      getMock().onerror?.({ error: 'post-dispose' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ======== FACTORY ========

  describe('factory', () => {
    it('createVoiceInputTrait returns a VoiceInputTrait', () => {
      const trait = createVoiceInputTrait(makeConfig());
      expect(trait).toBeInstanceOf(VoiceInputTrait);
    });
  });
});
