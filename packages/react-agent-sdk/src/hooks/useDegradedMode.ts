/**
 * @hololand/react-agent-sdk - useDegradedMode Hook
 *
 * Global degraded mode status monitoring
 */

import { useState, useEffect, useCallback } from 'react';
import type { UseDegradedModeReturn } from '../types';
import { useAgentContext } from '../context/AgentContext';

/**
 * useDegradedMode Hook
 *
 * Monitor global degraded mode status
 *
 * @param pollInterval - Polling interval in milliseconds (default: 5000)
 * @returns Degraded mode status with affected services and recovery information
 *
 * @example
 * ```tsx
 * const { isDegraded, affectedServices, recoveryStatus, status } = useDegradedMode();
 *
 * if (isDegraded) {
 *   return (
 *     <Alert severity="warning">
 *       <div>System is in degraded mode</div>
 *       <div>Affected: {affectedServices.join(', ')}</div>
 *       {recoveryStatus.inProgress && (
 *         <div>Recovery: {recoveryStatus.progress}%</div>
 *       )}
 *     </Alert>
 *   );
 * }
 * ```
 */
export function useDegradedMode(pollInterval = 5000): UseDegradedModeReturn {
  const context = useAgentContext();
  const [isDegraded, setIsDegraded] = useState(false);
  const [affectedServices, setAffectedServices] = useState<string[]>([]);
  const [recoveryStatus, setRecoveryStatus] = useState<UseDegradedModeReturn['recoveryStatus']>({
    inProgress: false,
    progress: 0,
  });
  const [status, setStatus] = useState<UseDegradedModeReturn['status']>({
    isDegraded: false,
    affectedServices: [],
    recoveryStatus: {
      inProgress: false,
      progress: 0,
    },
  });

  /**
   * Fetch degraded mode status
   */
  const fetchStatus = useCallback(async () => {
    if (!context.enableDegradedMode) {
      return;
    }

    try {
      const response = await fetch(`${context.apiUrl}/api/system/degraded-mode`, {
        headers: {
          ...context.headers,
          ...(context.token && { Authorization: `Bearer ${context.token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch degraded mode status: ${response.statusText}`);
      }

      const data = await response.json();

      setIsDegraded(data.isDegraded || false);
      setAffectedServices(data.affectedServices || []);
      setRecoveryStatus({
        inProgress: data.recoveryStatus?.inProgress || false,
        progress: data.recoveryStatus?.progress || 0,
        estimatedTime: data.recoveryStatus?.estimatedTime,
      });
      setStatus({
        isDegraded: data.isDegraded || false,
        affectedServices: data.affectedServices || [],
        recoveryStatus: {
          inProgress: data.recoveryStatus?.inProgress || false,
          progress: data.recoveryStatus?.progress || 0,
          estimatedTime: data.recoveryStatus?.estimatedTime,
        },
        degradedSince: data.degradedSince,
      });
    } catch (error) {
      console.error('Failed to fetch degraded mode status:', error);
    }
  }, [context]);

  /**
   * Poll degraded mode status
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
    isDegraded,
    affectedServices,
    recoveryStatus,
    status,
  };
}
