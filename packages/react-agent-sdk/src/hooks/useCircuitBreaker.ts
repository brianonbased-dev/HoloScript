/**
 * @hololand/react-agent-sdk - useCircuitBreaker Hook
 *
 * Access circuit breaker state from Phase 2
 */

import { useState, useEffect, useCallback } from 'react';
import type { UseCircuitBreakerReturn } from '../types';
import { useAgentContext } from '../context/AgentContext';

/**
 * useCircuitBreaker Hook
 *
 * Access circuit breaker state and control
 *
 * @param queryName - Name of the query or agent
 * @param pollInterval - Polling interval in milliseconds (default: 1000)
 * @returns Circuit breaker state and control functions
 *
 * @example
 * ```tsx
 * const { state, failureRate, lastError, reset, status } = useCircuitBreaker('myQuery');
 *
 * return (
 *   <div>
 *     <Badge color={state === 'open' ? 'red' : 'green'}>{state}</Badge>
 *     <div>Failure Rate: {(failureRate * 100).toFixed(2)}%</div>
 *     {state === 'open' && <Button onClick={reset}>Reset Circuit</Button>}
 *   </div>
 * );
 * ```
 */
export function useCircuitBreaker(queryName: string, pollInterval = 1000): UseCircuitBreakerReturn {
  const context = useAgentContext();
  const [state, setState] = useState<UseCircuitBreakerReturn['state']>('closed');
  const [failureRate, setFailureRate] = useState(0);
  const [lastError, setLastError] = useState<Error>();
  const [status, setStatus] = useState<UseCircuitBreakerReturn['status']>({
    state: 'closed',
    failureCount: 0,
    successCount: 0,
    failureRate: 0,
  });

  /**
   * Fetch circuit breaker status
   */
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${context.apiUrl}/api/circuit-breaker/${queryName}`, {
        headers: {
          ...context.headers,
          ...(context.token && { Authorization: `Bearer ${context.token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch circuit breaker status: ${response.statusText}`);
      }

      const data = await response.json();

      setState(data.state || 'closed');
      setFailureRate(data.failureRate || 0);
      setLastError(data.lastError);
      setStatus({
        state: data.state || 'closed',
        failureCount: data.failureCount || 0,
        successCount: data.successCount || 0,
        failureRate: data.failureRate || 0,
        lastError: data.lastError,
        timeUntilClose: data.timeUntilClose,
        nextRetryTime: data.nextRetryTime,
      });
    } catch (error) {
      console.error('Failed to fetch circuit breaker status:', error);
    }
  }, [queryName, context]);

  /**
   * Reset circuit breaker
   */
  const reset = useCallback(async () => {
    try {
      const response = await fetch(`${context.apiUrl}/api/circuit-breaker/${queryName}/reset`, {
        method: 'POST',
        headers: {
          ...context.headers,
          ...(context.token && { Authorization: `Bearer ${context.token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to reset circuit breaker: ${response.statusText}`);
      }

      // Refresh status
      await fetchStatus();
    } catch (error) {
      console.error('Failed to reset circuit breaker:', error);
    }
  }, [queryName, context, fetchStatus]);

  /**
   * Poll circuit breaker status
   */
  useEffect(() => {
    fetchStatus();

    const interval = setInterval(() => {
      fetchStatus();
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchStatus, pollInterval]);

  return {
    state,
    failureRate,
    lastError,
    reset,
    status,
  };
}
