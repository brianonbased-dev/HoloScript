// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBrittneyHistory, type ChatMessage } from '../useBrittneyHistory';

describe('useBrittneyHistory', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};

    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: vi.fn(() => {
          mockLocalStorage = {};
        }),
      },
      writable: true,
    });

    // Mock Date.now for timestamp testing
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty history', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      expect(result.current.history).toEqual([]);
    });

    it('should load history from localStorage on mount', async () => {
      const storedMessages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: 123 },
        { role: 'assistant', content: 'Hi there', timestamp: 456 },
      ];
      mockLocalStorage['brittney-history-test-project'] = JSON.stringify(storedMessages);

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      // Wait for useEffect to run
      await vi.waitFor(() => {
        expect(result.current.history).toEqual(storedMessages);
      });
    });

    it('should return empty array if no localStorage data', async () => {
      const { result } = renderHook(() => useBrittneyHistory('new-project'));

      await vi.waitFor(() => {
        expect(result.current.history).toEqual([]);
      });
    });

    it('should use default projectId if empty string provided', async () => {
      mockLocalStorage['brittney-history-default'] = JSON.stringify([
        { role: 'user', content: 'Test', timestamp: 789 },
      ]);

      const { result } = renderHook(() => useBrittneyHistory(''));

      await vi.waitFor(() => {
        expect(result.current.history).toHaveLength(1);
        expect(localStorage.getItem).toHaveBeenCalledWith('brittney-history-default');
      });
    });
  });

  describe('Add Message', () => {
    it('should add user message to history', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: 'Hello Brittney' });
      });

      expect(result.current.history).toEqual([
        { role: 'user', content: 'Hello Brittney', timestamp: 1000000 },
      ]);
    });

    it('should add assistant message to history', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'assistant', content: 'Hi! How can I help?' });
      });

      expect(result.current.history).toEqual([
        { role: 'assistant', content: 'Hi! How can I help?', timestamp: 1000000 },
      ]);
    });

    it('should add timestamp if not provided', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: 'Test' });
      });

      expect(result.current.history[0].timestamp).toBe(1000000);
    });

    it('should preserve provided timestamp', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: 'Test', timestamp: 555 });
      });

      expect(result.current.history[0].timestamp).toBe(555);
    });

    it('should add multiple messages', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: 'First' });
      });

      act(() => {
        result.current.addMessage({ role: 'assistant', content: 'Second' });
      });

      act(() => {
        result.current.addMessage({ role: 'user', content: 'Third' });
      });

      expect(result.current.history).toHaveLength(3);
      expect(result.current.history[0].content).toBe('First');
      expect(result.current.history[1].content).toBe('Second');
      expect(result.current.history[2].content).toBe('Third');
    });

    it('should persist messages to localStorage', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: 'Save me' });
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'brittney-history-test-project',
        JSON.stringify([{ role: 'user', content: 'Save me', timestamp: 1000000 }])
      );
    });
  });

  describe('Clear History', () => {
    it('should clear history state', async () => {
      mockLocalStorage['brittney-history-test-project'] = JSON.stringify([
        { role: 'user', content: 'Test', timestamp: 123 },
      ]);

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      await vi.waitFor(() => {
        expect(result.current.history).toHaveLength(1);
      });

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.history).toEqual([]);
    });

    it('should remove data from localStorage', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.clearHistory();
      });

      expect(localStorage.removeItem).toHaveBeenCalledWith('brittney-history-test-project');
    });

    it('should clear even if localStorage fails', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      // Mock removeItem to throw
      vi.mocked(localStorage.removeItem).mockImplementation(() => {
        throw new Error('Storage error');
      });

      act(() => {
        result.current.addMessage({ role: 'user', content: 'Test' });
      });

      expect(result.current.history).toHaveLength(1);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.history).toEqual([]);
    });
  });

  describe('Message Capping', () => {
    it('should cap messages at 200', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      // Add 250 messages
      act(() => {
        for (let i = 0; i < 250; i++) {
          result.current.addMessage({ role: 'user', content: `Message ${i}` });
        }
      });

      // Check that localStorage was called with only last 200
      const lastCall = vi.mocked(localStorage.setItem).mock.calls[
        vi.mocked(localStorage.setItem).mock.calls.length - 1
      ];
      const savedMessages = JSON.parse(lastCall[1]);

      expect(savedMessages).toHaveLength(200);
      expect(savedMessages[0].content).toBe('Message 50'); // First 50 dropped
      expect(savedMessages[199].content).toBe('Message 249');
    });

    it('should load all messages if under cap', async () => {
      const messages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`,
        timestamp: i,
      }));
      mockLocalStorage['brittney-history-test-project'] = JSON.stringify(messages);

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      await vi.waitFor(() => {
        expect(result.current.history).toHaveLength(50);
      });
    });
  });

  describe('Project ID Changes', () => {
    it('should reload history when projectId changes', async () => {
      mockLocalStorage['brittney-history-project-a'] = JSON.stringify([
        { role: 'user', content: 'Project A', timestamp: 1 },
      ]);
      mockLocalStorage['brittney-history-project-b'] = JSON.stringify([
        { role: 'user', content: 'Project B', timestamp: 2 },
      ]);

      const { result, rerender } = renderHook(({ projectId }) => useBrittneyHistory(projectId), {
        initialProps: { projectId: 'project-a' },
      });

      await vi.waitFor(() => {
        expect(result.current.history[0]?.content).toBe('Project A');
      });

      rerender({ projectId: 'project-b' });

      await vi.waitFor(() => {
        expect(result.current.history[0]?.content).toBe('Project B');
      });
    });

    it('should not persist messages to old projectId after change', async () => {
      const { result, rerender } = renderHook(({ projectId }) => useBrittneyHistory(projectId), {
        initialProps: { projectId: 'project-old' },
      });

      rerender({ projectId: 'project-new' });

      await vi.waitFor(() => {
        expect(result.current.history).toEqual([]);
      });

      act(() => {
        result.current.addMessage({ role: 'user', content: 'New message' });
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'brittney-history-project-new',
        expect.any(String)
      );
      expect(localStorage.setItem).not.toHaveBeenCalledWith(
        'brittney-history-project-old',
        expect.any(String)
      );
    });
  });

  describe('localStorage Error Handling', () => {
    it('should handle localStorage.getItem errors', async () => {
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      await vi.waitFor(() => {
        expect(result.current.history).toEqual([]);
      });
    });

    it('should handle localStorage.setItem errors', () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Quota exceeded');
      });

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      // Should not crash
      act(() => {
        result.current.addMessage({ role: 'user', content: 'Test' });
      });

      // State should still update
      expect(result.current.history).toHaveLength(1);
    });

    it('should handle invalid JSON in localStorage', async () => {
      mockLocalStorage['brittney-history-test-project'] = 'invalid json {';

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      await vi.waitFor(() => {
        expect(result.current.history).toEqual([]);
      });
    });

    it('should handle non-array data in localStorage', async () => {
      mockLocalStorage['brittney-history-test-project'] = JSON.stringify({
        notAnArray: 'value',
      });

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      await vi.waitFor(() => {
        expect(result.current.history).toEqual([]);
      });
    });

    it('should handle null in localStorage', async () => {
      mockLocalStorage['brittney-history-test-project'] = 'null';

      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      await vi.waitFor(() => {
        expect(result.current.history).toEqual([]);
      });
    });
  });

  describe('Callback Memoization', () => {
    it('should not recreate addMessage on re-render', () => {
      const { result, rerender } = renderHook(() => useBrittneyHistory('test-project'));

      const firstAddMessage = result.current.addMessage;

      rerender();

      expect(result.current.addMessage).toBe(firstAddMessage);
    });

    it('should not recreate clearHistory on re-render', () => {
      const { result, rerender } = renderHook(() => useBrittneyHistory('test-project'));

      const firstClearHistory = result.current.clearHistory;

      rerender();

      expect(result.current.clearHistory).toBe(firstClearHistory);
    });

    it('should recreate callbacks when projectId changes', () => {
      const { result, rerender } = renderHook(({ projectId }) => useBrittneyHistory(projectId), {
        initialProps: { projectId: 'project-a' },
      });

      const firstAddMessage = result.current.addMessage;

      rerender({ projectId: 'project-b' });

      expect(result.current.addMessage).not.toBe(firstAddMessage);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: '' });
      });

      expect(result.current.history[0].content).toBe('');
    });

    it('should handle very long content', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      const longContent = 'A'.repeat(10000);

      act(() => {
        result.current.addMessage({ role: 'user', content: longContent });
      });

      expect(result.current.history[0].content).toBe(longContent);
    });

    it('should handle unicode characters', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: '你好 🌟 émoji' });
      });

      expect(result.current.history[0].content).toBe('你好 🌟 émoji');
    });

    it('should handle special characters in projectId', async () => {
      const specialId = 'project-with-special!@#$%';
      mockLocalStorage[`brittney-history-${specialId}`] = JSON.stringify([
        { role: 'user', content: 'Test', timestamp: 1 },
      ]);

      const { result } = renderHook(() => useBrittneyHistory(specialId));

      await vi.waitFor(() => {
        expect(result.current.history).toHaveLength(1);
      });

      expect(localStorage.getItem).toHaveBeenCalledWith(`brittney-history-${specialId}`);
    });

    it('should handle timestamp edge values', () => {
      const { result } = renderHook(() => useBrittneyHistory('test-project'));

      act(() => {
        result.current.addMessage({ role: 'user', content: 'Zero', timestamp: 0 });
      });

      expect(result.current.history[0].timestamp).toBe(0);

      act(() => {
        result.current.addMessage({
          role: 'user',
          content: 'Max',
          timestamp: Number.MAX_SAFE_INTEGER,
        });
      });

      expect(result.current.history[1].timestamp).toBe(Number.MAX_SAFE_INTEGER);
    });
  });
});
