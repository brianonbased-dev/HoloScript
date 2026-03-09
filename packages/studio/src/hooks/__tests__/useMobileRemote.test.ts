// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMobileRemote } from '../useMobileRemote';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console.debug to avoid test output noise
vi.spyOn(console, 'debug').mockImplementation(() => {});

describe('useMobileRemote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should initialize with idle status and null values', () => {
      const { result } = renderHook(() => useMobileRemote());

      expect(result.current.token).toBeNull();
      expect(result.current.remoteUrl).toBeNull();
      expect(result.current.status).toBe('idle');
      expect(result.current.commandCount).toBe(0);
    });

    it('should provide session management functions', () => {
      const { result } = renderHook(() => useMobileRemote());

      expect(typeof result.current.createSession).toBe('function');
      expect(typeof result.current.endSession).toBe('function');
    });
  });

  describe('Session Creation', () => {
    it('should create a session successfully', async () => {
      const mockResponse = {
        token: 'test-token-123',
        remoteUrl: 'https://example.com/remote/test-token-123',
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useMobileRemote());

      let sessionData;
      await act(async () => {
        sessionData = await result.current.createSession();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/remote', { method: 'POST' });
      expect(result.current.token).toBe('test-token-123');
      expect(result.current.remoteUrl).toBe('https://example.com/remote/test-token-123');
      expect(result.current.status).toBe('active');
      expect(sessionData).toEqual(mockResponse);
    });

    it('should set error status when session creation fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        try {
          await result.current.createSession();
        } catch (e) {
          // Expected to throw, error status will be set
        }
      });

      expect(result.current.status).toBe('error');
      expect(result.current.token).toBeNull();
      expect(result.current.remoteUrl).toBeNull();
    });

    it('should start polling after session creation', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'test-token',
          remoteUrl: 'https://example.com/remote/test-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Mock polling response before advancing timers
      mockFetch.mockResolvedValue({
        status: 200,
        json: async () => ({ commands: [] }),
      });

      // Clear the createSession call
      const createSessionCallCount = mockFetch.mock.calls.length;

      // Advance timers and flush promises
      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve(); // Flush promises
      });

      // Should have made polling call
      expect(mockFetch.mock.calls.length).toBeGreaterThan(createSessionCallCount);
      expect(mockFetch).toHaveBeenCalledWith('/api/remote?t=test-token');
    });
  });

  describe('Polling Behavior', () => {
    beforeEach(async () => {
      // Setup active session
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'poll-token',
          remoteUrl: 'https://example.com/remote/poll-token',
        }),
      });
    });

    it('should poll every 500ms', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Mock multiple polling responses
      mockFetch.mockResolvedValue({
        status: 200,
        json: async () => ({ commands: [] }),
      });

      const initialCalls = mockFetch.mock.calls.length; // 1 from createSession

      // Advance timers for 3 poll cycles and flush promises
      await act(async () => {
        for (let i = 0; i < 3; i++) {
          vi.advanceTimersByTime(500);
          await Promise.resolve();
        }
      });

      // Initial POST + 3 polling GET requests
      expect(mockFetch.mock.calls.length).toBe(initialCalls + 3);
    });

    it('should handle 404 status and set status to expired', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Mock 404 response (session expired)
      mockFetch.mockResolvedValueOnce({
        status: 404,
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('expired');

      // Poll should stop after 404
      const callsBefore = mockFetch.mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(mockFetch.mock.calls.length).toBe(callsBefore); // No new calls
    });

    it('should continue polling after network errors', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Network hiccup'));

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      // Status should remain active
      expect(result.current.status).toBe('active');

      // Should continue polling
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ commands: [] }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/remote?t=poll-token');
    });
  });

  describe('Command Processing', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'cmd-token',
          remoteUrl: 'https://example.com/remote/cmd-token',
        }),
      });
    });

    it('should process single orbit command', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      const orbitCommand = {
        type: 'orbit' as const,
        dx: 10,
        dy: 5,
        ts: Date.now(),
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ commands: [orbitCommand] }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.commandCount).toBe(1);
    });

    it('should process multiple commands', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      const commands = [
        { type: 'orbit' as const, dx: 10, dy: 5, ts: Date.now() },
        { type: 'zoom' as const, delta: 2, ts: Date.now() },
        { type: 'pan' as const, dx: -5, dy: 3, ts: Date.now() },
      ];

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ commands }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.commandCount).toBe(3);
    });

    it('should handle all command types', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      const commandTypes: Array<'orbit' | 'zoom' | 'pan' | 'reset' | 'select'> = [
        'orbit',
        'zoom',
        'pan',
        'reset',
        'select',
      ];

      for (const type of commandTypes) {
        const command = {
          type,
          dx: 1,
          dy: 1,
          delta: 1,
          ts: Date.now(),
        };

        mockFetch.mockResolvedValueOnce({
          status: 200,
          json: async () => ({ commands: [command] }),
        });

        await act(async () => {
          vi.advanceTimersByTime(500);
          await Promise.resolve();
        });
      }

      expect(result.current.commandCount).toBe(5);
    });

    it('should increment commandCount cumulatively', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // First poll with 2 commands
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          commands: [
            { type: 'orbit' as const, dx: 1, dy: 1, ts: Date.now() },
            { type: 'zoom' as const, delta: 1, ts: Date.now() },
          ],
        }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.commandCount).toBe(2);

      // Second poll with 1 command
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          commands: [{ type: 'pan' as const, dx: 1, dy: 1, ts: Date.now() }],
        }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.commandCount).toBe(3);
    });

    it('should handle empty command arrays', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ commands: [] }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // commandCount should remain 0
      expect(result.current.commandCount).toBe(0);
    });
  });

  describe('Session Termination', () => {
    it('should end session successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'end-token',
          remoteUrl: 'https://example.com/remote/end-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      expect(result.current.status).toBe('active');
      expect(result.current.token).toBe('end-token');

      mockFetch.mockResolvedValueOnce({ ok: true });

      await act(async () => {
        await result.current.endSession();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/remote?t=end-token', { method: 'DELETE' });
      expect(result.current.token).toBeNull();
      expect(result.current.remoteUrl).toBeNull();
      expect(result.current.status).toBe('idle');
      expect(result.current.commandCount).toBe(0);
    });

    it('should stop polling when session ends', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'stop-token',
          remoteUrl: 'https://example.com/remote/stop-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      mockFetch.mockResolvedValueOnce({ ok: true });

      await act(async () => {
        await result.current.endSession();
      });

      // Clear mock calls from session creation
      mockFetch.mockClear();

      // Advance timers to see if polling continues
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Should only have the DELETE call, no polling
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle endSession with no active session', async () => {
      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.endSession();
      });

      // Should not throw or make API calls
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });

    it('should clear interval on unmount', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'unmount-token',
          remoteUrl: 'https://example.com/remote/unmount-token',
        }),
      });

      const { result, unmount } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      unmount();

      mockFetch.mockClear();

      // Advance timers after unmount
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Polling should stop
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Status Management', () => {
    it('should transition from idle to active to expired', async () => {
      const { result } = renderHook(() => useMobileRemote());

      expect(result.current.status).toBe('idle');

      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'status-token',
          remoteUrl: 'https://example.com/remote/status-token',
        }),
      });

      await act(async () => {
        await result.current.createSession();
      });

      expect(result.current.status).toBe('active');

      mockFetch.mockResolvedValueOnce({ status: 404 });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('expired');
    });

    it('should transition from active to idle on endSession', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'transition-token',
          remoteUrl: 'https://example.com/remote/transition-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      expect(result.current.status).toBe('active');

      mockFetch.mockResolvedValueOnce({ ok: true });

      await act(async () => {
        await result.current.endSession();
      });

      expect(result.current.status).toBe('idle');
    });

    it('should set error status on createSession failure', async () => {
      const { result } = renderHook(() => useMobileRemote());

      mockFetch.mockRejectedValueOnce(new Error('API error'));

      await act(async () => {
        try {
          await result.current.createSession();
        } catch (e) {
          // Expected to throw, error status will be set
        }
      });

      expect(result.current.status).toBe('error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple createSession calls', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({
          token: 'multi-token',
          remoteUrl: 'https://example.com/remote/multi-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      const firstToken = result.current.token;

      mockFetch.mockResolvedValue({
        json: async () => ({
          token: 'new-token',
          remoteUrl: 'https://example.com/remote/new-token',
        }),
      });

      await act(async () => {
        await result.current.createSession();
      });

      // Should replace with new token
      expect(result.current.token).toBe('new-token');
      expect(result.current.token).not.toBe(firstToken);
    });

    it('should handle rapid polling cycles', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'rapid-token',
          remoteUrl: 'https://example.com/remote/rapid-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Mock rapid command responses
      for (let i = 0; i < 10; i++) {
        mockFetch.mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            commands: [{ type: 'orbit' as const, dx: i, dy: i, ts: Date.now() }],
          }),
        });

        await act(async () => {
          vi.advanceTimersByTime(500);
          await Promise.resolve();
        });
      }

      expect(result.current.commandCount).toBe(10);
    });

    it('should handle commands with missing optional fields', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'minimal-token',
          remoteUrl: 'https://example.com/remote/minimal-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Command with only required fields
      const minimalCommand = {
        type: 'reset' as const,
        ts: Date.now(),
      };

      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ commands: [minimalCommand] }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.commandCount).toBe(1);
    });

    it('should handle malformed polling responses gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'malformed-token',
          remoteUrl: 'https://example.com/remote/malformed-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Response missing commands array
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({}),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Should not crash, status should remain active
      expect(result.current.status).toBe('active');
    });

    it('should reset commandCount when endSession is called', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          token: 'reset-token',
          remoteUrl: 'https://example.com/remote/reset-token',
        }),
      });

      const { result } = renderHook(() => useMobileRemote());

      await act(async () => {
        await result.current.createSession();
      });

      // Process some commands
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          commands: [
            { type: 'orbit' as const, dx: 1, dy: 1, ts: Date.now() },
            { type: 'zoom' as const, delta: 1, ts: Date.now() },
          ],
        }),
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(result.current.commandCount).toBe(2);

      mockFetch.mockResolvedValueOnce({ ok: true });

      await act(async () => {
        await result.current.endSession();
      });

      expect(result.current.commandCount).toBe(0);
    });
  });
});
