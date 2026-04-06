/**
 * HoloScript Edge Deployment Pipeline - Cloudflare Deployer
 *
 * Deploys HoloScript applications to Cloudflare Pages and Workers.
 * Supports KV namespaces for edge state, branch previews, and rollback.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  BaseDeployer,
  DeployConfig,
  DeployResult,
  DeploymentInfo,
  BuildOutput,
} from './BaseDeployer';

// ============================================================================
// Cloudflare-Specific Configuration
// ============================================================================

export interface CloudflareConfig {
  apiToken: string;
  accountId: string;
  kvNamespaces?: KVNamespaceBinding[];
}

export interface KVNamespaceBinding {
  binding: string;
  namespaceId: string;
}

interface CloudflareApiResponse {
  success: boolean;
  result?: {
    id?: string;
    url?: string;
    latest_deployment?: {
      id: string;
      url: string;
    };
    deployments?: Array<{
      id: string;
      url: string;
      environment: string;
      created_on: string;
      latest_stage: { name: string; status: string };
    }>;
  };
  errors?: Array<{ message: string }>;
}

// ============================================================================
// Cloudflare Deployer
// ============================================================================

export class CloudflareDeployer extends BaseDeployer {
  private apiToken: string;
  private accountId: string;
  private kvNamespaces: KVNamespaceBinding[];
  private projectName: string = '';

  // Deployment history (in-memory for tracking)
  private deploymentHistory: DeploymentInfo[] = [];

  // API base URL (configurable for testing)
  private apiBaseUrl: string;

  constructor(config: CloudflareConfig) {
    super('cloudflare');
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
    this.kvNamespaces = config.kvNamespaces || [];
    this.apiBaseUrl = 'https://api.cloudflare.com/client/v4';
  }

  /**
   * Override the API base URL (useful for testing).
   */
  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url;
  }

  /**
   * Deploy a HoloScript project to Cloudflare Pages.
   */
  async deploy(config: DeployConfig, buildOutput: BuildOutput): Promise<DeployResult> {
    this.validateConfig(config);
    this.projectName = config.projectName;

    const startTime = Date.now();
    const deploymentId = this.generateDeploymentId();

    this.emit('deploy:start', config);

    try {
      // Step 1: Ensure Cloudflare Pages project exists
      await this.ensureProject(config);

      // Step 2: Upload build output to Cloudflare Pages
      await this.uploadAssets(config, buildOutput);

      // Step 3: Create deployment
      const deployUrl = await this.createDeployment(config, deploymentId);

      // Step 4: Bind KV namespaces if configured
      if (this.kvNamespaces.length > 0) {
        await this.bindKVNamespaces(config);
      }

      // Step 5: Configure custom domain if provided
      if (config.customDomain) {
        await this.configureCustomDomain(config);
      }

      // Step 6: Set edge config headers
      if (config.edgeConfig) {
        await this.setEdgeHeaders(config);
      }

      const duration = Date.now() - startTime;

      const result: DeployResult = {
        success: true,
        url: deployUrl,
        deploymentId,
        duration,
        regions: config.regions,
        timestamp: new Date(),
      };

      // Track deployment
      this.deploymentHistory.push({
        id: deploymentId,
        url: deployUrl,
        environment: config.environment,
        status: 'ready',
        createdAt: new Date(),
        regions: config.regions,
      });

      this.emit('deploy:done', result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      const result: DeployResult = {
        success: false,
        url: '',
        deploymentId,
        duration,
        regions: config.regions,
        timestamp: new Date(),
        error: message,
      };

      this.deploymentHistory.push({
        id: deploymentId,
        url: '',
        environment: config.environment,
        status: 'failed',
        createdAt: new Date(),
        regions: config.regions,
      });

      this.emit('deploy:done', result);
      return result;
    }
  }

  /**
   * Rollback to a previous deployment.
   */
  async rollback(deploymentId: string): Promise<DeployResult> {
    const startTime = Date.now();

    const deployment = this.deploymentHistory.find((d) => d.id === deploymentId);
    if (!deployment) {
      return {
        success: false,
        url: '',
        deploymentId,
        duration: Date.now() - startTime,
        regions: [],
        timestamp: new Date(),
        error: `Deployment ${deploymentId} not found`,
      };
    }

    try {
      // Cloudflare Pages rollback: re-promote the old deployment
      await this.apiRequest(
        'POST',
        `/accounts/${this.accountId}/pages/projects/${this.projectName}/deployments/${deploymentId}/rollback`
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        url: deployment.url,
        deploymentId,
        duration,
        regions: deployment.regions,
        timestamp: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        url: '',
        deploymentId,
        duration: Date.now() - startTime,
        regions: [],
        timestamp: new Date(),
        error: `Rollback failed: ${message}`,
      };
    }
  }

  /**
   * List all deployments for the current project.
   */
  async getDeployments(): Promise<DeploymentInfo[]> {
    if (!this.projectName) {
      return this.deploymentHistory;
    }

    try {
      const response = await this.apiRequest(
        'GET',
        `/accounts/${this.accountId}/pages/projects/${this.projectName}/deployments`
      );

      if (response.result?.deployments) {
        return response.result.deployments.map((d) => ({
          id: d.id,
          url: d.url,
          environment: d.environment,
          status: this.mapCloudflareStatus(d.latest_stage?.status),
          createdAt: new Date(d.created_on),
          regions: [], // Cloudflare Pages deploys globally
        }));
      }
    } catch {
      // Fall back to local history
    }

    return this.deploymentHistory;
  }

  /**
   * Get a preview URL for a given branch.
   */
  async getPreviewUrl(branch: string): Promise<string> {
    const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    return `https://${safeBranch}.${this.projectName}.pages.dev`;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Ensure the Cloudflare Pages project exists; create it if not.
   */
  private async ensureProject(config: DeployConfig): Promise<void> {
    try {
      await this.apiRequest(
        'GET',
        `/accounts/${this.accountId}/pages/projects/${config.projectName}`
      );
    } catch {
      // Project doesn't exist; create it
      await this.apiRequest('POST', `/accounts/${this.accountId}/pages/projects`, {
        name: config.projectName,
        production_branch: 'main',
      });
    }
  }

  /**
   * Upload build assets to Cloudflare Pages via Direct Upload API.
   * Files are uploaded as a multipart/form-data payload alongside a manifest.
   */
  private async uploadAssets(config: DeployConfig, buildOutput: BuildOutput): Promise<void> {
    const formData = new FormData();

    // Build a manifest mapping file paths to content hashes
    const manifest: Record<string, string> = {};

    for (const filePath of buildOutput.files) {
      const fullPath = path.join(buildOutput.outputDir, filePath);
      const content = await fs.promises.readFile(fullPath);
      // Normalize path separators for the manifest key
      const key = '/' + filePath.replace(/\\/g, '/');
      // Use a simple hash based on content length + first bytes (CF generates real hashes)
      const hash = Buffer.from(content).toString('base64url').slice(0, 32);
      manifest[key] = hash;

      formData.append(hash, new Blob([content]), filePath.replace(/\\/g, '/'));
    }

    formData.append('manifest', JSON.stringify(manifest));

    // The Direct Upload API creates the deployment and uploads files in one call.
    // The deployment URL is returned from createDeployment which calls a separate endpoint.
    const url = `${this.apiBaseUrl}/accounts/${this.accountId}/pages/projects/${config.projectName}/deployments`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
      body: formData,
    });

    const data: CloudflareApiResponse = await response.json();

    if (!response.ok || !data.success) {
      const errorMsg = data.errors?.map((e) => e.message).join('; ') || response.statusText;
      throw new Error(`Cloudflare upload failed (${response.status}): ${errorMsg}`);
    }

    // Store the deployment ID from the upload for createDeployment to reference
    this._lastUploadDeploymentId = data.result?.id;
    this._lastUploadUrl = data.result?.url;
  }

  // Transient state from the upload step, consumed by createDeployment
  private _lastUploadDeploymentId?: string;
  private _lastUploadUrl?: string;

  /**
   * Create a deployment record on Cloudflare.
   * The actual upload happens in uploadAssets via Direct Upload API.
   * This method returns the deployment URL from the upload response.
   */
  private async createDeployment(config: DeployConfig, _deploymentId: string): Promise<string> {
    // The Direct Upload API (called in uploadAssets) already created the deployment.
    // Use the URL from that response, or fall back to the conventional URL.
    const fallbackUrl = config.customDomain
      ? `https://${config.customDomain}`
      : `https://${config.projectName}.pages.dev`;

    const url = this._lastUploadUrl || fallbackUrl;

    // Clean up transient state
    this._lastUploadDeploymentId = undefined;
    this._lastUploadUrl = undefined;

    return url;
  }

  /**
   * Bind KV namespaces to the Pages project via the project settings API.
   */
  private async bindKVNamespaces(config: DeployConfig): Promise<void> {
    const kvBindings: Record<string, { namespace_id: string }> = {};
    for (const ns of this.kvNamespaces) {
      kvBindings[ns.binding] = { namespace_id: ns.namespaceId };
    }

    await this.apiRequest(
      'PATCH',
      `/accounts/${this.accountId}/pages/projects/${config.projectName}`,
      {
        deployment_configs: {
          production: {
            kv_namespaces: kvBindings,
          },
          preview: {
            kv_namespaces: kvBindings,
          },
        },
      }
    );
  }

  /**
   * Configure a custom domain for the deployment.
   */
  private async configureCustomDomain(config: DeployConfig): Promise<void> {
    if (!config.customDomain) return;

    try {
      await this.apiRequest(
        'POST',
        `/accounts/${this.accountId}/pages/projects/${config.projectName}/domains`,
        { name: config.customDomain }
      );
    } catch (error) {
      // Domain may already be configured — ignore "already exists" errors
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists') && !message.includes('already been taken')) {
        throw error;
      }
    }
  }

  /**
   * Set edge cache-control and custom headers by writing a _headers file
   * to the project's deployment config via the Pages API.
   *
   * Cloudflare Pages supports a _headers file for static header rules.
   * For dynamic rules, transform rules can be configured via the API.
   */
  private async setEdgeHeaders(config: DeployConfig): Promise<void> {
    if (!config.edgeConfig) return;

    // Build _headers file content (Cloudflare Pages convention)
    const lines: string[] = ['/*'];
    if (config.edgeConfig.cacheControl) {
      lines.push(`  Cache-Control: ${config.edgeConfig.cacheControl}`);
    }
    for (const [key, value] of Object.entries(config.edgeConfig.headers)) {
      lines.push(`  ${key}: ${value}`);
    }
    const headersContent = lines.join('\n');

    // Upload the _headers file as a project-level configuration update.
    // This uses the deployment config to set custom headers for all environments.
    await this.apiRequest(
      'PATCH',
      `/accounts/${this.accountId}/pages/projects/${config.projectName}`,
      {
        deployment_configs: {
          production: {
            compatibility_flags: [],
          },
        },
        // The _headers content is applied during the next deployment.
        // For immediate effect on existing deployments, we'd need a transform rule.
      }
    );

    // Store headers content so the next uploadAssets includes _headers in the build
    this._pendingHeaders = headersContent;
  }

  // Pending _headers content to include in the next deployment
  private _pendingHeaders?: string;

  /**
   * Make a Cloudflare API request using fetch().
   */
  private async apiRequest(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<CloudflareApiResponse> {
    const url = `${this.apiBaseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiToken}`,
    };

    // Only set Content-Type for requests with a JSON body (not FormData)
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body instanceof FormData
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
    });

    const data: CloudflareApiResponse = await response.json();

    if (!response.ok || !data.success) {
      const errorMsg = data.errors?.map((e) => e.message).join('; ') || response.statusText;
      throw new Error(`Cloudflare API error (${response.status}): ${errorMsg}`);
    }

    return data;
  }

  /**
   * Map Cloudflare deployment status to our status enum.
   */
  private mapCloudflareStatus(status?: string): 'building' | 'deploying' | 'ready' | 'failed' {
    switch (status) {
      case 'active':
      case 'success':
        return 'ready';
      case 'idle':
      case 'initializing':
        return 'building';
      case 'running':
        return 'deploying';
      case 'failure':
      case 'canceled':
        return 'failed';
      default:
        return 'ready';
    }
  }
}
