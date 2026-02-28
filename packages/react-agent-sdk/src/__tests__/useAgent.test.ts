/**
 * useAgent Hook Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAgent } from '../hooks/useAgent';
import { AgentProvider } from '../components/AgentProvider';
import React from 'react';

describe('useAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize agent', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AgentProvider, null, children);

    const { result } = renderHook(() => useAgent('brittney'), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('connected');
    });

    expect(result.current.agent).toBeDefined();
    expect(result.current.agent.sendMessage).toBeInstanceOf(Function);
    expect(result.current.agent.executeTask).toBeInstanceOf(Function);
  });

  it('should handle connection errors', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AgentProvider, null, children);

    const { result } = renderHook(
      () => useAgent('nonexistent', { enableCircuitBreaker: true }),
      { wrapper }
    );

    expect(result.current.status).toBe('connecting');
  });

  it('should provide reconnect function', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AgentProvider, null, children);

    const { result } = renderHook(() => useAgent('brittney'), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('connected');
    });

    expect(result.current.reconnect).toBeInstanceOf(Function);
  });
});
