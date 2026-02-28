/**
 * @hololand/react-agent-sdk - useTask Hook
 *
 * Execute agent tasks with automatic retry and cancellation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UseAgentReturn, TaskParams, UseTaskReturn } from '../types';
import { ExponentialBackoff } from '../utils';

/**
 * useTask Hook
 *
 * Execute agent task with automatic retry, cancellation, and progress tracking
 *
 * @param agent - Agent instance from useAgent hook
 * @param taskName - Name of the task to execute
 * @param params - Task parameters
 * @returns Task result with loading state, error, and control functions
 *
 * @example
 * ```tsx
 * const { agent } = useAgent('brittney');
 * const { data, loading, error, retry, cancel } = useTask(
 *   agent,
 *   'generateComponent',
 *   { input: { componentName: 'Button' } }
 * );
 *
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error.message} onRetry={retry} />;
 * return <Result data={data} />;
 * ```
 */
export function useTask<T = unknown>(
  agent: UseAgentReturn['agent'] | null,
  taskName: string,
  params?: TaskParams
): UseTaskReturn<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<UseTaskReturn<T>['status']>('idle');
  const [progress, setProgress] = useState<number>();
  const abortControllerRef = useRef<AbortController>();
  const backoffRef = useRef<ExponentialBackoff>();

  /**
   * Execute task
   */
  const executeTask = useCallback(async () => {
    if (!agent) {
      setError(new Error('Agent not provided'));
      setStatus('error');
      return;
    }

    setLoading(true);
    setStatus('running');
    setError(undefined);
    setProgress(0);

    // Create abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Create backoff for retries
    if (!backoffRef.current) {
      backoffRef.current = new ExponentialBackoff(
        params?.retryDelay || 1000,
        60000,
        params?.maxRetries || 3
      );
    }

    try {
      // Execute task
      const result = await agent.executeTask<T>(taskName, params);

      // Check if task was cancelled
      if (abortController.signal.aborted) {
        setStatus('cancelled');
        return;
      }

      if (result.status === 'success') {
        setData(result.data);
        setStatus('success');
        setProgress(100);
        backoffRef.current.reset();
      } else {
        throw result.error || new Error('Task failed');
      }
    } catch (err) {
      const taskError = err as Error;

      // Check if task was cancelled
      if (abortController.signal.aborted) {
        setStatus('cancelled');
        return;
      }

      // Check if we should retry
      if (params?.retry && backoffRef.current.canRetry()) {
        const delay = backoffRef.current.getNextDelay();
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry if not cancelled
        if (!abortController.signal.aborted) {
          return executeTask();
        }
      }

      setError(taskError);
      setStatus('error');
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, [agent, taskName, params]);

  /**
   * Execute task on mount and when dependencies change
   */
  useEffect(() => {
    executeTask();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [executeTask]);

  /**
   * Retry task
   */
  const retry = useCallback(() => {
    backoffRef.current?.reset();
    executeTask();
  }, [executeTask]);

  /**
   * Cancel task
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus('cancelled');
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    status,
    retry,
    cancel,
    progress,
  };
}
