// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMonacoAutocomplete } from '../useMonacoAutocomplete';
import type { Monaco } from '@monaco-editor/react';

describe('useMonacoAutocomplete', () => {
  let mockMonaco: Monaco;
  let mockDisposable: { dispose: ReturnType<typeof vi.fn> };
  let mockModel: any;
  let mockProviderCallback: any;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock disposable
    mockDisposable = {
      dispose: vi.fn(),
    };

    // Mock Monaco instance
    mockMonaco = {
      languages: {
        registerInlineCompletionsProvider: vi.fn((languageId: string, provider: any) => {
          mockProviderCallback = provider.provideInlineCompletions;
          return mockDisposable;
        }),
      },
    } as any;

    // Mock text model
    mockModel = {
      getValueInRange: vi.fn((range: any) => {
        // Simulate getting text from range
        if (range.startLineNumber === 1 && range.endLineNumber === 1) {
          return 'scene "Main" {';
        }
        if (range.startLineNumber === 1 && range.endLineNumber === 5) {
          return '}\n\nmodel "Box" {}';
        }
        return '';
      }),
      getLineCount: vi.fn(() => 5),
      getLineMaxColumn: vi.fn((line: number) => 20),
    };

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Registration', () => {
    it('should register inline completions provider when monaco is provided', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalledWith(
        'holo',
        expect.objectContaining({
          provideInlineCompletions: expect.any(Function),
          freeInlineCompletions: expect.any(Function),
        })
      );
    });

    it('should not register when monaco is null', () => {
      renderHook(() => useMonacoAutocomplete(null));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).not.toHaveBeenCalled();
    });

    it('should not register when enabled is false', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco, { enabled: false }));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).not.toHaveBeenCalled();
    });

    it('should register when enabled is true', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco, { enabled: true }));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalled();
    });

    it('should use default debounce time when not specified', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco));

      // Provider should be registered (debounce is used internally)
      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalled();
    });

    it('should accept custom debounce time', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 500 }));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalled();
    });
  });

  describe('Provider Callback', () => {
    it('should provide inline completions when called', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: '\n  box "Cube" {}' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(1);
          expect(result.items[0].insertText).toBe('\n  box "Cube" {}');
        },
        { timeout: 1000 }
      );
    });

    it('should extract prefix from start to cursor position', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: '' }),
      });

      mockModel.getValueInRange.mockImplementation((range: any) => {
        if (range.startLineNumber === 1 && range.endLineNumber === 2 && range.endColumn === 5) {
          return 'scene "Main" {\n  box';
        }
        return '';
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 2, column: 5 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await resultPromise;
          expect(mockModel.getValueInRange).toHaveBeenCalledWith({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 5,
          });
        },
        { timeout: 1000 }
      );
    });

    it('should extract suffix from cursor position to end', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: '' }),
      });

      mockModel.getValueInRange.mockImplementation((range: any) => {
        if (range.startLineNumber === 2 && range.endLineNumber === 5) {
          return '\n  }\n}';
        }
        return '';
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 2, column: 5 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await resultPromise;
          expect(mockModel.getValueInRange).toHaveBeenCalledWith({
            startLineNumber: 2,
            startColumn: 5,
            endLineNumber: 5,
            endColumn: 20,
          });
        },
        { timeout: 1000 }
      );
    });
  });

  describe('API Calls', () => {
    it('should POST to /api/autocomplete with prefix and suffix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: 'test' }),
      });

      mockModel.getValueInRange
        .mockReturnValueOnce('scene "Main" {') // prefix
        .mockReturnValueOnce('\n}'); // suffix

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await resultPromise;
          expect(mockFetch).toHaveBeenCalledWith('/api/autocomplete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prefix: 'scene "Main" {',
              suffix: '\n}',
              maxTokens: 64,
            }),
          });
        },
        { timeout: 1000 }
      );
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(0);
        },
        { timeout: 1000 }
      );
    });

    it('should handle missing completion field in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(0);
        },
        { timeout: 1000 }
      );
    });

    it('should handle empty completion string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: '' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(0);
        },
        { timeout: 1000 }
      );
    });
  });

  describe('Debouncing', () => {
    it('should debounce multiple rapid calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ completion: 'test' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 100 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      // Fire 3 rapid calls
      mockProviderCallback(mockModel, position, {}, token);
      mockProviderCallback(mockModel, position, {}, token);
      const lastPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await lastPromise;
          // Should only make 1 fetch call after debounce
          expect(mockFetch).toHaveBeenCalledTimes(1);
        },
        { timeout: 1000 }
      );
    });

    it('should use custom debounce time', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: 'test' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 200 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const startTime = Date.now();
      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await resultPromise;
          const elapsed = Date.now() - startTime;
          // Should wait at least 150ms (allowing some margin)
          expect(elapsed).toBeGreaterThanOrEqual(150);
        },
        { timeout: 1000 }
      );
    });
  });

  describe('Cancellation', () => {
    it('should return empty items when cancellation is requested before debounce', async () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: true };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(0);
        },
        { timeout: 1000 }
      );

      // Should not make fetch call
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty items when cancellation is requested after fetch', async () => {
      mockFetch.mockImplementation(async () => {
        // Simulate delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({ completion: 'test' }),
        };
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      // Request cancellation after fetch starts
      await new Promise((resolve) => setTimeout(resolve, 75));
      token.isCancellationRequested = true;

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(0);
        },
        { timeout: 1000 }
      );
    });
  });

  describe('Completion Item Format', () => {
    it('should create completion item with correct range', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: '\n  box "Cube" {}' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 3, column: 10 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items[0].range).toEqual({
            startLineNumber: 3,
            startColumn: 10,
            endLineNumber: 3,
            endColumn: 10,
          });
        },
        { timeout: 1000 }
      );
    });

    it('should include insertText from API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: 'position: [1, 2, 3]' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 2, column: 5 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items[0].insertText).toBe('position: [1, 2, 3]');
        },
        { timeout: 1000 }
      );
    });

    it('should handle multi-line completion text', async () => {
      const multilineCompletion = `\n  box "Cube" {\n    position: [0, 0, 0]\n  }`;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: multilineCompletion }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items[0].insertText).toBe(multilineCompletion);
        },
        { timeout: 1000 }
      );
    });
  });

  describe('Cleanup', () => {
    it('should dispose provider on unmount', () => {
      const { unmount } = renderHook(() => useMonacoAutocomplete(mockMonaco));

      unmount();

      expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('should clear pending timeout on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount } = renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      // Trigger provider to start timeout
      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };
      mockProviderCallback(mockModel, position, {}, token);

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should not throw when disposing with no active provider', () => {
      const { unmount } = renderHook(() => useMonacoAutocomplete(null));

      expect(() => unmount()).not.toThrow();
    });

    it('should dispose old provider when monaco changes', () => {
      const { rerender } = renderHook(({ monaco }) => useMonacoAutocomplete(monaco), {
        initialProps: { monaco: mockMonaco },
      });

      const firstDispose = mockDisposable.dispose;

      // Create new monaco instance
      const newMockMonaco = {
        languages: {
          registerInlineCompletionsProvider: vi.fn(() => ({
            dispose: vi.fn(),
          })),
        },
      } as any;

      rerender({ monaco: newMockMonaco });

      expect(firstDispose).toHaveBeenCalled();
    });
  });

  describe('Options Handling', () => {
    it('should work with no options provided', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalled();
    });

    it('should work with empty options object', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco, {}));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalled();
    });

    it('should use default enabled (true) when not specified', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 100 }));

      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalled();
    });

    it('should use default debounce (300ms) when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: 'test' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { enabled: true }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const startTime = Date.now();
      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await resultPromise;
          const elapsed = Date.now() - startTime;
          // Should wait at least 250ms (300ms - margin)
          expect(elapsed).toBeGreaterThanOrEqual(250);
        },
        { timeout: 1000 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle model with single line', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: ' {}' }),
      });

      mockModel.getLineCount.mockReturnValueOnce(1);
      mockModel.getValueInRange
        .mockReturnValueOnce('scene "Main"') // prefix
        .mockReturnValueOnce(''); // suffix

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 13 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(1);
        },
        { timeout: 1000 }
      );
    });

    it('should handle cursor at start of document', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: 'scene "Main" {}' }),
      });

      mockModel.getValueInRange
        .mockReturnValueOnce('') // prefix (empty at start)
        .mockReturnValueOnce('\n\nmodel "Box" {}'); // suffix

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 1 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await resultPromise;
          expect(mockFetch).toHaveBeenCalledWith(
            '/api/autocomplete',
            expect.objectContaining({
              body: JSON.stringify({
                prefix: '',
                suffix: '\n\nmodel "Box" {}',
                maxTokens: 64,
              }),
            })
          );
        },
        { timeout: 1000 }
      );
    });

    it('should handle cursor at end of document', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: '\n}' }),
      });

      mockModel.getValueInRange
        .mockReturnValueOnce('scene "Main" {\n  box "Cube" {') // prefix
        .mockReturnValueOnce(''); // suffix (empty at end)

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 5, column: 20 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          await resultPromise;
          expect(mockFetch).toHaveBeenCalledWith(
            '/api/autocomplete',
            expect.objectContaining({
              body: JSON.stringify({
                prefix: 'scene "Main" {\n  box "Cube" {',
                suffix: '',
                maxTokens: 64,
              }),
            })
          );
        },
        { timeout: 1000 }
      );
    });

    it('should handle very long prefix text', async () => {
      const longPrefix = 'scene "Main" {\n'.repeat(100);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: '  box "Cube" {}' }),
      });

      mockModel.getValueInRange.mockReturnValueOnce(longPrefix).mockReturnValueOnce('\n}');

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 50, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(1);
        },
        { timeout: 1000 }
      );
    });

    it('should handle special characters in completion', async () => {
      const specialCompletion = '\n  // Comment with special chars: @#$%^&*()\n  box "Test" {}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: specialCompletion }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 50 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items[0].insertText).toBe(specialCompletion);
        },
        { timeout: 1000 }
      );
    });

    it('should handle rapid enable/disable toggling', () => {
      const { rerender } = renderHook(
        ({ enabled }) => useMonacoAutocomplete(mockMonaco, { enabled }),
        { initialProps: { enabled: true } }
      );

      expect(mockMonaco.languages.registerInlineCompletionsProvider).toHaveBeenCalledTimes(1);

      rerender({ enabled: false });
      rerender({ enabled: true });
      rerender({ enabled: false });

      // Should dispose and re-register appropriately
      expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('should handle zero debounce time', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ completion: 'test' }),
      });

      renderHook(() => useMonacoAutocomplete(mockMonaco, { debounceMs: 0 }));

      const position = { lineNumber: 1, column: 15 };
      const token = { isCancellationRequested: false };

      const resultPromise = mockProviderCallback(mockModel, position, {}, token);

      await waitFor(
        async () => {
          const result = await resultPromise;
          expect(result.items).toHaveLength(1);
        },
        { timeout: 500 }
      );
    });
  });

  describe('Free Inline Completions', () => {
    it('should provide freeInlineCompletions method', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco));

      const registrationCall = (mockMonaco.languages.registerInlineCompletionsProvider as any).mock
        .calls[0];
      const provider = registrationCall[1];

      expect(provider.freeInlineCompletions).toBeInstanceOf(Function);
    });

    it('should not throw when freeInlineCompletions is called', () => {
      renderHook(() => useMonacoAutocomplete(mockMonaco));

      const registrationCall = (mockMonaco.languages.registerInlineCompletionsProvider as any).mock
        .calls[0];
      const provider = registrationCall[1];

      expect(() => provider.freeInlineCompletions()).not.toThrow();
    });
  });
});
