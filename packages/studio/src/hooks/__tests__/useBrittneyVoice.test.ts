// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrittneyVoice } from '../useBrittneyVoice';

// Mock SpeechRecognition API
interface MockSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

let mockRecognitionInstance: MockSpeechRecognition | null = null;

const createMockRecognition = (): MockSpeechRecognition => ({
  continuous: false,
  interimResults: false,
  lang: 'en-US',
  onresult: null,
  onerror: null,
  onend: null,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
});

const MockSpeechRecognitionConstructor = vi.fn().mockImplementation(function () {
  mockRecognitionInstance = createMockRecognition();
  return mockRecognitionInstance;
});

describe('useBrittneyVoice', () => {
  beforeEach(() => {
    mockRecognitionInstance = null;
    vi.clearAllMocks();
    // Setup SpeechRecognition on window
    (global.window as any).SpeechRecognition = MockSpeechRecognitionConstructor;
  });

  afterEach(() => {
    delete (global.window as any).SpeechRecognition;
    delete (global.window as any).webkitSpeechRecognition;
    mockRecognitionInstance = null;
  });

  describe('Browser Support Detection', () => {
    it('should detect SpeechRecognition support', () => {
      const { result } = renderHook(() => useBrittneyVoice());
      expect(result.current.isSupported).toBe(true);
    });

    it('should detect webkit prefixed API', () => {
      delete (global.window as any).SpeechRecognition;
      (global.window as any).webkitSpeechRecognition = MockSpeechRecognitionConstructor;

      const { result } = renderHook(() => useBrittneyVoice());
      expect(result.current.isSupported).toBe(true);
    });

    it('should detect no support when API unavailable', () => {
      delete (global.window as any).SpeechRecognition;

      const { result } = renderHook(() => useBrittneyVoice());
      expect(result.current.isSupported).toBe(false);
    });
  });

  describe('Initial State', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      expect(result.current.isListening).toBe(false);
      expect(result.current.transcript).toBe('');
      expect(result.current.interimTranscript).toBe('');
    });

    it('should provide control functions', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      expect(typeof result.current.startListening).toBe('function');
      expect(typeof result.current.stopListening).toBe('function');
      expect(typeof result.current.clearTranscript).toBe('function');
    });
  });

  describe('Start Listening', () => {
    it('should create recognition instance on start', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      expect(MockSpeechRecognitionConstructor).toHaveBeenCalled();
      expect(mockRecognitionInstance).not.toBeNull();
    });

    it('should configure recognition with correct settings', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      expect(mockRecognitionInstance!.continuous).toBe(true);
      expect(mockRecognitionInstance!.interimResults).toBe(true);
      expect(mockRecognitionInstance!.lang).toBe('en-US');
    });

    it('should call start on recognition instance', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      expect(mockRecognitionInstance!.start).toHaveBeenCalled();
    });

    it('should set isListening to true', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      expect(result.current.isListening).toBe(false);

      act(() => {
        result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);
    });

    it('should not start if already listening', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      const firstInstance = mockRecognitionInstance;

      act(() => {
        result.current.startListening();
      });

      // Should still be the same instance
      expect(MockSpeechRecognitionConstructor).toHaveBeenCalledTimes(1);
      expect(mockRecognitionInstance).toBe(firstInstance);
    });

    it('should not start if API is not supported', () => {
      delete (global.window as any).SpeechRecognition;

      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      expect(MockSpeechRecognitionConstructor).not.toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
    });
  });

  describe('Stop Listening', () => {
    it('should call stop on recognition instance', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
      });

      expect(mockRecognitionInstance!.stop).toHaveBeenCalled();
    });

    it('should set isListening to false', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);

      act(() => {
        result.current.stopListening();
      });

      expect(result.current.isListening).toBe(false);
    });

    it('should clear interim transcript', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      // Simulate interim result
      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: false,
              0: { transcript: 'interim text' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.interimTranscript).toBe('interim text');

      act(() => {
        result.current.stopListening();
      });

      expect(result.current.interimTranscript).toBe('');
    });

    it('should handle stop when not listening', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      expect(() => {
        act(() => {
          result.current.stopListening();
        });
      }).not.toThrow();
    });
  });

  describe('Transcript Handling', () => {
    it('should update transcript on final result', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: 'hello world' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.transcript).toBe('hello world');
    });

    it('should append multiple final results', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event1 = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: 'hello ' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event1);
      });

      act(() => {
        const event2 = {
          resultIndex: 1,
          results: [
            { isFinal: true, 0: { transcript: 'hello ' }, length: 1 },
            {
              isFinal: true,
              0: { transcript: 'world' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event2);
      });

      expect(result.current.transcript).toBe('hello world');
    });

    it('should update interim transcript for non-final results', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: false,
              0: { transcript: 'partial...' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.interimTranscript).toBe('partial...');
      expect(result.current.transcript).toBe('');
    });

    it('should handle mixed final and interim results', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: 'confirmed ' },
              length: 1,
            },
            {
              isFinal: false,
              0: { transcript: 'maybe' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.transcript).toBe('confirmed ');
      expect(result.current.interimTranscript).toBe('maybe');
    });
  });

  describe('Clear Transcript', () => {
    it('should clear both transcripts', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      // Add some content
      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: 'some text' },
              length: 1,
            },
            {
              isFinal: false,
              0: { transcript: 'interim' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.transcript).not.toBe('');
      expect(result.current.interimTranscript).not.toBe('');

      act(() => {
        result.current.clearTranscript();
      });

      expect(result.current.transcript).toBe('');
      expect(result.current.interimTranscript).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should set isListening to false on error', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);

      act(() => {
        const errorEvent = {
          error: 'no-speech',
        };
        mockRecognitionInstance!.onerror!(errorEvent);
      });

      expect(result.current.isListening).toBe(false);
    });

    it('should handle network error', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const errorEvent = {
          error: 'network',
        };
        mockRecognitionInstance!.onerror!(errorEvent);
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[BrittneyVoice] SpeechRecognition error:',
        'network'
      );
      expect(result.current.isListening).toBe(false);

      consoleWarnSpy.mockRestore();
    });

    it('should handle aborted error', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const errorEvent = {
          error: 'aborted',
        };
        mockRecognitionInstance!.onerror!(errorEvent);
      });

      expect(result.current.isListening).toBe(false);
    });
  });

  describe('Recognition End Event', () => {
    it('should set isListening to false on end', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);

      act(() => {
        mockRecognitionInstance!.onend!();
      });

      expect(result.current.isListening).toBe(false);
    });

    it('should clear interim transcript on end', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      // Add interim transcript
      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: false,
              0: { transcript: 'interim' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.interimTranscript).toBe('interim');

      act(() => {
        mockRecognitionInstance!.onend!();
      });

      expect(result.current.interimTranscript).toBe('');
    });

    it('should preserve final transcript on end', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: 'final text' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      const transcriptBeforeEnd = result.current.transcript;

      act(() => {
        mockRecognitionInstance!.onend!();
      });

      expect(result.current.transcript).toBe(transcriptBeforeEnd);
      expect(result.current.transcript).toBe('final text');
    });
  });

  describe('Cleanup', () => {
    it('should abort recognition on unmount', () => {
      const { result, unmount } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      const instance = mockRecognitionInstance;

      unmount();

      expect(instance!.abort).toHaveBeenCalled();
    });

    it('should not throw if unmounted without starting', () => {
      const { unmount } = renderHook(() => useBrittneyVoice());

      expect(() => {
        unmount();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty result', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event = {
          resultIndex: 0,
          results: [],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.transcript).toBe('');
      expect(result.current.interimTranscript).toBe('');
    });

    it('should handle result with empty transcript', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: '' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.transcript).toBe('');
    });

    it('should handle rapid start/stop cycles', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      expect(() => {
        act(() => {
          result.current.startListening();
          result.current.stopListening();
          result.current.startListening();
          result.current.stopListening();
        });
      }).not.toThrow();

      expect(result.current.isListening).toBe(false);
    });

    it('should handle multiple results in single event', () => {
      const { result } = renderHook(() => useBrittneyVoice());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        const event = {
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              0: { transcript: 'first ' },
              length: 1,
            },
            {
              isFinal: true,
              0: { transcript: 'second ' },
              length: 1,
            },
            {
              isFinal: false,
              0: { transcript: 'interim' },
              length: 1,
            },
          ],
        };
        mockRecognitionInstance!.onresult!(event);
      });

      expect(result.current.transcript).toBe('first second ');
      expect(result.current.interimTranscript).toBe('interim');
    });
  });
});
