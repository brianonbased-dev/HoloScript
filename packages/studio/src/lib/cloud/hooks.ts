// @ts-nocheck
/**
 * React hooks for cloud deployment management
 */

import { useState, useEffect, useCallback } from 'react';
import { getCloudClient } from './client';
import { StudioEvents } from '@/lib/analytics';
import type {
  Deployment,
  DeploymentConfig,
  ExecutionLog,
  ExecutionMetrics,
  DeploymentAnalytics,
  BillingInfo,
} from './types';

// ── useDeployments ────────────────────────────────────────────────────────────

export function useDeployments(params?: { status?: string; limit?: number }) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDeployments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const client = getCloudClient();
      const response = await client.listDeployments(params);
      setDeployments(response.deployments);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [params?.status, params?.limit]);

  useEffect(() => {
    loadDeployments();
  }, [loadDeployments]);

  return {
    deployments,
    loading,
    error,
    refresh: loadDeployments,
  };
}

// ── useDeployment ─────────────────────────────────────────────────────────────

export function useDeployment(deploymentId: string | null) {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDeployment = useCallback(async () => {
    if (!deploymentId) {
      setDeployment(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getCloudClient();
      const dep = await client.getDeployment(deploymentId);
      setDeployment(dep);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    loadDeployment();
  }, [loadDeployment]);

  return {
    deployment,
    loading,
    error,
    refresh: loadDeployment,
  };
}

// ── useDeploy ─────────────────────────────────────────────────────────────────

export function useDeploy() {
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);

  const deploy = useCallback(async (config: DeploymentConfig) => {
    setDeploying(true);
    setError(null);
    setDeployment(null);

    try {
      const client = getCloudClient();
      const response = await client.deploy(config);
      setDeployment(response.deployment);
      StudioEvents.projectDeployed(response.deployment.id, config.provider ?? 'default');
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      StudioEvents.deployFailed(msg);
      setError(msg);
      throw err;
    } finally {
      setDeploying(false);
    }
  }, []);

  const redeploy = useCallback(async (deploymentId: string) => {
    setDeploying(true);
    setError(null);

    try {
      const client = getCloudClient();
      const dep = await client.redeploy(deploymentId);
      setDeployment(dep);
      return dep;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setDeploying(false);
    }
  }, []);

  const deleteDeployment = useCallback(async (deploymentId: string) => {
    try {
      const client = getCloudClient();
      await client.deleteDeployment(deploymentId);
      setDeployment(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, []);

  return {
    deploy,
    redeploy,
    deleteDeployment,
    deploying,
    error,
    deployment,
  };
}

// ── useExecutionLogs ──────────────────────────────────────────────────────────

export function useExecutionLogs(
  deploymentId: string | null,
  options?: {
    limit?: number;
    level?: string;
    autoRefresh?: boolean;
    refreshInterval?: number;
  }
) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!deploymentId) {
      setLogs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getCloudClient();
      const fetchedLogs = await client.getLogs(deploymentId, {
        limit: options?.limit,
        level: options?.level,
      });
      setLogs(fetchedLogs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId, options?.limit, options?.level]);

  useEffect(() => {
    loadLogs();

    if (options?.autoRefresh && deploymentId) {
      const interval = setInterval(loadLogs, options.refreshInterval || 5000);
      return () => clearInterval(interval);
    }
  }, [loadLogs, options?.autoRefresh, options?.refreshInterval, deploymentId]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    loading,
    error,
    refresh: loadLogs,
    clearLogs,
  };
}

// ── useStreamLogs ─────────────────────────────────────────────────────────────

export function useStreamLogs(deploymentId: string | null) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(async () => {
    if (!deploymentId) return;

    setStreaming(true);
    setError(null);
    setLogs([]);

    try {
      const client = getCloudClient();
      for await (const log of client.streamLogs(deploymentId)) {
        setLogs((prev) => [...prev, log]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
    }
  }, [deploymentId]);

  const stopStream = useCallback(() => {
    setStreaming(false);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    streaming,
    error,
    startStream,
    stopStream,
    clearLogs,
  };
}

// ── useDeploymentMetrics ──────────────────────────────────────────────────────

export function useDeploymentMetrics(
  deploymentId: string | null,
  autoRefresh = false,
  refreshInterval = 60000
) {
  const [metrics, setMetrics] = useState<ExecutionMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!deploymentId) {
      setMetrics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getCloudClient();
      const data = await client.getMetrics(deploymentId);
      setMetrics(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    loadMetrics();

    if (autoRefresh && deploymentId) {
      const interval = setInterval(loadMetrics, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [loadMetrics, autoRefresh, refreshInterval, deploymentId]);

  return {
    metrics,
    loading,
    error,
    refresh: loadMetrics,
  };
}

// ── useDeploymentAnalytics ────────────────────────────────────────────────────

export function useDeploymentAnalytics(
  deploymentId: string | null,
  period: '1h' | '24h' | '7d' | '30d' = '24h'
) {
  const [analytics, setAnalytics] = useState<DeploymentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (!deploymentId) {
      setAnalytics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getCloudClient();
      const data = await client.getAnalytics(deploymentId, period);
      setAnalytics(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [deploymentId, period]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return {
    analytics,
    loading,
    error,
    refresh: loadAnalytics,
  };
}

// ── useBilling ────────────────────────────────────────────────────────────────

export function useBilling() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const client = getCloudClient();
      const data = await client.getBilling();
      setBilling(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  return {
    billing,
    loading,
    error,
    refresh: loadBilling,
  };
}

// ── useCloudHealth ────────────────────────────────────────────────────────────

export function useCloudHealth() {
  const [status, setStatus] = useState<'healthy' | 'degraded' | 'down' | 'unknown'>('unknown');
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);

    try {
      const client = getCloudClient();
      const health = await client.health();
      setStatus(health.status);
    } catch {
      setStatus('down');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();

    // Check health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return {
    status,
    checking,
    checkHealth,
  };
}
