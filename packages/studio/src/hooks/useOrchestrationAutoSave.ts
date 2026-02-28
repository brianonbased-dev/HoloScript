/**
 * Orchestration Auto-Save Hook
 *
 * Automatically persists orchestration state (workflows, behavior trees, agent ensemble)
 * to localStorage every 30 seconds. Provides graceful error handling and console logging
 * for debugging.
 *
 * Usage:
 * ```tsx
 * import { useOrchestrationAutoSave } from '@/hooks/useOrchestrationAutoSave';
 *
 * function MyComponent() {
 *   useOrchestrationAutoSave();
 *   // ... rest of component
 * }
 * ```
 *
 * Persisted Data:
 * - Workflows (workflows Map)
 * - Behavior Trees (behaviorTrees Map)
 * - Active workflow/tree IDs
 * - Agent ensemble positions (if applicable)
 *
 * Storage Keys:
 * - holoscript-workflows
 * - holoscript-behavior-trees
 * - holoscript-active-workflow
 * - holoscript-active-behavior-tree
 */

import { useEffect } from 'react';
import { useOrchestrationStore } from '@/lib/orchestrationStore';

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
const STORAGE_PREFIX = 'holoscript';

export function useOrchestrationAutoSave() {
  const workflows = useOrchestrationStore((s) => s.workflows);
  const behaviorTrees = useOrchestrationStore((s) => s.behaviorTrees);
  const activeWorkflow = useOrchestrationStore((s) => s.activeWorkflow);
  const activeBehaviorTree = useOrchestrationStore((s) => s.activeBehaviorTree);

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        // Persist workflows
        const workflowsArray = Array.from(workflows.entries());
        localStorage.setItem(
          `${STORAGE_PREFIX}-workflows`,
          JSON.stringify(workflowsArray)
        );

        // Persist behavior trees
        const behaviorTreesArray = Array.from(behaviorTrees.entries());
        localStorage.setItem(
          `${STORAGE_PREFIX}-behavior-trees`,
          JSON.stringify(behaviorTreesArray)
        );

        // Persist active workflow ID
        if (activeWorkflow) {
          localStorage.setItem(
            `${STORAGE_PREFIX}-active-workflow`,
            activeWorkflow
          );
        } else {
          localStorage.removeItem(`${STORAGE_PREFIX}-active-workflow`);
        }

        // Persist active behavior tree ID
        if (activeBehaviorTree) {
          localStorage.setItem(
            `${STORAGE_PREFIX}-active-behavior-tree`,
            activeBehaviorTree
          );
        } else {
          localStorage.removeItem(`${STORAGE_PREFIX}-active-behavior-tree`);
        }

        // Log successful save
        console.log(
          `[OrchestrationAutoSave] Saved at ${new Date().toLocaleTimeString()}:`,
          {
            workflows: workflowsArray.length,
            behaviorTrees: behaviorTreesArray.length,
            activeWorkflow,
            activeBehaviorTree,
          }
        );
      } catch (error) {
        // Handle localStorage quota errors, security errors, etc.
        console.error('[OrchestrationAutoSave] Failed to save:', error);

        // If quota exceeded, try clearing old data
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.warn('[OrchestrationAutoSave] localStorage quota exceeded. Consider clearing old data.');
        }
      }
    }, AUTO_SAVE_INTERVAL);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [workflows, behaviorTrees, activeWorkflow, activeBehaviorTree]);

  // No return value needed - this hook just handles side effects
}

/**
 * Utility function to manually clear all persisted orchestration data.
 * Useful for debugging or resetting the application state.
 *
 * @example
 * ```tsx
 * import { clearOrchestrationStorage } from '@/hooks/useOrchestrationAutoSave';
 *
 * // Clear all saved data
 * clearOrchestrationStorage();
 * ```
 */
export function clearOrchestrationStorage() {
  const keys = [
    `${STORAGE_PREFIX}-workflows`,
    `${STORAGE_PREFIX}-behavior-trees`,
    `${STORAGE_PREFIX}-active-workflow`,
    `${STORAGE_PREFIX}-active-behavior-tree`,
  ];

  keys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`[OrchestrationAutoSave] Failed to remove ${key}:`, error);
    }
  });

  console.log('[OrchestrationAutoSave] Cleared all persisted data');
}
