// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMultiplayerRoom } from '../useMultiplayerRoom';
import type { Peer, ChatMessage, RoomEventType } from '../useMultiplayerRoom';

describe('useMultiplayerRoom', () => {
  let mockEventSource: any;
  let mockFetch: ReturnType<typeof vi.fn>;
  let eventListeners: Map<string, Function>;

  beforeEach(() => {
    eventListeners = new Map();
    vi.useFakeTimers();

    // Mock EventSource
    mockEventSource = {
      onopen: null,
      onerror: null,
      onmessage: null,
      close: vi.fn(),
    };

    global.EventSource = vi.fn().mockImplementation(function () { return mockEventSource; }) as any;

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock Date.now for predictable timestamps
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should initialize with empty peers array', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      expect(result.current.peers).toEqual([]);
    });

    it('should initialize with empty chat array', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      expect(result.current.chat).toEqual([]);
    });

    it('should initialize with connected false', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      expect(result.current.connected).toBe(false);
    });

    it('should expose send methods', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      expect(result.current.sendCursor).toBeInstanceOf(Function);
      expect(result.current.sendSelect).toBeInstanceOf(Function);
      expect(result.current.sendChat).toBeInstanceOf(Function);
    });
  });

  describe('EventSource Connection', () => {
    it('should create EventSource with correct URL', () => {
      renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice', userColor: '#ff0000' })
      );

      expect(global.EventSource).toHaveBeenCalledWith(
        '/api/rooms?room=test-room&user=Alice&color=%23ff0000'
      );
    });

    it('should use default color if not provided', () => {
      renderHook(() => useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' }));

      expect(global.EventSource).toHaveBeenCalledWith(
        '/api/rooms?room=test-room&user=Alice&color=%23a78bfa'
      );
    });

    it('should encode special characters in parameters', () => {
      renderHook(() => useMultiplayerRoom({ roomId: 'room with spaces', userName: 'Bob & Alice' }));

      expect(global.EventSource).toHaveBeenCalledWith(
        expect.stringContaining('room=room%20with%20spaces')
      );
      expect(global.EventSource).toHaveBeenCalledWith(
        expect.stringContaining('user=Bob%20%26%20Alice')
      );
    });

    it('should set connected to true when EventSource opens', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onopen();
      });

      expect(result.current.connected).toBe(true);
    });

    it('should set connected to false on EventSource error', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onopen();
      });

      expect(result.current.connected).toBe(true);

      act(() => {
        mockEventSource.onerror();
      });

      expect(result.current.connected).toBe(false);
    });

    it('should not create EventSource when enabled is false', () => {
      renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice', enabled: false })
      );

      expect(global.EventSource).not.toHaveBeenCalled();
    });

    it('should close EventSource on unmount', () => {
      const { unmount } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      unmount();

      expect(mockEventSource.close).toHaveBeenCalled();
    });
  });

  describe('Peer Management', () => {
    it('should add peer on cursor event', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      expect(result.current.peers).toHaveLength(1);
      expect(result.current.peers[0]).toMatchObject({
        user: 'Bob',
        color: '#00ff00',
        cursor: { x: 100, y: 200 },
      });
    });

    it('should update existing peer cursor position', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            payload: { x: 150, y: 250 },
          }),
        });
      });

      expect(result.current.peers).toHaveLength(1);
      expect(result.current.peers[0].cursor).toEqual({ x: 150, y: 250 });
    });

    it('should add peer on select event', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'select',
            user: 'Bob',
            color: '#00ff00',
            payload: { objectId: 'cube-1' },
          }),
        });
      });

      expect(result.current.peers).toHaveLength(1);
      expect(result.current.peers[0].selectedObject).toBe('cube-1');
    });

    it('should remove peer on leave event', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      expect(result.current.peers).toHaveLength(1);

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({ type: 'leave', user: 'Bob' }),
        });
      });

      expect(result.current.peers).toHaveLength(0);
    });

    it('should ignore events from own user', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Alice',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      expect(result.current.peers).toHaveLength(0);
    });

    it('should handle multiple peers', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Charlie',
            color: '#0000ff',
            payload: { x: 150, y: 250 },
          }),
        });
      });

      expect(result.current.peers).toHaveLength(2);
    });

    it('should update lastSeen on any event', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      expect(result.current.peers[0].lastSeen).toBe(1000000);

      vi.spyOn(Date, 'now').mockReturnValue(2000000);

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'select',
            user: 'Bob',
            payload: { objectId: 'cube-1' },
          }),
        });
      });

      expect(result.current.peers[0].lastSeen).toBe(2000000);
    });
  });

  describe('Peer Eviction', () => {
    it('should evict peers after 30 seconds of inactivity', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      expect(result.current.peers).toHaveLength(1);

      // Advance time by 31 seconds
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 31000);

      // Trigger eviction timer (runs every 10s)
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.peers).toHaveLength(0);
    });

    it('should not evict active peers', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: { x: 100, y: 200 },
          }),
        });
      });

      // Advance time by 20 seconds
      vi.spyOn(Date, 'now').mockReturnValue(1000000 + 20000);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Peer should still be present
      expect(result.current.peers).toHaveLength(1);
    });

    it('should clear eviction timer on unmount', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const { unmount } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Chat Messages', () => {
    it('should add chat message on chat event', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'chat',
            user: 'Bob',
            color: '#00ff00',
            payload: { text: 'Hello everyone!' },
            ts: 1000000,
          }),
        });
      });

      expect(result.current.chat).toHaveLength(1);
      expect(result.current.chat[0]).toMatchObject({
        user: 'Bob',
        color: '#00ff00',
        text: 'Hello everyone!',
        ts: 1000000,
      });
    });

    it('should handle multiple chat messages', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'chat',
            user: 'Bob',
            color: '#00ff00',
            payload: { text: 'Hello!' },
            ts: 1000000,
          }),
        });
      });

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'chat',
            user: 'Charlie',
            color: '#0000ff',
            payload: { text: 'Hi Bob!' },
            ts: 1000001,
          }),
        });
      });

      expect(result.current.chat).toHaveLength(2);
    });

    it('should limit chat history to 100 messages', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        for (let i = 0; i < 105; i++) {
          mockEventSource.onmessage({
            data: JSON.stringify({
              type: 'chat',
              user: 'Bob',
              color: '#00ff00',
              payload: { text: `Message ${i}` },
              ts: 1000000 + i,
            }),
          });
        }
      });

      expect(result.current.chat).toHaveLength(100);
      // Should keep the last 100 messages
      expect(result.current.chat[0].text).toBe('Message 5');
      expect(result.current.chat[99].text).toBe('Message 104');
    });

    it('should use current time if ts is missing', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'chat',
            user: 'Bob',
            color: '#00ff00',
            payload: { text: 'Hello!' },
          }),
        });
      });

      expect(result.current.chat[0].ts).toBe(1000000);
    });

    it('should use default color if color is missing', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'chat',
            user: 'Bob',
            payload: { text: 'Hello!' },
          }),
        });
      });

      expect(result.current.chat[0].color).toBe('#aaa');
    });

    it('should ignore chat events from own user', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'chat',
            user: 'Alice',
            payload: { text: 'Hello!' },
          }),
        });
      });

      expect(result.current.chat).toHaveLength(0);
    });
  });

  describe('Broadcasting', () => {
    it('should POST to /api/rooms when broadcasting', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice', userColor: '#ff0000' })
      );

      await act(async () => {
        await result.current.sendCursor(100, 200);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: 'test-room',
          user: 'Alice',
          color: '#ff0000',
          type: 'cursor',
          payload: { x: 100, y: 200 },
        }),
      });
    });

    it('should send cursor position', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      await act(async () => {
        await result.current.sendCursor(150, 250);
      });

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.type).toBe('cursor');
      expect(callArgs.payload).toEqual({ x: 150, y: 250 });
    });

    it('should send object selection', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      await act(async () => {
        await result.current.sendSelect('cube-1');
      });

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.type).toBe('select');
      expect(callArgs.payload).toEqual({ objectId: 'cube-1' });
    });

    it('should send chat message', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      await act(async () => {
        await result.current.sendChat('Hello everyone!');
      });

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.type).toBe('chat');
      expect(callArgs.payload).toEqual({ text: 'Hello everyone!' });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in messages', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      expect(() => {
        act(() => {
          mockEventSource.onmessage({ data: 'invalid json' });
        });
      }).not.toThrow();

      expect(result.current.peers).toHaveLength(0);
    });

    it('should ignore messages without type', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({ user: 'Bob', payload: { x: 100, y: 200 } }),
        });
      });

      expect(result.current.peers).toHaveLength(0);
    });

    it('should ignore messages without user', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({ type: 'cursor', payload: { x: 100, y: 200 } }),
        });
      });

      expect(result.current.peers).toHaveLength(0);
    });

    it('should propagate broadcast errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      await expect(
        act(async () => {
          await result.current.sendCursor(100, 200);
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('Reconnection', () => {
    it('should reconnect when roomId changes', () => {
      const { rerender } = renderHook(
        ({ roomId }) => useMultiplayerRoom({ roomId, userName: 'Alice' }),
        { initialProps: { roomId: 'room-1' } }
      );

      const initialCallCount = (global.EventSource as any).mock.calls.length;

      rerender({ roomId: 'room-2' });

      expect((global.EventSource as any).mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should close old connection when reconnecting', () => {
      const { rerender } = renderHook(
        ({ roomId }) => useMultiplayerRoom({ roomId, userName: 'Alice' }),
        { initialProps: { roomId: 'room-1' } }
      );

      const closeCallsBefore = mockEventSource.close.mock.calls.length;

      rerender({ roomId: 'room-2' });

      expect(mockEventSource.close.mock.calls.length).toBeGreaterThan(closeCallsBefore);
    });
  });

  describe('Edge Cases', () => {
    it('should handle cursor event with default x/y coordinates', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
            payload: {},
          }),
        });
      });

      expect(result.current.peers[0].cursor).toEqual({ x: 0, y: 0 });
    });

    it('should handle select event without objectId', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'select',
            user: 'Bob',
            color: '#00ff00',
            payload: {},
          }),
        });
      });

      expect(result.current.peers[0].selectedObject).toBeUndefined();
    });

    it('should handle empty payload', () => {
      const { result } = renderHook(() =>
        useMultiplayerRoom({ roomId: 'test-room', userName: 'Alice' })
      );

      act(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            type: 'cursor',
            user: 'Bob',
            color: '#00ff00',
          }),
        });
      });

      expect(result.current.peers).toHaveLength(1);
    });
  });
});
