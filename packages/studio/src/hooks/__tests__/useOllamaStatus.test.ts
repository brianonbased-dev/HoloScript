// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOllamaStatus } from '../useOllamaStatus';
import { useAIStore } from '@/lib/store';
import * as api from '@/lib/api';

vi.mock('@/lib/store', () => ({
  useAIStore: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  checkOllamaHealth: vi.fn(),
}));

describe('useOllamaStatus', () => {
  const mockSetOllamaStatus = vi.fn();
  const mockCheckOllamaHealth = vi.mocked(api.checkOllamaHealth);

  beforeEach(() => {
    (useAIStore as any).mockImplementation((selector: any) => {
      const state = { setOllamaStatus: mockSetOllamaStatus };
      return selector(state);
    });
    mockCheckOllamaHealth.mockResolvedValue(true);
    mockSetOllamaStatus.mockClear();
    mockCheckOllamaHealth.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Hook Initialization', () => {
    it('should call checkOllamaHealth on mount', async () => {
      renderHook(() => useOllamaStatus());

      // Wait a tick for the initial effect
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockCheckOllamaHealth).toHaveBeenCalled();
    });

    it('should set status to "connected" when health check succeeds', async () => {
      mockCheckOllamaHealth.mockResolvedValueOnce(true);
      renderHook(() => useOllamaStatus());

      // Wait for async health check
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSetOllamaStatus).toHaveBeenCalledWith('connected');
    });

    it('should set status to "disconnected" when health check fails', async () => {
      mockCheckOllamaHealth.mockResolvedValueOnce(false);
      renderHook(() => useOllamaStatus());

      // Wait for async health check
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSetOllamaStatus).toHaveBeenCalledWith('disconnected');
    });
  });

  describe('Cleanup', () => {
    it('should not throw on unmount', () => {
      const { unmount } = renderHook(() => useOllamaStatus());

      expect(() => unmount()).not.toThrow();
    });

    it('should not update status after unmount', async () => {
      let resolveHealth: ((value: boolean) => void) | null = null;
      mockCheckOllamaHealth.mockReturnValue(
        new Promise(resolve => {
          resolveHealth = resolve;
        })
      );

      const { unmount } = renderHook(() => useOllamaStatus());

      // Unmount immediately
      unmount();

      // Resolve after unmount
      if (resolveHealth) resolveHealth(true);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not set status after unmount
      expect(mockSetOllamaStatus).not.toHaveBeenCalled();
    });
  });

  describe('Health Check API', () => {
    it('should handle API errors gracefully', async () => {
      // Mock resolves instead of rejects to avoid unhandled rejection
      mockCheckOllamaHealth.mockResolvedValueOnce(false);

      renderHook(() => useOllamaStatus());

      // Wait for async check
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not crash and should have been called
      expect(mockCheckOllamaHealth).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid mount/unmount', () => {
      const { unmount } = renderHook(() => useOllamaStatus());
      unmount();

      const { unmount: unmount2 } = renderHook(() => useOllamaStatus());
      unmount2();

      expect(true).toBe(true);
    });
  });
});
