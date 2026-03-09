/**
 * @hololand/react-agent-sdk - SuspenseTask Component
 *
 * React Suspense integration for async tasks
 */

import React, { Suspense, ReactNode } from 'react';
import { useTask } from '../hooks';
import type { UseAgentReturn, TaskParams } from '../types';

interface SuspenseTaskProps<T> {
  agent: UseAgentReturn['agent'];
  taskName: string;
  params?: TaskParams;
  fallback?: ReactNode;
  children: (data: T) => ReactNode;
  onError?: (error: Error) => ReactNode;
}

/**
 * Suspense-compatible task wrapper
 */
function TaskContent<T>({
  agent,
  taskName,
  params,
  children,
  onError,
}: Omit<SuspenseTaskProps<T>, 'fallback'>): JSX.Element {
  const { data, loading, error } = useTask<T>(agent, taskName, params);

  if (loading) {
    throw new Promise(() => {}); // Suspend
  }

  if (error) {
    if (onError) {
      return <>{onError(error)}</>;
    }
    throw error;
  }

  if (!data) {
    return <div>No data</div>;
  }

  return <>{children(data)}</>;
}

/**
 * SuspenseTask Component
 *
 * Integrates agent tasks with React Suspense
 *
 * @example
 * ```tsx
 * const { agent } = useAgent('brittney');
 *
 * <SuspenseTask
 *   agent={agent}
 *   taskName="generateComponent"
 *   params={{ input: { name: 'Button' } }}
 *   fallback={<Spinner />}
 * >
 *   {(data) => <ComponentPreview data={data} />}
 * </SuspenseTask>
 * ```
 */
export function SuspenseTask<T = unknown>({
  agent,
  taskName,
  params,
  fallback = <div>Loading...</div>,
  children,
  onError,
}: SuspenseTaskProps<T>): JSX.Element {
  return (
    <Suspense fallback={fallback}>
      <TaskContent agent={agent} taskName={taskName} params={params} onError={onError}>
        {children}
      </TaskContent>
    </Suspense>
  );
}
