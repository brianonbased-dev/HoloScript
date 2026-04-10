/**
 * useAbsorbPipelineBridge — React hook for absorb → pipeline integration.
 *
 * Automatically triggers the recursive pipeline when absorb completes,
 * based on user preferences and absorb result confidence.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  onAbsorbComplete,
  recommendPipelineConfig,
  saveBridgeConfig,
  getBridgeConfig,
  generatePipelineSummary,
  type AbsorbCompletionEvent,
  type PipelineTriggerConfig,
} from '@/lib/integrations/absorbPipelineBridge';

interface AbsorbPipelineBridgeState {
  config: PipelineTriggerConfig;
  lastPipelineId: string | null;
  lastError: string | null;
  isTriggering: boolean;
}

export function useAbsorbPipelineBridge() {
  const [state, setState] = useState<AbsorbPipelineBridgeState>({
    config: getBridgeConfig(),
    lastPipelineId: null,
    lastError: null,
    isTriggering: false,
  });

  // Load config from localStorage on mount
  useEffect(() => {
    setState((prev) => ({ ...prev, config: getBridgeConfig() }));
  }, []);

  /**
   * Update bridge configuration and persist to localStorage.
   */
  const updateConfig = useCallback((updates: Partial<PipelineTriggerConfig>) => {
    setState((prev) => {
      const newConfig = { ...prev.config, ...updates };
      saveBridgeConfig(newConfig);
      return { ...prev, config: newConfig };
    });
  }, []);

  /**
   * Manually trigger pipeline from absorb results.
   */
  const triggerPipeline = useCallback(
    async (event: AbsorbCompletionEvent): Promise<void> => {
      setState((prev) => ({ ...prev, isTriggering: true, lastError: null }));

      try {
        const result = await onAbsorbComplete(event, state.config);

        if (result.success) {
          setState((prev) => ({
            ...prev,
            isTriggering: false,
            lastPipelineId: result.pipelineId || null,
            lastError: null,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isTriggering: false,
            lastError: result.error || 'Unknown error',
          }));
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isTriggering: false,
          lastError: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [state.config]
  );

  /**
   * Get recommended configuration based on absorb results.
   */
  const getRecommendation = useCallback((event: AbsorbCompletionEvent) => {
    return recommendPipelineConfig(event);
  }, []);

  /**
   * Generate human-readable summary of what pipeline will do.
   */
  const getSummary = useCallback(
    (event: AbsorbCompletionEvent) => {
      return generatePipelineSummary(event, state.config);
    },
    [state.config]
  );

  /**
   * Reset bridge state.
   */
  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastPipelineId: null,
      lastError: null,
      isTriggering: false,
    }));
  }, []);

  return {
    config: state.config,
    lastPipelineId: state.lastPipelineId,
    lastError: state.lastError,
    isTriggering: state.isTriggering,
    updateConfig,
    triggerPipeline,
    getRecommendation,
    getSummary,
    reset,
  };
}
