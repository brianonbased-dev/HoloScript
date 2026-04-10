/**
 * @hololand/react-agent-sdk - useTaskStatus Hook
 *
 * Monitor long-running task progress and status
 */

import { useState, useEffect, useCallback } from 'react';
import type { UseTaskStatusReturn, TaskLog } from '../types';
import { useAgentContext } from '../context/AgentContext';

/**
 * useTaskStatus Hook
 *
 * Monitor long-running task progress with real-time updates
 *
 * @param taskId - ID of the task to monitor
 * @param pollInterval - Polling interval in milliseconds (default: 1000)
 * @returns Task status with progress, logs, and phase information
 *
 * @example
 * ```tsx
 * const { status, progress, estimatedTime, logs, phase } = useTaskStatus(taskId);
 *
 * return (
 *   <div>
 *     <ProgressBar value={progress} />
 *     <div>Status: {status}</div>
 *     <div>Phase: {phase}</div>
 *     <div>ETA: {estimatedTime}ms</div>
 *     <LogViewer logs={logs} />
 *   </div>
 * );
 * ```
 */
export function useTaskStatus(taskId: string, pollInterval = 1000): UseTaskStatusReturn {
  const context = useAgentContext();
  const [status, setStatus] = useState<UseTaskStatusReturn['status']>('idle');
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number>();
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [phase, setPhase] = useState<UseTaskStatusReturn['phase']>();

  /**
   * Fetch task status
   */
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${context.apiUrl}/api/tasks/${taskId}/status`, {
        headers: {
          ...context.headers,
          ...(context.token && { Authorization: `Bearer ${context.token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch task status: ${response.statusText}`);
      }

      const data = await response.json();

      setStatus(data.status || 'idle');
      setProgress(data.progress || 0);
      setEstimatedTime(data.estimatedTime);
      setPhase(data.phase);

      // Append new logs
      if (data.logs && Array.isArray(data.logs)) {
        setLogs((prevLogs) => {
          const existingIds = new Set(prevLogs.map((log) => log.timestamp));
          const newLogs = data.logs.filter((log: TaskLog) => !existingIds.has(log.timestamp));
          return [...prevLogs, ...newLogs];
        });
      }
    } catch (error) {
      console.error('Failed to fetch task status:', error);
    }
  }, [taskId, context]);

  /**
   * Poll task status
   */
  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Poll for updates
    const interval = setInterval(() => {
      // Stop polling if task is complete
      if (status === 'success' || status === 'error' || status === 'cancelled') {
        clearInterval(interval);
        return;
      }

      fetchStatus();
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [fetchStatus, pollInterval, status]);

  return {
    status,
    progress,
    estimatedTime,
    logs,
    phase,
  };
}
