/**
 * Version Control Hook
 *
 * Manages workflow version history and commits
 */

import { useState, useCallback, useEffect } from 'react';
import { getVersionControl } from '@/lib/versionControl';
import type { WorkflowCommit, WorkflowDiff } from '@/lib/versionControl';
import type { AgentWorkflow } from '@/lib/orchestrationStore';
import { logger } from '@/lib/logger';

export interface UseVersionControlOptions {
  workflowId: string;
  autoLoad?: boolean;
}

export interface UseVersionControlReturn {
  commits: WorkflowCommit[];
  branches: string[];
  loading: boolean;
  error: string | null;
  commit: (workflow: AgentWorkflow, message: string) => Promise<WorkflowCommit | null>;
  getHistory: () => Promise<void>;
  getDiff: (commitA: string, commitB: string) => Promise<WorkflowDiff[] | null>;
  revert: (commitId: string) => Promise<AgentWorkflow | null>;
  createBranch: (branchName: string) => Promise<void>;
  mergeBranch: (branchName: string) => Promise<WorkflowCommit | null>;
}

export function useVersionControl({
  workflowId,
  autoLoad = true,
}: UseVersionControlOptions): UseVersionControlReturn {
  const [commits, setCommits] = useState<WorkflowCommit[]>([]);
  const [branches, setBranches] = useState<string[]>(['main']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const vc = getVersionControl();
      const history = await vc.getHistory(workflowId);
      setCommits(history);

      const branchList = await vc.getBranches(workflowId);
      setBranches(branchList);
    } catch (err) {
      logger.error('[useVersionControl] Get history error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  const commit = useCallback(
    async (workflow: AgentWorkflow, message: string): Promise<WorkflowCommit | null> => {
      if (!message.trim()) {
        setError('Commit message is required');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const vc = getVersionControl();
        const newCommit = await vc.commit(workflow, message);
        setCommits((prev) => [newCommit, ...prev]);
        return newCommit;
      } catch (err) {
        logger.error('[useVersionControl] Commit error:', err);
        setError(err instanceof Error ? err.message : 'Failed to commit');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getDiff = useCallback(
    async (commitA: string, commitB: string): Promise<WorkflowDiff[] | null> => {
      setLoading(true);
      setError(null);

      try {
        const vc = getVersionControl();
        const diff = await vc.getDiff(commitA, commitB);
        return diff;
      } catch (err) {
        logger.error('[useVersionControl] Get diff error:', err);
        setError(err instanceof Error ? err.message : 'Failed to compute diff');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const revert = useCallback(
    async (commitId: string): Promise<AgentWorkflow | null> => {
      setLoading(true);
      setError(null);

      try {
        const vc = getVersionControl();
        const revertedWorkflow = await vc.revert(workflowId, commitId);
        return revertedWorkflow;
      } catch (err) {
        logger.error('[useVersionControl] Revert error:', err);
        setError(err instanceof Error ? err.message : 'Failed to revert');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [workflowId]
  );

  const createBranch = useCallback(
    async (branchName: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const vc = getVersionControl();
        await vc.createBranch(workflowId, branchName);
        setBranches((prev) => [...prev, branchName]);
      } catch (err) {
        logger.error('[useVersionControl] Create branch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to create branch');
      } finally {
        setLoading(false);
      }
    },
    [workflowId]
  );

  const mergeBranch = useCallback(
    async (branchName: string): Promise<WorkflowCommit | null> => {
      setLoading(true);
      setError(null);

      try {
        const vc = getVersionControl();
        const mergeCommit = await vc.mergeBranch(workflowId, branchName);
        setCommits((prev) => [mergeCommit, ...prev]);
        return mergeCommit;
      } catch (err) {
        logger.error('[useVersionControl] Merge branch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to merge branch');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [workflowId]
  );

  // Auto-load history on mount
  useEffect(() => {
    if (autoLoad) {
      getHistory();
    }
  }, [autoLoad, getHistory]);

  return {
    commits,
    branches,
    loading,
    error,
    commit,
    getHistory,
    getDiff,
    revert,
    createBranch,
    mergeBranch,
  };
}
