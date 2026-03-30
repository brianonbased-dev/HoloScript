/**
 * useAbsorbService — React hook combining credit management with absorb operations.
 *
 * Wraps the absorbServiceStore with credit-gated operation helpers.
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useAbsorbServiceStore } from '@/lib/stores/absorbServiceStore';
import { OPERATION_COSTS, type OperationType } from '@/lib/absorb/pricing';
import { absorbFetch } from '@/lib/absorb/fetchWithAuth';

export function useAbsorbService() {
  const store = useAbsorbServiceStore();

  // Load balance, projects, and moltbook data on mount
  useEffect(() => {
    store.fetchBalance();
    store.fetchProjects();
    store.fetchMoltbookAgents();
    store.fetchMoltbookSummary();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Get the estimated cost for an operation type.
   */
  const estimateCost = useCallback(
    (operationType: OperationType) => {
      const op = OPERATION_COSTS[operationType];
      return {
        costCents: op.baseCostCents,
        costDollars: (op.baseCostCents / 100).toFixed(2),
        description: op.description,
        canAfford: store.creditBalance >= op.baseCostCents,
      };
    },
    [store.creditBalance]
  );

  /**
   * Run absorb on a project with credit checking.
   */
  const runAbsorb = useCallback(
    async (projectId: string, depth: 'shallow' | 'deep' = 'shallow') => {
      const res = await absorbFetch(`/api/absorb/projects/${projectId}/absorb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depth, tier: store.qualityTier }),
      });
      const data = await res.json();
      if (res.ok) {
        store.fetchBalance();
        store.fetchProjects();
      }
      return { success: res.ok, data };
    },
    [store]
  );

  /**
   * Run daemon improvement on a project.
   */
  const runImprove = useCallback(
    async (projectId: string, profile: 'quick' | 'balanced' | 'deep' = 'quick') => {
      const res = await absorbFetch(`/api/absorb/projects/${projectId}/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, tier: store.qualityTier }),
      });
      const data = await res.json();
      if (res.ok) {
        store.fetchBalance();
        store.fetchProjects();
      }
      return { success: res.ok, data };
    },
    [store]
  );

  /**
   * Run pipeline on a project.
   */
  const runPipeline = useCallback(
    async (projectId: string, layer: 'l0' | 'l1' | 'l2' = 'l0') => {
      const res = await absorbFetch(`/api/absorb/projects/${projectId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layer }),
      });
      const data = await res.json();
      if (res.ok) {
        store.fetchBalance();
        store.fetchProjects();
      }
      return { success: res.ok, data };
    },
    [store]
  );

  /**
   * Run GraphRAG query on a project.
   */
  const runQuery = useCallback(
    async (projectId: string, query: string, withLLM = false) => {
      const res = await absorbFetch(`/api/absorb/projects/${projectId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, withLLM }),
      });
      const data = await res.json();
      if (res.ok) {
        store.fetchBalance();
      }
      return { success: res.ok, data };
    },
    [store]
  );

  /**
   * Render a screenshot or PDF export.
   */
  const runRender = useCallback(
    async (
      projectId: string,
      format: 'png' | 'jpeg' | 'webp' | 'pdf' = 'png',
      options?: { width?: number; height?: number; quality?: number }
    ) => {
      const res = await absorbFetch(`/api/absorb/projects/${projectId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, ...options }),
      });
      const data = await res.json();
      if (res.ok) {
        store.fetchBalance();
      }
      return { success: res.ok, data };
    },
    [store]
  );

  /**
   * Run semantic diff between two source versions.
   */
  const runDiff = useCallback(
    async (projectId: string, sourceA: string, sourceB: string) => {
      const res = await absorbFetch(`/api/absorb/projects/${projectId}/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceA, sourceB }),
      });
      const data = await res.json();
      if (res.ok) {
        store.fetchBalance();
      }
      return { success: res.ok, data };
    },
    [store]
  );

  /**
   * Purchase a credit package — redirects to Stripe checkout.
   */
  const purchaseCredits = useCallback(async (packageId: string) => {
    const res = await absorbFetch('/api/absorb/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId }),
    });
    const data = await res.json();
    if (data.sessionUrl) {
      window.location.href = data.sessionUrl;
    }
    return { success: res.ok, data };
  }, []);

  return {
    ...store,
    estimateCost,
    runAbsorb,
    runImprove,
    runPipeline,
    runQuery,
    runRender,
    runDiff,
    purchaseCredits,
  };
}
