/**
 * HoloScript Edge Deployment Pipeline - Vercel Deployer
 *
 * Deploys HoloScript applications to Vercel.
 * Supports instant rollback via alias, environment variable management,
 * and serverless function configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  BaseDeployer,
  DeployConfig,
  DeployResult,
  DeploymentInfo,
  BuildOutput,
} from './BaseDeployer';

// ============================================================================
// Vercel-Specific Configuration
// ============================================================================

export interface VercelConfig {
  apiToken: string;
  teamId?: string;
  orgId?: string;
}

export interface VercelEnvironmentVariable {
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  type?: 'plain' | 'encrypted' | 'secret';
}

export interface VercelServerlessConfig {
  runtime: 'nodejs18.x' | 'nodejs20.x' | 'edge';
  memory?: number;
  maxDuration?: number;
  regions?: string[];
}

interface VercelApiResponse {
  id?: string;
  url?: string;
  readyState?: string;
  alias?: string[];
  deployments?: Array<{
    uid: string;
    url: string;
    state: string;
    created: number;
    meta?: { environment?: string };
    regions?: string[];
  }>;
  error?: { message: string; code: string };
}

// ============================================================================
// Vercel Deployer
// ============================================================================

export class VercelDeployer extends BaseDeployer {
  private apiToken: string;
  private teamId?: string;
  private orgId?: string;
  private projectName: string = '';

  // Deployment history (in-memory)
  private deploymentHistory: DeploymentInfo[] = [];

  // Environment variables managed for the project
  private envVars: VercelEnvironmentVariable[] = [];

  // Serverless config
  private serverlessConfig: VercelServerlessConfig = {
    runtime: 'nodejs20.x',
    memory: 1024,
    maxDuration: 30,
  };

  // API base URL (configurable for testing)
  private apiBaseUrl: string;

  constructor(config: VercelConfig) {
    super('vercel');
    this.apiToken = config.apiToken;
    this.teamId = config.teamId;
    this.orgId = config.orgId;
    this.apiBaseUrl = 'https://api.vercel.com';
  }

  /**
   * Override the API base URL (useful for testing).
   */
  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url;
  }

  /**
   * Set serverless function configuration.
   */
  setServerlessConfig(config: Partial<VercelServerlessConfig>): void {
    this.serverlessConfig = { ...this.serverlessConfig, ...config };
  }

  /**
   * Add an environment variable for the project.
   */
  addEnvVar(envVar: VercelEnvironmentVariable): void {
    // Remove existing entry for same key + targets
    this.envVars = this.envVars.filter((v) => v.key !== envVar.key);
    this.envVars.push(envVar);
  }

  /**
   * Get all configured environment variables.
   */
  getEnvVars(): VercelEnvironmentVariable[] {
    return [...this.envVars];
  }

  /**
   * Remove an environment variable by key.
   */
  removeEnvVar(key: string): boolean {
    const before = this.envVars.length;
    this.envVars = this.envVars.filter((v) => v.key !== key);
    return this.envVars.length < before;
  }

  /**
   * Deploy a HoloScript project to Vercel.
   */
  async deploy(config: DeployConfig, buildOutput: BuildOutput): Promise<DeployResult> {
    this.validateConfig(config);
    this.projectName = config.projectName;

    const startTime = Date.now();
    const deploymentId = this.generateDeploymentId();

    this.emit('deploy:start', config);

    try {
      // Step 1: Ensure Vercel project exists
      await this.ensureProject(config);

      // Step 2: Sync environment variables
      await this.syncEnvVars(config);

      // Step 3: Upload build files
      await this.uploadFiles(config, buildOutput);

      // Step 4: Create deployment
      const deployUrl = await this.createDeployment(config, deploymentId);

      // Step 5: Configure serverless functions
      await this.configureServerless(config);

      // Step 6: Set up alias (custom domain) if provided
      if (config.customDomain) {
        await this.setAlias(config, deploymentId);
      }

      // Step 7: Configure edge headers
      if (config.edgeConfig) {
        await this.configureEdge(config);
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
   * Rollback to a previous deployment via alias swap.
   * Vercel supports instant rollback by re-aliasing a previous deployment.
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
      // Vercel instant rollback: re-alias the old deployment to production
      const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';
      await this.apiRequest('POST', `/v2/deployments/${deploymentId}/aliases${teamQuery}`, {
        alias: `${this.projectName}.vercel.app`,
      });

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
      const teamQuery = this.teamId ? `&teamId=${this.teamId}` : '';
      const response = await this.apiRequest(
        'GET',
        `/v6/deployments?projectId=${this.projectName}${teamQuery}`
      );

      if (response.deployments) {
        return response.deployments.map((d) => ({
          id: d.uid,
          url: `https://${d.url}`,
          environment: d.meta?.environment || 'production',
          status: this.mapVercelState(d.state),
          createdAt: new Date(d.created),
          regions: d.regions || [],
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
    return `https://${this.projectName}-git-${safeBranch}.vercel.app`;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Ensure the Vercel project exists.
   */
  private async ensureProject(config: DeployConfig): Promise<void> {
    const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';

    try {
      await this.apiRequest('GET', `/v9/projects/${config.projectName}${teamQuery}`);
    } catch {
      // Project doesn't exist; create it
      await this.apiRequest('POST', `/v9/projects${teamQuery}`, {
        name: config.projectName,
        framework: null,
        publicSource: false,
      });
    }
  }

  /**
   * Sync environment variables to the Vercel project.
   * Uses the Vercel Environment Variables API to upsert each variable.
   */
  private async syncEnvVars(config: DeployConfig): Promise<void> {
    if (this.envVars.length === 0) return;

    const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';

    for (const envVar of this.envVars) {
      try {
        // Try to create the env var
        await this.apiRequest('POST', `/v10/projects/${config.projectName}/env${teamQuery}`, {
          key: envVar.key,
          value: envVar.value,
          target: envVar.target,
          type: envVar.type || 'encrypted',
        });
      } catch (error) {
        // If it already exists, update it via PATCH
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('already exist') || message.includes('ENV_ALREADY_EXISTS')) {
          await this.apiRequest(
            'PATCH',
            `/v10/projects/${config.projectName}/env/${envVar.key}${teamQuery}`,
            {
              value: envVar.value,
              target: envVar.target,
              type: envVar.type || 'encrypted',
            }
          );
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Upload build files to Vercel.
   * Computes SHA1 digests and uploads each file via the Vercel File API.
   * Stores file metadata for use in createDeployment.
   */
  private async uploadFiles(_config: DeployConfig, buildOutput: BuildOutput): Promise<void> {
    const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';
    this._uploadedFiles = [];

    for (const filePath of buildOutput.files) {
      const fullPath = path.join(buildOutput.outputDir, filePath);
      const content = await fs.promises.readFile(fullPath);

      // Compute SHA1 digest (Vercel uses this to deduplicate)
      const sha = crypto.createHash('sha1').update(content).digest('hex');
      const size = content.length;

      // Upload file content with SHA1 digest header
      const url = `${this.apiBaseUrl}/v2/files${teamQuery}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/octet-stream',
          'x-vercel-digest': sha,
          'Content-Length': String(size),
        },
        body: content,
      });

      if (!response.ok) {
        // 409 means file already uploaded (deduplication) — that's fine
        if (response.status !== 409) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = (errData as VercelApiResponse).error?.message || response.statusText;
          throw new Error(
            `Vercel file upload failed for ${filePath} (${response.status}): ${errMsg}`
          );
        }
      }

      this._uploadedFiles.push({
        file: filePath.replace(/\\/g, '/'),
        sha,
        size,
      });
    }
  }

  // Transient state: files uploaded in uploadFiles, consumed by createDeployment
  private _uploadedFiles: Array<{ file: string; sha: string; size: number }> = [];

  /**
   * Create a deployment on Vercel referencing previously uploaded files.
   */
  private async createDeployment(config: DeployConfig, _deploymentId: string): Promise<string> {
    const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';

    // Build the files array for the deployment API
    const files = this._uploadedFiles.map((f) => ({
      file: f.file,
      sha: f.sha,
      size: f.size,
    }));

    // Build project settings including serverless config
    const projectSettings: Record<string, unknown> = {};
    if (this.serverlessConfig.runtime === 'edge') {
      projectSettings.framework = null;
    }

    const deployPayload: Record<string, unknown> = {
      name: config.projectName,
      files,
      target: config.environment === 'production' ? 'production' : undefined,
      projectSettings,
    };

    // Add serverless function config if applicable
    if (this.serverlessConfig) {
      deployPayload.functions = {
        'api/**/*.js': {
          runtime: this.serverlessConfig.runtime,
          memory: this.serverlessConfig.memory,
          maxDuration: this.serverlessConfig.maxDuration,
        },
      };
      if (this.serverlessConfig.regions && this.serverlessConfig.regions.length > 0) {
        deployPayload.regions = this.serverlessConfig.regions;
      }
    }

    const response = await this.apiRequest('POST', `/v13/deployments${teamQuery}`, deployPayload);

    // Clean up transient state
    this._uploadedFiles = [];

    // Return the deployment URL
    if (response.url) {
      return `https://${response.url}`;
    }

    return config.customDomain
      ? `https://${config.customDomain}`
      : `https://${config.projectName}.vercel.app`;
  }

  /**
   * Configure serverless function settings via the Vercel project API.
   * Updates the project's serverless function configuration (runtime, memory, maxDuration).
   */
  private async configureServerless(config: DeployConfig): Promise<void> {
    const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';

    await this.apiRequest('PATCH', `/v9/projects/${config.projectName}${teamQuery}`, {
      serverlessFunctionRegion: this.serverlessConfig.regions?.[0] || undefined,
    });
    // Note: per-function runtime/memory/maxDuration are set via the functions
    // field in the deployment payload (handled in createDeployment).
  }

  /**
   * Set an alias (custom domain) on the deployment.
   */
  private async setAlias(config: DeployConfig, deploymentId: string): Promise<void> {
    if (!config.customDomain) return;

    const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';

    await this.apiRequest('POST', `/v2/deployments/${deploymentId}/aliases${teamQuery}`, {
      alias: config.customDomain,
    });
  }

  /**
   * Configure edge-specific settings (cache-control, headers).
   * Updates the project's headers configuration via the Vercel API.
   */
  private async configureEdge(config: DeployConfig): Promise<void> {
    if (!config.edgeConfig) return;

    const teamQuery = this.teamId ? `?teamId=${this.teamId}` : '';

    // Build headers array for the Vercel project config
    const headerEntries: Array<{ key: string; value: string }> = [];

    if (config.edgeConfig.cacheControl) {
      headerEntries.push({ key: 'Cache-Control', value: config.edgeConfig.cacheControl });
    }

    for (const [key, value] of Object.entries(config.edgeConfig.headers)) {
      headerEntries.push({ key, value });
    }

    // Update the project with header configuration
    await this.apiRequest('PATCH', `/v9/projects/${config.projectName}${teamQuery}`, {
      headers: [
        {
          source: '/(.*)',
          headers: headerEntries,
        },
      ],
    });
  }

  /**
   * Make a Vercel API request using fetch().
   */
  private async apiRequest(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<VercelApiResponse> {
    const url = `${this.apiBaseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data: VercelApiResponse = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || response.statusText;
      throw new Error(`Vercel API error (${response.status}): ${errorMsg}`);
    }

    return data;
  }

  /**
   * Map Vercel deployment state to our status enum.
   */
  private mapVercelState(state: string): 'building' | 'deploying' | 'ready' | 'failed' {
    switch (state) {
      case 'READY':
        return 'ready';
      case 'BUILDING':
      case 'INITIALIZING':
        return 'building';
      case 'DEPLOYING':
        return 'deploying';
      case 'ERROR':
      case 'CANCELED':
        return 'failed';
      default:
        return 'ready';
    }
  }
}
