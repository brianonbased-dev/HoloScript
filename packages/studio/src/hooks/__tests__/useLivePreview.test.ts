// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLivePreview } from '../useLivePreview';

describe('useLivePreview', () => {
  let mockEventSource: any;
  let mockFetch: ReturnType<typeof vi.fn>;
  let eventListeners: Map<string, Function>;

  beforeEach(() => {
    eventListeners = new Map();

    // Mock EventSource
    mockEventSource = {
      addEventListener: vi.fn((event: string, handler: Function) => {
        eventListeners.set(event, handler);
      }),
      close: vi.fn(),
      onopen: null,
      onerror: null,
    };

    global.EventSource = vi.fn(() => mockEventSource) as any;

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with connecting status', () => {
      const { result } = renderHook(() => useLivePreview());

      // On mount, connect() is called, which sets status to 'connecting'
      expect(result.current.status).toBe('connecting');
    });

    it('should initialize with null lastSync', () => {
      const { result } = renderHook(() => useLivePreview());

      expect(result.current.lastSync).toBeNull();
    });
  });

  describe('Connection Management', () => {
    it('should create EventSource on mount', () => {
      renderHook(() => useLivePreview());

      expect(global.EventSource).toHaveBeenCalledWith('/api/preview?sceneId=default');
    });

    it('should use custom sceneId', () => {
      renderHook(() => useLivePreview({ sceneId: 'custom-scene' }));

      expect(global.EventSource).toHaveBeenCalledWith('/api/preview?sceneId=custom-scene');
    });

    it('should encode sceneId for URL', () => {
      renderHook(() => useLivePreview({ sceneId: 'scene with spaces' }));

      expect(global.EventSource).toHaveBeenCalledWith('/api/preview?sceneId=scene%20with%20spaces');
    });

    it('should set status to connected when EventSource opens', async () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        mockEventSource.onopen();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });
    });

    it('should set status to error on EventSource error', async () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        mockEventSource.onerror();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });

    it('should close EventSource on unmount', () => {
      const { unmount } = renderHook(() => useLivePreview());

      unmount();

      expect(mockEventSource.close).toHaveBeenCalled();
    });
  });

  describe('Disconnect Function', () => {
    it('should close EventSource when disconnect is called', () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        result.current.disconnect();
      });

      expect(mockEventSource.close).toHaveBeenCalled();
    });

    it('should set status to disconnected when disconnect is called', async () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        mockEventSource.onopen(); // First connect
      });

      act(() => {
        result.current.disconnect();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('disconnected');
      });
    });

    it('should handle disconnect when EventSource is null', () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        mockEventSource.onerror(); // Trigger error to set EventSource to null
      });

      act(() => {
        result.current.disconnect();
      });

      // Should not throw
      expect(result.current.status).toBe('disconnected');
    });
  });

  describe('Connect Function', () => {
    it('should close existing EventSource before creating new one', () => {
      const { result } = renderHook(() => useLivePreview());

      const firstClose = mockEventSource.close;

      act(() => {
        result.current.connect();
      });

      expect(firstClose).toHaveBeenCalled();
    });

    it('should set status to connecting when connect is called', async () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        mockEventSource.onopen(); // First connect
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });

      act(() => {
        result.current.connect();
      });

      expect(result.current.status).toBe('connecting');
    });

    it('should create new EventSource when connect is called', () => {
      const { result } = renderHook(() => useLivePreview());

      const initialCallCount = (global.EventSource as any).mock.calls.length;

      act(() => {
        result.current.connect();
      });

      expect((global.EventSource as any).mock.calls.length).toBe(initialCallCount + 1);
    });
  });

  describe('Message Handling', () => {
    it('should call onRemoteCode when preview event is received', async () => {
      const onRemoteCode = vi.fn();
      renderHook(() => useLivePreview({ onRemoteCode }));

      const previewHandler = eventListeners.get('preview');

      act(() => {
        previewHandler?.({
          data: JSON.stringify({
            code: 'scene "Main" {}',
            sceneId: 'default',
            ts: 1234567890,
          }),
        } as MessageEvent);
      });

      await waitFor(() => {
        expect(onRemoteCode).toHaveBeenCalledWith('scene "Main" {}');
      });
    });

    it('should update lastSync when preview event is received', async () => {
      const { result } = renderHook(() => useLivePreview());

      const previewHandler = eventListeners.get('preview');

      act(() => {
        previewHandler?.({
          data: JSON.stringify({
            code: 'test code',
            sceneId: 'default',
            ts: 1234567890,
          }),
        } as MessageEvent);
      });

      await waitFor(() => {
        expect(result.current.lastSync).toBe(1234567890);
      });
    });

    it('should ignore malformed JSON in preview event', async () => {
      const onRemoteCode = vi.fn();
      renderHook(() => useLivePreview({ onRemoteCode }));

      const previewHandler = eventListeners.get('preview');

      act(() => {
        previewHandler?.({
          data: 'invalid json',
        } as MessageEvent);
      });

      await waitFor(() => {
        // Should not crash and not call handler
        expect(onRemoteCode).not.toHaveBeenCalled();
      });
    });

    it('should handle preview event without onRemoteCode callback', async () => {
      const { result } = renderHook(() => useLivePreview());

      const previewHandler = eventListeners.get('preview');

      act(() => {
        previewHandler?.({
          data: JSON.stringify({
            code: 'test',
            sceneId: 'default',
            ts: 123,
          }),
        } as MessageEvent);
      });

      await waitFor(() => {
        // Should not crash
        expect(result.current.lastSync).toBe(123);
      });
    });
  });

  describe('Broadcast Function', () => {
    it('should POST code to /api/preview', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useLivePreview());

      await act(async () => {
        await result.current.broadcast('scene "Test" {}');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'scene "Test" {}', sceneId: 'default' }),
      });
    });

    it('should include custom sceneId in broadcast', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useLivePreview({ sceneId: 'custom' }));

      await act(async () => {
        await result.current.broadcast('test code');
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.sceneId).toBe('custom');
    });

    it('should update lastSync after successful broadcast', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const mockNow = 9876543210;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { result } = renderHook(() => useLivePreview());

      await act(async () => {
        await result.current.broadcast('test');
      });

      await waitFor(() => {
        expect(result.current.lastSync).toBe(mockNow);
      });
    });

    it('should handle broadcast errors silently', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useLivePreview());

      await act(async () => {
        await result.current.broadcast('test');
      });

      // Should not throw, status should remain unchanged
      expect(result.current.status).toBe('connecting');
    });

    it('should not update lastSync on broadcast failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useLivePreview());

      const initialLastSync = result.current.lastSync;

      await act(async () => {
        await result.current.broadcast('test');
      });

      expect(result.current.lastSync).toBe(initialLastSync);
    });
  });

  describe('Auto-Connect Behavior', () => {
    it('should auto-connect on mount', () => {
      renderHook(() => useLivePreview());

      expect(global.EventSource).toHaveBeenCalledTimes(1);
    });

    it('should reconnect when sceneId changes', () => {
      const { rerender } = renderHook(
        ({ sceneId }) => useLivePreview({ sceneId }),
        { initialProps: { sceneId: 'scene-1' } }
      );

      const initialCallCount = (global.EventSource as any).mock.calls.length;

      rerender({ sceneId: 'scene-2' });

      expect((global.EventSource as any).mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should close old connection when reconnecting', () => {
      const { rerender } = renderHook(
        ({ sceneId }) => useLivePreview({ sceneId }),
        { initialProps: { sceneId: 'scene-1' } }
      );

      const closeCallsBefore = mockEventSource.close.mock.calls.length;

      rerender({ sceneId: 'scene-2' });

      expect(mockEventSource.close.mock.calls.length).toBeGreaterThan(closeCallsBefore);
    });
  });

  describe('Return Value Structure', () => {
    it('should expose status property', () => {
      const { result } = renderHook(() => useLivePreview());

      expect(result.current).toHaveProperty('status');
      expect(['disconnected', 'connecting', 'connected', 'error']).toContain(result.current.status);
    });

    it('should expose lastSync property', () => {
      const { result } = renderHook(() => useLivePreview());

      expect(result.current).toHaveProperty('lastSync');
    });

    it('should expose connect function', () => {
      const { result } = renderHook(() => useLivePreview());

      expect(result.current.connect).toBeInstanceOf(Function);
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() => useLivePreview());

      expect(result.current.disconnect).toBeInstanceOf(Function);
    });

    it('should expose broadcast function', () => {
      const { result } = renderHook(() => useLivePreview());

      expect(result.current.broadcast).toBeInstanceOf(Function);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code in broadcast', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useLivePreview());

      await act(async () => {
        await result.current.broadcast('');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/preview',
        expect.objectContaining({
          body: JSON.stringify({ code: '', sceneId: 'default' }),
        })
      );
    });

    it('should handle very long code in broadcast', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const longCode = 'scene "Main" {}\n'.repeat(10000);

      const { result } = renderHook(() => useLivePreview());

      await act(async () => {
        await result.current.broadcast(longCode);
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle special characters in sceneId', () => {
      renderHook(() => useLivePreview({ sceneId: 'scene!@#$%^&*()' }));

      expect(global.EventSource).toHaveBeenCalledWith(
        expect.stringContaining('sceneId=')
      );
    });

    it('should handle multiple rapid connect calls', () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        result.current.connect();
        result.current.connect();
        result.current.connect();
      });

      // Should not throw and each connect should close previous
      expect(mockEventSource.close).toHaveBeenCalled();
    });

    it('should handle multiple rapid disconnect calls', () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        result.current.disconnect();
        result.current.disconnect();
        result.current.disconnect();
      });

      // Should not throw
      expect(result.current.status).toBe('disconnected');
    });

    it('should handle broadcast without waiting for connection', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useLivePreview());

      // Broadcast immediately without waiting for connected status
      await act(async () => {
        await result.current.broadcast('immediate code');
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle EventSource that never opens', () => {
      const { result } = renderHook(() => useLivePreview());

      // Status should remain 'connecting'
      expect(result.current.status).toBe('connecting');
    });

    it('should handle EventSource that errors immediately', async () => {
      const { result } = renderHook(() => useLivePreview());

      act(() => {
        mockEventSource.onerror();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });
  });

  describe('Options Handling', () => {
    it('should work with no options provided', () => {
      const { result } = renderHook(() => useLivePreview());

      expect(result.current.status).toBeDefined();
    });

    it('should work with empty options object', () => {
      const { result } = renderHook(() => useLivePreview({}));

      expect(result.current.status).toBeDefined();
    });

    it('should use default sceneId when not provided', () => {
      renderHook(() => useLivePreview({}));

      expect(global.EventSource).toHaveBeenCalledWith('/api/preview?sceneId=default');
    });

    it('should call onRemoteCode only when provided', async () => {
      const onRemoteCode = vi.fn();
      renderHook(() => useLivePreview({ onRemoteCode }));

      const previewHandler = eventListeners.get('preview');

      act(() => {
        previewHandler?.({
          data: JSON.stringify({ code: 'test', sceneId: 'default', ts: 123 }),
        } as MessageEvent);
      });

      await waitFor(() => {
        expect(onRemoteCode).toHaveBeenCalled();
      });

      expect(onRemoteCode).toHaveBeenCalledWith('test');

      // Verify it doesn't throw when callback is undefined
      const { result } = renderHook(() => useLivePreview({ onRemoteCode: undefined }));
      const previewHandler2 = eventListeners.get('preview');

      act(() => {
        previewHandler2?.({
          data: JSON.stringify({ code: 'test2', sceneId: 'default', ts: 456 }),
        } as MessageEvent);
      });

      // Should not throw and should update lastSync
      expect(result.current.lastSync).toBe(456);
    });
  });
});
