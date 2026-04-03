/**
 * Cloud deployment client
 *
 * Manages workflow deployments to serverless platforms
 */

import type {
  Deployment,
  DeploymentConfig,
  DeploymentResponse,
  DeploymentListResponse,
  ExecutionResponse,
  ExecutionLog,
  ExecutionMetrics,
  DeploymentAnalytics,
  BillingInfo,
} from './types';

export interface CloudClientConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export class CloudClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: CloudClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://cloud.holoscript.net/api';
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  // ── Authentication ────────────────────────────────────────────────────────

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers);

    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }

    headers.set('Content-Type', 'application/json');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // ── Deployment Management ─────────────────────────────────────────────────

  /**
   * Deploy a workflow to the cloud
   */
  async deploy(config: DeploymentConfig): Promise<DeploymentResponse> {
    return this.fetch<DeploymentResponse>('/deployments', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  /**
   * List all deployments
   */
  async listDeployments(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<DeploymentListResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);

    return this.fetch<DeploymentListResponse>(`/deployments?${query.toString()}`);
  }

  /**
   * Get deployment details
   */
  async getDeployment(deploymentId: string): Promise<Deployment> {
    return this.fetch<Deployment>(`/deployments/${deploymentId}`);
  }

  /**
   * Update deployment configuration
   */
  async updateDeployment(
    deploymentId: string,
    updates: Partial<DeploymentConfig>
  ): Promise<Deployment> {
    return this.fetch<Deployment>(`/deployments/${deploymentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete a deployment
   */
  async deleteDeployment(deploymentId: string): Promise<void> {
    await this.fetch<void>(`/deployments/${deploymentId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Redeploy with latest workflow version
   */
  async redeploy(deploymentId: string): Promise<Deployment> {
    return this.fetch<Deployment>(`/deployments/${deploymentId}/redeploy`, {
      method: 'POST',
    });
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /**
   * Execute a deployed workflow
   */
  async execute(deploymentId: string, input?: Record<string, any>): Promise<ExecutionResponse> {
    return this.fetch<ExecutionResponse>(`/deployments/${deploymentId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  /**
   * Get execution logs
   */
  async getLogs(
    deploymentId: string,
    params?: {
      limit?: number;
      level?: string;
      startTime?: number;
      endTime?: number;
    }
  ): Promise<ExecutionLog[]> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.level) query.set('level', params.level);
    if (params?.startTime) query.set('startTime', params.startTime.toString());
    if (params?.endTime) query.set('endTime', params.endTime.toString());

    return this.fetch<ExecutionLog[]>(`/deployments/${deploymentId}/logs?${query.toString()}`);
  }

  /**
   * Stream logs in real-time
   */
  async *streamLogs(deploymentId: string): AsyncGenerator<ExecutionLog> {
    const url = `${this.baseUrl}/deployments/${deploymentId}/logs/stream`;
    const headers = new Headers();

    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              yield JSON.parse(line) as ExecutionLog;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Metrics & Analytics ───────────────────────────────────────────────────

  /**
   * Get execution metrics
   */
  async getMetrics(deploymentId: string): Promise<ExecutionMetrics> {
    return this.fetch<ExecutionMetrics>(`/deployments/${deploymentId}/metrics`);
  }

  /**
   * Get deployment analytics
   */
  async getAnalytics(
    deploymentId: string,
    period: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<DeploymentAnalytics> {
    return this.fetch<DeploymentAnalytics>(
      `/deployments/${deploymentId}/analytics?period=${period}`
    );
  }

  // ── Billing ───────────────────────────────────────────────────────────────

  /**
   * Get billing information
   */
  async getBilling(): Promise<BillingInfo> {
    return this.fetch<BillingInfo>('/billing');
  }

  // ── Health Check ──────────────────────────────────────────────────────────

  /**
   * Check cloud service health
   */
  async health(): Promise<{ status: 'healthy' | 'degraded' | 'down' }> {
    try {
      return await this.fetch<{ status: 'healthy' | 'degraded' | 'down' }>('/health');
    } catch {
      return { status: 'down' };
    }
  }
}

// ── Singleton Instance ────────────────────────────────────────────────────────

let cloudClientInstance: CloudClient | null = null;

export function getCloudClient(config?: CloudClientConfig): CloudClient {
  if (!cloudClientInstance) {
    cloudClientInstance = new CloudClient(config);
  }
  return cloudClientInstance;
}

export function setCloudClient(client: CloudClient) {
  cloudClientInstance = client;
}
